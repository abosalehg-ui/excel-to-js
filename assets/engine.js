/* ============================================================
   engine.js — قلب المحوّل: Tokenizer + Parser + Generator
   ------------------------------------------------------------
   يعتمد على HELPERS من helpers.js و FUNCTIONS من functions.js
   (لازم تتحمّل قبل هذا الملف).
   ============================================================ */
(function (global) {
  const NS = (global.ExcelToJS = global.ExcelToJS || {});
  const HELPERS = NS.HELPERS;
  const FUNCTIONS = NS.FUNCTIONS;
  if (!HELPERS || !FUNCTIONS) {
    throw new Error('engine.js يتطلب تحميل helpers.js و functions.js قبله');
  }

  /* ============================================================
   حدود الموارد — تمنع صيغة صغيرة من تجميد المتصفح
   ============================================================ */
  const LIMITS = {
    inputLength: 10000, // أقصى طول للصيغة المُدخلة
    parseDepth: 64, // أقصى عمق تداخل في الـ AST
    rangeCells: 1000, // أقصى عدد خلايا في نطاق واحد
    totalCells: 2000, // أقصى عدد خلايا في الصيغة كلها
    exprLength: 200000 // أقصى طول للتعبير المولّد
  };

  /* ============================================================
   Tokenizer
   ------------------------------------------------------------
   الأنماط بعلم y (sticky) وتُطابَق عند lastIndex مباشرة، فلا
   يُنشَأ نص جديد لكل token (كان src.slice(pos) يجعلها O(n²)).
   ============================================================ */
  const PATTERNS = [
    [/\s+/y, null],
    // "" داخل النص = اقتباس مهرّب (دلالات Excel — لا يوجد escape بالباكسلاش)
    [/"((?:""|[^"])*)"/y, 'STRING'],
    [/(TRUE|FALSE)\b/iy, 'BOOLEAN'],
    [/[A-Za-z_][A-Za-z0-9_\.]*(?=\s*\()/y, 'FUNCTION'],
    [/\$?[A-Za-z]+\$?\d+\s*:\s*\$?[A-Za-z]+\$?\d+/y, 'RANGE'],
    // عمود كامل (B:C) — نلتقطه علشان نرفضه برسالة واضحة
    [/\$?[A-Za-z]+:\$?[A-Za-z]+(?![A-Za-z0-9])/y, 'FULL_COLUMN'],
    [/\$?[A-Za-z]+\$?\d+/y, 'CELL_REF'],
    [/\d+\.?\d*(?:[Ee][+-]?\d+)?/y, 'NUMBER'],
    [/\.\d+(?:[Ee][+-]?\d+)?/y, 'NUMBER'],
    [/(<=|>=|<>|=|<|>)/y, 'OPERATOR_CMP'],
    [/[+\-*/%^&]/y, 'OPERATOR'],
    [/[,;]/y, 'COMMA'],
    [/\(/y, 'LPAREN'],
    [/\)/y, 'RPAREN']
  ];

  function tokenize(input) {
    const tokens = [];
    let pos = 0;
    let src = input;
    let offset = 0;
    // الفراغات البادئة تُتجاهل قبل "=" (شائع جداً عند اللصق من Excel)
    const lead = /^\s*/.exec(src)[0].length;
    if (lead) {
      offset += lead;
      src = src.slice(lead);
    }
    if (src.startsWith('=')) {
      offset += 1;
      src = src.slice(1);
    }

    while (pos < src.length) {
      let matched = false;
      for (const [regex, type] of PATTERNS) {
        regex.lastIndex = pos;
        const m = regex.exec(src);
        if (!m) continue;

        const start = pos + offset;
        const end = pos + m[0].length + offset;

        if (type === 'FULL_COLUMN') {
          const parts = m[0].split(':');
          const err = new Error(
            `النطاقات بدون أرقام صفوف غير مدعومة: "${m[0]}". استخدم شكل مثل "${parts[0]}1:${parts[1]}100" بدلاً منها.`
          );
          err.start = start;
          err.end = end;
          throw err;
        }

        if (type !== null) {
          tokens.push({
            type,
            value: type === 'STRING' ? m[1] : m[0],
            raw: m[0],
            start,
            end
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
    let depth = 0;
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
        err.start = t.start;
        err.end = t.end;
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
      while (
        peek() &&
        peek().type === 'OPERATOR' &&
        (peek().value === '+' || peek().value === '-')
      ) {
        const op = eat().value;
        const right = parseMulDiv();
        left = { type: 'Binary', op, left, right };
      }
      return left;
    }
    function parseMulDiv() {
      let left = parsePower();
      while (
        peek() &&
        peek().type === 'OPERATOR' &&
        (peek().value === '*' || peek().value === '/')
      ) {
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
    // حارس مشترك لسلاسل المعاملات الأحادية واللواحق: كلاهما يبني عقداً
    // متداخلة يمرّ عليها المولّد تعاوداً، فسلسلة طويلة تكسر المكدّس.
    // ‏LIMITS.parseDepth كان مطبّقاً في parsePrimary وحدها، فسلسلة مثل
    // "=-----…-A1" تتجاوزه كلياً وتنتهي بـRangeError إنجليزي خام أو
    // برسالة "الرجاء الإبلاغ" المضلّلة من شبكة الأمان النحوية.
    const checkChain = (n, tok) => {
      if (n <= LIMITS.parseDepth) return;
      const err = new Error(
        `الصيغة معقّدة جداً: سلسلة معاملات أطول من الحد الأقصى (${LIMITS.parseDepth}). بسّطها أو قسّمها لخطوات.`
      );
      err.start = tok ? tok.start : 0;
      err.end = tok ? tok.end : 1;
      throw err;
    };

    // تكرار لا تعاود: السلسلة تُجمع في مصفوفة ثم تُبنى العقد من الداخل
    // للخارج، فلا يتعلّق عمق المكدّس بطول السلسلة إطلاقاً.
    function parseUnary() {
      const ops = [];
      let first = peek();
      while (
        peek() &&
        peek().type === 'OPERATOR' &&
        (peek().value === '-' || peek().value === '+')
      ) {
        ops.push(eat().value);
        checkChain(ops.length, first);
      }
      let node = parsePostfix();
      for (let k = ops.length - 1; k >= 0; k--) node = { type: 'Unary', op: ops[k], arg: node };
      return node;
    }
    // % في Excel لاحقة نسبة مئوية (50% = 0.5)، وليست عامل باقي قسمة
    function parsePostfix() {
      let node = parsePrimary();
      let n = 0;
      while (peek() && peek().type === 'OPERATOR' && peek().value === '%') {
        const tok = eat();
        checkChain(++n, tok);
        node = { type: 'Percent', arg: node };
      }
      return node;
    }
    // كل مستوى تداخل (قوس أو وسيط دالة) يمرّ من هنا، فهو موضع حدّ العمق
    function parsePrimary() {
      if (depth >= LIMITS.parseDepth) {
        const t = peek();
        const err = new Error(
          `الصيغة معقّدة جداً: تجاوز عمق التداخل الحد الأقصى (${LIMITS.parseDepth} مستوى). بسّطها أو قسّمها لخطوات.`
        );
        err.start = t ? t.start : 0;
        err.end = t ? t.end : 1;
        throw err;
      }
      depth++;
      try {
        return parsePrimaryInner();
      } finally {
        depth--;
      }
    }

    function parsePrimaryInner() {
      const t = peek();
      if (!t) {
        const err = new Error('متوقع تعبير لكن انتهت الصيغة');
        err.start = tokens[tokens.length - 1]?.end ?? 0;
        err.end = err.start + 1;
        throw err;
      }

      if (t.type === 'NUMBER') {
        eat();
        return { type: 'Number', value: parseFloat(t.value) };
      }
      if (t.type === 'STRING') {
        eat();
        const unescaped = t.value.replace(/""/g, '"');
        return { type: 'String', value: unescaped };
      }
      if (t.type === 'BOOLEAN') {
        eat();
        return { type: 'Boolean', value: t.value.toUpperCase() === 'TRUE' };
      }
      if (t.type === 'CELL_REF') {
        eat();
        return { type: 'CellRef', name: t.value.replace(/\$/g, '') };
      }
      if (t.type === 'RANGE') {
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
          args,
          start: fnTok.start,
          end: closing.end
        };
      }
      if (t.type === 'LPAREN') {
        eat();
        const expr = parseComparison();
        eat('RPAREN');
        return expr;
      }

      const err = new Error(`رمز غير متوقع: "${t.raw}"`);
      err.start = t.start;
      err.end = t.end;
      throw err;
    }

    const ast = parseComparison();
    if (i < tokens.length) {
      const t = tokens[i];
      const err = new Error(`رمز إضافي غير متوقع: "${t.raw}"`);
      err.start = t.start;
      err.end = t.end;
      throw err;
    }
    return ast;
  }

  /* ============================================================
   Code Generator — يحوّل AST لـ JS
   ============================================================ */
  // تعبير "بسيط" = تقييمه بلا تكلفة ولا أثر جانبي، فلا حاجة للفّه
  const SIMPLE_EXPR = /^(?:[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|true|false|"(?:[^"\\]|\\.)*")$/;

  /* ------------------------------------------------------------
   jsString — حرفيّ نصّي آمن للتضمين في أي سياق
   ------------------------------------------------------------
   ‏JSON.stringify لا يهرّب "/"، فنص فيه "</script>" يخرج حرفياً
   ويُنهي وسم <script> مضمّناً في صفحة من يلصق الكود المولّد.
   ونهرّب U+2028/U+2029 لأنهما يكسران التضمين في JSON والأدوات
   القديمة. لا نهرّب "<" وحده: "<5" شرط شائع في COUNTIF ولا داعي
   لتشويهه إلى "\x3C5".
   ------------------------------------------------------------ */
  function jsString(value) {
    return JSON.stringify(value)
      .replace(/<\//g, '<\\/')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  // تحويل حرف العمود إلى رقمه (A=1, Z=26, AA=27) — على مستوى الوحدة
  // لأن naturalSort خارج generate يحتاجه أيضاً
  const colToNum = (c) => {
    let n = 0;
    for (const ch of c.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  };
  const numToCol = (n) => {
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  const opMap = {
    '<': '<',
    '>': '>',
    '<=': '<=',
    '>=': '>=',
    '+': '+',
    '-': '-',
    '*': '*',
    '/': '/'
  };

  /* ------------------------------------------------------------
   gen — يحوّل عقدة AST إلى نصّ تعبير JS
   ------------------------------------------------------------
   على مستوى الوحدة لا داخل generate: كانت generate تتجاوز 200 سطر
   تحتضن ثمان دوال متداخلة. الحالة المشتركة تصل هنا صراحةً عبر state
   بدل الإغلاق الضمني، فحدود المسؤولية تبقى ظاهرة.

   state = { rangeParams, cellVar, expandRangeToMatrix, rangeParamName,
             registerHelper, ctx }
   ------------------------------------------------------------ */
  function gen(node, state, opts = {}) {
    const needsMatrix = opts.needsMatrix === true;

    switch (node.type) {
      case 'Number':
        return String(node.value);
      case 'String':
        return jsString(node.value);
      case 'Boolean':
        return node.value ? 'true' : 'false';
      case 'CellRef':
        return state.cellVar(node.name);

      case 'Range': {
        if (state.rangeParams) {
          // الباراميتر يصل دائماً كمصفوفة ثنائية؛ السياق المسطّح يفرده
          const name = state.rangeParamName(node.start, node.end);
          return needsMatrix ? name : `${name}.flat(Infinity)`;
        }
        const { matrix } = state.expandRangeToMatrix(node.start, node.end);
        if (needsMatrix) {
          const rowStrs = matrix.map((row) => `[${row.join(', ')}]`);
          return `[${rowStrs.join(', ')}]`;
        }
        return `[${matrix.flat().join(', ')}]`;
      }

      case 'Unary':
        return `(${node.op}${gen(node.arg, state)})`;

      case 'Percent':
        return `((${gen(node.arg, state)}) / 100)`;

      case 'Binary': {
        const L = gen(node.left, state);
        const R = gen(node.right, state);
        // الخلية الفارغة نص فارغ في Excel — String(undefined) كان يعطي "undefined"
        if (node.op === '&') {
          state.registerHelper('_str');
          return `(_str(${L}) + _str(${R}))`;
        }
        // ‏'+' في Excel عملية حسابية دائماً، بينما '+' في JS يدمج
        // النصوص لو أحد الطرفين نص — "5"+"3" كان يعطي "53" لا 8
        if (node.op === '+') {
          state.registerHelper('_add');
          return `_add(${L}, ${R})`;
        }
        if (node.op === '^') return `Math.pow(${L}, ${R})`;
        // = و <> بدلالات Excel: مقارنة النصوص غير حساسة لحالة الأحرف
        if (node.op === '=') {
          state.registerHelper('_eq');
          return `_eq(${L}, ${R})`;
        }
        if (node.op === '<>') {
          state.registerHelper('_eq');
          return `(!_eq(${L}, ${R}))`;
        }
        return `(${L} ${opMap[node.op]} ${R})`;
      }

      case 'Call': {
        const fn = FUNCTIONS[node.name];
        if (!fn) {
          const err = new Error(`الدالة "${node.name}" غير مدعومة في النسخة الحالية`);
          err.start = node.start;
          err.end = node.end;
          err.unsupported = node.name;
          throw err;
        }

        // فحص مركزي لعدد الوسائط حسب عقد الدالة (minArgs/maxArgs)
        const argc = node.args.length;
        const min = fn.minArgs ?? 0;
        const max = fn.maxArgs ?? Infinity;
        if (argc < min || argc > max) {
          const expected = min === max ? `${min}` : max === Infinity ? `${min}+` : `${min}–${max}`;
          const err = new Error(`الدالة ${node.name} تتوقع ${expected} من الوسائط، وُجد ${argc}`);
          err.start = node.start;
          err.end = node.end;
          throw err;
        }

        if (fn.usesHelpers) {
          for (const h of fn.usesHelpers) state.registerHelper(h);
        }

        const matrixArgs = fn.matrixArgs || [];
        const compiledArgs = node.args.map((a, idx) =>
          gen(a, state, { needsMatrix: matrixArgs.includes(idx) })
        );

        // ملء الوسائط الاختيارية المحذوفة من عقد الدالة، فيستقبل الـ
        // generator مصفوفة مكتملة بلا فحص `x !== undefined` في كل دالة
        if (fn.defaults) {
          for (const key of Object.keys(fn.defaults)) {
            const idx = Number(key);
            if (idx >= argc) compiledArgs[idx] = fn.defaults[key];
          }
        }

        try {
          return fn.generator(compiledArgs, state.ctx);
        } catch (e) {
          const err = new Error(`خطأ في دالة ${node.name}: ${e.message}`);
          err.start = node.start;
          err.end = node.end;
          throw err;
        }
      }

      default:
        throw new Error(`عقدة AST غير معروفة: ${node.type}`);
    }
  }

  /* ------------------------------------------------------------
   generate(ast, options)
     options.rangeParams — وضع الإخراج بالنطاقات:
       false (افتراضي): كل خلية باراميتر مستقل — calculate(a1, a2, …)
       true:            كل نطاق باراميتر واحد يستقبل مصفوفة ثنائية —
                        calculate(a2, b1_d10). يلزم حين يكون النطاق
                        كبيراً: توقيع بألف باراميتر غير قابل للاستدعاء.
   ------------------------------------------------------------ */
  function generate(ast, options) {
    const rangeParams = !!(options && options.rangeParams);
    const usedCells = new Set();
    const usedHelpers = new Set();
    // اسم النطاق المطبَّع → { name, rows, cols }
    const usedRanges = new Map();
    let rangeCellCount = 0;
    let tmpId = 0;

    const checkTotal = (n) => {
      if (n > LIMITS.totalCells) {
        throw new Error(
          `الصيغة تشير إلى أكثر من ${LIMITS.totalCells} خلية. قلّل عدد النطاقات أو حجمها.`
        );
      }
    };

    const cellVar = (name) => {
      const v = name.toLowerCase();
      usedCells.add(v);
      checkTotal(usedCells.size + rangeCellCount);
      return v;
    };

    /* ------------------------------------------------------------
     ctx.once — يضمن أن وسيطاً يُستعمل أكثر من مرة في الكود المولّد
     يُقيَّم مرة واحدة فقط. بدونها ينمو الناتج أسّياً عند التداخل
     (‏ISBLANK المتداخلة 11 مرة كانت تولّد 3.9 ميغابايت).
     الأسماء المؤقتة (_v1, _v2, …) فريدة داخل كل عملية توليد فلا تتظلّل.
     ------------------------------------------------------------ */
    const ctx = {
      once(expr, build) {
        if (SIMPLE_EXPR.test(expr)) return build(expr);
        const v = `_v${++tmpId}`;
        return `((${v}) => ${build(v)})(${expr})`;
      }
    };

    function rangeBounds(start, end) {
      const m1 = start.match(/^([A-Za-z]+)(\d+)$/);
      const m2 = end.match(/^([A-Za-z]+)(\d+)$/);
      if (!m1 || !m2) throw new Error(`نطاق غير صالح: ${start}:${end}`);

      const c1 = colToNum(m1[1]),
        c2 = colToNum(m2[1]);
      const r1 = parseInt(m1[2]),
        r2 = parseInt(m2[2]);
      const cMin = Math.min(c1, c2),
        cMax = Math.max(c1, c2);
      const rMin = Math.min(r1, r2),
        rMax = Math.max(r1, r2);
      const rows = rMax - rMin + 1;
      const cols = cMax - cMin + 1;

      if (rows * cols > LIMITS.rangeCells) {
        throw new Error(
          `النطاق كبير جداً (${rows * cols} خلية). الحد الأقصى ${LIMITS.rangeCells}.`
        );
      }
      return { cMin, cMax, rMin, rMax, rows, cols };
    }

    // وضع الخلايا المفردة: النطاق يتمدّد لمصفوفة من أسماء المتغيّرات
    function expandRangeToMatrix(start, end) {
      const { cMin, cMax, rMin, rMax, rows, cols } = rangeBounds(start, end);
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

    // وضع النطاقات: النطاق يصير باراميتراً واحداً اسمه a1_b10
    function rangeParamName(start, end) {
      const { rows, cols } = rangeBounds(start, end);
      const key = `${start}:${end}`.toLowerCase();
      let entry = usedRanges.get(key);
      if (!entry) {
        entry = { name: key.replace(':', '_'), rows, cols };
        usedRanges.set(key, entry);
        rangeCellCount += rows * cols;
        checkTotal(usedCells.size + rangeCellCount);
      }
      return entry.name;
    }

    function registerHelper(name) {
      if (usedHelpers.has(name)) return;
      usedHelpers.add(name);
      const h = HELPERS[name];
      if (h && h.deps) {
        for (const d of h.deps) registerHelper(d);
      }
    }

    const expr = gen(ast, {
      rangeParams,
      cellVar,
      expandRangeToMatrix,
      rangeParamName,
      registerHelper,
      ctx
    });

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
      usedRanges: [...usedRanges.values()].sort((x, y) => naturalSort(x.name, y.name)),
      usedHelpers: helperOrder
    };
  }

  // ترتيب طبيعي للخلايا: a1, a2, ..., a10 (ليس a1, a10, a2).
  // الأعمدة تُقارَن برقمها لا أبجدياً — وإلا جاءت aa1 قبل y1 (ترتيب
  // Excel هو … y, z, aa, ab).
  function naturalSort(a, b) {
    const re = /^([a-z]+)(\d+)/i;
    const ma = a.match(re),
      mb = b.match(re);
    if (ma && mb) {
      if (ma[1].toLowerCase() !== mb[1].toLowerCase()) return colToNum(ma[1]) - colToNum(mb[1]);
      return parseInt(ma[2]) - parseInt(mb[2]);
    }
    return a.localeCompare(b);
  }

  // بيئة بلا window = Node (حزمة الاختبارات والـCI) → الفحص شغّال.
  // في الصفحة يبقى مطفأً ما لم يُفعَّل صراحةً، فلا نحتاج 'unsafe-eval'.
  function syntaxCheckEnabled() {
    if (NS.SYNTAX_CHECK !== undefined) return !!NS.SYNTAX_CHECK;
    return typeof window === 'undefined';
  }

  /* ============================================================
   convertFormula — الواجهة الرئيسية
   ============================================================ */
  function convertFormula(input, options) {
    if (!input || !input.trim()) {
      throw Object.assign(new Error('الصيغة فارغة'), { start: 0, end: 0 });
    }
    if (input.length > LIMITS.inputLength) {
      throw Object.assign(
        new Error(`الصيغة طويلة جداً (${input.length} حرفاً). الحد الأقصى ${LIMITS.inputLength}.`),
        { start: LIMITS.inputLength, end: input.length }
      );
    }
    const tokens = tokenize(input);
    if (tokens.length === 0) {
      throw Object.assign(new Error('لا توجد رموز قابلة للتحليل'), { start: 0, end: input.length });
    }
    const ast = parse(tokens);
    const { expr, usedCells, usedRanges, usedHelpers } = generate(ast, options);
    const paramNames = [...usedCells, ...usedRanges.map((r) => r.name)];

    // حارس أخير: لا نُسلّم للواجهة تعبيراً ضخماً يجمّد التبويب عند العرض
    if (expr.length > LIMITS.exprLength) {
      throw Object.assign(
        new Error(`الكود المولّد ضخم جداً (${expr.length} حرفاً). بسّط الصيغة أو قلّل التداخل.`),
        { start: 0, end: input.length }
      );
    }

    // شبكة أمان: نتأكد أن التعبير المولّد صالح نحوياً قبل عرضه للمستخدم.
    // ‏(new Function تُصرّف فقط ولا تنفّذ — الـ helpers غير المعرفة لا تضر)
    //
    // تعمل خارج المتصفح فقط: الحارس يلتقط أخطاء الـgenerator لا أخطاء
    // المستخدم، أي إنه أداة تطوير. تشغيله في الصفحة كان يفرض
    // 'unsafe-eval' في الـCSP — إضعاف دائم لأقوى بند فيها مقابل فحص
    // تغطّيه حزمة الاختبارات في Node أصلاً. للتفعيل يدوياً:
    // ‏ExcelToJS.SYNTAX_CHECK = true
    if (syntaxCheckEnabled()) {
      try {
        new Function(paramNames.join(', '), `return ${expr};`);
      } catch (e) {
        throw Object.assign(
          new Error(
            `خطأ داخلي: الكود المولّد غير صالح نحوياً (${e.message}). الرجاء الإبلاغ عن هذه الصيغة.`
          ),
          { start: 0, end: input.length }
        );
      }
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
    lines.push(`// دالة محوّلة من صيغة Excel`);
    lines.push(`// المُدخلات المطلوبة: ${paramNames.length ? paramNames.join(', ') : '(لا شيء)'}`);
    for (const r of usedRanges) {
      lines.push(`//   ${r.name}: مصفوفة ثنائية ${r.rows}×${r.cols} (صفوف × أعمدة)`);
    }
    lines.push(`function calculate(${paramNames.join(', ')}) {`);
    lines.push(`  return ${expr};`);
    lines.push(`}`);

    return { code: lines.join('\n'), usedCells, usedRanges, usedHelpers, paramNames };
  }

  NS.LIMITS = LIMITS;
  NS.tokenize = tokenize;
  NS.parse = parse;
  NS.generate = generate;
  NS.convertFormula = convertFormula;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LIMITS, tokenize, parse, generate, convertFormula };
  }
})(typeof window !== 'undefined' ? window : globalThis);
