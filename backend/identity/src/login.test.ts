import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),friendship:vi.fn(),idToken:vi.fn()}));
vi.mock('@chordjai/db',()=>({withSystem:async(callback:(db:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query}),withUser:async(_id:string,callback:(db:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query})}));
vi.mock('@chordjai/line',()=>({verifyLineIdToken:mocks.idToken,verifyLineFriendship:mocks.friendship}));
import app from './app.js';
describe('LINE identity friendship reconciliation',()=>{
  beforeEach(()=>{
    vi.stubEnv('APP_JWT_SECRET','unit-test-session-secret-at-least-32-characters');
    mocks.idToken.mockResolvedValue({lineUserId:'Uverified',displayName:'ผู้ดูแล',pictureUrl:null});
    mocks.friendship.mockResolvedValue(null);
    mocks.query.mockResolvedValue({rows:[{id:'11111111-1111-4111-8111-111111111111',display_name:'ผู้ดูแล',role:'owner',status:'active'}],rowCount:1});
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
  const login=(body:unknown)=>app.request('/api/v1/identity/line',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  it('absent or unverified optional access token never resets known webhook friendship',async()=>{
    expect((await login({idToken:'test-placeholder'})).status).toBe(200);expect(mocks.friendship).not.toHaveBeenCalled();
    expect((await login({idToken:'test-placeholder',accessToken:'test-unverified-access-token',friendFlag:false})).status).toBe(200);
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('notify.line_accounts'))).toBe(false);
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain('test-unverified-access-token');
  });
  it('saves only server-verified friendship and protects newer webhook updates',async()=>{
    mocks.friendship.mockResolvedValue(true);expect((await login({idToken:'test-placeholder',accessToken:'test-verified-access-token',friendFlag:false})).status).toBe(200);
    const sync=mocks.query.mock.calls.find(([sql])=>sql.includes('notify.line_accounts'))!;
    expect(sync[1][1]).toBe(true);expect(sync[0]).toContain('where notify.line_accounts.updated_at<=$3');
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain('test-verified-access-token');
  });
});
