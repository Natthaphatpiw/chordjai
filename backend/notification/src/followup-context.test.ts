import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from '@chordjai/db';
import {randomUUID} from 'node:crypto';
import {followupPreferencesSchema,followupDecisionSchema,FOLLOWUP_CONSENT_VERSION} from '@chordjai/contracts';
import {bangkokDay,deliveryWindow,composeFollowup,validateDecision,type FollowupContext} from './followup-context';
import {followupCommand,lockCurrentSource} from './followup';
const pet=randomUUID(),source=randomUUID();
const context:FollowupContext={today:'2026-10-12',pets:[{id:pet,name:'พีโอนี',species:'cat'}],sources:[{id:source,petId:pet,source:'care',kind:'visit',date:'2026-09-29T03:00:00Z',updatedAt:'2026-09-29T03:00:00Z',title:'Ear care',text:'Owner reports treatment at a vet'}]};
const decision={shouldSend:true,sourceId:source,petId:pet,intent:'vet_followup' as const,topic:'general' as const,greeting:'warm' as const,reason:'post_visit' as const};
describe('grounded nonintrusive followup selection',()=>{
  it('requires an explicit version and source choice, never defaults to enabled',()=>{
    const base={enabled:true,expectedVersion:0,sources:{care:false,booklet:false,journal:false,assistantMemory:false}};
    expect(followupPreferencesSchema.safeParse(base).success).toBe(false);
    expect(followupPreferencesSchema.safeParse({...base,consentVersion:FOLLOWUP_CONSENT_VERSION,sources:{...base.sources,care:true}}).success).toBe(true);
    expect(followupPreferencesSchema.safeParse({...base,enabled:false}).success).toBe(true);
  });
  it('enforces fixed daylight in Bangkok independently of host timezone',()=>{
    expect(bangkokDay(new Date('2026-10-11T18:00:00Z'))).toBe('2026-10-12');
    for(const stamp of ['2026-10-12T01:59:59Z','2026-10-12T13:00:00Z','2026-10-12T20:00:00Z'])expect(deliveryWindow(new Date(stamp))).toBe(false);
    for(const stamp of ['2026-10-12T02:00:00Z','2026-10-12T12:59:59Z'])expect(deliveryWindow(new Date(stamp))).toBe(true);
  });
  it('composes only known pet and actual event date, never quotes treatment/dose/private facts',()=>{
    const text=composeFollowup(decision,context,'th')!;expect(text).toContain('พีโอนี');expect(text).toContain('29');expect(text).toContain('2026');
    expect(text).not.toMatch(/dose|drops|treatment|Owner reports/);expect(composeFollowup(decision,context,'en')).toContain('29 Sept 2026');
  });
  it('rejects unknown identifiers, a different pet and closed episodes',()=>{
    for(const selected of [{...decision,sourceId:randomUUID()},{...decision,petId:randomUUID()}])expect(()=>validateDecision(selected,context)).toThrow();
    expect(()=>validateDecision(decision,{...context,sources:[{...context.sources[0]!,episodeStatus:'resolved'}]})).toThrow();
  });
  it('rejects a stale earlier episode update, future event and stale routine greeting',()=>{
    const episode=randomUUID();expect(()=>validateDecision(decision,{...context,sources:[{...context.sources[0]!,episodeId:episode},{...context.sources[0]!,id:randomUUID(),episodeId:episode,date:'2026-10-01T03:00:00Z'}]})).toThrow();
    expect(()=>validateDecision(decision,{...context,sources:[{...context.sources[0]!,date:'2026-10-13T03:00:00Z'}]})).toThrow();
    expect(()=>validateDecision({...decision,intent:'care_checkin'},{...context,sources:[{...context.sources[0]!,kind:'daily',date:'2026-09-01T03:00:00Z'}]})).toThrow();
  });
  it('model output is selection-only, rejects arbitrary medical claims and supports genuine skip',()=>{
    expect(followupDecisionSchema.safeParse({...decision,message:'Give two drops'}).success).toBe(false);
    expect(composeFollowup({...decision,shouldSend:false,intent:'skip',reason:'no_useful_context',sourceId:null,petId:null},context,'en')).toBeNull();
  });
  it('exact pause/resume commands do not mistake symptom narrative for navigation or opt-in',()=>{
    expect(followupCommand('PAUSE')).toBe('pause');expect(followupCommand('พัก')).toBe('pause');expect(followupCommand('ติดตามต่อ')).toBe('resume');expect(followupCommand('วันนี้น้องพักบ่อยและกินน้อย')).toBeNull();
  });
  it('two silent contacts on one unchanged source pause that topic until a new reply or edit',()=>{
    const repeated={...context,recentOutreach:[{sourceId:source,sourceUpdatedAt:context.sources[0]!.updatedAt,date:'2026-10-01T03:00:00Z',opened:false,replyCount:0},{sourceId:source,sourceUpdatedAt:context.sources[0]!.updatedAt,date:'2026-10-08T03:00:00Z',opened:false,replyCount:0}]};
    expect(()=>validateDecision(decision,repeated)).toThrow();
    expect(validateDecision(decision,{...repeated,replies:[{sourceId:source,petId:pet,date:'2026-10-10T03:00:00Z',content:'An update',correlation:'most_recent_followup_not_verified'}]})).toBeTruthy();
    expect(validateDecision(decision,{...repeated,sources:[{...context.sources[0]!,updatedAt:'2026-10-10T03:00:00Z'}]})).toBeTruthy();
  });
  it('membership deleted between the initial pet check and membership lock cancels a shared-pet send',async()=>{
    const query=vi.fn().mockResolvedValueOnce({rows:[{id:source,pet_id:pet,updated_at:new Date(context.sources[0]!.updatedAt)}],rowCount:1}).mockResolvedValueOnce({rows:[{id:pet,owner_id:randomUUID()}],rowCount:1}).mockResolvedValueOnce({rows:[],rowCount:0});
    expect(await lockCurrentSource({query} as unknown as PoolClient,randomUUID(),{...context.sources[0]!,source:'booklet'})).toBe(false);
  });
  it('uses the exact Peony journal scenario to ask a grounded ear question without diagnosis or dose advice',()=>{
    const ear=randomUUID(),weight=randomUUID(),dated:FollowupContext={today:'2026-10-12',pets:[{id:pet,name:'พีโอนี',species:'cat'}],sources:[
      {id:weight,petId:pet,source:'journal',kind:'memory',date:'2026-09-15T00:00:00+07:00',updatedAt:'2026-09-15T03:00:00Z',title:'บันทึกของเรา',text:'ไอ่อ้วนน้ำหนัก 4.3 แล้ว กว่าจะหนักเกิน 4 โลได้ อาหารเม็เปลามมี่ดีจริงๆ'},
      {id:ear,petId:pet,source:'journal',kind:'memory',date:'2026-09-29T00:00:00+07:00',updatedAt:'2026-09-29T03:00:00Z',title:'บันทึกของเรา',text:'เพิ่งไปหยอดหลังคอเพื่อรักษาอาการไรหู ไรหูเยอะมากแค่หยอดหลังคอไม่ไหว ได้ยาหยอดหูมา หมอบอกน้องต้องโดนหยอด 7 วันเลย แต่ถ้าหายแล้วก็นานทีหยอด'}]};
    const chosen={...decision,sourceId:ear,intent:'care_checkin' as const,topic:'ear' as const,reason:'ongoing_care' as const};
    const text=composeFollowup(chosen,dated,'th')!;expect(text).toContain('พีโอนี');expect(text).toContain('29');expect(text).toContain('เกาหูหรือสะบัดหัว');expect(text).not.toMatch(/หยอด|7 วัน|4.3|วินิจฉัย|ไรหู/);
    expect(()=>composeFollowup({...chosen,sourceId:weight},dated,'th')).toThrow();
  });
});
