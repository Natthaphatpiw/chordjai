import {describe,it,expect} from 'vitest';
import {warmAdmission} from './abuse';
describe('bounded warm-instance admission',()=>{
 it('stops a burst without touching a database and reopens the next bucket',()=>{
  expect(warmAdmission('burst-fixture',2,1000)).toBe(true);
  expect(warmAdmission('burst-fixture',2,1001)).toBe(true);
  expect(warmAdmission('burst-fixture',2,1002)).toBe(false);
  expect(warmAdmission('burst-fixture',2,11000)).toBe(true);
 });
 it('does not let arbitrary new keys grow memory without a bound',()=>{
  let admitted=0;for(let n=0;n<2100;n++)if(warmAdmission('bounded-fixture-'+n,1,30000))admitted++;
  expect(admitted).toBeLessThanOrEqual(2048);expect(warmAdmission('fresh-bucket',1,50000)).toBe(true);
 });
});
