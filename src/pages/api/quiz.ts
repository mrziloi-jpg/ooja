import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { fail, json } from '~/lib/http';
import { parseAnswers } from '~/lib/quiz';

// Saves quiz answers to the logged-in customer's account (skin type, main concern, full answers).
// Guests get 401 and the browser sends them to log in, keeping the answers locally until they return.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('برای ذخیره، وارد حساب شوید.', 401);
  const a = parseAnswers(await request.json().catch(() => null));
  if (!a) return fail('پاسخ‌ها کامل نیست.');
  await db.update(s.users).set({
    quiz: a, quizAt: new Date(),
    skinType: a.sens === 'often' ? 'sensitive' : a.skin,
    goal: a.concern[0],
  }).where(eq(s.users.id, locals.user.id));
  return json({ ok: true });
};
