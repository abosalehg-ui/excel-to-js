/* ============================================================
   suite-ui.js — اختبارات طبقة الواجهة
   ------------------------------------------------------------
   تُشغَّل في Node فقط (تحتاج jsdom لبناء DOM من index.html).
   إذا لم تكن jsdom مثبّتة تُسجَّل الاختبارات كمتخطّاة بدل الفشل،
   فيبقى `node tests/run-node.js` صالحاً بلا npm install.

   سبب وجود هذا الملف: ثلاثة أعطال بصرية وصلت للإنتاج لأن
   assets/ui.js لم يكن مغطّى بأي اختبار.
   ============================================================ */
const fs = require('fs');
const path = require('path');

let JSDOM = null;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  JSDOM = null;
}

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const { tokenizeJS, initUI } = require('../assets/ui.js');

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
  // بداية السطر تميّز القاعدة المستقلة عن المشتركة (.editor-highlight, .editor-input)
  const rule = INDEX_HTML.match(/\n\s*\.editor-input\s*\{[^}]*\}/);
  assertEqual(rule !== null, true, 'قاعدة .editor-input غير موجودة');
  assertContains(rule[0], 'color: transparent');
  assertContains(rule[0], 'caret-color');
});

test('UI: CSS guard', 'الطبقتان تصرّحان بنفس المحاذاة صراحةً', () => {
  // <textarea> لا يرث text-align (الـUA stylesheet يفرض start)
  const shared = INDEX_HTML.match(/\.editor-highlight,\s*\.editor-input\s*\{[^}]*\}/);
  assertEqual(shared !== null, true, 'القاعدة المشتركة غير موجودة');
  assertContains(shared[0], 'text-align: left');
});

test('UI: CSS guard', 'ألوان التظليل لها نسخة ليلية', () => {
  for (const cls of ['tk-fn', 'tk-num', 'tk-str', 'tk-cell', 'tk-op', 'tk-paren']) {
    assertContains(INDEX_HTML, `[data-theme="dark"] .${cls}`);
  }
});

test('UI: CSS guard', '[hidden] محصّنة ضد قواعد display الأخرى', () => {
  // .btn { display: inline-flex } يتغلّب على [hidden] من الـUA stylesheet،
  // فيظهر زر التراجع رغم hidden. jsdom يفحص الخاصية لا التصيير، لذا الحارس هنا.
  assertContains(INDEX_HTML, '[hidden] { display: none !important; }');
});

test('UI: CSS guard', 'الـtoast يستعمل متغيّراً مخصصاً لا var(--text)', () => {
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
    if (!JSDOM) {
      // بلا jsdom نتخطّى بصمت بدل الفشل الكاذب
      return;
    }
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
  const expected = convertFormula('=IF(A1>0,"نعم","لا")').code;
  assertEqual(shown, expected);
});

uiTest('أرقام الأسطر تطابق عدد أسطر الكود', ({ doc, api }) => {
  doc.getElementById('formula-input').value = '=COUNTIF(A1:A3,">5")';
  api.doConvert();
  const code = convertFormula('=COUNTIF(A1:A3,">5")').code;
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
