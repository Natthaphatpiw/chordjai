import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@chordjai/db',()=>({withSystem:async(callback:(db:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query}),withUser:async(_id:string,callback:(db:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query})}));
import {processReminders} from './app.js';
describe('followed LINE account delivery failures are retryable',()=>{
  beforeEach(()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-10T03:00:00Z'));
    for(const name of ['LINE_CHANNEL_ACCESS_TOKEN','LINE_MESSAGING_ACCESS_TOKEN','LINE_TOKEN_EXPIRES_AT','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET'])vi.stubEnv(name,'');
    vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('A live network request is forbidden in this test');}));
    mocks.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('select r.*')?[{id:'11111111-1111-4111-8111-111111111111',user_id:'22222222-2222-4222-8222-222222222222',title:'วัคซีน',due_at:new Date('2026-10-10T04:00:00Z'),line_user_id:'Utest',followed:true}]:sql.includes('returning id,status')?[{id:'33333333-3333-4333-8333-333333333333',status:'pending'}]:[],rowCount:1}));
  });
  afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
  it('creates inbox but leaves LINE reminders unsent when token configuration is missing',async()=>{
    await expect(processReminders()).rejects.toMatchObject({code:'LINE_NOT_CONFIGURED'});
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('insert into notify.inbox'))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('update notify.reminders set sent_at'))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps an expired static token failure retryable without dropping the reminder',async()=>{
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN','test-expired');vi.stubEnv('LINE_TOKEN_EXPIRES_AT','1');
    await expect(processReminders()).rejects.toMatchObject({code:'LINE_TOKEN_EXPIRED'});
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('update notify.reminders set sent_at'))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
