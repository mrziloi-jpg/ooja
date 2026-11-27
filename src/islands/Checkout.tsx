import { useMemo, useState } from 'preact/hooks';
import type { CartView } from '~/scripts/store';

type Address = { firstName: string; lastName: string; province: string; city: string; address: string; postal: string; landline: string | null };
type Props = {
  cart: CartView;
  user: { phone: string; email: string | null; firstName: string | null; lastName: string | null; credit: number; smsOptIn: boolean } | null;
  address: Address | null;
  provinces: string[];
  shipping: { id: string; name: string; eta: string; price: number; tehranOnly?: boolean }[];
  payments: { id: string; name: string; desc: string; needsShip?: string; needsLogin?: boolean }[];
  freeShipFrom: number;
};

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const toEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
const money = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';

export default function Checkout({ cart, user, address, provinces, shipping, payments, freeShipFrom }: Props) {
  const [step, setStep] = useState(user ? 2 : 1);
  const [max, setMax] = useState(user ? 2 : 1);
  const [f, setF] = useState({
    phone: user?.phone ?? '', email: user?.email ?? '', smsOptIn: user?.smsOptIn ?? true,
    firstName: address?.firstName ?? user?.firstName ?? '', lastName: address?.lastName ?? user?.lastName ?? '',
    province: address?.province ?? 'تهران', city: address?.city ?? 'تهران', address: address?.address ?? '',
    postal: address?.postal ?? '', landline: address?.landline ?? '', saveAddress: !address,
    shipMethod: 'post', payMethod: payments[0]?.id ?? 'gateway', terms: false,
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Functional updates so autofill changing several fields at once doesn't lose any of them.
  const set = (k: keyof typeof f) => (e: Event) => {
    const t = e.target as HTMLInputElement;
    const value = t.type === 'checkbox' ? t.checked : t.value;
    setF((prev) => ({ ...prev, [k]: value }));
    setErrors((prev) => ({ ...prev, [k]: false }));
  };
  const go = (n: number) => { setStep(n); setMax(Math.max(max, n)); };

  const isTehran = f.province === 'تهران';
  const free = cart.subtotal >= freeShipFrom;
  const ship = shipping.find((s) => s.id === f.shipMethod && (!s.tehranOnly || isTehran)) ?? shipping[0];
  const shipCost = free ? 0 : ship.price;
  const discount = cart.discount?.amount ?? 0;
  const total = cart.subtotal - discount + shipCost;
  const creditUse = f.payMethod === 'credit' ? Math.min(user?.credit ?? 0, total) : 0;

  const step1 = (e: Event) => {
    e.preventDefault();
    if (!/^09\d{9}$/.test(toEn(f.phone).trim())) return setErrors({ phone: true });
    go(2);
  };
  const step2 = (e: Event) => {
    e.preventDefault();
    const err: Record<string, boolean> = {};
    for (const k of ['firstName', 'lastName', 'city'] as const) if (!f[k].trim()) err[k] = true;
    if (f.address.trim().length < 10) err.address = true;
    if (!/^\d{10}$/.test(toEn(f.postal).replace(/\D/g, ''))) err.postal = true;
    if (Object.keys(err).length) return setErrors(err);
    if (ship.tehranOnly && !isTehran) setF((prev) => ({ ...prev, shipMethod: 'post' }));
    go(3);
  };

  const place = async () => {
    if (!f.terms) return setErrors({ terms: true });
    setBusy(true);
    setServerErr(null);
    let utm: Record<string, string> | undefined;
    try { utm = JSON.parse(localStorage.getItem('utm') || 'null') ?? undefined; } catch {}
    const payMethod = payments.find((p) => p.id === f.payMethod && (!p.needsShip || p.needsShip === ship.id)) ? f.payMethod : (payments[0]?.id ?? 'gateway');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, phone: toEn(f.phone), shipMethod: ship.id, payMethod, landline: toEn(f.landline), utm }),
      });
      const j = await res.json();
      if (!res.ok) { setServerErr(j.error); setBusy(false); return; }
      location.href = j.redirect;
    } catch {
      setServerErr('ارتباط برقرار نشد. لطفاً دوباره تلاش کنید.');
      setBusy(false);
    }
  };

  const Head = ({ n, title }: { n: number; title: string }) => (
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 22px">
      <h2 style={`margin:0;font-size:18px;font-weight:700;display:flex;align-items:center;gap:12px;color:${max >= n ? '#111111' : '#9A9A98'}`}>
        <span style={`width:28px;height:28px;background:${max >= n ? '#111111' : '#9A9A98'};color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:13px`}>{fa(n)}</span>{title}
      </h2>
      {max > n && step !== n && <button type="button" class="rm" onClick={() => setStep(n)}>ویرایش</button>}
    </div>
  );
  const box = (n: number) => `border:1px solid ${step === n ? '#111111' : '#E5E5E3'}`;

  const shipOpts = useMemo(() => shipping.map((s) => ({ ...s, disabled: !!s.tehranOnly && !isTehran })), [isTehran]);

  return (
    <div style="display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start">
      <div style="flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:12px">
        <section style={box(1)}>
          <Head n={1} title="اطلاعات تماس" />
          {step === 1 ? (
            <form onSubmit={step1} style="padding:0 22px 22px;display:flex;flex-direction:column;gap:14px">
              <p style="margin:0;font-size:14px;color:#3A3A3A">حساب کاربری دارید؟ <a href="/login?next=/checkout" style="text-decoration:underline;font-weight:600">وارد شوید</a> تا آدرس‌ها و اعتبارتان را ببینید. یا به‌عنوان مهمان ادامه دهید.</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
                <label class="field">شماره‌ی موبایل
                  <input class={`input en ${errors.phone ? 'err' : ''}`} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09121234567" value={f.phone} onInput={set('phone')} style="text-align:left" aria-invalid={!!errors.phone} />
                  {errors.phone && <span class="err-t">شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود.</span>}
                </label>
                <label class="field">ایمیل (اختیاری)
                  <input class="input en" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onInput={set('email')} style="text-align:left" />
                </label>
              </div>
              <label style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" checked={f.smsOptIn} onChange={set('smsOptIn')} style="width:18px;height:18px;accent-color:#111111" />اخبار و تخفیف‌ها را پیامک کنید</label>
              <div><button type="submit" class="btn btn-dark">ادامه</button></div>
            </form>
          ) : max > 1 && <p class="en" style="margin:0;padding:0 22px 18px;font-size:14px;color:#3A3A3A">{f.phone}</p>}
        </section>

        <section style={box(2)}>
          <Head n={2} title="آدرس تحویل" />
          {step === 2 ? (
            <form onSubmit={step2} style="padding:0 22px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
              <label class="field">نام<input class={`input ${errors.firstName ? 'err' : ''}`} value={f.firstName} onInput={set('firstName')} autoComplete="given-name" /></label>
              <label class="field">نام خانوادگی<input class={`input ${errors.lastName ? 'err' : ''}`} value={f.lastName} onInput={set('lastName')} autoComplete="family-name" /></label>
              <label class="field">استان
                <select class="input" value={f.province} onChange={set('province')}>{provinces.map((p) => <option value={p}>{p}</option>)}</select>
              </label>
              <label class="field">شهر<input class={`input ${errors.city ? 'err' : ''}`} value={f.city} onInput={set('city')} autoComplete="address-level2" /></label>
              <label class="field" style="grid-column:1 / -1">نشانی کامل (خیابان، کوچه، پلاک، واحد)
                <textarea class={`input ${errors.address ? 'err' : ''}`} rows={2} value={f.address} onInput={set('address')} autoComplete="street-address" style="min-height:80px" />
              </label>
              <label class="field">کد پستی ۱۰ رقمی<input class={`input en ${errors.postal ? 'err' : ''}`} inputMode="numeric" placeholder="1234567890" value={f.postal} onInput={set('postal')} autoComplete="postal-code" style="text-align:left" /></label>
              <label class="field">تلفن ثابت (اختیاری)<input class="input en" type="tel" inputMode="numeric" placeholder="021xxxxxxxx" value={f.landline} onInput={set('landline')} style="text-align:left" /></label>
              {Object.values(errors).some(Boolean) && <p role="alert" class="err-t" style="margin:0;grid-column:1 / -1;font-size:13px">لطفاً همه‌ی فیلدهای مشخص‌شده را کامل کنید. کد پستی باید ۱۰ رقم باشد.</p>}
              {user && <label style="grid-column:1 / -1;display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" checked={f.saveAddress} onChange={set('saveAddress')} style="width:18px;height:18px;accent-color:#111111" />ذخیره‌ی این آدرس در حساب کاربری</label>}
              <div style="grid-column:1 / -1"><button type="submit" class="btn btn-dark">ادامه</button></div>
            </form>
          ) : max > 2 && <p style="margin:0;padding:0 22px 18px;font-size:14px;line-height:1.9;color:#3A3A3A">{f.firstName} {f.lastName} · {f.province}، {f.city}، {f.address}</p>}
        </section>

        <section style={box(3)}>
          <Head n={3} title="روش ارسال" />
          {step === 3 ? (
            <div style="padding:0 22px 22px;display:flex;flex-direction:column;gap:10px">
              <div role="radiogroup" aria-label="روش ارسال" style="display:flex;flex-direction:column;gap:10px">
                {shipOpts.map((o) => (
                  <label class="opt" aria-disabled={o.disabled}>
                    <input type="radio" name="ship" checked={ship.id === o.id} disabled={o.disabled} onChange={() => setF((prev) => ({ ...prev, shipMethod: o.id }))} />
                    <span style="flex:1 1 auto;display:flex;flex-direction:column;gap:4px">
                      <span style="font-size:15px;font-weight:700">{o.name}</span>
                      <span style="font-size:13px;color:#5C5C5C">{o.disabled ? 'فقط برای آدرس‌های تهران' : o.eta}</span>
                    </span>
                    <span style="font-size:14px;font-weight:700">{free ? 'رایگان' : money(o.price)}</span>
                  </label>
                ))}
              </div>
              <div><button type="button" class="btn btn-dark" onClick={() => go(4)}>ادامه</button></div>
            </div>
          ) : max > 3 && <p style="margin:0;padding:0 22px 18px;font-size:14px;color:#3A3A3A">{ship.name} · {ship.eta}</p>}
        </section>

        <section style={box(4)}>
          <Head n={4} title="پرداخت" />
          {step === 4 && (
            <div style="padding:0 22px 22px;display:flex;flex-direction:column;gap:10px">
              <div role="radiogroup" aria-label="روش پرداخت" style="display:flex;flex-direction:column;gap:10px">
                {payments.map((p) => {
                  const disabled = (p.needsShip && p.needsShip !== ship.id) || (p.needsLogin && !(user && user.credit > 0));
                  const desc = p.id === 'credit' && user ? `موجودی شما: ${money(user.credit)} — ${p.desc}` : p.desc;
                  return (
                    <label class="opt" aria-disabled={!!disabled}>
                      <input type="radio" name="pay" checked={f.payMethod === p.id} disabled={!!disabled} onChange={() => setF((prev) => ({ ...prev, payMethod: p.id }))} />
                      <span style="flex:1 1 auto;display:flex;flex-direction:column;gap:4px">
                        <span style="font-size:15px;font-weight:700">{p.name}</span>
                        <span style="font-size:13px;color:#5C5C5C">{desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.8;margin-top:6px">
                <input type="checkbox" checked={f.terms} onChange={set('terms')} style="width:18px;height:18px;accent-color:#111111;margin-top:4px" />
                <span><a href="/terms" target="_blank" style="text-decoration:underline">قوانین و مقررات</a> و شرایط مرجوعی را می‌پذیرم.</span>
              </label>
              {errors.terms && <p role="alert" class="err-t" style="margin:0;font-size:13px">برای ثبت سفارش، پذیرش قوانین لازم است.</p>}
              {serverErr && <p role="alert" class="err-t" style="margin:0;font-size:14px">{serverErr}</p>}
              <button type="button" class="btn btn-dark" style="width:100%;margin-top:6px" disabled={busy} onClick={place}>
                {busy ? 'در حال انتقال…' : f.payMethod === 'cod' ? 'ثبت سفارش' : `پرداخت ${money(total - creditUse)}`}
              </button>
            </div>
          )}
        </section>
      </div>

      <aside aria-label="خلاصه‌ی سفارش" style="flex:1 1 320px;max-width:420px;background:#F4F4F2;padding:24px;display:flex;flex-direction:column;gap:16px;position:sticky;top:90px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <h2 style="margin:0;font-size:18px;font-weight:700">سفارش شما</h2>
          <a href="/cart" style="font-size:13px;text-decoration:underline">ویرایش سبد</a>
        </div>
        <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px">
          {cart.lines.map((l) => (
            <li style="display:flex;gap:12px;align-items:center">
              <span style="position:relative;flex:0 0 56px;height:64px;background:#FFFFFF;display:flex;align-items:center;justify-content:center">
                <span aria-hidden="true" style={`width:16px;height:40px;border-radius:3px 3px 6px 6px;border-top:8px solid #111111;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);background:${l.glass}`} />
                <span style="position:absolute;top:-6px;left:-6px;min-width:20px;height:20px;background:#111111;color:#FFFFFF;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">{fa(l.qty)}</span>
              </span>
              <span style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px">
                <span class="en r" style="font-size:13px;font-weight:600">{l.nameEn}</span>
                <span style="font-size:12px;color:#5C5C5C">{l.label}</span>
              </span>
              <span style="font-size:13px;font-weight:700;white-space:nowrap">{money(l.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        {cart.samples.length > 0 && <p style="margin:0;font-size:13px;color:#3A3A3A;background:#FFFFFF;padding:10px 12px">+ {fa(cart.samples.length)} نمونه‌ی رایگان</p>}
        <dl style="margin:0;display:flex;flex-direction:column;gap:10px;font-size:14px;border-top:1px solid #DCDCDA;padding-top:14px">
          <div style="display:flex;justify-content:space-between"><dt>جمع کالاها</dt><dd style="margin:0">{money(cart.subtotal)}</dd></div>
          {cart.discount && <div style="display:flex;justify-content:space-between"><dt>{cart.discount.label} (<span class="en">{cart.discount.code}</span>)</dt><dd style="margin:0">− {money(discount)}</dd></div>}
          <div style="display:flex;justify-content:space-between"><dt>هزینه‌ی ارسال</dt><dd style="margin:0">{shipCost === 0 ? 'رایگان' : money(shipCost)}</dd></div>
          {creditUse > 0 && <div style="display:flex;justify-content:space-between"><dt>اعتبار باشگاه</dt><dd style="margin:0">− {money(creditUse)}</dd></div>}
        </dl>
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #111111;padding-top:14px">
          <span style="font-size:15px;font-weight:700">مبلغ قابل پرداخت</span>
          <span style="font-size:22px;font-weight:800">{money(total - creditUse)}</span>
        </div>
        <p style="margin:0;font-size:12px;color:#5C5C5C">قیمت‌ها شامل مالیات بر ارزش افزوده است.</p>
      </aside>
    </div>
  );
}
