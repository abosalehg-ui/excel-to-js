/* ============================================================
   engine.js — قلب المحوّل: Tokenizer + Parser + Generator
   ------------------------------------------------------------
   يعتمد على HELPERS من helpers.js و FUNCTIONS من functions.js
   (لازم تتحمّل قبل هذا الملف).
   ============================================================ */

/* ============================================================
   Tokenizer
   ============================================================ */
function tokenize(input) {
  const tokens = [];
  let pos = 0;
  let src = input;
  let offset = 0;
  if (src.startsWith('=')) { offset = 1; src = src.slice(1); }

  const patterns = [
    [/^\s+/,                                  null],
    // "" داخل النص = اقتباس مهرّب (دلالات Excel — لا يوجد escape بالباكسلاش)
    [/^"((?:""|[^"])*)"/,                     'STRING'],
    [/^(TRUE|FALSE)\b/i,                      'BOOLEAN'],
    [/^[A-Za-z_][A-Za-z0-9_\.]*(?=\s*\()/,    'FUNCTION'],
    [/^\$?[A-Za-z]+\$?\d+\s*:\s*\$?[A-Za-z]+\$?\d+/, 'RANGE'],
    // عمود كامل (B:C) — نلتقطه علشان نرفضه برسالة واضحة
    [/^\$?[A-Za-z]+:\$?[A-Za-z]+(?![A-Za-z0-9])/, 'FULL_COLUMN'],
    [/^\$?[A-Za-z]+\$?\d+/,                   'CELL_REF'],
    [/^\d+\.?\d*(?:[Ee][+-]?\d+)?/,           'NUMBER'],
    [/^\.\d+(?:[Ee][+-]?\d+)?/,               'NUMBER'],
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
   Parser — Recursive Descent يبني AST
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
    while (peek() && peek().type === 'OPERATOR' && (peek().value === '*' || peek().value === '/')) {
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
    return parsePostfix();
  }
  // % في Excel لاحقة نسبة مئوية (50% = 0.5)، وليست عامل باقي قسمة
  function parsePostfix() {
    let node = parsePrimary();
    while (peek() && peek().type === 'OPERATOR' && peek().value === '%') {
      eat();
      node = { type: 'Percent', arg: node };
    }
    return node;
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
      // نطبّع $ والمسافات حول النقطتين (Excel يقبل "A1 : B2")
      const [s, e] = t.value.replace(/[$\s]/g, '').split(':');
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
   Code Generator — يحوّل AST لـ JS
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
    '<':  '<', '>': '>', '<=': '<=', '>=': '>=',
    '+':  '+', '-': '-', '*': '*', '/': '/'
  };

  function registerHelper(name) {
    if (usedHelpers.has(name)) return;
    usedHelpers.add(name);
    const h = HELPERS[name];
    if (h && h.deps) {
      for (const d of h.deps) registerHelper(d);
    }
  }

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
          const rowStrs = matrix.map(row => `[${row.join(', ')}]`);
          return `[${rowStrs.join(', ')}]`;
        }
        return `[${matrix.flat().join(', ')}]`;
      }

      case 'Unary':
        return `(${node.op}${gen(node.arg)})`;

      case 'Percent':
        return `((${gen(node.arg)}) / 100)`;

      case 'Binary': {
        const L = gen(node.left);
        const R = gen(node.right);
        if (node.op === '&') return `(String(${L}) + String(${R}))`;
        if (node.op === '^') return `Math.pow(${L}, ${R})`;
        // = و <> بدلالات Excel: مقارنة النصوص غير حساسة لحالة الأحرف
        if (node.op === '=')  { registerHelper('_eq'); return `_eq(${L}, ${R})`; }
        if (node.op === '<>') { registerHelper('_eq'); return `(!_eq(${L}, ${R}))`; }
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

        // فحص مركزي لعدد الوسائط حسب عقد الدالة (minArgs/maxArgs)
        const argc = node.args.length;
        const min = fn.minArgs ?? 0;
        const max = fn.maxArgs ?? Infinity;
        if (argc < min || argc > max) {
          const expected =
            min === max ? `${min}` :
            max === Infinity ? `${min}+` :
            `${min}–${max}`;
          const err = new Error(`الدالة ${node.name} تتوقع ${expected} من الوسائط، وُجد ${argc}`);
          err.start = node.start; err.end = node.end;
          throw err;
        }

        if (fn.usesHelpers) {
          for (const h of fn.usesHelpers) registerHelper(h);
        }

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
   convertFormula — الواجهة الرئيسية
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

  // شبكة أمان: نتأكد أن التعبير المولّد صالح نحوياً قبل عرضه للمستخدم
  // (new Function تُصرّف فقط ولا تنفّذ — الـ helpers غير المعرفة لا تضر)
  try {
    new Function(usedCells.join(', '), `return ${expr};`);
  } catch (e) {
    throw Object.assign(
      new Error(`خطأ داخلي: الكود المولّد غير صالح نحوياً (${e.message}). الرجاء الإبلاغ عن هذه الصيغة.`),
      { start: 0, end: input.length }
    );
  }

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
