import { api } from './api';
import { translate, type Locale } from './locale-core';

export async function uploadPetPhoto(file: File, petId: string, locale: Locale): Promise<{id: string; url: string}> {
  if (!file.type.startsWith('image/')) throw new Error(translate(locale, 'กรุณาเลือกไฟล์รูปภาพ', 'Please choose an image file.'));
  if (file.size > 8 * 1024 * 1024) throw new Error(translate(locale, 'ใช้รูปขนาดไม่เกิน 8 MB ต่อรูป', 'Use a photo no larger than 8 MB.'));
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(translate(locale, 'อ่านรูปนี้ไม่ได้ ลองเลือกรูป JPG, PNG หรือ WebP แทน', 'This photo could not be read. Please try a JPG, PNG or WebP image.')); }
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error(translate(locale, 'เตรียมรูปไม่สำเร็จ กรุณาลองอีกครั้ง', 'Could not prepare the photo. Please try again.'));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(translate(locale, 'เตรียมรูปไม่สำเร็จ', 'Could not prepare the photo.'))), 'image/jpeg', .85));
    if (blob.size > 3.5 * 1024 * 1024) throw new Error(translate(locale, 'รูปยังมีขนาดใหญ่เกินไป ลองถ่ายใหม่หรือครอปรูปก่อน', 'The photo is still too large. Try taking it again or cropping it first.'));
    const form = new FormData(); form.set('file', blob, 'pet-photo.jpg'); form.set('petId', petId);
    return await api<{id: string; url: string}>('/media/upload', { method: 'POST', body: form });
  } finally { bitmap.close(); }
}
