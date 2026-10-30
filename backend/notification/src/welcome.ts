import {withSystem} from '@chordjai/db';
import {fingerprint} from '@chordjai/service-kit';
import {replyLine,appLink,type LineMessage} from '@chordjai/line';
import {admitLineEvent} from './input-guard';
import {markAcceptedLineEventRead} from './agent-channel';
type WelcomeEvent={webhookEventId:string;type:string;replyToken?:string;timestamp?:number;deliveryContext?:{isRedelivery?:boolean};source:{type:string;userId?:string};message?:{type?:string;text?:string;markAsReadToken?:string}};
function ownerLink(tab:string,language:'th'|'en',compose=false){
 const id=process.env.LINE_AGENT_LIFF_ID||process.env.LIFF_ID;
 const query=new URLSearchParams({tab,lang:language,...(compose?{compose:'1'}:{})});
 return id&&/^\d+-[A-Za-z0-9]+$/.test(id)?`https://liff.line.me/${id}?${query}`:appLink(`/app?${query}`);
}
export function welcomeMessages(language:'th'|'en',thanks=false):LineMessage[]{
 const en=language==='en';
 return [{type:'flex',altText:en?'Tell ChordJai about your pet. We’ll keep the story.':'เล่าเรื่องน้อง ชิดใจช่วยเก็บให้',contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',backgroundColor:'#FFFAF5',contents:[{type:'text',weight:'bold',size:'lg',wrap:true,color:'#3A210D',text:thanks?(en?'You’re welcome.':'ยินดีครับ'):en?'How is your pet today?':'วันนี้น้องเป็นอย่างไรบ้าง?'},{type:'text',wrap:true,size:'sm',color:'#695044',text:en?'Tell us a little about your pet, or ask us to save an update. For example: “Peony is scratching her ear today. Please record it.”':'พิมพ์เล่าเรื่องน้อง หรือสั่งให้ช่วยบันทึกได้เลย เช่น “วันนี้พีโอนีเกาหูบ่อย ช่วยบันทึกไว้หน่อย”'},{type:'text',wrap:true,size:'xs',color:'#695044',text:en?'For your first update, connect LINE and add your pet. You can edit your records later.':'เริ่มครั้งแรก เชื่อมต่อ LINE และเพิ่มชื่อน้องก่อน คุณกลับมาแก้ไขบันทึกได้เสมอ'}]},footer:{type:'box',layout:'vertical',spacing:'sm',contents:[['home',en?'Write an update':'บันทึกเรื่องน้อง',true],['health',en?'My records':'ดูบันทึกของฉัน',false],['profile',en?'My pet & care tools':'น้องของฉันและเครื่องมือ',false]].map(([tab,label,compose],index)=>({type:'button',style:index===0?'primary':'secondary',...(index===0?{color:'#FF8A24'}:{}),action:{type:'uri',label,uri:ownerLink(String(tab),language,Boolean(compose))}}))}}}];
}
/** Deterministic and throttled; never creates a chat/agent/clinical record. */
export async function greetLineEvent(event:WelcomeEvent,language:'th'|'en'){
 if(!event.message?.text?.trim()||event.source.type!=='user'||!event.source.userId||!event.replyToken||event.deliveryContext?.isRedelivery||event.timestamp!==undefined&&(event.timestamp<Date.now()-60_000||event.timestamp>Date.now()+30_000))return;
 const allowed=await withSystem(async db=>{
  if(!await admitLineEvent(db,event))return false;
  return(await db.query("select ops.take_rate_limit('line-welcome',$1,300,1) allowed",[fingerprint(event.source.userId!)])).rows[0]?.allowed===true;
 });
 if(!allowed)return;
 await markAcceptedLineEventRead(event);
 try{await replyLine(event.replyToken,welcomeMessages(language,/^(?:ขอบคุณ|thanks|thank you)/iu.test(event.message?.text??'')),3000);}catch{console.warn(JSON.stringify({event:'line_welcome_unavailable'}));}
}
