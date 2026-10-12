# ChordJai: Core product and business strategy

## PetID review and model pipeline delivered

The owner can request deterministic photo-quality and bounded visual consistency checks. An independent active admin records evidence and privacy review under current consent before a photo becomes eligible. AI similarity remains supporting evidence, not a verified identity. A short-lived pseudonymous dataset manifest and local training/evaluation pipeline now enforce fresh permission checks and distinguish owner-disjoint calibration/test cohorts and capture days. Synthetic training proves execution only. No trained model is automatically promoted into live PetID search, and cross-version holdout/serving governance remains future work. See [PETID_MODEL_PIPELINE.md](PETID_MODEL_PIPELINE.md).

Care Diary photo controls now appear beside the owner narrative, with camera/library uploads, partial-upload retry and an in-app viewer. Images do not become model-training samples or clinical disclosures automatically.


Research reviewed on 12 October 2026. This document distinguishes verified external evidence, product choices, current implementation, and work that still needs validation. It does not establish clinical effectiveness, biometric certification, patentability, or a commercial partnership for ChordJai.

## อัปเดตการพัฒนา: คลังภาพและข้อความติดตาม

รุ่น 17–18 เพิ่มคลังภาพหลายมุม/ต่างเวลาพร้อม owner attestation, identity anchor และสิทธิฝึกโมเดลเฉพาะสัตว์ที่แยกจากบริการค้นหาน้องหายแล้ว วันที่และตัวสัตว์ยังไม่ยืนยันอิสระ ทุกชุดใหม่รอทบทวน ยังไม่ส่งออกหรือฝึกอัตโนมัติ รายละเอียดใน [PETID_DATASET.md](PETID_DATASET.md)

เพิ่ม follow-up ที่เจ้าของเลือกเปิดรับ แหล่งข้อมูลแยก ควบคุม 5/7 วันและช่วงส่ง LLM เลือกเรื่องและหัวข้อที่ตรวจเทียบกับแหล่งจริงได้ รวมถึงเรื่องรักษาที่เจ้าของเล่าในสมุดความทรงจำ คำตอบ LINE เป็นข้อมูลส่วนตัวแยกจากเวชระเบียน รายละเอียดใน [PERSONALIZED_FOLLOWUPS.md](PERSONALIZED_FOLLOWUPS.md) ตัวนับการเปิด/ตอบมีไว้ศึกษา ยังไม่พิสูจน์ผล retention

ตารางแผนเดิมด้านล่างเป็นกรอบการขยายงาน การนำภาพไปฝึก/ทดสอบกับ identity ground truth, dataset/model version, PIMS, partner pilots และผลทางคลินิกยังต้องพิสูจน์ต่อ

## ข้อเสนอหลักสำหรับผลิตภัณฑ์

ให้ **ไดอารี่ดูแลน้องอยู่ในสมุดสุขภาพและเป็นจุดเริ่มต้นที่เจ้าของกลับมาบันทึก** ตั้งแต่วันปกติ วันที่เริ่มมีอาการ ไปพบหมอ ค่าใช้จ่าย และผลหลังรักษา การอัปเดตเรื่องเดิมเชื่อมเป็นเรื่องการดูแลเดียวกัน ส่วนสมุดความทรงจำยังใช้เก็บหน้า Story ที่เจ้าของเลือกสร้างเอง ไม่จำเป็นต้องเพิ่มเมนูไดอารี่ที่แย่งบทบาทกับสองสมุดนี้

เจ้าของได้พื้นที่ที่ดูแลใจและจำเรื่องของน้องได้ คลินิกได้ประวัติก่อนพบหมอที่อ่านง่าย ธุรกิจได้ข้อมูลที่มีที่มาและต่อเนื่อง ควรเริ่ม B2B จากโฟลว์รับข้อมูลก่อนพบหมอและติดตามหลังรักษา แล้วทำโครงการทดลอง PetID กับพาร์ตเนอร์ทีละกรณี ข้อมูลที่เจ้าของเล่ายังต้องติดป้ายว่าเจ้าของรายงาน ไม่ใช่คำวินิจฉัยที่คลินิกยืนยัน

ข้อความระบายเป็นส่วนตัวและไม่รวมในรายงานคลินิกหรือบริบท AI อัตโนมัติ รูปไดอารี่ไม่กลายเป็นข้อมูลฝึก PetID อัตโนมัติ การใช้เพื่อวิจัยหรือแชร์ให้พาร์ตเนอร์ต้องมีวัตถุประสงค์และสิทธิที่ชัดเจน ข้อมูลที่จะสร้างความได้เปรียบต้องมีคุณภาพ หลักฐานว่าเป็นน้องตัวเดิม การแก้ป้ายข้อมูลโดยคน และผลทดสอบตามเวลา ไม่ใช่เพียงมีรูปจำนวนมาก

การกลับมาใช้ควรเกิดจากเรื่องที่เจ้าของอยากจำและติดตาม เช่น วันนี้น้องกินอย่างไร อาการเดิมดีขึ้นไหม คุณหมอบอกอะไร และจ่ายเท่าไร การอัปเดตเรื่องเดิมหรือเก็บเป็นหน้าความทรงจำจึงเป็นเหตุผลให้กลับมาใช้ที่เชื่อมกับชีวิตจริง ความถี่ที่เหมาะสมและผลต่อการกลับมาใช้ยังต้องวัดกับเจ้าของจริง ไม่ได้กำหนดให้ทุกคนต้องกรอกแบบประเมินสุขภาพทุกวัน

| ส่วนสำคัญ | ทำแล้วในโค้ดรุ่นนี้ | สิ่งที่ต้องทำต่อและพิสูจน์ |
|---|---|---|
| B2C: สมุดสุขภาพ → ไดอารี่ดูแลน้อง | บันทึกวันปกติ/อาการ/ไปพบหมอ/ติดตามผล เชื่อมเป็นเรื่องการดูแล เพิ่มรูป ค่าใช้จ่าย และความรู้สึกส่วนตัวของผู้เขียน แก้ไขและย้อนอ่านหน้าเก่าได้ | ทดสอบความง่ายในการใช้ การกลับมาติดตามเรื่องเดิม และประโยชน์ต่อเจ้าของในไทย |
| B2B: เริ่มจากคลินิก | เจ้าของเลือกเปิดแชร์ข้อมูลคลินิกของแต่ละบันทึก ให้สิทธิ์คลินิกแยก มีวันหมดอายุและเพิกถอนได้ สรุปข้อมูลล่าสุดไม่เกิน 100 รายการ และเลือกแต่ละแถวสำหรับดาวน์โหลด TXT | ตัวกรองช่วงเวลา/เรื่องการดูแลในรายงาน การยืนยันโดยคุณหมอ การแชร์เอกสารคลินิกที่เลือก และเชื่อม PIMS ภายนอก |
| PetID และ IP | รูปอ้างอิงหลายมุม → vector index → LLM ช่วยคัดตัวที่คล้าย → เจ้าของตรวจผล ยังเป็นระบบค้นหาผู้สมัครที่อาจตรงกัน | ความยินยอมวิจัยเฉพาะ ชุดภาพที่ยืนยันตัวน้องได้ ข้อมูลข้ามเวลา โมเดลชีวมิติเฉพาะทาง ผลทดสอบอิสระ และการประเมินสิทธิ IP |
| คุณภาพข้อมูลและธุรกิจ | ป้ายว่าเจ้าของรายงาน เลขเวอร์ชันป้องกันบันทึกทับ สิทธิข้อมูล และตัวนับการใช้งานรวม | ประวัติเนื้อหาก่อนแก้ไข การประเมินทางคลินิก ผลประหยัดเวลาของคลินิก โครงการทดลองที่มีสัญญา ราคาที่ลูกค้ายอมจ่าย และความแม่นยำของ PetID |

การเลือกแถวใน TXT ไม่ได้เปลี่ยนรายการที่จะอยู่ในลิงก์สาธารณะ ลิงก์ต้องเลือกสร้างอีกขั้น และมีโปรไฟล์กับบันทึกสมุดสุขภาพเดิมล่าสุดไม่เกิน 100 รายการ รวมหมายเหตุเต็มของทุกประเภท ส่วนไดอารี่ใหม่จะรวมเฉพาะข้อมูลคลินิกที่เปิดแชร์ไว้ตามตัวเลือก ลิงก์และสรุปยังไม่มีตัวกรองช่วงเวลาหรือเรื่องการดูแลเฉพาะ

หลักฐานที่สนับสนุนทิศทางนี้คือ [AAHA 2022](https://www.aaha.org/wp-content/uploads/2022/02/2022-aaha-pain-management-guidelines-for-dog-and-cats_updated_060622.pdf) ให้ความสำคัญกับสิ่งที่เจ้าของสังเกตที่บ้านและการประเมินซ้ำ ส่วน [คู่มือ Digitail](https://help.digitail.io/en/articles/12601847-how-to-use-the-digitail-pet-parent-app-to-manage-your-pet-s-care) แสดงโฟลว์ไดอารี่เชื่อมข้อมูลคลินิกที่มีผลิตภัณฑ์ใช้งานจริง แต่สองแหล่งนี้ไม่ได้พิสูจน์ผลของ ChordJai การแชร์บันทึกไม่ได้หมายความว่าคลินิกได้รับแจ้งหรือกำลังเฝ้าติดตามทันที

ด้าน PetID มีตัวอย่าง [ผลิตภัณฑ์ DB Insurance ที่รับเอกสารทะเบียนลายจมูก](https://www.directdb.co.kr/ltm/prd/cpnm/custInfoView.do?partner_code=L602&pdcDvcd=l_pet_dog&searchPdcCd=31119&searchPdcTrtHistCd=00) และ [โครงการของเมือง Goyang](https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20250411200757574&q_clCode=-1&q_estnColumn1=All) จึงมีทิศทางธุรกิจให้ศึกษา แต่เราไม่ได้มีสัญญาเหล่านั้นหรือความแม่นยำเดียวกับผู้ให้บริการนั้น วันนี้ควรวัดจำนวน pet-weeks ที่มีบันทึกและการติดตามเรื่องเดิมก่อน ตัวนับนี้ยังไม่ใช่คะแนนคุณภาพทางคลินิกหรือหลักฐานว่าโมเดลสร้าง IP แล้ว

## The product decision

**Make Care Diary the daily entry point inside Health.** An owner can record what changed, how they feel, what happened at the vet, treatment received, money paid, and how their pet is doing afterwards. Related updates form a care episode rather than a disconnected collection of notes. The existing permanent Story book remains a place to make and read memories; an owner chooses what to turn into a memory page.

The value proposition is: “Tell your pet's story once, keep track of what changes, and arrive at the vet with a useful history.” It serves both ordinary days and difficult days. A normal-day check-in is useful context; an unrecorded day is missing data, never evidence that a pet was healthy.

The business opportunity is the continuity of useful records and trusted identity. A high volume of user text or photos alone does not create a reliable clinical dataset or biometric intellectual property.

## One owner journey

1. **Record now:** Start with a short message and optional photo. Choose an ordinary-day check-in, symptom update, vet visit, or follow-up. Structured fields are optional until they help the specific event.
2. **Continue the same story:** Link another update to an existing care episode. Keep onset, changes, clinic visits, and outcome together. Owners can say better, unchanged, worse, or unsure without making a diagnosis.
3. **Record a vet visit:** Capture the reason for visiting, what the owner reports the vet said, treatment received, next appointment, receipt, amount paid, and currency. Unknown cost is distinct from zero; estimated and paid amounts are distinct.
4. **Prepare for the vet:** The current brief reads up to 100 recent Care Diary entries already enabled for clinical sharing. Owners can select individual rows for a downloaded TXT brief. This row selection is local to that download: creating a public summary link is a separate choice and includes all eligible recent entries when the diary option is enabled. Timeline episode filters do not filter the brief; date-range and episode-specific reports are planned. A chosen clinic with a current explicit diary grant can read the clinical projection through its portal.
5. **Keep a memory:** Deliberately select text and photos to create a Story page. Private reflections are never silently copied into clinic reports, AI context, or partner exports.

The visual product keeps the existing bright orange/Mitr design and Thai/English controls. It should feel like a caring notebook, with a short entry form and a timeline that can be revisited. The information architecture does not require a second competing diary tab or a mandatory medical questionnaire on every entry.

## What is implemented and what remains a proposal

| Area | Current code in the schema 16 feature | Still pending |
|---|---|---|
| Owner diary | Daily/symptom/visit/follow-up updates, linked episodes, optional observations, private author-only reflection, photos, paid/estimated expenses, editing and older-page loading | Observed usability, repeat usage, and measured benefit to Thai owners |
| Clinical sharing | Explicit per-entry clinical sharing, separate per-entry expense permission, recent 100-entry brief, per-row TXT download, opt-in public-link diary/cost choices, separate `care.read` clinic grants, expiry/revocation and access logs | Date/episode report filters, clinician attestation, selected clinical document sharing, and external PIMS integration |
| Data amendment | Current row version, editor and amendment time, with optimistic conflict protection | An append-only history of previous entry content; current edits replace the saved content |
| Assistant and analytics | Bounded clinical context; aggregate care activity and PetID inventory; private diary prose/reflections and individual expense values excluded from automatic context/analytics | Clinical efficacy evaluation, calibrated health or identity predictions, retention cohorts, and verified clinic time savings |
| PetID | Existing multi-photo visual candidate retrieval and owner review, with descriptive photo inventory | Dedicated biometric capture/model, verified identity labels, temporal evaluation, independently accepted operating thresholds and certification |
| Research rights and IP | Service/privacy controls and explicit operational sharing; the strategy prohibits automatic training from diary photos | Research-specific eligibility and consent flow, dataset/model lineage, legally usable curated dataset, training/unlearning process, patentability and freedom-to-operate assessment |
| Commercial model | A proposed clinic-first intake/follow-up offer and later identity integrations | Signed pilots, PIMS or insurer/property/public-sector contracts, validated ROI, willingness to pay, and pricing |

Implementation tests establish software behavior and access boundaries. They do not establish demand, clinical benefit, identity accuracy, or a commercially usable research dataset.

## Why this can become a business

| Buyer | Problem worth validating | Initial product | Commercial hypothesis to test |
|---|---|---|---|
| Clinics and animal hospitals | Owners forget onset, changes, previous care, and follow-up details; staff reconcile scattered information | Owner-prepared intake timeline, supporting documents, source labels, and follow-up workflow | Subscription per practice or clinical team; measure staff time saved and repeat use before setting pricing |
| Pet insurers | Evidence and pet identity can be inconsistent across policy, invoice, and visit records | Owner-controlled document pack and verified pet linkage in a contracted pilot | API/service fees for identity or document workflow; never promise approval or a premium discount without an insurer agreement |
| Pet-friendly housing and hospitality | Staff need a current registry and a way to check that an arriving pet belongs to an authorized profile | Pet register, owner-approved current profile, vaccination proof, and supervised check-in pilot | Subscription per property/service location; validate the actual operational problem and willingness to pay |
| Public sector and shelters | Registration, duplicate records, shelter intake, and reunification need reliable animal identity | Identity reconciliation and lost-pet candidates alongside established registration methods | Pilot procurement and integration services, subject to local legal recognition and independently measured performance |

Prioritize clinics first because the diary can produce a useful intake and follow-up workflow now. Identity partners should be piloted separately with clear acceptance criteria. A research dataset is an internal capability; selling owners' raw diaries is not the proposed business model.

## Verified external evidence and its limits

- **Clinical relevance of home observations:** AAHA's 2022 pain-management guideline includes owner-observed behavior and reassessment in veterinary care. It also distinguishes home photos/videos from validated pain-assessment instruments. This supports preserving dated observations for a veterinarian; it does not validate ChordJai's severity selector, establish a diagnosis, or prove our clinical effectiveness. [AAHA 2022 guideline](https://www.aaha.org/wp-content/uploads/2022/02/2022-aaha-pain-management-guidelines-for-dog-and-cats_updated_060622.pdf).
- **Owner diary connected to clinic software:** Digitail's public help describes private diary entries, entries added to a pet's clinic file, visit summaries and invoices. It explicitly states that sharing a diary entry does not automatically notify the clinic. Its PIMS help places owner updates in the patient timeline. These are primary examples of a shipped vendor workflow, not independent evidence of retention, clinical efficacy, or ROI. ChordJai's current portal has no integration with Digitail or another external PIMS. [Digitail owner-app help](https://help.digitail.io/en/articles/12601847-how-to-use-the-digitail-pet-parent-app-to-manage-your-pet-s-care), [Digitail PIMS workflow](https://help.digitail.io/en/articles/5050613-how-the-portal-is-integrated-with-the-pims).
- **Longitudinal owner-reported data:** Dogslife collected recurring health and lifestyle reports from UK Labrador owners; subsequent validation compared reports with interviews and veterinary records. Participation, recall, interpretation and reporting bias require investigation rather than assuming all entries are complete and accurate. This was a particular research cohort, not a Thai B2C retention experiment or a benchmark for our cats and dogs. ChordJai needs its own label review, missingness analysis, consent and retention measurement. [Dogslife cohort design](https://link.springer.com/article/10.1186/1746-6148-9-13), [Dogslife data validation](https://www.jmir.org/2015/4/e96/).
- **Insurance:** DB Insurance's own live Petvely product conditions accept a noseprint registration provider/number and specified proof for a registered-pet discount. This establishes a real insurance workflow involving biometric registration, not a measured reduction in fraud. [DB Insurance product conditions](https://www.directdb.co.kr/ltm/prd/cpnm/custInfoView.do?partner_code=L602&pdcDvcd=l_pet_dog&searchPdcCd=31119&searchPdcTrtHistCd=00), [Petnow insurance offering](https://www.petnow.io/ko/pet-insurance).
- **Public sector:** Goyang City's April 2025 announcement describes a Petnow agreement and a subsidized noseprint registration pilot combined with external RFID registration for registration and lost-pet work. This is a documented municipal pilot, not evidence of legal replacement of established registration methods in Thailand. [Goyang City announcement](https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20250411200757574&q_clCode=-1&q_estnColumn1=All).
- **B2B identity tooling:** Petify publishes separate registration, 1:1 verification, and 1:N identification capabilities, with web capture and server API integration. Industry examples on its sales page are vendor use cases; they are not all confirmed customer contracts. [Petify product](https://www.petnow.io/en/petify), [Petnow developer documentation](https://docs.petnow.io/petify/docs).
- **Housing:** PooPrints offers apartments and condos a canine DNA registry and laboratory waste matching. It demonstrates an operational property-management use case for animal identity. It uses swabs, genetic profiles, and lab procedures, so a visual photo matcher cannot claim to reproduce it. [Apartment workflow](https://www.pooprints.com/industry-selector/apartments), [PooPrints science](https://www.pooprints.com/science).
- **Research:** Petnow's IEEE Access work describes smartphone-collected dog noseprint and cat face datasets and separates animal identities between training and testing. It shows why curated capture and evaluation matter; its published accuracy does not apply to ChordJai's vector-plus-LLM implementation. [IEEE Access paper, 2024](https://doi.org/10.1109/ACCESS.2024.3516130).
- **Longitudinal evidence:** A canine nose-pattern study includes repeated monthly captures and supports studying stability over time, but its limited sample does not certify performance across all pets. [Study on canine nose patterns](https://pmc.ncbi.nlm.nih.gov/articles/PMC8697952/).

No independent commercial outcome evaluation of ChordJai exists yet. Vendor accuracy, customer totals, promotional screenshots, and announced agreements must not be presented as our own performance or adoption.

## Records that clinics can trust

Keep original owner text distinct from structured observations and derived summaries. The current record stores the pet, episode, event type, occurred time, recorded time, author/editor, current version, supporting media references, and owner-reported provenance. An amendment updates the current content; previous versions of that content are not retained in an audit-history table. Append-only amendment history is a future data-governance requirement before treating the dataset as research or insurance evidence. Costs need explicit currency and known/unknown values. Owners can correct their records without converting the original author into a clinician.

Use **owner-reported**, **document extracted**, and **clinician-confirmed** only when the corresponding provenance exists. An owner typing “the vet said kidney disease” is an owner report of a diagnosis, not a clinician-confirmed diagnosis. AI output remains a proposal and does not change provenance. Diary mood, location, or prose must not be silently used to infer medical facts.

Private emotional reflection is useful to the owner and excluded from the default clinical report. Sharing a clinical brief is separate from research permission. Clinic grants should reveal only the selected clinical projection, with expiry, revocation, and access logs. Diary media should remain private and accessible only through the authorized media flow.

The diary exclusions apply to the new Care Diary narrative, reflection and media fields. The public summary link also contains the pet profile and up to 100 recent legacy health-booklet records of all kinds, including their full notes; the diary opt-in does not control those legacy records. Review that scope before creating a link. Public links are snapshots: ordinary edits do not rewrite existing snapshots, while deleting an included diary entry or withdrawing its clinical/expense sharing revokes links containing that entry. TXT row selection does not change clinical-sharing flags or an existing public link.

The assistant may use a bounded recent structured clinical projection when discussing the selected pet. It excludes diary narrative, emotional reflection, costs, and media. Saved clinical data is untrusted input, owner-reported unless explicitly attested, and never authority to prescribe, diagnose with certainty, or ignore urgent signs.

## The PetID asset we need to build

The current PetID pilot uses an LLM visual signature from up to five reference photos, a similarity vector index, and an LLM candidate comparison followed by owner confirmation. It is a candidate-retrieval workflow, not a certified noseprint identity system. It currently produces one combined vector; it does not implement independently evaluated four-facet biometric models or prove any patentable invention.

A diary can encourage repeat engagement and make optional repeat capture easier. Ordinary diary pictures should not automatically become biometric enrollment references or training images. User ownership of a profile, a matching name, or an AI similarity score is insufficient ground truth that two images show the same animal.

A defensible dataset needs:

- Separate, explained permission and eligibility for the research purpose; dataset exports re-check active eligibility and media availability.
- Guided capture appropriate to the species and modality, with capture date/session, image quality, visible area, angle, source, and model version. Low-quality or obstructed frames should be rejected with helpful capture instructions.
- Independent identity evidence where available, such as a documented clinic check or microchip linkage. Keep owner assertion, supported linkage, confirmed match, dispute, and unresolved identity distinct.
- Original evidence and human corrections with annotation provenance. Do not use an LLM's answer as both the training label and the evaluation truth.
- Repeated samples across time and conditions, deduplication, and separation by animal, household, session, and date to prevent leakage.
- A versioned dataset manifest, consent lineage, reviewer history, retention policy, and deletion/restriction propagation across derived copies.

The eventual IP is the curated and lawfully usable dataset, capture method, labels, trained model, evaluated system, and operational integration. A proprietary dataset is not automatically a patent. Patentability and freedom to operate need separate prior-art and legal assessment before claiming patent protection or copying a competitor's patented capture workflow.

## Identity gates before higher-stakes use

Evaluate 1:1 verification separately from 1:N identification. Include animals absent from the enrolled gallery, visually similar pets, difficult capture conditions, repeated captures across time, and a gallery close to intended deployment size. Report false-match/non-match and false-identification/non-identification rates, rank-k retrieval, failure to enroll, capture completion, latency, and human review burden. Stratify by species, breed/appearance, age, device, lighting, and relevant capture limitations.

NIST's human identity guidance distinguishes these error modes, requires relevant gallery-size testing, and supports manual confirmation of ambiguous results. We use those evaluation principles as an engineering reference, not as a pet certification or a claim that human requirements legally apply to our animal system. [NIST SP 800-63A-4](https://pages.nist.gov/800-63-4/sp800-63a.html), [NIST biometric error explanation](https://www.nist.gov/blogs/taking-measure/tale-two-errors-measuring-biometric-algorithms).

Before property access, insurance decisions, or official registration pilots, agree on the use case's threshold and review policy, independently test it, and provide a fallback. Current similarity scores must not automatically deny a claim, attribute wrongdoing, revoke access, or assert ownership. A biometric match also does not prove vaccine status, owner authority, or document authenticity.

## Privacy and purpose

Thailand's PDPA defines personal data around an identifiable natural person and requires a notified purpose, data minimization, and an applicable processing basis. Pet health or animal biometrics are not automatically human sensitive biometric data, but linked owner identifiers, addresses, household behavior, documents, and photos can identify people. A new partner or research purpose cannot simply inherit all permissions from a generic service or AI-improvement checkbox. [MDES-hosted PDPA text, sections 6, 19, 21–24, 33–40](https://www.mdes.go.th/uploads/tinymce/source/%E0%B8%AA%E0%B8%84%E0%B8%AA/Personal%20Data%20Protection%20Act%202019.pdf).

Product choice: separate service delivery, selected clinical sharing, optional PetID research, and specific partner disclosure. Research participation should not be required to keep using the diary. Do not send private reflections or raw health narratives to analytics. Aggregate product measurements should have defined access, retention, and a purpose. Pseudonymization does not automatically make a dataset anonymous.

Withdrawing research permission stops new eligible exports and follows the documented deletion/restriction process for retained identifiable data. Track which dataset and model versions used each permitted sample. Do not promise immediate deletion from trained model parameters where no tested unlearning or retraining process exists. Partner rollouts also need controller/processor responsibilities and cross-border processing arrangements appropriate to their actual flow.

## Delivery priorities and outcome measures

| Stage | Deliverable | Exit evidence |
|---|---|---|
| Core diary | Quick entries, structured observations, private reflection, visits/costs, linked episodes, editable chronology | Owner usability tests, complete save/reload/correction flow, RLS/erasure and privacy projection tests |
| Clinic workflow | Selected episode brief and follow-up with explicit owner authorization | Clinic pilot, source accuracy, reduced intake effort, follow-up completion; no unsupported clinical claims |
| PetID dataset pilot | Optional guided longitudinal capture with rights and identity evidence | Capture acceptance, identity label audit, temporal and animal-held-out evaluation, consent/deletion lineage |
| Identity business pilots | One agreed verification problem with a partner and reviewed fallback | Independently measured error rates and operational benefit at the intended gallery size |
| Broader product | Additional insurance/property/public integrations | Signed scope, validated workflow, legal basis, support and monitoring; no claim of adoption before use |

The proposed north-star hypothesis is **useful pet-weeks**, but “useful” needs a reviewed definition and real-owner validation. The implemented measure is **recorded pet-weeks**: distinct pet/calendar-week pairs with an entry created in the last 30 days, using Bangkok weeks. It is an aggregate activity count, not a clinically validated quality measure, and a repeated-week pet count is not a retention cohort. Additional measures to establish are meaningful episode follow-up completion, visits with documents/costs known, owners preparing a clinic brief, clinic time saved, and pets with multiple eligible identity samples across time. Daily active users and photo counts are supporting measurements, not evidence of medical quality or biometric reliability.

Initial analytics exposes aggregate diary authors, entries, active and resolved episodes, visits, follow-up updates, pet-weeks, and visits with recorded cost lines or available attachments. It does not expose private prose, reflections, individual costs, raw health properties, or household-level marketing profiles. PetID enrollment coverage and reference-photo recency are descriptive inventory metrics; quality, ground-truth coverage, calibration, clinical evaluation, and retention cohorts remain explicitly pending until measured with suitable real data.
