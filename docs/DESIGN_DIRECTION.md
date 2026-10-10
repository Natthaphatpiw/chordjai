# Kindness & Kinship — ChordJai frontend

ใช้ screenshot ของ concept ที่ผู้ใช้เลือกเป็นแหล่งระบบสี/ขนาดมุม/จังหวะห่าง และใช้ Mitr ผ่าน next/font/google ตามคำขอปรับล่าสุด แทน Sarabun/Quicksand/Inter ทั้ง Owner/Clinic/Admin/LIFF และหน้าสาธารณะ สีครบอยู่ที่ frontend/shared/tokens.css

ทิศทางล่าสุดคือขาวอมพีช `#fffaf5` / white และส้มสด `#ff8a24` สำหรับ action/สถานะเลือก, ตัวอักษรเข้ม, เส้นแบ่งบาง, ภาพสัตว์จริง และข้อความที่บอกงานของผู้ใช้ ใช้ surface ต่ำกับพื้นที่รอง รายการ/ตารางสำหรับข้อมูลการดูแลจริง ไม่มีอัตราสำเร็จ รีวิว หรือ KPI สมมติในหน้าโปรดักต์

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

## การปรับให้สดใสและรองรับสองภาษา (10 ตุลาคม 2026)

- ส้มสดใช้กับปุ่ม โลโก้ เมนูที่เลือก และ control สำคัญ พื้นอ่านประวัติสุขภาพยังเป็นสีขาว/พีชอ่อน การแบ่งบทบาทนี้สื่อบุคลิกน่ารักและขี้เล่นสำหรับเจ้าของสัตว์เลี้ยง พร้อมรักษาลำดับข้อมูล การเลือกสีนี้เป็นการตัดสินใจด้านแบรนด์ ไม่ใช่ข้ออ้างว่าสีทำให้พฤติกรรมสัตว์เปลี่ยน
- Mitr แบบไม่มีหัว น้ำหนัก 400/500/600 มีรูปทรงเป็นมิตร หัวข้อใช้ 500/600 ตามลำดับความสำคัญ ส่วนข้อความอ่านใช้ 400 ฟอนต์ไทยและละติน self-host ผ่าน next/font/google
- ตัวอักษรเข้ม `#3a210d` บนส้ม `#ff8a24` มี contrast 6.35:1 ตัวอักษรขาวบนส้มเดียวกันมีเพียง 2.36:1 จึงเลือกใช้ตัวอักษรเข้ม ลิงก์ส้มเข้ม `#b84200` บนพื้น `#fffaf5` มี 5.30:1 ข้อความรอง `#695044` มี 7.15:1 ตามสูตร [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) ไม่อ้างว่าเป็น full accessibility audit
- TH/EN บนทุก header เลือกภาษาโดยไม่ล้างฟอร์ม/สมุดที่กำลังแก้ไข เก็บ cookie `chordjai.locale` 1 ปี บนโดเมน chordjai.life ใช้ preference ร่วมกันระหว่าง www/clinic/admin และ local/demo ใช้เฉพาะ host
- ลิงก์ `?lang=en` เปิดหน้าอังกฤษโดยตรง ส่วน `?lang=th` เปิดไทย SSR, html lang, title/description, ARIA, placeholders, วันที่, ข้อความระบบและข้อมูลตัวอย่างใช้ภาษาเดียวกันทั้งหน้า เนื้อหาที่เจ้าของหรือคลินิกเขียนเองคงต้นฉบับ
- API ส่ง Accept-Language ที่เลือก Chat, OCR warnings, journal text ใหม่, triage และ PetID explanations ใช้ภาษานั้น Visual signature ที่ใช้สร้าง vector คงภาษาอังกฤษเดียวเพื่อไม่เปลี่ยนพื้นที่ค้นหา ความเร่งด่วนทางการแพทย์/ข้อจำกัดความปลอดภัยเหมือนกันทั้งสองภาษา
- หน้าฉุกเฉินแยก offline HTML cache ต่อภาษา ไม่ cache private API/LIFF/health/journal/share/lost data หรือคำขอ RSC
- เปลี่ยนภาพหน้าจอจริงบน marketing เป็นไฟล์ไทย/อังกฤษแยกกัน ไม่มีข้อความไทยฝังในภาพของหน้าอังกฤษ ใช้ภาพสัตว์เดิมที่บันทึกและตรวจแหล่งที่มาแล้ว
