// 更新流量策略：独立于 Electron，可用假更新器/时钟验证。
export type UpdateState = { available: boolean; downloaded?: boolean; version?: string; notes?: string; error?: string };
export const DEFAULT_UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000;
export function updateIntervalMs(seconds: unknown): number {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0
    ? Math.min(24 * 3600, Math.max(2 * 3600, n)) * 1000
    : DEFAULT_UPDATE_INTERVAL_MS;
}
export function jitterUpdateInterval(ms: number, random = Math.random): number {
  return Math.round(ms * (1 + random() * 0.2));
}
type Info = { version: string; releaseNotes?: unknown };
type Updater = {
  checkForUpdates(): Promise<{ isUpdateAvailable: boolean; updateInfo: Info } | null>;
  downloadUpdate(): Promise<string[]>;
};
export function createUpdatePolicy(updater: Updater, options: {
  now?: () => number;
  intervalMs?: () => number;
  readyExists?: () => boolean;
  onReady?: (state: UpdateState) => void;
} = {}) {
  const now = options.now ?? Date.now;
  let inFlight: Promise<UpdateState> | undefined;
  let ready: UpdateState | undefined;
  let last: UpdateState = { available: false };
  let nextCheck = 0;
  let checkFailures = 0;
  const failures = new Map<string, { count: number; retryAt: number }>();
  async function run(manual: boolean): Promise<UpdateState> {
    nextCheck = now() + (options.intervalMs?.() ?? DEFAULT_UPDATE_INTERVAL_MS);
    let result;
    try {
      result = await updater.checkForUpdates();
      checkFailures = 0;
    } catch (e) {
      checkFailures++;
      nextCheck = now() + Math.min(24 * 3600_000, DEFAULT_UPDATE_INTERVAL_MS * 2 ** Math.min(checkFailures - 1, 4));
      return last = { available: false, error: String((e as Error)?.message ?? e) };
    }
    // 必须使用更新器的语义版本判断，不以“不相等”判断（防旧版/预发布被误下载）。
    if (!result?.isUpdateAvailable) return last = { available: false, version: result?.updateInfo.version };
    const info = result.updateInfo;
    last = { available: true, downloaded: false, version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '' };
    const failed = failures.get(info.version);
    // 自动下载每个版本本次运行最多失败三次；手动允许继续，但仍有 60 秒冷却。
    if (failed && (now() < failed.retryAt || (!manual && failed.count >= 3))) return last;
    try {
      const files = await updater.downloadUpdate(); // SDK 校验并复用跨重启缓存、优先差分。
      if (!files?.length) throw new Error('更新器未返回有效安装包');
      failures.delete(info.version);
      ready = last = { ...last, downloaded: true };
      options.onReady?.(ready);
      return ready;
    } catch (e) {
      const count = (failed?.count ?? 0) + 1;
      failures.set(info.version, { count, retryAt: now() + (manual ? 60_000 : Math.min(8 * 3600_000, 30 * 60_000 * 2 ** Math.min(count - 1, 4))) });
      return last = { ...last, error: String((e as Error)?.message ?? e) };
    }
  }
  return {
    check(manual = false): Promise<UpdateState> {
      if (inFlight) return inFlight;
      if (ready && (options.readyExists?.() ?? true)) {
        options.onReady?.(ready);
        return Promise.resolve(ready);
      }
      ready = undefined;
      if (!manual && now() < nextCheck) return Promise.resolve(last);
      inFlight = run(manual).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}
