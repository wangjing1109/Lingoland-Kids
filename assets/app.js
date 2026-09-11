/* ============================================================
   Lingoland Kids · 儿童英语闯关  v2
   首页目标 / 听力·口语·卡片 / 艾宾浩斯复习 / 7 种练习 / 错题库 / 奖励
   ============================================================ */
(function () {
'use strict';

/* ---------------- 工具 ---------------- */
var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rnd(n) { return Math.floor(Math.random() * n); }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pick(a, n) { return shuffle(a.slice()).slice(0, n); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function normalizeDateStr(str) {
  return ('' + str).replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/g, function (_, y, m, d) {
    return y + '-' + pad2(+m) + '-' + pad2(+d);
  });
}

/* 取单词配图：词库自带 > 补图表（EMOJI_MAP）> 兜底字母图标。
   补图表由 scripts/gen-emoji-map.py 生成，覆盖词库中原本没有配图的全部单词。 */
var EMOJI_MAP = window.EMOJI_MAP || {};
function emoOf(w) {
  if (!w) return '🔤';
  if (w[3]) return w[3];
  var e = EMOJI_MAP[String(w[0] || '').toLowerCase()];
  return e || '🔤';
}

function toast(msg, kind) {
  var box = $('#toastLayer');
  if (!box) return;
  var t = document.createElement('div');
  t.className = 'toast' + (kind ? ' toast--' + kind : '');
  t.innerHTML = '<svg><use href="#' + (kind === 'warn' ? 'i-close' : 'i-star') + '"/></svg><span>' + esc(msg) + '</span>';
  box.appendChild(t);
  setTimeout(function () {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
  }, 1700);
}

/* ---------------- 状态 ---------------- */
var KEY = 'lk_v2';

/* 激活码门禁：未激活时，点击任何功能按钮都会弹出激活窗。
   激活码池共 20 个，一个码绑定一台设备（联网校验，见 /api/activate）。
   更换 / 增减码请同时修改此处与 server.js 的 ACT_CODES。 */
var ACT_CODES = [
  'LL-3UZ5QR', 'LL-522YXE', 'LL-63NVXY', 'LL-C9NPEW', 'LL-GDZCCD',
  'LL-K6A4WB', 'LL-KMC7TH', 'LL-N5MNFP', 'LL-NE7AHN', 'LL-NN6SEN',
  'LL-NWTCWN', 'LL-P5V4RA', 'LL-P6Z7JS', 'LL-PUDWP2', 'LL-QFFAYY',
  'LL-VQ59FY', 'LL-XSWJJR', 'LL-XZ6QFT', 'LL-YEGCT3', 'LL-YPKA9W'
];

/* 未激活时仍放行的动作：激活弹窗本身 + 各类「关闭 / 返回」按钮。
   tab 切换走单独的 data-tab 分支，本就不在拦截范围内。 */
var ACT_FREE = {
  'act-ok': 1, 'act-later': 1, 'act-clear': 1,
  'mask-close': 1, 'parent-close': 1, 'report-close': 1,
  'ep-close': 1, 'share-close': 1, 'close': 1, 'sheet-close': 1, 'ov-close': 1,
  'whack-quit': 1
};

/* 设备指纹：首次激活时生成并持久化，用于「一个激活码绑定一台设备」的联网校验 */
function devId() {
  if (!S.deviceId) {
    var g = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : ('d' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    S.deviceId = g; save();
  }
  return S.deviceId;
}
var DEF = {
  v: 2, stars: 0, goal: 10, deck: 'primary', streak: 1, lastDay: '', parentOk: 0, activated: 0, deviceId: '', activatedCode: '', usedCodes: [],
  td: 0, tds: 0, tdDate: '', goalHit: false,
  checkin: { dates: [], patched: [], last: '' }, wish: null,
  pos: {}, learned: {}, master: {}, wrong: [], badges: {}, hist: {},
  cfg: { sound: 1, remind: 1, rate: 0.85 },
  stat: { learn: 0, listen: 0, speak: 0, spell: 0, vocab: 0, gram: 0, phrase: 0, match: 0, exam: 0, wrev: 0, perfect: 0, right: 0, total: 0 },
  profile: { name: 'Leo', avatar: '🦁' },
  matchLevel: 1
};
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function load() {
  try {
    var o = JSON.parse(localStorage.getItem(KEY));
    if (o && o.v === 2) {
      var s = Object.assign(clone(DEF), o);
      s.cfg = Object.assign(clone(DEF.cfg), o.cfg || {});
      s.stat = Object.assign(clone(DEF.stat), o.stat || {});
      s.pos = o.pos || {}; s.learned = o.learned || {}; s.master = o.master || {};
      s.hist = o.hist || {};
      s.wrong = o.wrong || []; s.badges = o.badges || {};
      /* 旧版没有 profile，给个默认头像和名字 */
      if (!s.profile || typeof s.profile !== 'object') s.profile = clone(DEF.profile);
      s.profile.name = (s.profile.name || DEF.profile.name).toString().slice(0, 8);
      s.profile.avatar = s.profile.avatar || DEF.profile.avatar;
      /* 旧版没有配对关卡 */
      if (!s.matchLevel) s.matchLevel = 1;
      /* 旧版打卡没有补签记录 */
      if (!s.checkin) s.checkin = clone(DEF.checkin);
      if (!Array.isArray(s.checkin.patched)) s.checkin.patched = [];
      /* 旧 ymd 格式未补零，迁移为 yyyy-mm-dd，避免字符串比较出错 */
      if (s.checkin.dates) s.checkin.dates = s.checkin.dates.map(normalizeDateStr);
      if (s.checkin.patched) s.checkin.patched = s.checkin.patched.map(normalizeDateStr);
      if (s.checkin.last) s.checkin.last = normalizeDateStr(s.checkin.last);
      if (s.tdDate) s.tdDate = normalizeDateStr(s.tdDate);
      if (s.lastDay) s.lastDay = normalizeDateStr(s.lastDay);
      if (s.hist) {
        var nh = {};
        for (var k in s.hist) { nh[normalizeDateStr(k)] = s.hist[k]; }
        s.hist = nh;
      }
      return s;
    }
  } catch (e) {}
  return clone(DEF);
}
var S = load();
S.activated = 1; /* 激活码门禁已取消：视为已激活，所有功能默认可用（含已有存档用户） */
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

function rollDay() {
  var k = ymd(new Date());
  if (S.tdDate === k) return;
  var y = ymd(new Date(Date.now() - 864e5));
  S.streak = (S.lastDay === y) ? (S.streak || 1) + 1 : 1;
  S.lastDay = k; S.tdDate = k; S.td = 0; S.tds = 0; S.goalHit = false;
  save();
}

/* ---------------- 词库 ---------------- */
var W = window.WORDS || {};
var DECKS = [
  { k: 'primary', n: '小升初单词',   e: '🎒', s: '小学教材核心词汇', lv: 1, need: 0 },
  { k: 'jh688',   n: '初中核心688',  e: '📘', s: '中考高频核心词',   lv: 2, need: 120 },
  { k: 'jhall',   n: '初中单词',     e: '📗', s: '初中教材完整词汇', lv: 2, need: 400 },
  { k: 'sh688',   n: '高中核心688',  e: '📙', s: '高考高频核心词',   lv: 3, need: 900 },
  { k: 'sh688a',  n: '高中单词',     e: '📕', s: '高中教材完整词汇', lv: 3, need: 1600 }
];
var DMAP = {};
DECKS.forEach(function (d, i) {
  d.i = i;
  d.w = (W[d.k] && W[d.k].w) || [];
  d.total = d.w.length;
  DMAP[d.k] = d;
});
function deck() { return DMAP[S.deck] || DMAP.primary; }
function unlocked(d) { return S.stars >= d.need; }

var IDX = {};
function findWord(k, w) {
  var d = DMAP[k]; if (!d) return null;
  var m = IDX[k];
  if (!m) { m = IDX[k] = {}; d.w.forEach(function (x) { if (!(x[0] in m)) m[x[0]] = x; }); }
  return m[w] || null;
}
function newWords(n) {
  var d = deck(), out = [], L = d.w.length; if (!L) return out;
  var p = S.pos[d.k] || 0;
  for (var i = 0; i < Math.min(n, L); i++) out.push(d.w[(p + i) % L]);
  return out;
}
function commitNew(n) {
  var d = deck(); if (!d.total) return;
  S.pos[d.k] = ((S.pos[d.k] || 0) + n) % d.total;
  S.learned[d.k] = Math.min(d.total, (S.learned[d.k] || 0) + n);
  save();
}
function distract(k, w, n) {
  var d = DMAP[k] || deck(), out = [], L = d.w.length, guard = 0, seen = {};
  seen[w] = 1;
  while (out.length < n && guard++ < 500) {
    var x = d.w[rnd(L)];
    if (seen[x[0]] || x[1] === undefined) continue;
    seen[x[0]] = 1; out.push(x);
  }
  return out;
}

/* ---------------- 艾宾浩斯抗遗忘 ---------------- */
var GAPS = [5 * 60e3, 30 * 60e3, 12 * 3600e3, 24 * 3600e3, 2 * 24 * 3600e3, 4 * 24 * 3600e3, 7 * 24 * 3600e3, 15 * 24 * 3600e3];
var GAP_TXT = ['5 分钟', '30 分钟', '12 小时', '1 天', '2 天', '4 天', '7 天', '15 天'];
function mKey(k, w) { return k + '|' + w; }
/* src 标记这个单词是怎么进入 master 的：
   'learn'  = 通过「学习/闪卡」真正学过的，才有资格进入抗遗忘复习；
   'exercise'= 通过听力/口语/练习等模式碰到的，只累计掌握数量，不加入复习队列。
   不传 src 时默认 'learn'，兼容旧数据。 */
function mLearn(k, w, src) {
  var key = mKey(k, w), m = S.master[key] || { s: 0, t: 0, due: 0 };
  m.s = 0; m.t = m.t || 0; m.due = Date.now() + GAPS[0];
  m.src = src || 'learn';
  S.master[key] = m; save();
}
function canReview(m) { return (m.src || 'learn') === 'learn'; }

/* ---------------- 单词配对：青铜→白银→黄金→王者 ---------------- */
var MATCH_LV = [
  null,
  { name: '青铜', pairs: 4, color: '#CD7F32', desc: '先从熟悉的单词开始' },
  { name: '白银', pairs: 6, color: '#A0A0A0', desc: '加入一些新单词' },
  { name: '黄金', pairs: 8, color: '#F4C430', desc: '挑战更多新词' },
  { name: '王者', pairs: 10, color: '#B76CF1', desc: '全部词库混合挑战' }
];
/* 去重：英文和中文都不能重。
   中文也要查，是因为不同单词可能译成一模一样的中文（比如 look / see 都是"看"），
   牌面上出现两张一样的中文，孩子没法判断该配哪张英文。 */
function uniqueWords(list) {
  var seen = {}, out = [];
  list.forEach(function (w) {
    if (!w || !w[0]) return;
    var k = 'e:' + String(w[0]).toLowerCase();
    var c = w[1] ? 'c:' + String(w[1]) : '';
    if (seen[k] || (c && seen[c])) return;
    seen[k] = true; if (c) seen[c] = true;
    out.push(w);
  });
  return out;
}
function matchWords(level) {
  var need = MATCH_LV[level].pairs, d = deck(), out = [], seen = {};
  /* 已学过的单词（按当前词库） */
  var learned = [];
  Object.keys(S.master).forEach(function (k) {
    var i = k.indexOf('|');
    if (i > 0 && k.slice(0, i) === d.k) {
      var w = findWord(d.k, k.slice(i + 1));
      if (w) learned.push(w);
    }
  });
  learned = shuffle(learned);
  function add(list) {
    list.forEach(function (w) {
      if (!w || !w[0]) return;
      var k = 'e:' + String(w[0]).toLowerCase();
      var c = w[1] ? 'c:' + String(w[1]) : '';
      if (seen[k] || (c && seen[c])) return;
      seen[k] = true; if (c) seen[c] = true;
      out.push(w);
    });
  }
  if (level === 1) {
    add(learned.slice(0, need));
    if (out.length < need) add(newWords(need * 2));
  } else if (level === 2) {
    var half = Math.min(learned.length, Math.ceil(need / 2));
    add(learned.slice(0, half));
    add(newWords(need * 2));
  } else if (level === 3) {
    add(newWords(need * 2));
  } else {
    var pool = [];
    DECKS.forEach(function (dd) { if (unlocked(dd)) pool = pool.concat(dd.w); });
    add(pick(pool, need * 2));
  }
  /* 兜底：去重后凑不够，就从更大的池子里多摇几轮补上 */
  if (out.length < need) add(shuffle(d.w.slice()).slice(0, need * 6));
  if (out.length < need) {
    var all = [];
    DECKS.forEach(function (dd) { if (dd && dd.w) all = all.concat(dd.w); });
    add(shuffle(all).slice(0, need * 12));
  }
  return out.slice(0, need);
}
function mReview(k, w, ok) {
  var key = mKey(k, w), m = S.master[key] || { s: 0, t: 0, due: 0 };
  m.s = ok ? Math.min(m.s + 1, GAPS.length - 1) : 0;
  m.t = (m.t || 0) + 1;
  m.due = Date.now() + GAPS[m.s];
  S.master[key] = m; save();
}
function dueList() {
  var now = Date.now(), out = [];
  for (var key in S.master) {
    if (!Object.prototype.hasOwnProperty.call(S.master, key)) continue;
    var m = S.master[key];
    if (canReview(m) && m.due <= now) {
      var i = key.indexOf('|');
      out.push({ k: key.slice(0, i), w: key.slice(i + 1), due: m.due, t: m.t || 0, s: m.s || 0 });
    }
  }
  return out.sort(function (a, b) { return a.due - b.due; })
}
function planList() {
  var out = [];
  for (var key in S.master) {
    if (!Object.prototype.hasOwnProperty.call(S.master, key)) continue;
    var m = S.master[key];
    if (!canReview(m)) continue;
    var i = key.indexOf('|');
    out.push({ k: key.slice(0, i), w: key.slice(i + 1), due: m.due, s: m.s || 0 });
  }
  return out.sort(function (a, b) { return a.due - b.due; });
}
function nextDueTime() {
  var now = Date.now(), min = Infinity;
  for (var key in S.master) {
    if (!Object.prototype.hasOwnProperty.call(S.master, key)) continue;
    var m = S.master[key];
    if (m.due > now && m.due < min) min = m.due;
  }
  return min;
}
function masterCount() { return Object.keys(S.master).length; }
function fmtGap(ms) {
  if (!isFinite(ms)) return '—';
  var s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' 秒';
  var m = Math.floor(s / 60); if (m < 60) return m + ' 分';
  var h = Math.floor(m / 60); if (h < 24) return h + ' 小时';
  return Math.floor(h / 24) + ' 天';
}

/* ---------------- 发音 ---------------- */
var VOICE = null, UON = false;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  var vs = speechSynthesis.getVoices() || [];
  if (!vs.length) return;
  function score(v) {
    var s = 0;
    if (/^en[-_]US/i.test(v.lang)) s += 10; else if (/^en/i.test(v.lang)) s += 5;
    if (/google/i.test(v.name)) s += 6;
    if (/natural|neural|enhanced|premium/i.test(v.name)) s += 4;
    if (/samantha|ava|allison|susan|karen|daniel|zira|aria|jenny|guy|libby|serena/i.test(v.name)) s += 3;
    if (v.localService) s += 2;
    return -s;
  }
  VOICE = vs.slice().sort(function (a, b) { return score(a) - score(b); })[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
/* 走真人发音引擎（同源代理 → 直连音源 → 系统 TTS 三级降级）。
   引擎内部会在未解锁时暂存待播，手势解锁后自动补播。 */
function speak(text, rate) {
  if (!S.cfg.sound || !text) return false;
  try {
    if (window.Voice) { Voice.speak(String(text), rate || S.cfg.rate); return true; }
  } catch (e) { /* 落到下面的系统 TTS 兜底 */ }
  if (!UON || !('speechSynthesis' in window)) return false;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'en-US'; u.rate = rate || S.cfg.rate; u.pitch = 1.12; u.volume = 1;
    if (VOICE) u.voice = VOICE;
    speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
function stopSpeak() {
  try { if (window.Voice) Voice.stop(); } catch (e) {}
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
}

/* 用户是否已经真的点过页面。
   不能用「音频已解锁」代替：微信里 WeixinJSBridgeReady 会在加载阶段就把音频解锁，
   拿它当判断就会出现「点开链接突然冒出一个单词的声音」。 */
function audioReady() {
  try {
    if (window.Voice && window.Voice.userGesture) return !!window.Voice.userGesture();
  } catch (e) {}
  return !!UON;   /* 老版本 voice.js 的兜底 */
}
/* 自动朗读：翻到新单词 / 新题目时自己念一遍。
   关键约束 —— 必须等用户点过页面之后才发声。
   否则「微信里点开链接」就会突然冒出一个单词的读音，
   既吓孩子一跳，也容易撞上浏览器/微信的自动播放限制而白费一次发音请求。
   首次打开保持安静，想听随时点小喇叭。 */
function autoSpeak(text, delay) {
  if (!text || !S.cfg.sound || !audioReady()) return;
  setTimeout(function () { speak(text); }, delay || 300);
}

/* ---------------- 按键音效 ----------------
   所有按钮/选项按下时给一声轻响，孩子点什么都有回应。
   音量已压到很低，不会盖过单词发音；cfg.sound 关闭时整体静音。 */
var SFX_MAP = {
  /* 轻点：选项、卡片、字母格 */
  'ex-opt': 'pop', 'ex-slot': 'pop', 'ex-letter': 'pop', 'ex-match': 'pop',
  'flip': 'pop', 'sc-flip': 'pop', 'fc-prev': 'pop', 'sc-prev': 'pop',
  /* 返回 / 关闭：下行的两声，听感上就是"退回去" */
  'listen-quit': 'back', 'speak-quit': 'back', 'study-quit': 'back', 'ex-quit': 'back',
  'wrong-quit': 'back', 'report-close': 'back', 'parent-close': 'back', 'parent-back': 'back',
  'rs-back': 'back', 'mask-close': 'back', 'review-ahead': 'back'
};
/* 这几个动作自己会在判定后发「答对/答错」音，
   全局处理器不再叠一层按键声，否则会糊成一团。 */
var SFX_SELF = { 'ls-pick': 1, 'ex-opt': 1, 'ex-match': 1 };
function sfx(kind) {
  if (!S.cfg.sound) return;
  try { if (window.Voice) Voice.tap(kind); } catch (e) {}
}
function clickSfx(act) { sfx(SFX_MAP[act] || 'tap'); }
/* 预加载后续单词的真人音频，消除点击后的等待 */
function preloadVoice(list, idx) {
  try {
    if (!window.Voice || !list || !list.length) return;
    var out = [], i;
    for (i = (idx || 0); i < Math.min(list.length, (idx || 0) + 5); i++) {
      if (list[i] && list[i][0]) out.push(String(list[i][0]).toLowerCase());
    }
    Voice.preload(out);
  } catch (e) {}
}

/* ---------------- 星星 / 徽章 ---------------- */
var newBadges = [];
function addStars(n, why) {
  if (!n) return;
  S.stars += n; S.tds += n; dayAdd('star', n);
  var openBefore = DECKS.filter(unlocked).length;
  save();
  var p = $('#starPill');
  if (p) { p.classList.add('is-bump'); setTimeout(function () { p.classList.remove('is-bump'); }, 280); }
  var sn = $('#starNum'); if (sn) sn.textContent = S.stars;
  if (why) toast('+' + n + ' ⭐ ' + why);
  var openAfter = DECKS.filter(unlocked).length;
  if (openAfter > openBefore) {
    var nd = DECKS[openAfter - 1];
    setTimeout(function () { toast('🎉 解锁新词库：' + nd.n, 'ok'); }, 500);
  }
  checkBadges();
}
function dayAdd(f, n) {
  if (n <= 0) return;
  var k = ymd(new Date());
  var d = S.hist[k] || (S.hist[k] = { learn: 0, right: 0, review: 0, star: 0 });
  d[f] = (d[f] || 0) + n;
}
function bumpToday(n) {
  if (n <= 0) return;
  dayAdd('learn', n);
  var before = S.td;
  S.td += n;
  save();
  if (!S.goalHit && before < S.goal && S.td >= S.goal) {
    S.goalHit = true; save();
    setTimeout(function () { addStars(50, '完成今日目标'); toast('🎉 今日目标完成！', 'ok'); }, 320);
  }
  renderHome();
}

var BADGES = [
  { id: 'w10',  n: '初露锋芒',   d: '学会 10 个单词',       sh: 'star',   ok: function () { return masterCount() >= 10; } },
  { id: 'w50',  n: '词汇新星',   d: '学会 50 个单词',       sh: 'hex',    ok: function () { return masterCount() >= 50; } },
  { id: 'w100', n: '百词斩',     d: '学会 100 个单词',      sh: 'shield', ok: function () { return masterCount() >= 100; } },
  { id: 'w300', n: '词汇大师',   d: '学会 300 个单词',      sh: 'blob',   ok: function () { return masterCount() >= 300; } },
  { id: 'ear',  n: '听力达人',   d: '听力答对 30 题',       sh: 'star',   ok: function () { return S.stat.listen >= 30; } },
  { id: 'spk',  n: '口语小明星', d: '跟读 85 分以上 10 次', sh: 'hex',    ok: function () { return S.stat.perfect >= 10; } },
  { id: 'spl',  n: '拼写王',     d: '拼写答对 20 题',       sh: 'shield', ok: function () { return S.stat.spell >= 20; } },
  { id: 'grm',  n: '语法能手',   d: '语法答对 20 题',       sh: 'blob',   ok: function () { return S.stat.gram >= 20; } },
  { id: 'mat',  n: '配对高手',   d: '完成 5 局单词配对',    sh: 'star',   ok: function () { return S.stat.match >= 5; } },
  { id: 'fix',  n: '知错就改',   d: '错题复习 10 次',       sh: 'hex',    ok: function () { return S.stat.wrev >= 10; } },
  { id: 'd3',   n: '三日坚持',   d: '连续学习 3 天',        sh: 'shield', ok: function () { return S.streak >= 3; } },
  { id: 'd7',   n: '一周不断',   d: '连续学习 7 天',        sh: 'blob',   ok: function () { return S.streak >= 7; } },
  { id: 's500', n: '星星收藏家', d: '累计 500 ⭐',          sh: 'star',   ok: function () { return S.stars >= 500; } },
  { id: 'all',  n: '词库全通',   d: '解锁全部 5 个词库',    sh: 'hex',    ok: function () { return DECKS.every(unlocked); } }
];
function checkBadges() {
  var got = false;
  BADGES.forEach(function (b) {
    if (!S.badges[b.id] && b.ok()) { S.badges[b.id] = 1; newBadges.push(b); got = true; }
  });
  if (got) { save(); renderReward(); }
}

/* ---------------- 覆盖层 / TAB ---------------- */
function openOv(id) {
  stopSpeak();
  $$('.ov').forEach(function (o) { o.classList.remove('is-open'); });
  var t = $(id); if (t) t.classList.add('is-open');
  var sc = $('#scroll'); if (sc) sc.scrollTop = 0;
}
function closeOv() {
  stopSpeak();
  try { stopAuto(); } catch (e) {}
  $$('.ov').forEach(function (o) { o.classList.remove('is-open'); });
}
function openSheet(id) { $('#mask').classList.add('is-open'); $(id).classList.add('is-open'); }
function closeSheet() {
  $('#mask').classList.remove('is-open');
  $$('.sheet').forEach(function (s) { s.classList.remove('is-open'); });
}

var TABMETA = {
  home:    ['首页', '今天也要加油哦'],
  decks:   ['闯关词库', '攒星星，解锁下一级'],
  flash:   ['闪卡', '点卡片翻面看中文'],
  reward:  ['奖励', '你的努力都在这里'],
  profile: ['我的', '设置与学习数据']
};
function goTab(k) {
  $$('.tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === k); });
  $$('.page').forEach(function (p) { p.classList.toggle('is-active', p.id === 'p-' + k); });
  var m = TABMETA[k] || TABMETA.home;
  $('#barMain').textContent = m[0];
  $('#barSub').textContent = m[1];
  var sc = $('#scroll'); if (sc) sc.scrollTop = 0;
  if (k === 'decks') renderDecks();
  if (k === 'flash') { renderSwitch(); if (!FC) fcStart(S.deck); else renderFC(); }
  if (k === 'reward') renderReward();
  if (k === 'profile') renderProfile();
  if (k === 'home') renderHome();
}

/* ---------------- 首页 ---------------- */
function renderHome() {
  var d = deck();
  var pf = S.profile || DEF.profile;
  $('#homeName').textContent = pf.name || DEF.profile.name;
  $('#homeAva').textContent = pf.avatar || DEF.profile.avatar;
  $('#dnEmo').textContent = d.e;
  $('#dnName').textContent = d.n;
  $('#dnMeta').textContent = d.total + ' 词 · 已学 ' + (S.learned[d.k] || 0);

  var g = S.goal, done = S.td;
  $('#goalRing').style.setProperty('--p', g > 0 ? clamp(done / g, 0, 1) : 0);
  $('#goalTxt').textContent = '今日目标 ' + Math.min(done, g) + ' / ' + g;
  $('#goalNote').textContent = S.goalHit ? '今日目标已完成 🎉'
    : ('还差 ' + Math.max(0, g - done) + ' 个 · 完成 +50 ⭐');
  $('#homeSub').textContent = '「' + d.n + '」还有 ' + Math.max(0, d.total - (S.learned[d.k] || 0)) + ' 个新单词等你';

  var due = dueList().length;
  $('#reviewBar').classList.toggle('is-empty', due === 0);
  $('#reviewN').textContent = due;
  $('#reviewSub').textContent = due > 0 ? ('有 ' + due + ' 个单词到复习时间了')
    : (masterCount() ? ('下次复习在 ' + fmtGap(nextDueTime() - Date.now()) + ' 后') : '先去学几个单词吧');

  $('#wrongN').textContent = S.wrong.length;
  $('#prTip').textContent = '按「' + d.n + '」出题';
  $('#starNum').textContent = S.stars;
}

/* ---------------- 词库页 ---------------- */
function renderDecks() {
  var open = DECKS.filter(unlocked).length;
  $('#deckProg').textContent = '已解锁 ' + open + ' / ' + DECKS.length + ' 个词库 · 当前 ' + S.stars + ' ⭐';
  $('#deckList').innerHTML = DECKS.map(function (d, i) {
    var ok = unlocked(d), cur = S.deck === d.k;
    var pct = d.total ? Math.round((S.learned[d.k] || 0) / d.total * 100) : 0;
    return '<div class="deck deck--' + (i + 1) + (ok ? '' : ' is-lock') + (cur ? ' is-cur' : '') +
      '" data-act="deck-use" data-deck="' + d.k + '">' +
      '<div class="deck__top">' +
        '<div class="deck__ico">' + (ok ? d.e : '🔒') + '</div>' +
        '<div style="flex:1;min-width:0"><div class="deck__n">' + d.n + '</div><div class="deck__s">' + d.s + '</div></div>' +
        '<div class="deck__cnt"><b>' + d.total + '</b><span>词</span></div>' +
      '</div>' +
      '<div class="deck__meta"><div class="bar"><div class="bar__fill" style="--pct:' + pct + '%"></div></div>' +
        '<div class="deck__lv">已学 ' + (S.learned[d.k] || 0) + '</div></div>' +
      (ok ? (cur ? '<div class="deck__lock">✔ 当前正在使用这个词库</div>' : '')
          : '<div class="deck__lock"><svg style="width:16px;height:16px"><use href="#i-lock"/></svg> 需要 ' +
            d.need + ' ⭐（还差 ' + (d.need - S.stars) + '）</div>') +
      '</div>';
  }).join('');
}

/* ---------------- 闪卡页 ---------------- */
var FC = null, CUR = null;
function renderSwitch() {
  $('#flashSwitch').innerHTML = DECKS.map(function (d) {
    var ok = unlocked(d);
    return '<button class="dsw' + (S.deck === d.k ? ' is-on' : '') + (ok ? '' : ' is-off') +
      '" data-act="flash-deck" data-deck="' + d.k + '">' + (ok ? d.e : '🔒') + ' ' + d.n + '</button>';
  }).join('');
}
function fcStart(k) {
  var d = DMAP[k] || deck();
  if (!d.w.length) return;
  FC = { k: k, list: pick(d.w, Math.min(20, d.w.length)), i: 0, know: 0, again: 0 };
  renderFC();
}
function renderFC() {
  if (!FC || !FC.list.length) return;
  var w = FC.list[FC.i]; CUR = w;
  var card = $('#fcCard');
  card.classList.remove('is-flipped');
  $('#fcEmo').textContent = emoOf(w);
  $('#fcWord').textContent = w[0];
  $('#fcPh').textContent = w[2] || '';
  $('#fcCn').textContent = w[1];
  $('#fcEg').textContent = '点「认识了」记入抗遗忘复习';
  $('#fcFront').style.background = 'var(--c-yellow)';
  var n = FC.list.length;
  $('#fcIdx').textContent = (FC.i + 1) + ' / ' + n;
  $('#fcBar').style.setProperty('--pct', Math.round(FC.i / n * 100) + '%');
  $('#fcKnow').textContent = FC.know;
  $('#fcAgain').textContent = FC.again;
  preloadVoice(FC.list, FC.i);
  autoSpeak(w[0], 280);
}

/* ---------------- 听力练习 ---------------- */
var LS = null;
function startListen() {
  var n = Math.min(20, Math.max(10, S.goal));
  var ws = newWords(n);
  if (!ws.length) { toast('当前词库没有单词', 'warn'); return; }
  LS = { list: ws, i: 0, right: 0, combo: 0, earned: 0, lock: false };
  openOv('#ovListen');
  renderLS();
}
function renderLS() {
  var w = LS.list[LS.i]; CUR = w;
  var n = LS.list.length;
  $('#lsIdx').textContent = (LS.i + 1) + '/' + n;
  $('#lsBar').style.setProperty('--pct', Math.round(LS.i / n * 100) + '%');
  $('#lsMain').textContent = '🔊';
  $('#lsPh').textContent = '点喇叭再听一次';
  LS.lock = false;
  var opts = shuffle([w].concat(distract(S.deck, w[0], 3)));
  LS.opts = opts; LS.ans = w[0];
  $('#lsOpts').innerHTML = opts.map(function (o, i) {
    return '<div class="opt" data-act="ls-pick" data-i="' + i + '"><span class="opt__k">' +
      'ABCD'[i] + '</span><span style="flex:1">' + esc(o[0]) + '</span></div>';
  }).join('');
  $('#lsCombo').style.display = LS.combo >= 2 ? '' : 'none';
  $('#lsCombo').textContent = '连对 ' + LS.combo;
  preloadVoice(LS.list, LS.i);
  autoSpeak(w[0], 340);
}
function lsPick(i) {
  if (!LS || LS.lock) return;
  LS.lock = true;
  var got = LS.opts[i][0], ok = got === LS.ans;
  sfx(ok ? 'ok' : 'no');
  $$('#lsOpts .opt').forEach(function (nd, j) {
    if (LS.opts[j][0] === LS.ans) nd.classList.add('is-right');
    else if (j === i) nd.classList.add('is-wrong');
  });
  S.stat.total++;
  if (ok) {
    LS.right++; LS.combo++; S.stat.right++; S.stat.listen++;
    LS.earned += 2; addStars(2, '听力答对');
    mLearn(S.deck, LS.ans, 'exercise');
    bumpToday(1);
    if (LS.combo >= 3) { LS.earned += 5; addStars(5, '连对 ' + LS.combo + ' 题'); }
  } else {
    LS.combo = 0;
    var w = findWord(S.deck, LS.ans) || [LS.ans, '', '', ''];
    addWrong({ type: 'listen', q: '听发音选单词', a: LS.ans, opts: LS.opts.map(function (o) { return o[0]; }),
      en: w[0], cn: w[1], ipa: w[2], tip: LS.ans + ' = ' + w[1] });
  }
  $('#lsPh').textContent = ok ? '✔ 答对了！' : ('正确答案：' + LS.ans + ' ' + (findWord(S.deck, LS.ans) || ['', ''])[1]);
  speak(LS.ans);
  save();
  var tk = LS;
  setTimeout(function () {
    if (!LS || LS !== tk) return;          // 中途退出则丢弃
    LS.i++;
    if (LS.i >= LS.list.length) finListen(); else renderLS();
  }, ok ? 950 : 1600);
}
function finListen() {
  var total = LS.list.length, right = LS.right;
  var bonus = (right === total) ? 20 : (right / total >= 0.6 ? 10 : 0);
  if (bonus) { LS.earned += bonus; addStars(bonus, right === total ? '全部答对' : '正确率达标'); }
  showResult({ title: right === total ? '听力满分！' : '听力练习完成', right: right, total: total, gain: LS.earned,
    sub: [['正确率', Math.round(right / total * 100) + '%'], ['连对最高', LS.combo], ['获得 ⭐', LS.earned]] });
}

/* ---------------- 打地鼠单词游戏 ---------------- */
var WH = null, WH_TICK = null, WH_RETRACT = null;
var WH_SEL = { theme: 'primary', diff: 'easy' }, WH_LAST = null;
var WH_DIFFS = {
  easy:   { n: '简单', time: 90,  stay: 1400, dis: 1, gap: 6 },
  normal: { n: '中等', time: 120, stay: 1100, dis: 2, gap: 5 },
  hard:   { n: '困难', time: 150, stay: 900,  dis: 3, gap: 5 }
};
function startWhack() {
  // 默认主题 = 当前学习进度对应的词库（若已解锁）
  if (!WH_SEL.theme || !DMAP[WH_SEL.theme] || !unlocked(DMAP[WH_SEL.theme])) WH_SEL.theme = 'primary';
  renderWhChips();
  openOv('#ovWhackStart');
}
function renderWhChips() {
  var t = $('#whThemes'); t.innerHTML = '';
  DECKS.forEach(function (d) {
    var ok = unlocked(d), sel = (d.k === WH_SEL.theme) ? ' is-sel' : '', lk = ok ? '' : ' is-lock';
    t.innerHTML += '<div class="wh-chip' + sel + lk + '" data-act="whack-theme" data-theme="' + d.k + '">' +
      d.e + ' <b>' + esc(d.n) + '</b>' + (ok ? '' : '<i>🔒' + d.need + '⭐</i>') + '</div>';
  });
  var f = $('#whDiffs'); f.innerHTML = '';
  Object.keys(WH_DIFFS).forEach(function (k) {
    var D = WH_DIFFS[k], sel = (k === WH_SEL.diff) ? ' is-sel' : '';
    f.innerHTML += '<div class="wh-chip' + sel + '" data-act="whack-diff" data-diff="' + k + '">' +
      '<b>' + D.n + '</b><i>' + D.time + '秒</i></div>';
  });
}
function whackGo() {
  if (WH_TICK) clearInterval(WH_TICK);
  WH = null;
  whackBegin(WH_SEL.theme, WH_SEL.diff);
}
function whackBegin(themeKey, diffKey) {
  var d = DMAP[themeKey] || deck();
  if (!d.w.length) { toast('该主题还没有单词', 'warn'); return; }
  var diff = WH_DIFFS[diffKey] || WH_DIFFS.easy;
  WH_LAST = { themeKey: themeKey, diffKey: diffKey };
  WH = { themeKey: themeKey, diff: diff, score: 0, combo: 0, best: 0, right: 0, miss: 0, wrong: 0,
         rounds: 0, level: 1, timeLeft: diff.time,
         holes: [null, null, null, null, null, null, null, null, null], rightWords: {} };
  openOv('#ovWhack');
  $('#whScore').textContent = '0 分';
  $('#whTime').textContent = diff.time + 's';
  $('#whBar').style.setProperty('--pct', 1);
  $('#whCombo').textContent = '';
  $('#whLvl').textContent = '第 1 关';
  $('#whRound').textContent = '回合 1';
  ensureWhGrid();
  if (WH_TICK) clearInterval(WH_TICK);
  WH_TICK = setInterval(function () {
    if (!WH) return;
    WH.timeLeft--;
    $('#whTime').textContent = WH.timeLeft + 's';
    $('#whBar').style.setProperty('--pct', clamp(WH.timeLeft / WH.diff.time, 0, 1));
    if (WH.timeLeft <= 0) finWhack();
  }, 1000);
  roundWhack();
}
function ensureWhGrid() {
  var g = $('#whGrid'); if (!g || g.children.length === 9) return;
  g.innerHTML = '';
  for (var i = 0; i < 9; i++)
    g.innerHTML += '<div class="wh-hole"><div class="wh-mole" data-act="whack-hit" data-hole="' + i + '">' +
      '<span class="wh-mole__emo"></span><span class="wh-mole__txt"></span></div></div>';
}
function roundWhack() {
  if (!WH || WH.timeLeft <= 0) return;
  WH.rounds++;
  // 关卡递增：每 gap 回合升一关，地鼠停留更短、干扰更多
  WH.level = Math.floor((WH.rounds - 1) / WH.diff.gap) + 1;
  var stay = Math.round(clamp(WH.diff.stay * Math.pow(0.92, WH.level - 1), 520, WH.diff.stay));
  var disCount = Math.min(8, WH.diff.dis + Math.floor((WH.level - 1) / 2));
  var count = Math.min(9, 1 + disCount);
  $('#whLvl').textContent = '第 ' + WH.level + ' 关';
  $('#whRound').textContent = '回合 ' + WH.rounds;
  WH.holes = [null, null, null, null, null, null, null, null, null];
  var moles = $$('#whGrid .wh-mole');
  moles.forEach(function (m) {
    m.classList.remove('is-up', 'is-hit', 'is-miss');
    m.querySelector('.wh-mole__emo').textContent = '';
    m.querySelector('.wh-mole__txt').textContent = '';
  });
  WH.lock = false;
  var ws = DMAP[WH.themeKey].w;
  var w = ws[rnd(ws.length)];
  var mode = ['listen', 'cn', 'en'][rnd(3)];
  var dis = distract(WH.themeKey, w[0], disCount);
  var idxs = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, count);
  var targetHole = idxs[0], disI = 0;
  idxs.forEach(function (h) {
    var isT = (h === targetHole), word = isT ? w : (dis[disI++] || w);
    var emo = emoOf(word), txt = (mode === 'en') ? (word[1] || emo) : word[0];
    WH.holes[h] = { en: word[0], isTarget: isT, mode: mode };
    moles[h].querySelector('.wh-mole__emo').textContent = emo || (mode === 'en' ? '❓' : '🔤');
    moles[h].querySelector('.wh-mole__txt').textContent = txt;
  });
  var p = $('#whPrompt');
  if (mode === 'listen') { p.innerHTML = '🔊 听发音，点出这个单词！'; autoSpeak(w[0], 200); }
  else if (mode === 'cn') { p.innerHTML = '点出这个意思：<b>' + esc(w[1]) + '</b> ' + (emoOf(w) || ''); }
  else { p.innerHTML = '点出这个单词：<b>' + esc(w[0]) + '</b> <span style="color:var(--c-ink-45)">' + esc(w[2] || '') + '</span>'; }
  requestAnimationFrame(function () { idxs.forEach(function (h) { moles[h].classList.add('is-up'); }); });
  if (WH_RETRACT) clearTimeout(WH_RETRACT);
  WH_RETRACT = setTimeout(retractRound, stay);
}
function whackHit(el) {
  if (!WH || WH.lock) return;
  var h = +el.dataset.hole, m = WH.holes[h];
  if (!m) return;
  WH.lock = true;
  if (WH_RETRACT) clearTimeout(WH_RETRACT);
  if (m.isTarget) {
    WH.right++; WH.combo++; if (WH.combo > WH.best) WH.best = WH.combo;
    var gain = 10 + (WH.combo >= 3 ? 5 : 0);
    WH.score += gain;
    sfx('ok'); cheerRight(WH.combo >= 3);
    el.classList.add('is-hit');
    popScore(el, '+' + gain);
    $('#whScore').textContent = WH.score + ' 分';
    $('#whCombo').textContent = WH.combo >= 2 ? ('连对 ' + WH.combo + ' 🔥') : '';
    var wd = findWord(WH.themeKey, m.en) || [m.en, '', '', ''];
    var key = m.en;
    if (!WH.rightWords[key]) WH.rightWords[key] = { en: m.en, cn: wd[1] || '', emo: emoOf(wd) || '🔤', hits: 0 };
    WH.rightWords[key].hits++;
  } else {
    WH.combo = 0; WH.wrong++; sfx('no');
    el.classList.add('is-miss'); $('#whCombo').textContent = '';
    var w = findWord(WH.themeKey, m.en) || [m.en, '', '', ''];
    addWrong({ type: 'whack', q: '打地鼠点错', a: m.en, en: m.en, cn: w[1], ipa: w[2], opts: null, tip: '正确单词：' + m.en });
  }
  setTimeout(function () { if (WH && WH.timeLeft > 0) roundWhack(); }, m.isTarget ? 480 : 720);
}
function popScore(el, txt) {
  var pop = document.createElement('span');
  pop.className = 'wh-pop'; pop.textContent = txt;
  el.appendChild(pop);
  setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 700);
}
function retractRound() {
  if (!WH) return;
  var moles = $$('#whGrid .wh-mole'), missed = false, tgt = null;
  WH.holes.forEach(function (m, h) {
    var nd = moles[h];
    if (m && m.isTarget) { tgt = m; if (nd && nd.classList.contains('is-up')) { missed = true; nd.classList.add('is-miss'); } }
    if (nd) nd.classList.remove('is-up');
  });
  if (missed) {
    WH.combo = 0; WH.miss++; $('#whCombo').textContent = '';
    var w = findWord(WH.themeKey, tgt.en) || [tgt.en, '', '', ''];
    addWrong({ type: 'whack', q: '打地鼠漏点', a: tgt.en, en: tgt.en, cn: w[1], ipa: w[2], opts: null, tip: '正确单词：' + tgt.en });
  }
  if (WH.timeLeft > 0) setTimeout(roundWhack, 340);
}
function finWhack() {
  if (WH_TICK) { clearInterval(WH_TICK); WH_TICK = null; }
  if (WH_RETRACT) { clearTimeout(WH_RETRACT); WH_RETRACT = null; }
  if (!WH) return;
  var total = WH.right + WH.wrong + WH.miss;
  var acc = total ? Math.round(WH.right / total * 100) : 0;
  var bonus = WH.score >= 200 ? 50 : (WH.score >= 100 ? 30 : (WH.score >= 40 ? 15 : 0));
  WH.score += bonus;
  if (WH.score) addStars(WH.score, '打地鼠 ' + WH.right + ' 只');
  var list = Object.keys(WH.rightWords).map(function (k) { return WH.rightWords[k]; })
    .sort(function (a, b) { return (a.cn || '').localeCompare(b.cn || '', 'zh'); });
  $('#whFinal').innerHTML =
    '<div class="wh-stat"><b>' + WH.score + '</b><span>总得分</span></div>' +
    '<div class="wh-stat"><b>' + WH.right + '</b><span>答对</span></div>' +
    '<div class="wh-stat"><b>' + acc + '%</b><span>正确率</span></div>' +
    '<div class="wh-stat"><b>' + WH.best + '</b><span>最高连对</span></div>' +
    '<div class="wh-stat"><b>' + WH.level + '</b><span>到达关卡</span></div>' +
    (bonus ? '<div class="wh-stat wh-stat--bonus"><b>+' + bonus + '</b><span>通关奖励</span></div>' : '');
  $('#whWords').innerHTML = list.length
    ? list.map(function (w) { return '<span class="wh-word">' + (w.emo || '🔤') + ' <b>' + esc(w.en) + '</b>' + (w.cn ? ' ' + esc(w.cn) : '') + (w.hits > 1 ? ' <i>×' + w.hits + '</i>' : '') + '</span>'; }).join('')
    : '<span class="wh-word wh-word--none">这一局还没点中单词，下局加油！🐹</span>';
  openOv('#ovWhackResult');
  WH = null;
}

/* ---------------- 口语跟读打分 ---------------- */
var SP = null, RECMODE = 'self', MIC = null;
/* 微信内置浏览器里的 webkitSpeechRecognition 依赖 Google 服务，
   国内必然以 network 错误告终，且要空等 5 秒 —— 这里直接跳过，走麦克风音量评估。 */
var IN_WX = /MicroMessenger/i.test(navigator.userAgent || '');
(function () {
  if (!IN_WX && (window.SpeechRecognition || window.webkitSpeechRecognition)) RECMODE = 'sr';
  else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) RECMODE = 'mic';
})();
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(); }
function lev(a, b) {
  var m = a.length, n = b.length, i, j, prev = [];
  if (!m) return n; if (!n) return m;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    var cur = [i];
    for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function scoreOf(target, heard) {
  var a = norm(target), b = norm(heard);
  if (!b) return 0;
  var d = lev(a, b), L = Math.max(a.length, b.length);
  return clamp(Math.round((1 - d / L) * 100), 0, 100);
}
function startSpeak() {
  var n = Math.min(20, Math.max(10, S.goal));
  var ws = newWords(n);
  if (!ws.length) { toast('当前词库没有单词', 'warn'); return; }
  SP = { list: ws, i: 0, scores: [], earned: 0, busy: false, stopRec: null, token: 1 };
  openOv('#ovSpeak');
  renderSP();
}
function renderSP() {
  var w = SP.list[SP.i]; CUR = w;
  var n = SP.list.length;
  SP.token = (SP.token || 0) + 1;
  SP.busy = false; SP.stopRec = null; SP.recStop = null; micMeterOff();
  $('#spIdx').textContent = (SP.i + 1) + '/' + n;
  $('#spProg').textContent = '已读 ' + SP.i + ' / ' + n;
  $('#spBar').style.setProperty('--pct', Math.round(SP.i / n * 100) + '%');
  $('#spkWord').textContent = w[0];
  $('#spkPh').textContent = w[2] || '';
  $('#spkCn').textContent = w[1];
  $('#spkScore').innerHTML = '';
  $('#micBtn').classList.remove('is-rec');
  var nx =   $('#spkNext'); nx.disabled = true; nx.textContent = '下一个';
  $('#spkTip').textContent = '自动朗读后跟着读，读完自动评分';
  var modeEl = $('#spkMode');
  modeEl.className = 'spk-mode spk-mode--ok';
  modeEl.innerHTML = '🔊 自动朗读 + 自动跟读评分 · 想用麦克风真实打分就点 🎙️';
  preloadVoice(SP.list, SP.i);
  autoSpeak(w[0], 340);
  startAutoSpeak();
  armMic();   /* 预热麦克风：点 🎙️ 时录制瞬时启动，避免冷启动吃掉单词开头 */
}
/* 自动口语流程：读完单词 → 倒计时跟读 → 自动评分 → 自动下一词，
   全程不依赖麦克风权限 / 语音识别（国内、微信内都稳定可用）。 */
function startAutoSpeak() {
  if (!SP) return;
  var myToken = SP.token;
  var n = 3;
  var tip = $('#spkTip');
  SP.autoIv = setInterval(function () {
    if (!SP || SP.token !== myToken) { if (SP) SP.autoIv = null; clearInterval(SP && SP.autoIv); return; }
    if (n > 0) { if (tip) tip.textContent = '跟我读… ' + n; n--; }
    else {
      clearInterval(SP.autoIv); SP.autoIv = null;
      if (!SP || SP.token !== myToken) return;
      autoSpeakScore(myToken);
    }
  }, 1000);
}
function autoSpeakScore(myToken) {
  if (!SP || SP.token !== myToken) return;
  var s = 84 + Math.floor(Math.random() * 12);            /* 84–95 鼓励分 */
  if (Math.random() < 0.18) s = 96 + Math.floor(Math.random() * 4); /* 偶尔 96–99 小惊喜 */
  showSpeakScore(s, '已跟读');
  SP.autoTo = setTimeout(function () { if (SP && SP.token === myToken) spNext(); }, 1800);
}
function setMic(on) { $('#micBtn').classList.toggle('is-rec', !!on); }

function recBySR(cb, ms) {
  var C = window.SpeechRecognition || window.webkitSpeechRecognition;
  var r = new C(), done = false, timer = null;
  function fin(heard, err) {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    try { r.onresult = r.onerror = r.onend = null; r.stop(); } catch (e) {}
    cb(heard || '', err || '');
  }
  r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 3;
  r.onresult = function (e) {
    var alts = e.results[0], best = '';
    for (var i = 0; i < alts.length; i++) { var s = alts[i].transcript || ''; if (s.length > best.length) best = s; }
    fin(best, '');
  };
  r.onerror = function (ev) { fin('', (ev && ev.error) || 'err'); };
  r.onend = function () { fin('', 'nospeech'); };
  try { r.start(); } catch (e) { return fin('', 'err'); }
  timer = setTimeout(function () { fin('', 'timeout'); }, ms || 5000);
  return fin;
}
/* 预热麦克风：进说话页就请求权限并把音频图（source→analyser→0增益sink→destination）
   跑热。这样孩子点 🎙️ 时 MediaRecorder 近乎瞬时启动，不再有冷启动延迟把单词开头吃掉。 */
function armMic() {
  if (MIC) return;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
  try {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }).then(function (stream) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} MIC = null; return; }
      var ac = new AC();
      if (ac.state === 'suspended' && ac.resume) { try { ac.resume(); } catch (e) {} }
      var an = null, buf = null;
      try {
        var src = ac.createMediaStreamSource(stream);
        an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.4;
        var sink = ac.createGain(); sink.gain.value = 0;
        src.connect(an); an.connect(sink); sink.connect(ac.destination);
        buf = new Float32Array(an.fftSize);
      } catch (e) { an = null; try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {} try { ac.close(); } catch (e3) {} MIC = null; return; }
      MIC = { stream: stream, ac: ac, an: an, buf: buf };
    })['catch'](function () { MIC = null; });
  } catch (e) { MIC = null; }
}
function disarmMic() {
  if (!MIC) return;
  try { MIC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  try { MIC.ac.close(); } catch (e) {}
  MIC = null;
}
function recByMic(opts) {
  /* 真实录音：用 MediaRecorder 录下「从开口到结束」的整段音频（完整单词）。
     关键修复「只录后半段」——根因是点 🎙️ 后麦克风冷启动（getUserMedia + AudioContext.resume
     + MediaRecorder.start 共约 0.5~1s），孩子先读了、录制才刚开始，于是开头被丢掉。
     解决：renderSP 里 armMic() 预热音频图；本函数优先复用已热的 MIC（录制瞬时启动），
     没有则回退到按需获取。配合 micRecord 的「准备」引导，把冷启动/编码器预热吸收进准备阶段，
     孩子读到时录制早已在跑 → 完整单词被录下。 */
  opts = opts || {};
  return new Promise(function (res) {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return res(null);

    function run(stream, ac, an, buf, owns) {
      var MR = window.MediaRecorder, mr = null, chunks = [], useMR = false, mime = '';
      try {
        if (MR && typeof MR.isTypeSupported === 'function') {
          ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'].some(function (m) {
            try { if (MR.isTypeSupported(m)) { mime = m; return true; } } catch (e) {}
            return false;
          });
          mr = mime ? new MR(stream, { mimeType: mime }) : new MR(stream);
          mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          useMR = true;
        }
      } catch (e) { useMR = false; }

      var peak = 0, sum = 0, frames = 0, speakFrames = 0, startedAt = Date.now(), TH = 0.012;
      function level() {
        if (!an) return 0;
        if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
        an.getFloatTimeDomainData(buf);
        var s = 0, p = 0, i, v;
        for (i = 0; i < buf.length; i++) { v = Math.abs(buf[i]); s += v * v; if (v > p) p = v; }
        var rms = Math.sqrt(s / buf.length);
        if (p > peak) peak = p; sum += rms; frames++;
        if (rms > TH) speakFrames++;
        if (opts.onLevel) opts.onLevel(rms, peak);
        return rms;
      }
      if (useMR) { try { mr.start(80); } catch (e) { try { mr.start(); } catch (e2) { useMR = false; } } }
      var levelIv = setInterval(level, 50);

      var maxMs = opts.maxMs || 8000;
      function stop() {
        if (stop.called) return; stop.called = true;
        if (levelIv) clearInterval(levelIv);
        var avg = frames ? sum / frames : 0;
        var cov = frames ? speakFrames / frames : 0;
        function finish(blob, a, pk, cv) {
          res({ url: blob ? URL.createObjectURL(blob) : null, blob: blob, avg: a, peak: pk, cov: cv, dur: Date.now() - startedAt, full: true });
        }
        if (useMR && mr && mr.state && mr.state !== 'inactive') {
          try {
            mr.onstop = function () {
              var blob = chunks.length ? new Blob(chunks, { type: mime || mr.mimeType || 'audio/webm' }) : null;
              finish(blob, avg, peak, cov);
            };
            mr.stop();
          } catch (e) { finish(null, avg, peak, cov); }
        } else {
          finish(null, avg, peak, cov);
        }
        /* 只有本次新开的流/图才关闭；复用的 MIC 留着给下一个单词继续即时录音 */
        if (owns) { setTimeout(function () { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} if (ac) { try { ac.close(); } catch (e) {} } }, 250); }
      }
      setTimeout(stop, maxMs);
      if (opts.onReady) opts.onReady(stop);
    }

    /* 优先复用已预热的音频图，录制瞬时启动；否则按需获取（回退路径） */
    var armed = (MIC && MIC.stream && MIC.stream.active && MIC.ac && MIC.an && MIC.buf) ? MIC : null;
    if (armed) {
      run(armed.stream, armed.ac, armed.an, armed.buf, false);
    } else {
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }).then(function (stream) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return res(null); }
        var ac = new AC();
        if (ac.state === 'suspended' && ac.resume) { try { ac.resume(); } catch (e) {} }
        var an = null, buf = null;
        try {
          var src = ac.createMediaStreamSource(stream);
          an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.4;
          var sink = ac.createGain(); sink.gain.value = 0;
          src.connect(an); an.connect(sink); sink.connect(ac.destination);
          buf = new Float32Array(an.fftSize);
        } catch (e) { an = null; }
        run(stream, ac, an, buf, true);
      })['catch'](function () { res(null); });
    }
  });
}
function micMeterEl() { return { box: $('#micMeter'), fill: $('#micMeterFill') }; }
function micMeterSet(rms) {
  var m = micMeterEl();
  if (!m.fill) return;
  m.fill.style.width = clamp(Math.round(rms / 0.18 * 100), 3, 100) + '%';
}
function micMeterOff() {
  var m = micMeterEl();
  if (m.fill) m.fill.style.width = '0%';
  if (m.box) m.box.classList.remove('is-on');
}
/* 真实录音：录下从开口到结束的整段单词（完整录音），结束自动回放，
   按「完整发音」打分（峰值响度 + 整段发音占比），不再只取某 1 秒。
   本函数统一接管录音 UI（红圈 + 实时音量条 + 提示），无论来源是 mic 还是 SR 降级。 */
function micRecord(token) {
  var done = false, recStop = null, leadIv = null;
  setMic(true);
  $('#spkTip').textContent = '🎤 准备…';
  var m = micMeterEl(); if (m.box) m.box.classList.add('is-on');
  function guard() {
    if (done) return;
    done = true;
    if (leadIv) clearTimeout(leadIv);
    if (SP) { SP.busy = false; SP.recStop = null; setMic(false); micMeterOff(); selfScore(); }
  }
  var g = setTimeout(guard, 9000);
  recByMic({
    maxMs: 8000,
    onLevel: micMeterSet,
    onReady: function (stopFn) {
      recStop = function () { if (done) return; clearTimeout(g); stopFn(); };
      if (SP) SP.recStop = recStop;
      /* 确认录制已 live：先给「准备」提示，把冷启动 / 编码器预热吸收进这段静音，
         再提示孩子开口 —— 此时录制早已在跑，完整单词不会被吃掉。 */
      leadIv = setTimeout(function () {
        if (done) return;
        $('#spkTip').textContent = '🔴 读完整单词！';
      }, 550);
    }
  }).then(function (r) {
    if (done) return; done = true; clearTimeout(g); if (leadIv) clearTimeout(leadIv); micMeterOff();
    if (!SP || SP.token !== token) return;
    SP.busy = false; SP.recStop = null; setMic(false);
    try { if (window.Voice) Voice.beep('stop'); } catch (e) {}
    if (!r) { $('#spkTip').textContent = '没拿到麦克风权限，用自评'; selfScore(); return; }
    /* 回放完整录音，让孩子听到自己读的整个单词 */
    if (r.url) { try { var au = new Audio(r.url); au.play().catch(function () {}); } catch (e) {} }
    showSpeakScore(scoreByFull(r), '完整录音 ' + (r.dur ? (Math.round(r.dur / 100) / 10) + 's' : ''));
  });
}
/* 完整录音打分：开口读完即 70 起；峰值越响、整段越连贯（完整度）越接近满分 */
function scoreByFull(r) {
  if (!r || !r.peak) return 55;
  if (r.peak < 0.01) return 35;                       // 几乎没声音 → 提醒大声读
  var loud = clamp(r.peak / 0.20, 0, 1);              // 完整单词最响处响度
  var cov = clamp(r.cov, 0, 1);                       // 整段里真正在发音的占比（完整度）
  var s = 70 + loud * 22 + cov * 8;
  if (r.peak > 0.15) s = Math.min(100, s + 4);
  return clamp(Math.round(s), 0, 100);
}
function recUI() {
  if (!SP) return;
  $('#spkScore').innerHTML =
    '<div class="ex-foot-btns ex-foot-btns--1" style="margin-top:var(--sp-4)">' +
    '<button class="btn btn--ghost" data-act="spk-self" data-s="70">读完了，直接打分</button></div>';
}
function doRec() {
  if (!SP) return;
  /* 用户主动点麦克风 = 想要真实录音打分，先取消自动流程 */
  if (SP.autoIv) { clearInterval(SP.autoIv); SP.autoIv = null; }
  if (SP.autoTo) { clearTimeout(SP.autoTo); SP.autoTo = null; }
  if (SP.recStop) { SP.recStop(); return; }    // 再点一次 = 结束录音
  if (SP.busy) return;
  SP.busy = true;
  var token = SP.token;
  if (RECMODE === 'sr') {
    setMic(true); $('#spkTip').textContent = '正在听……大声读出来'; recUI();
    var stopSR = recBySR(function (heard, err) {
      if (!SP || SP.token !== token) return;
      if (heard) {
        SP.busy = false; SP.recStop = null; setMic(false); micMeterOff();
        showSpeakScore(scoreOf(SP.list[SP.i][0], heard), heard);
        return;
      }
      /* 识别失败（国内、微信里 Web Speech 多数不可用）：降级到真实录音录完整单词 */
      setMic(false); micMeterOff();
      $('#spkTip').textContent = '识别没成功，改用麦克风录完整单词';
      try { if (window.Voice) Voice.beep('start'); } catch (e) {}
      micRecord(token);
    }, 5000);
    if (stopSR) SP.recStop = function () { stopSR('', 'stop'); };
  } else {
    try { if (window.Voice) Voice.beep('start'); } catch (e) {}
    micRecord(token);
  }
}
function selfScore() {
  if (!SP) return;
  $('#spkScore').innerHTML =
    '<div style="margin-top:var(--sp-4)"><div class="mic-tip" style="margin:0 0 10px">录音不可用，你觉得自己读得怎么样？</div>' +
    '<div class="ex-foot-btns">' +
      '<button class="btn btn--ghost" data-act="spk-self" data-s="55">还要练</button>' +
      '<button class="btn btn--sky" data-act="spk-self" data-s="85">读得不错</button>' +
    '</div></div>';
  $('#spkTip').textContent = '自评模式';
}
function showSpeakScore(s, heard) {
  if (!SP || !SP.list[SP.i]) return;
  s = clamp(Math.round(s), 0, 100);
  var w = SP.list[SP.i];
  SP.busy = false; SP.stopRec = null; setMic(false);
  SP.scores.push(s);
  var stars = s >= 90 ? 3 : (s >= 75 ? 2 : (s >= 60 ? 1 : 0));
  var gain = s >= 85 ? 5 : (s >= 60 ? 3 : 1);
  sfx(stars >= 2 ? 'ok' : (stars === 1 ? 'tap' : 'no'));
  SP.earned += gain;
    S.stat.speak++;
    if (s >= 85) S.stat.perfect++;
    addStars(gain, '跟读 ' + s + ' 分');
    mLearn(S.deck, w[0], 'exercise');
    bumpToday(1);
  save();
  $('#spkScore').innerHTML =
    '<div class="score-box" style="margin-top:var(--sp-4)">' +
      '<div class="score-box__n">' + s + '</div>' +
      '<div class="score-box__t">' + (s >= 90 ? '发音超棒！' : s >= 75 ? '读得很好' : s >= 60 ? '不错，再练练' : '再听一遍试试') + '</div>' +
      '<div class="stars">' + [0, 1, 2].map(function (i) {
        return '<svg class="' + (i < stars ? 'is-on' : '') + '"><use href="#i-star"/></svg>';
      }).join('') + '</div>' +
      '<div class="score-box__heard">' + esc(heard || '—') + '</div>' +
    '</div>';
  $('#spkTip').textContent = '得分 ' + s + ' · 获得 ' + gain + ' ⭐';
  speak(w[0]);
  var nx = $('#spkNext'); nx.disabled = false;
  nx.textContent = (SP.i + 1 >= SP.list.length) ? '看看成绩' : '下一个';
}
function spNext() {
  stopSpeak();
  SP.i++; SP.busy = false;
  if (SP.i >= SP.list.length) {
    disarmMic();   /* 口语练习结束，释放预热的麦克风 */
    var avg = Math.round(SP.scores.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, SP.scores.length));
    var bonus = avg >= 85 ? 20 : (avg >= 60 ? 10 : 0);
    if (bonus) { SP.earned += bonus; addStars(bonus, '口语平均 ' + avg + ' 分'); }
    showResult({ title: avg >= 85 ? '口语小明星！' : '口语练习完成',
      right: SP.scores.filter(function (s) { return s >= 60; }).length, total: SP.scores.length, gain: SP.earned,
      sub: [['平均分', avg], ['85+ 次数', SP.scores.filter(function (s) { return s >= 85; }).length], ['获得 ⭐', SP.earned]] });
  } else renderSP();
}

/* ---------------- 单词卡片（自动发音 + 自由翻转） ---------------- */
var STY = null;
function startStudy() {
  /* 卡片数量必须和「今日目标」设的单词数一致：目标 50 就发 50 张，
     只有词库本身没那么多单词时才按词库剩余量发。 */
  var n = clamp(S.goal, 5, Math.max(5, deck().w.length));
  var ws = newWords(n);
  if (!ws.length) { toast('当前词库没有单词', 'warn'); return; }
  STY = { list: ws, i: 0, counted: {} };
  $('#stTitle').textContent = '单词卡片 · ' + deck().n;
  openOv('#ovStudy');
  renderSTY();
}
function renderSTY() {
  var w = STY.list[STY.i]; CUR = w;
  var n = STY.list.length, cnt = Object.keys(STY.counted).length;
  $('#stIdx').textContent = (STY.i + 1) + '/' + n;
  $('#stProg').textContent = '已学 ' + cnt + ' / ' + n;
  $('#stBar').style.setProperty('--pct', Math.round(cnt / n * 100) + '%');
  $('#scCard').classList.remove('is-flipped');
  $('#scEmo').textContent = emoOf(w);
  $('#scWord').textContent = w[0];
  $('#scPh').textContent = w[2] || '';
  $('#scPh2').textContent = w[2] || '';
  $('#scCn').textContent = w[1];
  $('#scEg').textContent = w[0].charAt(0).toUpperCase() + w[0].slice(1) + ' — ' + w[1];
  $('#scAuto').style.display = '';
  $('#scFront').style.background = 'var(--c-yellow)';
  autoSpeak(w[0], 320);
}
function styCount() {
  if (!STY) return;
  var w = STY.list[STY.i];
  if (STY.counted[w[0]]) return;
  STY.counted[w[0]] = 1;
  mLearn(S.deck, w[0]);
  addStars(1, '学会 ' + w[0]);
  S.stat.learn++;
  bumpToday(1);
  commitNew(1);
  save();
}

/* ---------------- 练习引擎 ---------------- */
var Q = null;
var EXN = { spell: '拼写练习', vocab: '词汇练习', gram: '语法练习', phrase: '词组练习', match: '单词配对', exam: '真题演练', review: '抗遗忘复习', wrong: '错题复习' };
var BANKKEY = { gram: 'grammar', phrase: 'phrase', exam: 'exam' };
function bankFor(type) {
  var lv = deck().lv;
  var b = (window.QBANK && window.QBANK[BANKKEY[type] || type]) || [];
  var f = b.filter(function (q) { return (q[4] || 1) <= lv; });
  return f.length ? f : b;
}
function startEx(type) {
  if (type === 'whack') { startWhack(); return; }
  var n = Math.min(20, Math.max(8, S.goal));
  Q = { type: type, i: 0, right: 0, combo: 0, earned: 0, lock: false, list: [], total: 0 };
  if (type === 'spell' || type === 'vocab') {
    Q.list = newWords(n).map(function (w) { return { w: w }; });
  } else if (type === 'match') {
    S.matchLevel = clamp(S.matchLevel || 1, 1, MATCH_LV.length - 1);
    Q.list = [{ w: matchWords(S.matchLevel) }];
  } else {
    var bank = bankFor(type);
    Q.list = pick(bank, Math.min(n, bank.length)).map(function (q) { return { q: q }; });
  }
  if (!Q.list.length) { Q = null; toast('当前词库没有可用题目', 'warn'); return; }
  Q.total = (type === 'match') ? Q.list[0].w.length : Q.list.length;
  $('#exTitle').textContent = EXN[type] || '练习';
  $('#exCombo').style.display = 'none';
  openOv('#ovEx');
  renderEx();
}
function exFoot(html) { $('#exFoot').innerHTML = html; }
function renderEx() {
  if (!Q) return;
  if (Q.type === 'spell') return rSpell();
  if (Q.type === 'match') return rMatch();
  if (Q.type === 'vocab') return rVocab();
  if (Q.type === 'review' || Q.type === 'wrong') return rRecall();
  return rBank();
}
function optHtml(opts) {
  return opts.map(function (o, i) {
    return '<div class="opt" data-act="ex-opt" data-i="' + i + '"><span class="opt__k">' +
      'ABCD'[i] + '</span><span style="flex:1">' + esc(o) + '</span></div>';
  }).join('');
}

/* -- 拼写 -- */
function rSpell() {
  var it = Q.list[Q.i], w = it.w;
  Q.word = w;
  Q.slots = [];
  Q.letters = shuffle(w[0].split('').map(function (c, i) { return { c: c, id: i, used: false }; }));
  Q.lock = false; Q.hintN = 0;
  $('#exBody').innerHTML =
    '<div class="ex-ask">' +
      '<span class="ex-lbl">拼写练习 · ' + esc(w[2] || '') + '</span>' +
      '<div class="ex-main" style="font-size:54px">' + emoOf(w) + '</div>' +
      '<div class="ex-tip" style="font-size:16px;color:var(--c-ink);font-family:var(--f-display);font-weight:700">' + esc(w[1]) + '</div>' +
      '<div class="ex-tip">共 ' + w[0].length + ' 个字母，按顺序点字母填进去</div>' +
    '</div>' +
    '<div class="slots" id="slots"></div>' +
    '<div class="pool" id="pool"></div>';
  drawSpell();
  exFoot('<div class="ex-foot-btns"><button class="btn btn--ghost" data-act="ex-hint">提示一个字母</button>' +
         '<button class="btn btn--ghost" data-act="ex-clear">清空重填</button></div>');
}
function drawSpell() {
  $('#slots').innerHTML = Q.slots.map(function (s, i) {
    return '<div class="slot' + (s ? ' is-fill' : '') + (s && s.ok ? ' is-right' : '') +
      '" data-act="ex-slot" data-i="' + i + '">' + (s ? s.c : '') + '</div>';
  }).join('');
  $('#pool').innerHTML = Q.letters.map(function (l) {
    return '<div class="letter' + (l.used ? ' is-used' : '') + '" data-act="ex-letter" data-id="' + l.id + '">' + l.c + '</div>';
  }).join('');
}
function exLetter(id) {
  if (!Q || Q.lock) return;
  var l = Q.letters.filter(function (x) { return x.id === +id; })[0];
  if (!l || l.used) return;
  if (Q.slots.length >= Q.word[0].length) return;
  l.used = true; Q.slots.push({ c: l.c, id: l.id, ok: false });
  drawSpell();
  if (Q.slots.length === Q.word[0].length) setTimeout(checkSpell, 240);
}
function exSlot(i) {
  if (!Q || Q.lock) return;
  var s = Q.slots[i]; if (!s) return;
  var l = Q.letters.filter(function (x) { return x.id === s.id; })[0];
  if (l) l.used = false;
  Q.slots.splice(i, 1);
  drawSpell();
}
function checkSpell() {
  if (!Q || Q.lock) return;
  var w = Q.word, got = Q.slots.map(function (s) { return s.c; }).join('');
  Q.lock = true;
  S.stat.total++;
  var ok = got.toLowerCase() === w[0].toLowerCase();
  sfx(ok ? 'ok' : 'no');
  if (ok) {
    Q.slots.forEach(function (s) { s.ok = true; });
    drawSpell();
    Q.right++; Q.combo++; S.stat.right++; S.stat.spell++;
    Q.earned += 2; addStars(2, '拼写正确');
    mLearn(S.deck, w[0], 'exercise'); bumpToday(1);
    speak(w[0]);
  } else {
    Q.combo = 0;
    $$('#slots .slot').forEach(function (n) { n.classList.add('is-wrong'); });
    addWrong({ type: 'spell', q: w[1], a: w[0], opts: null, en: w[0], cn: w[1], ipa: w[2], tip: '正确拼写：' + w[0] });
    speak(w[0]);
  }
  $('#exCombo').style.display = Q.combo >= 2 ? '' : 'none';
  $('#exCombo').textContent = '连对 ' + Q.combo;
  $('#exBody').insertAdjacentHTML('beforeend',
    '<div class="ex-sent" style="margin-top:var(--sp-4);text-align:center;background:' +
      (ok ? 'var(--c-mint)' : 'var(--c-coral)') + '">' +
      (ok ? '✔ 拼对了！' : '✘ 正确拼写是 <b>' + esc(w[0]) + '</b>') +
      '<br><em>' + esc(w[1]) + ' ' + esc(w[2] || '') + '</em></div>');
  exFoot('<button class="btn btn--block btn--lg" data-act="ex-next">' +
    (Q.i + 1 >= Q.list.length ? '看看成绩' : '下一题') + '</button>');
}
function exHint() {
  if (!Q || Q.lock) return;
  var w = Q.word[0];
  for (var i = Q.hintN; i < w.length; i++) {
    var l = Q.letters.filter(function (x) { return !x.used && x.c === w[i]; })[0];
    if (l) {
      l.used = true; Q.slots.push({ c: l.c, id: l.id, ok: true }); Q.hintN = i + 1;
      drawSpell();
      if (Q.slots.length === w.length) setTimeout(checkSpell, 200);
      return;
    }
  }
}
function exClear() {
  if (!Q || Q.lock) return;
  Q.slots.forEach(function (s) {
    var l = Q.letters.filter(function (x) { return x.id === s.id; })[0];
    if (l) l.used = false;
  });
  Q.slots = []; drawSpell();
}

/* -- 词汇（英 → 中） -- */
function rVocab() {
  var it = Q.list[Q.i], w = it.w; CUR = w;
  Q.ans = w[1]; Q.lock = false;
  Q.opts = shuffle([w[1]].concat(distract(S.deck, w[0], 3).map(function (o) { return o[1]; })));
  $('#exBody').innerHTML =
    '<div class="ex-ask">' +
      '<span class="ex-lbl">词汇练习 · 选出中文意思</span>' +
      '<div class="ex-main ex-main--word">' + esc(w[0]) + '</div>' +
      '<div class="ex-ph">' + esc(w[2] || '') + '</div>' +
    '</div>' +
    '<div class="ex-foot-btns" style="margin-bottom:var(--sp-4)">' +
      '<button class="btn btn--ghost" data-act="ex-speak"><svg><use href="#i-speaker"/></svg> 听发音</button>' +
      '<button class="btn btn--lav" data-act="ex-speak" data-slow="1"><svg><use href="#i-volume"/></svg> 慢速</button>' +
    '</div>' +
    '<div class="opts" id="opts">' + optHtml(Q.opts) + '</div>';
  exFoot('');
  autoSpeak(w[0], 280);
}

/* -- 语法 / 词组 / 真题 -- */
function rBank() {
  var q = Q.list[Q.i].q;
  Q.ans = q[1][q[2]]; Q.opts = q[1].slice(); Q.lock = false;
  $('#exBody').innerHTML =
    '<div class="ex-ask"><span class="ex-lbl">' + (EXN[Q.type] || '练习') + '</span></div>' +
    '<div class="ex-sent">' + esc(q[0]) + '</div>' +
    '<div class="opts" id="opts">' + optHtml(Q.opts) + '</div>';
  exFoot('');
}

/* -- 单词配对 -- */
function rMatch() {
  var ws = Q.list[0].w, cards = [], lv = MATCH_LV[S.matchLevel] || MATCH_LV[1];
  ws.forEach(function (w, i) { cards.push({ p: i, t: w[0], s: 'en' }); cards.push({ p: i, t: w[1], s: 'cn' }); });
  Q.cards = shuffle(cards);
  Q.sel = null; Q.done = 0; Q.pairs = ws.length; Q.matchTry = 0;
  $('#exBody').innerHTML =
    '<div class="ex-ask"><span class="ex-lbl">单词配对 · <span class="match-lv" style="background:' + lv.color + '">' + lv.name + '</span></span>' +
      '<div class="ex-tip" style="margin-top:12px">' + lv.desc + ' · 共 ' + ws.length + ' 对</div></div>' +
    '<div class="match-grid" id="mGrid">' + Q.cards.map(function (c, i) {
      return '<div class="mcard" data-act="ex-match" data-i="' + i + '"><span class="mcard__in">' + esc(c.t) + '</span></div>';
    }).join('') + '</div>';
  exFoot('<div class="ex-foot-btns"><button class="btn btn--ghost" data-act="ex-skip">换一批</button>' +
         '<button class="btn btn--lav" data-act="ex-match-all">翻牌看答案</button></div>');
}
function exMatch(i) {
  if (!Q || Q.type !== 'match') return;
  var c = Q.cards[i], nodes = $$('#mGrid .mcard'), nd = nodes[i];
  if (!c || c.done || !nd) return;
  nd.classList.add('is-flip');
  if (c.s === 'en') speak(c.t);
  if (Q.sel === null) { sfx('pop'); Q.sel = i; nd.classList.add('is-sel'); return; }
  if (Q.sel === i) { nd.classList.remove('is-sel'); Q.sel = null; return; }
  var a = Q.cards[Q.sel];
  Q.matchTry++;
  if (a.p === c.p && a.s !== c.s) {
    a.done = true; c.done = true; Q.done++; Q.right++;
    sfx('ok');
    nodes[Q.sel].classList.remove('is-sel'); nodes[Q.sel].classList.add('is-done');
    nd.classList.add('is-done');
    Q.sel = null;
    if (Q.done >= Q.pairs) {
      S.stat.match++;
      var gain = Q.pairs * 2;
      Q.earned += gain;
      addStars(gain, '配对完成');
      bumpToday(Q.pairs);
      Q.list[0].w.forEach(function (w) { mLearn(S.deck, w[0], 'exercise'); });
      save();
      var sn = { right: Q.right, try: Q.matchTry, gain: Q.earned, pairs: Q.pairs };
      var tk = Q;
      var pct = sn.pairs ? (sn.right / sn.pairs) : 0;
      var oldLv = S.matchLevel;
      if (pct >= 0.8 && S.matchLevel < MATCH_LV.length - 1) {
        S.matchLevel++;
        save();
      } else if (pct < 0.45 && S.matchLevel > 1) {
        S.matchLevel--;
        save();
      }
      var newLv = MATCH_LV[S.matchLevel] || MATCH_LV[1];
      var upLv = S.matchLevel > oldLv;
      var downLv = S.matchLevel < oldLv;
      /* 完成的瞬间就在卡片上放彩带 + 欢呼音效，奖励感不延迟 */
      sfx('star');
      celebrate(pct, 0);
      setTimeout(function () {
        if (Q !== tk) return;
        var title = '配对完成！';
        var desc = sn.pairs + ' 对单词全部配好啦';
        var foot = null, sec = 0, next = null;
        if (upLv) {
          /* 答得好 → 自动接着打下一关（新段位），不用退出再点进来 */
          title = '升级到 ' + newLv.name + '！';
          desc = '太厉害了！马上进入 ' + newLv.name + ' 关卡';
          foot = '<button class="btn btn--block btn--lg" data-act="match-next">立刻挑战 ' + esc(newLv.name) +
                 ' 关卡（<span id="rsCd">5</span>）</button>' +
                 '<button class="btn btn--ghost btn--block" data-act="rs-back">先歇一会儿，回首页</button>';
          sec = 5;
          next = function () { startEx('match'); };
        } else if (downLv) {
          title = '回到 ' + newLv.name + '，继续加油！';
        }
        showResult({ title: title, desc: desc, right: sn.right, total: sn['try'], gain: sn.gain,
          sub: [['当前段位', newLv.name], ['配对数', sn.pairs], ['点击次数', sn['try']], ['获得 ⭐', sn.gain]],
          foot: foot, sec: sec, next: next, quiet: true });
      }, 620);
    }
  } else {
    var wrong = null;
    sfx('no');
    Q.cards.forEach(function (x) { if (x.p === c.p && x.s !== c.s) wrong = x; });
    var mate = Q.list[0].w[c.p];
    addWrong({ type: 'match', q: mate[0], a: mate[1], opts: null, en: mate[0], cn: mate[1], ipa: mate[2], tip: mate[0] + ' = ' + mate[1] });
    nodes[Q.sel].classList.remove('is-sel');
    var pIdx = Q.sel;
    setTimeout(function () {
      if (Q && Q.type === 'match' && document.body.contains(nodes[pIdx])) nodes[pIdx].classList.remove('is-flip');
      if (document.body.contains(nd)) nd.classList.remove('is-flip');
    }, 520);
    Q.sel = null;
  }
}
function exMatchAll() { $$('#mGrid .mcard').forEach(function (n) { n.classList.add('is-flip'); }); }

/* -- 复习 / 错题：中 → 英 -- */
function rRecall() {
  var it = Q.list[Q.i], raw = it.raw || null;
  Q.lock = false;

  /* 原题型复现：错的是选择题就按原题再问一遍 */
  if (raw && raw.opts && raw.opts.length >= 2) {
    Q.mode = 'orig';
    Q.ans = raw.a;
    Q.opts = shuffle(raw.opts.slice());
    var isSent = String(raw.q || '').length > 26;
    $('#exBody').innerHTML =
      '<div class="ex-ask"><span class="ex-lbl">' + (EXN[Q.type] || '复习') + ' · 原题重做</span></div>' +
      (isSent ? '<div class="ex-sent">' + esc(raw.q) + '</div>'
              : '<div class="ex-ask"><div class="ex-main ex-main--word">' + esc(raw.q) + '</div>' +
                (raw.ipa ? '<div class="ex-ph">' + esc(raw.ipa) + '</div>' : '') + '</div>') +
      '<div class="opts" id="opts">' + optHtml(Q.opts) + '</div>';
    exFoot('');
    if (raw.type === 'listen' && raw.en) autoSpeak(raw.en, 300);
    return;
  }

  /* 拼写 / 配对类没有选项：改成「看中文选英文」的回忆式复习 */
  var w = it.w || findWord(it.k, it.en) || [it.en || '—', it.cn || '', it.ipa || '', ''];
  CUR = w;
  Q.mode = 'recall';
  Q.ans = w[0];
  var opts = shuffle([w[0]].concat(distract(it.k || S.deck, w[0], 3).map(function (o) { return o[0]; })));
  if (opts.indexOf(Q.ans) < 0) opts[0] = Q.ans;
  Q.opts = opts;
  $('#exBody').innerHTML =
    '<div class="ex-ask">' +
      '<span class="ex-lbl">' + (EXN[Q.type] || '复习') + ' · 选出英文单词</span>' +
      '<div class="ex-main" style="font-size:52px">' + emoOf(w) + '</div>' +
      '<div class="ex-tip" style="font-size:17px;color:var(--c-ink);font-family:var(--f-display);font-weight:700">' + esc(w[1]) + '</div>' +
    '</div>' +
    '<div class="opts" id="opts">' + optHtml(opts) + '</div>';
  exFoot('');
}
function revAnswer(ok) {
  var it = Q.list[Q.i];
  sfx(ok ? 'ok' : 'no');
  S.stat.total++;
  if (ok) { Q.right++; Q.combo++; S.stat.right++; Q.earned += 1; dayAdd('review', 1); addStars(1, '复习正确'); }
  else Q.combo = 0;
  var w = it.w || findWord(it.k, it.en) || [it.en, it.cn, it.ipa, ''];
  if (Q.type === 'review') {
    mReview(it.k, it.en, ok);
  } else {
    S.stat.wrev++;
    var item = it.raw;
    if (item) {
      item.times = (item.times || 0) + 1;
      if (ok) { Q.earned += 2; addStars(2, '错题答对'); }
      if (item.times >= 3) {
        S.wrong = S.wrong.filter(function (x) { return x.id !== item.id; });
        toast('已复习 3 遍，自动移出错题库 🎉', 'ok');
      }
    }
  }
  bumpToday(1);
  save();
  if (Q.mode === 'orig') {
    var raw = it.raw || {};
    $('#exBody').insertAdjacentHTML('beforeend',
      '<div class="ex-sent" style="margin-top:var(--sp-4);text-align:center;background:' +
        (ok ? 'var(--c-mint)' : 'var(--c-coral)') + '">' + (ok ? '✔ 答对了！' : '✘ 正确答案：') +
        ' <b>' + esc(raw.a || '') + '</b>' +
        (raw.tip ? '<br><em>' + esc(raw.tip) + '</em>' : '') + '</div>');
    if (raw.type === 'listen' && raw.en) speak(raw.en);
  } else {
    speak(w[0]);
    $('#exBody').insertAdjacentHTML('beforeend',
      '<div class="ex-sent" style="margin-top:var(--sp-4);text-align:center;background:' +
        (ok ? 'var(--c-mint)' : 'var(--c-coral)') + '">' + (ok ? '✔ ' : '✘ ') +
        '<b>' + esc(w[0]) + '</b> ' + esc(w[2] || '') + ' — ' + esc(w[1]) +
        (it.tipTxt ? '<br><em>' + esc(it.tipTxt) + '</em>' : '') + '</div>');
  }
  exFoot('<button class="btn btn--block btn--lg" data-act="ex-next">' +
    (Q.i + 1 >= Q.list.length ? '看看成绩' : '下一题') + '</button>');
}
function exOpt(i) {
  if (!Q || Q.lock) return;
  Q.lock = true;
  var got = Q.opts[i], ok = got === Q.ans;
  var isExam = (Q.type === 'exam');
  sfx(ok ? (isExam ? 'star' : 'ok') : 'no');
  $$('#opts .opt').forEach(function (nd, j) {
    if (Q.opts[j] === Q.ans) nd.classList.add('is-right');
    else if (j === i) nd.classList.add('is-wrong');
  });
  if (Q.type === 'review' || Q.type === 'wrong') { revAnswer(ok); return; }
  S.stat.total++;
  if (ok) { Q.right++; Q.combo++; S.stat.right++; Q.earned += 2; addStars(2, '答对'); }
  else Q.combo = 0;
  /* 真题演练：每答对一题立刻放彩带 + 庆祝音效，连对 3 题以上更热闹 */
  if (ok && isExam) cheerRight(Q.combo >= 3);
  if (Q.type === 'vocab') {
    var w = Q.list[Q.i].w;
    if (ok) { S.stat.vocab++; mLearn(S.deck, w[0], 'exercise'); bumpToday(1); }
    else addWrong({ type: 'vocab', q: w[0], a: w[1], opts: Q.opts.slice(), en: w[0], cn: w[1], ipa: w[2], tip: w[0] + ' = ' + w[1] });
    speak(w[0]);
  } else {
    var q = Q.list[Q.i].q;
    if (ok) { S.stat[Q.type] = (S.stat[Q.type] || 0) + 1; bumpToday(1); }
    else addWrong({ type: Q.type, q: q[0], a: q[1][q[2]], opts: q[1].slice(), en: '', cn: '', ipa: '', tip: q[3] });
    $('#exBody').insertAdjacentHTML('beforeend',
      '<div class="ex-sent" style="margin-top:var(--sp-4);text-align:center">' + esc(q[3] || '') + '</div>');
  }
  $('#exCombo').style.display = Q.combo >= 2 ? '' : 'none';
  $('#exCombo').textContent = '连对 ' + Q.combo;
  exFoot('<button class="btn btn--block btn--lg" data-act="ex-next">' +
    (Q.i + 1 >= Q.list.length ? '看看成绩' : '下一题') + '</button>');
}
function exNext() {
  stopSpeak();
  Q.i++;
  if (Q.i >= Q.list.length) return finEx();
  renderEx();
}
function finEx() {
  var total = Q.type === 'match' ? Q.pairs : Q.list.length;
  var right = Q.right;
  var bonus = (total && right === total) ? 20 : (total && right / total >= 0.6 ? 10 : 0);
  if (bonus) { Q.earned += bonus; addStars(bonus, right === total ? '全部答对' : '正确率达标'); }
  var pct = total ? Math.round(right / total * 100) : 0;
  showResult({
    title: (total && right === total) ? '太棒了，全对！' : (pct >= 60 ? '完成得不错！' : '再来一轮会更好'),
    right: right, total: total, gain: Q.earned,
    sub: [['正确率', pct + '%'], ['错题库', S.wrong.length + ' 题'], ['获得 ⭐', Q.earned]]
  });
}

/* ---------------- 错题库 ---------------- */
function addWrong(o) {
  if (!o) return;
  var id = o.type + '|' + (o.en || '') + '|' + (o.a || '');
  if (S.wrong.some(function (x) { return x.id === id; })) return;
  S.wrong.push({
    id: id, type: o.type, deck: S.deck, en: o.en || '', cn: o.cn || '', ipa: o.ipa || '',
    q: o.q || '', a: o.a || '', opts: o.opts || null, tip: o.tip || '', times: 0, at: Date.now()
  });
  save();
  renderHome();
}
function renderWrong() {
  $('#wrongTop').textContent = S.wrong.length + ' 题';
  var box = $('#wrongBody');
  if (!S.wrong.length) {
    box.innerHTML = '<div class="empty"><div class="empty__ico">🎊</div><b>错题库是空的</b>' +
      '<p>练习里做错的题目会自动进到这里<br>每道题复习 3 遍后自动移出</p></div>';
    return;
  }
  var TN = { spell: '拼写', vocab: '词汇', gram: '语法', phrase: '词组', match: '配对', exam: '真题', listen: '听力' };
  box.innerHTML =
    '<div class="ex-tip" style="text-align:center;margin-bottom:var(--sp-4)">共 ' + S.wrong.length +
      ' 道题 · 每道题复习 3 遍后自动清除</div>' +
    S.wrong.map(function (w) {
      var dots = [0, 1, 2].map(function (i) {
        return '<i class="' + (i < (w.times || 0) ? 'is-on' : '') + '"></i>';
      }).join('');
      return '<div class="wrong-item"><div class="wrong-item__t"><b>' + esc(w.a || w.q) + '</b>' +
        '<span>' + (TN[w.type] || '练习') + ' · ' + esc(w.tip || w.cn || '') + '</span></div>' +
        '<div class="wrong-item__times">' + dots + '</div></div>';
    }).join('');
}
function startWrongDrill() {
  if (!S.wrong.length) { toast('错题库是空的', 'warn'); return; }
  var items = pick(S.wrong.slice(), Math.min(10, S.wrong.length));
  Q = {
    type: 'wrong', i: 0, right: 0, combo: 0, earned: 0, lock: false,
    list: items.map(function (r) {
      return { k: r.deck, en: r.en, cn: r.cn, ipa: r.ipa, raw: r, tipTxt: r.tip,
        w: findWord(r.deck, r.en) || [r.en, r.cn, r.ipa, ''] };
    }),
    total: items.length
  };
  $('#exTitle').textContent = '错题复习';
  $('#exCombo').style.display = 'none';
  openOv('#ovEx');
  renderEx();
}

/* ---------------- 抗遗忘复习 ---------------- */
function revItems(arr) {
  return arr.map(function (x) {
    return { k: x.k, en: x.w, cn: '', ipa: '', w: findWord(x.k, x.w) || [x.w, '—', '', ''] };
  });
}
function startReview(ahead) {
  var list = ahead ? planList().slice(0, 10) : dueList().slice(0, 10);
  if (!list.length) { showReviewPlan(); return; }
  Q = { type: 'review', i: 0, right: 0, combo: 0, earned: 0, lock: false, list: revItems(list), total: list.length };
  $('#exTitle').textContent = '抗遗忘复习';
  $('#exCombo').style.display = 'none';
  openOv('#ovEx');
  renderEx();
}
function showReviewPlan() {
  $('#exTitle').textContent = '抗遗忘复习';
  var nd = nextDueTime(), all = planList();
  var list = all.slice(0, 8).map(function (x) {
    return '<div class="wrong-item"><div class="wrong-item__t"><b>' + esc(x.w) + '</b>' +
      '<span>' + (DMAP[x.k] ? DMAP[x.k].n : x.k) + ' · 间隔 ' + GAP_TXT[clamp(x.s, 0, GAP_TXT.length - 1)] + '</span></div>' +
      '<div class="row__v">' + (x.due <= Date.now() ? '已到期' : fmtGap(x.due - Date.now()) + '后') + '</div></div>';
  }).join('');
  $('#exBody').innerHTML =
    '<div class="empty"><div class="empty__ico">⏳</div><b>暂时没有到期的单词</b>' +
    '<p>' + (isFinite(nd) ? ('下一个单词将在 <b>' + fmtGap(nd - Date.now()) + '</b> 后到期') : '先去学几个新单词吧') + '</p></div>' +
    (list ? '<div class="sec-head"><h2>复习计划表</h2><span>艾宾浩斯曲线</span></div>' + list : '') +
    '<div class="card card--sticker" style="margin-top:var(--sp-4)">' +
    '<b style="font-family:var(--f-display);font-size:14px">复习节奏</b>' +
    '<p style="margin-top:6px;font-size:12.5px;font-weight:700;color:var(--c-ink-70);line-height:1.7">' +
    GAP_TXT.join(' → ') + '<br>答对就升到下一级，答错退回第一级重新记。</p></div>';
  exFoot('<button class="btn btn--block btn--lg" data-act="review-ahead">' +
    (all.length ? '提前复习（会打乱节奏）' : '知道了') + '</button>');
  openOv('#ovEx');
}

/* ---------------- 结算 ---------------- */
/* 结算页的「自动进入下一关」倒计时 */
var RS_AUTO = null;
function stopAuto() {
  if (!RS_AUTO) return;
  try { clearInterval(RS_AUTO.tick); clearTimeout(RS_AUTO.fire); } catch (e) {}
  RS_AUTO = null;
}
function startAuto(sec, fn) {
  stopAuto();
  var left = sec;
  var cd = $('#rsCd');
  if (cd) cd.textContent = left;
  var o = {};
  o.tick = setInterval(function () {
    left--;
    var n = $('#rsCd');
    if (n) n.textContent = Math.max(0, left);
    /* 归零时只停掉秒表，别把 fire 定时器一起清掉（那正是触发进入下一关的那个） */
    if (left <= 0) { try { clearInterval(o.tick); o.tick = 0; } catch (e) {} }
  }, 1000);
  o.fire = setTimeout(function () { stopAuto(); fn(); }, sec * 1000);
  RS_AUTO = o;
}

function showResult(o) {
  var p = o.total ? clamp(o.right / o.total, 0, 1) : 0;
  $('#rsRing').style.setProperty('--p', p);
  $('#rsPct').textContent = Math.round(p * 100) + '%';
  $('#rsTitle').textContent = o.title || '完成啦！';
  $('#rsDesc').textContent = o.desc || (o.total ? (o.total + ' 题答对 ' + o.right + ' 题') : '已完成');
  $('#rsSub').innerHTML = (o.sub || []).map(function (s) {
    return '<div><b>' + esc(s[1]) + '</b><span>' + esc(s[0]) + '</span></div>';
  }).join('');
  $('#rsGain').textContent = '+' + (o.gain || 0);
  var b = newBadges.shift();
  if (b) {
    $('#rsNew').style.display = '';
    $('#rsNew').querySelector('.badge').className = 'badge badge--' + b.sh;
    $('#rsNewName').textContent = b.n + ' · ' + b.d;
  } else $('#rsNew').style.display = 'none';
  /* 底栏默认是「回到首页」；配对晋级时换成「继续挑战下一关 + 倒计时」 */
  var footBox = $('#ovResult .ov__foot');
  if (footBox) {
    footBox.innerHTML = o.foot ||
      '<button class="btn btn--block btn--lg" data-act="rs-back">回到首页</button>';
  }
  stopAuto();
  openOv('#ovResult');
  save();
  /* 完成庆祝：彩带 + 音效，强度随正确率变化，等结算页入场动画过半再放 */
  if (!o.quiet) celebrate(o.total ? p : 1);
  if (o.sec && typeof o.next === 'function') startAuto(o.sec, o.next);
}

/* 学习 / 听力 / 口语 / 练习 / 复习 共用的完成庆祝 */
function celebrate(p, delay) {
  if (!window.Celebrate) return;
  try {
    setTimeout(function () {
      Celebrate.run({ pct: p, sound: !!(S.cfg && S.cfg.sound) });
    }, (typeof delay === 'number' ? delay : 280));
  } catch (e) {}
}

/* 单题答对的即时庆祝：彩带 + 欢呼音效（连对越多越热闹） */
function cheerRight(big) {
  if (!window.Celebrate) return;
  try {
    Celebrate.burst({ count: big ? 62 : 28, rain: !big });
  } catch (e) {}
  if (big && S.cfg && S.cfg.sound) {
    setTimeout(function () { try { Celebrate.fanfare('pass'); } catch (e) {} }, 210);
  }
}

/* ---------------- 奖励页 ---------------- */
var RULES = [
  ['🃏', '学会 1 个新单词', '+1 ⭐'],
  ['👂', '听力练习答对 1 题', '+2 ⭐'],
  ['🎤', '跟读 60 分以上', '+3 ⭐'],
  ['🌟', '跟读 85 分以上', '+5 ⭐'],
  ['✍️', '练习答对 1 题', '+2 ⭐'],
  ['🧠', '抗遗忘复习 1 个单词', '+1 ⭐'],
  ['🎯', '单词配对完成 1 局', '每对 +2 ⭐'],
  ['🎉', '完成今日目标', '+50 ⭐'],
  ['💯', '一轮练习全部答对', '额外 +20 ⭐']
];
function renderReward() {
  $('#stStreak').textContent = S.streak || 1;
  $('#stWords').textContent = masterCount();
  $('#stToday').textContent = S.tds || 0;
  $('#bdgCount').textContent = BADGES.filter(function (b) { return S.badges[b.id]; }).length + ' / ' + BADGES.length;
  $('#rwTitle').textContent = S.stars + ' ⭐';
  var next = BADGES.filter(function (b) { return !S.badges[b.id]; })[0];
  $('#rwSub').textContent = next ? ('下一个徽章：' + next.n + '（' + next.d + '）') : '已集齐全部徽章，太厉害了！';
  $('#bdgGrid').innerHTML = BADGES.map(function (b) {
    return '<div class="bitem' + (S.badges[b.id] ? '' : ' is-lock') + '">' +
      '<div class="badge badge--' + b.sh + '"><svg><use href="#i-star" style="color:#1F2D3D"/></svg></div>' +
      '<b>' + b.n + '</b><span>' + b.d + '</span></div>';
  }).join('');
  $('#rewardRules').innerHTML = RULES.map(function (r) {
    return '<div class="row" style="cursor:default"><span class="row__ico" style="background:var(--c-cream);font-size:19px">' +
      r[0] + '</span><span class="row__t">' + r[1] + '</span><span class="row__v">' + r[2] + '</span></div>';
  }).join('');
  renderWish();
}

/* ---------------- 我的 ---------------- */
function renderProfile() {
  var pf = S.profile || DEF.profile;
  $('#pfAva').textContent = pf.avatar || DEF.profile.avatar;
  $('#pfName').textContent = pf.name || DEF.profile.name;
  $('#pfEditHint').textContent = pf.name || DEF.profile.name;
  $('#pfLv').textContent = Math.floor(S.stars / 100) + 1;
  $('#pfStars').textContent = S.stars;
  $('#pfMaster').textContent = masterCount();
  $('#pfWrong').textContent = S.wrong.length;
  $('#pfDue').textContent = dueList().length;
  $('#goalSet').textContent = S.goal + ' 个词';
  $('#pfDeck').textContent = deck().n;
  $('#rateVal').textContent = S.cfg.rate.toFixed(2) + 'x';
  $('#pfWrong2').textContent = S.wrong.length + ' 题';
  $('#pfReview').textContent = dueList().length + ' 个到期';
  $$('.sw').forEach(function (s) { s.classList.toggle('is-on', !!S.cfg[s.dataset.sw]); });
  renderCalendar();
}

/* ---------------- 编辑资料 ---------------- */
var AVATARS = ['🦁','🐯','🐻','🐼','🐨','🐸','🐙','🦄','🦊','🐰','🐹','🐷','🐶','🐱','🐭','🐵','🐤','🦉','🐧','🦖'];
function renderEditProfile() {
  var pf = S.profile || DEF.profile;
  $('#epAva').textContent = pf.avatar || DEF.profile.avatar;
  $('#epName').value = (pf.name || DEF.profile.name).toString();
  var cur = pf.avatar || DEF.profile.avatar;
  $('#epAvaGrid').innerHTML = AVATARS.map(function (e) {
    return '<button class="ep-emoji' + (e === cur ? ' is-on' : '') +
      '" data-act="ep-avatar" data-emoji="' + e + '">' + e + '</button>';
  }).join('');
}

/* ---------------- 家长中心 ---------------- */
var GATE = null;
function renderParent() {
  var g = $('#parentBody');
  if (!S.parentOk) {
    var a = 10 + rnd(30), b = 10 + rnd(30);
    GATE = a + b;
    g.innerHTML = '<div class="gate" id="gateBox"><div class="gate__ico">🔐</div><h3>家长中心</h3>' +
      '<p>请先完成一道小题目，确认是家长本人</p>' +
      '<div class="gate__q">' + a + ' + ' + b + ' = ?</div>' +
      '<input class="gate__in" id="gateIn" type="number" inputmode="numeric" placeholder="答案">' +
      '<button class="btn btn--block btn--lg" data-act="gate-ok">确认进入</button></div>';
    return;
  }
  var acc = S.stat.total ? Math.round(S.stat.right / S.stat.total * 100) : 0;
  function row(k, v) {
    return '<div class="row" style="cursor:default"><span class="row__t">' + k + '</span><span class="row__v">' + v + '</span></div>';
  }
  g.innerHTML =
    '<div class="pz-stat">' +
      '<div class="pz-box" style="background:var(--c-yellow)"><b>' + S.stars + '</b><span>累计星星</span></div>' +
      '<div class="pz-box" style="background:var(--c-mint)"><b>' + masterCount() + '</b><span>掌握单词</span></div>' +
      '<div class="pz-box" style="background:var(--c-sky)"><b>' + (S.streak || 1) + '</b><span>连续天数</span></div>' +
      '<div class="pz-box" style="background:var(--c-peach)"><b>' + acc + '%</b><span>总正确率</span></div>' +
    '</div>' +
    '<div class="sec-head"><h2>今日学习</h2></div><div class="list">' +
      row('今日目标', S.td + ' / ' + S.goal + ' 个词') +
      row('今日获得', (S.tds || 0) + ' ⭐') +
      row('当前词库', deck().n + '（' + deck().total + ' 词）') +
    '</div>' +
    '<div class="sec-head"><h2>累计练习</h2></div><div class="list">' +
      row('学会单词', S.stat.learn + ' 次') + row('听力答对', S.stat.listen + ' 次') +
      row('跟读次数', S.stat.speak + ' 次') + row('拼写答对', S.stat.spell + ' 次') +
      row('词汇答对', S.stat.vocab + ' 次') + row('语法答对', S.stat.gram + ' 次') +
      row('词组答对', S.stat.phrase + ' 次') + row('真题答对', S.stat.exam + ' 次') +
      row('配对完成', S.stat.match + ' 次') + row('错题复习', S.stat.wrev + ' 次') +
    '</div>' +
    '<div class="card card--sticker" style="margin-top:var(--sp-4)">' +
      '<b style="font-family:var(--f-display);font-size:14px">关于词库</b>' +
      '<p style="margin-top:6px;font-size:12.5px;font-weight:700;color:var(--c-ink-70);line-height:1.7">共 ' +
      DECKS.reduce(function (s, d) { return s + d.total; }, 0) +
      ' 个词条，按小学 / 初中 / 高中分级整理；音标来自 open-dict-data/ipa-dict 开源词典，中文释义为人工校对。<br>' +
      '所有学习数据只保存在本机浏览器，不会上传。</p></div>' +
    '<button class="btn btn--ghost btn--block" style="margin-top:var(--sp-4)" data-act="parent-back">退出家长中心</button>';
}

/* ---------------- 学习报告 ---------------- */
var TYPECN = { listen: '听力', speak: '口语', spell: '拼写', vocab: '词汇', gram: '语法', phrase: '词组', match: '配对', exam: '真题', review: '复习' };
function last7() {
  var a = [];
  for (var i = 6; i >= 0; i--) a.push(ymd(new Date(Date.now() - i * 864e5)));
  return a;
}
function barChart(days, getV, color) {
  var vals = days.map(getV), max = Math.max(1, Math.max.apply(null, vals));
  var W = 308, H = 124, base = 102, bw = 30, gap = (W - bw * 7) / 8;
  var svg = '<svg class="rep-chart" viewBox="0 0 ' + W + ' ' + H + '">';
  days.forEach(function (d, i) {
    var v = vals[i], h = v ? Math.round(v / max * 78) + 4 : 2;
    var x = gap + i * (bw + gap), y = base - h;
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="6" fill="' + color + '"></rect>';
    if (v) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" class="rep-chart__v">' + v + '</text>';
  });
  svg += '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" stroke="#ece4d2" stroke-width="2"/>';
  days.forEach(function (d, i) {
    var x = gap + i * (bw + gap) + bw / 2;
    var dd = new Date(d.replace(/-/g, '/'));
    var lab = (i === days.length - 1) ? '今' : '日一二三四五六'[dd.getDay()];
    svg += '<text x="' + x.toFixed(1) + '" y="' + (base + 14) + '" class="rep-chart__d">' + lab + '</text>';
  });
  return svg + '</svg>';
}
function renderReport() {
  var body = $('#repBody'); if (!body) return;
  var days = last7();
  var learn7 = days.reduce(function (s, d) { return s + ((S.hist[d] && S.hist[d].learn) || 0); }, 0);
  var rev7 = days.reduce(function (s, d) { return s + ((S.hist[d] && S.hist[d].review) || 0); }, 0);
  var acc = S.stat.total ? Math.round(S.stat.right / S.stat.total * 100) : 0;
  var mc = masterCount();
  function box(b, t, c) { return '<div class="pz-box" style="background:' + c + '"><b>' + b + '</b><span>' + t + '</span></div>'; }
  var stat =
    '<div class="pz-stat">' +
      box(S.stars, '累计星星', 'var(--c-yellow)') +
      box(mc, '掌握单词', 'var(--c-mint)') +
      box((S.streak || 1), '连续天数', 'var(--c-sky)') +
      box(acc + '%', '总正确率', 'var(--c-peach)') +
    '</div>';
  var chart =
    '<div class="rep-card"><div class="rep-card__h"><b>近 7 日学习量</b><span>' + learn7 + ' 个词 · 复习 ' + rev7 + ' 次</span></div>' +
      barChart(days, function (d) { return (S.hist[d] && S.hist[d].learn) || 0; }, '#4ECDC4') +
    '</div>';
  var libs = DECKS.map(function (d) {
    var got = S.learned[d.k] || 0, pct = d.total ? Math.round(got / d.total * 100) : 0;
    return '<div class="rep-lib"><span class="rep-lib__n">' + d.e + ' ' + d.n + '</span>' +
      '<div class="bar"><div class="bar__fill" style="--pct:' + pct + '%"></div></div>' +
      '<span class="rep-lib__v">' + got + '/' + d.total + '</span></div>';
  }).join('');
  var libCard =
    '<div class="rep-card"><div class="rep-card__h"><b>词库掌握进度</b><span>按当前词库累计</span></div>' + libs + '</div>';
  var wrong = S.wrong.slice(0, 5);
  var wrongCard = '<div class="rep-card"><div class="rep-card__h"><b>最近错题</b><span>' + S.wrong.length + ' 题待复习</span></div>' +
    (wrong.length ? wrong.map(function (w) {
      return '<div class="rep-w"><span class="rep-w__e">' + esc(w.en || w.a || '—') + '</span>' +
        '<span class="rep-w__c">' + esc(w.cn || '') + '</span>' +
        '<span class="chip chip--coral">' + (TYPECN[w.type] || '练习') + '</span></div>';
    }).join('') : '<div class="empty">还没有错题，继续保持 🎉</div>') + '</div>';
  body.innerHTML = stat + chart + libCard + wrongCard;
}

/* ---------------- 目标设置 ---------------- */
function openGoal() {
  var custom = [10, 20, 50].indexOf(S.goal) < 0;
  $$('.goal-opt').forEach(function (o) {
    o.classList.toggle('is-on', !!o.dataset.n && +o.dataset.n === S.goal);
  });
  $('#goalCustom').style.display = custom ? '' : 'none';
  $('#goalInput').value = custom ? S.goal : '';
  openSheet('#sheetGoal');
}
function setGoal(n) {
  n = clamp(Math.round(+n || 10), 1, 500);
  S.goal = n;
  save();
  closeSheet();
  renderHome(); renderProfile();
  toast('今日目标：' + n + ' 个单词');
}

/* ---------------- 分享打卡 · 愿望罐 ---------------- */
var selWishName = '', selWishTarget = 200;

function rankTitle(s) {
  if (s >= 1000) return '词汇小博士';
  if (s >= 600) return '词汇小能手';
  if (s >= 300) return '单词小达人';
  if (s >= 150) return '单词小将';
  if (s >= 50) return '单词小苗';
  return '英语小芽';
}
function roundRectPath(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}
/* 把学习战报画到 canvas，既用于预览也用于保存（微信里长按图片即可存） */
function drawShareCanvas() {
  var pf = S.profile || DEF.profile;
  var W = 1080, H = 1440;
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var x = c.getContext('2d');
  var g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#FFF3D6'); g.addColorStop(1, '#FFDFA6');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  /* 装饰星 */
  x.globalAlpha = .22; x.font = '60px serif'; x.textAlign = 'center';
  ['⭐', '✨', '🌟', '⭐', '✨'].forEach(function (e, i) {
    x.fillText(e, 150 + i * 200, 120 + (i % 2) * 40);
  });
  x.globalAlpha = 1;
  /* 卡片 */
  var m = 70, cw = W - m * 2, ch = 1080, cy = 130;
  roundRectPath(x, m, cy, cw, ch, 48);
  var cg = x.createLinearGradient(0, cy, 0, cy + ch);
  cg.addColorStop(0, '#FFFFFF'); cg.addColorStop(1, '#FFF7E6');
  x.fillStyle = cg; x.fill();
  x.lineWidth = 6; x.strokeStyle = '#1F2D3D'; x.stroke();
  /* 标题 */
  x.textAlign = 'center'; x.fillStyle = '#1F2D3D';
  x.font = "700 40px 'PingFang SC', system-ui, sans-serif";
  x.fillText('📚 Lingoland Kids · 学习战报', W / 2, cy + 74);
  /* 头像 */
  x.font = '180px serif';
  x.fillText(pf.avatar || '🦁', W / 2, cy + 280);
  /* 名字 */
  x.fillStyle = '#1F2D3D';
  x.font = "800 70px 'PingFang SC', system-ui, sans-serif";
  x.fillText((pf.name || '宝贝') + ' 的学习成果', W / 2, cy + 372);
  /* 四项数据 */
  var stats = [
    [String(S.stars), '累计星星'],
    [String(S.streak || 1), '连续天数'],
    [String(masterCount()), '掌握单词'],
    [String(S.tds || 0), '今日星星']
  ];
  var sw = cw / 4, sx0 = m;
  stats.forEach(function (s, i) {
    var cx = sx0 + sw * i + sw / 2;
    x.fillStyle = '#1F2D3D';
    x.font = "800 62px 'PingFang SC', system-ui, sans-serif";
    x.fillText(s[0], cx, cy + 520);
    x.fillStyle = '#8a7a5c';
    x.font = "600 26px 'PingFang SC', system-ui, sans-serif";
    x.fillText(s[1], cx, cy + 562);
  });
  x.strokeStyle = '#ECE4D2'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(m + 50, cy + 624); x.lineTo(m + cw - 50, cy + 624); x.stroke();
  /* 等级头衔 */
  x.fillStyle = '#1F2D3D';
  x.font = "800 56px 'PingFang SC', system-ui, sans-serif";
  x.fillText('Lv.' + (Math.floor(S.stars / 100) + 1) + ' · ' + rankTitle(S.stars), W / 2, cy + 720);
  /* 打卡 */
  var ci = checkinStreak();
  x.fillStyle = '#4ECDC4';
  x.font = "700 34px 'PingFang SC', system-ui, sans-serif";
  x.fillText(ci > 0 ? ('已连续打卡 ' + ci + ' 天 🔥') : '今天来打卡吧 ✅', W / 2, cy + 792);
  /* 页脚 */
  x.fillStyle = '#8a7a5c';
  x.font = "600 26px 'PingFang SC', system-ui, sans-serif";
  x.fillText('坚持每天一点点，进步看得见 · ' + ymd(new Date()), W / 2, cy + ch - 44);
  return c;
}
function shareText() {
  var pf = S.profile || DEF.profile;
  var name = pf.name || '宝贝';
  var ci = checkinStreak();
  return '🌟 ' + name + ' 的 Lingoland Kids 学习战报\n' +
    '⭐ 累计星星 ' + S.stars + ' · 🔥 连续 ' + (S.streak || 1) + ' 天\n' +
    '📚 掌握单词 ' + masterCount() + ' 个 · 今日 +' + (S.tds || 0) + ' ⭐\n' +
    (ci > 0 ? '✅ 已连续打卡 ' + ci + ' 天\n' : '') +
    '坚持每天学一点，进步看得见！💪';
}
function renderShare() {
  var c = drawShareCanvas();
  var prev = $('#sharePreview');
  if (prev) prev.innerHTML = '<img alt="学习战报" src="' + c.toDataURL('image/png') + '">';
  var btn = $('#checkinBtn');
  if (btn) {
    var done = (S.checkin && S.checkin.dates && S.checkin.dates.indexOf(ymd(new Date())) >= 0);
    btn.textContent = done ? '✅ 今日已打卡' : '✅ 今日打卡';
    btn.classList.toggle('is-done', !!done);
  }
  openOv('#ovShare');
}
function shareNow() {
  var text = shareText(), title = 'Lingoland Kids 学习战报';
  var fire = function (file) {
    if (navigator.share) {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: title, text: text }).catch(function () {}); return true;
      }
      if (!file) { navigator.share({ title: title, text: text }).catch(function () {}); return true; }
    }
    return false;
  };
  var c = drawShareCanvas();
  if (c.toBlob) {
    c.toBlob(function (blob) {
      var file = blob ? new File([blob], 'lingoland-学习战报.png', { type: 'image/png' }) : null;
      if (!fire(file)) toast('已生成海报，长按图片保存后发朋友圈', 'ok');
    }, 'image/png');
  } else if (!fire(null)) {
    toast('已生成海报，长按图片保存后发朋友圈', 'ok');
  }
}
function saveShareImg() {
  var url = drawShareCanvas().toDataURL('image/png');
  /* 离线容器禁用文件下载：改为在弹层内展示图片，引导长按保存 */
  var box = $('#shareImgBox');
  if (!box) {
    box = document.createElement('img');
    box.id = 'shareImgBox';
    box.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;max-height:70vh;z-index:9999;'
      + 'border-radius:12px;border:2px solid #4f7cff;background:#fff;object-fit:contain;';
    document.body.appendChild(box);
  }
  box.src = url;
  toast('长按图片即可保存到相册', 'ok');
}
function copyShareText() {
  var t = shareText();
  /* 离线容器禁用剪贴板 API：改为展示可选中文本，引导用户长按复制 */
  var box = $('#shareCopyBox');
  if (!box) {
    box = document.createElement('textarea');
    box.id = 'shareCopyBox';
    box.readOnly = true;
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;height:40vh;z-index:9999;'
      + 'padding:12px;border-radius:12px;border:2px solid #4f7cff;background:#fff;'
      + 'font-size:14px;line-height:1.5;color:#222;resize:none;';
    document.body.appendChild(box);
  }
  box.value = t;
  box.focus(); box.select();
  toast('长按上方文字即可复制', 'ok');
}
function doCheckin() {
  var today = ymd(new Date());
  S.checkin = S.checkin || { dates: [], last: '' };
  if (S.checkin.dates.indexOf(today) >= 0) { toast('今天已经打卡啦 🎉'); return; }
  S.checkin.dates.push(today); S.checkin.last = today; save();
  toast('打卡成功 ✅ 连续 ' + checkinStreak() + ' 天', 'ok');
  renderShare();
}
function renderWish() {
  var wrap = $('#wishWrap'); if (!wrap) return;
  if (!S.wish) {
    wrap.innerHTML = '<div class="card wish-mini" data-act="wish">' +
      '<div class="wish-mini__row">' +
      '<span class="wish-mini__ico">🌟</span>' +
      '<span class="wish-mini__t"><b>我的愿望罐</b><span>设一个小目标，让星星更有意义</span></span>' +
      '<svg class="chev"><use href="#i-chev"/></svg>' +
      '</div></div>';
    return;
  }
  var w = S.wish, pct = Math.min(100, Math.round(S.stars / w.target * 100));
  var reached = S.stars >= w.target, done = w.done;
  var sub = done ? '已兑换 🎉' : (reached ? '已达成，去兑现吧' : '还差 ' + (w.target - S.stars) + ' ⭐');
  wrap.innerHTML = '<div class="card wish-mini" data-act="' + (reached && !done ? 'wish-redeem' : 'wish') + '">' +
    '<div class="wish-mini__row">' +
    '<span class="wish-mini__ico">🌟</span>' +
    '<span class="wish-mini__t"><b>' + esc(w.name) + '</b><span>' + sub + '</span></span>' +
    '<span class="wish-mini__pct">' + pct + '%</span>' +
    '</div>' +
    '<div class="wish-mini__bar"><div class="wish-mini__fill" style="width:' + pct + '%"></div></div>' +
    '</div>';
}
/* ---------------- 连续打卡月历 ---------------- */
var PATCH_COST = 10, PATCH_DATE = '';
function checkinStreak() {
  var ds = (S.checkin && S.checkin.dates) || [];
  if (!ds.length) return 0;
  var set = {}; ds.forEach(function (k) { set[k] = 1; });
  var n = 0, d = new Date();
  if (!set[ymd(d)]) d = new Date(d.getTime() - 864e5);
  while (set[ymd(d)]) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
}
function isPastDate(s) {
  var parts = s.split('-').map(Number);
  var t = new Date(parts[0], parts[1] - 1, parts[2]);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  return t < today;
}
function renderCalendar() {
  var grid = $('#calGrid'), streakEl = $('#calStreak');
  if (!grid) return;
  var today = ymd(new Date());
  var dates = S.checkin.dates || [];
  var patched = S.checkin.patched || [];
  var now = new Date();
  var year = now.getFullYear(), month = now.getMonth();
  var first = new Date(year, month, 1);
  var last = new Date(year, month + 1, 0);
  var startDay = first.getDay();
  var daysInMonth = last.getDate();
  var cells = [];
  for (var i = 0; i < startDay; i++) cells.push('<div class="cal-cell cal-cell--empty"></div>');
  for (var d = 1; d <= daysInMonth; d++) {
    var date = ymd(new Date(year, month, d));
    var isToday = date === today;
    var checked = dates.indexOf(date) >= 0;
    var isPatched = patched.indexOf(date) >= 0;
    var isFuture = date > today;
    var isPastMissed = !isFuture && !checked && !isToday;
    var cls = 'cal-cell';
    if (isToday) cls += ' is-today';
    if (checked) cls += ' is-checked';
    else if (isPatched) cls += ' is-patched';
    else if (isPastMissed) cls += ' is-missed';
    else if (isFuture) cls += ' is-future';
    var act = isPastMissed ? ' data-act="cal-day" data-date="' + date + '"' : '';
    cells.push('<div class="' + cls + '"' + act + '><span class="cal-cell__d">' + d + '</span>' + (checked ? '<span class="cal-cell__dot">✓</span>' : '') + '</div>');
  }
  grid.innerHTML = cells.join('');
  if (streakEl) streakEl.textContent = '🔥 ' + checkinStreak() + ' 天';
}
function openPatch(date) {
  PATCH_DATE = date;
  var de = date.replace(/-/g, '/');
  var costEl = $('#patchCost'), dateEl = $('#patchDate');
  if (costEl) costEl.textContent = PATCH_COST;
  if (dateEl) dateEl.textContent = de;
  openSheet('#sheetPatch');
}
function doPatch() {
  if (!PATCH_DATE) { closeSheet(); return; }
  if ((S.checkin.dates || []).indexOf(PATCH_DATE) >= 0) { toast('这一天已经打卡啦', 'ok'); closeSheet(); return; }
  if (S.stars < PATCH_COST) { toast('⭐ 不足，还差 ' + (PATCH_COST - S.stars) + ' 颗', 'warn'); closeSheet(); return; }
  S.stars -= PATCH_COST;
  S.checkin.dates.push(PATCH_DATE);
  S.checkin.patched.push(PATCH_DATE);
  save();
  renderCalendar(); renderHome(); renderReward(); renderProfile();
  toast('补签成功 ✅ 连续 ' + checkinStreak() + ' 天', 'ok');
  closeSheet();
}

function openWish() {
  var presets = ['去一次动物园', '一本喜欢的绘本', '多玩 30 分钟', '一次小旅行', '一个玩具'];
  var chips = [100, 200, 300, 500, 800];
  selWishName = (S.wish && S.wish.name) || '';
  selWishTarget = (S.wish && S.wish.target) || 200;
  var pe = $('#wishPresets'); if (pe) pe.innerHTML = presets.map(function (p) {
    return '<button class="wish-preset' + (p === selWishName ? ' is-on' : '') + '" data-act="wish-pick" data-name="' + esc(p) + '">' + p + '</button>';
  }).join('');
  var inp = $('#wishName'); if (inp) inp.value = (selWishName && presets.indexOf(selWishName) < 0) ? selWishName : '';
  var isCustom = chips.indexOf(selWishTarget) < 0;
  var ce = $('#wishChips'); if (ce) ce.innerHTML = chips.map(function (n) {
    return '<button class="wish-chip' + (n === selWishTarget ? ' is-on' : '') + '" data-act="wish-target" data-n="' + n + '">' + n + '⭐</button>';
  }).join('') + '<button class="wish-chip' + (isCustom ? ' is-on' : '') + '" data-act="wish-custom">✏️ 自定义</button>';
  var cw = $('#wishCustom'); if (cw) cw.style.display = isCustom ? '' : 'none';
  var wi = $('#wishInput'); if (wi) wi.value = isCustom ? selWishTarget : '';
  openSheet('#sheetWish');
}
function setWish() {
  var name = (($('#wishName') || {}).value || '').trim().slice(0, 12) || selWishName || '一个小愿望';
  var cw = $('#wishCustom');
  if (cw && cw.style.display !== 'none') {
    var cv = parseInt((($('#wishInput') || {}).value || '').trim(), 10);
    if (cv >= 20) selWishTarget = clamp(cv, 20, 5000);
  }
  var target = clamp(selWishTarget || 200, 20, 5000);
  S.wish = { name: name, target: target, done: 0 };
  save(); closeSheet(); renderReward();
  toast('愿望已设置 🌟', 'ok');
}
function wishRedeem() {
  if (!S.wish) return;
  if (S.stars < S.wish.target) { toast('还差 ' + (S.wish.target - S.stars) + ' ⭐ 哦', 'warn'); return; }
  /* 兑现愿望要消耗对应星星，星星数同步减少，方便孩子之后重新学习攒星兑换 */
  S.stars -= S.wish.target;
  S.wish.done = 1; save();
  renderReward(); renderHome(); renderProfile();
  toast('愿望达成，已用 ' + S.wish.target + ' ⭐ 去兑现吧 🎉', 'ok');
}

/* ---------------- 激活码门禁 ---------------- */
function openActivate() {
  if (S.activated) return;
  var err = $('#actErr'); if (err) err.textContent = '';
  var inp = $('#actIn'); if (inp) inp.value = '';
  openOv('#ovActivate');
  if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 260);
}

/* ---------------- 动作 ---------------- */
var ACT = {
  /* 未激活时点击任意功能按钮都会先落到这里 */
  'act-ok': function () {
    var inp = $('#actIn');
    var v = (inp && inp.value || '').trim().toUpperCase().replace(/\s+/g, '');
    var err = $('#actErr');
    if (!v) { if (err) err.textContent = '请输入激活码'; return; }
    /* 前端初筛：码不在池中直接拦截 */
    if (ACT_CODES.indexOf(v) < 0) {
      if (err) err.textContent = '激活码不正确，请重试';
      if (inp) { inp.value = ''; try { inp.focus(); } catch (e) {} }
      return;
    }
    if (err) err.textContent = '正在校验…';
    var did = devId();
    /* 兜底：纯静态部署（无后端 /api/activate）时，用本机一码一绑 */
    function localFallback() {
      S.usedCodes = S.usedCodes || [];
      if (S.activated && S.activatedCode && S.activatedCode !== v) {
        if (err) err.textContent = '本机已用其他激活码激活';
        if (inp) { inp.value = ''; try { inp.focus(); } catch (e) {} }
        return;
      }
      S.activated = 1; S.activatedCode = v;
      if (S.usedCodes.indexOf(v) < 0) S.usedCodes.push(v);
      save(); closeOv();
      toast('已激活，开始学习吧 🎉', 'ok');
    }
    /* 离线小工具：无后端，直接走本机一码一绑校验 */
    localFallback();
  },
  'act-later': function () { closeOv(); },
  /* 家长重置（需在已激活后点「忘记激活码」才出现，便于二次使用） */
  'act-clear': function () { closeOv(); }, /* 激活码已取消，清除/重置逻辑不再需要 */

  /* 打地鼠：选关 / 开始 / 结算 / 地鼠点击 */
  'whack-quit': function () {
    if (WH_TICK) { clearInterval(WH_TICK); WH_TICK = null; }
    if (WH_RETRACT) { clearTimeout(WH_RETRACT); WH_RETRACT = null; }
    WH = null; closeOv();
  },
  'whack-go': function () { clickSfx('pop'); whackGo(); },
  'whack-again': function () { clickSfx('tap'); if (WH_LAST) whackBegin(WH_LAST.themeKey, WH_LAST.diffKey); },
  'whack-pick': function () { clickSfx('tap'); startWhack(); },
  'whack-theme': function (el) {
    var k = el.dataset.theme, d = DMAP[k];
    if (!d || !unlocked(d)) { toast('该主题需 ' + (d ? d.need : 0) + ' ⭐ 解锁', 'warn'); return; }
    WH_SEL.theme = k; renderWhChips();
  },
  'whack-diff': function (el) { WH_SEL.diff = el.dataset.diff; renderWhChips(); },
  'whack-hit': function (el) { whackHit(el); },

  'goal-set': function () { openGoal(); },
  'goal-pick': function (el) { setGoal(el.dataset.n); },
  'goal-custom-ui': function () {
    $('#goalCustom').style.display = '';
    var i = $('#goalInput'); i.value = ''; i.focus();
  },
  'goal-apply': function () { setGoal($('#goalInput').value); },
  'mask-close': function () { closeSheet(); },

  'deck-goto': function () { goTab('decks'); },
  'deck-use': function (el) {
    var d = DMAP[el.dataset.deck];
    if (!d) return;
    if (!unlocked(d)) { toast('还差 ' + (d.need - S.stars) + ' ⭐ 才能解锁', 'warn'); return; }
    S.deck = d.k; save();
    FC = null; CUR = null;
    renderDecks(); renderHome(); fcStart(S.deck);
    toast('已切换到「' + d.n + '」');
  },
  'flash-deck': function (el) {
    var d = DMAP[el.dataset.deck];
    if (!d) return;
    if (!unlocked(d)) { toast('还差 ' + (d.need - S.stars) + ' ⭐ 才能解锁', 'warn'); return; }
    S.deck = d.k; save();
    renderSwitch(); fcStart(d.k); renderHome();
    toast('已切换到「' + d.n + '」');
  },

  learn: function (el) {
    rollDay();
    var m = el.dataset.mode;
    if (m === 'listen') startListen();
    else if (m === 'speak') startSpeak();
    else startStudy();
  },
  'listen-quit': function () { closeOv(); LS = null; renderHome(); },
  'ls-replay': function () { if (LS) speak(LS.ans); },
  'ls-slow': function () { if (LS) speak(LS.ans, 0.6); },
  'ls-pick': function (el) { lsPick(+el.dataset.i); },

  'speak-quit': function () {
    if (SP) {
      SP.token = (SP.token || 0) + 1; SP.stopRec = null; SP.recStop = null; SP.busy = false;
      if (SP.autoIv) { clearInterval(SP.autoIv); SP.autoIv = null; }
      if (SP.autoTo) { clearTimeout(SP.autoTo); SP.autoTo = null; }
    }
    micMeterOff();
    disarmMic();
    SP = null; stopSpeak(); closeOv(); renderHome();
  },
  'spk-play': function () { if (SP) speak(SP.list[SP.i][0]); },
  'spk-slow': function () { if (SP) speak(SP.list[SP.i][0], 0.6); },
  'spk-rec': function () { doRec(); },
  'spk-self': function (el) { showSpeakScore(+el.dataset.s, '自评'); },
  'spk-next': function () { spNext(); },

  'study-quit': function () { closeOv(); STY = null; renderHome(); },
  'sc-flip': function () { $('#scCard').classList.toggle('is-flipped'); },
  'sc-prev': function () { if (STY) { STY.i = (STY.i - 1 + STY.list.length) % STY.list.length; renderSTY(); } },
  'sc-next': function () {
    if (!STY) return;
    styCount();
    if (STY.i + 1 >= STY.list.length) {
      var gain = Object.keys(STY.counted).length, n = STY.list.length;
      STY = null;
      showResult({ title: '这一轮学完啦！', right: gain, total: n, gain: gain,
        sub: [['学会单词', gain], ['今日进度', S.td + '/' + S.goal], ['获得 ⭐', gain]] });
      return;
    }
    STY.i++; renderSTY();
  },

  flip: function () { $('#fcCard').classList.toggle('is-flipped'); },
  'fc-prev': function () { if (FC) { FC.i = (FC.i - 1 + FC.list.length) % FC.list.length; renderFC(); } },
  'fc-next': function () {
    if (!FC) return;
    var w = FC.list[FC.i];
    FC.know++;
    var existed = !!S.master[mKey(FC.k, w[0])];
    mLearn(FC.k, w[0]);
    /* 闪卡里点「认识了」也要把进度加进词库「已学 X / total」里，
       但只在第一次认识时加，避免同一张卡复习时重复计数。 */
    if (!existed) {
      var d = DMAP[FC.k] || deck();
      S.learned[FC.k] = Math.min(d.total, (S.learned[FC.k] || 0) + 1);
    }
    addStars(1, '认识了 ' + w[0]);
    S.stat.learn++;
    bumpToday(1);
    save();
    FC.i++;
    if (FC.i >= FC.list.length) { toast('本轮完成，再来一轮！', 'ok'); FC.i = 0; }
    renderFC();
  },
  'fc-again': function () {
    if (!FC) return;
    FC.again++; FC.i++;
    if (FC.i >= FC.list.length) { toast('本轮完成，再来一轮！', 'ok'); FC.i = 0; }
    renderFC();
  },
  'fc-reset': function () { fcStart(S.deck); toast('本轮重新开始'); },
  'speak-now': function () { if (CUR) speak(CUR[0]); },

  practice: function (el) { rollDay(); startEx(el.dataset.type); },
  'ex-quit': function () { closeOv(); Q = null; renderHome(); renderProfile(); },
  'ex-next': function () { exNext(); },
  'ex-hint': function () { exHint(); },
  'ex-clear': function () { exClear(); },
  'ex-slot': function (el) { exSlot(+el.dataset.i); },
  'ex-letter': function (el) { exLetter(el.dataset.id); },
  'ex-opt': function (el) { exOpt(+el.dataset.i); },
  'ex-match': function (el) { exMatch(+el.dataset.i); },
  'ex-match-all': function () { exMatchAll(); },
  'ex-skip': function () { if (Q) startEx(Q.type); },
  'ex-speak': function (el) {
    if (!Q || !Q.list[Q.i] || !Q.list[Q.i].w) return;
    speak(Q.list[Q.i].w[0], el.dataset.slow ? 0.6 : null);
  },

  'wrong-open': function () { renderWrong(); openOv('#ovWrong'); },
  'wrong-quit': function () { closeOv(); renderHome(); renderProfile(); },
  'wrong-drill': function () { rollDay(); startWrongDrill(); },

  'report': function () { renderReport(); openOv('#ovReport'); },
  'report-close': function () { closeOv(); },

  review: function () { rollDay(); startReview(false); },
  'review-ahead': function () { startReview(true); },

  'edit-profile': function () { renderEditProfile(); openOv('#ovEditProfile'); },
  'ep-close': function () { closeOv(); },
  'ep-avatar': function (el) {
    var e = el.dataset.emoji;
    if (!e) return;
    S.profile = S.profile || clone(DEF.profile);
    S.profile.avatar = e;
    renderEditProfile(); save();
  },
  'ep-save': function () {
    var nm = ($('#epName') || {}).value || '';
    nm = nm.trim().slice(0, 8);
    if (!nm) nm = DEF.profile.name;
    S.profile = S.profile || clone(DEF.profile);
    S.profile.name = nm;
    save();
    renderProfile(); renderHome();
    closeOv();
    toast('资料已更新', 'ok');
  },

  'rs-back': function () {
    stopAuto();
    closeOv(); Q = null; LS = null; SP = null; STY = null;
    renderHome(); renderDecks(); renderSwitch(); renderReward(); renderProfile();
    goTab('home');
  },
  /* 配对晋级后：直接进入下一关（新段位） */
  'match-next': function () { stopAuto(); startEx('match'); },

  parent: function () { renderParent(); openOv('#ovParent'); },
  'parent-close': function () { closeOv(); },
  'parent-back': function () { S.parentOk = 0; save(); renderParent(); },
  'gate-ok': function () {
    var v = +($('#gateIn') || {}).value;
    if (v === GATE) { S.parentOk = 1; save(); renderParent(); }
    else {
      var b = $('#gateBox');
      if (b) { b.classList.add('is-bad'); setTimeout(function () { b.classList.remove('is-bad'); }, 420); }
      toast('答案不对，再算一次', 'warn');
    }
  },

  toggle: function (el) {
    var k = el.dataset.key;
    S.cfg[k] = S.cfg[k] ? 0 : 1;
    save();
    $$('.sw').forEach(function (s) { s.classList.toggle('is-on', !!S.cfg[s.dataset.sw]); });
    if (k === 'sound' && !S.cfg.sound) stopSpeak();
    toast((S.cfg[k] ? '已开启' : '已关闭') + (k === 'sound' ? '单词发音' : '学习提醒'));
  },
  'cycle-rate': function () {
    var list = [0.7, 0.85, 1], i = list.indexOf(S.cfg.rate);
    S.cfg.rate = list[(i + 1) % list.length];
    save(); renderProfile();
    toast('发音语速 ' + S.cfg.rate + 'x');
    speak('hello');
  },
  /* 发音自检：一键确认当前设备到底走的哪条发音通道，便于排查 */
  'voice-check': function () {
    var el = $('#vcVal');
    if (!el) return;
    if (!window.Voice) { el.textContent = '引擎未加载'; return; }
    el.textContent = '检测中…';
    var t0 = Date.now();
    var MAP = { webaudio: '真人发音', 'audio-same': '真人发音',
                'audio-direct': '真人发音(备用源)', speechSynthesis: '系统合成音', none: '发音失败' };
    try {
      Voice.unlock();
      Voice.speak('elephant', S.cfg.rate).then(function (ok) {
        var st = Voice.state(), ms = Date.now() - t0;
        var label = MAP[st.channel] || st.channel;
        el.textContent = ok ? (label + ' · ' + ms + 'ms') : label;
        if (ok) toast('发音正常：' + label + '（' + ms + 'ms）');
        else toast('发音失败，请检查网络后重试', 'warn');
      });
    } catch (e) { el.textContent = '异常'; }
  },
  reset: function () {
    if (!window.confirm('确定清空所有学习进度吗？')) return;
    S = clone(DEF); rollDay(); save();
    FC = null; CUR = null; Q = null; LS = null; SP = null; STY = null;
    newBadges = [];
    renderHome(); renderDecks(); renderSwitch(); renderReward(); renderProfile();
    fcStart(S.deck);
    toast('已清空学习进度');
  },

  /* ---- 分享打卡 ---- */
  'share': function () { renderShare(); },
  'share-close': function () { closeOv(); },
  'share-now': function () { shareNow(); },
  'share-copy': function () { copyShareText(); },
  'share-save': function () { saveShareImg(); },
  'checkin': function () { doCheckin(); },

  /* ---- 连续打卡月历 ---- */
  'cal-day': function (el) { openPatch(el.dataset.date); },
  'patch-ok': function () { doPatch(); },

  /* ---- 愿望罐 ---- */
  'wish': function () { openWish(); },
  'wish-close': function () { closeSheet(); },
  'wish-apply': function () { setWish(); },
  'wish-redeem': function () { wishRedeem(); },
  'wish-pick': function (el) {
    selWishName = el.dataset.name || '';
    $$('#wishPresets .wish-preset').forEach(function (b) { b.classList.toggle('is-on', b.dataset.name === selWishName); });
    var inp = $('#wishName'); if (inp) inp.value = '';
  },
  'wish-target': function (el) {
    selWishTarget = (+el.dataset.n) || 200;
    $$('#wishChips .wish-chip').forEach(function (b) { b.classList.toggle('is-on', (+b.dataset.n) === selWishTarget); });
  },
  'wish-custom': function () {
    var cw = $('#wishCustom'); if (cw) cw.style.display = '';
    var wi = $('#wishInput');
    if (wi) { wi.value = (selWishTarget >= 20 && [100, 200, 300, 500, 800].indexOf(selWishTarget) < 0) ? selWishTarget : ''; wi.focus(); }
    $$('#wishChips .wish-chip').forEach(function (b) {
      if (b.dataset.act === 'wish-custom') b.classList.add('is-on');
      else b.classList.remove('is-on');
    });
  },
  'wish-custom-apply': function () {
    var wi = $('#wishInput');
    var v = parseInt((wi && wi.value || '').trim(), 10);
    if (!v || v < 20) { toast('至少 20 ⭐ 哦', 'warn'); return; }
    v = clamp(v, 20, 5000);
    selWishTarget = v;
    $$('#wishChips .wish-chip').forEach(function (b) {
      if (b.dataset.act === 'wish-custom') b.classList.add('is-on');
      else b.classList.remove('is-on');
    });
    toast('目标 ' + v + ' ⭐', 'ok');
  }
};

/* ---------------- 事件 ---------------- */
document.addEventListener('click', function (e) {
  UON = true;
  try { if (window.Voice) Voice.unlock(); } catch (err) {}
  var t = e.target;
  if (!t || !t.closest) return;
  var tab = t.closest('[data-tab]');
  if (tab) { clickSfx('tab'); goTab(tab.dataset.tab); return; }
  var el = t.closest('[data-act]');
  if (!el) return;
  var act = el.dataset.act;
  /* 激活码门禁已取消：所有功能默认开放，点击任意按钮不再弹出激活码 */
  var fn = ACT[act];
  if (fn) {
    e.preventDefault();
    /* 答题类动作由业务函数按「答对/答错」发声，这里不叠按键声 */
    if (!SFX_SELF[act]) clickSfx(act);
    fn(el, e);
  }
}, false);
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  var t = e.target;
  if (t && t.id === 'goalInput') setGoal(t.value);
  if (t && t.id === 'gateIn') ACT['gate-ok']();
  if (t && t.id === 'actIn') ACT['act-ok']();
});
window.addEventListener('touchstart', function () {
  UON = true; pickVoice();
  try { if (window.Voice) Voice.unlock(); } catch (err) {}
}, { once: true, passive: true });

/* 真人发音失败时给出可见提示 —— 原实现是静默失败，用户完全不知道为什么没声音 */
(function () {
  if (!window.Voice) return;
  var lastTip = 0, failStreak = 0;
  Voice.on(function (kind) {
    if (kind !== 'fail') { failStreak = 0; return; }
    failStreak++;
    var now = Date.now();
    if (failStreak >= 2 && now - lastTip > 15000) {
      lastTip = now;
      toast('发音加载失败，请检查网络后重试', 'warn');
    }
  });
})();

/* ---------------- 启动 ---------------- */
(function boot() {
  rollDay();
  if (!unlocked(deck())) S.deck = 'primary';
  renderHome(); renderDecks(); renderSwitch(); renderReward(); renderProfile();
  fcStart(S.deck);
  goTab('home');
  /* 兜底：清掉可能在首次手势之前排队的待播词，确保打开链接时是安静的 */
  try { if (window.Voice) Voice.clearPending(); } catch (e) {}
  setTimeout(pickVoice, 400);
  setTimeout(pickVoice, 1500);
})();

})();
