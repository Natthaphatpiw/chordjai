import type {Metadata} from 'next';
import {CalendarDays,LockKeyhole} from 'lucide-react';
import type {PassportSnapshot} from '../../../../../packages/contracts/src/passport';
import {PassportBrief} from '../../../../shared/passport-brief';
import {PublicLayout} from '../../../components/public-layout';
import {publicApi} from '../../../lib/public-api';
import {getTranslator} from '../../../../shared/locale-server';
import {dateForLocale} from '../../../../shared/api';

export async function generateMetadata():Promise<Metadata>{
  const {t}=await getTranslator();
  return {title:t('Pet Passport เตรียมพบคุณหมอ · ชิดใจ','Pet Passport visit brief · ChordJai'),robots:{index:false,follow:false},referrer:'no-referrer'};
}
export default async function Page({params}:{params:Promise<{token:string}>}){
  const [{token},{locale,t}]=await Promise.all([params,getTranslator()]);
  const {data,error}=await publicApi<{document:PassportSnapshot;expiresAt:string;photos:{mediaId:string;url:string}[]}>(`/share/public/passport/${encodeURIComponent(token)}`);
  return <PublicLayout><section className="public-summary">
    <header className="public-document-heading"><span className="eyebrow">{t('ฉบับที่เจ้าของเลือกแชร์','Shared by the owner')}</span><h1>{t('เตรียมพบคุณหมอ','Prepared for the vet')}</h1><p>{t('คำตอบ รูป และเรื่องการดูแลที่เจ้าของตรวจแล้ว ใช้ประกอบการซักประวัติและตรวจน้อง','Owner-reviewed answers, photos and care history to support history-taking and examination.')}</p></header>
    {error||!data?<section className="public-article public-unavailable"><LockKeyhole size={30}/><h2>{t('Passport นี้ไม่พร้อมแสดง','This Passport is unavailable')}</h2><p>{t('ลิงก์อาจหมดอายุ ถูกเพิกถอน หรือเจ้าของกำลังแก้ข้อมูล กรุณาขอฉบับที่ยืนยันใหม่จากเจ้าของ','The link may have expired, been revoked, or changed during editing. Please ask the owner for a newly confirmed version.')}</p></section>:<>
      <p className="summary-expiry"><CalendarDays size={16}/>{t('ลิงก์หมดอายุ','Link expires')} {dateForLocale(data.expiresAt,locale)}</p>
      <PassportBrief document={data.document} photos={data.photos} showPrint/>
      <p className="small-copy">{t('ลิงก์นี้เปิดอ่านข้อมูลที่เลือกได้เท่านั้น บันทึกจากคลินิกต้องเข้าสู่ระบบด้วยบัญชีคลินิกที่เจ้าของให้สิทธิ์','This link provides read-only access to selected information. Clinic notes require a signed-in clinic account authorised by the owner.')}</p>
    </>}
  </section></PublicLayout>;
}
