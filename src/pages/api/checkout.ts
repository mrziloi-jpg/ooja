import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getCartId } from '~/lib/cart';
import { STORE } from '~/lib/config';
import { normalizePhone, toEn } from '~/lib/format';
import { body, clientIp, fail, json } from '~/lib/http';
import { placeOrder } from '~/lib/orders';
import { rateLimit } from '~/lib/ratelimit';

const text = (max: number) => z.string().trim().min(1).max(max);
const Checkout = z.object({
  phone: z.string().max(20),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  smsOptIn: z.boolean(),
  firstName: text(60), lastName: text(60),
  province: z.enum(STORE.provinces as [string, ...string[]]),
  city: text(60), address: z.string().trim().min(10).max(400),
  postal: z.string().transform((v) => toEn(v).replace(/\D/g, '')).pipe(z.string().length(10)),
  landline: z.string().max(20).optional(),
  saveAddress: z.boolean(),
  shipMethod: z.enum(['post', 'tipax', 'courier']),
  payMethod: z.enum(['gateway', 'cod', 'credit']),
  terms: z.literal(true),
  utm: z.record(z.string().max(100)).optional(),
});

export const POST: APIRoute = async (ctx) => {
  if (!(await rateLimit(`checkout:${clientIp(ctx)}`, 10, 600))) return fail('تعداد درخواست‌ها بیش از حد مجاز است.', 429);
  const b = await body(ctx.request, Checkout);
  if (!b) return fail('لطفاً همه‌ی فیلدهای لازم را درست کامل کنید.');
  const phone = normalizePhone(b.phone);
  if (!phone) return fail('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
  const cartId = getCartId(ctx.cookies);
  if (!cartId) return fail('سبد خرید شما خالی است.');

  const { terms, ...input } = b;
  const r = await placeOrder(cartId, { ...input, phone }, ctx.locals.user?.id ?? null);
  if (!r.ok) return fail(r.error, 409);
  // Lets a guest see their own confirmation page without exposing other orders.
  ctx.cookies.set('last_order', r.code, { path: '/checkout', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 });
  return json({ redirect: r.redirect });
};
