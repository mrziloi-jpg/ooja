import { useEffect, useRef, useState } from 'preact/hooks';
import { addToCart } from '~/scripts/store';
import { parseAnswers, profileTags, profileTitle, QUESTIONS, quizRoutine, quizTips, STEP_ROLE, type QuizAnswers, type RoutineMode } from '~/lib/quiz';

type P = { slug: string; variantId: number | null; nameEn: string; price: number; glass: string; image: string | null; inStock: boolean };
type Props = { products: Record<string, P> };
type Draft = { skin: string | null; concern: string[]; sens: string | null; climate: string | null; exp: string | null };

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const money = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';
const EMPTY: Draft = { skin: null, concern: [], sens: null, climate: null, exp: null };
const PENDING = 'quiz-pending'; // answers waiting to be saved after login

export default function Quiz({ products }: Props) {
  const [step, setStep] = useState(-1); // -1 intro, 0..4 questions, 5 result
  const [a, setA] = useState<Draft>(EMPTY);
  const [mode, setMode] = useState<RoutineMode>('full');
  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const heading = useRef<HTMLHeadingElement>(null);

  // Coming back from login with answers to save.
  useEffect(() => {
    let pending: QuizAnswers | null = null;
    try { pending = parseAnswers(JSON.parse(localStorage.getItem(PENDING) || 'null')); } catch {}
    if (!pending) return;
    setA(pending as Draft);
    setStep(QUESTIONS.length);
    save(pending).then((ok) => { if (ok) localStorage.removeItem(PENDING); });
  }, []);

  // Move focus to the new heading on each step so screen readers announce it.
  useEffect(() => { if (step >= 0) heading.current?.focus(); }, [step]);

  async function save(answers: QuizAnswers) {
    setSaved('saving');
    const res = await fetch('/api/quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) }).catch(() => null);
    if (res?.status === 401) {
      localStorage.setItem(PENDING, JSON.stringify(answers));
      location.href = '/login?next=/quiz';
      return false;
    }
    setSaved(res?.ok ? 'saved' : 'error');
    return !!res?.ok;
  }

  const q = step >= 0 && step < QUESTIONS.length ? QUESTIONS[step] : null;
  const answered = q ? (q.multi ? a.concern.length > 0 : !!a[q.key as keyof Draft]) : false;

  if (step === -1) {
    return (
      <section style="background:#F4F4F2">
        <div class="wrap" style="padding-top:88px;padding-bottom:88px;display:flex;flex-direction:column;align-items:flex-start;gap:22px">
          <p style="margin:0;font-size:13px;font-weight:600;color:#5C5C5C">تست پوست · ۵ سؤال · حدود ۶۰ ثانیه</p>
          <h1 style="margin:0;font-size:clamp(36px,5vw,64px);font-weight:800;line-height:1.25;letter-spacing:-.02em">روتینی که واقعاً<br />به پوست شما می‌خورد.</h1>
          <p style="margin:0;max-width:560px;font-size:16px;line-height:2;color:#3A3A3A">به چند سؤال ساده درباره‌ی پوست و سبک زندگی‌تان جواب دهید. روتین صبح و شب، ترتیب لایه‌گذاری و نکته‌های شروع را تحویل می‌گیرید.</p>
          <button type="button" class="btn btn-dark" onClick={() => setStep(0)}>شروع تست</button>
          <p style="margin:0;font-size:12px;color:#5C5C5C">این تست جایگزین تشخیص پزشکی نیست. برای مشکلات پوستی جدی با متخصص پوست مشورت کنید.</p>
        </div>
      </section>
    );
  }

  if (q) {
    const pick = (value: string) => {
      if (q.multi) {
        const arr = a.concern.includes(value) ? a.concern.filter((x) => x !== value) : [...a.concern, value].slice(-(q.max ?? 2));
        setA({ ...a, concern: arr });
      } else {
        setA({ ...a, [q.key]: value });
        // Single-choice questions advance on their own after a short beat.
        const at = step;
        setTimeout(() => setStep((s) => (s === at ? s + 1 : s)), 260);
      }
    };
    return (
      <section class="wrap" style="padding-top:40px;max-width:820px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">
          <button type="button" onClick={() => setStep(step - 1)} style="background:none;border:0;font-size:14px;font-weight:600;min-height:44px;color:#111111">→ قبلی</button>
          <span style="font-size:13px;color:#5C5C5C">سؤال {fa(step + 1)} از {fa(QUESTIONS.length)}</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={step + 1} aria-label="پیشرفت تست" style="height:3px;background:#E5E5E3;display:flex;margin-bottom:40px">
          <div style={`width:${Math.round(((step + (answered ? 1 : 0)) / QUESTIONS.length) * 100)}%;background:#111111;transition:width .35s ease`} />
        </div>
        <div class="qpop" key={step} style="display:flex;flex-direction:column;gap:18px">
          <h1 ref={heading} tabIndex={-1} style="margin:0;font-size:clamp(26px,3vw,38px);font-weight:800;line-height:1.4;outline:none">{q.title}</h1>
          <p style="margin:0;font-size:15px;color:#5C5C5C">{q.hint}</p>
          <div role={q.multi ? 'group' : 'radiogroup'} aria-label={q.title} style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
            {q.options.map(([value, label, sub]) => {
              const on = q.multi ? a.concern.includes(value) : a[q.key as keyof Draft] === value;
              return (
                <button type="button" class="ans" role={q.multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => pick(value)}>
                  <span class={`mark${q.multi ? '' : ' round'}${on ? ' on' : ''}`} aria-hidden="true">
                    {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                  <span style="display:flex;flex-direction:column;gap:2px">
                    <span style="font-size:16px;font-weight:600">{label}</span>
                    {sub && <span style="font-size:13px;color:#5C5C5C">{sub}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px">
            <span style="font-size:13px;color:#5C5C5C">{q.multi ? `${fa(a.concern.length)} از ${fa(q.max ?? 2)} انتخاب شده` : ''}</span>
            <button type="button" class="btn btn-dark" disabled={!answered} onClick={() => answered && setStep(step + 1)}>{step === QUESTIONS.length - 1 ? 'دیدن نتیجه' : 'بعدی'}</button>
          </div>
        </div>
      </section>
    );
  }

  // Result
  const answers = parseAnswers(a);
  if (!answers) {
    return (
      <section class="wrap" style="padding-top:64px;display:flex;flex-direction:column;align-items:flex-start;gap:16px">
        <p style="margin:0;font-size:16px">پاسخ‌ها کامل نیست.</p>
        <button type="button" class="btn btn-dark" onClick={() => setStep(0)}>شروع دوباره</button>
      </section>
    );
  }
  const r = quizRoutine(answers, mode);
  const unique = [...new Set([...r.am, ...r.pm])].map((slug) => products[slug]).filter(Boolean);
  const buyable = unique.filter((p) => p.inStock && p.variantId);
  const total = buyable.reduce((n, p) => n + p.price, 0);
  const tips = quizTips(answers, r.pm);

  const routine = (title: string, slugs: string[]) => (
    <div style="border:1px solid #E5E5E3;padding:22px;display:flex;flex-direction:column;gap:4px">
      <p style="margin:0 0 8px;font-size:16px;font-weight:800">{title}</p>
      {slugs.map((slug, i) => {
        const p = products[slug];
        if (!p) return null;
        return (
          <a href={`/p/${slug}`} style="display:flex;gap:14px;align-items:center;padding:12px 0;border-top:1px solid #EFEFED;text-decoration:none">
            <span style="flex:0 0 26px;height:26px;border:1px solid #111111;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">{fa(i + 1)}</span>
            <span class="qthumb" style="flex:0 0 52px;height:64px">
              {p.image ? <img src={`${p.image}-480.webp`} alt="" width={52} height={64} style="width:52px;height:64px;object-fit:cover" loading="lazy" /> : <span class="qvial" aria-hidden="true" style={`background:${p.glass}`} />}
            </span>
            <span style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px">
              <span style="font-size:12px;color:#5C5C5C">{STEP_ROLE[slug] ?? ''}</span>
              <span class="en r" style="font-size:14px;font-weight:600">{p.nameEn}</span>
            </span>
            <span style="font-size:13px;font-weight:700;white-space:nowrap">{p.inStock ? money(p.price) : <span style="color:#A3261B">ناموجود</span>}</span>
          </a>
        );
      })}
    </div>
  );

  return (
    <section>
      <div style="background:#111111;color:#FFFFFF">
        <div class="wrap" style="padding-top:56px;padding-bottom:56px;display:flex;flex-direction:column;gap:16px">
          <p style="margin:0;font-size:13px;font-weight:600;color:#BDBDBD">نتیجه‌ی تست پوست شما</p>
          <h1 ref={heading} tabIndex={-1} style="margin:0;font-size:clamp(30px,4vw,52px);font-weight:800;line-height:1.3;outline:none">{profileTitle(answers)}</h1>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            {profileTags(answers).map((t) => <span style="font-size:13px;border:1px solid #FFFFFF;padding:4px 12px">{t}</span>)}
          </div>
        </div>
      </div>
      <div class="wrap" style="padding-top:40px;display:flex;flex-direction:column;gap:24px">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px">
          <h2 style="margin:0;font-size:clamp(22px,2.4vw,30px);font-weight:800">روتین پیشنهادی</h2>
          <div role="radiogroup" aria-label="نوع روتین" style="display:flex">
            <button type="button" class="seg" role="radio" aria-checked={mode === 'ess'} onClick={() => { setMode('ess'); setAdded(false); }}>ضروری (۳ مرحله)</button>
            <button type="button" class="seg" role="radio" aria-checked={mode === 'full'} onClick={() => { setMode('full'); setAdded(false); }}>کامل</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
          {routine('صبح', r.am)}
          {routine('شب', r.pm)}
        </div>
        <div style="background:#F4F4F2;padding:18px 20px;display:flex;flex-direction:column;gap:8px">
          <p style="margin:0;font-size:15px;font-weight:700">نکته‌های شروع</p>
          {tips.map((t) => <p style="margin:0;font-size:14px;line-height:1.9;color:#3A3A3A">— {t}</p>)}
        </div>
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;border-top:1px solid #111111;padding-top:20px">
          <p style="margin:0;font-size:15px">{fa(buyable.length)} محصول · <strong>{money(total)}</strong></p>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            <button type="button" class="btn btn-dark" disabled={added || !buyable.length} onClick={async () => {
              await addToCart(buyable.map((p) => ({ variantId: p.variantId!, qty: 1 })), 'روتین شما به سبد اضافه شد');
              setAdded(true);
            }}>{added ? 'روتین به سبد اضافه شد ✓' : 'افزودن کل روتین به سبد'}</button>
            <button type="button" class="btn btn-line" disabled={saved === 'saving' || saved === 'saved'} onClick={() => save(answers)}>
              {saved === 'saved' ? 'در حساب شما ذخیره شد ✓' : saved === 'saving' ? 'در حال ذخیره…' : 'ذخیره در حساب کاربری'}
            </button>
            <button type="button" class="btn btn-line" onClick={() => { setA(EMPTY); setAdded(false); setSaved('idle'); setStep(0); }}>انجام دوباره</button>
          </div>
        </div>
        {saved === 'saved' && <p role="status" style="margin:0;font-size:14px">روتین شما در <a href="/account/routine" style="text-decoration:underline;font-weight:600">حساب کاربری</a> ذخیره شد.</p>}
        {saved === 'error' && <p role="alert" class="err-t" style="margin:0;font-size:14px">ذخیره انجام نشد. لطفاً دوباره تلاش کنید.</p>}
        <p style="margin:0;font-size:14px;color:#3A3A3A">سؤالی دارید؟ <a href="/consultation" style="text-decoration:underline;font-weight:600">با کارشناس پوست ما صحبت کنید</a> — رایگان.</p>
      </div>
    </section>
  );
}
