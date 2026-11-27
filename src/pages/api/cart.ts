import type { APIRoute } from 'astro';
import { z } from 'zod';
import { changeCart, getCartId, readCart } from '~/lib/cart';
import { body, fail, json } from '~/lib/http';

export const GET: APIRoute = async ({ cookies }) => json(await readCart(getCartId(cookies)));

const Change = z.object({
  items: z.array(z.object({ variantId: z.number().int().positive(), qty: z.number().int().min(-10).max(10) })).min(1).max(20),
  mode: z.enum(['add', 'set']),
});

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const b = await body(request, Change);
  if (!b) return fail('درخواست نامعتبر است.');
  return json(await changeCart(cookies, b.items, b.mode, locals.user?.id));
};
