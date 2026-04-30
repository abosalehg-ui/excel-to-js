/* ============================================================
   1) قاموس الـ Helpers
   ============================================================ */
const HELPERS = {
  // _matchCriteria: يحاكي شروط COUNTIF مثل ">5", "<>0", "محمد"
  _matchCriteria: {
    code: `function _matchCriteria(value, criteria) {
  if (typeof criteria === 'number') return value === criteria;
  if (typeof criteria !== 'string') return value === criteria;
  // فحص العوامل في بداية النص: >=, <=, <>, >, <, =
  const m = criteria.match(/^(>=|<=|<>|>|<|=)(.*)$/);
  if (m) {
    const op = m[1];
    let val = m[2].trim();
    const num = Number(val);
    if (!isNaN(num) && val !== '') val = num;
    switch (op) {
      case '>':  return value > val;
      case '<':  return value < val;
      case '>=': return value >= val;
      case '<=': return value <= val;
      case '<>': return value !== val;
      case '=':  return value === val;
    }
  }
  return value === criteria;
}`
  },

  // _vlookup: البحث العمودي
  _vlookup: {
    code: `function _vlookup(lookupValue, table, colIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  if (exactMatch === undefined) exactMatch = false;
  for (const row of table) {
    if (!Array.isArray(row) || row.length === 0) continue;
    if (row[0] === lookupValue) return row[colIndex - 1];
  }
  return '#N/A';
}`
  },

  // _hlookup: البحث الأفقي
  _hlookup: {
    code: `function _hlookup(lookupValue, table, rowIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  const firstRow = table[0];
  if (!Array.isArray(firstRow)) return '#N/A';
  for (let c = 0; c < firstRow.length; c++) {
    if (firstRow[c] === lookupValue) {
      const targetRow = table[rowIndex - 1];
      return targetRow ? targetRow[c] : '#N/A';
    }
  }
  return '#N/A';
}`
  },

  // _index: استرجاع قيمة بإحداثيات
  _index: {
    code: `function _index(arr, rowNum, colNum) {
  if (!Array.isArray(arr)) return '#REF!';
  // 2D matrix
  if (Array.isArray(arr[0])) {
    const row = arr[rowNum - 1];
    if (!row) return '#REF!';
    if (colNum === undefined || colNum === 0) {
      // عمود واحد فقط؟ نرجع القيمة المفردة بدل الصف
      if (row.length === 1) return row[0];
      return row;
    }
    return row[colNum - 1];
  }
  // 1D
  return arr[rowNum - 1];
}`
  },

  // _match: البحث عن موضع قيمة
  _match: {
    code: `function _match(lookupValue, arr, matchType) {
  if (matchType === undefined) matchType = 1;
  arr = Array.isArray(arr) ? arr.flat(Infinity) : [arr];
  if (matchType === 0) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === lookupValue) return i + 1;
    }
    return '#N/A';
  }
  let lastIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (matchType === 1 && arr[i] <= lookupValue) lastIdx = i;
    if (matchType === -1 && arr[i] >= lookupValue) lastIdx = i;
  }
  return lastIdx === -1 ? '#N/A' : lastIdx + 1;
}`
  },

  // _countif: عدّ بشرط
  _countif: {
    deps: ['_matchCriteria'],
    code: `function _countif(range, criteria) {
  const arr = Array.isArray(range) ? range.flat(Infinity) : [range];
  return arr.filter(v => _matchCriteria(v, criteria)).length;
}`
  },

  // _countifs: عدّ بشروط متعددة
  _countifs: {
    deps: ['_matchCriteria'],
    code: `function _countifs(...args) {
  if (args.length < 2 || args.length % 2 !== 0) return 0;
  const ranges = [], criterias = [];
  for (let i = 0; i < args.length; i += 2) {
    const r = Array.isArray(args[i]) ? args[i].flat(Infinity) : [args[i]];
    ranges.push(r);
    criterias.push(args[i + 1]);
  }
  const len = ranges[0].length;
  let count = 0;
  for (let i = 0; i < len; i++) {
    let matchAll = true;
    for (let j = 0; j < ranges.length; j++) {
      if (!_matchCriteria(ranges[j][i], criterias[j])) { matchAll = false; break; }
    }
    if (matchAll) count++;
  }
  return count;
}`
  },

  // _datedif: الفرق بين تاريخين
  _datedif: {
    code: `function _datedif(start, end, unit) {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const u = String(unit).toUpperCase();
  const ms = 1000 * 60 * 60 * 24;
  switch (u) {
    case 'D': return Math.floor((e - s) / ms);
    case 'Y': {
      let y = e.getFullYear() - s.getFullYear();
      if (e.getMonth() < s.getMonth() ||
         (e.getMonth() === s.getMonth() && e.getDate() < s.getDate())) y--;
      return y;
    }
    case 'M': {
      let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
      if (e.getDate() < s.getDate()) m--;
      return m;
    }
    case 'YM': {
      let m = e.getMonth() - s.getMonth();
      if (e.getDate() < s.getDate()) m--;
      if (m < 0) m += 12;
      return m;
    }
    case 'YD': {
      const sAdj = new Date(e.getFullYear(), s.getMonth(), s.getDate());
      if (sAdj > e) sAdj.setFullYear(sAdj.getFullYear() - 1);
      return Math.floor((e - sAdj) / ms);
    }
    case 'MD': {
      let d = e.getDate() - s.getDate();
      if (d < 0) {
        const prevMonth = new Date(e.getFullYear(), e.getMonth(), 0);
        d += prevMonth.getDate();
      }
      return d;
    }
    default: return '#NUM!';
  }
}`
  },

  // _edate: إضافة شهور لتاريخ
  _edate: {
    code: `function _edate(start, months) {
  const d = start instanceof Date ? new Date(start.getTime()) : new Date(start);
  const targetMonth = d.getMonth() + Number(months);
  const result = new Date(d.getFullYear(), targetMonth, d.getDate());
  // معالجة نهاية الشهر (مثلاً 31 يناير + شهر = 28/29 فبراير)
  if (result.getDate() !== d.getDate()) result.setDate(0);
  return result;
}`
  },

  // _isError: فحص قيم الخطأ
  _isError: {
    code: `function _isError(value) {
  const errStrings = ['#N/A', '#REF!', '#NUM!', '#VALUE!', '#DIV/0!', '#NAME?'];
  if (typeof value === 'string' && errStrings.includes(value)) return true;
  if (value instanceof Error) return true;
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return true;
  return false;
}`
  }
};

/* ============================================================
   2) قاموس الدوال (39 دالة)
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
      // نفحص الخطأ بطريقتين: try/catch (للأخطاء الفعلية) + _isError (لقيم #N/A النصية)
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
        // استبدال الكل (split + join لتفادي مشاكل regex مع الرموز الخاصة)
        return `String(${str}).split(String(${oldText})).join(String(${newText}))`;
      }
      // استبدال نسخة محددة (instance رقم 1-based)
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
    matrixArgs: [1], // الوسيط الثاني (table) لازم يكون 2D matrix
    generator: (args) => {
      if (args.length < 3) throw new Error('VLOOKUP يحتاج 3 وسائط على الأقل');
      const [val, table, col, exact] = args;
      // FALSE في Excel = exact match
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
      // الشهر في JS: 0-based (يناير = 0)
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

/* ============================================================
   3) Tokenizer
   ============================================================ */
function tokenize(input) {
  const tokens = [];
  let pos = 0;
  let src = input;
  let offset = 0;
  if (src.startsWith('=')) { offset = 1; src = src.slice(1); }

  const patterns = [
    [/^\s+/,                                  null],
    [/^"((?:[^"\\]|\\.|"")*)"/,               'STRING'],
    [/^(TRUE|FALSE)\b/i,                      'BOOLEAN'],
    [/^[A-Za-z_][A-Za-z0-9_\.]*(?=\s*\()/,    'FUNCTION'],
    [/^\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+/, 'RANGE'],
    // عمود كامل (B:C) - نلتقطه علشان نرفضه برسالة واضحة
    [/^\$?[A-Za-z]+:\$?[A-Za-z]+(?![A-Za-z0-9])/, 'FULL_COLUMN'],
    [/^\$?[A-Za-z]+\$?\d+/,                   'CELL_REF'],
    [/^\d+\.?\d*/,                            'NUMBER'],
    [/^\.\d+/,                                'NUMBER'],
    [/^(<=|>=|<>|=|<|>)/,                     'OPERATOR_CMP'],
    [/^[+\-*/%^&]/,                           'OPERATOR'],
    [/^[,;]/,                                 'COMMA'],
    [/^\(/,                                   'LPAREN'],
    [/^\)/,                                   'RPAREN']
  ];

  while (pos < src.length) {
    let matched = false;
    for (const [regex, type] of patterns) {
      const m = src.slice(pos).match(regex);
      if (!m) continue;

      const start = pos + offset;
      const end = pos + m[0].length + offset;

      // نرفض الأعمدة الكاملة (B:C) فوراً مع رسالة واضحة
      if (type === 'FULL_COLUMN') {
        const parts = m[0].split(':');
        const err = new Error(`النطاقات بدون أرقام صفوف غير مدعومة: "${m[0]}". استخدم شكل مثل "${parts[0]}1:${parts[1]}100" بدلاً منها.`);
        err.start = start; err.end = end;
        throw err;
      }

      if (type !== null) {
        tokens.push({
          type,
          value: type === 'STRING' ? m[1] : m[0],
          raw: m[0],
          start, end
        });
      }
      pos += m[0].length;
      matched = true;
      break;
    }

    if (!matched) {
      const err = new Error(`رمز غير متوقع: "${src[pos]}"`);
      err.start = pos + offset;
      err.end = pos + offset + 1;
      throw err;
    }
  }
  return tokens;
}

/* ============================================================
   4) Parser - يبني AST بـ Recursive Descent
   ============================================================ */
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const eat = (expectedType) => {
    const t = tokens[i];
    if (!t) {
      const err = new Error('انتهت الصيغة فجأة - فيه ناقص');
      err.start = tokens[tokens.length - 1]?.end ?? 0;
      err.end = err.start + 1;
      throw err;
    }
    if (expectedType && t.type !== expectedType) {
      const err = new Error(`متوقع ${expectedType} لكن وُجد ${t.type} ("${t.raw}")`);
      err.start = t.start; err.end = t.end;
      throw err;
    }
    i++;
    return t;
  };

  function parseComparison() {
    let left = parseConcat();
    while (peek() && peek().type === 'OPERATOR_CMP') {
      const op = eat().value;
      const right = parseConcat();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }
  function parseConcat() {
    let left = parseAddSub();
    while (peek() && peek().type === 'OPERATOR' && peek().value === '&') {
      eat();
      const right = parseAddSub();
      left = { type: 'Binary', op: '&', left, right };
    }
    return left;
  }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && peek().type === 'OPERATOR' && (peek().value === '+' || peek().value === '-')) {
      const op = eat().value;
      const right = parseMulDiv();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }
  function parseMulDiv() {
    let left = parsePower();
    while (peek() && peek().type === 'OPERATOR' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = eat().value;
      const right = parsePower();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }
  function parsePower() {
    let left = parseUnary();
    while (peek() && peek().type === 'OPERATOR' && peek().value === '^') {
      eat();
      const right = parseUnary();
      left = { type: 'Binary', op: '^', left, right };
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().type === 'OPERATOR' && (peek().value === '-' || peek().value === '+')) {
      const op = eat().value;
      const arg = parseUnary();
      return { type: 'Unary', op, arg };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) {
      const err = new Error('متوقع تعبير لكن انتهت الصيغة');
      err.start = tokens[tokens.length - 1]?.end ?? 0;
      err.end = err.start + 1;
      throw err;
    }

    if (t.type === 'NUMBER')  { eat(); return { type: 'Number', value: parseFloat(t.value) }; }
    if (t.type === 'STRING')  {
      eat();
      const unescaped = t.value.replace(/""/g, '"');
      return { type: 'String', value: unescaped };
    }
    if (t.type === 'BOOLEAN') { eat(); return { type: 'Boolean', value: t.value.toUpperCase() === 'TRUE' }; }
    if (t.type === 'CELL_REF'){ eat(); return { type: 'CellRef', name: t.value.replace(/\$/g, '') }; }
    if (t.type === 'RANGE')   {
      eat();
      const [s, e] = t.value.replace(/\$/g, '').split(':');
      return { type: 'Range', start: s, end: e };
    }
    if (t.type === 'FUNCTION') {
      const fnTok = eat();
      eat('LPAREN');
      const args = [];
      if (peek() && peek().type !== 'RPAREN') {
        args.push(parseComparison());
        while (peek() && peek().type === 'COMMA') {
          eat();
          args.push(parseComparison());
        }
      }
      const closing = eat('RPAREN');
      return {
        type: 'Call',
        name: fnTok.value.toUpperCase(),
        args, start: fnTok.start, end: closing.end
      };
    }
    if (t.type === 'LPAREN') {
      eat();
      const expr = parseComparison();
      eat('RPAREN');
      return expr;
    }

    const err = new Error(`رمز غير متوقع: "${t.raw}"`);
    err.start = t.start; err.end = t.end;
    throw err;
  }

  const ast = parseComparison();
  if (i < tokens.length) {
    const t = tokens[i];
    const err = new Error(`رمز إضافي غير متوقع: "${t.raw}"`);
    err.start = t.start; err.end = t.end;
    throw err;
  }
  return ast;
}

/* ============================================================
   5) Code Generator
   ============================================================ */
function generate(ast) {
  const usedCells = new Set();
  const usedHelpers = new Set();

  const cellVar = (name) => {
    const v = name.toLowerCase();
    usedCells.add(v);
    return v;
  };

  const colToNum = (c) => {
    let n = 0;
    for (const ch of c.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  };
  const numToCol = (n) => {
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  // فك نطاق إلى مصفوفة 2D من أسماء الخلايا
  function expandRangeToMatrix(start, end) {
    const m1 = start.match(/^([A-Za-z]+)(\d+)$/);
    const m2 = end.match(/^([A-Za-z]+)(\d+)$/);
    if (!m1 || !m2) throw new Error(`نطاق غير صالح: ${start}:${end}`);

    const c1 = colToNum(m1[1]), c2 = colToNum(m2[1]);
    const r1 = parseInt(m1[2]), r2 = parseInt(m2[2]);
    const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
    const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
    const rows = rMax - rMin + 1;
    const cols = cMax - cMin + 1;

    if (rows * cols > 1000) {
      throw new Error(`النطاق كبير جداً (${rows * cols} خلية). الحد الأقصى 1000.`);
    }

    const matrix = [];
    for (let r = rMin; r <= rMax; r++) {
      const row = [];
      for (let c = cMin; c <= cMax; c++) {
        row.push(cellVar(numToCol(c) + r));
      }
      matrix.push(row);
    }
    return { matrix, rows, cols };
  }

  const opMap = {
    '=':  '===', '<>': '!==',
    '<':  '<', '>': '>', '<=': '<=', '>=': '>=',
    '+':  '+', '-': '-', '*': '*', '/': '/', '%': '%'
  };

  function registerHelper(name) {
    if (usedHelpers.has(name)) return;
    usedHelpers.add(name);
    const h = HELPERS[name];
    if (h && h.deps) {
      for (const d of h.deps) registerHelper(d);
    }
  }

  // gen: opts.needsMatrix يخبر إذا الوسيط الحالي يحتاج 2D matrix
  function gen(node, opts = {}) {
    const needsMatrix = opts.needsMatrix === true;

    switch (node.type) {
      case 'Number':  return String(node.value);
      case 'String':  return JSON.stringify(node.value);
      case 'Boolean': return node.value ? 'true' : 'false';
      case 'CellRef': return cellVar(node.name);

      case 'Range': {
        const { matrix } = expandRangeToMatrix(node.start, node.end);
        if (needsMatrix) {
          // 2D: [[a1,b1],[a2,b2],...] للـ VLOOKUP/INDEX
          const rowStrs = matrix.map(row => `[${row.join(', ')}]`);
          return `[${rowStrs.join(', ')}]`;
        }
        // 1D مسطّح للـ SUM/AVERAGE/COUNT/إلخ
        return `[${matrix.flat().join(', ')}]`;
      }

      case 'Unary':
        return `(${node.op}${gen(node.arg)})`;

      case 'Binary': {
        const L = gen(node.left);
        const R = gen(node.right);
        if (node.op === '&') return `(String(${L}) + String(${R}))`;
        if (node.op === '^') return `Math.pow(${L}, ${R})`;
        return `(${L} ${opMap[node.op]} ${R})`;
      }

      case 'Call': {
        const fn = FUNCTIONS[node.name];
        if (!fn) {
          const err = new Error(`الدالة "${node.name}" غير مدعومة في النسخة الحالية`);
          err.start = node.start; err.end = node.end;
          err.unsupported = node.name;
          throw err;
        }

        // سجل الـ helpers (مع التبعيات)
        if (fn.usesHelpers) {
          for (const h of fn.usesHelpers) registerHelper(h);
        }

        // ولّد الوسائط مع مراعاة الحاجة لـ 2D
        const matrixArgs = fn.matrixArgs || [];
        const compiledArgs = node.args.map((a, idx) =>
          gen(a, { needsMatrix: matrixArgs.includes(idx) })
        );

        try {
          return fn.generator(compiledArgs);
        } catch (e) {
          const err = new Error(`خطأ في دالة ${node.name}: ${e.message}`);
          err.start = node.start; err.end = node.end;
          throw err;
        }
      }

      default:
        throw new Error(`عقدة AST غير معروفة: ${node.type}`);
    }
  }

  const expr = gen(ast);

  // ترتيب topological للـ helpers (التبعيات تجي أولاً)
  const helperOrder = [];
  const visited = new Set();
  function topoVisit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const h = HELPERS[name];
    if (h && h.deps) for (const d of h.deps) topoVisit(d);
    helperOrder.push(name);
  }
  for (const h of usedHelpers) topoVisit(h);

  return {
    expr,
    usedCells: [...usedCells].sort(naturalSort),
    usedHelpers: helperOrder
  };
}

// ترتيب طبيعي للخلايا: a1, a2, ..., a10 (ليس a1, a10, a2)
function naturalSort(a, b) {
  const re = /([a-z]+)(\d+)/i;
  const ma = a.match(re), mb = b.match(re);
  if (ma && mb) {
    if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
    return parseInt(ma[2]) - parseInt(mb[2]);
  }
  return a.localeCompare(b);
}

/* ============================================================
   6) واجهة المحوّل الرئيسية
   ============================================================ */
function convertFormula(input) {
  if (!input || !input.trim()) {
    throw Object.assign(new Error('الصيغة فارغة'), { start: 0, end: 0 });
  }
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    throw Object.assign(new Error('لا توجد رموز قابلة للتحليل'), { start: 0, end: input.length });
  }
  const ast = parse(tokens);
  const { expr, usedCells, usedHelpers } = generate(ast);

  // بناء الكود النهائي
  const lines = [];
  if (usedHelpers.length > 0) {
    lines.push(`// ===== Helpers مساعدة =====`);
    for (const name of usedHelpers) {
      lines.push(HELPERS[name].code);
      lines.push('');
    }
    lines.push(`// ===== الدالة الرئيسية =====`);
  }
  const params = usedCells.length ? usedCells.join(', ') : '';
  lines.push(`// دالة محوّلة من صيغة Excel`);
  lines.push(`// المُدخلات المطلوبة: ${usedCells.length ? usedCells.join(', ') : '(لا شيء)'}`);
  lines.push(`function calculate(${params}) {`);
  lines.push(`  return ${expr};`);
  lines.push(`}`);

  return { code: lines.join('\n'), usedCells, usedHelpers };
}