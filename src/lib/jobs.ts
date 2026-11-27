import { sql } from '~/db';
import { config, STORE } from './config';
import { releaseStaleOrders } from './orders';
import { notify } from './sms';

// Runs inside the single app process. If you ever run several app instances,
// enable jobs on exactly one of them (JOBS=off on the others).
const g = globalThis as unknown as { __jobs?: boolean };

export function startJobs() {
  if (g.__jobs || process.env.JOBS === 'off') return;
  g.__jobs = true;
  const every = (min: number, name: string, fn: () => Promise<unknown>) =>
    setInterval(() => fn().catch((e) => console.error(`[job:${name}]`, e)), min * 60_000).unref();

  every(5, 'release-stale-orders', releaseStaleOrders);
  every(30, 'abandoned-carts', remindAbandonedCarts);
  every(30, 'back-in-stock', notifyBackInStock);
  every(60, 'refill-reminders', remindRefills);
  every(10, 'consult-reminders', remindConsultations);
  every(60, 'cleanup', cleanup);
}

const tehranHour = () => Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Tehran' }).format(new Date()));

/** Texts customers who asked to be told when an out-of-stock product is available again, then clears the request. */
async function notifyBackInStock() {
  const h = tehranHour();
  if (h < 9 || h >= 21) return;
  const rows = await sql<{ phone: string; name: string; slug: string }[]>`
    DELETE FROM stock_alerts a USING users u, products p
    WHERE a.user_id = u.id AND a.product_id = p.id AND p.active
      AND EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.stock > 0)
    RETURNING u.phone, p.name_fa AS name, p.slug`;
  for (const r of rows) notify(r.phone, `${r.name} دوباره موجود شد: ${config.siteUrl}/p/${r.slug}
لغو۱۱`);
}

/** Texts each booked consultation once, about an hour before it starts, with the meeting link if staff added one. */
async function remindConsultations() {
  const rows = await sql<{ phone: string; kind: string; starts_at: string; meeting_link: string | null }[]>`
    UPDATE consultations SET reminded = true
    WHERE status = 'booked' AND NOT reminded AND starts_at BETWEEN now() + interval '40 minutes' AND now() + interval '80 minutes'
    RETURNING phone, kind, starts_at, meeting_link`;
  for (const r of rows) {
    const time = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }).format(new Date(r.starts_at));
    const how = r.meeting_link ? `لینک جلسه: ${r.meeting_link}` : r.kind === 'chat' ? 'کارشناس ما در همین شماره با شما چت را شروع می‌کند.' : 'کارشناس ما با همین شماره با شما تماس می‌گیرد.';
    notify(r.phone, `یادآوری: مشاوره‌ی OOJA SHOP ساعت ${time} امروز. ${how}`);
  }
}

/** One reminder per delivered order, about six weeks later, for customers who keep reminders on. */
async function remindRefills() {
  const h = tehranHour();
  if (h < 10 || h >= 20) return;
  const rows = await sql<{ phone: string; first_name: string | null; code: string }[]>`
    UPDATE orders o SET refill_reminded = true
    FROM users u
    WHERE (o.user_id = u.id OR (o.user_id IS NULL AND o.phone = u.phone))
      AND u.refill_reminders AND NOT o.refill_reminded AND o.status = 'delivered'
      AND o.created_at < now() - make_interval(days => ${STORE.refillAfterDays})
      AND o.created_at > now() - make_interval(days => ${STORE.refillAfterDays + 14})
    RETURNING u.phone, u.first_name, o.code`;
  for (const r of rows) notify(r.phone, `${r.first_name ? r.first_name + ' عزیز، ' : ''}محصولات سفارش ${r.code} احتمالاً رو به اتمام است. سفارش دوباره با یک کلیک: ${config.siteUrl}/account/orders/${r.code}
لغو۱۱`);
}

/** One SMS per abandoned cart, only for logged-in customers who opted in, and only during daytime in Tehran. */
async function remindAbandonedCarts() {
  const hour = tehranHour();
  if (hour < 10 || hour >= 21) return;
  const rows = await sql<{ id: string; phone: string; first_name: string | null }[]>`
    UPDATE carts c SET reminded = true
    FROM users u
    WHERE c.user_id = u.id AND u.sms_opt_in AND NOT c.reminded
      AND c.updated_at < now() - interval '3 hours' AND c.updated_at > now() - interval '3 days'
      AND EXISTS (SELECT 1 FROM cart_items ci WHERE ci.cart_id = c.id)
    RETURNING c.id, u.phone, u.first_name`;
  for (const r of rows) {
    notify(r.phone, `${r.first_name ? r.first_name + ' عزیز، ' : ''}محصولات انتخابی‌تان در سبد OOJA SHOP منتظر شماست: ${config.siteUrl}/cart\nلغو۱۱`);
  }
}

async function cleanup() {
  await sql`DELETE FROM sessions WHERE expires_at < now()`;
  await sql`DELETE FROM otp_codes WHERE expires_at < now() - interval '1 hour'`;
  await sql`DELETE FROM rate_limits WHERE reset_at < now()`;
  await sql`DELETE FROM carts c WHERE c.user_id IS NULL AND c.updated_at < now() - interval '60 days'`;
}
