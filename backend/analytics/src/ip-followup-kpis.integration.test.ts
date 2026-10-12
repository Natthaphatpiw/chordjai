import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {withSystem,closeDatabase} from '@chordjai/db';
import {ipFollowupMetrics} from './ip-followup-kpis';

const testUrl=process.env.TEST_DATABASE_URL;
const local=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!local)('IP collection and follow-up aggregate semantics',()=>{
  it('counts capture days and permission separately, and provider acceptance separately from opens/replies',async()=>{
    process.env.DATABASE_URL=testUrl;
    const owner=randomUUID(),pet=randomUUID(),session=randomUUID(),media=[randomUUID(),randomUUID(),randomUUID()],deliveries=[randomUUID(),randomUUID()];
    try{
      await withSystem(async db=>{
        const before=await ipFollowupMetrics(db);
        await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'Private aggregate fixture')",[owner,`ip-metrics-${owner}`]);
        await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Private pet','cat')",[pet,owner]);
        for(const id of media)await db.query("insert into media.objects(id,user_id,pet_id,pathname,mime,size,purpose,status) values($1,$2,$3,$4,'image/jpeg',100,'petid','ready')",[id,owner,pet,`u/${owner}/test-${id}.jpg`]);
        await db.query("insert into biometric.capture_sessions(id,pet_id,owner_id,request_id,create_hash,protocol_version,same_pet_confirmed,identity_basis,species,sample_count) values($1,$2,$3,$4,$5,'petid-capture-v1',true,'owner_recognition','cat',3)",[session,pet,owner,randomUUID(),'a'.repeat(64)]);
        for(const [index,id] of media.entries())await db.query("insert into biometric.capture_samples(session_id,media_id,position,angle,captured_at,capture_source,uploaded_at) select $1,id,$3,'front',$4,'library',created_at from media.objects where id=$2",[session,id,index,index<2?'2026-09-01T10:00:00Z':'2026-09-02T10:00:00Z']);
        await db.query("insert into notify.followup_preferences(user_id,enabled,sources,consent_version) values($1,true,'{\"care\":true,\"booklet\":false,\"journal\":false,\"assistantMemory\":false}','2026-10-12.followup.v1')",[owner]);
        await db.query("insert into notify.followup_deliveries(id,user_id,local_day,status,settings_version,selected_pet_id,accepted_at,opened_at,message) values($1,$2,current_date,'accepted',1,$3,now(),now(),'Private message'),($4,$2,current_date-1,'failed',1,$3,null,null,'Private failed message')",[deliveries[0],owner,pet,deliveries[1]]);
        for(let index=0;index<2;index++)await db.query("insert into notify.followup_replies(user_id,delivery_id,pet_id,event_id,content) values($1,$2,$3,$4,'Private response')",[owner,deliveries[0],pet,randomUUID()]);
        const after=await ipFollowupMetrics(db);
        expect(after.petid_research.sessions-before.petid_research.sessions).toBe(1);
        expect(after.petid_research.available_samples-before.petid_research.available_samples).toBe(3);
        expect(after.petid_research.pets_with_multiple_capture_days-before.petid_research.pets_with_multiple_capture_days).toBe(1);
        expect(after.petid_research.training_opted_in_pets).toBe(before.petid_research.training_opted_in_pets);
        expect(after.personalized_followups.enabled_users-before.personalized_followups.enabled_users).toBe(1);
        expect(after.personalized_followups.line_accepted_last_30_days-before.personalized_followups.line_accepted_last_30_days).toBe(1);
        expect(after.personalized_followups.opened_from_link_last_30_days-before.personalized_followups.opened_from_link_last_30_days).toBe(1);
        expect(after.personalized_followups.followups_with_replies_last_30_days-before.personalized_followups.followups_with_replies_last_30_days).toBe(1);
        expect(JSON.stringify(after)).not.toMatch(/Private|image|u\/|line_user_id|pet_id|owner_id/);
      });
    }finally{
      await withSystem(db=>db.query('delete from identity.users where id=$1',[owner]));await closeDatabase();
    }
  });
});
