import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';

// Explicit local fixtures only: no real admin approval, photo export, training,
// database, OpenAI, LINE or storage request can leave this intercepted context.
const origin=process.env.ADMIN_UI_TEST_ORIGIN||'http://localhost:3002';
const target=new URL(origin);
if(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='3002'||target.protocol!=='http:')throw new Error('PetID review UI tests require http://localhost:3002 or http://127.0.0.1:3002');
await mkdir('.verification',{recursive:true});
const token='local-admin-review-fixture-session',petId='00000000-0000-4000-8000-000000000001';
const sessionIds={retake:'11111111-0000-4000-8000-000000000001',different:'22222222-0000-4000-8000-000000000002',eligible:'33333333-0000-4000-8000-000000000003',stale:'44444444-0000-4000-8000-000000000004'};
const sampleIds=['00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000103'];
const mediaIds=['00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000203'];
const checkId='00000000-0000-4000-8000-000000000301',anchorId='00000000-0000-4000-8000-000000000302',reviewId='00000000-0000-4000-8000-000000000401';
const jpeg=await sharp(await readFile('frontend/owner-app/public/images/pet-home-cat.webp')).jpeg().toBuffer();
function fixture(kind){
  const consentVersion=kind==='stale'?5:3;
  return {session:{id:sessionIds[kind],petId,species:'cat',sampleCount:3,reviewStatus:'pending',consentVersion},samples:sampleIds.map((id,index)=>({id,mediaId:mediaIds[index],angle:['front','left','right'][index],url:'/unsafe-public-preview-must-not-be-used'})),check:{id:checkId,status:'completed',consentVersion,consistency:kind==='different'?'different':'possible_same',comparisonScope:'previous_session',referenceSessionId:anchorId,observations:['Visible coat markings were compared with the reference.'],limitations:'Image comparison alone is not identity proof.',samples:sampleIds.map((sampleId,index)=>({sampleId,quality:kind==='retake'&&index===1?'retake':'acceptable',issues:kind==='retake'&&index===1?['too_dark']:[],width:1200,height:1600}))},reviews:[],identityProof:false};
}
const fixtures=Object.fromEntries(Object.keys(sessionIds).map(kind=>[sessionIds[kind],fixture(kind)]));
let queue=Object.keys(sessionIds).map(kind=>({...fixtures[sessionIds[kind]].session,checkId,checkStatus:'completed',consistency:fixtures[sessionIds[kind]].check.consistency}));
let lostReview=false,lostManifest=false,staleRejected=false;
const calls=[],reviewCalls=[],manifestCalls=[],imageCalls=[],errors=[],downloadedPath='.verification/petid-review-manifest-fixture.json';
const exportId='00000000-0000-4000-8000-000000000501';
const manifest={version:'petid-dataset-v1',exportId,createdAt:'2026-10-12T04:00:00Z',policyVersion:'petid-training-2026-10-12',samples:[{sampleId:sampleIds[0],sessionId:sessionIds.eligible,petKey:'a'.repeat(64),ownerKey:'b'.repeat(64),species:'cat',angle:'front',captureDay:'2026-09-15',capturedAt:'2026-09-15T03:00:00Z',imageSha256:createHash('sha256').update(jpeg).digest('hex'),decodedSha256:'c'.repeat(64),dhash64:'1234567890abcdef',width:1200,height:1600,consentVersion:3,checkId,reviewId}]};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value!==null&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const manifestResult={manifest,manifestSha256:createHash('sha256').update(canonical(manifest)).digest('hex'),expiresAt:'2026-10-13T04:00:00Z'};
const kpis={users:0,pets:0,healthRecords:0,summaryViews:0,clinics:0,triageSessions:0,activeLostCases:0,journalPages:0,conversations:0,aiCostTodayUsd:0,deadJobs:0};
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await context.addInitScript(value=>sessionStorage.setItem('chordjai.session',value),token);
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/v1/'))return route.continue();
  expect(request.headers()['authorization']).toBe(`Bearer ${token}`);
  const path=url.pathname.slice('/api/v1'.length),method=request.method(),body=method==='POST'?request.postDataJSON():undefined;
  calls.push({path,method,body});
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
  const unavailable=()=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'Local fixture lost response'}})});
  if(method==='GET'){
    if(path==='/identity/me')return reply({id:'local-reviewer',displayName:'Local review tester',role:'admin'});
    if(path==='/analytics/kpis')return reply(kpis);
    if(['/analytics/jobs','/analytics/ai-requests','/clinics'].includes(path))return reply([]);
    if(path==='/biometric/review/queue')return reply({sessions:queue,identityProof:false});
    const binary=/^\/biometric\/review\/sessions\/([^/]+)\/media\/([^/]+)$/.exec(path);
    if(binary){expect(fixtures[binary[1]]).toBeDefined();expect(mediaIds).toContain(binary[2]);imageCalls.push({sessionId:binary[1],mediaId:binary[2],authorization:request.headers()['authorization']});return route.fulfill({contentType:'image/jpeg',headers:{'Cache-Control':'private, no-store'},body:jpeg});}
    const detail=/^\/biometric\/review\/sessions\/([^/]+)$/.exec(path);
    if(detail){expect(fixtures[detail[1]]).toBeDefined();return reply(fixtures[detail[1]]);}
  }
  const review=/^\/biometric\/review\/sessions\/([^/]+)$/.exec(path);
  if(review&&method==='POST'){
    reviewCalls.push({id:review[1],body});
    if(review[1]===sessionIds.stale){staleRejected=true;fixtures[sessionIds.stale].session.consentVersion=6;queue=queue.map(item=>item.id===sessionIds.stale?{...item,consentVersion:6}:item);return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'VERSION_CONFLICT',message:'Consent changed elsewhere'}})});}
    expect(review[1]).toBe(sessionIds.eligible);expect(body).toEqual({requestId:expect.stringMatching(/^[0-9a-f-]{36}$/),checkId,expectedConsentVersion:3,decision:'approved',evidenceKind:'clinic_record',evidenceReference:'CLINIC_FIXTURE_2026_17',evidenceNote:'Independent clinic identity evidence reviewed. No unnecessary personal or medical information appears in these fixture photos.',referenceSessionId:null,independentEvidenceConfirmed:true,privacyChecked:true});
    queue=queue.filter(item=>item.id!==sessionIds.eligible);fixtures[sessionIds.eligible].session.reviewStatus='approved';
    if(!lostReview){lostReview=true;return unavailable();}return reply({id:reviewId,decision:'approved'},201);
  }
  if(path==='/biometric/review/datasets'&&method==='POST'){
    manifestCalls.push(body);expect(body).toEqual({requestId:expect.stringMatching(/^[0-9a-f-]{36}$/),limit:500});
    if(!lostManifest){lostManifest=true;return unavailable();}return reply(manifestResult,201);
  }
  throw new Error(`Unmocked local review endpoint: ${method} ${path}`);
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
async function noOverflow(){expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);}
async function select(kind){await page.locator('.petid-review-item').filter({hasText:sessionIds[kind].slice(0,8)}).click();const detail=page.locator('.petid-review-detail');await expect(detail.getByRole('heading',{name:`Selected photo set · ${sessionIds[kind].slice(0,8)}`,exact:true})).toBeVisible();await expect(detail.getByRole('img',{name:'Pet photo for evidence review',exact:true})).toHaveCount(3);await expect.poll(()=>detail.locator('img').evaluateAll(images=>images.every(image=>image.src.startsWith('blob:')&&image.complete&&image.naturalWidth>0))).toBe(true);return detail;}
async function fillEvidence(detail){await detail.getByLabel('Evidence reference',{exact:true}).fill('CLINIC_FIXTURE_2026_17');await detail.getByLabel('Evidence reviewed and limitations',{exact:true}).fill('Independent clinic identity evidence reviewed. No unnecessary personal or medical information appears in these fixture photos.');await detail.getByRole('checkbox',{name:'I reviewed independent evidence for this pet, beyond owner attestation or AI alone',exact:true}).check();await detail.getByRole('checkbox',{name:'I checked for unnecessary people, medical documents and contact details in training photos',exact:true}).check();}
try{
  await page.goto(`${origin}/app?lang=en`,{waitUntil:'networkidle'});
  expect(calls.filter(call=>call.path.startsWith('/biometric/review'))).toHaveLength(0);
  await page.getByRole('navigation').getByRole('button',{name:'PetID evidence',exact:true}).click();
  const panel=page.locator('.petid-review-panel');await expect(panel.getByRole('heading',{name:'Review PetID photo sets',exact:true})).toBeVisible();await expect(panel.locator('.petid-review-item')).toHaveCount(4);
  const retake=await select('retake');await fillEvidence(retake);await expect(retake.getByRole('button',{name:'Record review',exact:true})).toBeDisabled();await expect(retake.getByText('Approval is blocked until the latest checks match current consent and every photo passes.',{exact:true})).toBeVisible();expect(reviewCalls).toHaveLength(0);
  const different=await select('different');await fillEvidence(different);await expect(different.getByText('AI result: Differences found; further evidence required',{exact:true})).toBeVisible();await expect(different.getByRole('button',{name:'Record review',exact:true})).toBeDisabled();expect(reviewCalls).toHaveLength(0);
  const eligible=await select('eligible');const save=eligible.getByRole('button',{name:'Record review',exact:true});await expect(save).toBeDisabled();
  await eligible.getByLabel('Evidence reference',{exact:true}).fill('CLINIC_FIXTURE_2026_17');await eligible.getByLabel('Evidence reviewed and limitations',{exact:true}).fill('Independent clinic identity evidence reviewed. No unnecessary personal or medical information appears in these fixture photos.');await expect(save).toBeDisabled();await eligible.getByRole('checkbox',{name:'I reviewed independent evidence for this pet, beyond owner attestation or AI alone',exact:true}).check();await expect(save).toBeDisabled();await eligible.getByRole('checkbox',{name:'I checked for unnecessary people, medical documents and contact details in training photos',exact:true}).check();await expect(save).toBeEnabled();
  await eligible.getByRole('combobox',{name:'Independent evidence',exact:true}).selectOption('verified_repeat_capture');await expect(save).toBeDisabled();await eligible.getByLabel('Approved reference photo set ID',{exact:true}).fill('not-a-uuid');await expect(save).toBeDisabled();await eligible.getByLabel('Approved reference photo set ID',{exact:true}).fill(anchorId);await expect(save).toBeEnabled();await eligible.getByRole('combobox',{name:'Independent evidence',exact:true}).selectOption('clinic_record');
  const styledSelect=await eligible.getByRole('combobox',{name:'Independent evidence',exact:true}).evaluate(select=>({height:select.getBoundingClientRect().height,radius:parseFloat(getComputedStyle(select).borderRadius),font:getComputedStyle(select).fontFamily,bodyFont:getComputedStyle(document.body).fontFamily}));expect(styledSelect.height).toBeGreaterThanOrEqual(48);expect(styledSelect.radius).toBeGreaterThanOrEqual(10);expect(styledSelect.font).toBe(styledSelect.bodyFont);
  await noOverflow();await page.screenshot({path:'.verification/petid-admin-evidence-mobile-en.png',fullPage:true});
  await save.click();await expect(panel.getByRole('alert')).toContainText('temporarily unavailable');await expect(eligible.getByLabel('Evidence reference',{exact:true})).toBeDisabled();await expect(eligible.getByRole('checkbox').first()).toBeDisabled();await eligible.getByRole('button',{name:'Retry the same review',exact:true}).click();await expect(panel.getByText('Review recorded. Reload the list to check current eligibility.',{exact:true})).toBeVisible();await expect(panel.locator('.petid-review-detail')).toHaveCount(0);expect(reviewCalls).toHaveLength(2);expect(reviewCalls[0]).toEqual(reviewCalls[1]);await expect(panel.locator('.petid-review-item')).toHaveCount(3);
  const stale=await select('stale');await fillEvidence(stale);await stale.getByRole('button',{name:'Record review',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('changed');expect(staleRejected).toBe(true);await stale.getByRole('button',{name:'Reload current evidence',exact:true}).click();const current=page.locator('.petid-review-detail');await expect(current.getByLabel('Evidence reference',{exact:true})).toBeEnabled();await expect(current.getByLabel('Evidence reference',{exact:true})).toHaveValue('');await fillEvidence(current);await expect(current.getByRole('button',{name:'Record review',exact:true})).toBeDisabled();await expect(current.getByText('Approval is blocked until the latest checks match current consent and every photo passes.',{exact:true})).toBeVisible();
  const dataset=panel.locator('.petid-dataset-box');await dataset.getByRole('button',{name:'Create an eligible dataset manifest',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('temporarily unavailable');await dataset.getByRole('button',{name:'Create an eligible dataset manifest',exact:true}).click();await expect(dataset.getByText('1 images in this dataset',{exact:false})).toBeVisible();expect(manifestCalls).toHaveLength(2);expect(manifestCalls[0]).toEqual(manifestCalls[1]);
  const downloadPromise=page.waitForEvent('download');await dataset.getByRole('button',{name:'Download dataset manifest',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe(`petid-manifest-${exportId}.json`);await download.saveAs(downloadedPath);const downloaded=JSON.parse(await readFile(downloadedPath,'utf8'));expect(downloaded).toEqual(manifestResult);expect(JSON.stringify(downloaded)).not.toMatch(/ownerId|petId|mediaId|"url"|https?:|Bearer|evidenceNote|evidenceReference/);
  expect(calls.filter(call=>/datasets\/.+\/samples|\/authorize|\/train|\/activate|\/internal|\/assistant|\/identity\/line/.test(call.path))).toHaveLength(0);expect(imageCalls.every(call=>call.authorization===`Bearer ${token}`)).toBe(true);
  expect(await panel.innerText()).not.toMatch(/[\u0e00-\u0e7f]/);await noOverflow();await page.setViewportSize({width:1280,height:1000});await noOverflow();await page.screenshot({path:'.verification/petid-admin-evidence-desktop-en.png',fullPage:true});
  await page.getByRole('button',{name:'Thai',exact:true}).click();await expect(panel.getByRole('heading',{name:'ตรวจชุดภาพ PetID',exact:true})).toBeVisible();await page.setViewportSize({width:390,height:844});await noOverflow();await page.screenshot({path:'.verification/petid-admin-evidence-mobile-th.png',fullPage:true});
  expect(errors).toEqual([]);
  console.log('PASS: admin-tab integration, current opted-in queue, bearer-authenticated binary preview converted to Blob images, retake/different/current-consent approval gates, required independent evidence and privacy, reviewed-anchor form gate, exact review/manifest retry IDs after lost 503 responses, consent-stale evidence reload, metadata-only manifest download with no photo export/training, English/Thai and 390px/desktop layout. All API and photo responses were local fixtures.');
}catch(error){console.error(error);await page.screenshot({path:'.verification/petid-admin-review-failure.png',fullPage:true});throw error;}finally{await context.close();await browser.close();}
