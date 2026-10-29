import {describe,expect,it,vi} from 'vitest';
import type {PoolClient} from '@chordjai/db';
import {careCostSchema} from '@chordjai/contracts';
import {expenseDateHashInput,replaceCareCosts} from './expense-dates';

describe('optional expense dates and legacy request identity',()=>{
  const cost={label:'Consultation',amountMinor:55000,currency:'THB',kind:'paid'};
  it('keeps an omitted or cleared date unknown instead of inferring an event date',()=>{
    expect(careCostSchema.parse(cost).expenseDate).toBeNull();expect(careCostSchema.parse({...cost,expenseDate:null}).expenseDate).toBeNull();
    expect(careCostSchema.parse({...cost,expenseDate:'2026-01-05'}).expenseDate).toBe('2026-01-05');
  });
  it('accepts calendar dates but rejects impossible dates, timestamps and partial formats',()=>{
    expect(careCostSchema.safeParse({...cost,expenseDate:'2024-02-29'}).success).toBe(true);
    for(const expenseDate of ['0000-01-01','2026-02-29','2026-02-30','2026-2-03','2026-01-05T00:00:00Z',''])expect(careCostSchema.safeParse({...cost,expenseDate}).success).toBe(false);
  });
  it('preserves legacy undated hashes while distinguishing a real date from a cleared one',()=>{
    const old={title:'Vet visit',costs:[cost]},addedNull={...old,costs:[{...cost,expenseDate:null}]};
    expect(JSON.stringify(expenseDateHashInput(addedNull))).toBe(JSON.stringify(old));
    expect(JSON.stringify(expenseDateHashInput({...old,costs:[{...cost,expenseDate:'2026-01-05'}]}))).not.toBe(JSON.stringify(old));
  });
  it('fails closed before deleting or inserting costs when the old schema cannot save a date',async()=>{
    const query=vi.fn(async()=>({rows:[{ready:false}]})),db={query} as unknown as PoolClient;
    await expect(replaceCareCosts(db,'entry',[careCostSchema.parse({...cost,expenseDate:'2026-01-05'})])).rejects.toMatchObject({status:503,code:'EXPENSE_DATES_UPGRADE_REQUIRED'});
    expect(query).toHaveBeenCalledOnce();
  });
  it('keeps undated writes compatible with the old schema and passes dates as date-only values on the new schema',async()=>{
    for(const ready of [false,true]){
      const query=vi.fn(async()=>({rows:[{ready}]})),db={query} as unknown as PoolClient;
      await replaceCareCosts(db,'entry',[careCostSchema.parse({...cost,expenseDate:ready?'2026-01-05':null})]);
      const [sql,args]=query.mock.calls.at(-1)! as unknown as [string,unknown[]];
      expect(sql.includes('expense_date')).toBe(ready);expect(args).toEqual(ready?['entry',0,'Consultation',55000,'THB','paid','2026-01-05']:['entry',0,'Consultation',55000,'THB','paid']);
    }
  });
});
