import { useState } from 'preact/hooks';
import { addToCart } from '~/scripts/store';
import { buildRoutine } from '~/lib/routine';

type Item = { variantId: number; nameEn: string; role: string; price: number };
type Props = { products: Record<string, Item>; goals: { id: string; label: string }[] };

const SKINS = [['dry', 'خشک'], ['oily', 'چرب'], ['combination', 'مختلط'], ['sensitive', 'حساس'], ['normal', 'نرمال']];
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => FA[Number(d)]);
const money = (n: number) => fa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';

export default function RoutineBuilder({ products, goals }: Props) {
  const [skin, setSkin] = useState('combination');
  const [goal, setGoal] = useState('acne');
  const [busy, setBusy] = useState(false);

  const r = buildRoutine(skin, goal);
  const am = r.am.map((slug) => products[slug]).filter(Boolean);
  const pm = r.pm.map((slug) => products[slug]).filter(Boolean);
  const uniq = [...new Set([...r.am, ...r.pm])].map((slug) => products[slug]).filter(Boolean);
  const total = uniq.reduce((n, p) => n + p.price, 0);
  const note = r.pm.includes('retinal-0-1-emulsion')
    ? 'رتینال را فقط شب و دو تا سه شب در هفته شروع کنید و کم‌کم افزایش دهید. صبح‌ها ضدآفتاب ضروری است.'
    : 'ترتیب لایه‌گذاری: شوینده، سپس سرم (رقیق‌ترین بافت)، بعد مرطوب‌کننده و در صبح، ضدآفتاب به‌عنوان آخرین لایه.';

  const steps = (list: Item[]) => (
    <ol style="list-style:none;margin:0;padding:0">
      {list.map((p, i) => (
        <li key={i} style="display:flex;gap:14px;padding:12px 0;border-top:1px solid #EFEFED">
          <span style="flex:0 0 26px;height:26px;border:1px solid #111111;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">{fa(i + 1)}</span>
          <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
            <span style="font-size:12px;color:#5C5C5C">{p.role}</span>
            <span class="en r" style="font-size:14px;font-weight:600">{p.nameEn}</span>
          </span>
        </li>
      ))}
    </ol>
  );

  return (
    <div class="wrap" style="padding-top:88px;padding-bottom:88px;display:flex;flex-wrap:wrap;gap:48px;align-items:flex-start">
      <div style="flex:1 1 400px;min-width:0;display:flex;flex-direction:column;gap:22px">
        <p class="kicker">روتین‌ساز · ۶۰ ثانیه</p>
        <h2 id="reg-h" style="margin:0;font-size:clamp(32px,3.6vw,50px);font-weight:800;line-height:1.3;letter-spacing:-.02em">روتین صبح و شب شما، بر اساس علم.</h2>
        <p style="margin:0;max-width:460px;font-size:15px;line-height:2;color:#3A3A3A">دو سؤال جواب دهید؛ روتین پیشنهادی همراه با ترتیب درست لایه‌گذاری را می‌بینید. قانون ساده: از رقیق‌ترین بافت به غلیظ‌ترین.</p>
        <fieldset style="border:0;padding:0;margin:0">
          <legend style="padding:0;margin-bottom:12px;font-size:14px;font-weight:700">۱. نوع پوست شما</legend>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            {SKINS.map(([id, label]) => <button type="button" class="chip" aria-pressed={skin === id} onClick={() => setSkin(id)}>{label}</button>)}
          </div>
        </fieldset>
        <fieldset style="border:0;padding:0;margin:0">
          <legend style="padding:0;margin-bottom:12px;font-size:14px;font-weight:700">۲. مهم‌ترین نگرانی شما</legend>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            {goals.map((g) => <button type="button" class="chip" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>{g.label}</button>)}
          </div>
        </fieldset>
      </div>

      <div style="flex:1 1 560px;min-width:0;background:#FFFFFF;border:1px solid #E5E5E3;padding:clamp(22px,3vw,36px)" aria-live="polite">
        <p style="margin:0;padding-bottom:18px;border-bottom:1px solid #111111;font-size:20px;font-weight:700">
          روتین پیشنهادی: پوست {SKINS.find((s) => s[0] === skin)![1]} · {r.goal.label}
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:28px;padding:20px 0">
          <div><p style="margin:0 0 8px;font-size:14px;font-weight:700">صبح</p>{steps(am)}</div>
          <div><p style="margin:0 0 8px;font-size:14px;font-weight:700">شب</p>{steps(pm)}</div>
        </div>
        <p style="margin:0 0 18px;padding:12px 14px;background:#F4F4F2;font-size:13px;line-height:1.9;color:#3A3A3A">{note}</p>
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding-top:18px;border-top:1px solid #E5E5E3">
          <p style="margin:0;font-size:14px;color:#5C5C5C">{fa(uniq.length)} محصول · <span style="color:#111111;font-weight:700">{money(total)}</span></p>
          <button type="button" class="btn btn-dark" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await addToCart(uniq.map((p) => ({ variantId: p.variantId, qty: 1 })), 'روتین پیشنهادی به سبد اضافه شد'); } finally { setBusy(false); }
          }}>افزودن کل روتین به سبد</button>
          <a class="btn btn-line" href="/quiz">تست کامل پوست</a>
        </div>
      </div>
    </div>
  );
}
