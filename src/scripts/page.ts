// One delegated listener for every page: add-to-cart, size pickers, wishlist hearts, cart badges, promo bar.
import { addToCart, getWish, loadCart, openDrawer, subscribe, toggleWish } from './store';

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const money = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;

  const size = t.closest<HTMLButtonElement>('[data-size]');
  if (size) {
    const card = size.closest('[data-product]')!;
    card.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b === size)));
    const add = card.querySelector<HTMLButtonElement>('[data-add]');
    if (add) add.dataset.add = size.dataset.size;
    const label = card.querySelector('[data-price-label]');
    if (label) label.textContent = money(Number(size.dataset.price));
    return;
  }

  const add = t.closest<HTMLButtonElement>('[data-add]');
  if (add) {
    const qtyEl = add.closest('[data-product]')?.querySelector<HTMLInputElement>('[data-qty]');
    const qty = qtyEl ? Number(qtyEl.value) || 1 : 1;
    const original = add.innerHTML;
    add.disabled = true;
    try {
      await addToCart([{ variantId: Number(add.dataset.add), qty }], `${add.dataset.name} به سبد اضافه شد`);
      add.classList.add('done');
      add.textContent = 'به سبد اضافه شد ✓';
      setTimeout(() => { add.classList.remove('done'); add.innerHTML = original; }, 2200);
    } catch {
      add.innerHTML = original;
      alert('افزودن به سبد انجام نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      add.disabled = false;
    }
    return;
  }

  const wish = t.closest<HTMLButtonElement>('[data-wish]');
  if (wish) {
    const on = toggleWish(Number(wish.dataset.wish));
    // Persist for logged-in customers (the server ignores guests); failures just leave the local copy.
    fetch('/api/wishlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: Number(wish.dataset.wish), on }) }).catch(() => {});
    document.querySelectorAll(`[data-wish="${wish.dataset.wish}"]`).forEach((b) => b.setAttribute('aria-pressed', String(on)));
    renderWishCount();
    return;
  }

  const alertBtn = t.closest<HTMLButtonElement>('[data-alert]');
  if (alertBtn) {
    const res = await fetch('/api/wishlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: Number(alertBtn.dataset.alert), on: true, alert: true }) });
    // 204 = not logged in; the SMS needs a verified phone, so log in first and come back.
    if (res.status === 204) location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    else if (res.ok) { alertBtn.disabled = true; alertBtn.textContent = 'موجود شد، پیامک می‌گیرید ✓'; }
    return;
  }

  if (t.closest('[data-open-cart]')) {
    e.preventDefault();
    openDrawer();
  }
});

function renderWishCount() {
  const w = getWish();
  document.querySelectorAll<HTMLElement>('[data-wish-count]').forEach((el) => {
    el.textContent = fa(w.length);
    el.hidden = w.length === 0;
  });
  w.forEach((id) => document.querySelectorAll(`[data-wish="${id}"]`).forEach((b) => b.setAttribute('aria-pressed', 'true')));
}

subscribe((s) => {
  if (!s.cart) return;
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
    el.textContent = fa(s.cart!.count);
    el.hidden = s.cart!.count === 0;
  });
});

// Promo bar rotation
const promo = document.querySelector<HTMLElement>('[data-promos]');
if (promo) {
  const list: string[] = JSON.parse(promo.dataset.promos!);
  let i = 0;
  const show = (d: number) => { i = (i + d + list.length) % list.length; promo.textContent = list[i]; };
  let timer = setInterval(() => show(1), 5000);
  document.querySelectorAll<HTMLElement>('[data-promo-step]').forEach((b) => b.addEventListener('click', () => {
    clearInterval(timer);
    show(Number(b.dataset.promoStep));
    timer = setInterval(() => show(1), 5000);
  }));
}

// Mobile menu
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const menu = document.getElementById('mobile-menu');
menuBtn?.addEventListener('click', () => {
  const open = menu!.hidden;
  menu!.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
});

// Filter forms submit themselves on change (works without JS via the submit button).
document.querySelectorAll<HTMLFormElement>('form[data-autosubmit]').forEach((f) => {
  f.addEventListener('change', () => f.requestSubmit());
});

// First-touch campaign attribution (influencer links, Instagram ads, Torob) saved with the order.
(() => {
  const p = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'];
  if (!keys.some((k) => p.has(k))) return;
  try {
    const prev = JSON.parse(localStorage.getItem('utm') || 'null');
    if (prev && Date.now() - prev.at < 30 * 86400_000) return;
    const utm: Record<string, string> = { at: String(Date.now()), landing: location.pathname };
    keys.forEach((k) => { const v = p.get(k); if (v) utm[k] = v.slice(0, 100); });
    localStorage.setItem('utm', JSON.stringify(utm));
  } catch {}
})();

renderWishCount();
// Load the cart after first paint so it never blocks rendering.
if ('requestIdleCallback' in window) requestIdleCallback(() => loadCart());
else setTimeout(loadCart, 200);
