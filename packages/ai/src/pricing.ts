/** Standard OpenAI API rates checked 2026-10-30. Amounts are USD / 1M tokens. */
export const PRICE_VERSION='openai-standard-2026-10-30';
export type TokenUsage={input:number;output:number;cached:number;cacheWrite:number;reasoning:number;total:number};
export function tokenUsage(usage:unknown):TokenUsage|null{
 if(!usage||typeof usage!=='object')return null;
 const u=usage as Record<string,any>,input=u.input_tokens??u.total_tokens,output=u.output_tokens??0;
 const cached=u.input_tokens_details?.cached_tokens??0,cacheWrite=u.input_tokens_details?.cache_write_tokens??0,reasoning=u.output_tokens_details?.reasoning_tokens??0;
 if(![input,output,cached,cacheWrite,reasoning].every(n=>Number.isSafeInteger(n)&&n>=0)||cached+cacheWrite>input||reasoning>output)return null;
 return {input,output,cached,cacheWrite,reasoning,total:input+output};
}
export function priceTokens(model:string,usage:TokenUsage,tier='default'){
 const embedding=model==='text-embedding-3-small',luna=/^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
 const known=embedding||luna||/^gpt-6\.1-sol(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
 if(!known||!['default','standard'].includes(tier))return null;
 const rate=(key:string,fallback:number)=>{const n=Number(process.env[key]??fallback);return Number.isFinite(n)&&n>=0?n:NaN;};
 const rates=embedding?{input:rate('AI_EMBEDDING_USD_PER_MILLION',0.02),cached:0,cacheWrite:0,output:0}:luna?{input:rate('AI_LUNA_INPUT_USD_PER_MILLION',0.10),cached:rate('AI_LUNA_CACHED_INPUT_USD_PER_MILLION',0.01),cacheWrite:rate('AI_LUNA_CACHE_WRITE_USD_PER_MILLION',0.125),output:rate('AI_LUNA_OUTPUT_USD_PER_MILLION',0.50)}:{input:rate('AI_INPUT_USD_PER_MILLION',2),cached:rate('AI_CACHED_INPUT_USD_PER_MILLION',0.1),cacheWrite:rate('AI_CACHE_WRITE_USD_PER_MILLION',2.5),output:rate('AI_OUTPUT_USD_PER_MILLION',10)};
 const multiplier=rate('AI_PRICE_MULTIPLIER',1),long=!embedding&&usage.input>272000;
 if(!Object.values(rates).every(Number.isFinite)||!Number.isFinite(multiplier)||multiplier<=0)return null;
 const usd=((usage.input-usage.cached-usage.cacheWrite)*rates.input+usage.cached*rates.cached+usage.cacheWrite*rates.cacheWrite)*(long?2:1)/1e6+usage.output*rates.output*(long?1.5:1)/1e6;
 return {usd:Number((usd*multiplier).toFixed(8)),snapshot:{...rates,multiplier,longContext:long,version:PRICE_VERSION,source:'https://developers.openai.com/api/docs/pricing'}};
}
