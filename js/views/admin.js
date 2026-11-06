// شاشة المدير: إعدادات التقارير + زرع القوالب + المستخدمين.
import {
  REPORT_IDS, ROLES, getReport, seedReport, updateReport,
  listUsers, updateUser, createUserAccount, authErrorText, USERNAME_RE, normalizeUsername
} from '../firebase.js';
import { esc } from '../format.js';
import { header, bindHeader, loading, toast, $, $$ } from '../ui.js';
import { mountSummaryImport } from './summary-import.js';

export async function render(root, ctx) {
  let names = {};
  root.innerHTML = `<main class="wrap">
    ${header(ctx, { title: 'شاشة المدير', kicker: 'الإدارة' })}
    <section class="card"><div class="card-head"><div><h2>التقارير</h2><span class="muted">الاسم المعروض ونسبة الإدارة لكل تقرير</span></div>
      <button class="btn" type="button" id="seedAll">زرع القوالب</button></div>
      <div id="reports">${loading()}</div></section>
    <section class="card"><div class="card-head"><div><h2>المستخدمين</h2><span class="muted">ماكو تسجيل ذاتي. الحسابات تنشأ من هنا فقط.</span></div></div>
      <form id="newUser" class="form-grid" novalidate autocomplete="off">
        <div class="field"><label for="nu">اسم المستخدم الجديد</label><input class="input num" id="nu" name="new-user-name" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="مثلاً: ali" readonly required></div>
        <div class="field"><label for="np">كلمة مرور الحساب الجديد</label><input class="input num" id="np" name="new-user-pass" type="password" autocomplete="new-password" minlength="6" readonly required></div>
        <div class="field"><label for="nr">الدور</label><select class="input" id="nr">${roleOptions('viewer')}</select></div>
        <div class="field"><span class="label">التقارير</span><div style="display:flex;gap:14px;flex-wrap:wrap" id="nrep">${reportChecks([], 'n')}</div></div>
        <button class="btn primary" type="submit" id="nuBtn">إنشاء حساب</button>
      </form>
      <div class="alert err" id="nuErr" role="alert" hidden></div>
      <div class="scroll-x" id="users">${loading()}</div></section>
    <section class="card" id="summaryImport"></section>
    <section class="card dashed"><h2>محرر القالب</h2><span class="muted">يجي بالمرحلة 6.</span></section>
  </main>`;
  bindHeader(root, ctx);
  // يمنع المتصفح من تعبئة يوزر وباسورد المدير بخانات الحساب الجديد
  $$('#nu, #np', root).forEach(i => ['pointerdown', 'focus', 'keydown'].forEach(ev =>
    i.addEventListener(ev, () => i.removeAttribute('readonly'), { once: true })));

  async function loadReports() {
    const box = $('#reports', root);
    const reps = await Promise.all(REPORT_IDS.map(async id => {
      try { return { id, rep: await getReport(id) }; } catch (e) { return { id, err: e }; }
    }));
    if (ctx.signal.aborted) return;
    names = Object.fromEntries(reps.map(r => [r.id, r.rep ? r.rep.displayName : r.id]));
    const nrep = $('#nrep', root), keep = $$('input:checked', nrep).map(c => c.value);
    nrep.innerHTML = reportChecks(keep, 'n');
    box.innerHTML = `<div class="row">${reps.map(({ id, rep, err }) => {
      if (err) return `<div class="alert err" style="flex:1 1 300px">${esc(id)}: ${esc(authErrorText(err))} — تأكد إن <code>${esc(id)}</code> موجود بقائمة reports بمستند حسابك.</div>`;
      if (!rep) return `<div class="card dashed" style="flex:1 1 300px;padding:18px"><b>${esc(id)}</b><span class="muted">ما مزروع بعد. دوس "زرع القوالب".</span></div>`;
      return `<form class="card" data-report="${id}" style="flex:1 1 320px;padding:18px;gap:14px;background:var(--inset)">
        <div style="display:flex;justify-content:space-between;align-items:center"><b class="ltr">${esc(id)}</b><span class="tag gray">${rep.template?.items?.length || 0} بند بالقالب</span></div>
        <div class="field"><label for="dn_${id}">الاسم المعروض</label><input class="input" id="dn_${id}" value="${esc(rep.displayName)}" required maxlength="60"></div>
        <div class="field"><label for="fr_${id}">نسبة الإدارة (%)</label><input class="input num" id="fr_${id}" inputmode="decimal" value="${+(rep.feeRate * 100).toFixed(4)}" required></div>
        <button class="btn" type="submit">حفظ</button></form>`;
    }).join('')}</div>`;
    $$('form[data-report]', box).forEach(f => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = f.dataset.report;
      const displayName = $(`#dn_${id}`, f).value.trim();
      const fee = Number($(`#fr_${id}`, f).value.replace(/[^0-9.]/g, ''));
      if (!displayName) return toast('اكتب اسم التقرير.', true);
      if (!(fee >= 0 && fee < 100)) return toast('نسبة الإدارة لازم تكون بين 0 و 99.', true);
      try { await updateReport(id, { displayName, feeRate: fee / 100 }); toast('انحفظت إعدادات ' + displayName); loadReports(); loadUsers(); }
      catch (ex) { toast(authErrorText(ex), true); }
    }));
  }

  $('#seedAll', root).addEventListener('click', async () => {
    const btn = $('#seedAll', root); btn.disabled = true;
    try {
      const done = [];
      for (const [i, id] of REPORT_IDS.entries()) if (await seedReport(id, i + 1)) done.push(id);
      toast(done.length ? 'انزرع: ' + done.join('، ') : 'القوالب مزروعة من قبل. ما تغير شي.');
      loadReports();
    } catch (ex) { toast(authErrorText(ex), true); }
    finally { btn.disabled = false; }
  });

  async function loadUsers() {
    const box = $('#users', root);
    let users;
    try { users = await listUsers(); } catch (e) { box.innerHTML = `<div class="alert err">${esc(authErrorText(e))}</div>`; return; }
    if (ctx.signal.aborted) return;
    box.innerHTML = `<table class="tbl" style="min-width:720px"><thead><tr><th>اسم المستخدم</th><th>الدور</th><th>التقارير</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${users.map(u => {
        const self = u.uid === ctx.user.uid;
        return `<tr data-uid="${u.uid}">
          <td><b class="ltr">${esc(u.username)}</b>${self ? ' <span class="tag blue">إنت</span>' : ''}</td>
          <td><select class="input" style="min-height:44px" data-f="role" ${self ? 'disabled title="ما تكدر تغير دورك"' : ''} aria-label="دور ${esc(u.username)}">${roleOptions(u.role)}</select></td>
          <td><div style="display:flex;gap:12px;flex-wrap:wrap">${reportChecks(u.reports || [], u.uid)}</div></td>
          <td><label class="check"><input type="checkbox" data-f="active" ${u.active ? 'checked' : ''} ${self ? 'disabled' : ''}>${u.active ? 'مفعّل' : 'موقوف'}</label></td>
          <td><button class="btn" type="button" data-save>حفظ</button></td></tr>`;
      }).join('')}</tbody></table>
      <p class="muted" style="line-height:1.8">لتغيير كلمة مرور مستخدم: من لوحة Firebase ← Authentication (التفاصيل بالـ README). الحساب الموقوف ما يكدر يشوف أي تقرير.</p>`;
    $$('tr[data-uid]', box).forEach(tr => $('[data-save]', tr).addEventListener('click', async () => {
      const data = {
        role: $('[data-f="role"]', tr).value,
        active: $('[data-f="active"]', tr).checked,
        reports: $$('input[data-rep]', tr).filter(c => c.checked).map(c => c.value),
      };
      if (tr.dataset.uid === ctx.user.uid) { delete data.role; delete data.active; }
      try { await updateUser(tr.dataset.uid, data); toast('انحفظ المستخدم'); loadUsers(); }
      catch (ex) { toast(authErrorText(ex), true); }
    }));
  }

  $('#newUser', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#nuErr', root), btn = $('#nuBtn', root);
    const username = normalizeUsername($('#nu', root).value), password = $('#np', root).value;
    const role = $('#nr', root).value, reports = $$('#nrep input:checked', root).map(c => c.value);
    err.hidden = true;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (!USERNAME_RE.test(username)) return fail('اسم المستخدم: 3 أحرف أو أكثر، حروف إنكليزية صغيرة وأرقام و . _ - فقط.');
    if (password.length < 6) return fail('كلمة المرور لازم تكون 6 أحرف أو أكثر.');
    if (!reports.length) return fail('اختار تقرير واحد على الأقل.');
    btn.disabled = true;
    try {
      await createUserAccount({ username, password, role, reports });
      toast('انعمل الحساب: ' + username);
      e.target.reset();
      loadUsers();
    } catch (ex) { fail(ex.code ? authErrorText(ex) : ex.message); }
    finally { btn.disabled = false; }
  });

  function reportChecks(selected, prefix) {
    return REPORT_IDS.map(id => `<label class="check"><input type="checkbox" data-rep value="${id}" ${selected.includes(id) ? 'checked' : ''}>${esc(names[id] || id)}</label>`).join('');
  }
  await loadReports();
  mountSummaryImport($('#summaryImport', root), ctx, names);
  await loadUsers();
}

function roleOptions(sel) {
  return Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
}
