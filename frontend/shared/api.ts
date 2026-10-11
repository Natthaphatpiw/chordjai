import { browserLocale, translate, type Locale } from './locale-core';
import { automaticLiff, initializedLiff } from './liff-session';

const englishErrors: Record<string, string> = {
  UNAUTHORIZED: 'Please sign in with LINE to continue.',
  SESSION_ENDED: 'You have signed out. Please sign in again to continue.',
  FORBIDDEN: 'You do not have permission to access this item.',
  CLINIC_MEMBERSHIP_REQUIRED: 'Please ask the clinic administrator to give you access.',
  GRANT_REQUIRED: 'The owner must grant this clinic access to the pet’s records first.',
  NOT_FOUND: 'This item is unavailable or you do not have access to it.',
  CARE_WRITE_REQUIRED: 'You do not have permission to record care for this pet.',
  CARE_EDIT_REQUIRED: 'Only the author or pet owner can edit this care entry.',
  CARE_ENTRY_NOT_FOUND: 'This care entry is unavailable or you cannot access it.',
  CARE_EPISODE_NOT_FOUND: 'This care episode is unavailable.',
  CARE_EPISODE_MISMATCH: 'Choose a care episode for the same pet.',
  PET_NOT_FOUND: 'This pet is unavailable.', PAGE_NOT_FOUND: 'This journal page is unavailable.',
  BOOK_NOT_FOUND: 'This memory book is unavailable.',
  LAYOUT_INVALID: 'Keep your decorations inside the page.',
  DECORATION_TARGET_INVALID: 'Please choose a page or book cover to decorate.',
  PET_OWNER_REQUIRED: 'Only this pet’s owner can register PetID.',
  PET_IMAGE_UNUSABLE: 'Please use clear photos of the same pet and check the selected species.',
  IMAGE_PET_MISMATCH: 'Please use photos uploaded for this pet.',
  DUPLICATE_PAGE: 'This photo has already been added.',
  INVALID_SCAN_RECORD: 'This booklet item could not be verified. Please scan it again.',
  PHOTO_REFERENCE_INVALID: 'This photo is unavailable. Please upload it again.',
  INVALID_DUE_DATE: 'The next appointment is before the recorded date. Please check the dates and year in your booklet.',
  IDEMPOTENCY_REQUIRED: 'Please retry the save from the review screen.',
  SCAN_NOT_FOUND: 'This scan is unavailable. Please scan the booklet again.',
  VERSION_CONFLICT: 'This page was changed elsewhere. Reload it before saving.',
  AI_NOT_CONFIGURED: 'Our AI companion is not ready yet. Please try again later.',
  AI_UNAVAILABLE: 'AI is temporarily unavailable. Please try again later.',
  AI_RATE_LIMIT: 'You have reached today’s AI limit. Please try again tomorrow.',
  AI_BUDGET_LIMIT: 'Today’s AI limit has been reached. Please try again later.',
  AI_INVALID_OUTPUT: 'AI could not complete its response. Please try again.',
  UNSAFE_AI_OUTPUT: 'Please check the symptoms or contact a veterinarian directly.',
  MODEL_CONFIG_INVALID: 'AI is temporarily unavailable. Please try again later.',
  AI_INPUT_TOO_LARGE: 'Please shorten the message or use fewer photos.',
  INVALID_IMAGE: 'Please use a JPG, PNG or WebP photo no larger than 3.5 MB.',
  UPLOAD_FAILED: 'The photo could not be uploaded. Please try again.',
  INVALID_RESPONSE: 'We received an unexpected response. Please try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  VALIDATION_ERROR: 'Please check the information you entered.',
  INVALID_BODY: 'Please check the information you entered.',
  CONSENT_REQUIRED: 'Please confirm your consent before continuing.',
  SHARE_EXPIRED: 'This link has expired. Please ask the owner for a new one.',
  SHARE_REVOKED: 'The owner has revoked this link.',
  INVITE_EXPIRED: 'This invitation has expired. Please ask for a new one.',
  ALREADY_OWNER: 'This person already owns the pet.',
  SERVICE_UNAVAILABLE: 'This service is temporarily unavailable. Please try again later.',
};
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); this.name = 'ApiError'; }
}
// Browser-local epochs ensure a late sign-in or 401 renewal cannot undo logout.
let authGeneration = 0;
let authSuppressed = false;
type LoginAttempt<T> = { liffId: string; generation: number; promise: Promise<T> };
let automaticLogin: LoginAttempt<boolean> | undefined;
let sessionExchange: LoginAttempt<string> | undefined;
export function clearLineSession(): void {
  authGeneration++;
  authSuppressed = true;
  automaticLogin = undefined;
  sessionExchange = undefined;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem('chordjai.session');
}
function assertAuthGeneration(generation: number): void {
  if (generation !== authGeneration || authSuppressed) throw new ApiError('SESSION_ENDED', translate(browserLocale(), 'คุณออกจากระบบแล้ว กรุณาเข้าสู่ระบบอีกครั้ง', 'You have signed out. Please sign in again to continue.'), 401);
}
export async function api<T>(path: string, init: RequestInit = {}, publicRequest = false, retryAuth = true, generation = authGeneration): Promise<T> {
  if (!publicRequest && typeof window !== 'undefined') assertAuthGeneration(generation);
  const token = !publicRequest && typeof window !== 'undefined' ? window.sessionStorage.getItem('chordjai.session') : null;
  const headers = new Headers(init.headers);
  headers.set('Accept-Language', browserLocale());
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api/v1${path}`, { ...init, headers, cache: 'no-store' });
  const envelope = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } };
  if (!publicRequest && typeof window !== 'undefined') assertAuthGeneration(generation);
  if (response.status === 401 && !publicRequest && retryAuth && ['UNAUTHORIZED','INVALID_TOKEN'].includes(envelope.error?.code ?? '')) {
    // Another request may already have renewed the same expired bearer by the
    // time this response arrives. Reuse it rather than exchanging LINE twice.
    const fresh = typeof window !== 'undefined' ? window.sessionStorage.getItem('chordjai.session') : null;
    if (fresh && fresh !== token) return api<T>(path, init, publicRequest, false, generation);
    if (await autoLineLogin(process.env.NEXT_PUBLIC_LIFF_ID || '')) {
      assertAuthGeneration(generation);
      return api<T>(path, init, publicRequest, false, generation);
    }
  }
  if (!response.ok) throw new ApiError(envelope.error?.code ?? 'REQUEST_FAILED', envelope.error?.message ?? 'เชื่อมต่อบริการไม่สำเร็จ กรุณาลองอีกครั้ง', response.status);
  if (!('data' in envelope)) throw new ApiError('INVALID_RESPONSE', 'รูปแบบข้อมูลจากบริการไม่ถูกต้อง', response.status);
  return envelope.data as T;
}
export function json(method: string, body: unknown): RequestInit { return { method, body: JSON.stringify(body) }; }
export async function lineIdToken(liffId: string, generation = authGeneration): Promise<string> {
  const locale = browserLocale();
  if (!liffId) throw new Error(translate(locale, 'ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID', 'LINE sign-in has not been configured yet.'));
  const liff = await initializedLiff(liffId);
  assertAuthGeneration(generation);
  if (!liff.isLoggedIn()) {
    if (liff.isInClient()) throw new Error(translate(locale, 'LINE ยังยืนยันบัญชีไม่สำเร็จ กรุณาลองเปิดแอปอีกครั้ง', 'LINE could not confirm your account. Please reopen the app.'));
    liff.login({ redirectUri: window.location.href });
    throw new Error(translate(locale, 'กำลังเปิดหน้าล็อกอิน LINE', 'Opening LINE sign-in…'));
  }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error(translate(locale, 'LINE ไม่ได้ส่ง ID token กรุณาเปิด scope openid ใน LINE Developers', 'LINE did not return an ID token. Please enable the openid scope in LINE Developers.'));
  return idToken;
}
async function exchangeLineSession(liffId: string, generation: number): Promise<string> {
  if (sessionExchange?.liffId === liffId && sessionExchange.generation === generation) return sessionExchange.promise;
  const attempt: LoginAttempt<string> = { liffId, generation, promise: Promise.resolve('') };
  attempt.promise = (async () => {
    const idToken = await lineIdToken(liffId, generation);
    const liff = await initializedLiff(liffId);
    assertAuthGeneration(generation);
    const accessToken = liff.getAccessToken();
    const session = await api<{ token: string }>('/identity/line', json('POST', { idToken, ...(accessToken ? { accessToken } : {}) }), true);
    assertAuthGeneration(generation);
    if (!session.token) throw new Error(translate(browserLocale(), 'ไม่ได้รับ session จากบริการยืนยันตัวตน', 'Sign-in could not be completed. Please try again.'));
    window.sessionStorage.setItem('chordjai.session', session.token);
    return session.token;
  })().finally(() => { if (sessionExchange === attempt) sessionExchange = undefined; });
  sessionExchange = attempt;
  return attempt.promise;
}
export async function lineLogin(liffId: string): Promise<string> {
  // Explicit sign-in is the only action that re-enables auth after local logout.
  authSuppressed = false;
  return exchangeLineSession(liffId, authGeneration);
}
export async function autoLineLogin(liffId: string): Promise<boolean> {
  if (authSuppressed) return false;
  const generation = authGeneration;
  if (automaticLogin?.liffId === liffId && automaticLogin.generation === generation) return automaticLogin.promise;
  const attempt: LoginAttempt<boolean> = { liffId, generation, promise: Promise.resolve(false) };
  attempt.promise = (async () => {
    const liff = await automaticLiff(liffId);
    assertAuthGeneration(generation);
    if (!liff) return false;
    if (!liff.isLoggedIn()) {
      if (liff.isInClient()) throw new Error(translate(browserLocale(), 'LINE ยังยืนยันบัญชีไม่สำเร็จ กรุณาลองเปิดแอปอีกครั้ง', 'LINE could not confirm your account. Please reopen the app.'));
      const key = 'chordjai.line.autoRedirectAt';
      const previous = Number(window.sessionStorage.getItem(key) || 0);
      if (Date.now() - previous < 60_000) throw new Error(translate(browserLocale(), 'ยังเข้าสู่ระบบ LINE ไม่สำเร็จ กรุณากดเข้าสู่ระบบเพื่อลองใหม่', 'LINE sign-in was not completed. Please use the sign-in button to try again.'));
      window.sessionStorage.setItem(key, String(Date.now()));
      liff.login({ redirectUri: window.location.href });
      return false;
    }
    await exchangeLineSession(liffId, generation);
    assertAuthGeneration(generation);
    window.sessionStorage.removeItem('chordjai.line.autoRedirectAt');
    return true;
  })().finally(() => { if (automaticLogin === attempt) automaticLogin = undefined; });
  automaticLogin = attempt;
  return attempt.promise;
}
export function dateForLocale(date: string | null | undefined, locale: Locale): string {
  if (!date) return translate(locale, 'ยังไม่ระบุ', 'Not specified');
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? translate(locale, 'วันที่ไม่ถูกต้อง', 'Invalid date') : parsed.toLocaleDateString(locale === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
}
export function dateThai(date: string | null | undefined): string { return dateForLocale(date, 'th'); }
export function messageOf(error: unknown, locale: Locale = browserLocale()): string {
  if (locale === 'en' && error instanceof ApiError) {
    return englishErrors[error.code] ?? (error.status === 401 ? englishErrors.UNAUTHORIZED : error.status === 403 ? englishErrors.FORBIDDEN : error.status === 404 ? englishErrors.NOT_FOUND : error.status === 429 ? englishErrors.RATE_LIMITED : 'We could not complete this request. Please try again.');
  }
  if (error instanceof Error && (locale !== 'en' || !/[\u0e00-\u0e7f]/.test(error.message))) return error.message;
  return translate(locale, 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'Something went wrong. Please try again.');
}
