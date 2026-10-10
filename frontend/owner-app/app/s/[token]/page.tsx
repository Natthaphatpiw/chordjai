import type { Metadata } from 'next';
import { Cat, Dog, CalendarDays, LockKeyhole, BookHeart } from 'lucide-react';
import { PublicLayout } from '../../../components/public-layout';
import { publicApi } from '../../../lib/public-api';
import type { Pet, HealthRecord } from '../../../lib/types';
import { dateForLocale } from '../../../../shared/api';
import { getTranslator } from '../../../../shared/locale-server';
import { ErrorBox, Empty } from '../../../components/ui';
import { RecordIcon } from '../../../components/record-icon';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('สรุปสุขภาพก่อนพบหมอ · ชิดใจ', 'Health summary for your vet · ChordJai'), robots: { index: false, follow: false } };
}
export default async function Page({params}:{params:Promise<{token:string}>}) {
  const [{ token }, { locale, t }] = await Promise.all([params, getTranslator()]);
  const {data,error}=await publicApi<{pet:Pet;records:HealthRecord[];createdAt:string;expiresAt:string}>(`/share/public/${encodeURIComponent(token)}`);
  const date = (value: string | null | undefined) => dateForLocale(value, locale);
  return <PublicLayout><section className="public-summary"><header className="public-document-heading"><span className="eyebrow">{t('ข้อมูลที่เจ้าของเลือกแชร์', 'Information the owner chose to share')}</span><h1>{t('สรุปสุขภาพก่อนพบหมอ', 'Health summary for your vet')}</h1><p>{t('ใช้ประกอบการพูดคุยกับสัตวแพทย์ และตรวจเทียบกับเอกสารต้นฉบับ', 'Use this to support a conversation with your vet, and compare it with the original documents.')}</p></header>{error||!data ? <section className="public-article public-unavailable"><LockKeyhole size={30} strokeWidth={1.4}/><h2>{t('ลิงก์นี้ไม่พร้อมแสดงข้อมูล', 'This link is unavailable')}</h2><ErrorBox message={t(error||'ไม่พบข้อมูล', 'We cannot open this health summary right now. The link may have expired or been revoked.')}/><p>{t('ลิงก์อาจหมดอายุหรือถูกเพิกถอน ขอให้เจ้าของสร้างลิงก์ใหม่หากยังต้องการแชร์สรุปสุขภาพ', 'The link may have expired or been revoked. Ask the owner to create a new link if they still want to share a summary.')}</p></section> : <><div className="summary-pet-profile"><span className="public-pet-symbol" aria-hidden="true">{data.pet.species==='cat'?<Cat size={52} strokeWidth={1.2}/>:<Dog size={52} strokeWidth={1.2}/>}</span><div><span className="eyebrow">{t('โปรไฟล์ของน้อง', 'Pet profile')}</span><h2>{data.pet.name}</h2><p>{data.pet.species==='cat'?t('แมว','Cat'):t('สุนัข','Dog')}{data.pet.birthDate?` · ${t('เกิด','Born')} ${date(data.pet.birthDate)}`:''}</p></div><span className="summary-expiry"><CalendarDays size={16}/>{t('ลิงก์หมดอายุ', 'Link expires')} {date(data.expiresAt)}</span></div><div className="panel"><div className="summary-record-heading"><h2>{t('ประวัติสุขภาพที่เจ้าของบันทึก', 'Health history recorded by the owner')}</h2><span className="small-tag">{data.records.length} {t('รายการ', data.records.length === 1 ? 'record' : 'records')}</span></div><p className="small-copy">{t('สร้างสรุป', 'Summary created')} {date(data.createdAt)}</p>{data.records.length ? data.records.map(record=><article className="health-record" key={record.id}><span className="timeline-icon"><RecordIcon kind={record.kind}/></span><div><h3>{record.title}</h3><p>{t('บันทึก', 'Recorded')} {date(record.recordedAt)}{record.value!=null?` · ${record.value} ${t('กก.', 'kg')}`:''}</p>{record.nextDueAt?<p>{t('ครั้งถัดไป', 'Next due')} {date(record.nextDueAt)}</p>:null}{record.notes?<p className="record-notes">{record.notes}</p>:null}</div></article>) : <Empty icon={<BookHeart size={30}/>} title={t('ยังไม่มีประวัติในสรุปนี้', 'No records in this summary yet')} detail={t('ให้เจ้าของเพิ่มบันทึก แล้วสร้างลิงก์สรุปใหม่เมื่อพร้อม', 'Ask the owner to add records and create a new summary link when ready')}/>}</div></>}</section></PublicLayout>;
}
