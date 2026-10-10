# ผลตรวจระบบ — 10 ตุลาคม 2026

- TypeScript ผ่าน backend/packages และหน้าบ้านทั้งสาม
- Production build ผ่าน owner-app (รวม invite), clinic-portal และ admin-console
- Unit tests 51 ข้อผ่าน: AI schema/budget/privacy, LINE signatures/token lifecycle/friendship verification, calendar, medical rules, media validation, queue lease handling และ PetID retrieval/vision fallback
- HTTP integration 19 flows ผ่านกับ PostgreSQL17/pgvector แยก โดยรันรอบสุดท้ายหลังปรับ UI, runtime dependencies และคำสั่ง AI สมุด วันที่ 10 ตุลาคม 2026 เวลา 11:52 น. (Asia/Bangkok): auth, idempotency, RLS, journal version, AI missing-key, memory consent, share revoke, appointments/grants, invitations, lost tips, followups, durable image erasure, webhook retention และ PetID privacy/owner confirmation/withdrawal
- PetID HNSW partial cosine indexสร้างและตรวจquery planในฐานข้อมูลทดสอบจริง พร้อมexact fallbackและLLMที่mockไว้ ผลนี้ยังไม่วัดความแม่นยำของรูปสัตว์จริง
- SQL security, HNSW index/query plan, concurrency และ upgrade tests ผ่านในรอบสุดท้ายเดียวกัน โดย bootstrap/upgrade ตรงกับ migrations; อัปเกรดจากรุ่น1/4/9/13/14และรันซ้ำรักษาแถวผู้ใช้ครบ ส่วน schema ที่ไม่ตรง/ไม่ครบและ checksum ที่ถูกแก้ถูกปฏิเสธโดยไม่เปลี่ยนข้อมูล CI สร้างและลบฐานข้อมูลชั่วคราวเอง
- Runtime dependency declarations ผ่านทั้ง 40 backend/package source files และ isolated production install ผ่าน 14 service entrypoints ทุก `/healthz` ตอบ 200 โดยไม่ติดตั้ง root dependencies หรือ dev dependencies เพื่อป้องกันปัญหา module ที่ local monorepo มีแต่ Vercel service bundle ขาด ไม่มีการต่อฐานข้อมูลหรือเรียก providers ในการตรวจนี้
- Owner browser smoke หลังปรับ Kindness & Kinship ผ่านทั้ง 6 เมนูบน desktop และ 390px: หน้าหลัก, สุขภาพ, ความทรงจำ, ผู้ช่วย, คลินิก/PetID และตั้งค่า เพิ่มบันทึกน้ำหนักและคัดกรองสัญญาณฉุกเฉินในข้อมูลตัวอย่างได้ ลากข้อความ/ย้ายด้วยลูกศร/บันทึก/เปิดกลับมาได้ การใช้ AI ในโหมดตัวอย่างระบุขอบเขตอย่างชัดเจน ตั้งบุคลิกและเพิ่มความจำเมื่อยินยอมได้
- Owner public routes ผ่าน: landing/login/privacy/terms/AI-safety, ลิงก์แชร์และประกาศที่ไม่พบข้อมูล, invitation, emergency ออฟไลน์หลังเปิดครั้งแรก และผู้พบที่ยังไม่มีสัตว์ในบัญชีเปิดค้น PetID ได้ ทุกหน้าที่ตรวจใช้ Sarabun ภาพในหน้าจอโหลดจาก local assets ไม่มี emoji ตกแต่งหรือ horizontal overflow และไม่มี browser pageerror
- Clinic/Admin browser smoke ผ่านด้วย API fixtures ที่ระบุชัดเจน: คลินิกเปลี่ยนสถานะนัดแล้วอ่านประวัติที่มีสิทธิ์, memberships/logout; admin ค้น AI request, replay job และเพิ่มคลินิก ทุกเมนูตรวจที่ 390px ไม่มี overflow หรือ pageerror และเมนู active ยังมองเห็นได้ ข้อมูลในภาพ workspace เป็นข้อมูลทดสอบ ไม่ใช่ข้อมูลคลินิกหรือผู้ใช้จริง
- หน้า public SSR เมื่อมีข้อมูลตรวจด้วย API fixtures ที่ bind เฉพาะ loopback: สรุปสุขภาพ/ประกาศหายทั้ง desktop 1440px และ mobile 390px พร้อมส่งเบาะแสจำลองผ่าน frontend rewrite แล้วเห็น success ไม่มี overflow, ภาพเสีย หรือ pageerror หยุด fixture server หลังตรวจ ไม่ได้สร้างประกาศหรือส่งข้อความจริง
- npm audit ไม่พบช่องโหว่ใน dependencies ณรอบตรวจนี้
- LINE API อ่านกลับยืนยัน endpoint ทั้ง 7 LIFF: 3 ตัวชี้ ChordJai และอีก 4 ตัวยังชี้ระบบเดิม ไม่ได้เปลี่ยนค่า LINE ในการตรวจรอบนี้ ดู `DEPLOYMENT_DIAGNOSIS.md`; secretsอยู่ในignoredไฟล์permissions600 และตรวจไม่พบในไฟล์ที่จะนำเข้าGit

การตรวจอัตโนมัติรอบ UI นี้ใช้ localhost กับข้อมูลตัวอย่าง/fixtures ไม่ได้ล็อกอิน LINE จริง เรียก OpenAI จริง หรือรัน SQL บน Supabase ของผู้ใช้ ผลทดสอบไม่ยืนยันความแม่นยำทางคลินิก การใช้งานบน LINE/iOS/Androidจริง หรือ FMR/FNMR ของ PetID การตรวจ deployment เดิมเป็น read-only และพบ/แก้ missing runtime dependency ใน source แล้ว ต้องตรวจ production HTTP อีกครั้งหลัง deploy commit ที่แก้ไข ดู `DEPLOYMENT_DIAGNOSIS.md` และส่วนที่ยังต้องตรวจรับใน FEATURES.md

```bash
npm run typecheck
npm test
npm run build
npm run test:db -- --http
node scripts/check-runtime-dependencies.mjs
node scripts/test-runtime-startup.mjs
# ต้องมี owner-app local ที่ localhost:3000 และ Playwright chromium
npm run test:ui
# ต้องมี clinic/admin local ที่ localhost:3001/3002 และ Playwright chromium
node scripts/test-portals-ui.mjs
```
