// مقارنة التقريرين: بالأقسام، والبنود المشتركة بالمفتاح، لنفس الشهر.
import { REPORT_IDS, getReport, listMonths } from '../firebase.js';
import { calcMonth, SECTIONS, SECTION_LABELS } from '../calc.js';
import { num, mil, pct, monthName, esc } from '../format.js';
import { header, bindHeader, loading, $ } from '../ui.js';

let selectedMonth = null;

export async function render(root, ctx) {
  root.innerHTML = `<main class="wrap">${loading()}</main>`;
  const ids = ctx.allowedReports().filter(id => REPORT_IDS.includes(id));
  const shell = (body) => `<main class="wrap">${header(ctx, { title: 'مقارنة التقريرين', kicker: 'التقارير الشهرية', active: 'compare' })}${body}</main>`;
  if (ids.length < 2) {
    root.innerHTML = shell(`<div class="card empty"><h2>المقارنة تحتاج صلاحية على التقريرين</h2><p class="muted" style="margin:0">اطلب من المدير يضيفلك التقرير الثاني.</p></div>`);
    bindHeader(root, ctx); return;
  }
  const data = await Promise.all(ids.slice(0, 2).map(async id => ({ id, rep: await getReport(id), months: await listMonths(id) })));
  if (ctx.signal.aborted) return;
  if (data.some(d => !d.rep)) { root.innerHTML = shell('<div class="alert warn">واحد من التقريرين ما مزروع بعد.</div>'); bindHeader(root, ctx); return; }
  const [A, B] = data;
  const common = A.months.map(m => m.id).filter(id => B.months.some(m => m.id === id));
  if (!common.length) {
    root.innerHTML = shell(`<div class="card empty"><span class="tag gray">بانتظار البيانات</span><h2>ماكو شهر محفوظ بالتقريرين سوا</h2>
      <p class="muted" style="margin:0">المقارنة تشتغل على الأشهر الموجودة بالتقريرين. ${esc(A.rep.displayName)}: ${A.months.length} شهر، ${esc(B.rep.displayName)}: ${B.months.length} شهر.</p></div>`);
    bindHeader(root, ctx); return;
  }
  if (!common.includes(selectedMonth)) selectedMonth = common[common.length - 1];

  const draw = () => {
    const mid = selectedMonth;
    const ma = A.months.find(m => m.id === mid), mb = B.months.find(m => m.id === mid);
    const ca = calcMonth(ma, A.rep.template, A.rep), cb = calcMonth(mb, B.rep.template, B.rep);
    const nA = esc(A.rep.displayName), nB = esc(B.rep.displayName);
    const cell = (v, S, bad) => `<td class="num"><b style="${bad ? 'color:var(--bad)' : ''}">${num(v)}</b><div class="muted" style="font-size:12px">${S ? pct(v / S) : '—'}</div></td>`;
    const rowsSec = [
      ['المبيعات', 'S'], ['المشتريات (الكلفة الغذائية)', 'P'], ['المصاريف', 'E'], ['إيرادات مختلفة', 'O'], ['الربح الإجمالي', 'G2'], ['نسبة الإدارة', 'F'], ['الربح الصافي', 'N'],
    ].map(([l, k]) => `<tr><td style="font-weight:${['S', 'N', 'G2'].includes(k) ? 700 : 400}">${l}</td>${cell(ca[k], ca.S, ca[k] < 0)}${cell(cb[k], cb.S, cb[k] < 0)}<td class="num ${ca[k] - cb[k] < 0 ? '' : ''}">${num(ca[k] - cb[k])}</td></tr>`).join('');

    const bKeys = new Map(B.rep.template.items.map(it => [it.key, it]));
    const shared = A.rep.template.items.filter(it => bKeys.has(it.key));
    const onlyA = A.rep.template.items.filter(it => !bKeys.has(it.key)).map(it => it.label);
    const onlyB = B.rep.template.items.filter(it => !A.rep.template.items.some(x => x.key === it.key)).map(it => it.label);
    const itemRows = SECTIONS.map(s => {
      const list = shared.filter(it => it.section === s);
      if (!list.length) return '';
      return `<tr class="sec-row"><td colspan="4">${SECTION_LABELS[s]}</td></tr>` + list.map(it => {
        const va = Number(ma.values?.[it.key]) || 0, vb = Number(mb.values?.[it.key]) || 0;
        const diffSection = bKeys.get(it.key).section !== it.section ? ` <span class="tag amber" style="font-size:11px">بقسم مختلف بـ ${nB}</span>` : '';
        return `<tr><td>${esc(it.label)}${diffSection}</td>${cell(va, ca.S)}${cell(vb, cb.S)}<td class="num">${num(va - vb)}</td></tr>`;
      }).join('');
    }).join('');

    const bar = (label, a, b) => {
      const mx = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 0.0001);
      return `<div class="stack" style="gap:6px"><span style="font-size:14px;color:var(--tx3)">${label}</span>
        <div class="cmp-bar"><span>${nA}</span><div class="track" style="height:10px"><div style="width:${(Math.abs(a ?? 0) / mx * 100).toFixed(1)}%;background:#60A5FA"></div></div><b class="ltr">${pct(a)}</b></div>
        <div class="cmp-bar"><span>${nB}</span><div class="track" style="height:10px"><div style="width:${(Math.abs(b ?? 0) / mx * 100).toFixed(1)}%;background:#F472B6"></div></div><b class="ltr">${pct(b)}</b></div></div>`;
    };

    root.innerHTML = shell(`
      <div class="month-bar" role="group" aria-label="اختيار الشهر">${common.map(id => `<button type="button" class="pill ${id === mid ? 'on' : ''}" data-m="${id}" aria-pressed="${id === mid}">${esc(monthName(id))}</button>`).join('')}</div>
      <section class="row">
        <div class="card" style="flex:1 1 360px"><div class="card-head"><div><h2>النسب من المبيعات</h2><span class="muted">${esc(monthName(mid))}</span></div></div>
          ${bar('الكلفة الغذائية', ca.foodCost, cb.foodCost)}${bar('المصاريف', ca.expenseRatio, cb.expenseRatio)}${bar('الهامش الصافي', ca.netMargin, cb.netMargin)}</div>
        <div class="card" style="flex:2 1 560px"><div class="card-head"><div><h2>بالأقسام</h2><span class="muted">المبالغ بالدينار، وتحت كل مبلغ نسبته من مبيعات تقريره</span></div></div>
          <div class="scroll-x"><table class="tbl" style="min-width:520px"><thead><tr><th></th><th class="num">${nA}</th><th class="num">${nB}</th><th class="num">الفرق</th></tr></thead><tbody>${rowsSec}</tbody></table></div></div>
      </section>
      <section class="card"><div class="card-head"><div><h2>البنود المشتركة</h2><span class="muted">البنود اللي إلها نفس المفتاح بالقالبين (${shared.length} بند)</span></div></div>
        <div class="scroll-x"><table class="tbl" style="min-width:520px"><thead><tr><th>البند</th><th class="num">${nA}</th><th class="num">${nB}</th><th class="num">الفرق</th></tr></thead><tbody>${itemRows}</tbody></table></div>
        ${onlyA.length || onlyB.length ? `<p class="muted" style="margin:0;line-height:1.8">بنود بتقرير واحد بس — ${nA}: ${onlyA.map(esc).join('، ') || 'لا يوجد'}. ${nB}: ${onlyB.map(esc).join('، ') || 'لا يوجد'}.</p>` : ''}</section>`);
    bindHeader(root, ctx);
    root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { selectedMonth = b.dataset.m; draw(); }));
  };
  draw();
}
