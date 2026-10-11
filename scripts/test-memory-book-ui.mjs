import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Memory book tests require a local server');
await mkdir('.verification',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
const errors=[],requests=[];
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/v1/'))return route.continue();
  requests.push({path:url.pathname,method:route.request().method()});
  if(url.pathname==='/api/v1/clinics'&&route.request().method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[]})});
  return route.abort();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
async function noOverflow(){expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);}
async function save(){await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Saved in this browser.',{exact:true})).toBeVisible();}
async function back(){await page.getByRole('button',{name:'Back to book',exact:true}).click();await expect(page.getByRole('heading',{name:'Our memory book',exact:true})).toBeVisible();}
async function openBook(){await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('button',{name:'Memories',exact:true}).click();}
async function readerFits(){await expect(page.locator('dialog.memory-reader-dialog')).toHaveJSProperty('open',true);expect(await page.locator('.memory-reader-stage .journal-canvas').evaluate(node=>{const box=node.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.left>=0&&box.right<=innerWidth;})).toBe(true);expect(await page.locator('dialog.memory-reader-dialog').evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBe(true);}
async function photoRatio(){return page.locator('.memory-editor-canvas .journal-element.photo').evaluate(node=>{const box=node.getBoundingClientRect();return box.width/box.height;});}
try{
  await page.goto(`${origin}/app?lang=en`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Explore the demo first',exact:true}).click();await openBook();
  await expect(page.getByRole('heading',{name:'Our memory book',exact:true})).toBeVisible();
  await expect(page.locator('.memory-book-cover')).toBeVisible();await expect(page.locator('.memory-page-card')).toHaveCount(2);
  await page.getByRole('button',{name:'Edit cover',exact:true}).click();await page.getByLabel('Book title').fill('Our tiny adventures');await page.getByRole('button',{name:'Text',exact:true}).click();await page.getByLabel('Content').fill('Tofu and me, together');await save();await back();
  await expect(page.getByRole('heading',{name:'Our tiny adventures',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Read book',exact:true}).click();await readerFits();await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'Our memory book',exact:true})).toBeVisible();await expect(page.locator('.memory-book-cover')).toBeFocused();
  await page.getByRole('button',{name:'New page',exact:true}).click();await page.getByLabel('Page title').fill('A sunny park day');
  const input=page.locator('input[type=file]');await input.setInputFiles({name:'cat.jpg',mimeType:'image/webp',buffer:await readFile('frontend/owner-app/public/images/pet-home-cat.webp')});
  const photo=page.locator('.memory-editor-canvas .journal-element.photo');await expect(photo).toBeVisible();await expect(page.getByLabel('Item size')).toBeVisible();
  const originalRatio=await photoRatio();const originalBox=await photo.boundingBox();await page.getByRole('button',{name:'Make item smaller',exact:true}).click();expect(await photoRatio()).toBeCloseTo(originalRatio,2);expect((await photo.boundingBox()).width).toBeLessThan(originalBox.width);
  await page.getByRole('button',{name:'Make item larger',exact:true}).click();expect(await photoRatio()).toBeCloseTo(originalRatio,2);
  const resizedBox=await photo.boundingBox();const handle=photo.locator('.memory-resize-handle');await handle.scrollIntoViewIfNeeded();const corner=await handle.boundingBox();await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();await page.mouse.move(corner.x+corner.width/2-20,corner.y+corner.height/2-30,{steps:6});await page.mouse.up();expect((await photo.boundingBox()).width).toBeLessThan(resizedBox.width);expect(await photoRatio()).toBeCloseTo(originalRatio,2);
  // Exercise native two-finger touch -> PointerEvent handling, rather than calling
  // component state helpers from the test.
  await photo.scrollIntoViewIfNeeded();const pinchBox=await photo.boundingBox(),cx=pinchBox.x+pinchBox.width/2,cy=Math.max(90,Math.min(650,pinchBox.y+pinchBox.height/2));
  const client=await context.newCDPSession(page);const point=(id,x,y)=>({id,x,y,radiusX:1,radiusY:1,force:1});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,cx-22,cy),point(2,cx+22,cy)]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,cx-35,cy),point(2,cx+35,cy)]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  await expect.poll(async()=>(await photo.boundingBox()).width).toBeGreaterThan(pinchBox.width+5);expect(await photoRatio()).toBeCloseTo(originalRatio,2);
  expect(await page.locator('input[type=number]').count()).toBe(0);
  await page.getByRole('button',{name:'Date',exact:true}).click();await page.getByLabel('Memory date',{exact:true}).fill('2026-10-11');await page.getByLabel('Location',{exact:true}).fill('Our favourite park');await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Location',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Text',exact:true}).click();await page.getByLabel('Content').fill('A little adventure worth keeping');await save();await noOverflow();await page.screenshot({path:'.verification/memory-story-editor-en-mobile.png',fullPage:true});await back();
  await page.getByRole('button',{name:'Read book',exact:true}).click();await expect(page.getByText('Page 1 of 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('Page 2 of 2',{exact:true})).toBeVisible();await readerFits();await expect(page.locator('.memory-reader-caption').getByText('Our favourite park',{exact:true})).toBeVisible();await expect(page.locator('.memory-reader-caption').getByText('11 Oct 2026',{exact:true})).toBeVisible();await page.screenshot({path:'.verification/memory-story-reader-en-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Edit page',exact:true}).click();await expect(page.getByLabel('Page title')).toHaveValue('A sunny park day');await page.getByLabel('Page title').fill('An unsaved but precious memory');
  const rejectDialog=dialog=>dialog.dismiss();page.on('dialog',rejectDialog);await page.getByRole('button',{name:'Back to book',exact:true}).click();await expect(page.getByLabel('Page title')).toHaveValue('An unsaved but precious memory');page.off('dialog',rejectDialog);
  await page.getByRole('group',{name:'Choose language',exact:true}).getByRole('button',{name:'Thai',exact:true}).click();await expect(page.getByLabel('ชื่อหน้าสมุด')).toHaveValue('An unsaved but precious memory');await expect(page.getByText('ยังไม่ได้บันทึก',{exact:true})).toBeVisible();
  await page.getByRole('group',{name:'เลือกภาษา',exact:true}).getByRole('button',{name:'ภาษาอังกฤษ',exact:true}).click();await save();await back();
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Explore the demo first',exact:true}).click();await openBook();await expect(page.getByRole('heading',{name:'Our tiny adventures',exact:true})).toBeVisible();await expect(page.getByText('An unsaved but precious memory',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Read book',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.memory-reader-caption').getByRole('heading',{name:'An unsaved but precious memory',exact:true})).toBeVisible();await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.getByText('Page 1 of 2',{exact:true})).toBeVisible();await noOverflow();
  await page.setViewportSize({width:1440,height:1000});await readerFits();await page.getByRole('button',{name:'Book cover',exact:true}).click();await noOverflow();await page.screenshot({path:'.verification/memory-book-cover-en-desktop.png',fullPage:true});
  expect(errors).toEqual([]);expect(requests.every(request=>request.method==='GET'&&request.path==='/api/v1/clinics')).toBe(true);
  console.log('Passed: editable book cover, permanent saved pages and reload, full-viewport Story reader/escape/focusreturn/progress/previous/next, dates and places, photo upload, proportional +/-/corner/pinch resizing, no numeric size fields, unsaved page/locale preservation, responsive layouts and no live provider calls.');
}finally{await context.close();await browser.close();}
