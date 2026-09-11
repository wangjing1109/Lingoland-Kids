/* ============================================================
 * Lingoland Kids · 离线发音引擎（小红书小工具版）
 *
 * 运行在受限容器：纯本地、不联网。因此不能依赖后端 TTS 服务，
 * 也不能引用任何外部音源（如词典 CDN）。
 *
 * 发音策略（离线唯一可行）：
 *   - speechSynthesis            系统 TTS 合成（英文单词朗读）
 *   - 可见提示                   无可用语音时绝不静默失败
 *
 * 音效（按键音 / 提示音）仍由 WebAudio 现场合成，不加载任何文件。
 * ============================================================ */
(function (w) {
  'use strict';

  var SILENT_WAV = 'data:audio/wav;base64,UklGRuQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA==';

  var TYPE = 2;               /* 2=美音真人 1=英音真人 */
  var ac = null;              /* AudioContext */
  var unlocked = false;       /* 音频通道是否可用（可能被 JSBridge 提前置位） */
  var gestured = false;       /* 用户是否真的点过页面 —— 只有它才允许"自动朗读" */
  var bufCache = {};          /* word -> AudioBuffer */
  var bufLRU = [];
  var BUF_MAX = 80;
  var curSrc = null;          /* 当前 WebAudio 音源 */
  var curEl = null;           /* 当前 <audio> 元素 */
  var curStop = null;         /* 停止当前播放的函数 */
  var channel = 'init';       /* 当前生效通道，供 UI 展示 */
  var failFast = false;       /* 同源代理连续失败后暂时跳过 */
  var failCnt = 0;
  var seq = 0;                /* 播放序号，防止旧请求覆盖新播放 */
  var lastFailAt = 0;
  var listeners = [];

  var UA = navigator.userAgent || '';
  var IN_WX = /MicroMessenger/i.test(UA);
  var IS_IOS = /iPhone|iPad|iPod/i.test(UA);

  function emit(kind, data) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](kind, data || {}); } catch (e) {}
    }
  }

  function ensureAC() {
    if (ac) return ac;
    var C = w.AudioContext || w.webkitAudioContext;
    if (!C) return null;
    try { ac = new C(); } catch (e) { ac = null; }
    return ac;
  }

  function cachePut(word, buf) {
    if (bufCache[word]) return;
    bufCache[word] = buf;
    bufLRU.push(word);
    while (bufLRU.length > BUF_MAX) {
      var old = bufLRU.shift();
      if (old !== word) delete bufCache[old];
    }
  }

  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; rej(new Error('timeout')); } }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(t); res(v); } },
        function (e) { if (!done) { done = true; clearTimeout(t); rej(e); } });
    });
  }

  /* ---------------- 解锁：必须在用户手势同步栈内调用 ---------------- */
  function unlock() {
    if (unlocked) return true;
    unlocked = true;
    var C = ensureAC();
    if (C) {
      try {
        if (C.state === 'suspended') C.resume();
        /* 播放 1 帧静音，真正激活输出通道 */
        var b = C.createBuffer(1, 1, 22050);
        var s = C.createBufferSource();
        s.buffer = b; s.connect(C.destination);
        s.start(0);
      } catch (e) {}
    }
    /* 同时解锁 <audio> 元素通道（部分内核两者独立） */
    try {
      var a = new Audio();
      a.src = SILENT_WAV;
      a.volume = 0;
      a.muted = true;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}

    /* 微信/部分安卓内核解锁会晚一拍，补一次 resume */
    setTimeout(function () {
      if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    }, 120);
    if (C) { try { C.resume(); } catch (e) {} }
    return true;
  }

  /* 离线小工具：无后端 TTS 服务，也不引用任何外部音源。
     单词发音仅由系统 TTS（speechSynthesis）合成，见下方 speak()。 */
  /* 离线小工具：以下 WebAudio/<audio> 播放通道依赖 TTS 服务 与外部音源，
     在离线容器里不可用，已移除。发音统一走 speechSynthesis。 */

  /* ---------------- 通道 3：在线真人发音（有道词典美音）----------------
     微信内置浏览器（安卓 X5 内核）对系统 speechSynthesis 支持极差，
     getVoices() 常返回空数组，导致单词在微信里完全哑火；
     而 <audio> 播放远程 mp3 在微信里可靠可用。
     因此在线时优先走真人发音，失败再回退系统 TTS（离线也走此路）。 */
  function audioUrl(word) {
    return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=2';
  }
  function playAudio(word, rate, vol) {
    return new Promise(function (res, rej) {
      try {
        var a = new Audio();
        a.src = audioUrl(word);
        a.preload = 'auto';
        a.playbackRate = (rate && rate >= 0.5 && rate <= 2) ? rate : 1;
        a.volume = (typeof vol === 'number' && vol >= 0 && vol <= 1) ? vol : 1;
        curEl = a;
        var done = false;
        a.onended = function () { if (!done) { done = true; res(true); } };
        a.onerror = function () { if (!done) { done = true; rej(new Error('audio error')); } };
        channel = 'audio-direct';
        var pr = a.play();
        if (pr && pr.catch) pr.catch(function () { if (!done) { done = true; rej(new Error('play rejected')); } });
        setTimeout(function () { if (!done) { done = true; rej(new Error('audio timeout')); } }, 7000);
      } catch (e) { rej(e); }
    });
  }

  /* ---------------- 通道 4：系统 TTS ---------------- */
  function playSS(text, rate, vol) {
    return new Promise(function (res, rej) {
      if (!('speechSynthesis' in w)) return rej(new Error('no ss'));
      try {
        var vs = w.speechSynthesis.getVoices() || [];
        /* 关键：没有可用语音时果断放弃，不再伪播放 */
        if (!vs.length) return rej(new Error('no voices'));
        w.speechSynthesis.cancel();
        var u = new w.SpeechSynthesisUtterance(String(text));
        u.lang = 'en-US'; u.rate = rate; u.pitch = 1.1;
        u.volume = (typeof vol === 'number' && vol >= 0 && vol <= 1) ? vol : 1;
        for (var i = 0; i < vs.length; i++) {
          if (/^en/i.test(vs[i].lang)) { u.voice = vs[i]; break; }
        }
        var done = false;
        u.onend = function () { if (!done) { done = true; res(true); } };
        u.onerror = function () { if (!done) { done = true; rej(new Error('ss error')); } };
        w.speechSynthesis.speak(u);
        channel = 'speechSynthesis';
        setTimeout(function () { if (!done) { done = true; res(true); } }, 8000);
      } catch (e) { rej(e); }
    });
  }

  /* ---------------- 主入口（在线优先真人发音，失败回退系统 TTS） ----------------
     vol：0~1 音量（不传则默认 1，不影响闪卡等其它发音调用方） */
  function speak(text, rate, vol) {
    var word = String(text || '').trim();
    if (!word) return Promise.resolve(false);
    rate = rate || 1;
    if (rate < 0.5) rate = 0.5;
    if (rate > 2) rate = 2;
    if (typeof vol !== 'number') vol = 1;

    var mySeq = ++seq;
    stop();

    /* 在线优先真人发音；失败（离线 / 弱网 / 微信拦截）回退系统 TTS；再失败才报异常 */
    return playAudio(word, rate, vol)
      .then(function (r) {
        if (mySeq === seq && r === true) { emit('ok', { text: word, channel: channel }); return true; }
        return false;
      })
      ['catch'](function () {
        stop();   /* 停掉可能仍在播放的真人音频，避免与系统 TTS 叠加出双声 */
        return playSS(word, rate, vol).then(function (r) {
          if (mySeq === seq && r === true) { emit('ok', { text: word, channel: channel }); return true; }
          return false;
        });
      })
      ['catch'](function (e) {
        lastFailAt = Date.now();
        channel = 'none';
        emit('fail', { text: word, reasons: [String((e && e.message) || e)] });
        return false;
      });
  }

  function stop() {
    if (curStop) { try { curStop(); } catch (e) {} }
    curStop = null; curSrc = null;
    if (curEl) {
      try { curEl.pause(); curEl.currentTime = 0; } catch (e) {}
      curEl = null;
    }
    try { if ('speechSynthesis' in w && w.speechSynthesis.speaking) w.speechSynthesis.cancel(); } catch (e) {}
  }

  /* 离线无后端音频，无需预加载；保留接口以兼容调用方 */
  function preload() {}

  /* 提示音：给跟读流程「开始录/录完了」一个明确的听觉反馈，
     避免用户在微信里点了麦克风却感觉毫无反应。 */
  function beep(kind) {
    var C = ensureAC();
    if (!C) return;
    try {
      if (C.state === 'suspended') C.resume();
      var t0 = C.currentTime;
      var notes = kind === 'stop' ? [760, 560] : [620, 900];
      for (var i = 0; i < notes.length; i++) {
        var o = C.createOscillator(), g = C.createGain();
        o.type = 'sine';
        o.frequency.value = notes[i];
        var st = t0 + i * 0.12;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.22, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.11);
        o.connect(g); g.connect(C.destination);
        o.start(st); o.stop(st + 0.13);
      }
    } catch (e) {}
  }

  /* ---------------- 按键音效 ----------------
     全部用 WebAudio 现场合成，不加载任何音频文件，
     因此同样不受微信 X5 内核 speechSynthesis 失效的影响。
     音量刻意压得很低（0.07~0.12），不盖过单词真人发音。 */
  var TAPCFG = {
    tap:  { f: [1245, 932],      d: 0.050, type: 'sine',     v: 0.085, gap: 0.030 }, /* 普通按钮 */
    pop:  { f: [1046],           d: 0.038, type: 'triangle', v: 0.070, gap: 0      }, /* 选项/卡片轻点 */
    back: { f: [784, 588],       d: 0.050, type: 'sine',     v: 0.075, gap: 0.032 }, /* 返回 / 关闭 */
    ok:   { f: [784, 1047, 1319], d: 0.070, type: 'triangle', v: 0.115, gap: 0.058 }, /* 答对 */
    no:   { f: [330, 247],       d: 0.080, type: 'sine',     v: 0.095, gap: 0.060 }, /* 答错 */
    star: { f: [1047, 1319, 1568], d: 0.070, type: 'triangle', v: 0.105, gap: 0.055 } /* 获得奖励 */
  };
  var noiseBuf = null;
  function getNoise(C) {
    if (noiseBuf && noiseBuf.sampleRate === C.sampleRate) return noiseBuf;
    var n = Math.max(1, Math.floor(C.sampleRate * 0.03));
    noiseBuf = C.createBuffer(1, n, C.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    return noiseBuf;
  }
  function tap(kind) {
    var cfg = TAPCFG[kind] || TAPCFG.tap;
    var C = ensureAC();
    if (!C) return;
    try {
      if (C.state === 'suspended') C.resume();
      var t0 = C.currentTime + 0.002, i;
      for (i = 0; i < cfg.f.length; i++) {
        var o = C.createOscillator(), g = C.createGain();
        o.type = cfg.type;
        o.frequency.value = cfg.f[i];
        var st = t0 + i * cfg.gap;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(cfg.v, st + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, st + cfg.d);
        o.connect(g); g.connect(C.destination);
        o.start(st); o.stop(st + cfg.d + 0.02);
      }
      /* 一小撮高通噪声，给按键声加一点"实体感" */
      var s = C.createBufferSource(), hp = C.createBiquadFilter(), ng = C.createGain();
      s.buffer = getNoise(C);
      hp.type = 'highpass'; hp.frequency.value = 1800;
      ng.gain.setValueAtTime(cfg.v * 0.5, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
      s.connect(hp); hp.connect(ng); ng.connect(C.destination);
      s.start(t0); s.stop(t0 + 0.035);
    } catch (e) {}
  }

  /* 入口处预热：进入练习前先建好 AudioContext，减少首播延迟 */
  function warm() {
    ensureAC();
  }

  w.Voice = {
    speak: function (t, r, v) {
      if (!unlocked) {
        /* 未解锁：记住待播，等待首次手势 */
        w.Voice.__pending = { t: t, r: r, v: v };
        return Promise.resolve(false);
      }
      return speak(t, r, v);
    },
    flush: function () {
      if (!w.Voice.__pending) return;
      var p = w.Voice.__pending;
      w.Voice.__pending = null;
      if (unlocked) speak(p.t, p.r, p.v);
    },
    unlock: function () {
      var first = !unlocked;
      unlock();
      if (first) {
        /* X5 内核常需要下一帧才真正就绪 */
        setTimeout(function () { w.Voice.flush(); }, 60);
      }
    },
    stop: stop,
    preload: preload,
    warm: warm,
    beep: beep,
    /* 按键音效：tap / pop / back / ok / no / star */
    tap: tap,
    /* 清掉尚未播出的待播词（例如刚打开页面时缓存的自动朗读） */
    clearPending: function () { w.Voice.__pending = null; },
    /* 供 celebrate.js 复用同一个（已解锁的）AudioContext 合成庆祝音效 */
    ctx: function () { return ensureAC(); },
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    /* 用户是否真的点过页面。
       注意与 unlocked 区分：微信里 WeixinJSBridgeReady 会在加载时就解锁音频，
       但那不是用户意图 —— 拿 unlocked 当"可以自动朗读"的判断，
       就会出现"点开链接突然冒出一个单词的声音"。 */
    userGesture: function () { return gestured; },
    state: function () {
      return { channel: channel, unlocked: unlocked, gestured: gestured,
               wechat: IN_WX, ios: IS_IOS,
               ac: ac ? ac.state : 'none', lastFailAt: lastFailAt };
    },
    get pending() { return w.Voice.__pending; }
  };

  /* 全局手势解锁：capture 阶段，确保任何点击都能激活音频 */
  function onGesture() {
    gestured = true;
    w.Voice.unlock();
    w.removeEventListener('touchend', onGesture, true);
    w.removeEventListener('click', onGesture, true);
    w.removeEventListener('touchstart', onGesture, true);
  }
  w.addEventListener('touchend', onGesture, true);
  w.addEventListener('click', onGesture, true);
  w.addEventListener('touchstart', onGesture, true);

  /* 微信 JSBridge 就绪时再补一次解锁（iOS 微信常见需要） */
  function wxReadyUnlock() {
    try { w.Voice.unlock(); } catch (e) {}
  }
  if (IN_WX) {
    document.addEventListener('WeixinJSBridgeReady', wxReadyUnlock, false);
    wxReadyUnlock();
  }
  /* 页面从后台回到前台时，部分内核会挂起 AudioContext */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && ac && ac.state === 'suspended') {
      try { ac.resume(); } catch (e) {}
    }
  });

})(window);
