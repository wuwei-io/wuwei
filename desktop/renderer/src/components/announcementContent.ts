export type AnnouncementCard = {
  title: string;
  summary: string;
  icon: "company" | "image" | "spark";
};

export type AnnouncementContent =
  | { kind: "cards"; cards: AnnouncementCard[] }
  | { kind: "plain"; paragraphs: string[] };

export type AnnouncementHeading = {
  title: string;
  version: string;
};

const VERSION_TOKEN = /(?:^|[\s（(【[])(v?\d+(?:\.\d+){1,3})(?=$|[\s）)】\]])/i;
const HEADING_END = /[。！？!?；;：:]$/;

export function splitAnnouncementHeading(title: string, fallbackVersion = ""): AnnouncementHeading {
  const normalized = title.trim();
  const match = normalized.match(VERSION_TOKEN);
  const matchedVersion = match?.[1] || "";
  const cleanTitle = match
    ? normalized.replace(match[0], match[0].replace(matchedVersion, "")).replace(/[（(【[]\s*[）)】\]]/g, "").replace(/\s{2,}/g, " ").trim()
    : normalized;
  const version = (matchedVersion || fallbackVersion).trim();
  return {
    title: cleanTitle || normalized || "产品更新",
    version: version ? (/^v/i.test(version) ? version : `v${version}`) : "",
  };
}

function iconFor(title: string, index: number): AnnouncementCard["icon"] {
  if (/生图|图像|图片|image|photo|画/i.test(title)) return "image";
  if (/公司|团队|员工|company|team|agent/i.test(title)) return "company";
  return index % 2 === 0 ? "spark" : "company";
}

export function parseAnnouncementBody(body: string): AnnouncementContent {
  const normalized = body.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { kind: "plain", paragraphs: [] };

  const blocks = normalized.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  const candidates = blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = lines[0] || "";
    const summary = lines.slice(1).join(" ").trim();
    const shortHeading = title.length >= 2 && title.length <= 36 && !HEADING_END.test(title);
    return { title, summary, shortHeading, icon: iconFor(title, index) };
  });

  // 保守识别：至少两块，且每块都明确是“短标题 + 正文”，避免把普通多段公告误做卡片。
  if (candidates.length >= 2 && candidates.every((item) => item.shortHeading && item.summary.length > 0)) {
    return {
      kind: "cards",
      cards: candidates.map(({ title, summary, icon }) => ({ title, summary, icon })),
    };
  }

  return { kind: "plain", paragraphs: blocks };
}
