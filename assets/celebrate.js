/* ============================================================
   Lingoland Kids · 完成庆祝：彩带 + 音效
   ------------------------------------------------------------
   1) 彩带：全屏 canvas 粒子（飘带 / 圆片 / 星星），礼炮从左右下角
      斜喷 + 顶部飘落，2~3 秒自动结束并隐藏，不拦截任何点击。
   2) 音效：Web Audio 实时合成的欢呼小号角（不依赖任何音频文件，
      因此不受微信 X5 内核 speechSynthesis 静默失效影响）。
      复用 voice.js 已解锁的 AudioContext，保证在微信里也能出声。

   用法：Celebrate.run({ pct: 0.9, sound: true })
   ============================================================ */
(function (w) {
  'use strict';

  var COLORS = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F1C',
                '#B983FF', '#FF6FB5', '#00C2A8', '#FF8A5B', '#7BE495'];

  var cv = null, cx = null, parts = [], raf = 0, dpr = 1;
  var VW = 0, VH = 0, running = false;

  /* ---------------- canvas ---------------- */
  function ensureCanvas() {
    if (cv) return true;
    if (!w.document || !w.document.body) return false;
    cv = w.document.createElement('canvas');
    cv.id = 'fxCanvas';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:9999;display:none';
    w.document.body.appendChild(cv);
    cx = cv.getContext && cv.getContext('2d');
    if (!cx) { cv = null; return false; }
    resize();
    w.addEventListener('resize', resize, false);
    return true;
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(w.devicePixelRatio || 1, 2);
    VW = w.innerWidth || w.document.documentElement.clientWidth || 360;
    VH = w.innerHeight || w.document.documentElement.clientHeight || 640;
    cv.width = Math.round(VW * dpr);
    cv.height = Math.round(VH * dpr);
    try { cx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
  }

  /* ---------------- 粒子 ---------------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function mk(x, y, vx, vy, shape, color, size) {
    return {
      x: x, y: y, vx: vx, vy: vy, shape: shape, color: color,
      w: shape === 'ribbon' ? size * 0.5 : size,
      h: shape === 'ribbon' ? size * 1.7 : size,
      rot: rnd(0, Math.PI * 2), vrot: rnd(-0.26, 0.26),
      ph: rnd(0, Math.PI * 2), vph: rnd(0.12, 0.26),
      life: 0, max: Math.round(rnd(120, 210)), drag: 0.9915
    };
  }

  function shapeOf() {
    var r = Math.random();
    if (r < 0.5) return 'ribbon';
    if (r < 0.78) return 'dot';
    return 'star';
  }

  /* 礼炮：从左右下角朝斜上方喷 */
  function cannon(n) {
    for (var i = 0; i < n; i++) {
      var left = i % 2 === 0;
      var x = left ? VW * 0.04 : VW * 0.96;
      var y = VH * 0.92;
      var ang = (left ? -1 : 1) * rnd(0.95, 1.32);      /* 与水平夹角 */
      var sp = rnd(13, 25);
      parts.push(mk(x, y, Math.cos(ang) * sp * (left ? 1 : -1), Math.sin(ang) * sp,
        shapeOf(), COLORS[(Math.random() * COLORS.length) | 0], rnd(9, 17)));
    }
  }

  /* 顶部飘落 */
  function rain(n) {
    for (var i = 0; i < n; i++) {
      parts.push(mk(rnd(0, VW), rnd(-VH * 0.35, -10), rnd(-1.4, 1.4), rnd(1, 4),
        shapeOf(), COLORS[(Math.random() * COLORS.length) | 0], rnd(8, 15)));
    }
  }

  /* 中心爆开 */
  function pop(n) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, Math.PI * 2), sp = rnd(5, 16);
      parts.push(mk(VW * 0.5, VH * 0.42, Math.cos(a) * sp, Math.sin(a) * sp - 3,
        shapeOf(), COLORS[(Math.random() * COLORS.length) | 0], rnd(8, 16)));
    }
  }

  function drawStar(p) {
    var r = p.w * 0.5, r2 = r * 0.45, n = 5;
    cx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 ? r2 : r;
      var a = (Math.PI / n) * i - Math.PI / 2;
      var x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i) cx.lineTo(x, y); else cx.moveTo(x, y);
    }
    cx.closePath();
    cx.fill();
  }

  function step() {
    raf = 0;
    if (!cx) return;
    cx.clearRect(0, 0, VW, VH);
    var alive = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.life > p.max) continue;
      p.life++;
      p.vy += 0.17;                       /* 重力 */
      p.vx *= p.drag; p.vy *= p.drag;     /* 空气阻力 */
      p.ph += p.vph;
      p.x += p.vx + Math.sin(p.ph) * 0.9; /* 飘带摆动 */
      p.y += p.vy;
      p.rot += p.vrot;

      if (p.y > VH + 60 || p.life > p.max) continue;
      alive++;

      var fade = Math.min(1, (p.max - p.life) / 45);
      cx.save();
      cx.globalAlpha = Math.max(0, fade);
      cx.translate(p.x, p.y);
      cx.rotate(p.rot);
      if (p.shape === 'ribbon') {
        var sx = Math.cos(p.ph) * 0.72;   /* 翻转时收窄，像真飘带 */
        cx.scale(Math.max(0.12, Math.abs(sx)), 1);
        cx.fillStyle = p.color;
        cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        cx.globalAlpha = Math.max(0, fade * 0.5);
        cx.fillStyle = '#fff';
        cx.fillRect(-p.w / 2, -p.h / 2, p.w * 0.34, p.h);
      } else if (p.shape === 'dot') {
        cx.fillStyle = p.color;
        cx.beginPath();
        cx.arc(0, 0, p.w * 0.5, 0, Math.PI * 2);
        cx.fill();
      } else {
        cx.fillStyle = p.color;
        drawStar(p);
      }
      cx.restore();
    }
    if (alive > 0) {
      raf = req(step);
    } else {
      parts.length = 0;
      running = false;
      if (cv) cv.style.display = 'none';
    }
  }

  function req(fn) {
    if (w.requestAnimationFrame) return w.requestAnimationFrame(fn);
    return w.setTimeout(fn, 16);
  }
  function cancel(id) {
    if (w.cancelAnimationFrame) w.cancelAnimationFrame(id); else w.clearTimeout(id);
  }

  /* ---------------- 音效 ---------------- */
  function ctx() {
    try { if (w.Voice && w.Voice.ctx) return w.Voice.ctx(); } catch (e) {}
    return null;
  }

  function tone(C, freq, at, dur, type, vol, dest) {
    var o, g;
    try {
      o = C.createOscillator(); g = C.createGain();
    } catch (e) { return; }
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest || C.destination);
    try { o.start(at); o.stop(at + dur + 0.03); } catch (e) {}
  }

  /* 礼炮"砰"的一声：短噪声 + 带通 */
  function popSnd(C, at, vol) {
    try {
      var len = Math.floor(C.sampleRate * 0.28);
      var buf = C.createBuffer(1, len, C.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      var s = C.createBufferSource(); s.buffer = buf;
      var bp = C.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 1100; bp.Q.value = 0.8;
      var g = C.createGain(); g.gain.value = vol;
      s.connect(bp); bp.connect(g); g.connect(C.destination);
      s.start(at);
    } catch (e) {}
  }

  var N = { G4: 392.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, E6: 1318.5, G6: 1568.0 };

  function fanfare(level) {
    var C = ctx();
    if (!C) return false;
    try { if (C.state === 'suspended' && C.resume) C.resume(); } catch (e) {}
    var t = C.currentTime + 0.02;
    var master, out = C.destination;
    try { master = C.createGain(); master.gain.value = 0.5; master.connect(C.destination); out = master; } catch (e) {}

    if (level === 'perfect') {
      popSnd(C, t, 0.5); popSnd(C, t + 0.16, 0.42);
      var seq = [N.C5, N.E5, N.G5, N.C6];
      for (var i = 0; i < seq.length; i++) {
        tone(C, seq[i], t + 0.1 + i * 0.11, 0.34, 'triangle', 0.3, out);
        tone(C, seq[i] * 2, t + 0.1 + i * 0.11, 0.22, 'sine', 0.09, out);
      }
      /* 尾巴上的星光点缀 */
      var sp = [N.E6, N.G6, N.E6, N.C6 * 2];
      for (var j = 0; j < sp.length; j++) {
        tone(C, sp[j], t + 0.56 + j * 0.07, 0.3, 'sine', 0.16, out);
      }
      tone(C, N.C6, t + 0.56, 0.75, 'triangle', 0.2, out);
      tone(C, N.G5, t + 0.56, 0.75, 'sine', 0.14, out);
    } else if (level === 'great') {
      popSnd(C, t, 0.42);
      var s2 = [N.C5, N.E5, N.G5, N.C6];
      for (var k = 0; k < s2.length; k++) {
        tone(C, s2[k], t + 0.08 + k * 0.12, 0.3, 'triangle', 0.26, out);
      }
      tone(C, N.C6, t + 0.58, 0.5, 'triangle', 0.18, out);
      tone(C, N.E5, t + 0.58, 0.5, 'sine', 0.12, out);
    } else if (level === 'pass') {
      var s3 = [N.C5, N.E5, N.G5];
      for (var m = 0; m < s3.length; m++) {
        tone(C, s3[m], t + m * 0.13, 0.28, 'triangle', 0.22, out);
      }
    } else {
      /* 成绩不理想：给个温柔的鼓励音，不放彩带 */
      tone(C, N.G4, t, 0.24, 'sine', 0.2, out);
      tone(C, N.C5, t + 0.14, 0.36, 'sine', 0.18, out);
    }
    return true;
  }

  /* ---------------- 对外接口 ---------------- */
  function burst(opt) {
    opt = opt || {};
    if (!ensureCanvas()) return;
    resize();
    var n = opt.count || 90;
    if (parts.length > 420) parts.length = 0;
    pop(0);
    if (opt.rain) {
      /* 只从顶部飘落，柔和一点，不给"放礼炮"的错觉 */
      rain(n);
    } else {
      cannon(Math.round(n * 0.7));
      rain(Math.round(n * 0.9));
      if (opt.more) { rain(Math.round(n * 0.6)); cannon(Math.round(n * 0.35)); }
    }
    if (!running) {
      running = true;
      cv.style.display = 'block';
      raf = req(step);
    }
  }

  function stop() {
    if (raf) cancel(raf);
    raf = 0;
    parts.length = 0;
    running = false;
    if (cv) {
      cv.style.display = 'none';
      try { cx.clearRect(0, 0, VW, VH); } catch (e) {}
    }
  }

  /* pct: 正确率 0~1；sound: 是否开启声音（跟随应用内开关） */
  function run(opt) {
    opt = opt || {};
    var pct = typeof opt.pct === 'number' ? opt.pct : 1;
    var sound = opt.sound !== false;
    var level = pct >= 0.999 ? 'perfect' : (pct >= 0.8 ? 'great' : (pct >= 0.6 ? 'pass' : 'ok'));
    if (sound) fanfare(level);
    /* 成绩不理想也给一小把彩带：坚持做完一整轮本身就值得肯定，
       只是规模收着点、不放礼炮，避免和"全对"的奖励感混淆。 */
    burst({
      count: level === 'perfect' ? 130 : (level === 'great' ? 100 : (level === 'pass' ? 70 : 34)),
      more: level === 'perfect',
      rain: level === 'ok'
    });
    return level;
  }

  w.Celebrate = { run: run, burst: burst, stop: stop, fanfare: fanfare };
})(window);
