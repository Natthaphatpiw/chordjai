import {describe,it,expect} from 'vitest';
import {buildCalendar} from './calendar.js';
import {bangkokNotificationTime} from './app.js';
describe('notification scheduling and calendar safety',()=>{
  it('uses Bangkok 21–08 quiet hours regardless of machine timezone',()=>{
    expect(bangkokNotificationTime(new Date('2026-10-10T14:00:00Z'))).toEqual({day:'2026-10-10',quiet:true});
    expect(bangkokNotificationTime(new Date('2026-10-11T00:59:00Z'))).toEqual({day:'2026-10-11',quiet:true});
    expect(bangkokNotificationTime(new Date('2026-10-11T01:00:00Z'))).toEqual({day:'2026-10-11',quiet:false});
  });
  it('escapes event fields to prevent additional iCalendar properties',()=>{
    const value=buildCalendar([{id:'reminder-1',title:'วัคซีน\r\nATTENDEE:injected;test,foo',due_at:'2026-10-10T08:00:00Z'}]);
    expect(value).toContain('SUMMARY:วัคซีน\\nATTENDEE:injected\\;test\\,foo');
    expect(value).not.toContain('\r\nATTENDEE:');
    expect(value).toContain('DTSTART:20261010T080000Z');
  });
});
