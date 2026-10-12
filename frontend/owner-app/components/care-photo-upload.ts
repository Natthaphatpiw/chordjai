import { api } from '../../shared/api';
import { translate, type Locale } from '../../shared/locale-core';

export interface CarePhotoUploadRequest {
  key: string;
  body: Blob;
  contentType: string;
}

/** Keep the multipart bytes, boundary and request ID together for a safe retry. */
export async function encodeCarePhotoUpload(blob: Blob, petId: string, key = crypto.randomUUID()): Promise<CarePhotoUploadRequest> {
  const form = new FormData();
  form.set('file', blob, 'care-photo.jpg');
  form.set('petId', petId);
  const encoded = new Request('http://localhost/care-photo-upload', { method: 'POST', body: form });
  return { key, body: await encoded.blob(), contentType: encoded.headers.get('Content-Type')! };
}

export async function prepareCarePhotoUpload(file: File, petId: string, locale: Locale): Promise<CarePhotoUploadRequest> {
  if (!file.type.startsWith('image/')) throw new Error(translate(locale, 'กรุณาเลือกไฟล์รูปภาพ', 'Please choose an image file.'));
  if (file.size > 8 * 1024 * 1024) throw new Error(translate(locale, 'ใช้รูปขนาดไม่เกิน 8 MB ต่อรูป', 'Use a photo no larger than 8 MB.'));
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(translate(locale, 'อ่านรูปนี้ไม่ได้ ลองเลือกรูป JPG, PNG หรือ WebP แทน', 'This photo could not be read. Please try a JPG, PNG or WebP image.')); }
  try {
    // Re-encode before upload: keeps orientation and removes EXIF/location data.
    const canvas = document.createElement('canvas'), scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error(translate(locale, 'เตรียมรูปไม่สำเร็จ กรุณาลองอีกครั้ง', 'Could not prepare the photo. Please try again.'));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(translate(locale, 'เตรียมรูปไม่สำเร็จ', 'Could not prepare the photo.'))), 'image/jpeg', .85));
    if (blob.size > 3.5 * 1024 * 1024) throw new Error(translate(locale, 'รูปยังใหญ่เกินไป ลองถ่ายใหม่หรือครอปรูปก่อน', 'The photo is still too large. Try taking it again or cropping it first.'));
    return encodeCarePhotoUpload(blob, petId);
  } finally { bitmap.close(); }
}

export function carePhotoUploadInit(request: CarePhotoUploadRequest): RequestInit {
  return { method: 'POST', body: request.body, headers: { 'Content-Type': request.contentType, 'Idempotency-Key': request.key } };
}

export async function uploadPreparedCarePhoto(request: CarePhotoUploadRequest, refreshLink = false): Promise<{ id: string; url: string }> {
  const uploaded = await api<{ id: string; url: string }>('/media/upload', carePhotoUploadInit(request));
  // A cached upload response can contain an expired private read token.
  // Refresh only when replaying a prepared request after a failed attempt.
  return refreshLink ? api<{ id: string; url: string }>(`/media/${uploaded.id}/link`) : uploaded;
}
