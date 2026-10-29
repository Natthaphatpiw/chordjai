import type {LineMessage} from '@chordjai/line';
export type AgentCardChoice={id:string;label:string};
export function agentCard(title:string,text:string,choices:AgentCardChoice[]=[],url?:string,language:'th'|'en'='th'):LineMessage{
 const footer:Record<string,unknown>[] = choices.slice(0,8).map(choice=>({type:'button',height:'sm',style:'secondary',action:{type:'postback',label:choice.label.slice(0,40),data:`agent:choice:${choice.id}`,displayText:choice.label.slice(0,300)}}));
 if(url)footer.push({type:'button',height:'sm',style:'primary',color:'#FF8A24',action:{type:'uri',label:language==='en'?'View in ChordJai':'ดูงานในชิดใจ',uri:url}});
 return {type:'flex',altText:`${title}: ${text}`.slice(0,400),contents:{type:'bubble',size:'mega',body:{type:'box',layout:'vertical',spacing:'md',backgroundColor:'#FFFAF5',contents:[{type:'text',text:title.slice(0,300),weight:'bold',size:'lg',wrap:true,color:'#3A210D'},{type:'text',text:text.slice(0,2000)||' ',wrap:true,color:'#695044',size:'sm'},...(choices.length?[{type:'text',text:language==='en'?'Choose an option or type your own answer.':'กดตัวเลือกหรือพิมพ์คำตอบของคุณเองได้เลย',wrap:true,size:'xs',color:'#695044'}]:[])]},...(footer.length?{footer:{type:'box',layout:'vertical',spacing:'sm',contents:footer}}:{})}};
}
