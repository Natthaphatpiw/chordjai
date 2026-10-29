import {z} from 'zod';
import type {PoolClient} from '@chordjai/db';
import {HttpError,type ServiceContext} from '@chordjai/service-kit';

export const recordRevisionSchema=z.string().regex(/^[a-f0-9]{32}$/);
export async function recordMutationsReady(db:PoolClient){
  return (await db.query("SELECT to_regprocedure('health.sync_record_mutation()') IS NOT NULL AS ready")).rows[0]?.ready===true;
}
export async function requireRecordMutations(db:PoolClient){
  if(!await recordMutationsReady(db))throw new HttpError(503,'RECORD_MUTATIONS_UPGRADE_REQUIRED','กรุณาอัปเกรดฐานข้อมูลรุ่น 23 ก่อนแก้ไขหรือลบประวัติสุขภาพ');
}
/** Existing DELETE clients may omit the body. New clients send the revision
 * they reviewed so a stale confirmation cannot delete a newer record. */
export async function optionalDeleteGuard(c:ServiceContext,field:'revision'|'version'){
  const raw=await c.req.text();
  if(!raw.trim())return {} as {revision?:string;version?:number};
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new HttpError(400,'INVALID_JSON','ข้อมูลคำขอลบไม่ถูกต้อง');}
  const parsed=(field==='revision'?z.object({revision:recordRevisionSchema}).strict():z.object({version:z.number().int().positive()}).strict()).safeParse(value);
  if(!parsed.success)throw new HttpError(400,'VALIDATION_ERROR','กรุณาโหลดรายการล่าสุดก่อนลบ');
  return parsed.data as {revision?:string;version?:number};
}
