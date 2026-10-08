import { loadWuweiSession } from './wuwei-session.js';
import { log } from './logger.js';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const site = process.env.WUWEI_SITE_URL || 'https://wuweiai.io';
const directory = join(homedir(), process.env.WUWEI_DATA_DIR_NAME || '.wuwei');
const file = join(directory, 'mobile-notifications.json');
type Queued = { accountId: string; at: number; event: Record<string, string> };
const pending = new Map<string, Queued>();
try { for (const [id, job] of JSON.parse(readFileSync(file, 'utf8'))) if (job.accountId && Date.now() - job.at < 86400000) pending.set(id, job); } catch { /* first run */ }
function accountId(token: string) { try { return String(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub || ''); } catch { return ''; } }
function persistQueue() { try { mkdirSync(directory, { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify([...pending]), { mode: 0o600 }); renameSync(file + '.tmp', file); } catch { log('remote-push', '通知重试队列未保存'); } }
let draining = false;
export function notifyRemote(event: Record<string, string> & { eventId: string; kind: string }) {
  if (process.env.WUWEI_MOBILE_PUSH_ENABLED !== '1') return;
  const owner = accountId(loadWuweiSession()?.accessToken || ''); if (!owner) return;
  if (pending.size >= 200) pending.delete(pending.keys().next().value!);
  pending.set(event.eventId, { accountId: owner, event, at: Date.now() }); persistQueue(); void drain();
}
async function drain() {
  if (draining || process.env.WUWEI_MOBILE_PUSH_ENABLED !== '1') return; draining = true;
  try {
    const session = loadWuweiSession(); if (!session) return;
    for (const [id, job] of pending) {
      if (Date.now() - job.at > 86400000) { pending.delete(id); continue; }
      if (job.accountId !== accountId(session.accessToken)) continue;
      try {
        const response = await fetch(`${site}/api/mobile/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify(job.event), signal: AbortSignal.timeout(5000) });
        if (response.ok) pending.delete(id);
        else { log('remote-push', '通知入队失败', response.status); break; }
      } catch { break; }
    }
  } finally { persistQueue(); draining = false; }
}
const timer = setInterval(() => void drain(), 30000); timer.unref();
