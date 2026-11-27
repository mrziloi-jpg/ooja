const FA = '۰۱۲۳۴۵۶۷۸۹';

export const fa = (s: string | number) => String(s).replace(/[0-9]/g, (d) => FA[Number(d)]);
export const toEn = (s: string) => String(s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
export const group = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
export const money = (n: number) => `${group(n)} تومان`;
export const rating = (r: number) => fa(r.toFixed(1).replace('.', '٫'));

/** Normalizes Persian/Arabic digits and +98 prefixes to 09xxxxxxxxx, or null if invalid. */
export function normalizePhone(input: string): string | null {
  let p = toEn(input).replace(/[\s-]/g, '');
  if (p.startsWith('+98')) p = '0' + p.slice(3);
  else if (p.startsWith('0098')) p = '0' + p.slice(4);
  else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
  else if (p.startsWith('9') && p.length === 10) p = '0' + p;
  return /^09\d{9}$/.test(p) ? p : null;
}

// Accepts strings too: Drizzle's postgres driver returns timestamps from raw `sql` queries as text.
export function jalaliDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', ...opts }).format(new Date(d));
}

export const BADGES: Record<string, [string, boolean]> = {
  best: ['پرفروش', true], trend: ['ترند', false], team: ['انتخاب تیم', false], new: ['جدید', true],
};

export const SKIN_TYPES: Record<string, string> = {
  dry: 'خشک', oily: 'چرب', combination: 'مختلط', sensitive: 'حساس', normal: 'نرمال',
};
