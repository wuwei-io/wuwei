export type AnnouncementCard = { title: string; summary: string; details: string; icon: "company" | "image" | "spark" };
export type AnnouncementContent = { kind: "cards"; cards: AnnouncementCard[]; intro: string; notice: string } | { kind: "plain"; paragraphs: string[] };

// The API version is an updated_at read receipt, NEVER a product version.
export function splitAnnouncementHeading(title: string, _readReceipt = "") {
  const match = title.match(/(?:^|[\s（(【[])(v?\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?)(?=$|[\s：:）)】\]])/i);
  const version = match?.[1] || "";
  return { title: version ? title.replace(version, "").replace(/[（(【[]\s*[）)】\]]/g, "").replace(/\s+([：:])/g, "$1").trim() : title.trim() || "产品更新", version: version ? `v${version.replace(/^v/i, "")}` : "" };
}
export function safeAnnouncementUrl(url: string): string {
  return /^(https?:\/\/|mailto:)[^\s\u0000-\u001f]+$/i.test(url) ? url : "";
}
function card(title: string, body: string): AnnouncementCard {
  // Only collapse explicitly separated detail paragraphs. Never split sentences or alter Markdown lines.
  const separator = body.indexOf("\n\n");
  return { title, summary: separator < 0 ? body : body.slice(0, separator), details: separator < 0 ? "" : body.slice(separator + 2), icon: /生图|图像|图片|image|photo/i.test(title) ? "image" : /公司|团队|员工|company|team/i.test(title) ? "company" : "spark" };
}
export function parseAnnouncementBody(body: string): AnnouncementContent {
  const text = body.replace(/\r\n?/g, "\n").trim();
  const paragraphs = text ? text.split(/\n\s*\n+/) : [];
  // Explicit H2 sections: intro + feature cards. A thematic break starts the update notice.
  if (/^##\s+\S/m.test(text)) {
    const [main, ...tail] = text.split(/\n(?:---|\*\*\*)\s*(?:\n|$)/);
    const parts = main.split(/^##[ \t]+(.+)$/m);
    const cards: AnnouncementCard[] = [];
    for (let i = 1; i < parts.length; i += 2) cards.push(card(parts[i].trim(), (parts[i + 1] || "").trim()));
    return { kind: "cards", cards, intro: parts[0].trim(), notice: tail.join("\n\n").trim() };
  }
  // Do not reinterpret Markdown lists/headings/fences as legacy short headings.
  const candidate = (block: string) => {
    const lines = block.split("\n");
    const title = lines.shift()!.trim();
    return lines.length && title.length >= 2 && title.length <= 36 && !/[。！？!?；;：:]$/.test(title) && !/^[#>*`~\-\d]|\*\*|\[/.test(title) ? card(title, lines.join("\n").trim()) : null;
  };
  const cards: AnnouncementCard[] = [];
  let index = 0;
  for (; index < paragraphs.length; index++) {
    const item = candidate(paragraphs[index]);
    if (!item || !item.summary) break;
    cards.push(item);
  }
  return cards.length >= 2 ? { kind: "cards", cards, intro: "", notice: paragraphs.slice(index).join("\n\n") } : { kind: "plain", paragraphs };
}
