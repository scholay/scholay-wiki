/* 掠夺性期刊红旗自测 · 交互(富数据版) */
(function () {
  'use strict';
  var D = window.PREDATORY_DATA, S = window.Scholay, esc = S.esc;
  var flagsBox, result, meterFill, scoreNum, levelLbl, riskEmoji, diagBtn, riskcard;
  var picked = {};
  var TOTAL = D.flags.reduce(function (a, f) { return a + f.w; }, 0);

  // 色值真源:globals.css。#4D1616 = red-3(比 --brand #882828 更深一档,给最高危档)。
  // JS 内联无法读 CSS 变量,改 globals 时须同步这里与 _shared/brand.css。
  var LV = [
    { key: 'low',   name: '低风险',            color: '#2F4D29', emoji: '🟢', badge: 'ok' },
    { key: 'watch', name: '需留意',            color: '#E5A800', emoji: '🧐', badge: 'warn' },
    { key: 'high',  name: '偏高风险',          color: '#882828', emoji: '⚠️', badge: 'warn' },
    { key: 'crit',  name: '高危 · 疑似问题刊', color: '#4D1616', emoji: '🚨', badge: 'bad' }
  ];

  function level(pct, n, strong) {
    if (n === 0) return LV[0];
    var L = pct <= 25 ? LV[1] : pct <= 55 ? LV[2] : LV[3];
    if (strong && L === LV[1]) L = LV[2]; // 命中强信号至少偏高
    return L;
  }
  function state() {
    var sum = 0, n = 0, strong = false;
    D.flags.forEach(function (f) { if (picked[f.id]) { sum += f.w; n++; if (f.w >= 3) strong = true; } });
    var pct = Math.round(sum / TOTAL * 100);
    return { sum: sum, n: n, pct: pct, strong: strong, L: level(pct, n, strong) };
  }

  function refresh() {
    var s = state();
    meterFill.style.width = (s.n === 0 ? 0 : Math.max(6, s.pct)) + '%';
    meterFill.style.background = 'linear-gradient(90deg,' + s.L.color + ',' + s.L.color + 'cc)';
    scoreNum.textContent = s.pct;
    levelLbl.textContent = s.n === 0 ? '尚未勾选' : (s.L.emoji + ' ' + s.L.name + ' · 命中 ' + s.n + ' 项');
    levelLbl.style.color = s.n === 0 ? 'var(--ink-mut)' : s.L.color;
    riskEmoji.textContent = s.n === 0 ? '🩺' : s.L.emoji;
  }

  function renderFlags() {
    // 按 cat 分组
    var order = [], byCat = {};
    D.flags.forEach(function (f) {
      if (!byCat[f.cat]) { byCat[f.cat] = []; order.push(f.cat); }
      byCat[f.cat].push(f);
    });
    flagsBox.innerHTML = '';
    order.forEach(function (cat) {
      flagsBox.appendChild(S.el('div', 'flag-cat', esc(cat)));
      byCat[cat].forEach(function (f) {
        var card = S.el('button', 'flag',
          '<span class="flag-ck"></span>' +
          '<span class="flag-ic">' + esc(f.icon) + '</span>' +
          '<span class="flag-tx"><b>' + esc(f.t) + (f.w >= 3 ? '<span class="strong">强信号</span>' : '') + '</b>' +
          '<span>' + esc(f.d) + '</span></span>');
        card.addEventListener('click', function () {
          picked[f.id] = !picked[f.id];
          card.classList.toggle('on', !!picked[f.id]);
          refresh();
        });
        flagsBox.appendChild(card);
      });
    });
  }

  function diagnose() {
    var s = state();
    // 取对应 score 文案
    var sc = D.score, advice;
    if (s.n === 0) advice = sc[0].advice;
    else if (s.L.key === 'watch') advice = sc[1].advice;
    else if (s.L.key === 'high') advice = sc[2].advice;
    else advice = sc[3].advice;
    var strongAdvice = s.strong ? sc[4].advice : '';

    var hits = D.flags.filter(function (f) { return picked[f.id]; })
      .map(function (f) { return '<span class="hit">' + esc(f.icon + ' ' + f.t) + '</span>'; }).join('');
    var tcs = D.tcs.map(function (t) {
      return '<div class="tcs"><span class="tcs-k">' + esc(t.k) + '</span><span class="tcs-v">' + esc(t.v) + '</span></div>';
    }).join('');
    var chans = D.channels.map(function (c) {
      return '<div class="chan"><div class="chan-top"><b>' + esc(c.name) + '</b><span class="chan-kind">' + esc(c.kind) + '</span></div>' +
        '<div class="chan-url selectable">🔗 ' + esc(c.url) + '</div>' +
        '<div class="chan-note">' + esc(c.note) + '</div></div>';
    }).join('');

    result.className = 'result show';
    result.innerHTML =
      '<div class="card reveal">' +
        '<div class="card-title"><span class="num">★</span>风险诊断</div>' +
        '<div class="diag-head"><span class="badge ' + s.L.badge + '">' + s.L.emoji + ' ' + esc(s.L.name) +
          '</span><span class="diag-score">风险分 ' + s.pct + '%</span></div>' +
        '<p class="interp">' + esc(advice) + '</p>' +
        (strongAdvice ? '<div class="note" style="margin-bottom:14px"><b>❗ 强信号:</b> ' + esc(strongAdvice) + '</div>' : '') +
        (hits ? '<div class="hits">' + hits + '</div>' : '') +
        '<div class="sub-h">📋 Think · Check · Submit(逐项打勾再投)</div>' + tcs +
        '<div class="sub-h">🔎 官方核实渠道(手动打开,容器内不能点跳)</div>' +
        '<div class="chans">' + chans + '</div>' +
        '<div class="note">' + esc(D.bealls) + '</div>' +
      '</div>';
    S.scrollIntoView(result);
    if (s.n === 0) S.confetti({ y: window.innerHeight * 0.4 });
    else if (s.L.key === 'crit') { riskcard.classList.remove('shake'); void riskcard.offsetWidth; riskcard.classList.add('shake'); }
  }

  function renderHijack() {
    document.getElementById('hijackIntro').textContent = D.hijack.intro;
    document.getElementById('hijackHow').innerHTML = '<ol class="olist">' +
      D.hijack.howTo.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ol>';
  }
  function renderFaqs() {
    document.getElementById('faqs').appendChild(
      S.accordion(D.faqs.map(function (f) { return { title: f.q, body: f.a }; })));
  }

  document.addEventListener('DOMContentLoaded', function () {
    flagsBox = document.getElementById('flags');
    result = document.getElementById('result');
    meterFill = document.getElementById('meterFill');
    scoreNum = document.getElementById('scoreNum');
    levelLbl = document.getElementById('levelLbl');
    riskEmoji = document.getElementById('riskEmoji');
    diagBtn = document.getElementById('diagBtn');
    riskcard = document.querySelector('.riskcard');
    document.getElementById('disclaimer').innerHTML = '⚠️ ' + esc(D.disclaimer);
    renderFlags(); refresh(); renderHijack(); renderFaqs();
    diagBtn.addEventListener('click', diagnose);
  });
})();
