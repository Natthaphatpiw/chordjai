export const MAX_BOOKLET_PAGES = 10;
export const MAX_BOOKLET_IMAGE_BYTES = 8 * 1024 * 1024;

export interface BookletPage {
  id: string;
  blob: Blob;
  previewUrl: string;
  uploadedUrl?: string;
}

export function moveBookletPage<T>(pages: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= pages.length || to >= pages.length) return pages;
  const next = [...pages];
  const [page] = next.splice(from, 1);
  next.splice(to, 0, page);
  return next;
}

/** Re-encoding removes EXIF location data and keeps uploads below API limits. */
export async function prepareBookletPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('IMAGE_PREPARATION_FAILED'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob && blob.size < 3.5 * 1024 * 1024 ? resolve(blob) : reject(new Error('IMAGE_PREPARATION_FAILED')), 'image/jpeg', .82));
}

/** Keep response-retry payloads immutable, with stable identity per scanned row. */
export function bookletSaveKey(scanId: string, recordIndex: number): string {
  return `ocr-${scanId}-${recordIndex}`;
}

export function validBookletDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2200) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readyBookletEntry(entry: { title: string; recordedAt: string | null; nextDueAt?: string | null }): boolean {
  return !!entry.title.trim() && validBookletDate(entry.recordedAt)
    && (!entry.nextDueAt || (validBookletDate(entry.nextDueAt) && entry.nextDueAt >= entry.recordedAt!));
}

export function humanBookletWarning(warning: string, english: boolean): string {
  const text = warning.trim();
  const hasLot=/\blot\b|\bbatch\b|ล็อต/iu.test(text);
  if (/\bvalue\b|\bnull\b|\bISO\b/i.test(text)&&hasLot) return english
    ? 'The lot number could not be read clearly. Compare it with the original booklet.'
    : 'อ่านหมายเลขล็อตได้ไม่ชัด โปรดตรวจจากสมุดต้นฉบับ';
  if (/\bvalue\b|\bnull\b|\bISO\b/i.test(text)) return english
    ? 'Some details could not be read clearly. Compare the empty fields with the original booklet.'
    : 'บางข้อมูลอ่านได้ไม่ชัด โปรดตรวจช่องที่ยังว่างกับสมุดต้นฉบับ';
  if (/\bEXP\b/i.test(text)&&hasLot) return text.replace(/\bEXP\b/gi,english?'expiry date':'วันหมดอายุ');
  if (/\bEXP\b/i.test(text)) return english
    ? 'A vaccine expiry date is different from the next appointment. Please check the appointment written in the booklet.'
    : 'วันหมดอายุของวัคซีนไม่ใช่วันนัดครั้งถัดไป โปรดตรวจวันนัดที่เขียนในสมุด';
  return text;
}

/** Baseline review instructions already cover generic empty/expiry warnings. */
export function specificBookletWarnings(warnings: string[], english: boolean): string[] {
  return [...new Set(warnings.filter(warning=>{
    const specific=/\blot\b|\bbatch\b|ล็อต|\bpage\s+\d+|หน้า\s*\d+/iu.test(warning);
    const generic=/\bvalue\b|\bnull\b|\bISO\b|\bEXP\b|expiry date|expiration date|วันหมดอายุ/iu.test(warning);
    return !generic||specific;
  }).map(warning=>humanBookletWarning(warning,english)).filter(Boolean))];
}
