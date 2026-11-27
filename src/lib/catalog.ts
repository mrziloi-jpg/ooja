import { asc, eq } from 'drizzle-orm';
import { db, sql, schema as s } from '~/db';
import type { ProductDetails } from '~/db/schema';

export type Variant = { id: number; label: string; price: number; compareAt: number | null; stock: number };
export type Product = {
  id: number; slug: string; nameEn: string; nameFa: string; tagline: string | null; blurb: string | null;
  description: string | null; inci: string | null; category: string; categoryName: string; role: string | null;
  shape: string; glass: string; image: string | null; badge: string | null; rating: number; reviewsCount: number;
  ircCode: string | null; skinTypes: string[]; salesScore: number; details: ProductDetails; sort: number;
  variants: Variant[]; concerns: string[]; ingredients: string[]; minPrice: number; inStock: boolean; updatedAt: Date;
};
export type Category = typeof s.categories.$inferSelect;
export type Concern = typeof s.concerns.$inferSelect;
export type Ingredient = typeof s.ingredients.$inferSelect;
export type Catalog = {
  products: Product[]; bySlug: Map<string, Product>; byId: Map<number, Product>;
  categories: Category[]; concerns: Concern[]; ingredients: Ingredient[];
};

const TTL_MS = 60_000;
let cache: { at: number; data: Promise<Catalog> } | null = null;

async function load(): Promise<Catalog> {
  const [rows, variants, pc, pi, categories, concerns, ingredients] = await Promise.all([
    db.select({ p: s.products, c: s.categories }).from(s.products)
      .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
      .where(eq(s.products.active, true)).orderBy(asc(s.products.sort), asc(s.products.id)),
    db.select().from(s.variants).orderBy(asc(s.variants.sort), asc(s.variants.id)),
    sql<{ product_id: number; slug: string }[]>`SELECT pc.product_id, c.slug FROM product_concerns pc JOIN concerns c ON c.id = pc.concern_id`,
    sql<{ product_id: number; slug: string }[]>`SELECT pi.product_id, i.slug FROM product_ingredients pi JOIN ingredients i ON i.id = pi.ingredient_id`,
    db.select().from(s.categories).orderBy(asc(s.categories.sort)),
    db.select().from(s.concerns).orderBy(asc(s.concerns.sort)),
    db.select().from(s.ingredients).orderBy(asc(s.ingredients.sort), asc(s.ingredients.id)),
  ]);
  const group = <T,>(list: { product_id: number }[], pick: (x: any) => T) => {
    const m = new Map<number, T[]>();
    for (const x of list) (m.get(x.product_id) ?? m.set(x.product_id, []).get(x.product_id)!).push(pick(x));
    return m;
  };
  const vBy = group(variants.map((v) => ({ ...v, product_id: v.productId })), (v) => ({ id: v.id, label: v.label, price: v.price, compareAt: v.compareAt, stock: v.stock }));
  const cBy = group(pc, (x) => x.slug as string);
  const iBy = group(pi, (x) => x.slug as string);

  const products: Product[] = rows.map(({ p, c }) => {
    const vs = vBy.get(p.id) ?? [];
    return {
      id: p.id, slug: p.slug, nameEn: p.nameEn, nameFa: p.nameFa, tagline: p.tagline, blurb: p.blurb, description: p.description,
      inci: p.inci, category: c.slug, categoryName: c.name, role: c.role, shape: p.shape, glass: p.glass, image: p.image,
      badge: p.badge, rating: p.rating, reviewsCount: p.reviewsCount, ircCode: p.ircCode, skinTypes: p.skinTypes,
      salesScore: p.salesScore, details: p.details ?? {}, sort: p.sort, variants: vs,
      concerns: cBy.get(p.id) ?? [], ingredients: iBy.get(p.id) ?? [],
      minPrice: vs.length ? Math.min(...vs.map((v) => v.price)) : 0, inStock: vs.some((v) => v.stock > 0), updatedAt: p.updatedAt,
    };
  }).filter((p) => p.variants.length > 0);

  return {
    products, bySlug: new Map(products.map((p) => [p.slug, p])), byId: new Map(products.map((p) => [p.id, p])),
    categories, concerns, ingredients,
  };
}

export function getCatalog(): Promise<Catalog> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const data = load();
    cache = { at: Date.now(), data };
    data.catch(() => { cache = null; }); // don't cache failures
  }
  return cache.data;
}

/** Call after any admin change to products, variants, stock or taxonomy. */
export function invalidateCatalog() {
  cache = null;
}

// ---- Shop filtering (pure; runs over the in-memory catalog) ----

export type ShopQuery = { q: string; cat: string[]; concern: string[]; skin: string[]; ing: string[]; price: string; sort: string };

export const PRICE_RANGES: [string, string, number, number][] = [
  ['all', 'همه', 0, Infinity],
  ['low', 'زیر ۵۰۰ هزار تومان', 0, 499_999],
  ['mid', '۵۰۰ تا ۸۰۰ هزار تومان', 500_000, 800_000],
  ['high', 'بالای ۸۰۰ هزار تومان', 800_001, Infinity],
];

export function parseShopQuery(u: URL): ShopQuery {
  const list = (k: string) => u.searchParams.getAll(k).flatMap((v) => v.split(',')).filter(Boolean);
  return {
    q: (u.searchParams.get('q') ?? '').trim().slice(0, 80),
    cat: list('cat'), concern: list('concern'), skin: list('skin'), ing: list('ing'),
    price: u.searchParams.get('price') ?? 'all',
    sort: u.searchParams.get('sort') ?? 'rec',
  };
}

const norm = (t: string) => t.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');

export function matches(p: Product, q: ShopQuery, cat: Catalog, skip?: keyof ShopQuery) {
  if (q.q) {
    const ingNames = p.ingredients.map((slug) => cat.ingredients.find((i) => i.slug === slug)?.nameFa ?? '').join(' ');
    const concernNames = p.concerns.map((slug) => cat.concerns.find((c) => c.slug === slug)?.name ?? '').join(' ');
    const hay = norm(`${p.nameEn} ${p.nameFa} ${p.tagline ?? ''} ${p.categoryName} ${ingNames} ${concernNames}`);
    if (!norm(q.q).split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (skip !== 'cat' && q.cat.length && !q.cat.includes(p.category)) return false;
  if (skip !== 'concern' && q.concern.length && !q.concern.some((c) => p.concerns.includes(c))) return false;
  if (skip !== 'skin' && q.skin.length && !q.skin.some((c) => p.skinTypes.includes(c))) return false;
  if (skip !== 'ing' && q.ing.length && !q.ing.some((c) => p.ingredients.includes(c))) return false;
  if (skip !== 'price') {
    const r = PRICE_RANGES.find((x) => x[0] === q.price) ?? PRICE_RANGES[0];
    if (p.minPrice < r[2] || p.minPrice > r[3]) return false;
  }
  return true;
}

const SORTS: Record<string, (a: Product, b: Product) => number> = {
  rec: (a, b) => a.sort - b.sort,
  best: (a, b) => b.salesScore - a.salesScore,
  rating: (a, b) => b.rating - a.rating,
  low: (a, b) => a.minPrice - b.minPrice,
  high: (a, b) => b.minPrice - a.minPrice,
};

export function filterProducts(cat: Catalog, q: ShopQuery) {
  return cat.products.filter((p) => matches(p, q, cat)).sort(SORTS[q.sort] ?? SORTS.rec);
}
