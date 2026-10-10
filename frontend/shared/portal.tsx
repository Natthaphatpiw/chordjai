'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, CalendarDays, Check, Clock3,
  FileHeart, Hospital, Layers, LogOut, Plus, PawPrint, Play, RefreshCw, Search,
  ShieldCheck, Trash2, Users, X, ChartNoAxesCombined, CircleHelp, Fingerprint,
  MessageSquare, ArrowUpRight, AlertCircle, BookOpen, SlidersHorizontal,
} from 'lucide-react';
import { api, json, lineLogin, messageOf, dateThai } from './api';

type PortalKind = 'clinic' | 'admin';
type User = { id: string; displayName: string; role: string };
type Membership = { clinicId: string; name: string; role: string };
type Appointment = { id: string; clinicId: string; petId: string; requestedAt: string; reason: string; status: string };
type HealthRecord = { id?: string; kind: string; title: string; recordedAt: string; nextDueAt?: string; notes?: string; value?: number };
type Summary = { pet: { name: string; species: string; sex: string; weightKg?: number }; records: HealthRecord[] };
type Kpis = {
  users: number; pets: number; healthRecords: number; summaryViews: number; clinics: number;
  triageSessions: number; activeLostCases: number; journalPages: number; conversations: number;
  aiCostTodayUsd: number; deadJobs: number;
  readiness?: { clinicalEval: string; petidCalibration: string; retentionCohort: string };
};
type Job = { id: string; topic: string; status: string; attempts: number; maxAttempts: number; runAt: string; lastError?: string };
type AiRequest = { id: string; feature: string; model: string; modelResolved?: string; inputTokens: number; outputTokens: number; latencyMs: number; costUsd: number; status: string; createdAt: string };
type Clinic = { id: string; name: string; district: string; phone: string; address: string; is24h: boolean };
const clinicTabs = [
  { id: 'appointments', label: 'คำขอนัด', icon: CalendarDays, help: 'เริ่มจากคำขอของเจ้าของ แล้วเตรียมการดูแลให้พร้อม' },
  { id: 'summary', label: 'สมุดสุขภาพ', icon: FileHeart, help: 'ข้อมูลที่เจ้าของเลือกให้คลินิกอ่าน เพื่อดูแลต่อได้อย่างเข้าใจ' },
  { id: 'membership', label: 'คลินิกของฉัน', icon: Hospital, help: 'พื้นที่ทำงานและสิทธิ์ที่คุณได้รับในแต่ละคลินิก' },
];
const adminTabs = [
  { id: 'overview', label: 'ภาพรวม', icon: ChartNoAxesCombined, help: 'มองเห็นการใช้งาน และเรื่องที่ควรลงมือดูแลต่อ' },
  { id: 'ai', label: 'การทำงานของ AI', icon: Activity, help: 'ตรวจการเรียกใช้ เวลา และต้นทุน โดยไม่เปิดข้อความของผู้ใช้' },
  { id: 'jobs', label: 'งานเบื้องหลัง', icon: Layers, help: 'ดูสถานะการส่งงาน และช่วยงานที่ทำไม่สำเร็จกลับไปทำต่อ' },
  { id: 'clinics', label: 'เครือข่ายคลินิก', icon: Hospital, help: 'ข้อมูลติดต่อที่ตรวจสอบแล้ว เพื่อให้เจ้าของหาความช่วยเหลือได้' },
];
const appointmentFilters = [
  { value: 'requested', label: 'รอตอบรับ' }, { value: 'accepted', label: 'ตอบรับแล้ว' }, { value: 'all', label: 'ทั้งหมด' },
];

export default function Portal({ kind }: { kind: PortalKind }) {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState(kind === 'clinic' ? 'appointments' : 'overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [requests, setRequests] = useState<AiRequest[]>([]);
  const [petId, setPetId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [appointmentFilter, setAppointmentFilter] = useState('requested');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState('all');
  const [aiFilter, setAiFilter] = useState('');
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('chordjai.session')) void establish();
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
  }, [tab, user]);

  async function establish() {
    setBusy(true);
    setError('');
    try {
      const profile = await api<User>('/identity/me');
      if (kind === 'admin' && profile.role !== 'admin') {
        throw new Error('บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแลระบบ กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์');
      }
      if (kind === 'clinic') {
        const [roles, data] = await Promise.all([
          api<Membership[]>('/clinic/memberships'), api<Appointment[]>('/clinic/appointments'),
        ]);
        if (!roles.length) throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์ในคลินิก กรุณาติดต่อผู้ดูแลคลินิก');
        const clinicIds = new Set(roles.map(role => role.clinicId));
        setMemberships(roles);
        setAppointments(data.filter(item => clinicIds.has(item.clinicId)));
      } else {
        const [data, queue, logs] = await Promise.all([
          api<Kpis>('/analytics/kpis'), api<Job[]>('/analytics/jobs'), api<AiRequest[]>('/analytics/ai-requests'),
        ]);
        setKpis(data);
        setJobs(queue);
        setRequests(logs);
      }
      setUser(profile);
      setUpdatedAt(new Date().toISOString());
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function login() {
    setBusy(true);
    setError('');
    try { await lineLogin(process.env.NEXT_PUBLIC_LIFF_ID || ''); await establish(); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  function selectTab(next: string) {
    setTab(next); setError(''); setNotice('');
  }

  function logout() {
    sessionStorage.removeItem('chordjai.session');
    setUser(null); setMemberships([]); setAppointments([]); setSummary(null);
    setKpis(null); setJobs([]); setRequests([]); setError(''); setNotice(''); setUpdatedAt(null);
  }

  async function changeAppointment(id: string, status: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/clinic/appointments/${id}`, json('PATCH', { status }));
      setAppointments(current => current.map(item => item.id === id ? { ...item, status } : item));
      setNotice(status === 'accepted' ? 'ตอบรับคำขอนัดแล้ว' : status === 'completed' ? 'บันทึกว่าตรวจแล้วเรียบร้อย' : 'อัปเดตสถานะคำขอแล้ว');
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function openSummary(id: string) {
    selectTab('summary'); setPetId(id); setSummary(null); setBusy(true);
    try { setSummary(await api<Summary>(`/clinic/pets/${encodeURIComponent(id.trim())}/summary`)); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function jobAction(id: string, action: 'replay' | 'discard') {
    if (action === 'discard' && !window.confirm('ทิ้งงานนี้หรือไม่? งานจะไม่ถูกนำกลับไปทำต่อ')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/analytics/jobs/${id}/${action}`, { method: 'POST' });
      setJobs(current => action === 'discard' ? current.filter(item => item.id !== id) : current.map(item =>
        item.id === id ? { ...item, status: 'queued', attempts: 0, lastError: undefined } : item));
      setKpis(current => current ? { ...current, deadJobs: Math.max(0, current.deadJobs - 1) } : current);
      setNotice(action === 'replay' ? 'นำงานกลับเข้าคิวแล้ว' : 'ทิ้งงานแล้ว');
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  if (!user) return <PortalLogin kind={kind} busy={busy} error={error} onLogin={() => void login()} />;

  const tabs = kind === 'clinic' ? clinicTabs : adminTabs;
  const currentTab = tabs.find(item => item.id === tab) || tabs[0];
  const filteredAppointments = appointments.filter(item => appointmentFilter === 'all' || item.status === appointmentFilter);
  const filteredJobs = jobs.filter(item => jobFilter === 'all' || item.status === jobFilter);
  const filteredRequests = requests.filter(item => !aiFilter || `${item.feature} ${item.model} ${item.status}`.toLowerCase().includes(aiFilter.toLowerCase()));

  return <div className={`portal-shell portal-${kind}`}>
    <a className="portal-skip-link" href="#portal-content">ข้ามไปเนื้อหา</a>
    <aside className="portal-sidebar">
      <a href="/app" className="portal-logo" aria-label="ชิดใจ หน้าหลัก"><PawPrint size={25} /><span>ชิดใจ<small>chordjai</small></span></a>
      <div className="portal-workspace"><span>{kind === 'clinic' ? 'พื้นที่คลินิก' : 'ผู้ดูแลระบบ'}</span><small>{kind === 'clinic' ? 'การดูแลที่ต่อเนื่อง' : 'ดูแลให้ทุกส่วนพร้อมใช้งาน'}</small></div>
      <nav ref={navRef} aria-label={kind === 'clinic' ? 'เมนูคลินิก' : 'เมนูผู้ดูแล'}>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => selectTab(id)}><Icon size={19} /><span>{label}</span>{id === 'jobs' && jobs.some(item => item.status === 'dead') ? <span className="portal-nav-count">{jobs.filter(item => item.status === 'dead').length}</span> : null}</button>)}
      </nav>
      <div className="portal-sidebar-bottom">
        <a className="portal-owner-link" href="https://www.chordjai.life"><ArrowUpRight size={16} />พื้นที่เจ้าของสัตว์เลี้ยง</a>
        <div className="portal-user"><span aria-hidden="true">{user.displayName.slice(0, 1)}</span><div><b>{user.displayName}</b><small>{kind === 'clinic' ? memberships[0]?.name : 'ผู้ดูแลระบบ'}</small></div></div>
        <button className="portal-logout" type="button" disabled={busy} onClick={logout}><LogOut size={16} />ออกจากระบบ</button>
      </div>
    </aside>
    <main className="portal-main" id="portal-content">
      <div className="portal-topline"><span>ชิดใจ / {kind === 'clinic' ? 'คลินิก' : 'ผู้ดูแลระบบ'}</span><span className="portal-updated">{updatedAt ? `อัปเดต ${timeThai(updatedAt)} น.` : 'กำลังโหลดข้อมูล'}</span></div>
      <header className="portal-page-header"><div><h1>{currentTab.label}</h1><p>{currentTab.help}</p></div><button className="portal-button secondary" type="button" disabled={busy} onClick={() => void establish()}><RefreshCw size={16} className={busy ? 'portal-spin' : ''} /><span>โหลดล่าสุด</span></button></header>
      {error ? <div className="portal-error" role="alert"><AlertCircle size={19} /><span>{error}</span></div> : null}
      {notice ? <div className="portal-note success" role="status"><Check size={19} /><span>{notice}</span></div> : null}
      {busy ? <div className="portal-loading" role="status"><span />กำลังเชื่อมต่อข้อมูล…</div> : null}

      {kind === 'clinic' && tab === 'appointments' ? <>
        <div className="portal-metric-strip">
          <Stat title="รอตอบรับ" value={appointments.filter(item => item.status === 'requested').length} icon={<CalendarDays size={20} />} accent />
          <Stat title="ตอบรับแล้ว" value={appointments.filter(item => item.status === 'accepted').length} icon={<Check size={20} />} />
          <Stat title="คำขอทั้งหมด" value={appointments.length} icon={<Users size={20} />} />
        </div>
        <section className="portal-panel portal-appointment-panel">
          <div className="portal-section-title"><div><span className="portal-eyebrow">นัดหมายและการดูแล</span><h2>คำขอจากเจ้าของ</h2></div><span className="portal-count">{filteredAppointments.length} รายการ</span></div>
          <div className="portal-filters" aria-label="กรองคำขอนัด">{appointmentFilters.map(({ value, label }) => <button key={value} type="button" aria-pressed={appointmentFilter === value} className={appointmentFilter === value ? 'active' : ''} onClick={() => setAppointmentFilter(value)}>{label}<span>{appointments.filter(item => value === 'all' || item.status === value).length}</span></button>)}</div>
          <div className="portal-appointment-list">
            {filteredAppointments.map(item => <article className="portal-appointment" key={item.id}>
              <div className="portal-appointment-date"><CalendarDays size={19} /><time dateTime={item.requestedAt}><b>{dateThai(item.requestedAt)}</b><span>{timeThai(item.requestedAt)} น.</span></time></div>
              <div className="portal-appointment-detail"><span className="portal-clinic-name">{memberships.find(role => role.clinicId === item.clinicId)?.name}</span><h3>{item.reason}</h3><div className="portal-pet-reference"><PawPrint size={14} /><span title={item.petId}>รหัสน้อง {item.petId.slice(0, 8)}</span><button className="portal-text-button" type="button" disabled={busy} onClick={() => void openSummary(item.petId)}>เปิดสมุดสุขภาพ<ArrowRight size={14} /></button></div></div>
              <div className="portal-appointment-manage"><Status status={item.status} /><div className="portal-row-actions">
                {item.status === 'requested' ? <><button disabled={busy} type="button" onClick={() => void changeAppointment(item.id, 'accepted')} className="portal-button small"><Check size={15} />ตอบรับ</button><button disabled={busy} type="button" onClick={() => void changeAppointment(item.id, 'declined')} className="portal-button small secondary">ปฏิเสธ</button></> : item.status === 'accepted' ? <button className="portal-button small secondary" type="button" disabled={busy} onClick={() => void changeAppointment(item.id, 'completed')}><Check size={15} />ตรวจแล้ว</button> : null}
              </div></div>
            </article>)}
            {!filteredAppointments.length ? <Empty icon={<CalendarDays size={28} />} title={appointmentFilter === 'all' ? 'ยังไม่มีคำขอนัด' : `ไม่มีคำขอที่${appointmentFilter === 'requested' ? 'รอตอบรับ' : 'ตอบรับแล้ว'}`} text="เมื่อเจ้าของส่งคำขอมาที่คลินิก รายละเอียดจะปรากฏในพื้นที่นี้" /> : null}
          </div>
          <div className="portal-panel-footnote"><ShieldCheck size={16} /><span>แสดงคำขอล่าสุดไม่เกิน 100 รายการ เฉพาะคลินิกที่คุณได้รับสิทธิ์ การเปิดสมุดสุขภาพต้องได้รับอนุญาตจากเจ้าของ</span></div>
        </section>
      </> : null}

      {kind === 'clinic' && tab === 'summary' ? <section className="portal-panel portal-health-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">ข้อมูลเพื่อดูแลต่อ</span><h2>เปิดสมุดสุขภาพของน้อง</h2></div><FileHeart size={25} className="portal-title-icon" /></div>
        <p className="portal-muted">ใช้รหัสน้องจากคำขอนัดหรือจากเจ้าของ เพื่อเปิดประวัติที่ได้รับอนุญาตให้อ่าน</p>
        <form className="portal-search-form" onSubmit={event => { event.preventDefault(); void openSummary(petId); }}>
          <label className="portal-field">รหัสน้อง<input required value={petId} onChange={event => setPetId(event.target.value)} placeholder="วางรหัสน้องที่นี่" autoComplete="off" /></label>
          <button className="portal-button" disabled={busy}><Search size={17} />เปิดสมุดสุขภาพ</button>
        </form>
        {summary ? <>
          <div className="portal-summary-pet"><span className="portal-pet-monogram"><PawPrint size={30} /></span><div><span className="portal-eyebrow">สมุดสุขภาพ</span><h2>{summary.pet.name}</h2><p>{summary.pet.species === 'cat' ? 'แมว' : 'สุนัข'}{summary.pet.weightKg != null ? ` · น้ำหนัก ${summary.pet.weightKg} กก.` : ''}</p></div><span className="portal-summary-count">{summary.records.length} บันทึก</span></div>
          <div className="portal-table-wrap"><table><caption className="portal-visually-hidden">ประวัติสุขภาพของ {summary.pet.name}</caption><thead><tr><th scope="col">รายการ</th><th scope="col">วันที่บันทึก</th><th scope="col">ครั้งถัดไป</th><th scope="col">หมายเหตุ</th></tr></thead><tbody>{summary.records.map((record, index) => <tr key={record.id || index}><td><b>{record.title}</b>{record.value != null ? <small>{record.value} กก.</small> : null}</td><td>{dateThai(record.recordedAt)}</td><td>{record.nextDueAt ? dateThai(record.nextDueAt) : '—'}</td><td className="portal-reason">{record.notes || '—'}</td></tr>)}</tbody></table></div>
          {!summary.records.length ? <Empty icon={<FileHeart size={28} />} title="ยังไม่มีบันทึกสุขภาพ" text="เมื่อเจ้าของบันทึกข้อมูลของน้อง ประวัติจะแสดงในสมุดเล่มนี้" /> : null}
        </> : <div className="portal-summary-awaiting"><FileHeart size={36} /><div><h3>เริ่มจากสมุดเล่มที่เจ้าของเลือกแชร์</h3><p>ถ้ายังเปิดไม่ได้ ให้เจ้าของตรวจสิทธิ์การแชร์และวันหมดอายุในแอปชิดใจ</p></div></div>}
        <div className="portal-panel-footnote"><ShieldCheck size={16} /><span>เจ้าของถอนสิทธิ์ได้ทุกเมื่อ และระบบบันทึกการเปิดสมุดสุขภาพแต่ละครั้ง</span></div>
      </section> : null}

      {kind === 'clinic' && tab === 'membership' ? <section className="portal-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">พื้นที่ทำงานของคุณ</span><h2>คลินิกที่ได้รับสิทธิ์</h2></div><span className="portal-count">{memberships.length} คลินิก</span></div>
        <div className="portal-membership-list">{memberships.map(item => <article className="portal-membership" key={item.clinicId}><span className="portal-membership-icon"><Hospital size={25} /></span><div><h3>{item.name}</h3><p>{roleLabel(item.role)}</p><span className="portal-reference">รหัสคลินิก <code>{item.clinicId}</code></span></div><span className="portal-membership-verified"><ShieldCheck size={16} />มีสิทธิ์เข้าถึง</span></article>)}</div>
        <div className="portal-panel-footnote"><CircleHelp size={17} /><span>หากต้องการเพิ่มหรือเปลี่ยนสิทธิ์สมาชิก กรุณาติดต่อผู้ดูแลคลินิก</span></div>
      </section> : null}

      {kind === 'admin' && tab === 'overview' && kpis ? <>
        <div className="portal-metric-strip admin"><Stat title="ผู้ใช้งาน" value={kpis.users} icon={<Users size={20} />} accent /><Stat title="สัตว์เลี้ยงในระบบ" value={kpis.pets} icon={<PawPrint size={20} />} /><Stat title="บันทึกสุขภาพ" value={kpis.healthRecords} icon={<FileHeart size={20} />} /><Stat title="คลินิกที่ตรวจสอบแล้ว" value={kpis.clinics} icon={<Hospital size={20} />} /></div>
        <div className="portal-overview-grid">
          <section className="portal-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">สิ่งที่เกิดขึ้นในชิดใจ</span><h2>การใช้งานแต่ละส่วน</h2></div><ArrowDownLeft size={22} className="portal-title-icon" /></div><dl className="portal-usage-list"><Usage icon={<BookOpen size={18} />} label="หน้าสมุดความทรงจำ" value={kpis.journalPages} /><Usage icon={<MessageSquare size={18} />} label="บทสนทนากับผู้ช่วย" value={kpis.conversations} /><Usage icon={<Activity size={18} />} label="การคัดกรองอาการ" value={kpis.triageSessions} /><Usage icon={<FileHeart size={18} />} label="การเปิดสรุปสุขภาพ" value={kpis.summaryViews} /><Usage icon={<Fingerprint size={18} />} label="ประกาศที่กำลังตามหา" value={kpis.activeLostCases} /></dl><p className="portal-caption">จำนวนสะสมจากข้อมูลที่บันทึกในระบบ</p></section>
          <div className="portal-insights"><section className="portal-panel portal-cost"><span className="portal-eyebrow">ต้นทุน AI วันนี้ · UTC</span><h2 className="portal-big-number"><small>USD</small> {Number(kpis.aiCostTodayUsd || 0).toFixed(4)}</h2><p className="portal-muted">ตามคำขอที่ระบบบันทึก ไม่รวมค่าบริการอื่น</p><button className="portal-text-button" type="button" onClick={() => selectTab('ai')}>ดูการเรียกใช้<ArrowRight size={17} /></button></section><section className={`portal-panel portal-attention ${kpis.deadJobs > 0 ? 'has-work' : ''}`}><div><span className="portal-eyebrow">งานที่ต้องดูแลต่อ</span><h2>{kpis.deadJobs} <span>งาน</span></h2><p>งานที่ลองทำครบแล้วและยังไม่สำเร็จ</p></div><button className="portal-icon" type="button" aria-label="ตรวจงานเบื้องหลัง" onClick={() => { selectTab('jobs'); setJobFilter('dead'); }}><ArrowRight size={21} /></button></section></div>
        </div>
        <section className="portal-panel portal-readiness"><div className="portal-section-title"><div><span className="portal-eyebrow">ก่อนขยายการใช้งาน</span><h2>การตรวจสอบที่ยังต้องดำเนินการ</h2></div><ShieldCheck size={24} className="portal-title-icon" /></div><div className="portal-readiness-list"><div><Activity size={20} /><h3>การคัดกรองอาการ</h3><p>รอสัตวแพทย์ตรวจชุดประเมิน</p></div><div><Fingerprint size={20} /><h3>ความแม่นยำ PetID</h3><p>รอวัดผลและปรับค่าจากภาพจริง</p></div><div><Users size={20} /><h3>การกลับมาใช้งาน</h3><p>ต้องมีข้อมูลผู้ใช้ก่อนวิเคราะห์ retention</p></div></div></section>
      </> : null}

      {kind === 'admin' && tab === 'ai' ? <section className="portal-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">คำขอล่าสุด</span><h2>การเรียกใช้ AI</h2></div><span className="portal-count">{requests.length} รายการที่โหลด</span></div>
        <div className="portal-table-toolbar"><label className="portal-inline-search"><Search size={17} /><input type="search" value={aiFilter} onChange={event => setAiFilter(event.target.value)} placeholder="ค้นหาฟีเจอร์ โมเดล หรือสถานะ" aria-label="ค้นหาการเรียกใช้ AI" /></label><span className="portal-muted">แสดง {filteredRequests.length} รายการ</span></div>
        <div className="portal-table-wrap"><table><caption className="portal-visually-hidden">การเรียกใช้ AI ล่าสุด โดยไม่เปิดเผยข้อความผู้ใช้</caption><thead><tr><th scope="col">ฟีเจอร์ / วันที่</th><th scope="col">โมเดล</th><th scope="col">Tokens เข้า / ออก</th><th scope="col">ระยะเวลา</th><th scope="col">ต้นทุน USD</th><th scope="col">สถานะ</th></tr></thead><tbody>{filteredRequests.map(item => <tr key={item.id}><td><b>{item.feature}</b><small>{dateThai(item.createdAt)} · {timeThai(item.createdAt)}</small></td><td><code>{item.model}</code>{item.modelResolved && item.modelResolved !== item.model ? <small>{item.modelResolved}</small> : null}</td><td className="portal-numeric">{number(item.inputTokens)} / {number(item.outputTokens)}</td><td className="portal-numeric">{number(item.latencyMs)} ms</td><td className="portal-numeric">{Number(item.costUsd || 0).toFixed(5)}</td><td><Status status={item.status} /></td></tr>)}</tbody></table></div>
        {!filteredRequests.length ? <Empty icon={<Activity size={28} />} title={aiFilter ? 'ไม่พบคำขอที่ตรงกับการค้นหา' : 'ยังไม่มีการเรียกใช้ AI'} text={aiFilter ? 'ลองเปลี่ยนคำค้นหรือดูรายการทั้งหมด' : 'เมื่อมีการใช้งานจริง ข้อมูลการเรียกใช้จะแสดงที่นี่'} /> : null}
        <div className="portal-panel-footnote"><ShieldCheck size={16} /><span>แสดงเฉพาะข้อมูลการทำงานของคำขอ ไม่แสดงข้อความหรือภาพส่วนตัวของผู้ใช้</span></div>
      </section> : null}

      {kind === 'admin' && tab === 'jobs' ? <section className="portal-panel">
        <div className="portal-section-title"><div><span className="portal-eyebrow">การส่งงานและสถานะ</span><h2>งานเบื้องหลัง</h2></div><Layers size={24} className="portal-title-icon" /></div>
        <div className="portal-filters" aria-label="กรองคิวงาน">{[['all', 'ทั้งหมด'], ['dead', 'ต้องตรวจ'], ['queued', 'เข้าคิว'], ['running', 'กำลังทำ'], ['done', 'สำเร็จ']].map(([value, label]) => <button type="button" key={value} aria-pressed={jobFilter === value} className={jobFilter === value ? 'active' : ''} onClick={() => setJobFilter(value)}>{label}<span>{jobs.filter(item => value === 'all' || item.status === value).length}</span></button>)}</div>
        <div className="portal-table-wrap"><table><caption className="portal-visually-hidden">สถานะงานเบื้องหลัง</caption><thead><tr><th scope="col">งาน</th><th scope="col">สถานะ</th><th scope="col">ครั้งที่ลอง</th><th scope="col">เวลาทำงาน</th><th scope="col">ข้อผิดพลาด</th><th scope="col">จัดการ</th></tr></thead><tbody>{filteredJobs.map(item => <tr key={item.id}><td><b>{item.topic}</b><small title={item.id}>รหัส {item.id.slice(0, 8)}</small></td><td><Status status={item.status} /></td><td className="portal-numeric">{item.attempts} / {item.maxAttempts}</td><td>{dateThai(item.runAt)}<small>{timeThai(item.runAt)} น.</small></td><td className="portal-reason">{item.lastError || '—'}</td><td>{item.status === 'dead' ? <div className="portal-row-actions"><button type="button" className="portal-icon success" disabled={busy} aria-label={`ทำงาน ${item.topic} อีกครั้ง`} title="ลองทำอีกครั้ง" onClick={() => void jobAction(item.id, 'replay')}><Play size={16} /></button><button type="button" className="portal-icon danger" disabled={busy} aria-label={`ทิ้งงาน ${item.topic}`} title="ทิ้งงาน" onClick={() => void jobAction(item.id, 'discard')}><Trash2 size={16} /></button></div> : '—'}</td></tr>)}</tbody></table></div>
        {!filteredJobs.length ? <Empty icon={<Layers size={28} />} title={jobFilter === 'all' ? 'ยังไม่มีงานในคิว' : 'ไม่มีงานในสถานะนี้'} text="งานแจ้งเตือนและงานเบื้องหลังจะปรากฏตามสถานะการทำงานจริง" /> : null}
        <div className="portal-panel-footnote"><CircleHelp size={16} /><span>ลองทำอีกครั้งหรือทิ้งงานได้เฉพาะงานที่ล้มเหลวครบจำนวนครั้งแล้ว</span></div>
      </section> : null}
      {kind === 'admin' && tab === 'clinics' ? <ClinicDirectory onSuccess={() => setNotice('บันทึกคลินิกที่ตรวจสอบแล้วในรายชื่อสาธารณะ')} /> : null}
      <footer className="portal-footer"><span>ชิดใจ · ดูแลกันในทุกวัน</span><span>{kind === 'clinic' ? 'ข้อมูลสุขภาพที่เจ้าของเลือกแชร์' : 'เวลาการทำงานแสดงตาม Asia/Bangkok'}</span></footer>
    </main>
  </div>;
}

function PortalLogin({ kind, busy, error, onLogin }: { kind: PortalKind; busy: boolean; error: string; onLogin: () => void }) {
  const clinic = kind === 'clinic';
  return <main className={`portal-login ${clinic ? 'clinic-login' : 'admin-login'}`}>
    <header className="portal-login-header"><a href="https://www.chordjai.life" className="portal-logo"><PawPrint size={25} /><span>ชิดใจ<small>chordjai</small></span></a><a className="portal-back" href="https://www.chordjai.life"><span>พื้นที่เจ้าของสัตว์เลี้ยง</span><ArrowUpRight size={17} /></a></header>
    <div className="portal-login-body"><section className="portal-login-card"><span className="portal-eyebrow">{clinic ? 'ชิดใจ สำหรับคลินิก' : 'ชิดใจ สำหรับผู้ดูแลระบบ'}</span><h1>{clinic ? <>ให้การดูแล<br />ต่อจากความใส่ใจ</> : <>ดูแลทุกส่วน<br />ให้พร้อมสำหรับทุกวัน</>}</h1><p>{clinic ? 'รับคำขอนัด เปิดสมุดสุขภาพที่เจ้าของเลือกแชร์ และเตรียมการดูแลน้องได้จากที่เดียว' : 'ตรวจการใช้งาน ค่าใช้จ่าย และงานเบื้องหลังของชิดใจ ด้วยข้อมูลที่เกิดขึ้นจริงในระบบ'}</p><div className="portal-login-action">{error ? <div className="portal-error" role="alert"><AlertCircle size={19} /><span>{error}</span></div> : null}<button className="portal-button" type="button" disabled={busy} onClick={onLogin}>{busy ? <><RefreshCw className="portal-spin" size={18} />กำลังตรวจสอบสิทธิ์…</> : <>เข้าสู่ระบบด้วย LINE<ArrowRight size={18} /></>}</button><p><ShieldCheck size={16} />{clinic ? 'สำหรับสมาชิกคลินิกที่ได้รับสิทธิ์' : 'สำหรับบัญชีผู้ดูแลระบบที่ได้รับสิทธิ์'}</p></div><div className="portal-login-details"><span>{clinic ? 'นัดหมาย' : 'การใช้งาน'}</span><span>{clinic ? 'สมุดสุขภาพ' : 'ต้นทุน AI'}</span><span>{clinic ? 'สิทธิ์การดูแล' : 'งานเบื้องหลัง'}</span></div></section>
      {clinic ? <figure className="portal-login-photo"><img src="/images/pet-home-dog.webp" alt="สุนัขที่ได้รับการดูแลอย่างอบอุ่น" width={840} height={1050} /><figcaption><span>ความไว้ใจ เริ่มจากความเข้าใจ</span><p>เจ้าของเลือกแบ่งปัน<br />คลินิกพร้อมดูแลต่อ</p><FileHeart size={24} /></figcaption></figure> : <section className="portal-admin-story" aria-label="หน้าที่ของผู้ดูแล"><span className="portal-eyebrow">พื้นที่ทำงานที่ชัดเจน</span><h2>ดูสิ่งที่เกิดขึ้น<br />แล้วดูแลสิ่งที่ต้องทำ</h2><ol><li><span>01</span><div><h3>การใช้งานจริง</h3><p>จำนวนผู้ใช้ สัตว์เลี้ยง และการดูแลที่บันทึกไว้</p></div><ChartNoAxesCombined size={22} /></li><li><span>02</span><div><h3>การทำงานของบริการ</h3><p>สถานะ เวลา และต้นทุนของคำขอ AI</p></div><Activity size={22} /></li><li><span>03</span><div><h3>เรื่องที่ต้องลงมือ</h3><p>งานที่ไม่สำเร็จและข้อมูลคลินิกที่รอตรวจสอบ</p></div><SlidersHorizontal size={22} /></li></ol><div className="portal-admin-privacy"><ShieldCheck size={18} /><p>ตรวจระบบโดยรักษาความเป็นส่วนตัวของเจ้าของและสัตว์เลี้ยง</p></div></section>}
    </div><footer className="portal-login-footer"><span>ชิดใจ · ดูแลกันในทุกวัน</span><span>{clinic ? 'สำหรับคลินิกและทีมดูแลสัตว์เลี้ยง' : 'สำหรับทีมดูแลการทำงานของชิดใจ'}</span></footer>
  </main>;
}

function Stat({ title, value, icon, accent = false }: { title: string; value: number; icon: ReactNode; accent?: boolean }) {
  return <article className={`portal-stat ${accent ? 'accent' : ''}`}><div><span>{icon}</span><small>{title}</small></div><b>{number(value)}</b></article>;
}
function Usage({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div><dt>{icon}{label}</dt><dd>{number(value)}</dd></div>;
}
function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="portal-empty"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}
function Status({ status }: { status: string }) {
  const labels: Record<string, string> = { requested: 'รอตอบรับ', accepted: 'ตอบรับแล้ว', declined: 'ปฏิเสธ', cancelled: 'ยกเลิก', completed: 'ตรวจแล้ว', queued: 'เข้าคิว', running: 'กำลังทำ', done: 'สำเร็จ', dead: 'ต้องตรวจ', success: 'สำเร็จ', failed: 'ล้มเหลว' };
  return <span className={`portal-status ${status}`}><span aria-hidden="true" />{labels[status] || status}</span>;
}
function number(value: number) { return Number(value || 0).toLocaleString('th-TH'); }
function timeThai(date: string) { return new Date(date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); }
function roleLabel(role: string) {
  const labels: Record<string, string> = { owner: 'เจ้าของคลินิก', vet: 'สัตวแพทย์', staff: 'ทีมดูแลคลินิก', admin: 'ผู้ดูแลคลินิก' };
  return labels[role] || role;
}

function ClinicDirectory({ onSuccess }: { onSuccess: () => void }) {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true); setLoadError('');
    try { setClinics(await api<Clinic[]>('/clinics', {}, true)); }
    catch (caught) { setLoadError(messageOf(caught)); }
    finally { setLoading(false); }
  }
  const visible = clinics.filter(item => !query || `${item.name} ${item.district}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <section className="portal-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">รายชื่อที่ตรวจสอบแล้ว</span><h2>เครือข่ายคลินิก</h2></div><button type="button" className={`portal-button ${showForm ? 'secondary' : ''}`} onClick={() => setShowForm(value => !value)}>{showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? 'ปิดแบบฟอร์ม' : 'เพิ่มคลินิก'}</button></div><div className="portal-table-toolbar"><label className="portal-inline-search"><Search size={17} /><input type="search" aria-label="ค้นหารายชื่อคลินิก" placeholder="ค้นหาชื่อคลินิกหรือย่าน" value={query} onChange={event => setQuery(event.target.value)} /></label><span className="portal-muted">{visible.length} คลินิก</span></div>{loadError ? <div className="portal-error" role="alert"><AlertCircle size={18} /><span>{loadError}</span><button type="button" className="portal-text-button" onClick={() => void load()}>ลองใหม่</button></div> : null}{loading ? <div className="portal-loading" role="status"><span />กำลังโหลดรายชื่อคลินิก…</div> : <div className="portal-directory">{visible.map(item => <article key={item.id}><span className="portal-membership-icon"><Hospital size={22} /></span><div><h3>{item.name}</h3><p>{item.district} · {item.address}</p><a href={`tel:${item.phone}`}>{item.phone}</a></div>{item.is24h ? <span className="portal-clinic-hours"><Clock3 size={14} />24 ชั่วโมง</span> : null}</article>)}</div>}{!loading && !loadError && !visible.length ? <Empty icon={<Hospital size={28} />} title={query ? 'ไม่พบคลินิกที่ตรงกับการค้นหา' : 'ยังไม่มีคลินิกในเครือข่าย'} text={query ? 'ลองค้นหาด้วยชื่อหรือย่านอื่น' : 'เพิ่มคลินิกหลังตรวจสอบข้อมูลติดต่อและเวลาเปิดแล้ว'} /> : null}</section>
    {showForm ? <ClinicCreate onSuccess={clinic => { setClinics(current => [clinic, ...current.filter(item => item.id !== clinic.id)]); setShowForm(false); onSuccess(); }} /> : null}
  </>;
}

function ClinicCreate({ onSuccess }: { onSuccess: (clinic: Clinic) => void }) {
  const [name, setName] = useState(''); const [district, setDistrict] = useState('');
  const [phone, setPhone] = useState(''); const [address, setAddress] = useState('');
  const [is24h, setIs24h] = useState(false); const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <section className="portal-panel portal-create-panel"><div className="portal-section-title"><div><span className="portal-eyebrow">เพิ่มข้อมูลในเครือข่าย</span><h2>คลินิกที่ตรวจสอบแล้ว</h2></div><Hospital size={24} className="portal-title-icon" /></div><p className="portal-muted">ข้อมูลจะปรากฏต่อเจ้าของเมื่อบันทึก กรุณาตรวจชื่อ เบอร์โทร ที่อยู่ และเวลาเปิดกับคลินิกก่อน</p><form className="portal-clinic-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const clinic = await api<Clinic>('/clinic/admin/clinics', json('POST', { name, district, phone, address, is24h, lat: null, lng: null }));
      onSuccess(clinic); setName(''); setDistrict(''); setPhone(''); setAddress(''); setVerified(false);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }}><label className="portal-field">ชื่อคลินิก<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อที่เจ้าของค้นหาได้" /></label><div className="portal-form-grid"><label className="portal-field">เขต / ย่าน<input required maxLength={100} value={district} onChange={event => setDistrict(event.target.value)} /></label><label className="portal-field">เบอร์โทร<input required type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" /></label></div><label className="portal-field">ที่อยู่<textarea required rows={3} maxLength={500} value={address} onChange={event => setAddress(event.target.value)} autoComplete="street-address" /></label><fieldset className="portal-verification"><legend>ตรวจข้อมูลก่อนเผยแพร่</legend><label className="portal-check"><input type="checkbox" checked={is24h} onChange={event => setIs24h(event.target.checked)} /><span>คลินิกยืนยันว่าเปิด 24 ชั่วโมง</span></label><label className="portal-check"><input type="checkbox" required checked={verified} onChange={event => setVerified(event.target.checked)} /><span>ตรวจข้อมูลติดต่อและเวลาเปิดกับคลินิกแล้ว</span></label></fieldset>{error ? <div className="portal-error" role="alert"><AlertCircle size={19} /><span>{error}</span></div> : null}<button className="portal-button" disabled={busy || !verified}><Plus size={17} />{busy ? 'กำลังบันทึก…' : 'บันทึกในรายชื่อสาธารณะ'}</button></form></section>;
}
