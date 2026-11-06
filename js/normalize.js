// تطبيع النص العربي قبل أي مقارنة — بدون DOM.
//   - يحذف التطويل والتشكيل والمسافات الزايدة
//   - يوحّد أ إ آ ٱ ← ا ، ى ← ي ، ة ← ه (وی ک الفارسية ← ي ك)
//   - يحذف الأقواس والرموز (+ / ( ) …)
export function normalizeArabic(input) {
  return String(input ?? '')
    .replace(/ـ/g, '')                          // تطويل ـ
    .replace(/[ً-ٰٟ]/g, '')           // تشكيل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/[+\/\\()\[\]{}<>\-_.,:;،؛*&|"'`~!؟?=#%^]/g, ' ')
    .replace(/[\s ​-‏]+/g, ' ')
    .trim();
}

// يحول الخلية لرقم. النص: يحذف كل شي غير الأرقام والنقطة والإشارة السالبة.
// يرجع null إذا الخلية فارغة أو ما بيها رقم.
export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  let s = String(v)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))   // أرقام عربية
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[−–—]/g, '-')
    .replace(/[^0-9.\-]/g, '');
  if (!/[0-9]/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : null;
}

// خريطة: الاسم بعد التطبيع ← مفتاح البند
export function aliasIndex(template, field) {
  const map = new Map();
  for (const it of template.items || []) {
    for (const a of it[field] || []) {
      const k = normalizeArabic(a);
      if (k && !map.has(k)) map.set(k, it.key);
    }
  }
  return map;
}
