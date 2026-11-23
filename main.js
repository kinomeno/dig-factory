// 採掘ゲーム v0.02
// 画面をマス目に割り、地形・設備を描く。資源だけは別レイヤーで、マスに縛られず自由に動く。
(() => {
'use strict';

const VERSION = '0.02';
const NOTE_URL = 'https://note.com/kinomeno/xxxxxxx'; // 紹介記事ができたら差し替え

// ---- 盤面の設定 ----
const COLS = 20, ROWS = 14;
const SKY = 3;                 // 上から3行が空（地上）
const BEDROCK_ROW = ROWS - 1;  // 最下段は掘れない岩盤
const TRUCK = { r: SKY - 1, bed: 16, cab: 17, cap: 10, awaySec: 4 };
const COST = { drill: 50, conv: 5 };
const PRICE = 2;               // 資源1個の売値
const START_MONEY = 200;
const DRILL_HIT_SEC = 0.6;     // ドリルが1回削る間隔（秒）
const ITEM_SPEED = 1.5;        // コンベア上の資源の速さ（マス/秒）
const SUB_SEC = 0.02;          // 計算の刻み（秒）
const hpForRow = r => 6 + 2 * Math.floor((r - SKY) / 2); // 深いほど硬い：6〜14回

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const ROT = ['right', 'down', 'left', 'up'];
const ANGLE = { down: 0, left: Math.PI / 2, up: Math.PI, right: -Math.PI / 2 };
const SPEEDS = [1, 2, 4];

// ---- 言語（日本語以外は英語） ----
const LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
const TXT = {
  ja: {
    title: '採掘ゲーム', money: '資金', truck: '荷台', away: '出発中',
    drill: 'ドリル', conv: 'コンベア', remove: '撤去', dir: '向き',
    play: '▶︎ 再生', pause: '❚❚ 停止', reset: '最初から',
    confirmReset: '最初からやり直しますか？',
    hint: '空いたマスにドリルを置くと下へ掘ります。置いたドリルやコンベアをタップすると向きを変えられます。掘った資源は隣のコンベアに出ます（無ければその場に溜まります）。コンベアで右上のトラックの荷台へ運びましょう。',
    keys: 'Space：再生/停止　R：コンベアの向きを回す　1/2/3：道具',
    noMoney: '資金が足りません', cantPlace: 'ここには置けません', paused: '停止中',
    drillDir: 'ドリルの向き', convDir: 'コンベアの向き',
    author: 'キノメノ', kofi: '☞ko-fiで支援', tip: '☞noteでチップ',
  },
  en: {
    title: 'Mining Game', money: 'Money', truck: 'Truck', away: 'Away',
    drill: 'Drill', conv: 'Conveyor', remove: 'Remove', dir: 'Dir',
    play: '▶︎ Play', pause: '❚❚ Pause', reset: 'Restart',
    confirmReset: 'Start over from the beginning?',
    hint: 'Place a drill on an empty cell and it digs down. Tap a placed drill or conveyor to change its direction. Mined ore comes out onto a neighboring conveyor (or piles up where it is). Carry it to the truck bed at the top right.',
    keys: 'Space: play/pause   R: rotate conveyor direction   1/2/3: tools',
    noMoney: 'Not enough money', cantPlace: 'Cannot place here', paused: 'Paused',
    drillDir: 'Drill direction', convDir: 'Conveyor direction',
    author: 'Kinomeno', kofi: '☞Support on Ko-fi', tip: '☞Tip on note',
  },
}[LANG];

// ---- 状態 ----
let S;
const key = (c, r) => r * COLS + c;
const inB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const isTruck = (c, r) => r === TRUCK.r && (c === TRUCK.bed || c === TRUCK.cab);
const rand = (a, b) => a + Math.random() * (b - a);

function newGame() {
  const ground = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r < SKY) row.push(null);
      else if (r === BEDROCK_ROW) row.push({ bedrock: true });
      else { const max = hpForRow(r); row.push({ hp: max, max }); }
    }
    ground.push(row);
  }
  S = {
    ground,
    st: new Map(),      // 設備：key -> {type:'drill'|'conv', dir, ...}
    items: [],          // 資源レイヤー：{x, y, lane, spd, ox, oy}（マス単位の自由座標）
    money: START_MONEY,
    truck: { load: 0, away: 0 },
    time: 0,
    pops: [],           // 売上の浮き文字
  };
}

const isOpen = (c, r) => inB(c, r) && S.ground[r][c] === null && !S.st.has(key(c, r)) && !isTruck(c, r);
const truckOpen = () => !S.truck.away && S.truck.load < TRUCK.cap;
// 資源が入っていけるマス：空いた空間か、コンベア
function canEnter(c, r) {
  if (!inB(c, r) || S.ground[r][c] !== null || isTruck(c, r)) return false;
  const s = S.st.get(key(c, r));
  return !s || s.type === 'conv';
}

// 資源を1個つくる（マスの中で少しばらけた位置に）
function spawnItem(x, y) {
  S.items.push({
    x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2),
    lane: rand(-0.22, 0.22),        // コンベア上で横にずれる量（整列させない）
    spd: rand(0.8, 1.2),            // 1個ずつ少し速さが違う
    ox: rand(-0.28, 0.28), oy: rand(-0.28, 0.28), // 溜まるときの位置
  });
}

// ---- 時間を進める ----
function sim(sec) {
  while (sec > 1e-9) {
    const dt = Math.min(SUB_SEC, sec);
    sec -= dt;
    S.time += dt;
    updateItems(dt);
    updateDrills(dt);
    updateTruck(dt);
  }
}

function approach(v, target, d) { return Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d; }

function updateItems(dt) {
  for (let i = S.items.length - 1; i >= 0; i--) {
    const it = S.items[i];
    const c = Math.floor(it.x), r = Math.floor(it.y);
    const s = S.st.get(key(c, r));
    const v = ITEM_SPEED * it.spd * dt;
    if (!s || s.type !== 'conv') {
      // コンベアの外：その場に溜まる（マスの中のばらけた位置へゆっくり寄る）
      it.x = approach(it.x, c + 0.5 + it.ox, v * 0.5);
      it.y = approach(it.y, r + 0.5 + it.oy, v * 0.5);
      continue;
    }
    const [dx, dy] = DIRS[s.dir];
    // 進む方向と直角には、その資源ごとの「ずれ」に寄せる（真ん中に揃えない）
    if (dx !== 0) it.y = approach(it.y, r + 0.5 + it.lane, v * 0.6);
    else it.x = approach(it.x, c + 0.5 + it.lane, v * 0.6);
    const nx = it.x + dx * v, ny = it.y + dy * v;
    const nc = Math.floor(nx), nr = Math.floor(ny);
    if (nc === c && nr === r) { it.x = nx; it.y = ny; continue; }
    // 隣のマスへ出ようとしている
    if (nr === TRUCK.r && nc === TRUCK.bed && truckOpen()) {
      S.items.splice(i, 1); S.truck.load++; continue;
    }
    if (canEnter(nc, nr)) { it.x = nx; it.y = ny; continue; }
    // 行き止まり：コンベアの端で止まる（溜まる）。止まる位置も少しばらす
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
  if (!inB(tc, tr)) { s.stuck = true; return; }
  const g = S.ground[tr][tc];
  if (g === null) {
    // 下向きで下が空洞なら落ちる。それ以外は空振りで止まる
    if (s.dir === 'down' && !S.st.has(key(tc, tr)) && !isTruck(tc, tr)) { s.stuck = false; moveDrill(k, s, key(tc, tr)); }
    else s.stuck = true;
    return;
  }
  if (g.bedrock) { s.stuck = true; return; }
  s.stuck = false;
  g.hp--; s.hit = S.time;
  emitOre(c, r, s);
  if (g.hp <= 0) { S.ground[tr][tc] = null; moveDrill(k, s, key(tc, tr)); } // 消えた■の位置へ移動
}

// 掘った資源を出す：掘る方向以外の隣にコンベアがあればそこへ、無ければドリルの場所に溜まる
function emitOre(c, r, s) {
  const back = OPP[s.dir];
  const sides = [back, ...Object.keys(DIRS).filter(d => d !== s.dir && d !== back)];
  for (const d of sides) {
    const [dx, dy] = DIRS[d];
    const ns = inB(c + dx, r + dy) && S.st.get(key(c + dx, r + dy));
    if (ns && ns.type === 'conv') {
      spawnItem(c + 0.5 + dx * 0.75, r + 0.5 + dy * 0.75);
      const it = S.items[S.items.length - 1];
      it.x = Math.min(Math.max(it.x, c + dx + 0.02), c + dx + 0.98); // 必ずコンベアのマスの中に
      it.y = Math.min(Math.max(it.y, r + dy + 0.02), r + dy + 0.98);
      return;
    }
  }
  spawnItem(c + 0.5, r + 0.5);
}

function updateTruck(dt) {
  const t = S.truck;
  if (t.away > 0) { t.away = Math.max(0, t.away - dt); return; }
  if (t.load >= TRUCK.cap) {
    const earn = t.load * PRICE;
    S.money += earn; t.load = 0; t.away = TRUCK.awaySec;
    S.pops.push({ text: '+' + earn, t0: performance.now() });
  }
}

// ---- 設置 ----
let tool = 'conv', dir = 'right', running = true, speedIdx = 0;

function apply(c, r, dragging) {
  if (!inB(c, r)) return;
  const k = key(c, r), s = S.st.get(k);
  if (tool === 'remove') { if (s) removeAt(k); return; }
  if (s) { if (!dragging) openPop(s); return; }  // 置いてある物をタップ→向きメニュー
  if (dragging && tool === 'drill') return;
  if (!isOpen(c, r)) { if (!dragging) say(TXT.cantPlace); return; }
  if (S.money < COST[tool]) { if (!dragging) say(TXT.noMoney); return; }
  S.money -= COST[tool];
  S.st.set(k, tool === 'drill'
    ? { type: 'drill', dir: 'down', t: 0, hit: -99 }
    : { type: 'conv', dir });
}

function removeAt(k) {
  const s = S.st.get(k); if (!s) return;
  S.money += Math.floor(COST[s.type] / 2);
  S.st.delete(k);                          // 乗っていた資源はその場に残る
}

// ---- 向きメニュー ----
const $ = id => document.getElementById(id);
let popTarget = null;
function findKey(s) { for (const [k, v] of S.st) if (v === s) return k; return -1; }

function openPop(s) {
  popTarget = s;
  const pop = $('pop');
  $('popTitle').textContent = s.type === 'drill' ? TXT.drillDir : TXT.convDir;
  $('popRemove').textContent = TXT.remove;
  pop.hidden = false;
  placePop();
  updatePop();
}
function closePop() { popTarget = null; $('pop').hidden = true; }
function placePop() {
  if (!popTarget) return;
  const k = findKey(popTarget);
  if (k < 0) { closePop(); return; }
  const c = k % COLS, r = (k - c) / COLS;
  const pop = $('pop'), wrap = $('wrap');
  const cr = cv.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  let x = cr.left - wr.left + (c + 0.5) * cell - pop.offsetWidth / 2;
  let y = cr.top - wr.top + (r + 1) * cell + 6;
  if (y + pop.offsetHeight > wr.height) y = cr.top - wr.top + r * cell - pop.offsetHeight - 6;
  x = Math.max(0, Math.min(x, wr.width - pop.offsetWidth));
  pop.style.left = x + 'px'; pop.style.top = Math.max(0, y) + 'px';
}
function updatePop() {
  if (!popTarget) return;
  document.querySelectorAll('#pop [data-pdir]').forEach(b => b.classList.toggle('active', b.dataset.pdir === popTarget.dir));
}
document.querySelectorAll('#pop [data-pdir]').forEach(b => b.addEventListener('click', () => {
  if (!popTarget) return;
  popTarget.dir = b.dataset.pdir; popTarget.stuck = false;
  updatePop();
}));
$('popRemove').addEventListener('click', () => { const k = popTarget && findKey(popTarget); if (k >= 0) removeAt(k); closePop(); updateUI(); });
$('popClose').addEventListener('click', closePop);

// ---- 描画 ----
const cv = $('cv');
const ctx = cv.getContext('2d');
let cell = 32, hover = null;

function resize() {
  const wrap = $('wrap');
  const availW = wrap.clientWidth;
  const availH = Math.max(240, window.innerHeight - wrap.getBoundingClientRect().top - 110);
  cell = Math.max(14, Math.floor(Math.min(availW / COLS, availH / ROWS)));
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = cell * COLS + 'px';
  cv.style.height = cell * ROWS + 'px';
  cv.width = cell * COLS * dpr;
  cv.height = cell * ROWS * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  placePop();
}

function groundColor(r) {
  const t = (r - SKY) / (BEDROCK_ROW - SKY);
  const a = [168, 118, 64], b = [92, 60, 34];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

function draw() {
  const W = cell * COLS, H = cell * ROWS;
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(0, 0, W, SKY * cell);          // 空
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
    if (g.hp < g.max) {  // 耐久度ゲージ
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + 3, y + cell - 6, cell - 6, 3);
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(x + 3, y + cell - 6, (cell - 6) * g.hp / g.max, 3);
    }
  }
  ctx.fillStyle = '#5e8f3a'; ctx.fillRect(0, SKY * cell - 2, W, 2);     // 地面の線

  // 設備レイヤー
  for (const [k, s] of S.st) {
    const c = k % COLS, r = (k - c) / COLS, x = c * cell, y = r * cell;
    if (s.type === 'conv') {
      ctx.fillStyle = '#50545c'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = '#6a6f79'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      drawBelt(x, y, s.dir);
      glyph(ARROW[s.dir], x, y, '#cfd3da', 0.5);
    }
  }

  drawTruck();

  // 資源レイヤー（別レイヤー・自由な位置）
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 1;
  const rad = cell * 0.17;
  for (const it of S.items) {
    ctx.beginPath(); ctx.arc(it.x * cell, it.y * cell, rad, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  // ドリルは資源の上に描く（溜まった資源に埋もれて見えなくならないように）
  for (const [k, s] of S.st) {
    if (s.type !== 'drill') continue;
    const c = k % COLS, r = (k - c) / COLS;
    const shaking = S.time - s.hit < 0.12;                  // 掘る瞬間だけ小さく揺れる（光らせない）
    const j = shaking ? (Math.random() < 0.5 ? -1 : 1) : 0;
    drawDrill(c * cell + j, r * cell, s);
  }

  // メニューを開いている設備の枠
  if (popTarget) {
    const k = findKey(popTarget);
    if (k >= 0) {
      const c = k % COLS, r = (k - c) / COLS;
      ctx.strokeStyle = '#5a95ee'; ctx.lineWidth = 2; ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
    }
  }

  // マウス位置
  if (hover && inB(hover.c, hover.r)) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(hover.c * cell + 1, hover.r * cell + 1, cell - 2, cell - 2);
  }

  // 売上の浮き文字
  const now = performance.now();
  S.pops = S.pops.filter(p => now - p.t0 < 1500);
  for (const p of S.pops) {
    const a = 1 - (now - p.t0) / 1500;
    ctx.globalAlpha = a; ctx.fillStyle = '#fff36b';
    ctx.font = `bold ${Math.round(cell * 0.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.text, (TRUCK.bed + 1) * cell, TRUCK.r * cell - (1 - a) * cell * 0.8 + cell * 0.1);
    ctx.globalAlpha = 1;
  }

  if (!running) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, cell * 0.9);
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(cell * 0.5)}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('❚❚ ' + TXT.paused, cell * 0.3, cell * 0.45);
  }
}

// コンベアのベルトの筋（動きが分かるよう、進む向きに流れる）
function drawBelt(x, y, d) {
  const [dx, dy] = DIRS[d];
  const phase = running ? (S.time * ITEM_SPEED) % 0.5 : (S.time * ITEM_SPEED) % 0.5;
  ctx.strokeStyle = '#5f646d'; ctx.lineWidth = 1;
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
  ctx.fillStyle = s.stuck ? '#7a6a6a' : '#d04a3a';
  ctx.fillRect(-cell * 0.3, -cell * 0.42, cell * 0.6, cell * 0.32);
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.moveTo(-cell * 0.35, -cell * 0.08);
  ctx.lineTo(cell * 0.35, -cell * 0.08);
  ctx.lineTo(0, cell * 0.48);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTruck() {
  const y = TRUCK.r * cell, bx = TRUCK.bed * cell, cx = TRUCK.cab * cell;
  if (S.truck.away) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(bx + 2, y + 2, cell * 2 - 4, cell - 4); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(cell * 0.32)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(TXT.away, bx + cell, y + cell / 2);
    return;
  }
  // 荷台 ＿
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(bx + 2, y + cell * 0.45, cell - 2, cell * 0.33);
  ctx.fillRect(bx + 2, y + cell * 0.2, cell * 0.1, cell * 0.3);
  const fill = S.truck.load / TRUCK.cap;
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(bx + cell * 0.14, y + cell * 0.45 - cell * 0.28 * fill, (cell - 2) - cell * 0.14, cell * 0.28 * fill);
  // 運転席 R
  ctx.fillStyle = '#e0e4ea'; ctx.fillRect(cx, y + cell * 0.2, cell * 0.8, cell * 0.58);
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(cx + cell * 0.4, y + cell * 0.28, cell * 0.3, cell * 0.2);
  ctx.fillStyle = '#222';
  for (const wx of [bx + cell * 0.35, cx + cell * 0.45]) {
    ctx.beginPath(); ctx.arc(wx, y + cell * 0.84, cell * 0.13, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- 画面の数字・ボタン ----
function updateUI() {
  $('money').textContent = S.money;
  $('load').textContent = S.truck.away ? TXT.away : `${S.truck.load}/${TRUCK.cap}`;
  $('playBtn').textContent = running ? TXT.pause : TXT.play;
  $('speedBtn').textContent = '×' + SPEEDS[speedIdx];
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  document.querySelectorAll('.dir').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
  $('dirGroup').classList.toggle('off', tool !== 'conv');
}

let msgTimer = 0;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 2000); }

function setupText() {
  document.documentElement.lang = LANG;
  document.title = TXT.title;
  document.querySelectorAll('[data-t]').forEach(el => { const v = TXT[el.dataset.t]; if (v) el.textContent = v; });
  $('ver').textContent = 'v' + VERSION;
  $('noteUrl').href = NOTE_URL; $('noteUrl').textContent = NOTE_URL;
  $('noteTip').href = NOTE_URL;
}

// ---- 入力 ----
function cellAt(e) {
  const rect = cv.getBoundingClientRect();
  return { c: Math.floor((e.clientX - rect.left) / cell), r: Math.floor((e.clientY - rect.top) / cell) };
}
let down = false, lastK = -1;
cv.addEventListener('pointerdown', e => {
  const p = cellAt(e);
  const hadPop = !!popTarget;
  closePop();
  const s = inB(p.c, p.r) && S.st.get(key(p.c, p.r));
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
document.querySelectorAll('.dir').forEach(b => b.addEventListener('click', () => { dir = b.dataset.dir; tool = 'conv'; updateUI(); }));
$('playBtn').addEventListener('click', () => { running = !running; updateUI(); });
$('speedBtn').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; updateUI(); });
$('resetBtn').addEventListener('click', () => { if (confirm(TXT.confirmReset)) { closePop(); newGame(); updateUI(); } });
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); running = !running; }
  else if (e.key === 'r' || e.key === 'R') { dir = ROT[(ROT.indexOf(dir) + 1) % 4]; tool = 'conv'; }
  else if (e.key === '1') tool = 'drill';
  else if (e.key === '2') tool = 'conv';
  else if (e.key === '3') tool = 'remove';
  else if (e.key === 'Escape') closePop();
  else return;
  updateUI();
});
window.addEventListener('resize', resize);

// ---- ループ ----
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 250) / 1000; last = now;
  if (running) { sim(dt * SPEEDS[speedIdx]); updateUI(); }
  placePop();
  draw();
  requestAnimationFrame(frame);
}

newGame();
setupText();
resize();
updateUI();
window.__game = { get S() { return S; }, sim, apply, setTool: t => { tool = t; }, setDir: d => { dir = d; }, pause: () => { running = false; updateUI(); } }; // 動作確認用
requestAnimationFrame(frame);
})();
