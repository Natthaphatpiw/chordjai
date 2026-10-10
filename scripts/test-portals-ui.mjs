// Local browser verification only. All API responses are explicit test fixtures.
// No real LINE login, database, OpenAI call, or public deployment is used.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origins = {
  clinic: process.env.CLINIC_UI_TEST_ORIGIN || 'http://localhost:3001',
  admin: process.env.ADMIN_UI_TEST_ORIGIN || 'http://localhost:3002',
};
for (const origin of Object.values(origins)) {
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Portal UI tests require local servers');
}
await mkdir('.verification', { recursive: true });
const browser = await chromium.launch();
const errors = [];
const mutations = [];
const petId = '11111111-1111-4111-8111-111111111111';
const clinicId = '22222222-2222-4222-8222-222222222222';
const appointmentId = '33333333-3333-4333-8333-333333333333';
const jobId = '44444444-4444-4444-8444-444444444444';
const data = {
  '/clinic/memberships': [{ clinicId, name: 'คลินิกสำหรับทดสอบ UI', role: 'vet' }],
  '/clinic/appointments': [{ id: appointmentId, clinicId, petId, reason: 'ฉีดวัคซีนประจำปี', requestedAt: '2026-10-12T03:00:00Z', status: 'requested' }],
  [`/clinic/pets/${petId}/summary`]: { pet: { name: 'น้องสำหรับทดสอบ', species: 'cat', sex: 'female', weightKg: 3.5 }, records: [{ kind: 'vaccine', title: 'วัคซีนรวม', recordedAt: '2026-09-01', nextDueAt: '2027-09-01', notes: 'ข้อมูลตัวอย่างสำหรับทดสอบ' }] },
  '/analytics/kpis': { users: 2, pets: 3, healthRecords: 4, summaryViews: 1, clinics: 1, triageSessions: 0, activeLostCases: 0, journalPages: 2, conversations: 1, aiCostTodayUsd: 0, deadJobs: 1 },
  '/analytics/jobs': [{ id: jobId, topic: 'test.only', status: 'dead', attempts: 3, maxAttempts: 3, runAt: '2026-10-10T03:00:00Z', lastError: 'ข้อความทดสอบ UI' }],
  '/analytics/ai-requests': [{ id: 'test-ai', feature: 'journal.decorate', model: 'gpt-6.1-sol', inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0, status: 'success', createdAt: '2026-10-10T03:00:00Z' }],
  '/clinics': [{ id: clinicId, name: 'คลินิกสำหรับทดสอบ UI', district: 'ย่านทดสอบ', address: 'ที่อยู่สำหรับทดสอบ', phone: '020000000', is24h: true }],
};

async function session(kind, loggedIn = true) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  if (loggedIn) await context.addInitScript(() => sessionStorage.setItem('chordjai.session', 'portal-ui-test-session'));
  await context.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() !== 'GET') {
      mutations.push({ path, method: request.method(), body: request.postDataJSON() });
      const result = path === '/clinic/admin/clinics' ? { id: '55555555-5555-4555-8555-555555555555', ...request.postDataJSON() } : { id: path };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: result }) });
      return;
    }
    const result = path === '/identity/me' ? { id: 'test-user', displayName: 'บัญชีทดสอบ UI', role: kind === 'admin' ? 'admin' : 'vet' } : data[path];
    if (result === undefined) throw new Error(`Unexpected API request ${path}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: result }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origins[kind]}/app`, { waitUntil: 'networkidle' });
  return { page, context };
}
async function checkLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect.poll(() => page.evaluate(() => {
    const active = document.querySelector('nav button[aria-current="page"]');
    const nav = active?.closest('nav');
    if (!active || !nav) return true;
    const item = active.getBoundingClientRect(), frame = nav.getBoundingClientRect();
    return item.left >= frame.left - 1 && item.right <= frame.right + 1;
  })).toBe(true);
}

try {
  for (const kind of ['clinic', 'admin']) {
    const { page, context } = await session(kind, false);
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย LINE' })).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    if (kind === 'clinic') expect(await page.locator('.portal-login-photo img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `.verification/${kind}-login-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await checkLayout(page);
    await page.screenshot({ path: `.verification/${kind}-login-mobile.png`, fullPage: true });
    await context.close();
  }
  const clinic = await session('clinic');
  await expect(clinic.page.getByText('ฉีดวัคซีนประจำปี', { exact: true })).toBeVisible();
  await clinic.page.screenshot({ path: '.verification/clinic-appointments-desktop.png', fullPage: true });
  await clinic.page.getByRole('button', { name: 'ตอบรับ', exact: true }).click();
  await expect(clinic.page.getByText('ตอบรับคำขอนัดแล้ว', { exact: true })).toBeVisible();
  await clinic.page.locator('.portal-filters').getByRole('button', { name: /^ตอบรับแล้ว/ }).click();
  await clinic.page.getByRole('button', { name: 'เปิดสมุดสุขภาพ', exact: true }).click();
  await expect(clinic.page.getByRole('heading', { name: 'น้องสำหรับทดสอบ' })).toBeVisible();
  await expect(clinic.page.getByText('วัคซีนรวม', { exact: true })).toBeVisible();
  await clinic.page.setViewportSize({ width: 390, height: 844 }); await checkLayout(clinic.page);
  await clinic.page.screenshot({ path: '.verification/clinic-health-mobile.png', fullPage: true });
  await clinic.page.getByRole('navigation').getByRole('button', { name: 'คลินิกของฉัน' }).click();
  await expect(clinic.page.getByRole('heading', { name: 'คลินิกสำหรับทดสอบ UI' })).toBeVisible();
  await checkLayout(clinic.page);
  await clinic.page.getByRole('navigation').getByRole('button', { name: 'คำขอนัด' }).click();
  await checkLayout(clinic.page);
  await clinic.page.screenshot({ path: '.verification/clinic-appointments-mobile.png', fullPage: true });
  await clinic.page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(clinic.page.getByRole('button', { name: 'เข้าสู่ระบบด้วย LINE' })).toBeVisible();
  await clinic.context.close();

  const admin = await session('admin');
  await expect(admin.page.getByRole('heading', { name: 'การใช้งานแต่ละส่วน' })).toBeVisible();
  await admin.page.screenshot({ path: '.verification/admin-overview-desktop.png', fullPage: true });
  await admin.page.getByRole('navigation').getByRole('button', { name: 'การทำงานของ AI' }).click();
  await expect(admin.page.getByText('journal.decorate', { exact: true })).toBeVisible();
  await admin.page.getByRole('searchbox', { name: 'ค้นหาการเรียกใช้ AI' }).fill('no-match');
  await expect(admin.page.getByRole('heading', { name: 'ไม่พบคำขอที่ตรงกับการค้นหา' })).toBeVisible();
  await admin.page.getByRole('navigation').getByRole('button', { name: /^งานเบื้องหลัง/ }).click();
  await admin.page.getByRole('button', { name: 'ทำงาน test.only อีกครั้ง', exact: true }).click();
  await expect(admin.page.getByText('นำงานกลับเข้าคิวแล้ว', { exact: true })).toBeVisible();
  await expect(admin.page.locator('.portal-table-wrap').getByText('เข้าคิว', { exact: true })).toBeVisible();
  await admin.page.getByRole('navigation').getByRole('button', { name: 'เครือข่ายคลินิก' }).click();
  await expect(admin.page.getByRole('heading', { name: 'คลินิกสำหรับทดสอบ UI' })).toBeVisible();
  await admin.page.getByRole('button', { name: 'เพิ่มคลินิก', exact: true }).click();
  await admin.page.getByLabel('ชื่อคลินิก', { exact: true }).fill('คลินิกใหม่ทดสอบ');
  await admin.page.getByLabel('เขต / ย่าน', { exact: true }).fill('ย่านทดสอบ');
  await admin.page.getByLabel('เบอร์โทร', { exact: true }).fill('020000000');
  await admin.page.getByLabel('ที่อยู่', { exact: true }).fill('ที่อยู่สำหรับทดสอบ');
  await admin.page.getByLabel('ตรวจข้อมูลติดต่อและเวลาเปิดกับคลินิกแล้ว').check();
  await admin.page.getByRole('button', { name: 'บันทึกในรายชื่อสาธารณะ', exact: true }).click();
  await expect(admin.page.getByText('บันทึกคลินิกที่ตรวจสอบแล้วในรายชื่อสาธารณะ', { exact: true })).toBeVisible();
  await admin.page.setViewportSize({ width: 390, height: 844 }); await checkLayout(admin.page);
  await admin.page.screenshot({ path: '.verification/admin-clinics-mobile.png', fullPage: true });
  for (const tab of ['ภาพรวม', 'การทำงานของ AI', 'งานเบื้องหลัง']) {
    await admin.page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
    await checkLayout(admin.page);
  }
  await admin.page.screenshot({ path: '.verification/admin-jobs-mobile.png', fullPage: true });
  await admin.context.close();
  expect(mutations).toContainEqual({ path: `/clinic/appointments/${appointmentId}`, method: 'PATCH', body: { status: 'accepted' } });
  expect(mutations.some(item => item.path === `/analytics/jobs/${jobId}/replay`)).toBe(true);
  expect(mutations.some(item => item.path === '/clinic/admin/clinics' && item.body.name === 'คลินิกใหม่ทดสอบ')).toBe(true);
  expect(errors).toEqual([]);
  console.log('Passed: clinic/admin desktop and mobile login, clinic appointment accept and grant-summary lookup, membership, logout, admin overview/AI filter/job replay/clinic create, no horizontal page overflow or browser errors. API fixtures only.');
} finally { await browser.close(); }
