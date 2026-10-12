import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,it,expect,vi } from 'vitest';
import { withSystem,withUser,closeDatabase } from '@chordjai/db';
import { signSession } from '@chordjai/auth';
import { canonicalJson,sha256 } from './dataset';
import app from './app';
import mediaApp from '../../media/src/app';
const mock=vi.hoisted(()=>({image:Buffer.from('private synthetic normalized jpeg fixture'),changed:false}));
vi.mock('@chordjai/media',()=>({loadOwnedImage:vi.fn(async()=>`data:image/jpeg;base64,${(mock.changed?Buffer.from('changed fixture'):mock.image).toString('base64')}`),mediaUrl:vi.fn(async(asset:{id:string})=>`/api/v1/media/${asset.id}?read=synthetic-private-link`)}));
vi.mock('@chordjai/ai',()=>({runStructured:vi.fn(()=>{throw new Error('No AI calls in dataset tests');}),embedTexts:vi.fn(()=>{throw new Error('No AI calls in dataset tests');})}));
const connection=process.env.TEST_DATABASE_URL;
const isolated=!!connection&&['localhost','127.0.0.1','::1'].includes(new URL(connection).hostname);
describe.skipIf(!isolated)('Private PetID dataset export on isolated PostgreSQL',()=>{
  const admin=randomUUID(),owner=randomUUID(),outsider=randomUUID(),pet=randomUUID(),media=randomUUID(),session=randomUUID(),sample=randomUUID(),check=randomUUID();
  const tokens=new Map<string,string>();let consentVersion=1,reviewId='',activeCheck=check,checkEpoch=1;
  const base='/api/v1/biometric/review/datasets';
  async function call(path:string,actor=admin,method='GET',body?:unknown,key?:string){const response=await app.request(path,{method,headers:{Authorization:`Bearer ${tokens.get(actor)}`,...(body?{'Content-Type':'application/json','Idempotency-Key':key??randomUUID()}:{}),},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
  async function choice(granted:boolean){await withSystem(async db=>{consentVersion++;await db.query('update biometric.training_consents set granted=$2,version=$3 where pet_id=$1',[pet,granted,consentVersion]);await db.query('insert into biometric.training_consent_events(pet_id,owner_id,request_id,create_hash,policy_version,granted,version) values($1,$2,$3,$4,$5,$6,$7)',[pet,owner,randomUUID(),'a'.repeat(64),'petid-training-2026-10-12',granted,consentVersion]);});}
  async function approve(){await withSystem(async db=>{
    if(checkEpoch!==consentVersion){activeCheck=randomUUID();checkEpoch=consentVersion;
      await db.query("insert into biometric.capture_checks(id,session_id,owner_id,request_id,version,status,consent_version,evidence_hash,model,consistency,comparison_scope,observations,limitations,sample_count) values($1,$2,$3,$4,'petid-review-v1','completed',$5,$6,'gpt-6.1-sol','possible_same','within_session','[]','Synthetic new-epoch fixture',1)",[activeCheck,session,owner,randomUUID(),consentVersion,'d'.repeat(64)]);
      await db.query("insert into biometric.capture_check_samples(check_id,sample_id,quality,image_sha256,decoded_sha256,dhash,width,height,metrics,issues) values($1,$2,'acceptable',$3,$4,$5,640,640,'{}','[]')",[activeCheck,sample,sha256(mock.image),'e'.repeat(64),'abcdeffedcba1234']);
    }
    reviewId=(await db.query(`insert into biometric.capture_reviews(session_id,check_id,reviewer_id,request_id,consent_version,decision,evidence_kind,evidence_reference,evidence_note,reference_session_id,independent_evidence_confirmed,privacy_checked,revision)
    values($1,$2,$3,$4,$5,'approved','clinic_record','synthetic-case-only','Independent synthetic fixture review, not a real clinical record',null,true,true,(select coalesce(max(revision),0)+1 from biometric.capture_reviews where session_id=$1)) returning id`,[session,activeCheck,admin,randomUUID(),consentVersion])).rows[0].id;});}
  beforeAll(async()=>{
    process.env.DATABASE_URL=connection!;process.env.APP_JWT_SECRET='petid-dataset-test-only-secret-0123456789abcdef';
    await withSystem(async db=>{
      for(const [id,role] of [[admin,'admin'],[owner,'owner'],[outsider,'owner']]){await db.query('insert into identity.users(id,line_user_id,display_name,role) values($1,$2,$3,$4)',[id,`dataset-fixture-${id}`,'Synthetic dataset fixture',role]);await db.query("insert into identity.consents(user_id,purpose,granted,version) values($1,'service',true,'synthetic-dataset-test')",[id]);}
      await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Synthetic pet','cat')",[pet,owner]);
      await db.query("insert into media.objects(id,user_id,pet_id,pathname,mime,size,status) values($1,$2,$3,$4,'image/jpeg',64,'ready')",[media,owner,pet,`synthetic/${media}.jpg`]);
      await db.query("insert into biometric.capture_sessions(id,pet_id,owner_id,request_id,create_hash,protocol_version,same_pet_confirmed,identity_basis,sample_count,species) values($1,$2,$3,$4,$5,'petid-capture-v1',true,'owner_recognition',1,'cat')",[session,pet,owner,randomUUID(),'b'.repeat(64)]);
      await db.query("insert into biometric.capture_samples(id,session_id,media_id,position,angle,captured_at,capture_source,uploaded_at) select $1,$2,id,0,'front','2026-01-01T03:00:00Z','library',created_at from media.objects where id=$3",[sample,session,media]);
      await db.query("insert into biometric.training_consents(pet_id,owner_id,policy_version,granted) values($1,$2,'petid-training-2026-10-12',true)",[pet,owner]);
      await db.query("insert into biometric.training_consent_events(pet_id,owner_id,request_id,create_hash,policy_version,granted,version) values($1,$2,$3,$4,'petid-training-2026-10-12',true,1)",[pet,owner,randomUUID(),'c'.repeat(64)]);
      await db.query("insert into biometric.capture_checks(id,session_id,owner_id,request_id,version,status,consent_version,evidence_hash,model,consistency,comparison_scope,observations,limitations,sample_count) values($1,$2,$3,$4,'petid-review-v1','completed',1,$5,'gpt-6.1-sol','possible_same','within_session','[]','Synthetic fixture only',1)",[check,session,owner,randomUUID(),'d'.repeat(64)]);
      await db.query("insert into biometric.capture_check_samples(check_id,sample_id,quality,image_sha256,decoded_sha256,dhash,width,height,metrics,issues) values($1,$2,'acceptable',$3,$4,$5,640,640,'{}','[]')",[check,sample,sha256(mock.image),'e'.repeat(64),'abcdeffedcba1234']);
    });
    await approve();
    for(const [id,role] of [[admin,'admin'],[owner,'owner'],[outsider,'owner']] as const)tokens.set(id,await signSession({id,role}));
  });
  afterAll(async()=>{await withSystem(db=>db.query('delete from identity.users where id=any($1::uuid[])',[[admin,owner,outsider]]));await closeDatabase();});
  it('exports only current reviewed consent metadata without owner identity or media capabilities',async()=>{
    const body={requestId:randomUUID(),limit:500},created=await call(base,admin,'POST',body);expect(created.status).toBe(201);
    const {manifest,manifestSha256}=created.body.data;expect(manifest.samples).toHaveLength(1);expect(manifest.samples[0]).toMatchObject({sampleId:sample,checkId:check,reviewId,consentVersion:1,captureDay:'2026-01-01'});
    expect(manifestSha256).toBe(sha256(canonicalJson(manifest)));const raw=JSON.stringify(manifest);for(const privateValue of [owner,pet,media,'Synthetic pet','read=','pathname'])expect(raw).not.toContain(privateValue);
    expect((await call(base,admin,'POST',body)).body.data.manifestSha256).toBe(manifestSha256);
    expect((await call(`${base}/${manifest.exportId}/authorize`,admin,'POST',{manifestSha256})).body.data).toMatchObject({authorized:true,exportId:manifest.exportId,manifestSha256});
    expect((await call(`${base}/${manifest.exportId}/authorize`,admin,'POST',{manifestSha256:'f'.repeat(64)})).status).toBe(409);
    expect(await withUser(outsider,db=>db.query('select * from biometric.dataset_export_samples'))).toMatchObject({rowCount:0});
    expect((await withUser(owner,db=>db.query('select * from biometric.dataset_export_samples'))).rows[0].owner_id).toBe(owner);
  });
  it('requires current admin role and creator access for all export and fresh media-link routes',async()=>{
    for(const actor of [owner,outsider])expect((await call(base,actor,'POST',{requestId:randomUUID()})).status).toBe(403);
    const created=(await call(base,admin,'POST',{requestId:randomUUID()})).body.data;
    for(const actor of [owner,outsider])expect((await call(`${base}/${created.manifest.exportId}`,actor)).status).toBe(403);
    const linked=await mediaApp.request(`/api/v1/media/${media}/link`,{headers:{Authorization:`Bearer ${tokens.get(owner)}`}});expect(linked.status).toBe(200);expect((await linked.json()).data.url).toContain(media);
    expect((await mediaApp.request(`/api/v1/media/${media}/link`,{headers:{Authorization:`Bearer ${tokens.get(outsider)}`}})).status).toBe(404);
  });
  it('serves only exact approved image bytes and rejects changed bytes',async()=>{
    const created=(await call(base,admin,'POST',{requestId:randomUUID()})).body.data,id=created.manifest.exportId;
    const response=await app.request(`${base}/${id}/samples/${sample}`,{headers:{Authorization:`Bearer ${tokens.get(admin)}`}});expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer())).toEqual(mock.image);expect(response.headers.get('cache-control')).toBe('private, no-store');
    mock.changed=true;expect((await call(`${base}/${id}/samples/${sample}`)).status).toBe(410);mock.changed=false;
    expect((await call(`${base}/${id}/samples/${randomUUID()}`)).status).toBe(404);
  });
  it('withdrawal destroys manifests and generic HTTP keys cannot replay an old authorization',async()=>{
    const data=(await call(base,admin,'POST',{requestId:randomUUID()})).body.data,id=data.manifest.exportId,key=randomUUID(),body={manifestSha256:data.manifestSha256};
    expect((await call(`${base}/${id}/authorize`,admin,'POST',body,key)).status).toBe(200);
    await choice(false);
    expect((await call(`${base}/${id}/authorize`,admin,'POST',body,key)).status).toBe(410);
    expect((await call(base,admin,'POST',{requestId:randomUUID()})).status).toBe(422);
    expect((await withSystem(db=>db.query('select id from biometric.dataset_exports where id=$1',[id]))).rowCount).toBe(0);
    await choice(true);expect((await call(base,admin,'POST',{requestId:randomUUID()})).status).toBe(422);await approve();
    expect((await call(base,admin,'POST',{requestId:randomUUID()})).status).toBe(201);
  });
  it('erasing one image destroys dependent manifests and blocks training authorization',async()=>{
    const data=(await call(base,admin,'POST',{requestId:randomUUID()})).body.data;
    await withSystem(db=>db.query("update media.objects set status='deleted' where id=$1",[media]));
    expect((await call(`${base}/${data.manifest.exportId}/authorize`,admin,'POST',{manifestSha256:data.manifestSha256})).status).toBe(410);
    expect((await call(base,admin,'POST',{requestId:randomUUID()})).status).toBe(422);
    expect((await withSystem(db=>db.query('select id from biometric.dataset_exports where id=$1',[data.manifest.exportId]))).rowCount).toBe(0);
  });
  it('account erasure removes manifest payloads even when their snapshot was already ineligible',async()=>{
    const id=randomUUID();
    await withSystem(async db=>{
      await db.query('insert into biometric.dataset_exports(id,creator_id,request_id,request_hash,manifest,manifest_sha256) values($1,$2,$3,$4,$5,$6)',[id,admin,randomUUID(),'a'.repeat(64),{synthetic:true},'b'.repeat(64)]);
      await db.query('insert into biometric.dataset_export_samples(export_id,sample_id,media_id,session_id,owner_id,pet_id,check_id,review_id,consent_version,export_created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now())',[id,sample,media,session,owner,pet,activeCheck,reviewId,consentVersion]);
      await db.query('delete from identity.users where id=$1',[owner]);
      expect((await db.query('select id from biometric.dataset_exports where id=$1',[id])).rowCount).toBe(0);
      expect((await db.query('select * from biometric.dataset_export_samples where export_id=$1',[id])).rowCount).toBe(0);
    });
    expect((await call(`${base}/${id}`)).status).toBe(410);
  });
});
