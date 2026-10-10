import { translate, type Locale } from '../../shared/locale-core';
// Re-localise system status text already visible when the language changes.
const statusCopy: readonly (readonly [string,string])[] = [
  [
    "ตัวอย่าง: การสร้างลิงก์สรุปสุขภาพพร้อมใช้งานหลังเข้าสู่ระบบจริง",
    "Sign in to create a real health-summary link."
  ],
  [
    "รับคำเชิญแล้ว คุณดูแลน้องตามสิทธิ์ที่เจ้าของเลือกได้",
    "Invitation accepted. You can now access this pet according to your assigned role."
  ],
  [
    "คัดลอกลิงก์แล้ว",
    "Link copied."
  ],
  [
    "คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกลิงก์และคัดลอก",
    "Could not copy automatically. Please select and copy the link."
  ],
  [
    "เพิกถอนลิงก์แล้ว",
    "Link revoked."
  ],
  [
    "การคุยกับ AI ต้องเข้าสู่ระบบจริง ในพื้นที่ตัวอย่างคุณทดลองชื่อ โทนการพูด และความจำในเบราว์เซอร์นี้ได้",
    "Sign in to chat with AI. In this demo you can try the assistant's name, tone and memory on this browser."
  ],
  [
    "บันทึกบุคลิกตัวอย่างในเบราว์เซอร์แล้ว",
    "Demo preferences saved in this browser."
  ],
  [
    "บันทึกบุคลิกและการตั้งค่าความจำแล้ว",
    "Personality and memory preferences saved."
  ],
  [
    "ปิดประกาศแล้ว ลิงก์สาธารณะจะไม่แสดงข้อมูลน้อง",
    "Notice closed. The public link no longer shows this pet."
  ],
  [
    "ส่งคำขอนัดแล้ว กรุณารอคลินิกตอบรับก่อนเดินทาง",
    "Request sent. Wait for the clinic to confirm before travelling."
  ],
  [
    "สร้างประกาศแล้ว คุณเปิดหน้าประกาศเพื่อแชร์ลิงก์ได้",
    "Notice created. Open the public page to share its link."
  ],
  [
    "ประกาศสาธารณะต้องเข้าสู่ระบบจริง เพื่อให้คนพบส่งเบาะแสกลับมาถึงคุณได้",
    "Sign in to post a public notice so finders can send tips to you."
  ],
  [
    "คำเชิญใช้งานจริงหลังเข้าสู่ระบบ LINE",
    "Sign in with LINE to create a real invitation."
  ],
  [
    "คัดลอกลิงก์เชิญแล้ว",
    "Invitation link copied."
  ],
  [
    "กรุณาเลือกลิงก์และคัดลอกด้วยตัวเอง",
    "Please select and copy the link manually."
  ],
  [
    "การให้สิทธิ์คลินิกต้องเชื่อมต่อข้อมูลจริง",
    "Sign in to grant clinic access."
  ],
  [
    "ให้สิทธิ์ดูสรุปสุขภาพแก่คลินิก 7 วันแล้ว",
    "The clinic can view this health summary for 7 days."
  ],
  [
    "เพิกถอนสิทธิ์คลินิกแล้ว",
    "Clinic access revoked."
  ],
  [
    "ไฟล์ปฏิทินพร้อมใช้งานหลังเชื่อมต่อข้อมูลจริง",
    "Sign in to export your calendar."
  ],
  [
    "สร้างไฟล์ปฏิทินไม่สำเร็จ",
    "Could not create the calendar file."
  ],
  [
    "ดาวน์โหลดไฟล์ปฏิทินแล้ว เปิดไฟล์เพื่อเพิ่มวันนัดในปฏิทินของคุณ",
    "Calendar downloaded. Open the file to add these dates to your calendar."
  ],
  [
    "บันทึกตัวอย่างในเบราว์เซอร์แล้ว",
    "Demo record saved in this browser."
  ],
  [
    "เพิ่มบันทึกสุขภาพแล้ว",
    "Health record added."
  ],
  [
    "AI อ่านสมุดพร้อมใช้งานหลังเข้าสู่ระบบจริง ในพื้นที่ตัวอย่างคุณเพิ่มบันทึกสุขภาพเองได้",
    "Sign in to scan your booklet with AI. In this demo you can add health records manually."
  ],
  [
    "เลือกรูปขนาดไม่เกิน 8 MB",
    "Choose an image no larger than 8 MB."
  ],
  [
    "แปลงรูปไม่สำเร็จ",
    "Could not prepare this image."
  ],
  [
    "มีสัญญาณฉุกเฉิน ควรไปโรงพยาบาลสัตว์ทันที",
    "Emergency signs are present. Go to an animal hospital immediately."
  ],
  [
    "ผลตัวอย่างจากกฎพื้นฐาน: ควรนัดตรวจสัตวแพทย์ ไม่ใช่การประเมินจาก AI",
    "Demo result from basic rules: book a vet check. This is not an AI assessment."
  ],
  [
    "AI ส่งแบบร่างไม่ครบ กรุณาลองใหม่",
    "The AI draft is incomplete. Please try again."
  ],
  [
    "บันทึกในเบราว์เซอร์นี้แล้ว",
    "Saved in this browser."
  ],
  [
    "บันทึกสมุดแล้ว",
    "Journal saved."
  ],
  [
    "หน้านี้ถูกแก้จากอุปกรณ์อื่นแล้ว กรุณาโหลดฉบับล่าสุดก่อนบันทึก เพื่อไม่ทับข้อมูลของกันและกัน",
    "This page changed on another device. Load the latest version before saving so you do not overwrite each other's work."
  ],
  [
    "การตกแต่งด้วย AI ต้องเข้าสู่ระบบจริง ในพื้นที่ตัวอย่างคุณลากวาง เพิ่มรูป และแต่งสมุดเองได้",
    "Sign in to decorate with AI. In this demo you can drag items, add photos and decorate the journal yourself."
  ],
  [
    "บันทึกหน้าสมุดปัจจุบันก่อน เพื่อให้ AI อ่านฉบับที่คุณต้องการตกแต่ง",
    "Save this page first so AI can read the version you want to decorate."
  ],
  [
    "เลือกรูปภาพขนาดไม่เกิน 8 MB",
    "Choose an image no larger than 8 MB."
  ],
  [
    "คืนการตกแต่งก่อนหน้าแล้ว อย่าลืมบันทึก",
    "Previous layout restored. Remember to save."
  ],
  [
    "ใช้แบบร่างแล้ว คุณปรับต่อได้ แล้วกดบันทึกเมื่อพร้อม",
    "Draft applied. Keep editing and save when you're ready."
  ],
  [
    "PetID ต้องเข้าสู่ระบบจริงและตั้งค่า AI ก่อน รูปในพื้นที่ตัวอย่างจะไม่เข้าสู่ฐานค้นหา",
    "Sign in to use PetID. Demo photos are not added to the search gallery."
  ],
  [
    "ถอน PetID แล้ว น้องจะไม่เข้าสู่ฐานค้นหารูป",
    "PetID withdrawn. Your pet is no longer in the image-search gallery."
  ],
  [
    "บันทึกว่าเจ้าของยืนยันผลนี้แล้ว การปิดประกาศหายทำแยกเมื่อรับน้องกลับบ้านจริง",
    "Owner confirmation saved. Close the missing notice separately once your pet is actually home."
  ],
  [
    "PetID จะบันทึกหลังเข้าสู่ระบบจริง",
    "Sign in to save PetID."
  ],
  [
    "ลงทะเบียน PetID แล้ว เริ่มค้นหาได้เมื่อมีประกาศน้องหาย",
    "PetID registered. Image search begins when a missing notice is active."
  ],
  [
    "เปลี่ยนตัวเลือกตัวอย่างแล้ว",
    "Demo choice updated."
  ],
  [
    "บันทึกตัวเลือกความยินยอมแล้ว",
    "Consent choices saved."
  ],
  [
    "พื้นที่ตัวอย่างไม่มีข้อมูลบัญชีจริงที่ต้องส่งออก",
    "There is no real account data to export in this demo."
  ],
  [
    "ดาวน์โหลดสำเนาข้อมูลแล้ว เก็บไฟล์นี้ในที่ปลอดภัย",
    "Data copy downloaded. Keep this file somewhere safe."
  ],
  [
    "พื้นที่ตัวอย่างไม่มีบัญชีจริง คุณล้างข้อมูลตัวอย่างได้จากการตั้งค่าเบราว์เซอร์",
    "The demo has no real account. Clear demo data in your browser settings."
  ]
];
export function localizeStatus(value: string, locale: Locale): string {
  const pair=statusCopy.find(pair=>pair.includes(value));
  if(pair)return translate(locale,pair[0],pair[1]);
  const added=/^เพิ่ม (.+) แล้ว เริ่มจากสแกนสมุดวัคซีนได้เลย$/.exec(value)||/^(.+) added\. You can start by scanning a vaccine booklet\.$/.exec(value);
  if(added)return translate(locale,`เพิ่ม ${added[1]} แล้ว เริ่มจากสแกนสมุดวัคซีนได้เลย`,`${added[1]} added. You can start by scanning a vaccine booklet.`);
  const saved=/^ยืนยันและบันทึก (\d+) รายการแล้ว$/.exec(value)||/^(\d+) records confirmed and saved\.$/.exec(value);
  if(saved)return translate(locale,`ยืนยันและบันทึก ${saved[1]} รายการแล้ว`,`${saved[1]} records confirmed and saved.`);
  return value;
}
