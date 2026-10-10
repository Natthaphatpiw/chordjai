import { describe, expect, it, vi, beforeEach } from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@chordjai/db',()=>({withSystem:(fn:(db:unknown)=>unknown)=>fn({query})}));
import { runJobs } from './index';
beforeEach(()=>query.mockReset());
describe('durable worker invocation',()=>{
  it('starts its bounded batch concurrently and reports lost completion leases',async()=>{
    const jobs=[{id:'a',topic:'work',payload:{},lease_token:'la'},{id:'b',topic:'work',payload:{},lease_token:'lb'}];
    query.mockResolvedValueOnce({rows:jobs}).mockResolvedValueOnce({rows:[{accepted:false}]}).mockResolvedValueOnce({rows:[{accepted:true}]});
    let started=0; let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    const result=await runJobs({work:async()=>{started++;if(started===2)release();await barrier;}},2);
    expect(started).toBe(2);
    expect(result.map(row=>row.status)).toEqual(['lease_lost','completed']);
  });
  it('does not report a retry when another worker owns the failure lease',async()=>{
    query.mockResolvedValueOnce({rows:[{id:'a',topic:'missing',payload:{},lease_token:'la'}]}).mockResolvedValueOnce({rows:[{accepted:false}]});
    expect(await runJobs({})).toEqual([{id:'a',status:'lease_lost'}]);
  });
});
