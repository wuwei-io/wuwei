export type AccountRefreshState = { busy: boolean; error: boolean; updatedAt: number | null };

/** A menu closing does not cancel its refresh. Account changes invalidate old results. */
export function createAccountRefresher<T extends { user: { id: string } }>(
  load: () => Promise<T | null>,
  current: () => T | null,
  publish: (value: T) => void,
  status: (value: AccountRefreshState) => void,
  timeoutMs = 15_000,
  onSessionMissing?: () => void,
) {
  let generation = 0;
  let inFlight: Promise<void> | null = null;
  let state: AccountRefreshState = { busy: false, error: false, updatedAt: null };
  const update = (patch: Partial<AccountRefreshState>) => { state = { ...state, ...patch }; status(state); };
  function cancel() { generation++; inFlight = null; }
  function refresh(): Promise<void> {
    const userId = current()?.user.id;
    if (!userId) return Promise.resolve();
    if (inFlight) return inFlight;
    const request = generation;
    update({ busy: true, error: false });
    let timeout: ReturnType<typeof setTimeout>;
    inFlight = new Promise<T | null>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Account refresh timed out')), timeoutMs);
      Promise.resolve().then(load).then(resolve, reject);
    }).then(value => {
      if (request !== generation || current()?.user.id !== userId) return;
      if (!value) { onSessionMissing?.(); throw new Error('Sign-in required'); }
      if (!value || value.user.id !== userId) throw new Error('Account refresh failed');
      publish(value);
      update({ updatedAt: Date.now() });
    }).catch(() => {
      if (request === generation && current()?.user.id === userId) update({ error: true });
    }).finally(() => {
      clearTimeout(timeout);
      if (request === generation) { inFlight = null; update({ busy: false }); }
    });
    return inFlight;
  }
  return { refresh, cancel, reset() { cancel(); update({ busy: false, error: false, updatedAt: null }); } };
}
