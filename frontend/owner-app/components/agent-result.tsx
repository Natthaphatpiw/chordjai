'use client';
import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,Clock3,MessageCircle,RefreshCw,ArrowRight,ShieldCheck} from 'lucide-react';
import {api,messageOf,dateForLocale} from '../../shared/api';
import {useLocale} from '../../shared/locale';
import {localizedHref} from '../../shared/locale-core';
import {Modal,Busy,ErrorBox} from './ui';
import {agentDestinationPath,agentTaskDestination,type AgentTaskView,type AgentDestinationTab} from './agent-result-model';
import './agent-result.css';

const activeStatuses=new Set(['queued','planning','working','running','executing','ready','pending']);
export default function AgentResult({id,onClose,onContext,onOpen}:{id:string;onClose:()=>void;onContext:(context:{petId:string|null;tab:AgentDestinationTab|null})=>void;onOpen:(path:string)=>void}){
 const {locale,t}=useLocale();const [task,setTask]=useState<AgentTaskView|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 const contextCallback=useRef(onContext);contextCallback.current=onContext;
 const applied=useRef('');
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;const until=Date.now()+6*60_000;
  setLoading(true);setError('');setTask(null);
  async function load(){
   try{
    const next=await api<AgentTaskView>(`/assistant/agent/tasks/${encodeURIComponent(id)}`,{signal:controller.signal});
    if(controller.signal.aborted)return;
    if(next.id!==id)throw new Error('Task response did not match the requested item');
    setTask(next);setError('');
    const destination=agentTaskDestination(next),contextKey=`${id}:${destination.petId??''}:${destination.tab??''}`;
    if(applied.current!==contextKey&&(destination.petId||destination.tab)){contextCallback.current(destination);applied.current=contextKey;}
    if(activeStatuses.has(next.status)&&Date.now()<until)timer=setTimeout(()=>void load(),5000);
   }catch(caught){if(!controller.signal.aborted)setError(messageOf(caught,locale));}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();return()=>{controller.abort();if(timer)clearTimeout(timer);};
 },[id,reload,locale]);
 const done=task&&['completed','succeeded','done'].includes(task.status),working=task&&activeStatuses.has(task.status);
 const awaiting=task&&['collecting','awaiting_input','waiting_input','clarifying','awaiting_clarification','awaiting_confirmation','waiting_confirmation'].includes(task.status);
 const failed=task&&['failed','cancelled','expired'].includes(task.status);
 const question=typeof task?.question==='string'?task.question:task?.question&&typeof task.question==='object'&&'text'in task.question&&typeof task.question.text==='string'?task.question.text:null;
 const results=task?.results??task?.result?.results??[];
 const destination=task?agentTaskDestination(task):null;
 return <Modal title={t('งานจากผู้ช่วยใน LINE','Your LINE assistant task')} onClose={onClose} className="agent-result-modal">
  {loading&&!task?<Busy label={t('กำลังอ่านสถานะงาน','Loading task status')}/>:null}
  {error?<ErrorBox message={error}/>:null}
  {task?<>
   <div className={`agent-result-status ${done?'complete':''}`} role="status">{done?<CheckCircle2 size={24}/>:awaiting?<MessageCircle size={24}/>:<Clock3 size={24}/>}<div><strong>{done?t('ทำงานเรียบร้อยแล้ว','Task completed'):working?t('ผู้ช่วยกำลังทำงานให้คุณ','Your assistant is working'):awaiting?t('รอคำตอบของคุณใน LINE','Waiting for your reply in LINE'):failed?t('งานนี้ยังไม่สำเร็จหรือสิ้นสุดแล้ว','This task did not complete or has ended'):t('สถานะงาน','Task status')}</strong>{task.title?<p>{task.title}</p>:null}</div></div>
   {task.result?.message?<p className="agent-result-message">{task.result.message}</p>:null}
   {question&&awaiting?<div className="notice"><p>{question}</p><p>{t('กลับไปตอบการ์ดหรือพิมพ์คำตอบในแชท LINE ได้เลย','Return to LINE to tap a card option or type your answer.')}</p></div>:null}
   {results.length?<ol className="agent-result-items">{results.slice(0,10).map((result,index)=>{
    const path=agentDestinationPath(result.path);return <li key={`${result.tool??'result'}:${index}`}><div><strong>{result.name||result.summary||t(`รายการที่ ${index+1}`,`Item ${index+1}`)}</strong>{result.summary&&result.name?<p>{result.summary}</p>:null}</div>{path?<button type="button" className="text-button" onClick={()=>onOpen(localizedHref(path,locale))}>{t('ดูรายการ','View item')}<ArrowRight size={16}/></button>:null}</li>;
   })}</ol>:null}
   {task.updatedAt?<p className="small-copy">{t('อัปเดตล่าสุด','Last updated')} {dateForLocale(task.updatedAt,locale)}</p>:null}
   <p className="agent-result-privacy"><ShieldCheck size={16}/>{t('รายละเอียดนี้แสดงได้เฉพาะบัญชีที่มีสิทธิ์ งานจากแชทไม่เปิดแชร์ข้อมูลให้ผู้อื่นโดยอัตโนมัติ','This task is visible only to the authorised account. A chat task does not automatically share your information with others.')}</p>
   <div className="form-actions">{destination?.path&&done?<button type="button" className="button" onClick={()=>onOpen(localizedHref(destination.path!,locale))}>{t('เปิดหน้าที่บันทึกไว้','Open the saved work')}<ArrowRight size={17}/></button>:null}<button type="button" className="button secondary" disabled={loading} onClick={()=>setReload(value=>value+1)}><RefreshCw size={16}/>{t('ตรวจสถานะอีกครั้ง','Refresh status')}</button></div>
  </>:null}
  {!task&&!loading?<button type="button" className="button secondary" onClick={()=>setReload(value=>value+1)}>{t('ลองอ่านสถานะใหม่','Try loading again')}</button>:null}
 </Modal>;
}
