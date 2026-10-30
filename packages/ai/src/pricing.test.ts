import {describe,it,expect,afterEach,vi} from 'vitest';
import {tokenUsage,priceTokens} from './pricing';
describe('API cost estimates',()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it('charges cached reads and cache writes separately and does not double-charge reasoning',()=>{
  const u=tokenUsage({input_tokens:1000,input_tokens_details:{cached_tokens:400,cache_write_tokens:100},output_tokens:200,output_tokens_details:{reasoning_tokens:150}})!;
  expect(priceTokens('gpt-6.1-sol',u)?.usd).toBe(0.00329);
  expect(u.total).toBe(1200);
 });
 it('retains unknown usage instead of reporting zero dollars',()=>{expect(tokenUsage(undefined)).toBeNull();expect(tokenUsage({input_tokens:10,input_tokens_details:{cached_tokens:11}})).toBeNull();});
 it('does not price unknown models or unsupported processing tiers',()=>{const u=tokenUsage({input_tokens:100,output_tokens:0})!;expect(priceTokens('other-model',u)).toBeNull();expect(priceTokens('gpt-6.1-sol',u,'priority')).toBeNull();});
 it('handles embedding usage and the long-context multiplier',()=>{expect(priceTokens('text-embedding-3-small',tokenUsage({total_tokens:1000})!)?.usd).toBe(0.00002);expect(priceTokens('gpt-6.1-sol',tokenUsage({input_tokens:300000,output_tokens:1000})!)?.usd).toBe(1.215);});
 it('rejects invalid rate settings rather than inventing a price',()=>{vi.stubEnv('AI_CACHED_INPUT_USD_PER_MILLION','bad');expect(priceTokens('gpt-6.1-sol',tokenUsage({input_tokens:100,output_tokens:0})!)).toBeNull();});
});
