# مراجعة كود — excel-to-js

**التاريخ:** 2026-08-04 · **الـ commit المُراجَع:** `4c165e7` · **الفرع:** `main`

---

## الحكم النهائي

مشروع مبني بانضباط حقيقي: بنية مُصرِّف نظيفة (Tokenizer → Parser → Generator)، سجلّ دوال قائم على عقود مُصرَّح بها، حزمة اختبارات تنفّذ الكود المولّد فعلياً، وCI يشغّلها بمنطقتين زمنيتين. لكنه يحمل عيباً وظيفياً واحداً يضرب أشهر حالات الاستخدام (الخلية الفارغة تُنتج نص `undefined` حرفياً في الدمج والدوال النصية)، وحزمة اختبارات تُبلّغ عن نجاح كاذب حين تغيب `jsdom`، وثلاثة إخفاقات تباين مقيسة تحت عتبة WCAG AA.

**الدرجة المرجّحة: 7.5/10** · **ملف الترجيح المختار: C — أداة أوفلاين بلا خادم وبلا شبكة (هندسي 40% / UX 40% / أمن 20%)**

**هل المشروع جاهز للاستخدام/النشر؟ — بشروط.** صالح للنشر بعد إصلاح البند الأول؛ البقية لا تمنع النشر.

**أهم ثلاث مشاكل:**

1. `=A1&" ر.س"` على خلية فارغة يُنتج `"undefined ر.س"` — نفس العيب يضرب `CONCATENATE` و`LEN` و`TRIM` و`UPPER` و`LEFT`، وأحد أمثلة الواجهة نفسها مصاب به.
2. سبعة عشر اختبار DOM تُسجَّل ناجحة عند غياب `jsdom` بدل أن تُسجَّل متخطّاة — تحقّقت: `172/172 passed` بلا `node_modules` أصلاً.
3. ثلاث نسب تباين محسوبة من الـCSS تحت 4.5:1 (`3.64` و`3.50` و`4.12`)، ورسائل الخطأ تُعلَن في منطقة `aria-live="polite"` بدل `assertive`.

---

## 1. نظرة عامة

**ما يفعله المشروع:** موقع ثابت يحوّل صيغة Excel إلى دالة JavaScript مستقلة اسمها `calculate()`، مع توليد الـ helpers اللازمة فقط ومرتّبة topologically. لا خادم، لا شبكة، لا خطوة بناء — يكفي فتح `index.html`.

**البنية:** `index.html` (واجهة + CSS مضمّن) ← `assets/helpers.js` (سجلّ `HELPERS`) ← `assets/functions.js` (سجلّ `FUNCTIONS` بعقود الوسائط) ← `assets/engine.js` (Tokenizer + Parser + Generator + `LIMITS`) ← `assets/ui.js` (`initUI()` + `tokenizeJS()`). التحميل بترتيب صريح عبر أربعة وسوم `<script>`.

**المكدّس والإصدارات (من ملفات المانيفست الفعلية):**

| البند | القيمة | المصدر |
| --- | --- | --- |
| اللغة | JavaScript ES2020 (بلا وحدات، نمط UMD يدوي) | `assets/*.js` |
| تبعيات وقت التشغيل | لا شيء | `package.json` |
| تبعيات التطوير | `jsdom ^25.0.1` · `prettier ^3.3.3` | `package.json` |
| القفل | `lockfileVersion 3` · 61 حزمة (jsdom 25.0.1) | `package-lock.json` |
| CI | GitHub Actions · Node 20 · `npm ci` + prettier + الاختبارات ×2 | `.github/workflows/tests.yml` |
| الرخصة | MIT | `LICENSE` |

**الحجم والتصنيف:** 21 ملفاً متتبَّعاً · 6076 سطراً إجمالاً (منها 833 سطر `package-lock.json` و747 سطر تقارير مراجعة سابقة). الكود الفعلي ≈ 2900 سطر موزّعة على 5 ملفات مصدر و4 ملفات اختبار.

**التصنيف:** أداة أوفلاين بواجهة رسومية، بلا خلفية وبلا أي طلب شبكة — **ملف الترجيح C**. اخترته لا A لأن سطح الهجوم منعدم عملياً (لا مُدخل إلا صيغة يكتبها المستخدم لنفسه، ولا تخزين إلا تفضيل الثيم)، بينما الواجهة العربية RTL هي المنتج نفسه لا غلافه — فوزن الـUX يجب أن يساوي وزن الهندسة.

---

## 2. المراجعة التقنية والهندسية

### 2.1 المعمارية وفصل الاهتمامات — 8/10

الفصل حقيقي لا اسمي: كل دالة Excel تُعرَّف كبيانات تصف عقدها، والمحرّك يقرأ العقد ولا يعرف شيئاً عن الدوال. هذا يجعل إضافة دالة تعديلاً في مكان واحد.

`assets/functions.js` — `VLOOKUP`:

```js
VLOOKUP: {
  cat: 'lookup',
  minArgs: 3,
  maxArgs: 4,
  usesHelpers: ['_vlookup'],
  matrixArgs: [1],
  generator: (args, ctx) => { ... }
}
```

والمحرّك يفرض العقد مركزياً في `assets/engine.js` داخل `generate` (حالة `Call`):

```js
const argc = node.args.length;
const min = fn.minArgs ?? 0;
const max = fn.maxArgs ?? Infinity;
if (argc < min || argc > max) {
```

`ctx.once` في نفس الملف حلٌّ صحيح لمشكلة حقيقية (تضخم أسّي للناتج عند التداخل):

```js
once(expr, build) {
  if (SIMPLE_EXPR.test(expr)) return build(expr);
  const v = `_v${++tmpId}`;
  return `((${v}) => ${build(v)})(${expr})`;
}
```

**ما يخصم الدرجتين — تلويث فضاء الأسماء العام.** `assets/engine.js` في ذيله:

```js
global.LIMITS = LIMITS;
global.tokenize = tokenize;
global.parse = parse;
global.generate = generate;
global.convertFormula = convertFormula;
```

`parse` و`generate` و`tokenize` و`LIMITS` أسماء عامة جداً لتُنشر على `window`. وهذا يصطدم مباشرةً بادّعاء `README.md`: «ينفع كـ submodule في أي مشروع» — أي دمج مع مكتبة أخرى تُصدِّر `parse` سيكسر أحدهما بصمت. **الثقة: مؤكد.**

الإصلاح الأدنى — سطح واحد بدل خمسة:

```js
// قديم
global.LIMITS = LIMITS;
global.tokenize = tokenize;
global.parse = parse;
global.generate = generate;
global.convertFormula = convertFormula;

// جديد
global.ExcelToJS = Object.assign(global.ExcelToJS || {}, {
  LIMITS, tokenize, parse, generate, convertFormula
});
```

### 2.2 القراءة وقابلية الصيانة — 8/10

التعليقات تشرح **السبب** لا الفعل، وهذا نادر. مثال من `assets/helpers.js`:

```js
// _mod: باقي القسمة بدلالات Excel — إشارة الناتج تتبع المقسوم عليه
// (‏JS: -3 % 2 = -1، بينما Excel: MOD(-3,2) = 1)
```

ومن `index.html` تعليق يوثّق سبب تكرار تصريح ظاهره زائد:

```css
/* المتصفحات تفرض text-align:start على <textarea> من الـUA
   stylesheet فلا يرث من الأب، لذا نصرّح به هنا على الطبقتين معاً. */
```

لا ملاحظات سلبية جوهرية هنا.

### 2.3 التكرار وروائح الكود — 6/10

**أ. نمط الوسيط الاختياري مكرّر ثماني مرات** في `assets/functions.js` رغم وجود عقد `minArgs/maxArgs` يعرف أصلاً أيّ الوسائط اختياري:

```js
// IF
return `(${cond} ? ${a} : ${b !== undefined ? b : 'false'})`;
// LEFT
return `String(${str}).slice(0, ${n !== undefined ? n : '1'})`;
// SUBSTITUTE
return `_substitute(${str}, ${oldText}, ${newText}, ${instance !== undefined ? instance : 'undefined'})`;
// INDEX / MATCH / VLOOKUP / HLOOKUP / RIGHT — نفس الشكل
```

الحل: إضافة حقل `defaults` للعقد وملء الفجوات مركزياً في `engine.js` قبل استدعاء الـ generator:

```js
// قديم — في engine.js
const compiledArgs = node.args.map((a, idx) =>
  gen(a, { needsMatrix: matrixArgs.includes(idx) })
);

// جديد
const compiledArgs = node.args.map((a, idx) =>
  gen(a, { needsMatrix: matrixArgs.includes(idx) })
);
const defs = fn.defaults || [];
for (let k = argc; k < defs.length; k++) compiledArgs[k] = defs[k];
```

فيصبح `IF` مثلاً: `defaults: [, , 'false']` و`generator: ([c, a, b]) => \`(${c} ? ${a} : ${b})\``.

**ب. `VLOOKUP` و`HLOOKUP` تكرّران سطر تحويل الوسيط الرابع حرفياً:**

```js
const exactExpr =
  exact !== undefined ? ctx.once(exact, (e) => `(${e} === false || ${e} === 0)`) : 'false';
```

**ج. تحويل التاريخ مكرّر ثلاث مرات** في `YEAR` و`MONTH` و`DAY`:

```js
ctx.once(args[0], (d) => `(${d} instanceof Date ? ${d} : new Date(${d})).getFullYear()`)
```

استخراجه إلى helper `_toDate` يوحّد السلوك ويفتح الباب لدعم الأرقام التسلسلية لاحقاً في مكان واحد.

**د. مُشغّلا اختبارات منفصلان:** `tests.html` يعيد بناء جامع النتائج بـ`innerHTML` بينما `tests/run-node.js` يبني جامعاً آخر. المنطق واحد والصيانة مزدوجة. **الثقة: مؤكد.**

### 2.4 معالجة الأخطاء والحالات الحدّية — 6/10

الإيجابي حقيقي: كل خطأ يحمل `start`/`end` فتُظلَّل بقعة الخطأ في المحرر، وهناك خمسة حدود موارد مصرَّح بها في `LIMITS`، وشبكة أمان تُصرِّف الناتج قبل عرضه. تحققتُ من الحدود عملياً: `=SUM(A1:A1000,B1:B1000,C1:C500)` تُرفض برسالة `الصيغة تشير إلى أكثر من 2000 خلية`.

لكن ثلاث ثغرات حقيقية:

**أ. 🔴 الخلية الفارغة تُنتج نص `undefined` حرفياً.** هذا أخطر ما في المشروع. `assets/engine.js` — حالة `Binary`:

```js
if (node.op === '&') return `(String(${L}) + String(${R}))`;
```

و`assets/functions.js`:

```js
CONCATENATE: { generator: (args) => `[${args.join(', ')}].map(String).join('')` },
LEN:         { generator: (args) => `String(${args[0]}).length` },
TRIM:        { generator: (args) => `String(${args[0]}).trim()` },
UPPER:       { generator: (args) => `String(${args[0]}).toUpperCase()` },
```

`String(undefined)` = `"undefined"`. نتائج تنفيذ فعلي بقيم خلايا غير مُمرَّرة:

```
=CONCATENATE("الإجمالي: ",A1," ر.س")  =>  "الإجمالي: undefined ر.س"
=A1&" ر.س"                            =>  "undefined ر.س"
=LEN(A1)                              =>  9
=UPPER(A1)                            =>  "UNDEFINED"
=LEFT(A1,3)                           =>  "und"
```

المفارقة أن الصيغة الأولى هي **أحد أمثلة الواجهة نفسها** في `assets/ui.js`:

```js
{ label: 'دمج نصوص', cat: 'text', formula: '=CONCATENATE("الإجمالي: ",A1," ر.س")' },
```

في Excel الخلية الفارغة تساوي `""` في السياق النصي و`0` في السياق العددي. والمشروع يعرف هذا التمييز أصلاً — `ISBLANK` يفحص `undefined` بشكل صحيح — لكن الطبقة النصية لا تستعمله. **الثقة: مؤكد (نُفِّذ فعلياً).**

الإصلاح: helper واحد يُستعمل في كل موضع `String(x)`:

```js
// جديد — في assets/helpers.js
_str: {
  code: `function _str(v) {
  return v === null || v === undefined ? '' : String(v);
}`
},
```

```js
// قديم — assets/engine.js
if (node.op === '&') return `(String(${L}) + String(${R}))`;

// جديد
if (node.op === '&') {
  registerHelper('_str');
  return `(_str(${L}) + _str(${R}))`;
}
```

ونفس الاستبدال في `CONCATENATE`/`LEN`/`TRIM`/`UPPER`/`LOWER`/`LEFT`/`RIGHT`/`MID`/`REPLACE` مع إضافة `usesHelpers: ['_str']` لكل منها.

**ب. الوسائط غير الموجبة في `LEFT`/`MID` لا تُرفض.** تحققتُ:

```
=LEFT(A1,-1)  على "hello"  =>  "hell"    (Excel: #VALUE!)
=MID(A1,0,3)  على "hello"  =>  "he"      (Excel: #VALUE!)
```

السبب أن `String(x).slice(0, -1)` في JS تعني «كل شيء إلا الأخير». لاحظ أن `RIGHT` عولجت بعناية لنفس المشكلة (`ctx.once(len, (k) => ...)`) بينما `LEFT` و`MID` لم تُعالَجا — عدم اتساق داخلي، وليست ضمن جدول «الانحرافات المعروفة» في `README.md`. **الثقة: مؤكد.**

**ج. `copyCode` تترك `<textarea>` يتيماً في الـDOM إذا رمى `select()`.** في `assets/ui.js`:

```js
const ta = el('textarea');
ta.value = lastCode;
doc.body.appendChild(ta);
ta.select();          // ← خارج الـtry
try {
  doc.execCommand('copy');
  ...
}
doc.body.removeChild(ta);
```

الإصلاح: لفّ كل شيء بعد `appendChild` في `try { } finally { doc.body.removeChild(ta); }`. **الثقة: مؤكد.**

### 2.5 الأداء واستهلاك الموارد — 8/10

قرارات أداء مقصودة وموثّقة، لا صدفة:

- الـtokenizer بأنماط `y` (sticky) و`regex.lastIndex = pos` بدل `src.slice(pos)` — يلغي التخصيص التربيعي.
- التظليل مُجدوَل على إطار الرسم: `scheduleHighlight()` تستعمل `requestAnimationFrame` مع حارس `highlightFrame !== null`.
- التحويل التلقائي مُخفَّض بـ`AUTO_CONVERT_DELAY = 300`.
- `ctx.once` تمنع النمو الأسّي للناتج.
- خمسة حدود موارد مصرَّح بها في `LIMITS`.

قياس فعلي: `=SUM(A1:A1000)` تُولَّد في 6ms وتنتج 17814 حرفاً وتُنفَّذ صحيحاً.

**الخصم الوحيد — توقيع الدالة المولّدة.** كل خلية تصبح باراميتراً مستقلاً، فحدّ `totalCells: 2000` يعني أن `calculate()` قد تأخذ **ألفي باراميتر**. الكود يعمل تقنياً لكنه غير قابل للاستدعاء بشراً. الحل المعماري: تمرير النطاقات كمصفوفة واحدة (`calculate(a, ranges)`) بدل تفكيكها. تغيير كبير — أدرجته في الخطة كـ«تحسين» لا كعيب. **الثقة: مؤكد.**

### 2.6 الاختبارات والتغطية — 7/10

**شغّلتُ الحزمة فعلياً:**

```
✓ Tokenizer: 18/18   ✓ Parser: 19/19   ✓ Generator: 20/20
✓ Runtime: Logic: 9/9  ✓ Math: 14/14  ✓ Text: 11/11  ✓ Count: 7/7
✓ Lookup: 11/11  ✓ Date: 7/7  ✓ Check: 4/4  ✓ Composite: 3/3
✓ Excel Semantics: 6/6  ✓ Whitespace: 3/3  ✓ Limits: 5/5  ✓ once: 8/8
✓ UI: tokenizeJS: 5/5  ✓ UI: CSS guard: 5/5  ✓ UI: DOM: 17/17

172/172 passed (TZ=system)
172/172 passed (TZ=America/New_York)
```

و`prettier --check`: `All matched files use Prettier code style!`

المستوى فوق المتوسط بوضوح: الاختبارات تبني `calculate()` وتشغّلها بقيم حقيقية عبر `new Function` (`tests/framework.js` — `runFormula`)، والـCI يشغّل الحزمة بمنطقتين زمنيتين لالتقاط أخطاء التوقيت الصيفي، و`run-node.js` يفحص تطابق شارات README مع الواقع.

**لكن هناك نجاح كاذب مؤكد.** في `tests/suite-ui.js`:

```js
function uiTest(name, fn) {
  test('UI: DOM', name, () => {
    if (!JSDOM) {
      // بلا jsdom نتخطّى بصمت بدل الفشل الكاذب
      return;
    }
```

الدالة تعود بلا استثناء، والمُشغّل يعدّ «لم يرمِ = نجح». تحققتُ في هذه البيئة: `node_modules` **غير موجود** و`require('jsdom')` يفشل، ومع ذلك الخرج يقول `✓ UI: DOM: 17/17` والإجمالي `172/172`. هذا ليس تخطّياً صامتاً، بل ادّعاء نجاح كاذب — وهو أسوأ من الفشل لأنه يخفي انهيار الواجهة تماماً. **الثقة: مؤكد.**

الإصلاح — حالة ثالثة صريحة في الإطار:

```js
// قديم — tests/suite-ui.js
if (!JSDOM) {
  return;
}

// جديد
if (!JSDOM) {
  const e = new Error('تخطّي: jsdom غير مثبّتة — شغّل npm install');
  e.skipped = true;
  throw e;
}
```

مع تمييزها في `tests/run-node.js`:

```js
// قديم
} catch (e) {
  fail++;
  counts[t.category].fail++;

// جديد
} catch (e) {
  if (e.skipped) { skip++; counts[t.category].skip = (counts[t.category].skip || 0) + 1; continue; }
  fail++;
  counts[t.category].fail++;
```

**ثغرة تغطية ثانية:** `tests.html` يحمّل `tests/suite.js` فقط — لا `assets/ui.js` ولا `tests/suite-ui.js`:

```html
<script src="tests/framework.js"></script>
...
<script src="tests/suite.js"></script>
```

فمن يفتح `tests.html` (وهو ما تدعو إليه `README.md` وترتبط به شارة `Tests-172/172`) يرى **145** لا 172. **الثقة: مؤكد.**

**ثغرات أخرى:** لا قياس تغطية، ولا اختبار يحرس تطابق `CAT_LABELS` مع فئات `FUNCTIONS` (تفصيل في 2.8).

### 2.7 التوثيق — 8/10

`README.md` أفضل من المتوسط بمسافة: مخطط معماري نصي للمسار الكامل، جدول حدود الموارد بقيمها الفعلية، وأهمها **جدول «الانحرافات المعروفة عن Excel»** الذي يوثّق تسع حالات لا تطابق Excel بدل إخفائها. توثيق الانحرافات بهذه الصراحة سلوك ناضج ونادر.

**الخصم — انجراف الإصدارات في ثلاثة اتجاهات:**

| الموضع | القيمة |
| --- | --- |
| شارة `README.md` | `Version-3.0` |
| `package.json` | `3.1.2` |
| `package-lock.json` (حقل `version`) | `3.2.0` |
| `index.html` (`<footer>` والعنوان) | `3.1.2` |

فحص الاتساق في `tests/run-node.js` يغطي عدد الدوال وعدد الاختبارات فقط، لا الإصدار:

```js
const fnBadge = readme.match(/Functions-(\d+)-/);
const testBadge = readme.match(/Tests-(\d+)%2F(\d+)/);
```

(تحققتُ أن الـCI أخضر على `main` رغم ذلك — `npm ci` لا يعترض على حقل `version` المتباين، فالأثر توثيقي لا وظيفي.) **الثقة: مؤكد.**

الإصلاح: إضافة فحص ثالث في نفس المكان:

```js
// جديد — tests/run-node.js
const pkg = require('../package.json');
const verBadge = readme.match(/Version-([\d.]+)-/);
if (verBadge && verBadge[1] !== pkg.version) {
  console.error(`✗ شارة الإصدار في README (${verBadge[1]}) لا تطابق package.json (${pkg.version})`);
  fail++;
}
```

### 2.8 تسمية الأسماء واتساق الأسلوب — 8/10

الاتساق مفروض آلياً لا بالنية: `.prettierrc.json` + `.editorconfig` + خطوة `prettier --check` في الـCI (تحققتُ أنها تمر). الاصطلاح موحّد: معرّفات إنجليزية، تعليقات عربية، helpers مسبوقة بـ`_`، متغيرات DOM مسبوقة بـ`$`.

**الخصم — اقتران صامت بين ثلاثة مواضع لتعريف الفئة.** الفئات تُعرَّف في `assets/functions.js` (`cat: 'logic'`)، وتسمياتها في `assets/ui.js`:

```js
const CAT_LABELS = {
  logic: 'منطقية', math: 'رياضية', text: 'نصية',
  count: 'عدّ', date: 'تاريخ', lookup: 'بحث', check: 'فحص'
};
```

وألوانها في `index.html` (`.ref-cat.logic`, `.ref-cat.math`, …). والأزرار تُبنى من `FUNCTIONS` مباشرة:

```js
const cats = ['all', ...new Set(Object.values(FUNCTIONS).map((f) => f.cat))];
...
btn.textContent = cat === 'all' ? `الكل (${count})` : `${CAT_LABELS[cat]} (${count})`;
```

فإضافة دالة بفئة جديدة تُنتج زراً نصّه `undefined (3)` وشارة بلا لون — بلا أي خطأ في الطرفية وبلا اختبار يلتقطها (بحثتُ في `tests/`: لا ذكر لـ`CAT_LABELS` ولا `ref-cat`). **الثقة: مؤكد.**

الإصلاح — اختبار حارس في ثلاثة أسطر:

```js
// جديد — tests/suite-ui.js
test('UI: CSS guard', 'كل فئة في FUNCTIONS لها تسمية ولون', () => {
  for (const cat of new Set(Object.values(global.FUNCTIONS).map((f) => f.cat))) {
    assertEqual(typeof CAT_LABELS[cat], 'string', `فئة بلا تسمية: ${cat}`);
    assertContains(INDEX_HTML, `.ref-cat.${cat}`);
  }
});
```

### متوسط الفئة الهندسية

(8 + 8 + 6 + 6 + 8 + 7 + 8 + 8) ÷ 8 = 59 ÷ 8 = **7.4/10**

---

## 3. المظهر والتصميم وتجربة المستخدم

### 3.1 الاتساق البصري — 7/10

نظام رموز حقيقي في `:root` (39 متغيراً) مع نسخة كاملة لـ`[data-theme="dark"]`، ونصف قطر وظلال موحّدة. الملاحظة: ألوان `.ref-cat.*` مكتوبة كقيم سداسية خام خارج نظام المتغيرات، مضاعفة لكل ثيم:

```css
.ref-cat.logic   { background: #fef3c7; color: #92400e; }
...
[data-theme="dark"] .ref-cat.logic  { background: #3d2a00; color: #fbbf24; }
```

سبعة تكرارات في وضعين = أربعة عشر زوجاً خارج نظام الرموز. وأحجام الخط تحمل قيماً سحرية (`13.5px`، `12.5px`، `11px`) بلا مقياس معلن. **الثقة: مؤكد.**

### 3.2 قابلية الاستخدام ووضوح التنقّل — 8/10

مسار الاستخدام مدروس فعلاً: تحويل تلقائي أثناء الكتابة **يبتلع الأخطاء بصمت** (قرار صحيح — الصيغة نصف المكتوبة خاطئة دائماً)، مع `Ctrl+Enter` للتحويل الصريح، و18 مثالاً قابلاً للنقر، وبحث + تصفية بالفئة على جدول المرجع، وحالة فارغة صريحة (`ref-empty`).

الأبرز: **المسح قابل للتراجع** بدل حوار تأكيد:

```js
clearedValue = $input.value;
$input.value = '';
...
$btnUndo.hidden = false;
undoTimer = setTimeout(hideUndo, UNDO_WINDOW);
showToast('تم المسح — يمكنك التراجع');
```

نافذة ثماني ثوانٍ. هذا نمط أفضل من التأكيد المسبق ويستحق الذكر.

### 3.3 الاستجابة عبر نقاط الكسر — 7/10

نقطتان فقط (`1024px` و`640px`) وكلتاهما مبرَّرتان بتعليق يشرح القياس الذي أدى إليهما. على الجوال: زر التحويل يثبت أسفل الشاشة، والجدول المرجعي يصبح قابلاً للتمرير أفقياً مع إخفاء عمود الوصف، وشريط الفلاتر يمرَّر داخل نفسه:

```css
.ref-controls {
  /* العرض الصريح ضروري: بدونه يتمدد الشريط لعرض محتواه (682px)
     فيجرّ الصفحة كلها لتمرير أفقي بدل التمرير داخله */
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
```

**الناقص: لا `@media print` إطلاقاً** (بحثتُ: صفر تطابق). طباعة الصفحة تُخرج كتلة الكود بارتفاع `max-height: 480px` مقصوصاً، وشريط التحويل الثابت يطبع فوق المحتوى. لأداة ناتجها كود يُشارَك، هذا نقص محسوس. **الثقة: مؤكد.**

### 3.4 دعم العربية وRTL — 7/10

**الإيجابي وهو جوهري:** `<html lang="ar" dir="rtl">` صحيح، وسلسلة الخطوط تتضمن خطاً عربياً حقيقياً للينكس/أندرويد (`'Noto Sans Arabic'`) وكلها خطوط نظام بلا تحميل خارجي. والأرقام غربية (0-9) في كل مكان بلا خلط مع الهندية-العربية — اتساق كامل.

وأدق نقطة في الملف كلها معالجة **الجزر اللاتينية داخل صفحة عربية**: طبقتا المحرر (`textarea` شفاف فوق طبقة تلوين) لا تتحاذيان إلا إذا تشاركتا كل خصائص تخطيط النص، والمتصفح يفرض `text-align: start` على `<textarea>` من الـUA stylesheet:

```css
.editor-highlight, .editor-input {
  ...
  text-align: left; direction: ltr;
}
```

وهناك اختبار حارس يمنع عودة العطل (`UI: CSS guard` — «الطبقتان تصرّحان بنفس المحاذاة صراحةً»). هذا فهم عميق للبيدي لا يُرى غالباً.

**ثلاث ملاحظات:**

**أ. خصائص فيزيائية حيث يجب أن تكون منطقية.** الملف يستعمل الخصائص المنطقية في موضعين:

```css
header .badge { margin-inline-start: 8px; }
.status { border-inline-start: 4px solid; }
```

لكنه يستعمل الفيزيائية في موضعين مكافئين:

```css
.example-card { ... text-align: right; }
.ref-table th { ... text-align: right; ... }
```

`right` هنا صحيح بالصدفة لأن الصفحة RTL. الإصلاح:

```css
/* قديم */
.example-card { ... text-align: right; }
.ref-table th { ... text-align: right; ... }

/* جديد */
.example-card { ... text-align: start; }
.ref-table th { ... text-align: start; ... }
```

(الخصائص الفيزيائية في `.editor-*` و`.output-wrap` و`.line-numbers` **صحيحة ومقصودة** لأنها داخل حاويات `direction: ltr` صريحة — لا تُغيَّر.) **الثقة: مؤكد.**

**ب. لا عزل بيدي لشظايا الكود داخل رسائل الخطأ العربية.** رسائل `engine.js` تدمج رموزاً لاتينية داخل نص عربي:

```js
const err = new Error(`رمز غير متوقع: "${src[pos]}"`);
```

وتُحقن في `assets/ui.js` كنص خام داخل كتلة RTL:

```js
box.appendChild(doc.createTextNode(' ' + e.message));
```

بلا `<bdi>` ولا `unicode-bidi: isolate`، فترتيب علامتَي الاقتباس والأقواس حول الرمز اللاتيني ينقلب بصرياً — خصوصاً حين يكون الرمز نفسه `(` أو `)`. لاحظ أن كاتب الملف واعٍ بالمشكلة (استعمل RLM `‏` داخل تعليقات HTML) لكنه لم يطبّقها على نص وقت التشغيل. **الثقة: مؤكد (بنيوياً — لم أرصد التصيير).**

الإصلاح: حقن الرسالة في عنصر `<bdi>` بدل عقدة نصية:

```js
// قديم
box.appendChild(doc.createTextNode(' ' + e.message));

// جديد
box.appendChild(doc.createTextNode(' '));
box.appendChild(el('bdi', '', e.message));
```

**ج. التواريخ ميلادية فقط** (`YEAR`/`MONTH`/`DAY`/`DATE`/`EDATE`/`DATEDIF` كلها على `Date` الميلادي). هذا **مطابق لسلوك Excel** فلا يُحتسب عيباً، لكن جمهور الأداة عربي وقد يتوقع الهجري — يستحق سطراً في `README.md` لا أكثر.

### 3.5 إمكانية الوصول — 6/10

**الإيجابي ملموس:** مؤشر تركيز موحّد عبر `:where(a, button, input, textarea, [tabindex]):focus-visible`، واحترام `prefers-reduced-motion`، وصنف `.sr-only` مستعمل فعلاً لتسمية حقل البحث، و`aria-pressed` على زر الثيم وأزرار التصفية، وبطاقات الأمثلة `<button>` لا `<div>` (فتعمل بلوحة المفاتيح وEnter/Space)، و`aria-hidden` على الأيقونات وأرقام الأسطر وطبقة التظليل، و`<noscript>` صريح.

**الخصم — ثلاثة إخفاقات تباين محسوبة من قيم الـCSS نفسها** (WCAG AA للنص العادي = 4.5:1):

| العنصر | المقدمة | الخلفية | النسبة | الحكم |
| --- | --- | --- | ---: | --- |
| `.code-comment` (تعليقات الكود الناتج، 13.5px) | `#718096` | `#1e293b` (`--code-bg` الفاتح) | **3.64:1** | ❌ راسب |
| `.status.warn` | `#b7791f` | `#fffaf0` | **3.50:1** | ❌ راسب |
| `.filter-btn.active` (الوضع الليلي، 12px) | `#ffffff` | `#4a7fc1` | **4.12:1** | ❌ راسب |
| `--text-mute` على `--bg` | `#68717f` | `#f4f6f9` | 4.56:1 | ✅ بالكاد |
| `.line-numbers` | `#8b98ac` | `#1e293b` | 5.00:1 | ✅ |

المفارقة أن الملف يحمل تعليقات توثّق إصلاحات تباين سابقة (`/* ‏#8a94a3 كان 2.83:1 ... */`) — فالمنهج موجود لكن ثلاث قيم أفلتت. **الثقة: مؤكد (محسوبة بمعادلة WCAG على القيم المصرَّح بها).**

الإصلاح:

```css
/* قديم */
--code-comment: #718096;
--warn: #b7791f;
[data-theme="dark"] { --primary: #4a7fc1; }

/* جديد — 4.54:1 و4.53:1 و5.02:1 على الترتيب */
--code-comment: #8593a8;
--warn: #96631a;
[data-theme="dark"] { --primary: #3c6ba8; }
```

**ملاحظات وصول أخرى:**

- **رسائل الخطأ تُعلَن بأدب.** `<div class="status" id="status" role="status" aria-live="polite">` يُستعمل للنجاح **والخطأ** معاً. قارئ الشاشة يؤجّل إعلان الخطأ حتى يصمت المستخدم. الإصلاح: ضبط `aria-live` ديناميكياً في `showStatus`:

```js
// قديم
$status.className = `status show ${type}`;

// جديد
$status.className = `status show ${type}`;
$status.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
```

- **لا رابط تخطٍّ إلى المحتوى** رغم وجود `<main id="main">` جاهز للهدف.
- **`<th>` بلا `scope="col"`** في جدول المرجع.
- **أهداف اللمس دون 44px:** `.filter-btn` ≈ 33px و`.btn` ≈ 35px و`.theme-toggle` = 38px. تتجاوز الحد الأدنى المطلق (24px) وترسب في التوصية (44px).

### 3.6 تغذية المستخدم الراجعة — 8/10

مغطّاة بالكامل: حالة نجاح مفصّلة تذكر اسم الدالة وعدد الـhelpers، حالة خطأ مع تظليل موضع الخطأ في المحرر نفسه، قائمة الدوال المدعومة تُعرض تلقائياً عند استعمال دالة غير مدعومة (`e.unsupported`)، toast للنسخ، حالة فارغة للمخرَج وللجدول، ومسح قابل للتراجع. ولا حاجة لحالات تحميل — كل شيء متزامن ومحلي. **لا توجد ملاحظات.**

### متوسط فئة الـUX/UI

(7 + 8 + 7 + 7 + 6 + 8) ÷ 6 = 43 ÷ 6 = **7.2/10**

---

## 4. المراجعة الأمنية

**نموذج التهديد أولاً:** موقع ثابت بلا خلفية، بلا مصادقة، بلا قاعدة بيانات، وبلا أي طلب شبكة. بحثتُ عن مصادر مُدخل غير موثوق (`location`, `hash`, `postMessage`, `fetch`, `XMLHttpRequest`) في `assets/` و`index.html`: **صفر تطابق** — لا قراءة لمعاملات الرابط ولا استقبال رسائل. المُدخل الوحيد صيغة يكتبها المستخدم في متصفحه لنفسه. كل تقييم أدناه موزون بهذه القابلية للوصول.

### 4.1 الأسرار وبيانات الاعتماد — 10/10

فحصتُ الشجرة والتاريخ الكامل:

```bash
git log --all --full-history -- '*.env' '*.pem' '*.key' '*credentials*' '*secret*'   # لا نتائج
rg -n -i "api[_-]?key|secret|password|token|BEGIN (RSA|OPENSSH|PRIVATE) KEY|AKIA[0-9A-Z]{16}"
```

كل التطابقات في `README.md` و`REVIEW.md` و`REVIEW-2.md` وهي كلمة `Tokenizer` أو `GITHUB_TOKEN` في سياق شرحي. **لا أسرار في الشجرة ولا في التاريخ.** `.gitignore` يستثني `node_modules/` و`.idea/` و`.vscode/`. **الثقة: مؤكد.**

### 4.2 الحقن (XSS / حقن أوامر / اجتياز مسارات) — 7/10

**الإيجابي — إلغاء بنيوي لفئة XSS في الواجهة.** `assets/ui.js` لا يستعمل `innerHTML` ولا مرة واحدة (تحققتُ بالبحث: التطابق الوحيد داخل تعليق يشرح القرار):

```js
   1) لا يُستخدم innerHTML إطلاقاً — كل شيء يُبنى بعقد DOM و
      textContent.
```

وكل بناء يمر عبر `doc.createTextNode` أو `el(tag, cls, text)` التي تضبط `textContent`. هذا ليس تهرباً بل إلغاء للمخرج نفسه. لا حقن أوامر ولا نظام ملفات ولا مسارات في المشروع أصلاً.

**🔵 منخفض — `unsafe-eval` في CSP.** `index.html`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...">
```

مطلوبة لشبكة الأمان النحوية في `engine.js`:

```js
new Function(usedCells.join(', '), `return ${expr};`);
```

**التقييم الصحيح:** `new Function` هنا **تُصرِّف ولا تُنفّذ** (التصريف لا يشغّل الجسم)، وقائمة الباراميترات مشتقّة من `numToCol()` ومطبَّعة فلا تحقن، والحد `exprLength: 200000` يقيّد كلفة التصريف. مع انعدام أي مُدخل خارجي، **الخطورة منخفضة فعلاً** ولا ترقى لتصنيف أعلى رغم أن مطابقة الأنماط وحدها كانت سترفعها. الملاحظة الحقيقية أن `'unsafe-inline'` يمكن استبداله بـhash للسكربت المضمّن الوحيد (سكربت الثيم في `<head>`) بلا أي كلفة وظيفية. **الثقة: مؤكد.**

### 4.3 التحقق من المُدخلات والتطهير — 9/10

التحقق **إيجابي (allow-list)** وهو النهج الصحيح: الـtokenizer يقبل ثلاثة عشر نمطاً محدداً ويرمي على أي شيء آخر، والـparser يرفض الرموز الزائدة، وعقود الوسائط تُفحص مركزياً. وفوقها خمسة حدود موارد صريحة:

```js
const LIMITS = {
  inputLength: 10000,
  parseDepth: 64,
  rangeCells: 1000,
  totalCells: 2000,
  exprLength: 200000
};
```

اختبرتُ ثلاثة منها فعلياً وكلها تُفرَض بالرسالة الصحيحة. حدّ العمق مفروض في `parsePrimary` بـ`try/finally` فلا يتسرّب العدّاد عند الاستثناء — تفصيل صحيح.

### 4.4 المصادقة والتخويل — لا ينطبق

لا مستخدمين ولا جلسات ولا خلفية. مستثناة من متوسط الفئة.

### 4.5 التعامل مع البيانات الحساسة — 10/10

لا بيانات حساسة أصلاً. التخزين الوحيد مفتاح `excel-converter-theme` في `localStorage`، ملفوف بـ`try/catch` في الموضعين (القراءة في `<head>` والكتابة في `ui.js`) احتراماً لأوضاع الخصوصية. لا تسجيل (`console.log`) لأي قيمة مستخدم في مسار التطبيق. `<meta name="referrer" content="no-referrer">` موجود.

### 4.6 صحة التبعيات — 8/10

**شغّلتُ أداة التدقيق فعلياً:**

```
$ npm audit --package-lock-only
found 0 vulnerabilities
```

الوضع سليم بنيوياً: صفر تبعية وقت تشغيل (سطح هجوم سلسلة التوريد للمستخدم النهائي = صفر)، تبعيتا تطوير فقط، ملف قفل متتبَّع بـ`lockfileVersion 3` و61 حزمة، والـCI يستعمل `npm ci` لا `npm install`.

**الخصم:** إجراءات الـCI مثبّتة على وسوم متغيّرة:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
```

وسم `v4` قابل لإعادة التوجيه، فتغيير مالك المستودع للوسم يغيّر ما يُنفَّذ في الـCI. الحل المعياري تثبيت على SHA. ولا يوجد `dependabot.yml` لتتبّع الـadvisories تلقائياً. **الثقة: مؤكد.** (التبعيتان حديثتان — لا يوجد ما يستدعي «إصدار قديم — يحتاج فحص advisories».)

### 4.7 CORS وCSP وترويسات الأمان — 7/10

CSP بـ`meta` موجود وصارم في أساسه — `default-src 'none'` يمنع كل مصدر لم يُصرَّح به، و`base-uri 'none'` يغلق حقن `<base>`، و`form-action 'none'` يغلق إخراج البيانات بنموذج. هذا أعلى بكثير من المعتاد في مشروع بهذا الحجم على GitHub Pages، ومصحوب بتعليق يشرح لماذا اضطُر لكل استثناء.

الحدود المعروفة: `frame-ancestors` لا يعمل عبر `meta` (يحتاج ترويسة HTTP)، وGitHub Pages لا يسمح بترويسات مخصصة — فالحماية من clickjacking غير متاحة معمارياً. أثرها هنا شبه معدوم (لا إجراء حساس يمكن خداع المستخدم عليه) لكنها تستحق سطراً في التوثيق. **الثقة: مؤكد.**

### متوسط الفئة الأمنية

(10 + 7 + 9 + 10 + 8 + 7) ÷ 6 = 51 ÷ 6 = **8.5/10** (المصادقة مستثناة)

---

## 5. الدرجة الإجمالية المرجّحة

**ملف الترجيح: C — أداة أوفلاين، بلا خلفية، بلا شبكة.**

| الناحية | الدرجة | الوزن | المساهمة |
| --- | ---: | ---: | ---: |
| تقنية وهندسية | 7.4/10 | 40% | 7.4 × 0.40 = 2.96 |
| UX/UI | 7.2/10 | 40% | 7.2 × 0.40 = 2.88 |
| أمن سيبراني | 8.5/10 | 20% | 8.5 × 0.20 = 1.70 |
| **الإجمالي** | | **100%** | **7.54 → 7.5/10** |

**الحساب التفصيلي:**

- هندسي: (8 + 8 + 6 + 6 + 8 + 7 + 8 + 8) ÷ 8 = 59 ÷ 8 = 7.375 ≈ 7.4
- UX/UI: (7 + 8 + 7 + 7 + 6 + 8) ÷ 6 = 43 ÷ 6 = 7.167 ≈ 7.2
- أمني: (10 + 7 + 9 + 10 + 8 + 7) ÷ 6 = 51 ÷ 6 = 8.5 (بند المصادقة `لا ينطبق` ومستثنى من المقام)
- الإجمالي: 2.96 + 2.88 + 1.70 = 7.54

**قراءة الدرجة:** 7.5 تعني «فوق حدّ الإنتاج بقليل» — بنية مقصودة، معالجة أخطاء بمواضع، اختبارات تنفّذ الكود فعلاً، وتوثيق يعترف بانحرافاته. ما يمنعه من 8+ هو عيب وظيفي في مسار شائع، ونجاح اختباري كاذب، وثلاثة إخفاقات تباين.

---

## 6. خطة الإصلاح المرتّبة بالأولوية

| # | الأولوية | الناحية | المشكلة | الملف | الحل المقترح | الجهد | التأثير بعد الحل |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | حرج 🔴 | هندسي | الخلية الفارغة تُنتج `"undefined"` في `&` و`CONCATENATE`/`LEN`/`TRIM`/`UPPER`/`LOWER`/`LEFT`/`RIGHT`/`MID`/`REPLACE` | `engine.js`, `functions.js`, `helpers.js` | helper `_str` يحوّل `null/undefined` إلى `''`، واستبدال كل `String(x)` به | ساعة | يزيل ناتجاً خاطئاً في أكثر حالات الاستخدام شيوعاً |
| 2 | حرج 🔴 | هندسي | 17 اختبار DOM تُبلَّغ ناجحة عند غياب `jsdom` | `tests/suite-ui.js`, `tests/run-node.js` | حالة `skipped` صريحة وعدّاد ثالث في المشغّل | ساعة | تنتهي الثقة الكاذبة في `172/172` |
| 3 | مهم 🟠 | UX | ثلاث نسب تباين تحت 4.5:1 (`3.64` / `3.50` / `4.12`) | `index.html` | تعديل `--code-comment` و`--warn` و`--primary` الليلي | دقائق | مطابقة WCAG AA للنص العادي |
| 4 | مهم 🟠 | هندسي | `tests.html` يعرض 145 بينما الشارة والـREADME يقولان 172 | `tests.html` | إضافة وسمَي `assets/ui.js` و`tests/suite-ui.js` أو تصحيح الادّعاء | دقائق | تطابق الادّعاء مع الواقع في المشغّل المُعلَن |
| 5 | مهم 🟠 | UX | رسائل الخطأ في منطقة `aria-live="polite"` | `assets/ui.js` | `aria-live="assertive"` عند `type === 'error'` | دقائق | إعلان فوري للخطأ لمستخدمي قارئات الشاشة |
| 6 | مهم 🟠 | هندسي | `LEFT(x,-1)` و`MID(x,0,n)` تُرجعان نصاً بدل `#VALUE!` | `assets/functions.js` | حارس `ctx.once` كما في `RIGHT`، أو توثيقهما في جدول الانحرافات | ساعة | إزالة عدم اتساق داخلي غير موثّق |
| 7 | مهم 🟠 | هندسي | خمسة globals بأسماء عامة (`parse`, `generate`, `tokenize`, `LIMITS`) | `assets/engine.js` | تجميعها تحت `global.ExcelToJS` | دقائق | يجعل ادّعاء الـsubmodule في README صحيحاً |
| 8 | مهم 🟠 | هندسي | فئة جديدة في `FUNCTIONS` تُنتج زراً `undefined (n)` بلا لون | `tests/suite-ui.js` | اختبار حارس يربط `FUNCTIONS.cat` بـ`CAT_LABELS` و`.ref-cat.*` | دقائق | يمنع عطلاً بصرياً صامتاً عند التوسّع (V3.2) |
| 9 | مهم 🟠 | UX | لا عزل بيدي لشظايا الكود اللاتينية داخل رسائل الخطأ العربية | `assets/ui.js` | حقن `e.message` داخل `<bdi>` بدل عقدة نصية | دقائق | ترتيب بصري صحيح للأقواس والاقتباس |
| 10 | مهم 🟠 | هندسي | انجراف الإصدار: README `3.0` · package `3.1.2` · lock `3.2.0` | `README.md`, `package-lock.json`, `run-node.js` | توحيد القيم + فحص ثالث في `run-node.js` | دقائق | يمنع تكرار الانجراف آلياً |
| 11 | تحسين 🟡 | UX | لا `@media print` — كتلة الكود تُقصّ والشريط الثابت يطبع فوق المحتوى | `index.html` | كتلة طباعة: إلغاء `max-height` وإخفاء `.convert-bar` و`.theme-toggle` | دقائق | ناتج قابل للطباعة/التصدير PDF |
| 12 | تحسين 🟡 | UX | خاصيتان فيزيائيتان (`text-align: right`) حيث تُستعمل المنطقية في مواضع مكافئة | `index.html` | `text-align: start` في `.example-card` و`.ref-table th` | دقائق | اتساق مع منهج الملف نفسه |
| 13 | تحسين 🟡 | هندسي | تكرار نمط الوسيط الاختياري ×8 + `exactExpr` ×2 + تحويل التاريخ ×3 (13 موضعاً) | `assets/functions.js`, `assets/engine.js` | حقل `defaults` في العقد + helper `_toDate` | يوم | يقلّص السطح ويوحّد سلوك التواريخ في نقطة واحدة |
| 14 | تحسين 🟡 | UX | أهداف لمس 33–38px (دون توصية 44px) | `index.html` | `min-height: 44px` للأزرار داخل `@media (max-width: 640px)` | دقائق | لمس أدق على الجوال |
| 15 | تحسين 🟡 | UX | لا رابط تخطٍّ و`<th>` بلا `scope="col"` | `index.html` | رابط `.sr-only` إلى `#main` + `scope="col"` ×4 | دقائق | تنقّل أسرع بلوحة المفاتيح ودلالة جدول صحيحة |
| 16 | تحسين 🟡 | أمني | إجراءات CI مثبّتة على وسوم متغيّرة، ولا `dependabot.yml` | `.github/workflows/tests.yml` | التثبيت على SHA + ملف dependabot | دقائق | تحصين سلسلة توريد الـCI |
| 17 | تحسين 🟡 | أمني | `'unsafe-inline'` في `script-src` رغم وجود سكربت مضمّن واحد | `index.html` | استبداله بـ`'sha256-…'` لسكربت الثيم | دقائق | تشديد CSP بلا كلفة وظيفية |
| 18 | تحسين 🟡 | هندسي | `<textarea>` احتياطي النسخ يبقى في الـDOM إذا رمى `select()` | `assets/ui.js` | نقل `removeChild` إلى `finally` | دقائق | يمنع تسرّب عقدة DOM |
| 19 | تحسين 🟡 | هندسي | `naturalSort` يرتّب الأعمدة أبجدياً: `aa1, ab1, y1, z1` بدل ترتيب Excel | `assets/engine.js` | مقارنة بـ`colToNum()` لا `localeCompare` | دقائق | ترتيب باراميترات مطابق لتوقّع المستخدم |
| 20 | تحسين 🟡 | هندسي | `calculate()` قد تأخذ حتى 2000 باراميتراً | `assets/engine.js` | وضع إخراج بديل يمرّر النطاقات كمصفوفات | أكثر | واجهة قابلة للاستدعاء فعلياً على النطاقات الكبيرة |
| 21 | تحسين 🟡 | هندسي | `ISNUMBER(1/0)` → `true` (Excel: `FALSE`) — انحراف غير موثّق | `README.md` أو `functions.js` | إضافة `isFinite` للحارس أو صف في جدول الانحرافات | دقائق | إغلاق فجوة توثيق |
| 22 | تحسين 🟡 | UX | ألوان `.ref-cat.*` (14 زوجاً) خارج نظام المتغيّرات | `index.html` | نقلها إلى `:root` و`[data-theme="dark"]` | ساعة | مصدر حقيقة واحد للألوان |

---

## 7. أسرع المكاسب

خمسة إصلاحات، كلٌّ منها دون ثلاثين دقيقة، بأثر غير متناسب مع كلفتها.

### 7.1 إنهاء النجاح الكاذب في اختبارات الواجهة (~10 دقائق)

`tests/suite-ui.js`:

```js
// قديم
if (!JSDOM) {
  // بلا jsdom نتخطّى بصمت بدل الفشل الكاذب
  return;
}

// جديد
if (!JSDOM) {
  const e = new Error('تخطّي: jsdom غير مثبّتة — شغّل npm install');
  e.skipped = true;
  throw e;
}
```

`tests/run-node.js`:

```js
// قديم
  } catch (e) {
    fail++;
    counts[t.category].fail++;
    console.error(`✗ [${t.category}] ${t.name}\n  ${e.message}`);
  }

// جديد
  } catch (e) {
    if (e.skipped) {
      skip++;
      counts[t.category].skip = (counts[t.category].skip || 0) + 1;
      continue;
    }
    fail++;
    counts[t.category].fail++;
    console.error(`✗ [${t.category}] ${t.name}\n  ${e.message}`);
  }
```

(مع `let skip = 0;` بجانب `pass`/`fail`، وإضافة `skip` إلى سطر الملخّص.)

### 7.2 إصلاح نسب التباين الثلاث (~10 دقائق)

`index.html` — داخل `:root` و`[data-theme="dark"]`:

```css
/* قديم */
--code-comment: #718096;
--warn: #b7791f;

/* جديد — 4.54:1 و4.53:1 على خلفياتهما */
--code-comment: #8593a8;
--warn: #96631a;
```

```css
/* قديم */
[data-theme="dark"] { --primary: #4a7fc1; }

/* جديد — الأبيض عليه 5.02:1 بدل 4.12:1 */
[data-theme="dark"] { --primary: #3c6ba8; }
```

### 7.3 إعلان الأخطاء فوراً لقارئات الشاشة (~5 دقائق)

`assets/ui.js` — داخل `showStatus`:

```js
// قديم
function showStatus(type, buildBody) {
  $status.className = `status show ${type}`;
  clear($status);
  buildBody($status);
}

// جديد
function showStatus(type, buildBody) {
  $status.className = `status show ${type}`;
  $status.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  clear($status);
  buildBody($status);
}
```

### 7.4 تجميع الـglobals تحت سطح واحد (~10 دقائق)

`assets/engine.js` — الذيل:

```js
// قديم
global.LIMITS = LIMITS;
global.tokenize = tokenize;
global.parse = parse;
global.generate = generate;
global.convertFormula = convertFormula;

// جديد — مع إبقاء convertFormula لتوافق الاستدعاءات القائمة
global.ExcelToJS = Object.assign(global.ExcelToJS || {}, {
  LIMITS, tokenize, parse, generate, convertFormula
});
global.convertFormula = convertFormula;
global.tokenize = tokenize;
```

(الخطوة التالية: تحديث `assets/ui.js` و`tests/framework.js` للقراءة من `global.ExcelToJS` ثم حذف السطرين الأخيرين.)

### 7.5 حارس اتساق الفئات (~10 دقائق)

`tests/suite-ui.js` — بجانب اختبارات `UI: CSS guard`:

```js
// جديد
const { CAT_LABELS } = require('../assets/ui.js');

test('UI: CSS guard', 'كل فئة في FUNCTIONS لها تسمية ولون', () => {
  for (const cat of new Set(Object.values(global.FUNCTIONS).map((f) => f.cat))) {
    assertEqual(typeof CAT_LABELS[cat], 'string', `فئة بلا تسمية عربية: ${cat}`);
    assertContains(INDEX_HTML, `.ref-cat.${cat}`, `فئة بلا لون في CSS: ${cat}`);
  }
});
```

هذا الحارس يحمي المرحلة 3.2 من خارطة الطريق (13 دالة جديدة) مسبقاً.

---

## 8. ما لم تتم مراجعته

| العنصر | السبب |
| --- | --- |
| `node_modules/` | غير موجود أصلاً في هذه البيئة، ومستثنى بـ`.gitignore` — لم يُراجَع ولم يُثبَّت (منعاً لتعديل حالة المستودع) |
| `tests/suite.js` (889 سطراً) | قرأتُ ترويسته وعيّنة من 145 اختباراً عبر البحث بالنمط، لا كل جسم اختبار. اعتمدتُ على **تشغيلها الفعلي** كدليل بدل قراءتها سطراً سطراً |
| `package-lock.json` (833 سطراً) | فُحص برمجياً (الإصدار، عدد الحزم، شجرة التبعيات، `npm audit`) لا بالقراءة اليدوية |
| `REVIEW.md` و`REVIEW-2.md` (747 سطراً) | تقارير مراجعة سابقة، ليست كوداً. فُحصت بالبحث فقط للتأكد من خلوّها من الأسرار — **ولم أستند إلى استنتاجاتها في هذا التقرير**؛ كل ما ورد أعلاه مُشتقّ من الكود الحالي مباشرةً |
| السلوك البصري الفعلي (تصيير المتصفح) | لم أفتح متصفحاً. تقييم الاستجابة والبيدي مُشتقّ من تصريحات CSS والبنية، ونسب التباين **محسوبة رياضياً** من قيم الـCSS بمعادلة WCAG لا مقيسة من لقطة شاشة |
| تصيير قارئات الشاشة | لم يُختبر بـNVDA/VoiceOver. تقييم الوصول مبني على السمات والبنية |
| سلوك `npm ci` مع انجراف حقل `version` | لم أشغّله (يتطلب تثبيت تبعيات). تحققتُ بدلاً منه أن الـCI **أخضر فعلاً** على `4c165e7` عبر GitHub Actions — فالأثر توثيقي لا وظيفي |
| أداء المتصفح الحقيقي | القياسات أعلاه من Node 22 لا من محرك المتصفح |

**التغطية التقديرية:** ~92% من الكود المتتبَّع (100% من ملفات المصدر الخمسة و`index.html` و`tests.html` وكل ملفات الإعداد؛ تغطية جزئية لملف حزمة الاختبارات).

**مستوى الثقة الإجمالي في التقرير: عالٍ.** كل ملاحظة موسومة بـ`مؤكد` مأخوذة من كود قرأتُه فعلياً، ومعظمها متحقَّق منه بالتنفيذ (172 اختباراً شُغِّلت بمنطقتين زمنيتين، `prettier --check`، `npm audit`، وأكثر من ثلاثين صيغة نُفِّذت عبر `new Function` لرصد الدلالات، ونسب التباين محسوبة برمجياً). لا توجد ملاحظة `محتمل` واحدة في هذا التقرير عدا التحفّظ المذكور صراحةً على عزل البيدي (بنيوي، غير مرصود بالتصيير).
