/* 投稿状态词典 · 交互(富数据版) */
(function () {
  'use strict';
  var D = window.STATUS_DATA, S = window.Scholay, esc = S.esc;
  var pipe, result, fill, nodes = [], cur = -1;

  function kv(k, v) {
    if (v == null || v === '') return '';
    return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v selectable">' + esc(v) + '</span></div>';
  }

  function buildPipe() {
    pipe.innerHTML = '<div class="pipe-track"></div><div class="pipe-fill" id="pf"></div>';
    D.stages.forEach(function (st, i) {
      var node = S.el('button', 'node' + (st.normal === 'warn' ? ' warn' : ''),
        '<span class="node-dot">' + esc(st.icon) + '</span>' +
        '<span class="node-text"><b>' + esc(st.step) + '</b>' +
        '<span class="node-em">' + esc(st.em) + '</span></span>' +
        '<span class="node-go">查看</span>');
      node.addEventListener('click', function () { select(i); });
      pipe.appendChild(node);
      nodes.push(node);
    });
    fill = document.getElementById('pf');
  }

  function select(i) {
    cur = i;
    nodes.forEach(function (n, k) {
      n.classList.toggle('active', k === i);
      n.querySelector('.node-dot').classList.toggle('lit', k <= i);
    });
    var dot = nodes[i].querySelector('.node-dot');
    var top = dot.offsetTop + dot.offsetHeight / 2;
    fill.style.height = Math.max(0, Math.min(100, (top / pipe.clientHeight) * 100)) + '%';
    showDetail(D.stages[i]);
  }

  function showDetail(st) {
    var badge = st.normal === 'warn'
      ? '<span class="badge warn">⚠ 需你行动 / 留意</span>'
      : '<span class="badge ok">✓ 此状态属正常流程</span>';
    result.className = 'result show';
    result.innerHTML =
      '<div class="card reveal">' +
        '<div class="card-title"><span class="num">▸</span>' + esc(st.icon + ' ' + st.step) + '</div>' +
        badge +
        '<p class="meaning">' + esc(st.meaning) + '</p>' +
        '<div class="kvs">' +
          kv('Editorial Manager', st.em) +
          kv('ScholarOne', st.s1) +
          kv('典型等待', st.wait) +
        '</div>' +
        (st.other ? '<div class="other"><b>其它系统别名:</b> ' + esc(st.other) + '</div>' : '') +
        '<div class="advice"><span class="advice-h">该不该催?</span>' + esc(st.action) + '</div>' +
      '</div>';
    S.scrollIntoView(result);
  }

  function renderSystems() {
    document.getElementById('systems').innerHTML = D.systems.map(function (s) {
      return '<div class="row2"><div class="row2-top"><b>' + esc(s.name) + '</b></div>' +
        '<div class="row2-body"><b>谁在用:</b>' + esc(s.vendor) + '<br>' + esc(s.note) + '</div></div>';
    }).join('');
  }

  function renderDecisions() {
    document.getElementById('decisions').innerHTML = D.decisions.map(function (d) {
      return '<div class="row2"><div class="row2-top"><b>' + esc(d.name) + '</b></div>' +
        '<div class="row2-body">' + esc(d.meaning) + '<br><b>怎么做:</b>' + esc(d.whatToDo) + '</div></div>';
    }).join('');
  }

  function renderAdvice() {
    document.getElementById('advice').innerHTML = D.adviceTable.map(function (a) {
      var tag = a.normal === 'warn' ? '<span class="atag warn">偏慢</span>' : '<span class="atag ok">正常</span>';
      return '<div class="arow">' + tag + '<div class="acol"><b>' + esc(a.case) + '</b>' +
        '<span>' + esc(a.action) + '</span></div></div>';
    }).join('');
  }

  function renderBench() {
    document.getElementById('benchNote').textContent = D.bench.note;
    function grp(title, arr) {
      return '<div class="bench-grp"><div class="bench-h">' + esc(title) + '</div>' +
        arr.map(function (b) {
          return '<div class="kv"><span class="k">' + esc(b.name) + '</span><span class="v">' + esc(b.time) + '</span></div>';
        }).join('') + '</div>';
    }
    document.getElementById('bench').innerHTML =
      grp('按学科', D.bench.byField) + grp('按系统 / 出版社', D.bench.bySystem);
  }

  function renderEtiquette() {
    document.getElementById('etiquette').innerHTML = '<ul class="ulist">' +
      D.etiquette.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
  }

  function renderTemplates() {
    var tabs = [
      { k: 'statusZh', name: '催稿 · 中文' },
      { k: 'statusEn', name: '催稿 · EN' },
      { k: 'reviseReplyZh', name: '返修回复' }
    ];
    var area = document.getElementById('tplArea'), box = document.getElementById('tplTabs');
    tabs.forEach(function (t, i) {
      var b = S.el('button', 'chip' + (i === 0 ? ' on' : ''), esc(t.name));
      b.addEventListener('click', function () {
        box.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        area.value = D.templates[t.k] || '';
      });
      box.appendChild(b);
    });
    area.value = D.templates.statusZh || '';
  }

  function renderFaqs() {
    document.getElementById('faqs').appendChild(
      S.accordion(D.faqs.map(function (f) { return { title: f.q, body: f.a }; })));
  }

  document.addEventListener('DOMContentLoaded', function () {
    pipe = document.getElementById('pipe');
    result = document.getElementById('result');
    document.getElementById('disclaimer').innerHTML = '⚠️ ' + esc(D.disclaimer);
    buildPipe();
    renderSystems(); renderDecisions(); renderAdvice(); renderBench();
    renderEtiquette(); renderTemplates(); renderFaqs();
  });
})();
