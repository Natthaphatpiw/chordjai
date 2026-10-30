import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {z} from 'zod';
const mocks=vi.hoisted(()=>({parse:vi.fn(),embeddings:vi.fn(),query:vi.fn(),constructor:vi.fn()}));
vi.mock('openai',()=>({default:class {responses={parse:mocks.parse};embeddings={create:mocks.embeddings};constructor(options:unknown){mocks.constructor(options);}}}));
vi.mock('@chordjai/db',()=>({withSystem:async(callback:(tx:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query})}));
import {runStructured,embedTexts,hasUnsafeMedicalAdvice,GENERATIVE_MODEL} from './index.js';
describe('single-provider Responses API and bounded audit',()=>{
  beforeEach(()=>{
    vi.stubEnv('OPENAI_API_KEY','unit-test-placeholder-no-live-key');vi.stubEnv('OPENAI_MODEL',GENERATIVE_MODEL);vi.stubEnv('AI_DAILY_BUDGET_USD','5');
    mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes('ops.take_rate_limit')?[{allowed:true}]:sql.includes('select count(*)')?[{calls:'0',total:'0'}]:sql.includes('returning id')?[{id:'audit-1'}]:[],rowCount:sql.startsWith('select id from ai_ops.requests')?0:1}));
    mocks.parse.mockResolvedValue({status:'completed',model:GENERATIVE_MODEL,output_parsed:{answer:'ทดสอบ'},usage:{input_tokens:100,output_tokens:30}});
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
  it('uses exact requested model, no provider storage, typed JSON and feature deadline',async()=>{
    await expect(runStructured({userId:'test-owner',feature:'triage.assess',instructions:'safe test instructions',input:{symptoms:'private symptom text'},schema:z.object({answer:z.string()})})).resolves.toEqual({answer:'ทดสอบ'});
    expect(mocks.parse.mock.calls[0]?.[0]).toMatchObject({model:'gpt-6.1-sol',store:false,reasoning:{effort:'high'}});
    expect(mocks.parse.mock.calls[0]?.[1]).toEqual({timeout:15000});
    const sqlArguments=JSON.stringify(mocks.query.mock.calls);
    expect(sqlArguments).not.toContain('private symptom text');
    expect(sqlArguments).toContain('input_tokens');
  });
  it('refuses a model substitution before any provider call',async()=>{
    vi.stubEnv('OPENAI_MODEL','another-model');
    await expect(runStructured({userId:'test-owner',feature:'assistant.chat',instructions:'test',input:'test',schema:z.object({answer:z.string()})})).rejects.toMatchObject({code:'MODEL_CONFIG_INVALID'});
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it('does not retry or fall back after provider failure',async()=>{
    mocks.parse.mockRejectedValue(new Error('network failure with secret diagnostic'));
    await expect(runStructured({userId:'test-owner',feature:'assistant.chat',instructions:'test',schema:z.object({answer:z.string()})})).rejects.toMatchObject({code:'AI_UNAVAILABLE'});
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain('secret diagnostic');
  });
  it('blocks the budget before API request and logs only metadata',async()=>{
    mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes('ops.take_rate_limit')?[{allowed:true}]:sql.includes('select count(*)')?[{calls:'0',total:'5'}]:[],rowCount:sql.startsWith('select id from ai_ops.requests')?0:1}));
    await expect(runStructured({userId:'test-owner',feature:'assistant.chat',instructions:'test',schema:z.object({answer:z.string()})})).rejects.toMatchObject({code:'AI_BUDGET_LIMIT'});
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.query.mock.calls)).toContain('budget_blocked');
  });
  it('uses the separate text embedding model for visual descriptions only',async()=>{
    mocks.embeddings.mockResolvedValue({model:'text-embedding-3-small',usage:{total_tokens:5},data:[{index:0,embedding:[0.1,0.2]}]});
    await expect(embedTexts('test-owner',['brown dog with a white face patch'])).resolves.toEqual([[0.1,0.2]]);
    expect(mocks.embeddings.mock.calls[0]?.[0]).toMatchObject({model:'text-embedding-3-small',dimensions:1536});
    expect(mocks.embeddings.mock.calls[0]?.[1]).toEqual({timeout:10000});
  });
  it('recognises dosage or definite medical claims',()=>{
    expect(hasUnsafeMedicalAdvice('ให้ยา 5 mg')).toBe(true);
    expect(hasUnsafeMedicalAdvice('ให้ยา 0.5 มล.')).toBe(true);
    expect(hasUnsafeMedicalAdvice('น้องเป็นโรคนี้แน่นอน')).toBe(true);
    expect(hasUnsafeMedicalAdvice('ควรให้ยาปฏิชีวนะเอง')).toBe(true);
    expect(hasUnsafeMedicalAdvice('administer amoxicillin')).toBe(true);
    expect(hasUnsafeMedicalAdvice('ให้กิน amoxicillin วันละสองครั้ง')).toBe(true);
    expect(hasUnsafeMedicalAdvice('ให้ครั้งละครึ่งเม็ด')).toBe(true);
    expect(hasUnsafeMedicalAdvice('take two tablets')).toBe(true);
    expect(hasUnsafeMedicalAdvice('Give six tablets.')).toBe(true);
    expect(hasUnsafeMedicalAdvice('Administer seven drops.')).toBe(true);
    expect(hasUnsafeMedicalAdvice('Give half a tablet.')).toBe(true);
    expect(hasUnsafeMedicalAdvice('Administer a quarter of a tablet.')).toBe(true);
    expect(hasUnsafeMedicalAdvice('ควรปรึกษาสัตวแพทย์เพื่อประเมิน')).toBe(false);
  });
  it('allows routine vet plans, narrow referrals and attributed non-dosage reports',()=>{
    for(const text of [
      'วันนี้จะพาน้องพีโอนีไปหยอดหลังคอเพื่อจัดการไรหู',
      'ให้คุณหมอประเมินเรื่องยานะครับ หลังพบหมอค่อยเล่าสิ่งที่หมอบอกได้',
      'ควรให้สัตวแพทย์เลือกยา',
      'คุณเล่าว่าคุณหมอให้ยาหยอดหู แต่ยังไม่ทราบชื่อยา',
      'อย่าให้ยาเอง ควรปรึกษาสัตวแพทย์',
      'ใช้ยาตามคำแนะนำของสัตวแพทย์',
      'Do not give medicine. Ask your vet to assess the symptoms.'
    ])expect(hasUnsafeMedicalAdvice(text),text).toBe(false);
  });
  it('does not let vet attributions or harmless prefaces hide doses and appended prescriptions',()=>{
    for(const text of [
      'คุณหมอให้ยา 5 mg',
      'ให้คุณหมอประเมินเรื่องยา แล้วให้ amoxicillin เองได้',
      'อย่าให้ยาเอง แต่ให้กิน amoxicillin วันละสองครั้ง',
      'คุณหมอให้ยา แต่ฉันแนะนำให้ยา amoxicillin',
      'Do not give medicine. Administer amoxicillin instead.',
      'The owner reports the vet said give half a tablet.',
      'ให้สัตวแพทย์เลือกยา แต่น้องเป็นโรคนี้แน่นอน'
    ])expect(hasUnsafeMedicalAdvice(text),text).toBe(true);
  });
});
