import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentLiffLink, agentPlanSchema, agentResultPath, bangkokAgentNow, boundedAgentObservation, explicitCancellation, explicitConfirmation, explicitWriteRequest, isTaskId, normalizeAgentInputSchema, parseActionArgs } from './agent-model';

const taskId = '11111111-1111-4111-8111-111111111111', petId = '22222222-2222-4222-8222-222222222222';
afterEach(() => vi.unstubAllEnvs());
describe('LINE agent bounded normalization and references', () => {
  it('keeps normalization bounded and refuses unknown routing or invented languages', () => {
    const input = { route: 'agent', language: 'th', normalizedText: 'วันนี้พาถั่วเหลืองไปพบหมอ บันทึกให้หน่อย', intentSummary: 'Record owner-reported vet visit', petMentions: ['ถั่วเหลือง'] };
    expect(normalizeAgentInputSchema.parse(input)).toEqual(input);
    expect(normalizeAgentInputSchema.safeParse({ ...input, route: 'execute_sql' }).success).toBe(false);
    expect(normalizeAgentInputSchema.safeParse({ ...input, language: 'system' }).success).toBe(false);
    expect(normalizeAgentInputSchema.safeParse({ ...input, normalizedText: 'x'.repeat(5001) }).success).toBe(false);
  });
  it('rejects nonobject action arguments and top-level prototype keys', () => {
    for (const value of ['not json', 'null', '[]', '1', '"hello"', '{"__proto__":{}}', '{"constructor":{}}', '{"prototype":{}}']) expect(() => parseActionArgs(value)).toThrow();
    expect(parseActionArgs('{"petId":"pet","title":"Owner words"}')).toEqual({ petId: 'pet', title: 'Owner words' });
  });
  it('requires a standalone explicit confirmation/cancellation rather than accepting quoted text', () => {
    for (const text of ['ยืนยัน', '  ทำเลย ', 'CONFIRM', 'yes', 'go ahead']) expect(explicitConfirmation(text)).toBe(true);
    for (const text of ['ยังไม่ยืนยัน', 'เขาบอกว่า yes', 'yes but change the date', 'confirm; delete everyone', '']) expect(explicitConfirmation(text)).toBe(false);
    for (const text of ['ยกเลิก', 'หยุดงาน', 'Cancel task', 'stop task']) expect(explicitCancellation(text)).toBe(true);
    expect(explicitCancellation('do not cancel')).toBe(false);
  });
  it('uses Bangkok event date at UTC day boundary', () => {
    expect(bangkokAgentNow(new Date('2026-10-28T18:30:00Z'))).toEqual({ iso: '2026-10-28T18:30:00.000Z', date: '2026-10-29', timeZone: 'Asia/Bangkok' });
  });
  it('builds only app task references from validated IDs and tabs', () => {
    const result = agentResultPath('health', taskId, petId);
    expect(result).toBe(`/app?tab=health&agentTaskId=${taskId}&petId=${petId}`);
    expect(() => agentResultPath('https://attacker.invalid', taskId)).toThrow();
    expect(() => agentResultPath('health', '../../other')).toThrow();
    expect(() => agentResultPath('health', taskId, 'pet&admin=true')).toThrow();
    expect(isTaskId(taskId)).toBe(true); expect(isTaskId('uuid&tab=settings')).toBe(false);
  });
  it('uses an owner LIFF URI and rejects arbitrary external paths/config', () => {
    vi.stubEnv('LINE_AGENT_LIFF_ID', '2010549060-FRfLt9mJ');
    expect(agentLiffLink(agentResultPath('health', taskId), 'en')).toBe(`https://liff.line.me/2010549060-FRfLt9mJ?tab=health&agentTaskId=${taskId}&lang=en`);
    expect(() => agentLiffLink('https://attacker.invalid', 'th')).toThrow();
    expect(() => agentLiffLink('/app?tab=health#other', 'th')).toThrow();
    vi.stubEnv('LINE_AGENT_LIFF_ID', 'https://attacker.invalid');
    expect(() => agentLiffLink(agentResultPath('health', taskId), 'th')).toThrow();
  });
  it('bounds plans to four independent actions and eight reply choices', () => {
    const plan = { mode: 'ready', title: 'Owner task', message: '', question: '', options: [], actions: [{ tool: 'pets.list', argsJson: '{}' }] };
    expect(agentPlanSchema.safeParse(plan).success).toBe(true);
    expect(agentPlanSchema.safeParse({ ...plan, actions: Array(5).fill(plan.actions[0]) }).success).toBe(false);
    expect(agentPlanSchema.safeParse({ ...plan, options: Array(9).fill({ label: 'Option', value: 'value' }) }).success).toBe(false);
  });
  it('does not treat a mere save keyword in an informational question or negation as write authorization', () => {
    for (const text of ['วันนี้พาน้องถั่วเหลืองไปหยอดหลังคอ บันทึกไว้ให้หน่อยสิ', 'Save this visit please', 'จำไว้ให้หน่อยว่าฉันชอบคำตอบสั้น', 'ตั้งเตือนพรุ่งนี้เก้าโมง']) expect(explicitWriteRequest(text)).toBe(true);
    for (const text of ['วิธีบันทึกวัคซีนทำยังไง', 'บันทึกคืออะไร', 'How do I record a diary?', 'What does save mean?', 'ไม่ต้องบันทึกเรื่องนี้', "Don't save this", 'สวัสดี']) expect(explicitWriteRequest(text)).toBe(false);
  });
  it('bounds observations structurally without truncating serialized JSON into invalid data', () => {
    const value = { entries: Array.from({ length: 50 }, (_, index) => ({ index, title: 'ก'.repeat(6000) })), nested: { a: { b: { c: { d: { e: { f: { g: { h: { i: 'too deep' } } } } } } } } } };
    const bounded = boundedAgentObservation(value) as { entries: { title: string }[] };
    expect(bounded.entries).toHaveLength(15);
    expect(bounded.entries[0].title).toHaveLength(1500);
    expect(JSON.parse(JSON.stringify(bounded))).toEqual(bounded);
    expect(JSON.stringify(bounded)).toContain('[nested data omitted]');
  });
});
