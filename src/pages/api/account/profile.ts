import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { body, fail, json } from '~/lib/http';

const Profile = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  skinType: z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal', '']).optional(),
  birthDate: z.string().trim().max(40).optional(),
  smsOptIn: z.boolean().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('ابتدا وارد شوید.', 401);
  const b = await body(request, Profile);
  if (!b) return fail('اطلاعات واردشده معتبر نیست.');
  await db.update(s.users).set({
    firstName: b.firstName,
    lastName: b.lastName || null,
    ...(b.email !== undefined ? { email: b.email || null } : {}),
    ...(b.skinType !== undefined ? { skinType: b.skinType || null } : {}),
    ...(b.birthDate !== undefined ? { birthDate: b.birthDate || null } : {}),
    ...(b.smsOptIn !== undefined ? { smsOptIn: b.smsOptIn } : {}),
  }).where(eq(s.users.id, locals.user.id));
  return json({ ok: true });
};
