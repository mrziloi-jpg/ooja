import { useEffect, useState } from 'preact/hooks';
import { getState, hydrateCart, setCartMeta, setQty, subscribe, toggleWish, type CartView } from '~/scripts/store';

type Sample = { slug: string; nameEn: string; glass: string };
type Props = { initial: CartView; samples: Sample[]; freeShipFrom: number };

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const money = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';

export default function CartPage({ initial, samples }: Props) {
  const [c, setC] = useState<CartView>(initial);
  const [code, setCode] = useState(initial.discount?.code ?? '');
  const [codeErr, setCodeErr] = useState<string | null>(initial.discountError);

  useEffect(() => {
    hydrateCart(initial);
    return subscribe((s) => s.cart && setC(s.cart));
  }, []);

  const applyCode = async (e: Event) => {
    e.preventDefault();
    try {
      await setCartMeta({ discountCode: code });
      setCodeErr(getState().cart?.discountError ?? null);
    } catch (err) { setCodeErr((err as Error).message); }
  };
  const toggleSample = (slug: string) => {
    const on = c.samples.includes(slug);
    setCartMeta({ samples: on ? c.samples.filter((x) => x !== slug) : [...c.samples, slug].slice(0, 2) });
  };

  if (c.count === 0) {
    return (
      <div style="background:#F4F4F2;padding:80px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">
        <p style="margin:0;font-size:24px;font-weight:700">سبد خرید شما خالی است.</p>
        <p style="margin:0;font-size:15px;color:#5C5C5C">از پرفروش‌ها شروع کنید یا با تست پوست، روتین مناسب خودتان را پیدا کنید.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
          <a class="btn btn-dark" href="/shop">مشاهده‌ی محصولات</a>
          <a class="btn btn-line" href="/quiz">شروع تست پوست</a>
        </div>
      </div>
    );
  }

  return (
    <div style="display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start">
      <div style="flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:28px">
        <div style="background:#F4F4F2;padding:18px 20px">
          <p style="margin:0 0 10px;font-size:14px;font-weight:600">{c.toFreeShip === 0 ? 'ارسال رایگان برای سفارش شما فعال شد.' : `فقط ${money(c.toFreeShip)} تا ارسال رایگان فاصله دارید.`}</p>
          <div style="height:4px;background:#DCDCDA;display:flex"><div style={`height:100%;width:${c.freeShipPct}%;background:#111111;transition:width .4s ease`} /></div>
        </div>

        <ul aria-label="کالاهای سبد" style="list-style:none;margin:0;padding:0;border-top:1px solid #111111">
          {c.lines.map((l) => (
            <li key={l.variantId} style="display:flex;flex-wrap:wrap;gap:20px;padding:24px 0;border-bottom:1px solid #E5E5E3;align-items:center">
              <a href={`/p/${l.slug}`} class="stage" style="flex:0 0 120px;height:140px" aria-label={l.nameFa}>
                {l.image
                  ? <img class="photo" src={`${l.image}-480.webp`} alt="" loading="lazy" />
                  : <div class="gloss" style={`width:40px;height:80px;border-radius:5px 5px 8px 8px;border-top:14px solid #111111;background:${l.glass};box-shadow:inset 0 0 0 1px rgba(0,0,0,.08),0 14px 18px -10px rgba(0,0,0,.4)`} />}
              </a>
              <div style="flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:4px">
                <a href={`/p/${l.slug}`} class="en r" style="font-size:17px;font-weight:600">{l.nameEn}</a>
                <span style="font-size:14px;color:#333333">{l.nameFa}</span>
                <span style="font-size:13px;color:#5C5C5C">حجم: {l.label} · {money(l.price)}</span>
                <div style="display:flex;gap:18px;margin-top:6px">
                  <button class="rm" onClick={() => { toggleWish(l.productId); setQty(l.variantId, 0); }}>انتقال به علاقه‌مندی‌ها</button>
                  <button class="rm" onClick={() => setQty(l.variantId, 0)}>حذف</button>
                </div>
              </div>
              <div style="display:inline-flex;align-items:center;border:1px solid #D6D6D4">
                <button class="step-btn" style="width:44px;height:44px;font-size:18px" aria-label={`افزایش تعداد ${l.nameFa}`} disabled={l.qty >= Math.min(10, l.stock)} onClick={() => setQty(l.variantId, l.qty + 1)}>+</button>
                <span aria-live="polite" style="min-width:32px;text-align:center;font-size:15px;font-weight:700">{fa(l.qty)}</span>
                <button class="step-btn" style="width:44px;height:44px;font-size:18px" aria-label={`کاهش تعداد ${l.nameFa}`} onClick={() => setQty(l.variantId, l.qty - 1)}>−</button>
              </div>
              <p style="margin:0;min-width:140px;text-align:left;font-size:16px;font-weight:700">{money(l.price * l.qty)}</p>
            </li>
          ))}
        </ul>

        {samples.length > 0 && (
          <section aria-labelledby="samples-h" style="border:1px solid #E5E5E3;padding:24px">
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:16px">
              <h2 id="samples-h" style="margin:0;font-size:18px;font-weight:700">دو نمونه‌ی رایگان انتخاب کنید</h2>
              <span style="font-size:13px;color:#5C5C5C">{fa(c.samples.length)} از ۲ انتخاب شده</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">
              {samples.map((s) => {
                const on = c.samples.includes(s.slug);
                return (
                  <button key={s.slug} class="sample" aria-pressed={on} disabled={!on && c.samples.length >= 2} onClick={() => toggleSample(s.slug)}>
                    <span aria-hidden="true" style={`width:16px;height:40px;border-radius:3px 3px 6px 6px;border-top:8px solid #111111;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);background:${s.glass}`} />
                    <span class="en" style="font-weight:600;line-height:1.4">{s.nameEn}</span>
                    <span style="color:#5C5C5C">{on ? 'انتخاب شد ✓' : 'انتخاب'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <aside aria-label="خلاصه‌ی سفارش" style="flex:1 1 340px;max-width:440px;position:sticky;top:90px;display:flex;flex-direction:column;gap:16px">
        <div style="border:1px solid #111111;padding:24px;display:flex;flex-direction:column;gap:14px">
          <h2 style="margin:0;font-size:20px;font-weight:700">خلاصه‌ی سفارش</h2>
          <form onSubmit={applyCode} style="display:flex;flex-direction:column;gap:8px">
            <label for="code" style="font-size:13px;font-weight:600">کد تخفیف</label>
            <div style="display:flex;gap:8px">
              <input id="code" class="input en" type="text" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} style="text-align:left" />
              <button type="submit" class="btn btn-line" style="min-height:48px;padding:0 18px">اعمال</button>
            </div>
            {codeErr && <p role="alert" style="margin:0;font-size:13px;color:#A3261B">{codeErr}</p>}
            {c.discount && (
              <p role="status" style="margin:0;font-size:13px;font-weight:600;display:flex;justify-content:space-between">
                کد <span class="en">{c.discount.code}</span> اعمال شد
                <button type="button" class="rm" style="padding:0" onClick={() => { setCode(''); setCodeErr(null); setCartMeta({ discountCode: null }); }}>حذف</button>
              </p>
            )}
          </form>
          <dl style="margin:0;display:flex;flex-direction:column;gap:10px;font-size:14px;border-top:1px solid #E5E5E3;padding-top:14px">
            <div style="display:flex;justify-content:space-between"><dt>جمع کالاها</dt><dd style="margin:0">{money(c.subtotal)}</dd></div>
            {c.discount && <div style="display:flex;justify-content:space-between"><dt>{c.discount.label}</dt><dd style="margin:0">− {money(c.discount.amount)}</dd></div>}
            <div style="display:flex;justify-content:space-between"><dt>هزینه‌ی ارسال</dt><dd style="margin:0">{c.toFreeShip === 0 ? 'رایگان' : 'در مرحله‌ی بعد'}</dd></div>
            <div style="display:flex;justify-content:space-between"><dt>نمونه‌های رایگان</dt><dd style="margin:0">{fa(c.samples.length)} عدد</dd></div>
          </dl>
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #111111;padding-top:14px">
            <span style="font-size:15px;font-weight:700">مبلغ قابل پرداخت</span>
            <span style="font-size:22px;font-weight:800">{money(c.total)}</span>
          </div>
          <p style="margin:0;font-size:12px;color:#5C5C5C">قیمت‌ها شامل مالیات بر ارزش افزوده است.</p>
          <a class="btn btn-dark" href="/checkout">ادامه و تسویه حساب</a>
        </div>
        <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;font-size:13px;color:#3A3A3A">
          <li>پرداخت امن از طریق درگاه شاپرک</li>
          <li>۷ روز ضمانت بازگشت کالا</li>
          <li>ضمانت اصالت کالا</li>
        </ul>
      </aside>
    </div>
  );
}
