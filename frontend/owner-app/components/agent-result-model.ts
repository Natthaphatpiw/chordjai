export const AGENT_TABS=['home','health','journal','chat','care','settings'] as const;
export type AgentDestinationTab=typeof AGENT_TABS[number];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function agentTaskId(value:string|null|undefined){return value&&uuid.test(value)?value:null;}

/** Read only known LIFF entry parameters; never navigate to liff.state itself. */
export function agentEntryParams(href:string){
 const params=new URL(href,'https://www.chordjai.life').searchParams;
 const state=params.get('liff.state');
 if(state&&state.length<=2048&&(state.startsWith('?')||state.startsWith('/app?'))){
  const nested=new URLSearchParams(state.slice(state.indexOf('?')+1));
  for(const key of ['agentTaskId','tab','petId','lang'])if(!params.has(key)&&nested.has(key))params.set(key,nested.get(key)!);
 }
 return params;
}

/** Destination comes from a server task, but still cannot become an open redirect. */
export function agentDestinationPath(value:unknown):string|null{
 if(typeof value!=='string'||!value.startsWith('/app')||value.startsWith('//')||value.length>2048)return null;
 let source:URL;try{source=new URL(value,'https://www.chordjai.life');}catch{return null;}
 if(source.origin!=='https://www.chordjai.life'||source.pathname!=='/app')return null;
 const target=new URL('/app','https://www.chordjai.life');
 const tab=source.searchParams.get('tab');if(tab&&AGENT_TABS.includes(tab as AgentDestinationTab))target.searchParams.set('tab',tab);
 for(const key of ['petId','entryId','recordId','bookId','pageId','sessionId','episodeId','reminderId','reportId','appointmentId']){
  const id=agentTaskId(source.searchParams.get(key));if(id)target.searchParams.set(key,id);
 }
 if(source.searchParams.get('lang')==='en'||source.searchParams.get('lang')==='th')target.searchParams.set('lang',source.searchParams.get('lang')!);
 return `${target.pathname}${target.search}`;
}

export type AgentTaskResult={tool?:string;name?:string;path:string;petId?:string;resourceId?:string;summary?:string};
export type AgentTaskView={id:string;status:string;title?:string;language?:string;question?:unknown;results?:AgentTaskResult[];result?:{message?:string;path?:string;petId?:string;resourceId?:string;results?:AgentTaskResult[]}|null;createdAt?:string;updatedAt?:string;errorCode?:string|null};
export function agentTaskDestination(task:AgentTaskView){
 const first=task.results?.find(item=>agentDestinationPath(item.path))??task.result?.results?.find(item=>agentDestinationPath(item.path));
 const path=agentDestinationPath(task.result?.path)??agentDestinationPath(first?.path);
 const params=path?new URL(path,'https://www.chordjai.life').searchParams:null;
 const petId=agentTaskId(task.result?.petId)??agentTaskId(first?.petId)??agentTaskId(params?.get('petId'));
 const tab=params?.get('tab');
 return {path,petId,tab:tab&&AGENT_TABS.includes(tab as AgentDestinationTab)?tab as AgentDestinationTab:null};
}
