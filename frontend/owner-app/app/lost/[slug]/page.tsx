import type { Metadata } from 'next';
import { PublicLayout } from '../../../components/public-layout';
import { publicApi } from '../../../lib/public-api';
import LostTip from '../../../components/lost-tip';
import { ErrorBox } from '../../../components/ui';
export const metadata:Metadata={title:'ช่วยพาน้องกลับบ้าน · ชิดใจ',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params;const{data,error}=await publicApi<{petName:string;species:string;description:string;district:string}>(`/lostfound/public/${encodeURIComponent(slug)}`);return <PublicLayout>{error||!data?<ErrorBox message={error||'ประกาศนี้ปิดแล้วหรือไม่พบข้อมูล'}/>:<><article className="public-lost-hero"><span className="soft-tag">กำลังตามหา · ช่วยพาน้องกลับบ้าน</span><div className="pet-hero-emoji">{data.species==='cat'?'🐈':'🐕'}</div><h1>{data.petName}</h1><p style={{whiteSpace:'pre-wrap'}}>{data.description}</p><b>บริเวณที่หาย: {data.district}</b></article><LostTip slug={slug}/></>}</PublicLayout>;}
