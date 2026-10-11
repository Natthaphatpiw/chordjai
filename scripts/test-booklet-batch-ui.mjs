import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
// Local request fixtures only. No LINE, OpenAI, storage or production writes.
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Booklet tests require a local server');
await mkdir('.verification',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const petId='00000000-0000-4000-8000-000000000002',scanId='00000000-0000-4000-8000-000000000003';
const pet={id:petId,name:'Mochi',species:'cat',sex:'female',birthDate:'2023-04-05',neutered:true,weightKg:4.3};
const errors=[],requests=[],saveRequests=[],persisted=new Map();let uploadCount=0,ocrCount=0,failedOnce=false;
function data(route,value,status=200){return route.fulfill({status,contentType:'application/json',body:JSON.stringify({data:value})});}
await context.addInitScript(()=>sessionStorage.setItem('chordjai.session','local-booklet-fixture'));
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/v1/'))return route.continue();
  requests.push({method:request.method(),path:url.pathname});
  if(url.pathname==='/api/v1/pets'&&request.method()==='GET')return data(route,[pet]);
  if(url.pathname==='/api/v1/identity/consents')return data(route,[{purpose:'service',granted:true}]);
  if(url.pathname==='/api/v1/health/records'&&request.method()==='GET')return data(route,[]);
  if(url.pathname==='/api/v1/media/upload'){
    uploadCount++;const id=`00000000-0000-4000-8000-${String(uploadCount+20).padStart(12,'0')}`;
    return data(route,{id,url:`/api/v1/media/${id}?read=local-only`});
  }
  if(url.pathname==='/api/v1/health/ocr'){
    ocrCount++;const body=request.postDataJSON();expect(body.petId).toBe(petId);expect(body.imageUrls).toHaveLength(10);expect(body.imageUrl).toBeUndefined();
    return data(route,{scanId,pageCount:10,requiresConfirmation:true,records:[
      {kind:'vaccine',title:'FVRCP',recordedAt:'2025-05-24',nextDueAt:null,notes:'',value:null,sourcePage:1},
      {kind:'vaccine',title:'Rabies',recordedAt:null,nextDueAt:null,notes:'Date needs owner review.',value:null,sourcePage:9},
      {kind:'parasite',title:'Parasite prevention',recordedAt:'2025-06-01',nextDueAt:'2025-07-01',notes:'',value:null,sourcePage:10}
    ],warnings:['The value field was absent and was set to null.','EXP is unclear.','The lot number could not be read clearly.']});
  }
  if(url.pathname==='/api/v1/health/records'&&request.method()==='POST'){
    const body=request.postDataJSON(),key=request.headers()['idempotency-key'];saveRequests.push({key,body});
    expect(key).toBe(`ocr-${scanId}-${body.data.scanRecordIndex}`);
    let saved=persisted.get(key);if(!saved){saved={...body,id:`record-${persisted.size}`};persisted.set(key,saved);}
    if(body.title==='Rabies'&&!failedOnce){failedOnce=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'Temporary fixture failure'}})});}
    return data(route,saved,201);
  }
  throw new Error(`Unexpected booklet fixture request: ${request.method()} ${url.pathname}`);
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
async function photo(index){const png=await page.evaluate(index=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle=`hsl(${index*25},80%,80%)`;ctx.fillRect(0,0,96,128);ctx.fillStyle='#222';ctx.font='18px sans-serif';ctx.fillText(`Page ${index}`,8,40);return canvas.toDataURL('image/png').split(',')[1];},index);return{name:`page-${index}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')};}
async function snapshot(name,fullPage=true){await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);await page.screenshot({path:`.verification/${name}.png`,fullPage});}
try{
  await page.goto(`${origin}/app?lang=en&tab=health`,{waitUntil:'networkidle'});
  await expect(page.getByRole('heading',{name:'Health journal for Mochi',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Scan a vaccine booklet/}).click();
  const dialog=page.locator('dialog'),camera=dialog.getByLabel('Photograph a booklet page'),library=dialog.getByLabel('Choose booklet pages from your library');
  await camera.setInputFiles(await photo(1));await expect(dialog.locator('.booklet-page-grid>li')).toHaveCount(1);
  await library.setInputFiles([await photo(2),await photo(3)]);await expect(dialog.locator('.booklet-page-grid>li')).toHaveCount(3);
  expect(uploadCount).toBe(0);expect(ocrCount).toBe(0);
  const original=await dialog.locator('.booklet-page-grid img').evaluateAll(images=>images.map(image=>image.src));
  await dialog.getByRole('button',{name:'Move page 3 earlier',exact:true}).click();
  expect(await dialog.locator('.booklet-page-grid img').evaluateAll(images=>images.map(image=>image.src))).toEqual([original[0],original[2],original[1]]);
  await dialog.getByRole('button',{name:'Remove page 2',exact:true}).click();await expect(dialog.locator('.booklet-page-grid>li')).toHaveCount(2);
  const additions=[];for(let index=4;index<=11;index++)additions.push(await photo(index));await library.setInputFiles(additions);
  await expect(dialog.locator('.booklet-page-grid>li')).toHaveCount(10);
  await expect(dialog.getByRole('button',{name:'Take a page photo',exact:true})).toBeDisabled();
  await library.setInputFiles(await photo(12));await expect(dialog.locator('[role="alert"]')).toContainText('One batch can contain up to 10 pages');
  await expect(dialog.locator('.booklet-page-grid>li')).toHaveCount(10);expect(uploadCount).toBe(0);expect(ocrCount).toBe(0);
  await dialog.locator('.booklet-scroll').evaluate(node=>{node.scrollTop=0;});await snapshot('booklet-pages-10-mobile',false);
  await dialog.getByRole('button',{name:'Process all 10 pages',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:'3 entries from 10 pages',exact:true})).toBeVisible();
  expect(uploadCount).toBe(10);expect(ocrCount).toBe(1);expect(saveRequests).toHaveLength(0);
  await expect(dialog.locator('.booklet-help')).toHaveCount(1);await expect(dialog.locator('.booklet-help > ul > li')).toHaveCount(3);
  expect(await dialog.locator('.booklet-help').innerText()).not.toMatch(/\bnull\b|\bvalue\b|\bEXP\b/);
  await expect(dialog.getByText('The lot number could not be read clearly.',{exact:true})).toBeHidden();
  await dialog.getByText('More details to check (1)',{exact:true}).click();await expect(dialog.getByText('The lot number could not be read clearly.',{exact:true})).toBeVisible();
  await dialog.getByText('More details to check (1)',{exact:true}).click();
  await dialog.getByRole('checkbox').check();await expect(dialog.getByRole('button',{name:'Confirm and save 3 entries',exact:true})).toBeDisabled();
  await dialog.locator('.booklet-draft').nth(1).getByRole('button',{name:'Page 9',exact:true}).click();
  await expect(dialog.getByText('Original · Page 9',{exact:true})).toBeVisible();
  await dialog.locator('.booklet-draft').nth(1).getByLabel('Vaccination / treatment date').fill('2025-05-24');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.locator('.booklet-draft').nth(2).getByLabel('Next appointment (optional)').fill('2025-05-31');
  await dialog.getByRole('checkbox').check();await expect(dialog.getByRole('button',{name:'Confirm and save 3 entries',exact:true})).toBeDisabled();
  await expect(dialog.getByText('The appointment is before the recorded date. Please check the year in your booklet.',{exact:true})).toBeVisible();
  await dialog.locator('.booklet-draft').nth(2).getByLabel('Next appointment (optional)').fill('2025-07-01');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('heading',{name:'Scan a vaccine booklet',exact:true})).toBeInViewport();
  await snapshot('booklet-review-save-mobile',false);
  await dialog.locator('.booklet-scroll').evaluate(node=>{node.scrollTop=0;});await snapshot('booklet-review-mobile',false);
  await page.setViewportSize({width:1440,height:1100});await snapshot('booklet-review-desktop',false);
  await dialog.getByRole('button',{name:'Confirm and save 3 entries',exact:true}).click();
  await expect(dialog.locator('[role="alert"]')).toContainText('1 records saved');expect(saveRequests).toHaveLength(2);
  await dialog.getByRole('button',{name:'Save the remaining 2 entries',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.getByText('3 records confirmed and saved.',{exact:true})).toBeVisible();
  expect(saveRequests).toHaveLength(4);expect(persisted.size).toBe(3);expect(saveRequests[1]).toEqual(saveRequests[2]);expect(new Set(saveRequests.map(item=>item.key)).size).toBe(3);
  await page.setViewportSize({width:390,height:844});await snapshot('health-booklet-mobile');
  expect(await page.locator('body').innerText()).not.toMatch(/[\u0e00-\u0e7f]/);expect(errors).toEqual([]);
  console.log('Passed: booklet camera/library collection, ten-page cap, remove/reorder, no premature upload/OCR, one ordered batch request, one plain bullet-help box, empty-date correction, source-page review, mobile/desktop layout, partial-save retry with identical idempotency payloads, no live providers or browser errors.');
}finally{await context.close();await browser.close();}
