import { randomUUID } from 'node:crypto';
import type { Agent, AgentHooks } from '../../src/agent/loop.js';

interface SessionTurn {
  sessionId?: string | null;
  text: string;
  images?: string[];
  signal: AbortSignal;
  hooks: AgentHooks;
  onSession: (id: string) => void;
}
interface SessionDependencies {
  running: Map<string, AbortController>;
  exists: (id: string) => boolean;
  prepare: (id: string) => Promise<Agent> | Agent;
  persist: (id: string) => void;
  changed: (id: string, agent: Agent) => void;
}

export function waitForRemoteResult<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('已停止'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

/** Use the desktop's actual Agent and running lock, so phone messages share history and stop behavior. */
export async function runRemoteSessionTurn(turn: SessionTurn, deps: SessionDependencies) {
  const id = turn.sessionId || randomUUID();
  if (turn.sessionId && !deps.exists(id)) throw new Error('这台电脑不存在该会话，请重新选择会话');
  if (deps.running.has(id)) throw new Error('该会话正在执行，请先停止或等当前任务完成');
  if (turn.signal.aborted) throw new Error('已停止');
  const controller = new AbortController();
  const abort = () => controller.abort();
  turn.signal.addEventListener('abort', abort, { once: true });
  deps.running.set(id, controller); // Reserve before any asynchronous credential preparation.
  let agent: Agent | undefined;
  try {
    agent = await deps.prepare(id);
    if (controller.signal.aborted) throw new Error('已停止');
    turn.onSession(id);
    const requestDecision: AgentHooks['requestDecision'] = turn.hooks.requestDecision
      ? decision => waitForRemoteResult(turn.hooks.requestDecision!(decision), controller.signal) : undefined;
    const remote = turn.hooks.remoteExecution;
    const hooks: AgentHooks = { ...turn.hooks, requestDecision,
      requestPermission: turn.hooks.requestPermission ? (tool, input) => waitForRemoteResult(turn.hooks.requestPermission!(tool, input), controller.signal) : undefined,
      ...(remote ? { remoteExecution: { ...remote, signal: controller.signal,
        requestDecision: requestDecision || (remote.requestDecision ? decision => waitForRemoteResult(remote.requestDecision!(decision), controller.signal) : undefined),
        requestPermission: remote.requestPermission ? (name, input) => waitForRemoteResult(remote.requestPermission!(name, input), controller.signal) : undefined,
      } } : {}),
      onStep: () => { turn.hooks.onStep?.(); deps.persist(id); } };
    const execution = agent.send(turn.text, hooks, controller.signal, turn.images);
    deps.persist(id); // User input is already in Agent history, even if the model hasn't answered yet.
    deps.changed(id, agent);
    await execution;
    if (controller.signal.aborted) throw new Error('已停止');
    const last = [...agent.getMessages()].reverse().find(m => m.role === 'assistant');
    const text = last?.content.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    return { sessionId: id, text };
  } finally {
    turn.signal.removeEventListener('abort', abort);
    if (deps.running.get(id) === controller) deps.running.delete(id);
    if (agent) { deps.persist(id); deps.changed(id, agent); }
  }
}
