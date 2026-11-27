# Deploying LUMIÈRE — instructions for the deployment agent

You are deploying a Persian (RTL) skincare e-commerce site to a Linux VPS **inside Iran**. Read this whole file before running anything. Ask the project owner for any value marked **ASK**; never invent credentials.

## 1. What the project is

| Item | Value |
|---|---|
| App | Astro 5 server-rendered site (Node 24), entry `dist/server/entry.mjs`, listens on port 4321, runs as the unprivileged `node` user |
| Database | PostgreSQL 17, schema managed by Drizzle; migrations in `drizzle/` (7 files), applied automatically on container start by `scripts/migrate.mjs` |
| Edge | Nginx: page cache, gzip, rate limit on `/api/`, serves uploaded photos from `/media/` |
| Orchestration | `docker-compose.yml` (production): services `app`, `db`, `nginx`; volumes `pgdata`, `media`, `nginxcache` |
| Not used in production | `docker-compose.dev.yml`, `npm run dev`, `drizzle.config.ts` |

**Status: the whole site is built and tested** (about 230 automated checks). Public pages: home, shop, category/concern pages, products, cart, checkout, skin quiz (`/quiz`), ingredient glossary (`/ingredients`), consultation booking (`/consultation`), help center with order tracking (`/help`), about (`/about`), legal pages (`/terms`, `/privacy`, `/returns`). Logged-in: customer account (`/account`) and admin panel (`/admin`). Admins are the phone numbers in `ADMIN_PHONES`.

**The production image has been verified** on Docker: it builds, applies migrations, serves every page, formats Persian (Jalali) dates, accepts product photo uploads into the `media` volume, and uses about 170 MB of RAM.

Background jobs run **inside the app process**: release unpaid orders after 30 min, abandoned-cart SMS, back-in-stock SMS, reorder reminders, consultation reminders (1 h before), cleanup. Run exactly one `app` container. If you ever scale out, set `JOBS=off` on all but one.

**Deploy to a staging domain first.** Do not announce the site publicly until the owner says so (see step 12 for what the owner must finish first).

## 2. Server requirements

- Ubuntu 22.04/24.04 (or Debian 12), **2 vCPU, 4 GB RAM, 60 GB+ NVMe**, hosted in an Iranian data center (ArvanCloud, ParsPack, Asiatech, etc.).
- Docker Engine + Docker Compose v2 plugin.
- Ports 80 and 443 open. Do **not** expose 5432 or 4321 publicly (the production compose file doesn't).
- A domain (ideally `.ir`) with an A record pointing to the server. **ASK** for the domain.

Memory caps in compose: db 1 GB, app 512 MB, nginx 128 MB.

## 3. Sanctions/network notes for Iranian servers

- **Docker Hub blocks Iranian IPs.** Use the ArvanCloud mirror by setting `REGISTRY=docker.arvancloud.ir/` (the trailing slash matters). The Dockerfile and compose file prefix every image with `${REGISTRY}`. Alternative: configure `/etc/docker/daemon.json` with `"registry-mirrors": ["https://docker.arvancloud.ir"]` and leave `REGISTRY` empty.
- **npm may be slow or blocked** from Iranian IPs during `npm ci` in the image build. If the build fails at `npm ci`, either:
  - build the image on a machine outside Iran (with the same `SITE_URL` build arg, see step 5), then `docker save lumiere-app | gzip > app.tar.gz`, copy it over, and `docker load < app.tar.gz`; or
  - use an Iranian npm mirror by adding `RUN npm config set registry <mirror-url>` before `npm ci` in the Dockerfile (**ASK** the owner which mirror they trust).
- The app makes outbound HTTPS calls only to `api.kavenegar.com` (SMS) and `payment.zarinpal.com` / `sandbox.zarinpal.com` (payments), both Iranian services. No fonts, scripts or assets are loaded from outside Iran.

## 4. Copy the code to the server

The project is not a git repository. Copy it with rsync, excluding local artifacts:

```sh
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .astro --exclude .env \
  --exclude media --exclude backups --exclude deploy/certs \
  ./ user@SERVER:/opt/lumiere/
```

All following commands run in `/opt/lumiere` on the server. (The folder name matters: Compose names the network and volumes after it, e.g. `lumiere_default`, `lumiere_media`.)

## 5. Configure `.env`

```sh
cp .env.example .env
chmod 600 .env
```

Set these values (production compose overrides `DATABASE_URL` and `MEDIA_DIR` itself, so leave those as they are):

| Variable | Value |
|---|---|
| `SITE_URL` | `https://<domain>`, no trailing slash. Used for the payment callback URL, SMS links, canonical URLs and the sitemap, so it **must** be the real public HTTPS URL. It is also **baked into the image at build time** (it tells the app which proxy host to trust for form security), so set it before `docker compose build` and **rebuild** if it changes. If it is wrong, every admin form save fails with HTTP 403. |
| `POSTGRES_PASSWORD` | Generate: `openssl rand -base64 32 \| tr -d '/+='` |
| `REGISTRY` | `docker.arvancloud.ir/` |
| `PAYMENT_PROVIDER` | `mock` for staging; `zarinpal` for live |
| `ZARINPAL_MERCHANT_ID` | **ASK** (needed when `PAYMENT_PROVIDER=zarinpal`) |
| `ZARINPAL_SANDBOX` | `true` for testing with Zarinpal sandbox, `false` for live |
| `SMS_PROVIDER` | `kavenegar` (with `console`, SMS texts and OTP codes only appear in `docker compose logs app`) |
| `KAVENEGAR_API_KEY` | **ASK** |
| `KAVENEGAR_OTP_TEMPLATE` | Name of the verify-lookup template in the Kavenegar panel (default `lumiere-otp`, its token is `%token`). **ASK** if it exists. |
| `KAVENEGAR_SENDER` | Sender line number for normal SMS (order updates, reminders, support replies). **ASK** (optional) |
| `ADMIN_PHONES` | Comma-separated mobile numbers that get admin role on login. **ASK** |

Contact details, social links, shipping prices, payment toggles and the legal texts are **not** environment variables: the owner edits them in Admin › Settings after launch.

⚠️ With `PAYMENT_PROVIDER=mock`, anyone can "pay" through a fake gateway at `/checkout/mock-gateway`. Never leave `mock` on a publicly announced site.

## 6. HTTPS (required before testing login)

The container runs with `NODE_ENV=production`, so session and cart cookies are set with the `Secure` flag. **Over plain HTTP, login and cart will not work.** Set up TLS first.

1. Get a certificate (Let's Encrypt works from Iran), e.g. with certbot in standalone mode **before** starting nginx:
   ```sh
   sudo apt install -y certbot
   sudo certbot certonly --standalone -d <domain> -d www.<domain>
   mkdir -p deploy/certs
   sudo cp /etc/letsencrypt/live/<domain>/fullchain.pem /etc/letsencrypt/live/<domain>/privkey.pem deploy/certs/
   ```
   For renewals, add a cron job / certbot deploy hook that copies the renewed files into `deploy/certs/` and runs `docker compose exec nginx nginx -s reload`. (Standalone renewal needs port 80 free; switch to `--webroot` or stop nginx briefly during renewal.)

2. Edit `deploy/nginx.conf`:
   - In the existing `listen 80` server, comment out all `location` blocks and enable `return 301 https://$host$request_uri;`.
   - Replace the commented HTTPS server stub with a real one containing the **same four `location` blocks** (`/media/`, `/_astro/`, `/api/`, `/`):
   ```nginx
   server {
     listen 443 ssl;
     http2 on;
     server_name <domain> www.<domain>;
     ssl_certificate /etc/nginx/certs/fullchain.pem;
     ssl_certificate_key /etc/nginx/certs/privkey.pem;
     ssl_protocols TLSv1.2 TLSv1.3;
     ssl_session_cache shared:SSL:10m;
     add_header Strict-Transport-Security "max-age=31536000" always;

     # paste the /media/, /_astro/, /api/ and / location blocks here unchanged
   }
   ```
   Keep `include /etc/nginx/proxy_params_lumiere;` in the `/api/` and `/` blocks: it forwards `X-Real-IP` (the app's rate limiters rely on it) and `X-Forwarded-Host`/`X-Forwarded-Proto` (admin and account forms rely on them). Keep `client_max_body_size 12m;` (product photos up to 10 MB).

## 7. Build and start

```sh
docker compose build --build-arg REGISTRY=docker.arvancloud.ir/
docker compose up -d
docker compose ps                 # all three services "running", db "healthy"
docker compose logs app | tail    # expect "migrations applied" then the server start line
```

## 8. Seed the catalog (first deploy only)

The database starts empty. The seed adds the 14 products, categories, skin concerns and 10 glossary ingredients from the design (the owner then edits prices, stock, photos and texts in the admin). It needs `tsx`, which is not in the slim runtime image, so run it from the build stage:

```sh
docker build --target build --build-arg REGISTRY=docker.arvancloud.ir/ --build-arg SITE_URL=$(grep ^SITE_URL .env | cut -d= -f2-) -t lumiere-build .
NET=$(docker network ls --format '{{.Name}}' | grep lumiere | grep default)   # usually lumiere_default
PW=$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2-)
docker run --rm --network "$NET" -e DATABASE_URL="postgres://lumiere:$PW@db:5432/lumiere" lumiere-build sh -c "npx tsx src/db/seed.ts && npx tsx src/db/seed-ingredients.ts"
```

Expected output: `seeded 14 products` then `glossary content applied to 10 ingredients`. Running it again is a no-op. **Never** pass `--reset` on a live database: it wipes products and reviews. Ask the owner first if they already have their own catalog.

Optional test discount code:
```sh
docker compose exec db psql -U lumiere -c "INSERT INTO discount_codes (code, percent) VALUES ('LUMI15', 15) ON CONFLICT DO NOTHING;"
```

## 9. Verify

```sh
D=https://<domain>
for u in / /shop /shop/serums /concern/acne /p/niacinamide-10-zinc-1 /quiz /ingredients /ingredients/retinal /consultation /help /about /terms /privacy /returns /cart /login /sitemap.xml /robots.txt /feeds/products.json; do
  printf "%-32s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' $D$u)"; done     # all 200
curl -sI $D/ | grep -i x-cache                # MISS on the first request, HIT on the second within 60 s
curl -sI $D/cart | grep -i cache-control     # must be "private, no-store" (never cached)
docker compose exec app node -e "console.log(new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'long'}).format(new Date()))"   # a Persian date, e.g. ۵ آذر ۱۴۰۵
docker compose exec app sh -c 'touch /media/.w && rm /media/.w && echo media writable'
```

Then in a browser:
1. Open the home page; Persian text renders in the Vazirmatn font, layout is right-to-left.
2. Add a product to the cart; the cart drawer opens and the header count updates.
3. Log in at `/login` with an `ADMIN_PHONES` number; the SMS code arrives (or appears in `docker compose logs app` if `SMS_PROVIDER=console`). You land on `/admin`.
4. In Admin › Products, open a product, upload a photo and save; the photo appears on the product page.
5. Place an order. With `mock`: click "پرداخت موفق" and you land on `/checkout/done/LM-xxxxxx`. With Zarinpal sandbox: complete the sandbox payment.
6. Confirm in the DB:
   ```sh
   docker compose exec db psql -U lumiere -c "SELECT code, status, payment_status, total FROM orders ORDER BY id DESC LIMIT 3;"
   ```
   A paid order shows `pending | paid`. A canceled payment shows `canceled | failed` and its stock is restored.
7. Book a consultation at `/consultation` and see it in Admin › Consultations; send a message from the `/help` contact form and see it in Admin › Messages.

## 10. Backups

```sh
chmod +x deploy/backup.sh
mkdir -p backups
( crontab -l 2>/dev/null; echo "15 3 * * * /opt/lumiere/deploy/backup.sh >> /var/log/lumiere-backup.log 2>&1" ) | crontab -
```

This keeps 14 daily `pg_dump` files in `backups/`. Also copy them **off the server** (e.g. rclone to object storage at a different provider). **ASK** the owner for a destination. Test a restore once:
```sh
docker compose exec -T db pg_restore -U lumiere -d lumiere --clean --if-exists < backups/<file>.dump
```

Back up the product photos too (the `media` volume), e.g. nightly:
```sh
docker run --rm -v lumiere_media:/m -v $PWD/backups:/b alpine tar czf /b/media.tgz -C /m .
```

## 11. Updating to a new version

```sh
# from the dev machine: same rsync as in step 4, then on the server:
docker compose build --build-arg REGISTRY=docker.arvancloud.ir/ app
docker compose up -d app         # migrations run automatically on start
docker compose exec nginx sh -c 'rm -rf /var/cache/nginx/pages/*' && docker compose exec nginx nginx -s reload   # flush page cache
```

Downtime is a few seconds while the app restarts; Nginx serves cached pages during that time. If a new version adds glossary ingredients, also rerun the seed command from step 8 (it only fills empty fields and never overwrites the owner's edits).

## 12. Hand-over: what the owner must do before the site goes public

Not your job to do, but list it in your report so nothing is missed:
- **Admin › Settings › Legal pages:** terms, privacy and returns are **drafts** until saved. The admin shows a red warning while any is still a draft. eNamad reviews the terms page.
- **Admin › Settings › Contact:** support phone, email, Telegram, hours, Instagram/Telegram links, founding year (empty fields are hidden on the site).
- **Admin › Products:** real photos, prices, stock, IRC codes and full ingredient lists (INCI).
- **Admin › Ingredient glossary:** write the articles (the list flags missing ones).
- **Footer trust badges:** replace the `[نماد اعتماد]` / `[مجوز غذا و دارو]` placeholders in `src/components/Footer.astro` with the official eNamad and Samandehi embed code, then redeploy (step 11).
- Switch `PAYMENT_PROVIDER=zarinpal` (with `ZARINPAL_SANDBOX=false`) and `SMS_PROVIDER=kavenegar`, then `docker compose up -d app`.
- Submit `https://<domain>/sitemap.xml` to Google Search Console and `https://<domain>/feeds/products.json` to Torob and Emalls.

## 13. Security checklist

- [ ] `.env` is `chmod 600` and never copied back or committed.
- [ ] Only ports 22, 80, 443 open (`ufw allow 22,80,443/tcp && ufw enable`). Docker publishes ports past ufw, so confirm `docker compose ps` shows no published ports for `db` and `app`.
- [ ] SSH: key login only, password login disabled.
- [ ] `PAYMENT_PROVIDER` is not `mock` once the site is public.
- [ ] HTTPS works and HTTP redirects to HTTPS.
- [ ] Off-server backups (database and media) run and a restore has been tested.

## 14. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Image pull fails with 403 / timeout | Docker Hub blocked; check `REGISTRY` or the daemon mirror (step 3) |
| Build fails at `npm ci` | npm blocked/slow; build outside Iran or use a mirror (step 3) |
| Login "works" but you're immediately logged out; cart is always empty | Site served over HTTP; cookies are `Secure`. Finish step 6. |
| Admin or account forms (save product, change order status, add address…) fail with 403 | `SITE_URL` at build time doesn't match the public host, or Nginx isn't sending `X-Forwarded-Host`/`X-Forwarded-Proto`. Fix `.env`, keep the `proxy_params_lumiere` include, and **rebuild** the `app` image (step 11). |
| Payment returns to the wrong host / SMS links point to the wrong site | `SITE_URL` is wrong; it must be the public `https://` URL. Fix `.env` and rebuild the `app` image. |
| Photo upload fails with "EACCES" in `docker compose logs app` | The `media` volume was created root-owned (e.g. by an older image). Fix once: `docker compose run --rm -u root app chown -R node:node /media`, then retry. |
| Product photos upload but don't show | The `media` volume must be mounted in both `app` (read-write) and `nginx` (read-only) as in `docker-compose.yml`. |
| `app` restarts in a loop | `docker compose logs app`: usually a wrong `POSTGRES_PASSWORD` after the db volume was created with another one. The password is fixed at first db start; either restore the old one or (only on an empty staging DB) `docker compose down -v`. |
| Every visitor hits the rate limit together | Nginx isn't passing `X-Real-IP`; keep the `include proxy_params_lumiere` lines. |
| Dates show as Gregorian or garbled | The Node build lacks full ICU (not the case with the official `node:24-alpine` image). Check with the `Intl` command in step 9. |
| Prices, settings or products changed but the site shows old data | The app caches the catalog and settings for 60 s and Nginx caches pages for 60 s; wait or flush (step 11). |
| No SMS arrive but the site works | `SMS_PROVIDER=console` still set, or Kavenegar key/template/sender wrong; check `docker compose logs app` for `[sms]` lines and errors. |

When done, report to the owner: the URL, which payment/SMS mode is active, where backups go, the step 12 hand-over list, and anything you could not complete.
