import type {PassportQuestionId, PassportAnswer, PassportLanguage, PassportEmergency, PassportAnswerStatus} from './passport';

export type AnswerMap=Partial<Record<PassportQuestionId,Pick<PassportAnswer,'status'|'value'|'attempts'|'updatedAt'>>>;
const core:PassportQuestionId[]=['danger_signs','onset','frequency','trend','appetite','energy','water_toilet'];
const ending:PassportQuestionId[]=['medications','previous_care','other_conditions','exposure','owner_goal'];
export function relevantQuestions(reason:string,answers:AnswerMap):PassportQuestionId[]{
 const text=[reason,...Object.values(answers).filter(answer=>answer?.status==='answered').map(answer=>answer?.value??'')].join(' ').toLowerCase();
 const specific:PassportQuestionId[]=[];
 if(/หู|ไรหู|สะบัดหัว|\bear\b|ears|head.?shak/.test(text))specific.push('ear_side','ear_discharge','ear_touch');
 if(/อาเจียน|อ้วก|ท้องเสีย|ถ่ายเหลว|\bvomit|diarr|stool/.test(text))specific.push('vomiting','stool');
 if(/หายใจ|ไอ|จาม|cough|breath|sneez/.test(text))specific.push('breathing');
 if(/ผิว|ขนร่วง|คัน|แผล|skin|itch|rash|wound/.test(text))specific.push('skin');
 if(/เดิน|กะเผลก|ขา|ยืน|limp|walk|leg|stand/.test(text))specific.push('mobility');
 return [...core,...specific,...ending];
}
export function passportEmergency(reason:string,answers:AnswerMap,language:PassportLanguage):PassportEmergency{
 const codes:string[]=[];const danger=answers.danger_signs;
 // This structured response is about current signs. A negative answer is never
 // treated as a positive simply because it repeats the question's examples.
 if(danger?.status==='answered'&&!/^(?:ไม่มี|ไม่พบ|ไม่มีอาการ|none|no(?:ne)?\b)/iu.test(danger.value)&&/มีอาการเหล่านี้|one or more|\byes\b|หายใจลำบาก|หมดสติ|ชัก|เลือด|ฉี่ไม่ออก|สารพิษ|ยาพิษ|บาดเจ็บรุนแรง|breath|unconscious|seizure|bleed|urina|poison|trauma/iu.test(danger.value))codes.push('reported_urgent_sign');
 const texts=[reason,...Object.values(answers).map(answer=>answer?.value??'')];
 const markers:[string,RegExp][]=[['breathing_distress',/หายใจลำบาก|หายใจไม่ออก|หอบจนหายใจ|difficulty breathing|struggling to breathe|cannot breathe|can't breathe/iu],['unresponsive',/หมดสติ|ไม่รู้สึกตัว|unconscious|unresponsive/iu],['urinary_obstruction',/ฉี่ไม่ออก|พยายามฉี่แต่ฉี่ไม่ออก|straining (?:to urinate )?without (?:passing )?urine|unable to urinate|cannot urinate|cannot pee|can't pee/iu],['ongoing_seizure',/กำลังชัก|ชักไม่หยุด|ongoing seizure|seizing now/iu],['heavy_bleeding',/เลือดไหลไม่หยุด|เลือดออกมาก|heavy bleeding|bleeding won't stop/iu],['suspected_toxin',/(?:กิน|กลืน|ได้รับ|สงสัยกิน|สงสัยได้รับ).{0,15}(?:สารพิษ|ยาพิษ)|กินยาเกินขนาด|(?:ate|swallowed|ingested|exposed to).{0,20}(?:poison|toxic|toxin)|suspected poison(?:ing| exposure)|possible poison exposure/iu],['major_trauma',/ถูกรถชน|ตกจากที่สูง|บาดเจ็บรุนแรง|hit by a car|major trauma|fell from (?:a )?(?:height|balcony|roof)/iu]];
 for(const [code,pattern]of markers){for(const text of texts){for(const clause of text.split(/[.!?\n;]|แต่|\bbut\b/iu)){const match=clause.match(pattern);if(match&& !/(?:ไม่มี|ไม่พบ|ไม่ได้|ไม่เคย|no\s|not\s|without\s|denies\s|no signs of\s).{0,30}$/iu.test(clause.slice(0,match.index))){codes.push(code);break;}}}}
 return{urgent:codes.length>0,codes:[...new Set(codes)],message:codes.length?(language==='th'?'มีอาการที่ควรติดต่อสัตวแพทย์ทันที กรุณาติดต่อคลินิกหรือโรงพยาบาลสัตว์ก่อน ไม่ต้องรอทำบทสนทนานี้ให้ครบ ระบบนี้ไม่วินิจฉัยหรือสั่งการรักษา':'A reported warning sign needs immediate veterinary attention. Contact a veterinary clinic or hospital now; do not wait to complete this conversation. This tool does not diagnose or prescribe.'):(language==='th'?'ใช้เตรียมข้อมูลให้คุณหมอ ไม่แทนการตรวจ หากอาการเปลี่ยนหรือไม่แน่ใจให้ติดต่อสัตวแพทย์':'This prepares information for a vet and does not replace an examination. Contact a vet if signs change or you are unsure.')};
}
export function pendingQuestions(reason:string,answers:AnswerMap):PassportQuestionId[]{return relevantQuestions(reason,answers).filter(id=>!answers[id]||(answers[id]?.status==='unknown'&&(answers[id]?.attempts??0)<2));}

/** A catalog uncertainty choice keeps its original words, never a negative answer. */
export function normalizePassportAnswerStatus(status:PassportAnswerStatus,value:string):PassportAnswerStatus{return status==='answered'&&/^(?:ยังไม่แน่ใจ|ยังไม่ทราบ|ไม่ทราบ|จำไม่ได้|ยังไม่ได้สังเกต|I am unsure|I don't know|Not observed yet|Unknown)$/iu.test(value.trim())?'unknown':status;}
