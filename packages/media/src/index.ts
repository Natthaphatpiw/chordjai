import { get } from '@vercel/blob';
import { SignJWT,jwtVerify } from 'jose';
import sharp from 'sharp';
import { withUser,withSystem } from '@chordjai/db';
import { HttpError } from '@chordjai/service-kit';
type Asset={id:string;user_id:string;pathname:string;mime:string;status:string};
function key(){const s=process.env.APP_JWT_SECRET;if(!s||s.length<32)throw new HttpError(503,'AUTH_NOT_CONFIGURED','ระบบยืนยันตัวตนยังไม่พร้อม');return new TextEncoder().encode(s);}
export function mediaIdFromUrl(value:string){
  if(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value))return value;
  let url:URL;try{url=new URL(value,process.env.APP_ORIGIN??'https://www.chordjai.life');}catch{throw new HttpError(400,'INVALID_IMAGE','รูปต้องอัปโหลดผ่านระบบ');}
  const allowed=[process.env.APP_ORIGIN??'https://www.chordjai.life',process.env.API_ORIGIN??'https://api.chordjai.life','http://localhost:3000','http://localhost:8787'];
  const id=url.pathname.match(/^\/api\/v1\/media\/([\da-f-]{36})$/i)?.[1];
  if(!allowed.includes(url.origin)||!id)throw new HttpError(400,'INVALID_IMAGE','รูปต้องอัปโหลดผ่านระบบ');return id;
}
export async function mediaUrl(asset:Pick<Asset,'id'|'user_id'>){
  const token=await new SignJWT({mediaId:asset.id}).setProtectedHeader({alg:'HS256'}).setSubject(asset.user_id).setAudience('chordjai-media').setIssuedAt().setExpirationTime('10m').sign(key());
  return `/api/v1/media/${asset.id}?read=${token}`;
}
async function read(asset:Asset){
  // One deadline covers both response headers and the complete private stream.
  const signal=AbortSignal.timeout(15_000);
  try {
    const result=await get(asset.pathname,{access:'private',token:process.env.BLOB_READ_WRITE_TOKEN,abortSignal:signal});
    signal.throwIfAborted();
    if(!result||result.statusCode!==200||!result.stream)throw new HttpError(404,'IMAGE_UNAVAILABLE','ไม่พบไฟล์รูป');
    const reader=result.stream.getReader();
    const abort=()=>{void reader.cancel(signal.reason).catch(()=>{});};
    signal.addEventListener('abort',abort,{once:true});
    let bytes:Buffer;
    try {
      const chunks:Buffer[]=[];
      while(true){
        signal.throwIfAborted();
        const chunk=await reader.read();
        signal.throwIfAborted();
        if(chunk.done)break;
        chunks.push(Buffer.from(chunk.value));
      }
      bytes=Buffer.concat(chunks);
    }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
    return await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  }catch(error){
    if(signal.aborted)throw new HttpError(503,'SERVICE_UNAVAILABLE','โหลดรูปไม่สำเร็จในเวลาที่กำหนด กรุณาลองใหม่อีกครั้ง');
    throw error;
  }
}
export async function loadOwnedImage(userId:string,mediaId:string):Promise<string>{
  const asset=await withUser(userId,async db=>(await db.query("SELECT * FROM media.objects WHERE id=$1 AND status='ready'",[mediaId])).rows[0] as Asset|undefined);
  if(!asset)throw new HttpError(404,'IMAGE_NOT_FOUND','ไม่พบรูปหรือไม่มีสิทธิ์เข้าถึง');return `data:image/jpeg;base64,${(await read(asset)).toString('base64')}`;
}
export async function readMedia(mediaId:string,userId?:string,token?:string){
  let owner:string|undefined;
  if(token){try{const {payload}=await jwtVerify(token,key(),{algorithms:['HS256'],audience:'chordjai-media'});if(payload.mediaId!==mediaId)throw new Error('wrong_asset');owner=payload.sub;}catch{throw new HttpError(401,'IMAGE_LINK_EXPIRED','ลิงก์รูปหมดอายุ กรุณาเปิดหน้าใหม่');}}
  const asset=userId?await withUser(userId,async db=>(await db.query("SELECT * FROM media.objects WHERE id=$1 AND status='ready'",[mediaId])).rows[0] as Asset|undefined):owner?await withSystem(async db=>(await db.query("SELECT * FROM media.objects WHERE id=$1 AND user_id=$2 AND status='ready'",[mediaId,owner])).rows[0] as Asset|undefined):undefined;
  if(!asset)throw new HttpError(404,'IMAGE_NOT_FOUND','ไม่พบรูป');return read(asset);
}
/** Save stable references; response URLs carry short-lived capabilities only. */
export function stableMediaContent(content:string){try{return `/api/v1/media/${mediaIdFromUrl(content)}`;}catch{return content;}}
export async function refreshStoredMediaUrls(userId:string,elements:unknown[]){
  return Promise.all(elements.map(async element=>{
    const e=element as Record<string,unknown>;if(e.type!=='photo'||typeof e.content!=='string')return e;
    const id=mediaIdFromUrl(e.content);const asset=await withUser(userId,async db=>(await db.query("SELECT id,user_id FROM media.objects WHERE id=$1 AND status='ready'",[id])).rows[0]);
    return {...e,content:asset?await mediaUrl(asset):''};
  }));
}
