# ผลตรวจระบบ — 10 ตุลาคม 2026

## สมุดหลายหน้า / Story / PetID หลายรูป / LIFF — 12 ตุลาคม 2026

- Workspace TypeScript และ production builds ของ Owner/Clinic/Admin ผ่าน; ตรวจ runtime dependency และ isolated production install ครบ14Services ผ่าน
- Unit/provider/SDK mocks: **133 passed**; isolated PostgreSQL HTTP: **45 passed** รวม10-page OCR, วันที่จริง/วันนัด, ยืนยันและ retry ไม่ซ้ำ, cover/page/order/version/export/RLS, PetID1–5รูป/6รูปถูกปฏิเสธ/ร่างแก้ได้/หนึ่งเวกเตอร์/ถอนทะเบียน และ identify ใช้รูปผู้พบ1รูป+รูปอ้างอิง5รูป
- Database security/HNSW/queue/concurrency suite ผ่าน; safe upgrade จากรุ่น1/4/9/13/14/15 ไป15และรันซ้ำรักษาข้อมูล sentinel เดิม ปฏิเสธ schema drift, unrelated users และ checksum ที่ถูกเปลี่ยน
- การลบรูป PetID ระหว่างสร้าง embedding และ transaction ลบรูปที่ยังไม่ commit ถูกจำลองด้วย PostgreSQL จริง: registration รอ lock แล้วปฏิเสธรูปที่ถูกลบ ไม่เผยแพร่เวกเตอร์ใหม่จากรูปนั้น การลบรูปรองของทะเบียนเดิมล้าง signature/vector และหยุด gallery eligibility
- Date ของ Story คืนค่า `YYYY-MM-DD` โดยไม่ผ่านการแปลง PostgreSQL DATE เป็น timestamp ในเขตเวลาของ host ตรวจทั้ง POST/GET/PATCH/export จึงไม่เลื่อนไปวันก่อนหน้า
- Browser fixtures: สะสม/เรียง/ลบ10หน้าก่อนประมวลผล1ครั้ง, กล่อง3bulletและรายละเอียดเฉพาะที่เปิดดูได้, ดูหน้าต้นฉบับ, แก้วัน, ยืนยันและบันทึกต่อหลัง503 ผ่าน390/1440px
- Browser Story: แต่งปก/เพิ่ม2หน้า/อ่านเต็มจอ/ก่อนหน้า–ถัดไป/วันที่–สถานที่/save–reload, resizeด้วยปุ่ม/มุม/สองนิ้วรักษาสัดส่วน, ไม่มีช่องขนาดตัวเลข, dirty guard/สลับภาษา/thumbnail/ Escapeและfocusreturn ผ่าน โดยทั้งcanvasและปุ่มอ่านอยู่ใน390×844ไม่ต้องเลื่อน
- Browser PetID: สูงสุด5รูป, กดGenerateก่อน, แก้จุดสังเกต, เปลี่ยนรูปทำให้ต้องตรวจใหม่, draft ticket, keyคงเดิมเมื่อ503retry, update/withdraw/finder/ownerconfirmation ผ่าน; portalทั้งสองยังผ่านโฟลว์เดิมในไทย/อังกฤษ
- LIFF SDK mocks14ข้อผ่าน: nativeauto/manualไม่เรียกunsupportedlogin, externalcallback/redirectloop, concurrent401ใช้การrenewครั้งเดียว, public/403ไม่เริ่มlogin, logoutยกเลิกpendinglogin/APIresponse และmanualloginใหม่ไม่ถูกผลเก่าทับ
- ผู้ใช้อนุญาตให้อัปเกรด Supabase จริงแล้ว: `npm run db:upgrade` สำเร็จ **15 migrations** และ read-only diagnostic ตรวจ fingerprintรุ่น15ตรงกับ manifest ข้อมูล credentials/ผู้ใช้ไม่ถูกพิมพ์ในการตรวจ

Functional AI/Blob/LINE fixtures ไม่เรียกผู้ให้บริการจริงและไม่ส่งข้อความหาผู้ใช้ การตรวจนี้ยังไม่แทนการทดสอบ LINE/iOS/Android จริงหรือวัดความแม่นยำของ AI/PetID ภาพหลักฐานอยู่ใน `.verification/`; source และสคริปต์ทดสอบอยู่ใน Git

- TypeScript ผ่าน backend/packages และหน้าบ้านทั้งสาม
- Production build ผ่าน owner-app (รวม invite), clinic-portal และ admin-console
- Unit tests 73 ข้อผ่าน: AI schema/budget/privacy, LINE signatures/token lifecycle/friendship verification, calendar, medical rules, media validation, queue lease handling, PetID retrieval/vision fallback, safe infrastructure diagnostics 11 ข้อ (ไม่ส่งข้อความ/URL/SQL/ข้อมูลส่วนตัวลง log) และ scoped verified TLS/pg parser 11 ข้อ
- HTTP integration 19 flows ผ่านกับ PostgreSQL17/pgvector แยก โดยรันรอบสุดท้ายหลังปรับ UI, runtime dependencies, diagnostics และ scoped TLS วันที่ 10 ตุลาคม 2026 เวลา 12:11 น. (Asia/Bangkok): auth, idempotency, RLS, journal version, AI missing-key, memory consent, share revoke, appointments/grants, invitations, lost tips, followups, durable image erasure, webhook retention และ PetID privacy/owner confirmation/withdrawal
- PetID HNSW partial cosine indexสร้างและตรวจquery planในฐานข้อมูลทดสอบจริง พร้อมexact fallbackและLLMที่mockไว้ ผลนี้ยังไม่วัดความแม่นยำของรูปสัตว์จริง
- SQL security, HNSW index/query plan, concurrency และ upgrade tests ผ่านในรอบสุดท้ายเดียวกัน โดย bootstrap/upgrade ตรงกับ migrations; อัปเกรดจากรุ่น1/4/9/13/14และรันซ้ำรักษาแถวผู้ใช้ครบ ส่วน schema ที่ไม่ตรง/ไม่ครบและ checksum ที่ถูกแก้ถูกปฏิเสธโดยไม่เปลี่ยนข้อมูล CI สร้างและลบฐานข้อมูลชั่วคราวเอง
- Runtime dependency declarations ผ่านทั้ง 43 backend/package source files และ isolated production install ผ่าน 14 service entrypoints ทุก `/healthz` ตอบ 200 โดยไม่ติดตั้ง root dependencies หรือ dev dependencies เพื่อป้องกันปัญหา module ที่ local monorepo มีแต่ Vercel service bundle ขาด ไม่มีการต่อฐานข้อมูลหรือเรียก providers ในการตรวจนี้
- PostgreSQL STARTTLS probe แบบไม่ส่ง auth/SQL ตรวจ official Supabase CA และ hostname ผ่านกับ pooler host ที่ผู้ใช้ให้มา (verify return code 0) ส่วน DB authentication/schema ของ production ต้องตรวจผ่าน backend HTTP หลัง deploy ดู DEPLOYMENT_DIAGNOSIS.md
- Owner browser smoke หลังปรับ Kindness & Kinship ผ่านทั้ง 6 เมนูบน desktop และ 390px: หน้าหลัก, สุขภาพ, ความทรงจำ, ผู้ช่วย, คลินิก/PetID และตั้งค่า เพิ่มบันทึกน้ำหนักและคัดกรองสัญญาณฉุกเฉินในข้อมูลตัวอย่างได้ ลากข้อความ/ย้ายด้วยลูกศร/บันทึก/เปิดกลับมาได้ การใช้ AI ในโหมดตัวอย่างระบุขอบเขตอย่างชัดเจน ตั้งบุคลิกและเพิ่มความจำเมื่อยินยอมได้
- Owner public routes ผ่าน: landing/login/privacy/terms/AI-safety, ลิงก์แชร์และประกาศที่ไม่พบข้อมูล, invitation, emergency ออฟไลน์หลังเปิดครั้งแรก และผู้พบที่ยังไม่มีสัตว์ในบัญชีเปิดค้น PetID ได้ ทุกหน้าที่ตรวจใช้ Sarabun ภาพในหน้าจอโหลดจาก local assets ไม่มี emoji ตกแต่งหรือ horizontal overflow และไม่มี browser pageerror
- Clinic/Admin browser smoke ผ่านด้วย API fixtures ที่ระบุชัดเจน: คลินิกเปลี่ยนสถานะนัดแล้วอ่านประวัติที่มีสิทธิ์, memberships/logout; admin ค้น AI request, replay job และเพิ่มคลินิก ทุกเมนูตรวจที่ 390px ไม่มี overflow หรือ pageerror และเมนู active ยังมองเห็นได้ ข้อมูลในภาพ workspace เป็นข้อมูลทดสอบ ไม่ใช่ข้อมูลคลินิกหรือผู้ใช้จริง
- หน้า public SSR เมื่อมีข้อมูลตรวจด้วย API fixtures ที่ bind เฉพาะ loopback: สรุปสุขภาพ/ประกาศหายทั้ง desktop 1440px และ mobile 390px พร้อมส่งเบาะแสจำลองผ่าน frontend rewrite แล้วเห็น success ไม่มี overflow, ภาพเสีย หรือ pageerror หยุด fixture server หลังตรวจ ไม่ได้สร้างประกาศหรือส่งข้อความจริง
- npm audit ไม่พบช่องโหว่ใน dependencies ณรอบตรวจนี้
- LINE API อ่านกลับยืนยัน endpoint ทั้ง 7 LIFF: 3 ตัวชี้ ChordJai และอีก 4 ตัวยังชี้ระบบเดิม ไม่ได้เปลี่ยนค่า LIFF ในการตรวจรอบนี้ ดู `DEPLOYMENT_DIAGNOSIS.md`; secretsอยู่ในignoredไฟล์permissions600 และตรวจไม่พบในไฟล์ที่จะนำเข้าGit
- หลัง API พร้อมใช้งาน ย้าย Messaging webhook ตามคำขอตั้งค่า LINE ไป `https://www.chordjai.life/api/v1/notification/webhooks/line` อ่านกลับยืนยัน active และ LINE Webhook Test API ยืนยัน success/HTTP200 ไม่ได้ส่งข้อความหาผู้ใช้จริง
- Production commit b088cd7 ขึ้น READY ทั้ง 4 projects และ GitHub CI ผ่าน `/api/v1/clinics` ตอบ HTTP200 data[] ผ่าน direct API และ frontend proxies ทั้งสาม `/api/v1/pets` ไม่ล็อกอินตอบ HTTP401 UNAUTHORIZED การเชื่อม DB/TLS และ API_ORIGIN ผ่านแล้ว รายชื่อคลินิกยังต้องเติมข้อมูลจริง

การตรวจอัตโนมัติรอบ UI นี้ใช้ localhost กับข้อมูลตัวอย่าง/fixtures ไม่ได้ล็อกอิน LINE จริง เรียก OpenAI จริง หรือรัน SQL บน Supabase ของผู้ใช้ การตรวจ production เพิ่มเติมครอบคลุม public API/auth boundary และ LINE webhook ตามที่บันทึกไว้ข้างต้น ผลทดสอบยังไม่ยืนยันความแม่นยำทางคลินิก การใช้งานบน LINE/iOS/Androidจริง หรือ FMR/FNMR ของ PetID ดู `DEPLOYMENT_DIAGNOSIS.md` และส่วนที่ยังต้องตรวจรับใน FEATURES.md

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

## Bright orange + Mitr + Thai/English refinement (10 October 2026)

- Unit: 84 passed, 19 isolated HTTP tests skipped without TEST_DATABASE_URL. Locale tests cover regional/quality preferences, exact navigation query preservation, English medical warnings and selected-language PetID explanations with provider mocks.
- Disposable PostgreSQL: security/RLS/consent/erasure/queue/rate-limit/HNSW and safe-upgrade checks passed; 19 HTTP integration tests passed with an explicit English emergency request and follow-up recommendation. No production database changes.
- All three frontend production builds and workspace TypeScript checks pass. Shared SSRlocale, metadata, language query/cookie and Mitr assets compile with Next16.4.
- Portal fixture UI: Thai and English logins and all7workspace tabs, native validation, dates/statuses, role/grant error language, form/checkbox/tab/notice preservation on switches, authorized handlers and 390px layouts pass. No real LINE/OpenAI calls.

Owner/public language and final visual results are recorded in root design-qa.md and the local UI runner output; no live AI quality claim is made without a configured API key.

- Owner fixture UI: all6features and PetID on desktop/mobile; Englishdemo, health and emergency results; Mitr/local images; health entry, journal drag/keyboard/save/reload, memory/personality, collaboration/invite and unsavedjournal text/positions across language switches passed.
- Public locale UI: marketing and all7public routes in bothlanguages; full SSRlang/metadata and direct ?lang links; original pet/clinical content preserved; tip submit/draft switching; 390px; bothlanguage offline emergency reloads passed. Four actualserviceworker unitcases prevent cookie-dependent/RSC/private cache pollution.
- Independent review corrected remaining PetID Thai notice for English requests and separated localized photo-quality explanations from stable Englishvector facets. Added English spelled-dose backstop regression cases. These checks are mockedprovider/isolatedDB evidence, not clinicalvalidation.
