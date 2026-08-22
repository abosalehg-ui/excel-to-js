#!/usr/bin/env node
/* ============================================================
   run-node.js — يشغّل نفس حزمة اختبارات المتصفح في Node (للـ CI)
   ------------------------------------------------------------
   الاستخدام:  node tests/run-node.js
   يخرج بكود 1 عند أي فشل، فيصلح كبوابة CI.
   ============================================================ */
require('../assets/helpers.js');
require('../assets/functions.js');
require('../assets/engine.js');
require('./framework.js');
require('./suite.js');
// حزمة الواجهة تعمل في Node فقط (تحتاج DOM) — تتخطّى نفسها بلا jsdom
require('./suite-ui.js');

const fs = require('fs');
const path = require('path');

const TESTS = globalThis.TESTS;
const counts = {};
let pass = 0,
  fail = 0,
  skipped = 0;

for (const t of TESTS) {
  counts[t.category] = counts[t.category] || { pass: 0, fail: 0, skip: 0 };
  try {
    t.fn();
    pass++;
    counts[t.category].pass++;
  } catch (e) {
    // التخطّي ليس نجاحاً — يُعدّ في خانته الخاصة ويظهر في الملخّص
    if (e.skipped) {
      skipped++;
      counts[t.category].skip++;
      continue;
    }
    fail++;
    counts[t.category].fail++;
    console.error(`✗ [${t.category}] ${t.name}\n  ${e.message}`);
  }
}

for (const [cat, c] of Object.entries(counts)) {
  const mark = c.fail > 0 ? '✗' : c.skip > 0 ? '–' : '✓';
  const total = c.pass + c.fail + c.skip;
  console.log(`${mark} ${cat}: ${c.pass}/${total}${c.skip ? ` (${c.skip} متخطّى)` : ''}`);
}
console.log(
  `\n${pass}/${pass + fail} passed` +
    (skipped ? `, ${skipped} skipped` : '') +
    ` (TZ=${process.env.TZ || 'system'})`
);
if (skipped) {
  console.log('ملاحظة: اختبارات متخطّاة — شغّل npm install لتفعيل حزمة الواجهة (jsdom).');
}

// فحوصات اتساق: شارات README تطابق الواقع
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
const pkg = require('../package.json');

// الإصدار كان ينجرف في ثلاثة اتجاهات (README 3.0 / package 3.1.2 / lock 3.2.0)
const verBadge = readme.match(/Version-([\d.]+)-/);
if (verBadge && verBadge[1] !== pkg.version) {
  console.error(`✗ شارة الإصدار في README (${verBadge[1]}) لا تطابق package.json (${pkg.version})`);
  fail++;
}

const lock = require('../package-lock.json');
if (lock.version !== pkg.version) {
  console.error(`✗ إصدار package-lock (${lock.version}) لا يطابق package.json (${pkg.version})`);
  fail++;
}

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
if (indexHtml.indexOf(`النسخة ${pkg.version}`) === -1) {
  console.error(`✗ إصدار index.html لا يطابق package.json (${pkg.version})`);
  fail++;
}

const fnBadge = readme.match(/Functions-(\d+)-/);
const fnActual = Object.keys(globalThis.ExcelToJS.FUNCTIONS).length;
if (fnBadge && Number(fnBadge[1]) !== fnActual) {
  console.error(`✗ شارة عدد الدوال في README (${fnBadge[1]}) لا تطابق الكود (${fnActual})`);
  fail++;
}

// أعداد الفئات في عناوين README كانت مكتوبة يدوياً وتتقادم صامتة:
// إضافة دالة تعني تعديل ثلاثة مواضع، ولا شيء يمسك النسيان.
const CAT_LABELS = globalThis.ExcelToJS.CAT_LABELS;
const FN_BY_CAT = {};
for (const info of Object.values(globalThis.ExcelToJS.FUNCTIONS)) {
  FN_BY_CAT[info.cat] = (FN_BY_CAT[info.cat] || 0) + 1;
}
for (const [cat, count] of Object.entries(FN_BY_CAT)) {
  const label = CAT_LABELS[cat];
  const heading = new RegExp(`^### .*${label} \\((\\d+)\\)`, 'm');
  const m = readme.match(heading);
  if (!m) {
    console.error(`✗ ما فيه عنوان في README لفئة "${label}"`);
    fail++;
  } else if (Number(m[1]) !== count) {
    console.error(`✗ عدد فئة "${label}" في README (${m[1]}) لا يطابق الكود (${count})`);
    fail++;
  }
}

const fnTotalHeading = readme.match(/## 📋 الدوال المدعومة/);
if (!fnTotalHeading) {
  console.error('✗ ما لقيت قسم "الدوال المدعومة" في README');
  fail++;
}

const testBadge = readme.match(/Tests-(\d+)%2F(\d+)/);
if (testBadge && Number(testBadge[2]) !== TESTS.length) {
  console.error(
    `✗ شارة عدد الاختبارات في README (${testBadge[2]}) لا تطابق الحزمة (${TESTS.length})`
  );
  fail++;
}

process.exit(fail > 0 ? 1 : 0);
