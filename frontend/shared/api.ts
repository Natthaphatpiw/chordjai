export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); this.name = 'ApiError'; }
}
export async function api<T>(path: string, init: RequestInit = {}, publicRequest = false): Promise<T> {
  const token = !publicRequest && typeof window !== 'undefined' ? window.sessionStorage.getItem('chordjai.session') : null;
  const headers = new Headers(init.headers);
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
  if (!liffId) throw new Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID');
  const { default: liff } = await import('@line/liff');
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); throw new Error('กำลังเปิดหน้าล็อกอิน LINE'); }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error('LINE ไม่ได้ส่ง ID token กรุณาเปิด scope openid ใน LINE Developers');
  return idToken;
}
export async function lineLogin(liffId: string): Promise<string> {
  const idToken = await lineIdToken(liffId);
  const { default: liff } = await import('@line/liff');
  const accessToken=liff.getAccessToken();
  const session = await api<{ token: string }>('/identity/line', json('POST', { idToken,...(accessToken?{accessToken}:{}) }),true);
  if (!session.token) throw new Error('ไม่ได้รับ session จากบริการยืนยันตัวตน');
  window.sessionStorage.setItem('chordjai.session', session.token);
  return session.token;
}
export function dateThai(date: string | null | undefined): string {
  if (!date) return 'ยังไม่ระบุ';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? 'วันที่ไม่ถูกต้อง' : parsed.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
}
export function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'; }
