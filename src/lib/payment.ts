import { config } from './config';

// Gateway amounts are in rial; the store works in toman.
const toRial = (toman: number) => toman * 10;

export type PayRequest = { orderCode: string; amount: number; phone: string; callbackUrl: string; description: string };

export async function requestPayment(req: PayRequest): Promise<{ authority: string; redirectUrl: string }> {
  if (config.paymentProvider === 'mock') {
    const authority = `MOCK-${req.orderCode}-${Date.now()}`;
    return { authority, redirectUrl: `/checkout/mock-gateway?authority=${encodeURIComponent(authority)}&amount=${req.amount}` };
  }
  const host = config.zarinpalSandbox ? 'sandbox.zarinpal.com' : 'payment.zarinpal.com';
  const res = await fetch(`https://${host}/pg/v4/payment/request.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      merchant_id: config.zarinpalMerchant,
      amount: toRial(req.amount),
      currency: 'IRR',
      callback_url: req.callbackUrl,
      description: req.description,
      metadata: { mobile: req.phone, order_id: req.orderCode },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json();
  if (json?.data?.code !== 100) throw new Error(`zarinpal request failed: ${JSON.stringify(json?.errors ?? json)}`);
  const authority = json.data.authority as string;
  return { authority, redirectUrl: `https://${host}/pg/StartPay/${authority}` };
}

/** Verifies with the gateway. Must be called before marking an order paid; the callback query alone is not proof. */
export async function verifyPayment(authority: string, amount: number): Promise<{ ok: boolean; refId?: string }> {
  if (config.paymentProvider === 'mock') return { ok: authority.startsWith('MOCK-'), refId: `MOCKREF${Date.now() % 1e8}` };
  const host = config.zarinpalSandbox ? 'sandbox.zarinpal.com' : 'payment.zarinpal.com';
  const res = await fetch(`https://${host}/pg/v4/payment/verify.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ merchant_id: config.zarinpalMerchant, amount: toRial(amount), authority }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json();
  // 100 = verified now, 101 = already verified (user refreshed the callback page)
  const code = json?.data?.code;
  return code === 100 || code === 101 ? { ok: true, refId: String(json.data.ref_id) } : { ok: false };
}
