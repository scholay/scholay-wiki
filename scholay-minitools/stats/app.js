/* 科研统计工具箱 · 交互 */
(function () {
  'use strict';
  var D = window.STATS_DATA, C = window.StatsCore, S = window.Scholay, esc = S.esc;
  C.setTTable(D.tTable);
  var modSeg, inputs, result, modName, modDesc, explain, calcBtn, cur, ssMode = 'means';

  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function num(id) { return parseFloat(v(id)); }
  function tiles(arr) {
    return '<div class="tiles">' + arr.map(function (t) {
      return '<div class="tile"><div class="tile-v" data-cu="' + t.val + '"' +
        (t.dec != null ? ' data-dec="' + t.dec + '"' : '') + '>0</div><div class="tile-k">' + esc(t.k) + '</div></div>';
    }).join('') + '</div>';
  }
  function kv(k, val) { return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(val) + '</span></div>'; }
  function err(msg) { result.className = 'result show'; result.innerHTML = '<div class="card reveal"><div class="note"><b>输入有误:</b> ' + esc(msg) + '</div></div>'; S.scrollIntoView(result); }

  function show(html, draw) {
    result.className = 'result show';
    result.innerHTML = '<div class="card reveal">' + html + '</div>';
    // 数字滚动
    result.querySelectorAll('[data-cu]').forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-cu'));
      var dec = el.getAttribute('data-dec');
      S.countUp(el, to, { dec: dec != null ? +dec : (Number.isInteger(to) ? 0 : 2), dur: 800 });
    });
    if (draw) draw();
    S.scrollIntoView(result);
  }

  // ---------- Canvas ----------
  function setup(cv) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    return { ctx: ctx, w: w, h: h };
  }
  // canvas 2D 无法读 CSS 变量,以下色值是 globals.css 的手工镜像:
  //   #882828 朱砂(数据点/柱)· #2E5AA8 = globals --cat-blue(回归线;它是"规范外的第五色相",
  //   只用于必须多色相区分的图表,不是品牌色)· #686873 muted-foreground(轴标签)。
  function barsChart(id, vals, hLine) {
    var cv = document.getElementById(id); if (!cv) return;
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h, pad = 6, n = vals.length;
    var max = Math.max.apply(null, vals.concat([1])), bw = (w - pad * 2) / n;
    vals.forEach(function (val, i) {
      var bh = (h - 20) * (val / max), x = pad + i * bw, y = h - 16 - bh;
      var below = i + 1 <= hLine;
      ctx.fillStyle = below ? '#882828' : 'rgba(0,0,0,.10)';
      ctx.fillRect(x + bw * 0.12, y, bw * 0.76, bh);
    });
    // h 参考线
    if (hLine > 0) {
      var hy = h - 16 - (h - 20) * (Math.min(hLine, max) / max);
      ctx.strokeStyle = '#2E5AA8'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pad, hy); ctx.lineTo(w - pad, hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#2E5AA8'; ctx.font = '11px sans-serif';
      ctx.fillText('h = ' + hLine, pad + 2, hy - 4);
    }
  }
  function scatterChart(id, x, y) {
    var cv = document.getElementById(id); if (!cv) return;
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h, pad = 16;
    var xn = Math.min.apply(null, x), xx = Math.max.apply(null, x), yn = Math.min.apply(null, y), yx = Math.max.apply(null, y);
    function px(v) { return xx === xn ? w / 2 : pad + (v - xn) / (xx - xn) * (w - pad * 2); }
    function py(v) { return yx === yn ? h / 2 : h - pad - (v - yn) / (yx - yn) * (h - pad * 2); }
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    for (var i = 0; i < x.length; i++) {
      ctx.beginPath(); ctx.arc(px(x[i]), py(y[i]), 4, 0, 7); ctx.fillStyle = '#882828'; ctx.fill();
    }
  }
  function boxChart(id, st) {
    var cv = document.getElementById(id); if (!cv) return;
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h, pad = 30, cy = h / 2, bh = 34;
    var lo = st.min, hi = st.max, rng = hi - lo || 1;
    function X(val) { return pad + (val - lo) / rng * (w - pad * 2); }
    ctx.strokeStyle = 'rgba(0,0,0,.40)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(lo), cy); ctx.lineTo(X(st.q1), cy); ctx.moveTo(X(st.q3), cy); ctx.lineTo(X(hi), cy); ctx.stroke();
    ctx.fillStyle = 'rgba(136, 40, 40,.14)'; ctx.strokeStyle = '#882828';
    ctx.fillRect(X(st.q1), cy - bh / 2, X(st.q3) - X(st.q1), bh);
    ctx.strokeRect(X(st.q1), cy - bh / 2, X(st.q3) - X(st.q1), bh);
    ctx.strokeStyle = '#2E5AA8'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(X(st.median), cy - bh / 2); ctx.lineTo(X(st.median), cy + bh / 2); ctx.stroke();
    ['最小 ' + st.min, '中位 ' + st.median, '最大 ' + st.max].forEach(function (t, i) {
      var xv = [X(lo), X(st.median), X(hi)][i];
      ctx.fillStyle = '#686873'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(t, Math.max(20, Math.min(w - 20, xv)), i === 1 ? cy - bh / 2 - 6 : cy + bh / 2 + 14);
    });
  }

  // ---------- 模块 ----------
  var MOD = {
    hindex: {
      inputs: '<label class="fld"><span>各篇论文被引次数(逗号/空格分隔)</span>' +
        '<textarea id="cites" class="ta" rows="3">12,10,8,5,4,3,2,1,0,0</textarea></label>',
      calc: function () {
        var c = C.parseNums(v('cites'));
        if (c.length < 1) return err('请至少输入一篇论文的被引次数');
        var r = C.hindex(c);
        show(
          tiles([{ k: 'h 指数', val: r.h }, { k: 'g 指数', val: r.g }, { k: 'i10 指数', val: r.i10 }]) +
          '<canvas id="cv" class="chart"></canvas>' +
          '<div class="chartcap">按被引降序 · 蓝色为计入 h 的前 ' + r.h + ' 篇 · 青虚线 = h</div>' +
          '<div class="note">共 ' + r.n + ' 篇。g ≥ h 恒成立;三者强依赖学科与学术年龄,跨领域不可直接比。</div>',
          function () { barsChart('cv', r.sorted, r.h); });
      }
    },
    ttest: {
      inputs:
        '<div class="grp"><div class="grp-h">组 1</div><div class="frow">' +
          fnum('n1', 'n', 10) + fnum('m1', '均值', 85) + fnum('s1', '标准差', 5) + '</div></div>' +
        '<div class="grp"><div class="grp-h">组 2</div><div class="frow">' +
          fnum('n2', 'n', 12) + fnum('m2', '均值', 80) + fnum('s2', '标准差', 6) + '</div></div>',
      calc: function () {
        var n1 = num('n1'), m1 = num('m1'), s1 = num('s1'), n2 = num('n2'), m2 = num('m2'), s2 = num('s2');
        if (![n1, m1, s1, n2, m2, s2].every(isFinite)) return err('请完整填写两组的 n、均值、标准差');
        if (n1 < 2 || n2 < 2) return err('每组样本量 n 需 ≥ 2');
        var r = C.ttest(n1, m1, s1, n2, m2, s2);
        var mag = Math.abs(r.d) >= 0.8 ? '大效应' : Math.abs(r.d) >= 0.5 ? '中效应' : Math.abs(r.d) >= 0.2 ? '小效应' : '微弱';
        show(
          tiles([{ k: 't 值', val: r.t, dec: 3 }, { k: '自由度 df', val: r.df }, { k: "Cohen's d", val: Math.abs(r.d), dec: 3 }]) +
          '<div class="kvs">' +
            kv('显著性(查表判定)', r.sig) +
            kv('效应量大小', mag + '(|d|=' + Math.abs(r.d).toFixed(3) + ')') +
            kv('标准误 SE', r.se.toFixed(3)) +
            kv('Welch t / df', r.tW.toFixed(3) + ' / ' + r.dfW.toFixed(1)) +
            kv('近似双侧 p', r.pApprox.toFixed(4) + '(大 df 更准)') +
          '</div>' +
          '<div class="note">t 只说“有没有差”,Cohen\'s d 说“差多大”;样本大时微小差异也会显著。两组方差差异大时以 <b>Welch</b> 为准。</div>');
      }
    },
    corr: {
      inputs: '<label class="fld"><span>变量 X(逗号/空格分隔)</span><textarea id="xs" class="ta" rows="2">1,2,3,4,5</textarea></label>' +
        '<label class="fld"><span>变量 Y(与 X 一一对应)</span><textarea id="ys" class="ta" rows="2">2,3,5,4,6</textarea></label>',
      calc: function () {
        var x = C.parseNums(v('xs')), y = C.parseNums(v('ys'));
        if (x.length < 3 || x.length !== y.length) return err('X、Y 需等长且各 ≥ 3 个数');
        var r = C.pearson(x, y), rho = C.spearman(x, y);
        function lab(v) { var a = Math.abs(v); return a >= 0.5 ? '强' : a >= 0.3 ? '中' : a >= 0.1 ? '弱' : '几乎无'; }
        show(
          tiles([{ k: 'Pearson r', val: r, dec: 3 }, { k: 'Spearman ρ', val: rho, dec: 3 }]) +
          '<canvas id="cv" class="chart"></canvas><div class="chartcap">散点图(X–Y)</div>' +
          '<div class="kvs">' + kv('线性关系(Pearson)', lab(r) + (r >= 0 ? ' 正相关' : ' 负相关')) +
          kv('单调关系(Spearman)', lab(rho) + (rho >= 0 ? ' 正相关' : ' 负相关')) + '</div>' +
          '<div class="note">相关不等于因果;有异常值或偏态、等级数据时以 <b>Spearman</b> 为准。</div>',
          function () { scatterChart('cv', x, y); });
      }
    },
    samplesize: {
      inputs: '', // 动态
      render: function () {
        var el = document.getElementById('inputs');
        el.innerHTML =
          '<div class="seg" id="ssMode" style="margin-bottom:12px">' +
            '<button class="chip' + (ssMode === 'means' ? ' on' : '') + '" data-m="means">两组均数比较</button>' +
            '<button class="chip' + (ssMode === 'props' ? ' on' : '') + '" data-m="props">两组率比较</button></div>' +
          (ssMode === 'means'
            ? '<div class="frow">' + fnum('delta', '均值差 Δ', 5) + fnum('sigma', '共同标准差 σ', 10) + '</div>'
            : '<div class="frow">' + fnum('p1', '组1 率 p₁', 0.3, '0.30') + fnum('p2', '组2 率 p₂', 0.5, '0.50') + '</div>') +
          '<div class="frow">' + fsel('alpha', 'α(显著性)', [['0.05', 'α=0.05 双侧'], ['0.01', 'α=0.01'], ['0.10', 'α=0.10']]) +
            fsel('power', 'Power(把握度)', [['0.80', '0.80'], ['0.90', '0.90'], ['0.95', '0.95']]) + '</div>';
        el.querySelectorAll('#ssMode .chip').forEach(function (c) {
          c.addEventListener('click', function () { ssMode = c.getAttribute('data-m'); MOD.samplesize.render(); });
        });
      },
      calc: function () {
        var zA = { '0.05': 1.96, '0.01': 2.576, '0.10': 1.645 }[v('alpha')];
        var zB = { '0.80': 0.842, '0.90': 1.282, '0.95': 1.645 }[v('power')];
        var n;
        if (ssMode === 'means') {
          var delta = num('delta'), sigma = num('sigma');
          if (!isFinite(delta) || !isFinite(sigma) || delta === 0 || sigma <= 0) return err('请填写有效的 Δ(≠0)与 σ(>0)');
          n = C.sampleSizeMeans(delta, sigma, zA, zB);
        } else {
          var p1 = num('p1'), p2 = num('p2');
          if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1) || p1 === p2) return err('两个率需在 0–1 之间且不相等');
          n = C.sampleSizeProps(p1, p2, zA, zB);
        }
        show(
          tiles([{ k: '每组样本量', val: n }, { k: '总样本量', val: n * 2 }]) +
          '<div class="note">正态近似“快速估算”:效应减半约需 4 倍样本。有脱落率 r 时按 n/(1−r) 上取整。精确解请用 <b>G*Power / R(pwr)</b> 复核。</div>');
      }
    },
    desc: {
      inputs: '<label class="fld"><span>一列数值(逗号/空格分隔)</span><textarea id="data" class="ta" rows="3">2,4,4,4,5,5,7,9</textarea></label>',
      calc: function () {
        var a = C.parseNums(v('data'));
        if (a.length < 2) return err('请至少输入 2 个数值');
        var r = C.desc(a);
        show(
          tiles([{ k: '均值', val: r.mean, dec: 2 }, { k: '样本 SD', val: r.sampleSD, dec: 2 }, { k: '中位数', val: r.median, dec: 2 }]) +
          '<canvas id="cv" class="chart" style="height:110px"></canvas><div class="chartcap">箱线图(Q1 – 中位 – Q3,须延伸至最值)</div>' +
          '<div class="kvs">' +
            kv('样本量 n', r.n) + kv('总体 SD', r.popSD.toFixed(3)) +
            kv('Q1 / Q3', r.q1 + ' / ' + r.q3) + kv('四分位距 IQR', String(r.iqr)) +
            kv('变异系数 CV', isFinite(r.cv) ? r.cv.toFixed(1) + '%' : '—') +
            kv('最小 / 最大', r.min + ' / ' + r.max) +
          '</div>' +
          '<div class="note">偏态或有异常值时,中位数(IQR)比“均值±SD”更稳健。四分位算法多样(此处 Tukey 折半),不同软件可能略异。</div>',
          function () { boxChart('cv', r); });
      }
    }
  };

  function fnum(id, label, val, ph) {
    return '<label class="fld sm"><span>' + esc(label) + '</span>' +
      '<input id="' + id + '" class="inp" type="number" inputmode="decimal" value="' + val + '"' +
      (ph ? ' placeholder="' + ph + '"' : '') + '></label>';
  }
  function fsel(id, label, opts) {
    return '<label class="fld sm"><span>' + esc(label) + '</span><select id="' + id + '" class="inp">' +
      opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  }

  function selectMod(id) {
    cur = id;
    var m = D.modules.filter(function (x) { return x.id === id; })[0];
    modName.textContent = m.name;
    modDesc.textContent = m.desc;
    result.className = 'result'; result.innerHTML = '';
    if (MOD[id].render) MOD[id].render();
    else inputs.innerHTML = MOD[id].inputs;
    renderExplain(m);
    // 高亮
    modSeg.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-id') === id); });
  }

  function renderExplain(m) {
    var ex = (m.example || []).map(function (e) {
      return '<div class="eg"><div class="eg-in">输入 · ' + esc(e.in) + '</div><div class="eg-out">' + esc(e.out) + '</div></div>';
    }).join('');
    explain.innerHTML =
      '<div class="ex-block"><b>公式</b><p>' + esc(m.formula) + '</p></div>' +
      '<div class="ex-block"><b>怎么解读</b><p>' + esc(m.interpret) + '</p></div>' +
      '<div class="ex-block"><b>算例</b>' + ex + '</div>' +
      '<div class="note">⚠️ ' + esc(m.caveat) + '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    modSeg = document.getElementById('modSeg');
    inputs = document.getElementById('inputs');
    result = document.getElementById('result');
    modName = document.getElementById('modName');
    modDesc = document.getElementById('modDesc');
    explain = document.getElementById('explain');
    calcBtn = document.getElementById('calcBtn');
    document.getElementById('disclaimer').innerHTML = '⚠️ ' + esc(D.notes);
    D.modules.forEach(function (m) {
      var b = S.el('button', 'chip', esc(m.name));
      b.setAttribute('data-id', m.id);
      b.addEventListener('click', function () { selectMod(m.id); });
      modSeg.appendChild(b);
    });
    calcBtn.addEventListener('click', function () { MOD[cur].calc(); });
    selectMod('hindex');
  });
})();
