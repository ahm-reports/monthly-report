// تنسيق الأرقام والأشهر للعرض.
export const MONTH_NAMES = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
export const MONTH_SHORT = ['ك٢', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت١', 'ت٢', 'ك١'];
export function monthTiny(id) { const m = Number(String(id).split('-')[1]); return MONTH_SHORT[m - 1] || String(id); }
export const MINUS = '−';
export const DASH = '—';

export function monthName(id) { // 'YYYY-MM' → 'تشرين الأول 2026'
  const [y, m] = String(id).split('-').map(Number);
  return MONTH_NAMES[m - 1] ? `${MONTH_NAMES[m - 1]} ${y}` : String(id);
}
export function monthShort(id) { const m = Number(String(id).split('-')[1]); return MONTH_NAMES[m - 1] || String(id); }

export function num(x) { // رقم كامل مدور بفواصل الآلاف
  if (typeof x !== 'number' || !isFinite(x)) return DASH;
  const r = Math.round(x);
  return (r < 0 ? MINUS : '') + Math.abs(r).toLocaleString('en-US');
}
export function mil(x) { // بالمليون برقم عشري واحد
  if (typeof x !== 'number' || !isFinite(x)) return DASH;
  const v = Math.abs(x / 1e6).toFixed(1);
  return (x < 0 && v !== '0.0' ? MINUS : '') + v;
}
export function pct(x, digits = 1) {
  if (x === null || typeof x !== 'number' || !isFinite(x)) return DASH;
  const v = Math.abs(x * 100).toFixed(digits);
  return (x < 0 && Number(v) !== 0 ? MINUS : '') + v + '%';
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
