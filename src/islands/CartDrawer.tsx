import { useEffect, useRef, useState } from 'preact/hooks';
import { closeDrawer, getState, openDrawer, setQty, subscribe } from '~/scripts/store';

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const money = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';

export default function CartDrawer() {
  const [s, setS] = useState(getState());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe((next) => setS({ ...next })), []);
  useEffect(() => {
    if (!s.drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [s.drawerOpen]);

  const c = s.cart;
  return (
    <>
      {s.toast && !s.drawerOpen && (
        <div class="toast" role="status">
          <span>{s.toast}</span>
          <button class="btn btn-white" style="min-height:36px;padding:0 14px;font-size:13px" onClick={openDrawer}>مشاهده‌ی سبد</button>
        </div>
      )}
      {s.drawerOpen && (
        <>
          <button class="overlay" aria-label="بستن سبد خرید" onClick={closeDrawer} style="position:fixed;inset:0;z-index:60;border:0;padding:0;background:rgba(0,0,0,.35);cursor:default" />
          <aside class="drawer" role="dialog" aria-modal="true" aria-label="سبد خرید" style="position:fixed;top:0;left:0;bottom:0;width:min(440px,100%);z-index:61;background:#FFFFFF;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #111111">
              <h2 style="margin:0;font-size:20px;font-weight:700">سبد خرید ({fa(c?.count ?? 0)})</h2>
              <button ref={closeRef} class="icon-btn" aria-label="بستن سبد خرید" onClick={closeDrawer}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            {c && (
              <div style="padding:14px 22px 16px;background:#F4F4F2">
                <p style="margin:0 0 10px;font-size:13px">{c.toFreeShip === 0 ? 'ارسال رایگان برای سفارش شما فعال شد.' : `فقط ${money(c.toFreeShip)} تا ارسال رایگان فاصله دارید.`}</p>
                <div style="height:3px;background:#DCDCDA;display:flex"><div style={`height:100%;width:${c.freeShipPct}%;background:#111111;transition:width .4s ease`} /></div>
              </div>
            )}
            <div style="flex:1 1 auto;overflow-y:auto;padding:0 22px">
              {!c && <p style="padding:48px 0;text-align:center" class="mute">در حال بارگذاری…</p>}
              {c && c.count === 0 && (
                <div style="padding:72px 0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px">
                  <p style="margin:0;font-size:19px;font-weight:700">سبد خرید شما خالی است.</p>
                  <p style="margin:0;font-size:14px;line-height:1.9;color:#5C5C5C">از پرفروش‌ها شروع کنید یا با روتین‌ساز، روتین خودتان را بسازید.</p>
                  <a class="btn btn-dark" href="/shop" onClick={closeDrawer}>مشاهده‌ی پرفروش‌ها</a>
                </div>
              )}
              <ul style="list-style:none;margin:0;padding:0">
                {c?.lines.map((l) => (
                  <li key={l.variantId} style="display:flex;gap:14px;padding:18px 0;border-bottom:1px solid #EFEFED">
                    <a href={`/p/${l.slug}`} aria-hidden="true" tabIndex={-1} style="flex:0 0 80px;height:96px;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#FFFFFF 0%,#F4F4F2 80%)">
                      {l.image
                        ? <img src={`${l.image}-480.webp`} alt="" width={80} height={96} style="width:80px;height:96px;object-fit:cover" loading="lazy" />
                        : <div class="gloss" style={`width:28px;height:54px;border-radius:4px 4px 6px 6px;border-top:10px solid #111111;background:${l.glass};box-shadow:inset 0 0 0 1px rgba(0,0,0,.08),0 10px 14px -8px rgba(0,0,0,.4)`} />}
                    </a>
                    <div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px">
                      <div style="display:flex;justify-content:space-between;gap:12px">
                        <p class="en r" style="margin:0;font-size:14px;font-weight:600;line-height:1.4">{l.nameEn}</p>
                        <p style="margin:0;font-size:14px;font-weight:700;white-space:nowrap">{money(l.price * l.qty)}</p>
                      </div>
                      <p style="margin:0;font-size:12px;color:#5C5C5C">{l.nameFa} · {l.label}</p>
                      <div style="margin-top:auto;padding-top:8px;display:flex;align-items:center;justify-content:space-between">
                        <div style="display:inline-flex;align-items:center;border:1px solid #D6D6D4">
                          <button class="step-btn" aria-label={`افزایش تعداد ${l.nameFa}`} disabled={l.qty >= Math.min(10, l.stock)} onClick={() => setQty(l.variantId, l.qty + 1)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                          </button>
                          <span aria-live="polite" style="min-width:28px;text-align:center;font-size:14px;font-weight:700">{fa(l.qty)}</span>
                          <button class="step-btn" aria-label={`کاهش تعداد ${l.nameFa}`} onClick={() => setQty(l.variantId, l.qty - 1)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
                          </button>
                        </div>
                        <button class="rm" onClick={() => setQty(l.variantId, 0)}>حذف</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {c && c.count > 0 && (
              <div style="padding:18px 22px 22px;border-top:1px solid #111111;display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <span style="font-size:14px">جمع کل</span>
                  <span style="font-size:20px;font-weight:800">{money(c.subtotal)}</span>
                </div>
                <p style="margin:0;font-size:12px;line-height:1.8;color:#5C5C5C">هزینه‌ی ارسال در مرحله‌ی بعد محاسبه می‌شود. دو نمونه‌ی رایگان همراه سفارش شماست.</p>
                <a class="btn btn-dark" style="width:100%" href="/checkout">ادامه و پرداخت</a>
                <a class="btn btn-line" style="width:100%;min-height:44px" href="/cart">مشاهده‌ی سبد کامل</a>
                <button class="btn btn-line" style="width:100%;min-height:44px" onClick={closeDrawer}>ادامه‌ی خرید</button>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
