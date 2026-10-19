export interface HostedSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class SessionRefreshUnavailable extends Error {
  constructor() {
    super('登录续期暂时失败，请检查网络后重试；登录凭证已保留。 / Sign-in refresh is temporarily unavailable. Your credentials have been kept; please retry.');
    this.name = 'SessionRefreshUnavailable';
  }
}

const invalidCodes = new Set([
  'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found',
  'session_expired', 'user_not_found', 'user_banned', 'refresh_token_invalid',
]);

/** Only an explicit credential rejection may invalidate a saved session. */
export async function refreshHostedSession(
  site: string, refreshToken: string, request: typeof fetch = fetch,
): Promise<HostedSession | null> {
  if (!refreshToken) return null;
  try {
    const response = await request(`${site}/api/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    const body = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown> : null;
    if (!response.ok) {
      if ((response.status === 400 || response.status === 401 || response.status === 403)
        && body && (body.reauth_required === true || (typeof body.error === 'string' && invalidCodes.has(body.error)))) return null;
      // Older backends used refresh_failed for both outages and expired tokens.
      // Preserve credentials until the server can identify the failure precisely.
      throw new SessionRefreshUnavailable();
    }
    if (!body || typeof body.access_token !== 'string' || !body.access_token
      || typeof body.refresh_token !== 'string' || !body.refresh_token
      || typeof body.expires_at !== 'number' || !Number.isFinite(body.expires_at)
      || body.expires_at * 1000 <= Date.now()) throw new SessionRefreshUnavailable();
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: body.expires_at * 1000 };
  } catch {
    throw new SessionRefreshUnavailable();
  }
}
