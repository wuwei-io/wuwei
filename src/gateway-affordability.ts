/** Safe, content-free facts about one rejected hosted request, not a task quote. */
export interface GatewayAffordability {
  code: 'insufficient_balance';
  clientRequestId: string;
  model: string;
  phase: 'new_turn' | 'tool_continuation' | 'unknown';
  balance?: number;
  estimatedCost?: number;
  estimatedInputTokens?: number;
}

/** Revalidate across IPC. Never forward provider bodies, prompts or credentials. */
export function gatewayAffordability(value: unknown): GatewayAffordability | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (v.code !== 'insufficient_balance'
    || typeof v.clientRequestId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v.clientRequestId)
    || typeof v.model !== 'string' || !v.model || v.model.length > 200
    || !['new_turn', 'tool_continuation', 'unknown'].includes(String(v.phase))) return;
  const result: GatewayAffordability = {code: v.code, clientRequestId: v.clientRequestId, model: v.model, phase: v.phase as GatewayAffordability['phase']};
  if (typeof v.balance === 'number' && Number.isFinite(v.balance)) result.balance = v.balance;
  if (typeof v.estimatedCost === 'number' && Number.isFinite(v.estimatedCost) && v.estimatedCost >= 0) result.estimatedCost = v.estimatedCost;
  if (typeof v.estimatedInputTokens === 'number' && Number.isSafeInteger(v.estimatedInputTokens) && v.estimatedInputTokens >= 0) result.estimatedInputTokens = v.estimatedInputTokens;
  return result;
}

export function readGatewayAffordability(raw: string, context: Pick<GatewayAffordability, 'clientRequestId' | 'model' | 'phase'>): GatewayAffordability | undefined {
  try {
    const e = JSON.parse(raw)?.error;
    if (e?.type !== 'gateway_error' || e.code !== 'insufficient_balance') return;
    return gatewayAffordability({...context, code: e.code, balance: e.balance, estimatedCost: e.estimated_cost, estimatedInputTokens: e.estimated_input_tokens});
  } catch { return; }
}
