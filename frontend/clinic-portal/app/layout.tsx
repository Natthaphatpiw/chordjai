import type { Metadata } from 'next';
import { Mitr } from 'next/font/google';
import { LocaleProvider } from '../../shared/locale';
import { getTranslator } from '../../shared/locale-server';
import '../../shared/portal.css';
const mitr = Mitr({ subsets: ['thai', 'latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-mitr' });
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('ชิดใจ · พื้นที่คลินิก', 'ChordJai · Clinic workspace'), robots: { index: false, follow: false } };
}
export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getTranslator();
  return <html lang={locale} className={mitr.variable}><body className={mitr.className}><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body></html>;
}
