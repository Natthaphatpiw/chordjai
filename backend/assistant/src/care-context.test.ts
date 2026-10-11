import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildClinicalCareContext } from './care-context';
const ownerId='00000000-0000-4000-8000-000000000001',petId='00000000-0000-4000-8000-000000000002',conversationId='00000000-0000-4000-8000-000000000003';
const mocks=vi.hoisted(()=>({query:vi.fn(),summary:vi.fn(),ai:vi.fn(),petVisible:true}));
vi.mock('@chordjai/auth',()=>({verifySession:vi.fn(async()=>({id:'00000000-0000-4000-8000-000000000001',role:'owner'}))}));
vi.mock('@chordjai/db',()=>({withUser:vi.fn(async(_id,fn)=>fn({query:mocks.query})),careSummary:mocks.summary}));
vi.mock('@chordjai/ai',()=>({runText:mocks.ai,hasUnsafeMedicalAdvice:vi.fn(()=>false)}));
import app from './app';
const clinicalEntry=()=>({kind:'visit',title:'Follow-up at the vet',observed_at:'2026-10-12T09:00:00+07:00',clinical_note:'Vomited twice, then kept water down.',provenance:'clinician_confirmed',narrative:'PRIVATE_NARRATIVE',reflection:'PRIVATE_REFLECTION',media:[{id:'PRIVATE_PHOTO'}],costs:[{amountMinor:123456,label:'PRIVATE_BILL'}],observations:{symptoms:['vomiting'],severity:'mild',appetite:'reduced',energy:'normal',trend:'better',water:'normal',toilet:'normal',onsetAt:'2026-10-11T20:00:00+07:00',frequency:'twice',secret:'PRIVATE_OBSERVATION_EXTRA'},visit:{clinicName:'PRIVATE_CLINIC',reason:'Vomiting',vetReportedFindings:'Owner reports the vet advised monitoring.',treatment:'Owner reports fluids were given.',nextFollowupAt:'2026-10-14T09:00:00+07:00',invoice:'PRIVATE_INVOICE'},episode:{id:'PRIVATE_EPISODE_ID',title:'Vomiting this week',status:'improving',startedAt:'2026-10-11T20:00:00+07:00',resolvedAt:null,reflection:'PRIVATE_EPISODE_REFLECTION'}});
beforeEach(()=>{
  vi.clearAllMocks();mocks.petVisible=true;
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live provider requests are forbidden in assistant care tests');}));
  mocks.summary.mockResolvedValue({entries:[clinicalEntry()],generatedAt:new Date().toISOString()});mocks.ai.mockResolvedValue('The saved updates report some improvement. Ask your vet about any continuing concerns.');
  mocks.query.mockImplementation(async(sql:string)=>{
    if(sql.includes('FROM identity.users'))return{rowCount:1,rows:[{id:ownerId,role:'owner',status:'active'}]};
    if(sql.includes('insert into assistant.conversations'))return{rowCount:1,rows:[{id:conversationId}]};
    if(sql.includes('update assistant.conversations set processing_token=$3'))return{rowCount:1,rows:[{id:conversationId,pet_id:petId}]};
    if(sql.includes('from pet.pets'))return{rowCount:mocks.petVisible?1:0,rows:mocks.petVisible?[{id:petId,name:'Milo',species:'cat',weight_kg:4.3}]:[]};
    if(sql.includes('from health.records'))return{rowCount:1,rows:[{kind:'weight',title:'Weight',recorded_at:'2026-10-10T00:00:00Z',weight_kg:4.3}]};
    if(sql.includes('processing_token=$3 for update'))return{rowCount:1,rows:[{id:conversationId}]};
    return{rowCount:0,rows:[]};
  });
});
describe('bounded clinical care projection',()=>{
  it('retains dated clinical continuity and labels even reported vet findings as owner-reported',()=>{
    const context=buildClinicalCareContext({entries:[clinicalEntry()]});
    expect(context.entries[0]).toMatchObject({kind:'visit',provenance:'owner_reported',observedAt:'2026-10-12T02:00:00.000Z',clinicalNote:'Vomited twice, then kept water down.',observations:{symptoms:['vomiting'],trend:'better'},visit:{provenance:'owner_reported'},episode:{status:'improving'}});
    expect(JSON.stringify(context)).not.toContain('PRIVATE_');expect(JSON.stringify(context)).not.toContain('clinician_confirmed');
  });
  it('bounds complete events without serializing arbitrary nested fields or invalid values',()=>{
    const entry=clinicalEntry();entry.clinical_note='x'.repeat(4000);entry.visit.reason='y'.repeat(4000);entry.visit.treatment='z'.repeat(4000);entry.observations.symptoms=Array(20).fill('s'.repeat(4000));entry.observations.severity='PRIVATE_UNRECOGNIZED_VALUE';entry.observed_at='not-a-date';
    const context=buildClinicalCareContext({entries:Array(100).fill(entry),costs:'PRIVATE_EXTRA'});
    expect(context.entries.length).toBeGreaterThan(0);expect(context.entries.length).toBeLessThanOrEqual(5);expect(JSON.stringify(context).length).toBeLessThanOrEqual(6000);
    expect(context.entries[0].clinicalNote.length).toBe(600);expect(context.entries[0].observations.symptoms.length).toBe(8);expect(context.entries[0].observations.severity).toBeNull();expect(context.entries[0].observedAt).toBeNull();expect(JSON.stringify(context)).not.toContain('PRIVATE_');
  });
  it('provides empty projections and rejects malformed visit payloads',()=>{
    expect(buildClinicalCareContext(null)).toEqual({provenance:'owner_reported',entries:[]});
    for(const visit of [null,undefined,'PRIVATE_VISIT_STRING',['PRIVATE_VISIT_ARRAY']])expect(buildClinicalCareContext({entries:[{...clinicalEntry(),kind:'daily',visit}]}).entries[0].visit).toBeNull();
  });
  it('retains ongoing care and next follow-up dates for updates outside the visit category',()=>{
    for(const kind of ['daily','symptom','followup']){
      const context=buildClinicalCareContext({entries:[{...clinicalEntry(),kind}]});
      expect(context.entries[0].visit).toMatchObject({reason:'Vomiting',treatment:'Owner reports fluids were given.',nextFollowupAt:'2026-10-14T02:00:00.000Z',provenance:'owner_reported'});
      expect(JSON.stringify(context)).not.toContain('PRIVATE_');
      expect(JSON.stringify(context)).not.toContain('amountMinor');
    }
  });
});
describe('assistant diary context with isolated provider',()=>{
  it('reads the selected pet under the user transaction and sends only the bounded clinical projection',async()=>{
    const response=await app.request('/api/v1/assistant/chat',{method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json','Accept-Language':'en'},body:JSON.stringify({petId,message:'How has this week changed?'})});
    expect(response.status).toBe(200);expect(mocks.summary).toHaveBeenCalledWith(expect.objectContaining({query:mocks.query}),petId,{limit:5,includeCosts:false});expect(mocks.ai).toHaveBeenCalledOnce();
    const instructions=mocks.ai.mock.calls[0][0].instructions as string;
    expect(instructions).toContain('Vomited twice');expect(instructions).toContain('owner_reported');expect(instructions).toContain('absence of an update is not evidence of recovery');expect(instructions).not.toContain('PRIVATE_');
    const healthSql=mocks.query.mock.calls.find(([sql])=>sql.includes('from health.records'))![0];
    expect(healthSql).not.toContain('notes');expect(healthSql).not.toContain('data');expect(healthSql).toContain("kind='weight'");
  });
  it('does not read care records or call AI when the submitted pet is unavailable',async()=>{
    mocks.petVisible=false;
    const response=await app.request('/api/v1/assistant/chat',{method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({petId,message:'Read the history'})});
    expect(response.status).toBe(404);expect(mocks.summary).not.toHaveBeenCalled();expect(mocks.ai).not.toHaveBeenCalled();
  });
});
