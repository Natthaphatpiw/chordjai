# ฐานข้อมูล ChordJai

ใช้ Supabase project เดียวกับ PostgreSQL + pgvector รหัสผู้ใช้และน้องเป็น UUID เวลาเก็บ UTC และแสดงผล Asia/Bangkok ใช้ region/connection hostname ที่ project ของคุณแสดงจริง

## รุ่น 21: Pet Passport แบบ Q&A

เพิ่ม sessions, ประวัติคำตอบ, ฉบับที่เจ้าของยืนยัน, รูปที่เลือก, ลิงก์อ่านอย่างเดียว และบันทึกจากคลินิก พร้อมการเชื่อมผลหลังพบหมอกลับเข้า Care Diary/เรื่องการดูแล/นัดติดตามใน transaction เดียว ใช้สิทธิ์ใหม่ `passport.read` และ `passport.write` แยกจาก grant เดิม หมอที่เขียนต้องมีบทบาท vet ทั้งบัญชีและสมาชิกคลินิก การแก้คำตอบ ลบรูป ถอนความยินยอม หรือเพิกถอนสิทธิ์ทำให้ฉบับเดิมใช้ต่อไม่ได้

ฐานข้อมูลโครงการอัปเกรดจากสถานะ 20 ที่ตรวจแล้วเป็น 21 เมื่อ 13 ตุลาคม 2026 และ read-only diagnostic ยืนยัน fingerprint `5ff3a6478e28e83e84c4ffb6d5f74478` รายละเอียด API/ขอบเขตข้อมูลอยู่ใน [PET_PASSPORT.md](../docs/PET_PASSPORT.md) ใช้ `upgrade.sql` สำหรับฐานข้อมูลเดิม ไม่ต้องรัน bootstrap ซ้ำและไม่มี env เพิ่ม

## รุ่น 17–18: คลังภาพ PetID และ LINE follow-up

รุ่น 19–20 เพิ่ม `capture_checks`, คุณภาพรายภาพ, `capture_reviews` พร้อมผู้ตรวจ/หลักฐาน/consent epoch, eligibility view ที่เคารพ RLS และ manifest/lineage อายุ 24 ชั่วโมง ถอนสิทธิ์หรือลบต้นทางแล้ว snapshot เดิมใช้ต่อไม่ได้ Pipeline ต้องตรวจสิทธิ์สดต่อเนื่อง เอกสารและคำสั่งอยู่ใน [PETID_MODEL_PIPELINE.md](../docs/PETID_MODEL_PIPELINE.md) ไม่เปิดฝึกหรือแทนโมเดลค้นหาอัตโนมัติ

Migration 17 เพิ่ม capture sessions/samples และความยินยอมฝึกโมเดลเฉพาะน้องแต่ละตัว; ทุกชุดเริ่ม pending และไม่เปิดฝึกอัตโนมัติ Migration 18 เพิ่ม follow-up preferences/consent ledger/deliveries/replies โดยไม่เปิดรับให้บัญชีเดิม พร้อม RLS และ FK ลบตามบัญชี ใช้ safe upgrade สำหรับฐานข้อมูลเดิม ไม่มี env เพิ่ม

## นำ SQL ไปใช้

สำหรับรอบสมุดหลายหน้าและ PetID หลายรูป ใช้ migration `202610110015_memory_books_petid_photos.sql` (migration 15): เพิ่ม `journal.books`, วันที่/สถานที่/ลำดับ/ขนาด canvas ของหน้า และ `biometric.enrollment_photos` สูงสุด 5 ตำแหน่ง พร้อม RLS และ trigger ล้างเวกเตอร์เมื่อรูปอ้างอิงถูกลบหรือใช้ไม่ได้ หน้าเดิมยังคงข้อมูล ตำแหน่ง และเวลาแก้ไขเดิมไว้ ฐานข้อมูลเดิมแนะนำรัน `upgrade.sql` เพื่อให้ตรวจรุ่นก่อนเพิ่มส่วนที่ขาด ไม่รัน `bootstrap.sql` ซ้ำ

1. เปิด SQL Editor ของ **project ใหม่/ฐานข้อมูลว่าง** แล้วรัน `bootstrap.sql` ครั้งเดียวด้วย role `postgres` ไฟล์นี้รวม migration ตามลำดับเรียบร้อยแล้ว
2. ตั้ง `DATABASE_URL` ใน backend เป็น PostgreSQL connection string จาก Supabase แบบ **transaction pooler** ใช้ DB password ของ project อย่าใช้ anon key หรือ service-role API key แทน connection string
3. สำหรับการเปลี่ยน schema ในครั้งถัดไป ให้รันเฉพาะไฟล์ migration ที่ยังไม่ได้ใช้ ห้ามรัน bootstrap ซ้ำบนฐานข้อมูลที่มีข้อมูล

ถ้าเคยรัน bootstrap แล้วและพบ `42P07 relation users already exists` ให้ใช้ `diagnostic.sql` ก่อน ไฟล์นี้อ่าน metadata เท่านั้นและคืน JSON เดียวรวมทุกตาราง/คอลัมน์/สถานะ migration จากนั้นใช้ `upgrade.sql` สำหรับฐานข้อมูล ChordJai เดิมที่ผ่านการตรวจตรงกับสถานะที่รู้จัก ไฟล์อัปเกรดไม่รันคำสั่งสร้างตาราง core ซ้ำ ไม่ลบตารางผู้ใช้ และใช้ transaction เดียวเพื่อ rollback ทั้งหมดเมื่อ validation หรือ migration ล้มเหลว

Guard ตรวจ fingerprint ของตาราง คอลัมน์ ชนิดข้อมูล default constraint RLS policy trigger function และ index ครบ ไม่ตัดสินจาก `identity.users` ตารางเดียว และบันทึก SHA256 ของไฟล์ใน `ops.schema_migrations` ตารางอื่นที่ไม่เกี่ยวกับ ChordJai ไม่มีส่วนในการตรวจ

Reference metadata ทดสอบบน PostgreSQL 17 + pgvector ถ้าฐานข้อมูลใช้ PostgreSQL คนละ major version, deparser ต่าง, หรือมีการแก้/เพิ่ม object ใน service schema เอง ระบบอาจปฏิเสธอย่างระมัดระวังแม้บางอย่างทำงานเทียบเท่ากัน ไม่ได้อ้างว่ารองรับ schema ใด ๆ โดยอัตโนมัติ ให้ตรวจ JSON และออก migration ที่เหมาะกับ schema นั้น ห้ามแก้เป็น `CREATE TABLE IF NOT EXISTS` ทั้งชุดเพื่อซ่อนความต่าง

ถ้า Supabase Table Editor แสดง No Tables ให้เปลี่ยน schema จาก `public` เป็น `identity`, `pet` หรือ service ที่ต้องการ ตารางของระบบตั้งใจแยกไว้ตาม service และไม่เปิดตรงจาก browser

`bootstrap.sql` สร้าง schema, ตาราง, FK, index, RLS, roles, functions และ trigger ครบ ไม่สร้างคลินิกจริงหรือชุดกฎที่อ้างว่าได้รับการอนุมัติจากหมอ

นักพัฒนาแก้ migration แล้วรัน `python3 supabase/build-bootstrap.py` เพื่ออัปเดตไฟล์รวม สคริปต์ทดสอบตรวจว่าไฟล์รวมตรงกับ migration ก่อนเริ่มทุกครั้ง

แอปต้องเชื่อมด้วย login role ที่มีสิทธิ์ `SET ROLE chordjai_app` และ `SET ROLE chordjai_worker` migration ให้สิทธิ์นี้กับ `postgres` ของ Supabase แล้ว Browser ไม่ติดต่อ schema ส่วนตัวด้วย Data API

## สิทธิ์และการลบข้อมูล

`withUser` เริ่ม transaction ตั้ง `SET LOCAL ROLE chordjai_app` และ `app.user_id` จาก token ที่ server ตรวจแล้ว RLS อ่านผู้ใช้คนนี้เท่านั้น ผู้ดูแลร่วมอ่าน/เขียนข้อมูลน้องได้ ผู้ดูอย่างเดียวเขียนไม่ได้ และสมาชิกน้องไม่มีสิทธิ์อ่านข้อความหรือ memory ส่วนตัวของเจ้าของ

`chordjai_worker` ใช้เฉพาะงานระบบและ projection ที่ server จำกัดไว้ เช่น LINE webhook, สรุปจาก capability token, คลินิกสาธารณะ และ scheduler ฐานข้อมูลนี้ไม่ใช่ Supabase Auth: ห้ามนำ user ID ที่ client ส่งมาใช้เป็น `app.user_id` และห้ามใช้ worker role กับ CRUD ของผู้ใช้

`public.is_admin()` ตรวจ role จากแถว `identity.users` ไม่เชื่อ GUC ของบทบาท แอดมินไม่มีสิทธิ์อ่านประวัติสุขภาพ/สมุด/memory ทุกคนผ่าน RLS โดยอัตโนมัติ คลินิกต้องมี membership ของคลินิกที่ยืนยันแล้ว และ grant สดที่ยังไม่หมดอายุ การถอน grant มีผลกับ query ถัดไปทันที

ความยินยอมปัจจุบันอยู่ที่ `identity.consents` และประวัติอยู่ที่ `identity.consent_history` ถอน `ai_improvement` แล้ว flag ของ media ถูกปิดใน transaction เดียว ถอน `ai_memory` แล้วปิด memory preferences การลบบัญชี cascade ลบข้อมูลส่วนตัวและข้อมูลน้องที่ผู้ใช้เป็นเจ้าของ รวมถึงข้อมูลน้องนั้นที่ผู้ดูแลร่วมบันทึก Trigger ของ media ใส่งานลบ Blob ให้ก่อน metadata ถูกลบใน transaction เดียว งานนี้เป็นของระบบจึงอยู่ต่อหลังบัญชีถูกลบ และรวมรูปที่ผู้ดูแลร่วมอัปโหลดให้ด้วย

ถ้าผู้ดูแลร่วมลบบัญชีของตัวเอง น้องของเจ้าของคนอื่นยังอยู่ ประวัติสุขภาพที่ผู้ดูแลร่วมเคยบันทึกให้น้องนั้นยังอยู่ต่อ โดย `created_by` เปลี่ยนเป็น `NULL` เพื่อไม่ทำข้อมูลวัคซีน/การรักษาของเจ้าของคนอื่นหายไป

ส่วนนี้ต่างจากเอกสารตั้งต้นอย่างตั้งใจ: pilot ใช้ role แอปเดียวกับ worker และ **FK ข้าม schema** เพื่อความถูกต้องและลบครบใน transaction เดียว ถ้าต้องแยกฐานข้อมูลจริง ต้องแทน FK ด้วย ownership contract, event และ saga การเป็น service ต่อ schema ในรุ่นนี้ยังไม่ได้ให้ isolation ระดับ DB role ต่อ service

## งานเบื้องหลัง

`ops.enqueue(topic,payload,dedupe_key,run_at,max_attempts)` คืน ID เดิมเมื่อส่งซ้ำ `ops.claim_jobs(worker_id,limit,lease_seconds)` ใช้ `FOR UPDATE SKIP LOCKED` และออก lease token ใหม่ งานสำเร็จ/ล้มเหลวต้องส่ง token เดิมให้ `ops.complete_job`/`ops.fail_job` เท่านั้น งานที่หมดจำนวน retry หรือ crash ในครั้งสุดท้ายจะอยู่ในสถานะ `dead` เพื่อให้ตรวจและ replay ได้

Scheduler ลบ `ops.rate_limits` และ `ops.idempotency` ที่ `expires_at < now()` ตามรอบ และลบ LINE webhook ที่เกิน 7 วันครั้งละไม่เกิน 1,000 แถวตามเอกสารต้นฉบับ การส่ง LINE ยังต้องใช้ retry key ของ LINE ร่วมด้วย: คิวแบบ at-least-once ไม่ได้ทำให้ HTTP ภายนอกเป็น exactly-once

## PetID vector index

Migration 14 เพิ่ม partial HNSW cosine index บน `biometric.enrollments.embedding` 1536 มิติ สำหรับ `status='ready'`, `search_mode='lost_only'` และเวกเตอร์ที่ไม่เป็น NULL เงื่อนไขประกาศหาย active ชนิดสัตว์เดียวกัน รูปยัง ready และการไม่ค้นตัวเองยังต้องตรวจจากฐานข้อมูลสดใน query

HNSW เป็น approximate retrieval จึงใช้ exact query ผ่าน MATERIALIZED eligible gallery เมื่อ candidate ที่ผ่านตัวกรองไม่ครบ การใช้ iterative scan ต้องมี pgvector 0.8 ขึ้นไป ตาม [เอกสาร pgvector](https://github.com/pgvector/pgvector#iterative-index-scans) Index ไม่ใช่การรับรองตัวตนสัตว์หรือผล accuracy

## ทดสอบบน PostgreSQL จริง

```bash
bash supabase/tests/run-local.sh
# รวม HTTP integration กับฐานข้อมูลชั่วคราวเดียวกัน หลัง npm ci แล้ว
bash supabase/tests/run-local.sh --http
```

ต้องมี Docker และ Python 3 สคริปต์สร้างฐานข้อมูลชั่วคราวเฉพาะการทดสอบ ใช้ image `pgvector/pgvector:pg17` และลบเฉพาะ container ของตัวเองเมื่อจบ **ไม่อ่าน DATABASE_URL และไม่ทดสอบกับ Supabase จริง**

เมื่อใช้ `--http` ต้องมี Node 24 และติดตั้ง dependencies ของ repo แล้ว สคริปต์เปิด DB เฉพาะ loopback ด้วย port สุ่ม และตั้ง `TEST_DATABASE_URL` ให้งาน HTTP โดยอัตโนมัติ ไม่ใช้ LINE secret, OpenAI key หรือ Supabase project จริง

ทดสอบข้ามผู้ใช้, viewer/carer, การปลอม owner, self-promotion, private memory, clinic grant ที่เพิกถอน/หมดอายุ, consent history, triage ห้ามลดระดับ/AI fallback floor, ลบบัญชี cascade, queue dedupe/lease/dead letter, anonymous denial และ race จริงระหว่างหลาย DB session สำหรับ quota/queue

เพิ่ม EXPLAIN ที่ยืนยันว่า query ใช้ HNSW ได้, exact fallback แยกจาก ANN, ตัวกรองไม่คืนสัตว์ที่ไม่เข้าเงื่อนไข และ upgrade จากสถานะ 1/4/9/13/14 รักษาแถวผู้ใช้ การทดสอบ foreign schema, core ไม่ครบ, schema drift และ checksum เปลี่ยน ต้องปฏิเสธโดยไม่แตะข้อมูล การบังคับ planner ใน fixture เล็กใช้พิสูจน์ความเข้ากันได้ของ index ไม่ใช่ benchmark ว่า production จะเลือก ANN ทุกครั้ง

ผลทดสอบ SQL ไม่ยืนยันความปลอดภัยทางการแพทย์ ความตรงกับสัตวแพทย์ latency/SLO หรือการกู้ backup การประเมินเหล่านี้ยังต้องใช้ข้อมูลจริงและคนที่รับผิดชอบตามเอกสารระบบ

## Care diary data and sharing (migration 16)

Care diary entries are personal, owner-reported content. Removing an author removes that author's diary entries, private reflections, entry attachments, expenses and authored care episodes. Entries written by other pet family members remain; when a deleted episode previously grouped their entries, those entries become ungrouped. Existing `health.records` keep their established behavior: removing a carer anonymizes attribution, and removing the pet removes its clinical records. A shared diary entry never becomes a veterinarian-verified medical record merely because the owner grants access.

Raw diaries are available only to the pet family, and reflections only to the author. Clinic access requires the new explicit `care.read` scope and the entry's own sharing selection. Existing `summary.read` grants do not widen. Clinical/public projections exclude narrative, private reflection and image references. Expense sharing requires both the entry's expense selection and the request's expense selection; integer minor units, currencies and paid/estimate categories remain separate.

Public snapshots are static. Deleting a referenced diary entry, withdrawing its sharing, or withdrawing expense sharing revokes links containing that entry. Account erasure cascades diary deletion and triggers the same revocation. Follow-up reminders belong to the original entry author, use a stable `care:<entry id>` key and are removed with the entry. Updates without a date change do not re-send an already completed reminder.
