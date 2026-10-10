# ตรวจหน้าเว็บและ LINE LIFF หลัง deploy

ตรวจแบบอ่านอย่างเดียววันที่ 10 ตุลาคม 2026 เวลา 11:25–11:27 น. (Asia/Bangkok) ไม่เปลี่ยน DNS, Vercel settings, LINE endpoints หรือ webhook และไม่เรียก OpenAI

## ทำไม custom domain ดูเล็กกว่า Vercel URL

`https://chordjai.life` redirect ไป `https://www.chordjai.life/` ทั้ง `www.chordjai.life` และ `chordjai-owner-app.vercel.app` ส่ง HTML หน้าแรก **เหมือนกันทุก byte**:

- HTTP 200; HTML 26,020 bytes
- SHA-256: `fe3ae10a24737f130aa79c142c145eb03ee345834a8492850a89534610a45e83`
- ETag: `dfec7dd259c9093050a00d69098f24ef`
- CSS: `/_next/static/immutable/chunks/2js8t_vi9npud.css` เหมือนกันทั้ง path และเนื้อหา (50,248 bytes; SHA-256 `4eddd0dd538a1b9227e37de14b12599572c7eaa4ced3accc3bbb84f663e588a2`)
- JavaScript chunk paths เหมือนกันทั้ง 8 ไฟล์
- หน้า `/app` ของสอง host ก็มี HTML เหมือนกัน (9,468 bytes; SHA-256 `975081c741cc5f9c3ffa19f18e7bab47ef437de6c83ff9d68580202240ed2c94`)

จึงไม่พบหลักฐานว่า custom domain กำลังชี้ไปคนละ build จากการตรวจนี้ การอ่าน viewport ของแท็บ Chrome จริงผ่าน computer use ยืนยันว่าค่าที่ browser ใช้ต่างกัน:

| ค่า viewport ที่อ่านได้ | custom domain | Vercel alias |
|---|---|---|
| `innerWidth` | 2,940 CSS px | 1,470 CSS px |
| `outerWidth` | 1,470 CSS px | 1,470 CSS px |
| `devicePixelRatio` | 1 | 2 |
| font size ของ `h1` | 58 px | 58 px |
| ความกว้าง landing container | 1,280 px | 1,280 px |

ตัวเว็บและค่า CSS เดียวกัน แต่ domain มีพื้นที่ viewport ในหน่วย CSS มากกว่าเท่าตัวและแสดงองค์ประกอบเล็กลง สอดคล้องกับ browser zoom ประมาณ **50% บน custom domain เทียบกับ 100% บน Vercel alias** ค่าเปอร์เซ็นต์เป็นข้อสรุปจากการวัด viewport/DPR ไม่ใช่การอ่านช่อง Zoom ในเมนู Chrome

ใน Chrome เปิดแต่ละ host แล้วกด `Command + 0` บน macOS เพื่อคืน zoom 100% ก่อนเทียบหน้าเว็บที่ความกว้างหน้าต่างเดียวกัน

## Endpoint ปัจจุบันของ LIFF ทั้ง 7 ตัว

อ่านรายการจริงจาก LINE LIFF Server API ด้วย token ฝั่งเครื่องที่มีอยู่แล้ว โดยไม่แก้การตั้งค่าและไม่พิมพ์ token

| LIFF ID | Endpoint ที่ LINE ตั้งอยู่จริง | การใช้งาน |
|---|---|---|
| `2010549060-FRfLt9mJ` | `https://www.chordjai.life/app` | ChordJai เจ้าของสัตว์เลี้ยง |
| `2010549060-zCdRzv7e` | `https://clinic.chordjai.life/app` | ChordJai คลินิก |
| `2010549060-g72pN0tY` | `https://admin.chordjai.life/app` | ChordJai ผู้ดูแลระบบ |
| `2010549060-HR59RjAB` | `https://bdi-lac.vercel.app/liff/rights` | ระบบเดิม ยังไม่ได้ย้ายมา ChordJai |
| `2010549060-e46gh3VK` | `https://bdi-lac.vercel.app/liff/chat` | ระบบเดิม ยังไม่ได้ย้ายมา ChordJai |
| `2010549060-qw3AtH89` | `https://bdi-lac.vercel.app/liff` | ระบบเดิม ยังไม่ได้ย้ายมา ChordJai |
| `2010549060-udZ8HSKV` | `https://bdi-lac.vercel.app/liff/documents` | ระบบเดิม ยังไม่ได้ย้ายมา ChordJai |

ทั้ง 7 ใช้ view `full`, scope `openid` และ `profile` หน้า `/app` ของ ChordJai ทั้ง 3 domain ตอบ HTTP 200 ตอนตรวจ แต่ผลนี้ยังไม่ยืนยันว่า login และ backend ทำงานครบ ห้ามเปลี่ยน 4 LIFF ที่ยังใช้กับระบบเดิมโดยไม่มีการตัดสินใจย้ายระบบ

ลิงก์เปิดผ่าน LINE มีรูปแบบ `https://liff.line.me/<LIFF_ID>` ตัวอย่างเจ้าของสัตว์เลี้ยงคือ `https://liff.line.me/2010549060-FRfLt9mJ`

## พบปัญหา API แยกจากเรื่องขนาดหน้าเว็บ

| URL ที่ตรวจด้วย GET ไม่ส่ง authentication | ผล |
|---|---|
| `https://api.chordjai.life/api/v1/clinics` | HTTP 500; `FUNCTION_INVOCATION_FAILED` |
| `https://api.chordjai.life/api/v1/pets` | HTTP 500; `FUNCTION_INVOCATION_FAILED` |
| `https://api.chordjai.life/api/v1/identity/me` | HTTP 500; `FUNCTION_INVOCATION_FAILED` |
| `https://www.chordjai.life/api/v1/clinics` | HTTP 404; `DNS_HOSTNAME_RESOLVED_PRIVATE` |
| `https://chordjai-owner-app.vercel.app/api/v1/clinics` | HTTP 404 |

Frontend rewrite ใช้ `API_ORIGIN` ตอน build และ fallback เดิมคือ `http://localhost:8787` รหัส `DNS_HOSTNAME_RESOLVED_PRIVATE` สอดคล้องกับปลายทาง rewrite ที่เป็น host ภายใน เช่น localhost ต้องตรวจว่า `API_ORIGIN=https://api.chordjai.life` อยู่ใน Production environment ของ frontend ทั้งสามและ rebuild หลังตั้งค่า ข้อสรุปเรื่องค่า env เป็นการอนุมาน; ไม่ได้อ่าน env บน Vercel

แก้ Next config ทั้งสามแล้ว: ถ้าไม่ได้กำหนด `API_ORIGIN` ใน production จะใช้ `https://api.chordjai.life` เป็นค่าเริ่มต้น ใช้ localhost เฉพาะ development ค่าที่ตั้งไว้เองยัง override ได้ตามเดิม ต้อง rebuild/deploy จึงเปลี่ยน rewrite ของ deployment ปัจจุบัน

อ่าน **Vercel Runtime Logs** ของ production deployment `dpl_D8opmUmiZAyphF3hjyQRR2H9o6KU` (commit `9f9f329`) แล้วพบสาเหตุจริง:

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@vercel/functions'
imported from /var/task/packages/db/src/index.mjs
```

`packages/db` เรียก `attachDatabasePool` แต่ไม่ได้ประกาศ `@vercel/functions` ใน dependencies ของแพ็กเกจเอง มีเฉพาะใน root manifest ซึ่งการ build ของแต่ละ service ไม่ได้รวมไว้ครบ ทำให้ทุก service ที่ import DB ตายตั้งแต่ startup ก่อนอ่าน `DATABASE_URL` หรือส่ง JSON error ของแอป

แก้ประกาศ runtime dependencies ของแพ็กเกจและ services ให้ตรงกับ imports รวม `@vercel/functions`, `@vercel/blob`, `sharp`, `zod` และ internal workspaces ที่ขาด พร้อมอัปเดต lockfile เพิ่ม `scripts/check-runtime-dependencies.mjs` ใน CI เพื่อไม่ให้ root dependencies ซ่อนปัญหาเดิม

ตรวจการแก้ไขในโฟลเดอร์ชั่วคราวด้วย production-only workspace install ที่ไม่ติดตั้ง root dependencies หรือ dev dependencies แล้ว import **14 service entrypoints** ทุก `/healthz` ตอบ HTTP 200 โดยไม่ใช้ฐานข้อมูลหรือ credentials ของ providers ผลนี้ยืนยันว่า local isolated startup ผ่าน ส่วน production ต้อง rebuild/deploy commit ที่แก้ไขก่อนตรวจ HTTP อีกครั้ง การปรับ UI หรือเปลี่ยน browser zoom ไม่แก้ backend error นี้

## ผลหลัง deploy ดีไซน์ใหม่

Commit `41b6fecea5457798dd7b8b1ecfe20c17e0d2f697` auto-deploy production สำเร็จครบ Owner/Clinic/Admin/Backend และ GitHub CI ผ่าน ตรวจ browser บน `www.chordjai.life` ยืนยันหน้าใหม่, Sarabun และภาพ local โหลดจริง ไม่มี overflow หน้า Owner ของ custom domain และ Vercel alias ยังส่ง HTML เหมือนกัน

Backend `/api/v1/pets` เปลี่ยนเป็น HTTP 401 พร้อม JSON `UNAUTHORIZED` ตามที่ควรเป็นเมื่อไม่ล็อกอิน จึงยืนยันว่า missing-module startup error ถูกแก้แล้ว ส่วน `/api/v1/clinics` เป็น HTTP 500 JSON `INTERNAL_ERROR` จึงยังต้องตรวจการเชื่อมต่อฐานข้อมูล ไม่อ้างว่า deploy READY ยืนยันฐานข้อมูลพร้อมใช้งาน

Frontend proxy ยังตอบ `DNS_HOSTNAME_RESOLVED_PRIVATE` หลัง deployment แรก เพราะ `API_ORIGIN` ที่ตั้งอยู่ override fallback ใน source การเปิดแก้เฉพาะ public config ผ่าน Vercel dashboard ยืนยัน owner ใช้ `http://localhost:8787` และบันทึกค่าใหม่เป็น `https://api.chordjai.life` ให้ Owner/Clinic/Admin แล้ว (รักษา environment scopes เดิม) การเปลี่ยนค่านี้ต้องใช้ deployment ถัดไป ห้ามคัดลอกค่า localhost ใน `.env.local` ไป production

เพิ่ม `causeCode` ใน runtime log โดยรับเฉพาะ allowlist ของ SQLSTATE/Node connection/TLS codes ที่รู้จัก และ `DB_NOT_CONFIGURED` สำหรับค่าเชื่อมต่อที่ว่าง ไม่ log raw error messages, connection strings, SQL, provider payloads หรือข้อมูลผู้ใช้ HTTP error ที่ผู้ใช้เห็นยังเป็นข้อความทั่วไปตามเดิม การเพิ่ม diagnostics ไม่ปิด certificate verification หรือเปลี่ยนสิทธิ์ฐานข้อมูล

## สาเหตุ TLS และการแก้ไข

Deployment `7214dd5` สำเร็จทั้ง 4 projects หลังแก้ public config: frontend proxies ทั้งสามตอบ HTTP 401 JSON เมื่อเปิด `/api/v1/pets` โดยไม่ล็อกอิน จึงยืนยันว่าเส้นทาง API ใช้งานได้แล้ว สำหรับ `/api/v1/clinics` log ของ backend deployment `dpl_Pqs45RS9qXpKftyy3yZkHKSqVFMh` ให้ `causeCode=SELF_SIGNED_CERT_IN_CHAIN` ยืนยันสาเหตุที่การตรวจ certificate chain ล้มเหลว

ดาวน์โหลด public CA ผ่าน HTTPS จาก URL ที่ Supabase dashboard ใช้จริงใน [source ทางการ](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json): [prod-ca-2021.crt](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt) และ bundle เป็น static PEM ใน `packages/db/src/supabase-ca.ts` ไม่ใช่ credentials ค่า SHA-256 คือ `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` หมดอายุ 26 เมษายน 2031

การทดสอบ PostgreSQL STARTTLS กับ pooler host ที่ผู้ใช้ให้มา โดยไม่ส่ง authentication หรือ SQL: ก่อนเพิ่ม CA ได้ verify error 19; หลังใช้ CA นี้และ `verify_hostname` ได้ verify return code 0 (ok) การตรวจ backend request ที่เชื่อมฐานข้อมูลต้องทำอีกครั้งหลัง deploy ตัวแก้ TLS

ตัวแก้ใช้ CA เฉพาะ actual pg host ที่อยู่ใต้ `.pooler.supabase.com`, คง `rejectUnauthorized: true` และ hostname verification ไม่มี global trust หรือการปิด SSL verification ลบเฉพาะ SSL parser overrides ใน connection string เมื่อใช้ CA เพื่อไม่ให้ `sslmode` เขียนทับ `ssl.ca` และรักษารหัสผ่านที่ encode แล้ว/username/port/path/ตัวเลือกอื่นตามเดิม Unit tests ตรวจ actual pg.Client parser, host-query override, domain suffix boundaries, local Docker และ certificate fingerprint CLI upgrade ใช้ helper เดียวกัน

## แหล่งอ้างอิง

- [Chrome: เปลี่ยนขนาดตัวอักษรและระดับ zoom](https://support.google.com/chrome/answer/96810)
- [LINE LIFF Server API: Get all LIFF apps](https://developers.line.biz/en/reference/liff-server/#get-all-liff-apps)
- [Vercel: DNS_HOSTNAME_RESOLVED_PRIVATE](https://vercel.com/docs/errors/DNS_HOSTNAME_RESOLVED_PRIVATE)
- [Vercel: FUNCTION_INVOCATION_FAILED](https://vercel.com/docs/errors/FUNCTION_INVOCATION_FAILED)
