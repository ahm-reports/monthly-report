// شاشة مؤقتة للأجزاء اللي تجي بالمراحل الجاية.
import { getReport } from '../firebase.js';
import { esc } from '../format.js';
import { header, bindHeader } from '../ui.js';

export async function render(root, ctx, { reportId = null, active = '', title = '', phase = 0 }) {
  let name = 'التقارير الشهرية';
  if (reportId) { try { const r = await getReport(reportId); name = r ? r.displayName : reportId; } catch { name = reportId; } }
  if (ctx.signal.aborted) return;
  root.innerHTML = `<main class="wrap">
    ${header(ctx, { title: name, reportId, active })}
    <div class="card empty"><h2>${esc(title)}</h2><p class="muted" style="margin:0">هاي الشاشة تنبني بالمرحلة ${phase}.</p></div>
  </main>`;
  bindHeader(root, ctx);
}
