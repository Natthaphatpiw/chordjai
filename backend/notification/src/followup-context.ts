import {createHash} from 'node:crypto';
import {withUser} from '@chordjai/db';
import {FOLLOWUP_CONSENT_VERSION,type FollowupPreferencesInput,type FollowupDecision} from '@chordjai/contracts';
import {HttpError} from '@chordjai/service-kit';
export type Sources=FollowupPreferencesInput['sources'];
export type FollowupPrefs={user_id:string;enabled:boolean;cadence_days:5|7;language:'th'|'en';paused_until:Date|null;sources:Sources;consent_version:string|null;version:number;last_accepted_at:Date|null;last_evaluated_at:Date|null};
export type FollowupSource={id:string;petId:string|null;source:'care'|'booklet'|'journal'|'assistantMemory';kind:string;date:string;updatedAt:string;title:string;text:string;episodeId?:string|null;episodeStatus?:string|null;nextDueAt?:string|null};
export type FollowupContext={today:string;pets:{id:string;name:string;species:string}[];sources:FollowupSource[];replies?:{sourceId:string;petId:string;date:string;content:string;correlation:'most_recent_followup_not_verified'}[];recentOutreach?:{sourceId:string;sourceUpdatedAt:string|null;date:string;opened:boolean;replyCount:number}[]};
export function bangkokDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function deliveryWindow(now=new Date()){const hour=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',hour:'numeric',hourCycle:'h23'}).format(now));return hour>=9&&hour<20;}
const clip=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const iso=(value:unknown)=>value instanceof Date?value.toISOString():typeof value==='string'?value:'';
export const contextHash=(context:FollowupContext)=>createHash('sha256').update(JSON.stringify(context)).digest('hex');
export function sourceSupportsTopic(source:FollowupSource,topic:FollowupDecision['topic']){
  const text=`${source.title} ${source.text}`;
  const evidence:Record<Exclude<FollowupDecision['topic'],'general'>,RegExp>={ear:/หู|\bears?\b|\bmites?\b/i,appetite:/กิน|อาหาร|เบื่ออาหาร|\bappetite\b|\beating\b|\bfood\b/i,weight:/น้ำหนัก|อ้วน|ผอม|กิโล|\bweight\b|\bkg\b/i,skin:/ผิว|ขน|ผื่น|คัน|\bskin\b|\bfur\b|\brash\b|\bitch/i,activity:/เดิน|วิ่ง|เล่น|ซึม|นอน|\bwalk|\bplay|\benergy\b|\bactivity\b|\bsleep/i};
  return topic==='general'||evidence[topic].test(text);
}
export function preferencesEnabled(prefs:FollowupPrefs|undefined,now=new Date()){
  return Boolean(prefs?.enabled&&prefs.consent_version===FOLLOWUP_CONSENT_VERSION&&Object.values(prefs.sources).some(Boolean)&&(!prefs.paused_until||prefs.paused_until<=now));
}
/** Uses normal user RLS in addition to explicit pet membership and source authorship. */
export async function loadFollowupContext(userId:string,now=new Date()):Promise<{prefs:FollowupPrefs;context:FollowupContext}> {
  return withUser(userId,async tx=>{
    const prefs=(await tx.query<FollowupPrefs>('select * from notify.followup_preferences where user_id=$1',[userId])).rows[0];
    if(!preferencesEnabled(prefs,now))throw new HttpError(403,'FOLLOWUP_CONSENT_REQUIRED','เปิดและยินยอมให้ติดตามน้องก่อน');
    const service=(await tx.query("select granted from identity.consents where user_id=$1 and purpose='service'",[userId])).rows[0];
    if(!service?.granted)throw new HttpError(403,'SERVICE_CONSENT_REQUIRED','กรุณายินยอมใช้บริการก่อน');
    const pets=(await tx.query<{id:string;name:string;species:string}>('select id,name,species from pet.pets where public.is_pet_member(id) order by updated_at desc,id limit 8')).rows;
    const ids=pets.map(p=>p.id),sources:FollowupSource[]=[];
    if(ids.length&&prefs.sources.care){
      const rows=(await tx.query(`select e.id,e.pet_id,e.kind,e.title,e.observed_at,e.updated_at,e.narrative,e.clinical_note,e.visit,e.episode_id,ep.status episode_status
        from health.care_entries e left join health.care_episodes ep on ep.id=e.episode_id
        where e.pet_id=any($1::uuid[]) and e.created_by=$2 and e.observed_at<=$3 and e.observed_at>=$3::timestamptz-interval '60 days'
        order by e.observed_at desc,e.id desc limit 10`,[ids,userId,now])).rows;
      for(const row of rows){
        // No reflection, cost, media URL or other author's narrative enters AI.
        const visit=row.visit&&typeof row.visit==='object'?row.visit:null;
        const details=visit?['reason','vetReportedFindings','treatment','nextFollowupAt'].map(k=>clip(visit[k],220)).filter(Boolean).join('; '):'';
        sources.push({id:row.id,petId:row.pet_id,source:'care',kind:row.kind,date:iso(row.observed_at),updatedAt:iso(row.updated_at),title:clip(row.title,160),text:[clip(row.narrative,500),clip(row.clinical_note,350),details].filter(Boolean).join(' ').slice(0,1200),episodeId:row.episode_id??null,episodeStatus:row.episode_status??null});
      }
    }
    if(ids.length&&prefs.sources.booklet){
      const rows=(await tx.query(`select id,pet_id,kind,title,recorded_at,next_due_at,updated_at,case when kind='weight' then value end weight_kg from health.records
        where pet_id=any($1::uuid[]) and recorded_at<=$2 and (recorded_at>=$2::timestamptz-interval '60 days' or next_due_at between $2 and $2::timestamptz+interval '7 days') order by recorded_at desc,id desc limit 8`,[ids,now])).rows;
      for(const r of rows)sources.push({id:r.id,petId:r.pet_id,source:'booklet',kind:r.kind,date:iso(r.recorded_at),updatedAt:iso(r.updated_at),title:clip(r.title,180),text:r.weight_kg?`Owner-recorded weight: ${r.weight_kg} kg`:'',nextDueAt:r.next_due_at?iso(r.next_due_at):null});
    }
    if(ids.length&&prefs.sources.journal){
      const rows=(await tx.query(`select id,pet_id,title,elements,story_date::text,created_at,updated_at from journal.pages
        where pet_id=any($1::uuid[]) and owner_id=$2 and coalesce(story_date,(created_at at time zone 'Asia/Bangkok')::date)<=($3::date) and coalesce(story_date,(created_at at time zone 'Asia/Bangkok')::date)>=($3::date)-60
        order by coalesce(story_date,(created_at at time zone 'Asia/Bangkok')::date) desc,id desc limit 6`,[ids,userId,bangkokDay(now)])).rows;
      for(const r of rows){
        const elements:Record<string,unknown>[]=Array.isArray(r.elements)?r.elements:[];
        const text=elements.filter(e=>e&&typeof e==='object'&&e.type==='text').slice(0,12).map(e=>clip(e.content,150)).join(' ').slice(0,900);
        if(text)sources.push({id:r.id,petId:r.pet_id,source:'journal',kind:'memory',date:r.story_date?`${r.story_date}T00:00:00+07:00`:iso(r.created_at),updatedAt:iso(r.updated_at),title:clip(r.title,160),text});
      }
    }
    if(prefs.sources.assistantMemory){
      const memoryConsent=(await tx.query("select p.memory_enabled from assistant.preferences p join identity.consents c on c.user_id=p.user_id and c.purpose='ai_memory' and c.granted where p.user_id=$1",[userId])).rows[0];
      if(memoryConsent?.memory_enabled){
        const rows=(await tx.query(`select id,pet_id,kind,content,created_at,updated_at from assistant.memories where user_id=$1 and enabled and (pet_id is null or pet_id=any($2::uuid[])) order by updated_at desc,id limit 6`,[userId,ids])).rows;
        for(const r of rows)sources.push({id:r.id,petId:r.pet_id,source:'assistantMemory',kind:r.kind,date:iso(r.created_at),updatedAt:iso(r.updated_at),title:'User-approved memory',text:clip(r.content,400)});
      }
    }
    const replies=(await tx.query(`select r.pet_id,r.content,r.created_at,d.source_refs from notify.followup_replies r join notify.followup_deliveries d on d.id=r.delivery_id
      where r.user_id=$1 and r.pet_id=any($2::uuid[]) and r.created_at>=$3::timestamptz-interval '14 days' and r.created_at<=$3 order by r.created_at desc limit 4`,[userId,ids,now])).rows.flatMap(r=>{
      const reference=Array.isArray(r.source_refs)?r.source_refs[0]:null;
      if(!reference||!prefs!.sources[reference.source as keyof Sources]||!sources.some(s=>s.id===reference.id&&s.petId===r.pet_id))return [];
      return [{sourceId:reference.id,petId:r.pet_id,date:iso(r.created_at),content:clip(r.content,300),correlation:'most_recent_followup_not_verified' as const}];
    });
    const recentOutreach=(await tx.query(`select d.source_refs,d.accepted_at,d.opened_at,(select count(*)::int from notify.followup_replies r where r.delivery_id=d.id and r.user_id=$1) reply_count
      from notify.followup_deliveries d where d.user_id=$1 and d.status='accepted' and d.accepted_at between $2::timestamptz-interval '90 days' and $2 order by d.accepted_at desc limit 20`,[userId,now])).rows.flatMap(row=>{
      const ref=Array.isArray(row.source_refs)?row.source_refs[0]:null;
      if(!ref||!sources.some(source=>source.id===ref.id))return [];
      return [{sourceId:ref.id,sourceUpdatedAt:typeof ref.updatedAt==='string'?ref.updatedAt:null,date:iso(row.accepted_at),opened:Boolean(row.opened_at),replyCount:Number(row.reply_count)}];
    });
    return {prefs:prefs!,context:{today:bangkokDay(now),pets:pets.map(p=>({...p,name:clip(p.name,80)})),sources,replies,recentOutreach}};
  });
}
export function validateDecision(decision:FollowupDecision,context:FollowupContext){
  if(!decision.shouldSend){if(decision.intent!=='skip'||decision.sourceId!==null||decision.petId!==null)throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','AI ยังเลือกข้อความที่เหมาะสมไม่ได้');return null;}
  const source=context.sources.find(s=>s.id===decision.sourceId),pet=context.pets.find(p=>p.id===decision.petId);
  if(!source||!pet||source.petId!==pet.id||source.episodeStatus==='resolved'||decision.intent==='skip'||decision.reason==='no_useful_context')throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','AI ยังเลือกข้อความที่เหมาะสมไม่ได้');
  const topic=decision.topic??'general';
  const allowed=decision.intent==='memory_checkin'?source.source==='journal':decision.intent==='vet_followup'?source.source==='care'&&source.kind==='visit':decision.intent==='care_reminder'?source.source==='booklet'&&Boolean(source.nextDueAt):source.source==='care'||source.source==='booklet'||source.source==='journal'&&topic!=='general';
  if(!allowed)throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','AI ยังเลือกข้อความที่เหมาะสมไม่ได้');
  if(!sourceSupportsTopic(source,topic))throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','หัวข้อที่ AI เลือกยังไม่มีข้อมูลรองรับ');
  const eventTime=Date.parse(source.date),today=Date.parse(`${context.today}T23:59:59+07:00`),age=(today-eventTime)/86_400_000;
  if(!Number.isFinite(eventTime)||eventTime>today||(age>60&&decision.intent!=='care_reminder')||((source.source==='journal'||source.kind==='daily')&&age>21))throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','AI ยังเลือกข้อความที่เหมาะสมไม่ได้');
  if(decision.intent==='care_reminder'&&(!source.nextDueAt||Date.parse(source.nextDueAt)<today-86_400_000||Date.parse(source.nextDueAt)>today+7*86_400_000))throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','AI ยังเลือกข้อความที่เหมาะสมไม่ได้');
  if(source.episodeId&&context.sources.some(s=>s.source==='care'&&s.episodeId===source.episodeId&&Date.parse(s.date)>eventTime))throw new HttpError(502,'FOLLOWUP_INVALID_OUTPUT','AI เลือกข้อมูลเก่ากว่าการอัปเดตล่าสุด');
  const unchangedContacts=(context.recentOutreach??[]).filter(contact=>contact.sourceId===source.id&&contact.sourceUpdatedAt===source.updatedAt);
  const latestContact=unchangedContacts.reduce((latest,contact)=>Math.max(latest,Date.parse(contact.date)),0);
  const newReply=(context.replies??[]).some(reply=>reply.sourceId===source.id&&Date.parse(reply.date)>latestContact);
  if(unchangedContacts.length>=2&&!newReply)throw new HttpError(502,'FOLLOWUP_REPEATED_SOURCE','พักเรื่องเดิมที่ยังไม่มีอัปเดต');
  return {source,pet};
}
/** Model chooses grounded intent; facts and questions are composed, never free-form medical claims. */
export function composeFollowup(decision:FollowupDecision,context:FollowupContext,language:'th'|'en'){
  const selection=validateDecision(decision,context);if(!selection)return null;
  const {pet,source}=selection,date=new Intl.DateTimeFormat(language==='en'?'en-GB':'th-TH-u-ca-gregory',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'}).format(new Date(source.date));
  // Pet names are owner text, never executable instructions or URLs.
  const name=pet.name.replace(/https?:\/\/\S+/gi,'').replace(/[\r\n]/g,' ').slice(0,60)|| (language==='en'?'your pet':'น้อง');
  const greeting=language==='en'?(decision.greeting==='playful'?`Thinking of ${name} today.`:decision.greeting==='concise'?`A little check-in for ${name}.`:`Hello, how is ${name} doing?`):(decision.greeting==='playful'?`วันนี้นึกถึง${name}ขึ้นมาเลย`:decision.greeting==='concise'?`แวะมาถามถึง${name}สักนิด`:`สวัสดีครับ ช่วงนี้${name}เป็นอย่างไรบ้าง`);
  const topic=decision.topic??'general';
  const topicQuestions={ear:{th:'ช่วงนี้เรื่องหูของน้องเป็นอย่างไรบ้าง มีเกาหูหรือสะบัดหัวให้สังเกตบ้างไหมครับ',en:'How are things with your pet’s ears? Have you noticed any scratching or head shaking?'},appetite:{th:'ช่วงนี้น้องกินอาหารได้ตามปกติไหมครับ มีอะไรเปลี่ยนไปบ้าง',en:'How has your pet’s appetite been? Have you noticed any changes?'},weight:{th:'ช่วงนี้น้ำหนักและการกินของน้องเป็นอย่างไรบ้างครับ',en:'How have your pet’s weight and eating been lately?'},skin:{th:'ช่วงนี้ผิวหนังและขนของน้องมีอะไรเปลี่ยนไปให้สังเกตไหมครับ',en:'Have you noticed any changes with your pet’s skin or coat?'},activity:{th:'ช่วงนี้น้องเดินเล่นและทำกิจวัตรเป็นอย่างไรบ้างครับ',en:'How has your pet been doing with walks and everyday activities?'}};
  const topical=topic!=='general'&&decision.intent==='care_checkin'||topic!=='general'&&decision.intent==='vet_followup';
  const question=topical?(language==='en'?`Since your update on ${date}, ${topicQuestions[topic as Exclude<typeof topic,'general'>].en}`:`หลังอัปเดตวันที่ ${date} ${topicQuestions[topic as Exclude<typeof topic,'general'>].th}`):language==='en'?(decision.intent==='vet_followup'?`You recorded a vet visit on ${date}. How have things been since then?`:decision.intent==='memory_checkin'?`You saved a memory on ${date}. Any little moments together you'd like to remember this week?`:decision.intent==='care_reminder'?`There is an upcoming care date in your booklet. Would you like to review it and add an update?`:`You saved a care update on ${date}. Has anything changed since then?`):(decision.intent==='vet_followup'?`คุณจดเรื่องไปพบคุณหมอไว้วันที่ ${date} หลังจากนั้นน้องเป็นอย่างไรบ้างครับ`:decision.intent==='memory_checkin'?`คุณเก็บความทรงจำไว้วันที่ ${date} ช่วงนี้มีโมเมนต์เล็ก ๆ ของเรากับน้องที่อยากจดไว้อีกไหมครับ`:decision.intent==='care_reminder'?`ในสมุดมีวันดูแลน้องที่ใกล้ถึง ลองเปิดทบทวนและจดอัปเดตกันไหมครับ`:`คุณจดอัปเดตการดูแลไว้วันที่ ${date} ตอนนี้มีอะไรเปลี่ยนไปบ้างไหมครับ`);
  return `${greeting}\n${question}`;
}
