// Catalog badges can carry compact Chinese/English alternatives per segment.
export function localizeModelBadge(badge: string, language: string): string {
  const labels: Record<string, [string, string]> = {
    new:['最新','New'], hot:['热门','Popular'], top:['顶级','Top'], free:['免费','Free'],
    '限免':['限免','Free offer'], '免费':['免费','Free'], '快':['快','Fast'], '省':['省','Value'],
    '更强':['更强','Stronger'], '深度思考':['深度思考','Reasoning'], '识图':['识图','Vision'], '推荐':['推荐','Recommended'],
  };
  return badge.split(' · ').map(segment => {
    const split = segment.indexOf('/');
    const text = (split < 0 ? segment : language === 'en' ? segment.slice(split + 1) : segment.slice(0, split)).trim();
    const known = labels[text.toLowerCase()];
    return known ? known[language === 'en' ? 1 : 0] : language === 'en' && /[\u4e00-\u9fff]/.test(text) ? '' : text;
  }).filter(Boolean).join(' · ');
}
