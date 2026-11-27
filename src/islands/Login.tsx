import { useEffect, useRef, useState } from 'preact/hooks';
import { getWish } from '~/scripts/store';

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const toEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
const SKINS = [['dry', 'خشک'], ['oily', 'چرب'], ['combination', 'مختلط'], ['sensitive', 'حساس'], ['normal', 'نرمال']];

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? 'خطایی رخ داد. دوباره تلاش کنید.');
  return j;
}

export default function Login({ next }: { next: string }) {
  const [step, setStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', skinType: '', birthDate: '', smsOptIn: true });
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const send = () => run(async () => {
    const j = await post('/api/auth/otp', { phone: toEn(phone) });
    setPhone(j.phone); setStep('code'); setTimer(120);
  });
  const verify = () => run(async () => {
    const j = await post('/api/auth/verify', { phone, code: toEn(code), wish: getWish() });
    if (j.isNew) setStep('profile');
    else location.href = j.role === 'admin' && next === '/account' ? '/admin' : next;
  });
  const saveProfile = () => run(async () => {
    if (!profile.firstName.trim()) throw new Error('لطفاً نام خود را وارد کنید.');
    await post('/api/account/profile', profile);
    location.href = next;
  });

  return (
    <div style="display:flex;flex-direction:column;gap:20px">
      {step === 'phone' && (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} style="display:flex;flex-direction:column;gap:20px">
          <div style="display:flex;flex-direction:column;gap:8px">
            <h1 style="margin:0;font-size:clamp(26px,3vw,36px);font-weight:800">ورود یا ثبت‌نام</h1>
            <p style="margin:0;font-size:15px;line-height:1.9;color:#3A3A3A">شماره‌ی موبایل خود را وارد کنید. اگر حساب ندارید، با همین شماره ساخته می‌شود.</p>
          </div>
          <label class="field">شماره‌ی موبایل
            <input class={`input en ${err ? 'err' : ''}`} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09121234567" value={phone} onInput={(e) => setPhone((e.target as HTMLInputElement).value)} style="text-align:left" required />
          </label>
          {err && <p role="alert" class="err-t" style="margin:0">{err}</p>}
          <button type="submit" class="btn btn-dark" disabled={busy}>{busy ? 'در حال ارسال…' : 'دریافت کد تأیید'}</button>
          <p style="margin:0;font-size:12px;line-height:1.9;color:#5C5C5C">با ورود، <a href="/terms" style="text-decoration:underline">قوانین و حریم خصوصی</a> OOJA SHOP را می‌پذیرید.</p>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} style="display:flex;flex-direction:column;gap:20px">
          <div style="display:flex;flex-direction:column;gap:8px">
            <h1 style="margin:0;font-size:clamp(26px,3vw,36px);font-weight:800">کد تأیید را وارد کنید</h1>
            <p style="margin:0;font-size:15px;line-height:1.9;color:#3A3A3A">کد ۵ رقمی به <span class="en" style="font-weight:600">{phone}</span> پیامک شد. <button type="button" class="rm" onClick={() => { setStep('phone'); setCode(''); setErr(null); }}>تغییر شماره</button></p>
          </div>
          <label class="field">کد تأیید
            <input ref={codeRef} class={`input en ${err ? 'err' : ''}`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={5} placeholder="•••••" value={code}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; setCode(v); if (toEn(v).length === 5) setTimeout(() => (e.target as HTMLInputElement).form?.requestSubmit(), 0); }}
              style="text-align:center;font-size:24px;letter-spacing:.4em" />
          </label>
          {err && <p role="alert" class="err-t" style="margin:0">{err}</p>}
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#5C5C5C">
            <span aria-live="polite">{timer > 0 ? `ارسال دوباره تا ${fa(Math.floor(timer / 60))}:${fa(String(timer % 60).padStart(2, '0'))}` : 'کد را دریافت نکردید؟'}</span>
            <button type="button" class="rm" disabled={timer > 0 || busy} onClick={send}>ارسال دوباره‌ی کد</button>
          </div>
          <button type="submit" class="btn btn-dark" disabled={busy}>تأیید و ادامه</button>
        </form>
      )}

      {step === 'profile' && (
        <form onSubmit={(e) => { e.preventDefault(); saveProfile(); }} style="display:flex;flex-direction:column;gap:18px">
          <div style="display:flex;flex-direction:column;gap:8px">
            <h1 style="margin:0;font-size:clamp(26px,3vw,36px);font-weight:800">خوش آمدید! حساب‌تان را کامل کنید.</h1>
            <p style="margin:0;font-size:15px;line-height:1.9;color:#3A3A3A">فقط نام لازم است؛ بقیه به ما کمک می‌کند پیشنهادهای دقیق‌تری بدهیم.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">
            <label class="field">نام<input class="input" autoComplete="given-name" value={profile.firstName} onInput={(e) => setProfile({ ...profile, firstName: (e.target as HTMLInputElement).value })} required /></label>
            <label class="field">نام خانوادگی (اختیاری)<input class="input" autoComplete="family-name" value={profile.lastName} onInput={(e) => setProfile({ ...profile, lastName: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <fieldset style="border:0;padding:0;margin:0">
            <legend style="padding:0;margin-bottom:10px;font-size:13px;font-weight:600">نوع پوست (اختیاری)</legend>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              {SKINS.map(([id, label]) => <button type="button" class="chip" aria-pressed={profile.skinType === id} onClick={() => setProfile({ ...profile, skinType: profile.skinType === id ? '' : id })}>{label}</button>)}
            </div>
          </fieldset>
          <label class="field">تاریخ تولد (اختیاری، برای هدیه‌ی تولد)
            <input class="input" placeholder="مثلاً ۱۲ اردیبهشت" value={profile.birthDate} onInput={(e) => setProfile({ ...profile, birthDate: (e.target as HTMLInputElement).value })} />
          </label>
          <label style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" checked={profile.smsOptIn} onChange={(e) => setProfile({ ...profile, smsOptIn: (e.target as HTMLInputElement).checked })} style="width:18px;height:18px;accent-color:#111111" />اخبار و تخفیف‌ها را پیامک کنید</label>
          {err && <p role="alert" class="err-t" style="margin:0">{err}</p>}
          <button type="submit" class="btn btn-dark" disabled={busy}>ساخت حساب</button>
        </form>
      )}
    </div>
  );
}
