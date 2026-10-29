import {afterEach,describe,expect,it,vi} from 'vitest';
import {agentStage} from './agent-telemetry';
afterEach(()=>vi.restoreAllMocks());
describe('private LINE Agent stage telemetry',()=>{
 it('correlates fixed metadata without logging original IDs or arbitrary extra values',()=>{
  const log=vi.spyOn(console,'info').mockImplementation(()=>{}),privateId='private-owner-resource-id';
  agentStage('normalized',{turnId:privateId,taskId:privateId,ownerId:'PRIVATE_OWNER_CANARY'} as never,{route:'chat',status:'done',text:'PRIVATE_MEDICAL_CANARY'} as never);
  const first=JSON.parse(log.mock.calls[0][0]);expect(first).toMatchObject({event:'line_agent_stage',stage:'normalized',route:'chat',status:'done'});expect(first.turnRef).toMatch(/^[a-f0-9]{16}$/);expect(first.turnRef).toBe(first.taskRef);
  expect(JSON.stringify(first)).not.toMatch(/PRIVATE|private-owner|ownerId|text/);
 });
 it('drops free text, names, URLs and provider error bodies from every bounded detail',()=>{
  const log=vi.spyOn(console,'info').mockImplementation(()=>{});
  agentStage('delivery_failed',{deliveryId:'opaque'},{route:'owner name',status:'medical finding',kind:'https://liff.line.me/private',tool:'private tool content',errorCode:'provider token=secret',hasLiff:false});
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({event:'line_agent_stage',stage:'delivery_failed',deliveryRef:expect.stringMatching(/^[a-f0-9]{16}$/),hasLiff:false});
 });
 it('records delivery state and LIFF presence without recording the destination',()=>{
  const log=vi.spyOn(console,'info').mockImplementation(()=>{});
  agentStage('delivery_sent',{taskId:'opaque'},{status:'sent',kind:'succeeded:3',tool:'care.entries.create',hasLiff:true,errorCode:'AGENT_STALE_MESSAGE'});
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({kind:'succeeded',tool:'care.entries.create',hasLiff:true,errorCode:'AGENT_STALE_MESSAGE'});
 });
 it('never makes an application operation fail if the logger throws',()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{throw new Error('logging unavailable');});expect(()=>agentStage('task_queued',{taskId:'opaque'})).not.toThrow();
 });
});
