export type Locale = 'th' | 'en';
export const LOCALE_COOKIE = 'chordjai.locale';
export function asLocale(value: string | null | undefined): Locale | undefined {
  return value === 'th' || value === 'en' ? value : undefined;
}
export function translate(locale: Locale, thai: string, english: string): string {
  return locale === 'en' ? english : thai;
}
export function localizedHref(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/api/')) return path;
  const url = new URL(path, 'https://www.chordjai.life');
  url.searchParams.set('lang', locale);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function browserLocale(): Locale {
  if (typeof window === 'undefined') return 'th';
  const selected = asLocale(new URL(window.location.href).searchParams.get('lang'));
  const cookie = document.cookie.split('; ').find(value => value.startsWith(`${LOCALE_COOKIE}=`))?.split('=')[1];
  return asLocale(document.documentElement.lang) ?? selected ?? asLocale(cookie) ?? 'th';
}
