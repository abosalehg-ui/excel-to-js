/* ============================================================
   functions.js — قاموس الدوال المدعومة (44 دالة في V2)
   ------------------------------------------------------------
   كل دالة: { cat, desc, jsEquiv, generator, usesHelpers?, matrixArgs? }
     - usesHelpers: قائمة helpers يحتاجها هذا التوليد
     - matrixArgs:  أرقام الوسائط اللي لازم تتولّد كـ 2D matrix
                    (مثلاً VLOOKUP يبغى الجدول كـ matrix لا flat)
   ============================================================ */
const FUNCTIONS = {
  // ===== المنطقية =====
  IF: {
    cat: 'logic', desc: 'شرط: ترجع القيمة الأولى لو الشرط صحيح، وإلا الثانية',
    jsEquiv: 'cond ? a : b',
    generator: (args) => {
      if (args.length < 2) throw new Error('IF يحتاج شرطاً وقيمة على الأقل');
      const [cond, a, b] = args;
      return `(${cond} ? ${a} : ${b !== undefined ? b : 'false'})`;
    }
  },
  AND: {
    cat: 'logic', desc: 'يرجع true لو كل الشروط صحيحة',
    jsEquiv: 'a && b && ...',
    generator: (args) => `(${args.join(' && ')})`
  },
  OR: {
    cat: 'logic', desc: 'يرجع true لو أحد الشروط صحيح',
    jsEquiv: 'a || b || ...',
    generator: (args) => `(${args.join(' || ')})`
  },
  NOT: {
    cat: 'logic', desc: 'يعكس قيمة منطقية',
    jsEquiv: '!a',
    generator: (args) => `(!${args[0]})`
  },
  IFERROR: {
    cat: 'logic', desc: 'يرجع قيمة بديلة لو حصل خطأ',
    jsEquiv: 'try { a } catch { b }',
    usesHelpers: ['_isError'],
    generator: (args) => {
      const [val, fallback] = args;
      return `((()=>{try{const _v=${val};return _isError(_v)?${fallback}:_v;}catch(e){return ${fallback};}})())`;
    }
  },

  // ===== الرياضية =====
  SUM: {
    cat: 'math', desc: 'مجموع الأرقام',
    jsEquiv: 'arr.reduce((a,b)=>a+b,0)',
    generator: (args) => `[${args.join(', ')}].flat(Infinity).reduce((a,b)=>a+(Number(b)||0),0)`
  },
  AVERAGE: {
    cat: 'math', desc: 'المتوسط الحسابي',
    jsEquiv: 'sum / count',
    generator: (args) => `(()=>{const _a=[${args.join(', ')}].flat(Infinity).filter(v=>typeof v==='number'&&!isNaN(v));return _a.length?_a.reduce((a,b)=>a+b,0)/_a.length:0;})()`
  },
  MIN: {
    cat: 'math', desc: 'أصغر قيمة',
    jsEquiv: 'Math.min(...arr)',
    generator: (args) => `Math.min(...[${args.join(', ')}].flat(Infinity).filter(v=>typeof v==='number'))`
  },
  MAX: {
    cat: 'math', desc: 'أكبر قيمة',
    jsEquiv: 'Math.max(...arr)',
    generator: (args) => `Math.max(...[${args.join(', ')}].flat(Infinity).filter(v=>typeof v==='number'))`
  },
  ROUND: {
    cat: 'math', desc: 'تقريب رقم لعدد محدد من المنازل',
    jsEquiv: 'Math.round(n * 10^d) / 10^d',
    generator: (args) => {
      const [num, digits] = args;
      const d = digits !== undefined ? digits : '0';
      return `(Math.round(${num} * Math.pow(10, ${d})) / Math.pow(10, ${d}))`;
    }
  },
  ABS: {
    cat: 'math', desc: 'القيمة المطلقة',
    jsEquiv: 'Math.abs(n)',
    generator: (args) => `Math.abs(${args[0]})`
  },
  POWER: {
    cat: 'math', desc: 'رفع رقم لقوة',
    jsEquiv: 'Math.pow(a, b)',
    generator: (args) => {
      if (args.length < 2) throw new Error('POWER يحتاج عددين');
      return `Math.pow(${args[0]}, ${args[1]})`;
    }
  },
  SQRT: {
    cat: 'math', desc: 'الجذر التربيعي',
    jsEquiv: 'Math.sqrt(n)',
    generator: (args) => `Math.sqrt(${args[0]})`
  },
  MOD: {
    cat: 'math', desc: 'باقي القسمة',
    jsEquiv: 'a % b',
    generator: (args) => {
      if (args.length < 2) throw new Error('MOD يحتاج عددين');
      return `((${args[0]}) % (${args[1]}))`;
    }
  },

  // ===== النصية =====
  CONCATENATE: {
    cat: 'text', desc: 'دمج عدة نصوص',
    jsEquiv: 'a + b + ...',
    generator: (args) => `[${args.join(', ')}].map(String).join('')`
  },
  LEFT: {
    cat: 'text', desc: 'يأخذ أحرف من اليسار',
    jsEquiv: 'str.slice(0, n)',
    generator: (args) => {
      const [str, n] = args;
      return `String(${str}).slice(0, ${n !== undefined ? n : '1'})`;
    }
  },
  RIGHT: {
    cat: 'text', desc: 'يأخذ أحرف من اليمين',
    jsEquiv: 'str.slice(-n)',
    generator: (args) => {
      const [str, n] = args;
      const len = n !== undefined ? n : '1';
      return `String(${str}).slice(-(${len}))`;
    }
  },
  MID: {
    cat: 'text', desc: 'استخراج جزء من نص',
    jsEquiv: 'str.substr(start-1, len)',
    generator: (args) => {
      if (args.length < 3) throw new Error('MID يحتاج 3 وسائط');
      const [str, start, len] = args;
      return `String(${str}).substr((${start}) - 1, ${len})`;
    }
  },
  LEN: {
    cat: 'text', desc: 'طول النص',
    jsEquiv: 'str.length',
    generator: (args) => `String(${args[0]}).length`
  },
  TRIM: {
    cat: 'text', desc: 'إزالة المسافات الزائدة',
    jsEquiv: 'str.trim()',
    generator: (args) => `String(${args[0]}).trim()`
  },
  UPPER: {
    cat: 'text', desc: 'تحويل لأحرف كبيرة',
    jsEquiv: 'str.toUpperCase()',
    generator: (args) => `String(${args[0]}).toUpperCase()`
  },
  LOWER: {
    cat: 'text', desc: 'تحويل لأحرف صغيرة',
    jsEquiv: 'str.toLowerCase()',
    generator: (args) => `String(${args[0]}).toLowerCase()`
  },
  REPLACE: {
    cat: 'text', desc: 'استبدال جزء من نص بالموقع',
    jsEquiv: 'str.slice + new + str.slice',
    generator: (args) => {
      if (args.length < 4) throw new Error('REPLACE يحتاج 4 وسائط');
      const [str, start, num, newStr] = args;
      return `(()=>{const _s=String(${str});return _s.slice(0,(${start})-1)+String(${newStr})+_s.slice((${start})-1+(${num}));})()`;
    }
  },
  SUBSTITUTE: {
    cat: 'text', desc: 'استبدال نص بنص آخر',
    jsEquiv: 'str.replaceAll(old, new)',
    generator: (args) => {
      if (args.length < 3) throw new Error('SUBSTITUTE يحتاج 3 وسائط على الأقل');
      const [str, oldText, newText, instance] = args;
      if (instance === undefined) {
        return `String(${str}).split(String(${oldText})).join(String(${newText}))`;
      }
      return `(()=>{const _s=String(${str}),_o=String(${oldText}),_n=String(${newText}),_i=${instance};let _c=0,_p=0,_idx;while((_idx=_s.indexOf(_o,_p))!==-1){_c++;if(_c===_i){return _s.slice(0,_idx)+_n+_s.slice(_idx+_o.length);}_p=_idx+_o.length;}return _s;})()`;
      }
  },

  // ===== العد =====
  COUNT: {
    cat: 'count', desc: 'عدّ الأرقام فقط',
    jsEquiv: 'arr.filter(isNumber).length',
    generator: (args) => `[${args.join(', ')}].flat(Infinity).filter(v=>typeof v==='number'&&!isNaN(v)).length`
  },
  COUNTA: {
    cat: 'count', desc: 'عدّ الخلايا غير الفارغة',
    jsEquiv: 'arr.filter(notEmpty).length',
    generator: (args) => `[${args.join(', ')}].flat(Infinity).filter(v=>v!==null&&v!==undefined&&v!=='').length`
  },
  COUNTIF: {
    cat: 'count', desc: 'عدّ بشرط',
    jsEquiv: '_countif(range, criteria)',
    usesHelpers: ['_countif'],
    generator: (args) => {
      if (args.length < 2) throw new Error('COUNTIF يحتاج نطاقاً وشرطاً');
      return `_countif(${args[0]}, ${args[1]})`;
    }
  },
  COUNTIFS: {
    cat: 'count', desc: 'عدّ بشروط متعددة',
    jsEquiv: '_countifs(r1,c1,r2,c2,...)',
    usesHelpers: ['_countifs'],
    generator: (args) => {
      if (args.length < 2 || args.length % 2 !== 0) throw new Error('COUNTIFS يحتاج أزواجاً من نطاق وشرط');
      return `_countifs(${args.join(', ')})`;
    }
  },

  // ===== البحث =====
  VLOOKUP: {
    cat: 'lookup', desc: 'البحث العمودي في جدول',
    jsEquiv: '_vlookup(val, table, col, exact)',
    usesHelpers: ['_vlookup'],
    matrixArgs: [1],
    generator: (args) => {
      if (args.length < 3) throw new Error('VLOOKUP يحتاج 3 وسائط على الأقل');
      const [val, table, col, exact] = args;
      const exactExpr = exact !== undefined ? `(${exact} === false || ${exact} === 0)` : 'true';
      return `_vlookup(${val}, ${table}, ${col}, ${exactExpr})`;
    }
  },
  HLOOKUP: {
    cat: 'lookup', desc: 'البحث الأفقي في جدول',
    jsEquiv: '_hlookup(val, table, row, exact)',
    usesHelpers: ['_hlookup'],
    matrixArgs: [1],
    generator: (args) => {
      if (args.length < 3) throw new Error('HLOOKUP يحتاج 3 وسائط على الأقل');
      const [val, table, row, exact] = args;
      const exactExpr = exact !== undefined ? `(${exact} === false || ${exact} === 0)` : 'true';
      return `_hlookup(${val}, ${table}, ${row}, ${exactExpr})`;
    }
  },
  INDEX: {
    cat: 'lookup', desc: 'استرجاع قيمة من مصفوفة بإحداثيات',
    jsEquiv: '_index(arr, row, col)',
    usesHelpers: ['_index'],
    matrixArgs: [0],
    generator: (args) => {
      if (args.length < 2) throw new Error('INDEX يحتاج وسيطين على الأقل');
      const [arr, row, col] = args;
      return `_index(${arr}, ${row}, ${col !== undefined ? col : 'undefined'})`;
    }
  },
  MATCH: {
    cat: 'lookup', desc: 'البحث عن موضع قيمة في مصفوفة',
    jsEquiv: '_match(val, arr, type)',
    usesHelpers: ['_match'],
    generator: (args) => {
      if (args.length < 2) throw new Error('MATCH يحتاج وسيطين على الأقل');
      const [val, arr, type] = args;
      return `_match(${val}, ${arr}, ${type !== undefined ? type : '1'})`;
    }
  },

  // ===== التواريخ =====
  TODAY: {
    cat: 'date', desc: 'تاريخ اليوم (بدون وقت)',
    jsEquiv: 'new Date()',
    generator: (args) => `(()=>{const d=new Date();d.setHours(0,0,0,0);return d;})()`
  },
  NOW: {
    cat: 'date', desc: 'التاريخ والوقت الحاليين',
    jsEquiv: 'new Date()',
    generator: (args) => `new Date()`
  },
  YEAR: {
    cat: 'date', desc: 'السنة من تاريخ',
    jsEquiv: 'date.getFullYear()',
    generator: (args) => `(${args[0]} instanceof Date ? ${args[0]} : new Date(${args[0]})).getFullYear()`
  },
  MONTH: {
    cat: 'date', desc: 'الشهر من تاريخ (1-12)',
    jsEquiv: 'date.getMonth() + 1',
    generator: (args) => `((${args[0]} instanceof Date ? ${args[0]} : new Date(${args[0]})).getMonth() + 1)`
  },
  DAY: {
    cat: 'date', desc: 'اليوم من تاريخ (1-31)',
    jsEquiv: 'date.getDate()',
    generator: (args) => `(${args[0]} instanceof Date ? ${args[0]} : new Date(${args[0]})).getDate()`
  },
  DATE: {
    cat: 'date', desc: 'إنشاء تاريخ من سنة وشهر ويوم',
    jsEquiv: 'new Date(y, m-1, d)',
    generator: (args) => {
      if (args.length < 3) throw new Error('DATE يحتاج 3 وسائط: سنة، شهر، يوم');
      const [y, m, d] = args;
      return `new Date(${y}, (${m}) - 1, ${d})`;
    }
  },
  EDATE: {
    cat: 'date', desc: 'إضافة شهور لتاريخ',
    jsEquiv: '_edate(date, months)',
    usesHelpers: ['_edate'],
    generator: (args) => {
      if (args.length < 2) throw new Error('EDATE يحتاج وسيطين: تاريخ وعدد شهور');
      return `_edate(${args[0]}, ${args[1]})`;
    }
  },
  DATEDIF: {
    cat: 'date', desc: 'الفرق بين تاريخين (Y/M/D/YM/YD/MD)',
    jsEquiv: '_datedif(start, end, unit)',
    usesHelpers: ['_datedif'],
    generator: (args) => {
      if (args.length < 3) throw new Error('DATEDIF يحتاج 3 وسائط: بداية، نهاية، وحدة');
      return `_datedif(${args[0]}, ${args[1]}, ${args[2]})`;
    }
  },

  // ===== الفحص =====
  ISBLANK: {
    cat: 'check', desc: 'فحص هل الخلية فارغة',
    jsEquiv: 'v == null || v === ""',
    generator: (args) => `(${args[0]} === null || ${args[0]} === undefined || ${args[0]} === '')`
  },
  ISNUMBER: {
    cat: 'check', desc: 'فحص هل القيمة رقم',
    jsEquiv: 'typeof v === "number"',
    generator: (args) => `(typeof ${args[0]} === 'number' && !isNaN(${args[0]}))`
  },
  ISTEXT: {
    cat: 'check', desc: 'فحص هل القيمة نص',
    jsEquiv: 'typeof v === "string"',
    generator: (args) => `(typeof ${args[0]} === 'string')`
  },
  ISERROR: {
    cat: 'check', desc: 'فحص هل القيمة خطأ',
    jsEquiv: '_isError(v)',
    usesHelpers: ['_isError'],
    generator: (args) => `_isError(${args[0]})`
  }
};
