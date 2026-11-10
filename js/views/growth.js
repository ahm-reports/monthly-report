// النمو: خريطة تغير الأقسام وبنود القالب شهر بشهر، "عن الشهر السابق" أو "عن أول شهر".
import { getReport, listMonths } from '../firebase.js';
import { calcMonth, growth, itemsOf, SECTIONS, SECTION_LABELS } from '../calc.js';
import { mil, monthShort, esc } from '../format.js';
import { header, bindHeader, loading, ICONS, $$ } from '../ui.js';

const modes = {}; // reportId → 'mom' | 'base'

export async function render(root, ctx, reportId) {
  root.innerHTML = `<main class="wrap">${loading()}</main>`;
  const [rep, months] = await Promise.all([getReport(reportId), listMonths(reportId)]);
  if (ctx.signal.aborted) return;
  if (!rep) { root.innerHTML = `<main class="wrap"><div class="alert err">التقرير ما مزروع بعد.</div></main>`; return; }
  const shell = (body) => `<main class="wrap">${header(ctx, { title: rep.displayName, kicker: 'النمو', reportId, active: 'growth' })}${body}</main>`;

  if (months.length < 2) {
    root.innerHTML = shell(`<div class="card empty"><span class="tag gray">${months.length ? 'شهر واحد فقط' : 'بانتظار البيانات'}</span>
      <h2>النمو يحتاج شهرين على الأقل</h2>
      <p class="muted" style="margin:0">${months.length ? `محفوظ لهذا التقرير شهر واحد (${esc(monthShort(months[0].id))}). أول ما تدرج الشهر الجاي، تطلع هنا المقارنة.` : 'ماكو ولا شهر محفوظ بعد.'}</p>
      ${ctx.canEdit() ? `<a class="btn primary" href="#/r/${reportId}/import">${ICONS.plus}إدراج شهر</a>` : ''}</div>`);
    bindHeader(root, ctx);
    return;
  }

  const T = rep.template;
  const C = months.map(m => calcMonth(m, T, rep));
  const v = (k, key) => Number(months[k].values?.[key]) || 0;
  const draw = () => {
    const mom = (modes[reportId] || 'mom') === 'mom';
    const base = monthShort(months[0].id);
    const defs = [];
    for (const s of SECTIONS) {
      const tot = { sales: 'S', purchases: 'P', expenses: 'E' }[s];
      defs.push({ label: SECTION_LABELS[s], f: k => C[k][tot], upGood: s === 'sales', lvl: 1 });
      for (const it of itemsOf(T, s)) defs.push({ label: it.label, f: k => v(k, it.key), upGood: s === 'sales', lvl: 2 });
    }
    defs.push({ label: 'الربح الإجمالي', f: k => C[k].G2, upGood: true, lvl: 1 });
    defs.push({ label: 'الربح الصافي', f: k => C[k].N, upGood: true, lvl: 1 });

    const cols = months.slice(1);
    const rows = defs.map(d => {
      const head = `<th scope="row" class="g-head ${d.lvl === 1 ? 'top' : ''}">${esc(d.label)}</th>`;
      const cells = cols.map((_, j) => {
        const k = j + 1, a = d.f(k), b = mom ? d.f(k - 1) : d.f(0);
        const r = growth(a, b);
        const title = `${d.label} — ${monthShort(months[k].id)}: ${mil(a)} مليون`;
        if (r === null) return `<td class="g-cell" style="background:var(--inset);color:var(--tx2)" title="${esc(title)}">—</td>`;
        const good = d.upGood ? r >= 0 : r <= 0, mag = Math.min(Math.abs(r) / 0.4, 1);
        const alpha = Math.round((0.12 + mag * 0.45) * 255).toString(16).padStart(2, '0');
        const bg = Math.abs(r) < 0.005 ? '#1E2A44' : (good ? '#2DD4BF' : '#FB923C') + alpha;
        const arrow = Math.abs(r) < 0.005 ? '' : r > 0 ? '▲ ' : '▼ ';
        return `<td class="g-cell" style="background:${bg};${d.lvl === 1 ? 'font-weight:700' : ''}" title="${esc(title)}">${arrow}${(Math.abs(r) * 100).toFixed(1)}%</td>`;
      }).join('');
      return `<tr>${head}${cells}</tr>`;
    }).join('');

    // بطاقات الملخص
    const gr = C.slice(1).map((c, j) => growth(c.S, mom ? C[j].S : C[0].S));
    const valid = gr.map((r, j) => ({ r, k: j + 1 })).filter(x => x.r !== null);
    // المعدل الشهري الحقيقي (مركّب): (آخر شهر ÷ أول شهر) ^ (1 ÷ عدد الفترات) − 1
    // بوضع "عن أول شهر": التغير الكلي من أول شهر لآخر شهر.
    const first = C[0].S, last = C[C.length - 1].S, periods = C.length - 1;
    const total = growth(last, first);
    const avg = total === null || !(last > 0) ? null : (mom ? Math.pow(last / first, 1 / periods) - 1 : total);
    const best = valid.reduce((a, x) => (!a || x.r > a.r ? x : a), null), worst = valid.reduce((a, x) => (!a || x.r < a.r ? x : a), null);
    const year = months[months.length - 1].id.slice(0, 4);
    const ytdIdx = months.map((m, k) => (m.id.startsWith(year) ? k : -1)).filter(k => k >= 0);
    const ytdS = ytdIdx.reduce((a, k) => a + C[k].S, 0), ytdN = ytdIdx.reduce((a, k) => a + C[k].N, 0);
    const sgn = (r) => r === null ? '—' : (r >= 0 ? '+' : '−') + Math.abs(r * 100).toFixed(1) + '%';
    const cmp = (k) => mom ? `${monthShort(months[k].id)} مقارنة بـ ${monthShort(months[k - 1].id)}` : `${monthShort(months[k].id)} مقارنة بـ ${base}`;
    const stat = (label, value, sub, color) => `<div class="card" style="border-radius:18px;padding:20px;gap:8px"><span style="font-size:13px;color:var(--tx3)">${label}</span><span style="font-size:28px;font-weight:700;color:${color}"><bdi dir="ltr">${value}</bdi></span><span class="muted">${sub}</span></div>`;
    const stats = `<section class="stat-grid">
      ${stat(mom ? 'معدل النمو الشهري للمبيعات' : 'تغير المبيعات عن ' + base, sgn(avg),
        mom ? `بالشهر، من ${monthShort(months[0].id)} لـ ${monthShort(months[months.length - 1].id)} (الكلي ${sgn(total)})` : `من ${monthShort(months[0].id)} لـ ${monthShort(months[months.length - 1].id)}`,
        avg === null ? 'var(--tx2)' : avg >= 0 ? 'var(--good)' : 'var(--bad)')}
      ${stat(mom ? 'أقوى شهر نمو' : 'أعلى شهر عن ' + base, best ? sgn(best.r) : '—', best ? cmp(best.k) : '—', best && best.r >= 0 ? 'var(--good)' : 'var(--bad)')}
      ${stat(mom ? 'أكبر تراجع' : 'أدنى شهر عن ' + base, worst ? sgn(worst.r) : '—', worst ? cmp(worst.k) : '—', worst && worst.r >= 0 ? 'var(--good)' : 'var(--bad)')}
      ${stat('من بداية السنة', mil(ytdN) + '</bdi> <bdi>مليون', `ربح صافي من مبيعات ${mil(ytdS)} مليون`, ytdN < 0 ? 'var(--bad)' : 'var(--tx)')}
    </section>`;

    root.innerHTML = shell(`${stats}
      <section class="card">
        <div class="card-head"><div><h2>خريطة النمو</h2><span class="muted">${mom ? 'كل خلية: نسبة التغير مقارنة بالشهر اللي قبله' : `كل خلية: نسبة التغير مقارنة بـ ${esc(base)} (أول شهر محفوظ)`}</span></div>
          <div class="seg" role="group" aria-label="طريقة المقارنة">
            <button type="button" data-mode="mom" class="${mom ? 'on' : ''}" aria-pressed="${mom}">عن الشهر السابق</button>
            <button type="button" data-mode="base" class="${!mom ? 'on' : ''}" aria-pressed="${!mom}">عن أول شهر</button></div></div>
        <div class="legend"><span><i style="background:#2DD4BF8C"></i>تحسن (مبيعات أو ربح أعلى، كلفة أقل)</span><span><i style="background:#FB923C8C"></i>تراجع</span><span class="muted">كلما كان اللون أغمق، كان التغير أكبر</span></div>
        <div class="scroll-x"><table class="growth-tbl" style="min-width:${Math.max(420, 180 + cols.length * 90)}px">
          <thead><tr><th class="g-head" style="color:var(--tx2);font-weight:500">البند</th>${cols.map(m => `<th>${esc(monthShort(m.id))}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody></table></div>
      </section>`);
    bindHeader(root, ctx);
    $$('[data-mode]', root).forEach(b => b.addEventListener('click', () => { modes[reportId] = b.dataset.mode; draw(); }));
  };
  draw();
}
