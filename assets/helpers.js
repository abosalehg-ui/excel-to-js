/* ============================================================
   helpers.js — قاموس الـ Helpers
   ------------------------------------------------------------
   كل helper يوصف بـ { code, deps? }. الـ deps لتعقّب الترتيب
   topological عند توليد الكود النهائي.
   ============================================================ */
const HELPERS = {
  // _matchCriteria: يحاكي شروط COUNTIF مثل ">5", "<>0", "محمد"
  _matchCriteria: {
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
