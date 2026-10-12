'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, Eye, ScanLine } from 'lucide-react';
import { api, ApiError, json, messageOf } from '../../shared/api';
import { useLocale } from '../../shared/locale';
import { Busy, ErrorBox, Notice } from './ui';
import { mergePetidCheck, newPetidCheckRequest, petidCheckSummary, type PetidCaptureCheck, type PetidCheckConsistency, type PetidCheckRequest, type PetidCheckScope, type PetidCheckState, type PetidPhotoIssue } from './petid-check-model';
import './petid-checks.css';

type CheckPhoto = { id: string; url: string; angle: string };
export default function PetidChecks({ petId, sessionId, samples, consentVersion, demo }: { petId: string; sessionId: string; samples: CheckPhoto[]; consentVersion: number; demo: boolean }) {
  const { locale, t } = useLocale();
  const localeRef = useRef(locale); localeRef.current = locale;
  const [expanded, setExpanded] = useState(false), [data, setData] = useState<PetidCheckState | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [permission, setPermission] = useState(false);
  const [error, setError] = useState<unknown>(null), [waiting, setWaiting] = useState(false);
  const attempt = useRef<PetidCheckRequest | null>(null), generation = useRef(0), pending = useRef<AbortController | null>(null);
  const base = `/biometric/pets/${petId}/research/sessions/${sessionId}/checks`;
  useEffect(() => { generation.current++; setExpanded(false); setData(null); setPermission(false); setWaiting(false); setError(null); setLoading(false); setBusy(false); attempt.current = null; return () => { generation.current++; pending.current?.abort(); }; }, [petId, sessionId, demo]);
  const latest = data?.checks[0];
  function checkError(cause: unknown) {
    if (cause instanceof ApiError) {
      if (cause.code === 'CAPTURE_CHECK_IN_PROGRESS') return t('ชุดรูปนี้กำลังตรวจอยู่ ลองโหลดผลอีกครั้งเมื่อพร้อม', 'This photo set is being checked. Refresh the results when ready.');
      if (cause.code === 'CAPTURE_CHECK_STALE') return t('ชุดรูปหรือความยินยอมเปลี่ยนแล้ว ต้องตรวจใหม่โดยใช้ข้อมูลล่าสุด', 'The photo set or consent changed. A new check with current data is required.');
      if (cause.code === 'CAPTURE_IMAGES_CHANGED') return t('มีรูปที่ถูกลบหรือยังไม่พร้อม กรุณาเพิ่มชุดรูปใหม่ก่อนตรวจ', 'Some photos were removed or are unavailable. Add a new photo set before checking.');
      if (cause.code === 'CAPTURE_IMAGE_INVALID') return t('อ่านรูปนี้ไม่ได้ กรุณาอัปโหลดรูปใหม่', 'This photo could not be read. Please upload a new image.');
    }
    if (cause instanceof TypeError) return t('เชื่อมต่อผลตรวจไม่สำเร็จ กรุณาลองอีกครั้ง', 'Could not retrieve the check. Please try again.');
    return messageOf(cause, localeRef.current);
  }
  async function loadResults() {
    if (demo || loading || busy) return;
    const run = generation.current, abort = new AbortController(); pending.current = abort;
    setLoading(true); setError(null);
    try { const next = await api<PetidCheckState>(base, { signal: abort.signal }); if (run === generation.current) setData(next); }
    catch (cause) { if (run === generation.current && !abort.signal.aborted) setError(cause); }
    finally { if (run === generation.current) setLoading(false); }
  }
  async function runCheck() {
    if (demo || busy || loading || (!attempt.current && !permission)) return;
    if (!attempt.current) attempt.current = newPetidCheckRequest();
    const request = attempt.current, run = generation.current, abort = new AbortController(); pending.current = abort;
    setBusy(true); setError(null); setWaiting(false);
    try {
      // The endpoint deduplicates its durable requestId. Replaying a generic
      // HTTP cache could otherwise retain a transient "still processing" result.
      const result = await api<PetidCaptureCheck>(base, { ...json('POST', request), signal: abort.signal });
      if (run !== generation.current) return;
      setData(current => mergePetidCheck(current, result));
      if (result.status !== 'processing') { attempt.current = null; setPermission(false); }
      else setWaiting(true);
    } catch (cause) { if (run === generation.current && !abort.signal.aborted) { setWaiting(cause instanceof ApiError && cause.code === 'CAPTURE_CHECK_IN_PROGRESS'); setError(cause); } }
    finally { if (run === generation.current) setBusy(false); }
  }
  const issueText = (issue: PetidPhotoIssue) => ({
    too_small: t('รูปเล็กเกินไป ถ่ายให้ละเอียดขึ้นและอย่าซูมจากรูปเล็ก', 'The image is too small. Take a higher-resolution photo rather than enlarging a small image.'),
    too_dark: t('รูปมืดเกินไป ลองถ่ายในแสงธรรมชาติที่สว่างสม่ำเสมอ', 'The image is too dark. Try even natural light.'),
    too_bright: t('แสงสว่างกลบรายละเอียด ลองหลบแดดจัดหรือแฟลช', 'Bright areas hide detail. Avoid harsh sunlight or flash.'),
    blur_or_low_detail: t('รูปเบลอหรือรายละเอียดน้อย ลองแตะโฟกัสที่น้องและถือกล้องให้นิ่ง', 'The image is blurred or has little detail. Focus on your pet and hold the camera steady.'),
    duplicate_exact: t('รูปนี้ซ้ำกับภาพที่เก็บแล้ว ใช้รูปที่ถ่ายใหม่อีกมุมหรืออีกเวลา', 'This repeats an existing image. Take a new photo from another angle or at another time.'),
    near_duplicate: t('ภาพคล้ายรูปเดิมมาก ให้คนตรวจเพิ่ม หรือถ่ายอีกมุมที่ต่างชัดเจน', 'This looks very similar to another image. It needs review, or a clearly different angle.'),
  })[issue];
  const angleText = (angle: string) => { const names = { front: t('หน้าตรง', 'Front'), left: t('ด้านซ้าย', 'Left side'), right: t('ด้านขวา', 'Right side'), full_body: t('เต็มตัว', 'Full body'), nose_detail: t('รายละเอียดจมูก', 'Nose detail'), distinctive_mark: t('จุดสังเกต', 'Distinctive marking') }; return names[angle as keyof typeof names] ?? t('รูปของน้อง', 'Pet photo'); };
  const consistencyText = (verdict: PetidCheckConsistency) => ({ possible_same: t('ลักษณะที่เห็นอาจเป็นน้องตัวเดิม ยังยืนยันตัวตนไม่ได้', 'Visible features may match the same pet; identity is unproven.'), different: t('ลักษณะที่เห็นขัดกันบางจุด ต้องตรวจหลักฐานเพิ่มเติม', 'Some visible features conflict. Further evidence review is needed.'), insufficient: t('ยังมีรายละเอียดไม่พอสำหรับเปรียบเทียบ', 'Not enough visible detail for comparison.') })[verdict];
  const scopeText = (scope: PetidCheckScope) => ({ within_session: t('เทียบเฉพาะรูปในชุดนี้', 'Compared only within this photo set'), previous_session: t('เทียบกับรูปในชุดที่เคยเก็บไว้', 'Compared with a previously saved photo set'), enrollment_anchor: t('เทียบกับรูปอ้างอิงที่ใช้ลงทะเบียน PetID', 'Compared with the PetID registration reference'), no_reference: t('ยังไม่มีภาพอ้างอิงที่พอใช้เทียบ', 'No usable comparison reference') })[scope];
  const summaryText = latest ? ({ processing: t('กำลังตรวจชุดรูป', 'Checking this photo set'), failed: t('ตรวจครั้งนี้ไม่สำเร็จ', 'This check did not complete'), retake: t('มีรูปที่ควรถ่ายใหม่', 'Some photos need retaking'), different: t('พบลักษณะที่อาจเป็นคนละตัว', 'Some visible features may belong to different pets'), insufficient: t('ยังมีข้อมูลไม่พอให้เปรียบเทียบ', 'There is not enough evidence to compare'), possible_same: t('ลักษณะที่เห็นอาจสอดคล้องกับน้องตัวเดิม', 'Visible features may be consistent with the same pet') })[petidCheckSummary(latest)] : '';

  return <details className="petid-checks" open={expanded} onToggle={event => { const open = event.currentTarget.open; setExpanded(open); if (open && !data && !loading && !demo) void loadResults(); }}>
    <summary><ScanLine size={18}/><span>{t('ตรวจคุณภาพรูปและความสอดคล้อง', 'Photo quality and same-pet checks')}</span><ChevronDown size={17}/></summary>
    <div className="petid-checks-body">
      <p className="petid-checks-intro">{t('ตรวจแสง ความคมชัด และภาพซ้ำ ก่อนให้ AI ช่วยเปรียบเทียบลักษณะที่เห็น การตรวจนี้ยังไม่พิสูจน์ว่าเป็นน้องตัวเดิม', 'Checks lighting, detail and repeated images before AI compares visible features. This does not prove that the photos show the same pet.')}</p>
      {demo ? <Notice>{t('เข้าสู่ระบบ LINE เพื่อส่งชุดรูปจริงให้ตรวจ ตัวอย่างนี้ไม่เรียก AI และไม่ฝึกโมเดล', 'Sign in with LINE to check a real photo set. The demo does not call AI or train a model.')}</Notice> : <>
        {loading ? <Busy label={t('กำลังโหลดผลที่เคยตรวจ', 'Loading saved check results')}/> : null}
        {latest ? <section className={`petid-check-result ${petidCheckSummary(latest)}`} aria-label={t('ผลตรวจชุดรูป', 'Photo-set check result')}>
          <h4><Eye size={18}/>{summaryText}</h4><p>{scopeText(latest.comparisonScope)}</p>
          {latest.status === 'completed' ? <><div className="petid-check-ai-outcome"><b>{t('ข้อสังเกตจาก AI', 'AI visual comparison')}</b><p>{consistencyText(latest.consistency)}</p></div><ul className="petid-check-observations">{latest.observations.map((item, index) => <li key={index}>{item}</li>)}</ul><div className="petid-check-limits"><b>{t('ข้อจำกัดของการเปรียบเทียบ', 'Comparison limitations')}</b><p>{latest.limitations}</p></div><small className="petid-check-source-language">{t('ข้อสังเกตและข้อจำกัดแสดงตามภาษาที่ใช้ในการตรวจครั้งนั้น', 'Observations and limitations are shown in the language used for that check.')}</small><div className="petid-check-samples">{latest.samples.map((sample, index) => { const photo = samples.find(item => item.id === sample.sampleId); return <article className={`petid-check-sample ${sample.quality}`} key={sample.sampleId}>{photo ? <img src={photo.url} alt={angleText(photo.angle)}/> : <Camera size={22}/>}<div><b>{photo ? angleText(photo.angle) : t(`รูปที่ ${index + 1}`, `Photo ${index + 1}`)}</b><span>{({ acceptable: t('ผ่านเกณฑ์ภาพเบื้องต้น', 'Meets basic photo checks'), retake: t('ควรถ่ายใหม่', 'Retake this photo'), review: t('ต้องตรวจเพิ่มเติม', 'Needs further review') })[sample.quality]}</span>{sample.issues.length ? <ul>{sample.issues.map(issue => <li key={issue}>{issueText(issue)}</li>)}</ul> : <p>{t('ยังไม่พบปัญหาแสง ขนาด หรือความคมชัดตามเกณฑ์เบื้องต้น', 'No lighting, size or detail issue was flagged by the basic checks.')}</p>}<small>{sample.width} × {sample.height} px</small></div></article>; })}</div></> : latest.status === 'failed' ? <p>{t('ไม่มีผลยืนยันตัวตนจากครั้งนี้ คุณสามารถเลือกตรวจใหม่ได้', 'This attempt did not verify identity. You can choose to run a new check.')}</p> : <p>{t('ยังไม่ต้องส่งคำขอใหม่ กดโหลดผลเพื่อดูความคืบหน้า', 'A new request is not needed yet. Refresh the results to check progress.')}</p>}
          {latest.consentVersion !== undefined && latest.consentVersion !== consentVersion ? <Notice>{t('ผลนี้ใช้ตัวเลือกความยินยอมรุ่นก่อน หากจะตรวจทบทวนเพื่อฝึกโมเดลต้องตรวจใหม่ด้วยตัวเลือกปัจจุบัน', 'This result used an earlier consent revision. A new check under the current choices is required before training review.')}</Notice> : null}
        </section> : !loading && data ? <p className="muted">{t('ชุดรูปนี้ยังไม่ได้ตรวจ', 'This photo set has not been checked yet.')}</p> : null}
        {data?.reviews.length ? <p className="petid-check-review-note">{data.reviews[0]?.decision === 'approved' ? t('มีผู้ตรวจทบทวนหลักฐานแล้ว การใช้ฝึกโมเดลยังต้องมีความยินยอมปัจจุบันและผ่านเงื่อนไขชุดข้อมูล', 'An independent reviewer assessed the evidence. Training use still requires current consent and dataset eligibility.') : t('ชุดนี้ไม่ผ่านการทบทวนหลักฐาน กรุณาตรวจรายละเอียดก่อนเพิ่มชุดใหม่', 'This set did not pass evidence review. Check the details before adding a new set.')}</p> : null}
        <p className="petid-check-identity-note">{t('AI ให้เพียงข้อสังเกต ไม่ใช่ผลยืนยันชีวมิติหรือคะแนนความแม่นยำ คำยืนยันของเจ้าของยังแสดงว่าไม่ได้ยืนยันอิสระ', 'AI provides observations, not biometric proof or an accuracy score. Owner confirmation remains an unverified attestation.')}</p>
        <label className="check-field"><input type="checkbox" checked={permission} disabled={busy || !!attempt.current} onChange={event => setPermission(event.target.checked)}/>{t('ฉันอนุญาตให้ส่งรูปชุดนี้และภาพอ้างอิงของน้องที่ระบบเลือกไปยัง OpenAI เพื่อเปรียบเทียบครั้งนี้ ไม่ใช่ความยินยอมฝึกโมเดล', 'I allow this photo set and a reference photo of my pet selected by the system to be sent to OpenAI for this comparison. This does not grant model-training consent.')}</label>
        {error ? <ErrorBox message={checkError(error)}/> : null}
        {busy ? <Busy label={t('กำลังตรวจรูป โปรดรอในหน้านี้', 'Checking photos. Please wait on this page.')}/> : null}
        <div className="form-actions"><button type="button" className="button secondary small" disabled={busy || loading || (!permission && !attempt.current)} onClick={() => void runCheck()}><ScanLine size={17}/>{attempt.current ? t('ลองขอผลตรวจเดิมอีกครั้ง', 'Retry the same check request') : latest ? t('เริ่มตรวจชุดนี้ใหม่', 'Run a new check') : t('ตรวจชุดรูปนี้', 'Check this photo set')}</button><button type="button" className="text-button" disabled={busy || loading} onClick={() => void loadResults()}>{t('โหลดผลตรวจล่าสุด', 'Refresh results')}</button></div>
        {waiting ? <small>{t('การขอผลซ้ำใช้รหัสคำขอเดิม ไม่เริ่มตรวจภาพเพิ่ม', 'Retries use the same request ID and do not start another image check.')}</small> : null}
      </>}
    </div>
  </details>;
}
