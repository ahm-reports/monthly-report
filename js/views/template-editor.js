// محرر القالب (للمدير): إضافة بند، تعديل الاسم والقسم والأسماء البديلة، تغيير الترتيب.
// ممنوع حذف بند إله قيم بأشهر محفوظة — ينسمح بس بإخفائه.
import { REPORT_IDS, getReport, listMonths, updateReport, authErrorText } from '../firebase.js';
import { SECTIONS, SECTION_LABELS } from '../calc.js';
import { normalizeArabic } from '../normalize.js';
import { esc } from '../format.js';
import { toast, loading, $, $$ } from '../ui.js';

const KEY_RE = /^[a-z][a-z0-9_]{1,30}$/;

export function mountTemplateEditor(box, ctx, names = {}) {
  box.innerHTML = `<div class="card-head"><div><h2>محرر القالب</h2>
      <span class="muted">ترتيب البنود هنا هو ترتيب عرضها بالمراجعة والجداول. الأسماء البديلة: كل اسم بسطر.</span></div>
      <div class="field" style="min-width:200px"><label for="teRep">التقرير</label><select class="input" id="teRep">${REPORT_IDS.map(id => `<option value="${id}">${esc(names[id] || id)}</option>`).join('')}</select></div></div>
    <div id="teBody">${loading()}</div>`;
  const load = async () => {
    const id = $('#teRep', box).value, body = $('#teBody', box);
    body.innerHTML = loading();
    try {
      const [rep, months] = await Promise.all([getReport(id), listMonths(id)]);
      if (!rep) { body.innerHTML = '<div class="alert warn">التقرير ما مزروع بعد.</div>'; return; }
      const used = new Set();
      for (const m of months) for (const [k, v] of Object.entries(m.values || {})) if (Number(v)) used.add(k);
      editor(body, id, rep, used);
    } catch (e) { body.innerHTML = `<div class="alert err">${esc(authErrorText(e))}</div>`; }
  };
  $('#teRep', box).addEventListener('change', load);
  load();
}

function editor(body, reportId, rep, used) {
  const items = rep.template.items.map(it => ({ ...it, rawAliases: [...(it.rawAliases || [])], summaryAliases: [...(it.summaryAliases || [])], _new: false }));
  const fixed = new Set(rep.template.fixedKeys || []);
  let dirty = false;
  const secOpts = (sel) => SECTIONS.map(s => `<option value="${s}" ${s === sel ? 'selected' : ''}>${SECTION_LABELS[s]}</option>`).join('');

  const draw = () => {
    body.innerHTML = `<div class="stack" style="gap:12px">${items.map((it, i) => `
      <div class="te-item ${it.hidden ? 'hidden-item' : ''}" data-i="${i}">
        <div class="te-top">
          <div class="te-move"><button class="btn" type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="فوق">▲</button><button class="btn" type="button" data-down="${i}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="جوة">▼</button></div>
          <div class="field"><label>المفتاح</label>${it._new ? `<input class="input num" data-f="key" value="${esc(it.key)}" placeholder="مثلاً: water" spellcheck="false" autocapitalize="none">` : `<code class="ltr te-key">${esc(it.key)}</code>`}</div>
          <div class="field"><label>الاسم المعروض</label><input class="input" data-f="label" value="${esc(it.label)}"></div>
          <div class="field"><label>القسم</label><select class="input" data-f="section">${secOpts(it.section)}</select></div>
          <div class="field"><label>بالخام مكتوب تحت</label><select class="input" data-f="movedFrom"><option value="">نفس القسم</option>${secOpts(it.movedFrom)}</select></div>
        </div>
        <div class="te-bottom">
          <div class="field"><label>أسماؤه بالقالب الخام</label><textarea class="input" rows="2" data-f="rawAliases">${esc(it.rawAliases.join('\n'))}</textarea></div>
          <div class="field"><label>أسماؤه بالملخص السنوي</label><textarea class="input" rows="2" data-f="summaryAliases">${esc(it.summaryAliases.join('\n'))}</textarea></div>
          <div class="stack" style="gap:4px;justify-content:flex-end">
            <label class="check"><input type="checkbox" data-f="fixed" ${fixed.has(it.key) ? 'checked' : ''}>كلفة ثابتة (للتعادل)</label>
            <label class="check"><input type="checkbox" data-f="hidden" ${it.hidden ? 'checked' : ''}>مخفي</label>
            ${used.has(it.key) ? '<span class="muted" style="font-size:12px">إله قيم محفوظة: ينخفى بس</span>' : `<button class="btn danger" type="button" data-del="${i}">حذف البند</button>`}
          </div>
        </div>
      </div>`).join('')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;align-items:center">
        <button class="btn" type="button" id="teAdd">+ إضافة بند</button>
        <button class="btn primary" type="button" id="teSave">حفظ القالب</button>
        <span class="muted" id="teState">${dirty ? 'أكو تغييرات ما محفوظة' : ''}</span></div>
      <div class="alert err" id="teErr" hidden></div>`;

    $$('.te-item', body).forEach(row => {
      const it = items[Number(row.dataset.i)];
      $$('[data-f]', row).forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const f = el.dataset.f;
        if (f === 'fixed') { el.checked ? fixed.add(it.key) : fixed.delete(it.key); }
        else if (f === 'hidden') it.hidden = el.checked;
        else if (f === 'rawAliases' || f === 'summaryAliases') it[f] = el.value.split('\n').map(x => x.trim()).filter(Boolean);
        else if (f === 'movedFrom') it.movedFrom = el.value || undefined;
        else if (f === 'key') { const was = it.key; it.key = el.value.trim(); if (fixed.has(was)) { fixed.delete(was); fixed.add(it.key); } }
        else it[f] = el.value;
        dirty = true; $('#teState', body).textContent = 'أكو تغييرات ما محفوظة';
        if (f === 'hidden') row.classList.toggle('hidden-item', el.checked);
      }));
    });
    $$('[data-up]', body).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.up; [items[i - 1], items[i]] = [items[i], items[i - 1]]; dirty = true; draw(); }));
    $$('[data-down]', body).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.down; [items[i + 1], items[i]] = [items[i], items[i + 1]]; dirty = true; draw(); }));
    $$('[data-del]', body).forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.del;
      if (!confirm(`تحذف البند "${items[i].label}" من القالب؟`)) return;
      fixed.delete(items[i].key); items.splice(i, 1); dirty = true; draw();
    }));
    $('#teAdd', body).addEventListener('click', () => { items.push({ key: '', label: '', section: 'expenses', rawAliases: [], summaryAliases: [], _new: true }); dirty = true; draw(); $$('.te-item', body).pop().scrollIntoView({ block: 'center' }); });
    $('#teSave', body).addEventListener('click', save);
  };

  async function save() {
    const err = $('#teErr', body);
    const problems = [];
    const keys = new Set();
    for (const it of items) {
      if (!KEY_RE.test(it.key)) problems.push(`المفتاح "${it.key || '(فارغ)'}" غير صالح: حروف إنكليزية صغيرة وأرقام و _ ويبدي بحرف.`);
      else if (keys.has(it.key)) problems.push(`المفتاح "${it.key}" مكرر.`);
      keys.add(it.key);
      if (!it.label.trim()) problems.push(`البند "${it.key}" بلا اسم معروض.`);
      if (it.movedFrom && it.movedFrom === it.section) it.movedFrom = undefined;
    }
    for (const field of ['rawAliases', 'summaryAliases']) {
      const seen = new Map();
      for (const it of items) for (const a of it[field]) {
        const n = normalizeArabic(a);
        if (seen.has(n) && seen.get(n) !== it.key) problems.push(`الاسم "${a}" مستخدم لبندين (${seen.get(n)} و${it.key}).`);
        seen.set(n, it.key);
      }
    }
    if (problems.length) { err.innerHTML = problems.map(esc).join('<br>'); err.hidden = false; return; }
    err.hidden = true;
    const template = {
      items: items.map(({ _new, ...it }) => {
        const o = { key: it.key, label: it.label.trim(), section: it.section, rawAliases: it.rawAliases, summaryAliases: it.summaryAliases };
        if (it.movedFrom) o.movedFrom = it.movedFrom;
        if (it.hidden) o.hidden = true;
        return o;
      }),
      fixedKeys: items.map(it => it.key).filter(k => fixed.has(k)),
    };
    try {
      await updateReport(reportId, { template });
      items.forEach(it => { it._new = false; });
      dirty = false; toast('انحفظ القالب'); draw();
    } catch (e) { toast(authErrorText(e), true); }
  }
  draw();
}
