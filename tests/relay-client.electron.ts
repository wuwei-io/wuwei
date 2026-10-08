import { app } from 'electron';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import WebSocket from 'ws';
import { startRelayClient, stopRelayClient, refreshRelayClient, setRemoteExecutor, setRemoteRoomExecutor } from '../desktop/main/relay-client.js';
import { runRemoteSessionTurn } from '../desktop/main/remote-sessions.js';
import { Agent } from '../src/agent/loop.js';
import { TOOL_MAP } from '../src/tools/index.js';
import { runRelayConversation } from '../../wuwei-mobile/src/api/relayTransport';
const root = join(homedir(), process.env.WUWEI_DATA_DIR_NAME!);
const config = { providerId: 'fixture', kind: 'openai', model: 'fixture', apiKey: 'fixture', app: { remoteEnabled: true, remoteShareSubscription: false } };
async function main() {
  await app.whenReady();
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'config.json'), JSON.stringify(config));
  const token = process.env.WUWEI_REMOTE_TEST_TOKEN || 'local-fixture';
  writeFileSync(join(root, 'auth.json'), JSON.stringify({ access_token: token, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  writeFileSync(join(root, 'device-id'), 'wd_00000000000000000000000000000000');
  const base = process.env.WUWEI_RELAY_WS!; const requests: any[] = []; let saved: any[] = [], updates = 0;
  const tools = [TOOL_MAP.get('ask_decision')!]; let step = 0;
  const agent = new Agent({ name: 'fixture', complete: async (_sys, messages, _tools, hooks) => {
    if (++step === 1) return { content: [{ type: 'tool_use', id: 'ask', name: 'ask_decision', input: {
      title: 'Decision', question: 'Choose a path', risk: 'high', options: [{ label: 'Backup', value: 'backup' }, { label: 'Wait', value: 'wait' }], allowCustom: true, timeoutSec: 1,
    } }], stopReason: 'tool_use' };
    assert.match(String((messages.flatMap(m => m.content).find(b => b.type === 'tool_result') as any).content), /custom reply/);
    hooks.onText?.('real-client-result'); return { content: [{ type: 'text', text: 'real-client-result' }], stopReason: 'end_turn' };
  } }, '', tools, { cwd: '.' }, new Map(tools.map(t => [t.name, t])), { compactThreshold: 0 });
  agent.setMessages([{ role: 'user', content: [{ type: 'text', text: 'original context' }] }, { role: 'assistant', content: [{ type: 'text', text: 'remembered' }] }]);
  const running = new Map();
  setRemoteExecutor(args => {
    requests.push(args);
    return runRemoteSessionTurn({ ...args, onSession: args.onSession!, hooks: { onText: args.onDelta, requestDecision: args.requestDecision } }, {
      running, exists: id => id === 'original', prepare: () => agent, persist: () => { saved = structuredClone(agent.getMessages()); }, changed: () => updates++,
    });
  });
  setRemoteRoomExecutor(async args => {
    assert.equal(args.roomId, 'room-original');
    assert.deepEqual(args.mentions, ['*']);
    const response = await args.requestDecision!({ permId: 'room-decision', title: 'Group', question: 'Group choice', risk: 'high', options: [{ label: 'Backup', value: 'backup' }, { label: 'Wait', value: 'wait' }], allowCustom: true, timeoutSec: null });
    assert.equal(response.value, 'backup');
    args.onRoomEvent({ type: 'room-msg', msgId: 'result', speaker: 'Worker', kind: 'member', text: 'group-result' });
  });
  startRelayClient();
  const http = base.replace(/^ws/, 'http').replace(/\/ws$/, '/devices');
  let online = false;
  for (let i = 0; i < 60; i++) {
    const data = await fetch(http, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    if (data.devices.some((d: any) => d.deviceId === 'wd_00000000000000000000000000000000')) { online = true; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(online, 'actual desktop relay connection must register');
  const options = { url: base + '?token=' + encodeURIComponent(token), socketFactory: (url: string) => new WebSocket(url) as any };
  const req = async (method: string, params?: unknown) => {
    let data: any;
    await runRelayConversation({ ...options, request: { type: 'req', reqId: 'q-' + Math.random(), targetDeviceId: 'wd_00000000000000000000000000000000', method, params },
      onMessage: m => { if (m.type === 'resp') { assert.ok(!m.error, m.error); data = m.data; return true; } } });
    return data;
  };
  let approval: Promise<any> | undefined; const frames: any[] = [];
  await runRelayConversation({ ...options, request: { type: 'chat', reqId: 'original-request', targetDeviceId: 'wd_00000000000000000000000000000000', sessionId: 'original', text: 'continue', smartTimer: false },
    onMessage: m => {
      frames.push(m);
      if (m.type === 'decision') approval = (async () => {
        refreshRelayClient();
        let restored = false;
        for (let i = 0; i < 40; i++) {
          try { const state = await req('perms.list'); if (state.perms?.some((p: any) => p.permId === m.permId)) { restored = true; break; } } catch { /* registration may still be in progress */ }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(restored, 'the same desktop task must recover its approval after reconnect');
        const list = await req('perms.list'); assert.equal(list.perms[0].sessionId, 'original'); assert.equal(list.perms[0].decision.timeoutSec, null);
        assert.equal((await req('perms.decide', { permId: m.permId, action: 'reply', text: 'custom reply' })).ok, true);
      })();
      assert.notEqual(m.type, 'chat-error', m.message); return m.type === 'chat-done';
    },
  });
  await approval; assert.equal(requests.length, 1); assert.equal(updates, 2); assert.equal(running.size, 0);
  assert.equal(saved[0].content[0].text, 'original context'); assert.equal(saved.at(-1).content[0].text, 'real-client-result');
  assert.equal(frames.at(-1).sessionId, 'original'); assert.equal((await req('perms.list')).perms.length, 0);
  const group: any[] = [];
  await runRelayConversation({ ...options, request: { type: 'room-chat', reqId: 'room-request', targetDeviceId: 'wd_00000000000000000000000000000000', roomId: 'room-original', mentions: ['*'], text: 'group', smartTimer: false },
    onMessage: (m, send) => { group.push(m); if (m.type === 'decision') send({ type: 'perm-resp', permId: m.permId, action: 'reply', value: 'backup' }); assert.notEqual(m.type, 'room-error', m.message); return m.type === 'room-done'; } });
  assert.equal(group.find(m => m.type === 'room-msg').text, 'group-result');
  writeFileSync(join(root, 'config.json'), JSON.stringify({ ...config, app: { remoteEnabled: false } }));
  await assert.rejects(req('perms.list'), /远程调用/);
  stopRelayClient();
  console.log(JSON.stringify({ ok: true, checks: ['actual Electron relay-client registration', 'original Agent history and saved result', 'desktop approval reconnect without duplicate execution', 'approval-tab custom reply', 'group decision and result', 'remote disable enforced'] }));
}
main().then(() => app.exit(0)).catch(error => { stopRelayClient(); console.error(error); app.exit(1); });
