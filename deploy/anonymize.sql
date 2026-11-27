-- Anonymizes a copy of the production database for staging. Run ONLY by deploy/refresh-staging.sh, against
-- staging's database, with:  psql -v admin_phones='09xxxxxxxxx,09yyyyyyyyy' -f anonymize.sql
--
-- Covers every personal-data column in src/db/schema.ts (checked table by table):
--   users            phone, first_name, last_name, email, birth_date, skin_type, goal, quiz, quiz_at
--   addresses        title, first_name, last_name, address, postal, landline   (province/city kept: not identifying)
--   orders           phone, email, first_name, last_name, address, postal, landline, internal_note,
--                    tracking_code (post tracking reveals the recipient), gateway_authority, gateway_ref
--   order_events     note (return reasons, free text)
--   consultations    name, phone, note, meeting_link
--   support_messages name, phone, body, reply
--   subscribers      email
--   carts            phone
--   reviews          name, body of NOT approved reviews (approved ones are already public on the site)
--   sessions, otp_codes, rate_limits: deleted (login tokens, phone numbers, IP addresses)
-- Users whose phone is in ADMIN_PHONES keep their own data so the team can log in to staging.
-- Not personal, kept as is: catalog, prices, stock, settings, discount codes, order amounts/items, points.
--
-- Fake phones look like 09000NNNNNN / 09001NNNNNN. Staging always runs SMS_PROVIDER=console, so no text
-- is ever sent to them.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE keep_phones (phone varchar(11) PRIMARY KEY);
INSERT INTO keep_phones
  SELECT DISTINCT trim(p) FROM unnest(string_to_array(:'admin_phones', ',')) AS p
  WHERE trim(p) ~ '^09[0-9]{9}$';

-- Login tokens, one-time codes and rate-limit keys (phones, IPs).
DELETE FROM sessions;
DELETE FROM otp_codes;
DELETE FROM rate_limits;

-- Users. Two passes: phone is UNIQUE, and a fake number could equal a not-yet-updated real one.
UPDATE users SET phone = 'x' || id WHERE phone NOT IN (SELECT phone FROM keep_phones);
UPDATE users SET
  phone      = '09000' || lpad((id % 1000000)::text, 6, '0'),
  first_name = 'مشتری',
  last_name  = 'آزمایشی ' || id,
  email      = CASE WHEN email IS NULL THEN NULL ELSE 'user' || id || '@example.invalid' END,
  birth_date = NULL,
  skin_type  = NULL,
  goal       = NULL,
  quiz       = NULL,
  quiz_at    = NULL
WHERE phone LIKE 'x%';

UPDATE addresses a SET
  title      = NULL,
  first_name = 'مشتری',
  last_name  = 'آزمایشی',
  address    = 'نشانی آزمایشی شماره‌ی ' || a.id,
  postal     = '0000000000',
  landline   = NULL
FROM users u
WHERE u.id = a.user_id AND u.phone NOT IN (SELECT phone FROM keep_phones);

-- Orders keep amounts and items. Orders linked to an account get that account's new phone, so
-- "my orders" still works on staging; guest orders get a fake one.
UPDATE orders o SET
  phone = coalesce((SELECT u.phone FROM users u WHERE u.id = o.user_id), '09001' || lpad((o.id % 1000000)::text, 6, '0')),
  email = CASE WHEN o.email IS NULL THEN NULL ELSE 'order' || o.id || '@example.invalid' END,
  first_name = 'مشتری',
  last_name  = 'آزمایشی',
  address    = 'نشانی آزمایشی شماره‌ی ' || o.id,
  postal     = '0000000000',
  landline   = NULL,
  internal_note = NULL,
  tracking_code = NULL,
  gateway_authority = NULL,
  gateway_ref = CASE WHEN o.gateway_ref IS NULL THEN NULL ELSE 'ANON' END
WHERE o.phone NOT IN (SELECT phone FROM keep_phones);

UPDATE order_events SET note = NULL WHERE note IS NOT NULL;

UPDATE consultations c SET
  name  = 'مشتری آزمایشی',
  phone = coalesce((SELECT u.phone FROM users u WHERE u.id = c.user_id), '09001' || lpad((c.id % 1000000)::text, 6, '0')),
  note  = NULL,
  meeting_link = NULL
WHERE c.phone NOT IN (SELECT phone FROM keep_phones);

UPDATE support_messages m SET
  name  = 'مشتری آزمایشی',
  phone = coalesce((SELECT u.phone FROM users u WHERE u.id = m.user_id), '09001' || lpad((m.id % 1000000)::text, 6, '0')),
  body  = 'پیام آزمایشی شماره‌ی ' || m.id,
  reply = CASE WHEN m.reply IS NULL THEN NULL ELSE 'پاسخ آزمایشی' END
WHERE m.phone NOT IN (SELECT phone FROM keep_phones);

UPDATE subscribers SET email = 'subscriber' || id || '@example.invalid';

UPDATE carts SET phone = NULL WHERE phone IS NOT NULL;

UPDATE reviews SET name = 'کاربر', body = 'متن آزمایشی نظر.' WHERE NOT approved;

-- Refuse to finish if anything personal survived.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM users WHERE phone NOT IN (SELECT phone FROM keep_phones) AND phone !~ '^09000[0-9]{6}$';
  IF n > 0 THEN RAISE EXCEPTION 'anonymization incomplete: % users still have a real-looking phone', n; END IF;
  SELECT count(*) INTO n FROM orders WHERE phone NOT IN (SELECT phone FROM keep_phones) AND phone !~ '^0900[01][0-9]{6}$';
  IF n > 0 THEN RAISE EXCEPTION 'anonymization incomplete: % orders', n; END IF;
  SELECT count(*) INTO n FROM consultations WHERE phone NOT IN (SELECT phone FROM keep_phones) AND phone !~ '^0900[01][0-9]{6}$';
  IF n > 0 THEN RAISE EXCEPTION 'anonymization incomplete: % consultations', n; END IF;
  SELECT count(*) INTO n FROM support_messages WHERE phone NOT IN (SELECT phone FROM keep_phones) AND phone !~ '^0900[01][0-9]{6}$';
  IF n > 0 THEN RAISE EXCEPTION 'anonymization incomplete: % support messages', n; END IF;
  SELECT count(*) INTO n FROM sessions;
  IF n > 0 THEN RAISE EXCEPTION 'sessions not cleared'; END IF;
END $$;

COMMIT;

SELECT 'kept (ADMIN_PHONES)' AS users, count(*) FROM users WHERE phone IN (SELECT phone FROM keep_phones)
UNION ALL SELECT 'anonymized', count(*) FROM users WHERE phone NOT IN (SELECT phone FROM keep_phones);
