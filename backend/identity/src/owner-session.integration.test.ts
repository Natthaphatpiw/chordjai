import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {withSystem,withUser,closeDatabase} from '@chordjai/db';
const provider=vi.hoisted(()=>({verify:vi.fn(),friendship:vi.fn()}));
vi.mock('@chordjai/line',()=>({verifyLineIdToken:provider.verify,verifyLineFriendship:provider.friendship}));
import app from './app';
const url=process.env.TEST_DATABASE_URL;
const isolated=!!url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('revocable returning-owner sessions on isolated PostgreSQL',()=>{
 const owner=randomUUID(),other=randomUUID(),pet=randomUUID(),attempts:string[]=[];
 const origin='https://www.chordjai.life';
 const headers={'Content-Type':'application/json',Origin:origin};
 function nonce(){const id=randomUUID();attempts.push(id);return id;}
 async function post(path:string,body:unknown,cookie?:string,requestOrigin:string|null=origin){return app.request(`/api/v1/identity/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(requestOrigin?{Origin:requestOrigin}:{}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});}
 async function login(attemptId=nonce()){const response=await post('line',{idToken:'synthetic-line-proof',remember:true,loginAttemptId:attemptId,includeBootstrap:true});const body=await response.json();return{response,data:body.data,cookie:response.headers.get('set-cookie')?.split(';')[0]??''};}
 async function me(token:string){return app.request('/api/v1/identity/me',{headers:{Authorization:`Bearer ${token}`}});}
 beforeAll(async()=>{
  vi.stubEnv('DATABASE_URL',url!);vi.stubEnv('APP_JWT_SECRET','synthetic-owner-session-signing-key-over-32-characters');vi.stubEnv('APP_ORIGIN',origin);vi.stubEnv('VERCEL','');
  await withSystem(async db=>{
   await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'Session fixture'),($3,$4,'Other fixture')",[owner,`session-${owner}`,other,`session-${other}`]);
   await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Synthetic pet','cat')",[pet,owner]);
  });
 });
 beforeEach(async()=>{
  vi.clearAllMocks();provider.verify.mockResolvedValue({lineUserId:`session-${owner}`,displayName:'Session fixture',pictureUrl:null});provider.friendship.mockResolvedValue(null);
  await withSystem(async db=>{await db.query('delete from identity.web_sessions where user_id=any($1::uuid[]) or attempt_id=any($2::uuid[])',[[owner,other],attempts]);await db.query("update identity.users set status='active',role='owner' where id=$1",[owner]);});
 });
 afterAll(async()=>{await withSystem(async db=>{await db.query('delete from identity.web_sessions where attempt_id=any($1::uuid[])',[attempts]);await db.query('delete from identity.users where id=any($1::uuid[])',[[owner,other]]);});await closeDatabase();vi.unstubAllEnvs();});
 it('issues an HttpOnly persistent cookie and scoped bootstrap without retaining plaintext credentials',async()=>{
  const signed=await login();expect(signed.response.status).toBe(200);expect(signed.data.persistent).toBe(true);expect(signed.data.bootstrap.pets.map((p:any)=>p.id)).toEqual([pet]);
  const cookie=signed.response.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Strict');expect(cookie).toContain('Max-Age=2592000');expect(cookie).not.toContain('Domain=');
  const stored=await withSystem(async db=>(await db.query('select token_hash from identity.web_sessions where user_id=$1',[owner])).rows[0]);expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);expect(signed.cookie).not.toContain(stored.token_hash);
  expect((await me(signed.data.token)).status).toBe(200);
 });
 it('restores repeatedly in one request without any LINE verification or token rotation race',async()=>{
  const signed=await login();provider.verify.mockClear();provider.friendship.mockClear();
  const results=await Promise.all(Array.from({length:5},()=>post('session/restore',{includeBootstrap:true},signed.cookie)));
  for(const response of results){expect(response.status).toBe(200);const body=await response.json();expect(body.data.bootstrap.pets).toHaveLength(1);expect(response.headers.get('set-cookie')).toBeNull();expect((await me(body.data.token)).status).toBe(200);}
  expect(provider.verify).not.toHaveBeenCalled();expect(provider.friendship).not.toHaveBeenCalled();
 });
 it('uses a Secure host-only production cookie and revokes it with the same attributes',async()=>{
  vi.stubEnv('NODE_ENV','production');
  try{const signed=await login();expect(signed.cookie).toMatch(/^__Host-chordjai_owner=/);expect(signed.response.headers.get('set-cookie')).toContain('Secure');expect((await post('session/restore',{},signed.cookie)).status).toBe(200);const ended=await post('session/logout',{},signed.cookie);expect(ended.headers.get('set-cookie')).toContain('__Host-chordjai_owner=');expect(ended.headers.get('set-cookie')).toContain('Secure');expect((await me(signed.data.token)).status).toBe(401);}finally{vi.stubEnv('NODE_ENV','test');}
 });
 it('revokes both the cookie and an already-issued access bearer on logout',async()=>{
  const signed=await login();expect((await post('session/logout',{},signed.cookie)).status).toBe(200);
  expect((await post('session/restore',{},signed.cookie)).status).toBe(401);expect((await me(signed.data.token)).status).toBe(401);
 });
 it('keeps a signed-out attempt revoked even if its LINE proof arrives later',async()=>{
  const id=nonce();expect((await post('session/logout',{loginAttemptId:id})).status).toBe(200);
  const late=await login(id);expect(late.response.status).toBe(409);expect(late.cookie).toBe('');
 });
 it('rejects absent, malformed, expired cookies and suspended or changed-role accounts',async()=>{
  expect((await post('session/restore',{})).status).toBe(401);expect((await post('session/restore',{},'chordjai_owner=made-up')).status).toBe(401);
  const signed=await login();await withSystem(db=>db.query("update identity.users set status='suspended' where id=$1",[owner]));expect((await post('session/restore',{},signed.cookie)).status).toBe(401);
  await withSystem(db=>db.query("update identity.users set status='active',role='admin' where id=$1",[owner]));expect((await post('session/restore',{},signed.cookie)).status).toBe(401);
  await withSystem(db=>db.query("update identity.users set role='owner' where id=$1",[owner]));await withSystem(db=>db.query("update identity.web_sessions set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where user_id=$1",[owner]));expect((await post('session/restore',{},signed.cookie)).status).toBe(401);
 });
 it('blocks cross-site and missing-Origin cookie operations, including sign-in cookie issuance',async()=>{
  for(const invalidOrigin of ['https://untrusted.test',null]){
   expect((await post('line',{idToken:'synthetic-proof',remember:true,loginAttemptId:nonce()},undefined,invalidOrigin)).status).toBe(403);
   expect((await post('session/restore',{},undefined,invalidOrigin)).status).toBe(403);
   expect((await post('session/logout',{loginAttemptId:nonce()},undefined,invalidOrigin)).status).toBe(403);
  }
 });
 it('keeps opaque hashes inaccessible to the application role and session checks scoped to the caller',async()=>{
  await login();const row=await withSystem(async db=>(await db.query('select id from identity.web_sessions where user_id=$1',[owner])).rows[0]);
  await expect(withUser(owner,db=>db.query('select token_hash from identity.web_sessions'))).rejects.toMatchObject({code:'42501'});
  expect(await withUser(owner,async db=>(await db.query('select identity.web_session_active($1,$2) allowed',[row.id,owner])).rows[0].allowed)).toBe(true);
  expect(await withUser(other,async db=>(await db.query('select identity.web_session_active($1,$2) allowed',[row.id,owner])).rows[0].allowed)).toBe(false);
 });
 it('bounds active devices and expires revoked receipts after the access-token window',async()=>{
  let first='',latest='';for(let index=0;index<12;index++){const signed=await login();expect(signed.response.status).toBe(200);if(index===0)first=signed.data.token;latest=signed.data.token;}
  const counts=await withSystem(async db=>(await db.query("select count(*) filter(where revoked_at is null)::int active,count(*) filter(where revoked_at is not null and expires_at<=now()+interval '1 hour')::int revoked from identity.web_sessions where user_id=$1",[owner])).rows[0]);expect(counts).toEqual({active:10,revoked:2});expect((await me(first)).status).toBe(401);expect((await me(latest)).status).toBe(200);
 });
 it('does not retain an owner cookie when the account becomes privileged',async()=>{
  const signed=await login();await withSystem(db=>db.query("update identity.users set role='admin' where id=$1",[owner]));const response=await post('line',{idToken:'synthetic-proof',remember:true,loginAttemptId:nonce()},signed.cookie);expect(response.status).toBe(200);expect((await response.json()).data.persistent).toBe(false);expect(response.headers.get('set-cookie')).toContain('Max-Age=0');expect((await post('session/restore',{},signed.cookie)).status).toBe(401);
 });
});
