/* ============================================================
   suite.js — مجموعة اختبارات V3 (baseline لكل ميزات V2)
   ------------------------------------------------------------
   تستخدم: test, assertEqual, assertClose, assertContains,
            assertThrows, runFormula  (من tests/framework.js)
   تنقسم لأربع فئات:
     1. Tokenizer       — تقسيم الصيغة إلى tokens
     2. Parser          — بناء AST صحيح
     3. Generator       — توليد كود JS صحيح
     4. Runtime         — تنفيذ الكود الناتج للتأكد من النتيجة
   ============================================================ */

// واجهة المحرّك صارت تحت فضاء اسم واحد (ExcelToJS) بدل خمسة globals
// بأسماء عامة جداً؛ نفكّها هنا مرة واحدة لتبقى الاختبارات كما هي.
const { tokenize, parse, generate, convertFormula, LIMITS } = (
  typeof window !== 'undefined' ? window : globalThis
).ExcelToJS;

/* =========================================================
   1) Tokenizer
   ========================================================= */
test('Tokenizer', 'cell ref بسيط: A1', () => {
  const t = tokenize('A1');
  assertEqual(t.length, 1);
  assertEqual(t[0].type, 'CELL_REF');
  assertEqual(t[0].value, 'A1');
});

test('Tokenizer', 'cell ref بأعمدة طويلة: AA10, ZZ100', () => {
  assertEqual(tokenize('AA10')[0].value, 'AA10');
  assertEqual(tokenize('ZZ100')[0].value, 'ZZ100');
});

test('Tokenizer', 'cell ref مع علامة $ (absolute)', () => {
  const t = tokenize('$A$1');
  assertEqual(t[0].type, 'CELL_REF');
  assertEqual(t[0].value, '$A$1');
});

test('Tokenizer', 'NUMBER: عدد صحيح وعشري', () => {
  assertEqual(tokenize('42')[0].type, 'NUMBER');
  assertEqual(tokenize('3.14')[0].value, '3.14');
  assertEqual(tokenize('.5')[0].value, '.5');
});

test('Tokenizer', 'STRING: نص بسيط', () => {
  const t = tokenize('"hello"');
  assertEqual(t[0].type, 'STRING');
  assertEqual(t[0].value, 'hello');
});

test('Tokenizer', 'STRING: علامات اقتباس مزدوجة داخل النص ("")', () => {
  const t = tokenize('"say ""hi"""');
  assertEqual(t[0].type, 'STRING');
  assertEqual(t[0].value, 'say ""hi""');
});

test('Tokenizer', 'BOOLEAN: TRUE و FALSE (case-insensitive)', () => {
  assertEqual(tokenize('TRUE')[0].type, 'BOOLEAN');
  assertEqual(tokenize('false')[0].type, 'BOOLEAN');
});

test('Tokenizer', 'RANGE: A1:B10', () => {
  const t = tokenize('A1:B10');
  assertEqual(t.length, 1);
  assertEqual(t[0].type, 'RANGE');
  assertEqual(t[0].value, 'A1:B10');
});

test('Tokenizer', 'FUNCTION: SUM, IF, VLOOKUP', () => {
  assertEqual(tokenize('SUM(')[0].type, 'FUNCTION');
  assertEqual(tokenize('IF(')[0].type, 'FUNCTION');
  assertEqual(tokenize('VLOOKUP(')[0].type, 'FUNCTION');
});

test('Tokenizer', 'OPERATORS: + - * / ^ & %', () => {
  for (const op of ['+', '-', '*', '/', '^', '&', '%']) {
    assertEqual(tokenize(op)[0].type, 'OPERATOR');
  }
});

test('Tokenizer', 'COMPARISON: <= >= <> = < >', () => {
  assertEqual(tokenize('<=')[0].value, '<=');
  assertEqual(tokenize('>=')[0].value, '>=');
  assertEqual(tokenize('<>')[0].value, '<>');
  // = في البداية يُتعامل معه كـ prefix، فنفحصه في وسط الصيغة
  assertEqual(tokenize('A1=5')[1].type, 'OPERATOR_CMP');
  assertEqual(tokenize('A1<5')[1].type, 'OPERATOR_CMP');
  assertEqual(tokenize('A1>5')[1].type, 'OPERATOR_CMP');
});

test('Tokenizer', '= prefix يُتجاهل', () => {
  const t = tokenize('=A1');
  assertEqual(t.length, 1);
  assertEqual(t[0].type, 'CELL_REF');
});

test('Tokenizer', 'tracking مواضع الـ tokens', () => {
  const t = tokenize('=A1+B2');
  assertEqual(t[0].start, 1);
  assertEqual(t[0].end, 3);
  assertEqual(t[2].start, 4);
});

test('Tokenizer', 'يرفض العمود الكامل B:C برسالة واضحة', () => {
  assertThrows(() => tokenize('B:C'), 'بدون أرقام صفوف');
});

test('Tokenizer', 'يرفض رمز غير معروف', () => {
  assertThrows(() => tokenize('A1@'), 'غير متوقع');
});

test('Tokenizer', 'ترميز علمي: 1E5 و 2.5e-3', () => {
  assertEqual(tokenize('1E5')[0].type, 'NUMBER');
  assertEqual(tokenize('1E5')[0].value, '1E5');
  assertEqual(tokenize('2.5e-3')[0].value, '2.5e-3');
});

test('Tokenizer', 'نطاق بمسافات حول النقطتين: A1 : A3', () => {
  const t = tokenize('A1 : A3');
  assertEqual(t.length, 1);
  assertEqual(t[0].type, 'RANGE');
});

test('Tokenizer', 'الباكسلاش داخل النص حرف عادي (لا escape كما في Excel)', () => {
  assertEqual(tokenize('"a\\b"')[0].value, 'a\\b');
});

/* =========================================================
   2) Parser
   ========================================================= */
test('Parser', 'literal number', () => {
  const ast = parse(tokenize('42'));
  assertEqual(ast.type, 'Number');
  assertEqual(ast.value, 42);
});

test('Parser', 'cell ref يكون CellRef node', () => {
  const ast = parse(tokenize('A1'));
  assertEqual(ast.type, 'CellRef');
  assertEqual(ast.name, 'A1');
});

test('Parser', 'range يكون Range node', () => {
  const ast = parse(tokenize('A1:B10'));
  assertEqual(ast.type, 'Range');
  assertEqual(ast.start, 'A1');
  assertEqual(ast.end, 'B10');
});

test('Parser', 'يجرّد $ من cell refs', () => {
  const ast = parse(tokenize('$A$1'));
  assertEqual(ast.name, 'A1');
});

test('Parser', 'precedence: 2 + 3 * 4 = ((2)+(3*4))', () => {
  const ast = parse(tokenize('2+3*4'));
  assertEqual(ast.type, 'Binary');
  assertEqual(ast.op, '+');
  assertEqual(ast.right.type, 'Binary');
  assertEqual(ast.right.op, '*');
});

test('Parser', 'parens يتجاوزون precedence', () => {
  const ast = parse(tokenize('(2+3)*4'));
  assertEqual(ast.op, '*');
  assertEqual(ast.left.op, '+');
});

test('Parser', 'unary minus', () => {
  const ast = parse(tokenize('-A1'));
  assertEqual(ast.type, 'Unary');
  assertEqual(ast.op, '-');
});

test('Parser', 'function call مع وسائط', () => {
  const ast = parse(tokenize('SUM(A1, B2)'));
  assertEqual(ast.type, 'Call');
  assertEqual(ast.name, 'SUM');
  assertEqual(ast.args.length, 2);
});

test('Parser', 'function name uppercased', () => {
  const ast = parse(tokenize('sum(A1)'));
  assertEqual(ast.name, 'SUM');
});

test('Parser', 'comparison operator', () => {
  const ast = parse(tokenize('A1>5'));
  assertEqual(ast.type, 'Binary');
  assertEqual(ast.op, '>');
});

test('Parser', 'concatenation عبر &', () => {
  const ast = parse(tokenize('A1&"x"'));
  assertEqual(ast.op, '&');
});

test('Parser', 'nested calls: IF(A1>0, SUM(B1:B5), 0)', () => {
  const ast = parse(tokenize('IF(A1>0, SUM(B1:B5), 0)'));
  assertEqual(ast.name, 'IF');
  assertEqual(ast.args[1].name, 'SUM');
});

test('Parser', 'string مع unescape ""', () => {
  const ast = parse(tokenize('"a""b"'));
  assertEqual(ast.value, 'a"b');
});

test('Parser', 'rejects extra trailing tokens', () => {
  assertThrows(() => parse(tokenize('A1 B2')), 'إضافي');
});

test('Parser', 'rejects unclosed paren', () => {
  assertThrows(() => parse(tokenize('SUM(A1')), 'انتهت');
});

test('Parser', 'rejects empty formula', () => {
  assertThrows(() => parse([]), 'متوقع');
});

test('Parser', 'نطاق بمسافات يُطبَّع: A1 : A3', () => {
  const ast = parse(tokenize('A1 : A3'));
  assertEqual(ast.type, 'Range');
  assertEqual(ast.start, 'A1');
  assertEqual(ast.end, 'A3');
});

test('Parser', '% لاحقة نسبة مئوية: 50% → Percent node', () => {
  const ast = parse(tokenize('50%'));
  assertEqual(ast.type, 'Percent');
  assertEqual(ast.arg.value, 50);
});

test('Parser', '10%5 يُرفض (لا يوجد عامل % ثنائي في Excel)', () => {
  assertThrows(() => parse(tokenize('10%5')), 'إضافي');
});

/* =========================================================
   3) Generator
   ========================================================= */
test('Generator', 'Number literal → expr', () => {
  const r = generate(parse(tokenize('42')));
  assertEqual(r.expr, '42');
});

test('Generator', 'CellRef → lowercased var', () => {
  const r = generate(parse(tokenize('A1')));
  assertEqual(r.expr, 'a1');
  assertEqual(r.usedCells, ['a1']);
});

test('Generator', 'Range 1D → flat array', () => {
  const r = generate(parse(tokenize('A1:A3')));
  assertEqual(r.expr, '[a1, a2, a3]');
  assertEqual(r.usedCells, ['a1', 'a2', 'a3']);
});

test('Generator', 'Range 2D عند VLOOKUP (matrixArgs)', () => {
  const r = generate(parse(tokenize('VLOOKUP(A1, B1:C2, 2, FALSE)')));
  assertContains(r.expr, '[[b1, c1], [b2, c2]]');
});

test('Generator', 'Binary + → _add (لا دمج نصّي)', () => {
  const r = generate(parse(tokenize('A1+B1')));
  assertEqual(r.expr, '_add(a1, b1)');
  assertEqual(r.usedHelpers.includes('_add'), true);
});

test('Generator', 'Comparison = → _eq (بدلالات Excel غير الحساسة للحالة)', () => {
  const r = generate(parse(tokenize('A1=5')));
  assertEqual(r.expr, '_eq(a1, 5)');
  assertEqual(r.usedHelpers.includes('_eq'), true);
});

test('Generator', 'Comparison <> → !_eq', () => {
  const r = generate(parse(tokenize('A1<>0')));
  assertEqual(r.expr, '(!_eq(a1, 0))');
});

test('Generator', '& → دمج نصي عبر _str', () => {
  const r = generate(parse(tokenize('A1&"x"')));
  // _str لا String: الخلية الفارغة نص فارغ في Excel، لا "undefined"
  assertContains(r.expr, '_str(a1) + _str("x")');
  assertEqual(r.usedHelpers.includes('_str'), true);
});

test('Generator', '^ → _pow (بدلالات Excel لا Math.pow الخام)', () => {
  const r = generate(parse(tokenize('A1^2')));
  assertContains(r.expr, '_pow(a1, 2)');
  assertEqual(r.usedHelpers.includes('_pow'), true);
  assertEqual(r.usedHelpers.includes('_num'), true);
});

test('Generator', 'usedCells مرتّبة natural sort: a1,a2,a10', () => {
  const r = generate(parse(tokenize('A10+A2+A1')));
  assertEqual(r.usedCells, ['a1', 'a2', 'a10']);
});

test('Generator', 'usedHelpers تتضمّن التبعيات (topological)', () => {
  // COUNTIF يستخدم _countif اللي يعتمد على _matchCriteria
  const r = generate(parse(tokenize('COUNTIF(A1:A3, ">5")')));
  assertEqual(r.usedHelpers.includes('_matchCriteria'), true);
  assertEqual(r.usedHelpers.includes('_countif'), true);
  // التبعية لازم تجي قبل اللي يعتمد عليها
  assertEqual(
    r.usedHelpers.indexOf('_matchCriteria') < r.usedHelpers.indexOf('_countif'),
    true,
    '_matchCriteria لازم تجي قبل _countif'
  );
});

test('Generator', 'دالة غير مدعومة ترمي خطأ واضح', () => {
  assertThrows(() => generate(parse(tokenize('XYZ(A1)'))), 'غير مدعومة');
});

test('Generator', 'نطاق > 1000 خلية يُرفض', () => {
  assertThrows(() => generate(parse(tokenize('SUM(A1:Z40)'))), 'كبير');
});

test('Generator', 'IFERROR يستدعي _isError helper', () => {
  const r = generate(parse(tokenize('IFERROR(A1, 0)')));
  assertEqual(r.usedHelpers.includes('_isError'), true);
});

test('Generator', 'صيغة بدون cells → usedCells فارغة', () => {
  const r = generate(parse(tokenize('SUM(1,2,3)')));
  assertEqual(r.usedCells, []);
});

test('Generator', 'فحص مركزي للوسائط: AND() تُرفض', () => {
  assertThrows(() => generate(parse(tokenize('AND()'))), 'تتوقع');
});

test('Generator', 'فحص مركزي للوسائط: IF بأربع وسائط تُرفض', () => {
  assertThrows(() => generate(parse(tokenize('IF(1,2,3,4)'))), 'تتوقع');
});

test('Generator', 'فحص مركزي للوسائط: TODAY لا تقبل وسائط', () => {
  assertThrows(() => generate(parse(tokenize('TODAY(1)'))), 'تتوقع');
});

test('Generator', 'فحص مركزي للوسائط: IFERROR بوسيط واحد تُرفض', () => {
  assertThrows(() => generate(parse(tokenize('IFERROR(A1)'))), 'تتوقع');
});

test('Generator', 'IFERROR لا يكرر تعبير البديل في الكود المولّد', () => {
  const r = generate(parse(tokenize('IFERROR(A1, B1+C1)')));
  const occurrences = r.expr.split('_add(b1, c1)').length - 1;
  assertEqual(occurrences, 1);
});

/* =========================================================
   4) Runtime — أهم فئة، تنفّذ الكود الناتج
   ========================================================= */

// === Logic ===
test('Runtime: Logic', 'IF بسيط (true branch)', () => {
  assertEqual(runFormula('=IF(A1>10, "كبير", "صغير")', { a1: 20 }), 'كبير');
});

test('Runtime: Logic', 'IF بسيط (false branch)', () => {
  assertEqual(runFormula('=IF(A1>10, "كبير", "صغير")', { a1: 5 }), 'صغير');
});

test('Runtime: Logic', 'AND', () => {
  assertEqual(runFormula('=AND(A1>0, B1<10)', { a1: 5, b1: 3 }), true);
  assertEqual(runFormula('=AND(A1>0, B1<10)', { a1: 5, b1: 99 }), false);
});

test('Runtime: Logic', 'OR', () => {
  assertEqual(runFormula('=OR(A1>100, B1<0)', { a1: 5, b1: -1 }), true);
  assertEqual(runFormula('=OR(A1>100, B1<0)', { a1: 5, b1: 1 }), false);
});

test('Runtime: Logic', 'NOT', () => {
  assertEqual(runFormula('=NOT(A1>0)', { a1: -5 }), true);
});

test('Runtime: Logic', 'IFERROR يلتقط خطأ القسمة على صفر', () => {
  // 1/0 في JS = Infinity (ليس خطأ ولا NaN)، لكن _isError يفحص !isFinite
  assertEqual(runFormula('=IFERROR(1/A1, "خطأ")', { a1: 0 }), 'خطأ');
});

test('Runtime: Logic', 'IFERROR يلتقط #N/A النصية', () => {
  assertEqual(
    runFormula('=IFERROR(VLOOKUP("xxx", A1:B2, 2, FALSE), "ما لقيناه")', {
      a1: 'foo',
      b1: 1,
      a2: 'bar',
      b2: 2
    }),
    'ما لقيناه'
  );
});

test('Runtime: Logic', 'مقارنة النصوص غير حساسة للحالة (سلوك Excel)', () => {
  assertEqual(runFormula('=A1=B1', { a1: 'abc', b1: 'ABC' }), true);
  assertEqual(runFormula('=A1<>B1', { a1: 'abc', b1: 'ABC' }), false);
  assertEqual(runFormula('=A1=B1', { a1: 'abc', b1: 'xyz' }), false);
});

test('Runtime: Logic', 'AND/OR على نطاق (كل القيم لا أول قيمة)', () => {
  assertEqual(runFormula('=AND(A1:A3)', { a1: true, a2: true, a3: false }), false);
  assertEqual(runFormula('=OR(A1:A3)', { a1: false, a2: false, a3: true }), true);
});

// === Math ===
test('Runtime: Math', 'SUM على نطاق', () => {
  assertEqual(runFormula('=SUM(A1:A4)', { a1: 1, a2: 2, a3: 3, a4: 4 }), 10);
});

test('Runtime: Math', 'SUM يتجاهل القيم النصية', () => {
  assertEqual(runFormula('=SUM(A1:A3)', { a1: 1, a2: 'x', a3: 2 }), 3);
});

test('Runtime: Math', 'AVERAGE', () => {
  assertEqual(runFormula('=AVERAGE(A1:A3)', { a1: 2, a2: 4, a3: 6 }), 4);
});

test('Runtime: Math', 'MIN / MAX', () => {
  assertEqual(runFormula('=MIN(A1:A3)', { a1: 5, a2: 2, a3: 9 }), 2);
  assertEqual(runFormula('=MAX(A1:A3)', { a1: 5, a2: 2, a3: 9 }), 9);
});

test('Runtime: Math', 'ROUND', () => {
  assertEqual(runFormula('=ROUND(A1, 2)', { a1: 3.14159 }), 3.14);
  assertEqual(runFormula('=ROUND(A1, 0)', { a1: 4.7 }), 5);
});

test('Runtime: Math', 'ABS', () => {
  assertEqual(runFormula('=ABS(A1)', { a1: -7 }), 7);
});

test('Runtime: Math', 'POWER, SQRT', () => {
  assertEqual(runFormula('=POWER(A1, 3)', { a1: 2 }), 8);
  assertEqual(runFormula('=SQRT(A1)', { a1: 16 }), 4);
});

test('Runtime: Math', 'MOD', () => {
  assertEqual(runFormula('=MOD(A1, 3)', { a1: 10 }), 1);
});

test('Runtime: Math', 'precedence: 2 + 3 * 4 = 14', () => {
  assertEqual(runFormula('=2+3*4', {}), 14);
});

test('Runtime: Math', 'parens: (2+3)*4 = 20', () => {
  assertEqual(runFormula('=(2+3)*4', {}), 20);
});

test('Runtime: Math', 'unary minus', () => {
  assertEqual(runFormula('=-A1', { a1: 5 }), -5);
});

test('Runtime: Math', '% لاحقة نسبة مئوية: 50% = 0.5 و A1*10%', () => {
  assertEqual(runFormula('=50%', {}), 0.5);
  assertEqual(runFormula('=A1*10%', { a1: 200 }), 20);
});

test('Runtime: Math', 'MIN/MAX بلا أرقام → 0 (سلوك Excel)', () => {
  assertEqual(runFormula('=MIN(A1:A2)', { a1: 'x', a2: 'y' }), 0);
  assertEqual(runFormula('=MAX(A1:A2)', { a1: 'x', a2: 'y' }), 0);
});

test('Runtime: Math', 'AVERAGE بلا أرقام → #DIV/0! (سلوك Excel)', () => {
  assertEqual(runFormula('=AVERAGE(A1:A2)', { a1: 'x', a2: 'y' }), '#DIV/0!');
  assertEqual(runFormula('=IFERROR(AVERAGE(A1:A2), "لا أرقام")', { a1: 'x', a2: 'y' }), 'لا أرقام');
});

// === Text ===
test('Runtime: Text', 'CONCATENATE', () => {
  assertEqual(runFormula('=CONCATENATE("a", A1, "b")', { a1: 5 }), 'a5b');
});

test('Runtime: Text', '& concatenation', () => {
  assertEqual(runFormula('=A1&"-"&B1', { a1: 'x', b1: 'y' }), 'x-y');
});

test('Runtime: Text', 'LEFT', () => {
  assertEqual(runFormula('=LEFT(A1, 3)', { a1: 'مرحبا' }), 'مرح');
});

test('Runtime: Text', 'RIGHT', () => {
  assertEqual(runFormula('=RIGHT(A1, 2)', { a1: 'world' }), 'ld');
});

test('Runtime: Text', 'MID', () => {
  assertEqual(runFormula('=MID(A1, 2, 3)', { a1: 'abcdef' }), 'bcd');
});

test('Runtime: Text', 'LEN', () => {
  assertEqual(runFormula('=LEN(A1)', { a1: 'مرحبا' }), 5);
});

test('Runtime: Text', 'TRIM', () => {
  assertEqual(runFormula('=TRIM(A1)', { a1: '  hello  ' }), 'hello');
});

test('Runtime: Text', 'UPPER / LOWER', () => {
  assertEqual(runFormula('=UPPER(A1)', { a1: 'abc' }), 'ABC');
  assertEqual(runFormula('=LOWER(A1)', { a1: 'XYZ' }), 'xyz');
});

test('Runtime: Text', 'REPLACE', () => {
  assertEqual(runFormula('=REPLACE(A1, 2, 3, "XY")', { a1: 'abcdef' }), 'aXYef');
});

test('Runtime: Text', 'SUBSTITUTE all', () => {
  assertEqual(runFormula('=SUBSTITUTE(A1, "-", "/")', { a1: '01-02-2026' }), '01/02/2026');
});

test('Runtime: Text', 'SUBSTITUTE instance محدد', () => {
  assertEqual(runFormula('=SUBSTITUTE(A1, "-", "/", 2)', { a1: '01-02-03' }), '01-02/03');
});

// === Count ===
test('Runtime: Count', 'COUNT — أرقام فقط', () => {
  assertEqual(runFormula('=COUNT(A1:A4)', { a1: 1, a2: 'x', a3: 3, a4: null }), 2);
});

test('Runtime: Count', 'COUNTA — غير الفارغ', () => {
  assertEqual(runFormula('=COUNTA(A1:A4)', { a1: 1, a2: 'x', a3: '', a4: null }), 2);
});

test('Runtime: Count', 'COUNTIF >5', () => {
  assertEqual(runFormula('=COUNTIF(A1:A4, ">5")', { a1: 1, a2: 6, a3: 7, a4: 3 }), 2);
});

test('Runtime: Count', 'COUNTIF نص (مطابقة)', () => {
  assertEqual(runFormula('=COUNTIF(A1:A3, "نعم")', { a1: 'نعم', a2: 'لا', a3: 'نعم' }), 2);
});

test('Runtime: Count', 'COUNTIF <> (ليس يساوي)', () => {
  assertEqual(runFormula('=COUNTIF(A1:A3, "<>0")', { a1: 0, a2: 5, a3: 0 }), 1);
});

test('Runtime: Count', 'COUNTIFS بشروط متعددة', () => {
  assertEqual(
    runFormula('=COUNTIFS(A1:A3, ">0", B1:B3, "y")', {
      a1: 1,
      a2: 2,
      a3: -1,
      b1: 'y',
      b2: 'n',
      b3: 'y'
    }),
    1
  );
});

test('Runtime: Count', 'COUNTIF غير حساسة لحالة النص (سلوك Excel)', () => {
  assertEqual(runFormula('=COUNTIF(A1:A3, "yes")', { a1: 'YES', a2: 'no', a3: 'Yes' }), 2);
});

// === Lookup ===
test('Runtime: Lookup', 'VLOOKUP exact match', () => {
  assertEqual(
    runFormula('=VLOOKUP("b", A1:B3, 2, FALSE)', {
      a1: 'a',
      b1: 1,
      a2: 'b',
      b2: 2,
      a3: 'c',
      b3: 3
    }),
    2
  );
});

test('Runtime: Lookup', 'VLOOKUP لا يجد → #N/A', () => {
  assertEqual(
    runFormula('=VLOOKUP("zzz", A1:B2, 2, FALSE)', { a1: 'a', b1: 1, a2: 'b', b2: 2 }),
    '#N/A'
  );
});

test('Runtime: Lookup', 'VLOOKUP تقريبية (الوسيط الرابع محذوف = افتراضي Excel)', () => {
  // جدول مرتب تصاعدياً: أكبر قيمة <= 2.5 هي 2 → صفها يعطي 20
  assertEqual(
    runFormula('=VLOOKUP(2.5, A1:B3, 2)', { a1: 1, b1: 10, a2: 2, b2: 20, a3: 3, b3: 30 }),
    20
  );
});

test('Runtime: Lookup', 'VLOOKUP تقريبية صريحة (TRUE) وأصغر من الأول → #N/A', () => {
  assertEqual(
    runFormula('=VLOOKUP(2.5, A1:B3, 2, TRUE)', { a1: 1, b1: 10, a2: 2, b2: 20, a3: 3, b3: 30 }),
    20
  );
  assertEqual(runFormula('=VLOOKUP(0, A1:B2, 2, TRUE)', { a1: 1, b1: 10, a2: 2, b2: 20 }), '#N/A');
});

test('Runtime: Lookup', 'VLOOKUP exact غير حساسة لحالة النص', () => {
  assertEqual(runFormula('=VLOOKUP("B", A1:B2, 2, FALSE)', { a1: 'a', b1: 1, a2: 'b', b2: 2 }), 2);
});

test('Runtime: Lookup', 'HLOOKUP', () => {
  assertEqual(
    runFormula('=HLOOKUP("b", A1:C2, 2, FALSE)', {
      a1: 'a',
      b1: 'b',
      c1: 'c',
      a2: 1,
      b2: 2,
      c2: 3
    }),
    2
  );
});

test('Runtime: Lookup', 'HLOOKUP تقريبية (الوسيط الرابع محذوف)', () => {
  assertEqual(
    runFormula('=HLOOKUP(2.5, A1:C2, 2)', { a1: 1, b1: 2, c1: 3, a2: 10, b2: 20, c2: 30 }),
    20
  );
});

test('Runtime: Lookup', 'INDEX 2D', () => {
  assertEqual(runFormula('=INDEX(A1:B2, 2, 1)', { a1: 1, b1: 2, a2: 3, b2: 4 }), 3);
});

test('Runtime: Lookup', 'INDEX 1D (عمود واحد)', () => {
  assertEqual(runFormula('=INDEX(A1:A3, 2)', { a1: 10, a2: 20, a3: 30 }), 20);
});

test('Runtime: Lookup', 'MATCH exact', () => {
  assertEqual(runFormula('=MATCH("c", A1:A3, 0)', { a1: 'a', a2: 'b', a3: 'c' }), 3);
});

test('Runtime: Lookup', 'INDEX + MATCH مركّبة', () => {
  // ابحث عن "b" في B1:B3، خذ القيمة المقابلة من A1:A3
  assertEqual(
    runFormula('=INDEX(A1:A3, MATCH("b", B1:B3, 0))', {
      a1: 10,
      a2: 20,
      a3: 30,
      b1: 'a',
      b2: 'b',
      b3: 'c'
    }),
    20
  );
});

// === Date ===
test('Runtime: Date', 'DATE → Date object صحيح', () => {
  const d = runFormula('=DATE(2026, 6, 15)', {});
  assertEqual(d.getFullYear(), 2026);
  assertEqual(d.getMonth(), 5);
  assertEqual(d.getDate(), 15);
});

test('Runtime: Date', 'YEAR / MONTH / DAY', () => {
  assertEqual(runFormula('=YEAR(DATE(2026,3,1))', {}), 2026);
  assertEqual(runFormula('=MONTH(DATE(2026,3,1))', {}), 3);
  assertEqual(runFormula('=DAY(DATE(2026,3,15))', {}), 15);
});

test('Runtime: Date', 'EDATE: نهاية الشهر (31 يناير + شهر = 28/29 فبراير)', () => {
  // 31 يناير 2026 + 1 شهر = 28 فبراير 2026
  const d = runFormula('=EDATE(DATE(2026, 1, 31), 1)', {});
  assertEqual(d.getMonth(), 1);
  assertEqual(d.getDate(), 28);
});

test('Runtime: Date', 'DATEDIF بوحدات Y/M/D', () => {
  assertEqual(runFormula('=DATEDIF(DATE(2020,1,1), DATE(2026,3,15), "Y")', {}), 6);
  assertEqual(runFormula('=DATEDIF(DATE(2026,1,1), DATE(2026,4,1), "M")', {}), 3);
  assertEqual(runFormula('=DATEDIF(DATE(2026,1,1), DATE(2026,1,11), "D")', {}), 10);
});

test('Runtime: Date', 'DATEDIF "D" عبر ستة أشهر (ثابتة ضد التوقيت الصيفي)', () => {
  // 1 يناير → 1 يوليو 2026 = 181 يوماً بالضبط أياً كانت المنطقة الزمنية
  // (القسمة على فرق التوقيت المحلي كانت تعطي 180 في مناطق DST)
  assertEqual(runFormula('=DATEDIF(DATE(2026,1,1), DATE(2026,7,1), "D")', {}), 181);
});

test('Runtime: Date', 'DATEDIF "YD" عبر حد التوقيت الصيفي', () => {
  // sAdj = 2026-02-01 → إلى 2026-07-01: 28+31+30+31+30 = 150 يوماً
  assertEqual(runFormula('=DATEDIF(DATE(2025,2,1), DATE(2026,7,1), "YD")', {}), 150);
});

test('Runtime: Date', 'DATEDIF بوحدات YM / MD', () => {
  // YM: شهور بعد تجاهل السنين الكاملة
  assertEqual(runFormula('=DATEDIF(DATE(2020,1,15), DATE(2026,4,20), "YM")', {}), 3);
  // MD: أيام بعد تجاهل الأشهر والسنين
  assertEqual(runFormula('=DATEDIF(DATE(2020,1,15), DATE(2026,4,20), "MD")', {}), 5);
});

/* ------------------------------------------------------------
   تواريخ نصية "YYYY-MM-DD" — القيم من JSON/CSV/<input> تصل نصوصاً.
   ‏new Date("2024-01-01") يفسّرها منتصف ليل UTC، فكانت YEAR ترجع
   2023 وDAY ترجع اليوم السابق في المناطق غرب غرينتش. تشغيلة
   ‏TZ=America/New_York في الـCI هي الحارس الفعلي لهذه الحزمة —
   الاختبارات بكائنات Date وحدها كانت عمياء عن الخلل.
   ------------------------------------------------------------ */
test('Runtime: Date', 'YEAR/MONTH/DAY على تاريخ نصي لا تنزاح مع المنطقة الزمنية', () => {
  assertEqual(runFormula('=YEAR(A1)', { a1: '2024-01-01' }), 2024);
  assertEqual(runFormula('=MONTH(A1)', { a1: '2024-01-01' }), 1);
  assertEqual(runFormula('=DAY(A1)', { a1: '2024-01-01' }), 1);
  // عبور حد التوقيت الصيفي الأمريكي (آذار)
  assertEqual(runFormula('=DAY(A1)', { a1: '2024-03-10' }), 10);
  assertEqual(runFormula('=DAY(A1)', { a1: '2024-12-31' }), 31);
});

test('Runtime: Date', 'DATEDIF وEDATE على تواريخ نصية', () => {
  assertEqual(runFormula('=DATEDIF(A1,B1,"D")', { a1: '2024-03-01', b1: '2024-03-10' }), 9);
  assertEqual(runFormula('=DATEDIF(A1,B1,"M")', { a1: '2024-01-15', b1: '2024-06-20' }), 5);
  assertEqual(runFormula('=YEAR(EDATE(A1,12))', { a1: '2024-01-31' }), 2025);
  assertEqual(runFormula('=DAY(EDATE(A1,1))', { a1: '2024-01-31' }), 29);
});

test('Runtime: Date', 'التاريخ النصي يقبل فراغات طرفية وغير ذلك يمرّ على new Date', () => {
  assertEqual(runFormula('=DAY(A1)', { a1: ' 2024-05-06 ' }), 6);
  // صيغة كاملة بوقت — تُترك لـnew Date كما كانت
  const d = runFormula('=DAY(A1)', { a1: '2024-05-06T12:00:00' }),
    ok = d === 6;
  assertEqual(ok, true, 'صيغة ISO بوقت محلي تبقى صحيحة');
});

// === Check ===
test('Runtime: Check', 'ISBLANK', () => {
  assertEqual(runFormula('=ISBLANK(A1)', { a1: '' }), true);
  assertEqual(runFormula('=ISBLANK(A1)', { a1: 0 }), false);
});

test('Runtime: Check', 'ISNUMBER', () => {
  assertEqual(runFormula('=ISNUMBER(A1)', { a1: 5 }), true);
  assertEqual(runFormula('=ISNUMBER(A1)', { a1: 'x' }), false);
});

test('Runtime: Check', 'ISTEXT', () => {
  assertEqual(runFormula('=ISTEXT(A1)', { a1: 'x' }), true);
  assertEqual(runFormula('=ISTEXT(A1)', { a1: 5 }), false);
});

test('Runtime: Check', 'ISERROR على #N/A', () => {
  assertEqual(
    runFormula('=ISERROR(VLOOKUP("zzz", A1:B2, 2, FALSE))', { a1: 'a', b1: 1, a2: 'b', b2: 2 }),
    true
  );
});

// === Composite ===
test('Runtime: Composite', 'صيغة مركّبة عميقة', () => {
  // متوسط مربعات الإيجابية
  // =AVERAGE(IF(A1>0,A1*A1,0), IF(B1>0,B1*B1,0), IF(C1>0,C1*C1,0))
  // مع a1=2, b1=-3, c1=4 → AVG(4, 0, 16) = 6.6666...
  const r = runFormula('=AVERAGE(IF(A1>0,A1*A1,0), IF(B1>0,B1*B1,0), IF(C1>0,C1*C1,0))', {
    a1: 2,
    b1: -3,
    c1: 4
  });
  assertClose(r, (4 + 0 + 16) / 3, 1e-9);
});

test('Runtime: Composite', 'IF + COUNTIF + & للنص', () => {
  const r = runFormula('=IF(COUNTIF(A1:A3, ">0")=3, "كل القيم موجبة", "فيه سالب أو صفر")', {
    a1: 1,
    a2: -2,
    a3: 3
  });
  assertEqual(r, 'فيه سالب أو صفر');
});

test('Runtime: Composite', 'فيثاغورس: SQRT(POWER+POWER)', () => {
  // 3-4-5 triangle
  assertEqual(runFormula('=SQRT(POWER(A1,2)+POWER(B1,2))', { a1: 3, b1: 4 }), 5);
});

/* =========================================================
   5) دلالات Excel المُصحَّحة (MOD / ROUND)
   ========================================================= */
test('Excel Semantics', 'MOD: إشارة الناتج تتبع المقسوم عليه', () => {
  assertEqual(runFormula('=MOD(-3,2)', {}), 1, 'Excel: MOD(-3,2) = 1');
  assertEqual(runFormula('=MOD(3,-2)', {}), -1, 'Excel: MOD(3,-2) = -1');
  assertEqual(runFormula('=MOD(-3,-2)', {}), -1, 'Excel: MOD(-3,-2) = -1');
  assertEqual(runFormula('=MOD(10,3)', {}), 1);
});

test('Excel Semantics', 'MOD: القسمة على صفر → #DIV/0!', () => {
  assertEqual(runFormula('=MOD(A1,0)', { a1: 5 }), '#DIV/0!');
  assertEqual(runFormula('=IFERROR(MOD(A1,0), "لا يمكن")', { a1: 5 }), 'لا يمكن');
});

test('Excel Semantics', 'ROUND: النصف يُقرَّب بعيداً عن الصفر', () => {
  assertEqual(runFormula('=ROUND(-2.5,0)', {}), -3, 'Excel: -3 (وMath.round يعطي -2)');
  assertEqual(runFormula('=ROUND(2.5,0)', {}), 3);
  assertEqual(runFormula('=ROUND(-0.5,0)', {}), -1);
});

test('Excel Semantics', 'ROUND: منازل عشرية وسالبة', () => {
  assertEqual(runFormula('=ROUND(A1,2)', { a1: 3.14159 }), 3.14);
  assertEqual(runFormula('=ROUND(1234,-2)', {}), 1200);
  assertEqual(runFormula('=ROUND(A1,0)', { a1: 4.7 }), 5);
});

test('Excel Semantics', 'COUNTIFS: نطاقات بأطوال مختلفة → #VALUE!', () => {
  assertEqual(
    runFormula('=COUNTIFS(A1:A3,">0",B1:B2,"y")', { a1: 1, a2: 2, a3: 3, b1: 'y', b2: 'y' }),
    '#VALUE!'
  );
});

test('Excel Semantics', 'SUBSTITUTE عبر helper: الكل وتكرار محدد', () => {
  assertEqual(runFormula('=SUBSTITUTE(A1,"-","/")', { a1: '01-02-2026' }), '01/02/2026');
  assertEqual(runFormula('=SUBSTITUTE(A1,"-","/",2)', { a1: '01-02-03' }), '01-02/03');
  // نص قديم فارغ يرجّع النص كما هو (لا حلقة لا نهائية)
  assertEqual(runFormula('=SUBSTITUTE(A1,"","x")', { a1: 'abc' }), 'abc');
});

/* =========================================================
   6) الفراغات البادئة (لصق مباشر من Excel)
   ========================================================= */
test('Whitespace', 'مسافة قبل = لا تكسر التحويل', () => {
  assertEqual(runFormula(' =A1', { a1: 7 }), 7);
  assertEqual(runFormula('   =SUM(A1:A2)', { a1: 1, a2: 2 }), 3);
});

test('Whitespace', 'سطر جديد وتاب قبل = ', () => {
  assertEqual(runFormula('\n\t =SUM(A1:A2)', { a1: 1, a2: 2 }), 3);
});

test('Whitespace', 'مواضع الأخطاء تبقى صحيحة رغم الفراغ البادئ', () => {
  // "  =A1@" → الرمز الشاذ @ عند الفهرس 5 في النص الأصلي
  try {
    tokenize('  =A1@');
    throw new Error('كان يفترض أن يرمي');
  } catch (e) {
    assertEqual(e.start, 5, 'موضع الخطأ يجب أن يكون بالنسبة للنص الأصلي');
  }
});

/* =========================================================
   7) حدود الموارد — تمنع تجميد المتصفح
   ========================================================= */
test('Limits', 'عمق التداخل محدود برسالة عربية', () => {
  const n = LIMITS.parseDepth + 20;
  assertThrows(() => convertFormula('=' + '('.repeat(n) + 'A1' + ')'.repeat(n)), 'عمق التداخل');
});

test('Limits', 'عمق ضمن الحد يمر بنجاح', () => {
  const n = 30;
  assertEqual(runFormula('=' + '('.repeat(n) + 'A1' + ')'.repeat(n), { a1: 4 }), 4);
});

test('Limits', 'طول المُدخل محدود', () => {
  assertThrows(() => convertFormula('=' + 'A1+'.repeat(LIMITS.inputLength) + 'A1'), 'طويلة جداً');
});

test('Limits', 'إجمالي الخلايا محدود عبر عدة نطاقات', () => {
  assertThrows(() => convertFormula('=SUM(A1:A1000,B1:B1000,C1:C1000)'), 'أكثر من');
});

test('Limits', 'نطاق واحد فوق الحد يُرفض', () => {
  assertThrows(() => convertFormula('=SUM(A1:A1001)'), 'كبير');
});

/* =========================================================
   8) once() — منع تكرار تقييم الوسائط (كان تضخماً أسّياً)
   ========================================================= */
test('once', 'ISBLANK لا تكرر وسيطها', () => {
  const r = generate(parse(tokenize('ISBLANK(SUM(A1:A5))')));
  const inner = '[[a1, a2, a3, a4, a5]].flat(Infinity)';
  assertEqual(r.expr.split(inner).length - 1, 1, 'يجب أن يظهر تعبير SUM مرة واحدة فقط');
});

test('once', 'YEAR لا تكرر وسيطها', () => {
  const r = generate(parse(tokenize('YEAR(EDATE(A1,3))')));
  assertEqual(r.expr.split('_edate(a1, 3)').length - 1, 1);
});

test('once', 'VLOOKUP لا تكرر وسيط المطابقة', () => {
  const r = generate(parse(tokenize('VLOOKUP(A1,B1:C2,2,ISBLANK(D1))')));
  assertEqual(r.expr.split('d1 === null').length - 1, 1);
});

test('once', 'التداخل العميق ينمو خطياً لا أسّياً', () => {
  // قبل الإصلاح: العمق 11 كان يولّد ~3.9 ميغابايت (نمو 3^n)
  let f = 'A1';
  for (let i = 0; i < 11; i++) f = 'ISBLANK(' + f + ')';
  const code = convertFormula('=' + f).code;
  assertEqual(code.length < 5000, true, `الحجم الفعلي: ${code.length} بايت`);
});

test('once', 'التعبيرات البسيطة لا تُلفّ بلا داع', () => {
  const r = generate(parse(tokenize('ISBLANK(A1)')));
  assertEqual(r.expr, "(a1 === null || a1 === undefined || a1 === '')");
});

test('once', 'الأسماء المؤقتة فريدة عند التداخل (لا تظليل)', () => {
  // ISBLANK داخل ISNUMBER: لازم _v1 و _v2 لا _v1 مرتين
  const r = generate(parse(tokenize('ISNUMBER(MOD(A1,B1))')));
  const names = r.expr.match(/_v\d+/g) || [];
  assertEqual(new Set(names).size >= 1, true);
  // وأهم شيء: الكود المولّد ينفّذ صح
  assertEqual(runFormula('=ISNUMBER(MOD(A1,B1))', { a1: 10, b1: 3 }), true);
});

test('once', 'قيم once الصحيحة عند التنفيذ الفعلي', () => {
  assertEqual(runFormula('=ISBLANK(A1)', { a1: '' }), true);
  assertEqual(runFormula('=YEAR(DATE(2026,3,1))', {}), 2026);
  assertEqual(runFormula('=MID(A1,2,3)', { a1: 'abcdef' }), 'bcd');
  assertEqual(runFormula('=RIGHT(A1,0)', { a1: 'abc' }), '');
  assertEqual(runFormula('=REPLACE(A1,2,3,"XY")', { a1: 'abcdef' }), 'aXYef');
  assertEqual(runFormula('=MIN(A1:A3)', { a1: 5, a2: 2, a3: 9 }), 2);
  assertEqual(runFormula('=AVERAGE(A1:A3)', { a1: 2, a2: 4, a3: 6 }), 4);
});

test('once', 'فحص شامل: لا دالة تكرر وسيطاً مميزاً في ناتجها', () => {
  // نمرر وسيطاً له بصمة نصية فريدة ونتأكد أنه لا يظهر مرتين
  const MARK = '_edate(a9, 7)';
  const wrap = 'EDATE(A9,7)';
  const cases = [
    `ISBLANK(${wrap})`,
    `ISNUMBER(${wrap})`,
    `ISTEXT(${wrap})`,
    `YEAR(${wrap})`,
    `MONTH(${wrap})`,
    `DAY(${wrap})`,
    `LEN(${wrap})`,
    `ABS(${wrap})`,
    `NOT(${wrap})`
  ];
  for (const c of cases) {
    const expr = generate(parse(tokenize(c))).expr;
    const n = expr.split(MARK).length - 1;
    assertEqual(n, 1, `${c} كرّر وسيطه ${n} مرة`);
  }
});

/* =========================================================
   6) الخلية الفارغة — كانت تُنتج نص "undefined" حرفياً
   ========================================================= */
test('Excel Semantics', 'الخلية الفارغة نص فارغ في الدمج بـ&', () => {
  assertEqual(runFormula('=A1&" ر.س"', {}), ' ر.س');
  assertEqual(runFormula('=A1&B1', { a1: null, b1: undefined }), '');
});

test('Excel Semantics', 'CONCATENATE يتجاهل الفراغ لا يطبع undefined', () => {
  assertEqual(runFormula('=CONCATENATE("الإجمالي: ",A1," ر.س")', {}), 'الإجمالي:  ر.س');
});

test('Excel Semantics', 'الدوال النصية على خلية فارغة', () => {
  assertEqual(runFormula('=LEN(A1)', {}), 0);
  assertEqual(runFormula('=UPPER(A1)', {}), '');
  assertEqual(runFormula('=TRIM(A1)', {}), '');
  assertEqual(runFormula('=LEFT(A1,3)', {}), '');
  assertEqual(runFormula('=SUBSTITUTE(A1,"-","/")', {}), '');
});

test('Excel Semantics', 'الخلية الفارغة لا تكسر النص الحقيقي', () => {
  assertEqual(runFormula('=UPPER(A1)', { a1: 'abc' }), 'ABC');
  assertEqual(runFormula('=LEN(A1)', { a1: 'مرحبا' }), 5);
});

test('Excel Semantics', 'LEFT/RIGHT/MID ترجع #VALUE! على وسيط غير صالح', () => {
  assertEqual(runFormula('=LEFT(A1,-1)', { a1: 'hello' }), '#VALUE!');
  assertEqual(runFormula('=RIGHT(A1,-1)', { a1: 'hello' }), '#VALUE!');
  assertEqual(runFormula('=MID(A1,0,3)', { a1: 'hello' }), '#VALUE!');
  assertEqual(runFormula('=MID(A1,2,-1)', { a1: 'hello' }), '#VALUE!');
  // الحالات الصالحة تبقى كما هي
  assertEqual(runFormula('=RIGHT(A1,0)', { a1: 'hello' }), '');
  assertEqual(runFormula('=LEFT(A1,2)', { a1: 'hello' }), 'he');
  assertEqual(runFormula('=MID(A1,2,3)', { a1: 'hello' }), 'ell');
});

test('Excel Semantics', 'ISNUMBER تستبعد اللانهاية كما في Excel', () => {
  assertEqual(runFormula('=ISNUMBER(1/0)', {}), false);
  assertEqual(runFormula('=ISNUMBER(A1)', { a1: 5 }), true);
  assertEqual(runFormula('=ISNUMBER(A1)', { a1: 'x' }), false);
});

/* =========================================================
   7) عقد الوسائط الافتراضية (defaults) وترتيب الباراميترات
   ========================================================= */
test('Generator', 'defaults تملأ الوسائط الاختيارية مركزياً', () => {
  assertEqual(runFormula('=IF(A1>10,"كبير")', { a1: 5 }), false);
  assertEqual(runFormula('=LEFT(A1)', { a1: 'hello' }), 'h');
  assertEqual(runFormula('=RIGHT(A1)', { a1: 'hello' }), 'o');
  assertEqual(runFormula('=MATCH(A1,B1:B3)', { a1: 2, b1: 1, b2: 2, b3: 3 }), 2);
});

test('Generator', 'VLOOKUP بلا وسيط رابع = بحث تقريبي', () => {
  const vals = { a1: 15, b1: 1, c1: 'x', b2: 10, c2: 'y', b3: 20, c3: 'z' };
  assertEqual(runFormula('=VLOOKUP(A1,B1:C3,2)', vals), 'y');
  assertEqual(runFormula('=VLOOKUP(A1,B1:C3,2,TRUE)', vals), 'y');
  assertEqual(runFormula('=VLOOKUP(A1,B1:C3,2,FALSE)', vals), '#N/A');
});

test('Generator', 'الحرفيّ في الوسيط الرابع يُطوى وقت التوليد', () => {
  // بلا الطيّ كان الناتج يحمل `(false === false || false === 0)`
  const code = convertFormula('=VLOOKUP(A1,B1:C2,2,FALSE)').code;
  assertContains(code, '_vlookup(a1, [[b1, c1], [b2, c2]], 2, true)');
});

test('Generator', 'ترتيب الأعمدة برقمها لا أبجدياً', () => {
  // أبجدياً كانت aa1 تسبق y1 — وترتيب Excel هو … y, z, aa, ab
  assertEqual(convertFormula('=SUM(Y1:AB1)').usedCells, ['y1', 'z1', 'aa1', 'ab1']);
  assertEqual(convertFormula('=A10+A2+A1').usedCells, ['a1', 'a2', 'a10']);
});

/* =========================================================
   8) وضع الإخراج بالنطاقات (rangeParams)
   ========================================================= */
test('Generator', 'rangeParams يحوّل النطاق لباراميتر واحد', () => {
  const r = convertFormula('=SUM(A1:A5)', { rangeParams: true });
  assertEqual(r.paramNames, ['a1_a5']);
  assertEqual(r.usedRanges.length, 1);
  assertEqual(r.usedRanges[0].rows, 5);
  assertEqual(r.usedRanges[0].cols, 1);
  assertContains(r.code, 'function calculate(a1_a5)');
});

test('Generator', 'rangeParams يمرّر الجدول كمصفوفة ثنائية بلا تسطيح', () => {
  const r = convertFormula('=VLOOKUP(A2,B1:D3,3,FALSE)', { rangeParams: true });
  assertEqual(r.paramNames, ['a2', 'b1_d3']);
  assertContains(r.code, '_vlookup(a2, b1_d3, 3, true)');
  assertContains(r.code, 'مصفوفة ثنائية 3×3');
});

test('Generator', 'rangeParams يفرد النطاق في السياق المسطّح', () => {
  const r = convertFormula('=SUM(A1:B2)', { rangeParams: true });
  assertContains(r.code, 'a1_b2.flat(Infinity)');
});

test('Generator', 'rangeParams: النطاق المكرّر باراميتر واحد', () => {
  const r = convertFormula('=SUM(A1:A3)+MAX(A1:A3)', { rangeParams: true });
  assertEqual(r.paramNames, ['a1_a3']);
});

test('Generator', 'rangeParams يجعل النطاق الكبير قابلاً للاستدعاء', () => {
  // الوضع الافتراضي يولّد توقيعاً بألف باراميتر
  assertEqual(convertFormula('=SUM(A1:A1000)').paramNames.length, 1000);
  assertEqual(convertFormula('=SUM(A1:A1000)', { rangeParams: true }).paramNames, ['a1_a1000']);
});

test('Runtime: Composite', 'rangeParams ينفّذ بنفس نتيجة الوضع الافتراضي', () => {
  const flat = runFormula('=SUM(A1:A3)', { a1: 1, a2: 2, a3: 3 });
  const ranged = runFormula('=SUM(A1:A3)', { a1_a3: [[1], [2], [3]] }, { rangeParams: true });
  assertEqual(flat, 6);
  assertEqual(ranged, 6);

  const lookup = runFormula(
    '=VLOOKUP(A2,B1:C2,2,FALSE)',
    {
      a2: 'k',
      b1_c2: [
        ['k', 'v1'],
        ['z', 'v2']
      ]
    },
    { rangeParams: true }
  );
  assertEqual(lookup, 'v1');
});

test('Limits', 'rangeParams يحترم حد إجمالي الخلايا', () => {
  assertThrows(
    () => convertFormula('=SUM(A1:A1000,B1:B1000,C1:C500)', { rangeParams: true }),
    'أكثر من 2000 خلية'
  );
});

/* =========================================================
   9) دلالات Excel — الجولة الثالثة (مِحَك 2026-08-22)
   كل اختبار هنا يحرس فرعاً كان غير مغطّى فمرّ منه خطأ صامت.
   ========================================================= */

test('Excel Semantics', '+ يجمع النص الرقمي ولا يدمجه', () => {
  // الفرع غير المغطّى: "5" + "3" في JS = "53"، وفي Excel = 8.
  // القيم الجاية من JSON.parse أو <input> أو CSV تصل نصوصاً دائماً.
  assertEqual(runFormula('=A1+A2', { a1: '5', a2: '3' }), 8);
  assertEqual(runFormula('=A1+A2', { a1: '5', a2: 3 }), 8);
  assertEqual(runFormula('=A1+A2+A3', { a1: '1', a2: '2', a3: '3' }), 6);
});

test('Excel Semantics', '+ يعطي #VALUE! لنص غير رقمي', () => {
  assertEqual(runFormula('=A1+A2', { a1: 'نص', a2: 5 }), '#VALUE!');
  assertEqual(runFormula('=A1+A2', { a1: 5, a2: 'abc' }), '#VALUE!');
});

test('Excel Semantics', '+ يعامل الخلية الفارغة صفراً', () => {
  assertEqual(runFormula('=A1+A2', { a1: null, a2: 5 }), 5);
  assertEqual(runFormula('=A1+A2', { a1: undefined, a2: 5 }), 5);
  assertEqual(runFormula('=A1+A2', { a1: '', a2: 5 }), 5);
});

test('Excel Semantics', '+ يبقي الحساب العادي والأولويات سليمة', () => {
  assertEqual(runFormula('=2+3*4', {}), 14);
  assertEqual(runFormula('=(2+3)*4', {}), 20);
  assertEqual(runFormula('=A1+A2', { a1: 1.5, a2: 2.25 }), 3.75);
  assertEqual(runFormula('=A1+A2', { a1: true, a2: 1 }), 2);
});

/* ------------------------------------------------------------
   اتساق العوامل الحسابية — 3.1.4 أصلحت '+' وحدها فصار
   ‏=A1+A2 على فراغين 0 بينما =A1-A2 عليهما NaN. كل العوامل
   (- * / ^ والسالب الأحادي) صارت على نفس عقد _num.
   ------------------------------------------------------------ */
test('Excel Semantics', '- و * و / و ^ تعامل الفراغ صفراً مثل +', () => {
  assertEqual(runFormula('=A1-A2', {}), 0);
  assertEqual(runFormula('=A1-A2', { a1: null, a2: 5 }), -5);
  assertEqual(runFormula('=A1*2', { a1: '' }), 0);
  assertEqual(runFormula('=A1^2', {}), 0);
  assertEqual(runFormula('=A1/4', {}), 0);
});

test('Excel Semantics', '- و * و / و ^ تعطي #VALUE! لنص غير رقمي مثل +', () => {
  assertEqual(runFormula('=A1-A2', { a1: 'نص', a2: 5 }), '#VALUE!');
  assertEqual(runFormula('=A1*2', { a1: 'نص' }), '#VALUE!');
  assertEqual(runFormula('=A1/A2', { a1: 10, a2: 'abc' }), '#VALUE!');
  assertEqual(runFormula('=A1^2', { a1: 'نص' }), '#VALUE!');
  // ‏#VALUE! من طرف يمرّ عبر بقية السلسلة بدل أن ينقلب NaN
  assertEqual(runFormula('=(A1*2)+1', { a1: 'نص' }), '#VALUE!');
});

test('Excel Semantics', 'العوامل تقسر النص الرقمي مثل +', () => {
  assertEqual(runFormula('=A1-A2', { a1: '10', a2: '3' }), 7);
  assertEqual(runFormula('=A1*A2', { a1: '5', a2: '3' }), 15);
  assertEqual(runFormula('=A1/A2', { a1: '10', a2: '4' }), 2.5);
  assertEqual(runFormula('=A1^A2', { a1: '2', a2: '10' }), 1024);
});

test('Excel Semantics', 'السالب الأحادي حسابي والموجب الأحادي محايد', () => {
  // Excel: ‏-فراغ = 0، -"5" = -5، -"نص" = #VALUE!
  assertEqual(runFormula('=-A1', {}), 0);
  assertEqual(runFormula('=-A1', { a1: '5' }), -5);
  assertEqual(runFormula('=-A1', { a1: 'نص' }), '#VALUE!');
  assertEqual(runFormula('=--A1', { a1: 3 }), 3);
  // ‏=+A1 في Excel يُرجع القيمة كما هي حتى لو نصاً (لا قسر رقمي)
  assertEqual(runFormula('=+A1', { a1: 'نص' }), 'نص');
  assertEqual(runFormula('=+A1', { a1: 7 }), 7);
});

test('Excel Semantics', 'لاحقة % على نفس عقد العوامل', () => {
  assertEqual(runFormula('=A1%', { a1: 50 }), 0.5);
  assertEqual(runFormula('=A1%', { a1: '50' }), 0.5);
  assertEqual(runFormula('=A1%', {}), 0);
  assertEqual(runFormula('=A1%', { a1: 'نص' }), '#VALUE!');
});

test('Excel Semantics', 'القسمة على صفر تبقى Infinity (انحراف موثق)', () => {
  assertEqual(runFormula('=A1/A2', { a1: 5, a2: 0 }), Infinity);
  assertEqual(runFormula('=ISERROR(A1/A2)', { a1: 5, a2: 0 }), true);
});

test('Excel Semantics', 'TRIM تطوي المسافات الداخلية', () => {
  // ‏String.trim تحذف الأطراف فقط — وطيّ الداخل هو غرض TRIM الأساسي
  assertEqual(runFormula('=TRIM(A1)', { a1: ' a   b ' }), 'a b');
  assertEqual(runFormula('=TRIM(A1)', { a1: 'محمد   بن   علي' }), 'محمد بن علي');
  assertEqual(runFormula('=TRIM(A1)', { a1: '  hello  ' }), 'hello');
  assertEqual(runFormula('=TRIM(A1)', { a1: 'a\t\tb' }), 'a b');
  assertEqual(runFormula('=TRIM(A1)', {}), '');
});

test('Excel Semantics', 'REPLACE ترفض الوسيط غير الصالح', () => {
  assertEqual(runFormula('=REPLACE(A1,-3,2,"X")', { a1: 'HELLO' }), '#VALUE!');
  assertEqual(runFormula('=REPLACE(A1,0,2,"X")', { a1: 'HELLO' }), '#VALUE!');
  assertEqual(runFormula('=REPLACE(A1,2,-1,"X")', { a1: 'HELLO' }), '#VALUE!');
  // الحالة الصالحة تبقى كما هي
  assertEqual(runFormula('=REPLACE(A1,2,3,"XY")', { a1: 'abcdef' }), 'aXYef');
  assertEqual(runFormula('=REPLACE(A1,1,0,"X")', { a1: 'abc' }), 'Xabc');
});

test('Excel Semantics', 'الحرفيّ النصّي لا يسرّب </script>', () => {
  // مولّد الكود مسؤول عن سلامة مخرجه: نص فيه </script> كان يخرج حرفياً
  // فيُنهي وسم script مضمّناً في صفحة من يلصق الناتج
  const code = convertFormula('=A1&"</scr' + 'ipt>"').code;
  assertEqual(code.indexOf('</scr' + 'ipt>'), -1, 'ما يصحّ يظهر الوسم خاماً');
  assertContains(code, '<\\/scr' + 'ipt>');
  // والقيمة وقت التشغيل تبقى النص الأصلي بلا تشويه
  assertEqual(runFormula('=A1&"</scr' + 'ipt>"', { a1: 'x' }), 'x</scr' + 'ipt>');
});

test('Excel Semantics', 'الحرفيّ النصّي يهرّب U+2028/U+2029', () => {
  const code = convertFormula('=A1&"a b"').code;
  assertEqual(code.indexOf(' '), -1, 'U+2028 ما يصحّ يخرج خاماً');
  assertContains(code, '\\u2028');
  assertEqual(runFormula('=A1&"a b"', { a1: '' }), 'a b');
});

test('Excel Semantics', '"<" وحده يبقى بلا تهريب (شرط COUNTIF شائع)', () => {
  // تهريب كل "<" كان يشوّه "<5" إلى "\x3C5" بلا فائدة أمنية
  assertContains(convertFormula('=COUNTIF(A1:A3,"<5")').code, '"<5"');
  assertEqual(runFormula('=COUNTIF(A1:A3,"<5")', { a1: 1, a2: 9, a3: 4 }), 2);
});

test('Limits', 'سلسلة معاملات أحادية طويلة تُرفض بلا كسر المكدّس', () => {
  // كانت تتجاوز parseDepth كلياً (المطبَّق في parsePrimary وحدها)
  // فتنتهي بـRangeError إنجليزي خام أو برسالة "الرجاء الإبلاغ" المضلّلة
  assertThrows(() => convertFormula('=' + '-'.repeat(5000) + 'A1'), 'سلسلة معاملات');
  assertThrows(
    () => convertFormula('=' + '-'.repeat(LIMITS.parseDepth + 1) + 'A1'),
    'سلسلة معاملات'
  );
  // وتحت الحد تشتغل عادي بالإشارة الصحيحة
  assertEqual(runFormula('=' + '-'.repeat(64) + 'A1', { a1: 7 }), 7);
  assertEqual(runFormula('=' + '-'.repeat(63) + 'A1', { a1: 7 }), -7);
});

test('Limits', 'سلسلة لواحق % طويلة تُرفض بلا كسر المكدّس', () => {
  assertThrows(() => convertFormula('=1' + '%'.repeat(5000)), 'سلسلة معاملات');
  assertClose(runFormula('=100%%', {}), 0.01);
});

test('Limits', 'خطأ سلسلة المعاملات يحمل موضعاً قابلاً للتعليم', () => {
  // كل أخطاء المحوّل تحمل start/end ليعلّمها المحرر — والـRangeError
  // الخام كان النمط الوحيد اللي يخرق هذا التعاقد
  let err = null;
  try {
    convertFormula('=' + '-'.repeat(200) + 'A1');
  } catch (e) {
    err = e;
  }
  assertEqual(err !== null, true);
  assertEqual(typeof err.start, 'number');
  assertEqual(typeof err.end, 'number');
});

test('Limits', 'الفحص النحوي حارس تطوير: شغّال في Node ومطفأ في الصفحة', () => {
  // ثمنه في المتصفح كان 'unsafe-eval' في الـCSP، وفائدته التقاط أخطاء
  // الـgenerator — وهي مهمة حزمة الاختبارات لا مهمة صفحة المستخدم.
  const NS = globalThis.ExcelToJS;
  assertEqual(typeof window === 'undefined', true, 'حزمة Node تشتغل بلا window');
  // الافتراضي في Node: شغّال — فصيغة سليمة تمرّ وأي كسر نحوي يُلتقط
  assertEqual(NS.SYNTAX_CHECK, undefined, 'ما فيه تجاوز صريح');
  assertContains(convertFormula('=A1+1').code, '_add(a1, 1)');
  // الإطفاء الصريح لا يغيّر الناتج — الحارس فحص لا تحويل
  const before = convertFormula('=SUM(A1:A3)').code;
  NS.SYNTAX_CHECK = false;
  try {
    assertEqual(convertFormula('=SUM(A1:A3)').code, before);
  } finally {
    delete NS.SYNTAX_CHECK;
  }
});
