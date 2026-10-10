import type { Metadata } from 'next';
import { Cat, Dog, CalendarDays, LockKeyhole, BookHeart } from 'lucide-react';
import { PublicLayout } from '../../../components/public-layout';
import { publicApi } from '../../../lib/public-api';
import type { Pet, HealthRecord } from '../../../lib/types';
import { dateThai } from '../../../../shared/api';
import { ErrorBox, Empty } from '../../../components/ui';
import { RecordIcon } from '../../../components/record-icon';
export const metadata:Metadata={title:'สรุปสุขภาพก่อนพบหมอ · ชิดใจ',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  const {data,error}=await publicApi<{pet:Pet;records:HealthRecord[];createdAt:string;expiresAt:string}>(`/share/public/${encodeURIComponent(token)}`);
  return <PublicLayout><section className="public-summary"><header className="public-document-heading"><span className="eyebrow">ข้อมูลที่เจ้าของเลือกแชร์</span><h1>สรุปสุขภาพก่อนพบหมอ</h1><p>ใช้ประกอบการพูดคุยกับสัตวแพทย์ และตรวจเทียบกับเอกสารต้นฉบับ</p></header>{error||!data ? <section className="public-article public-unavailable"><LockKeyhole size={30} strokeWidth={1.4}/><h2>ลิงก์นี้ไม่พร้อมแสดงข้อมูล</h2><ErrorBox message={error||'ไม่พบข้อมูล'}/><p>ลิงก์อาจหมดอายุหรือถูกเพิกถอน ขอให้เจ้าของสร้างลิงก์ใหม่หากยังต้องการแชร์สรุปสุขภาพ</p></section> : <><div className="summary-pet-profile"><span className="public-pet-symbol" aria-hidden="true">{data.pet.species==='cat'?<Cat size={52} strokeWidth={1.2}/>:<Dog size={52} strokeWidth={1.2}/>}</span><div><span className="eyebrow">โปรไฟล์ของน้อง</span><h2>{data.pet.name}</h2><p>{data.pet.species==='cat'?'แมว':'สุนัข'}{data.pet.birthDate?` · เกิด ${dateThai(data.pet.birthDate)}`:''}</p></div><span className="summary-expiry"><CalendarDays size={16}/>ลิงก์หมดอายุ {dateThai(data.expiresAt)}</span></div><div className="panel"><div className="summary-record-heading"><h2>ประวัติสุขภาพที่เจ้าของบันทึก</h2><span className="small-tag">{data.records.length} รายการ</span></div><p className="small-copy">สร้างสรุป {dateThai(data.createdAt)}</p>{data.records.length ? data.records.map(record=><article className="health-record" key={record.id}><span className="timeline-icon"><RecordIcon kind={record.kind}/></span><div><h3>{record.title}</h3><p>บันทึก {dateThai(record.recordedAt)}{record.value!=null?` · ${record.value} กก.`:''}</p>{record.nextDueAt?<p>ครั้งถัดไป {dateThai(record.nextDueAt)}</p>:null}{record.notes?<p className="record-notes">{record.notes}</p>:null}</div></article>) : <Empty icon={<BookHeart size={30}/>} title="ยังไม่มีประวัติในสรุปนี้" detail="ให้เจ้าของเพิ่มบันทึก แล้วสร้างลิงก์สรุปใหม่เมื่อพร้อม"/>}</div></>}</section></PublicLayout>;
}
