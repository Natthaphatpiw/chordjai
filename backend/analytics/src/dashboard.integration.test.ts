import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,scryptSync} from 'node:crypto';
import {withSystem,closeDatabase} from '@chordjai/db';
import app from './app';
import {dashboardFilter} from './dashboard';
const url=process.env.TEST_DATABASE_URL,isolated=!!url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('operator dashboard against isolated PostgreSQL',()=>{
 const user=randomUUID(),other=randomUUID(),pet=randomUUID(),password='Isolated-test-password-only!',origin='http://localhost:3382';let cookie='';
 async function call(path:string,method='GET',body?:unknown,session=cookie,requestOrigin=origin){const r=await app.request('/api/v1/analytics/admin'+path,{method,headers:{Origin:requestOrigin,...(session?{Cookie:session}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;process.env.ADMIN_DASHBOARD_USERNAME='test-operator';const salt='a'.repeat(32);process.env.ADMIN_DASHBOARD_PASSWORD_HASH=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;process.env.ADMIN_DASHBOARD_ORIGIN=origin;
  await withSystem(async db=>{
   await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'Synthetic Operator Fixture'),($3,$4,'Synthetic Other Fixture')",[user,'dashboard-'+user,other,'dashboard-'+other]);
   await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Synthetic Mochi','cat')",[pet,user]);
   await db.query("insert into biometric.enrollments(pet_id,user_id,description,status) values($1,$2,'DO_NOT_EXPOSE_PRIVATE_SIGNATURE','ready')",[pet,user]);
   for(const date of ['2026-10-01T16:59:59Z','2026-10-01T17:00:00Z'])await db.query("insert into ai_ops.requests(user_id,feature,input_tokens,output_tokens,total_tokens,cost_usd,estimated_cost_usd,cost_basis,usage_reported,created_at) values($1,'agent.normalize',1000,200,1200,0.003,0.003,'token_estimate',true,$2)",[user,date]);
   await db.query("insert into ai_ops.requests(user_id,feature,cost_usd,cost_basis,created_at,status) values($1,'assistant.chat',0.1,'unknown','2026-10-02T00:00:00Z','error'),($1,'agent.plan',0.02,'legacy_estimate','2026-10-02T00:00:00Z','ok'),($2,'assistant.chat',0.9,'legacy_estimate','2026-10-02T00:00:00Z','ok')",[user,other]);
   await db.query("insert into analytics.events(user_id,name,created_at) values($1,'app.opened','2026-10-02T00:00:00Z'),($1,'app.opened','2026-10-02T01:00:00Z')",[user]);
  });
 });
 afterAll(async()=>{await withSystem(async db=>{await db.query('delete from identity.users where id=any($1::uuid[])',[[user,other]]);await db.query("delete from ops.dashboard_sessions where username='test-operator'");});await closeDatabase();});
 it('denies anonymous access even when user IDs are known',async()=>{expect((await call('/overview','GET',undefined,'')).status).toBe(401);expect((await call('/users/'+user,'GET',undefined,'')).status).toBe(401);});
 it('rejects cross-site logins and wrong passwords; sets HttpOnly session',async()=>{
  expect((await call('/login','POST',{username:'test-operator',password},'','https://evil.example')).status).toBe(403);
  expect((await call('/login','POST',{username:'test-operator',password:'bad'},'')).status).toBe(401);
  const result=await call('/login','POST',{username:'test-operator',password},'');expect(result.status).toBe(200);expect(result.cookie).toContain('HttpOnly');expect(result.cookie).toContain('SameSite=Strict');cookie=result.cookie!.split(';')[0]!;
 });
 it('groups on Bangkok midnight, separates financial certainty and counts distinct active users',async()=>{
  const result=await call(`/overview?from=2026-10-02&to=2026-10-02&userId=${user}`);expect(result.status).toBe(200);const d=result.body.data;
  expect(d.totals.estimatedUsd).toBe(0.003);expect(d.totals.uncertainUsd).toBe(0.1);expect(d.totals.legacyUsd).toBe(0.02);expect(d.totals.activeUsers).toBe(1);expect(d.totals.appOpens).toBe(2);expect(d.series).toHaveLength(1);expect(d.series[0].requests).toBe(3);
  const monthly=await call(`/overview?from=2026-10-01&to=2026-10-31&group=month&userId=${user}`);expect(monthly.body.data.series[0].estimatedUsd).toBe(0.006);
  const year=await call(`/overview?from=2026-01-01&to=2026-12-31&group=year&userId=${user}`);expect(year.body.data.series).toHaveLength(1);
 });
 it('searches pets, excludes private descriptions and filters requests by user/feature',async()=>{
  const result=await call('/users?from=2026-10-01&to=2026-10-31&search=Synthetic%20Mochi');expect(result.status).toBe(200);expect(result.body.data.items).toHaveLength(1);expect(result.body.data.items[0].pets).toHaveLength(1);expect(result.body.data.items[0].aiRequests).toBe(4);expect(JSON.stringify(result.body)).not.toContain('DO_NOT_EXPOSE');
  const detail=await call(`/users/${user}?from=2026-10-01&to=2026-10-31`);expect(detail.status).toBe(200);expect(detail.body.data.user.id).toBe(user);
  const requests=await call(`/requests?from=2026-10-01&to=2026-10-31&userId=${user}&feature=agent.normalize`);expect(requests.body.data.total).toBe(2);expect(requests.body.data.items.every((r:any)=>r.userId===user)).toBe(true);
 });
 it('validates ranges and revokes sessions on logout',async()=>{expect(()=>dashboardFilter({from:'2026-02-30'})).toThrow();expect((await call('/overview?from=2026-11-01&to=2026-10-01')).status).toBe(400);expect((await call('/logout','POST',{})).status).toBe(200);expect((await call('/session')).status).toBe(401);});
 it('blocks repeated password attempts globally across instances',async()=>{let last;for(let i=0;i<11;i++)last=await call('/login','POST',{username:'locked-test-user',password:'wrong'},'');expect(last!.status).toBe(429);});
});
