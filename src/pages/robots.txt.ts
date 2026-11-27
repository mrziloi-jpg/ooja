import type { APIRoute } from 'astro';
import { config } from '~/lib/config';

export const GET: APIRoute = () => {
  const site = config.siteUrl.replace(/\/$/, '');
  const body = `User-agent: *
Disallow: /admin
Disallow: /account
Disallow: /api/
Disallow: /cart
Disallow: /checkout
Disallow: /login

Sitemap: ${site}/sitemap.xml
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=86400' } });
};
