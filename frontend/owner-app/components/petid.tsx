'use client';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Camera, Check, Fingerprint, ImagePlus, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useLocale } from '../../shared/locale';
import { localizedHref } from '../../shared/locale-core';
import { uploadPetPhoto } from '../../shared/image-upload';
import { api, dateForLocale, json, messageOf } from '../../shared/api';
import { localizeStatus } from './status-copy';
import { canRegisterPetId, movePhoto, PETID_PHOTO_LIMIT, photoCapacity, photoFingerprint, type PetIdPhoto } from './petid-photo-state';
import type { Pet } from '../lib/types';
import { Busy, ErrorBox, Modal, Notice } from './ui';
import './petid-photos.css';
import PetIdResearch from './petid-research';

type Enrollment = { id: string; petId: string; description: string; status: string; searchMode: string; mediaId?: string; mediaIds?: string[]; photos?: { id: string; url: string }[] };
type Match = { id: string; petId: string; createdAt: string; ownerConfirmed: boolean | null; evidenceImageUrl?: string | null; evidence: { verification?: { observations?: string[]; limitations?: string } } };
type Candidate = { matchId: string; publicSlug: string; observations: string[]; limitations: string };
type SearchResult = { status: string; candidates: Candidate[]; qualityIssues?: string[]; notice?: string };
type DescriptionDraft = { description: string; qualityIssues: string[]; requiresReview: true; usable?: boolean; draftToken?: string };
type Translator = (thai: string, english: string) => string;
function openFileInput(event: KeyboardEvent<HTMLLabelElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.querySelector<HTMLInputElement>('input:not(:disabled)')?.click();
}

async function preparePetImage(file: File, t: Translator): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error(t('เลือกรูปภาพขนาดไม่เกิน 8 MB', 'Choose an image no larger than 8 MB.'));
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(t('อ่านรูปนี้ไม่ได้ ลองใช้รูป JPG, PNG หรือ WebP', 'This photo could not be opened. Try a JPG, PNG or WebP image.')); }
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('แปลงรูปไม่สำเร็จ', 'Could not prepare this image.'));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Re-encoding removes GPS and other camera metadata before upload.
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(t('แปลงรูปไม่สำเร็จ', 'Could not prepare this image.'))), 'image/jpeg', .85));
    if (blob.size > 3.5 * 1024 * 1024) throw new Error(t('รูปยังใหญ่เกินไป ลองครอปภาพแล้วเลือกใหม่', 'This photo is still too large. Crop it and choose it again.'));
    return blob;
  } finally { bitmap.close(); }
}
async function uploadPetImage(file: File, petId: string | undefined, t: Translator) {
  const form = new FormData();
  form.set('file', await preparePetImage(file, t), 'petid.jpg');
  if (petId) form.set('petId', petId);
  return api<{ id: string; url: string }>('/media/upload', { method: 'POST', body: form });
}

export default function PetId({ pet, demo }: { pet?: Pet; demo: boolean }) {
  const { locale, t } = useLocale();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PetIdPhoto[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [generatedFor, setGeneratedFor] = useState<string | null>(null);
  const [draftToken, setDraftToken] = useState<string | undefined>(undefined);
  const [qualityIssues, setQualityIssues] = useState<string[]>([]);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [imageFailures, setImageFailures] = useState<string[]>([]);
  const photosRef = useRef<PetIdPhoto[]>([]);
  const operation = useRef(0);
  const registrationAttempt = useRef<{ payload: string; key: string } | null>(null);
  const mounted = useRef(true);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const fingerprint = photoFingerprint(photos);
  const isGeneratedDraft = generatedFor !== null && generatedFor === fingerprint;

  function replacePhotos(next: PetIdPhoto[], changed = true) {
    const retained = new Set(next.map(photo => photo.url));
    for (const old of photosRef.current) if (old.local && !retained.has(old.url)) URL.revokeObjectURL(old.url);
    photosRef.current = next;
    setPhotos(next);
    setReviewed(false);
    setGeneratedFor(null);
    setDraftToken(undefined);
    setQualityIssues([]);
    setPhotosChanged(changed && description.trim().length > 0);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current++;
      for (const photo of photosRef.current) if (photo.local) URL.revokeObjectURL(photo.url);
    };
  }, []);
  useEffect(() => {
    const run = ++operation.current;
    for (const photo of photosRef.current) if (photo.local) URL.revokeObjectURL(photo.url);
    photosRef.current = [];
    setPhotos([]); setEnrollment(null); setMatches([]); setDescription('');
    setShowEnroll(false); setOptIn(false); setReviewed(false); setGeneratedFor(null); setDraftToken(undefined);
    setPhotosChanged(false); setQualityIssues([]); setError(''); setNotice(''); setResult(null); setBusy(false);
    registrationAttempt.current = null;
    if (demo || !pet) return;
    setBusy(true); setBusyLabel(t('กำลังโหลด PetID ของน้อง', 'Loading your pet’s PetID'));
    let cancelled = false;
    Promise.all([api<Enrollment[]>('/biometric/enrollments'), api<Match[]>('/biometric/matches')]).then(([enrollments, found]) => {
      if (!cancelled && mounted.current && run === operation.current) {
        const current = enrollments.find(item => item.petId === pet.id) || null;
        setEnrollment(current);
        setDescription(current?.description || '');
        setMatches(found.filter(item => item.petId === pet.id));
        const ids = current?.mediaIds?.length ? current.mediaIds : current?.mediaId ? [current.mediaId] : [];
        const existing = ids.map((id, index) => ({ id, url: current?.photos?.find(photo => photo.id === id)?.url || '', label: `PetID ${index + 1}` }));
        photosRef.current = existing;
        setPhotos(existing);
      }
    }).catch(caught => { if (!cancelled && run === operation.current) setError(messageOf(caught, localeRef.current)); }).finally(() => { if (!cancelled && mounted.current && run === operation.current) setBusy(false); });
    return () => { cancelled = true; };
  }, [pet?.id, demo]);

  function begin(label: string) { const run = ++operation.current; setBusy(true); setBusyLabel(label); setError(''); setNotice(''); return run; }
  function active(run: number) { return mounted.current && run === operation.current; }
  function finish(run: number) { if (active(run)) setBusy(false); }
  function openEnrollment() {
    setReviewed(false); setOptIn(false); setError(''); setNotice('');
    setShowEnroll(true);
  }
  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!pet || !selected.length || busy) return;
    if (selected.length > photoCapacity(photosRef.current.length)) {
      setError(t(`เลือกได้สูงสุด ${PETID_PHOTO_LIMIT} รูป กรุณาลดจำนวนรูปที่เลือก`, `Choose up to ${PETID_PHOTO_LIMIT} photos. Please select fewer images.`));
      return;
    }
    const run = begin(t('กำลังเตรียมรูปของน้อง', 'Preparing your pet’s photos'));
    const next = [...photosRef.current];
    try {
      for (const file of selected) {
        const media = demo
          ? { id: `demo-${crypto.randomUUID()}`, url: URL.createObjectURL(await preparePetImage(file, t)), local: true }
          : await uploadPetPhoto(file, pet.id, localeRef.current);
        if (!active(run)) { if ('local' in media) URL.revokeObjectURL(media.url); return; }
        next.push({ ...media, label: file.name });
        replacePhotos([...next]);
      }
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }
  async function generateDescription() {
    if (!pet || busy || photos.length === 0) return;
    if (demo) { setNotice(t('สร้างจุดสังเกตด้วย AI ได้หลังเข้าสู่ระบบจริง รูปในตัวอย่างจะอยู่เฉพาะในเบราว์เซอร์นี้', 'Sign in to generate identifying features with AI. Demo photos stay in this browser.')); return; }
    const captured = fingerprint;
    const run = begin(t('AI กำลังดูรูปทั้งหมดและเขียนจุดสังเกต', 'AI is reviewing all photos and drafting identifying features'));
    setReviewed(false);
    try {
      const draft = await api<DescriptionDraft>('/biometric/describe', json('POST', { petId: pet.id, mediaIds: photos.map(photo => photo.id) }));
      if (active(run)) {
        setDescription(draft.description); setQualityIssues(draft.qualityIssues || []);
        setGeneratedFor(captured); setDraftToken(draft.draftToken); setPhotosChanged(false);
        setNotice(t('แบบร่างพร้อมแล้ว แก้ไขจุดสังเกตให้ตรงกับน้อง แล้วตรวจทานก่อนลงทะเบียน', 'Your draft is ready. Edit the identifying features and review them before registering.'));
      }
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }
  async function register() {
    if (!pet || busy || !canRegisterPetId(photos, description, reviewed, optIn)) return;
    if (demo) { setNotice(t('การลงทะเบียน PetID ต้องเข้าสู่ระบบจริง รูปตัวอย่างจะไม่เข้าสู่ฐานค้นหา', 'Sign in to register PetID. Demo photos are never added to the search gallery.')); return; }
    const run = begin(t('กำลังลงทะเบียน PetID', 'Registering PetID'));
    try {
      const payload = { petId: pet.id, description: description.trim(), mediaIds: photos.map(photo => photo.id), searchMode: 'lost_only', ...(draftToken ? { draftToken } : {}) };
      const serialized = JSON.stringify(payload);
      if (registrationAttempt.current?.payload !== serialized) registrationAttempt.current = { payload: serialized, key: crypto.randomUUID() };
      const data = await api<Enrollment>('/biometric/enrollments', { ...json('POST', payload), headers: { 'Idempotency-Key': registrationAttempt.current.key } });
      if (active(run)) {
        setEnrollment(data); setShowEnroll(false); setPhotosChanged(false); setReviewed(false);
        setNotice(t('ลงทะเบียน PetID แล้ว เริ่มค้นหาได้เมื่อมีประกาศน้องหาย', 'PetID registered. Image search begins when a missing notice is active.'));
      }
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }
  async function identify(file: File) {
    if (demo) { setNotice(t('PetID ต้องเข้าสู่ระบบจริงและตั้งค่า AI ก่อน รูปในพื้นที่ตัวอย่างจะไม่เข้าสู่ฐานค้นหา', 'Sign in to use PetID. Demo photos are not added to the search gallery.')); return; }
    const run = begin(t('กำลังค้นหารูปน้องที่พบ', 'Searching for the found pet'));
    try {
      const media = await uploadPetImage(file, undefined, t);
      if (!active(run)) return;
      const found = await api<SearchResult>('/biometric/identify', json('POST', { mediaId: media.id }));
      if (active(run)) setResult(found);
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }
  async function refreshEvidence() {
    if (!pet) return;
    const run = begin(t('กำลังโหลดหลักฐานล่าสุด', 'Loading recent evidence'));
    try {
      const found = await api<Match[]>('/biometric/matches');
      if (active(run)) { setMatches(found.filter(item => item.petId === pet.id)); setImageFailures([]); }
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }
  async function confirmMatch(matchId: string, confirmed: boolean) {
    const run = begin(t('กำลังบันทึกการตรวจสอบ', 'Saving your review'));
    try {
      await api(`/biometric/matches/${matchId}/confirm`, json('POST', { confirmed }));
      if (active(run)) {
        setMatches(current => current.map(item => item.id === matchId ? { ...item, ownerConfirmed: confirmed } : item));
        if (confirmed) setNotice(t('บันทึกว่าเจ้าของยืนยันผลนี้แล้ว การปิดประกาศหายทำแยกเมื่อรับน้องกลับบ้านจริง', 'Owner confirmation saved. Close the missing notice separately once your pet is actually home.'));
      }
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }
  async function withdraw() {
    if (!enrollment || !window.confirm(t('ถอน PetID เพื่อให้น้องออกจากฐานค้นหารูปหรือไม่?', 'Withdraw PetID and remove your pet from image search?'))) return;
    const run = begin(t('กำลังถอน PetID', 'Withdrawing PetID'));
    try {
      await api(`/biometric/enrollments/${enrollment.id}`, { method: 'DELETE' });
      if (active(run)) {
        setEnrollment(null); setMatches([]); replacePhotos([], false); setImageFailures([]); setDescription('');
        setNotice(t('ถอน PetID แล้ว น้องจะไม่เข้าสู่ฐานค้นหารูป', 'PetID withdrawn. Your pet is no longer in the image-search gallery.'));
      }
    } catch (caught) { if (active(run)) setError(messageOf(caught, localeRef.current)); }
    finally { finish(run); }
  }

  return <section className="petid-section">
    <div className="petid-process"><span className="eyebrow">{t('ช่วยกันพาน้องกลับบ้าน', 'Help them get home together')}</span><ol>
      <li><span>01</span>{t('เลือกรูปที่เห็นน้องชัด', 'Choose clear photos')}</li>
      <li><span>02</span>{t('ดูประกาศที่อาจตรงกัน', 'Review possible notices')}</li>
      <li><span>03</span>{t('ให้เจ้าของตรวจและยืนยัน', 'Let the owner check and confirm')}</li>
    </ol></div>
    <div className="settings-grid" style={!pet ? { gridTemplateColumns: '1fr' } : undefined}>
      {pet ? <article className="panel">
        <div className="card-title"><span className="icon-tile"><Fingerprint/></span><div><h2>{t(`PetID ของ${pet.name}`, `PetID for ${pet.name}`)}</h2><p className="muted">{t('ค้นรูปที่อาจคล้ายกัน เมื่อน้องหาย', 'Find similar-looking pets when yours is missing.')}</p></div></div>
        <p className="small-copy muted">{t('รวมรูปน้องได้สูงสุด 5 รูป ให้ AI ช่วยเขียนจุดสังเกต แล้วคุณตรวจแก้ก่อนลงทะเบียน', 'Add up to five photos, let AI draft identifying features, then review and edit them before registration.')}</p>
        {enrollment ? <Notice>{t('สถานะ ', 'Status: ')}{enrollment.status === 'ready' ? t('พร้อมค้นหาเมื่อมีประกาศหาย', 'Ready to search when a missing notice is active') : t('รอรูปที่ใช้ค้นหาได้', 'Waiting for searchable photos')} · {enrollment.searchMode === 'lost_only' ? t('อนุญาตเมื่อมีประกาศหาย', 'Allowed during an active missing notice') : t('ปิดการค้นหา', 'Search off')}</Notice> : null}
        {enrollment && photos.length ? <div className="petid-reference-summary"><div className="petid-reference-stack" aria-hidden="true">{photos.filter(photo => photo.url).slice(0, 3).map(photo => <img src={photo.url} alt="" key={photo.id}/>)}</div><span>{t(`รูปอ้างอิง ${photos.length} รูป`, `${photos.length} reference ${photos.length === 1 ? 'photo' : 'photos'}`)}</span></div> : null}
        <button className="button secondary full" disabled={busy} onClick={openEnrollment}><Camera size={17}/>{enrollment ? t('อัปเดตรูปและข้อมูล PetID', 'Update PetID photos and details') : t('ลงทะเบียน PetID', 'Register PetID')}</button>
        {enrollment ? <button className="text-button danger" disabled={busy} onClick={() => void withdraw()}><Trash2 size={15}/>{t('ถอน PetID', 'Withdraw PetID')}</button> : null}
      </article> : null}
      <article className="panel petid-finder">
        <div className="card-title"><span className="icon-tile"><Search/></span><div><h2>{t('พบสัตว์ที่กำลังหาบ้าน?', 'Found a pet looking for home?')}</h2><p className="muted">{t('ลองค้นกับประกาศที่เปิดอยู่', 'Search active missing-pet notices.')}</p></div></div>
        <p className="small-copy muted">{t('ถ่ายให้เห็นหน้าหรือจุดสังเกตชัด ผลเป็นเพียงตัวที่อาจคล้ายกัน ต้องให้เจ้าของยืนยัน ไม่ใช่หลักฐานตัวตน', 'Use a clear face or distinctive marking. Results show possible matches and require owner confirmation. They are not proof of identity.')}</p>
        <label className="button secondary full upload-label" role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} onKeyDown={openFileInput}><Upload size={17}/>{t('เลือกรูปน้องที่พบ', 'Choose a photo of the found pet')}<input type="file" accept="image/*" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void identify(file); event.target.value = ''; }}/></label>
      </article>
    </div>
    {!showEnroll && error ? <ErrorBox message={error}/> : null}
    {!showEnroll && notice ? <Notice>{localizeStatus(notice, locale)}</Notice> : null}
    {!showEnroll && busy ? <Busy label={busyLabel}/> : null}
    {result ? <section className="panel" style={{ marginTop: 22 }}>
      <h3>{result.status === 'possible' ? t('มีรูปที่อาจคล้ายกัน', 'There are possible matches') : result.status === 'insufficient' ? t('รูปนี้ยังใช้เปรียบเทียบไม่ได้', 'This photo cannot be compared yet') : t('ยังไม่พบในประกาศที่เปิดอยู่', 'No match in active notices yet')}</h3>
      <Notice>{result.notice || t('ผลจาก AI เป็นเพียงตัวที่อาจคล้ายกัน ต้องให้เจ้าของยืนยันทุกครั้ง', 'AI results are possible matches only. The owner must confirm every match.')}</Notice>
      {result.qualityIssues?.map((issue, index) => <p className="small-copy muted" key={index}>{issue}</p>)}
      {result.candidates.map(candidate => <article className="memory-card" key={candidate.matchId}><div style={{ flex: 1 }}>{candidate.observations.map((observation, index) => <p key={index}>{observation}</p>)}<p>{candidate.limitations}</p><Link className="text-button" href={localizedHref(`/lost/${candidate.publicSlug}`, locale)} target="_blank">{t('ดูประกาศและส่งเบาะแส', 'View notice and send a tip')}</Link></div></article>)}
    </section> : null}
    {matches.length > 0 && pet ? <section className="panel" style={{ marginTop: 22 }}>
      <div className="section-title" style={{ marginTop: 0 }}><h3 style={{ margin: 0 }}>{t(`รูปที่อาจเป็น${pet.name}`, `Photos that may show ${pet.name}`)}</h3><button className="text-button" disabled={busy} onClick={() => void refreshEvidence()}>{t('โหลดหลักฐานล่าสุด', 'Refresh evidence')}</button></div>
      <Notice>{t('เปรียบเทียบรูป จุดสังเกต และเบาะแสด้วยตัวเองก่อนยืนยัน อย่าโอนเงินเพียงเพราะผลค้นรูป', 'Compare the photo, identifying marks and tips yourself before confirming. Do not transfer money based only on a search result.')}</Notice>
      {matches.map(match => <article className="memory-card" key={match.id}><div style={{ flex: 1 }}>
        {match.evidenceImageUrl && !imageFailures.includes(match.id) ? <img className="ocr-source" alt={t('รูปสัตว์ที่พบเพื่อให้เจ้าของตรวจสอบ', 'Found-pet photo for the owner to review')} src={match.evidenceImageUrl} onError={() => setImageFailures(current => current.includes(match.id) ? current : [...current, match.id])}/> : <Notice>{t('รูปหลักฐานไม่พร้อมแสดง ลองโหลดหลักฐานล่าสุดก่อนเปรียบเทียบ ', 'Evidence photo unavailable. Refresh it before comparing.')}<button className="text-button" disabled={busy} onClick={() => void refreshEvidence()}>{t('โหลดล่าสุด', 'Refresh')}</button></Notice>}
        <b style={{ fontSize: 12 }}>{t('ค้นเมื่อ ', 'Searched ')}{dateForLocale(match.createdAt, locale)}</b>
        {match.evidence.verification?.observations?.map((observation, index) => <p key={index}>{observation}</p>)}<p>{match.evidence.verification?.limitations}</p>
        <div className="form-actions"><button className="button secondary small" disabled={busy || match.ownerConfirmed === true} onClick={() => void confirmMatch(match.id, true)}><Check size={15}/>{match.ownerConfirmed === true ? t('เจ้าของยืนยันแล้ว', 'Owner confirmed') : t('เป็นน้องของฉัน', 'This is my pet')}</button><button className="button secondary small" disabled={busy || match.ownerConfirmed === false} onClick={() => void confirmMatch(match.id, false)}><X size={15}/>{match.ownerConfirmed === false ? t('ยืนยันว่าไม่ใช่', 'Confirmed not a match') : t('ไม่ใช่น้องของฉัน', 'Not my pet')}</button></div>
      </div></article>)}
    </section> : null}
    {pet ? <PetIdResearch key={pet.id} pet={pet} demo={demo}/> : null}
    {showEnroll && pet ? <Modal className="petid-enrollment-modal" title={t(`PetID ของ${pet.name}`, `PetID for ${pet.name}`)} onClose={() => setShowEnroll(false)}>
      <div className="petid-registration-intro"><ShieldCheck size={22}/><div><b>{t('ให้รูปเล่าเอกลักษณ์ของน้อง', 'Let their photos tell their story')}</b><p>{t('เลือกรูป → เขียนจุดสังเกต → ตรวจทานและลงทะเบียน', 'Choose photos → draft identifying features → review and register')}</p></div></div>
      <section className="petid-registration-step" aria-labelledby="petid-photo-heading">
        <div className="petid-step-heading"><h3 id="petid-photo-heading"><span>1</span>{t('รูปของน้อง', 'Your pet’s photos')}</h3><span className="small-tag" role="status">{t(`${photos.length} / ${PETID_PHOTO_LIMIT} รูป`, `${photos.length} / ${PETID_PHOTO_LIMIT} photos`)}</span></div>
        <p className="small-copy muted">{t('เพิ่มทีละรูปหรือเลือกหลายรูป ให้เห็นใบหน้า ลายขน และจุดเด่น รูปแรกเป็นรูปอ้างอิงหลัก', 'Add photos one at a time or select several. Include the face, coat pattern and distinctive marks. The first photo is the main reference.')}</p>
        {photos.length ? <ol className="petid-photo-grid" aria-label={t('รูปอ้างอิง PetID', 'PetID reference photos')}>{photos.map((photo, index) => <li className="petid-photo-card" key={photo.id}>
          <div className="petid-photo-preview">{photo.url ? <img src={photo.url} alt={t(`รูปอ้างอิง PetID ${index + 1}`, `PetID reference photo ${index + 1}`)}/> : <div className="petid-photo-unavailable"><Camera size={24}/><span>{t('รูปเดิม', 'Existing photo')}</span></div>}<span className="petid-photo-number">{index + 1}</span>{index === 0 ? <span className="petid-primary-badge">{t('รูปหลัก', 'Main photo')}</span> : null}</div>
          <div className="petid-photo-controls"><button type="button" className="icon-button" disabled={busy || index === 0} aria-label={t(`ย้ายรูป ${index + 1} ไปก่อนหน้า`, `Move photo ${index + 1} earlier`)} onClick={() => replacePhotos(movePhoto(photos, index, -1))}><ArrowLeft size={17}/></button><button type="button" className="icon-button" disabled={busy || index === photos.length - 1} aria-label={t(`ย้ายรูป ${index + 1} ไปถัดไป`, `Move photo ${index + 1} later`)} onClick={() => replacePhotos(movePhoto(photos, index, 1))}><ArrowRight size={17}/></button><button type="button" className="icon-button danger" disabled={busy} aria-label={t(`ลบรูป ${index + 1}`, `Remove photo ${index + 1}`)} onClick={() => replacePhotos(photos.filter(item => item.id !== photo.id))}><Trash2 size={17}/></button></div>
        </li>)}</ol> : <div className="petid-photo-empty"><Camera size={30}/><p>{t('เก็บรูปน้องให้ครบทุกมุมที่จำได้', 'Collect the little details that make them unique')}</p></div>}
        <div className="petid-photo-add-actions">
          <label className={`button secondary upload-label${photos.length >= PETID_PHOTO_LIMIT || busy ? ' petid-upload-disabled' : ''}`} role="button" tabIndex={busy || photos.length >= PETID_PHOTO_LIMIT ? -1 : 0} aria-disabled={busy || photos.length >= PETID_PHOTO_LIMIT} onKeyDown={openFileInput}><ImagePlus size={18}/>{t('เลือกรูป', 'Choose photos')}<input type="file" accept="image/*" multiple hidden aria-label={t('เลือกรูป PetID สูงสุด 5 รูป', 'Choose up to five PetID photos')} disabled={busy || photos.length >= PETID_PHOTO_LIMIT} onChange={event => void addPhotos(event)}/></label>
          <label className={`button secondary upload-label${photos.length >= PETID_PHOTO_LIMIT || busy ? ' petid-upload-disabled' : ''}`} role="button" tabIndex={busy || photos.length >= PETID_PHOTO_LIMIT ? -1 : 0} aria-disabled={busy || photos.length >= PETID_PHOTO_LIMIT} onKeyDown={openFileInput}><Camera size={18}/>{t('ถ่ายเพิ่ม', 'Take a photo')}<input type="file" accept="image/*" capture="environment" hidden aria-label={t('ถ่ายรูปเพิ่มสำหรับ PetID', 'Take another PetID photo')} disabled={busy || photos.length >= PETID_PHOTO_LIMIT} onChange={event => void addPhotos(event)}/></label>
        </div>
      </section>
      <section className="petid-registration-step" aria-labelledby="petid-description-heading">
        <div className="petid-step-heading"><h3 id="petid-description-heading"><span>2</span>{t('จุดสังเกตของน้อง', 'Identifying features')}</h3>{isGeneratedDraft ? <span className="small-tag">{t('แบบร่างจาก AI', 'AI draft')}</span> : null}</div>
        <button type="button" className="button full petid-generate" disabled={busy || photos.length === 0} onClick={() => void generateDescription()}><Sparkles size={18}/>{description.trim() ? t('ให้ AI เขียนใหม่จากรูปทั้งหมด', 'Regenerate from all photos') : t('ให้ AI เขียนจากรูปทั้งหมด', 'Generate from all photos')}</button>
        <label className="field">{t('ตรวจแก้จุดสังเกตให้ตรงกับน้อง', 'Review and edit identifying features')}<textarea required rows={5} maxLength={3000} disabled={busy} value={description} onChange={event => { setDescription(event.target.value); setReviewed(false); }} placeholder={t('ให้ AI ช่วยเขียน หรือระบุสี ลายขน จุดเด่น ใบหน้า และปลอกคอด้วยตัวเอง', 'Ask AI to draft this, or describe the colour, coat pattern, face, distinctive marks and collar yourself.')}/></label>
        {photosChanged ? <p className="petid-draft-reminder">{t('รูปเปลี่ยนแล้ว ให้ AI เขียนใหม่ หรือแก้จุดสังเกตให้ตรงกับชุดรูปนี้ก่อนตรวจทาน', 'The photos changed. Generate a fresh draft or edit the description to match this selection before reviewing.')}</p> : null}
        {qualityIssues.length ? <aside className="petid-quality-note"><b>{t('สิ่งที่ควรตรวจเพิ่มเติม', 'Things to check')}</b><ul>{qualityIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></aside> : null}
      </section>
      <section className="petid-registration-step" aria-labelledby="petid-review-heading">
        <div className="petid-step-heading"><h3 id="petid-review-heading"><span>3</span>{t('ตรวจทานก่อนลงทะเบียน', 'Review before registration')}</h3></div>
        <div className="petid-consent-notes"><ul><li>{t('OpenAI ประมวลผลรูปและจุดสังเกตเพื่อค้นหารูปที่อาจคล้ายกัน', 'OpenAI processes these photos and identifying features to find possible visual matches.')}</li><li>{t('น้องจะเข้าสู่ฐานค้นหาเฉพาะเมื่อคุณอนุญาตและมีประกาศหายที่เปิดอยู่', 'Your pet is searchable only with your permission and an active missing notice.')}</li><li>{t('ผลค้นหาไม่ยืนยันตัวตน เจ้าของต้องตรวจรูปและเบาะแสทุกครั้ง', 'Search does not prove identity. The owner must review the photos and tips each time.')}</li></ul></div>
        <label className="check-field"><input type="checkbox" disabled={busy || !description.trim() || photos.length === 0} checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>{t('ฉันตรวจรูปและแก้จุดสังเกตให้ตรงกับน้องแล้ว', 'I have reviewed the photos and corrected the identifying features.')}</label>
        <label className="check-field"><input type="checkbox" disabled={busy} checked={optIn} onChange={event => setOptIn(event.target.checked)}/>{t('อนุญาตให้น้องเข้าสู่ฐานค้นหาเมื่อมีประกาศน้องหาย', 'Allow image search when my pet has an active missing notice.')}</label>
      </section>
      {error ? <ErrorBox message={error}/> : null}
      {notice ? <Notice>{localizeStatus(notice, locale)}</Notice> : null}
      {busy ? <Busy label={busyLabel}/> : null}
      <div className="petid-register-footer"><button type="button" className="button full" disabled={busy || !canRegisterPetId(photos, description, reviewed, optIn)} onClick={() => void register()}><Fingerprint size={18}/>{t('ลงทะเบียน PetID', 'Register PetID')}</button><p>{t('รูปเป็นส่วนตัว ไม่แสดงในประกาศสาธารณะโดยอัตโนมัติ', 'These photos stay private and are not automatically published in a missing-pet notice.')}</p></div>
    </Modal> : null}
  </section>;
}
