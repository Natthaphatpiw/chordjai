export type Level=0|1|2|3;
export type Signals={breathing?:boolean|null;collapse?:boolean|null;seizure?:boolean|null;toxin?:boolean|null;trauma?:boolean|null;cannotUrinate?:boolean|null;vomitBlood?:boolean|null;vomitCount24h?:number|null;notEatingHours?:number|null};
export const RULE_VERSION='pilot-safety-1';
const redFlags=[
  {id:'RESPIRATORY_DISTRESS',signal:'breathing',pattern:/หายใจไม่ออก|หายใจลำบาก|อ้าปากหายใจ|เหงือกม่วง|เหงือกสีฟ้า|difficulty breathing|struggling to breathe|blue gums/i,reason:'มีสัญญาณหายใจผิดปกติ'},
  {id:'COLLAPSE',signal:'collapse',pattern:/หมดสติ|ล้มแล้วลุกไม่ได้|ไม่รู้สึกตัว|unconscious|collapse/i,reason:'มีสัญญาณหมดสติหรือทรุดลง'},
  {id:'SEIZURE',signal:'seizure',pattern:/ชัก|seizure/i,reason:'มีสัญญาณชัก'},
  {id:'TOXIN_EXPOSURE',signal:'toxin',pattern:/(?:กิน|เลีย|โดน|สัมผัส).{0,20}(?:ลิลลี่|พาราเซตามอล|ยาเบื่อ|ยาฆ่าแมลง|ไซลิทอล|ยาคน)|poison|xylitol|ingested.{0,15}lily/i,reason:'มีความเสี่ยงสัมผัสสารพิษ'},
  {id:'SERIOUS_TRAUMA',signal:'trauma',pattern:/รถชน|ถูกรถ|เลือดออกมาก|เลือดไหลไม่หยุด|เลือดออกไม่หยุด|ตกจาก.{0,10}(?:สูง|ตึก|ชั้น|ระเบียง)|hit by (?:a )?car|fell from|severe bleeding/i,reason:'มีประวัติอุบัติเหตุรุนแรงหรือเลือดออกมาก'},
  {id:'URINARY_OBSTRUCTION',signal:'cannotUrinate',pattern:/ฉี่ไม่ออก|ปัสสาวะไม่ออก|เบ่งฉี่.{0,10}(?:ไม่ออก|ไม่มี)|cannot (?:pee|urinate)/i,reason:'มีสัญญาณปัสสาวะไม่ออก'},
  {id:'VOMIT_BLOOD',signal:'vomitBlood',pattern:/อาเจียน.{0,10}เลือด|อ้วก.{0,10}เลือด|vomit.{0,10}blood/i,reason:'มีสัญญาณอาเจียนเป็นเลือด'},
] as const;
export function mergeSafetySignal(primary:boolean|null|undefined,alias:boolean|undefined){if(primary===true||alias===true)return true;if(primary===null)return null;return primary??alias;}
export function evaluateRules(species:'cat'|'dog',symptoms:string,signals:Signals={}) {
  const original=symptoms.normalize('NFKC'),normalized=original.replace(/\s+/g,'');
  const hits:{id:string;reason:string}[]=redFlags.filter(rule=>signals[rule.signal]===true||rule.pattern.test(original)||rule.pattern.test(normalized)).map(rule=>({id:rule.id,reason:rule.reason}));
  if((signals.vomitCount24h??0)>=5)hits.push({id:'VOMIT_BLOOD',reason:'อาเจียนซ้ำหลายครั้ง'});
  if(hits.length)return {level:3 as Level,hits,missing:false};
  const missing=Object.values(signals).some(value=>value===null);
  if(missing)return {level:2 as Level,hits:[{id:'UNKNOWN_SAFETY_SIGNAL',reason:'ยังยืนยันสัญญาณอันตรายไม่ได้ ควรให้สัตวแพทย์ประเมิน'}],missing:true};
  if(species==='cat'&&(signals.notEatingHours??0)>=24)return {level:2 as Level,hits:[{id:'CAT_NOT_EATING',reason:'น้องแมวไม่กินอาหารต่อเนื่อง ควรพบสัตวแพทย์'}],missing:false};
  return {level:0 as Level,hits:[],missing:false};
}
export function finalizeTriage(ruleLevel:Level,llmLevel:Level|null,confidence:'low'|'medium'|'high'='low') {
  return {severity:Math.max(ruleLevel,llmLevel??1,confidence==='low'?1:0) as Level,degraded:llmLevel===null};
}
export function safeResult(level:Level,degraded:boolean,reasons:string[]) {
  const labels=['เฝ้าสังเกตและนัดตรวจเมื่ออาการเปลี่ยน','นัดพบสัตวแพทย์','พบสัตวแพทย์ภายใน 24 ชั่วโมง','ไปโรงพยาบาลสัตว์ทันที'];
  return {severity:level,title:labels[level],summary:reasons.join(' · ')||'ข้อมูลนี้ช่วยจัดลำดับความเร่งด่วน ควรให้สัตวแพทย์ประเมินอาการของน้อง',actions:level===3?['โทรแจ้งโรงพยาบาลสัตว์และเดินทางทันที','อย่าป้อนยาคนหรือทำให้อาเจียนเอง']:['สังเกตการหายใจ ความรู้สึกตัว การกิน และการขับถ่าย','หากหายใจลำบาก ชัก หมดสติ หรือปัสสาวะไม่ออก ให้ไปโรงพยาบาลทันที'],degraded,disclaimer:'การคัดกรองนี้ไม่ใช่การวินิจฉัยหรือทดแทนสัตวแพทย์'};
}
