// شاشة الدخول: يوزر وباسورد فقط.
import { login, authErrorText } from '../firebase.js';
import { ICONS, $ } from '../ui.js';

export function render(root) {
  root.innerHTML = `<main class="wrap narrow">
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding-top:24px">
      <div class="logo big">${ICONS.logo(34)}</div>
      <h1 class="page" style="font-size:24px">التقارير الشهرية</h1>
    </div>
    <form id="loginForm" class="stack" style="gap:18px" novalidate>
      <span style="font-size:15px;color:var(--tx3);text-align:center">سجّل دخولك للمتابعة</span>
      <div class="field"><label for="u">اسم المستخدم</label>
        <input class="input big num" id="u" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="pw">كلمة المرور</label>
        <input class="input big num" id="pw" name="password" type="password" autocomplete="current-password" required></div>
      <div class="alert err" id="loginErr" role="alert" hidden></div>
      <button type="submit" class="btn primary block" id="loginBtn" style="margin-top:6px">دخول</button>
      <span class="muted" style="text-align:center;line-height:1.7">الحسابات ينشئها المدير فقط. إذا ما عندك حساب، اطلبه من المدير.</span>
    </form>
  </main>`;
  const form = $('#loginForm', root), err = $('#loginErr', root), btn = $('#loginBtn', root);
  $('#u', root).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#u', root).value.trim(), p = $('#pw', root).value;
    if (!u || !p) { err.textContent = 'اكتب اسم المستخدم وكلمة المرور.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'جاري الدخول…'; err.hidden = true;
    try { await login(u, p); }
    catch (ex) { err.textContent = authErrorText(ex); err.hidden = false; btn.disabled = false; btn.textContent = 'دخول'; }
  });
}
