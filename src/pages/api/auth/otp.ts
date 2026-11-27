import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requestOtp } from '~/lib/auth';
import { normalizePhone } from '~/lib/format';
import { body, clientIp, fail, json } from '~/lib/http';

export const POST: APIRoute = async (ctx) => {
  const b = await body(ctx.request, z.object({ phone: z.string().max(20) }));
  const phone = b && normalizePhone(b.phone);
  if (!phone) return fail('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
  const r = await requestOtp(phone, clientIp(ctx));
  if (!r.ok) return fail(r.error, 429);
  return json({ ok: true, phone });
};
