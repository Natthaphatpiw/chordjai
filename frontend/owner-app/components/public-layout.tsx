'use client';
import Link from 'next/link';
import { PawPrint, ArrowUpRight } from 'lucide-react';
import { LanguageSwitcher, useLocale } from '../../shared/locale';
import { localizedHref } from '../../shared/locale-core';

export function PublicLayout({ children, emergency = false }: { children: React.ReactNode; emergency?: boolean }) {
  const { locale, t } = useLocale();
  return <div className={emergency ? 'emergency-page' : ''}><main className="public-page">
    <header className="public-header"><Link className="wordmark" href={localizedHref('/', locale)} aria-label={t('ชิดใจ หน้าหลัก', 'ChordJai home')}><span className="brand-mark"><PawPrint size={22}/></span>{t('ชิดใจ', 'ChordJai')}</Link><div className="public-header-actions"><LanguageSwitcher/><Link className="button secondary" href={localizedHref('/app', locale)}>{t('เปิดพื้นที่ของเรา', 'Open your space')} <ArrowUpRight size={16}/></Link></div></header>
    {children}
    <footer className="public-footer"><Link href={localizedHref('/', locale)}>{t('หน้าหลัก', 'Home')}</Link><Link href={localizedHref('/privacy', locale)}>{t('ความเป็นส่วนตัว', 'Privacy')}</Link><Link href={localizedHref('/terms', locale)}>{t('เงื่อนไข', 'Terms')}</Link><Link href={localizedHref('/ai-safety', locale)}>{t('การใช้ AI', 'Using AI')}</Link></footer>
  </main></div>;
}
