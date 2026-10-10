import type { Pet, HealthRecord, JournalPage } from './types';
export const demoPets: Pet[] = [{ id: 'demo-tofu', name: 'ถั่วเหลือง', species: 'cat', sex: 'female', birthDate: '2023-04-12', neutered: true, weightKg: 4.2 }, { id: 'demo-mochi', name: 'โมจิ', species: 'dog', sex: 'male', birthDate: '2022-08-01', neutered: false, weightKg: 8.5 }];
export const demoRecords: HealthRecord[] = [{ id: 'demo-vaccine', petId: 'demo-tofu', kind: 'vaccine', title: 'วัคซีนรวมแมว (FVRCP)', recordedAt: '2026-04-12', nextDueAt: '2027-04-12', notes: 'บันทึกตัวอย่างสำหรับทดลองหน้าจอ' }, { id: 'demo-weight', petId: 'demo-tofu', kind: 'weight', title: 'ชั่งน้ำหนัก', recordedAt: '2026-10-01', value: 4.2 }, { id: 'demo-checkin', petId: 'demo-tofu', kind: 'checkin', title: 'เช็กอินประจำเดือน', recordedAt: '2026-10-01', notes: 'กินและเล่นตามปกติ' }];
export const initialPage = (petId: string): JournalPage => ({
  id: `demo-journal-${petId}`, petId, title: 'วันที่มีเธออยู่ด้วย', version: 1,
  theme: { background: '#fdf9f3', font: 'sans', accent: '#9b4500' },
  elements: [
    { id: 'title', type: 'text', x: 75, y: 75, width: 650, height: 100, rotation: 0, content: 'วันที่มีเธออยู่ด้วย', color: '#6a2d00' },
    { id: 'cat', type: 'photo', x: 110, y: 220, width: 580, height: 410, rotation: -2, content: petId === 'demo-mochi' ? '/images/pet-home-dog.webp' : '/images/pet-home-cat.webp' },
    { id: 'flower', type: 'sticker', x: 620, y: 575, width: 110, height: 110, rotation: 12, content: 'graphic:flower', color: '#9b4500' },
    { id: 'body', type: 'text', x: 110, y: 700, width: 580, height: 160, rotation: 0, content: 'ขอบคุณที่ทำให้วันที่ธรรมดา\nกลายเป็นวันที่แสนพิเศษ', color: '#564338' },
    { id: 'star', type: 'sticker', x: 70, y: 500, width: 95, height: 95, rotation: -15, content: 'graphic:leaf', color: '#006d41' },
  ],
});
