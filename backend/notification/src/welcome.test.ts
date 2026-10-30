import{afterEach,describe,it,expect,vi}from'vitest';
import{welcomeMessages}from'./welcome';
afterEach(()=>vi.unstubAllEnvs());
describe('deterministic LINE onboarding card',()=>{
 it('uses the configured LIFF with task-specific and language parameters',()=>{
  vi.stubEnv('LINE_AGENT_LIFF_ID','2010549060-fixture');const message=welcomeMessages('en')[0] as any;
  expect(message.type).toBe('flex');expect(/[\u0E00-\u0E7F]/.test(JSON.stringify(message))).toBe(false);
  const buttons=message.contents.footer.contents;expect(buttons).toHaveLength(3);expect(buttons[0].action.uri).toBe('https://liff.line.me/2010549060-fixture?tab=home&lang=en&compose=1');expect(buttons[2].action.uri).toContain('tab=profile');
 });
 it('falls back to the existing primary LIFF without creating another registration',()=>{
  vi.stubEnv('LINE_AGENT_LIFF_ID','');vi.stubEnv('LIFF_ID','2010549060-primary');const result=welcomeMessages('th')[0] as any;expect(result.contents.footer.contents[0].action.uri).toContain('/2010549060-primary?');
 });
});
