// نقطة البداية: الدخول + التوجيه بين الشاشات (hash router).
import { configured, onAuth, getProfile, logout, updateUser, seedReport, REPORT_IDS } from './firebase.js';
import { loading, toast } from './ui.js';
import * as loginView from './views/login.js';
import * as homeView from './views/home.js';
import * as adminView from './views/admin.js';
import * as compareView from './views/compare.js';
import * as importView from './views/import.js';
import * as monthsView from './views/months.js';
import * as dashView from './views/dashboard.js';
import * as growthView from './views/growth.js';

const root = document.getElementById('app');
const ctx = {
  user: null, profile: null, signal: null,
  logout: async () => { await logout(); location.hash = '#/'; },
  canEdit: () => ctx.profile && ['admin', 'editor'].includes(ctx.profile.role),
  isAdmin: () => ctx.profile && ctx.profile.role === 'admin',
  allowedReports: () => (ctx.profile?.reports || []).filter(r => REPORT_IDS.includes(r)),
};

let controller = null;
async function route() {
  if (controller) controller.abort();
  controller = new AbortController();
  ctx.signal = controller.signal;
  window.scrollTo(0, 0);

  if (!configured) return renderNotConfigured();
  if (!ctx.user) return loginView.render(root, ctx);
  if (!ctx.profile || ctx.profile.active !== true) return renderNoAccess();

  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts.length === 0) return await homeView.render(root, ctx);
    if (parts[0] === 'admin') {
      if (!ctx.isAdmin()) { location.hash = '#/'; return; }
      return await adminView.render(root, ctx);
    }
    if (parts[0] === 'compare') return await compareView.render(root, ctx);
    if (parts[0] === 'r' && parts[1]) {
      const reportId = parts[1];
      if (!ctx.allowedReports().includes(reportId)) { toast('ما عندك صلاحية على هذا التقرير.', true); location.hash = '#/'; return; }
      const sub = parts[2] || 'dash';
      if (sub === 'import') {
        if (!ctx.canEdit()) { location.hash = `#/r/${reportId}`; return; }
        return await importView.render(root, ctx, reportId);
      }
      if (sub === 'months') {
        if (parts[3]) {
          if (!ctx.canEdit() || !/^\d{4}-\d{2}$/.test(parts[3])) { location.hash = `#/r/${reportId}/months`; return; }
          return await monthsView.renderEdit(root, ctx, reportId, parts[3]);
        }
        return await monthsView.render(root, ctx, reportId);
      }
      if (sub === 'dash') return await dashView.render(root, ctx, reportId);
      if (sub === 'growth') return await growthView.render(root, ctx, reportId);
      location.hash = `#/r/${reportId}`; return;
    }
    location.hash = '#/';
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="wrap narrow"><div class="alert err">صار خطأ بتحميل الشاشة: ${String(e.message || e)}</div><a class="btn" href="#/">رجوع</a></div>`;
  }
}

// المدير يشوف كل التقارير دائماً، والقوالب الناقصة تنزرع تلقائياً.
async function ensureAdminSetup() {
  try {
    const mine = Array.isArray(ctx.profile.reports) ? ctx.profile.reports : [];
    const missing = REPORT_IDS.filter(r => !mine.includes(r));
    if (missing.length) {
      const reports = [...mine, ...missing];
      await updateUser(ctx.user.uid, { reports });
      ctx.profile.reports = reports;
    }
    for (const [i, id] of REPORT_IDS.entries()) await seedReport(id, i + 1);
  } catch (e) { console.error('admin setup', e); }
}

function renderNotConfigured() {
  root.innerHTML = `<div class="wrap narrow"><div class="card"><h2>التطبيق مو مربوط بـ Firebase بعد</h2>
    <p class="muted" style="line-height:1.8;margin:0">عبّي ملف <code>js/firebase-config.js</code> بإعدادات مشروع Firebase. الخطوات بملف README.</p></div></div>`;
}
function renderNoAccess() {
  root.innerHTML = `<div class="wrap narrow"><div class="card"><h2>الحساب غير مفعّل</h2>
    <p class="muted" style="line-height:1.8;margin:0">حسابك ما إله صلاحيات أو موقوف. اطلب من المدير يفعّله.</p>
    <button class="btn" type="button" id="out">خروج</button></div></div>`;
  document.getElementById('out').addEventListener('click', ctx.logout);
}

if (!configured) {
  route();
} else {
  root.innerHTML = `<div class="wrap narrow">${loading()}</div>`;
  let first = true;
  onAuth(async (user) => {
    ctx.user = user;
    ctx.profile = null;
    if (user) {
      try { ctx.profile = await getProfile(user.uid); }
      catch (e) { console.error(e); ctx.profile = null; }
      if (ctx.isAdmin()) await ensureAdminSetup();
    }
    route();
    if (first) { first = false; window.addEventListener('hashchange', route); }
  });
}
export { ctx };
