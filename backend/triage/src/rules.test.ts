import {describe,it,expect} from 'vitest';
import {evaluateRules,finalizeTriage,mergeSafetySignal} from './rules.js';
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
});
