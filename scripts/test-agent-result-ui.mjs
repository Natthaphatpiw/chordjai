// All requests use a localhost server and explicit synthetic fixtures. No LINE,
// provider API, private storage, or real account is contacted.
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3337';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Agent UI tests require localhost');
await mkdir('.verification/line-agent',{recursive:true});
const taskId='10101010-1010-4010-8010-101010101010',petId='20202020-2020-4020-8020-202020202020',entryId='30303030-3030-4030-8030-303030303030',otherPet='40404040-4040-4040-8040-404040404040';
const pet={id:petId,name:'Tofu',species:'cat',sex:'unknown',neutered:null},now='2026-10-29T03:00:00Z';
const entry={id:entryId,petId,clientEntryId:entryId,createdBy:'owner',version:1,provenance:'owner_reported',kind:'visit',title:'Ear care visit',observedAt:now,narrative:'Went to the vet for ear care today.',clinicalNote:'',reflection:'',observations:{symptoms:[],severity:'unknown',appetite:'unknown',energy:'unknown',trend:'unknown',water:'unknown',toilet:'unknown',onsetAt:null,frequency:''},visit:{clinicName:null,reason:'Ear care',vetReportedFindings:'',treatment:'Owner-recorded care',nextFollowupAt:null},costs:[],mediaIds:[],photos:[],episodeId:null,shareWithClinic:false,shareCosts:false,canEdit:true,canEditReflection:true,createdAt:now,updatedAt:now};
const browser=await chromium.launch(),errors=[];
try{
 for(const locale of ['en','th']){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),calls=[];let denied=false,complete=false;
  await context.addInitScript(()=>sessionStorage.setItem('chordjai.session','synthetic-agent-result-fixture'));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/v1/'))return route.continue();
   calls.push({method:req.method(),path:url.pathname,auth:req.headers().authorization});
   const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
   if(req.method()!=='GET')throw new Error('The result viewer must not mutate user data');
   if(url.pathname==='/api/v1/pets')return send([{id:otherPet,name:'Another pet',species:'dog',sex:'unknown'},pet]);
   if(url.pathname==='/api/v1/identity/consents')return send([{purpose:'service',granted:true}]);
   if(url.pathname==='/api/v1/health/records')return send([]);
   if(url.pathname==='/api/v1/health/care/entries')return send(url.searchParams.get('petId')===petId?[entry]:[]);
   if(url.pathname===`/api/v1/health/care/entries/${entryId}`)return send(entry);
   if(url.pathname==='/api/v1/health/care/episodes')return send([]);
   if(url.pathname===`/api/v1/assistant/agent/tasks/${taskId}`){
    if(denied)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'AGENT_TASK_NOT_FOUND',message:'This task is unavailable'}})});
    const status=complete?'succeeded':'running';
    return send({id:taskId,status,title:locale==='en'?'Record Tofu’s visit':'บันทึกการพบหมอของถั่วเหลือง',language:locale,version:1,createdAt:now,updatedAt:now,result:status==='running'?null:{message:locale==='en'?'Saved your care update.':'บันทึกการดูแลเรียบร้อยแล้ว',path:`/app?tab=health&petId=${petId}&entryId=${entryId}`,petId,resourceId:entryId,results:[{tool:'care.entries.create',name:'Ear care visit',path:`/app?tab=health&petId=${petId}&entryId=${entryId}`,petId,resourceId:entryId}]} });
   }
   throw new Error(`Unexpected API ${url.pathname}`);
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(locale==='en'?`${origin}/app?liff.state=${encodeURIComponent(`?tab=health&agentTaskId=${taskId}&lang=en`)}`:`${origin}/app?tab=health&agentTaskId=${taskId}&lang=${locale}`);
  const dialog=page.getByRole('dialog',{name:locale==='en'?'Your LINE assistant task':'งานจากผู้ช่วยใน LINE'});
  await expect(dialog).toBeVisible();await expect(dialog.getByText(locale==='en'?'Your assistant is working':'ผู้ช่วยกำลังทำงานให้คุณ',{exact:true})).toBeVisible();
  complete=true;await expect(dialog.getByText(locale==='en'?'Task completed':'ทำงานเรียบร้อยแล้ว',{exact:true})).toBeVisible({timeout:20000});
  await expect(page.locator('.pet-chip.selected')).toHaveText('Tofu');
  expect(calls.filter(call=>call.path.includes('/assistant/agent/tasks/')).every(call=>call.auth==='Bearer synthetic-agent-result-fixture')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.verification/line-agent/result-mobile-${locale}.png`});
  await dialog.getByRole('button',{name:locale==='en'?'Open the saved work':'เปิดหน้าที่บันทึกไว้',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`entryId=${entryId}`));
  await expect(page.locator(`#care-entry-${entryId}`)).toBeVisible();
  await expect(page.locator(`#care-entry-${entryId}`)).toHaveClass(/care-agent-linked/);
  await expect(page.locator('.pet-chip.selected')).toHaveText('Tofu');
  // A cross-account/erased task is represented by a protected error, not a
  // public result or a retry that invokes the original command again.
  denied=true;await page.goto(`${origin}/app?tab=health&agentTaskId=${taskId}&lang=${locale}`);
  await expect(dialog).toBeVisible();await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByText('Ear care visit',{exact:true})).toHaveCount(0);
  expect(calls.every(call=>call.method==='GET')).toBe(true);
  await context.close();
 }
 expect(errors).toEqual([]);console.log('Agent result UI: TH/EN, live status, protected task read, exact care entry, correct pet, mobile and no mutations passed.');
}finally{await browser.close();}
