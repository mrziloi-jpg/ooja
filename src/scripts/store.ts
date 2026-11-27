// Tiny client store shared by the delegated page script and the cart drawer island.
// Pages are cached HTML for everyone; per-visitor state (cart, wishlist) is loaded here.

export type CartLine = { variantId: number; productId: number; slug: string; nameEn: string; nameFa: string; label: string; price: number; qty: number; stock: number; glass: string; shape: string; image: string | null };
export type CartView = {
  lines: CartLine[]; count: number; subtotal: number; toFreeShip: number; freeShipPct: number;
  discount: { code: string; amount: number; label: string } | null; discountError: string | null; samples: string[]; total: number;
};

type State = { cart: CartView | null; drawerOpen: boolean; toast: string | null };
const state: State = { cart: null, drawerOpen: false, toast: null };
const subs = new Set<(s: State) => void>();

function emit() {
  for (const fn of subs) fn(state);
}

export function subscribe(fn: (s: State) => void) {
  subs.add(fn);
  fn(state);
  return () => subs.delete(fn);
}

export const getState = () => state;

async function api(method: 'GET' | 'POST', body?: unknown): Promise<CartView> {
  const res = await fetch('/api/cart', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`cart ${res.status}`);
  return res.json();
}

let loading: Promise<void> | null = null;
export function loadCart() {
  loading ??= api('GET').then((c) => { state.cart = c; emit(); }).catch(() => { loading = null; });
  return loading;
}

export async function addToCart(items: { variantId: number; qty: number }[], toast?: string) {
  state.cart = await api('POST', { items, mode: 'add' });
  if (toast) showToast(toast);
  emit();
}

export async function setQty(variantId: number, qty: number) {
  state.cart = await api('POST', { items: [{ variantId, qty }], mode: 'set' });
  emit();
}

export async function setCartMeta(meta: { discountCode?: string | null; samples?: string[] }) {
  const res = await fetch('/api/cart/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(meta) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'خطا');
  state.cart = await res.json();
  emit();
}

/** Seeds the store from server-rendered data so islands don't refetch on load. */
export function hydrateCart(c: CartView) {
  state.cart = c;
  loading = Promise.resolve();
  emit();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string) {
  clearTimeout(toastTimer);
  state.toast = msg;
  emit();
  toastTimer = setTimeout(() => { state.toast = null; emit(); }, 2400);
}

export function openDrawer() {
  clearTimeout(toastTimer);
  state.toast = null;
  state.drawerOpen = true;
  loadCart();
  emit();
}

export function closeDrawer() {
  state.drawerOpen = false;
  emit();
}

// Wishlist lives in localStorage for guests; it is merged into the account on login.
const WISH_KEY = 'wish';
export function getWish(): number[] {
  try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch { return []; }
}
export function toggleWish(id: number): boolean {
  const w = new Set(getWish());
  const on = !w.has(id);
  if (on) w.add(id); else w.delete(id);
  localStorage.setItem(WISH_KEY, JSON.stringify([...w]));
  return on;
}
