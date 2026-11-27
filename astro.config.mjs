import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

const site = new URL(process.env.SITE_URL || 'http://localhost:4321');

export default defineConfig({
  site: site.origin,
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  trailingSlash: 'never',
  build: { inlineStylesheets: 'auto' },
  // Iranian networks are slow on first byte; prefetch on hover makes navigation feel instant.
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  // checkOrigin blocks cross-site form posts (CSRF). Behind Nginx the app sees http://app:4321,
  // so trust X-Forwarded-Host/Proto only for our own public host.
  security: { checkOrigin: true, allowedDomains: [{ hostname: site.hostname, protocol: site.protocol.replace(':', '') }] },
  image: { service: { entrypoint: 'astro/assets/services/sharp' } },
});
