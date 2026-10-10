'use client';
import { useState } from 'react';
import { Send, Check, ShieldCheck } from 'lucide-react';
import { api, json, messageOf } from '../../shared/api';
import { useLocale } from '../../shared/locale';
import { ErrorBox, Notice } from './ui';

export default function LostTip({ slug }: { slug: string }) {
  const { locale, t } = useLocale();
  const [content, setContent] = useState('');
  const [district, setDistrict] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [sent, setSent] = useState(false);
  const [warning, setWarning] = useState('');

  if (sent) return <div className="panel public-lost-tip"><Check size={30}/><h2 style={{ marginTop: 15 }}>{t('ส่งเบาะแสถึงเจ้าของแล้ว', 'Your sighting has been sent to the owner')}</h2><p>{t('ขอบคุณที่ช่วยให้น้องได้กลับบ้าน อย่าโอนเงินหรือเปิดเผยข้อมูลสำคัญก่อนตรวจสอบ', 'Thank you for helping them find their way home. Verify any request before sending money or sharing sensitive information.')}</p>{warning ? <Notice>{t(warning, 'Do not send money before verifying that this is the missing pet.')}</Notice> : null}</div>;

  return <section className="panel public-lost-tip"><h2>{t('คุณเห็นน้อง หรือมีเบาะแส?', 'Have you seen them or found a clue?')}</h2><p>{t('ส่งข้อความถึงเจ้าของได้โดยไม่ต้องล็อกอิน ระบบส่งข้อความผ่านช่องทางส่วนตัว', 'Send a message to the owner without signing in. Your message is delivered privately.')}</p><form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      const result = await api<{ warning?: string | null }>(`/lostfound/public/${encodeURIComponent(slug)}/tips`, json('POST', { content, district, website }), true);
      setWarning(result.warning || ''); setSent(true);
    } catch (error) { setError(error); } finally { setBusy(false); }
  }}><label className="field">{t('สิ่งที่คุณพบ', 'What you saw')}<textarea required rows={4} maxLength={3000} value={content} onChange={event => setContent(event.target.value)} placeholder={t('เห็นน้องที่ไหน เวลาใด จุดสังเกตอะไรบ้าง', 'Where and when did you see them? Include any useful details.')}/></label><label className="field">{t('บริเวณที่พบ', 'Area of the sighting')}<input maxLength={100} value={district} onChange={event => setDistrict(event.target.value)} placeholder={t('ชื่อย่านหรือเขต หลีกเลี่ยงที่อยู่ส่วนตัว', 'Neighborhood or district; avoid sharing a private address')}/></label><label className="sr-only" aria-hidden="true">{t('เว็บไซต์', 'Website')}<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)}/></label><Notice><ShieldCheck size={17}/>{t('ไม่เปิดข้อมูลเจ้าของ ระวังข้อความขอให้โอนเงินหรือส่งลิงก์น่าสงสัย', 'The owner’s private details stay hidden. Be cautious of money requests and suspicious links.')}</Notice>{error ? <ErrorBox message={messageOf(error, locale)}/> : null}<button className="button full" disabled={busy}><Send size={18}/>{busy ? t('กำลังส่ง…', 'Sending…') : t('ส่งเบาะแสถึงเจ้าของ', 'Send your sighting to the owner')}</button></form></section>;
}
