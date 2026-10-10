import type { Metadata } from 'next';
import Link from 'next/link';
import { Cat, Dog, MapPin, ArrowRight, Search } from 'lucide-react';
import { PublicLayout } from '../../../components/public-layout';
import { publicApi } from '../../../lib/public-api';
import LostTip from '../../../components/lost-tip';
import { ErrorBox } from '../../../components/ui';
import { localizedHref } from '../../../../shared/locale-core';
import { getTranslator } from '../../../../shared/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('ช่วยพาน้องกลับบ้าน · ชิดใจ', 'Help a pet get home · ChordJai'), robots: { index: false, follow: false } };
}
export default async function Page({params}:{params:Promise<{slug:string}>}) {
  const [{ slug }, { locale, t }] = await Promise.all([params, getTranslator()]);
  const {data,error}=await publicApi<{petName:string;species:string;description:string;district:string}>(`/lostfound/public/${encodeURIComponent(slug)}`);
  return <PublicLayout>{error||!data ? <section className="public-article public-unavailable"><Search size={32} strokeWidth={1.4}/><h1>{t('ประกาศนี้ไม่พร้อมแสดง', 'This notice is unavailable')}</h1><ErrorBox message={t(error||'ประกาศนี้ปิดแล้วหรือไม่พบข้อมูล', 'We cannot open this notice right now. It may have closed or no longer be available.')}/><p>{t('เจ้าของอาจปิดประกาศแล้ว หรือไม่มีข้อมูลสำหรับลิงก์นี้ หากคุณพบสัตว์ ลองค้นผ่าน PetID ได้', 'The owner may have closed the notice, or this link may not have information. If you found a pet, you can try a PetID search.')}</p><Link className="button secondary" href={localizedHref('/app?tab=petid', locale)}>{t('ค้น PetID', 'Search PetID')} <ArrowRight size={17}/></Link></section> : <><article className="public-lost-hero"><span className="soft-tag">{t('กำลังตามหา · ช่วยพาน้องกลับบ้าน', 'Missing · help them get home')}</span><div className="public-pet-symbol" aria-hidden="true">{data.species==='cat'?<Cat size={72} strokeWidth={1}/>:<Dog size={72} strokeWidth={1}/>}</div><span className="eyebrow">{t('น้องมีบ้านที่รออยู่', 'Someone at home is waiting for them')}</span><h1>{data.petName}</h1><p className="lost-description">{data.description}</p><div className="lost-location"><MapPin size={18}/><span>{t('บริเวณที่หาย:', 'Last seen around:')} {data.district}</span></div></article><LostTip slug={slug}/></>}</PublicLayout>;
}
