import { randomUUID } from 'node:crypto';
import { get, put } from '@vercel/blob';
import sharp from 'sharp';
import { withSystem } from '@chordjai/db';
import { HttpError, ok, type ServiceContext } from '@chordjai/service-kit';

export async function uploadBlogImage(c:ServiceContext,username:string){
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'STORAGE_NOT_CONFIGURED','กรุณาตั้งค่า Vercel Blob ก่อนอัปโหลดรูป');
 const form=await c.req.formData(),file=form.get('file');
 if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>3.5*1024*1024)throw new HttpError(400,'BLOG_INVALID_IMAGE','ใช้รูป JPG, PNG หรือ WebP ขนาดไม่เกิน 3.5 MB');
 let output:Buffer,width:number,height:number;
 try{const image=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:40_000_000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});output=image.data;width=image.info.width;height=image.info.height;}catch{throw new HttpError(400,'BLOG_INVALID_IMAGE','อ่านไฟล์รูปไม่ได้ กรุณาใช้รูปอื่น');}
 const id=randomUUID(),pathname=`blog/${id}.webp`;
 await withSystem(db=>db.query('insert into analytics.blog_images(id,pathname,size,width,height,uploaded_by) values($1,$2,$3,$4,$5,$6)',[id,pathname,output.length,width,height,username]));
 try{await put(pathname,output,{access:'private',addRandomSuffix:false,contentType:'image/webp',token:process.env.BLOB_READ_WRITE_TOKEN,abortSignal:AbortSignal.timeout(13_000)});await withSystem(db=>db.query("update analytics.blog_images set status='ready' where id=$1",[id]));}catch{await withSystem(db=>db.query("update analytics.blog_images set status='rejected' where id=$1",[id]));throw new HttpError(503,'BLOG_UPLOAD_FAILED','อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');}
 return ok(c,{id,url:`/api/v1/analytics/admin/blog/images/${id}`,publicUrl:`/api/v1/analytics/blog/images/${id}`,width,height},201);
}
export async function serveBlogImage(c:ServiceContext,id:string,admin:boolean){
 const asset=await withSystem(async db=>{
  const row=(await db.query("select pathname from analytics.blog_images where id=$1 and status='ready'",[id])).rows[0];
  if(!row)return null;
  if(!admin){
   // Structural JSON containment only. A mention in arbitrary prose is never a public grant.
   const visible=(await db.query(`select exists(select 1 from analytics.blog_posts p where p.published_at is not null and p.archived_at is null and
    (p.published->>'coverImageId'=$1 or jsonb_path_exists(p.published->'document','lax $.** ? (@.type == "image" && @.attrs.src == $src)',jsonb_build_object('src','/api/v1/analytics/blog/images/'||$1::text),true))) visible`,[id])).rows[0]?.visible;
   if(!visible)return null;
  }
  return row as {pathname:string};
 });
 if(!asset)throw new HttpError(404,'BLOG_IMAGE_NOT_FOUND','ไม่พบรูปประกอบบทความ');
 const signal=AbortSignal.timeout(15_000);
 try{
  const result=await get(asset.pathname,{access:'private',token:process.env.BLOB_READ_WRITE_TOKEN,abortSignal:signal});
  if(!result||result.statusCode!==200||!result.stream)throw new HttpError(404,'BLOG_IMAGE_NOT_FOUND','ไม่พบรูปประกอบบทความ');
  const reader=result.stream.getReader(),chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel(signal.reason).catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{while(true){signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4_000_000){await reader.cancel();throw new HttpError(502,'BLOG_IMAGE_INVALID','รูปประกอบมีขนาดไม่ถูกต้อง');}chunks.push(chunk.value);}}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
  c.header('Content-Type','image/webp');c.header('Cache-Control','private, no-store');c.header('X-Content-Type-Options','nosniff');return c.body(new Uint8Array(Buffer.concat(chunks)));
 }catch(error){if(signal.aborted)throw new HttpError(503,'BLOG_IMAGE_TIMEOUT','โหลดรูปไม่สำเร็จในเวลาที่กำหนด กรุณาลองใหม่');throw error;}
}
