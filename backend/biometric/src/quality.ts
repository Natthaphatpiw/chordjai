import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { PetidQualityResult } from '@chordjai/contracts';
import { HttpError } from '@chordjai/service-kit';

const round = (value: number) => Math.round(value * 10000) / 10000;
/** Heuristic quality gates on the standardized private media JPEG; not an accuracy score. */
export async function inspectCaptureImage(image: string): Promise<PetidQualityResult> {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) throw new HttpError(400, 'CAPTURE_IMAGE_INVALID', 'รูปต้องผ่านระบบอัปโหลดก่อนตรวจ');
  const bytes = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new HttpError(400, 'CAPTURE_IMAGE_INVALID', 'อ่านรูปไม่ได้');
  try {
    const decoded = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const { width, height } = decoded.info;
    const grey = await sharp(bytes).rotate().resize(256,256,{fit:'fill',kernel:'nearest'}).greyscale().raw().toBuffer();
    let sum = 0, dark = 0, light = 0, lapSum = 0, lapSquare = 0, lapCount = 0;
    for (const value of grey) { sum += value; dark += Number(value <= 10); light += Number(value >= 245); }
    for (let y = 1; y < 255; y++) for (let x = 1; x < 255; x++) {
      const at = y * 256 + x;
      const lap = grey[at-1]! + grey[at+1]! + grey[at-256]! + grey[at+256]! - 4 * grey[at]!;
      lapSum += lap; lapSquare += lap * lap; lapCount++;
    }
    const metrics = { meanLuminance: round(sum / grey.length), clippedDarkFraction: round(dark / grey.length), clippedLightFraction: round(light / grey.length), laplacianVariance: round(Math.max(0, lapSquare / lapCount - (lapSum / lapCount) ** 2)) };
    const issues: PetidQualityResult['issues'] = [];
    let quality: PetidQualityResult['quality'] = 'acceptable';
    if (width < 384 || height < 384) { issues.push('too_small'); quality = 'retake'; }
    if (metrics.meanLuminance < 35 || metrics.clippedDarkFraction > .45) { issues.push('too_dark'); quality = metrics.meanLuminance < 20 || metrics.clippedDarkFraction > .8 ? 'retake' : quality === 'retake' ? quality : 'review'; }
    if (metrics.meanLuminance > 225 || metrics.clippedLightFraction > .45) { issues.push('too_bright'); quality = metrics.meanLuminance > 242 || metrics.clippedLightFraction > .8 ? 'retake' : quality === 'retake' ? quality : 'review'; }
    if (metrics.laplacianVariance < 40) { issues.push('blur_or_low_detail'); quality = metrics.laplacianVariance < 12 ? 'retake' : quality === 'retake' ? quality : 'review'; }
    const pixels = await sharp(bytes).rotate().resize(9,8,{fit:'fill',kernel:'nearest'}).greyscale().raw().toBuffer();
    let bits = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | BigInt(pixels[y*9+x]! > pixels[y*9+x+1]!);
    return { quality, imageSha256: createHash('sha256').update(bytes).digest('hex'), decodedSha256: createHash('sha256').update(Buffer.from(`${width}x${height}:RGB\0`)).update(decoded.data).digest('hex'), dhash: bits.toString(16).padStart(16,'0'), width, height, metrics, issues };
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'CAPTURE_IMAGE_INVALID', 'รูปเสียหรือไม่สามารถอ่านพิกเซลได้ กรุณาอัปโหลดใหม่'); }
}
export function dhashDistance(first: string, second: string) {
  let value = BigInt(`0x${first}`) ^ BigInt(`0x${second}`), count = 0;
  while (value) { value &= value - 1n; count++; }
  return count;
}
export function markDuplicates(results: PetidQualityResult[], references: Pick<PetidQualityResult,'decodedSha256'|'dhash'>[] = []) {
  return results.map((result,index) => {
    const previous = [...references, ...results.slice(0,index)];
    if (previous.some(row => row.decodedSha256 === result.decodedSha256)) return { ...result, quality: 'retake' as const, issues: [...result.issues, 'duplicate_exact' as const] };
    // Perceptual hash proximity is only a review signal; similar coats can collide.
    if (previous.some(row => dhashDistance(row.dhash,result.dhash) <= 3)) return { ...result, quality: result.quality === 'retake' ? result.quality : 'review' as const, issues: [...result.issues, 'near_duplicate' as const] };
    return result;
  });
}
