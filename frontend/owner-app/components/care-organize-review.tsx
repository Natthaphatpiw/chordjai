'use client';
import {useRef,useState} from 'react';
import {Sparkles} from 'lucide-react';
import {useLocale} from '../../shared/locale';
import {api,json,messageOf} from '../../shared/api';
import type {CareEntry,CareKind} from '../lib/care-types';
import {draftFromEntry,type CareEntryDraft} from './care-diary-model';
import {Modal,ErrorBox} from './ui';
type Proposal={entryId:string;version:number;kind:CareKind|null;kindEvidence:string|null;symptoms:string[];clinicName:string|null;reason:string|null;treatment:string|null;costs:{quote:string;amount:string;currency:'THB'|'USD'|null}[]};
export default function CareOrganizeReview({entry,demo,onClose,onReview}:{entry:CareEntry;demo:boolean;onClose:()=>void;onReview:(draft:CareEntryDraft)=>void}){
 const{locale,t}=useLocale(),[proposal,setProposal]=useState<Proposal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[payments,setPayments]=useState<Record<number,'paid'|'estimate'|''>>({});
 const request=useRef(crypto.randomUUID()),generation=useRef(0);
 function close(){generation.current++;onClose();}
 async function generate(){
  if(busy)return;
  if(demo){setError(t('ตัวอย่างนี้ไม่เรียก AI คุณยังแก้ไขรายละเอียดบันทึกเองได้','The demo does not call AI. You can still edit the record yourself.'));return;}
  const current=++generation.current;setBusy(true);setError('');
  try{const result=await api<Proposal>(`/health/care/entries/${entry.id}/organize`,{...json('POST',{version:entry.version}),headers:{'Idempotency-Key':request.current}});if(generation.current===current)setProposal(result);}
  catch(cause){if(generation.current===current)setError(messageOf(cause,locale));}finally{if(generation.current===current)setBusy(false);}
 }
 function review(){
  if(!proposal)return;
  const draft=draftFromEntry(entry);
  // Existing facts, photos, private text and sharing settings are retained.
  // Human-reviewed suggestions only fill empty fields. Final PATCH still
  // requires the ordinary form's explicit save and original version check.
  if(entry.kind==='daily'&&proposal.kind)draft.kind=proposal.kind;
  draft.symptomsText=[...new Set([...entry.observations.symptoms,...proposal.symptoms])].join('\n');
  for(const field of ['clinicName','reason','treatment'] as const)if(!draft.visit[field]&&proposal[field])draft.visit[field]=proposal[field];
  for(const[costIndex,cost]of proposal.costs.entries()){
   const kind=payments[costIndex];if(!kind||!cost.currency)continue;
   const amount=Number(cost.amount.replaceAll(',',''));
   if(entry.costs.some(existing=>existing.amountMinor===Math.round(amount*100)&&existing.currency===cost.currency&&existing.kind===kind))continue;
   draft.costs.push({id:crypto.randomUUID(),label:t('ค่าใช้จ่ายจากบันทึก','Expense from update'),amount:amount.toFixed(2),currency:cost.currency,kind,expenseDate:''});
  }
  onReview(draft);
 }
 const names={daily:t('ชีวิตประจำวัน','Daily life'),symptom:t('อาการที่สังเกต','Symptoms'),visit:t('ไปหาคุณหมอ','Vet visit'),followup:t('ติดตามอาการ','Follow-up')};
 return <Modal title={t('ช่วยจัดข้อมูลจากเรื่องที่เล่า','Organise your update')} onClose={close} className="organize-review"><p>{t('บันทึกต้นฉบับเก็บไว้แล้ว ชิดใจจะช่วยแยกข้อมูลที่คุณเขียน แล้วให้คุณตรวจและแก้ไขก่อนบันทึกเพิ่ม','Your original update is saved. ChordJai can suggest details from your own words for you to review and edit.')}</p><details><summary>{t('อ่านข้อความต้นฉบับ','Read your original words')}</summary><blockquote>{entry.narrative}</blockquote></details>
 {!proposal?<><p className="small-copy">{t('ส่งเฉพาะเรื่องที่เล่าให้ AI ไม่ส่งข้อความในพื้นที่ระบายส่วนตัวหรือรูป การใช้ครั้งนี้ไม่ใช่ความยินยอมฝึกโมเดล','Only this update’s story is sent to AI. Private reflections and photos are excluded. This does not grant model-training consent.')}</p><button className="button full" disabled={busy} onClick={()=>void generate()}><Sparkles size={18}/>{busy?t('กำลังช่วยจัดข้อมูล…','Organising…'):t('ให้ชิดใจช่วยจัดข้อมูล','Suggest details')}</button></>:<><div className="organize-proposal"><h3>{t('ข้อมูลที่พบในข้อความ','Details found in your words')}</h3><ul>{proposal.kind?<li>{names[proposal.kind]}{proposal.kindEvidence?<q>{proposal.kindEvidence}</q>:null}</li>:null}{proposal.symptoms.map(value=><li key={value}>{t('อาการ','Symptom')}: <q>{value}</q></li>)}{(['clinicName','reason','treatment'] as const).map(key=>proposal[key]?<li key={key}>{{clinicName:t('คลินิก','Clinic'),reason:t('เหตุที่พบหมอ','Reason for visit'),treatment:t('การดูแลที่เจ้าของเล่า','Reported care')}[key]}: <q>{proposal[key]}</q></li>:null)}</ul>{!proposal.kind&&!proposal.symptoms.length&&!proposal.clinicName&&!proposal.reason&&!proposal.treatment&&!proposal.costs.length?<p>{t('ยังไม่มีรายละเอียดที่แยกได้แน่ชัด เก็บเป็นเรื่องเล่าต่อได้เลย','There are no clear details to separate. Your story is already safely saved.')}</p>:null}
 {proposal.costs.map((cost,index)=><label className="field" key={index}><q>{cost.quote}</q><select aria-label={t(`จัดประเภทค่าใช้จ่าย ${index+1}`,`Payment type ${index+1}`)} value={payments[index]??''} onChange={event=>setPayments(value=>({...value,[index]:event.target.value as 'paid'|'estimate'|''}))}><option value="">{t('ยังไม่เพิ่มค่าใช้จ่ายนี้','Do not add this expense')}</option><option value="paid">{t('ยืนยันว่าจ่ายแล้ว','Confirm paid')}</option><option value="estimate">{t('เป็นยอดประมาณการ','Estimate only')}</option></select></label>)}</div><p className="small-copy">{t('เลือกสถานะก่อนเพิ่มค่าใช้จ่าย วันที่ใส่เพิ่มได้เอง ไม่จำเป็นต้องระบุ ตรวจข้อมูลอีกครั้งในฟอร์มก่อนกดบันทึก','Choose payment status to include an expense. Its date is optional and entered by you. Review the form before saving.')}</p><button className="button full" onClick={review}>{t('ตรวจและแก้ไขก่อนบันทึก','Review and edit before saving')}</button></>}
 {error?<ErrorBox message={error}/>:null}
 </Modal>;
}
