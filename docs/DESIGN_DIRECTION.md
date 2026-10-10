# Kindness & Kinship — ChordJai frontend

ใช้ screenshot ของ concept ที่ผู้ใช้เลือกเป็นแหล่งระบบสี/ขนาดมุม/จังหวะห่าง และใช้ Sarabun ผ่าน next/font/google ตามคำขอแทน Quicksand/Inter ทั้ง Owner/Clinic/Admin/LIFF และหน้าสาธารณะ สีครบอยู่ที่ frontend/shared/tokens.css

ทิศทางคือ off-white/white, ส้มสำหรับ action/สถานะเลือก, ตัวอักษรเข้ม, เส้นแบ่งบาง, ภาพสัตว์จริง และข้อความที่บอกงานของผู้ใช้ ใช้ surface ต่ำกับพื้นที่รอง รายการ/ตารางสำหรับข้อมูลการดูแลจริง ไม่มีอัตราสำเร็จ รีวิว หรือ KPI สมมติในหน้าโปรดักต์

## Research ผ่าน computer use

เปิดและดูเว็บไซต์ทั้งหมดในรายการผู้ใช้วันที่ 10 ตุลาคม 2026 ไม่คัดลอก artwork/logo/screenshots ของเว็บไซต์เหล่านี้ลงโปรดักต์

| Reference | สิ่งที่นำมาพิจารณา |
|---|---|
| [Things](https://culturedcode.com/things/) | พื้นที่ว่างและการเลือกเน้นงานหลักเพียงเรื่องเดียว |
| [Craft](https://www.craft.do/) | จังหวะ editorial และบุคลิกของ typography |
| [Flighty](https://www.flightyapp.com/) | การสื่อสารงานด้วยหน้าจอของผลิตภัณฑ์จริง |
| [Day One](https://dayoneapp.com/) | ความทรงจำในชีวิตประจำวันและข้อความสั้น |
| [Headspace](https://www.headspace.com/) | ความเป็นมิตรของ controls และสีที่มีหน้าที่ |
| [YNAB](https://www.ynab.com/) | สื่อสารจากปัญหาผู้ใช้ก่อนรายการฟีเจอร์ |
| [Duolingo](https://www.duolingo.com/) | ภาษาภาพที่ใช้ต่อเนื่องทั้ง marketing/app |
| [Letterboxd](https://letterboxd.com/) | ให้เนื้อหาและกิจกรรมเป็นแกนของหน้าจอ |
| [Superlist](https://www.superlist.com/) | ลำดับหัวเรื่องและหน้าจอซอฟต์แวร์ที่อ่านชัด |
| [Readwise Reader](https://readwise.io/read/) | การแสดงฟีเจอร์ที่มีรายละเอียดอย่างมีโครงสร้าง |
| [Zigzag](https://zigzag.dog/) | เอกลักษณ์ PetTech โดยไม่ต้องตกแต่งทุกช่อง |
| [Woofz](https://www.woofz.com/) | CTA ที่อ่านเจอเร็วและประโยชน์ที่ชัด |
| [Vetster](https://vetster.com/en) | สถานะนัดหมาย/ประวัติที่สร้างความมั่นใจ |
| [Pawp](https://www.pawp.com/) | ภาพจริงที่สื่อความสัมพันธ์กับสัตว์เลี้ยง |
| [Rover](https://www.rover.com/) | เริ่มจากงานที่ผู้ใช้ต้องการทำ |
| [Tractive](https://tractive.com/) | อธิบายเทคโนโลยีด้วยผลต่อการดูแลน้อง |
| [11pets](https://www.11pets.com/en/home) | จัดหมวดสุขภาพ กิจวัตร และข้อมูลสัตว์ |

## ความต่อเนื่องของหน้าจอ

- Owner: โปรไฟล์/สิ่งที่ดูแลวันนี้ → สุขภาพ/OCR/triage → สมุด drag/AI → ผู้ช่วย/ความจำ → คลินิก/นัดหมาย/PetID/ประกาศหาย → สิทธิ์/ความยินยอม
- Clinic: นับสถานะจากข้อมูลจริง → รายการนัดหมาย → สรุปสุขภาพที่มี grant สด → สมาชิกคลินิก
- Admin: ตัวเลขจริง → usage/AI metadata → queue retry/dead → รายชื่อและการตรวจคลินิก
- Public: emergency, privacy, terms, AI, invite, health share และประกาศหายใช้ typography/controls/states ชุดเดียวกัน

ลายตกแต่งสมุดเป็นไอคอนที่เลื่อน ปรับขนาด สี และหมุนได้ AI ใช้ catalog เดียวกัน ส่วนรูปและข้อความของผู้ใช้ไม่ถูกแทนด้วยภาพ stock หรือแก้เนื้อหาย้อนหลัง
