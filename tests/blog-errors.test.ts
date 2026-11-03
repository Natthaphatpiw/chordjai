import {describe,it,expect} from 'vitest';
import {BlogApiError,blogErrorMessage} from '../frontend/admin-console/components/blog-api';
describe('blog studio error language',()=>{
 it('translates known API failures while keeping Thai details on the Thai page',()=>{
  const error=new BlogApiError('กรุณาเพิ่มคำอธิบายรูปปกก่อนเผยแพร่',400,'BLOG_IMAGE_ALT_REQUIRED');
  expect(blogErrorMessage(error,'th')).toBe(error.message);
  expect(blogErrorMessage(error,'en')).toContain('alternative text');
  expect(blogErrorMessage(error,'en')).not.toMatch(/[\u0e00-\u0e7f]/);
 });
 it('uses an English fallback for unknown server errors rather than showing raw Thai',()=>{
  expect(blogErrorMessage(new BlogApiError('ข้อผิดพลาดจากระบบ',503,'NEW_SERVER_ERROR'),'en')).toContain('unsaved article');
 });
 it('distinguishes duplicate URLs from version conflicts',()=>{
  expect(blogErrorMessage(new BlogApiError('ข้อมูลนี้มีอยู่แล้ว',409,'CONFLICT'),'en')).toContain('URL is already in use');
  expect(blogErrorMessage(new BlogApiError('บทความถูกแก้ไข',409,'BLOG_VERSION_CONFLICT'),'en')).toContain('another window');
 });
 it('preserves frontend messages and translates transport timeouts',()=>{
  expect(blogErrorMessage(new Error('Choose JPG, PNG or WebP.'),'en')).toBe('Choose JPG, PNG or WebP.');
  expect(blogErrorMessage(new DOMException('timeout','TimeoutError'),'en')).toContain('took too long');
 });
});
