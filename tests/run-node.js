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

const fs = require('fs');
const path = require('path');

const TESTS = globalThis.TESTS;
const counts = {};
let pass = 0, fail = 0;

for (const t of TESTS) {
  counts[t.category] = counts[t.category] || { pass: 0, fail: 0 };
  try {
    t.fn();
    pass++; counts[t.category].pass++;
  } catch (e) {
    fail++; counts[t.category].fail++;
    console.error(`✗ [${t.category}] ${t.name}\n  ${e.message}`);
  }
}

for (const [cat, c] of Object.entries(counts)) {
  console.log(`${c.fail === 0 ? '✓' : '✗'} ${cat}: ${c.pass}/${c.pass + c.fail}`);
}
console.log(`\n${pass}/${pass + fail} passed (TZ=${process.env.TZ || 'system'})`);

// فحوصات اتساق: شارات README تطابق الواقع
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

const fnBadge = readme.match(/Functions-(\d+)-/);
const fnActual = Object.keys(globalThis.FUNCTIONS).length;
if (fnBadge && Number(fnBadge[1]) !== fnActual) {
  console.error(`✗ شارة عدد الدوال في README (${fnBadge[1]}) لا تطابق الكود (${fnActual})`);
  fail++;
}

const testBadge = readme.match(/Tests-(\d+)%2F(\d+)/);
if (testBadge && Number(testBadge[2]) !== TESTS.length) {
  console.error(`✗ شارة عدد الاختبارات في README (${testBadge[2]}) لا تطابق الحزمة (${TESTS.length})`);
  fail++;
}

process.exit(fail > 0 ? 1 : 0);
