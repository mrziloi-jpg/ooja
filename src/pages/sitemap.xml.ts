import type { APIRoute } from 'astro';
import { getCatalog } from '~/lib/catalog';
import { config } from '~/lib/config';

export const GET: APIRoute = async () => {
  const cat = await getCatalog();
  const site = config.siteUrl.replace(/\/$/, '');
  const urls: { loc: string; lastmod?: Date; priority: string }[] = [
    { loc: '/', priority: '1.0' },
    { loc: '/shop', priority: '0.9' },
    { loc: '/quiz', priority: '0.7' },
    { loc: '/ingredients', priority: '0.8' },
    { loc: '/consultation', priority: '0.6' },
    { loc: '/help', priority: '0.4' },
    { loc: '/about', priority: '0.4' },
    { loc: '/terms', priority: '0.2' },
    { loc: '/privacy', priority: '0.2' },
    { loc: '/returns', priority: '0.3' },
    ...cat.categories.map((c) => ({ loc: `/shop/${c.slug}`, priority: '0.8' })),
    ...cat.concerns.map((c) => ({ loc: `/concern/${c.slug}`, priority: '0.8' })),
    ...cat.ingredients.map((i) => ({ loc: `/ingredients/${i.slug}`, priority: '0.7' })),
    ...cat.products.map((p) => ({ loc: `/p/${p.slug}`, lastmod: p.updatedAt, priority: '0.9' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600' } });
};
