import type { Metadata } from 'next';
import Link from 'next/link';
import { Cat, Dog, MapPin, ArrowRight, Search } from 'lucide-react';
import { PublicLayout } from '../../../components/public-layout';
import { publicApi } from '../../../lib/public-api';
import LostTip from '../../../components/lost-tip';
import { ErrorBox } from '../../../components/ui';
export const metadata:Metadata={title:'ช่วยพาน้องกลับบ้าน · ชิดใจ',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const {data,error}=await publicApi<{petName:string;species:string;description:string;district:string}>(`/lostfound/public/${encodeURIComponent(slug)}`);
  return <PublicLayout>{error||!data ? <section className="public-article public-unavailable"><Search size={32} strokeWidth={1.4}/><h1>ประกาศนี้ไม่พร้อมแสดง</h1><ErrorBox message={error||'ประกาศนี้ปิดแล้วหรือไม่พบข้อมูล'}/><p>เจ้าของอาจปิดประกาศแล้ว หรือไม่มีข้อมูลสำหรับลิงก์นี้ หากคุณพบสัตว์ ลองค้นผ่าน PetID ได้</p><Link className="button secondary" href="/app?tab=petid">ค้น PetID <ArrowRight size={17}/></Link></section> : <><article className="public-lost-hero"><span className="soft-tag">กำลังตามหา · ช่วยพาน้องกลับบ้าน</span><div className="public-pet-symbol" aria-hidden="true">{data.species==='cat'?<Cat size={72} strokeWidth={1}/>:<Dog size={72} strokeWidth={1}/>}</div><span className="eyebrow">น้องมีบ้านที่รออยู่</span><h1>{data.petName}</h1><p className="lost-description">{data.description}</p><div className="lost-location"><MapPin size={18}/><span>บริเวณที่หาย: {data.district}</span></div></article><LostTip slug={slug}/></>}</PublicLayout>;
}
