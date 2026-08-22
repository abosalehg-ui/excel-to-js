/* ============================================================
   suite-ui.js — اختبارات طبقة الواجهة
   ------------------------------------------------------------
   الملف يعمل في البيئتين:
     - Node: كل الاختبارات (يحتاج jsdom لحزمة الـDOM).
     - المتصفح: اختبارات tokenizeJS فقط؛ الباقي يحتاج قراءة
       index.html من القرص فيُسجَّل **متخطّياً** لا ناجحاً.

   التخطّي يمرّ عبر skip() من framework.js فيُعدّ في خانته الخاصة.
   قبل ذلك كان `return` صامتاً يجعل 17 اختباراً يُبلَّغ عنها ناجحة
   حتى بلا jsdom إطلاقاً — نجاح كاذب يخفي انهيار الواجهة بالكامل.

   سبب وجود هذا الملف: ثلاثة أعطال بصرية وصلت للإنتاج لأن
   assets/ui.js لم يكن مغطّى بأي اختبار.
   ============================================================ */
const IS_NODE = typeof require !== 'undefined' && typeof module !== 'undefined';

let JSDOM = null;
let INDEX_HTML = null;
let crypto = null;

if (IS_NODE) {
  const fs = require('fs');
  const path = require('path');
  crypto = require('crypto');
  try {
    ({ JSDOM } = require('jsdom'));
  } catch (e) {
    JSDOM = null;
  }
  INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  require('../assets/ui.js');
}

const NS = (typeof window !== 'undefined' ? window : globalThis).ExcelToJS;
// ملاحظة: لا نُصرّح بـconvertFormula هنا كـconst. في المتصفح تُحمَّل
// حزم الاختبار كسكربتات كلاسيكية تتشارك نطاقاً معجمياً واحداً، وsuite.js
// يُصرّح بالاسم نفسه — فيرمي "Identifier has already been declared"
// ويسقط هذا الملف كاملاً بصمت. نناديها من NS مباشرةً.
const { tokenizeJS, initUI, CAT_LABELS, FUNCTIONS } = NS;

const escapeRe = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// حارس: الاختبارات التي تقرأ index.html لا تعمل في المتصفح
function needsHtml() {
  if (!INDEX_HTML) skip('يحتاج قراءة index.html من القرص — شغّله في Node');
}

/* ------------------------------------------------------------
   اختبارات نقية — لا تحتاج DOM إطلاقاً
   ------------------------------------------------------------ */
test('UI: tokenizeJS', 'يحافظ على النص الأصلي حرفاً بحرف', () => {
  const code = "function f() {\n  // تعليق\n  return '#N/A';\n}";
  const joined = tokenizeJS(code)
    .map((t) => t.text)
    .join('');
  assertEqual(joined, code, 'إعادة تجميع الرموز يجب أن تعطي النص الأصلي');
});

test('UI: tokenizeJS', 'لا يشطر علامات الاقتباس المفردة (كانت تظهر كـ &#39;)', () => {
  const tokens = tokenizeJS("return '#N/A';");
  const str = tokens.find((t) => t.cls === 'code-string');
  assertEqual(str.text, "'#N/A'");
  // لا يوجد أي كيان HTML في أي رمز — النص خام تماماً
  for (const t of tokens) {
    assertEqual(t.text.indexOf('&#') === -1, true, `وُجد كيان HTML في: ${t.text}`);
  }
});

test('UI: tokenizeJS', 'الرقم داخل نص لا يُلوَّن كرقم', () => {
  const tokens = tokenizeJS("const a = '39';");
  const numbers = tokens.filter((t) => t.cls === 'code-number');
  assertEqual(numbers.length, 0, 'الرقم داخل النص جزء من رمز النص');
});

test('UI: tokenizeJS', 'التعليق يبتلع الكلمات المفتاحية داخله', () => {
  const tokens = tokenizeJS('// return function\nreturn 1;');
  assertEqual(tokens[0].cls, 'code-comment');
  assertEqual(tokens[0].text, '// return function');
  const keywords = tokens.filter((t) => t.cls === 'code-keyword');
  assertEqual(keywords.length, 1, 'كلمة مفتاحية واحدة فقط خارج التعليق');
});

test('UI: tokenizeJS', 'يميّز الكلمات المفتاحية والمدمجة والأرقام', () => {
  const byClass = (code, cls) =>
    tokenizeJS(code)
      .filter((t) => t.cls === cls)
      .map((t) => t.text);
  assertEqual(byClass('const x = 5;', 'code-keyword'), ['const']);
  assertEqual(byClass('Math.pow(2, 3)', 'code-fn'), ['Math']);
  assertEqual(byClass('Math.pow(2, 3)', 'code-number'), ['2', '3']);
});

/* ------------------------------------------------------------
   حارس CSS — jsdom لا يحسب التخطيط، فنفحص التصريحات نفسها.
   يمنع عودة العطل الذي جعل طبقتَي المحرر لا تتحاذيان.
   ------------------------------------------------------------ */
test('UI: CSS guard', 'نص الـtextarea شفاف ليظهر التظليل من تحته', () => {
  needsHtml();
  // بداية السطر تميّز القاعدة المستقلة عن المشتركة (.editor-highlight, .editor-input)
  const rule = INDEX_HTML.match(/\n\s*\.editor-input\s*\{[^}]*\}/);
  assertEqual(rule !== null, true, 'قاعدة .editor-input غير موجودة');
  assertContains(rule[0], 'color: transparent');
  assertContains(rule[0], 'caret-color');
});

test('UI: CSS guard', 'الطبقتان تصرّحان بنفس المحاذاة صراحةً', () => {
  needsHtml();
  // <textarea> لا يرث text-align (الـUA stylesheet يفرض start)
  const shared = INDEX_HTML.match(/\.editor-highlight,\s*\.editor-input\s*\{[^}]*\}/);
  assertEqual(shared !== null, true, 'القاعدة المشتركة غير موجودة');
  assertContains(shared[0], 'text-align: left');
});

test('UI: CSS guard', 'ألوان التظليل لها نسخة ليلية', () => {
  needsHtml();
  for (const cls of ['tk-fn', 'tk-num', 'tk-str', 'tk-cell', 'tk-op', 'tk-paren']) {
    assertContains(INDEX_HTML, `[data-theme="dark"] .${cls}`);
  }
});

test('UI: CSS guard', '[hidden] محصّنة ضد قواعد display الأخرى', () => {
  needsHtml();
  // .btn { display: inline-flex } يتغلّب على [hidden] من الـUA stylesheet،
  // فيظهر زر التراجع رغم hidden. jsdom يفحص الخاصية لا التصيير، لذا الحارس هنا.
  assertContains(INDEX_HTML, '[hidden] { display: none !important; }');
});

test('UI: CSS guard', 'الـtoast يستعمل متغيّراً مخصصاً لا var(--text)', () => {
  needsHtml();
  const rule = INDEX_HTML.match(/\.toast\s*\{[^}]*\}/);
  assertContains(rule[0], 'var(--toast-bg)');
  assertContains(rule[0], 'var(--toast-text)');
});

/* ------------------------------------------------------------
   اختبارات DOM حقيقية عبر jsdom
   ------------------------------------------------------------ */
function makeApp() {
  const dom = new JSDOM(INDEX_HTML, { runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const doc = win.document;
  // jsdom لا ينفّذ scrollTo ويطبع خطأ على الطرفية — نستبدله بلا أثر
  win.scrollTo = () => {};
  const api = initUI(doc);
  return { dom, win, doc, api };
}

function uiTest(name, fn) {
  test('UI: DOM', name, () => {
    needsHtml();
    if (!JSDOM) skip('jsdom غير مثبّتة — شغّل npm install');
    const app = makeApp();
    try {
      fn(app);
    } finally {
      app.dom.window.close();
    }
  });
}

uiTest('التحويل يعرض الكود الناتج بعلامات اقتباس سليمة', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=VLOOKUP(A1,B1:C2,2,FALSE)';
  api.doConvert();
  const text = doc.getElementById('output-wrap').textContent;
  assertContains(text, "'#N/A'");
  assertEqual(text.indexOf('&#39;'), -1, 'ظهر كيان HTML خام في الكود المعروض');
  assertEqual(text.indexOf('&amp;'), -1);
});

uiTest('الكود المعروض يطابق الكود المولّد نصاً', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=IF(A1>0,"نعم","لا")';
  api.doConvert();
  const shown = doc.querySelector('.code-content').textContent;
  const expected = NS.convertFormula('=IF(A1>0,"نعم","لا")').code;
  assertEqual(shown, expected);
});

uiTest('أرقام الأسطر تطابق عدد أسطر الكود', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=COUNTIF(A1:A3,">5")';
  api.doConvert();
  const code = NS.convertFormula('=COUNTIF(A1:A3,">5")').code;
  const shown = doc.querySelectorAll('.line-numbers div').length;
  assertEqual(shown, code.split('\n').length);
});

uiTest('طبقة التظليل تعيد إنتاج نص الصيغة كاملاً', ({ doc, api }) => {
  const formula = '=SUM(A1:A5)+VLOOKUP(B2,C1:D9,2,FALSE)';
  api.renderHighlight(formula);
  const hl = doc.getElementById('editor-highlight');
  assertEqual(hl.textContent, formula, 'التظليل يجب أن يطابق المُدخل حرفاً بحرف');
  assertEqual(hl.querySelectorAll('span.tk-fn').length >= 2, true, 'يجب تلوين أسماء الدوال');
  assertEqual(hl.querySelectorAll('span.tk-cell').length >= 1, true);
});

uiTest('الخطأ يُظلَّل في موضعه بدقة', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=SUM(A1@)';
  api.doConvert();
  const mark = doc.querySelector('.err-mark');
  assertEqual(mark !== null, true, 'يجب وضع علامة خطأ');
  assertEqual(mark.textContent, '@');
  assertContains(doc.getElementById('status').className, 'error');
});

uiTest('رسائل الحالة تُبنى كنص لا كـHTML', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=SUM(A1:A3)';
  api.doConvert();
  const status = doc.getElementById('status');
  assertContains(status.className, 'success');
  assertContains(status.textContent, 'نجح التحويل');
  assertEqual(status.querySelector('code').textContent, 'calculate');
});

uiTest('بطاقات الأمثلة أزرار حقيقية (وصول بلوحة المفاتيح)', ({ doc }) => {
  const cards = doc.querySelectorAll('.example-card');
  assertEqual(cards.length > 0, true, 'لا توجد بطاقات');
  for (const c of cards) {
    assertEqual(c.tagName, 'BUTTON', 'كل بطاقة يجب أن تكون <button>');
    assertEqual(c.type, 'button');
  }
});

uiTest('الضغط على مثال يملأ المحرر ويحوّل', ({ doc }) => {
  const card = doc.querySelector('.example-card');
  card.click();
  const input = doc.getElementById('formula-input');
  assertEqual(input.value.length > 0, true);
  assertContains(doc.getElementById('output-wrap').textContent, 'function calculate');
});

uiTest('البحث النصي يصفّي جدول المرجع', ({ doc, api }) => {
  const search = doc.getElementById('ref-search');
  search.value = 'vlookup';
  api.applyRefFilter();
  const visible = [...doc.querySelectorAll('#ref-table-body tr')].filter(
    (tr) => !tr.classList.contains('hidden')
  );
  assertEqual(visible.length, 1);
  assertContains(visible[0].textContent, 'VLOOKUP');
  assertEqual(doc.getElementById('ref-empty').hidden, true);
});

uiTest('بحث بلا نتائج يُظهر رسالة الفراغ', ({ doc, api }) => {
  doc.getElementById('ref-search').value = 'zzzzz';
  api.applyRefFilter();
  assertEqual(doc.getElementById('ref-empty').hidden, false);
});

uiTest('تصفية الفئة تضبط aria-pressed', ({ doc }) => {
  const buttons = [...doc.querySelectorAll('.filter-btn')];
  const dateBtn = buttons.find((b) => b.dataset.cat === 'date');
  dateBtn.click();
  assertEqual(dateBtn.getAttribute('aria-pressed'), 'true');
  assertEqual(buttons[0].getAttribute('aria-pressed'), 'false');
  const visible = [...doc.querySelectorAll('#ref-table-body tr')].filter(
    (tr) => !tr.classList.contains('hidden')
  );
  assertEqual(
    visible.every((tr) => tr.dataset.cat === 'date'),
    true
  );
});

uiTest('المسح ثم التراجع يستعيد الصيغة', ({ doc }) => {
  const input = doc.getElementById('formula-input');
  const undo = doc.getElementById('btn-undo');
  input.value = '=SUM(A1:A3)';
  assertEqual(undo.hidden, true, 'زر التراجع مخفي قبل المسح');
  doc.getElementById('btn-clear').click();
  assertEqual(input.value, '');
  assertEqual(undo.hidden, false, 'زر التراجع يظهر بعد المسح');
  undo.click();
  assertEqual(input.value, '=SUM(A1:A3)');
  assertEqual(undo.hidden, true);
});

uiTest('النسخ يستدعي الحافظة بالكود الأخير', ({ doc, win, api }) => {
  let copied = null;
  win.navigator.clipboard = {
    writeText: (t) => {
      copied = t;
      return Promise.resolve();
    }
  };
  doc.getElementById('formula-input').value = '=A1+B1';
  api.doConvert();
  doc.getElementById('btn-copy').click();
  assertEqual(copied, api.getLastCode());
  assertContains(copied, 'function calculate(a1, b1)');
});

uiTest('البنية الدلالية: main و role على الـtoast', ({ doc }) => {
  assertEqual(doc.querySelectorAll('main').length, 1, 'يجب وجود landmark رئيسي');
  assertEqual(doc.getElementById('toast').getAttribute('role'), 'status');
  assertEqual(doc.getElementById('status').getAttribute('role'), 'status');
  assertEqual(doc.querySelectorAll('noscript').length, 1);
});

uiTest('كل الأزرار تحمل type=button (لا إرسال نماذج عرضي)', ({ doc }) => {
  for (const b of doc.querySelectorAll('button')) {
    assertEqual(b.getAttribute('type'), 'button', `زر بلا type: ${b.id || b.className}`);
  }
});

uiTest('عدّاد الدوال يُشتق من القاموس', ({ doc }) => {
  const n = String(Object.keys(FUNCTIONS).length);
  assertEqual(doc.getElementById('fn-count-section').textContent, n);
  assertEqual(doc.getElementById('fn-count-footer').textContent, n);
  assertContains(doc.getElementById('fn-count-badge').textContent, n);
});

uiTest('تبديل الثيم يضبط data-theme و aria-pressed', ({ doc }) => {
  const toggle = doc.getElementById('theme-toggle');
  assertEqual(doc.documentElement.dataset.theme, '');
  toggle.click();
  assertEqual(doc.documentElement.dataset.theme, 'dark');
  assertEqual(toggle.getAttribute('aria-pressed'), 'true');
  toggle.click();
  assertEqual(doc.documentElement.dataset.theme, '');
  assertEqual(toggle.getAttribute('aria-pressed'), 'false');
});

uiTest('رسالة الخطأ معزولة بـbdi ومُعلَنة assertive', ({ doc, api }) => {
  const $status = doc.getElementById('status');
  doc.getElementById('formula-input').value = '=SUM(';
  api.doConvert();
  // الرسالة تدمج شظايا لاتينية في نص عربي — بلا bdi تنقلب مواضع الأقواس
  assertEqual($status.querySelectorAll('bdi').length, 1, 'رسالة الخطأ يجب أن تكون داخل <bdi>');
  assertEqual($status.getAttribute('aria-live'), 'assertive');

  doc.getElementById('formula-input').value = '=SUM(A1:A3)';
  api.doConvert();
  assertEqual($status.getAttribute('aria-live'), 'polite', 'النجاح يبقى polite');
});

uiTest('مفتاح وضع النطاقات يغيّر توقيع الدالة', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=SUM(A1:A5)';
  api.doConvert();
  assertContains(doc.querySelector('.code-content').textContent, 'calculate(a1, a2, a3, a4, a5)');

  doc.getElementById('range-mode').checked = true;
  api.doConvert();
  assertContains(doc.querySelector('.code-content').textContent, 'calculate(a1_a5)');
});

/* ------------------------------------------------------------
   حرّاس اتساق بين الكود والـCSS — كلها كانت تنكسر بصمت
   ------------------------------------------------------------ */
test('UI: CSS guard', 'كل فئة في FUNCTIONS لها تسمية عربية ولون', () => {
  needsHtml();
  // إضافة فئة جديدة كانت تُنتج زر "undefined (n)" وشارة بلا لون، بلا أي خطأ
  for (const cat of new Set(Object.values(FUNCTIONS).map((f) => f.cat))) {
    assertEqual(typeof CAT_LABELS[cat], 'string', `فئة بلا تسمية عربية: ${cat}`);
    assertContains(INDEX_HTML, `.ref-cat.${cat}`, `فئة بلا لون في CSS: ${cat}`);
    assertContains(INDEX_HTML, `--cat-${cat}-bg`, `فئة بلا متغيّر لون: ${cat}`);
  }
});

test('UI: CSP guard', 'hash السكربت المضمّن يطابق محتواه فعلياً', () => {
  needsHtml();
  if (!crypto) skip('يحتاج وحدة crypto');
  // script-src بلا 'unsafe-inline' الآن: أي تعديل على السكربت المضمّن
  // يبطل الـhash ويمنع المتصفح من تنفيذه (فيعود وميض الوضع الفاتح)
  const body = INDEX_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  const digest = 'sha256-' + crypto.createHash('sha256').update(body, 'utf8').digest('base64');
  // نقرأ من وسم الـmeta وحده — التعليق المجاور يذكر 'unsafe-inline' نصاً
  const csp = INDEX_HTML.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)[1];
  const declared = csp.match(/script-src[^;]*'(sha256-[^']+)'/)[1];
  assertEqual(digest, declared, 'أعد حساب الـhash بعد تعديل السكربت المضمّن');
  assertEqual(/script-src[^;]*'unsafe-inline'/.test(csp), false, 'script-src بلا unsafe-inline');
});

test('UI: CSP guard', "script-src بلا 'unsafe-eval'", () => {
  needsHtml();
  // شبكة الأمان النحوية (new Function) صارت حارس تطوير مطفأً في
  // المتصفح، فما عاد لـ'unsafe-eval' سبب. رجوعها للـCSP يعني إن أحداً
  // أعاد تشغيل الحارس في الصفحة بدل حزمة الاختبارات.
  const csp = INDEX_HTML.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)[1];
  assertEqual(/'unsafe-eval'/.test(csp), false, "لا يصح رجوع 'unsafe-eval' للـCSP");
  assertContains(csp, "default-src 'none'");
});

test('UI: CSS guard', 'ورقة طباعة تلغي قصّ كتلة الكود', () => {
  needsHtml();
  const block = INDEX_HTML.match(/@media print \{[\s\S]*?\n  \}/);
  assertEqual(block !== null, true, 'لا توجد قواعد @media print');
  assertContains(block[0], 'max-height: none');
  assertContains(block[0], '.convert-bar');
});

test('UI: CSS guard', 'الخلفيات المصمتة تستعمل --primary-solid لا --primary', () => {
  needsHtml();
  // القيمة الواحدة كانت ترسب في الدورين: 4.08:1 كمقدمة و4.12:1 كخلفية
  for (const sel of ['.btn-primary', '.filter-btn.active']) {
    const rule = INDEX_HTML.match(new RegExp(escapeRe(sel) + '\\s*\\{[^}]*\\}'));
    assertEqual(rule !== null, true, `قاعدة ${sel} غير موجودة`);
    assertContains(rule[0], 'var(--primary-solid)', sel);
  }
});

test('UI: CSS guard', 'المحاذاة المنطقية بدل الفيزيائية خارج جزر الـLTR', () => {
  needsHtml();
  for (const sel of ['.example-card', '.ref-table th']) {
    const rule = INDEX_HTML.match(new RegExp(escapeRe(sel) + '\\s*\\{[^}]*\\}'));
    assertEqual(rule !== null, true, `قاعدة ${sel} غير موجودة`);
    assertContains(rule[0], 'text-align: start', sel);
  }
});

/* ------------------------------------------------------------
   الجولة الثالثة (مِحَك 2026-08-22) — وصول وتغذية راجعة
   ------------------------------------------------------------ */

uiTest('الفشل الصامت يترك تلميحاً بدل لوحة فاضية', ({ doc, api }) => {
  // كان طريقاً مسدوداً: لصق صيغة بدالة غير مدعومة يخفي كل شيء
  doc.getElementById('formula-input').value = '=SUMIF(A1:A10,">0")';
  api.doConvert({ silent: true });
  const empty = doc.querySelector('#output-wrap .code-empty');
  assertEqual(empty !== null, true, 'لازم يظهر نص بديل في لوحة المخرَج');
  assertContains(empty.textContent, 'اضغط «تحويل»');
});

uiTest('التحويل الناجح يمسح تلميح الفشل', ({ doc, api }) => {
  const $in = doc.getElementById('formula-input');
  $in.value = '=SUMIF(A1:A10,">0")';
  api.doConvert({ silent: true });
  $in.value = '=SUM(A1:A3)';
  api.doConvert();
  assertEqual(doc.querySelector('#output-wrap .code-empty'), null);
  assertContains(doc.querySelector('.code-content').textContent, 'function calculate');
});

uiTest('الخطأ يعلَّم على الحقل نفسه بـaria-invalid', ({ doc, api }) => {
  // التعليم البصري (.err-mark) مرئي بحت — قارئ الشاشة ما كان يعرف شيئاً
  const $in = doc.getElementById('formula-input');
  $in.value = '=XYZ(A1)';
  api.doConvert();
  assertEqual($in.getAttribute('aria-invalid'), 'true');
  assertEqual($in.getAttribute('aria-describedby'), 'status');
  // ورسالة الخطأ فعلاً في العنصر المُشار إليه
  assertContains(doc.getElementById('status').textContent, 'غير مدعومة');
});

uiTest('النجاح ينزع aria-invalid عن الحقل', ({ doc, api }) => {
  const $in = doc.getElementById('formula-input');
  $in.value = '=XYZ(A1)';
  api.doConvert();
  $in.value = '=SUM(A1:A3)';
  api.doConvert();
  assertEqual($in.hasAttribute('aria-invalid'), false);
  assertEqual($in.hasAttribute('aria-describedby'), false);
});

uiTest('حاويات التمرير قابلة للوصول بلوحة المفاتيح', ({ doc }) => {
  // WCAG 2.1.1: محتوى يمرّر بلا وسيلة تمرير من لوحة المفاتيح = محتوى مفقود
  for (const sel of ['#output-wrap', '.ref-table-wrap']) {
    const node = doc.querySelector(sel);
    assertEqual(node.getAttribute('tabindex'), '0', `${sel} لازم يستقبل التركيز`);
    assertEqual(node.getAttribute('role'), 'region');
    assertEqual(!!node.getAttribute('aria-label'), true, `${sel} يحتاج اسماً`);
  }
});

uiTest('توقيع بباراميترات كثيرة يقترح وضع النطاقات', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=SUM(A1:A20)';
  api.doConvert();
  const info = doc.getElementById('output-info').textContent;
  assertContains(info, 'النطاقات كمصفوفات');
});

uiTest('التوقيع القصير بلا اقتراح', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=A1+B1';
  api.doConvert();
  assertEqual(doc.querySelector('#output-info .info-nudge'), null);
});

uiTest('الاقتراح يختفي حين يكون وضع النطاقات مفعّلاً', ({ doc, api }) => {
  doc.getElementById('range-mode').checked = true;
  doc.getElementById('formula-input').value = '=SUM(A1:A20)';
  api.doConvert();
  assertEqual(doc.querySelector('#output-info .info-nudge'), null);
});

uiTest('كل صف في الجدول المرجعي يحمل وصفه لعرض الجوال', ({ doc }) => {
  // على الجوال يُخفى عمود الوصف ويُعرض من data-desc عبر ::after
  const rows = doc.querySelectorAll('#ref-table-body tr');
  assertEqual(rows.length, Object.keys(FUNCTIONS).length);
  for (const tr of rows) {
    const cell = tr.children[1];
    const name = cell.textContent.trim();
    assertEqual(cell.dataset.desc, FUNCTIONS[name].desc, `${name}: data-desc ناقص`);
  }
});

uiTest('الأمثلة السريعة كلها تتحوّل بلا خطأ', ({ doc, api }) => {
  // EXAMPLES صارت بيانات على مستوى الوحدة — نتأكد إنها ما زالت صالحة
  for (const ex of NS.EXAMPLES) {
    doc.getElementById('formula-input').value = ex.formula;
    api.doConvert();
    assertEqual(
      doc.getElementById('formula-input').hasAttribute('aria-invalid'),
      false,
      `المثال "${ex.label}" فشل: ${ex.formula}`
    );
  }
});

test('UI: CSS guard', 'وضع التباين العالي يخفي طبقة التلوين', () => {
  needsHtml();
  // النص الشفاف فوق طبقة تلوين يعطي نصّين متراكبين حين يفرض النظام الألوان
  assertContains(INDEX_HTML, '@media (forced-colors: active)');
  const block = INDEX_HTML.match(/@media \(forced-colors: active\) \{([\s\S]*?)\n  \}/)[1];
  assertContains(block, '.editor-highlight { display: none; }');
  assertContains(block, 'CanvasText');
});
