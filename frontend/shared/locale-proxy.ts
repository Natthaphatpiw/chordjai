import { NextResponse, type NextRequest } from 'next/server';
import { asLocale, LOCALE_COOKIE } from './locale-core';

export function localeProxy(request: NextRequest) {
  const locale = asLocale(request.nextUrl.searchParams.get('lang')) ?? asLocale(request.cookies.get(LOCALE_COOKIE)?.value) ?? 'th';
  const headers = new Headers(request.headers);
  // Always overwrite incoming headers. Locale is a preference, never an auth input.
  headers.set('x-chordjai-locale', locale);
  return NextResponse.next({ request: { headers } });
}
