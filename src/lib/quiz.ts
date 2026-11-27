// Skin quiz: questions and the rules that turn answers into a routine.
// Pure module (no DB): used by the quiz island in the browser and by the account page on the server.

export type QuizAnswers = {
  skin: 'dry' | 'oily' | 'combination' | 'normal';
  concern: string[]; // 1–2 of: acne, tone, aging, dryness, redness
  sens: 'rare' | 'some' | 'often';
  climate: 'dry' | 'humid' | 'mixed';
  exp: 'new' | 'some' | 'pro';
};
export type RoutineMode = 'full' | 'ess';

export const QUESTIONS = [
  { key: 'skin', title: 'چند ساعت بعد از شستن صورت، پوستتان چه حسی دارد؟', hint: 'بدون زدن هیچ محصولی.', multi: false, options: [
    ['dry', 'کشیده و خشک', 'گاهی پوسته‌پوسته'], ['oily', 'براق در کل صورت', 'منافذ واضح'], ['combination', 'براق در پیشانی و بینی، معمولی در گونه‌ها', ''], ['normal', 'راحت و متعادل', 'نه خشک، نه چرب']] },
  { key: 'concern', title: 'مهم‌ترین نگرانی‌های پوست شما چیست؟', hint: 'حداکثر دو مورد انتخاب کنید.', multi: true, max: 2, options: [
    ['acne', 'آکنه و منافذ', 'جوش، جوش سرسیاه'], ['tone', 'لک و ناهمرنگی', 'لک‌های بعد از جوش، تیرگی'], ['aging', 'خطوط ریز و سفتی', ''], ['dryness', 'کم‌آبی', 'حس کشیدگی، پوست کدر'], ['redness', 'قرمزی', 'التهاب سطحی']] },
  { key: 'sens', title: 'پوستتان چقدر به محصولات جدید واکنش نشان می‌دهد؟', hint: 'سوزش، خارش یا قرمزی.', multi: false, options: [
    ['rare', 'تقریباً هیچ‌وقت', ''], ['some', 'گاهی', 'با بعضی محصولات'], ['often', 'اغلب', 'پوست من حساس است']] },
  { key: 'climate', title: 'بیشتر وقت‌تان در چه آب‌وهوایی می‌گذرد؟', hint: 'روی انتخاب بافت محصولات اثر دارد.', multi: false, options: [
    ['dry', 'خشک', 'مثل تهران، اصفهان، یزد'], ['humid', 'مرطوب', 'مثل رشت، بندرعباس'], ['mixed', 'متغیر', '']] },
  { key: 'exp', title: 'تجربه‌ی شما با ترکیبات فعال چقدر است؟', hint: 'مثل رتینوئیدها یا اسیدها.', multi: false, options: [
    ['new', 'تازه‌کارم', 'روتین ساده می‌خواهم'], ['some', 'کمی استفاده کرده‌ام', ''], ['pro', 'با رتینوئید و اسیدها آشنا هستم', '']] },
] as const;

export const LABELS: Record<string, string> = {
  dry: 'خشک', oily: 'چرب', combination: 'مختلط', normal: 'نرمال',
  acne: 'آکنه', tone: 'لک', aging: 'خطوط ریز', dryness: 'کم‌آبی', redness: 'قرمزی',
};

// Step names shown next to each product in the routine.
export const STEP_ROLE: Record<string, string> = {
  'ceramide-oat-cleanser': 'پاکسازی', 'salicylic-acid-2-gel-cleanser': 'پاکسازی',
  'niacinamide-10-zinc-1': 'سرم', 'hyaluronic-acid-2-b5': 'سرم آبرسان', 'vitamin-c-15-ferulic': 'سرم آنتی‌اکسیدان',
  'retinal-0-1-emulsion': 'سرم شب', 'azelaic-acid-10-suspension': 'سرم شب',
  'ceramide-barrier-cream-5': 'مرطوب‌سازی', 'copper-peptides-1-cream': 'مرطوب‌سازی',
  'mineral-uv-filters-spf-40': 'ضدآفتاب', 'niacinamide-spf-50-fluid': 'ضدآفتاب',
};

const CONCERNS = new Set(['acne', 'tone', 'aging', 'dryness', 'redness']);

/** Validates untrusted answers (from the browser or the database). Returns null if incomplete. */
export function parseAnswers(x: unknown): QuizAnswers | null {
  const a = x as Partial<QuizAnswers> | null;
  if (!a || typeof a !== 'object') return null;
  const concern = Array.isArray(a.concern) ? [...new Set(a.concern.filter((c) => CONCERNS.has(c)))].slice(0, 2) : [];
  if (!['dry', 'oily', 'combination', 'normal'].includes(a.skin as string)) return null;
  if (!['rare', 'some', 'often'].includes(a.sens as string)) return null;
  if (!['dry', 'humid', 'mixed'].includes(a.climate as string)) return null;
  if (!['new', 'some', 'pro'].includes(a.exp as string)) return null;
  if (!concern.length) return null;
  return { skin: a.skin!, concern, sens: a.sens!, climate: a.climate!, exp: a.exp! };
}

/** Morning/evening product slugs for the answers. "ess" is the 3-step essentials routine. */
export function quizRoutine(a: QuizAnswers, mode: RoutineMode = 'full') {
  const c = a.concern;
  const sensitive = a.sens === 'often';
  const cleanser = (a.skin === 'oily' || a.skin === 'combination') && !sensitive ? 'salicylic-acid-2-gel-cleanser' : 'ceramide-oat-cleanser';
  const amSerum = c.includes('acne') ? 'niacinamide-10-zinc-1'
    : c.includes('tone') || c.includes('aging') ? (sensitive ? 'niacinamide-10-zinc-1' : 'vitamin-c-15-ferulic')
    : 'hyaluronic-acid-2-b5';
  let pmSerum: string;
  if (c.includes('aging') && !sensitive && a.exp !== 'new') pmSerum = 'retinal-0-1-emulsion';
  else if (c.includes('redness') || c.includes('tone')) pmSerum = 'azelaic-acid-10-suspension';
  else if (c.includes('acne')) pmSerum = sensitive ? 'azelaic-acid-10-suspension' : 'niacinamide-10-zinc-1';
  else pmSerum = 'hyaluronic-acid-2-b5';
  const moist = c.includes('aging') && !sensitive ? 'copper-peptides-1-cream' : 'ceramide-barrier-cream-5';
  const spf = sensitive || a.skin === 'dry' ? 'mineral-uv-filters-spf-40' : 'niacinamide-spf-50-fluid';

  if (mode === 'ess') return { am: [cleanser, moist, spf], pm: [cleanser, pmSerum] };
  const pm = [cleanser, pmSerum, moist];
  // Dry skin or a dry climate gets an extra hydrating layer at night.
  if ((a.skin === 'dry' || a.climate === 'dry' || c.includes('dryness')) && !pm.includes('hyaluronic-acid-2-b5')) pm.splice(2, 0, 'hyaluronic-acid-2-b5');
  return { am: [cleanser, amSerum, moist, spf], pm };
}

export function quizTips(a: QuizAnswers, pm: string[]) {
  const tips: string[] = [];
  if (pm.includes('retinal-0-1-emulsion')) tips.push('رتینال را هفته‌ای ۲ تا ۳ شب شروع کنید و در صورت تحمل، به‌تدریج افزایش دهید.');
  if (a.sens === 'often') tips.push('هر محصول جدید را ابتدا روی ناحیه‌ی کوچکی از پوست (پشت گوش) امتحان کنید.');
  tips.push('ترتیب لایه‌گذاری: از رقیق‌ترین بافت به غلیظ‌ترین. ضدآفتاب همیشه آخرین مرحله‌ی صبح است.');
  if (a.climate === 'dry') tips.push('در هوای خشک، سرم آبرسان را روی پوست کمی مرطوب بزنید.');
  return tips;
}

export const profileTitle = (a: QuizAnswers) => `پوست ${LABELS[a.skin]}${a.sens === 'often' ? ' و حساس' : ''}`;
export const profileTags = (a: QuizAnswers) => [
  ...a.concern.map((c) => LABELS[c]),
  a.climate === 'dry' ? 'آب‌وهوای خشک' : a.climate === 'humid' ? 'آب‌وهوای مرطوب' : 'آب‌وهوای متغیر',
];
