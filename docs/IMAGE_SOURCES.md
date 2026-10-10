# ภาพที่ใช้ใน ChordJai

ค้นผ่าน Google Images ด้วย computer use เมื่อ 10 ตุลาคม 2026 แล้วเปิดหน้าต้นฉบับเพื่อยืนยันผู้ถ่ายและข้อความ Free to use under the Unsplash License บันทึกไฟล์ภาพที่แสดงผ่าน browser download API ไม่ใช้ Google thumbnail และไม่ใช้ภาพจากเว็บ reference มาเป็น artwork ของระบบ

| ไฟล์ใน public/images | ภาพต้นฉบับ | ผู้ถ่าย | ใช้สำหรับ |
|---|---|---|---|
| pet-home-cat.webp | [Orange tabby cat on window](https://unsplash.com/photos/orange-tabby-cat-on-window-sMeTenO_Nso) | Krisztian Matyas | ภาพหน้าแรก/login และภาพตัวอย่างของแอป |
| pet-home-dog.webp | [Golden dog on cozy grey sofa](https://unsplash.com/photos/golden-dog-on-cozy-grey-sofa-NU56v6foDLs) | Caroline Badran | ภาพประกอบความทรงจำ/login ของคลินิก และภาพตัวอย่าง |
| chordjai-overview.webp | หน้าจอแอป ChordJai ที่สร้างใน repository นี้ | ChordJai | แสดง UI ของแอปที่ทำงานจริงในโหมดตัวอย่าง ไม่มีข้อมูลลูกค้าจริง |

ภาพสัตว์สองภาพอยู่ภายใต้ [Unsplash License](https://unsplash.com/license) ซึ่งอนุญาตดาวน์โหลดและใช้เชิงพาณิชย์ สร้างไฟล์ WebP สำหรับเว็บและเก็บใน public ของแต่ละ frontend จึงไม่เรียก image provider ภายนอกตอนผู้ใช้เปิดแอป ภาพประกอบไม่ใช่รูปของสัตว์เลี้ยงผู้ใช้จริง ไม่ใช้แทนหลักฐานทางการแพทย์หรือ PetID

ฟอนต์ Sarabun โหลดด้วย next/font/google และ self-host จาก deployment ตามการทำงานของ Next.js ไอคอน UI และลายตกแต่งสมุดใช้ Lucide แทน emoji ส่วนข้อความที่ผู้ใช้เขียนเองยังคงเดิม
