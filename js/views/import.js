// إدراج شهر: اختيار الشهر ← رفع القالب الخام ← المراجعة ← الحفظ.
// الملف ينقرأ داخل المتصفح فقط، وما ينرفع لأي مكان. ينحفظ بس الأرقام بعد المراجعة.
import { getReport, listMonths, getMonth, saveMonthWithLog, updateReport, authErrorText } from '../firebase.js';
import { parseRawExcel } from '../parse-raw.js';
import { monthName, esc } from '../format.js';
import { header, bindHeader, loading, toast, $ } from '../ui.js';
import { mountReview } from './review.js';

export async function render(root, ctx, reportId) {
  root.innerHTML = `<main class="wrap">${loading()}</main>`;
  const [rep, months] = await Promise.all([getReport(reportId), listMonths(reportId)]);
  if (ctx.signal.aborted) return;
  if (!rep) { root.innerHTML = `<main class="wrap"><div class="alert err">التقرير ما مزروع بعد.</div></main>`; return; }
  const saved = new Set(months.map(m => m.id));
  const options = monthOptions(months);

  root.innerHTML = `<main class="wrap">
    ${header(ctx, { title: 'إدراج شهر جديد', kicker: rep.displayName, reportId, active: 'import' })}
    <ol class="steps" id="steps"></ol>
    <section class="row">
      <div class="card" style="flex:1 1 280px;padding:20px;gap:10px;border-radius:18px">
        <label for="mon" class="label" style="font-size:13px">الشهر</label>
        <select id="mon" class="input">${options.map(o => `<option value="${o.id}" ${o.selected ? 'selected' : ''}>${esc(monthName(o.id))}${saved.has(o.id) ? ' — محفوظ' : ''}</option>`).join('')}</select>
      </div>
      <div class="card dashed" id="drop" style="flex:2 1 520px;padding:20px;border-radius:18px;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;border-color:#2C4170">
        <div style="display:flex;align-items:center;gap:14px;min-width:0">
          <div style="width:48px;height:48px;border-radius:12px;background:#0E2A24;display:flex;align-items:center;justify-content:center;flex:none">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15l3-3 3 3"/></svg></div>
          <div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:15px;font-weight:600" id="fileName">القالب الخام (Excel)</span>
            <span class="muted" id="fileInfo">اختار ملف الشهر أو اسحبه هنا. الملف ينقرأ بجهازك فقط وما ينرفع.</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label class="btn primary" for="file" style="cursor:pointer">اختيار ملف</label>
          <input type="file" id="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden>
          <button class="btn ghost" type="button" id="manual">إدخال يدوي</button>
        </div>
      </div>
    </section>
    <div id="review" class="stack" style="gap:22px"></div>
  </main>`;
  bindHeader(root, ctx);

  let step = 1;
  const setStep = (s) => { step = s; drawSteps(); };
  const drawSteps = () => {
    const labels = ['اختيار الشهر', 'رفع الإكسل الخام', 'المراجعة والتعديل', 'الحفظ'];
    const el = $('#steps', root);
    if (!el) return;
    el.innerHTML =labels.map((l, i) => {
      const n = i + 1, cls = n < step ? 'done' : n === step ? 'cur' : 'todo';
      return `<li class="${cls}"${n === step ? ' aria-current="step"' : ''}><span>${n < step ? '✓' : n}</span>${l}</li>`;
    }).join('');
  };
  drawSteps();

  const fileInput = $('#file', root), drop = $('#drop', root);
  fileInput.addEventListener('change', () => fileInput.files[0] && handleFile(fileInput.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--sales)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = '#2C4170'; });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = '#2C4170'; const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  $('#manual', root).addEventListener('click', () => {
    const values = Object.fromEntries(rep.template.items.map(it => [it.key, 0]));
    $('#fileName', root).textContent = 'إدخال يدوي';
    $('#fileInfo', root).textContent = 'اكتب أرقام البنود بيدك.';
    showReview({ values, flags: {}, unknown: [], checks: [], warnings: [] });
  });

  async function handleFile(file) {
    if (!/\.xlsx?$/i.test(file.name)) { toast('الملف لازم يكون إكسل (.xlsx أو .xls).', true); return; }
    $('#fileName', root).textContent = file.name;
    $('#fileInfo', root).textContent = 'جاري القراءة…';
    $('#review', root).innerHTML = loading();
    try {
      const r = await parseRawExcel(file, rep.template);
      if (ctx.signal.aborted) return;
      const flags = Object.values(r.flags);
      const moved = flags.filter(f => f.movedFrom).length, missing = flags.filter(f => f.missing || f.notInFile).length;
      $('#fileInfo', root).textContent = [`تمت قراءة ${r.readCount} بند`, moved && `${moved} انتقلت لقسمها`, missing && `${missing} ناقص`, r.unknown.length && `${r.unknown.length} غير معروف`].filter(Boolean).join(' · ');
      fileInput.value = '';
      showReview(r);
    } catch (e) {
      console.error(e);
      $('#fileInfo', root).textContent = 'ما كدرت أقرأ الملف.';
      $('#review', root).innerHTML = `<div class="alert err">ما كدرت أقرأ الملف: ${esc(e.message || e)}. تأكد إنه قالب الإكسل الصحيح.</div>`;
    }
  }

  function showReview(r) {
    setStep(3);
    mountReview($('#review', root), {
      template: rep.template, settings: rep, values: r.values, other: 0,
      flags: r.flags, unknown: r.unknown, checks: r.checks, warnings: r.warnings.filter(w => w.type !== 'total' || !r.checks.every(c => c.ok)),
      canEditTemplate: ctx.isAdmin(),
      onSave: async ({ values, other, template, templateChanged }) => {
        const monthId = $('#mon', root).value;
        if (saved.has(monthId) && !confirm(`شهر ${monthName(monthId)} محفوظ من قبل. تريد تستبدل أرقامه بالأرقام الجديدة؟`)) return;
        try {
          if (templateChanged && ctx.isAdmin()) { await updateReport(reportId, { template }); rep.template = template; }
          const old = saved.has(monthId) ? await getMonth(reportId, monthId) : null;
          await saveMonthWithLog(reportId, monthId, { values, other_revenue: other, source: 'raw' }, old);
          saved.add(monthId);
          toast('انحفظ الشهر');
          if (ctx.signal.aborted || !$('#review', root)) return;   // المستخدم طلع من الصفحة أثناء الحفظ
          setStep(5);
          $('#review', root).innerHTML =`<div class="alert ok" style="flex-direction:column;gap:10px">
            <b style="font-size:16px;color:#5EEAD4">✓ تم حفظ شهر ${esc(monthName(monthId))}</b>
            <span style="color:var(--tx3)">الملخص والجارتات والنمو تتحدث من هذا الشهر.</span>
            <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn primary" href="#/r/${reportId}">افتح الملخص</a><a class="btn" href="#/r/${reportId}/months">الأشهر</a></div></div>`;
          toast('انحفظ الشهر');
        } catch (e) { console.error(e); toast(authErrorText(e), true); }
      },
    });
  }
}

// الأشهر من كانون الثاني للسنة الماضية لحد الشهر الحالي، والافتراضي: الشهر اللي بعد آخر شهر محفوظ، أو الشهر الماضي.
function monthOptions(months, now = new Date()) {
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  const ids = [];
  for (let y = curY - 1; y <= curY; y++) for (let m = 1; m <= 12; m++) { if (y === curY && m > curM) break; ids.push(`${y}-${String(m).padStart(2, '0')}`); }
  let def;
  const last = months.length ? months[months.length - 1].id : null;
  if (last) { const [y, m] = last.split('-').map(Number); const nx = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; if (ids.includes(nx)) def = nx; }
  if (!def) def = curM === 1 ? `${curY - 1}-12` : `${curY}-${String(curM - 1).padStart(2, '0')}`;
  for (const m of months) if (!ids.includes(m.id)) ids.push(m.id);
  ids.sort();
  return ids.reverse().map(id => ({ id, selected: id === def }));
}
