import { and, count, eq, lt, sql as dsql } from 'drizzle-orm';
import { db, sql, schema as s } from '~/db';
import { invalidateCatalog } from './catalog';
import { config } from './config';
import { toEn } from './format';
import { getSettings } from './settings';
import { notify } from './sms';

export const ORDER_STATUSES = ['pending', 'ready', 'shipped', 'delivered', 'canceled', 'returned'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Parses an admin number field: Persian digits, thousands separators and spaces allowed. */
export function num(v: FormDataEntryValue | null | undefined): number | null {
  if (v == null) return null;
  const t = toEn(String(v)).replace(/[,٬\s]/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const str = (v: FormDataEntryValue | null | undefined) => (v == null ? '' : String(v).trim());

/** True for Postgres unique-constraint errors. Drizzle wraps driver errors, so the code may be on `cause`. */
export const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
};

export async function navCounts() {
  const { lowStock } = await getSettings();
  const [[o], [r], [p], [m]] = await Promise.all([
    db.select({ n: count() }).from(s.orders).where(eq(s.orders.status, 'pending')),
    db.select({ n: count() }).from(s.reviews).where(and(eq(s.reviews.approved, false), eq(s.reviews.rejected, false))),
    db.select({ n: count() }).from(s.variants).where(lt(s.variants.stock, lowStock)),
    db.select({ n: count() }).from(s.supportMessages).where(eq(s.supportMessages.status, 'open')),
  ]);
  return { orders: o.n, reviews: r.n, products: p.n, messages: m.n };
}

const SMS: Partial<Record<OrderStatus, (code: string, track: string | null) => string>> = {
  ready: (c) => `سفارش ${c} در OOJA SHOP آماده‌ی ارسال است.`,
  shipped: (c, t) => `سفارش ${c} ارسال شد.${t ? ` کد رهگیری: ${t}` : ''}\nپیگیری: ${config.siteUrl}/account/orders`,
  delivered: (c) => `سفارش ${c} تحویل شد. از خریدتان ممنونیم؛ نظرتان را در سایت با ما در میان بگذارید.`,
  canceled: (c) => `سفارش ${c} لغو شد. در صورت پرداخت، مبلغ طی ۷۲ ساعت بازگردانده می‌شود.`,
};

/**
 * Changes an order's status, logs it, and texts the customer when asked.
 * Canceling an order that hasn't shipped returns its items to stock and refunds any store credit used.
 * Refunding a card payment is done manually in the Zarinpal panel.
 */
export async function updateOrder(orderId: number, patch: { status?: OrderStatus; trackingCode?: string; internalNote?: string }, adminId: number, sendSms: boolean) {
  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId)).for('update');
    if (!o) return null;
    const statusChanged = patch.status && patch.status !== o.status;
    if (statusChanged && o.status === 'awaiting_payment') throw new Error('سفارش هنوز پرداخت نشده است.');

    if (statusChanged && patch.status === 'canceled' && (o.status === 'pending' || o.status === 'ready')) {
      const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId));
      for (const it of items) if (it.variantId) await tx.update(s.variants).set({ stock: dsql`${s.variants.stock} + ${it.qty}` }).where(eq(s.variants.id, it.variantId));
      if (o.userId && o.creditUsed > 0) await tx.update(s.users).set({ credit: dsql`${s.users.credit} + ${o.creditUsed}` }).where(eq(s.users.id, o.userId));
    }
    const [updated] = await tx.update(s.orders).set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.trackingCode !== undefined ? { trackingCode: patch.trackingCode || null } : {}),
      ...(patch.internalNote !== undefined ? { internalNote: patch.internalNote || null } : {}),
    }).where(eq(s.orders.id, orderId)).returning();
    if (statusChanged) await tx.insert(s.orderEvents).values({ orderId, status: patch.status!, byUserId: adminId });
    return { order: updated, statusChanged };
  });
  if (!result) return null;
  if (result.statusChanged) invalidateCatalog();
  const msg = result.statusChanged && sendSms ? SMS[result.order.status as OrderStatus] : undefined;
  if (msg) notify(result.order.phone, msg(result.order.code, result.order.trackingCode));
  return result.order;
}

/** Recomputes a product's star rating from its approved reviews. */
export async function recomputeRating(productId: number) {
  await sql`
    UPDATE products SET
      rating = coalesce((SELECT avg(rating)::real FROM reviews WHERE product_id = ${productId} AND approved), 0),
      reviews_count = (SELECT count(*)::int FROM reviews WHERE product_id = ${productId} AND approved)
    WHERE id = ${productId}`;
  invalidateCatalog();
}

/** Customer tier by lifetime spend (toman). */
export function tier(spend: number): { label: string; cls: string } {
  if (spend >= 6_000_000) return { label: 'طلایی', cls: 's-pending' };
  if (spend >= 3_000_000) return { label: 'نقره‌ای', cls: 's-ready' };
  return { label: 'برنزی', cls: 's-delivered' };
}

export const PAY_LABELS: Record<string, string> = { gateway: 'درگاه', cod: 'پرداخت در محل', credit: 'اعتبار باشگاه' };
export const SHIP_LABELS: Record<string, string> = { post: 'پست پیشتاز', tipax: 'تیپاکس', courier: 'پیک تهران' };
export const ADMIN_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'در انتظار پرداخت', pending: 'در انتظار آماده‌سازی', ready: 'آماده‌ی ارسال', shipped: 'ارسال شده',
  delivered: 'تحویل شده', canceled: 'لغو شده', returned: 'درخواست مرجوعی',
};
