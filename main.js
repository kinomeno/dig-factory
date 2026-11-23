// 採掘ゲーム v0.03
// 画面をマス目に割り、地形・設備を描く。資源だけは別レイヤーで、マスに縛られず自由に動く。
(() => {
'use strict';

const VERSION = '0.03';
const NOTE_URL = 'https://note.com/kinomeno/xxxxxxx'; // 紹介記事ができたら差し替え

// ---- 盤面の設定 ----
const COLS = 24, ROWS = 17;
const SKY = 4;                    // 上から4行が空（地上）
const YARD_R = SKY - 1;           // トラックヤードの行（地面のすぐ上）
const BEDROCK_FROM = ROWS - 2;    // 下2行は掘れない岩盤
const BAYS = [18, 20, 22];        // 駐車場（荷台の列。運転席はその右）
const COST = { drill: 50, conv: 5, sort: 20 };
const START_MONEY = 400;
const DRILL_HIT_SEC = 0.6;        // ドリルが1回削る間隔（秒）
const HITS_PER_ORE = 2;           // 2回削ると資源が1個出る（土が硬い）
const ITEM_SPEED = 1.5;           // コンベア上の資源の速さ（マス/秒）
const SUB_SEC = 0.02;             // 計算の刻み（秒）
const LOAD_RATE = 8;              // トラックに積む速さ（個/秒）
const ANIM_SEC = 1.4;             // 出発・帰還アニメの長さ
const AWAY_SEC = 4;               // 出かけている時間
const yieldForRow = r => 6 + 2 * Math.floor((r - SKY) / 2); // 1マスから出る資源の数（深いほど多い）

const KINDS = ['soil', 'iron', 'gold'];
const TRUCKS = {
  soil: { cost: 100, cap: 20, price: -1 },  // 土は処分にお金がかかる
  iron: { cost: 150, cap: 10, price: 8 },
  gold: { cost: 300, cap: 5, price: 25 },
};
const ITEM_COLOR = { soil: ['#b08456', '#5e4026'], iron: ['#aeb8c6', '#4c5664'], gold: ['#ffd34d', '#7a5a00'] };
const TRUCK_COLOR = { soil: '#8a6239', iron: '#5d6f86', gold: '#c9a227' };

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CCW = { right: 'up', up: 'left', left: 'down', down: 'right' }; // 進む向きから見て左
const CW = { right: 'down', down: 'left', left: 'up', up: 'right' };  // 進む向きから見て右
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const ROT = ['right', 'down', 'left', 'up'];
const ANGLE = { down: 0, left: Math.PI / 2, up: Math.PI, right: -Math.PI / 2 };
const SPEEDS = [1, 2, 4];

// ---- 言語（日本語以外は英語） ----
const LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
const TXT = {
  ja: {
    title: '採掘ゲーム', money: '資金',
    drill: 'ドリル', conv: 'コンベア', sort: '仕分け', remove: '撤去',
    play: '▶︎ 再生', pause: '❚❚ 停止', reset: '最初から', shop: 'ショップ', help: '遊び方',
    confirmReset: '最初からやり直しますか？',
    noMoney: '資金が足りません', noBay: '駐車場に空きがありません', cantPlace: 'ここには置けません',
    drillDir: 'ドリルの向き', convDir: 'コンベアの向き', sortTitle: '仕分けコンベア',
    filter: '選ぶ資源', side: '出す側', left: '左', right: '右',
    sell: '売る（半額）', shopTitle: 'トラックを買う', free: '空き駐車場', buy: '買う',
    cap: '積める数', each: '1個', parkHint: '空いている駐車場に止まります',
    kind: { soil: '土', iron: '鉄', gold: '金' },
    truckName: { soil: '土用ダンプ', iron: '鉄用ダンプ', gold: '金用ダンプ' },
    sortInfo: '選んだ資源だけを横に出します。他はまっすぐ進みます。',
    helpList: [
      'ドリルを空いたマスに置くと下へ掘ります。タップで向きを変えられます。',
      '掘った資源はドリルの後ろのマスに出ます。コンベアが無ければそこに溜まります。',
      '資源は 土・鉄・金。コンベアで右上のトラックヤードへ運びましょう。',
      '仕分けコンベアは、選んだ資源だけを左か右に出します。',
      'ダンプは自分の種類の資源だけを積みます。満杯で出発すると売上になります。土は処分にお金がかかります。',
      'トラックがいない駐車場には、資源が山積みになります。トラックはショップで買えます。',
    ],
    keys: 'Space：再生/停止　R：向きを回す　1〜4：道具　Esc：メニューを閉じる',
    author: 'キノメノ', kofi: '☞ko-fiで支援', tip: '☞noteでチップ',
  },
  en: {
    title: 'Mining Game', money: 'Money',
    drill: 'Drill', conv: 'Conveyor', sort: 'Sorter', remove: 'Remove',
    play: '▶︎ Play', pause: '❚❚ Pause', reset: 'Restart', shop: 'Shop', help: 'How to play',
    confirmReset: 'Start over from the beginning?',
    noMoney: 'Not enough money', noBay: 'No free parking spot', cantPlace: 'Cannot place here',
    drillDir: 'Drill direction', convDir: 'Conveyor direction', sortTitle: 'Sorting conveyor',
    filter: 'Picks', side: 'Out to', left: 'Left', right: 'Right',
    sell: 'Sell (half price)', shopTitle: 'Buy trucks', free: 'Free parking', buy: 'Buy',
    cap: 'Capacity', each: 'Each', parkHint: 'Parks in a free spot',
    kind: { soil: 'Dirt', iron: 'Iron', gold: 'Gold' },
    truckName: { soil: 'Dirt dump truck', iron: 'Iron dump truck', gold: 'Gold dump truck' },
    sortInfo: 'Sends the chosen ore out to the side. Everything else goes straight.',
    helpList: [
      'Place a drill on an empty cell and it digs down. Tap it to change direction.',
      'Mined ore comes out into the cell behind the drill and piles up there if there is no conveyor.',
      'Ores are dirt, iron and gold. Carry them with conveyors to the truck yard at the top right.',
      'A sorting conveyor sends only the chosen ore out to its left or right.',
      'Each dump truck only loads its own ore. When full it leaves and you get paid. Dumping dirt costs money.',
      'Ore piles up on a parking spot with no truck. Buy trucks in the shop.',
    ],
    keys: 'Space: play/pause   R: rotate   1-4: tools   Esc: close menu',
    author: 'Kinomeno', kofi: '☞Support on Ko-fi', tip: '☞Tip on note',
  },
}[LANG];

// ---- 状態 ----
let S;
const key = (c, r) => r * COLS + c;
const inB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const rand = (a, b) => a + Math.random() * (b - a);
const isBelt = s => !!s && (s.type === 'conv' || s.type === 'sort');
const isYard = (c, r) => r === YARD_R && c >= BAYS[0] && c <= BAYS[BAYS.length - 1] + 1;
const bayAtBed = (c, r) => (r === YARD_R ? S.bays.find(b => b.bed === c) : null) || null;
const bayAt = (c, r) => (r === YARD_R ? S.bays.find(b => c === b.bed || c === b.bed + 1) : null) || null;

function makeBlock(r) {
  if (r >= BEDROCK_FROM) return { bedrock: true };
  const d = r - SKY, x = Math.random();
  const goldP = d >= 4 ? 0.03 + 0.02 * (d - 4) : 0;
  const ironP = 0.18 + 0.03 * d;
  const kind = x < goldP ? 'gold' : x < goldP + ironP ? 'iron' : 'soil';
  const max = yieldForRow(r) * HITS_PER_ORE;
  const specks = kind === 'soil' ? [] : Array.from({ length: 4 }, () => [rand(0.15, 0.85), rand(0.15, 0.7)]);
  return { kind, hp: max, max, specks };
}
// その■から出てくる資源の種類
function oreFrom(kind) {
  const x = Math.random();
  if (kind === 'iron') return x < 0.5 ? 'iron' : 'soil';
  if (kind === 'gold') return x < 0.35 ? 'gold' : x < 0.5 ? 'iron' : 'soil';
  return 'soil';
}

function newGame() {
  const ground = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push(r < SKY ? null : makeBlock(r));
    ground.push(row);
  }
  S = {
    ground,
    st: new Map(),      // 設備：key -> {type:'drill'|'conv'|'sort', dir, ...}
    items: [],          // 資源レイヤー：{k, x, y, lane, spd, ox, oy, tk}
    money: START_MONEY,
    bays: BAYS.map(bed => ({ bed, type: null, load: 0, phase: 'here', t: 0, acc: 0 })),
    time: 0,
    pops: [],
  };
  S.bays[0].type = 'iron';  // 最初は鉄用ダンプが1台
}

// 設備を置けるマス
const isOpen = (c, r) => inB(c, r) && S.ground[r][c] === null && !S.st.has(key(c, r)) && !isYard(c, r);
// 動いている資源が入っていけるマス：コンベア／仕分け、または駐車場の荷台
function canEnter(c, r) {
  if (!inB(c, r) || S.ground[r][c] !== null) return false;
  const s = S.st.get(key(c, r));
  if (isBelt(s)) return true;
  return !s && !!bayAtBed(c, r);
}
// ドリルが資源を出せるマス（空いたマス・コンベア・荷台）
function canPile(c, r) {
  if (!inB(c, r) || S.ground[r][c] !== null) return false;
  if (isYard(c, r) && !bayAtBed(c, r)) return false;
  const s = S.st.get(key(c, r));
  return !s || isBelt(s);
}

// 資源を1個つくる（マスの中で少しばらけた位置に）
function spawnItem(k, x, y) {
  const it = {
    k, x: x + rand(-0.15, 0.15), y: y + rand(-0.15, 0.15),
    lane: rand(-0.22, 0.22),        // コンベア上で横にずれる量（整列させない）
    spd: rand(0.8, 1.2),            // 1個ずつ少し速さが違う
    ox: rand(-0.28, 0.28), oy: rand(-0.28, 0.28), // 溜まるときの位置
    tk: -1,                          // 仕分けで曲がり始めたマス
  };
  S.items.push(it);
  return it;
}

// ---- 時間を進める ----
function sim(sec) {
  while (sec > 1e-9) {
    const dt = Math.min(SUB_SEC, sec);
    sec -= dt;
    S.time += dt;
    updateItems(dt);
    updateDrills(dt);
    updateTrucks(dt);
  }
}

function approach(v, target, d) { return Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d; }

function updateItems(dt) {
  for (const it of S.items) {
    const c = Math.floor(it.x), r = Math.floor(it.y), k = key(c, r);
    const s = S.st.get(k);
    const v = ITEM_SPEED * it.spd * dt;
    if (!isBelt(s)) {
      // コンベアの外：その場に溜まる（勝手に隣へは行かない）
      it.x = approach(it.x, c + 0.5 + it.ox, v * 0.5);
      it.y = approach(it.y, r + 0.5 + it.oy, v * 0.5);
      continue;
    }
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
    if ((nc === c && nr === r) || canEnter(nc, nr)) { it.x = nx; it.y = ny; continue; }
    // 行き止まり：コンベアの端で止まる（溜まる）
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

function moveDrill(k, s, nk) { S.st.delete(k); S.st.set(nk, s); }

function drillHit(k, s) {
  const c = k % COLS, r = (k - c) / COLS;
  const [dx, dy] = DIRS[s.dir];
  const tc = c + dx, tr = r + dy;
  s.blocked = false;
  if (!inB(tc, tr)) { s.stuck = true; return; }
  const g = S.ground[tr][tc];
  if (g === null) {
    // 下向きで下が空洞なら落ちる。それ以外は空振りで止まる
    if (s.dir === 'down' && !S.st.has(key(tc, tr)) && !isYard(tc, tr)) { s.stuck = false; moveDrill(k, s, key(tc, tr)); }
    else s.stuck = true;
    return;
  }
  if (g.bedrock) { s.stuck = true; return; }
  s.stuck = false;
  const emits = (g.max - g.hp + 1) % HITS_PER_ORE === 0;
  const [bx, by] = DIRS[OPP[s.dir]];
  const bc = c + bx, br = r + by;
  if (emits && !canPile(bc, br)) { s.blocked = true; return; } // 後ろに出せないときは待つ
  g.hp--; s.hit = S.time;
  if (emits) {
    // 資源はドリルの後ろのマスにだけ出る
    const it = spawnItem(oreFrom(g.kind), c + 0.5 + bx * 0.75, r + 0.5 + by * 0.75);
    it.x = Math.min(Math.max(it.x, bc + 0.04), bc + 0.96);
    it.y = Math.min(Math.max(it.y, br + 0.04), br + 0.96);
  }
  if (g.hp <= 0) { S.ground[tr][tc] = null; moveDrill(k, s, key(tc, tr)); } // 消えた■の位置へ移動
}

function updateTrucks(dt) {
  for (const b of S.bays) {
    if (!b.type) continue;
    const T = TRUCKS[b.type];
    if (b.phase === 'here') {
      // 荷台のマスにある、自分の種類の資源を積む
      if (b.load < T.cap) {
        b.acc += dt * LOAD_RATE;
        while (b.acc >= 1 && b.load < T.cap) {
          const i = S.items.findIndex(it => it.k === b.type && Math.floor(it.x) === b.bed && Math.floor(it.y) === YARD_R);
          if (i < 0) { b.acc = 0; break; }
          S.items.splice(i, 1); b.load++; b.acc--;
        }
      }
      if (b.load >= T.cap) { b.phase = 'leaving'; b.t = 0; }
      continue;
    }
    b.t += dt;
    if (b.phase === 'leaving' && b.t >= ANIM_SEC) {
      const earn = b.load * T.price;
      S.money += earn;
      S.pops.push({ text: (earn >= 0 ? '+' : '') + earn, neg: earn < 0, bed: b.bed, t0: performance.now() });
      b.load = 0; b.phase = 'away'; b.t = 0;
    } else if (b.phase === 'away' && b.t >= AWAY_SEC) { b.phase = 'returning'; b.t = 0; }
    else if (b.phase === 'returning' && b.t >= ANIM_SEC) { b.phase = 'here'; b.t = 0; }
  }
}

// ---- 設置・購入 ----
let tool = 'conv', dir = 'right', running = true, speedIdx = 0;

function apply(c, r, dragging) {
  if (!inB(c, r)) return;
  const k = key(c, r), s = S.st.get(k);
  if (tool === 'remove') { if (s) removeAt(k); return; }
  if (s) return;
  if (dragging && tool !== 'conv') return;
  if (!isOpen(c, r)) { if (!dragging) say(TXT.cantPlace); return; }
  if (S.money < COST[tool]) { if (!dragging) say(TXT.noMoney); return; }
  S.money -= COST[tool];
  if (tool === 'drill') S.st.set(k, { type: 'drill', dir: 'down', t: 0, hit: -99 });
  else if (tool === 'sort') S.st.set(k, { type: 'sort', dir, filter: 'iron', side: 'left' });
  else S.st.set(k, { type: 'conv', dir });
}

function removeAt(k) {
  const s = S.st.get(k); if (!s) return;
  S.money += Math.floor(COST[s.type] / 2);
  S.st.delete(k);                          // 乗っていた資源はその場に残る
}

function buyTruck(type) {
  const b = S.bays.find(x => !x.type);
  if (!b) { say(TXT.noBay); return false; }
  if (S.money < TRUCKS[type].cost) { say(TXT.noMoney); return false; }
  S.money -= TRUCKS[type].cost;
  Object.assign(b, { type, load: 0, phase: 'returning', t: 0, acc: 0 }); // 走ってやって来る
  return true;
}

function sellTruck(b) {
  if (!b.type) return;
  S.money += Math.floor(TRUCKS[b.type].cost / 2);
  Object.assign(b, { type: null, load: 0, phase: 'here', t: 0 });
}

// ---- タップメニュー ----
const $ = id => document.getElementById(id);
let popTarget = null;   // 設備 or 駐車場
function findKey(s) { for (const [k, v] of S.st) if (v === s) return k; return -1; }
function popCell() {
  if (!popTarget) return null;
  if (popTarget.bed !== undefined) return { c: popTarget.bed + 0.5, r: YARD_R };
  const k = findKey(popTarget);
  if (k < 0) return null;
  return { c: k % COLS, r: Math.floor(k / COLS) };
}

function openPop(t) {
  popTarget = t;
  const isBay = t.bed !== undefined;
  $('popTitle').textContent = isBay ? TXT.truckName[t.type]
    : t.type === 'drill' ? TXT.drillDir : t.type === 'sort' ? TXT.sortTitle : TXT.convDir;
  $('popDirs').hidden = isBay;
  $('popFilterRow').hidden = $('popSideRow').hidden = !(t.type === 'sort' && !isBay);
  $('popInfo').hidden = !(isBay || t.type === 'sort');
  $('popInfo').textContent = isBay
    ? `${TXT.cap} ${TRUCKS[t.type].cap}・${TXT.each} ${TRUCKS[t.type].price}`
    : TXT.sortInfo;
  $('popRemove').textContent = isBay ? TXT.sell : TXT.remove;
  $('pop').hidden = false;
  placePop(); updatePop();
}
function closePop() { popTarget = null; $('pop').hidden = true; }
function placePop() {
  if (!popTarget) return;
  const p = popCell();
  if (!p) { closePop(); return; }
  const pop = $('pop');
  let x = gox + (p.c + 0.5) * cell - pop.offsetWidth / 2;
  let y = goy + (p.r + 1) * cell + 6;
  if (y + pop.offsetHeight > window.innerHeight - 8) y = goy + p.r * cell - pop.offsetHeight - 6;
  x = Math.max(8, Math.min(x, window.innerWidth - pop.offsetWidth - 8));
  pop.style.left = x + 'px'; pop.style.top = Math.max(8, y) + 'px';
}
function updatePop() {
  if (!popTarget) return;
  document.querySelectorAll('#pop [data-pdir]').forEach(b => b.classList.toggle('active', b.dataset.pdir === popTarget.dir));
  document.querySelectorAll('#pop [data-pf]').forEach(b => b.classList.toggle('active', b.dataset.pf === popTarget.filter));
  document.querySelectorAll('#pop [data-ps]').forEach(b => b.classList.toggle('active', b.dataset.ps === popTarget.side));
}
document.querySelectorAll('#pop [data-pdir]').forEach(b => b.addEventListener('click', () => {
  if (!popTarget) return; popTarget.dir = b.dataset.pdir; popTarget.stuck = false; updatePop();
}));
document.querySelectorAll('#pop [data-pf]').forEach(b => {
  b.textContent = TXT.kind[b.dataset.pf];
  b.addEventListener('click', () => { if (popTarget) { popTarget.filter = b.dataset.pf; updatePop(); } });
});
document.querySelectorAll('#pop [data-ps]').forEach(b => b.addEventListener('click', () => {
  if (popTarget) { popTarget.side = b.dataset.ps; updatePop(); }
}));
$('popRemove').addEventListener('click', () => {
  if (!popTarget) return;
  if (popTarget.bed !== undefined) sellTruck(popTarget);
  else { const k = findKey(popTarget); if (k >= 0) removeAt(k); }
  closePop(); updateUI();
});
$('popClose').addEventListener('click', closePop);

// ---- ショップ・遊び方 ----
function renderShop() {
  const free = S.bays.filter(b => !b.type).length;
  $('shopFree').textContent = `${TXT.free} ${free}/${S.bays.length}　${TXT.parkHint}`;
  const list = $('shopList');
  list.innerHTML = '';
  for (const t of KINDS) {
    const T = TRUCKS[t];
    const row = document.createElement('div'); row.className = 'shopItem';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = TXT.truckName[t];
    const spec = document.createElement('div'); spec.className = 'spec';
    spec.textContent = `${TXT.cap} ${T.cap}・${TXT.each} ${T.price > 0 ? '+' : ''}${T.price}`;
    const btn = document.createElement('button');
    btn.innerHTML = `${TXT.buy} <small>${T.cost}</small>`;
    btn.disabled = !free || S.money < T.cost;
    btn.addEventListener('click', () => { if (buyTruck(t)) { renderShop(); updateUI(); } });
    row.append(name, spec, btn); list.append(row);
  }
}
function togglePanel(id, show) {
  const el = $(id);
  const on = show ?? el.hidden;
  ['help', 'shop'].forEach(x => { $(x).hidden = true; });
  el.hidden = !on;
  if (on && id === 'shop') renderShop();
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));

// ---- 描画 ----
const cv = $('cv');
const ctx = cv.getContext('2d');
let cell = 32, gox = 0, goy = 0, hover = null;

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  cell = Math.max(12, Math.floor(Math.min(W / COLS, H / ROWS)));
  gox = Math.floor((W - cell * COLS) / 2);
  goy = Math.floor((H - cell * ROWS) / 2);
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  placePop();
}

function groundColor(r) {
  const t = (r - SKY) / (BEDROCK_FROM - 1 - SKY);
  const a = [168, 118, 64], b = [92, 60, 34];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.translate(gox, goy);
  const W = cell * COLS, H = cell * ROWS;
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(0, 0, W, SKY * cell);              // 空
  ctx.fillStyle = '#2a2018'; ctx.fillRect(0, SKY * cell, W, H - SKY * cell); // 掘った跡

  // 地形レイヤー
  for (let r = SKY; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const g = S.ground[r][c]; if (!g) continue;
    const x = c * cell, y = r * cell;
    if (g.bedrock) {
      ctx.fillStyle = '#4a4a50'; ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y); ctx.stroke();
      continue;
    }
    ctx.fillStyle = groundColor(r); ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    if (g.specks.length) {          // 鉄・金を含む■は粒が見える
      ctx.fillStyle = ITEM_COLOR[g.kind][0];
      for (const [sx, sy] of g.specks) { ctx.fillRect(x + sx * cell - 1.5, y + sy * cell - 1.5, 3, 3); }
    }
    if (g.hp < g.max) {  // 耐久度ゲージ
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + 3, y + cell - 6, cell - 6, 3);
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(x + 3, y + cell - 6, (cell - 6) * g.hp / g.max, 3);
    }
  }
  ctx.fillStyle = '#5e8f3a'; ctx.fillRect(0, SKY * cell - 2, W, 2);         // 地面の線
  // トラックヤードの舗装
  ctx.fillStyle = '#5b5e66'; ctx.fillRect(BAYS[0] * cell, SKY * cell - 3, (BAYS[BAYS.length - 1] + 2 - BAYS[0]) * cell, 3);

  // コンベア・仕分け
  for (const [k, s] of S.st) {
    if (!isBelt(s)) continue;
    const c = k % COLS, r = (k - c) / COLS, x = c * cell, y = r * cell;
    ctx.fillStyle = s.type === 'sort' ? '#3f5560' : '#50545c';
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeStyle = s.type === 'sort' ? '#6fa3b5' : '#6a6f79'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    drawBelt(x, y, s.dir);
    glyph(ARROW[s.dir], x, y, '#cfd3da', 0.45);
    if (s.type === 'sort') {
      // 選ぶ資源の色の印と、出す側の小さな矢印
      const sd = s.side === 'left' ? CCW[s.dir] : CW[s.dir];
      const [sx, sy] = DIRS[sd];
      ctx.fillStyle = ITEM_COLOR[s.filter][0]; ctx.strokeStyle = ITEM_COLOR[s.filter][1];
      ctx.beginPath(); ctx.arc(x + cell / 2 + sx * cell * 0.3, y + cell / 2 + sy * cell * 0.3, cell * 0.11, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  for (const b of S.bays) drawBay(b);

  // 資源レイヤー（別レイヤー・自由な位置）
  const rad = cell * 0.16;
  ctx.lineWidth = 1;
  for (const it of S.items) {
    const [f, s] = ITEM_COLOR[it.k];
    ctx.fillStyle = f; ctx.strokeStyle = s;
    ctx.beginPath(); ctx.arc(it.x * cell, it.y * cell, rad, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  // ドリルは資源の上に描く（溜まった資源に埋もれないように）
  for (const [k, s] of S.st) {
    if (s.type !== 'drill') continue;
    const c = k % COLS, r = (k - c) / COLS;
    const shaking = S.time - s.hit < 0.12;                  // 掘る瞬間だけ小さく揺れる（光らせない）
    const j = shaking ? (Math.random() < 0.5 ? -1 : 1) : 0;
    drawDrill(c * cell + j, r * cell, s);
  }

  // メニューを開いている物の枠
  const p = popCell();
  if (p) {
    const wcells = popTarget.bed !== undefined ? 2 : 1;
    const cx = popTarget.bed !== undefined ? popTarget.bed : p.c;
    ctx.strokeStyle = '#5a95ee'; ctx.lineWidth = 2; ctx.strokeRect(cx * cell + 1, p.r * cell + 1, cell * wcells - 2, cell - 2);
  }

  // マウス位置
  if (hover && inB(hover.c, hover.r)) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(hover.c * cell + 1, hover.r * cell + 1, cell - 2, cell - 2);
  }

  // 売上の浮き文字
  const now = performance.now();
  S.pops = S.pops.filter(q => now - q.t0 < 1800);
  for (const q of S.pops) {
    const a = 1 - (now - q.t0) / 1800;
    ctx.globalAlpha = a; ctx.fillStyle = q.neg ? '#ff9b8a' : '#fff36b';
    ctx.font = `bold ${Math.round(cell * 0.55)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(q.text, (q.bed + 1) * cell, YARD_R * cell - (1 - a) * cell * 0.9);
    ctx.globalAlpha = 1;
  }
}

// コンベアのベルトの筋（進む向きに流れる）
function drawBelt(x, y, d) {
  const [dx, dy] = DIRS[d];
  const phase = (S.time * ITEM_SPEED) % 0.5;
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
  ctx.fillStyle = color; ctx.font = `bold ${Math.round(cell * size)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + cell / 2, y + cell / 2 + 1);
}

function drawDrill(x, y, s) {
  // ▽：本体＋刃。刃が掘る向きを向く
  ctx.save();
  ctx.translate(x + cell / 2, y + cell / 2);
  ctx.rotate(ANGLE[s.dir]);
  ctx.fillStyle = s.stuck || s.blocked ? '#7a6a6a' : '#d04a3a';
  ctx.fillRect(-cell * 0.3, -cell * 0.42, cell * 0.6, cell * 0.32);
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.moveTo(-cell * 0.35, -cell * 0.08);
  ctx.lineTo(cell * 0.35, -cell * 0.08);
  ctx.lineTo(0, cell * 0.48);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

function drawBay(b) {
  const y = YARD_R * cell, bx = b.bed * cell;
  // 駐車場の枠
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(bx + 2, y + 2, cell * 2 - 4, cell - 4); ctx.setLineDash([]);
  if (!b.type || b.phase === 'away') return;
  // 出発：右へ走りながら薄くなる／帰還：右からやって来る（ゆっくりフェード、点滅なし）
  let p = 0;
  if (b.phase === 'leaving') p = ease(b.t / ANIM_SEC);
  else if (b.phase === 'returning') p = 1 - ease(b.t / ANIM_SEC);
  ctx.save();
  ctx.globalAlpha = 1 - p * 0.9;
  ctx.translate(p * cell * 2.2, 0);
  const col = TRUCK_COLOR[b.type];
  // 荷台 ＿
  ctx.fillStyle = col;
  ctx.fillRect(bx + 2, y + cell * 0.45, cell - 2, cell * 0.33);
  ctx.fillRect(bx + 2, y + cell * 0.2, cell * 0.1, cell * 0.3);
  const fill = b.load / TRUCKS[b.type].cap;
  ctx.fillStyle = ITEM_COLOR[b.type][0];
  ctx.fillRect(bx + cell * 0.14, y + cell * 0.45 - cell * 0.28 * fill, (cell - 2) - cell * 0.14, cell * 0.28 * fill);
  // 運転席（資源の種類の字）
  const cx = bx + cell;
  ctx.fillStyle = '#e0e4ea'; ctx.fillRect(cx, y + cell * 0.2, cell * 0.8, cell * 0.58);
  ctx.fillStyle = col; ctx.font = `bold ${Math.round(cell * 0.34)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(TXT.kind[b.type][0], cx + cell * 0.32, y + cell * 0.52);
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(cx + cell * 0.52, y + cell * 0.28, cell * 0.2, cell * 0.18);
  ctx.fillStyle = '#222';
  for (const wx of [bx + cell * 0.35, cx + cell * 0.45]) {
    ctx.beginPath(); ctx.arc(wx, y + cell * 0.84, cell * 0.13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---- 画面の数字・ボタン ----
function updateUI() {
  const m = $('money');
  m.textContent = S.money; m.classList.toggle('neg', S.money < 0);
  $('playBtn').textContent = running ? TXT.pause : TXT.play;
  $('speedBtn').textContent = '×' + SPEEDS[speedIdx];
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  document.querySelectorAll('.dir').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
  $('dirGroup').classList.toggle('off', !(tool === 'conv' || tool === 'sort'));
}

let msgTimer = 0;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 2000); }

function setupText() {
  document.documentElement.lang = LANG;
  document.title = TXT.title;
  document.querySelectorAll('[data-t]').forEach(el => { const v = TXT[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  $('ver').textContent = 'v' + VERSION;
  $('noteUrl').href = NOTE_URL; $('noteUrl').textContent = NOTE_URL.replace('https://', '');
  $('noteTip').href = NOTE_URL;
  const ul = $('helpList'); ul.innerHTML = '';
  for (const line of TXT.helpList) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
}

// ---- 入力 ----
function cellAt(e) {
  return { c: Math.floor((e.clientX - gox) / cell), r: Math.floor((e.clientY - goy) / cell) };
}
let down = false, lastK = -1;
cv.addEventListener('pointerdown', e => {
  const p = cellAt(e);
  const hadPop = !!popTarget;
  closePop();
  ['help', 'shop'].forEach(x => { $(x).hidden = true; });
  if (!inB(p.c, p.r)) return;
  const bay = bayAt(p.c, p.r);
  if (bay && bay.type) { openPop(bay); return; }        // トラックをタップ→売るメニュー
  const s = S.st.get(key(p.c, p.r));
  if (s && tool !== 'remove') { openPop(s); return; }  // 置いた物はタップでメニュー
  if (hadPop && !s) return;                             // メニューを閉じるだけのタップ
  down = true; cv.setPointerCapture(e.pointerId);
  lastK = key(p.c, p.r); apply(p.c, p.r, false); updateUI();
});
cv.addEventListener('pointermove', e => {
  hover = cellAt(e);
  if (!down) return;
  const k = key(hover.c, hover.r);
  if (k !== lastK) { lastK = k; apply(hover.c, hover.r, true); updateUI(); }
});
cv.addEventListener('pointerup', () => { down = false; });
cv.addEventListener('pointerleave', () => { hover = null; });

document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => { tool = b.dataset.tool; closePop(); updateUI(); }));
document.querySelectorAll('.dir').forEach(b => b.addEventListener('click', () => {
  dir = b.dataset.dir; if (tool !== 'sort') tool = 'conv'; updateUI();
}));
$('playBtn').addEventListener('click', () => { running = !running; updateUI(); });
$('speedBtn').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; updateUI(); });
$('shopBtn').addEventListener('click', () => togglePanel('shop'));
$('helpBtn').addEventListener('click', () => togglePanel('help'));
$('resetBtn').addEventListener('click', () => { if (confirm(TXT.confirmReset)) { closePop(); newGame(); updateUI(); } });
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); running = !running; }
  else if (e.key === 'r' || e.key === 'R') { dir = ROT[(ROT.indexOf(dir) + 1) % 4]; if (tool !== 'sort') tool = 'conv'; }
  else if (e.key === '1') tool = 'drill';
  else if (e.key === '2') tool = 'conv';
  else if (e.key === '3') tool = 'sort';
  else if (e.key === '4') tool = 'remove';
  else if (e.key === 'Escape') { closePop(); ['help', 'shop'].forEach(x => { $(x).hidden = true; }); }
  else return;
  updateUI();
});
window.addEventListener('resize', resize);

// ---- ループ ----
let last = performance.now(), shopTick = 0;
function frame(now) {
  const dt = Math.min(now - last, 250) / 1000; last = now;
  if (running) sim(dt * SPEEDS[speedIdx]);
  updateUI();
  if (!$('shop').hidden && (shopTick = (shopTick + 1) % 15) === 0) renderShop(); // 資金に合わせて買えるか更新
  placePop();
  draw();
  requestAnimationFrame(frame);
}

newGame();
setupText();
resize();
updateUI();
window.__game = { get S() { return S; }, sim, apply, buyTruck, setTool: t => { tool = t; }, setDir: d => { dir = d; }, pause: () => { running = false; updateUI(); } }; // 動作確認用
requestAnimationFrame(frame);
})();
