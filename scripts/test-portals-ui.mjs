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
const clinicalEntry = {
  id:'77777777-7777-4777-8777-777777777777', kind:'visit', title:'ติดตามอาการของน้อง',
  observedAt:'2026-10-12T03:30:00Z',clinicalNote:'กินน้อยลงตั้งแต่เมื่อวาน',provenance:'owner_reported',
  observations:{symptoms:['กินน้อย'],trend:'same',severity:'mild',appetite:'reduced',energy:'low',water:'normal',toilet:'normal',onsetAt:'2026-10-11T10:00:00Z',frequency:'วันละสองครั้ง'},
  episode:{id:'episode-test',title:'ดูแลเรื่องการกิน',status:'ongoing'},
  visit:{clinicName:'คลินิกสำหรับทดสอบ UI',reason:'ตรวจเรื่องการกิน',vetReportedFindings:'เจ้าของรายงานคำแนะนำ',treatment:'ติดตามการกิน',nextFollowupAt:'2026-10-15T03:00:00Z'},
  costs:[{label:'ค่าตรวจ',amountMinor:125050,currency:'THB',kind:'paid',expenseDate:'2026-10-11'},{label:'ครั้งถัดไป',amountMinor:50000,currency:'THB',kind:'estimate',expenseDate:null}],
  narrative:'PRIVATE_DIARY_CANARY',reflection:'PRIVATE_REFLECTION_CANARY',photos:[{url:'PRIVATE_PHOTO_CANARY'}],
};
const careMetrics = {diaryAuthors:2,diaryEntries:6,diaryPets:2,entriesLast7Days:6,activePetsLast30Days:2,recordedPetWeeksLast30Days:3,repeatWeekPetsLast30Days:1,activeEpisodes:1,episodesWithFollowup:1,visits:2,visitsWithRecordedCosts:1,visitsWithAttachments:1,entriesEnabledForClinicalSharing:1};
const data = {
  '/clinic/memberships': [{ clinicId, name: 'คลินิกสำหรับทดสอบ UI', role: 'vet' }],
  '/clinic/appointments': [{ id: appointmentId, clinicId, petId, reason: 'ฉีดวัคซีนประจำปี', requestedAt: '2026-10-12T03:00:00Z', status: 'requested' }],
  [`/clinic/pets/${petId}/summary`]: { pet: { name: 'น้องสำหรับทดสอบ', species: 'cat', sex: 'female', weightKg: 3.5 }, careAccess:true,careEntries:[clinicalEntry], records: [{ kind: 'vaccine', title: 'วัคซีนรวม', recordedAt: '2026-09-01', nextDueAt: '2027-09-01', notes: 'ข้อมูลตัวอย่างสำหรับทดสอบ' }] },
  '/analytics/kpis': { users: 2, pets: 3, healthRecords: 4, summaryViews: 1, clinics: 1, triageSessions: 0, activeLostCases: 0, journalPages: 2, conversations: 1, aiCostTodayUsd: 0, deadJobs: 1,care:careMetrics,petid:{enrolledPets:2,availableReferencePhotos:5,petsWithMultipleReferencePhotos:1},petidResearch:{sessions:4,availableSamples:12,petsWithMultipleCaptureDays:2,trainingOptedInPets:1,samplesReviewedUnderCurrentConsent:0},personalizedFollowups:{enabledUsers:3,pausedUsers:1,lineAcceptedLast30Days:2,openedFromLinkLast30Days:1,followupsWithRepliesLast30Days:1,uncertainRequests:0} },
  '/analytics/jobs': [{ id: jobId, topic: 'test.only', status: 'dead', attempts: 3, maxAttempts: 3, runAt: '2026-10-10T03:00:00Z', lastError: 'ข้อความทดสอบ UI' }, { id: '66666666-6666-4666-8666-666666666666', topic: 'test.completed', status: 'completed', attempts: 1, maxAttempts: 3, runAt: '2026-10-10T03:00:00Z' }],
  '/analytics/ai-requests': [{ id: 'test-ai', feature: 'journal.decorate', model: 'gpt-6.1-sol', inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0, status: 'ok', createdAt: '2026-10-10T03:00:00Z' }],
  '/clinics': [{ id: clinicId, name: 'คลินิกสำหรับทดสอบ UI', district: 'ย่านทดสอบ', address: 'ที่อยู่สำหรับทดสอบ', phone: '020000000', is24h: true }],
};

async function session(kind, loggedIn = true, locale = 'th', roleOverride) {
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
    let result = path === '/identity/me' ? { id: 'test-user', displayName: locale === 'en' ? 'UI test account' : 'บัญชีทดสอบ UI', role: roleOverride || (kind === 'admin' ? 'admin' : 'vet') } : (locale === 'en' ? englishFixture(path) : data[path]);
    if(path.endsWith('/summary')&&result){result=structuredClone(result);if(new URL(request.url()).searchParams.get('includeCosts')!=='true')for(const entry of result.careEntries||[])entry.costs=[];}
    if (result === undefined) throw new Error(`Unexpected API request ${path}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: result }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origins[kind]}/app?lang=${locale}`, { waitUntil: 'networkidle' });
  return { page, context };
}
function englishFixture(path) {
  const result = structuredClone(data[path]);
  if (path === '/clinic/memberships' || path === '/clinics') {
    for (const item of result) {
      item.name = 'UI test clinic';
      if ('district' in item) { item.district = 'Test area'; item.address = 'UI fixture address'; }
    }
  }
  if (path === '/clinic/appointments') result[0].reason = 'Annual vaccination';
  if (path.endsWith('/summary')) {
    result.pet.name = 'Test pet';
    result.records[0].title = 'Annual vaccine'; result.records[0].notes = 'UI fixture record';
    Object.assign(result.careEntries[0],{title:'Appetite follow-up',clinicalNote:'Eating less since yesterday'});
    Object.assign(result.careEntries[0].observations,{symptoms:['Eating less'],frequency:'Twice a day'});
    result.careEntries[0].episode.title='Appetite care';
    Object.assign(result.careEntries[0].visit,{clinicName:'UI test clinic',reason:'Appetite review',vetReportedFindings:'Owner recalls the instructions',treatment:'Monitor eating'});
    result.careEntries[0].costs[0].label='Consultation';result.careEntries[0].costs[1].label='Next visit';
  }
  if (path === '/analytics/jobs') result[0].lastError = 'UI fixture error';
  return result;
}
async function assertEnglish(page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.locator('body').innerText()).not.toMatch(/[ก-๙]/);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label], [placeholder], [title]')).map(element => [element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('title')].filter(Boolean).join(' ')).join(' '))).not.toMatch(/[ก-๙]/);
}
async function switchToThai(page) {
  await page.getByRole('button', { name: 'Thai', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
}
async function switchToEnglish(page) {
  await page.getByRole('button', { name: 'ภาษาอังกฤษ', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
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
  await expect(clinic.page.getByRole('heading',{name:'เรื่องดูแลที่เจ้าของเลือกแชร์'})).toBeVisible();
  await expect(clinic.page.getByText('ติดตามอาการของน้อง',{exact:true})).toBeVisible();
  expect(await clinic.page.locator('body').innerText()).not.toMatch(/PRIVATE_.*_CANARY/);
  await expect(clinic.page.locator('.clinical-care-costs')).toHaveCount(0);
  await clinic.page.getByLabel('รวมค่าใช้จ่ายที่เจ้าของอนุญาต แล้วกดเปิดสมุดอีกครั้ง').check();
  await clinic.page.getByRole('button',{name:'เปิดสมุดสุขภาพ',exact:true}).click();
  await clinic.page.locator('.clinical-care-costs summary').click();
  await expect(clinic.page.locator('.clinical-care-costs')).toContainText('1,250.50');
  await expect(clinic.page.locator('.clinical-care-costs time[datetime="2026-10-11"]')).toHaveText(new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date('2026-10-11')));
  await expect(clinic.page.locator('.clinical-care-costs time')).toHaveCount(1);
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
  await expect(admin.page.getByRole('heading',{name:'ไดอารี่และความต่อเนื่องในการดูแล'})).toBeVisible();
  await expect(admin.page.getByRole('heading',{name:'ชุดภาพ PetID ต่างช่วงเวลา'})).toBeVisible();
  await expect(admin.page.getByRole('heading',{name:'LINE ที่เจ้าของเลือกเปิดรับ'})).toBeVisible();
  await expect(admin.page.getByRole('heading',{name:'ข้อมูลอ้างอิง PetID'})).toBeVisible();
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

  for (const kind of ['clinic', 'admin']) {
    const login = await session(kind, false, 'en');
    await login.page.goto(`${origins[kind]}/?lang=en`, { waitUntil: 'networkidle' });
    await expect(login.page).toHaveURL(/\/app\?lang=en$/);
    await expect(login.page.getByRole('button', { name: 'Sign in with LINE' })).toBeVisible();
    await assertEnglish(login.page);
    await switchToThai(login.page);
    await expect(login.page.getByRole('button', { name: 'เข้าสู่ระบบด้วย LINE' })).toBeVisible();
    await switchToEnglish(login.page);
    await assertEnglish(login.page);
    await login.page.setViewportSize({ width: 390, height: 844 }); await checkLayout(login.page);
    await login.page.screenshot({ path: `.verification/${kind}-login-en-mobile.png`, fullPage: true });
    await login.context.close();
  }
  const englishClinic = await session('clinic', true, 'en');
  await expect(englishClinic.page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible();
  await assertEnglish(englishClinic.page);
  await englishClinic.page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(englishClinic.page.getByText('Appointment accepted', { exact: true })).toBeVisible();
  await switchToThai(englishClinic.page);
  await expect(englishClinic.page.getByText('ตอบรับคำขอนัดแล้ว', { exact: true })).toBeVisible();
  await switchToEnglish(englishClinic.page);
  await expect(englishClinic.page.getByText('Appointment accepted', { exact: true })).toBeVisible();
  await expect(englishClinic.page.getByRole('heading', { name: 'No pending appointment requests' })).toBeVisible();
  await englishClinic.page.locator('.portal-filters').getByRole('button', { name: /^Accepted/ }).click();
  await englishClinic.page.getByRole('button', { name: 'Open health journal', exact: true }).click();
  await expect(englishClinic.page.getByRole('heading', { name: 'Test pet' })).toBeVisible();
  await expect(englishClinic.page.getByRole('heading',{name:'Care updates selected by the owner'})).toBeVisible();
  await expect(englishClinic.page.getByText('Appetite follow-up',{exact:true})).toBeVisible();
  expect(await englishClinic.page.locator('body').innerText()).not.toMatch(/PRIVATE_.*_CANARY/);
  await expect(englishClinic.page.getByRole('button',{name:'Print brief'})).toBeVisible();
  await englishClinic.page.getByLabel('Include owner-permitted costs, then open the journal again').check();
  await englishClinic.page.getByRole('button',{name:'Open health journal',exact:true}).click();
  await englishClinic.page.locator('.clinical-care-costs summary').click();
  await expect(englishClinic.page.locator('.clinical-care-costs time')).toHaveCount(1);
  await expect(englishClinic.page.locator('.clinical-care-costs')).toContainText('Expense date: 11 Oct 2026');
  await englishClinic.page.emulateMedia({media:'print'});
  await expect(englishClinic.page.locator('.clinical-care-costs time')).toBeVisible();
  await englishClinic.page.pdf({path:'.verification/expense-dates/clinic-expense-brief.pdf',format:'A4',printBackground:true});
  await englishClinic.page.emulateMedia({media:'screen'});
  await assertEnglish(englishClinic.page);
  await expect(englishClinic.page.locator('.portal-table-wrap')).toContainText('2026');
  await switchToThai(englishClinic.page);
  await expect(englishClinic.page.getByLabel('รหัสน้อง', { exact: true })).toHaveValue(petId);
  await switchToEnglish(englishClinic.page);
  await expect(englishClinic.page.getByLabel('Pet ID', { exact: true })).toHaveValue(petId);
  await englishClinic.page.setViewportSize({ width: 390, height: 844 }); await checkLayout(englishClinic.page);
  await englishClinic.page.screenshot({ path: '.verification/clinic-health-en-mobile.png', fullPage: true });
  await englishClinic.page.getByRole('navigation').getByRole('button', { name: 'My clinics' }).click();
  await expect(englishClinic.page.getByText('Veterinarian', { exact: true })).toBeVisible();
  await assertEnglish(englishClinic.page); await checkLayout(englishClinic.page);
  await englishClinic.page.getByRole('navigation').getByRole('button', { name: 'Health journal' }).click();
  const idInput = englishClinic.page.getByLabel('Pet ID', { exact: true });
  await idInput.fill('');
  await englishClinic.page.getByRole('button', { name: 'Open health journal', exact: true }).click();
  expect(await idInput.evaluate(input => input.validationMessage)).toBe('Please complete this field.');
  await englishClinic.context.route('**/api/v1/clinic/pets/**/summary*', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'GRANT_REQUIRED', message: 'เจ้าของต้องให้สิทธิ์ที่ยังไม่หมดอายุ' } }) }));
  await idInput.fill(petId);
  await englishClinic.page.getByRole('button', { name: 'Open health journal', exact: true }).click();
  await expect(englishClinic.page.locator('.portal-error[role="alert"]')).toContainText('The owner must grant this clinic access');
  await switchToThai(englishClinic.page);
  await expect(englishClinic.page.locator('.portal-error[role="alert"]')).toContainText('เจ้าของต้องให้สิทธิ์ที่ยังไม่หมดอายุ');
  await switchToEnglish(englishClinic.page);
  await expect(englishClinic.page.locator('.portal-error[role="alert"]')).toContainText('The owner must grant this clinic access');
  await assertEnglish(englishClinic.page);
  await englishClinic.context.close();

  const englishAdmin = await session('admin', true, 'en');
  await expect(englishAdmin.page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(englishAdmin.page.getByRole('heading',{name:'Care diary & continuity'})).toBeVisible();
  await expect(englishAdmin.page.getByRole('heading',{name:'PetID capture over time'})).toBeVisible();
  await expect(englishAdmin.page.getByRole('heading',{name:'Opted-in LINE follow-ups'})).toBeVisible();
  await expect(englishAdmin.page.getByRole('heading',{name:'PetID reference inventory'})).toBeVisible();
  await assertEnglish(englishAdmin.page);
  await englishAdmin.page.getByRole('navigation').getByRole('button', { name: 'AI activity' }).click();
  await expect(englishAdmin.page.getByText('Journal decoration', { exact: true })).toBeVisible();
  await expect(englishAdmin.page.locator('.portal-status')).toHaveText('Succeeded');
  await assertEnglish(englishAdmin.page);
  await englishAdmin.page.getByRole('searchbox', { name: 'Search AI requests' }).fill('no-match');
  await expect(englishAdmin.page.getByRole('heading', { name: 'No requests match your search' })).toBeVisible();
  await englishAdmin.page.getByRole('navigation').getByRole('button', { name: /^Background jobs/ }).click();
  await englishAdmin.page.locator('.portal-filters').getByRole('button', { name: /^Completed/ }).click();
  await expect(englishAdmin.page.getByText('test.completed', { exact: true })).toBeVisible();
  await englishAdmin.page.locator('.portal-filters').getByRole('button', { name: /^Needs review/ }).click();
  await englishAdmin.page.getByRole('button', { name: 'Retry job test.only', exact: true }).click();
  await expect(englishAdmin.page.getByText('Job queued again', { exact: true })).toBeVisible();
  await assertEnglish(englishAdmin.page);
  await englishAdmin.page.getByRole('navigation').getByRole('button', { name: 'Clinic network' }).click();
  await englishAdmin.page.getByRole('button', { name: 'Add clinic', exact: true }).click();
  await englishAdmin.page.getByLabel('Clinic name', { exact: true }).fill('New UI test clinic');
  await englishAdmin.page.getByLabel('District / area', { exact: true }).fill('Test area');
  await englishAdmin.page.getByLabel('Phone', { exact: true }).fill('020000000');
  await englishAdmin.page.getByRole('textbox', { name: 'Address', exact: true }).fill('Test address');
  await englishAdmin.page.getByLabel('I have verified the contact details and hours with the clinic').check();
  await switchToThai(englishAdmin.page);
  await expect(englishAdmin.page.getByLabel('ชื่อคลินิก', { exact: true })).toHaveValue('New UI test clinic');
  await expect(englishAdmin.page.getByLabel('ตรวจข้อมูลติดต่อและเวลาเปิดกับคลินิกแล้ว')).toBeChecked();
  await switchToEnglish(englishAdmin.page);
  await expect(englishAdmin.page.getByLabel('Clinic name', { exact: true })).toHaveValue('New UI test clinic');
  await expect(englishAdmin.page.getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('Test address');
  await assertEnglish(englishAdmin.page);
  await englishAdmin.page.getByRole('button', { name: 'Save to public directory', exact: true }).click();
  await expect(englishAdmin.page.getByText('Verified clinic saved in the public directory', { exact: true })).toBeVisible();
  await englishAdmin.page.setViewportSize({ width: 390, height: 844 }); await checkLayout(englishAdmin.page);
  await englishAdmin.page.screenshot({ path: '.verification/admin-clinics-en-mobile.png', fullPage: true });
  for (const tab of ['Overview', 'AI activity', 'Background jobs']) {
    await englishAdmin.page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
    await assertEnglish(englishAdmin.page); await checkLayout(englishAdmin.page);
  }
  await englishAdmin.context.close();
  const denied = await session('admin', true, 'en', 'owner');
  await expect(denied.page.locator('.portal-error[role="alert"]')).toContainText('This account does not have administrator access');
  await switchToThai(denied.page);
  await expect(denied.page.locator('.portal-error[role="alert"]')).toContainText('บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแลระบบ');
  await switchToEnglish(denied.page);
  await assertEnglish(denied.page);
  await denied.context.close();
  expect(mutations).toContainEqual({ path: `/clinic/appointments/${appointmentId}`, method: 'PATCH', body: { status: 'accepted' } });
  expect(mutations.some(item => item.path === `/analytics/jobs/${jobId}/replay`)).toBe(true);
  expect(mutations.some(item => item.path === '/clinic/admin/clinics' && item.body.name === 'คลินิกใหม่ทดสอบ')).toBe(true);
  expect(errors).toEqual([]);
  console.log('Passed: Thai/English clinic/admin login and all workspace tabs, locale-preserving redirects, dates/statuses/ARIA/validation, switching preserves notices/errors/forms/permissions, clinic accept/grant-summary/membership/logout, admin AI filter/completed-job filter/replay/clinic create, active mobile nav, no page overflow or browser errors. API fixtures only.');
} finally { await browser.close(); }
