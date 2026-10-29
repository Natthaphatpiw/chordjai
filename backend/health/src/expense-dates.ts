import type {PoolClient} from '@chordjai/db';
import type {CareCost} from '@chordjai/contracts';
import {HttpError} from '@chordjai/service-kit';

export async function expenseDatesReady(db:PoolClient){
  return (await db.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('health.care_costs') AND attname='expense_date' AND NOT attisdropped) AS ready")).rows[0]?.ready===true;
}

/** Optional dates must never be discarded on a schema that cannot save them. */
export async function replaceCareCosts(db:PoolClient,entryId:string,costs:CareCost[]){
  const ready=costs.length?await expenseDatesReady(db):false;
  if(!ready&&costs.some(cost=>cost.expenseDate!==null&&cost.expenseDate!==undefined))throw new HttpError(503,'EXPENSE_DATES_UPGRADE_REQUIRED','วันที่ค่าใช้จ่ายยังไม่พร้อมใช้งาน ร่างของคุณยังอยู่ กรุณาลองใหม่ภายหลัง');
  await db.query('DELETE FROM health.care_costs WHERE entry_id=$1',[entryId]);
  for(const[position,cost]of costs.entries()){
    if(ready)await db.query('INSERT INTO health.care_costs(entry_id,position,label,amount_minor,currency,kind,expense_date) VALUES($1,$2,$3,$4,$5,$6,$7::date)',[entryId,position,cost.label,cost.amountMinor,cost.currency,cost.kind,cost.expenseDate??null]);
    else await db.query('INSERT INTO health.care_costs(entry_id,position,label,amount_minor,currency,kind) VALUES($1,$2,$3,$4,$5,$6)',[entryId,position,cost.label,cost.amountMinor,cost.currency,cost.kind]);
  }
}

/** A new nullable field cannot change the identity of an old undated request.
 * Omit only absent/null expense dates; real dates participate in the hash. */
export function expenseDateHashInput(value:unknown):unknown{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const body=value as Record<string,unknown>;
  if(!Array.isArray(body.costs))return value;
  return {...body,costs:body.costs.map(cost=>{
    if(!cost||typeof cost!=='object'||Array.isArray(cost))return cost;
    const {expenseDate,...rest}=cost as Record<string,unknown>;
    return expenseDate===undefined||expenseDate===null?rest:cost;
  })};
}
