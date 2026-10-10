import 'server-only';
import { cookies, headers } from 'next/headers';
import { asLocale, LOCALE_COOKIE, translate } from './locale-core';

export async function getLocale() {
  const requestHeaders = await headers();
  return asLocale(requestHeaders.get('x-chordjai-locale')) ?? asLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? 'th';
}
export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: (thai: string, english: string) => translate(locale, thai, english) };
}
