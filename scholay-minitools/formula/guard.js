/* 公式编辑器 · 降级守卫(classic 脚本,任何环境都能跑)
   若 mathlive(ES 模块)未能加载(如容器不支持 module),1.6s 后自动切到
   「代码模式」:可编辑 LaTeX 文本框 + 符号面板插入,保证工具始终可用。 */
(function () {
  'use strict';
  var D = window.FORMULA_DATA, S = window.Scholay, esc = S.esc;

  function build() {
    if (document.querySelector('#mfhost math-field')) return; // mathlive 正常,守卫退出

    var host = document.getElementById('mfhost');
    host.innerHTML = '<textarea id="latexInput" class="latex-out" placeholder="输入或粘贴 LaTeX…">e^{i\\pi}+1=0</textarea>';
    var ta = document.getElementById('latexInput'), out = document.getElementById('latex');
    function sync() { out.value = ta.value; }
    ta.addEventListener('input', sync); sync();
    var tip = document.querySelector('.mf-tip');
    if (tip) tip.textContent = '当前环境用「代码模式」:点符号插入 LaTeX(无实时渲染)';

    function insert(t) {
      var st = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var en = ta.selectionEnd != null ? ta.selectionEnd : st;
      ta.value = ta.value.slice(0, st) + t + ta.value.slice(en);
      var pos = st + t.length; ta.setSelectionRange(pos, pos);
      sync(); ta.focus();
    }

    var pal = document.getElementById('palette');
    if (!pal.children.length) {
      D.groups.forEach(function (g) {
        pal.appendChild(S.el('div', 'pal-g', esc(g.g)));
        var row = S.el('div', 'pal-row');
        g.items.forEach(function (it) {
          var b = S.el('button', 'pkey', esc(it.l));
          b.addEventListener('click', function () { insert(it.t.replace(/#\?/g, '')); });
          row.appendChild(b);
        });
        pal.appendChild(row);
      });
    }
    var exb = document.getElementById('examples');
    if (!exb.children.length) {
      D.examples.forEach(function (e) {
        var b = S.el('button', 'chip', esc(e.l));
        b.addEventListener('click', function () { ta.value = e.t; sync(); ta.focus(); });
        exb.appendChild(b);
      });
    }
    var facts = document.getElementById('facts');
    if (!facts.children.length) {
      facts.className = 'facts stagger';
      D.facts.forEach(function (f) { facts.appendChild(S.el('div', 'fact', '<h4>' + esc(f.h) + '</h4><p>' + esc(f.p) + '</p>')); });
    }
    var dis = document.getElementById('disclaimer');
    if (!dis.innerHTML) dis.innerHTML = '🔒 ' + esc(D.disclaimer);
  }

  setTimeout(build, 1600);
})();
