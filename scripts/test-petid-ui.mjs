import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Local browser + explicit mock API only. No LINE/OpenAI/storage/production calls.
const origin = process.env.UI_TEST_ORIGIN || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('PetID UI tests require a local server');
const petId = '00000000-0000-4000-8000-000000000100';
const enrollmentId = '00000000-0000-4000-8000-000000000200';
const matchId = '00000000-0000-4000-8000-000000000300';
const image = await readFile('frontend/owner-app/public/images/pet-home-cat.webp');
const photoFiles = Array.from({ length: 6 }, (_, index) => ({ name: `pet-view-${index + 1}.webp`, mimeType: 'image/webp', buffer: image }));
const browser = await chromium.launch();
await mkdir('.verification', { recursive: true });
const errors = [];
const apiCalls = [];
let uploadCount = 0;
let enrollment = null;
let registerAttempts = 0;
const referencePhotos = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(() => {
  const payload = btoa(JSON.stringify({ sub: 'ui-test-user', exp: Math.floor(Date.now() / 1000) + 3600 }));
  sessionStorage.setItem('chordjai.session', `e30.${payload}.test-signature`);
});
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) return route.abort();
  if (!url.pathname.startsWith('/api/v1/')) return route.continue();
  const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : undefined;
  apiCalls.push({ method: request.method(), path: url.pathname, body, headers: request.headers() });
  const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  if (request.method() === 'GET') {
    if (url.pathname === '/api/v1/pets') return reply([{ id: petId, name: 'Tofu', species: 'cat', sex: 'female', neutered: true }]);
    if (url.pathname === '/api/v1/identity/consents') return reply([{ purpose: 'service', granted: true }]);
    if (url.pathname === '/api/v1/biometric/enrollments') return reply(enrollment ? [enrollment] : []);
    if (url.pathname === '/api/v1/biometric/matches') return reply([{ id: matchId, petId, createdAt: '2026-10-01T00:00:00Z', ownerConfirmed: null, evidenceImageUrl: '/images/pet-home-cat.webp', evidence: { verification: { observations: ['A possible tabby marking'], limitations: 'The owner must confirm.' } } }]);
    if (['/api/v1/health/records', '/api/v1/clinics', '/api/v1/lostfound/cases', '/api/v1/notification/inbox'].includes(url.pathname)) return reply([]);
  }
  if (url.pathname === '/api/v1/media/upload' && request.method() === 'POST') {
    const id = `00000000-0000-4000-8000-${String(++uploadCount).padStart(12, '0')}`;
    const media = { id, url: '/images/pet-home-cat.webp' }; referencePhotos.push(media);
    return reply(media);
  }
  if (url.pathname === '/api/v1/biometric/describe') return reply({ description: 'Brown tabby cat with a cream chin and round green eyes.', qualityIssues: ['Confirm the eye colour in natural light.'], requiresReview: true, usable: true, draftToken: `test-bound-draft-${body.mediaIds.length}` });
  if (url.pathname === '/api/v1/biometric/enrollments' && request.method() === 'POST') {
    if (++registerAttempts === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Mocked transient failure' } }) });
    enrollment = { id: enrollmentId, ...body, status: 'ready', photos: body.mediaIds.map(id => referencePhotos.find(photo => photo.id === id)) };
    return reply(enrollment);
  }
  if (url.pathname === `/api/v1/biometric/enrollments/${enrollmentId}` && request.method() === 'DELETE') { enrollment = null; return reply({ withdrawn: true }); }
  if (url.pathname === `/api/v1/biometric/matches/${matchId}/confirm`) return reply({ id: matchId, ownerConfirmed: body.confirmed });
  if (url.pathname === '/api/v1/biometric/identify') return reply({ status: 'possible', candidates: [{ matchId: 'possible-match', publicSlug: 'test-found-pet', observations: ['A similar tabby coat'], limitations: 'Please ask the owner to review.' }], qualityIssues: [], notice: 'Possible matches require owner confirmation.' });
  return route.abort();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${origin}/app?lang=en&tab=petid`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'PetID for Tofu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Register PetID', exact: true }).click();
  const dialog = page.locator('dialog');
  const photosInput = dialog.getByLabel('Choose up to five PetID photos', { exact: true });
  const register = dialog.getByRole('button', { name: 'Register PetID', exact: true });
  await expect(register).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Generate from all photos', exact: true })).toBeDisabled();
  await photosInput.setInputFiles(photoFiles);
  await expect(dialog.getByRole('alert')).toContainText('Choose up to 5 photos');
  expect(uploadCount).toBe(0);
  await photosInput.setInputFiles(photoFiles.slice(0, 5));
  await expect(dialog.locator('.petid-photo-card')).toHaveCount(5);
  await expect(photosInput).toBeDisabled();
  expect(uploadCount).toBe(5);
  expect(apiCalls.filter(call => call.path === '/api/v1/biometric/describe')).toHaveLength(0);
  expect(apiCalls.filter(call => call.path === '/api/v1/biometric/enrollments' && call.method === 'POST')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Generate from all photos', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Review and edit identifying features', exact: true })).toHaveValue(/Brown tabby/);
  const generated = apiCalls.find(call => call.path === '/api/v1/biometric/describe');
  expect(generated.body.mediaIds).toHaveLength(5);
  await dialog.getByRole('textbox', { name: 'Review and edit identifying features', exact: true }).fill('Tabby cat with a cream chin, a dark tail tip and amber eyes.');
  await dialog.getByRole('checkbox', { name: 'I have reviewed the photos and corrected the identifying features.', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Allow image search when my pet has an active missing notice.', exact: true }).check();
  await expect(register).toBeEnabled();
  await dialog.getByRole('button', { name: 'Remove photo 5', exact: true }).click();
  await expect(register).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'I have reviewed the photos and corrected the identifying features.', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Move photo 2 earlier', exact: true }).click();
  await expect(dialog.getByText('AI draft', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Regenerate from all photos', exact: true }).click();
  await expect(dialog.getByText('AI draft', { exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Review and edit identifying features', exact: true }).fill('Tabby cat with a cream chin, a dark tail tip and amber eyes.');
  await dialog.getByRole('checkbox', { name: 'I have reviewed the photos and corrected the identifying features.', exact: true }).check();
  await register.click();
  await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable');
  await register.click();
  await expect(dialog).toHaveCount(0);
  const registrations = apiCalls.filter(call => call.path === '/api/v1/biometric/enrollments' && call.method === 'POST');
  expect(registrations).toHaveLength(2);
  expect(registrations[0].headers['idempotency-key']).toBeTruthy();
  expect(registrations[0].headers['idempotency-key']).toBe(registrations[1].headers['idempotency-key']);
  expect(registrations[1].body.description).toContain('amber eyes');
  expect(registrations[1].body.mediaIds).toEqual([referencePhotos[1].id, referencePhotos[0].id, referencePhotos[2].id, referencePhotos[3].id]);
  expect(registrations[1].body.searchMode).toBe('lost_only');
  expect(registrations[1].body.draftToken).toBe('test-bound-draft-4');
  await page.getByRole('button', { name: 'Update PetID photos and details', exact: true }).click();
  await expect(page.locator('dialog .petid-photo-card')).toHaveCount(4);
  await expect(page.locator('dialog').getByRole('button', { name: 'Register PetID', exact: true })).toBeDisabled();
  expect(await page.locator('dialog').innerText()).not.toMatch(/[\u0E00-\u0E7F]/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: '.verification/petid-multi-photo-mobile-en.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.verification/petid-multi-photo-desktop-en.png', fullPage: true });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'This is my pet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Owner confirmed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Not my pet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmed not a match', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Withdraw PetID', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Register PetID', exact: true })).toBeVisible();
  await page.locator('label').filter({ hasText: 'Choose a photo of the found pet' }).locator('input[type=file]').setInputFiles(photoFiles[0]);
  await expect(page.getByRole('heading', { name: 'There are possible matches', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View notice and send a tip', exact: true })).toBeVisible();
  expect(apiCalls.filter(call => call.path === `/api/v1/biometric/matches/${matchId}/confirm`).map(call => call.body.confirmed)).toEqual([true, false]);
  expect(errors).toEqual([]);
  console.log('PetID UI passed: five-photo limit, explicit AI draft, editable review, reorder/removal, stable retry key, update, withdrawal and finder/owner confirmation; English/mobile/desktop.');
} finally { await context.close(); await browser.close(); }
