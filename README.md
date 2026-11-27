# LUMIÈRE — skincare store

Persian (RTL) e-commerce site built from the LUMIÈRE design canvas, made to be hosted on a single server inside Iran.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web | Astro 5 (server-rendered) + Preact islands | HTML-first pages, ~13 KB gzipped JS per page; good Core Web Vitals on slow mobile networks |
| Data | PostgreSQL 17 + Drizzle ORM | Transactions for stock and payments; typed queries; versioned migrations |
| Sessions, OTP, rate limits | Postgres tables | One less service to run (no Redis) |
| Catalog | In-memory cache (60 s, invalidated on admin edits) | Most pages need zero DB queries |
| Edge | Nginx page cache (60 s) + gzip | Most traffic never reaches Node |
| Payments | Zarinpal (`src/lib/payment.ts`) | Mock gateway in development |
| SMS | Kavenegar (`src/lib/sms.ts`) | Console output in development |

No runtime dependency outside Iran: fonts are self-hosted, no Google scripts, no foreign CDN.

## Run locally

```sh
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # Postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev                                       # http://localhost:4321
```

Login codes and SMS messages are printed in the terminal. Phones listed in `ADMIN_PHONES` become admins.

After changing `src/db/schema.ts`: `npm run db:generate` then `npm run db:migrate`.

## Deploy (Iranian VPS, 2 vCPU / 4 GB RAM / 60 GB NVMe)

```sh
cp .env.example .env    # set SITE_URL, POSTGRES_PASSWORD, ZARINPAL_*, KAVENEGAR_*, ADMIN_PHONES, PAYMENT_PROVIDER=zarinpal, SMS_PROVIDER=kavenegar
docker compose build --build-arg REGISTRY=docker.arvancloud.ir/
REGISTRY=docker.arvancloud.ir/ docker compose up -d
docker compose exec app node -e "1"   # sanity check
```

Then: put TLS certs in `deploy/certs/` and enable the HTTPS block in `deploy/nginx.conf`; schedule `deploy/backup.sh` nightly and copy `backups/` off-server.

Memory budget: Postgres 1 GB, app 512 MB, Nginx 128 MB, leaving room for the OS and page cache.

## Before launch

- Replace the `[نماد اعتماد]` / `[مجوز غذا و دارو]` placeholders in `src/components/Footer.astro` with the real eNamad and Samandehi snippets.
- Fill each product's IRC code, INCI list and photos in the admin panel.
- Create a Kavenegar "verify lookup" template named as in `KAVENEGAR_OTP_TEMPLATE` (token: `%token`).
- Register `/feeds/products.json` with Torob and Emalls, and `/sitemap.xml` in Google Search Console.
- Ratings come only from approved reviews; the design's large review counts were placeholders and are not shown.
