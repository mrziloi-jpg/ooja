import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, count, eq, gt } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { isUniqueViolation } from '~/lib/admin';
import { bookingCode, CONSULT, isBookableSlot, KIND_LABEL } from '~/lib/consult';
import { jalaliDate } from '~/lib/format';
import { body, clientIp, fail, json } from '~/lib/http';
import { rateLimit } from '~/lib/ratelimit';
import { notify } from '~/lib/sms';

const Book = z.object({
  kind: z.enum(CONSULT.types.map((t) => t.id) as [string, ...string[]]),
  startsAt: z.string().max(40),
  name: z.string().trim().min(2).max(80),
  topic: z.enum(CONSULT.topics as unknown as [string, ...string[]]),
  note: z.string().trim().max(800).optional(),
});

// Booking needs a verified phone: guests confirm theirs with an SMS code first (which logs them in).
// That keeps fake numbers from filling the schedule.
export const POST: APIRoute = async (ctx) => {
  const u = ctx.locals.user;
  if (!u) return fail('ابتدا شماره‌ی موبایل خود را تأیید کنید.', 401);
  if (!(await rateLimit(`consult:${u.id}`, 10, 3600)) || !(await rateLimit(`consult-ip:${clientIp(ctx)}`, 20, 3600))) return fail('تعداد درخواست‌ها بیش از حد مجاز است.', 429);
  const b = await body(ctx.request, Book);
  if (!b) return fail('لطفاً نوع مشاوره، ساعت و نام را درست وارد کنید.');
  if (!isBookableSlot(b.startsAt)) return fail('این زمان قابل رزرو نیست. لطفاً ساعت دیگری انتخاب کنید.');

  const [{ n }] = await db.select({ n: count() }).from(s.consultations)
    .where(and(eq(s.consultations.userId, u.id), eq(s.consultations.status, 'booked'), gt(s.consultations.startsAt, new Date())));
  if (n >= CONSULT.maxUpcomingPerCustomer) return fail(`حداکثر ${CONSULT.maxUpcomingPerCustomer.toLocaleString('fa-IR')} وقت فعال می‌توانید داشته باشید. برای وقت جدید، یکی از وقت‌های قبلی را لغو کنید.`, 409);

  const startsAt = new Date(b.startsAt);
  try {
    const [c] = await db.insert(s.consultations).values({
      userId: u.id, name: b.name, phone: u.phone, kind: b.kind, startsAt, topic: b.topic, note: b.note || null,
    }).returning();
    if (!u.firstName) await db.update(s.users).set({ firstName: b.name.split(' ')[0] }).where(eq(s.users.id, u.id));
    const when = jalaliDate(startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    notify(u.phone, `وقت مشاوره‌ی OOJA SHOP رزرو شد: ${KIND_LABEL[b.kind]}، ${when}. کد: ${bookingCode(c.id)}. یک ساعت قبل یادآوری می‌کنیم.`);
    return json({ id: c.id, code: bookingCode(c.id), startsAt: c.startsAt, kind: c.kind, phone: u.phone });
  } catch (e) {
    if (isUniqueViolation(e)) return fail('این ساعت همین الان رزرو شد. لطفاً ساعت دیگری انتخاب کنید.', 409);
    throw e;
  }
};

// Customer cancels their own upcoming booking.
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('ابتدا وارد شوید.', 401);
  const b = await body(request, z.object({ id: z.number().int().positive() }));
  if (!b) return fail('درخواست نامعتبر است.');
  const [c] = await db.update(s.consultations).set({ status: 'canceled' })
    .where(and(eq(s.consultations.id, b.id), eq(s.consultations.userId, locals.user.id), eq(s.consultations.status, 'booked'), gt(s.consultations.startsAt, new Date())))
    .returning();
  if (!c) return fail('این وقت قابل لغو نیست.', 404);
  return json({ ok: true });
};
