// كل التعامل مع Firebase يمر من هنا.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, connectAuthEmulator, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, orderBy,
  serverTimestamp, connectFirestoreEmulator
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const EMAIL_DOMAIN = 'app.local';
export const REPORT_IDS = ['report1', 'report2'];
export const ROLES = { admin: 'مدير', editor: 'محرر', viewer: 'مشاهد' };
export const DEFAULT_ALERTS = { foodCostMax: 0.35, expenseMax: 0.45 };

// للتجربة المحلية فقط: افتح التطبيق على localhost وضيف ?emulator للرابط.
const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulator');
const config = useEmulator && !firebaseConfig.projectId
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-monthly-report', appId: 'demo' }
  : firebaseConfig;

export const configured = Boolean(config.projectId && config.apiKey);
export const app = configured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
if (app && useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// ---------- الدخول ----------
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export function normalizeUsername(u) { return String(u || '').trim().toLowerCase(); }
export function usernameToEmail(u) { return `${normalizeUsername(u)}@${EMAIL_DOMAIN}`; }

export async function login(username, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, usernameToEmail(username), password);
}
export const logout = () => signOut(auth);
export const onAuth = (cb) => onAuthStateChanged(auth, cb);

export function authErrorText(e) {
  const c = e && e.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'اسم المستخدم أو كلمة المرور غلط.';
  if (/too-many-requests/.test(c)) return 'محاولات كثيرة. انتظر شوية وجرب مرة ثانية.';
  if (/network/.test(c)) return 'ماكو اتصال بالإنترنت.';
  if (/email-already-in-use/.test(c)) return 'اسم المستخدم هذا موجود.';
  if (/weak-password/.test(c)) return 'كلمة المرور لازم تكون 6 أحرف أو أكثر.';
  if (/permission-denied/.test(c)) return 'ما عندك صلاحية لهذا الإجراء.';
  return 'صار خطأ: ' + (e && e.message || c);
}

// ---------- المستخدمين ----------
export async function getProfile(uid) {
  const s = await getDoc(doc(db, 'users', uid));
  return s.exists() ? { uid, ...s.data() } : null;
}
export async function listUsers() {
  const s = await getDocs(collection(db, 'users'));
  return s.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => a.username.localeCompare(b.username));
}
export function updateUser(uid, data) { return updateDoc(doc(db, 'users', uid), data); }

// ينشئ الحساب بـ app ثاني حتى المدير ما يطلع من حسابه.
export async function createUserAccount({ username, password, role, reports }) {
  username = normalizeUsername(username);
  if (!USERNAME_RE.test(username)) throw new Error('اسم المستخدم لازم يكون 3 أحرف أو أكثر، إنكليزي صغير وأرقام و . _ - فقط.');
  const secondary = initializeApp(config, 'secondary-' + Date.now());
  const secAuth = getAuth(secondary);
  if (useEmulator) connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, usernameToEmail(username), password);
    await setDoc(doc(db, 'users', cred.user.uid), { username, role, reports, active: true });
    return cred.user.uid;
  } finally {
    await signOut(secAuth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}

// ---------- التقارير ----------
export async function getReport(id) {
  const s = await getDoc(doc(db, 'reports', id));
  return s.exists() ? { id, ...s.data() } : null;
}
export function updateReport(id, data) { return updateDoc(doc(db, 'reports', id), data); }

export async function loadTemplateFile(id) {
  const r = await fetch(new URL(`../templates/${id}.json`, import.meta.url));
  if (!r.ok) throw new Error('ما لكيت ملف القالب ' + id);
  return r.json();
}
// يزرع التقرير إذا ما موجود. ما يمسح أي شي موجود.
export async function seedReport(id, index) {
  if (await getReport(id)) return false;
  const template = await loadTemplateFile(id);
  await setDoc(doc(db, 'reports', id), { displayName: 'تقرير ' + index, feeRate: 0.10, template, alerts: { ...DEFAULT_ALERTS } });
  return true;
}

// ---------- الأشهر ----------
export async function listMonths(reportId) {
  const s = await getDocs(query(collection(db, 'reports', reportId, 'months'), orderBy('__name__')));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
// آخر شهر محفوظ (المعرّفات YYYY-MM تترتب صح كنص).
export async function lastMonth(reportId) {
  const all = await listMonths(reportId);
  return all.length ? all[all.length - 1] : null;
}
export { serverTimestamp };
