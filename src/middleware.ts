import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from '~/lib/auth';
import { startJobs } from '~/lib/jobs';

startJobs();

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  // Static assets never need a session lookup.
  if (path.startsWith('/_astro/') || path.startsWith('/fonts/') || path.startsWith('/media/')) return next();

  ctx.locals.user = await getSessionUser(ctx.cookies);

  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    if (!ctx.locals.user) return ctx.redirect(`/login?next=${encodeURIComponent(path)}`);
    if (ctx.locals.user.role !== 'admin') return new Response('Forbidden', { status: 403 });
  }
  if (path.startsWith('/account') && !ctx.locals.user) {
    return ctx.redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const res = await next();
  // Pages for logged-in users or with personal data must never be cached by Nginx/CDN.
  if (!res.headers.has('cache-control')) {
    res.headers.set('cache-control', 'private, no-store');
  }
  return res;
});
