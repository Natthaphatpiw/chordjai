// Local browser fixtures only: no real accounts, private storage, AI, or LINE calls.
import {chromium,expect} from '@playwright/test';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const origin=process.env.CLINIC_UI_TEST_ORIGIN||'http://localhost:3001';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Passport UI verification requires a local server');
await mkdir('.verification/passport',{recursive:true});
const ids={pet:'10101010-1010-4010-8010-101010101010',clinic:'20202020-2020-4020-8020-202020202020',otherClinic:'30303030-3030-4030-8030-303030303030',session:'40404040-4040-4040-8040-404040404040',snapshot:'50505050-5050-4050-8050-505050505050',media:'60606060-6060-4060-8060-606060606060'};
const photo=await sharp({create:{width:96,height:128,channels:3,background:'#ffad50'}}).jpeg().toBuffer();
const doc={protocol:'passport-intake-v1',sessionId:ids.session,petId:ids.pet,language:'th',pet:{name:'Peony fixture',species:'cat',sex:'female',birthDate:null,weightKg:4.3},concern:'Ear scratching after the previous visit',episodeId:null,answers:[{questionId:'onset',status:'unknown',value:'',attempts:2,updatedAt:'2026-10-12T02:00:00Z',question:{id:'onset',text:'คำถามไทยที่บันทึกไว้',help:'คำอธิบายไทย',choices:[],rephrased:true}},{questionId:'ear_side',status:'answered',value:'Both ears',attempts:1,updatedAt:'2026-10-12T02:01:00Z',question:{id:'ear_side',text:'เป็นที่หูข้างไหน?',help:'คำอธิบายไทย',choices:[],rephrased:false}}],history:[],mediaIds:[ids.media],emergency:{urgent:true,codes:['difficulty_breathing'],message:'ข้อความระบบภาษาไทยเดิม'},summary:{concern:'Ear scratching after the previous visit',answeredCount:1,unknownQuestionIds:['onset'],notApplicableQuestionIds:[]},provenance:'owner_reported',confirmedAt:'2026-10-12T02:10:00Z',sessionVersion:3};
const longMedicine='Owner-reported medicine label and prior care details. '.repeat(12);
doc.answers.push({questionId:'medications',status:'answered',value:longMedicine,attempts:1,updatedAt:'2026-10-12T02:02:00Z',question:{id:'medications',text:'คำถามยาไทยเดิม',help:'คำอธิบายไทย',choices:[],rephrased:false}},{questionId:'energy',status:'not_applicable',value:'',attempts:1,updatedAt:'2026-10-12T02:03:00Z',question:{id:'energy',text:'คำถามกิจกรรมไทยเดิม',help:'คำอธิบายไทย',choices:[],rephrased:false}});
doc.summary.answeredCount=2;doc.summary.notApplicableQuestionIds=['energy'];
const snapshot={id:ids.snapshot,sessionId:ids.session,petId:ids.pet,sessionVersion:3,confirmedAt:doc.confirmedAt,document:doc,canWrite:true};
const browser=await chromium.launch();const errors=[];
try{
  for(const locale of ['en','th']){
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),photoReads=[],mutations=[];let failedOnce=false;const notes=[];
    await context.addInitScript(()=>{sessionStorage.setItem('chordjai.session','clinic-passport-ui-fixture');window.__passportCreated=[];window.__passportRevoked=[];const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=value=>{const result=create(value);window.__passportCreated.push(result);return result;};URL.revokeObjectURL=value=>{window.__passportRevoked.push(value);revoke(value);};});
    await context.route('**/api/v1/**',async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname.replace('/api/v1','');let result;
      if(path.includes('/media/')){photoReads.push({url:request.url(),authorization:request.headers().authorization});await route.fulfill({contentType:'image/jpeg',body:photo,headers:{'Cache-Control':'private, no-store'}});return;}
      if(request.method()==='POST'){
        if(path!==`/clinic/passports/${ids.session}/notes`)throw new Error(`Unexpected mutation ${path}`);
        mutations.push(request.postDataJSON());if(!failedOnce){failedOnce=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}})});return;}
        const body=request.postDataJSON();result={id:'note-fixture',sessionId:ids.session,snapshotId:ids.snapshot,clinicId:ids.clinic,clinicName:'UI fixture clinic',authorId:'vet-fixture',createdAt:'2026-10-13T03:00:00Z',provenance:'clinician_authored',...body};notes.push(result);
      }else if(path==='/identity/me')result={id:'vet-fixture',displayName:'UI veterinarian',role:'vet'};
      else if(path==='/clinic/memberships')result=[{clinicId:ids.clinic,name:'UI fixture clinic',role:'vet'},{clinicId:ids.otherClinic,name:'Other fixture clinic',role:'staff'}];
      else if(path==='/clinic/appointments')result=[];
      else if(path===`/clinic/pets/${ids.pet}/passports`)result={clinicId:url.searchParams.get('clinicId'),sessions:url.searchParams.get('clinicId')===ids.clinic?[snapshot]:[]};
      else if(path===`/clinic/passports/${ids.session}`)result={snapshot,clinicId:ids.clinic,canWrite:true,notes,media:[{id:ids.media,url:`/api/v1/clinic/passports/${ids.session}/media/${ids.media}?clinicId=${ids.clinic}`}]};
      else throw new Error(`Unexpected API ${request.method()} ${path}`);
      await route.fulfill({contentType:'application/json',body:JSON.stringify({data:result})});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}/app?lang=${locale}`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Pet Passport',exact:true}).click();
    await page.getByLabel(locale==='en'?'Pet ID':'รหัสน้อง',{exact:true}).fill(ids.pet);
    await page.getByRole('button',{name:locale==='en'?'Find Passports':'ค้นหา Passport',exact:true}).click();
    await page.getByRole('button',{name:/Peony fixture · Ear scratching/}).click();
    await expect(page.getByRole('heading',{name:'Peony fixture',exact:true})).toBeVisible();
    await expect(page.locator('.passport-brief-photos img')).toHaveAttribute('src',/^blob:/);
    expect(await page.locator('.passport-brief-photos img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    expect(photoReads.length).toBeGreaterThan(0);for(const read of photoReads){expect(read.authorization).toBe('Bearer clinic-passport-ui-fixture');expect(read.url).not.toMatch(/token=|read=|Bearer/);}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    const overview=page.locator('.passport-brief-overview');await expect(overview.locator('[data-passport-overview]')).toHaveCount(8);
    await expect(overview.locator('[data-passport-overview="onset"] dd')).toHaveText(locale==='en'?'Owner does not know / cannot remember':'เจ้าของยังไม่ทราบ / จำไม่ได้');
    await expect(overview.locator('[data-passport-overview="frequency"] dd')).toHaveText(locale==='en'?'No answer recorded':'ยังไม่ได้บันทึกคำตอบ');
    await expect(overview.locator('[data-passport-overview="energy"] dd')).toHaveText(locale==='en'?'Owner marked this as not applicable':'เจ้าของระบุว่าไม่เกี่ยวข้อง');
    const fullAnswers=page.locator('.passport-brief-answers');await expect(fullAnswers).toHaveJSProperty('open',false);
    const medicine=overview.locator('[data-passport-overview="medications"]');expect(await medicine.locator('dd').innerText()).toContain(longMedicine.slice(0,240));expect(await medicine.locator('dd').innerText()).not.toContain(longMedicine);
    await medicine.getByRole('button',{name:locale==='en'?/Read full answer/:/อ่านคำตอบเต็ม/}).click();await expect(fullAnswers).toHaveJSProperty('open',true);
    await expect(fullAnswers.locator('[data-passport-answer="medications"] p')).toHaveText(longMedicine);
    await expect(fullAnswers.locator('[data-passport-answer="medications"] h3')).toBeFocused();
    if(locale==='en'){expect(await page.locator('body').innerText()).not.toMatch(/[ก-๙]/);await expect(fullAnswers.getByText('Owner does not know / cannot remember',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Was the first time before or after an event you can remember?',exact:true})).toBeVisible();}
    const form=page.locator('.clinic-passport-note-form');await form.getByLabel(locale==='en'?'Findings / assessment':'สิ่งที่ตรวจพบ / ประเมิน',{exact:true}).fill('Clinic observation fixture');
    await form.getByLabel(locale==='en'?'Home-care instructions':'คำแนะนำการดูแลที่บ้าน',{exact:true}).fill('Return for reassessment');
    await form.getByLabel(locale==='en'?'Follow-up appointment (Bangkok time)':'นัดติดตาม (เวลาไทย)',{exact:true}).fill('2026-10-20T10:30');
    const confirm=page.getByRole('button',{name:locale==='en'?'Confirm clinic note':'ยืนยันบันทึกคลินิก',exact:true});await expect(confirm).toBeDisabled();
    await form.getByRole('checkbox').check();await confirm.click();
    await expect(page.getByRole('button',{name:locale==='en'?'Retry the same note':'ลองบันทึกคำขอเดิมอีกครั้ง',exact:true})).toBeVisible();
    await expect(form.getByRole('textbox',{name:locale==='en'?'Findings / assessment':'สิ่งที่ตรวจพบ / ประเมิน',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:locale==='en'?'Retry the same note':'ลองบันทึกคำขอเดิมอีกครั้ง',exact:true}).click();
    await expect(page.locator('.clinic-passport-notice')).toBeVisible();expect(mutations).toHaveLength(2);expect(mutations[0]).toEqual(mutations[1]);expect(mutations[1].nextFollowupAt).toBe('2026-10-20T03:30:00.000Z');
    await page.getByRole('button',{name:locale==='en'?'Reload Passport and current access':'โหลด Passport และสิทธิ์ล่าสุด',exact:true}).click();
    await expect(page.locator('.passport-brief-clinic-notes').getByText('Clinic observation fixture',{exact:false})).toBeVisible();
    if(locale==='en')expect(await page.locator('body').innerText()).not.toMatch(/[ก-๙]/);
    await page.locator('.passport-brief').scrollIntoViewIfNeeded();await page.screenshot({path:`.verification/passport/clinic-passport-mobile-${locale}.png`,fullPage:true});
    await page.setViewportSize({width:1440,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    if(locale==='en')await page.screenshot({path:'.verification/passport/clinic-passport-desktop-en.png',fullPage:true});
    const revokedBefore=await page.evaluate(()=>window.__passportRevoked.length);
    await page.getByRole('button',{name:locale==='en'?'My clinics':'คลินิกของฉัน',exact:true}).click();
    expect(await page.evaluate(()=>window.__passportRevoked.length)).toBeGreaterThan(revokedBefore);
    await context.close();
  }
  expect(errors).toEqual([]);console.log('Clinic Passport TH/EN mobile/desktop, eight-field clinical overview with explicit unknowns and full-answer access, private photo blobs, immutable note retry, and cleanup passed.');
}finally{await browser.close();}
