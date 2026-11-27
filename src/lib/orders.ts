import { randomInt } from 'node:crypto';
import { and, eq, gte, inArray, lt, sql as dsql } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { readCart, clearCart } from './cart';
import { config } from './config';
import { getStore } from './settings';
import { evaluateDiscount, shippingCost } from './pricing';
import { requestPayment, verifyPayment } from './payment';
import { notify } from './sms';
import { invalidateCatalog } from './catalog';

export type CheckoutInput = {
  phone: string; email?: string; smsOptIn: boolean;
  firstName: string; lastName: string; province: string; city: string; address: string; postal: string; landline?: string;
  saveAddress: boolean; shipMethod: string; payMethod: 'gateway' | 'cod' | 'credit';
  utm?: Record<string, string>;
};

type Result = { ok: true; redirect: string; code: string } | { ok: false; error: string };

class CheckoutError extends Error {}

const newCode = () => `LM-${randomInt(100000, 999999)}`;

export async function placeOrder(cartId: string, input: CheckoutInput, userId: number | null): Promise<Result> {
  const cart = await readCart(cartId);
  if (!cart.count) return { ok: false, error: 'سبد خرید شما خالی است.' };

  const store = await getStore();
  if (!store.payments.some((p) => p.id === input.payMethod)) return { ok: false, error: 'این روش پرداخت در حال حاضر فعال نیست.' };
  const ship = await shippingCost(input.shipMethod, input.province, cart.subtotal);
  if (ship === null) return { ok: false, error: 'روش ارسال انتخاب‌شده برای این استان در دسترس نیست.' };
  if (input.payMethod === 'cod' && input.shipMethod !== 'courier') return { ok: false, error: 'پرداخت در محل فقط با پیک فوری تهران ممکن است.' };
  if (input.payMethod === 'credit' && !userId) return { ok: false, error: 'برای استفاده از اعتبار باید وارد حساب شوید.' };

  // Re-evaluate the discount at order time; never trust what the cart page showed.
  let discount = 0;
  let discountCode: string | null = null;
  if (cart.discount) {
    const d = await evaluateDiscount(cart.discount.code, cart.subtotal);
    if ('error' in d) return { ok: false, error: d.error };
    discount = d.amount;
    discountCode = d.code;
  }
  const total = cart.subtotal - discount + ship;

  try {
    const order = await db.transaction(async (tx) => {
      // Reserve stock atomically; fails if anyone bought the last unit in the meantime.
      for (const l of cart.lines) {
        const r = await tx.update(s.variants).set({ stock: dsql`${s.variants.stock} - ${l.qty}` })
          .where(and(eq(s.variants.id, l.variantId), gte(s.variants.stock, l.qty))).returning({ id: s.variants.id });
        if (!r.length) throw new CheckoutError(`موجودی ${l.nameFa} کافی نیست. لطفاً سبد را بررسی کنید.`);
      }

      let creditUsed = 0;
      if (input.payMethod === 'credit' && userId) {
        const [u] = await tx.select({ credit: s.users.credit }).from(s.users).where(eq(s.users.id, userId)).for('update');
        creditUsed = Math.min(u.credit, total);
        if (creditUsed > 0) await tx.update(s.users).set({ credit: dsql`${s.users.credit} - ${creditUsed}` }).where(eq(s.users.id, userId));
      }

      let code = newCode();
      for (let i = 0; i < 5; i++) {
        const [hit] = await tx.select({ id: s.orders.id }).from(s.orders).where(eq(s.orders.code, code)).limit(1);
        if (!hit) break;
        code = newCode();
      }

      const [o] = await tx.insert(s.orders).values({
        code, userId, phone: input.phone, email: input.email || null,
        firstName: input.firstName, lastName: input.lastName, province: input.province, city: input.city,
        address: input.address, postal: input.postal, landline: input.landline || null,
        shipMethod: input.shipMethod, shipCost: ship, payMethod: input.payMethod,
        subtotal: cart.subtotal, discount, creditUsed, total, discountCode, samples: cart.samples,
        status: input.payMethod === 'cod' ? 'pending' : 'awaiting_payment',
        paymentStatus: input.payMethod === 'cod' ? 'cod' : 'unpaid',
        utm: input.utm ?? null,
      }).returning();

      await tx.insert(s.orderItems).values(cart.lines.map((l) => ({
        orderId: o.id, variantId: l.variantId, productId: l.productId, nameEn: l.nameEn, nameFa: l.nameFa, label: l.label, price: l.price, qty: l.qty,
      })));

      if (userId) {
        await tx.update(s.users).set({
          smsOptIn: input.smsOptIn,
          ...(input.email ? { email: input.email } : {}),
        }).where(eq(s.users.id, userId));
        if (input.saveAddress) {
          await tx.insert(s.addresses).values({
            userId, firstName: input.firstName, lastName: input.lastName, province: input.province, city: input.city,
            address: input.address, postal: input.postal, landline: input.landline || null, isDefault: true,
          });
        }
      }
      return o;
    });
    invalidateCatalog(); // stock changed

    const payable = order.total - order.creditUsed;
    if (order.payMethod === 'cod' || payable === 0) {
      if (payable === 0 && order.payMethod !== 'cod') await markPaid(order.id, 'CREDIT');
      else await finalizeOrder(order.id, cartId);
      return { ok: true, redirect: `/checkout/done/${order.code}`, code: order.code };
    }

    const pay = await requestPayment({
      orderCode: order.code, amount: payable, phone: order.phone,
      callbackUrl: `${config.siteUrl.replace(/\/$/, '')}/checkout/callback`,
      description: `سفارش ${order.code} از LUMIÈRE`,
    });
    await db.update(s.orders).set({ gatewayAuthority: pay.authority }).where(eq(s.orders.id, order.id));
    return { ok: true, redirect: pay.redirectUrl, code: order.code };
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, error: e.message };
    console.error('[checkout] failed', e);
    return { ok: false, error: 'ثبت سفارش انجام نشد. لطفاً دوباره تلاش کنید.' };
  }
}

/** Post-placement bookkeeping shared by paid and cash-on-delivery orders. */
async function finalizeOrder(orderId: number, cartId: string | null) {
  const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId));
  await db.transaction(async (tx) => {
    if (o.discountCode) await tx.update(s.discountCodes).set({ used: dsql`${s.discountCodes.used} + 1` }).where(eq(s.discountCodes.code, o.discountCode));
    for (const it of items) if (it.productId) await tx.update(s.products).set({ salesScore: dsql`${s.products.salesScore} + ${it.qty}` }).where(eq(s.products.id, it.productId));
    const earned = Math.floor(o.total * (await getStore()).pointsPerToman);
    if (o.userId && earned > 0) {
      await tx.update(s.users).set({ points: dsql`${s.users.points} + ${earned}` }).where(eq(s.users.id, o.userId));
      await tx.insert(s.pointsLedger).values({ userId: o.userId, delta: earned, reason: 'order', orderId: o.id });
    }
  });
  if (cartId) await clearCart(cartId);
  // Also clear the cart by user (the callback arrives on a fresh request that still has the cookie, but be safe).
  if (o.userId) await db.delete(s.cartItems).where(inArray(s.cartItems.cartId, db.select({ id: s.carts.id }).from(s.carts).where(eq(s.carts.userId, o.userId))));
  notify(o.phone, `سفارش ${o.code} در LUMIÈRE ثبت شد. پیگیری: ${config.siteUrl}/account/orders`);
}

async function markPaid(orderId: number, ref: string) {
  await db.update(s.orders).set({ paymentStatus: 'paid', status: 'pending', gatewayRef: ref, paidAt: new Date() }).where(eq(s.orders.id, orderId));
  await finalizeOrder(orderId, null);
}

/** Releases reserved stock and refunds store credit for an order that will not be paid. */
async function releaseOrder(orderId: number) {
  await db.transaction(async (tx) => {
    const [o] = await tx.update(s.orders).set({ status: 'canceled', paymentStatus: 'failed' })
      .where(and(eq(s.orders.id, orderId), eq(s.orders.paymentStatus, 'unpaid'))).returning();
    if (!o) return; // already handled
    const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId));
    for (const it of items) if (it.variantId) await tx.update(s.variants).set({ stock: dsql`${s.variants.stock} + ${it.qty}` }).where(eq(s.variants.id, it.variantId));
    if (o.userId && o.creditUsed > 0) await tx.update(s.users).set({ credit: dsql`${s.users.credit} + ${o.creditUsed}` }).where(eq(s.users.id, o.userId));
  });
  invalidateCatalog();
}

export async function handleCallback(authority: string, statusOk: boolean, cartId: string | null): Promise<{ code: string; ok: boolean } | null> {
  const [o] = await db.select().from(s.orders).where(eq(s.orders.gatewayAuthority, authority)).limit(1);
  if (!o) return null;
  if (o.paymentStatus === 'paid') return { code: o.code, ok: true }; // refresh of the callback page
  if (o.paymentStatus !== 'unpaid') return { code: o.code, ok: false };

  if (!statusOk) {
    await releaseOrder(o.id);
    return { code: o.code, ok: false };
  }
  const v = await verifyPayment(authority, o.total - o.creditUsed);
  if (!v.ok) {
    await releaseOrder(o.id);
    return { code: o.code, ok: false };
  }
  // Claim: only one concurrent callback may transition unpaid -> paid.
  const claimed = await db.update(s.orders).set({ paymentStatus: 'paid', status: 'pending', gatewayRef: v.refId, paidAt: new Date() })
    .where(and(eq(s.orders.id, o.id), eq(s.orders.paymentStatus, 'unpaid'))).returning({ id: s.orders.id });
  if (claimed.length) await finalizeOrder(o.id, cartId);
  return { code: o.code, ok: true };
}

/** Run periodically: abandons orders left at the gateway for 30+ minutes and returns their stock. */
export async function releaseStaleOrders() {
  const stale = await db.select({ id: s.orders.id }).from(s.orders)
    .where(and(eq(s.orders.paymentStatus, 'unpaid'), lt(s.orders.createdAt, new Date(Date.now() - 30 * 60_000))));
  for (const o of stale) await releaseOrder(o.id);
  return stale.length;
}

export const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'در انتظار پرداخت', pending: 'در انتظار آماده‌سازی', ready: 'آماده‌ی ارسال', shipped: 'ارسال شده',
  delivered: 'تحویل شده', canceled: 'لغو شده', returned: 'درخواست مرجوعی',
};
