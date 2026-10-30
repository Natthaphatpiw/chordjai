# Owner onboarding and persistent sessions — 2026-10-31

Implementation in the current checkout, not yet a production release:

- Three primary owner views: Today, Records and My pet. Adding a pet needs a name and an explicit species choice. The first story composer starts with narrative, optional photos and today's editable date; the existing medical, cost, reflection and sharing fields are disclosed on request.
- Optional `care.organize` returns exact-text suggestions without writing records or sending private reflections/photos. Owner review, source/version checks, payment-status selection, budget accounting and explicit final save remain required.
- Owner sessions use an opaque HttpOnly cookie for up to 30 days. SID-bound one-hour JWTs are revoked with the session. Concurrent restore requests avoid LINE SDK/verification; initial login returns scoped bootstrap and defers friendship checks. No required new env vars.
- `npm run check` passed: all workspace TypeScript checks, **354 unit tests**, and production builds for Owner, Clinic and Admin. DB-dependent tests are intentionally skipped by that command and verified separately.
- Disposable PostgreSQL `run-local.sh --http` passed security/consent/erasure/queue/rate-limit SQL, concurrency, known-prefix and compact 26→27→27 upgrade preservation, plus **268 API/DB tests across 23 suites** at that run. After additional session cap, Secure-cookie and privileged-role coverage, the changed integration suites passed **48 tests across 4 suites**. These counts overlap; do not add them as separate unique test totals.
- A real local HTTP check through Next's API rewrite restored a synthetic owner with scoped bootstrap (200, private/no-store), rejected a foreign Origin (403), cleared the cookie on logout (200), and rejected the previously issued bearer (401). One warm localhost restore sample was 58 ms, not a production or mobile performance benchmark.
- Computer Use QA exercised a new demo pet → first story → save, optional photo → memory-page draft → save, English UI, Passport entry, ten-page booklet collector, direct PetID entry, and responsive layouts at 320/390/1280 px. Empty required date fields inside a closed disclosure are revealed and focused by native validation. No horizontal overflow at the checked widths and no console errors after the final fresh load. Session/API tests used mock LINE proofs and disposable data; browser checks used local demo. Actual LINE device timings remain to be measured.
- Ignored evidence: `.verification/onboarding-build/` and `.verification/onboarding-20261031/`, including Thai mobile composer `05-compose-th.png`, Today `04-today-th.png`, English Today `03-today-en.png` and desktop `06-desktop.png`.
- Production diagnostic was read-only and still matched **schema 26**, fingerprint `0dc0475b0ea973d0c9250b37565d64aa`. Schema 27's expected fingerprint is `9720c27f20983692910505835aaf6e6f`. No production migration, owner health-record write, LINE message, push or deployment was performed for this change. The owner is running SQL themselves; use `supabase/upgrade-26-to-27.sql`, not bootstrap, before releasing persistent login.

Details and release steps: [ONBOARDING_AND_SESSIONS.md](ONBOARDING_AND_SESSIONS.md).

# Compact SQL upgrade verification — 2026-10-30

- The reported `42601` at the end of the full upgrade was not reproduced using the complete local file. Sending the whole file in one `pg.Client.query()` succeeded twice, including 25→26 and an already-applied 26.
- Added generated `supabase/upgrade-25-to-26.sql`: 233 lines, verified source checksums unchanged. Both tracked and untracked exact schema 25 upgrade to 26, rerun, and agree with the full bundle. Sentinel owner, pet, care entry and dated 414.00 THB expense remain intact.
- The compact file also passes as one PostgreSQL query, rejects schema 24, schema drift and conflicting checksums before DDL, and serializes correctly when raced against the full packet. An intentionally incomplete outer block is rejected without mutating schema 25.
- Existing full upgrade/security gate regression checks pass. No production SQL or deployment was performed.

# Input protection verification — 2026-10-30

Implementation: GPT-6 Luna LLM0, silent off-topic LINE filtering before ACK/Agent handoff, exact per-owner/context classification cache with distributed leases, signed-source duplicate/burst/day limits, authenticated API quotas, hard DB insert/storage quotas, limited uploads, bounded JSON and sampled 4xx logs. Main model remains GPT-6.1 Sol.

- 340 unit tests passed.
- 252 HTTP/database integration tests passed across 21 suites on disposable PostgreSQL, including 19 dedicated input-protection cases. Together with the 340 unit tests, 592 automated cases passed. PAUSE with an exhausted daily quota and oversized JSON are covered.
- Upgrade/security/concurrency suites passed, including 25→26→26 preservation and drift/checksum rejection. Generated SQL files pass consistency checks.
- TypeScript across all workspaces and production admin build passed.
- Browser: real local analytics API and isolated PostgreSQL, synthetic owners only. Thai dashboard shows the classification cache counter and the added input.classify filter. Screenshot: ignored `.verification/dashboard/input-protection-th.png`.
- OpenAI and LINE providers are mocked in integration checks. No paid API request, production SQL/env/deployment, real user message or Firewall change was made. Semantic classifier accuracy and production load are not inferred from these tests.

Prior release verification follows.

# Dashboard รุ่น 25 — 2026-10-30

334 unit + 233 isolated database/API checks ผ่าน พร้อม SQL security/concurrency และอัปเกรด 24→25→25 เก็บข้อมูลเดิม ทั้ง 3 frontend build และ workspace TypeScript ผ่าน ตรวจ browser ด้วยบัญชีทดสอบแยก ครบ login → ข้อมูล → filter/search → รายละเอียด → logout รายงานหลักฐานและขอบเขตที่ [ADMIN_DASHBOARD_QA.md](ADMIN_DASHBOARD_QA.md) การเปิดใช้งานจริงรอผู้ใช้รัน SQL และตั้ง backend env ตาม [ADMIN_DASHBOARD.md](ADMIN_DASHBOARD.md)

---

# ผลตรวจระบบ — อัปเดต 29 ตุลาคม 2026

## วันที่ค่าใช้จ่ายแบบไม่บังคับ — 29 ตุลาคม 2026

- เพิ่ม `expenseDate` ต่อค่าใช้จ่าย แยกจากวันไดอารี่ ทั้ง Care Diary, Passport หลังพบหมอ, ประวัติ สรุป/พิมพ์ที่อนุญาต และ personal export วันที่ว่างเป็น `null` ไม่เดาวันให้ข้อมูลเก่า แก้/ล้างได้โดยรักษายอดและสกุลเงิน
- **329 unit + 222 isolated PostgreSQL/API บน schema 24 + 4 API compatibility บน schema 23 = 555 ข้อผ่าน** รวมวันที่ปฏิทินจริง/ปีศูนย์ถูกปฏิเสธ, วันค่าใช้จ่ายต่างจากวันไดอารี่, retry เดิมไม่ซ้ำ, legacy canonical hashes, แก้/ล้างวัน, export วันที่ล้วน, cost-sharing opt-in และเพิกถอน snapshot ที่อ้างวันที่เก่า
- SQL และ known-prefix upgrades ผ่าน รวม **23→24→24** และ 24 รันซ้ำ รักษาข้อมูลผู้ใช้/ยอดค่าใช้จ่ายเดิมและวันที่ `NULL` manifest และ migration 1–23 ไม่เปลี่ยน Fingerprint รุ่น 24 คือ `920e7c3673511ed3914d17fc6f094a71`
- จำลอง Agent retry ที่ข้าม release แล้วพบ raw HTTP idempotency hash เปลี่ยนเพราะ default date เป็น null แก้เฉพาะสาม tools ที่เขียนค่าใช้จ่ายให้ละวันที่ว่างออกจาก HTTP body โดย backend ยังแปลเป็น null ได้ ตรวจ retry คำขอเก่าได้รายการเดิม และวันที่จริง/การล้างวันที่ยังทำงาน
- บนฐาน 23 โค้ดใหม่ยังอ่าน/บันทึกค่าใช้จ่ายที่ไม่ใส่วันที่และ export ได้ ส่วน dated create/PATCH ตอบ 503 และ rollback โดยรายการ/version/ข้อความ/ยอดเดิมไม่เปลี่ยน ไม่ทิ้งวันที่เงียบ ๆ
- Browser fixtures Owner/Care/Passport ผ่านเพิ่มวัน แก้/ล้างวันหลัง conflict/reload ไทย/อังกฤษ และ native date ว่างไม่ถูกเติมเอง; Clinic/Admin ผ่านการแสดงวันที่ที่ opt-in และสรุปพิมพ์ภาษาอังกฤษ ไม่มี overflow หรือ browser errors ตรวจภาพฟอร์มมือถือแล้ว
- Workspace TypeScript, production builds Owner/Clinic/Admin, runtime declarations **167 source files** และ isolated startup/healthz ทั้ง **14 services** ผ่าน แก้ test clock ของ follow-up ให้เวลา reminder digest ในฐานทดสอบตรงกับ simulated JS clock เมื่อรันทดสอบนอกเวลาส่ง ไม่มีการเปลี่ยนพฤติกรรม follow-up ใน production

SQL/env จริงยังเป็นงานของผู้ดูแลตามที่ตกลงไว้ ไม่รัน migration จริงหรือเขียนข้อมูลสุขภาพทดสอบใน production รายละเอียดไฟล์และขั้นตอนอยู่ใน [EXPENSE_DATES.md](EXPENSE_DATES.md) หลักฐาน ignored `.verification/expense-dates/`, `.verification/expense-*-ui.log` และภาพ `.verification/expense-date-form-mobile-*.png` การเปิดใช้ต้องตรวจ schema 24 ก่อน deploy UI วันที่

## ตรวจจริงรอบ 12:49 และแก้การ์ดที่มีแต่ยกเลิก — 29 ตุลาคม 2026

- Runtime log ของ event เดียวกับข้อความทดสอบยืนยัน LINE `read`, `ack`, `loading` สถานะ `accepted`; LLM0/Agent planner สำเร็จ การ์ดคำถามส่งสำเร็จ ฐานข้อมูลมีหนึ่ง task สถานะ `collecting` และยังไม่มี tool call จึงยังไม่อ้างว่าทดสอบการบันทึก/ไม่ซ้ำ/เปิด LIFF ในบัญชีจริงครบแล้ว
- เพิ่มปุ่มพิมพ์รายละเอียดที่เปิดคีย์บอร์ดสำหรับคำถามปลายเปิด ไม่มีคำตอบหรือข้อเท็จจริงสำเร็จรูปที่ระบบแต่งให้ การกดเปิดไม่เรียก LLM หรือบันทึก ไม่เปลี่ยน task/version และไม่ส่งข้อความกำลังทำงานเมื่อยังไม่มีคำตอบ ตรวจ owner/version/action/สิทธิ์ก่อนรับ control และปุ่มเก่าใช้เขียนข้อมูลไม่ได้
- ผ่าน **319 unit + 215 isolated DB/API = 534 ข้อ** รวมเปิดคีย์บอร์ดซ้ำแล้วรอคำถามเดิม พิมพ์คำตอบจริงจึงสร้างครั้งเดียว, ข้ามบัญชี/สลับ action ถูกปฏิเสธ และแปดตัวเลือกจากโมเดลไม่ทำให้ปุ่มพิมพ์/ยกเลิกหาย TypeScript, 166-source dependency checker และ isolated startup ของทั้ง 14 services ผ่าน
- LINE Message Validation API ตรวจ Flex card พร้อม `inputOption: openKeyboard` จริงแล้วตอบ HTTP 200 โดยไม่มี recipient และไม่ส่งข้อความหาผู้ใช้ ไม่แก้ SQL/env หรือประวัติสุขภาพจริง

รายละเอียดใน [LINE_AGENT_FEEDBACK.md](LINE_AGENT_FEEDBACK.md) หลักฐาน ignored `.verification/line-clarification/` และ scoped production trace ใน `.verification/line-feedback/` ผลหลังตอบรายละเอียดและเปิด LIFF ต้องตรวจต่อจากการกระทำจริงของผู้ใช้

## ข้อความจริงจาก LINE: Chat guard / รับแล้ว / loading / อ่านแล้ว — 29 ตุลาคม 2026

- Read-only trace ของข้อความที่ผู้ใช้รายงานยืนยัน `agent.normalize=ok, route=chat` → `assistant.chat=ok` → delivery `sent` ที่ตรงกับ fallback เรื่องยา ไม่มี Agent task หรือไดอารี่ใหม่จากข้อความนั้น การเล่าแผนโดยไม่ขอบันทึกเป็น Chat ถูกต้อง แต่ fallback กว้างเกินบริบท รายละเอียดใน [LINE_AGENT_FEEDBACK.md](LINE_AGENT_FEEDBACK.md)
- แก้ guard ที่จับการส่งต่อให้สัตวแพทย์เป็นคำสั่งใช้ยา และใช้ fallback ตามบริบทแผนดูแล/อาการจริง ยังปฏิเสธขนาดยา คำสั่งยาเอง และคำวินิจฉัยฟันธง; prompt รุ่น `2026-10-29.3`
- เพิ่ม read receipt หลัง signed webhook commit, ACK ผ่าน reply token ก่อน fast path และ native loading 60 วินาที เฉพาะแชทส่วนตัวที่รับเข้าคิวจริง ข้าม duplicate/เก่า/ไม่มีสิทธิ์ ไม่ส่ง paid Push ทดแทน reply ที่หมดอายุ และ feedback ล้มเหลวไม่ยกเลิกงาน
- **314 unit tests + 212 isolated PostgreSQL/API tests ผ่าน รวม 526 ข้อ** รวม Chat → explicit save → ถามเพิ่ม → ยืนยันชื่อน้องด้วยข้อความ → บันทึกแผนครั้งเดียว → ส่ง LIFF → ขอผลผ่าน API; provider ใช้ fixtures ไม่ส่งข้อความหรือสร้างประวัติทดสอบใน production
- Workspace TypeScript, runtime dependency checker **166 sources** และ isolated startup/healthz ทั้ง **14 services** ผ่าน ไม่มี frontend source หรือ SQL/env ใหม่ รอบ deploy ให้ใช้ Vercel builds ของ projects ที่เชื่อม Git เดิม
- เพิ่ม `line_feedback_stage` และ `line_agent_stage` ที่ log หลัง provider ยอมรับ/สถานะ commit แล้ว ใช้ reference ที่ hash ไม่เก็บข้อความ ชื่อ user/pet, LINE ID, รูป, URL, token หรือ tool arguments; `result_requested` ยืนยันการขอ API ที่ตรวจสิทธิ์แล้ว ไม่ใช่การรับรองหน้าจอแสดงผล

หลักฐานใน ignored `.verification/line-feedback/` รวม trace ข้อความเดิม ผลทดสอบ และสถานะ release หลัง push การทดสอบจริงรอบใหม่ต้องให้ผู้ใช้ส่งข้อความ/ตอบการ์ด/เปิด LIFF เอง จึงยังไม่อ้างว่าโฟลว์นั้นผ่านในบัญชีจริงจากผล fixtures

## แก้ไข/ลบบันทึก และ LINE Agent 55 tools — 29 ตุลาคม 2026

- **286 unit tests + 211 isolated PostgreSQL/API tests ผ่าน รวม 497 ข้อ** รวม Agent 44 ข้อและ health mutation 15 ข้อ ตรวจสิทธิ์ผู้เขียน/เจ้าของ/ครอบครัว, revision/version conflict, retry หลัง response หายไม่ทำงานซ้ำ และการยืนยันรายการปัจจุบันก่อนลบ
- Health record แก้/ลบแล้วปรับการเตือนข้ามผู้ดูแลร่วม คำนวณน้ำหนักล่าสุด และเพิกถอนสรุปเก่า; บันทึกต้นฉบับจากคลินิกนอกครอบครัวเป็น read-only สำหรับเจ้าของ การเปลี่ยน clinical/cost/media ที่แชร์ไว้ยกเลิกเฉพาะฉบับที่อ้างข้อมูลนั้น และลบกลุ่มแล้วยังเก็บไดอารี่พร้อมเพิ่ม version
- SQL/security/consent/erasure/HNSW/queue/concurrency และ known-prefix upgrades ผ่าน รวม **22→23→23** และ **23→23→23** รักษา sentinel เดิม ปฏิเสธ schema/checksum drift; manifest รุ่น 1–22 ไม่เปลี่ยน
- ผู้ดูแลแจ้งว่ารัน SQL รุ่น 23 แล้ว Read-only diagnostic ของ Supabase จริงยืนยัน **23 migrations** และ fingerprint `171c466a888ddd5fd7df4ab1f5055527` ไม่รัน migration หรือแก้ env จริงโดย agent
- Workspace TypeScript, production builds Owner/Clinic/Admin, runtime dependency checker **164 sources** และ isolated production install/startup ของทั้ง **14 services** ผ่าน ทุก `/healthz` ตอบ 200
- Browser fixtures ภาษาไทย/อังกฤษ 390px ผ่านการแก้/ยกเลิก/Escape/409/read-only/ลบ health record, แก้ชื่อและลบกลุ่มโดยเก็บไดอารี่, ลบ Passport โดยเก็บผลหลังพบหมอในไดอารี่, ลบ Story ตาม version และแก้/ลบ AI memory; Care Diary และ memory-book Story regression ผ่าน ไม่มี browser errors หรือ horizontal overflow ในหน้าที่ตรวจ
- ตรวจ Passport DELETE lost-response retry โดย cache เฉพาะผล `{deleted:true}` เส้นทาง Passport อื่นยังอ่านสิทธิ์และ source ปัจจุบันใหม่ทุกครั้ง; Agent จัดการ care episode ตาม ID ได้แม้รายการเก่าอยู่นอก 50 รายการล่าสุด
- Agent เพิ่มเป็น **55 tools: อ่าน 23, สร้าง 10, ต้องยืนยัน 22** ตรวจชื่อสัตว์/รายการ/วันที่จาก server ก่อนยืนยันลบ เก็บ prepared deletion receipt เพื่อกู้ผลหลัง transport failure และเปิดประวัติที่เหลือผ่าน LIFF หลังลบสำเร็จ ไม่ retry ฉบับที่ version conflict โดยอัตโนมัติ

หลักฐานอยู่ใน ignored `.verification/record-mutation-*` และ `.verification/record-mutations/` สคริปต์ UI คือ [`test-record-mutations-ui.mjs`](../scripts/test-record-mutations-ui.mjs) และ [`test-memory-mutations-ui.mjs`](../scripts/test-memory-mutations-ui.mjs) การทดสอบนี้ใช้ข้อมูลสังเคราะห์และ provider fixtures ไม่ส่ง LINE จริง ไม่เรียกโมเดลจริง และไม่สร้าง/แก้/ลบบันทึกพีโอนีใน production ผู้ใช้เลือกตรวจบทสนทนาจริงเองตาม [คู่มือแก้/ลบและข้อความทดสอบ](RECORD_MUTATIONS.md) สถานะ deploy จะบันทึกหลังตรวจ release commit แล้ว

## ตรวจ production และแก้ circular service binding — 29 ตุลาคม 2026

- ตรวจ deployment ของ commit `4350a03`: owner app ขึ้น READY แต่ backend `dpl_8x2ZzUwgwGgdRnG1B4vETXbDcw7L` ขึ้น ERROR รหัส `CIRCULAR_SERVICE_BINDING` พร้อมข้อความ `notification -> assistant -> notification`; API Agent บน custom domain ยังตอบ 404 จึงยังไม่ยืนยัน flow จริงหรือส่งข้อความทดสอบข้ามจุดที่เสีย
- แก้ด้วยการลบ assistant → notification binding และเรียก notification handler ภายใน process ด้วย worker auth เดิม การเก็บ follow-up reply ไม่พึ่ง reverse URL แล้ว ขณะที่ notification/scheduler → assistant และ scheduler → notification ยังคงอยู่ เพิ่ม regression ตรวจกราฟ bindings ไม่มีวงจร
- หลังแก้ **279 unit tests + 187 isolated DB/API tests ผ่าน รวม 466 ข้อ** รวมการเก็บ follow-up reply จริงในฐานแยกและ fallback ไป Chat เมื่อไม่มีรายการที่ตอบได้ Workspace TypeScript, dependency checker 163 sources และ isolated startup/healthz ทั้ง 14 services ผ่าน
- Read-only diagnostic บน Supabase ของโครงการยืนยัน **22 migrations** และ fingerprint `1fa6dec40eefeeea2f053758c500131c` หลังผู้ดูแลรัน SQL เอง ไม่มีการแก้ SQL/schema หรือข้อมูลผู้ใช้ในการตรวจนี้
- พบชื่อ `LINE_AGENT_ENABLED` และ `LINE_AGENT_LIFF_ID` ใน Production env ของ backend ผ่าน UI โดยไม่เปิด secrets; ยังไม่ใช้การมีชื่อตัวแปรแทนหลักฐานค่าที่ทำงานจริง การอ่าน env ผ่าน connector ถูกปฏิเสธ 403 และ UI ต้องยืนยันอีเมลก่อน reveal จึงไม่ได้ข้ามการตรวจนั้น

หลักฐานอยู่ใน ignored `.verification/line-agent-binding-*` และ `.verification/line-agent-live/` การตรวจส่งข้อความจากบัญชี LINE จริงและเปิด LIFF ยังต้องทำหลัง backend รุ่นแก้ขึ้น READY และมีบัญชี LINE ที่เข้าสู่ระบบพร้อมทดสอบ

## LINE Agent: LLM0, tools, การ์ดถามต่อ และ LIFF — 29 ตุลาคม 2026

หลักฐานรอบนี้มาจาก **การตรวจโค้ดใน local และฐานข้อมูลแยก** ไม่รัน migration 22 ใน Supabase จริง ไม่แก้ `.env` จริงหรือ Vercel environment และยังไม่ได้ตรวจรับฟีเจอร์นี้บน production สถานะฐานข้อมูลจริงที่ตรวจไว้ก่อนหน้ายังคงเป็นรุ่น 21 การ commit/push โค้ดแยกจากการอัปเกรดฐานข้อมูลและเปิด flag ซึ่งผู้ดูแลจะทำเองตาม [LINE_AGENT.md](LINE_AGENT.md)

- **277 unit tests + 186 isolated PostgreSQL/API tests ผ่าน รวม 463 ข้อ** ส่วน integration รวม Agent 34 ข้อ ใช้ domain API และฐานข้อมูลแยกจริง แต่จำลอง OpenAI/LINE และปิด external network
- ตัวอย่างคำสั่งบันทึกการดูแลไรหูสร้างไดอารี่ส่วนตัวจริงในฐานทดสอบ พร้อมข้อความกำลังทำงานและผลสำเร็จที่อ้างถึง LIFF ของงาน/น้องตัวเดิม; มี 48 tools พร้อม schema และระดับ read/write/confirm ที่เซิร์ฟเวอร์ตรวจอีกชั้น
- ตรวจการถามด้วยปุ่มและข้อความ, การเลือกน้อง, ID ของน้องผิดแม้อยู่บ้านเดียวกัน, วันที่อ้างอิงข้อความก่อนข้ามวัน, คำถามข้อมูลไม่ครบ, ปุ่มเก่า/ข้ามเจ้าของ, การยืนยันตรงรุ่น, กลุ่ม/room, worker auth และทางฉุกเฉินที่ไม่ต้องรอ AI
- Duplicate webhook, racing worker, domain commit แล้ว response หาย, partial failure/retry และ LINE retry key คงเดิมไม่สร้างรายการซ้ำ; fast path เริ่มหลัง durable commit และคิวยังคงรองรับ HTTP/network/config failure
- ทดสอบสามบัญชีพร้อมกันใน instance เดียว: process permit ปฏิเสธงานที่ชนทันทีด้วย `AGENT_BUSY`, ไม่รอจน connection pool หมด, คืน permit หลังข้อผิดพลาด และ retry ทำงานต่อโดยข้อความไม่ปนบัญชี
- ตรวจสิทธิ์ซ้ำก่อนส่ง: ถอนสิทธิ์น้องที่อยู่ในปุ่ม, ลบบันทึกขณะที่ยังอ่านน้องได้, ถอน optional memory และเปลี่ยนสิทธิ์ จะไม่ส่งคำตอบ/รายละเอียดเดิมที่ค้างอยู่; receipt เก็บ reference/digest แทน snapshot ของข้อมูลส่วนตัว รายการงานและ personal export ไม่ replay copied plan/question/tool arguments
- SQL/RLS 6 ตารางใหม่, immutable ownership/arguments/keys, consent withdrawal, account cascade และชุด security/queue/HNSW เดิมผ่าน; safe upgrades รวม **21→22→22** และ 22 รันซ้ำรักษาข้อมูล sentinel เดิม fingerprint ของ migration 1–21 ไม่เปลี่ยน
- Workspace TypeScript และ production builds Owner/Clinic/Admin ผ่าน; runtime dependency checker ตรวจ 163 source files และ isolated production install/start ของ 14 services ทุก `/healthz` คืน 200
- Browser fixture บน production build ผ่านไทย/อังกฤษ 390px: nested `liff.state`, polling สถานะ, task API ต้องมี session, เลือกน้องถูกตัว, เปิดบันทึกที่ระบุและ highlight, 404 ไม่เปิดเผยผล และหน้าอ่านไม่ส่ง mutation ไม่มี overflow หรือ browser errors ตรวจ components ตาม React Best Practices
- ปรับ patch dependencies เป็น Next.js 16.4.3, Zod 4.6.6 และ Undici 6.29.1; `npm audit` พบ **0 vulnerabilities** ณรอบตรวจนี้ ไม่เปลี่ยน major version หรือ downgrade Blob

หลักฐานอยู่ใน ignored `.verification/line-agent-*` และ `.verification/line-agent/` สคริปต์ UI คือ [`scripts/test-agent-result-ui.mjs`](../scripts/test-agent-result-ui.mjs) ใช้ localhost และข้อมูลสังเคราะห์ ผลนี้ไม่แทนการทดสอบ model routing กับข้อความจริง, provider access/LINE quota, latency ใน production หรือ LINE iOS/Android ของผู้ใช้จริง


## Pet Passport Q&A และการดูแลหลังพบหมอ — 13 ตุลาคม 2026

- **224 unit tests และ 152 isolated PostgreSQL/API tests ผ่าน รวม 376 ข้อ** รวมการถามต่อ/ถามให้ง่ายเมื่อไม่ทราบ, version conflict, retry ไม่สร้างซ้ำ, owner confirmation, clinic role/scope, selected-photo access และคำตอบ/รูป/ความรู้สึกส่วนตัวที่ไม่ได้เลือกไม่รั่วไปในฉบับแชร์
- SQL/RLS, append-only source history, ยกเลิกฉบับเก่าหลังแก้ข้อมูล/ลบรูป/ถอนสิทธิ์, account cascade, concurrent writes และ known-prefix upgrades ผ่าน พร้อมตรวจเส้นทาง **20→21→21** ที่รักษา sentinel เดิม และ fingerprint ของ migration 1–20 ไม่เปลี่ยน
- ผลหลังพบหมอสร้างไดอารี่และนัดติดตามเพียงครั้งเดียว เชื่อม care episode เดิมหรือสร้างเรื่องการดูแลใหม่ แยก clinic-authored note จากข้อมูลที่เจ้าของตรวจ/แก้แล้ว รายการติดตามเข้า context ของ LINE เฉพาะสิทธิ์และแหล่งข้อมูลที่เปิดรับอยู่ การทดสอบหยุดที่ preview ไม่ส่งข้อความจริง
- TypeScript ทั้ง workspace, production builds Owner/Clinic/Admin, runtime dependency declarations และ isolated production startup ของทั้ง 14 service entrypoints ผ่าน
- แก้ runtime dependency ของทั้งสาม frontend หลัง Vercel พบ `zod` ขาดใน graph: fresh install เฉพาะ frontend โดยไม่รวม root ผ่าน และ production builds ทั้งสามผ่าน โดยไม่มี `openai`/`hono`/`pg`/`vitest` จาก root เพิ่ม checker ให้ตรวจ 156 source files รวม relative workspace/shared frontend imports และ negative fixture ที่ลบ declaration ต้องถูกปฏิเสธ
- Browser fixtures ของ Owner/Clinic ผ่านโฟลว์ Q&A→ตรวจ→ยืนยัน→เลือกแชร์→ผลหลังพบหมอ ทั้งไทย/อังกฤษและจอมือถือ รวม draft recovery, photo retry, grant controls และ Blob URL cleanup; public SSR/ภาษา/selected photos/หน้าไม่พร้อมใช้งาน/robots/referrer ผ่าน ตรวจหน้าสรุปด้วย Computer Use และเก็บภาพข้อมูลจำลองใน `.verification/passport/`
- Supabase จริงอัปเกรดจากรุ่น 20 เป็น **21** สำเร็จ read-only diagnostic ยืนยัน 21 migrations และ fingerprint `5ff3a6478e28e83e84c4ffb6d5f74478` โดยไม่สร้างข้อมูลผู้ใช้ทดสอบหรือพิมพ์ credentials

รอบนี้ไม่ได้เรียก OpenAI จริง ส่ง LINE หาผู้ใช้จริง หรือยืนยันผลทางคลินิก/การใช้งานบน LINE iOS/Android จริง หลักฐานและ log อยู่ใน ignored `.verification/passport/` ส่วนสคริปต์และ source อยู่ใน Git ดู [คู่มือ Pet Passport](PET_PASSPORT.md)


## Care Diary: แกน B2C และข้อมูลสำหรับคลินิก — 12 ตุลาคม 2026

- TypeScript ทั้ง workspace และ production builds ทั้ง Owner/Clinic/Admin ผ่าน; unit/provider/SDK mocks **166 passed**. HTTP ที่ข้ามใน unit run ถูกตรวจแยกกับ PostgreSQL จริง **68 passed** รวม 22 Care Diary flows และ care/PetID aggregate metrics
- SQL ตรวจ RLS/author-only reflections/clinical projection/permissions/consent/erasure, public snapshot revocation, follow-up reminders, exact money, source attribution, shared-pet/photo ownership, concurrency และ migration upgrades 1/4/9/13/14/15/16→16→16 ผ่าน โดยเก็บข้อมูล sentinel เดิมและปฏิเสธ schema/checksum drift
- ตรวจด้วย PostgreSQL จริงและแก้ cursor ที่เสีย microseconds เมื่อผ่าน JavaScript Date: entry/episode list/create/get/patch/retry คืน UTC precision 6 หลัก การอ่านหลายหน้าไม่ตกหล่นที่เวลาเดียวกัน UI เปรียบเทียบ timestamp ต่างความละเอียดโดยไม่แก้ค่าที่ส่งเป็น cursor
- Browser production-build fixtures ผ่าน: text-first diary ทั้ง 4 ประเภท, optional clinical fields, episodes, visits/follow-up, Bangkok chronology, paid/estimated costsแยกสกุลเงิน, 5-photo cap, author reflection privacy, share preview/TXT, 503 retry bodyเดิมไม่ซ้ำ, 409 reload, episode status, 101 same-time updates/51 episodes, truncated-summary notice, Thai/English และ mobile/desktop
- Home แสดง recent care updates และเปิดไดอารี่จากปุ่มได้ ไม่มี reflection ในตัวอย่างบน Home; ข้อความ/รูปที่เลือกส่งเป็น Story draft ที่ยังไม่บันทึก ไม่คัดลอกเรื่องเล่าหรือความรู้สึกที่ไม่ได้เลือก ทดสอบ StrictMode load ordering และสมุดปก/หลายหน้า/save–reload/reader/resize เดิมผ่าน
- Public SSR ทั้งภาษาและ owner regression ทั้ง 6 เมนูผ่าน; clinic/admin fixtures ตรวจ clinical details, cost opt-in, provenance, privacy canaries และ aggregate dashboard ภาษาไทย/อังกฤษบน 390px/desktop ไม่มี horizontal overflow หรือ browser errors
- ปุ่ม Print brief ของคลินิกเปิด cost details ก่อนพิมพ์จริง ตรวจ PDF A4 ด้วยการอ่าน text พบยอดจ่าย THB 1,250.50 และประมาณการ THB 500.00 ครบ ไม่พบ privacy canaries และไม่มี browser errors
- Runtime declarations ตรวจ source dependencies 50 files และ isolated production install/start 14 service entrypoints ผ่าน ทุก /healthz ตอบ 200
- Supabase ของโครงการอัปเกรด **16 migrations** สำเร็จแล้ว และ read-only diagnostic ตรงกับ manifest รุ่น16. ไม่มีการสร้างข้อมูลผู้ใช้ตัวอย่างใน production และไม่พิมพ์ credentials/ข้อมูลผู้ใช้ใน log

ภาพและ log อยู่ใน ignored `.verification/care-core/` และ `.verification/care-diary-*`. การทดสอบผู้ให้บริการใช้ fixtures/mocks ไม่เรียก OpenAI/Blob/LINE จริง ผลนี้ยังไม่วัด clinical accuracy, retention ของผู้ใช้จริง, biometric error rates หรือการใช้งาน LINE บน iOS/Android จริง แผนเก็บ dataset/ยืนยันตัว/partner integration และการทดลองคลินิกอยู่ใน `docs/CORE_PRODUCT_STRATEGY.md`.

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

## PetID longitudinal capture and optional LINE follow-ups (12 October 2026)

- Workspace TypeScript and all three production frontend builds pass. Unit suite: 186 cases passed. Disposable PostgreSQL security/upgrade assertions and 102 API integration cases passed; the subsequent selected-second-pet regression also passed in the notification suite (22 notification API cases). No live OpenAI, LINE push, training, or user-photo requests were made.
- PetID API checks cover owner-only access, ready media belonging to the same owner/pet, capture-date validation, duplicate media, microsecond-safe pagination, consent revision/replay/withdrawal, RLS, and account erasure. New captures remain owner-attested and pending independent review; collection does not establish biometric accuracy.
- Follow-up checks cover separate optional purpose/source choices, fresh service/source/membership consent, 24-hour settling period, 5/7-day interval, Bangkok delivery window, concurrent claims and transport retries, clinical-reminder priority, safe bounded topic selection, paused accounts, private replies and two silent contacts per unchanged source. Peony's owner-authored ear-care memory can select an ear-progress question without dosage, diagnosis, or the food-brand text.
- Local fixture browser checks pass for independent PetID training consent, multi-angle capture and owner-declared dates, exact retry bodies/keys, optional LINE sources, preview without send, withdrawal, stale-choice reload, Thai/English, and 390px layouts. Admin counters and clinic/admin navigation pass fixture checks. Public pages including updated privacy/AI explanations pass both language and offline-emergency checks.
- Follow-up links include the selected pet; the app accepts only a pet returned by the authenticated pets API. Unknown pet IDs fall back to an accessible pet. Opening a follow-up is an authenticated app-link event, not a LINE read receipt or proof of a retention effect.
- The standalone runtime dependency check and all 14 isolated service startup/health checks pass. SQL bootstrap/upgrade/diagnostic artifacts are generated from immutable migration metadata, with existing migrations 1–16 unchanged.

Production Supabase was upgraded from verified schema 16 to schema 18 after the checks above. The read-only diagnostic confirms all 18 migrations and the expected schema fingerprint. Deployment and database fingerprints are recorded separately in ignored release evidence. Real-device LINE behavior, live model selection quality, opt-in uptake and retention require subsequent user validation.

## PetID quality, independent evidence, model pipeline and diary photos (12 October 2026)

- 199 unit cases and 122 isolated PostgreSQL/API cases passed, including review/consent/role/RLS, stale or forged approval, concurrent provider deduplication, private image permission recheck, reference erasure, immutable export hashes, exact JPEG bytes, withdrawn/re-granted consent, HTTP cache bypass, image erasure and account cascade. A later bulk-lineage insertion change passed all six dataset API cases. Existing migration fingerprints 1–18 remain unchanged; known 18/19/20 upgrade paths preserve sentinel data.
- CI exposed a follow-up false positive: a random trusted URL UUID containing `81cc-` was interpreted as a medication dose. Medical-safety validation remains on the human message before links are appended; the final LINE payload retains its length limit. A fixed UUID regression and the complete 122-case isolated API suite pass after the correction.
- 33 Python pipeline tests passed. Synthetic smoke performed four actual gradient updates and changed model parameters; the output is labelled synthetic_smoke_only and is never deployment-eligible. Tests cover owner/pet partitions, whole-owner open-set holdout, capture-day/session separation, duplicates, validation-only thresholds, degenerate/small cohorts, consent/auth failure, transfer hashing and pipeline-owned cache/model/report deletion. No real user dataset, model or provider was accessed.
- Workspace TypeScript, all three frontend production builds, runtime dependency checks and all 14 isolated production service startup checks passed. PyTorch is a separate local research runtime, not a Vercel dependency.
- Local fixture browser suites passed for owner lazy quality requests and separate processing permission; independent training consent; Admin retake/different/stale gates and evidence/privacy requirements; authenticated JPEG previews; stable review/manifest retry IDs; 390px TH/EN layout; camera/library diary attachments; exact-byte multipart upload retry and fresh link on retry; full-size photo viewer; retained photo drafts/ready successes on language switches; and public SSR/privacy/AI language pages. No live OpenAI, storage upload or LINE messages were sent.
- Same-pet evidence remains a reviewer attestation, not proven liveness or certified biometric identity. Quality thresholds are preliminary heuristics requiring capture-cohort calibration. Cross-version holdout and model-serving governance remain future work, as described in PETID_MODEL_PIPELINE.md.

Production Supabase upgraded from verified schema 18 to 20. Read-only diagnostic confirms all 20 migrations and the expected fingerprint. Release/database fingerprints and browser proof are saved in ignored .verification/petid-training evidence.
