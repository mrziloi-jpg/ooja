import type { APIRoute } from 'astro';
import { getCatalog } from '~/lib/catalog';
import { config } from '~/lib/config';

// Product feed for Iranian price-comparison sites (Torob, Emalls). Register this URL in their merchant panels.
// Field names follow Torob's commonly used feed format; confirm against their current docs when onboarding.
export const GET: APIRoute = async ({ url }) => {
  const cat = await getCatalog();
  const site = config.siteUrl.replace(/\/$/, '');
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const size = 100;
  const items = cat.products.flatMap((p) => p.variants.map((v) => ({
    product_id: String(v.id),
    page_unique: String(v.id),
    page_url: `${site}/p/${p.slug}`,
    title: `${p.nameFa} ${p.nameEn} ${v.label}`,
    subtitle: p.nameEn,
    current_price: v.price,
    old_price: v.compareAt ?? v.price,
    availability: v.stock > 0 ? 'instock' : 'outofstock',
    category_name: p.categoryName,
    image_link: p.image ? `${site}${p.image}-960.webp` : null,
    short_desc: p.tagline,
    spec: { brand: 'OOJA SHOP', size: v.label },
  })));
  return new Response(JSON.stringify({
    count: items.length, max_pages: Math.ceil(items.length / size), products: items.slice((page - 1) * size, page * size),
  }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, s-maxage=600' } });
};
