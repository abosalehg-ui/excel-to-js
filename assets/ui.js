/* ============================================================
   ui.js — واجهة المستخدم: ربط DOM + التظليل + النسخ + الأمثلة
   ------------------------------------------------------------
   يعتمد على HELPERS/FUNCTIONS/tokenize/convertFormula
   (تُحمَّل قبله من assets/helpers.js و functions.js و engine.js).
   ملاحظة: تفضيل الثيم يُطبَّق مبكراً بسكربت مضمّن في <head>
   لمنع وميض الوضع الفاتح؛ هنا نزامن أيقونة الزر فقط.
   ============================================================ */

const $input        = document.getElementById('formula-input');
const $highlight    = document.getElementById('editor-highlight');
const $output       = document.getElementById('output-wrap');
const $outputInfo   = document.getElementById('output-info');
const $status       = document.getElementById('status');
const $btnConvert   = document.getElementById('btn-convert');
const $btnCopy      = document.getElementById('btn-copy');
const $btnClear     = document.getElementById('btn-clear');
const $toast        = document.getElementById('toast');

let lastCode = '';

// عدد الدوال يُحسب من القاموس نفسه — مصدر حقيقة واحد
const FN_COUNT = Object.keys(FUNCTIONS).length;
document.getElementById('fn-count-badge').textContent = `${FN_COUNT} دالة`;
document.getElementById('fn-count-section').textContent = FN_COUNT;
document.getElementById('fn-count-footer').textContent = FN_COUNT;

const CAT_LABELS = {
  logic: 'منطقية', math: 'رياضية', text: 'نصية',
  count: 'عدّ', date: 'تاريخ', lookup: 'بحث', check: 'فحص'
};

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderHighlight(input, errorRange = null) {
  if (!input) { $highlight.innerHTML = ''; return; }
  if (errorRange) {
    const { start, end } = errorRange;
    const before = input.slice(0, start);
    const errPart = input.slice(start, Math.max(end, start + 1));
    const after = input.slice(Math.max(end, start + 1));
    $highlight.innerHTML =
      escapeHtml(before) +
      `<span class="err-mark">${escapeHtml(errPart) || '⚠'}</span>` +
      escapeHtml(after);
    return;
  }

  try {
    const tokens = tokenize(input);
    let html = '';
    let cursor = 0;
    if (input.startsWith('=')) {
      html += `<span class="tk-op">=</span>`;
      cursor = 1;
    }
    for (const t of tokens) {
      if (t.start > cursor) {
        html += escapeHtml(input.slice(cursor, t.start));
      }
      const cls = {
        FUNCTION: 'tk-fn', NUMBER: 'tk-num', STRING: 'tk-str',
        CELL_REF: 'tk-cell', RANGE: 'tk-cell',
        OPERATOR: 'tk-op', OPERATOR_CMP: 'tk-op',
        COMMA: 'tk-op', LPAREN: 'tk-paren', RPAREN: 'tk-paren',
        BOOLEAN: 'tk-num'
      }[t.type] || '';
      html += `<span class="${cls}">${escapeHtml(t.raw)}</span>`;
      cursor = t.end;
    }
    if (cursor < input.length) html += escapeHtml(input.slice(cursor));
    $highlight.innerHTML = html;
  } catch {
    $highlight.innerHTML = escapeHtml(input);
  }
}

function highlightJS(code) {
  let result = escapeHtml(code);
  result = result.replace(/(\/\/[^\n]*)/g, '<span class="code-comment">$1</span>');
  result = result.replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;|&#39;(?:[^&]|&(?!#39;))*&#39;)/g, (match) => {
    if (match.includes('code-comment')) return match;
    return `<span class="code-string">${match}</span>`;
  });
  result = result.replace(
    /\b(function|return|const|let|var|if|else|for|while|switch|case|break|default|try|catch|throw|new|typeof|true|false|null|undefined)\b/g,
    '<span class="code-keyword">$1</span>'
  );
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="code-number">$1</span>');
  result = result.replace(
    /\b(Math|Number|String|Array|Date|Object|JSON|isNaN|isFinite)\b/g,
    '<span class="code-fn">$1</span>'
  );
  return result;
}

function showOutput(code) {
  if (!code) {
    $output.innerHTML = '<div class="code-empty">سيظهر الكود هنا بعد التحويل…</div>';
    $outputInfo.style.display = 'none';
    return;
  }
  const lines = code.split('\n');
  const lineNumbers = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
  const highlighted = highlightJS(code);
  $output.innerHTML = `
    <div class="code-block">
      <div class="line-numbers">${lineNumbers}</div>
      <div class="code-content">${highlighted}</div>
    </div>
  `;
}

function showOutputInfo(usedCells, usedHelpers) {
  const items = [];
  items.push(`<span class="info-item">📥 الباراميترات: <code>${usedCells.length ? usedCells.join(', ') : '(لا شيء)'}</code></span>`);
  if (usedHelpers && usedHelpers.length > 0) {
    items.push(`<span class="info-item">🔧 Helpers مولّدة: <code>${usedHelpers.join(', ')}</code></span>`);
  }
  $outputInfo.innerHTML = items.join('');
  $outputInfo.style.display = 'flex';
}

function showStatus(type, html) {
  $status.className = `status show ${type}`;
  $status.innerHTML = html;
}
function hideStatus() {
  $status.className = 'status';
  $status.innerHTML = '';
}

function doConvert() {
  const input = $input.value;
  hideStatus();
  renderHighlight(input);

  try {
    const { code, usedCells, usedHelpers } = convertFormula(input);
    lastCode = code;
    showOutput(code);
    showOutputInfo(usedCells, usedHelpers);
    let msg = `<strong>✓ نجح التحويل.</strong> الدالة <code>calculate</code> جاهزة.`;
    if (usedHelpers.length > 0) msg += ` (مع ${usedHelpers.length} helpers)`;
    showStatus('success', msg);
  } catch (e) {
    lastCode = '';
    showOutput('');
    if (typeof e.start === 'number') {
      renderHighlight(input, { start: e.start, end: e.end || e.start + 1 });
    }
    let msg = `<strong>✗ خطأ:</strong> ${escapeHtml(e.message)}`;
    if (e.unsupported) {
      msg += `<br><small>الدوال المدعومة: ${Object.keys(FUNCTIONS).join('، ')}</small>`;
    }
    showStatus('error', msg);
  }
}

function showToast(text) {
  $toast.textContent = text;
  $toast.classList.add('show');
  setTimeout(() => $toast.classList.remove('show'), 1800);
}

async function copyCode() {
  if (!lastCode) { showToast('لا يوجد كود لنسخه'); return; }
  try {
    await navigator.clipboard.writeText(lastCode);
    showToast('تم النسخ ✓');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = lastCode;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('تم النسخ ✓');
  }
}

$btnConvert.addEventListener('click', doConvert);
$btnCopy.addEventListener('click', copyCode);
$btnClear.addEventListener('click', () => {
  $input.value = '';
  renderHighlight('');
  showOutput('');
  hideStatus();
  $input.focus();
});
$input.addEventListener('input', () => renderHighlight($input.value));
$input.addEventListener('scroll', () => {
  $highlight.scrollTop = $input.scrollTop;
  $highlight.scrollLeft = $input.scrollLeft;
});
$input.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    doConvert();
  }
});

/* ----- بناء الأمثلة السريعة ----- */
const EXAMPLES = [
  { label: 'شرط بسيط',          cat: 'logic',  formula: '=IF(A1>10,"كبير","صغير")' },
  { label: 'مجموع نطاق',        cat: 'math',   formula: '=SUM(A1:A10)' },
  { label: 'متوسط',             cat: 'math',   formula: '=AVERAGE(B1:B5)' },
  { label: 'دمج نصوص',          cat: 'text',   formula: '=CONCATENATE("الإجمالي: ",A1," ر.س")' },
  { label: 'بحث عمودي',         cat: 'lookup', formula: '=VLOOKUP(A2,B1:D10,3,FALSE)' },
  { label: 'بحث + INDEX/MATCH', cat: 'lookup', formula: '=INDEX(C1:C10,MATCH(A2,B1:B10,0))' },
  { label: 'عدّ بشرط',          cat: 'count',  formula: '=COUNTIF(A1:A20,">100")' },
  { label: 'عدّ بشروط متعددة',  cat: 'count',  formula: '=COUNTIFS(A1:A10,">0",B1:B10,"معتمد")' },
  { label: 'استخراج جزء نص',    cat: 'text',   formula: '=MID(A1,3,5)' },
  { label: 'استبدال نص',        cat: 'text',   formula: '=SUBSTITUTE(A1,"-","/")' },
  { label: 'الفرق بين تاريخين', cat: 'date',   formula: '=DATEDIF(A1,B1,"D")' },
  { label: 'إضافة شهور',        cat: 'date',   formula: '=EDATE(A1,3)' },
  { label: 'سنة من تاريخ',      cat: 'date',   formula: '=YEAR(TODAY())' },
  { label: 'تاريخ مخصص',        cat: 'date',   formula: '=DATE(2026,6,15)' },
  { label: 'فحص خلية فارغة',    cat: 'check',  formula: '=IF(ISBLANK(A1),"فارغ","موجود")' },
  { label: 'فحص رقم',           cat: 'check',  formula: '=IF(ISNUMBER(A1),A1*2,0)' },
  { label: 'الجذر التربيعي',    cat: 'math',   formula: '=SQRT(POWER(A1,2)+POWER(B1,2))' },
  { label: 'باقي القسمة',       cat: 'math',   formula: '=IF(MOD(A1,2)=0,"زوجي","فردي")' }
];

const $examples = document.getElementById('examples-grid');
EXAMPLES.forEach(ex => {
  const card = document.createElement('div');
  card.className = 'example-card';
  card.innerHTML = `
    <div class="label">
      ${escapeHtml(ex.label)}
      <span class="cat-pill ref-cat ${ex.cat}">${CAT_LABELS[ex.cat]}</span>
    </div>
    <div class="formula">${escapeHtml(ex.formula)}</div>
  `;
  card.addEventListener('click', () => {
    $input.value = ex.formula;
    renderHighlight(ex.formula);
    $input.focus();
    doConvert();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $examples.appendChild(card);
});

/* ----- جدول المرجع مع التصفية ----- */
const $refBody = document.getElementById('ref-table-body');
Object.entries(FUNCTIONS).forEach(([name, info]) => {
  const tr = document.createElement('tr');
  tr.dataset.cat = info.cat;
  tr.innerHTML = `
    <td><span class="ref-cat ${info.cat}">${CAT_LABELS[info.cat]}</span></td>
    <td><span class="fn-name">${name}</span></td>
    <td><span class="js-equiv">${escapeHtml(info.jsEquiv)}</span></td>
    <td>${escapeHtml(info.desc)}</td>
  `;
  $refBody.appendChild(tr);
});

const $refControls = document.getElementById('ref-controls');
const cats = ['all', ...new Set(Object.values(FUNCTIONS).map(f => f.cat))];
cats.forEach((cat, idx) => {
  const btn = document.createElement('button');
  btn.className = 'filter-btn' + (idx === 0 ? ' active' : '');
  btn.dataset.cat = cat;
  btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
  const count = cat === 'all'
    ? Object.keys(FUNCTIONS).length
    : Object.values(FUNCTIONS).filter(f => f.cat === cat).length;
  btn.textContent = cat === 'all' ? `الكل (${count})` : `${CAT_LABELS[cat]} (${count})`;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    document.querySelectorAll('#ref-table-body tr').forEach(tr => {
      tr.classList.toggle('hidden', cat !== 'all' && tr.dataset.cat !== cat);
    });
  });
  $refControls.appendChild(btn);
});

/* ----- Dark Mode Toggle ----- */
const $themeToggle = document.getElementById('theme-toggle');
const DARK_KEY = 'excel-converter-theme';

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  $themeToggle.textContent = dark ? '☀️' : '🌙';
}

// الثيم طُبّق مبكراً في <head>؛ هنا نزامن أيقونة الزر مع الحالة الفعلية
applyTheme(document.documentElement.dataset.theme === 'dark');

$themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  applyTheme(!isDark);
  // localStorage قد يرمي استثناء في بعض أوضاع الخصوصية — الثيم يعمل بدون حفظ
  try { localStorage.setItem(DARK_KEY, !isDark ? 'dark' : 'light'); } catch (e) {}
});
