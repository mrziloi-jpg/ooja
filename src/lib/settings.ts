import { sql as dsql } from 'drizzle-orm';
import { db, schema as s } from '~/db';
import { STORE } from './config';

// Admin-editable store settings. Defaults come from STORE in config.ts; saved values override them.
export type Settings = {
  shipPrices: Record<'post' | 'tipax' | 'courier', number>;
  freeShipFrom: number;
  payments: Record<'gateway' | 'cod' | 'credit', boolean>;
  lowStock: number;
  supportPhone: string;
  promos: string[];
  experts: string[]; // consultation staff names
  // Contact & company details shown on Help, About and the footer. Empty = hidden.
  supportEmail: string;
  supportTelegram: string; // @handle or link
  supportHours: string;
  instagram: string; // full URL
  telegramChannel: string; // full URL
  foundedYear: string;
  // Legal pages. Empty = the draft default from lib/legal.ts.
  terms: string;
  privacy: string;
  returns: string;
};

const DEFAULTS: Settings = {
  shipPrices: Object.fromEntries(STORE.shipping.map((x) => [x.id, x.price])) as Settings['shipPrices'],
  freeShipFrom: STORE.freeShipFrom,
  payments: { gateway: true, cod: true, credit: true },
  lowStock: 10,
  supportPhone: '',
  promos: STORE.promos,
  experts: ['کارشناس ۱', 'کارشناس ۲'],
  supportEmail: '',
  supportTelegram: '',
  supportHours: 'شنبه تا پنجشنبه، ۹ تا ۱۸',
  instagram: '',
  telegramChannel: '',
  foundedYear: '',
  terms: '',
  privacy: '',
  returns: '',
};

const TTL_MS = 60_000;
let cache: { at: number; data: Promise<Settings> } | null = null;

async function load(): Promise<Settings> {
  const rows = await db.select().from(s.settings);
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...saved } as Settings;
}

export function getSettings(): Promise<Settings> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const data = load();
    cache = { at: Date.now(), data };
    data.catch(() => { cache = null; });
  }
  return cache.data;
}

export async function saveSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    await db.insert(s.settings).values({ key, value })
      .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedAt: dsql`now()` } });
  }
  cache = null;
}

/** Shipping and payment options with current prices and toggles applied. */
export async function getStore() {
  const st = await getSettings();
  return {
    freeShipFrom: st.freeShipFrom,
    shipping: STORE.shipping.map((x) => ({ ...x, price: st.shipPrices[x.id as keyof Settings['shipPrices']] ?? x.price })),
    payments: STORE.payments.filter((p) => st.payments[p.id as keyof Settings['payments']] !== false),
    provinces: STORE.provinces,
    promos: st.promos.length ? st.promos : STORE.promos,
    pointsPerToman: STORE.pointsPerToman,
    lowStock: st.lowStock,
    supportPhone: st.supportPhone,
  };
}
