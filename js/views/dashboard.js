// لوحة التحكم (الملخص) — كل الأجزاء تبني نفسها من القالب والأشهر المحفوظة.
import { getReport, listMonths } from '../firebase.js';
import { calcMonth, growth, insights, itemsOf } from '../calc.js';
import { num, mil, pct, monthShort, monthTiny, monthName, esc } from '../format.js';
import { header, bindHeader, loading, toast, ICONS, $, $$ } from '../ui.js';
import { loadXLSX } from '../xlsx.js';
import { SECTIONS, SECTION_LABELS } from '../calc.js';

const COLORS = { S: '#60A5FA', P: '#F59E0B', E: '#6366F1', E2: '#818CF8', G: '#34D399', F: '#F472B6', O: '#38BDF8', good: '#2DD4BF', bad: '#FB923C' };
const selected = {}; // reportId → monthId (يبقى أثناء التنقل)

export async function render(root, ctx, reportId) {
  root.innerHTML = `<main class="wrap">${loading()}</main>`;
  const [rep, months] = await Promise.all([getReport(reportId), listMonths(reportId)]);
  if (ctx.signal.aborted) return;
  if (!rep) { root.innerHTML = `<main class="wrap"><div class="alert err">التقرير ما مزروع بعد.</div></main>`; return; }

  const shell = (body) => `<main class="wrap">${header(ctx, { title: rep.displayName, reportId, active: 'dash' })}${body}</main>`;
  if (!months.length) {
    root.innerHTML = shell(`<div class="card empty"><span class="tag gray">بانتظار البيانات</span><h2>ماكو ولا شهر محفوظ لهذا التقرير بعد</h2>
      <p class="muted" style="margin:0">أول ما تدرج شهر، يطلع هنا الملخص والجارتات.</p>
      ${ctx.canEdit() ? `<a class="btn primary" href="#/r/${reportId}/import">${ICONS.plus}إدراج أول شهر</a>` : ''}</div>`);
    bindHeader(root, ctx);
    return;
  }

  const calcs = months.map(m => calcMonth(m, rep.template, rep));
  const draw = () => {
    let i = months.findIndex(m => m.id === selected[reportId]);
    if (i < 0) i = months.length - 1;
    root.innerHTML = shell(view(rep, months, calcs, i, reportId));
    bindHeader(root, ctx);
    $$('[data-month]', root).forEach(b => b.addEventListener('click', () => { selected[reportId] = b.dataset.month; draw(); }));
    $('#btnPdf', root).addEventListener('click', () => window.print());
    $('#btnXlsx', root).addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { await exportExcel(rep, months[i], calcs[i]); } catch (err) { console.error(err); toast('ما كدرت أسوي ملف الإكسل.', true); }
      finally { btn.disabled = false; }
    });
  };
  draw();
}

function delta(a, b, upGood) {
  const r = growth(a, b);
  if (r === null) return { html: `<span class="delta neu">—</span>`, r };
  const up = r >= 0, good = upGood ? up : !up, tone = Math.abs(r) < 0.005 ? 'neu' : good ? 'good' : 'bad';
  return { html: `<span class="delta ${tone}">${up ? '▲' : '▼'} ${Math.abs(r * 100).toFixed(1)}%</span>`, r };
}

function view(rep, months, calcs, i, reportId) {
  const T = rep.template, m = months[i], c = calcs[i];
  const pm = i > 0 ? months[i - 1] : null, pc = i > 0 ? calcs[i - 1] : null;
  const name = monthShort(m.id), prevName = pm ? monthShort(pm.id) : 'الشهر السابق';
  const year = m.id.slice(0, 4);
  const ytd = calcs.slice(0, i + 1).filter((_, k) => months[k].id.startsWith(year)).reduce((a, x) => a + x.N, 0);

  // ---- شريط الأشهر
  const pills = `<div class="dash-tools"><div class="month-bar" role="group" aria-label="اختيار الشهر">${months.map((mm, k) =>
    `<button type="button" class="pill ${k === i ? 'on' : ''}" data-month="${mm.id}" ${k === i ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${esc(monthShort(mm.id))}${months.some(x => x.id.slice(0, 4) !== year) ? ' ' + mm.id.slice(0, 4) : ''}</button>`).join('')}</div>
    <div class="no-print" style="display:flex;gap:8px;flex:none"><button class="btn" type="button" id="btnPdf" title="طباعة أو حفظ PDF">PDF</button><button class="btn" type="button" id="btnXlsx" title="تنزيل الشهر Excel">Excel</button></div></div>
    <div class="print-only print-title">${esc(rep.displayName)} — ${esc(monthName(m.id))}</div>`;

  // ---- بطاقة الربح الصافي
  const hd = delta(c.N, pc && pc.N, true);
  const spark = sparkline(calcs.map(x => x.N), i);
  const hero = `<div class="card hero" style="flex:1 1 380px;padding:28px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:15px;color:var(--tx3)">الربح الصافي — ${esc(name)}</span>
      <span class="chip-delta">${hd.html} <span class="muted">عن ${esc(prevName)}</span></span></div>
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="hero-num ltr" style="color:${c.N < 0 ? 'var(--bad)' : 'var(--tx)'}">${num(c.N)}</span><span style="font-size:18px;color:var(--tx2)">د.ع</span></div>
    ${spark}
    <div class="hero-stats">
      <div><span>هامش الصافي</span><b>${pct(c.netMargin)}</b></div>
      <div><span>من بداية السنة</span><b>${mil(ytd)} مليون</b></div>
      <div><span>نسبة الإدارة</span><b>${mil(c.F)} مليون</b></div>
    </div></div>`;

  // ---- أربع بطاقات
  const kp = (label, v, pv, upGood, color, sub, share) => {
    const d = delta(v, pv, upGood);
    return `<div class="card kpi"><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:14px;color:var(--tx3)">${label}</span><span class="dot" style="background:${color}"></span></div>
      <div style="display:flex;align-items:baseline;gap:6px"><span class="kpi-num ltr">${mil(v)}</span><span class="muted">مليون</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px"><span class="muted">${sub}</span>${d.html}</div>
      <div class="track"><div style="width:${Math.max(0, Math.min(100, (share ?? 0) * 100)).toFixed(1)}%;background:${color}"></div></div></div>`;
  };
  const nSales = itemsOf(T, 'sales').length;
  const kpis = `<div class="kpi-grid">
    ${kp('المبيعات', c.S, pc && pc.S, true, COLORS.S, `الإجمالي من ${nSales} ${nSales > 10 ? 'مصدر' : 'مصادر'}`, c.S ? 1 : 0)}
    ${kp('المشتريات', c.P, pc && pc.P, false, COLORS.P, 'الكلفة الغذائية ' + pct(c.foodCost) + over(c.foodCost, rep.alerts?.foodCostMax), c.foodCost)}
    ${kp('المصاريف', c.E, pc && pc.E, false, COLORS.E2, pct(c.expenseRatio) + ' من المبيعات' + over(c.expenseRatio, rep.alerts?.expenseMax), c.expenseRatio)}
    ${kp('الربح الإجمالي', c.G2, pc && pc.G2, true, COLORS.G, 'الهامش ' + pct(c.grossMargin), c.grossMargin)}</div>`;

  const al = rep.alerts || {}, warns = [];
  if (c.foodCost !== null && al.foodCostMax && c.foodCost > al.foodCostMax) warns.push(`الكلفة الغذائية ${pct(c.foodCost)} أعلى من الحد ${pct(al.foodCostMax)}.`);
  if (c.expenseRatio !== null && al.expenseMax && c.expenseRatio > al.expenseMax) warns.push(`المصاريف ${pct(c.expenseRatio)} من المبيعات، أعلى من الحد ${pct(al.expenseMax)}.`);
  if (c.N < 0) warns.push(`${esc(name)} شهر خسارة: الصافي ${num(c.N)} د.ع.`);
  const alerts = warns.length ? `<div class="alert warn" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span>${warns.join(' ')}</span></div>` : '';
  return `${pills}${alerts}
    <section class="row">${hero}<div style="flex:2 1 560px;min-width:0">${kpis}</div></section>
    <section class="row">${dinarCard(months, calcs, i)}${bridgeCard(c, name, rep)}</section>
    <section class="row">${sourcesCard(T, m, pm, c, name, prevName)}${ratiosCard(months, calcs, i, c)}</section>
    <section class="row">${costsCard(T, m, pm, c, name)}${insightsCard(months, i, rep, name)}</section>`;
}

function over(v, max) { return v !== null && max && v > max ? ' <span class="tag orange" style="font-size:11px;padding:2px 8px">فوق الحد</span>' : ''; }

function sparkline(vals, i) {
  const W = 300, H = 60, pad = 4;
  const mx = Math.max(0, ...vals), mn = Math.min(0, ...vals), span = mx - mn || 1;
  const x = (k) => vals.length > 1 ? (k * W / (vals.length - 1)) : W / 2;
  const y = (v) => H - pad - (v - mn) / span * (H - 2 * pad);
  const pts = vals.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zero = y(0).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:64px" role="img" aria-label="منحنى الربح الصافي">
    ${mn < 0 ? `<line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="#263556" stroke-dasharray="3 3"/>` : ''}
    ${vals.length > 1 ? `<polyline points="0,${zero} ${pts} ${W},${zero}" fill="#34D39922"/><polyline points="${pts}" fill="none" stroke="#34D399" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}
    <circle cx="${x(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="4" fill="${vals[i] < 0 ? '#FB923C' : '#34D399'}"/></svg>`;
}

function dinarCard(months, calcs, i) {
  const from = Math.max(0, i - 11);           // آخر 12 شهر لحد الشهر المختار
  const list = calcs.slice(from, Math.max(i + 1, Math.min(months.length, from + 12)));
  const maxS = Math.max(1, ...list.map(x => Math.max(x.S, x.P + x.E)));
  const H = 250;
  const bars = list.map((x, j) => {
    const k = from + j, sel = k === i, loss = x.G < 0;
    const seg = (v, col, rad = '') => `<span style="display:block;width:100%;height:${(Math.max(v, 0) / maxS * H).toFixed(1)}px;background:${col};${rad}"></span>`;
    const label = loss ? 'خسارة' : (x.S ? (x.G / x.S * 100).toFixed(1).replace('.0', '') + '%' : '—');
    return `<button type="button" class="dinar-col ${sel ? 'sel' : ''}" data-month="${months[k].id}" aria-label="${esc(monthShort(months[k].id))}: مبيعات ${mil(x.S)} مليون${loss ? '، خسارة' : ''}">
      <span style="font-size:12px;font-weight:600;color:${loss ? COLORS.bad : COLORS.G};margin-bottom:6px">${label}</span>
      ${loss ? seg(x.S, COLORS.bad, 'border-radius:6px 6px 0 0') : seg(x.G, COLORS.G, 'border-radius:6px 6px 0 0') + seg(x.E, COLORS.E) + seg(x.P, COLORS.P)}</button>`;
  }).join('');
  const labels = list.map((_, j) => `<span style="flex:1 1 0;min-width:0;text-align:center;font-size:12px;${from + j === i ? 'color:var(--tx);font-weight:700' : 'color:var(--tx2)'}">${esc(monthTiny(months[from + j].id))}</span>`).join('');
  const minW = Math.max(list.length * 56, 200);
  return `<div class="card" style="flex:3 1 640px">
    <div class="card-head"><div><h2>وين يروح كل دينار؟</h2><span class="muted">كل عمود هو مبيعات الشهر، مقسمة إلى مشتريات ومصاريف وربح. اضغط على أي شهر.</span></div>
      <div class="legend"><span><i style="background:${COLORS.P}"></i>المشتريات</span><span><i style="background:${COLORS.E}"></i>المصاريف</span><span><i style="background:${COLORS.G}"></i>الربح الإجمالي</span><span><i style="background:${COLORS.bad}"></i>شهر خسارة</span></div></div>
    <div class="scroll-x"><div class="dinar-bars" style="min-width:${minW}px;${list.length < 4 ? 'max-width:' + list.length * 140 + 'px;margin-inline:auto' : ''}">${bars}</div>
      <div style="display:flex;gap:14px;min-width:${minW}px;padding:10px 4px 0;${list.length < 4 ? 'max-width:' + list.length * 140 + 'px;margin-inline:auto' : ''}">${labels}</div></div></div>`;
}

function bridgeCard(c, name, rep) {
  const A1 = c.S - c.P, A2 = A1 - c.E, A3 = A2 + c.O;
  const steps = [
    { label: 'المبيعات', from: 0, to: c.S, color: COLORS.S, value: num(c.S), strong: true },
    { label: '− المشتريات', from: c.S, to: A1, color: COLORS.P, value: '− ' + num(c.P) },
    { label: '− المصاريف', from: A1, to: A2, color: COLORS.E2, value: '− ' + num(c.E) },
    { label: '+ إيرادات مختلفة', from: A2, to: A3, color: COLORS.O, value: c.O ? '+ ' + num(c.O) : 'لا يوجد' },
    { label: `− نسبة الإدارة ${pct(c.feeRate, 0)}`, from: A3, to: c.N, color: COLORS.F, value: c.F ? '− ' + num(c.F) : '0 (ماكو ربح)' },
    { label: 'الربح الصافي', from: 0, to: c.N, color: c.N < 0 ? COLORS.bad : COLORS.G, value: num(c.N), strong: true },
  ];
  const lo = Math.min(0, ...steps.flatMap(s => [s.from, s.to])), hi = Math.max(0, ...steps.flatMap(s => [s.from, s.to]));
  const span = hi - lo || 1, zero = (0 - lo) / span * 100;
  return `<div class="card" style="flex:2 1 420px">
    <div class="card-head"><div><h2>من المبيعات إلى الصافي</h2><span class="muted">${esc(name)} — خطوة بخطوة</span></div></div>
    <div class="stack" style="gap:14px">${steps.map(s => {
      const start = (Math.min(s.from, s.to) - lo) / span * 100, w = Math.max(Math.abs(s.to - s.from) / span * 100, 0.6);
      return `<div class="stack" style="gap:6px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span style="${s.strong ? 'font-weight:700' : 'color:var(--tx3)'}">${s.label}</span><span class="ltr" style="font-weight:${s.strong ? 700 : 500};color:${s.strong ? (s.to < 0 ? COLORS.bad : 'var(--tx)') : s.color}">${s.value}</span></div>
        <div style="position:relative;height:22px;background:var(--inset);border-radius:6px">${lo < 0 ? `<span style="position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--tx2);right:${zero.toFixed(2)}%"></span>` : ''}<div style="position:absolute;top:0;bottom:0;border-radius:6px;background:${s.color};right:${start.toFixed(2)}%;width:${w.toFixed(2)}%"></div></div></div>`;
    }).join('')}</div>
    ${lo < 0 ? '<span class="muted" style="font-size:12px">الخط العمودي = الصفر. اللي يمينه موجب واللي يساره سالب.</span>' : ''}</div>`;
}

function sourcesCard(T, m, pm, c, name, prevName) {
  const items = itemsOf(T, 'sales');
  const vals = items.map(it => Number(m.values?.[it.key]) || 0), mx = Math.max(1, ...vals);
  return `<div class="card" style="flex:1 1 420px">
    <div class="card-head"><div><h2>مصادر المبيعات</h2><span class="muted">حصة كل مصدر من مبيعات ${esc(name)} والتغير عن ${esc(prevName)}</span></div></div>
    ${items.map((it, k) => { const v = vals[k], d = delta(v, pm ? Number(pm.values?.[it.key]) || 0 : null, true);
      return `<div class="stack" style="gap:8px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px;flex-wrap:wrap"><span>${esc(it.label)}</span>
        <span style="display:flex;gap:12px;align-items:baseline"><span class="muted">${pct(c.S ? v / c.S : null)}</span><span style="font-weight:600" class="ltr">${mil(v)}M</span>${d.html}</span></div>
        <div class="track" style="height:8px"><div style="width:${(v / mx * 100).toFixed(1)}%;background:${COLORS.S}"></div></div></div>`; }).join('')}</div>`;
}

function ratiosCard(months, calcs, i, c) {
  const W = 600, H = 220, max = 0.6;
  const n = calcs.length;
  const x = (k) => n > 1 ? k * W / (n - 1) : W / 2;
  const y = (r) => H - Math.max(-0.05, Math.min(max, r ?? 0)) / max * H;
  const series = [['foodCost', '#F59E0B', 'الكلفة الغذائية'], ['expenseRatio', '#818CF8', 'المصاريف'], ['netMargin', '#34D399', 'الهامش الصافي']];
  const lines = series.map(([k, col]) => {
    const pts = calcs.map((cc, j) => cc[k] === null ? null : `${x(j).toFixed(1)},${y(cc[k]).toFixed(1)}`).filter(Boolean);
    return (pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` : '')
      + (calcs[i][k] !== null ? `<circle cx="${x(i).toFixed(1)}" cy="${y(calcs[i][k]).toFixed(1)}" r="5" fill="${col}"/>` : '');
  }).join('');
  return `<div class="card" style="flex:1 1 420px;gap:16px">
    <div class="card-head"><div><h2>النسب من المبيعات</h2><span class="muted">الكلفة الغذائية والمصاريف والهامش الصافي، شهر بشهر</span></div>
      <div class="stack" style="gap:6px;font-size:13px;color:var(--tx3)">${series.map(([k, col, l]) => `<span style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:3px;background:${col}"></span>${l} ${pct(c[k])}</span>`).join('')}</div></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:220px;overflow:visible" role="img" aria-label="نسب الكلفة والمصاريف والهامش عبر الأشهر">
      ${[0.15, 0.3, 0.45].map(r => `<line x1="0" x2="${W}" y1="${y(r)}" y2="${y(r)}" stroke="#1E2A44"/>`).join('')}
      <line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${H}" stroke="#60A5FA" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>${lines}</svg>
    <div style="display:flex;justify-content:${n > 1 ? 'space-between' : 'center'};font-size:12px;color:var(--tx2);direction:ltr">${months.map(mm => `<span>${esc(monthTiny(mm.id))}</span>`).join('')}</div>
    <span class="muted" style="font-size:12px">الخطوط الأفقية: 15% · 30% · 45%</span></div>`;
}

function costsCard(T, m, pm, c, name) {
  const rows = T.items.filter(it => it.section !== 'sales').map(it => ({ it, v: Number(m.values?.[it.key]) || 0, pv: pm ? Number(pm.values?.[it.key]) || 0 : null }))
    .filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
  return `<div class="card" style="flex:3 1 640px;gap:14px">
    <div class="card-head"><div><h2>أكبر 8 بنود كلفة</h2><span class="muted">${esc(name)} — مرتبة من الأكبر</span></div></div>
    <div class="scroll-x"><table class="tbl" style="min-width:560px"><thead><tr><th>البند</th><th>النوع</th><th class="num">المبلغ (د.ع)</th><th class="num">من المبيعات</th><th class="num">عن الشهر السابق</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td style="font-weight:500">${esc(x.it.label)}</td><td><span class="tag ${x.it.section === 'purchases' ? 'amber' : 'indigo'}">${x.it.section === 'purchases' ? 'مشتريات' : 'مصاريف'}</span></td>
      <td class="num">${num(x.v)}</td><td class="num" style="color:var(--tx3)">${pct(c.S ? x.v / c.S : null)}</td><td class="num">${delta(x.v, x.pv, false).html}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function insightsCard(months, i, rep, name) {
  const list = insights(months, i, rep.template, rep, { names: months.map(mm => monthShort(mm.id)), fmtMil: mil, fmtPct: (x) => pct(x) });
  return `<div class="card" style="flex:2 1 380px;gap:16px">
    <div style="display:flex;align-items:center;gap:10px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/></svg><h2>ملاحظات ${esc(name)}</h2></div>
    <span class="muted">يطلعها التطبيق تلقائياً من الأرقام</span>
    ${list.map(n => `<div class="note"><b>${esc(n.tag)}</b><span>${esc(n.text)}</span></div>`).join('')}</div>`;
}

// تصدير الشهر Excel (SheetJS) — الملف يتسوى بالمتصفح وينزل للجهاز.
async function exportExcel(rep, m, c) {
  const XLSX = await loadXLSX();
  const rows = [[rep.displayName + ' — ' + monthName(m.id)], [], ['القسم', 'البند', 'المبلغ (د.ع)', 'من المبيعات']];
  for (const s of SECTIONS) {
    for (const it of rep.template.items.filter(x => x.section === s)) {
      const v = Number(m.values?.[it.key]) || 0;
      if (it.hidden && !v) continue;
      rows.push([SECTION_LABELS[s], it.label, v, c.S ? v / c.S : null]);
    }
    const tot = { sales: c.S, purchases: c.P, expenses: c.E }[s];
    rows.push([SECTION_LABELS[s], 'المجموع', tot, c.S ? tot / c.S : null], []);
  }
  rows.push(['النتيجة', 'الربح الإجمالي', c.G, c.S ? c.G / c.S : null]);
  rows.push(['النتيجة', 'إيرادات مختلفة', c.O, c.S ? c.O / c.S : null]);
  rows.push(['النتيجة', 'نسبة الإدارة ' + pct(c.feeRate, 0), c.F, c.S ? c.F / c.S : null]);
  rows.push(['النتيجة', 'الربح الصافي', c.N, c.netMargin]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 14 }];
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = 3; r <= range.e.r; r++) {
    const a = ws[XLSX.utils.encode_cell({ r, c: 2 })], b = ws[XLSX.utils.encode_cell({ r, c: 3 })];
    if (a && typeof a.v === 'number') a.z = '#,##0.##';
    if (b && typeof b.v === 'number') b.z = '0.0%';
  }
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, m.id);
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${rep.id}-${m.id}.xlsx`;   // اسم إنكليزي حتى يشتغل بكل المتصفحات
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
