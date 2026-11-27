import type { APIRoute } from 'astro';
import { z } from 'zod';
import { setCartMeta } from '~/lib/cart';
import { getCatalog } from '~/lib/catalog';
import { body, clientIp, fail, json } from '~/lib/http';
import { rateLimit } from '~/lib/ratelimit';

const Meta = z.object({
  discountCode: z.string().max(40).nullable().optional(),
  samples: z.array(z.string().max(80)).max(2).optional(),
});

export const POST: APIRoute = async (ctx) => {
  const b = await body(ctx.request, Meta);
  if (!b) return fail('درخواست نامعتبر است.');
  // Discount codes are guessable; throttle attempts.
  if (b.discountCode && !(await rateLimit(`code:${clientIp(ctx)}`, 15, 600))) return fail('تعداد تلاش‌ها بیش از حد مجاز است.', 429);
  if (b.samples) {
    const cat = await getCatalog();
    b.samples = b.samples.filter((slug) => cat.bySlug.get(slug)?.category === 'serums');
  }
  return json(await setCartMeta(ctx.cookies, b, ctx.locals.user?.id));
};
