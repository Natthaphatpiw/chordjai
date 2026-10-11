import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withSystem,withUser,closeDatabase,careSummary} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import type {Hono} from 'hono';
import type {ServiceEnv} from '@chordjai/service-kit';
import app from './app';
import clinic from '../../clinic/src/app';
import share from '../../share/src/app';
import identity from '../../identity/src/app';
const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!isolated)('care diary persistence, sharing and erasure in isolated PostgreSQL',()=>{
  const owner=randomUUID(),carer=randomUUID(),viewer=randomUUID(),stranger=randomUUID(),staff=randomUUID(),pet=randomUUID(),otherPet=randomUUID(),clinicId=randomUUID();
  const photos=Array.from({length:5},()=>randomUUID()),wrongPhoto=randomUUID(),erasedPhoto=randomUUID();
  const tokens=new Map<string,string>();let entryId='',episodeId='',carerEntryId='',legacyGrantId='',careGrantId='',costSnapshotToken='';
  async function call(service:Hono<ServiceEnv>,path:string,user:string=owner,method='GET',body?:unknown,key?:string){
    const res=await service.request(path,{method,headers:{...(user?{Authorization:`Bearer ${tokens.get(user)}`}:{}) ,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return{status:res.status,body:await res.json()};
  }
  function entry(overrides:Record<string,unknown>={}){return{petId:pet,clientEntryId:randomUUID(),kind:'symptom',title:'Cough observed',observedAt:'2026-01-01T08:00:00+07:00',narrative:'PRIVATE_NARRATIVE_SENTINEL',reflection:'AUTHOR_REFLECTION_SENTINEL',clinicalNote:'Coughed twice after a walk; breathing appeared usual.',observations:{symptoms:['Cough'],severity:'mild',appetite:'normal',energy:'normal',trend:'new'},visit:null,costs:[{label:'Consultation',amountMinor:125050,currency:'THB',kind:'paid'},{label:'Quoted test',amountMinor:30000,currency:'USD',kind:'estimate'}],mediaIds:[],shareWithClinic:false,shareCosts:false,...overrides};}
  beforeAll(async()=>{
    process.env.DATABASE_URL=testUrl;process.env.APP_JWT_SECRET='isolated-care-test-secret-at-least-32-characters';process.env.APP_JWT_ISSUER='https://www.chordjai.life';delete process.env.OPENAI_API_KEY;
    await withSystem(async db=>{
      for(const id of [owner,carer,viewer,stranger,staff])await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'Care Fixture')",[id,`care-test-${id}`]);
      for(const id of [pet,otherPet])await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Care Fixture Pet','dog')",[id,owner]);
      for(const[user,role]of [[carer,'carer'],[viewer,'viewer']])await db.query('INSERT INTO pet.members(pet_id,user_id,role) VALUES($1,$2,$3)',[pet,user,role]);
      await db.query("INSERT INTO clinic.clinics(id,name,verified_at) VALUES($1,'Care Clinic',now())",[clinicId]);await db.query("INSERT INTO clinic.members(clinic_id,user_id,role) VALUES($1,$2,'staff')",[clinicId,staff]);
      for(const id of photos)await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',20,'ready')",[id,owner,pet,`u/${owner}/${id}.jpg`]);
      for(const[id,petId,status]of [[wrongPhoto,otherPet,'ready'],[erasedPhoto,pet,'deleted']])await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',20,$5)",[id,owner,petId,`u/${owner}/${id}.jpg`,status]);
    });
    for(const user of [owner,carer,viewer,stranger,staff])tokens.set(user,await signSession({id:user,role:'owner'}));
  });
  afterAll(async()=>{await withSystem(async db=>{await db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[[owner,carer,viewer,stranger,staff]]);await db.query('DELETE FROM clinic.clinics WHERE id=$1',[clinicId]);});await closeDatabase();});
  it('creates one ordered five-photo entry with exact separate paid/estimate costs and owner attribution',async()=>{
    const result=await call(app,'/api/v1/health/care/entries',owner,'POST',entry({mediaIds:photos}));expect(result.status).toBe(201);entryId=result.body.data.id;
    expect(result.body.data.mediaIds).toEqual(photos);expect(result.body.data.photos).toHaveLength(5);expect(result.body.data.costs.map((cost:{amountMinor:number})=>cost.amountMinor)).toEqual([125050,30000]);expect(result.body.data.provenance).toBe('owner_reported');expect(result.body.data.canEdit).toBe(true);expect(result.body.data.reflection).toBe('AUTHOR_REFLECTION_SENTINEL');expect(result.body.data.createHash).toBeUndefined();
  });
  it('family viewers can read the diary and costs but never private reflections or edit flags',async()=>{
    const result=await call(app,`/api/v1/health/care/entries?petId=${pet}`,viewer);expect(result.status).toBe(200);const item=result.body.data.find((value:{id:string})=>value.id===entryId);expect(item.narrative).toBe('PRIVATE_NARRATIVE_SENTINEL');expect(item.reflection).toBe('');expect(item.canEditReflection).toBe(false);expect(item.canEdit).toBe(false);expect(item.costs).toHaveLength(2);
    expect(await withUser(viewer,async db=>(await db.query('SELECT * FROM health.care_reflections WHERE entry_id=$1',[entryId])).rows)).toEqual([]);
  });
  it('strangers and clinic staff cannot read raw diary tables; viewer and outsider creates fail',async()=>{
    for(const user of [stranger,staff])expect((await call(app,`/api/v1/health/care/entries?petId=${pet}`,user)).status).toBe(404);
    for(const user of [viewer,stranger,staff])expect((await call(app,'/api/v1/health/care/entries',user,'POST',entry())).status).toBe(403);
    for(const table of ['care_entries','care_episodes','care_costs','care_reflections','care_media'])expect(await withUser(staff,async db=>(await db.query(`SELECT * FROM health.${table}`)).rows)).toEqual([]);
  });
  it('database guards independently prevent actor reassignment, false provenance and forged reflections',async()=>{
    await expect(withUser(owner,db=>db.query('UPDATE health.care_entries SET created_by=$2 WHERE id=$1',[entryId,carer]))).rejects.toMatchObject({code:'42501'});
    await expect(withUser(owner,db=>db.query("UPDATE health.care_entries SET provenance='vet_verified' WHERE id=$1",[entryId]))).rejects.toMatchObject({code:'42501'});
    await expect(withUser(viewer,db=>db.query("INSERT INTO health.care_reflections(entry_id,author_id,content) VALUES($1,$2,'FORGED') ON CONFLICT(entry_id) DO UPDATE SET author_id=$2,content='FORGED'",[entryId,viewer]))).rejects.toMatchObject({code:'42501'});
    const forced=await withSystem(async db=>(await db.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='health' AND c.relname=ANY($1::text[]) AND c.relrowsecurity AND c.relforcerowsecurity",[['care_entries','care_episodes','care_costs','care_reflections','care_media']])).rows[0].count);expect(forced).toBe(5);
  });
  it('rejects wrong-pet, unavailable and copied foreign-author photos before persistence',async()=>{
    for(const mediaIds of [[wrongPhoto],[erasedPhoto],photos.slice(0,1)]){
      const result=await call(app,'/api/v1/health/care/entries',mediaIds[0]===photos[0]?carer:owner,'POST',entry({mediaIds}));expect(result.status).toBe(403);expect(result.body.error.code).toBe('IMAGE_PET_MISMATCH');
    }
  });
  it('domain client IDs deduplicate after middleware cache loss and concurrent different HTTP keys',async()=>{
    const body=entry(),first=await call(app,'/api/v1/health/care/entries',owner,'POST',body,randomUUID());expect(first.status).toBe(201);await withSystem(db=>db.query('DELETE FROM ops.idempotency WHERE user_id=$1',[owner]));
    const concurrent=await Promise.all(Array.from({length:2},()=>call(app,'/api/v1/health/care/entries',owner,'POST',body,randomUUID())));for(const result of concurrent){expect(result.status).toBe(201);expect(result.body.data.id).toBe(first.body.data.id);}expect(await withSystem(async db=>(await db.query('SELECT id FROM health.care_entries WHERE created_by=$1 AND client_entry_id=$2',[owner,body.clientEntryId])).rowCount)).toBe(1);
    const changed=await call(app,'/api/v1/health/care/entries',owner,'POST',{...body,title:'Changed request'},randomUUID());expect(changed.status).toBe(409);expect(changed.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('creates an episode idempotently and prevents linking another pet episode',async()=>{
    const body={petId:pet,clientEpisodeId:randomUUID(),title:'Cough follow-up',startedAt:'2026-01-01T08:00:00+07:00'};
    const [first,retry]=await Promise.all([call(app,'/api/v1/health/care/episodes',owner,'POST',body),call(app,'/api/v1/health/care/episodes',owner,'POST',body)]);expect(first.status).toBe(201);expect(retry.body.data.id).toBe(first.body.data.id);episodeId=first.body.data.id;
    const bad=await call(app,'/api/v1/health/care/entries',owner,'POST',entry({petId:otherPet,episodeId}));expect(bad.status).toBe(400);expect(bad.body.error.code).toBe('CARE_EPISODE_MISMATCH');
  });
  it('keyset pages preserve same-timestamp entries exactly once and isolate pets and episodes',async()=>{
    const pagePet=randomUUID(),ids=Array.from({length:8},()=>randomUUID()),episodes=Array.from({length:8},()=>randomUUID()),date='2026-01-03T08:00:00+07:00';
    await withSystem(async db=>{
      await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Pagination Fixture','dog')",[pagePet,owner]);
      for(const[index,id]of episodes.entries())await db.query("INSERT INTO health.care_episodes(id,pet_id,created_by,client_episode_id,create_hash,title,started_at,status) VALUES($1,$2,$3,$4,repeat('a',64),'Repeated timestamp episode',$5,$6)",[id,pagePet,owner,randomUUID(),date,index===0?'resolved':index===1?'improving':'ongoing']);
      for(const[index,id]of ids.entries())await db.query("INSERT INTO health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,episode_id,kind,title,observed_at) VALUES($1,$2,$3,$4,repeat('a',64),$5,'daily','Repeated timestamp entry',$6)",[id,pagePet,owner,randomUUID(),episodes[index%2],date]);
      await db.query("INSERT INTO health.care_entries(pet_id,created_by,client_entry_id,create_hash,kind,title,observed_at) VALUES($1,$2,$3,repeat('b',64),'daily','Different pet must stay out',$4)",[otherPet,owner,randomUUID(),date]);
    });
    async function collect(kind:'entries'|'episodes',query=''){
      const result:string[]=[];let cursor='';
      for(let step=0;step<5;step++){
        const page=await call(app,`/api/v1/health/care/${kind}?petId=${pagePet}&limit=3${query}${cursor}`);expect(page.status).toBe(200);expect(page.body.data.length).toBeLessThanOrEqual(3);result.push(...page.body.data.map((item:{id:string})=>item.id));
        if(!page.body.data.length)break;const last=page.body.data.at(-1);cursor=`&before=${encodeURIComponent(kind==='entries'?last.observedAt:last.startedAt)}&beforeId=${last.id}`;
      }return result;
    }
    expect(await collect('entries')).toEqual([...ids].sort().reverse());expect(await collect('episodes')).toEqual([...episodes].sort().reverse());expect(await collect('episodes','&status=active')).toEqual(episodes.slice(1).sort().reverse());
    const scoped=await call(app,`/api/v1/health/care/entries?petId=${pagePet}&episodeId=${episodes[0]}`);expect(scoped.body.data.map((item:{id:string})=>item.id).sort()).toEqual(ids.filter((_,index)=>index%2===0).sort());
    for(const suffix of ['&limit=0','&limit=201','&limit=1.5',`&before=${encodeURIComponent(date)}`,'&beforeId=bad','&before=&beforeId=',`&before=2026-01-03&beforeId=${ids[0]}`])expect((await call(app,`/api/v1/health/care/entries?petId=${pagePet}${suffix}`)).status).toBe(400);
    expect((await call(app,`/api/v1/health/care/episodes?petId=${pagePet}&status=unknown`)).status).toBe(400);
    await withSystem(db=>db.query('DELETE FROM pet.pets WHERE id=$1',[pagePet]));
  });
  it('keeps PostgreSQL microseconds in both cursors so neighboring observations are not skipped',async()=>{
    const pagePet=randomUUID(),entryIds=Array.from({length:3},()=>randomUUID()),episodeIds=Array.from({length:3},()=>randomUUID()),fractions=['000900','000800','000700'];
    await withSystem(async db=>{
      await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Microsecond Fixture','dog')",[pagePet,owner]);
      for(const[index,id]of episodeIds.entries())await db.query("INSERT INTO health.care_episodes(id,pet_id,created_by,client_episode_id,create_hash,title,started_at) VALUES($1,$2,$3,$4,repeat('a',64),'Microsecond episode',$5)",[id,pagePet,owner,randomUUID(),`2026-01-04T08:00:00.${fractions[index]}+07:00`]);
      for(const[index,id]of entryIds.entries())await db.query("INSERT INTO health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,kind,title,observed_at) VALUES($1,$2,$3,$4,repeat('a',64),'daily','Microsecond entry',$5)",[id,pagePet,owner,randomUUID(),`2026-01-04T08:00:00.${fractions[index]}+07:00`]);
    });
    try{
      for(const[kind,field,ids]of [['entries','observedAt',entryIds],['episodes','startedAt',episodeIds]] as const){
        const first=await call(app,`/api/v1/health/care/${kind}?petId=${pagePet}&limit=2`);expect(first.status).toBe(200);expect(first.body.data.map((item:{id:string})=>item.id)).toEqual(ids.slice(0,2));
        const last=first.body.data.at(-1),second=await call(app,`/api/v1/health/care/${kind}?petId=${pagePet}&limit=2&before=${encodeURIComponent(last[field])}&beforeId=${last.id}`);
        expect(second.status).toBe(200);expect(second.body.data.map((item:{id:string})=>item.id)).toEqual(ids.slice(2));expect(last[field]).toBe('2026-01-04T01:00:00.000800Z');
      }
      const posted=await call(app,'/api/v1/health/care/entries',owner,'POST',entry({petId:pagePet,observedAt:'2026-01-04T08:00:01.123456+07:00'}));expect(posted.status).toBe(201);expect(posted.body.data.observedAt).toBe('2026-01-04T01:00:01.123456Z');
      expect((await call(app,`/api/v1/health/care/entries/${posted.body.data.id}`)).body.data.observedAt).toBe('2026-01-04T01:00:01.123456Z');
      const episode=await call(app,'/api/v1/health/care/episodes',owner,'POST',{petId:pagePet,clientEpisodeId:randomUUID(),title:'Exact start',startedAt:'2026-01-04T08:00:01.123456+07:00'});expect(episode.status).toBe(201);expect(episode.body.data.startedAt).toBe('2026-01-04T01:00:01.123456Z');
      const resolved=await call(app,`/api/v1/health/care/episodes/${episode.body.data.id}`,owner,'PATCH',{version:1,title:'Exact start',status:'resolved',resolvedAt:'2026-01-04T08:00:02.987654+07:00'});expect(resolved.body.data.startedAt).toBe('2026-01-04T01:00:01.123456Z');expect(resolved.body.data.resolvedAt).toBe('2026-01-04T01:00:02.987654Z');
    }finally{await withSystem(db=>db.query('DELETE FROM pet.pets WHERE id=$1',[pagePet]));}
  });
  it('records a visit in the same episode and one chosen follow-up reminder without duplicate cost rows',async()=>{
    const nextFollowupAt=new Date(Date.now()+86400000).toISOString(),body=entry({kind:'visit',episodeId,visit:{clinicName:'Owner-reported clinic',reason:'Cough',vetReportedFindings:'Owner says vet advised monitoring',treatment:'Owner-written instructions only',nextFollowupAt}});
    const result=await call(app,'/api/v1/health/care/entries',owner,'POST',body);expect(result.status).toBe(201);const retry=await call(app,'/api/v1/health/care/entries',owner,'POST',body);expect(retry.body.data.id).toBe(result.body.data.id);
    const reminders=await withSystem(async db=>(await db.query('SELECT user_id,title,due_at FROM notify.reminders WHERE dedupe_key=$1',[`care:${result.body.data.id}`])).rows);expect(reminders).toHaveLength(1);expect(reminders[0].user_id).toBe(owner);
    const linked=await call(app,`/api/v1/health/care/entries?petId=${pet}&episodeId=${episodeId}`);expect(linked.body.data.every((item:{episodeId:string})=>item.episodeId===episodeId)).toBe(true);
    await call(app,`/api/v1/health/care/entries/${result.body.data.id}`,owner,'DELETE');expect(await withSystem(async db=>(await db.query('SELECT id FROM notify.reminders WHERE dedupe_key=$1',[`care:${result.body.data.id}`])).rowCount)).toBe(0);
  });
  it('episode status has optimistic versions and rejects reversed resolution dates',async()=>{
    const improved=await call(app,`/api/v1/health/care/episodes/${episodeId}`,owner,'PATCH',{version:1,title:'Cough follow-up',status:'improving',resolvedAt:null});expect(improved.status).toBe(200);expect(improved.body.data.version).toBe(2);
    expect((await call(app,`/api/v1/health/care/episodes/${episodeId}`,owner,'PATCH',{version:1,title:'Cough follow-up',status:'resolved',resolvedAt:'2026-01-02T08:00:00+07:00'})).status).toBe(409);
    expect((await call(app,`/api/v1/health/care/episodes/${episodeId}`,owner,'PATCH',{version:2,title:'Cough follow-up',status:'resolved',resolvedAt:'2025-12-31T08:00:00+07:00'})).status).toBe(400);
    expect((await call(app,`/api/v1/health/care/episodes/${episodeId}`,viewer,'PATCH',{version:2,title:'Viewer change',status:'resolved',resolvedAt:null})).status).toBe(404);
  });
  it('the pet owner can edit a carer entry while preserving that authors private reflection',async()=>{
    const body=entry({narrative:'Carer diary',reflection:'CARER_ONLY_REFLECTION'});const created=await call(app,'/api/v1/health/care/entries',carer,'POST',body);expect(created.status).toBe(201);carerEntryId=created.body.data.id;
    const edited=await call(app,`/api/v1/health/care/entries/${carerEntryId}`,owner,'PATCH',{...body,version:1,reflection:'OWNER_MUST_NOT_OVERWRITE',clinicalNote:'Updated factual observation'});expect(edited.status).toBe(200);expect(edited.body.data.reflection).toBe('');expect(edited.body.data.canEditReflection).toBe(false);expect(edited.body.data.editedBy).toBe(owner);
    expect((await call(app,`/api/v1/health/care/entries?petId=${pet}`,carer)).body.data.find((value:{id:string})=>value.id===carerEntryId).reflection).toBe('CARER_ONLY_REFLECTION');
    expect((await call(app,`/api/v1/health/care/entries/${carerEntryId}`,carer,'PATCH',{...body,version:1})).status).toBe(409);
  });
  it('legacy clinical grants never widen, nor permit direct care function or raw table reads',async()=>{
    const granted=await call(clinic,'/api/v1/clinic/grants',owner,'POST',{petId:pet,clinicId,scopes:['summary.read']});expect(granted.status).toBe(201);legacyGrantId=granted.body.data.id;
    const summary=await call(clinic,`/api/v1/clinic/pets/${pet}/summary`,staff);expect(summary.status).toBe(200);expect(summary.body.data.careAccess).toBe(false);expect(summary.body.data.careEntries).toEqual([]);
    await expect(withUser(staff,db=>db.query('SELECT health.clinic_care_summary($1,true)',[pet]))).rejects.toMatchObject({code:'42501'});
  });
  it('owner clinical preview excludes all unselected entries and never contains raw private writing or photos',async()=>{
    const before=await call(app,`/api/v1/health/care/summary?petId=${pet}`);expect(before.body.data.entries).toEqual([]);
    const selected=await call(app,`/api/v1/health/care/entries/${entryId}`,owner,'PATCH',{...entry({mediaIds:photos}),version:1,shareWithClinic:true,shareCosts:true});expect(selected.status).toBe(200);
    const preview=await call(app,`/api/v1/health/care/summary?petId=${pet}`);expect(preview.body.data.entries).toHaveLength(1);const serialized=JSON.stringify(preview.body);for(const secret of ['PRIVATE_NARRATIVE_SENTINEL','AUTHOR_REFLECTION_SENTINEL','CARER_ONLY_REFLECTION','photos','mediaIds','read='])expect(serialized).not.toContain(secret);expect(preview.body.data.entries[0].costs).toEqual([]);
    const costs=await call(app,`/api/v1/health/care/summary?petId=${pet}&includeCosts=true`);expect(costs.body.data.entries[0].costs).toHaveLength(2);expect((await call(app,`/api/v1/health/care/summary?petId=${pet}&includeCosts=yes`)).status).toBe(400);
  });
  it('explicit care.read projects only selected facts, with two-sided cost selection and audit metadata',async()=>{
    const granted=await call(clinic,'/api/v1/clinic/grants',owner,'POST',{petId:pet,clinicId,scopes:['care.read']});expect(granted.status).toBe(201);careGrantId=granted.body.data.id;
    const result=await call(clinic,`/api/v1/clinic/pets/${pet}/summary`,staff);expect(result.status).toBe(200);expect(result.body.data.careAccess).toBe(true);expect(result.body.data.careEntries).toHaveLength(1);expect(result.body.data.careEntries[0].id).toBe(entryId);expect(result.body.data.careEntries[0].costs).toEqual([]);
    const paid=await call(clinic,`/api/v1/clinic/pets/${pet}/summary?includeCosts=true`,staff);expect(paid.body.data.careEntries[0].costs).toHaveLength(2);const raw=JSON.stringify(paid.body);expect(raw).not.toContain('PRIVATE_NARRATIVE_SENTINEL');expect(raw).not.toContain('AUTHOR_REFLECTION_SENTINEL');expect(raw).not.toContain(photos[0]);
    expect(await withSystem(async db=>(await db.query("SELECT id FROM identity.audit_log WHERE actor_id=$1 AND action='clinic.care.read'",[staff])).rowCount)).toBeGreaterThan(0);
    for(const table of ['care_entries','care_costs','care_reflections','care_media'])expect(await withUser(staff,async db=>(await db.query(`SELECT * FROM health.${table}`)).rows)).toEqual([]);
  });
  it('clinic grants are discoverable by the pet owner and revocation/expiry immediately stops care access',async()=>{
    const grants=await call(clinic,`/api/v1/clinic/grants?petId=${pet}`);expect(grants.body.data.some((grant:{id:string})=>grant.id===careGrantId)).toBe(true);expect((await call(clinic,`/api/v1/clinic/grants?petId=${pet}`,carer)).body.data).toEqual([]);
    expect((await call(clinic,`/api/v1/clinic/grants/${careGrantId}`,owner,'DELETE')).status).toBe(200);expect((await call(clinic,`/api/v1/clinic/pets/${pet}/summary`,staff)).body.data.careEntries).toEqual([]);
    await withSystem(db=>db.query("UPDATE identity.grants SET revoked_at=NULL,expires_at=now()-interval '1 minute' WHERE id=$1",[careGrantId]));await expect(withUser(staff,db=>db.query('SELECT health.clinic_care_summary($1,true)',[pet]))).rejects.toMatchObject({code:'42501'});
  });
  it('share links default to no diary and expose only explicit selected projection when requested',async()=>{
    const legacy=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet});expect(legacy.status).toBe(201);expect((await call(share,`/api/v1/share/public/${legacy.body.data.token}`,'')).body.data.careEntries).toEqual([]);
    const selected=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCare:true});const result=await call(share,`/api/v1/share/public/${selected.body.data.token}`,'');expect(result.status).toBe(200);expect(result.body.data.careEntries).toHaveLength(1);expect(result.body.data.careEntries[0].costs).toEqual([]);
    const paid=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCare:true,includeCosts:true});const withCosts=await call(share,`/api/v1/share/public/${paid.body.data.token}`,'');expect(withCosts.body.data.careEntries[0].costs).toHaveLength(2);for(const secret of ['PRIVATE_NARRATIVE_SENTINEL','AUTHOR_REFLECTION_SENTINEL','CARER_ONLY_REFLECTION',photos[0]])expect(JSON.stringify(withCosts.body)).not.toContain(secret);
    const retained=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCare:true,includeCosts:true});costSnapshotToken=retained.body.data.token;
    expect((await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCosts:true})).status).toBe(400);await call(share,`/api/v1/share/links/${paid.body.data.id}`,owner,'DELETE');expect((await call(share,`/api/v1/share/public/${paid.body.data.token}`,'' )).status).toBe(410);
  });
  it('entry cost opt-out excludes amounts even when a shared snapshot asks for costs',async()=>{
    const current=(await call(app,`/api/v1/health/care/entries?petId=${pet}`)).body.data.find((item:{id:string})=>item.id===entryId);
    const update=await call(app,`/api/v1/health/care/entries/${entryId}`,owner,'PATCH',{...current,shareCosts:false});expect(update.status).toBe(200);
    expect((await call(app,`/api/v1/health/care/summary?petId=${pet}&includeCosts=true`)).body.data.entries[0].costs).toEqual([]);
    expect((await call(share,`/api/v1/share/public/${costSnapshotToken}`,'')).status).toBe(410);
  });
  it('assistant helper includes bounded clinical projections with no narrative/reflection/media/costs by default',async()=>{
    const result=await withUser(owner,db=>careSummary(db,pet,{limit:1}));expect(result.entries).toHaveLength(1);expect(result.truncated).toBe(true);const raw=JSON.stringify(result);expect(raw).not.toContain('PRIVATE_NARRATIVE_SENTINEL');expect(raw).not.toContain('AUTHOR_REFLECTION_SENTINEL');expect(raw).not.toContain('CARER_ONLY_REFLECTION');expect(result.entries[0].costs).toEqual([]);
  });
  it('privacy exports own reflections only and no family reflections',async()=>{
    const result=await call(identity,'/api/v1/identity/export');expect(result.status).toBe(200);expect(result.body.data.careEntries.some((item:{id:string})=>item.id===entryId)).toBe(true);expect(result.body.data.careReflections.some((item:{content:string})=>item.content==='AUTHOR_REFLECTION_SENTINEL')).toBe(true);expect(JSON.stringify(result.body.data.careReflections)).not.toContain('CARER_ONLY_REFLECTION');
    const carerExport=await call(identity,'/api/v1/identity/export',carer);expect(carerExport.body.data.careReflections).toHaveLength(1);expect(carerExport.body.data.careEntries.every((item:{createdBy:string})=>item.createdBy===carer)).toBe(true);
  });
  it('deleting a referenced photo removes its diary attachment without corrupting the entry',async()=>{
    await withSystem(db=>db.query('DELETE FROM media.objects WHERE id=$1',[photos[0]]));const result=await call(app,`/api/v1/health/care/entries?petId=${pet}`);expect(result.body.data.find((item:{id:string})=>item.id===entryId).mediaIds).toEqual(photos.slice(1));
  });
  it('account erasure removes authored diary/reflection/costs/media and cannot leak through old care grants',async()=>{
    const current=(await call(app,`/api/v1/health/care/entries/${carerEntryId}`,carer)).body.data;expect((await call(app,`/api/v1/health/care/entries/${carerEntryId}`,carer,'PATCH',{...current,shareWithClinic:true})).status).toBe(200);
    const shared=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCare:true});expect((await call(share,`/api/v1/share/public/${shared.body.data.token}`,'')).status).toBe(200);
    await withSystem(db=>db.query('DELETE FROM identity.users WHERE id=$1',[carer]));for(const table of ['care_entries','care_reflections','care_costs','care_media']){
      const key=table==='care_entries'?'id':'entry_id';expect(await withSystem(async db=>(await db.query(`SELECT * FROM health.${table} WHERE ${key}=$1`,[carerEntryId])).rows)).toEqual([]);
    }
    expect((await call(share,`/api/v1/share/public/${shared.body.data.token}`,'')).status).toBe(410);
    expect(await withSystem(async db=>(await db.query('SELECT id FROM identity.grants WHERE id=$1',[legacyGrantId])).rowCount)).toBe(1);
  });
});
