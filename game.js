'use strict';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const q = s => document.querySelector(s);

const ui = {
  start: q('#start'), hero: q('#heroSelect'), weapon: q('#weaponSelect'), up: q('#levelUp'),
  pause: q('#pause'), over: q('#gameOver'), meta: q('#meta'), settings: q('#settings'),
  heroes: q('#heroes'), weapons: q('#weapons'), choices: q('#choices'),
  equipList: q('#equipList'), skillList: q('#skillList'), itemList: q('#itemList'), shopGold: q('#shopGold'),
  xp: q('#xp'), level: q('#level'), clock: q('#clock'), status: q('#status'), kills: q('#kills'), wave: q('#wave'),
  build: q('#build'), result: q('#result'), startMeta: q('#startMeta'),
  heroDust: q('#heroDust'), vol: q('#vol'),
  dashBtn: q('#dashBtn'), burstBtn: q('#burstBtn'), shieldBtn: q('#shieldBtn'), pauseBtn: q('#pauseBtn'),
  fullBtn: q('#fullBtn'), fullBtnTouch: q('#fullBtnTouch'),
  ach: q('#achievements'), achList: q('#achList'), achCount: q('#achCount'), toast: q('#toast'),
};

const keys = {};
let game = null, raf = 0, last = 0, audio = null;
let best = Number(localStorage.getItem('void-garden-best')) || 0;
let gold = Number(localStorage.getItem('void-garden-gold') || localStorage.getItem('void-garden-dust')) || 0;
let vol = Number(localStorage.getItem('void-garden-vol'));
if (!(vol >= 0 && vol <= 1)) vol = 0.5;
let musicOn = localStorage.getItem('void-garden-music') !== '0';
let musicTimer = null;
let shakeOn = localStorage.getItem('void-garden-shake') !== '0';
let lang = localStorage.getItem('void-garden-lang') || 'zh';
let unlocked = loadUnlocked();
let shopLv = loadShop();
let itemCounts = loadItems();
let ach = loadAch();
let lastHero = null, lastWeapon = null, lastDaily = false, isDaily = false, settingsReturn = 'home';
const DIFF = {
  easy:   { hp: 0.7, spd: 0.92, spawn: 1.2, bossHp: 0.8, bossGap: 75, ramp: 0.85, gold: 0.8, elite: 0 },
  normal: { hp: 1, spd: 1, spawn: 1, bossHp: 1, bossGap: 60, ramp: 1, gold: 1, elite: 0 },
  hard:   { hp: 1.5, spd: 1.08, spawn: .85, bossHp: 1.35, bossGap: 55, ramp: 1.2, gold: 1.3, elite: 0.12 },
  endless:{ hp: 1.2, spd: 1.15, spawn: .75, bossHp: 1.6, bossGap: 45, ramp: 1.5, gold: 1.5, elite: 0.2 },
};
let difficulty = localStorage.getItem('void-garden-difficulty') || 'normal';
if (!DIFF[difficulty]) difficulty = 'normal';
const DASH_CD = 2.2, DASH_TIME = .16, DASH_SPEED = 760, BURST_CD = 6, SHIELD_CD = 12, SHIELD_AMT = 40;

function loadUnlocked() {
  try {
    const a = JSON.parse(localStorage.getItem('void-garden-unlocked') || 'null');
    if (Array.isArray(a)) return [true, !!a[1], !!a[2]];
  } catch (e) {}
  return [true, false, false];
}
function loadShop() {
  const def = { hp: 0, dmg: 0, spd: 0, cd: 0, crit: 0, magnet: 0, dashCd: 0, dashTime: 0, burstDmg: 0, burstCd: 0 };
  try {
    const o = JSON.parse(localStorage.getItem('void-garden-meta') || 'null') || {};
    if (o.root || o.edge || o.pull) { def.hp = Number(o.root) || 0; def.dmg = Number(o.edge) || 0; def.magnet = Number(o.pull) || 0; }
    for (const k of Object.keys(def)) if (o[k]) def[k] = Number(o[k]) || 0;
  } catch (e) {}
  return def;
}
function loadItems() {
  try {
    const o = JSON.parse(localStorage.getItem('void-garden-items') || 'null') || {};
    return { revive: Number(o.revive) || 0, hpPotion: Number(o.hpPotion) || 0, xpMush: Number(o.xpMush) || 0 };
  } catch (e) { return { revive: 0, hpPotion: 0, xpMush: 0 }; }
}
function loadAch() {
  try {
    const o = JSON.parse(localStorage.getItem('void-garden-ach') || 'null');
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}
function save() {
  localStorage.setItem('void-garden-best', String(best));
  localStorage.setItem('void-garden-gold', String(gold));
  localStorage.setItem('void-garden-unlocked', JSON.stringify(unlocked));
  localStorage.setItem('void-garden-meta', JSON.stringify(shopLv));
  localStorage.setItem('void-garden-items', JSON.stringify(itemCounts));
}
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'p' && !e.repeat) pause();
  if ((e.code === 'Space' || k === ' ') && !e.repeat) { e.preventDefault(); dash(); }
  if (k === 'shift' && !e.repeat) dash();
  if ((k === 'e' || k === 'j') && !e.repeat) burst();
  if ((k === 'q' || k === 'k') && !e.repeat) shield();
  if (k === 'escape' && !e.repeat) {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    handleEsc();
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

const heroes = [
  ['星芽', '均衡 · 多重星弹', '开局 3 枚扇形星弹，适合快速清场。', '#dca6ff', p => { p.shots = 3; }],
  ['荆棘蔓', '爆发 · 穿透荆刺', '伤害与穿透更高，但施法略慢。', '#ff9abf', p => { p.damage = 32; p.pierce = 2; p.cd = .85; }],
  ['露珠', '生存 · 磁吸花露', '生命更高、吸收范围更大，并持续回复。', '#8dffe0', p => { p.max = 145; p.hp = 145; p.magnet = 160; p.regen = 1.2; }],
];
const unlockCost = { 1: 25, 2: 50 };

const weapons = [
  ['星辉法杖', '快速 · 星弹', '高速星弹会自动追踪最近敌人。', '#cda2ff', p => { p.weapon = 'star'; }],
  ['蔷薇短弓', '爆裂 · 花苞', '命中后产生小范围爆裂伤害。', '#ff8eb7', p => { p.weapon = 'rose'; p.splash = 42; p.cd *= 1.12; }],
  ['月刃轮', '穿透 · 回旋', '更大、更慢的月刃，擅长切开敌群。', '#fff0a5', p => { p.weapon = 'moon'; p.pierce += 2; p.damage *= 1.2; p.bulletSize = 9; p.bulletSpeed = .72; }],
  ['荆棘之鞭', '穿刺 · 藤鞭', '穿透高、尺寸大，攻速略慢。', '#7dffc9', p => { p.weapon = 'whip'; p.pierce += 3; p.damage *= 1.25; p.cd *= 1.25; p.bulletSize = 7; }],
  ['星尘漩涡', '连射 · 星尘', '弹道更多、攻速更快，单发稍弱。', '#c7a6ff', p => { p.weapon = 'vortex'; p.shots += 2; p.damage *= .8; p.cd *= .85; p.bulletSpeed *= 1.15; }],
];

const upgrades = [
  ['月光花', '施法间隔 -16%', p => p.cd = Math.max(.18, p.cd * .84)],
  ['荆棘蔓', '法术伤害 +42%', p => p.damage *= 1.42],
  ['流星种', '投射物 +1', p => p.shots++],
  ['碎星', '投射物穿透 +1', p => p.pierce++],
  ['疾风草', '移动速度 +14%', p => p.speed *= 1.14],
  ['丰收', '经验获得 +30%', p => p.xpGain *= 1.3],
  ['露珠', '最大生命 +24，并立刻治疗', p => { p.max += 24; p.hp = Math.min(p.max, p.hp + 24); }],
  ['藤蔓罗盘', '拾取范围 +45', p => p.magnet += 45],
  ['苔藓心', '每秒回复 +0.7', p => p.regen += .7],
  ['环月花', '获得 1 枚环绕月种', p => p.orbits++],
  ['春雷', '每 5 秒释放一次雷霆绽放', p => p.nova = 1],
  ['夜色花粉', '暴击率 +12%', p => p.crit += .12],
  ['肥沃土壤', '爆裂范围 +26', p => p.splash += 26],
  ['流光花瓣', '投射物速度 +18%', p => p.bulletSpeed *= 1.18],
  ['大朵花冠', '投射物尺寸 +2', p => p.bulletSize += 2],
  ['月蚀', '暴击伤害提高至 2.7 倍', p => p.critDamage = 2.7],
  ['荆棘共鸣', '伤害 +18% 且穿透 +1', p => { p.damage *= 1.18; p.pierce++; }],
  ['月光井', '施法间隔 -12% 且投射物 +1', p => { p.cd = Math.max(.18, p.cd * .88); p.shots++; }],
];

const equipDefs = [
  { id: 'hp', name: '生命护符', desc: '初始最大生命 +15', base: 15, apply: p => { p.max += 15; p.hp += 15; } },
  { id: 'dmg', name: '锋芒之刃', desc: '初始伤害 +8%', base: 20, apply: p => { p.damage *= 1.08; } },
  { id: 'spd', name: '疾风之靴', desc: '移动速度 +6%', base: 18, apply: p => { p.speed *= 1.06; } },
  { id: 'cd', name: '灵珠', desc: '施法间隔 -5%', base: 20, apply: p => { p.cd = Math.max(.18, p.cd * .95); } },
  { id: 'crit', name: '夜之镜', desc: '暴击率 +5%', base: 18, apply: p => { p.crit += .05; } },
  { id: 'magnet', name: '引力花露', desc: '拾取范围 +10%', base: 15, apply: p => { p.magnet *= 1.1; } },
];
const skillDefs = [
  { id: 'dashCd', name: '疾冲', desc: '冲刺冷却 -12%', base: 25, apply: p => { p.dashCdMul = (p.dashCdMul || 1) * .88; } },
  { id: 'dashTime', name: '影步', desc: '冲刺无敌时长 +15%', base: 25, apply: p => { p.dashTimeMul = (p.dashTimeMul || 1) * 1.15; } },
  { id: 'burstDmg', name: '怒放', desc: '绽放伤害 +15%', base: 25, apply: p => { p.burstMul = (p.burstMul || 1) * 1.15; } },
  { id: 'burstCd', name: '回响', desc: '绽放冷却 -10%', base: 25, apply: p => { p.burstCdMul = (p.burstCdMul || 1) * .9; } },
  { id: 'shieldCd', name: '回盾', desc: '护盾冷却 -10%', base: 25, apply: p => { p.shieldCdMul = (p.shieldCdMul || 1) * .9; } },
  { id: 'shieldAmt', name: '强盾', desc: '护盾强度 +15%', base: 25, apply: p => { p.shieldMul = (p.shieldMul || 1) * 1.15; } },
];
const itemDefs = [
  { id: 'revive', name: '复活花', desc: '下一局死亡时复活一次（半血）', base: 40 },
  { id: 'hpPotion', name: '生命泉水', desc: '下一局初始生命 +50', base: 25 },
  { id: 'xpMush', name: '经验菌', desc: '下一局经验获取 +30%', base: 30 },
];
const MAX_LEVEL = 12;
const shopCost = (def, lv) => Math.round(def.base * (1 + lv * 0.75));
function applyShop(p) {
  equipDefs.forEach(d => { for (let i = 0; i < (shopLv[d.id] || 0); i++) d.apply(p); });
  skillDefs.forEach(d => { for (let i = 0; i < (shopLv[d.id] || 0); i++) d.apply(p); });
}

const achievementDefs = [
  { id: 'evolve', name: '蜕变', desc: '首次让法器进化' },
  { id: 'boss', name: '园丁克星', desc: '首次击败虚空园丁' },
  { id: 'kill100', name: '百花守望', desc: '单局净化 100 个虚空生物' },
  { id: 'level10', name: '茂盛花圃', desc: '单局升到第 10 阶' },
  { id: 'survive60', name: '破土', desc: '存活 60 秒' },
  { id: 'survive300', name: '扎根', desc: '存活 5 分钟' },
  { id: 'survive600', name: '常青', desc: '存活 10 分钟' },
  { id: 'bless', name: '花之祝福', desc: '购买一次商城物品' },
  { id: 'heroes', name: '花灵齐聚', desc: '解锁全部花灵' },
];
function achCount() {
  let n = 0;
  achievementDefs.forEach(d => { if (ach[d.id]) n++; });
  return n;
}
function unlock(id) {
  if (ach[id]) return;
  const d = achievementDefs.find(x => x.id === id);
  ach[id] = true;
  gold += 25;
  localStorage.setItem('void-garden-ach', JSON.stringify(ach));
  save();
  if (d) toast(`成就解锁：${d.name} · +25 金币`);
}
let toastTimer = 0;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
}
let bossTimer = 0;
function bossWarn(name) {
  const el = q('#bossWarn');
  if (!el) return;
  el.textContent = name;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(bossTimer);
  bossTimer = setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 2000);
}

function fresh() {
  return {
    t: 0, cast: 0, novaClock: 5, nextBoss: DIFF[difficulty].bossGap, level: 1, xp: 0, need: 10,
    kills: 0, bosses: 0, bossCount: 0, pending: 0, paused: false, ended: false, evolved: false, evolved2: false,
    wave: 0, waveTimer: 3, waveRest: 3, waveLeft: 0, spawnGap: 0, maxEnemies: 18, revives: 0,
    dmg: [], shake: 0, hearts: [], waveRewarded: true,
    enemies: [], bullets: [], enemyBullets: [], stars: [], effects: [],
    bg: Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2 + 1, a: Math.random() })),
    p: { x: W / 2, y: H / 2, r: 12, hp: 100, max: 100, speed: 225, damage: 18, cd: .66, shots: 1, pierce: 0, magnet: 105, xpGain: 1, regen: 0, orbits: 0, nova: 0, crit: 0, splash: 0, bulletSize: 5, bulletSpeed: 1, dashCd: 0, dashT: 0, burstCd: 0, faceX: 0, faceY: 0, dashX: 0, dashY: 0, dashCdMul: 1, dashTimeMul: 1, burstMul: 1, burstCdMul: 1, shield: 0, shieldMax: 0, shieldCd: 0, shieldMul: 1, shieldCdMul: 1, invuln: 0, name: '', weapon: '' },
  };
}

function renderStartMeta() {
  ui.startMeta.textContent = `${t('gold')} ${gold} · ${t('best')} ${best}${t('seconds')} · ${t('achievements')} ${achCount()}/${achievementDefs.length}`;
}

function setDifficulty(d) {
  difficulty = d;
  localStorage.setItem('void-garden-difficulty', d);
  renderDiff();
  renderStartMeta();
}

function renderDiff() {
  ['easy', 'normal', 'hard', 'endless'].forEach(k => {
    const b = q('#diff' + k[0].toUpperCase() + k.slice(1));
    if (b) b.classList.toggle('active', difficulty === k);
  });
}

function dailyDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dailyBest() {
  try {
    const db = JSON.parse(localStorage.getItem('void-garden-daily') || '{}') || {};
    return Number(db[dailyDate()]) || 0;
  } catch (e) { return 0; }
}
function startDaily() {
  const day = new Date().getDate();
  const h = heroes[day % heroes.length];
  const w = weapons[(day + 1) % weapons.length];
  hide(ui.start);
  start(h, w, true);
}
function renderDaily() {
  const b = q('#dailyBtn');
  if (!b) return;
  const d = dailyBest();
  b.textContent = d > 0 ? `${t('daily')} · ${d}${t('seconds')}` : t('daily');
}

const T = {
  zh: {
    title: '让花园吞没虚空', subtitle: '选择一名花灵，在无尽暗潮中培育你的法术。',
    hint: '一局约 10 分钟 · 自动攻击', tip: 'WASD 移动 · 空格 冲刺 · E 绽放 · Q 护盾 · P 暂停 · Esc 返回', chooseHero: '选择花灵', daily: '每日挑战',
    achievements: '成就', shop: '商城', settings: '设置',
    diffEasy: '简单', diffNormal: '普通', diffHard: '困难', diffEndless: '无尽',
    chooseHeroTitle: '选择开局花灵', chooseWeaponTitle: '选择初始法器',
    levelUpTitle: '选择一株新芽', levelUpHint: '不同技能可以叠加、组合',
    equip: '装备', skills: '技能', items: '道具',
    volume: '音量', music: '音乐', reset: '重置全部进度', back: '返回',
    pauseTitle: '花园正在静候', resume: '继续', restart: '重玩', home: '返回主界面',
    pauseHint: '按 P 也可继续', gameOverTitle: '花园凋零', retry: '重玩本局', changeHero: '换花灵', backHome: '返回花园',
    goal: '目标：活过 10 分钟', status: '存活时间', best: '最佳', kills: '净化',
    wave: '第 {0} 波', prep: '备战中', gold: '金币', needGold: '还需 {0} 金币', achCount: '已解锁 {0} / {1}', seconds: '秒',
    musicOn: '音乐：开', musicOff: '音乐：关', shakeOn: '屏幕震动：开', shakeOff: '屏幕震动：关', rotateHint: '建议横屏游玩，体验更佳',
  },
  en: {
    title: 'Let the Garden Devour the Void', subtitle: 'Pick a bloom and grow your magic through the endless dark.',
    hint: '~10 min per run · auto-attack', tip: 'WASD move · Space dash · E burst · Q shield · P pause · Esc back', chooseHero: 'Choose Bloom', daily: 'Daily Run',
    achievements: 'Milestones', shop: 'Shop', settings: 'Settings',
    diffEasy: 'Easy', diffNormal: 'Normal', diffHard: 'Hard', diffEndless: 'Endless',
    chooseHeroTitle: 'Choose Your Bloom', chooseWeaponTitle: 'Choose Your Weapon',
    levelUpTitle: 'Choose a Sprout', levelUpHint: 'Skills can stack and combine',
    equip: 'Equipment', skills: 'Skills', items: 'Items',
    volume: 'Volume', music: 'Music', reset: 'Reset Progress', back: 'Back',
    pauseTitle: 'The Garden Waits', resume: 'Resume', restart: 'Restart', home: 'Main Menu',
    pauseHint: 'Press P to resume', gameOverTitle: 'The Garden Rests', retry: 'Retry', changeHero: 'Change Bloom', backHome: 'Home',
    goal: 'Goal: survive 10 min', status: 'Survival', best: 'Best', kills: 'Purified',
    wave: 'Wave {0}', prep: 'Get ready', gold: 'Gold', needGold: 'need {0} gold', achCount: 'Unlocked {0} / {1}', seconds: 's',
    musicOn: 'Music: On', musicOff: 'Music: Off', shakeOn: 'Screen Shake: On', shakeOff: 'Screen Shake: Off', rotateHint: 'Rotate to landscape for the best experience',
  },
};
function t(k, ...args) {
  let s = (T[lang] && T[lang][k]) || (T.zh[k] || k);
  args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
  return s;
}
function setLang(l) {
  lang = l;
  localStorage.setItem('void-garden-lang', l);
  applyLang();
}
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  const diffs = { easy: 'diffEasy', normal: 'diffNormal', hard: 'diffHard', endless: 'diffEndless' };
  Object.keys(diffs).forEach(k => { const b = q('#diff' + k[0].toUpperCase() + k.slice(1)); if (b) b.textContent = t(diffs[k]); });
  if (!game || game.ended) {
    q('#status').textContent = t('status');
    q('#build').textContent = t('chooseHero');
  }
  q('#kills').textContent = t('kills') + ' 0';
  q('#wave').textContent = t('prep');
  renderStartMeta(); renderShop(); renderAch(); renderDaily(); renderMusicBtn(); renderShakeBtn();
}

function heroesScreen() {
  hide(ui.start); hide(ui.weapon); hide(ui.up); hide(ui.pause); hide(ui.over); hide(ui.meta); hide(ui.settings); hide(ui.ach);
  show(ui.hero);
  ui.heroes.innerHTML = '';
  ui.heroDust.textContent = `${t('gold')} ${gold}`;
  heroes.forEach((h, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    if (unlocked[i]) {
      b.innerHTML = `<b style="color:${h[3]}">${h[0]}</b><span>${h[1]}<br>${h[2]}</span>`;
      b.onclick = () => weaponScreen(h);
    } else {
      b.classList.add('locked');
      b.innerHTML = `<b style="color:${h[3]}">${h[0]} 🔒</b><span>${h[1]}<br>${h[2]}<br><em>解锁需 ${unlockCost[i]} 金币</em></span>`;
      b.onclick = () => unlockHero(i);
    }
    ui.heroes.append(b);
  });
}

function unlockHero(i) {
  const cost = unlockCost[i];
  if (gold < cost) { ui.heroDust.textContent = `${t('gold')} ${gold} · ${t('needGold', cost - gold)}`; return; }
  gold -= cost; unlocked[i] = true; save();
  if (unlocked.every(Boolean)) unlock('heroes');
  heroesScreen();
}

function weaponScreen(hero) {
  hide(ui.hero); show(ui.weapon);
  ui.weapons.innerHTML = '';
  weapons.forEach(w => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<b style="color:${w[3]}">${w[0]}</b><span>${w[1]}<br>${w[2]}</span>`;
    b.onclick = () => start(hero, w);
    ui.weapons.append(b);
  });
}

function start(h, w, daily) {
  isDaily = !!daily;
  ensureAudio();
  startMusic();
  game = fresh();
  game.p.name = h[0];
  h[4](game.p); w[4](game.p); applyShop(game.p);
  if (itemCounts.hpPotion > 0) { itemCounts.hpPotion--; game.p.max += 50; game.p.hp += 50; }
  if (itemCounts.xpMush > 0) { itemCounts.xpMush--; game.p.xpGain *= 1.3; }
  game.revives = itemCounts.revive; itemCounts.revive = 0;
  save();
  lastHero = h; lastWeapon = w; lastDaily = isDaily;
  hide(ui.weapon); hide(ui.over); hide(ui.meta); hide(ui.settings); hide(ui.pause); hide(ui.ach); hide(ui.hero); hide(ui.up);
  if (matchMedia && matchMedia('(pointer:coarse)').matches) toggleFullscreen(true);
  hideMobileChrome();
  ui.build.textContent = `${h[0]} · ${w[0]}`;
  ui.status.textContent = `${t('status')} · ${t('best')} ${best}${t('seconds')}`;
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function spawn(type = 'normal') {
  const a = Math.random() * 7, d = 400;
  const x = W / 2 + Math.cos(a) * d, y = H / 2 + Math.sin(a) * d;
  let e = { x, y, r: 11, hp: 28 + game.t * .45, spd: 56 + game.t * .5, value: 1, color: '#7c62bb' };
  if (type === 'runner') e = { ...e, r: 8, hp: 16 + game.t * .25, spd: 116 + game.t * .7, color: '#78b9dc' };
  else if (type === 'brute') e = { ...e, r: 19, hp: 105 + game.t * 1.1, spd: 32 + game.t * .22, value: 4, color: '#d56cab' };
  else if (type === 'mini') e = { ...e, r: 7, hp: 12 + game.t * .2, spd: 132 + game.t * .6, color: '#b98cff' };
  else if (type === 'splitter') e = { ...e, r: 15, hp: 70 + game.t * .7, spd: 52 + game.t * .4, value: 3, color: '#b98cff', splitter: true };
  else if (type === 'shooter') e = { ...e, r: 12, hp: 42 + game.t * .5, spd: 24, value: 3, color: '#ff8f6b', shooter: true, shot: 2 };
  else if (type === 'warden') e = { ...e, r: 14, hp: 55 + game.t * .6, spd: 40 + game.t * .3, value: 4, color: '#7dffc9', warden: true, pulse: 3 };
  const diff = DIFF[difficulty];
  if (diff.elite && Math.random() < diff.elite) {
    e.elite = true;
    e.r = Math.min(e.r + 5, 26);
    e.hp *= 1.8;
    e.spd *= 1.15;
    e.value = Math.max(e.value, 3);
  }
  e.hp *= diff.hp * (1 + game.t / 600 * (diff.ramp - 1));
  e.max = e.hp;
  e.spd *= diff.spd;
  game.enemies.push(e);
}
function spawnBoss(bt) {
  const a = Math.random() * 7, d = 420;
  const x = W / 2 + Math.cos(a) * d, y = H / 2 + Math.sin(a) * d;
  let e;
  if (bt === 'queen') e = { x, y, r: 30, hp: 520 + game.t * 8, spd: 28, value: 30, color: '#9f6bff', boss: true, bossType: 'queen', name: '缠藤女王', shot: 2.2, alt: 5 };
  else if (bt === 'lord') e = { x, y, r: 38, hp: 620 + game.t * 9, spd: 26, value: 36, color: '#ffb25c', boss: true, bossType: 'lord', name: '星陨之主', shot: 1.6, alt: 3.2 };
  else e = { x, y, r: 34, hp: 440 + game.t * 7, spd: 30, value: 18, color: '#ef5f92', boss: true, bossType: 'gardener', name: '虚空园丁', shot: 1.4 };
  const diff = DIFF[difficulty];
  e.hp *= diff.bossHp * (1 + game.t / 600 * (diff.ramp - 1));
  e.windup = 0;
  e.max = e.hp;
  e.spd *= diff.spd;
  game.enemies.push(e);
}
function waveSize(n) {
  if (n < 3) return 5;
  if (n < 6) return 7;
  if (n < 9) return 9;
  return 10;
}
function spawnWaveEnemy(n) {
  const r = Math.random();
  let type = 'normal';
  if (n >= 8 && r < .08) type = 'warden';
  else if (n >= 7 && r < .22) type = 'shooter';
  else if (n >= 5 && r < .34) type = 'splitter';
  else if (n >= 4 && r < .48) type = 'brute';
  else if (n >= 3 && r < .72) type = 'runner';
  spawn(type);
}

function shoot() {
  const p = game.p;
  const t = [...game.enemies].sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (!t) return;
  tone(p.weapon === 'moon' ? 290 : 510, .025, .025);
  const base = Math.atan2(t.y - p.y, t.x - p.x);
  for (let i = 0; i < p.shots; i++) {
    const a = base + (i - (p.shots - 1) / 2) * .18;
    const s = 465 * p.bulletSpeed;
    game.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: p.weapon === 'moon' ? 1.55 : 1.18, pierce: p.pierce, damage: p.damage, crit: Math.random() < p.crit, size: p.bulletSize, splash: p.splash, hits: [] });
  }
}

function showChoice() {
  game.paused = true;
  show(ui.up);
  ui.choices.innerHTML = '';
  shuffle(upgrades).slice(0, 3).forEach(u => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<b>${u[0]}</b><span>${u[1]}</span>`;
    b.onclick = () => {
      try { u[2](game.p); } catch (e) {}
      game.pending--;
      ui.build.textContent = `${game.p.name} · 已培育 ${game.level - 1} 次`;
      if (game.pending > 0) {
        showChoice();
      } else {
        hide(ui.up);
        game.paused = false;
      }
    };
    ui.choices.append(b);
  });
}

function update(dt) {
  const g = game, p = g.p;
  pad();
  g.t += dt; g.waveTimer -= dt; g.cast -= dt; g.novaClock -= dt;
  p.hp = Math.min(p.max, p.hp + p.regen * dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.burstCd = Math.max(0, p.burstCd - dt);
  p.shieldCd = Math.max(0, p.shieldCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  g.shake = Math.max(0, g.shake - dt);
  g.dmg.forEach(d => { d.y -= 28 * dt; d.life -= dt; });
  g.dmg = g.dmg.filter(d => d.life > 0);
  if (g.t >= g.nextBoss) {
    const types = ['gardener', 'queen', 'lord'];
    const bt = types[g.bossCount % 3];
    const bname = { gardener: '虚空园丁', queen: '缠藤女王', lord: '星陨之主' }[bt];
    spawnBoss(bt);
    g.bossCount++;
    g.nextBoss += DIFF[difficulty].bossGap;
    g.enemies = g.enemies.filter(e => e.boss);
    g.enemyBullets.length = 0;
    g.waveLeft = 0;
    g.waveRewarded = false;
    ui.status.textContent = `${bname}降临！`; bossWarn(`${bname} 降临！`); tone(145, .25, .07);
  }
  if (g.waveLeft > 0) {
    g.spawnGap -= dt;
    if (g.spawnGap <= 0) {
      if (g.enemies.length >= g.maxEnemies) {
        g.spawnGap = 0.3;
      } else {
        spawnWaveEnemy(g.wave);
        g.waveLeft--;
        g.spawnGap = 0.16 * DIFF[difficulty].spawn;
        if (g.waveLeft <= 0) g.waveTimer = g.waveRest;
      }
    }
  } else if (g.enemies.length === 0) {
    g.waveTimer -= dt;
    if (g.waveTimer <= 0) {
      g.wave++;
      g.waveLeft = waveSize(g.wave);
      g.waveRewarded = false;
      g.spawnGap = 0;
      ui.status.textContent = `第 ${g.wave} 波虚空来袭`;
      tone(220, .12, .05);
    }
  }
  if (g.cast <= 0) { shoot(); g.cast = p.cd; }
  if (p.nova && g.novaClock <= 0) { nova(); g.novaClock = 5; }
  move(p, dt);
  g.enemies.forEach(e => enemy(e, p, g, dt));
  orbit(p, g, dt);
  bullets(g, dt);
  enemyShots(g, p, dt);
  collect(g, p, dt);
  if (p.hp <= 0) { if (g.revives > 0) revive(); else end(); }
  hud();
}

function move(p, dt) {
  const dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + (game.padX || 0) + (game.touchX || 0);
  const dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + (game.padY || 0) + (game.touchY || 0);
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    p.faceX = dx / n; p.faceY = dy / n;
  }
  if (p.dashT > 0) {
    p.x = clamp(p.x + p.dashX * DASH_SPEED * dt, 15, W - 15);
    p.y = clamp(p.y + p.dashY * DASH_SPEED * dt, 15, H - 15);
    p.dashT -= dt;
    return;
  }
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    p.x = clamp(p.x + dx / n * p.speed * dt, 15, W - 15);
    p.y = clamp(p.y + dy / n * p.speed * dt, 15, H - 15);
  }
}

function enemy(e, p, g, dt) {
  const a = Math.atan2(p.y - e.y, p.x - e.x), d = dist(p, e);
  e.x += Math.cos(a) * e.spd * dt; e.y += Math.sin(a) * e.spd * dt;
  if (d < e.r + p.r && p.dashT <= 0) hurt(p, (e.boss ? 28 : e.r > 15 ? 16 : 8) * dt);
  if (e.shooter && (e.shot -= dt) <= 0) {
    e.shot = 2.4;
    g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 4 });
  }
  if (e.warden && (e.pulse -= dt) <= 0) {
    e.pulse = 3.2;
    g.enemies.forEach(o => { if (o !== e && dist(e, o) < 120) o.hp = Math.min(o.max || o.hp, o.hp + 12); });
    g.effects.push({ x: e.x, y: e.y, life: .35, color: '#7dffc9', nova: true });
  }
  if (e.boss) {
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) fireBossVolley(e, a, g);
    } else {
      e.shot -= dt;
      if (e.shot <= 0) {
        e.windup = 0.45;
        e.shot = e.bossType === 'queen' ? 2.2 : e.bossType === 'lord' ? 1.6 : 1.55;
        tone(150, .06, .04);
      }
    }
    if (e.alt) {
      e.alt -= dt;
      if (e.alt <= 0) {
        if (e.bossType === 'queen') { e.alt = 5; for (let i = -1; i <= 1; i++) { const z = a + i * .32; g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(z) * 190, vy: Math.sin(z) * 190, life: 3.5 }); } }
        else if (e.bossType === 'lord') { e.alt = 3.2; for (let i = 0; i < 5; i++) { const ang = Math.random() * 7; g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 140, vy: Math.sin(ang) * 140, life: 3.5 }); } }
      }
    }
  }
}

function fireBossVolley(e, a, g) {
  if (e.bossType === 'queen') {
    for (let i = 0; i < 6; i++) { const z = i * Math.PI / 3; g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(z) * 150, vy: Math.sin(z) * 150, life: 4 }); }
  } else if (e.bossType === 'lord') {
    for (let i = -2; i <= 2; i++) { const z = a + i * .22; g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(z) * 210, vy: Math.sin(z) * 210, life: 3 }); }
  } else {
    for (let i = -1; i <= 1; i++) { const z = a + i * .28; g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(z) * 185, vy: Math.sin(z) * 185, life: 3 }); }
  }
  tone(160, .08, .04);
}

function enemyShots(g, p, dt) {
  g.enemyBullets.forEach(b => {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (!b.hit && p.dashT <= 0 && dist(b, p) < p.r + 7) { b.hit = true; hurt(p, 13); g.effects.push({ x: p.x, y: p.y, life: .2, color: '#ff779e' }); shake(.1); }
  });
  g.enemyBullets = g.enemyBullets.filter(b => b.life > 0 && !b.hit);
}

function orbit(p, g, dt) {
  for (let o = 0; o < p.orbits; o++) {
    const a = g.t * 2.3 + o * 7 / p.orbits;
    const z = { x: p.x + Math.cos(a) * 48, y: p.y + Math.sin(a) * 48 };
    g.enemies.forEach(e => { if (dist(z, e) < e.r + 7) e.hp -= 18 * dt; });
  }
}

function bullets(g, dt) {
  g.bullets.forEach(b => {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    g.enemies.forEach(e => {
      if (!b.hits.includes(e) && dist(b, e) < e.r + b.size) {
        b.hits.push(e);
        const hit = b.damage * (b.crit ? (g.p.critDamage || 2) : 1);
        e.hp -= hit;
        g.dmg.push({ x: e.x, y: e.y - e.r - 2, v: Math.round(hit), crit: b.crit, life: .6 });
        if (g.dmg.length > 80) g.dmg.shift();
        if (b.splash) {
          g.enemies.forEach(other => { if (other !== e && dist(e, other) < b.splash) other.hp -= hit * .45; });
          g.effects.push({ x: e.x, y: e.y, life: .3, color: '#ff96c4', nova: true });
          shake(.08);
        }
        g.effects.push({ x: e.x, y: e.y, life: .18, color: b.crit ? '#fff2a8' : '#f4caff' });
        b.pierce--;
      }
    });
  });
  g.bullets = g.bullets.filter(b => b.life > 0 && b.pierce >= 0);
  const spawns = [];
  g.enemies = g.enemies.filter(e => {
    if (e.hp > 0) return true;
    g.kills++;
    g.stars.push({ x: e.x, y: e.y, value: e.value });
    if (e.splitter) {
      for (let i = 0; i < 2; i++) {
        const m = Math.random() * 7;
        spawns.push({ x: e.x + Math.cos(m) * 10, y: e.y + Math.sin(m) * 10, r: 7, hp: 12 + g.t * .2, max: 12 + g.t * .2, spd: 132 + g.t * .6, value: 1, color: '#b98cff' });
      }
    }
    if (e.boss) { g.bosses++; g.p.hp = Math.min(g.p.max, g.p.hp + 35); ui.status.textContent = `${e.name || '虚空园丁'}已被净化`; unlock('boss'); shake(.4); }
    return false;
  });
  spawns.forEach(e => g.enemies.push(e));
  if (g.enemies.length === 0 && g.waveLeft === 0 && !g.waveRewarded && g.kills > 0) {
    g.waveRewarded = true;
    dropHeart();
  }
}

function collect(g, p, dt) {
  g.stars = g.stars.filter(s => {
    const d = dist(p, s);
    if (d < 18) {
      g.xp += s.value * p.xpGain;
      while (g.xp >= g.need) {
        g.xp -= g.need;
        g.level++;
        g.need = Math.ceil(g.need * 1.3);
        if (!g.evolved && g.level >= 6) evolve(g);
        if (!g.evolved2 && g.level >= 12) evolve2(g);
        g.pending++;
      }
      return false;
    }
    if (d < p.magnet) { s.x += (p.x - s.x) * dt * 5; s.y += (p.y - s.y) * dt * 5; }
    return true;
  });
  g.hearts = g.hearts.filter(h => {
    const d = dist(p, h);
    if (d < 22) {
      p.hp = Math.min(p.max, p.hp + 30);
      g.effects.push({ x: h.x, y: h.y, life: .4, color: '#ff7d9f', nova: true });
      g.dmg.push({ x: h.x, y: h.y, v: '+30', color: '#7dffc9', life: .8 });
      tone(520, .12, .06);
      return false;
    }
    if (d < p.magnet) { h.x += (p.x - h.x) * dt * 5; h.y += (p.y - h.y) * dt * 5; }
    return true;
  });
  g.effects = g.effects.filter(e => (e.life -= dt) > 0);
  if (g.pending > 0 && !g.paused && ui.up.classList.contains('hidden')) showChoice();
}

function evolve(g) {
  g.evolved = true;
  unlock('evolve');
  const p = g.p;
  let name = '';
  if (p.weapon === 'star') { p.shots += 2; p.cd *= .85; name = '星辉法杖 → 星群权杖'; }
  else if (p.weapon === 'rose') { p.splash += 40; p.pierce += 1; name = '蔷薇短弓 → 绽放花冠'; }
  else { p.orbits += 2; p.damage *= 1.35; name = '月刃轮 → 满月圣环'; }
  g.effects.push({ x: p.x, y: p.y, life: .8, color: '#fff0a5', nova: true });
  ui.status.textContent = `法器进化：${name}`;
  ui.build.textContent = `${p.name} · ${name}`;
  shake(.2);
  tone(720, .3, .08);
}

function evolve2(g) {
  g.evolved2 = true;
  const p = g.p;
  let name = '';
  if (p.weapon === 'star') { p.shots += 2; p.damage *= 1.2; name = '星群权杖 → 银河之心'; }
  else if (p.weapon === 'rose') { p.splash += 50; p.damage *= 1.25; name = '绽放花冠 → 永恒花园'; }
  else if (p.weapon === 'moon') { p.orbits += 2; p.damage *= 1.3; name = '满月圣环 → 星轨满月'; }
  else if (p.weapon === 'whip') { p.pierce += 2; p.damage *= 1.3; name = '荆棘之鞭 → 荆棘王冠'; }
  else { p.shots += 2; p.bulletSize += 2; name = '星尘漩涡 → 黑洞漩涡'; }
  g.effects.push({ x: p.x, y: p.y, life: .9, color: '#ffffff', nova: true });
  ui.status.textContent = `二段进化：${name}`;
  ui.build.textContent = `${p.name} · ${name}`;
  shake(.3);
  tone(900, .35, .09);
}

function nova() {
  const p = game.p;
  game.effects.push({ x: p.x, y: p.y, life: .42, color: '#d9b7ff', nova: true });
  game.enemies.forEach(e => { const d = dist(p, e); if (d < 150) e.hp -= Math.max(12, p.damage * .9) * (1 - d / 190); });
  shake(.12);
}

function dash() {
  if (!game || game.ended || game.paused) return;
  const p = game.p;
  if (p.dashCd > 0) return;
  let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + (game.padX || 0) + (game.touchX || 0);
  let dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + (game.padY || 0) + (game.touchY || 0);
  if (!dx && !dy) { dx = p.faceX; dy = p.faceY; }
  const n = Math.hypot(dx, dy);
  if (!n) { dx = 0; dy = -1; } else { dx /= n; dy /= n; }
  p.dashX = dx; p.dashY = dy;
  p.dashT = DASH_TIME * (p.dashTimeMul || 1); p.dashCd = DASH_CD * (p.dashCdMul || 1);
  game.effects.push({ x: p.x, y: p.y, life: .2, color: '#9ff0ff' });
  tone(360, .08, .05);
}

function burst() {
  if (!game || game.ended || game.paused) return;
  const p = game.p;
  if (p.burstCd > 0) return;
  p.burstCd = BURST_CD * (p.burstCdMul || 1);
  const mult = p.burstMul || 1;
  game.effects.push({ x: p.x, y: p.y, life: .5, color: '#9ff0ff', nova: true });
  game.enemies.forEach(e => { const d = dist(p, e); if (d < 180) e.hp -= Math.max(28, p.damage * 2.2) * mult * (1 - d / 210); });
  game.enemyBullets.length = 0;
  shake(.25);
  tone(520, .2, .06);
}

function shield() {
  if (!game || game.ended || game.paused) return;
  const p = game.p;
  if (p.shieldCd > 0) return;
  p.shieldMax = SHIELD_AMT * (p.shieldMul || 1);
  p.shield = p.shieldMax;
  p.shieldCd = SHIELD_CD * (p.shieldCdMul || 1);
  game.effects.push({ x: p.x, y: p.y, life: .4, color: '#7fffd4', nova: true });
  tone(620, .18, .06);
}

function revive() {
  const p = game.p;
  game.revives--;
  p.hp = p.max * .5;
  p.invuln = 1;
  game.effects.push({ x: p.x, y: p.y, life: .6, color: '#8dffe0', nova: true });
  game.enemies.forEach(e => { if (dist(p, e) < 220) e.hp = 0; });
  game.enemyBullets.length = 0;
  ui.status.textContent = '复活花绽放！';
  shake(.3);
  tone(500, .25, .07);
}

function dropHeart() {
  const p = game.p;
  const a = Math.random() * 7;
  game.hearts.push({ x: clamp(p.x + Math.cos(a) * 70, 22, W - 22), y: clamp(p.y + Math.sin(a) * 70, 22, H - 22) });
}

function hud() {
  const g = game;
  const p = g.p;
  ui.xp.style.width = `${g.xp / g.need * 100}%`;
  ui.level.textContent = `LV. ${g.level}`;
  ui.kills.textContent = `${t('kills')} ${g.kills}`;
  ui.wave.textContent = g.wave > 0 ? t('wave', g.wave) : t('prep');
  ui.dashBtn.textContent = p.dashCd > 0 ? Math.ceil(p.dashCd) : '冲';
  ui.burstBtn.textContent = p.burstCd > 0 ? Math.ceil(p.burstCd) : '绽';
  ui.shieldBtn.textContent = p.shieldCd > 0 ? Math.ceil(p.shieldCd) : '盾';
  ui.dashBtn.classList.toggle('cd', p.dashCd > 0);
  ui.burstBtn.classList.toggle('cd', p.burstCd > 0);
  ui.shieldBtn.classList.toggle('cd', p.shieldCd > 0);
  const m = Math.floor(g.t / 60), s = Math.floor(g.t % 60);
  ui.clock.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ring(x, y, r, c) {
  ctx.strokeStyle = c; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
}

function drawEnemy(e, g) {
  const p = g.p;
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.elite) ring(e.x, e.y, e.r + 5, '#ffd76b');
  if (e.boss) {
    if (e.windup > 0) {
      ctx.globalAlpha = .35 + .3 * Math.sin(g.t * 30);
      ring(e.x, e.y, e.r + 6, '#ffffff');
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = .5 + .25 * Math.sin(g.t * 4);
    ring(e.x, e.y, e.r + 9, e.color);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const ang = g.t * 1.6 + i * Math.PI * 2 / 5;
      dot(e.x + Math.cos(ang) * (e.r + 9), e.y + Math.sin(ang) * (e.r + 9), 5, e.color);
    }
    dot(e.x, e.y, e.r, e.color);
    dot(e.x, e.y, e.r * .62, '#2a1838');
    dot(e.x, e.y, e.r * .3, '#fff2f8');
  } else if (e.r > 15) {
    ring(e.x, e.y, e.r + 4, e.color);
    dot(e.x, e.y, e.r, e.color);
    for (let i = 0; i < 6; i++) {
      const ang = g.t * 1.1 + i * Math.PI / 3;
      dot(e.x + Math.cos(ang) * (e.r - 3), e.y + Math.sin(ang) * (e.r - 3), 3, '#ffc1e5');
    }
    dot(e.x, e.y, e.r * .45, '#351735');
  } else if (e.color === '#78b9dc') {
    const back = a + Math.PI;
    dot(e.x + Math.cos(back) * 9, e.y + Math.sin(back) * 9, 4, e.color);
    dot(e.x + Math.cos(back) * 15, e.y + Math.sin(back) * 15, 2, e.color);
    dot(e.x, e.y, e.r, '#9fd8ff');
    dot(e.x, e.y, e.r * .42, '#ffffff');
  } else {
    ring(e.x, e.y, e.r + 2, e.color);
    dot(e.x, e.y, e.r, e.color);
    dot(e.x, e.y, e.r * .55, '#241b3c');
    dot(e.x - 3, e.y - 2, 2, '#fbd2ff');
  }
}

function draw() {
  const g = game, p = g.p;
  ctx.save();
  if (g.shake > 0) {
    const s = g.shake * 10;
    ctx.translate((Math.random() - .5) * s, (Math.random() - .5) * s);
  }
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#101126'; ctx.fillRect(0, 0, W, H);
  g.bg.forEach(s => { s.y = (s.y + .12) % H; ctx.globalAlpha = .18 + s.a * .35; dot(s.x, s.y, s.r, '#b9a5ef'); });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#1c1d3a';
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }
  g.effects.forEach(e => {
    ctx.globalAlpha = e.life / .42;
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.nova ? 160 * (1 - e.life / .42) : 18, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  });
  g.stars.forEach(s => dot(s.x, s.y, 4, '#83ffd6'));
  g.hearts.forEach(h => {
    const s = 1 + .15 * Math.sin(g.t * 6);
    dot(h.x, h.y, 7 * s, '#ff7d9f');
    dot(h.x, h.y, 3 * s, '#fff0f5');
  });
  const bulletColors = { star: '#ffd2fb', rose: '#ff9ac1', moon: '#fff0a5', whip: '#7dffc9', vortex: '#c7a6ff' };
  g.bullets.forEach(b => {
    dot(b.x, b.y, b.crit ? b.size + 3 : b.size, b.crit ? '#fff2a8' : (bulletColors[p.weapon] || '#ffd2fb'));
    dot(b.x, b.y, 2, '#fff');
  });
  g.enemyBullets.forEach(b => dot(b.x, b.y, 7, '#ff6d9f'));
  g.enemies.forEach(e => {
    drawEnemy(e, g);
    if (e.boss) {
      ctx.fillStyle = '#2a2246'; ctx.fillRect(e.x - 32, e.y - e.r - 15, 64, 5);
      ctx.fillStyle = '#ff9fc2'; ctx.fillRect(e.x - 32, e.y - e.r - 15, 64 * e.hp / e.max, 5);
    }
  });
  g.dmg.forEach(d => {
    ctx.globalAlpha = Math.min(1, d.life * 3);
    ctx.fillStyle = d.color || (d.crit ? '#fff2a8' : '#f4caff');
    ctx.font = (d.crit ? 'bold 13px' : '11px') + ' Space Mono';
    ctx.textAlign = 'center';
    ctx.fillText(String(d.v), d.x, d.y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  for (let o = 0; o < p.orbits; o++) { const a = g.t * 2.3 + o * 7 / p.orbits; dot(p.x + Math.cos(a) * 48, p.y + Math.sin(a) * 48, 7, '#fff0a5'); }
  dot(p.x, p.y, 25, '#39205c'); dot(p.x, p.y, 18, '#c790ff'); dot(p.x - 5, p.y - 5, 4, '#fff1ff');
  if (p.shield > 0) {
    ctx.globalAlpha = .45 + .2 * Math.sin(g.t * 5);
    ring(p.x, p.y, p.r + 8, '#7fffd4');
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1d3342'; ctx.fillRect(20, H - 34, 160, 5);
    ctx.fillStyle = '#7fffd4'; ctx.fillRect(20, H - 34, 160 * clamp(p.shield / (p.shieldMax || 1), 0, 1), 5);
  }
  ctx.fillStyle = '#25264d'; ctx.fillRect(20, H - 25, 160, 8);
  ctx.fillStyle = '#ff759c'; ctx.fillRect(20, H - 25, 160 * clamp(p.hp / p.max, 0, 1), 8);
  ctx.fillStyle = '#e7dbf5'; ctx.font = '11px Space Mono'; ctx.fillText(`${Math.ceil(p.hp)} / ${p.max}`, 188, H - 18);
  ctx.restore();
}

function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000);
  last = now;
  try {
    if (game && !game.paused) update(dt);
    if (game) draw();
  } catch (e) {}
  raf = requestAnimationFrame(loop);
}

function pause() {
  if (!game || game.ended || !ui.up.classList.contains('hidden')) return;
  if (!ui.settings.classList.contains('hidden') || !ui.meta.classList.contains('hidden') || !ui.ach.classList.contains('hidden')) return;
  game.paused = !game.paused;
  ui.pause.classList.toggle('hidden', !game.paused);
}

function handleEsc() {
  if (!ui.up.classList.contains('hidden')) return;
  if (!ui.settings.classList.contains('hidden')) { closeSettings(); return; }
  if (!ui.meta.classList.contains('hidden')) { goStart(); return; }
  if (!ui.ach.classList.contains('hidden')) { goStart(); return; }
  if (!ui.weapon.classList.contains('hidden')) { heroesScreen(); return; }
  if (!ui.hero.classList.contains('hidden')) { goStart(); return; }
  if (!ui.over.classList.contains('hidden')) { goStart(); return; }
  if (!ui.pause.classList.contains('hidden')) { pause(); return; }
  if (game && !game.ended && ui.start.classList.contains('hidden')) pause();
}

function pad() {
  const p = navigator.getGamepads?.()[0];
  game.padX = 0; game.padY = 0;
  if (!p) return;
  game.padX = Math.abs(p.axes[0]) > .25 ? p.axes[0] : 0;
  game.padY = Math.abs(p.axes[1]) > .25 ? p.axes[1] : 0;
  if (p.buttons[9]?.pressed && !game.padHeld) pause();
  game.padHeld = !!p.buttons[9]?.pressed;
  if (p.buttons[0]?.pressed && !game.burstHeld) burst();
  game.burstHeld = !!p.buttons[0]?.pressed;
  if (p.buttons[1]?.pressed && !game.dashHeld) dash();
  game.dashHeld = !!p.buttons[1]?.pressed;
  if (p.buttons[2]?.pressed && !game.shieldHeld) shield();
  game.shieldHeld = !!p.buttons[2]?.pressed;
}

function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
}

function tone(freq, duration, volume) {
  if (!audio || vol <= 0) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.frequency.value = freq;
  g.gain.value = Math.max(0, volume * vol);
  o.connect(g).connect(audio.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  o.stop(audio.currentTime + duration);
}

function ambientChord() {
  if (!musicOn || !audio || vol <= 0) return;
  const base = [110, 130.8, 146.8, 164.8][Math.floor(Math.random() * 4)];
  [1, 1.5, 2].forEach(m => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = base * m;
    const t0 = audio.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(.035 * vol, t0 + 1.4);
    g.gain.linearRampToValueAtTime(0, t0 + 4.2);
    o.connect(g).connect(audio.destination);
    o.start(t0); o.stop(t0 + 4.3);
  });
}

function startMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicOn) musicTimer = setInterval(ambientChord, 4000);
}

function setMusic(on) {
  musicOn = on;
  localStorage.setItem('void-garden-music', on ? '1' : '0');
  startMusic();
  renderMusicBtn();
}

function renderMusicBtn() {
  const b = q('#musicBtn');
  if (!b) return;
  b.textContent = musicOn ? t('musicOn') : t('musicOff');
  b.classList.toggle('active', musicOn);
}

function setShake(on) {
  shakeOn = on;
  localStorage.setItem('void-garden-shake', on ? '1' : '0');
  renderShakeBtn();
}

function renderShakeBtn() {
  const b = q('#shakeBtn');
  if (!b) return;
  b.textContent = shakeOn ? t('shakeOn') : t('shakeOff');
  b.classList.toggle('active', shakeOn);
}

function end() {
  if (game.ended) return;
  game.ended = true; game.paused = true;
  shake(.4);
  tone(180, .35, .08);
  const seconds = Math.floor(game.t);
  const newBest = seconds > best;
  if (newBest) best = seconds;
  const gained = Math.round((Math.floor(game.kills / 2) + Math.floor(seconds / 8) + game.bosses * 4) * DIFF[difficulty].gold);
  gold += gained;
  save();
  if (seconds >= 60) unlock('survive60');
  if (seconds >= 300) unlock('survive300');
  if (seconds >= 600) unlock('survive600');
  if (game.kills >= 100) unlock('kill100');
  if (game.level >= 10) unlock('level10');
  const medal = game.kills >= 100 ? ' · 获得「百花守望」' : game.level >= 8 ? ' · 获得「茂盛花圃」' : '';
  if (isDaily) {
    const key = dailyDate();
    let db = {};
    try { db = JSON.parse(localStorage.getItem('void-garden-daily') || '{}') || {}; } catch (e) {}
    if (seconds > (Number(db[key]) || 0)) db[key] = seconds;
    localStorage.setItem('void-garden-daily', JSON.stringify(db));
  }
  ui.result.textContent = `${isDaily ? '每日挑战 · ' : ''}${game.p.name} 将花园培育至第 ${game.level} 阶，净化 ${game.kills} 个虚空生物，存活 ${seconds} 秒${newBest ? ' · 新纪录！' : medal} · 获得 ${gained} 金币`;
  show(ui.over);
  renderStartMeta();
  renderDaily();
}

function shopScreen() {
  hide(ui.start); show(ui.meta); renderShop();
}

function renderShop() {
  ui.shopGold.textContent = `${t('gold')} ${gold}`;
  ui.equipList.innerHTML = '';
  ui.skillList.innerHTML = '';
  ui.itemList.innerHTML = '';
  equipDefs.forEach(d => {
    const lv = shopLv[d.id] || 0;
    const maxed = lv >= MAX_LEVEL;
    const cost = shopCost(d, lv);
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = maxed
      ? `<b>${d.name} <small>Lv.${lv} MAX</small></b><span>${d.desc}</span>`
      : `<b>${d.name} <small>Lv.${lv}</small></b><span>${d.desc}<br><em>升级需 ${cost} 金币</em></span>`;
    b.disabled = maxed || gold < cost;
    b.onclick = () => { if (maxed) return; gold -= cost; shopLv[d.id] = (shopLv[d.id] || 0) + 1; save(); unlock('bless'); renderShop(); renderStartMeta(); };
    ui.equipList.append(b);
  });
  skillDefs.forEach(d => {
    const lv = shopLv[d.id] || 0;
    const maxed = lv >= MAX_LEVEL;
    const cost = shopCost(d, lv);
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = maxed
      ? `<b>${d.name} <small>Lv.${lv} MAX</small></b><span>${d.desc}</span>`
      : `<b>${d.name} <small>Lv.${lv}</small></b><span>${d.desc}<br><em>升级需 ${cost} 金币</em></span>`;
    b.disabled = maxed || gold < cost;
    b.onclick = () => { if (maxed) return; gold -= cost; shopLv[d.id] = (shopLv[d.id] || 0) + 1; save(); unlock('bless'); renderShop(); renderStartMeta(); };
    ui.skillList.append(b);
  });
  itemDefs.forEach(d => {
    const n = itemCounts[d.id] || 0, cost = d.base;
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<b>${d.name} <small>拥有 ${n}</small></b><span>${d.desc}<br><em>购买需 ${cost} 金币</em></span>`;
    b.disabled = gold < cost;
    b.onclick = () => { gold -= cost; itemCounts[d.id] = (itemCounts[d.id] || 0) + 1; save(); unlock('bless'); renderShop(); renderStartMeta(); };
    ui.itemList.append(b);
  });
}

function achievementsScreen() {
  hide(ui.start); show(ui.ach); renderAch();
}

function renderAch() {
  ui.achCount.textContent = t('achCount', achCount(), achievementDefs.length);
  ui.achList.innerHTML = '';
  achievementDefs.forEach(d => {
    const b = document.createElement('div');
    b.className = 'choice ach' + (ach[d.id] ? ' done' : '');
    b.innerHTML = `<b>${ach[d.id] ? '✓ ' : '🔒 '}${d.name}</b><span>${d.desc}</span>`;
    ui.achList.append(b);
  });
}

function restart() {
  if (!lastHero || !lastWeapon) return;
  start(lastHero, lastWeapon, lastDaily);
}

function settingsScreen(from) {
  settingsReturn = from || 'home';
  hide(ui.start); hide(ui.pause); show(ui.settings);
  ui.vol.value = String(vol);
}

function closeSettings() {
  hide(ui.settings);
  if (settingsReturn === 'pause') show(ui.pause);
  else goStart();
}

function setVol(v) {
  vol = Math.max(0, Math.min(1, v));
  localStorage.setItem('void-garden-vol', String(vol));
  if (vol > 0) { ensureAudio(); tone(660, .05, .06); }
}

function toggleFullscreen(force) {
  const d = document;
  const active = d.fullscreenElement || d.webkitFullscreenElement;
  if (force === true && active) return;
  if (!active) {
    const el = d.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
    else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
  }
}

function hideMobileChrome() {
  try {
    if (matchMedia && matchMedia('(pointer:coarse)').matches) {
      window.scrollTo(0, 1);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  } catch (e) {}
}

function fitPlayfield() {
  if (!matchMedia || !matchMedia('(pointer: coarse)').matches) return;
  const pf = document.querySelector('.playfield');
  const w = window.innerWidth, h = window.innerHeight;
  if (!pf || !w || !h) return;
  let pw = w, ph = w * 9 / 16;
  if (ph > h) { ph = h; pw = h * 16 / 9; }
  pf.style.width = Math.floor(pw) + 'px';
  pf.style.height = Math.floor(ph) + 'px';
  pf.style.marginLeft = 'auto';
  pf.style.marginRight = 'auto';
}

function resetProgress() {
  localStorage.removeItem('void-garden-best');
  localStorage.removeItem('void-garden-gold');
  localStorage.removeItem('void-garden-dust');
  localStorage.removeItem('void-garden-unlocked');
  localStorage.removeItem('void-garden-meta');
  localStorage.removeItem('void-garden-items');
  localStorage.removeItem('void-garden-ach');
  best = 0; gold = 0; unlocked = [true, false, false]; shopLv = loadShop(); itemCounts = loadItems(); ach = {};
  renderStartMeta();
  if (!ui.meta.classList.contains('hidden')) renderShop();
  if (!ui.hero.classList.contains('hidden')) heroesScreen();
  if (!ui.ach.classList.contains('hidden')) renderAch();
  ui.vol.value = String(vol);
}

function goStart() {
  hide(ui.hero); hide(ui.weapon); hide(ui.up); hide(ui.pause); hide(ui.over); hide(ui.meta); hide(ui.settings); hide(ui.ach);
  show(ui.start);
  renderStartMeta();
}

function dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function shuffle(a) { return [...a].sort(() => Math.random() - .5); }
function shake(amount) { if (shakeOn && game) game.shake = Math.min(.6, game.shake + amount); }
function hurt(p, amt) {
  if (amt <= 0 || p.invuln > 0) return;
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, amt);
    p.shield -= absorbed;
    amt -= absorbed;
    if (p.shield <= 0) shake(.12);
  }
  p.hp -= amt;
  p.invuln = 0.25;
}

q('#startBtn').onclick = heroesScreen;
q('#retryBtn').onclick = restart;
q('#againBtn').onclick = heroesScreen;
q('#dailyBtn').onclick = startDaily;
q('#homeBtn').onclick = goStart;
q('#resumeBtn').onclick = pause;
q('#metaBtn').onclick = shopScreen;
q('#metaClose').onclick = goStart;
q('#achBtn').onclick = achievementsScreen;
q('#achClose').onclick = goStart;
q('#settingsBtn').onclick = () => settingsScreen('home');
q('#settingsClose').onclick = closeSettings;
q('#pauseSettingsBtn').onclick = () => settingsScreen('pause');
q('#restartBtn').onclick = restart;
q('#quitBtn').onclick = goStart;
q('#resetBtn').onclick = resetProgress;
q('#diffEasy').onclick = () => setDifficulty('easy');
q('#diffNormal').onclick = () => setDifficulty('normal');
q('#diffHard').onclick = () => setDifficulty('hard');
q('#diffEndless').onclick = () => setDifficulty('endless');
q('#musicBtn').onclick = () => setMusic(!musicOn);
q('#shakeBtn').onclick = () => setShake(!shakeOn);
q('#langZh').onclick = () => setLang('zh');
q('#langEn').onclick = () => setLang('en');
ui.vol.addEventListener('input', e => setVol(Number(e.target.value)));
ui.dashBtn.addEventListener('pointerdown', e => { e.preventDefault(); dash(); });
ui.burstBtn.addEventListener('pointerdown', e => { e.preventDefault(); burst(); });
ui.shieldBtn.addEventListener('pointerdown', e => { e.preventDefault(); shield(); });
ui.pauseBtn.addEventListener('pointerdown', e => { e.preventDefault(); pause(); });
ui.fullBtn.addEventListener('click', () => toggleFullscreen());
ui.fullBtnTouch.addEventListener('pointerdown', e => { e.preventDefault(); toggleFullscreen(); });

renderStartMeta();
renderDiff();
renderDaily();
renderMusicBtn();
renderShakeBtn();
applyLang();
if (window.addEventListener) {
  window.addEventListener('resize', fitPlayfield);
  window.addEventListener('orientationchange', fitPlayfield);
}
fitPlayfield();
