import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config';

const SIZES = [480, 960];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export const mediaRoot = () => path.resolve(config.mediaDir);

/**
 * Converts an uploaded product photo once, at upload time, into AVIF + WebP at 480 and 960 px wide (4:5 crop).
 * Returns the public base path, e.g. "/media/p/12/a1b2c3"; files are "<base>-480.avif", "<base>-960.webp", etc.
 */
export async function saveProductImage(productId: number, file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new Error('فقط تصاویر JPG، PNG، WebP یا AVIF مجاز است.');
  if (file.size > MAX_BYTES) throw new Error('حجم تصویر باید کمتر از ۱۰ مگابایت باشد.');

  const input = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(input).metadata().catch(() => null);
  if (!meta?.width) throw new Error('فایل تصویر معتبر نیست.');

  const dir = path.join(mediaRoot(), 'p', String(productId));
  await mkdir(dir, { recursive: true });
  const name = randomBytes(6).toString('hex');
  for (const w of SIZES) {
    const base = sharp(input).rotate().resize({ width: w, height: Math.round(w * 1.25), fit: 'cover', position: 'attention' });
    await base.clone().avif({ quality: 55, effort: 4 }).toFile(path.join(dir, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 78 }).toFile(path.join(dir, `${name}-${w}.webp`));
  }
  return `/media/p/${productId}/${name}`;
}

/** Deletes every size/format of a previously saved image. Ignores missing files. */
export async function deleteProductImage(base: string | null) {
  if (!base?.startsWith('/media/p/')) return;
  const rel = base.slice('/media/'.length);
  for (const w of SIZES) for (const ext of ['avif', 'webp']) {
    await rm(path.join(mediaRoot(), `${rel}-${w}.${ext}`), { force: true });
  }
}
