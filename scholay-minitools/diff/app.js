/* 文本痕迹对比 · 词级 diff(纯本地) */
(function () {
  'use strict';
  var D = window.DIFF_DATA, S = window.Scholay, esc = S.esc;
  var result, seg = null;
  try { if (typeof Intl !== 'undefined' && Intl.Segmenter) seg = new Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) { seg = null; }

  function segWords(text) {
    if (seg) { var out = []; var it = seg.segment(text); for (var s of it) out.push(s.segment); return out; }
    return text.match(/\s+|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[一-龥]|[^\sA-Za-z0-9一-龥]/g) || [];
  }
  function segLines(text) { return text.split(/(\n)/).filter(function (x) { return x !== ''; }); }

  // LCS 词级 diff → ops [{t:'eq'|'ins'|'del', s}]
  function lcsDiff(a, b) {
    var n = a.length, m = b.length, W = m + 1;
    var dp = new Int32Array((n + 1) * W);
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + (j + 1)] + 1
          : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)]);
      }
    }
    var ops = [], p = 0, q = 0;
    while (p < n && q < m) {
      if (a[p] === b[q]) { ops.push({ t: 'eq', s: a[p] }); p++; q++; }
      else if (dp[(p + 1) * W + q] >= dp[p * W + (q + 1)]) { ops.push({ t: 'del', s: a[p] }); p++; }
      else { ops.push({ t: 'ins', s: b[q] }); q++; }
    }
    while (p < n) ops.push({ t: 'del', s: a[p++] });
    while (q < m) ops.push({ t: 'ins', s: b[q++] });
    return ops;
  }

  function merge(ops) {
    var out = [];
    ops.forEach(function (o) {
      var last = out[out.length - 1];
      if (last && last.t === o.t) last.s += o.s; else out.push({ t: o.t, s: o.s });
    });
    return out;
  }

  function run() {
    var A = document.getElementById('a').value, B = document.getElementById('b').value;
    if (!A && !B) { err('请粘贴两版文本'); return; }
    var mode = '词', wa = segWords(A), wb = segWords(B);
    if (wa.length > 2500 || wb.length > 2500) { mode = '行'; wa = segLines(A); wb = segLines(B); }
    var ops = merge(lcsDiff(wa, wb));

    var added = 0, removed = 0, same = 0, insRuns = 0, delRuns = 0;
    ops.forEach(function (o) {
      if (o.t === 'ins') { added += o.s.replace(/\s/g, '').length; insRuns++; }
      else if (o.t === 'del') { removed += o.s.replace(/\s/g, '').length; delRuns++; }
      else same += o.s.replace(/\s/g, '').length;
    });
    var total = added + removed + same;
    var intensity = total ? Math.round((added + removed) / total * 100) : 0;

    var html = ops.map(function (o) {
      var t = esc(o.s);
      return o.t === 'eq' ? t : o.t === 'ins' ? '<ins>' + t + '</ins>' : '<del>' + t + '</del>';
    }).join('');

    var identical = added === 0 && removed === 0;
    result.className = 'result show';
    result.innerHTML = '<div class="card reveal">' +
      '<div class="card-title"><span class="num">✓</span>对比结果' +
        '<span class="mode-tag">' + mode + '级</span></div>' +
      (identical ? '<div class="badge ok" style="margin-bottom:12px">✓ 两版内容完全一致</div>' : '') +
      '<div class="tiles">' +
        '<div class="tile ins-t"><div class="tile-v" data-cu="' + added + '">0</div><div class="tile-k">新增字</div></div>' +
        '<div class="tile del-t"><div class="tile-v" data-cu="' + removed + '">0</div><div class="tile-k">删除字</div></div>' +
        '<div class="tile"><div class="tile-v" data-cu="' + intensity + '" data-suf="%">0</div><div class="tile-k">改动强度</div></div>' +
      '</div>' +
      '<div class="meter"><i id="mf"></i></div>' +
      '<div class="legend"><span><b class="sw-ins"></b>新增</span><span><b class="sw-del"></b>删除</span>' +
        '<span>共 ' + delRuns + ' 处删 · ' + insRuns + ' 处增</span></div>' +
      '<div class="diffout selectable">' + html + '</div>' +
      '<div class="note">绿色下划线=新增,红色删除线=删掉。长按可选中复制。全程本地对比,内容不上传。</div>' +
      '</div>';

    result.querySelectorAll('[data-cu]').forEach(function (el) {
      S.countUp(el, parseFloat(el.getAttribute('data-cu')), { dur: 800, suffix: el.getAttribute('data-suf') || '' });
    });
    var mf = document.getElementById('mf');
    mf.style.background = intensity > 55 ? 'linear-gradient(90deg,#cc2222,#a81c1c)'
      : intensity > 25 ? 'linear-gradient(90deg,#d4a017,#b8860b)' : 'linear-gradient(90deg,#2a7a2a,#3f9b3f)';
    requestAnimationFrame(function () { mf.style.width = Math.max(3, intensity) + '%'; });
    S.scrollIntoView(result);
  }

  function err(m) { result.className = 'result show'; result.innerHTML = '<div class="card reveal"><div class="note"><b>提示:</b> ' + esc(m) + '</div></div>'; }

  document.addEventListener('DOMContentLoaded', function () {
    result = document.getElementById('result');
    document.getElementById('disclaimer').innerHTML = '🔒 ' + esc(D.disclaimer);
    var facts = document.getElementById('facts');
    facts.className = 'facts stagger';
    D.facts.forEach(function (f) { facts.appendChild(S.el('div', 'fact', '<h4>' + esc(f.h) + '</h4><p>' + esc(f.p) + '</p>')); });
    document.getElementById('diffBtn').addEventListener('click', run);
  });
})();
