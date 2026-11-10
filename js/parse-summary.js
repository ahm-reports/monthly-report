// استيراد الملخص السنوي — بدون DOM.
// صف عناوين الأشهر: أول صف بيه نصوص بأعمدة القيم. أعمدة القيم B, D, F, ... X (كانون الثاني ← كانون الأول)
// ونعتمد على ترتيب الأعمدة مو على نص العناوين. البنود بأقسامها النهائية، فما نطبق movedFrom.
import { normalizeArabic, parseNumber, aliasIndex } from './normalize.js';
import { readFileRows } from './xlsx.js';

export const VALUE_COLUMNS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]; // B..X (من الصفر)
const OTHER_REVENUE = new Set(['ايرادات مختلفه', 'الايرادات المختلفه', 'ايرادات اخري'].map(normalizeArabic));

// من اسم الملف: report1-history-2026-01-09.xlsx ← { year: 2026, fromMonth: 1, toMonth: 9 }
export function rangeFromFileName(name) {
  const m = String(name || '').match(/(20\d{2})[-_ .](\d{1,2})[-_ .](\d{1,2})/);
  if (!m) return {};
  const [y, a, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a >= 1 && b <= 12 && a <= b ? { year: y, fromMonth: a, toMonth: b } : { year: y };
}

export async function parseSummaryExcel(file, template, opts = {}) {
  const { rows, firstRow } = await readFileRows(file);
  return parseSummaryRows(rows, template, { ...rangeFromFileName(file.name), ...opts, firstRow });
}

// opts: { year, fromMonth = 1, toMonth = 12, today = new Date(), firstRow = 1 }
export function parseSummaryRows(rows, template, opts = {}) {
  const { firstRow = 1, fromMonth = 1 } = opts;
  const today = opts.today || new Date();
  const year = opts.year || today.getFullYear();
  // الأشهر اللي بعد الشهر الحالي ما صارت بعد
  const lastPossible = year < today.getFullYear() ? 12 : year > today.getFullYear() ? 0 : today.getMonth() + 1;
  const toMonth = Math.min(opts.toMonth || 12, lastPossible);

  const index = aliasIndex(template, 'summaryAliases');
  const byKey = new Map(template.items.map(it => [it.key, it]));
  const headerIdx = rows.findIndex(r => r && VALUE_COLUMNS.slice(0, 3).every(c => typeof r[c] === 'string' && r[c].trim()));
  const warnings = [];
  if (headerIdx === -1) warnings.push({ type: 'header', text: 'ما لكيت صف عناوين الأشهر. نكمل على ترتيب الأعمدة B, D, F…' });

  const perMonth = VALUE_COLUMNS.map(() => ({ values: {}, other_revenue: 0, hasData: false }));
  const found = new Set();
  const ignoredRows = [];

  rows.forEach((row, i) => {
    if (!row || i <= headerIdx) return;
    const name = normalizeArabic(row[0]);
    if (!name) return;
    const nums = VALUE_COLUMNS.map(c => parseNumber(row[c]));
    const isOther = OTHER_REVENUE.has(name);
    const key = isOther ? null : index.get(name);
    if (!isOther && !key) {
      if (nums.some(n => n !== null)) ignoredRows.push({ name: String(row[0]).trim(), row: firstRow + i });
      return;                                      // عناوين أو مجاميع أو نسب
    }
    if (key && found.has(key)) { warnings.push({ type: 'duplicate', text: `البند "${byKey.get(key).label}" تكرر بالملف (الصف ${firstRow + i}). أخذنا أول صف.` }); return; }
    if (key) found.add(key);
    nums.forEach((n, m) => {
      if (n === null) return;
      perMonth[m].hasData = true;
      if (isOther) perMonth[m].other_revenue += n;
      else perMonth[m].values[key] = n;
    });
  });

  const months = [], ignoredColumns = [];
  perMonth.forEach((pm, m) => {
    const monthNo = m + 1;
    if (!pm.hasData) return;                       // عمود فارغ: شهر ما صار بعد
    if (monthNo < fromMonth || monthNo > toMonth) { ignoredColumns.push(monthNo); return; }
    const values = {};
    for (const it of template.items) values[it.key] = pm.values[it.key] ?? 0;
    months.push({ id: `${year}-${String(monthNo).padStart(2, '0')}`, month: monthNo, values, other_revenue: pm.other_revenue });
  });
  if (ignoredColumns.length) warnings.push({ type: 'columns', months: ignoredColumns, text: `تجاهلنا أرقام بأعمدة أشهر خارج المدى (${ignoredColumns.join('، ')}).` });

  const missingItems = template.items.filter(it => !found.has(it.key)).map(it => it.key);
  if (missingItems.length) warnings.push({ type: 'missing', keys: missingItems, text: 'بنود القالب اللي ما لكيتها بالملف (قيمتها 0): ' + missingItems.map(k => byKey.get(k).label).join('، ') });

  return { year, months, warnings, ignoredRows, missingItems };
}
