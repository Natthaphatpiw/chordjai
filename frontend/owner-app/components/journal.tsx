'use client';
import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, ImagePlus, MapPin, Minus, MousePointer2, Plus, RotateCw, Save, Sparkles, Trash2, Type, Undo2 } from 'lucide-react';
import { useLocale, LanguageSwitcher } from '../../shared/locale';
import { api, ApiError, dateForLocale, json, messageOf } from '../../shared/api';
import type { JournalBook, JournalElement, JournalPage, JournalTheme, Pet } from '../lib/types';
import type { CareMemoryDraft } from '../lib/care-types';
import { initialPage, localizeDemoPage } from '../lib/demo';
import { Busy, ErrorBox, Modal, Notice } from './ui';
import { graphicLabel, JournalGraphic, useJournalGraphics } from './journal-graphics';
import { boundElement, canvasHeight, orderPages, safeJournalPhoto, scaleElement, STORY_HEIGHT, diaryMemoryPage } from './journal-model';
import './journal-book.css';
import {agentEntryParams,agentTaskId} from './agent-result-model';

const colors = ['#ffffff', '#fffaf5', '#ffe3c4', '#ffb777', '#e5f8e9', '#e3f5ff'];
type Draft = { theme: JournalTheme; elements: JournalElement[] };
function safeColor(value: string, fallback: string) { return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function clonePage(page: JournalPage): JournalPage { return { ...page, theme: { ...page.theme }, elements: page.elements.map(item => ({ ...item })) }; }
function validateDraft(value: Draft, height: number, demo: boolean): Draft {
  if (!value.theme || !Array.isArray(value.elements) || value.elements.length > 100) throw new Error('AI_LAYOUT_INVALID');
  const elements = value.elements.map(item => {
    if (!['text','sticker','photo'].includes(item.type) || typeof item.content !== 'string' || ![item.x,item.y,item.width,item.height,item.rotation].every(Number.isFinite) || item.x < 0 || item.y < 0 || item.width < 10 || item.height < 10 || item.x + item.width > 800 || item.y + item.height > height || (item.type === 'photo' && !safeJournalPhoto(item.content,demo))) throw new Error('AI_LAYOUT_INVALID');
    return { ...item, id: item.id || crypto.randomUUID(), color: safeColor(item.color || '', '#3a210d') };
  });
  if (new Set(elements.map(item => item.id)).size !== elements.length) throw new Error('AI_LAYOUT_INVALID');
  return { theme: { background: safeColor(value.theme.background,'#fffaf5'), accent: safeColor(value.theme.accent,'#ff8a24'), font: ['sans','serif','handwritten'].includes(value.theme.font) ? value.theme.font : 'sans' }, elements };
}

export default function Journal({ pet, demo, initialMemory }: { pet: Pet; demo: boolean; initialMemory?: (CareMemoryDraft&{key:string})|null }) {
  const { locale, t } = useLocale(); const stickers = useJournalGraphics();
  const [pages,setPages] = useState<JournalPage[]>([]); const [book,setBook] = useState<JournalBook | null>(null);
  const [page,setPage] = useState<JournalPage | null>(null); const [screen,setScreen] = useState<'book'|'read'|'edit'>('book');
  const [coverEditing,setCoverEditing] = useState(false); const [readIndex,setReadIndex] = useState(0); const [selected,setSelected] = useState('');
  const [loadReady,setLoadReady]=useState(false);
  const [busy,setBusy] = useState(false); const [dirty,setDirty] = useState(false); const [conflict,setConflict] = useState(false);
  const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [prompt,setPrompt] = useState('');
  const [draft,setDraft] = useState<Draft | null>(null); const [undo,setUndo] = useState<Draft | null>(null); const [metadataOpen,setMetadataOpen] = useState(false);
  const storageKey = `chordjai.demo.journal.v1.${pet.id}`, bookStorageKey = `chordjai.demo.book.v1.${pet.id}`;
  const coverButton = useRef<HTMLButtonElement>(null); const previousScreen = useRef<'book'|'read'|'edit'>('book');
  const uploadInput = useRef<HTMLInputElement>(null); const swipe = useRef<{x:number;y:number} | null>(null);
  const loadGeneration = useRef(0); const pageCreationKey = useRef(''); const coverCreationKey = useRef('');
  const consumedMemory=useRef('');
  const openedAgentPage=useRef(''),deleteKeys=useRef(new Map<string,string>());
  useEffect(() => {
    const generation = ++loadGeneration.current; let cancelled = false; coverCreationKey.current=crypto.randomUUID();consumedMemory.current='';setLoadReady(false);
    setScreen('book'); setPage(null); setDirty(false); setSelected(''); setError(''); setNotice(''); setBook(null); setPages([]); setCoverEditing(false);
    if (demo) {
      try { const stored = JSON.parse(localStorage.getItem(storageKey) || 'null') as JournalPage[] | null; setPages(orderPages((stored ?? [initialPage(pet.id,locale)]).map(item => localizeDemoPage(item,locale)))); } catch { setPages([initialPage(pet.id,locale)]); }
      try { setBook(JSON.parse(localStorage.getItem(bookStorageKey) || 'null') as JournalBook | null); } catch { setBook(null); }
      setBusy(false);setLoadReady(true);
      return () => { cancelled = true; };
    }
    setBusy(true);
    Promise.all([api<JournalPage[]>(`/journal/pages?petId=${encodeURIComponent(pet.id)}`), api<JournalBook | null>(`/journal/books?petId=${encodeURIComponent(pet.id)}`)]).then(([next,nextBook]) => { if (!cancelled && loadGeneration.current === generation) { setPages(orderPages(next)); setBook(nextBook); } }).catch(cause => { if (!cancelled) setError(messageOf(cause,locale)); }).finally(() => { if (!cancelled && loadGeneration.current===generation) {setBusy(false);setLoadReady(true);} });
    return () => { cancelled = true; };
  },[pet.id,demo,storageKey,bookStorageKey]);
  useEffect(()=>{
    if(!initialMemory||consumedMemory.current===initialMemory.key||!loadReady||busy)return;
    consumedMemory.current=initialMemory.key;pageCreationKey.current=crypto.randomUUID();
    setPage(diaryMemoryPage(initialMemory,pet.id,Math.max(-1,...pages.map(item=>item.pageOrder??0))+1,crypto.randomUUID(),demo));
    setScreen('edit');setCoverEditing(false);setDirty(true);setSelected('');setDraft(null);setUndo(null);setConflict(false);
    setNotice(t('นำเรื่องที่เลือกมาเป็นร่างแล้ว แต่งเพิ่มและบันทึกเมื่อพร้อม','Your selected story is now a draft. Decorate it and save when ready.'));
  },[initialMemory?.key,loadReady,busy,pet.id,demo]);
  useEffect(()=>{
    if(!loadReady||busy||dirty||demo)return;
    const params=agentEntryParams(window.location.href),id=agentTaskId(params.get('pageId'));
    if(!id||openedAgentPage.current===id||(params.get('petId')&&params.get('petId')!==pet.id))return;
    const index=pages.findIndex(item=>item.id===id);if(index<0)return;
    openedAgentPage.current=id;setReadIndex(index);setScreen('read');setCoverEditing(false);
  },[loadReady,busy,dirty,demo,pet.id,pages]);
  useEffect(() => { if(coverEditing && !book && !dirty) setPage(defaultCover()); if (demo) { setPages(current => current.map(item => localizeDemoPage(item,locale))); if (!dirty) setPage(current => current ? localizeDemoPage(current,locale) : current); } },[locale,demo]);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('chordjai:journal-dirty',{detail:{dirty}}));return()=>{window.dispatchEvent(new CustomEvent('chordjai:journal-dirty',{detail:{dirty:false}}));};},[dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'auto'});if(screen==='book'&&previousScreen.current==='read')coverButton.current?.focus({preventScroll:true});previousScreen.current=screen;},[screen]);
  const element = page?.elements.find(item => item.id === selected);
  const currentRead = pages[readIndex] ?? pages[0];
  const title = book?.title || t(`เรื่องของเรากับ${pet.name}`,`Our life with ${pet.name}`);
  function defaultCover(): JournalPage {
    return { id: book?.id || '', petId: pet.id, title, version: book?.version || 1, canvasHeight: STORY_HEIGHT, theme: book?.coverTheme || { background:'#ffe3c4',accent:'#c04a00',font:'sans' }, elements: book?.coverElements.map(item => ({...item})) || [
      { id:'cover-label',type:'text',x:80,y:190,width:640,height:130,rotation:0,content:t('สมุดความทรงจำของเรา','OUR MEMORY BOOK'),color:'#6a2d00' },
      { id:'cover-title',type:'text',x:75,y:390,width:650,height:230,rotation:0,content:pet.name,color:'#3a210d' },
      { id:'cover-paw',type:'sticker',x:300,y:770,width:200,height:200,rotation:-12,content:'graphic:paw',color:'#f47718' },
      { id:'cover-footer',type:'text',x:90,y:1150,width:620,height:90,rotation:0,content:t('วันธรรมดา ที่อยากจำไว้','Little days worth keeping'),color:'#6a2d00' },
    ] };
  }
  function canLeave() { return !dirty || window.confirm(t('มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?','You have unsaved changes. Leave this page?')); }
  function mutate(fn: (current: JournalPage) => JournalPage) { if (busy) return; setPage(current => current ? fn(current) : current); setDirty(true); }
  function patchElement(id: string, patch: Partial<JournalElement>) { mutate(current => ({ ...current,elements:current.elements.map(item => item.id === id ? boundElement({...item,...patch},canvasHeight(current)) : item) })); }
  function addElement(type: JournalElement['type'], content: string, x=140, y=360, dimensions?:{width:number;height:number}) {
    if (!page || page.elements.length >= 100) { setError(t('หน้านี้มีชิ้นงานครบ 100 ชิ้นแล้ว','This page already contains 100 items.')); return; }
    const id = crypto.randomUUID(); const size = dimensions ?? (type === 'text' ? {width:520,height:130} : {width:180,height:180});
    mutate(current => ({...current,elements:[...current.elements,boundElement({id,type,content,x,y,...size,rotation:0,color:current.theme.accent},canvasHeight(current))]})); setSelected(id);
  }
  function openEdit(item: JournalPage, isCover=false) { if (!canLeave()) return; setPage(clonePage(item)); setScreen('edit'); setCoverEditing(isCover); setDirty(false); setSelected(''); setDraft(null); setUndo(null); setError(''); setConflict(false); }
  function newPage() { if (!canLeave()) return; pageCreationKey.current=crypto.randomUUID(); setPage({id:'',petId:pet.id,title:t(`ความทรงจำกับ${pet.name}`,`Memories with ${pet.name}`),version:1,theme:{background:'#fffaf5',accent:'#c04a00',font:'sans'},elements:[],canvasHeight:STORY_HEIGHT,storyDate:today(),location:'',pageOrder:Math.max(-1,...pages.map(item=>item.pageOrder ?? 0))+1}); setScreen('edit'); setCoverEditing(false); setDirty(true); setSelected(''); setDraft(null); setUndo(null); setError(''); setConflict(false); }
  function showBook() { if (!canLeave()) return; setScreen('book'); setDirty(false); setSelected(''); setError(''); }
  function readPage(index:number) { if (!canLeave()) return; setReadIndex(Math.max(0,Math.min(pages.length-1,index))); setScreen('read'); setDirty(false); setSelected(''); }
  async function save() {
    if (!page || !page.title.trim()) return; setBusy(true); setError('');
    try {
      if (coverEditing) {
        const saved = demo ? {id:book?.id || `demo-book-${crypto.randomUUID()}`,petId:pet.id,title:page.title,coverTheme:page.theme,coverElements:page.elements,version:(book?.version ?? 0)+1} : await api<JournalBook>(book?.id ? `/journal/books/${book.id}` : '/journal/books',{...json(book?.id ? 'PATCH' : 'POST',{petId:pet.id,title:page.title,coverTheme:page.theme,coverElements:page.elements,...(book?.id ? {version:book.version} : {})}),...(!book?.id ? {headers:{'Idempotency-Key':coverCreationKey.current}} : {})});
        if (demo) localStorage.setItem(bookStorageKey,JSON.stringify(saved)); setBook(saved); setPage(current => current ? {...current,id:saved.id,version:saved.version} : current);
      } else {
        const saved = demo ? {...page,id:page.id || `demo-${crypto.randomUUID()}`,version:page.version+1,createdAt:page.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString()} : await api<JournalPage>(page.id ? `/journal/pages/${page.id}` : '/journal/pages',{...json(page.id ? 'PATCH' : 'POST',{petId:pet.id,title:page.title,theme:page.theme,elements:page.elements,canvasHeight:canvasHeight(page),storyDate:page.storyDate || null,location:page.location || '',...(page.id ? {version:page.version} : {})}),...(!page.id ? {headers:{'Idempotency-Key':pageCreationKey.current}} : {})});
        const next = orderPages(pages.some(item=>item.id===saved.id) ? pages.map(item=>item.id===saved.id ? saved : item) : [...pages,saved]);
        if (demo) localStorage.setItem(storageKey,JSON.stringify(next)); setPages(next); setPage(saved); setReadIndex(Math.max(0,next.findIndex(item=>item.id===saved.id)));
      }
      setDirty(false); setConflict(false); setNotice(demo ? t('บันทึกในเบราว์เซอร์นี้แล้ว','Saved in this browser.') : coverEditing ? t('บันทึกหน้าปกแล้ว','Cover saved.') : t('บันทึกหน้านี้แล้ว','Page saved.'));
    } catch(cause) { setConflict(cause instanceof ApiError && cause.status===409); setError(cause instanceof ApiError && cause.status===409 ? t('หน้านี้เปลี่ยนจากอุปกรณ์อื่นแล้ว โหลดฉบับล่าสุดก่อนบันทึกเพื่อไม่ทับข้อมูล','This changed on another device. Load the latest version before saving to avoid overwriting it.') : messageOf(cause,locale)); } finally { setBusy(false); }
  }
  async function reloadConflict() {
    if (!page || !window.confirm(t('โหลดฉบับล่าสุดจะทิ้งการแก้ไขที่ยังไม่ได้บันทึก ต้องการโหลดหรือไม่?','Loading the latest version discards unsaved changes. Continue?'))) return;
    setBusy(true);
    try {
      if (coverEditing) { const next = await api<JournalBook | null>(`/journal/books?petId=${encodeURIComponent(pet.id)}`); if (!next) throw new Error(t('ไม่พบสมุด','Book not found.')); setBook(next); setPage({...page,id:next.id,title:next.title,theme:next.coverTheme,elements:next.coverElements,version:next.version}); }
      else { const next = await api<JournalPage>(`/journal/pages/${page.id}`); setPage(next); setPages(current=>current.map(item=>item.id===next.id ? next : item)); }
      setDirty(false); setConflict(false); setError(''); setSelected('');
    } catch(cause) { setError(messageOf(cause,locale)); } finally { setBusy(false); }
  }
  async function removePage(item:JournalPage) {
    if (busy || !window.confirm(t(`ลบหน้า “${item.title}” จากสมุดของ${pet.name} หรือไม่? ลบแล้วไม่สามารถกู้คืนหน้านี้ในแอปได้ รูปต้นฉบับยังอยู่ในคลังรูป`,`Permanently delete “${item.title}” from ${pet.name}’s book? This page cannot be restored in the app. Uploaded originals remain in your media library.`))) return;
    setBusy(true); setError('');
    try { if (!demo){const identity=`${item.id}:${item.version}`;if(!deleteKeys.current.has(identity))deleteKeys.current.set(identity,crypto.randomUUID());await api(`/journal/pages/${item.id}`,{...json('DELETE',{version:item.version}),headers:{'Idempotency-Key':deleteKeys.current.get(identity)!}});} const next=pages.filter(page=>page.id!==item.id); if(demo)localStorage.setItem(storageKey,JSON.stringify(next)); setPages(next); setReadIndex(index=>Math.max(0,Math.min(index,next.length-1))); setScreen(next.length ? 'read' : 'book'); setDirty(false); setNotice(t('ลบหน้าสมุดแล้ว','Page deleted.')); } catch(cause) { if(cause instanceof ApiError&&cause.status===409){try{const latest=await api<JournalPage>(`/journal/pages/${item.id}`);setPages(current=>current.map(row=>row.id===latest.id?latest:row));}catch{}setError(t('หน้านี้เปลี่ยนแล้ว ตรวจฉบับล่าสุดก่อนลบอีกครั้ง','This page changed. Review the latest version before deleting again.'));}else setError(messageOf(cause,locale)); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    if (!page || page.elements.length >= 100) { setError(t('หน้านี้มีชิ้นงานครบ 100 ชิ้นแล้ว','This page already contains 100 items.')); return; }
    if (!file.type.startsWith('image/') || file.size > 8*1024*1024) { setError(t('เลือกรูปภาพขนาดไม่เกิน 8 MB','Choose an image no larger than 8 MB.')); return; }
    setBusy(true); setError('');
    try {
      let bitmap:ImageBitmap;
      try { bitmap=await createImageBitmap(file); } catch { throw new Error(t('อ่านรูปนี้ไม่ได้ ลองเลือกรูป JPG, PNG หรือ WebP แทน','This photo could not be read. Please try a JPG, PNG or WebP image.')); }
      const imageAspect = bitmap.width/bitmap.height; const canvas = document.createElement('canvas'); const ratio = Math.min(1,1600/Math.max(bitmap.width,bitmap.height)); canvas.width=Math.round(bitmap.width*ratio); canvas.height=Math.round(bitmap.height*ratio); const ctx=canvas.getContext('2d'); if(!ctx)throw new Error(t('เปิดรูปไม่สำเร็จ','Could not open this image.')); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
      let url:string;
      if(demo)url=canvas.toDataURL('image/jpeg',.85);
      else { const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error(t('แปลงรูปไม่สำเร็จ','Could not prepare this image.'))),'image/jpeg',.85)); if(blob.size>3.5*1024*1024)throw new Error(t('รูปยังใหญ่เกินไป ลองครอปหรือเลือกรูปอื่น','The photo is still too large. Try cropping it or choosing another image.')); const form=new FormData(); form.set('file',blob,'memory.jpg'); form.set('petId',pet.id); url=(await api<{url:string}>('/media/upload',{method:'POST',body:form})).url; }
      const height=canvasHeight(page), width=Math.min(650,(height-180)*imageAspect), photoHeight=width/imageAspect, id=crypto.randomUUID();
      // Commit the upload directly: mutation helpers intentionally ignore actions while busy.
      setPage(current=>current ? {...current,elements:[...current.elements,boundElement({id,type:'photo',content:url,x:(800-width)/2,y:(canvasHeight(current)-photoHeight)/2,width,height:photoHeight,rotation:0},canvasHeight(current))]} : current); setSelected(id); setDirty(true);
    } catch(cause) { setError(messageOf(cause,locale)); } finally { setBusy(false); }
  }
  function addMetadata(kind:'date'|'location') {
    if(!page)return;
    const content=kind==='date' ? dateForLocale(page.storyDate || today(),locale) : (page.location || t('สถานที่ของเรา','Our happy place'));
    const id=`metadata-${kind}`, previous=page.elements.find(item=>item.id===id);
    if(previous)patchElement(id,{content});
    else { mutate(current=>({...current,elements:[...current.elements,boundElement({id,type:'text',content,x:120,y:kind==='date'?canvasHeight(current)-250:canvasHeight(current)-150,width:560,height:80,rotation:0,color:'#6a2d00'},canvasHeight(current))]})); }
    setSelected(id); setMetadataOpen(true);
  }
  function closeMetadata() { mutate(current=>({...current,elements:current.elements.filter(item=>!(item.id==='metadata-date'&&!current.storyDate)&&!(item.id==='metadata-location'&&!current.location?.trim()))})); setMetadataOpen(false); }
  function updateMetadata(patch:Pick<JournalPage,'storyDate'|'location'>) { mutate(current=>({...current,...patch,elements:current.elements.map(item=>item.id==='metadata-date'&&patch.storyDate ? {...item,content:dateForLocale(patch.storyDate,locale)} : item.id==='metadata-location'&&patch.location!==undefined ? {...item,content:patch.location || t('สถานที่ของเรา','Our happy place')} : item)})); }
  async function decorate() {
    if(!page)return; setError(''); setNotice('');
    if(demo){setNotice(t('การตกแต่งด้วย AI ต้องเข้าสู่ระบบจริง ในพื้นที่ตัวอย่างคุณลากวาง เพิ่มรูป และแต่งสมุดเองได้','Sign in to decorate with AI. In this demo you can drag items, add photos and decorate the journal yourself.'));return;}
    if(!page.id || dirty){setError(t('บันทึกหน้านี้ก่อนให้ AI ช่วยตกแต่ง','Save this page before asking AI to decorate it.'));return;}
    setBusy(true);
    try{const next=await api<Draft>('/journal/decorate',json('POST',{...(coverEditing ? {bookId:page.id} : {pageId:page.id}),prompt,canvasHeight:canvasHeight(page)}));setDraft(validateDraft(next,canvasHeight(page),demo));}catch(cause){setError(cause instanceof Error && cause.message==='AI_LAYOUT_INVALID' ? t('แบบร่าง AI อยู่นอกขอบหน้าสมุด กรุณาลองใหม่','The AI draft extends beyond the page. Please try again.') : messageOf(cause,locale));}finally{setBusy(false);}
  }
  const alertArea=<>{error ? <ErrorBox message={error}/> : null}{conflict ? <button className="button secondary" onClick={()=>void reloadConflict()} disabled={busy}>{t('โหลดฉบับล่าสุด','Load latest version')}</button> : null}{notice ? <Notice>{notice}</Notice> : null}{busy ? <Busy label={t('กำลังทำงานกับสมุดของเรา','Working on your memory book')}/> : null}</>;
  return <section className="journal-section memory-book-section">
    {screen==='book' ? <>
      <div className="page-heading"><div><span className="eyebrow">{t('เรื่องของเรา เก็บไว้ด้วยกัน','Our little life, kept together')}</span><h1>{t('สมุดความทรงจำของเรา','Our memory book')}</h1><p>{t('เปิดหน้าปก อ่านเรื่องทีละหน้า แล้วเติมวันใหม่ ๆ ลงไป','Open the cover, read one memory at a time and add another little day.')}</p></div><button className="button" onClick={newPage} disabled={busy}><Plus size={18}/>{t('เพิ่มหน้าสมุด','New page')}</button></div>
      {alertArea}
      <div className="memory-book-landing"><button className="memory-book-cover" ref={coverButton} aria-label={t('เปิดสมุดความทรงจำ','Open memory book')} onClick={()=>pages.length ? readPage(0) : newPage()} disabled={busy}><div className="memory-cover-spine"/><Canvas page={defaultCover()} readOnly demo={demo}/><span className="memory-cover-open"><BookOpen size={18}/>{pages.length ? t('เปิดอ่านสมุด','Read book') : t('เริ่มหน้าแรก','Start your first page')}</span></button><div className="memory-book-intro"><span className="eyebrow">{t(`ของคุณและ${pet.name}`,`You & ${pet.name}`)}</span><h2>{title}</h2><p>{t(`บันทึกแล้ว ${pages.length} หน้า`,`${pages.length} saved ${pages.length===1?'page':'pages'}`)}</p><div className="memory-book-buttons"><button className="button" disabled={busy} onClick={()=>pages.length ? readPage(0) : newPage()}><BookOpen size={18}/>{pages.length ? t('อ่านสมุด','Read book') : t('เขียนหน้าแรก','Create the first page')}</button><button className="button secondary" disabled={busy} onClick={()=>openEdit(defaultCover(),true)}><MousePointer2 size={18}/>{t('แต่งหน้าปก','Edit cover')}</button></div><div className="memory-book-note"><ul><li>{t('เก็บทีละหน้า เพิ่มได้เมื่อพร้อม จะมีหน้าเดียวก็ได้','Keep one page or add more whenever you like.')}</li><li>{t('รูป ข้อความ วันที่ และสถานที่ แต่งได้ในแบบคุณ','Photos, words, dates and places — make each page yours.')}</li><li>{t('ความทรงจำอยู่ในสมุด ไม่หายไปหลัง 24 ชั่วโมง','Your memories stay in this book; they do not expire after 24 hours.')}</li></ul></div></div></div>
      {pages.length ? <div className="memory-page-overview"><div className="section-title"><h2>{t('ทุกหน้าในสมุด','Pages in your book')}</h2><span>{t('แตะเพื่อเปิดอ่าน','Tap to read')}</span></div><div className="memory-page-grid">{pages.map((item,index)=><button className="memory-page-card" key={item.id} onClick={()=>readPage(index)}><div className="memory-page-thumb" style={{aspectRatio:`800 / ${canvasHeight(item)}`}}><Canvas page={item} readOnly demo={demo} thumbnail/></div><span className="memory-page-number">{t(`หน้า ${index+1}`,`Page ${index+1}`)}</span><b>{item.title}</b>{item.storyDate ? <small>{dateForLocale(item.storyDate,locale)}</small> : null}</button>)}<button className="memory-page-card memory-add-page" onClick={newPage}><Plus size={30}/><b>{t('เพิ่มความทรงจำ','Add a memory')}</b></button></div></div> : null}
    </> : screen==='read' && currentRead ? <Modal title={currentRead.title} className="memory-reader-dialog" onClose={showBook}><div className="memory-reader-immersive">
      <div className="memory-reader-top"><div className="memory-reader-heading"><button className="text-button" onClick={showBook}><ArrowLeft size={18}/>{t('หน้าปกสมุด','Book cover')}</button><span>{t(`หน้า ${readIndex+1} จาก ${pages.length}`,`Page ${readIndex+1} of ${pages.length}`)}</span><button className="button secondary small" onClick={()=>openEdit(currentRead)} disabled={busy}><MousePointer2 size={16}/>{t('แก้ไขหน้านี้','Edit page')}</button></div>{error ? <ErrorBox message={error}/> : null}{busy ? <Busy label={t('กำลังทำงานกับสมุดของเรา','Working on your memory book')}/> : null}</div>
      <div className="memory-reader-stage"><div className="memory-story-reader" style={{width:`min(100cqw, calc(100cqh * ${800/canvasHeight(currentRead)}), 440px)`}} onPointerDown={event=>{swipe.current={x:event.clientX,y:event.clientY};}} onPointerUp={event=>{const start=swipe.current;swipe.current=null;if(start&&Math.abs(event.clientX-start.x)>60&&Math.abs(event.clientY-start.y)<60)setReadIndex(index=>Math.max(0,Math.min(pages.length-1,index+(event.clientX<start.x?1:-1))));}}>
        <div className="memory-story-progress" aria-label={t('หน้าในสมุด','Book pages')}>{pages.map((item,index)=><button key={item.id} className={index<=readIndex?'visited':''} aria-label={t(`เปิดหน้า ${index+1}`,`Read page ${index+1}`)} aria-current={index===readIndex?'page':undefined} onClick={()=>setReadIndex(index)}/>)}</div>
        <Canvas page={currentRead} readOnly demo={demo}/>
        <button className="memory-tap-zone previous" aria-label={t('หน้าก่อนหน้า','Previous page')} disabled={readIndex===0} onClick={()=>setReadIndex(index=>Math.max(0,index-1))}><ChevronLeft size={26}/></button><button className="memory-tap-zone next" aria-label={t('หน้าถัดไป','Next page')} disabled={readIndex===pages.length-1} onClick={()=>setReadIndex(index=>Math.min(pages.length-1,index+1))}><ChevronRight size={26}/></button>
      </div></div>
      <div className="memory-reader-bottom"><div className="memory-reader-caption"><h2>{currentRead.title}</h2><div>{currentRead.storyDate ? <span><CalendarDays size={16}/>{dateForLocale(currentRead.storyDate,locale)}</span> : null}{currentRead.location ? <span><MapPin size={16}/>{currentRead.location}</span> : null}</div></div>
      <div className="memory-reader-actions"><button className="button secondary" onClick={()=>setReadIndex(index=>Math.max(0,index-1))} disabled={readIndex===0}><ArrowLeft size={17}/>{t('ก่อนหน้า','Previous')}</button><button className="button" onClick={newPage}><Plus size={17}/>{t('เพิ่มหน้าสมุด','New page')}</button><button className="button secondary" onClick={()=>setReadIndex(index=>Math.min(pages.length-1,index+1))} disabled={readIndex===pages.length-1}>{t('ถัดไป','Next')}<ArrowRight size={17}/></button></div><button className="text-button danger memory-delete-page" onClick={()=>void removePage(currentRead)} disabled={busy}><Trash2 size={15}/>{t('ลบหน้านี้','Delete page')}</button><div className="memory-reader-language"><LanguageSwitcher/></div></div>
    </div></Modal> : page ? <>
      <div className="memory-editor-heading"><button className="text-button" onClick={showBook}><ArrowLeft size={18}/>{t('กลับสมุด','Back to book')}</button><h1>{coverEditing ? t('แต่งหน้าปก','Edit cover') : t('แต่งหน้าความทรงจำ','Edit memory page')}</h1><button className="button small" disabled={busy||!page.title.trim()} onClick={()=>void save()}><Save size={17}/>{t('บันทึก','Save')}</button></div>{alertArea}
      <div className="memory-editor-title"><input aria-label={coverEditing ? t('ชื่อสมุด','Book title') : t('ชื่อหน้าสมุด','Page title')} value={page.title} maxLength={120} disabled={busy} onChange={event=>mutate(current=>({...current,title:event.target.value}))}/><span className={`save-state ${dirty?'unsaved':''}`}>{dirty ? t('ยังไม่ได้บันทึก','Unsaved') : t('บันทึกแล้ว','Saved')}</span></div>
      <div className="memory-story-workspace"><div className="memory-story-column"><div className="memory-story-toolbar"><button className="memory-tool" disabled={busy} onClick={()=>addElement('text',t('ข้อความของเรา','Your words'))}><Type size={21}/><span>{t('ข้อความ','Text')}</span></button><button className="memory-tool" disabled={busy} onClick={()=>uploadInput.current?.click()}><ImagePlus size={21}/><span>{t('รูปภาพ','Photo')}</span></button>{!coverEditing ? <><button className="memory-tool" disabled={busy} onClick={()=>addMetadata('date')}><CalendarDays size={21}/><span>{t('วันที่','Date')}</span></button><button className="memory-tool" disabled={busy} onClick={()=>addMetadata('location')}><MapPin size={21}/><span>{t('สถานที่','Location')}</span></button></> : null}<input ref={uploadInput} type="file" accept="image/*" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value='';}}/></div><div className="memory-editor-canvas"><Canvas page={page} selected={selected} onSelect={setSelected} onPatch={patchElement} onDrop={addElement} readOnly={busy} demo={demo}/></div><p className="memory-gesture-hint">{t('ลากเพื่อย้าย · ใช้สองนิ้วหรือมุมรูปเพื่อย่อ–ขยาย','Drag to move · Pinch or pull the corner to resize')}</p></div>
      <aside className="memory-editor-controls"><div className="memory-help"><ul><li>{t('แตะรูปหรือข้อความเพื่อแก้ไข แล้วลากไปตำแหน่งที่ชอบ','Select a photo or text, then drag it where you like.')}</li><li>{t('ย่อ–ขยายด้วยสองนิ้ว ปุ่ม − / + หรือแถบขนาด','Resize with two fingers, the − / + buttons or the size slider.')}</li><li>{t('กดบันทึกเมื่อพร้อม แล้วกลับไปอ่านจากหน้าปกได้','Save when ready, then open your page from the book cover.')}</li></ul></div>
      {element ? <div className="memory-item-controls"><div className="memory-control-heading"><b>{element.type==='photo'?t('รูปภาพ','Photo'):element.type==='text'?t('ข้อความ','Text'):t('สติกเกอร์','Sticker')}</b><button className="icon-button danger" aria-label={t('ลบชิ้นนี้','Delete this item')} disabled={busy} onClick={()=>{mutate(current=>({...current,elements:current.elements.filter(item=>item.id!==selected)}));setSelected('');}}><Trash2 size={19}/></button></div>{element.type==='text' || (element.type==='sticker'&&!element.content.startsWith('graphic:')) ? <label className="field compact">{t('เนื้อหา','Content')}<textarea rows={3} maxLength={1000} value={element.content} disabled={busy} onChange={event=>patchElement(element.id,{content:event.target.value})}/></label> : null}<label className="field compact"><span>{t('ขนาด','Size')}</span><div className="memory-size-controls"><button className="icon-button" aria-label={t('ย่อชิ้นงาน','Make item smaller')} disabled={busy} onClick={()=>patchElement(element.id,scaleElement(element,.9,canvasHeight(page)))}><Minus size={18}/></button><input type="range" aria-label={t('ขนาดชิ้นงาน','Item size')} min="24" max="800" value={element.width} disabled={busy} onChange={event=>patchElement(element.id,scaleElement(element,Number(event.target.value)/element.width,canvasHeight(page)))}/><button className="icon-button" aria-label={t('ขยายชิ้นงาน','Make item larger')} disabled={busy} onClick={()=>patchElement(element.id,scaleElement(element,1.1,canvasHeight(page)))}><Plus size={18}/></button></div></label><label className="field compact"><span><RotateCw size={14}/> {t('หมุน','Rotation')}</span><input type="range" min="-180" max="180" value={element.rotation} disabled={busy} onChange={event=>patchElement(element.id,{rotation:Number(event.target.value)})}/></label>{element.type!=='photo' ? <label className="field compact">{t('สีชิ้นงาน','Item colour')}<input type="color" value={safeColor(element.color||'',page.theme.accent)} disabled={busy} onChange={event=>patchElement(element.id,{color:event.target.value})}/></label> : <button className="button secondary small" disabled={busy} onClick={()=>patchElement(element.id,{x:0,y:0,width:800,height:canvasHeight(page)})}>{t('ใช้รูปเป็นพื้นหลัง','Use as background')}</button>}<div className="memory-layer-buttons"><button className="text-button" disabled={busy} onClick={()=>mutate(current=>({...current,elements:[...current.elements.filter(item=>item.id!==element.id),element]}))}>{t('ไว้ด้านหน้า','Bring to front')}</button><button className="text-button" disabled={busy} onClick={()=>mutate(current=>({...current,elements:[element,...current.elements.filter(item=>item.id!==element.id)]}))}>{t('ไว้ด้านหลัง','Send to back')}</button></div></div> : null}
      <span className="tool-label">{t('สติกเกอร์ของน้อง','Pet stickers')}</span><div className="sticker-palette">{stickers.map(({value,label,icon:Icon})=><button key={value} aria-label={t(`เพิ่มสติกเกอร์ ${label}`,`Add decoration: ${label}`)} title={label} disabled={busy} draggable onDragStart={event=>event.dataTransfer.setData('application/chordjai',JSON.stringify({type:'sticker',content:value}))} onClick={()=>addElement('sticker',value)}><Icon size={25} strokeWidth={1.5}/></button>)}</div><span className="tool-label">{t('สีพื้นหน้า','Page colour')}</span><div className="color-palette">{colors.map(color=><button key={color} aria-label={t(`ใช้สีพื้น ${color}`,`Use paper colour ${color}`)} className={page.theme.background===color?'selected':''} style={{background:color}} disabled={busy} onClick={()=>mutate(current=>({...current,theme:{...current.theme,background:color}}))}/>)}</div>
      <details className="memory-ai-tools"><summary><Sparkles size={19}/>{t('ให้ AI ช่วยแต่ง','Decorate with AI')}</summary><label className="field"><span className="sr-only">{t('คำสั่งตกแต่งสมุด','Journal decoration prompt')}</span><textarea rows={3} value={prompt} maxLength={1500} disabled={busy} onChange={event=>setPrompt(event.target.value)} placeholder={t('ส้มสดใส น้องอยู่กลางหน้า มีดาวเล็ก ๆ','Bright orange, a pet photo in the centre and little stars')}/></label><button className="button full" disabled={busy||!prompt.trim()} onClick={()=>void decorate()}><Sparkles size={17}/>{t('สร้างแบบร่าง','Create a draft')}</button><small>{t('ตรวจแบบร่างก่อนเลือกใช้ AI ยังไม่บันทึกแทนคุณ','Review the draft before applying it. AI does not save it for you.')}</small>{undo ? <button className="text-button" disabled={busy} onClick={()=>{mutate(current=>({...current,...undo}));setUndo(null);}}><Undo2 size={16}/>{t('ย้อนก่อนใช้แบบร่าง AI','Undo the AI layout')}</button> : null}</details>
      </aside></div>
    </> : null}
    {metadataOpen && page ? <Modal title={t('วันที่และสถานที่','Date & place')} onClose={closeMetadata}><label className="field">{t('วันที่ของความทรงจำ','Memory date')}<input type="date" value={page.storyDate || ''} onChange={event=>updateMetadata({storyDate:event.target.value || null})}/></label><label className="field">{t('สถานที่','Location')}<input value={page.location || ''} maxLength={160} onChange={event=>updateMetadata({location:event.target.value})} placeholder={t('บ้านของเรา หรือชื่อสวนที่ไปเที่ยว','Home, or a favourite park')}/></label><button className="button full" onClick={closeMetadata}><Check size={18}/>{t('เรียบร้อย','Done')}</button></Modal> : null}
    {draft && page ? <Modal title={t('ดูแบบร่างหน้าสมุด','Preview your page')} className="ai-preview-dialog" onClose={()=>setDraft(null)}><div className="memory-draft-preview"><Canvas page={{...page,...draft}} readOnly demo={demo}/></div><Notice>{t('ตรวจข้อความและรูปก่อนใช้แบบร่าง แล้วกดบันทึกเมื่อพร้อม','Check the words and photos before applying, then save when ready.')}</Notice><div className="memory-draft-actions"><button className="button" onClick={()=>{setUndo({theme:page.theme,elements:page.elements});mutate(current=>({...current,...draft}));setDraft(null);setSelected('');}}><Check size={18}/>{t('ใช้แบบร่างนี้','Apply this draft')}</button><button className="button secondary" onClick={()=>setDraft(null)}>{t('กลับไปแก้','Back to editing')}</button></div></Modal> : null}
  </section>;
}

interface Gesture { id:string; mode:'drag'|'resize'; original:JournalElement; originX:number; originY:number; pointers:Map<number,{x:number;y:number}>; distance?:number; }
function Canvas({page,selected='',onSelect,onPatch,onDrop,readOnly=false,demo=false,thumbnail=false}:{page:JournalPage;selected?:string;onSelect?:(id:string)=>void;onPatch?:(id:string,patch:Partial<JournalElement>)=>void;onDrop?:(type:JournalElement['type'],content:string,x:number,y:number)=>void;readOnly?:boolean;demo?:boolean;thumbnail?:boolean}) {
  const {locale,t}=useLocale(); const board=useRef<HTMLDivElement>(null); const gesture=useRef<Gesture | null>(null); const [failedPhotos,setFailedPhotos]=useState<string[]>([]); const height=canvasHeight(page);
  function start(event:PointerEvent<HTMLElement>,item:JournalElement,mode:'drag'|'resize'='drag') {
    if(readOnly)return;event.preventDefault();event.stopPropagation();onSelect?.(item.id);event.currentTarget.setPointerCapture(event.pointerId);
    const previous=gesture.current;
    if(previous&&previous.id===item.id){previous.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(previous.pointers.size===2){const [a,b]=[...previous.pointers.values()];previous.original={...item};previous.distance=Math.hypot(a.x-b.x,a.y-b.y);}}
    else gesture.current={id:item.id,mode,original:{...item},originX:event.clientX,originY:event.clientY,pointers:new Map([[event.pointerId,{x:event.clientX,y:event.clientY}]])};
  }
  function move(event:PointerEvent<HTMLElement>) {
    const current=gesture.current,rect=board.current?.getBoundingClientRect();if(!current||!rect||!current.pointers.has(event.pointerId))return;
    current.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(current.pointers.size===2&&current.distance){const [a,b]=[...current.pointers.values()];onPatch?.(current.id,scaleElement(current.original,Math.hypot(a.x-b.x,a.y-b.y)/current.distance,height));return;}
    const dx=(event.clientX-current.originX)*800/rect.width,dy=(event.clientY-current.originY)*height/rect.height;
    if(current.mode==='resize'){const factor=Math.max((current.original.width+dx)/current.original.width,(current.original.height+dy)/current.original.height);const next=scaleElement(current.original,factor,height);onPatch?.(current.id,boundElement({...next,x:current.original.x,y:current.original.y},height));}
    else onPatch?.(current.id,boundElement({...current.original,x:current.original.x+dx,y:current.original.y+dy},height));
  }
  function end(event:PointerEvent<HTMLElement>) { const current=gesture.current;if(!current)return;current.pointers.delete(event.pointerId);if(current.pointers.size===0)gesture.current=null;else {current.distance=undefined;current.original=page.elements.find(item=>item.id===current.id) || current.original;const remaining=[...current.pointers.values()][0];current.originX=remaining.x;current.originY=remaining.y;} }
  function drop(event:DragEvent<HTMLDivElement>) {event.preventDefault();if(readOnly)return;try{const data=JSON.parse(event.dataTransfer.getData('application/chordjai')) as {type:JournalElement['type'];content:string};const rect=event.currentTarget.getBoundingClientRect();if(['text','sticker'].includes(data.type)&&typeof data.content==='string')onDrop?.(data.type,data.content,(event.clientX-rect.left)*800/rect.width,(event.clientY-rect.top)*height/rect.height);}catch{/* Ignore unsupported drag payloads. */}}
  return <div className={`journal-canvas memory-story-canvas ${readOnly?'read-only':''}`} ref={board} style={{background:safeColor(page.theme.background,'#fffaf5'),fontFamily:'var(--font-body)',aspectRatio:`800 / ${height}`}} onClick={()=>onSelect?.('')} onDragOver={event=>{if(!readOnly)event.preventDefault();}} onDrop={drop}><span className="paper-texture"/>{page.elements.map(item=><div key={item.id} tabIndex={readOnly?-1:0} role={readOnly?undefined:'button'} aria-label={readOnly?undefined:t(`${item.type==='photo'?'รูปภาพ':item.type==='sticker'?graphicLabel(item.content,locale):item.content} ลากเพื่อย้าย หรือใช้ปุ่มลูกศร`,`${item.type==='photo'?'Photo':item.type==='sticker'?graphicLabel(item.content,locale):item.content} Drag to move, or use the arrow keys`)} className={`journal-element ${item.type} ${item.id==='metadata-date'||item.id==='metadata-location'?'memory-metadata-chip':''} ${selected===item.id&&!readOnly?'selected':''}`} style={{left:`${item.x/8}%`,top:`${item.y/height*100}%`,width:`${item.width/8}%`,height:`${item.height/height*100}%`,transform:`rotate(${item.rotation}deg)`,color:safeColor(item.color||'',page.theme.accent),fontSize:thumbnail ? `${item.type==='sticker' ? item.width/8 : Math.min(6,item.height/25)}cqw` : item.type==='sticker'?`clamp(26px,${item.width/8}cqw,210px)`:`clamp(12px,${Math.min(6,item.height/25)}cqw,48px)`}} onClick={event=>{event.stopPropagation();onSelect?.(item.id);}} onPointerDown={event=>start(event,item)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event=>{if(readOnly)return;const offsets:Record<string,[number,number]>={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};if(offsets[event.key]){event.preventDefault();onSelect?.(item.id);const [x,y]=offsets[event.key];onPatch?.(item.id,boundElement({...item,x:item.x+x,y:item.y+y},height));}if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();/* Delete remains an explicit toolbar action to protect user work. */}}}>{item.type==='photo' ? (!failedPhotos.includes(`${item.id}:${item.content}`)&&safeJournalPhoto(item.content,demo) ? <img src={safeJournalPhoto(item.content,demo)} alt={t('รูปความทรงจำ','Memory photo')} draggable={false} onError={()=>setFailedPhotos(current=>[...current,`${item.id}:${item.content}`])}/> : <span className="journal-photo-unavailable">{t('รูปไม่พร้อมแสดง','Photo unavailable')}</span>) : item.type==='sticker' ? <JournalGraphic value={item.content}/> : <span>{item.content}</span>}{selected===item.id&&!readOnly ? <span className="memory-resize-handle" aria-hidden="true" onPointerDown={event=>start(event,item,'resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={event=>event.stopPropagation()}/> : null}</div>)}<span className="journal-page-signature">{t('ชิดใจ · ','ChordJai · ')}{page.title}</span></div>;
}
