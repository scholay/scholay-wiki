/* 科研统计工具箱 · 纯计算核心(无 DOM,可单测)
   所有公式已按 STATS_DATA 的算例核对。离线纯手算,粗算用途。 */
(function () {
  'use strict';

  function parseNums(str) {
    return String(str || '').split(/[\s,;，、\n\r\t]+/)
      .map(function (t) { return t.trim(); }).filter(function (t) { return t !== ''; })
      .map(Number).filter(function (v) { return isFinite(v); });
  }

  // 标准正态 CDF(A&S 26.2.17,|误差|<7.5e-8)
  function normalCdf(x) {
    var b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937,
        b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419;
    var sign = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + p * x);
    var phi = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    var cdf = 1 - phi * (b1 * t + b2 * t * t + b3 * Math.pow(t, 3) + b4 * Math.pow(t, 4) + b5 * Math.pow(t, 5));
    return sign === 1 ? cdf : 1 - cdf;
  }

  // t 临界值查表(取最接近且不小于的 df 行,∞ 用 1.96/2.576)
  var TT = null;
  function setTTable(tbl) { TT = tbl; }
  function tCrit(df) {
    if (!TT) return null;
    var best = null;
    for (var i = 0; i < TT.length; i++) {
      var d = TT[i].df === '∞' ? Infinity : TT[i].df;
      if (d >= df) { best = TT[i]; break; }
    }
    if (!best) best = TT[TT.length - 1];
    return best;
  }

  function hindex(cites) {
    var c = cites.filter(function (v) { return v >= 0; }).slice().sort(function (a, b) { return b - a; });
    var n = c.length, h = 0, cum = 0, g = 0, i10 = 0;
    for (var i = 1; i <= n; i++) {
      if (c[i - 1] >= i) h = i;
      cum += c[i - 1];
      if (cum >= i * i) g = i;
      if (c[i - 1] >= 10) i10++;
    }
    return { h: h, g: g, i10: i10, sorted: c, n: n };
  }

  function ttest(n1, m1, s1, n2, m2, s2) {
    var sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
    var sp = Math.sqrt(sp2);
    var se = sp * Math.sqrt(1 / n1 + 1 / n2);
    var t = (m1 - m2) / se;
    var df = n1 + n2 - 2;
    var d = (m1 - m2) / sp;
    // Welch
    var a = s1 * s1 / n1, b = s2 * s2 / n2;
    var seW = Math.sqrt(a + b);
    var tW = (m1 - m2) / seW;
    var dfW = (a + b) * (a + b) / (a * a / (n1 - 1) + b * b / (n2 - 1));
    var crit = tCrit(df);
    var pApprox = 2 * (1 - normalCdf(Math.abs(t)));
    var sig = crit ? (Math.abs(t) >= crit.t01 ? 'p < 0.01' : Math.abs(t) >= crit.t05 ? 'p < 0.05' : 'p ≥ 0.05') : '';
    return { t: t, df: df, d: d, se: se, sp: sp, tW: tW, dfW: dfW, crit: crit, pApprox: pApprox, sig: sig };
  }

  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }

  function pearson(x, y) {
    var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my);
    }
    if (sxx === 0 || syy === 0) return NaN;
    return sxy / Math.sqrt(sxx * syy);
  }

  function ranks(a) {
    var idx = a.map(function (v, i) { return { v: v, i: i }; }).sort(function (p, q) { return p.v - q.v; });
    var r = new Array(a.length);
    var j = 0;
    while (j < idx.length) {
      var k = j;
      while (k + 1 < idx.length && idx[k + 1].v === idx[j].v) k++;
      var avg = (j + k) / 2 + 1; // 平均秩(1-based)
      for (var m = j; m <= k; m++) r[idx[m].i] = avg;
      j = k + 1;
    }
    return r;
  }
  function spearman(x, y) { return pearson(ranks(x), ranks(y)); }

  function sampleSizeMeans(delta, sigma, zA, zB) {
    return Math.ceil(2 * Math.pow(zA + zB, 2) * sigma * sigma / (delta * delta));
  }
  function sampleSizeProps(p1, p2, zA, zB) {
    return Math.ceil(Math.pow(zA + zB, 2) * (p1 * (1 - p1) + p2 * (1 - p2)) / Math.pow(p1 - p2, 2));
  }

  function quantileMedian(sorted) {
    var n = sorted.length;
    return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }
  function desc(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var n = a.length, mu = mean(a);
    var ss = a.reduce(function (s, v) { return s + (v - mu) * (v - mu); }, 0);
    var sampleSD = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
    var popSD = Math.sqrt(ss / n);
    var median = quantileMedian(a);
    var half = Math.floor(n / 2);
    var lower = a.slice(0, half);
    var upper = n % 2 ? a.slice(half + 1) : a.slice(half);
    var q1 = lower.length ? quantileMedian(lower) : a[0];
    var q3 = upper.length ? quantileMedian(upper) : a[n - 1];
    var cv = mu !== 0 ? sampleSD / mu * 100 : NaN;
    return { n: n, mean: mu, sampleSD: sampleSD, popSD: popSD, median: median, q1: q1, q3: q3, iqr: q3 - q1, cv: cv, min: a[0], max: a[n - 1], sorted: a };
  }

  var API = {
    parseNums: parseNums, normalCdf: normalCdf, setTTable: setTTable, tCrit: tCrit,
    hindex: hindex, ttest: ttest, pearson: pearson, spearman: spearman, ranks: ranks,
    sampleSizeMeans: sampleSizeMeans, sampleSizeProps: sampleSizeProps, desc: desc, mean: mean
  };
  if (typeof window !== 'undefined') window.StatsCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
