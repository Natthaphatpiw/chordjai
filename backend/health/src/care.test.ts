import {describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {careEntryCreateSchema,careEpisodeUpdateSchema} from '@chordjai/contracts';
import {validateCareDates} from './care';
const base={petId:randomUUID(),clientEntryId:randomUUID(),kind:'daily',title:'Morning check-in',observedAt:'2026-01-01T08:00:00+07:00'};
describe('care contracts preserve uncertainty and exact amounts',()=>{
  it('defaults to private sharing and unknown observations instead of fabricated normal',()=>{
    const body=careEntryCreateSchema.parse(base);expect(body.shareWithClinic).toBe(false);expect(body.shareCosts).toBe(false);expect(body.observations.appetite).toBe('unknown');expect(body.observations.onsetAt).toBe(null);expect(body.visit).toBe(null);expect(body.costs).toEqual([]);
  });
  it('keeps a zero paid amount distinct from an absent cost and an estimate',()=>{
    const body=careEntryCreateSchema.parse({...base,costs:[{label:'Free consultation',amountMinor:0,currency:'THB'},{label:'Quoted test',amountMinor:105050,currency:'THB',kind:'estimate'}]});expect(body.costs.map(cost=>cost.kind)).toEqual(['paid','estimate']);expect(body.costs[0].amountMinor).toBe(0);
  });
  it('rejects fractional, negative, unbounded amounts and arbitrary currencies',()=>{
    for(const cost of [{amountMinor:1.5,currency:'THB'},{amountMinor:-1,currency:'THB'},{amountMinor:100000001,currency:'THB'},{amountMinor:20,currency:'XYZ'}])expect(careEntryCreateSchema.safeParse({...base,costs:[{label:'Bill',...cost}]}).success).toBe(false);
  });
  it('limits photos to five distinct IDs and symptoms to bounded labels',()=>{
    const id=randomUUID();expect(careEntryCreateSchema.safeParse({...base,mediaIds:[id,id]}).success).toBe(false);expect(careEntryCreateSchema.safeParse({...base,mediaIds:Array.from({length:6},()=>randomUUID())}).success).toBe(false);expect(careEntryCreateSchema.safeParse({...base,observations:{symptoms:Array.from({length:13},()=> 'Cough')}}).success).toBe(false);
  });
  it('requires timezone-aware dates and rejects impossible source dates',()=>{
    for(const observedAt of ['2026-01-01','2026-02-30T08:00:00Z','2026-01-01T08:00:00'])expect(careEntryCreateSchema.safeParse({...base,observedAt}).success).toBe(false);
  });
  it('rejects reversed onset or next appointment without guessing a date',()=>{
    const body=careEntryCreateSchema.parse({...base,observations:{onsetAt:'2026-01-02T08:00:00+07:00'}});expect(()=>validateCareDates(body)).toThrow();
    expect(()=>validateCareDates(careEntryCreateSchema.parse({...base,visit:{nextFollowupAt:'2025-12-31T08:00:00+07:00'}}))).toThrow();
  });
  it('does not put a resolution date on an ongoing episode',()=>expect(careEpisodeUpdateSchema.safeParse({version:1,title:'Cough',status:'ongoing',resolvedAt:'2026-01-01T08:00:00Z'}).success).toBe(false));
});
