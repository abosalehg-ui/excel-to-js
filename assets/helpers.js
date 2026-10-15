/* ============================================================
   helpers.js — قاموس الـ Helpers
   ------------------------------------------------------------
   كل helper يوصف بـ { code, deps? }. الـ deps لتعقّب الترتيب
   topological عند توليد الكود النهائي.
   ============================================================ */
(function (global) {
  const NS = (global.ExcelToJS = global.ExcelToJS || {});

  // العوامل الحسابية الثنائية تتشارك جسماً واحداً ولا تختلف إلا في
  // التعبير: الطرفان يمرّان على _num، وأول قيمة خطأ تمرّ كما هي.
  // التوليد من جدول يُبقي هذا العقد في موضع واحد بدل خمس نسخ متطابقة.
  const binaryArith = (name, expr) => ({
    deps: ['_num'],
    code: `function ${name}(a, b) {
  const x = _num(a), y = _num(b);
  if (typeof x === 'string') return x;
  if (typeof y === 'string') return y;
  return ${expr};
}`
  });

  const HELPERS = {
    // _str: تحويل نصي بدلالات Excel — الخلية الفارغة نص فارغ، والقيم
    // المنطقية بأحرف كبيرة كما يعرضها Excel ("TRUE" لا "true")
    _str: {
      code: `function _str(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}`
    },

    // _num: تطبيع رقمي بدلالات Excel — أساس العوامل والدوال الرياضية.
    // الفراغ صفر، وقيمة الخطأ (#N/A وغيرها) ترجع كما هي ليصل نوعها
    // لـIFERROR، وما لا يقبل التحويل رقماً يعطي #VALUE!
    _num: {
      deps: ['_isError'],
      code: `function _num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string' && _isError(v)) return v;
  const n = Number(v);
  return isNaN(n) ? '#VALUE!' : n;
}`
    },

    // القسمة على صفر تبقى Infinity (وNaN لـ0/0) — انحراف موثق مقصود
    // تلتقطه IFERROR/ISERROR
    _add: binaryArith('_add', 'x + y'),
    _sub: binaryArith('_sub', 'x - y'),
    _mul: binaryArith('_mul', 'x * y'),
    _div: binaryArith('_div', 'x / y'),
    _pow: binaryArith('_pow', 'Math.pow(x, y)'),

    _neg: {
      deps: ['_num'],
      code: `function _neg(a) {
  const x = _num(a);
  return typeof x === 'string' ? x : -x;
}`
    },

    _abs: {
      deps: ['_num'],
      code: `function _abs(a) {
  const x = _num(a);
  return typeof x === 'string' ? x : Math.abs(x);
}`
    },

    // الجذر لعدد سالب في Excel = #NUM! لا NaN
    _sqrt: {
      deps: ['_num'],
      code: `function _sqrt(a) {
  const x = _num(a);
  if (typeof x === 'string') return x;
  return x < 0 ? '#NUM!' : Math.sqrt(x);
}`
    },

    // _toDate: توحيد قبول التاريخ — Date كما هي. صيغة التاريخ-فقط
    // "YYYY-MM-DD" تُبنى يدوياً بالتوقيت المحلي: new Date يفسّرها منتصف
    // ليل UTC فتنزاح يوماً كاملاً في المناطق غرب غرينتش
    _toDate: {
      code: `function _toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = /^\\s*(\\d{4})-(\\d{2})-(\\d{2})\\s*$/.exec(v);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  return new Date(v);
}`
    },

    // _eq: مساواة بدلالات Excel. الخلية الفارغة تأخذ "صفر" نوع الطرف
    // الآخر (0 أو "" أو FALSE) — فـ=A1="" و=A1=0 على فراغ = TRUE.
    // النصوص غير حساسة لحالة الأحرف، والتواريخ تُقارن بقيمتها لا بمرجعها
    _eq: {
      code: `function _eq(a, b) {
  const blankAs = (o) => typeof o === 'number' ? 0 : typeof o === 'boolean' ? false : '';
  if (a === null || a === undefined) a = blankAs(b);
  if (b === null || b === undefined) b = blankAs(a);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}`
    },

    // _nums: يفرد المصفوفة ويُبقي الأرقام الصالحة فقط (أساس AVERAGE/MIN/MAX/COUNT)
    _nums: {
      code: `function _nums(arr) {
  return arr.flat(Infinity).filter(v => typeof v === 'number' && !isNaN(v));
}`
    },

    // _sum: أول قيمة خطأ في الوسائط ترجع كما هي (كما في Excel) بدل أن
    // تنقلب صفراً صامتاً، فتلتقطها IFERROR
    _sum: {
      deps: ['_isError'],
      code: `function _sum(arr) {
  let s = 0;
  for (const v of arr.flat(Infinity)) {
    if (_isError(v)) return v;
    s += Number(v) || 0;
  }
  return s;
}`
    },

    // _mod: باقي القسمة بدلالات Excel — إشارة الناتج تتبع المقسوم عليه
    // (‏JS: -3 % 2 = -1، بينما Excel: MOD(-3,2) = 1)
    _mod: {
      deps: ['_num'],
      code: `function _mod(a, b) {
  const x = _num(a), y = _num(b);
  if (typeof x === 'string') return x;
  if (typeof y === 'string') return y;
  if (y === 0) return '#DIV/0!';
  return ((x % y) + y) % y;
}`
    },

    // _round: تقريب بدلالات Excel — النصف يُقرَّب بعيداً عن الصفر
    // (‏Math.round(-2.5) = -2، بينما Excel: ROUND(-2.5,0) = -3)
    _round: {
      deps: ['_num'],
      code: `function _round(n, digits) {
  const x = _num(n), d = _num(digits);
  if (typeof x === 'string') return x;
  if (typeof d === 'string') return d;
  const f = Math.pow(10, Math.trunc(d));
  const scaled = x * f;
  const r = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return r / f;
}`
    },

    // _substitute: استبدال نص — الكل أو التكرار رقم instance فقط
    _substitute: {
      deps: ['_str'],
      code: `function _substitute(text, oldText, newText, instance) {
  const s = _str(text), o = _str(oldText), n = _str(newText);
  if (o === '') return s;
  if (instance === undefined) return s.split(o).join(n);
  const target = Number(instance);
  if (!(target >= 1)) return '#VALUE!';
  let count = 0, from = 0, idx;
  while ((idx = s.indexOf(o, from)) !== -1) {
    count++;
    if (count === target) return s.slice(0, idx) + n + s.slice(idx + o.length);
    from = idx + o.length;
  }
  return s;
}`
    },

    // _matchCriteria: يحاكي شروط COUNTIF مثل ">5", "<>0", "محمد".
    // الخلية الفارغة لا تطابق إلا "" و"=" ويقبلها كل "<>" ما عدا "<>" وحدها.
    // المعيار الرقمي — حرفياً أو نصاً رقمياً مثل "5" — يطابق الرقم والنص
    // الرقمي معاً، فـ"5" و"=5" و5 كلها نفس الشرط كما في Excel
    _matchCriteria: {
      deps: ['_eq'],
      code: `function _matchCriteria(value, criteria) {
  const blank = value === null || value === undefined || value === '';
  const toNum = (s) => typeof s === 'string' && s.trim() !== '' ? Number(s) : NaN;
  const same = (v, c) => {
    if (typeof c === 'number') {
      return v === c || (typeof v === 'string' && toNum(v) === c);
    }
    return _eq(v, c);
  };
  let op = '=', val = criteria;
  if (typeof criteria === 'string') {
    const m = criteria.match(/^(>=|<=|<>|>|<|=)(.*)$/);
    if (m) { op = m[1]; val = m[2].trim(); }
    if (!isNaN(toNum(val))) val = toNum(val);
  }
  if (blank) {
    if (op === '=') return val === '';
    if (op === '<>') return val !== '';
    return false;
  }
  switch (op) {
    case '>':  return value > val;
    case '<':  return value < val;
    case '>=': return value >= val;
    case '<=': return value <= val;
    case '<>': return !same(value, val);
    default:   return same(value, val);
  }
}`
    },

    // _vlookup: البحث العمودي (تام أو تقريبي بدلالات Excel).
    // رقم العمود يُفحص قبل البحث: < 1 → #VALUE!، وأكبر من عرض الجدول
    // → #REF! — وإلا رجعت undefined لا تلتقطها IFERROR
    _vlookup: {
      deps: ['_eq'],
      code: `function _vlookup(lookupValue, table, colIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  const c = Math.trunc(Number(colIndex));
  if (!(c >= 1)) return '#VALUE!';
  const width = Array.isArray(table[0]) ? table[0].length : 0;
  if (c > width) return '#REF!';
  if (exactMatch) {
    for (const row of table) {
      if (!Array.isArray(row) || row.length === 0) continue;
      if (_eq(row[0], lookupValue)) return row[c - 1];
    }
    return '#N/A';
  }
  // تقريبي (افتراضي Excel): آخر صف قيمته الأولى <= قيمة البحث.
  // يفترض العمود الأول مرتباً تصاعدياً كما يشترط Excel.
  let best = null;
  for (const row of table) {
    if (!Array.isArray(row) || row.length === 0) continue;
    if (row[0] <= lookupValue) best = row;
  }
  return best ? best[c - 1] : '#N/A';
}`
    },

    // _hlookup: البحث الأفقي (تام أو تقريبي بدلالات Excel)، بنفس فحص
    // رقم الصف الذي في _vlookup
    _hlookup: {
      deps: ['_eq'],
      code: `function _hlookup(lookupValue, table, rowIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  const firstRow = table[0];
  if (!Array.isArray(firstRow)) return '#N/A';
  const r = Math.trunc(Number(rowIndex));
  if (!(r >= 1)) return '#VALUE!';
  if (r > table.length) return '#REF!';
  let bestCol = -1;
  for (let c = 0; c < firstRow.length; c++) {
    if (exactMatch) {
      if (_eq(firstRow[c], lookupValue)) { bestCol = c; break; }
    } else if (firstRow[c] <= lookupValue) {
      // تقريبي: آخر عمود قيمته في الصف الأول <= قيمة البحث (صف أول مرتب تصاعدياً)
      bestCol = c;
    }
  }
  if (bestCol === -1) return '#N/A';
  const targetRow = table[r - 1];
  return Array.isArray(targetRow) ? targetRow[bestCol] : '#N/A';
}`
    },

    // _index: استرجاع قيمة بإحداثيات. النطاق ذو الصف الواحد متجه أفقي:
    // INDEX(A1:E1,3) = C1 كما في Excel، لا الصف الثالث غير الموجود
    _index: {
      code: `function _index(arr, rowNum, colNum) {
  if (!Array.isArray(arr)) return '#REF!';
  if (Array.isArray(arr[0])) {
    if (arr.length === 1 && colNum === undefined && arr[0].length > 1) {
      const v = arr[0][rowNum - 1];
      return rowNum >= 1 && rowNum <= arr[0].length ? v : '#REF!';
    }
    const row = arr[rowNum - 1];
    if (!row) return '#REF!';
    if (colNum === undefined || colNum === 0) {
      if (row.length === 1) return row[0];
      return row;
    }
    return row[colNum - 1];
  }
  return arr[rowNum - 1];
}`
    },
    // _match: البحث عن موضع قيمة
    _match: {
      deps: ['_eq'],
      code: `function _match(lookupValue, arr, matchType) {
  if (matchType === undefined) matchType = 1;
  arr = Array.isArray(arr) ? arr.flat(Infinity) : [arr];
  if (matchType === 0) {
    for (let i = 0; i < arr.length; i++) {
      if (_eq(arr[i], lookupValue)) return i + 1;
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
  // Excel يشترط تطابق أحجام النطاقات ويرجّع #VALUE! خلاف ذلك
  if (ranges.some(r => r.length !== len)) return '#VALUE!';
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
      deps: ['_toDate'],
      code: `function _datedif(start, end, unit) {
  const s = _toDate(start);
  const e = _toDate(end);
  const u = String(unit).toUpperCase();
  // فرق الأيام التقويمية عبر UTC — القسمة على فرق التوقيت المحلي
  // تنقص يوماً عند عبور حدود التوقيت الصيفي
  const days = (a, b) => Math.floor(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
     Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  switch (u) {
    case 'D': return days(s, e);
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
      return days(sAdj, e);
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
      deps: ['_toDate'],
      code: `function _edate(start, months) {
  const d = new Date(_toDate(start).getTime());
  const targetMonth = d.getMonth() + Number(months);
  const result = new Date(d.getFullYear(), targetMonth, d.getDate());
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

  NS.HELPERS = HELPERS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { HELPERS };
})(typeof window !== 'undefined' ? window : globalThis);
