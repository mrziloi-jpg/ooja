# Deploying OOJA SHOP: production + staging on one server

Instructions for the person or agent who deploys and runs the site. Read the whole file before running anything. Values marked **ASK** come from the project owner: never invent domains, phone numbers, credentials or a backup destination.

## Contents

1. [What runs where](#1-what-runs-where)
2. [Rules that are never broken](#2-rules-that-are-never-broken)
3. [Server and network (Iran)](#3-server-and-network-iran)
4. [The `.env` files](#4-the-env-files)
5. [First-time setup](#5-first-time-setup)
6. [Migrating from the old single stack](#6-migrating-from-the-old-single-stack)
7. [Releasing a new version](#7-releasing-a-new-version)
8. [Rollback](#8-rollback)
9. [Refreshing staging from production](#9-refreshing-staging-from-production)
10. [Backups](#10-backups)
11. [Restore](#11-restore)
12. [Launch: opening production to the public](#12-launch-opening-production-to-the-public)
13. [Verify](#13-verify)
14. [Hand-over: what the owner must do](#14-hand-over-what-the-owner-must-do)
15. [Security checklist](#15-security-checklist)
16. [Troubleshooting](#16-troubleshooting)
17. [Script reference](#17-script-reference)

## 1. What runs where

The app is a Persian (RTL) skincare shop: an Astro 5 server-rendered site (Node 24), PostgreSQL 17 (Drizzle migrations, applied automatically when the app container starts) and an nginx page cache. Code: `https://github.com/mrziloi-jpg/ooja`, branch `main`.

One server runs **two fully separate environments** behind **one shared edge proxy**:

```
                 internet :80 / :443
                         │
        ┌────────────────▼─────────────────┐   project "lumiere-edge"   (/opt/lumiere/deploy/edge)
        │ edge nginx: TLS, HTTP→HTTPS,     │   the ONLY container that publishes ports
        │ HSTS, basic auth, ACME webroot   │
        └───────┬─────────────────┬────────┘
   Docker network "edge" (172.31.250.0/24)
                │                 │
   oojashop.ir  │                 │  staging.oojashop.ir
   www → apex   │                 │  (always basic auth + noindex)
   ┌────────────▼──────┐   ┌──────▼─────────────┐
   │ nginx (cache)     │   │ nginx (cache)      │
   │ app  (Node)       │   │ app  (mock / console, forced)
   │ db   (Postgres)   │   │ db   (Postgres)    │
   └───────────────────┘   └────────────────────┘
   project "lumiere"         project "lumiere-staging"
   /opt/lumiere              /opt/lumiere-staging
```

| | Production | Staging |
|---|---|---|
| Domain | `oojashop.ir` (`www.oojashop.ir` redirects to it) | `staging.oojashop.ir` |
| Directory | `/opt/lumiere` (git checkout) | `/opt/lumiere-staging` (git checkout) |
| Compose project | `lumiere` | `lumiere-staging` |
| Compose files | `docker-compose.yml` + `deploy/compose.prod.yml` | `docker-compose.yml` + `deploy/compose.staging.yml` |
| Volumes | `lumiere_pgdata`, `lumiere_media`, `lumiere_nginxcache` | `lumiere-staging_pgdata`, `…_media`, `…_nginxcache` |
| Basic auth | Until launch (`deploy/edge/prod-auth.sh`) | Always |
| Payments / SMS | From `.env` (`zarinpal` / `kavenegar` at launch) | **Always** `mock` / `console` (forced by `compose.staging.yml`, whatever `.env` says) |
| Search engines | Indexed after launch | `X-Robots-Tag: noindex`, `robots.txt` disallows everything |
| Memory limits | db 1g, app 512m, nginx 128m | db 512m, app 384m, nginx 64m (overridable, see §4) |
| Backups | Nightly cron, 14 kept | On demand only |

The edge proxy (64m) runs from the production checkout's `deploy/edge/` folder. Its files that hold secrets or state (`auth/`, `enabled/`, `state/`, `.env`) are git-ignored and stay on the server.

How the pieces fit:

- **TLS** ends at the edge. The inner nginx of each stack speaks plain HTTP and is reachable only on the `edge` network under an alias (`lumiere-prod-nginx`, `lumiere-staging-nginx`).
- The edge always sends `X-Forwarded-Proto: https`, `Host`, `X-Forwarded-Host` and `X-Real-IP`. The inner nginx trusts `X-Real-IP` **only** from the edge subnet `172.31.250.0/24`, so the app's rate limits key on the real visitor IP and a visitor cannot fake it.
- **Images** are tagged `lumiere-app:<env>-<commit>`. Each environment builds its own because `SITE_URL` is baked in at build time. `.env.release` in each directory records the running and the previous tag.
- **Background jobs** (unpaid-order release, SMS reminders, cleanup) run inside the app process. Each environment runs exactly one app container. Staging's jobs can only "send" SMS to its log.

## 2. Rules that are never broken

- **Never** run `docker compose down -v`, `docker volume rm` or `seed.ts --reset` against production. They delete the shop's data. (The one exception is the pre-launch migration step in §6, which removes the *old test* volumes once, after backing them up.)
- Always drive a stack through `sh deploy/dc.sh <env> …` or the scripts, never with a bare `docker compose` in `/opt/lumiere`. A bare command misses the environment's override file and project name.
- Data only ever flows **down** (production → staging, anonymized). Nothing copies staging data into production.
- Scripts that change a database print the target project and directory, then ask for confirmation. Production requires typing `production` (or passing `--yes`, for automation only).
- No secrets in git: `.env`, `.env.release`, `.smoke-auth`, htpasswd files, certificates, `backups/` and media stay on the server.

## 3. Server and network (Iran)

**Server:** Debian 13, 3 vCPU, 5.8 GB RAM, 50 GB disk, in an Iranian data center.

**Memory budget** (container limits): production 1.64 GB + staging 0.96 GB + edge 64 MB ≈ 2.7 GB, which leaves about 3 GB for the OS, page cache, image builds and certbot. Real use is lower: the app idles around 170 MB.

**Disk:** each release adds one app image (~250 MB). `release.sh` keeps the newest 5 per environment. Backups: 14 database dumps plus 14 photo archives. Check with `df -h /` and `docker system df`.

**Software:**
- Docker Engine with the Compose plugin **≥ 2.24.4** (the override files use `!reset`). Check with `docker compose version`.
- Also needed: `git`, `curl`, `openssl` and `certbot` (`sudo apt install -y git curl openssl certbot`).
- Do the work as a normal user in the `docker` group who owns `/opt/lumiere` and `/opt/lumiere-staging`. Only certbot needs `sudo`.

**Network notes for Iranian servers:**
- **Docker Hub blocks Iranian IPs.** Every image name is prefixed with `${REGISTRY}`. Set `REGISTRY=docker.arvancloud.ir/` (with the trailing slash) in **all three** `.env` files: production, staging and the edge's `deploy/edge/.env`. Alternatively, configure the daemon mirror in `/etc/docker/daemon.json` (`"registry-mirrors": ["https://docker.arvancloud.ir"]`) and leave `REGISTRY` empty.
- **npm can be slow or blocked** during the image build (`npm ci`). If a release fails there, use an Iranian npm mirror the owner trusts (**ASK**). The fallback is to build the image outside Iran with the right `SITE_URL` build arg, tag it `lumiere-app:<env>-<sha>`, `docker save`/`docker load` it onto the server, and start it with `sh deploy/rollback.sh <env> lumiere-app:<env>-<sha>`.
- **GitHub may be unreachable.** `release.sh` runs `git fetch` in the environment's directory. If GitHub is blocked, create a bare repository on the server (`git init --bare /opt/lumiere.git`), push to it from a development machine (`git push ssh://<user>@<server>/opt/lumiere.git main`), and point both checkouts at it (`git remote set-url origin /opt/lumiere.git`).
- **Let's Encrypt** works from Iran. Issuance and renewal go through the edge (webroot), so they need no downtime.
- The app only calls out to `api.kavenegar.com` (SMS) and `payment.zarinpal.com` / `sandbox.zarinpal.com` (payments).

## 4. The `.env` files

Each environment directory has its own `.env` (`chmod 600`), copied from `.env.example`. Never copy a `.env` between environments without changing `SITE_URL` and `POSTGRES_PASSWORD`.

| Variable | Production `/opt/lumiere/.env` | Staging `/opt/lumiere-staging/.env` |
|---|---|---|
| `SITE_URL` | `https://oojashop.ir` | `https://staging.oojashop.ir` |
| `POSTGRES_PASSWORD` | Its own: `openssl rand -base64 32 \| tr -d '/+='` | A **different** one, generated the same way |
| `REGISTRY` | `docker.arvancloud.ir/` | `docker.arvancloud.ir/` |
| `PAYMENT_PROVIDER` | `mock` before launch, `zarinpal` at launch | Ignored (forced to `mock`) |
| `ZARINPAL_MERCHANT_ID` / `ZARINPAL_SANDBOX` | **ASK** / `false` at launch | Not needed |
| `SMS_PROVIDER` | `kavenegar` (or `console` before launch) | Ignored (forced to `console`; OTP codes appear in `sh deploy/dc.sh staging logs app`) |
| `FIXED_OTP_CODE` | Not used (forced empty by `compose.prod.yml`) | **Temporary:** every staging login code is `11111` by default. Admin rights still need the number in `ADMIN_PHONES`. To turn it off, add an empty `FIXED_OTP_CODE=` line and run `sh deploy/dc.sh staging up -d app`. |
| `KAVENEGAR_API_KEY` / `KAVENEGAR_OTP_TEMPLATE` / `KAVENEGAR_SENDER` | **ASK** (template default `lumiere-otp`) | Not needed |
| `ADMIN_PHONES` | Comma-separated admin mobile numbers, **ASK** | Who may log in as admin on staging. These users also **keep their real data** when staging is refreshed (§9). |
| `BACKUP_RCLONE_REMOTE` | Off-server backup target, e.g. `remote:bucket/lumiere`, **ASK** | Leave unset |
| `STAGING_APP_MEM`, `STAGING_DB_MEM`, `STAGING_NGINX_MEM`, `STAGING_NODE_HEAP_MB`, `STAGING_PG_SHARED_BUFFERS`, `STAGING_PG_CACHE_SIZE` | Not used | Optional overrides. Defaults: `384m`, `512m`, `64m`, `256`, `128MB`, `384MB`. If you raise `STAGING_APP_MEM`, keep the heap about 2/3 of it. |

Notes:
- **`SITE_URL` is baked into the image.** It drives payment callbacks, SMS links, canonical URLs, the sitemap and the trusted host for form security. Change it only together with a new release (§7). If it is wrong, every admin form fails with 403.
- `DATABASE_URL` and `MEDIA_DIR` come from the compose files. Leave them out of `.env`.
- Contact details, shipping prices and legal texts live in **Admin › Settings**, not in `.env`.
- `.env.release` is written by `release.sh` and `rollback.sh`. Never edit it by hand.
- `.smoke-auth` (optional, `chmod 600`) holds `user:password` for the environment's basic auth, so the smoke test can get through. Staging always needs it; production needs it until launch.

## 5. First-time setup

For a fresh server. If the old single stack is running, do §6 first; it tells you where to join this list.

### 5.1 DNS

The A records for `oojashop.ir`, `www.oojashop.ir` and `staging.oojashop.ir` must point to the server **before** step 5.5. Check with `getent hosts oojashop.ir www.oojashop.ir staging.oojashop.ir`. **ASK** the owner if they do not.

### 5.2 Checkouts

```sh
sudo mkdir -p /opt/lumiere /opt/lumiere-staging /var/www/certbot
sudo chown "$USER" /opt/lumiere /opt/lumiere-staging
git clone https://github.com/mrziloi-jpg/ooja.git /opt/lumiere
git clone https://github.com/mrziloi-jpg/ooja.git /opt/lumiere-staging
```

Both checkouts track `origin/main`. `release.sh` moves each one to the exact commit it releases (detached HEAD); that is expected.

### 5.3 Environment files

```sh
cd /opt/lumiere          && cp .env.example .env && chmod 600 .env   # then edit, production column of §4
cd /opt/lumiere-staging  && cp .env.example .env && chmod 600 .env   # then edit, staging column of §4
cd /opt/lumiere/deploy/edge && cp .env.example .env                  # REGISTRY only
```

### 5.4 Edge network and edge proxy

The `edge` network **must** use this subnet: the inner nginx trusts `X-Real-IP` only from it.

```sh
docker network create --subnet 172.31.250.0/24 edge
cd /opt/lumiere/deploy/edge && docker compose up -d
docker compose ps        # lumiere-edge-nginx-1 up, ports 80 and 443
```

At this point the edge serves only port 80: ACME challenges, redirects to HTTPS, and 444 (dropped) for unknown hosts. HTTPS sites are enabled per environment once their certificate exists (5.6).

### 5.5 Certificates (Let's Encrypt, webroot through the edge)

One certificate per environment:

```sh
sudo certbot certonly --webroot -w /var/www/certbot --cert-name oojashop.ir -d oojashop.ir -d www.oojashop.ir
sudo certbot certonly --webroot -w /var/www/certbot --cert-name staging.oojashop.ir -d staging.oojashop.ir
sudo install -m 755 /opt/lumiere/deploy/edge/certbot-deploy-hook.sh /etc/letsencrypt/renewal-hooks/deploy/reload-lumiere-edge.sh
sudo certbot renew --dry-run
```

The deploy hook reloads the edge after each renewal. Debian's certbot timer runs `certbot renew` twice a day.

### 5.6 Logins and HTTPS sites

```sh
cd /opt/lumiere
sh deploy/edge/htpasswd.sh staging <user>     # prompts for a password (min 10 characters)
sh deploy/edge/htpasswd.sh prod <user>        # the pre-launch login for production
sh deploy/edge/site.sh enable staging         # refuses without the certificate and the staging login
sh deploy/edge/site.sh enable prod
sh deploy/edge/prod-auth.sh on                # lock production until launch; verifies an anonymous request gets 401
```

Give both logins to the owner. Run `htpasswd.sh` again to add a user or change a password; it takes effect immediately.

### 5.7 First release of each environment

The database starts empty, so catalog pages 404 until the catalog is seeded. The first release therefore skips the smoke test:

```sh
cd /opt/lumiere-staging && sh deploy/release.sh staging --skip-smoke
cd /opt/lumiere         && sh deploy/release.sh prod --skip-smoke     # asks you to type "production"
```

Each run builds `lumiere-app:<env>-<commit>` from `origin/main`, starts db, nginx and app, and waits for `migrations applied`.

### 5.8 Seed the catalog (first deploy only)

The seed adds the 14 products, categories, concerns and 10 glossary ingredients. The owner then edits prices, stock, photos and texts in the admin. It needs `tsx`, which only exists in the build stage. Run in the environment's directory; the example is staging:

```sh
cd /opt/lumiere-staging
docker build --target build \
  --build-arg REGISTRY="$(sed -n 's/^REGISTRY=//p' .env)" \
  --build-arg SITE_URL="$(sed -n 's/^SITE_URL=//p' .env)" -t lumiere-build .
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
docker run --rm --network lumiere-staging_default \
  -e DATABASE_URL="postgres://lumiere:$PW@db:5432/lumiere" \
  lumiere-build sh -c "npx tsx src/db/seed.ts && npx tsx src/db/seed-ingredients.ts"
sh deploy/dc.sh staging restart app
```

For production, run the same in `/opt/lumiere` with `--network lumiere_default`. **Ask the owner first** whether production should start with the demo catalog.

Expected output: `seeded 14 products` and `glossary content applied to 10 ingredients`. A second run changes nothing. **Never** pass `--reset`: it wipes products and reviews.

**After seeding a freshly started app, catalog pages can 404 until the app container is restarted, so restart the app after seeding.** That is the `restart app` line above. (The app caches the empty catalog it saw at start-up.)

### 5.9 Smoke test

```sh
cd /opt/lumiere-staging && echo '<staging user>:<password>' > .smoke-auth && chmod 600 .smoke-auth
sh deploy/smoke.sh staging          # all 19 pages must return 200
cd /opt/lumiere         && echo '<prod user>:<password>' > .smoke-auth && chmod 600 .smoke-auth
sh deploy/smoke.sh prod
```

Then do the browser checks in §13.

### 5.10 Nightly backup (production only)

```sh
mkdir -p /opt/lumiere/backups
( crontab -l 2>/dev/null; echo "15 3 * * * /bin/sh /opt/lumiere/deploy/backup.sh prod >> /opt/lumiere/backups/cron.log 2>&1" ) | crontab -
sh /opt/lumiere/deploy/backup.sh prod     # run once now to make sure it works
```

Off-server copies are covered in §10.

## 6. Migrating from the old single stack

**Current state:** `/opt/lumiere` runs the old single stack (project `lumiere`).
- It serves `staging.oojashop.ir`, with its own nginx publishing 80/443.
- TLS is configured inside `deploy/nginx.conf`, with certificate copies in `deploy/certs/`.
- An HSTS fix was made locally on the server and never committed.
- Its database holds test data that may be discarded.

**Target:** that directory becomes production, and staging moves to `/opt/lumiere-staging`.

Expect `staging.oojashop.ir` to be offline for roughly 15–30 minutes, from step 6.3 until staging's first release in 6.7. Nothing public depends on it.

**6.1 Look first.**

```sh
cd /opt/lumiere
git status && git diff --stat     # expect the local HSTS change in deploy/nginx.conf; note anything else
docker compose ps
sudo ls /etc/letsencrypt/live/    # is there a staging.oojashop.ir certificate?
sudo grep authenticator /etc/letsencrypt/renewal/staging.oojashop.ir.conf 2>/dev/null
```

**6.2 Back up the test data**, even though it may be discarded. **ASK** the owner whether anything in it (products edited in the admin, uploaded photos) should be kept on staging.

```sh
mkdir -p ~/pre-migration && chmod 700 ~/pre-migration
docker compose exec -T db pg_dump -U lumiere -Fc lumiere > ~/pre-migration/test-db.dump
docker compose exec -T nginx tar czf - -C /media . > ~/pre-migration/test-media.tgz
cp .env ~/pre-migration/old.env
git diff > ~/pre-migration/local-changes.diff
ls -la ~/pre-migration            # the dump must not be empty
```

**6.3 Stop the old stack.** This frees ports 80/443; staging is offline from here on.

```sh
docker compose down               # no -v here
```

**6.4 Drop the local changes and update the checkout.** The new edge sends HSTS itself and the inner nginx no longer does TLS, so the local HSTS fix is obsolete. `release.sh` refuses to run while tracked files have local changes.

```sh
git checkout -- .                 # discards the local changes (saved in local-changes.diff)
rm -rf deploy/certs               # old certificate copies; the originals stay in /etc/letsencrypt
git fetch origin && git checkout --detach origin/main
```

**6.5 Remove the old test volumes.** They belong to project `lumiere`, which is production from now on. Otherwise production would start on the test database, which also still expects the old password.

This is the only time volumes are removed, and it is allowed only because:
- they hold test data;
- step 6.2 backed them up;
- production has never launched.

Check the dump from 6.2 again before running:

```sh
docker volume ls | grep '^local *lumiere_'
docker volume rm lumiere_pgdata lumiere_media lumiere_nginxcache
```

**6.6 Environment files.**
- The old `.env` described staging. Use it as the starting point for `/opt/lumiere-staging/.env`, but give it a **new** `POSTGRES_PASSWORD`.
- Rewrite `/opt/lumiere/.env` as production: `SITE_URL=https://oojashop.ir`, its own new `POSTGRES_PASSWORD`, and the rest of §4.

```sh
git clone https://github.com/mrziloi-jpg/ooja.git /opt/lumiere-staging   # after sudo mkdir/chown as in 5.2
cp ~/pre-migration/old.env /opt/lumiere-staging/.env && chmod 600 /opt/lumiere-staging/.env
# edit both .env files now (§4)
cd /opt/lumiere/deploy/edge && cp .env.example .env
sudo mkdir -p /var/www/certbot
```

**6.7 Continue with first-time setup**, with two changes:
- At **5.4**, start the edge.
- At **5.5**, keep the existing staging certificate but switch its renewal to webroot. The old one was probably issued with `--standalone`, which cannot renew while the edge holds port 80:

  ```sh
  sudo certbot reconfigure --cert-name staging.oojashop.ir --webroot --webroot-path /var/www/certbot
  # certbot older than 2.3 has no "reconfigure"; re-issue instead:
  # sudo certbot certonly --webroot -w /var/www/certbot --cert-name staging.oojashop.ir -d staging.oojashop.ir --force-renewal
  ```

  Then issue the production certificate, install the hook and run `certbot renew --dry-run` as in 5.5.
- Then follow 5.6 → 5.10 unchanged.

**6.8 Optional: put the old test data on staging** (only if the owner asked in 6.2). It contains real test logins, so it stays on staging:

```sh
cd /opt/lumiere-staging
sh deploy/restore.sh staging ~/pre-migration/test-db.dump --promote
sh deploy/dc.sh staging run --rm --no-deps -T app sh -c 'find /media -mindepth 1 -delete && tar xzf - -C /media' < ~/pre-migration/test-media.tgz
```

**6.9 Clean up** once both sites work: `rm -rf ~/pre-migration`. It contains test data and the old `.env`.

## 7. Releasing a new version

Always staging first, then the same commit to production.

```sh
cd /opt/lumiere-staging && sh deploy/release.sh staging            # default: origin/main
#   check staging in the browser (§13)
cd /opt/lumiere && sh deploy/release.sh prod <commit>               # the SHA staging printed; type "production"
```

`release.sh <env> [<commit>] [--yes] [--skip-smoke]` does the following:

1. Refuses if tracked files in the checkout have local changes.
2. Fetches, then resolves the commit.
3. Requires an `https://` `SITE_URL`, and warns if production still uses `mock` payments.
4. Prints the target and asks for confirmation.
5. Checks out the commit and builds `lumiere-app:<env>-<sha>`.
6. Records the running and previous tag in `.env.release`.
7. Recreates only the app. Migrations run on start. nginx keeps serving cached pages during the few seconds of restart.
8. Waits for `migrations applied`, then smoke-tests the 19 pages through the edge. If the smoke test fails, it prints the exact rollback command.
9. Flushes the page cache and keeps the newest 5 images per environment.

Notes:
- **Edge config changes** reach the server with production releases, because the edge runs from `/opt/lumiere/deploy/edge`. Apply them with:

  ```sh
  cd /opt/lumiere/deploy/edge && docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
  ```

  If a site file under `deploy/edge/sites/` changed, run `sh deploy/edge/site.sh enable <env>` again instead; it copies the file and reloads.
- If a release adds glossary ingredients, rerun the seed command (5.8). It fills only empty fields and never overwrites the owner's edits.
- Releases never touch the other environment.

## 8. Rollback

```sh
sh deploy/rollback.sh prod                        # back to PREVIOUS_APP_IMAGE from .env.release
sh deploy/rollback.sh prod lumiere-app:prod-<sha> # or any kept image of that environment
docker images lumiere-app                         # the kept tags
```

The script refuses images of the other environment and images that no longer exist. It recreates the app, waits, smoke-tests and flushes the cache.

**Database migrations are not rolled back.** They are additive, so the previous version runs on the newer schema. If a release ever needs a destructive migration, take a backup right before it (§10).

## 9. Refreshing staging from production

```sh
cd /opt/lumiere-staging && sh deploy/refresh-staging.sh
```

The script does the following:

1. Dumps production's database and photos. This only reads production.
2. Stops staging's app.
3. Replaces staging's database with the dump.
4. Runs `deploy/anonymize.sql`. Every user, order, address, consultation, support message, subscriber and unapproved review is replaced with fake data. Sessions, OTP codes and rate limits are deleted. Users whose phone is in **staging's** `ADMIN_PHONES` keep their data, so the admins can still log in.
5. Copies the photos and starts staging.

Safety:
- If the anonymization fails, the whole thing rolls back and staging's app **stays stopped**, so no personal data is ever served. The script ends with a check that raises an error if any real-looking phone number is left.
- It refuses to run when staging's project or directory resolves to production's. The temporary dump lives in a private temp folder that is deleted on exit.
- It never writes to production. It is safe to run any time, but staging's own test data is replaced.

## 10. Backups

```sh
sh deploy/backup.sh prod          # nightly via cron (5.10); also before risky changes
sh deploy/backup.sh staging       # rarely needed
```

Each run writes into `<env dir>/backups/` (`chmod 700`):
- `lumiere-<date>.dump`: `pg_dump` custom format, verified with `pg_restore --list` before it is kept.
- `media-<date>.tgz`: the product photos.

The newest 14 of each are kept.

**Off-server copy:** set `BACKUP_RCLONE_REMOTE` in production's `.env` (for example `remote:bucket/lumiere`), and configure rclone for the user that runs cron (`rclone config`). Each run then copies the new files there. Until it is set, the script prints `off-server copy: NOT CONFIGURED`. A disk failure would then lose everything, so **ASK** the owner for a destination at a different provider.

Watch `/opt/lumiere/backups/cron.log`; each successful run ends with `backup ok`.

## 11. Restore

Always into a scratch database first:

```sh
cd /opt/lumiere
sh deploy/restore.sh prod backups/lumiere-<date>.dump
#   restores into database "lumiere_restore"; the live database is untouched; prints row counts
sh deploy/dc.sh prod exec db psql -U lumiere -d lumiere_restore     # look around if needed
```

To make it live:

```sh
sh deploy/restore.sh prod backups/lumiere-<date>.dump --promote   # type "production"
```

`--promote` repeats the scratch restore, then:

1. Stops the app and swaps the databases in one transaction. The live database is renamed to `lumiere_before_restore_<time>` and **kept**; `lumiere_restore` becomes `lumiere`.
2. Starts the app, smoke-tests and flushes the cache.

If the swap fails, the app is restarted on the unchanged database. Once you are sure, drop the old copy with the command the script prints.

Photos, when needed:

```sh
sh deploy/dc.sh prod run --rm --no-deps -T app sh -c 'find /media -mindepth 1 -delete && tar xzf - -C /media' < backups/media-<date>.tgz
```

Test a scratch restore every few months. It never touches the live site.

## 12. Launch: opening production to the public

Only when the owner says so, after the hand-over list (§14) is done:

1. In `/opt/lumiere/.env`, set `PAYMENT_PROVIDER=zarinpal`, `ZARINPAL_SANDBOX=false`, `ZARINPAL_MERCHANT_ID`, `SMS_PROVIDER=kavenegar` and the Kavenegar values.
2. Apply them with `sh deploy/release.sh prod <current commit>`. This rebuilds and restarts with the new environment.
3. Test one real payment with a small amount, and an OTP login.
4. Remove the lock: `sh deploy/edge/prod-auth.sh off`. Type `launch`; the script shows the anonymous status (200).
5. Delete `/opt/lumiere/.smoke-auth`.
6. Submit `https://oojashop.ir/sitemap.xml` to Google Search Console, and `https://oojashop.ir/feeds/products.json` to Torob and Emalls.

To lock production again (maintenance, emergency): `sh deploy/edge/prod-auth.sh on`. `prod-auth.sh status` shows the current state.

## 13. Verify

After a release, beyond the automatic smoke test:

```sh
H="--resolve oojashop.ir:443:127.0.0.1"; A="-u <user>:<password>"   # drop $A after launch
curl -sI $H $A https://oojashop.ir/ | grep -iE 'strict-transport|x-cache'    # HSTS; MISS then HIT within 60 s
curl -sI $H $A https://oojashop.ir/cart | grep -i cache-control             # "private, no-store"
curl -sI http://oojashop.ir/ | grep -i location                              # https://oojashop.ir/
curl -sI https://www.oojashop.ir/ | grep -i location                         # https://oojashop.ir/
curl -sI https://staging.oojashop.ir/ | head -1                              # 401
curl -s  https://staging.oojashop.ir/robots.txt                              # Disallow: /
sh deploy/dc.sh prod exec app node -e "console.log(new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'long'}).format(new Date()))"
sh deploy/dc.sh prod exec app sh -c 'touch /media/.w && rm /media/.w && echo media writable'
docker ps --format '{{.Names}}\t{{.Ports}}'      # only lumiere-edge-nginx-1 publishes ports
```

Smoke pages (all 200): `/ /shop /shop/serums /concern/acne /p/niacinamide-10-zinc-1 /quiz /ingredients /ingredients/retinal /consultation /help /about /terms /privacy /returns /cart /login /sitemap.xml /robots.txt /feeds/products.json`

Browser checks (staging after each release; production before launch):

1. The home page renders right-to-left in the Vazirmatn font.
2. Adding to the cart opens the drawer and updates the header count.
3. Log in at `/login` with an `ADMIN_PHONES` number. On staging, the code is in `sh deploy/dc.sh staging logs app`. You should land on `/admin`.
4. Admin › Products: upload a photo and save. It shows on the product page.
5. Place an order. On staging with the mock gateway, click «پرداخت موفق» → `/checkout/done/LM-xxxxxx`.
6. Book a consultation, and send a `/help` message. Both appear in the admin.

## 14. Hand-over: what the owner must do

List these in your report:
- **Admin › Settings › Legal pages:** terms, privacy and returns are drafts until saved. eNamad reviews the terms page.
- **Admin › Settings › Contact:** phone, email, Telegram, hours, social links, founding year.
- **Admin › Products:** real photos, prices, stock, IRC codes, INCI lists. **Admin › Ingredient glossary:** write the articles.
- **Footer trust badges:** replace the `[نماد اعتماد]` / `[مجوز غذا و دارو]` placeholders in `src/components/Footer.astro` with the eNamad and Samandehi embed codes, then release.
- Provide the Zarinpal merchant ID, the Kavenegar key, template and sender, and the off-server backup destination.
- Hold the staging and pre-launch logins, and decide the launch date (§12).

## 15. Security checklist

- [ ] Each `.env`, `.smoke-auth`: `chmod 600`; never committed or copied off the server. `backups/` is `chmod 700`.
- [ ] Production and staging have **different** `POSTGRES_PASSWORD`s and separate volumes (`docker volume ls | grep lumiere`).
- [ ] Firewall allows only 22, 80, 443 (`ufw allow 22,80,443/tcp && ufw enable`). Docker bypasses ufw for published ports, so also confirm only the edge publishes any: `docker ps --format '{{.Names}} {{.Ports}}'`.
- [ ] The `edge` network has subnet `172.31.250.0/24`: `docker network inspect edge | grep Subnet`.
- [ ] SSH: key login only, password login disabled.
- [ ] HTTP redirects to HTTPS; HSTS is present; an unknown Host or the bare IP gets no site (444 on HTTP, handshake refused on HTTPS).
- [ ] Staging answers 401 without a login and sends `X-Robots-Tag: noindex`. It runs `mock` payments and `console` SMS: `sh deploy/dc.sh staging exec app printenv PAYMENT_PROVIDER SMS_PROVIDER`.
- [ ] Production stays locked (`prod-auth.sh status`) until launch. After launch, `PAYMENT_PROVIDER` is not `mock`.
- [ ] `certbot renew --dry-run` succeeds and the deploy hook is installed.
- [ ] Nightly backup runs (`cron.log` ends with `backup ok`). The off-server copy is configured, and a scratch restore has been tested.
- [ ] Nobody ran `down -v`, `volume rm` or `seed --reset` on production. Staging gets production data only through `refresh-staging.sh`, which anonymizes it.

## 16. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Image pull fails (403 / timeout) | Docker Hub is blocked. Set `REGISTRY` in all three `.env` files, or set up the daemon mirror (§3). |
| Build fails at `npm ci` | npm is blocked or slow. Use a mirror or build outside Iran (§3). |
| `release.sh`: "uncommitted changes" | Someone edited tracked files on the server. Save them (`git diff > ~/x.diff`), then `git checkout -- .`. Changes belong in git, not on the server. |
| `site.sh enable`: "no certificate" | Issue it first (5.5). Check DNS and that the edge answers on port 80. |
| Certbot fails | Run `curl http://<domain>/.well-known/acme-challenge/x` from outside; it must reach the edge (404 is fine, a timeout is not). Check DNS, the firewall, and that the edge is up. |
| Edge returns 502 for one site | That stack is down: `sh deploy/dc.sh <env> ps` and `logs app`. The edge keeps serving the other site. |
| A catalog page 404s right after seeding | Restart the app (5.8): `sh deploy/dc.sh <env> restart app`. |
| Admin or account forms fail with 403 | `SITE_URL` in the image does not match the public host. Fix `.env` and release again (the value is baked in at build time). |
| Login is "lost" immediately; the cart is always empty | The site is reached over plain HTTP somewhere. Use the `https://` URL; the edge redirects. |
| Everyone hits the rate limit together | The inner nginx does not see the real IP. Check `docker network inspect edge` for subnet `172.31.250.0/24`. The edge must be the one proxying. |
| Smoke test shows 401 everywhere | The site is behind basic auth. Create `<env dir>/.smoke-auth`. |
| Photo upload fails with EACCES | The media volume is root-owned. Fix once: `sh deploy/dc.sh <env> run --rm --no-deps -u root app chown -R node:node /media`. |
| `app` restarts in a loop | `sh deploy/dc.sh <env> logs app`. Usually `POSTGRES_PASSWORD` was changed after the volume was created; the password is fixed at first start. Put the old one back. |
| Staging is short of memory | Raise `STAGING_*_MEM` in staging's `.env` (§4), then `sh deploy/dc.sh staging up -d`. |
| Old prices or texts still show | The app and nginx each cache for 60 s. Wait, or flush with `sh deploy/dc.sh <env> exec nginx sh -c 'rm -rf /var/cache/nginx/pages/*'`. |
| No SMS on production | `SMS_PROVIDER` is still `console`, or the Kavenegar key, template or sender is wrong. Look for `[sms]` lines in `logs app`. (On staging, no SMS is correct.) |

## 17. Script reference

All scripts run with `sh`, from any directory. Environment directories default to `/opt/lumiere` and `/opt/lumiere-staging`; override them with `LUMIERE_PROD_DIR` / `LUMIERE_STAGING_DIR`.

| Command | What it does | Asks? |
|---|---|---|
| `deploy/dc.sh <env> <compose args>` | `docker compose` with the right project, files and env files | No |
| `deploy/release.sh <env> [<commit>] [--yes] [--skip-smoke]` | Build, start, migrate, smoke-test, flush | Yes |
| `deploy/rollback.sh <env> [<tag>] [--yes]` | Start a previous image of the environment | Yes |
| `deploy/smoke.sh <env>` | The 19-page check through the edge | No |
| `deploy/backup.sh <env>` | Database dump + photos, keep 14, optional rclone | No (read-only) |
| `deploy/restore.sh <env> <dump> [--promote] [--yes]` | Scratch restore; `--promote` swaps it in | Only with `--promote` |
| `deploy/refresh-staging.sh [--yes]` | Production → staging, anonymized | Yes |
| `deploy/edge/htpasswd.sh <env> <user>` | Add or change a basic-auth login | Password prompt |
| `deploy/edge/site.sh enable\|disable <env>` | Turn an environment's HTTPS site on or off | No |
| `deploy/edge/prod-auth.sh on\|off\|status` | Pre-launch lock; `off` is the launch | `off` asks for `launch` |
| `deploy/edge/certbot-deploy-hook.sh` | Reloads the edge after renewal (installed into certbot) | No |

When done, report to the owner:
- both URLs;
- the production lock state;
- the payment and SMS modes;
- where backups go;
- the §14 list;
- anything you could not complete.
