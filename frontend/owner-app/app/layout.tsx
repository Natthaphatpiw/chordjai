import type { Metadata } from 'next';
import { Mitr } from 'next/font/google';
import { LocaleProvider } from '../../shared/locale';
import { getTranslator } from '../../shared/locale-server';
import './globals.css';
const mitr = Mitr({ subsets: ['thai', 'latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-mitr' });
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('ชิดใจ · ทุกเรื่องของน้อง อยู่ใกล้ใจ', 'ChordJai · A little care, every day'), description: t('สมุดสุขภาพและความทรงจำของสัตว์เลี้ยง พร้อมผู้ช่วย AI บน LINE', 'Pet health records, memories and a thoughtful AI companion on LINE') };
}
export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getTranslator();
  return <html lang={locale} className={mitr.variable}><body className={mitr.className}><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body></html>;
}
