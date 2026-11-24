// Probe both independent feeds before choosing a provider. The SDK still checks
// versions, SHA-512, signatures and cached downloads; we never download installers here.
export const UPDATE_FEEDS = [
  "https://github.com/wuwei-io/wuwei/releases/latest/download/",
  "https://wuwei-repo.oss-cn-hangzhou.aliyuncs.com/updates-cn/",
] as const;

type Info = { version: string; releaseNotes?: unknown };
type Result = { isUpdateAvailable: boolean; updateInfo: Info } | null;
type Updater = {
  setFeedURL(options: { provider: "generic"; url: string; useMultipleRangeRequest: false }): void;
  checkForUpdates(): Promise<Result>;
  downloadUpdate(): Promise<string[]>;
};
type Fetcher = (url: string, signal: AbortSignal) => Promise<string>;
export function manifestChannel(platform: string): string {
  return platform === "darwin" ? "latest-mac.yml" : platform === "win32" ? "latest.yml" : "latest-linux.yml";
}
export function manifestVersion(text: string): number[] {
  const match = /^version:\s*['"]?(\d+)\.(\d+)\.(\d+)['"]?\s*$/m.exec(text);
  if (!match) throw new Error("Invalid stable update manifest");
  return match.slice(1).map(Number);
}
export function createSourceUpdater(updater: Updater, options: {
  fetchText: Fetcher;
  platform: string;
  timeoutMs?: number;
  log?: (message: string) => void;
}) {
  let candidates: string[] = [];
  let selected = "";
  let checked: Result;
  const feeds = options.platform === "linux" ? [UPDATE_FEEDS[0]] : [...UPDATE_FEEDS];
  function select(url: string) {
    updater.setFeedURL({ provider: "generic", url, useMultipleRangeRequest: false });
    selected = url;
    options.log?.(`Update source: ${url}`);
  }
  return {
    async checkForUpdates(): Promise<Result> {
      const probes = await Promise.all(feeds.map(async (url) => {
        const start = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
        try {
          const text = await options.fetchText(url + manifestChannel(options.platform), controller.signal);
          return { url, version: manifestVersion(text), elapsed: Date.now() - start };
        } catch { return null; }
        finally { clearTimeout(timer); }
      }));
      const healthy = probes.filter((p): p is NonNullable<typeof p> => p !== null);
      healthy.sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1] || b.version[2] - a.version[2] || a.elapsed - b.elapsed);
      candidates = healthy.map(p => p.url);
      if (!candidates.length) throw new Error("Update sources unavailable (network timeout or invalid manifest)");
      let error: unknown;
      for (const url of candidates) {
        try { select(url); return checked = await updater.checkForUpdates(); }
        catch (e) { error = e; }
      }
      throw error;
    },
    async downloadUpdate(): Promise<string[]> {
      try { return await updater.downloadUpdate(); }
      catch (initialError) {
        // A mirror may lag behind a newly published release. Never substitute a
        // different version after the UI has announced an update.
        const version = checked?.updateInfo.version;
        for (const url of candidates.filter(url => url !== selected)) {
          try {
            select(url);
            const alternate = await updater.checkForUpdates();
            if (!alternate?.isUpdateAvailable || alternate.updateInfo.version !== version) continue;
            return await updater.downloadUpdate();
          } catch { /* Try the remaining independently verified source. */ }
        }
        throw initialError;
      }
    },
  };
}
