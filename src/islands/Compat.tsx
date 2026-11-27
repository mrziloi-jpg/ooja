import { useState } from 'preact/hooks';
import { MATRIX, rel, VERDICT, type Rel } from '~/lib/ingredients';

type Ing = { slug: string; nameEn: string; nameFa: string };
type Props = { ingredients: Ing[]; initialA?: string; initialB?: string; showMatrix?: boolean };

const STYLE: Record<Rel, { bg: string; fg: string; dot: string }> = {
  ok: { bg: '#111111', fg: '#FFFFFF', dot: 'ok' },
  alt: { bg: '#F4F4F2', fg: '#111111', dot: 'alt' },
  no: { bg: '#FFFFFF', fg: '#111111', dot: 'no' },
  same: { bg: '#F4F4F2', fg: '#111111', dot: 'alt' },
};

/** "Can I use these two together?" picker, plus the clickable matrix on the glossary page. */
export default function Compat({ ingredients, initialA = 'retinal', initialB = 'vitc', showMatrix = true }: Props) {
  const has = (s: string) => ingredients.some((i) => i.slug === s);
  const [a, setA] = useState(has(initialA) ? initialA : ingredients[0]?.slug);
  const [b, setB] = useState(has(initialB) ? initialB : ingredients[1]?.slug);
  const r = rel(a, b);
  const v = VERDICT[r];
  const st = STYLE[r];
  const by = (s: string) => ingredients.find((i) => i.slug === s);
  const matrix = MATRIX.filter(has);

  return (
    <div style="display:flex;flex-direction:column;gap:28px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
        <label style="flex:1 1 220px;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600">ترکیب اول
          <select class="input" value={a} onChange={(e) => setA((e.target as HTMLSelectElement).value)}>
            {ingredients.map((i) => <option value={i.slug}>{i.nameFa}</option>)}
          </select>
        </label>
        <span aria-hidden="true" style="font-size:22px;padding-bottom:12px">+</span>
        <label style="flex:1 1 220px;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600">ترکیب دوم
          <select class="input" value={b} onChange={(e) => setB((e.target as HTMLSelectElement).value)}>
            {ingredients.map((i) => <option value={i.slug}>{i.nameFa}</option>)}
          </select>
        </label>
        <div role="status" aria-live="polite" style={`flex:2 1 360px;min-height:50px;padding:12px 16px;background:${st.bg};color:${st.fg};display:flex;align-items:center;gap:12px;border:1px solid #111111`}>
          <span class={`dot ${st.dot}`} aria-hidden="true" style={`border-color:${st.fg}`} />
          <span style="display:flex;flex-direction:column;gap:2px"><strong style="font-size:15px">{v.title}</strong><span style="font-size:13px;line-height:1.8">{v.text}</span></span>
        </div>
      </div>

      {showMatrix && matrix.length > 1 && (
        <>
          <div style="overflow-x:auto;border:1px solid #E5E5E3">
            <table style="border-collapse:collapse;width:100%;min-width:760px;font-size:13px">
              <caption style="text-align:right;padding:14px 16px;font-size:14px;font-weight:700;caption-side:top">جدول سازگاری — روی هر خانه بزنید</caption>
              <thead>
                <tr>
                  <th scope="col" style="padding:10px;border-top:1px solid #E5E5E3;background:#F4F4F2"><span class="sr-only">ترکیب</span></th>
                  {matrix.map((s) => <th scope="col" class="en" style="padding:10px;border-top:1px solid #E5E5E3;border-inline-start:1px solid #E5E5E3;background:#F4F4F2;font-weight:600">{by(s)!.nameEn}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr>
                    <th scope="row" class="en r" style="padding:10px 14px;border-top:1px solid #E5E5E3;font-weight:600;background:#F4F4F2">{by(row)!.nameEn}</th>
                    {matrix.map((col) => {
                      const k = rel(row, col);
                      const picked = (a === row && b === col) || (a === col && b === row);
                      return (
                        <td style={`border-top:1px solid #E5E5E3;border-inline-start:1px solid #E5E5E3;padding:0;background:${picked ? '#EBEBE8' : k === 'same' ? '#F4F4F2' : '#FFFFFF'}`}>
                          <button type="button" class="cell" aria-pressed={picked} aria-label={`${by(row)!.nameFa} و ${by(col)!.nameFa}: ${k === 'same' ? 'همان ترکیب' : VERDICT[k].title}`} onClick={() => { setA(row); setB(col); }}>
                            {k !== 'same' && <span class={`dot ${k}`} aria-hidden="true" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:24px;font-size:13px">
            <span style="display:inline-flex;align-items:center;gap:8px"><span class="dot ok" aria-hidden="true" />با هم سازگارند</span>
            <span style="display:inline-flex;align-items:center;gap:8px"><span class="dot alt" aria-hidden="true" />یکی صبح، دیگری شب</span>
            <span style="display:inline-flex;align-items:center;gap:8px"><span class="dot no" aria-hidden="true" />با احتیاط؛ شب‌های جداگانه</span>
          </div>
        </>
      )}
    </div>
  );
}
