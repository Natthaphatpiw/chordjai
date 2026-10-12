import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { withUser } from '@chordjai/db';
import { createService,getActor,ok,uuid,HttpError } from '@chordjai/service-kit';
import { readMedia,mediaUrl } from '@chordjai/media';
const app=createService('media');
app.post('/api/v1/media/upload',async c=>{
  const actor=getActor(c);if(!process.env.BLOB_READ_WRITE_TOKEN)throw new HttpError(503,'STORAGE_NOT_CONFIGURED','กรุณาตั้งค่า Vercel Blob private store');
  const form=await c.req.formData(),file=form.get('file');if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3.5*1024*1024)throw new HttpError(400,'INVALID_IMAGE','ใช้ JPG, PNG หรือ WebP ขนาดไม่เกิน 3.5 MB');
  const petId=form.get('petId')?uuid(String(form.get('petId'))):null;
  const bytes=Buffer.from(await file.arrayBuffer());let output:Buffer;
  try{output=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();}catch{throw new HttpError(400,'INVALID_IMAGE','อ่านไฟล์รูปไม่ได้ กรุณาใช้รูปอื่น');}
  const id=randomUUID(),pathname=`u/${actor.id}/${id}.jpg`;
  await withUser(actor.id,async db=>{await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',$5,'pending')",[id,actor.id,petId,pathname,output.length]);});
  try{
    const blob=await put(pathname,output,{access:'private',addRandomSuffix:false,contentType:'image/jpeg',token:process.env.BLOB_READ_WRITE_TOKEN});
    await withUser(actor.id,db=>db.query("UPDATE media.objects SET status='ready',url=$1 WHERE id=$2",[blob.url,id]));
  }catch(error){await withUser(actor.id,db=>db.query("UPDATE media.objects SET status='rejected' WHERE id=$1",[id]));throw new HttpError(503,'UPLOAD_FAILED','อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');}
  return ok(c,{id,url:await mediaUrl({id,user_id:actor.id})},201);
});
app.get('/api/v1/media/:id',async c=>{
  const image=await readMedia(uuid(c.req.param('id')),c.get('actor')?.id,c.req.query('read'));c.header('Content-Type','image/jpeg');c.header('Cache-Control','private, no-store');c.header('Referrer-Policy','no-referrer');return c.body(new Uint8Array(image));
});
app.get('/api/v1/media/:id/link',async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id'));
  const asset=await withUser(actor.id,async db=>(await db.query("SELECT id,user_id FROM media.objects WHERE id=$1 AND user_id=$2 AND status='ready'",[id,actor.id])).rows[0]);
  if(!asset)throw new HttpError(404,'IMAGE_NOT_FOUND','ไม่พบรูปที่คุณอัปโหลดหรือรูปไม่พร้อมใช้');
  return ok(c,{id:asset.id,url:await mediaUrl(asset)});
});
app.delete('/api/v1/media/:id',async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id'));
  const asset=await withUser(actor.id,async db=>(await db.query("UPDATE media.objects SET status='deleted' WHERE id=$1 AND user_id=$2 RETURNING pathname",[id,actor.id])).rows[0]);if(!asset)throw new HttpError(404,'NOT_FOUND','ไม่พบรูป');
  // The SQL transition trigger enqueues durable Blob erasure in this same transaction.
  return ok(c,{deleted:true});
});
export default app;
