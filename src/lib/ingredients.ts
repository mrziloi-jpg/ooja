// Ingredient functions and pairwise compatibility. Pure module: used by pages and the compatibility island.

export const FUNCTIONS: [string, string][] = [
  ['hydrate', 'آبرسان'], ['repair', 'ترمیم‌کننده'], ['acne', 'ضدآکنه'], ['bright', 'روشن‌کننده'], ['renew', 'جوان‌ساز'], ['protect', 'محافظ'],
];
export const functionLabel = (fs: string[]) => fs.map((f) => FUNCTIONS.find((x) => x[0] === f)?.[1]).filter(Boolean).join('، ');

export type Rel = 'ok' | 'alt' | 'no' | 'same';

// Pairs not listed are compatible. Keys are ingredient slugs in alphabetical order.
const RULES: Record<string, Exclude<Rel, 'ok' | 'same'>> = {
  'retinal|vitc': 'alt',
  'niacinamide|vitc': 'alt',
  'retinal|salicylic': 'no',
  'salicylic|vitc': 'no',
  'azelaic|salicylic': 'no',
};

export function rel(a: string, b: string): Rel {
  if (a === b) return 'same';
  return RULES[[a, b].sort().join('|')] ?? 'ok';
}

export const VERDICT: Record<Rel, { title: string; text: string }> = {
  ok: { title: 'سازگارند', text: 'می‌توانید در یک روتین استفاده کنید. از رقیق‌ترین بافت شروع کنید.' },
  alt: { title: 'یکی صبح، دیگری شب', text: 'در یک مرحله استفاده نکنید؛ یکی را در روتین صبح و دیگری را در روتین شب بگذارید.' },
  no: { title: 'با احتیاط', text: 'هر دو می‌توانند تحریک‌کننده باشند. در شب‌های جداگانه استفاده کنید و واکنش پوست را زیر نظر بگیرید.' },
  same: { title: 'یک ترکیب است', text: 'دو ترکیب متفاوت انتخاب کنید.' },
};

/** Ingredients shown in the compatibility matrix (the actives where the rules matter). */
export const MATRIX = ['niacinamide', 'hyaluronic', 'retinal', 'vitc', 'azelaic', 'salicylic', 'ceramides'];
