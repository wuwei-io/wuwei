// Product limits/auth/configuration failures cannot recover by resending the
// same request. Keep temporary gateway/upstream failures eligible for backoff.
const TRANSIENT_GATEWAY_CODES = new Set([
  'upstream_error', 'upstream_rate_limited', 'upstream_unavailable', 'auth_unavailable',
]);

function terminalCode(code: unknown): boolean {
  return typeof code === 'string' && code.length > 0 && !TRANSIENT_GATEWAY_CODES.has(code.toLowerCase());
}

export function isTerminalGatewayResponse(body: unknown): boolean {
  const error = (body as { error?: { type?: unknown; code?: unknown } } | null)?.error;
  return error?.type === 'gateway_error' && terminalCode(error.code);
}

export function isTerminalGatewayError(error: unknown): boolean {
  const value = error as { gatewayCode?: unknown; message?: unknown } | null;
  const marker = String(value?.message ?? error).match(/\[\[gw:([a-z_]+)\]\]/i)?.[1];
  return terminalCode(value?.gatewayCode ?? marker);
}
