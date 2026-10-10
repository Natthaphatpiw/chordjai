import { browserLocale, translate, type Locale } from './locale-core';

const englishErrors: Record<string, string> = {
  UNAUTHORIZED: 'Please sign in with LINE to continue.',
  FORBIDDEN: 'You do not have permission to access this item.',
  CLINIC_MEMBERSHIP_REQUIRED: 'Please ask the clinic administrator to give you access.',
  GRANT_REQUIRED: 'The owner must grant this clinic access to the pet’s records first.',
  NOT_FOUND: 'This item is unavailable or you do not have access to it.',
  PET_NOT_FOUND: 'This pet is unavailable.', PAGE_NOT_FOUND: 'This journal page is unavailable.',
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
export async function api<T>(path: string, init: RequestInit = {}, publicRequest = false): Promise<T> {
  const token = !publicRequest && typeof window !== 'undefined' ? window.sessionStorage.getItem('chordjai.session') : null;
  const headers = new Headers(init.headers);
  headers.set('Accept-Language', browserLocale());
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api/v1${path}`, { ...init, headers, cache: 'no-store' });
  const envelope = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiError(envelope.error?.code ?? 'REQUEST_FAILED', envelope.error?.message ?? 'เชื่อมต่อบริการไม่สำเร็จ กรุณาลองอีกครั้ง', response.status);
  if (!('data' in envelope)) throw new ApiError('INVALID_RESPONSE', 'รูปแบบข้อมูลจากบริการไม่ถูกต้อง', response.status);
  return envelope.data as T;
}
export function json(method: string, body: unknown): RequestInit { return { method, body: JSON.stringify(body) }; }
export async function lineIdToken(liffId: string): Promise<string> {
  const locale = browserLocale();
  if (!liffId) throw new Error(translate(locale, 'ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID', 'LINE sign-in has not been configured yet.'));
  const { default: liff } = await import('@line/liff');
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); throw new Error(translate(locale, 'กำลังเปิดหน้าล็อกอิน LINE', 'Opening LINE sign-in…')); }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error(translate(locale, 'LINE ไม่ได้ส่ง ID token กรุณาเปิด scope openid ใน LINE Developers', 'LINE did not return an ID token. Please enable the openid scope in LINE Developers.'));
  return idToken;
}
export async function lineLogin(liffId: string): Promise<string> {
  const idToken = await lineIdToken(liffId);
  const { default: liff } = await import('@line/liff');
  const accessToken=liff.getAccessToken();
  const session = await api<{ token: string }>('/identity/line', json('POST', { idToken,...(accessToken?{accessToken}:{}) }),true);
  if (!session.token) throw new Error(translate(browserLocale(), 'ไม่ได้รับ session จากบริการยืนยันตัวตน', 'Sign-in could not be completed. Please try again.'));
  window.sessionStorage.setItem('chordjai.session', session.token);
  return session.token;
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
