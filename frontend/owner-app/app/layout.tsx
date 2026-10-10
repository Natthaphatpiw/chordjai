import type { Metadata } from 'next';
import { Sarabun } from 'next/font/google';
import './globals.css';
const sarabun = Sarabun({ subsets: ['thai', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-sarabun' });
export const metadata: Metadata = { title: 'ชิดใจ · ทุกเรื่องของน้อง อยู่ใกล้ใจ', description: 'สมุดสุขภาพและความทรงจำของสัตว์เลี้ยง พร้อมผู้ช่วย AI บน LINE' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="th" className={sarabun.variable}><body className={sarabun.className}>{children}</body></html>; }
