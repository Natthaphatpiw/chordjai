import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Owner production build/start must use API_ORIGIN=http://localhost:8787.
// This runner owns a disposable local API fixture; no real accounts or providers.
const origin = process.env.UI_TEST_ORIGIN || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Public locale checks require a local owner server');
const authored = ['ข้าวปั้น', 'แมวสีส้ม มีปลอกคอสีเขียว', 'บางรัก', 'คลินิกตัวอย่างเท่านั้น', 'ถนนตัวอย่าง', 'วัคซีนที่เจ้าของบันทึก', 'บันทึกต้นฉบับภาษาไทย','ติดตามการกิน','กินน้อยลงตั้งแต่วันก่อน','คำแนะนำที่เจ้าของรายงาน','ค่าตรวจที่อนุญาต'];
const requests = [];
const fixture = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost:8787').pathname;
  requests.push({ method: request.method, path });
  response.setHeader('Content-Type', 'application/json');
  let data;
  if (request.method === 'GET' && path === '/api/v1/clinics') data = [{ id: 'clinic-public-locale', name: authored[3], district: authored[2], address: authored[4], phone: '020000000', is24h: true, lat: 0, lng: 0 }];
  else if (request.method === 'GET' && path === '/api/v1/lostfound/public/locale-test') data = { petName: authored[0], species: 'cat', description: authored[1], district: authored[2] };
  else if (request.method === 'GET' && path === '/api/v1/share/public/locale-test') data = { pet: { id: 'pet-public-locale', name: authored[0], species: 'cat', birthDate: '2023-04-05', sex: 'female', neutered: true }, records: [{ id: 'record-public-locale', petId: 'pet-public-locale', kind: 'vaccine', title: authored[5], recordedAt: '2026-10-09', nextDueAt: '2027-10-09', notes: authored[6] }], careEntries:[{id:'care-public-locale',kind:'visit',title:authored[7],observedAt:'2026-10-10T03:30:00Z',clinicalNote:authored[8],provenance:'owner_reported',observations:{trend:'better',appetite:'reduced',onsetAt:'2026-10-09T10:00:00Z'},visit:{vetReportedFindings:authored[9]},costs:[{label:authored[10],amountMinor:125050,currency:'THB',kind:'paid'}],narrative:'PRIVATE_NARRATIVE_CANARY',reflection:'PRIVATE_REFLECTION_CANARY',photos:[{url:'PRIVATE_PHOTO_CANARY'}]}],careTruncated:true,createdAt: '2026-10-10', expiresAt: '2026-10-17' };
  else if (request.method === 'POST' && path === '/api/v1/lostfound/public/locale-test/tips') {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    expect(body.content).toBe('เห็นน้องริมสวนสาธารณะ');
    expect(body.district).toBe('ย่านที่ผู้พบกรอก');
    data = { warning: 'อย่าโอนเงินก่อนตรวจสอบว่าเป็นน้องจริง' };
  } else {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลในตัวอย่าง' } }));
    return;
  }
  response.end(JSON.stringify({ data }));
});
await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(8787, resolve); });
await mkdir('.verification', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const errors = [];
await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

async function appearance(locale, name) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('html').getAttribute('lang')).toBe(locale);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily.toLowerCase())).toContain('mitr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  let text = await page.locator('body').innerText();
  for (const value of authored) text = text.replaceAll(value, '');
  if (locale === 'en') expect(text).not.toMatch(/[\u0E00-\u0E7F]/);
  expect(/\p{Extended_Pictographic}/u.test(text.replace(/[©®™]/g, ''))).toBe(false);
  await page.screenshot({ path: `.verification/public-${name}-${locale}.png`, fullPage: true });
}

try {
  for (const locale of ['th', 'en']) {
    await page.goto(`${origin}/?lang=${locale}`, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(locale === 'en' ? /ChordJai/ : /ชิดใจ/);
    await appearance(locale, 'landing-desktop');
    const images = page.locator('img');
    for (let index = 0; index < await images.count(); index++) {
      const image = images.nth(index); await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
      expect(await image.evaluate(node => new URL(node.currentSrc || node.src).origin)).toBe(origin);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [path, thai, english] of [
      ['/', 'เรื่องของน้อง', 'Their little world.'], ['/privacy', 'ความเป็นส่วนตัวของเรา', 'Your privacy'],
      ['/terms', 'เงื่อนไขการใช้บริการ', 'Terms of service'], ['/ai-safety', 'รู้จักผู้ช่วย AI ของชิดใจ', 'Meet your AI assistant'],
      ['/emergency', 'ไปโรงพยาบาลสัตว์ทันที', 'Go to a veterinary hospital now.'],
      ['/invite/locale-invite', 'ดูแลน้องไปด้วยกัน', 'Care for them together'],
      ['/lost/locale-test', authored[0], authored[0]], ['/s/locale-test', 'สรุปสุขภาพก่อนพบหมอ', 'Health summary for your vet'],
      ['/lost/invalid', 'ประกาศนี้ไม่พร้อมแสดง', 'This notice is unavailable'],
      ['/s/invalid', 'สรุปสุขภาพก่อนพบหมอ', 'Health summary for your vet'],
    ]) {
      await page.goto(`${origin}${path}?lang=${locale}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1 })).toContainText(locale === 'en' ? english : thai);
      await expect(page).toHaveTitle(locale === 'en' ? /ChordJai/ : /ชิดใจ/);
      for (const link of await page.locator('a[href^="/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) {
        if (link.startsWith('/api/')) continue;
        expect(new URL(link, origin).searchParams.get('lang')).toBe(locale);
      }
      if (path.startsWith('/invite/')) {
        const invite = new URL(await page.getByRole('link', { name: locale === 'en' ? 'Sign in to accept the invitation' : 'เข้าสู่ระบบเพื่อรับคำเชิญ' }).getAttribute('href'), origin);
        expect(invite.searchParams.get('invite')).toBe('locale-invite');
      }
      if (path === '/lost/locale-test') {
        for (const value of authored.slice(0, 3)) await expect(page.getByText(value, { exact: value !== authored[2] })).toBeVisible();
      }
      if (path === '/s/locale-test') {
        for (const value of [authored[0], authored[5], authored[6],authored[7],authored[8],authored[9]]) await expect(page.getByText(value, { exact: value!==authored[9] })).toBeVisible();
        await expect(page.getByRole('heading',{name:locale==='en'?'Care updates selected by the owner':'เรื่องดูแลที่เจ้าของเลือกแชร์'})).toBeVisible();
        await expect(page.getByRole('button',{name:locale==='en'?'Print brief':'พิมพ์สรุป'})).toBeVisible();
        expect(await page.locator('body').innerText()).not.toMatch(/PRIVATE_.*_CANARY/);
        await page.locator('.clinical-care-costs summary').click();
        await expect(page.locator('.clinical-care-costs')).toContainText('1,250.50');
      }
      if (path === '/emergency') {
        await expect(page.getByRole('heading', { name: authored[3], exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: locale === 'en' ? 'Directions' : 'นำทาง', exact: true })).toHaveAttribute('href', /query=0%2C0/);
      }
      await appearance(locale, path.replaceAll('/', '-') || 'landing-mobile');
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  }

  // Changing language must preserve a finder’s unsubmitted, original-language note.
  await page.goto(`${origin}/lost/locale-test?lang=en`, { waitUntil: 'networkidle' });
  await page.getByLabel('What you saw').fill('เห็นน้องริมสวนสาธารณะ');
  await page.getByLabel('Area of the sighting').fill('ย่านที่ผู้พบกรอก');
  await page.getByRole('group', { name: 'Choose language' }).getByRole('button', { name: 'Thai', exact: true }).click();
  await expect(page.getByLabel('สิ่งที่คุณพบ')).toHaveValue('เห็นน้องริมสวนสาธารณะ');
  await expect(page.getByLabel('บริเวณที่พบ')).toHaveValue('ย่านที่ผู้พบกรอก');
  await page.getByRole('group', { name: 'เลือกภาษา' }).getByRole('button', { name: 'ภาษาอังกฤษ', exact: true }).click();
  await page.getByRole('button', { name: 'Send your sighting to the owner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your sighting has been sent to the owner', exact: true })).toBeVisible();
  await expect(page.getByText('Do not send money before verifying that this is the missing pet.', { exact: true })).toBeVisible();

  await page.goto(`${origin}/emergency?lang=th`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('chordjai-emergency-v2');
    return Boolean(await cache.match('/emergency?lang=th')) && Boolean(await cache.match('/emergency?lang=en'));
  })).toBe(true);
  // Visit both online once so the browser caches all font/script resources used.
  await page.goto(`${origin}/emergency?lang=en`, { waitUntil: 'networkidle' });
  await context.setOffline(true);
  for (const locale of ['th', 'en']) {
    await page.goto(`${origin}/emergency?lang=${locale}`, { waitUntil: 'load' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(locale === 'en' ? 'Go to a veterinary hospital now.' : 'ไปโรงพยาบาลสัตว์ทันที');
    await expect(page.getByRole('group', { name: locale === 'en' ? 'Choose language' : 'เลือกภาษา' })).toBeVisible();
    await appearance(locale, 'emergency-offline');
  }
  await context.setOffline(false);
  expect(errors).toEqual([]);
  expect(requests.some(request => request.path === '/api/v1/share/public/locale-test')).toBe(true);
  expect(requests.some(request => request.path === '/api/v1/lostfound/public/locale-test')).toBe(true);
  expect(requests.filter(request => request.method !== 'GET')).toEqual([{ method: 'POST', path: '/api/v1/lostfound/public/locale-test/tips' }]);
  console.log('Passed: Thai/English marketing and all public routes, locale metadata and links, original clinical/pet content, translated finder submission with language-switch preservation, 390px layouts, local images/Mitr, and separate Thai/English offline emergency HTML. Local fixture only; no provider or production calls.');
} finally {
  await browser.close();
  await new Promise(resolve => fixture.close(resolve));
}
