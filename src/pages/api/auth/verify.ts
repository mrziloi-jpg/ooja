import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { createSession, verifyOtp } from '~/lib/auth';
import { getCartId } from '~/lib/cart';
import { normalizePhone, toEn } from '~/lib/format';
import { body, clientIp, fail, json } from '~/lib/http';
import { rateLimit } from '~/lib/ratelimit';

export const POST: APIRoute = async (ctx) => {
  if (!(await rateLimit(`verify:${clientIp(ctx)}`, 30, 3600))) return fail('تعداد تلاش‌ها بیش از حد مجاز است.', 429);
  const b = await body(ctx.request, z.object({ phone: z.string().max(20), code: z.string().max(10), wish: z.array(z.number().int()).max(200).optional() }));
  const phone = b && normalizePhone(b.phone);
  if (!b || !phone) return fail('درخواست نامعتبر است.');

  const user = await verifyOtp(phone, toEn(b.code).trim());
  if (!user) return fail('کد واردشده درست نیست یا منقضی شده است.');

  await createSession(ctx.cookies, user.id);
  // Attach the guest cart and merge the guest wishlist into the account.
  const cartId = getCartId(ctx.cookies);
  if (cartId) await db.update(s.carts).set({ userId: user.id }).where(eq(s.carts.id, cartId));
  if (b.wish?.length) {
    await db.insert(s.wishlist).values(b.wish.map((productId) => ({ userId: user.id, productId }))).onConflictDoNothing().catch(() => {});
  }
  return json({ ok: true, isNew: !user.firstName, role: user.role });
};
