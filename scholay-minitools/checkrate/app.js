/* 查重红线速查 · 交互(富数据版) */
(function () {
  'use strict';
  var D = window.CHECKRATE_DATA, S = window.Scholay, esc = S.esc;
  var groupSeg, itemSeg, result, curGroup = D.groups[0], curItem = null;

  var ZONE = {
    strict: { color: '#cc2222', label: '偏严' },
    mid:    { color: '#d4a017', label: '中等' },
    loose:  { color: '#2a7a2a', label: '较宽' }
  };

  function renderGroups() {
    groupSeg.innerHTML = '';
    D.groups.forEach(function (g) {
      var b = S.el('button', 'chip' + (g === curGroup ? ' on' : ''), esc(g.icon + ' ' + g.label));
      b.addEventListener('click', function () {
        curGroup = g; curItem = null; renderGroups(); renderItems(); hideResult();
      });
      groupSeg.appendChild(b);
    });
  }

  function renderItems() {
    itemSeg.innerHTML = '';
    curGroup.items.forEach(function (it) {
      var b = S.el('button', 'chip' + (it === curItem ? ' on' : ''),
        esc(it.name) + '<span class="sub">' + esc(it.sub) + '</span>');
      b.addEventListener('click', function () { curItem = it; renderItems(); showResult(it); });
      itemSeg.appendChild(b);
    });
    var lbl = document.getElementById('step2label');
    if (lbl) lbl.innerHTML = '在「<b>' + esc(curGroup.label) + '</b>」里选具体场景 · 共 ' + curGroup.items.length + ' 种';
    var hint = document.getElementById('pickHint');
    if (hint) hint.style.display = curItem ? 'none' : '';
  }

  function hideResult() {
    result.className = 'result'; result.innerHTML = '';
    var hint = document.getElementById('pickHint'); if (hint) hint.style.display = '';
  }

  function kv(k, v) {
    if (v == null || v === '') return '';
    return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
  }

  function showResult(it) {
    var z = ZONE[it.zone];
    var rows = kv('总重复率', it.total) +
      (it.noquote && it.noquote !== '—' ? kv('去除引用后', it.noquote) : '') +
      (it.single && it.single !== '—' ? kv('单一来源要求', it.single) : '') +
      (it.aigc && it.aigc !== '—' ? kv('AIGC / AI 率', it.aigc) : '') +
      kv('检测系统', it.system);

    result.className = 'result show';
    result.innerHTML =
      '<div class="card reveal">' +
        '<div class="card-title"><span class="num">✓</span>' + esc(curGroup.label + ' · ' + it.name + ' ' + it.sub) + '</div>' +
        '<div class="gauge">' +
          '<svg viewBox="0 0 120 120" width="150" height="150">' +
            '<circle class="track" cx="60" cy="60" r="52"></circle>' +
            '<circle class="val" cx="60" cy="60" r="52" id="gv"></circle>' +
          '</svg>' +
          '<div class="mid"><div class="big" id="gn">0%</div><div class="lbl">合格线上限</div></div>' +
        '</div>' +
        '<div class="zoneleg">' + zchip('strict', it.zone) + zchip('mid', it.zone) + zchip('loose', it.zone) +
          '<span class="zonehint">红线越紧 = 要求越严</span></div>' +
        '<div class="kvs">' + rows + '</div>' +
        '<div class="note">💡 ' + esc(it.tip) + '</div>' +
      '</div>';

    var gv = document.getElementById('gv'), gn = document.getElementById('gn');
    gv.style.stroke = z.color;
    S.ringFill(gv, 52, it.lineMax / D.scaleMax);
    S.countUp(gn, it.lineMax, { suffix: '%', dur: 950 });
    S.scrollIntoView(result);
  }

  function zchip(zone, cur) {
    var z = ZONE[zone];
    return '<span class="zc' + (zone === cur ? ' on' : '') + '" style="--zc:' + z.color + '">' + z.label + '</span>';
  }

  function renderSystems() {
    var box = document.getElementById('systems');
    box.innerHTML = (D.systems || []).map(function (s) {
      return '<div class="row2"><div class="row2-top"><b>' + esc(s.name) + '</b>' +
        '<span class="row2-tag">' + esc(s.code) + '</span></div>' +
        '<div class="row2-body"><b>比对库:</b>' + esc(s.lib) + '<br>' +
        '<b>AIGC 检测:</b>' + esc(s.aigc) + ' · ' + esc(s.note) + '</div></div>';
    }).join('');
  }

  function renderAigc() {
    var a = D.aigc, box = document.getElementById('aigc');
    if (!a) return;
    var th = (a.thresholds || []).map(function (t) {
      return '<div class="kv"><span class="k">' + esc(t.scene) + '</span><span class="v">' + esc(t.val) + '</span></div>';
    }).join('');
    var prove = (a.howToProve || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    box.innerHTML =
      '<div class="sec-sub">' + esc(a.intro) + '</div>' +
      '<div class="kvs" style="margin-bottom:12px">' + th + '</div>' +
      '<div class="note" style="margin-bottom:12px"><b>为什么手写也被判 AI?</b> ' + esc(a.whyMisjudged) + '</div>' +
      '<div class="sec-h">🛡️ 被误判如何自证</div>' +
      '<ol class="olist">' + prove + '</ol>';
  }

  function renderReduce() {
    var box = document.getElementById('reduce');
    box.innerHTML = '<ol class="olist">' +
      (D.reduce || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>';
  }

  function renderFacts() {
    var box = document.getElementById('facts');
    box.className = 'facts stagger';
    box.innerHTML = '';
    D.facts.forEach(function (f) {
      box.appendChild(S.el('div', 'fact', '<h4>' + esc(f.h) + '</h4><p>' + esc(f.p) + '</p>'));
    });
  }

  function renderFaqs() {
    var box = document.getElementById('faqs');
    box.appendChild(S.accordion((D.faqs || []).map(function (f) { return { title: f.q, body: f.a }; })));
  }

  document.addEventListener('DOMContentLoaded', function () {
    groupSeg = document.getElementById('groupSeg');
    itemSeg = document.getElementById('itemSeg');
    result = document.getElementById('result');
    document.getElementById('disclaimer').innerHTML = '⚠️ ' + esc(D.disclaimer || '');
    renderGroups(); renderItems();
    renderSystems(); renderAigc(); renderReduce(); renderFacts(); renderFaqs();
  });
})();
