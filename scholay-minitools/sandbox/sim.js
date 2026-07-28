/* 落沙实验室 · 元胞自动机内核(纯计算,无 DOM,可 node 单测)
   固定向下重力(禁传感器);粉末/液体/气体三态 + 反应链。 */
(function () {
  'use strict';

  var W = 180, H = 264, N = W * H;

  // 元素 id
  var EMPTY = 0, STONE = 1, SAND = 2, WATER = 3, PLANT = 4, OIL = 5,
      LAVA = 6, ACID = 7, ICE = 8, FIRE = 9, STEAM = 10, SMOKE = 11, EMBER = 12, TNT = 13;

  // 可涂画的画笔(供 UI 生成面板)
  var ELEMENTS = [
    { id: SAND,  key: 'sand',  name: '沙',   emoji: '🏖️', color: '#e3c078' },
    { id: WATER, key: 'water', name: '水',   emoji: '💧', color: '#3f7fe0' },
    { id: STONE, key: 'stone', name: '石',   emoji: '🪨', color: '#7b8494' },
    { id: PLANT, key: 'plant', name: '植物', emoji: '🌱', color: '#3fa65e' },
    { id: OIL,   key: 'oil',   name: '油',   emoji: '🛢️', color: '#5a4a33' },
    { id: LAVA,  key: 'lava',  name: '岩浆', emoji: '🌋', color: '#ff7a1a' },
    { id: ACID,  key: 'acid',  name: '酸',   emoji: '🧪', color: '#a3e635' },
    { id: ICE,   key: 'ice',   name: '冰',   emoji: '🧊', color: '#a5e8ff' },
    { id: FIRE,  key: 'fire',  name: '火',   emoji: '🔥', color: '#ff8a2a' },
    { id: TNT,   key: 'tnt',   name: '炸药', emoji: '💣', color: '#e0564b' },
    { id: EMPTY, key: 'eraser', name: '橡皮', emoji: '🧽', color: '#E8E5DC' }
  ];

  // 密度:固体 99 静止;液体各异;气体 0;空 1
  var DENS = new Float32Array(14);
  DENS[EMPTY] = 1; DENS[STONE] = 99; DENS[SAND] = 6; DENS[WATER] = 3; DENS[PLANT] = 99;
  DENS[OIL] = 2; DENS[LAVA] = 5; DENS[ACID] = 3; DENS[ICE] = 99;
  DENS[FIRE] = 0; DENS[STEAM] = 0; DENS[SMOKE] = 0; DENS[EMBER] = 99; DENS[TNT] = 99;

  function isLiquid(e) { return e === WATER || e === OIL || e === ACID || e === LAVA; }
  function isGas(e) { return e === FIRE || e === STEAM || e === SMOKE; }
  function isFluid(e) { return isLiquid(e) || isGas(e); }
  function flammable(e) { return e === PLANT || e === OIL; }

  var g = new Uint8Array(N);   // 元素
  var t = new Uint8Array(N);   // 纹理种子 / 寿命
  var mv = new Uint8Array(N);  // 本帧是否已动
  var vel = new Uint8Array(N); // 下落速度(粉末/液体,产生加速度手感)
  var frame = 0;
  var explosions = [];         // 本帧爆炸事件(供上层做震屏/火花),上层读后清空
  var pending = [];            // 连锁爆炸队列

  // 液体水平扩散距离(决定"摊平"速度;岩浆黏稠只有 1)
  var DISP = new Uint8Array(14);
  DISP[WATER] = 4; DISP[ACID] = 3; DISP[OIL] = 2; DISP[LAVA] = 1;

  function ri(a, b) { return (a + Math.random() * (b - a)) | 0; }

  function set(i, e) {
    g[i] = e;
    vel[i] = 0;
    t[i] = e === FIRE ? ri(16, 30) : e === EMBER ? ri(70, 130)
      : e === STEAM ? ri(90, 180) : e === SMOKE ? ri(60, 130)
      : (Math.random() * 255) | 0;
  }
  function swap(i, j) {
    var a = g[i]; g[i] = g[j]; g[j] = a;
    var b = t[i]; t[i] = t[j]; t[j] = b;
    var c = vel[i]; vel[i] = vel[j]; vel[j] = c;
    mv[i] = 1; mv[j] = 1;
  }

  // 能否往目标格移动(密度:目标更轻则可沉入)
  function canMove(e, j) {
    if (j < 0 || j >= N) return false;
    var o = g[j];
    return o === EMPTY || (isFluid(o) && DENS[o] < DENS[e]);
  }
  // 气体能否上浮到目标(空 或 液体)
  function canRise(j) {
    if (j < 0 || j >= N) return false;
    var o = g[j];
    return o === EMPTY || isLiquid(o);
  }

  function step() {
    mv.fill(0);
    frame++;
    var dir = (frame & 1) ? 1 : -1;
    for (var y = H - 1; y >= 0; y--) {
      for (var k = 0; k < W; k++) {
        var x = dir > 0 ? k : (W - 1 - k);
        var i = y * W + x;
        if (mv[i]) continue;
        var e = g[i];
        if (e === EMPTY) continue;
        switch (e) {
          case SAND:  powder(i, x, y, e); break;
          case WATER: water(i, x, y); break;
          case OIL:   liquid(i, x, y, OIL); break;
          case ACID:  acid(i, x, y); break;
          case LAVA:  lava(i, x, y); break;
          case FIRE:  fire(i, x, y); break;
          case EMBER: ember(i, x, y); break;
          case STEAM: gas(i, x, y, STEAM); break;
          case SMOKE: gas(i, x, y, SMOKE); break;
          case PLANT: plant(i, x, y); break;
          case ICE:   ice(i, x, y); break;
          case TNT:   tnt(i, x, y); break;
          // STONE 静止
        }
      }
    }
    // 连锁爆炸(本帧内处理完,含二次引爆)
    var guard = 0;
    while (pending.length && guard++ < 3000) { var p = pending.shift(); explode(p[0], p[1], p[2]); }
  }

  function tnt(i, x, y) {
    // 静态固体(可像积木一样堆砌搭结构),遇火/热引爆
    var dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (var k = 0; k < 8; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      var o = g[j];
      if (o === FIRE || o === EMBER || o === LAVA) { g[i] = EMPTY; explode(x, y, 12); return; }
    }
  }

  function explode(cx, cy, R) {
    explosions.push({ x: cx, y: cy, r: R });
    var R2 = R * R;
    for (var dy = -R; dy <= R; dy++) {
      for (var dx = -R; dx <= R; dx++) {
        var dd = dx * dx + dy * dy; if (dd > R2) continue;
        var x = cx + dx, y = cy + dy; if (x < 0 || x >= W || y < 0 || y >= H) continue;
        var j = y * W + x, o = g[j];
        if (o === TNT) { g[j] = EMPTY; pending.push([x, y, R]); continue; }   // 连锁
        if (o === STONE) { if (Math.random() < 0.55) g[j] = EMPTY; else continue; } // 石头较硬
        else if (flammable(o)) { set(j, EMBER); continue; }
        else if (o !== EMPTY) { g[j] = EMPTY; }                                // 沙/冰/液体被冲散
        // 火球:内圈密、外圈疏
        if (dd < R2 * 0.45) { if (Math.random() < 0.6) set(j, Math.random() < 0.55 ? FIRE : EMBER); }
        else if (Math.random() < 0.16) set(j, FIRE);
      }
    }
  }

  // 邻居索引(越界返回 -1)
  function nb(x, y, dx, dy) {
    var nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return -1;
    return ny * W + nx;
  }

  // 竖直下落(带加速度):最多连落 v 格;落入液体减速。返回是否移动。
  function fall(i, x, y, e) {
    var v = vel[i] + 1; if (v > 5) v = 5;
    var ci = i, cy = y, moved = 0;
    for (var s = 0; s < v; s++) {
      var d = nb(x, cy, 0, 1);
      if (!canMove(e, d)) break;
      var intoLiquid = isLiquid(g[d]);
      swap(ci, d); ci = d; cy++; moved++;
      if (intoLiquid) { v = 1; break; }   // 入水减速
    }
    if (moved) { vel[ci] = v; return true; }
    vel[i] = 0;
    return false;
  }

  function powder(i, x, y, e) {
    if (fall(i, x, y, e)) return;
    var s = Math.random() < 0.5 ? 1 : -1;
    var a = nb(x, y, s, 1); if (canMove(e, a)) { swap(i, a); return; }
    var b = nb(x, y, -s, 1); if (canMove(e, b)) { swap(i, b); return; }
  }

  function liquid(i, x, y, e) {
    if (fall(i, x, y, e)) return;
    var s = Math.random() < 0.5 ? 1 : -1;
    var a = nb(x, y, s, 1); if (canMove(e, a)) { swap(i, a); return; }
    var b = nb(x, y, -s, 1); if (canMove(e, b)) { swap(i, b); return; }
    // 水平扩散:向一侧找最远空格摊平;遇到边缘可"瀑布"跌落
    var D = DISP[e] || 1, best = -1;
    for (var j = 1; j <= D; j++) {
      var idx = nb(x, y, s * j, 0);
      if (idx < 0) break;
      var o = g[idx];
      if (o === EMPTY) {
        best = idx;
        var below = nb(x + s * j, y, 0, 1);
        if (below >= 0 && g[below] === EMPTY) break; // 前方是悬崖,到此为止(下一帧瀑布)
      } else if (j === 1 && isFluid(o) && DENS[o] < DENS[e]) { best = idx; break; }
      else break;
    }
    if (best >= 0) swap(i, best);
  }

  function water(i, x, y) {
    // 反应:灭火 / 遇岩浆成蒸汽+石
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var k = 0; k < 4; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      var o = g[j];
      if (o === FIRE || o === EMBER) { set(j, SMOKE); if (Math.random() < 0.3) { set(i, STEAM); return; } }
      else if (o === LAVA) { set(j, STONE); set(i, STEAM); return; }
    }
    liquid(i, x, y, WATER);
  }

  function acid(i, x, y) {
    var dirs = [[0,1],[-1,0],[1,0],[0,-1]];
    for (var k = 0; k < 4; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      var o = g[j];
      if (o === STONE || o === SAND || o === PLANT || o === ICE || o === OIL) {
        if (Math.random() < 0.28) { set(j, EMPTY); if (Math.random() < 0.45) { set(i, EMPTY); return; } }
      }
    }
    liquid(i, x, y, ACID);
  }

  function lava(i, x, y) {
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var k = 0; k < 4; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      var o = g[j];
      if (o === WATER) { set(i, STONE); set(j, STEAM); return; }
      else if (flammable(o)) { if (Math.random() < 0.5) set(j, EMBER); }
      else if (o === ICE) { set(j, WATER); }
    }
    // 偶尔向上冒火
    var up = nb(x, y, 0, -1);
    if (up >= 0 && g[up] === EMPTY && Math.random() < 0.04) { set(up, FIRE); }
    // 粘稠:低概率才流动
    if (Math.random() < 0.35) liquid(i, x, y, LAVA);
  }

  function fire(i, x, y) {
    // 点燃邻居
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var k = 0; k < 4; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      if (flammable(g[j]) && Math.random() < 0.28) set(j, EMBER);
    }
    if (t[i] <= 1 || Math.random() < 0.06) { if (Math.random() < 0.5) set(i, SMOKE); else g[i] = EMPTY; return; }
    t[i]--;
    // 上升
    var up = nb(x, y, 0, -1); if (canRise(up)) { swap(i, up); return; }
    var s = Math.random() < 0.5 ? 1 : -1;
    var a = nb(x, y, s, -1); if (canRise(a)) { swap(i, a); }
  }

  function ember(i, x, y) {
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var k = 0; k < 4; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      var o = g[j];
      if (o === WATER) { set(i, SMOKE); return; }
      if (flammable(o) && Math.random() < 0.16) set(j, EMBER);
    }
    var up = nb(x, y, 0, -1);
    if (up >= 0 && g[up] === EMPTY && Math.random() < 0.35) set(up, FIRE);
    if (t[i] <= 1) { g[i] = Math.random() < 0.4 ? SMOKE : EMPTY; if (g[i] === SMOKE) t[i] = ri(40, 90); return; }
    t[i]--;
  }

  function gas(i, x, y, e) {
    if (t[i] <= 1) {
      if (e === STEAM && Math.random() < 0.5) { set(i, WATER); } else { g[i] = EMPTY; }
      return;
    }
    t[i]--;
    var up = nb(x, y, 0, -1); if (canRise(up)) { swap(i, up); return; }
    var s = Math.random() < 0.5 ? 1 : -1;
    var a = nb(x, y, s, -1); if (canRise(a)) { swap(i, a); return; }
    var b = nb(x, y, -s, -1); if (canRise(b)) { swap(i, b); return; }
    // 蒸汽升到顶凝结
    if (e === STEAM && y <= 1 && Math.random() < 0.06) set(i, WATER);
  }

  function plant(i, x, y) {
    // 有水邻居 → 向空格生长(偏上)
    var hasWater = false, dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var k = 0; k < 4; k++) { var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j >= 0 && g[j] === WATER) { hasWater = true; break; } }
    if (hasWater && Math.random() < 0.12) {
      var order = [[0,-1],[-1,-1],[1,-1],[-1,0],[1,0]];
      var o = order[(Math.random() * order.length) | 0];
      var d = nb(x, y, o[0], o[1]);
      if (d >= 0 && g[d] === EMPTY) { set(d, PLANT); }
      // 消耗水
      for (var m = 0; m < 4; m++) { var w = nb(x, y, dirs[m][0], dirs[m][1]); if (w >= 0 && g[w] === WATER) { if (Math.random() < 0.5) g[w] = EMPTY; break; } }
    }
  }

  function ice(i, x, y) {
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var k = 0; k < 4; k++) {
      var j = nb(x, y, dirs[k][0], dirs[k][1]); if (j < 0) continue;
      var o = g[j];
      if (o === FIRE || o === EMBER || o === LAVA || o === STEAM) { if (Math.random() < 0.25) { set(i, WATER); return; } }
      else if (o === WATER && Math.random() < 0.015) set(j, ICE); // 结霜蔓延
    }
  }

  function paint(gx, gy, e, r) {
    gx |= 0; gy |= 0;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        var x = gx + dx, y = gy + dy;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        var i = y * W + x;
        // 橡皮/画笔:实体元素稀疏一点更自然,液体/气体铺满
        if (e === EMPTY || e === STONE || e === PLANT || e === ICE || Math.random() < 0.7) set(i, e);
      }
    }
  }

  function clear() { g.fill(EMPTY); }

  function count(e) { var c = 0; for (var i = 0; i < N; i++) if (g[i] === e) c++; return c; }
  function fillRect(x0, y0, x1, y1, e) {
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (x >= 0 && x < W && y >= 0 && y < H) set(y * W + x, e);
  }
  function countRect(x0, y0, x1, y1, e) {
    var c = 0; for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (x >= 0 && x < W && y >= 0 && y < H && g[y * W + x] === e) c++;
    return c;
  }
  function drainExplosions() { if (!explosions.length) return null; var o = explosions.slice(); explosions.length = 0; return o; }

  var API = {
    W: W, H: H, ELEMENTS: ELEMENTS,
    ids: { EMPTY: EMPTY, STONE: STONE, SAND: SAND, WATER: WATER, PLANT: PLANT, OIL: OIL, LAVA: LAVA, ACID: ACID, ICE: ICE, FIRE: FIRE, STEAM: STEAM, SMOKE: SMOKE, EMBER: EMBER, TNT: TNT },
    step: step, paint: paint, clear: clear, count: count, fillRect: fillRect, countRect: countRect,
    drainExplosions: drainExplosions, setCell: function (i, e) { set(i, e); },
    grid: function () { return g; }, tex: function () { return t; }
  };
  if (typeof window !== 'undefined') window.SandSim = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
