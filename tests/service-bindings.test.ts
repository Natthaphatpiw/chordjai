import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

type Service={bindings?:{type:string;service:string;env:string}[]};
const configuration=JSON.parse(readFileSync(new URL('../backend/vercel.json',import.meta.url),'utf8')) as {services:Record<string,Service>};

describe('backend deployment service bindings',()=>{
 it('forms an acyclic graph accepted by Vercel Services',()=>{
  const visiting=new Set<string>(),visited=new Set<string>();
  function visit(name:string){
   if(visiting.has(name))throw new Error(`Circular service binding at ${name}`);
   if(visited.has(name))return;
   const service=configuration.services[name];expect(service,`Missing service ${name}`).toBeDefined();
   visiting.add(name);
   for(const binding of service.bindings??[])if(binding.type==='service')visit(binding.service);
   visiting.delete(name);visited.add(name);
  }
  for(const name of Object.keys(configuration.services))visit(name);
 });
 it('preserves agent ingress and scheduler bindings without a reverse assistant binding',()=>{
  expect(configuration.services.notification.bindings).toContainEqual({type:'service',service:'assistant',format:'url',env:'ASSISTANT_INTERNAL_URL'});
  expect(configuration.services.scheduler.bindings).toEqual(expect.arrayContaining([
   {type:'service',service:'assistant',format:'url',env:'ASSISTANT_INTERNAL_URL'},
   {type:'service',service:'notification',format:'url',env:'NOTIFICATION_INTERNAL_URL'},
  ]));
  expect(configuration.services.assistant.bindings??[]).toEqual([]);
 });
});
