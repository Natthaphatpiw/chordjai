import {describe,it,expect} from 'vitest';
import {blockedChatReply} from './chat-safety';

describe('relevant fallback for a blocked Chat draft',()=>{
  it('acknowledges the exact planned Peony visit without turning it into completed treatment or an emergency',()=>{
    const reply=blockedChatReply('วันนี้จะพาน้องพีโอนีไปหยอดหลังคอเพื่อจัดการไรหู','th');
    expect(reply).toContain('เป็นแผน');expect(reply).toContain('ยังไม่ถือว่าได้รับการรักษาแล้ว');
    expect(reply).toContain('บันทึกไดอารี่ให้หน่อย');expect(reply).not.toContain('โรงพยาบาลสัตว์ทันที');
    expect(reply).not.toContain('บันทึกแล้ว');expect(reply).not.toMatch(/\d+\s*(?:mg|ml|หยด)/);
  });
  it('does not issue emergency warnings just because an ordinary report mentions medicine',()=>{
    const reply=blockedChatReply('คุณหมอให้ยามาแล้ว ฉันจำชื่อยาไม่ได้','th');
    expect(reply).toContain('สิ่งที่หมอบอก');expect(reply).not.toContain('ฉุกเฉิน');expect(reply).not.toContain('ทันที');
  });
  it('keeps actual current urgent signs ahead of planned-care acknowledgements',()=>{
    const reply=blockedChatReply('วันนี้จะพาไปหยอดหลังคอ แต่น้องกำลังชักไม่หยุด','th');
    expect(reply).toContain('ติดต่อสัตวแพทย์ทันที');expect(reply).not.toContain('บันทึกไดอารี่');
  });
  it('does not convert a denied urgent sign into an emergency and supports English-only replies',()=>{
    expect(blockedChatReply('น้องไม่ได้หายใจลำบาก วันนี้จะพาไปหาหมอ','th')).toContain('เป็นแผน');
    const reply=blockedChatReply('I am going to take Peony to the vet today.','en');
    expect(reply).toContain('planned visit');expect(reply).toContain('Please save this in the care diary');expect(reply).not.toMatch(/[ก-๙]/);
  });
});
