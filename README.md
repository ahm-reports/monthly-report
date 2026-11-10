# التقارير الشهرية

تطبيق ويب لتحليل نهاية الشهر لتقريرين (`report1` و`report2`). واجهة عربية RTL، يشتغل على الموبايل والحاسبة.
ينستضاف على **GitHub Pages**، ويستخدم **Firebase** (Authentication + Firestore). بدون build step: HTML + CSS + JavaScript (ES modules)، والمكتبات من CDN بأرقام إصدارات مثبتة.

> **ممنوع** رفع أي ملف إكسل أو أرقام أو أسماء حقيقية للـ repo. ملف `.gitignore` يمنع `*.xlsx` و`*.xls` و`*.csv` و`test-data/` و`design-options/` و`design-reference/`.

---

## 1) تجهيز Firebase (مرة وحدة)

### أ. إنشاء المشروع
1. افتح <https://console.firebase.google.com> ← **Add project** (أو **Create a project**).
2. اكتب اسم للمشروع (لا تستخدم اسم المطعم)، ومو ضروري تفعّل Google Analytics.

### ب. تفعيل الدخول بالإيميل والباسورد
1. من القائمة: **Build ← Authentication ← Get started**.
2. تبويب **Sign-in method** ← **Email/Password** ← فعّل الخيار الأول **Enable** ← **Save**.
   - لا تفعّل "Email link".
   - لا تطفي خيار إنشاء الحسابات (User actions ← Enable create)، لأن شاشة المدير تنشئ الحسابات من خلاله.

### ج. إنشاء قاعدة البيانات
1. **Build ← Firestore Database ← Create database**.
2. اختار موقع قريب (مثلاً `europe-west3` أو `me-central1`) ← **Next**.
3. اختار **Start in production mode** (لا تختار test mode أبداً) ← **Create**.

### د. نشر قواعد الأمان
1. بـ Firestore ← تبويب **Rules**.
2. امسح الموجود، والصق كل محتوى ملف [`firestore.rules`](firestore.rules) ← **Publish**.

> كل ما يتغير ملف `firestore.rules` بالمراحل الجاية، لازم تعيد هاي الخطوة.

### هـ. ربط التطبيق
1. ⚙️ **Project settings ← General** ← تحت **Your apps** دوس أيقونة الويب `</>`.
2. اكتب أي اسم ← **Register app** (لا تفعّل Firebase Hosting).
3. انسخ القيم من `firebaseConfig` وحطها بملف [`js/firebase-config.js`](js/firebase-config.js):
   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "....firebaseapp.com",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   هاي القيم مو سرية (تنعرض بالمتصفح بكل الأحوال). الحماية تجي من قواعد Firestore.

---

## 2) أول حساب مدير (يدوياً)

ماكو تسجيل ذاتي. أول حساب admin ينعمل من لوحة Firebase، وبعدها كل الحسابات تنعمل من شاشة المدير.

1. **Authentication ← Users ← Add user**:
   - **Email:** `admin@app.local` (بدل `admin` بأي يوزر تريده: حروف إنكليزية صغيرة وأرقام و`.` `_` `-`).
   - **Password:** 6 أحرف أو أكثر.
   - دوس **Add user**، وانسخ الـ **User UID** اللي يطلع بالجدول.
2. **Firestore Database ← Data ← Start collection**:
   - **Collection ID:** `users` ← Next.
   - **Document ID:** الصق الـ UID.
   - ضيف الحقول:

     | Field | Type | Value |
     |---|---|---|
     | `username` | string | `admin` |
     | `role` | string | `admin` |
     | `reports` | array | `report1` و`report2` (عنصرين، كل واحد string) |
     | `active` | boolean | `true` |
   - **Save**.
3. افتح التطبيق، وادخل بيوزر `admin` والباسورد.
4. **زرع القوالب:** من القائمة (الدائرة بأعلى الصفحة) ← **شاشة المدير** ← **زرع القوالب**.
   - ينعمل `reports/report1` و`reports/report2` من ملفات [`templates/`](templates)، بالاسم "تقرير 1" و"تقرير 2"، ونسبة إدارة 10%.
   - الزرع ما يمسح ولا يغير أي تقرير موجود.
   - بعدها تكدر تغير الاسم المعروض ونسبة الإدارة من نفس الشاشة.

### الأدوار
| الدور | يشوف التقارير | يدرج ويعدل الأشهر | القالب والإعدادات والمستخدمين |
|---|---|---|---|
| `viewer` (مشاهد) | ✓ (المسموحة إله فقط) | ✗ | ✗ |
| `editor` (محرر) | ✓ | ✓ | ✗ (يطلب من المدير) |
| `admin` (مدير) | ✓ | ✓ | ✓ |

المستخدم يشوف بس التقارير اللي بقائمة `reports` مالته، والحساب الموقوف (`active: false`) ما يشوف شي.

### نسيان كلمة المرور
الإيميلات وهمية (`@app.local`)، فرسالة "Reset password" من Firebase ما توصل. الحل:
1. **Authentication ← Users** ← على المستخدم ⋮ ← **Delete account**.
2. **Firestore ← users** ← احذف مستند نفس الـ UID.
3. من شاشة المدير، أنشئ الحساب من جديد بنفس اليوزر.

---

## 3) النشر على GitHub Pages

1. ارفع الكود للفرع `main`.
2. بالـ repo على GitHub: **Settings ← Pages**.
3. **Source:** Deploy from a branch ← **Branch:** `main` / `/ (root)` ← **Save**.
4. بعد دقيقة أو دقيقتين يطلع الرابط: `https://<اسم-الحساب>.github.io/monthly-report/`.

> GitHub Pages المجاني يحتاج repo عام (public). هذا مو مشكلة لأن الـ repo ما بيه أرقام ولا أسماء، والبيانات كلها محمية بقواعد Firestore.

---

## 4) التشغيل والتجربة على الحاسبة

التطبيق ملفات ثابتة، بس لازم ينفتح من سيرفر (مو بالضغط المزدوج على الملف):
```bash
python3 -m http.server 5173
```
وبعدها افتح <http://localhost:5173>.

### المحاكي المحلي (اختياري، بدون مشروع حقيقي)
```bash
cd tests && npm install
npx firebase emulators:start --config ../firebase.json --only firestore,auth --project demo-monthly-report
```
وافتح <http://localhost:5173/?emulator>. التطبيق ينربط بالمحاكي بدل Firebase الحقيقي (هذا يشتغل على localhost فقط).

### الاختبارات
```bash
npm install --prefix tests
```
```bash
npm test
```
تجرب الحسابات وقراءة الإكسل. اختبارات الملفات تحتاج مجلد `test-data/` (ملفات الإكسل و`expected.json` بالأرقام المتوقعة). هذا المجلد ما ينرفع للـ repo، وإذا ما موجود تتخطى هاي الاختبارات.

```bash
cd tests && npm run test:rules
```
تجرب قواعد الأمان على المحاكي (تحتاج Java).

---

## الشاشات
| الشاشة | الرابط | منو يشوفها |
|---|---|---|
| اختيار التقرير | `#/` | الكل |
| الملخص (لوحة التحكم) + تصدير PDF وExcel | `#/r/report1` | الكل |
| النمو | `#/r/report1/growth` | الكل |
| الأشهر + تعديل شهر + سجل التعديلات | `#/r/report1/months` | الكل (التعديل: محرر ومدير) |
| إدراج شهر | `#/r/report1/import` | محرر ومدير |
| مقارنة التقريرين | `#/compare` | اللي عنده صلاحية على التقريرين |
| المدير: المستخدمين، الإعدادات وحدود التنبيه، استيراد الملخص السنوي، محرر القالب | `#/admin` | المدير |

- **PDF:** زر PDF بالملخص يفتح طباعة المتصفح بتنسيق طباعة (أبيض). اختار "Save as PDF".
- **Excel:** زر Excel ينزل ملف الشهر المختار (`report1-2026-10.xlsx`). الملف يتسوى بالمتصفح.
- **محرر القالب:** البند اللي إله قيم بأشهر محفوظة ما ينحذف، ينخفى بس. القيم القديمة تبقى محسوبة بالمجاميع.

## هيكل الملفات
```
index.html
css/app.css
js/firebase-config.js   إعدادات الربط (تعبيها إنت)
js/firebase.js          كل التعامل مع Firebase
js/app.js               الدخول والتنقل بين الشاشات
js/calc.js              calcMonth + النمو — بدون DOM
js/format.js            تنسيق الأرقام والأشهر
js/ui.js                أدوات الواجهة والشريط العلوي
js/views/*.js           الشاشات
templates/report1.json  قالب تقرير 1
templates/report2.json  قالب تقرير 2
firestore.rules         قواعد الأمان
firebase.json           إعدادات المحاكي ونشر القواعد بالـ CLI
tests/                  الاختبارات
```

## نموذج البيانات
```
users/{uid}                     username, role, reports[], active
reports/{reportId}              displayName, feeRate, template{items[], fixedKeys[]}, alerts{}
reports/{reportId}/months/{YYYY-MM}        values{key: number}, other_revenue, source, updatedAt, updatedBy
reports/{reportId}/months/{YYYY-MM}/log/*  at, by, key, oldValue, newValue   (إضافة فقط)
```
الشهر يخزن البنود فقط بالمفاتيح. كل المجاميع والنسب والأرباح تنحسب من `calcMonth`، والقسم يجي من القالب وقت الحساب.
