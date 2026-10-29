import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '@chordjai/service-kit';

export function verifyWebhookSignature(rawBody: string | Uint8Array, signature: string | undefined, secret = process.env.LINE_CHANNEL_SECRET ?? process.env.LINE_MESSAGING_CHANNEL_SECRET): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && timingSafeEqual(expected, received);
}
const claimsSchema = z.object({ sub: z.string().min(1), aud: z.string(), exp: z.number(), iss: z.literal('https://access.line.me'), name: z.string().optional(), picture: z.string().url().optional() });
export async function verifyLineIdToken(idToken: string) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) throw new LineConfigurationError('LINE_LOGIN_NOT_CONFIGURED','ตั้งค่า LINE_LOGIN_CHANNEL_ID ก่อนเข้าสู่ระบบ');
  let response:Response;
  try{response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }), signal: AbortSignal.timeout(10_000),
  });}catch{throw new LineConfigurationError('LINE_LOGIN_UNAVAILABLE','ยังติดต่อ LINE Login ไม่ได้ กรุณาลองใหม่');}
  if(response.status===429||response.status>=500)throw new LineConfigurationError('LINE_LOGIN_UNAVAILABLE','LINE Login ยังไม่พร้อมใช้งาน กรุณาลองใหม่');
  if (!response.ok) throw new Error('LINE token verification failed');
  const claims = claimsSchema.parse(await response.json());
  if (claims.aud !== channelId || claims.exp <= Date.now() / 1000) throw new Error('LINE token has expired or belongs to another channel');
  return { lineUserId: claims.sub, displayName: claims.name ?? 'ผู้ดูแลสัตว์เลี้ยง', pictureUrl: claims.picture ?? null };
}
/** Optional login reconciliation. Unknown/failed checks preserve webhook state. */
export async function verifyLineFriendship(accessToken:string,verifiedLineUserId:string):Promise<boolean|null>{
  const channelId=process.env.LINE_LOGIN_CHANNEL_ID;
  if(!channelId)return null;
  const signal=AbortSignal.timeout(6000);
  try{
    const verifyUrl=new URL('https://api.line.me/oauth2/v2.1/verify');verifyUrl.searchParams.set('access_token',accessToken);
    const verified=await fetch(verifyUrl,{signal,cache:'no-store'});
    if(!verified.ok)return null;
    const claims=z.object({client_id:z.string(),expires_in:z.number().positive(),scope:z.string().optional()}).safeParse(await verified.json());
    if(!claims.success||claims.data.client_id!==channelId)return null;
    const headers={Authorization:`Bearer ${accessToken}`};
    const response=await fetch('https://api.line.me/v2/profile',{headers,signal,cache:'no-store'});
    if(!response.ok)return null;
    const profile=z.object({userId:z.string()}).safeParse(await response.json());
    if(!profile.success||profile.data.userId!==verifiedLineUserId)return null;
    const friendship=await fetch('https://api.line.me/friendship/v1/status',{headers,signal,cache:'no-store'});
    if(!friendship.ok)return null;
    const status=z.object({friendFlag:z.boolean()}).safeParse(await friendship.json());
    return status.success?status.data.friendFlag:null;
  }catch{
    // Provider exceptions can contain credential-bearing URLs. Log no exception,
    // URL, token, LINE user ID, request headers or response body.
    console.warn(JSON.stringify({event:'line_friendship_sync_unavailable'}));return null;
  }
}
export type LineMessage = { type: 'text'; text: string } | { type: 'flex'; altText: string; contents: Record<string, unknown> };
export class LineApiError extends HttpError {constructor(status:number){super(status,'LINE_API_ERROR',`LINE request failed (${status})`);}}
export class LineConfigurationError extends HttpError {constructor(code:string,message:string){super(503,code,message);}}
type CachedToken={key:string;value:string;expiresAt:number};
let cachedToken:CachedToken|undefined;
let pendingToken:{key:string;promise:Promise<string>}|undefined;
function tokenConfig(){
  const value=process.env.LINE_CHANNEL_ACCESS_TOKEN??process.env.LINE_MESSAGING_ACCESS_TOKEN;
  const expiryRaw=process.env.LINE_TOKEN_EXPIRES_AT;
  const expiresAt=expiryRaw?Number(expiryRaw):null;
  if(expiresAt!==null&&(!Number.isFinite(expiresAt)||expiresAt<=0))throw new LineConfigurationError('LINE_TOKEN_EXPIRY_INVALID','LINE_TOKEN_EXPIRES_AT ต้องเป็น Unix timestamp หน่วย milliseconds');
  return {value,expiresAt,channelId:process.env.LINE_CHANNEL_ID,secret:process.env.LINE_CHANNEL_SECRET};
}
/** Metadata only. Never return channel secrets or access-token bytes. */
export function lineMessagingReadiness(){
  try{const config=tokenConfig();
    if(config.value&&(config.expiresAt===null||config.expiresAt>Date.now()+60000))return {ready:true,mode:config.expiresAt===null?'configured_static':'configured_short_lived'};
    if(config.channelId&&config.secret)return {ready:true,mode:'runtime_stateless'};
    return {ready:false,mode:config.value?'expired_token':'missing_credentials'};
  }catch{return {ready:false,mode:'invalid_expiry_configuration'};}
}
/**
 * Preserve user-supplied static/long-lived tokens. When a configured short-lived
 * token expires, or no token is supplied, mint a stateless 15-minute token using
 * channel credentials and cache it only in this runtime. Issuing stateless
 * tokens does not revoke/replace existing tokens or consume the 30-token cap.
 */
export async function getMessagingAccessToken():Promise<string>{
  const config=tokenConfig();
  if(config.value&&(config.expiresAt===null||config.expiresAt>Date.now()+60000))return config.value;
  if(!config.channelId||!config.secret)throw new LineConfigurationError(config.value?'LINE_TOKEN_EXPIRED':'LINE_NOT_CONFIGURED',config.value?'LINE token หมดอายุ กรุณาออก token ใหม่หรือตั้งค่า Channel ID และ secret เพื่อใช้ stateless token':'ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_CHANNEL_ID และ LINE_CHANNEL_SECRET ก่อนส่งข้อความ');
  const key=createHash('sha256').update(`${config.channelId}:${config.secret}`).digest('hex');
  if(cachedToken?.key===key&&cachedToken.expiresAt>Date.now()+60000)return cachedToken.value;
  if(pendingToken?.key===key)return pendingToken.promise;
  const promise=(async()=>{
    let response:Response;
    try{response=await fetch('https://api.line.me/oauth2/v3/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:config.channelId!,client_secret:config.secret!}),signal:AbortSignal.timeout(10000)});}
    catch{throw new LineConfigurationError('LINE_TOKEN_REFRESH_UNAVAILABLE','ยังออก LINE stateless token ไม่ได้ ระบบจะลองใหม่ภายหลัง');}
    if(!response.ok)throw new LineConfigurationError('LINE_TOKEN_REFRESH_FAILED',`LINE ปฏิเสธการออก token (${response.status}) กรุณาตรวจ Channel ID และ secret`);
    let payload:unknown;try{payload=await response.json();}catch{throw new LineConfigurationError('LINE_TOKEN_RESPONSE_INVALID','LINE token response ไม่ถูกต้อง');}
    const parsed=z.object({access_token:z.string().min(1),expires_in:z.number().int().positive().max(900),token_type:z.literal('Bearer')}).safeParse(payload);
    if(!parsed.success)throw new LineConfigurationError('LINE_TOKEN_RESPONSE_INVALID','LINE token response ไม่ถูกต้อง');
    cachedToken={key,value:parsed.data.access_token,expiresAt:Date.now()+parsed.data.expires_in*1000};
    return cachedToken.value;
  })();
  pendingToken={key,promise};
  try{return await promise;}finally{if(pendingToken?.key===key)pendingToken=undefined;}
}
async function callLine(path: string, body: unknown, retryKey?: string, timeoutMs = 10_000) {
  const token = await getMessagingAccessToken();
  let response:Response;
  try{response = await fetch(`https://api.line.me/v2/bot/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(retryKey ? { 'X-Line-Retry-Key': retryKey } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });}catch{throw new LineConfigurationError('LINE_API_UNAVAILABLE','ยังเชื่อมต่อ LINE ไม่ได้ ระบบจะลองใหม่ภายหลัง');}
  if (!response.ok && !(retryKey && response.status === 409)) throw new LineApiError(response.status);
}
export async function replyLine(replyToken: string, messages: LineMessage[], timeoutMs = 10_000) { await callLine('message/reply', { replyToken, messages },undefined,timeoutMs); }
export async function pushLine(to: string, messages: LineMessage[], retryKey: string) { await callLine('message/push', { to, messages }, retryKey); }
/** Ephemeral feedback only: visible while the user has the one-to-one chat
 * open, ending on the next OA message or after the requested duration. LINE
 * supports multiples of five seconds from 5 through 60, and no retry key. */
export async function startLineLoading(chatId:string,loadingSeconds=30){
  if(!/^U[0-9a-f]{32}$/.test(chatId))throw new HttpError(400,'INVALID_LINE_CHAT_ID','Loading requires a one-to-one LINE user chat');
  if(!Number.isInteger(loadingSeconds)||loadingSeconds<5||loadingSeconds>60||loadingSeconds%5!==0)throw new HttpError(400,'INVALID_LINE_LOADING_SECONDS','Loading duration must be a multiple of 5 from 5 to 60 seconds');
  await callLine('chat/loading/start',{chatId,loadingSeconds},undefined,3000);
}
/** Use only a read token from an authenticated webhook's message object. This
 * marks that message and earlier ones as read; it never sends a chat message.
 * With OA Chat disabled LINE marks messages read automatically instead. */
export async function markLineMessagesRead(markAsReadToken:string){
  if(typeof markAsReadToken!=='string'||!markAsReadToken.trim()||markAsReadToken.length>4096)throw new HttpError(400,'INVALID_LINE_READ_TOKEN','A valid LINE message read token is required');
  await callLine('chat/markAsRead',{markAsReadToken},undefined,3000);
}
export function appLink(path = '/') {
  const origin=process.env.APP_ORIGIN??process.env.APP_BASE_URL??'https://www.chordjai.life';
  const mapped:Record<string,string>={'/':'/app','/health':'/app?tab=health','/chat':'/app?tab=chat','/triage':'/app?tab=health','/petid':'/app?tab=lostfound'};
  return `${origin}${mapped[path]??(path.startsWith('/')?path:`/${path}`)}`;
}
