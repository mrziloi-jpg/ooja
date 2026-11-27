import { and, eq, sql as dsql } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { getStore } from './settings';

export type Discount = { code: string; amount: number; label: string };

/** Validates a code against the current subtotal. Returns the discount or a user-facing error. */
export async function evaluateDiscount(rawCode: string, subtotal: number): Promise<Discount | { error: string }> {
  const code = rawCode.trim().toUpperCase();
  const [d] = await db.select().from(s.discountCodes).where(and(eq(dsql`upper(${s.discountCodes.code})`, code), eq(s.discountCodes.active, true))).limit(1);
  if (!d) return { error: 'این کد معتبر نیست.' };
  if (d.expiresAt && d.expiresAt < new Date()) return { error: 'مهلت استفاده از این کد تمام شده است.' };
  if (d.maxUses != null && d.used >= d.maxUses) return { error: 'ظرفیت استفاده از این کد تکمیل شده است.' };
  if (subtotal < d.minSubtotal) return { error: `این کد برای خریدهای بالای ${d.minSubtotal.toLocaleString('fa-IR')} تومان است.` };
  const amount = Math.min(subtotal, d.percent ? Math.round((subtotal * d.percent) / 100) : d.amount ?? 0);
  return { code: d.code, amount, label: d.percent ? `تخفیف ${d.percent.toLocaleString('fa-IR')}٪` : 'تخفیف' };
}

export async function shippingOptions(province: string, subtotal: number) {
  const store = await getStore();
  const free = subtotal >= store.freeShipFrom;
  return store.shipping.map((o) => ({
    ...o,
    available: !o.tehranOnly || province === 'تهران',
    cost: free ? 0 : o.price,
  }));
}

export async function shippingCost(method: string, province: string, subtotal: number): Promise<number | null> {
  const o = (await shippingOptions(province, subtotal)).find((x) => x.id === method);
  return o && o.available ? o.cost : null;
}
