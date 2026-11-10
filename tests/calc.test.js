// اختبارات calc.js — أرقام صغيرة مصنوعة يدوياً، بدون أي بيانات حقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcMonth, growth, breakEven, insights } from '../js/calc.js';

const T = {
  items: [
    { key: 'a', label: 'صالة', section: 'sales' }, { key: 'b', label: 'سفري', section: 'sales' },
    { key: 'p', label: 'لحوم', section: 'purchases' },
    { key: 'salaries', label: 'رواتب', section: 'expenses' }, { key: 'rent', label: 'إيجارات', section: 'expenses' }, { key: 'x', label: 'متنوعة', section: 'expenses' },
  ],
  fixedKeys: ['salaries', 'rent'],
};
const M = (id, a, b, p, s, r, x, o = 0) => ({ id, values: { a, b, p, salaries: s, rent: r, x }, other_revenue: o });

test('calcMonth: الصيغ', () => {
  const c = calcMonth(M('2026-01', 600, 400, 300, 200, 100, 50, 50), T, { feeRate: 0.1 });
  assert.equal(c.S, 1000); assert.equal(c.P, 300); assert.equal(c.E, 350);
  assert.equal(c.G, 350); assert.equal(c.G2, 400); assert.equal(c.F, 40); assert.equal(c.N, 360);
  assert.equal(c.foodCost, 0.3); assert.equal(c.netMargin, 0.36);
});

test('calcMonth: feeRate الافتراضي 10% وبنود ناقصة = 0', () => {
  const c = calcMonth({ values: { a: 100 } }, T);
  assert.equal(c.F, 10); assert.equal(c.N, 90); assert.equal(c.O, 0);
});

test('calcMonth: القسم يجي من القالب وقت الحساب', () => {
  const m = M('2026-01', 1000, 0, 0, 0, 0, 100);
  const T2 = { ...T, items: T.items.map(i => i.key === 'x' ? { ...i, section: 'purchases' } : i) };
  assert.equal(calcMonth(m, T).E, 100);
  assert.equal(calcMonth(m, T2).P, 100);
});

test('growth: الشهر السابق صفر أو ناقص أو ما موجود = null', () => {
  assert.equal(growth(110, 100).toFixed(2), '0.10');
  assert.equal(growth(5, 0), null); assert.equal(growth(5, -3), null); assert.equal(growth(5, null), null); assert.equal(growth(5, undefined), null);
});

test('breakEven', () => {
  const m = M('2026-01', 1000, 0, 300, 200, 100, 0);
  const be = breakEven(m, T);
  assert.equal(be.fixed, 300);
  assert.ok(Math.abs(be.value - 300 / (1 - 300 / 1000)) < 1e-9);
  assert.equal(breakEven(M('2026-01', 100, 0, 150, 0, 0, 0), T).value, null, 'المقام سالب');
  assert.equal(breakEven(M('2026-01', 0, 0, 0, 0, 0, 0), T).value, null, 'ماكو مبيعات');
});

test('insights: شهر واحد بدون أخطاء، وشهرين بأكبر تغير', () => {
  const one = insights([M('2026-10', 600, 400, 300, 200, 100, 50)], 0, T, {}, { names: ['ت1'] });
  assert.ok(!one.some(n => n.tag === 'أكبر تغير بالمبيعات'));
  assert.ok(one.some(n => n.tag === 'من بداية السنة'));
  const two = insights([M('2026-09', 500, 400, 0, 0, 0, 0), M('2026-10', 600, 200, 0, 0, 0, 0)], 1, T, {}, { names: ['أيلول', 'ت1'] });
  assert.match(two[0].text, /^سفري نزل 50.0%/);
  const loss = insights([M('2026-10', 100, 0, 150, 10, 10, 0)], 0, T, {});
  assert.match(loss.find(n => n.tag.startsWith('نقطة')).text, /الكلف المتغيرة أعلى من المبيعات/);
});
