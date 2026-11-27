import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { body, clientIp, fail, json } from '~/lib/http';
import { rateLimit } from '~/lib/ratelimit';

const Review = z.object({
  productId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  name: z.string().trim().min(2).max(40),
  skin: z.string().trim().max(20).optional(),
  body: z.string().trim().min(10).max(1500),
});

// Reviews are held for moderation; "verified" is set when the reviewer has a delivered order containing the product.
export const POST: APIRoute = async (ctx) => {
  if (!(await rateLimit(`review:${clientIp(ctx)}`, 5, 3600))) return fail('تعداد درخواست‌ها بیش از حد مجاز است.', 429);
  const b = await body(ctx.request, Review);
  if (!b) return fail('لطفاً امتیاز، نام و متن نظر (حداقل ۱۰ حرف) را وارد کنید.');

  const user = ctx.locals.user;
  let verified = false;
  if (user) {
    const [hit] = await db.select({ id: s.orderItems.id }).from(s.orderItems)
      .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
      .where(and(eq(s.orders.userId, user.id), eq(s.orders.status, 'delivered'), eq(s.orderItems.productId, b.productId)))
      .limit(1);
    verified = !!hit;
  }
  await db.insert(s.reviews).values({ ...b, userId: user?.id, verified, approved: false });
  return json({ ok: true });
};
