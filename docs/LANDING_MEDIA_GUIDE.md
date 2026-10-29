# ChordJai — คู่มือสร้างภาพและวิดีโอสำหรับ Landing Page

ฉบับ 29 ตุลาคม 2026 · สำหรับเจ้าของผลิตภัณฑ์ ผู้สร้างภาพ/วิดีโอ และผู้พัฒนา frontend

หน้านี้อธิบายว่าสื่อต้องเล่าอะไร สร้างอย่างไร และส่งไฟล์ไหนกลับมาใส่เว็บไซต์ ภาพและวิดีโอใหม่ยังไม่ได้ถูกสร้างหรือใส่ในระบบ ช่องสื่อถูกเตรียมไว้โดยตั้งค่า asset เป็น `null` จึงไม่เรียกไฟล์ที่ยังไม่มี เมื่อได้สื่อแล้วเปลี่ยนค่าใน registry และ deploy frontend อีกครั้ง ไม่ต้องเปลี่ยน SQL หรือ `.env`

## ทิศทางเดียวกันทั้งชุด

ชิดใจเป็นพื้นที่ที่เจ้าของเล่าเรื่องของน้อง เก็บการดูแลที่ต่อเนื่อง เตรียมพบสัตวแพทย์ และเก็บความทรงจำ สื่อต้องทำให้รู้สึกว่า “เรื่องเล็ก ๆ ของน้องมีคนใส่ใจ” ก่อนอธิบายเทคโนโลยี

- บุคลิก: สดใส ขี้เล่น อบอุ่น และดูแลกันจริง ภาพถ่ายสมจริง มีชีวิตประจำวัน ไม่ใช่ภาพโฆษณาที่ทุกอย่างจัดวางสมบูรณ์เกินไป
- สีหลัก: ส้มสด `#ff6b24`, ขาว และพีช `#fff1e6` ใช้ส้มกับของชิ้นเล็ก เช่น ปลอกคอ ผ้าห่ม หรือปกสมุด ไม่ย้อมขนสัตว์เป็นสีแบรนด์
- แสง: แสงธรรมชาติช่วงเช้า สีผิวและขนเป็นธรรมชาติ เงานุ่ม รายละเอียดตา จมูก และหนวดชัด ไม่มีฟิลเตอร์หม่นหรือส้มทั้งภาพ
- ฉาก: บ้านร่วมสมัยในไทยที่อบอุ่น มีพื้นที่ว่าง ไม่รก ไม่ใช้ฉากโรงพยาบาลเพื่อสื่อว่าสัตว์ป่วยทุกครั้ง
- ตัวอักษร: เว็บวางข้อความด้วย Mitr เอง **ห้ามให้โมเดลสร้างข้อความไทย/อังกฤษ โลโก้ ปุ่ม หน้าจอแอป หรือเครื่องหมายสแกนลงในสื่อ**
- การเคลื่อนไหว: น้องกระพริบตา หายใจ มองเจ้าของ หรือขยับหูเบา ๆ กล้องนิ่งหรือเคลื่อนเล็กน้อย ไม่มีการหมุนกล้อง ซูมเร็ว หรือเอฟเฟกต์วิบวับ

ศึกษาจังหวะภาพใหญ่ พื้นที่ว่าง และการเปลี่ยนส่วนเนื้อหาจาก [Petnow](https://www.petnow.io/en) เมื่อ 29 ตุลาคม 2026 ใช้เป็นแนวทางการเล่าเรื่อง ไม่ใช้ภาพ โลโก้ ข้อความ ตัวเลขความแม่นยำ หรือผลงานธุรกิจของ Petnow เป็นของชิดใจ

### ตัวละครอ้างอิงที่ใช้ซ้ำ

ใช้สัตว์สมมติสองตัวนี้ให้เหมือนเดิมทั้งชุด แนบภาพอ้างอิงที่เลือกแล้วทุกครั้งที่เครื่องมือรองรับ character/reference image:

> **Cat:** a healthy adult orange-and-white domestic shorthair cat, round amber eyes, white muzzle and chest, a small orange patch beside the left side of the nose, natural proportions, friendly curious expression.
>
> **Dog:** a healthy medium-sized cream mixed-breed dog, soft floppy ears, dark brown eyes, a small white patch on the chest, a plain warm-orange collar without writing or a tag, relaxed playful expression.
>
> **Owner:** a Thai adult pet owner in simple cream casual clothing, natural appearance, gentle body language; show hands or a partial profile where a full face is unnecessary.

เลือกภาพต้นแบบของน้องแต่ละตัวก่อนสร้างวิดีโอ ไม่ใช้ชื่อ รูปบ้าน ใบเสร็จ หรือข้อมูลสุขภาพของผู้ใช้จริงโดยไม่ได้รับอนุญาต รูปการตลาดชุดนี้ไม่ใช่หลักฐานยืนยัน PetID และไม่ใช่ข้อมูลฝึกโมเดลโดยอัตโนมัติ

## รายการไฟล์ที่ต้องส่ง

เส้นทางในตารางเป็น URL ของเว็บ ไฟล์จริงอยู่ใต้ `frontend/owner-app/public/landing/` ตัวอย่าง `/landing/hero.webp` คือ `frontend/owner-app/public/landing/hero.webp`

| ลำดับ | Slot / ชื่อไฟล์ | ภาพนิ่งที่ส่ง | วิดีโอถ้ามี | เป้าหมาย |
| --- | --- | --- | --- | --- |
| 1 | `hero` | `hero.webp`, 1600×1728, แนวตั้งประมาณ 0.926:1 | `hero.mp4`, 1600×1728, 8 วินาที | ความสัมพันธ์กับน้องตั้งแต่หน้าจอแรก |
| 1 | `hero` รุ่นมือถือ | `hero-mobile.webp`, 1080×1161, แนวตั้งประมาณ 0.930:1 | `hero-mobile.mp4`, 1080×1160, 8 วินาที | จัดองค์ประกอบให้ตรงช่องแนวตั้งบนมือถือ |
| 2 | `story-diary` | `story-diary.webp`, 1600×1200, 4:3 | `story-diary.mp4`, 6 วินาที | เรื่องที่อยากเล่าและบันทึกทุกวัน |
| 3 | `story-passport` | `story-passport.webp`, 1600×1200, 4:3 | `story-passport.mp4`, 6 วินาที | เตรียมเรื่องให้พร้อมก่อนพบหมอ |
| 4 | `story-followup` | `story-followup.webp`, 1600×1200, 4:3 | `story-followup.mp4`, 6 วินาที | การดูแลที่ต่อเนื่องและพอดี |
| 5 | `petid` | `petid.webp`, 1600×1600, 1:1 | `petid.mp4`, 6–8 วินาที | สัตว์ตัวเดิมจากหลายมุม |
| 6 | `memories` | `memories.webp`, 1600×2000, 4:5 | `memories.mp4`, 6 วินาที | ความทรงจำของเจ้าของกับน้อง |
| 7 | `closing` | `closing.webp`, 1920×960, 2:1 | `closing.mp4`, 1920×960, 8 วินาที | ความรู้สึกอยากเริ่มดูแลด้วยกัน; เผื่อครอปเป็น 16:5 บน desktop |

สร้างภาพนิ่งให้ผ่านก่อน แล้วใช้ภาพนั้นเป็น first-frame/reference ของวิดีโอ ไม่จำเป็นต้องมีวิดีโอครบทุกช่อง เริ่มจาก Hero หนึ่งชิ้น ส่วนอื่นใช้ภาพนิ่งก็ได้ ภาพขนาดต่างจากนี้ใช้ได้เมื่อมีอัตราส่วนเดียวกันและคุณภาพเพียงพอ

**อัตราส่วนช่องที่แสดงจริง:** Hero desktop เป็น `1 / 1.08` และมือถือ `4 / 4.3` จึงเป็นภาพแนวตั้งเกือบจัตุรัส ไม่ใช่ Hero แนวนอน 4:3 หากเครื่องมือสร้างได้เฉพาะอัตราส่วนมาตรฐาน ให้สร้างแนวตั้ง 4:5 โดยเว้นขอบบน/ล่างอย่างน้อย 12% แล้วครอปเป็นขนาดส่งออกข้างต้น สำหรับวิดีโอ H.264 ใช้จำนวนพิกเซลคู่ทั้งสองด้าน รุ่นมือถือจึงใช้สูง 1160 แทน 1161 พิกเซล ความต่างหนึ่งพิกเซลนี้ไม่กระทบองค์ประกอบ

Closing ใช้ไฟล์เดียวกันทั้งสองขนาดจอ ช่อง desktop เป็น `16 / 5` ส่วนมือถือเป็น `16 / 8` จึงแสดงไฟล์ 2:1 เต็มความสูงบนมือถือ และตัดส่วนบน/ล่างรวมประมาณ 37.5% บน desktop ต้องให้ตา จมูก และใบหน้าทุกตัวอยู่ในแถบกลางแนวตั้ง 50% ของไฟล์ พร้อมเผื่อขอบซ้าย/ขวา ไม่วางหน้าหรือสิ่งสำคัญใกล้ขอบโค้งด้านบน

## Prompt หลักที่แนบทุกงาน

นำข้อความนี้วางก่อน prompt รายชิ้น พร้อมแนบภาพตัวละครต้นแบบ:

```text
Create original premium editorial pet photography for ChordJai, a warm, playful pet-care journal brand. Bright natural morning light, clean white and pale peach surroundings, small vivid warm-orange accents (#ff6b24). Authentic everyday life in a contemporary Thai home. Realistic fur, anatomy, eyes, whiskers, human hands and skin. Intimate and caring rather than staged or sentimental. Airy composition, gentle soft shadows, refined natural color, crisp subjects, no heavy orange color grading. Keep the exact same cat, dog and owner as the supplied character references. Leave breathing room around the subjects for responsive cropping. No text, lettering, logos, watermarks, app interfaces, scanner overlays, charts or badges anywhere in the image.
```

**Negative prompt ใช้กับทุกงาน:**

```text
Text, typography, brand marks, watermarks, fake app screens, fake medical records, readable receipts, dosage instructions, biometric success badges, accuracy percentages, laser scanning, sci-fi holograms, glowing outlines, distressed or restrained animals, medical procedures, syringes, exaggerated smiles, cartoon anatomy, human-like animal faces, duplicate animals, extra limbs, deformed paws, extra fingers, changing fur markings, waxy fur, oversaturation, sepia, gloomy lighting, busy backgrounds, stock-photo handshake, plastic 3D render.
```

## 1. Hero — ทุกเรื่องของน้องเริ่มจากการอยู่ด้วยกัน

**องค์ประกอบ:** น้องหมาและแมวอยู่ด้วยกันในเฟรมแนวตั้งเกือบจัตุรัส แมวเด่นด้านหน้าเล็กน้อย หมาอยู่ข้างกัน ไม่ให้หน้าซ้อนกัน ฉากพีชอ่อน/ขาว สัดส่วนสัตว์รวมประมาณ 60–70% ของภาพ เก็บตาและจมูกไว้ในบริเวณกลางภาพ 60% เว้นขอบอย่างน้อย 12% รอบหูและเท้า โดยเฉพาะมุมขวาล่างที่กรอบโค้งมาก เว็บวางข้อความนอกภาพ จึงไม่ต้องทำพื้นที่ตัวอักษรขนาดใหญ่

**Image prompt:**

```text
An original editorial portrait of the reference orange-and-white cat and cream mixed-breed dog sitting comfortably side by side on a pale peach linen rug in a bright contemporary Thai living room. The cat is slightly in front, looking curiously toward the owner just beside the camera; the dog looks relaxed and alert, mouth gently open. Both faces and eyes are clearly visible, with separate silhouettes and realistic body proportions. A small orange fabric toy rests near the dog. White wall, soft morning window light, very restrained background. Warmth, curiosity and companionship, never a posed human smile. Compose for a near-square portrait frame, 1600 pixels wide by 1728 pixels high, subjects within the central 65%, full ears visible, generous clear margins including the lower-right corner. If only standard aspect ratios are supported, compose in portrait 4:5 with at least 12 percent extra clear space above and below for a safe crop to the requested frame. No text or UI.
```

**Video prompt:**

```text
Use the approved hero still as the visual and identity reference. Create a seamless 8-second silent loop, 24 fps, with a locked-off camera. Preserve the exact two animals, fur markings, room, framing and light throughout. The cat breathes subtly, blinks once, and makes a tiny curious ear movement. The dog gently glances toward the cat and returns its gaze near the camera; very slight natural tail motion if visible. The animals remain calm and comfortable. No walking, jumping, licking, new objects, scene cuts, camera zooms or changes in anatomy. End with the same pose and composition as the beginning for a soft invisible loop. No overlays, scanning graphics or text.
```

**จังหวะ 8 วินาที:** 0–2s สบตากล้อง/หายใจ → 2–4s แมวกระพริบตา → 4–6s หมามองแมวเบา ๆ → 6–8s กลับท่าเริ่ม ภาพนิ่งที่ส่งเป็น poster ต้องดูดีได้เองแม้วิดีโอไม่เล่น

**รุ่นมือถือ:** ใช้ prompt เดิม เปลี่ยนท้ายเป็น `Recompose for a near-square portrait frame, 1080 pixels wide by 1161 pixels high for the still and 1080 by 1160 for video. Keep both complete faces side by side within the central 65%; bring the animals slightly closer without overlapping their eyes or noses. Leave at least 12 percent clear margins and keep the lower-right corner free of essential details. If only standard ratios are supported, use portrait 4:5 with extra space above and below for a safe final crop. Do not simply crop a landscape frame.`

## 2. Story: Diary — เรื่องวันนี้ ไม่ต้องจำไว้คนเดียว

**องค์ประกอบ:** ภาพกิจกรรมจริงของเจ้าของกับน้อง มีโทรศัพท์หันจอออกจากกล้องหรือจอดำ ให้ดูว่าบันทึกได้ง่าย แต่ไม่สร้างหน้าจอ LINE ปลอม

**Image prompt:**

```text
The reference Thai pet owner sits casually on the floor beside the reference orange-and-white cat after an ordinary day at home. One hand holds a smartphone with its screen turned away from the camera, the other hand rests nearby without restraining the cat. The cat looks up at the owner with a curious relaxed expression. A simple closed cream notebook and a small orange blanket sit nearby. Show the quiet moment of noticing and remembering how a pet is doing. Bright natural light, candid editorial framing, faces and cat whiskers sharp. Compose 4:3 with the cat and owner's hands central, uncluttered margins. No visible phone interface, no readable pages, no medicine or treatment.
```

**Optional video prompt:** `Create a 6-second silent loop from the approved still. The cat looks briefly at the owner's hand then back up; the owner makes one tiny natural thumb movement on the unseen phone screen. Static camera, consistent hands and markings, no scene cut, return to the starting pose. No interface or text.`

ไดอารี่รองรับรูปอาการ ยา และใบเสร็จในแอป แต่ภาพการตลาดไม่ควรสร้างรายการยา/ค่าใช้จ่ายปลอมหรือชวนให้เข้าใจว่า LINE Agent รับรูปได้แล้ว การสาธิตแนบรูปให้บันทึกหน้าจอ LIFF จริงด้วยข้อมูลตัวอย่าง

## 3. Story: Passport — ก่อนพบหมอ เรามาเรียบเรียงกัน

**องค์ประกอบ:** เจ้าของเตรียมตัวอย่างสงบที่บ้าน สมุดและกระเป๋าพาน้องไปคลินิก ไม่ใช่ภาพ AI ที่ทำให้เข้าใจว่าระบบวินิจฉัยโรคแทนหมอ

**Image prompt:**

```text
The reference Thai owner prepares calmly for a veterinary visit at a bright white table at home. The reference cream dog sits comfortably beside the chair, looking toward the owner. A plain orange pet travel bag, a closed notebook, and a phone lying face down are on the table. The owner checks the bag with a gentle attentive expression. Warm daylight, airy composition, supportive and reassuring mood, natural hands and animal anatomy. Frame 4:3, dog and owner interaction central, no clinic logos, no readable medical documents, no medical procedure, no diagnosis or generated interface.
```

**Optional video prompt:** `A calm 6-second silent loop. The dog slightly lifts its gaze toward the owner and blinks; the owner's hand gently settles beside the closed notebook. Locked camera, preserve the same subjects and objects, return to the initial composition. No new papers, writing, UI or treatment.`

หากต้องการโชว์ความสามารถ Q&A ให้ใช้ **screen recording ของ Passport จริง**: ตอบคำถาม → ตรวจ/แก้คำตอบ → เจ้าของยืนยัน → หน้าสรุปที่แชร์ได้ ใช้ข้อมูลทดสอบและปิดชื่อ/ลิงก์ของผู้ใช้จริง

## 4. Story: Follow-up — ค่อย ๆ ดูแลเรื่องเดิมต่อ

**องค์ประกอบ:** น้องใช้ชีวิตสบายที่บ้านและเจ้าของอยู่ใกล้ ๆ ไม่ใช้ภาพแจ้งเตือนถาโถมหรือทำให้รู้สึกว่าระบบเฝ้าจับตา

**Image prompt:**

```text
A quiet sunny morning in the same Thai home. The reference orange-and-white cat stretches gently on a cream sofa beside its owner, who has just put a phone face down on a small side table. A warm-orange cushion gives a small cheerful accent. Capture an ordinary reassuring moment of checking in and continuing to care, not an emergency or a before-and-after medical claim. Natural unposed body language, bright soft light, realistic fur and hands. Compose 4:3 with the cat's face and owner interaction within the middle 60%. No notification graphics, text, medical supplies or app screen.
```

**Optional video prompt:** `Create a subtle 6-second silent loop. The cat breathes and softly blinks while the owner's hand rests nearby; no full stretching motion if it cannot return naturally to the first pose. Keep the camera locked, lighting constant, and exact same markings. No popup graphics, vibration effects or text.`

ข้อความบนเว็บต้องสื่อว่าเจ้าของ **เลือกเปิด** การติดตามและพักได้ ระบบเว้นอย่างน้อย 5 หรือ 7 วันตามที่เลือก และอาจข้ามเมื่อไม่มีเรื่องเหมาะสม ห้ามใช้ภาพหรือคำว่า “ทักทุกวันอัตโนมัติ” หรือ “รู้ทันทุกอาการ”

## 5. PetID — รู้จักน้องจากหลายมุม

**องค์ประกอบ:** ภาพ portrait ตัวเดียวชัด ๆ ไม่ทำเครื่องหมายยืนยันตัวสำเร็จ การแสดงหลายมุมอาจใช้ลำดับวิดีโอหรือหลายภาพของตัวเดิม โดยยังต้องเหมือนกันจริง

**Image prompt:**

```text
An original square editorial portrait of the reference orange-and-white cat in the same bright home, calm and curious, photographed at eye level from a gentle three-quarter angle. Both eyes, nose, whiskers, ear shapes, white muzzle, and the exact small orange patch beside the left side of the nose are clearly visible. Clean pale peach background, soft even daylight, sharp natural fur detail, no dramatic shadows or wide-angle distortion. The cat is relaxed and unrestrained. Leave 15 percent breathing room around the ears and face. No scanner frames, biometric claims, ID cards, checkmarks, UI, labels or text.
```

**Optional video prompt:**

```text
Use the approved PetID portrait and character references. Make a quiet 8-second silent portrait, camera fixed at eye level. The same cat makes only a small natural head turn from almost frontal to a gentle three-quarter angle and returns. Keep the nose patch, eye color, fur pattern, head shape and lighting identical in every frame. Do not morph between different cats or rotate the whole animal unnaturally. No scanning light, face mesh, identification success message, UI or text. Realistic calm animal behavior only.
```

หากสร้างภาพมุมเพิ่ม ให้สร้างแยก `front`, `left-three-quarter`, `right-three-quarter` โดยแนบ reference เดียวกันทุกครั้ง แล้วตรวจลายขนด้วยคน ห้ามนำภาพที่โมเดลแต่งขึ้นไปใช้เป็นข้อมูลวัดความแม่นยำหรือสมัคร PetID จริง หน้าเว็บสื่อสารเพียงการช่วยค้นตัวที่อาจคล้ายกันและให้เจ้าของตรวจสอบ ยังไม่อ้างการรับรอง ความแม่นยำเชิงตัวเลข หรือใช้งานประกัน/ที่พักจริง

## 6. Memories — วันธรรมดาที่เราอยากเก็บไว้

**องค์ประกอบ:** ภาพแนวตั้งเหมาะกับหน้าสมุด/story ไม่สร้างหน้าสมุดพร้อมข้อความมาทั้งชิ้น ให้ UI จริงเป็นผู้จัดรูปและข้อความ

**Image prompt:**

```text
An intimate candid vertical photograph of the reference orange-and-white cat resting beside the Thai owner's legs on a cream sofa in the same sunlit home. The owner wears simple cream casual clothing and gently offers a relaxed hand for the cat to sniff; no forced embrace. An orange throw is loosely folded at the edge of the sofa. Show the affectionate, slightly playful ordinary moment that someone would want to keep in a personal memory book. Soft morning light, real fur, natural hands, warm but fresh colors. Compose 4:5 with the cat and hand in the central 65%, clear space near the edges for responsive cropping. No collage, paper frames, stickers, dates, location labels, text or logos.
```

**Optional video prompt:** `A natural 6-second silent loop from the approved image. The cat gently sniffs the owner's still hand, blinks and settles back into its starting pose. Minimal movement, static camera, no changing fingers, fur markings or furniture. No animation stickers or lettering.`

วัน/สถานที่/สติกเกอร์และการแต่งหน้าสมุดเป็น UI ที่ผู้ใช้ควบคุม ต้องโชว์จากแอปจริงเมื่อทำสื่อสาธิต ไม่ฝังข้อความลงภาพจนเปลี่ยนภาษาไม่ได้

## 7. Closing — เริ่มเก็บเรื่องของเรา

**องค์ประกอบ:** ภาพกว้างสงบสดใส น้องทั้งสองตัวอยู่ร่วมกับเจ้าของ ให้จบด้วยความสัมพันธ์ ไม่จบด้วยกราฟ/ความแม่นยำ สร้างต้นฉบับ 1920×960 (2:1) แล้วทดสอบกรอบครอปกลาง 1920×600 (16:5) สำหรับ desktop ด้วย ใบหน้าคน/หมา/แมวต้องอยู่ระดับใกล้กันในแถบกลางแนวตั้ง 50% ของภาพต้นฉบับ ห้ามวางคนสูงด้านบนและน้องชิดขอบล่าง เพราะเมื่อครอปจะไม่เห็นทุกหน้า

**Image prompt:**

```text
A wide candid editorial photograph in the same bright Thai living room. The reference Thai owner sits comfortably low on a pale rug, leaning gently near the reference cream dog and the reference orange-and-white cat resting within reach, without forcing physical contact. A quiet shared moment after play, gentle natural expressions, no forced hugs, animals calm and comfortable. Cream textiles, white walls, one small orange toy, soft daylight. Camera at the animals' eye level, premium natural photography, realistic anatomy and fur. Compose a panoramic 2:1 frame, 1920 pixels wide by 960 pixels high. Place all three faces at approximately the same vertical level within the central 50 percent of the frame height and central 60 percent of the frame width. The image must also work when centrally cropped to a very wide 16:5 desktop strip; keep every eye, nose and complete face inside that safe strip, with additional margins for rounded upper corners. Leave nonessential room details above and below the family. No text, logos, UI or artificial celebratory effects.
```

**Optional video prompt:** `Create an 8-second seamless silent loop in the approved 1920 by 960 panoramic composition. Small breathing and blinking movements, the dog briefly glances toward the owner, the cat makes a tiny ear movement. Keep all three complete faces within the central 50 percent of the image height throughout, so a centered 16:5 crop remains safe. Keep the owner mostly still. Preserve all identities, positions, hands and markings. No walking across the frame, camera move or scene transition. Return to the initial relaxed pose.`

## สื่อหน้าจอผลิตภัณฑ์จริง

มีภาพ overview ของแอปที่ใช้ข้อมูลตัวอย่างแล้ว:

- ไทย: `/images/chordjai-overview-th.webp`
- อังกฤษ: `/images/chordjai-overview-en.webp`

ใช้ภาพเหล่านี้กับข้อความที่ตรงภาษา หากอัดใหม่ให้ใช้บัญชี/ข้อมูลตัวอย่าง ตรวจว่า UI เป็นเวอร์ชันล่าสุด ซ่อน notification ส่วนตัว URL token รหัสผู้ใช้ และข้อมูลสัตว์จริง หน้าจออังกฤษต้องไม่มีข้อความระบบภาษาไทยปะปน ห้ามใช้ AI สร้างหน้าจอที่กดไม่ได้หรืออ้างความสามารถที่ยังไม่มี

ลำดับ demo ที่แนะนำ: บันทึกคำสั่งข้อความใน LINE → ถามข้อมูลเพิ่ม → ผู้ใช้ตอบ/ตรวจงาน → บันทึกสำเร็จ → เปิด LIFF ที่รายการจริง ภาพถ่ายอาการ/ยา/ใบเสร็จให้สาธิตใน LIFF ตามความสามารถปัจจุบัน ไม่แสดงว่าแนบภาพใน LINE แล้ว Agent อ่านได้ถ้าฟีเจอร์นั้นยังไม่รองรับ

## ส่งออกและตรวจคุณภาพ

| รายการ | เป้าหมายส่งออก |
| --- | --- |
| ภาพ | WebP, sRGB, ไม่ฝัง EXIF พิกัด, คมที่ขนาดใช้งาน; โดยทั่วไป 150–450 KB/ชิ้น, Hero ไม่เกินประมาณ 650 KB |
| วิดีโอ | MP4/H.264, `yuv420p`, 24 fps, ไม่มี audio track, เปิด fast-start, ไม่มี watermark |
| ขนาดไฟล์วิดีโอ | Hero desktop เป้าหมาย ≤3 MB, mobile ≤1.5 MB; ชิ้นอื่น ≤2 MB หากคุณภาพยังดี |
| Poster | ต้องส่งภาพนิ่งทุกครั้ง ใช้ภาพที่คมและตั้งใจจัดองค์ประกอบ ไม่ใช้เฟรมเบลอ |
| Motion | วนต่อเนื่องได้จริง ไม่สะดุด ไม่เปลี่ยนตัวสัตว์ ไม่ทำให้คนอ่านเสียสมาธิ |
| Crop | ดูทั้งอัตราส่วน desktop/mobile ตา จมูก หูไม่หลุดเฟรม และสองหน้าไม่ทับกัน |
| ความสมจริง | ตรวจนิ้ว มือ ขา อุ้งเท้า หนวด ฟัน ลายขน และการเปลี่ยนรูปร่างทุกช่วงของวิดีโอ |
| ข้อความ | ไม่มีข้อความ/โลโก้/สัญลักษณ์ระบบที่โมเดลสร้างมาเอง |

งบไฟล์เป็นเป้าหมายเพื่อให้เว็บโหลดดี ไม่ใช่เหตุผลให้ขนสัตว์แตกหรือหน้าพร่ามัว หากส่งต้นฉบับใหญ่ ให้ส่งไฟล์ export สำหรับเว็บแยกไว้ด้วย วิดีโอไม่ควรฝังเป็น base64 ใน source

ผู้เลือก **ลดการเคลื่อนไหว** หรือปิด motion บนหน้าเว็บต้องเห็น poster/ภาพนิ่งได้ครบ วิดีโอควรเล่นเงียบ ใช้ `playsInline` และหยุดเมื่อออกนอกจอหรือแท็บไม่ active ถ้าเครือข่ายไม่เหมาะสมหรือเล่นไม่ได้ ให้คงภาพนิ่ง ไม่บังคับดาวน์โหลดวิดีโอล่วงหน้าทั้งหน้า

## วิธีใส่ไฟล์ใน frontend

1. ส่งไฟล์ตามชื่อในตาราง โดยคงเลข version ต้นฉบับไว้ในชุดงานภายนอกได้ แต่ชื่อไฟล์ที่ deploy ต้องตรง registry
2. วางไฟล์ใต้ `frontend/owner-app/public/landing/` ไม่วางไฟล์ raw/วิดีโอหลายร้อย MB ใน Git
3. เปิด `frontend/owner-app/components/landing-media.ts` แล้วเติม URL ใน `image` และ `video` ของ slot ที่ตรงกัน ส่วนที่ยังไม่มีคง `null` ไว้ สำหรับ Hero เติม `mobileImage` และ `mobileVideo` แยกเมื่อมีไฟล์ ภาพใน `image` คือภาพนิ่งและ poster ของวิดีโอ **ไม่มี field ชื่อ `poster` ใน registry**
4. ห้ามเปิด URL ของไฟล์ที่ยังไม่อยู่ใน `public` เพราะจะเกิด 404 ตรวจชื่อ ตัวพิมพ์ใหญ่/เล็ก และนามสกุลให้ตรงกัน
5. รัน typecheck/build ของ owner-app และเปิดดูไทย/อังกฤษ desktop/mobile ทดลองปิด motion และดูเมื่อวิดีโอเล่นไม่ได้ด้วย
6. Commit/push frontend เพื่อให้ Vercel deploy ตามเดิม ไม่มีการรัน `bootstrap.sql`/`upgrade.sql` และไม่มี secret ใหม่

ตัวอย่างการเปิดใช้ Hero และภาพ Diary หลังวางไฟล์ครบแล้ว โดยคง slot อื่นไว้ตามเดิม:

```ts
hero: {
  image: '/landing/hero.webp',
  video: '/landing/hero.mp4',
  mobileImage: '/landing/hero-mobile.webp',
  mobileVideo: '/landing/hero-mobile.mp4',
},
'story-diary': {
  image: '/landing/story-diary.webp',
  video: null,
},
```

หากมีเพียงภาพ Hero ให้ใส่ `image`/`mobileImage` และคง `video`/`mobileVideo` เป็น `null` ไม่ต้องสร้างไฟล์วิดีโอเปล่า Closing และ story ปัจจุบันไม่ได้กำหนด asset มือถือแยก จึงต้องจัด safe crop ตามอัตราส่วนช่องข้างต้น ห้ามเพิ่ม `mobileImage` ให้ slot เหล่านั้นโดยคาดว่าระบบจะใช้โดยอัตโนมัติจนกว่าจะปรับและตรวจ source ที่เกี่ยวข้องด้วย

ชื่อ field ใน registry เป็นข้อกำหนดที่ใช้จริง หากเปลี่ยนโครงสร้าง registry ภายหลัง ให้ปรับขั้นตอนนี้ให้ตรงกับ source ก่อนส่งงาน การเพิ่มไฟล์อย่างเดียวไม่เปิดใช้งานสื่อจนกว่าจะอ้าง URL ใน registry

### โลโก้ของผู้ใช้

- ต้นฉบับ full logo: `/Users/natthaphat/Downloads/Chordjai Pet Face Logo.png` → `/brand/chordjai-logo.png`
- ต้นฉบับ emblem: `/Users/natthaphat/Downloads/Symmetrical Dog-Cat Muzzle Emblem.png` → `/brand/chordjai-emblem.png`

รักษางานต้นฉบับไว้ ไม่สั่ง AI วาดโลโก้ซ้ำในภาพหรือวิดีโอ ไม่ให้โลโก้เด้ง/หมุนตลอดเวลา โลโก้ต้นฉบับมีพื้นขาว จึงควรจัดวางบนพื้นขาวหรือใช้การจัดกรอบที่ตั้งใจ หากต้องการพื้นโปร่งใสให้สร้างไฟล์ที่ตรวจทานแล้วแยกต่างหาก ไม่ใช้ CSS เปลี่ยนสีจนจมูกหรือข้อความเพี้ยน

## สิทธิ์และเกณฑ์รับงาน

ใช้สื่อที่มีสิทธิ์เชิงพาณิชย์ตามเงื่อนไขของเครื่องมือที่สร้าง เก็บต้นฉบับ prompt เครื่องมือ/รุ่น วันที่สร้าง และหลักฐานสิทธิ์ไว้กับชุดงาน หากใช้ภาพบุคคลหรือสัตว์จริงเป็น reference ให้ได้รับอนุญาตสำหรับการตลาด และลบตำแหน่ง/ข้อมูลส่วนตัวก่อนส่งขึ้นเว็บ

งานผ่านเมื่อภาพดูเป็นสัตว์ตัวเดิม สีสดใสแต่ยังเป็นธรรมชาติ ไม่เกิดความทุกข์กับสัตว์จากสิ่งที่นำเสนอ วิดีโอวนเนียน พื้นที่ crop ปลอดภัย โลโก้ตรงต้นฉบับ และไม่มีคำอ้างความแม่นยำ การรักษา หรือพันธมิตรที่ระบบยังพิสูจน์ไม่ได้

**ลำดับส่งที่คุ้มที่สุด:** Hero still desktop/mobile → Hero loop → Diary/Passport/Follow-up still → PetID still → Memories → Closing → demo จากแอปจริงและ loop เพิ่มเฉพาะจุดที่ช่วยเล่าเรื่อง หน้าเว็บควรดูดีได้ด้วยภาพนิ่งก่อน แล้วค่อยเพิ่มการเคลื่อนไหวเท่าที่จำเป็น
