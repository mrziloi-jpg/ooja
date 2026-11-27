import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { body, fail, json } from '~/lib/http';

// Hearts always update localStorage; for logged-in customers this also persists them, so the wishlist follows them across devices.
// Guests get 204 and nothing is stored server-side.
const Toggle = z.object({ productId: z.number().int().positive(), on: z.boolean(), alert: z.boolean().optional() });

export const POST: APIRoute = async ({ request, locals }) => {
  const b = await body(request, Toggle);
  if (!b) return fail('درخواست نامعتبر است.');
  const u = locals.user;
  if (!u) return new Response(null, { status: 204 });
  const [p] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.id, b.productId)).limit(1);
  if (!p) return fail('محصول پیدا نشد.', 404);

  if (b.alert !== undefined) {
    // "Tell me when it's back in stock"
    if (b.on) await db.insert(s.stockAlerts).values({ userId: u.id, productId: p.id }).onConflictDoNothing();
    else await db.delete(s.stockAlerts).where(and(eq(s.stockAlerts.userId, u.id), eq(s.stockAlerts.productId, p.id)));
  } else if (b.on) {
    await db.insert(s.wishlist).values({ userId: u.id, productId: p.id }).onConflictDoNothing();
  } else {
    await db.delete(s.wishlist).where(and(eq(s.wishlist.userId, u.id), eq(s.wishlist.productId, p.id)));
  }
  return json({ ok: true });
};
