export function escapeIcs(value:string){return value.replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,').replaceAll('\r','');}
function icsDate(value:string|Date){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
export function buildCalendar(reminders:{id:string;title:string;due_at:string|Date}[]){
  const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ChordJai//Pet Care//TH','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ChordJai ดูแลน้อง'];
  for(const event of reminders)rows.push('BEGIN:VEVENT',`UID:${event.id}@chordjai.life`,`DTSTAMP:${icsDate(new Date())}`,`DTSTART:${icsDate(event.due_at)}`,`SUMMARY:${escapeIcs(event.title)}`,'DESCRIPTION:เปิดแอป ChordJai เพื่อดูรายละเอียดและยืนยันว่าดูแลน้องแล้ว','BEGIN:VALARM','TRIGGER:-PT24H','ACTION:DISPLAY',`DESCRIPTION:${escapeIcs(event.title)}`,'END:VALARM','END:VEVENT');
  rows.push('END:VCALENDAR');return rows.join('\r\n')+'\r\n';
}
