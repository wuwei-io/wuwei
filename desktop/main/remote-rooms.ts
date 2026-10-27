import { tr } from "../../src/localization/index.js";
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
  if (!room) throw new Error(tr("ui.remote-rooms.message.e57ba8cf0f"));
  if (args.signal.aborted) throw new Error(tr("set.brain.exStopped"));
  if (args.mentions.some(id => id !== '*' && !room.members.includes(id))) throw new Error(tr("ui.remote-rooms.message.ae90a9a1d9"));
  const seen = new Set(deps.history(room.id).map(message => message.id));
  let failed = false;
  let ownedExecution = false;
  const abort = () => { if (ownedExecution) deps.abort(room.id); };
  args.signal.addEventListener('abort', abort, { once: true });
  const runEmployee = (employee: RunEmployeeArgs) => { ownedExecution = true; return deps.runEmployee({
    ...employee, images: args.images, requestDecision: args.requestDecision,
    onPermission: args.onPermission ? async (name, input) => (await args.onPermission!(name, input)).action === 'allow' ? 'allow' : 'deny' : undefined,
    onProgress: event => {
      employee.onProgress?.(event);
      if (event.kind === 'image') args.onRoomEvent({ type: 'room-image', speaker: employee.employee.name, dataUrl: event.dataUrl });
    },
  }); };
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
          args.onRoomEvent({ type: 'room-msg', msgId: 'hint-' + Date.now(), speaker: tr("ui.remote-rooms.message.5b103db0e0"), kind: 'system', text: payload.hint });
        if (channel === 'evt:team-room') {
          for (const message of payload.messages || []) {
            if (seen.has(message.id)) continue;
            seen.add(message.id);
            if (message.ack) continue;
            if (message.error) failed = true;
            args.onRoomEvent({ type: 'room-msg', msgId: message.id, speaker: message.speaker?.name || '',
              kind: message.speaker?.kind === 'human' ? 'human' : message.error ? 'system' : 'member', speakerId: message.speaker?.id, text: message.text || '', error: !!message.error });
          }
        }
      },
    }, { images: args.images, mentions: args.mentions });
    if (args.signal.aborted) throw new Error(tr("set.brain.exStopped"));
    if (failed) throw new Error(tr("ui.remote-rooms.message.13a42b721b"));
  } finally { args.signal.removeEventListener('abort', abort); }
}
