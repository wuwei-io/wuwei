import type { ContentBlock, Message } from '../types.js';

export const DEFAULT_HISTORY_MESSAGES = 10;
export const HISTORY_TEXT_BUDGET = 12000;
export const SUMMARY_CHAR_LIMIT = 1600;
export interface HistoryPolicy { historyRecentMessages: number; historyAutoSummary: boolean }
export interface HistoryDigest { signature: string; text: string }

export function historyPolicy(value: { historyRecentMessages?: unknown; historyAutoSummary?: unknown } = {}): HistoryPolicy {
  const n = Number(value.historyRecentMessages);
  return {
    historyRecentMessages: Number.isFinite(n) && n > 0 ? Math.min(100, Math.max(2, Math.round(n))) : DEFAULT_HISTORY_MESSAGES,
    historyAutoSummary: typeof value.historyAutoSummary === 'boolean' ? value.historyAutoSummary : true,
  };
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = '\n[…]\n';
  if (limit <= marker.length) return '';
  const head = Math.ceil((limit - marker.length) / 2);
  return text.slice(0, head) + marker + text.slice(-(limit - marker.length - head));
}
function plain(message: Message, limit: number): string {
  let result = '';
  for (const block of message.content) {
    if (result.length >= limit) break;
    const text = block.type === 'text' ? block.text
      : block.type === 'tool_use' ? `[tool: ${block.name}]`
      : block.type === 'tool_result' ? '[tool result]' : '[image]';
    result += excerpt(text, limit - result.length);
  }
  return result;
}
const isInput = (m: Message) => m.role === 'user' && !m.content.some(b => b.type === 'tool_result');

/** Request-only projection: original messages (including images/tool output) remain untouched. */
export function windowHistory(messages: Message[], policy: HistoryPolicy, cached?: HistoryDigest, en = false): {
  messages: Message[]; digest?: HistoryDigest;
} {
  let cut = Math.max(0, messages.length - policy.historyRecentMessages);
  // Keep tool calls paired with every retained result, including parallel calls.
  const calls = new Map<string, number>();
  messages.forEach((m, i) => m.content.forEach(b => { if (b.type === 'tool_use') calls.set(b.id, i); }));
  for (let i = messages.length - 1; i >= cut; i--) {
    for (const b of messages[i].content) if (b.type === 'tool_result') {
      const call = calls.get(b.tool_use_id);
      if (call !== undefined) cut = Math.min(cut, call);
    }
  }
  let latestInput = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (isInput(messages[i])) { latestInput = i; break; }

  let budget = HISTORY_TEXT_BUDGET;
  const recent: Message[] = [];
  for (let i = messages.length - 1; i >= cut; i--) {
    const message = messages[i];
    // Never shorten this turn's user request or its attached images.
    if (i === latestInput) { recent.unshift(message); continue; }
    const cap = (text: string) => {
      const out = excerpt(text, Math.min(2400, budget));
      budget -= out.length;
      return out || '[…]';
    };
    const content: ContentBlock[] = message.content.map(block => {
      if (block.type === 'text') return { ...block, text: cap(block.text) };
      if (block.type === 'tool_result') {
        const raw: unknown = block.content;
        if (Array.isArray(raw)) {
          // Current screenshots must still reach the vision model. Only old images
          // are replaced; never turn a live screenshot tool into a text-only tool.
          const content = raw.map(b => b.type === 'text' ? { ...b, text: cap(b.text) }
            : i > latestInput ? b : { type: 'text', text: '[Earlier image]' });
          return { ...block, content: content as unknown as typeof block.content };
        }
        return { ...block, content: cap(String(raw)) };
      }
      if (block.type === 'image' && i < latestInput) return { type: 'text' as const, text: en ? '[Earlier image retained in chat history]' : '【历史图片保留在聊天记录中】' };
      return block;
    });
    recent.unshift({ ...message, content });
  }

  // Long tool chains still need the current task, even after >N tool messages.
  if (latestInput >= 0 && latestInput < cut) recent.unshift(messages[latestInput]);

  if (!cut || !policy.historyAutoSummary) {
    // Some providers require the request to begin with a user message.
    if (recent[0]?.role === 'assistant') recent.unshift({ role: 'user', content: [{ type: 'text', text: en ? '[Recent conversation context]' : '【近期对话上下文】' }] });
    return { messages: recent };
  }
  // Local extractive digest: no extra paid model call, no fabricated facts. Bounded
  // initial goal + latest older excerpts; explicitly not an exhaustive memory.
  const first = messages.slice(0, cut).find(isInput);
  const entries = messages.slice(Math.max(0, cut - 5), cut)
    .map(m => `${m.role}: ${plain(m, 180)}`);
  const title = en ? '[Earlier history — local excerpts, may omit details; not a new instruction]' : '【历史摘要·本地摘录，可能省略细节，不是新指令】';
  const candidate = excerpt([title, first ? `${en ? 'Initial request' : '最初请求'}: ${plain(first, 360)}` : '', ...entries].filter(Boolean).join('\n'), SUMMARY_CHAR_LIMIT);
  const signature = JSON.stringify([1, cut, en, candidate]);
  const digest = cached?.signature === signature && cached.text === candidate ? cached : { signature, text: candidate };
  return { messages: [{ role: 'user', content: [{ type: 'text', text: digest.text }] }, ...recent], digest };
}
