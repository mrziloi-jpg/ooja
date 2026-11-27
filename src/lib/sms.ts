import { config } from './config';

// Kavenegar is used for its "verify lookup" templates, which are delivered on the fast OTP route
// and are not blocked by the regulator's advertising-SMS filter.
async function kavenegar(path: string, params: Record<string, string>) {
  const url = `https://api.kavenegar.com/v1/${config.kavenegarKey}/${path}.json`;
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`kavenegar ${path} failed: ${res.status} ${await res.text()}`);
}

export async function sendOtp(phone: string, code: string) {
  if (config.smsProvider === 'console') {
    console.log(`[sms] OTP for ${phone}: ${code}`);
    return;
  }
  await kavenegar('verify/lookup', { receptor: phone, token: code, template: config.kavenegarOtpTemplate });
}

export async function sendSms(phone: string, message: string) {
  if (config.smsProvider === 'console') {
    console.log(`[sms] to ${phone}: ${message}`);
    return;
  }
  await kavenegar('sms/send', { receptor: phone, message, ...(config.kavenegarSender ? { sender: config.kavenegarSender } : {}) });
}

/** Fire-and-forget: an SMS failure must never fail the request that triggered it. */
export function notify(phone: string, message: string) {
  sendSms(phone, message).catch((e) => console.error('[sms] failed', e));
}
