import { useState } from 'preact/hooks';
import { CONSULT, slotDate } from '~/lib/consult';

type Day = { day: string; closed: boolean; week: string; date: string; label: string };
type Props = { days: Day[]; taken: number[]; user: { name: string; phone: string } | null };
type Done = { id: number; code: string; label: string; kind: string; phone: string };

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const toEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));

async function post(url: string, data: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, j };
}

export default function Booking({ days, taken: initialTaken, user: initialUser }: Props) {
  const firstOpen = Math.max(0, days.findIndex((d) => !d.closed));
  const [kind, setKind] = useState<string>('video');
  const [dayIdx, setDayIdx] = useState(firstOpen);
  const [slot, setSlot] = useState<string | null>(null);
  const [taken, setTaken] = useState(new Set(initialTaken));
  const [user, setUser] = useState(initialUser);
  const [f, setF] = useState({ name: initialUser?.name ?? '', phone: initialUser?.phone ?? '', topic: CONSULT.topics[0] as string, note: '' });
  const [otp, setOtp] = useState<{ phone: string; code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const d = days[dayIdx];
  const type = CONSULT.types.find((t) => t.id === kind)!;
  // Functional updates so near-simultaneous changes (e.g. browser autofill of several fields) don't overwrite each other.
  const set = (k: keyof typeof f) => (e: Event) => { const value = (e.target as HTMLInputElement).value; setF((prev) => ({ ...prev, [k]: value })); };

  async function book() {
    const startsAt = slotDate(d.day, slot!).toISOString();
    const r = await post('/api/consultations', { kind, startsAt, name: f.name.trim(), topic: f.topic, note: f.note.trim() || undefined });
    if (r.ok) {
      setDone({ id: r.j.id, code: r.j.code, label: `${d.label}، ساعت ${fa(slot!)}`, kind: type.name, phone: r.j.phone });
      return;
    }
    if (r.status === 409 && r.j.error?.includes('همین الان')) {
      // Someone else got the slot first: mark it taken and ask for another.
      setTaken(new Set([...taken, slotDate(d.day, slot!).getTime()]));
      setSlot(null);
    }
    setErr(r.j.error ?? 'رزرو انجام نشد. لطفاً دوباره تلاش کنید.');
  }

  async function submit(e: Event) {
    e.preventDefault();
    setErr(null);
    if (!slot) return setErr('لطفاً یک ساعت خالی انتخاب کنید.');
    if (f.name.trim().length < 2) return setErr('لطفاً نام و نام خانوادگی را وارد کنید.');
    setBusy(true);
    try {
      if (user) return await book();
      // Guest: confirm the phone with an SMS code (this also creates their account).
      if (!otp) {
        if (!/^09\d{9}$/.test(toEn(f.phone).trim())) return setErr('شماره‌ی موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
        const r = await post('/api/auth/otp', { phone: toEn(f.phone).trim() });
        if (!r.ok) return setErr(r.j.error ?? 'ارسال کد انجام نشد.');
        setOtp({ phone: r.j.phone, code: '' });
        return;
      }
      const v = await post('/api/auth/verify', { phone: otp.phone, code: toEn(otp.code) });
      if (!v.ok) return setErr(v.j.error ?? 'کد درست نیست.');
      setUser({ name: f.name, phone: otp.phone });
      await book();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!done) return;
    setBusy(true);
    const r = await post('/api/consultations', { id: done.id }, 'DELETE');
    setBusy(false);
    if (!r.ok) return setErr(r.j.error ?? 'لغو انجام نشد.');
    const freed = slotDate(d.day, slot!).getTime();
    setTaken(new Set([...taken].filter((t) => t !== freed)));
    setDone(null);
    setSlot(null);
    setOtp(null);
  }

  if (done) {
    return (
      <section class="wrap" style="padding-top:64px;padding-bottom:96px;max-width:760px">
        <div role="status" style="border:1px solid #111111;padding:clamp(24px,4vw,44px);display:flex;flex-direction:column;gap:16px">
          <span aria-hidden="true" style="width:52px;height:52px;border-radius:50%;background:#111111;color:#FFFFFF;display:flex;align-items:center;justify-content:center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <h2 style="margin:0;font-size:28px;font-weight:800">وقت مشاوره‌ی شما رزرو شد.</h2>
          <dl style="margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));border-top:1px solid #E5E5E3">
            <div style="padding:14px 0;border-bottom:1px solid #E5E5E3"><dt style="font-size:12px;color:#5C5C5C">نوع</dt><dd style="margin:4px 0 0;font-size:15px;font-weight:700">{done.kind}</dd></div>
            <div style="padding:14px 0;border-bottom:1px solid #E5E5E3"><dt style="font-size:12px;color:#5C5C5C">زمان</dt><dd style="margin:4px 0 0;font-size:15px;font-weight:700">{done.label}</dd></div>
            <div style="padding:14px 0;border-bottom:1px solid #E5E5E3"><dt style="font-size:12px;color:#5C5C5C">کد رزرو</dt><dd class="en r" style="margin:4px 0 0;font-size:15px;font-weight:700">{done.code}</dd></div>
          </dl>
          <p style="margin:0;font-size:14px;line-height:1.9;color:#3A3A3A">تأیید رزرو به <span class="en">{done.phone}</span> پیامک شد و یک ساعت قبل از جلسه یادآوری می‌گیرید. برای بهتر شدن جلسه، فهرست محصولاتی را که الان استفاده می‌کنید آماده کنید.</p>
          {err && <p role="alert" class="err-t" style="margin:0;font-size:13px">{err}</p>}
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            <button type="button" class="btn btn-line" disabled={busy} onClick={cancel}>لغو این وقت</button>
            <a class="btn btn-line" href="/account">وقت‌های من در حساب کاربری</a>
            <a class="btn btn-dark" href="/quiz">تا آن موقع: تست پوست</a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section class="wrap" style="padding-top:48px;padding-bottom:96px;display:flex;flex-direction:column;gap:44px">
      <div style="display:flex;flex-direction:column;gap:16px">
        <h2 class="h3"><span class="num">۱</span>نوع مشاوره</h2>
        <div role="radiogroup" aria-label="نوع مشاوره" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          {CONSULT.types.map((t) => (
            <button type="button" class="ctype" role="radio" aria-checked={kind === t.id} onClick={() => setKind(t.id)}>
              <span style="font-size:17px;font-weight:800">{t.name}</span>
              <span style="font-size:13px;color:#5C5C5C">{t.len}</span>
              <span style="font-size:14px;line-height:1.8;color:#3A3A3A">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <h2 class="h3"><span class="num">۲</span>روز و ساعت</h2>
        <div role="radiogroup" aria-label="روز" class="scroll-x" style="display:flex;gap:8px;padding-bottom:4px">
          {days.map((x, i) => (
            <button type="button" class="cday" role="radio" aria-checked={dayIdx === i} disabled={x.closed} onClick={() => { setDayIdx(i); setSlot(null); }}>
              <span style="font-size:12px">{x.week}</span>
              <span style="font-size:16px;font-weight:800">{x.date}</span>
              <span style="font-size:11px">{x.closed ? 'تعطیل' : i === 0 ? 'فردا' : ''}</span>
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="ساعت" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px">
          {CONSULT.slots.map((t) => {
            const isTaken = taken.has(slotDate(d.day, t).getTime());
            return (
              <button type="button" class="cslot" role="radio" aria-checked={slot === t} aria-label={`ساعت ${fa(t)}${isTaken ? '، رزرو شده' : ''}`} disabled={isTaken} onClick={() => setSlot(t)}>{fa(t)}</button>
            );
          })}
        </div>
        <p style="margin:0;font-size:13px;color:#5C5C5C">ساعت‌های خط‌خورده رزرو شده‌اند. زمان‌ها به وقت تهران است.</p>
      </div>

      <form onSubmit={submit} style="display:flex;flex-direction:column;gap:16px" novalidate>
        <h2 class="h3"><span class="num">۳</span>اطلاعات شما</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
          <label class="field">نام و نام خانوادگی<input class="input" value={f.name} onInput={set('name')} autoComplete="name" required /></label>
          <label class="field">شماره‌ی موبایل
            <input class="input en" type="tel" inputMode="numeric" placeholder="09121234567" value={f.phone} onInput={set('phone')} readOnly={!!user || !!otp} style={`text-align:left;${user || otp ? 'background:#F4F4F2' : ''}`} autoComplete="tel" />
          </label>
          <label class="field">موضوع اصلی
            <select class="input" value={f.topic} onChange={set('topic')}>{CONSULT.topics.map((t) => <option>{t}</option>)}</select>
          </label>
          <label class="field" style="grid-column:1 / -1">محصولاتی که الان استفاده می‌کنید (اختیاری)
            <textarea class="input" rows={3} value={f.note} onInput={set('note')} maxLength={800} style="min-height:96px" placeholder="مثلاً شوینده‌ی ژلی، کرم مرطوب‌کننده، ضدآفتاب…" />
          </label>
          {otp && (
            <label class="field" style="grid-column:1 / -1;max-width:320px">کد تأیید پیامک‌شده به <span class="en">{otp.phone}</span>
              <input class="input en" inputMode="numeric" autoComplete="one-time-code" maxLength={5} value={otp.code} onInput={(e) => { const code = (e.target as HTMLInputElement).value; setOtp((prev) => (prev ? { ...prev, code } : prev)); }} style="text-align:center;font-size:22px;letter-spacing:.4em" autoFocus />
              <button type="button" class="rm" style="align-self:flex-start" onClick={() => { setOtp(null); setErr(null); }}>تغییر شماره</button>
            </label>
          )}
        </div>
        {err && <p role="alert" class="err-t" style="margin:0;font-size:13px">{err}</p>}
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;border-top:1px solid #111111;padding-top:20px">
          <p style="margin:0;font-size:14px">{type.name} · {d.label}{slot ? `، ساعت ${fa(slot)}` : ' · ساعت را انتخاب کنید'}</p>
          <button type="submit" class="btn btn-dark" disabled={busy}>
            {busy ? 'لطفاً صبر کنید…' : user ? 'رزرو وقت مشاوره' : otp ? 'تأیید کد و رزرو' : 'دریافت کد تأیید و رزرو'}
          </button>
        </div>
        {!user && !otp && <p style="margin:0;font-size:12px;color:#5C5C5C">برای جلوگیری از رزروهای جعلی، شماره‌ی موبایل با یک کد پیامکی تأیید می‌شود و حساب کاربری شما ساخته می‌شود.</p>}
      </form>
    </section>
  );
}
