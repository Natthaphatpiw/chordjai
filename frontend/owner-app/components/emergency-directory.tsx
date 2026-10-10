'use client';
import { useEffect, useState } from 'react';
import { MapPin, Phone, Building2 } from 'lucide-react';
import { api } from '../../shared/api';
import { useLocale } from '../../shared/locale';
import type { Clinic } from '../lib/types';
import { Empty, Notice } from './ui';

export default function EmergencyDirectory() {
  const { locale, t } = useLocale();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [cached, setCached] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = JSON.parse(localStorage.getItem('chordjai.emergency.clinics.v1') || 'null') as { clinics: Clinic[]; at: number } | null;
      if (stored && Array.isArray(stored.clinics)) { setClinics(stored.clinics); setCached(true); }
    } catch { /* Ignore malformed cache. */ }
    api<Clinic[]>('/clinics', {}, true).then(data => {
      const next = data.filter(item => item.is24h);
      if (!cancelled) {
        setClinics(next); setCached(false);
        try { localStorage.setItem('chordjai.emergency.clinics.v1', JSON.stringify({ clinics: next, at: Date.now() })); } catch { /* Guidance remains available when storage is full. */ }
      }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Explicit language in the URL keeps offline reloads independent of cookies.
    const url = new URL(window.location.href);
    if (url.searchParams.get('lang') !== locale) {
      url.searchParams.set('lang', locale);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker.register('/emergency-sw.js', { scope: '/emergency' }).then(() => navigator.serviceWorker.ready).then(registration => {
      if (cancelled) return;
      const assets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"],link[rel="preload"][as="font"]')).map(node => node instanceof HTMLScriptElement ? node.src : node.href).filter(url => new URL(url).pathname.startsWith('/_next/static/'));
      registration.active?.postMessage({ type: 'CACHE_ASSETS', assets });
      registration.active?.postMessage({ type: 'CACHE_EMERGENCY', locale });
    }).catch(() => { /* Guidance remains visible without worker support. */ });
    return () => { cancelled = true; };
  }, [locale]);

  return <section className="panel emergency-directory"><h2>{t('ค้นโรงพยาบาลสัตว์ 24 ชั่วโมง', 'Find a 24-hour veterinary hospital')}</h2><Notice>{cached ? t('กำลังใช้รายชื่อที่เคยบันทึกในเครื่อง ', 'Showing the directory previously saved on this device. ') : ''}{t('โทรยืนยันเวลาทำการและแจ้งอาการก่อนเดินทาง หากไม่มีรายชื่อในระบบ ให้ค้นโรงพยาบาลที่ใกล้ที่สุดผ่านแผนที่', 'Call ahead to confirm opening hours and describe the symptoms. If no hospital is listed, use the map to find the nearest one.')}</Notice>{clinics.length ? <div className="clinic-grid">{clinics.map(clinic => <article className="clinic-card" key={clinic.id}><h3>{clinic.name}</h3><p>{clinic.address || clinic.district}</p><div className="clinic-card-actions">{clinic.phone ? <a className="button secondary" href={`tel:${clinic.phone.replace(/[^+0-9]/g, '')}`}><Phone size={17}/>{t('โทรทันที', 'Call now')}</a> : null}<a className="button secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.lat != null && clinic.lng != null ? `${clinic.lat},${clinic.lng}` : clinic.name)}`} target="_blank" rel="noreferrer"><MapPin size={17}/>{t('นำทาง', 'Directions')}</a></div></article>)}</div> : <Empty icon={<Building2 size={30}/>} title={failed ? t('โหลดรายชื่อโรงพยาบาลไม่ได้', 'The hospital directory could not be loaded') : t('ยังไม่มีรายชื่อที่ตรวจสอบแล้ว', 'No verified hospitals are listed yet')} detail={t('คำแนะนำฉุกเฉินด้านบนยังเปิดอ่านได้', 'You can still read the emergency guidance above.')}/>}<a className="button full" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t('โรงพยาบาลสัตว์ 24 ชั่วโมง ใกล้ฉัน', '24 hour veterinary hospital near me'))}`} target="_blank" rel="noreferrer"><MapPin size={18}/>{t('ค้นโรงพยาบาลสัตว์ใกล้ฉัน', 'Find a veterinary hospital near me')}</a><p className="small-copy muted" style={{ marginTop: 16, marginBottom: 0 }}>{t('หน้าแนะนำนี้ไม่ต้องล็อกอิน หากเคยเปิดหน้านี้แล้ว เบราว์เซอร์ที่รองรับจะเก็บข้อมูลสำหรับเปิดอ่านเมื่อออฟไลน์', 'No sign-in is needed for this guidance. After you visit, supported browsers save it for offline reading.')}</p></section>;
}
