import {describe,it,expect} from 'vitest';
import {buildMemoryContext} from './memory.js';
const prefs={assistant_name:'ใกล้ใจ',tone:'warm',about_user:'มือใหม่',memory_enabled:true};
describe('consented user memory isolation',()=>{
  it('includes only enabled memories for the current user',()=>{
    const context=JSON.parse(buildMemoryContext('owner-a',prefs,[{user_id:'owner-a',enabled:true,content:'ชอบคำตอบสั้น'},{user_id:'owner-b',enabled:true,content:'ความลับคนอื่น'},{user_id:'owner-a',enabled:false,content:'ลบออกแล้ว'}]));
    expect(context.userApprovedMemories).toEqual(['ชอบคำตอบสั้น']);
  });
  it('disabling long-term memory excludes remembered facts',()=>{
    const context=JSON.parse(buildMemoryContext('owner-a',{...prefs,memory_enabled:false},[{user_id:'owner-a',enabled:true,content:'ห้ามใช้'}]));
    expect(context.userApprovedMemories).toEqual([]);
    expect(context.assistantName).toBe('ใกล้ใจ');
  });
});
