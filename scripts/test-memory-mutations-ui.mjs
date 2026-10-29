// Synthetic, localhost-only fixtures: no LINE, OpenAI or real user data.
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const origin=process.env.UI_TEST_ORIGIN||'http://localhost:3342';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Memory mutation UI checks require localhost');
await mkdir('.verification/record-mutations',{recursive:true});
const petId='11111111-1111-4111-8111-111111111111',conversationId='22222222-2222-4222-8222-222222222222';
const firstId='33333333-3333-4333-8333-333333333333',secondId='44444444-4444-4444-8444-444444444444';
const browser=await chromium.launch(),pageErrors=[];
try{
 for(const locale of ['en','th']){
  const t=(th,en)=>locale==='en'?en:th;
  const original=t('ชอบคำตอบสั้นและชัดเจน','Prefers short, clear answers.'),other=t('ชอบคำอธิบายทีละขั้น','Likes step-by-step explanations.');
  const updated=t('ชอบคำตอบกระชับและมีตัวอย่าง','Prefers concise answers with examples.'),unsent=t('ข้อความแชทที่ยังไม่ส่ง','Keep this unsent chat draft');
  const memories=[{id:firstId,content:original,kind:'preference',petId},{id:secondId,content:other,kind:'preference',petId:null}];
  const preferences={assistantName:'Buddy',tone:'warm',aboutUser:'Synthetic owner preference',memoryEnabled:true};
  const calls=[],confirmations=[];let rejectPatch=false;
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>sessionStorage.setItem('chordjai.session','synthetic-memory-mutation-fixture'));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/v1/'))return route.continue();
   const method=req.method(),path=url.pathname;calls.push({method,path,body:req.postDataJSON(),auth:req.headers().authorization});
   const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
   if(method==='GET'){
    if(path==='/api/v1/pets')return send([{id:petId,name:'Peony',species:'cat',sex:'unknown'}]);
    if(path==='/api/v1/identity/consents')return send([{purpose:'service',granted:true}]);
    if(path==='/api/v1/health/records')return send([]);
    if(path==='/api/v1/assistant/conversations')return send([{id:conversationId,petId,title:'Synthetic conversation'}]);
    if(path===`/api/v1/assistant/conversations/${conversationId}/messages`)return send([{id:'message-fixture',role:'assistant',content:'Synthetic chat history'}]);
    if(path==='/api/v1/assistant/preferences')return send(preferences);
    if(path==='/api/v1/assistant/memories')return send(memories);
   }
   if(path.startsWith('/api/v1/assistant/memories/')){
    const id=path.split('/').at(-1),index=memories.findIndex(item=>item.id===id);
    if(index<0)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'MEMORY_NOT_FOUND',message:'ไม่พบความทรงจำ'}})});
    if(method==='PATCH'){
     if(rejectPatch){rejectPatch=false;return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'FORBIDDEN',message:'ไม่มีสิทธิ์แก้ไข'}})});}
     const body=req.postDataJSON();expect(Object.keys(body)).toEqual(['content']);memories[index]={...memories[index],content:body.content};return send(memories[index]);
    }
    if(method==='DELETE'){memories.splice(index,1);return send({deleted:true});}
   }
   throw new Error(`Unexpected fixture API: ${method} ${path}`);
  });
  const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(`${origin}/app?tab=chat&lang=${locale}`);
  const chatDraft=page.getByRole('textbox',{name:t('ข้อความถึงผู้ช่วย AI','Message your AI assistant')});
  await expect(chatDraft).toBeVisible();await chatDraft.fill(unsent);
  await page.getByRole('button',{name:locale==='en'?/^Memory\s*2$/:/^ความจำ\s*2$/}).click();
  const dialog=page.getByRole('dialog',{name:t('สิ่งที่ผู้ช่วยจำเกี่ยวกับเรา','What your assistant remembers')});await expect(dialog).toBeVisible();
  const card=id=>dialog.locator(`[data-memory-id="${id}"]`);
  const edit=()=>dialog.getByRole('textbox',{name:t('แก้ไขความจำนี้','Edit this memory')});
  const save=()=>dialog.getByRole('button',{name:t('บันทึกการแก้ไข','Save changes'),exact:true});
  await card(firstId).getByRole('button',{name:t(`แก้ไขความจำ ${original}`,`Edit memory: ${original}`)}).click();
  await edit().fill('Cancelled edit');await dialog.getByRole('button',{name:t('ยกเลิก','Cancel'),exact:true}).click();
  await expect(card(firstId).getByText(original,{exact:true})).toBeVisible();expect(calls.filter(call=>call.method==='PATCH')).toHaveLength(0);
  await card(firstId).getByRole('button',{name:t(`แก้ไขความจำ ${original}`,`Edit memory: ${original}`)}).click();
  await edit().fill('   ');await expect(save()).toBeDisabled();await edit().fill(updated);await save().click();
  await expect(card(firstId).getByText(updated,{exact:true})).toBeVisible();await expect(card(secondId).getByText(other,{exact:true})).toBeVisible();
  expect(calls.filter(call=>call.method==='PATCH').map(call=>({path:call.path,body:call.body}))).toEqual([{path:`/api/v1/assistant/memories/${firstId}`,body:{content:updated}}]);
  await card(firstId).getByRole('button',{name:t(`แก้ไขความจำ ${updated}`,`Edit memory: ${updated}`)}).click();
  await edit().fill('Unsent edit after access changes');rejectPatch=true;await save().click();
  await expect(dialog.getByRole('alert')).toContainText(t('ไม่มีสิทธิ์แก้ไข','You do not have permission to access this item.'));
  await expect(edit()).toHaveValue('Unsent edit after access changes');expect(memories[0].content).toBe(updated);
  page.once('dialog',async prompt=>{confirmations.push(prompt.message());await prompt.dismiss();});
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(edit()).toHaveValue('Unsent edit after access changes');
  await dialog.getByRole('button',{name:t('ยกเลิก','Cancel'),exact:true}).click();
  page.once('dialog',async prompt=>{confirmations.push(prompt.message());await prompt.dismiss();});
  await card(firstId).getByRole('button',{name:t(`ลบความจำ ${updated}`,`Delete memory: ${updated}`)}).click();await expect(card(firstId)).toBeVisible();expect(calls.filter(call=>call.method==='DELETE')).toHaveLength(0);
  page.once('dialog',async prompt=>{confirmations.push(prompt.message());expect(prompt.message()).toContain(updated);expect(prompt.message()).toContain(t('อย่างถาวร','Permanently'));await prompt.accept();});
  await card(firstId).getByRole('button',{name:t(`ลบความจำ ${updated}`,`Delete memory: ${updated}`)}).click();await expect(card(firstId)).toHaveCount(0);await expect(card(secondId)).toBeVisible();
  expect(calls.filter(call=>call.method==='DELETE').map(call=>call.path)).toEqual([`/api/v1/assistant/memories/${firstId}`]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.verification/record-mutations/memory-${locale}.png`});
  await dialog.getByRole('button',{name:t('ปิดหน้าต่าง','Close dialog')}).click();await expect(chatDraft).toHaveValue(unsent);
  await page.getByRole('button',{name:t('ตั้งค่าบุคลิกผู้ช่วย','Assistant preferences')}).click();
  const settings=page.getByRole('dialog',{name:t('เลือกบุคลิกของผู้ช่วย',"Choose your assistant's personality")});
  await expect(settings.getByRole('textbox',{name:t('ชื่อที่อยากเรียก','Assistant name')})).toHaveValue('Buddy');
  await expect(settings.getByRole('textbox',{name:t('สิ่งที่อยากให้รู้เกี่ยวกับคุณ',"What you'd like the assistant to know")})).toHaveValue(preferences.aboutUser);
  await settings.getByRole('button',{name:t('ปิดหน้าต่าง','Close dialog')}).click();
  // Management remains available while optional memory usage is disabled.
  preferences.memoryEnabled=false;await page.reload();await page.getByRole('button',{name:locale==='en'?/^Memory\s*1$/:/^ความจำ\s*1$/}).click();
  await expect(dialog).toBeVisible();await card(secondId).getByRole('button',{name:t(`แก้ไขความจำ ${other}`,`Edit memory: ${other}`)}).click();
  await edit().fill('Updated while memory use is off');await save().click();await expect(card(secondId).getByText('Updated while memory use is off',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:t('จำเรื่องนี้ไว้','Remember this'),exact:true})).toBeDisabled();
  expect(calls.filter(call=>call.method!=='GET').every(call=>call.path.startsWith('/api/v1/assistant/memories/'))).toBe(true);
  expect(calls.every(call=>call.auth==='Bearer synthetic-memory-mutation-fixture')).toBe(true);expect(confirmations).toHaveLength(3);
  await context.close();
 }
 expect(pageErrors).toEqual([]);console.log('Memory UI: TH/EN edit/cancel/save, exact target, declined/confirmed delete, current ACL failure, dirty Escape, disabled-memory management, preserved chat/preferences and mobile layout passed.');
}finally{await browser.close();}
