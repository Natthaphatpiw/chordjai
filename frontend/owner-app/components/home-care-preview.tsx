'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,NotebookPen,RefreshCw} from 'lucide-react';
import {api,dateForLocale} from '../../shared/api';
import {useLocale} from '../../shared/locale';
import type {Pet} from '../lib/types';
import type {CareEntry} from '../lib/care-types';
import {careInstantKey} from './care-diary-model';

type PreviewEntry=Pick<CareEntry,'id'|'petId'|'title'|'observedAt'|'narrative'>;
type Props={pet:Pet;demo:boolean;onOpen:()=>void};

function previewEntries(value:unknown,petId:string):PreviewEntry[]{
  if(!Array.isArray(value))return[];
  return value.filter((entry):entry is PreviewEntry=>{
    if(!entry||typeof entry!=='object')return false;
    const item=entry as Partial<PreviewEntry>;
    return item.petId===petId&&typeof item.id==='string'&&typeof item.title==='string'&&typeof item.observedAt==='string'&&Number.isFinite(Date.parse(item.observedAt))&&typeof item.narrative==='string';
  }).map(entry=>({id:entry.id,petId:entry.petId,title:entry.title,observedAt:entry.observedAt,narrative:entry.narrative}))
    .sort((left,right)=>careInstantKey(right.observedAt).localeCompare(careInstantKey(left.observedAt))||right.id.localeCompare(left.id)).slice(0,3);
}

export default function HomeCarePreview({pet,demo,onOpen}:Props){
  const{locale,t}=useLocale(),headingId=useId();
  const[entries,setEntries]=useState<PreviewEntry[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  const epoch=useRef(0);
  useEffect(()=>{
    const current=++epoch.current,controller=new AbortController();
    setEntries([]);setLoading(true);setFailed(false);
    if(demo){
      try{
        const saved=JSON.parse(localStorage.getItem(`chordjai.demo.care.v1.${pet.id}`)||'null') as {schema?:number;entries?:unknown}|null;
        setEntries(saved?.schema===1?previewEntries(saved.entries,pet.id):[]);
      }catch{setFailed(true);}
      setLoading(false);
    }else{
      api<CareEntry[]>(`/health/care/entries?petId=${encodeURIComponent(pet.id)}&limit=3`,{signal:controller.signal})
        .then(value=>{if(epoch.current===current&&!controller.signal.aborted)setEntries(previewEntries(value,pet.id));})
        .catch(()=>{if(epoch.current===current&&!controller.signal.aborted)setFailed(true);})
        .finally(()=>{if(epoch.current===current&&!controller.signal.aborted)setLoading(false);});
    }
    return()=>{epoch.current++;controller.abort();};
  },[pet.id,demo,attempt]);

  const visible=entries.filter(entry=>entry.petId===pet.id);
  if(loading||(!failed&&!visible.length))return null;
  if(failed)return <section className="panel" aria-labelledby={headingId}><div className="section-title"><h2 id={headingId}>{t('เรื่องล่าสุดของน้อง','Recent care updates')}</h2></div><p className="small-copy muted" role="status">{t('ยังเปิดบันทึกล่าสุดไม่สำเร็จ','Recent updates could not be loaded.')}</p><button type="button" className="text-button" onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>{t('ลองอีกครั้ง','Try again')}</button></section>;
  return <section className="panel" aria-labelledby={headingId}>
    <div className="section-title"><h2 id={headingId}>{t('เรื่องล่าสุดของน้อง','Recent care updates')}</h2><button type="button" className="text-button" aria-label={t(`เปิดไดอารี่ดูแลของ${pet.name}`,`Open ${pet.name}'s care diary`)} onClick={onOpen}>{t('เปิดไดอารี่','Open diary')}<ArrowRight size={16} aria-hidden="true"/></button></div>
    {visible.map(entry=>{
      const narrative=entry.narrative.replace(/\s+/g,' ').trim(),excerpt=Array.from(narrative).slice(0,160).join('');
      return <article className="health-record" key={entry.id}><span className="timeline-icon" aria-hidden="true"><NotebookPen size={20}/></span><div><h3>{entry.title}</h3><p className="muted"><time dateTime={entry.observedAt}>{dateForLocale(entry.observedAt,locale)}</time></p>{excerpt?<p>{excerpt}{Array.from(narrative).length>160?'…':''}</p>:null}</div></article>;
    })}
  </section>;
}
