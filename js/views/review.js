// شاشة المراجعة — مشتركة بين "إدراج شهر" و"تعديل شهر".
// البنود مقسمة حسب القالب، كل بند حقل، والنتيجة على الجانب تتحدث مباشرة.
import { calcMonth, SECTIONS, SECTION_LABELS } from '../calc.js';
import { parseNumber, normalizeArabic } from '../normalize.js';
import { resolveUnknown } from '../parse-raw.js';
import { num, pct, esc } from '../format.js';
import { ICONS, $, $$ } from '../ui.js';

const SEC_COLORS = { sales: '#93C5FD', purchases: '#FCD34D', expenses: '#C7D2FE' };
const FROM_LABEL = { sales: 'الإيرادات', purchases: 'المشتريات', expenses: 'المصاريف' };

// opts: { template, settings, values, other, flags, unknown, checks, warnings, canEditTemplate,
//         saveLabel, onSave: async ({ values, other, template, templateChanged }) => void }
export function mountReview(box, opts) {
  const state = {
    result: { values: { ...opts.values }, flags: { ...(opts.flags || {}) }, unknown: [...(opts.unknown || [])] },
    template: opts.template,
    templateChanged: false,
    other: Number(opts.other) || 0,
    saving: false,
  };
  const items = (s) => state.template.items.filter(it => it.section === s && (!it.hidden || state.result.values[it.key]));

  function render() {
    const { flags, unknown } = state.result;
    const missing = state.template.items.filter(it => flags[it.key]?.missing);
    const notInFile = state.template.items.filter(it => flags[it.key]?.notInFile);
    const alerts = [];
    if (missing.length) alerts.push(`<div class="alert warn">${ICONS.warn}<span>${missing.map(it => esc(it.label)).join('، ')} ${missing.length > 1 ? 'ما بيها أرقام' : 'ما بيها رقم'} بالملف. اكتب الرقم إذا أكو فاتورة، أو اتركها صفر.</span></div>`);
    if (notInFile.length) alerts.push(`<div class="alert warn">${ICONS.warn}<span>هاي البنود ما موجودة بالملف أصلاً، وقيمتها 0: ${notInFile.map(it => esc(it.label)).join('، ')}.</span></div>`);
    for (const w of opts.warnings || []) alerts.push(`<div class="alert ${w.type === 'numericName' ? 'err' : 'warn'}" role="alert">${ICONS.warn}<span>${esc(w.text)}</span></div>`);
    if (opts.checks && opts.checks.length && opts.checks.every(c => c.ok)) {
      alerts.push(`<div class="alert ok"><span>✓ تحقق المجاميع: ${opts.checks.map(c => `${esc(c.label)} ${num(c.fileTotal)}`).join(' · ')} — كلها مطابقة.</span></div>`);
    }

    const options = SECTIONS.map(s => `<optgroup label="${SECTION_LABELS[s]}">${items(s).map(it => `<option value="${it.key}">${esc(it.label)}</option>`).join('')}</optgroup>`).join('');
    const unknownCard = unknown.length ? `<section class="card" style="border-color:#5A3D0E" aria-labelledby="unkTitle">
      <div class="card-head"><div><h2 id="unkTitle" style="color:#FDE68A">بنود غير معروفة (${unknown.length})</h2>
      <span class="muted">اختار البند المناسب لكل اسم. ما ينسمح بالحفظ قبل ما تنحل كلها.
      ${opts.canEditTemplate ? 'الاسم ينضاف للقالب حتى يتعرف عليه التطبيق بالأشهر الجاية.' : 'الاسم ما ينحفظ بالقالب: اطلب من المدير يضيفه حتى يتعرف عليه بالأشهر الجاية.'}</span></div></div>
      <div class="scroll-x"><table class="tbl" style="min-width:560px"><thead><tr><th>الاسم بالملف</th><th>القسم بالملف</th><th class="num">المبلغ</th><th>البند بالتطبيق</th><th></th></tr></thead><tbody>
      ${unknown.map((u, i) => `<tr><td><b>${esc(u.name)}</b><div class="muted">الصف ${u.row}</div></td><td>${esc(FROM_LABEL[u.section] || '—')}</td><td class="num">${num(u.value)}</td>
        <td><select class="input" style="min-height:44px" id="unk_${i}" aria-label="البند المناسب لـ ${esc(u.name)}"><option value="">اختار…</option>${options}</select></td>
        <td><button class="btn" type="button" data-resolve="${i}">ربط</button></td></tr>`).join('')}
      </tbody></table></div></section>` : '';

    const groups = SECTIONS.map(s => `<div class="card" style="flex:1 1 300px;border-radius:18px;padding:20px;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="font-size:16px;color:${SEC_COLORS[s]}">${SECTION_LABELS[s]}</h2><span style="font-weight:600" id="tot_${s}"></span></div>
      ${items(s).map(it => field(it)).join('')}
      ${s === 'expenses' ? `<div class="field" style="gap:6px"><label for="f__other" style="font-size:13px">إيرادات مختلفة (تضاف للربح)</label>
        <input class="input num" style="min-height:44px;border-radius:10px" id="f__other" inputmode="decimal" autocomplete="off" value="${fmt(state.other)}"></div>` : ''}
    </div>`).join('');

    box.innerHTML = `${alerts.length ? `<div class="stack" style="gap:10px">${alerts.join('')}</div>` : ''}
      ${unknownCard}
      <section class="row" style="align-items:flex-start">
        <div style="flex:3 1 700px;min-width:0;display:flex;flex-wrap:wrap;gap:16px">${groups}</div>
        <aside class="card hero" style="flex:1 1 320px;gap:14px;position:sticky;top:16px" aria-live="polite">
          <h2>النتيجة قبل الحفظ</h2><span class="muted">تتحدث مباشرة مع كل تعديل</span>
          <div id="rvSum" class="stack" style="gap:14px"></div>
          <div class="alert warn" id="rvBlock" hidden></div>
          <button class="btn primary block" type="button" id="rvSave">${esc(opts.saveLabel || 'حفظ الشهر')}</button>
        </aside>
      </section>`;

    $$('input[data-key]', box).forEach(inp => {
      inp.addEventListener('input', () => { state.result.values[inp.dataset.key] = parseNumber(inp.value) ?? 0; update(); });
      inp.addEventListener('blur', () => { inp.value = fmt(state.result.values[inp.dataset.key]); });
    });
    const o = $('#f__other', box);
    o.addEventListener('input', () => { state.other = parseNumber(o.value) ?? 0; update(); });
    o.addEventListener('blur', () => { o.value = fmt(state.other); });
    $$('[data-resolve]', box).forEach(btn => btn.addEventListener('click', () => {
      const i = Number(btn.dataset.resolve), key = $(`#unk_${i}`, box).value;
      if (!key) { $(`#unk_${i}`, box).focus(); return; }
      const u = state.result.unknown[i];
      const r = resolveUnknown(state.result, state.template, u.name, key);
      state.result = r.result;
      if (opts.canEditTemplate) { state.template = r.template; state.templateChanged = true; }
      render();
    }));
    $('#rvSave', box).addEventListener('click', save);
    update();
  }

  function field(it) {
    const f = state.result.flags[it.key] || {};
    const tags = [];
    if (f.movedFrom) tags.push(`<span class="tag indigo" style="font-size:11px;padding:3px 8px">منقول من ${FROM_LABEL[f.movedFrom]}</span>`);
    if (f.missing) tags.push(`<span class="tag amber" style="font-size:11px;padding:3px 8px">ناقص بالملف</span>`);
    if (f.notInFile) tags.push(`<span class="tag amber" style="font-size:11px;padding:3px 8px">ما موجود بالملف</span>`);
    if (f.resolved) tags.push(`<span class="tag green" style="font-size:11px;padding:3px 8px">من بند غير معروف</span>`);
    const flagged = f.missing || f.notInFile;
    const raw = f.rawName && normalizeArabic(f.rawName) !== normalizeArabic(it.label) ? `<span class="muted" style="font-size:12px">بالملف: ${esc(f.rawName)}</span>` : '';
    return `<div class="field" style="gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><label for="f_${it.key}" style="font-size:13px">${esc(it.label)}</label><span style="display:flex;gap:4px;flex-wrap:wrap">${tags.join('')}</span></div>
      <input class="input num" style="min-height:44px;border-radius:10px;${flagged ? 'border-color:#B45309' : ''}" id="f_${it.key}" data-key="${it.key}" inputmode="decimal" autocomplete="off" value="${fmt(state.result.values[it.key])}">
      ${raw}</div>`;
  }

  function update() {
    const c = calcMonth({ values: state.result.values, other_revenue: state.other }, state.template, opts.settings);
    SECTIONS.forEach(s => { const el = $(`#tot_${s}`, box); if (el) el.textContent = num({ sales: c.S, purchases: c.P, expenses: c.E }[s]); });
    const pc = (x) => c.S ? ` (${pct(x / c.S)})` : '';
    const row = (label, value, color, big) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:${big ? 17 : 14}px;font-weight:${big ? 700 : 500};color:${color || 'var(--tx)'};${big ? 'border-top:1px solid var(--line2);padding-top:12px' : ''}"><span>${label}</span><span class="ltr">${value}</span></div>`;
    $('#rvSum', box).innerHTML =
      row('المبيعات', num(c.S)) +
      row('المشتريات' + pc(c.P), '− ' + num(c.P), '#FCD34D') +
      row('المصاريف' + pc(c.E), '− ' + num(c.E), '#C7D2FE') +
      row('الربح الإجمالي', num(c.G), c.G < 0 ? 'var(--bad)' : '', true) +
      row('+ إيرادات مختلفة', num(c.O), 'var(--tx3)') +
      row(`نسبة الإدارة ${pct(c.feeRate, 0)}`, '− ' + num(c.F), '#F9A8D4') +
      row('الربح الصافي' + pc(c.N), num(c.N), c.N < 0 ? 'var(--bad)' : 'var(--profit)', true);
    const blocked = state.result.unknown.length;
    const blk = $('#rvBlock', box), btn = $('#rvSave', box);
    blk.hidden = !blocked;
    if (blocked) blk.textContent = `حل البنود غير المعروفة (${blocked}) قبل الحفظ.`;
    btn.disabled = !!blocked || state.saving;
  }

  async function save() {
    if (state.result.unknown.length || state.saving) return;
    state.saving = true; update();
    const btn = $('#rvSave', box); btn.textContent = 'جاري الحفظ…';
    try {
      await opts.onSave({ values: { ...state.result.values }, other: state.other, template: state.template, templateChanged: state.templateChanged });
    } finally {
      state.saving = false;
      if (btn.isConnected) { btn.textContent = opts.saveLabel || 'حفظ الشهر'; update(); }
    }
  }

  render();
}

function fmt(v) { return typeof v === 'number' && isFinite(v) ? num(v).replace('−', '-') : '0'; }
