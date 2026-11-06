// الأشهر: قائمة الأشهر المحفوظة، وتعديل أي شهر بنفس شاشة المراجعة.
import { getReport, listMonths, getMonth, saveMonth, deleteMonth, authErrorText } from '../firebase.js';
import { calcMonth } from '../calc.js';
import { monthName, num, esc } from '../format.js';
import { header, bindHeader, loading, toast, ICONS, $, $$ } from '../ui.js';
import { mountReview } from './review.js';

const SOURCE = { raw: ['القالب الخام', 'blue'], summary: ['الملخص السنوي', 'gray'] };

export async function render(root, ctx, reportId) {
  root.innerHTML = `<main class="wrap">${loading()}</main>`;
  const [rep, months] = await Promise.all([getReport(reportId), listMonths(reportId)]);
  if (ctx.signal.aborted) return;
  if (!rep) { root.innerHTML = `<main class="wrap"><div class="alert err">التقرير ما مزروع بعد.</div></main>`; return; }
  const canEdit = ctx.canEdit();

  const body = !months.length
    ? `<div class="card empty"><span class="tag gray">بانتظار البيانات</span><h2>ماكو ولا شهر محفوظ</h2>
        ${canEdit ? `<a class="btn primary" href="#/r/${reportId}/import">${ICONS.plus}إدراج أول شهر</a>` : '<span class="muted">اطلب من المحرر يدرج أول شهر.</span>'}</div>`
    : `<section class="card"><div class="card-head"><div><h2>الأشهر المحفوظة (${months.length})</h2><span class="muted">المبالغ بالدينار. الأرقام تنحسب من البنود.</span></div></div>
      <div class="scroll-x"><table class="tbl" style="min-width:760px"><thead><tr>
        <th>الشهر</th><th class="num">المبيعات</th><th class="num">المشتريات</th><th class="num">المصاريف</th><th class="num">الربح الصافي</th><th>المصدر</th><th></th></tr></thead><tbody>
      ${[...months].reverse().map(m => {
        const c = calcMonth(m, rep.template, rep), src = SOURCE[m.source] || ['—', 'gray'];
        return `<tr><td><b>${esc(monthName(m.id))}</b></td><td class="num">${num(c.S)}</td><td class="num">${num(c.P)}</td><td class="num">${num(c.E)}</td>
          <td class="num" style="font-weight:600;color:${c.N < 0 ? 'var(--bad)' : 'var(--profit)'}">${num(c.N)}</td>
          <td><span class="tag ${src[1]}">${src[0]}</span></td>
          <td style="white-space:nowrap">${canEdit ? `<a class="btn" href="#/r/${reportId}/months/${m.id}">تعديل</a>` : ''}
            ${ctx.isAdmin() ? `<button class="btn danger" type="button" data-del="${m.id}" aria-label="حذف ${esc(monthName(m.id))}">حذف</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;

  root.innerHTML = `<main class="wrap">${header(ctx, { title: rep.displayName, reportId, active: 'months' })}${body}</main>`;
  bindHeader(root, ctx);
  $$('[data-del]', root).forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.del;
    if (!confirm(`متأكد تريد تحذف شهر ${monthName(id)}؟ ما ينرجع بعد الحذف.`)) return;
    try { await deleteMonth(reportId, id); toast('انحذف الشهر'); render(root, ctx, reportId); }
    catch (e) { toast(authErrorText(e), true); }
  }));
}

export async function renderEdit(root, ctx, reportId, monthId) {
  root.innerHTML = `<main class="wrap">${loading()}</main>`;
  const [rep, m] = await Promise.all([getReport(reportId), getMonth(reportId, monthId)]);
  if (ctx.signal.aborted) return;
  if (!rep || !m) { root.innerHTML = `<main class="wrap"><div class="alert err">الشهر ما موجود.</div><a class="btn" href="#/r/${reportId}/months">رجوع للأشهر</a></main>`; return; }
  root.innerHTML = `<main class="wrap">${header(ctx, { title: 'تعديل ' + monthName(monthId), kicker: rep.displayName, reportId, active: 'months' })}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><a class="btn" href="#/r/${reportId}/months">→ رجوع للأشهر</a>
      <span class="tag ${m.source === 'summary' ? 'gray' : 'blue'}">${(SOURCE[m.source] || ['—'])[0]}</span></div>
    <div id="review" class="stack" style="gap:22px"></div></main>`;
  bindHeader(root, ctx);
  const values = Object.fromEntries(rep.template.items.map(it => [it.key, Number(m.values?.[it.key]) || 0]));
  for (const [k, v] of Object.entries(m.values || {})) if (!(k in values)) values[k] = v;   // قيم بنود محذوفة من القالب تبقى
  mountReview($('#review', root), {
    template: rep.template, settings: rep, values, other: m.other_revenue || 0, saveLabel: 'حفظ التعديلات',
    canEditTemplate: false,
    onSave: async ({ values, other }) => {
      try {
        await saveMonth(reportId, monthId, { values, other_revenue: other, source: m.source || 'raw' });
        toast('انحفظت التعديلات');
        location.hash = `#/r/${reportId}/months`;
      } catch (e) { console.error(e); toast(authErrorText(e), true); }
    },
  });
}
