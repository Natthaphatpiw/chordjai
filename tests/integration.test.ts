import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { signSession } from '@chordjai/auth';
import { withSystem,closeDatabase } from '@chordjai/db';
import petApp from '../backend/pet/src/app';
import healthApp from '../backend/health/src/app';
import journalApp from '../backend/journal/src/app';
import assistantApp from '../backend/assistant/src/app';
import clinicApp from '../backend/clinic/src/app';
import shareApp from '../backend/share/src/app';
import lostApp from '../backend/lostfound/src/app';
import analyticsApp from '../backend/analytics/src/app';
import identityApp from '../backend/identity/src/app';
import triageApp from '../backend/triage/src/app';
import mediaApp from '../backend/media/src/app';
import schedulerApp,{cleanupExpiredData} from '../backend/scheduler/src/app';
import type { Hono } from 'hono';
import type { ServiceEnv } from '@chordjai/service-kit';
const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!isolated)('real isolated Postgres HTTP contracts and privacy',()=>{
  const owner=randomUUID(),stranger=randomUUID(),viewer=randomUUID(),staff=randomUUID();
  let ownerToken='',strangerToken='',viewerToken='',staffToken='',petId='',clinicId='',linkId='',shareToken='',pageId='';
  async function call(app:Hono<ServiceEnv>,path:string,token?:string,method='GET',body?:unknown,key?:string,language?:string){
    const response=await app.request(path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{}),...(language?{'Accept-Language':language}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json(),replayed:response.headers.get('Idempotency-Replayed')};
  }
  beforeAll(async()=>{
    process.env.DATABASE_URL=testUrl;process.env.APP_JWT_SECRET='test-only-secret-at-least-32-characters';process.env.APP_JWT_ISSUER='https://www.chordjai.life';delete process.env.OPENAI_API_KEY;
    await withSystem(async db=>{
      for(const id of [owner,stranger,viewer,staff])await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'HTTP Test')",[id,`test-${id}`]);
      clinicId=(await db.query("INSERT INTO clinic.clinics(name,verified_at) VALUES('Test Clinic',now()) RETURNING id")).rows[0].id;
      await db.query("INSERT INTO clinic.members(clinic_id,user_id,role) VALUES($1,$2,'staff')",[clinicId,staff]);
    });
    [ownerToken,strangerToken,viewerToken,staffToken]=await Promise.all([owner,stranger,viewer,staff].map(id=>signSession({id,role:'owner'})));
  });
  afterAll(async()=>{await withSystem(async db=>{await db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[[owner,stranger,viewer,staff]]);await db.query('DELETE FROM clinic.clinics WHERE id=$1',[clinicId]);});await closeDatabase();});
  it('rejects unauthenticated writes',async()=>expect((await call(petApp,'/api/v1/pets',undefined,'POST',{name:'Milo',species:'cat'})).status).toBe(401));
  it('creates a pet once when a request is retried',async()=>{
    const key=randomUUID(),body={name:'Milo',species:'cat',weightKg:4.5,neutered:true};
    const a=await call(petApp,'/api/v1/pets',ownerToken,'POST',body,key);expect(a.status).toBe(201);petId=a.body.data.id;expect(a.body.data.weightKg).toBe(4.5);expect(a.body.data.neutered).toBe(true);
    const b=await call(petApp,'/api/v1/pets',ownerToken,'POST',body,key);expect(b.body.data.id).toBe(petId);expect(b.replayed).toBe('true');
    expect((await call(petApp,'/api/v1/pets',ownerToken,'POST',{...body,name:'Other'},key)).status).toBe(409);
  });
  it('hides pets from another account and honors viewer reads',async()=>{
    expect((await call(petApp,`/api/v1/pets/${petId}`,strangerToken)).status).toBe(404);
    await withSystem(db=>db.query("INSERT INTO pet.members(pet_id,user_id,role) VALUES($1,$2,'viewer')",[petId,viewer]));
    expect((await call(petApp,`/api/v1/pets/${petId}`,viewerToken)).status).toBe(200);
    expect((await call(petApp,`/api/v1/pets/${petId}`,viewerToken,'PATCH',{name:'Hacked'})).status).toBe(404);
  });
  it('persists health and reminder atomically while denying viewer write',async()=>{
    const data={petId,kind:'vaccine',title:'Vet-entered vaccine',recordedAt:new Date().toISOString(),nextDueAt:new Date(Date.now()+86400000).toISOString()};
    expect((await call(healthApp,'/api/v1/health/records',viewerToken,'POST',data)).status).toBe(403);
    const record=await call(healthApp,'/api/v1/health/records',ownerToken,'POST',data);expect(record.status).toBe(201);
    const reminders=await withSystem(async db=>(await db.query('SELECT id FROM notify.reminders WHERE dedupe_key=$1',[`health:${record.body.data.id}`])).rows);expect(reminders).toHaveLength(1);
  });
  it('does not claim an invitation changed the role of an existing member',async()=>{
    const invitation=await call(petApp,`/api/v1/pets/${petId}/invitations`,ownerToken,'POST',{role:'carer'});expect(invitation.status).toBe(201);
    const token=new URL(invitation.body.data.url).pathname.split('/').pop();
    const accepted=await call(petApp,`/api/v1/invitations/${token}/accept`,viewerToken,'POST');expect(accepted.status).toBe(409);expect(accepted.body.error.code).toBe('ALREADY_MEMBER');
    const role=await withSystem(async db=>(await db.query('SELECT role FROM pet.members WHERE pet_id=$1 AND user_id=$2',[petId,viewer])).rows[0].role);expect(role).toBe('viewer');
  });
  it('protects optimistic journal edits from overwrite and cross-account access',async()=>{
    const theme={background:'#FFF9F1',font:'sans',accent:'#CC6D3D'};
    const created=await call(journalApp,'/api/v1/journal/pages',ownerToken,'POST',{petId,title:'Journal',theme,elements:[]});expect(created.status).toBe(201);pageId=created.body.data.id;
    expect((await call(journalApp,`/api/v1/journal/pages/${pageId}`,ownerToken,'PATCH',{title:'Changed',theme,elements:[],version:1})).status).toBe(200);
    expect((await call(journalApp,`/api/v1/journal/pages/${pageId}`,ownerToken,'PATCH',{title:'Lost edit',theme,elements:[],version:1})).status).toBe(409);
    expect((await call(journalApp,`/api/v1/journal/pages/${pageId}`,strangerToken)).status).toBe(404);
  });
  it('fails AI explicitly without a key and does not auto-save a decoration',async()=>{
    const result=await call(journalApp,'/api/v1/journal/decorate',ownerToken,'POST',{pageId,prompt:'soft yellow'});expect(result.status).toBe(503);expect(result.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect((await call(journalApp,`/api/v1/journal/pages/${pageId}`,ownerToken)).body.data.title).toBe('Changed');
  });
  it('maintains opt-in memory consent and isolates remembered facts',async()=>{
    expect((await call(assistantApp,'/api/v1/assistant/preferences',ownerToken,'PATCH',{memoryEnabled:true,assistantName:'Buddy',tone:'warm',aboutUser:'Likes cats'})).status).toBe(200);
    const created=await call(assistantApp,'/api/v1/assistant/memories',ownerToken,'POST',{content:'Milo prefers quiet rooms',kind:'preference',petId});expect(created.status).toBe(201);
    expect((await call(assistantApp,'/api/v1/assistant/memories',strangerToken)).body.data).toHaveLength(0);
    expect((await call(identityApp,'/api/v1/identity/consents',ownerToken,'POST',{purpose:'ai_memory',granted:false})).status).toBe(200);
    const pref=await call(assistantApp,'/api/v1/assistant/preferences',ownerToken);expect(pref.body.data.memoryEnabled).toBe(false);
  });
  it('shares a private snapshot by capability and revokes immediately',async()=>{
    const a=await call(shareApp,'/api/v1/share/links',ownerToken,'POST',{petId});expect(a.status).toBe(201);linkId=a.body.data.id;shareToken=a.body.data.token;
    expect((await call(shareApp,`/api/v1/share/public/${shareToken}`)).body.data.pet.name).toBe('Milo');
    expect((await call(shareApp,`/api/v1/share/links/${linkId}`,strangerToken,'DELETE')).status).toBe(404);
    expect((await call(shareApp,`/api/v1/share/links/${linkId}`,ownerToken,'DELETE')).status).toBe(200);
    expect((await call(shareApp,`/api/v1/share/public/${shareToken}`)).status).toBe(410);
  });
  it('records appointment then enforces staff actions and live clinic grants',async()=>{
    const memberships=await call(clinicApp,'/api/v1/clinic/memberships',staffToken);expect(memberships.body.data[0].clinicId).toBe(clinicId);
    const a=await call(clinicApp,'/api/v1/clinic/appointments',ownerToken,'POST',{petId,clinicId,requestedAt:new Date(Date.now()+86400000).toISOString(),reason:'Checkup'});expect(a.status).toBe(201);
    expect((await call(clinicApp,`/api/v1/clinic/appointments/${a.body.data.id}`,ownerToken,'PATCH',{status:'accepted'})).status).toBe(403);
    expect((await call(clinicApp,`/api/v1/clinic/appointments/${a.body.data.id}`,staffToken,'PATCH',{status:'accepted'})).status).toBe(200);
    expect((await call(clinicApp,`/api/v1/clinic/pets/${petId}/summary`,staffToken)).status).toBe(403);
    const g=await call(clinicApp,'/api/v1/clinic/grants',ownerToken,'POST',{petId,clinicId,scopes:['summary.read']});expect(g.status).toBe(201);
    expect((await call(clinicApp,`/api/v1/clinic/pets/${petId}/summary`,staffToken)).status).toBe(200);
    await call(clinicApp,`/api/v1/clinic/grants/${g.body.data.id}`,ownerToken,'DELETE');
    expect((await call(clinicApp,`/api/v1/clinic/pets/${petId}/summary`,staffToken)).status).toBe(403);
  });
  it('accepts anonymous lost tips and hides closed case immediately',async()=>{
    const a=await call(lostApp,'/api/v1/lostfound/cases',ownerToken,'POST',{petId,description:'Orange cat',district:'Bang Rak'});expect(a.status).toBe(201);const slug=a.body.data.publicSlug;
    const publicCase=await call(lostApp,`/api/v1/lostfound/public/${slug}`);expect(publicCase.body.data.ownerId).toBeUndefined();
    expect((await call(lostApp,`/api/v1/lostfound/public/${slug}/tips`,undefined,'POST',{content:'Seen near park'})).status).toBe(201);
    await call(lostApp,`/api/v1/lostfound/cases/${a.body.data.id}`,ownerToken,'PATCH',{status:'resolved'});
    expect((await call(lostApp,`/api/v1/lostfound/public/${slug}`)).status).toBe(404);
  });
  it('returns emergency rules immediately without configured AI',async()=>{
    const result=await call(triageApp,'/api/v1/triage/sessions',ownerToken,'POST',{petId,symptoms:'difficulty breathing',answers:{difficultyBreathing:true}},undefined,'en');expect(result.status).toBeLessThan(300);expect(result.body.data.severity).toBe(3);
    expect(JSON.stringify(result.body.data)).not.toMatch(/[\u0e00-\u0e7f]/);
    expect(result.body.data.title).toBe('Go to an animal hospital immediately');
    const followups=await call(triageApp,'/api/v1/triage/followups',ownerToken);expect(followups.body.data).toHaveLength(1);
    const answered=await call(triageApp,`/api/v1/triage/followups/${followups.body.data[0].id}`,ownerToken,'PATCH',{improved:false},undefined,'en');expect(answered.status).toBe(200);
    expect(answered.body.data.recommendation).not.toMatch(/[\u0e00-\u0e7f]/);
  });
  it('enqueues private image erasure atomically and leaves cleanup after pet deletion',async()=>{
    const created=await call(petApp,'/api/v1/pets',ownerToken,'POST',{name:'For erasure',species:'dog'});expect(created.status).toBe(201);const disposable=created.body.data.id,mediaId=randomUUID();
    await withSystem(db=>db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',20,'ready')",[mediaId,owner,disposable,`u/${owner}/${mediaId}.jpg`]));
    expect((await call(mediaApp,`/api/v1/media/${mediaId}`,strangerToken,'DELETE')).status).toBe(404);
    expect((await call(mediaApp,`/api/v1/media/${mediaId}`,ownerToken,'DELETE')).status).toBe(200);
    expect((await call(petApp,`/api/v1/pets/${disposable}`,ownerToken,'DELETE')).status).toBe(200);
    const jobs=await withSystem(async db=>(await db.query('SELECT topic,created_by FROM ops.jobs WHERE dedupe_key=$1',[`media-delete:${mediaId}`])).rows);expect(jobs).toHaveLength(1);expect(jobs[0].topic).toBe('media.delete');expect(jobs[0].created_by).toBeNull();
  });
  it('denies admin metrics and immediately invalidates suspended account JWT',async()=>{
    expect((await call(analyticsApp,'/api/v1/analytics/kpis',ownerToken)).status).toBe(403);
    await withSystem(db=>db.query("UPDATE identity.users SET status='suspended' WHERE id=$1",[stranger]));
    expect((await call(petApp,'/api/v1/pets',strangerToken)).status).toBe(401);
  });
  it('removes expired sensitive webhook data without exposing a cron to account tokens',async()=>{
    expect((await call(schedulerApp,'/internal/cron/jobs',ownerToken)).status).toBe(401);
    const old=`old-${randomUUID()}`,recent=`recent-${randomUUID()}`;
    await withSystem(async db=>{
      await db.query("INSERT INTO notify.webhook_events(event_id,event_type,payload,received_at) VALUES($1,'message','{}',now()-interval '8 days'),($2,'message','{}',now())",[old,recent]);
      await db.query("INSERT INTO ops.rate_limits(scope,key,window_started_at,expires_at) VALUES($1,'expired',now(),now()-interval '1 day')",[old]);
    });
    const result=await cleanupExpiredData();expect(result.expiredWebhooks).toBeGreaterThan(0);
    await withSystem(async db=>{
      expect((await db.query('SELECT event_id FROM notify.webhook_events WHERE event_id=ANY($1)',[[old,recent]])).rows.map(row=>row.event_id)).toEqual([recent]);
      expect((await db.query('SELECT key FROM ops.rate_limits WHERE scope=$1',[old])).rows).toHaveLength(0);
      await db.query('DELETE FROM notify.webhook_events WHERE event_id=$1',[recent]);
    });
  });
});
