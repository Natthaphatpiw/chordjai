import {describe,it,expect} from 'vitest';
import {agentTaskId,agentEntryParams,agentDestinationPath,agentTaskDestination} from '../frontend/owner-app/components/agent-result-model';
const task='10101010-1010-4010-8010-101010101010',pet='20202020-2020-4020-8020-202020202020',entry='30303030-3030-4030-8030-303030303030';
describe('private agent completion destinations',()=>{
 it('accepts UUID task IDs and rejects capability/script/oversized identifiers',()=>{expect(agentTaskId(task)).toBe(task);for(const value of [null,'','javascript:alert(1)','../../identity','x'.repeat(1000)])expect(agentTaskId(value)).toBe(null);});
 it('reads known LIFF state params without navigating to or trusting its other values',()=>{
  const query=agentEntryParams(`https://www.chordjai.life/app?liff.state=${encodeURIComponent(`?tab=health&agentTaskId=${task}&petId=${pet}&lang=en&redirect=https://attacker.test`)}`);
  expect(query.get('agentTaskId')).toBe(task);expect(query.get('tab')).toBe('health');expect(query.get('petId')).toBe(pet);expect(query.get('lang')).toBe('en');expect(query.has('redirect')).toBe(false);
 });
 it('does not override explicit params or accept an absolute malicious LIFF state URL',()=>{
  expect(agentEntryParams(`https://www.chordjai.life/app?agentTaskId=${task}&liff.state=${encodeURIComponent('?agentTaskId=wrong')}`).get('agentTaskId')).toBe(task);
  expect(agentEntryParams(`https://www.chordjai.life/app?liff.state=${encodeURIComponent('https://attacker.test/?agentTaskId='+task)}`).get('agentTaskId')).toBe(null);
 });
 it('allows only the owner app and recognised destination fields, never an open redirect',()=>{
  for(const value of ['https://attacker.test/app','//attacker.test/app','javascript:alert(1)','/api/v1/identity','/app/../privacy','/application','/app\\attacker'])expect(agentDestinationPath(value)).toBe(null);
  const result=agentDestinationPath(`/app?tab=health&petId=${pet}&entryId=${entry}&agentTaskId=${task}&redirect=https://attacker.test&lang=en`);
  expect(result).toBe(`/app?tab=health&petId=${pet}&entryId=${entry}&lang=en`);
 });
 it('drops invalid IDs/unknown tab, and retains exact appointment links',()=>{
  expect(agentDestinationPath('/app?tab=delete&petId=not-a-pet&entryId=%3Cscript%3E')).toBe('/app');
  expect(agentDestinationPath(`/app?tab=care&appointmentId=${entry}`)).toBe(`/app?tab=care&appointmentId=${entry}`);
 });
 it('selects a safe result destination and current pet from task-owned output',()=>{
  expect(agentTaskDestination({id:task,status:'completed',result:{message:'Saved',path:`/app?tab=health&petId=${pet}&entryId=${entry}`,petId:pet}})).toMatchObject({tab:'health',petId:pet});
  expect(agentTaskDestination({id:task,status:'completed',result:{path:'https://attacker.test'},results:[{path:`/app?tab=journal&petId=${pet}&pageId=${entry}`}]})).toEqual({path:`/app?tab=journal&petId=${pet}&pageId=${entry}`,petId:pet,tab:'journal'});
  expect(agentTaskDestination({id:task,status:'failed',result:null})).toEqual({path:null,petId:null,tab:null});
 });
});
