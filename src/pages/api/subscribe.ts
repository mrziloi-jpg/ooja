import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema as s } from '~/db';
import { body, clientIp, fail, json } from '~/lib/http';
import { rateLimit } from '~/lib/ratelimit';

export const POST: APIRoute = async (ctx) => {
  if (!(await rateLimit(`sub:${clientIp(ctx)}`, 5, 3600))) return fail('تعداد درخواست‌ها بیش از حد مجاز است.', 429);
  const b = await body(ctx.request, z.object({ email: z.string().trim().toLowerCase().email().max(200) }));
  if (!b) return fail('لطفاً یک ایمیل معتبر وارد کنید.');
  await db.insert(s.subscribers).values({ email: b.email }).onConflictDoNothing();
  return json({ ok: true });
};
