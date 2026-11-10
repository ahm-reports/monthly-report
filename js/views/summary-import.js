// استيراد الملخص السنوي (للمدير فقط) — مرة وحدة لكل تقرير حتى ندخل الأشهر السابقة.
import { REPORT_IDS, getReport, listMonths, saveMonthsBatch, authErrorText } from '../firebase.js';
import { parseSummaryExcel, rangeFromFileName } from '../parse-summary.js';
import { calcMonth } from '../calc.js';
import { monthName, num, esc } from '../format.js';
import { toast, loading, $ } from '../ui.js';

export function mountSummaryImport(box, ctx, names = {}) {
  const now = new Date();
  box.innerHTML = `<div class="card-head"><div><h2>استيراد الملخص السنوي</h2>
      <span class="muted">يستخدم مرة وحدة لكل تقرير حتى تدخل الأشهر السابقة. الملف ينقرأ بجهازك فقط.</span></div></div>
    <form class="form-grid" id="sumForm" novalidate>
      <div class="field"><label for="sRep">التقرير</label><select class="input" id="sRep">${REPORT_IDS.map(id => `<option value="${id}">${esc(names[id] || id)}</option>`).join('')}</select></div>
      <div class="field"><label for="sYear">السنة</label><input class="input num" id="sYear" inputmode="numeric" value="${now.getFullYear()}"></div>
      <div class="field"><label for="sFrom">من شهر</label><select class="input" id="sFrom">${monthOpts(1)}</select></div>
      <div class="field"><label for="sTo">لحد شهر</label><select class="input" id="sTo">${monthOpts(12)}</select></div>
      <div class="field"><span class="label">ملف الملخص</span><label class="btn" for="sFile" style="cursor:pointer" id="sFileLbl">اختيار ملف</label>
        <input type="file" id="sFile" accept=".xlsx,.xls" hidden></div>
    </form>
    <div id="sumOut" class="stack"></div>`;
  let file = null;
  const read = async () => {
    if (!file) return;
    const out = $('#sumOut', box);
    out.innerHTML = loading();
    const reportId = $('#sRep', box).value;
    try {
      const rep = await getReport(reportId);
      if (!rep) { out.innerHTML = `<div class="alert err">التقرير ما مزروع بعد.</div>`; return; }
      const res = await parseSummaryExcel(file, rep.template, { year: Number($('#sYear', box).value), fromMonth: Number($('#sFrom', box).value), toMonth: Number($('#sTo', box).value) });
      const existing = new Set((await listMonths(reportId)).map(m => m.id));
      preview(out, rep, reportId, res, existing);
    } catch (e) { console.error(e); out.innerHTML = `<div class="alert err">ما كدرت أقرأ الملف: ${esc(e.message || e)}</div>`; }
  };
  $('#sFile', box).addEventListener('change', (e) => {
    file = e.target.files[0]; if (!file) return;
    $('#sFileLbl', box).textContent = file.name;
    const r = rangeFromFileName(file.name);
    if (r.year) $('#sYear', box).value = r.year;
    if (r.fromMonth) { $('#sFrom', box).value = r.fromMonth; $('#sTo', box).value = r.toMonth; }
    read();
  });
  ['#sRep', '#sYear', '#sFrom', '#sTo'].forEach(s => $(s, box).addEventListener('change', read));
}

function preview(out, rep, reportId, res, existing) {
  if (!res.months.length) {
    out.innerHTML = `<div class="alert warn">ما لكيت أي شهر بيه أرقام ضمن المدى المختار.</div>${warn(res)}`;
    return;
  }
  const dup = res.months.filter(m => existing.has(m.id));
  out.innerHTML = `${warn(res)}
    <div class="scroll-x"><table class="tbl" style="min-width:640px"><thead><tr><th>الشهر</th><th class="num">المبيعات</th><th class="num">المشتريات</th><th class="num">المصاريف</th><th class="num">إيرادات مختلفة</th><th class="num">الصافي</th><th></th></tr></thead><tbody>
    ${res.months.map(m => { const c = calcMonth(m, rep.template, rep); return `<tr><td><b>${esc(monthName(m.id))}</b></td><td class="num">${num(c.S)}</td><td class="num">${num(c.P)}</td><td class="num">${num(c.E)}</td><td class="num">${num(c.O)}</td>
      <td class="num" style="font-weight:600;color:${c.N < 0 ? 'var(--bad)' : 'var(--profit)'}">${num(c.N)}</td><td>${existing.has(m.id) ? '<span class="tag amber">موجود</span>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn primary" type="button" id="sGo">استيراد ${res.months.length} ${res.months.length > 10 ? 'شهر' : 'أشهر'}</button>
      <span class="muted">تنحفظ بمصدر "الملخص السنوي" لـ ${esc(rep.displayName)}.</span></div>`;
  $('#sGo', out).addEventListener('click', async (e) => {
    if (dup.length && !confirm(`هاي الأشهر محفوظة من قبل وراح تتبدل: ${dup.map(m => monthName(m.id)).join('، ')}. تكمل؟`)) return;
    e.target.disabled = true; e.target.textContent = 'جاري الاستيراد…';
    try {
      await saveMonthsBatch(reportId, res.months, 'summary');
      out.innerHTML = `<div class="alert ok" style="flex-direction:column;gap:8px"><b>✓ انستورد ${res.months.length} ${res.months.length > 10 ? 'شهر' : 'أشهر'} لـ ${esc(rep.displayName)}</b>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/r/${reportId}/months">شوف الأشهر</a></div></div>`;
      toast('تم الاستيراد');
    } catch (err) { console.error(err); toast(authErrorText(err), true); e.target.disabled = false; e.target.textContent = 'استيراد'; }
  });
}

function warn(res) {
  const list = [...res.warnings.map(w => w.text)];
  if (res.ignoredRows.length) list.push(`صفوف تجاهلناها (عناوين أو مجاميع أو أسماء ما بالقالب): ${res.ignoredRows.map(r => r.name).join('، ')}`);
  return list.map(t => `<div class="alert info">${esc(t)}</div>`).join('');
}
function monthOpts(sel) {
  return ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
    .map((n, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${n}</option>`).join('');
}
