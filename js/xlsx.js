// قراءة ملف الإكسل داخل المتصفح فقط (SheetJS من CDN). الملف ما ينرفع لأي مكان.
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
let XLSXPromise = null;
export function loadXLSX() {
  if (!XLSXPromise) XLSXPromise = import(SHEETJS_URL);
  return XLSXPromise;
}

// يرجع صفوف الورقة الأولى كمصفوفة: rows[i] = [A, B, C, ...]، وrowNumber(i) = رقم الصف بالإكسل.
export function sheetToRows(XLSX, workbook, sheetIndex = 0) {
  const ws = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  if (!ws || !ws['!ref']) return { rows: [], firstRow: 1 };
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.s.c = 0; // دائماً نبدي من العمود A حتى الأعمدة تبقى بمكانها
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range });
  return { rows, firstRow: range.s.r + 1 };
}

export async function readFileRows(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellFormula: false, cellHTML: false });
  return sheetToRows(XLSX, wb);
}
