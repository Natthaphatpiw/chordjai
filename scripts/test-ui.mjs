import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
// Tests local sample mode and a mocked finder session. Never calls LINE or AI.
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('UI smoke tests require a local server');
await mkdir('.verification',{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
// Keep every browser-side request local. The sample never authenticates with
// LINE, uploads media or calls OpenAI; public clinic reads use an empty fixture.
const apiRequests=[];
await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/v1/'))return route.continue();
  apiRequests.push({method:request.method(),path:url.pathname});
  if(request.method()==='GET'&&url.pathname==='/api/v1/clinics')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[]})});
  return route.abort();
});
async function appearance(target,name){
  await target.evaluate(()=>document.fonts.ready);
  expect(await target.evaluate(()=>getComputedStyle(document.body).fontFamily.toLowerCase())).toContain('mitr');
  // Copyright/registered/trademark symbols are text, despite Unicode assigning
  // them the Extended_Pictographic property for optional emoji presentation.
  expect(await target.evaluate(()=>/\p{Extended_Pictographic}/u.test(document.body.innerText.replace(/[©®™]/g,'')))).toBe(false);
  expect(await target.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  const images=target.locator('img');
  for(let index=0;index<await images.count();index++){
    const photo=images.nth(index);if(!await photo.isVisible())continue;
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(()=>photo.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);
    expect(await photo.evaluate(node=>new URL(node.currentSrc||node.src,location.href).origin)).toBe(origin);
  }
  await target.screenshot({path:`.verification/${name}.png`,fullPage:true});
}
async function tab(label){
  const mobile=page.viewportSize().width<760;
  if(label==='ตั้งค่าของเรา'&&mobile)return page.getByRole('button',{name:'เปิดตั้งค่าของเรา',exact:true}).click();
  const navigation=page.getByRole('navigation',{name:mobile?'เมนูมือถือ':'เมนูหลัก',exact:true});
  await navigation.getByRole('button',{name:mobile&&label==='คลินิกและ PetID'?'ดูแลน้อง':new RegExp(`^${label}`)}).click();
}
try{
  await page.goto(origin,{waitUntil:'networkidle'});
  await appearance(page,'landing-desktop');
  await page.goto(`${origin}/app`,{waitUntil:'networkidle'});
  await appearance(page,'login-desktop');
  await page.getByRole('button',{name:'ลองดูพื้นที่ตัวอย่างก่อน'}).click();
  await appearance(page,'owner-home-desktop');
  await page.getByRole('button',{name:'ความทรงจำ',exact:true}).first().click();
  await page.getByRole('button',{name:'อ่านสมุด',exact:true}).click();
  await page.getByRole('button',{name:'แก้ไขหน้านี้',exact:true}).click();
  await page.getByRole('button',{name:'ข้อความ',exact:true}).click();
  await page.getByLabel('เนื้อหา').fill('ทดสอบบันทึกความทรงจำ');
  const element=page.getByRole('button',{name:'ทดสอบบันทึกความทรงจำ ลากเพื่อย้าย หรือใช้ปุ่มลูกศร'});
  await element.scrollIntoViewIfNeeded();
  const box=await element.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+70,{steps:8});await page.mouse.up();
  expect(Math.abs((await element.boundingBox()).x-box.x)).toBeGreaterThan(15);
  await element.focus();await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'บันทึก',exact:true}).click();
  await expect(page.getByText('บันทึกในเบราว์เซอร์นี้แล้ว',{exact:true})).toBeVisible();
  await appearance(page,'journal-desktop');
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'ลองดูพื้นที่ตัวอย่างก่อน'}).click();
  await page.getByRole('button',{name:'ความทรงจำ',exact:true}).first().click();
  await page.getByRole('button',{name:'อ่านสมุด',exact:true}).click();
  await page.getByRole('button',{name:'แก้ไขหน้านี้',exact:true}).click();
  await expect(page.getByRole('button',{name:'ทดสอบบันทึกความทรงจำ ลากเพื่อย้าย หรือใช้ปุ่มลูกศร'})).toBeVisible();
  await page.locator('summary').filter({hasText:'ให้ AI ช่วยแต่ง'}).click();
  await page.getByLabel('คำสั่งตกแต่งสมุด').fill('โทนพาสเทล');
  await page.getByRole('button',{name:'สร้างแบบร่าง',exact:true}).click();
  await expect(page.getByText('การตกแต่งด้วย AI ต้องเข้าสู่ระบบจริง',{exact:false})).toBeVisible();
  await tab('สมุดสุขภาพ');
  await page.getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click();
  await page.getByLabel('ประเภทบันทึก').selectOption('weight');
  await page.getByLabel('ชื่อรายการ').fill('น้ำหนักที่บันทึกในตัวอย่าง');
  await page.getByLabel('น้ำหนัก (กิโลกรัม)').fill('4.35');
  await page.getByRole('button',{name:'บันทึกสุขภาพ',exact:true}).click();
  await expect(page.getByText('น้ำหนักที่บันทึกในตัวอย่าง · 4.35 กก.',{exact:true})).toBeVisible();
  await appearance(page,'owner-health-desktop');
  await page.getByRole('button',{name:/^ต้องไปหาหมอไหม/}).click();
  await page.locator('dialog').getByRole('checkbox').first().check();
  await page.locator('dialog').getByRole('button',{name:'ดูข้อมูลฉุกเฉิน',exact:true}).click();
  await expect(page.locator('dialog').getByRole('heading',{name:'ไปโรงพยาบาลสัตว์ทันที'})).toBeVisible();
  await page.getByRole('button',{name:'ปิดหน้าต่าง',exact:true}).click();
  await tab('ผู้ช่วยของเรา');
  await page.getByLabel('ข้อความถึงผู้ช่วย AI').fill('วันนี้ควรดูแลน้องอย่างไร');
  await page.getByRole('button',{name:'ส่งข้อความ',exact:true}).click();
  await expect(page.getByText('การคุยกับ AI ต้องเข้าสู่ระบบจริง',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'ตั้งค่าบุคลิกผู้ช่วย',exact:true}).click();
  await page.getByLabel('ชื่อที่อยากเรียก').fill('เพื่อนของน้อง');
  await page.getByRole('checkbox',{name:/อนุญาตใช้ความจำระยะยาว/}).check();
  await page.getByRole('button',{name:'บันทึกบุคลิก',exact:true}).click();
  await expect(page.getByRole('heading',{name:'คุยกับเพื่อนของน้อง',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^ความจำ \d+$/}).click();
  await page.getByLabel('เพิ่มความจำที่คุณเลือก').fill('น้องไม่ชอบเสียงดัง');
  await page.getByRole('button',{name:'จำเรื่องนี้ไว้',exact:true}).click();
  await expect(page.locator('dialog').getByText('น้องไม่ชอบเสียงดัง',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ปิดหน้าต่าง',exact:true}).click();
  await appearance(page,'owner-chat-desktop');
  await tab('คลินิกและ PetID');
  await expect(page.getByText('รายชื่อคลินิกจากฐานข้อมูลจริง',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'PetID & น้องหาย',exact:true}).click();
  await expect(page.getByRole('heading',{name:'พบสัตว์ที่กำลังหาบ้าน?',exact:true})).toBeVisible();
  await appearance(page,'owner-petid-desktop');
  await tab('ตั้งค่าของเรา');
  await page.getByRole('switch',{name:'รับข่าวสารของชิดใจ',exact:true}).check();
  await expect(page.getByText('เปลี่ยนตัวเลือกตัวอย่างแล้ว',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ลบบัญชีและข้อมูล',exact:true}).click();
  await expect(page.getByRole('button',{name:'ลบบัญชีของฉัน',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'ปิดหน้าต่าง',exact:true}).click();
  await appearance(page,'owner-settings-desktop');
  await page.setViewportSize({width:390,height:844});
  for(const[label,heading,screenshot]of[
    ['หน้าหลัก','วันนี้ของเรา','owner-home-mobile'],
    ['สมุดสุขภาพ','สมุดสุขภาพ','owner-health-mobile'],
    ['ความทรงจำ','สมุดความทรงจำ','journal-mobile'],
    ['ผู้ช่วยของเรา','คุยกับ','owner-chat-mobile'],
    ['คลินิกและ PetID','มีคนช่วยดูแล','owner-care-mobile'],
    ['ตั้งค่าของเรา','ตั้งค่าพื้นที่','owner-settings-mobile']
  ]){
    await tab(label);await expect(page.getByRole('heading',{level:1})).toContainText(heading);
    await appearance(page,screenshot);
  }
  await tab('คลินิกและ PetID');
  await page.getByRole('button',{name:'PetID & น้องหาย',exact:true}).click();
  await appearance(page,'owner-petid-mobile');
  for(const[path,heading,screenshot]of[
    ['/',null,'landing-mobile'],['/app',null,'login-mobile'],
    ['/privacy','ความเป็นส่วนตัว','privacy-mobile'],['/terms','เงื่อนไขการใช้บริการ','terms-mobile'],
    ['/ai-safety','AI','ai-safety-mobile'],['/s/ui-test-invalid-token','สรุปสุขภาพ','share-error-mobile'],
    ['/lost/ui-test-invalid-case',null,'lost-error-mobile'],['/invite/ui-test-invalid-code',null,'invite-mobile']
  ]){
    await page.goto(`${origin}${path}`,{waitUntil:'networkidle'});
    if(heading)await expect(page.getByRole('heading',{level:1})).toContainText(heading);
    if(path.startsWith('/s/')||path.startsWith('/lost/'))await expect(page.locator('.error-box[role="alert"]')).toBeVisible();
    await appearance(page,screenshot);
  }
  await page.goto(`${origin}/emergency`,{waitUntil:'networkidle'});
  await appearance(page,'emergency-mobile');
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.context().setOffline(true);await page.reload();
  await expect(page.locator('h1')).toContainText('ไปโรงพยาบาลสัตว์ทันที');
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
  const finderContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  try{
    await finderContext.addInitScript(()=>sessionStorage.setItem('chordjai.session','ui-test-session'));
    const finderRequests=[];
    await finderContext.route('**/api/v1/**',async route=>{
      const request=route.request();finderRequests.push(new URL(request.url()).pathname);
      if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/v1/identity/consents'){
        await route.fulfill({contentType:'application/json',body:JSON.stringify({data:[{purpose:'service',granted:true}]})});
      }else if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/v1/pets'){
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
    expect([...finderRequests].sort()).toEqual(['/api/v1/identity/consents','/api/v1/pets']);
    await appearance(finder,'petid-finder-mobile');
  }finally{await finderContext.close();}
  const englishContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  try {
    const english=await englishContext.newPage();english.on('pageerror',error=>errors.push(error.message));
    await englishContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await english.goto(`${origin}/app?lang=en`,{waitUntil:'networkidle'});
    await english.getByRole('button',{name:'Explore the demo first',exact:true}).click();
    await expect(english.getByRole('heading',{name:/Today, with.*Tofu/})).toBeVisible();
    expect(await english.locator('body').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
    await appearance(english,'owner-home-english-desktop');
    await english.getByRole('button',{name:'Health journal',exact:true}).first().click();
    await expect(english.getByRole('heading',{name:'Combined feline vaccine (FVRCP)',exact:true})).toBeVisible();
    await english.getByRole('button',{name:/Does my pet need a vet/}).click();
    await english.getByRole('checkbox',{name:'Trouble breathing, heavy panting, or pale/purple gums',exact:true}).check();
    await english.getByRole('button',{name:'View emergency information',exact:true}).click();
    await expect(english.getByRole('heading',{name:'Go to an animal hospital immediately',exact:true})).toBeVisible();
    expect(await english.locator('body').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
    await english.getByRole('button',{name:'Close dialog',exact:true}).click();
    const englishNav=english.getByRole('navigation',{name:'Main navigation',exact:true});
    for(const[label,heading]of[['Assistant','Chat with'],['Clinics & PetID','Find care nearby'],['Settings','Your space settings']]){
      await englishNav.getByRole('button',{name:new RegExp(`^${label}`)}).click();
      await expect(english.getByRole('heading',{level:1})).toContainText(heading);
      expect(await english.locator('body').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
    }
    await englishNav.getByRole('button',{name:'Clinics & PetID',exact:true}).click();
    await english.getByRole('button',{name:'PetID & missing pets',exact:true}).click();
    await expect(english.getByRole('heading',{name:'Found a pet looking for home?',exact:true})).toBeVisible();
    expect(await english.locator('body').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
    await english.getByRole('button',{name:'Memories',exact:true}).first().click();
    await english.getByRole('button',{name:'Read book',exact:true}).click();
    await english.getByRole('button',{name:'Edit page',exact:true}).click();
    await expect(english.getByLabel('Page title')).toHaveValue('A day with you');
    expect(await english.locator('body').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
    await english.getByLabel('Page title').fill('My personal page');
    await english.getByRole('button',{name:'Text',exact:true}).click();
    await english.getByLabel('Content').fill('A personal note to keep');
    const edited=english.getByRole('button',{name:'A personal note to keep Drag to move, or use the arrow keys',exact:true});
    await edited.focus();await english.keyboard.press('ArrowRight');
    const beforeSwitch=await edited.getAttribute('style');
    await appearance(english,'journal-english-desktop');
    await english.getByRole('group',{name:'Choose language'}).getByRole('button',{name:'Thai',exact:true}).click();
    await expect(english.getByLabel('ชื่อหน้าสมุด')).toHaveValue('My personal page');
    const retained=english.getByRole('button',{name:'A personal note to keep ลากเพื่อย้าย หรือใช้ปุ่มลูกศร',exact:true});
    await expect(retained).toBeVisible();
    expect(await retained.getAttribute('style')).toBe(beforeSwitch);
    await expect(english.getByText('ยังไม่ได้บันทึก',{exact:true})).toBeVisible();
    await english.setViewportSize({width:390,height:844});
    expect(await english.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  } finally {await englishContext.close();}
  expect(errors).toEqual([]);
  expect(apiRequests.every(request=>request.method==='GET'&&request.path==='/api/v1/clinics')).toBe(true);
  console.log('Passed: all six owner tabs on desktop/mobile, health entry and emergency triage, journal drag/keyboard/save/reload, explicit AI sample boundaries, personality and opted-in memory, PetID owner/finder, privacy/terms/AI/share/lost/invite, Mitr and loaded local photos, English demo/health/emergency/journal, language switching preserves unsaved journal edits, no decorative emoji or horizontal overflow, offline emergency, no browser errors or live provider calls.');
}finally{await browser.close();}
