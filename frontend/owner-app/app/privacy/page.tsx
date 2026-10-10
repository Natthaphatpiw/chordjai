import type { Metadata } from 'next';
import { PublicLayout } from '../../components/public-layout';
import { getTranslator } from '../../../shared/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('ความเป็นส่วนตัวของเรา · ชิดใจ', 'Your privacy · ChordJai') };
}
export default async function Page() {
  const { t } = await getTranslator();
  const sections = [
    [t('ข้อมูลที่ใช้ให้บริการ', 'Information used to provide the service'), t('เราใช้ตัวตนจาก LINE เพื่อสร้างบัญชี ใช้โปรไฟล์น้อง บันทึกสุขภาพ รูปที่คุณอัปโหลด สมุดความทรงจำ และข้อความสนทนาเพื่อให้บริการตามที่คุณเลือก ความยินยอมแยกเป็นการให้บริการ การพัฒนา AI การแจ้งเตือนในพื้นที่ และข่าวสาร', 'We use your LINE identity to create an account. Your pet profiles, health records, uploaded photos, memory journals and conversations support the features you choose. Consent is separate for providing the service, improving AI, local alerts and news.')],
    [t('AI และความจำ', 'AI and memory'), t('ข้อความและรูปที่จำเป็นต่อคำขอ AI จะถูกประมวลผลผ่าน OpenAI ข้อมูลอาจประมวลผลนอกประเทศไทย ความจำระยะยาวปิดไว้เป็นค่าเริ่มต้น คุณเปิดใช้ เลือกสิ่งที่อยากให้จำ และลบแต่ละความจำได้ในการตั้งค่าผู้ช่วย', 'The text and images needed for an AI request are processed through OpenAI. Processing may take place outside Thailand. Long-term memory is off by default. You can turn it on, choose what to remember and delete individual memories in the assistant settings.')],
    [t('ใครเห็นข้อมูลได้บ้าง', 'Who can see your information'), t('ข้อมูลส่วนตัวแสดงเฉพาะบัญชีที่ได้รับสิทธิ์ ลิงก์สรุปสุขภาพเปิดให้ผู้ที่มีลิงก์จนหมดอายุหรือถูกเพิกถอน ประกาศน้องหายเปิดเผยลักษณะน้องและบริเวณที่หาย ข้อความผู้พบส่งผ่านระบบโดยไม่เปิดเบอร์เจ้าของเป็นค่าเริ่มต้น', 'Private information is visible only to accounts with access. Anyone with a health-summary link can view it until it expires or is revoked. Missing-pet notices show the pet’s features and the general area where they went missing. Finder messages are relayed through the service; the owner’s phone number is not shown by default.')],
    [t('พื้นที่จัดเก็บและรูปภาพ', 'Storage and photos'), t('ข้อมูลถูกเก็บผ่านผู้ให้บริการฐานข้อมูลและโฮสติ้งของชิดใจ รูปที่อัปโหลดผ่านหน้าจอจะถูกย่อและแปลงใหม่เพื่อตัดข้อมูลตำแหน่งจากภาพ', 'Information is stored through ChordJai’s database and hosting providers. Photos uploaded through the interface are resized and re-encoded to remove embedded location information.')],
    [t('ตัวเลือกและสิทธิ์ของคุณ', 'Your choices and rights'), t('คุณเปลี่ยนความยินยอม ดาวน์โหลดสำเนาข้อมูล ขอให้ลบบัญชี เพิกถอนลิงก์ และลบความจำ AI ได้จากแอป ข้อมูลที่จำเป็นตามกฎหมายหรือบันทึกความปลอดภัยอาจต้องเก็บตามระยะเวลาที่กำหนด', 'You can change consent, download a copy of your information, request account deletion, revoke links and delete AI memories in the app. Information required by law or security records may need to be kept for an applicable retention period.')],
    [t('ติดต่อผู้ดูแล', 'Contact the team'), t('ติดต่อผู้ดูแลผ่าน LINE Official Account ที่คุณใช้เข้าถึงชิดใจ', 'Contact the team through the LINE Official Account you use to access ChordJai.')]
  ];
  return <PublicLayout><article className="public-article legal-article"><span className="eyebrow">{t('ข้อมูลเป็นของคุณ', 'Your information belongs to you')}</span><h1>{t('ความเป็นส่วนตัวของเรา', 'Your privacy')}</h1><p>{t('ประกาศสำหรับบริการชิดใจรุ่นทดลอง · เวอร์ชัน 1.0', 'Privacy notice for the ChordJai pilot · Version 1.0')}</p>{sections.map(([title, content]) => <section key={title}><h2>{title}</h2><p>{content}</p></section>)}</article></PublicLayout>;
}
