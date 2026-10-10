'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { LOCALE_COOKIE, translate, type Locale } from './locale-core';

type LocaleContextValue = { locale: Locale; t: (thai: string, english: string) => string; setLocale: (locale: Locale) => void };
const LocaleContext = createContext<LocaleContextValue | null>(null);
function rememberLocale(locale: Locale) {
  const { hostname, protocol } = window.location;
  const domain = hostname === 'chordjai.life' || hostname.endsWith('.chordjai.life') ? '; Domain=chordjai.life' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${protocol === 'https:' ? '; Secure' : ''}`;
  document.documentElement.lang = locale;
}
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setCurrent] = useState(initialLocale);
  const router = useRouter();
  useEffect(() => { setCurrent(initialLocale); rememberLocale(initialLocale); }, [initialLocale]);
  const setLocale = useCallback((next: Locale) => {
    setCurrent(next);
    rememberLocale(next);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [router]);
  const value = useMemo(() => ({ locale, setLocale, t: (thai: string, english: string) => translate(locale, thai, english) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('LocaleProvider is required');
  return context;
}
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return <div className="language-switcher" role="group" aria-label={t('เลือกภาษา', 'Choose language')}>
    <Languages size={16} aria-hidden="true" />
    {(['th', 'en'] as const).map(option => <button key={option} type="button" aria-label={option === 'th' ? t('ภาษาไทย', 'Thai') : t('ภาษาอังกฤษ', 'English')} aria-pressed={locale === option} onClick={() => setLocale(option)}>{option.toUpperCase()}</button>)}
  </div>;
}
