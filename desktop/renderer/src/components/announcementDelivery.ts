export type PublishedAnnouncement = {
  active: boolean;
  appVersion?: string;
  version?: string;
  titleZh?: string;
  titleEn?: string;
  bodyZh?: string;
  bodyEn?: string;
};
export type UnreadAnnouncement = PublishedAnnouncement & { version: string };
export const ANNOUNCEMENT_READ_KEY = "wuwei_read_announcement_v2";
const receipt = (a: UnreadAnnouncement) => JSON.stringify([a.appVersion, a.version]);

// Closing is only a session dismissal. Only an explicit acknowledgement persists.
// Legacy receipts contain no app version and cannot prove this installed version was read.
export function createAnnouncementDelivery(options: {
  fetch: () => Promise<PublishedAnnouncement>;
  storage: Pick<Storage, "getItem" | "setItem">;
  show: (announcement: UnreadAnnouncement | null) => void;
}) {
  let stopped = false;
  let busy = false;
  let lastCheck = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismissed = new Set<string>();
  const acknowledged = new Set<string>();
  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void check(true), delay);
  };
  async function check(force = false) {
    if (stopped || busy || (!force && Date.now() - lastCheck < 30_000)) return;
    busy = true;
    lastCheck = Date.now();
    try {
      const a = await options.fetch();
      if (stopped) return;
      failures = 0;
      if (!a.active) options.show(null);
      else if (a.version && [a.titleZh, a.titleEn, a.bodyZh, a.bodyEn].some(text => text?.trim())) {
        let seen = "";
        try { seen = options.storage.getItem(ANNOUNCEMENT_READ_KEY) || ""; } catch { /* memory receipt still works */ }
        if (!a.appVersion) throw new Error("Missing installed app version");
        const key = receipt(a as UnreadAnnouncement);
        if (seen !== key && !dismissed.has(key) && !acknowledged.has(key)) {
          options.show({ ...a, version: a.version });
        }
      }
      schedule(5 * 60_000);
    } catch {
      // Startup network failures are not an unpublished announcement.
      schedule(Math.min(15_000 * 2 ** failures++, 60_000));
    } finally {
      busy = false;
    }
  }
  return {
    check,
    dismiss(a: UnreadAnnouncement) {
      dismissed.add(receipt(a));
      options.show(null);
    },
    acknowledge(a: UnreadAnnouncement) {
      acknowledged.add(receipt(a));
      try { options.storage.setItem(ANNOUNCEMENT_READ_KEY, receipt(a)); } catch { /* retry after restart if storage unavailable */ }
      options.show(null);
    },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
