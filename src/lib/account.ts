import type { AstroCookies } from 'astro';
import { and, asc, desc, eq, gte, inArray, or, sql as dsql } from 'drizzle-orm';
import { db, sql, schema as s } from '~/db';
import type { SessionUser } from './auth';
import { changeCart } from './cart';
import { STORE } from './config';
import { jalaliDate } from './format';

type Order = typeof s.orders.$inferSelect;

/** A customer's orders: placed while logged in, or as a guest with the same (now verified) phone number. */
export const ownOrders = (u: SessionUser) => or(eq(s.orders.userId, u.id), eq(s.orders.phone, u.phone))!;

export async function listOrders(u: SessionUser) {
  return db.select({
    o: s.orders,
    items: dsql<number>`(SELECT coalesce(sum(qty), 0)::int FROM order_items WHERE order_id = ${s.orders.id})`,
  }).from(s.orders).where(ownOrders(u)).orderBy(desc(s.orders.createdAt));
}

export async function getOrder(u: SessionUser, code: string) {
  const [o] = await db.select().from(s.orders).where(and(eq(s.orders.code, code), ownOrders(u))).limit(1);
  if (!o) return null;
  const [items, events] = await Promise.all([
    db.select({ it: s.orderItems, glass: s.products.glass, image: s.products.image, slug: s.products.slug })
      .from(s.orderItems).leftJoin(s.products, eq(s.products.id, s.orderItems.productId))
      .where(eq(s.orderItems.orderId, o.id)),
    db.select().from(s.orderEvents).where(eq(s.orderEvents.orderId, o.id)).orderBy(asc(s.orderEvents.createdAt)),
  ]);
  return { o, items, events };
}

export const CUSTOMER_STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_payment: { label: 'در انتظار پرداخت', cls: 'muted' },
  pending: { label: 'در حال آماده‌سازی', cls: 'solid' },
  ready: { label: 'آماده‌ی ارسال', cls: 'solid' },
  shipped: { label: 'در مسیر', cls: 'solid' },
  delivered: { label: 'تحویل شده', cls: '' },
  canceled: { label: 'لغو شده', cls: 'muted' },
  returned: { label: 'درخواست مرجوعی', cls: '' },
};

/** Progress bar steps, timed from the order's status history. */
export function trackingSteps(o: Order, events: { status: string; createdAt: Date }[]) {
  const at = (st: string) => events.filter((e) => e.status === st).pop()?.createdAt;
  const fmt = (d?: Date | null) => (d ? jalaliDate(d, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const rank: Record<string, number> = { awaiting_payment: 0, pending: 1, ready: 2, shipped: 3, delivered: 4, returned: 4 };
  if (o.status === 'canceled') return [{ label: 'لغو شد', time: fmt(at('canceled') ?? o.createdAt), reached: true, current: true }];
  const reached = rank[o.status] ?? 0;
  return [
    { label: 'ثبت سفارش', time: fmt(o.paidAt ?? o.createdAt) },
    { label: 'آماده‌سازی', time: fmt(at('ready')) },
    { label: 'تحویل به پست', time: fmt(at('shipped')) },
    { label: 'تحویل', time: fmt(at('delivered')) },
  ].map((step, i) => ({ ...step, reached: i < reached, current: i === reached - 1 }));
}

/** Returns are allowed within STORE.returnDays of delivery. */
export function canRequestReturn(o: Order, events: { status: string; createdAt: Date }[]) {
  if (o.status !== 'delivered') return false;
  const delivered = events.filter((e) => e.status === 'delivered').pop()?.createdAt ?? o.paidAt ?? o.createdAt;
  return Date.now() - delivered.getTime() < STORE.returnDays * 86400_000;
}

export async function requestReturn(u: SessionUser, code: string, reason: string, note: string) {
  const found = await getOrder(u, code);
  if (!found || !canRequestReturn(found.o, found.events)) return false;
  await db.transaction(async (tx) => {
    await tx.update(s.orders).set({ status: 'returned' }).where(eq(s.orders.id, found.o.id));
    await tx.insert(s.orderEvents).values({ orderId: found.o.id, status: 'returned', note: `${reason}${note ? ` — ${note}` : ''}`.slice(0, 600), byUserId: u.id });
  });
  return true;
}

/** Puts every still-available item from a past order back in the cart. */
export async function buyAgain(cookies: AstroCookies, u: SessionUser, variantIds: { variantId: number | null; qty: number }[]) {
  const ids = variantIds.map((x) => x.variantId).filter((x): x is number => !!x);
  if (!ids.length) return 0;
  const live = await db.select({ id: s.variants.id }).from(s.variants)
    .innerJoin(s.products, eq(s.products.id, s.variants.productId))
    .where(and(inArray(s.variants.id, ids), eq(s.products.active, true), gte(s.variants.stock, 1)));
  const ok = new Set(live.map((v) => v.id));
  const items = variantIds.filter((x) => x.variantId && ok.has(x.variantId)).map((x) => ({ variantId: x.variantId!, qty: x.qty }));
  if (items.length) await changeCart(cookies, items, 'add', u.id);
  return items.length;
}

export async function redeemPoints(userId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ points: s.users.points }).from(s.users).where(eq(s.users.id, userId)).for('update');
    if (!u || u.points < STORE.redeemPoints) return false;
    await tx.update(s.users).set({
      points: dsql`${s.users.points} - ${STORE.redeemPoints}`,
      credit: dsql`${s.users.credit} + ${STORE.redeemCredit}`,
    }).where(eq(s.users.id, userId));
    await tx.insert(s.pointsLedger).values({ userId, delta: -STORE.redeemPoints, reason: 'redeem' });
    return true;
  });
}

export const TIERS = [
  { label: 'برنزی', from: 0 },
  { label: 'نقره‌ای', from: 3_000_000 },
  { label: 'طلایی', from: 6_000_000 },
];

/** Lifetime spend on counted orders, current tier and distance to the next one. Matches the admin's tiers. */
export async function tierOf(u: SessionUser) {
  const [{ spend }] = await sql<{ spend: number }[]>`
    SELECT coalesce(sum(total), 0)::bigint AS spend FROM orders
    WHERE (user_id = ${u.id} OR phone = ${u.phone}) AND status NOT IN ('awaiting_payment', 'canceled', 'returned')`;
  const total = Number(spend);
  const idx = TIERS.findLastIndex((t) => total >= t.from);
  const next = TIERS[idx + 1];
  return {
    spend: total, tier: TIERS[idx].label, next: next?.label ?? null, toNext: next ? next.from - total : 0,
    pct: next ? Math.round(((total - TIERS[idx].from) / (next.from - TIERS[idx].from)) * 100) : 100,
  };
}

/** Delivered items bought roughly one refill cycle ago, for the "running out?" prompt. */
export async function refillSuggestion(u: SessionUser) {
  const [row] = await db.select({ variantId: s.orderItems.variantId, nameFa: s.orderItems.nameFa, label: s.orderItems.label, price: s.variants.price, createdAt: s.orders.createdAt })
    .from(s.orderItems)
    .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
    .innerJoin(s.variants, eq(s.variants.id, s.orderItems.variantId))
    .innerJoin(s.products, eq(s.products.id, s.variants.productId))
    .where(and(ownOrders(u), eq(s.orders.status, 'delivered'), eq(s.products.active, true), gte(s.variants.stock, 1),
      dsql`${s.orders.createdAt} < now() - make_interval(days => ${STORE.refillAfterDays - 7})`))
    .orderBy(desc(s.orders.createdAt)).limit(1);
  return row ?? null;
}
