import type { RunEmployeeArgs, OrchestratorDeps } from './team/orchestrator.js';
import type { RemoteRoomArgs } from './relay-client.js';
import type { Room, RoomMessage } from '../../src/team/types.js';

interface RoomDependencies extends OrchestratorDeps {
  room: (id: string) => Room | undefined;
  history: (id: string) => RoomMessage[];
  running: (id: string) => boolean;
  run: (id: string, text: string, deps: OrchestratorDeps, options?: { images?: string[]; mentions?: string[] }) => Promise<void>;
  abort: (id: string) => void;
}

/** Stream the existing desktop room orchestrator and saved messages, with its real employee identities. */
export async function runRemoteRoomTurn(args: RemoteRoomArgs, deps: RoomDependencies) {
  const room = deps.room(args.roomId);
  if (!room || room.type === 'dm') throw new Error('这台电脑不存在该群聊');
  if (deps.running(room.id)) throw new Error('该群聊正在执行，请等当前任务完成');
  if (args.signal.aborted) throw new Error('已停止');
  if (args.mentions.some(id => id !== '*' && !room.members.includes(id))) throw new Error('所选成员不属于该群聊');
  const seen = new Set(deps.history(room.id).map(message => message.id));
  let failed = false;
  const abort = () => deps.abort(room.id);
  args.signal.addEventListener('abort', abort, { once: true });
  const runEmployee = (employee: RunEmployeeArgs) => deps.runEmployee({
    ...employee, images: args.images, requestDecision: args.requestDecision,
    onPermission: args.onPermission ? async (name, input) => (await args.onPermission!(name, input)).action === 'allow' ? 'allow' : 'deny' : undefined,
    onProgress: event => {
      employee.onProgress?.(event);
      if (event.kind === 'image') args.onRoomEvent({ type: 'room-image', speaker: employee.employee.name, dataUrl: event.dataUrl });
    },
  });
  try {
    let text = args.text;
    if (args.mentions.includes('*') && !text.includes('@所有人')) text = '@所有人 ' + text;
    await deps.run(room.id, text, { ...deps, runEmployee,
      send: (channel, payload: any) => {
        deps.send(channel, payload);
        if (payload?.roomId !== room.id) return;
        if (channel === 'evt:team-room-progress' && payload.kind === 'text')
          args.onRoomEvent({ type: 'room-delta', speaker: payload.empName, text: payload.delta });
        if (channel === 'evt:team-room-hint')
          args.onRoomEvent({ type: 'room-msg', msgId: 'hint-' + Date.now(), speaker: '系统', kind: 'system', text: payload.hint });
        if (channel === 'evt:team-room') {
          for (const message of payload.messages || []) {
            if (seen.has(message.id)) continue;
            seen.add(message.id);
            if (message.speaker?.kind === 'human' || message.ack) continue;
            if (message.error) failed = true;
            args.onRoomEvent({ type: 'room-msg', msgId: message.id, speaker: message.speaker?.name || '',
              kind: message.error ? 'system' : 'member', text: message.text || '', error: !!message.error });
          }
        }
      },
    }, { images: args.images, mentions: args.mentions });
    if (args.signal.aborted) throw new Error('已停止');
    if (failed) throw new Error('部分群成员执行失败，请查看已返回的具体结果');
  } finally { args.signal.removeEventListener('abort', abort); }
}
