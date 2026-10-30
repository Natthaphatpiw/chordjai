# Deployment ของ ChordJai

## LINE Agent และแก้ไข/ลบบันทึก — ฐานข้อมูล 23 วันที่ 29 ตุลาคม 2026

**ฐานข้อมูลจริงตรวจแล้วถึงรุ่น 23:** ผู้ดูแลรัน SQL และตั้ง env เอง Read-only diagnostic ยืนยัน fingerprint `171c466a888ddd5fd7df4ab1f5055527` รุ่น Agent ก่อนเพิ่มแก้/ลบ commit `8cc23e7` ขึ้น READY ทั้งสี่ project แล้ว สถานะ release ของโค้ดแก้/ลบดู [VERIFICATION.md](VERIFICATION.md) รอบนี้ไม่เพิ่ม env และไม่ส่ง LINE หรือสร้างบันทึกพีโอนีจริง ผู้ใช้เลือกทดสอบบทสนทนาจริงเองตาม [RECORD_MUTATIONS.md](RECORD_MUTATIONS.md)

ใช้ **1 repo/4 Vercel projects/14 Services เดิม** Agent อยู่ใน `assistant` เชื่อม `notification` และ `scheduler` ผ่าน private bindings ไม่ต้องเพิ่ม service, Messaging webhook หรือ LIFF endpoint โมเดลยังเป็น `OPENAI_MODEL=gpt-6.1-sol` Dependency ใน checkout ใช้ Next.js `16.4.3` และ Zod `4.6.6`; ใช้ `npm ci` จาก lockfile ที่มาพร้อมกัน

ลำดับเปิดใช้สำหรับ environment ใหม่ (โครงการนี้อัปเกรดฐานข้อมูลแล้ว):

1. คง `LINE_AGENT_ENABLED=false` ระหว่างเตรียม backend และ owner app รุ่นใหม่
2. ใน Supabase จริงรัน `diagnostic.sql` → `upgrade.sql` → `diagnostic.sql` ตรวจถึง **23** และไม่มี partial/unknown state ฐานข้อมูลมีข้อมูลแล้วห้ามรัน bootstrap ซ้ำ
3. ตั้ง env จริงของ backend เองตาม [backend/.env.example](../backend/.env.example) ใช้ credentials เดิมที่ถูกต้องและ optional `LINE_AGENT_LIFF_ID` ค่า LIFF หลักเดิม ถ้าไม่กำหนดจะใช้ `LIFF_ID`
4. ตรวจ deployment ของ backend/owner app, bindings, Cron และ provider access ก่อนเปลี่ยน `LINE_AGENT_ENABLED=true` เฉพาะ environment ที่พร้อม แล้ว deploy การตั้งค่าใหม่
5. ใช้บัญชีทดสอบของผู้ดูแลตรวจคำถามทั่วไป คำสั่งบันทึก การถามเพิ่ม/ยืนยัน และ LIFF ที่เปิดรายการเดียวกับงาน ดูเกณฑ์เปิดใช้ครบใน [LINE_AGENT.md](LINE_AGENT.md#11-สิ่งที่ผู้ดูแลต้องทำก่อนเปิดใช้)

ข้อความ Agent ตอบคำขอที่ผู้ใช้เพิ่งส่งผ่าน LINE Push API จึงใช้ OA quota แยกจาก optional follow-up แบบ 5/7 วัน ไม่เปิด follow-up หรือ memory consent ให้อัตโนมัติ

## Pet Passport Q&A — ฐานข้อมูล 21

เพิ่ม migration `202610130021_pet_passport.sql` ก่อน deploy โค้ด health/clinic/share รุ่นนี้ ใช้ 1 repo/4 projects และ environment เดิมทั้งหมด ไม่ขยายสิทธิ์คลินิกเดิม เจ้าของเลือก `passport.read` และ `passport.write` แยก รูปให้หมอโหลดด้วยสิทธิ์ปัจจุบัน ลิงก์ที่แก้/เพิกถอนใช้ต่อไม่ได้ ขั้นตอนและ API อยู่ใน [PET_PASSPORT.md](PET_PASSPORT.md)

ผลหลังพบหมอเข้าสู่ care diary และ reminder เดิมโดยเจ้าของยืนยัน ไม่ส่ง LINE ทันทีหรือเปิด optional follow-up เอง Scheduler และ webhook เดิมยังใช้ endpoint เดิม

## ตรวจภาพและ pipeline PetID — ฐานข้อมูล 20

ใช้ repo/4 projects/LIFF/environment backend เดิม เพิ่ม migrations 19–20 ก่อน deploy backend รุ่นนี้ ไม่รัน bootstrap กับฐานข้อมูลที่มีข้อมูลแล้ว ผู้ใช้เลือกส่งตรวจภาพด้วย OpenAI ส่วน admin ตรวจหลักฐานและสร้าง manifest ได้เมื่อเจ้าของยังยินยอม ปิดการฝึกอัตโนมัติไว้ทั้งหมด

Python research runtime อยู่ใน `scripts/petid-ml` พร้อม pinned requirements และ `.env.example` ของตัวเอง ใช้ `PETID_API_ORIGIN`, admin session `PETID_API_TOKEN` และ `PETID_EXPORT_ID` ผ่าน HTTPS เก็บ token ในเครื่องที่มีสิทธิ์ ไม่ใส่ใน frontend/Vercel/Git และไม่ส่งในแชต Pipeline มีอายุ manifest 24 ชั่วโมงและหยุดเมื่อ token/สิทธิ์ตรวจไม่ได้ ดู [PETID_MODEL_PIPELINE.md](PETID_MODEL_PIPELINE.md) ไม่ติดตั้ง PyTorch ในบริการ Vercel

## คลังภาพ PetID / LINE follow-up และฐานข้อมูล 18 — 12 ตุลาคม 2026

ใช้ repo/4 projects/env/LIFF เดิม เพิ่ม migration 17 คลังภาพ/สิทธิฝึก PetID และ migration 18 follow-up preferences/consent/deliveries/replies ทั้งสองส่วนปิดสิทธิฝึกและข้อความเชิงรุกไว้ก่อน ทุกชุดภาพใหม่รอทบทวน ผู้ใช้ต้องเลือกเปิด follow-up กับแหล่งข้อมูลและยินยอมเอง

Backend Cron `/internal/cron/followups` เรียกทุก 5 นาทีผ่าน scheduler → private notification binding ประมวลผลสูงสุดสองผู้ใช้พร้อมกัน ตรวจ 24 ชั่วโมงหลังเปลี่ยนตัวเลือก, 5/7 วันหลังข้อความก่อน, ช่วง 09:00–20:00 Bangkok และสิทธิ/แหล่งข้อมูลก่อนส่งด้วย LINE Push API เพิ่มเวลา function ของ notification/scheduler เป็น 120 วินาที ไม่เพิ่ม credential หรือ public route สำหรับสั่งส่งให้คนอื่น

รายละเอียด [PETID_DATASET.md](PETID_DATASET.md) และ [PERSONALIZED_FOLLOWUPS.md](PERSONALIZED_FOLLOWUPS.md) เครื่องติดตั้งเดิมตรวจ diagnostic แล้วใช้ upgrade.sql; ไม่รัน bootstrap ซ้ำ

## Care Diary และฐานข้อมูล 16 — 12 ตุลาคม 2026

Core ใหม่อยู่ในบริการ `health` เดิม: สมุดสุขภาพเปิดที่ไดอารี่ดูแลน้อง และแยกมุมสมุดประจำตัว/วัคซีนไว้ข้างกัน บันทึกวันปกติ อาการ ไปพบหมอ ค่ารักษา และติดตามหลังรักษาเชื่อมเป็นเรื่องการดูแล เจ้าของเลือกข้อความ/รูปไปสร้างร่างความทรงจำได้ ข้อความสำหรับคุณหมอแยกจากเรื่องเล่าและความรู้สึกส่วนตัว

Migration `202610120016_care_diary.sql` เพิ่ม `health.care_episodes`, `care_entries`, `care_reflections`, `care_costs`, `care_media` พร้อม RLS, version/ที่มาข้อมูล, การเก็บค่าใช้จ่ายเป็นหน่วยย่อยและการเตือนติดตาม เพิ่มสิทธิ์คลินิก `care.read` โดยไม่ขยายสิทธิ์ `summary.read` เดิม การแชร์บันทึกและค่าใช้จ่ายต้องเลือกแยกกัน ไม่มีการเปิดเรื่องเล่าเต็ม ความรู้สึกส่วนตัวหรือรูปไดอารี่ผ่านสรุปคลินิก/สาธารณะ

**Supabase จริงของโปรเจกต์อัปเกรดและตรวจยืนยันรุ่น 16 แล้ว** migration 1–15 ไม่ถูกเปลี่ยน checksum เครื่องติดตั้งอื่นที่ยังเป็นรุ่นเดิมให้ตรวจด้วย `supabase/diagnostic.sql` แล้วใช้ `supabase/upgrade.sql` ตามขั้นตอนด้านล่าง ฐานข้อมูลใหม่ใช้ `bootstrap.sql` เท่านั้น

รอบนี้ไม่มี Git repo, Vercel project, environment variable, secrets หรือ endpoint LIFF ใหม่ ใช้ 1 repo/4 projects, ค่า env และ LINE/LIFF เดิมทั้งหมด การอัปเกรด schema ไม่แทนการตรวจสถานะ deployment ของแต่ละ project

API ใหม่ภายใต้ `/api/v1/health/care` คือ `/entries`, `/entries/:id`, `/episodes`, `/episodes/:id` และ `/summary` รายการ entries/episodes ใช้ keyset `before=<ISO UTC ที่ตอบกลับ>` คู่กับ `beforeId=<UUID>` ครั้งละ 50 รายการโดยปริยาย สูงสุด 200 ต่อคำขอ ต้องเก็บค่าเวลา cursor ครบตามที่ API ตอบกลับเพื่อรักษา microseconds ไม่แปลงผ่าน JavaScript Date ก่อนส่งกลับ ประวัติไม่จำกัดจำนวนรวม; summary คืนสูงสุด 100 รายการล่าสุดที่อนุญาตแชร์และค่า `truncated` เมื่อมีรายการอื่น

คลินิกใช้ grant `care.read` ที่ยังไม่หมดอายุและไม่ถูกเพิกถอนเพื่ออ่าน clinical projection ของบันทึกที่เลือก ค่าใช้จ่ายแสดงเฉพาะเมื่อรายการอนุญาตและ request เลือกเพิ่ม ลิงก์แชร์ต้องเลือก `includeCare`/`includeCosts` เอง ค่าเริ่มต้นเป็น false ทั้งคู่ สรุปลิงก์ยังรวมโปรไฟล์และระเบียนสมุดสุขภาพเดิมสูงสุด 100 รายการพร้อมหมายเหตุ; ตัวเลือกไดอารี่ไม่ได้เปลี่ยนขอบเขตระเบียนเดิม

## จำนวน repo และ project

ใช้ **1 Git repository: chordjai** เป็น npm workspaces monorepo และ **4 Vercel projects** โดย repo ไม่ใช่หน่วย deploy ขอบเขต microservice อยู่ที่ service/schema/entrypoint

Repository ที่เชื่อมไว้คือ [Natthaphatpiw/chordjai](https://github.com/Natthaphatpiw/chordjai) บน branch `main` การ push commit ไป branch นี้ให้ Vercel projects ที่เชื่อม Git สร้าง deployment ใหม่ตามการตั้งค่า

`.env.local` และไฟล์ secrets ถูก Git ignore ไม่รวมใน commit หรือ push

| Project | Root Directory | Preset | Domain | Env example |
|---|---|---|---|---|
| chordjai-owner-app | frontend/owner-app | Next.js | www.chordjai.life | frontend/owner-app/.env.example |
| chordjai-clinic-portal | frontend/clinic-portal | Next.js | clinic.chordjai.life | frontend/clinic-portal/.env.example |
| chordjai-admin-console | frontend/admin-console | Next.js | admin.chordjai.life | frontend/admin-console/.env.example |
| chordjai-backend | backend | Services / auto detect Hono | api.chordjai.life | backend/.env.example |

เปิด **Include source files outside Root Directory** ให้ทุก project เพื่อให้ import packages และ frontend/shared ได้ ใช้ Node24, function region sin1, install command npm ci ที่ workspace root (Vercel ตรวจ npm workspaces/package-lock) Next build command ใช้ preset ปกติ Backend ใช้ backend/vercel.json ตรวจ Hono จาก src/index.ts ของแต่ละ service ไม่มี build command รวม frontend

ถ้า account ไม่เปิด Services Beta ให้รอเปิด feature หรือใช้ fallback แยก Vercel projects ต่อ backend service โดยใช้แต่ละ backend/<service> เป็น Root Directory และ router rewrites ไป URL ที่ deployจริง การแยก **Vercel projects** ไม่บังคับแยก Git repo

## Backend environment

```dotenv
DATABASE_URL="postgresql://postgres.PROJECT_REF:URL_ENCODED_DB_PASSWORD@POOLER_HOST_FROM_CONNECT:6543/postgres?sslmode=require"
APP_ORIGIN=https://www.chordjai.life
API_ORIGIN=https://api.chordjai.life
ALLOWED_ORIGINS=https://www.chordjai.life,https://clinic.chordjai.life,https://admin.chordjai.life
APP_JWT_ISSUER=https://www.chordjai.life
APP_JWT_SECRET=<สุ่มอย่างน้อย32ตัวอักษร>
CRON_SECRET=<สุ่มอีกค่าหนึ่งอย่างน้อย32ตัวอักษร>
OPENAI_API_KEY=<ใส่เองในVercel>
OPENAI_MODEL=gpt-6.1-sol
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
AI_DAILY_BUDGET_USD=5
AI_INPUT_USD_PER_MILLION=2
AI_OUTPUT_USD_PER_MILLION=10
LINE_CHANNEL_ID=2009341751
LINE_CHANNEL_SECRET=<อยู่ในbackend/.env.local>
LINE_CHANNEL_ACCESS_TOKEN=<tokenในbackend/.env.localหรือออกจากLINEConsole>
LINE_TOKEN_EXPIRES_AT=<epoch milliseconds ถ้าใช้tokenอายุ30วัน>
LINE_LOGIN_CHANNEL_ID=2010549060
LINE_LOGIN_CHANNEL_SECRET=<อยู่ในbackend/.env.local>
LINE_LOGIN_CHANNEL_ACCESS_TOKEN=<ใช้สคริปต์setupLINEเท่านั้น>
LIFF_ID=2010549060-FRfLt9mJ
LIFF_ENDPOINT=https://www.chordjai.life/app
LINE_AGENT_ENABLED=false
# Optional: เว้นไว้เพื่อใช้ LIFF_ID เดิม
LINE_AGENT_LIFF_ID=2010549060-FRfLt9mJ
LINE_WEBHOOK_URL=https://www.chordjai.life/api/v1/notification/webhooks/line
BLOB_READ_WRITE_TOKEN=<privateBlobstoreที่sin1>
```

Vercel Services ใช้ env ร่วมกันใน backend project ส่วน `ASSISTANT_INTERNAL_URL` มาจาก binding ให้ notification/scheduler เรียก assistant และ `NOTIFICATION_INTERNAL_URL` ให้ scheduler เรียก notification ส่วน assistant ใช้ notification handler ภายใน process พร้อม worker auth เดิม ไม่ประกาศ binding ย้อนกลับเพราะ Vercel ปฏิเสธวงจรด้วย `CIRCULAR_SERVICE_BINDING` ไม่ต้องกรอก public URL แทนบน Vercel สำหรับ local scheduler fallback localhost8787 ใช้ `API_PORT=8787` การเพิ่ม Agent ไม่ต้องเพิ่ม env ให้ frontend เพียงเพื่อเปิด flag แต่ owner app ต้องมีหน้าผลรุ่นใหม่

DATABASE_URL เป็น connection string Postgres ของ Supabase ไม่ใช่ project URL HTTPS และไม่ใช่ anon/service_role key รหัสผ่านมีอักขระพิเศษต้อง URL encode คง sslmode=require ไว้ใน production การเข้า DB ทุก user transaction SET LOCAL ROLE chordjai_app + app.user_id เพื่อใช้ RLS worker ใช้ role chordjai_worker ตัว connection principal ต้อง SET ROLEได้

เปิด Supabase project → **Connect → Transaction pooler** แล้วคัดลอก connection string ทั้งบรรทัด พอร์ตเป็น `6543` แทน `[YOUR-PASSWORD]` ด้วยรหัสผ่านฐานข้อมูล และเติม `?sslmode=require` หากยังไม่มี ห้ามเดา pooler hostname จาก region หรือเปลี่ยนแค่พอร์ตของ Direct connection เพราะ pooled username เป็น `postgres.PROJECT_REF` ด้วย [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)

Backend และ CLI `db:upgrade` ใช้ public Supabase Root 2021 CA ที่ bundle ใน `packages/db/src/supabase-ca.ts` เฉพาะ shared pooler hostname ที่ลงท้าย `.pooler.supabase.com` ตรวจ certificate และ hostname ด้วย `rejectUnauthorized: true` โดยจัดการ SSL query options ที่อาจ override CA ใน node-postgres ให้แล้ว ไม่ต้องเพิ่ม secret หรือปิดการตรวจ TLS สำหรับ pooler นี้ Connection ของ local test และผู้ให้บริการอื่นคงค่าของตัวเอง ดู [node-postgres SSL options](https://node-postgres.com/features/ssl) และ [Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement)

ราคาค่า AI ข้างต้นเป็น Standard short-context ที่ตรวจ10ต.ค.2026: input$2/output$10ต่อ1ล้านtokens ไม่ใช่ต้นทุนต่อผู้ใช้ที่รับประกัน และยังมีค่า infra/LINE/Blob ใช้ token limits, reservation และ daily budget; logเป็นค่าประมาณก่อนใบแจ้งหนี้ ไม่หักส่วนลดcache จึงประมาณแบบเผื่อ [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

## Frontend environment

ทั้งสาม frontend ไม่มี secrets:

```dotenv
API_ORIGIN=https://api.chordjai.life
NEXT_PUBLIC_LIFF_ID=2010549060-FRfLt9mJ
NEXT_PUBLIC_LINE_OA_URL=<ลิงก์เพิ่มเพื่อนOAจริงของคุณ>
```

Clinic ใช้ LIFF_IDเป็น2010549060-zCdRzv7e; Admin ใช้2010549060-g72pN0tY ทั้งสามตั้ง API_ORIGINเหมือนกัน ลิงก์OAใช้เฉพาะownerและเว้นว่างได้จนมีลิงก์จริง **ห้ามเอา OPENAI_API_KEY, LINE secrets, DATABASE_URL หรือ BLOB token ใส่ NEXT_PUBLIC_**

Production fallback ของทั้ง Next rewrites และ public SSR requests ใช้ `https://api.chordjai.life` เมื่อไม่ได้ตั้ง `API_ORIGIN` ส่วน development ใช้ localhost การแก้ env ของ rewrites ต้อง rebuild/deploy ใหม่ ดูปัญหาและผลตรวจใน [DEPLOYMENT_DIAGNOSIS.md](DEPLOYMENT_DIAGNOSIS.md)

Preview frontend ต้องตั้ง API_ORIGINเป็น backend preview ที่เข้าคู่กันและไม่ได้มี Deployment Protectionบล็อก webhook/LIFF user การใช้งาน preview กับ LINEต้องมีLIFFทดสอบและhttps endpointของตัวเอง ไม่ใช้secret productionทดสอบอัตโนมัติ

## Supabase SQL

สถานะเตรียมรอบ LINE Agent: ไฟล์ SQL ใน checkout รวม migration **22** แล้ว ผู้ดูแลเป็นผู้รันกับฐานข้อมูลจริงเองตามขั้นตอนด้านบน หลักฐาน production ที่มีอยู่ยังยืนยันเพียง **21** หัวข้อวันที่ด้านล่างเก็บเป็นประวัติการส่งมอบแต่ละรอบ

อัปเดต 12 ตุลาคม 2026: โค้ด Care Diary ต้องมี migration 1–16 ครบ โดยสมุด/Story/PetID ใช้ migration 15 และไดอารี่เพิ่ม migration 16 Supabase ของโปรเจกต์นี้ตรวจยืนยันเป็นรุ่น 16 แล้ว สำหรับฐานข้อมูลเดิมอื่นที่ผ่าน diagnostic ให้รัน `supabase/upgrade.sql` หรือ `npm run db:upgrade` ซึ่งเพิ่มเฉพาะส่วนที่ขาดและตรวจ fingerprint ก่อนทุกครั้ง Backend health และ biometric กำหนดระยะเวลา Function 120 วินาทีสำหรับ batch/รูปหลายมุม โดยตัว AI ยังมี timeout และงบของแต่ละฟีเจอร์เอง ไม่ต้องเพิ่ม env หรือเปลี่ยน LIFF endpoint

1. เปิด Supabase project ที่ใช้กับระบบแล้วเข้า SQL Editor
2. ฐานข้อมูลใหม่รัน `supabase/bootstrap.sql` **ครั้งเดียว** ถ้าฐานข้อมูลเดิมมี `identity.users` แล้ว รัน `supabase/diagnostic.sql` เพื่อดูสถานะ จากนั้นใช้ `supabase/upgrade.sql` ซึ่งตรวจ schema เทียบรุ่นที่รู้จักก่อนเพิ่มเฉพาะ migration ที่ขาดและบันทึก `ops.schema_migrations` ทุกการเปลี่ยนแปลงอยู่ใน transaction เดียว ถ้า schema ไม่ตรงสคริปต์จะหยุดโดยไม่แก้ข้อมูล ห้ามรัน bootstrap ซ้ำบน DB เดิม
3. ไม่ expose schemasเหล่านี้ผ่าน Supabase Data API และไม่ต้องเพิ่ม frontend Supabase key
4. ใช้ `supabase/seed.sql` เป็นคำแนะนำเติมข้อมูลจริง/สิทธิ์พนักงาน ไม่ใส่รายชื่อคลินิกตัวอย่างเป็นโรงพยาบาลจริง
5. ให้ผู้ดูแลล็อกอินครั้งแรกแล้วค่อยตั้ง roleด้วยSQLโดยระบุ LINE user IDที่ตรวจสอบแล้ว ดูตัวอย่างในseed.sql

มี FK cascade/RLS, consent history, token hashes, journal version, assistant chat lease, pgvector, queue dedupe/lease/retry/deadletter และ HTTP idempotency bootstrapใช้15service schemasในpilotซึ่งเพิ่ม journal/assistantจากเอกสารและปรับโครงschemaบางส่วน

Table Editor อาจเปิดอยู่ที่ `public` ซึ่งไม่มีตารางแอป ให้เลือก schema `identity` สำหรับ `users`, `pet` สำหรับ `pets`, `health` สำหรับประวัติ หรือ `biometric` สำหรับ PetID ไม่ต้อง expose schema ผ่าน Data API เพื่อดูตาราง [ตัวอย่าง schema dropdown จาก Supabase](https://supabase.com/docs/guides/ai/quickstarts/text-deduplication)

ผู้ที่ใช้ CLI และใส่ `DATABASE_URL` แล้วสามารถรัน `npm run db:upgrade` แทน SQL Editor ได้ ใช้ SQL ชุดเดียวกันและไม่พิมพ์ connection string หรือข้อมูลผู้ใช้ ถ้า diagnostic ระบุ schema ที่ไม่รู้จัก ให้ตรวจผล JSON ก่อนเลือก migration ห้ามแก้ด้วยการลบ `users` หรือเติม `IF NOT EXISTS` ทุกคำสั่ง

## LINE / LIFF

เมื่อเปิดผ่าน LIFF แอปเริ่ม SDK และแลก ID token ฝั่ง server อัตโนมัติ เพื่อไปหน้าหลักโดยไม่กดปุ่ม login ซ้ำ Native LIFF ไม่เรียก `liff.login()` ซึ่ง LINE ไม่รองรับใน client; การเปิดผ่าน external LIFF callback ใช้ redirect เมื่อจำเป็นและป้องกันการวนซ้ำ การเปิดเว็บปกติยังเลือก login/พื้นที่ตัวอย่างได้ Role และ service consent ตรวจจาก API เหมือนเดิม [LINE LIFF API reference](https://developers.line.biz/en/reference/liff/)

| ใช้สำหรับ | LIFF ID | Endpoint |
|---|---|---|
| เจ้าของ | 2010549060-FRfLt9mJ | https://www.chordjai.life/app |
| คลินิก | 2010549060-zCdRzv7e | https://clinic.chordjai.life/app |
| หลังบ้าน | 2010549060-g72pN0tY | https://admin.chordjai.life/app |

อ่าน LINE API วันที่ 10 ตุลาคม 2026 ยืนยันว่าอีก 4 LIFF ยังใช้ระบบเดิม: `2010549060-HR59RjAB` → `https://bdi-lac.vercel.app/liff/rights`, `2010549060-e46gh3VK` → `https://bdi-lac.vercel.app/liff/chat`, `2010549060-qw3AtH89` → `https://bdi-lac.vercel.app/liff`, `2010549060-udZ8HSKV` → `https://bdi-lac.vercel.app/liff/documents` ตารางครบทั้ง 7 อยู่ใน [DEPLOYMENT_DIAGNOSIS.md](DEPLOYMENT_DIAGNOSIS.md) ยังไม่ได้ย้ายระบบเดิมเหล่านี้

ตั้ง View full, scope openid+profile และ Add friend normal ทั้งสามอยู่ใต้ Login channel2010549060 ส่วน Messaging channel2009341751 ต้องอยู่ providerเดียวกันเพื่อให้userIdตรงกัน LIFFของLogin channelนี้เป็นLIFFธรรมดา ไม่ได้เปลี่ยนเป็นverified MINI Appอัตโนมัติ หากต้องการMINI Appต้องสร้างchannelและผ่านเงื่อนไขLINEแยก

ตรวจว่า Login channel เชื่อม Linked LINE Official Account ของ Messaging channel2009341751 แล้ว ระบบตรวจfriendshipฝั่งserverตอนloginเพื่อรองรับคนที่เป็นเพื่อนOAก่อนสมัคร หากตรวจไม่ได้จะคงสถานะเดิมจากwebhook [LINE Login linked bot](https://developers.line.biz/en/docs/line-login/link-a-bot/)

Bot info ที่อ่านจากchannelนี้คือ **RooSook - รู้สุข (@223xkgws)** ตั้ง `NEXT_PUBLIC_LINE_OA_URL` ในownerให้เป็นลิงก์จริงแล้ว ดู config/line-bot.json ชื่อOAยังเป็นชื่อเดิมของบัญชี

Webhookใหม่คือ **POST https://www.chordjai.life/api/v1/notification/webhooks/line** owner-app rewriteไปbackendที่ **https://api.chordjai.life/api/v1/notification/webhooks/line** (เลือกURLใดURLหนึ่งเป็นwebhookในLINEได้)

การเรียกMessagingออกจากระบบใช้ LINE endpoint `https://api.line.me/v2/bot/message/reply` และ `/push` พร้อมChannel access tokenฝั่งserver LINEตรวจraw request HMACก่อนJSON parse และเก็บevent+enqueueในtransactionก่อนตอบ200 งานซ้ำไม่สร้างผลซ้ำ

สถานะการตั้งค่าจริงอ่านได้ใน `docs/LINE_SETUP_STATUS.json` สคริปต์ไม่พิมพ์ token ถ้าคัดลอก tokenอายุ30วันจากlocalenvไปVercel ให้คัดลอก `LINE_TOKEN_EXPIRES_AT` ไปด้วย ระบบใช้tokenนั้นจนใกล้หมดอายุแล้วออก stateless token อัตโนมัติจาก Channel ID/secret โดยเก็บในruntime15นาที อีกทางหนึ่งเว้น `LINE_CHANNEL_ACCESS_TOKEN` ว่างเพื่อใช้statelessตั้งแต่แรก หากใช้long-lived tokenจากConsoleให้เว้นexpiryว่างและระบบจะไม่เปลี่ยนtokenนั้นอัตโนมัติ [LINE stateless access tokens](https://developers.line.biz/en/reference/messaging-api/nojs/#issue-stateless-channel-access-token)

```bash
npm run setup:line -- --apply-liff
# หลังdeployและrouteทดสอบผ่าน จึงย้ายwebhookที่ใช้งานอยู่:
npm run setup:line -- --apply-webhook
```

scriptตรวจrouteด้วยLINE-signedempty-eventก่อนเปลี่ยนwebhook ป้องกันรับข้อความลงURLที่ยังไม่พร้อม การเปิดUse webhook/ปิดauto-replyในOA Managerยังต้องตรวจConsoleหลังย้าย

## ลำดับ deploy

1. ฐานข้อมูลใหม่ใช้ Supabase bootstrap; ฐานข้อมูลเดิมตรวจและอัปเกรดเป็นรุ่น 16 → เติมbackendenv → สร้างprivateBlobsin1 → deploybackend สำหรับโปรเจกต์นี้ schema 16 พร้อมแล้ว ใช้ env เดิม
2. attach api.chordjai.life DNSตามค่าที่Vercelแสดง และลองpublicGET/api/v1/clinics (อาจได้[]จนเติมข้อมูลจริง)
3. deployowner+clinic+admin ตั้งAPI_ORIGINให้ถูกและattachdomains
4. ทดสอบLIFFจริง: login→pet→ไดอารี่→เรื่องการดูแล/ไปพบหมอ/ค่ารักษา/ติดตาม→สรุปที่เลือกและสิทธิ์คลินิก→ร่างความทรงจำ รวมสมุดวัคซีนและchat (หลังใส่APIkey)
5. เปลี่ยนLINEwebhookด้วยscript ตรวจVerifyสำเร็จและไม่มีDeploymentProtectionบล็อก
6. Vercel Cronที่กำหนดทุก1นาที/5นาทีต้องใช้planที่รองรับความถี่นี้ (เช่นPro) Cronส่งAuthorization Bearer CRON_SECRET, เวลาส่งdigestเช็กAsia/Bangkokและเงียบ21:00–08:00

## การตรวจรับก่อนเปิดใช้จริง

รันtypecheck/unit/DBintegration/build และตรวจบัญชีอื่นเข้าhealth/journal/memoryไม่ได้ ใช้SQL testsในDockerชั่วคราวไม่queryDBผู้ใช้ UIตัวอย่างไม่ยืนยันความพร้อมAIจริง ตรวจOCRกับสมุดจริง/ปีพ.ศ./วันEXP, LINEบนiOSAndroid, ปฏิทิน.ics, domain/DNS, Blobprivate/erasurejob, retryและcron ส่วนclinicaleval/ข้อมูลคลินิกจริงและprivacywordingยังต้องตรวจรับตามFEATURES.md

แหล่งอ้างอิง: [Vercel Services (Beta)](https://vercel.com/docs/services), [Services config](https://vercel.com/docs/services/config-reference), [Hono deployment](https://vercel.com/docs/frameworks/backend/hono), [LIFF Server API](https://developers.line.biz/en/reference/liff-server/), [LINE webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

## Dashboard รุ่น 25 (2026-10-30)

ผู้ใช้เป็นผู้รัน `supabase/upgrade.sql` เอง แล้วคัดลอกค่า backend จากไฟล์ส่วนตัว `local-secrets/dashboard-backend.env` เข้า Production ของ chordjai-backend และ redeploy เปิดที่ https://admin.chordjai.life/dashboard ไม่เพิ่ม repo หรือ Vercel project ใหม่ ไม่ใส่รหัสผ่านหรือ hash ใน NEXT_PUBLIC และไม่ต้องเปลี่ยน Supabase HTTPS URL/anon key ระบบ admin เดิมยังอยู่ `/app` ดูขั้นตอนและรหัสเข้าใช้ในไฟล์ส่วนตัวตาม [ADMIN_DASHBOARD.md](ADMIN_DASHBOARD.md)
