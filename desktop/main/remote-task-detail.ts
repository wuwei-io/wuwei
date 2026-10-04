import type { Message } from '../../src/types.js';
import type { SessionMeta } from './sessions.js';
import type { Room, RoomMessage } from '../../src/team/types.js';
import type { FileArtifact } from './remote-artifacts.js';
import type { TaskBatchSnapshot } from './team/task-reports.js';

/** Read existing execution evidence; never invent planned steps or completed output files. */
export function remoteTaskDetail(meta: SessionMeta, messages: Message[], running: boolean, employee: string) {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && !messages[i].content.some(b => b.type === 'tool_result')) { start = i; break; }
  }
  const calls = new Map<string, { id: string; title: string; desc?: string; status: string }>();
  const logs: { id: string; time: string; text: string }[] = [];
  const outputs: (FileArtifact | { id: string; name: string; kind: 'image'; uri: string; meta: string })[] = [];
  const images = new Set<string>();
  let failed = false, stopped = false;
  messages.slice(start).forEach((message, index) => {
    const time = message.ts ? new Date(message.ts).toISOString() : '';
    message.content.forEach((block, bi) => {
      if (block.type === 'tool_use') calls.set(block.id, { id: block.id, title: block.name, status: running ? 'running' : 'unknown' });
      if (block.type === 'text' && block.text.trim()) {
        logs.push({ id: `m_${start + index}_${bi}`, time, text: block.text.slice(0, 3000) });
        if (/^\((已停止|stopped)\)/i.test(block.text.trim())) stopped = true;
      }
      if (block.type === 'tool_result') {
        const content = block.content as unknown;
        const parts = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }];
        const text = parts.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
        if (!block.is_error && /(^| · )send_file$/.test(calls.get(block.tool_use_id)?.title || '')) {
          try {
            const delivered = JSON.parse(text);
            const file = delivered.file;
            if (delivered.delivered === true && file?.kind === 'file' && typeof file.id === 'string' && typeof file.name === 'string') outputs.push(file);
          } catch { /* ordinary tool text */ }
        }
        const interrupted = /^\((已停止|stopped)\)/i.test(text.trim());
        failed ||= !!block.is_error && !interrupted; stopped ||= interrupted;
        const step = calls.get(block.tool_use_id);
        if (step) { step.status = interrupted ? 'stopped' : block.is_error ? 'error' : 'done'; step.desc = text.slice(0, 400); }
        logs.push({ id: `r_${start + index}_${bi}`, time, text: text.slice(0, 3000) });
        for (const part of parts) if (part.type === 'image' && typeof part.dataUrl === 'string' && !images.has(part.dataUrl)) {
          images.add(part.dataUrl);
          outputs.push({ id: `image_${outputs.length}`, name: `图片 ${outputs.length + 1}`, kind: 'image', uri: part.dataUrl, meta: '电脑执行结果' });
        }
      }
    });
  });
  const last = messages.at(-1);
  const completed = !meta.interrupted && !meta.running && [...calls.values()].every(s => s.status !== 'unknown') && last?.role === 'assistant' && last.content.some(b => b.type === 'text' && b.text.trim());
  return { id: meta.id, title: meta.title || '任务', employee, sessionId: meta.id,
    status: running ? 'running' : stopped ? 'stopped' : failed ? 'error' : completed ? 'done' : 'unknown',
    steps: [...calls.values()], logs: logs.slice(-60), outputs, updatedAt: meta.updatedAt };
}

export function remoteRoomTaskDetail(room: Room, messages: RoomMessage[], running: boolean) {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].speaker.kind === 'human') { start = i; break; }
  messages = messages.slice(start);
  const normalized: Message[] = [];
  for (const message of messages) {
    if (message.ack) continue;
    normalized.push({ role: message.speaker.kind === 'human' ? 'user' : 'assistant', ts: message.ts,
      content: [{ type: 'text', text: `${message.speaker.name}：${message.text}` }] });
    message.steps?.forEach((step, index) => {
      const id = `${message.id}_${index}`;
      normalized.push({ role: 'assistant', ts: message.ts, content: [{ type: 'tool_use', id, name: `${message.speaker.name} · ${step.name}`, input: {} }] });
      if (step.result !== undefined) normalized.push({ role: 'user', ts: message.ts, content: [{ type: 'tool_result', tool_use_id: id, content: step.result, is_error: step.isError }] });
    });
    if (message.speaker.kind === 'agent' && message.images?.length) normalized.push({ role: 'user', ts: message.ts, content: [{ type: 'tool_result', tool_use_id: `image_${message.id}`, content: message.images.map(dataUrl => ({ type: 'image', dataUrl })) as any }] });
    // Keep the actual speaker reply after its tool evidence, just as a completed Agent turn.
    if (message.speaker.kind === 'agent') normalized.push({ role: 'assistant', ts: message.ts, content: [{ type: 'text', text: message.text }] });
  }
  const result = remoteTaskDetail({ id: room.id, title: room.name, updatedAt: room.updatedAt || 0 }, normalized, running, '群成员');
  return { ...result, roomId: room.id, status: !running && messages.some(m => !m.ack && m.error) ? 'error' : result.status };
}

export function remoteBatchTaskDetail(batch: TaskBatchSnapshot) {
  const active = batch.phase === 'working' || batch.phase === 'reporting';
  const failed = batch.phase === 'error' || batch.results.some(r => r.status === 'failed');
  const origin = batch.scope.origin;
  return { id: batch.scope.turnId, title: `${batch.scope.ownerName} · 员工任务与汇报`, employee: batch.scope.ownerName,
    sessionId: origin.id, ...(origin.kind === 'room' ? { roomId: origin.id } : {}),
    status: active ? 'running' : batch.phase === 'interrupted' ? 'unknown' : failed ? 'error' : batch.cancelled ? 'stopped' : 'done', canStop: batch.phase === 'working', updatedAt: batch.updatedAt,
    steps: [...batch.results.map(r => ({ id: r.id, title: `${r.employeeName} · ${r.task.slice(0, 160)}`, desc: r.text.slice(0, 400),
      status: ({ completed: 'done', failed: 'error', cancelled: 'stopped', queued: 'todo', running: 'running' } as const)[r.status] })),
      { id: 'report', title: '负责人统一汇报', status: ({ working: 'todo', reporting: 'running', done: 'done', error: 'error', interrupted: 'unknown' } as const)[batch.phase] }],
    logs: batch.results.filter(r => r.text).map(r => ({ id: r.id, time: '', text: `${r.employeeName}：${r.text.slice(0, 3000)}` })), outputs: [] };
}
