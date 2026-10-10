import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'ชิดใจ · ทุกเรื่องของน้อง อยู่ใกล้ใจ', description: 'สมุดสุขภาพและความทรงจำของสัตว์เลี้ยง พร้อมผู้ช่วย AI บน LINE' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="th"><body>{children}</body></html>; }
