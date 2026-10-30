'use client';
import { useLocale, LanguageSwitcher } from '../../shared/locale';
import { localizedHref } from '../../shared/locale-core';
import { localizeStatus } from './status-copy';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import './owner-refresh.css';
import './onboarding.css';
import OwnerToday from './owner-today';
import OwnerProfile from './owner-profile';
import '../../shared/care-summary.css';
import CareSharePreview from './care-share-preview';
import HomeCarePreview from './home-care-preview';
import { RecordIcon } from './record-icon';
import { PawPrint, Home, Heart, NotebookPen, MessageCircle, MapPin, Search, Settings, Plus, ArrowRight, ChevronDown, ShieldCheck, Users, Bell, LogOut, Siren, Sparkles, ScanLine, CalendarDays, Link2, Check, X, Cat, Dog, UserRound, Leaf, BookOpen } from 'lucide-react';
import { api, json, lineLogin, autoLineLogin, clearLineSession, restoreAppSession, endAppSession, takeOwnerBootstrap, ApiError, messageOf, dateForLocale } from '../../shared/api';
import { demoPets, demoRecords, localizeDemoPets, localizeDemoRecords } from '../lib/demo';
import type { Pet, HealthRecord, Notification } from '../lib/types';
import type { CareEntry, CareMemoryDraft } from '../lib/care-types';
import { Modal, Busy, ErrorBox, Empty, Notice } from './ui';
const Health=dynamic(()=>import('./health').then(module=>module.Health),{loading:()=> <Busy/>});
const QuickDiary=dynamic(()=>import('./care-diary'),{loading:()=> <Busy/>});
const Care=dynamic(()=>import('./care').then(module=>module.Care),{loading:()=> <Busy/>});
const PetId=dynamic(()=>import('./petid'),{loading:()=> <Busy/>});
const PrivacySettings=dynamic(()=>import('./settings').then(module=>module.PrivacySettings),{loading:()=> <Busy/>});
import {agentDestinationPath,agentEntryParams,agentTaskId,type AgentDestinationTab} from './agent-result-model';
function JournalLoading(){const {t}=useLocale();return <Busy label={t("กำลังเปิดสมุด","Opening your journal")}/>;}
function AssistantLoading(){const {t}=useLocale();return <Busy label={t("กำลังเปิดผู้ช่วย","Opening your assistant")}/>;}
const Journal = dynamic(() => import('./journal'), { loading: JournalLoading });
const Assistant = dynamic(() => import('./assistant'), { loading: AssistantLoading });
const AgentResult = dynamic(() => import('./agent-result'), { loading: AssistantLoading });
type Tab = 'home' | 'health' | 'profile' | 'journal' | 'chat' | 'care' | 'petid' | 'settings';
function useTabs(){const {t}=useLocale();return [{id:'home',label:t('วันนี้','Today'),icon:Home},{id:'health',label:t('บันทึก','Records'),icon:NotebookPen},{id:'profile',label:t('น้องของฉัน','My pet'),icon:PawPrint}] as const;}
function primaryTab(tab:Tab){return tab==='journal'?'health':['settings','care','petid'].includes(tab)?'profile':tab==='chat'?'home':tab;}
function loadDemo<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T ?? fallback; } catch { return fallback; } }
export default function OwnerApp() { const {locale,t,setLocale}=useLocale(); const tabs=useTabs();
  const [mode, setMode] = useState<'choose' | 'demo' | 'live'>('choose');
  const [tab, setTab] = useState<Tab>('home');
  const [agentTask,setAgentTask]=useState<string|null>(null);
  const [startTriage,setStartTriage]=useState(false);
  const [startOcr,setStartOcr]=useState(false);
  const [startDiary,setStartDiary]=useState(false);
  const [diaryEpisode,setDiaryEpisode]=useState<string|null>(null);
  const [diaryKind,setDiaryKind]=useState<'daily'|'followup'>('daily');
  const [lastSaved,setLastSaved]=useState<CareEntry|null>(null);
  const [editingPet,setEditingPet]=useState<Pet|null>(null);
  const [startBooklet,setStartBooklet]=useState(false);
  const [startPassport,setStartPassport]=useState(false);
  const [logoutFailed,setLogoutFailed]=useState(false);
  const [organizeEntry,setOrganizeEntry]=useState<CareEntry|null>(null);
  const [focusFollowups,setFocusFollowups]=useState(false);
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
  const readyTiming=useRef<{readyMs:number;authPath:'stored_token'|'owner_session'|'line'}|null>(null),entryStarted=useRef(Date.now());
  const localeRef = useRef(locale);
  localeRef.current = locale;
  function current(run: number) { return mounted.current && run === asyncEpoch.current; }
  function mayLeaveJournal() {
    return !(journalDirty.current||careDirty.current||petidResearchDirty.current||followupDirty.current) || window.confirm(t('มีบันทึกที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?', 'You have unsaved changes. Leave without saving?'));
  }
  function changeTab(next: Tab) {
    if (next === tab || !mayLeaveJournal()) return;
    journalDirty.current = false; careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;
    setLastSaved(null);setTab(next);setStartPassport(false);setStartBooklet(false);setOrganizeEntry(null); setStartDiary(false); setMemoryDraft(null); setStartOcr(false); setStartTriage(false); setError(''); setNotice('');
  }
  function changePet(next: string) {
    if (next === pet?.id || !mayLeaveJournal()) return;
    journalDirty.current = false; careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;
    setLastSaved(null);setMemoryDraft(null);setShareOptions(false);setShareLink(null);setStartDiary(false);setOrganizeEntry(null);setSelectedId(next);
  }
  function clearOwnerView(){
    asyncEpoch.current++;
    setLogoutFailed(false);
    journalDirty.current = false; careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;
    setMode('choose'); setPets([]); setRecords([]); setConsent(false); setServiceAccepted(false);
    setShowInbox(false); setInbox([]);setLastSaved(null);setEditingPet(null);setStartDiary(false); setShareLink(null);setShareOptions(false);setMemoryDraft(null);setAgentTask(null);setOrganizeEntry(null); setAddingPet(false);setLoading(false);setAuthChecking(false);setError('');setNotice('');
  }
  async function logout() {
    if (!mayLeaveJournal()) return;
    const signedOut=demo?(clearLineSession(),Promise.resolve()):endAppSession();
    clearOwnerView();setLoading(true);
    try{await signedOut;}catch(cause){setLogoutFailed(true);setError(messageOf(cause,localeRef.current));}finally{setLoading(false);}
  }
  useEffect(()=>{
    const ended=(event:StorageEvent)=>{if(event.key==='chordjai.explicit-signout.v1'&&event.newValue==='1'){clearLineSession();clearOwnerView();}};
    window.addEventListener('storage',ended);return()=>window.removeEventListener('storage',ended);
  },[]);
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
  useEffect(()=>{
    if(mode!=='live'||!agentTask)return;
    const requestedLocale=agentEntryParams(window.location.href).get('lang');
    // Wait until the authenticated entry has mounted; the provider's initial
    // locale effect otherwise races a nested LIFF state preference.
    if((requestedLocale==='th'||requestedLocale==='en')&&requestedLocale!==locale)setLocale(requestedLocale);
  },[mode,agentTask,setLocale]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [mode,tab,pet?.id]);
  useEffect(()=>{if(mode!=='live'||consent)return;void api('/analytics/events',json('POST',{name:'app.opened',properties:readyTiming.current??undefined})).catch(()=>{});},[mode,consent]);
  useEffect(()=>{if(demo)setPets(current=>localizeDemoPets(current,locale));},[locale,demo]);
  useEffect(() => {
    mounted.current = true;
    const run = ++asyncEpoch.current;
    const search = agentEntryParams(window.location.href);
    setAgentTask(agentTaskId(search.get('agentTaskId')));
    setInvitation(search.get('invite') || '');
    if(search.get('compose')==='1')setStartDiary(true);
    const requested = search.get('tab');
    if (requested && ['home','health','profile','journal','chat','care','settings','petid'].includes(requested)) setTab(requested as Tab);
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
  async function establishOwner(run: number,authPath:'stored_token'|'owner_session'|'line'='line') {
    const bootstrap=takeOwnerBootstrap<{pets:Pet[];consents:{purpose:string;granted:boolean}[]}>()??await api<{pets:Pet[];consents:{purpose:string;granted:boolean}[]}>('/identity/bootstrap');
    const data=bootstrap.pets,permissions=bootstrap.consents;
    if (!current(run)) return;
    const requestedPetId=agentEntryParams(window.location.href).get('petId');
    const selectedPet=data.find(item=>item.id===requestedPetId)??data[0];
    readyTiming.current={readyMs:Math.min(120000,Math.max(0,Date.now()-entryStarted.current)),authPath};
    setPets(data); setSelectedId(selectedPet?.id || ''); setMode('live');
    setConsent(!permissions.some(item => item.purpose === 'service' && item.granted));
  }
  async function bootstrap(run: number) {
    try {
      if (sessionStorage.getItem('chordjai.session')) {
        // api() owns the sole renewal attempt. Never restart LINE after its
        // exhausted retry; this prevents a rejected refreshed session looping.
        await establishOwner(run,'stored_token');
      } else if (await restoreAppSession()) {
        if(current(run))await establishOwner(run,'owner_session');
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
  function agentContext(context:{petId:string|null;tab:AgentDestinationTab|null}){
    if(!mayLeaveJournal())return;
    if(context.petId&&pets.some(item=>item.id===context.petId))setSelectedId(context.petId);
    if(context.tab)setTab(context.tab);
  }
  function openAgentPath(path:string){
    const safe=agentDestinationPath(path);if(!safe||!mayLeaveJournal())return;
    // Reload the ordinary resource route so its fresh API reads and normal
    // access checks apply; task links never become public capability links.
    window.location.assign(safe);
  }
  async function login() {
    const run = ++asyncEpoch.current;
    setLogoutFailed(false);entryStarted.current=Date.now();setLoading(true); setError('');
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
  function openDiary(episodeId?:string|null){if(!mayLeaveJournal())return;journalDirty.current=false;careDirty.current=false;petidResearchDirty.current=false;followupDirty.current=false;setDiaryEpisode(episodeId??null);setDiaryKind(episodeId===undefined?'daily':'followup');setStartDiary(true);}
  function openTool(tool:'booklet'|'journal'|'chat'|'care'|'petid'|'passport'|'settings'|'followups'){
    if(!mayLeaveJournal())return;
    setStartBooklet(tool==='booklet');setStartPassport(tool==='passport');setStartTriage(false);setStartOcr(false);setFocusFollowups(tool==='followups');
    setTab(tool==='booklet'||tool==='passport'?'health':tool==='followups'?'settings':tool);
  }
  function keepMemory(draft:CareMemoryDraft){setLastSaved(null);setMemoryDraft({...draft,key:crypto.randomUUID()});setTab('journal');}
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
  if(authChecking)return <main className="owner-auth-shell" aria-busy="true"><div className="wordmark"><span className="brand-mark"><PawPrint size={25}/></span>{t('ชิดใจ','ChordJai')}</div><div className="auth-skeleton" aria-hidden="true"><div/><div/><div/></div><Busy label={t('กำลังตรวจบัญชีของคุณ…','Checking your account…')}/><p>{t('เตรียมพื้นที่สำหรับเรื่องราวของน้อง','Getting your pet’s space ready.')}</p></main>;
  if (mode === 'choose') return <main className="login-page owner-login"><header className="login-topline"><Link href={localizedHref("/",locale)} className="wordmark"><span className="brand-mark"><PawPrint size={25}/></span>{t("ชิดใจ","ChordJai")}</Link><LanguageSwitcher/></header><div className="owner-login-layout"><figure className="login-photo"><Image src="/images/pet-home-cat.webp" alt={t("แมวพักผ่อนอยู่ที่บ้าน","A cat relaxing at home")} fill sizes="(max-width: 760px) 100vw, 50vw" preload/><figcaption>{t("ใกล้กันในทุกวัน","A little closer, every day")}</figcaption></figure><div className="login-card"><span className="eyebrow">{t("พื้นที่ของคุณและน้อง","A space for you and your pet")}</span><h1>{t("เรื่องเล็ก ๆ ของน้อง","Their little moments.")}<br/>{t("เก็บไว้ตรงนี้","All kept here.")}</h1><p>{t("เล่าเรื่องน้อง แนบรูป แล้วบันทึกได้เลย","Tell a story, add a photo, and save.")}<br/>{t("ค่อยเติมรายละเอียดเมื่อคุณพร้อม","Add more details whenever you’re ready.")}</p>{error ? <ErrorBox message={error}/> : null}{logoutFailed?<button className="button secondary full" disabled={loading} onClick={()=>void logout()}>{t('ลองออกจากระบบอีกครั้ง','Retry sign-out')}</button>:null}<button className="button full" onClick={() => void login()} disabled={loading}>{loading ? t("กำลังเชื่อมต่อ LINE…","Connecting to LINE…") : t("เริ่มบันทึกด้วย LINE","Start with LINE")}<ArrowRight size={18}/></button><p className="login-session-hint">{t('จำบัญชีในเบราว์เซอร์นี้สูงสุด 30 วัน ออกจากระบบได้ในตั้งค่าบัญชี','Stay signed in on this browser for up to 30 days. Sign out in account settings.')}</p><button className="button secondary full" onClick={enterDemo}>{t("ลองดูพื้นที่ตัวอย่างก่อน ","Explore the demo first")}<BookOpen size={18}/></button><small>{t("พื้นที่ตัวอย่างเก็บข้อมูลในเบราว์เซอร์นี้","The demo keeps information in this browser.")}<br/>{t("เมื่อพร้อม ค่อยเชื่อมต่อ LINE เพื่อใช้บัญชีจริง","When you're ready, connect LINE to use your own account.")}</small><div className="login-legal"><Link href={localizedHref("/privacy",locale)}>{t("ความเป็นส่วนตัว","Privacy")}</Link><Link href={localizedHref("/terms",locale)}>{t("เงื่อนไขบริการ","Terms of service")}</Link><Link href={localizedHref("/emergency",locale)}>{t("ข้อมูลฉุกเฉิน","Emergency information")}</Link></div></div></div></main>;
  return <div className="app-shell"><aside className="sidebar"><Link className="wordmark" href={localizedHref("/",locale)} onClick={event=>{if(!mayLeaveJournal())event.preventDefault();}}><span className="brand-mark"><PawPrint size={25}/></span>{t("ชิดใจ","ChordJai")}</Link><p className="sidebar-caption">{t("ทุกเรื่องของน้อง อยู่ใกล้ใจ","Your pet's everyday, close at heart")}</p><nav aria-label={t("เมนูหลัก","Main navigation")}>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${primaryTab(tab) === id ? 'active' : ''}`} aria-current={primaryTab(tab)===id?'page':undefined} onClick={() => changeTab(id)}><Icon size={21}/><span>{label}</span></button>)}</nav><div className="sidebar-note"><Leaf size={22} strokeWidth={1.5}/><b>{t("ความรักในทุกวัน","Love in the everyday")}</b><p>{t("ไม่ต้องจำทุกเรื่องคนเดียว","You don't have to remember it all.")}<br/>{t("เราช่วยเก็บไว้ให้คุณ","We'll help you keep it together.")}</p></div><button className="logout" onClick={logout}><LogOut size={18}/>{demo ? t("ออกจากตัวอย่าง","Leave the demo") : t("ออกจากระบบ","Sign out")}</button></aside>
    <div className="app-content"><header className="app-header"><div className="header-breadcrumb"><span>{t("พื้นที่ของเรา","Your space")}</span><span>/</span><strong>{tab==='journal'?t('สมุดความทรงจำ','Memory book'):tab==='chat'?t('ถามชิดใจ','Ask ChordJai'):tab==='care'?t('คลินิกและช่วยน้องหาย','Clinics & missing pets'):tab==='petid'?'PetID':tab==='settings'?t('บัญชีของฉัน','My account'):tabs.find(item=>item.id===tab)?.label}</strong></div><div className="header-actions"><Link href={localizedHref("/emergency",locale)} className="emergency-link" onClick={event=>{if(!mayLeaveJournal())event.preventDefault();}}><Siren size={17}/><span>{t("ฉุกเฉิน","Emergency")}</span></Link><button className="text-button header-ask" onClick={()=>changeTab('chat')}><MessageCircle size={18}/>{t('ถามชิดใจ','Ask ChordJai')}</button></div></header>
    {demo ? <div className="demo-banner"><Sparkles size={16}/><span><b>{t("พื้นที่ตัวอย่าง","Demo space")}</b> {t(" ข้อมูลอยู่ในเบราว์เซอร์นี้ · AI และ LINE ยังไม่เชื่อมต่อ","Data stays in this browser · AI and LINE are not connected.")}</span><button onClick={logout}>{t("เชื่อมต่อ LINE ","Connect LINE")}<ArrowRight size={15}/></button></div> : null}
    <main className="main-content">{pet?<div className="pet-bar compact-pet-bar">{pets.length>1?<label className="pet-switch-label"><PawPrint size={18}/><span className="sr-only">{t('เลือกน้อง','Choose a pet')}</span><select value={pet.id} onChange={event=>changePet(event.target.value)}>{pets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:<span className="pet-current"><PawPrint size={18}/>{pet.name}</span>}<span className="private-mark"><ShieldCheck size={15}/>{t('พื้นที่ของครอบครัว','Your family’s space')}</span></div>:null}
    {error ? <div className="dismissible"><ErrorBox message={error}/><button className="icon-button" aria-label={t("ปิดข้อผิดพลาด","Dismiss error")} onClick={() => setError('')}><X size={18}/></button></div> : null}{notice ? <Notice>{localizeStatus(notice,locale)}<button className="text-button" onClick={() => setNotice('')}>{t("ปิด","Close")}</button></Notice> : null}
    {loading?<Busy/>:null}
    {!pet && !loading && tab !=='care' ? <div className="welcome-empty"><span className="empty-icon"><PawPrint size={36} strokeWidth={1.3}/></span><span className="eyebrow">{t("บ้านใหม่ของเรื่องราวน้อง","A new home for your pet's story")}</span><h1>{t("เริ่มจากชื่อน้องกันเลย","Let's start with a name")}</h1><p>{t("เพิ่มโปรไฟล์แรก แล้วเก็บทุกเรื่องสำคัญไว้ด้วยกัน","Add your first pet and keep the important details together.")}</p><button className="button" onClick={() => setAddingPet(true)}>{t("เพิ่มน้องตัวแรก ","Add your first pet")}<Plus size={18}/></button><div style={{marginTop:16}}><button className="button secondary" onClick={()=>setTab('care')}><Search size={18}/>{t("ฉันพบสัตว์ · ค้น PetID","I found a pet · Search PetID")}</button><p style={{marginTop:12,fontSize:12}}>{t("ช่วยพาน้องกลับบ้านได้ แม้ยังไม่มีสัตว์เลี้ยงของคุณเอง","Help a pet get home, even if you don't own a pet.")}</p></div></div> : null}
    {!pet&&!loading&&tab==='care'?<section><div className="page-heading"><div><span className="eyebrow">BRING THEM HOME</span><h1>{t("ช่วยพาน้องที่พบกลับบ้าน","Help a found pet get home")}</h1><p>{t("ใช้รูปค้นกับประกาศที่เปิดอยู่ โดยไม่ต้องสร้างโปรไฟล์น้องของตัวเอง","Search active notices using a photo. You don't need to create your own pet profile.")}</p></div><button className="button secondary" onClick={()=>setTab('home')}>{t("กลับหน้าหลัก","Back to home")}</button></div><PetId demo={demo}/></section>:null}
    {pet&&tab==='home'?<OwnerToday pet={pet} records={records} demo={demo} onWrite={openDiary} onRecords={()=>changeTab('health')} onChat={()=>changeTab('chat')} onMemory={keepMemory} onPassport={()=>openTool('passport')} onOrganize={entry=>{setOrganizeEntry(entry);setLastSaved(null);setStartBooklet(false);setTab('health');}} lastSaved={lastSaved}/>:null}
    {pet&&tab==='profile'?<OwnerProfile pet={pet} records={records} onTool={openTool} onEdit={()=>setEditingPet(pet)} onAdd={()=>setAddingPet(true)} onInbox={()=>void openInbox()}/>:null}
    {pet&&tab==='petid'?<section><button className="text-button" onClick={()=>changeTab('profile')}>{t('กลับไปน้องของฉัน','Back to My pet')}</button><PetId pet={pet} demo={demo}/></section>:null}
    {pet&&startDiary?<QuickDiary key={`quick:${mode}:${pet.id}`} pet={pet} demo={demo} composerOnly initialComposer initialEpisodeId={diaryEpisode} initialKind={diaryKind} onComposerClose={()=>setStartDiary(false)} onSaved={entry=>{setLastSaved(entry);setStartDiary(false);}} onMemory={keepMemory} onCheckUrgency={()=>{setStartDiary(false);setStartTriage(true);setTab('health');}}/>:null}
    {pet && tab === 'health' ? <Health key={`${mode}-${pet.id}`} startBooklet={startBooklet} startPassport={startPassport} organizeEntry={organizeEntry} onOrganizeClose={()=>setOrganizeEntry(null)} onJournal={()=>changeTab('journal')} onMemory={keepMemory} startOcr={startOcr} startTriage={startTriage} pet={pet} records={records} demo={demo} onRecords={updateRecords} onError={setError} onShare={() => void createShare()}/> : null}
    {pet && tab === 'journal' ? <Journal key={`${mode}-${pet.id}`} pet={pet} demo={demo} initialMemory={memoryDraft}/> : null}
    {pet && tab === 'chat' ? <Assistant key={`${mode}-${pet.id}`} pet={pet} demo={demo}/> : null}
    {pet && tab === 'care' ? <Care initialTab={careStart} key={`${mode}-${pet.id}`} pet={pet} demo={demo}/> : null}
    {tab === 'settings' ? <PrivacySettings key={pet?.id||'none'} pet={pet} demo={demo} onLogout={logout} focusFollowups={focusFollowups}/>:null}
    </main><footer className="app-footer"><span>{t("ชิดใจ · อยู่ใกล้ใจ ในทุกวันของน้อง","ChordJai · Close at heart, every day")}</span><Link href={localizedHref("/ai-safety",locale)} onClick={event=>{if(!mayLeaveJournal())event.preventDefault();}}>{t("AI เป็นผู้ช่วย ไม่แทนสัตวแพทย์","AI supports you. It does not replace a vet.")}</Link></footer></div>
    <nav className="mobile-nav" aria-label={t("เมนูมือถือ","Mobile navigation")}>{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => changeTab(id)} className={primaryTab(tab) === id ? 'active' : ''} aria-current={primaryTab(tab)===id?'page':undefined}><Icon size={21}/><span>{label}</span></button>)}</nav>
    {invitation&&mode==='live'?<Modal title={t("ร่วมดูแลน้องไปด้วยกัน","Care for your pet together")} onClose={()=>setInvitation('')}><Notice>{t("รับคำเชิญนี้เพื่อเข้าถึงข้อมูลน้องตามบทบาทที่เจ้าของเลือก หากไม่แน่ใจว่าลิงก์มาจากใคร ให้ปิดหน้าต่างนี้","Accept this invitation for the access the owner selected. Close this window if you don't know who sent the link.")}</Notice><button className="button full" disabled={loading} onClick={async()=>{setLoading(true);try{const data=await api<{petId:string}>(`/invitations/${encodeURIComponent(invitation)}/accept`,{method:'POST'});setInvitation('');await refreshPets();changePet(data.petId);setNotice(t("รับคำเชิญแล้ว คุณดูแลน้องตามสิทธิ์ที่เจ้าของเลือกได้","Invitation accepted. You can now access this pet according to your assigned role."));}catch(error){setError(messageOf(error,locale));}finally{setLoading(false);}}}><Users size={18}/>{t("รับคำเชิญ","Accept invitation")}</button></Modal>:null}
    {agentTask&&mode==='live'&&!consent?<AgentResult id={agentTask} onClose={()=>setAgentTask(null)} onContext={agentContext} onOpen={openAgentPath}/>:null}
    {addingPet||editingPet?<PetForm pet={editingPet??undefined} demo={demo} onClose={()=>{setAddingPet(false);setEditingPet(null);}} onCreated={item=>{const editing=Boolean(editingPet),next=editing?pets.map(existing=>existing.id===item.id?item:existing):[...pets,item];if(demo)persistPets(next);else setPets(next);setSelectedId(item.id);setAddingPet(false);setEditingPet(null);setNotice(editing?t('อัปเดตโปรไฟล์แล้ว','Profile updated.'):t(`เพิ่ม${item.name}แล้ว มาเก็บเรื่องแรกด้วยกัน`,`${item.name} is here. Let’s save your first story.`));if(!editing){setTab('home');setDiaryEpisode(null);setDiaryKind('daily');setStartDiary(true);}}}/>:null}
    {showInbox ? <Modal title={t("กล่องแจ้งเตือน","Notifications")} onClose={() => setShowInbox(false)}>{inbox.length ? inbox.map(item => <div className="timeline-item" key={item.id}><Bell size={20}/><div><b>{item.title}</b><p>{item.body}</p><small>{dateForLocale(item.createdAt,locale)}</small></div></div>) : <Empty icon={<Bell size={28}/>} title={demo ? t("ไม่มีแจ้งเตือนในพื้นที่ตัวอย่าง","No notifications in the demo") : t("ยังไม่มีการแจ้งเตือน","No notifications yet")} detail={t("เรื่องสำคัญของน้องจะอยู่ตรงนี้","Your pet's important updates will appear here.")}/>}</Modal> : null}
    {consent ? <Modal title={t("เลือกสิ่งที่คุณยินยอม","Choose your permissions")} onClose={() => {void logout();}}><p>{t("ข้อมูลสุขภาพของน้องจะใช้เพื่อให้บริการ ข้อมูลที่ส่งให้ AI ผ่าน OpenAI อาจประมวลผลนอกประเทศไทย","Your pet's health information is used to provide the service. OpenAI may process AI requests outside Thailand.")}</p><label className="check-field"><input type="checkbox" checked={serviceAccepted} onChange={event => setServiceAccepted(event.target.checked)}/>{t("ยอมรับการใช้ข้อมูลเพื่อให้บริการตาม ","I agree to the use of data to provide the service under the ")}<Link href={localizedHref("/privacy",locale)}>{t("นโยบายความเป็นส่วนตัว","Privacy policy")}</Link></label><button className="button full" disabled={!serviceAccepted} onClick={async () => { try { await api('/identity/consents', json('POST', { purpose: 'service', granted: true })); setConsent(false); } catch (error) { setError(messageOf(error,locale)); } }}>{t("บันทึกตัวเลือก ","Save choices")}<Check size={18}/></button></Modal> : null}
    {shareOptions?<Modal title={t('เลือกข้อมูลก่อนสร้างสรุป','Choose what to share')} onClose={()=>{if(!loading)setShareOptions(false);}}><p>{t('ลิงก์รวมโปรไฟล์และประวัติสุขภาพเดิมล่าสุดไม่เกิน 100 รายการ เช่น วัคซีน ยา น้ำหนัก เช็กอิน และหมายเหตุ ผู้ที่มีลิงก์อ่านได้ 7 วัน คุณเพิกถอนได้','The link includes the profile and up to 100 latest existing health records: vaccinations, medication, weight, check-ins and full notes. Anyone with the link can read it for 7 days. You can revoke it.')} </p><details className="share-legacy-preview"><summary>{t('ตรวจบันทึกสุขภาพเดิมที่จะรวมในลิงก์','Review existing health records included in the link')}</summary>{recordsLoading?<Busy/>:records.length?records.slice().sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)).slice(0,100).map(record=><article key={record.id}><h3>{record.title}</h3><p>{dateForLocale(record.recordedAt,locale)}{record.value!=null?` · ${record.value} ${t('กก.','kg')}`:''}</p>{record.nextDueAt?<p>{t('นัดถัดไป','Next due')}: {dateForLocale(record.nextDueAt,locale)}</p>:null}{record.notes?<p>{record.notes}</p>:null}</article>):<p>{t('ยังไม่มีบันทึกสุขภาพเดิม','No existing health records.')}</p>}</details><label className="check-field"><input type="checkbox" checked={includeCare} disabled={loading||shareFrozen} onChange={event=>{setIncludeCare(event.target.checked);setSharePreviewReady(false);if(!event.target.checked)setIncludeCosts(false);}}/>{t('เพิ่มข้อมูลคลินิกจากไดอารี่ เฉพาะบันทึกที่ฉันเลือกอนุญาตไว้','Include clinical diary details only from entries I selected for sharing')}</label><label className="check-field"><input type="checkbox" checked={includeCosts} disabled={loading||shareFrozen||!includeCare} onChange={event=>setIncludeCosts(event.target.checked)}/>{t('รวมค่าใช้จ่าย เฉพาะรายการที่อนุญาตแยกไว้','Include costs only from entries with separate cost-sharing permission')}</label><Notice>{t('เรื่องเล่าเต็ม ความรู้สึกส่วนตัว และรูปจากไดอารี่ดูแลไม่รวมในลิงก์ ส่วนหมายเหตุในบันทึกสุขภาพเดิมจะรวมด้วย สำหรับไดอารี่ ส่งเฉพาะข้อมูลคลินิกที่คุณอนุญาต การแชร์ไม่ได้หมายความว่าคลินิกกำลังติดตามแบบทันที','Full stories, private feelings and photos from the care diary are excluded. Full notes in existing health records are included. Only permitted clinical details from the diary are shared. Sharing does not mean a clinic is monitoring in real time.')}</Notice>{includeCare&&!demo?<CareSharePreview petId={pet?.id||''} includeCosts={includeCosts} onReady={setSharePreviewReady}/>:null}{shareError?<ErrorBox message={shareError}/>:null}{shareFrozen&&shareError?<p className="small-copy">{t('ลองใหม่ด้วยข้อมูลเดิมเพื่อไม่สร้างลิงก์ซ้ำ หากต้องการเปลี่ยนข้อมูล ให้ปิดหน้าต่างแล้วเริ่มเลือกใหม่','Retry with the same choices to avoid creating a duplicate link. To change your selection, close this window and start again.')}</p>:null}{demo?<p className="muted">{t('ตัวอย่างนี้ไม่สร้างลิงก์จริง เชื่อมต่อ LINE ก่อนแชร์','The demo cannot create a real link. Connect LINE before sharing.')}</p>:null}<button type="button" className="button full" disabled={loading||recordsLoading||demo||(includeCare&&!sharePreviewReady)} onClick={()=>void commitShare()}><Link2 size={18}/>{loading?t('กำลังสร้าง…','Creating…'):t('สร้างลิงก์สรุปที่เลือก','Create selected summary link')}</button></Modal>:null}
    {shareLink ? <Modal title={t("สรุปสุขภาพก่อนพบหมอ","Health summary for a vet visit")} onClose={() => setShareLink(null)}><Notice>{t("ผู้ที่มีลิงก์นี้จะเห็นสรุปข้อมูลที่คุณเลือกจนลิงก์หมดอายุ คุณเพิกถอนได้ทันที","Anyone with this link can see your selected summary until it expires. You can revoke it immediately.")}</Notice><p>{shareLink.expiresAt ? t(`หมดอายุ ${dateForLocale(shareLink.expiresAt,locale)}`,`Expires ${dateForLocale(shareLink.expiresAt,locale)}`) : ''}</p><a href={shareLink.url} className="share-url" target="_blank" rel="noreferrer">{shareLink.url}</a><div className="form-actions"><button className="button" onClick={async () => { try { await navigator.clipboard.writeText(shareLink.url); setNotice(t("คัดลอกลิงก์แล้ว","Link copied.")); } catch { setNotice(t("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกลิงก์และคัดลอก","Could not copy automatically. Please select and copy the link.")); } }}>{t("คัดลอกลิงก์","Copy link")}</button><button className="button danger secondary" onClick={async () => { try { await api(`/share/links/${shareLink.id}`, { method: 'DELETE' }); setShareLink(null); setNotice(t("เพิกถอนลิงก์แล้ว","Link revoked.")); } catch (error) { setError(messageOf(error,locale)); } }}>{t("เพิกถอนลิงก์","Revoke link")}</button></div></Modal> : null}
  </div>;
}
function PetForm({ demo, pet, onClose, onCreated }: { demo: boolean; pet?:Pet; onClose: () => void; onCreated: (pet: Pet) => void }) {
  const {locale,t}=useLocale();
  const [name,setName]=useState(pet?.name??''),[species,setSpecies]=useState<'cat'|'dog'|null>(pet?.species??null);
  const [sex,setSex]=useState<Pet['sex']>(pet?.sex??'unknown'),[birthDate,setBirthDate]=useState(pet?.birthDate?.slice(0,10)??''),[neutered,setNeutered]=useState(pet?.neutered==null?'unknown':pet.neutered?'yes':'no');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),submission=useRef<{body:string;key:string}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const close=()=>{if(!busy)onClose();};
  return <Modal title={pet?t('แก้ไขข้อมูลน้อง','Edit your pet’s details'):t('น้องชื่ออะไร?','What’s your pet’s name?')} onClose={close}>
    <form className="simple-pet-form" onSubmit={async event=>{
      event.preventDefault();if(busy||!species)return;setBusy(true);setError('');
      const payload={name:name.trim(),species,sex,birthDate:birthDate||null,neutered:neutered==='unknown'?null:neutered==='yes'};
      try{
        const body=JSON.stringify(payload);if(submission.current?.body!==body)submission.current={body,key:crypto.randomUUID()};
        const saved=demo?{...pet,...payload,birthDate:birthDate||undefined,id:pet?.id??`demo-${crypto.randomUUID()}`} as Pet:await api<Pet>(pet?`/pets/${pet.id}`:'/pets',{...json(pet?'PATCH':'POST',payload),headers:{'Idempotency-Key':submission.current!.key}});
        if(alive.current)onCreated(saved);
      }catch(cause){if(alive.current)setError(messageOf(cause,locale));}finally{if(alive.current)setBusy(false);}
    }}>
      <p className="muted">{pet?t('เติมเท่าที่ทราบ ข้อมูลเดิมยังอยู่ครบ','Add what you know. Your other details are kept.'):t('เริ่มจากชื่อกับชนิด ที่เหลือค่อยเติมเมื่อพร้อม','Just a name and species to start. Add the rest when you’re ready.')}</p>
      <fieldset disabled={busy}><label className="field">{t('ชื่อน้อง','Pet’s name')}<input autoFocus required maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder={t('เช่น พีโอนี','For example: Peony')}/></label>
      <div className="pet-species" role="group" aria-label={t('ชนิดของน้อง','Pet’s species')}>{(['cat','dog'] as const).map(value=><button key={value} type="button" aria-pressed={species===value} className={species===value?'selected':''} onClick={()=>setSpecies(value)}>{value==='cat'?<Cat size={24}/>:<Dog size={24}/>}<span>{value==='cat'?t('แมว','Cat'):t('สุนัข','Dog')}</span></button>)}</div>
      <details className="pet-more" open={Boolean(pet)}><summary>{t('ข้อมูลเพิ่มเติม (ไม่บังคับ)','More details (optional)')}<ChevronDown size={17}/></summary><div className="form-grid">
        <label className="field">{t('เพศ','Sex')}<select value={sex} onChange={event=>setSex(event.target.value as Pet['sex'])}><option value="unknown">{t('ยังไม่ทราบ','Unknown')}</option><option value="female">{t('ตัวเมีย','Female')}</option><option value="male">{t('ตัวผู้','Male')}</option></select></label>
        <label className="field">{t('วันเกิด (ไม่บังคับ)','Date of birth (optional)')}<input type="date" value={birthDate} max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})} onChange={event=>setBirthDate(event.target.value)}/></label>
        <label className="field">{t('การทำหมัน','Neutering status')}<select value={neutered} onChange={event=>setNeutered(event.target.value)}><option value="unknown">{t('ยังไม่ทราบ','Unknown')}</option><option value="yes">{t('ทำหมันแล้ว','Neutered')}</option><option value="no">{t('ยังไม่ได้ทำหมัน','Not neutered')}</option></select></label>
      </div></details></fieldset>
      {error?<ErrorBox message={error}/>:null}<button className="button full" disabled={busy||!name.trim()||!species}>{busy?t('กำลังบันทึก…','Saving…'):pet?t('บันทึกข้อมูล','Save details'):t('มาเก็บเรื่องแรกกัน','Save our first story')}<ArrowRight size={18}/></button>
    </form>
  </Modal>;
}

function PetProfileMedia({pet,demo}:{pet:Pet;demo:boolean}) { const {locale,t}=useLocale();
  const [failed,setFailed]=useState(false);
  const fallback=<div className="profile-no-photo">{pet.species==='cat'?<Cat size={64} strokeWidth={1.2}/>:<Dog size={64} strokeWidth={1.2}/>}<span>{failed?t("รูปของน้องไม่พร้อมแสดง","Pet photo unavailable"):t(`โปรไฟล์ของ${pet.name}`,`${pet.name}’s profile`)}</span></div>;
  return <div className="profile-photo-frame">{failed ? fallback : pet.photoUrl ? <img src={pet.photoUrl} alt={t(`รูปของ${pet.name}`,`Photo of ${pet.name}`)} className="profile-pet-photo" onError={()=>setFailed(true)}/> : demo ? <Image src={pet.species==='cat'?'/images/pet-home-cat.webp':'/images/pet-home-dog.webp'} alt={t("ภาพสัตว์เลี้ยงประกอบพื้นที่ตัวอย่าง","An illustrative pet photo in the demo")} fill sizes="(max-width: 760px) 100vw, 40vw" onError={()=>setFailed(true)}/> : fallback}{demo&&!failed?<span className="profile-photo-caption">{t("ภาพประกอบพื้นที่ตัวอย่าง","Demo illustration")}</span>:null}</div>;
}
