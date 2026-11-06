// أدوات صغيرة للواجهة.
import { esc } from './format.js';
export { esc };

export const ICONS = {
  logo: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  warn: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
};

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

let toastTimer;
export function toast(msg, isErr = false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

export function loading() { return `<div class="empty"><div class="spinner" aria-label="جاري التحميل"></div></div>`; }

// شريط العنوان المشترك لكل الشاشات
export function header(ctx, { active = '', title = '', kicker = 'التقرير الشهري', reportId = null } = {}) {
  const p = ctx.profile;
  const canEdit = p.role === 'admin' || p.role === 'editor';
  const r = reportId;
  const link = (href, label, key) => `<a class="btn ${active === key ? 'on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  const nav = r ? [
    link(`#/r/${r}`, 'الملخص', 'dash'),
    link(`#/r/${r}/growth`, 'النمو', 'growth'),
    link(`#/r/${r}/months`, 'الأشهر', 'months'),
    canEdit ? `<a class="btn primary" href="#/r/${r}/import">${ICONS.plus}إدراج شهر جديد</a>` : '',
  ].join('') : '';
  return `<header class="app-header">
    <div class="brand">
      <div class="logo">${ICONS.logo()}</div>
      <div class="brand-text"><span class="k">${esc(kicker)}</span><h1 class="t">${esc(title)}</h1></div>
      <a class="btn pill" href="#/">تبديل التقرير</a>
    </div>
    <nav class="nav" aria-label="القائمة">
      ${nav}
      <div class="menu">
        <button class="avatar" type="button" id="userMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="المستخدم: ${esc(p.username)}">${esc((p.username || '?')[0].toUpperCase())}</button>
        <div class="menu-pop" id="userMenu" hidden>
          <div class="who">${esc(p.username)}</div>
          ${p.role === 'admin' ? `<a class="btn" href="#/admin">شاشة المدير</a>` : ''}
          <a class="btn" href="#/compare">مقارنة التقريرين</a>
          <button class="btn" type="button" data-action="logout">خروج</button>
        </div>
      </div>
    </nav>
  </header>`;
}

export function bindHeader(root, ctx) {
  const btn = $('#userMenuBtn', root), pop = $('#userMenu', root);
  if (!btn) return;
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); });
  document.addEventListener('click', (e) => { if (!pop.contains(e.target)) close(); }, { signal: ctx.signal });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { signal: ctx.signal });
  $('[data-action="logout"]', root).addEventListener('click', () => ctx.logout());
}
