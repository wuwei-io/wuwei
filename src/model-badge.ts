import systemData from "./localization/content/system-data.json";
import { tr } from "./localization/index.js";
// Catalog badges can carry compact Chinese/English alternatives per segment.
export function localizeModelBadge(badge: string, language: string): string {
  const labels: Record<string, string> = systemData.modelBadges;
  return badge.split(' · ').map(segment => {
    const split = segment.indexOf('/');
    const text = (split < 0 ? segment : language !== "zh" ? segment.slice(split + 1) : segment.slice(0, split)).trim();
    const known = labels[text.toLowerCase()] || labels[segment.slice(0, split < 0 ? undefined : split).trim().toLowerCase()];
    return known ? tr(known, {}, language) : language !== "zh" && /[\u4e00-\u9fff]/.test(text) ? '' : text;
  }).filter(Boolean).join(' · ');
}
