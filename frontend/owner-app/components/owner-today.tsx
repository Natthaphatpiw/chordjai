'use client';
import {CalendarDays,ChevronRight,MessageCircle,NotebookPen,Check,BookHeart,ClipboardList,Sparkles} from 'lucide-react';
import {useLocale} from '../../shared/locale';
import {dateForLocale} from '../../shared/api';
import type {Pet,HealthRecord} from '../lib/types';
import type {CareEntry,CareMemoryDraft} from '../lib/care-types';
import HomeCarePreview from './home-care-preview';
export default function OwnerToday({pet,records,demo,onWrite,onRecords,onChat,onMemory,onPassport,onOrganize,lastSaved}:{pet:Pet;records:HealthRecord[];demo:boolean;onWrite:(episodeId?:string|null)=>void;onRecords:()=>void;onChat:()=>void;onMemory:(draft:CareMemoryDraft)=>void;onPassport:()=>void;onOrganize:(entry:CareEntry)=>void;lastSaved:CareEntry|null}){
 const{locale,t}=useLocale();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const next=records.filter(item=>item.nextDueAt&&item.nextDueAt.slice(0,10)>=today).sort((a,b)=>a.nextDueAt!.localeCompare(b.nextDueAt!))[0];
 const saved=lastSaved?.petId===pet.id?lastSaved:null;
 return <section className="owner-today"><div className="today-heading"><span className="eyebrow">{new Date().toLocaleDateString(locale==='th'?'th-TH':'en-GB',{day:'numeric',month:'long',timeZone:'Asia/Bangkok'})}</span><h1>{t(`วันนี้ของ${pet.name}`,`Today with ${pet.name}`)}</h1><p>{t('เล่าเรื่องน้องสั้น ๆ แล้วเก็บไว้กลับมาอ่านด้วยกัน','A little update today. A story to come back to.')}</p></div>
  {saved?<section className="today-saved" aria-live="polite"><span className="today-saved-label"><Check size={18}/>{t('เก็บเรื่องนี้ไว้แล้ว','Your update is saved')}</span><p>{saved.narrative}</p><div className="today-saved-actions"><button className="text-button" onClick={onRecords}>{t('เปิดบันทึก','View your update')}<ChevronRight size={16}/></button>{saved.canEdit?<button className="text-button" onClick={()=>onOrganize(saved)}><Sparkles size={17}/>{t('ช่วยจัดข้อมูลจากเรื่องนี้','Organise this update')}</button>:null}{saved.kind!=='daily'?<button className="text-button" onClick={onPassport}><ClipboardList size={17}/>{t('เตรียมเรื่องนี้ไปพบหมอ','Prepare for a vet visit')}</button>:null}{saved.photos[0]?<button className="text-button" onClick={()=>onMemory({title:saved.title,narrative:saved.narrative,photoUrl:saved.photos[0].url,storyDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(saved.observedAt))} as CareMemoryDraft)}><BookHeart size={17}/>{t('ทำเป็นหน้าความทรงจำ','Make a memory page')}</button>:null}</div></section>:null}
  <section className="today-invitation"><NotebookPen size={28} strokeWidth={1.5} aria-hidden="true"/><h2>{t('วันนี้น้องเป็นอย่างไรบ้าง?','How is your pet today?')}</h2><p>{t('เรื่องน่ารัก อาการที่สังเกต หรือวันที่ไปหาหมอ เล่าได้เหมือนคุยกับคนใกล้ตัว','A happy moment, something you noticed, or a vet visit. Tell it in your own words.')}</p><button className="button" onClick={()=>pet.canEdit===false?onRecords():onWrite()}><NotebookPen size={19}/>{pet.canEdit===false?t('เปิดบันทึกของน้อง','View your pet’s records'):t('บันทึกเรื่องของน้อง','Write an update')}</button><small>{t('แนบรูปได้ · ไม่ต้องกรอกข้อมูลครบทุกช่อง','Photos welcome · No long form to finish')}</small></section>
  <HomeCarePreview key={`${pet.id}:${demo}:${saved?.version??0}:${saved?.id??''}`} pet={pet} demo={demo} onOpen={onRecords} onUpdate={onWrite}/>
  {next?<button className="today-next-date" onClick={onRecords}><CalendarDays size={22}/><span><small>{t('วันสำคัญครั้งถัดไป','Your next date')}</small><b>{next.title}</b><span>{dateForLocale(next.nextDueAt,locale)}</span></span><ChevronRight size={18}/></button>:null}
  <div className="today-help"><span>{t('มีเรื่องอยากถามก่อนบันทึก?','Have a question first?')}</span><button className="text-button" onClick={onChat}><MessageCircle size={18}/>{t('ถามชิดใจ','Ask ChordJai')}</button></div>
 </section>;
}
