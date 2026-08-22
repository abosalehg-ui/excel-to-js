/* ============================================================
   ui.js — واجهة المستخدم: ربط DOM + التظليل + النسخ + الأمثلة
   ------------------------------------------------------------
   يعتمد على HELPERS/FUNCTIONS/tokenize/convertFormula
   (تُحمَّل قبله من assets/helpers.js و functions.js و engine.js).

   مبدآن أساسيان في هذا الملف:
   1) لا يُستخدم innerHTML إطلاقاً — كل شيء يُبنى بعقد DOM و
      textContent. هذا يلغي فئة كاملة من الأخطاء (كان تلوين
      الأرقام بالـ regex يشطر الكيان &#39; فتظهر حرفياً).
   2) كل منطق DOM داخل initUI(root) لتبقى الوحدة قابلة
      للاستيراد والاختبار خارج المتصفح.

   ملاحظة: تفضيل الثيم يُطبَّق مبكراً بسكربت مضمّن في <head>
   لمنع وميض الوضع الفاتح؛ هنا نزامن أيقونة الزر فقط.
   ============================================================ */
(function (global) {
  'use strict';

  const NS = (global.ExcelToJS = global.ExcelToJS || {});

  const CAT_LABELS = {
    logic: 'منطقية',
    math: 'رياضية',
    text: 'نصية',
    count: 'عدّ',
    date: 'تاريخ',
    lookup: 'بحث',
    check: 'فحص'
  };

  /* ----- الأمثلة السريعة — بيانات محضة، فمكانها خارج منطق الـDOM ----- */
  const EXAMPLES = [
    { label: 'شرط بسيط', cat: 'logic', formula: '=IF(A1>10,"كبير","صغير")' },
    { label: 'مجموع نطاق', cat: 'math', formula: '=SUM(A1:A10)' },
    { label: 'متوسط', cat: 'math', formula: '=AVERAGE(B1:B5)' },
    { label: 'دمج نصوص', cat: 'text', formula: '=CONCATENATE("الإجمالي: ",A1," ر.س")' },
    { label: 'بحث عمودي', cat: 'lookup', formula: '=VLOOKUP(A2,B1:D10,3,FALSE)' },
    { label: 'بحث + INDEX/MATCH', cat: 'lookup', formula: '=INDEX(C1:C10,MATCH(A2,B1:B10,0))' },
    { label: 'عدّ بشرط', cat: 'count', formula: '=COUNTIF(A1:A20,">100")' },
    { label: 'عدّ بشروط متعددة', cat: 'count', formula: '=COUNTIFS(A1:A10,">0",B1:B10,"معتمد")' },
    { label: 'استخراج جزء نص', cat: 'text', formula: '=MID(A1,3,5)' },
    { label: 'استبدال نص', cat: 'text', formula: '=SUBSTITUTE(A1,"-","/")' },
    { label: 'الفرق بين تاريخين', cat: 'date', formula: '=DATEDIF(A1,B1,"D")' },
    { label: 'إضافة شهور', cat: 'date', formula: '=EDATE(A1,3)' },
    { label: 'سنة من تاريخ', cat: 'date', formula: '=YEAR(TODAY())' },
    { label: 'تاريخ مخصص', cat: 'date', formula: '=DATE(2026,6,15)' },
    { label: 'فحص خلية فارغة', cat: 'check', formula: '=IF(ISBLANK(A1),"فارغ","موجود")' },
    { label: 'فحص رقم', cat: 'check', formula: '=IF(ISNUMBER(A1),A1*2,0)' },
    { label: 'الجذر التربيعي', cat: 'math', formula: '=SQRT(POWER(A1,2)+POWER(B1,2))' },
    { label: 'باقي القسمة', cat: 'math', formula: '=IF(MOD(A1,2)=0,"زوجي","فردي")' }
  ];

  const DARK_KEY = 'excel-converter-theme';
  const AUTO_CONVERT_DELAY = 300;
  // فوق هذا العدد يصير التوقيع غير عملي فنقترح وضع النطاقات كمصفوفات
  const PARAM_NUDGE_THRESHOLD = 15;
  // قفزة طول أكبر من هذا = لصق لا كتابة، فيُعرض الخطأ كاملاً بلا انتظار
  const PASTE_JUMP = 10;
  const UNDO_WINDOW = 8000;

  /* ============================================================
   tokenizeJS — مُقسِّم صغير لعرض كود JS ملوّناً
   ------------------------------------------------------------
   بديل عن سلسلة regex.replace على HTML مُهرَّب. مسار واحد،
   والبدائل مرتّبة بحيث تفوز التعليقات ثم النصوص، فلا تتداخل
   الـ spans ولا تُشطر الكيانات.
   يرجّع [{ cls, text }] — cls فارغة تعني نصاً عادياً.
   ============================================================ */
  const JS_TOKEN_RE = new RegExp(
    [
      /(\/\/[^\n]*)/, // 1 تعليق
      /('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/, // 2 نص
      /\b(function|return|const|let|var|if|else|for|while|switch|case|break|default|try|catch|throw|new|typeof|true|false|null|undefined)\b/, // 3 كلمة مفتاحية
      /\b(Math|Number|String|Array|Date|Object|JSON|isNaN|isFinite)\b/, // 4 مدمجة
      /(\d+\.?\d*)/ // 5 رقم
    ]
      .map((r) => r.source)
      .join('|'),
    'g'
  );

  const JS_TOKEN_CLASSES = [
    'code-comment',
    'code-string',
    'code-keyword',
    'code-fn',
    'code-number'
  ];

  function tokenizeJS(code) {
    const out = [];
    let last = 0;
    let m;
    JS_TOKEN_RE.lastIndex = 0;
    while ((m = JS_TOKEN_RE.exec(code)) !== null) {
      if (m.index > last) out.push({ cls: '', text: code.slice(last, m.index) });
      let cls = '';
      for (let g = 1; g <= JS_TOKEN_CLASSES.length; g++) {
        if (m[g] !== undefined) {
          cls = JS_TOKEN_CLASSES[g - 1];
          break;
        }
      }
      out.push({ cls, text: m[0] });
      last = JS_TOKEN_RE.lastIndex;
    }
    if (last < code.length) out.push({ cls: '', text: code.slice(last) });
    return out;
  }

  // أصناف تلوين رموز صيغة Excel في المحرر
  const FORMULA_TOKEN_CLASSES = {
    FUNCTION: 'tk-fn',
    NUMBER: 'tk-num',
    STRING: 'tk-str',
    CELL_REF: 'tk-cell',
    RANGE: 'tk-cell',
    OPERATOR: 'tk-op',
    OPERATOR_CMP: 'tk-op',
    COMMA: 'tk-op',
    LPAREN: 'tk-paren',
    RPAREN: 'tk-paren',
    BOOLEAN: 'tk-num'
  };

  /* ============================================================
   initUI — كل ما يلمس الـ DOM
   ============================================================ */
  function initUI(root) {
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('initUI يحتاج مستنداً (document)');
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : undefined);

    const FUNCTIONS = NS.FUNCTIONS;
    const tokenize = NS.tokenize;
    const convertFormula = NS.convertFormula;

    const $ = (id) => doc.getElementById(id);

    const $input = $('formula-input');
    const $highlight = $('editor-highlight');
    const $output = $('output-wrap');
    const $outputInfo = $('output-info');
    const $status = $('status');
    const $btnConvert = $('btn-convert');
    const $btnCopy = $('btn-copy');
    const $btnClear = $('btn-clear');
    const $btnUndo = $('btn-undo');
    const $toast = $('toast');
    const $examples = $('examples-grid');
    const $refBody = $('ref-table-body');
    const $refControls = $('ref-controls');
    const $refSearch = $('ref-search');
    const $themeToggle = $('theme-toggle');
    const $rangeMode = $('range-mode');

    let lastCode = '';
    let clearedValue = null;
    let undoTimer = null;
    let convertTimer = null;
    let highlightFrame = null;

    /* ----- أدوات DOM صغيرة ----- */
    function clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    }
    function el(tag, className, text) {
      const n = doc.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    /* ----- عدد الدوال: مصدر حقيقة واحد ----- */
    const FN_COUNT = Object.keys(FUNCTIONS).length;
    $('fn-count-badge').textContent = `${FN_COUNT} دالة`;
    $('fn-count-section').textContent = String(FN_COUNT);
    $('fn-count-footer').textContent = String(FN_COUNT);

    /* ----- تظليل الصيغة في المحرر ----- */
    function renderHighlight(input, errorRange) {
      clear($highlight);
      if (!input) return;

      if (errorRange) {
        const { start, end } = errorRange;
        const stop = Math.max(end, start + 1);
        $highlight.appendChild(doc.createTextNode(input.slice(0, start)));
        const mark = el('span', 'err-mark', input.slice(start, stop) || '⚠');
        $highlight.appendChild(mark);
        $highlight.appendChild(doc.createTextNode(input.slice(stop)));
        return;
      }

      let tokens;
      try {
        tokens = tokenize(input);
      } catch (e) {
        $highlight.appendChild(doc.createTextNode(input));
        return;
      }

      let cursor = 0;
      for (const t of tokens) {
        if (t.start > cursor) {
          $highlight.appendChild(doc.createTextNode(input.slice(cursor, t.start)));
        }
        const cls = FORMULA_TOKEN_CLASSES[t.type] || '';
        $highlight.appendChild(cls ? el('span', cls, t.raw) : doc.createTextNode(t.raw));
        cursor = t.end;
      }
      if (cursor < input.length) {
        $highlight.appendChild(doc.createTextNode(input.slice(cursor)));
      }
    }

    // التظليل يُجدوَل على إطار الرسم التالي بدل كل ضغطة مفتاح
    function scheduleHighlight() {
      if (!win || !win.requestAnimationFrame) {
        renderHighlight($input.value);
        return;
      }
      if (highlightFrame !== null) return;
      highlightFrame = win.requestAnimationFrame(() => {
        highlightFrame = null;
        renderHighlight($input.value);
      });
    }

    /* ----- حالة الخطأ على الحقل نفسه -----
     التعليم البصري (.err-mark) مرئي بحت — قارئ الشاشة عند التركيز على
     المحرر ما كان يعرف إن فيه خطأ أصلاً ولا وش هو. */
    function setFieldError(hasError) {
      if (hasError) {
        $input.setAttribute('aria-invalid', 'true');
        $input.setAttribute('aria-describedby', 'status');
      } else {
        $input.removeAttribute('aria-invalid');
        $input.removeAttribute('aria-describedby');
      }
    }

    /* ----- عرض الكود الناتج ----- */
    // hint: نص يظهر مكان "سيظهر الكود هنا…" حين يفشل التحويل الصامت،
    // فلا تبقى اللوحة فاضية بلا أي تفسير (كان طريقاً مسدوداً كاملاً)
    function showOutput(code, hint) {
      clear($output);
      if (!code) {
        $output.appendChild(el('div', 'code-empty', hint || 'سيظهر الكود هنا بعد التحويل…'));
        $outputInfo.style.display = 'none';
        return;
      }
      const block = el('div', 'code-block');

      const lines = code.split('\n');
      const numbers = el('div', 'line-numbers');
      numbers.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < lines.length; i++) numbers.appendChild(el('div', '', String(i + 1)));

      const content = el('div', 'code-content');
      for (const t of tokenizeJS(code)) {
        content.appendChild(t.cls ? el('span', t.cls, t.text) : doc.createTextNode(t.text));
      }

      block.appendChild(numbers);
      block.appendChild(content);
      $output.appendChild(block);
    }

    function showOutputInfo(paramNames, usedHelpers, usedRanges) {
      clear($outputInfo);
      const item = (label, value) => {
        const span = el('span', 'info-item', label);
        span.appendChild(el('code', '', value));
        return span;
      };
      $outputInfo.appendChild(
        item('📥 الباراميترات: ', paramNames.length ? paramNames.join(', ') : '(لا شيء)')
      );
      if (usedRanges && usedRanges.length > 0) {
        $outputInfo.appendChild(
          item('🧮 نطاقات: ', usedRanges.map((r) => `${r.name} = ${r.rows}×${r.cols}`).join('، '))
        );
      }
      if (usedHelpers && usedHelpers.length > 0) {
        $outputInfo.appendChild(item('🔧 Helpers مولّدة: ', usedHelpers.join(', ')));
      }
      // توقيع بعشرات الباراميترات غير قابل للاستدعاء عملياً، والحل موجود
      // في المنتج — لكن المستخدم كان لازم يكتشف المفتاح بنفسه
      if (paramNames.length > PARAM_NUDGE_THRESHOLD && $rangeMode && !$rangeMode.checked) {
        $outputInfo.appendChild(
          el(
            'span',
            'info-item info-nudge',
            `💡 عدد الباراميترات كبير (${paramNames.length}) — جرّب وضع «النطاقات كمصفوفات»`
          )
        );
      }
      $outputInfo.style.display = 'flex';
    }

    /* ----- شريط الحالة ----- */
    function showStatus(type, buildBody) {
      $status.className = `status show ${type}`;
      // الخطأ يقاطع، والنجاح ينتظر دوره — polite كانت تؤجّل إعلان الخطأ
      $status.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
      clear($status);
      buildBody($status);
    }
    function hideStatus() {
      $status.className = 'status';
      clear($status);
    }

    /* ----- التحويل ----- */
    // silent = تحويل تلقائي أثناء الكتابة: نعرض النجاح ونبتلع الأخطاء
    // (الصيغة نصف المكتوبة خاطئة دائماً، وإظهار الخطأ لكل حرف ضجيج)
    function doConvert(options) {
      const silent = !!(options && options.silent);
      const input = $input.value;
      if (silent && !input.trim()) {
        return;
      }

      try {
        const { code, paramNames, usedRanges, usedHelpers } = convertFormula(input, {
          rangeParams: !!($rangeMode && $rangeMode.checked)
        });
        lastCode = code;
        setFieldError(false);
        renderHighlight(input);
        showOutput(code);
        showOutputInfo(paramNames, usedHelpers, usedRanges);
        showStatus('success', (box) => {
          box.appendChild(el('strong', '', '✓ نجح التحويل.'));
          box.appendChild(doc.createTextNode(' الدالة '));
          box.appendChild(el('code', '', 'calculate'));
          box.appendChild(
            doc.createTextNode(
              ' جاهزة.' + (usedHelpers.length ? ` (مع ${usedHelpers.length} helpers)` : '')
            )
          );
        });
      } catch (e) {
        lastCode = '';
        if (silent) {
          // الفشل الصامت كان يترك اللوحة فاضية بلا أي تفسير: مستخدم يلصق
          // صيغة فيها دالة غير مدعومة ما يرى شيئاً ولا يعرف إن زر «تحويل»
          // يخبره بالسبب. الكتابة الجارية تبقى صامتة (الصيغة نصف المكتوبة
          // خاطئة دائماً)، أما اللصق فيُعرض خطؤه كاملاً.
          hideStatus();
          setFieldError(false);
          showOutput('', 'الصيغة غير مكتملة أو غير مدعومة — اضغط «تحويل» للتفاصيل');
          renderHighlight(input);
          return;
        }
        setFieldError(true);
        showOutput('');
        if (typeof e.start === 'number') {
          renderHighlight(input, { start: e.start, end: e.end || e.start + 1 });
        } else {
          renderHighlight(input);
        }
        showStatus('error', (box) => {
          box.appendChild(el('strong', '', '✗ خطأ:'));
          box.appendChild(doc.createTextNode(' '));
          // الرسالة تدمج شظايا لاتينية داخل نص عربي؛ <bdi> يعزلها فلا
          // تنقلب مواضع الأقواس وعلامات الاقتباس حولها
          box.appendChild(el('bdi', '', e.message));
          if (e.unsupported) {
            box.appendChild(el('br'));
            box.appendChild(
              el('small', '', 'الدوال المدعومة: ' + Object.keys(FUNCTIONS).join('، '))
            );
          }
        });
      }
    }

    function scheduleConvert() {
      if (convertTimer) clearTimeout(convertTimer);
      convertTimer = setTimeout(() => {
        convertTimer = null;
        doConvert({ silent: true });
      }, AUTO_CONVERT_DELAY);
    }

    /* ----- Toast ----- */
    let toastTimer = null;
    function showToast(text) {
      $toast.textContent = text;
      $toast.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $toast.classList.remove('show'), 1800);
    }

    /* ----- النسخ ----- */
    async function copyCode() {
      if (!lastCode) {
        showToast('لا يوجد كود لنسخه');
        return;
      }
      try {
        await win.navigator.clipboard.writeText(lastCode);
        showToast('تم النسخ ✓');
      } catch (e) {
        const ta = el('textarea');
        ta.value = lastCode;
        doc.body.appendChild(ta);
        // finally لا بعد الـtry: لو رمت select() كانت العقدة تبقى يتيمة في الـDOM
        try {
          ta.select();
          doc.execCommand('copy');
          showToast('تم النسخ ✓');
        } catch (e2) {
          showToast('تعذّر النسخ — انسخ يدوياً');
        } finally {
          doc.body.removeChild(ta);
        }
      }
    }

    /* ----- المسح مع تراجع ----- */
    function hideUndo() {
      if (undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
      }
      clearedValue = null;
      $btnUndo.hidden = true;
    }

    $btnClear.addEventListener('click', () => {
      if (!$input.value) {
        $input.focus();
        return;
      }
      clearedValue = $input.value;
      $input.value = '';
      lastInputLength = 0;
      setFieldError(false);
      renderHighlight('');
      showOutput('');
      hideStatus();
      lastCode = '';
      $btnUndo.hidden = false;
      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(hideUndo, UNDO_WINDOW);
      showToast('تم المسح — يمكنك التراجع');
      $input.focus();
    });

    $btnUndo.addEventListener('click', () => {
      if (clearedValue === null) return;
      $input.value = clearedValue;
      lastInputLength = clearedValue.length;
      hideUndo();
      renderHighlight($input.value);
      doConvert();
      $input.focus();
    });

    /* ----- ربط الأحداث ----- */
    $btnConvert.addEventListener('click', () => doConvert());
    $btnCopy.addEventListener('click', copyCode);

    // تبديل وضع الإخراج يعيد التحويل فوراً لو كان في المحرر صيغة صالحة
    if ($rangeMode) {
      $rangeMode.addEventListener('change', () => {
        if ($input.value.trim()) doConvert({ silent: true });
      });
    }

    // اللصق يصل كحدث input أيضاً؛ نميّزه بقفزة الطول لأن حدث paste وحده
    // يسبق تحديث القيمة، ولأن السحب-والإفلات لا يطلق paste إطلاقاً
    let lastInputLength = 0;
    $input.addEventListener('input', () => {
      const len = $input.value.length;
      const pasted = len - lastInputLength > PASTE_JUMP;
      lastInputLength = len;
      scheduleHighlight();
      hideUndo();
      if (pasted) {
        if (convertTimer) {
          clearTimeout(convertTimer);
          convertTimer = null;
        }
        doConvert();
        return;
      }
      scheduleConvert();
    });
    $input.addEventListener('scroll', () => {
      $highlight.scrollTop = $input.scrollTop;
      $highlight.scrollLeft = $input.scrollLeft;
    });
    $input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (convertTimer) {
          clearTimeout(convertTimer);
          convertTimer = null;
        }
        doConvert();
      }
    });

    /* ----- الأمثلة السريعة ----- */
    for (const ex of EXAMPLES) {
      // <button> لا <div>: يحلّ التنقل بلوحة المفاتيح والدلالة والتفعيل بـEnter/Space
      const card = el('button', 'example-card');
      card.type = 'button';

      const label = el('div', 'label');
      label.appendChild(doc.createTextNode(ex.label));
      label.appendChild(el('span', `cat-pill ref-cat ${ex.cat}`, CAT_LABELS[ex.cat]));

      card.appendChild(label);
      card.appendChild(el('div', 'formula', ex.formula));
      card.addEventListener('click', () => {
        $input.value = ex.formula;
        lastInputLength = ex.formula.length;
        hideUndo();
        doConvert();
        $input.focus();
        // بعض البيئات (jsdom مثلاً) لا تنفّذ scrollTo — التمرير تحسين لا شرط
        try {
          if (win && win.scrollTo) win.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {}
      });
      $examples.appendChild(card);
    }

    /* ----- جدول المرجع: تصفية بالفئة + بحث نصي ----- */
    for (const [name, info] of Object.entries(FUNCTIONS)) {
      const tr = doc.createElement('tr');
      tr.dataset.cat = info.cat;
      tr.dataset.search = `${name} ${info.desc} ${info.jsEquiv}`.toLowerCase();

      const tdCat = doc.createElement('td');
      tdCat.appendChild(el('span', `ref-cat ${info.cat}`, CAT_LABELS[info.cat]));
      const tdName = doc.createElement('td');
      tdName.appendChild(el('span', 'fn-name', name));
      // على الجوال يُخفى عمود الوصف ويُعرض من هنا عبر ::after بدل
      // ما تضيع المعلومة كلياً (القاعدة في index.html)
      tdName.dataset.desc = info.desc;
      const tdEquiv = doc.createElement('td');
      tdEquiv.appendChild(el('span', 'js-equiv', info.jsEquiv));
      const tdDesc = doc.createElement('td');
      tdDesc.textContent = info.desc;

      tr.appendChild(tdCat);
      tr.appendChild(tdName);
      tr.appendChild(tdEquiv);
      tr.appendChild(tdDesc);
      $refBody.appendChild(tr);
    }

    let activeCat = 'all';

    function applyRefFilter() {
      const query = ($refSearch ? $refSearch.value : '').trim().toLowerCase();
      let visible = 0;
      for (const tr of $refBody.querySelectorAll('tr')) {
        const okCat = activeCat === 'all' || tr.dataset.cat === activeCat;
        const okText = !query || tr.dataset.search.indexOf(query) !== -1;
        const show = okCat && okText;
        tr.classList.toggle('hidden', !show);
        if (show) visible++;
      }
      const $empty = $('ref-empty');
      if ($empty) $empty.hidden = visible > 0;
    }

    const cats = ['all', ...new Set(Object.values(FUNCTIONS).map((f) => f.cat))];
    cats.forEach((cat, idx) => {
      const btn = el('button', 'filter-btn' + (idx === 0 ? ' active' : ''));
      btn.type = 'button';
      btn.dataset.cat = cat;
      btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      const count =
        cat === 'all'
          ? Object.keys(FUNCTIONS).length
          : Object.values(FUNCTIONS).filter((f) => f.cat === cat).length;
      btn.textContent = cat === 'all' ? `الكل (${count})` : `${CAT_LABELS[cat]} (${count})`;
      btn.addEventListener('click', () => {
        for (const b of $refControls.querySelectorAll('.filter-btn')) {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        }
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        activeCat = cat;
        applyRefFilter();
      });
      $refControls.appendChild(btn);
    });

    if ($refSearch) $refSearch.addEventListener('input', applyRefFilter);

    /* ----- الوضع الليلي ----- */
    function applyTheme(dark) {
      doc.documentElement.dataset.theme = dark ? 'dark' : '';
      $themeToggle.textContent = dark ? '☀️' : '🌙';
      $themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    }

    // الثيم طُبّق مبكراً في <head>؛ هنا نزامن أيقونة الزر مع الحالة الفعلية
    applyTheme(doc.documentElement.dataset.theme === 'dark');

    $themeToggle.addEventListener('click', () => {
      const isDark = doc.documentElement.dataset.theme === 'dark';
      applyTheme(!isDark);
      // localStorage قد يرمي استثناء في بعض أوضاع الخصوصية — الثيم يعمل بدون حفظ
      try {
        win.localStorage.setItem(DARK_KEY, !isDark ? 'dark' : 'light');
      } catch (e) {}
    });

    return {
      doConvert,
      renderHighlight,
      showOutput,
      applyRefFilter,
      getLastCode: () => lastCode
    };
  }

  NS.tokenizeJS = tokenizeJS;
  NS.initUI = initUI;
  NS.CAT_LABELS = CAT_LABELS;
  NS.EXAMPLES = EXAMPLES;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tokenizeJS, initUI, CAT_LABELS, EXAMPLES };
  }

  // تشغيل تلقائي في المتصفح فقط — في Node تُستورَد الوحدة بلا آثار جانبية.
  // الشرط على وجود المحرر: tests.html يحمّل هذا الملف لاختبار tokenizeJS
  // وليس فيه عناصر التطبيق، فبلا الحارس يرمي initUI على عنصر مفقود.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => {
      if (document.getElementById('formula-input')) initUI(document);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
