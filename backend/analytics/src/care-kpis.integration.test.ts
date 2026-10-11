import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withSystem, closeDatabase } from '@chordjai/db';
import { careProductMetrics } from './care-kpis';

const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!isolated)('care product aggregate definitions in isolated PostgreSQL',()=>{
  it('counts distinct pets and follow-up coverage without multiplying rows for costs or photos',async()=>{
    process.env.DATABASE_URL=testUrl;
    const owner=randomUUID(),pets=[randomUUID(),randomUUID()],episodes=[randomUUID(),randomUUID()],entries=Array.from({length:4},()=>randomUUID()),photos=[randomUUID(),randomUUID()],enrollment=randomUUID();
    try {
      const result=await withSystem(async db=>{
        const before=await careProductMetrics(db);
        await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'Private care analytics owner')",[owner,`care-metrics-${owner}`]);
        for(const pet of pets)await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Private pet','cat')",[pet,owner]);
        await db.query("INSERT INTO health.care_episodes(id,pet_id,created_by,client_episode_id,create_hash,title,started_at) VALUES($1,$2,$3,$4,repeat('a',64),'PRIVATE_EPISODE',now()-interval '20 days')",[episodes[0],pets[0],owner,randomUUID()]);
        await db.query("INSERT INTO health.care_episodes(id,pet_id,created_by,client_episode_id,create_hash,title,status,started_at,resolved_at) VALUES($1,$2,$3,$4,repeat('b',64),'PRIVATE_RESOLVED','resolved',now()-interval '2 days',now())",[episodes[1],pets[1],owner,randomUUID()]);
        for(const [index,kind,pet,days] of [[0,'daily',pets[0],18],[1,'visit',pets[0],2],[2,'followup',pets[0],1],[3,'daily',pets[1],0]] as const)await db.query(`INSERT INTO health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,episode_id,kind,title,observed_at,narrative,clinical_note,share_with_clinic,created_at) VALUES($1,$2,$3,$4,repeat('c',64),$5,$6,'PRIVATE_TITLE',now()-$7*interval '1 day','PRIVATE_NARRATIVE','PRIVATE_CLINICAL',$8,now()-$7*interval '1 day')`,[entries[index],pet,owner,randomUUID(),pet===pets[0]?episodes[0]:episodes[1],kind,days,index===1]);
        await db.query("INSERT INTO health.care_reflections(entry_id,author_id,content) VALUES($1,$2,'PRIVATE_FEELINGS')",[entries[1],owner]);
        for(const position of [0,1])await db.query("INSERT INTO health.care_costs(entry_id,position,label,amount_minor,currency) VALUES($1,$2,'PRIVATE_EXPENSE',123456,'THB')",[entries[1],position]);
        for(const [position,photo] of photos.entries()){
          await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status,created_at) VALUES($1,$2,$3,$4,'image/jpeg',20,'ready',now()-$5*interval '1 day')",[photo,owner,pets[0],`u/${owner}/${photo}.jpg`,position?3:32]);
          await db.query('INSERT INTO health.care_media(entry_id,media_id,position) VALUES($1,$2,$3)',[entries[1],photo,position]);
        }
        await db.query("INSERT INTO biometric.enrollments(id,pet_id,user_id,description,status) VALUES($1,$2,$3,'Private photo signature','ready')",[enrollment,pets[0],owner]);
        for(const [position,photo] of photos.entries())await db.query('INSERT INTO biometric.enrollment_photos(enrollment_id,media_id,position) VALUES($1,$2,$3)',[enrollment,photo,position]);
        const after=await careProductMetrics(db);
        await db.query('DELETE FROM identity.users WHERE id=$1',[owner]);
        return{before,after};
      });
      const before=result.before.care!,after=result.after.care!;
      for(const [field,delta] of Object.entries({diary_authors:1,diary_entries:4,diary_pets:2,entries_last_7_days:3,entries_last_30_days:4,active_pets_last_30_days:2,repeat_week_pets_last_30_days:1,episodes:2,active_episodes:1,resolved_episodes:1,followup_updates:1,episodes_with_followup:1,visits:1,visits_with_recorded_costs:1,visits_with_attachments:1,entries_enabled_for_clinical_sharing:1}))expect(after[field]-before[field],field).toBe(delta);
      for(const [field,delta] of Object.entries({enrolled_pets:1,pets_with_available_reference_photos:1,available_reference_photos:2,pets_with_multiple_reference_photos:1,pets_with_reference_uploads_last_30_days:1}))expect(Number(result.after.petid[field as keyof typeof result.after.petid])-Number(result.before.petid[field as keyof typeof result.before.petid]),field).toBe(delta);
      expect(JSON.stringify(result.after)).not.toContain('PRIVATE_');expect(JSON.stringify(result.after)).not.toContain('123456');
    } finally {await closeDatabase();}
  });
});
