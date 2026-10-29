import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';

// Local synthetic records only. Every API is intercepted; third-party network
// and production accounts are never reached by this test.
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3342';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Localhost required');
await mkdir('.verification/record-mutations',{recursive:true});
const ids={pet:'10101010-1010-4010-8010-101010101010',record:'20202020-2020-4020-8020-202020202020',readonly:'30303030-3030-4030-8030-303030303030',entry:'40404040-4040-4040-8040-404040404040',episode:'50505050-5050-4050-8050-505050505050',passport:'60606060-6060-4060-8060-606060606060',page:'70707070-7070-4070-8070-707070707070'};
const stamp='2026-10-29T03:00:00Z',pet={id:ids.pet,name:'Peony',species:'cat',sex:'female',neutered:true};
const browser=await chromium.launch(),errors=[];let lastPage,lastCalls;
try{
 for(const locale of ['en','th']){
  const en=locale==='en',copy=(thai,english)=>en?english:thai;
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>sessionStorage.setItem('chordjai.session','local-record-mutation-fixture'));
  const calls=[];let conflict=true;
  let records=[{id:ids.record,petId:ids.pet,kind:'parasite',title:'Owner ear-care note',recordedAt:stamp,nextDueAt:null,notes:'Owner-reported visit',value:null,revision:'1'.repeat(32),canEdit:true,canDelete:true},{id:ids.readonly,petId:ids.pet,kind:'note',title:'Clinic original',recordedAt:stamp,notes:'Read-only clinical source',revision:'9'.repeat(32),canEdit:false,canDelete:false}];
  let episodes=[{id:ids.episode,petId:ids.pet,clientEpisodeId:ids.episode,createdBy:'owner',version:1,title:'Ear follow-up',status:'ongoing',startedAt:stamp,resolvedAt:null,createdAt:stamp,updatedAt:stamp,canEdit:true,canDelete:true}];
  const observations={symptoms:[],severity:'unknown',appetite:'unknown',energy:'unknown',trend:'unknown',water:'unknown',toilet:'unknown',onsetAt:null,frequency:''};
  let entries=[{id:ids.entry,petId:ids.pet,clientEntryId:ids.entry,createdBy:'owner',version:1,provenance:'owner_reported',kind:'daily',title:'A real diary stays',observedAt:stamp,narrative:'Synthetic diary text',clinicalNote:'',reflection:'',observations,visit:null,costs:[],mediaIds:[],photos:[],episodeId:ids.episode,shareWithClinic:false,shareCosts:false,canEdit:true,canDelete:true,canEditReflection:true,createdAt:stamp,updatedAt:stamp}];
  let passports=[{id:ids.passport,petId:ids.pet,version:1,status:'draft',language:locale,reason:'Prepare for ear care',episodeId:null,historyEntryIds:[],mediaIds:[],answers:[],emergency:{urgent:false,codes:[],message:''},history:[],photos:[],confirmation:null,clinicNotes:[],afterVisitEntryId:ids.entry,createdAt:stamp,updatedAt:stamp,nextQuestion:null,readyForReview:false}];
  let pages=[{id:ids.page,petId:ids.pet,title:'Our first memory',version:1,theme:{background:'#fffaf5',font:'sans',accent:'#ff8a24'},elements:[],canvasHeight:1422,storyDate:'2026-10-29',location:'Home',pageOrder:0,createdAt:stamp,updatedAt:stamp}];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/v1/'))return route.continue();
   const method=req.method(),body=req.headers()['content-type']?.includes('application/json')?req.postDataJSON():null,path=url.pathname;
   calls.push({method,path,body,key:req.headers()['idempotency-key']});
   const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
   const fail=(code,status=409)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code,message:code}})});
   if(path==='/api/v1/pets')return send([pet]);
   if(path==='/api/v1/identity/consents')return send([{purpose:'service',granted:true}]);
   if(path==='/api/v1/health/records')return send(records);
   if(path===`/api/v1/health/records/${ids.record}`){
    if(method==='GET')return send(records.find(row=>row.id===ids.record));
    if(method==='PATCH'){
     if(conflict){expect(body.revision).toBe('1'.repeat(32));conflict=false;records[0]={...records[0],title:'Changed on another device',notes:'New external details',revision:'2'.repeat(32)};return fail('VERSION_CONFLICT');}
     expect(body.revision).toBe('2'.repeat(32));expect(body).not.toHaveProperty('petId');records[0]={...records[0],...body,revision:'3'.repeat(32)};return send(records[0]);
    }
    if(method==='DELETE'){expect(body.revision).toBe('3'.repeat(32));records=records.filter(row=>row.id!==ids.record);return send({deleted:true});}
   }
   if(path==='/api/v1/health/care/entries')return send(entries);
   if(path===`/api/v1/health/care/entries/${ids.entry}`){if(method==='GET')return send(entries[0]);if(method==='DELETE'){expect(body.version).toBe(entries[0].version);entries=[];return send({deleted:true});}}
   if(path==='/api/v1/health/care/episodes')return send(episodes);
   if(path===`/api/v1/health/care/episodes/${ids.episode}`){
    if(method==='GET')return send(episodes[0]);
    if(method==='PATCH'){expect(body.version).toBe(1);episodes[0]={...episodes[0],...body,version:2};return send(episodes[0]);}
    if(method==='DELETE'){expect(body.version).toBe(2);episodes=[];entries=entries.map(row=>({...row,episodeId:null,version:row.version+1}));return send({deleted:true});}
   }
   if(path==='/api/v1/health/passport/sessions')return send(passports);
   if(path===`/api/v1/health/passport/sessions/${ids.passport}`){if(method==='GET')return send(passports[0]);if(method==='DELETE'){expect(body.version).toBe(1);passports=[];return send({deleted:true});}}
   if(path==='/api/v1/share/passports')return send([]);
   if(path==='/api/v1/journal/pages')return send(pages);
   if(path==='/api/v1/journal/books')return send(null);
   if(path===`/api/v1/journal/pages/${ids.page}`){if(method==='GET')return send(pages[0]);if(method==='DELETE'){expect(body.version).toBe(1);pages=[];return send({deleted:true});}}
   throw new Error(`Unexpected mutation fixture ${method} ${path}`);
  });
  const page=await context.newPage();lastPage=page;lastCalls=calls;page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/app?tab=health&lang=${locale}`);
  await page.getByRole('button',{name:copy('สมุดประจำตัวและวัคซีน','Booklet & vaccinations'),exact:true}).click();
  const readOnly=page.locator('.health-record').filter({has:page.getByRole('heading',{name:'Clinic original',exact:true})});
  await expect(readOnly.getByRole('button')).toHaveCount(0);
  const editButton=()=>page.getByRole('button',{name:copy('แก้ไขบันทึก Owner ear-care note','Edit record: Owner ear-care note'),exact:true});
  await editButton().click();let dialog=page.getByRole('dialog',{name:copy('แก้ไขบันทึกสุขภาพ','Edit health record'),exact:true});
  await dialog.getByLabel(copy('หมายเหตุ','Notes'),{exact:true}).fill('An unsaved change');
  page.once('dialog',event=>event.dismiss());await dialog.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByLabel(copy('หมายเหตุ','Notes'),{exact:true})).toHaveValue('An unsaved change');
  page.once('dialog',event=>event.accept());await dialog.getByRole('button',{name:copy('ยกเลิก','Cancel'),exact:true}).click();await expect(dialog).toHaveCount(0);expect(calls.filter(call=>call.method==='PATCH')).toHaveLength(0);
  await editButton().click();await dialog.getByLabel(copy('หมายเหตุ','Notes'),{exact:true}).fill('Reviewed owner correction');
  await dialog.getByRole('button',{name:copy('บันทึกการแก้ไข','Save changes'),exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByRole('button',{name:copy('บันทึกการแก้ไข','Save changes'),exact:true})).toBeDisabled();await expect(dialog.getByLabel(copy('หมายเหตุ','Notes'),{exact:true})).toHaveValue('Reviewed owner correction');
  page.once('dialog',event=>event.accept());await dialog.getByRole('button',{name:copy('โหลดฉบับล่าสุด','Load latest version'),exact:true}).click();await expect(dialog.getByLabel(copy('หมายเหตุ','Notes'),{exact:true})).toHaveValue('New external details');
  await dialog.getByLabel(copy('ชื่อรายการ','Title'),{exact:true}).fill('Corrected owner record');await dialog.getByLabel(copy('หมายเหตุ','Notes'),{exact:true}).fill('Reviewed owner correction');await dialog.getByRole('button',{name:copy('บันทึกการแก้ไข','Save changes'),exact:true}).click();await expect(dialog).toHaveCount(0);
  const deleteRecord=page.getByRole('button',{name:copy('ลบบันทึก Corrected owner record','Delete record: Corrected owner record'),exact:true});
  page.once('dialog',event=>{expect(event.message()).toContain('Peony');expect(event.message()).toContain('Corrected owner record');void event.dismiss();});await deleteRecord.click();expect(calls.filter(call=>call.method==='DELETE')).toHaveLength(0);
  await page.screenshot({path:`.verification/record-mutations/health-${locale}.png`});
  page.once('dialog',event=>event.accept());await deleteRecord.click();await expect(page.getByRole('heading',{name:'Corrected owner record',exact:true})).toHaveCount(0);await expect(readOnly).toBeVisible();
  await page.getByRole('button',{name:copy('ไดอารี่ดูแลน้อง','Care diary'),exact:true}).click();
  await page.getByRole('button',{name:copy('แก้ไขเรื่อง','Edit episode'),exact:true}).click();const episodeDialog=page.getByRole('dialog');
  await episodeDialog.getByLabel(copy('ชื่อเรื่องที่ดูแล','Care episode title'),{exact:true}).fill('Reviewed ear follow-up');await episodeDialog.getByLabel(copy('สถานะตอนนี้','Current status'),{exact:true}).selectOption('improving');await episodeDialog.getByRole('button',{name:copy('บันทึกการแก้ไข','Save changes'),exact:true}).click();await expect(episodeDialog).toHaveCount(0);
  await page.getByRole('button',{name:copy('แก้ไขเรื่อง','Edit episode'),exact:true}).click();page.once('dialog',event=>{expect(event.message()).toContain('Reviewed ear follow-up');void event.accept();});await episodeDialog.getByRole('button',{name:copy('ลบเรื่องที่ดูแล','Delete care episode'),exact:true}).click();await expect(episodeDialog).toHaveCount(0);await expect(page.getByRole('heading',{name:'A real diary stays',exact:true})).toBeVisible();expect(entries[0].episodeId).toBeNull();
  await page.getByRole('button',{name:copy('เตรียมพบคุณหมอ','Prepare for the vet'),exact:true}).click();const passportDialog=page.getByRole('dialog',{name:copy('Pet Passport · เตรียมพบหมอ','Pet Passport · Prepare for the vet'),exact:true});
  const deletePassport=passportDialog.getByRole('button',{name:copy('ลบ Passport Prepare for ear care','Delete Passport: Prepare for ear care'),exact:true});page.once('dialog',event=>event.dismiss());await deletePassport.click();expect(passports).toHaveLength(1);
  page.once('dialog',event=>{expect(event.message()).toContain('Peony');void event.accept();});await deletePassport.click();await expect(passportDialog.getByRole('heading',{name:'Prepare for ear care',exact:true})).toHaveCount(0);expect(entries).toHaveLength(1);await passportDialog.getByRole('button',{name:copy('ปิดหน้าต่าง','Close dialog'),exact:true}).click();
  const deleteDiary=page.getByRole('button',{name:'Delete A real diary stays',exact:true});
  if(en){page.once('dialog',event=>event.accept());await deleteDiary.click();await expect(page.getByRole('heading',{name:'A real diary stays',exact:true})).toHaveCount(0);}
  await page.goto(`${origin}/app?tab=journal&lang=${locale}`);await page.getByRole('button',{name:copy('อ่านสมุด','Read book'),exact:true}).click();const reader=page.getByRole('dialog',{name:'Our first memory',exact:true});
  page.once('dialog',event=>event.accept());await reader.getByRole('button',{name:copy('ลบหน้านี้','Delete page'),exact:true}).click();await expect(reader).toHaveCount(0);expect(pages).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(records).toHaveLength(1);expect(records[0].id).toBe(ids.readonly);await context.close();
 }
 expect(errors).toEqual([]);console.log('Record mutation UI: TH/EN mobile health edit/cancel/Escape/409/read-only/delete; episode edit/delete preserves diary; Passport delete preserves diary; Story versioned delete passed.');
}catch(error){if(lastPage){await lastPage.screenshot({path:'.verification/record-mutations/failure.png'}).catch(()=>{});await writeFile('.verification/record-mutations/failure.json',JSON.stringify({text:await lastPage.locator('body').innerText(),calls:lastCalls,errors},null,2));}throw error;}finally{await browser.close();}
