import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const base = new URL('../frontend/owner-app/', import.meta.url);
const emblem = new URL('public/brand/chordjai-emblem.png', base);
const logo = new URL('public/brand/chordjai-logo.png', base);

// Remove only the outer whitespace. Keep the owner's original artwork intact.
async function artwork(path) {
  const { data, info } = await sharp(path.pathname).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const [r, g, b] = data.subarray(i, i + 3);
    if ((r > 170 && g < 160 && b < 120) || (r < 120 && g < 120 && b < 120)) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error('Brand artwork not found');
  return sharp(path.pathname).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
}

const mark = await artwork(emblem);
async function icon(size) {
  const padding = Math.max(1, Math.round(size * 0.05));
  return sharp(mark).resize(size - padding * 2, size - padding * 2, { fit: 'contain', background: '#fff' })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#fff' }).ensureAlpha().png().toBuffer();
}
await writeFile(new URL('app/icon.png', base), await icon(192));
await writeFile(new URL('app/apple-icon.png', base), await icon(180));

// PNG-backed ICO with small browser-tab sizes and a high resolution fallback.
const sizes = [16, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(icon));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((bytes, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i] === 256 ? 0 : sizes[i];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bytes.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile(new URL('app/favicon.ico', base), Buffer.concat([header, ...images]));

const lockup = await sharp(await artwork(logo)).resize(540, 540, { fit: 'contain', background: '#fff' }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#fff' } })
  .composite([{ input: lockup, left: 330, top: 45 }]).png()
  .toFile(new URL('public/brand/chordjai-social.png', base).pathname);
console.log('Generated favicon, browser icon, Apple icon and social preview from the original ChordJai logos.');
