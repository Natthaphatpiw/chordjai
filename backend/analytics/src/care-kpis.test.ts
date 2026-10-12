import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),role:'admin'}));
vi.mock('@chordjai/auth',()=>({verifySession:vi.fn(async()=>({id:'00000000-0000-4000-8000-000000000001',role:'admin'}))}));
vi.mock('@chordjai/db',()=>({withUser:vi.fn(async(_id,fn)=>fn({query:mocks.query})),withSystem:vi.fn(async fn=>fn({query:mocks.query}))}));
import app from './app';
beforeEach(()=>{
  vi.clearAllMocks();mocks.role='admin';
  mocks.query.mockImplementation(async(sql:string)=>{
    if(sql.includes('FROM identity.users WHERE'))return{rowCount:1,rows:[{id:'00000000-0000-4000-8000-000000000001',role:mocks.role,status:'active'}]};
    if(sql.startsWith('SELECT (SELECT count(*) FROM identity.users)'))return{rowCount:1,rows:[{users:12,pets:15}]};
    if(sql.includes('WITH recent AS'))return{rowCount:1,rows:[{diary_authors:8,diary_entries:45,episodes:6,episodes_with_followup:3,visits:7,visits_with_recorded_costs:5,visits_with_attachments:4,repeat_week_pets_last_30_days:4}]};
    if(sql.includes('WITH pet_refs AS'))return{rowCount:1,rows:[{enrolled_pets:9,available_reference_photos:20,pets_with_multiple_reference_photos:6,pets_with_reference_uploads_last_30_days:7}]};
    if(sql.includes('WITH available AS'))return{rowCount:1,rows:[{sessions:5,available_samples:12,pets_with_multiple_capture_days:2,training_opted_in_pets:1,samples_reviewed_under_current_consent:0}]};
    if(sql.includes('notify.followup_preferences WHERE enabled'))return{rowCount:1,rows:[{enabled_users:3,paused_users:1,line_accepted_last_30_days:2,opened_from_link_last_30_days:1,followups_with_replies_last_30_days:1,uncertain_requests:0}]};
    return{rowCount:0,rows:[]};
  });
});
describe('admin care product analytics',()=>{
  it('returns aggregate inventory with honest quality, identity and cohort limitations',async()=>{
    const response=await app.request('/api/v1/analytics/kpis',{headers:{Authorization:'Bearer test-session'}});expect(response.status).toBe(200);
    const {data}=await response.json();expect(data.care).toMatchObject({diaryAuthors:8,diaryEntries:45,episodesWithFollowup:3,visitsWithRecordedCosts:5});
    expect(data.petid.assessment).toMatchObject({referenceDates:'upload_timestamps_not_capture_dates',captureQuality:'not_measured',verifiedIdentityLabels:'not_collected',biometricCalibration:'pending',researchEligibility:'not_established',certification:'not_claimed'});
    expect(data.definitions.attachments).toBe('available_images_not_verified_receipts');expect(data.definitions.repeatWeekPets).toContain('not_a_retention_cohort');
    const serialized=JSON.stringify(data);for(const key of ['clinicalNote','narrative','reflection','amountMinor','symptoms','mediaId'])expect(serialized).not.toContain(key);
    const queries=mocks.query.mock.calls.map(([sql])=>sql as string).filter(sql=>sql.startsWith('WITH'));
    expect(data.petidResearch).toMatchObject({sessions:5,petsWithMultipleCaptureDays:2,trainingOptedInPets:1});expect(data.personalizedFollowups).toMatchObject({lineAcceptedLast30Days:2,openedFromLinkLast30Days:1});
    expect(queries).toHaveLength(3);expect(queries.join(' ')).not.toMatch(/\b(narrative|reflection|clinical_note|observations|amount_minor)\b/);expect(queries[0]).toContain('Asia/Bangkok');
  });
  it('denies ordinary owners before reading system aggregate care data',async()=>{
    mocks.role='owner';
    const response=await app.request('/api/v1/analytics/kpis',{headers:{Authorization:'Bearer test-session'}});expect(response.status).toBe(403);
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('WITH recent AS'))).toBe(false);
  });
  it('requires login without exposing any aggregate information',async()=>{
    expect((await app.request('/api/v1/analytics/kpis')).status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();
  });
});
