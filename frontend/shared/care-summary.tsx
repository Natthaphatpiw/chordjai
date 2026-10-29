'use client';

import { CalendarDays, FileHeart, Printer, Stethoscope } from 'lucide-react';
import { useLocale } from './locale';
import { dateForLocale } from './api';
import './care-summary.css';

export type ClinicalCareEntry={
  id:string;kind:string;title:string;observedAt:string;clinicalNote?:string;provenance:'owner_reported';updatedAt?:string;
  observations?:{symptoms?:string[];severity?:string;appetite?:string;energy?:string;trend?:string;water?:string;toilet?:string;onsetAt?:string|null;frequency?:string};
  visit?:{clinicName?:string;reason?:string;vetReportedFindings?:string;treatment?:string;nextFollowupAt?:string|null}|null;
  episode?:{id:string;title:string;status:string;startedAt?:string;resolvedAt?:string|null}|null;
  costs?:{label:string;amountMinor:number;currency:'THB'|'USD';kind:'paid'|'estimate';expenseDate?:string|null}[];
  passportSource?:{kind:string;clinicName?:string;confirmedAt?:string;clinicianAuthoredAt?:string}|null;
};

/** The server supplies a clinical projection. Raw diary text is never rendered here. */
export function CareSummary({entries,showPrint=false}:{entries:ClinicalCareEntry[];showPrint?:boolean}){
  const {locale,t}=useLocale();
  const eventDate=(value:string)=>new Date(value).toLocaleString(locale==='en'?'en-GB':'th-TH',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'});
  const kinds:Record<string,string>={daily:t('ชีวิตประจำวัน','Daily update'),symptom:t('อาการที่สังเกต','Symptom observation'),visit:t('ไปพบหมอ','Vet visit'),followup:t('ติดตามอาการ','Follow-up')};
  const trends:Record<string,string>={new:t('เพิ่งสังเกต','New observation'),same:t('เหมือนเดิม','Unchanged'),better:t('ดีขึ้น','Improving'),worse:t('แย่ลง','Worsening')};
  const appetite:Record<string,string>={normal:t('กินตามปกติ','Eating as usual'),reduced:t('กินน้อยลง','Eating less'),none:t('ไม่กิน','Not eating')};
  const energy:Record<string,string>={normal:t('กิจกรรมตามปกติ','Activity as usual'),low:t('ซึม / กิจกรรมน้อย','Less active'),restless:t('กระสับกระส่าย','Restless')};
  const water:Record<string,string>={normal:t('ดื่มตามปกติ','Drinking as usual'),less:t('ดื่มน้อยลง','Drinking less'),more:t('ดื่มมากขึ้น','Drinking more')};
  const severity:Record<string,string>={mild:t('รบกวนเล็กน้อย','Mild impact'),moderate:t('รบกวนปานกลาง','Moderate impact'),severe:t('รบกวนมาก','Severe impact')};
  const statuses:Record<string,string>={ongoing:t('ยังติดตามอยู่','Ongoing'),improving:t('กำลังดีขึ้น','Improving'),resolved:t('จบการติดตามแล้ว','Resolved')};
  return <section className="clinical-care-summary" aria-label={t('ไดอารี่ที่เลือกให้คุณหมออ่าน','Selected care diary for the vet')}>
    <div className="clinical-care-heading"><div><span className="clinical-care-eyebrow">{t('จากการดูแลที่บ้านสู่การพบหมอ','From home observations to the vet')}</span><h2><FileHeart size={22}/>{t('เรื่องดูแลที่เจ้าของเลือกแชร์','Care updates selected by the owner')}</h2></div>{showPrint?<button type="button" className="clinical-care-print" onClick={event=>{event.currentTarget.closest('section')?.querySelectorAll('details').forEach(detail=>{detail.open=true;});window.print();}}><Printer size={17}/>{t('พิมพ์สรุป','Print brief')}</button>:null}</div>
    <p className="clinical-care-disclosure">{t('ข้อมูลที่เจ้าของรายงาน รวมถึงสิ่งที่เล่าว่าคุณหมอบอก ยังไม่ได้รับการรับรองจากคลินิก ข้อความระบายและเรื่องเล่าส่วนตัวไม่รวมในสรุปนี้','Owner-reported information, including what the owner recalls the vet said. These entries have not been verified by a clinic. Private feelings and full personal stories are excluded.')}</p>
    {!entries.length?<p className="clinical-care-empty">{t('ยังไม่มีบันทึกไดอารี่ที่เลือกอนุญาตให้แชร์','No care diary entries have been selected for sharing.')}</p>:<ol className="clinical-care-list">{entries.map(entry=>{
      const o=entry.observations;
      const facts=[o?.trend?trends[o.trend]:null,o?.severity?severity[o.severity]:null,o?.appetite?appetite[o.appetite]:null,o?.energy?energy[o.energy]:null,o?.water?water[o.water]:null,o?.toilet==='normal'?t('ขับถ่ายตามปกติ','Toilet habits as usual'):o?.toilet==='changed'?t('ขับถ่ายเปลี่ยนไป','Toilet habits changed'):null].filter(Boolean);
      return <li key={entry.id} className="clinical-care-event"><div className="clinical-care-event-date"><CalendarDays size={17}/><time dateTime={entry.observedAt}>{eventDate(entry.observedAt)}</time><span>{kinds[entry.kind]||t('บันทึกดูแล','Care entry')}</span></div><h3>{entry.title}</h3>{entry.episode?<p className="clinical-care-episode">{entry.episode.title} · {statuses[entry.episode.status]||entry.episode.status}</p>:null}
        {o?.symptoms?.length?<p className="clinical-care-tags">{o.symptoms.join(' · ')}</p>:null}{facts.length?<ul className="clinical-care-facts">{facts.map(fact=><li key={fact}>{fact}</li>)}</ul>:null}
        {o?.onsetAt?<p>{t('เริ่มสังเกต','First noticed')} {eventDate(o.onsetAt)}</p>:null}{o?.frequency?<p>{t('ความถี่ที่สังเกต','Observed frequency')}: {o.frequency}</p>:null}
        {entry.clinicalNote?<p className="clinical-care-note">{entry.clinicalNote}</p>:null}
        {entry.passportSource?<p className="clinical-care-source">{entry.passportSource.kind==='owner_confirmed_clinic_note'?t('เจ้าของตรวจและบันทึกผลโดยอ้างอิงบันทึกคลินิก','Owner-reviewed update linked to a clinic note'):t('เจ้าของบันทึกหลังพบหมอจาก Pet Passport','Owner-recorded post-visit update from Pet Passport')}{entry.passportSource.clinicName?` · ${entry.passportSource.clinicName}`:''}{entry.passportSource.confirmedAt?` · ${dateForLocale(entry.passportSource.confirmedAt,locale)}`:''}</p>:null}
        {entry.visit?<div className="clinical-care-visit"><h4><Stethoscope size={17}/>{t('การพบหมอที่เจ้าของบันทึก','Owner-reported vet visit')}</h4>{entry.visit.clinicName?<p>{entry.visit.clinicName}</p>:null}{entry.visit.reason?<p><b>{t('เหตุผลที่ไป','Reason for visit')}:</b> {entry.visit.reason}</p>:null}{entry.visit.vetReportedFindings?<p><b>{t('เจ้าของเล่าว่าคุณหมอบอก','What the owner reports the vet said')}:</b> {entry.visit.vetReportedFindings}</p>:null}{entry.visit.treatment?<p><b>{t('การรักษา / คำแนะนำที่ได้รับ','Treatment / instructions received')}:</b> {entry.visit.treatment}</p>:null}{entry.visit.nextFollowupAt?<p><b>{t('ติดตามครั้งถัดไป','Next follow-up')}:</b> {eventDate(entry.visit.nextFollowupAt)}</p>:null}</div>:null}
        {entry.costs?.length?<details className="clinical-care-costs"><summary>{t('ค่าใช้จ่ายที่เจ้าของอนุญาตแยกไว้','Costs separately selected by the owner')}</summary><ul>{entry.costs.map((cost,index)=><li key={index}><span>{cost.label} · {cost.kind==='estimate'?t('ประมาณการ','Estimate'):t('จ่ายแล้ว','Paid')}{cost.expenseDate?<small>{t('วันที่รายการ','Expense date')}: <time dateTime={cost.expenseDate}>{dateForLocale(cost.expenseDate,locale)}</time></small>:null}</span><b>{new Intl.NumberFormat(locale==='th'?'th-TH':'en-US',{style:'currency',currency:cost.currency}).format(cost.amountMinor/100)}</b></li>)}</ul></details>:null}
        <small className="clinical-care-source">{t('แหล่งข้อมูล: เจ้าของรายงาน','Source: owner reported')}{entry.updatedAt?` · ${t('แก้ไขล่าสุด','Last amended')} ${dateForLocale(entry.updatedAt,locale)}`:''}</small>
      </li>;
    })}</ol>}
    <p className="clinical-care-disclosure">{t('การบันทึกและแชร์ไม่ได้แจ้งคลินิกทันที หากต้องการให้คุณหมอตอบหรือน้องมีอาการฉุกเฉิน ให้ติดต่อคลินิกโดยตรง','Recording and sharing do not immediately notify the clinic. Contact your clinic directly if you need a response or urgent care.')}</p>
  </section>;
}
