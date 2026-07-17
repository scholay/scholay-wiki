/* 落沙实验室 · 20 关卡定义(app.js 与关卡自测共用)
   ctx = { baseline:{}, exAccum:0 };  goal 读 ctx.baseline / ctx.exAccum
   所有阈值经 scratchpad/level-solve.js 自动通关验证,并留 ~25% 余量抗随机 */
(function () {
  'use strict';
  function makeLevels(id, W, H, ctx) {
    function floor(s) { s.fillRect(0, H - 2, W - 1, H - 1, id.STONE); }
    return [
      // ——— 入门:单一机制 ———
      { name: '火种蔓延', brief: '用一点🔥火,把这片植物烧掉九成以上。', allow: [id.FIRE],
        setup: function (s) { floor(s); s.fillRect(52, 108, 128, 176, id.PLANT); },
        init: function (s) { ctx.baseline.p0 = s.count(id.PLANT); },
        goal: function (s) { var p = s.count(id.PLANT); return { done: p <= (ctx.baseline.p0 || 1) * 0.1, text: '剩余植物 ' + p }; } },
      { name: '注满水池', brief: '往石砌水池里灌💧水,蓄满 ≥ 2100 格。', allow: [id.WATER],
        setup: function (s) { floor(s); s.fillRect(44, 150, 48, 250, id.STONE); s.fillRect(132, 150, 136, 250, id.STONE); s.fillRect(44, 247, 136, 250, id.STONE); },
        init: function () {}, goal: function (s) { var w = s.countRect(49, 150, 131, 246, id.WATER); return { done: w >= 2100, text: '蓄水 ' + w + '/2100' }; } },
      { name: '酸蚀矿脉', brief: '倒🧪酸溶解中间的石矿脉,残留 < 300 格。', allow: [id.ACID],
        setup: function (s) { floor(s); s.fillRect(64, 96, 116, 200, id.STONE); },
        init: function () {}, goal: function (s) { var left = s.countRect(64, 96, 116, 200, id.STONE); return { done: left < 300, text: '残留矿石 ' + left + '(<300)' }; } },
      { name: '春回大地', brief: '给种子浇💧水,让它多长出 ≥ 160 株新植物。', allow: [id.WATER],
        setup: function (s) { floor(s); for (var x = 30; x < 150; x += 4) s.fillRect(x, 254, x + 1, 261, id.PLANT); },
        init: function (s) { ctx.baseline.p0 = s.count(id.PLANT); }, goal: function (s) { var g = s.count(id.PLANT) - ctx.baseline.p0; return { done: g >= 160, text: '新长出植物 ' + Math.max(0, g) + '/160' }; } },
      { name: '岩浆铸墙', brief: '让🌋岩浆遇💧水急冷,铸出 ≥ 120 格岩石。', allow: [id.LAVA, id.WATER],
        setup: function (s) { floor(s); s.fillRect(0, 150, 6, H - 1, id.STONE); s.fillRect(W - 6, 150, W - 1, H - 1, id.STONE); },
        init: function (s) { ctx.baseline.s0 = s.count(id.STONE); }, goal: function (s) { var m = s.count(id.STONE) - ctx.baseline.s0; return { done: m >= 120, text: '已铸岩石 ' + Math.max(0, m) + '/120' }; } },
      // ——— 组合反应 ———
      { name: '炸开石墙', brief: '给石墙里的💣炸药点🔥火引爆,炸出通道。', allow: [id.TNT, id.FIRE],
        setup: function (s) { floor(s); s.fillRect(0, 116, W - 1, 140, id.STONE); s.fillRect(80, 120, 100, 136, id.TNT); },
        init: function () {}, goal: function (s) { var left = s.countRect(66, 116, 114, 140, id.STONE); return { done: left < 240, text: '中段残石 ' + left + '(<240)' }; } },
      { name: '油海火攻', brief: '点🔥火,把这片油海烧掉一多半。', allow: [id.FIRE],
        setup: function (s) { floor(s); s.fillRect(34, 198, 146, 232, id.OIL); },
        init: function (s) { ctx.baseline.o0 = s.countRect(34, 198, 146, 232, id.OIL); }, goal: function (s) { var o = s.countRect(34, 198, 146, 232, id.OIL); return { done: o < ctx.baseline.o0 * 0.48, text: '残留油 ' + o + ' / 需 <' + Math.round(ctx.baseline.o0 * 0.48) }; } },
      { name: '决堤蓄水', brief: '灌满这座更大的水库,蓄水 ≥ 4200 格。', allow: [id.WATER],
        setup: function (s) { floor(s); s.fillRect(20, 120, 24, 255, id.STONE); s.fillRect(156, 120, 160, 255, id.STONE); s.fillRect(20, 252, 160, 255, id.STONE); },
        init: function () {}, goal: function (s) { var w = s.countRect(25, 120, 155, 251, id.WATER); return { done: w >= 4200, text: '蓄水 ' + w + '/4200' }; } },
      { name: '酸洗沙丘', brief: '用🧪酸溶掉这座沙丘的大部分,残留 < 420 格。', allow: [id.ACID],
        setup: function (s) { floor(s); for (var x = 40; x <= 140; x++) { var h = Math.round(60 * Math.exp(-Math.pow((x - 90) / 34, 2))); s.fillRect(x, 258 - h, x + 1, 261, id.SAND); } },
        init: function () {}, goal: function (s) { var sd = s.countRect(40, 190, 141, 262, id.SAND); return { done: sd < 420, text: '残留沙 ' + sd + '(<420)' }; } },
      { name: '连锁反应', brief: '给成排💣炸药点🔥火,做出 ≥ 140 次连环爆炸。', allow: [id.TNT, id.FIRE],
        setup: function (s) { floor(s); var xs = [30, 70, 110, 150]; for (var b = 0; b < xs.length; b++) s.fillRect(xs[b] - 9, 150, xs[b] + 9, 168, id.TNT); },
        init: function () { ctx.exAccum = 0; }, goal: function () { return { done: ctx.exAccum >= 140, text: '连环爆炸 ' + ctx.exAccum + '/140' }; } },
      // ——— 进阶 ———
      { name: '灌溉森林', brief: '浇💧水育林,让它多长出 ≥ 300 株新植物。', allow: [id.WATER],
        setup: function (s) { floor(s); for (var x = 20; x < 160; x += 3) s.fillRect(x, 252, x + 1, 261, id.PLANT); },
        init: function (s) { ctx.baseline.p0 = s.count(id.PLANT); }, goal: function (s) { var g = s.count(id.PLANT) - ctx.baseline.p0; return { done: g >= 300, text: '新长出植物 ' + Math.max(0, g) + '/300' }; } },
      { name: '岩浆护城河', brief: '把🌋岩浆灌进护城河,填满 ≥ 1350 格。', allow: [id.LAVA],
        setup: function (s) { floor(s); s.fillRect(0, 150, W - 1, 158, id.STONE); s.fillRect(40, 158, 46, 255, id.STONE); s.fillRect(134, 158, 140, 255, id.STONE); s.fillRect(40, 252, 140, 255, id.STONE); s.fillRect(60, 150, 120, 158, id.EMPTY); },
        init: function () {}, goal: function (s) { var l = s.countRect(46, 158, 134, 251, id.LAVA); return { done: l >= 1350, text: '护城河岩浆 ' + l + '/1350' }; } },
      { name: '灭火救援', brief: '植物在烧!在烧光前用💧水灭掉所有火,保住 ≥ 一半。', allow: [id.WATER],
        setup: function (s) { floor(s); s.fillRect(48, 176, 132, 250, id.PLANT); for (var x = 50; x < 130; x += 3) { var i = 176 * W + x; s.grid()[i] = id.EMBER; s.tex()[i] = 100; } },
        init: function (s) { ctx.baseline.p0 = s.count(id.PLANT); },
        goal: function (s) { var p = s.count(id.PLANT), f = s.count(id.FIRE) + s.count(id.EMBER); if (p < ctx.baseline.p0 * 0.5) return { fail: true, text: '植物烧毁过半,救援失败' }; return { done: f === 0, text: '火 ' + f + ' · 幸存 ' + p + '/' + ctx.baseline.p0 }; } },
      { name: '熔岩铸墙', brief: '岩浆+水急冷,铸出更长的墙 ≥ 240 格岩石。', allow: [id.LAVA, id.WATER],
        setup: function (s) { floor(s); s.fillRect(0, 140, 6, H - 1, id.STONE); s.fillRect(W - 6, 140, W - 1, H - 1, id.STONE); s.fillRect(88, 200, 92, 261, id.STONE); },
        init: function (s) { ctx.baseline.s0 = s.count(id.STONE); }, goal: function (s) { var m = s.count(id.STONE) - ctx.baseline.s0; return { done: m >= 240, text: '已铸岩石 ' + Math.max(0, m) + '/240' }; } },
      { name: '焚天大火', brief: '一把🔥火烧尽这片油+植物森林,残留 < 440 格。', allow: [id.FIRE],
        setup: function (s) { floor(s); s.fillRect(24, 120, 156, 176, id.PLANT); s.fillRect(24, 176, 156, 210, id.OIL); },
        init: function () {}, goal: function (s) { var r = s.countRect(24, 120, 156, 210, id.PLANT) + s.countRect(24, 120, 156, 210, id.OIL); return { done: r < 440, text: '残留可燃 ' + r + '(<440)' }; } },
      // ——— 挑战 ———
      { name: '洪水滔天', brief: '灌满这座巨型基坑,蓄水 ≥ 7500 格。', allow: [id.WATER],
        setup: function (s) { floor(s); s.fillRect(8, 96, 12, 258, id.STONE); s.fillRect(168, 96, 172, 258, id.STONE); s.fillRect(8, 256, 172, 258, id.STONE); },
        init: function () {}, goal: function (s) { var w = s.countRect(13, 96, 167, 255, id.WATER); return { done: w >= 7500, text: '蓄水 ' + w + '/7500' }; } },
      { name: '千钧爆破', brief: '布满💣炸药点🔥火,做出 ≥ 260 次连环爆炸。', allow: [id.TNT, id.FIRE],
        setup: function (s) { floor(s); for (var r = 0; r < 3; r++) for (var c = 0; c < 5; c++) s.fillRect(20 + c * 32, 150 + r * 30, 38 + c * 32, 166 + r * 30, id.TNT); },
        init: function () { ctx.exAccum = 0; }, goal: function () { return { done: ctx.exAccum >= 260, text: '连环爆炸 ' + ctx.exAccum + '/260' }; } },
      { name: '万里长城', brief: '岩浆+水不停铸墙,累计 ≥ 260 格岩石。', allow: [id.LAVA, id.WATER],
        setup: function (s) { floor(s); s.fillRect(0, 120, 6, H - 1, id.STONE); s.fillRect(W - 6, 120, W - 1, H - 1, id.STONE); s.fillRect(58, 200, 62, 261, id.STONE); s.fillRect(118, 200, 122, 261, id.STONE); },
        init: function (s) { ctx.baseline.s0 = s.count(id.STONE); }, goal: function (s) { var m = s.count(id.STONE) - ctx.baseline.s0; return { done: m >= 260, text: '已铸岩石 ' + Math.max(0, m) + '/260' }; } },
      { name: '酸溶巨岩', brief: '用🧪酸溶穿这块巨型岩体,残留 < 660 格。', allow: [id.ACID],
        setup: function (s) { floor(s); s.fillRect(36, 80, 144, 220, id.STONE); },
        init: function () {}, goal: function (s) { var left = s.countRect(36, 80, 144, 220, id.STONE); return { done: left < 660, text: '残留巨岩 ' + left + '(<660)' }; } },
      // ——— 终局 ———
      { name: '火山铸城', brief: '终局!炸开地底💣封印,放🌋岩浆遇💧水铸出 ≥ 68 格岩石。', allow: [id.FIRE, id.WATER],
        setup: function (s) { floor(s); s.fillRect(40, 200, 140, 206, id.TNT); s.fillRect(40, 206, 140, 250, id.LAVA); s.fillRect(38, 200, 40, 252, id.STONE); s.fillRect(140, 200, 142, 252, id.STONE); },
        init: function (s) { ctx.baseline.s0 = s.count(id.STONE); }, goal: function (s) { var m = s.count(id.STONE) - ctx.baseline.s0; return { done: m >= 68, text: '铸城岩石 ' + Math.max(0, m) + '/68' }; } }
    ];
  }
  if (typeof window !== 'undefined') window.makeSandboxLevels = makeLevels;
  if (typeof module !== 'undefined' && module.exports) module.exports = makeLevels;
})();
