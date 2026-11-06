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
