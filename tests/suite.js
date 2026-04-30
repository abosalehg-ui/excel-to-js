/* ============================================================
   suite.js — مجموعة اختبارات V3 (baseline لكل ميزات V2)
   ------------------------------------------------------------
   تستخدم: test, assertEqual, assertClose, assertContains,
            assertThrows, runFormula  (معرّفة في tests.html)
   تنقسم لأربع فئات:
     1. Tokenizer       — تقسيم الصيغة إلى tokens
     2. Parser          — بناء AST صحيح
     3. Generator       — توليد كود JS صحيح
     4. Runtime         — تنفيذ الكود الناتج للتأكد من النتيجة
   ============================================================ */

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

test('Generator', 'Binary + → " + "', () => {
  const r = generate(parse(tokenize('A1+B1')));
  assertEqual(r.expr, '(a1 + b1)');
});

test('Generator', 'Comparison = → ===', () => {
  const r = generate(parse(tokenize('A1=5')));
  assertEqual(r.expr, '(a1 === 5)');
});

test('Generator', 'Comparison <> → !==', () => {
  const r = generate(parse(tokenize('A1<>0')));
  assertEqual(r.expr, '(a1 !== 0)');
});

test('Generator', '& → String concat', () => {
  const r = generate(parse(tokenize('A1&"x"')));
  assertContains(r.expr, 'String(a1) + String("x")');
});

test('Generator', '^ → Math.pow', () => {
  const r = generate(parse(tokenize('A1^2')));
  assertContains(r.expr, 'Math.pow(a1, 2)');
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
  assertEqual(runFormula('=IFERROR(VLOOKUP("xxx", A1:B2, 2, FALSE), "ما لقيناه")',
    { a1: 'foo', b1: 1, a2: 'bar', b2: 2 }), 'ما لقيناه');
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
  assertEqual(runFormula('=COUNTIFS(A1:A3, ">0", B1:B3, "y")',
    { a1: 1, a2: 2, a3: -1, b1: 'y', b2: 'n', b3: 'y' }), 1);
});

// === Lookup ===
test('Runtime: Lookup', 'VLOOKUP exact match', () => {
  assertEqual(runFormula('=VLOOKUP("b", A1:B3, 2, FALSE)',
    { a1: 'a', b1: 1, a2: 'b', b2: 2, a3: 'c', b3: 3 }), 2);
});

test('Runtime: Lookup', 'VLOOKUP لا يجد → #N/A', () => {
  assertEqual(runFormula('=VLOOKUP("zzz", A1:B2, 2, FALSE)',
    { a1: 'a', b1: 1, a2: 'b', b2: 2 }), '#N/A');
});

test('Runtime: Lookup', 'HLOOKUP', () => {
  assertEqual(runFormula('=HLOOKUP("b", A1:C2, 2, FALSE)',
    { a1: 'a', b1: 'b', c1: 'c', a2: 1, b2: 2, c2: 3 }), 2);
});

test('Runtime: Lookup', 'INDEX 2D', () => {
  assertEqual(runFormula('=INDEX(A1:B2, 2, 1)',
    { a1: 1, b1: 2, a2: 3, b2: 4 }), 3);
});

test('Runtime: Lookup', 'INDEX 1D (عمود واحد)', () => {
  assertEqual(runFormula('=INDEX(A1:A3, 2)',
    { a1: 10, a2: 20, a3: 30 }), 20);
});

test('Runtime: Lookup', 'MATCH exact', () => {
  assertEqual(runFormula('=MATCH("c", A1:A3, 0)',
    { a1: 'a', a2: 'b', a3: 'c' }), 3);
});

test('Runtime: Lookup', 'INDEX + MATCH مركّبة', () => {
  // ابحث عن "b" في B1:B3، خذ القيمة المقابلة من A1:A3
  assertEqual(runFormula('=INDEX(A1:A3, MATCH("b", B1:B3, 0))',
    { a1: 10, a2: 20, a3: 30, b1: 'a', b2: 'b', b3: 'c' }), 20);
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

test('Runtime: Date', 'DATEDIF بوحدات YM / MD', () => {
  // YM: شهور بعد تجاهل السنين الكاملة
  assertEqual(runFormula('=DATEDIF(DATE(2020,1,15), DATE(2026,4,20), "YM")', {}), 3);
  // MD: أيام بعد تجاهل الأشهر والسنين
  assertEqual(runFormula('=DATEDIF(DATE(2020,1,15), DATE(2026,4,20), "MD")', {}), 5);
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
  assertEqual(runFormula('=ISERROR(VLOOKUP("zzz", A1:B2, 2, FALSE))',
    { a1: 'a', b1: 1, a2: 'b', b2: 2 }), true);
});

// === Composite ===
test('Runtime: Composite', 'صيغة مركّبة عميقة', () => {
  // متوسط مربعات الإيجابية
  // =AVERAGE(IF(A1>0,A1*A1,0), IF(B1>0,B1*B1,0), IF(C1>0,C1*C1,0))
  // مع a1=2, b1=-3, c1=4 → AVG(4, 0, 16) = 6.6666...
  const r = runFormula(
    '=AVERAGE(IF(A1>0,A1*A1,0), IF(B1>0,B1*B1,0), IF(C1>0,C1*C1,0))',
    { a1: 2, b1: -3, c1: 4 }
  );
  assertClose(r, (4 + 0 + 16) / 3, 1e-9);
});

test('Runtime: Composite', 'IF + COUNTIF + & للنص', () => {
  const r = runFormula(
    '=IF(COUNTIF(A1:A3, ">0")=3, "كل القيم موجبة", "فيه سالب أو صفر")',
    { a1: 1, a2: -2, a3: 3 }
  );
  assertEqual(r, 'فيه سالب أو صفر');
});

test('Runtime: Composite', 'فيثاغورس: SQRT(POWER+POWER)', () => {
  // 3-4-5 triangle
  assertEqual(runFormula('=SQRT(POWER(A1,2)+POWER(B1,2))', { a1: 3, b1: 4 }), 5);
});
