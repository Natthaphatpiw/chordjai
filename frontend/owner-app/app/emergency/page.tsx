import type { Metadata } from 'next';
import { Siren, AlertTriangle } from 'lucide-react';
import { PublicLayout } from '../../components/public-layout';
import EmergencyDirectory from '../../components/emergency-directory';
import { getTranslator } from '../../../shared/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('ข้อมูลฉุกเฉินสำหรับสัตว์เลี้ยง · ชิดใจ', 'Pet emergency guidance · ChordJai') };
}
export default async function Page() {
  const { t } = await getTranslator();
  const redFlags = [
    t('หายใจลำบาก หอบมาก หรือเหงือกม่วง', 'Difficulty breathing, severe panting or purple gums'),
    t('หมดสติ ไม่ตอบสนอง หรือทรุดทันที', 'Unconscious, unresponsive or suddenly collapsed'),
    t('กำลังชัก หรือชักซ้ำ', 'A seizure in progress or repeated seizures'),
    t('เลือดออกมาก หรืออุบัติเหตุรุนแรง', 'Heavy bleeding or a serious accident'),
    t('สงสัยกินสารพิษหรือสิ่งอันตราย', 'Possible ingestion of poison or something dangerous'),
    t('พยายามปัสสาวะ แต่ปัสสาวะไม่ออก', 'Trying to urinate but unable to pass urine')
  ];
  return <PublicLayout emergency><section className="emergency-hero"><Siren size={36}/><span className="eyebrow" style={{color:'inherit',marginTop:20}}>{t('อาการฉุกเฉินไม่ต้องรอ AI', 'An emergency does not wait for AI')}</span><h1>{t('มีสัญญาณฉุกเฉิน', 'Seeing an emergency sign?')}<br/>{t('ไปโรงพยาบาลสัตว์ทันที', 'Go to a veterinary hospital now.')}</h1><p>{t('โทรแจ้งอาการและเดินทางไปโรงพยาบาลที่ใกล้ที่สุด ไม่ต้องรอ AI หรือล็อกอินก่อน', 'Call ahead to describe the symptoms and travel to the nearest veterinary hospital. Do not wait for AI or sign in first.')}</p><div className="emergency-redflags">{redFlags.map(item=><div key={item}><AlertTriangle size={16}/>{item}</div>)}</div></section><EmergencyDirectory/><section className="public-article emergency-preparation"><h2>{t('ระหว่างเตรียมเดินทาง', 'While preparing to leave')}</h2><p>{t('พาน้องอยู่ในบริเวณที่ปลอดภัยและเงียบ ลดการเคลื่อนไหวที่ไม่จำเป็น ใช้กล่องหรืออุปกรณ์พาไปโรงพยาบาลที่เหมาะสม โทรแจ้งอาการกับโรงพยาบาลเพื่อรับคำแนะนำระหว่างทาง', 'Keep your pet somewhere safe and quiet, and reduce unnecessary movement. Use a suitable carrier or transport aid. Call the hospital, describe the symptoms and ask for guidance while travelling.')}</p><p>{t('อย่าให้ยา อาหาร หรือบังคับดื่มน้ำโดยไม่ปรึกษาสัตวแพทย์ หากสงสัยได้รับสารพิษให้นำบรรจุภัณฑ์หรือข้อมูลของสิ่งนั้นไปด้วย โดยไม่เสี่ยงสัมผัสสารอันตราย', 'Do not give medication, food or force water without consulting a vet. If poisoning is suspected, bring the packaging or information about the substance without risking contact with anything dangerous.')}</p><p>{t('คำแนะนำนี้เป็นข้อมูลทั่วไป ไม่ใช่การวินิจฉัยหรือการรักษา อาการผิดปกติที่คุณกังวลควรให้สัตวแพทย์ประเมิน', 'This is general guidance, not a diagnosis or treatment. A vet should assess any unusual symptoms that worry you.')}</p></section></PublicLayout>;
}
