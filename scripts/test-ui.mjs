import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
// Tests local sample mode and a mocked finder session. Never calls LINE or AI.
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('UI smoke tests require a local server');
await mkdir('.verification',{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.screenshot({path:'.verification/landing-desktop.png',fullPage:true});
  await page.goto(`${origin}/app`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ลองดูพื้นที่ตัวอย่างก่อน'}).click();
  await page.getByRole('button',{name:'ความทรงจำ',exact:true}).first().click();
  await page.getByRole('button',{name:'เพิ่มข้อความ',exact:true}).click();
  await page.getByLabel('เนื้อหา').fill('ทดสอบบันทึกความทรงจำ');
  const element=page.getByRole('button',{name:'ทดสอบบันทึกความทรงจำ ลากเพื่อย้าย หรือใช้ปุ่มลูกศร'});
  const box=await element.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+70,{steps:8});await page.mouse.up();
  expect(Math.abs((await element.boundingBox()).x-box.x)).toBeGreaterThan(15);
  await element.focus();await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'บันทึก',exact:true}).click();
  await expect(page.getByText('บันทึกในเบราว์เซอร์นี้แล้ว',{exact:true})).toBeVisible();
  await page.screenshot({path:'.verification/journal-desktop.png',fullPage:true});
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ลองดูพื้นที่ตัวอย่างก่อน'}).click();
  await page.getByRole('button',{name:'ความทรงจำ',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'ทดสอบบันทึกความทรงจำ ลากเพื่อย้าย หรือใช้ปุ่มลูกศร'})).toBeVisible();
  await page.getByLabel('คำสั่งตกแต่งสมุด').fill('โทนพาสเทล');
  await page.getByRole('button',{name:'สร้างแบบร่าง',exact:true}).click();
  await expect(page.getByText('การตกแต่งด้วย AI ต้องเข้าสู่ระบบจริง',{exact:false})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:'.verification/journal-mobile.png',fullPage:true});
  await page.goto(`${origin}/emergency`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.context().setOffline(true);await page.reload();
  await expect(page.locator('h1')).toContainText('ไปโรงพยาบาลสัตว์ทันที');
  expect(errors).toEqual([]);
  const finderContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  try{
    await finderContext.addInitScript(()=>sessionStorage.setItem('chordjai.session','ui-test-session'));
    const finderRequests=[];
    await finderContext.route('**/api/v1/**',async route=>{
      const request=route.request();finderRequests.push(new URL(request.url()).pathname);
      if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/v1/pets'){
        await route.fulfill({contentType:'application/json',body:JSON.stringify({data:[]})});
      }else await route.abort();
    });
    const finder=await finderContext.newPage();finder.on('pageerror',error=>errors.push(error.message));
    await finder.goto(`${origin}/app`,{waitUntil:'networkidle'});
    await finder.getByRole('button',{name:'ฉันพบสัตว์ · ค้น PetID',exact:true}).click();
    await expect(finder.getByRole('heading',{name:'ช่วยพาน้องที่พบกลับบ้าน'})).toBeVisible();
    await expect(finder.getByRole('heading',{name:'พบสัตว์ที่กำลังหาบ้าน?'})).toBeVisible();
    await expect(finder.locator('label').filter({hasText:'เลือกรูปน้องที่พบ'}).locator('input[type=file]')).toHaveCount(1);
    await expect(finder.getByRole('button',{name:'ลงทะเบียน PetID',exact:true})).toHaveCount(0);
    expect(finderRequests).toEqual(['/api/v1/pets']);
    expect(await finder.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await finder.screenshot({path:'.verification/petid-finder-mobile.png',fullPage:true});
  }finally{await finderContext.close();}
  expect(errors).toEqual([]);
  console.log('Passed: journal drag/keyboard/save/reload, explicit AI demo state, mobile layout, offline emergency, PetID finder without owned pets, no browser errors.');
}finally{await browser.close();}
