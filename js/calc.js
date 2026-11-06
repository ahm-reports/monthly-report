// الحسابات — بدون أي DOM. كل المجاميع والنسب والأرباح تنحسب من هنا فقط.
export const SECTIONS = ['sales', 'purchases', 'expenses'];
export const SECTION_LABELS = { sales: 'المبيعات', purchases: 'المشتريات', expenses: 'المصاريف' };

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

export function sectionTotal(month, template, section) {
  const values = (month && month.values) || {};
  return template.items.filter(it => it.section === section).reduce((a, it) => a + n(values[it.key]), 0);
}

// calcMonth(month, template, settings)
//   month: { values: {key: number}, other_revenue }   template: { items, fixedKeys }   settings: { feeRate }
export function calcMonth(month, template, settings = {}) {
  const feeRate = typeof settings.feeRate === 'number' ? settings.feeRate : 0.10;
  const S = sectionTotal(month, template, 'sales');
  const P = sectionTotal(month, template, 'purchases');
  const E = sectionTotal(month, template, 'expenses');
  const O = n(month && month.other_revenue);
  const G = S - P - E;
  const G2 = G + O;
  const F = Math.max(G2, 0) * feeRate;
  const N = G2 - F;
  const ratio = (x) => (S ? x / S : null);
  return {
    S, P, E, O, G, G2, F, N, feeRate,
    foodCost: ratio(P), expenseRatio: ratio(E), grossMargin: ratio(G2), netMargin: ratio(N),
  };
}

// النمو = (الشهر ÷ الشهر السابق) − 1. null إذا السابق صفر أو ناقص أو ما موجود.
export function growth(cur, prev) {
  if (prev === null || prev === undefined || !(prev > 0) || typeof cur !== 'number') return null;
  return cur / prev - 1;
}

export function itemsOf(template, section) { return template.items.filter(it => it.section === section && !it.hidden); }

// نقطة التعادل = الثابت ÷ (1 − (P + E − الثابت) ÷ S)، والثابت = مجموع fixedKeys.
// يرجع { fixed, value } — value = null إذا المقام صفر أو سالب أو ماكو مبيعات.
export function breakEven(month, template, c = calcMonth(month, template)) {
  const values = month.values || {};
  const fixed = (template.fixedKeys || []).reduce((a, k) => a + n(values[k]), 0);
  if (!c.S) return { fixed, value: null };
  const den = 1 - (c.P + c.E - fixed) / c.S;
  return { fixed, value: den > 0 ? fixed / den : null };
}

// ملاحظات تلقائية للشهر رقم i من مصفوفة أشهر مرتبة. names: أسماء الأشهر للعرض.
// كل ملاحظة: { tag, text }. بدون DOM.
export function insights(months, i, template, settings, { names = [], fmtMil = (x) => (x / 1e6).toFixed(1), fmtPct = (x) => (x * 100).toFixed(1) + '%' } = {}) {
  const out = [];
  const m = months[i], prev = i > 0 ? months[i - 1] : null;
  if (!m) return out;
  const c = calcMonth(m, template, settings);
  const name = (k) => names[k] || months[k]?.id || '';

  if (prev) {
    let best = null;
    for (const it of itemsOf(template, 'sales')) {
      const r = growth(n(m.values[it.key]), n(prev.values[it.key]));
      if (r !== null && (!best || Math.abs(r) > Math.abs(best.r))) best = { it, r };
    }
    if (best) out.push({ tag: 'أكبر تغير بالمبيعات', text: `${best.it.label} ${best.r >= 0 ? 'ارتفع' : 'نزل'} ${fmtPct(Math.abs(best.r))} عن ${name(i - 1)}، من ${fmtMil(n(prev.values[best.it.key]))} إلى ${fmtMil(n(m.values[best.it.key]))} مليون.` });
  }

  const be = breakEven(m, template, c);
  const fixedLabels = (template.fixedKeys || []).map(k => template.items.find(it => it.key === k)?.label).filter(Boolean).join(' و');
  if (!c.S) out.push({ tag: 'نقطة التعادل (تقديرية)', text: 'ماكو مبيعات بهذا الشهر، فما ممكن حساب نقطة التعادل.' });
  else if (be.value === null) out.push({ tag: 'نقطة التعادل (تقديرية)', text: 'الكلف المتغيرة أعلى من المبيعات، فما ممكن الوصول للتعادل بهاي النسب.' });
  else out.push({ tag: 'نقطة التعادل (تقديرية)', text: `${fixedLabels || 'الكلف الثابتة'} ${fmtMil(be.fixed)} مليون ثابتة. حتى تغطي كل التكاليف تحتاج مبيعات بحدود ${fmtMil(be.value)} مليون، وإنت بعت ${fmtMil(c.S)} مليون.` });

  const sal = template.items.find(it => it.key === 'salaries');
  if (sal && c.S) {
    const costs = template.items.filter(it => it.section !== 'sales').map(it => ({ it, v: n(m.values[it.key]) })).sort((a, b) => b.v - a.v);
    const top = costs[0] && costs[0].it.key === 'salaries';
    out.push({ tag: sal.label, text: `${sal.label} تشكل ${fmtPct(n(m.values.salaries) / c.S)} من المبيعات${top ? '، وهي أكبر بند كلفة' : ''}.` });
  }

  const year = String(m.id || '').slice(0, 4);
  const ytd = months.slice(0, i + 1).filter(x => String(x.id || '').slice(0, 4) === year);
  if (ytd.length) {
    const nets = ytd.map(x => ({ x, N: calcMonth(x, template, settings).N }));
    const total = nets.reduce((a, b) => a + b.N, 0);
    const best = nets.reduce((a, b) => (b.N > a.N ? b : a));
    const bestIdx = months.indexOf(best.x);
    out.push({ tag: 'من بداية السنة', text: ytd.length === 1
      ? `هذا أول شهر محفوظ لسنة ${year}، وصافيه ${fmtMil(total)} مليون.`
      : `مجموع الربح الصافي لحد ${name(i)} هو ${fmtMil(total)} مليون، وأفضل شهر كان ${name(bestIdx)} بـ ${fmtMil(best.N)} مليون.` });
  }
  return out;
}
