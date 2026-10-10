import type { Metadata } from 'next';
import { PublicLayout } from '../../components/public-layout';
import { getTranslator } from '../../../shared/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('เงื่อนไขการใช้บริการ · ชิดใจ', 'Terms of service · ChordJai') };
}
export default async function Page() {
  const { t } = await getTranslator();
  const sections = [
    [t('ข้อมูลและการใช้งานของคุณ', 'Your information and use of the service'), t('โปรดบันทึกข้อมูลที่ตรงตามจริง มีสิทธิ์ในรูปที่อัปโหลด และไม่ส่งข้อมูลส่วนตัวของผู้อื่นโดยไม่ได้รับอนุญาต ตรวจผลที่ AI อ่านจากสมุดก่อนยืนยันทุกครั้ง คุณควรเก็บสมุดต้นฉบับและเอกสารสำคัญไว้ด้วย', 'Please record information accurately, use photos you have the right to upload, and do not submit someone else’s private information without permission. Always review AI results from a vaccine book before confirming them. Keep the original book and important documents as well.')],
    [t('ขอบเขตบริการ', 'Scope of the service'), t('AI และการคัดกรองช่วยให้ข้อมูลและจัดลำดับความเร่งด่วนเท่านั้น ไม่ทดแทนการตรวจ วินิจฉัย หรือรักษาโดยสัตวแพทย์ คำขอนัดต้องได้รับการตอบรับจากคลินิกก่อนจึงถือว่าคลินิกยืนยัน', 'AI and screening provide information and help assess urgency. They do not replace a vet’s examination, diagnosis or treatment. An appointment request is confirmed only after the clinic accepts it.')],
    [t('เหตุฉุกเฉิน', 'Emergencies'), t('หากหายใจลำบาก หมดสติ ชัก มีเลือดออกมาก สงสัยสารพิษ หรือปัสสาวะไม่ออก ให้ไปโรงพยาบาลสัตว์ทันทีโดยไม่รอผลจากระบบ', 'If your pet has difficulty breathing, is unconscious, has a seizure, is bleeding heavily, may have been poisoned, or cannot urinate, go to a veterinary hospital immediately without waiting for the service.')],
    [t('ความพร้อมใช้งาน', 'Availability'), t('บริการรุ่นทดลองอาจมีการเปลี่ยนแปลงหรือหยุดชั่วคราวตามความพร้อมของผู้ให้บริการภายนอก หาก AI ไม่พร้อม คุณยังกรอกบันทึกด้วยตัวเองและเปิดข้อมูลฉุกเฉินได้ ระบบไม่รับประกันการส่งข้อความ LINE หรือปฏิทินแบบทันที', 'The pilot may change or be temporarily unavailable depending on external providers. If AI is unavailable, you can still enter records yourself and open emergency guidance. Instant delivery of LINE messages or calendar updates is not guaranteed.')],
    [t('น้องหายและ PetID', 'Missing pets and PetID'), t('ผลค้นรูปเป็นเพียงสัตว์ที่อาจคล้ายกัน ไม่ใช่หลักฐานยืนยันตัวน้อง เจ้าของต้องตรวจสอบด้วยตนเอง อย่าโอนเงินหรือเปิดเผยข้อมูลสำคัญกับผู้ส่งเบาะแสก่อนตรวจสอบ', 'Photo-search results show pets that may look similar. They are not proof of identity; the owner must review them. Do not transfer money or disclose sensitive information to someone sharing a sighting before verifying their message.')],
    [t('ก่อนเปิดใช้งานจริง', 'Before public launch'), t('ผู้ให้บริการต้องตรวจและเติมรายละเอียดผู้ให้บริการ ช่องทางติดต่อ ระยะเวลาเก็บข้อมูล และเงื่อนไขที่เกี่ยวข้องให้ตรงกับการดำเนินงานจริง', 'Before public launch, the provider must review and complete its service details, contact information, retention periods and applicable terms to match how the service operates.')]
  ];
  return <PublicLayout><article className="public-article legal-article"><span className="eyebrow">{t('ดูแลกันด้วยความเข้าใจ', 'Care with understanding')}</span><h1>{t('เงื่อนไขการใช้บริการ', 'Terms of service')}</h1><p>{t('ชิดใจเป็นบริการรุ่นทดลองสำหรับช่วยจัดการข้อมูลและการดูแลสัตว์เลี้ยง โปรดอ่านขอบเขตบริการก่อนใช้งาน', 'ChordJai is a pilot service that helps organise pet information and care. Please read the scope of the service before using it.')}</p>{sections.map(([title, content]) => <section key={title}><h2>{title}</h2><p>{content}</p></section>)}</article></PublicLayout>;
}
