// Seeds the catalog with the products, concerns and glossary from the design.
// Run once on an empty database: npm run db:seed   (add --reset to wipe catalog tables first)
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as s from './schema';

const sql = postgres(process.env.DATABASE_URL || 'postgres://lumiere:lumiere@localhost:5432/lumiere', { max: 1 });
const db = drizzle(sql, { schema: s });

if (process.argv.includes('--reset')) {
  await sql`TRUNCATE products, categories, concerns, ingredients, reviews RESTART IDENTITY CASCADE`;
} else {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM products`;
  if (n > 0) {
    console.log('catalog already seeded; use --reset to reseed');
    await sql.end();
    process.exit(0);
  }
}

const CATEGORIES = [
  { slug: 'cleansers', name: 'شوینده‌ها', role: 'پاکسازی', sort: 1 },
  { slug: 'serums', name: 'سرم‌ها', role: 'سرم درمانی', sort: 2 },
  { slug: 'moisturizers', name: 'مرطوب‌کننده‌ها', role: 'مرطوب‌سازی', sort: 3 },
  { slug: 'spf', name: 'ضدآفتاب', role: 'محافظت از آفتاب', sort: 4 },
  { slug: 'makeup', name: 'آرایش پوست‌محور', role: 'آرایش', sort: 5 },
];

const CONCERNS = [
  { slug: 'aging', name: 'پیری پوست', sub: 'خطوط ریز، از دست رفتن سفتی' },
  { slug: 'acne', name: 'آکنه و منافذ', sub: 'جوش، جوش سرسیاه، منافذ باز' },
  { slug: 'tone', name: 'لک و ناهمرنگی', sub: 'تیرگی، لک‌های بعد از جوش' },
  { slug: 'redness', name: 'قرمزی', sub: 'حساسیت و التهاب سطحی' },
  { slug: 'dryness', name: 'خشکی', sub: 'کم‌آبی، حس کشیدگی' },
  { slug: 'barrier', name: 'سد پوستی آسیب‌دیده', sub: 'سوزش، پوسته‌پوسته شدن' },
  { slug: 'sensitive', name: 'پوست حساس', sub: 'فرمول‌های ملایم و کم‌تحریک' },
];

const INGREDIENTS = [
  { slug: 'niacinamide', nameEn: 'Niacinamide', nameFa: 'نیاسینامید', does: 'تنظیم چربی، کوچک‌تر نشان دادن منافذ و یکدست کردن رنگ پوست.', pct: '۱۰٪' },
  { slug: 'hyaluronic', nameEn: 'Hyaluronic Acid', nameFa: 'هیالورونیک اسید', does: 'جذب و نگه‌داشتن آب در لایه‌های مختلف پوست برای آبرسانی سبک.', pct: '۲٪' },
  { slug: 'retinal', nameEn: 'Retinal', nameFa: 'رتینال', does: 'شکل سریع‌الاثر ویتامین A برای بهبود بافت، خطوط ریز و جوش.', pct: '۰٫۱٪' },
  { slug: 'ceramides', nameEn: 'Ceramides', nameFa: 'سرامیدها', does: 'چربی‌های مشابه پوست که سد پوستی را ترمیم و رطوبت را حفظ می‌کنند.', pct: '۵٪' },
  { slug: 'vitc', nameEn: 'Vitamin C', nameFa: 'ویتامین C', does: 'آنتی‌اکسیدان قوی برای روشن‌تر شدن پوست و کاهش ظاهر لک.', pct: '۱۵٪' },
  { slug: 'azelaic', nameEn: 'Azelaic Acid', nameFa: 'آزلائیک اسید', does: 'کاهش قرمزی، لک‌های بعد از جوش و یکدست شدن بافت پوست.', pct: '۱۰٪' },
  { slug: 'salicylic', nameEn: 'Salicylic Acid', nameFa: 'سالیسیلیک اسید', does: 'لایه‌بردار محلول در چربی که منافذ را از داخل پاکسازی می‌کند.', pct: '۲٪' },
  { slug: 'peptides', nameEn: 'Peptides', nameFa: 'پپتیدها', does: 'زنجیره‌های کوتاه آمینواسید که به سفتی و صافی پوست کمک می‌کنند.', pct: '۱٪' },
  { slug: 'zinc', nameEn: 'Zinc Oxide', nameFa: 'زینک اکساید', does: 'فیلتر مینرال ضدآفتاب با محافظت گسترده و ملایم برای پوست حساس.', pct: null },
];

type P = {
  slug: string; cat: string; en: string; fa: string; tagline: string; blurb?: string; description?: string;
  sizes: [string, number][]; rating: number; reviews: number; sales: number; badge: string | null;
  shape: string; glass: string; concerns: string[]; skins: string[]; ing: string[]; details?: s.ProductDetails;
};

const NIACINAMIDE_DETAILS: s.ProductDetails = {
  kicker: 'سرم · شفاف‌کننده و تنظیم‌کننده‌ی چربی',
  skinTags: ['پوست چرب', 'مختلط', 'مستعد آکنه', 'لک بعد از جوش'],
  specs: [{ label: 'pH', value: '۵٫۵–۶٫۵' }, { label: 'بافت', value: 'ژل سبک' }, { label: 'عطر', value: 'ندارد' }, { label: 'وگان', value: 'بله' }],
  whatFor: [
    'نیاسینامید (ویتامین B3) یکی از پرمطالعه‌ترین ترکیبات مراقبت پوست است. در غلظت ۱۰٪ به کاهش ظاهر منافذ، جوش‌ها و ناهمرنگی کمک می‌کند. زینک PCA ۱٪ تولید چربی را متعادل می‌کند.',
    'مناسب پوست‌های چرب، مختلط و مستعد آکنه. پوست‌های حساس بهتر است ابتدا یک روز در میان استفاده کنند.',
  ],
  steps: ['صورت را با شوینده‌ی ملایم بشویید و خشک کنید.', 'چند قطره را صبح و/یا شب روی کل صورت پخش کنید.', 'پس از جذب، مرطوب‌کننده و در صبح ضدآفتاب بزنید.'],
  tips: 'اگر از سرم‌های آبی دیگر استفاده می‌کنید، ابتدا رقیق‌ترین بافت را بزنید. در صورت سوزش، دفعات مصرف را کم کنید. فقط برای استفاده‌ی خارجی.',
  compatGood: 'Hyaluronic Acid · Ceramides · Retinal · Azelaic Acid · SPF',
  compatAvoid: 'Vitamin C 15% — یکی را صبح و دیگری را شب استفاده کنید.',
  faqs: [
    { q: 'می‌توانم صبح و شب استفاده کنم؟', a: 'بله. نیاسینامید ملایم است و برای بیشتر پوست‌ها دو بار در روز مناسب است. پوست‌های حساس با یک بار در روز شروع کنند.' },
    { q: 'چه مدت طول می‌کشد تا نتیجه ببینم؟', a: 'بیشتر افراد پس از ۴ تا ۸ هفته استفاده‌ی منظم، تغییر در ظاهر منافذ و چربی پوست را می‌بینند.' },
    { q: 'در دوران بارداری قابل استفاده است؟', a: 'نیاسینامید معمولاً ترکیب کم‌خطری محسوب می‌شود، اما در دوران بارداری و شیردهی پیش از استفاده با پزشک خود مشورت کنید.' },
  ],
  sizeNote: '۱۲٪ صرفه‌جویی نسبت به دو بطری ۳۰ میلی‌لیتری',
};

const PRODUCTS: P[] = [
  { slug: 'ceramide-oat-cleanser', cat: 'cleansers', en: 'Ceramide + Oat Cleanser', fa: 'شوینده سرامید و جو', tagline: 'پاک‌کنندگی ملایم، بدون خشکی', sizes: [['۱۵۰ میلی‌لیتر', 420000]], rating: 4.8, reviews: 1284, sales: 9, badge: 'best', shape: 'tube', glass: '#FFFFFF', concerns: ['dryness', 'barrier', 'sensitive'], skins: ['dry', 'sensitive', 'normal'], ing: ['ceramides'] },
  { slug: 'salicylic-acid-2-gel-cleanser', cat: 'cleansers', en: 'Salicylic Acid 2% Gel Cleanser', fa: 'ژل شوینده سالیسیلیک اسید ۲٪', tagline: 'پاکسازی منافذ، کنترل چربی', sizes: [['۱۵۰ میلی‌لیتر', 450000]], rating: 4.6, reviews: 412, sales: 5, badge: 'trend', shape: 'tube', glass: '#F2F4F3', concerns: ['acne'], skins: ['oily', 'combination'], ing: ['salicylic'] },
  { slug: 'niacinamide-10-zinc-1', cat: 'serums', en: 'Niacinamide 10% + Zinc 1%', fa: 'نیاسینامید ۱۰٪ + زینک ۱٪', tagline: 'شفاف‌کننده، تنظیم چربی', description: 'سرمی با غلظت بالای ویتامین B3 و زینک PCA که ظاهر منافذ و جوش‌ها را کاهش می‌دهد، چربی پوست را متعادل می‌کند و به یکدستی رنگ پوست کمک می‌کند.', sizes: [['۳۰ میلی‌لیتر', 450000], ['۶۰ میلی‌لیتر', 790000]], rating: 4.9, reviews: 2106, sales: 10, badge: 'best', shape: 'dropper', glass: '#E9ECEB', concerns: ['acne', 'tone'], skins: ['oily', 'combination', 'normal'], ing: ['niacinamide'], details: NIACINAMIDE_DETAILS },
  { slug: 'hyaluronic-acid-2-b5', cat: 'serums', en: 'Hyaluronic Acid 2% + B5', fa: 'هیالورونیک اسید ۲٪ + B5', tagline: 'آبرسان، حجم‌دهنده', sizes: [['۳۰ میلی‌لیتر', 490000], ['۶۰ میلی‌لیتر', 850000]], rating: 4.8, reviews: 967, sales: 8, badge: 'team', shape: 'dropper', glass: '#E9ECEB', concerns: ['dryness', 'sensitive'], skins: ['dry', 'oily', 'combination', 'sensitive', 'normal'], ing: ['hyaluronic'] },
  { slug: 'vitamin-c-15-ferulic', cat: 'serums', en: 'Vitamin C 15% + Ferulic Acid', fa: 'ویتامین C ۱۵٪ + فرولیک اسید', tagline: 'روشن‌کننده، آنتی‌اکسیدان', sizes: [['۳۰ میلی‌لیتر', 690000]], rating: 4.7, reviews: 638, sales: 6, badge: null, shape: 'dropper', glass: '#B98451', concerns: ['tone', 'aging'], skins: ['oily', 'combination', 'normal'], ing: ['vitc'] },
  { slug: 'retinal-0-1-emulsion', cat: 'serums', en: 'Retinal 0.1% Emulsion', fa: 'امولسیون رتینال ۰٫۱٪', tagline: 'بافت صاف‌تر، کاهش خطوط', sizes: [['۳۰ میلی‌لیتر', 790000]], rating: 4.7, reviews: 301, sales: 4, badge: 'new', shape: 'dropper', glass: '#B98451', concerns: ['aging', 'acne'], skins: ['dry', 'oily', 'combination', 'normal'], ing: ['retinal'] },
  { slug: 'azelaic-acid-10-suspension', cat: 'serums', en: 'Azelaic Acid 10% Suspension', fa: 'آزلائیک اسید ۱۰٪', tagline: 'کاهش قرمزی، یکدستی رنگ', sizes: [['۳۰ میلی‌لیتر', 590000]], rating: 4.6, reviews: 522, sales: 5, badge: null, shape: 'tube', glass: '#FFFFFF', concerns: ['redness', 'tone', 'acne'], skins: ['sensitive', 'combination', 'oily'], ing: ['azelaic'] },
  { slug: 'ceramide-barrier-cream-5', cat: 'moisturizers', en: 'Ceramide Barrier Cream 5%', fa: 'کرم سد پوستی سرامید ۵٪', tagline: 'ترمیم، رطوبت ماندگار', sizes: [['۵۰ میلی‌لیتر', 620000], ['۱۰۰ میلی‌لیتر', 990000]], rating: 4.9, reviews: 1873, sales: 9, badge: 'best', shape: 'jar', glass: '#FFFFFF', concerns: ['barrier', 'dryness', 'sensitive', 'redness'], skins: ['dry', 'sensitive', 'normal', 'combination'], ing: ['ceramides'] },
  { slug: 'copper-peptides-1-cream', cat: 'moisturizers', en: 'Copper Peptides 1% Cream', fa: 'کرم پپتید مس ۱٪', tagline: 'سفت‌کننده، صاف‌کننده', sizes: [['۵۰ میلی‌لیتر', 890000]], rating: 4.7, reviews: 544, sales: 4, badge: null, shape: 'jar', glass: '#F2F4F3', concerns: ['aging'], skins: ['dry', 'normal', 'combination'], ing: ['peptides'] },
  { slug: 'mineral-uv-filters-spf-40', cat: 'spf', en: 'Mineral UV Filters SPF 40', fa: 'ضدآفتاب مینرال SPF 40', tagline: 'بی‌رنگ، مناسب پوست حساس', sizes: [['۵۰ میلی‌لیتر', 560000]], rating: 4.8, reviews: 789, sales: 7, badge: 'team', shape: 'tube', glass: '#FFFFFF', concerns: ['sensitive', 'redness'], skins: ['dry', 'sensitive', 'normal'], ing: ['zinc'] },
  { slug: 'niacinamide-spf-50-fluid', cat: 'spf', en: 'Niacinamide SPF 50 Fluid', fa: 'فلوئید ضدآفتاب نیاسینامید SPF 50', tagline: 'بافت سبک، پوست درخشان', sizes: [['۵۰ میلی‌لیتر', 590000]], rating: 4.6, reviews: 455, sales: 6, badge: null, shape: 'tube', glass: '#F2F4F3', concerns: ['tone', 'aging'], skins: ['oily', 'combination', 'normal'], ing: ['niacinamide'] },
  { slug: 'skin-tint-serum-squalane', cat: 'makeup', en: 'Skin Tint Serum + Squalane', fa: 'سرم اسکین‌تینت', tagline: 'پوشش سبک و طبیعی', blurb: 'پوشش سبک و طبیعی با نیاسینامید و اسکوالان؛ ۱۲ رنگ.', sizes: [['۳۰ میلی‌لیتر', 650000]], rating: 4.7, reviews: 922, sales: 7, badge: 'new', shape: 'dropper', glass: '#D8B39A', concerns: ['dryness', 'tone'], skins: ['dry', 'combination', 'normal'], ing: ['niacinamide'] },
  { slug: 'peptide-lip-treatment', cat: 'makeup', en: 'Peptide Lip Treatment', fa: 'بالم لب پپتیدی', tagline: 'ترمیم‌کننده، براق', blurb: 'تری‌پپتید و شی باتر برای لب‌های نرم با ته‌رنگی ملایم.', sizes: [['۱۵ میلی‌لیتر', 390000]], rating: 4.8, reviews: 1530, sales: 8, badge: 'best', shape: 'stick', glass: '#D9A797', concerns: ['dryness', 'barrier'], skins: ['dry', 'oily', 'combination', 'sensitive', 'normal'], ing: ['peptides'] },
  { slug: 'ceramide-cream-blush', cat: 'makeup', en: 'Ceramide Cream Blush', fa: 'رژگونه کرمی سرامید', tagline: 'رنگ طبیعی، بدون حالت پودری', blurb: 'رنگی که در پوست ذوب می‌شود، با سرامید و روغن رزهیپ.', sizes: [['۶ گرم', 450000]], rating: 4.7, reviews: 486, sales: 3, badge: null, shape: 'jar', glass: '#E3B3A2', concerns: ['dryness', 'sensitive'], skins: ['dry', 'sensitive', 'normal'], ing: ['ceramides'] },
];

const REVIEWS = [
  { product: 'ceramide-barrier-cream-5', rating: 5, name: 'نگار م.', skin: 'خشک و حساس', body: 'از همان هفته‌ی اول دیگر وسط روز حس کشیدگی نداشتم. تنها کرمی است که سه بار دوباره خریده‌ام.' },
  { product: 'niacinamide-10-zinc-1', rating: 5, name: 'آرش ر.', skin: 'چرب', body: 'بعد از چند هفته جوش‌هایم آرام‌تر شد و پوستم وسط روز کمتر براق می‌شود. بافتش سبک است و زیر ضدآفتاب گلوله نمی‌شود.' },
  { product: 'niacinamide-10-zinc-1', rating: 5, name: 'مریم ح.', skin: 'مختلط', body: 'منافذ ناحیه‌ی T واقعاً کوچک‌تر به نظر می‌رسند. نسخه‌ی ۶۰ میلی‌لیتری به‌صرفه‌تر است.' },
  { product: 'niacinamide-10-zinc-1', rating: 4, name: 'سینا ک.', skin: 'حساس', body: 'روزهای اول کمی قرمزی داشتم؛ یک روز در میان استفاده کردم و الان مشکلی ندارم.' },
  { product: 'skin-tint-serum-squalane', rating: 5, name: 'سارا ک.', skin: 'مختلط', body: 'اسکین‌تینت دقیقاً به اندازه‌ی کافی پوشش می‌دهد و پوستم حتی بدون آن بهتر به نظر می‌رسد.' },
];

await db.transaction(async (tx) => {
  const cats = await tx.insert(s.categories).values(CATEGORIES).returning();
  const cons = await tx.insert(s.concerns).values(CONCERNS.map((c, i) => ({ ...c, sort: i }))).returning();
  const ings = await tx.insert(s.ingredients).values(INGREDIENTS).returning();
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  const conId = Object.fromEntries(cons.map((c) => [c.slug, c.id]));
  const ingId = Object.fromEntries(ings.map((c) => [c.slug, c.id]));
  const prodId: Record<string, number> = {};

  for (const [i, p] of PRODUCTS.entries()) {
    const [row] = await tx.insert(s.products).values({
      slug: p.slug, nameEn: p.en, nameFa: p.fa, tagline: p.tagline, blurb: p.blurb, description: p.description ?? p.tagline,
      // rating/reviewsCount are recomputed from real approved reviews below; the design's numbers were placeholders.
      categoryId: catId[p.cat], shape: p.shape, glass: p.glass, badge: p.badge,
      skinTypes: p.skins, salesScore: p.sales, details: p.details ?? {}, sort: i,
    }).returning({ id: s.products.id });
    prodId[p.slug] = row.id;
    await tx.insert(s.variants).values(p.sizes.map(([label, price], j) => ({ productId: row.id, label, price, stock: 50, sort: j })));
    await tx.insert(s.productConcerns).values(p.concerns.map((c) => ({ productId: row.id, concernId: conId[c] })));
    await tx.insert(s.productIngredients).values(p.ing.map((g) => ({ productId: row.id, ingredientId: ingId[g] })));
  }

  await tx.insert(s.reviews).values(REVIEWS.map((r) => ({
    productId: prodId[r.product], name: r.name, skin: r.skin, rating: r.rating, body: r.body, verified: true, approved: true,
  })));
});
await sql`
  UPDATE products p SET rating = coalesce(r.avg, 0), reviews_count = coalesce(r.n, 0)
  FROM (SELECT product_id, avg(rating)::real AS avg, count(*)::int AS n FROM reviews WHERE approved GROUP BY product_id) r
  WHERE r.product_id = p.id`;

console.log(`seeded ${PRODUCTS.length} products`);
await sql.end();
