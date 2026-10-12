import type { Metadata } from 'next';
import Link from 'next/link';
import { Siren } from 'lucide-react';
import { PublicLayout } from '../../components/public-layout';
import { localizedHref } from '../../../shared/locale-core';
import { getTranslator } from '../../../shared/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('รู้จักผู้ช่วย AI ของชิดใจ', 'Meet your AI assistant · ChordJai') };
}
export default async function Page() {
  const { locale, t } = await getTranslator();
  const sections = [
    [t('AI ช่วยอะไรได้', 'What AI can help with'), t('อ่านรายการจากรูปสมุดวัคซีนให้เป็นแบบร่าง ช่วยจัดหน้าสมุดความทรงจำ สรุปข้อมูลที่คุณบันทึก คุยเรื่องการดูแลทั่วไป และช่วยคัดกรองความเร่งด่วนร่วมกับกฎพื้นฐาน', 'AI can draft entries from a photo of a vaccine book, arrange a memory-journal page, summarise recorded information, discuss everyday care, and help screen urgency alongside basic rules.')],
    [t('คุณเป็นคนตัดสินใจเสมอ', 'You always decide'), t('รายการที่ AI อ่านและหน้าสมุดที่ AI ตกแต่งต้องได้รับการตรวจและยืนยันก่อนเก็บลงสมุด ระบบไม่แก้ข้อมูลสุขภาพโดยเงียบ ๆ AI อาจอ่านตัวเลข วันที่ หรือรายละเอียดรูปผิดได้', 'Review and confirm AI-read entries and decorated journal pages before saving them. The service does not silently change health information. AI can misread numbers, dates and details in photos.')],
    [t('ภาพ PetID และการยืนยันตัวเดิม', 'PetID photos and same-pet checks'), t('ขนาด แสง ความคมชัด และภาพซ้ำเป็นเกณฑ์เบื้องต้น AI เปรียบเทียบลักษณะที่มองเห็นได้ แต่ผลว่าคล้ายกันไม่ใช่ ground truth ต้องมีผู้ตรวจอิสระและหลักฐานก่อนใช้เป็นข้อมูลฝึก การวัดโมเดลแยกสัตว์และเจ้าของจากชุดฝึกและแยกวันถ่าย ผลฝึกข้อมูลสังเคราะห์ยังไม่ใช่ความแม่นยำกับสัตว์จริง ไม่มีการเปิดใช้โมเดลวิจัยอัตโนมัติ', 'Image size, lighting, detail and duplicate checks are preliminary. AI can compare visible appearance, but similarity is not ground truth. Independent evidence review is required before training use. Model evaluation separates pets and owners from training and separates capture days. Synthetic training results are not real-pet accuracy. Research models are not activated automatically.')],
    [t('ขอบเขตทางการแพทย์', 'Medical limits'), t('AI ไม่วินิจฉัยโรค ไม่สั่งยา และไม่แนะนำขนาดยา ภาพถ่ายบอกได้เฉพาะสิ่งที่มองเห็น การคัดกรองไม่สามารถยืนยันว่าปลอดภัย อาการที่แย่ลงหรือคุณกังวลควรให้สัตวแพทย์ประเมิน', 'AI does not diagnose conditions, prescribe medication or recommend doses. Photos show only what is visible. Screening cannot confirm that your pet is safe. A vet should assess symptoms that worsen or worry you.')],
    [t('การคุยต่อเนื่องและความจำ', 'Continuing a conversation and memory'), t('ประวัติในบทสนทนาช่วยให้ตอบต่อเรื่องเดิม ความจำระยะยาวใช้สิ่งที่คุณอนุญาตให้จำข้ามบทสนทนา คุณกำหนดชื่อ โทนการพูดคุย เปิดหรือปิดความจำ และลบสิ่งที่จำได้เอง', 'Conversation history helps the assistant continue a topic. Long-term memory uses information you allow it to remember across conversations. Choose its name and tone, turn memory on or off, and delete memories yourself.')],
    [t('การติดตามผ่าน LINE ที่คุณเลือกเปิด', 'LINE follow-ups you choose to enable'), t('AI ใช้ข้อมูลส่วนที่คุณเลือกเพื่อเลือกน้อง เรื่องที่จะถาม และโทนข้อความ ระบบตรวจแหล่งข้อมูลและประกอบคำถามจากตัวเลือกที่จำกัด ไม่ให้ AI เขียนคำวินิจฉัยหรือเปลี่ยนยาอย่างอิสระ อาจข้ามวันที่ไม่มีเรื่องเหมาะสม และคุณปิดหรือพักได้ ข้อความเหล่านี้ไม่ได้ติดตามเหตุฉุกเฉิน', 'AI uses your selected data sources to choose a pet, a topic and a tone. The service checks the source and composes a question from bounded choices. AI does not freely write diagnoses or medication changes. Days without useful context may be skipped, and you can pause or turn it off. These messages do not monitor emergencies.')],
    [t('เมื่อ AI ไม่พร้อม', 'When AI is unavailable'), t('การคัดกรองใช้กฎฉุกเฉินเป็นพื้นฐาน ผลจะระบุเมื่อใช้กฎแทน AI คุณยังบันทึกข้อมูลเองได้ ข้อมูลฉุกเฉินเปิดได้โดยไม่ล็อกอินและไม่รอ AI', 'Screening uses emergency rules as a baseline and tells you when rules are used instead of AI. You can still enter records yourself. Emergency guidance is available without signing in or waiting for AI.')]
  ];
  return <PublicLayout><article className="public-article legal-article"><span className="eyebrow">{t('AI ช่วยคิด คุณเลือกใช้', 'AI helps you think. You choose what to use.')}</span><h1>{t('รู้จักผู้ช่วย AI ของชิดใจ', 'Meet your AI assistant')}</h1>{sections.map(([title, content]) => <section key={title}><h2>{title}</h2><p>{content}</p></section>)}<Link href={localizedHref('/emergency', locale)} className="button danger"><Siren size={19}/>{t('เปิดข้อมูลฉุกเฉิน', 'Open emergency guidance')}</Link></article></PublicLayout>;
}
