const env = (k: string, d = '') => process.env[k] ?? (import.meta.env?.[k] as string | undefined) ?? d;

export const config = {
  siteUrl: env('SITE_URL', 'http://localhost:4321'),
  isProd: env('NODE_ENV') === 'production',
  paymentProvider: env('PAYMENT_PROVIDER', 'mock') as 'mock' | 'zarinpal',
  zarinpalMerchant: env('ZARINPAL_MERCHANT_ID'),
  zarinpalSandbox: env('ZARINPAL_SANDBOX', 'true') === 'true',
  smsProvider: env('SMS_PROVIDER', 'console') as 'console' | 'kavenegar',
  kavenegarKey: env('KAVENEGAR_API_KEY'),
  kavenegarOtpTemplate: env('KAVENEGAR_OTP_TEMPLATE', 'lumiere-otp'),
  kavenegarSender: env('KAVENEGAR_SENDER'),
  // Testing only (staging): every login code is this value. Ignored unless it is 5 digits and SMS is
  // "console", so it can never apply while real SMS goes out. compose.prod.yml forces it empty.
  fixedOtpCode: /^\d{5}$/.test(env('FIXED_OTP_CODE')) && env('SMS_PROVIDER', 'console') === 'console' ? env('FIXED_OTP_CODE') : '',
  adminPhones: env('ADMIN_PHONES').split(',').map((s) => s.trim()).filter(Boolean),
  mediaDir: env('MEDIA_DIR', './media'),
};

// Store rules, kept in one place so cart, checkout and copy agree.
export const STORE = {
  freeShipFrom: 1_500_000,
  shipping: [
    { id: 'post', name: 'پست پیشتاز', eta: '۳ تا ۵ روز کاری · سراسر کشور', price: 60_000 },
    { id: 'tipax', name: 'تیپاکس', eta: '۲ تا ۳ روز کاری · مراکز استان‌ها', price: 85_000 },
    { id: 'courier', name: 'پیک فوری تهران', eta: 'تحویل همان روز برای سفارش تا ساعت ۱۴', price: 120_000, tehranOnly: true },
  ],
  payments: [
    { id: 'gateway', name: 'پرداخت اینترنتی (درگاه شاپرک)', desc: 'با همه‌ی کارت‌های عضو شتاب' },
    { id: 'cod', name: 'پرداخت در محل', desc: 'فقط با پیک فوری تهران، با کارتخوان', needsShip: 'courier' },
    { id: 'credit', name: 'اعتبار باشگاه مشتریان', desc: 'باقی‌مانده از درگاه پرداخت می‌شود', needsLogin: true },
  ],
  provinces: ['تهران', 'البرز', 'اصفهان', 'فارس', 'خراسان رضوی', 'آذربایجان شرقی', 'آذربایجان غربی', 'مازندران', 'گیلان', 'خوزستان', 'کرمان', 'یزد', 'قم', 'همدان', 'کرمانشاه', 'هرمزگان', 'سایر استان‌ها'],
  promos: [
    'ارسال رایگان برای خریدهای بالای ۱٫۵ میلیون تومان',
    'دو نمونه‌ی رایگان همراه هر سفارش',
    'جدید: بالم لب پپتیدی — همین حالا موجود است',
    '۱۵٪ تخفیف اولین خرید با عضویت در خبرنامه',
  ],
  pointsPerToman: 1 / 10_000, // 1 point per 10,000 toman paid
  redeemPoints: 100, // points per redemption...
  redeemCredit: 50_000, // ...converted to this much store credit (toman)
  returnDays: 7, // return window after delivery
  refillAfterDays: 42, // reorder reminder ~6 weeks after delivery
};
