// 採掘ゲーム v0.07
// 画面をマス目に割り、地形・設備を描く。資源だけは別レイヤーで、マスに縛られず自由に動く。
// 横は固定の列数、縦（深さ）は無制限。拡大縮小・上下移動できる。
(() => {
'use strict';

const VERSION = '0.07';
const NOTE_URL = 'https://note.com/kinomeno/xxxxxxx'; // 紹介記事ができたら差し替え
const TEST_LOAN = true;        // テスト用の借り入れボタン（公開前に false にする）

// ---- 盤面の設定 ----
const COLS = 14;
const SKY = 4;                 // 上から4行が空（地上）
const YARD_R = SKY - 1;        // トラックヤードの行（地面のすぐ上）
const YARD_C = COLS - 4;       // ヤード（資源置き場）の左端の列。2マス
const BED = COLS - 2, CAB = COLS - 1; // トラックの荷台と運転席の列
const COST = { drill: 50, conv: 5, sort: 20 };
const START_MONEY = 300;
const DRILL_HIT_SEC = 0.6;     // ドリルが1回削る間隔（秒）
const SUB_SEC = 0.02;          // 計算の刻み（秒）
const GRAV = 14;               // 資源が落ちる強さ
const MONTH_SEC = 20;          // ゲーム内の1か月（秒）
const LOAD_RATE = 10;          // トラックに積む速さ（個/秒）
const ANIM_SEC = 1.4;          // 出発・帰還アニメの長さ
const AWAY_SEC = 5;            // 出かけている時間
const START_ZOOM = 1.8;        // 最初は拡大した状態から

// レベル（マスごと。レベル1が最弱）
const LV = {
  drill:   { val: [0.5, 0.75, 1, 1.4, 2, 2.8, 4], cost: [80, 200, 450, 900, 1800, 3500] }, // 1回で削る力
  belt:    { val: [0.8, 1.1, 1.5, 2, 2.6, 3.3],   cost: [10, 25, 60, 150, 350] },          // コンベアの速さ（マス/秒）
  machine: { val: [1, 1.5, 2.2, 3, 4],            cost: [100, 250, 600, 1500] },           // 加工の速さ（倍）
  truck:   { val: [8, 12, 18, 26, 36, 50],        cost: [80, 200, 450, 1000, 2000] },      // 積める数
};

// 資源と製品（v＝1個の売値）
const ITEMS = {
  soil:     { v: 0,   c: ['#b08456', '#5e4026'], s: 'circle' },
  stone:    { v: 1,   c: ['#9a958d', '#4f4b46'], s: 'circle' },
  iron:     { v: 8,   c: ['#aeb8c6', '#4c5664'], s: 'circle' },
  gold:     { v: 25,  c: ['#ffd34d', '#7a5a00'], s: 'circle' },
  dia:      { v: 60,  c: ['#bfe9ff', '#3d7896'], s: 'circle' },
  gravel:   { v: 3,   c: ['#cbc5b8', '#6d675d'], s: 'small' },
  brick:    { v: 3,   c: ['#c0583c', '#6e2a18'], s: 'rect' },
  ironbar:  { v: 22,  c: ['#c9d2de', '#4c5664'], s: 'bar' },
  goldbar:  { v: 65,  c: ['#ffd34d', '#7a5a00'], s: 'bar' },
  tool:     { v: 60,  c: ['#8fa0b6', '#2f3a48'], s: 'square' },
  jewel:    { v: 170, c: ['#ffcf3a', '#8a5a00'], s: 'square' },
  diaClean: { v: 80,  c: ['#d8f3ff', '#3d7896'], s: 'gem' },
  diaCut:   { v: 120, c: ['#e9f9ff', '#2d6886'], s: 'gem' },
  gem:      { v: 200, c: ['#f2fcff', '#1f5a7a'], s: 'gem' },
  bag:      { v: 0,   c: ['#d8c9a0', '#6d5f3c'], s: 'bag' },
};
const ITEM_ORDER = Object.keys(ITEMS);

// 加工機械（1マス。前以外から入れて、前に出す）
const MACHINES = {
  kiln:     { cost: 120, time: 3, recipes: [{ in: 'soil', n: 2, out: 'brick' }] },
  crusher:  { cost: 100, time: 2, recipes: [{ in: 'stone', n: 1, out: 'gravel' }] },
  smelter:  { cost: 200, time: 4, recipes: [{ in: 'iron', n: 2, out: 'ironbar' }, { in: 'gold', n: 2, out: 'goldbar' }] },
  factory:  { cost: 400, time: 5, recipes: [{ in: 'ironbar', n: 2, out: 'tool' }, { in: 'goldbar', n: 2, out: 'jewel' }] },
  bagger:   { cost: 150, time: 2, bag: 5 },  // 同じ物5個を1袋に（売値1.2倍）
  washer:   { cost: 300, time: 2, recipes: [{ in: 'dia', n: 1, out: 'diaClean' }] },
  cutter:   { cost: 400, time: 3, recipes: [{ in: 'diaClean', n: 1, out: 'diaCut' }] },
  polisher: { cost: 500, time: 3, recipes: [{ in: 'diaCut', n: 1, out: 'gem' }] },
};
const MACHINE_ORDER = Object.keys(MACHINES);

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CCW = { right: 'up', up: 'left', left: 'down', down: 'right' }; // 進む向きから見て左
const CW = { right: 'down', down: 'left', left: 'up', up: 'right' };  // 進む向きから見て右
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const ROT = ['right', 'down', 'left', 'up'];
const ANGLE = { down: 0, left: Math.PI / 2, up: Math.PI, right: -Math.PI / 2 };
const SPEEDS = [1, 2, 4];

// ---- 言葉（ひらがな／漢字／英語） ----
const TXT = {
  kanji: {
    title: '採掘ゲーム', money: '資金', date: (y, m) => `${y}年${m}月`, depthM: n => `${n}m`,
    pan: '移動', drill: 'ドリル', dig: '掘削', conv: 'コンベア', sort: '仕分け', machine: '機械', remove: '撤去', power: '強化',
    play: '▶︎ 再生', pause: '❚❚ 停止', top: '地上', dir: '向き',
    help: '遊び方', settings: '設定', lang: '表示', reset: '最初から', loan: 'テスト用：借り入れ ＋1000',
    confirmReset: '最初からやり直しますか？', yes: 'はい', no: 'いいえ',
    noMoney: '資金が足りません', cantPlace: 'ここには置けません', underOnly: 'コンベアと機械は地下にだけ置けます',
    cantDig: 'ここは掘れません（地上からつながる穴の隣だけ）', maxed: '最大',
    drillDir: 'ドリル', convDir: 'コンベア', sortTitle: '仕分けコンベア',
    filter: '選ぶ資源', side: '出す側', left: '左', right: '右',
    sortInfo: '選んだ資源だけを横に出します。他はまっすぐ進みます。',
    outDir: '出す向き（前）', making: '加工中', waiting: '材料待ち', inBuf: '材料',
    truck: 'トラック', loaded: '積んだ数', worth: '売値', depart: '今すぐ出発', away: '出発中', yard: 'ヤード',
    lv: n => `レベル${n}`, levelUp: 'レベルアップ',
    pw: { drill: '掘る力', belt: '速さ', machine: '加工の速さ', truck: '積める数' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v}マス/秒`, machine: v => `×${v}`, truck: v => `${v}個` },
    grp: { drill: 'ドリル', belt: 'コンベア・仕分け', machine: '機械', truck: 'トラック' },
    allUp: (g, n) => `${g}をまとめてレベルアップ（${n}台）`, none: '対象がありません',
    items: { soil: '土', stone: '石', iron: '鉄', gold: '金', dia: 'ダイヤ原石', gravel: '砂利', brick: 'レンガ',
      ironbar: '鉄の延べ棒', goldbar: '金の延べ棒', tool: '鉄製品', jewel: '金細工', diaClean: '洗ったダイヤ',
      diaCut: 'カットダイヤ', gem: '宝石', bag: '袋詰め' },
    mach: { kiln: 'レンガ焼成機', crusher: 'クラッシャー', smelter: '溶鉱炉', factory: '商品製造機', bagger: '袋詰め機',
      washer: 'クリーニング機', cutter: 'カット機', polisher: '研磨機' },
    glyph: { kiln: '窯', crusher: '砕', smelter: '炉', factory: '製', bagger: '袋', washer: '洗', cutter: '切', polisher: '磨' },
    bagRule: '同じ物5個 → 1袋（売値1.2倍）',
    helpList: [
      '「移動」でドラッグ、または右の▲▼◀▶で画面が動きます。2本指・Ctrl＋ホイール・＋－で拡大縮小。',
      'ドリルを空いたマスに置くと下へ掘ります。掘った資源はドリルの後ろに出ます（後ろが土ならドリルの場所）。空中の資源は下に落ちます。',
      '地上に出た資源は、すぐに右上のヤードに溜まります。トラックが積んで出発し、帰ってきたら売上になります。トラックをタップすると途中でも出発できます。',
      'コンベアと機械は地下に置きます。「掘削」で、地上とつながった穴の隣を掘って場所を広げられます（お金がかかります）。',
      '地中に何が埋まっているかは、掘るまで分かりません。土・石・鉄・金・ダイヤがあります。',
      '仕分けコンベアは選んだ資源だけを左右に出します。機械で加工すると高く売れます。',
      '置いた物をタップすると、向きの変更やレベルアップができます。レベルは黄色い点の数で分かります。「強化」でまとめてレベルアップもできます。',
    ],
    author: 'キノメノ', kofi: '☞ko-fiで支援', tip: '☞noteでチップ',
  },
  hira: {
    title: 'さいくつゲーム', money: 'おかね', date: (y, m) => `${y}ねん${m}がつ`, depthM: n => `${n}m`,
    pan: 'うごかす', drill: 'ドリル', dig: 'あなほり', conv: 'コンベア', sort: 'しわけ', machine: 'きかい', remove: 'とりのぞく', power: 'パワーアップ',
    play: '▶︎ うごかす', pause: '❚❚ とめる', top: 'ちじょう', dir: 'むき',
    help: 'あそびかた', settings: 'せってい', lang: 'もじ', reset: 'さいしょから', loan: 'テストよう：かりる ＋1000',
    confirmReset: 'さいしょから やりなおしますか？', yes: 'はい', no: 'いいえ',
    noMoney: 'おかねが たりません', cantPlace: 'ここには おけません', underOnly: 'コンベアと きかいは ちかに だけ おけます',
    cantDig: 'ここは ほれません（ちじょうと つながる あなの となりだけ）', maxed: 'さいだい',
    drillDir: 'ドリル', convDir: 'コンベア', sortTitle: 'しわけコンベア',
    filter: 'えらぶ もの', side: 'だす ほう', left: 'ひだり', right: 'みぎ',
    sortInfo: 'えらんだ ものだけを よこに だします。ほかは まっすぐ すすみます。',
    outDir: 'だす むき（まえ）', making: 'つくっている', waiting: 'ざいりょう まち', inBuf: 'ざいりょう',
    truck: 'トラック', loaded: 'つんだ かず', worth: 'うりね', depart: 'いますぐ しゅっぱつ', away: 'しゅっぱつちゅう', yard: 'おきば',
    lv: n => `レベル${n}`, levelUp: 'レベルアップ',
    pw: { drill: 'ほる ちから', belt: 'はやさ', machine: 'つくる はやさ', truck: 'つめる かず' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v}マス/びょう`, machine: v => `×${v}`, truck: v => `${v}こ` },
    grp: { drill: 'ドリル', belt: 'コンベア・しわけ', machine: 'きかい', truck: 'トラック' },
    allUp: (g, n) => `${g}を まとめて レベルアップ（${n}だい）`, none: 'ありません',
    items: { soil: 'つち', stone: 'いし', iron: 'てつ', gold: 'きん', dia: 'ダイヤの げんせき', gravel: 'じゃり', brick: 'レンガ',
      ironbar: 'てつの ぼう', goldbar: 'きんの ぼう', tool: 'てつの どうぐ', jewel: 'きんの かざり', diaClean: 'あらった ダイヤ',
      diaCut: 'カットした ダイヤ', gem: 'ほうせき', bag: 'ふくろづめ' },
    mach: { kiln: 'レンガやき', crusher: 'クラッシャー', smelter: 'ようこうろ', factory: 'しょうひん こうば', bagger: 'ふくろづめき',
      washer: 'あらいき', cutter: 'カットき', polisher: 'みがきき' },
    glyph: { kiln: 'か', crusher: 'く', smelter: 'ろ', factory: 'せ', bagger: 'ふ', washer: 'あ', cutter: 'き', polisher: 'み' },
    bagRule: 'おなじ もの 5こ → 1ふくろ（うりね 1.2ばい）',
    helpList: [
      '「うごかす」で ひっぱるか、みぎの ▲▼◀▶で がめんが うごきます。2ほんゆび・＋－で おおきさを かえられます。',
      'ドリルを あいている マスに おくと したへ ほります。ほった ものは ドリルの うしろに でます。くうちゅうの ものは したに おちます。',
      'ちじょうに でた ものは すぐに みぎうえの おきばに たまります。トラックが つんで でかけて、かえってきたら おかねに なります。',
      'コンベアと きかいは ちかに おきます。「あなほり」で ちじょうと つながった あなの となりを ほれます（おかねが かかります）。',
      'つちの なかに なにが あるかは ほるまで わかりません。',
      'しわけコンベアは えらんだ ものだけを よこに だします。きかいで つくりかえると たかく うれます。',
      'おいた ものを タップすると むきを かえたり レベルアップ できます。レベルは きいろい てんの かずで わかります。',
    ],
    author: 'キノメノ', kofi: '☞ko-fiで おうえん', tip: '☞noteで チップ',
  },
  en: {
    title: 'Mining Game', money: 'Money', date: (y, m) => `Y${y} M${m}`, depthM: n => `${n}m`,
    pan: 'Move', drill: 'Drill', dig: 'Dig', conv: 'Conveyor', sort: 'Sorter', machine: 'Machines', remove: 'Remove', power: 'Upgrade',
    play: '▶︎ Play', pause: '❚❚ Pause', top: 'Top', dir: 'Dir',
    help: 'How to play', settings: 'Settings', lang: 'Text', reset: 'Restart', loan: 'Test: borrow +1000',
    confirmReset: 'Start over from the beginning?', yes: 'Yes', no: 'No',
    noMoney: 'Not enough money', cantPlace: 'Cannot place here', underOnly: 'Conveyors and machines go underground only',
    cantDig: 'Cannot dig here (only next to holes connected to the surface)', maxed: 'MAX',
    drillDir: 'Drill', convDir: 'Conveyor', sortTitle: 'Sorting conveyor',
    filter: 'Picks', side: 'Out to', left: 'Left', right: 'Right',
    sortInfo: 'Sends the chosen item out to the side. Everything else goes straight.',
    outDir: 'Output (front)', making: 'Working', waiting: 'Waiting', inBuf: 'Input',
    truck: 'Truck', loaded: 'Loaded', worth: 'Value', depart: 'Leave now', away: 'Away', yard: 'Yard',
    lv: n => `Lv ${n}`, levelUp: 'Level up',
    pw: { drill: 'Power', belt: 'Speed', machine: 'Work speed', truck: 'Capacity' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v} cells/s`, machine: v => `×${v}`, truck: v => `${v}` },
    grp: { drill: 'drills', belt: 'conveyors & sorters', machine: 'machines', truck: 'truck' },
    allUp: (g, n) => `Level up all ${g} (${n})`, none: 'Nothing to upgrade',
    items: { soil: 'Dirt', stone: 'Stone', iron: 'Iron', gold: 'Gold', dia: 'Raw diamond', gravel: 'Gravel', brick: 'Brick',
      ironbar: 'Iron bar', goldbar: 'Gold bar', tool: 'Iron goods', jewel: 'Gold jewelry', diaClean: 'Clean diamond',
      diaCut: 'Cut diamond', gem: 'Gem', bag: 'Bag' },
    mach: { kiln: 'Brick kiln', crusher: 'Crusher', smelter: 'Smelter', factory: 'Workshop', bagger: 'Bagger',
      washer: 'Washer', cutter: 'Cutter', polisher: 'Polisher' },
    glyph: { kiln: 'K', crusher: 'C', smelter: 'S', factory: 'W', bagger: 'B', washer: 'Wa', cutter: 'Cu', polisher: 'P' },
    bagRule: '5 of the same → 1 bag (value ×1.2)',
    helpList: [
      'Drag with "Move" or use the arrows on the right to scroll. Pinch, Ctrl+wheel or +/- to zoom.',
      'Place a drill on an empty cell and it digs down. Mined items come out behind it. Items in the air fall down.',
      'Items that reach the surface go straight to the yard at the top right. The truck carries them away and you get paid when it comes back. Tap the truck to send it early.',
      'Conveyors and machines go underground. Use "Dig" to clear cells next to holes connected to the surface (costs money).',
      'You cannot see what is buried until you dig it.',
      'A sorter sends only the chosen item to its side. Machines turn items into pricier goods.',
      'Tap anything you placed to turn it or level it up. Yellow dots show the level. "Upgrade" levels up many at once.',
    ],
    author: 'Kinomeno', kofi: '☞Support on Ko-fi', tip: '☞Tip on note',
  },
};
function loadLang() {
  try { const v = localStorage.getItem('saikutsu.lang'); if (TXT[v]) return v; } catch (e) { /* 保存できない環境 */ }
  return (navigator.language || '').toLowerCase().startsWith('ja') ? 'kanji' : 'en';
}
let lang = loadLang();
const tx = () => TXT[lang];

// ---- 状態 ----
let S;
const key = (c, r) => r * COLS + c;
const cOf = k => ((k % COLS) + COLS) % COLS;
const rOf = k => Math.floor(k / COLS);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inB = (c, r) => c >= 0 && c < COLS && r >= 0;
const isBelt = s => !!s && (s.type === 'conv' || s.type === 'sort');
const isYard = (c, r) => r === YARD_R && c >= YARD_C;
const itemVal = it => (it.v !== undefined ? it.v : ITEMS[it.k].v);
const grpOf = s => (s === 'truck' ? 'truck' : s.type === 'drill' ? 'drill' : isBelt(s) ? 'belt' : 'machine');
const lvOf = s => (s === 'truck' ? S.truck.lv : s.lv);
const valOf = s => LV[grpOf(s)].val[lvOf(s)];

// ■をつくる（中身は見えない）
function makeBlock(r) {
  const d = r - SKY;
  const stone = Math.random() < clamp(0.04 + 0.025 * d, 0, 0.7);
  const x = Math.random();
  const diaP = d >= 15 ? Math.min(0.06, 0.01 + 0.002 * (d - 15)) : 0;
  const goldP = d >= 6 ? Math.min(0.14, 0.03 + 0.006 * (d - 6)) : 0;
  const ironP = Math.min(0.35, 0.16 + 0.01 * d);
  const ore = x < diaP ? 'dia' : x < diaP + goldP ? 'gold' : x < diaP + goldP + ironP ? 'iron' : null;
  const yieldN = Math.min(12, 4 + Math.floor(d / 5));     // 1マスから出る数
  const h = (2 + d * 0.08) * (stone ? 2 : 1);             // 1個出すのに必要な削る量（硬さ）
  return { mat: stone ? 'stone' : 'soil', ore, yieldN, left: yieldN, h, p: 0 };
}
function oreFrom(b) {
  const share = { iron: 0.45, gold: 0.35, dia: 0.25 };
  return b.ore && Math.random() < share[b.ore] ? b.ore : b.mat;
}
function row(r) {
  let a = S.rows.get(r);
  if (!a) {
    a = [];
    for (let c = 0; c < COLS; c++) a.push(r < SKY ? null : makeBlock(r));
    S.rows.set(r, a);
  }
  return a;
}
const blk = (c, r) => (r < 0 ? null : row(r)[c]);
const digCost = b => Math.round(10 + b.h * b.yieldN * 1.5);  // 掘削の費用（硬いほど高い）

function newGame() {
  S = {
    rows: new Map(),
    st: new Map(),      // 設備：key -> {type:'drill'|'conv'|'sort'|'machine', dir, lv, ...}
    items: [],          // 資源レイヤー：{k, x, y, vy, lane, spd, ox, oy, tk, v?, of?}
    yard: [],           // ヤードに溜まった資源：{k, v?, of?, rx, ry}
    money: START_MONEY,
    truck: { lv: 0, load: 0, value: 0, phase: 'here', t: 0, acc: 0 },
    time: 0,
    deepest: SKY + 6,
    pops: [],
    digVer: 0,          // 地形が変わった回数（掘れる場所の再計算用）
  };
  resetCam();
}

// 設備を置けるマス
const isOpen = (c, r) => inB(c, r) && blk(c, r) === null && !S.st.has(key(c, r)) && !isYard(c, r) && !(r === YARD_R && c >= YARD_C);
// 落ちてきた資源が止まるマス（下に支えがある）
function isSolid(c, r) {
  if (c < 0 || c >= COLS) return true;
  if (r < 0) return false;
  if (blk(c, r) !== null) return true;
  const s = S.st.get(key(c, r));
  return !!s && !isBelt(s);
}
// 資源を出せるマス（空いたマス・コンベア。地上なら そのままヤードへ）
function canPut(c, r) {
  if (!inB(c, r) || blk(c, r) !== null) return false;
  const s = S.st.get(key(c, r));
  return !s || isBelt(s);
}

// ---- 浮き文字（売上・費用） ----
function pop(text, wx, wy, kind) { S.pops.push({ text, wx, wy, kind, t0: performance.now() }); }
function spend(cost, wx, wy) { S.money -= cost; pop('-' + cost, wx, wy, 'cost'); }

// ---- 機械 ----
function accepts(m, it) {
  const def = MACHINES[m.m];
  if (def.bag) return it.k !== 'bag' && (!m.bagKind || m.bagKind === it.k) && m.bagCount < def.bag * 2;
  const rec = def.recipes.find(x => x.in === it.k);
  return !!rec && (m.buf[it.k] || 0) < rec.n * 3;
}
function absorb(m, it) {
  if (MACHINES[m.m].bag) { m.bagKind = it.k; m.bagCount++; }
  else m.buf[it.k] = (m.buf[it.k] || 0) + 1;
}
const machineAt = (c, r) => { const s = inB(c, r) && S.st.get(key(c, r)); return s && s.type === 'machine' ? s : null; };

function updateMachines(dt) {
  for (const [k, m] of S.st) {
    if (m.type !== 'machine') continue;
    const def = MACHINES[m.m];
    if (!m.cur) {
      if (def.bag) {
        if (m.bagCount >= def.bag) {
          const v1 = ITEMS[m.bagKind].v;
          m.cur = { k: 'bag', of: m.bagKind, v: v1 > 0 ? Math.round(v1 * def.bag * 1.2) : v1 * def.bag };
          m.bagCount -= def.bag; if (!m.bagCount) m.bagKind = null;
          m.prog = 0;
        }
      } else {
        for (const rec of def.recipes) {
          if ((m.buf[rec.in] || 0) >= rec.n) { m.buf[rec.in] -= rec.n; m.cur = { k: rec.out }; m.prog = 0; break; }
        }
      }
    }
    if (m.cur) {
      m.prog = Math.min(def.time, m.prog + dt * valOf(m));
      if (m.prog >= def.time && emitFront(k, m)) m.cur = null;
    }
  }
}
function emitFront(k, m) {
  const c = cOf(k), r = rOf(k);
  const [dx, dy] = DIRS[m.dir];
  const fc = c + dx, fr = r + dy;
  const proto = { k: m.cur.k, v: m.cur.v, of: m.cur.of };
  const next = machineAt(fc, fr);
  if (next) { if (!accepts(next, proto)) return false; absorb(next, proto); return true; }
  if (!canPut(fc, fr)) return false;
  const it = spawnItem(proto.k, c + 0.5 + dx * 0.72, r + 0.5 + dy * 0.72, fc, fr);
  if (proto.v !== undefined) { it.v = proto.v; it.of = proto.of; }
  return true;
}

// 資源を1個つくる（マスの中で少しばらけた位置に）
function spawnItem(k, x, y, cc, cr) {
  const it = {
    k, x: x + rand(-0.15, 0.15), y: y + rand(-0.15, 0.15), vy: 0,
    lane: rand(-0.22, 0.22),        // コンベア上で横にずれる量（整列させない）
    spd: rand(0.8, 1.2),            // 1個ずつ少し速さが違う
    ox: rand(-0.28, 0.28), oy: rand(-0.28, 0.28), // 溜まるときの位置
    tk: -1,
  };
  if (cc !== undefined) { it.x = clamp(it.x, cc + 0.04, cc + 0.96); it.y = clamp(it.y, cr + 0.04, cr + 0.96); }
  S.items.push(it);
  return it;
}
// 地上に出た資源はヤードへ
function toYard(it) { S.yard.push({ k: it.k, v: it.v, of: it.of, rx: Math.random(), ry: Math.random() }); }

// ---- 時間を進める ----
function sim(sec) {
  while (sec > 1e-9) {
    const dt = Math.min(SUB_SEC, sec);
    sec -= dt;
    S.time += dt;
    updateItems(dt);
    updateDrills(dt);
    updateMachines(dt);
    updateTruck(dt);
  }
}

function approach(v, target, d) { return Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d; }

function updateItems(dt) {
  for (let i = S.items.length - 1; i >= 0; i--) {
    const it = S.items[i];
    if (it.y < SKY) { toYard(it); S.items.splice(i, 1); continue; }   // 地上に出た
    const c = Math.floor(it.x), r = Math.floor(it.y), k = key(c, r);
    const s = S.st.get(k);
    if (!isBelt(s)) {
      // コンベアの外：下に支えが無ければ落ちる。支えがあればそのマスの下の方に溜まる
      it.x = approach(it.x, c + 0.5 + it.ox, dt * 0.6);
      const restY = r + 0.78 + it.oy * 0.3;
      if (!isSolid(c, r + 1)) {
        it.vy = Math.min(it.vy + GRAV * dt, 9); it.y += it.vy * dt;
      } else if (it.y < restY) {
        it.vy = Math.min(it.vy + GRAV * dt, 9); it.y = Math.min(restY, it.y + it.vy * dt);
      } else {
        it.vy = 0;
        const m = machineAt(c, r + 1);                 // 下が機械なら上から入る
        if (m && accepts(m, it)) { absorb(m, it); S.items.splice(i, 1); }
      }
      continue;
    }
    it.vy = 0;
    const v = valOf(s) * it.spd * dt;
    let md = s.dir;
    if (s.type === 'sort' && it.k === s.filter) {
      // 選ばれた資源は、マスの真ん中まで来たら横へ曲がる
      if (it.tk !== k) {
        const [dx, dy] = DIRS[s.dir];
        const along = dx ? (it.x - (c + 0.5)) * dx : (it.y - (r + 0.5)) * dy;
        if (along >= 0) it.tk = k;
      }
      if (it.tk === k) md = s.side === 'left' ? CCW[s.dir] : CW[s.dir];
    }
    const [dx, dy] = DIRS[md];
    // 進む方向と直角には、その資源ごとの「ずれ」に寄せる（真ん中に揃えない）
    if (dx !== 0) it.y = approach(it.y, r + 0.5 + it.lane, v * 0.6);
    else it.x = approach(it.x, c + 0.5 + it.lane, v * 0.6);
    const nx = it.x + dx * v, ny = it.y + dy * v;
    const nc = Math.floor(nx), nr = Math.floor(ny);
    if (nc === c && nr === r) { it.x = nx; it.y = ny; continue; }
    // 隣のマスへ：地上なら出る（→ヤード）、コンベアなら進む、機械なら入る、それ以外は端で止まる
    const m = machineAt(nc, nr);
    if (m) { if (accepts(m, it)) { absorb(m, it); S.items.splice(i, 1); continue; } }
    else if (inB(nc, nr) && blk(nc, nr) === null && (nr < SKY || isBelt(S.st.get(key(nc, nr))))) {
      it.x = nx; it.y = ny; continue;
    }
    const edge = 0.42 - Math.abs(it.ox) * 0.4;
    if (dx) it.x = c + 0.5 + dx * edge; else it.y = r + 0.5 + dy * edge;
  }
}

function updateDrills(dt) {
  for (const [k, s] of [...S.st]) {
    if (s.type !== 'drill') continue;
    s.t += dt;
    if (s.t < DRILL_HIT_SEC) continue;
    s.t -= DRILL_HIT_SEC;
    drillHit(k, s);
  }
}
function moveDrill(k, s, nk) { S.st.delete(k); S.st.set(nk, s); S.deepest = Math.max(S.deepest, rOf(nk)); }

function drillHit(k, s) {
  const c = cOf(k), r = rOf(k);
  const [dx, dy] = DIRS[s.dir];
  const tc = c + dx, tr = r + dy;
  if (!inB(tc, tr)) { s.stuck = true; return; }
  const g = blk(tc, tr);
  if (g === null) {
    // 下向きで下が空洞なら落ちる。それ以外は空振りで止まる
    if (s.dir === 'down' && !S.st.has(key(tc, tr)) && !isYard(tc, tr)) { s.stuck = false; moveDrill(k, s, key(tc, tr)); }
    else s.stuck = true;
    return;
  }
  s.stuck = false; s.hit = S.time;
  g.p += valOf(s);
  while (g.p >= g.h && g.left > 0) { g.p -= g.h; g.left--; emitOre(c, r, s, oreFrom(g)); }
  if (g.left <= 0) { row(tr)[tc] = null; S.digVer++; moveDrill(k, s, key(tc, tr)); } // 消えた■の位置へ移動
}
// 資源はドリルの後ろに出る。後ろが土などで出せないときはドリルの場所に出る
function emitOre(c, r, s, kind) {
  const [bx, by] = DIRS[OPP[s.dir]];
  const bc = c + bx, br = r + by;
  const m = machineAt(bc, br);
  if (m && accepts(m, { k: kind })) { absorb(m, { k: kind }); return; }
  if (canPut(bc, br)) spawnItem(kind, c + 0.5 + bx * 0.75, r + 0.5 + by * 0.75, bc, br);
  else spawnItem(kind, c + 0.5, r + 0.5, c, r);
}

function updateTruck(dt) {
  const t = S.truck, cap = valOf('truck');
  if (t.phase === 'here') {
    // ヤードに溜まった資源を積む
    if (t.load < cap && S.yard.length) {
      t.acc += dt * LOAD_RATE;
      while (t.acc >= 1 && t.load < cap && S.yard.length) {
        const it = S.yard.shift();
        t.value += itemVal(it); t.load++; t.acc--;
      }
    } else t.acc = 0;
    if (t.load >= cap) { t.phase = 'leaving'; t.t = 0; }
    return;
  }
  t.t += dt;
  if (t.phase === 'leaving' && t.t >= ANIM_SEC) { t.phase = 'away'; t.t = 0; }
  else if (t.phase === 'away' && t.t >= AWAY_SEC) { t.phase = 'returning'; t.t = 0; }
  else if (t.phase === 'returning' && t.t >= ANIM_SEC) {
    // 帰ってきたら売上
    S.money += t.value;
    pop((t.value >= 0 ? '+' : '') + t.value, BED + 1, YARD_R, t.value >= 0 ? 'sale' : 'cost');
    t.load = 0; t.value = 0; t.phase = 'here'; t.t = 0;
  }
}
function departNow() { const t = S.truck; if (t.phase === 'here' && t.load > 0) { t.phase = 'leaving'; t.t = 0; } }

// ---- 掘削（地上とつながった穴の隣だけ） ----
let digCache = { ver: -1, set: null };
function diggable() {
  if (digCache.ver === S.digVer) return digCache.set;
  // 地上から空いたマスをたどる
  const seen = new Set(), q = [];
  for (let r = 0; r < SKY; r++) for (let c = 0; c < COLS; c++) { const k = key(c, r); seen.add(k); q.push(k); }
  while (q.length) {
    const k = q.pop(), c = cOf(k), r = rOf(k);
    for (const [dx, dy] of Object.values(DIRS)) {
      const nc = c + dx, nr = r + dy;
      if (!inB(nc, nr)) continue;
      const nk = key(nc, nr);
      if (seen.has(nk) || blk(nc, nr) !== null) continue;
      seen.add(nk); q.push(nk);
    }
  }
  const set = new Set();
  for (const k of seen) {
    const c = cOf(k), r = rOf(k);
    for (const [dx, dy] of Object.values(DIRS)) {
      const nc = c + dx, nr = r + dy;
      if (inB(nc, nr) && blk(nc, nr) !== null) set.add(key(nc, nr));
    }
  }
  digCache = { ver: S.digVer, set };
  return set;
}
function digAt(c, r) {
  const b = inB(c, r) && blk(c, r);
  if (!b || !diggable().has(key(c, r))) { say(tx().cantDig); return; }
  const cost = digCost(b);
  if (S.money < cost) { say(tx().noMoney); return; }
  spend(cost, c + 0.5, r + 0.3);
  row(r)[c] = null; S.digVer++;               // 中の資源はなくなる
  S.deepest = Math.max(S.deepest, r);
}

// ---- 設置・レベル ----
let tool = 'none', machSel = 'kiln', dir = 'right', running = true, speedIdx = 0;

function costOf(s) { return s.type === 'machine' ? MACHINES[s.m].cost : COST[s.type]; }
function apply(c, r, dragging) {
  if (!inB(c, r) || tool === 'pan' || tool === 'none') return;
  if (tool === 'dig') { if (!dragging) digAt(c, r); return; }
  const k = key(c, r), s = S.st.get(k);
  if (tool === 'remove') { if (s) removeAt(k); return; }
  if (s) return;
  if (dragging && tool !== 'conv') return;
  if (tool !== 'drill' && r < SKY) { if (!dragging) say(tx().underOnly); return; } // 地上にコンベア・機械は置けない
  if (!isOpen(c, r)) { if (!dragging) say(tx().cantPlace); return; }
  const cost = tool === 'machine' ? MACHINES[machSel].cost : COST[tool];
  if (S.money < cost) { if (!dragging) say(tx().noMoney); return; }
  spend(cost, c + 0.5, r + 0.3);
  if (tool === 'drill') S.st.set(k, { type: 'drill', dir: 'down', lv: 0, t: 0, hit: -99 });
  else if (tool === 'sort') S.st.set(k, { type: 'sort', dir, lv: 0, filter: 'iron', side: 'left' });
  else if (tool === 'machine') S.st.set(k, { type: 'machine', m: machSel, dir, lv: 0, buf: {}, bagKind: null, bagCount: 0, cur: null, prog: 0 });
  else S.st.set(k, { type: 'conv', dir, lv: 0 });
}
function removeAt(k) {
  const s = S.st.get(k); if (!s) return;
  const back = Math.floor(costOf(s) / 2);
  S.money += back; pop('+' + back, cOf(k) + 0.5, rOf(k) + 0.3, 'sale');
  S.st.delete(k);                          // 乗っていた資源はその場に残る（落ちる）
}
function nextCost(t) { const L = LV[grpOf(t)], lv = lvOf(t); return lv < L.cost.length ? L.cost[lv] : null; }
function posOf(t) { if (t === 'truck') return [BED + 1, YARD_R]; const k = findKey(t); return [cOf(k) + 0.5, rOf(k) + 0.3]; }
function levelUp(t) {
  const cost = nextCost(t);
  if (cost === null) return false;
  if (S.money < cost) { say(tx().noMoney); return false; }
  spend(cost, ...posOf(t));
  if (t === 'truck') S.truck.lv++; else t.lv++;
  return true;
}
// まとめてレベルアップ：その種類の全部を1段ずつ
function groupTargets(g) {
  if (g === 'truck') return nextCost('truck') !== null ? ['truck'] : [];
  return [...S.st.values()].filter(s => grpOf(s) === g && nextCost(s) !== null);
}
function groupCost(g) { return groupTargets(g).reduce((a, t) => a + nextCost(t), 0); }
function levelUpAll(g) {
  const ts = groupTargets(g), total = groupCost(g);
  if (!ts.length) return;
  if (S.money < total) { say(tx().noMoney); return; }
  for (const t of ts) levelUp(t);
}

// ---- カメラ（拡大縮小・移動） ----
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const cam = { x: 0, y: -0.3, z: START_ZOOM };
let cw = 0, ch = 0, cp = 30, offX = 0, hover = null;

function metrics() {
  cw = cv.clientWidth; ch = cv.clientHeight;
  const base = Math.min(cw / COLS, 46);
  cam.z = clamp(cam.z, 0.5, 3);
  cp = base * cam.z;
  const worldW = COLS * cp;
  if (worldW <= cw) { offX = (cw - worldW) / 2; cam.x = 0; }
  else { offX = 0; cam.x = clamp(cam.x, 0, COLS - cw / cp); }
  const viewRows = ch / cp;
  cam.y = clamp(cam.y, -1, Math.max(0, S.deepest + 4 - viewRows * 0.5));
}
function resetCam() {
  cam.z = START_ZOOM; cam.y = -0.3;
  if (cv.clientWidth) { metrics(); cam.x = COLS; metrics(); } // 右端（トラック側）が見えるように
}
function zoomAt(sx, sy, f) {
  metrics();
  const wc = (sx - offX) / cp + cam.x, wr = sy / cp + cam.y;
  cam.z *= f; metrics();
  if (COLS * cp > cw) cam.x = wc - (sx - offX) / cp;
  cam.y = wr - sy / cp;
  metrics();
}
// 移動ボタン（▲▼◀▶）を画面の端に置く。他のメニューと重ならないよう、実際の大きさを見て決める
function layoutFloats() {
  const W = window.innerWidth, H = window.innerHeight;
  const tg = $('timeGroup').getBoundingClientRect(), tb = $('toolBar').getBoundingClientRect();
  const hdr = cv.getBoundingClientRect().top;
  // ▲：上の端。右上の操作と横に重なるときは、その下に
  const upTop = (tg.left < W / 2 + 26 && tg.right > W / 2 - 26) ? tg.bottom + 6 : hdr + 6;
  $('mvUp').style.top = upTop + 'px';
  // ▼：下の端（道具の上）。向きのバーはさらにその上
  const downBottom = H - tb.top + 6;
  $('mvDown').style.bottom = downBottom + 'px';
  $('dirBar').style.bottom = (downBottom + 40) + 'px';
  // ◀▶：左右の端、ゲーム画面の縦の真ん中
  const midY = (hdr + tb.top) / 2 - 22;
  $('mvLeft').style.top = midY + 'px';
  $('mvRight').style.top = midY + 'px';
}
function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  metrics(); placePop();
}

// ---- タップメニュー ----
const $ = id => document.getElementById(id);
let popTarget = null;   // 設備 or 'truck'
function findKey(s) { for (const [k, v] of S.st) if (v === s) return k; return -1; }
function popCell() {
  if (!popTarget) return null;
  if (popTarget === 'truck') return { c: BED + 0.5, r: YARD_R };
  const k = findKey(popTarget);
  return k < 0 ? null : { c: cOf(k), r: rOf(k) };
}
function openPop(t) { popTarget = t; buildPop(); $('pop').hidden = false; placePop(); }
function buildPop() {
  const t = popTarget, T = tx();
  const isTruck = t === 'truck';
  $('popTitle').textContent = isTruck ? T.truck
    : t.type === 'drill' ? T.drillDir : t.type === 'sort' ? T.sortTitle
    : t.type === 'machine' ? T.mach[t.m] : T.convDir;
  $('popDirs').hidden = isTruck;
  $('popFilterRow').hidden = $('popSideRow').hidden = !(t !== 'truck' && t.type === 'sort');
  $('popAction').hidden = !isTruck;
  $('popAction').textContent = T.depart;
  $('popRemove').hidden = isTruck;
  if (!isTruck && t.type === 'sort') {
    const box = $('popFilters'); box.innerHTML = '';
    for (const k of ITEM_ORDER) {
      const b = document.createElement('button'); b.dataset.pf = k; b.textContent = T.items[k];
      b.addEventListener('click', () => { if (popTarget) { popTarget.filter = k; updatePop(); } });
      box.append(b);
    }
  }
  updatePop();
}
function popInfoText() {
  const t = popTarget, T = tx();
  if (t === 'truck') {
    const tr = S.truck;
    if (tr.phase !== 'here') return T.away;
    return `${T.loaded} ${tr.load}/${valOf('truck')}　${T.worth} ${tr.value}　${T.yard} ${S.yard.length}`;
  }
  if (t.type === 'sort') return T.sortInfo;
  if (t.type === 'machine') {
    const def = MACHINES[t.m];
    const rule = def.bag ? T.bagRule
      : def.recipes.map(x => `${T.items[x.in]}×${x.n} → ${T.items[x.out]}`).join(' / ');
    const have = def.bag ? (t.bagKind ? `${T.items[t.bagKind]}×${t.bagCount}` : '-')
      : Object.entries(t.buf).filter(([, n]) => n > 0).map(([k2, n]) => `${T.items[k2]}×${n}`).join(' ') || '-';
    return `${rule}\n${T.outDir}：${ARROW[t.dir]}　${T.inBuf}：${have}　${t.cur ? T.making : T.waiting}`;
  }
  return '';
}
function updatePop() {
  if (!popTarget) return;
  const t = popTarget, T = tx();
  document.querySelectorAll('#pop [data-pdir]').forEach(b => b.classList.toggle('active', t !== 'truck' && b.dataset.pdir === t.dir));
  document.querySelectorAll('#pop [data-pf]').forEach(b => b.classList.toggle('active', b.dataset.pf === t.filter));
  document.querySelectorAll('#pop [data-ps]').forEach(b => b.classList.toggle('active', b.dataset.ps === t.side));
  const info = popInfoText();
  $('popInfo').hidden = !info;
  $('popInfo').innerText = info;
  // レベル
  const g = grpOf(t), lv = lvOf(t), cost = nextCost(t), unit = T.pwUnit[g];
  $('popLevel').textContent = `${T.lv(lv + 1)}　${T.pw[g]} ${unit(LV[g].val[lv])}` + (cost !== null ? ` → ${unit(LV[g].val[lv + 1])}` : '');
  const btn = $('popLvUp'); btn.innerHTML = '';
  if (cost === null) { btn.textContent = T.maxed; btn.disabled = true; }
  else {
    btn.append(document.createTextNode(T.levelUp + ' '));
    const sm = document.createElement('small'); sm.textContent = cost; btn.append(sm);
    btn.disabled = S.money < cost;
  }
  $('popAction').disabled = t === 'truck' && !(S.truck.phase === 'here' && S.truck.load > 0);
}
function closePop() { popTarget = null; $('pop').hidden = true; }
function placePop() {
  if (!popTarget) return;
  const p = popCell();
  if (!p) { closePop(); return; }
  const pop2 = $('pop'), top = cv.getBoundingClientRect().top;
  const sx = offX + (p.c + 0.5 - cam.x) * cp, sy = top + (p.r - cam.y) * cp;
  let x = sx - pop2.offsetWidth / 2;
  let y = sy + cp + 6;
  if (y + pop2.offsetHeight > window.innerHeight - 8) y = sy - pop2.offsetHeight - 6;
  x = clamp(x, 8, window.innerWidth - pop2.offsetWidth - 8);
  pop2.style.left = x + 'px'; pop2.style.top = clamp(y, top + 4, window.innerHeight - pop2.offsetHeight - 4) + 'px';
}
document.querySelectorAll('#pop [data-pdir]').forEach(b => b.addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck') { popTarget.dir = b.dataset.pdir; popTarget.stuck = false; updatePop(); }
}));
document.querySelectorAll('#pop [data-ps]').forEach(b => b.addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck') { popTarget.side = b.dataset.ps; updatePop(); }
}));
$('popLvUp').addEventListener('click', () => { if (popTarget) { levelUp(popTarget); updatePop(); updateUI(); } });
$('popAction').addEventListener('click', () => { departNow(); updatePop(); });
$('popRemove').addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck') { const k = findKey(popTarget); if (k >= 0) removeAt(k); }
  closePop();
});
$('popClose').addEventListener('click', closePop);

// ---- パネル（機械・強化・遊び方・設定） ----
const PANELS = ['machList', 'powerPanel', 'help', 'settings'];
function closePanels() { PANELS.forEach(x => { $(x).hidden = true; }); }
function togglePanel(id) {
  const show = $(id).hidden;
  closePanels(); closePop();
  $(id).hidden = !show;
  if (show) renderPanel(id);
}
function renderPanel(id) {
  const T = tx();
  if (id === 'machList') {
    const box = $('machItems'); box.innerHTML = '';
    for (const m of MACHINE_ORDER) {
      const def = MACHINES[m];
      const rowEl = document.createElement('div'); rowEl.className = 'row2';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = T.mach[m];
      const spec = document.createElement('div'); spec.className = 'spec';
      spec.textContent = def.bag ? T.bagRule : def.recipes.map(x => `${T.items[x.in]}×${x.n} → ${T.items[x.out]}`).join(' / ');
      const btn = document.createElement('button');
      btn.append(document.createTextNode(T.mach[m] + ' '));
      const sm = document.createElement('small'); sm.textContent = def.cost; btn.append(sm);
      btn.classList.toggle('active', tool === 'machine' && machSel === m);
      btn.addEventListener('click', () => { machSel = m; tool = 'machine'; closePanels(); updateUI(); });
      rowEl.append(name, spec, btn); box.append(rowEl);
    }
  } else if (id === 'powerPanel') {
    const box = $('powerItems'); box.innerHTML = '';
    for (const g of ['drill', 'belt', 'machine', 'truck']) {
      const ts = groupTargets(g), total = groupCost(g);
      const rowEl = document.createElement('div'); rowEl.className = 'row2';
      const name = document.createElement('div'); name.className = 'name';
      name.textContent = g === 'truck' ? `${T.grp.truck}　${T.lv(S.truck.lv + 1)}` : T.allUp(T.grp[g], ts.length);
      const spec = document.createElement('div'); spec.className = 'spec';
      spec.textContent = g === 'truck' ? `${T.pw.truck} ${T.pwUnit.truck(valOf('truck'))}` : (ts.length ? '' : T.none);
      const btn = document.createElement('button');
      if (!ts.length) { btn.textContent = g === 'truck' ? T.maxed : '-'; btn.disabled = true; }
      else {
        btn.append(document.createTextNode(T.levelUp + ' '));
        const sm = document.createElement('small'); sm.textContent = total; btn.append(sm);
        btn.disabled = S.money < total;
        btn.addEventListener('click', () => { levelUpAll(g); renderPanel('powerPanel'); updateUI(); });
      }
      rowEl.append(name, spec, btn); box.append(rowEl);
    }
  } else if (id === 'help') {
    const ul = $('helpList'); ul.innerHTML = '';
    for (const line of T.helpList) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
  } else if (id === 'settings') {
    document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  }
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem('saikutsu.lang', lang); } catch (e) { /* 保存できない環境 */ }
  setupText(); renderPanel('settings'); if (popTarget) buildPop();
}));

// 確認画面（ブラウザ標準の確認窓は環境によって出ないので、自前で出す）
let confirmYes = null;
function askConfirm(msg, onYes) { $('confirmMsg').textContent = msg; confirmYes = onYes; $('confirm').hidden = false; }
$('confirmNo').addEventListener('click', () => { $('confirm').hidden = true; confirmYes = null; });
$('confirmYes').addEventListener('click', () => { $('confirm').hidden = true; const f = confirmYes; confirmYes = null; if (f) f(); });

// ---- 描画 ----
function groundColor(b, r) {
  const t = clamp((r - SKY) / 40, 0, 1);
  const a = b.mat === 'stone' ? [128, 120, 110] : [168, 118, 64];
  const z = b.mat === 'stone' ? [80, 76, 72] : [84, 54, 32];
  return `rgb(${a.map((v, i) => Math.round(v + (z[i] - v) * t)).join(',')})`;
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, cw, ch);
  const cell = cp;
  const r0 = Math.floor(cam.y) - 1, r1 = Math.ceil(cam.y + ch / cp) + 1;
  ctx.save();
  ctx.translate(offX - cam.x * cp, -cam.y * cp);
  const W = COLS * cell;
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(0, -3 * cell, W, (SKY + 3) * cell);          // 空
  const g0 = Math.max(SKY, r0);
  ctx.fillStyle = '#2a2018'; ctx.fillRect(0, g0 * cell, W, (r1 - g0 + 1) * cell);     // 掘った跡

  // 地形レイヤー（見えている行だけ）
  const digSet = tool === 'dig' ? diggable() : null;
  for (let r = g0; r <= r1; r++) {
    const a = row(r);
    for (let c = 0; c < COLS; c++) {
      const b = a[c]; if (!b) continue;
      const x = c * cell, y = r * cell;
      ctx.fillStyle = groundColor(b, r); ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (b.left < b.yieldN || b.p > 0) {  // 残りゲージ
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + 3, y + cell - 6, cell - 6, 3);
        ctx.fillStyle = '#ffe08a'; ctx.fillRect(x + 3, y + cell - 6, (cell - 6) * (b.left - b.p / b.h) / b.yieldN, 3);
      }
      if (digSet && !digSet.has(key(c, r))) hatch(x, y, cell);   // 掘削中：掘れない所に薄い斜線
    }
  }
  ctx.fillStyle = '#5e8f3a'; ctx.fillRect(0, SKY * cell - 2, W, 2);           // 地面の線
  // 深さの目盛り（5mごと）
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `${Math.max(9, Math.round(cell * 0.3))}px sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let r = g0; r <= r1; r++) if (r > SKY && (r - SKY) % 5 === 0) ctx.fillText(tx().depthM(r - SKY), 2, r * cell + 2);

  // コンベア・仕分け・機械
  for (const [k, s] of S.st) {
    const c = cOf(k), r = rOf(k);
    if (r < r0 || r > r1 || s.type === 'drill') continue;
    const x = c * cell, y = r * cell;
    if (s.type === 'machine') { drawMachine(x, y, s); drawLevel(x, y, s.lv); continue; }
    ctx.fillStyle = s.type === 'sort' ? '#3f5560' : '#50545c';
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeStyle = s.type === 'sort' ? '#6fa3b5' : '#6a6f79'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    drawBelt(x, y, s);
    glyph(ARROW[s.dir], x, y, '#cfd3da', 0.45);
    if (s.type === 'sort') {
      const sd = s.side === 'left' ? CCW[s.dir] : CW[s.dir];
      const [sx, sy] = DIRS[sd];
      drawItemShape({ k: s.filter }, x + cell / 2 + sx * cell * 0.3, y + cell / 2 + sy * cell * 0.3, 0.7);
    }
    drawLevel(x, y, s.lv);
  }

  drawYard();
  drawTruck();

  // 資源レイヤー（別レイヤー・自由な位置）
  for (const it of S.items) {
    if (it.y < r0 || it.y > r1 + 1) continue;
    drawItemShape(it, it.x * cell, it.y * cell, 1);
  }

  // ドリルは資源の上に描く（溜まった資源に埋もれないように）
  for (const [k, s] of S.st) {
    if (s.type !== 'drill') continue;
    const c = cOf(k), r = rOf(k);
    if (r < r0 || r > r1) continue;
    const shaking = S.time - s.hit < 0.12;                  // 掘る瞬間だけ小さく揺れる（光らせない）
    const j = shaking ? (Math.random() < 0.5 ? -1 : 1) : 0;
    drawDrill(c * cell + j, r * cell, s);
    drawLevel(c * cell, r * cell, s.lv);
  }

  // メニューを開いている物の枠
  const p = popCell();
  if (p) {
    const isT = popTarget === 'truck';
    ctx.strokeStyle = '#5a95ee'; ctx.lineWidth = 2;
    ctx.strokeRect((isT ? BED : p.c) * cell + 1, p.r * cell + 1, cell * (isT ? 2 : 1) - 2, cell - 2);
  }
  // マウス位置（掘削のときは費用も）
  if (hover && inB(hover.c, hover.r) && tool !== 'pan' && tool !== 'none') {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(hover.c * cell + 1, hover.r * cell + 1, cell - 2, cell - 2);
    if (tool === 'dig' && digSet && digSet.has(key(hover.c, hover.r))) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(cell * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(digCost(blk(hover.c, hover.r)), hover.c * cell + cell / 2, hover.r * cell + cell / 2);
    }
  }
  // 浮き文字（売上は黄色、費用は赤）
  const now = performance.now();
  S.pops = S.pops.filter(q => now - q.t0 < 1800);
  for (const q of S.pops) {
    const a = 1 - (now - q.t0) / 1800;
    ctx.globalAlpha = Math.min(1, a * 1.5);
    ctx.fillStyle = q.kind === 'cost' ? '#ff9b8a' : '#fff36b';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.font = `bold ${Math.round(cell * (q.kind === 'sale' ? 0.55 : 0.42))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const yy = (q.wy - (1 - a) * 1.2) * cell;
    ctx.strokeText(q.text, q.wx * cell, yy); ctx.fillText(q.text, q.wx * cell, yy);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function hatch(x, y, cell) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, cell, cell); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(5, cell / 4);
  for (let d = -cell; d < cell; d += step) { ctx.moveTo(x + d, y + cell); ctx.lineTo(x + d + cell, y); }
  ctx.stroke();
  ctx.restore();
}
// レベルの見た目：左上に黄色い点（レベル2で1つ、3で2つ…）
function drawLevel(x, y, lv) {
  if (!lv) return;
  const cell = cp, r = Math.max(1.5, cell * 0.055);
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
  for (let i = 0; i < lv; i++) {
    ctx.beginPath(); ctx.arc(x + cell * 0.14 + i * r * 2.6, y + cell * 0.14, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

// 資源の形（種類ごと）
function drawItemShape(it, x, y, scale) {
  const def = ITEMS[it.k], cell = cp * scale;
  const [f, s] = it.k === 'bag' && it.of ? [ITEMS[it.of].c[0], ITEMS.bag.c[1]] : def.c;
  ctx.fillStyle = f; ctx.strokeStyle = s; ctx.lineWidth = 1;
  ctx.beginPath();
  switch (def.s) {
    case 'small': ctx.arc(x, y, cell * 0.11, 0, Math.PI * 2); break;
    case 'rect': ctx.rect(x - cell * 0.16, y - cell * 0.09, cell * 0.32, cell * 0.18); break;
    case 'bar': ctx.moveTo(x - cell * 0.18, y + cell * 0.07); ctx.lineTo(x + cell * 0.18, y + cell * 0.07);
      ctx.lineTo(x + cell * 0.12, y - cell * 0.07); ctx.lineTo(x - cell * 0.12, y - cell * 0.07); ctx.closePath(); break;
    case 'square': ctx.rect(x - cell * 0.13, y - cell * 0.13, cell * 0.26, cell * 0.26); break;
    case 'gem': ctx.moveTo(x, y - cell * 0.17); ctx.lineTo(x + cell * 0.15, y - cell * 0.04); ctx.lineTo(x, y + cell * 0.17);
      ctx.lineTo(x - cell * 0.15, y - cell * 0.04); ctx.closePath(); break;
    case 'bag': ctx.moveTo(x - cell * 0.15, y + cell * 0.16); ctx.lineTo(x + cell * 0.15, y + cell * 0.16);
      ctx.lineTo(x + cell * 0.11, y - cell * 0.1); ctx.lineTo(x + cell * 0.04, y - cell * 0.16); ctx.lineTo(x - cell * 0.04, y - cell * 0.16);
      ctx.lineTo(x - cell * 0.11, y - cell * 0.1); ctx.closePath(); break;
    default: ctx.arc(x, y, cell * 0.15, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.stroke();
}

function drawBelt(x, y, s) {
  const [dx, dy] = DIRS[s.dir], cell = cp;
  const phase = (S.time * valOf(s)) % 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, cell - 4, cell - 4); ctx.clip();
  for (let i = -1; i < 3; i++) {
    const t = (i * 0.5 + phase) * cell;
    ctx.beginPath();
    if (dx) { const lx = x + (dx > 0 ? t : cell - t); ctx.moveTo(lx, y + 2); ctx.lineTo(lx, y + cell - 2); }
    else { const ly = y + (dy > 0 ? t : cell - t); ctx.moveTo(x + 2, ly); ctx.lineTo(x + cell - 2, ly); }
    ctx.stroke();
  }
  ctx.restore();
}
function glyph(ch, x, y, color, size) {
  ctx.fillStyle = color; ctx.font = `bold ${Math.round(cp * size)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + cp / 2, y + cp / 2 + 1);
}
function drawMachine(x, y, m) {
  const cell = cp;
  ctx.fillStyle = '#3b3550'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
  ctx.strokeStyle = '#8c7fc0'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
  glyph(tx().glyph[m.m], x, y + cell * 0.02, '#e6e0ff', 0.4);
  const [dx, dy] = DIRS[m.dir];
  const cx = x + cell / 2 + dx * cell * 0.38, cy = y + cell / 2 + dy * cell * 0.38;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = '#c9bfff'; ctx.beginPath(); ctx.moveTo(cell * 0.08, 0); ctx.lineTo(-cell * 0.05, -cell * 0.08); ctx.lineTo(-cell * 0.05, cell * 0.08); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (m.cur) {
    const def = MACHINES[m.m];
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + 4, y + cell - 7, cell - 8, 3);
    ctx.fillStyle = '#9fe0a0'; ctx.fillRect(x + 4, y + cell - 7, (cell - 8) * m.prog / def.time, 3);
  }
}
function drawDrill(x, y, s) {
  const cell = cp;
  ctx.save();
  ctx.translate(x + cell / 2, y + cell / 2);
  ctx.rotate(ANGLE[s.dir]);
  ctx.fillStyle = s.stuck ? '#7a6a6a' : '#d04a3a';
  ctx.fillRect(-cell * 0.3, -cell * 0.42, cell * 0.6, cell * 0.32);
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.moveTo(-cell * 0.35, -cell * 0.08); ctx.lineTo(cell * 0.35, -cell * 0.08); ctx.lineTo(0, cell * 0.48);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
// ヤード：地上に出た資源の山
function drawYard() {
  const cell = cp, x0 = YARD_C * cell, y = YARD_R * cell, n = S.yard.length;
  ctx.fillStyle = '#5b5e66'; ctx.fillRect(x0, SKY * cell - 3, (COLS - YARD_C) * cell, 3);   // 舗装
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 2, y + 2, cell * 2 - 4, cell - 4); ctx.setLineDash([]);
  const h = Math.min(0.75, 0.12 + n * 0.012);       // 多いほど高く積もる
  const show = Math.min(n, 60);
  for (let i = 0; i < show; i++) {
    const it = S.yard[i];
    const px = x0 + cell * (0.2 + it.rx * 1.6);
    const py = y + cell * (0.84 - it.ry * h * (1 - Math.abs(it.rx - 0.5)));
    drawItemShape(it, px, py, 0.85);
  }
  if (n > 0) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.font = `bold ${Math.round(cell * 0.3)}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.strokeText('×' + n, x0 + cell * 2 - 3, y + 2); ctx.fillText('×' + n, x0 + cell * 2 - 3, y + 2);
  }
}
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function drawTruck() {
  const cell = cp, t = S.truck, y = YARD_R * cell, bx = BED * cell;
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(bx + 2, y + 2, cell * 2 - 4, cell - 4); ctx.setLineDash([]);
  if (t.phase === 'away') return;
  // 出発：右へ走りながら薄くなる／帰還：右からやって来る（ゆっくり、点滅なし）
  let p = 0;
  if (t.phase === 'leaving') p = ease(t.t / ANIM_SEC);
  else if (t.phase === 'returning') p = 1 - ease(t.t / ANIM_SEC);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx - cell, y - cell, cell * 3 + 2, cell * 2.2); ctx.clip();
  ctx.globalAlpha = 1 - p * 0.9;
  ctx.translate(p * cell * 2.2, 0);
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(bx + 2, y + cell * 0.45, cell - 2, cell * 0.33);
  ctx.fillRect(bx + 2, y + cell * 0.2, cell * 0.1, cell * 0.3);
  const fill = t.load / valOf('truck');
  ctx.fillStyle = '#c8b07a';
  ctx.fillRect(bx + cell * 0.14, y + cell * 0.45 - cell * 0.28 * fill, (cell - 2) - cell * 0.14, cell * 0.28 * fill);
  const cx = bx + cell;
  ctx.fillStyle = '#e0e4ea'; ctx.fillRect(cx, y + cell * 0.2, cell * 0.8, cell * 0.58);
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(cx + cell * 0.4, y + cell * 0.28, cell * 0.3, cell * 0.2);
  ctx.fillStyle = '#222';
  for (const wx of [bx + cell * 0.35, cx + cell * 0.45]) { ctx.beginPath(); ctx.arc(wx, y + cell * 0.84, cell * 0.13, 0, Math.PI * 2); ctx.fill(); }
  drawLevel(cx, y + cell * 0.12, S.truck.lv);
  ctx.restore();
}

// ---- 画面の数字・ボタン ----
function updateUI() {
  const T = tx(), m = $('money');
  m.textContent = S.money; m.classList.toggle('neg', S.money < 0);
  const month = Math.floor(S.time / MONTH_SEC);
  $('date').textContent = T.date(Math.floor(month / 12) + 1, month % 12 + 1);
  $('playBtn').textContent = running ? T.pause : T.play;
  $('speedBtn').textContent = '×' + SPEEDS[speedIdx];
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  document.querySelectorAll('.dir').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
  $('dirBar').hidden = !(tool === 'conv' || tool === 'sort' || tool === 'machine');
  $('machBtnLabel').textContent = tool === 'machine' ? T.mach[machSel] : T.machine;
  // カーソル：移動のときは手のひら、つかんでいる間は握った手
  cv.classList.toggle('grab', tool === 'pan' && !(gesture && gesture.type === 'pan'));
  cv.classList.toggle('grabbing', !!(gesture && gesture.type === 'pan'));
  cv.classList.toggle('place', tool !== 'pan' && tool !== 'none');
  layoutFloats();
}
let msgTimer = 0;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 2000); }

function setupText() {
  const T = tx();
  document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
  document.title = T.title;
  document.querySelectorAll('[data-t]').forEach(el => { const v = T[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  $('ver').textContent = 'v' + VERSION;
  $('loanBtn').hidden = !TEST_LOAN;
  $('panBtn').title = T.pan;
  // 作者・支援（フッターの代わりに 遊び方／設定 の中に表示）
  document.querySelectorAll('.credit').forEach(el => {
    el.innerHTML = '';
    const who = document.createElement('span'); who.append(document.createTextNode(T.author + '：'));
    const a = document.createElement('a'); a.href = NOTE_URL; a.target = '_blank'; a.rel = 'noopener'; a.textContent = NOTE_URL.replace('https://', '');
    who.append(a);
    const k = document.createElement('a'); k.href = 'https://ko-fi.com/kinomeno'; k.target = '_blank'; k.rel = 'noopener'; k.textContent = T.kofi;
    const n = document.createElement('a'); n.href = NOTE_URL; n.target = '_blank'; n.rel = 'noopener'; n.textContent = T.tip;
    el.append(who, k, n);
  });
  for (const id of PANELS) if (!$(id).hidden) renderPanel(id);
  updateUI();
}

// ---- 入力 ----
const ptrs = new Map();
let gesture = null, down = false, lastK = -1;
function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function cellAtXY(x, y) { return { c: Math.floor((x - offX) / cp + cam.x), r: Math.floor(y / cp + cam.y) }; }
function tapAt(p) {
  // 置いた物・トラックをタップ → メニュー
  if (p.r === YARD_R && (p.c === BED || p.c === CAB)) { openPop('truck'); return true; }
  const s = inB(p.c, p.r) && S.st.get(key(p.c, p.r));
  if (s && tool !== 'remove') { openPop(s); return true; }
  return false;
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  const q = local(e);
  ptrs.set(e.pointerId, q);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 指の情報が無い環境 */ }
  if (ptrs.size === 2) {        // 2本指：拡大縮小と移動
    down = false;
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z,
      wc: (mx - offX) / cp + cam.x, wr: my / cp + cam.y };
    return;
  }
  if (ptrs.size > 2) return;
  const hadPop = !!popTarget || PANELS.some(id => !$(id).hidden);
  closePop(); closePanels();
  if (tool === 'pan' || e.button === 1 || e.button === 2) {
    gesture = { type: 'pan', sx: q.x, sy: q.y, cx: cam.x, cy: cam.y, moved: false, hadPop };
    return;
  }
  const p = cellAtXY(q.x, q.y);
  if (tool !== 'dig' && tapAt(p)) return;
  if (hadPop) return;                                   // メニューを閉じるだけのタップ
  down = true; lastK = key(p.c, p.r); apply(p.c, p.r, false); updateUI();
});
cv.addEventListener('pointermove', e => {
  const q = local(e);
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, q);
  hover = cellAtXY(q.x, q.y);
  if (gesture && gesture.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.z = gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0;
    metrics();
    if (COLS * cp > cw) cam.x = gesture.wc - (mx - offX) / cp;
    cam.y = gesture.wr - my / cp;
    metrics();
    return;
  }
  if (gesture && gesture.type === 'pan') {
    if (Math.abs(q.x - gesture.sx) + Math.abs(q.y - gesture.sy) > 6) gesture.moved = true;
    cam.x = gesture.cx - (q.x - gesture.sx) / cp;
    cam.y = gesture.cy - (q.y - gesture.sy) / cp;
    metrics();
    return;
  }
  if (!down) return;
  const k = key(hover.c, hover.r);
  if (k !== lastK) { lastK = k; apply(hover.c, hover.r, true); updateUI(); }
});
function endPtr(e) {
  const q = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (gesture && gesture.type === 'pan' && !gesture.moved && e.button === 0 && q && !gesture.hadPop) tapAt(cellAtXY(q.x, q.y));
  if (ptrs.size === 0) gesture = null;
  else if (gesture && gesture.type === 'pinch') gesture = null;
  down = false;
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const q = local(e);
  if (e.ctrlKey) zoomAt(q.x, q.y, Math.exp(-e.deltaY * 0.002));
  else { cam.y += e.deltaY / cp; cam.x += e.deltaX / cp; metrics(); }
}, { passive: false });

// ▲▼◀▶ボタン：押している間なめらかに動く
const moveHeld = new Set();
document.querySelectorAll('.mv').forEach(b => {
  const d = b.dataset.mv;
  const start = e => { e.preventDefault(); moveHeld.add(d); try { b.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ } };
  const stop = () => moveHeld.delete(d);
  b.addEventListener('pointerdown', start);
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointercancel', stop);
  b.addEventListener('pointerleave', stop);
});
function applyMove(dt) {
  if (!moveHeld.size) return;
  const sp = 8 * dt;       // マス/秒
  for (const d of moveHeld) { const [dx, dy] = DIRS[d]; cam.x += dx * sp; cam.y += dy * sp; }
  metrics();
}

document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.tool === 'machine' && tool !== 'machine') { togglePanel('machList'); return; }
  tool = tool === b.dataset.tool ? 'none' : b.dataset.tool;   // もう一度押すと解除（通常モード）
  closePop(); closePanels(); updateUI();
}));
document.querySelectorAll('.dir').forEach(b => b.addEventListener('click', () => { dir = b.dataset.dir; updateUI(); }));
$('playBtn').addEventListener('click', () => { running = !running; updateUI(); });
$('speedBtn').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; updateUI(); });
$('zoomIn').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 0.8));
$('topBtn').addEventListener('click', () => { cam.y = -0.3; metrics(); });
$('powerBtn').addEventListener('click', () => togglePanel('powerPanel'));
$('helpBtn').addEventListener('click', () => togglePanel('help'));
$('setBtn').addEventListener('click', () => togglePanel('settings'));
$('resetBtn').addEventListener('click', () => askConfirm(tx().confirmReset, () => {
  closePop(); closePanels(); newGame(); updateUI();
}));
$('loanBtn').addEventListener('click', () => { S.money += 1000; updateUI(); });   // テスト用
window.addEventListener('keydown', e => {
  if (!$('confirm').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); running = !running; }
  else if (e.key === 'r' || e.key === 'R') dir = ROT[(ROT.indexOf(dir) + 1) % 4];
  else if (e.key === '0') tool = tool === 'pan' ? 'none' : 'pan';
  else if (e.key === '1') tool = 'drill';
  else if (e.key === '2') tool = 'conv';
  else if (e.key === '3') tool = 'sort';
  else if (e.key === '4') tool = 'remove';
  else if (e.key === '5') tool = 'dig';
  else if (e.key === 'Escape') { if (!popTarget && PANELS.every(id => $(id).hidden)) tool = 'none'; closePop(); closePanels(); }
  else return;
  updateUI();
});
window.addEventListener('resize', resize);

// ---- ループ ----
let last = performance.now(), panelTick = 0;
function frame(now) {
  const dt = Math.min(now - last, 250) / 1000; last = now;
  if (running) sim(dt * SPEEDS[speedIdx]);
  applyMove(dt);
  updateUI();
  if ((panelTick = (panelTick + 1) % 15) === 0) {
    if (!$('powerPanel').hidden) renderPanel('powerPanel');   // 資金に合わせて買えるか更新
    if (popTarget) updatePop();
  }
  metrics();
  placePop();
  draw();
  requestAnimationFrame(frame);
}

newGame();
setupText();
resize();
resetCam();
window.__game = { // 動作確認用
  get S() { return S; }, sim, apply, levelUp, levelUpAll, departNow, cam, diggable,
  setTool: t => { tool = t; }, setMach: m => { machSel = m; tool = 'machine'; }, setDir: d => { dir = d; },
  pause: () => { running = false; },
};
requestAnimationFrame(frame);
})();
