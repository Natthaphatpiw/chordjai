import {describe,it,expect} from 'vitest';
import {quickInputDecision,canonicalInput} from './ingress';
import {priceTokens,tokenUsage} from './pricing';
describe('zero-model ingress exclusions',()=>{
 it('ignores only closed greeting/off-topic examples',()=>{
  for(const text of ['สวัสดี','สวัสดีครับ','hello!','นายกชื่ออะไร','หุ้นตัวไหนดี','who is the president?'])expect(quickInputDecision(text)?.route,text).toBe('unsupported');
 });
 it('keeps care stories, names, terse answers, negation and product questions for contextual routing',()=>{
  for(const text of ['สวัสดี วันนี้พีโอนีไปหาหมอ','414 บาท','พีโอนี','ใช่','ยังไม่หาย','ดีขึ้นแล้ว','น้องไม่หายใจ','What can you do?','stocks of cat food','วิธีใช้งานระบบ','วันที่ 15 พ.ย.','ขอบคุณที่ช่วยดูแลพีโอนี'])expect(quickInputDecision(text),text).toBeNull();
 });
 it('normalizes visually invisible noise without removing meaningful Thai/English',()=>{
  expect(canonicalInput('  พีโอนี\u200b   4.3  ')).toBe('พีโอนี 4.3');
  expect(quickInputDecision('x'.repeat(180))?.reason).toBe('spam');
 });
 it('prices Luna independently from the main model with cache breakdown',()=>{
  const usage=tokenUsage({input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:400,cache_write_tokens:100}})!;
  expect(priceTokens('gpt-6-luna',usage)?.usd).toBe(0.0001665);
  expect(priceTokens('gpt-6.1-sol',usage)?.usd).toBe(0.00329);
 });
});
