// اختبارات القراءة والحسابات على ملفات test-data (ما تنرفع للـ repo).
//   npm install --prefix tests && npm test
// إذا ملفات test-data ما موجودة، اختبارات الملفات تتخطى.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { calcMonth } from '../js/calc.js';
import { parseRawRows, resolveUnknown } from '../js/parse-raw.js';
import { parseSummaryRows, rangeFromFileName } from '../js/parse-summary.js';

const require = createRequire(new URL('./package.json', import.meta.url));
const XLSX = require('xlsx');
const DATA = new URL('../test-data/', import.meta.url);
const tpl = (id) => JSON.parse(readFileSync(new URL(`../templates/${id}.json`, import.meta.url), 'utf8'));
const has = (f) => existsSync(new URL(f, DATA));
const expected = has('expected.json') ? JSON.parse(readFileSync(new URL('expected.json', DATA), 'utf8')) : null;

function rowsOf(file) {
  const wb = XLSX.read(readFileSync(new URL(file, DATA)), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref']); range.s.c = 0;
  return { rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range }), firstRow: range.s.r + 1 };
}
const near = (a, b, msg, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);
const skip = (f) => !expected || !has(f) ? 'ملف الاختبار غير موجود' : false;

test('1. تقرير 1 — القالب الخام لتشرين الأول', { skip: skip('report1-raw-oct.xlsx') }, () => {
  const e = expected.report1_raw, t = tpl('report1');
  const { rows, firstRow } = rowsOf(e.file);
  const r = parseRawRows(rows, t, { firstRow });
  const c = calcMonth({ values: r.values, other_revenue: 0 }, t, { feeRate: 0.10 });
  near(c.S, e.S, 'المبيعات'); near(c.P, e.P, 'المشتريات'); near(c.E, e.E, 'المصاريف');
  near(c.G, e.G, 'الربح الإجمالي'); near(c.N, e.N, 'الربح الصافي');
  assert.equal(r.values.electricity, 0);
  assert.equal(r.flags.electricity.missing, true, 'الكهرباء لازم تتأشر ناقص');
  assert.deepEqual(r.unknown, [], 'ماكو بنود غير معروفة');
  for (const ch of r.checks) { assert.ok(ch.ok, `تحقق ${ch.label}`); near(ch.fileTotal, e.checks[ch.section], `عنوان ${ch.label}`); }
  assert.equal(r.warnings.length, 0, 'ما يطلع أي تحذير: ' + JSON.stringify(r.warnings));
  for (const k of ['gas', 'charcoal', 'travel_cleaning']) assert.equal(r.flags[k].movedFrom, 'purchases', `${k} منقول من المشتريات`);
});

test('2. تقرير 2 — القالب الخام لتشرين الأول (شهر خسارة)', { skip: skip('report2-raw-oct.xlsx') }, () => {
  const e = expected.report2_raw, t = tpl('report2');
  const { rows, firstRow } = rowsOf(e.file);
  const r = parseRawRows(rows, t, { firstRow });
  const c = calcMonth({ values: r.values, other_revenue: 0 }, t, { feeRate: 0.10 });
  near(c.S, e.S, 'المبيعات'); near(c.P, e.P, 'المشتريات'); near(c.E, e.E, 'المصاريف');
  near(c.G, e.G, 'الربح الإجمالي'); near(c.F, e.F, 'نسبة الإدارة'); near(c.N, e.N, 'الربح الصافي');
  assert.deepEqual(r.unknown, [], 'الصفين الفارغين يتجاهلون وماكو بنود غير معروفة');
  assert.ok(!r.flags.electricity.missing, 'الكهرباء بيها صفر مكتوب، مو ناقصة');
  near(r.checks.find(x => x.section === 'purchases').fileTotal, e.checks.purchases, 'عنوان المشتريات');
  near(r.checks.find(x => x.section === 'expenses').fileTotal, e.checks.expenses, 'عنوان المصاريف');
  assert.ok(r.checks.every(x => x.ok), 'المجاميع مطابقة');
});

test('3. المطابقة الكاملة: المصاريف المتنوعة ما تنخلط', () => {
  const t = tpl('report1');
  const rows = [
    ['الإيرادات', 0], ['مشتريات', 300],
    ['مشتريات متنوعة للمطبخ', 100],
    ['المصاريف الكلية', 30],
    ['مصاريف متنوعة للمطبخ', 10], ['مصاريف متنوعة', 20],
  ];
  const r = parseRawRows(rows, t);
  assert.equal(r.values.kitchen, 100);
  assert.equal(r.values.kitchen_misc, 10);
  assert.equal(r.values.misc, 20);
  assert.deepEqual(r.unknown, []);
  // "يحتوي على" ممنوع: اسم أطول ما يتطابق
  const r2 = parseRawRows([['المصاريف الكلية', 5], ['مصاريف متنوعة للمطبخ الجديد', 5]], t);
  assert.equal(r2.unknown.length, 1);
  assert.equal(r2.values.kitchen_misc, 0);
});

test('3ب. التطبيع والأرقام النصية والبند غير المعروف', () => {
  const t = tpl('report1');
  const rows = [
    ['الإيـــرادات', '1,000'], ['  الطابق   الأرضي ', '1,000 د.ع'],
    ['مشتريات', 7], ['شي جديد', 7],
    [null, 5], ['المصاريف الكلية', 0],
  ];
  const r = parseRawRows(rows, t);
  assert.equal(r.values.ground_cash, 1000);
  assert.equal(r.unknown.length, 1);
  assert.equal(r.flags.chicken.notInFile, true);
  assert.ok(r.checks.every(x => x.ok));
  const { result, template } = resolveUnknown(r, t, 'شي جديد', 'chicken');
  assert.equal(result.values.chicken, 7);
  assert.equal(result.unknown.length, 0);
  assert.ok(template.items.find(i => i.key === 'chicken').rawAliases.includes('شي جديد'));
  assert.equal(parseRawRows([['شي جديد', 3]], template).values.chicken, 3, 'يتعرف عليه بالمرة الجاية');
});

test('3د. اسم البند مكتوب رقم', () => {
  const t = tpl('report2');
  const rows = [
    ['الإيرادات', 100], ['بيع السفري', 100],
    ['مشتريات', 75], ['مشتريات مطبخ', 50],
    [0, 0], [0, null], [12, ''], ['0', '0'],             // تتجاهل مثل الصفوف الفارغة
    [0, 25],                                              // رقم بمكان الاسم ومبلغ مو صفر
    ['المصاريف الكلية', 0],
  ];
  const r = parseRawRows(rows, t);
  assert.deepEqual(r.unknown, [], 'ما يطلع بقائمة البنود غير المعروفة');
  const w = r.warnings.filter(x => x.type === 'numericName');
  assert.equal(w.length, 1);
  assert.equal(w[0].row, 9);
  assert.match(w[0].text, /^الصف 9: اسم البند مكتوب رقم، صححه بالملف/);
  assert.equal(r.values.kitchen, 50, 'المبلغ ما ينضاف لأي بند');
  assert.ok(r.checks.find(c => c.section === 'purchases').ok, 'تحقق المجاميع يحسب الصف حتى يطابق الملف');
  assert.equal(r.readCount, 2);
});

test('3ج. تحذير المجاميع إذا الفرق أكثر من 1', () => {
  const r = parseRawRows([['الإيرادات', 100], ['بيع السفري', 98]], tpl('report1'));
  const s = r.checks.find(x => x.section === 'sales');
  assert.equal(s.ok, false); assert.equal(s.diff, -2);
  assert.ok(r.warnings.some(w => w.type === 'total' && w.section === 'sales'));
});

test('4. الملخص السنوي لتقرير 1: 9 أشهر بالضبط', { skip: skip('report1-history-2026-01-09.xlsx') }, () => {
  const e = expected.report1_summary, t = tpl('report1');
  const { rows, firstRow } = rowsOf(e.file);
  const opts = { ...rangeFromFileName(e.file), firstRow, today: new Date('2026-11-06') };
  const s = parseSummaryRows(rows, t, opts);
  assert.equal(s.months.length, e.count);
  assert.deepEqual(s.months.map(m => m.id), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  for (const [id, x] of Object.entries(e.months)) {
    const m = s.months.find(mm => mm.id === id);
    const c = calcMonth(m, t, { feeRate: 0.10 });
    assert.equal(Math.round(c.S), x.S, id + ' مبيعات'); assert.equal(Math.round(c.P), x.P, id + ' مشتريات');
    assert.equal(Math.round(c.E), x.E, id + ' مصاريف'); assert.equal(Math.round(c.O), x.O, id + ' إيرادات مختلفة');
    assert.equal(Math.round(c.N), x.N, id + ' صافي');
  }
  assert.deepEqual(s.missingItems, []);
  // عمود بعد أيلول بيه أرقام يتجاهل
  const extra = rows.map((r, i) => { if (!r || i < 7) return r; const c = [...r]; if (typeof c[1] === 'number') c[19] = 123; return c; });
  const s2 = parseSummaryRows(extra, t, opts);
  assert.equal(s2.months.length, 9);
  assert.ok(s2.warnings.some(w => w.type === 'columns'));
});

test('5. شهر واحد وشهر خسارة: الحسابات ما تنكسر', () => {
  const t = tpl('report2');
  const c0 = calcMonth({ values: {}, other_revenue: 0 }, t, {});
  assert.equal(c0.S, 0); assert.equal(c0.foodCost, null); assert.equal(c0.F, 0);
  const c = calcMonth({ values: { ground_food: 100, kitchen: 50, rent: 80 }, other_revenue: 10 }, t, { feeRate: 0.1 });
  assert.equal(c.G, -30); assert.equal(c.G2, -20); assert.equal(c.F, 0); assert.equal(c.N, -20);
});
