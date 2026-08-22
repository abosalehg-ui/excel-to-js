/* ============================================================
   helpers.js — قاموس الـ Helpers
   ------------------------------------------------------------
   كل helper يوصف بـ { code, deps? }. الـ deps لتعقّب الترتيب
   topological عند توليد الكود النهائي.
   ============================================================ */
(function (global) {
  const NS = (global.ExcelToJS = global.ExcelToJS || {});

  const HELPERS = {
    // _str: تحويل نصي بدلالات Excel — الخلية الفارغة نص فارغ لا "undefined".
    // كل موضع كان يستدعي String(x) مباشرةً يمرّ من هنا الآن.
    _str: {
      code: `function _str(v) {
  return v === null || v === undefined ? '' : String(v);
}`
    },

    // _num: تطبيع رقمي بدلالات Excel — أساس العوامل الحسابية كلها.
    // الخلية الفارغة (null/undefined/"") صفر كما في Excel، وما لا يقبل
    // التحويل رقماً يعطي ‎#VALUE!‎ لا NaN صامتاً.
    _num: {
      code: `function _num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? '#VALUE!' : n;
}`
    },

    // العوامل الحسابية (+ - * / ^ والسالب الأحادي): عملية حسابية دائماً
    // كما في Excel، لا دلالات JS. ‏"5" + "3" في JS دمج نصّي = "53"،
    // والفراغ في '-' و'*' كان يعطي NaN صامتة. كانت '+' وحدها مصلحة في
    // 3.1.4 والبقية بدلالات JS — سلوك متناقض داخل الأداة نفسها.
    // ‏#VALUE! من أي طرف يمرّ عبر العملية بدل أن ينقلب NaN.
    _add: {
      deps: ['_num'],
      code: `function _add(a, b) {
  const x = _num(a), y = _num(b);
  return x === '#VALUE!' || y === '#VALUE!' ? '#VALUE!' : x + y;
}`
    },
    _sub: {
      deps: ['_num'],
      code: `function _sub(a, b) {
  const x = _num(a), y = _num(b);
  return x === '#VALUE!' || y === '#VALUE!' ? '#VALUE!' : x - y;
}`
    },
    _mul: {
      deps: ['_num'],
      code: `function _mul(a, b) {
  const x = _num(a), y = _num(b);
  return x === '#VALUE!' || y === '#VALUE!' ? '#VALUE!' : x * y;
}`
    },
    // القسمة على صفر تبقى Infinity (وNaN لـ 0/0) — انحراف موثق مقصود،
    // تلتقطه IFERROR/ISERROR كما في بقية الأداة
    _div: {
      deps: ['_num'],
      code: `function _div(a, b) {
  const x = _num(a), y = _num(b);
  return x === '#VALUE!' || y === '#VALUE!' ? '#VALUE!' : x / y;
}`
    },
    _pow: {
      deps: ['_num'],
      code: `function _pow(a, b) {
  const x = _num(a), y = _num(b);
  return x === '#VALUE!' || y === '#VALUE!' ? '#VALUE!' : Math.pow(x, y);
}`
    },
    _neg: {
      deps: ['_num'],
      code: `function _neg(a) {
  const x = _num(a);
  return x === '#VALUE!' ? '#VALUE!' : -x;
}`
    },

    // _toDate: توحيد قبول التاريخ — Date كما هي. صيغة التاريخ-فقط
    // "YYYY-MM-DD" تُبنى يدوياً بالتوقيت المحلي: تمريرها لـnew Date
    // يفسّرها منتصف ليل UTC فتنزاح يوماً كاملاً في المناطق غرب غرينتش
    // (YEAR("2024-01-01") كانت ترجع 2023 بتوقيت نيويورك).
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

    // _eq: مساواة بدلالات Excel — مقارنة النصوص غير حساسة لحالة الأحرف
    _eq: {
      code: `function _eq(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}`
    },

    // _nums: يفرد المصفوفة ويُبقي الأرقام الصالحة فقط (أساس SUM/AVERAGE/MIN/MAX/COUNT)
    _nums: {
      code: `function _nums(arr) {
  return arr.flat(Infinity).filter(v => typeof v === 'number' && !isNaN(v));
}`
    },

    // _mod: باقي القسمة بدلالات Excel — إشارة الناتج تتبع المقسوم عليه
    // (‏JS: -3 % 2 = -1، بينما Excel: MOD(-3,2) = 1)
    _mod: {
      code: `function _mod(a, b) {
  const x = Number(a), y = Number(b);
  if (y === 0) return '#DIV/0!';
  return ((x % y) + y) % y;
}`
    },

    // _round: تقريب بدلالات Excel — النصف يُقرَّب بعيداً عن الصفر
    // (‏Math.round(-2.5) = -2، بينما Excel: ROUND(-2.5,0) = -3)
    _round: {
      code: `function _round(n, digits) {
  const x = Number(n);
  if (isNaN(x)) return '#VALUE!';
  const f = Math.pow(10, Number(digits) || 0);
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

    // _matchCriteria: يحاكي شروط COUNTIF مثل ">5", "<>0", "محمد"
    _matchCriteria: {
      deps: ['_eq'],
      code: `function _matchCriteria(value, criteria) {
  if (typeof criteria === 'number') return value === criteria;
  if (typeof criteria !== 'string') return value === criteria;
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
      case '<>': return !_eq(value, val);
      case '=':  return _eq(value, val);
    }
  }
  return _eq(value, criteria);
}`
    },

    // _vlookup: البحث العمودي (تام أو تقريبي بدلالات Excel)
    _vlookup: {
      deps: ['_eq'],
      code: `function _vlookup(lookupValue, table, colIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  if (exactMatch) {
    for (const row of table) {
      if (!Array.isArray(row) || row.length === 0) continue;
      if (_eq(row[0], lookupValue)) return row[colIndex - 1];
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
  return best ? best[colIndex - 1] : '#N/A';
}`
    },

    // _hlookup: البحث الأفقي (تام أو تقريبي بدلالات Excel)
    _hlookup: {
      deps: ['_eq'],
      code: `function _hlookup(lookupValue, table, rowIndex, exactMatch) {
  if (!Array.isArray(table) || table.length === 0) return '#N/A';
  const firstRow = table[0];
  if (!Array.isArray(firstRow)) return '#N/A';
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
  const targetRow = table[rowIndex - 1];
  return targetRow ? targetRow[bestCol] : '#N/A';
}`
    },

    // _index: استرجاع قيمة بإحداثيات
    _index: {
      code: `function _index(arr, rowNum, colNum) {
  if (!Array.isArray(arr)) return '#REF!';
  if (Array.isArray(arr[0])) {
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
