export type ResponseLocale = 'th' | 'en';
export function responseLocale(acceptLanguage?: string): ResponseLocale {
  const preferences = (acceptLanguage ?? '').split(',').map(part => {
    const [language, ...parameters] = part.trim().toLowerCase().split(';');
    const q = parameters.find(value => value.trim().startsWith('q='));
    return { language: language.split('-')[0], quality: q ? Number(q.trim().slice(2)) : 1 };
  }).filter(value => (value.language === 'en' || value.language === 'th') && Number.isFinite(value.quality) && value.quality > 0 && value.quality <= 1)
    .sort((a, b) => b.quality - a.quality);
  return preferences[0]?.language === 'en' ? 'en' : 'th';
}
