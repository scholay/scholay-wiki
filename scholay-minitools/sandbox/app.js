/* 落沙实验室 2.0 · 渲染(辉光/粒子/震屏)+ 自由&闯关双模式 */
(function () {
  'use strict';
  var Sim = window.SandSim, S = window.Scholay, esc = S.esc, id = Sim.ids, W = Sim.W, H = Sim.H, N = W * H;

  var cv, dctx, simCv, simCtx, simImg, simBuf, emitCv, emitCtx, emitImg, emitBuf;
  var scale = 2, dispW = W * 2, dispH = H * 2;
  var running = true, brush = 4, curEl = id.SAND, painting = false, lastX, lastY, seeded = false;
  var mode = 'free', levelIdx = 0, won = false, failed = false;
  var levelCtx = { baseline: {}, exAccum: 0 };   // 关卡状态(baseline 基线 / exAccum 连爆计数),levels.js 的 goal 读取
  var particles = [], flashes = [], shake = 0, frame = 0;
  // 本地记忆:引导已看 / 各关通关 / 最佳纪录 / 上次模式 / 上次关卡 / 笔刷 / 自由模式上次元素
  var STORE = 'sandbox.v1', prog = { seen: false, cleared: {}, best: 0, mode: 'level', lv: 0, brush: 4, el: 0, rewardEarned: false };
  function loadProg() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE));
      if (s) {
        prog.seen = !!s.seen; prog.cleared = s.cleared || {}; prog.best = s.best || 0;
        prog.mode = s.mode === 'free' ? 'free' : 'level';
        prog.lv = typeof s.lv === 'number' ? s.lv : 0;
        prog.brush = [2, 4, 8].indexOf(s.brush) >= 0 ? s.brush : 4;
        prog.el = typeof s.el === 'number' ? s.el : 0;
        prog.rewardEarned = !!s.rewardEarned;
      }
    } catch (e) {}
  }
  function saveProg() { try { localStorage.setItem(STORE, JSON.stringify(prog)); } catch (e) {} }

  // ---------- 材质调色(每种物质独立质感) ----------
  function pack(r, g, b, a) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }
  function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
  function mk8(rows, alpha) {
    var a = new Uint32Array(8);
    for (var i = 0; i < 8; i++) { var c = rows[i]; a[i] = pack(c[0], c[1], c[2], c[3] != null ? c[3] : (alpha != null ? alpha : 255)); }
    return a;
  }
  // 静态材质:8 变体颗粒纹理
  var P_SAND  = mk8([[222,190,124],[212,178,108],[201,166,94],[229,199,140],[208,172,102],[218,186,120],[196,160,90],[226,194,132]]);
  var P_STONE = mk8([[106,112,124],[96,102,115],[115,121,133],[89,95,107],[110,116,127],[100,106,118],[119,125,137],[93,99,111]]);
  var P_PLANT = mk8([[46,150,74],[56,168,86],[38,134,64],[64,178,96],[50,158,80],[42,142,70],[60,172,90],[35,128,60]]);
  var P_TIP   = mk8([[92,209,122],[100,218,130],[84,200,114],[108,226,138],[96,213,126],[88,204,118],[104,222,134],[80,196,110]]);
  var P_OIL   = mk8([[58,48,38],[64,52,42],[52,44,34],[70,58,46],[61,50,40],[55,46,36],[67,55,44],[49,41,32]], 250);
  var P_TNT   = mk8([[204,62,50],[188,54,44],[214,72,58],[196,58,46],[209,66,54],[182,50,40],[220,78,62],[192,56,44]]);
  var P_ICE   = mk8([[178,224,248],[190,232,252],[168,216,244],[200,238,255],[184,228,250],[174,220,246],[194,234,252],[164,212,242]], 236);
  var P_ACID  = mk8([[148,222,44],[160,232,52],[138,212,38],[170,240,60],[154,226,48],[144,218,42],[164,236,56],[133,206,34]], 245);
  var P_WATER = mk8([[38,92,178],[44,102,190],[34,86,170],[50,110,198],[40,96,182],[36,90,175],[47,106,194],[32,82,165]], 208);
  var C_ACID_BUB = pack(212, 255, 140, 255), C_ICE_GLINT = pack(242, 252, 255, 255);
  var E_ACID = pack(150, 240, 60, 80);

  // 动态材质:火按寿命(白热→暗红)、岩浆脉动、烟/汽按寿命淡出、水面波光
  var F_FIRE = new Uint32Array(8), F_FIRE_E = new Uint32Array(8);
  var F_EMBER = new Uint32Array(8), F_EMBER_E = new Uint32Array(8);
  var F_LAVA = new Uint32Array(8), F_LAVA_E = new Uint32Array(8);
  var F_SMOKE = new Uint32Array(8), F_STEAM = new Uint32Array(8), F_WSURF = new Uint32Array(8);
  function lp(a, b, t) { return a + (b - a) * t; }
  function buildDyn(f) {
    for (var b = 0; b < 8; b++) {
      var rt = b / 7, fl = Math.sin(f * 0.5 + b * 1.7) * 10;
      F_FIRE[b]   = pack(cl(lp(185, 255, rt) + fl), cl(lp(42, 224, rt) + fl * 0.5), cl(lp(10, 120, rt * rt)), cl(lp(150, 248, rt)));
      F_FIRE_E[b] = pack(255, cl(lp(90, 205, rt)), 30, cl(lp(120, 215, rt)));
      var p = Math.sin(b * 0.8 + f * 0.32) * 0.5 + 0.5;
      F_EMBER[b]   = pack(255, cl(lp(58, 165, p)), cl(lp(22, 48, p)), 255);
      F_EMBER_E[b] = pack(255, cl(lp(80, 140, p)), 28, cl(lp(80, 150, p)));
      var q = Math.sin(b * 1.3 + f * 0.11) * 0.5 + 0.5;
      F_LAVA[b]   = pack(cl(lp(198, 255, q)), cl(lp(44, 116, q)), cl(lp(8, 28, q)), 255);
      F_LAVA_E[b] = pack(255, cl(lp(70, 135, q)), 20, cl(lp(110, 180, q)));
      F_SMOKE[b] = pack(72, 78, 94, cl(22 + 22 * b));
      F_STEAM[b] = pack(218, 228, 242, cl(16 + 17 * b));
      var w = Math.sin(b + f * 0.18) * 14;
      F_WSURF[b] = pack(cl(86 + w), cl(152 + w), cl(226 + w * 0.6), 228);
    }
  }

  function render() {
    buildDyn(frame++);
    var g = Sim.grid(), t = Sim.tex();
    for (var i = 0; i < N; i++) {
      var e = g[i];
      if (e === id.EMPTY) { simBuf[i] = 0; emitBuf[i] = 0; continue; }
      var m = t[i], c, em = 0, b;
      switch (e) {
        case id.SAND:  c = P_SAND[m & 7]; break;
        case id.STONE: c = P_STONE[m & 7]; break;
        case id.WATER: {
          var ab = i >= W ? g[i - W] : id.WATER;   // 表面高光:上方非水
          c = (ab !== id.WATER && ab !== id.ICE) ? F_WSURF[(m + i) & 7] : P_WATER[m & 7];
          break;
        }
        case id.PLANT: c = (i >= W && g[i - W] === id.EMPTY) ? P_TIP[m & 7] : P_PLANT[m & 7]; break;
        case id.OIL:   c = P_OIL[m & 7]; break;
        case id.ACID:  c = ((m + frame) & 31) < 2 ? C_ACID_BUB : P_ACID[m & 7]; em = E_ACID; break;
        case id.ICE:   c = ((m * 7 + frame) & 127) < 3 ? C_ICE_GLINT : P_ICE[m & 7]; break;
        case id.TNT:   c = P_TNT[m & 7]; break;
        case id.FIRE:  b = m >> 2; if (b > 7) b = 7; c = F_FIRE[b]; em = F_FIRE_E[b]; break;
        case id.EMBER: b = m & 7; c = F_EMBER[b]; em = F_EMBER_E[b]; break;
        case id.LAVA:  b = (m + (frame >> 2)) & 7; c = F_LAVA[b]; em = F_LAVA_E[b]; break;
        case id.STEAM: b = m >> 5; if (b > 7) b = 7; c = F_STEAM[b]; break;
        case id.SMOKE: b = m >> 4; if (b > 7) b = 7; c = F_SMOKE[b]; break;
        default: c = 0;
      }
      simBuf[i] = c; emitBuf[i] = em;
    }
    simCtx.putImageData(simImg, 0, 0);
    emitCtx.putImageData(emitImg, 0, 0);

    var sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    cv.style.transform = shake > 0.3 ? 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)' : '';
    shake *= 0.86;

    dctx.clearRect(0, 0, dispW, dispH);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(simCv, 0, 0, dispW, dispH);            // 清晰底
    // 辉光:emit 逐级放大 + lighter
    dctx.imageSmoothingEnabled = true;
    dctx.globalCompositeOperation = 'lighter';
    var passes = [[0, 0.55], [8, 0.5], [20, 0.34], [40, 0.2]];
    for (var q = 0; q < passes.length; q++) {
      var k = passes[q][0]; dctx.globalAlpha = passes[q][1];
      dctx.drawImage(emitCv, -k, -k, dispW + 2 * k, dispH + 2 * k);
    }
    dctx.globalAlpha = 1;
    drawFlashes(); drawParticles();
    dctx.globalCompositeOperation = 'source-over';
  }

  // ---------- 粒子 ----------
  function spark(x, y, vx, vy, life, col, r) {
    if (particles.length > 520) particles.shift();
    particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, r: r });
  }
  function burst(gx, gy, power) {
    var cx = gx * scale, cy = gy * scale, n = Math.min(70, 14 + power * 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = (1 + Math.random() * 4) * (0.6 + power * 0.06);
      spark(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 1, 22 + Math.random() * 26,
        Math.random() < 0.5 ? '255,200,80' : '255,120,40', 1.5 + Math.random() * 2.5);
    }
    flashes.push({ x: cx, y: cy, r: power * scale * 1.8, life: 11, max: 11 });
    shake = Math.min(16, shake + power * 0.55);
  }
  function ambientSparks() {
    var g = Sim.grid();
    for (var s = 0; s < 8; s++) {
      var i = (Math.random() * N) | 0, e = g[i];
      if ((e === id.FIRE || e === id.LAVA) && Math.random() < 0.4) {
        var x = (i % W) * scale, y = ((i / W) | 0) * scale;
        spark(x, y, (Math.random() - 0.5) * 1.2, -0.6 - Math.random() * 1.4, 16 + Math.random() * 20,
          e === id.LAVA ? '255,140,40' : '255,190,70', 1 + Math.random() * 1.6);
      }
    }
  }
  function drawParticles() {
    dctx.globalCompositeOperation = 'lighter';
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.life--; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 0.13; p.x += p.vx; p.y += p.vy;
      var a = p.life / p.max, rr = p.r * (0.4 + a);
      var grd = dctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.2);
      grd.addColorStop(0, 'rgba(' + p.col + ',' + (a * 0.9).toFixed(2) + ')');
      grd.addColorStop(1, 'rgba(' + p.col + ',0)');
      dctx.fillStyle = grd; dctx.beginPath(); dctx.arc(p.x, p.y, rr * 2.2, 0, 6.283); dctx.fill();
    }
  }
  function drawFlashes() {
    dctx.globalCompositeOperation = 'lighter';
    for (var i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i]; f.life--; if (f.life <= 0) { flashes.splice(i, 1); continue; }
      var a = f.life / f.max, R = f.r * (1.4 - a);
      var grd = dctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
      grd.addColorStop(0, 'rgba(255,240,200,' + (a * 0.85).toFixed(2) + ')');
      grd.addColorStop(0.4, 'rgba(255,150,60,' + (a * 0.5).toFixed(2) + ')');
      grd.addColorStop(1, 'rgba(255,80,20,0)');
      dctx.fillStyle = grd; dctx.beginPath(); dctx.arc(f.x, f.y, R, 0, 6.283); dctx.fill();
    }
  }

  // ---------- 主循环 ----------
  function loop() {
    if (running && !failed) {
      Sim.step();
      var ex = Sim.drainExplosions();
      if (ex) { for (var i = 0; i < ex.length; i++) burst(ex[i].x, ex[i].y, ex[i].r); levelCtx.exAccum += ex.length; }
      ambientSparks();
      if (mode === 'level' && !won) checkGoal();
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---------- 输入 ----------
  function toGrid(ev) {
    var r = cv.getBoundingClientRect();
    var cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
    var cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
    return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
  }
  function paintAt(x, y) { Sim.paint(x, y, curEl, brush); }
  function ln(x0, y0, x1, y1) { var dx = x1 - x0, dy = y1 - y0, s = Math.max(1, Math.hypot(dx, dy) | 0); for (var i = 0; i <= s; i++) paintAt(x0 + dx * i / s, y0 + dy * i / s); }
  function down(ev) { ev.preventDefault(); painting = true; hideHint(); var p = toGrid(ev); lastX = p.x; lastY = p.y; paintAt(p.x, p.y); }
  function move(ev) { if (!painting) return; ev.preventDefault(); var p = toGrid(ev); ln(lastX, lastY, p.x, p.y); lastX = p.x; lastY = p.y; }
  function up() { painting = false; }
  function hideHint() { if (!seeded) return; var h = document.getElementById('hint'); if (h) h.style.opacity = '0'; }

  // ---------- 关卡(20 关,定义在 levels.js,app + 自测共用) ----------
  var LEVELS = window.makeSandboxLevels(id, W, H, levelCtx);

  // 顺序解锁:第 i 关可玩 = 第一关 或 前一关已通
  function unlocked(i) { return i === 0 || !!prog.cleared[i - 1]; }
  // 恢复进度用:优先回到上次关卡(若已解锁),否则第一个未通关的可玩关
  function startLevel() {
    // 续档:定位到第一个「已解锁但还没通过」的关(不是上次停留的关)
    for (var i = 0; i < LEVELS.length; i++) if (unlocked(i) && !prog.cleared[i]) return i;
    return LEVELS.length - 1;   // 全通 → 停在最后一关(可重玩)
  }
  function updateDots() {
    var box = document.getElementById('lvDots');
    box.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var st = i === levelIdx ? ' cur' : prog.cleared[i] ? ' done' : unlocked(i) ? '' : ' lock';
      var b = S.el('button', 'lv-dot' + st, prog.cleared[i] && i !== levelIdx ? '✓' : unlocked(i) ? String(i + 1) : '🔒');
      if (unlocked(i)) b.addEventListener('click', function () { if (i !== levelIdx) loadLevel(i); });
      box.appendChild(b);
    });
    // 横向滚动:把当前关滚到可视中央(仅动条自身 scrollLeft,不影响页面)
    var curDot = box.children[levelIdx];
    if (curDot) box.scrollLeft = curDot.offsetLeft - box.clientWidth / 2 + curDot.offsetWidth / 2;
  }
  function loadLevel(i) {
    levelIdx = (i + LEVELS.length) % LEVELS.length;
    if (!unlocked(levelIdx)) levelIdx = startLevel();
    won = false; failed = false; levelCtx.exAccum = 0; levelCtx.baseline = {};
    particles.length = 0; flashes.length = 0; shake = 0;
    var L = LEVELS[levelIdx];
    Sim.clear(); L.setup(Sim); if (L.init) L.init(Sim);
    curEl = L.allow[0];
    buildPalette(L.allow);
    running = true;
    prog.lv = levelIdx; saveProg();
    updateDots();
    document.getElementById('lvName').textContent = '第 ' + (levelIdx + 1) + ' 关 · ' + L.name + (prog.cleared[levelIdx] ? ' ✓' : '');
    document.getElementById('lvBrief').textContent = L.brief;
    document.getElementById('nextBtn').classList.add('hide');
    document.getElementById('lvResult').textContent = '';
    document.getElementById('lvResult').className = 'lv-result';
  }
  function clearedCount() { var n = 0; for (var i = 0; i < LEVELS.length; i++) if (prog.cleared[i]) n++; return n; }
  function allCleared() { return clearedCount() >= LEVELS.length; }

  function checkGoal() {
    var r = LEVELS[levelIdx].goal(Sim, levelCtx.baseline);
    var txt = r.text || '';
    if (levelCtx.exAccum > 0 && prog.best) txt += ' · 最佳 ' + prog.best;
    document.getElementById('lvProgress').textContent = txt;
    if (r.fail) { failed = true; running = false; var el = document.getElementById('lvResult'); el.textContent = '✗ ' + (r.text || '失败') + ' — 点「重来」再试'; el.className = 'lv-result bad'; }
    else if (r.done) {
      won = true;
      var wasAll = prog.rewardEarned;
      prog.cleared[levelIdx] = true; if (levelCtx.exAccum > 0) prog.best = Math.max(prog.best, levelCtx.exAccum);
      var justAll = allCleared() && !wasAll;
      if (justAll) prog.rewardEarned = true;
      saveProg();
      updateDots();
      var e2 = document.getElementById('lvResult');
      e2.textContent = justAll ? '🏆 全部通关!点右上角 🎁 领 Scholay 会员'
        : '🎉 通关!' + (levelIdx < LEVELS.length - 1 ? '点「下一关」继续' : '全 20 关通关,你就是元素大师!');
      e2.className = 'lv-result ok'; document.getElementById('nextBtn').classList.remove('hide');
      S.confetti({ y: window.innerHeight * 0.35 });
      document.getElementById('rewardBtn').classList.toggle('earned', prog.rewardEarned);
      if (justAll) setTimeout(function () { openReward(); S.confetti({ y: window.innerHeight * 0.3, count: 160 }); }, 900);
    }
  }

  // ---------- 通关奖励 ----------
  function renderReward() {
    var R = window.SANDBOX_DATA.reward, n = clearedCount(), total = LEVELS.length, done = allCleared();
    document.getElementById('rewardMedal').textContent = done ? '🏆' : '🎁';
    document.getElementById('rewardPrize').textContent = R.prize;
    document.getElementById('rewardTitle').textContent = done ? '恭喜!奖励已解锁' : '通关领 Scholay 会员';
    document.getElementById('rewardSub').textContent = R.goal;
    // 进度条(20 关用进度条 + 计数,比铺 20 个点清晰)
    document.getElementById('rewardTrack').innerHTML =
      '<div class="rt-bar"><i style="width:' + Math.round(n / total * 100) + '%"></i></div>' +
      '<div class="rt-count">已通关 <b>' + n + '</b> / ' + total + ' 关</div>';
    var locked = document.getElementById('rewardLocked'), claim = document.getElementById('rewardClaim');
    if (done) {
      locked.classList.add('hide'); claim.classList.remove('hide');
      // 二维码(失败则占位提示)
      var qw = document.getElementById('rewardQr'); qw.innerHTML = '';
      var img = new Image(); img.className = 'reward-qr-img'; img.alt = '联系二维码';
      img.addEventListener('error', function () {
        qw.innerHTML = '<div class="reward-qr-ph">二维码待放置<br><small>shared/reward-qr.png</small></div>';
      });
      img.src = R.qr; qw.appendChild(img);
      var ol = document.getElementById('rewardSteps'); ol.innerHTML = '';
      R.steps.forEach(function (s) { ol.appendChild(S.el('li', '', esc(s))); });
      document.getElementById('rewardNote').textContent = R.note;
    } else {
      claim.classList.add('hide'); locked.classList.remove('hide');
      locked.innerHTML = '已通关 <b>' + n + ' / ' + total + '</b> 关 · 再通 <b>' + (total - n) +
        '</b> 关即可领取<br><span class="reward-cta">继续闯关 →</span>';
    }
  }
  function openReward() {
    if (mode !== 'level') setMode('level');
    renderReward();
    document.getElementById('rewardSheet').classList.remove('hide');
  }

  // ---------- UI ----------
  function buildPalette(allow) {
    var box = document.getElementById('palette'); box.innerHTML = '';
    Sim.ELEMENTS.forEach(function (el) {
      if (allow && allow.indexOf(el.id) < 0) return;
      var b = S.el('button', 'ebtn' + (el.id === curEl ? ' on' : ''),
        '<span class="sw" style="background:' + el.color + '"></span><span class="en">' + esc(el.emoji + ' ' + el.name) + '</span>');
      b.addEventListener('click', function () {
        curEl = el.id;
        if (mode === 'free') { prog.el = el.id; saveProg(); }   // 记住自由模式的元素选择
        box.querySelectorAll('.ebtn').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
      });
      box.appendChild(b);
    });
  }
  function setMode(m) {
    mode = m; won = false; failed = false;
    prog.mode = m; saveProg();
    document.getElementById('mFree').classList.toggle('on', m === 'free');
    document.getElementById('mLevel').classList.toggle('on', m === 'level');
    document.getElementById('levelbar').classList.toggle('hide', m !== 'level');
    document.getElementById('freeCtl').classList.toggle('hide', m !== 'free');
    document.getElementById('levelCtl').classList.toggle('hide', m !== 'level');
    document.getElementById('hint').style.display = m === 'free' ? '' : 'none';
    if (m === 'free') {
      curEl = prog.el || id.SAND;                          // 恢复上次用的元素
      buildPalette(null); Sim.clear(); seed(); running = true;
    } else loadLevel(startLevel());                        // 回到上次进度
  }

  // 开场布景:微缩地貌 —— 左草丘 + 山谷湖 + 右沙丘海滩 + 湖面浮冰 + 沙丘炸药箱 + 地底岩浆房(彩蛋)
  function seed() {
    Sim.clear();
    function hill(x, c, w2, hh) { var d = (x - c) / w2; return hh * Math.exp(-d * d); }
    var hs = new Array(W);
    for (var x = 0; x < W; x++) {
      hs[x] = (208 - hill(x, 36, 24, 52) - hill(x, 146, 22, 38) + Math.sin(x * 0.31) * 2 + Math.random() * 2) | 0;
    }
    // 地形:左坡草皮 / 右坡沙层 / 其余岩石
    for (x = 0; x < W; x++) {
      for (var y = hs[x]; y < H; y++) {
        var depth = y - hs[x], el;
        if (x < 74 && depth < 3) el = id.PLANT;
        else if (x >= 112 && depth < 9) el = id.SAND;
        else el = id.STONE;
        Sim.setCell(y * W + x, el);
      }
      // 草簇:左坡零星向上冒 1-2 格草尖
      if (x < 74 && Math.random() < 0.22) {
        Sim.setCell((hs[x] - 1) * W + x, id.PLANT);
        if (Math.random() < 0.4) Sim.setCell((hs[x] - 2) * W + x, id.PLANT);
      }
    }
    // 山谷湖(水面 y=194)
    for (x = 0; x < W; x++) {
      if (hs[x] > 196) for (y = 194; y < hs[x]; y++) Sim.setCell(y * W + x, id.WATER);
    }
    // 湖面浮冰
    for (x = 86; x <= 97; x++) for (y = 190; y <= 193; y++) if (Math.random() < 0.85) Sim.setCell(y * W + x, id.ICE);
    // 海滩植物点缀
    [110, 114, 118].forEach(function (bx) { if (hs[bx] > 0) Sim.setCell((hs[bx] - 1) * W + bx, id.PLANT); });
    // 沙丘顶的炸药箱(半埋进沙里防悬空;勾引点燃)
    var crateBottom = 0;
    for (x = 139; x <= 150; x++) if (hs[x] > crateBottom) crateBottom = hs[x];
    crateBottom += 2;
    for (x = 139; x <= 150; x++) for (y = crateBottom - 8; y < crateBottom; y++) Sim.setCell(y * W + x, id.TNT);
    // 地底密封岩浆房(彩蛋:炸开或酸蚀岩层可放出)
    for (x = 128; x <= 164; x++) for (y = 240; y <= 257; y++) Sim.setCell(y * W + x, id.LAVA);
  }

  function fitCanvas() {
    var stage = document.getElementById('stage');
    var aw = stage.clientWidth - 8, ah = stage.clientHeight - 8, ar = W / H, cssW, cssH;
    if (aw / ah > ar) { cssH = ah; cssW = cssH * ar; } else { cssW = aw; cssH = cssW / ar; }
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    dispW = Math.round(cssW * dpr); dispH = Math.round(cssH * dpr); scale = dispW / W;
    cv.width = dispW; cv.height = dispH; cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  }

  document.addEventListener('DOMContentLoaded', function () {
    cv = document.getElementById('cv'); dctx = cv.getContext('2d');
    simCv = document.createElement('canvas'); simCv.width = W; simCv.height = H; simCtx = simCv.getContext('2d');
    simImg = simCtx.createImageData(W, H); simBuf = new Uint32Array(simImg.data.buffer);
    emitCv = document.createElement('canvas'); emitCv.width = W; emitCv.height = H; emitCtx = emitCv.getContext('2d');
    emitImg = emitCtx.createImageData(W, H); emitBuf = new Uint32Array(emitImg.data.buffer);
    fitCanvas(); window.addEventListener('resize', fitCanvas);

    loadProg(); brush = prog.brush;   // 先读存档,笔刷/面板初始态才正确
    buildPalette(null); buildControls();
    var D = window.SANDBOX_DATA;
    var facts = document.getElementById('facts'); facts.className = 'facts stagger';
    D.facts.forEach(function (f) { facts.appendChild(S.el('div', 'fact', '<h4>' + esc(f.h) + '</h4><p>' + esc(f.p) + '</p>')); });
    document.getElementById('combos').appendChild(S.accordion(D.combos.map(function (c) { return { title: c.q, body: c.a }; })));
    document.getElementById('disclaimer').innerHTML = '🔬 ' + esc(D.disclaimer);

    document.getElementById('mFree').addEventListener('click', function () { setMode('free'); });
    document.getElementById('mLevel').addEventListener('click', function () { setMode('level'); });
    document.getElementById('retryBtn').addEventListener('click', function () { loadLevel(levelIdx); });
    document.getElementById('nextBtn').addEventListener('click', function () { loadLevel(levelIdx + 1); });

    // 信息弹层
    var sheet = document.getElementById('infoSheet');
    document.getElementById('infoBtn').addEventListener('click', function () { sheet.classList.remove('hide'); });
    document.getElementById('infoClose').addEventListener('click', function () { sheet.classList.add('hide'); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.classList.add('hide'); });

    // 通关奖励弹层
    var rSheet = document.getElementById('rewardSheet');
    function closeReward() { rSheet.classList.add('hide'); }
    document.getElementById('rewardBtn').addEventListener('click', openReward);
    document.getElementById('rewardClose').addEventListener('click', closeReward);
    rSheet.addEventListener('click', function (e) { if (e.target === rSheet) closeReward(); });
    // 未通关状态点「继续闯关 →」= 关弹层回去玩
    document.getElementById('rewardLocked').addEventListener('click', function (e) {
      if (e.target.classList.contains('reward-cta')) closeReward();
    });
    document.getElementById('rewardBtn').classList.toggle('earned', prog.rewardEarned);
    document.getElementById('tutPrize').innerHTML = '🎁 通关奖励 · <b>Scholay 会员 1 个月</b>';
    // 新手引导
    var tut = document.getElementById('tut');
    function showTut() { tut.classList.remove('hide'); }
    document.getElementById('tutStart').addEventListener('click', function () { tut.classList.add('hide'); prog.seen = true; saveProg(); });
    document.getElementById('helpBtn').addEventListener('click', showTut);

    // 首次引导 + 按存档恢复模式与关卡进度(默认闯关)
    if (!prog.seen) showTut();
    setMode(prog.mode); seeded = true;
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
    requestAnimationFrame(function () { fitCanvas(); requestAnimationFrame(loop); });
  });

  function buildControls() {
    var sizes = [{ n: '细', r: 2 }, { n: '中', r: 4 }, { n: '粗', r: 8 }], sb = document.getElementById('sizes');
    sizes.forEach(function (s) { var b = S.el('button', 'ctl' + (s.r === brush ? ' on' : ''), esc(s.n)); b.addEventListener('click', function () { brush = s.r; prog.brush = s.r; saveProg(); sb.querySelectorAll('.ctl').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }); sb.appendChild(b); });
    var pause = document.getElementById('pauseBtn');
    pause.addEventListener('click', function () { running = !running; pause.innerHTML = running ? '⏸ 暂停' : '▶ 继续'; });
    document.getElementById('clearBtn').addEventListener('click', function () { Sim.clear(); });
    document.getElementById('rainBtn').addEventListener('click', function () { for (var x = 0; x < W; x += 3) if (Math.random() < 0.5) Sim.paint(x, 2, id.WATER, 1); });
  }
})();
