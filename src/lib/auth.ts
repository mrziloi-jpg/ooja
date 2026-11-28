import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { and, eq, gt, desc } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { config } from './config';
import { sendOtp } from './sms';
import { rateLimit } from './ratelimit';

const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const OTP_TTL_SEC = 120;
const OTP_MAX_ATTEMPTS = 5;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export type SessionUser = typeof s.users.$inferSelect;

export async function requestOtp(phone: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Per-phone and per-IP limits protect the SMS budget from abuse.
  if (!(await rateLimit(`otp:phone:${phone}`, 1, 60))) return { ok: false, error: 'لطفاً یک دقیقه صبر کنید و دوباره تلاش کنید.' };
  if (!(await rateLimit(`otp:phone-day:${phone}`, 10, 86400))) return { ok: false, error: 'تعداد درخواست‌ها بیش از حد مجاز است. فردا دوباره تلاش کنید.' };
  if (!(await rateLimit(`otp:ip:${ip}`, 20, 3600))) return { ok: false, error: 'تعداد درخواست‌ها بیش از حد مجاز است.' };

  const code = config.fixedOtpCode || String(randomInt(10000, 100000));
  await db.delete(s.otpCodes).where(eq(s.otpCodes.phone, phone));
  await db.insert(s.otpCodes).values({ phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000) });
  await sendOtp(phone, code);
  return { ok: true };
}

export async function verifyOtp(phone: string, code: string): Promise<SessionUser | null> {
  const [otp] = await db.select().from(s.otpCodes)
    .where(and(eq(s.otpCodes.phone, phone), gt(s.otpCodes.expiresAt, new Date())))
    .orderBy(desc(s.otpCodes.createdAt)).limit(1);
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return null;

  const a = Buffer.from(otp.codeHash);
  const b = Buffer.from(sha256(`${phone}:${code}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(s.otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(s.otpCodes.id, otp.id));
    return null;
  }
  await db.delete(s.otpCodes).where(eq(s.otpCodes.phone, phone));

  const role = config.adminPhones.includes(phone) ? 'admin' : 'customer';
  const [user] = await db.insert(s.users).values({ phone, role })
    .onConflictDoUpdate({ target: s.users.phone, set: config.adminPhones.includes(phone) ? { role: 'admin' } : { phone } })
    .returning();
  return user;
}

export async function createSession(cookies: AstroCookies, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(s.sessions).values({ id: sha256(token), userId, expiresAt });
  cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd, expires: expiresAt });
}

export async function getSessionUser(cookies: AstroCookies): Promise<SessionUser | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db.select({ user: s.users }).from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, sha256(token)), gt(s.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export async function destroySession(cookies: AstroCookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(s.sessions).where(eq(s.sessions.id, sha256(token)));
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
