/* =========================================================================
   Scholay 小工具 · 共享运行时 (convert.js)
   - 注入底部「转化卡」(本地二维码 + CTA + 文案钩子 → www.scholay.com)
   - 彩带 / 数字滚动 / 结果滚动到视野 等通用动效
   离线合规:无 fetch、无内联脚本、无 eval、事件全用 addEventListener
   ========================================================================= */
(function () {
  'use strict';

  var SITE = 'www.scholay.com';

  // 与 _shared/scholay-qr.svg 同源的二维码(内联,免一次本地图片请求)
  var QR_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" shape-rendering="crispEdges" aria-label="scholay.com">' +
    '<path stroke="#0B1220" d="M0 0.5h7m2 0h2m5 0h1m1 0h7M0 1.5h1m5 0h1m8 0h1m2 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h4m2 0h3m1 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h4m1 0h2m3 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h1m1 0h5m1 0h1m1 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h2m1 0h1m3 0h2m1 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h1m1 0h1m3 0h1m1 0h1M0 8.5h1m1 0h5m2 0h1m1 0h3m4 0h5M1 9.5h1m2 0h2m4 0h1m2 0h1m2 0h2m1 0h1m3 0h1M0 10.5h1m2 0h1m1 0h3m4 0h4m1 0h5m1 0h2M0 11.5h5m2 0h3m1 0h2m2 0h1m1 0h1m1 0h1m4 0h1M0 12.5h1m5 0h1m1 0h1m2 0h4m2 0h4m1 0h3M0 13.5h5m2 0h1m1 0h2m5 0h2m1 0h1m1 0h1m1 0h1M0 14.5h1m2 0h1m2 0h3m1 0h4m1 0h7m1 0h2M0 15.5h1m1 0h4m1 0h2m2 0h1m2 0h1m2 0h1m1 0h2m3 0h1M0 16.5h1m1 0h2m1 0h7m1 0h8m1 0h1M8 17.5h1m3 0h2m1 0h2m3 0h2M0 18.5h7m3 0h1m2 0h2m1 0h1m1 0h1m1 0h1m1 0h3M0 19.5h1m5 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m3 0h2m1 0h1M0 20.5h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h9m1 0h3M0 21.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h1m2 0h1m1 0h1m1 0h5M0 22.5h1m1 0h3m1 0h1m1 0h1m2 0h2m1 0h2m5 0h2m1 0h1M0 23.5h1m5 0h1m2 0h1m1 0h1m2 0h1m1 0h2m1 0h3m2 0h1M0 24.5h7m1 0h5m6 0h6"/></svg>';

  var PROPS = [
    '完整学术检索 · 覆盖真实文献',
    'AI 审稿 · 投稿前先查硬伤',
    '智能写作 Prism · LaTeX 全流程',
    '完整学术检索 · 覆盖真实文献' // 收尾复用首条,让滚动无缝
  ];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- 注入转化卡 ----------
  function mountCTA() {
    var slots = document.querySelectorAll('[data-cta]');
    for (var i = 0; i < slots.length; i++) {
      var lead = slots[i].getAttribute('data-cta') ||
        '把完整平台带走 · 上 <span class="hl">Scholay</span>';
      var rot = PROPS.map(function (p) { return '<i>' + p + '</i>'; }).join('');
      var card = el('div', 'cta rise',
        '<div class="cta-row">' +
          '<div class="cta-qr">' + QR_SVG + '</div>' +
          '<div class="cta-body">' +
            '<div class="lead">' + lead + '</div>' +
            '<div class="cta-rot">' + rot + '</div>' +
            '<div class="cta-url">🌐 <span class="selectable">' + SITE + '</span> <span class="go">↗</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="cta-hint">微信扫码 · 或浏览器搜 scholay.com — 这些小工具背后的完整科研平台</div>'
      );
      slots[i].appendChild(card);
    }
  }

  // ---------- 页脚 ----------
  function mountFoot() {
    var slots = document.querySelectorAll('[data-foot]');
    for (var i = 0; i < slots.length; i++) {
      slots[i].appendChild(el('div', 'foot',
        '仅供参考,请以本校 / 目标期刊 / 官方数据库的最新规定为准。<br>' +
        'Made by <span class="selectable">' + SITE + '</span> · Scholay 学术工具箱'
      ));
    }
  }

  // ---------- 数字滚动 ----------
  function countUp(node, to, opts) {
    opts = opts || {};
    var dur = opts.dur || 900, dec = opts.dec || 0, suffix = opts.suffix || '', prefix = opts.prefix || '';
    var start = null, from = opts.from || 0;
    if (reduceMotion()) { node.textContent = prefix + to.toFixed(dec) + suffix; return; }
    function step(ts) {
      if (start == null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      node.textContent = prefix + (from + (to - from) * e).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------- 环形量规填充 ----------
  // circle 元素 + 半径 r + 百分比(0..1)
  function ringFill(circle, r, pct) {
    var c = 2 * Math.PI * r;
    circle.style.strokeDasharray = c + ' ' + c;
    circle.style.strokeDashoffset = c; // 起点空
    // 强制回流后再设目标值以触发过渡
    void circle.getBoundingClientRect();
    requestAnimationFrame(function () {
      circle.style.strokeDashoffset = c * (1 - Math.max(0, Math.min(1, pct)));
    });
  }

  // ---------- 彩带 ----------
  function confetti(opts) {
    if (reduceMotion()) return;
    opts = opts || {};
    var cv = document.getElementById('confetti');
    if (!cv) { cv = el('canvas'); cv.id = 'confetti'; document.body.appendChild(cv); }
    var ctx = cv.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = window.innerWidth * dpr; cv.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    var W = window.innerWidth, H = window.innerHeight;
    var colors = opts.colors || ['#cc2222', '#2a7a2a', '#d4a017', '#1a56db', '#111111'];
    var n = opts.count || 90, parts = [];
    var originX = opts.x != null ? opts.x : W / 2, originY = opts.y != null ? opts.y : H * 0.32;
    for (var i = 0; i < n; i++) {
      var a = Math.PI * (0.15 + 0.7 * (i / n)) * -1 - 0.2; // 向上扇形
      var sp = 6 + Math.random() * 9;
      parts.push({
        x: originX, y: originY,
        vx: Math.cos(a) * sp * (Math.random() < .5 ? 1 : -1) * .6 + (Math.random() - .5) * 6,
        vy: Math.sin(a) * sp - 4,
        g: 0.28 + Math.random() * 0.12,
        s: 5 + Math.random() * 6, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4,
        c: colors[i % colors.length], life: 0, max: 70 + Math.random() * 40
      });
    }
    var running = true;
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.life++; if (p.life > p.max) continue; alive++;
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (alive > 0) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); running = false; }
    }
    requestAnimationFrame(frame);
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---------- 结果滚动进视野 ----------
  function scrollIntoView(node) {
    if (!node) return;
    try { node.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }); }
    catch (e) { node.scrollIntoView(); }
  }

  // ---------- HTML 转义(数据里含 < > &,innerHTML 前必转) ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- FAQ 手风琴(title/body 均为纯文本,内部 esc) ----------
  function accordion(items) {
    var box = el('div', 'acc');
    items.forEach(function (it) {
      var item = el('div', 'acc-item');
      var q = el('button', 'acc-q', '<span>' + esc(it.title) + '</span><span class="acc-ic">+</span>');
      var a = el('div', 'acc-a', '<div class="acc-a-in">' + esc(it.body) + '</div>');
      q.addEventListener('click', function () { item.classList.toggle('open'); });
      item.appendChild(q); item.appendChild(a); box.appendChild(item);
    });
    return box;
  }

  // 暴露
  window.Scholay = {
    countUp: countUp, ringFill: ringFill, confetti: confetti,
    scrollIntoView: scrollIntoView, reduceMotion: reduceMotion, el: el,
    esc: esc, accordion: accordion
  };

  document.addEventListener('DOMContentLoaded', function () {
    mountCTA(); mountFoot();
  });
})();
