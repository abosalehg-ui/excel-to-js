# 📊 محوّل صيغ Excel إلى JavaScript

<div align="center">

[![Live Demo](https://img.shields.io/badge/🌐%20Live%20Demo-abosalehg--ui.github.io-2c5282?style=for-the-badge)](https://abosalehg-ui.github.io/excel-to-js/)
[![Version](https://img.shields.io/badge/Version-3.0-success?style=for-the-badge)](https://github.com/abosalehg-ui/excel-to-js)
[![Functions](https://img.shields.io/badge/Functions-44-orange?style=for-the-badge)](#-الدوال-المدعومة)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**أداة محلية بالكامل لتحويل صيغ Excel إلى كود JavaScript جاهز — تعمل بدون إنترنت**

[🚀 جرّبها الآن](https://abosalehg-ui.github.io/excel-to-js/) · [📖 الدوال المدعومة](#-الدوال-المدعومة) · [⚙️ البنية التقنية](#️-البنية-التقنية)

</div>

---

## ✨ المميزات

- **🔌 أوفلاين بالكامل** — ملف HTML واحد مستقل، لا يحتاج سيرفر ولا إنترنت
- **⚡ 44 دالة مدعومة** — تغطي المنطقية، الرياضية، النصية، التواريخ، البحث، والفحص
- **🧠 Helpers ذكية** — تُولَّد فقط عند الحاجة في رأس الكود الناتج (لا ضخامة زائدة)
- **📐 نطاقات 1D و2D** — `SUM(A1:A10)` تُفرد تلقائياً، `VLOOKUP(A2,B1:D10,3)` تُولَّد كـ matrix
- **🎨 تظليل تركيبي** — تلوين الصيغة أثناء الكتابة مع تحديد موضع الأخطاء بدقة
- **📋 نسخ بزر واحد** — الكود الناتج جاهز للنسخ مباشرة

---

## 🚀 طريقة الاستخدام

**الطريقة الأولى — مباشرة من المتصفح:**

```
https://abosalehg-ui.github.io/excel-to-js/
```

**الطريقة الثانية — تشغيل محلي:**

```bash
git clone https://github.com/abosalehg-ui/excel-to-js.git
# افتح index.html مباشرة في المتصفح
```

لا توجد تبعيات، لا `npm install`، لا بناء. فقط افتح الملف.

---

## 📖 مثال سريع

**الصيغة في Excel:**
```
=VLOOKUP(A2,B1:D10,3,FALSE)
```

**الكود الناتج:**
```javascript
// ===== Helpers مساعدة =====
function _vlookup(lookupValue, table, colIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  for (const row of table) {
    if (row[0] === lookupValue) return row[colIndex - 1];
  }
  return '#N/A';
}

// ===== الدالة الرئيسية =====
// المُدخلات المطلوبة: a2, b1, c1, d1, b2, c2, d2, ...
function calculate(a2, b1, c1, d1, b2, c2, d2, b3, c3, d3, ...) {
  return _vlookup(a2, [[b1,c1,d1],[b2,c2,d2],[b3,c3,d3],...], 3, (false === false || false === 0));
}
```

---

## 📋 الدوال المدعومة

### 🟡 منطقية (5)
| الدالة | الوصف |
|--------|--------|
| `IF` | شرط ثلاثي |
| `AND` | كل الشروط صحيحة |
| `OR` | أحد الشروط صحيح |
| `NOT` | عكس قيمة منطقية |
| `IFERROR` | قيمة بديلة عند الخطأ |

### 🔵 رياضية (9)
| الدالة | الوصف |
|--------|--------|
| `SUM` | المجموع |
| `AVERAGE` | المتوسط الحسابي |
| `MIN` / `MAX` | الأصغر / الأكبر |
| `ROUND` | التقريب |
| `ABS` | القيمة المطلقة |
| `POWER` | رفع لقوة |
| `SQRT` | الجذر التربيعي |
| `MOD` | باقي القسمة |

### 🟢 نصية (10)
| الدالة | الوصف |
|--------|--------|
| `CONCATENATE` | دمج نصوص |
| `LEFT` / `RIGHT` / `MID` | استخراج أحرف |
| `LEN` | طول النص |
| `TRIM` | إزالة مسافات |
| `UPPER` / `LOWER` | تحويل الحالة |
| `REPLACE` | استبدال بالموقع |
| `SUBSTITUTE` | استبدال بالمحتوى |

### 🩷 عدّ (4)
| الدالة | الوصف |
|--------|--------|
| `COUNT` | عدّ الأرقام |
| `COUNTA` | عدّ غير الفارغة |
| `COUNTIF` | عدّ بشرط (يدعم `>5`, `<>0`, `"نص"`) |
| `COUNTIFS` | عدّ بشروط متعددة |

### 🟠 بحث (4)
| الدالة | الوصف |
|--------|--------|
| `VLOOKUP` | بحث عمودي في جدول |
| `HLOOKUP` | بحث أفقي في جدول |
| `INDEX` | استرجاع قيمة بإحداثيات |
| `MATCH` | موضع قيمة في مصفوفة |

### 🟣 تاريخ (8)
| الدالة | الوصف |
|--------|--------|
| `TODAY` / `NOW` | التاريخ/الوقت الحالي |
| `YEAR` / `MONTH` / `DAY` | مكوّنات التاريخ |
| `DATE` | إنشاء تاريخ |
| `EDATE` | إضافة شهور |
| `DATEDIF` | فرق بين تاريخين (Y/M/D/YM/YD/MD) |

### 🔷 فحص (4)
| الدالة | الوصف |
|--------|--------|
| `ISBLANK` | هل الخلية فارغة؟ |
| `ISNUMBER` | هل القيمة رقم؟ |
| `ISTEXT` | هل القيمة نص؟ |
| `ISERROR` | هل القيمة خطأ؟ |

---

## ⚙️ البنية التقنية

```
Excel Formula Input
       │
       ▼
   Tokenizer  ──►  يقسّم الصيغة إلى رموز (tokens) مع تتبع المواضع
       │
       ▼
    Parser   ──►  يبني شجرة AST بـ Recursive Descent
       │
       ▼
   Generator  ──►  يحوّل الـ AST إلى كود JS
       │              ├─ يتتبع الخلايا المستخدمة
       │              ├─ يفك النطاقات (1D أو 2D حسب الدالة)
       │              └─ يجمع الـ Helpers المطلوبة (topological sort)
       │
       ▼
  JavaScript Output
  ┌─────────────────────────────────┐
  │ // Helpers (لو احتاجت الصيغة)  │
  │ function _vlookup(...) { ... }  │
  │                                 │
  │ // الدالة الرئيسية             │
  │ function calculate(a2, b1, ...) │
  │   return ...;                   │
  │ }                               │
  └─────────────────────────────────┘
```

### قرارات معمارية رئيسية

**نظام Helpers الذكي:** بدل إنشاء مكتبة ثابتة، كل دالة تعلن عن الـ helpers اللي تحتاجها. الـ Generator يتتبع المستخدم فعلاً ويولّد فقط ما يلزم، بترتيب صحيح للتبعيات.

**النطاقات الثنائية:** `VLOOKUP` و`INDEX` تحتاج الجدول كـ `[[r1c1,r1c2],[r2c1,r2c2]]`، بينما `SUM` تحتاجه مسطّحاً. الـ Generator يقرر الشكل حسب `matrixArgs` في تعريف كل دالة.

**التواريخ كـ Date objects:** `DATE(2026,6,15)` تُولَّد كـ `new Date(2026, 5, 15)` مع تعديل الشهر تلقائياً (JS: 0-based). `EDATE` يعالج حالات نهاية الشهر.

**رفض الأعمدة الكاملة:** `B:C` تُرفض برسالة واضحة تقترح البديل (`B1:C100`).

---

## 🧪 الاختبارات

افتح `tests.html` في المتصفح لتشغيل suite الاختبارات. يغطي:

- **Tokenizer** — التعرّف على الخلايا، النطاقات، الأرقام، النصوص، العمليات
- **Parser** — بناء الـ AST، أولويات العمليات، الأخطاء النحوية
- **Generator** — توليد كود JS صحيح، تتبّع الخلايا والـ helpers
- **Runtime** — تنفيذ الكود الناتج للتأكد من صحة النتائج

---

## 📁 هيكل المشروع

```
excel-to-js/
├── index.html              ← الواجهة (HTML + CSS + سكربت UI)
├── tests.html              ← suite الاختبارات (يفتح في أي متصفح)
├── README.md
└── assets/
    ├── helpers.js          ← قاموس HELPERS (runtime helpers)
    ├── functions.js        ← قاموس FUNCTIONS (44 دالة)
    └── engine.js           ← Tokenizer + Parser + Generator
```

لا تبعيات خارجية، لا build tools، لا backend.

---

## ⚠️ ملاحظات مهمة

- **الخلايا كمتغيرات:** `A1` تصبح `a1` — القيم تُمرَّر كباراميترات للدالة
- **النطاقات الكبيرة:** الحد الأقصى 1000 خلية لكل نطاق
- **الأعمدة الكاملة:** `A:B` غير مدعومة، استخدم `A1:B100`
- **التواريخ:** تُعامَل كـ `Date` objects في JS، ليس كأرقام تسلسلية

---

## 📄 الرخصة

MIT License — حر الاستخدام والتعديل والتوزيع.

---

<div align="center">
صُنع بـ ❤️ لتحويل صيغ Excel إلى كود JS نظيف وجاهز
</div>
