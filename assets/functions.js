/* ============================================================
   functions.js — قاموس الدوال المدعومة
   ------------------------------------------------------------
   كل دالة: { cat, desc, jsEquiv, minArgs, maxArgs, generator,
              usesHelpers?, matrixArgs? }
     - minArgs/maxArgs: عقد عدد الوسائط — يُفحص مركزياً في
                        engine.js قبل استدعاء الـ generator
                        (maxArgs: Infinity = بلا حد أعلى)
     - usesHelpers: قائمة helpers يحتاجها هذا التوليد
     - matrixArgs:  أرقام الوسائط اللي لازم تتولّد كـ 2D matrix
                    (مثلاً VLOOKUP يبغى الجدول كـ matrix لا flat)
   ============================================================ */
(function (global) {
  const FUNCTIONS = {
    // ===== المنطقية =====
    IF: {
      cat: 'logic',
      desc: 'شرط: ترجع القيمة الأولى لو الشرط صحيح، وإلا الثانية',
      jsEquiv: 'cond ? a : b',
      minArgs: 2,
      maxArgs: 3,
      generator: (args) => {
        const [cond, a, b] = args;
        return `(${cond} ? ${a} : ${b !== undefined ? b : 'false'})`;
      }
    },
    AND: {
      cat: 'logic',
      desc: 'يرجع true لو كل الشروط صحيحة',
      jsEquiv: 'arr.every(Boolean)',
      minArgs: 1,
      maxArgs: Infinity,
      generator: (args) => `[${args.join(', ')}].flat(Infinity).every(v => Boolean(v))`
    },
    OR: {
      cat: 'logic',
      desc: 'يرجع true لو أحد الشروط صحيح',
      jsEquiv: 'arr.some(Boolean)',
      minArgs: 1,
      maxArgs: Infinity,
      generator: (args) => `[${args.join(', ')}].flat(Infinity).some(v => Boolean(v))`
    },
    NOT: {
      cat: 'logic',
      desc: 'يعكس قيمة منطقية',
      jsEquiv: '!a',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `(!${args[0]})`
    },
    IFERROR: {
      cat: 'logic',
      desc: 'يرجع قيمة بديلة لو حصل خطأ',
      jsEquiv: 'try { a } catch { b }',
      minArgs: 2,
      maxArgs: 2,
      usesHelpers: ['_isError'],
      generator: (args) => {
        const [val, fallback] = args;
        return `((()=>{const _f=()=>(${fallback});try{const _v=${val};return _isError(_v)?_f():_v;}catch(e){return _f();}})())`;
      }
    },

    // ===== الرياضية =====
    SUM: {
      cat: 'math',
      desc: 'مجموع الأرقام',
      jsEquiv: 'arr.reduce((a,b)=>a+b,0)',
      minArgs: 1,
      maxArgs: Infinity,
      generator: (args) => `[${args.join(', ')}].flat(Infinity).reduce((a,b)=>a+(Number(b)||0),0)`
    },
    AVERAGE: {
      cat: 'math',
      desc: 'المتوسط الحسابي',
      jsEquiv: 'sum / count',
      minArgs: 1,
      maxArgs: Infinity,
      usesHelpers: ['_nums'],
      generator: (args, ctx) =>
        ctx.once(
          `_nums([${args.join(', ')}])`,
          (a) => `(${a}.length ? ${a}.reduce((x, y) => x + y, 0) / ${a}.length : '#DIV/0!')`
        )
    },
    MIN: {
      cat: 'math',
      desc: 'أصغر قيمة',
      jsEquiv: 'Math.min(...arr)',
      minArgs: 1,
      maxArgs: Infinity,
      usesHelpers: ['_nums'],
      generator: (args, ctx) =>
        ctx.once(`_nums([${args.join(', ')}])`, (a) => `(${a}.length ? Math.min(...${a}) : 0)`)
    },
    MAX: {
      cat: 'math',
      desc: 'أكبر قيمة',
      jsEquiv: 'Math.max(...arr)',
      minArgs: 1,
      maxArgs: Infinity,
      usesHelpers: ['_nums'],
      generator: (args, ctx) =>
        ctx.once(`_nums([${args.join(', ')}])`, (a) => `(${a}.length ? Math.max(...${a}) : 0)`)
    },
    ROUND: {
      cat: 'math',
      desc: 'تقريب رقم لعدد محدد من المنازل',
      jsEquiv: '_round(n, digits)',
      minArgs: 2,
      maxArgs: 2,
      usesHelpers: ['_round'],
      generator: (args) => `_round(${args[0]}, ${args[1]})`
    },
    ABS: {
      cat: 'math',
      desc: 'القيمة المطلقة',
      jsEquiv: 'Math.abs(n)',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `Math.abs(${args[0]})`
    },
    POWER: {
      cat: 'math',
      desc: 'رفع رقم لقوة',
      jsEquiv: 'Math.pow(a, b)',
      minArgs: 2,
      maxArgs: 2,
      generator: (args) => `Math.pow(${args[0]}, ${args[1]})`
    },
    SQRT: {
      cat: 'math',
      desc: 'الجذر التربيعي',
      jsEquiv: 'Math.sqrt(n)',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `Math.sqrt(${args[0]})`
    },
    MOD: {
      cat: 'math',
      desc: 'باقي القسمة (إشارة الناتج تتبع المقسوم عليه كما في Excel)',
      jsEquiv: '_mod(a, b)',
      minArgs: 2,
      maxArgs: 2,
      usesHelpers: ['_mod'],
      generator: (args) => `_mod(${args[0]}, ${args[1]})`
    },

    // ===== النصية =====
    CONCATENATE: {
      cat: 'text',
      desc: 'دمج عدة نصوص',
      jsEquiv: 'a + b + ...',
      minArgs: 1,
      maxArgs: Infinity,
      generator: (args) => `[${args.join(', ')}].map(String).join('')`
    },
    LEFT: {
      cat: 'text',
      desc: 'يأخذ أحرف من اليسار',
      jsEquiv: 'str.slice(0, n)',
      minArgs: 1,
      maxArgs: 2,
      generator: (args) => {
        const [str, n] = args;
        return `String(${str}).slice(0, ${n !== undefined ? n : '1'})`;
      }
    },
    RIGHT: {
      cat: 'text',
      desc: 'يأخذ أحرف من اليمين',
      jsEquiv: 'str.slice(-n)',
      minArgs: 1,
      maxArgs: 2,
      generator: (args, ctx) => {
        const [str, n] = args;
        const len = n !== undefined ? n : '1';
        // slice(-0) يعيد النص كاملاً، بينما RIGHT(x, 0) في Excel = ""
        return ctx.once(len, (k) => `(${k} <= 0 ? '' : String(${str}).slice(-${k}))`);
      }
    },
    MID: {
      cat: 'text',
      desc: 'استخراج جزء من نص',
      jsEquiv: 'str.substring(start-1, start-1+len)',
      minArgs: 3,
      maxArgs: 3,
      generator: (args, ctx) => {
        const [str, start, len] = args;
        return ctx.once(`(${start}) - 1`, (i) => `String(${str}).substring(${i}, ${i} + (${len}))`);
      }
    },
    LEN: {
      cat: 'text',
      desc: 'طول النص',
      jsEquiv: 'str.length',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `String(${args[0]}).length`
    },
    TRIM: {
      cat: 'text',
      desc: 'إزالة المسافات الزائدة',
      jsEquiv: 'str.trim()',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `String(${args[0]}).trim()`
    },
    UPPER: {
      cat: 'text',
      desc: 'تحويل لأحرف كبيرة',
      jsEquiv: 'str.toUpperCase()',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `String(${args[0]}).toUpperCase()`
    },
    LOWER: {
      cat: 'text',
      desc: 'تحويل لأحرف صغيرة',
      jsEquiv: 'str.toLowerCase()',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `String(${args[0]}).toLowerCase()`
    },
    REPLACE: {
      cat: 'text',
      desc: 'استبدال جزء من نص بالموقع',
      jsEquiv: 'str.slice + new + str.slice',
      minArgs: 4,
      maxArgs: 4,
      generator: (args, ctx) => {
        const [str, start, num, newStr] = args;
        return ctx.once(`String(${str})`, (s) =>
          ctx.once(
            `(${start}) - 1`,
            (i) => `(${s}.slice(0, ${i}) + String(${newStr}) + ${s}.slice(${i} + (${num})))`
          )
        );
      }
    },
    SUBSTITUTE: {
      cat: 'text',
      desc: 'استبدال نص بنص آخر (الكل أو تكرار محدد)',
      jsEquiv: '_substitute(str, old, new, n?)',
      minArgs: 3,
      maxArgs: 4,
      usesHelpers: ['_substitute'],
      generator: (args) => {
        const [str, oldText, newText, instance] = args;
        return `_substitute(${str}, ${oldText}, ${newText}, ${instance !== undefined ? instance : 'undefined'})`;
      }
    },

    // ===== العد =====
    COUNT: {
      cat: 'count',
      desc: 'عدّ الأرقام فقط',
      jsEquiv: 'arr.filter(isNumber).length',
      minArgs: 1,
      maxArgs: Infinity,
      usesHelpers: ['_nums'],
      generator: (args) => `_nums([${args.join(', ')}]).length`
    },
    COUNTA: {
      cat: 'count',
      desc: 'عدّ الخلايا غير الفارغة',
      jsEquiv: 'arr.filter(notEmpty).length',
      minArgs: 1,
      maxArgs: Infinity,
      generator: (args) =>
        `[${args.join(', ')}].flat(Infinity).filter(v=>v!==null&&v!==undefined&&v!=='').length`
    },
    COUNTIF: {
      cat: 'count',
      desc: 'عدّ بشرط',
      jsEquiv: '_countif(range, criteria)',
      minArgs: 2,
      maxArgs: 2,
      usesHelpers: ['_countif'],
      generator: (args) => `_countif(${args[0]}, ${args[1]})`
    },
    COUNTIFS: {
      cat: 'count',
      desc: 'عدّ بشروط متعددة',
      jsEquiv: '_countifs(r1,c1,r2,c2,...)',
      minArgs: 2,
      maxArgs: Infinity,
      usesHelpers: ['_countifs'],
      generator: (args) => {
        if (args.length % 2 !== 0) throw new Error('COUNTIFS يحتاج أزواجاً من نطاق وشرط');
        return `_countifs(${args.join(', ')})`;
      }
    },

    // ===== البحث =====
    VLOOKUP: {
      cat: 'lookup',
      desc: 'البحث العمودي في جدول',
      jsEquiv: '_vlookup(val, table, col, exact)',
      minArgs: 3,
      maxArgs: 4,
      usesHelpers: ['_vlookup'],
      matrixArgs: [1],
      generator: (args, ctx) => {
        const [val, table, col, exact] = args;
        // الوسيط الرابع في Excel: TRUE/محذوف = تقريبي، FALSE/0 = تام
        const exactExpr =
          exact !== undefined ? ctx.once(exact, (e) => `(${e} === false || ${e} === 0)`) : 'false';
        return `_vlookup(${val}, ${table}, ${col}, ${exactExpr})`;
      }
    },
    HLOOKUP: {
      cat: 'lookup',
      desc: 'البحث الأفقي في جدول',
      jsEquiv: '_hlookup(val, table, row, exact)',
      minArgs: 3,
      maxArgs: 4,
      usesHelpers: ['_hlookup'],
      matrixArgs: [1],
      generator: (args, ctx) => {
        const [val, table, row, exact] = args;
        const exactExpr =
          exact !== undefined ? ctx.once(exact, (e) => `(${e} === false || ${e} === 0)`) : 'false';
        return `_hlookup(${val}, ${table}, ${row}, ${exactExpr})`;
      }
    },
    INDEX: {
      cat: 'lookup',
      desc: 'استرجاع قيمة من مصفوفة بإحداثيات',
      jsEquiv: '_index(arr, row, col)',
      minArgs: 2,
      maxArgs: 3,
      usesHelpers: ['_index'],
      matrixArgs: [0],
      generator: (args) => {
        const [arr, row, col] = args;
        return `_index(${arr}, ${row}, ${col !== undefined ? col : 'undefined'})`;
      }
    },
    MATCH: {
      cat: 'lookup',
      desc: 'البحث عن موضع قيمة في مصفوفة',
      jsEquiv: '_match(val, arr, type)',
      minArgs: 2,
      maxArgs: 3,
      usesHelpers: ['_match'],
      generator: (args) => {
        const [val, arr, type] = args;
        return `_match(${val}, ${arr}, ${type !== undefined ? type : '1'})`;
      }
    },

    // ===== التواريخ =====
    TODAY: {
      cat: 'date',
      desc: 'تاريخ اليوم (بدون وقت)',
      jsEquiv: 'new Date()',
      minArgs: 0,
      maxArgs: 0,
      generator: (args) => `(()=>{const d=new Date();d.setHours(0,0,0,0);return d;})()`
    },
    NOW: {
      cat: 'date',
      desc: 'التاريخ والوقت الحاليين',
      jsEquiv: 'new Date()',
      minArgs: 0,
      maxArgs: 0,
      generator: (args) => `new Date()`
    },
    YEAR: {
      cat: 'date',
      desc: 'السنة من تاريخ',
      jsEquiv: 'date.getFullYear()',
      minArgs: 1,
      maxArgs: 1,
      generator: (args, ctx) =>
        ctx.once(args[0], (d) => `(${d} instanceof Date ? ${d} : new Date(${d})).getFullYear()`)
    },
    MONTH: {
      cat: 'date',
      desc: 'الشهر من تاريخ (1-12)',
      jsEquiv: 'date.getMonth() + 1',
      minArgs: 1,
      maxArgs: 1,
      generator: (args, ctx) =>
        ctx.once(args[0], (d) => `((${d} instanceof Date ? ${d} : new Date(${d})).getMonth() + 1)`)
    },
    DAY: {
      cat: 'date',
      desc: 'اليوم من تاريخ (1-31)',
      jsEquiv: 'date.getDate()',
      minArgs: 1,
      maxArgs: 1,
      generator: (args, ctx) =>
        ctx.once(args[0], (d) => `(${d} instanceof Date ? ${d} : new Date(${d})).getDate()`)
    },
    DATE: {
      cat: 'date',
      desc: 'إنشاء تاريخ من سنة وشهر ويوم',
      jsEquiv: 'new Date(y, m-1, d)',
      minArgs: 3,
      maxArgs: 3,
      generator: (args) => {
        const [y, m, d] = args;
        return `new Date(${y}, (${m}) - 1, ${d})`;
      }
    },
    EDATE: {
      cat: 'date',
      desc: 'إضافة شهور لتاريخ',
      jsEquiv: '_edate(date, months)',
      minArgs: 2,
      maxArgs: 2,
      usesHelpers: ['_edate'],
      generator: (args) => `_edate(${args[0]}, ${args[1]})`
    },
    DATEDIF: {
      cat: 'date',
      desc: 'الفرق بين تاريخين (Y/M/D/YM/YD/MD)',
      jsEquiv: '_datedif(start, end, unit)',
      minArgs: 3,
      maxArgs: 3,
      usesHelpers: ['_datedif'],
      generator: (args) => `_datedif(${args[0]}, ${args[1]}, ${args[2]})`
    },

    // ===== الفحص =====
    ISBLANK: {
      cat: 'check',
      desc: 'فحص هل الخلية فارغة',
      jsEquiv: 'v == null || v === ""',
      minArgs: 1,
      maxArgs: 1,
      generator: (args, ctx) =>
        ctx.once(args[0], (v) => `(${v} === null || ${v} === undefined || ${v} === '')`)
    },
    ISNUMBER: {
      cat: 'check',
      desc: 'فحص هل القيمة رقم',
      jsEquiv: 'typeof v === "number"',
      minArgs: 1,
      maxArgs: 1,
      generator: (args, ctx) =>
        ctx.once(args[0], (v) => `(typeof ${v} === 'number' && !isNaN(${v}))`)
    },
    ISTEXT: {
      cat: 'check',
      desc: 'فحص هل القيمة نص',
      jsEquiv: 'typeof v === "string"',
      minArgs: 1,
      maxArgs: 1,
      generator: (args) => `(typeof ${args[0]} === 'string')`
    },
    ISERROR: {
      cat: 'check',
      desc: 'فحص هل القيمة خطأ',
      jsEquiv: '_isError(v)',
      minArgs: 1,
      maxArgs: 1,
      usesHelpers: ['_isError'],
      generator: (args) => `_isError(${args[0]})`
    }
  };

  global.FUNCTIONS = FUNCTIONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { FUNCTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
