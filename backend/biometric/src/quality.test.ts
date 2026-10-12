import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { inspectCaptureImage, markDuplicates, dhashDistance } from './quality';
async function image(width=640,height=640,mode:'texture'|'dark'|'light'|'flat'='texture') {
  const pixels=Buffer.alloc(width*height*3);
  for(let i=0;i<pixels.length;i++)pixels[i]=mode==='dark'?0:mode==='light'?255:mode==='flat'?120:40+((i*73+(i>>8)*31)%180);
  const bytes=await sharp(pixels,{raw:{width,height,channels:3}}).jpeg({quality:90}).toBuffer();
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
describe('PetID deterministic normalized image gates',()=>{
  it('accepts sufficiently large textured image and fingerprints repeatably',async()=>{
    const value=await image(),a=await inspectCaptureImage(value),b=await inspectCaptureImage(value);
    expect(a).toEqual(b);expect(a.quality).toBe('acceptable');expect(a.width).toBe(640);expect(a.imageSha256).toMatch(/^[a-f0-9]{64}$/);expect(a.decodedSha256).not.toEqual(a.imageSha256);expect(a.dhash).toHaveLength(16);
  });
  it('requests retake for small, clipped-dark, clipped-bright and flat images',async()=>{
    for(const [w,h,mode,issue] of [[200,500,'texture','too_small'],[640,640,'dark','too_dark'],[640,640,'light','too_bright'],[640,640,'flat','blur_or_low_detail']] as const){const result=await inspectCaptureImage(await image(w,h,mode));expect(result.quality).toBe('retake');expect(result.issues).toContain(issue);}
  });
  it('marks exact duplicates as retake while near hashes remain a review signal',async()=>{
    const result=await inspectCaptureImage(await image());const pair=markDuplicates([result,result]);expect(pair[0].quality).toBe('acceptable');expect(pair[1].issues).toContain('duplicate_exact');expect(pair[1].quality).toBe('retake');
    const near={...result,decodedSha256:'f'.repeat(64),dhash:result.dhash};const marked=markDuplicates([near],[result]);expect(marked[0].quality).toBe('review');expect(marked[0].issues).toContain('near_duplicate');expect(dhashDistance('0000000000000000','ffffffffffffffff')).toBe(64);
  });
  it('rejects invalid payload and corrupt JPEG rather than manufacturing quality evidence',async()=>{
    await expect(inspectCaptureImage('https://example.com/image.jpg')).rejects.toMatchObject({code:'CAPTURE_IMAGE_INVALID'});
    await expect(inspectCaptureImage('data:image/jpeg;base64,YWJj')).rejects.toMatchObject({code:'CAPTURE_IMAGE_INVALID'});
  });
});
