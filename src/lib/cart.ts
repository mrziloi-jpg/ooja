import { randomBytes } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { and, eq, inArray, sql as dsql } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { config } from './config';
import { getStore } from './settings';
import { evaluateDiscount, type Discount } from './pricing';

const CART_COOKIE = 'cart';
const MAX_QTY = 10;

export type CartLine = {
  variantId: number; productId: number; slug: string; nameEn: string; nameFa: string; label: string;
  price: number; qty: number; stock: number; glass: string; shape: string; image: string | null;
};
export type CartView = {
  lines: CartLine[]; count: number; subtotal: number; toFreeShip: number; freeShipPct: number;
  discount: Discount | null; discountError: string | null; samples: string[]; total: number;
};
export const MAX_SAMPLES = 2;

export function getCartId(cookies: AstroCookies): string | null {
  return cookies.get(CART_COOKIE)?.value ?? null;
}

async function ensureCart(cookies: AstroCookies, userId?: number): Promise<string> {
  const existing = getCartId(cookies);
  if (existing) {
    const [row] = await db.select({ id: s.carts.id }).from(s.carts).where(eq(s.carts.id, existing)).limit(1);
    if (row) return row.id;
  }
  const id = randomBytes(18).toString('base64url');
  await db.insert(s.carts).values({ id, userId });
  cookies.set(CART_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 60 * 60 * 24 * 60 });
  return id;
}

export async function readCart(cartId: string | null): Promise<CartView> {
  const lines: CartLine[] = cartId
    ? await db.select({
        variantId: s.variants.id, productId: s.products.id, slug: s.products.slug, nameEn: s.products.nameEn, nameFa: s.products.nameFa,
        label: s.variants.label, price: s.variants.price, qty: s.cartItems.qty, stock: s.variants.stock,
        glass: s.products.glass, shape: s.products.shape, image: s.products.image,
      })
        .from(s.cartItems)
        .innerJoin(s.variants, eq(s.variants.id, s.cartItems.variantId))
        .innerJoin(s.products, eq(s.products.id, s.variants.productId))
        .where(and(eq(s.cartItems.cartId, cartId), eq(s.products.active, true)))
        .orderBy(s.products.sort)
    : [];
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.price, 0);
  const { freeShipFrom } = await getStore();
  const toFreeShip = Math.max(0, freeShipFrom - subtotal);

  const [meta] = cartId ? await db.select({ discountCode: s.carts.discountCode, samples: s.carts.samples }).from(s.carts).where(eq(s.carts.id, cartId)).limit(1) : [];
  let discount: Discount | null = null;
  let discountError: string | null = null;
  if (meta?.discountCode && subtotal > 0) {
    const r = await evaluateDiscount(meta.discountCode, subtotal);
    if ('error' in r) discountError = r.error; else discount = r;
  }
  return {
    lines, count, subtotal, toFreeShip, freeShipPct: Math.min(100, Math.round((subtotal / freeShipFrom) * 100)),
    discount, discountError, samples: meta?.samples ?? [], total: subtotal - (discount?.amount ?? 0),
  };
}

export async function setCartMeta(cookies: AstroCookies, meta: { discountCode?: string | null; samples?: string[] }, userId?: number) {
  const cartId = await ensureCart(cookies, userId);
  const set: Partial<typeof s.carts.$inferInsert> = {};
  if (meta.discountCode !== undefined) set.discountCode = meta.discountCode ? meta.discountCode.trim().toUpperCase().slice(0, 40) : null;
  if (meta.samples !== undefined) set.samples = meta.samples.slice(0, MAX_SAMPLES);
  if (Object.keys(set).length) await db.update(s.carts).set(set).where(eq(s.carts.id, cartId));
  return readCart(cartId);
}

/** Adds (delta) or sets (absolute) quantities. Quantities are clamped to stock and MAX_QTY. */
export async function changeCart(cookies: AstroCookies, items: { variantId: number; qty: number }[], mode: 'add' | 'set', userId?: number) {
  const cartId = await ensureCart(cookies, userId);
  const ids = items.map((i) => i.variantId);
  if (!ids.length) return readCart(cartId);
  const stock = Object.fromEntries(
    (await db.select({ id: s.variants.id, stock: s.variants.stock }).from(s.variants).where(inArray(s.variants.id, ids))).map((v) => [v.id, v.stock]),
  );
  const current = Object.fromEntries(
    (await db.select().from(s.cartItems).where(and(eq(s.cartItems.cartId, cartId), inArray(s.cartItems.variantId, ids)))).map((c) => [c.variantId, c.qty]),
  );

  await db.transaction(async (tx) => {
    for (const { variantId, qty } of items) {
      if (!(variantId in stock)) continue;
      const target = Math.min(MAX_QTY, stock[variantId], mode === 'add' ? (current[variantId] ?? 0) + qty : qty);
      if (target <= 0) {
        await tx.delete(s.cartItems).where(and(eq(s.cartItems.cartId, cartId), eq(s.cartItems.variantId, variantId)));
      } else {
        await tx.insert(s.cartItems).values({ cartId, variantId, qty: target })
          .onConflictDoUpdate({ target: [s.cartItems.cartId, s.cartItems.variantId], set: { qty: target } });
      }
    }
    await tx.update(s.carts).set({ updatedAt: dsql`now()`, reminded: false, ...(userId ? { userId } : {}) }).where(eq(s.carts.id, cartId));
  });
  return readCart(cartId);
}

export async function clearCart(cartId: string) {
  await db.delete(s.cartItems).where(eq(s.cartItems.cartId, cartId));
}
