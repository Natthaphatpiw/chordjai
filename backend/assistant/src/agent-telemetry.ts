import {createHash} from 'node:crypto';

export type AgentStage='normalized'|'keyboard_requested'|'stale_choice_ignored'|'question_queued'|'confirmation_queued'|'task_queued'|'tool_succeeded'|'tool_failed'|'task_finished'|'delivery_sent'|'delivery_failed'|'turn_failed'|'result_requested';
type References={turnId?:string|null;taskId?:string|null;deliveryId?:string|null};
type Details={route?:string|null;status?:string|null;kind?:string|null;tool?:string;errorCode?:string|null;hasLiff?:boolean};
const routes=new Set(['chat','agent','followup_reply','help','emergency','unsupported']);
const statuses=new Set(['pending','processing','done','collecting','awaiting_confirmation','queued','running','succeeded','failed','cancelled','sent']);
const kinds=new Set(['chat','question','confirm','working','succeeded','failed','emergency','help','busy','error','cancelled','manual']);

/** Only fixed stage labels and bounded machine metadata enter runtime logs.
 * Hash opaque resource IDs so logs contain no owner, pet, LINE or record IDs.
 * Never accept messages, URLs, tool arguments, provider errors or user names. */
export function agentStage(stage:AgentStage,refs:References,details:Details={}){
 try{
  const record:Record<string,string|boolean>={event:'line_agent_stage',stage};
  for(const [name,value] of Object.entries(refs))if(value&&['turnId','taskId','deliveryId'].includes(name))record[name.replace('Id','Ref')]=createHash('sha256').update(value).digest('hex').slice(0,16);
  if(details.route&&routes.has(details.route))record.route=details.route;
  if(details.status&&statuses.has(details.status))record.status=details.status;
  const kind=details.kind?.split(':')[0];if(kind&&kinds.has(kind))record.kind=kind;
  if(details.tool&&/^[a-z]+(?:\.[a-z_]+){1,3}$/.test(details.tool))record.tool=details.tool;
  if(details.errorCode&&/^[A-Z][A-Z0-9_]{1,79}$/.test(details.errorCode))record.errorCode=details.errorCode;
  if(typeof details.hasLiff==='boolean')record.hasLiff=details.hasLiff;
  console.info(JSON.stringify(record));
 }catch{/* Observability cannot change a committed task or delivery outcome. */}
}
