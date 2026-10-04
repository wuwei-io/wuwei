import type { Decision, DecisionResponse } from "../../src/types.js";

export interface RemoteDecisionSource { sessionId?: string; roomId?: string }
interface Waiting {
  permId: string;
  reqId: string;
  decision: Decision;
  createdAt: number;
  expiresAt?: number;
  source: RemoteDecisionSource;
  timer?: ReturnType<typeof setTimeout>;
  cleanup: () => void;
  resolve: (answer: DecisionResponse) => void;
  send: (event: Record<string, unknown>) => void;
}

/** One pool for inline decisions and the approval tab. No separate automatic permission deadline. */
export class RemoteDecisions {
  private waiting = new Map<string, Waiting>();
  private smartTimerEnabled = true;

  list() {
    return [...this.waiting.values()].map(({ permId, reqId, decision, createdAt, expiresAt, source }) =>
      ({ permId, reqId, decision, createdAt, expiresAt, ...source }));
  }

  request(reqId: string, raw: Decision, source: RemoteDecisionSource, smartTimer: boolean,
    signal: AbortSignal, send: Waiting['send']): Promise<DecisionResponse> {
    if (signal.aborted) return Promise.resolve({ action: "deny", reason: "abort" });
    if (this.waiting.has(raw.permId)) throw new Error("决策编号重复");
    const decision = { ...raw, timeoutSec: raw.risk === "low" && smartTimer && this.smartTimerEnabled ? raw.timeoutSec : null };
    return new Promise(resolve => {
      const onAbort = () => this.finish(raw.permId, { action: "deny", reason: "abort" });
      const item: Waiting = { permId: raw.permId, reqId, decision, source, createdAt: Date.now(),
        resolve, send, cleanup: () => signal.removeEventListener("abort", onAbort) };
      this.waiting.set(raw.permId, item);
      signal.addEventListener("abort", onAbort, { once: true });
      this.arm(item);
      send({ type: "decision", reqId, ...decision, ...source, expiresAt: item.expiresAt });
    });
  }

  private arm(item: Waiting) {
    if (item.timer) clearTimeout(item.timer);
    item.timer = undefined;
    item.expiresAt = undefined;
    const seconds = item.decision.timeoutSec;
    if (item.decision.risk !== "low" || !Number.isFinite(seconds) || !seconds || seconds <= 0) return;
    item.expiresAt = Date.now() + seconds * 1000;
    item.timer = setTimeout(() => {
      const value = item.decision.options.find(o => o.recommended)?.value ?? item.decision.options[0]?.value;
      if (value) this.finish(item.permId, { action: "reply", value, reason: "timeout" });
    }, seconds * 1000);
  }

  /** A disabled preference cancels desktop timers as well as the visible countdown. */
  setSmartTimer(enabled: boolean) {
    this.smartTimerEnabled = enabled;
    if (enabled) return;
    for (const item of this.waiting.values()) {
      item.decision = { ...item.decision, timeoutSec: null };
      this.arm(item);
      item.send({ type: "decision", reqId: item.reqId, ...item.decision, ...item.source });
    }
  }

  decide(permId: string, response: unknown, reqId?: string): boolean {
    const item = this.waiting.get(permId);
    if (!item || (reqId && item.reqId !== reqId)) return false;
    const answer = response as DecisionResponse | undefined;
    if (!answer) return false;
    if (answer.action === "deny") return this.finish(permId, { action: "deny" });
    if (answer.action === "allow" && item.decision.options.some(o => o.value === "allow"))
      return this.finish(permId, { action: "allow" });
    if (answer.action !== "reply" || (!!answer.value === !!answer.text)) return false;
    if (answer.value != null && typeof answer.value !== 'string') return false;
    if (answer.text != null && typeof answer.text !== 'string') return false;
    if (answer.value && item.decision.options.some(o => o.value === answer.value))
      return this.finish(permId, { action: "reply", value: answer.value });
    if (answer.text?.trim() && item.decision.allowCustom)
      return this.finish(permId, { action: "reply", text: answer.text.trim() });
    return false;
  }

  private finish(permId: string, answer: DecisionResponse): boolean {
    const item = this.waiting.get(permId);
    if (!item) return false;
    if (item.timer) clearTimeout(item.timer);
    item.cleanup();
    this.waiting.delete(permId);
    item.send({ type: "decision-resolved", reqId: item.reqId, permId, reason: answer.reason });
    item.resolve(answer);
    return true;
  }

  abort(reqId?: string) {
    for (const item of [...this.waiting.values()]) {
      if (!reqId || item.reqId === reqId) this.finish(item.permId, { action: "deny", reason: "abort" });
    }
  }
}
