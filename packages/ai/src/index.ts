import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInput } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { withSystem } from '@chordjai/db';
import {cachedInputDecision,inputDecisionSchema,GATE_INSTRUCTIONS,type InputDecision} from './ingress';
export {quickInputDecision,inputDecisionSchema,canonicalInput} from './ingress';
export type {InputDecision} from './ingress';
import { HttpError,takeLimits,guardLimit } from '@chordjai/service-kit';
import {tokenUsage,priceTokens,type TokenUsage} from './pricing';

export const GENERATIVE_MODEL = 'gpt-6.1-sol';
export const INPUT_MODEL = 'gpt-6-luna';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const PROMPT_VERSION = '2026-10-30.1';
export type AiFeature = 'care.organize' | 'input.classify' | 'agent.normalize' | 'agent.plan' | 'agent.answer' | 'passport.question' | 'notification.followup' | 'assistant.chat' | 'journal.decorate' | 'triage.assess' | 'vision.photo_check' | 'ocr.vaccine_book' | 'ocr.microchip' | 'petid.signature' | 'petid.verify_pair' | 'petid.capture_review' | 'embed.petid';
const limits: Record<AiFeature, number> = { 'care.organize': 10, 'input.classify': 150, 'agent.answer': 80, 'agent.normalize': 80, 'agent.plan': 120, 'passport.question': 40, 'notification.followup': 2, 'assistant.chat': 50, 'journal.decorate': 10, 'triage.assess': 10, 'vision.photo_check': 10, 'ocr.vaccine_book': 5, 'ocr.microchip': 10, 'petid.signature': 10, 'petid.verify_pair': 10, 'petid.capture_review': 10, 'embed.petid': 20 };
const deadlines:Record<AiFeature,number>={'care.organize':15000,'input.classify':8000,'agent.answer':15000,'agent.normalize':15000,'agent.plan':25000,'passport.question':15000,'notification.followup':20000,'assistant.chat':45000,'journal.decorate':45000,'triage.assess':15000,'vision.photo_check':30000,'ocr.vaccine_book':45000,'ocr.microchip':20000,'petid.signature':30000,'petid.verify_pair':20000,'petid.capture_review':30000,'embed.petid':10000};
let client: OpenAI | undefined;
function openai() {
  if ((process.env.OPENAI_MODEL ?? GENERATIVE_MODEL) !== GENERATIVE_MODEL) throw new HttpError(503, 'MODEL_CONFIG_INVALID', 'OPENAI_MODEL must be gpt-6.1-sol');
  if (!process.env.OPENAI_API_KEY) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'ผู้ช่วย AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
  return client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 45_000 });
}
type Options = { userId: string; feature: Exclude<AiFeature, 'embed.petid'>; instructions: string; input?: unknown; images?: string[]; messages?: { role: 'user' | 'assistant'; content: string }[]; maxOutputTokens?: number };

let usageSchema:{ready:boolean;until:number}|undefined;
async function hasUsageSchema(){
 if(usageSchema&&usageSchema.until>Date.now())return usageSchema.ready;
 const ready=await withSystem(async tx=>(await tx.query("select exists(select 1 from pg_attribute where attrelid='ai_ops.requests'::regclass and attname='cost_basis' and not attisdropped) ready")).rows[0]?.ready===true);
 usageSchema={ready,until:Date.now()+30000};return ready;
}
async function reserve(userId: string, feature: AiFeature, model: string, reserveUsd: number) {
  const budget = Number(process.env.AI_DAILY_BUDGET_USD ?? '5');
  if (!Number.isFinite(budget) || budget <= 0) throw new HttpError(503, 'AI_BUDGET_INVALID', 'AI daily budget is invalid');
  if(!await takeLimits(userId,[{scope:'ai-user-minute',key:userId,seconds:60,limit:guardLimit('AI_CALLS_PER_MINUTE',20)},{scope:'ai-global-minute',key:'global',seconds:60,limit:guardLimit('AI_GLOBAL_CALLS_PER_MINUTE',300)}],'ai.limited'))throw new HttpError(429,'AI_RATE_LIMIT','เรียก AI ถี่เกินไป กรุณารอสักครู่');
  const usageReady=await hasUsageSchema();
  return withSystem(async (tx) => {
    // One transaction lock serializes admission across all Vercel instances.
    await tx.query("select pg_advisory_xact_lock(hashtext('chordjai-ai-daily-budget'))");
    const result = await tx.query<{ calls: string; total: string }>(
      `select count(*) filter (where user_id = $1 and feature = $2 and status<>'budget_blocked')::text calls,
        coalesce(sum(cost_usd),0)::text total from ai_ops.requests where created_at >= date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'`, [userId, feature]);
    const usage = result.rows[0]!;
    const userBudget=Number(process.env.AI_USER_DAILY_BUDGET_USD??0.50),monthlyBudget=Number(process.env.AI_MONTHLY_BUDGET_USD??0);
    if(![userBudget,monthlyBudget].every(n=>Number.isFinite(n)&&n>=0))throw new HttpError(503,'AI_BUDGET_INVALID','AI budget is invalid');
    const extra=(await tx.query("select coalesce(sum(cost_usd) filter(where user_id=$1 and created_at >= date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),0)::float user_total, coalesce(sum(cost_usd),0)::float month_total from ai_ops.requests where created_at >= date_trunc('month',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'",[userId])).rows[0]??{user_total:0,month_total:0};
    const blocked=userBudget>0&&Number(extra.user_total)+reserveUsd>userBudget?'AI_USER_BUDGET_LIMIT':monthlyBudget>0&&Number(extra.month_total)+reserveUsd>monthlyBudget?'AI_MONTHLY_BUDGET_LIMIT':Number(usage.calls)>=limits[feature]?'AI_RATE_LIMIT':Number(usage.total)+reserveUsd>budget?'AI_BUDGET_LIMIT':null;
    if(blocked){
      const logged=(await tx.query("select id from ai_ops.requests where user_id=$1 and feature=$2 and status='budget_blocked' and created_at>now()-interval '1 minute' limit 1",[userId,feature])).rowCount;
      if(logged)return {blocked};
      if(usageReady)await tx.query(`insert into ai_ops.requests(user_id,feature,model,prompt_version,status,cost_usd,error_code,cost_basis) values($1,$2,$3,$4,'budget_blocked',0,$5,'not_sent')`,[userId,feature,model,PROMPT_VERSION,blocked]);
      else await tx.query(`insert into ai_ops.requests(user_id,feature,model,prompt_version,status,cost_usd,error_code) values($1,$2,$3,$4,'budget_blocked',0,$5)`,[userId,feature,model,PROMPT_VERSION,blocked]);
      return {blocked};
    }
    const inserted = await tx.query<{ id: string }>(`insert into ai_ops.requests(user_id,feature,model,prompt_version,status,cost_usd) values($1,$2,$3,$4,'reserved',$5) returning id`, [userId, feature, model, PROMPT_VERSION, reserveUsd]);
    if(usageReady)await tx.query("update ai_ops.requests set cost_basis='reserved',reserved_cost_usd=cost_usd where id=$1",[inserted.rows[0]!.id]);
    return {id:inserted.rows[0]!.id};
  }).then(result=>{if(result.blocked)throw new HttpError(429,result.blocked,result.blocked==='AI_RATE_LIMIT'?'ใช้ AI ถึงโควตาประจำวันแล้ว':'งบ AI ประจำวันเต็มแล้ว กรุณาลองใหม่ภายหลัง');return result.id!;});
}
async function finish(id:string,details:{model:string;latency:number;input:number;output:number;status:string;error?:string;cost?:number;usage?:TokenUsage|null;responseId?:string;providerRequestId?:string;tier?:string}) {
  const usage=details.usage??null,priced=usage?priceTokens(details.model,usage,details.tier):null;
  const basis=usage?(priced?'token_estimate':'unpriced'):'unknown';
  // cost_usd is conservative budget exposure, not an invoice. Unknown transport
  // outcomes keep the reservation; the dashboard shows it separately.
  const cost=priced?.usd??details.cost??(details.input*Math.max(Number(process.env.AI_INPUT_USD_PER_MILLION??2),Number(process.env.AI_CACHE_WRITE_USD_PER_MILLION??2.5))+details.output*Number(process.env.AI_OUTPUT_USD_PER_MILLION??10))/1e6;
  if(await hasUsageSchema()) {
    await withSystem(tx=>tx.query(`update ai_ops.requests set model_resolved=$2,latency_ms=$3,input_tokens=$4,output_tokens=$5,status=$6,error_code=$7,
      reserved_cost_usd=coalesce(reserved_cost_usd,cost_usd),cost_usd=case when $8::numeric is null then cost_usd else $8 end,
      cached_input_tokens=$9,cache_write_tokens=$10,reasoning_tokens=$11,total_tokens=$12,usage_reported=$13,estimated_cost_usd=$14,cost_basis=$15,price_snapshot=$16::jsonb,
      provider_response_id=$17,provider_request_id=$18,service_tier=$19,completed_at=now() where id=$1`,
      [id,details.model,details.latency,usage?.input??details.input,usage?.output??details.output,details.status,details.error??null,priced?cost:null,
      usage?.cached??0,usage?.cacheWrite??0,usage?.reasoning??0,usage?.total??0,!!usage,priced?.usd??null,basis,priced?JSON.stringify(priced.snapshot):null,
      details.responseId??null,details.providerRequestId??null,details.tier??null]));
  }else {
    await withSystem(tx=>tx.query('update ai_ops.requests set model_resolved=$2,latency_ms=$3,input_tokens=$4,output_tokens=$5,status=$6,error_code=$7,cost_usd=$8 where id=$1',[id,details.model,details.latency,details.input,details.output,details.status,details.error??null,cost]));
  }
}
function inputFor(options: Options): ResponseInput {
  const history: ResponseInput = (options.messages ?? []).map(message => ({ role: message.role, content: message.content }));
  if (options.input !== undefined || options.images?.length) history.push({ role: 'user', content: [
    { type: 'input_text', text: typeof options.input === 'string' ? options.input : JSON.stringify(options.input ?? {}) },
    ...(options.images ?? []).map(image_url => ({ type: 'input_image' as const, image_url, detail: 'high' as const })),
  ] });
  return history;
}
export async function runStructured<T>(options: Options & { schema: z.ZodType<T> }): Promise<T> {
  const api = openai();
  const maxTokens = Math.min(options.maxOutputTokens ?? 4000, 8000);
  const model=['input.classify','agent.normalize'].includes(options.feature)?INPUT_MODEL:GENERATIVE_MODEL;
  const sample=priceTokens(model,{input:1000000,output:0,cached:0,cacheWrite:0,reasoning:0,total:1000000});
  const inputRate=Math.max(sample?.snapshot.input??NaN,sample?.snapshot.cacheWrite??NaN),outputRate=sample?.snapshot.output??NaN,priceMultiplier=Number(process.env.AI_PRICE_MULTIPLIER??1);
  if(![inputRate,outputRate,priceMultiplier].every(n=>Number.isFinite(n)&&n>0))throw new HttpError(503,'AI_PRICING_INVALID','AI price configuration is invalid');
  const inputText = options.instructions+JSON.stringify(options.input ?? '') + JSON.stringify(options.messages ?? []);
  const bytes=Buffer.byteLength(inputText,'utf8');
  const imageLimit = options.feature === 'ocr.vaccine_book' ? 10 : 6;
  if (bytes > 160_000 || (options.images?.length ?? 0) > imageLimit) throw new HttpError(413, 'AI_INPUT_TOO_LARGE', 'ข้อมูลสำหรับ AI มากเกินไป');
  // Text byte count is a conservative token upper bound. Gallery images are
  // resized by the media service before provider input; reserve 6000 per image.
  const reserveUsd = (maxTokens*outputRate+(bytes+(options.images?.length??0)*6000)*inputRate)*priceMultiplier/1_000_000;
  const requestId = await reserve(options.userId, options.feature, model, reserveUsd);
  const started = Date.now();
  let providerUsage: { model:string;input:number;output:number;usage:TokenUsage|null;responseId?:string;providerRequestId?:string;tier?:string } | undefined;
  try {
    const response = await api.responses.parse({ model, store: false, service_tier:'default',
      ...(model===INPUT_MODEL?{prompt_cache_key:'chordjai-input-gate-2026-10-30',prompt_cache_retention:'in_memory' as const}:{}),
      instructions: options.instructions, input: inputFor(options),
      reasoning: { effort: model===INPUT_MODEL?'none':options.feature === 'triage.assess' ? 'high' : 'low' },
      max_output_tokens: maxTokens, text: { format: zodTextFormat(options.schema, options.feature.replaceAll('.', '_')) },
    },{timeout:deadlines[options.feature]});
    providerUsage = { model:response.model,input:response.usage?.input_tokens??0,output:response.usage?.output_tokens??0,usage:tokenUsage(response.usage),responseId:response.id,providerRequestId:response._request_id??undefined,tier:response.service_tier??'default' };
    if (response.status !== 'completed' || response.output_parsed === null) throw new HttpError(502, 'AI_INVALID_OUTPUT', 'AI ยังสร้างผลลัพธ์ที่สมบูรณ์ไม่ได้ กรุณาลองใหม่');
    const parsed = options.schema.parse(response.output_parsed);
    await finish(requestId, { ...providerUsage!, latency: Date.now() - started, status: 'ok' });
    return parsed;
  } catch (error) {
    // No prompt, image or answer is persisted in the audit table. Preserve reserved
    // spend if the transport fails: the provider may still have billed the call.
    await finish(requestId, { ...providerUsage, model: providerUsage?.model ?? model, input: providerUsage?.input ?? 0, output: providerUsage?.output ?? 0, latency: Date.now() - started, status: 'error', error: error instanceof HttpError ? error.code : 'PROVIDER_ERROR', ...(!providerUsage ? { cost: reserveUsd } : {}) });
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'AI_UNAVAILABLE', 'AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
  }
}
export async function classifyInput(options:{userId:string;text:string;channel:'line'|'liff';context?:unknown}):Promise<InputDecision>{
 const permitted=await withSystem(async db=>(await db.query("select u.id from identity.users u join identity.consents c on c.user_id=u.id and c.purpose='service' and c.granted where u.id=$1 and u.status='active'",[options.userId])).rowCount);
 if(!permitted)throw new HttpError(403,'SERVICE_CONSENT_REQUIRED','กรุณายินยอมใช้งานบริการก่อนใช้ผู้ช่วย');
 return cachedInputDecision(options,input=>runStructured({userId:options.userId,feature:'input.classify',schema:inputDecisionSchema,instructions:GATE_INSTRUCTIONS,input,maxOutputTokens:300}));
}
const textSchema = z.object({ reply: z.string().min(1).max(6000) });
export async function runText(options: Options) { return (await runStructured({ ...options, schema: textSchema })).reply; }
export async function embedTexts(userId: string, texts: string[]): Promise<number[][]> {
  const api = openai();
  if (!texts.length || texts.length > 8 || texts.some(text => text.length > 10_000)) throw new HttpError(400, 'EMBEDDING_INPUT_INVALID', 'Invalid embedding input');
  const embeddingRate=Number(process.env.AI_EMBEDDING_USD_PER_MILLION??0.02),multiplier=Number(process.env.AI_PRICE_MULTIPLIER??1);
  if(![embeddingRate,multiplier].every(n=>Number.isFinite(n)&&n>0))throw new HttpError(503,'AI_PRICING_INVALID','AI price configuration is invalid');
  const reserveCost=Math.max(0.000001,texts.reduce((n,text)=>n+Buffer.byteLength(text,'utf8'),0)*embeddingRate*multiplier/1e6);
  const requestId = await reserve(userId, 'embed.petid', EMBEDDING_MODEL, reserveCost);
  const started = Date.now();
  let observed:{model:string;input:number;output:number;usage:TokenUsage|null;providerRequestId?:string}|undefined;
  try {
    const response=await api.embeddings.create({model:EMBEDDING_MODEL,input:texts,dimensions:1536},{timeout:deadlines['embed.petid']});
    observed={model:response.model,input:response.usage.total_tokens,output:0,usage:tokenUsage(response.usage),providerRequestId:response._request_id??undefined};
    await finish(requestId,{...observed!,latency:Date.now()-started,status:'ok',cost:response.usage.total_tokens*0.02/1e6});
    return response.data.sort((a,b)=>a.index-b.index).map(item=>item.embedding);
  }catch{
    await finish(requestId,{...observed,model:observed?.model??EMBEDDING_MODEL,input:observed?.input??0,output:0,latency:Date.now()-started,status:'error',error:'PROVIDER_ERROR',cost:reserveCost});
    throw new HttpError(503,'AI_UNAVAILABLE','ระบบค้นหาจากภาพยังไม่พร้อม กรุณาลองใหม่ภายหลัง');
  }
}

export function hasUnsafeMedicalAdvice(text: string): boolean {
  // Doses and definitive diagnoses remain blocked even inside quotations or a
  // claimed vet attribution. A name-dropping preface must not bypass the guard.
  if(/\d+(?:[.,]\d+)?\s*(?:mg\b|ml\b|cc\b|มก\.?|มล\.?|เม็ด|หยด)|(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ครึ่ง)\s*(?:มิลลิกรัม|มิลลิลิตร|เม็ด|หยด|ซีซี)|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|quarter|half)\s+(?:(?:of\s+)?(?:a|an)\s+)?(?:tablets?|pills?|drops?|mg|ml)\b|(?:เป็นโรค|วินิจฉัยว่า).{0,30}(?:แน่นอน|ชัวร์)/iu.test(text))return true;
  // The old broad ให้…ยา match also rejected “ให้คุณหมอประเมินเรื่องยา”.
  // Remove only closed, non-dosage referral/report/avoidance phrases, then
  // inspect the remaining prose so an appended instruction is still caught.
  const prose=text
    .replace(/(?:ขอให้|ให้)\s*(?:สัตวแพทย์|คุณหมอ)\s*(?:เป็นผู้|เป็นคน)?\s*(?:ประเมิน|เลือก|ตรวจ|พิจารณา|ดูแล|แนะนำ|กำหนด)(?:เรื่อง|การ|ชนิด|ขนาด|ความเหมาะสม|ของ|ก่อน|\s)*(?:การ)?(?:ใช้|ให้|กิน|ฉีด)?ยา/giu,'')
    .replace(/(?:สัตวแพทย์|คุณหมอ)\s*(?:เป็นผู้|เป็นคน)?\s*(?:ให้|ฉีด|เลือก|สั่ง)ยา/giu,'')
    .replace(/(?:ไม่ควร|ห้าม|อย่า|ไม่แนะนำให้)\s*(?:ให้|ใช้|กิน|ฉีด|ป้อน)ยา/giu,'')
    .replace(/(?:ใช้|ให้)ยาตาม(?:คำแนะนำ|คำสั่ง)ของ(?:สัตวแพทย์|คุณหมอ)/giu,'')
    .replace(/\b(?:do not|don't|never)\s+(?:give|administer|prescribe)\s+(?:medication|medicine)\b/giu,'');
  return /(?:ให้|กิน|ป้อน|ฉีด|ใช้).{0,25}(?:ยา|พาราเซตามอล|ไอบูโพรเฟน|แอสไพริน|amoxicillin|ibuprofen|paracetamol|aspirin)|(?:give|administer|prescribe).{0,25}(?:medication|medicine|amoxicillin|ibuprofen|paracetamol|aspirin)/iu.test(prose);
}
