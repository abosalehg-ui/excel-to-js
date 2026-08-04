/* ============================================================
   framework.js — إطار الاختبار المشترك (متصفح + Node)
   ------------------------------------------------------------
   يوفّر: TESTS, test, assertEqual, assertClose, assertContains,
          assertThrows, runFormula
   يُحمَّل بعد assets/engine.js وقبل tests/suite.js:
     - في المتصفح عبر tests.html
     - في Node عبر tests/run-node.js (للـ CI)
   ============================================================ */
(function (global) {
  const TESTS = [];

  function test(category, name, fn) {
    TESTS.push({ category, name, fn });
  }

  // تخطٍّ صريح: يُميَّز عن النجاح في المشغّلَين (المتصفح وNode).
  // بدونه كان اختبار متخطّى يُحسب ناجحاً — نجاح كاذب يخفي انهيار الواجهة.
  function skip(reason) {
    const e = new Error('تخطٍّ: ' + reason);
    e.skipped = true;
    throw e;
  }

  function assertEqual(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) return;
    if (Number.isNaN(actual) && Number.isNaN(expected)) return;
    throw new Error((label ? label + '\n  ' : '') + `expected: ${e}\n  actual:   ${a}`);
  }

  function assertClose(actual, expected, eps, label) {
    eps = eps ?? 1e-9;
    if (typeof actual !== 'number' || isNaN(actual)) {
      throw new Error((label || '') + ` not a number: ${actual}`);
    }
    if (Math.abs(actual - expected) > eps) {
      throw new Error((label || '') + ` |${actual} - ${expected}| > ${eps}`);
    }
  }

  function assertContains(haystack, needle, label) {
    if (typeof haystack !== 'string' || haystack.indexOf(needle) === -1) {
      throw new Error(
        (label ? label + '\n  ' : '') +
          `expected to contain: ${JSON.stringify(needle)}\n  in:               ${JSON.stringify(haystack)}`
      );
    }
  }

  function assertThrows(fn, msgPart, label) {
    let threw = false;
    let actualMsg = '';
    try {
      fn();
    } catch (e) {
      threw = true;
      actualMsg = e.message;
      if (msgPart && actualMsg.indexOf(msgPart) === -1) {
        throw new Error(
          (label ? label + '\n  ' : '') +
            `error message did not contain: ${JSON.stringify(msgPart)}\n  got: ${JSON.stringify(actualMsg)}`
        );
      }
    }
    if (!threw) throw new Error((label ? label + '\n  ' : '') + 'expected to throw, but did not');
  }

  // ينفّذ صيغة على قيم خلايا ويرجّع النتيجة (اختبار end-to-end حقيقي).
  // options تُمرَّر كما هي لـconvertFormula (مثلاً { rangeParams: true }).
  function runFormula(formula, cellValues, options) {
    cellValues = cellValues || {};
    const { code, paramNames } = global.ExcelToJS.convertFormula(formula, options);
    const body = code + `\nreturn calculate(${paramNames.join(', ')});`;
    const fn = new Function(...paramNames, body);
    const args = paramNames.map((c) => cellValues[c]);
    return fn(...args);
  }

  global.TESTS = TESTS;
  global.test = test;
  global.skip = skip;
  global.assertEqual = assertEqual;
  global.assertClose = assertClose;
  global.assertContains = assertContains;
  global.assertThrows = assertThrows;
  global.runFormula = runFormula;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      TESTS,
      test,
      skip,
      assertEqual,
      assertClose,
      assertContains,
      assertThrows,
      runFormula
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
