# ChordJai — ไดอารี่ดูแลและความทรงจำของน้อง

รุ่น pilot ที่รันได้จากรายละเอียด `SYSTEM_DESIGN.md` และ `REQUIREMENTS_ANALYSIS.md` พร้อมสมุด drag and drop/AI decorate และ AI chat ที่มี memory ใช้ OpenAI SDK + Responses API โมเดล `gpt-6.1-sol` ทุกงานสร้างข้อความ/อ่านภาพ และ `text-embedding-3-small` เฉพาะการสร้างเวกเตอร์

แกน B2C คือ **ไดอารี่ดูแลน้อง** ในสมุดสุขภาพ: เล่าเรื่องประจำวัน อาการ การพบหมอ ค่าใช้จ่าย และการติดตามที่เชื่อมเป็นเรื่องเดียว แยกความรู้สึกส่วนตัวจากข้อมูลคลินิกที่เลือกแชร์ และส่งข้อความ/รูปที่เลือกไปแต่งเป็นหน้าความทรงจำได้ ดูงานวิจัย แผนธุรกิจคลินิก/PetID และขอบเขตที่พัฒนาแล้วใน [docs/CORE_PRODUCT_STRATEGY.md](docs/CORE_PRODUCT_STRATEGY.md)

เพิ่ม [คลังภาพ PetID ต่างช่วงเวลาและสิทธิ์ฝึกโมเดลแยก](docs/PETID_DATASET.md) และ [LINE follow-up แบบเลือกเปิดรับ](docs/PERSONALIZED_FOLLOWUPS.md) ซึ่งใช้ข้อมูลที่เจ้าของเลือกเพื่อถามต่ออย่างพอดี ทั้งสองฟีเจอร์ใช้ migration 17–18

## เริ่มดูระบบ

```bash
npm ci
npm run dev:owner
```

เปิด `http://localhost:3000` → **เปิดแอป → ลองดูพื้นที่ตัวอย่างก่อน** ใช้ drag and drop และบันทึกตัวอย่างในเบราว์เซอร์ได้ทันที โหมดตัวอย่างมีป้ายระบุชัด งาน AI และธุรกรรมจริงต้องเชื่อมต่อ API

## เชื่อมระบบจริง

1. ฐานข้อมูลใหม่รัน [supabase/bootstrap.sql](supabase/bootstrap.sql) ใน Supabase SQL Editor **ครั้งเดียว** ไฟล์รวมสร้างตาราง/roles/RLS/functions/pgvector โดยแต่ละ migration มี transaction ของตัวเอง ถ้ามีตารางจาก ChordJai รุ่นก่อนแล้ว ให้รัน [supabase/diagnostic.sql](supabase/diagnostic.sql) เพื่อตรวจสถานะ แล้วใช้ [supabase/upgrade.sql](supabase/upgrade.sql) ซึ่งตรวจโครงสร้างเดิมและเพิ่มเฉพาะ migration ที่ขาดใน transaction เดียว ห้ามรัน bootstrap ซ้ำ
2. ใช้ connection string Supabase transaction pooler พอร์ต 6543 ผ่าน backend `DATABASE_URL` บัญชี DB ต้องมีสิทธิ์ `SET ROLE chordjai_app/chordjai_worker` ตาม bootstrap ไม่ต้องใช้ Supabase browser key
3. เติมค่าที่เว้นไว้ใน `backend/.env.local` ตาม [backend/.env.example](backend/.env.example) มี LINE secrets ที่ให้มาและ application/cron secrets ที่สร้างแล้วในไฟล์ local ซึ่ง Git ignore และ chmod600
4. คัดลอก `.env.example` ของแต่ละ frontend เป็น `.env.local` แล้วตั้ง `API_ORIGIN=http://localhost:8787` สำหรับ local
5. รัน `npm run dev` เพื่อเปิด API+owner, `npm run dev:clinic` หรือ `npm run dev:admin` เพื่อเปิด portal

ยังไม่เรียก OpenAI จริงตามที่ผู้ใช้เลือกให้ใส่ API key ภายหลัง การทดสอบใช้ PostgreSQL/pgvector แยกต่างหาก ส่วน Supabase ของโครงการอัปเกรดถึง migration 18 และตรวจ fingerprint แล้ว โดยไม่สร้างบันทึกผู้ใช้ทดสอบใน production

## Git และ Vercel

**สร้าง Git repository เดียวชื่อ `chordjai` แล้วเชื่อมกับ Vercel 4 projects** ไม่ต้องสร้าง repo ต่อ microservice:

| Vercel project | Root Directory | Domain |
|---|---|---|
| chordjai-owner-app | frontend/owner-app | www.chordjai.life |
| chordjai-clinic-portal | frontend/clinic-portal | clinic.chordjai.life |
| chordjai-admin-console | frontend/admin-console | admin.chordjai.life |
| chordjai-backend | backend | api.chordjai.life |

Backend มี 13 microservices API และ scheduler รวม 14 Vercel Services ใช้ SQL queue ที่ durable ใน Supabase และ Cron เรียก worker ผ่าน private binding รุ่นนี้ยังไม่ย้ายไป Vercel Queues 43 topics/23 workers ตามแผนเดิม Vercel Services ยังเป็น Beta

คู่มือ env/deploy/LINE/การทดสอบอยู่ใน [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) และรายการฟีเจอร์ทั้งหมดกับสถานะเทียบ32requirementsอยู่ใน [docs/FEATURES.md](docs/FEATURES.md)

วิธีทำงานและขอบเขตของ Pet Biometrics แบบvector+LLMอยู่ใน [docs/PETID.md](docs/PETID.md)

ดีไซน์ใช้ส้มสดใสและ Mitr ทั้งสาม frontend พร้อมตัวเลือกภาษาไทย/อังกฤษ พร้อมภาพสัตว์จริงจาก Google Images/Unsplash และภาพหน้าจอแอปจริง ดู [แนวทางออกแบบ](docs/DESIGN_DIRECTION.md), [เครดิตภาพ](docs/IMAGE_SOURCES.md), [ผลตรวจดีไซน์](design-qa.md) และ [การตรวจ domain/LIFF/API](docs/DEPLOYMENT_DIAGNOSIS.md)

## ตรวจงาน

```bash
npm run typecheck
npm test
npm run build
npm run test:db
npm run test:db -- --http
# เปิด owner-app local ก่อน แล้วติดตั้ง browser ครั้งแรกด้วย npx playwright install chromium
npm run test:ui
node scripts/test-portals-ui.mjs
node scripts/test-care-diary-ui.mjs
node scripts/check-runtime-dependencies.mjs
node scripts/test-runtime-startup.mjs
```

`test:db` ต้องมี Docker และสร้าง Postgres/pgvector ชั่วคราวของตัวเอง ไม่ใช้ฐานข้อมูลผู้ใช้ รวมการทดสอบอัปเกรดและ HNSW query plan เพิ่ม `--http` เพื่อรัน 68 API integration tests ในฐานข้อมูลชั่วคราวเดียวกัน สำหรับฐานข้อมูลทดสอบ local ที่มี schema อยู่แล้ว ใช้ `TEST_DATABASE_URL` ที่ชี้ localhost เท่านั้น:

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:TEST_PORT/postgres npm test
```

ขอบเขตนี้ยังต้องเติมรายชื่อคลินิกที่ตรวจแล้ว, ตรวจบน LINE/มือถือจริง, ทดสอบ OpenAI กับบัญชีจริง และผ่าน clinical eval/การตรวจของสัตวแพทย์ก่อนเปิดผลคัดกรองให้ผู้ใช้วงกว้าง ไม่อ้างว่าครบ162APIหรือผ่านความแม่นยำ85%แล้ว
