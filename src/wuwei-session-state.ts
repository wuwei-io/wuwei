import type { HostedSession } from './wuwei-refresh.js';

/** Serializes proactive and 401-triggered refreshes, including payment requests. */
export function createHostedSessionState(deps: {
  load: () => HostedSession | null;
  save: (session: HostedSession) => void;
  clear: () => void;
  refresh: (token: string) => Promise<HostedSession | null>;
  onExpired: () => void;
  now?: () => number;
}) {
  let revision = 0, loggedOut = false;
  let inFlight: { revision: number; promise: Promise<HostedSession | null> } | null = null;
  const now = deps.now ?? Date.now;
  function accept(session: HostedSession) {
    deps.save(session);
    revision++; loggedOut = false; inFlight = null;
  }
  function logout() {
    revision++; loggedOut = true; inFlight = null; deps.clear();
  }
  async function get(rejectedAccessToken?: string): Promise<HostedSession | null> {
    if (loggedOut) return null;
    const session = deps.load();
    if (!session) return null;
    // A late 401 for an older token must not rotate the new token again.
    const force = rejectedAccessToken === session.accessToken;
    if (!force && session.expiresAt - now() > 90_000) return session;
    if (inFlight?.revision === revision) return inFlight.promise;
    const started = revision;
    const pending = { revision: started, promise: null! as Promise<HostedSession | null> };
    pending.promise = Promise.resolve().then(() => deps.refresh(session.refreshToken)).then(fresh => {
      if (started !== revision || loggedOut) return loggedOut ? null : deps.load();
      const current = deps.load();
      // Another process or sign-in may have replaced the file during the request.
      if (current?.refreshToken !== session.refreshToken || current?.accessToken !== session.accessToken) return current;
      if (!fresh) {
        deps.clear(); revision++;
        deps.onExpired();
        return null;
      }
      deps.save(fresh);
      return fresh;
    }).finally(() => { if (inFlight === pending) inFlight = null; });
    inFlight = pending;
    return pending.promise;
  }
  return { get, accept, logout, isLoggedOut: () => loggedOut };
}
