export type Preferences = { assistant_name: string; tone: string; about_user: string; memory_enabled: boolean };
export type Memory = { content: string; enabled: boolean; user_id?: string };
export function buildMemoryContext(userId: string, preferences: Preferences, memories: Memory[]): string {
  const tone = { warm: 'อบอุ่นและเข้าใจ', concise: 'กระชับและตรงประเด็น', playful: 'เป็นกันเองและสดใส', professional: 'สุภาพและชัดเจน' }[preferences.tone] ?? 'อบอุ่นและเข้าใจ';
  const facts:string[]=[];let bytes=0;
  if(preferences.memory_enabled)for(const memory of memories.filter(m=>m.enabled&&(!m.user_id||m.user_id===userId)).slice(0,25)){
    const size=Buffer.byteLength(memory.content,'utf8');if(bytes+size>20000)break;facts.push(memory.content);bytes+=size;
  }
  return JSON.stringify({ assistantName: preferences.assistant_name, tone, aboutUser: preferences.about_user, userApprovedMemories: facts });
}
export function boundedRecentMessages<T extends {content:string}>(messages:T[]):T[]{
  const selected:T[]=[];let bytes=0;
  for(const message of [...messages].reverse()){
    const size=Buffer.byteLength(message.content,'utf8');if(bytes+size>90000)break;selected.unshift(message);bytes+=size;
  }
  return selected;
}
