import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
// Explicit local fixtures only. Never calls LINE, OpenAI, storage or production.
const origin = process.env.UI_TEST_ORIGIN || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Research/follow-up UI tests require a local server');
const petId = '00000000-0000-4000-8000-000000000100';
const secondPetId = '00000000-0000-4000-8000-000000000101';
const openedFollowupId = '00000000-0000-4000-8000-000000000102';
const image = await readFile('frontend/owner-app/public/images/pet-home-cat.webp');
const files = Array.from({ length: 6 }, (_, i) => ({ name: `angle-${i}.webp`, mimeType: 'image/webp', buffer: image }));
const policy = 'petid-training-2026-10-12';
let state = { consent: { granted: false, policyVersion: policy, version: 0, updatedAt: null }, sessions: [], hasMore: false, trainingEligibleCount: 0 };
let prefs = { enabled: false, cadenceDays: 7, language: 'en', pausedUntil: null, sources: { care: false, booklet: false, journal: false, assistantMemory: false }, consentVersion: null, version: 0, followed: true, lastAcceptedAt: null, deliveryWindow: { timeZone: 'Asia/Bangkok', startHour: 9, endHour: 20 } };
let captureAttempts = 0, prefAttempts = 0, uploadCount = 0, stalePrefs = false;
const calls = [], errors = [];
await mkdir('.verification', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(() => { const payload = btoa(JSON.stringify({ sub: 'ui-test-user', exp: Math.floor(Date.now() / 1000) + 3600 })); sessionStorage.setItem('chordjai.session', `e30.${payload}.test`); });
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin) return route.abort();
  if (!url.pathname.startsWith('/api/v1/')) return route.continue();
  const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : undefined;
  calls.push({ method: request.method(), path: url.pathname, body, key: request.headers()['idempotency-key'] });
  const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  const transient = () => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Mock transient error' } }) });
  if (request.method() === 'GET') {
    if (url.pathname === '/api/v1/pets') return reply([{ id: petId, name: 'Tofu', species: 'cat', sex: 'female', neutered: true }, { id: secondPetId, name: 'Peony', species: 'cat', sex: 'female', neutered: true }]);
    if (url.pathname === '/api/v1/identity/consents') return reply([{ purpose: 'service', granted: true }]);
    if (url.pathname === `/api/v1/biometric/pets/${petId}/research`) return reply(state);
    if (url.pathname === '/api/v1/notification/followup/preferences') return reply(prefs);
    if (url.pathname === '/api/v1/notification/followup/history') return reply({ items: [{ id: 'delivery-one', status: 'accepted', message: 'How is Tofu doing after the vet visit?', createdAt: '2026-10-12T02:00:00Z', acceptedAt: '2026-10-12T02:00:00Z', reasonCode: null }], retentionDays: 90 });
    if (['/api/v1/health/records', '/api/v1/health/care/entries', '/api/v1/health/care/episodes', '/api/v1/biometric/enrollments', '/api/v1/biometric/matches', '/api/v1/clinics', '/api/v1/lostfound/cases', '/api/v1/notification/inbox', '/api/v1/clinic/grants', `/api/v1/pets/${petId}/members`].includes(url.pathname)) return reply([]);
  }
  if (url.pathname === '/api/v1/media/upload') return reply({ id: `00000000-0000-4000-8000-${String(++uploadCount).padStart(12, '0')}`, url: '/images/pet-home-cat.webp' });
  if (url.pathname.endsWith('/research/sessions') && request.method() === 'POST') {
    if (++captureAttempts === 1) return transient();
    const value = { id: '00000000-0000-4000-8000-000000000500', petId, createdAt: '2026-10-12T03:00:00Z', samePetConfirmed: true, identityStatus: 'owner_attested_unverified', reviewStatus: 'pending', samples: body.samples.map((sample, i) => ({ ...sample, id: `sample-${i}`, url: '/images/pet-home-cat.webp' })) };
    state = { ...state, sessions: [value] }; return reply(value);
  }
  if (url.pathname.endsWith('/research/consent')) { state = { ...state, consent: { granted: body.granted, policyVersion: body.policyVersion, version: state.consent.version + 1, updatedAt: new Date().toISOString() } }; return reply(state.consent); }
  if (url.pathname === '/api/v1/notification/followup/preferences' && request.method() === 'PATCH') {
    if (++prefAttempts === 1) return transient();
    if (stalePrefs) { stalePrefs = false; prefs = { ...prefs, cadenceDays: 7, version: prefs.version + 1 }; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FOLLOWUP_STALE', message: 'Preferences changed elsewhere' } }) }); }
    prefs = { ...prefs, ...body, version: prefs.version + 1 }; return reply(prefs);
  }
  if (url.pathname === '/api/v1/notification/followup/preview') return reply({ shouldSend: true, message: 'How is Tofu doing after the vet visit?', reason: 'post_visit', generatedAt: '2026-10-12T03:00:00Z', sourceIds: ['selected-source'], petId });
  if (url.pathname === `/api/v1/notification/followup/${openedFollowupId}/opened` && request.method() === 'POST') return reply({ opened: true });
  if (url.pathname.includes('/research/sessions/') && request.method() === 'DELETE') { state = { ...state, sessions: [] }; return reply({ removed: true }); }
  throw new Error(`Unmocked endpoint ${request.method()} ${url.pathname}`);
});
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
async function noOverflow() { const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].map(node => ({ tag: node.tagName, cls: node.className, w: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })).filter(node => node.right > innerWidth + 1).slice(0, 20))); expect(overflow).toBe(false); }
try {
  await page.goto(`${origin}/app?lang=en&tab=petid`, { waitUntil: 'networkidle' });
  const devTools = page.getByRole('button', { name: 'Open Next.js Dev Tools', exact: true });
  if (await devTools.isVisible()) { await devTools.click(); await page.getByRole('menuitem', { name: 'Preferences', exact: true }).click(); await page.locator('nextjs-portal').getByRole('button', { name: 'Hide', exact: true }).click(); }
  const research = page.getByRole('region', { name: 'PetID photo history for Tofu' }).or(page.locator('.petid-research'));
  await expect(research.getByRole('heading', { name: 'PetID photo history for Tofu', exact: true })).toBeVisible();
  const training = research.getByRole('checkbox', { name: 'I consent to using this data to develop and evaluate PetID models', exact: true });
  await expect(training).not.toBeChecked();
  await research.getByRole('button', { name: 'Add a photo set', exact: true }).click();
  const input = research.getByLabel('Choose up to five research photos', { exact: true });
  await input.setInputFiles(files); await expect(research.getByRole('alert')).toContainText('up to five'); expect(uploadCount).toBe(0);
  await input.setInputFiles(files.slice(0, 3)); await expect(research.locator('.research-photo-card')).toHaveCount(3);
  await expect(research.getByRole('button', { name: 'Save photo set', exact: true })).toBeDisabled();
  for (const card of await research.locator('.research-photo-card').all()) {
    await card.getByLabel('Capture date (owner-declared)', { exact: true }).fill('2026-09-15');
    await card.getByLabel('Capture time (Bangkok time)', { exact: true }).fill('10:00');
  }
  await research.getByRole('checkbox', { name: 'I recognise the same Tofu in every photo and have checked the capture dates and times', exact: true }).check();
  await expect(research.getByRole('button', { name: 'Save photo set', exact: true })).toBeEnabled();
  await research.getByRole('button', { name: 'Save photo set', exact: true }).click(); await expect(research.getByRole('button', { name: 'Retry saving this set', exact: true })).toBeEnabled();
  await expect(research.getByRole('combobox', { name: 'Angle', exact: true }).first()).toBeDisabled();
  await research.getByRole('button', { name: 'Retry saving this set', exact: true }).click();
  await expect(research.locator('.research-session')).toHaveCount(1); await expect(training).not.toBeChecked();
  const captureCalls = calls.filter(call => call.path.endsWith('/research/sessions') && call.method === 'POST');
  expect(captureCalls).toHaveLength(2); expect(captureCalls[0].body).toEqual(captureCalls[1].body); expect(captureCalls[0].key).toEqual(captureCalls[1].key);
  expect(captureCalls[0].body.samples.map(sample => sample.angle)).toEqual(['front', 'left', 'right']);
  expect(calls.filter(call => call.path.endsWith('/research/consent'))).toHaveLength(0);
  await training.click(); await expect(training).toBeChecked(); await training.click(); await expect(training).not.toBeChecked();
  await noOverflow(); await page.screenshot({ path: '.verification/petid-research-mobile-en.png', fullPage: true }); await research.screenshot({ path: '.verification/petid-research-panel-mobile-en.png' });
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const followup = page.locator('.followup-settings');
  await expect(followup.getByRole('heading', { name: 'Follow-ups through LINE', exact: true })).toBeVisible();
  const enabled = followup.getByRole('switch', { name: 'Receive personal follow-ups', exact: true });
  await expect(enabled).not.toBeChecked();
  await enabled.check(); await expect(followup.getByRole('button', { name: 'Save choices', exact: true })).toBeDisabled();
  await followup.getByRole('checkbox', { name: /Care diary/ }).check();
  await expect(followup.getByRole('button', { name: 'Save choices', exact: true })).toBeDisabled();
  await followup.getByRole('checkbox', { name: /I consent to AI using the selected data/ }).check();
  await followup.getByRole('combobox', { name: 'Minimum message interval', exact: true }).selectOption('5');
  await followup.getByRole('button', { name: 'Save choices', exact: true }).click();
  await expect(followup.getByRole('button', { name: 'Retry the same choices', exact: true })).toBeEnabled();
  await expect(enabled).toBeDisabled(); await followup.getByRole('button', { name: 'Retry the same choices', exact: true }).click();
  await expect(followup.getByText('Follow-up messages are enabled with these choices.', { exact: true })).toBeVisible();
  const prefCalls = calls.filter(call => call.path.endsWith('/followup/preferences') && call.method === 'PATCH');
  expect(prefCalls).toHaveLength(2); expect(prefCalls[0].body).toEqual(prefCalls[1].body); expect(prefCalls[0].key).toEqual(prefCalls[1].key);
  expect(prefCalls[1].body.sources).toEqual({ care: true, booklet: false, journal: false, assistantMemory: false });
  await followup.getByRole('button', { name: 'Generate preview · Do not send', exact: true }).click();
  await expect(followup.locator('.followup-preview-message')).toContainText('How is Tofu doing');
  expect(calls.filter(call => /process|push|dispatch|send/.test(call.path))).toHaveLength(0);
  await noOverflow(); await page.screenshot({ path: '.verification/followup-settings-mobile-en.png', fullPage: true }); await followup.screenshot({ path: '.verification/followup-settings-panel-mobile-en.png' });
  await followup.getByRole('checkbox', { name: /I consent to AI using the selected data/ }).uncheck(); await expect(enabled).not.toBeChecked();
  await followup.getByRole('button', { name: 'Save choices', exact: true }).click(); await expect(followup.getByText('Follow-up messages are off.', { exact: true })).toBeVisible();
  stalePrefs = true;
  await followup.getByRole('combobox', { name: 'Minimum message interval', exact: true }).selectOption('7');
  await followup.getByRole('button', { name: 'Save choices', exact: true }).click();
  await expect(followup.getByRole('button', { name: 'Retry the same choices', exact: true })).toBeDisabled();
  await followup.getByRole('button', { name: 'Reload current choices', exact: true }).click();
  await expect(followup.getByRole('combobox', { name: 'Minimum message interval', exact: true })).toHaveValue('7');
  await expect(followup.getByRole('button', { name: 'Save choices', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Thai', exact: true }).click();
  await expect(page.locator('.followup-settings').getByRole('heading', { name: 'ข้อความติดตามผ่าน LINE', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 }); await noOverflow(); await page.screenshot({ path: '.verification/followup-settings-desktop-th.png', fullPage: true });
  await page.goto(`${origin}/app?lang=en&tab=health&petId=${secondPetId}&followupId=${openedFollowupId}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Peony');
  expect(calls.some(call => call.path === '/api/v1/health/care/entries' && call.method === 'GET')).toBe(true);
  expect(calls.filter(call => call.path === `/api/v1/notification/followup/${openedFollowupId}/opened` && call.method === 'POST')).toHaveLength(1);
  await page.goto(`${origin}/app?lang=en&tab=health&petId=00000000-0000-4000-8000-000000000999`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tofu');
  expect(errors).toEqual([]);
  console.log('PASS: independent training consent, multi-angle owner dates/attestation, exact retries, optional-source follow-ups, preview without send, withdrawal, Thai/English/mobile, and authenticated multi-pet follow-up links with unknown-pet fallback.');
} finally { await context.close(); await browser.close(); }
