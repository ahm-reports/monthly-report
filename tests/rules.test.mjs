// اختبارات قواعد أمان Firestore — تشتغل على المحاكي المحلي.
//   cd tests && npm install && npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

let env;
const users = {
  admin: { username: 'admin', role: 'admin', reports: ['report1', 'report2'], active: true },
  ed1: { username: 'ed1', role: 'editor', reports: ['report1'], active: true },
  viewer: { username: 'viewer', role: 'viewer', reports: ['report1', 'report2'], active: true },
  off: { username: 'off', role: 'editor', reports: ['report1', 'report2'], active: false },
};
const tpl = { items: [{ key: 'a', label: 'أ', section: 'sales', rawAliases: ['أ'], summaryAliases: ['أ'] }], fixedKeys: [] };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-monthly-report',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, u] of Object.entries(users)) await setDoc(doc(db, 'users', uid), u);
    for (const r of ['report1', 'report2']) await setDoc(doc(db, 'reports', r), { displayName: r, feeRate: 0.1, template: tpl, alerts: {} });
    await setDoc(doc(db, 'reports/report1/months/2026-10'), { values: { a: 1 }, other_revenue: 0, source: 'raw', updatedBy: 'admin' });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const month = (uid, extra = {}) => ({ values: { a: 5 }, other_revenue: 0, source: 'raw', updatedAt: serverTimestamp(), updatedBy: uid, ...extra });

test('غير مسجل ما يقرأ شي', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'reports/report1')));
  await assertFails(getDoc(doc(db, 'users/admin')));
});

test('المستخدم يقرأ مستنده فقط', async () => {
  await assertSucceeds(getDoc(doc(as('ed1'), 'users/ed1')));
  await assertFails(getDoc(doc(as('ed1'), 'users/admin')));
  await assertFails(updateDoc(doc(as('ed1'), 'users/ed1'), { role: 'admin' }));
});

test('المدير يقرأ ويكتب كل المستخدمين', async () => {
  await assertSucceeds(getDoc(doc(as('admin'), 'users/ed1')));
  await assertSucceeds(setDoc(doc(as('admin'), 'users/new'), { username: 'new', role: 'viewer', reports: ['report1'], active: true }));
  await assertFails(setDoc(doc(as('admin'), 'users/bad'), { username: 'bad', role: 'boss', reports: [], active: true }));
});

test('قراءة التقرير حسب قائمة reports وactive', async () => {
  await assertSucceeds(getDoc(doc(as('ed1'), 'reports/report1')));
  await assertFails(getDoc(doc(as('ed1'), 'reports/report2')));
  await assertFails(getDoc(doc(as('ed1'), 'reports/report2/months/2026-10')));
  await assertFails(getDoc(doc(as('off'), 'reports/report1')));
  await assertFails(getDoc(doc(as('nobody'), 'reports/report1')));
});

test('كتابة الأشهر: editor وadmin ضمن تقاريرهم فقط', async () => {
  await assertSucceeds(setDoc(doc(as('ed1'), 'reports/report1/months/2026-11'), month('ed1')));
  await assertFails(setDoc(doc(as('ed1'), 'reports/report2/months/2026-11'), month('ed1')));
  await assertFails(setDoc(doc(as('viewer'), 'reports/report1/months/2026-11'), month('viewer')));
  await assertFails(setDoc(doc(as('off'), 'reports/report1/months/2026-11'), month('off')));
  await assertSucceeds(setDoc(doc(as('admin'), 'reports/report2/months/2026-10'), month('admin', { source: 'summary' })));
});

test('شكل الشهر يتحقق منه', async () => {
  await assertFails(setDoc(doc(as('ed1'), 'reports/report1/months/2026-13'), month('ed1')));
  await assertFails(setDoc(doc(as('ed1'), 'reports/report1/months/2026-11'), month('ed1', { total: 5 })));
  await assertFails(setDoc(doc(as('ed1'), 'reports/report1/months/2026-11'), month('admin')));
  await assertFails(setDoc(doc(as('ed1'), 'reports/report1/months/2026-11'), month('ed1', { source: 'x' })));
  await assertFails(deleteDoc(doc(as('ed1'), 'reports/report1/months/2026-10')));
});

test('القالب والإعدادات: المدير فقط', async () => {
  await assertFails(updateDoc(doc(as('ed1'), 'reports/report1'), { displayName: 'x' }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'reports/report1'), { displayName: 'تقرير 1', feeRate: 0.12 }));
  await assertFails(updateDoc(doc(as('admin'), 'reports/report1'), { feeRate: 2 }));
});

test('سجل التعديلات: إضافة فقط', async () => {
  const log = collection(as('ed1'), 'reports/report1/months/2026-10/log');
  await assertSucceeds(addDoc(log, { at: serverTimestamp(), by: 'ed1', key: 'a', oldValue: 1, newValue: 2 }));
  await assertFails(addDoc(log, { at: serverTimestamp(), by: 'admin', key: 'a', oldValue: 1, newValue: 2 }));
  await assertFails(addDoc(collection(as('viewer'), 'reports/report1/months/2026-10/log'), { at: serverTimestamp(), by: 'viewer', key: 'a', oldValue: 1, newValue: 2 }));
  let id;
  await env.withSecurityRulesDisabled(async (c) => { id = (await addDoc(collection(c.firestore(), 'reports/report1/months/2026-10/log'), { by: 'ed1', key: 'a' })).id; });
  await assertFails(updateDoc(doc(as('admin'), `reports/report1/months/2026-10/log/${id}`), { key: 'b' }));
  await assertFails(deleteDoc(doc(as('admin'), `reports/report1/months/2026-10/log/${id}`)));
});
