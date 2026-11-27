import { sql } from 'drizzle-orm';
import {
  pgTable, serial, integer, bigint, text, varchar, boolean, timestamp, real, primaryKey, index, uniqueIndex, pgEnum, jsonb,
} from 'drizzle-orm/pg-core';

export type ProductDetails = {
  kicker?: string; // "سرم · شفاف‌کننده و تنظیم‌کننده‌ی چربی"
  skinTags?: string[];
  specs?: { label: string; value: string }[]; // pH, texture, fragrance, vegan
  whatFor?: string[]; // paragraphs
  steps?: string[];
  tips?: string;
  compatGood?: string;
  compatAvoid?: string;
  faqs?: { q: string; a: string }[];
  clinical?: { weeks?: string; stats: { pct: string; label: string }[] };
  sizeNote?: string; // shown when the larger size is selected
};

// All money is stored in toman as an integer. Convert to rial (x10) only at the payment gateway.
const money = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('role', ['customer', 'admin']);
export const orderStatusEnum = pgEnum('order_status', [
  'awaiting_payment', 'pending', 'ready', 'shipped', 'delivered', 'canceled', 'returned',
]);
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid', 'failed', 'refunded', 'cod']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 11 }).notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email'),
  role: roleEnum('role').notNull().default('customer'),
  credit: money('credit').notNull().default(0),
  points: integer('points').notNull().default(0),
  skinType: text('skin_type'),
  goal: text('goal'), // main skin concern from the quiz/routine builder; with skinType it defines "my routine"
  quiz: jsonb('quiz'), // last skin-quiz answers (QuizAnswers); when present they define "my routine"
  quizAt: timestamp('quiz_at', { withTimezone: true }),
  birthDate: text('birth_date'),
  smsOptIn: boolean('sms_opt_in').notNull().default(true), // marketing SMS; order-status SMS are always sent
  refillReminders: boolean('refill_reminders').notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const otpCodes = pgTable('otp_codes', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 11 }).notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('otp_phone_idx').on(t.phone)]);

// Generic fixed-window rate limiter (OTP sends, login attempts, form posts).
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'), // e.g. "خانه", "محل کار"
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  province: text('province').notNull(),
  city: text('city').notNull(),
  address: text('address').notNull(),
  postal: varchar('postal', { length: 10 }).notNull(),
  landline: text('landline'),
  isDefault: boolean('is_default').notNull().default(false),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  role: text('role'), // step name in a routine, e.g. "پاکسازی"
  sort: integer('sort').notNull().default(0),
});

export const concerns = pgTable('concerns', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  sub: text('sub'),
  intro: text('intro'), // SEO landing copy for /concern/[slug]
  sort: integer('sort').notNull().default(0),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameFa: text('name_fa').notNull(),
  tagline: text('tagline'),
  blurb: text('blurb'),
  description: text('description'),
  howToUse: text('how_to_use'),
  inci: text('inci'), // full ingredient list
  categoryId: integer('category_id').notNull().references(() => categories.id),
  shape: text('shape').notNull().default('dropper'), // dropper | tube | jar | stick (CSS fallback art)
  glass: text('glass').notNull().default('#FFFFFF'),
  image: text('image'), // base path of uploaded image variants, e.g. /media/p/12/abc
  badge: text('badge'), // best | trend | team | new
  rating: real('rating').notNull().default(0),
  reviewsCount: integer('reviews_count').notNull().default(0),
  ircCode: text('irc_code'), // Iran FDA health registration code
  skinTypes: text('skin_types').array().notNull().default([]), // dry | oily | combination | sensitive | normal
  salesScore: integer('sales_score').notNull().default(0), // bumped on each paid order; drives "bestselling" sort
  details: jsonb('details').$type<ProductDetails>().notNull().default({}),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('products_category_idx').on(t.categoryId)]);

export const variants = pgTable('variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  price: money('price').notNull(),
  compareAt: money('compare_at'),
  stock: integer('stock').notNull().default(0),
  sku: text('sku'),
  sort: integer('sort').notNull().default(0),
}, (t) => [index('variants_product_idx').on(t.productId)]);

export const productConcerns = pgTable('product_concerns', {
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  concernId: integer('concern_id').notNull().references(() => concerns.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.productId, t.concernId] })]);

export const ingredients = pgTable('ingredients', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameFa: text('name_fa').notNull(),
  does: text('does').notNull(),
  pct: text('pct'),
  body: text('body'), // long-form article for the SEO page; paragraphs separated by blank lines
  goodFor: text('good_for'), // "مناسب برای"
  avoidWith: text('avoid_with'),
  sym: text('sym'), // two-letter tile symbol, e.g. "Ni"
  functions: text('functions').array().notNull().default([]), // hydrate | repair | acne | bright | renew | protect
  whenToUse: text('when_to_use'),
  pregnancy: text('pregnancy'),
  sort: integer('sort').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const productIngredients = pgTable('product_ingredients', {
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  ingredientId: integer('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.productId, t.ingredientId] })]);

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  skin: text('skin'),
  rating: integer('rating').notNull(),
  body: text('body').notNull(),
  verified: boolean('verified').notNull().default(false),
  approved: boolean('approved').notNull().default(false),
  rejected: boolean('rejected').notNull().default(false), // pending = neither approved nor rejected
  reply: text('reply'), // public reply from the store, shown under the review
  createdAt: createdAt(),
}, (t) => [index('reviews_product_idx').on(t.productId)]);

export const carts = pgTable('carts', {
  id: text('id').primaryKey(), // random token stored in a cookie
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  phone: varchar('phone', { length: 11 }), // captured at checkout, for abandoned-cart SMS
  reminded: boolean('reminded').notNull().default(false),
  discountCode: text('discount_code'),
  samples: text('samples').array().notNull().default([]), // product slugs chosen as free samples
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  cartId: text('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').notNull().references(() => variants.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull(),
}, (t) => [primaryKey({ columns: [t.cartId, t.variantId] })]);

export const discountCodes = pgTable('discount_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  percent: integer('percent'),
  amount: money('amount'),
  minSubtotal: money('min_subtotal').notNull().default(0),
  maxUses: integer('max_uses'),
  used: integer('used').notNull().default(0),
  source: text('source'), // e.g. influencer name, for attribution
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // public order number, e.g. LM-104523
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  phone: varchar('phone', { length: 11 }).notNull(),
  email: text('email'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  province: text('province').notNull(),
  city: text('city').notNull(),
  address: text('address').notNull(),
  postal: varchar('postal', { length: 10 }).notNull(),
  landline: text('landline'),
  shipMethod: text('ship_method').notNull(),
  shipCost: money('ship_cost').notNull(),
  payMethod: text('pay_method').notNull(),
  subtotal: money('subtotal').notNull(),
  discount: money('discount').notNull().default(0),
  creditUsed: money('credit_used').notNull().default(0),
  total: money('total').notNull(),
  discountCode: text('discount_code'),
  samples: text('samples').array().notNull().default([]),
  status: orderStatusEnum('status').notNull().default('awaiting_payment'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
  gatewayAuthority: text('gateway_authority'),
  gatewayRef: text('gateway_ref'),
  trackingCode: text('tracking_code'),
  internalNote: text('internal_note'),
  utm: jsonb('utm'), // marketing attribution captured at checkout
  refillReminded: boolean('refill_reminded').notNull().default(false),
  createdAt: createdAt(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (t) => [
  index('orders_user_idx').on(t.userId),
  index('orders_status_idx').on(t.status),
  uniqueIndex('orders_authority_idx').on(t.gatewayAuthority),
]);

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => variants.id, { onDelete: 'set null' }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  nameEn: text('name_en').notNull(),
  nameFa: text('name_fa').notNull(),
  label: text('label').notNull(),
  price: money('price').notNull(),
  qty: integer('qty').notNull(),
});

export const consultations = pgTable('consultations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: varchar('phone', { length: 11 }).notNull(),
  kind: text('kind').notNull(), // video | chat | phone
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  topic: text('topic'),
  note: text('note'), // products the customer currently uses
  status: text('status').notNull().default('booked'), // booked | done | noshow | canceled
  expert: text('expert'),
  meetingLink: text('meeting_link'), // set by staff (e.g. a Skyroom room); texted to the customer
  reminded: boolean('reminded').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  // One live booking per slot; canceled bookings free the slot again.
  uniqueIndex('consult_slot_idx').on(t.startsAt).where(sql`status <> 'canceled'`),
  index('consult_user_idx').on(t.userId),
]);

export const subscribers = pgTable('subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: createdAt(),
});

export const wishlist = pgTable('wishlist', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.productId] })]);

// Admin-editable store settings (shipping prices, payment toggles, promo bar...). One row per key.
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Audit trail of order status changes, shown in the admin order drawer.
export const orderEvents = pgTable('order_events', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  note: text('note'),
  byUserId: integer('by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('order_events_order_idx').on(t.orderId)]);

// Every change to a customer's points balance (earned on orders, spent on credit), so the balance is auditable.
export const pointsLedger = pgTable('points_ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(), // order | redeem | adjust
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('points_user_idx').on(t.userId)]);

// "Tell me when it's back" requests; cleared after the SMS is sent.
export const stockAlerts = pgTable('stock_alerts', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.productId] })]);

// Contact-form tickets from the help center; staff reply by SMS from the admin.
export const supportMessages = pgTable('support_messages', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: varchar('phone', { length: 11 }).notNull(),
  topic: text('topic').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('open'), // open | answered | closed
  reply: text('reply'),
  createdAt: createdAt(),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
}, (t) => [index('support_status_idx').on(t.status)]);
