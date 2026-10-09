export type AnnouncementSource = {
  titleZh?: string; bodyZh?: string; titleEn?: string; bodyEn?: string;
};

// Choose a complete language pair, never mix a translated title with another language's body.
// If the requested translation is incomplete, use the other complete pair and its UI language.
export function selectAnnouncementLocale(source: AnnouncementSource, requested: string) {
  const preferred = requested === "en" ? "en" : "zh";
  const pair = (lang: "en" | "zh") => ({
    lang,
    title: (lang === "en" ? source.titleEn : source.titleZh) || "",
    body: (lang === "en" ? source.bodyEn : source.bodyZh) || "",
  });
  const first = pair(preferred);
  const other = pair(preferred === "en" ? "zh" : "en");
  if (first.title.trim() && first.body.trim()) return first;
  if (other.title.trim() && other.body.trim()) return other;
  return first.title.trim() || first.body.trim() ? first : other;
}
