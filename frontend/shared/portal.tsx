'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, CalendarDays, Check, Clock3,
  FileHeart, Hospital, Layers, LogOut, Plus, PawPrint, Play, RefreshCw, Search,
  ShieldCheck, Trash2, Users, X, ChartNoAxesCombined, CircleHelp, Fingerprint,
  MessageSquare, ArrowUpRight, AlertCircle, BookOpen, SlidersHorizontal,
} from 'lucide-react';
import { api, json, lineLogin, autoLineLogin, clearLineSession, ApiError, messageOf, dateForLocale } from './api';
import { useLocale, LanguageSwitcher } from './locale';
import { CareSummary,type ClinicalCareEntry } from './care-summary';
import { translate, localizedHref, type Locale } from './locale-core';

type PortalKind = 'clinic' | 'admin';
type Translator = (thai: string, english: string) => string;
type Notice = [string, string] | null;
type User = { id: string; displayName: string; role: string };
type Membership = { clinicId: string; name: string; role: string };
type Appointment = { id: string; clinicId: string; petId: string; requestedAt: string; reason: string; status: string };
type HealthRecord = { id?: string; kind: string; title: string; recordedAt: string; nextDueAt?: string; notes?: string; value?: number };
type Summary = { pet: { name: string; species: string; sex: string; weightKg?: number }; records: HealthRecord[];careEntries?:ClinicalCareEntry[];careAccess?:boolean;careTruncated?:boolean };
type Kpis = {
  users: number; pets: number; healthRecords: number; summaryViews: number; clinics: number;
  triageSessions: number; activeLostCases: number; journalPages: number; conversations: number;
  aiCostTodayUsd: number; deadJobs: number;
  care?:{diaryAuthors:number;diaryEntries:number;diaryPets:number;entriesLast7Days:number;activePetsLast30Days:number;recordedPetWeeksLast30Days:number;repeatWeekPetsLast30Days:number;activeEpisodes:number;episodesWithFollowup:number;visits:number;visitsWithRecordedCosts:number;visitsWithAttachments:number;entriesEnabledForClinicalSharing:number};
  petid?:{enrolledPets:number;availableReferencePhotos:number;petsWithMultipleReferencePhotos:number};
  readiness?: { clinicalEval: string; petidCalibration: string; retentionCohort: string };
};
type Job = { id: string; topic: string; status: string; attempts: number; maxAttempts: number; runAt: string; lastError?: string };
type AiRequest = { id: string; feature: string; model: string; modelResolved?: string; inputTokens: number; outputTokens: number; latencyMs: number; costUsd: number; status: string; createdAt: string };
type Clinic = { id: string; name: string; district: string; phone: string; address: string; is24h: boolean };
const clinicTabs = (t: Translator) => [
  { id: 'appointments', label: t("คำขอนัด", "Appointments"), icon: CalendarDays, help: t("เริ่มจากคำขอของเจ้าของ แล้วเตรียมการดูแลให้พร้อม", "Start with the owner's request and prepare for their pet's care.") },
  { id: 'summary', label: t("สมุดสุขภาพ", "Health journal"), icon: FileHeart, help: t("ข้อมูลที่เจ้าของเลือกให้คลินิกอ่าน เพื่อดูแลต่อได้อย่างเข้าใจ", "Records the owner has shared, so your clinic can continue their care.") },
  { id: 'membership', label: t("คลินิกของฉัน", "My clinics"), icon: Hospital, help: t("พื้นที่ทำงานและสิทธิ์ที่คุณได้รับในแต่ละคลินิก", "Your workspace and access within each clinic.") },
];
const adminTabs = (t: Translator) => [
  { id: 'overview', label: t("ภาพรวม", "Overview"), icon: ChartNoAxesCombined, help: t("มองเห็นการใช้งาน และเรื่องที่ควรลงมือดูแลต่อ", "See how ChordJai is used and what needs your attention.") },
  { id: 'ai', label: t("การทำงานของ AI", "AI activity"), icon: Activity, help: t("ตรวจการเรียกใช้ เวลา และต้นทุน โดยไม่เปิดข้อความของผู้ใช้", "Review requests, timings, and costs without opening private user messages.") },
  { id: 'jobs', label: t("งานเบื้องหลัง", "Background jobs"), icon: Layers, help: t("ดูสถานะการส่งงาน และช่วยงานที่ทำไม่สำเร็จกลับไปทำต่อ", "Check job delivery and give unsuccessful jobs another attempt.") },
  { id: 'clinics', label: t("เครือข่ายคลินิก", "Clinic network"), icon: Hospital, help: t("ข้อมูลติดต่อที่ตรวจสอบแล้ว เพื่อให้เจ้าของหาความช่วยเหลือได้", "Verified contact details so owners can find care.") },
];
const appointmentFilters = (t: Translator) => [
  { value: 'requested', label: t("รอตอบรับ", "Pending") }, { value: 'accepted', label: t("ตอบรับแล้ว", "Accepted") }, { value: 'all', label: t("ทั้งหมด", "All") },
];

export default function Portal({ kind }: { kind: PortalKind }) {
  const { locale, t } = useLocale();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState(kind === 'clinic' ? 'appointments' : 'overview');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [requests, setRequests] = useState<AiRequest[]>([]);
  const [petId, setPetId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryCosts,setSummaryCosts]=useState(false);
  const [appointmentFilter, setAppointmentFilter] = useState('requested');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState('all');
  const [aiFilter, setAiFilter] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const asyncEpoch = useRef(0);
  const mounted = useRef(false);
  function current(run: number) { return mounted.current && run === asyncEpoch.current; }

  useEffect(() => {
    mounted.current = true;
    const run = ++asyncEpoch.current;
    async function bootstrap() {
      setBusy(true); setAuthChecking(true);
      try {
        if (sessionStorage.getItem('chordjai.session')) await establish(run);
        else if (await autoLineLogin(process.env.NEXT_PUBLIC_LIFF_ID || '')) { if (current(run)) await establish(run); }
      } catch (caught) { if (current(run)) setError(caught); }
      finally { if (current(run)) { setBusy(false); setAuthChecking(false); } }
    }
    void bootstrap();
    return () => { mounted.current = false; asyncEpoch.current++; };
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const revealActive = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const item = active.getBoundingClientRect(), frame = nav.getBoundingClientRect();
      if (item.left < frame.left) nav.scrollLeft -= frame.left - item.left;
      else if (item.right > frame.right) nav.scrollLeft += item.right - frame.right;
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [tab, user, locale]);

  async function establish(run = ++asyncEpoch.current) {
    setBusy(true); setError('');
    try {
      const profile = await api<User>('/identity/me');
      if (!current(run)) return;
      if (kind === 'admin' && profile.role !== 'admin') {
        throw new PortalUiError('บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแลระบบ กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์', 'This account does not have administrator access. Contact an administrator to request access.');
      }
      if (kind === 'clinic') {
        const [roles, data] = await Promise.all([api<Membership[]>('/clinic/memberships'), api<Appointment[]>('/clinic/appointments')]);
        if (!current(run)) return;
        if (!roles.length) throw new PortalUiError('บัญชีนี้ยังไม่ได้รับสิทธิ์ในคลินิก กรุณาติดต่อผู้ดูแลคลินิก', 'This account does not have clinic access. Contact your clinic administrator.');
        const clinicIds = new Set(roles.map(role => role.clinicId));
        setMemberships(roles); setAppointments(data.filter(item => clinicIds.has(item.clinicId)));
      } else {
        const [data, queue, logs] = await Promise.all([api<Kpis>('/analytics/kpis'), api<Job[]>('/analytics/jobs'), api<AiRequest[]>('/analytics/ai-requests')]);
        if (!current(run)) return;
        setKpis(data); setJobs(queue); setRequests(logs);
      }
      if (current(run)) { setUser(profile); setUpdatedAt(new Date().toISOString()); }
    } catch (caught) {
      if (current(run)) {
        // api() already attempted renewal once. Never start a second exchange.
        if (caught instanceof ApiError && caught.status === 401) { clearLineSession(); setUser(null); }
        setError(caught);
      }
    } finally { if (current(run)) setBusy(false); }
  }

  async function login() {
    const run = ++asyncEpoch.current;
    setBusy(true); setError('');
    try { await lineLogin(process.env.NEXT_PUBLIC_LIFF_ID || ''); if (current(run)) await establish(run); }
    catch (caught) { if (current(run)) setError(caught); }
    finally { if (current(run)) setBusy(false); }
  }

  function selectTab(next: string) {
    setTab(next); setError(''); setNotice(null);
  }

  function logout() {
    asyncEpoch.current++; clearLineSession(); setBusy(false); setAuthChecking(false);
    setUser(null); setMemberships([]); setAppointments([]); setSummary(null);
    setKpis(null); setJobs([]); setRequests([]); setError(''); setNotice(null); setUpdatedAt(null);
  }

  async function changeAppointment(id: string, status: string) {
    const run = asyncEpoch.current;
    setBusy(true); setError(''); setNotice(null);
    try {
      await api(`/clinic/appointments/${id}`, json('PATCH', { status }));
      if (!current(run)) return;
      setAppointments(current => current.map(item => item.id === id ? { ...item, status } : item));
      setNotice(status === 'accepted' ? ["ตอบรับคำขอนัดแล้ว", "Appointment accepted"] : status === 'completed' ? ["บันทึกว่าตรวจแล้วเรียบร้อย", "Appointment marked as completed"] : ["อัปเดตสถานะคำขอแล้ว", "Appointment status updated"]);
    } catch (caught) { if(current(run))setError(caught); }
    finally { if(current(run))setBusy(false); }
  }

  async function openSummary(id: string) {
    const run = asyncEpoch.current;
    selectTab('summary'); setPetId(id); setSummary(null); setBusy(true);
    try { const data=await api<Summary>(`/clinic/pets/${encodeURIComponent(id.trim())}/summary?includeCosts=${summaryCosts}`); if(current(run))setSummary(data); }
    catch (caught) { if(current(run))setError(caught); }
    finally { if(current(run))setBusy(false); }
  }

  async function jobAction(id: string, action: 'replay' | 'discard') {
    const run = asyncEpoch.current;
    if (action === 'discard' && !window.confirm(t("ทิ้งงานนี้หรือไม่? งานจะไม่ถูกนำกลับไปทำต่อ", "Discard this job? It will not be processed again."))) return;
    setBusy(true); setError(''); setNotice(null);
    try {
      await api(`/analytics/jobs/${id}/${action}`, { method: 'POST' });
      if (!current(run)) return;
      setJobs(current => action === 'discard' ? current.filter(item => item.id !== id) : current.map(item =>
        item.id === id ? { ...item, status: 'queued', attempts: 0, lastError: undefined } : item));
      setKpis(current => current ? { ...current, deadJobs: Math.max(0, current.deadJobs - 1) } : current);
      setNotice(action === 'replay' ? ["นำงานกลับเข้าคิวแล้ว", "Job queued again"] : ["ทิ้งงานแล้ว", "Job discarded"]);
    } catch (caught) { if(current(run))setError(caught); }
    finally { if(current(run))setBusy(false); }
  }

  if (authChecking) return <main className="portal-login"><div className="portal-loading" role="status"><span />{t('กำลังเปิดพื้นที่ทำงาน…', 'Opening your workspace…')}</div></main>;
  if (!user) return <PortalLogin kind={kind} busy={busy} error={error} onLogin={() => void login()} />;

  const tabs = kind === 'clinic' ? clinicTabs(t) : adminTabs(t);
  const currentTab = tabs.find(item => item.id === tab) || tabs[0];
  const filteredAppointments = appointments.filter(item => appointmentFilter === 'all' || item.status === appointmentFilter);
  const filteredJobs = jobs.filter(item => jobFilter === 'all' || item.status === jobFilter);
  const filteredRequests = requests.filter(item => !aiFilter || `${item.feature} ${featureLabel(item.feature, t)} ${item.model} ${item.status} ${statusLabel(item.status, t, 'ai')}`.toLowerCase().includes(aiFilter.toLowerCase()));

  return <div className={`portal-shell portal-${kind}`}>
    <a className="portal-skip-link" href="#portal-content">{t("ข้ามไปเนื้อหา", "Skip to content")}</a>
    <aside className="portal-sidebar">
      <a href={localizedHref('/app', locale)} className="portal-logo" aria-label={t("ชิดใจ หน้าหลัก", "ChordJai home")}><PawPrint size={25} /><span>{t("ชิดใจ", "ChordJai")}<small>chordjai</small></span></a>
      <div className="portal-workspace"><span>{kind === 'clinic' ? t("พื้นที่คลินิก", "Clinic workspace") : t("ผู้ดูแลระบบ", "Administrator")}</span><small>{kind === 'clinic' ? t("การดูแลที่ต่อเนื่อง", "Continuity of care") : t("ดูแลให้ทุกส่วนพร้อมใช้งาน", "Keep every part ready")}</small></div>
      <nav ref={navRef} aria-label={kind === 'clinic' ? t("เมนูคลินิก", "Clinic menu") : t("เมนูผู้ดูแล", "Administrator menu")}>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => selectTab(id)}><Icon size={19} /><span>{label}</span>{id === 'jobs' && jobs.some(item => item.status === 'dead') ? <span className="portal-nav-count">{jobs.filter(item => item.status === 'dead').length}</span> : null}</button>)}
      </nav>
      <div className="portal-sidebar-bottom">
        <a className="portal-owner-link" href={ownerHref(locale)}><ArrowUpRight size={16} />{t("พื้นที่เจ้าของสัตว์เลี้ยง", "Pet owner app")}</a>
        <div className="portal-user"><span aria-hidden="true">{user.displayName.slice(0, 1)}</span><div><b>{user.displayName}</b><small>{kind === 'clinic' ? memberships[0]?.name : t("ผู้ดูแลระบบ", "Administrator")}</small></div></div>
        <button className="portal-logout" type="button" disabled={busy} onClick={logout}><LogOut size={16} />{t("ออกจากระบบ", "Sign out")}</button>
      </div>
    </aside>
    <main className="portal-main" id="portal-content">
      <div className="portal-topline"><span>{t("ชิดใจ /", "ChordJai /")} {kind === 'clinic' ? t("คลินิก", "Clinic") : t("ผู้ดูแลระบบ", "Administrator")}</span><span className="portal-updated">{updatedAt ? `${t('อัปเดต', 'Updated')} ${timeForLocale(updatedAt, locale)}${t(' น.', '')}` : t("กำลังโหลดข้อมูล", "Loading data")}</span></div>
      <header className="portal-page-header"><div><h1>{currentTab.label}</h1><p>{currentTab.help}</p></div><div className="portal-header-actions"><LanguageSwitcher /><button className="portal-button secondary" type="button" disabled={busy} onClick={() => void establish()}><RefreshCw size={16} className={busy ? 'portal-spin' : ''} /><span>{t("โหลดล่าสุด", "Refresh")}</span></button></div></header>
      {error ? <div className="portal-error" role="alert"><AlertCircle size={19} /><span>{portalMessage(error, locale)}</span></div> : null}
      {notice ? <div className="portal-note success" role="status"><Check size={19} /><span>{t(...notice)}</span></div> : null}
      {busy ? <div className="portal-loading" role="status"><span />{t("กำลังเชื่อมต่อข้อมูล…", "Connecting to your data…")}</div> : null}

      {kind === 'clinic' && tab === 'appointments' ? <>
        <div className="portal-metric-strip">
          <Stat title={t("รอตอบรับ", "Pending")} value={appointments.filter(item => item.status === 'requested').length} icon={<CalendarDays size={20} />} accent />
          <Stat title={t("ตอบรับแล้ว", "Accepted")} value={appointments.filter(item => item.status === 'accepted').length} icon={<Check size={20} />} />
          <Stat title={t("คำขอทั้งหมด", "All requests")} value={appointments.length} icon={<Users size={20} />} />
        </div>
        <section className="portal-panel portal-appointment-panel">
          <div className="portal-section-title"><div><span className="portal-eyebrow">{t("นัดหมายและการดูแล", "Appointments and care")}</span><h2>{t("คำขอจากเจ้าของ", "Requests from owners")}</h2></div><span className="portal-count">{filteredAppointments.length} {t("รายการ", "Records")}</span></div>
          <div className="portal-filters" aria-label={t("กรองคำขอนัด", "Filter appointments")}>{appointmentFilters(t).map(({ value, label }) => <button key={value} type="button" aria-pressed={appointmentFilter === value} className={appointmentFilter === value ? 'active' : ''} onClick={() => setAppointmentFilter(value)}>{label}<span>{appointments.filter(item => value === 'all' || item.status === value).length}</span></button>)}</div>
          <div className="portal-appointment-list">
            {filteredAppointments.map(item => <article className="portal-appointment" key={item.id}>
              <div className="portal-appointment-date"><CalendarDays size={19} /><time dateTime={item.requestedAt}><b>{dateForLocale(item.requestedAt, locale)}</b><span>{timeForLocale(item.requestedAt, locale)} {t("น.", "")}</span></time></div>
              <div className="portal-appointment-detail"><span className="portal-clinic-name">{memberships.find(role => role.clinicId === item.clinicId)?.name}</span><h3>{item.reason}</h3><div className="portal-pet-reference"><PawPrint size={14} /><span title={item.petId}>{t("รหัสน้อง", "Pet ID")} {item.petId.slice(0, 8)}</span><button className="portal-text-button" type="button" disabled={busy} onClick={() => void openSummary(item.petId)}>{t("เปิดสมุดสุขภาพ", "Open health journal")}<ArrowRight size={14} /></button></div></div>
              <div className="portal-appointment-manage"><Status status={item.status} /><div className="portal-row-actions">
                {item.status === 'requested' ? <><button disabled={busy} type="button" onClick={() => void changeAppointment(item.id, 'accepted')} className="portal-button small"><Check size={15} />{t("ตอบรับ", "Accept")}</button><button disabled={busy} type="button" onClick={() => void changeAppointment(item.id, 'declined')} className="portal-button small secondary">{t("ปฏิเสธ", "Decline")}</button></> : item.status === 'accepted' ? <button className="portal-button small secondary" type="button" disabled={busy} onClick={() => void changeAppointment(item.id, 'completed')}><Check size={15} />{t("ตรวจแล้ว", "Completed")}</button> : null}
              </div></div>
            </article>)}
            {!filteredAppointments.length ? <Empty icon={<CalendarDays size={28} />} title={appointmentFilter === 'all' ? t("ยังไม่มีคำขอนัด", "No appointment requests yet") : appointmentFilter === 'requested' ? t('ไม่มีคำขอที่รอตอบรับ', 'No pending appointment requests') : t('ไม่มีคำขอที่ตอบรับแล้ว', 'No accepted appointment requests')} text={t("เมื่อเจ้าของส่งคำขอมาที่คลินิก รายละเอียดจะปรากฏในพื้นที่นี้", "Details will appear here when an owner sends an appointment request to your clinic.")} /> : null}
          </div>
          <div className="portal-panel-footnote"><ShieldCheck size={16} /><span>{t("แสดงคำขอล่าสุดไม่เกิน 100 รายการ เฉพาะคลินิกที่คุณได้รับสิทธิ์ การเปิดสมุดสุขภาพต้องได้รับอนุญาตจากเจ้าของ", "Shows up to 100 recent requests for clinics you can access. The owner must grant access to their pet's health journal.")}</span></div>
        </section>
      </> : null}

      {kind === 'clinic' && tab === 'summary' ? <section className="portal-panel portal-health-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">{t("ข้อมูลเพื่อดูแลต่อ", "Records for continuing care")}</span><h2>{t("เปิดสมุดสุขภาพของน้อง", "Open a pet's health journal")}</h2></div><FileHeart size={25} className="portal-title-icon" /></div>
        <p className="portal-muted">{t("ใช้รหัสน้องจากคำขอนัดหรือจากเจ้าของ เพื่อเปิดประวัติที่ได้รับอนุญาตให้อ่าน", "Use the pet ID from an appointment or the owner to open records you have permission to read.")}</p>
        <form className="portal-search-form" onSubmit={event => { event.preventDefault(); void openSummary(petId); }}>
          <label className="portal-field">{t("รหัสน้อง", "Pet ID")}<input {...requiredField(t)} required value={petId} onChange={event => setPetId(event.target.value)} placeholder={t("วางรหัสน้องที่นี่", "Paste the pet ID here")} autoComplete="off" /></label>
          <button className="portal-button" disabled={busy}><Search size={17} />{t("เปิดสมุดสุขภาพ", "Open health journal")}</button>
        </form>
        <label className="portal-care-cost-choice"><input type="checkbox" checked={summaryCosts} disabled={busy} onChange={event=>{setSummaryCosts(event.target.checked);setSummary(null);}}/>{t('รวมค่าใช้จ่ายที่เจ้าของอนุญาต แล้วกดเปิดสมุดอีกครั้ง','Include owner-permitted costs, then open the journal again')}</label>
        {summary ? <>
          <div className="portal-summary-pet"><span className="portal-pet-monogram"><PawPrint size={30} /></span><div><span className="portal-eyebrow">{t("สมุดสุขภาพ", "Health journal")}</span><h2>{summary.pet.name}</h2><p>{summary.pet.species === 'cat' ? t("แมว", "Cat") : t("สุนัข", "Dog")}{summary.pet.weightKg != null ? ` · ${t("น้ำหนัก", "Weight")} ${summary.pet.weightKg} ${t("กก.", "kg")}` : ''}</p></div><span className="portal-summary-count">{summary.records.length} {t("บันทึกสมุดประจำตัว", "booklet records")}</span></div>
          <div className="portal-table-wrap"><table><caption className="portal-visually-hidden">{t("ประวัติสุขภาพของ", "Health history for")} {summary.pet.name}</caption><thead><tr><th scope="col">{t("รายการ", "Records")}</th><th scope="col">{t("วันที่บันทึก", "Recorded on")}</th><th scope="col">{t("ครั้งถัดไป", "Next due")}</th><th scope="col">{t("หมายเหตุ", "Notes")}</th></tr></thead><tbody>{summary.records.map((record, index) => <tr key={record.id || index}><td><b>{record.title}</b>{record.value != null ? <small>{record.value} {t("กก.", "kg")}</small> : null}</td><td>{dateForLocale(record.recordedAt, locale)}</td><td>{record.nextDueAt ? dateForLocale(record.nextDueAt, locale) : '—'}</td><td className="portal-reason">{record.notes || '—'}</td></tr>)}</tbody></table></div>
          {summary.careTruncated?<p className="portal-muted">{t('สรุปนี้แสดงบันทึกดูแลล่าสุดไม่เกิน 100 รายการ','This brief shows up to 100 of the latest care entries.')}</p>:null}
          {summary.careAccess||summary.careEntries?.length?<CareSummary entries={summary.careEntries||[]} showPrint/>:<p className="portal-muted">{t('ไดอารี่ดูแลต้องได้รับสิทธิ์แยกจากสมุดวัคซีน เจ้าของเลือกบันทึกและอนุญาตไดอารี่ให้คลินิกได้ในตั้งค่า','Care diary access is separate from the vaccination booklet. The owner can select entries and grant diary access in Settings.')}</p>}
          {!summary.records.length ? <Empty icon={<FileHeart size={28} />} title={t("ยังไม่มีบันทึกในสมุดประจำตัว", "No booklet records yet")} text={t("วัคซีน ยา น้ำหนัก และเช็กอินจะแสดงตรงนี้เมื่อเจ้าของเพิ่มบันทึก", "Vaccinations, medication, weight and check-ins appear here when the owner adds them.")} /> : null}
        </> : <div className="portal-summary-awaiting"><FileHeart size={36} /><div><h3>{t("เริ่มจากสมุดเล่มที่เจ้าของเลือกแชร์", "Start with the journal the owner has shared")}</h3><p>{t("ถ้ายังเปิดไม่ได้ ให้เจ้าของตรวจสิทธิ์การแชร์และวันหมดอายุในแอปชิดใจ", "If access is unavailable, ask the owner to check the sharing permissions and expiry date in ChordJai.")}</p></div></div>}
        <div className="portal-panel-footnote"><ShieldCheck size={16} /><span>{t("เจ้าของถอนสิทธิ์ได้ทุกเมื่อ และระบบบันทึกการเปิดสมุดสุขภาพแต่ละครั้ง", "The owner can revoke access at any time. Each health journal view is recorded.")}</span></div>
      </section> : null}

      {kind === 'clinic' && tab === 'membership' ? <section className="portal-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">{t("พื้นที่ทำงานของคุณ", "Your workspace")}</span><h2>{t("คลินิกที่ได้รับสิทธิ์", "Clinics you can access")}</h2></div><span className="portal-count">{memberships.length} {t("คลินิก", "Clinics")}</span></div>
        <div className="portal-membership-list">{memberships.map(item => <article className="portal-membership" key={item.clinicId}><span className="portal-membership-icon"><Hospital size={25} /></span><div><h3>{item.name}</h3><p>{roleLabel(item.role, locale)}</p><span className="portal-reference">{t("รหัสคลินิก", "Clinic ID")} <code>{item.clinicId}</code></span></div><span className="portal-membership-verified"><ShieldCheck size={16} />{t("มีสิทธิ์เข้าถึง", "Access granted")}</span></article>)}</div>
        <div className="portal-panel-footnote"><CircleHelp size={17} /><span>{t("หากต้องการเพิ่มหรือเปลี่ยนสิทธิ์สมาชิก กรุณาติดต่อผู้ดูแลคลินิก", "Contact your clinic administrator to add members or change their access.")}</span></div>
      </section> : null}

      {kind === 'admin' && tab === 'overview' && kpis ? <>
        <div className="portal-metric-strip admin"><Stat title={t("ผู้ใช้งาน", "Users")} value={kpis.users} icon={<Users size={20} />} accent /><Stat title={t("สัตว์เลี้ยงในระบบ", "Pets in the system")} value={kpis.pets} icon={<PawPrint size={20} />} /><Stat title={t("บันทึกสุขภาพ", "Health records")} value={kpis.healthRecords} icon={<FileHeart size={20} />} /><Stat title={t("คลินิกที่ตรวจสอบแล้ว", "Verified clinics")} value={kpis.clinics} icon={<Hospital size={20} />} /></div>
        <div className="portal-overview-grid">
          <section className="portal-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">{t("สิ่งที่เกิดขึ้นในชิดใจ", "Activity in ChordJai")}</span><h2>{t("การใช้งานแต่ละส่วน", "Usage by feature")}</h2></div><ArrowDownLeft size={22} className="portal-title-icon" /></div><dl className="portal-usage-list"><Usage icon={<BookOpen size={18} />} label={t("หน้าสมุดความทรงจำ", "Journal pages")} value={kpis.journalPages} /><Usage icon={<MessageSquare size={18} />} label={t("บทสนทนากับผู้ช่วย", "Assistant conversations")} value={kpis.conversations} /><Usage icon={<Activity size={18} />} label={t("การคัดกรองอาการ", "Symptom screening")} value={kpis.triageSessions} /><Usage icon={<FileHeart size={18} />} label={t("การเปิดสรุปสุขภาพ", "Health summary views")} value={kpis.summaryViews} /><Usage icon={<Fingerprint size={18} />} label={t("ประกาศที่กำลังตามหา", "Active lost-pet notices")} value={kpis.activeLostCases} /></dl><p className="portal-caption">{t("จำนวนสะสมจากข้อมูลที่บันทึกในระบบ", "Cumulative totals from records in the system")}</p></section>
          <div className="portal-insights"><section className="portal-panel portal-cost"><span className="portal-eyebrow">{t("ต้นทุน AI วันนี้ · UTC", "AI costs today · UTC")}</span><h2 className="portal-big-number"><small>USD</small> {Number(kpis.aiCostTodayUsd || 0).toFixed(4)}</h2><p className="portal-muted">{t("ตามคำขอที่ระบบบันทึก ไม่รวมค่าบริการอื่น", "Based on recorded requests; other service costs are excluded.")}</p><button className="portal-text-button" type="button" onClick={() => selectTab('ai')}>{t("ดูการเรียกใช้", "View requests")}<ArrowRight size={17} /></button></section><section className={`portal-panel portal-attention ${kpis.deadJobs > 0 ? 'has-work' : ''}`}><div><span className="portal-eyebrow">{t("งานที่ต้องดูแลต่อ", "Jobs needing attention")}</span><h2>{kpis.deadJobs} <span>{t("งาน", "Job")}</span></h2><p>{t("งานที่ลองทำครบแล้วและยังไม่สำเร็จ", "Jobs that have used all attempts without succeeding")}</p></div><button className="portal-icon" type="button" aria-label={t("ตรวจงานเบื้องหลัง", "Review background jobs")} onClick={() => { selectTab('jobs'); setJobFilter('dead'); }}><ArrowRight size={21} /></button></section></div>
        </div>
        {kpis.care?<section className="portal-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">{t('วงจรที่ผู้ใช้กลับมาดูแลต่อ','The return-to-care loop')}</span><h2>{t('ไดอารี่และความต่อเนื่องในการดูแล','Care diary & continuity')}</h2></div><FileHeart size={23}/></div><dl className="portal-usage-list"><Usage icon={<Users size={18}/>} label={t('ผู้เขียนไดอารี่ทั้งหมด','Total diary authors')} value={kpis.care.diaryAuthors}/><Usage icon={<BookOpen size={18}/>} label={t('บันทึกไดอารี่ทั้งหมด','Total diary entries')} value={kpis.care.diaryEntries}/><Usage icon={<CalendarDays size={18}/>} label={t('น้องที่มีบันทึกใน 30 วัน','Pets with entries in 30 days')} value={kpis.care.activePetsLast30Days}/><Usage icon={<Activity size={18}/>} label={t('น้องที่บันทึกอย่างน้อย 2 สัปดาห์ใน 30 วัน','Pets recorded in 2+ calendar weeks within 30 days')} value={kpis.care.repeatWeekPetsLast30Days}/><Usage icon={<FileHeart size={18}/>} label={t('เรื่องดูแลที่มีการติดตามผล','Episodes with follow-up updates')} value={kpis.care.episodesWithFollowup}/><Usage icon={<Hospital size={18}/>} label={t('การพบหมอที่บันทึกค่าใช้จ่าย','Vet visits with recorded cost lines')} value={kpis.care.visitsWithRecordedCosts}/><Usage icon={<ShieldCheck size={18}/>} label={t('บันทึกที่เลือกเปิดแชร์ให้คลินิก','Entries enabled for clinical sharing')} value={kpis.care.entriesEnabledForClinicalSharing}/></dl><p className="portal-caption">{t('วัดจากเวลาที่สร้างบันทึกตาม Asia/Bangkok การกลับมาหลายสัปดาห์ยังไม่ใช่ retention cohort และสถานะดีขึ้นเป็นสิ่งที่เจ้าของรายงาน','Measured by entry creation time in Asia/Bangkok. Activity across weeks is not a retention cohort, and improvement is owner reported.')}</p>{kpis.petid?<><h3>{t('ข้อมูลอ้างอิง PetID','PetID reference inventory')}</h3><dl className="portal-usage-list"><Usage icon={<Fingerprint size={18}/>} label={t('น้องที่ลงทะเบียนพร้อมค้นหา','Pets with ready enrolments')} value={kpis.petid.enrolledPets}/><Usage icon={<PawPrint size={18}/>} label={t('รูปอ้างอิงที่ยังใช้งานได้','Available reference photos')} value={kpis.petid.availableReferencePhotos}/><Usage icon={<Layers size={18}/>} label={t('น้องที่มีรูปอ้างอิงมากกว่า 1 รูป','Pets with multiple reference photos')} value={kpis.petid.petsWithMultipleReferencePhotos}/></dl><p className="portal-caption">{t('จำนวนรูปไม่ใช่ผลความแม่นยำหรือหลักฐานยืนยันตัว ยังต้องประเมินคุณภาพภาพ ลาเบลตัวสัตว์ และอัตราจับคู่ผิดก่อนใช้เชิงพาณิชย์','Photo counts are not accuracy results or verified identity evidence. Capture quality, identity labels and matching errors still need evaluation before commercial identity use.')}</p></>:null}</section>:null}
        <section className="portal-panel portal-readiness"><div className="portal-section-title"><div><span className="portal-eyebrow">{t("ก่อนขยายการใช้งาน", "Before expanding access")}</span><h2>{t("การตรวจสอบที่ยังต้องดำเนินการ", "Checks still to complete")}</h2></div><ShieldCheck size={24} className="portal-title-icon" /></div><div className="portal-readiness-list"><div><Activity size={20} /><h3>{t("การคัดกรองอาการ", "Symptom screening")}</h3><p>{t("รอสัตวแพทย์ตรวจชุดประเมิน", "Awaiting veterinary review of the evaluation set")}</p></div><div><Fingerprint size={20} /><h3>{t("ความแม่นยำ PetID", "PetID accuracy")}</h3><p>{t("รอวัดผลและปรับค่าจากภาพจริง", "Awaiting evaluation and calibration with real images")}</p></div><div><Users size={20} /><h3>{t("การกลับมาใช้งาน", "Returning users")}</h3><p>{t("ต้องมีข้อมูลผู้ใช้ก่อนวิเคราะห์ retention", "User activity is needed before retention can be measured")}</p></div></div></section>
      </> : null}

      {kind === 'admin' && tab === 'ai' ? <section className="portal-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">{t("คำขอล่าสุด", "Recent requests")}</span><h2>{t("การเรียกใช้ AI", "AI requests")}</h2></div><span className="portal-count">{requests.length} {t("รายการที่โหลด", "loaded requests")}</span></div>
        <div className="portal-table-toolbar"><label className="portal-inline-search"><Search size={17} /><input type="search" value={aiFilter} onChange={event => setAiFilter(event.target.value)} placeholder={t("ค้นหาฟีเจอร์ โมเดล หรือสถานะ", "Search feature, model, or status")} aria-label={t("ค้นหาการเรียกใช้ AI", "Search AI requests")} /></label><span className="portal-muted">{t("แสดง", "Showing")} {filteredRequests.length} {t("รายการ", "Records")}</span></div>
        <div className="portal-table-wrap"><table><caption className="portal-visually-hidden">{t("การเรียกใช้ AI ล่าสุด โดยไม่เปิดเผยข้อความผู้ใช้", "Recent AI requests, without private user messages")}</caption><thead><tr><th scope="col">{t("ฟีเจอร์ / วันที่", "Feature / date")}</th><th scope="col">{t("โมเดล", "Model")}</th><th scope="col">{t("Tokens เข้า / ออก", "Tokens in / out")}</th><th scope="col">{t("ระยะเวลา", "Duration")}</th><th scope="col">{t("ต้นทุน USD", "Cost USD")}</th><th scope="col">{t("สถานะ", "Status")}</th></tr></thead><tbody>{filteredRequests.map(item => <tr key={item.id}><td><b>{featureLabel(item.feature, t)}</b><small><code>{item.feature}</code></small><small>{dateForLocale(item.createdAt, locale)} · {timeForLocale(item.createdAt, locale)}</small></td><td><code>{item.model}</code>{item.modelResolved && item.modelResolved !== item.model ? <small>{item.modelResolved}</small> : null}</td><td className="portal-numeric">{number(item.inputTokens, locale)} / {number(item.outputTokens, locale)}</td><td className="portal-numeric">{number(item.latencyMs, locale)} ms</td><td className="portal-numeric">{Number(item.costUsd || 0).toFixed(5)}</td><td><Status status={item.status} /></td></tr>)}</tbody></table></div>
        {!filteredRequests.length ? <Empty icon={<Activity size={28} />} title={aiFilter ? t("ไม่พบคำขอที่ตรงกับการค้นหา", "No requests match your search") : t("ยังไม่มีการเรียกใช้ AI", "No AI requests yet")} text={aiFilter ? t("ลองเปลี่ยนคำค้นหรือดูรายการทั้งหมด", "Try a different search or view all requests.") : t("เมื่อมีการใช้งานจริง ข้อมูลการเรียกใช้จะแสดงที่นี่", "Requests will appear here once the service is used.")} /> : null}
        <div className="portal-panel-footnote"><ShieldCheck size={16} /><span>{t("แสดงเฉพาะข้อมูลการทำงานของคำขอ ไม่แสดงข้อความหรือภาพส่วนตัวของผู้ใช้", "Only request metadata is shown. Private user messages and photos are not displayed.")}</span></div>
      </section> : null}

      {kind === 'admin' && tab === 'jobs' ? <section className="portal-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">{t("การส่งงานและสถานะ", "Delivery and status")}</span><h2>{t("งานเบื้องหลัง", "Background jobs")}</h2></div><Layers size={24} className="portal-title-icon" /></div>
        <div className="portal-filters" aria-label={t("กรองคิวงาน", "Filter background jobs")}>{[['all', t("ทั้งหมด", "All")], ['dead', t("ต้องตรวจ", "Needs review")], ['queued', t("เข้าคิว", "Queued")], ['running', t("กำลังทำ", "Running")], ['completed', t("สำเร็จ", "Completed")]].map(([value, label]) => <button type="button" key={value} aria-pressed={jobFilter === value} className={jobFilter === value ? 'active' : ''} onClick={() => setJobFilter(value)}>{label}<span>{jobs.filter(item => value === 'all' || item.status === value).length}</span></button>)}</div>
        <div className="portal-table-wrap"><table><caption className="portal-visually-hidden">{t("สถานะงานเบื้องหลัง", "Background job status")}</caption><thead><tr><th scope="col">{t("งาน", "Job")}</th><th scope="col">{t("สถานะ", "Status")}</th><th scope="col">{t("ครั้งที่ลอง", "Attempts")}</th><th scope="col">{t("เวลาทำงาน", "Scheduled for")}</th><th scope="col">{t("ข้อผิดพลาด", "Error")}</th><th scope="col">{t("จัดการ", "Actions")}</th></tr></thead><tbody>{filteredJobs.map(item => <tr key={item.id}><td><b>{item.topic}</b><small title={item.id}>{t("รหัส", "ID")} {item.id.slice(0, 8)}</small></td><td><Status status={item.status} domain="job" /></td><td className="portal-numeric">{item.attempts} / {item.maxAttempts}</td><td>{dateForLocale(item.runAt, locale)}<small>{timeForLocale(item.runAt, locale)} {t("น.", "")}</small></td><td className="portal-reason">{item.lastError || '—'}</td><td>{item.status === 'dead' ? <div className="portal-row-actions"><button type="button" className="portal-icon success" disabled={busy} aria-label={t(`ทำงาน ${item.topic} อีกครั้ง`, `Retry job ${item.topic}`)} title={t("ลองทำอีกครั้ง", "Retry job")} onClick={() => void jobAction(item.id, 'replay')}><Play size={16} /></button><button type="button" className="portal-icon danger" disabled={busy} aria-label={t(`ทิ้งงาน ${item.topic}`, `Discard job ${item.topic}`)} title={t("ทิ้งงาน", "Discard job")} onClick={() => void jobAction(item.id, 'discard')}><Trash2 size={16} /></button></div> : '—'}</td></tr>)}</tbody></table></div>
        {!filteredJobs.length ? <Empty icon={<Layers size={28} />} title={jobFilter === 'all' ? t("ยังไม่มีงานในคิว", "No jobs in the queue yet") : t("ไม่มีงานในสถานะนี้", "No jobs with this status")} text={t("งานแจ้งเตือนและงานเบื้องหลังจะปรากฏตามสถานะการทำงานจริง", "Notifications and background jobs appear with their actual processing status.")} /> : null}
        <div className="portal-panel-footnote"><CircleHelp size={16} /><span>{t("ลองทำอีกครั้งหรือทิ้งงานได้เฉพาะงานที่ล้มเหลวครบจำนวนครั้งแล้ว", "Only jobs that have failed all their attempts can be retried or discarded.")}</span></div>
      </section> : null}
      {kind === 'admin' && tab === 'clinics' ? <ClinicDirectory onSuccess={() => setNotice(["บันทึกคลินิกที่ตรวจสอบแล้วในรายชื่อสาธารณะ", "Verified clinic saved in the public directory"])} /> : null}
      <footer className="portal-footer"><span>{t("ชิดใจ · ดูแลกันในทุกวัน", "ChordJai · Care for each other, every day")}</span><span>{kind === 'clinic' ? t("ข้อมูลสุขภาพที่เจ้าของเลือกแชร์", "Health records shared by the owner") : t("เวลาการทำงานแสดงตาม Asia/Bangkok", "Activity times use Asia/Bangkok")}</span></footer>
    </main>
  </div>;
}

function PortalLogin({ kind, busy, error, onLogin }: { kind: PortalKind; busy: boolean; error: unknown; onLogin: () => void }) {
  const { locale, t } = useLocale();
  const clinic = kind === 'clinic';
  return <main className={`portal-login ${clinic ? 'clinic-login' : 'admin-login'}`}>
    <header className="portal-login-header"><a href={ownerHref(locale)} className="portal-logo"><PawPrint size={25} /><span>{t("ชิดใจ", "ChordJai")}<small>chordjai</small></span></a><div><LanguageSwitcher /><a className="portal-back" href={ownerHref(locale)}><span>{t("พื้นที่เจ้าของสัตว์เลี้ยง", "Pet owner app")}</span><ArrowUpRight size={17} /></a></div></header>
    <div className="portal-login-body"><section className="portal-login-card"><span className="portal-eyebrow">{clinic ? t("ชิดใจ สำหรับคลินิก", "ChordJai for clinics") : t("ชิดใจ สำหรับผู้ดูแลระบบ", "ChordJai for administrators")}</span><h1>{clinic ? <>{t("ให้การดูแล", "Care that continues")}<br />{t("ต่อจากความใส่ใจ", "with understanding")}</> : <>{t("ดูแลทุกส่วน", "Care for every part")}<br />{t("ให้พร้อมสำหรับทุกวัน", "ready for every day")}</>}</h1><p>{clinic ? t("รับคำขอนัด เปิดสมุดสุขภาพที่เจ้าของเลือกแชร์ และเตรียมการดูแลน้องได้จากที่เดียว", "Receive appointments, open owner-shared health records, and prepare your pet care in one place.") : t("ตรวจการใช้งาน ค่าใช้จ่าย และงานเบื้องหลังของชิดใจ ด้วยข้อมูลที่เกิดขึ้นจริงในระบบ", "Review usage, costs, and background jobs using actual activity recorded in ChordJai.")}</p><div className="portal-login-action">{error ? <div className="portal-error" role="alert"><AlertCircle size={19} /><span>{portalMessage(error, locale)}</span></div> : null}<button className="portal-button" type="button" disabled={busy} onClick={onLogin}>{busy ? <><RefreshCw className="portal-spin" size={18} />{t("กำลังตรวจสอบสิทธิ์…", "Checking access…")}</> : <>{t("เข้าสู่ระบบด้วย LINE", "Sign in with LINE")}<ArrowRight size={18} /></>}</button><p><ShieldCheck size={16} />{clinic ? t("สำหรับสมาชิกคลินิกที่ได้รับสิทธิ์", "For authorized clinic members") : t("สำหรับบัญชีผู้ดูแลระบบที่ได้รับสิทธิ์", "For authorized administrator accounts")}</p></div><div className="portal-login-details"><span>{clinic ? t("นัดหมาย", "Appointments") : t("การใช้งาน", "Usage")}</span><span>{clinic ? t("สมุดสุขภาพ", "Health journal") : t("ต้นทุน AI", "AI costs")}</span><span>{clinic ? t("สิทธิ์การดูแล", "Care permissions") : t("งานเบื้องหลัง", "Background jobs")}</span></div></section>
      {clinic ? <figure className="portal-login-photo"><img src="/images/pet-home-dog.webp" alt={t("สุนัขที่ได้รับการดูแลอย่างอบอุ่น", "A dog resting comfortably at home")} width={840} height={1050} /><figcaption><span>{t("ความไว้ใจ เริ่มจากความเข้าใจ", "Trust starts with understanding")}</span><p>{t("เจ้าของเลือกแบ่งปัน", "The owner chooses what to share")}<br />{t("คลินิกพร้อมดูแลต่อ", "Your clinic is ready to continue care")}</p><FileHeart size={24} /></figcaption></figure> : <section className="portal-admin-story" aria-label={t("หน้าที่ของผู้ดูแล", "Administrator responsibilities")}><span className="portal-eyebrow">{t("พื้นที่ทำงานที่ชัดเจน", "A clear workspace")}</span><h2>{t("ดูสิ่งที่เกิดขึ้น", "See what is happening")}<br />{t("แล้วดูแลสิ่งที่ต้องทำ", "and take care of what comes next")}</h2><ol><li><span>01</span><div><h3>{t("การใช้งานจริง", "Actual usage")}</h3><p>{t("จำนวนผู้ใช้ สัตว์เลี้ยง และการดูแลที่บันทึกไว้", "Users, pets, and the care recorded in ChordJai")}</p></div><ChartNoAxesCombined size={22} /></li><li><span>02</span><div><h3>{t("การทำงานของบริการ", "Service activity")}</h3><p>{t("สถานะ เวลา และต้นทุนของคำขอ AI", "The status, timings, and costs of AI requests")}</p></div><Activity size={22} /></li><li><span>03</span><div><h3>{t("เรื่องที่ต้องลงมือ", "Things that need action")}</h3><p>{t("งานที่ไม่สำเร็จและข้อมูลคลินิกที่รอตรวจสอบ", "Failed jobs and clinic details to verify")}</p></div><SlidersHorizontal size={22} /></li></ol><div className="portal-admin-privacy"><ShieldCheck size={18} /><p>{t("ตรวจระบบโดยรักษาความเป็นส่วนตัวของเจ้าของและสัตว์เลี้ยง", "Review the system while protecting the privacy of owners and their pets.")}</p></div></section>}
    </div><footer className="portal-login-footer"><span>{t("ชิดใจ · ดูแลกันในทุกวัน", "ChordJai · Care for each other, every day")}</span><span>{clinic ? t("สำหรับคลินิกและทีมดูแลสัตว์เลี้ยง", "For clinics and pet care teams") : t("สำหรับทีมดูแลการทำงานของชิดใจ", "For the ChordJai operations team")}</span></footer>
  </main>;
}

function Stat({ title, value, icon, accent = false }: { title: string; value: number; icon: ReactNode; accent?: boolean }) {
  const { locale } = useLocale();
  return <article className={`portal-stat ${accent ? 'accent' : ''}`}><div><span>{icon}</span><small>{title}</small></div><b>{number(value, locale)}</b></article>;
}
function Usage({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  const { locale } = useLocale();
  return <div><dt>{icon}{label}</dt><dd>{number(value, locale)}</dd></div>;
}
function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="portal-empty"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}
function Status({ status, domain }: { status: string; domain?: 'job' | 'ai' }) {
  const { t } = useLocale();
  const style = status === 'ok' ? 'success' : ['error', 'timeout', 'refused', 'invalid_output', 'budget_blocked'].includes(status) ? 'failed' : status === 'reserved' ? 'queued' : status;
  return <span className={`portal-status ${style}`} data-status={status}><span aria-hidden="true" />{statusLabel(status, t, domain)}</span>;
}
function statusLabel(status: string, t: Translator, domain?: 'job' | 'ai') {
  const labels: Record<string, string> = {
    requested: t("รอตอบรับ", "Pending"), accepted: t("ตอบรับแล้ว", "Accepted"), declined: t("ปฏิเสธ", "Declined"),
    cancelled: t("ยกเลิก", "Cancelled"), completed: domain === 'job' ? t('สำเร็จ', 'Completed') : t("ตรวจแล้ว", "Completed"),
    queued: t("เข้าคิว", "Queued"), running: t("กำลังทำ", "Running"), done: t("สำเร็จ", "Succeeded"),
    dead: t("ต้องตรวจ", "Needs review"), success: t("สำเร็จ", "Succeeded"), failed: t("ล้มเหลว", "Failed"),
    ok: t('สำเร็จ', 'Succeeded'), error: t('ผิดพลาด', 'Error'), timeout: t('หมดเวลารอ', 'Timed out'),
    refused: t('ปฏิเสธคำขอ', 'Refused'), invalid_output: t('ผลลัพธ์ไม่ถูกต้อง', 'Invalid response'),
    budget_blocked: t('เกินงบที่กำหนด', 'Budget limit'), reserved: t('รอประมวลผล', 'Reserved'),
  };
  return labels[status] || status;
}
function featureLabel(feature: string, t: Translator) {
  const labels: Record<string, string> = {
    'triage.assess': t('คัดกรองอาการ', 'Symptom screening'), 'vision.photo_check': t('ตรวจภาพอาการ', 'Photo observations'),
    'ocr.vaccine_book': t('อ่านสมุดวัคซีน', 'Vaccination book reading'), 'journal.decorate': t('ตกแต่งสมุด', 'Journal decoration'),
    'assistant.chat': t('สนทนากับผู้ช่วย', 'Assistant chat'), 'petid.signature': t('อ่านลักษณะสัตว์เลี้ยง', 'Pet appearance signature'),
    'petid.verify_pair': t('เปรียบเทียบภาพ PetID', 'PetID photo comparison'), 'embed.petid': t('สร้างเวกเตอร์ PetID', 'PetID embedding'),
  };
  return labels[feature] || feature;
}
function number(value: number, locale: Locale) { return Number(value || 0).toLocaleString(locale === 'en' ? 'en-US' : 'th-TH'); }
function timeForLocale(date: string, locale: Locale) { return new Date(date).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); }
function ownerHref(locale: Locale) { return `https://www.chordjai.life${localizedHref('/', locale)}`; }
class PortalUiError extends Error {
  constructor(public thai: string, public english: string) { super(thai); }
}
function portalMessage(error: unknown, locale: Locale) {
  return error instanceof PortalUiError ? translate(locale, error.thai, error.english) : messageOf(error, locale);
}
function requiredField(t: Translator) {
  return {
    onInvalid: (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.currentTarget.setCustomValidity(t('กรุณากรอกข้อมูลช่องนี้ให้ครบ', 'Please complete this field.'));
    },
    onInput: (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => event.currentTarget.setCustomValidity(''),
  };
}
function roleLabel(role: string, locale: Locale) {
  const t: Translator = (thai, english) => translate(locale, thai, english);
  const labels: Record<string, string> = { owner: t("เจ้าของคลินิก", "Clinic owner"), vet: t("สัตวแพทย์", "Veterinarian"), staff: t("ทีมดูแลคลินิก", "Clinic staff"), admin: t("ผู้ดูแลคลินิก", "Clinic administrator") };
  return labels[role] || role;
}

function ClinicDirectory({ onSuccess }: { onSuccess: () => void }) {
  const { locale, t } = useLocale();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true); setLoadError('');
    try { setClinics(await api<Clinic[]>('/clinics', {}, true)); }
    catch (caught) { setLoadError(caught); }
    finally { setLoading(false); }
  }
  const visible = clinics.filter(item => !query || `${item.name} ${item.district}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <section className="portal-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">{t("รายชื่อที่ตรวจสอบแล้ว", "Verified directory")}</span><h2>{t("เครือข่ายคลินิก", "Clinic network")}</h2></div><button type="button" className={`portal-button ${showForm ? 'secondary' : ''}`} onClick={() => setShowForm(value => !value)}>{showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? t("ปิดแบบฟอร์ม", "Close form") : t("เพิ่มคลินิก", "Add clinic")}</button></div><div className="portal-table-toolbar"><label className="portal-inline-search"><Search size={17} /><input type="search" aria-label={t("ค้นหารายชื่อคลินิก", "Search clinics")} placeholder={t("ค้นหาชื่อคลินิกหรือย่าน", "Search by clinic name or area")} value={query} onChange={event => setQuery(event.target.value)} /></label><span className="portal-muted">{visible.length} {t("คลินิก", "Clinics")}</span></div>{loadError ? <div className="portal-error" role="alert"><AlertCircle size={18} /><span>{portalMessage(loadError, locale)}</span><button type="button" className="portal-text-button" onClick={() => void load()}>{t("ลองใหม่", "Try again")}</button></div> : null}{loading ? <div className="portal-loading" role="status"><span />{t("กำลังโหลดรายชื่อคลินิก…", "Loading clinics…")}</div> : <div className="portal-directory">{visible.map(item => <article key={item.id}><span className="portal-membership-icon"><Hospital size={22} /></span><div><h3>{item.name}</h3><p>{item.district} · {item.address}</p><a href={`tel:${item.phone}`}>{item.phone}</a></div>{item.is24h ? <span className="portal-clinic-hours"><Clock3 size={14} />{t("24 ชั่วโมง", "24 hours")}</span> : null}</article>)}</div>}{!loading && !loadError && !visible.length ? <Empty icon={<Hospital size={28} />} title={query ? t("ไม่พบคลินิกที่ตรงกับการค้นหา", "No clinics match your search") : t("ยังไม่มีคลินิกในเครือข่าย", "No clinics in the network yet")} text={query ? t("ลองค้นหาด้วยชื่อหรือย่านอื่น", "Try a different clinic name or area.") : t("เพิ่มคลินิกหลังตรวจสอบข้อมูลติดต่อและเวลาเปิดแล้ว", "Add a clinic after verifying its contact details and hours.")} /> : null}</section>
    {showForm ? <ClinicCreate onSuccess={clinic => { setClinics(current => [clinic, ...current.filter(item => item.id !== clinic.id)]); setShowForm(false); onSuccess(); }} /> : null}
  </>;
}

function ClinicCreate({ onSuccess }: { onSuccess: (clinic: Clinic) => void }) {
  const { locale, t } = useLocale();
  const [name, setName] = useState(''); const [district, setDistrict] = useState('');
  const [phone, setPhone] = useState(''); const [address, setAddress] = useState('');
  const [is24h, setIs24h] = useState(false); const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  return <section className="portal-panel portal-create-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">{t("เพิ่มข้อมูลในเครือข่าย", "Add to the network")}</span><h2>{t("คลินิกที่ตรวจสอบแล้ว", "Verified clinic")}</h2></div><Hospital size={24} className="portal-title-icon" /></div><p className="portal-muted">{t("ข้อมูลจะปรากฏต่อเจ้าของเมื่อบันทึก กรุณาตรวจชื่อ เบอร์โทร ที่อยู่ และเวลาเปิดกับคลินิกก่อน", "Owners can see the clinic once saved. Confirm the name, phone, address, and hours with the clinic first.")}</p><form className="portal-clinic-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const clinic = await api<Clinic>('/clinic/admin/clinics', json('POST', { name, district, phone, address, is24h, lat: null, lng: null }));
      onSuccess(clinic); setName(''); setDistrict(''); setPhone(''); setAddress(''); setVerified(false);
    } catch (caught) { setError(caught); }
    finally { setBusy(false); }
  }}><label className="portal-field">{t("ชื่อคลินิก", "Clinic name")}<input {...requiredField(t)} required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder={t("ชื่อที่เจ้าของค้นหาได้", "The name owners can search for")} /></label><div className="portal-form-grid"><label className="portal-field">{t("เขต / ย่าน", "District / area")}<input {...requiredField(t)} required maxLength={100} value={district} onChange={event => setDistrict(event.target.value)} /></label><label className="portal-field">{t("เบอร์โทร", "Phone")}<input {...requiredField(t)} required type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" /></label></div><label className="portal-field">{t("ที่อยู่", "Address")}<textarea {...requiredField(t)} required rows={3} maxLength={500} value={address} onChange={event => setAddress(event.target.value)} autoComplete="street-address" /></label><fieldset className="portal-verification"><legend>{t("ตรวจข้อมูลก่อนเผยแพร่", "Verify before publishing")}</legend><label className="portal-check"><input type="checkbox" checked={is24h} onChange={event => setIs24h(event.target.checked)} /><span>{t("คลินิกยืนยันว่าเปิด 24 ชั่วโมง", "The clinic confirms it is open 24 hours")}</span></label><label className="portal-check"><input {...requiredField(t)} type="checkbox" required checked={verified} onChange={event => setVerified(event.target.checked)} /><span>{t("ตรวจข้อมูลติดต่อและเวลาเปิดกับคลินิกแล้ว", "I have verified the contact details and hours with the clinic")}</span></label></fieldset>{error ? <div className="portal-error" role="alert"><AlertCircle size={19} /><span>{portalMessage(error, locale)}</span></div> : null}<button className="portal-button" disabled={busy || !verified}><Plus size={17} />{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกในรายชื่อสาธารณะ", "Save to public directory")}</button></form></section>;
}
