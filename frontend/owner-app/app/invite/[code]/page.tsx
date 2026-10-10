import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart, ArrowRight } from 'lucide-react';
import { PublicLayout } from '../../../components/public-layout';
import { localizedHref } from '../../../../shared/locale-core';
import { getTranslator } from '../../../../shared/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('ดูแลน้องไปด้วยกัน · ชิดใจ', 'Care together · ChordJai'), robots: { index: false, follow: false } };
}
export default async function Page({ params }: { params: Promise<{code:string}> }) {
  const [{ code }, { locale, t }] = await Promise.all([params, getTranslator()]);
  return <PublicLayout><section className="public-article public-invitation"><Heart size={40} className="public-invitation-icon"/><h1 style={{marginTop:20}}>{t('ดูแลน้องไปด้วยกัน', 'Care for them together')}</h1><p>{t('คุณได้รับลิงก์เชิญให้ร่วมดูแลหรือดูข้อมูลของน้อง', 'You have an invitation to help care for a pet or view their information.')}<br/>{t('เข้าสู่ระบบ LINE เพื่อรับคำเชิญ ลิงก์มีอายุ 72 ชั่วโมงและใช้ได้ครั้งเดียว', 'Sign in with LINE to accept. The link lasts 72 hours and can be used once.')}</p><Link className="button" href={localizedHref(`/app?invite=${encodeURIComponent(code)}`, locale)}>{t('เข้าสู่ระบบเพื่อรับคำเชิญ', 'Sign in to accept the invitation')} <ArrowRight size={18}/></Link></section></PublicLayout>;
}
