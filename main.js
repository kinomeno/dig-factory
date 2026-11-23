// 採掘ゲーム v0.01
// 画面をマス目に割り、地形・設備・資源（別レイヤー）を重ねて描く。
(() => {
'use strict';

const VERSION = '0.01';
const NOTE_URL = 'https://note.com/kinomeno/xxxxxxx'; // 紹介記事ができたら差し替え

// ---- 盤面の設定 ----
const COLS = 20, ROWS = 14;
const SKY = 3;                 // 上から3行が空（地上）
const BEDROCK_ROW = ROWS - 1;  // 最下段は掘れない岩盤
const TRUCK = { r: SKY - 1, bed: 16, cab: 17, cap: 10, awaySteps: 12 };
const COST = { drill: 50, conv: 5 };
const PRICE = 2;               // 資源1個の売値
const STEP_MS = 300;           // 1ステップの時間（×1のとき）
const DRILL_EVERY = 2;         // ドリルは2ステップに1回掘る
const DRILL_BUF = 3;           // ドリルが抱えられる資源の数
const START_MONEY = 200;

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const ROT = ['right', 'down', 'left', 'up'];
const SPEEDS = [1, 2, 4];

// ---- 言語（日本語以外は英語） ----
const LANG = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
const TXT = {
  ja: {
    title: '採掘ゲーム', money: '資金', truck: '荷台', away: '出発中',
    drill: 'ドリル', conv: 'コンベア', remove: '撤去', dir: '向き',
    play: '▶︎ 再生', pause: '❚❚ 停止', reset: '最初から',
    confirmReset: '最初からやり直しますか？',
    hint: 'ドリルは地面のすぐ上に置けます。掘った資源は上・左・右のコンベアへ出ます。ドリルが掘り進んだら、穴に↑コンベアを置いて地上へ運び、右上のトラックの荷台へ届けましょう。',
    keys: 'Space：再生/停止　R：向きを回す　1/2/3：道具　（置いたコンベアをコンベアでクリックすると向きを変えられます）',
    noMoney: '資金が足りません', cantDrill: 'ドリルは地面のすぐ上の空いた場所に置けます',
    cantPlace: 'ここには置けません', paused: '停止中',
    author: 'キノメノ', kofi: '☞ko-fiで支援', tip: '☞noteでチップ',
  },
  en: {
    title: 'Mining Game', money: 'Money', truck: 'Truck', away: 'Away',
    drill: 'Drill', conv: 'Conveyor', remove: 'Remove', dir: 'Dir',
    play: '▶︎ Play', pause: '❚❚ Pause', reset: 'Restart',
    confirmReset: 'Start over from the beginning?',
    hint: 'Place a drill right above the ground. Mined ore comes out onto a conveyor above, left or right of it. When the drill digs down, put ↑ conveyors in its shaft to lift ore up, then carry it to the truck bed at the top right.',
    keys: 'Space: play/pause   R: rotate   1/2/3: tools   (click a conveyor with the conveyor tool to change its direction)',
    noMoney: 'Not enough money', cantDrill: 'Drills go on an empty cell right above the ground',
    cantPlace: 'Cannot place here', paused: 'Paused',
    author: 'Kinomeno', kofi: '☞Support on Ko-fi', tip: '☞Tip on note',
  },
}[LANG];

// ---- 状態 ----
let S;
const key = (c, r) => r * COLS + c;
const inB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const isTruck = (c, r) => r === TRUCK.r && (c === TRUCK.bed || c === TRUCK.cab);

function newGame() {
  const ground = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r < SKY) row.push(null);
      else if (r === BEDROCK_ROW) row.push({ bedrock: true });
      else {
        const max = 2 + Math.floor((r - SKY) / 2); // 深いほど硬い
        row.push({ hp: max, max });
      }
    }
    ground.push(row);
  }
  S = {
    ground,
    st: new Map(),      // 設備：key -> {type:'drill'|'conv', ...}
    items: new Set(),   // 資源レイヤー：コンベア上の資源の位置
    money: START_MONEY,
    truck: { load: 0, away: 0 },
    step: 0,
    pops: [],           // 売上の浮き文字
  };
}

const isOpen = (c, r) => inB(c, r) && S.ground[r][c] === null && !S.st.has(key(c, r)) && !isTruck(c, r);

// ---- 1ステップ進める ----
function step() {
  S.step++;
  moveItems();
  if (S.step % DRILL_EVERY === 0) runDrills();
  runTruck();
}

function moveItems() {
  const moved = new Set();
  let changed = true;
  while (changed) {               // 前の資源が動いたら後ろも詰める
    changed = false;
    for (const k of [...S.items]) {
      if (moved.has(k)) continue;
      const s = S.st.get(k);
      if (!s || s.type !== 'conv') { S.items.delete(k); continue; }
      const c = k % COLS, r = (k - c) / COLS;
      const [dx, dy] = DIRS[s.dir];
      const nc = c + dx, nr = r + dy;
      if (nr === TRUCK.r && nc === TRUCK.bed) {
        if (!S.truck.away && S.truck.load < TRUCK.cap) {
          S.items.delete(k); S.truck.load++; changed = true;
        }
        continue;
      }
      if (!inB(nc, nr)) continue;
      const nk = key(nc, nr), ns = S.st.get(nk);
      if (ns && ns.type === 'conv' && !S.items.has(nk)) {
        S.items.delete(k); S.items.add(nk); moved.add(nk); changed = true;
      }
    }
  }
}

function runDrills() {
  for (const [k, s] of [...S.st]) {
    if (s.type !== 'drill') continue;
    let c = k % COLS, r = (k - c) / COLS;

    // 抱えた資源を上・左・右のコンベアへ出す
    if (s.buf > 0) {
      for (const d of ['up', 'left', 'right']) {
        const [dx, dy] = DIRS[d];
        const nk = key(c + dx, r + dy);
        if (!inB(c + dx, r + dy)) continue;
        const ns = S.st.get(nk);
        if (ns && ns.type === 'conv' && !S.items.has(nk)) { S.items.add(nk); s.buf--; break; }
      }
    }

    // 下を掘る
    const br = r + 1;
    if (br >= ROWS) continue;
    const g = S.ground[br][c];
    if (g === null) {                       // 下が空洞なら落ちる
      if (!S.st.has(key(c, br))) { S.st.delete(k); S.st.set(key(c, br), s); }
      continue;
    }
    if (g.bedrock) { s.stuck = true; continue; }
    if (s.buf >= DRILL_BUF) continue;       // 資源を抱えすぎたら止まる
    g.hp--; s.buf++; s.hit = S.step;
    if (g.hp <= 0) {
      S.ground[br][c] = null;
      S.st.delete(k); S.st.set(key(c, br), s); // 消えた■の位置へ移動
    }
  }
}

function runTruck() {
  const t = S.truck;
  if (t.away > 0) { t.away--; return; }
  if (t.load >= TRUCK.cap) {
    const earn = t.load * PRICE;
    S.money += earn; t.load = 0; t.away = TRUCK.awaySteps;
    S.pops.push({ text: '+' + earn, t0: performance.now() });
  }
}

// ---- 設置 ----
let tool = 'conv', dir = 'right', running = true, speedIdx = 0;

function apply(c, r, dragging) {
  if (!inB(c, r)) return;
  const k = key(c, r), s = S.st.get(k);
  if (tool === 'remove') {
    if (s) { S.money += Math.floor(COST[s.type] / 2); S.st.delete(k); S.items.delete(k); }
    return;
  }
  if (tool === 'conv' && s && s.type === 'conv') { s.dir = dir; return; } // 向き変更は無料
  if (dragging && tool === 'drill') return;
  if (!isOpen(c, r)) { if (!dragging) say(tool === 'drill' ? TXT.cantDrill : TXT.cantPlace); return; }
  if (tool === 'drill') {
    const below = r + 1 < ROWS ? S.ground[r + 1][c] : null;
    if (!below || below.bedrock) { say(TXT.cantDrill); return; }
  }
  if (S.money < COST[tool]) { if (!dragging) say(TXT.noMoney); return; }
  S.money -= COST[tool];
  S.st.set(k, tool === 'drill' ? { type: 'drill', buf: 0, hit: -99 } : { type: 'conv', dir });
}

// ---- 描画 ----
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let cell = 32, hover = null;

function resize() {
  const wrap = document.getElementById('wrap');
  const availW = wrap.clientWidth;
  const availH = Math.max(240, window.innerHeight - wrap.getBoundingClientRect().top - 110);
  cell = Math.max(14, Math.floor(Math.min(availW / COLS, availH / ROWS)));
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = cell * COLS + 'px';
  cv.style.height = cell * ROWS + 'px';
  cv.width = cell * COLS * dpr;
  cv.height = cell * ROWS * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function groundColor(r) {
  const t = (r - SKY) / (BEDROCK_ROW - SKY);
  const a = [168, 118, 64], b = [92, 60, 34];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

function draw() {
  const W = cell * COLS, H = cell * ROWS;
  // 空
  ctx.fillStyle = '#7fb8e6'; ctx.fillRect(0, 0, W, SKY * cell);
  // 穴の中（掘った跡）
  ctx.fillStyle = '#2a2018'; ctx.fillRect(0, SKY * cell, W, H - SKY * cell);

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

  // 地面の線
  ctx.fillStyle = '#5e8f3a'; ctx.fillRect(0, SKY * cell - 2, W, 2);

  // 設備レイヤー
  for (const [k, s] of S.st) {
    const c = k % COLS, r = (k - c) / COLS, x = c * cell, y = r * cell;
    if (s.type === 'conv') {
      ctx.fillStyle = '#50545c'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = '#6a6f79'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      glyph(ARROW[s.dir], x, y, '#cfd3da', 0.6);
    } else {
      const shake = (S.step - s.hit) < 1 ? (S.step % 2 ? 1 : -1) : 0; // 掘る時は小さく揺れる（光らせない）
      drawDrill(x + shake, y, s);
    }
  }

  drawTruck();

  // 資源レイヤー（別レイヤー）
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 1;
  for (const k of S.items) {
    const c = k % COLS, r = (k - c) / COLS;
    ctx.beginPath(); ctx.arc(c * cell + cell / 2, r * cell + cell / 2, cell * 0.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
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
    ctx.font = `bold ${Math.round(cell * 0.6)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(p.text, (TRUCK.bed + 1) * cell, TRUCK.r * cell - (1 - a) * cell * 0.8 + cell * 0.3);
    ctx.globalAlpha = 1;
  }

  if (!running) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, cell * 0.9);
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(cell * 0.5)}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('❚❚ ' + TXT.paused, cell * 0.3, cell * 0.45);
  }
}

function glyph(ch, x, y, color, size) {
  ctx.fillStyle = color; ctx.font = `bold ${Math.round(cell * size)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x + cell / 2, y + cell / 2 + 1);
}

function drawDrill(x, y, s) {
  // ▽：上が本体、下が刃
  ctx.fillStyle = s.stuck ? '#7a6a6a' : '#d04a3a';
  ctx.fillRect(x + cell * 0.2, y + cell * 0.08, cell * 0.6, cell * 0.32);
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.moveTo(x + cell * 0.15, y + cell * 0.42);
  ctx.lineTo(x + cell * 0.85, y + cell * 0.42);
  ctx.lineTo(x + cell * 0.5, y + cell * 0.98);
  ctx.closePath(); ctx.fill();
  // 抱えている資源
  ctx.fillStyle = '#ffd34d';
  for (let i = 0; i < s.buf; i++) {
    ctx.beginPath(); ctx.arc(x + cell * (0.32 + i * 0.18), y + cell * 0.24, cell * 0.07, 0, Math.PI * 2); ctx.fill();
  }
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
  // タイヤ
  ctx.fillStyle = '#222';
  for (const wx of [bx + cell * 0.35, cx + cell * 0.45]) {
    ctx.beginPath(); ctx.arc(wx, y + cell * 0.84, cell * 0.13, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- 画面の数字・ボタン ----
const $ = id => document.getElementById(id);
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
  down = true; cv.setPointerCapture(e.pointerId);
  const p = cellAt(e); lastK = key(p.c, p.r); apply(p.c, p.r, false); updateUI();
});
cv.addEventListener('pointermove', e => {
  hover = cellAt(e);
  if (!down) return;
  const k = key(hover.c, hover.r);
  if (k !== lastK) { lastK = k; apply(hover.c, hover.r, true); updateUI(); }
});
cv.addEventListener('pointerup', () => { down = false; });
cv.addEventListener('pointerleave', () => { hover = null; });

document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => { tool = b.dataset.tool; updateUI(); }));
document.querySelectorAll('.dir').forEach(b => b.addEventListener('click', () => { dir = b.dataset.dir; tool = 'conv'; updateUI(); }));
$('playBtn').addEventListener('click', () => { running = !running; updateUI(); });
$('speedBtn').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; updateUI(); });
$('resetBtn').addEventListener('click', () => { if (confirm(TXT.confirmReset)) { newGame(); updateUI(); } });
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); running = !running; }
  else if (e.key === 'r' || e.key === 'R') { dir = ROT[(ROT.indexOf(dir) + 1) % 4]; tool = 'conv'; }
  else if (e.key === '1') tool = 'drill';
  else if (e.key === '2') tool = 'conv';
  else if (e.key === '3') tool = 'remove';
  else return;
  updateUI();
});
window.addEventListener('resize', resize);

// ---- ループ ----
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 1000); last = now;
  if (running) {
    acc += dt * SPEEDS[speedIdx];
    while (acc >= STEP_MS) { acc -= STEP_MS; step(); }
    updateUI();
  }
  draw();
  requestAnimationFrame(frame);
}

newGame();
setupText();
resize();
updateUI();
window.__game = { get S() { return S; }, step, apply, setTool: t => { tool = t; }, setDir: d => { dir = d; } }; // 動作確認用
requestAnimationFrame(frame);
})();
