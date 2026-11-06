// قراءة القالب الخام الشهري — بدون DOM.
// شكل الملف: ورقة وحدة، العمود A أسماء البنود والعمود B المبالغ.
// صفوف العناوين: "الإيرادات" ← المبيعات، "مشتريات" ← المشتريات، "المصاريف الكلية" ← المصاريف.
// صف العنوان بيه مجموع القسم بالعمود B.
import { normalizeArabic, parseNumber, aliasIndex } from './normalize.js';
import { readFileRows } from './xlsx.js';

export const RAW_HEADERS = {
  sales: ['الإيرادات', 'ايرادات', 'المبيعات'],
  purchases: ['مشتريات', 'المشتريات'],
  expenses: ['المصاريف الكلية', 'مصاريف كلية', 'المصاريف'],
};
const HEADER_INDEX = new Map(Object.entries(RAW_HEADERS).flatMap(([s, names]) => names.map(n => [normalizeArabic(n), s])));
export const SECTION_FILE_LABELS = { sales: 'الإيرادات', purchases: 'المشتريات', expenses: 'المصاريف' };

// الملف: File من المتصفح
export async function parseRawExcel(file, template) {
  const { rows, firstRow } = await readFileRows(file);
  return parseRawRows(rows, template, { firstRow });
}

// rows: [[A, B, ...], ...]
export function parseRawRows(rows, template, { firstRow = 1 } = {}) {
  const index = aliasIndex(template, 'rawAliases');
  const byKey = new Map(template.items.map(it => [it.key, it]));
  const values = {};
  const flags = {};            // key → { rawName, row, fileSection, missing, notInFile, movedFrom, duplicate }
  const unknown = [];          // { name, value, row, section }
  const headers = {};          // section → { total, row }
  const warnings = [];
  const fileSums = { sales: 0, purchases: 0, expenses: 0 };
  let section = null, readCount = 0;

  rows.forEach((row, i) => {
    const rowNo = firstRow + i;
    const rawName = row?.[0];
    const name = normalizeArabic(rawName);
    if (!name) return;                                   // صف بلا اسم يتجاهل حتى لو بيه رقم
    const num = parseNumber(row?.[1]);

    const head = HEADER_INDEX.get(name);
    if (head) {
      section = head;
      headers[head] = { total: num, row: rowNo, name: String(rawName).trim() };
      return;
    }
    readCount++;
    if (section) fileSums[section] += num ?? 0;

    const key = index.get(name);                          // مطابقة كاملة بعد التطبيع فقط
    if (!key) { unknown.push({ name: String(rawName).trim(), value: num ?? 0, row: rowNo, section }); return; }

    const item = byKey.get(key);
    if (flags[key]) {                                     // نفس البند تكرر بالملف: نجمعه وننبّه
      flags[key].duplicate = true;
      values[key] += num ?? 0;
      warnings.push({ type: 'duplicate', key, row: rowNo, text: `البند "${item.label}" تكرر بالملف (الصف ${rowNo})، وانجمعت قيمته.` });
      return;
    }
    values[key] = num ?? 0;
    flags[key] = { rawName: String(rawName).trim(), row: rowNo, fileSection: section };
    if (num === null) flags[key].missing = true;          // موجود بالملف بس بلا رقم
    const from = section && section !== item.section ? section : (item.movedFrom || null);
    if (from && from !== item.section) flags[key].movedFrom = from;
  });

  for (const it of template.items) {                      // بند القالب اللي ما موجود بالملف أصلاً
    if (!(it.key in values)) { values[it.key] = 0; flags[it.key] = { notInFile: true }; }
  }

  const checks = ['sales', 'purchases', 'expenses'].map(s => {
    const h = headers[s];
    const fileTotal = h ? h.total : null;
    const itemsTotal = fileSums[s];
    const diff = fileTotal === null ? null : itemsTotal - fileTotal;
    return { section: s, label: SECTION_FILE_LABELS[s], found: !!h, fileTotal, itemsTotal, diff, ok: diff !== null && Math.abs(diff) <= 1 };
  });
  for (const c of checks) {
    if (!c.found) warnings.push({ type: 'header', section: c.section, text: `ما لكيت صف عنوان قسم ${c.label} بالملف.` });
    else if (c.fileTotal === null) warnings.push({ type: 'total', section: c.section, text: `صف عنوان ${c.label} ما بيه مجموع، فما كدرت أتحقق منه.` });
    else if (!c.ok) warnings.push({ type: 'total', section: c.section, diff: c.diff, text: `مجموع بنود ${c.label} بالملف يختلف عن رقم العنوان بـ ${Math.round(c.diff).toLocaleString('en-US')}.` });
  }

  return { values, flags, unknown, checks, warnings, readCount };
}

// المستخدم اختار مفتاح لبند غير معروف: نضيف قيمته للبند، ونرجع القالب بعد إضافة الاسم لـ rawAliases.
export function resolveUnknown(result, template, unknownName, key) {
  const u = result.unknown.find(x => x.name === unknownName);
  if (!u) return { result, template };
  const values = { ...result.values, [key]: (result.flags[key]?.notInFile ? 0 : result.values[key] || 0) + (u.value || 0) };
  const flags = { ...result.flags, [key]: { ...(result.flags[key]?.notInFile ? {} : result.flags[key]), rawName: u.name, row: u.row, fileSection: u.section, resolved: true } };
  const item = template.items.find(it => it.key === key);
  if (u.section && item && u.section !== item.section) flags[key].movedFrom = u.section;
  return { result: { ...result, values, flags, unknown: result.unknown.filter(x => x !== u) }, template: addAlias(template, key, 'rawAliases', u.name) };
}

export function addAlias(template, key, field, name) {
  const norm = normalizeArabic(name);
  return {
    ...template,
    items: template.items.map(it => {
      if (it.key !== key) return it;
      const list = it[field] || [];
      return list.some(a => normalizeArabic(a) === norm) ? it : { ...it, [field]: [...list, String(name).trim()] };
    }),
  };
}
