# Pipeline ฝึกและทดสอบ PetID

ส่วนนี้เป็นระบบวิจัยที่รันได้จริงบนเครื่องแยกจาก Vercel: เตรียม snapshot ที่มีสิทธิ์ ใช้ภาพฝึก CNN ให้ได้ embedding 64 มิติ ตั้ง threshold ด้วยชุด calibration แล้วทดสอบสัตว์ที่ไม่เคยอยู่ในชุดฝึก ไม่เปิดฝึกอัตโนมัติจากรูปของผู้ใช้ และไม่เปลี่ยนโมเดลค้นหา PetID ของเว็บโดยอัตโนมัติ

ในการพัฒนาครั้งนี้ใช้เพียงภาพลวดลายที่สร้างด้วยโปรแกรมเพื่อทดสอบการทำงาน มีการอัปเดตน้ำหนักโมเดลจริง แต่ผลจากภาพลวดลายไม่ใช่ความแม่นยำในการรู้จำสัตว์เลี้ยง

## ข้อมูลที่เข้า pipeline ได้

ใช้เฉพาะภาพในคลังภาพ PetID ที่ผ่านการตรวจคุณภาพและการทบทวนตัวตนโดยผู้ตรวจอิสระ พร้อมความยินยอม `petid_model_training` ของเจ้าของภายใต้ revision ปัจจุบันครบทุกภาพ รูปไดอารี่ ใบเสร็จ รูปยา หรือรูปในความทรงจำไม่ถูกหยิบมาใช้เพียงเพราะเจ้าของอนุญาตคลัง PetID

LLM ช่วยตรวจภาพและความสอดคล้องที่มองเห็น การตอบว่าอาจเป็นตัวเดียวกันไม่ใช่ ground truth ผลอนุมัติของผู้ตรวจต้องมีหลักฐานอิสระและยืนยันว่าไม่มีคนหรือเอกสารส่วนตัวในภาพ การทบทวนนี้ยังเป็นคำรับรองตามหลักฐานของผู้ตรวจ ไม่ใช่การพิสูจน์ liveness หรือการรับรอง biometric โดยห้องปฏิบัติการ

ผู้ดูแลที่เข้าสู่ระบบและยังมีสิทธิ์สร้าง export ผ่าน `POST /api/v1/biometric/review/datasets` พร้อม `requestId` และ `limit` สูงสุด 500 ภาพต่อ snapshot จากนั้นใช้ ID ที่ได้กับ pipeline export มีอายุ 24 ชั่วโมง และ token ต้องยังเป็น admin session ที่ใช้งานได้ ไม่มี URL รูปสาธารณะใน manifest หรือรายงาน

## ความยินยอมและ lineage

manifest รุ่น `petid-dataset-v1` เก็บ export ID, SHA256 ของ JSON ที่เรียง key, pseudonym ของเจ้าของ/สัตว์, sample/session/review ID, ชนิดสัตว์ มุมภาพ วันและเวลาถ่ายที่เจ้าของระบุ, consent revision, ขนาดภาพ และ fingerprint ของภาพ ไม่มีชื่อสัตว์ ชื่อเจ้าของ เลขไมโครชิป หรือบันทึกการรักษา

- `imageSha256`: SHA256 ของ JPEG มาตรฐานที่เซิร์ฟเวอร์ส่งจริง ใช้ตรวจ bytes ก่อนรับและก่อนอ่านภาพจาก cache
- `decodedSha256`: fingerprint ของ RGB ที่เซิร์ฟเวอร์ถอดรหัส ใช้ค้นหาภาพเดิมที่บีบอัดใหม่
- `dhash64`: fingerprint เชิงภาพ ใช้กักภาพใกล้ซ้ำที่อาจทำให้ผลทดสอบดูดีเกินจริง ไม่ใช้พิสูจน์ว่าเป็นสัตว์ตัวเดียวกัน

ก่อนรับภาพแต่ละรูป ก่อนแต่ละ epoch ก่อนอ่านแต่ละ batch ก่อนอัปเดตน้ำหนัก และก่อน/หลังการประเมิน จะเรียก `POST /review/datasets/:exportId/authorize` ใหม่ การตอบต้องตรงกับ export/hash และเป็นเวลาปัจจุบัน ภาพรับผ่าน `GET /review/datasets/:exportId/samples/:sampleId` ที่ตรวจสิทธิ์อีกครั้ง เซิร์ฟเวอร์ไม่อนุญาต snapshot เดิมเมื่อมีภาพถูกลบ สิทธิ์เปลี่ยน หรือ consent revision เปลี่ยน

หากตรวจสิทธิ์ไม่ได้ เครือข่ายขาด หรือข้อมูลไม่ตรง pipeline หยุดและลบภาพ cache, น้ำหนักโมเดล และรายงานใน directory ที่ pipeline สร้างไว้ ไม่ฝึกต่อจาก cache แบบ offline ต้องสร้าง snapshot ใหม่และฝึกใหม่หลังแก้ต้นเหตุ การตรวจสิทธิ์มีช่องว่างเล็กน้อยระหว่างคำขอกับการคำนวณ จึงตรวจซ้ำก่อนเผยแพร่ artifact ด้วย

การถอนสิทธิ์ทำให้ artifact ภายใต้ snapshot นั้นหมดสิทธิ์นำไปใช้ การลบภาพต้นฉบับไม่ได้ทำให้น้ำหนักโมเดลลืมข้อมูลเอง ต้องกัก artifact และฝึกใหม่จาก snapshot ที่ยังมีสิทธิ์ก่อนนำไปใช้งาน เครื่องมือบังคับกับการใช้งานผ่าน pipeline นี้ ไม่สามารถลบไฟล์ที่คนคัดลอกไปเองหรือคอมพิวเตอร์ที่ปิดอยู่จากระยะไกลได้ เครื่องที่ถือ dataset ต้องควบคุมสิทธิ์และมีขั้นตอนลบข้อมูลร่วมด้วย

## รันบนเครื่องวิจัย

ใช้ Python 3.12 และ runtime แยก ตัวอย่างนี้ใช้ directory ที่ Git ไม่ติดตาม:

```bash
python3.12 -m venv local-secrets/petid-ml-venv
local-secrets/petid-ml-venv/bin/python -m pip install -r scripts/petid-ml/requirements.txt
```

เริ่มด้วย smoke test ที่ไม่มีข้อมูลผู้ใช้ ไม่มี OpenAI call และไม่ต้องใช้ API token:

```bash
local-secrets/petid-ml-venv/bin/python scripts/petid-ml/pipeline.py smoke --out local-secrets/petid-smoke-run --epochs 2
local-secrets/petid-ml-venv/bin/python -m unittest discover -s scripts/petid-ml/tests -v
```

ใช้ directory ใหม่ที่ว่างเสมอ ตัว `--synthetic` รับได้เฉพาะรูปที่สร้างซ้ำจากสูตรลวดลายเดิมและ hash ตรงทุกภาพ ไม่ใช่สวิตช์ข้ามสิทธิ์ของภาพจริง

สำหรับ dataset จริง ตั้ง `PETID_API_ORIGIN`, `PETID_API_TOKEN` และ `PETID_EXPORT_ID` ใน environment ของเครื่องวิจัยจาก [ตัวอย่างตัวแปร](/Users/natthaphat/Downloads/pettech/scripts/petid-ml/.env.example) ใช้ Bearer token จาก admin session ที่ได้รับอนุญาต HTTPS เท่านั้น ยกเว้น localhost สำหรับทดสอบ token ไม่ถูกเขียนลง manifest/log และห้าม commit token หรือภาพ:

```bash
local-secrets/petid-ml-venv/bin/python scripts/petid-ml/pipeline.py fetch --out local-secrets/petid-private-run
local-secrets/petid-ml-venv/bin/python scripts/petid-ml/pipeline.py train --run local-secrets/petid-private-run --epochs 10 --seed 17
local-secrets/petid-ml-venv/bin/python scripts/petid-ml/pipeline.py evaluate --run local-secrets/petid-private-run
```

ไฟล์สำคัญคือ `training.json`, `model.pt`, `calibration.json`, `evaluation.json` ใน run directory ที่มี permission ส่วนตัว น้ำหนักถูกโหลดด้วย `torch.load(..., weights_only=True)` รุ่น source code, dataset hash, model hash, seed และ runtime อยู่ใน lineage หากเปลี่ยน source หรือ threshold เองโดยไม่ฝึกใหม่ การประเมินจะปฏิเสธ

## การฝึกและแบ่งชุด

แบ่งกลุ่มเจ้าของแบบคงที่ตาม seed เป็น train 60%, calibration 20%, test ส่วนที่เหลือ สัตว์ทุกตัวของเจ้าของเดียวกันอยู่ partition เดียว จึงไม่ให้เจ้าของ/สัตว์รั่วข้ามชุด แม้มีหลายภาพหรือสัตว์หลายตัว แต่ละตัวต้องมีอย่างน้อยสอง session และสองวันถ่าย ภาพ exact/decoded ซ้ำหรือ dHash ต่างกันไม่เกินสองบิตทำให้ snapshot ถูกปฏิเสธให้ทบทวนใหม่

ขั้นต่ำสิบกลุ่มเจ้าของช่วยให้ทดลองแบ่งชุดได้ ไม่ใช่จำนวนเพียงพอสำหรับกล่าวอ้างความแม่นยำ แต่ละ partition ต้องมีอย่างน้อยสองสัตว์ ระบบแจ้งข้อมูลไม่พอเมื่อเงื่อนไขนี้ไม่ครบ ไม่สุ่มแบ่งรูปของน้องตัวเดิมเพื่อทำตัวเลขให้ดูดี

baseline ใช้ CNN ขนาดเล็กที่เริ่มจากน้ำหนักสุ่ม ไม่ดาวน์โหลด pretrained weights ฝึก cross entropy ร่วมกับ cosine triplet loss โดย positive เป็นสัตว์ตัวเดียวกันจากคนละวันและคนละ session ส่วน negative เป็นสัตว์ต่างตัวในชนิดเดียวกัน เก็บ embedding แบบ normalize และหัวจำแนกของชุดฝึก ผู้ใช้ยังต้องตรวจว่าภาพมองเห็นสัตว์ชัดและไม่มีข้อมูลที่ไม่ควรเรียนรู้

gallery ใช้หนึ่งภาพของแต่ละตัวจากวันแรก โดยเลือกมุมหน้าตรงก่อน probe ต้องเป็นวันหลังจาก gallery และคนละ session วันที่เป็นข้อมูลที่เจ้าของระบุ ไม่ถือเป็นหลักฐานวันถ่ายหรือตัวเดิมที่พิสูจน์แล้ว

## วัดความแม่นยำอย่างไร

ตั้ง operating threshold ด้วยข้อมูล calibration เท่านั้น ค่าเริ่มต้นพยายามจำกัด FMR ที่ 0.001 และ FPIR ที่ 0.01 ตามผลที่สังเกตในชุดนั้น ตัวเลขนี้เป็นเป้าหมายที่ใช้เลือก threshold ไม่ใช่คำรับรองว่าโมเดลทำได้จริง ห้ามเลือก threshold หรือปรับ hyperparameter จาก test report แล้วนำรายงานเดิมมาใช้เป็นหลักฐาน

| งาน | สิ่งที่รายงาน | ความหมาย |
| --- | --- | --- |
| เทียบสองภาพ | FMR และ FNMR | จับคู่คนละตัวผิด / ปฏิเสธภาพตัวเดียวกันผิด ณ threshold จาก calibration |
| ค้นหาตัวที่มีในฐาน | rank-1 และ rank-5 | พบตัวที่ถูกเป็นอันดับแรก / อยู่ในห้าอันดับแรก พร้อมจำนวนสัตว์ใน gallery |
| ค้นหาแบบมีตัวนอกฐาน | FPIR และ FNIR ที่ rank-1 | probe ของตัวที่ไม่อยู่ในฐานกลับถูกเสนอเป็นตัวในฐาน / ตัวในฐานไม่ถูกคืนเป็นอันดับแรกเหนือ threshold |
| ความไวต่อ threshold | ROC | เส้นพฤติกรรมใน test เพื่อศึกษา ไม่ใช้เลือก operating threshold |
| จุดอ่อนของข้อมูล | แยก cat/dog, มุมภาพ และจำนวนวันห่าง | ใช้ threshold เดิม ดูจำนวนข้อมูลและ error แต่ละกลุ่ม |

impostor/search ใช้ชนิดสัตว์เดียวกันเพื่อไม่ให้การแยกแมวออกจากหมาช่วยทำคะแนนง่ายขึ้น open-set กันเจ้าของส่วนหนึ่งออกจาก gallery พร้อมสัตว์ทุกตัวของเจ้าของคนนั้น จึงไม่มีสัตว์อีกตัวของเจ้าของ probe ที่ถูกนับเป็น unknown อยู่ใน gallery โดยแบ่งกลุ่มตามชนิดสัตว์ที่เจ้าของมี ถ้าจำนวนกลุ่มไม่พอ รายงานจะมีค่า open-set ที่ข้อมูลไม่พอ ถ้า gallery ไม่ถึงห้าตัว รายงานระบุว่า rank-5 เป็นกรณีที่ง่ายเพราะฐานเล็ก

ช่วงความเชื่อมั่นใช้ cluster bootstrap 500 รอบ โดย resample กลุ่มเจ้าของและสัตว์ของ probe แยกกัน มีความหมายภายใต้ gallery เดิม ไม่เอาจำนวนคู่เทียบที่แชร์น้องตัวเดิมมานับเป็นตัวอย่างอิสระ กลุ่มต่ำกว่าสิบกลุ่มจะไม่ให้ช่วงความเชื่อมั่น หากไม่เห็น error เลยก็ไม่แสดงช่วง `[0, 0]` ที่อาจทำให้เข้าใจว่าพิสูจน์ error เป็นศูนย์แล้ว ไม่มีข้อมูลจะเป็น `insufficient_data` พร้อมค่า `null`

รายงานเป็น `research_baseline` หรือ `synthetic_smoke_only` และ `deploymentEligible: false` เสมอ ยังไม่มี auto-promotion ต้องทดสอบ cohort ใหม่ที่มีตัวจริงซึ่งตรวจหลักฐานแล้ว วัดหลาย seed ที่กำหนดไว้ล่วงหน้า ทดสอบสัตว์หน้าคล้ายกัน แสง มุม อายุ การบดบัง และขนาด gallery ตามธุรกิจ ก่อนใช้งานด้านคอนโด ภาครัฐ หรือประกัน ต้องเพิ่มการประเมินการปลอมภาพ/liveness, protocol เฉพาะกรณีใช้ และ model registry ที่ตรวจ consent ก่อนเสิร์ฟด้วย

pseudonym เปลี่ยนเมื่อสร้าง export ใหม่ การทำ benchmark หลายรุ่นต้องมี registry ของ holdout cohort แบบส่วนตัวที่ตรวจสิทธิ์ปัจจุบัน เพื่อไม่ให้สัตว์ใน test เดิมย้อนกลับไปอยู่ใน train ของรุ่นถัดไป การแยก partition ของ pipeline นี้รับรองการแยกภายใน snapshot เดียว ยังไม่ใช่ registry ป้องกันการรั่วข้ามทุกเวอร์ชันของโครงการ

## หลักฐานที่ใช้เลือกวิธี

[PetFace, ECCV 2024](https://arxiv.org/abs/2407.13555) มี benchmark ทั้งตัวที่เคยเห็นและ verification ของตัวที่ไม่เคยเห็น จึงใช้แนวทางทดสอบสัตว์ที่แยกจากชุดฝึก แทนการกล่าวอ้างจากรูปใหม่ของตัวเดิมที่โมเดลเคยเรียนรู้

[NIST FRTE 1:N](https://pages.nist.gov/frvt/html/frvt1N.html) แยก FPIR ของ non-mated searches ออกจาก FNIR ของ mated searches และรายงานขนาด gallery จึงใช้สองค่าร่วมกันสำหรับ open-set แทนการใช้ rank-1 อย่างเดียว งาน NIST เป็นการประเมินใบหน้ามนุษย์ เรานำแนววัดมาใช้ ไม่อ้างว่า NIST รับรองโมเดลสัตว์ของเรา

[เอกสาร PyTorch TripletMarginLoss](https://docs.pytorch.org/docs/2.14/generated/torch.nn.TripletMarginLoss.html) อธิบายการเรียนรู้จาก anchor/positive/negative baseline นี้ใช้ cosine triplet ที่เขียนตรงใน PyTorch พร้อม loss จำแนก และไม่มีการนำคะแนนความคล้ายของ LLM มาอ้างเป็น embedding biometric ที่ฝึกแล้ว
