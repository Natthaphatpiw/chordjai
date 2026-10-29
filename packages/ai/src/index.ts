import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInput } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { withSystem } from '@chordjai/db';
import { HttpError } from '@chordjai/service-kit';

export const GENERATIVE_MODEL = 'gpt-6.1-sol';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const PROMPT_VERSION = '2026-10-29.4';
export type AiFeature = 'agent.normalize' | 'agent.plan' | 'agent.answer' | 'passport.question' | 'notification.followup' | 'assistant.chat' | 'journal.decorate' | 'triage.assess' | 'vision.photo_check' | 'ocr.vaccine_book' | 'ocr.microchip' | 'petid.signature' | 'petid.verify_pair' | 'petid.capture_review' | 'embed.petid';
const limits: Record<AiFeature, number> = { 'agent.answer': 80, 'agent.normalize': 80, 'agent.plan': 120, 'passport.question': 40, 'notification.followup': 2, 'assistant.chat': 50, 'journal.decorate': 10, 'triage.assess': 10, 'vision.photo_check': 10, 'ocr.vaccine_book': 5, 'ocr.microchip': 10, 'petid.signature': 10, 'petid.verify_pair': 10, 'petid.capture_review': 10, 'embed.petid': 20 };
const deadlines:Record<AiFeature,number>={'agent.answer':15000,'agent.normalize':15000,'agent.plan':25000,'passport.question':15000,'notification.followup':20000,'assistant.chat':45000,'journal.decorate':45000,'triage.assess':15000,'vision.photo_check':30000,'ocr.vaccine_book':45000,'ocr.microchip':20000,'petid.signature':30000,'petid.verify_pair':20000,'petid.capture_review':30000,'embed.petid':10000};
let client: OpenAI | undefined;
function openai() {
  if ((process.env.OPENAI_MODEL ?? GENERATIVE_MODEL) !== GENERATIVE_MODEL) throw new HttpError(503, 'MODEL_CONFIG_INVALID', 'OPENAI_MODEL must be gpt-6.1-sol');
  if (!process.env.OPENAI_API_KEY) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'ผู้ช่วย AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
  return client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 45_000 });
}
type Options = { userId: string; feature: Exclude<AiFeature, 'embed.petid'>; instructions: string; input?: unknown; images?: string[]; messages?: { role: 'user' | 'assistant'; content: string }[]; maxOutputTokens?: number };

async function reserve(userId: string, feature: AiFeature, model: string, reserveUsd: number) {
  const budget = Number(process.env.AI_DAILY_BUDGET_USD ?? '5');
  if (!Number.isFinite(budget) || budget <= 0) throw new HttpError(503, 'AI_BUDGET_INVALID', 'AI daily budget is invalid');
  return withSystem(async (tx) => {
    // One transaction lock serializes admission across all Vercel instances.
    await tx.query("select pg_advisory_xact_lock(hashtext('chordjai-ai-daily-budget'))");
    const result = await tx.query<{ calls: string; total: string }>(
      `select count(*) filter (where user_id = $1 and feature = $2 and status<>'budget_blocked')::text calls,
        coalesce(sum(cost_usd),0)::text total from ai_ops.requests where created_at >= date_trunc('day',now())`, [userId, feature]);
    const usage = result.rows[0]!;
    const blocked=Number(usage.calls)>=limits[feature]?'AI_RATE_LIMIT':Number(usage.total)+reserveUsd>budget?'AI_BUDGET_LIMIT':null;
    if(blocked){
      await tx.query(`insert into ai_ops.requests(user_id,feature,model,prompt_version,status,cost_usd,error_code) values($1,$2,$3,$4,'budget_blocked',0,$5)`,[userId,feature,model,PROMPT_VERSION,blocked]);
      return {blocked};
    }
    const inserted = await tx.query<{ id: string }>(`insert into ai_ops.requests(user_id,feature,model,prompt_version,status,cost_usd) values($1,$2,$3,$4,'reserved',$5) returning id`, [userId, feature, model, PROMPT_VERSION, reserveUsd]);
    return {id:inserted.rows[0]!.id};
  }).then(result=>{if(result.blocked)throw new HttpError(429,result.blocked,result.blocked==='AI_RATE_LIMIT'?'ใช้ AI ถึงโควตาประจำวันแล้ว':'งบ AI ประจำวันเต็มแล้ว กรุณาลองใหม่ภายหลัง');return result.id!;});
}
async function finish(id: string, details: { model: string; latency: number; input: number; output: number; status: string; error?: string; cost?: number }) {
  const inputRate = Number(process.env.AI_INPUT_USD_PER_MILLION ?? '2');
  const outputRate = Number(process.env.AI_OUTPUT_USD_PER_MILLION ?? '10');
  const cost = details.cost ?? (details.input * inputRate + details.output * outputRate) / 1_000_000;
  await withSystem(tx => tx.query(`update ai_ops.requests set model_resolved=$2,latency_ms=$3,input_tokens=$4,output_tokens=$5,status=$6,error_code=$7,cost_usd=$8 where id=$1`, [id, details.model, details.latency, details.input, details.output, details.status, details.error ?? null, cost]));
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
  const inputText = options.instructions+JSON.stringify(options.input ?? '') + JSON.stringify(options.messages ?? []);
  const bytes=Buffer.byteLength(inputText,'utf8');
  const imageLimit = options.feature === 'ocr.vaccine_book' ? 10 : 6;
  if (bytes > 160_000 || (options.images?.length ?? 0) > imageLimit) throw new HttpError(413, 'AI_INPUT_TOO_LARGE', 'ข้อมูลสำหรับ AI มากเกินไป');
  // Text byte count is a conservative token upper bound. Gallery images are
  // resized by the media service before provider input; reserve 6000 per image.
  const reserveUsd = (maxTokens * Number(process.env.AI_OUTPUT_USD_PER_MILLION ?? 10)+(bytes+(options.images?.length??0)*6000)*Number(process.env.AI_INPUT_USD_PER_MILLION??2)) / 1_000_000;
  const requestId = await reserve(options.userId, options.feature, GENERATIVE_MODEL, reserveUsd);
  const started = Date.now();
  let providerUsage: { model: string; input: number; output: number } | undefined;
  try {
    const response = await api.responses.parse({ model: GENERATIVE_MODEL, store: false,
      instructions: options.instructions, input: inputFor(options),
      reasoning: { effort: options.feature === 'triage.assess' ? 'high' : 'low' },
      max_output_tokens: maxTokens, text: { format: zodTextFormat(options.schema, options.feature.replaceAll('.', '_')) },
    },{timeout:deadlines[options.feature]});
    providerUsage = { model: response.model, input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    if (response.status !== 'completed' || response.output_parsed === null) throw new HttpError(502, 'AI_INVALID_OUTPUT', 'AI ยังสร้างผลลัพธ์ที่สมบูรณ์ไม่ได้ กรุณาลองใหม่');
    const parsed = options.schema.parse(response.output_parsed);
    await finish(requestId, { ...providerUsage, latency: Date.now() - started, status: 'ok' });
    return parsed;
  } catch (error) {
    // No prompt, image or answer is persisted in the audit table. Preserve reserved
    // spend if the transport fails: the provider may still have billed the call.
    await finish(requestId, { model: providerUsage?.model ?? GENERATIVE_MODEL, input: providerUsage?.input ?? 0, output: providerUsage?.output ?? 0, latency: Date.now() - started, status: 'error', error: error instanceof HttpError ? error.code : 'PROVIDER_ERROR', ...(!providerUsage ? { cost: reserveUsd } : {}) });
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'AI_UNAVAILABLE', 'AI ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
  }
}
const textSchema = z.object({ reply: z.string().min(1).max(6000) });
export async function runText(options: Options) { return (await runStructured({ ...options, schema: textSchema })).reply; }
export async function embedTexts(userId: string, texts: string[]): Promise<number[][]> {
  const api = openai();
  if (!texts.length || texts.length > 8 || texts.some(text => text.length > 10_000)) throw new HttpError(400, 'EMBEDDING_INPUT_INVALID', 'Invalid embedding input');
  const requestId = await reserve(userId, 'embed.petid', EMBEDDING_MODEL, 0.005);
  const started = Date.now();
  try {
    const response = await api.embeddings.create({ model: EMBEDDING_MODEL, input: texts, dimensions: 1536 },{timeout:deadlines['embed.petid']});
    await finish(requestId, { model: response.model, input: response.usage.total_tokens, output: 0, latency: Date.now() - started, status: 'ok', cost: response.usage.total_tokens * 0.02 / 1_000_000 });
    return response.data.sort((a,b) => a.index - b.index).map(item => item.embedding);
  } catch {
    await finish(requestId, { model: EMBEDDING_MODEL, input: 0, output: 0, latency: Date.now() - started, status: 'error', error: 'PROVIDER_ERROR', cost: 0.005 });
    throw new HttpError(503, 'AI_UNAVAILABLE', 'ระบบค้นหาจากภาพยังไม่พร้อม กรุณาลองใหม่ภายหลัง');
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
