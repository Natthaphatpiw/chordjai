'use client';

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Camera, Check, ImagePlus, LockKeyhole, X } from 'lucide-react';
import { useLocale } from '../../shared/locale';
import { messageOf } from '../../shared/api';
import { prepareCarePhotoUpload, uploadPreparedCarePhoto, type CarePhotoUploadRequest } from './care-photo-upload';
import { safeCarePhoto } from './care-diary-model';
import type { PassportPhoto } from './passport-model';

interface PendingPhoto { id: string; file: File; preview: string; state: 'waiting' | 'uploading' | 'failed'; request?: CarePhotoUploadRequest; error?: unknown; }
interface Props { petId: string; demo: boolean; photos: PassportPhoto[]; onChange: (photos: PassportPhoto[]) => void; onPending: (pending: boolean) => void; disabled: boolean; available?: PassportPhoto[]; }
function keyboardPicker(event: KeyboardEvent<HTMLLabelElement>) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.querySelector('input')?.click(); } }
async function localPhoto(file: File) {
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('INVALID_IMAGE');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'), ratio = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d'); if (!context) throw new Error('INVALID_IMAGE');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', .78);
  } finally { bitmap.close(); }
}

/** Uploading a private photo does not publish it. The owner selects it again in the review. */
export default function PassportPhotos({ petId, demo, photos, onChange, onPending, disabled, available = [] }: Props) {
  const { locale, t } = useLocale();
  const [queue, setQueue] = useState<PendingPhoto[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), previews = useRef(new Set<string>()), selected = useRef(photos), localeRef = useRef(locale);
  selected.current = photos; localeRef.current = locale;
  useEffect(() => { alive.current = true; return () => { alive.current = false; for (const url of previews.current) URL.revokeObjectURL(url); previews.current.clear(); }; }, []);
  useEffect(() => { onPending(busy || queue.length > 0); }, [busy, queue.length, onPending]);
  async function process(items: PendingPhoto[]) {
    if (busy || disabled) return; setBusy(true); setError('');
    try {
      for (const item of items) {
        if (!alive.current) return;
        setQueue(current => current.map(photo => photo.id === item.id ? { ...photo, state: 'uploading', error: undefined } : photo));
        let request = item.request;
        try {
          if (!demo && !request) { request = await prepareCarePhotoUpload(item.file, petId, localeRef.current); if (!alive.current) return; setQueue(current => current.map(photo => photo.id === item.id ? { ...photo, request } : photo)); }
          const saved = demo ? { id: crypto.randomUUID(), url: await localPhoto(item.file) } : await uploadPreparedCarePhoto(request!, Boolean(item.request));
          if (!alive.current) return;
          const next = selected.current.some(photo => photo.mediaId === saved.id) ? selected.current : [...selected.current, { mediaId: saved.id, url: saved.url }]; selected.current = next; onChange(next);
          setQueue(current => current.filter(photo => photo.id !== item.id)); URL.revokeObjectURL(item.preview); previews.current.delete(item.preview);
        } catch (cause) { if (alive.current) setQueue(current => current.map(photo => photo.id === item.id ? { ...photo, state: 'failed', request, error: cause } : photo)); }
      }
    } finally { if (alive.current) setBusy(false); }
  }
  function removePending(id: string) { const photo = queue.find(item => item.id === id); if (photo) { URL.revokeObjectURL(photo.preview); previews.current.delete(photo.preview); } setQueue(current => current.filter(item => item.id !== id)); }
  async function add(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); event.target.value = ''; if (busy || disabled || !files.length) return;
    if (files.length + photos.length + queue.length > 5) { setError(t('เพิ่มรูปได้สูงสุด 5 รูป กรุณาเลือกให้น้อยลง', 'Choose fewer photos. A Passport can hold up to five.')); return; }
    const items = files.map(file => { const preview = URL.createObjectURL(file); previews.current.add(preview); return { id: crypto.randomUUID(), file, preview, state: 'waiting' as const }; });
    setQueue(current => [...current, ...items]); await process(items);
  }
  const locked = disabled || busy, full = photos.length + queue.length >= 5;
  return <section className="passport-photos" aria-label={t('รูปสำหรับ Passport', 'Passport photos')}>
    <div className="passport-section-heading"><h3><Camera size={18}/>{t('รูปที่ช่วยเล่าเรื่อง', 'Photos that tell the story')}</h3><span>{photos.length + queue.length}/5</span></div>
    <p>{t('รูปอาการ ยาที่ได้รับ หรือเอกสาร เลือกอีกครั้งก่อนแชร์ให้คุณหมอ', 'Symptoms, medication received or documents. Select them again before sharing with your vet.')}</p>
    <div className="passport-photo-actions"><label className="button secondary small" role="button" tabIndex={locked || full ? -1 : 0} aria-disabled={locked || full} onKeyDown={keyboardPicker}><ImagePlus size={17}/>{t('เลือกรูป', 'Choose photos')}<input hidden aria-label={t('เลือกรูปสำหรับ Passport สูงสุด 5 รูป', 'Choose up to five Passport photos')} type="file" accept="image/*" multiple disabled={locked || full} onChange={event => void add(event)}/></label><label className="button secondary small" role="button" tabIndex={locked || full ? -1 : 0} aria-disabled={locked || full} onKeyDown={keyboardPicker}><Camera size={17}/>{t('ถ่ายรูป', 'Take a photo')}<input hidden aria-label={t('ถ่ายรูปสำหรับ Passport', 'Take a Passport photo')} type="file" accept="image/*" capture="environment" disabled={locked || full} onChange={event => void add(event)}/></label></div>
    {error ? <p className="passport-inline-error" role="alert">{error}</p> : null}
    <div className="passport-photo-grid">{photos.map((photo, index) => <div className="passport-photo-ready" key={photo.mediaId}><img src={safeCarePhoto(photo.url, demo)} alt={t(`รูปสำหรับ Passport ${index + 1}`, `Passport photo ${index + 1}`)}/><button className="icon-button" disabled={locked} aria-label={t(`นำรูป Passport ${index + 1} ออก`, `Remove Passport photo ${index + 1}`)} onClick={() => onChange(photos.filter(item => item.mediaId !== photo.mediaId))}><X size={16}/></button><small><Check size={12}/>{t('พร้อมเลือกก่อนแชร์', 'Ready for review')}</small></div>)}{queue.map((photo, index) => <div className={`passport-photo-pending ${photo.state}`} key={photo.id}><img src={photo.preview} alt={t(`รูปที่กำลังเพิ่ม ${index + 1}`, `Pending photo ${index + 1}`)}/><button className="icon-button" disabled={locked} aria-label={t(`นำรูปที่ยังไม่ส่ง ${index + 1} ออก`, `Remove pending Passport photo ${index + 1}`)} onClick={() => removePending(photo.id)}><X size={16}/></button><small>{photo.state === 'failed' ? t('ยังส่งรูปไม่สำเร็จ', 'Upload interrupted') : t('กำลังเตรียมและส่งรูป', 'Preparing and uploading')}</small>{photo.state === 'failed' ? <><p>{photo.error instanceof Error && photo.error.message === 'INVALID_IMAGE' ? t('ใช้รูปที่อ่านได้ ขนาดไม่เกิน 8 MB', 'Use a readable photo no larger than 8 MB.') : messageOf(photo.error, locale)}</p><button className="text-button" disabled={locked} aria-label={t(`ลองส่งรูป Passport ${index + 1} ใหม่`, `Retry Passport photo ${index + 1}`)} onClick={() => void process([photo])}>{t('ลองส่งใหม่', 'Retry upload')}</button></> : null}</div>)}</div>
    {available.some(photo => !photos.some(item => item.mediaId === photo.mediaId)) ? <details className="passport-existing-photos"><summary>{t('เลือกรูปจากบันทึกที่โหลดแล้ว', 'Choose a photo from loaded updates')}</summary><div className="passport-photo-grid">{available.filter(photo => !photos.some(item => item.mediaId === photo.mediaId)).map((photo, index) => <button key={photo.mediaId} disabled={locked || full} aria-label={t(`เพิ่มรูปเดิม ${index + 1} ใน Passport`, `Add diary photo ${index + 1} to Passport`)} onClick={() => onChange([...photos, photo])}><img src={safeCarePhoto(photo.url, demo)} alt={t('รูปจากบันทึกของคุณ', 'Your diary photo')}/><PlusLabel text={t('เลือก', 'Select')}/></button>)}</div></details> : null}
    <small className="passport-privacy"><LockKeyhole size={14}/>{t('อัปโหลดเก็บเป็นส่วนตัว ยังไม่แชร์ ไม่อ่านรูปด้วย AI และไม่ใช้ฝึก PetID', 'Uploads stay private until you choose to share. No AI image reading or PetID training.')}</small>
  </section>;
}
function PlusLabel({ text }: { text: string }) { return <span>+ {text}</span>; }
