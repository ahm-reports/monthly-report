// بعد الدخول: بطاقات التقارير المسموحة، وبكل بطاقة مبيعات وصافي آخر شهر.
import { getReport, lastMonth, REPORT_IDS } from '../firebase.js';
import { calcMonth } from '../calc.js';
import { mil, monthShort, esc } from '../format.js';
import { ICONS, $, loading } from '../ui.js';

export async function render(root, ctx) {
  const p = ctx.profile;
  root.innerHTML = `<main class="wrap" style="max-width:900px">
    <div class="app-header">
      <div class="brand"><div class="logo">${ICONS.logo()}</div>
        <div class="brand-text"><span class="k">التقارير الشهرية</span><h1 class="t">أهلاً ${esc(p.username)}</h1></div></div>
      <nav class="nav">
        ${ctx.isAdmin() ? '<a class="btn" href="#/admin">شاشة المدير</a>' : ''}
        <button class="btn ghost" type="button" id="logoutBtn">خروج</button>
      </nav>
    </div>
    <span class="muted" style="font-size:14px">اختار التقرير</span>
    <div class="reports-grid" id="cards">${loading()}</div>
  </main>`;
  $('#logoutBtn', root).addEventListener('click', ctx.logout);

  const ids = ctx.allowedReports();
  if (!ids.length) { $('#cards', root).innerHTML = `<div class="alert info">ما عندك صلاحية على أي تقرير. اطلب من المدير.</div>`; return; }

  const cards = await Promise.all(ids.map(async (id) => {
    try {
      const rep = await getReport(id);
      if (!rep) return notSeeded(id, ctx);
      const last = await lastMonth(id);
      return card(id, rep, last, ctx);
    } catch (e) {
      console.error(e);
      return `<div class="report-card waiting"><div class="top"><span class="name">${esc(id)}</span></div><span class="muted">ما كدرت أحمّل التقرير (${esc(e.code || e.message)}).</span></div>`;
    }
  }));
  if (ctx.signal.aborted) return;
  $('#cards', root).innerHTML = cards.join('');
}

function notSeeded(id, ctx) {
  const idx = REPORT_IDS.indexOf(id) + 1;
  return `<div class="report-card waiting"><div class="top"><span class="name">تقرير ${idx}</span><span class="tag gray">غير مُعد</span></div>
    <span class="muted">${ctx.isAdmin() ? 'التقرير ما مزروع بعد. روح لشاشة المدير ودوس "زرع القوالب".' : 'التقرير بعده ما انعد. اطلب من المدير.'}</span>
    ${ctx.isAdmin() ? '<a class="btn" href="#/admin">شاشة المدير</a>' : ''}</div>`;
}

function card(id, rep, last, ctx) {
  const name = esc(rep.displayName || id);
  if (!last) {
    return `<div class="report-card waiting">
      <div class="top"><span class="name">${name}</span><span class="tag gray">بانتظار البيانات</span></div>
      <span class="muted">ماكو ولا شهر محفوظ لهذا التقرير بعد.</span>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ctx.canEdit() ? `<a class="btn primary" href="#/r/${id}/import">${ICONS.plus}إدراج أول شهر</a>` : ''}
        <a class="btn" href="#/r/${id}">فتح التقرير</a>
      </div></div>`;
  }
  const c = calcMonth(last, rep.template, rep);
  return `<a class="report-card" href="#/r/${id}">
    <div class="top"><span class="name">${name}</span><span class="tag blue">آخر شهر: ${esc(monthShort(last.id))}</span></div>
    <div class="stats">
      <div><span>المبيعات</span><span>${mil(c.S)} مليون</span></div>
      <div><span>الربح الصافي</span><span style="color:${c.N < 0 ? 'var(--bad)' : 'var(--profit)'}">${mil(c.N)} مليون</span></div>
    </div></a>`;
}
