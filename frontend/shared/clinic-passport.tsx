'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {AlertCircle,BookOpen,Check,RefreshCw,Search,ShieldCheck,Stethoscope} from 'lucide-react';
import type {PassportClinicNote,PassportSnapshot} from '../../packages/contracts/src/passport';
import {api,json,messageOf,dateForLocale} from './api';
import {useLocale} from './locale';
import {PassportBrief,type PassportBriefPhoto} from './passport-brief';

type Membership={clinicId:string;name:string;role:string};
type Snapshot={id:string;sessionId:string;petId:string;sessionVersion:number;document:PassportSnapshot;confirmedAt:string;canWrite?:boolean};
type ListedSnapshot=Omit<Snapshot,'document'>&{document:Pick<PassportSnapshot,'concern'>&{pet:Pick<PassportSnapshot['pet'],'name'|'species'>}};
type Detail={snapshot:Snapshot;clinicId:string;canWrite:boolean;notes:PassportClinicNote[];notesTruncated?:boolean;media:{id:string;url:string}[]};
type NoteAttempt={clinicId:string;snapshotId:string;clientNoteId:string;findings:string;treatment:string;careInstructions:string;nextFollowupAt:string|null};

export function ClinicPassport({memberships,initialPetId='',initialClinicId=''}:{memberships:Membership[];initialPetId?:string;initialClinicId?:string}){
  const {locale,t}=useLocale(),localeRef=useRef(locale);localeRef.current=locale;
  const [petId,setPetId]=useState(initialPetId),[clinicId,setClinicId]=useState(initialClinicId||memberships[0]?.clinicId||'');
  const [sessions,setSessions]=useState<ListedSnapshot[]>([]),[detail,setDetail]=useState<Detail|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  function valid(run:number){return mounted.current&&run===generation.current;}
  function clear(){generation.current++;setDetail(null);setSessions([]);setLoaded(false);setError('');setBusy(false);}
  async function load(event?:FormEvent){event?.preventDefault();if(busy)return;const run=++generation.current;setBusy(true);setError('');setDetail(null);setLoaded(false);setSessions([]);
    try{const value=await api<{sessions:ListedSnapshot[]}>(`/clinic/pets/${encodeURIComponent(petId.trim())}/passports?clinicId=${encodeURIComponent(clinicId)}`);if(valid(run)){setSessions(value.sessions);setLoaded(true);}}
    catch(e){if(valid(run))setError(messageOf(e,localeRef.current));}finally{if(valid(run))setBusy(false);}
  }
  async function select(sessionId:string){if(busy)return;const run=++generation.current;setBusy(true);setError('');setDetail(null);
    try{const value=await api<Detail>(`/clinic/passports/${encodeURIComponent(sessionId)}?clinicId=${encodeURIComponent(clinicId)}`);if(valid(run))setDetail(value);}
    catch(e){if(valid(run))setError(messageOf(e,localeRef.current));}finally{if(valid(run))setBusy(false);}
  }
  return <section className="portal-panel clinic-passport-panel" aria-labelledby="clinic-passport-heading"><div className="portal-section-title"><div><span className="portal-eyebrow">{t('อ่านก่อนพบ ดูแลต่อหลังพบ','Read before the visit, continue care afterward')}</span><h2 id="clinic-passport-heading">{t('Pet Passport เตรียมพบหมอ','Pet Passport visit preparation')}</h2></div><BookOpen size={25}/></div><p className="portal-muted">{t('เปิดคำตอบและรูปที่เจ้าของตรวจยืนยันแล้ว สิทธิ์ Passport แยกจากสมุดวัคซีนและไดอารี่ ต้องเลือกคลินิกที่ได้รับอนุญาต','Open answers and photos reviewed and confirmed by the owner. Passport access is separate from vaccination booklet and diary access. Select the authorised clinic.')}</p>
    <form className="clinic-passport-search" onSubmit={event=>void load(event)}><label>{t('คลินิกที่กำลังดูแล','Clinic providing care')}<select required value={clinicId} disabled={busy} onChange={event=>{clear();setClinicId(event.target.value);}}>{memberships.map(member=><option key={member.clinicId} value={member.clinicId}>{member.name}</option>)}</select></label><label>{t('รหัสน้อง','Pet ID')}<input required value={petId} disabled={busy} onChange={event=>{clear();setPetId(event.target.value);}} placeholder={t('วางรหัสน้องจากเจ้าของหรือนัดหมาย','Paste the pet ID from the owner or appointment')} autoComplete="off"/></label><button className="portal-button" disabled={busy||!clinicId}><Search size={17}/>{t('ค้นหา Passport','Find Passports')}</button></form>
    {error?<div className="portal-error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>:null}{busy?<div className="portal-loading" role="status"><span/>{t('กำลังตรวจสิทธิ์และเปิด Passport','Checking access and opening Passport')}</div>:null}
    {loaded&&!sessions.length?<div className="portal-note"><ShieldCheck size={19}/><p>{t('ยังไม่มี Passport ที่คลินิกนี้อ่านได้ เจ้าของต้องตรวจยืนยัน เลือกแชร์ให้คลินิก และให้สิทธิ์ passport.read ที่ยังไม่หมดอายุ','No Passports are available for this clinic. The owner must confirm, select clinic sharing, and grant unexpired Passport read access.')}</p></div>:null}
    {sessions.length?<div className="clinic-passport-list" aria-label={t('Passport ที่ได้รับอนุญาต','Authorised Passports')}>{sessions.map(value=><button key={value.id} type="button" disabled={busy} aria-pressed={detail?.snapshot.id===value.id} onClick={()=>void select(value.sessionId)}><FilePassportIcon/><span><b>{value.document.pet.name} · {value.document.concern}</b><small>{t('เจ้าของยืนยัน','Owner confirmed')} {dateForLocale(value.confirmedAt,locale)}</small></span></button>)}</div>:null}
    {detail?<ClinicPassportDetail key={`${detail.snapshot.id}:${clinicId}`} detail={detail} onReload={()=>void select(detail.snapshot.sessionId)}/>:null}
    <div className="portal-panel-footnote"><ShieldCheck size={16}/><span>{t('ตรวจสิทธิ์ปัจจุบันก่อนเปิดทุกครั้ง รวมถึงแต่ละรูป เจ้าของถอนสิทธิ์ได้ และการอ่านกับการบันทึกมีประวัติการเข้าถึง','Current permission is checked for every view and photo. The owner can revoke access. Reading and note creation are audited.')}</span></div>
  </section>;
}
function FilePassportIcon(){return <BookOpen size={20}/>;}

function ClinicPassportDetail({detail,onReload}:{detail:Detail;onReload:()=>void}){
  const {locale,t}=useLocale(),localeRef=useRef(locale);localeRef.current=locale;
  const [photos,setPhotos]=useState<PassportBriefPhoto[]>([]),[photoState,setPhotoState]=useState<'loading'|'unavailable'|undefined>(detail.media.length?'loading':undefined);
  const [findings,setFindings]=useState(''),[treatment,setTreatment]=useState(''),[careInstructions,setCareInstructions]=useState(''),[nextFollowup,setNextFollowup]=useState(''),[checked,setChecked]=useState(false);
  const [attempt,setAttempt]=useState<NoteAttempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const mounted=useRef(false),urls=useRef<string[]>([]);
  useEffect(()=>{mounted.current=true;const controller=new AbortController();
    async function load(){if(!detail.media.length)return;let failed=false;const ready:PassportBriefPhoto[]=[];
      await Promise.all(detail.media.map(async media=>{try{const token=sessionStorage.getItem('chordjai.session');if(!token)throw new Error('SESSION_REQUIRED');
        const photoPath=`/api/v1/clinic/passports/${encodeURIComponent(detail.snapshot.sessionId)}/media/${encodeURIComponent(media.id)}?clinicId=${encodeURIComponent(detail.clinicId)}`;
        const response=await fetch(photoPath,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'});
        if(!response.ok||!response.headers.get('content-type')?.startsWith('image/jpeg'))throw new Error('PHOTO_UNAVAILABLE');
        const blob=await response.blob();if(controller.signal.aborted)return;const url=URL.createObjectURL(blob);urls.current.push(url);ready.push({mediaId:media.id,url});
      }catch{if(!controller.signal.aborted)failed=true;}}));
      if(!controller.signal.aborted){setPhotos(ready);setPhotoState(failed?'unavailable':undefined);}
    }
    void load();return()=>{mounted.current=false;controller.abort();for(const url of urls.current)URL.revokeObjectURL(url);urls.current=[];};
  },[detail]);
  async function save(event:FormEvent){event.preventDefault();if(busy||!attempt&&(!checked||!findings.trim()&&!treatment.trim()&&!careInstructions.trim()))return;
    const body=attempt??{clinicId:detail.clinicId,snapshotId:detail.snapshot.id,clientNoteId:crypto.randomUUID(),findings:findings.trim(),treatment:treatment.trim(),careInstructions:careInstructions.trim(),nextFollowupAt:nextFollowup?new Date(`${nextFollowup}:00+07:00`).toISOString():null};
    setAttempt(body);setBusy(true);setError('');
    try{await api(`/clinic/passports/${detail.snapshot.sessionId}/notes`,json('POST',body));if(mounted.current){setAttempt(null);setSaved(true);setFindings('');setTreatment('');setCareInstructions('');setNextFollowup('');setChecked(false);}}
    catch(e){if(mounted.current)setError(messageOf(e,localeRef.current));}finally{if(mounted.current)setBusy(false);}
  }
  return <><PassportBrief document={detail.snapshot.document} notes={detail.notes} photos={photos} photoState={photoState} showPrint/>{detail.notesTruncated?<p className="portal-muted">{t('แสดงบันทึกคลินิกล่าสุด 100 รายการ','Showing the latest 100 clinic notes.')}</p>:null}
    <button type="button" className="portal-button secondary" disabled={busy} onClick={onReload}><RefreshCw size={17}/>{t('โหลด Passport และสิทธิ์ล่าสุด','Reload Passport and current access')}</button>
    {detail.canWrite?<form className="clinic-passport-note-form" onSubmit={event=>void save(event)}><h3><Stethoscope size={21}/>{t('บันทึกผลหลังพบหมอ','Record the visit outcome')}</h3><p>{t('เฉพาะสัตวแพทย์ของคลินิกที่ได้รับสิทธิ์เขียน ข้อมูลจะเป็นบันทึกคลินิกแยกจากคำตอบเจ้าของ เจ้าของตรวจและรับเข้าบันทึกดูแลก่อนใช้ติดตาม ไม่ได้ส่ง LINE ทันที','For veterinarian members with write access. This creates a separate clinic-authored note. The owner reviews and accepts it into the care diary before follow-up use. No immediate LINE message is sent.')}</p>
      <div className="clinic-passport-note-fields"><label>{t('สิ่งที่ตรวจพบ / ประเมิน','Findings / assessment')}<textarea rows={3} maxLength={4000} value={findings} disabled={busy||!!attempt} onChange={event=>setFindings(event.target.value)}/></label><label>{t('การรักษาที่ให้','Treatment provided')}<textarea rows={3} maxLength={4000} value={treatment} disabled={busy||!!attempt} onChange={event=>setTreatment(event.target.value)}/></label><label>{t('คำแนะนำการดูแลที่บ้าน','Home-care instructions')}<textarea rows={3} maxLength={4000} value={careInstructions} disabled={busy||!!attempt} onChange={event=>setCareInstructions(event.target.value)}/></label><label>{t('นัดติดตาม (เวลาไทย)','Follow-up appointment (Bangkok time)')}<input type="datetime-local" value={nextFollowup} disabled={busy||!!attempt} onChange={event=>setNextFollowup(event.target.value)}/></label></div>
      <label className="clinic-passport-attestation"><input type="checkbox" checked={checked} disabled={busy||!!attempt} onChange={event=>setChecked(event.target.checked)}/><span>{t('ฉันตรวจบันทึกนี้แล้ว และเป็นผู้รับผิดชอบข้อมูลการพบหมอครั้งนี้','I have reviewed this note and am responsible for the information about this visit')}</span></label>
      {error?<div className="portal-error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>:null}{saved?<p className="clinic-passport-notice" role="status">{t('บันทึกแล้ว เจ้าของจะเห็นเพื่อรับเข้าบันทึกดูแล โหลดล่าสุดเพื่ออ่านบันทึกนี้','Note recorded. The owner can review it for their care diary. Reload to read the new note.')}</p>:null}
      <button className="portal-button" disabled={busy||!attempt&&(!checked||!findings.trim()&&!treatment.trim()&&!careInstructions.trim())}><Check size={17}/>{busy?t('กำลังบันทึก','Saving'):attempt?t('ลองบันทึกคำขอเดิมอีกครั้ง','Retry the same note'):t('ยืนยันบันทึกคลินิก','Confirm clinic note')}</button>{attempt?<button type="button" className="portal-button secondary" disabled={busy} onClick={onReload}>{t('ตรวจผลด้วยข้อมูลล่าสุด','Check the current result')}</button>:null}
    </form>:<p className="portal-muted">{t('คุณอ่าน Passport นี้ได้ การเขียนบันทึกต้องเป็นสมาชิกสัตวแพทย์และได้รับสิทธิ์เขียนแยกจากเจ้าของ','You can read this Passport. Writing a note requires a veterinarian membership and separate write permission from the owner.')}</p>}
  </>;
}
