import { describe, expect, it } from 'vitest';
import { bangkokLocalDateTime, careInstantKey, careLocalToIso, clinicalProjection, draftFromEntry, freshCareDraft, mergeCareEntries, moneyToMinor, moneyTotals, orderCareEntries, orderCareEpisodes, payloadFromDraft, safeCarePhoto, validExpenseDate, validateCareDraft } from '../../frontend/owner-app/components/care-diary-model';
import type { CareEntry, CareEpisode } from '../../frontend/owner-app/lib/care-types';
function entry(patch:Partial<CareEntry>={}):CareEntry {
  const draft=freshCareDraft('daily');draft.narrative='A quiet afternoon';
  return {...payloadFromDraft(draft,'Our afternoon'),id:'entry-1',petId:'pet-1',clientEntryId:'client-1',createdBy:'owner-1',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z',provenance:'owner_reported',version:1,photos:[],canEdit:true,canEditReflection:true,...patch};
}
describe('Care diary clinical boundaries and low-burden input',()=>{
  it('records a short narrative with unknown optional observations and no assumed cost',()=>{
    const draft=freshCareDraft();draft.narrative='  Ate a little less this morning.  ';
    expect(validateCareDraft(draft)).toBeNull();const payload=payloadFromDraft(draft,'A little change');
    expect(payload.narrative).toBe('Ate a little less this morning.');expect(payload.observations.appetite).toBe('unknown');expect(payload.costs).toEqual([]);expect(payload.visit).toBeNull();expect(payload.shareWithClinic).toBe(false);expect(payload.shareCosts).toBe(false);
  });
  it('parses exact monetary minor units without making blank unknown values zero',()=>{
    expect(moneyToMinor('')).toBeNull();expect(moneyToMinor('  ')).toBeNull();expect(moneyToMinor('1250.10')).toBe(125010);expect(moneyToMinor('0')).toBe(0);expect(moneyToMinor('12.345')).toBeNull();expect(moneyToMinor('1e4')).toBeNull();expect(moneyToMinor('-5')).toBeNull();expect(moneyToMinor('1000000')).toBe(100000000);expect(moneyToMinor('1000000.01')).toBeNull();
  });
  it('keeps paid and estimated expenses separate for each currency with no misleading zero',()=>{
    const totals=moneyTotals([entry({costs:[{label:'Visit',amountMinor:125010,currency:'THB',kind:'paid'},{label:'Follow-up estimate',amountMinor:200000,currency:'THB',kind:'estimate'},{label:'Prescription estimate',amountMinor:1020,currency:'USD',kind:'estimate'}]})]);
    expect(totals).toEqual([{currency:'THB',paid:125010,estimate:200000,count:2},{currency:'USD',paid:null,estimate:1020,count:1}]);expect(moneyTotals([entry()])).toEqual([]);
  });
  it('leaves legacy expense dates unknown instead of copying the diary date or today',()=>{
    const draft=draftFromEntry(entry({observedAt:'2026-10-12T01:00:00Z',costs:[{label:'Visit',amountMinor:125010,currency:'THB',kind:'paid'}]}));
    expect(draft.costs[0].expenseDate).toBe('');expect(payloadFromDraft(draft,'Visit').costs[0]).toMatchObject({amountMinor:125010,expenseDate:null});
  });
  it('preserves an explicit calendar expense date separately from the event and allows clearing it',()=>{
    const draft=draftFromEntry(entry({observedAt:'2026-10-12T01:00:00Z',costs:[{label:'Visit',amountMinor:125010,currency:'THB',kind:'paid',expenseDate:'2026-10-10'}]}));
    expect(draft.costs[0].expenseDate).toBe('2026-10-10');expect(payloadFromDraft(draft,'Visit').costs[0].expenseDate).toBe('2026-10-10');
    draft.costs[0].expenseDate='';expect(payloadFromDraft(draft,'Visit').costs[0]).toMatchObject({amountMinor:125010,expenseDate:null});expect(draft.observedLocal).toBe('2026-10-12T08:00');
  });
  it('validates optional expense calendar dates without imposing the diary event date',()=>{
    for(const value of ['',null,undefined,'2024-02-29','2026-01-01','2026-12-31','0001-01-01','9999-12-31'])expect(validExpenseDate(value)).toBe(true);
    for(const value of ['2025-02-29','2026-02-30','2026-13-01','2026-01-01T00:00:00Z','not a date','0000-01-01'])expect(validExpenseDate(value)).toBe(false);
    const draft=freshCareDraft();draft.narrative='A visit';draft.costs=[{id:'expense',label:'Consultation',amount:'10.25',currency:'THB',kind:'paid',expenseDate:'2025-02-29'}];expect(validateCareDraft(draft)).toBe('cost');
    draft.costs[0].expenseDate='2026-12-31';expect(validateCareDraft(draft)).toBeNull();
  });
  it('preserves Bangkok Gregorian calendar time regardless of browser timezone',()=>{
    expect(bangkokLocalDateTime('2026-10-11T18:30:00Z')).toBe('2026-10-12T01:30');expect(careLocalToIso('2026-10-12T01:30')).toBe('2026-10-11T18:30:00.000Z');expect(careLocalToIso('2025-02-29T12:00')).toBeNull();expect(careLocalToIso('2026-10-12T25:00')).toBeNull();expect(careLocalToIso('2569-10-12T12:00')).toBeNull();
  });
  it('rejects onset after the observation and follow-up before the event',()=>{
    const draft=freshCareDraft();draft.narrative='Noticed scratching';draft.observedLocal='2026-10-12T09:00';draft.onsetLocal='2026-10-12T10:00';expect(validateCareDraft(draft)).toBe('onset');draft.onsetLocal='2026-10-11T10:00';draft.followupLocal='2026-10-11T11:00';expect(validateCareDraft(draft)).toBe('followup');
  });
  it('requires an explicit separate clinical note before sharing and excludes costs when sharing is off',()=>{
    const draft=freshCareDraft();draft.narrative='My private detailed story';draft.shareWithClinic=true;expect(validateCareDraft(draft)).toBe('sharing');draft.clinicalNote='Scratchy ears since yesterday';draft.shareCosts=true;expect(payloadFromDraft(draft,'Ear update').shareCosts).toBe(true);draft.shareWithClinic=false;expect(payloadFromDraft(draft,'Ear update').shareCosts).toBe(false);
  });
  it('clinical preview includes only opted-in entries, without narrative/reflection/photos or unselected costs',()=>{
    const privateEntry=entry({id:'private',reflection:'I feel guilty',narrative:'private words'}), sharedEntry=entry({id:'shared',shareWithClinic:true,clinicalNote:'Eating normally again',reflection:'Do not export',narrative:'Do not export story',photos:[{mediaId:'secret-photo',url:'https://example.com/private.jpg'}],costs:[{label:'Visit',amountMinor:10000,currency:'THB',kind:'paid'}]});
    const summary=clinicalProjection([privateEntry,sharedEntry],[],true);expect(summary).toHaveLength(1);expect(summary[0]?.id).toBe('shared');expect(JSON.stringify(summary)).not.toContain('Do not export');expect(JSON.stringify(summary)).not.toContain('secret-photo');expect(summary[0]?.costs).toBeUndefined();expect(clinicalProjection([{...sharedEntry,shareCosts:true}],[],false)[0]?.costs).toBeUndefined();expect(clinicalProjection([{...sharedEntry,shareCosts:true}],[],true)[0]?.costs).toEqual(sharedEntry.costs);
  });
  it('does not load a different family member’s reflection into the edit form',()=>{
    const source=entry({reflection:'Author-only feelings',canEditReflection:false,photos:[{mediaId:'photo-1',url:'https://example.com/photo.jpg'}]});
    const draft=draftFromEntry(source);expect(draft.reflection).toBe('');expect(draft.photos).toEqual(source.photos);expect(draftFromEntry({...source,canEditReflection:true}).reflection).toBe(source.reflection);
  });
  it('rejects more than five photos and duplicate media ids without dropping existing photos',()=>{
    const draft=freshCareDraft();draft.narrative='A moment';draft.photos=Array.from({length:6},(_,i)=>({mediaId:String(i),url:'https://example.com/photo.jpg'}));expect(validateCareDraft(draft)).toBe('photos');expect(draft.photos).toHaveLength(6);draft.photos=[{mediaId:'same',url:'a'},{mediaId:'same',url:'b'}];expect(validateCareDraft(draft)).toBe('photos');
  });
  it('orders events by observation time instead of the date somebody entered a backdated history',()=>{
    const lateRecorded=entry({id:'older-event',observedAt:'2026-01-01T00:00:00Z',createdAt:'2026-10-12T00:00:00Z'}), recentEvent=entry({id:'recent-event',observedAt:'2026-10-11T00:00:00Z',createdAt:'2026-10-11T00:00:00Z'});const input=[lateRecorded,recentEvent];expect(orderCareEntries(input).map(item=>item.id)).toEqual(['recent-event','older-event']);expect(input[0]?.id).toBe('older-event');
  });
  it('orders same-time entries by descending id to match the keyset cursor',()=>{
    const time='2026-10-12T01:00:00.000Z';
    expect(orderCareEntries([entry({id:'a',observedAt:time,createdAt:'2026-10-12T03:00:00Z'}),entry({id:'b',observedAt:time,createdAt:'2026-10-12T02:00:00Z'})]).map(item=>item.id)).toEqual(['b','a']);
  });
  it('treats three/six/no-fraction representations and offset dates as the same instant',()=>{
    expect(careInstantKey('2026-10-12T01:00:00.000Z')).toBe(careInstantKey('2026-10-12T01:00:00.000000Z'));expect(careInstantKey('2026-10-12T01:00:00Z')).toBe(careInstantKey('2026-10-12T08:00:00.000000+07:00'));
    const values=[entry({id:'a',observedAt:'2026-10-12T01:00:00.000Z'}),entry({id:'b',observedAt:'2026-10-12T01:00:00.000000Z'})];expect(orderCareEntries(values).map(item=>item.id)).toEqual(['b','a']);expect(values[0]?.observedAt).toBe('2026-10-12T01:00:00.000Z');expect(values[1]?.observedAt).toBe('2026-10-12T01:00:00.000000Z');
  });
  it('retains microsecond order before the id tie-breaker for entries and episode cursors',()=>{
    const early='2026-10-12T01:00:00.000001Z',late='2026-10-12T01:00:00.000002Z';
    expect(orderCareEntries([entry({id:'z',observedAt:early}),entry({id:'a',observedAt:late})]).map(item=>item.id)).toEqual(['a','z']);
    const episode=(id:string,startedAt:string):CareEpisode=>({id,petId:'pet',createdBy:'author',clientEpisodeId:id,title:id,startedAt,resolvedAt:null,status:'ongoing',version:1,createdAt:startedAt,updatedAt:startedAt});
    const sorted=orderCareEpisodes([episode('z',early),episode('a',late)]);expect(sorted.map(item=>item.id)).toEqual(['a','z']);expect(sorted.at(-1)?.startedAt).toBe(early);
  });
  it('merges overlapping pages without duplicating events or overwriting a locally reloaded newer version',()=>{
    const current=entry({id:'b',version:3,narrative:'Latest copy'}),duplicate=entry({id:'b',version:1,narrative:'Old copy'}),older=entry({id:'a'});
    const merged=mergeCareEntries([current],[duplicate,older]);expect(merged).toHaveLength(2);expect(merged.find(item=>item.id==='b')?.version).toBe(3);expect(merged.find(item=>item.id==='b')?.narrative).toBe('Latest copy');
  });
  it('keeps memory image data limited to explicit demo JPEG/PNG/WebP and rejects script URLs',()=>{
    expect(safeCarePhoto('javascript:alert(1)',true)).toBe('');expect(safeCarePhoto('data:image/svg+xml;base64,PHN2Zz4=',true)).toBe('');expect(safeCarePhoto('data:image/jpeg;base64,aGVsbG8=',false)).toBe('');expect(safeCarePhoto('data:image/jpeg;base64,aGVsbG8=',true)).not.toBe('');
  });
});
