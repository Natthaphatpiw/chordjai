import {describe,it,expect} from 'vitest';
import {evaluateRules,finalizeTriage,mergeSafetySignal,safeResult} from './rules.js';
describe('triage safety floor',()=>{
  it.each(['น้องหายใจไม่ออก','แมวฉี่ไม่ออก','อาเจียนเป็นเลือด','หมาถูกรถชน','แมวชัก','น้องกินพาราเซตามอล','น้องหมดสติ','เลือดไหลไม่หยุด','difficulty breathing','severe bleeding','my dog was hit by a car'])('identifies acute symptoms immediately: %s',symptoms=>{
    expect(evaluateRules('cat',symptoms).level).toBe(3);
  });
  it('does not let AI downgrade an emergency or urgent rule',()=>{
    expect(finalizeTriage(3,0,'high').severity).toBe(3);
    expect(finalizeTriage(2,1,'high').severity).toBe(2);
  });
  it('degrades safely without any AI response',()=>{
    expect(finalizeTriage(0,null)).toEqual({severity:1,degraded:true});
    expect(finalizeTriage(3,null)).toEqual({severity:3,degraded:true});
  });
  it('elevates missing safety data rather than assuming no symptom',()=>{
    expect(evaluateRules('cat','ซึม',{breathing:null}).level).toBe(2);
  });
  it('respects a true danger signal even when symptom prose reassures',()=>{
    expect(evaluateRules('dog','น้องสบายดี',{breathing:true}).level).toBe(3);
  });
  it('conflicting aliases never hide a positive signal or erase uncertainty',()=>{
    expect(mergeSafetySignal(false,true)).toBe(true);
    expect(mergeSafetySignal(null,false)).toBeNull();
  });
  it('keeps the same safety floor in English and translates every deterministic warning',()=>{
    for(const [symptoms,signals] of [['difficulty breathing',{}],['vomiting',{vomitCount24h:5}],['quiet',{breathing:null}],['not eating',{notEatingHours:25}]] as const){
      const thai=evaluateRules('cat',symptoms,signals);
      const english=evaluateRules('cat',symptoms,signals,'en');
      expect(english.level).toBe(thai.level);
      expect(english.hits.map(hit=>hit.id)).toEqual(thai.hits.map(hit=>hit.id));
      expect(JSON.stringify(safeResult(english.level,true,english.hits.map(hit=>hit.reason),'en'))).not.toMatch(/[\u0e00-\u0e7f]/);
    }
  });
});
