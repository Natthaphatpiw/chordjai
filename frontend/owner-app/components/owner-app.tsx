'use client';
import { useLocale, LanguageSwitcher } from '../../shared/locale';
import { localizedHref } from '../../shared/locale-core';
import { localizeStatus } from './status-copy';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import './owner-refresh.css';
import '../../shared/care-summary.css';
import CareSharePreview from './care-share-preview';
import HomeCarePreview from './home-care-preview';
import { RecordIcon } from './record-icon';
import { PawPrint, Home, Heart, NotebookPen, MessageCircle, MapPin, Search, Settings, Plus, ArrowRight, ChevronDown, ShieldCheck, Users, Bell, LogOut, Siren, Sparkles, ScanLine, CalendarDays, Link2, Check, X, Cat, Dog, UserRound, Leaf, BookOpen } from 'lucide-react';
import { api, json, lineLogin, autoLineLogin, clearLineSession, ApiError, messageOf, dateForLocale } from '../../shared/api';
import { demoPets, demoRecords, localizeDemoPets, localizeDemoRecords } from '../lib/demo';
import type { Pet, HealthRecord, Notification } from '../lib/types';
import type { CareMemoryDraft } from '../lib/care-types';
import { Modal, Busy, ErrorBox, Empty, Notice } from './ui';
import { Health } from './health';
import { Care } from './care';
import PetId from './petid';
import { PrivacySettings } from './settings';
function JournalLoading(){const {t}=useLocale();return <Busy label={t("กำลังเปิดสมุด","Opening your journal")}/>;}
function AssistantLoading(){const {t}=useLocale();return <Busy label={t("กำลังเปิดผู้ช่วย","Opening your assistant")}/>;}
const Journal = dynamic(() => import('./journal'), { loading: JournalLoading });
const Assistant = dynamic(() => import('./assistant'), { loading: AssistantLoading });
type Tab = 'home' | 'health' | 'journal' | 'chat' | 'care' | 'settings';
function useTabs(){const {t}=useLocale();return [{ id: 'home', label: t("หน้าหลัก","Home"), icon: Home }, { id: 'health', label: t("สมุดสุขภาพ","Health journal"), icon: Heart }, { id: 'journal', label: t("ความทรงจำ","Memories"), icon: NotebookPen }, { id: 'chat', label: t("ผู้ช่วยของเรา","Assistant"), icon: MessageCircle }, { id: 'care', label: t("คลินิกและ PetID","Clinics & PetID"), icon: MapPin }, { id: 'settings', label: t("ตั้งค่าของเรา","Settings"), icon: Settings }] as const;}
function loadDemo<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T ?? fallback; } catch { return fallback; } }
export default function OwnerApp() { const {locale,t}=useLocale(); const tabs=useTabs();
  const [mode, setMode] = useState<'choose' | 'demo' | 'live'>('choose');
  const [tab, setTab] = useState<Tab>('home');
  const [startTriage,setStartTriage]=useState(false);
  const [startOcr,setStartOcr]=useState(false);
  const [startDiary,setStartDiary]=useState(false);
  const [memoryDraft,setMemoryDraft]=useState<(CareMemoryDraft&{key:string})|null>(null);
  const [shareOptions,setShareOptions]=useState(false);
  const [includeCare,setIncludeCare]=useState(false);
  const [includeCosts,setIncludeCosts]=useState(false);
  const [sharePreviewReady,setSharePreviewReady]=useState(false);
  const shareCreationKey=useRef('');
  const shareAttempt=useRef<{petId:string;includeCare:boolean;includeCosts:boolean}|null>(null);
  const [shareFrozen,setShareFrozen]=useState(false);
  const [shareError,setShareError]=useState('');
  const [invitation,setInvitation]=useState('');
  const [careStart,setCareStart]=useState<'clinics'|'lost'>('clinics');
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [addingPet, setAddingPet] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [inbox, setInbox] = useState<Notification[]>([]);
  const [consent, setConsent] = useState(false);
  const [serviceAccepted, setServiceAccepted] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [shareLink, setShareLink] = useState<{ id: string; url: string; expiresAt?: string } | null>(null);
  const pet = pets.find(item => item.id === selectedId) ?? pets[0];
  const demo = mode === 'demo';
  const currentPetId=useRef(pet?.id);currentPetId.current=pet?.id;
  const asyncEpoch = useRef(0);
  const mounted = useRef(false);
  const journalDirty = useRef(false);
  const careDirty = useRef(false);
  const petidResearchDirty=useRef(false);
  const followupDirty=useRef(false);
  const followupOpened=useRef('');
  const localeRef = useRef(locale);
  localeRef.current = locale;
  function current(run: number) { return mounted.current && run === asyncEpoch.current; }
  function mayLeaveJournal() {
    return !(journalDirty.current||careDirty.current||petidResearchDirty.current||followupDirty.current) || window.confirm(t('มีบันทึกที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?', 'You have unsaved changes. Leave without saving?'));
  }
  function changeTab(next: Tab) {
    if (next === tab || !mayLeaveJournal()) return;
    journalDirty.current = false; careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;
    setTab(next); setStartDiary(false); setMemoryDraft(null); setStartOcr(false); setStartTriage(false); setError(''); setNotice('');
  }
  function changePet(next: string) {
    if (next === pet?.id || !mayLeaveJournal()) return;
    journalDirty.current = false; careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;
    setMemoryDraft(null);setShareOptions(false);setShareLink(null);setStartDiary(false);setSelectedId(next);
  }
  function logout() {
    if (!mayLeaveJournal()) return;
    asyncEpoch.current++;
    clearLineSession();
    journalDirty.current = false; careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;
    setMode('choose'); setPets([]); setRecords([]); setConsent(false); setServiceAccepted(false); setAiConsent(false);
    setShowInbox(false); setInbox([]); setShareLink(null);setShareOptions(false);setMemoryDraft(null); setAddingPet(false); setLoading(false); setAuthChecking(false); setError(''); setNotice('');
  }
  useEffect(() => {
    const changed = (event: Event) => { journalDirty.current = Boolean((event as CustomEvent<{dirty:boolean}>).detail?.dirty); };
    const careChanged=(event:Event)=>{careDirty.current=Boolean((event as CustomEvent<{dirty:boolean}>).detail?.dirty);};
    const researchChanged=(event:Event)=>{petidResearchDirty.current=Boolean((event as CustomEvent<{dirty:boolean}>).detail?.dirty);};
    const followupChanged=(event:Event)=>{followupDirty.current=Boolean((event as CustomEvent<{dirty:boolean}>).detail?.dirty);};
    window.addEventListener('chordjai:petid-research-dirty',researchChanged);window.addEventListener('chordjai:followup-dirty',followupChanged);
    window.addEventListener('chordjai:journal-dirty', changed);window.addEventListener('chordjai:care-dirty',careChanged);
    return () => {window.removeEventListener('chordjai:petid-research-dirty',researchChanged);window.removeEventListener('chordjai:followup-dirty',followupChanged);window.removeEventListener('chordjai:journal-dirty', changed);window.removeEventListener('chordjai:care-dirty',careChanged);};
  }, []);
  useEffect(()=>{
    if(mode!=='live'||consent)return;
    const id=new URLSearchParams(window.location.search).get('followupId');
    if(!id||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||followupOpened.current===id)return;
    followupOpened.current=id;
    void api(`/notification/followup/${encodeURIComponent(id)}/opened`,{method:'POST'}).catch(()=>{});
  },[mode,consent]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [mode]);
  useEffect(()=>{if(demo)setPets(current=>localizeDemoPets(current,locale));},[locale,demo]);
  useEffect(() => {
    mounted.current = true;
    const run = ++asyncEpoch.current;
    const search = new URLSearchParams(window.location.search);
    setInvitation(search.get('invite') || '');
    const requested = search.get('tab');
    if (requested && ['home','health','journal','chat','settings'].includes(requested)) setTab(requested as Tab);
    else if (requested === 'triage') { setTab('health'); setStartTriage(true); }
    else if (requested && ['care','clinics','lostfound','petid'].includes(requested)) { setTab('care'); setCareStart(requested === 'clinics' ? 'clinics' : 'lost'); }
    void bootstrap(run);
    return () => { mounted.current = false; asyncEpoch.current++; };
  }, []);
  useEffect(() => {
    if (!pet) { setRecords([]); setRecordsLoading(false); return; }
    if (demo) { setRecords(localizeDemoRecords(loadDemo('chordjai.demo.records.v1', demoRecords),locale).filter(item => item.petId === pet.id)); setRecordsLoading(false); return; }
    const run = asyncEpoch.current;
    let cancelled = false; setRecordsLoading(true); setRecords([]);
    api<HealthRecord[]>(`/health/records?petId=${encodeURIComponent(pet.id)}`).then(data => { if (!cancelled && current(run)) setRecords(data); }).catch(caught => { if (!cancelled && current(run)) { setRecords([]); setError(messageOf(caught,localeRef.current)); } }).finally(() => { if (!cancelled && current(run)) setRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [pet?.id, demo,locale]);
  async function establishOwner(run: number) {
    const [data, permissions] = await Promise.all([
      api<Pet[]>('/pets'), api<{purpose:string;granted:boolean}[]>('/identity/consents'),
    ]);
    if (!current(run)) return;
    const requestedPetId=new URLSearchParams(window.location.search).get('petId');
    const selectedPet=data.find(item=>item.id===requestedPetId)??data[0];
    setPets(data); setSelectedId(selectedPet?.id || ''); setMode('live');
    setConsent(!permissions.some(item => item.purpose === 'service' && item.granted));
  }
  async function bootstrap(run: number) {
    try {
      if (sessionStorage.getItem('chordjai.session')) {
        // api() owns the sole renewal attempt. Never restart LINE after its
        // exhausted retry; this prevents a rejected refreshed session looping.
        await establishOwner(run);
      } else if (await autoLineLogin(process.env.NEXT_PUBLIC_LIFF_ID || '')) {
        if (current(run)) await establishOwner(run);
      }
    } catch (caught) {
      if (current(run)) {
        if (caught instanceof ApiError && caught.status === 401) clearLineSession();
        setError(messageOf(caught,localeRef.current));
      }
    } finally { if (current(run)) setAuthChecking(false); }
  }
  async function refreshPets() {
    const run = asyncEpoch.current;
    setLoading(true); setError('');
    try { const data = await api<Pet[]>('/pets'); if (current(run)) { setPets(data); setSelectedId(selected => selected || data[0]?.id || ''); } }
    catch (caught) { if (current(run)) setError(messageOf(caught,localeRef.current)); }
    finally { if (current(run)) setLoading(false); }
  }
  async function login() {
    const run = ++asyncEpoch.current;
    setLoading(true); setError('');
    try { await lineLogin(process.env.NEXT_PUBLIC_LIFF_ID || ''); if (current(run)) await establishOwner(run); }
    catch (caught) { if (current(run)) setError(messageOf(caught,localeRef.current)); }
    finally { if (current(run)) setLoading(false); }
  }
  function enterDemo() {
    asyncEpoch.current++; clearLineSession();
    setMode('demo'); setLoading(false); setAuthChecking(false); setConsent(false);
    const data = localizeDemoPets(loadDemo('chordjai.demo.pets.v1', demoPets),locale);
    setPets(data); setSelectedId(data[0]?.id ?? ''); setError('');
  }
  function persistPets(next: Pet[]) { localStorage.setItem('chordjai.demo.pets.v1', JSON.stringify(next));setPets(next); }
  function updateRecords(next: HealthRecord[]) { if (demo && pet) { const all = loadDemo('chordjai.demo.records.v1', demoRecords); localStorage.setItem('chordjai.demo.records.v1', JSON.stringify([...all.filter(item => item.petId !== pet.id), ...next])); }setRecords(next); }
  async function openInbox() { const run=asyncEpoch.current; setShowInbox(true); if (demo) { setInbox([]); return; } try { const data=await api<Notification[]>('/notification/inbox'); if(current(run))setInbox(data); } catch (caught) { if(current(run))setError(messageOf(caught,localeRef.current)); } }
  function openDiary(){if(!mayLeaveJournal())return;journalDirty.current=false;careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;setStartOcr(false);setStartTriage(false);setStartDiary(true);setTab('health');}
  function keepMemory(draft:CareMemoryDraft){setMemoryDraft({...draft,key:crypto.randomUUID()});setTab('journal');}
  function createShare(){shareCreationKey.current=crypto.randomUUID();shareAttempt.current=null;setShareFrozen(false);setShareError('');setIncludeCare(false);setIncludeCosts(false);setSharePreviewReady(false);setShareOptions(true);}
  async function commitShare(){
    if(!pet||loading||demo)return;
    const run=asyncEpoch.current;
    const body=shareAttempt.current??{petId:pet.id,includeCare,includeCosts:includeCare&&includeCosts};
    shareAttempt.current=body;setShareFrozen(true);setShareError('');setLoading(true);
    try{
      const data=await api<{id:string;url:string;expiresAt?:string}>('/share/links',{...json('POST',body),headers:{'Idempotency-Key':shareCreationKey.current}});
      if(current(run)&&currentPetId.current===body.petId){setShareOptions(false);setShareLink(data);}
    }catch(caught){if(current(run)&&currentPetId.current===body.petId)setShareError(messageOf(caught,localeRef.current));}
    finally{if(current(run))setLoading(false);}
  }
  if (authChecking) return <main className="login-page"><Busy label={t('กำลังเปิดพื้นที่ของคุณ…','Opening your space…')}/></main>;
  if (mode === 'choose') return <main className="login-page owner-login"><header className="login-topline"><Link href={localizedHref("/",locale)} className="wordmark"><span className="brand-mark"><PawPrint size={25}/></span>{t("ชิดใจ","ChordJai")}</Link><LanguageSwitcher/></header><div className="owner-login-layout"><figure className="login-photo"><Image src="/images/pet-home-cat.webp" alt={t("แมวพักผ่อนอยู่ที่บ้าน","A cat relaxing at home")} fill sizes="(max-width: 760px) 100vw, 50vw" preload/><figcaption>{t("ใกล้กันในทุกวัน","A little closer, every day")}</figcaption></figure><div className="login-card"><span className="eyebrow">{t("พื้นที่ของคุณและน้อง","A space for you and your pet")}</span><h1>{t("เรื่องของน้อง","Your pet's world,")}<br/>{t("ดูแลได้จากตรงนี้","cared for right here")}</h1><p>{t("บันทึกสุขภาพ เก็บวันที่น่าจดจำ","Record health and keep days worth remembering,")}<br/>{t("และคุยกับผู้ช่วยที่รู้เรื่องของคุณ","with an assistant that knows your story.")}</p>{error ? <ErrorBox message={error}/> : null}<button className="button full" onClick={() => void login()} disabled={loading}>{loading ? t("กำลังเชื่อมต่อ LINE…","Connecting to LINE…") : t("เข้าสู่ระบบด้วย LINE","Sign in with LINE")}<ArrowRight size={18}/></button><button className="button secondary full" onClick={enterDemo}>{t("ลองดูพื้นที่ตัวอย่างก่อน ","Explore the demo first")}<BookOpen size={18}/></button><small>{t("พื้นที่ตัวอย่างเก็บข้อมูลในเบราว์เซอร์นี้","The demo keeps information in this browser.")}<br/>{t("เมื่อพร้อม ค่อยเชื่อมต่อ LINE เพื่อใช้บัญชีจริง","When you're ready, connect LINE to use your own account.")}</small><div className="login-legal"><Link href={localizedHref("/privacy",locale)}>{t("ความเป็นส่วนตัว","Privacy")}</Link><Link href={localizedHref("/terms",locale)}>{t("เงื่อนไขบริการ","Terms of service")}</Link><Link href={localizedHref("/emergency",locale)}>{t("ข้อมูลฉุกเฉิน","Emergency information")}</Link></div></div></div></main>;
  return <div className="app-shell"><aside className="sidebar"><Link className="wordmark" href={localizedHref("/",locale)} onClick={event=>{if(!mayLeaveJournal())event.preventDefault();}}><span className="brand-mark"><PawPrint size={25}/></span>{t("ชิดใจ","ChordJai")}</Link><p className="sidebar-caption">{t("ทุกเรื่องของน้อง อยู่ใกล้ใจ","Your pet's everyday, close at heart")}</p><nav aria-label={t("เมนูหลัก","Main navigation")}>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => changeTab(id)}><Icon size={21}/><span>{label}</span>{id === 'chat' ? <span className="tiny-badge">AI</span> : null}</button>)}</nav><div className="sidebar-note"><Leaf size={22} strokeWidth={1.5}/><b>{t("ความรักในทุกวัน","Love in the everyday")}</b><p>{t("ไม่ต้องจำทุกเรื่องคนเดียว","You don't have to remember it all.")}<br/>{t("เราช่วยเก็บไว้ให้คุณ","We'll help you keep it together.")}</p></div><button className="logout" onClick={logout}><LogOut size={18}/>{demo ? t("ออกจากตัวอย่าง","Leave the demo") : t("ออกจากระบบ","Sign out")}</button></aside>
    <div className="app-content"><header className="app-header"><div className="header-breadcrumb"><span>{t("พื้นที่ของเรา","Your space")}</span><span>/</span><strong>{tabs.find(item => item.id === tab)?.label}</strong></div><div className="header-actions"><LanguageSwitcher/><Link href={localizedHref("/emergency",locale)} className="emergency-link" onClick={event=>{if(!mayLeaveJournal())event.preventDefault();}}><Siren size={17}/><span>{t("ฉุกเฉิน","Emergency")}</span></Link><button className="icon-button" aria-label={t("เปิดการแจ้งเตือน","Open notifications")} onClick={() => void openInbox()}><Bell size={21}/></button><button className="user-avatar" onClick={()=>changeTab('settings')} aria-label={t("เปิดตั้งค่าของเรา","Open settings")}><UserRound size={20}/></button></div></header>
    {demo ? <div className="demo-banner"><Sparkles size={16}/><span><b>{t("พื้นที่ตัวอย่าง","Demo space")}</b> {t(" ข้อมูลอยู่ในเบราว์เซอร์นี้ · AI และ LINE ยังไม่เชื่อมต่อ","Data stays in this browser · AI and LINE are not connected.")}</span><button onClick={logout}>{t("เชื่อมต่อ LINE ","Connect LINE")}<ArrowRight size={15}/></button></div> : null}
    <main className="main-content"><div className="pet-bar"><div className="pet-switcher">{pets.map(item => <button key={item.id} onClick={() => changePet(item.id)} className={`pet-chip ${item.id === pet?.id ? 'selected' : ''}`}><span>{item.species === 'cat' ? <Cat size={19}/> : <Dog size={19}/>}</span>{item.name}{item.id === pet?.id ? <ChevronDown size={14}/> : null}</button>)}<button className="add-pet" onClick={() => setAddingPet(true)}><Plus size={18}/><span>{t("เพิ่มน้อง","Add a pet")}</span></button></div><span className="private-mark"><ShieldCheck size={16}/> {t(" พื้นที่ส่วนตัวของเรา","Your private space")}</span></div>
    {error ? <div className="dismissible"><ErrorBox message={error}/><button className="icon-button" aria-label={t("ปิดข้อผิดพลาด","Dismiss error")} onClick={() => setError('')}><X size={18}/></button></div> : null}{notice ? <Notice>{localizeStatus(notice,locale)}<button className="text-button" onClick={() => setNotice('')}>{t("ปิด","Close")}</button></Notice> : null}
    {loading ? <Busy/> : recordsLoading ? <Busy label={t("กำลังอ่านสมุดสุขภาพ","Loading health records")}/> : null}
    {!pet && !loading && tab !=='care' ? <div className="welcome-empty"><span className="empty-icon"><PawPrint size={36} strokeWidth={1.3}/></span><span className="eyebrow">{t("บ้านใหม่ของเรื่องราวน้อง","A new home for your pet's story")}</span><h1>{t("เริ่มจากชื่อน้องกันเลย","Let's start with a name")}</h1><p>{t("เพิ่มโปรไฟล์แรก แล้วเก็บทุกเรื่องสำคัญไว้ด้วยกัน","Add your first pet and keep the important details together.")}</p><button className="button" onClick={() => setAddingPet(true)}>{t("เพิ่มน้องตัวแรก ","Add your first pet")}<Plus size={18}/></button><div style={{marginTop:16}}><button className="button secondary" onClick={()=>setTab('care')}><Search size={18}/>{t("ฉันพบสัตว์ · ค้น PetID","I found a pet · Search PetID")}</button><p style={{marginTop:12,fontSize:12}}>{t("ช่วยพาน้องกลับบ้านได้ แม้ยังไม่มีสัตว์เลี้ยงของคุณเอง","Help a pet get home, even if you don't own a pet.")}</p></div></div> : null}
    {!pet&&!loading&&tab==='care'?<section><div className="page-heading"><div><span className="eyebrow">BRING THEM HOME</span><h1>{t("ช่วยพาน้องที่พบกลับบ้าน","Help a found pet get home")}</h1><p>{t("ใช้รูปค้นกับประกาศที่เปิดอยู่ โดยไม่ต้องสร้างโปรไฟล์น้องของตัวเอง","Search active notices using a photo. You don't need to create your own pet profile.")}</p></div><button className="button secondary" onClick={()=>setTab('home')}>{t("กลับหน้าหลัก","Back to home")}</button></div><PetId demo={demo}/></section>:null}
    {pet && tab === 'home' ? <div className="owner-dashboard"><div className="page-heading"><div><span className="eyebrow">{t("บันทึกเล็ก ๆ ของทุกวัน","Little notes, every day")}</span><h1>{t("วันนี้ของเรา กับ","Today, with ")}<span>{pet.name}</span></h1><p>{t("มีเรื่องไหนอยากเก็บไว้ หรืออยากดูแลให้ดีขึ้นบ้าง","What would you like to remember or care for today?")}</p></div><div className="date-pill"><CalendarDays size={17}/>{new Date().toLocaleDateString(locale==='th'?'th-TH':'en-US', { day: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' })}</div></div>
      <section className="owner-daily-invitation"><div><span className="eyebrow">{t('เรื่องเล็ก ๆ ของน้อง มีความหมายเสมอ','The little changes matter')} </span><h2>{t(`วันนี้ ${pet.name} เป็นอย่างไรบ้าง?`,`How is ${pet.name} today?`)}</h2><p>{t('อาการที่สังเกต การไปพบหมอ หรือแค่เรื่องที่อยากเล่า เก็บไว้แล้วค่อย ๆ ดูแลไปด้วยกัน','A symptom, a vet visit, or a moment you want to remember. Write a little, keep the story together.')}</p></div><button type="button" className="button" onClick={openDiary}><NotebookPen size={20}/>{t('บันทึกวันนี้','Write today’s update')}</button></section><HomeCarePreview key={`${pet.id}:${demo}`} pet={pet} demo={demo} onOpen={()=>changeTab('health')}/><div className="owner-day-layout"><section className="owner-pet-profile"><PetProfileMedia key={pet.photoUrl || pet.id} pet={pet} demo={demo}/><div className="profile-pet-details"><span className="eyebrow">{t("สมาชิกคนสำคัญ","A member of the family")}</span><h2>{pet.name}</h2><dl><div><dt>{t("ชนิด","Species")}</dt><dd>{pet.species === 'cat' ? t("แมว","Cat") : t("สุนัข","Dog")}</dd></div><div><dt>{t("เพศ","Sex")}</dt><dd>{pet.sex === 'female' ? t("ตัวเมีย","Female") : pet.sex === 'male' ? t("ตัวผู้","Male") : t("ยังไม่ทราบ","Unknown")}</dd></div><div><dt>{t("น้ำหนัก","Weight")}</dt><dd>{pet.weightKg ? t(`${pet.weightKg} กก.`,`${pet.weightKg} kg`) : t("ยังไม่บันทึก","Not recorded")}</dd></div></dl><button className="text-button" onClick={() => setTab('health')}>{t("เปิดสมุดสุขภาพ ","Open health journal")}<ArrowRight size={17}/></button></div></section><section className="owner-agenda"><div className="agenda-heading"><span className="eyebrow">{t("เรื่องที่เราเก็บไว้ให้","A few things to remember")}</span><h2>{t("นัดครั้งถัดไป","Next appointment")}</h2><CalendarDays size={25} strokeWidth={1.5}/></div>{records.filter(item => item.nextDueAt).length ? records.filter(item => item.nextDueAt).sort((a,b) => (a.nextDueAt ?? '').localeCompare(b.nextDueAt ?? '')).slice(0, 3).map(item => <div className="agenda-item" key={item.id}><RecordIcon kind={item.kind}/><div><b>{item.title}</b><p>{dateForLocale(item.nextDueAt,locale)}</p></div><ArrowRight size={17}/></div>) : <div className="agenda-empty"><p>{t("ยังไม่มีวันนัดที่บันทึกไว้","No dates recorded yet")}</p><small>{t("เพิ่มวัคซีน ยา หรือวันนัดในสมุดสุขภาพ","Add vaccines, medication or appointments to the health journal.")}<br/>{t("แล้ววันสำคัญจะมาอยู่ตรงนี้","The important dates will appear here.")}</small></div>}<button className="text-button" onClick={() => setTab('health')}>{t("จัดการวันนัด ","Manage dates")}<ArrowRight size={16}/></button><div className="agenda-help"><Heart size={19}/><p>{t("เจออาการที่ไม่แน่ใจ?","Not sure about a symptom?")}<br/><button className="text-button" onClick={() => {setStartOcr(false);setStartTriage(true);setTab('health');}}>{t("เช็กความเร่งด่วนก่อนพบหมอ ","Check urgency before a vet visit")}<ArrowRight size={15}/></button></p></div></section></div>
      <div className="owner-action-heading"><h2>{t("ดูแล เก็บไว้ และเล่าให้ฟัง","Care, remember and share")}</h2><p>{t("เลือกเรื่องที่อยากทำวันนี้","Choose something for today.")}</p></div><div className="owner-action-list">{[{title:t("สแกนสมุดวัคซีน","Scan a vaccine booklet"),detail:t("อ่านจากรูป แล้วตรวจให้ตรงกับสมุดจริง","Read from a photo, then check against the booklet."),icon:ScanLine,action:()=>{setStartTriage(false);setStartOcr(true);setTab('health');}},{title:t("เขียนความทรงจำ","Write a memory"),detail:t("รูปหนึ่งใบกับเรื่องราวในแบบของคุณ","A photo and a story, in your own way."),icon:NotebookPen,action:()=>setTab('journal')},{title:t("คุยกับผู้ช่วยของเรา","Talk to your assistant"),detail:t("ถามเรื่องน้อง หรือคุยต่อจากเรื่องเดิม","Ask about your pet or continue an earlier conversation."),icon:MessageCircle,action:()=>setTab('chat')},{title:t("สรุปก่อนพบหมอ","Summary for a vet visit"),detail:t("แชร์ประวัติที่บันทึกไว้ เพิกถอนได้ทุกเมื่อ","Share recorded history and revoke access at any time."),icon:Link2,action:()=>void createShare()}].map(({title,detail,icon:Icon,action},index)=><button key={title} className="owner-action-row" onClick={action}><span className="action-number">0{index+1}</span><Icon size={24} strokeWidth={1.5}/><span><b>{title}</b><small>{detail}</small></span><ArrowRight size={19}/></button>)}</div>
      <div className="owner-bottom-layout"><section className="panel"><div className="section-title"><div><span className="eyebrow">{t("ประวัติที่บันทึกไว้","Your saved records")}</span><h2>{t("เรื่องล่าสุดของ","Recent notes for ")}{pet.name}</h2></div><button className="text-button" onClick={() => setTab('health')}>{t("ดูทั้งหมด ","View all")}<ArrowRight size={15}/></button></div>{records.length ? records.slice().sort((a,b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0,3).map(record => <div className="timeline-item" key={record.id}><span className="timeline-icon"><RecordIcon kind={record.kind}/></span><div><b>{record.title}</b><p>{record.value ? t(`${record.value} กก. · `,`${record.value} kg · `) : ''}{dateForLocale(record.recordedAt,locale)}</p></div><span className="small-tag">{t("บันทึก","Record")}</span></div>) : <Empty title={t("เรื่องราวดี ๆ เริ่มได้วันนี้","A good story can start today")} detail={t("เพิ่มบันทึกแรกในสมุดสุขภาพ","Add the first record to the health journal.")}/>}</section><section className="owner-journal-note"><NotebookPen size={28} strokeWidth={1.4}/><span className="eyebrow">{t("วันนี้มีอะไรน่าจำ","What will you remember today?")}</span><h2>{t("อีกหนึ่งหน้า","Another page")}<br/>{t("ของความทรงจำเรา","of your life together")}</h2><p>{t("เรื่องธรรมดาในวันนี้","An ordinary moment today")}<br/>{t("อาจเป็นเรื่องที่อยากกลับมาอ่าน","may be a story you'll want to revisit.")}</p><button className="text-button" onClick={() => setTab('journal')}>{t("เปิดสมุดของเรา ","Open your journal")}<ArrowRight size={18}/></button></section></div>
    </div> : null}
    {pet && tab === 'health' ? <Health key={`${mode}-${pet.id}`} startDiary={startDiary} onMemory={keepMemory} startOcr={startOcr} startTriage={startTriage} pet={pet} records={records} demo={demo} onRecords={updateRecords} onError={setError} onShare={() => void createShare()}/> : null}
    {pet && tab === 'journal' ? <Journal key={`${mode}-${pet.id}`} pet={pet} demo={demo} initialMemory={memoryDraft}/> : null}
    {pet && tab === 'chat' ? <Assistant key={`${mode}-${pet.id}`} pet={pet} demo={demo}/> : null}
    {pet && tab === 'care' ? <Care initialTab={careStart} key={`${mode}-${pet.id}`} pet={pet} demo={demo}/> : null}
    {tab === 'settings' ? <PrivacySettings key={pet?.id||'none'} pet={pet} demo={demo} onLogout={logout}/>:null}
    </main><footer className="app-footer"><span>{t("ชิดใจ · อยู่ใกล้ใจ ในทุกวันของน้อง","ChordJai · Close at heart, every day")}</span><Link href={localizedHref("/ai-safety",locale)} onClick={event=>{if(!mayLeaveJournal())event.preventDefault();}}>{t("AI เป็นผู้ช่วย ไม่แทนสัตวแพทย์","AI supports you. It does not replace a vet.")}</Link></footer></div>
    <nav className="mobile-nav" aria-label={t("เมนูมือถือ","Mobile navigation")}>{tabs.slice(0,5).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => changeTab(id)} className={tab === id ? 'active' : ''}><Icon size={21}/><span>{id === 'care' ? t("ดูแลน้อง","Care") : label}</span></button>)}</nav>
    {invitation&&mode==='live'?<Modal title={t("ร่วมดูแลน้องไปด้วยกัน","Care for your pet together")} onClose={()=>setInvitation('')}><Notice>{t("รับคำเชิญนี้เพื่อเข้าถึงข้อมูลน้องตามบทบาทที่เจ้าของเลือก หากไม่แน่ใจว่าลิงก์มาจากใคร ให้ปิดหน้าต่างนี้","Accept this invitation for the access the owner selected. Close this window if you don't know who sent the link.")}</Notice><button className="button full" disabled={loading} onClick={async()=>{setLoading(true);try{const data=await api<{petId:string}>(`/invitations/${encodeURIComponent(invitation)}/accept`,{method:'POST'});setInvitation('');await refreshPets();changePet(data.petId);setNotice(t("รับคำเชิญแล้ว คุณดูแลน้องตามสิทธิ์ที่เจ้าของเลือกได้","Invitation accepted. You can now access this pet according to your assigned role."));}catch(error){setError(messageOf(error,locale));}finally{setLoading(false);}}}><Users size={18}/>{t("รับคำเชิญ","Accept invitation")}</button></Modal>:null}
    {addingPet ? <PetForm demo={demo} onClose={() => setAddingPet(false)} onCreated={item => { const next = [...pets, item]; if (demo) persistPets(next); else setPets(next); changePet(item.id); setAddingPet(false); setNotice(t(`เพิ่ม ${item.name} แล้ว เริ่มจากสแกนสมุดวัคซีนได้เลย`,`${item.name} added. You can start by scanning a vaccine booklet.`)); }}/> : null}
    {showInbox ? <Modal title={t("กล่องแจ้งเตือน","Notifications")} onClose={() => setShowInbox(false)}>{inbox.length ? inbox.map(item => <div className="timeline-item" key={item.id}><Bell size={20}/><div><b>{item.title}</b><p>{item.body}</p><small>{dateForLocale(item.createdAt,locale)}</small></div></div>) : <Empty icon={<Bell size={28}/>} title={demo ? t("ไม่มีแจ้งเตือนในพื้นที่ตัวอย่าง","No notifications in the demo") : t("ยังไม่มีการแจ้งเตือน","No notifications yet")} detail={t("เรื่องสำคัญของน้องจะอยู่ตรงนี้","Your pet's important updates will appear here.")}/>}</Modal> : null}
    {consent ? <Modal title={t("เลือกสิ่งที่คุณยินยอม","Choose your permissions")} onClose={() => setConsent(false)}><p>{t("ข้อมูลสุขภาพของน้องจะใช้เพื่อให้บริการ ข้อมูลที่ส่งให้ AI ผ่าน OpenAI อาจประมวลผลนอกประเทศไทย","Your pet's health information is used to provide the service. OpenAI may process AI requests outside Thailand.")}</p><label className="check-field"><input type="checkbox" checked={serviceAccepted} onChange={event => setServiceAccepted(event.target.checked)}/>{t("ยอมรับการใช้ข้อมูลเพื่อให้บริการตาม ","I agree to the use of data to provide the service under the ")}<Link href={localizedHref("/privacy",locale)}>{t("นโยบายความเป็นส่วนตัว","Privacy policy")}</Link></label><label className="check-field"><input type="checkbox" checked={aiConsent} onChange={event => setAiConsent(event.target.checked)}/>{t("อนุญาตใช้ข้อมูลเพื่อพัฒนา AI (ไม่บังคับ)","Allow data to improve AI (optional)")}</label><button className="button full" disabled={!serviceAccepted} onClick={async () => { try { await api('/identity/consents', json('POST', { purpose: 'service', granted: true })); await api('/identity/consents', json('POST', { purpose: 'ai_improvement', granted: aiConsent })); setConsent(false); } catch (error) { setError(messageOf(error,locale)); } }}>{t("บันทึกตัวเลือก ","Save choices")}<Check size={18}/></button></Modal> : null}
    {shareOptions?<Modal title={t('เลือกข้อมูลก่อนสร้างสรุป','Choose what to share')} onClose={()=>{if(!loading)setShareOptions(false);}}><p>{t('ลิงก์รวมโปรไฟล์และประวัติสุขภาพเดิมล่าสุดไม่เกิน 100 รายการ เช่น วัคซีน ยา น้ำหนัก เช็กอิน และหมายเหตุ ผู้ที่มีลิงก์อ่านได้ 7 วัน คุณเพิกถอนได้','The link includes the profile and up to 100 latest existing health records: vaccinations, medication, weight, check-ins and full notes. Anyone with the link can read it for 7 days. You can revoke it.')} </p><details className="share-legacy-preview"><summary>{t('ตรวจบันทึกสุขภาพเดิมที่จะรวมในลิงก์','Review existing health records included in the link')}</summary>{recordsLoading?<Busy/>:records.length?records.slice().sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)).slice(0,100).map(record=><article key={record.id}><h3>{record.title}</h3><p>{dateForLocale(record.recordedAt,locale)}{record.value!=null?` · ${record.value} ${t('กก.','kg')}`:''}</p>{record.nextDueAt?<p>{t('นัดถัดไป','Next due')}: {dateForLocale(record.nextDueAt,locale)}</p>:null}{record.notes?<p>{record.notes}</p>:null}</article>):<p>{t('ยังไม่มีบันทึกสุขภาพเดิม','No existing health records.')}</p>}</details><label className="check-field"><input type="checkbox" checked={includeCare} disabled={loading||shareFrozen} onChange={event=>{setIncludeCare(event.target.checked);setSharePreviewReady(false);if(!event.target.checked)setIncludeCosts(false);}}/>{t('เพิ่มข้อมูลคลินิกจากไดอารี่ เฉพาะบันทึกที่ฉันเลือกอนุญาตไว้','Include clinical diary details only from entries I selected for sharing')}</label><label className="check-field"><input type="checkbox" checked={includeCosts} disabled={loading||shareFrozen||!includeCare} onChange={event=>setIncludeCosts(event.target.checked)}/>{t('รวมค่าใช้จ่าย เฉพาะรายการที่อนุญาตแยกไว้','Include costs only from entries with separate cost-sharing permission')}</label><Notice>{t('เรื่องเล่าเต็ม ความรู้สึกส่วนตัว และรูปจากไดอารี่ดูแลไม่รวมในลิงก์ ส่วนหมายเหตุในบันทึกสุขภาพเดิมจะรวมด้วย สำหรับไดอารี่ ส่งเฉพาะข้อมูลคลินิกที่คุณอนุญาต การแชร์ไม่ได้หมายความว่าคลินิกกำลังติดตามแบบทันที','Full stories, private feelings and photos from the care diary are excluded. Full notes in existing health records are included. Only permitted clinical details from the diary are shared. Sharing does not mean a clinic is monitoring in real time.')}</Notice>{includeCare&&!demo?<CareSharePreview petId={pet?.id||''} includeCosts={includeCosts} onReady={setSharePreviewReady}/>:null}{shareError?<ErrorBox message={shareError}/>:null}{shareFrozen&&shareError?<p className="small-copy">{t('ลองใหม่ด้วยข้อมูลเดิมเพื่อไม่สร้างลิงก์ซ้ำ หากต้องการเปลี่ยนข้อมูล ให้ปิดหน้าต่างแล้วเริ่มเลือกใหม่','Retry with the same choices to avoid creating a duplicate link. To change your selection, close this window and start again.')}</p>:null}{demo?<p className="muted">{t('ตัวอย่างนี้ไม่สร้างลิงก์จริง เชื่อมต่อ LINE ก่อนแชร์','The demo cannot create a real link. Connect LINE before sharing.')}</p>:null}<button type="button" className="button full" disabled={loading||recordsLoading||demo||(includeCare&&!sharePreviewReady)} onClick={()=>void commitShare()}><Link2 size={18}/>{loading?t('กำลังสร้าง…','Creating…'):t('สร้างลิงก์สรุปที่เลือก','Create selected summary link')}</button></Modal>:null}
    {shareLink ? <Modal title={t("สรุปสุขภาพก่อนพบหมอ","Health summary for a vet visit")} onClose={() => setShareLink(null)}><Notice>{t("ผู้ที่มีลิงก์นี้จะเห็นสรุปข้อมูลที่คุณเลือกจนลิงก์หมดอายุ คุณเพิกถอนได้ทันที","Anyone with this link can see your selected summary until it expires. You can revoke it immediately.")}</Notice><p>{shareLink.expiresAt ? t(`หมดอายุ ${dateForLocale(shareLink.expiresAt,locale)}`,`Expires ${dateForLocale(shareLink.expiresAt,locale)}`) : ''}</p><a href={shareLink.url} className="share-url" target="_blank" rel="noreferrer">{shareLink.url}</a><div className="form-actions"><button className="button" onClick={async () => { try { await navigator.clipboard.writeText(shareLink.url); setNotice(t("คัดลอกลิงก์แล้ว","Link copied.")); } catch { setNotice(t("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกลิงก์และคัดลอก","Could not copy automatically. Please select and copy the link.")); } }}>{t("คัดลอกลิงก์","Copy link")}</button><button className="button danger secondary" onClick={async () => { try { await api(`/share/links/${shareLink.id}`, { method: 'DELETE' }); setShareLink(null); setNotice(t("เพิกถอนลิงก์แล้ว","Link revoked.")); } catch (error) { setError(messageOf(error,locale)); } }}>{t("เพิกถอนลิงก์","Revoke link")}</button></div></Modal> : null}
  </div>;
}
function PetForm({ demo, onClose, onCreated }: { demo: boolean; onClose: () => void; onCreated: (pet: Pet) => void }) { const {locale,t}=useLocale();
  const [name, setName] = useState(''); const [species, setSpecies] = useState<'cat'|'dog'>('cat'); const [sex, setSex] = useState<'male'|'female'|'unknown'>('unknown'); const [birthDate, setBirthDate] = useState(''); const [neutered, setNeutered] = useState('unknown'); const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  return <Modal title={t("เพิ่มสมาชิกคนสำคัญ","Add a family member")} onClose={onClose}><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const payload = { name: name.trim(), species, sex, birthDate: birthDate || null, neutered: neutered === 'unknown' ? null : neutered === 'yes' }; const created = demo ? { ...payload, birthDate: birthDate || undefined, id: `demo-${crypto.randomUUID()}` } : await api<Pet>('/pets', json('POST', payload)); onCreated(created); } catch (error) { setError(messageOf(error,locale)); } finally { setBusy(false); } }}><p className="muted">{t("แค่ข้อมูลพื้นฐาน ที่เหลือค่อยเพิ่มไปด้วยกัน","Just the basics. You can add more later.")}</p><label className="field">{t("ชื่อน้อง","Pet's name")}<input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder={t("เช่น ถั่วเหลือง","For example: Tofu")}/></label><div className="form-grid"><label className="field">{t("ชนิด","Species")}<select value={species} onChange={event => setSpecies(event.target.value as 'cat'|'dog')}><option value="cat">{t("แมว","Cat")}</option><option value="dog">{t("สุนัข","Dog")}</option></select></label><label className="field">{t("เพศ","Sex")}<select value={sex} onChange={event => setSex(event.target.value as 'male'|'female'|'unknown')}><option value="unknown">{t("ยังไม่ทราบ","Unknown")}</option><option value="female">{t("ตัวเมีย","Female")}</option><option value="male">{t("ตัวผู้","Male")}</option></select></label><label className="field">{t("วันเกิด (ถ้าทราบ)","Date of birth (if known)")}<input type="date" value={birthDate} max={new Date().toISOString().slice(0,10)} onChange={event => setBirthDate(event.target.value)}/></label><label className="field">{t("การทำหมัน","Neutering status")}<select value={neutered} onChange={event => setNeutered(event.target.value)}><option value="unknown">{t("ยังไม่ทราบ","Unknown")}</option><option value="yes">{t("ทำหมันแล้ว","Neutered")}</option><option value="no">{t("ยังไม่ได้ทำหมัน","Not neutered")}</option></select></label></div>{error ? <ErrorBox message={error}/> : null}<button className="button full" disabled={busy}>{busy ? t("กำลังบันทึก…","Saving…") : t("เพิ่มน้องของเรา","Add your pet")}<Heart size={18}/></button></form></Modal>;
}

function PetProfileMedia({pet,demo}:{pet:Pet;demo:boolean}) { const {locale,t}=useLocale();
  const [failed,setFailed]=useState(false);
  const fallback=<div className="profile-no-photo">{pet.species==='cat'?<Cat size={64} strokeWidth={1.2}/>:<Dog size={64} strokeWidth={1.2}/>}<span>{failed?t("รูปของน้องไม่พร้อมแสดง","Pet photo unavailable"):t(`โปรไฟล์ของ${pet.name}`,`${pet.name}’s profile`)}</span></div>;
  return <div className="profile-photo-frame">{failed ? fallback : pet.photoUrl ? <img src={pet.photoUrl} alt={t(`รูปของ${pet.name}`,`Photo of ${pet.name}`)} className="profile-pet-photo" onError={()=>setFailed(true)}/> : demo ? <Image src={pet.species==='cat'?'/images/pet-home-cat.webp':'/images/pet-home-dog.webp'} alt={t("ภาพสัตว์เลี้ยงประกอบพื้นที่ตัวอย่าง","An illustrative pet photo in the demo")} fill sizes="(max-width: 760px) 100vw, 40vw" onError={()=>setFailed(true)}/> : fallback}{demo&&!failed?<span className="profile-photo-caption">{t("ภาพประกอบพื้นที่ตัวอย่าง","Demo illustration")}</span>:null}</div>;
}
