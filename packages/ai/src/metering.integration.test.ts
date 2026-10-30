import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {withSystem,closeDatabase} from '@chordjai/db';
const provider=vi.hoisted(()=>({parse:vi.fn(),embeddings:vi.fn()}));
vi.mock('openai',()=>({default:class{responses={parse:provider.parse};embeddings={create:provider.embeddings};}}));
import {runStructured,embedTexts} from './index';
const url=process.env.TEST_DATABASE_URL,isolated=!!url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('provider usage persisted without live API requests',()=>{
 const user=randomUUID();const options={userId:user,feature:'assistant.chat' as const,instructions:'Synthetic instructions',input:'PRIVATE_CANARY_PROMPT',schema:z.object({answer:z.string()})};
 beforeAll(async()=>{process.env.DATABASE_URL=url;process.env.OPENAI_API_KEY='synthetic-unit-test-only';process.env.AI_DAILY_BUDGET_USD='5';await withSystem(db=>db.query("insert into identity.users(id,line_user_id) values($1,$2)",[user,'metering-'+user]));});
 afterAll(async()=>{await withSystem(db=>db.query('delete from identity.users where id=$1',[user]));await closeDatabase();delete process.env.OPENAI_API_KEY;delete process.env.AI_USER_DAILY_BUDGET_USD;});
 async function latest(){return withSystem(async db=>(await db.query('select * from ai_ops.requests where user_id=$1 order by created_at desc',[user])).rows[0]);}
 it('persists actual usage, cache-write price snapshot and IDs without prompts',async()=>{
  provider.parse.mockResolvedValue({id:'resp_synthetic',_request_id:'req_synthetic',status:'completed',model:'gpt-6.1-sol',service_tier:'default',output_parsed:{answer:'Synthetic output'},usage:{input_tokens:1000,input_tokens_details:{cached_tokens:400,cache_write_tokens:100},output_tokens:200,output_tokens_details:{reasoning_tokens:150},total_tokens:1200}});
  await runStructured(options);const row=await latest();expect(row.estimated_cost_usd).toBe(0.00329);expect(row.cached_input_tokens).toBe(400);expect(row.cache_write_tokens).toBe(100);expect(row.reasoning_tokens).toBe(150);expect(row.cost_basis).toBe('token_estimate');expect(row.usage_reported).toBe(true);expect(row.provider_response_id).toBe('resp_synthetic');expect(JSON.stringify(row)).not.toContain('PRIVATE_CANARY');
 });
 it('keeps usage when the response is billed but output validation fails',async()=>{provider.parse.mockResolvedValue({status:'incomplete',model:'gpt-6.1-sol',output_parsed:null,usage:{input_tokens:100,output_tokens:40}});await expect(runStructured(options)).rejects.toMatchObject({code:'AI_INVALID_OUTPUT'});const row=await latest();expect(row.status).toBe('error');expect(row.cost_basis).toBe('token_estimate');expect(row.estimated_cost_usd).toBe(0.0006);});
 it('retains uncertain reservation after transport failure, not a false zero invoice',async()=>{provider.parse.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'));await expect(runStructured(options)).rejects.toMatchObject({code:'AI_UNAVAILABLE'});const row=await latest();expect(row.cost_basis).toBe('unknown');expect(row.estimated_cost_usd).toBeNull();expect(row.cost_usd).toBeGreaterThan(0);expect(row.usage_reported).toBe(false);expect(JSON.stringify(row)).not.toContain('PRIVATE_PROVIDER_ERROR');});
 it('meters embedding calls independently',async()=>{provider.embeddings.mockResolvedValue({model:'text-embedding-3-small',usage:{total_tokens:500},data:[{index:0,embedding:[1,2]}]});await embedTexts(user,['Synthetic pet description']);const row=await latest();expect(row.feature).toBe('embed.petid');expect(row.estimated_cost_usd).toBe(0.00001);expect(row.input_tokens).toBe(500);});
 it('blocks before calling the provider when per-user exposure exceeds its cap',async()=>{process.env.AI_USER_DAILY_BUDGET_USD='0.000001';const before=provider.parse.mock.calls.length;await expect(runStructured(options)).rejects.toMatchObject({code:'AI_USER_BUDGET_LIMIT'});expect(provider.parse.mock.calls).toHaveLength(before);const row=await latest();expect(row.cost_basis).toBe('not_sent');expect(row.cost_usd).toBe(0);});
});
