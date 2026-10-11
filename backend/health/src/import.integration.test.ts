import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withSystem, closeDatabase } from '@chordjai/db';
import { signSession } from '@chordjai/auth';
import app from './app';

const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!isolated)('scanned health imports in isolated PostgreSQL',()=>{
  const owner=randomUUID(),viewer=randomUUID(),petId=randomUUID(),scanId=randomUUID(),viewerScan=randomUUID();
  let ownerToken='',viewerToken='';
  async function call(body:unknown,key?:string,token=ownerToken){
    const response=await app.request('/api/v1/health/records',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
    return{status:response.status,body:await response.json()};
  }
  function entry(index:number){return{petId,kind:'vaccine',title:`Reviewed vaccine ${index}`,recordedAt:'2025-05-24',nextDueAt:'2026-05-24',notes:'Checked against the source booklet',data:{scanId,sourcePage:2,scanRecordIndex:index}};}
  beforeAll(async()=>{
    process.env.DATABASE_URL=testUrl;process.env.APP_JWT_SECRET='isolated-health-test-secret-at-least-32-characters';process.env.APP_JWT_ISSUER='https://www.chordjai.life';
    await withSystem(async db=>{
      for(const id of [owner,viewer])await db.query('INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,$3)',[id,`booklet-import-${id}`,'Booklet Test']);
      await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Booklet Test Pet','cat')",[petId,owner]);
      await db.query("INSERT INTO pet.members(pet_id,user_id,role) VALUES($1,$2,'viewer')",[petId,viewer]);
      for(const[id,user]of [[scanId,owner],[viewerScan,viewer]])await db.query('INSERT INTO health.scans(id,pet_id,user_id,draft) VALUES($1,$2,$3,$4::jsonb)',[id,petId,user,JSON.stringify({pageCount:2,records:[]})]);
    });
    [ownerToken,viewerToken]=await Promise.all([owner,viewer].map(id=>signSession({id,role:'owner'})));
  });
  afterAll(async()=>{await withSystem(db=>db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[[owner,viewer]]));await closeDatabase();});
  it('requires an idempotency key for reviewed imports',async()=>{
    const result=await call(entry(0));expect(result.status).toBe(400);expect(result.body.error.code).toBe('IDEMPOTENCY_REQUIRED');
  });
  it('keeps one record and one reminder after a lost middleware cache',async()=>{
    const key=randomUUID(),body=entry(0),first=await call(body,key);expect(first.status).toBe(201);
    // Simulate a process crash after the record transaction committed but before
    // the generic response cache was persisted. Domain deduplication survives.
    await withSystem(db=>db.query('DELETE FROM ops.idempotency WHERE user_id=$1',[owner]));
    const retry=await call(body,key);expect(retry.status).toBe(201);expect(retry.body.data.id).toBe(first.body.data.id);
    const counts=await withSystem(async db=>({records:(await db.query("SELECT id FROM health.records WHERE pet_id=$1 AND data->>'scanRecordIndex'='0'",[petId])).rowCount,reminders:(await db.query('SELECT id FROM notify.reminders WHERE dedupe_key=$1',[`health:${first.body.data.id}`])).rowCount}));
    expect(counts).toEqual({records:1,reminders:1});
  });
  it('serializes concurrent requests for the same scanned entry even under different keys',async()=>{
    const [first,second]=await Promise.all([call(entry(1),randomUUID()),call(entry(1),randomUUID())]);
    expect(first.status).toBe(201);expect(second.status).toBe(201);expect(first.body.data.id).toBe(second.body.data.id);
    expect(await withSystem(async db=>(await db.query("SELECT id FROM health.records WHERE pet_id=$1 AND data->>'scanRecordIndex'='1'",[petId])).rowCount)).toBe(1);
  });
  it('rejects a source page outside the saved batch',async()=>{
    const body=entry(2);body.data.sourcePage=3;const result=await call(body,randomUUID());expect(result.status).toBe(404);expect(result.body.error.code).toBe('SCAN_NOT_FOUND');
  });
  it('rejects impossible or reversed scanned dates before a record is inserted',async()=>{
    const body=entry(4);
    expect((await call({...body,recordedAt:'2025-02-29'},randomUUID())).status).toBe(400);
    const reversed=await call({...body,nextDueAt:'2025-05-23'},randomUUID());expect(reversed.status).toBe(400);expect(reversed.body.error.code).toBe('INVALID_DUE_DATE');
    expect(await withSystem(async db=>(await db.query("SELECT id FROM health.records WHERE pet_id=$1 AND data->>'scanRecordIndex'='4'",[petId])).rowCount)).toBe(0);
  });
  it('rejects a ready photo belonging to another pet in the same owner account before AI',async()=>{
    const otherPet=randomUUID(),photo=randomUUID();
    await withSystem(async db=>{
      await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Other Booklet Pet','cat')",[otherPet,owner]);
      await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',20,'ready')",[photo,owner,otherPet,`u/${owner}/${photo}.jpg`]);
    });
    const response=await app.request('/api/v1/health/ocr',{method:'POST',headers:{Authorization:`Bearer ${ownerToken}`,'Content-Type':'application/json'},body:JSON.stringify({petId,imageUrls:[photo]})});
    expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('IMAGE_PET_MISMATCH');
  });
  it('denies a viewer import even if that viewer historically created a scan',async()=>{
    const body=entry(3);body.data.scanId=viewerScan;const result=await call(body,randomUUID(),viewerToken);expect(result.status).toBe(404);
  });
});
