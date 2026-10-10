import type { Pet, HealthRecord, JournalPage } from './types';
import { translate, type Locale } from '../../shared/locale-core';
export const demoPets: Pet[] = [{ id: 'demo-tofu', name: 'ถั่วเหลือง', species: 'cat', sex: 'female', birthDate: '2023-04-12', neutered: true, weightKg: 4.2 }, { id: 'demo-mochi', name: 'โมจิ', species: 'dog', sex: 'male', birthDate: '2022-08-01', neutered: false, weightKg: 8.5 }];
export const demoRecords: HealthRecord[] = [{ id: 'demo-vaccine', petId: 'demo-tofu', kind: 'vaccine', title: 'วัคซีนรวมแมว (FVRCP)', recordedAt: '2026-04-12', nextDueAt: '2027-04-12', notes: 'บันทึกตัวอย่างสำหรับทดลองหน้าจอ' }, { id: 'demo-weight', petId: 'demo-tofu', kind: 'weight', title: 'ชั่งน้ำหนัก', recordedAt: '2026-10-01', value: 4.2 }, { id: 'demo-checkin', petId: 'demo-tofu', kind: 'checkin', title: 'เช็กอินประจำเดือน', recordedAt: '2026-10-01', notes: 'กินและเล่นตามปกติ' }];
const seedPairs: [string,string][]=[['ถั่วเหลือง','Tofu'],['โมจิ','Mochi'],['วัคซีนรวมแมว (FVRCP)','Combined feline vaccine (FVRCP)'],['ชั่งน้ำหนัก','Weigh-in'],['เช็กอินประจำเดือน','Monthly check-in'],['บันทึกตัวอย่างสำหรับทดลองหน้าจอ','A sample record for exploring the interface'],['กินและเล่นตามปกติ','Eating and playing as usual'],['วันที่มีเธออยู่ด้วย','A day with you'],['ขอบคุณที่ทำให้วันที่ธรรมดา\nกลายเป็นวันที่แสนพิเศษ','Thank you for making an ordinary day\nfeel a little more special']];
function seedText(value:string,locale:Locale){const pair=seedPairs.find(pair=>pair.includes(value));return pair?translate(locale,...pair):value;}
// Localise only known seed values. Personal edits and added records are kept intact.
export function localizeDemoPets(pets:Pet[],locale:Locale):Pet[]{return pets.map(pet=>pet.id==='demo-tofu'||pet.id==='demo-mochi'?{...pet,name:seedText(pet.name,locale)}:pet);}
export function localizeDemoRecords(records:HealthRecord[],locale:Locale):HealthRecord[]{return records.map(record=>['demo-vaccine','demo-weight','demo-checkin'].includes(record.id)?{...record,title:seedText(record.title,locale),...(record.notes?{notes:seedText(record.notes,locale)}:{})}:record);}
export function localizeDemoPage(page:JournalPage,locale:Locale):JournalPage{return page.id.startsWith('demo-journal-')?{...page,title:seedText(page.title,locale),elements:page.elements.map(element=>['title','body'].includes(element.id)?{...element,content:seedText(element.content,locale)}:element)}:page;}
export const initialPage = (petId: string,locale:Locale='th'): JournalPage => localizeDemoPage({
  id: `demo-journal-${petId}`, petId, title: 'วันที่มีเธออยู่ด้วย', version: 1,
  theme: { background: '#fffaf5', font: 'sans', accent: '#ff8a24' },
  elements: [
    { id: 'title', type: 'text', x: 75, y: 75, width: 650, height: 100, rotation: 0, content: 'วันที่มีเธออยู่ด้วย', color: '#3a210d' },
    { id: 'cat', type: 'photo', x: 110, y: 220, width: 580, height: 410, rotation: -2, content: petId === 'demo-mochi' ? '/images/pet-home-dog.webp' : '/images/pet-home-cat.webp' },
    { id: 'flower', type: 'sticker', x: 620, y: 575, width: 110, height: 110, rotation: 12, content: 'graphic:flower', color: '#ef7d16' },
    { id: 'body', type: 'text', x: 110, y: 700, width: 580, height: 160, rotation: 0, content: 'ขอบคุณที่ทำให้วันที่ธรรมดา\nกลายเป็นวันที่แสนพิเศษ', color: '#564338' },
    { id: 'star', type: 'sticker', x: 70, y: 500, width: 95, height: 95, rotation: -15, content: 'graphic:leaf', color: '#006d41' },
  ],
},locale);
