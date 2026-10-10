// Inject Electron net.fetch at the call site so this request follows system proxy
// settings and remains independently testable without booting Electron.
type AnnouncementFetch = (url: string, options: {
  signal: AbortSignal;
  cache: "no-store";
  headers: Record<string, string>;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export async function fetchAnnouncement(fetcher: AnnouncementFetch, site: string) {
  const response = await fetcher(`${site.replace(/\/$/, "")}/api/announcement`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`Announcement HTTP ${response.status}`);
  const raw = await response.json();
  if (!raw || typeof raw !== "object") throw new Error("Invalid announcement response");
  const value = raw as Record<string, unknown>;
  if (!value || typeof value.active !== "boolean") throw new Error("Invalid announcement response");
  if (!value.active) return { active: false };
  if (typeof value.version !== "string" || !value.version.trim()) throw new Error("Missing announcement version");
  return {
    active: true,
    version: value.version,
    ...Object.fromEntries(["titleZh", "titleEn", "bodyZh", "bodyEn"].map(key => [key, typeof value[key] === "string" ? value[key] : ""])),
  };
}
