// ほりほり工場 / Dig Factory Tycoon v1.02（作業フォルダ名：採掘ゲーム）
// 画面をマス目に割り、地形・設備を描く。資源だけは別レイヤーで、マスに縛られず自由に動く。
// 横は固定の列数、縦（深さ）は無制限。拡大縮小・上下移動できる。
// 地上の事務所から作業員がドリル・機械へ歩いて行って操作する。
(() => {
'use strict';

const VERSION = '1.02';
const NOTE_URL = 'https://note.com/kinomeno/n/n8ecbf906a59a';   // 紹介記事
const X_URL = '';   // キノメノのX（決まったら入れる。空の間はXのボタンを出さない）
// テスト用の管理メニュー：実機テストのため、当面は公開版でも出す（キノメノ指示 2026-11-23）。
// 消すときは false にする（または URL に ?nodev を付けるとその時だけ消える）
const DEV = !new URLSearchParams(location.search).has('nodev');

// ---- 盤面の設定 ----
const COLS = 14;
const SKY = 4;                 // 上から4行が空（地上）
const YARD_R = SKY - 1;        // 地上の建物の行（地面のすぐ上）
const OFFICE_C = Math.floor(COLS / 2) - 1;   // 事務所（地上の中央の2マス）
const YARD_C0 = OFFICE_C + 3;
let YARD_C = YARD_C0;   // ヤード（資源置き場）1マス。トラックもここに直接止まる（荷台からはみ出た山と重なる）
let BED = YARD_C, CAB = YARD_C;
const setYard = c => { YARD_C = BED = CAB = c; if (S) S.yardC = c; };   // ヤードの列（-1＝無い）   // トラックの止まる列（1マス）
// 釣り合いの数字（その他）：単独の数字や、式の中の数字。管理メニュー「釣り合い調整」で全部変えられる
const BAL = {
  tankCap: 300, facSlow: 0.1, drillHit: 0.6, grav: 14, loadRate: 10, walkH: 2.2, walkV: 1.2, restSec: 12,
  valueUp: 1.5, loan: 300, loanMax: 1500, advLv: 2, facSlots: 3, aditMax: 3, aditMaxSpeed: 0.5,
  hireFee0: 40, hireFeeLv: 30, wage0: 10, wageLv: 6, forkSpd0: 3, forkSpdG: 1.2, forkSpdMax: 3, forkBuy0: 300, forkBuyStep: 150,
  digCost0: 250, digCostG: 2.8, digMon0: 10, digMonG: 3, landCost0: 150000, landCostG: 4, awayCost0: 300, awayCostG: 1.25,
  priceUpMul: 1.15, priceCostG: 1.6,
  ironP5: 0.17, ironP10: 0.33, goldP10: 0.07, goldP30: 0.18, diaP30: 0.045, diaP50: 0.11, oilP: 0.012, hotP: 0.03,   // v0.72：鉄・金・ダイヤを出やすく（×1.4）
  offCostG: 3, offCapG: 1.3, capMax: 200, brandMul: 1.1, labAlone: 0.25, beltManned: 1.5, elevSpeed: 6, rareP: 0.006, museumFee: 60, truckAdd0: 8000, truckAddG: 2.5,
  resGrow: 1.07, conneP: 0.1, lampMul: 1.15, awayExact: 120, awayStep: 0.05, awayRatio: 0.02, awayMax: 300, itemHp: 2, itemMax: 2000, zoneHard: 0.35, restMin: 3, clayP: 0.14, copperP: 0.1, coalP: 0.09, quartzP: 0.05, silverP: 0.06,
  bossFatPer: 0.13, bossFatRate: 0.0001, beltSlowPow: 3, beltSlowMin: 0.02, truckWait: 15, gift: 1000,
};
const COST = { lamp: 200, drill: 50, fdrill: 120, adrill: 150, conv: 5, sort: 20, tee: 15, cross: 15, lab: 200, pipe: 8, spa: 800, power: 1000, refinery: 1500, museum: 20000, elev: 30, yard: 500 };
// 地上の施設（研究で増える。作業員がいないととても遅い）と、液体（石油・お湯）
const FAC_IDS = ['spa', 'power', 'refinery', 'museum'];
const isFacTool = t => FAC_IDS.includes(t);
const WELL_RATE = { oil: 0.5, hot: 1 };   // 湧き口1つが1秒に出す量
const LAND0 = [OFFICE_C - 2, OFFICE_C + 3];   // 最初の土地（列の左端・右端）＝事務所を中心に6マス。研究「土地買収」で左右に1マスずつ広がる
const LAND_MAX = Math.min(OFFICE_C - 2, COLS - 1 - (OFFICE_C + 3));   // 土地買収の上限（今は4回で全14マス）
// 調整できる数値：def＝初期値。キノメノが管理メニュー「調整」で動かし、結果をコピーしてClaudeに渡せる
const TUNE_DEF = [
  { k: 'month',      ja: '1か月の長さ（秒）',         en: 'Month length (s)',        min: 10,  max: 120,  step: 5,    def: 60 },
  { k: 'startMoney', ja: '最初の資金',                en: 'Starting money',          min: 100, max: 3000, step: 50,   def: 500 },
  { k: 'price',      ja: '売値の倍率',                en: 'Sale price ×',            min: 0.5, max: 4,    step: 0.1,  def: 2.5 },
  { k: 'ore',        ja: '鉄・金・ダイヤの出やすさ',  en: 'Ore richness ×',          min: 0.5, max: 3,    step: 0.1,  def: 1.3 },
  { k: 'hard',       ja: '地面の硬さ',                en: 'Ground hardness ×',       min: 0.3, max: 3,    step: 0.1,  def: 1 },
  { k: 'drill',      ja: 'ドリルの速さ',              en: 'Drill speed ×',           min: 0.3, max: 3,    step: 0.1,  def: 1.5 },
  { k: 'unmanned',   ja: '作業員なしの時の速さ',      en: 'Speed without operator',  min: 0.05, max: 1,   step: 0.05, def: 0.2 },
  { k: 'wage',       ja: '給料の倍率',                en: 'Wages ×',                 min: 0,   max: 3,    step: 0.1,  def: 0.7 },
  { k: 'walk',       ja: '作業員の歩く速さ',          en: 'Worker walk speed ×',     min: 0.5, max: 3,    step: 0.1,  def: 0.6 },
  { k: 'belt',       ja: 'コンベアの速さ',            en: 'Conveyor speed ×',        min: 0.5, max: 3,    step: 0.1,  def: 1 },
  { k: 'fork',       ja: 'フォークリフトの速さ',      en: 'Forklift speed ×',        min: 0.5, max: 3,    step: 0.1,  def: 1 },
  { k: 'away',       ja: 'トラックが出かける秒数',    en: 'Truck trip (s)',          min: 1,   max: 20,   step: 1,    def: 5 },
  { k: 'digCost',    ja: '掘削の費用',                en: 'Dig cost ×',              min: 0.2, max: 3,    step: 0.1,  def: 1 },
  { k: 'resCost',    ja: '研究の費用',                en: 'Research cost ×',         min: 0.2, max: 3,    step: 0.1,  def: 1 },
  { k: 'resTime',    ja: '研究の時間',                en: 'Research time ×',         min: 0.2, max: 3,    step: 0.1,  def: 1 },
  { k: 'yield',      ja: '1マスから出る資源の数',     en: 'Items per cell ×',        min: 0.5, max: 3,    step: 0.1,  def: 1.1 },
  { k: 'deepHard',   ja: '深いほど硬くなる強さ',      en: 'Hardness growth ×',       min: 0,   max: 3,    step: 0.1,  def: 1 },
  { k: 'costGrow',   ja: '同じ物を建てるごとの値上がり', en: 'Price growth per unit',  min: 1,   max: 4,    step: 0.1,  def: 2.6 },
  { k: 'thru',       ja: '機械を通り抜ける速さ（コンベア比）', en: 'Pass-through speed', min: 0.02, max: 1, step: 0.02, def: 0.1 },
  { k: 'thruMax',    ja: '機械の中を同時に通り抜けられる数', en: 'Max items passing a machine', min: 1, max: 10, step: 1, def: 1 },
  { k: 'rockSlow',   ja: 'レベル不足で岩盤を掘る速さ', en: 'Bedrock speed w/o level', min: 0.005, max: 0.3, step: 0.005, def: 0.015 },
];
const TUNE = {};
for (const d of TUNE_DEF) TUNE[d.k] = d.def;
try { Object.assign(TUNE, JSON.parse(localStorage.getItem('digfactory.tune') || '{}')); } catch (e) { /* 保存できない環境 */ }
const saveTune = () => { try { localStorage.setItem('digfactory.tune', JSON.stringify(TUNE)); } catch (e) { /* 無視 */ } };
const SUB_SEC = 0.02;          // 計算の刻み（秒）
const ANIM_SEC = 1.4;          // 出発・帰還アニメの長さ
const START_ZOOM = 1.8;        // 最初は拡大した状態から

// 作業員

// レベル（マスごと。レベル1が最弱）
// val/cost の表を使い切ったら、vg（力）・cg（値段）の倍率で伸び続ける。cap＝上限
const LV = {
  drill:   { v0: 0.5, vg: 1.5, c0: 30, cg: 1.3, cap: Infinity },   // v0.95：強さは×1.5ずつ・値段は×1.3ずつ（次の岩盤まで約21レベル）   // v0.79：1レベルごとに力が2倍（上限なし。岩盤はドリルの強化で破る）                                   // 1回で削る力
  belt:    { val: [0.8, 0.95, 1.1, 1.25, 1.4],   // v0.95：上がり方を半分以下・最大も半分以下に（前は 0.8〜3）
              cost: [10, 40, 200, 5000] },   // コンベアの速さ（マス/秒）。Lv1〜5。最後（Lv5＝乗る数が無制限）はとても高い
  machine: { v0: 1, vg: 1.3, c0: 100, cg: 2.5, cap: 5 },   // レベルアップは5回まで（強化だけで解決しないように。効率化・施設を生かす余地を残す）   // 強化の値段は1レベルごとに2.5倍（作った物の売値は1.5倍ずつ上がるので、伸びすぎないように）                                    // 加工の速さ（倍）
  truck:   { val: [2, 4, 7, 12, 20, 32, 50, 80], vg: 1.5, cost: [30, 80, 200, 450, 1000, 2000, 4000], cg: 2.1, cap: 80 },   // 積める数（最初は2個だけ）
  fork:    { val: [1, 2, 3, 4], vg: 1, cost: [60, 300, 1500], cg: 2.1, cap: 3 },          // v0.98：積める数は4まで・速さはレベルで上がらない（台数を増やす意味を出す）
};
function lvVal(g, lv) {
  const d = LV[g];
  if (d.val) return lv < d.val.length ? d.val[lv] : Math.round(d.val[d.val.length - 1] * Math.pow(d.vg, lv - d.val.length + 1));
  return Math.round(d.v0 * Math.pow(d.vg, lv) * 100) / 100;
}
function lvCost(g, lv) {
  const d = LV[g];
  if (d.cost) return lv < d.cost.length ? d.cost[lv] : Math.round(d.cost[d.cost.length - 1] * Math.pow(d.cg, lv - d.cost.length + 1));
  return Math.round(d.c0 * Math.pow(d.cg, lv));
}

// 資源と製品（v＝1個の売値）
const ITEMS = {
  soil:     { v: 1,   c: ['#b08456', '#5e4026'], s: 'circle' },
  stone:    { v: 2,   c: ['#9a958d', '#4f4b46'], s: 'circle' },
  iron:     { v: 8,   c: ['#aeb8c6', '#4c5664'], s: 'circle' },
  gold:     { v: 25,  c: ['#ffd34d', '#7a5a00'], s: 'circle' },
  dia:      { v: 60,  c: ['#bfe9ff', '#3d7896'], s: 'circle' },
  gravel:   { v: 3,   c: ['#cbc5b8', '#6d675d'], s: 'small' },
  brick:    { v: 3,   c: ['#c0583c', '#6e2a18'], s: 'rect' },
  ironbar:  { v: 22,  c: ['#c9d2de', '#4c5664'], s: 'bar' },
  goldbar:  { v: 65,  c: ['#ffd34d', '#7a5a00'], s: 'bar' },
  tool:     { v: 60,  c: ['#8fa0b6', '#2f3a48'], s: 'hammer' },
  jewel:    { v: 170, c: ['#ffcf3a', '#8a5a00'], s: 'ring' },
  diaClean: { v: 80,  c: ['#d8f3ff', '#3d7896'], s: 'gem' },
  diaCut:   { v: 120, c: ['#e9f9ff', '#2d6886'], s: 'gem' },
  gem:      { v: 200, c: ['#f2fcff', '#1f5a7a'], s: 'gem' },
  bag:      { v: 0,   c: ['#d8c9a0', '#6d5f3c'], s: 'bag' },
  fuel:     { v: 40,  c: ['#e0a040', '#6a4410'], s: 'rect' },   // 燃料（製油所で石油から）
  tile:      { v: 6,   c: ['#d9d4c8', '#7d776b'], s: 'square' },   // タイル（石を切断）
  glossTile: { v: 14,  c: ['#f4f1ea', '#8a8478'], s: 'square' },   // つやタイル（タイルを研磨）
  wire:      { v: 30,  c: ['#9aa3ae', '#3c4450'], s: 'coil' },    // ワイヤー（鉄の延べ棒を引き延ばす）
  goldDust:  { v: 30,  c: ['#ffe27a', '#9a7400'], s: 'small' },    // 金粉（金をクラッシャーで砕く。1つの金から2つ）
  goldleaf:  { v: 95,  c: ['#ffe27a', '#9a7400'], s: 'rect' },     // 金箔（金の延べ棒を引き延ばす）
  decoIron:  { v: 320, c: ['#c9d2de', '#d0661f'], s: 'gem' },      // 高級装飾品（鉄）：鉄の延べ棒＋宝石
  decoGold:  { v: 420, c: ['#ffd34d', '#b0306a'], s: 'gem' },      // 高級装飾品（金）：金の延べ棒＋宝石
  // 珍しい資源（深い所でまれに掘り当てる。博物館に飾れる）
  ammonite:  { v: 2000,  c: ['#d8c9a0', '#6d5f3c'], s: 'shell' },
  fossil:    { v: 3000,  c: ['#ece6d4', '#7d776b'], s: 'bone' },
  haniwa:    { v: 5000,  c: ['#c98a5a', '#6e3a18'], s: 'haniwa' },
  rareMin:   { v: 8000,  c: ['#b79be6', '#3d2a66'], s: 'gem' },
  relic:     { v: 15000, c: ['#ffd34d', '#5e4026'], s: 'cup' },
  // v0.83 新しい資源（粘土・銅・石炭・石英・銀）と、その製品
  clay:      { v: 2,    c: ['#c9a27a', '#6e4a2a'], s: 'circle' },   // 粘土（5〜15m）
  copper:    { v: 25,   c: ['#d98a4a', '#6a3a14'], s: 'circle' },   // 銅（10m〜）
  coal:      { v: 8,    c: ['#4a4a52', '#141418'], s: 'circle' },   // 石炭（20m〜）
  quartz:    { v: 60,   c: ['#eef4f8', '#7a92a6'], s: 'gem' },      // 石英（30m〜）
  silver:    { v: 70,   c: ['#dfe4ea', '#5a6270'], s: 'circle' },   // 銀（40m〜）
  kawara:    { v: 12,   c: ['#6a6f78', '#3a3d44'], s: 'wave' },     // 瓦（粘土を焼く）
  pottery:   { v: 40,   c: ['#e8d8bc', '#8a6a48'], s: 'jar' },   // 陶器（レンガ＋タイル）
  copperBar: { v: 300,  c: ['#e0955a', '#6a3a14'], s: 'bar' },
  silverBar: { v: 1000, c: ['#e6eaf0', '#5a6270'], s: 'bar' },
  steel:     { v: 650,  c: ['#7c8896', '#2f3a48'], s: 'bar' },      // 鋼（鉄の延べ棒＋石炭）
  ironPlate: { v: 280,  c: ['#b8c2ce', '#4c5664'], s: 'plate' },
  copperPlate: { v: 420, c: ['#e0955a', '#6a3a14'], s: 'plate' },
  glass:     { v: 30,   c: ['#cfe8ef', '#6a9aa8'], s: 'cup' },
  luxGlass:  { v: 400,  c: ['#f2fbff', '#5a8aa0'], s: 'gem' },      // 高級ガラス（純粋な石英から）
  ironPot:   { v: 350,  c: ['#6a6f78', '#2a2d33'], s: 'pot' },
  copperPot: { v: 480,  c: ['#d98a4a', '#6a3a14'], s: 'pot' },
  wireMesh:  { v: 750,  c: ['#9aa3ae', '#3c4450'], s: 'mesh' },   // 金網（ワイヤー2本）
  silverware: { v: 2600, c: ['#eef1f5', '#6a7280'], s: 'cutlery' },  // 銀食器
  steelPart: { v: 1100, c: ['#8a96a8', '#2f3a48'], s: 'gear' },   // 鋼の部品
  concrete:  { v: 15,   c: ['#b8b4aa', '#6d675d'], s: 'block' },     // コンクリートブロック
  copperWire: { v: 380, c: ['#e0955a', '#6a3a14'], s: 'coil' },     // 銅線
  cable:     { v: 900,  c: ['#3a3a40', '#d98a4a'], s: 'coil' },     // 電線
  goldTile:  { v: 2200, c: ['#ffe27a', '#8a8478'], s: 'square' },   // 金縁タイル
  mummy:     { v: 25000, c: ['#e8dcc0', '#5e5040'], s: 'mummy' },
};
const ITEM_ORDER = Object.keys(ITEMS);
const RARE = [['ammonite', 20], ['fossil', 30], ['haniwa', 40], ['rareMin', 50], ['relic', 60], ['mummy', 70]];   // 珍しい資源と、出始める深さ（m）
const isRare = k => RARE.some(([r]) => r === k);

// 加工機械（1マス。前以外から入れて、前に出す）
const MACHINES = {
  kiln:     { cost: 120, time: 3, recipes: [{ in: 'soil', n: 2, out: 'brick' }, { in: 'clay', n: 1, out: 'kawara' }, { ins: { brick: 1, tile: 1 }, out: 'pottery' }] },   // 粘土→瓦・レンガ＋タイル→陶器も
  crusher:  { cost: 100, time: 2, recipes: [{ in: 'stone', n: 1, out: 'gravel' }, { in: 'gold', n: 1, out: 'goldDust', outN: 2 }] },
  smelter:  { cost: 200, time: 4, recipes: [{ in: 'iron', n: 2, out: 'ironbar' }, { in: 'gold', n: 2, out: 'goldbar' }, { in: 'copper', n: 2, out: 'copperBar' }, { in: 'silver', n: 2, out: 'silverBar' }, { ins: { ironbar: 1, coal: 1 }, out: 'steel' }] },
  factory:  { cost: 400, time: 5, recipes: [{ in: 'ironbar', n: 2, out: 'tool' }, { in: 'goldbar', n: 2, out: 'jewel' }, { ins: { gravel: 1, stone: 1 }, out: 'concrete' }, { in: 'copperWire', n: 2, out: 'cable' }] },
  bagger:   { cost: 150, time: 2, bag: 5 },  // 同じ物5個を1袋に（売値1.2倍）
  washer:   { cost: 300, time: 2, recipes: [{ in: 'dia', n: 1, out: 'diaClean' }] },
  cutter:   { cost: 400, time: 3, recipes: [{ in: 'diaClean', n: 1, out: 'diaCut' }, { in: 'stone', n: 1, out: 'tile' }] },     // 切断：石→タイルも
  polisher: { cost: 500, time: 3, recipes: [{ in: 'diaCut', n: 1, out: 'gem' }, { in: 'tile', n: 1, out: 'glossTile' }] },      // 研磨：タイル→つやタイルも
  drawer:   { cost: 350, time: 3, recipes: [{ in: 'ironbar', n: 1, out: 'wire' }, { in: 'goldbar', n: 1, out: 'goldleaf' }, { in: 'copperBar', n: 1, out: 'copperWire' }] },  // 伸線機（引き延ばし）
  atelier:  { cost: 700, time: 6, recipes: [{ ins: { ironbar: 1, gem: 1 }, out: 'decoIron' }, { ins: { goldbar: 1, gem: 1 }, out: 'decoGold' }, { ins: { glossTile: 1, goldleaf: 1 }, out: 'goldTile' }] },   // 装飾工房（2つの材料を組み合わせる）
  adit:     { cost: 500, time: 3, recipes: [], src: true },
  sieve:    { cost: 300, time: 3, recipes: [{ in: 'soil', n: 6, out: 'iron' }, { in: 'gravel', n: 5, out: 'copper' }] },   // ふるい：土・砂利から小さな鉱石を拾う
  roller:   { cost: 800, time: 4, recipes: [{ in: 'ironbar', n: 1, out: 'ironPlate' }, { in: 'copperBar', n: 1, out: 'copperPlate' }] },   // 圧延機：延べ棒→板
  caster:   { cost: 900, time: 5, recipes: [{ in: 'ironbar', n: 1, out: 'ironPot' }, { in: 'copperBar', n: 1, out: 'copperPot' }] },     // 鋳造機：延べ棒→鍋
  glassF:   { cost: 700, time: 4, recipes: [{ in: 'gravel', n: 2, out: 'glass' }, { in: 'quartz', n: 1, out: 'luxGlass' }] },         // ガラス炉：純粋な石英は高級ガラス
  metalwork: { cost: 1500, time: 5, recipes: [{ in: 'wire', n: 2, out: 'wireMesh' }, { in: 'silverBar', n: 2, out: 'silverware' }, { in: 'steel', n: 1, out: 'steelPart' }] },   // 金属加工機   // 横穴掘削口：その深さの資源が、前から出続ける（岩盤と岩盤の間に1つずつ）
};
// 岩盤と岩盤の間（ゾーン）：0＝5mより上、1＝5〜10m、2＝10〜20m…。横穴掘削口はゾーンごとに1つ
const zoneOf = r => { let n = 0; while (SKY + layerDepth(n + 1) < r) n++; return n; };
const aditFree = (c, r) => { const z = zoneOf(r); for (const [k, s] of S.st) if (s.type === 'machine' && s.m === 'adit' && k !== key(c, r) && zoneOf(rOf(k)) === z) return false; return true; };
function aditOre(r) { return oreFrom(makeBlock(r)); }   // その深さで掘った時と同じ出方
const MACHINE_ORDER = Object.keys(MACHINES);
const valueMul = m => Math.pow(BAL.valueUp, m.lv || 0);

// フォークリフト：地上に出た資源を、出た場所（荷おろし場）からヤードまで運ぶ
const FORK = { cap: 6, speed: 2.4, rate: 8 };   // 積める数・走る速さ（マス/秒）・積みおろしの速さ（個/秒）
const newFork = () => ({ type: 'fork', lv: 0, op: null, x: 0, state: 'idle', load: [], tc: null, acc: 0, face: 1 });
// 硬い岩盤：Lv1＝10m、その後は20mごと（30m・50m…）。掘り抜くと段階が上がる（新しい研究が出る）
const layerDepth = n => (n === 1 ? 5 : 10 * (n - 1));                   // 中の番号n：1＝5m（岩盤Lv0）、2＝10m（Lv1）、3＝20m（Lv2）…
const layerAt = d => (d === 5 ? 1 : d >= 10 && d % 10 === 0 ? 1 + d / 10 : 0);
const rockLv = layer => layer - 1;                                      // 画面に出す岩盤レベル
const stageOf = deepest => { let n = 1; while (deepest - SKY >= layerDepth(n)) n++; return n; };
// 事務所のレベル：休憩の速さ・定員
const OFFICE_LV = { rest: [1, 1.5, 2, 3, 4], cap: [3, 5, 8, 12, 16], forks: [2, 4, 8, 12, 16], cost: [1000, 4000, 16000, 64000] };   // レベル2＝岩盤Lv0を破れる・研究所。その先は4倍ずつ（会社レベルが大きな目標。インフレ）
const LV_EXP = [180, 600, 1500, 3000, 5400, 9000, 14000, 21000];   // v0.72：上がりやすすぎたので3倍くらいに   // 働いた時間（秒）の合計でレベルアップ
const HIRE_FEE = lv => BAL.hireFee0 + BAL.hireFeeLv * lv;                           // 雇うときの契約金
const wageOf = w => (w.boss ? 0 : BAL.wage0 + BAL.wageLv * w.lv);              // 給料（月）。社長は0
const staffN = () => S.workers.filter(w => !w.boss).length;     // 雇っている人数（社長は数えない）
const forkSpeed = lv => Math.min(BAL.forkSpdMax, BAL.forkSpd0);   // v0.98：フォークリフトの速さはレベルで変わらない
const FORK_BUY = n => BAL.forkBuy0 + BAL.forkBuyStep * (n - 1);                     // n台目のフォークリフトの値段
// 研究所で研究して使えるようになる機械 [費用, 月数]。レンガ焼成機・クラッシャーは最初から
const RESEARCH_MACH = { sieve: [800, 2], roller: [3000, 3], caster: [3500, 3], glassF: [2500, 3], metalwork: [6000, 4], adit: [800, 2], smelter: [600, 2], bagger: [500, 2], factory: [1500, 3], washer: [1200, 3], cutter: [1800, 3], polisher: [2500, 4], drawer: [1500, 3], atelier: [5000, 4] };
const RESEARCH_BATCH = [800, 2];
// 研究で増える設置物：高速ドリル・自動ドリル（ふさがると向きを変える）・T字路・交差
const RESEARCH_TOOL = { lamp: [2000, 2], elev: [300, 1], fdrill: [800, 2], adrill: [1500, 3], tee: [300, 1], cross: [400, 2], pipe: [900, 2] };
const RESEARCH_FAC = { spa: [1500, 2], power: [2000, 2], refinery: [3000, 3], museum: [20000, 6] };   // 地上の施設の研究                               // まとめて強化の研究
// スキル（研究：お金を払い、ゲーム内で何か月か待つと手に入る。研究は1つずつ）
const SKILLS = {
  speed:    { max: 3, cost: [800, 2500, 8000], months: [2, 3, 4] },
  dragPlus: { max: 1, cost: [1200], months: [2] },
  hr:       { max: 2, cost: [1500, 5000], months: [2, 3] },   // 雇う人が Lv1 → Lv2 から
  veteran:  { max: 1, cost: [2000], months: [3] },
  welfare:  { max: 2, cost: [1500, 4000], months: [2, 3] },
  black:    { max: 1, cost: [2500], months: [2] },
  digLv:    { max: 999, cost: k => (k === 0 ? BAL.digCost0 : Math.round(BAL.digCost0 * Math.pow(BAL.digCostG, k) / 50) * 50), months: k => (k === 0 ? 1 : Math.round(BAL.digMon0 * Math.pow(BAL.digMonG, k - 1))) },   // 研究の時間は3倍ずつ（最後の岩盤まで実時間で数日）。1段目は安く（最初の穴の稼ぎで払える）
  truck2:   { max: 99, cost: k => Math.round(BAL.truckAdd0 * Math.pow(BAL.truckAddG, k) / 100) * 100, months: k => 3 + k },   // トラック増車（何台でも。1台ごとに高くなる）
  speeding: { max: 1, cost: [2000], months: [2] },
  beltMax:  { max: 2, cost: [2500, 6000], months: [2, 3] },
  autoHire: { max: 1, cost: [2000], months: [2] },       // 人事部：人が足りない時、自動で雇う（事務所でオン・オフ）
  autoUpg:  { max: 1, cost: [5000], months: [3] },       // 技術部：お金に余裕がある時、自動で強化（気まぐれ。頼りすぎない）
  autoPrice: { max: 1, cost: [4000], months: [3] },      // 市場調査：自動で売値アップ（事務所でオン・オフ）
  goldUp:   { max: 10, cost: k => Math.round(2000 * Math.pow(1.6, k) / 100) * 100, months: k => 2 + k },   // 金の匂い：金が出やすい
  diaUp:    { max: 10, cost: k => Math.round(4000 * Math.pow(1.6, k) / 100) * 100, months: k => 2 + k },   // 暗闇の光：ダイヤが出やすい
  newTech:  { max: 10, cost: k => Math.round(3000 * Math.pow(1.7, k) / 100) * 100, months: k => 2 + k },   // 新技術導入：加工機械が速い
  bored:    { max: 3, cost: [1000, 3000, 8000], months: [1, 2, 3] },                                       // 飽き性：暇な作業員がすぐ移る
  treasure: { max: 3, cost: [1e6, 1e7, 1e8], months: [3, 4, 6] },                                     // 人間国宝見学：作業員のレベルの上限+2
  statue:   { max: 1, cost: [1e9], months: [4] },      // 社長像（見た目）
  garden:   { max: 1, cost: [1e7], months: [3] },
  sortPlus: { max: 1, cost: [20000], months: [3] },   // 仕分けコンベア改良：選ぶ資源を複数にできる
  secAdv:   { max: 1, cost: [3000], months: [2] },   // v0.99：秘書の提案（右下の顔）
  oilScan:  { max: 5, cost: k => Math.round(30000 * Math.pow(3, k) / 100) * 100, months: k => 3 + k },   // 油田探索：今の深さから下を調べて、油田の場所を地図に印
  warehouse: { max: 1, cost: [1e7], months: [4] },   // 事務所倉庫（上限のある研究が全部そろったら）
  trip:     { max: 1, cost: [5e7], months: [6] },     // 最高の社員旅行：材料を集め始める
  build:    { max: 1, cost: [2e8], months: [8] },     // 建造：材料がそろったら
  depart:   { max: 1, cost: [5e8], months: [3] },     // 出発：事務所に出発ボタン
  conne:    { max: 5, cost: k => Math.round(5000 * Math.pow(4, k) / 100) * 100, months: k => 2 + k },   // コネ採用：雇える人数が増える（1段ごとに+10%・最低+2人。200人は超えない）      // 屋上庭園：休憩が少し速い（見た目も）
  vein:     { max: 10, cost: k => Math.round(3000 * Math.pow(1.8, k) / 100) * 100, months: k => 2 + k },   // 鉱脈探知：珍しい物が出やすくなる（1段ごとに+25%）
  labRoom:  { max: 5, cost: [3000, 12000, 40000, 150000, 500000], months: [3, 5, 8, 10, 12] },   // 研究室の増室（v0.99：最大6室）
  yardPlus: { max: 1, cost: [1500], months: [2] },
  land:     { max: LAND_MAX, cost: k => Math.round(BAL.landCost0 * Math.pow(BAL.landCostG, k) / 100) * 100, months: k => 2 + k },   // 土地買収：左右に1マスずつ広がる（研究ごとにどんどん高い）
  away:     { max: 23, cost: k => Math.round(BAL.awayCost0 * Math.pow(BAL.awayCostG, k) / 10) * 10, months: k => 1 + Math.floor(k / 8) },   // 放置できる時間 +30分ずつ（最大1日）
};
const SKILL_ORDER = Object.keys(SKILLS);
const skCost = (id, lv) => { const c = SKILLS[id].cost; return Math.round((typeof c === 'function' ? c(lv) : c[lv]) * TUNE.resCost / 10) * 10; };
const skMonths = (id, lv) => { const m = SKILLS[id].months; return Math.max(1, Math.round((typeof m === 'function' ? m(lv) : m[lv]) * TUNE.resTime)); };

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CCW = { right: 'up', up: 'left', left: 'down', down: 'right' }; // 進む向きから見て左
const CW = { right: 'down', down: 'left', left: 'up', up: 'right' };  // 進む向きから見て右
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const ROT = ['right', 'down', 'left', 'up'];
const ANGLE = { down: 0, left: Math.PI / 2, up: Math.PI, right: -Math.PI / 2 };

// ---- 言葉（ひらがな／漢字／英語） ----
const TXT = {
  kanji: {
    title: 'ほりほり工場', money: '資金', date: (y, m) => `${y}年${m}月`, depthM: n => `${n}m`,
    pan: '移動', drill: 'ドリル', dig: '掘削', conv: 'コンベア', sort: '仕分け', machine: '機械', remove: '撤去', power: '強化',
    menu: 'メニュー', info: '情報', admin: '管理', map: '地図',
    play: '▶︎ 再生', pause: '❚❚ 停止', top: '地上', dir: '向き', zoom: 'ズーム', move: '移動', uiOpt: '画面', uiStd: 'ふつう', uiDash: 'タブ（試験）',
    help: '遊び方', settings: '設定', lang: '表示', reset: '最初から',
    confirmReset: '最初からやり直しますか？', confirmReload: 'リセットしますか？（ページを読み込み直します）', yes: 'はい', no: 'いいえ',
    noMoney: '資金が足りません', cantPlace: 'ここには置けません', underOnly: 'ドリル・コンベア・機械は地下に置きます',
    cantDig: 'ここは掘れません（地上からつながる穴の隣だけ）', maxed: '最大',
    drillDir: 'ドリル', convDir: 'コンベア', sortTitle: '仕分けコンベア',
    removeQ: '撤去しますか？（半額戻ります）', lidName: '湧き口のふた', lidOn: 'ふたをする', lidOff: 'ふたを外す', autoDirB: 'オート',
    lidDesc: 'ふたの上には物を置けます。上の物を撤去しても、ふたは残ります。ふたをしている間は湧きません。',
    filter: '選ぶ資源', side: '出す側', left: '左', right: '右',
    sortInfo: '選んだ資源だけを横に出します。他はまっすぐ進みます。',
    outDir: '出す向き（前）', making: '加工中', waiting: '材料待ち', inBuf: '材料',
    truck: 'トラック', loaded: '積んだ数', worth: '売値', depart: '今すぐ出発', away: '出発中', yard: 'ヤード',
    lv: n => `レベル${n}`, levelUp: 'レベルアップ',
    pw: { drill: '掘る力', belt: '速さ', machine: '加工の速さ', truck: '積める数', fork: '積める数' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v}マス/秒`, machine: v => `×${v}`, truck: v => `${v}個`, fork: v => `${v}個` },
    grp: { drill: 'ドリル', belt: 'コンベア・仕分け', machine: '機械', truck: 'トラック', fork: 'フォークリフト' },
    allUp: (g, n) => `${g}をまとめてレベルアップ（${n}台）`, none: '対象がありません',
    items: { soil: '土', stone: '石', iron: '鉄', gold: '金', dia: 'ダイヤ原石', gravel: '砂利', brick: 'レンガ',
      ironbar: '鉄の延べ棒', goldbar: '金の延べ棒', tool: '鉄製品', jewel: '金細工', diaClean: '洗ったダイヤ',
      diaCut: 'カットダイヤ', gem: '宝石', bag: '袋詰め', fuel: '燃料' },
    mach: { kiln: 'レンガ焼成機', crusher: 'クラッシャー', smelter: '溶鉱炉', factory: '商品製造機', bagger: '袋詰め機',
      washer: 'クリーニング機', cutter: 'カット機', polisher: '研磨機' },
    glyph: { kiln: '窯', crusher: '砕', smelter: '炉', factory: '製', bagger: '袋', washer: '洗', cutter: '切', polisher: '磨' },
    bagRule: '同じ物5個 → 1袋（売値1.2倍・何種類でも同時に）',
    office: '事務所', workers: '作業員', hire: '雇う', fire: '解雇', stamina: '体力', tech: '技術',
    wage: '給料', perMonth: '/月', fee: '契約金', payroll: '人件費（毎月）', cands: '雇える人（毎月入れかわる）',
    noCands: '今月はもういません', nobody: 'まだいません',
    wstate: { idle: '待機', toWork: '持ち場へ', work: '作業中', drive: '運転中', toRest: '休みに戻る', rest: '休憩中' },
    worker: n => `作業員${n}`, manned: n => `作業員：${n}`, unmanned: '作業員なし（とても遅い）',
    sortRare: '珍品（まとめて）', sortGrp: { raw: '原料', prod: '製品' }, eject: '材料を排出', ejecting: n => `排出中…（残り${n}）　止める`, payPop: '人件費', payMsg: v => `今月の給料 ${v} を払いました`,
    infoRows: { money: '資金', mSale: '今月の売上', mCost: '今月の経費', mNet: '今月の収支', lNet: '先月の収支',
      tSale: '売上の合計', tCost: '経費の合計', ships: '出荷した回数', deepest: 'いちばん深い所', drills: 'ドリル',
      machines: '機械', belts: 'コンベア・仕分け', workers: '作業員（作業中）', yard: 'ヤードの資源', loan: '借入（売上から返す）' },
    infoGrp: ['お金', '累計', '現場'],
    etaD: n => `${n}日`, etaM: n => `${n}分`, etaS: n => `${n}秒`, rockSlow: '岩盤がとても硬い。ドリルをタップして強化すると、速く掘れます',
    coHud: n => `会社 Lv${n}`, secTrip: '社員旅行', tripBtn: '出発', tripBtnD: '作業員を全員事務所に呼び戻して、宇宙へ出発します', tripMat: (g, n) => `${g} / ${n}`, tripMatNote: '材料は事務所倉庫に集まります（社長が運ぶ・事務所の真下へのコンベアでも）',
    tripReady: '社員旅行の材料がそろいました。研究所で「建造」を研究できます', tripCall: '緊急連絡：従業員は全員事務所に戻ってください。', tripCount: (n, m) => `集合中 ${n}／${m}人`, tripQ: '全員そろいました。出発しますか？', tripGo: '緊急連絡：社員旅行に出発します',
    tripHist: n => `社員旅行で宇宙へ（${n}回目）`, spaceSub: n => `ほりほり工場　社員旅行 ${n}回目`, coNeed: n => `会社Lv${n}で解放`,
    roomBoss: '社長室', roomSec: '秘書', roomRest: '休憩室', roomWait: '待機', roomLab: n => `研究室${n}`, roomFree: '（空き）',
    secDept: '部署', secBoss: '社長', secCo: '会社', secVeh: '車両', secBatch: 'まとめて強化', secRes: '研究',
    deptHr: n => `人事部：${n}人 採用しました`, deptTech: n => `技術部：${n}か所 強化しました`, deptSales: s2 => `営業部：${s2}の売値を上げました`,
    secCome: '今日から、秘書がつきました。よろしくお願いします。',
    yProfit: '今年の利益', ySale: '今年の売上', yCost: '今年の経費', lastY: v => `（去年 ${v}）`,
    oilScan: n => (n ? `油田を${n}か所 見つけました（地図に印）` : '油田は見つかりませんでした'),
    loanPop: '銀行から融資',
    unitN: '台', unitP: '人', unitK: '個', unitT: '回',
    gMoney: '資金の動き', gMonth: '月ごとの収支（緑＝プラス・赤＝マイナス）',
    adm: { m1: '資金 ＋1000', m10: '資金 ＋10000', maxLv: '全部レベル最大', ace: '優秀な作業員を雇う',
      month: '1か月進める', fast: '速さ ×16', clear: '地中を見る（切替）', allSk: 'スキル全部取得', finRes: '研究を即完了', tune: '調整',
      stageUp: '段階ジャンプ（次の岩盤を突破）', auto10: '自動プレイ 10分', auto60: '自動プレイ 60分', tripTest: '社員旅行（テスト・回数に数えない）', pixel: 'ドット編集ツール',
      liveOn: '自動プレイ（見る）開始', liveOff: '自動プレイ（見る）終了', liveOnMsg: '自動プレイ中：AIが3秒ごとに考えて動かします', liveTag: '自動プレイ中' },
    tuneInfo: 'バーを動かすとすぐ反映されます（最初の資金・鉱石の出やすさ・硬さは「最初から」の後に反映）。「結果をコピー」でチャットに貼れます。',
    tuneCopy: '結果をコピー', tuneCopied: 'コピーしました。チャットに貼ってください', tuneReset: '初期値に戻す', tuneT: '調整',
    helpTopics: [
      ['操作', '画面は、右上の手のひらでつかんで動かすか、画面の端（▲▼◀▶の帯）を押すと動きます。2本指・Ctrl＋ホイール・＋－で拡大縮小、「地図」で全体を見られます。\n下のタブ（設置・工事など）を押すと引き出しが開き、道具を選べます。選んだ道具は、もう一度押すか、タブを押すと解除できます。置いた物をタップすると、向きの変更やレベルアップができます。'],
      ['掘る', 'ドリルは地下に置きます（地上とつながった穴の隣なら、土を上書きして置けます）。置くと下へ掘ります。掘った資源はドリルの後ろに出て、空中の資源は下に落ちます。\n10m、その後は20mごとに硬い岩盤があります。研究所で「掘削レベル」を研究しないと、とても遅くしか掘れません。岩盤を掘り抜くと、新しい研究ができるようになります。ドリルを横向きにすれば横へ掘れます。「掘削」で、地上とつながった穴の隣を掘って場所を広げられます。'],
      ['運ぶ', 'コンベアで資源を運びます。仕分けコンベアは、選んだ資源だけを左右に出します。\n地上に出た資源はその場に置かれ、フォークリフトがヤードまで運びます。トラックが積んで出発し、帰ってきたら売上になります。'],
      ['加工', '機械は、前以外の方向から材料を入れると、前に製品を出します。対応していない資源は、機械の中を2倍の時間をかけて通り抜けます。\n最初はレンガ焼成機とクラッシャーだけ。'],
      ['作業員', '事務所で「Lv0を増員」して雇います。作業員はドリル・機械へ自分で歩いて行って操作し、働くほどレベルが上がります。作業員がいない所は「z」の印が付き、とても遅くなります。\nLv2以上になると、地上・上級勤務（フォークリフト・トラック・研究所）にも就きます。疲れると事務所で休みます。給料は毎月。払えない月は1人やめます。'],
      ['事務所と研究所', '事務所はタップでレベルアップできます。定員・フォークリフトの台数・休憩の速さが上がり、レベル2で下のタブの「施設」から研究所（1マス・地上のどこでも）を建てられます。\n研究所では、機械・まとめて強化・スキルを研究できます。Lv2以上の研究員がいないと、研究はとても遅くなります。フォークリフトは「強化」で買い足せます。'],
      ['お金', '売上はトラックが帰ってきた時に入ります。お金が少なく売上も無い月は、銀行が融資してくれます（売上から少しずつ返します）。\n「情報」で経営の様子をグラフで見られます。ゲームは自動でセーブされます。タイトルを押すとタイトル画面に戻ります。'],
      ['石油と温泉', '30mより深い所では、掘り抜くと温泉が湧くことがあります（50mより深いと石油も）。湧き口はパイプラインでつなぎ、地下1段目まで届くと地上のタンクにたまります。\n地上には温泉（お客さんが車で来る）・発電所（地熱か石油で売電）・製油所（石油から燃料）を建てられます。地上の施設は作業員がいないととても遅くなります。土地が足りなければ「施設」の「土地を買う」で広げられます。'],
    ],
    helpList: [
      '手のひら（右上）でドラッグ、または画面の端の▲▼◀▶で画面が動きます。2本指・Ctrl＋ホイール・＋－で拡大縮小。「地図」で全体を見られます。',
      '下のタブから道具を選びます。タブを押すと引き出しが開きます。もう一度押すと解除。',
      'ドリルを空いたマスに置くと下へ掘ります。掘った資源はドリルの後ろに出ます。空中の資源は下に落ちます。',
      '地上に出た資源は、出た場所に置かれます。小さなフォークリフトがヤードまで運び、トラックが積んで出発し、帰ってきたら売上になります。',
      'コンベアと機械は地下に置きます。「掘削」で穴の隣を掘って場所を広げられます（お金がかかります）。',
      '地上中央の事務所で作業員を雇えます（最初は自分ひとり＝0人）。作業員は自分でドリルや機械へ歩いて行って操作します。作業員がいないととても遅くなります（「z」の印）。疲れると事務所で休みます。給料は毎月払います。',
      '置いた物をタップすると、向きの変更やレベルアップができます。レベルは黄色い点の数で分かります。',
      '「情報」で経営の様子をグラフで見られます。',
      '下のタブの「スキル」で研究すると便利な力が手に入ります。硬い岩盤（10m、その後20mごと）は「掘削レベル」を研究しないと、とても遅くしか掘れません。事務所はタップでレベルアップできます。自動でセーブされます。',
    ],
    stageUp: (n, names) => `岩盤レベル${n}突破。` + (names.length ? `${names.join('と')}が可能になりました。` : ''), stagePop: n => `岩盤レベル${n}突破`,
    nextRock: '次の岩盤を突破すると研究できます',
    hStart: '創業（社長ひとり・ドリル1台）', hOffice: n => `事務所をレベル${n}に`, hStage: n => `岩盤レベル${n}を突破`, hMoney: v => `資金が${fmt(v)}を超えた`,
    tCont: 'つづきから', tNew: 'はじめから', confirmNew: 'はじめからにしますか？（今の遊びかけは消えます）', confirmTitle: 'タイトルにもどりますか？（自動でセーブします）',
    dur: (h, m) => (h ? `${h}時間` : '') + `${m}分`, awayCalc: t => `おかえりなさい。留守の間（${t}）の工場を計算しています…`, awayEta: n => `完了まで あと約${n}秒`,
    awayDone: (t, sale, net) => `留守の間（${t}）に、売上 ${fmt(sale)}・資金 ${net >= 0 ? '+' : ''}${fmt(net)}`,
    hAway: t => `留守の間 ${t} 工場が動いた`, autoSaveNote: 'ゲームは自動でセーブされます（30秒ごと・閉じる時・タイトルに戻る時）。',
    finance: '財務', history: '履歴', histEmpty: 'まだありません',
    prio: '優先度', pLow: '低', pMid: '普通', pHigh: '高',
    iRaw: '原料', iProd: '製品', iFrom: '作り方', iInto: '加工すると', iBag: '袋詰め機で5個を1袋にすると、売値が1.2倍になります。',
    iWhere: { soil: 'どこでも出る。1個は安いが、たくさん出る。', stone: '深いほど多い。クラッシャーで砂利にできる。', iron: '浅い所から出る（10mより下で多い）。',
      gold: '10mより下から出る（30mより下で多い）。', dia: '30mより下から出る（50mより下で多い）。' },
    autoMsg: (m, n) => `自動プレイ中… ${m}/${n}分`, autoDone: n => `自動プレイで${n}分進めました`,
    trade: '取引', watch: 'CMを見る', tradeInfo: 'CMを見ると特典がもらえます。続けて見ると、効果の時間が足されます（上限あり）。',
    deal: { idle2h: ['2時間ぶん進める', '2時間放置したのと同じだけ、工場が進みます。', '放置'], price2: ['売値2倍（30分）', '30分の間、売値が2倍になります。', '売値×2'],
      wage0: ['給料カット（半年）', '半年の間、給料が0になります。', '給料0'], speed10: ['速さ10倍（3分）', '3分の間、時間が10倍の速さで進みます。', '速さ×10'] },
    adWait: n => `CMを再生中…あと${n}秒`, adDummy: 'CM（準備中）', dealGot: n => `取引：${n}`, leftT: t => `あと${t}`, leftM: n => `あと${n}か月`,
    fac: { spa: '温泉', power: '発電所', refinery: '製油所' }, facRes: 'この施設を地上に建てられるようになります。', resFac: '地上の施設',
    facDesc: { spa: 'お湯を使って、お客さんが車で来ます。帰る時にその場で料金。', power: 'お湯（地熱）か石油で発電して、その場で売電。', refinery: '石油2つから燃料1つ。燃料はヤードからトラックで売ります。' },
    facNoOp: '作業員なし（とても遅い）', facBuilt: n => `${n}を建設`, guests: n => `お客さん ${n}組`, tankOil: '石油', tankHot: 'お湯',
    pipe: 'パイプライン', pipeDesc: '湧き口から地上まで、管でつなぎます。地下1段目まで届くと、地上のタンクにたまります。',
    wellName: { oil: '油井', hot: '温泉の湧き口' }, wellDesc: { oil: '石油が湧き続けます（1秒に0.5）。', hot: 'お湯が湧き続けます（1秒に1）。' },
    wellOn: '地上につながっています', wellOff: 'まだ地上につながっていません（パイプラインで地下1段目までつなぐ）',
    found: { oil: '石油が出た！パイプラインで地上につなごう', hot: '温泉が湧いた！パイプラインで地上につなごう' }, foundPop: { oil: '石油！', hot: '温泉！' },
    land: '土地を買う', forSale: '売地', landBought: '土地を買い足した', landHint: '売地です。施設の「土地を買う」で買えます',
    skill: '研究', researching: '研究中', researchDone: n => `研究完了：${n}`, busy: 'ほかの研究中です', months: 'か月',
    startRes: '研究', got: '取得済み', resInfo: 'お金を払って研究すると、何か月か後にスキルが手に入ります（研究は1つずつ）。',
    sk: {
      autoConv: ['コンベア自動設置', 'ドリルが掘り進むと、後ろに自動でコンベアを置きます（1マス5）。設定でオン・オフできます。'],
      speed: ['時間速度アップ', '時間の速さが1段ずつ速くなります（いちばん速くて約2.5倍）。上の ▶ を押すと切りかわります。'],
      dragPlus: ['ドラッグ設置の強化', 'コンベアをなぞると、なぞった向きにそろえて置けます（曲がり角もOK）。'],
      hr: ['人事力', '新しく雇う人が Lv1 → Lv2 から始まります。'],
      veteran: ['ベテラン教育', '作業員のレベルが2倍の速さで上がります。'],
      welfare: ['福利厚生', '作業員が疲れにくくなり、休憩も早く終わります。'],
      black: ['ブラック企業', '給料を2割安くします。'],
      digLv: ['掘削レベル', '硬い岩盤（10m、その後は20mごと）を、1段ずつ普通の速さで掘れるようになります。'],
      truck2: ['トラック増車', 'トラックが1台増え、交代で出発します（何台でも増やせます。1台ごとに高くなる）。'],
      speeding: ['スピード違反', 'トラックが出かけている時間が半分になります。'],
      beltMax: ['コンベア最高速アップ', 'コンベアのレベル上限が1つ上がります。'],
      yardPlus: ['ヤード拡張', 'ヤードからの積み込みが2倍速くなり、山も大きく積めます。'],
      saveSlot: ['セーブ枠の追加', 'セーブできる場所が1つ増えます。'],
      away: ['放置時間延長', '留守の間も工場が動く時間が、30分のびます（最初は30分・最大1日）。'],
    },
    needDig: n => `掘削レベル${n}が必要です（スキル）`,
    rockHint: n => `硬い岩盤：掘削レベル${n}が無いと、とても遅くしか掘れません（研究所で研究）`,
    quit: '給料が払えず、作業員が1人やめました',
    veinFound: '鉱脈だ！', autoConvOpt: 'コンベア自動設置', secAdvOpt: '秘書の提案', coLvMsg: '会社レベルを上げられます（タップで事務所へ）',
    adv: { jam: 'コンベアが詰まっています。人をつけるか、強化しては？', buf: n => `${n}の中に材料が溜まっています`, coUp: '会社レベルを上げられます',
      truck: 'ヤードに資源が溜まっています。トラックを強化しては？', fork: '地上に資源が溜まっています。フォークリフトを増やしては？',
      useRes: (a, b) => `${a}は、${b}で加工できます`, next: '次へ', none: '今は、提案はありません' }, on: 'オン', off: 'オフ',
    saveT: 'セーブ', save: 'セーブ', load: 'ロード', slot: n => `スロット${n}`, empty: '空き', saved: 'セーブしました', loaded: 'ロードしました',
    confirmLoad: 'ロードしますか？（今の状態は消えます）', saveNG: 'この環境ではセーブできません',
    officeLv: '事務所', capP: n => `定員${n}人`, restSp: '休憩の速さ', full: '事務所の定員がいっぱいです', techUp: '技術UP',
    build: '設置', works: '工事', grpName: { drill: 'ドリル', belt: 'コンベア', pipe: '管', machine: '機械', other: 'その他', fac: '施設', works: '掘削・撤去' },
    fdrill: '高速ドリル', adrill: '自動ドリル', tee: 'T字路', cross: '交差', resTool: '設置物', toolRes: 'この設置物を置けるようになります。',
    digDo: '掘削する', overwriteQ: '上書きしますか？（今ある物は撤去して半額戻ります）', advNote0: 'Lv2以上になると、地上の仕事（フォークリフト・トラック）にも就きます。',
    facility: '施設', labUnlocked: '研究所を建てられるようになりました（下のタブの「工事」から）', labWhere: '研究所は地上の空いているマスに置けます', labOne: '研究所はもう建っています',
    labName: '研究所', needLab: '研究所が必要です（事務所レベル2で建てられます）', labBuilt: '研究所が建ちました',
    researcher: lv => `研究員：Lv${lv}`, noResearcher: '研究員なし（とても遅い）。Lv2以上の作業員が来ると速くなります',
    resMach: '機械', resBatch: 'まとめて強化', resSkill: 'スキル', machRes: 'この機械を置けるようになります。',
    batchName: 'まとめて強化', batchDesc: '同じ種類の設備を、まとめてレベルアップできるようになります。',
    machLocked: 'ほかの機械は研究所で研究すると使えます', batchLocked: 'まとめて強化は、研究所で研究すると使えます',
    wCount: (lv, n) => `Lv${lv} 作業員 ${n}人`, wBreak: (a, b, c) => `作業中${a}・移動中${b}・休憩中${c}`,
    hireLv: lv => `Lv${lv} を増員`, fireOne: '1人解雇', lvUpW: n => `Lv${n}に昇格`,
    advNote: 'Lv2以上になると、地上・上級勤務（フォークリフト・トラック・研究所）にも就きます。',
    forkName: 'フォークリフト', buyFork: '購入', forkMax: (n, m) => `${n}/${m}台（事務所のレベルで増える）`, forkFull: 'これ以上は置けません（事務所のレベルで増える）',
    forksMax: n => `リフト${n}台`, driver: lv => `運転：Lv${lv}`, noDriver: '運転手なし（遅い）', truckNoDriver: '運転手なし（出かける時間2倍）',
    author: 'キノメノ', kofi: '☞ko-fiで支援', tip: '☞noteでチップ',
  },
  hira: {
    title: 'ほりほりこうじょう', money: 'おかね', date: (y, m) => `${y}ねん${m}がつ`, depthM: n => `${n}m`,
    pan: 'うごかす', drill: 'ドリル', dig: 'あなほり', conv: 'コンベア', sort: 'しわけ', machine: 'きかい', remove: 'とりのぞく', power: 'パワーアップ',
    menu: 'メニュー', info: 'じょうほう', admin: 'かんり', map: 'ちず',
    play: '▶︎ うごかす', pause: '❚❚ とめる', top: 'ちじょう', dir: 'むき', zoom: 'ズーム', move: 'いどう', uiOpt: 'がめん', uiStd: 'ふつう', uiDash: 'タブ（ためし）',
    help: 'あそびかた', settings: 'せってい', lang: 'もじ', reset: 'さいしょから',
    confirmReset: 'さいしょから やりなおしますか？', confirmReload: 'リセット しますか？（さいしょから よみこみ なおします）', yes: 'はい', no: 'いいえ',
    noMoney: 'おかねが たりません', cantPlace: 'ここには おけません', underOnly: 'ドリル・コンベア・きかいは ちかに おきます',
    cantDig: 'ここは ほれません（ちじょうと つながる あなの となりだけ）', maxed: 'さいだい',
    drillDir: 'ドリル', convDir: 'コンベア', sortTitle: 'しわけコンベア',
    removeQ: 'とりのぞきますか？（はんがく もどります）', lidName: 'わきぐちの ふた', lidOn: 'ふたを する', lidOff: 'ふたを はずす', autoDirB: 'オート',
    lidDesc: 'ふたの うえには ものを おけます。うえの ものを とりのぞいても、ふたは のこります。ふたを して いる あいだは わきません。',
    filter: 'えらぶ もの', side: 'だす ほう', left: 'ひだり', right: 'みぎ',
    sortInfo: 'えらんだ ものだけを よこに だします。ほかは まっすぐ すすみます。',
    outDir: 'だす むき（まえ）', making: 'つくっている', waiting: 'ざいりょう まち', inBuf: 'ざいりょう',
    truck: 'トラック', loaded: 'つんだ かず', worth: 'うりね', depart: 'いますぐ しゅっぱつ', away: 'しゅっぱつちゅう', yard: 'おきば',
    lv: n => `レベル${n}`, levelUp: 'レベルアップ',
    pw: { drill: 'ほる ちから', belt: 'はやさ', machine: 'つくる はやさ', truck: 'つめる かず', fork: 'つめる かず' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v}マス/びょう`, machine: v => `×${v}`, truck: v => `${v}こ`, fork: v => `${v}こ` },
    grp: { drill: 'ドリル', belt: 'コンベア・しわけ', machine: 'きかい', truck: 'トラック', fork: 'フォークリフト' },
    allUp: (g, n) => `${g}を まとめて レベルアップ（${n}だい）`, none: 'ありません',
    items: { soil: 'つち', stone: 'いし', iron: 'てつ', gold: 'きん', dia: 'ダイヤの げんせき', gravel: 'じゃり', brick: 'レンガ',
      ironbar: 'てつの ぼう', goldbar: 'きんの ぼう', tool: 'てつの どうぐ', jewel: 'きんの かざり', diaClean: 'あらった ダイヤ',
      diaCut: 'カットした ダイヤ', gem: 'ほうせき', bag: 'ふくろづめ', fuel: 'ねんりょう' },
    mach: { kiln: 'レンガやき', crusher: 'クラッシャー', smelter: 'ようこうろ', factory: 'しょうひん こうば', bagger: 'ふくろづめき',
      washer: 'あらいき', cutter: 'カットき', polisher: 'みがきき' },
    glyph: { kiln: 'か', crusher: 'く', smelter: 'ろ', factory: 'せ', bagger: 'ふ', washer: 'あ', cutter: 'き', polisher: 'み' },
    bagRule: 'おなじ もの 5こ → 1ふくろ（うりね 1.2ばい・なんしゅるいでも いっしょに）',
    office: 'じむしょ', workers: 'さぎょういん', hire: 'やとう', fire: 'やめてもらう', stamina: 'たいりょく', tech: 'うでまえ',
    wage: 'きゅうりょう', perMonth: '/つき', fee: 'けいやくきん', payroll: 'きゅうりょう（まいつき）', cands: 'やとえる ひと（まいつき かわる）',
    noCands: 'こんげつは もう いません', nobody: 'まだ いません',
    wstate: { idle: 'まち', toWork: 'しごとへ', work: 'しごとちゅう', drive: 'うんてんちゅう', toRest: 'やすみに もどる', rest: 'やすみちゅう' },
    worker: n => `さぎょういん${n}`, manned: n => `さぎょういん：${n}`, unmanned: 'さぎょういん なし（とても おそい）',
    sortRare: 'めずらしい もの（まとめて）', sortGrp: { raw: 'げんりょう', prod: 'せいひん' }, eject: 'ざいりょうを だす', ejecting: n => `だしている…（のこり${n}）　とめる`, payPop: 'きゅうりょう', payMsg: v => `こんげつの きゅうりょう ${v} を はらいました`,
    infoRows: { money: 'おかね', mSale: 'こんげつ うれた', mCost: 'こんげつ つかった', mNet: 'こんげつの もうけ', lNet: 'せんげつの もうけ',
      tSale: 'うれた ごうけい', tCost: 'つかった ごうけい', ships: 'しゅっか した かいすう', deepest: 'いちばん ふかい ところ', drills: 'ドリル',
      machines: 'きかい', belts: 'コンベア・しわけ', workers: 'さぎょういん（しごとちゅう）', yard: 'おきばの もの', loan: 'かりている おかね' },
    infoGrp: ['おかね', 'ぜんぶで', 'げんば'],
    etaD: n => `${n}にち`, etaM: n => `${n}ふん`, etaS: n => `${n}びょう`, rockSlow: 'がんばんが とても かたい。ドリルを タップして つよく すると、はやく ほれます',
    coHud: n => `かいしゃ Lv${n}`, secTrip: 'しゃいん りょこう', tripBtn: 'しゅっぱつ', tripBtnD: 'さぎょういんを ぜんいん じむしょに よびもどして、うちゅうへ しゅっぱつ します', tripMat: (g, n) => `${g} / ${n}`, tripMatNote: 'ざいりょうは じむしょ そうこに あつまります',
    tripReady: 'しゃいん りょこうの ざいりょうが そろいました。けんきゅうしょで「けんぞう」が できます', tripCall: 'きんきゅう れんらく：じゅうぎょういんは ぜんいん じむしょに もどって ください。', tripCount: (n, m) => `しゅうごう ちゅう ${n}／${m}にん`, tripQ: 'ぜんいん そろいました。しゅっぱつ しますか？', tripGo: 'きんきゅう れんらく：しゃいん りょこうに しゅっぱつ します',
    tripHist: n => `しゃいん りょこうで うちゅうへ（${n}かいめ）`, spaceSub: n => `ほりほり こうじょう　しゃいん りょこう ${n}かいめ`, coNeed: n => `かいしゃLv${n}で かいほう`,
    roomBoss: 'しゃちょうしつ', roomSec: 'ひしょ', roomRest: 'きゅうけいしつ', roomWait: 'たいき', roomLab: n => `けんきゅうしつ${n}`, roomFree: '（あき）',
    secDept: 'ぶしょ', secBoss: 'しゃちょう', secCo: 'かいしゃ', secVeh: 'くるま', secBatch: 'まとめて つよく', secRes: 'けんきゅう',
    deptHr: n => `じんじぶ：${n}にん やといました`, deptTech: n => `ぎじゅつぶ：${n}か所 つよく しました`, deptSales: s2 => `えいぎょうぶ：${s2}の ねだんを あげました`,
    secCome: 'きょうから、ひしょが つきました。よろしく おねがいします。',
    yProfit: 'ことしの もうけ', ySale: 'ことし うれた', yCost: 'ことし つかった', lastY: v => `（きょねん ${v}）`,
    oilScan: n => (n ? `ゆでんを ${n}か所 みつけました（ちずに しるし）` : 'ゆでんは みつかりませんでした'),
    loanPop: 'ぎんこうから かりた',
    unitN: 'だい', unitP: 'にん', unitK: 'こ', unitT: 'かい',
    gMoney: 'おかねの うごき', gMonth: 'つきごとの もうけ（みどり＝プラス・あか＝マイナス）',
    adm: { m1: 'おかね ＋1000', m10: 'おかね ＋10000', maxLv: 'ぜんぶ レベル さいだい', ace: 'すごい さぎょういんを やとう',
      month: '1かげつ すすめる', fast: 'はやさ ×16', clear: 'つちの なかを みる（きりかえ）', allSk: 'スキル ぜんぶ', finRes: 'けんきゅうを すぐ おわらせる', tune: 'ちょうせい', stageUp: 'だんかい ジャンプ', auto10: 'じどう プレイ 10ぷん', auto60: 'じどう プレイ 60ぷん', tripTest: 'しゃいん りょこう（テスト）', pixel: 'ドット へんしゅう' },
    tuneInfo: 'バーを うごかすと すぐ かわります。「けっかを コピー」で チャットに はれます。',
    tuneCopy: 'けっかを コピー', tuneCopied: 'コピー しました', tuneReset: 'はじめの あたいに もどす', tuneT: 'ちょうせい',
    helpTopics: [
      ['そうさ', 'がめんは、みぎうえの てのひらで つかんで うごかすか、がめんの はし（▲▼◀▶の おび）を おすと うごきます。\nしたの タブを おすと ひきだしが ひらいて、どうぐを えらべます。もう いちど おすか、タブを おすと やめます。おいた ものを タップすると むきや レベルを かえられます。'],
      ['ほる', 'ドリルを あいている マスに おくと したへ ほります。ほった ものは ドリルの うしろに でて、くうちゅうの ものは したに おちます。\n10mごとに かたい がんばんが あり、けんきゅうじょで「あなほり レベル」を けんきゅうしないと ほれません。'],
      ['はこぶ', 'コンベアで はこびます。ちじょうに でた ものは フォークリフトが おきばまで はこび、トラックが かえってきたら おかねに なります。'],
      ['つくる', 'きかいは、まえ いがいから いれると、まえに だします。あわない ものは 2ばいの じかんで とおりぬけます。ほかの きかいは けんきゅうじょで ふえます。'],
      ['さぎょういん', 'じむしょで「Lv0を ふやす」で やといます。はたらくと レベルが あがり、Lv2いじょうは ちじょうの しごとも します。いない ところは「z」で とても おそく なります。'],
      ['じむしょと けんきゅうじょ', 'じむしょを レベルアップすると ひとや フォークリフトが ふえ、レベル2で けんきゅうじょが たちます。けんきゅうじょで きかい・まとめて つよく・スキルを けんきゅう できます。'],
      ['おかね', 'トラックが かえってきたら おかねが はいります。こまったら ぎんこうが かしてくれます。タイトルを おすと さいしょから。'],
      ['せきゆと おんせん', '30mより ふかい ところでは、ほりぬくと おんせんが わくことが あります（50mより ふかいと せきゆも）。わきぐちは パイプで つなぎ、ちか1だんめまで とどくと ちじょうの タンクに たまります。\nちじょうには おんせん・はつでんしょ・せいゆじょを たてられます。さぎょういんが いないと とても おそく なります。とちが たりなければ「しせつ」の「とちを かう」で ひろげられます。'],
    ],
    helpList: [
      'てのひら（みぎうえ）で ひっぱるか、がめんの はしの ▲▼◀▶で がめんが うごきます。「ちず」で ぜんたいを みられます。',
      'したの タブから どうぐを えらびます。もう いちど おすと やめます。',
      'ドリルを あいている マスに おくと したへ ほります。ほった ものは ドリルの うしろに でます。',
      'ちじょうに でた ものは、フォークリフトが おきばまで はこびます。トラックが はこんで、かえってきたら おかねに なります。',
      'コンベアと きかいは ちかに おきます。「あなほり」で ばしょを ひろげられます。',
      'ちじょう まんなかの じむしょで さぎょういんを やとえます。さぎょういんが いないと とても おそく なります（「z」の しるし）。つかれると やすみます。きゅうりょうは まいつき はらいます。',
      'おいた ものを タップすると むきを かえたり レベルアップ できます。',
      '「じょうほう」で ようすを グラフで みられます。',
      'したの タブの「スキル」で けんきゅうすると べんりな ちからが てに はいります。かたい がんばんは「あなほり レベル」が ないと、とても ゆっくりしか ほれません。セーブは せっていから。',
    ],
    stageUp: (n, names) => `がんばん レベル${n} とっぱ。` + (names.length ? `${names.join('と')}が できるように なりました。` : ''), stagePop: n => `がんばん レベル${n} とっぱ`,
    nextRock: 'つぎの がんばんを とっぱすると けんきゅう できます',
    hStart: 'かいしゃを はじめた（しゃちょう ひとり・ドリル1だい）', hOffice: n => `じむしょを レベル${n}に`, hStage: n => `がんばん レベル${n}を とっぱ`, hMoney: v => `おかねが ${fmt(v)}を こえた`,
    tCont: 'つづきから', tNew: 'はじめから', confirmNew: 'はじめから に しますか？（いまの あそびかけは きえます）', confirmTitle: 'タイトルに もどりますか？（じどうで セーブします）',
    dur: (h, m) => (h ? `${h}じかん` : '') + `${m}ふん`, awayCalc: t => `おかえりなさい。るすの あいだ（${t}）の こうじょうを けいさん しています…`, awayEta: n => `おわるまで あと やく${n}びょう`,
    awayDone: (t, sale, net) => `るすの あいだ（${t}）に、うりあげ ${fmt(sale)}・おかね ${net >= 0 ? '+' : ''}${fmt(net)}`,
    hAway: t => `るすの あいだ ${t} こうじょうが うごいた`, autoSaveNote: 'ゲームは じどうで セーブ されます（30びょうごと・とじる とき・タイトルに もどる とき）。',
    finance: 'おかね', history: 'れきし', histEmpty: 'まだ ありません',
    prio: 'ゆうせん', pLow: 'ひくい', pMid: 'ふつう', pHigh: 'たかい',
    iRaw: 'げんりょう', iProd: 'せいひん', iFrom: 'つくりかた', iInto: 'かこうすると', iBag: 'ふくろづめきで 5こを 1ふくろに すると、うるねが 1.2ばいに なります。',
    iWhere: { soil: 'どこでも でる。1こは やすいが、たくさん でる。', stone: 'ふかいほど おおい。クラッシャーで じゃりに できる。', iron: 'あさい ところから でる（10mより したで おおい）。',
      gold: '10mより したから でる（30mより したで おおい）。', dia: '30mより したから でる（50mより したで おおい）。' },
    autoMsg: (m, n) => `じどう プレイちゅう… ${m}/${n}ふん`, autoDone: n => `じどう プレイで ${n}ふん すすめました`,
    trade: 'とりひき', watch: 'CMを みる', tradeInfo: 'CMを みると とくてんが もらえます。つづけて みると、こうかの じかんが たされます（じょうげん あり）。',
    deal: { idle2h: ['2じかんぶん すすめる', '2じかん ほうちしたのと おなじだけ、こうじょうが すすみます。', 'ほうち'], price2: ['うるね 2ばい（30ぷん）', '30ぷんの あいだ、うるねが 2ばいに なります。', 'うるね×2'],
      wage0: ['きゅうりょう カット（はんとし）', 'はんとしの あいだ、きゅうりょうが 0に なります。', 'きゅうりょう0'], speed10: ['はやさ 10ばい（3ぷん）', '3ぷんの あいだ、じかんが 10ばいの はやさで すすみます。', 'はやさ×10'] },
    adWait: n => `CMを さいせいちゅう…あと${n}びょう`, adDummy: 'CM（じゅんびちゅう）', dealGot: n => `とりひき：${n}`, leftT: t => `あと${t}`, leftM: n => `あと${n}かげつ`,
    fac: { spa: 'おんせん', power: 'はつでんしょ', refinery: 'せいゆじょ' }, facRes: 'この しせつを ちじょうに たてられるように なります。', resFac: 'ちじょうの しせつ',
    facDesc: { spa: 'おゆを つかって、おきゃくさんが くるまで きます。かえる ときに りょうきん。', power: 'おゆ か せきゆで はつでんして、うります。', refinery: 'せきゆ 2つから ねんりょう 1つ。トラックで うります。' },
    facNoOp: 'さぎょういん なし（とても おそい）', facBuilt: n => `${n}を たてた`, guests: n => `おきゃくさん ${n}くみ`, tankOil: 'せきゆ', tankHot: 'おゆ',
    pipe: 'パイプ', pipeDesc: 'わきぐちから ちじょうまで、くだで つなぎます。ちか1だんめまで とどくと、ちじょうの タンクに たまります。',
    wellName: { oil: 'ゆせい', hot: 'おんせんの わきぐち' }, wellDesc: { oil: 'せきゆが わきつづけます。', hot: 'おゆが わきつづけます。' },
    wellOn: 'ちじょうに つながっています', wellOff: 'まだ ちじょうに つながっていません（パイプで ちか1だんめまで）',
    found: { oil: 'せきゆが でた！パイプで ちじょうに つなごう', hot: 'おんせんが わいた！パイプで ちじょうに つなごう' }, foundPop: { oil: 'せきゆ！', hot: 'おんせん！' },
    land: 'とちを かう', forSale: '売地', landBought: 'とちを かいたした', landHint: 'うりちです。しせつの「とちを かう」で かえます',
    skill: 'けんきゅう', researching: 'けんきゅうちゅう', researchDone: n => `けんきゅう おわり：${n}`, busy: 'ほかの けんきゅうちゅう です', months: 'かげつ',
    startRes: 'けんきゅう', got: 'てにいれた', resInfo: 'おかねを はらって けんきゅうすると、なんかげつか あとに スキルが てに はいります（けんきゅうは 1つずつ）。',
    sk: {
      autoConv: ['コンベア じどう おき', 'ドリルが ほりすすむと、うしろに じどうで コンベアを おきます（1マス5）。せっていで オン・オフ できます。'],
      speed: ['じかんの はやさ アップ', 'じかんの はやさが 1だんずつ はやく なります（いちばん はやくて やく 2.5ばい）。うえの ▶ を おすと かわります。'],
      dragPlus: ['なぞって おく', 'コンベアを なぞると、なぞった むきに そろえて おけます（まがりかども OK）。'],
      hr: ['ひとを みる ちから', 'あたらしく やとう ひとが Lv1 → Lv2 から はじまります。'],
      veteran: ['ベテランきょういく', 'さぎょういんの レベルが 2ばいの はやさで あがります。'],
      welfare: ['ふくりこうせい', 'さぎょういんが つかれにくく なり、やすみも はやく おわります。'],
      black: ['ブラックきぎょう', 'きゅうりょうを 2わり やすく します。'],
      digLv: ['あなほり レベル', 'かたい がんばん（10m、そのあとは 20mごと）を、1だんずつ ふつうに ほれるように なります。'],
      truck2: ['トラック ぞうしゃ', 'トラックが 1だい ふえます（なんだいでも）。'],
      speeding: ['スピードいはん', 'トラックが でかけている じかんが はんぶんに なります。'],
      beltMax: ['コンベア さいこうそく アップ', 'コンベアの レベルの じょうげんが 1つ あがります。'],
      yardPlus: ['おきば かくちょう', 'おきばから つむのが 2ばい はやく なり、やまも おおきく つめます。'],
      saveSlot: ['セーブわく ついか', 'セーブ できる ばしょが 1つ ふえます。'],
      away: ['ほうち じかん のばし', 'るすの あいだも こうじょうが うごく じかんが 30ぷん のびます（さいしょは 30ぷん・さいだい 1にち）。'],
    },
    needDig: n => `あなほり レベル${n}が ひつよう です（スキル）`,
    rockHint: n => `かたい がんばん：あなほり レベル${n}が ないと、とても ゆっくりしか ほれません`,
    quit: 'きゅうりょうが はらえず、さぎょういんが 1にん やめました',
    veinFound: 'こうみゃくだ！', autoConvOpt: 'コンベア じどう おき', secAdvOpt: 'ひしょの ていあん', coLvMsg: 'かいしゃ レベルを あげられます（タップで じむしょへ）',
    adv: { jam: 'コンベアが つまっています。ひとを つけるか、つよく しては？', buf: n => `${n}の なかに ざいりょうが たまっています`, coUp: 'かいしゃ レベルを あげられます',
      truck: 'ヤードに しげんが たまっています。トラックを つよく しては？', fork: 'ちじょうに しげんが たまっています。フォークリフトを ふやしては？',
      useRes: (a, b) => `${a}は、${b}で かこう できます`, next: 'つぎへ', none: 'いまは、ていあんは ありません' }, on: 'オン', off: 'オフ',
    saveT: 'セーブ', save: 'セーブ', load: 'ロード', slot: n => `スロット${n}`, empty: 'あき', saved: 'セーブ しました', loaded: 'ロード しました',
    confirmLoad: 'ロード しますか？（いまの じょうたいは きえます）', saveNG: 'ここでは セーブ できません',
    officeLv: 'じむしょ', capP: n => `ていいん${n}にん`, restSp: 'やすむ はやさ', full: 'じむしょが いっぱい です', techUp: 'うでまえUP',
    build: 'おく', works: 'こうじ', grpName: { drill: 'ドリル', belt: 'コンベア', pipe: 'くだ', machine: 'きかい', other: 'そのほか', fac: 'しせつ', works: 'ほる・どける' },
    fdrill: 'はやい ドリル', adrill: 'じどう ドリル', tee: 'Tじろ', cross: 'こうさ', resTool: 'おく もの', toolRes: 'これを おけるように なります。',
    digDo: 'ほる', overwriteQ: 'うわがき しますか？（いまの ものは とりのぞいて はんがく もどります）', advNote0: 'Lv2いじょうに なると、ちじょうの しごと（フォークリフト・トラック）も します。',
    facility: 'しせつ', labUnlocked: 'けんきゅうじょを たてられるように なりました（したの タブの「しせつ」から）', labWhere: 'けんきゅうじょは ちじょうの あいている マスに おけます', labOne: 'けんきゅうじょは もう たっています',
    labName: 'けんきゅうじょ', needLab: 'けんきゅうじょが ひつよう です（じむしょ レベル2で たてられます）', labBuilt: 'けんきゅうじょが たちました',
    researcher: lv => `けんきゅういん：Lv${lv}`, noResearcher: 'けんきゅういん なし（とても おそい）。Lv2いじょうの ひとが くると はやく なります',
    resMach: 'きかい', resBatch: 'まとめて つよく', resSkill: 'スキル', machRes: 'この きかいを おけるように なります。',
    batchName: 'まとめて つよく', batchDesc: 'おなじ しゅるいの せつびを、まとめて レベルアップ できるように なります。',
    machLocked: 'ほかの きかいは けんきゅうじょで けんきゅうすると つかえます', batchLocked: 'まとめて つよくは、けんきゅうじょで けんきゅうすると つかえます',
    wCount: (lv, n) => `Lv${lv} さぎょういん ${n}にん`, wBreak: (a, b, c) => `しごと${a}・いどう${b}・やすみ${c}`,
    hireLv: lv => `Lv${lv} を ふやす`, fireOne: '1にん やめてもらう', lvUpW: n => `Lv${n}に あがった`,
    advNote: 'Lv2いじょうに なると、ちじょうの しごと（フォークリフト・トラック・けんきゅうじょ）も します。',
    forkName: 'フォークリフト', buyFork: 'かう', forkMax: (n, m) => `${n}/${m}だい（じむしょの レベルで ふえる）`, forkFull: 'これいじょう おけません',
    forksMax: n => `リフト${n}だい`, driver: lv => `うんてん：Lv${lv}`, noDriver: 'うんてんしゅ なし（おそい）', truckNoDriver: 'うんてんしゅ なし（でかける じかん 2ばい）',
    author: 'キノメノ', kofi: '☞ko-fiで おうえん', tip: '☞noteで チップ',
  },
  en: {
    title: 'Dig Factory', money: 'Money', date: (y, m) => `Y${y} M${m}`, depthM: n => `${n}m`,
    pan: 'Move', drill: 'Drill', dig: 'Dig', conv: 'Conveyor', sort: 'Sorter', machine: 'Machines', remove: 'Remove', power: 'Upgrade',
    menu: 'Menu', info: 'Info', admin: 'Admin', map: 'Map',
    play: '▶︎ Play', pause: '❚❚ Pause', top: 'Top', dir: 'Dir', zoom: 'Zoom', move: 'Move', uiOpt: 'Screen', uiStd: 'Standard', uiDash: 'Tabs (test)',
    help: 'How to play', settings: 'Settings', lang: 'Text', reset: 'Restart',
    confirmReset: 'Start over from the beginning?', confirmReload: 'Reset? (reloads the page)', yes: 'Yes', no: 'No',
    noMoney: 'Not enough money', cantPlace: 'Cannot place here', underOnly: 'Drills, conveyors and machines go underground',
    cantDig: 'Cannot dig here (only next to holes connected to the surface)', maxed: 'MAX',
    drillDir: 'Drill', convDir: 'Conveyor', sortTitle: 'Sorting conveyor',
    removeQ: 'Remove it? (half refund)', lidName: 'Lid', lidOn: 'Put a lid on', lidOff: 'Take the lid off', autoDirB: 'Auto',
    lidDesc: 'You can build on the lid. Removing what is on it leaves the lid. Nothing flows while it is covered.',
    filter: 'Picks', side: 'Out to', left: 'Left', right: 'Right',
    sortInfo: 'Sends the chosen item out to the side. Everything else goes straight.',
    outDir: 'Output (front)', making: 'Working', waiting: 'Waiting', inBuf: 'Input',
    truck: 'Truck', loaded: 'Loaded', worth: 'Value', depart: 'Leave now', away: 'Away', yard: 'Yard',
    lv: n => `Lv ${n}`, levelUp: 'Level up',
    pw: { drill: 'Power', belt: 'Speed', machine: 'Work speed', truck: 'Capacity', fork: 'Capacity' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v} cells/s`, machine: v => `×${v}`, truck: v => `${v}`, fork: v => `${v}` },
    grp: { drill: 'drills', belt: 'conveyors & sorters', machine: 'machines', truck: 'truck', fork: 'forklifts' },
    allUp: (g, n) => `Level up all ${g} (${n})`, none: 'Nothing to upgrade',
    items: { soil: 'Dirt', stone: 'Stone', iron: 'Iron', gold: 'Gold', dia: 'Raw diamond', gravel: 'Gravel', brick: 'Brick',
      ironbar: 'Iron bar', goldbar: 'Gold bar', tool: 'Iron goods', jewel: 'Gold jewelry', diaClean: 'Clean diamond',
      diaCut: 'Cut diamond', gem: 'Gem', bag: 'Bag', fuel: 'Fuel' },
    mach: { kiln: 'Brick kiln', crusher: 'Crusher', smelter: 'Smelter', factory: 'Workshop', bagger: 'Bagger',
      washer: 'Washer', cutter: 'Cutter', polisher: 'Polisher' },
    glyph: { kiln: 'K', crusher: 'C', smelter: 'S', factory: 'W', bagger: 'B', washer: 'Wa', cutter: 'Cu', polisher: 'P' },
    bagRule: '5 of the same → 1 bag (value ×1.2, any number of kinds)',
    office: 'Office', workers: 'Workers', hire: 'Hire', fire: 'Dismiss', stamina: 'Stamina', tech: 'Skill',
    wage: 'Wage', perMonth: '/mo', fee: 'Signing fee', payroll: 'Payroll (monthly)', cands: 'Candidates (change monthly)',
    noCands: 'No more candidates this month', nobody: 'Nobody yet',
    wstate: { idle: 'Idle', toWork: 'Going to work', work: 'Working', drive: 'Driving', toRest: 'Going to rest', rest: 'Resting' },
    worker: n => `Worker ${n}`, manned: n => `Operator: ${n}`, unmanned: 'No operator (very slow)',
    sortRare: 'Rarities (all)', sortGrp: { raw: 'Raw', prod: 'Products' }, eject: 'Eject materials', ejecting: n => `Ejecting… (${n} left)  Stop`, payPop: 'Wages', payMsg: v => `Paid this month's wages: ${v}`,
    infoRows: { money: 'Money', mSale: 'Sales this month', mCost: 'Costs this month', mNet: 'Net this month', lNet: 'Net last month',
      tSale: 'Total sales', tCost: 'Total costs', ships: 'Shipments', deepest: 'Deepest', drills: 'Drills',
      machines: 'Machines', belts: 'Conveyors & sorters', workers: 'Workers (working)', yard: 'Items in yard', loan: 'Loan (repaid from sales)' },
    infoGrp: ['Money', 'Totals', 'Site'],
    etaD: n => `${n}d`, etaM: n => `${n}m`, etaS: n => `${n}s`, rockSlow: 'This bedrock is very hard. Tap the drill and upgrade it to dig faster.',
    coHud: n => `Company Lv${n}`, secTrip: 'Company trip', tripBtn: 'Depart', tripBtnD: 'Calls every worker back to the office and departs for space', tripMat: (g, n) => `${g} / ${n}`, tripMatNote: 'Materials gather in the office storeroom (the boss carries them; a conveyor right under the office also works)',
    tripReady: 'All trip materials are ready. Research "Construction" at the lab', tripCall: 'Emergency notice: all staff, please return to the office.', tripCount: (n, m) => `Gathering ${n}/${m}`, tripQ: 'Everyone is here. Depart?', tripGo: 'Emergency notice: the company trip is departing!',
    tripHist: n => `Company trip to space (#${n})`, spaceSub: n => `Dig Factory Tycoon - company trip #${n}`, coNeed: n => `Company Lv${n} needed`,
    roomBoss: 'Boss', roomSec: 'Secretary', roomRest: 'Break room', roomWait: 'Waiting', roomLab: n => `Lab ${n}`, roomFree: '(free)',
    secDept: 'Departments', secBoss: 'Boss', secCo: 'Company', secVeh: 'Vehicles', secBatch: 'Upgrade all', secRes: 'Research',
    deptHr: n => `HR: hired ${n}`, deptTech: n => `Engineering: upgraded ${n}`, deptSales: s2 => `Sales: raised the price of ${s2}`,
    secCome: 'From today you have a secretary. Nice to meet you.',
    yProfit: 'Profit this year', ySale: 'Sales this year', yCost: 'Costs this year', lastY: v => ` (last year ${v})`,
    oilScan: n => (n ? `Found ${n} oil fields (marked on the map)` : 'No oil fields found'),
    loanPop: 'Bank loan',
    unitN: '', unitP: '', unitK: '', unitT: '',
    gMoney: 'Money over time', gMonth: 'Monthly net (green = profit, red = loss)',
    adm: { m1: 'Money +1000', m10: 'Money +10000', maxLv: 'Max all levels', ace: 'Hire an ace worker',
      month: 'Skip 1 month', fast: 'Speed ×16', clear: 'Reveal underground (toggle)', allSk: 'All skills', finRes: 'Finish research now', tune: 'Tuning', stageUp: 'Stage jump', auto10: 'Auto play 10 min', auto60: 'Auto play 60 min', tripTest: 'Company trip (test, not counted)', pixel: 'Pixel editor' },
    tuneInfo: 'Changes apply right away (starting money, ore and hardness after Restart). Copy the result to paste in chat.',
    tuneCopy: 'Copy result', tuneCopied: 'Copied', tuneReset: 'Reset to defaults', tuneT: 'Tuning',
    helpTopics: [
      ['Controls', 'Drag with the hand (top right) or press the screen edges to scroll. Pinch, Ctrl+wheel or +/- to zoom; "Map" shows everything.\nPick tools from the tabs at the bottom; a tab opens its drawer. Tap the tool again, or the tab, to cancel. Tap anything you placed to turn it or level it up.'],
      ['Digging', 'Place drills underground (they can replace soil next to holes connected to the surface). Drills dig down. Mined items come out behind the drill and fall through the air.\nEvery 10m there is hard bedrock that needs the Dig level research (no cap; the price keeps rising). Turn a drill sideways to keep digging. "Dig" clears cells next to holes connected to the surface.'],
      ['Moving', 'Conveyors carry items; a sorter sends the chosen item to its side.\nItems that reach the surface are dropped there; forklifts carry them to the yard, and you get paid when the truck returns.'],
      ['Processing', 'Machines take input from any side but the front and output to the front. Items they do not accept pass through at half speed.\nYou start with the Brick kiln and the Crusher; research more at the Lab.'],
      ['Workers', 'Add Lv0 workers at the office. They walk to drills and machines and level up as they work; places without one show "z" and are very slow.\nFrom Lv2 they also take surface jobs (forklifts, trucks, the Lab). Tired workers rest at the office. Wages are monthly; if you cannot pay, one quits.'],
      ['Office & Lab', 'Tap the office to upgrade it: more staff, more forklifts, faster rest. At level 2 you can build the Lab (1 cell, anywhere on the surface) from the Facilities tab.\nResearch machines, batch upgrades and skills at the Lab; without a Lv2+ researcher it is very slow. Buy forklifts from "Upgrade".'],
      ['Money', 'You get paid when the truck returns. If money is low and sales are zero, the bank lends you some (repaid from sales).\n"Info" shows graphs. Save from Settings. Tap the title to reset.'],
      ['Oil & hot springs', 'Below 30m, digging out a cell may reveal a hot spring (oil below 50m). Connect the source with pipes up to the first underground row to fill the surface tank.\nOn the surface you can build a Hot spring (guests arrive by car), a Power plant (geothermal or oil) and a Refinery (oil to fuel). Surface facilities are very slow without a worker. Need room? Facilities → Buy land.'],
    ],
    helpList: [
      'Drag with the hand (top right) or use the edge arrows to scroll. Pinch, Ctrl+wheel or +/- to zoom. "Map" shows everything.',
      'Pick tools from the tabs at the bottom. A tab opens a drawer with its items. Tap again to cancel.',
      'Place a drill on an empty cell and it digs down. Mined items come out behind it. Items in the air fall.',
      'Items that reach the surface are dropped there; a little forklift carries them to the yard. The truck takes them away and you get paid when it returns.',
      'Conveyors and machines go underground. Use "Dig" to make room next to existing holes (costs money).',
      'Hire workers at the office (center of the surface; you start alone). They walk to drills and machines and run them; without one ("z" mark) they are very slow. Tired workers rest at the office. Wages are paid monthly.',
      'Tap anything you placed to turn it or level it up. Yellow dots show the level.',
      '"Info" shows how your business is doing, with graphs.',
      'Research "Skills" from the menu. Hard bedrock (10m, then every 20m) is very slow without the Dig level research. Tap the office to upgrade it. Save from Settings.',
    ],
    stageUp: (n, names) => `Broke through bedrock level ${n}.` + (names.length ? ` Now available: ${names.join(', ')}.` : ''), stagePop: n => `Bedrock ${n} cleared`,
    nextRock: 'Break through the next bedrock to research',
    hStart: 'Company founded (just the boss, one drill)', hOffice: n => `Office upgraded to level ${n}`, hStage: n => `Broke through bedrock level ${n}`, hMoney: v => `Money passed ${fmt(v)}`,
    tCont: 'Continue', tNew: 'New game', confirmNew: 'Start a new game? (your current game will be lost)', confirmTitle: 'Back to the title? (the game is saved automatically)',
    dur: (h, m) => (h ? `${h}h ` : '') + `${m}m`, awayCalc: t => `Welcome back. Working out your factory while you were away (${t})…`, awayEta: n => `About ${n}s left`,
    awayDone: (t, sale, net) => `While you were away (${t}): sales ${fmt(sale)}, money ${net >= 0 ? '+' : ''}${fmt(net)}`,
    hAway: t => `Factory ran for ${t} while away`, autoSaveNote: 'The game saves automatically (every 30s, when closing, and when returning to the title).',
    finance: 'Finance', history: 'History', histEmpty: 'Nothing yet',
    prio: 'Priority', pLow: 'Low', pMid: 'Normal', pHigh: 'High',
    iRaw: 'Raw', iProd: 'Product', iFrom: 'Made from', iInto: 'Processes into', iBag: 'Bagging 5 of the same raises the price ×1.2.',
    iWhere: { soil: 'Everywhere. Cheap, but plenty.', stone: 'More the deeper you go. A crusher turns it into gravel.', iron: 'From shallow ground (more below 10m).',
      gold: 'Below 10m (more below 30m).', dia: 'Below 30m (more below 50m).' },
    autoMsg: (m, n) => `Auto play… ${m}/${n} min`, autoDone: n => `Auto play ran ${n} minutes`,
    trade: 'Deals', watch: 'Watch ad', tradeInfo: 'Watch an ad to get a bonus. Watching again adds more time (with a cap).',
    deal: { idle2h: ['Skip 2 hours', 'Your factory runs as if you left it for 2 hours.', 'Idle'], price2: ['Double price (30 min)', 'Sale prices double for 30 minutes.', 'Price×2'],
      wage0: ['Wage cut (6 months)', 'Wages are zero for six months.', 'Wages 0'], speed10: ['Speed ×10 (3 min)', 'Time runs ten times faster for 3 minutes.', 'Speed×10'] },
    adWait: n => `Playing ad… ${n}s left`, adDummy: 'Ad (coming soon)', dealGot: n => `Deal: ${n}`, leftT: t => `${t} left`, leftM: n => `${n} mo left`,
    fac: { spa: 'Hot spring', power: 'Power plant', refinery: 'Refinery' }, facRes: 'Lets you build this facility on the surface.', resFac: 'Surface facilities',
    facDesc: { spa: 'Uses hot water. Guests come by car and pay when they leave.', power: 'Burns hot water (geothermal) or oil and sells the power on the spot.', refinery: '2 oil make 1 fuel. Fuel goes to the yard and sells by truck.' },
    facNoOp: 'No worker (very slow)', facBuilt: n => `Built ${n}`, guests: n => `${n} guests`, tankOil: 'Oil', tankHot: 'Hot water',
    pipe: 'Pipeline', pipeDesc: 'Connect a source to the surface. Once it reaches the first underground row, it fills the surface tank.',
    wellName: { oil: 'Oil well', hot: 'Hot spring source' }, wellDesc: { oil: 'Oil keeps flowing (0.5/s).', hot: 'Hot water keeps flowing (1/s).' },
    wellOn: 'Connected to the surface', wellOff: 'Not connected yet (lay pipes up to the first underground row)',
    found: { oil: 'Struck oil! Connect it to the surface with pipes', hot: 'Hot spring found! Connect it to the surface with pipes' }, foundPop: { oil: 'Oil!', hot: 'Hot spring!' },
    land: 'Buy land', forSale: 'Sale', landBought: 'Bought more land', landHint: 'Land for sale. Buy it from Facilities → Buy land',
    skill: 'R&D', researching: 'Researching', researchDone: n => `Research done: ${n}`, busy: 'Another research is in progress', months: ' mo',
    startRes: 'Research', got: 'Acquired', resInfo: 'Pay to research; the skill arrives after a few in-game months (one at a time).',
    sk: {
      autoConv: ['Auto conveyor', 'Drills lay conveyors behind them as they dig (5 per cell). Toggle in Settings.'],
      speed: ['Faster time', 'Each level adds a faster time speed (up to about 2.5x). Tap the ▶ button at the top to switch.'],
      dragPlus: ['Smart drag', 'Dragged conveyors follow the direction you draw, corners included.'],
      hr: ['HR power', 'New hires start at Lv1, then Lv2.'],
      veteran: ['Veteran training', 'Workers level up twice as fast.'],
      welfare: ['Welfare', 'Workers tire more slowly and rest faster.'],
      black: ['Black company', 'Wages are 20% cheaper.'],
      digLv: ['Dig level', 'Dig the hard bedrock (at 10m, then every 20m) at normal speed, one layer per level.'],
      truck2: ['Extra truck', 'Adds one more truck; they take turns (repeatable, each costs more).'],
      speeding: ['Speeding', 'Trucks are away for half the time.'],
      beltMax: ['Conveyor top speed', 'Raises the conveyor level cap by one.'],
      yardPlus: ['Bigger yard', 'Loading from the yard is twice as fast and the pile can grow bigger.'],
      saveSlot: ['Extra save slot', 'Adds one more save slot.'],
      away: ['Idle time', 'The factory keeps running 30 more minutes while you are away (starts at 30 min, up to 1 day).'],
    },
    needDig: n => `Needs dig level ${n} (skill)`,
    rockHint: n => `Hard bedrock: without dig level ${n} it is very slow (research it at the Lab)`,
    quit: 'Could not pay wages: one worker quit',
    veinFound: 'A vein!', autoConvOpt: 'Auto conveyor', secAdvOpt: 'Secretary tips', coLvMsg: 'You can raise the company level (tap to open the office)',
    adv: { jam: 'A conveyor is jammed. Add a worker or upgrade it?', buf: n => `Materials are piling up in the ${n}`, coUp: 'You can raise the company level',
      truck: 'Resources are piling up in the yard. Upgrade the truck?', fork: 'Resources are piling up on the surface. Buy more forklifts?',
      useRes: (a, b) => `${a} can be processed in the ${b}`, next: 'Next', none: 'No tips right now' }, on: 'On', off: 'Off',
    saveT: 'Save', save: 'Save', load: 'Load', slot: n => `Slot ${n}`, empty: 'Empty', saved: 'Saved', loaded: 'Loaded',
    confirmLoad: 'Load this save? (current game will be lost)', saveNG: 'Saving is not available here',
    officeLv: 'Office', capP: n => `${n} staff max`, restSp: 'Rest speed', full: 'The office is full', techUp: 'Skill up',
    build: 'Build', works: 'Works', grpName: { drill: 'Drills', belt: 'Conveyors', pipe: 'Pipes', machine: 'Machines', other: 'Other', fac: 'Facilities', works: 'Dig / Remove' },
    fdrill: 'Fast drill', adrill: 'Auto drill', tee: 'T-junction', cross: 'Crossing', resTool: 'Equipment', toolRes: 'Lets you place this equipment.',
    digDo: 'Dig', overwriteQ: 'Replace it? (the current one is removed for a half refund)', advNote0: 'From Lv2, workers also take surface jobs (forklifts, trucks).',
    facility: 'Facilities', labUnlocked: 'You can now build the Lab (Works tab)', labWhere: 'Place the Lab on a free surface cell', labOne: 'The Lab is already built',
    labName: 'Lab', needLab: 'You need a Lab (available at office level 2)', labBuilt: 'The Lab has been built',
    researcher: lv => `Researcher: Lv${lv}`, noResearcher: 'No researcher (very slow). A worker of Lv2+ speeds it up',
    resMach: 'Machines', resBatch: 'Batch upgrade', resSkill: 'Skills', machRes: 'Lets you build this machine.',
    batchName: 'Batch upgrade', batchDesc: 'Lets you level up all equipment of one kind at once.',
    machLocked: 'Research more machines at the Lab', batchLocked: 'Batch upgrade is unlocked by research at the Lab',
    wCount: (lv, n) => `Lv${lv} workers ×${n}`, wBreak: (a, b, c) => `working ${a} / moving ${b} / resting ${c}`,
    hireLv: lv => `Add a Lv${lv} worker`, fireOne: 'Dismiss 1', lvUpW: n => `Promoted to Lv${n}`,
    advNote: 'From Lv2, workers also take surface jobs (forklifts, trucks, the Lab).',
    forkName: 'Forklift', buyFork: 'Buy', forkMax: (n, m) => `${n}/${m} (more with office level)`, forkFull: 'No more forklifts (raise the office level)',
    forksMax: n => `${n} forklifts`, driver: lv => `Driver: Lv${lv}`, noDriver: 'No driver (slow)', truckNoDriver: 'No driver (trips take 2x)',
    author: 'Kinomeno', kofi: '☞Support on Ko-fi', tip: '☞Tip on note',
  },
};
// ---- v0.40〜で増えた言葉（足りない言葉は、漢字の言葉をそのまま使う） ----
const TXT_ADD = {
  kanji: {
    officeLv: '会社', hOffice: n => `会社をレベル${n}に`, needLab: '研究所が必要です（会社レベル2で建てられます）',
    forkMax: (n, m) => `${n}/${m}台（会社のレベルで増える）`, forkFull: 'これ以上は置けません（会社のレベルで増える）',
    landBought: '土地を買収した（左右に1マスずつ広がった）', landHint: 'よその土地です。研究「土地買収」で、左右に1マスずつ広げられます',
    companyLv: '会社レベル', placeDo: '設置する', pendNote: '掘る向きを選んで「設置する」', pendNote2: '向き（仕分けは選ぶ資源・出す側も）を選んで「設置する」',
    drillStop: n => `ドリル${n}が停止しています`, monthNet: '今月',
    loanFirstT: '銀行', loanFirst: v => `${v} 融資します。あなたに期待しています！（売上から少しずつ返します）`,
    matSoil: '土のマス：土が出る', matStone: '石のマス：石が多く出る（少し硬い）', matRock: '岩盤',
    catalog: 'カタログ', catNote: '今つくれる・売れる物の一覧（売値は今の値段）。', catSold: '売った数',
    priceSec: '売値アップ', priceName: n => `${n}の売値`, priceSpec: (m, list) => `売値 ×${m}` + (list ? `（${list}にも掛かる）` : ''),
    priceNote: '売ったことのある資源だけ出ます。加工した物・袋詰めにも同じ倍率が掛かります。', yardHas: 'ヤードの中身',
    infoPick: '見たいものを選ぶ', close: '閉じる',
    aiHire: n => `作業員を${n}人雇った`, aiCompany: n => `会社をレベル${n}に`, aiLab: '研究所を建てた', aiRes: n => `研究を始めた：${n}`,
    aiTruck: n => `トラックをレベル${n}に`, aiForkBuy: 'フォークリフトを買った', aiFork: 'フォークリフトを強化', aiDrill: 'ドリルを増やした',
    aiDrillUp: 'ドリルを強化', aiTurn: '止まったドリルを横に向けた', aiMach: n => `${n}を振り分けで設置`, aiMachUp: '機械を強化',
    aiPrice: n => `${n}の売値アップ`, aiPipe: '湧き口をパイプでつないだ', aiFac: n => `${n}を建てた`,
    aiRemove: '掘れないドリルを撤去した', aiRebuild: '使わなくなった機械を撤去した', aiUnsort: 'もっと良い使い道があるので、仕分けを外した', forkSpd: '走る速さ', valueUp: '作った物の売値', beltCapT: '1マスに乗る数', tutHello: 'ほるぞ！', tutTired: 'つらすぎる…', tutGanbaru: 'がんばるぞ！', 
    tutPick: 'どこを掘りますか？（光っているマスをタップ）', tutBuy: 'ドリルを買ってみましょう！\n（「設置」→ドリル）', tutEasy: 'これで楽になりましたね。', tutYes: '・・・ですよね',
    tut2: { kiln: '土を焼くとレンガになって、高く売れます。\nレンガ焼成機を置いてみましょう（「設置」→機械）', hire: '人を雇うと、ドリルや機械が速く動きます。\n事務所をタップして「雇う」', drillDir: 'ドリルをタップすると、掘る向きを変えられます。\n横にも掘れます。', lvup: 'ドリルをタップして強化しましょう。\n強いドリルなら、硬い岩盤も速く掘れます。', office: 'お金がたまったら、事務所で会社レベルを上げましょう。\n雇える人数や、強化できる上限が増えます。' },
    tutDone: 'ドリルやコンベアを置いて、土を出荷しましょう', tutSkipB: 'スキップ', adReady: '広告を見ると、特典がもらえます', adWatch: '広告を見る', adCancel: 'やめる', adSkip: '最後まで見なかったので、特典はありません', brandUp: (n, p) => `会社レベル${n}！ブランド力が上がりました（売値 +${p}%）`, resOnly: '未取得のみ', resAllB: 'すべて',
    yardT: 'トラックヤード', yardDesc: 'トラックが止まり、資源を置く場所（マップに1つ）。撤去でたたみ、工事の「トラックヤード」で別の所に置けます。', yardNone: 'トラックヤードがありません（工事から置いてください）',
    hBasic: '基本操作', hDig: '掘る・運ぶ', hMake: '加工と売る', hLevel: 'レベルアップと研究', hItems: '施設・設置物・資源', pleaseT: 'おねがい',
    levelHelp: '強化（下のタブ）：お金で、ドリル・機械・コンベア・トラック・フォークリフトのレベルや、資源の売値を上げます。置いた物をタップしても強化できます。\n研究（研究所）：時間をかけて、深く掘る力（掘削レベル）・高級な機械・地上の施設・会社の力（スキル）を手に入れます。研究員がいると速く進みます。\n機械や道具の多くは、段階が上がると自動で使えるようになります（研究はいりません）。',
    please: 'ご意見・ご感想をお待ちしています（Xやnoteへどうぞ）。いただいた声で、このゲームは育っています。\nこのゲームは無料で遊べます。気に入っていただけたら、応援（寄付）していただけるとうれしいです。開発を続ける力になります。',
    privacy: 'プライバシーポリシー', feedbackX: 'ご意見・ご感想（X）', feedbackNote: 'ご意見・ご感想（note）',
    yard: 'トラックヤード', elevPut: 'エレベーターを置く', seeBelow: '下の物を見る', truckAddT: 'トラック増車', truckAddN: n => `今 ${n}台（交代で出発。何台でも増やせます）`, truckAddB: '1台増やす', truckAdded: n => `トラックを増車（${n}台）`,
    hFacs: '地上の施設', hTools: '設置物', hMachs: '機械', hRes: '資源・製品（今手に入る物）', labDesc: '研究をする建物です（会社レベル2で建てられます）。研究室を増やすと、同時に研究できます。',
    toolDesc: { drill: '地面を掘り進みます。掘った資源は後ろに出ます。', fdrill: '速く掘るドリル。', adrill: 'ふさがると自分で向きを変えるドリル。', conv: '資源を運びます。なぞって続けて置けます。',
      sort: '選んだ資源だけを横へ出します。', tee: '真ん中で左右に振り分けます。', cross: '2つの流れを交差させます。', pipe: '湧き口と地上のタンクをつなぎます。', elev: '作業員が上り下りする時、とても速くなります（ほかの物の上にも置けます）。' },
    rareFound: n => `珍しい物を掘り当てました：${n}！`, museumNew: n => `博物館に新しく展示：${n}`,
    lamp: '照明', lampDesc: 'ほかの物と別の層に置けます（機械やコンベアの上にも）。周り2マスの作業が少し速くなります。', museumCol: (n, m) => `展示 ${n}/${m}種類（2つ目からは売店で1.5倍で売ります）`, elev: 'エレベーター', elevDesc: 'ほかの物と別の層に置けます（コンベアや機械の上にも）。作業員が上り下りする時、とても速くなります。撤去で外せます。',
    pickT: 'どちらを選ぶ？', granted: n => `新しく使えるようになりました：${n}`,
    bossName: lv => `社長（あなた）　Lv${lv}`, bossDesc: '給料0。雇える人数には数えません。会社が大きくなると…少しずつ貫禄が出ます。ボタンで、現場で作業するか事務所にいるかを切りかえます。',
    bossOn: '現場で作業', bossOff: '事務所にいる', bossLock: '会社レベル2で選べます',
    chipRooms: '研究室', chipRes: '研究中', chipStaff: '研究員',
    resLeft: d => `あと ${d}（×1）`, labRoomsInfo: (n, r, st) => `研究室 ${n}室・研究中 ${r}・研究員 ${st}人（研究員の数だけ同時に進みます）`, resStop: '研究員なし（ゆっくり進んでいます）',
    stageGoal: ['レンガを作る・トラックとフォークリフトを強化', '石と鉄を掘る・横穴掘削口を置く', '鉄を延べ棒にする', '延べ棒を加工する', 'ダイヤを加工する・温泉をつなぐ', 'トラックを2台にする・発電所', '石油と製油所・宝石を作る', '高級装飾品を作る', '深さの記録を伸ばす'],
    gLine: (st, theme, next) => `段階${st}：${theme}` + (next ? `\n次へ：${next}` : ''),
    gCompany: (n, left) => `会社レベル${n}（あと ${left}）`, gPermit: (n, left) => `会社レベル${n}（行政の許可）（あと ${left}）`,
    gBreak: n => `岩盤Lv${n}を掘り抜く`, gResearching: '研究「掘削レベル」中', gDigRes: n => `研究「掘削レベル」（岩盤Lv${n}）`, gLab: '研究所を建てる（工事）',
    permitBtn: n => `行政の許可待ち（会社レベル${n}）`, permitMsg: n => `この深さの掘削には、行政の許可が要ります（会社レベル${n}）`,
    facEmpty: '地上の施設：研究所で「温泉」「発電所」（段階5）・「製油所」（段階7）を研究すると、ここから建てられます。', fpsCap: n => `資源はマスごとに${n}個まで描く`, fpsParts: (a, b, c) => `計算${a}・描画${b}・画面${c}ms`, liteLv: n => `軽量化${n}`, beltInf: '無制限', beltN: n => `${n}個`,
    aiFail: c => `失敗：銀行の融資を受けた（${c}）`, aiFailRun: n => `融資を${n}回受けました（失敗）。管理メニュー「AIの失敗記録」に原因があります`,
    aiCause: { noDrill: 'ドリルが無い', drillStop: 'ドリルが全部止まっている', noWorker: '作業員がいない', yard: 'ヤードが山（トラック不足）', dock: '荷おろし場が山（フォークリフト不足）', jam: '地下で資源が詰まっている', noSale: '売上が無い', spend: 'お金の使いすぎ' },
    live10: '+10分', live60: '+60分',
    lt1m: '1分未満', durDHM: (d, h, m) => (d ? `${d}日` : '') + (d || h ? `${h}時間` : '') + `${m}分`,
    playTime: (mo, x1, others) => `ここまで：ゲーム内${mo}か月＝実際に遊ぶと ×1で${x1}（${others}）`,
    aditRule: 'その深さの資源が出続ける（岩盤と岩盤の間に1つ・レベルアップは3回まで）', aiAdit: '横穴掘削口を置いた',
    lv0Open: '会社レベル2：岩盤Lv0（5m）を破れるようになりました',
    aditHelp: ['横穴掘削口', '研究所で研究すると置けます（段階2から）。置いた深さの資源（掘った時と同じ出方）が、前から出続けます。掘り進めない代わりに、ずっと出ます。\n岩盤と岩盤の間（5〜10m、10〜20m…）に1つずつ置けます。作業員がつくと速くなり、レベルも3回まで上げられます。掘削レベルが足りずにドリルが岩盤で止まっている間の稼ぎに。'],
    items: { clay: '粘土', copper: '銅', coal: '石炭', quartz: '石英', silver: '銀', kawara: '瓦', pottery: '陶器', copperBar: '銅の延べ棒', silverBar: '銀の延べ棒', steel: '鋼', ironPlate: '鉄板', copperPlate: '銅板',
      glass: 'ガラス', luxGlass: '高級ガラス', ironPot: '鉄鍋', copperPot: '銅鍋', wireMesh: '金網', silverware: '銀食器', steelPart: '鋼の部品', concrete: 'コンクリートブロック', copperWire: '銅線', cable: '電線', goldTile: '金縁タイル',
      goldDust: '金粉', tile: 'タイル', glossTile: 'つやタイル', wire: 'ワイヤー', goldleaf: '金箔', decoIron: '高級装飾品（鉄）', decoGold: '高級装飾品（金）',
      ammonite: 'アンモナイト', fossil: '化石', haniwa: '埴輪', rareMin: '稀少鉱物', relic: '古代文明の宝', mummy: 'ミイラ' },
    fac: { museum: '博物館' }, facDesc: { museum: '掘り当てた珍しい物を展示します。お客さんが来て入場料（展示の種類が多いほど高い）。2つ目からは売店で1.5倍で売ります。' },
    mach: { drawer: '伸線機', atelier: '装飾工房', adit: '横穴掘削口', sieve: 'ふるい', roller: '圧延機', caster: '鋳造機', glassF: 'ガラス炉', metalwork: '金属加工機' }, glyph: { drawer: '伸', atelier: '飾', adit: '横', sieve: '篩', roller: '圧', caster: '鋳', glassF: '硝', metalwork: '金' },
    adm: { diary: '制作日誌', failLog: 'AIの失敗記録', failNone: 'AIの失敗記録はまだありません（自動プレイで銀行の融資を受けると、ここに原因が残ります）',
      failHead: (r, t) => `自動プレイが銀行の融資を受けた記録（新しい順）\n学んだこと：お金を残す倍率 ×${r}・トラック強化の早さ ×${t}`,
      failRow: (t, st, d, c) => `・プレイ時間${t}（×1で遊んだ時間）・段階${st}・${d}m：${c}` }, facStaff: (n, m) => `作業員 ${n}/${m}人（多いほど速い）`,
    giftMsg: v => `社長、資金が底をつきそうです。\n会長からプレゼントが届きました！\n資金 +${v}（返さなくてよいお金です）`, giftHist: '会長からプレゼント 1000',
    stageUp: (n, names) => `岩盤Lv${n}を突破しました！` + (names.length ? `\n新しく：${names.join('・')}` : ''), stagePop: n => `岩盤Lv${n}突破`, hStage: n => `岩盤Lv${n}を突破`,
    greetT: 'ごあいさつ',
    greet: '「ほりほり工場」で遊んでくれて、ありがとうございます！　作者のキノメノです。\nこれは、地面を掘って、運んで、加工して、売る。そんな小さな工場を、少しずつ大きくしていくゲームです。ドリル1台と小さな事務所から始まります。\n最初は、レンガ作りと、トラック・フォークリフトの強化を目指してみてください。会社レベルを2にすると5mの岩盤を破れて、新しい資源が出てきます。\nまだ育てている途中のゲームです。ゆっくり、深くまで掘っていってもらえたらうれしいです。',
    drillOn: '稼働中（押すと止める）', drillOff: '停止中（押すと動かす）', digUpTo: n => `（岩盤Lv${n}まで掘れる）`,
    needDig: n => (n === 0 ? '岩盤Lv0：会社レベルを2にすると破れます' : `岩盤Lv${n}：研究「掘削レベル」が必要です`),
    rockHint: n => (n === 0 ? '岩盤Lv0：会社レベルを2にすると破れます（それまでは土が半分の速さで出続けます）' : `硬い岩盤Lv${n}：研究「掘削レベル」が無いと破れません（資源は半分の速さで出続けます）`),
    help1: ['掘る', 'ドリルは地下に置きます（地上とつながった穴の隣なら、土を上書きして置けます）。置く所をタップして、掘る向きを選んで「設置する」。掘った資源はドリルの後ろに出て、空中の資源は下に落ちます。\n5mに岩盤Lv0、その後は10mごとに硬い岩盤があります。岩盤Lv0は会社レベルを2にすると、Lv1から先は研究所で「掘削レベル」を研究すると破れます。破れない間もドリルは止まらず、資源が半分の速さで出続けます。岩盤を掘り抜くと、新しい研究ができるようになります。5mより上は土しか出ません。ドリルはタップで止めたり動かしたりできます。'],
    sk: { autoHire: ['人事部', '持ち場に対して人が足りない時、自動で雇います（事務所でオン・オフ）。'],
      autoUpg: ['技術部', 'お金にかなり余裕がある時、ときどき強化します。どれを強化するかは気まぐれです（事務所でオン・オフ）。'],
      autoPrice: ['営業部', 'お金に余裕がある時、いちばん安い売値アップを自動で買います（事務所でオン・オフ）。'],
      goldUp: ['金の匂い', '金が出やすくなります（1段ごとに+10%。これから掘る所から）。'], diaUp: ['暗闇の光', 'ダイヤが出やすくなります（1段ごとに+10%。これから掘る所から）。'],
      newTech: ['新技術導入', '加工機械が速くなります（1段ごとに+5%）。'], bored: ['飽き性', '仕事の無い作業員が、早くほかの持ち場へ移ります（8秒 → 5秒 → 3秒 → 2秒）。'],
      sortPlus: ['仕分けコンベア改良', '仕分けコンベアで、選ぶ資源を複数にできます。'],
      secAdv: ['秘書の提案', '右下に秘書が出て、詰まり・溜まった材料・会社レベルなどを提案します（吹き出しをタップで、その場所へ）。'],
      oilScan: ['油田探索', '今の深さから下を調べて、油田の場所を地図に印します（1段ごとに、さらに深くまで）。'],
      warehouse: ['事務所倉庫', '事務所に倉庫の部屋ができます。社長の私物（？）を置けるようになります。'],
      trip: ['最高の社員旅行', '社員旅行の計画が始まります。必要な材料を事務所倉庫に集めましょう。社長が自分でヤードから運びます。事務所の真下まで地下からコンベアをつないでも運び込めます。'],
      build: ['建造', '事務所を、宇宙へ行ける形に作り直します。'], depart: ['出発', '事務所に「出発」ボタンができます。'],
      conne: ['コネ採用', '雇える人数が増えます（1段ごとに+10%・最低+2人。最大200人）。'],
      treasure: ['人間国宝見学', '作業員の経験がたまる速さが上がります（1段ごとに+25%）。'], statue: ['社長像', '事務所の前に、社長の銅像が建ちます。'], garden: ['屋上庭園', '事務所の屋上が森に。休憩が少し速くなります。'],
      vein: ['鉱脈探知', '地面の中の鉱脈が、灰色の粒で見えるようになります（掘り始めると資源の色に）。珍しい物（化石・埴輪など）も出やすくなります（1段ごとに+25%）。'], labRoom: ['研究室の増室', '研究室が1つ増え、同時に研究できる数が増えます（最大6室）。研究所にいる研究員の数だけ、並んで進みます。'], land: ['土地買収', '自分の土地が左右に1マスずつ広がります（研究するごとに高くなる）。'], digLv: ['掘削レベル', '硬い岩盤（10mにLv1、その後は10mごと）を1段ずつ破れるようになります（Lv0は会社レベル2で破れる）。'] },
    deal: { land: ['地上げ', '土地買収のレベルが1つ上がります（左右に1マスずつ広がる）。', '地上げ'] },
    dealMax: '上限です',
    help0: ['操作', '画面は指（マウス）でなぞると動きます。画面の端（▲▼◀▶）を押しても動きます。2本指・Ctrl＋ホイール・＋－で拡大縮小、「地図」で全体を見られます。\n下のタブを押すと引き出しが開き、道具を選べます。ドリル・機械などは1つ置くと選択が外れます。コンベアなどは続けて置けて、左下の「×」かタブを押すと外れます。ドリルは、置く所をタップしてから掘る向きを選んで「設置する」。置いた物をタップすると、向きの変更やレベルアップができます。'],
    help7: ['石油と温泉', '30mより深い所では、掘り抜くと温泉が湧くことがあります（50mより深いと石油も）。湧き口の上には何も置けません。湧き口はパイプラインでつなぎ、地下1段目まで届くと地上のタンクにたまります。\n地上には温泉（お客さんが車で来る）・発電所（地熱か石油で売電）・製油所（石油から燃料）を建てられます。地上の施設は作業員がいないととても遅くなります。土地が足りなければ、研究「土地買収」で左右に広げられます。'],
  },
  hira: {
    officeLv: 'かいしゃ', hOffice: n => `かいしゃを レベル${n}に`, needLab: 'けんきゅうじょが ひつよう です（かいしゃ レベル2で たてられます）',
    forkMax: (n, m) => `${n}/${m}だい（かいしゃの レベルで ふえる）`, forkFull: 'これいじょう おけません（かいしゃの レベルで ふえる）',
    landBought: 'とちを かった（みぎと ひだりに 1マスずつ ひろがった）', landHint: 'よその とち です。けんきゅう「とちを かう」で ひろげられます',
    companyLv: 'かいしゃ レベル', placeDo: 'おく', pendNote: 'ほる むきを えらんで「おく」', pendNote2: 'むき（しわけは えらぶ もの・だす ほうも）を えらんで「おく」',
    drillStop: n => `ドリル${n}が とまっています`, monthNet: 'こんげつ',
    loanFirstT: 'ぎんこう', loanFirst: v => `${v} かします。あなたに きたい しています！（うりあげから すこしずつ かえします）`,
    matSoil: 'つちの マス：つちが でる', matStone: 'いしの マス：いしが おおく でる（すこし かたい）', matRock: 'がんばん',
    catalog: 'カタログ', catNote: 'いま つくれる・うれる ものの いちらん（ねだんは いまの ねだん）。', catSold: 'うった かず',
    priceSec: 'ねだん アップ', priceName: n => `${n}の ねだん`, priceSpec: (m, list) => `ねだん ×${m}` + (list ? `（${list}にも かかる）` : ''),
    priceNote: 'うった ことの ある ものだけ でます。つくった ものにも おなじ ばいりつが かかります。', yardHas: 'おきばの なかみ',
    infoPick: 'みたい ものを えらぶ', close: 'とじる',
    items: { clay: 'ねんど', copper: 'どう', coal: 'せきたん', quartz: 'せきえい', silver: 'ぎん', kawara: 'かわら', pottery: 'とうき', copperBar: 'どうの のべぼう', silverBar: 'ぎんの のべぼう', steel: 'はがね', ironPlate: 'てっぱん', copperPlate: 'どうばん',
      glass: 'ガラス', luxGlass: 'こうきゅう ガラス', ironPot: 'てつの なべ', copperPot: 'どうの なべ', wireMesh: 'かなあみ', silverware: 'ぎんの しょっき', steelPart: 'はがねの ぶひん', concrete: 'コンクリート', copperWire: 'どうせん', cable: 'でんせん', goldTile: 'きんぶち タイル',
      goldDust: 'きんぷん', tile: 'タイル', glossTile: 'つやつや タイル', wire: 'ワイヤー', goldleaf: 'きんぱく', decoIron: 'こうきゅう かざり（てつ）', decoGold: 'こうきゅう かざり（きん）',
      ammonite: 'アンモナイト', fossil: 'かせき', haniwa: 'はにわ', rareMin: 'めずらしい こうせき', relic: 'こだいの たから', mummy: 'ミイラ' },
    fac: { museum: 'はくぶつかん' }, facDesc: { museum: 'めずらしい ものを かざります。おきゃくさんが きて にゅうじょうりょう。' },
    mach: { drawer: 'ひきのばし き', atelier: 'かざり こうぼう', adit: 'よこあな', sieve: 'ふるい', roller: 'のばし き', caster: 'いもの き', glassF: 'ガラス ろ', metalwork: 'きんぞく かこう き' }, glyph: { drawer: '伸', atelier: '飾', adit: '横', sieve: 'ふ', roller: 'の', caster: 'い', glassF: 'が', metalwork: 'き' }, facStaff: (n, m) => `さぎょういん ${n}/${m}にん（おおいほど はやい）`,
    adm: { diary: 'せいさく にっし', liveOn: 'じどう プレイ（みる）', liveOff: 'じどう プレイ（みる）おわり', liveOnMsg: 'じどう プレイちゅう', liveTag: 'じどう プレイちゅう' },
    giftMsg: v => `しゃちょう、おかねが なくなりそうです。\nかいちょうから プレゼントが とどきました！\nおかね +${v}（かえさなくて いい おかねです）`, giftHist: 'かいちょうから プレゼント 1000',
    stageUp: (n, names) => `がんばん Lv${n}を とっぱ しました！` + (names.length ? `\nあたらしく：${names.join('・')}` : ''), stagePop: n => `がんばん Lv${n} とっぱ`, hStage: n => `がんばん Lv${n}を とっぱ`,
    greetT: 'ごあいさつ',
    greet: '「ほりほりこうじょう」で あそんでくれて、ありがとう ございます！　つくった キノメノです。\nじめんを ほって、はこんで、つくって、うる。ちいさな こうじょうを すこしずつ おおきく していく ゲームです。\nさいしょは、レンガづくりと、トラック・フォークリフトを つよく することを めざしてみてね。かいしゃ レベルを 2に すると 5mの がんばんを われて、あたらしい しげんが でてきます。\nまだ そだてている とちゅうの ゲームです。ゆっくり、ふかくまで ほってみてください。',
    drillOn: 'うごいている（おすと とめる）', drillOff: 'とまっている（おすと うごかす）', digUpTo: n => `（がんばん Lv${n}まで ほれる）`,
    needDig: n => (n === 0 ? 'がんばん Lv0：かいしゃ レベルを 2に すると われます' : `がんばん Lv${n}：けんきゅう「あなほり レベル」が ひつよう`),
    rockHint: n => (n === 0 ? 'がんばん Lv0：かいしゃ レベルを 2に すると われます' : `かたい がんばん Lv${n}：「あなほり レベル」が ないと われません（ものは はんぶんの はやさで でます）`),
    aditRule: 'その ふかさの ものが でつづける', aiAdit: 'よこあなを おいた', lv0Open: 'かいしゃ レベル2：がんばん Lv0を われるように なりました',
    help1: ['ほる', 'ドリルは おく ところを タップして、ほる むきを えらんで「おく」。ほった ものは ドリルの うしろに でます。\n5mに がんばん Lv0、そのあとは 10mごとに かたい がんばんが あります。けんきゅうじょで「あなほり レベル」を けんきゅう しないと、とても ゆっくり です。5mより うえは つちしか でません。'],
    deal: { land: ['じあげ', '「とちを かう」の レベルが 1つ あがります。', 'じあげ'] },
    dealMax: 'もう いっぱい',
    sk: { land: ['とちを かう', 'じぶんの とちが みぎと ひだりに 1マスずつ ひろがります（けんきゅう するたびに たかく なる）。'], digLv: ['あなほり レベル', 'かたい がんばん（5mに Lv0、そのあとは 10mごと）を 1だんずつ ふつうに ほれるように なります。'],
      labRoom: ['けんきゅうしつを ふやす', 'けんきゅうしつが 1つ ふえて、いっしょに けんきゅう できる かずが ふえます（さいだい 6しつ）。'],
      vein: ['こうみゃく たんち', 'じめんの なかの こうみゃくが、はいいろの つぶで みえるように なります。めずらしい もの（かせき・はにわ など）も でやすく なります。'],
      autoHire: ['じんじぶ', 'ひとが たりない とき、じどうで やといます（じむしょで オン・オフ）。'],
      autoUpg: ['ぎじゅつぶ', 'おかねが たくさん ある とき、ときどき つよく します。どれを つよく するかは きまぐれ（じむしょで オン・オフ）。'],
      autoPrice: ['えいぎょうぶ', 'おかねに よゆうが ある とき、いちばん やすい ねだん アップを じどうで かいます（じむしょで オン・オフ）。'],
      goldUp: ['きんの におい', 'きんが でやすく なります。'], diaUp: ['くらやみの ひかり', 'ダイヤが でやすく なります。'],
      newTech: ['しんぎじゅつ', 'きかいが はやく なります。'], bored: ['あきっぽい', 'しごとの ない ひとが、はやく ほかの ばしょへ うつります。'],
      sortPlus: ['しわけコンベア かいりょう', 'しわけコンベアで、えらぶ しげんを いくつも えらべます。'],
      secAdv: ['ひしょの ていあん', 'みぎしたに ひしょが でて、つまり・たまった ざいりょう・かいしゃ レベルなどを おしえて くれます。'],
      oilScan: ['ゆでん たんさ', 'いまの ふかさから したを しらべて、ゆでんの ばしょを ちずに しるしします。'],
      warehouse: ['じむしょ そうこ', 'じむしょに そうこの へやが できます。しゃちょうの しぶつ（？）を おけます。'],
      trip: ['さいこうの しゃいん りょこう', 'しゃいん りょこうの けいかくが はじまります。ひつような ざいりょうを じむしょ そうこに あつめましょう。しゃちょうが じぶんで はこびます。じむしょの ましたまで コンベアを つないでも はこべます。'],
      build: ['けんぞう', 'じむしょを、うちゅうへ いける かたちに つくりなおします。'], depart: ['しゅっぱつ', 'じむしょに「しゅっぱつ」ボタンが できます。'],
      conne: ['コネ さいよう', 'やとえる にんずうが ふえます（さいだい 200にん）。'],
      treasure: ['にんげん こくほう けんがく', 'さぎょういんの けいけんが はやく たまります。'], statue: ['しゃちょうぞう', 'じむしょの まえに、しゃちょうの どうぞうが たちます。'],
      garden: ['おくじょう ていえん', 'じむしょの おくじょうが もりに。きゅうけいが すこし はやく なります。'],
      truck2: ['トラック ぞうしゃ', 'トラックが 1だい ふえます。'] },
    bossName: lv => `しゃちょう（あなた）　Lv${lv}`, bossDesc: 'きゅうりょう 0。やとえる にんずうには かぞえません。かいしゃが おおきく なると…すこしずつ かんろくが でます。ボタンで、げんばで はたらくか じむしょに いるかを きりかえます。',
    bossOn: 'げんばで さぎょう', bossOff: 'じむしょに いる', bossLock: 'かいしゃ レベル2で えらべます',
    resOnly: 'まだの ものだけ', resAllB: 'ぜんぶ', resLeft: d => `あと ${d}（×1）`, resStop: 'けんきゅういん なし（ゆっくり すすみます）', lt1m: '1ぷん みまん',
    labRoomsInfo: (n, r, st) => `けんきゅうしつ ${n}・けんきゅうちゅう ${r}・けんきゅういん ${st}にん`, chipRooms: 'けんきゅうしつ', chipRes: 'けんきゅうちゅう', chipStaff: 'けんきゅういん',
    tutHello: 'ほるぞ！', tutTired: 'つらすぎる…', tutGanbaru: 'がんばるぞ！', tutPick: 'どこを ほりますか？（ひかっている マスを タップ）',
    tutYes: '・・・ですよね',
    tut2: { kiln: 'つちを やくと レンガに なって、たかく うれます。\nレンガやきを おいて みましょう（「おく」→きかい）', hire: 'ひとを やとうと、ドリルや きかいが はやく うごきます。\nじむしょを タップして「やとう」', drillDir: 'ドリルを タップすると、ほる むきを かえられます。\nよこにも ほれます。', lvup: 'ドリルを タップして つよく しましょう。\nつよい ドリルなら、かたい がんばんも はやく ほれます。', office: 'おかねが たまったら、じむしょで かいしゃ レベルを あげましょう。\nやとえる にんずうや、つよく できる じょうげんが ふえます。' }, tutBuy: 'ドリルを かって みましょう！\n（「おく」→ドリル）', tutEasy: 'これで らくに なりましたね。', tutDone: 'ドリルや コンベアを おいて、つちを しゅっか しましょう', tutSkipB: 'スキップ',
    hBasic: 'きほんの そうさ', hDig: 'ほる・はこぶ', hMake: 'つくって うる', hLevel: 'レベルアップと けんきゅう', hItems: 'しせつ・おくもの・しげん', pleaseT: 'おねがい',
    hFacs: 'ちじょうの しせつ', hTools: 'おくもの', hMachs: 'きかい', hRes: 'しげん・せいひん（いま てに はいる もの）',
    please: 'ごいけん・ごかんそうを おまちして います（X や note へ どうぞ）。\nこの ゲームは むりょうで あそべます。きに いって もらえたら、おうえん して もらえると うれしいです。',
    lamp: 'しょうめい', lampDesc: 'ほかの ものと べつの そうに おけます。まわり 2マスの さぎょうが すこし はやく なります。',
    elev: 'エレベーター', elevPut: 'エレベーターを おく', seeBelow: 'したの ものを みる', pickT: 'どっちを えらぶ？',
    elevDesc: 'ほかの ものと べつの そうに おけます。さぎょういんが のぼりおり する とき、とても はやく なります。',
    truckAddT: 'トラック ぞうしゃ', truckAddN: n => `いま ${n}だい（なんだいでも ふやせます）`, truckAddB: '1だい ふやす', truckAdded: n => `トラックを ぞうしゃ（${n}だい）`,
    granted: n => `あたらしく つかえる ように なりました：${n}`, brandUp: (n, p) => `かいしゃ レベル${n}！ブランドりょくが あがった（ねだん +${p}%）`,
    rareFound: n => `めずらしい ものを ほりあてた：${n}！`, museumNew: n => `はくぶつかんに あたらしく てんじ：${n}`,
    yard: 'トラックヤード', yardNone: 'トラックヤードが ありません（こうじ から おいてね）',
    beltCapT: '1マスに のる かず', beltInf: 'むせいげん', beltN: n => `${n}こ`, valueUp: 'つくった ものの ねだん', forkSpd: 'はしる はやさ',
    playTime: (mo, x1, others) => `ここまで：ゲームで ${mo}かげつ＝×1で ${x1}（${others}）`,
    privacy: 'プライバシーポリシー', feedbackX: 'ごいけん（X）', feedbackNote: 'ごいけん（note）',
    help0: ['そうさ', 'がめんは ゆびで なぞると うごきます。がめんの はし（▲▼◀▶）を おしても うごきます。「ちず」で ぜんたいを みられます。\nしたの タブを おすと ひきだしが ひらいて、どうぐを えらべます。ドリルや きかいは 1つ おくと えらぶのが おわります。コンベアは つづけて おけて、ひだりしたの「×」か タブを おすと おわります。ドリルは、おく ところを タップしてから ほる むきを えらんで「おく」。'],
    help7: ['せきゆと おんせん', '30mより ふかい ところでは、ほりぬくと おんせんが わくことが あります（50mより ふかいと せきゆも）。わきぐちの うえには なにも おけません。わきぐちは パイプで つなぎ、ちか1だんめまで とどくと ちじょうの タンクに たまります。\nちじょうには おんせん・はつでんしょ・せいゆじょを たてられます。とちが たりなければ、けんきゅう「とちを かう」で ひろげられます。'],
  },
  en: {
    officeLv: 'Company', hOffice: n => `Company upgraded to level ${n}`, needLab: 'You need a Lab (available at company level 2)',
    forkMax: (n, m) => `${n}/${m} (more with company level)`, forkFull: 'No more forklifts (raise the company level)',
    landBought: 'Bought land (1 cell wider on each side)', landHint: "Someone else's land. Research Land purchase to widen your land",
    companyLv: 'Company level', placeDo: 'Place', pendNote: 'Pick a direction, then Place', pendNote2: 'Pick the direction (and item/side for a sorter), then Place',
    drillStop: n => `Drill ${n} has stopped`, monthNet: 'This month',
    loanFirstT: 'Bank', loanFirst: v => `We will lend you ${v}. We believe in you! (repaid little by little from sales)`,
    matSoil: 'Soil cell: gives soil', matStone: 'Stone cell: gives mostly stone (a bit harder)', matRock: 'Bedrock',
    catalog: 'Catalog', catNote: 'Everything you can make and sell now (current prices).', catSold: 'Sold',
    priceSec: 'Price up', priceName: n => `${n} price`, priceSpec: (m, list) => `Price ×${m}` + (list ? ` (also ${list})` : ''),
    priceNote: 'Only resources you have sold are shown. The same rate applies to products made from them and to bags.', yardHas: 'In the yard',
    infoPick: 'Pick a page', close: 'Close',
    aiHire: n => `Hired ${n} worker(s)`, aiCompany: n => `Company to level ${n}`, aiLab: 'Built the Lab', aiRes: n => `Research: ${n}`,
    aiTruck: n => `Truck to level ${n}`, aiForkBuy: 'Bought a forklift', aiFork: 'Upgraded a forklift', aiDrill: 'Added a drill',
    aiDrillUp: 'Upgraded drills', aiTurn: 'Turned a stuck drill', aiMach: n => `Placed ${n} with a sorter`, aiMachUp: 'Upgraded machines',
    aiPrice: n => `${n} price up`, aiPipe: 'Piped a source', aiFac: n => `Built ${n}`,
    aiRemove: 'Removed a drill that could not dig', aiRebuild: 'Removed an unused machine', aiUnsort: 'Removed a sorter (found a better use)', forkSpd: 'Speed', valueUp: 'Product value', beltCapT: 'Items per cell', tutHello: "Let's dig!", tutTired: 'This is too hard...', tutGanbaru: "Let's do this!", 
    tutPick: 'Where do you want to dig? (tap a glowing cell)', tutBuy: 'Try buying a drill!\n(Build → Drill)', tutEasy: 'That makes it easier.', tutYes: '...I bet it is.',
    tut2: { kiln: 'Baked soil becomes bricks, which sell for more.\nTry placing a Brick kiln (Build → Machines).', hire: 'Hired workers make drills and machines run faster.\nTap the office and press Hire.', drillDir: 'Tap a drill to change its digging direction.\nIt can dig sideways too.', lvup: 'Tap a drill and upgrade it.\nA stronger drill breaks hard bedrock faster.', office: 'When you have the money, raise the company level at the office.\nYou can hire more and upgrade further.' },
    tutDone: 'Place drills and conveyors, and ship the soil', tutSkipB: 'Skip', adReady: 'Watch an ad to get the reward', adWatch: 'Watch ad', adCancel: 'Cancel', adSkip: 'The ad was skipped, so no reward this time', brandUp: (n, p) => `Company level ${n}! Brand power up (prices +${p}%)`, resOnly: 'Not yet', resAllB: 'All',
    yardT: 'Truck yard', yardDesc: 'Where the truck parks and items pile up (one per map). Remove it, then place it elsewhere from Works.', yardNone: 'No truck yard (place one from Works)',
    hBasic: 'Basics', hDig: 'Dig & carry', hMake: 'Make & sell', hLevel: 'Upgrades & research', hItems: 'Buildings & items', pleaseT: 'A request',
    levelHelp: 'Upgrades (bottom tab): spend money to level up drills, machines, conveyors, the truck and forklifts, and raise prices. You can also tap a building to upgrade it.\nResearch (Lab): takes time; gives Dig level, advanced machines, surface facilities and company skills. Faster with a researcher.\nMost machines and tools unlock by themselves as you reach new stages.',
    please: 'Your thoughts and feedback help this game grow.\nThe game is free to play. If you enjoy it, a small tip would mean a lot and keeps development going.',
    privacy: 'Privacy policy', feedbackX: 'Feedback (X)', feedbackNote: 'Feedback (note)',
    yard: 'Truck yard', elevPut: 'Place elevator', seeBelow: 'Open the one below', truckAddT: 'Extra truck', truckAddN: n => `${n} now (they take turns; add as many as you like)`, truckAddB: 'Add one', truckAdded: n => `Added a truck (${n})`,
    hFacs: 'Surface facilities', hTools: 'Placeables', hMachs: 'Machines', hRes: 'Resources & products (available now)', labDesc: 'Where research happens (build at company level 2). More rooms = more research at once.',
    toolDesc: { drill: 'Digs forward; mined items come out behind.', fdrill: 'A faster drill.', adrill: 'Turns by itself when blocked.', conv: 'Carries items. Drag to lay many.',
      sort: 'Sends only the chosen item to the side.', tee: 'Splits left and right.', cross: 'Lets two flows cross.', pipe: 'Connects wells to the surface tanks.', elev: 'Workers climb much faster here (can sit over other things).' },
    rareFound: n => `Found something rare: ${n}!`, museumNew: n => `New exhibit at the museum: ${n}`,
    lamp: 'Lamp', lampDesc: 'Sits on its own layer (over machines and conveyors too). Work within 2 cells runs a little faster.', museumCol: (n, m) => `Exhibits ${n}/${m} kinds (duplicates sell at the shop ×1.5)`, elev: 'Elevator', elevDesc: 'Sits on its own layer (over conveyors and machines too). Workers climb much faster here. Remove to take it away.',
    pickT: 'Which one?', granted: n => `Now available: ${n}`,
    bossName: lv => `The boss (you)  Lv${lv}`, bossDesc: 'No wage. Not counted in the staff limit. As the company grows... so does the boss. The button switches between working on site and staying in the office.',
    bossOn: 'On site', bossOff: 'In office', bossLock: 'Available at company level 2',
    chipRooms: 'Labs', chipRes: 'Running', chipStaff: 'Researchers',
    resLeft: d => `${d} left (×1)`, labRoomsInfo: (n, r, st) => `Labs ${n} / researching ${r} / researchers ${st} (one researcher runs one research)`, resStop: 'No researcher (slow)',
    stageGoal: ['Make bricks; upgrade the truck and forklift', 'Mine stone and iron; place an adit', 'Smelt iron into bars', 'Process the bars', 'Process diamonds; pipe the hot spring', 'Get a second truck; power plant', 'Oil and refinery; make gems', 'Make luxury ornaments', 'Push your depth record'],
    gLine: (st, theme, next) => `Stage ${st}: ${theme}` + (next ? `\nNext: ${next}` : ''),
    gCompany: (n, left) => `Company level ${n} (${left} to go)`, gPermit: (n, left) => `Company level ${n} (government permit) (${left} to go)`,
    gBreak: n => `Dig through bedrock Lv${n}`, gResearching: 'Researching Dig level', gDigRes: n => `Research Dig level (bedrock Lv${n})`, gLab: 'Build the Lab (Works)',
    permitBtn: n => `Needs a permit (company level ${n})`, permitMsg: n => `Digging this deep needs a government permit (company level ${n})`,
    facEmpty: 'Research Hot spring / Power plant (stage 5) or Refinery (stage 7) at the Lab to build them on the surface here.', fpsCap: n => `drawing up to ${n} items per cell`, fpsParts: (a, b, c) => `sim ${a} / draw ${b} / UI ${c} ms`, liteLv: n => `lite ${n}`, beltInf: 'Unlimited', beltN: n => `${n}`,
    aiFail: c => `Failed: took a bank loan (${c})`, aiFailRun: n => `Took ${n} bank loan(s) (failure). See Admin > AI failure log`,
    aiCause: { noDrill: 'no drill', drillStop: 'all drills stopped', noWorker: 'no workers', yard: 'yard piled up (truck too small)', dock: 'docks piled up (forklifts)', jam: 'items jammed underground', noSale: 'no sales', spend: 'overspending' },
    live10: '+10 min', live60: '+60 min',
    lt1m: '<1m', durDHM: (d, h, m) => (d ? `${d}d ` : '') + (d || h ? `${h}h ` : '') + `${m}m`,
    playTime: (mo, x1, others) => `So far: ${mo} months in game = ${x1} of real play at ×1 (${others})`,
    aditRule: 'Keeps giving the resources of its depth (one between each pair of bedrocks)', aiAdit: 'Placed an adit',
    lv0Open: 'Company level 2: you can now break bedrock Lv0 (5m)',
    aditHelp: ['Adit', 'Research it at the Lab (from stage 2). It keeps giving the resources of the depth it sits at, out of its front. It never moves on, but never runs out.\nOne per band between bedrocks (5-10m, 10-20m...). Workers make it faster, and you can level it up. Good income while drills wait at bedrock.'],
    items: { clay: 'Clay', copper: 'Copper', coal: 'Coal', quartz: 'Quartz', silver: 'Silver', kawara: 'Roof tile', pottery: 'Pottery', copperBar: 'Copper bar', silverBar: 'Silver bar', steel: 'Steel', ironPlate: 'Iron plate', copperPlate: 'Copper plate',
      glass: 'Glass', luxGlass: 'Fine glass', ironPot: 'Iron pot', copperPot: 'Copper pot', wireMesh: 'Wire mesh', silverware: 'Silverware', steelPart: 'Steel parts', concrete: 'Concrete block', copperWire: 'Copper wire', cable: 'Cable', goldTile: 'Gold-rim tile',
      goldDust: 'Gold dust', tile: 'Tile', glossTile: 'Glossy tile', wire: 'Wire', goldleaf: 'Gold leaf', decoIron: 'Luxury ornament (iron)', decoGold: 'Luxury ornament (gold)',
      ammonite: 'Ammonite', fossil: 'Fossil', haniwa: 'Haniwa', rareMin: 'Rare mineral', relic: 'Ancient treasure', mummy: 'Mummy' },
    fac: { museum: 'Museum' }, facDesc: { museum: 'Shows the rare things you dig up. Visitors pay admission (more kinds, higher fee). Duplicates sell at the shop ×1.5.' },
    mach: { drawer: 'Wire drawer', atelier: 'Ornament workshop', adit: 'Adit', sieve: 'Sieve', roller: 'Rolling mill', caster: 'Caster', glassF: 'Glass furnace', metalwork: 'Metalworks' }, glyph: { drawer: 'W', atelier: 'O', adit: 'A', sieve: 'Sv', roller: 'R', caster: 'Ca', glassF: 'G', metalwork: 'M' }, facStaff: (n, m) => `Workers ${n}/${m} (more = faster)`,
    adm: { failLog: 'AI failure log', failNone: 'No AI failures yet (they are recorded when auto play takes a bank loan)',
      failHead: (r, t) => `Times auto play took a bank loan (newest first)\nLearned: money reserve ×${r}, truck priority ×${t}`,
      failRow: (t, st, d, c) => `- at ${t}, stage ${st}, ${d}m: ${c}`, diary: 'Dev diary', liveOn: 'Auto play (watch)', liveOff: 'Stop auto play (watch)', liveOnMsg: 'Auto play: the AI decides every 3 seconds', liveTag: 'Auto play' },
    giftMsg: v => `Boss, we are almost out of money.\nA present from the chairman has arrived!\nMoney +${v} (no need to pay it back)`, giftHist: 'Present from the chairman: 1000',
    stageUp: (n, names) => `Broke through bedrock Lv${n}!` + (names.length ? `\nNew: ${names.join(', ')}` : ''), stagePop: n => `Bedrock Lv${n} cleared`, hStage: n => `Broke through bedrock Lv${n}`,
    greetT: 'Welcome',
    greet: 'Thank you for playing Dig Factory! I am Kinomeno, the maker.\nDig the ground, carry, process and sell: grow a tiny factory, little by little. You start with one drill and a small office.\nFirst, try making bricks and upgrading the truck and forklift. Raise the company to level 2 to break the bedrock at 5m and find new resources.\nThe game is still growing. I hope you enjoy digging deep, at your own pace.',
    drillOn: 'Running (tap to stop)', drillOff: 'Stopped (tap to start)', digUpTo: n => ` (bedrock Lv${n} and above)`,
    needDig: n => (n === 0 ? 'Bedrock Lv0: raise the company to level 2 to break it' : `Bedrock Lv${n}: research Dig level first`),
    rockHint: n => (n === 0 ? 'Bedrock Lv0: raise the company to level 2 to break it (soil keeps coming at half speed)' : `Hard bedrock Lv${n}: cannot break it without Dig level (resources keep coming at half speed)`),
    help1: ['Digging', 'Tap a spot, pick a direction and Place to put a drill. Mined items come out behind the drill and fall through the air.\nBedrock Lv0 is at 5m (break it at company level 2), then every 10m (research Dig level). Until then drills keep running and give resources at half speed. Above 5m there is only soil. Tap a drill to stop or start it.'],
    sk: { autoHire: ['HR department', 'Hires automatically when posts outnumber staff (toggle in the office).'],
      autoUpg: ['Tech department', 'Sometimes upgrades something when money is plentiful. It picks on a whim (toggle in the office).'],
      autoPrice: ['Sales dept.', 'Buys the cheapest price-up when you can afford it (toggle in the office).'],
      goldUp: ['Nose for gold', 'More gold (+10% per level, in cells dug from now on).'], diaUp: ['Light in the dark', 'More diamonds (+10% per level, in cells dug from now on).'],
      newTech: ['New technology', 'Machines run faster (+5% per level).'], bored: ['Easily bored', 'Idle workers move on sooner (8s → 5s → 3s → 2s).'],
      sortPlus: ['Better sorter', 'Sorting conveyors can pick more than one resource.'],
      secAdv: ['Secretary tips', 'Your secretary appears at the bottom right with tips: jams, piled-up materials, company level and more (tap a tip to go there).'],
      oilScan: ['Oil survey', 'Surveys below your current depth and marks oil fields on the map (deeper each level).'],
      warehouse: ['Office storeroom', 'Adds a storeroom to the office. The boss can keep personal things (?) there.'],
      trip: ['The best company trip', 'Planning starts. Collect the materials in the office storeroom. The boss carries them from the yard; a conveyor coming up right under the office also delivers.'],
      build: ['Construction', 'Rebuilds the office into something that can reach space.'], depart: ['Departure', 'Adds a Depart button to the office.'],
      conne: ['Connections', 'More staff you can hire (+10% per level, at least +2; up to 200).'],
      treasure: ['Master craftsman tour', 'Workers gain experience faster (+25% per level).'], statue: ['Boss statue', 'A bronze statue of the boss stands at the entrance.'], garden: ['Rooftop garden', 'A forest on the office roof. Rest is a little faster.'],
      vein: ['Vein finder', 'Ore veins underground show as grey specks (in colour once you dig into them). Rare finds (fossils, haniwa...) also appear more often (+25% per level).'], labRoom: ['Extra lab room', 'Adds a lab room so more research can run at once (up to 6). Each research needs its own researcher in the Lab.'], land: ['Land purchase', 'Your land grows by 1 cell on each side (each purchase costs more).'], digLv: ['Dig level', 'Break hard bedrock (Lv1 at 10m, then every 10m), one layer per level (Lv0 breaks at company level 2).'] },
    deal: { land: ['Land deal', 'Raises Land purchase by one level (1 cell wider on each side).', 'Land'] },
    dealMax: 'Maxed',
    help0: ['Controls', 'Swipe the screen to scroll (or press the screen edges). Pinch, Ctrl+wheel or +/- to zoom; "Map" shows everything.\nPick tools from the tabs at the bottom. Drills and machines are deselected after placing one; conveyors stay selected until you press the "x" (bottom left) or a tab. For a drill, tap the spot, pick a direction, then Place.'],
    help7: ['Oil & hot springs', 'Below 30m, digging out a cell may reveal a hot spring (oil below 50m). Nothing can be built on a source. Connect it with pipes up to the first underground row to fill the surface tank.\nOn the surface you can build a Hot spring, a Power plant and a Refinery. Surface facilities are very slow without a worker. Need room? Research Land purchase.'],
  },
};
for (const l of Object.keys(TXT_ADD)) {
  const a = TXT_ADD[l];
  for (const k of Object.keys(a)) {
    if (k === 'sk' || k === 'deal') Object.assign(TXT[l][k], a[k]);
    else if (k === 'help0') TXT[l].helpTopics[0] = a[k];
    else if (k === 'help7') TXT[l].helpTopics[7] = a[k];
    else if (k === 'help1') TXT[l].helpTopics[1] = a[k];
    else if (k === 'adm' || k === 'items' || k === 'mach' || k === 'glyph' || k === 'fac' || k === 'facDesc') Object.assign(TXT[l][k] || (TXT[l][k] = {}), a[k]);   // 中の言葉は足す（上書きしない）
    else TXT[l][k] = a[k];
  }
}
for (const l of ['hira', 'en']) for (const k of Object.keys(TXT.kanji)) if (TXT[l][k] === undefined) TXT[l][k] = TXT.kanji[k];
// 中の言葉（研究の名前・管理メニューなど）も、足りない物は漢字の言葉で補う
for (const l of ['hira', 'en']) for (const k of Object.keys(TXT.kanji)) {
  const v = TXT.kanji[k];
  if (v && typeof v === 'object' && !Array.isArray(v) && TXT[l][k] !== v) for (const k2 of Object.keys(v)) if (TXT[l][k][k2] === undefined) TXT[l][k][k2] = v[k2];
}

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
const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inB = (c, r) => c >= S.landL && c <= S.landR && r >= 0;   // 自分の土地の中か
const isBelt = s => !!s && (s.type === 'conv' || s.type === 'sort' || s.type === 'tee' || s.type === 'cross');
const isLineLike = s => isBelt(s) || (!!s && s.type === 'pipe');   // コンベア・パイプ：撤去・上書きを尋ねない
const isDrillTool = t => t === 'drill' || t === 'fdrill' || t === 'adrill';
const isStation = s => !!s && (s.type === 'drill' || s.type === 'machine' || s.type === 'conv' || s.type === 'sort' || s.type === 'tee' || s.type === 'cross');   // 作業員がつく物（コンベア類も）
const isYard = (c, r) => r === YARD_R && c === YARD_C;
const isOffice = (c, r) => r === YARD_R && (c === OFFICE_C || c === OFFICE_C + 1);
const isLab = (c, r) => S.lab.built && c === S.lab.c && r <= YARD_R && r >= YARD_R + 1 - Math.ceil(0.95 + (labRooms() - 1) * 0.42 + 0.2);   // 増室して上に積んだ階も   // 研究所（1マス・地上のどこでも）
const labC = () => (S.lab.built ? S.lab.c : OFFICE_C + 1);
// 地上（施設の段）で空いているマス：施設どうしだけが重ならない。地下とはお互いに干渉しない
const facAt = c => S.fac.find(f => f.c === c);
const owned = c => c >= S.landL && c <= S.landR;
const surfaceFree = c => inB(c, YARD_R) && owned(c) && !isYard(c, YARD_R) && !isOffice(c, YARD_R) && !isLab(c, YARD_R) && !facAt(c);
const OFFICE_K = key(OFFICE_C + 1, YARD_R);   // 事務所の出入り口
// 元の資源（売値アップの倍率をどれに掛けるか）
const ROOT = { clay: 'soil', kawara: 'soil', pottery: 'soil', concrete: 'stone', glass: 'stone', copper: 'iron', copperBar: 'iron', copperPlate: 'iron', copperPot: 'iron', copperWire: 'iron', cable: 'iron',
  ironPlate: 'iron', ironPot: 'iron', wireMesh: 'iron', steel: 'iron', steelPart: 'iron', coal: 'fuel', quartz: 'dia', luxGlass: 'dia', silver: 'gold', silverBar: 'gold', silverware: 'gold', goldTile: 'gold',
  goldDust: 'gold', soil: 'soil', brick: 'soil', stone: 'stone', gravel: 'stone', tile: 'stone', glossTile: 'stone', iron: 'iron', ironbar: 'iron', tool: 'iron', wire: 'iron',
  gold: 'gold', goldbar: 'gold', jewel: 'gold', goldleaf: 'gold', dia: 'dia', diaClean: 'dia', diaCut: 'dia', gem: 'dia', decoIron: 'dia', decoGold: 'dia', fuel: 'fuel',
  ammonite: 'dia', fossil: 'dia', haniwa: 'dia', rareMin: 'dia', relic: 'dia', mummy: 'dia' };
const ROOT_ORDER = ['soil', 'stone', 'iron', 'gold', 'dia', 'fuel'];
const rootOf = it => ROOT[it.k === 'bag' ? it.of : it.k] || 'soil';
const PRICE_BASE = { soil: 120, stone: 160, iron: 350, gold: 900, dia: 2200, fuel: 1500 };   // 売値アップ1回目の値段
const priceLv = r => (S.priceLv && S.priceLv[r]) || 0;
const priceMul = r => Math.pow(BAL.priceUpMul, priceLv(r));                                         // 1回ごとに1.15倍
const priceCost = r => Math.round(PRICE_BASE[r] * Math.pow(BAL.priceCostG, priceLv(r)) * TUNE.resCost / 10) * 10;
const itemVal = it => Math.round((it.v !== undefined ? it.v : ITEMS[it.k].v) * TUNE.price * priceMul(rootOf(it)) * brandMul());   // 売値（調整の倍率・売値アップつき）
function priceUp(r) {
  const c = priceCost(r);
  if (S.money < c) { say(tx().noMoney); return; }
  spend(c, BED + 0.5, YARD_R); S.priceLv = S.priceLv || {}; S.priceLv[r] = priceLv(r) + 1;
}
const grpOf = s => (s === 'truck' ? 'truck' : s.type === 'fork' ? 'fork' : s.type === 'drill' ? 'drill' : isBelt(s) ? 'belt' : 'machine');
const lvOf = s => (s === 'truck' ? S.truck.lv : s.lv);
const valOf = s => lvVal(grpOf(s), lvOf(s));
const sk = id => (S.skills[id] || 0);
const lvCap = g => (g === 'belt' ? BELT_CAP.length - 1 : LV[g].cap);   // レベルの上限
const BELT_CAP = [1, 2, 5, 10, 100];   // v0.98：最大レベルも100まで（無制限はやめる）   // コンベア1マスに同時に乗る数（レベルごと。最大レベルは無制限）
const beltCap = s => BELT_CAP[Math.min(s.lv || 0, BELT_CAP.length - 1)];
// 時間の速さ：最初は×1だけ。スキルで増える（管理メニューの×16はテスト用）
function speeds() { const a = autoLive ? [1, 2, 4, 8] : [1, 1.5, 2, 2.5].slice(0, 1 + sk('speed')); if (S.adminFast || autoLive) a.push(16); return a; }   // v1.01：研究で手に入る速さは2.5倍まで（自動プレイを見る間は16倍まで）
const drainMul = () => [1, 0.75, 0.5][sk('welfare')];                         // 福利厚生：疲れにくい
// 会社レベル：表の先も上限なし。値段はインフレ（3倍ずつ）、定員は1.3倍ずつ、フォークリフトは1台ずつ、休憩は0.25ずつ
const offLast = a => a[a.length - 1];
const offCost = lv => (lv < OFFICE_LV.cost.length ? OFFICE_LV.cost[lv] : Math.round(offLast(OFFICE_LV.cost) * Math.pow(BAL.offCostG, lv - OFFICE_LV.cost.length + 1) / 1000) * 1000);
const offCap0 = lv => (lv < OFFICE_LV.cap.length ? OFFICE_LV.cap[lv] : Math.round(offLast(OFFICE_LV.cap) * Math.pow(BAL.offCapG, lv - OFFICE_LV.cap.length + 1)));
const offCap = lv => { const b = offCap0(lv), n = S ? sk('conne') : 0; return Math.min(BAL.capMax, b + n * Math.max(2, Math.round(b * BAL.conneP))); };   // コネ採用で増える   // 定員は200人まで（重くならないように）
const offForks = lv => (lv < OFFICE_LV.forks.length ? OFFICE_LV.forks[lv] : offLast(OFFICE_LV.forks) + 4 * (lv - OFFICE_LV.forks.length + 1));   // v0.98：1台で運べる数が減ったので、台数を多く
const offRest = lv => (lv < OFFICE_LV.rest.length ? OFFICE_LV.rest[lv] : offLast(OFFICE_LV.rest) + 0.25 * (lv - OFFICE_LV.rest.length + 1));
const brandMul = () => Math.pow(BAL.brandMul, Math.floor((S.office.lv + 1) / 10));   // 会社レベル10・20…ごとに、売値が上がる（ブランド力）
const restMul = () => [1, 1.5, 2][sk('welfare')] * offRest(S.office.lv) * (sk('garden') ? 1.2 : 1); // 休憩の速さ（屋上庭園で少し速い）
const newTruck = phase => ({ type: 'truck', op: null, load: 0, value: 0, phase, t: 0, acc: 0 });

// ■をつくる（中身は見えない）
// 硬さ（1個出すのに必要な削る量）：浅い所はやわらかく、深いほどどんどん硬くなる（放置しても進みにくい→強化したくなる）
// 1マスを掘りきるのに要る力の合計（v0.79）
// 岩盤Lv0（5m）＝ドリルLv3で約20秒。次の岩盤は、その4300倍（同じドリルで約24時間）
// 岩盤と岩盤の間の地面：上の岩盤と同じ硬さから始まり、次の岩盤の真上で約19倍まで（BAL.zoneHard）、だんだん硬くなる
const ROCK_HP0 = 56, ROCK_G = 4300;   // v0.95：ドリルLv3（作業員つき）で岩盤Lv0が約20秒になるように
const rockHp = n => ROCK_HP0 * Math.pow(ROCK_G, n - 1);   // 岩盤（中の番号n：1＝5m）
function cellHp(d) {
  if (d < layerDepth(1)) return 14 * Math.pow(40 / 14, d / layerDepth(1));   // 最初の岩盤まで：やわらかい
  let n = 1; while (layerDepth(n + 1) <= d) n++;
  const f = (d - layerDepth(n)) / (layerDepth(n + 1) - layerDepth(n));
  return rockHp(n) * Math.pow(ROCK_G, BAL.zoneHard * f);
}
const hardAt = d => cellHp(d) / 14 * TUNE.hard;   // 古い呼び方（1つ分の硬さの目安）
function makeBlock(r) {
  const d = r - SKY, ly = layerAt(d);
  if (ly) {   // 硬い岩盤（掘削レベルが無いと、とても遅くしか掘れない）
    return { mat: 'rock', layer: ly, ore: null, yieldN: 4, left: 4, h: rockHp(ly) * TUNE.hard / 4, p: 0 };
  }
  const stone = d >= 5 && Math.random() < clamp(0.04 + 0.02 * d, 0, 0.6);   // 岩盤Lv0（5m）より上は土だけ
  const ore = oreRoll(d), O = TUNE.ore;
  const yieldN = Math.round(Math.min(30, 14 + Math.floor(d / 4)) * TUNE.yield);   // 1マスから出る数（たくさん出て、コンベアがにぎやかに）
  const hp = cellHp(d) * TUNE.hard * (stone ? 1.3 : 1), yN = Math.min(BAL.itemMax, Math.max(yieldN, Math.round(hp / BAL.itemHp)));   // 硬いマスほど、たくさん出る（稼ぎはドリルの力で決まる）
  const h = hp / yN;   // 1つ出すのに要る力
  const y2 = Math.random(), pocket = d >= 50 && y2 < BAL.oilP * O ? 'oil' : d >= 30 && y2 < BAL.hotP * O ? 'hot' : null;   // 掘り抜くと湧き口になる
  return { mat: stone ? 'stone' : 'soil', ore, yieldN: yN, left: yN, h, p: 0, pocket };
}
// その深さで鉱石が入っているか（入っていなければ null）
// 段階1(〜10m)：鉄が少し／段階2(10〜30m)：鉄が多く・金が少し／段階3(30〜50m)：金が多く・ダイヤが少し／段階4(50m〜)：ダイヤが多く
function oreRoll(d) {
  const O = TUNE.ore;
  const list = [   // 珍しい物から順に（v0.83：粘土 5〜15m・銅 10m〜・石炭 20m〜・石英 30m〜・銀 40m〜）
    ['dia', (d < 30 ? 0 : d < 50 ? BAL.diaP30 : BAL.diaP50) * (1 + 0.1 * sk('diaUp'))],   // 暗闇の光
    ['silver', d < 40 ? 0 : BAL.silverP],
    ['gold', (d < 10 ? 0 : d < 30 ? BAL.goldP10 : BAL.goldP30) * (1 + 0.1 * sk('goldUp'))],   // 金の匂い
    ['quartz', d < 30 ? 0 : BAL.quartzP],
    ['copper', d < 10 ? 0 : d < 40 ? BAL.copperP : BAL.copperP / 2],
    ['coal', d < 20 ? 0 : BAL.coalP],
    ['iron', d < 5 ? 0 : d < 10 ? BAL.ironP5 : BAL.ironP10],
    ['clay', d >= 5 && d < 15 ? BAL.clayP : 0],
  ];
  let x = Math.random();
  for (const [k, pr] of list) { const q = pr * O; if (x < q) return k; x -= q; }
  return null;
}
function oreFrom(b) {
  if (b.mat === 'rock') {   // 岩盤：その深さの普通のマスと同じ割合で出る（浅い所はほとんど土）
    const d = layerDepth(b.layer), o = oreRoll(d);
    if (o && Math.random() < 0.5) return o;
    return d >= 5 && Math.random() < clamp(0.04 + 0.02 * d, 0, 0.6) ? 'stone' : 'soil';
  }
  const share = { iron: 0.6, gold: 0.5, dia: 0.4, clay: 0.6, copper: 0.55, coal: 0.6, quartz: 0.4, silver: 0.45 };   // v0.72：鉱石のマスから出る鉱石の割合を多く
  return b.ore && Math.random() < share[b.ore] ? b.ore : b.mat;
}
// 鉱脈：これから作る地面の少し先まで、鉱脈の中心を決めておく（10段に1つくらい）
function makeVeins(upto) {
  S.veins = S.veins || [];
  let r = Math.max(S.veinTo || 0, SKY + 6);
  while (r < upto) {
    const rr = r + Math.floor(Math.random() * 10), d = rr - SKY;
    const ks = ['iron', ...(d < 15 ? ['clay'] : []), ...(d >= 10 ? ['gold', 'copper'] : []), ...(d >= 20 ? ['coal'] : []), ...(d >= 30 ? ['dia', 'quartz'] : []), ...(d >= 40 ? ['silver'] : [])];
    if (!layerAt(d)) S.veins.push({ c: Math.floor(Math.random() * COLS), r: rr, k: ks[Math.floor(Math.random() * ks.length)], rad: 2 + Math.floor(Math.random() * 2) });
    r += 10;
  }
  S.veinTo = r;
}
// そのマスに鉱脈の出やすさがあれば [資源, 強さ0〜1]（中心ほど強い）
function veinAt(c, r) {
  for (const v of S.veins || []) {
    const dd = Math.hypot(c - v.c, r - v.r); if (dd > v.rad + 0.5) continue;
    return [v.k, 1 - dd / (v.rad + 1), v];
  }
  return null;
}
function veinDug(c, r) {   // 鉱脈のマスを掘った：その鉱脈は色が見えるようになる（初めての時は「鉱脈だ！」）
  const vn = S.veins && S.veins.length ? veinAt(c, r) : null; if (!vn || vn[2].found) return;
  vn[2].found = true;
  if (catchBusy || autoBusy) return;
  let best = null, bd = 4;
  for (const w of S.workers) { const d = Math.hypot(w.x - (c + 0.5), w.y - (r + 0.5)); if (d < bd) { bd = d; best = w; } }
  if (best) bubble(best, tx().veinFound, 2.6);
}
function row(r) {
  let a = S.rows.get(r);
  if (!a) {
    a = [];
    if (r >= SKY && r + 4 > (S.veinTo || 0)) makeVeins(r + 30);
    for (let c = 0; c < COLS; c++) {
      const b = r < SKY ? null : makeBlock(r);
      const vn = b && b.mat !== 'rock' && veinAt(c, r);
      if (vn && Math.random() < 0.3 + 0.65 * vn[1]) b.ore = vn[0];   // 鉱脈の中心はほとんど鉱石
      a.push(b);
    }
    S.rows.set(r, a);
  }
  return a;
}
const blk = (c, r) => (r < 0 ? null : row(r)[c]);
const digCost = b => Math.round((10 + Math.sqrt(b.h * b.yieldN) * 6) * TUNE.digCost);  // 掘削の費用（硬いほど高い。v0.85：硬さの平方根で、上がりすぎない）

// ---- 作業員 ----
// 作業員：見た目の個性は出さず「Lv」で管理。内部で少しだけばらつき（体力 vs・腕 vt）
const maxStamina = w => Math.round((60 + 10 * w.lv) * (w.vs || 1));   // 働ける秒数
const techFactor = w => (1 + 0.15 * w.lv) * (w.vt || 1);              // 作業の速さ
function addWorker(lv) {
  const w = {
    id: ++S.wid, lv, exp: lv ? LV_EXP[lv - 1] : 0, vs: rand(0.9, 1.1), vt: rand(0.92, 1.08),
    stamina: 0, state: 'idle', x: OFFICE_C + 1.5, y: YARD_R + 0.5, path: [], target: null,
  };
  w.stamina = maxStamina(w);
  S.workers.push(w);
  return w;
}
// 社長：特別な作業員（雇える人数に数えない・辞めない・給料0）。会社が大きくなると、じわじわ太る
function addBoss() { const w = addWorker(0); w.boss = true; S.bossWork = true; S.bossFat = 0; return w; }
const bossOf = () => S.workers.find(w => w.boss);
const bossFatTarget = () => Math.min(1.2, BAL.bossFatPer * S.office.lv);                  // 会社レベルごとに13%ずつ横に（目標）
function updateBoss(dt) {
  const t = bossFatTarget();
  S.bossFat = (S.bossFat || 0) + Math.sign(t - (S.bossFat || 0)) * Math.min(Math.abs(t - (S.bossFat || 0)), dt * BAL.bossFatRate);   // 1分で0.6%ずつ（あれ？太ってない？）
}
// 作業員のレベルの上限：8（人間国宝見学で+2ずつ）。8の先に要る経験は1.3倍ずつ
const maxWorkerLv = () => Infinity;   // v0.79：上限なし
const expNeed = lv => (lv < LV_EXP.length ? LV_EXP[lv] : Math.round(LV_EXP[LV_EXP.length - 1] * Math.pow(1.3, lv - LV_EXP.length + 1)));
const hireLv = () => Math.min(2, sk('hr'));   // 雇う人のレベル（人事力で上がる）
function gainExp(w, dt) {
  if (!w.ex) w.ex = 0.7 + Math.random() * 0.6;   // 覚えの速さ（人ごと。レベルがばらける）
  w.exp += w.ex * dt * (sk('veteran') ? 2 : 1) * (1 + 0.25 * sk('treasure'));   // 人間国宝見学：経験がたまる速さ+25%ずつ
  if (w.lv < maxWorkerLv() && w.exp >= expNeed(w.lv)) { w.lv++; w.stamina = Math.min(w.stamina + 10, maxStamina(w)); bubble(w, 'Lv' + w.lv + '!'); }   // v0.97：頭の上に吹き出し
}

function newGame() {
  S = {
    rows: new Map(),
    st: new Map(),      // 設備：key -> {type:'drill'|'conv'|'sort'|'machine', dir, lv, op?, ...}
    items: [],          // 資源レイヤー：{k, x, y, vy, lane, spd, ox, oy, tk, v?, of?}
    yard: [],           // ヤードに溜まった資源：{k, v?, of?, rx, ry}
    money: TUNE.startMoney,
    truck: { lv: 0 }, fleet: [newTruck('here')],   // トラック（レベルは共通）
    skills: {}, researches: [], opts: { autoConv: true }, office: { lv: 0 }, adminFast: false,
    workers: [], wid: 0, month: 0, elev: {}, lamps: {}, lids: {}, veins: [], veinTo: 0, museum: {}, seen: {}, seenRes: {}, seenIt: { soil: 1 },
    lab: { type: 'lab', built: false, op: null },   // 研究所
    unlock: { kiln: true },                         // 研究で使えるようになった物（クラッシャーは岩盤Lv0を抜けると）
    time: 0,
    deepest: SKY + 1,   // 最初のドリルの深さ（5mの岩盤Lv0より上から始まる）
    pops: [],
    dock: {},           // 地上に出て、フォークリフトを待っている資源（列ごと）
    forks: [],          // フォークリフト（最初から1台）
    digVer: 0,          // 地形が変わった回数（掘れる場所・歩ける道の再計算用）
    stats: { saleTotal: 0, costTotal: 0, ships: 0, cur: { sale: 0, cost: 0 }, months: [], hist: [], histT: 0 },
    reveal: false,
    sold: {}, priceLv: {},   // 売った物の数（'@資源'＝その系統を売った）・売値アップのレベル
    loan1: false,            // 最初の融資（1000）を受けたか
    stage: 1,           // 段階（岩盤を掘り抜くと上がる。新しい研究が出る）
    history: [],        // 会社の履歴（年月つき）
    moneyMark: 0,       // 資金の節目（履歴用）
    boost: { priceT: 0, wageM: 0, speedUntil: 0 },   // 取引の効果：売値2倍の残り秒・給料カットの残り月・速さ10倍の終わる時刻
    fac: [],            // 地上の施設 {type:'fac', f, c, op, t}
    tank: { oil: 0, hot: 0 },   // 地上のタンク
    cars: [],           // 温泉のお客さんの車
    landL: LAND0[0], landR: LAND0[1],   // 持っている土地（列の左端・右端）
    stVer: 0,           // 設備が変わった回数（パイプのつながりの再計算用）
  };
  // 最初は社長ひとり（自分）。給料0・赤いヘルメット。ほかの作業員は事務所で雇う
  addBoss();
  S.forks.push(Object.assign(newFork(), { x: PARK_X }));
  row(SKY)[OFFICE_C - 1] = null;   // 最初からドリルが1つ置いてある（左から2マス目の地下1段目）
  S.st.set(key(OFFICE_C - 1, SKY), { type: 'drill', tid: 'drill', dir: 'down', lv: 0, t: 0, hit: -99, op: null, no: 1 });
  S.drillNo = 1;
  addHist(tx().hStart);
  grantCheck(true);
  setYard(YARD_C0);
  resetCam();
}

// 設備を置けるマス
const isOpen = (c, r) => inB(c, r) && r >= SKY && blk(c, r) === null && !S.st.has(key(c, r));   // 地下の空いたマス
// 設置する道具を選んでいるか／そのマスに置けるか（ドリルは地上にも、コンベア・機械は地下だけ）
const isBuildTool = () => isDrillTool(tool) || tool === 'elev' || tool === 'lamp' || tool === 'yard' || tool === 'conv' || tool === 'sort' || tool === 'tee' || tool === 'cross' || tool === 'machine' || tool === 'lab' || tool === 'pipe' || isFacTool(tool);
// そのマスに置けるか
// ・研究所：地上の段、施設の無いマス
// ・ドリル：地下1段目より下。空いたマス、または地上とつながった穴の隣の土・石（上書きして置く）
// ・コンベア・機械：地下の空いたマス
function canPlaceAt(c, r) {
  if (tool === 'lab') return r === YARD_R && surfaceFree(c) && !S.lab.built;
  if (isFacTool(tool)) return r === YARD_R && surfaceFree(c);
  if (!inB(c, r) || r < SKY) return false;
  const b = blk(c, r);
  if (isDrillTool(tool) && b) return diggable().has(key(c, r));   // 岩盤にも置ける（レベル不足ならとても遅い）
  // 機械・コンベア類・パイプも、坑道に隣接した土なら上書きして置ける（中の資源はなくなる）。破れない岩盤は不可
  if (b && (tool === 'machine' || tool === 'conv' || tool === 'sort' || tool === 'tee' || tool === 'cross' || tool === 'pipe')) return diggable().has(key(c, r)) && !(b.mat === 'rock' && false);
  const s0 = S.st.get(key(c, r));
  if (s0 && s0.type === 'well') return false;   // 温泉・油井の上には何も置けない
  if (tool === 'machine' && machSel === 'adit' && !aditFree(c, r)) return false;   // 横穴掘削口は、岩盤と岩盤の間に1つだけ
  return b === null;   // 何か置いてあっても上書きできる
}
// 落ちてきた資源が止まるマス（下に支えがある）
function isSolid(c, r) {
  if (c < S.landL || c > S.landR) return true;
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

// ---- 会社の履歴（お知らせ・節目を年月つきで） ----
function addHist(text) { S.history.push({ m: Math.floor(S.time / TUNE.month), t: text }); if (S.history.length > 400) S.history.shift(); }
// ---- 段階：岩盤を掘り抜いたら上がる。研究できる物が増える ----
// 研究ごとに、出てくる段階（無い物は段階1から）
// 段階1＝0〜5m（土だけ）・2＝5〜10m・3＝10〜20m・4＝20〜30m・5＝30〜40m・6＝40〜50m・7＝50〜60m・8＝60〜70m・9＝70m〜
// 行政の許可：この掘削レベルにする研究には、会社レベルが要る（キー＝研究後の掘削レベル、値＝要る会社レベル）
// 掘削レベル4＝岩盤Lv3（30m）・6＝Lv5（50m）・8＝Lv7（70m）
const DIG_PERMIT = { 4: 3, 6: 4, 8: 5 };
const permitNeed = () => DIG_PERMIT[sk('digLv') + 1] || 0;           // 次の掘削レベルに要る会社レベル（0＝要らない）
const permitOk = () => S.office.lv + 1 >= permitNeed();
const RES_STAGE = { 'm:sieve': 2, 'm:roller': 4, 'm:caster': 4, 'm:glassF': 5, 'm:metalwork': 6, 't:lamp': 4, 'f:museum': 6, 't:elev': 3, 'm:adit': 2, 'sk:away': 2, 'sk:land': 2, 'm:smelter': 3, 't:tee': 3, 'sk:dragPlus': 3, 'm:bagger': 4, 'sk:yardPlus': 4,
  'm:factory': 4, 't:cross': 5, 't:fdrill': 5, batch: 5, 't:pipe': 5, 'f:spa': 5, 'f:power': 5,
  'sk:truck2': 6, 'sk:black': 6, 'sk:speeding': 6,
  'm:washer': 5, 'm:cutter': 5, 't:adrill': 7, 'sk:veteran': 7, 'f:refinery': 7, 'm:polisher': 7, 'm:drawer': 4, 'm:atelier': 8 };   // v0.51：ダイヤが出たら加工できるように・段階8を埋める
const SK_STAGE_VEIN = 5;   // 鉱脈探知は段階5から
const SK_NEW_STAGE = { secAdv: 3, autoHire: 2, autoUpg: 3, autoPrice: 3, goldUp: 3, diaUp: 5, newTech: 4, bored: 2, treasure: 4, statue: 3, garden: 3, conne: 3, sortPlus: 4, oilScan: 6 };   // 新しい研究が出る段階
const SK_STAGE = { speed: [3, 7, 9], welfare: [3, 7], hr: [4, 7], beltMax: [8, 9], labRoom: [3, 5, 7, 8, 9] };   // 段ごとに出てくる段階
function resAvail(id) {
  if (isGrant(id)) return false;   // 付与される物は研究に出さない
  if (id === 'sk:truck2') return false;   // v0.61：トラック増車は「強化」へ
  if (id === 'sk:warehouse') return cappedAllDone();   // 最後の目標：上限のある研究が全部そろったら
  if (id === 'sk:trip') return sk('warehouse') > 0;
  if (id === 'sk:build') return sk('trip') > 0 && tripFull();
  if (id === 'sk:depart') return sk('build') > 0;
  if (id === 'sk:digLv') return false;   // v0.79：掘削レベルは廃止（岩盤はドリルの強化で破る）   // 次の岩盤のぶんだけ・会社レベルの分だけ研究できる（会社レベルが主な目標）
  if (id === 'sk:beltMax') return false;   // v0.49：コンベアはLv5まで（この研究は無くなった）
  if (id === 'sk:dragPlus') return false;   // v0.61：基本機能になった
  if (id === 'sk:vein') return S.stage >= SK_STAGE_VEIN;
  if (SK_NEW_STAGE[id.slice(3)] !== undefined && id.startsWith('sk:')) return S.stage >= SK_NEW_STAGE[id.slice(3)];
  if (id.startsWith('sk:')) { const k2 = id.slice(3), a = SK_STAGE[k2]; if (a) return S.stage >= a[Math.min(sk(k2), a.length - 1)]; }
  return S.stage >= (RES_STAGE[id] || 1);
}
const allResIds = () => [...Object.keys(RESEARCH_TOOL).map(t => 't:' + t), ...Object.keys(RESEARCH_MACH).map(m => 'm:' + m), ...Object.keys(RESEARCH_FAC).map(f => 'f:' + f), 'batch', ...SKILL_ORDER.map(x => 'sk:' + x)];
// 付与：機械・道具は、出る段階になったら研究なしで使えるようになる（高等な物は研究のまま）
const RES_ADV = new Set(['m:polisher', 'm:atelier', 'f:spa', 'f:power', 'f:refinery', 'f:museum', 'batch']);
const isGrant = id => (id.startsWith('m:') || id.startsWith('t:')) && !RES_ADV.has(id);
function grantCheck(quiet) {
  const names = [];
  for (const id of [...Object.keys(RESEARCH_MACH).map(m => 'm:' + m), ...Object.keys(RESEARCH_TOOL).map(t => 't:' + t)]) {
    if (!isGrant(id) || S.unlock[id.slice(2)] || S.stage < (RES_STAGE[id] || 1)) continue;
    S.unlock[id.slice(2)] = true; names.push(resDef(id).name);
  }
  if (names.length && !quiet) { const msg = tx().granted(names.join('・')); say(msg, 6000, 'good'); addHist(msg); }
  return names;
}
function checkStage() {
  while (S.deepest - SKY >= layerDepth(S.stage)) {
    const before = new Set(allResIds().filter(id => resAvail(id) && !resDef(id).done));
    S.stage++;
    const names = allResIds().filter(id => id !== 'sk:digLv' && resAvail(id) && !resDef(id).done && !before.has(id)).map(id => resDef(id).name);
    if (S.stage >= 2 && !S.unlock.crusher) { S.unlock.crusher = true; names.unshift(tx().mach.crusher); }   // 石が出るようになる
    names.push(...grantCheck(true));   // この段階で使えるようになった機械・道具
    const lv = rockLv(S.stage - 1), msg = tx().stageUp(lv, names);
    say(msg, 7000, 'good'); pop(tx().stagePop(lv), OFFICE_C + 1, YARD_R - 0.6, 'sale');
    addHist(tx().hStage(lv));
  }
}

// ---- お金と浮き文字 ----
// お金の表示：1万までは そのまま（3けた区切り）、それより上は K・M・B・T（インフレ感）
function fmt(v) {
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  const a = Math.abs(v), sg = v < 0 ? '-' : '';
  if (a < 10000) return sg + Math.round(a).toLocaleString('en-US');
  const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']].find(([d]) => a >= d);
  const n = a / u[0];
  return sg + (n >= 100 ? Math.floor(n) : n >= 10 ? Math.floor(n * 10) / 10 : Math.floor(n * 100) / 100) + u[1];
}
function pop(text, wx, wy, kind) { S.pops.push({ text, wx, wy, kind, t0: performance.now() }); }
function spend(cost, wx, wy, label, quiet) {
  S.money -= cost; S.stats.cur.cost += cost; S.stats.costTotal += cost;
  if (!quiet) pop((label ? label + ' ' : '') + '-' + fmt(cost), wx, wy, 'cost');
}
function earn(v, wx, wy) {
  S.money += v;
  if (v >= 0) { S.stats.cur.sale += v; S.stats.saleTotal += v; }
  pop((v >= 0 ? '+' : '') + fmt(v), wx, wy, v >= 0 ? 'sale' : 'cost');
}

// ---- 機械 ----
const BUF_MAX = 500;   // 機械の中に溜められる数（材料ごと）
function accepts(m, it) {
  const def = MACHINES[m.m];
  if (def.bag) {   // 袋詰め機：3種類まで同時に詰められる
    if (it.k === 'bag') return false;
    const b = m.bags || (m.bags = {});
    return (b[it.k] || 0) < BUF_MAX;   // v0.98：何種類でも同時に
  }
  const rec = def.recipes.find(x => x.in === it.k || (x.ins && x.ins[it.k]));
  return !!rec && (m.buf[it.k] || 0) < BUF_MAX;   // 材料は500個まで中で待つ。いっぱいの材料は、機械の中を通って出口へ（機械を並べれば解決できる）
}
function absorb(m, it) {
  if (MACHINES[m.m].bag) { const b = m.bags || (m.bags = {}); b[it.k] = (b[it.k] || 0) + 1; }
  else m.buf[it.k] = (m.buf[it.k] || 0) + 1;
}
const machineAt = (c, r) => { const s = inB(c, r) && S.st.get(key(c, r)); return s && s.type === 'machine' ? s : null; };
// 作業員がついていれば普通の速さ（技術で上がる）、いなければとても遅い
let lampVer = 0, litKey = '', litSt = new Set();
function lampLit() {   // 照明から2マス以内の持ち場
  const k0 = lampVer + ':' + S.stVer; if (k0 === litKey) return litSt;
  litKey = k0; litSt = new Set();
  for (const lk in S.lamps) { const c = cOf(+lk), r = rOf(+lk); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (Math.hypot(dx, dy) > 2.3 || !inB(c + dx, r + dy)) continue; const st = S.st.get(key(c + dx, r + dy)); if (st) litSt.add(st); } }
  return litSt;
}
function workFactor(s) {
  const w = opOf(s);
  return (w ? techFactor(w) : TUNE.unmanned) * (S.lamps && lampLit().has(s) ? BAL.lampMul : 1);   // 照明で少し速い
}

let typeLists = { stamp: '', mach: [], drill: [] };
function typeList(kind) {   // 機械だけ・ドリルだけの一覧
  const stamp = S.st.size + ':' + S.stVer;
  if (typeLists.stamp !== stamp) { typeLists = { stamp, mach: [], drill: [] }; for (const v of S.st.values()) { if (v.type === 'machine') typeLists.mach.push(v); else if (v.type === 'drill') typeLists.drill.push(v); } }
  return typeLists[kind];
}
// 作り方ごとに1つずつ、同時に作る（m.jobs[作り方の番号]）。表示用に m.cur・m.prog は動いている1つ目
function parMachine(m, k, def, dt) {
  m.jobs = m.jobs || [];
  if (m.cur && !m.jobs.some(Boolean)) { const i0 = def.recipes.findIndex(x => x.out === m.cur.k); m.jobs[i0 < 0 ? 0 : i0] = { cur: m.cur, prog: m.prog || 0 }; }   // 前の形のセーブ
  def.recipes.forEach((rec, i) => {
    if (m.jobs[i]) return;
    if (rec.ins) { if (Object.entries(rec.ins).every(([k2, n]) => (m.buf[k2] || 0) >= n)) { for (const [k2, n] of Object.entries(rec.ins)) m.buf[k2] -= n; m.jobs[i] = { cur: { k: rec.out, v: ITEMS[rec.out].v * valueMul(m) }, prog: 0 }; } }
    else if ((m.buf[rec.in] || 0) >= rec.n) { m.buf[rec.in] -= rec.n; m.jobs[i] = { cur: { k: rec.out, v: ITEMS[rec.out].v * valueMul(m), n: rec.outN || 1 }, prog: 0 }; }
  });
  const sp = dt * valOf(m) * workFactor(m) * (1 + 0.05 * sk('newTech'));
  let first = null;
  m.jobs.forEach((j, i) => {
    if (!j) return;
    j.prog = Math.min(def.time, j.prog + sp);
    if (j.prog >= def.time) {
      const keep = m.cur; m.cur = j.cur; const ok = emitFront(k, m); m.cur = keep;
      if (ok) { if ((j.cur.n || 1) > 1) j.cur.n--; else { m.jobs[i] = null; return; } }
    }
    if (!first) first = j;
  });
  m.cur = first ? first.cur : null; m.prog = first ? first.prog : 0;
}
function updateMachines(dt) {
  for (const m of typeList('mach')) {
    const k = stationKey(m); if (k < 0) continue;
    const def = MACHINES[m.m];
    if (m.eject) {   // 材料を排出中：1回に1個ずつ前へ出す（出せない時は待つ）
      const left = Object.entries(m.bags && def.bag ? m.bags : m.buf).find(([, n]) => n > 0);
      if (!left) m.eject = false;
      else { const keep = m.cur; m.cur = { k: left[0] }; if (emitFront(k, m)) { const src = def.bag ? m.bags : m.buf; src[left[0]]--; if (!src[left[0]]) delete src[left[0]]; } m.cur = keep; continue; }
    }
    if (!def.bag && !def.src && def.recipes.length > 1) { parMachine(m, k, def, dt); continue; }   // 作り方が複数：並行して作る
    if (!m.cur && def.src) { m.cur = { k: aditOre(rOf(k)) }; m.prog = 0; }   // 横穴：材料なしで次の1個を掘り出す
    if (!m.cur) {
      if (def.bag) {
        const b = m.bags || (m.bags = {});
        const kind = Object.keys(b).find(k2 => b[k2] >= def.bag);
        if (kind) {
          const v1 = ITEMS[kind].v;
          m.cur = { k: 'bag', of: kind, v: (v1 > 0 ? v1 * def.bag * 1.2 : v1 * def.bag) * valueMul(m) };
          b[kind] -= def.bag; if (!b[kind]) delete b[kind];
          m.prog = 0;
        }
      } else {
        for (const rec of def.recipes) {
          if (rec.ins) {   // 2つの材料がそろったら
            if (Object.entries(rec.ins).every(([k2, n]) => (m.buf[k2] || 0) >= n)) { for (const [k2, n] of Object.entries(rec.ins)) m.buf[k2] -= n; m.cur = { k: rec.out, v: ITEMS[rec.out].v * valueMul(m) }; m.prog = 0; break; }
          } else if ((m.buf[rec.in] || 0) >= rec.n) { m.buf[rec.in] -= rec.n; m.cur = { k: rec.out, v: ITEMS[rec.out].v * valueMul(m), n: rec.outN || 1 }; m.prog = 0; break; }
        }
      }
    }
    if (m.cur) {
      m.prog = Math.min(def.time, m.prog + dt * valOf(m) * workFactor(m) * (def.src ? 1 : 1 + 0.05 * sk('newTech')) * (def.src ? Math.pow(BAL.aditMaxSpeed, (m.lv || 0) / BAL.aditMax) : 1));   // 横穴：最大レベルの速さは、今までの半分（途中のレベルはなめらかに）
      if (m.prog >= def.time && emitFront(k, m)) { if ((m.cur.n || 1) > 1) m.cur.n--; else m.cur = null; }   // 2つ出る物は、続けてもう1つ
    }
  }
}
// 対応していない資源は、機械の中をそのまま通って前に出る。出られた／機械に入ったら true
// 機械の中を通り抜け中の数（混みすぎたら、それ以上は入れない）
// 数は刻みごとに1回だけ数えて覚えておく（資源が多い時も重くならない）。入った分はその場で足す
let thruMap = new Map();
let beltN = new Map();   // コンベアのマスごとの、乗っている資源の数
let beltMan = new Set(); // 作業員がついているコンベア
function countThru() {
  thruMap = new Map(); beltN = new Map();
  beltMan = new Set(S.workers.filter(w => w.state === 'work' && w.target && isBelt(w.target)).map(w => w.target));
  for (const it of S.items) {
    const k = key(Math.floor(it.x), Math.floor(it.y));
    if (it.thru) thruMap.set(k, (thruMap.get(k) || 0) + 1); else beltN.set(k, (beltN.get(k) || 0) + 1);
  }
}
// あふれたコンベア：乗る数を超えた割合で、運ぶ速さがとても遅くなる（0にはしない）
function beltSlow(s, k) { const cap = beltCap(s), n = beltN.get(k) || 0; return n <= cap ? 1 : Math.max(BAL.beltSlowMin, Math.pow(cap / n, BAL.beltSlowPow)); }
const thruIn = (c, r) => thruMap.get(key(c, r)) || 0;
const thruAdd = (c, r) => thruMap.set(key(c, r), thruIn(c, r) + 1);
const THRU_MAX_ = () => TUNE.thruMax;
function passThrough(m, mc, mr, it) {
  const [dx, dy] = DIRS[m.dir];
  const fc = mc + dx, fr = mr + dy;
  const next = machineAt(fc, fr);
  if (next) {
    if (accepts(next, it)) { absorb(next, it); it.gone = true; return true; }
    if (thruIn(fc, fr) >= THRU_MAX_()) return false;   // 次の機械も受け付けない → その中を通り抜ける
    it.x = fc + 0.5 - dx * 0.4; it.y = fr + 0.5 - dy * 0.4; it.vy = 0; it.thru = true; it.tk = -1; thruAdd(fc, fr);
    return true;
  }
  if (!canPut(fc, fr)) return false;
  it.x = clamp(mc + 0.5 + dx * 0.72 + rand(-0.1, 0.1), fc + 0.04, fc + 0.96);
  it.y = clamp(mr + 0.5 + dy * 0.72 + rand(-0.1, 0.1), fr + 0.04, fr + 0.96);
  it.vy = 0; it.tk = -1;
  return true;
}
function emitFront(k, m) {
  const c = cOf(k), r = rOf(k);
  const [dx, dy] = DIRS[m.dir];
  const fc = c + dx, fr = r + dy;
  const proto = { k: m.cur.k, v: m.cur.v, of: m.cur.of };
  const next = machineAt(fc, fr);
  if (next) {
    if (accepts(next, proto)) { absorb(next, proto); return true; }
    if (thruIn(fc, fr) >= THRU_MAX_()) return false;   // 次の機械が受け付けない物は、その中を通り抜けさせる
    const it = spawnItem(proto.k, fc + 0.5 - dx * 0.4, fr + 0.5 - dy * 0.4, fc, fr);
    it.thru = true; thruAdd(fc, fr); if (proto.v !== undefined) { it.v = proto.v; it.of = proto.of; }
    return true;
  }
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
  if (S.seenIt && !S.seenIt[k]) S.seenIt[k] = 1;   // 一度でも出た資源（カタログ・振り分け・コレクション用）
  return it;
}
function toYard(it) { S.yard.push({ k: it.k, v: it.v, of: it.of, rx: Math.random(), ry: Math.random() }); }
const PARK_X = OFFICE_C - 0.35;   // フォークリフトの待機場所（事務所の左横）
function toSurface(it) {
  const c = clamp(Math.floor(it.x), 0, COLS - 1);
  if ((c === OFFICE_C || c === OFFICE_C + 1) && S.trip && tripAdd(it.k === 'bag' ? it.of : it.k, it.k === 'bag' ? 5 : 1)) return;   // 事務所の真下：足りない材料は倉庫へ
  if (c === YARD_C) {   // ヤードには直接上げられない：隣の荷おろし場へ（事務所の列はさける）
    const c2 = [c - 1, c + 1].find(x => x >= 0 && x < COLS && x !== OFFICE_C && x !== OFFICE_C + 1 && !(S.lab.built && S.lab.c === x)) ?? (c > 0 ? c - 1 : c + 1);
    (S.dock[c2] || (S.dock[c2] = [])).push({ k: it.k, v: it.v, of: it.of, rx: Math.random(), ry: Math.random() }); return;
  }
  (S.dock[c] || (S.dock[c] = [])).push({ k: it.k, v: it.v, of: it.of, rx: Math.random(), ry: Math.random() });
}
// 次に取りに行く荷おろし場（他の車が向かっていない、いちばん近い所）
function pickDock(f) {
  const taken = new Set(S.forks.filter(o => o !== f && o.tc !== null && (o.state === 'toPick' || o.state === 'loading')).map(o => o.tc));
  let best = null, bd = Infinity;
  for (const c of Object.keys(S.dock)) {
    if (!S.dock[c].length || taken.has(+c)) continue;
    const d = Math.abs(+c + 0.5 - f.x);
    if (d < bd) { bd = d; best = +c; }
  }
  return best;
}
function updateForks(dt) {
  for (const f of S.forks) {
    const move = tx => {
      const d = tx - f.x;
      if (Math.abs(d) > 0.01) f.face = Math.sign(d);
      const drv = opOf(f);   // 運転手がいないと遅い（自分で運転）
      f.x += Math.sign(d) * Math.min(Math.abs(d), forkSpeed(f.lv) * TUNE.fork * (drv ? techFactor(drv) : 0.45) * dt);
      f.moving = Math.abs(tx - f.x) > 0.01;
      return !f.moving;
    };
    f.moving = false;
    if (f.state === 'idle' || f.state === 'toPark') {
      const c = pickDock(f);
      if (c !== null) { f.tc = c; f.state = 'toPick'; }
      else if (Math.abs(f.x - PARK_X) > 0.01) { f.state = 'toPark'; if (move(PARK_X)) f.state = 'idle'; }   // 仕事が無ければ事務所の横へ
      else f.state = 'idle';
      continue;
    }
    if (f.state === 'toPick') { if (move(f.tc + 0.5)) { f.state = 'loading'; f.acc = 0; } continue; }
    if (f.state === 'loading') {
      const pile = S.dock[f.tc] || [];
      f.acc += dt * FORK.rate;
      while (f.acc >= 1 && pile.length && f.load.length < valOf(f)) { f.load.push(pile.shift()); f.acc--; }
      if (!pile.length) delete S.dock[f.tc];
      if (f.load.length >= valOf(f) || !pile.length) {
        const c = f.load.length < valOf(f) ? pickDock(f) : null;   // まだ積めるなら、ほかの山にも寄る
        if (c !== null) { f.tc = c; f.state = 'toPick'; } else { f.tc = null; f.state = 'toYard'; }
      }
      continue;
    }
    if (f.state === 'toYard') { if (YARD_C < 0) continue; if (move(YARD_C + 0.5)) { f.state = 'unloading'; f.acc = 0; } continue; }   // ヤードが無い間は、積んだまま待つ
    if (f.state === 'unloading') {
      f.acc += dt * FORK.rate * 1.5;
      while (f.acc >= 1 && f.load.length) { const it = f.load.shift(); S.yard.push({ ...it, rx: Math.random(), ry: Math.random() }); f.acc--; }
      if (!f.load.length) f.state = 'idle';
    }
  }
}

// ---- パイプライン：湧き口から地上（地下1段目のパイプ）までつながっていれば、タンクにたまる ----
let netCache = { ver: -1, info: new Map() };
const isPipeLike = s => !!s && (s.type === 'pipe' || s.type === 'well');
function pipeNet() {
  if (netCache.ver === S.stVer + S.digVer * 1e6) return netCache.info;
  const info = new Map(), seen = new Set();
  for (const [k, s] of S.st) {
    if (!isPipeLike(s) || seen.has(k)) continue;
    const comp = [], q = [k]; seen.add(k);
    let surface = false, kind = null;
    for (let i = 0; i < q.length; i++) {
      const kk = q[i], c = cOf(kk), r = rOf(kk), st = S.st.get(kk); comp.push(kk);
      if (r === SKY) surface = true;
      if (st.type === 'well' && !kind) kind = st.kind;
      for (const [dx, dy] of NB) { const nk = key(c + dx, r + dy); if (inB(c + dx, r + dy) && !seen.has(nk) && isPipeLike(S.st.get(nk))) { seen.add(nk); q.push(nk); } }
    }
    for (const kk of comp) info.set(kk, { surface, kind });
  }
  netCache = { ver: S.stVer + S.digVer * 1e6, info };
  return info;
}
function updateLiquids(dt) {
  S.liqT = (S.liqT || 0) + dt;
  if (S.liqT < 1) return;
  S.liqT -= 1;
  const net = pipeNet();
  for (const [k, s] of S.st) {
    if (s.type !== 'well') continue;
    const n = net.get(k);
    if (n && n.surface) S.tank[s.kind] = Math.min(BAL.tankCap, S.tank[s.kind] + WELL_RATE[s.kind]);
  }
}
// 地上の施設：製油所（石油2→燃料1、ヤードへ）・発電所（お湯か石油を燃やして売電）・温泉（お客さんが来る）
const facWorkers = f => S.workers.filter(w => w.target === f && w.state === 'work');
const facRate = f => { const ws = facWorkers(f); return ws.length ? ws.reduce((a, w) => a + techFactor(w), 0) : BAL.facSlow; };
const visitors = f => S.cars.filter(c => c.f === f.c).length;
const CAR_COLS = ['#d8543c', '#3f7cc4', '#e8c34a', '#5aa36a', '#eeeeea', '#4a4a50'];
function updateFacs(dt) {
  for (const f of S.fac) {
    f.t = (f.t || 0) + dt * facRate(f);
    if (f.f === 'refinery') {
      if (f.t >= 4) { if (S.tank.oil >= 2) { f.t -= 4; S.tank.oil -= 2; S.yard.push({ k: 'fuel', rx: Math.random(), ry: Math.random() }); } else f.t = 4; }
    } else if (f.f === 'power') {
      while (f.t >= 1) {
        f.t -= 1;
        // 発電は「余っている分」だけ使う（温泉・製油所があれば、その分を残す）
        const keepHot = S.fac.some(o => o.f === 'spa') ? 60 : 0, keepOil = S.fac.some(o => o.f === 'refinery') ? 60 : 0;
        const src = S.tank.hot >= 1 + keepHot ? 'hot' : S.tank.oil >= 1 + keepOil ? 'oil' : null;
        if (!src) { f.t = 0; break; }
        S.tank[src] -= 1; f.acc = (f.acc || 0) + (src === 'oil' ? 4 : 2) * TUNE.price / 2.5;
        if (f.acc >= 20) { earn(Math.round(f.acc), f.c + 0.5, YARD_R - 0.2); f.acc = 0; }
      }
    } else if (f.f === 'museum') {
      const col = S.museum || (S.museum = {});
      for (let i = S.yard.length - 1; i >= 0; i--) {
        const it = S.yard[i]; if (!isRare(it.k)) continue;
        S.yard.splice(i, 1);
        if (!col[it.k]) { col[it.k] = 1; const msg = tx().museumNew(tx().items[it.k]); say(msg, 5000, 'good'); addHist(msg); }
        else { col[it.k]++; earn(Math.round(itemVal(it) * 1.5), f.c + 0.5, YARD_R - 0.2); }   // 売店で売る
      }
      const kinds = Object.keys(col).length;
      if (f.t >= 10) {
        if (kinds && visitors(f) < 3) { f.t -= 10; S.cars.push({ f: f.c, x: -1.2, st: 'in', t: 0, fee: Math.round(BAL.museumFee * kinds * TUNE.price / 2.5), col: CAR_COLS[Math.floor(Math.random() * CAR_COLS.length)] }); }
        else f.t = 10;
      }
    } else if (f.f === 'spa') {
      if (f.t >= 6) {
        if (S.tank.hot >= 5 && visitors(f) < 3) { f.t -= 6; S.tank.hot -= 5; S.cars.push({ f: f.c, x: -1.2, st: 'in', t: 0, col: CAR_COLS[Math.floor(Math.random() * CAR_COLS.length)] }); }
        else f.t = 6;
      }
    }
  }
  // 温泉のお客さん：車で来る → 歩いて入る → 入浴 → 歩いて出る → 車で帰る（帰る時に料金）
  for (let i = S.cars.length - 1; i >= 0; i--) {
    const car = S.cars[i], slot = S.cars.filter(o => o.f === car.f && o.st !== 'out').indexOf(car), to = car.f + 0.1 - Math.max(0, slot) * 0.7;   // 並んで止まる
    if (car.st === 'in') { car.x = Math.min(to, car.x + 2.5 * dt); if (car.x >= to) { car.st = 'walkIn'; car.t = 0; } }
    else if (car.st === 'walkIn') { car.t += dt; if (car.t >= 0.8) { car.st = 'inside'; car.t = 0; } }
    else if (car.st === 'inside') { car.t += dt; if (car.t >= 8) { car.st = 'walkOut'; car.t = 0; earn(car.fee || Math.round(40 * TUNE.price / 2.5), car.f + 0.5, YARD_R - 0.2); } }
    else if (car.st === 'walkOut') { car.t += dt; if (car.t >= 0.8) { car.st = 'out'; car.t = 0; } }
    else { car.x -= 2.5 * dt; if (car.x < -2) S.cars.splice(i, 1); }
    if (!facAt(car.f) && car.st !== 'out') car.st = 'out';   // 温泉が無くなった
  }
}

// 最初の資金ショート：1000のプレゼント（返さなくてよい。1回だけ）
// 人事部・技術部・市場調査（研究して、事務所でオン・オフ）
// 部署の報告：たまった分を、部署ごとに順番に1つずつ知らせる（多い時はまとめて「3人」など）
let deptLog = { hr: 0, tech: 0, sales: [], techAt: null }, deptTurn = 0, deptSaid = {};
const DEPT_GAP = 120;   // 同じ部署の報告は、ゲームの2か月に1回まで（その間の分はまとめる）
function autoDepts() {
  const mBefore = S.money; try { autoDepts0(); } finally { if (S.money < mBefore) S.stats.deptCost = (S.stats.deptCost || 0) + (mBefore - S.money); }   // 部署が使ったお金（放置の見積もりで使う）
}
function autoDepts0() {
  if (catchBusy) return;   // v0.98：放置中は部署は動かない（社長の裁可が下りない）
  const o = S.opts || {};
  if (sk('autoHire') && o.autoHire !== false) {   // 人事部：持ち場（コンベア以外）が人より多い時だけ、余裕があれば雇う
    const posts = [...S.st.values()].filter(x => x.type === 'drill' || x.type === 'machine').length + S.fac.length + (S.lab.built ? 1 : 0) + S.forks.length;
    if (staffN() < Math.min(offCap(S.office.lv), posts) && S.money > HIRE_FEE(hireLv()) * 3) { const n0 = staffN(); hire(); if (staffN() > n0) deptLog.hr++; }
  }
  if (S.techMon && S.techMon.m !== S.month) S.techMon = null;
  if (sk('autoUpg') && o.autoUpg !== false && (!S.techMon || S.techMon.n < 3) && Math.random() < 0.3) {   // v0.98：月に3か所まで   // 技術部：気まぐれ。たまに、適当に選んだ物を、お金がかなりある時だけ強化
    const ts = [...S.st.values()].filter(x => x.type === 'drill' || x.type === 'machine' || isBelt(x));
    const t = ts[Math.floor(Math.random() * ts.length)], c = t ? nextCost(t) : null;
    if (c !== null && S.money > c * 8) { levelUp(t); deptLog.tech++; S.techMon = { m: S.month, n: (S.techMon ? S.techMon.n : 0) + 1 }; const tk = findKey(t); if (tk >= 0) deptLog.techAt = { c: cOf(tk), r: rOf(tk), open: () => { if ([...S.st.values()].includes(t)) openPop(t); } }; }   // 最後に強化した物へ飛べる
  }
  if (sk('autoPrice') && o.autoPrice !== false) {   // 営業部：売ったことのある資源のうち、いちばん安い売値アップを、余裕があれば
    const rs = ROOT_ORDER.filter(r => S.sold['@' + r]).sort((a, b) => priceCost(a) - priceCost(b));
    if (rs.length && S.money > priceCost(rs[0]) * 4) { priceUp(rs[0]); if (!deptLog.sales.includes(rs[0])) deptLog.sales.push(rs[0]); }
  }
  if (autoBusy || catchBusy) { deptLog = { hr: 0, tech: 0, sales: [], techAt: null }; return; }   // 早送り・放置の計算中は知らせない   // 早送りの計算中は知らせない
  const T = tx(), order = ['hr', 'tech', 'sales'];
  for (let i = 0; i < 3; i++) {
    const d = order[(deptTurn + i) % 3], v = deptLog[d];
    if (d === 'sales' ? !v.length : !v) continue;
    if (S.time - (deptSaid[d] || -1e9) < DEPT_GAP) continue;
    deptTurn = (deptTurn + i + 1) % 3; deptSaid[d] = S.time;
    say(d === 'hr' ? T.deptHr(v) : d === 'tech' ? T.deptTech(v) : T.deptSales(v.map(k2 => T.items[k2]).join('・')), 3500, 'good', d === 'tech' ? deptLog.techAt : null, d);
    if (d === 'sales') deptLog.sales = []; else deptLog[d] = 0;
    if (d === 'tech') deptLog.techAt = null;
    break;
  }
}
// ---- はじめの手順（チュートリアル） ----
// 段：hello（ほるぞ！）→ pick（どこを掘る？）→ walk → dig（スコップ）→ carry（ヤードへ）→ load（トラックに積む）→ away（出荷）
//     → tired（つらすぎる）→ buy（ドリルを買ってみましょう）→ easy（楽になりましたね）→ ganbaru（がんばるぞ！）→ 終わり
const TUT_SOIL = 2;   // 社長が掘って出す土の数（最初のトラックが積める数）
let tutBubble = null, tutBubbleT = 0;
function startTutorial() {
  // 最初から置いてあるドリルは外して、土に戻す（社長が手で掘るところから）
  for (const [k, s2] of [...S.st]) if (s2.type === 'drill') { S.st.delete(k); row(rOf(k))[cOf(k)] = makeBlock(rOf(k)); }
  S.digVer++; S.stVer++;
  const b = bossOf(); b.state = 'tut'; b.target = null; b.path = []; b.x = OFFICE_C - 0.3; b.y = YARD_R + 0.5; b.carry = 0;
  S.tut = { step: 'hello', t: 0 };
  tutShow();
}
function tutSet(step) { S.tut.step = step; S.tut.t = 0; tutShow(); }
// 画面：吹き出し（社長）・メッセージ（秘書ではない）・メニューの隠しと光らせ
function tutShow() {
  const T = tx(), st = S.tut ? S.tut.step : null, st2 = S.tut2 && S.tut2.step !== 'wait' ? S.tut2.step : null;
  if (!st && st2) {   // はじめの手順のあとの案内（メニューは隠さない。▼で閉じる）
    document.body.classList.remove('tut');
    $('tutMsg').hidden = false; $('tutText').textContent = T.tut2[st2]; $('tutNext').hidden = false; $('tutSkip').hidden = false;
    document.querySelectorAll('[data-open="build"], #catBar [data-cat="build"]').forEach(el => el.classList.toggle('tutPulse', st2 === 'kiln'));
    return;
  }
  document.body.classList.toggle('tut', !!st && !['buy', 'easy', 'ganbaru'].includes(st));   // ドリルを買うまではメニューを隠す
  document.querySelectorAll('[data-open="build"], #catBar [data-cat="build"]').forEach(el => el.classList.toggle('tutPulse', st === 'buy'));
  tutBubble = st === 'hello' ? T.tutHello : st === 'tired' ? T.tutTired : st === 'ganbaru' ? T.tutGanbaru : null; tutBubbleT = 0;
  const msg = st === 'pick' ? T.tutPick : st === 'yes' ? T.tutYes : st === 'buy' ? T.tutBuy : st === 'easy' ? T.tutEasy : '';
  $('tutMsg').hidden = !msg; $('tutText').textContent = msg;
  $('tutNext').hidden = st !== 'easy' && st !== 'yes';   // タップ待ちのメッセージは、端に小さな▼
  $('tutSkip').hidden = !st && !(S.tut2 && S.tut2.step !== 'wait');   // スキップは、はじめの手順の間ずっと（メッセージの外に）
  if (!st) $('tutArrow').setAttribute('hidden', '');
}
// 「ドリルを買ってみましょう」：今押すべき所（設置 → ドリル → ドリル50）まで、メッセージから矢印を伸ばす
// 工場の中の物（マス）の、画面での四角
function cellRect(c, r, w = 1, h = 1) {
  const b = cv.getBoundingClientRect(), x = b.left + offX + (c - cam.x) * cp, y = b.top + (r - cam.y) * cp;
  return { left: x, top: y, right: x + w * cp, bottom: y + h * cp, width: w * cp, height: h * cp, cell: { c, r, w, h } };
}
const firstDrillKey = () => { for (const [k, v] of S.st) if (v.type === 'drill') return k; return -1; };
function tutTarget() {
  const vis = el => el && el.offsetParent !== null;
  const st2 = S.tut2 && S.tut2.step !== 'wait' ? S.tut2.step : null;
  if (st2 === 'kiln' && !(popTarget && popTarget.type === 'pend')) {   // 機械を置こう：設置 → 機械 → レンガ焼成機 → 置く所（コンベアの上に置ける）
    if (tool === 'machine' && machSel === 'kiln') { for (const [k, v] of S.st) if (v.type === 'conv') return cellRect(cOf(k), rOf(k)); return null; }
    const tb2 = [...document.querySelectorAll('#subMenu .si')].find(b => b.dataset.tool === 'm:kiln'); if (vis(tb2)) return tb2;
    const gb2 = [...document.querySelectorAll('#subMenu .grp')].find(b => b.dataset.grp === 'machine'); if (vis(gb2)) return gb2;
    return [...document.querySelectorAll('[data-open="build"], #catBar [data-cat="build"]')].find(vis) || null;
  }
  if (st2 === 'hire' || st2 === 'office') {   // 事務所 → 「雇う」／「レベルアップ」
    const bt = document.querySelector(`#officeBody [data-tut="${st2 === 'hire' ? 'hire' : 'coUp'}"]`); if (vis(bt)) return bt;
    if (!$('office').hidden) return null;
    const fl = Math.ceil(0.72 * offFloors(S.office.lv) + 0.1); return cellRect(OFFICE_C, YARD_R + 1 - fl, 2, fl);
  }
  if (st2 === 'drillDir' || st2 === 'lvup') {   // ドリル → 向き／レベルアップ
    if (popTarget && popTarget.type === 'drill') return st2 === 'drillDir' ? $('popDirs') : $('popLvUp');
    const k = firstDrillKey(); return k >= 0 ? cellRect(cOf(k), rOf(k)) : null;
  }
  if (S.tut && S.tut.step === 'pick') { const cs = [...Array(COLS).keys()].filter(tutCanDig); return cs.length ? cellRect(cs[0], SKY, cs[cs.length - 1] - cs[0] + 1, 1) : null; }   // 掘る所を選ぶ：光っているマスの列（メッセージはそこを避ける）
  if (!S.tut || S.tut.step !== 'buy' || isDrillTool(tool) || (popTarget && popTarget.type === 'pend')) return null;
  const tb = [...document.querySelectorAll('#subMenu .si')].find(b => b.dataset.tool === 'drill');
  if (vis(tb)) return tb;
  const gb = [...document.querySelectorAll('#subMenu .grp')].find(b => b.dataset.grp === 'drill');
  if (vis(gb)) return gb;
  return [...document.querySelectorAll('[data-open="build"], #catBar [data-cat="build"]')].find(vis) || null;
}
let tutCell = null;   // 光らせる工場の中の物（マス）
function tutPlace(b) {   // 案内のメッセージの位置：ふだんは画面の上の真ん中。重なる物があれば、空いている所へ下げる
  const m = $('tutMsg'); if (m.hidden) return;
  const W = window.innerWidth, H = window.innerHeight, h = m.offsetHeight, w = m.offsetWidth, top0 = hdrH + 8;
  const left = (W - w) / 2, right = left + w;
  const visEl = el => el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const must = [b, ...['tutSkip', 'pop'].map($).filter(visEl).map(el => el.getBoundingClientRect())].filter(Boolean);   // 必ずよける物：説明する物・スキップ・選んだ物のメニュー
  const soft = ['office', 'skillPanel', 'powerPanel', 'tradePanel', 'subMenu'].map($).filter(visEl).map(el => el.getBoundingClientRect());   // できればよける：開いている画面
  const dash = $('dash'), floor = visEl(dash) ? dash.getBoundingClientRect().top - 4 : H - 4;
  const hit = (y, list) => list.some(r => r.left < right && r.right > left && r.top < y + h + 6 && r.bottom > y - 6);
  const cands = [top0, ...[...must, ...soft].map(r => r.bottom + 8)].filter(y => y >= top0 && y + h <= floor).sort((p2, q) => p2 - q);
  let top = cands.find(y => !hit(y, must) && !hit(y, soft));
  if (top === undefined) top = cands.find(y => !hit(y, must));   // 全部はよけられない時は、必ずよける物だけ
  if (top === undefined) top = top0;
  m.style.top = Math.round(top) + 'px';
}
function tutArrow() {
  const svg = $('tutArrow'), tg = tutTarget(), m = $('tutMsg');
  tutCell = tg && tg.cell ? tg.cell : null;
  document.querySelectorAll('.tutPulse2').forEach(el => { if (el !== tg) el.classList.remove('tutPulse2'); });
  if (tg && !tg.cell) tg.classList.add('tutPulse2');   // ボタンなどもゆっくり光らせる
  const b = !tg ? null : tg.cell ? tg : tg.getBoundingClientRect();
  tutPlace(b);
  if (!tg || m.hidden) { svg.setAttribute('hidden', ''); return; }   // SVG は .hidden が効かないので、属性で切りかえる
  const a = m.getBoundingClientRect();
  const below = b.top >= a.bottom, x1 = a.left + a.width / 2, y1 = below ? a.bottom + 4 : a.top - 4, x2 = b.left + b.width / 2, y2 = below ? b.top - 4 : b.bottom + 4;
  svg.removeAttribute('hidden');
  svg.innerHTML = `<defs><marker id="tah" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#d0661f"/></marker></defs>`
    + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d0661f" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#tah)"/>`;
}
const tutWait = () => S.tut && (S.tut.step === 'hello' || S.tut.step === 'tired' || S.tut.step === 'yes' || S.tut.step === 'easy');
function tutNext() {   // タップ待ちの段で押した
  const st = S.tut.step;
  if (st === 'hello') tutSet('pick');
  else if (st === 'tired') tutSet('yes');
  else if (st === 'yes') tutSet('buy');
  else if (st === 'easy') tutSet('ganbaru');
}
let tutSkipped = false;
function tutEnd() {
  const b = bossOf(); if (b) { b.state = 'idle'; b.lastLook = -9; b.target = null; b.carry = 0; }
  S.tut = null;
  S.tut2 = tutSkipped ? null : { step: 'wait', next: 'kiln', t: 0 };   // 少ししてから、次の案内（スキップした時は出さない）
  tutSkipped = false;
  tutShow(); say(tx().tutDone, 7000, 'good');
}
// はじめの手順のあとの案内：待つ（wait）→ 案内を出す → できたら（または▼を押したら）少し待って次へ
const TUT2 = ['kiln', 'hire', 'drillDir', 'lvup', 'office'];
const TUT2_WAIT = 25;   // 次の案内までの秒数（ゲームの時間）
function tut2Done(st) {
  if (st === 'kiln') return [...S.st.values()].some(x => x.type === 'machine');
  if (st === 'hire') return staffN() >= 1;
  if (st === 'drillDir') return !!(S.tut2 && S.tut2.did);
  if (st === 'lvup') return [...S.st.values()].some(x => x.type === 'drill' && x.lv > 0);
  if (st === 'office') return S.office.lv >= 1;
  return false;
}
function tut2Update(dt) {
  const t = S.tut2; if (!t) return;
  t.t += dt;
  if (t.step === 'wait') {
    while (t.next && tut2Done(t.next)) t.next = TUT2[TUT2.indexOf(t.next) + 1];   // もう自分でやった案内はとばす
    if (!t.next) { S.tut2 = null; tutShow(); return; }
    if (t.t >= TUT2_WAIT) { t.step = t.next; t.t = 0; tutShow(); }
    return;
  }
  if (tut2Done(t.step)) tut2Next();
}
function tut2Next() {
  const t = S.tut2; if (!t) return;
  const nx = TUT2[TUT2.indexOf(t.step) + 1];
  if (!nx) { S.tut2 = null; tutShow(); return; }
  S.tut2 = { step: 'wait', next: nx, t: t.step === 'office' ? 0 : 0 }; tutShow();
}
// 掘れるマス：地下1段目の、自分の土地の土（ヤードの列は除く）
const tutCanDig = c => c >= S.landL && c <= S.landR && c !== YARD_C && !!blk(c, SKY) && blk(c, SKY).mat !== 'rock';
function tutTap(p) {
  if (!S.tut) return false;
  if (tutWait()) { tutNext(); return true; }
  if (S.tut.step === 'pick') { if (tutCanDig(p.c) && (p.r === SKY || p.r === YARD_R)) { S.tut.c = p.c; tutSet('walk'); $('tutMsg').hidden = true; } return true; }
  if (['walk', 'dig', 'carry', 'load', 'away'].includes(S.tut.step)) return true;   // 社長が動いている間は待つ
  return false;   // buy などは、ふつうに操作できる
}
function tutUpdate(dt) {
  const t = S.tut; if (!t) return;
  const b = bossOf(); if (!b) { S.tut = null; return; }
  t.t += dt;
  const walkTo = x => { const d = x - b.x, sp = BAL.walkH * TUNE.walk * dt; if (Math.abs(d) <= sp) { b.x = x; return true; } b.x += Math.sign(d) * sp; return false; };
  if (t.step === 'walk') { b.y = YARD_R + 0.5; if (walkTo(t.c + 0.5)) tutSet('dig'); }
  else if (t.step === 'dig') {   // スコップで掘る（ゆっくり）。少しずつ土が出る
    b.carry = Math.min(TUT_SOIL, Math.floor(t.t / 2.5));
    if (t.t >= 2.5 * TUT_SOIL + 0.5) { row(SKY)[t.c] = null; S.digVer++; S.deepest = Math.max(S.deepest, SKY); tutSet('carry'); }
  }
  else if (t.step === 'carry') { if (walkTo(YARD_C + 0.5)) { for (let i = 0; i < b.carry; i++) S.yard.push({ k: 'soil', rx: Math.random(), ry: Math.random() }); b.carry = 0; tutSet('load'); } }
  else if (t.step === 'load') {   // トラックに積んだら、社長が運転して出荷
    const tr = S.fleet.find(x => x.phase === 'here' || x.phase === 'leaving');   // 満杯になると、トラックは自分で出かけ始める
    if (tr && (tr.phase === 'leaving' || (!S.yard.length && tr.load > 0))) { b.state = 'drive'; b.target = tr; tr.op = b.id; if (tr.phase === 'here') { tr.phase = 'leaving'; tr.t = 0; } tutSet('away'); }
  }
  else if (t.step === 'away') {
    if (S.fleet.some(x => x.phase === 'here') && t.t > 1) { b.state = 'tut'; b.target = null; b.x = YARD_C + 0.5; b.y = YARD_R + 0.5; tutSet('tired'); }
  }
  else if (t.step === 'buy') { if ([...S.st.values()].some(x => x.type === 'drill')) tutSet('easy'); }
  else if (t.step === 'ganbaru') { if (t.t > 2.5) tutEnd(); }
  if (t.step !== 'away') { if (b.state === 'drive') b.state = 'tut'; }
}
// 社長の吹き出し（小さく）・掘っている間のスコップ・運んでいる土
function drawTutBoss() {
  const b = bossOf(); if (!b || !S.tut || b.state === 'drive') return;
  const cell = cp, x = b.x * cell, y = b.y * cell;
  if (S.tut.step === 'dig') {   // スコップを上下に
    const a = Math.sin(S.tut.t * 6) * 0.6;
    ctx.save(); ctx.translate(x + cell * 0.12, y + cell * 0.1); ctx.rotate(a);
    ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = Math.max(1.5, cell * 0.04); ctx.beginPath(); ctx.moveTo(0, -cell * 0.18); ctx.lineTo(0, cell * 0.12); ctx.stroke();
    ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-cell * 0.05, cell * 0.12, cell * 0.1, cell * 0.08); ctx.restore();
  }
  if (b.carry) { for (let i = 0; i < b.carry; i++) drawItemShape({ k: 'soil' }, x + cell * 0.17, y + cell * (0.3 - i * 0.1), 0.34); }   // 手に抱えた土（体の前に）
  if (tutBubble) {
    ctx.save(); ctx.font = `bold ${Math.max(10, Math.round(cell * 0.22))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(tutBubble).width + cell * 0.24, h = cell * 0.34, bx = x - w / 2, by = y - cell * 0.95;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 6) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
    const tl = x - cell * 0.07, tr2 = x + cell * 0.07, tip = by + h + cell * 0.11;
    ctx.beginPath(); ctx.moveTo(tl, by + h - 1.5); ctx.lineTo(x, tip); ctx.lineTo(tr2, by + h - 1.5); ctx.closePath(); ctx.fill();   // 枠の線を消すように少し上から塗る
    ctx.beginPath(); ctx.moveTo(tl, by + h); ctx.lineTo(x, tip); ctx.lineTo(tr2, by + h); ctx.stroke();                            // ▽の両側だけ線
    ctx.fillStyle = '#2b2b2e'; ctx.fillText(tutBubble, x, by + h / 2 + 1);
    if (tutWait()) {   // タップ待ち：吹き出しの右下に小さな▼（ゆっくり明るさが変わる。小さいので点滅の刺激はない）
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(performance.now() / 110));
      const tx4 = bx + w - cell * 0.08, ty4 = by + h - cell * 0.07, a4 = cell * 0.05;
      ctx.beginPath(); ctx.moveTo(tx4 - a4, ty4 - a4 * 0.6); ctx.lineTo(tx4 + a4, ty4 - a4 * 0.6); ctx.lineTo(tx4, ty4 + a4 * 0.6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}
// 掘る所を選ぶ間：掘れるマスを薄く示す
function drawTutPick() {
  if (!S.tut || S.tut.step !== 'pick') return;
  const cell = cp; ctx.fillStyle = THEME.okFill; ctx.strokeStyle = THEME.okLine; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  for (let c = 0; c < COLS; c++) if (tutCanDig(c)) { ctx.fillRect(c * cell + 1, SKY * cell + 1, cell - 2, cell - 2); ctx.strokeRect(c * cell + 2.5, SKY * cell + 2.5, cell - 5, cell - 5); }
  ctx.setLineDash([]);
}
function giftFirst() {
  S.loan1 = true; S.money += BAL.gift;
  addHist(tx().giftHist); S.notice = tx().giftMsg(fmt(BAL.gift));
}
// ---- 時間を進める ----
let simStep = SUB_SEC;   // 計算の刻み（放置の計算中だけ粗く）
function sim(sec) {
  while (sec > 1e-9) {
    const dt = Math.min(simStep, sec);
    sec -= dt;
    S.time += dt;
    if (window.__prof) {   // 試験用：どこが重いかを測る
      const P = window.__prof, tm = (k, f) => { const t0 = performance.now(); f(); P[k] = (P[k] || 0) + performance.now() - t0; };
      tm('items', () => updateItems(dt)); tm('workers', () => updateWorkers(dt)); tm('drills', () => updateDrills(dt)); tm('machines', () => updateMachines(dt));
      tm('forks', () => updateForks(dt)); tm('truck', () => updateTruck(dt)); tm('research', () => updateResearch(dt)); tm('liquids', () => updateLiquids(dt)); tm('facs', () => updateFacs(dt)); tm('boss', () => { updateBoss(dt); updateBossFork(dt); });
    } else {
    updateItems(dt);
    updateWorkers(dt);
    updateDrills(dt);
    updateMachines(dt);
    updateForks(dt);
    updateTruck(dt);
    updateResearch(dt);
    updateLiquids(dt);
    updateFacs(dt);
    updateBoss(dt); updateBossFork(dt);
    }
    if (S.tut) tutUpdate(dt); else if (S.tut2) tut2Update(dt);
    S.mgT = (S.mgT || 0) + dt; if (S.mgT >= 5) { S.mgT = 0; autoDepts(); }
    updateMonth();
    if (!S.loan1 && S.money < 30 && S.time > 10) giftFirst();   // 最初の資金ショート：プレゼント（1回だけ）
    if (S.boost.priceT > 0) S.boost.priceT = Math.max(0, S.boost.priceT - dt);
    S.stats.histT += dt;   // 情報グラフ用に資金を記録（1秒ごと）
    if (S.stats.histT >= 1) { S.stats.histT -= 1; S.stats.hist.push(S.money); if (S.stats.hist.length > 300) S.stats.hist.shift(); }
  }
}

// 月が変わったら：給料を払う・その月の収支を記録・雇える人を入れかえ
function updateMonth() {
  const m = Math.floor(S.time / TUNE.month);
  if (m === S.month) return;
  S.month = m;
  const cut = S.boost.wageM > 0; if (cut) S.boost.wageM--;
  const total = cut ? 0 : Math.round(S.workers.reduce((a, w) => a + wageOf(w), 0) * (sk('black') ? 0.8 : 1) * TUNE.wage);
  if (total > 0 && !S.loan1 && S.money < total + 30) giftFirst();   // 最初は、給料が払えない時も融資
  if (total > 0) {
    if (S.money >= total) { spend(total, OFFICE_C + 1, YARD_R, tx().payPop, true); if (!catchBusy) say(tx().payMsg(fmt(total)), 2600); }   // 給料は秘書のメッセージで
    else {
      // 払えない月：給料は払わず、いちばん給料の高い作業員が1人やめる（借金が雪だるまにならないように）
      const staff = S.workers.filter(x => !x.boss);   // 社長は辞めない
      const w = staff.length ? staff.reduce((a, b) => (wageOf(b) > wageOf(a) ? b : a)) : null;
      if (w) fireWorker(w.id);
      say(tx().quit); addHist(tx().quit);
    }
  }
  // 銀行の融資：お金が100未満で、先月の売上が0なら300貸してくれる（売上の2割ずつ返す。合計1500まで）
  if (S.money < 100 && S.stats.cur.sale === 0 && (S.loan || 0) + BAL.loan <= BAL.loanMax && S.month > 1) {   // 返している途中でも、上限までは借りられる
    S.money += BAL.loan; S.loan = (S.loan || 0) + BAL.loan;
    if (autoBusy || autoLive) autoFail();   // 自動プレイが救済の融資を受けた＝失敗。原因を残す
    say(tx().loanPop + ' +' + BAL.loan); addHist(tx().loanPop + ' ' + BAL.loan);
  }
  // 資金の節目（1000・1万・10万…を初めて超えた月）
  while (S.money >= Math.pow(10, 3 + S.moneyMark)) { addHist(tx().hMoney(Math.pow(10, 3 + S.moneyMark))); S.moneyMark++; }
  S.stats.months.push(S.stats.cur); if (S.stats.months.length > 24) S.stats.months.shift();
  S.stats.cur = { sale: 0, cost: 0 };
}

function approach(v, target, d) { return Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d; }

function updateItems(dt) {
  if ((S.ctT = (S.ctT || 0) + dt) >= 0.06 || !beltN.size) { S.ctT = 0; countThru(); }   // マスごとの数え直しは、0.06秒ごと（毎回はしない）
  let rmN = 0;
  for (let i = S.items.length - 1; i >= 0; i--) {
    const it = S.items[i];
    if (it.rm) { rmN++; continue; }
    if (it.y < SKY) { toSurface(it); (it.rm = true); continue; }   // 地上に出た → その場に置く（フォークリフトが運ぶ）
    const c = Math.floor(it.x), r = Math.floor(it.y), k = key(c, r);
    const s = S.st.get(k);
    if (s && s.type === 'machine' && it.thru) {   // 機械の中を通り抜け中（コンベアの半分の速さ＝2倍の時間）
      const [dx, dy] = DIRS[s.dir], v = (it.ps || 0.8) * TUNE.thru * it.spd * dt * TUNE.belt;
      if (dx !== 0) it.y = approach(it.y, r + 0.5 + it.lane, v); else it.x = approach(it.x, c + 0.5 + it.lane, v);
      const nx = it.x + dx * v, ny = it.y + dy * v, nc = Math.floor(nx), nr = Math.floor(ny);
      if (nc === c && nr === r) { it.x = nx; it.y = ny; continue; }
      const m2 = machineAt(nc, nr);
      if (m2 && accepts(m2, it)) { absorb(m2, it); (it.rm = true); continue; }
      if (m2 && thruIn(nc, nr) < THRU_MAX_()) { thruAdd(nc, nr); it.x = nx; it.y = ny; continue; }   // 次の機械も通り抜ける
      if (!m2 && inB(nc, nr) && blk(nc, nr) === null && (nr < SKY || isBelt(S.st.get(key(nc, nr))))) { it.x = nx; it.y = ny; it.thru = false; continue; }
      if (dx) it.x = c + 0.5 + dx * 0.42; else it.y = r + 0.5 + dy * 0.42;   // 出口がふさがっている
      continue;
    }
    if (!isBelt(s)) {
      it.x = approach(it.x, c + 0.5 + it.ox, dt * 0.6);
      const restY = r + 0.78 + it.oy * 0.3;
      if (!isSolid(c, r + 1)) {
        it.vy = Math.min(it.vy + BAL.grav * dt, 9); it.y += it.vy * dt;
      } else if (it.y < restY) {
        it.vy = Math.min(it.vy + BAL.grav * dt, 9); it.y = Math.min(restY, it.y + it.vy * dt);
      } else {
        it.vy = 0;
        const m = machineAt(c, r + 1);
        if (m && accepts(m, it)) { absorb(m, it); (it.rm = true); }
        else if (m && passThrough(m, c, r + 1, it) && it.gone) (it.rm = true);   // 上から落ちてきた対応外の物も通す
      }
      continue;
    }
    it.vy = 0;
    it.ps = valOf(s);
    const v = valOf(s) * it.spd * dt * TUNE.belt * beltSlow(s, k) * (beltMan.has(s) ? BAL.beltManned : 1);   // 作業員がいるコンベアは速い
    let md = s.dir;
    if (s.type === 'cross') md = it.cd || s.dir;            // 交差：入ってきた向きのまま抜ける
    if (s.type === 'tee') {                                  // T字路：真ん中で左右どちらかへ（ランダム）
      if (it.tk !== k) {
        const [ddx, ddy] = DIRS[s.dir];
        const along = ddx ? (it.x - (c + 0.5)) * ddx : (it.y - (r + 0.5)) * ddy;
        if (along >= 0) { it.tk = k; it.ts = Math.random() < 0.5 ? 'left' : 'right'; }
      }
      if (it.tk === k) md = it.ts === 'left' ? CCW[s.dir] : CW[s.dir];
    }
    if (s.type === 'sort' && sortHit(s, it.k)) {
      if (it.tk !== k) {
        const [dx, dy] = DIRS[s.dir];
        const along = dx ? (it.x - (c + 0.5)) * dx : (it.y - (r + 0.5)) * dy;
        if (along >= 0) it.tk = k;
      }
      if (it.tk === k) md = s.side === 'left' ? CCW[s.dir] : CW[s.dir];
    }
    const [dx, dy] = DIRS[md];
    if (dx !== 0) it.y = approach(it.y, r + 0.5 + it.lane, v * 0.6);
    else it.x = approach(it.x, c + 0.5 + it.lane, v * 0.6);
    const nx = it.x + dx * v, ny = it.y + dy * v;
    const nc = Math.floor(nx), nr = Math.floor(ny);
    if (nc === c && nr === r) { it.x = nx; it.y = ny; continue; }
    it.cd = md;   // 次のマスへ進む向き（交差で使う）
    const m = machineAt(nc, nr);
    if (m) {
      if (accepts(m, it)) { absorb(m, it); (it.rm = true); continue; }
      if (thruIn(nc, nr) < THRU_MAX_()) { thruAdd(nc, nr); it.thru = true; it.x = nx; it.y = ny; continue; }   // 対応外：機械の中をとてもゆっくり通り抜ける（混んでいたら手前で待つ）
    }
    else if (inB(nc, nr) && blk(nc, nr) === null && (nr < SKY || isBelt(S.st.get(key(nc, nr))))) {
      it.x = nx; it.y = ny; continue;
    }
    const edge = 0.42 - Math.abs(it.ox) * 0.4;
    if (dx) it.x = c + 0.5 + dx * edge; else it.y = r + 0.5 + dy * edge;
  }
  if (S.items.some(x => x.rm)) S.items = S.items.filter(x => !x.rm);   // 取り除いた物を、まとめて外す（1回だけ書き写す）
}

function updateDrills(dt) {
  S.stopT = (S.stopT || 0) + dt;
  const check = S.stopT >= 1; if (check) S.stopT -= 1;
  for (const s of typeList('drill').slice()) {   // ドリルは掘り進むと場所が変わるので、場所はその都度引く
    const k = stationKey(s); if (k < 0 || s.type !== 'drill' || s.off) continue;   // 止めてあるドリルは動かない
    if (check) {   // 1秒ごと：10秒以上止まっていたら知らせる（同じドリルは3分に1回まで）
      s.stuckT = s.stuck ? (s.stuckT || 0) + 1 : 0;
      if (s.stuckT >= 10 && S.time - (s.stopSaid || -1e9) > 180) {
        s.stopSaid = S.time;
        if (!s.no) s.no = (S.drillNo = (S.drillNo || 0) + 1);
        say(tx().drillStop(s.no), 4000, 'bad', { c: cOf(k), r: rOf(k), open: () => { const st2 = [...S.st.values()].includes(s) ? s : null; if (st2) openPop(st2); } }); pop(tx().drillStop(s.no), cOf(k) + 0.5, rOf(k) + 0.1, 'cost');
      }
    }
    s.t += dt;
    const iv = drillIv(s);   // 高速ドリルは速い
    if (s.t < iv) continue;
    s.t -= iv;
    drillHit(k, s);
  }
}
function moveDrill(k, s, nk) {
  S.st.delete(k); S.st.set(nk, s); S.deepest = Math.max(S.deepest, rOf(nk)); checkStage();
  const came = s.came; s.came = s.dir;   // そのマスに入ってきた向きを覚える
  // スキル「コンベア自動設置」：空いた後ろのマスに、後ろ向き（↓に掘るなら↑）のコンベアを置く
  if (S.opts.autoConv) {
    const c = cOf(k), r = rOf(k);
    if (r >= SKY && isOpen(c, r) && S.money - COST.conv >= -100) {   // お金が尽きても少しは置く（コンベアが途切れて売上が止まる詰みを防ぐ）
      spend(COST.conv, c + 0.5, r + 0.3);
      S.st.set(k, { type: 'conv', dir: OPP[came || s.dir], lv: 0 });
    }
  }
}

// その向きは掘り進められないか（自動ドリルの向き替え用）
function blockedFor(c, r, d) {
  const [dx, dy] = DIRS[d], tc = c + dx, tr = r + dy;
  if (!inB(tc, tr) || tr < SKY) return true;
  const g = blk(tc, tr);
  if (g === null) return !(d === 'down' && !S.st.has(key(tc, tr)));
  return g.mat === 'rock' && false;
}
const drillIv = s => (s.tid === 'fdrill' ? 0.35 : BAL.drillHit);
const drillPw = s => valOf(s) * workFactor(s) * TUNE.drill;
function drillEta(tc, tr) {
  const g = blk(tc, tr); if (!g) return 0;
  let rate = 0;
  for (const [k2, s2] of S.st) { if (s2.type !== 'drill' || s2.off) continue; const [dx, dy] = DIRS[s2.dir]; if (cOf(k2) + dx === tc && rOf(k2) + dy === tr) rate += drillPw(s2) / drillIv(s2); }
  if (!rate) return Infinity;
  const left = (g.left - 1) * g.h + (g.h - g.p);
  return Math.max(left / rate, g.left * drillIv({}));   // 1回に1個までなので、最低でも残りの数×1回
}
function drillHit(k, s) {
  const c = cOf(k), r = rOf(k);
  if (s.tid === 'adrill' && blockedFor(c, r, s.dir)) {   // 自動ドリル：ふさがったら掘れる向きへ
    const nd = ['down', 'right', 'left'].find(d => !blockedFor(c, r, d));
    if (nd) { s.dir = nd; s.stuck = false; }
  }
  const [dx, dy] = DIRS[s.dir];
  const tc = c + dx, tr = r + dy;
  if (!inB(tc, tr)) { s.stuck = true; return; }
  const g = blk(tc, tr);
  if (g === null) {
    if (s.dir === 'down' && !S.st.has(key(tc, tr)) && !isYard(tc, tr) && !isOffice(tc, tr)) { s.stuck = false; moveDrill(k, s, key(tc, tr)); }
    else s.stuck = true;
    return;
  }
  s.stuck = false; s.hit = S.time;
  if (fpsCtl.lite < 2 && !noDraw && !autoBusy && !catchBusy) dust(tc, tr, s.dir, g);   // 当たった所に土の粒（重い時は出さない）
  const pw = drillPw(s);
  g.p += pw;
  let n2 = 0;
  while (g.p >= g.h && g.left > 0 && n2 < 1) { g.p -= g.h; g.left--; n2++; emitOre(c, r, s, oreFrom(g)); }   // 1回で出せるのは2つまで
  if (n2 >= 1) g.p = Math.min(g.p, g.h * 0.99);   // 強すぎる分は捨てる（1マスに最低の時間がかかる）
  if (g.mat === 'rock') {   // 岩盤を叩いている間も、すぐ上の地面と同じ速さで資源が出る（破れなくても稼ぎは止まらない）
    const he = BAL.itemHp * TUNE.hard;   // 普通の地面と同じ出方（ドリルの力で決まる）
    s.racc = Math.min((s.racc || 0) + pw, he * 3);
    let n3 = 0; while (s.racc >= he && n3 < 1) { s.racc -= he; n3++; emitOre(c, r, s, oreFrom(g)); }
  }
  if (s.hint79 === undefined && g.mat === 'rock' && drillEta(tc, tr) > 600 && !autoBusy) { s.hint79 = 1; say(tx().rockSlow, 6000, 'bad', { c, r, open: () => { if ([...S.st.values()].includes(s)) openPop(s); } }); }   // 岩盤が硬い：ドリルを強化しよう
  if (g.left <= 0 && g.mat !== 'rock') {   // まれに珍しい物を掘り当てる（深いほど種類が増える）
    const d = tr - SKY, can = RARE.filter(([, md]) => d >= md);
    if (can.length && Math.random() < BAL.rareP * (1 + 0.25 * sk('vein'))) { const k2 = can[Math.floor(Math.random() * can.length)][0]; emitOre(c, r, s, k2); say(tx().rareFound(tx().items[k2]), 5000, 'good', { c: tc, r: tr }); }
  }
  if (g.left <= 0) { row(tr)[tc] = null; S.digVer++; veinDug(tc, tr); if (g.pocket) { makeWell(tc, tr, g.pocket); s.stuck = true; } else moveDrill(k, s, key(tc, tr)); }
}
// 湧き口ができる（石油・お湯）。パイプラインで地上につなぐとタンクにたまる
function makeWell(c, r, kind) {
  S.st.set(key(c, r), { type: 'well', kind, lv: 0 }); S.stVer++;
  const T = tx(); say(T.found[kind], 5000, 'good', { c, r }); addHist(T.found[kind]);
}
function emitOre(c, r, s, kind) {
  const [bx, by] = DIRS[OPP[s.dir]];
  const bc = c + bx, br = r + by;
  const m = machineAt(bc, br);
  if (m && accepts(m, { k: kind })) { absorb(m, { k: kind }); return; }
  if (canPut(bc, br)) spawnItem(kind, c + 0.5 + bx * 0.75, r + 0.5 + by * 0.75, bc, br);
  else spawnItem(kind, c + 0.5, r + 0.5, c, r);
}

const awaySec = () => TUNE.away * (sk('speeding') ? 0.5 : 1);   // スピード違反
const animSec = () => ANIM_SEC * (sk('speeding') ? 0.7 : 1);
// 駐車場にいる（または出入り中の）トラック
const bayTruck = () => S.fleet.find(t => t.phase === 'here' || t.phase === 'leaving' || t.phase === 'returning');
function payTruck(t) {
  earn(t.value, BED + 0.5, YARD_R);        // 帰ってきたら売上
  if (S.loan > 0 && t.value > 0) {         // 融資の返済（売上の2割）
    const back = Math.min(S.loan, Math.ceil(t.value * 0.2));
    S.money -= back; S.loan -= back;
  }
  S.stats.ships++;
  t.load = 0; t.value = 0;
}
function updateTruck(dt) {
  const cap = valOf('truck');
  for (const t of S.fleet) {
    if (t.phase === 'here') {
      if (t.load < cap && S.yard.length) {
        t.acc += dt * BAL.loadRate * (sk('yardPlus') ? 2 : 1);
        while (t.acc >= 1 && t.load < cap && S.yard.length) {
          const it = S.yard.shift();
          t.value += itemVal(it) * (S.boost.priceT > 0 ? 2 : 1); t.load++; t.acc--;
          const sd = S.sold || (S.sold = {}); sd[it.k] = (sd[it.k] || 0) + 1; sd['@' + rootOf(it)] = 1;   // 売った物（売値アップ・カタログ用）
        }
        t.wait = 0;
      } else { t.acc = 0; t.wait = (t.wait || 0) + dt; }
      // 満杯で出発。積みかけでも、積む物が15秒来なければ、積んだ分で出発（売上が止まったままにならない）
      if (t.load >= cap || (t.load > 0 && t.wait >= BAL.truckWait)) { t.phase = 'leaving'; t.t = 0; t.wait = 0; }
      continue;
    }
    if (t.phase === 'standby') { if (!bayTruck()) { t.phase = 'returning'; t.t = 0; } continue; }   // 2台目：空いたら入る
    t.t += dt;
    if (t.phase === 'leaving' && t.t >= animSec()) { t.phase = 'away'; t.t = 0; }
    else if (t.phase === 'away' && t.t >= awaySec() * (opOf(t) ? 1 : 2)) {   // 運転手がいないと2倍かかる
      t.t = 0;
      if (bayTruck()) { payTruck(t); t.phase = 'standby'; } else t.phase = 'returning';
    } else if (t.phase === 'returning' && t.t >= animSec()) {
      if (t.load) payTruck(t);
      t.phase = 'here'; t.t = 0;
    }
  }
}
function departNow() { const t = S.fleet.find(x => x.phase === 'here'); if (t && t.load > 0) { t.phase = 'leaving'; t.t = 0; } }

// ---- 研究（研究所で：機械・まとめて強化・スキル） ----
// 研究の中身：id は 'm:機械' / 'batch' / 'sk:スキル'
// 研究の費用：終えた研究の数だけ、すべての研究が少しずつ高くなる（×1.07 ずつ積み重なる）
const resMul = () => Math.pow(BAL.resGrow, S.resN || 0);
function resDef(id) { const d = resDef0(id); d.cost = Math.round(d.cost * resMul() / 10) * 10; return d; }
function resDef0(id) {
  if (id.startsWith('m:')) {
    const m = id.slice(2), [c, mo] = RESEARCH_MACH[m];
    return { name: tx().mach[m], desc: tx().machRes, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock[m] };
  }
  if (id.startsWith('t:')) {
    const t = id.slice(2), [c, mo] = RESEARCH_TOOL[t];
    return { name: tx()[t], desc: tx().toolRes, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock[t] };
  }
  if (id.startsWith('f:')) {
    const f = id.slice(2), [c, mo] = RESEARCH_FAC[f];
    return { name: tx().fac[f], desc: tx().facRes, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock[f] };
  }
  if (id === 'batch') {
    const [c, mo] = RESEARCH_BATCH;
    return { name: tx().batchName, desc: tx().batchDesc, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock.batch };
  }
  const sid = id.slice(3), lv = sk(sid), def = SKILLS[sid];
  return { name: tx().sk[sid][0], desc: tx().sk[sid][1], cost: skCost(sid, lv), months: skMonths(sid, lv), done: lv >= def.max, lv, max: def.max };
}
// 研究：研究室の数（最大4）まで並べて始められる。研究所にいる研究員の数だけ同時に進む（足りない分は止まる）
// 進む速さ＝研究員の技術（レベルが高いほど速い。Lv8なら約2.2倍＝本来の半分くらいの時間）
const labRooms = () => 1 + sk('labRoom');
const labStaff = () => S.workers.filter(w => w.target === S.lab && w.state === 'work').sort((a, b) => techFactor(b) - techFactor(a));
const labSeats = () => S.researches.length;   // 研究の数だけ席がある
function startResearch(id) {
  if (SKILLS[id]) id = 'sk:' + id;             // 古い呼び方にも対応
  if (!S.lab.built) { say(tx().needLab); return; }
  const d = resDef(id);
  if (d.done || !resAvail(id)) return;
  if (S.researches.length >= labRooms()) { say(tx().busy); return; }
  if (S.researches.some(r => r.id === id)) return;   // 同じ研究は1つずつ
  if (id === 'sk:digLv' && !permitOk()) { say(tx().permitMsg(permitNeed())); return; }   // 行政の許可がまだ
  if (S.money < d.cost) { say(tx().noMoney); return; }
  spend(d.cost, labC() + 0.5, YARD_R);
  S.researches.push({ id, t: 0, total: d.months * TUNE.month });
}
function gainSkill(id) {
  S.skills[id] = sk(id) + 1;
  // v1.01：倍速を手に入れても、今の速さは変えない（▶ を押すと速くなる）
  if (id === 'truck2') S.fleet.push(newTruck('standby'));
  if (id === 'autoConv') S.opts.autoConv = true;
  if (id === 'land') { S.landL = Math.max(0, S.landL - 1); S.landR = Math.min(COLS - 1, S.landR + 1); digCache.ver = -1; pathCache.ver = -1; S.digVer++; addHist(tx().landBought); }
}
// 油田探索：今いちばん深い所から下（段ごとに深く）を調べて、油田の湧き口になるマスに印
function oilSurvey() {
  S.oilMarks = S.oilMarks || {};
  const from = S.deepest + 1, to = S.deepest + 40 + 30 * sk('oilScan');
  let n = 0;
  for (let r = from; r <= to; r++) { const a = row(r); for (let c = 0; c < COLS; c++) if (a[c] && a[c].pocket === 'oil' && !S.oilMarks[key(c, r)]) { S.oilMarks[key(c, r)] = 1; n++; } }
  say(tx().oilScan(n), 6000, n ? 'good' : 'normal'); addHist(tx().oilScan(n));
}
// ---- 最後の目標：社員旅行 ----
const TRIP_NEED = { steelPart: 3000, cable: 3000, luxGlass: 2000, wireMesh: 3000, fuel: 4000, copperPlate: 4000, goldTile: 1000 };   // 宇宙に行くのに要る材料（仮の数）
const TRIP_SK = ['warehouse', 'trip', 'build', 'depart'];
function cappedAllDone() {   // 上限のある研究が全部そろったか
  for (const t of Object.keys(RESEARCH_TOOL)) if (!S.unlock[t]) return false;
  for (const m of Object.keys(RESEARCH_MACH)) if (!S.unlock[m]) return false;
  for (const f of Object.keys(RESEARCH_FAC)) if (!S.unlock[f]) return false;
  if (!S.unlock.batch) return false;
  for (const [k, d] of Object.entries(SKILLS)) { if (TRIP_SK.includes(k) || ['beltMax', 'dragPlus', 'digLv', 'truck2'].includes(k) || !(d.max < 99)) continue; if (sk(k) < d.max) return false; }
  return true;
}
const tripNeedLeft = k => (S.trip && TRIP_NEED[k] ? Math.max(0, TRIP_NEED[k] - (S.trip.got[k] || 0)) : 0);
const tripFull = () => !!S.trip && Object.keys(TRIP_NEED).every(k => tripNeedLeft(k) === 0);
const tripCollecting = () => sk('trip') > 0 && !tripFull();
function tripAdd(k, n) { if (tripNeedLeft(k) <= 0) return false; S.trip.got[k] = Math.min(TRIP_NEED[k], (S.trip.got[k] || 0) + n); if (tripFull()) { say(tx().tripReady, 6000, 'good'); addHist(tx().tripReady); } return true; }
// 社長のフォークリフト：材料がそろうまで、社長が自分でヤードから横取りして事務所倉庫へ運ぶ（トラックより先に取る）
function updateBossFork(dt) {
  const b = bossOf(); if (!b) return;
  if (!tripCollecting() || tripGather) {
    if (S.bossFork) { if (b.target === S.bossFork) { b.target = null; b.state = 'idle'; b.lastLook = -9; } S.bossFork = null; }
    return;
  }
  let f = S.bossFork;
  if (!f) f = S.bossFork = { type: 'fork', boss: true, x: OFFICE_C + 1, load: [], state: 'toYard', face: 1, lv: 0, tc: null };
  f.lv = Math.max(f.lv, ...S.forks.map(o => o.lv || 0)); f.op = b.id;   // 会社でいちばんいいフォークリフトと同じ
  const cap = lvVal('fork', f.lv), sp = forkSpeed(f.lv) * TUNE.fork;
  const goTo = x => { const d = x - f.x; f.moving = Math.abs(d) > 0.01; if (f.moving) f.face = Math.sign(d); if (Math.abs(d) <= sp * dt) { f.x = x; return true; } f.x += Math.sign(d) * sp * dt; return false; };
  if (YARD_C < 0) { goTo(OFFICE_C + 1); return; }
  if (f.state === 'toYard') { if (goTo(YARD_C + 0.5)) { f.state = 'load'; f.waitT = 0; } }
  else if (f.state === 'load') {   // 足りない材料だけを横取り
    for (let i = S.yard.length - 1; i >= 0 && f.load.length < cap; i--) {
      const it = S.yard[i], k = it.k === 'bag' ? it.of : it.k, n = it.k === 'bag' ? 5 : 1;
      if (tripNeedLeft(k) - f.load.filter(x => x.k === k).length >= n) { for (let j = 0; j < n; j++) f.load.push({ k }); S.yard.splice(i, 1); }
    }
    f.waitT = (f.waitT || 0) + dt;
    if (f.load.length >= cap || (f.load.length && f.waitT > 2)) f.state = 'toOffice';
  }
  else if (f.state === 'toOffice') { if (goTo(OFFICE_C + 1)) { for (const it of f.load) tripAdd(it.k, 1); f.load = []; f.state = 'toYard'; } }
}
// 出発：作業員を全員事務所に呼び戻す（歩いて戻る。その間もゲームは進む）→ そろったら「出発しますか？」→ 発進 → 宇宙
let tripGather = false, tripAsked = false, tripMsgT = 0, launchT = 0, tripTestOn = false;
function tripStart() {
  if (tripGather || launchT) return;
  tripGather = true; tripAsked = false; tripMsgT = 0; closePanels(); closePop();
  for (const w of S.workers) if (w.state !== 'rest' && w.state !== 'off' && w.state !== 'toRest') goRest(w);
  updateUI();
}
function tripTick() {   // 画面の更新ごと（実時間）
  if (!tripGather || launchT) return;
  const T = tx(), n = S.workers.filter(w => w.state === 'rest' || w.state === 'off').length, m = S.workers.length;
  if (!tripAsked && performance.now() - tripMsgT > 900) { tripMsgT = performance.now(); say(`${T.tripCall}\n${T.tripCount(n, m)}`, 1500, 'normal'); }
  if (n >= m && !tripAsked) {
    tripAsked = true;
    askConfirm(T.tripQ, () => {   // 29：開いている画面は全部閉じ、倍率・倍速を戻して、事務所に画面を合わせる
      closePanels(); closePop(); openCat = null; renderSub(); speedIdx = 0; cam.z = START_ZOOM; jumpTo({ c: OFFICE_C + 0.5, r: YARD_R - 1 }); updateUI();
      say(T.tripGo, 4000, 'normal'); setTimeout(() => { launchT = performance.now(); }, 1500); },
      () => { tripGather = false; tripTestOn = false; for (const w of S.workers) if (w.state === 'rest') w.lastLook = -9; say(''); });   // やめる：みんな持ち場へ戻る
  }
}
function tripEnd() {   // 宇宙から戻る：何事もなかったように続く
  $('space').hidden = true; launchT = 0; tripGather = false;
  if (tripTestOn) tripTestOn = false; else { S.tripN = (S.tripN || 0) + 1; addHist(tx().tripHist(S.tripN)); }   // テストは数えない
  for (const w of S.workers) if (w.state === 'rest') w.lastLook = -9;
  updateUI();
}
// 宇宙の絵（動かない絵。光らせない）
function showSpace() {
  const T = tx(); let box = $('space');
  if (!box) {
    box = document.createElement('div'); box.id = 'space'; box.className = 'modal space';
    box.innerHTML = '<div class="spbox"><canvas id="spaceCv"></canvas><h2 id="spaceT"></h2><p id="spaceSub"></p><div class="btns"><button id="spaceOk" class="active">OK</button></div></div>';
    document.body.append(box);
    $('spaceOk').addEventListener('click', () => { const b2 = $('spaceOk'); if (b2.disabled) return; b2.disabled = true; box.style.opacity = '0'; setTimeout(() => { b2.disabled = false; tripEnd(); }, 1000); });   // OK：ゆっくり消えてから戻る
  }
  $('spaceT').textContent = 'Thank you for playing!'; $('spaceSub').textContent = T.spaceSub((S.tripN || 0) + 1);
  box.hidden = false; box.style.opacity = '0'; void box.offsetWidth; box.style.opacity = '1';   // ゆっくり出てくる
  const c = $('spaceCv'), W = Math.min(window.innerWidth - 40, 420), H = Math.round(W * 0.62), dpr = window.devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
  const g = c.getContext('2d');
  const paint = () => {
    if (box.hidden) return;
    const t = performance.now() / 1000, fy = Math.sin(t * 0.9) * H * 0.035, tilt = Math.sin(t * 0.55) * 0.04;   // ふわふわ上下・少し傾く
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1030'); bg.addColorStop(1, '#1d2b5c'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const rnd = seeded(777); g.fillStyle = '#e8ecff'; for (let i = 0; i < 90; i++) { const sz = rnd() < 0.15 ? 2 : 1; g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), sz, sz); }   // 星（動かない）
    g.fillStyle = '#3a78c8'; g.beginPath(); g.arc(W * 0.86, H * 1.05, H * 0.42, 0, Math.PI * 2); g.fill();   // 地球
    g.fillStyle = '#5aa36a'; g.beginPath(); g.arc(W * 0.8, H * 0.86, H * 0.1, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(W * 0.93, H * 0.8, H * 0.07, 0, Math.PI * 2); g.fill();
    const bw = W * 0.2, bh = H * 0.42, bx = W * 0.32, by = H * 0.34 + fy;   // 事務所ロケット
    g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(tilt); g.translate(-(bx + bw / 2), -(by + bh / 2));
    g.fillStyle = '#e8e2d8'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(bx - 3, by); g.lineTo(bx + bw / 2, by - bh * 0.45); g.lineTo(bx + bw + 3, by); g.closePath(); g.fill();   // ▲
    g.beginPath(); g.moveTo(bx, by + bh * 0.55); g.lineTo(bx - bw * 0.45, by + bh); g.lineTo(bx, by + bh); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(bx + bw, by + bh * 0.55); g.lineTo(bx + bw + bw * 0.45, by + bh); g.lineTo(bx + bw, by + bh); g.closePath(); g.fill();   // 羽
    const fl = bh * (0.28 + 0.05 * Math.sin(t * 3));   // 火（長さがゆっくり変わるだけ）
    g.fillStyle = '#f0a040'; g.beginPath(); g.moveTo(bx + bw * 0.2, by + bh); g.lineTo(bx + bw / 2, by + bh + fl); g.lineTo(bx + bw * 0.8, by + bh); g.closePath(); g.fill();
    const ws = Math.min(9, S.workers.length), cols = 3;
    for (let i = 0; i < ws; i++) { const wx = bx + 4 + (i % cols) * (bw - 8) / cols, wy = by + 8 + Math.floor(i / cols) * 18; g.fillStyle = '#9fd0f0'; g.fillRect(wx, wy, (bw - 8) / cols - 3, 14); g.drawImage(WORKER_FR[1], 3, 0, 2, 3, wx + 2, wy + 2, 6, 9); }   // 窓からのぞく作業員
    g.drawImage(BOSS_FR[1], bx + bw / 2 - 8, by - bh * 0.45 - 16, 16, 16);   // てっぺんに社長
    g.restore();
    requestAnimationFrame(paint);
  };
  paint();
}
function finishResearch(id) {
  S.resN = (S.resN || 0) + 1;
  if (id === 'sk:trip' && !S.trip) S.trip = { got: {} };   // 材料集めの始まり
  if (id === 'sk:oilScan') setTimeout(oilSurvey, 0);
  if (id.startsWith('m:') || id.startsWith('t:') || id.startsWith('f:')) S.unlock[id.slice(2)] = true;
  else if (id === 'batch') S.unlock.batch = true;
  else gainSkill(id.slice(3));
}
function updateResearch(dt) {
  if (!S.researches.length) return;
  const ws = labStaff();
  S.researches.forEach((r, i) => { r.on = !!ws[i]; r.t += dt * (ws[i] ? techFactor(ws[i]) : BAL.labAlone); });   // 研究員がいない研究は、ゆっくり進む
  for (const r of S.researches.filter(x => x.t >= x.total)) {
    S.researches.splice(S.researches.indexOf(r), 1);
    const name = resDef(r.id).name;
    finishResearch(r.id);
    const msg = tx().researchDone(name);
    say(msg, 3500, 'good', { c: labC(), r: YARD_R, open: () => togglePanel('skillPanel') }); addHist(msg);
  }
}
// 事務所のレベルアップ（レベル2で研究所が建つ）
function secHello() { if (secOn() && !S.secHi) { S.secHi = true; setTimeout(() => say(tx().secCome, 6000, 'good'), 2500); } }
function officeUp() {
  const ol = S.office.lv;
  if (S.money < offCost(ol)) { say(tx().noMoney); return; }
  spend(offCost(ol), OFFICE_C + 1, YARD_R); S.office.lv++; addHist(tx().hOffice(S.office.lv + 1));
  if ((S.office.lv + 1) % 10 === 0) { const msg = tx().brandUp(S.office.lv + 1, Math.round((brandMul() - 1) * 100)); say(msg, 6000, 'good'); addHist(msg); }   // 区切り

  if (S.office.lv === 1 && !S.lab.built) say(tx().labUnlocked);   // 研究所を建てられるようになった（メニュー「施設」）
  secHello();   // 会社レベル3：秘書がつく
}
// フォークリフトを買う（台数の上限は事務所のレベル）
const forkMax = () => offForks(S.office.lv);
const truckAddCost = () => Math.round(BAL.truckAdd0 * Math.pow(BAL.truckAddG, S.fleet.length - 1) / 100) * 100;
function addTruck() {
  const c = truckAddCost();
  if (S.money < c) { say(tx().noMoney); return; }
  spend(c, BED + 0.5, YARD_R); S.fleet.push(newTruck('standby')); addHist(tx().truckAdded(S.fleet.length));
}
function buyFork() {
  if (S.forks.length >= forkMax()) { say(tx().forkFull); return; }
  const c = FORK_BUY(S.forks.length + 1);
  if (S.money < c) { say(tx().noMoney); return; }
  spend(c, OFFICE_C, YARD_R);
  S.forks.push(Object.assign(newFork(), { x: PARK_X }));
}

// ---- セーブ／ロード（ブラウザに保存。枠はスキルで増える） ----
const SAVE_KEY = n => `digfactory.save.${n}`;
const saveSlots = () => 1 + sk('saveSlot');
function serialize() {
  const keyOf = new Map(); for (const [k, v] of S.st) keyOf.set(v, k);
  const data = { ...S, rows: [...S.rows], st: [...S.st], pops: [],
    workers: S.workers.map(w => ({ ...w, lx: 0, leftFrom: null, target: !w.target ? null : w.target.type === 'lab' ? 'lab'
      : w.target.type === 'fork' ? 'f' + S.forks.indexOf(w.target) : w.target.type === 'truck' ? 't' + S.fleet.indexOf(w.target)
      : w.target.type === 'fac' ? 'a' + S.fac.indexOf(w.target)
      : keyOf.has(w.target) ? keyOf.get(w.target) : null })) };
  return JSON.stringify({ v: VERSION, at: Date.now(), S: data });
}
function deserialize(json) {
  const d = JSON.parse(json).S;
  d.rows = new Map(d.rows); d.st = new Map(d.st); d.pops = [];
  d.dock = d.dock || {}; d.forks = d.forks || [Object.assign(newFork(), { x: PARK_X })];
  d.stage = d.stage || stageOf(d.deepest); d.history = d.history || []; d.moneyMark = d.moneyMark || 0;
  d.boost = d.boost || { priceT: 0, wageM: 0, speedUntil: 0 };
  d.fac = d.fac || []; d.tank = d.tank || { oil: 0, hot: 0 }; d.cars = d.cars || []; d.stVer = d.stVer || 0;
  if (d.landL === undefined) {   // v0.39までのセーブ：土地はぜんぶ持っている。ヤードが1マスになったので、そこにある物はずらす
    d.landL = 0; d.landR = COLS - 1; d.skills = d.skills || {}; d.skills.land = LAND_MAX; delete d.land;
    const busy = c => (d.lab && d.lab.built && d.lab.c === c) || (d.fac || []).some(x => x.c === c) || c === OFFICE_C || c === OFFICE_C + 1 || c === YARD_C;
    const moveOff = o => { if (o.c !== YARD_C) return true; const c2 = [...Array(COLS).keys()].find(c => !busy(c)); if (c2 === undefined) return false; o.c = c2; return true; };
    if (d.lab && d.lab.built) moveOff(d.lab);
    d.fac = (d.fac || []).filter(moveOff);
    for (const c of Object.keys(d.dock || {})) if (+c === YARD_C) { for (const it of d.dock[c]) d.yard.push(it); delete d.dock[c]; }
    if (d.truck) d.truck.lv = Math.min(d.truck.lv + 2, 9);      // 積める数の表が変わった（最初2個から）
    for (const [r, a] of d.rows) for (const b of a) if (b && b.mat === 'rock') b.layer = layerAt(r - SKY) || b.layer;   // 岩盤の数え方が変わった
    const dl = (d.skills.digLv || 0); d.skills.digLv = dl ? 2 * dl : (d.deepest - SKY >= 5 ? 1 : 0);
    d.stage = stageOf(d.deepest); d.unlock = d.unlock || {}; if (d.stage >= 2) d.unlock.crusher = true;
    for (const f2 of d.forks || []) f2.lv = Math.min((f2.lv || 0) + 3, 9);
  }
  // 古いセーブへの対応
  d.lab = d.lab || { type: 'lab', built: false, op: null };
  if (!d.workers.some(w => w.boss)) {   // v0.52：社長がいない古いセーブには、社長を足す
    const w = { id: ++d.wid, lv: 0, exp: 0, vs: 1, vt: 1, stamina: 100, state: 'idle', x: OFFICE_C + 1.5, y: YARD_R + 0.5, path: [], target: null, boss: true };
    d.workers.push(w); d.bossWork = true; d.bossFat = 0;
  }
  if (d.bossWork === undefined) d.bossWork = true;
  if (d.tut === undefined) d.tut = null;
  if (!d.hp79) {   // v0.79：硬さの決め方が変わった
    d.hp79 = true;
    for (const [r, a] of d.rows) for (const b of a) {
      if (!b) continue;
      const dd = r - SKY;
      if (b.mat === 'rock') { const h2 = rockHp(b.layer) * TUNE.hard / 4; b.p = b.h ? b.p / b.h * h2 : 0; b.h = h2; continue; }
      const hp = cellHp(dd) * TUNE.hard * (b.mat === 'stone' ? 1.3 : 1), yN = Math.min(BAL.itemMax, Math.max(b.yieldN, Math.round(hp / BAL.itemHp)));
      const fr = b.yieldN ? b.left / b.yieldN : 1; b.yieldN = yN; b.left = Math.max(1, Math.round(fr * yN)); b.h = hp / yN; b.p = 0;
    }
  }
  if (!d.hp95) {   // v0.95：岩盤の硬さの元が 100 → 56 になった（5mより深い所はその分やわらかく）
    d.hp95 = true;
    for (const [r, a] of d.rows) { if (r - SKY < 5) continue; for (const b of a) if (b && b.h) { b.h *= 0.56; b.p = (b.p || 0) * 0.56; } }
  }
  if (d.secHi === undefined) d.secHi = d.office && d.office.lv >= 2;   // 前からのセーブで、もうレベル3以上なら、あいさつはしない
  if (d.resN === undefined) d.resN = Object.values(d.unlock || {}).filter(Boolean).length + Object.entries(d.skills || {}).reduce((a, [k2, v]) => a + (k2 === 'away' ? 0 : +v || 0), 0);   // v0.72：前からのセーブは、今までに終えた研究の数から
  d.veins = d.veins || []; if (d.veinTo === undefined) d.veinTo = Math.max(SKY, ...[...d.rows.keys()]) + 1;   // v0.73：鉱脈は、これから掘る所から
  d.elev = d.elev || {}; d.lamps = d.lamps || {}; d.lids = d.lids || {}; d.museum = d.museum || {};
  if (d.yardC === undefined) d.yardC = YARD_C0;
  YARD_C = BED = CAB = d.yardC;   // 読み込んだヤードの列
  d.opts = d.opts || {};
  if (d.skills && d.skills.away > 23) d.skills.away = 23;   // v0.61：放置時間は1時間ごと（最大23段）
  if (!d.seenIt) {   // v0.96：前からのセーブは、今ある資源・売った物を「出た」ことにする
    d.seenIt = { soil: 1 };
    for (const k in d.sold || {}) if (ITEMS[k]) d.seenIt[k] = 1;
    for (const it of [...(d.items || []), ...(d.yard || [])]) if (it && ITEMS[it.k]) d.seenIt[it.k] = 1;
    for (const c in d.dock || {}) for (const it of d.dock[c]) if (it && ITEMS[it.k]) d.seenIt[it.k] = 1;
  }
  if (!d.seen) {   // v0.59：前からのセーブは、今ある物はもう見たことにする（印だらけにならないよう）
    d.seen = {}; for (const m of MACHINE_ORDER) if (d.unlock && d.unlock[m]) d.seen['m:' + m] = 1;
    for (const t of ['fdrill', 'adrill', 'tee', 'cross', 'pipe', 'elev', 'lab', ...FAC_IDS]) if ((d.unlock && d.unlock[t]) || t === 'lab') d.seen[t] = 1;
  }
  if (d.seenRes === undefined) d.seenRes = null;   // null＝次に研究を開いた時、今ある研究を見たことにする
  for (const id of [...Object.keys(RESEARCH_MACH).map(m => 'm:' + m), ...Object.keys(RESEARCH_TOOL).map(t => 't:' + t)]) if (isGrant(id) && (d.stage || 1) >= (RES_STAGE[id] || 1)) { d.unlock = d.unlock || {}; d.unlock[id.slice(2)] = true; }   // v0.59：付与
  d.researches = d.researches || (d.research ? [d.research] : []); delete d.research;   // v0.52：研究は並べて進む
  if (d.office && d.office.lv >= 1) { d.skills = d.skills || {}; d.skills.digLv = Math.max(d.skills.digLv || 0, 1); }
  for (const s2 of d.st.values()) {   // v0.49：レベルの上限が変わった（機械5・横穴3・コンベア4＝Lv5）
    if (s2.type === 'machine') s2.lv = Math.min(s2.lv || 0, MACHINES[s2.m] && MACHINES[s2.m].src ? BAL.aditMax : LV.machine.cap);
    if (isBelt(s2)) s2.lv = Math.min(s2.lv || 0, BELT_CAP.length - 1);
  }   // v0.44：会社レベル2なら岩盤Lv0は破れる
  if (d.lab.built && d.lab.c === undefined) d.lab.c = OFFICE_C + 2;   // v0.17のセーブ（予定地に建っていた）
  d.unlock = d.unlock || Object.fromEntries(MACHINE_ORDER.map(m => [m, true]));
  for (const f of d.forks) { f.type = 'fork'; f.lv = f.lv || 0; f.op = f.op || null; }
  for (const t of d.fleet) { t.type = 'truck'; t.op = t.op || null; }
  if (!d.drillNo) { d.drillNo = 0; for (const s of d.st.values()) if (s.type === 'drill') s.no = ++d.drillNo; }   // ドリルに番号
  d.sold = d.sold || {}; d.priceLv = d.priceLv || {};
  if (d.loan1 === undefined) d.loan1 = (d.loan || 0) > 0 || d.time > 600;   // 遊び進めたセーブには、最初の融資は出さない
  for (const w of d.workers) {
    if (w.lv === undefined) { w.lv = Math.max(0, (w.techLv || 1) - 1); w.exp = w.lv ? LV_EXP[w.lv - 1] : 0; w.vs = 1; w.vt = 1; }
    const t = w.target;
    w.target = t === null || t === undefined ? null : t === 'lab' ? d.lab
      : typeof t === 'string' && t[0] === 'f' ? d.forks[+t.slice(1)] || null
      : typeof t === 'string' && t[0] === 't' ? d.fleet[+t.slice(1)] || null
      : typeof t === 'string' && t[0] === 'a' ? d.fac[+t.slice(1)] || null
      : d.st.get(t) || null;
  }
  return d;
}
function saveTo(n) {
  try { localStorage.setItem(SAVE_KEY(n), serialize()); say(tx().saved); } catch (e) { say(tx().saveNG); }
}
function loadFrom(n) {
  let j = null;
  try { j = localStorage.getItem(SAVE_KEY(n)); } catch (e) { say(tx().saveNG); return; }
  if (!j) return;
  askConfirm(tx().confirmLoad, () => {
    S = deserialize(j);
    pathCache.ver = -1; digCache.ver = -1; speedIdx = 0;
    closePop(); closePanels(); updateUI(); say(tx().loaded);
  });
}
// 自動セーブ：1つだけ。30秒ごと・ページを閉じる時・タイトルに戻る時
const AUTO_KEY = 'digfactory.auto';
let inTitle = true;
function autoSave() {
  if (inTitle || !S) return;
  try { localStorage.setItem(AUTO_KEY, serialize()); } catch (e) { /* 保存できない環境 */ }
}
function savedJson() {
  try { return localStorage.getItem(AUTO_KEY) || localStorage.getItem(SAVE_KEY(1)); } catch (e) { return null; }
}
// 放置できる時間（秒）：最初は30分、研究「放置時間延長」で30分ずつ、最大1日
const awayLimit = () => Math.min(86400, 3600 * (1 + sk('away')));   // 放置できる時間：1時間＋研究ごとに1時間（最大1日）
const fmtDur = sec => { const m = Math.round(sec / 60), T = tx(); return T.dur(Math.floor(m / 60), m % 60); };
// 留守の間を、本当に時間を進めて計算する（バーで進み具合を見せる）
// 見積もりの間のドリル：ドリルの力で前のマスを順に削る。掘りきったら進む（普段と同じ動き）。出た資源は見積もったお金に入っている扱い
function drillsAway(sec) {
  for (const s of typeList('drill').slice()) {
    if (s.off) continue;
    let budget = drillPw(s) / drillIv(s) * sec;
    for (let n = 0; n < 400 && budget > 0; n++) {
      const k = stationKey(s); if (k < 0) break;
      const [dx, dy] = DIRS[s.dir], tc = cOf(k) + dx, tr = rOf(k) + dy;
      if (!inB(tc, tr)) break;
      const g = blk(tc, tr);
      if (g === null) { if (s.dir === 'down' && !S.st.has(key(tc, tr)) && !isYard(tc, tr) && !isOffice(tc, tr)) { moveDrill(k, s, key(tc, tr)); continue; } break; }
      const rem = (g.left - 1) * g.h + (g.h - g.p);
      if (budget < rem) { const nr = rem - budget; g.left = Math.max(1, Math.ceil(nr / g.h)); g.p = g.left * g.h - nr; budget = 0; break; }
      budget -= rem; row(tr)[tc] = null; S.digVer++; veinDug(tc, tr);
      if (g.pocket) { makeWell(tc, tr, g.pocket); s.stuck = true; break; }
      moveDrill(k, s, key(tc, tr));
    }
  }
}
let catchBusy = false;   // 放置の計算中：画面は描かない（真っ暗にバーだけ）
async function catchUp(sec) {
  if (catchBusy) return;
  catchBusy = true; closePop();
  const T = tx(), box = $('away');
  box.hidden = false; box.classList.add('calc'); $('awayOk').hidden = true;
  $('awayMsg').textContent = T.awayCalc(fmtDur(sec)); $('awayEta').textContent = '';
  const m0 = S.money, s0 = S.stats.saleTotal, c0 = S.stats.costTotal, r0 = performance.now(), dpt = () => S.stats.deptCost || 0;
  // 本当に計算する時間（ゲームの秒）：2分以下の放置は全部。それより長い時は放置の2%（最小2分・最大5分）
  const exact = window.__awayExactForce || (sec <= BAL.awayExact ? sec : clamp(sec * BAL.awayRatio, BAL.awayExact, BAL.awayMax));
  let done = 0, half = null; simStep = BAL.awayStep;
  while (done < exact) {
    const t0 = performance.now();
    while (done < exact && performance.now() - t0 < 45) {
      const st = Math.min(20, exact - done); sim(st); done += st;
      if (!half && done >= exact / 2) half = { t: done, m: S.money, s: S.stats.saleTotal, c: S.stats.costTotal, d: dpt() };   // 後ろ半分の始まり
    }
    $('awayBar').style.width = (100 * done / sec) + '%';
    const el = (performance.now() - r0) / 1000;
    if (el > 0.6 && done < exact) $('awayEta').textContent = T.awayEta(Math.max(1, Math.ceil(el / done * (exact - done))));   // 完了まで あと約○秒
    await new Promise(r => setTimeout(r, 0));
  }
  const rest = sec - exact;
  if (rest > 0) {   // 残りは見積もり：計算した時間の後ろ半分の、1秒あたりのお金・売上・経費で進める（戻った直後のいつもどおりでない動きは使わない）
    const h = half && exact - half.t > 1 ? half : { t: 0, m: m0, s: s0, c: c0, d: 0 }, span = exact - h.t, dd = dpt() - h.d;
    // 部署の買い物（強化・売値アップ）は、続けて伸ばさず、見積もりの間も5秒ごとに本当に買わせる（買った強化や売値は本当に上がる）
    let ds = (S.stats.saleTotal - h.s) / span;
    const dc = (S.stats.costTotal - h.c - dd) / span, fixed = ds - (S.money - h.m + dd) / span;   // 部署の買い物以外の出費（給料など）
    const roots = ROOT_ORDER.filter(r2 => S.sold['@' + r2]), lvSum = () => roots.reduce((a, r2) => a + priceLv(r2), 0);
    let left = rest, lv0 = lvSum();
    while (left > 0) {
      const st = Math.min(5, left); left -= st;
      S.money += (ds - fixed) * st; S.stats.saleTotal += ds * st; S.stats.costTotal += dc * st; S.time += st;
      autoDepts();
      const lv1 = lvSum(); if (lv1 > lv0 && roots.length) { ds *= Math.pow(BAL.priceUpMul, (lv1 - lv0) / roots.length); lv0 = lv1; }   // 営業部が売値を上げた分、売上も上がる
    }
    S.month = Math.floor(S.time / TUNE.month);   // 給料は見積もりに入っているので、ここでは払わない
    updateResearch(rest);   // 研究は時間どおり進む（研究員の速さで）
    drillsAway(rest);       // ドリルも、その力で掘り進む（残り時間の表示どおり）
    if (S.boost.priceT > 0) S.boost.priceT = Math.max(0, S.boost.priceT - rest);
    $('awayBar').style.width = '100%';
  }
  simStep = SUB_SEC; S.pops = []; catchBusy = false; box.classList.remove('calc'); $('awayEta').textContent = ''; last = performance.now();
  $('awayMsg').textContent = T.awayDone(fmtDur(sec), S.stats.saleTotal - s0, S.money - m0);
  $('awayOk').hidden = false;
  addHist(T.hAway(fmtDur(sec)));
  autoSave();
}
function slotInfo(n) {
  try {
    const j = localStorage.getItem(SAVE_KEY(n));
    if (!j) return null;
    const d = JSON.parse(j).S, m = Math.floor(d.time / TUNE.month);
    return `${tx().date(Math.floor(m / 12) + 1, m % 12 + 1)}　${tx().money} ${d.money}`;
  } catch (e) { return null; }
}

// ---- 道（地上とつながった空きマス）と作業員の移動 ----
const NB = Object.values(DIRS);
let pathCache = { ver: -1, prev: null, dist: null };
// 事務所から、空いたマスをたどる（距離つき）
// 1マス動くのにかかる時間（横＝1。縦ははしごで遅い。エレベーターのあるマスの縦はとても速い）
let elevVer = 0;
function stepTime(k, nk, dy) {
  if (!dy) return 1;
  const v = BAL.walkH / BAL.walkV;
  return (S.elev[k] && S.elev[nk]) ? v / BAL.elevSpeed : v;
}
// かかる時間がいちばん短い道（小さな盤面なので、ふつうのダイクストラ）
function timeSearch(fromK, toK) {
  const dist = new Map([[fromK, 0]]), prev = new Map(), heap = [[0, fromK]];
  const push = (d, k) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p2 = (i - 1) >> 1; if (heap[p2][0] <= heap[i][0]) break; [heap[p2], heap[i]] = [heap[i], heap[p2]]; i = p2; } };
  const pop2 = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r2 = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop2();
    if (d > dist.get(k)) continue;
    if (k === toK) break;
    const c = cOf(k), r = rOf(k);
    for (const [dx, dy] of NB) {
      const nc = c + dx, nr = r + dy;
      if (!inB(nc, nr) || blk(nc, nr) !== null) continue;
      const nk = key(nc, nr), nd = d + stepTime(k, nk, dy);
      if (!dist.has(nk) || nd < dist.get(nk)) { dist.set(nk, nd); prev.set(nk, k); push(nd, nk); }
    }
  }
  return { dist, prev };
}
function officeMap() {
  if (pathCache.ver === S.digVer + elevVer * 1e7) return pathCache;
  const { dist, prev } = timeSearch(OFFICE_K, -1);
  pathCache = { ver: S.digVer + elevVer * 1e7, prev, dist };
  return pathCache;
}
function pathFromOffice(toK) {
  const { prev, dist } = officeMap();
  if (!dist.has(toK)) return null;
  const p = [];
  for (let k = toK; k !== OFFICE_K; k = prev.get(k)) p.push(k);
  return p.reverse();
}
function pathBetween(fromK, toK) {
  if (fromK === toK) return [];
  const { dist, prev } = timeSearch(fromK, toK);
  if (!dist.has(toK)) return null;
  const p = []; for (let x = toK; x !== fromK; x = prev.get(x)) p.push(x);
  return p.reverse();
}
const wKey = w => key(clamp(Math.floor(w.x), 0, COLS - 1), Math.max(0, Math.floor(w.y)));
const isAdvPost = p => p.type === 'lab' || p.type === 'fork' || p.type === 'truck';
// 持ち場の場所（マス）
function postKey(p) {
  if (p.type === 'lab') return key(labC(), YARD_R);
  if (p.type === 'fac') return key(p.c, YARD_R);
  if (p.type === 'fork') return key(clamp(Math.floor(p.x), 0, COLS - 1), YARD_R);
  if (p.type === 'truck') return key(BED, YARD_R);
  return stationKey(p);
}
function postAlive(p) {
  if (p.type === 'lab') return S.lab.built;
  if (p.type === 'fac') return S.fac.includes(p);
  if (p.type === 'fork') return S.forks.includes(p);
  if (p.type === 'truck') return S.fleet.includes(p);
  return stationKey(p) >= 0;
}
// その持ち場で今働いている（運転している）作業員
const opOf = p => (p && p.op ? S.workers.find(w => w.id === p.op && w.target === p && (w.state === 'work' || w.state === 'drive')) : null);
let stKeyMap = new Map(), stKeyStamp = '';
function stationKey(s) {
  let k = stKeyMap.get(s);
  if (k !== undefined && S.st.get(k) === s) return k;   // 表のとおり
  const stamp = S.st.size + ':' + S.stVer;
  if (k === undefined && stamp === stKeyStamp) return -1;   // 表を作ったあと何も変わっていない＝置いた物ではない
  stKeyMap = new Map(); for (const [k2, v] of S.st) stKeyMap.set(v, k2); stKeyStamp = stamp;   // 作り直す（動いた・増えた・減った）
  k = stKeyMap.get(s); return k === undefined ? -1 : k;
}

// 1マスずつ歩く（横は速く、縦ははしごでゆっくり）
function walk(w, dt) {
  while (w.path.length && dt > 0) {
    const k = w.path[0], tx_ = cOf(k) + 0.5, ty = rOf(k) + 0.5;
    const ddx = tx_ - w.x, ddy = ty - w.y;
    if (Math.abs(ddx) < 1e-3 && Math.abs(ddy) < 1e-3) { w.path.shift(); continue; }
    const vert = Math.abs(ddy) > Math.abs(ddx), inElev = vert && (S.elev[k] || S.elev[wKey(w)]);
    if (inElev) w.elevT = S.time;   // エレベーターで縦に動いた時刻（箱を出し続けるため）
    if (vert && !inElev) w.vT = S.time; else if (!vert && Math.abs(ddx) > 0.02) w.vT = -9;   // 縦に歩いた時刻（絵を境目の線へ寄せる）
    else if (!vert && Math.abs(ddx) > 0.02) w.elevT = -9;   // 横に歩き出したら、箱はもう出さない
    const sp = (vert ? BAL.walkV * (inElev ? BAL.elevSpeed : 1) : BAL.walkH) * TUNE.walk;   // エレベーターのあるマスは、縦がとても速い
    const d = Math.hypot(ddx, ddy), step = sp * dt;
    if (step >= d) { w.x = tx_; w.y = ty; dt -= d / sp; w.path.shift(); }
    else { w.x += ddx / d * step; w.y += ddy / d * step; dt = 0; }
  }
  return w.path.length === 0;
}

function updateWorkers(dt) {
  let taken = null, facN = null, labN = 0;
  const busyMake = () => {   // 暇な人が持ち場を探す時だけ作る（毎回は作らない）。地上施設は数人まで
    const busyW = S.workers.filter(w => w.target && (w.state === 'toWork' || w.state === 'work' || w.state === 'drive'));
    taken = new Set(busyW.map(w => w.target));
    facN = new Map(); for (const w of busyW) if (w.target.type === 'fac') facN.set(w.target, (facN.get(w.target) || 0) + 1);
    labN = busyW.filter(w => w.target === S.lab).length; taken.delete(S.lab);
  };
  for (const w of S.workers) {
    const maxS = maxStamina(w);
    if (w.boss && S.tut) continue;   // はじめの手順の間、社長は手順どおりに動く
    if (w.boss && S.bossFork && !tripGather) { w.state = 'drive'; w.target = S.bossFork; w.path = []; w.x = S.bossFork.x; w.y = YARD_R + 0.5; continue; }   // 社長は材料運び専属
    if (w.boss && !S.bossWork) {   // 社長が作業しない：事務所（屋上・窓）にいる
      if (w.target) { if (w.target.op === w.id) w.target.op = null; w.target = null; }
      w.state = 'off'; w.path = []; w.stamina = maxS; w.x = OFFICE_C + 1; w.y = YARD_R + 0.5;
      continue;
    }
    if (w.boss && w.state === 'off') { w.state = 'idle'; w.lastLook = -9; }
    if (tripGather && w.state !== 'rest' && w.state !== 'toRest' && w.state !== 'off') goRest(w);   // 集合：歩いて事務所へ
    // 持ち場が無くなった → 戻る
    if (w.target && !postAlive(w.target)) {
      if (w.target.op === w.id) w.target.op = null;
      w.target = null;
      if (w.state === 'toWork' || w.state === 'work' || w.state === 'drive') goRest(w);
    }
    switch (w.state) {
      case 'idle': {
        if (S.time - (w.lastLook || -9) < 0.5) break;
        w.lastLook = S.time;
        if (!taken) busyMake();
        const { dist } = officeMap();
        let best = null, bd = Infinity;
        // Lv2以上は、地上・上級勤務（研究所・フォークリフト・トラック）を先に
        if (w.lv >= BAL.advLv) {
          const adv = [];
          if (S.lab.built && labN < labSeats()) adv.push(S.lab);   // 研究所：研究の数だけ席
          for (const f of S.forks) adv.push(f);
          for (const t of S.fleet) if (t.phase === 'here') adv.push(t);
          for (const p of adv) { if (p !== S.lab && taken.has(p) || p.type === 'fork' && p.state === 'idle' && !p.load.length && pickDock(p) === null) continue; const d = dist.get(postKey(p)); if (d !== undefined && d < bd) { bd = d; best = p; } }
        }
        const advBest = best;
        if (!best) for (const [k, st] of S.st) {
          if (!isStation(st) || taken.has(st) || st === w.leftFrom) continue;
          const d = dist.get(k);
          if (d === undefined) continue;
          const sc = d - workNeed(st) * 3 - (st.prio === undefined ? (isBelt(st) ? 0 : 1) : st.prio) * 40;   // 小さいほど先に行く（コンベアは後回し）
          if (sc < bd) { bd = sc; best = st; }
        }
        if (!advBest) for (const f of S.fac) {   // 地上の施設（上級勤務に決まった人は除く）
          const fn = facN.get(f) || 0;
          if (fn >= BAL.facSlots || f === w.leftFrom) continue;
          const d = dist.get(postKey(f));
          if (d === undefined) continue;
          const sc = d - workNeed(f) * 3 - (f.prio === undefined ? 1 : f.prio) * 40;
          if (sc < bd) { bd = sc; best = f; }
        }
        if (best) {
          w.target = best; if (best !== S.lab) taken.add(best); else labN++; if (best.type === 'fac') facN.set(best, (facN.get(best) || 0) + 1);
          w.path = (wKey(w) === OFFICE_K ? pathFromOffice(postKey(best)) : pathBetween(wKey(w), postKey(best))) || [];   // 今いる所から
          w.state = 'toWork';
        }
        w.leftFrom = null;
        break;
      }
      case 'toWork': {
        w.stamina = Math.max(0, w.stamina - dt * 0.3 * drainMul());
        const stK = postKey(w.target);
        if (w.target.type === 'truck' && w.target.phase !== 'here') { goRest(w); break; }   // トラックが出てしまった
        if (walk(w, dt)) {
          if (wKey(w) === stK) { w.state = w.target.type === 'fork' || w.target.type === 'truck' ? 'drive' : 'work'; w.target.op = w.id; }
          else w.path = pathBetween(wKey(w), stK) || [];      // 持ち場が動いた → 追いかける
        }
        break;
      }
      case 'work': {   // ドリル・機械・研究所
        const stK = postKey(w.target);
        if (wKey(w) !== stK) {
          if (!w.path.length) w.path = pathBetween(wKey(w), stK) || [];
          walk(w, dt);
        }
        w.target.op = w.id;
        w.stamina -= dt * drainMul();
        if (wKey(w) === stK && (w.target === S.lab ? S.researches.length > 0 : workNeed(w.target) > 0)) gainExp(w, dt);   // 着いていて、仕事がある時だけ
        if (w.stamina <= 0) { w.stamina = 0; goRest(w); break; }
        if (w.target === S.lab && S.workers.filter(o => o.target === S.lab && o.state === 'work').length > labSeats()) { leavePost(w); break; }   // 研究が減って席が余った
        // 暇な持ち場（材料が無い機械・止まったドリル・液体の無い施設）に8秒いたら、仕事のある空いた持ち場へ移る
        if (w.target.type !== 'lab') {
          w.idleT = workNeed(w.target) <= 0 ? (w.idleT || 0) + dt : 0;
          if (w.idleT > (w.boss ? 1 : [8, 5, 3, 2][sk('bored')])) { w.idleT = 0; if (betterPost(w)) leavePost(w); }   // v0.98：最速2秒（せわしなくない）。社長は1秒
        }
        break;
      }
      case 'drive': {  // フォークリフト・トラックを運転（乗り物と一緒に動く）
        const v = w.target;
        v.op = w.id;
        if (v.type === 'fork') {
          w.x = v.x; w.y = YARD_R + 0.5;
          v.idleT = v.state === 'idle' && !v.load.length ? (v.idleT || 0) + dt : 0;
          if (v.idleT > 8) { v.idleT = 0; leavePost(w); break; }   // 8秒仕事が無ければ降りて、ほかの持ち場を探す
        }
        else { w.x = BED + 0.5; w.y = YARD_R + 0.5; }
        w.stamina = Math.max(0, w.stamina - dt * drainMul());
        const vBusy = v.type === 'fork' ? !(v.state === 'idle' && !v.load.length) : (v.phase !== 'here' || S.yard.length > 0);
        if (vBusy) gainExp(w, dt);   // v1.00：乗り物も、暇な時（荷が無く待っているだけ）は経験値が増えない
        if (w.stamina <= 0 && (v.type === 'fork' || v.phase === 'here')) goRest(w);   // トラックは戻ってから降りる
        break;
      }
      case 'toRest':
        if (walk(w, dt)) w.state = 'rest';
        break;
      case 'toIdle':   // 休まずに次の持ち場へ（事務所に戻ってから探す）
        if (walk(w, dt)) { w.state = 'idle'; w.lastLook = -9; }
        break;
      case 'rest':
        w.stamina = Math.min(maxS, w.stamina + dt * maxS / Math.max(BAL.restMin, BAL.restSec / restMul()));   // 休みきるまで最低3秒
        if (w.stamina >= maxS && !tripGather) { w.state = 'idle'; w.lastLook = -9; }   // 集合中は休憩室で待つ（ぎゅうぎゅう）
        break;
    }
  }
}
// 持ち場を離れて、その場で次の持ち場を探す（休まない）
function leavePost(w) {
  if (w.target && w.target.op === w.id) w.target.op = null;
  w.leftFrom = w.target; w.target = null; w.path = []; w.state = 'idle'; w.lastLook = -9;
}
// 仕事があって、まだ誰もいない持ち場があるか（移る価値があるか）
function betterPost(w) {
  const { dist } = officeMap();
  for (const [k, st] of S.st) if (isStation(st) && st !== w.target && !opOf(st) && dist.has(k) && workNeed(st) > 0 && !S.workers.some(o => o.target === st)) return true;
  for (const f of S.fac) if (f !== w.target && workNeed(f) > 0 && S.workers.filter(o => o.target === f).length < BAL.facSlots) return true;
  return false;
}
// 持ち場の「仕事の多さ」：ドリルは掘っていれば5（ふさがっていれば-30）、機械は中の材料の数（0なら-10）
function workNeed(st) {
  if (st.type === 'drill') return st.off ? -60 : st.stuck ? -30 : 5;
  if (isBelt(st)) {   // コンベア：資源が乗っていれば少しだけ仕事。詰まっていれば（乗る数いっぱい）大きな仕事・地上に近いほど先
    const k2 = stationKey(st), n = beltN.get(k2) || 0; if (!n) return -5;
    return n >= BELT_CAP[st.lv || 0] ? 7 + Math.max(0, 5 - (rOf(k2) - SKY) / 6) : 1;
  }
  if (st.type === 'fac') return (st.f === 'museum' ? Object.keys(S.museum || {}).length > 0 : st.f === 'refinery' ? S.tank.oil >= 2 : st.f === 'spa' ? S.tank.hot >= 5 : S.tank.hot + S.tank.oil >= 1) ? 8 : -10;
  if (st.type === 'machine') {
    const n = st.cur ? 3 : 0, b = Object.values(st.buf || {}).reduce((a, v) => a + v, 0) + Object.values(st.bags || {}).reduce((a, v) => a + v, 0);
    return n + b > 0 ? Math.min(12, n + b) : -10;
  }
  return 0;
}
function goRest(w) {
  if (w.target && w.target.op === w.id) w.target.op = null;
  w.target = null;
  w.path = pathBetween(wKey(w), OFFICE_K) || [];
  w.state = 'toRest';
}
// 雇う：選ばずに「Lv0（人事力でLv1・Lv2）を増員」
function hire() {
  if (staffN() >= offCap(S.office.lv)) { say(tx().full); return; }
  const lv = hireLv(), fee = HIRE_FEE(lv);
  if (S.money < fee) { say(tx().noMoney); return; }
  spend(fee, OFFICE_C + 1, YARD_R);
  addWorker(lv);
}
// その レベルの人を1人やめさせる（休んでいる人から）
function fireLevel(lv) {
  const order = ['rest', 'idle', 'toIdle', 'toRest', 'toWork', 'work', 'drive'];
  const ws = S.workers.filter(w => w.lv === lv && !w.boss).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  if (ws.length) fireWorker(ws[0].id);
}
function fireWorker(id) {
  const w = S.workers.find(x => x.id === id);
  if (!w || w.boss) return;   // 社長はやめない
  if (w.target && w.target.op === w.id) w.target.op = null;
  S.workers = S.workers.filter(x => x !== w);
}
const workerName = w => tx().worker(w.id);

// ---- 掘削（地上とつながった穴の隣だけ） ----
let digCache = { ver: -1, set: null };
function diggable() {
  if (digCache.ver === S.digVer) return digCache.set;
  const seen = new Set(), q = [];
  for (let r = 0; r < SKY; r++) for (let c = 0; c < COLS; c++) { const k = key(c, r); seen.add(k); q.push(k); }
  while (q.length) {
    const k = q.pop(), c = cOf(k), r = rOf(k);
    for (const [dx, dy] of NB) {
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
    for (const [dx, dy] of NB) {
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
  if (b.mat === 'rock' && false) { say(tx().needDig(rockLv(b.layer))); return; }
  const cost = digCost(b);
  if (S.money < cost) { say(tx().noMoney); return; }
  spend(cost, c + 0.5, r + 0.3);
  row(r)[c] = null; S.digVer++; veinDug(c, r);
  if (b.pocket) makeWell(c, r, b.pocket);
  S.deepest = Math.max(S.deepest, r); checkStage();
}

// ---- 設置・レベル ----
let tool = 'none', machSel = 'kiln', dir = 'right', running = true, speedIdx = 0;

// 値段：ドリル（種類ごと）と機械（種類ごと）は、すでに建っている数だけ「値上がりの倍率」が掛かる
const grows = id => isDrillTool(id) || id.startsWith('m:') || isFacTool(id);
const countOf = id => { if (isFacTool(id)) return S.fac.filter(f => f.f === id).length; let n = 0; for (const s of S.st.values()) if (id.startsWith('m:') ? s.type === 'machine' && s.m === id.slice(2) : s.type === 'drill' && (s.tid || 'drill') === id) n++; return n; };
function buildCost(id, back = 0) {
  const base = id.startsWith('m:') ? MACHINES[id.slice(2)].cost : COST[id];
  return grows(id) ? Math.round(base * Math.pow(TUNE.costGrow, Math.max(0, countOf(id) - back))) : base;
}
const idOfSt = s => (s.type === 'machine' ? 'm:' + s.m : s.type === 'drill' ? s.tid || 'drill' : s.type);
function costOf(s) { return buildCost(idOfSt(s), 1); }   // 撤去で戻る額の元（その物の値段）
// 同じ物がもう置いてあるか（同じなら何もしない）
function sameAs(st, dragging, ed) {   // なぞって置く時だけ向きも比べる（タップの上書きは下の物の向きを引き継ぐので、同じ種類なら何もしない）
  if (!st) return false;
  if (st.type === 'drill') return isDrillTool(tool) && (st.tid || 'drill') === tool;
  if (st.type === 'machine') return tool === 'machine' && st.m === machSel && (st.dir === ed || !dragging);
  if (st.type === 'pipe') return tool === 'pipe';
  return st.type === tool && (st.dir === ed || !dragging);
}
// コンベアの向き「オート」：流れ込んでくるコンベアがあれば同じ向きに続ける。なければ隣のコンベア・機械へ流す。どれも無ければ上（地上へ）
function autoDir(c, r) {
  const at = (dx, dy) => (inB(c + dx, r + dy) ? S.st.get(key(c + dx, r + dy)) : null);
  const toMe = (s, dx, dy) => s && s.dir && DIRS[s.dir] && DIRS[s.dir][0] === -dx && DIRS[s.dir][1] === -dy;
  for (const [dx, dy] of Object.values(DIRS)) { const s = at(dx, dy); if (isBelt(s) && toMe(s, dx, dy)) return s.dir; }
  for (const [d, [dx, dy]] of Object.entries(DIRS)) { const s = at(dx, dy); if (s && (isBelt(s) || s.type === 'machine') && !toMe(s, dx, dy)) return d; }
  return 'up';
}
let dragDir = null;   // なぞっている向き（「オート」の時も、なぞった向きが優先）
const effDir = (c, r, dragging) => (dragging && dragDir ? dragDir : dir === 'auto' ? (tool === 'conv' ? autoDir(c, r) : 'right') : dir);
// 道具ごとに、最後に選んだ向き・仕分けの設定を覚える
function memSet(k, v) { S.opts = S.opts || {}; S.opts.dirMem = S.opts.dirMem || {}; S.opts.dirMem[k] = v; }
const memGet = k => ((S.opts || {}).dirMem || {})[k];
// 続けて置くかもしれない道具（選んだまま）。それ以外（ドリル・機械・施設）は1つ置くと選択が外れる
const isRepeatTool = t => ['conv', 'sort', 'tee', 'cross', 'pipe', 'elev', 'lamp', 'dig', 'remove'].includes(t);
const isDragTool = t => t === 'conv' || t === 'pipe' || t === 'elev' || t === 'remove';   // なぞって続けて置ける（なぞっても画面は動かない）
function apply(c, r, dragging) {
  if (!inB(c, r) || tool === 'pan' || tool === 'none') return;
  if (tool === 'dig') { if (!dragging) digAt(c, r); return; }
  const k = key(c, r), s = S.st.get(k);
  if (tool === 'remove') {   // コンベア・パイプはそのまま。ほかは尋ねる（なぞっている時は、とばす）
    const ask = f => { if (!dragging) askConfirm(tx().removeQ, () => { f(); updateUI(); }); };
    if (s) { if (isLineLike(s)) removeAt(k); else ask(() => removeAt(k)); }
    else if (S.elev[k]) ask(() => removeElev(k));
    else if (S.lamps[k]) ask(() => removeLamp(k));
    else if (r === YARD_R && facAt(c)) { const f0 = facAt(c); ask(() => removeFac(f0)); }
    else if (r === YARD_R && c === YARD_C && YARD_C >= 0) ask(removeYard);
    return;
  }
  if (tool === 'yard') {   // トラックヤードを置く（マップに1つ）
    if (YARD_C >= 0 || r !== YARD_R || !surfaceFree(c) || c === OFFICE_C || c === OFFICE_C + 1) { if (!dragging) say(tx().cantPlace); return; }
    if (S.money < COST.yard) { say(tx().noMoney); return; }
    spend(COST.yard, c + 0.5, YARD_R); setYard(c);
    if (S.dock[c]) { for (const it of S.dock[c]) S.yard.push(it); delete S.dock[c]; }
    tool = 'none'; S.digVer++; return;
  }
  if (tool === 'lamp') {   // 照明：別の層に置く（何の上にも置ける）
    if (r < SKY || S.lamps[k]) return;
    if (blk(c, r)) { if (!dragging) say(tx().cantPlace); return; }
    if (S.money < COST.lamp) { if (!dragging) say(tx().noMoney); return; }
    spend(COST.lamp, c + 0.5, r + 0.3); S.lamps[k] = 1; lampVer++; return;
  }
  if (tool === 'elev') {   // エレベーター：ほかの物と別の層に置く（コンベアや機械の上にも置ける）
    if (r < SKY || S.elev[k] || (s && s.type === 'well')) return;
    if (s && !dragging) { openPop({ type: 'elevPlace', c, r }); return; }   // 物があるマス：エレベーターを置くか、下の物を見るか
    const b = blk(c, r); if (b && !(diggable().has(k) && !(b.mat === 'rock' && false))) { if (!dragging) say(tx().cantPlace); return; }
    if (S.money < COST.elev) { if (!dragging) say(tx().noMoney); return; }
    spend(COST.elev, c + 0.5, r + 0.3); if (b) { row(r)[c] = null; S.digVer++; }
    S.elev[k] = 1; elevVer++; return;
  }
  if (dragging && tool !== 'conv' && tool !== 'pipe') return;
  if (tool === 'lab' && S.office.lv < 1) { say(tx().needLab); return; }
  if (!canPlaceAt(c, r)) {
    if (!dragging) say(tool === 'lab' ? tx().labWhere : r < SKY ? tx().underOnly : tx().cantPlace);
    return;
  }
  const ed = effDir(c, r, dragging);
  if (s && tool === 'conv' && s.type === 'conv') {   // コンベアの上にコンベア：お金はかからず、向きだけ変える（「オート」でタップした時は、そのコンベアを選ぶ）
    if (dir === 'auto' && !dragging) { openPop(s); return; }
    if (s.dir !== ed) { s.dir = ed; S.stVer++; }
    return;
  }
  if (sameAs(s, dragging, ed)) return;
  const cost = buildCost(toolId());
  if (S.money < cost) { if (!dragging) say(tx().noMoney); return; }
  if (isDrillTool(tool) && !dragging) { openPop({ type: 'pend', c, r, dir: 'down', tid: tool }); return; }   // ドリル：仮置き → 向きを選んで「設置する」
  if (!dragging && (tool === 'machine' || tool === 'sort' || tool === 'tee' || tool === 'cross')) {   // 機械・仕分けなども：仮置き → 向き・選ぶ資源 → 「設置する」
    const pdir0 = s && s.dir && s.type !== 'drill' ? s.dir : ed;
    const mf = memGet('sort.f'), f0 = mf && sortChoices('').includes(mf) ? mf : (sortChoices('')[0] || 'soil');
    openPop({ type: 'pend', c, r, dir: pdir0, tid: toolId(), filter: s && s.type === 'sort' ? s.filter : f0, side: s && s.type === 'sort' ? s.side : (memGet('sort.s') || 'left') });
    return;
  }
  if (tool === 'conv' && !dragging && s && s.type === 'conv') {   // もう一度押すと向きが回る（お金はかからない）
    const order = ['up', 'right', 'down', 'left']; s.dir = order[(order.indexOf(s.dir) + 1) % 4]; dir = s.dir; S.stVer++; updateUI(); return;
  }
  const pdir = s && s.dir && s.type !== 'drill' && !dragging ? s.dir : ed;   // 上書きは、下の物と同じ向きで置く
  // 上書き：今ある物を撤去（半額戻る）してから置く。コンベア・パイプ以外は確認してから（なぞっている時は上書きしない）
  if (s && !isLineLike(s)) { if (dragging) return; askConfirm(tx().overwriteQ, () => { removeAt(k); placeAt(c, r, cost, pdir); updateUI(); }); return; }
  if (s) removeAt(k);
  placeAt(c, r, cost, pdir);
}
// 仮置きしたドリルを、選んだ向きで設置する
function placePend(pd) {
  if (!isDrillTool(pd.tid)) return placePend2(pd);
  if (!canPlaceAt(pd.c, pd.r) || S.st.has(key(pd.c, pd.r)) && S.st.get(key(pd.c, pd.r)).type === 'drill') { say(tx().cantPlace); return false; }
  const cost = buildCost(pd.tid);
  if (S.money < cost) { say(tx().noMoney); return false; }
  const k = key(pd.c, pd.r);
  if (S.st.has(k) && !isLineLike(S.st.get(k)) && !pd.okOver) { askConfirm(tx().overwriteQ, () => { pd.okOver = true; if (placePend(pd)) closePop(); updateUI(); }); return false; }
  if (S.st.has(k)) removeAt(k);
  spend(cost, pd.c + 0.5, pd.r + 0.3);
  S.stVer++;
  if (blk(pd.c, pd.r)) { row(pd.r)[pd.c] = null; S.digVer++; }   // 土を上書きして置く（中の資源はなくなる）
  S.st.set(k, { type: 'drill', tid: pd.tid, dir: pd.dir, lv: 0, t: 0, hit: -99, op: null, no: (S.drillNo = (S.drillNo || 1) + 1) });
  tool = 'none';
  return true;
}
// 仮置きした機械・仕分け・T字路・交差を設置する（今ある物は撤去してから）
function placePend2(pd) {
  const keep = tool; tool = pd.tid.startsWith('m:') ? 'machine' : pd.tid; const keepM = machSel; if (pd.tid.startsWith('m:')) machSel = pd.tid.slice(2);
  const ok = canPlaceAt(pd.c, pd.r); tool = keep; machSel = keepM;
  if (!ok) { say(tx().cantPlace); return false; }
  const cost = buildCost(pd.tid);
  if (S.money < cost) { say(tx().noMoney); return false; }
  const k = key(pd.c, pd.r);
  if (S.st.has(k) && !isLineLike(S.st.get(k)) && !pd.okOver) { askConfirm(tx().overwriteQ, () => { pd.okOver = true; if (placePend(pd)) closePop(); updateUI(); }); return false; }
  if (S.st.has(k)) removeAt(k);
  spend(cost, pd.c + 0.5, pd.r + 0.3); S.stVer++;
  if (blk(pd.c, pd.r)) { row(pd.r)[pd.c] = null; S.digVer++; }   // 土を上書きして置く
  if (pd.tid.startsWith('m:')) { S.st.set(k, { type: 'machine', m: pd.tid.slice(2), dir: pd.dir, lv: 0, buf: {}, bags: {}, cur: null, prog: 0, op: null }); if (tool === 'machine') tool = 'none'; }   // 機械は1つ置いたら選択を外す
  else if (pd.tid === 'sort') S.st.set(k, { type: 'sort', dir: pd.dir, lv: 0, filter: pd.filter, filters: pd.filters || [], side: pd.side });
  else S.st.set(k, { type: pd.tid, dir: pd.dir, lv: 0 });
  dir = pd.dir; memSet(pd.tid, pd.dir);   // 次に置く時も同じ向きから（道具ごとに覚える）
  if (pd.tid === 'sort') { memSet('sort.f', pd.filter); memSet('sort.s', pd.side); }
  return true;
}
function placeAt(c, r, cost, pdir = dir) {
  const k = key(c, r);
  spend(cost, c + 0.5, r + 0.3);
  if (tool === 'lab') { S.lab.built = true; S.lab.c = c; tool = 'none'; say(tx().labBuilt); addHist(tx().labBuilt); return; }
  if (isFacTool(tool)) { S.fac.push({ type: 'fac', f: tool, c, op: null, t: 0, lv: 0 }); addHist(tx().facBuilt(tx().fac[tool])); tool = 'none'; return; }
  S.stVer++;
  if (blk(c, r)) { row(r)[c] = null; S.digVer++; }   // 土を上書きして置く（中の資源はなくなる）
  if (isDrillTool(tool)) S.st.set(k, { type: 'drill', tid: tool, dir: 'down', lv: 0, t: 0, hit: -99, op: null, no: (S.drillNo = (S.drillNo || 1) + 1) });
  else if (tool === 'sort') S.st.set(k, { type: 'sort', dir: pdir, lv: 0, filter: 'iron', side: 'left' });
  else if (tool === 'machine') { S.st.set(k, { type: 'machine', m: machSel, dir: pdir, lv: 0, buf: {}, bags: {}, cur: null, prog: 0, op: null }); tool = 'none'; }   // 機械は1つ置いたら選択を外す
  else S.st.set(k, { type: tool, dir: pdir, lv: 0 });   // conv / tee / cross
}
function removeFac(f) {
  const back = Math.floor(buildCost(f.f, 1) / 2);
  S.money += back; pop('+' + back, f.c + 0.5, YARD_R, 'sale');
  S.fac.splice(S.fac.indexOf(f), 1);
}
// トラックヤードをたたむ：置いてあった資源は、その場の荷おろし場に戻る（フォークリフトが次のヤードへ運ぶ）
function removeYard() {
  const c = YARD_C; if (c < 0) return;
  for (const it of S.yard) (S.dock[c] || (S.dock[c] = [])).push(it);
  S.yard = []; setYard(-1); S.digVer++;
  const back = Math.floor(COST.yard / 2); S.money += back; pop('+' + back, c + 0.5, YARD_R, 'sale'); say(tx().yardNone, 4000);
}
function removeLamp(k) { if (!S.lamps[k]) return; delete S.lamps[k]; lampVer++; const back = Math.floor(COST.lamp / 2); S.money += back; pop('+' + back, cOf(k) + 0.5, rOf(k) + 0.3, 'sale'); }
function removeElev(k) { if (!S.elev[k]) return; delete S.elev[k]; elevVer++; const back = Math.floor(COST.elev / 2); S.money += back; pop('+' + back, cOf(k) + 0.5, rOf(k) + 0.3, 'sale'); }
function removeAt(k) {
  const s = S.st.get(k); if (!s || s.type === 'well') return;   // 湧き口は撤去できない
  S.stVer++;
  const back = Math.floor(costOf(s) / 2);
  S.money += back; pop('+' + back, cOf(k) + 0.5, rOf(k) + 0.3, 'sale');
  S.st.delete(k);
  if (s.type === 'machine') spillMachine(s, cOf(k), rOf(k));
}
// 撤去した機械の中身（順番待ちの材料・加工中の材料）を、そのマスにばらまく（コンベアを置けば回収できる）
function spillMachine(m, c, r) {
  const def = MACHINES[m.m], out = [];
  for (const [k2, n] of Object.entries(m.buf || {})) for (let i = 0; i < n; i++) out.push(k2);
  for (const [k2, n] of Object.entries(m.bags || {})) for (let i = 0; i < n; i++) out.push(k2);
  if (m.cur && !def.src) {   // 加工中の物は、材料に戻す
    if (m.cur.k === 'bag') { for (let i = 0; i < def.bag; i++) out.push(m.cur.of); }
    else { const rec = (def.recipes || []).find(x => x.out === m.cur.k); if (rec) for (const x of recInsOf(rec)) for (let i = 0; i < recNOf(rec, x); i++) out.push(x); }
  }
  for (const k2 of out) spawnItem(k2, c + 0.5, r + 0.5, c, r);
}
// 会社レベルで解放される強化の上限（会社レベルが主な目標。上げるほど強くできる）
const CO_CAP = { drill: ol => 4 + 21 * ol, truck: ol => 2 + 2 * ol, fork: ol => 2 + 2 * ol, machine: ol => 1 + ol, belt: ol => 1 + ol };
const capOf0 = t => (t !== 'truck' && t.type === 'machine' && MACHINES[t.m].src ? BAL.aditMax : lvCap(grpOf(t)));
const capOf = t => { const g = grpOf(t), c0 = capOf0(t); return CO_CAP[g] ? Math.min(c0, CO_CAP[g](S.office.lv)) : c0; };
// 会社レベルが足りなくて止まっている時：あと何レベルの会社で上げられるか（でなければ null）
function coNeed(t) {
  const g = grpOf(t), lv = lvOf(t); if (!CO_CAP[g] || lv >= capOf0(t) || lv < capOf(t)) return null;
  let ol = S.office.lv; while (CO_CAP[g](ol) <= lv && ol < 999) ol++;
  return ol + 1;
}
function nextCost(t) { const g = grpOf(t), lv = lvOf(t); return lv < capOf(t) ? lvCost(g, lv) : null; }
function posOf(t) { if (t === 'truck') return [BED + 0.5, YARD_R]; if (t.type === 'fork') return [t.x, YARD_R]; const k = findKey(t); return [cOf(k) + 0.5, rOf(k) + 0.3]; }
function levelUp(t) {
  const cost = nextCost(t);
  if (cost === null) return false;
  if (S.money < cost) { say(tx().noMoney); return false; }
  spend(cost, ...posOf(t));
  if (t === 'truck') S.truck.lv++; else t.lv++;
  return true;
}
function groupTargets(g) {
  if (g === 'truck') return nextCost('truck') !== null ? ['truck'] : [];
  if (g === 'fork') return S.forks.filter(f => nextCost(f) !== null);
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
const $ = id => document.getElementById(id);
const cv = $('cv');
let ctx = cv.getContext('2d');
const cam = { x: 0, y: 0, z: START_ZOOM };
let cw = 0, ch = 0, cp = 30, offX = 0, hover = null, hdrH = 44;
const camLim = { x0: 0, x1: 0, y0: 0, y1: 0 };   // 画面が動ける範囲
const dashOn = true;   // 下のタブ方式に決定（2026-11-23）。旧メニュー（右下の「メニュー」）の部品は、タブが中で使っている
const camTop = () => -0.3 - hdrH / cp;      // ゲーム画面はヘッダーの下にも広がっている

function metrics() {
  cw = cv.clientWidth; ch = cv.clientHeight;
  hdrH = $('hdr').offsetHeight || 44;
  const base = Math.min(cw / COLS, 46);
  cam.z = clamp(cam.z, Math.min(3, cw / (COLS * base)), 3);   // 縮小は、左右に空きが出ないところまで
  cp = base * cam.z;
  const worldW = COLS * cp;
  if (worldW <= cw) { offX = (cw - worldW) / 2; cam.x = 0; camLim.x0 = camLim.x1 = 0; }
  else { offX = 0; camLim.x0 = 0; camLim.x1 = COLS - cw / cp; cam.x = clamp(cam.x, 0, camLim.x1); }
  camLim.y0 = camTop() - 0.7; camLim.y1 = Math.max(camLim.y0, S.deepest - hdrH / cp);   // いちばん深い所が、画面のいちばん上に見える所まで
  if (!inTitle) cam.y = clamp(cam.y, camLim.y0, camLim.y1);
}
function resetCam() {
  cam.z = START_ZOOM;
  if (cv.clientWidth) { metrics(); cam.y = camTop(); cam.x = (S.landL + S.landR + 1) / 2 - cw / cp / 2; metrics(); }   // 自分の土地の真ん中
}
function zoomAt(sx, sy, f) {
  metrics();
  const wc = (sx - offX) / cp + cam.x, wr = sy / cp + cam.y;
  cam.z *= f; metrics();
  if (COLS * cp > cw) cam.x = wc - (sx - offX) / cp;
  cam.y = wr - sy / cp;
  metrics();
}
// 画面の解像度：ふだんは端末どおり（2倍など）。f/s が低い時は1倍で描く（描く点の数が1/4になる）
const viewDpr = () => (fpsCtl.lowRes ? 1 : window.devicePixelRatio || 1);
function resize() {
  const dpr = viewDpr();
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  metrics(); placePop();
}

// ---- タップメニュー ----
let popTarget = null;   // 設備 or 'truck'
// 仕分けの資源を選ぶ：ふつうは1つ。「仕分けコンベア改良」の後は、押すたびに足す／外す（1つは残す）
const RARE_SET = new Set(RARE.map(x => x[0]));
const RAW_KINDS = new Set(['soil', 'stone', 'iron', 'gold', 'dia', 'clay', 'copper', 'coal', 'quartz', 'silver']);
// 仕分けで選ばれている資源か（「珍品」は珍しい物をまとめて）
const sortHit = (s, k) => k === s.filter || (s.filters && s.filters.includes(k)) || (RARE_SET.has(k) && (s.filter === 'rare' || (s.filters && s.filters.includes('rare'))));
let sortFold = { raw: false, prod: false };   // 畳んでいるか（開いたまま覚えておく）
function buildFilterBox(box, t) {
  const T = tx(); box.innerHTML = '';
  const ks = sortChoices(t.filter), sel = [t.filter, ...(t.filters || [])];
  const groups = [['raw', ks.filter(k => RAW_KINDS.has(k))], ['prod', ks.filter(k => !RAW_KINDS.has(k) && !RARE_SET.has(k))]];
  const btn = k => { const b = document.createElement('button'); b.dataset.pf = k; b.textContent = k === 'rare' ? T.sortRare : T.items[k]; b.addEventListener('click', () => { if (popTarget) { pickFilter(popTarget, k); updatePop(); } }); return b; };
  for (const [g, list] of groups) {
    if (!list.length) continue;
    const hd = document.createElement('div'); hd.className = 'pfHead' + (sortFold[g] ? '' : ' open');
    const has = list.filter(k => sel.includes(k)).map(k => T.items[k]);
    hd.textContent = T.sortGrp[g] + (sortFold[g] && has.length ? '：' + has.join('・') : '');
    hd.addEventListener('click', () => { sortFold[g] = !sortFold[g]; buildFilterBox(box, popTarget || t); updatePop(); });
    box.append(hd);
    if (!sortFold[g]) { const w = document.createElement('div'); w.className = 'pfList'; for (const k of list) w.append(btn(k)); box.append(w); }
  }
  if (ks.some(k => RARE_SET.has(k)) || sel.includes('rare')) { const w = document.createElement('div'); w.className = 'pfList'; w.append(btn('rare')); box.append(w); }
}
function pickFilter(t, k) {
  if (!sk('sortPlus')) { t.filter = k; t.filters = []; return; }
  const all = [t.filter, ...(t.filters || [])].filter(Boolean), i = all.indexOf(k);
  if (i >= 0) { if (all.length > 1) all.splice(i, 1); } else all.push(k);
  t.filter = all[0]; t.filters = all.slice(1);
}
const findKey = s => stationKey(s);
function popCell() {
  if (!popTarget) return null;
  if (popTarget === 'truck') return { c: BED, r: YARD_R };
  if (popTarget.type === 'fork') return { c: popTarget.x - 0.5, r: YARD_R };
  if (popTarget.type === 'digcell' || popTarget.type === 'item' || popTarget.type === 'pend' || popTarget.type === 'pick' || popTarget.type === 'elev' || popTarget.type === 'elevPlace' || popTarget.type === 'lid' || popTarget.type === 'lamp') return { c: popTarget.c, r: popTarget.r };
  if (popTarget.type === 'fac') return { c: popTarget.c, r: YARD_R };
  const k = findKey(popTarget);
  return k < 0 ? null : { c: cOf(k), r: rOf(k) };
}
let popAnchor = null;   // メニューを開いた時の位置（中身の行数が変わっても、ボタンが動かないように）
function openPop(t) { closePanels(); popTarget = t; popAnchor = null; $('popView').hidden = true; buildPop(); $('pop').hidden = false; placePop(); }
function buildPop() {
  const t = popTarget, T = tx();
  const isTruck = t === 'truck', isFork = t.type === 'fork';
  if (t.type === 'elevPlace') {   // 物の上にエレベーターを置くか、下の物を見るか
    for (const id of ['popDirs', 'popFilterRow', 'popSideRow', 'popLevel', 'popLvUp', 'popAction', 'popPrioRow', 'popRemove']) $(id).hidden = true;
    $('popTitle').textContent = T.elev; const box = $('popInfo'); box.hidden = false; box.innerHTML = '';
    const st = S.st.get(key(t.c, t.r));
    const put = () => { const k = key(t.c, t.r); if (!S.elev[k] && S.money >= COST.elev) { spend(COST.elev, t.c + 0.5, t.r + 0.3); S.elev[k] = 1; elevVer++; } else if (S.money < COST.elev) say(T.noMoney); closePop(); updateUI(); };
    for (const [label, f] of [[`${T.elevPut}（${fmt(COST.elev)}）`, put], [T.seeBelow, () => openPop(st)]]) { const b = document.createElement('button'); b.textContent = label; b.style.margin = '2px 4px'; b.addEventListener('click', f); box.append(b); }
    return;
  }
  if (t.type === 'pick' || t.type === 'elev' || t.type === 'lid' || t.type === 'lamp') {   // 重なっている物を選ぶ／エレベーター／湧き口のふた／照明
    for (const id of ['popDirs', 'popFilterRow', 'popSideRow', 'popLevel', 'popLvUp', 'popAction', 'popPrioRow']) $(id).hidden = true;
    $('popRemove').hidden = t.type !== 'elev' && t.type !== 'lamp'; $('popInfo').hidden = false;
    if (t.type === 'lamp') { $('popTitle').textContent = T.lamp; $('popInfo').innerText = T.lampDesc; return; }
    if (t.type === 'elev') { $('popTitle').textContent = T.elev; $('popInfo').innerText = T.elevDesc; return; }
    if (t.type === 'lid') { $('popTitle').textContent = T.lidName; $('popInfo').innerText = T.lidDesc; $('popAction').hidden = false; $('popAction').disabled = false; $('popAction').textContent = T.lidOff; $('popAction').classList.remove('active'); return; }
    $('popTitle').textContent = T.pickT; const box = $('popInfo'); box.innerHTML = '';
    for (const [label, f] of t.opts) {
      const b = document.createElement('button'); b.textContent = label; b.style.margin = '2px 4px'; b.addEventListener('click', f); box.append(b);
    }
    return;
  }
  if (t.type === 'item') {   // 資源の説明：名前・種類・売値・どこで出る／何から作る・何に加工できる
    $('popTitle').textContent = t.k === 'bag' && t.of ? `${T.items.bag}（${T.items[t.of]}）` : T.items[t.k];
    for (const id of ['popDirs', 'popFilterRow', 'popSideRow', 'popLevel', 'popLvUp', 'popRemove', 'popAction', 'popPrioRow']) $(id).hidden = true;
    $('popInfo').hidden = false; $('popInfo').innerText = itemInfo(t.k, t.of);
    return;
  }
  if (t.type === 'fac' || t.type === 'well' || t.type === 'pipe') {   // 施設・湧き口・パイプ：説明と状態
    $('popTitle').textContent = t.type === 'fac' ? T.fac[t.f] : t.type === 'well' ? T.wellName[t.kind] : T.pipe;
    for (const id of ['popDirs', 'popFilterRow', 'popSideRow', 'popLevel', 'popLvUp', 'popAction']) $(id).hidden = true;
    $('popRemove').hidden = t.type === 'well'; $('popPrioRow').hidden = t.type !== 'fac';
    $('popView').hidden = t.type !== 'fac';   // 施設の中の様子
    if (t.type === 'well') { $('popAction').hidden = false; $('popAction').disabled = false; $('popAction').textContent = T.lidOn; $('popAction').classList.remove('active'); }   // 湧き口：ふたをする
    $('popInfo').hidden = false;
    updatePop();
    return;
  }
  if (t.type === 'pend') {   // 仮置き：向き（仕分けは選ぶ資源・出す側も）を選んで「設置する」
    const drillP = isDrillTool(t.tid);
    $('popTitle').textContent = t.tid.startsWith('m:') ? T.mach[t.tid.slice(2)] : t.tid === 'sort' ? T.sortTitle : T[t.tid];
    for (const id of ['popLevel', 'popLvUp', 'popRemove', 'popPrioRow']) $(id).hidden = true;
    $('popFilterRow').hidden = $('popSideRow').hidden = t.tid !== 'sort';
    if (t.tid === 'sort') {
      buildFilterBox($('popFilters'), t);
    }
    $('popDirs').hidden = false; $('popInfo').hidden = false; $('popInfo').innerText = drillP ? T.pendNote : T.pendNote2;
    document.querySelector('#pop [data-pdir=up]').hidden = false;   // ドリルも上向きに置ける
    const a = $('popAction'); a.hidden = false; a.innerHTML = '';
    a.append(document.createTextNode(T.placeDo + ' ')); const sm = document.createElement('small'); sm.textContent = fmt(buildCost(t.tid)); a.append(sm);
    a.disabled = S.money < buildCost(t.tid);
    updatePop();
    return;
  }
  document.querySelector('#pop [data-pdir=up]').hidden = false;
  if (t.type === 'digcell') {   // 土をタップ：「掘削？」
    $('popTitle').textContent = T.dig;
    for (const id of ['popDirs', 'popFilterRow', 'popSideRow', 'popLevel', 'popLvUp', 'popRemove', 'popPrioRow']) $(id).hidden = true;
    const bb = blk(t.c, t.r); $('popInfo').hidden = false; $('popInfo').innerText = bb.mat === 'stone' ? T.matStone : bb.mat === 'rock' ? T.matRock : T.matSoil;
    const a = $('popAction'); a.hidden = false; a.innerHTML = '';
    a.append(document.createTextNode(T.digDo + ' ')); const sm = document.createElement('small'); sm.textContent = fmt(digCost(blk(t.c, t.r))); a.append(sm);
    a.disabled = S.money < digCost(blk(t.c, t.r));
    return;
  }
  for (const id of ['popInfo', 'popLevel', 'popLvUp']) $(id).hidden = false;
  $('popTitle').textContent = isTruck ? T.truck : isFork ? T.forkName
    : t.type === 'drill' ? T[t.tid || 'drill'] + (t.no ? ' ' + t.no : '') : t.type === 'sort' ? T.sortTitle : t.type === 'tee' || t.type === 'cross' ? T[t.type]
    : t.type === 'machine' ? T.mach[t.m] : T.convDir;
  $('popDirs').hidden = isTruck || isFork;
  $('popPrioRow').hidden = !(t !== 'truck' && (isStation(t) || t.type === 'fac'));
  $('popFilterRow').hidden = $('popSideRow').hidden = !(t !== 'truck' && t.type === 'sort');
  $('popAction').hidden = !isTruck && t.type !== 'drill';
  $('popAction').textContent = isTruck ? T.depart : t.off ? T.drillOff : T.drillOn;
  $('popRemove').hidden = isTruck || isFork;
  if (!isTruck && t.type === 'sort') {
    buildFilterBox($('popFilters'), t);
  }
  updatePop();
}
// 遊び方：施設・設置物・資源の一覧（今使える物だけ。絵つき）
function helpItemList() {
  const T = tx(), box = document.createElement('div'); box.className = 'hlist';
  const sec = (title, list) => {
    if (!list.length) return;
    const h = document.createElement('h4'); h.textContent = title; box.append(h);
    for (const [pic, name, desc] of list) {
      const row = document.createElement('div'); row.className = 'hrow2';
      const tx2 = document.createElement('div'); const b = document.createElement('b'); b.textContent = name; const d = document.createElement('div'); d.className = 'sub'; d.textContent = desc; tx2.append(b, d);
      row.append(pic, tx2); box.append(row);
    }
  };
  const itemPic = k => { const c2 = document.createElement('canvas'); c2.width = c2.height = 32; c2.className = 'thumb'; const g = c2.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(itemSprite(k), 4, 4, 24, 24); return c2; };
  const facs = ['lab', ...FAC_IDS.filter(f => S.unlock[f])];
  sec(T.hFacs, facs.map(f => [thumb(f), f === 'lab' ? T.labName : T.fac[f], f === 'lab' ? T.labDesc : T.facDesc[f]]));
  const tools = ['drill', 'fdrill', 'adrill', 'conv', 'sort', 'tee', 'cross', 'pipe', 'elev'].filter(t => ['drill', 'conv', 'sort'].includes(t) || S.unlock[t]);
  sec(T.hTools, tools.map(t => [thumb(t), T[t], T.toolDesc[t] || '']));
  sec(T.hMachs, MACHINE_ORDER.filter(m => S.unlock[m]).map(m => { const def = MACHINES[m]; return [thumb('m:' + m), T.mach[m], def.bag ? T.bagRule : def.src ? T.aditRule : def.recipes.map(x => `${recIn(x)} → ${T.items[x.out]}`).join(' / ')]; }));
  sec(T.hRes, catalogIds().map(k => [itemPic(k), T.items[k], itemInfo(k).split('\n')[0]]));
  return box;
}
// 資源の説明文（データから作る）
function itemInfo(k, of) {
  const T = tx(), lines = [];
  const raw = RAW_NOTE[k];
  const bagOf = k === 'bag' && of && ITEMS[of] ? of : null;   // 袋詰めは中身の5個分×1.2
  lines.push(`${raw ? T.iRaw : T.iProd}　${T.worth} ${fmt(bagOf ? itemVal({ k: 'bag', of: bagOf, v: ITEMS[bagOf].v * 5 * 1.2 }) : itemVal({ k }))}`);
  if (raw) lines.push(T.iWhere[raw]);
  const made = []; const into = [];
  for (const m of MACHINE_ORDER) for (const rc of (MACHINES[m].recipes || [])) {
    if (rc.out === k) made.push(`${recIn(rc)}（${T.mach[m]}）`);
    if (rc.in === k || (rc.ins && rc.ins[k])) into.push(`${T.items[rc.out]}（${T.mach[m]}）`);
  }
  if (made.length) lines.push(`${T.iFrom}：${made.join('、')}`);
  if (k === 'fuel') lines.push(`${T.iFrom}：${T.facDesc.refinery}`);
  if (into.length) lines.push(`${T.iInto}：${into.join('、')}`);
  if (k !== 'bag') lines.push(T.iBag);
  return lines.join('\n');
}
// レシピの材料の書き方（「鉄の延べ棒×1＋宝石×1」など）
const recIn = x => x.ins ? Object.entries(x.ins).map(([k2, n]) => `${tx().items[k2]}×${n}`).join('＋') : `${tx().items[x.in]}×${x.n}`;
// 原料の出る場所（言葉は iWhere）
const RAW_NOTE = { soil: 'soil', stone: 'stone', iron: 'iron', gold: 'gold', dia: 'dia' };
function popInfoText() {
  const t = popTarget, T = tx();
  if (t === 'truck') {
    const tr = S.fleet.find(x => x.phase === 'here');
    if (!tr) return T.away;
    const d = opOf(tr);
    const cnt = {}; for (const it of S.yard) cnt[it.k] = (cnt[it.k] || 0) + 1;
    const has = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 5).map(k2 => `${T.items[k2]}×${cnt[k2]}`).join(' ');
    return `${T.loaded} ${tr.load}/${valOf('truck')}　${T.worth} ${fmt(tr.value)}\n${T.yardHas}：${has || '-'}\n${d ? T.driver(d.lv) : T.truckNoDriver}`;
  }
  if (t.type === 'fork') {
    const d = opOf(t);
    return `${T.loaded} ${t.load.length}/${valOf(t)}\n${d ? T.driver(d.lv) : T.noDriver}`;
  }
  if (t.type === 'sort') return T.sortInfo;
  const opW = isStation(t) ? opOf(t) : null;
  const opLine = isStation(t) ? '\n' + (opW ? T.manned(`Lv${opW.lv}`) : T.unmanned) : '';
  if (t.type === 'machine') {
    const def = MACHINES[t.m];
    const rule = def.bag ? T.bagRule : def.src ? T.aditRule
      : def.recipes.map(x => `${recIn(x)} → ${T.items[x.out]}`).join(' / ');
    const have = def.bag ? (Object.entries(t.bags || {}).map(([k2, n]) => `${T.items[k2]}×${n}`).join(' ') || '-')
      : Object.entries(t.buf).filter(([, n]) => n > 0).map(([k2, n]) => `${T.items[k2]}×${n}`).join(' ') || '-';
    return `${rule}\n${T.outDir}：${ARROW[t.dir]}　${T.inBuf}：${have}　${t.cur ? T.making : T.waiting}${opLine}`;
  }
  return opLine.trim();
}
function updateEject() {   // 機械の「材料を排出」ボタン
  const t = popTarget, b = $('popEject'), T = tx();
  const ok = t && t !== 'truck' && t.type === 'machine' && !MACHINES[t.m].src;
  const n = ok ? Object.values(MACHINES[t.m].bag ? t.bags || {} : t.buf || {}).reduce((a, v) => a + v, 0) : 0;
  b.hidden = !ok; if (!ok) return;
  b.textContent = t.eject ? T.ejecting(n) : T.eject + (n ? `（${n}）` : ''); b.disabled = !n && !t.eject; b.classList.toggle('active', !!t.eject);
}
function updatePop() {
  updateEject();
  if (!popTarget || popTarget.type === 'digcell' || popTarget.type === 'item' || popTarget.type === 'pick' || popTarget.type === 'elev' || popTarget.type === 'elevPlace' || popTarget.type === 'lid' || popTarget.type === 'lamp') return;
  const t = popTarget, T = tx();
  if (t.type === 'pend') {
    document.querySelectorAll('#pop [data-pdir]').forEach(b => b.classList.toggle('active', b.dataset.pdir === t.dir));
    document.querySelectorAll('#pop [data-pf]').forEach(b => b.classList.toggle('active', b.dataset.pf === t.filter || (t.filters || []).includes(b.dataset.pf)));
    document.querySelectorAll('#pop [data-ps]').forEach(b => b.classList.toggle('active', b.dataset.ps === t.side));
    $('popAction').disabled = S.money < buildCost(t.tid); return;
  }
  if (t.type === 'fac' || t.type === 'well' || t.type === 'pipe') {
    document.querySelectorAll('#pop [data-pp]').forEach(b => b.classList.toggle('active', +b.dataset.pp === (t.prio === undefined ? 1 : t.prio)));
    const tanks = `${T.tankOil} ${Math.floor(S.tank.oil)}/${BAL.tankCap}　${T.tankHot} ${Math.floor(S.tank.hot)}/${BAL.tankCap}`;
    if (t.type === 'fac') {
      const ws = facWorkers(t), col = S.museum || {};
      const extra = t.f === 'museum' ? `${T.museumCol(Object.keys(col).length, RARE.length)}\n${Object.entries(col).map(([k2, n]) => `${T.items[k2]}×${n}`).join('　') || '-'}\n${T.guests(visitors(t))}` : `${tanks}` + (t.f === 'spa' ? `\n${T.guests(visitors(t))}` : '');
      $('popInfo').innerText = `${T.facDesc[t.f]}\n${extra}\n${ws.length ? T.facStaff(ws.length, BAL.facSlots) : T.facNoOp}`;
    }
    else if (t.type === 'well') { const n = pipeNet().get(findKey(t)); $('popInfo').innerText = `${T.wellDesc[t.kind]}\n${n && n.surface ? T.wellOn : T.wellOff}`; }
    else { const n = pipeNet().get(findKey(t)); $('popInfo').innerText = `${T.pipeDesc}\n${n && n.surface && n.kind ? T.wellOn : T.wellOff}\n${tanks}`; }
    return;
  }
  document.querySelectorAll('#pop [data-pdir]').forEach(b => b.classList.toggle('active', t !== 'truck' && b.dataset.pdir === t.dir));
  document.querySelectorAll('#pop [data-pf]').forEach(b => b.classList.toggle('active', b.dataset.pf === t.filter || (t.filters || []).includes(b.dataset.pf)));
  document.querySelectorAll('#pop [data-ps]').forEach(b => b.classList.toggle('active', b.dataset.ps === t.side));
  document.querySelectorAll('#pop [data-pp]').forEach(b => b.classList.toggle('active', t !== 'truck' && +b.dataset.pp === (t.prio === undefined ? 1 : t.prio)));
  const info = popInfoText();
  $('popInfo').hidden = !info;
  $('popInfo').innerText = info;
  const g = grpOf(t), lv = lvOf(t), cost = nextCost(t), unit = T.pwUnit[g];
  const showPw = g !== 'drill';   // ドリルの掘る強さは小数になるので、レベルだけ
  $('popLevel').textContent = `${T.lv(lv + 1)}` + (showPw ? `　${T.pw[g]} ${unit(lvVal(g, lv))}` + (cost !== null ? ` → ${unit(lvVal(g, lv + 1))}` : '') : '')
    + (g === 'belt' ? `\n${T.beltCapT} ${capTxt(BELT_CAP[lv])}` + (cost !== null ? ` → ${capTxt(BELT_CAP[lv + 1])}` : '') : '')
    + (g === 'machine' && t.m && !MACHINES[t.m].src ? `\n${T.valueUp} ×${fmtMul(valueMul({ lv }))}` + (cost !== null ? ` → ×${fmtMul(valueMul({ lv: lv + 1 }))}` : '') : '')
    ;
  const btn = $('popLvUp'); btn.innerHTML = '';
  if (cost === null) { const cn = t !== 'truck' || true ? coNeed(t) : null; btn.textContent = cn ? T.coNeed(cn) : T.maxed; btn.disabled = true; }
  else {
    btn.append(document.createTextNode(T.levelUp + ' '));
    const sm = document.createElement('small'); sm.textContent = fmt(cost); btn.append(sm);
    btn.disabled = S.money < cost;
  }
  $('popAction').disabled = t === 'truck' && !S.fleet.some(x => x.phase === 'here' && x.load > 0);
  if (t !== 'truck' && t.type === 'drill') { $('popAction').textContent = t.off ? T.drillOff : T.drillOn; $('popAction').classList.toggle('active', !t.off); }
  else $('popAction').classList.remove('active');
}
function closePop() { popTarget = null; $('pop').hidden = true; }
function placePop() {
  if (!popTarget) return;
  const p = popCell();
  if (!p) { closePop(); return; }
  const pop2 = $('pop');
  const sx = offX + (p.c + 0.5 - cam.x) * cp, sy = (p.r - cam.y) * cp;
  let x = sx - pop2.offsetWidth / 2;
  if (!popAnchor) popAnchor = { h: pop2.offsetHeight, above: sy + cp + 6 + pop2.offsetHeight > window.innerHeight - 8 };
  let y = popAnchor.above ? sy - popAnchor.h - 6 : sy + cp + 6;
  x = clamp(x, 8, window.innerWidth - pop2.offsetWidth - 8);
  const dsh = $('dash'), bot = dsh && !dsh.hidden && getComputedStyle(dsh).display !== 'none' ? dsh.getBoundingClientRect().top : window.innerHeight;   // 下のタブより上に収める
  pop2.style.maxHeight = Math.max(160, bot - hdrH - 10) + 'px';   // 画面より高い時は、中をスクロール
  pop2.style.left = x + 'px'; pop2.style.top = Math.max(hdrH + 4, Math.min(y, bot - pop2.offsetHeight - 4)) + 'px';
}
document.querySelectorAll('#pop [data-pdir]').forEach(b => b.addEventListener('click', () => {
  if (S.tut2 && S.tut2.step === 'drillDir' && popTarget && popTarget.type === 'drill') S.tut2.did = true;   // 案内：ドリルの向きを変えた
  if (popTarget && popTarget !== 'truck' && popTarget.type !== 'fork' && popTarget.type !== 'digcell') { popTarget.dir = b.dataset.pdir; popTarget.stuck = false; updatePop(); }
}));
document.querySelectorAll('#pop [data-ps]').forEach(b => b.addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck') { popTarget.side = b.dataset.ps; updatePop(); }
}));
$('popEject').addEventListener('click', () => { const t = popTarget; if (t && t.type === 'machine') { t.eject = !t.eject; updatePop(); } });
$('popLvUp').addEventListener('click', () => { if (popTarget) { levelUp(popTarget); updatePop(); updateUI(); } });
document.querySelectorAll('#pop [data-pp]').forEach(b => b.addEventListener('click', () => { if (popTarget && popTarget !== 'truck') { popTarget.prio = +b.dataset.pp; updatePop(); } }));
$('popAction').addEventListener('click', () => {
  if (popTarget && popTarget.type === 'well') { const k = findKey(popTarget); if (k >= 0) { S.lids[k] = popTarget; S.st.delete(k); S.stVer++; } closePop(); updateUI(); return; }   // ふたをする
  if (popTarget && popTarget.type === 'lid') { const k = key(popTarget.c, popTarget.r); if (!S.st.has(k) && S.lids[k]) { S.st.set(k, S.lids[k]); delete S.lids[k]; S.stVer++; } closePop(); updateUI(); return; }   // ふたを外す
  if (popTarget && popTarget.type === 'digcell') { digAt(popTarget.c, popTarget.r); closePop(); updateUI(); return; }
  if (popTarget && popTarget.type === 'pend') { if (placePend(popTarget)) closePop(); updateUI(); return; }
  if (popTarget && popTarget !== 'truck' && popTarget.type === 'drill') { popTarget.off = !popTarget.off; popTarget.stuck = false; updatePop(); return; }
  departNow(); updatePop();
});
$('popRemove').addEventListener('click', () => {
  const t = popTarget; if (!t || t === 'truck') return;
  const doRm = () => {
    if (t.type === 'fac') removeFac(t);
    else if (t.type === 'elev') removeElev(key(t.c, t.r));
    else if (t.type === 'lamp') removeLamp(key(t.c, t.r));
    else { const k = findKey(t); if (k >= 0) removeAt(k); }
    closePop(); updateUI();
  };
  if (t.type !== 'fac' && t.type !== 'elev' && t.type !== 'lamp' && isLineLike(t)) doRm(); else askConfirm(tx().removeQ, doRm);   // コンベア以外は尋ねる
});
$('popClose').addEventListener('click', closePop);

// ---- 下のメニュー：設置（ドリル・コンベア・機械）／施設／スキル／強化／工事（掘削・撤去） ----
let menuOpen = false, openCat = null, openGrp = null;
// 設置の中の3つの項目と、その種類（研究したものだけ。レベル1では追加要素は見せない）
const grpList = g => g === 'drill' ? ['drill', ...['fdrill', 'adrill'].filter(t => S.unlock[t])]
  : g === 'belt' ? ['conv', 'sort', ...['tee', 'cross'].filter(t => S.unlock[t])]
  : g === 'pipe' ? (S.unlock.pipe ? ['pipe'] : [])
  : g === 'other' ? ['elev', 'lamp'].filter(t => S.unlock[t])
  : g === 'fac' ? (S.office.lv >= 1 ? facTools() : [])
  : g === 'works' ? ['dig', 'remove', ...(YARD_C < 0 ? ['yard'] : [])]
  : MACHINE_ORDER.filter(m => S.unlock[m]).map(m => 'm:' + m);
const BUILD_GRPS = ['drill', 'belt', 'pipe', 'machine', 'other', 'fac', 'works'];   // v1.00：工事（掘削・撤去・施設）も設置の中へ
const facTools = () => [...(!S.lab.built ? ['lab'] : []), ...FAC_IDS.filter(f => S.unlock[f])];
const toolId = () => (tool === 'machine' ? 'm:' + machSel : tool);
const grpOfTool = () => BUILD_GRPS.find(g => grpList(g).includes(toolId())) || null;
function catOfTool() {
  if (grpOfTool()) return 'build';
  return null;
}
const NEW_BASIC = new Set(['drill', 'conv', 'sort', 'dig', 'remove', 'm:kiln']);   // 最初からある物は「new」にしない
const isNewTool = id => !NEW_BASIC.has(id) && !(S.seen && S.seen[id]);
function setTool(id) {
  if (S.seen && id && id !== 'none' && id !== 'pan') S.seen[id] = 1;   // 一度使ったら「new」は消える
  if (id.startsWith('m:')) { machSel = id.slice(2); tool = 'machine'; }
  else tool = id;
  const m = memGet(toolId());   // 前に選んだ向き（コンベアは、はじめは「オート」）
  dir = m || (tool === 'conv' ? 'auto' : dir === 'auto' ? 'right' : dir);
}
// 縮小した絵（メニュー用）：いつもの描画を小さなキャンバスに描く
const thumbCache = new Map();
function thumb(id) {
  const key2 = id + ':' + (id === 'machine' ? machSel : '');
  if (thumbCache.has(key2) && id !== 'conv' && id !== 'sort') return thumbCache.get(key2);
  const c2 = document.createElement('canvas'); c2.width = c2.height = 48; c2.className = 'thumb';
  const saved = [ctx, cp]; ctx = c2.getContext('2d'); cp = 48;
  try {
    if (id.startsWith('m:')) drawMachine(0, 0, { m: id.slice(2), dir: 'right', cur: null });
    else if (isDrillTool(id)) drawDrill(0, 0, { dir: 'down', tid: id });
    else if (id === 'conv' || id === 'sort' || id === 'tee' || id === 'cross') drawBeltCell(0, 0, { type: id, dir: id === 'tee' ? 'up' : 'right', filter: 'iron', side: 'left' }, 0, true);
    else if (id === 'lab') { ctx.translate(0, -YARD_R * cp); drawLabAt(0, true); }
    else if (isFacTool(id)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite(id), 0, 0, 48, 48); }
    else if (id === 'pipe') drawPipe(0, 0, -9, -9, true);
    else if (id === 'elev') drawElev(0, 0);
    else if (id === 'lamp') { drawLamp(0, 0, false); }
    else if (id === 'yard') { ctx.fillStyle = '#9aa0a8'; ctx.fillRect(2, 30, 44, 14); ctx.fillStyle = '#3f7cc4'; ctx.fillRect(8, 14, 22, 18); ctx.fillStyle = '#2b2b2e'; ctx.fillRect(30, 20, 12, 12); }
    else if (id === 'dig') { ctx.fillStyle = groundColor({ mat: 'soil' }, SKY); ctx.fillRect(4, 4, 40, 40); ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, 36); ctx.lineTo(34, 14); ctx.moveTo(26, 12); ctx.lineTo(38, 20); ctx.stroke(); }
    else if (id === 'yardX') {}
    else if (id === 'remove') { ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(36, 36); ctx.moveTo(36, 12); ctx.lineTo(12, 36); ctx.stroke(); }
  } finally { [ctx, cp] = saved; }
  thumbCache.set(key2, c2);
  return c2;
}
function toolBtn(id) {
  const T = tx(), b = document.createElement('button'); b.className = 'si';
  let name, cost;
  if (id.startsWith('m:')) { const m = id.slice(2); name = T.mach[m]; cost = buildCost(id); }
  else { name = id === 'lab' ? T.labName : isFacTool(id) ? T.fac[id] : T[id]; cost = buildCost(id); }
  b.append(thumb(id));
  const lab = document.createElement('span'); lab.className = 'nm'; lab.append(document.createTextNode(name));
  if (cost) { const sm = document.createElement('small'); sm.textContent = fmt(cost); lab.append(sm); }
  if (isNewTool(id)) { const nt = document.createElement('small'); nt.className = 'newtag'; nt.textContent = 'new'; lab.append(nt); }
  b.append(lab);
  if (id.startsWith('m:')) { const def = MACHINES[id.slice(2)]; const rc = document.createElement('span'); rc.className = 'rec'; rc.textContent = def.bag ? T.bagRule : def.src ? T.aditRule : def.recipes.map(x => `${recIn(x)}→${T.items[x.out]}`).join(' / '); b.append(rc); }
  b.classList.toggle('active', toolId() === id);
  b.dataset.tool = id; b.classList.toggle('tutPulse', !!((S.tut && S.tut.step === 'buy' && id === 'drill') || (S.tut2 && S.tut2.step === 'kiln' && id === 'm:kiln')));   // はじめの手順：「ドリル50」も光らせる
  b.addEventListener('click', () => {
    if (toolId() === id) tool = 'none'; else setTool(id);   // もう一度押すと解除
    openCat = null; renderSub(); closePop(); updateUI();
  });
  return b;
}
function renderSub() {
  const box = $('subMenu'), T = tx();
  box.innerHTML = '';
  if (!openCat) { box.hidden = true; return; }
  if (openCat === 'build') {
    // 3つの項目（ドリル・コンベア・機械）。押した項目の種類が横に並ぶ
    for (const g of BUILD_GRPS) {
      if (!grpList(g).length) continue;
      const rowD = document.createElement('div'); rowD.className = 'brow';
      const lb = document.createElement('button'); lb.className = 'grp'; lb.textContent = T.grpName[g];
      lb.classList.toggle('active', grpOfTool() === g);
      lb.classList.toggle('hasNew', grpList(g).some(isNewTool));   // 中に使ったことの無い物があれば●
      lb.dataset.grp = g; lb.classList.toggle('tutPulse', !!((S.tut && S.tut.step === 'buy' && g === 'drill') || (S.tut2 && S.tut2.step === 'kiln' && g === 'machine')));   // はじめの手順：「ドリル」を光らせる
      lb.classList.toggle('open', openGrp === g);
      lb.addEventListener('click', () => { openGrp = openGrp === g ? null : g; renderSub(); updateUI(); });
      rowD.append(lb);
      if (openGrp === g) { const list = document.createElement('div'); list.className = 'types'; for (const id of grpList(g)) list.append(toolBtn(id)); rowD.append(list); }
      box.append(rowD);
    }
  } else if (openCat === 'infoCat') {
    const list = document.createElement('div'); list.className = 'types ipick';
    for (const [id, name] of [['fin', T.finance], ['hist', T.history], ['cat', T.catalog]]) {
      const b = document.createElement('button'); b.textContent = name;
      b.addEventListener('click', () => { openInfo(id); });
      list.append(b);
    }
    box.append(list);
  } else {
    const list = document.createElement('div'); list.className = 'types';
    const facs = S.office.lv >= 1 ? facTools() : [];
    const ids = openCat === 'works' ? ['dig', 'remove', ...(YARD_C < 0 ? ['yard'] : []), ...facs] : facs;   // ヤードが無い時は「トラックヤード」を出す   // 工事：掘削・撤去と、地上の施設（研究所・温泉など）
    for (const id of ids) list.append(toolBtn(id));
    if (openCat === 'works' && S.office.lv >= 1 && S.lab.built && !FAC_IDS.some(f => S.unlock[f])) { const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.facEmpty; list.append(n); }
    if (!ids.length) { const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.facEmpty; list.append(n); }
    box.append(list);
  }
  box.hidden = false;
}
$('menuBtn').addEventListener('click', () => { menuOpen = true; closePanels(); updateUI(); });
$('menuClose').addEventListener('click', () => { menuOpen = dashOn; openCat = null; renderSub(); updateUI(); });
document.querySelectorAll('#catBar .cat').forEach(b => b.addEventListener('click', () => {
  closePop(); closePanels();
  const cat = b.dataset.cat;
  // その項目の道具を選んでいる時は、1段目を押すと解除
  if (catOfTool() === cat) { tool = 'none'; openCat = null; }
  else { openCat = openCat === cat ? null : cat; if (cat === 'build') openGrp = grpOfTool(); }
  renderSub(); updateUI();
}));
$('panBtn').addEventListener('click', () => { tool = tool === 'pan' ? 'none' : 'pan'; closePop(); updateUI(); });

// ---- パネル（強化・事務所・遊び方・設定・管理） ----
let helpIdx = 0;
// パネルの中身は時々作り直して数字を新しくする。ただし、マウスが乗っている間・押した直後は作り直さない
// （作り直した瞬間に押すとボタンが反応しない・ホバーがちらつくため）
let panelTouchAt = -1e9;
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.panel')) panelTouchAt = performance.now(); }, true);
const panelBusy = el => el.matches(':hover') || performance.now() - panelTouchAt < 1200;
const PANELS = ['powerPanel', 'skillPanel', 'office', 'help', 'settings', 'admin', 'tune', 'tradePanel'];   // 情報・地図は別（開いたまま遊べる）
let resShown = new Set();   // 研究の画面に出した研究（閉じた時に「見た」にする）
function closePanels() {
  if (!$('skillPanel').hidden && S.seenRes) { for (const id of resShown) S.seenRes[id] = 1; resShown = new Set(); }
  PANELS.forEach(x => { $(x).hidden = true; });
}
function togglePanel(id) {
  const show = $(id).hidden;
  closePanels(); closePop();
  if (id === 'skillPanel') resShown = new Set();
  $(id).hidden = !show;
  if (show) renderPanel(id);
  updateUI();
}
// 畳める見出し：押すと開く・閉じる（最初は畳んである。開け閉めは覚える）。案内で使う所は開いておく
function foldSec(box, key, title, pid) {
  S.opts = S.opts || {}; S.opts.fold = S.opts.fold || {};
  const open = !!S.opts.fold[key] || !!(S.tut2 && ((S.tut2.step === 'office' && key === 'co')));
  const h = secEl(title); h.classList.add('fold'); h.classList.toggle('open', open);
  h.addEventListener('click', () => { S.opts.fold[key] = !open; renderPanel(pid); });
  const body = document.createElement('div'); body.className = 'foldBody'; body.hidden = !open;
  box.append(h, body); return body;
}
const secEl = t => { const h = document.createElement('div'); h.className = 'secT'; h.textContent = t; return h; };   // 見出し（下に線）
function rowEl(nameText, specText, btn) {
  const el = document.createElement('div'); el.className = 'row2';
  const name = document.createElement('div'); name.className = 'name'; name.textContent = nameText;
  const spec = document.createElement('div'); spec.className = 'spec'; spec.textContent = specText;
  el.append(name, spec);
  if (btn) el.append(btn);
  return el;
}
function costBtn(label, cost, onClick) {
  const b = document.createElement('button');
  b.append(document.createTextNode(label + ' '));
  if (cost !== undefined) { const sm = document.createElement('small'); sm.textContent = fmt(cost); b.append(sm); b.disabled = S.money < cost; }
  b.addEventListener('click', onClick);
  return b;
}
// 断面図：部屋を並べて、それぞれの部屋で人が働く（2枚の動き。重い時は止める）
// 施設の中の様子（メニューの上の小さな絵）。お客さん・作業員は歩いて行き来する（重い時は止まる）
function drawFacView(cv2, f) {
  if (!cv2 || cv2.offsetParent === null || !f) return;
  const W = cv2.clientWidth || 240, H = 78, dpr = window.devicePixelRatio || 1;
  if (cv2.width !== Math.round(W * dpr) || cv2.height !== Math.round(H * dpr)) { cv2.width = Math.round(W * dpr); cv2.height = Math.round(H * dpr); cv2.style.height = H + 'px'; }
  const g = cv2.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  const t = performance.now() / 1000, anim = !(fpsCtl.lite >= 2), floor = H - 10;
  const wall = { museum: '#efe7da', spa: '#e6eef2', power: '#e4e6ea', refinery: '#ece6dc' }[f.f] || '#eeeeee';
  g.fillStyle = '#8a7a66'; g.fillRect(0, 0, W, H); g.fillStyle = wall; g.fillRect(3, 3, W - 6, H - 6);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(3, floor, W - 6, 7);   // 床
  const keep = [ctx, cp]; ctx = g; cp = 26;   // いつもの描き方（資源・お客さん）を、この小さな絵に使う
  try {
    if (f.f === 'museum') {   // 展示台に、集めた珍しい物を並べる
      const col = Object.keys(S.museum || {}), n = Math.max(3, Math.min(6, col.length || 3)), gap = (W - 20) / n;
      for (let i = 0; i < n; i++) {
        const x = 10 + gap * i + gap / 2;
        g.fillStyle = '#b8a48a'; g.fillRect(x - 10, floor - 16, 20, 16); g.fillStyle = 'rgba(200,230,255,.35)'; g.fillRect(x - 10, floor - 38, 20, 22); g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(x - 10.5, floor - 38.5, 21, 23);   // 台とガラスのケース
        if (col[i]) drawItemShape({ k: col[i] }, x, floor - 27, 1.6);
      }
    } else if (f.f === 'spa') {   // 湯船
      g.fillStyle = '#8fc6e0'; g.fillRect(12, floor - 14, W - 24, 14); g.fillStyle = '#6aa8c8'; g.fillRect(12, floor - 14, W - 24, 2);
      g.fillStyle = '#9a8a76'; g.fillRect(8, floor - 16, 4, 16); g.fillRect(W - 12, floor - 16, 4, 16);
    } else if (f.f === 'power') {   // 発電機（ランプはついたまま。点滅しない）
      for (let i = 0; i < 3; i++) { const x = 20 + i * (W - 40) / 3; g.fillStyle = '#6a6f78'; g.fillRect(x, floor - 30, 34, 30); g.fillStyle = '#3a3d44'; g.fillRect(x + 4, floor - 26, 26, 8); g.fillStyle = S.tank.hot + S.tank.oil >= 1 ? '#7ad07a' : '#5a5d64'; g.fillRect(x + 26, floor - 14, 5, 5); }
    } else if (f.f === 'refinery') {   // タンク（中の石油の量）
      for (let i = 0; i < 3; i++) { const x = 18 + i * (W - 36) / 3, th = 40, lv = Math.min(1, S.tank.oil / (BAL.tankCap || 300)); g.fillStyle = '#8a8478'; g.fillRect(x, floor - th, 30, th); g.fillStyle = '#2a2420'; g.fillRect(x + 3, floor - 3 - (th - 6) * lv, 24, (th - 6) * lv); }
    }
    // 作業員（施設で働いている人）と、お客さん（温泉・博物館）
    const ws = facWorkers(f).length;
    for (let i = 0; i < ws; i++) { const fr = anim ? Math.floor(t * 2.4 + i) % 2 : 1; g.drawImage(WORKER_FR[fr], Math.round(W - 26 - i * 14), floor - 16, 16, 16); }
    const guests = S.cars.filter(c => c.f === f.c && c.st !== 'out').slice(0, 5);
    guests.forEach((car, i) => {
      const span = W - 60, ph = anim ? (t * 0.25 + i * 0.37) % 2 : i * 0.3, u = ph < 1 ? ph : 2 - ph, x = 14 + span * u;   // 左右に行ったり来たり
      if (f.f === 'spa') { drawGuest(x, floor - 4, 18, 1, car); g.fillStyle = 'rgba(143,198,224,.85)'; g.fillRect(x - 10, floor - 12, 20, 8); }   // お湯につかる
      else drawGuest(x, floor + 2, 18, anim ? Math.floor(t * 5 + i) % 2 : 1, car);
    });
  } finally { [ctx, cp] = keep; }
}
function cutRooms(kind) {
  const T = tx(), rooms = [];
  if (kind === 'office') {
    const bs = bossOf();
    rooms.push({ name: T.roomBoss, n: bs && (!S.bossWork || bs.state === 'idle' || bs.state === 'off') ? 1 : 0, boss: true, desk: true });
    if (secOn()) rooms.push({ name: T.roomSec, n: 1, who: 'sec', desk: true });
    if (sk('autoHire')) rooms.push({ name: T.sk.autoHire[0], n: (S.opts || {}).autoHire !== false ? 2 : 0, desk: true });
    if (sk('autoUpg')) rooms.push({ name: T.sk.autoUpg[0], n: (S.opts || {}).autoUpg !== false ? 2 : 0, desk: true });
    if (sk('autoPrice')) rooms.push({ name: T.sk.autoPrice[0], n: (S.opts || {}).autoPrice !== false ? 2 : 0, desk: true });
    rooms.push({ name: T.roomRest, n: S.workers.filter(w => !w.boss && w.state === 'rest').length, sofa: true });
    rooms.push({ name: T.roomWait, n: S.workers.filter(w => !w.boss && w.state === 'idle').length });
  } else {
    const staff = labStaff();
    for (let i = 0; i < labRooms(); i++) {
      const r = S.researches[i];
      rooms.push({ name: T.roomLab(i + 1), n: r && staff[i] ? 1 : 0, desk: true, prog: r ? r.t / r.total : null, label: r ? resDef(r.id).name : T.roomFree });
    }
  }
  return rooms;
}
function drawCutaway(cv2, kind) {
  if (!cv2 || cv2.offsetParent === null) return;
  const rooms = cutRooms(kind), cols = 3, rowsN = Math.ceil(rooms.length / cols);
  const W = cv2.clientWidth || 300, rh = 46, H = rowsN * rh + 10, dpr = window.devicePixelRatio || 1;
  if (cv2.width !== Math.round(W * dpr) || cv2.height !== Math.round(H * dpr)) { cv2.width = Math.round(W * dpr); cv2.height = Math.round(H * dpr); cv2.style.height = H + 'px'; }
  const g = cv2.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  const wall = kind === 'office' ? '#efe7da' : '#e4ecf0', frame = kind === 'office' ? '#8a7a66' : '#6f8592';
  g.fillStyle = frame; g.fillRect(0, 0, W, H);   // 建物の外壁
  const rw = (W - 8) / cols, t = performance.now(), anim = !(fpsCtl.lite >= 2);
  rooms.forEach((rm, i) => {
    const x = 4 + (i % cols) * rw, y = 5 + Math.floor(i / cols) * rh, w = rw - 4, h = rh - 6;
    g.fillStyle = wall; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + h - 4, w, 4);   // 床
    g.fillStyle = '#5a5248'; g.font = '9px sans-serif'; g.textBaseline = 'top'; g.fillText(rm.name, x + 3, y + 2, w - 6);
    if (rm.label) { g.fillStyle = '#7a7a80'; g.font = '8px sans-serif'; g.fillText(rm.label, x + 3, y + 12, w - 6); }
    if (rm.sofa) {   // 休憩室：たたみに雑魚寝（横になって、少しずつ重なって並ぶ）
      g.fillStyle = '#c9b98a'; g.fillRect(x + 3, y + h - 7, w - 6, 3);
      const n0 = Math.min(rm.n, 8), sz0 = 16;
      for (let j = 0; j < n0; j++) {
        g.save(); g.translate(x + 6 + j * ((w - sz0 - 10) / Math.max(1, n0 - 1)) + sz0 / 2, y + h - 7 - sz0 * 0.25); g.rotate(j % 2 ? -Math.PI / 2 : Math.PI / 2);
        g.drawImage(WORKER_FR[1], -sz0 / 2, -sz0 / 2, sz0, sz0); g.restore();
      }
      if (rm.n > 8) { g.fillStyle = '#5a5248'; g.font = '9px sans-serif'; g.fillText('×' + rm.n, x + w - 22, y + 2); }
      return;
    }
    const n = Math.min(rm.n, rm.desk ? 2 : 6), sz = 20;
    for (let j = 0; j < n; j++) {   // 人（机の部屋は机の向こうで働く・休憩室と待機はならぶ）
      const f = anim ? Math.floor(t / 420 + j * 0.7 + i) % 2 : 1, px = rm.desk ? x + w * (n > 1 ? 0.3 + 0.32 * j : 0.45) - sz / 2 : x + 4 + j * ((w - sz - 8) / Math.max(1, n - 1));
      const fr = rm.boss ? BOSS_FR[f] : WORKER_FR[f];
      g.drawImage(fr, Math.round(px), Math.round(y + h - 4 - sz), sz, sz);
    }
    if (rm.desk) { g.fillStyle = '#b08a5a'; g.fillRect(x + w * 0.14, y + h - 12, w * 0.72, 3); g.fillStyle = '#8a6a44'; g.fillRect(x + w * 0.14, y + h - 9, w * 0.72, 5); }   // 机（人の前）
    if (rm.n > (rm.desk ? 2 : 6)) { g.fillStyle = '#5a5248'; g.font = '9px sans-serif'; g.fillText('×' + rm.n, x + w - 22, y + 2); }
    if (rm.prog !== null && rm.prog !== undefined) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 3, y + h - 3, w - 6, 2); g.fillStyle = '#d0661f'; g.fillRect(x + 3, y + h - 3, (w - 6) * rm.prog, 2); }
  });
}
function renderPanel(id) {
  const T = tx();
  if (id === 'powerPanel') {
    const box = $('powerItems'); box.innerHTML = '';
    box.append(secEl(T.secCo));
    {   // 会社レベル（事務所をタップした時と同じ）
      const ol = S.office.lv;
      let ob;
      ob = costBtn(T.levelUp, offCost(ol), () => { officeUp(); renderPanel('powerPanel'); updateUI(); });
      box.append(rowEl(`${T.companyLv}　${T.lv(ol + 1)}`, `${T.capP(offCap(ol))}・${T.forksMax(offForks(ol))}`, ob));
    }
    box.append(secEl(T.secVeh));
    // フォークリフト購入（台数の上限は会社のレベル）
    const fn = S.forks.length, fm = forkMax();
    let fb;
    if (fn >= fm) { fb = document.createElement('button'); fb.textContent = T.maxed; fb.disabled = true; }
    else fb = costBtn(T.buyFork, FORK_BUY(fn + 1), () => { buyFork(); renderPanel('powerPanel'); updateUI(); });
    box.append(rowEl(T.forkName, T.forkMax(fn, fm), fb));
    {   // トラック増車（何台でも。1台ごとに高くなる）
      const tc = truckAddCost();
      box.append(rowEl(T.truckAddT, T.truckAddN(S.fleet.length), costBtn(T.truckAddB, tc, () => { addTruck(); renderPanel('powerPanel'); updateUI(); })));
    }
    for (const g of ['truck', 'drill', 'belt', 'machine', 'fork']) {
      if (g === 'drill') { if (!S.unlock.batch) break; box.append(secEl(T.secBatch)); }
      if (g !== 'truck' && !S.unlock.batch) continue;
      const ts = groupTargets(g), total = groupCost(g);
      const name = g === 'truck' ? `${T.grp.truck}　${T.lv(S.truck.lv + 1)}` : T.allUp(T.grp[g], ts.length);
      const spec = g === 'truck' ? `${T.pw.truck} ${T.pwUnit.truck(valOf('truck'))}` : (ts.length ? '' : T.none);
      let btn;
      if (!ts.length) { btn = document.createElement('button'); btn.textContent = g === 'truck' ? T.maxed : '-'; btn.disabled = true; }
      else btn = costBtn(T.levelUp, total, () => { levelUpAll(g); renderPanel('powerPanel'); updateUI(); });
      box.append(rowEl(name, spec, btn));
    }
    // 売値アップ：売ったことのある資源だけ。加工した物にも同じ倍率が掛かる
    const roots = ROOT_ORDER.filter(r => S.sold && S.sold['@' + r]);
    if (roots.length) {
      const h = document.createElement('div'); h.className = 'secT'; h.textContent = T.priceSec; box.append(h);
      const nt = document.createElement('div'); nt.className = 'sub'; nt.textContent = T.priceNote; box.append(nt);
      for (const r of roots) {
        const prods = ITEM_ORDER.filter(k => k !== r && ROOT[k] === r && S.sold[k]).map(k => T.items[k]).join('・');
        box.append(rowEl(`${T.priceName(T.items[r])}　${T.lv(priceLv(r) + 1)}`, T.priceSpec(Math.round(priceMul(r) * 100) / 100, prods),
          costBtn(T.levelUp, priceCost(r), () => { priceUp(r); renderPanel('powerPanel'); updateUI(); })));
      }
    }
  } else if (id === 'office') {
    const box = $('officeBody'); box.innerHTML = '';
    const pay = Math.round(S.workers.reduce((a, w) => a + wageOf(w), 0) * (sk('black') ? 0.8 : 1) * TUNE.wage);
    const ol = S.office.lv, cap = offCap(ol);
    const sum = document.createElement('div'); sum.className = 'sub';
    sum.textContent = `${T.workers} ${staffN()}/${cap}${T.unitP}　${T.payroll} ${pay}`;
    box.append(sum);
    const hl = hireLv();   // 雇う：いつもいちばん上（押しているうちに、解雇のボタンと入れかわらないように）
    box.append(rowEl(T.hireLv(hl), `${T.wage}${Math.round((10 + 6 * hl) * TUNE.wage)}${T.perMonth}`,
      (b0 => { b0.dataset.tut = 'hire'; return b0; })(costBtn(T.hire, HIRE_FEE(hl), () => { hire(); renderPanel('office'); updateUI(); }))));
    if (S.trip) {   // 社員旅行：集めた材料／出発
      const tBox = foldSec(box, 'trip', T.secTrip, 'office');
      if (sk('depart')) { const b = document.createElement('button'); b.textContent = T.tripBtn; b.className = 'active'; b.disabled = tripGather || !!launchT; b.addEventListener('click', () => tripStart()); tBox.append(rowEl(T.tripBtn, T.tripBtnD, b)); }
      const nt = document.createElement('div'); nt.className = 'sub'; nt.textContent = T.tripMatNote; tBox.append(nt);
      for (const k of Object.keys(TRIP_NEED)) {
        const g = S.trip.got[k] || 0, el = rowEl(T.items[k], T.tripMat(g.toLocaleString(), TRIP_NEED[k].toLocaleString()));
        const bar = document.createElement('div'); bar.className = 'bar'; const fl = document.createElement('i'); fl.style.width = (100 * g / TRIP_NEED[k]) + '%'; bar.append(fl); el.querySelector('.spec').append(bar);
        tBox.append(el);
      }
    }
    // 会社のレベル（定員・休憩の速さ・フォークリフトの台数）
    const coBox = foldSec(box, 'co', T.secCo, 'office');
    const olBtn = costBtn(T.levelUp, offCost(ol), () => { officeUp(); renderPanel('office'); updateUI(); }); olBtn.dataset.tut = 'coUp';
    const nx = ` → ${T.capP(offCap(ol + 1))}・${T.forksMax(offForks(ol + 1))}`;
    const coRow = rowEl(`${T.officeLv}　${T.lv(ol + 1)}`, `${T.capP(cap)}・${T.forksMax(offForks(ol))}・${T.restSp} ×${offRest(ol)}${nx}`, olBtn);
    if (performance.now() < coFocusUntil) coRow.classList.add('focusRow');   // 知らせから来た時は枠
    coBox.append(coRow);
    if (sk('autoHire') || sk('autoUpg') || sk('autoPrice')) {   // 自動の部署（研究したもの）
      const dBox = foldSec(box, 'dept', T.secDept, 'office');
      for (const [sid, key2] of [['autoHire', 'autoHire'], ['autoUpg', 'autoUpg'], ['autoPrice', 'autoPrice']]) {
        if (!sk(sid)) continue;
        const on = (S.opts || {})[key2] !== false;
        const b = document.createElement('button'); b.textContent = on ? T.on : T.off; b.classList.toggle('active', on);
        b.addEventListener('click', () => { S.opts[key2] = !on; renderPanel('office'); });
        dBox.append(rowEl(T.sk[sid][0], T.sk[sid][1], b));
      }
    }
    const bs = bossOf();
    if (bs) {   // 社長（自分）：会社レベル2から、作業するかどうかを選べる
      const bBox = foldSec(box, 'boss', T.secBoss, 'office');
      let bb;
      if (S.office.lv >= 1) { bb = document.createElement('button'); bb.textContent = S.bossWork ? T.bossOn : T.bossOff; bb.classList.toggle('active', !!S.bossWork); bb.addEventListener('click', () => { S.bossWork = !S.bossWork; renderPanel('office'); updateUI(); }); }
      else { bb = document.createElement('button'); bb.textContent = T.bossLock; bb.disabled = true; }
      bBox.append(rowEl(T.bossName(bs.lv), T.bossDesc, bb));
    }
    // 作業員：レベルごとの人数
    const wBox = foldSec(box, 'workers', T.workers, 'office');
    const note = document.createElement('div'); note.className = 'sub'; note.textContent = S.lab.built ? T.advNote : T.advNote0; wBox.append(note);
    if (!staffN()) { const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.nobody; wBox.append(n); }
    const lvs = [...new Set(S.workers.filter(w => !w.boss).map(w => w.lv))].sort((a, b) => a - b);
    for (const lv of lvs) {
      const ws = S.workers.filter(w => w.lv === lv && !w.boss);
      const cnt = st => ws.filter(w => st.includes(w.state)).length;
      const el = rowEl(T.wCount(lv, ws.length), T.wBreak(cnt(['work', 'drive']), cnt(['toWork', 'toRest', 'toIdle', 'idle']), cnt(['rest'])),
        costBtn(T.fireOne, undefined, () => { fireLevel(lv); renderPanel('office'); }));
      const bar = document.createElement('div'); bar.className = 'bar';
      const avg = ws.reduce((a, w) => a + w.stamina / maxStamina(w), 0) / ws.length;
      const fill = document.createElement('i'); fill.style.width = (100 * avg) + '%'; bar.append(fill);
      el.querySelector('.spec').append(bar);
      wBox.append(el);
    }
  } else if (id === 'skillPanel') {
    const box = $('skillBody'); box.innerHTML = '';
    if (S.seenRes === null) { S.seenRes = {}; for (const id2 of allResIds()) if (resAvail(id2)) S.seenRes[id2] = 1; }   // 前からのセーブ：今ある研究は見たことに
    if (!S.lab.built) { const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.needLab; box.append(n); return; }
    const staff = labStaff();
    const chips = document.createElement('div'); chips.className = 'chips';   // 研究室・研究中・研究員（数字だけ）
    for (const [lb, v] of [[T.chipRooms, labRooms()], [T.chipRes, S.researches.length], [T.chipStaff, staff.length]]) { const c2 = document.createElement('span'); c2.className = 'chip'; const i2 = document.createElement('i'); i2.textContent = lb; const b2 = document.createElement('b'); b2.textContent = v; c2.append(i2, b2); chips.append(c2); }
    box.append(chips);
    S.researches.forEach((r, i) => {
      const el = document.createElement('div'); el.className = 'sub lvline';
      el.textContent = `${resDef(r.id).name}　${Math.round(100 * r.t / r.total)}%` + (staff[i] ? `　${T.resLeft(realDur((r.total - r.t) / techFactor(staff[i])))}` : `　${T.resStop}　${T.resLeft(realDur((r.total - r.t) / BAL.labAlone))}`);
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = (100 * r.t / r.total) + '%'; bar.append(fill);
      box.append(el, bar);
    });
    {   // 表示の切り替え：未取得のみ（標準）／すべて
      const row = document.createElement('div'); row.className = 'segRow'; const opts2 = document.createElement('span'); opts2.className = 'seg';
      for (const [v, lb] of [[false, T.resOnly], [true, T.resAllB]]) { const b = document.createElement('button'); b.textContent = lb; b.classList.toggle('active', !!S.opts.resAll === v); b.addEventListener('click', () => { S.opts.resAll = v; renderPanel('skillPanel'); }); opts2.append(b); }
      row.append(opts2); box.append(row);
    }
    const section = (title, ids) => {
      const list = ids.filter(id => S.opts.resAll ? (resAvail(id) || resDef(id).done || (id.startsWith('sk:') && sk(id.slice(3)) > 0)) && !isGrant(id) && id !== 'sk:dragPlus' && id !== 'sk:truck2'
        : resAvail(id) && !resDef(id).done);
      if (!list.length) return;
      const h = document.createElement('div'); h.className = 'secT'; h.textContent = title; box.append(h);
      for (const id of list) {
        const d = resDef(id);
        const title2 = id === 'sk:digLv' ? d.name + (d.lv ? T.digUpTo(d.lv - 1) : '') : d.max > 50 ? `${d.name}　Lv${d.lv}` : d.max > 1 ? `${d.name}　${d.lv}/${d.max}` : d.name;
        let btn;
        if (d.done || !resAvail(id)) { btn = document.createElement('button'); btn.textContent = d.done ? T.got : T.nextRock; btn.disabled = true; }
        else if (id === 'sk:digLv' && !permitOk()) { btn = document.createElement('button'); btn.textContent = T.permitBtn(permitNeed()); btn.disabled = true; }
        else { btn = costBtn(`${T.startRes}（${d.months}${T.months}）`, d.cost, () => { startResearch(id); renderPanel('skillPanel'); updateUI(); }); if (S.researches.length >= labRooms() || S.researches.some(r => r.id === id)) btn.disabled = true; }
        const re = rowEl(title2, d.desc, btn);
        if (S.seenRes && !S.seenRes[id] && !d.done) { const nt = document.createElement('small'); nt.className = 'newtag'; nt.textContent = 'new'; re.querySelector('.name').append(nt); }
        resShown.add(id); box.append(re);
      }
    };
    section(T.resTool, Object.keys(RESEARCH_TOOL).map(t => 't:' + t));
    section(T.resMach, Object.keys(RESEARCH_MACH).map(m => 'm:' + m));
    section(T.resFac, Object.keys(RESEARCH_FAC).map(f => 'f:' + f));
    section(T.resBatch, ['batch']);
    section(T.resSkill, SKILL_ORDER.map(x => 'sk:' + x));
  } else if (id === 'tradePanel') {
    const box = $('tradeBody'); box.innerHTML = '';
    const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.tradeInfo; box.append(n);
    for (const d of DEALS) {
      const b = document.createElement('button'); b.textContent = T.watch;
      if (d.id === 'land' && sk('land') >= LAND_MAX) { b.textContent = T.dealMax; b.disabled = true; }
      b.addEventListener('click', () => showAd(() => { d.run(); addHist(T.deal[d.id][0]); say(T.dealGot(T.deal[d.id][0]), 3000, 'good'); renderPanel('tradePanel'); updateUI(); }));
      const left = dealLeft(d.id);
      box.append(rowEl(T.deal[d.id][0], T.deal[d.id][1] + (left ? `（${left}）` : ''), b));
    }
  } else if (id === 'tune') {
    // 調整：バーで数値を変える（すぐ反映・保存）。結果をコピーして Claude に渡せる
    const box = $('tuneBody'); box.innerHTML = '';
    const note = document.createElement('div'); note.className = 'sub'; note.textContent = T.tuneInfo; box.append(note);
    for (const d of TUNE_DEF) {
      const row = document.createElement('div'); row.className = 'tuneRow';
      const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = lang === 'en' ? d.en : d.ja;
      const val = document.createElement('b');
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step; inp.value = TUNE[d.k];
      const show = () => { val.textContent = TUNE[d.k] + (TUNE[d.k] !== d.def ? ` (${d.def})` : ''); val.classList.toggle('chg', TUNE[d.k] !== d.def); };
      inp.addEventListener('input', () => { TUNE[d.k] = +inp.value; saveTune(); show(); });
      show();
      row.append(lab, val, inp); box.append(row);
    }
    const out = document.createElement('textarea'); out.className = 'tuneOut'; out.readOnly = true; out.hidden = true;
    const copy = document.createElement('button'); copy.className = 'wide'; copy.textContent = T.tuneCopy;
    copy.addEventListener('click', () => {
      out.value = tuneReport(); out.hidden = false; out.select();
      if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(() => say(T.tuneCopied), () => {});
    });
    const reset = document.createElement('button'); reset.className = 'wide'; reset.textContent = T.tuneReset;
    reset.addEventListener('click', () => { for (const d of TUNE_DEF) TUNE[d.k] = d.def; saveTune(); renderPanel('tune'); });
    box.append(copy, out, reset);
  } else if (id === 'admin') {
    const box = $('adminBody'); box.innerHTML = '';
    const A = T.adm;
    const add = (label, f) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { f(); updateUI(); }); box.append(b); };
    add(A.m1, () => { S.money += 1000; });
    add(A.m10, () => { S.money += 10000; });
    add(A.maxLv, () => { for (const s of S.st.values()) s.lv = Math.min(capOf(s), s.lv + 5); S.truck.lv = Math.min(lvCap('truck'), S.truck.lv + 5); for (const f2 of S.forks) f2.lv += 5; });
    add(A.ace, () => { addWorker(5); });
    add(A.month, () => { S.time = (Math.floor(S.time / TUNE.month) + 1) * TUNE.month; updateMonth(); });
    add(A.fast, () => { S.adminFast = true; speedIdx = speeds().length - 1; });
    add(A.clear, () => { S.reveal = !S.reveal; });
    add(A.allSk, () => { for (const sid of SKILL_ORDER) while (sk(sid) < Math.min(SKILLS[sid].max, 10)) gainSkill(sid); for (const m of MACHINE_ORDER) S.unlock[m] = true; S.unlock.batch = true; if (!S.lab.built) { S.office.lv = Math.max(1, S.office.lv); const c = [...Array(COLS).keys()].find(surfaceFree); S.lab.built = true; S.lab.c = c; } });
    add(A.finRes, () => { for (const r of S.researches) r.t = r.total; });
    add(A.tune, () => { togglePanel('tune'); });
    add('釣り合い調整（全部の数字）', () => { closePanels(); openBalance(); });
    add(A.stageUp, () => {   // 段階ジャンプ：次の岩盤を突破したことにする（掘削レベルも追いつかせる）
      S.deepest = Math.max(S.deepest, SKY + layerDepth(S.stage)); S.skills.digLv = Math.max(sk('digLv'), S.stage); checkStage();
    });
    add(A.auto10, () => { closePanels(); autoPlay(10); });
    add(A.auto60, () => { closePanels(); autoPlay(60); });
    add(A.tripTest, () => { closePanels(); tripTestOn = true; tripStart(); });   // 社員旅行を試す（研究や材料なしで。回数・履歴に残さない）
    add(autoLive ? A.liveOff : A.liveOn, () => { autoLive = !autoLive; liveT = 0; aiLog = []; showAiLog(); say(autoLive ? tx().adm.liveOnMsg : tx().adm.liveOff, 2500); renderPanel('admin'); });
    add(A.failLog, () => { closePanels(); showNotice(aiFailText(), 'normal'); });
    add(A.pixel, () => { window.open('tools/pixel.html', '_blank'); });
    add(A.diary, () => { window.open('diary/', '_blank'); });
  } else if (id === 'help') {
    // 2ペイン：左に項目、右に説明
    const nav = $('helpNav'), body = $('helpBody');
    nav.innerHTML = '';
    const fill = i => {
      body.innerHTML = '';
      const h = document.createElement('h3'); h.textContent = topics[i][0]; body.append(h);
      if (topics[i][2] === 'items') { body.append(helpItemList()); return; }   // 施設・設置物・資源の一覧（絵つき）
      if (topics[i][2] === 'please') {   // おねがい：ご意見と、応援（寄付）
        for (const para of topics[i][1].split('\n')) { const pEl = document.createElement('p'); pEl.textContent = para; body.append(pEl); }
        const row = document.createElement('div'); row.className = 'pleaseBtns';
        const link = (label, url) => { const a = document.createElement('a'); a.className = 'btnLink'; a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label; row.append(a); };
        if (X_URL) link(T.feedbackX, X_URL);
        link(T.feedbackNote, NOTE_URL);
        link(T.kofi, 'https://ko-fi.com/kinomeno'); link(T.tip, NOTE_URL); link(T.privacy, 'privacy/');
        body.append(row); return;
      }
      const fg = helpFig(topics[i][2]); if (fg) body.append(fg);
      for (const para of topics[i][1].split('\n')) { const pEl = document.createElement('p'); pEl.textContent = para; body.append(pEl); }
    };
    // 選択の印（黒い四角）は1つだけ。押した項目へ滑らかに移る
    const mark = document.createElement('span'); mark.className = 'hmark';
    const moveMark = (b, anim) => {
      mark.style.transition = anim ? '' : 'none';
      mark.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
      mark.style.width = b.offsetWidth + 'px'; mark.style.height = b.offsetHeight + 'px';
    };
    const show = (i, anim = true) => {
      helpIdx = i;
      [...nav.querySelectorAll('button')].forEach((b, j) => { b.classList.toggle('active', i === j); if (i === j) moveMark(b, anim); });
      fill(i);
    };
    // 最初に「ごあいさつ」。事務所と研究所の話は会社レベル2から・石油と温泉は段階5から。3つ目＝挿絵の番号
    const H = T.helpTopics;
    const topics = [[T.greetT, T.greet, 'greet'], [T.hBasic, H[0][1], 0], [T.hDig, H[1][1] + '\n' + H[2][1], 1], [T.hMake, H[3][1] + '\n' + H[6][1], 3],
      [H[4][0], H[4][1], 4], [T.hLevel, T.levelHelp + '\n' + H[5][1], 5]];
    if (S.stage >= 2 && T.aditHelp) topics.push([T.aditHelp[0], T.aditHelp[1], 'adit']);   // 横穴掘削口（段階2から）
    if (S.stage >= 5) topics.push([H[7][0], H[7][1], 7]);                                  // 石油と温泉（段階5から）
    topics.push([T.hItems, '', 'items'], [T.pleaseT, T.please, 'please']);
    nav.append(mark);
    topics.forEach(([t], i) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', () => show(i)); nav.append(b); });
    // 高さは、いちばん長い説明に合わせて最初に確保する（項目を替えても窓の大きさが変わらない）
    body.style.minHeight = '';
    let tall = 0;
    for (let i = 0; i < topics.length; i++) { if (topics[i][2] === 'items') continue; fill(i); tall = Math.max(tall, body.offsetHeight); }   // 一覧は長いので、高さの計算に入れない（縦にスクロール）
    body.style.minHeight = tall + 'px';
    show(Math.min(helpIdx, topics.length - 1), false);
  } else if (id === 'settings') {
    document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    const box = $('setExtra'); box.innerHTML = '';
    {   // コンベア自動（基本機能）のオン・オフ
      const row = document.createElement('div'); row.className = 'prow labeled';
      const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = T.autoConvOpt;
      const opts = document.createElement('span'); opts.className = 'opts';
      for (const v of [true, false]) {
        const b = document.createElement('button'); b.textContent = v ? T.on : T.off;
        b.classList.toggle('active', S.opts.autoConv === v);
        b.addEventListener('click', () => { S.opts.autoConv = v; renderPanel('settings'); });
        opts.append(b);
      }
      row.append(lab, opts); box.append(row);
    }
    if (sk('secAdv')) {   // 秘書の提案のオン・オフ
      const row = document.createElement('div'); row.className = 'prow labeled';
      const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = T.secAdvOpt;
      const opts = document.createElement('span'); opts.className = 'opts';
      for (const v of [true, false]) {
        const b = document.createElement('button'); b.textContent = v ? T.on : T.off;
        b.classList.toggle('active', (S.opts.secAdv !== false) === v);
        b.addEventListener('click', () => { S.opts.secAdv = v; renderPanel('settings'); advSync(); });
        opts.append(b);
      }
      row.append(lab, opts); box.append(row);
    }
    const h = document.createElement('div'); h.className = 'sub'; h.textContent = T.autoSaveNote; box.append(h);
  }
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem('saikutsu.lang', lang); } catch (e) { /* 保存できない環境 */ }
  setupText(); renderPanel('settings'); renderSub(); if (popTarget) buildPop();
}));

// 調整の結果を文章にする（コピーしてチャットに貼る用）
function tuneReport() {
  const lines = [`【ほりほり工場 調整結果 v${VERSION}】`];
  for (const d of TUNE_DEF) lines.push(`${d.ja}: ${TUNE[d.k]}${TUNE[d.k] !== d.def ? `（初期値 ${d.def} から変更）` : ''}`);
  const m = Math.floor(S.time / TUNE.month);
  lines.push(`--- 今のゲーム：${Math.floor(m / 12) + 1}年${m % 12 + 1}月・資金 ${S.money}・作業員 ${S.workers.length}人・深さ ${Math.max(0, S.deepest - SKY)}m・出荷 ${S.stats.ships}回`);
  lines.push('JSON: ' + JSON.stringify(TUNE));
  return lines.join('\n');
}
// 浮いている窓を、見出しをつかんで動かせるようにする（情報・地図）
function makeDraggable(el) {
  const hd = el.querySelector('.handle');
  let drag = null;
  hd.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { hd.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
  });
  hd.addEventListener('pointermove', e => {
    if (!drag) return;
    el.style.left = clamp(e.clientX - drag.dx, 0, window.innerWidth - 60) + 'px';
    el.style.top = clamp(e.clientY - drag.dy, 0, window.innerHeight - 40) + 'px';
    el.style.right = 'auto'; el.style.transform = 'none';
  });
  const end = () => { drag = null; };
  hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
}

// ---- 情報パネル（経営状況） ----
let infoTab = 'fin';
function showInfoTab(id) {
  infoTab = id;
  document.querySelectorAll('[data-itab]').forEach(x => x.classList.toggle('active', x.dataset.itab === id));
  $('infoFin').hidden = id !== 'fin'; $('infoHist').hidden = id !== 'hist'; $('infoCatl').hidden = id !== 'cat';
  $('infoCatl').dataset.k = '';
  renderInfo();
}
function openInfo(id) { openCat = null; renderSub(); closePanels(); closePop(); showInfoTab(id); $('info').hidden = false; renderInfo(); updateUI(); }
document.querySelectorAll('[data-itab]').forEach(b => b.addEventListener('click', () => { showInfoTab(b.dataset.itab); updateUI(); }));
// 商品カタログ：今つくれる・売れる物（原料は出る段階、製品は研究した機械）と、説明・今の売値
// 仕分けで選べる資源：今手に入る物だけ（カタログと同じ）。今選んでいる物は残す
const sortChoices = cur => { const ids = catalogIds(); return ITEM_ORDER.filter(k => ids.includes(k) || k === cur || (k === 'bag' && S.unlock.bagger)); };
function catalogIds() {
  const have = new Set(['soil']);
  if (S.stage >= 2) { have.add('stone'); have.add('iron'); }
  if (S.stage >= 3) have.add('gold');
  if (S.stage >= 5) have.add('dia');
  for (let pass = 0; pass < 5; pass++) for (const m of MACHINE_ORDER) if (S.unlock[m]) for (const rc of (MACHINES[m].recipes || [])) if (rc.ins ? Object.keys(rc.ins).every(k2 => have.has(k2)) : have.has(rc.in)) have.add(rc.out);
  if (S.unlock.refinery) have.add('fuel');
  for (const k in S.seenIt || {}) if (ITEMS[k] && k !== 'bag') have.add(k);   // 掘り出したことのある資源（粘土・銅なども）
  for (let pass = 0; pass < 5; pass++) for (const m of MACHINE_ORDER) if (S.unlock[m]) for (const rc of (MACHINES[m].recipes || [])) if (rc.ins ? Object.keys(rc.ins).every(k2 => have.has(k2)) : have.has(rc.in)) have.add(rc.out);
  for (const [k] of RARE) if (S.sold[k] || (S.museum && S.museum[k])) have.add(k);   // 見つけたことのある珍しい物
  return ITEM_ORDER.filter(k => have.has(k));
}
function renderCatalog() {
  const T = tx(), box = $('infoCatl'), ids = catalogIds();
  const sig = lang + ids.join() + ids.map(k => itemVal({ k })).join();
  if (box.dataset.k === sig) return;
  box.dataset.k = sig; box.innerHTML = '';
  const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.catNote; box.append(n);
  for (const k of ids) {
    const pr = document.createElement('b'); pr.className = 'cprice'; pr.textContent = fmt(itemVal({ k }));
    const el = rowEl(T.items[k], itemInfo(k).split('\n').slice(1).filter(x => x !== T.iBag).join('\n'), pr);
    el.querySelector('.spec').style.whiteSpace = 'pre-line';
    const sw = document.createElement('canvas'); sw.width = sw.height = 16; sw.className = 'cicon';
    const g2 = sw.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(itemSprite(k), 0, 0, 16, 16);
    el.querySelector('.name').prepend(sw);
    box.append(el);
  }
}
function renderHist() {
  const T = tx(), box = $('infoHist');
  if (box.dataset.n === String(S.history.length) && box.dataset.lang === lang) return;   // 変わった時だけ作り直す
  box.dataset.n = S.history.length; box.dataset.lang = lang; box.innerHTML = '';
  if (!S.history.length) { box.textContent = T.histEmpty; return; }
  for (const e of [...S.history].reverse()) {   // 新しい順
    const r = document.createElement('div'); r.className = 'hrow2';
    const a = document.createElement('span'); a.textContent = T.date(Math.floor(e.m / 12) + 1, e.m % 12 + 1);
    const b = document.createElement('span'); b.textContent = e.t;
    r.append(a, b); box.append(r);
  }
}
function renderInfo() {
  if (infoTab === 'hist') { renderHist(); return; }
  if (infoTab === 'cat') { renderCatalog(); return; }
  const T = tx(), R = T.infoRows, st = S.stats;
  const last = st.months[st.months.length - 1];
  const sts = [...S.st.values()];
  const num = v => typeof v === 'number' ? fmt(v) : v;
  const net = v => ({ v: typeof v === 'number' && v > 0 ? '+' + num(v) : num(v), cls: typeof v === 'number' ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : '' });
  const mn = net(st.cur.sale - st.cur.cost), ln = net(last ? last.sale - last.cost : '-');
  // まとまりごと：[見出し, [[名前, 値, 強調?, 色], ...]]
  const groups = [
    [T.infoGrp[0], [
      [R.money, num(S.money), true],
      [R.mSale, num(st.cur.sale)], [R.mCost, num(st.cur.cost)],
      [R.mNet, mn.v, false, mn.cls], [R.lNet, ln.v, false, ln.cls],
      ...(() => {   // 今年（1月から今まで）と去年
        const done = S.month % 12, ms = st.months, thisY = [...ms.slice(Math.max(0, ms.length - done)), st.cur];
        const lastY = ms.length >= done + 12 ? ms.slice(ms.length - done - 12, ms.length - done) : null;
        const sum = (a, f) => a.reduce((v, m) => v + f(m), 0), yS = sum(thisY, m => m.sale), yC = sum(thisY, m => m.cost);
        const lS = lastY && sum(lastY, m => m.sale), lC = lastY && sum(lastY, m => m.cost), yp = net(yS - yC);
        const ly = v => (lastY ? '\n' + T.lastY(fmt(v)) : '');   // 去年は下の行に
        return [[T.yProfit, yp.v + ly(lS - lC), false, yp.cls], [T.ySale, num(yS) + ly(lS)], [T.yCost, num(yC) + ly(lC)]];
      })(),
      [R.loan, S.loan > 0 ? num(S.loan) : '-'],
    ]],
    [T.infoGrp[1], [
      [R.tSale, num(st.saleTotal)], [R.tCost, num(st.costTotal)], [R.ships, st.ships + T.unitT],
    ]],
    [T.infoGrp[2], [
      [R.deepest, T.depthM(Math.max(0, S.deepest - SKY))],
      [R.drills, sts.filter(s => s.type === 'drill').length + T.unitN],
      [R.machines, sts.filter(s => s.type === 'machine').length + T.unitN],
      [R.belts, sts.filter(isBelt).length + T.unitN],
      [R.workers, `${S.workers.length}${T.unitP}（${S.workers.filter(w => w.state === 'work').length}）`],
      [R.yard, S.yard.length + T.unitK],
    ]],
  ];
  const box = $('infoData'); box.innerHTML = '';
  const col2 = document.createElement('div'); col2.className = 'icol';   // 右の列：累計と現場
  groups.forEach(([title, rows], gi) => {
    const g = document.createElement('div'); g.className = 'igrp';
    const hd = document.createElement('div'); hd.className = 'ihead'; hd.textContent = title;
    const d = document.createElement('div'); d.className = 'data';
    for (const [a, b, big, cls] of rows) {
      const x = document.createElement('span'); x.textContent = a;
      const y = document.createElement(big ? 'b' : 'span'); if (cls) y.className = cls;
      const [v1, v2] = String(b).split('\n'); y.textContent = v1;
      if (v2) { const sm = document.createElement('small'); sm.className = 'lastY'; sm.textContent = v2; y.append(document.createElement('br'), sm); }   // 去年（カッコは1かたまりで改行しない）
      d.append(x, y);
    }
    g.append(hd, d);
    if (gi === 0) box.append(g, col2); else col2.append(g);
  });
  drawLine($('gMoney'), st.hist.concat([S.money]));
  drawBars($('gMonth'), st.months.concat([st.cur]).slice(-12).map(m => m.sale - m.cost));
}
function graphCtx(c) {
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth || 340, h = c.clientHeight || 90;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return [g, w, h];
}
function drawLine(c, vals) {
  const [g, w, h] = graphCtx(c);
  if (vals.length < 2) return;
  let lo = Math.min(...vals), hi = Math.max(...vals), pad = 12;   // その間のいちばん下〜上で目盛り（0から取らない）
  if (hi - lo < Math.max(1, Math.abs(hi) * 0.02)) { const m0 = (hi + lo) / 2, d0 = Math.max(1, Math.abs(m0) * 0.02); lo = m0 - d0; hi = m0 + d0; }   // ほぼ平らな時も天井に張り付かない
  const Y = v => h - pad - (v - lo) / (hi - lo) * (h - pad * 2);
  if (lo < 0 && hi > 0) { g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke(); }
  g.strokeStyle = THEME.accent; g.lineWidth = 1.5; g.beginPath();
  vals.forEach((v, i) => { const x = i / (vals.length - 1) * (w - 4) + 2; if (i) g.lineTo(x, Y(v)); else g.moveTo(x, Y(v)); });
  g.stroke();
  g.fillStyle = THEME.graphText; g.font = '10px sans-serif'; g.textBaseline = 'top'; g.fillText(fmt(Math.round(hi)), 4, 1); g.textBaseline = 'bottom'; g.fillText(fmt(Math.round(lo)), 4, h - 1);   // 単位つき（340B など）
}
function drawBars(c, vals) {
  const [g, w, h] = graphCtx(c);
  if (!vals.length) return;
  const m = Math.max(1, ...vals.map(Math.abs)), mid = h / 2, bw = w / 12;
  g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  vals.forEach((v, i) => {
    const bh = Math.abs(v) / m * (mid - 6);
    g.fillStyle = v >= 0 ? THEME.good : THEME.bad;
    g.fillRect(i * bw + 3, v >= 0 ? mid - bh : mid, bw - 6, bh);
  });
  g.fillStyle = THEME.graphText; g.font = '10px sans-serif'; g.textBaseline = 'top'; g.fillText('+' + fmt(Math.round(m)), 4, 2); g.textBaseline = 'bottom'; g.fillText('-' + fmt(Math.round(m)), 4, h - 2);
}
$('infoBtn').addEventListener('click', () => { const el = $('info'); el.hidden = !el.hidden; if (!el.hidden) renderInfo(); });
makeDraggable($('info'));

// ---- 全体の縮小地図（タップした所へ画面が移る） ----
const MAP_W = 112;
function mapRows() { return Math.max(S.deepest + 4, SKY + 12); }
function mapScale() { return Math.min(MAP_W / COLS, 300 / mapRows()); }
function renderMap(c = $('mapCv')) {
  const rows = mapRows(), s = mapScale(c);
  const w = Math.round(COLS * s), h = Math.round(rows * s), dpr = window.devicePixelRatio || 1;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#7fb8e6'; g.fillRect(0, 0, w, SKY * s);
  g.fillStyle = '#2a2018'; g.fillRect(0, SKY * s, w, h - SKY * s);
  for (let r = SKY; r < rows; r++) {
    const a = row(r);
    for (let cc = 0; cc < COLS; cc++) {
      const b = a[cc]; if (!b) continue;
      g.fillStyle = groundColor(b, r); g.fillRect(cc * s, r * s, Math.ceil(s), Math.ceil(s));
    }
  }
  for (const [k, st] of S.st) {
    g.fillStyle = st.type === 'drill' ? '#ff5a4a' : st.type === 'machine' ? '#b9a8ff' : st.type === 'sort' ? '#6fa3b5' : '#9a9ea6';
    g.fillRect(cOf(k) * s, rOf(k) * s, Math.ceil(s), Math.ceil(s));
  }
  g.fillStyle = THEME.office.wall; g.fillRect(OFFICE_C * s, YARD_R * s, 2 * s, s);           // 事務所
  if (S.lab.built) { g.fillStyle = THEME.lab.wall; g.fillRect(S.lab.c * s, YARD_R * s, s, s); }
  g.fillStyle = '#3a6ea5'; g.fillRect(BED * s, YARD_R * s, s, s);                    // トラック・ヤード
  g.fillStyle = 'rgba(0,0,0,.45)'; for (let cc = 0; cc < COLS; cc++) if (!owned(cc)) g.fillRect(cc * s, SKY * s, s, h - SKY * s);   // よその土地
  g.fillStyle = '#f2c230'; for (const f of S.forks) g.fillRect(f.x * s - 1.5, (YARD_R + 0.6) * s, 3, 3);   // フォークリフト
  g.fillStyle = '#ffb03a';
  for (const w2 of S.workers) if (w2.state !== 'idle' && w2.state !== 'rest') g.fillRect(w2.x * s - 1, w2.y * s - 1, 2, 2);
  // 今見ている範囲
  const vx = Math.max(0, cam.x - offX / cp), vw = Math.min(COLS, cw / cp);
  g.strokeStyle = THEME.mapView; g.lineWidth = 1.5;
  g.strokeRect(vx * s + 0.5, cam.y * s + 0.5, vw * s - 1, (ch / cp) * s - 1);
}
function mapJump(e, c = $('mapCv')) {
  const r = c.getBoundingClientRect(), s = mapScale(c);
  const wc = (e.clientX - r.left) / s, wr = (e.clientY - r.top) / s;
  metrics();
  cam.x = wc - cw / cp / 2; cam.y = wr - ch / cp / 2;
  metrics();
}
for (const c of [$('mapCv')]) {
  let on = false;
  c.addEventListener('pointerdown', e => { on = true; try { c.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ } mapJump(e, c); });
  c.addEventListener('pointermove', e => { if (on) mapJump(e, c); });
  c.addEventListener('pointerup', () => { on = false; });
  c.addEventListener('pointercancel', () => { on = false; });
}
$('mapBtn').addEventListener('click', () => { const el = $('mapPanel'); el.hidden = !el.hidden; if (!el.hidden) renderMap(); updateUI(); });
makeDraggable($('mapPanel'));

// 確認画面（ブラウザ標準の確認窓は環境によって出ないので、自前で出す）
let confirmYes = null;
let confirmNoF = null;
function askConfirm(msg, onYes, onNo) { $('confirmMsg').textContent = msg; confirmYes = onYes; confirmNoF = onNo || null; $('confirm').hidden = false; }
$('confirmNo').addEventListener('click', () => { $('confirm').hidden = true; confirmYes = null; const g = confirmNoF; confirmNoF = null; if (g) g(); });
$('confirmYes').addEventListener('click', () => { $('confirm').hidden = true; const f = confirmYes; confirmYes = null; confirmNoF = null; if (f) f(); });

// ---- 描画 ----
// 画面の色（デザイン）。ここを変えるだけで見た目が変わる。ゲームの仕組みとは分けてある
const THEME = {
  // 明るいグレーが基本。色を付けるのは「資源（中身）・ドリル・お金・選択」だけに絞る
  bg: '#e6e6e3', skyTop: '#6fa9d6', skyLow: '#b9d7ec',   // 空は青（原色より少しだけ彩度を落とす）
  dug: '#8fa8ba', grass: '#5f8a44', paved: '#8d8f93',     // 穴＝空より少し暗い水色
  grassMid: '#7aa35a', grassDark: '#5f8a44', grassLight: '#a3c47e',   // 地表の草（ドット絵）
  soil: [[200, 186, 164], [142, 128, 108]], stone: [[152, 158, 170], [98, 103, 114]], rock: '#5b5a60', rockLine: 'rgba(255,255,255,.3)',
  gauge: '#2b2b2e', gaugeBg: 'rgba(255,255,255,.55)', depth: 'rgba(0,0,0,.45)',
  conv: { rail: '#3d3e43', railHi: '#a2a4aa', belt: '#5c5e63', slat: '#8a8c92' },
  pipe: { line: '#3d3e43', body: '#a9aeb5', joint: '#c9ced4', oil: '#3a2a1a', hot: '#6fc3e6' },   // パイプライン・液体   // コンベアのドット絵：外の枠・枠の光・ベルト・流れる板
  sortLine: '#e0782f', arrow: 'rgba(255,255,255,.7)',
  machBg: '#d6d6d3', machLine: '#6d6d70', machText: '#2b2b2e', machOut: '#2b2b2e', machProg: '#e0782f',
  drill: '#e0782f', drillStuck: '#9a9a9a', bit: '#4a4a4d',
  level: '#e0782f', levelLine: 'rgba(0,0,0,.35)', zBg: 'rgba(0,0,0,.6)', zText: '#ffffff',
  labLit: '#ffd76a', labIdle: '#e8d9a6',
  office: { wall: '#f6f6f4', wall2: '#dcdcd9', roof: '#4a4a4d', win: '#9aa3a8', door: '#4a4a4d', text: '#2b2b2e' },
  lab: { wall: '#f6f6f4', roof: '#4a4a4d', win: '#9aa3a8', line: '#8d8f93' },
  labOn: '#e0782f', labOff: '#9a9a9a',
  truck: { body: '#55565b', cab: '#f6f6f4', win: '#9aa3a8', load: '#b9b3a6', tire: '#2b2b2e' },
  fork: { body: '#e0a43a', mast: '#4a4a4d', frame: '#2b2b2e', tire: '#2b2b2e' },
  worker: { head: [224, 120, 47], body: '#3a3a3d' },
  sel: '#2b2b2e', hover: 'rgba(0,0,0,.6)', hatch: 'rgba(0,0,0,.38)', hatchHi: 'rgba(255,255,255,.35)', hatchFill: 'rgba(0,0,0,.06)',
  sale: '#2f7d4a', cost: '#c0392b', popLine: 'rgba(255,255,255,.9)',
  okFill: 'rgba(120, 205, 255, .42)', okLine: 'rgba(255, 255, 255, .75)',   // 置ける所（洞窟の茶色の上でも見える水色＋白い点線）
  otherLand: 'rgba(28, 24, 20, .42)', fence: '#6b5a48',
  bridge: { deck: '#8a6a48', dark: '#4e3c2a', truss: 'rgba(78, 60, 42, .85)', rail: '#5e4a36' },   // 穴の上の橋                         // よその土地（暗く）・境目の柵
  accent: '#e0782f', graphText: '#77767a', good: '#4f8a5b', bad: '#c0392b', mapView: '#2b2b2e',
};
// 穴（洞窟）の色：浅い所は明るめの茶、深いほど暗く
// 掘った穴の飾り：鉱脈の所は資源の色がうっすら・上と左右が地面なら影（くぼんで見える）・元は岩盤だった段は上下に境界線
function holeDeco(c, r, a, x, y) {
  const vn = veinAt(c, r);
  if (vn) { ctx.globalAlpha = 0.14 + 0.2 * vn[1]; ctx.fillStyle = ITEMS[vn[0]].c[0]; ctx.fillRect(x, y, cp, cp); ctx.globalAlpha = 1; }
  const up = r - 1 >= SKY && !!blk(c, r - 1), lf = c > 0 && !!a[c - 1], rt = c < COLS - 1 && !!a[c + 1], rk = !!layerAt(r - SKY);
  if (!up && !lf && !rt && !rk) return;
  const vr = (c * 7 + r * 3) % 3;   // ギザギザの形は3通り（となりと同じにならない）
  ctx.drawImage(cachedCell(`sh${+up}${+lf}${+rt}${+rk}${vr}`, () => {
    const k = cp, u = k / 16, rnd = seeded(900 + vr * 17);   // v0.97：影は太く・ふちはドット絵のギザギザ（16分割）
    if (up) for (let i = 0; i < 16; i++) { const d = 3 + Math.floor(rnd() * 3); ctx.fillStyle = 'rgba(0,0,0,.36)'; ctx.fillRect(i * u, 0, u + 0.5, d * u); ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(i * u, d * u, u + 0.5, (1 + Math.floor(rnd() * 2)) * u); }
    if (lf) for (let i = 0; i < 16; i++) { const d = 2 + Math.floor(rnd() * 2); ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(0, i * u, d * u, u + 0.5); }
    if (rt) for (let i = 0; i < 16; i++) { const d = 1 + Math.floor(rnd() * 2); ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(k - d * u, i * u, d * u, u + 0.5); }
    if (rk) { ctx.fillStyle = 'rgba(40,42,48,.75)'; ctx.fillRect(0, 0, k, Math.max(1.5, k * 0.04)); ctx.fillRect(0, k - Math.max(1.5, k * 0.04), k, Math.max(1.5, k * 0.04)); }
  }), x, y, cp, cp);
}
// 鉱脈の粒（16×16）：強さ1〜4で粒の数が変わる。資源の色・ふちの色の2色
function veinSpeck(k, lv, v) {
  return texOf('vs' + k + lv + ':' + v, g => {
    const rnd = seeded(500 + v * 31 + lv * 7), [c1, c2] = k === 'gray' ? ['#8c8a86', '#5a5854'] : ITEMS[k].c;
    for (let i = 0; i < 2 + lv * 3; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
      g.fillStyle = c2; g.fillRect(x - 1, y, 1, 2); g.fillRect(x, y + 1, 2, 1); g.fillStyle = c1; g.fillRect(x, y, 2, 1);
      if (k !== 'gray') { g.fillStyle = '#ffffff'; g.fillRect(x + 1, y, 1, 1); }   // 光る点（動かない）
    }
  });
}
function caveColor(r) {
  const t = clamp((r - SKY) / 60, 0, 1), a = [122, 94, 72], z = [58, 45, 38];
  return `rgb(${a.map((v, i) => Math.round(v + (z[i] - v) * t)).join(',')})`;
}
// 地面のマスのすき間の色：その深さの土より少し暗い
function seamColor(r) {
  const t = clamp((r - SKY) / 40, 0, 1), [a, z] = THEME.soil;
  return `rgb(${a.map((v, i) => Math.round((v + (z[i] - v) * t) * 0.9)).join(',')})`;
}
// そのマスを掘った割合（0〜1）
const digProg = g => clamp((g.yieldN - g.left + g.p / g.h) / g.yieldN, 0, 1);
// ドリルの絵のずれ：掘っているマスへ、掘った割合だけめり込む（データ上の位置は同じ）
function drillShift(k, s) {
  const [dx, dy] = DIRS[s.dir], tc = cOf(k) + dx, tr = rOf(k) + dy, g = inB(tc, tr) && tr >= SKY ? blk(tc, tr) : null;
  const p = g ? digProg(g) * 0.6 : 0;
  return [dx * p, dy * p];
}
function groundColor(b, r) {
  if (b.mat === 'rock') return THEME.rock;
  const t = clamp((r - SKY) / 40, 0, 1);
  const [a, z] = b.mat === 'stone' ? THEME.stone : THEME.soil;
  return `rgb(${a.map((v, i) => Math.round(v + (z[i] - v) * t)).join(',')})`;
}

function draw() {
  const dpr = viewDpr();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = THEME.bg; ctx.fillRect(0, 0, cw, ch);
  const cell = cp;
  const r0 = Math.floor(cam.y) - 1, r1 = Math.ceil(cam.y + ch / cp) + 1;
  const c0 = Math.max(0, Math.floor(cam.x - offX / cp) - 1), c1 = Math.min(COLS - 1, Math.ceil(cam.x + (cw - offX) / cp) + 1);   // 見えている列（左右の画面外は描かない）
  const out = (c, r) => r < r0 || r > r1 || c < c0 || c > c1;
  const stKey = new Map(); for (const [k, v] of S.st) stKey.set(v, k);   // 持ち場 → マス（作業員ごとに探さない）
  ctx.save();
  const le = launchT ? (performance.now() - launchT) / 1000 : 0, sh = launchT ? launchShake(le) * Math.max(1.5, cp * 0.05) : 0;   // 発進の どどど
  ctx.translate(offX - cam.x * cp + Math.sin(le * 97) * sh, -cam.y * cp + Math.cos(le * 83) * sh * 0.7);
  const W = COLS * cell;
  const sky = ctx.createLinearGradient(0, (SKY - 6) * cell, 0, SKY * cell);   // 空（落ち着いたグラデーション）
  sky.addColorStop(0, THEME.skyTop); sky.addColorStop(1, THEME.skyLow);
  ctx.fillStyle = sky; ctx.fillRect(0, (r0 - 2) * cell, W, (SKY - r0 + 2) * cell);
  const g0 = Math.max(SKY, r0);
  for (let r = g0; r <= r1; r++) { ctx.fillStyle = seamColor(r); ctx.fillRect(0, r * cell, W, cell + 1); }   // 地面の下地：マスのすき間は土より少し暗い色（目立たない線）
  // ドリルが掘っているマス：key → [向き, 掘った割合]
  const digging = new Map();
  for (const [k, s2] of S.st) {
    if (s2.type !== 'drill') continue;
    const [dx, dy] = DIRS[s2.dir], tc = cOf(k) + dx, tr = rOf(k) + dy, g = inB(tc, tr) && tr >= SKY ? blk(tc, tr) : null;
    if (g) digging.set(key(tc, tr), [s2.dir, digProg(g)]);
  }

  const digSet = tool === 'dig' ? diggable() : null;
  for (let r = g0; r <= r1; r++) {
    const a = row(r);
    for (let c = c0; c <= c1; c++) {
      const b = a[c];
      const x = c * cell, y = r * cell;
      const v = (c * 7 + r * 13) % 4;   // 模様の種類（隣と同じにならないよう散らす）
      ctx.imageSmoothingEnabled = false;
      if (!b) { ctx.fillStyle = caveColor(r); ctx.fillRect(x, y, cell, cell); ctx.drawImage(caveTex(v), x, y, cell, cell); holeDeco(c, r, a, x, y); continue; }   // 掘った穴：洞窟の壁
      const dg = digging.get(key(c, r));
      if (dg) {   // 掘られている途中：掘った側から削れて、奥の洞窟が見える
        ctx.fillStyle = caveColor(r); ctx.fillRect(x, y, cell, cell); ctx.drawImage(caveTex(v), x, y, cell, cell);
        const p = dg[1], cut = { down: [0, p, 1, 1 - p], up: [0, 0, 1, 1 - p], right: [p, 0, 1 - p, 1], left: [0, 0, 1 - p, 1] }[dg[0]];
        ctx.save(); ctx.beginPath(); ctx.rect(x + cut[0] * cell, y + cut[1] * cell, cut[2] * cell, cut[3] * cell); ctx.clip();
      }
      if (b.mat === 'rock') ctx.drawImage(rockTex(v), x + 1, y + 1, cell - 2, cell - 2);
      else {
        ctx.fillStyle = groundColor(b, r); ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.drawImage(groundTex(b.mat, v), x + 1, y + 1, cell - 2, cell - 2);
        const vn0 = S.veins && S.veins.length ? veinAt(c, r) : null;
        if (vn0 && (vn0[2].found || sk('vein'))) ctx.drawImage(veinSpeck(vn0[2].found ? vn0[0] : 'gray', Math.min(4, Math.ceil(vn0[1] * 4)), v), x + 1, y + 1, cell - 2, cell - 2);   // 鉱脈：掘り始めたら資源の色・「鉱脈探知」の後は灰色で存在だけ
      }
      if (dg) ctx.restore();
      if (r === SKY && c !== YARD_C) ctx.drawImage(grassTex(v), x, y, cell, cell);   // 地表の1段目は草（ヤードの所は舗装）
      if (S.oilMarks && S.oilMarks[key(c, r)]) { ctx.fillStyle = '#1e1a16'; ctx.beginPath(); ctx.arc(x + cell * 0.5, y + cell * 0.58, cell * 0.13, 0, Math.PI * 2); ctx.moveTo(x + cell * 0.38, y + cell * 0.54); ctx.lineTo(x + cell * 0.5, y + cell * 0.3); ctx.lineTo(x + cell * 0.62, y + cell * 0.54); ctx.fill(); }   // 油田探索の印
      if (S.reveal && b.pocket) { ctx.fillStyle = THEME.pipe[b.pocket]; ctx.fillRect(x + cell * 0.2, y + cell * 0.2, cell * 0.6, cell * 0.6); }
      if (S.reveal && b.ore) { ctx.fillStyle = ITEMS[b.ore].c[0]; ctx.fillRect(x + cell * 0.4, y + cell * 0.4, cell * 0.2, cell * 0.2); } // 管理：中身を見る
      if (b.left < b.yieldN || b.p > 0) {
        ctx.fillStyle = THEME.gaugeBg; ctx.fillRect(x + 3, y + cell - 6, cell - 6, 3);
        ctx.fillStyle = THEME.gauge; ctx.fillRect(x + 3, y + cell - 6, (cell - 6) * (b.left - b.p / b.h) / b.yieldN, 3);
      }
      if (digSet && digSet.has(key(c, r)) && !(b.mat === 'rock' && false)) { ctx.fillStyle = THEME.okFill; ctx.fillRect(x, y, cell, cell); }   // 掘れる所だけ薄い青
    }
    drawRockLabel(r, a);
  }
  ctx.fillStyle = THEME.grass; ctx.fillRect(0, SKY * cell - 1, W, 1);
  ctx.fillStyle = THEME.depth; ctx.font = `${Math.max(9, Math.round(cell * 0.3))}px sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let r = g0; r <= r1; r++) if (r > SKY && (r - SKY) % 5 === 0) ctx.fillText(tx().depthM(r - SKY), S.landL * cell + 2, r * cell + 2);

  for (const k0 in S.lids) {   // 湧き口のふた（鉄板）。上に物があれば、その下に見える
    const c = cOf(+k0), r = rOf(+k0); if (out(c, r)) continue;
    const x = c * cell, y = r * cell, m = cell * 0.08;
    ctx.fillStyle = '#5d626b'; ctx.fillRect(x + m, y + m, cell - 2 * m, cell - 2 * m);
    ctx.fillStyle = '#7c828c'; ctx.fillRect(x + m, y + m, cell - 2 * m, cell * 0.06);
    ctx.fillStyle = '#3a3d44'; for (const [bx2, by2] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) ctx.fillRect(x + cell * bx2 - 1.5, y + cell * by2 - 1.5, 3, 3);
  }
  for (const [k, s] of S.st) {
    const c = cOf(k), r = rOf(k);
    if (out(c, r) || s.type === 'drill') continue;
    const x = c * cell, y = r * cell;
    if (s.type === 'machine') { drawMachine(x, y, s); drawLevel(x, y, s.lv); continue; }
    if (s.type === 'pipe') { drawPipe(x, y, c, r, false); continue; }
    if (s.type === 'well') { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite(s.kind === 'oil' ? 'oilwell' : 'spring'), x, y, cell, cell); ctx.restore(); continue; }
    drawBeltCell(x, y, s, valOf(s) * TUNE.belt * beltSlow(s, k), false, c, r);   // あふれて遅いコンベアは、縞々もゆっくり
    drawBeltLv(x, y, s);
  }

  drawLand(g0, r1);
  drawBridges();
  drawOffice();
  drawLab();
  drawFacs();
  drawYard();
  drawTruck();
  drawDock();
  drawYardCount();

  // 資源：マスごとに描く数を fpsCtl.cap までにする（重い時は減らす）。描かなかった分は「×数」で出す
  // FPSが保てない時（cap が減っている時）だけ、あふれたマスは1個ずつ描かず「くっついた山の絵」1枚にする
  const lite = false, cnt = new Map(), kinds = new Map();   // v0.56：山の絵はかくつくのでやめた（「×数」だけ）
  if (lite) for (const it of S.items) {
    if (it.y < r0 || it.y > r1 + 1) continue;
    const ck = key(Math.floor(it.x), Math.floor(it.y)); cnt.set(ck, (cnt.get(ck) || 0) + 1);
    let km = kinds.get(ck); if (!km) kinds.set(ck, km = new Map()); km.set(it.k, (km.get(it.k) || 0) + 1);
  }
  const drawn = new Map(), over = new Map();
  for (const it of S.items) {
    if (it.y < r0 || it.y > r1 + 1 || it.x < c0 || it.x > c1 + 1) continue;
    const ck = key(Math.floor(it.x), Math.floor(it.y)), n = (drawn.get(ck) || 0) + 1;
    drawn.set(ck, n);
    if (lite && cnt.get(ck) > fpsCtl.cap) { over.set(ck, cnt.get(ck)); continue; }   // 山の絵にするマス
    if (n > fpsCtl.cap) { over.set(ck, n); continue; }
    drawItemShape(it, it.x * cell, it.y * cell, 1);
  }
  if (lite) for (const [ck, n] of over) {
    if (cnt.get(ck) <= fpsCtl.cap) continue;
    const km = kinds.get(ck); let top = null, tn = -1; for (const [k2, v] of km) if (v > tn) { tn = v; top = k2; }   // いちばん多い資源の山
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(clumpSprite(top, n), cOf(ck) * cell, rOf(ck) * cell, cell, cell); ctx.restore();
  }
  if (over.size) {
    ctx.font = `bold ${Math.round(cell * 0.2)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [ck, n] of over) {
      const tx2 = cOf(ck) * cell + cell / 2, ty2 = rOf(ck) * cell + cell * 0.22;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText('×' + n, tx2, ty2);
      ctx.fillStyle = '#2b2b2e'; ctx.fillText('×' + n, tx2, ty2);
    }
  }

  for (const k of Object.keys(S.elev)) { const c = cOf(+k), r = rOf(+k); if (!out(c, r)) drawElev(c * cell, r * cell); }   // エレベーター（別の層）
  for (const k of Object.keys(S.lamps || {})) { const c = cOf(+k), r = rOf(+k); if (r < r0 - 3 || r > r1 + 3) continue; drawLamp(c * cell, r * cell, true); }   // 照明（別の層）
  const etaDone = new Set();
  for (const [k, s] of S.st) {
    if (s.type !== 'drill') continue;
    const c = cOf(k), r = rOf(k);
    if (out(c, r)) continue;
    drawDrill(c * cell, r * cell, s);
    drawLevel(c * cell, r * cell, s.lv);
    const [dx, dy] = DIRS[s.dir], tc = c + dx, tr = r + dy, tk = key(tc, tr);   // 掘っているマスに残り時間（同じマスは1回だけ）
    if (!s.off && inB(tc, tr) && tr >= SKY && blk(tc, tr) && !etaDone.has(tk)) {
      etaDone.add(tk);
      const tt = etaText(drillEta(tc, tr)), fx = tc * cell + cell / 2, fy = tr * cell + cell * 0.5;
      ctx.font = `bold ${Math.max(9, Math.round(cell * 0.2))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(tt, fx, fy); ctx.fillStyle = '#ffffff'; ctx.fillText(tt, fx, fy);
    }
  }
  drawDust();
  // 作業員がいない持ち場には「z」の印（とても遅い）
  for (const [k, s] of S.st) {
    const c = cOf(k), r = rOf(k);
    if (out(c, r) || !isStation(s) || isBelt(s) || workFactor(s) > TUNE.unmanned) continue;   // コンベアは人がいなくても普通に動くので「z」は出さない
    ctx.fillStyle = THEME.zBg; ctx.beginPath(); ctx.arc(c * cell + cell * 0.84, r * cell + cell * 0.16, cell * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = THEME.zText; ctx.font = `bold ${Math.round(cell * 0.18)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('z', c * cell + cell * 0.84, r * cell + cell * 0.17);
  }
  // 作業員（i の形）
  for (const w of S.workers) {
    if (w.state === 'idle' || w.state === 'rest' || w.state === 'off') continue;      // 事務所の中（作業しない社長は事務所の絵で描く）
    if (w.target && w.target.type === 'lab' && w.state === 'work') continue;   // 研究所の中
    if (w.state === 'drive') continue;                            // 乗り物の絵の中に描く
    if (w.state === 'work' && w.target && w.target.type === 'fac') continue;   // 地上の施設の中
    if (w.state === 'work' && w.target && isStation(w.target)) {   // ドリル・機械で作業中は、そのマスの右上に頭だけ
      const k = stKey.has(w.target) ? stKey.get(w.target) : -1;
      if (k >= 0 && !out(cOf(k), rOf(k)) && isBelt(w.target)) { drawBeltWorker(cOf(k) * cell, rOf(k) * cell, w.target); continue; }   // コンベア：上半身
      if (k >= 0 && !out(cOf(k), rOf(k))) { const st2 = S.st.get(k), [ox, oy] = st2 && st2.type === 'drill' ? drillShift(k, st2) : [0, 0]; drawWorkerHead((cOf(k) + ox) * cell, (rOf(k) + oy) * cell, st2, w); }
      continue;
    }
    if (w.y < r0 || w.y > r1 + 1 || w.x < c0 || w.x > c1 + 1) continue;
    if (fpsCtl.lite >= 3 && w.id % 2 && !w.boss) continue;   // とても重い時は、歩いている作業員を半分だけ描く
    if (S.elev[wKey(w)] && S.time - (w.elevT || -9) < 0.5) drawElevCar((Math.floor(w.x) + 0.5) * cell, w.y * cell + cp * 0.48);   // エレベーターで上り下りしている間は、箱に乗っている（消えたり出たりしない）
    drawWorker(w.x * cell, w.y * cell, w);
  }
  drawTutPick(); drawTutBoss();   // はじめの手順
  if (S.tut2 && S.tut2.step !== 'wait') {
    const cells = S.tut2.step === 'kiln' && tool === 'machine' ? [...S.st.entries()].filter(([, v]) => v.type === 'conv').map(([k]) => ({ c: cOf(k), r: rOf(k), w: 1, h: 1 })) : tutCell ? [tutCell] : [];
    ctx.save(); ctx.globalAlpha = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() / 300)); ctx.strokeStyle = '#d0661f'; ctx.lineWidth = Math.max(2, cell * 0.07);
    for (const q of cells) ctx.strokeRect(q.c * cell + 2, q.r * cell + 2, q.w * cell - 4, q.h * cell - 4);
    ctx.restore();
  }

  // 設置中：置けないマスに斜線、カーソルの所に置く物の半透明の見本
  if (isBuildTool()) {
    // 置ける所（空いているマス）だけ薄い青で塗る
    ctx.fillStyle = THEME.okFill; ctx.strokeStyle = THEME.okLine; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    for (let r = Math.max(0, r0); r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (canPlaceAt(c, r) && !S.st.has(key(c, r))) { ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2); ctx.strokeRect(c * cell + 2.5, r * cell + 2.5, cell - 5, cell - 5); }
    }
    ctx.setLineDash([]);
    if (hover && inB(hover.c, hover.r) && canPlaceAt(hover.c, hover.r)) {
      ctx.save(); ctx.globalAlpha = 0.55;
      drawGhost(hover.c * cell, hover.r * cell);
      ctx.restore();
    }
  }
  if (popTarget && popTarget.type === 'pend') {   // 仮置き（選んだ向き）
    const pt = popTarget, px = pt.c * cell, py = pt.r * cell;
    ctx.save(); ctx.globalAlpha = 0.75;
    if (isDrillTool(pt.tid)) drawDrill(px, py, { dir: pt.dir, tid: pt.tid });
    else if (pt.tid.startsWith('m:')) drawMachine(px, py, { m: pt.tid.slice(2), dir: pt.dir, cur: null });
    else drawBeltCell(px, py, { type: pt.tid, dir: pt.dir, filter: pt.filter, side: pt.side }, 0, true);
    ctx.restore();
  }
  const p = popCell();
  if (p) {
    ctx.strokeStyle = THEME.sel; ctx.lineWidth = 2;
    ctx.strokeRect(p.c * cell + 1, p.r * cell + 1, cell - 2, cell - 2);
  }
  if (hover && inB(hover.c, hover.r) && tool !== 'pan' && tool !== 'none') {
    ctx.strokeStyle = THEME.hover; ctx.lineWidth = 2;
    ctx.strokeRect(hover.c * cell + 1, hover.r * cell + 1, cell - 2, cell - 2);
    if (tool === 'dig' && digSet && digSet.has(key(hover.c, hover.r))) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(cell * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(digCost(blk(hover.c, hover.r)), hover.c * cell + cell / 2, hover.r * cell + cell / 2);
    }
  }
  for (const [bx, by, bt] of bubbles) drawBubble(bx, by, bt);   // 吹き出し（いちばん前に）
  bubbles = [];
  const now = performance.now();
  S.pops = S.pops.filter(q => now - q.t0 < 1800);
  for (const q of S.pops) {
    const a = 1 - (now - q.t0) / 1800;
    ctx.globalAlpha = Math.min(1, a * 1.5);
    ctx.fillStyle = q.kind === 'cost' ? THEME.cost : THEME.sale;
    ctx.strokeStyle = THEME.popLine; ctx.lineWidth = 3;
    ctx.font = `bold ${Math.round(Math.min(cell * (q.kind === 'sale' ? 0.55 : 0.42), q.kind === 'sale' ? 20 : 15))}px sans-serif`;   // v0.97：控えめに（大きい画面でも20pxまで）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const yy = (q.wy - (1 - a) * 1.2) * cell;
    ctx.strokeText(q.text, q.wx * cell, yy); ctx.fillText(q.text, q.wx * cell, yy);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// 硬い岩盤：ひびの線と必要な掘削レベル（足りないと赤字）
// ---- 地面のドット絵（16×16。種類ごとに4通り、作ったら使い回す） ----
function seeded(n) { let s2 = (n * 9301 + 49297) % 233280; return () => (s2 = (s2 * 9301 + 49297) % 233280) / 233280; }
const TEX = {};
function texOf(k, make) {
  if (TEX[k]) return TEX[k];
  const c = document.createElement('canvas'); c.width = c.height = 16;
  make(c.getContext('2d')); return (TEX[k] = c);
}
// 土・石：ベタ塗りの上に重ねる、明るい点と暗い点の模様（色は深さで変わる下地のまま）
function groundTex(mat, v) {
  return texOf(mat + v, g => {
    const rnd = seeded((mat === 'stone' ? 50 : 10) + v * 7);
    if (mat === 'stone') {   // 小石：はっきりした丸い石（上に光、下に影）。土のマスと見分けがつくように
      for (let i = 0; i < 7; i++) {
        const x = Math.floor(rnd() * 12) + 1, y = Math.floor(rnd() * 11) + 1, w = 3 + Math.floor(rnd() * 2);
        g.fillStyle = 'rgba(30,34,44,.32)'; g.fillRect(x, y + 2, w, 1); g.fillRect(x + w, y + 1, 1, 1);
        g.fillStyle = 'rgba(210,216,228,.55)'; g.fillRect(x + 1, y, w - 1, 1);
        g.fillStyle = 'rgba(180,188,204,.35)'; g.fillRect(x, y + 1, w, 1);
      }
      return;   // 石のマスには土の粒を描かない
    }
    for (let i = 0; i < 20; i++) {   // 土の粒
      const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16), dark = rnd() < 0.62;
      g.fillStyle = dark ? 'rgba(70,45,20,.16)' : 'rgba(255,255,255,.18)';
      g.fillRect(x, y, rnd() < 0.4 ? 2 : 1, 1);
    }
  });
}
// 洞窟の壁：下地（caveColor）の上に重ねる、暗い穴と明るい岩肌の模様
function caveTex(v) {
  return texOf('cave' + v, g => {
    const rnd = seeded(300 + v * 13);
    for (let i = 0; i < 4; i++) {   // 岩肌のでこぼこ（上に光・下に影）
      const x = Math.floor(rnd() * 12) + 1, y = Math.floor(rnd() * 12) + 1, w = 2 + Math.floor(rnd() * 3);
      g.fillStyle = 'rgba(255,230,200,.08)'; g.fillRect(x, y, w, 1);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + 1, w, 1);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = rnd() < 0.7 ? 'rgba(0,0,0,.16)' : 'rgba(255,230,200,.07)';
      g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
    }
  });
}
// 草：マスの上の方に緑の帯。下のふちはギザギザ、ところどころ明るい葉先
function grassTex(v) {
  return texOf('grass' + v, g => {
    const rnd = seeded(90 + v * 5);
    for (let x = 0; x < 16; x++) {
      const d = 2 + Math.floor(rnd() * 3);
      g.fillStyle = THEME.grassMid; g.fillRect(x, 0, 1, d);
      g.fillStyle = THEME.grassDark; g.fillRect(x, d, 1, 1);
      if (rnd() < 0.35) { g.fillStyle = THEME.grassLight; g.fillRect(x, 0, 1, 1); }
    }
  });
}
// 岩盤：角ばった塊が組み合わさった、固そうな絵（塊ごとに少し明るさを変え、境目は暗く、境目の右下に光）
function rockTex(v) {
  return texOf('rock' + v, g => {
    const rnd = seeded(200 + v * 11), pts = [];
    for (let i = 0; i < 5; i++) pts.push([rnd() * 16, rnd() * 16, (rnd() - 0.5) * 0.22]);
    const near = (x, y) => {
      let a = 1e9, b2 = 1e9, ia = 0;
      pts.forEach(([px, py], i) => { const d = Math.max(Math.abs(px - x), Math.abs(py - y)); if (d < a) { b2 = a; a = d; ia = i; } else if (d < b2) b2 = d; });
      return [ia, b2 - a];
    };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const [i, gap] = near(x + 0.5, y + 0.5);
      let col = shade(THEME.rock, pts[i][2]);
      if (gap < 1) col = shade(THEME.rock, -0.45);                                   // 割れ目
      else if (near(x - 0.5, y - 0.5)[1] < 1) col = shade(THEME.rock, 0.28);          // 割れ目の右下は光る
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  });
}
// 岩盤の段：Lvの字は、段の真ん中にいちばん近い岩のマスに1つだけ
// 掘っているマスの残り時間（1時間以上は 時:分、それより短いと 分 か 秒）
function etaText(sec) {
  const T = tx();
  if (!isFinite(sec)) return '--';
  if (sec >= 360000) return T.etaD(Math.round(sec / 86400));
  if (sec >= 3600) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return `${h}:${String(m).padStart(2, '0')}`; }
  if (sec >= 60) return T.etaM(Math.ceil(sec / 60));
  return T.etaS(Math.max(1, Math.ceil(sec)));
}
function drawRockLabel(r, a) {
  let best = -1;
  for (let c = 0; c < COLS; c++) if (a[c] && a[c].mat === 'rock' && (best < 0 || Math.abs(c - (COLS - 1) / 2) < Math.abs(best - (COLS - 1) / 2))) best = c;
  if (best < 0) return;
  const b = a[best], cell = cp, x = best * cell + cell / 2, y = r * cell + cell / 2;
  ctx.font = `bold ${Math.round(cell * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText('Lv' + rockLv(b.layer), x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Lv' + rockLv(b.layer), x, y);
}
// コンベアのドット絵：16×16ドット（1ドットずつ）、4コマ。すっきり版：
// 左右の端1列は透明 → 細い枠（暗い線＋内側に光の線）→ ベルト。板は1ドットの細い線で、1コマに1ドットずつ流れる。
// 上下の端は付けない（縦につながると1本のベルトに見える）。上向き（↑）の絵を、向きに合わせて回して使う
// 横の位置（左右の端からの距離）→ 色。カーブでも同じ並びを使う
const convCol = (w, slat) => w < 1 ? null : w < 2 ? THEME.conv.rail : w < 3 ? THEME.conv.railHi : slat ? THEME.conv.slat : THEME.conv.belt;
const CONV_FRAMES = [0, 1, 2, 3].map(f => {
  const cv2 = document.createElement('canvas'); cv2.width = 16; cv2.height = 16;
  const g = cv2.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const col = convCol(Math.min(x, 15 - x), (y + f) % 4 === 0);
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return cv2;
});
const CONV_ROT = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
// カーブの絵：右から入って上へ出る形（16×16）。左から入る時は左右反転
const CURVE_FRAMES = [0, 1, 2, 3].map(f => {
  const cv2 = document.createElement('canvas'); cv2.width = 16; cv2.height = 16;
  const g = cv2.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 16, dy = y + 0.5, rr = Math.hypot(dx, dy);
    const sArc = (Math.atan2(dy, dx) - Math.PI / 2) * 8;   // 流れる向きの長さ
    const col = convCol(Math.min(rr, 16 - rr), (((f - Math.floor(sArc)) % 4) + 4) % 4 === 0);   // 角からの距離＝まっすぐの時の横の位置
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return cv2;
});
// その向きのマスへ資源を送り込んでいるコンベアか
function feedsInto(nc, nr, c, r) {
  const n = inB(nc, nr) && S.st.get(key(nc, nr));
  if (!isBelt(n)) return false;
  const [dx, dy] = DIRS[n.dir];
  return nc + dx === c && nr + dy === r;
}
// 横からだけ資源が来ているコンベアは、自動でカーブの絵にする
function curveSide(c, r, s) {
  if (s.type !== 'conv') return null;
  const [bx, by] = DIRS[OPP[s.dir]];
  if (feedsInto(c + bx, r + by, c, r)) return null;
  let side = null, n = 0;
  for (const sd of ['left', 'right']) {
    const [ax, ay] = DIRS[sd === 'left' ? CCW[s.dir] : CW[s.dir]];
    if (feedsInto(c + ax, r + ay, c, r)) { side = sd; n++; }
  }
  return n === 1 ? side : null;
}
const beltPh = new WeakMap();   // コンベアごとの縞々の進み具合（保存しない）
let drawDt = 0;                 // 前の画面からのゲームの時間（止めている間は0）
function drawBeltCell(x, y, s, speed, ghost, c, r) {
  const cell = cp;
  let ph = null;
  if (!ghost) { ph = (beltPh.get(s) || 0) + drawDt * speed * 16; if (!isFinite(ph)) ph = 0; beltPh.set(s, ph % 4000); }   // 数でなくなったら0から
  if (s.type === 'tee') { drawTee(x, y, s, speed, ph); return; }
  const side = ghost ? null : curveSide(c, r, s);
  if (side) {
    const f0 = Math.floor(ph !== null ? ph : S.time * speed * 16), f = isFinite(f0) ? ((f0 % 4) + 4) % 4 : 0;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(x + cell / 2, y + cell / 2); ctx.rotate(CONV_ROT[s.dir]); if (side === 'left') ctx.scale(-1, 1);
    ctx.drawImage(CURVE_FRAMES[f], -cell / 2, -cell / 2, cell, cell);
    ctx.restore();
  } else drawConvSprite(x, y, s.dir, speed, ph);
  if (s.type === 'sort') {   // 振り分ける側へ流れる部分：真ん中を先にして、出す側の端に向かって広がる三角形に、横向きのコンベアを描く
    const sd = s.side === 'left' ? CCW[s.dir] : CW[s.dir], [sx, sy] = DIRS[sd], h = cell * 0.46, cx = x + cell / 2, cy = y + cell / 2;
    ctx.save(); ctx.beginPath();
    ctx.moveTo(cx - sx * cell * 0.04, cy - sy * cell * 0.04);                    // 真ん中（先）
    ctx.lineTo(cx + sx * cell / 2 - sy * h, cy + sy * cell / 2 - sx * h);         // 出す側の端
    ctx.lineTo(cx + sx * cell / 2 + sy * h, cy + sy * cell / 2 + sx * h);
    ctx.closePath(); ctx.clip();
    drawConvSprite(x, y, sd, speed, ph);
    ctx.restore();
  }
  if (s.type === 'cross') { ctx.save(); ctx.globalAlpha = 0.7; drawConvSprite(x, y, CW[s.dir], speed, ph); ctx.restore(); }
  if (!side) drawChevron(x, y, s.dir, THEME.arrow);
  if (s.type === 'sort') {
    const sd = s.side === 'left' ? CCW[s.dir] : CW[s.dir], [sx, sy] = DIRS[sd];
    drawItemShape({ k: s.filter }, x + cell / 2 + sx * cell * 0.3, y + cell / 2 + sy * cell * 0.3, 0.8);
  }
}
// T字路の絵：向き（↑なら下から入る）の軸と、左右へ流れる横棒。┴ を上下にした「T」の形
function drawTee(x, y, s, speed, ph) {
  const cell = cp, cx = x + cell / 2, cy = y + cell / 2, w = cell * 0.56, a = CONV_ROT[s.dir];
  const part = (rx, ry, rw, rh, d) => {   // 回した座標で四角を切り抜いて、その向きのコンベアを描く
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.rotate(-a); ctx.translate(-cx, -cy); ctx.clip();
    drawConvSprite(x, y, d, speed, ph); ctx.restore();
  };
  part(-w / 2, -w / 2, w, cell / 2 + w / 2, s.dir);          // 軸（入ってくる側）
  part(-cell / 2, -w / 2, cell / 2, w, CCW[s.dir]);          // 横棒の左
  part(0, -w / 2, cell / 2, w, CW[s.dir]);                   // 横棒の右
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);          // 形がわかるように、ふちの線
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = Math.max(1, cell * 0.03);
  ctx.beginPath(); ctx.moveTo(-cell / 2, -w / 2); ctx.lineTo(cell / 2, -w / 2); ctx.lineTo(cell / 2, w / 2); ctx.lineTo(w / 2, w / 2); ctx.lineTo(w / 2, cell / 2);
  ctx.lineTo(-w / 2, cell / 2); ctx.lineTo(-w / 2, w / 2); ctx.lineTo(-cell / 2, w / 2); ctx.closePath(); ctx.stroke();
  // 矢印：左右の端に ← →、軸に ↑
  ctx.fillStyle = THEME.arrow; const t = cell * 0.09;
  const tri = (px, py, dx, dy) => { ctx.beginPath(); ctx.moveTo(px + dx * t, py + dy * t); ctx.lineTo(px - dx * t - dy * t, py - dy * t + dx * t); ctx.lineTo(px - dx * t + dy * t, py - dy * t - dx * t); ctx.closePath(); ctx.fill(); };
  tri(-cell * 0.33, 0, -1, 0); tri(cell * 0.33, 0, 1, 0); tri(0, cell * 0.3, 0, -1);
  ctx.restore();
}
function drawConvSprite(x, y, d, speed, ph) {
  const f0 = fpsCtl.lite >= 2 ? 0 : Math.floor(ph !== undefined && ph !== null ? ph : S.time * speed * 16), f = isFinite(f0) ? ((f0 % 4) + 4) % 4 : 0;   // いつも 0〜3   // 速さに合わせてコマを進める（1コマ＝1ドット）。重い時は止める
  blitCell(cachedCell(`cv${d}${f}`, () => {   // 向きごと・コマごとに回した絵を覚えておく
    const cell = cp; ctx.translate(cell / 2, cell / 2); ctx.rotate(CONV_ROT[d]);
    ctx.drawImage(CONV_FRAMES[f], -cell / 2, -cell / 2, cell, cell);
  }), x, y);
}
// 向きの小さな印（止まっている時も向きが分かるように、控えめに）
function drawChevron(x, y, d, color) {
  ctx.drawImage(cachedCell(`ch${d}${color}`, () => {
    const cell = cp;
    ctx.translate(cell / 2, cell / 2); ctx.rotate(CONV_ROT[d]);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, cell * 0.05); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-cell * 0.12, cell * 0.05); ctx.lineTo(0, -cell * 0.08); ctx.lineTo(cell * 0.12, cell * 0.05); ctx.stroke();
  }), x, y, cp, cp);
}
function hatch(x, y, cell) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, cell, cell); ctx.clip();
  ctx.fillStyle = THEME.hatchFill; ctx.fillRect(x, y, cell, cell);
  const step = Math.max(6, cell / 4);
  ctx.lineWidth = Math.max(1.5, cell * 0.05);
  ctx.strokeStyle = THEME.hatch; ctx.beginPath();
  for (let d = -cell; d < cell; d += step) { ctx.moveTo(x + d, y + cell); ctx.lineTo(x + d + cell, y); }
  ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = THEME.hatchHi; ctx.beginPath();
  for (let d = -cell; d < cell; d += step) { ctx.moveTo(x + d + 2, y + cell); ctx.lineTo(x + d + cell + 2, y); }
  ctx.stroke();
  ctx.restore();
}
// レベルの印の色の並び：100ごとに金・10ごとに青・残りはふつう
function lvMarks(lv) {
  const a = [];
  for (let i = 0; i < Math.floor(lv / 100); i++) a.push('#e0b020');
  for (let i = 0; i < Math.floor((lv % 100) / 10); i++) a.push('#3a7bd5');
  for (let i = 0; i < lv % 10; i++) a.push(THEME.level);
  return a;
}
function drawLvPix(x, y, w, lv) {   // x,y＝並べ始め、w＝本体の幅
  if (!lv) return;
  const mk = lvMarks(lv), d = Math.max(1 / (window.devicePixelRatio || 1), cp / 48), n = Math.min(mk.length, Math.floor(w / (d * 3)));   // 小さい時はモニターの1ドット、拡大すると車体に合わせて大きく
  for (let i = 0; i < n; i++) { ctx.fillStyle = mk[i]; ctx.fillRect(x + i * d * 3, y, d, d); }
}
// コンベアのレベル：小さな四角を、縦のコンベアなら縦に、横なら横に並べる（左上の端に沿って）
// 1マスの大きさの絵を一度だけ作って覚えておく（同じ印を毎回1つずつ描くと、スマホでは重い）
const sprC = new Map();
function cachedCell(key, paint) {
  const dpr = viewDpr(), cs = Math.max(4, Math.round(cp)), k = key + '|' + cs + '|' + dpr;
  let c = sprC.get(k);
  if (!c) {
    if (sprC.size > 800) sprC.clear();
    c = document.createElement('canvas'); c.width = c.height = Math.ceil(cs * dpr);
    const keep = [ctx, cp]; ctx = c.getContext('2d'); cp = cs; ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
    try { paint(); } finally { [ctx, cp] = keep; }
    sprC.set(k, c);
  }
  return c;
}
const blitCell = (c, x, y) => { ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x, y, cp, cp); ctx.imageSmoothingEnabled = true; };
function drawBeltLv(x, y, s) {
  if (!s.lv) return;
  const vert = s.dir === 'up' || s.dir === 'down';
  blitCell(cachedCell(`bl${s.lv}${vert ? 'v' : 'h'}`, () => {
    const d = Math.max(1.5, cp * 0.05), g = d * 1.8;
    ctx.fillStyle = THEME.level;
    for (let i = 0; i < s.lv; i++) ctx.fillRect(cp * 0.06 + (vert ? 0 : i * g), cp * 0.06 + (vert ? i * g : 0), d, d);
  }), x, y);
}
function drawLevel(x, y, lv) {
  if (!lv) return;
  const mk = lvMarks(lv).slice(0, 9), n = mk.length;
  ctx.drawImage(cachedCell('lv' + lv, () => {
    const cell = cp, r = Math.max(1.2, cell * 0.042);   // v0.97：丸は小さく
    ctx.strokeStyle = THEME.levelLine; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) { ctx.fillStyle = mk[i]; ctx.beginPath(); ctx.arc(cell * 0.12 + i * r * 2.6, cell * 0.12, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }), x, y, cp, cp);
}
// 作業員：「i」の形（丸い頭＋縦の体）。疲れると頭の色がくすむ
// 作業員のドット絵（参考画像「New Piskel」：8×8・2コマ・0.17秒ごと）。a=ヘルメット b=肌 c=服 d=くつ
const WORKER_PIX = [
  ['...aa...', '...bb...', '....c...', '..bcccb.', '....c...', '....c...', '...c.c..', '..d...d.'],
  ['...aa...', '...bb...', '....c...', '...ccc..', '...ccc..', '...bcb..', '....c...', '...dd...'],
];
const WORKER_COL = { a: '#efff62', b: '#c9b57a', c: '#7ac5c9', d: '#000000' };
const workerFrames = col => WORKER_PIX.map(rows => {
  const c2 = document.createElement('canvas'); c2.width = c2.height = 8;
  const g = c2.getContext('2d');
  rows.forEach((rw, y) => [...rw].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); } }));
  return c2;
});
const WORKER_FR = workerFrames(WORKER_COL);
const BELT_PIX = ['...aa...', '...bb...', '..cccc..', '..cccc..', '..bccb..'];   // コンベアについた作業員の上半身（8×5）：気を付け（動かない）
const BELT_FR = (() => { const c2 = document.createElement('canvas'); c2.width = 8; c2.height = 5; const g = c2.getContext('2d'); BELT_PIX.forEach((rw, y) => [...rw].forEach((ch, x) => { if (WORKER_COL[ch]) { g.fillStyle = WORKER_COL[ch]; g.fillRect(x, y, 1, 1); } })); return c2; })();
// コンベアの横の縁に立つ：縦のコンベアは右の縁、横のコンベアは奥（上）の縁から上半身がのぞく
function drawBeltWorker(x, y, s) {
  const u = cp * 0.42 / 8, w = 8 * u, h = 5 * u, vert = s && (s.dir === 'up' || s.dir === 'down');
  const px = vert ? x + cp - w * 0.75 : x + cp / 2 - w / 2, py = vert ? y + cp / 2 - h / 2 : y + cp * 0.14 - h * 0.55;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(BELT_FR, Math.round(px), Math.round(py), w, h); ctx.imageSmoothingEnabled = true;
}
const BOSS_FR = workerFrames({ ...WORKER_COL, a: '#d8402c' });   // 社長：赤いヘルメット
// お客さん：ヘルメットではなく髪。服と髪の色は人ごとにいろいろ（色の組み合わせごとに1回だけ作る）
const GUEST_HAIR = ['#2b2420', '#5e4026', '#8a5a2a', '#c9a46e', '#9a9a9a', '#2a2a2a'];
const GUEST_CLOTH = ['#d8543c', '#3f7cc4', '#e8c34a', '#5aa36a', '#9a7bd0', '#f08a3c', '#e86a8a', '#4a4a50', '#6fa9d6', '#eeeeea'];
const GUEST_FR = new Map();
function drawGuest(cx, footY, size, frame, car) {
  if (car.gh === undefined) { car.gh = Math.floor(Math.random() * GUEST_HAIR.length); car.gc = Math.floor(Math.random() * GUEST_CLOTH.length); }
  const id = car.gh + ':' + car.gc;
  if (!GUEST_FR.has(id)) GUEST_FR.set(id, workerFrames({ ...WORKER_COL, a: GUEST_HAIR[car.gh], c: GUEST_CLOTH[car.gc] }));
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(GUEST_FR.get(id)[frame], Math.round(cx - size / 2), Math.round(footY - size), size, size);
  ctx.restore();
}
// 社長の横幅：画面の本当のドット単位で、じわじわ広がる
const bossW = size => { const dpr = window.devicePixelRatio || 1; return Math.round(size * (1 + (S.bossFat || 0)) * dpr) / dpr; };
function drawWorkerSprite(cx, footY, size, frame, alpha, boss) {
  ctx.save(); ctx.imageSmoothingEnabled = false; if (alpha < 1) ctx.globalAlpha = alpha;
  const w = boss ? bossW(size) : size;
  ctx.drawImage((boss ? BOSS_FR : WORKER_FR)[frame], cx - w / 2, Math.round(footY - size), w, size);
  ctx.restore();
}
// 作業中の印：作業員の頭（ヘルメットと顔）だけを、マスの中の右上に小さく
function drawWorkerHead(x, y, st, w2) {
  const s = Math.max(4, Math.round(cp * 0.14));
  // 基本はマスの右上。ドリルは刃の反対側（本体側）に来るよう、向きに合わせて回す（下向き＝右上）
  let lx = 0.42 - s / cp / 2, ly = -0.42 + s / cp / 2;          // マス中心からの位置（マス幅=1）
  if (st && st.type === 'drill') {
    const a = ANGLE[st.dir] || 0, c = Math.cos(a), n = Math.sin(a);
    [lx, ly] = [lx * c - ly * n, lx * n + ly * c];
  }
  const hx = Math.round(x + cp * (0.5 + lx) - s / 2), hy = Math.round(y + cp * (0.5 + ly) - s / 2);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage((w2 && w2.boss ? BOSS_FR : WORKER_FR)[1], 3, 0, 2, 2, hx, hy, s, s);   // 8×8の絵のうち、頭の2×2ドット
  ctx.restore();
}
// 吹き出し（作業員などの頭の上。数秒で消える）
function bubble(o, text, sec = 2.2) { o.bub = { text, until: performance.now() + sec * 1000 }; }
function drawBubble(x, y, text) {   // x,y＝吹き出しのしっぽの先（画面座標）
  const fs = Math.round(clamp(cp * 0.26, 10, 15)); ctx.font = `bold ${fs}px sans-serif`;
  const w = ctx.measureText(text).width + fs * 0.9, h = fs * 1.5, bx = x - w / 2, by = y - h - fs * 0.45;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, h * 0.35) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - fs * 0.3, by + h - 0.5); ctx.lineTo(x, y); ctx.lineTo(x + fs * 0.3, by + h - 0.5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - fs * 0.3, by + h); ctx.lineTo(x, y); ctx.lineTo(x + fs * 0.3, by + h); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, by + h / 2 + 0.5);
}
function drawWorker(x, y, w) {   // x,y＝マスの中心（画面座標）。小さく表示
  const tgt = S.time - (w.vT || -9) < 0.4 ? -0.5 : 0;   // 縦の移動中は、マスの左の線へ（なめらかに寄せる）
  w.lx = (w.lx || 0) + (tgt - (w.lx || 0)) * 0.25; if (Math.abs(w.lx) < 0.01) w.lx = 0;
  x += w.lx * cp;
  const moving = w.path && w.path.length, working = w.state === 'work';
  const f = fpsCtl.lite >= 1 ? 0 : moving || working ? Math.floor(S.time / 0.17) % 2 : 1;   // 重い時は大の字（1枚）のまま動く
  const tired = w.stamina / maxStamina(w) < 0.25;
  drawWorkerSprite(x, y + cp * 0.48, cp * 0.42, f, tired ? 0.6 : 1, w.boss);
  if (w.bub) { if (performance.now() > w.bub.until) w.bub = null; else bubbles.push([x, y + cp * 0.48 - cp * 0.42 * 1.05, w.bub.text]); }   // 吹き出しは最後にまとめて描く
}
let bubbles = [];
// 資源・製品のドット絵（16×16）。形ごとの型に、資源の色（ふち・本体・光）を塗る
const SPR_CACHE = new Map();
function shade(hex, k) {   // 明るく（k>0）・暗く（k<0）
  const n = parseInt(hex.slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255];
  return '#' + ch.map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, '0')).join('');
}
function shapeMask(sh) {
  const m = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const X = x + 0.5, Y = y + 0.5;
    let on = false;
    if (sh === 'circle') on = ((X - 8) ** 2) / 34 + ((Y - 8.6) ** 2) / 26 <= 1 && !(x === 12 && y < 7);   // ごつごつした塊
    else if (sh === 'small') on = [[5, 10, 3], [11, 11, 2.6], [8, 6, 2.6]].some(([cx, cy, rr]) => (X - cx) ** 2 + (Y - cy) ** 2 <= rr * rr);
    else if (sh === 'rect') on = x >= 2 && x <= 13 && y >= 5 && y <= 11;
    else if (sh === 'bar') on = y >= 6 && y <= 11 && x >= 2 + (11 - y) * 0.5 && x <= 13 - (11 - y) * 0.5;
    else if (sh === 'square') on = x >= 3 && x <= 12 && y >= 3 && y <= 12;
    else if (sh === 'bone') on = (y >= 7 && y <= 8 && x >= 4 && x <= 11) || [[3.5, 5.6], [3.5, 9.6], [12, 5.6], [12, 9.6]].some(([cx, cy]) => (X - cx) ** 2 + (Y - cy) ** 2 <= 3.2);   // 骨（化石）
    else if (sh === 'coil') { const rr = Math.hypot(X - 8, Y - 8.5); on = (rr >= 3.2 && rr <= 5.6) || (x >= 12 && x <= 14 && y === 4); }   // 巻いたワイヤー
    else if (sh === 'gem') on = Math.abs(X - 8) * 1.05 + Math.abs(Y - 8) * (Y < 6.5 ? 2.2 : 0.95) <= 7 && Y > 2.5;
    else if (sh === 'pot') on = (y >= 7 && y <= 13 && ((X - 8) ** 2) / 30 + ((Y - 7) ** 2) / 42 <= 1) || (y === 6 && x >= 2 && x <= 13) || ((x === 1 || x === 14) && y >= 7 && y <= 8) || ((x === 0 || x === 15) && y === 7);   // 鍋（取っ手つき）
    else if (sh === 'plate') on = y >= 6 && y <= 10 && x >= 1 + (10 - y) * 0.6 && x <= 12 + (10 - y) * 0.6;   // 板（ななめから見た薄い板）
    else if (sh === 'mesh') on = x >= 2 && x <= 13 && y >= 2 && y <= 13 && ((x - 2) % 3 === 0 || (y - 2) % 3 === 0 || x === 13 || y === 13);   // 金網
    else if (sh === 'cutlery') on = (x === 4 && y >= 6 && y <= 14) || (y >= 2 && y <= 5 && (x === 3 || x === 5) ) || (y === 5 && x === 4) || ((X - 11) ** 2 / 4.5 + (Y - 4.5) ** 2 / 7 <= 1) || (x === 11 && y >= 7 && y <= 14);   // フォークとスプーン
    else if (sh === 'gear') { const rr = Math.hypot(X - 8, Y - 8), th = Math.atan2(Y - 8, X - 8); on = rr >= 2 && (rr <= 4.8 || (rr <= 6.8 && Math.cos(th * 8) > 0.25)); }   // 歯車
    else if (sh === 'jar') on = (x >= 6 && x <= 9 && y >= 2 && y <= 4) || (y === 2 && x >= 5 && x <= 10) || ((X - 8) ** 2 / 28 + (Y - 9.5) ** 2 / 22 <= 1);   // 陶器（つぼ）
    else if (sh === 'cup') on = (y >= 3 && y <= 11 && x >= 3 + (y - 3) * 0.3 && x <= 12 - (y - 3) * 0.3) || (y >= 12 && y <= 13 && x >= 7 && x <= 8) || (y === 14 && x >= 5 && x <= 10);   // 杯
    else if (sh === 'block') on = x >= 2 && x <= 13 && y >= 4 && y <= 12 && !((x >= 4 && x <= 6 || x >= 9 && x <= 11) && y >= 7 && y <= 9);   // 穴あきブロック
    else if (sh === 'wave') on = x >= 1 && x <= 14 && y >= 6 + Math.round(Math.sin(x / 1.6) * 1.2) && y <= 10 + Math.round(Math.sin(x / 1.6) * 1.2);   // 瓦（波形）
    else if (sh === 'hammer') on = (x >= 3 && x <= 12 && y >= 3 && y <= 6) || (x >= 7 && x <= 8 && y >= 7 && y <= 14);   // かなづち
    else if (sh === 'ring') { const rr = Math.hypot(X - 8, Y - 9.5); on = (rr >= 2.6 && rr <= 4.9) || Math.abs(X - 8) + Math.abs(Y - 3.5) <= 2.4; }   // 指輪
    else if (sh === 'shell') { const rr = Math.hypot(X - 8, Y - 8.5); on = rr <= 6 && !(rr > 1.5 && rr < 2.6 && Math.atan2(Y - 8.5, X - 8) > -1.2) && !(rr > 3.6 && rr < 4.4 && Math.atan2(Y - 8.5, X - 8) < 1.8); }   // アンモナイト（うず）
    else if (sh === 'haniwa') on = ((X - 8) ** 2 / 14 + (Y - 4.5) ** 2 / 10 <= 1 && !((x === 6 || x === 9) && y === 4) && !(x >= 7 && x <= 8 && y === 6)) || (x >= 5 && x <= 10 && y >= 7 && y <= 14) || ((x === 3 || x === 12) && y >= 8 && y <= 10);   // 埴輪（目と口の穴）
    else if (sh === 'mummy') on = x >= 5 && x <= 10 && y >= 1 && y <= 14 && !(y === 1 && (x === 5 || x === 10));   // ミイラ（包帯は下で）
    else if (sh === 'bag') on = (((X - 8) ** 2) / 30 + ((Y - 10) ** 2) / 22 <= 1) || (x >= 6 && x <= 9 && y >= 2 && y <= 5);
    m.push(on);
  }
  return m;
}
function itemSprite(k, of) {
  const id = k + (of || '');
  if (SPR_CACHE.has(id)) return SPR_CACHE.get(id);
  const def = ITEMS[k], sh = def.s;
  const base = k === 'bag' ? '#cdbb8e' : def.c[0], line = k === 'bag' ? '#6d5f3c' : def.c[1];
  const mask = shapeMask(sh), c2 = document.createElement('canvas'); c2.width = c2.height = 16;
  const g = c2.getContext('2d'), at = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && mask[y * 16 + x];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!at(x, y)) continue;
    const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
    let col = base;   // 枠線は付けない（拡大縮小しても線の太さがばらつかないように）
    if (!at(x - 1, y - 1) || (!edge && (at(x - 2, y) === false || at(x, y - 2) === false))) col = shade(base, 0.4);   // 左上の光
    if (!at(x + 1, y + 1) && at(x - 1, y)) col = shade(base, -0.22);                                        // 右下の影
    if (sh === 'rect' && !edge && y === 8) col = shade(base, -0.3);                                        // レンガの目地
    if (sh === 'gem' && !edge && (x === 8 || y === 6)) col = shade(base, 0.6);                             // 宝石の面
    if (sh === 'pot' && y === 6) col = shade(base, -0.35);                                                 // 鍋のふち
    if (sh === 'plate' && y === 10) col = shade(base, -0.3);                                               // 板の厚み
    if (sh === 'mummy' && (y % 3 === 0)) col = shade(base, -0.25);                                         // 包帯の線
    if (sh === 'ring' && Math.abs(x + 0.5 - 8) + Math.abs(y + 0.5 - 3.5) <= 2.4) col = y < 3 ? '#e8f8ff' : '#9fd6f0';   // 指輪の石
    if (sh === 'cup' && k === 'glass' && !edge) col = shade(base, 0.25);                                  // ガラスは明るく
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  if (k === 'bag' && of) { g.fillStyle = ITEMS[of].c[0]; g.fillRect(6, 9, 4, 3); g.fillStyle = ITEMS[of].c[1]; g.fillRect(6, 12, 4, 1); }   // 中身の色
  if (k === 'bag') { g.fillStyle = line; g.fillRect(5, 5, 6, 1); }   // 袋のひも
  SPR_CACHE.set(id, c2);
  return c2;
}
// くっついた山の絵（FPSが保てない時だけ使う）：資源の絵を重ねて作り、種類×大きさごとに1回だけ作って取っておく
const CLUMP_CACHE = new Map();
function clumpSprite(k, n) {
  const b = n >= 100 ? 2 : n >= 30 ? 1 : 0, id = k + ':' + b;
  if (CLUMP_CACHE.has(id)) return CLUMP_CACHE.get(id);
  const c2 = document.createElement('canvas'); c2.width = c2.height = 48;
  const g = c2.getContext('2d'); g.imageSmoothingEnabled = false;
  const num = [10, 22, 40][b], hgt = [0.35, 0.6, 0.9][b], spr = itemSprite(k);
  let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < num; i++) {   // 下から積む（山の形：上ほど細い）
    const yv = Math.pow(rnd(), 1.4) * hgt, half = (1 - yv / Math.max(hgt, 0.01) * 0.7) * 0.42;
    const px = 24 + (rnd() * 2 - 1) * half * 48, py = 44 - yv * 40;
    g.drawImage(spr, Math.round(px - 8), Math.round(py - 8), 16, 16);
  }
  CLUMP_CACHE.set(id, c2);
  return c2;
}
function drawItemShape(it, x, y, scale) {
  const sz = cp * 0.42 * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(itemSprite(it.k, it.of), Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
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
// ---- ドット絵（sprites.js。ドット編集ツールで直した物はブラウザに保存され、こちらが優先） ----
const SPRITE_DATA = (() => {
  const base = window.DF_SPRITES || { palette: {}, sprites: {} };
  let over = {};
  try { over = JSON.parse(localStorage.getItem('digfactory.sprites') || '{}'); } catch (e) { over = {}; }
  return { palette: Object.assign({}, base.palette, over.palette || {}), sprites: Object.assign({}, base.sprites, over.sprites || {}) };
})();
const SPR_CV = {};
function sprite(name) {
  if (SPR_CV[name] !== undefined) return SPR_CV[name];
  const rows = SPRITE_DATA.sprites[name];
  if (!rows) return (SPR_CV[name] = null);
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const col = SPRITE_DATA.palette[ch]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
  return (SPR_CV[name] = c);
}
function drawMachine(x, y, m) {
  const cell = cp, sp = sprite(m.m);
  if (sp) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sp, x, y, cell, cell); ctx.restore(); }
  else {
    ctx.fillStyle = THEME.machBg; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeStyle = THEME.machLine; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
    glyph(tx().glyph[m.m], x, y + cell * 0.02, THEME.machText, 0.38);
  }
  if (m.cur && m.type === 'machine' && !(fpsCtl.lite >= 2)) drawMachAnim(x, y, m);   // 加工中のアニメーション（重い時は止める）
  ctx.drawImage(cachedCell('mo' + m.dir, () => {   // 出口の矢印
    const [dx, dy] = DIRS[m.dir];
    ctx.translate(cp / 2 + dx * cp * 0.38, cp / 2 + dy * cp * 0.38); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = THEME.machOut; ctx.beginPath(); ctx.moveTo(cp * 0.08, 0); ctx.lineTo(-cp * 0.05, -cp * 0.08); ctx.lineTo(-cp * 0.05, cp * 0.08); ctx.closePath(); ctx.fill();
  }), x, y, cell, cell);
  if (m.cur) {
    const def = MACHINES[m.m];
    ctx.fillStyle = THEME.gaugeBg; ctx.fillRect(x + 4, y + cell - 7, cell - 8, 3);
    ctx.fillStyle = THEME.machProg; ctx.fillRect(x + 4, y + cell - 7, (cell - 8) * m.prog / def.time, 3);
  }
}
// 加工中のアニメーション（点滅はさせず、形と動きで見せる）。速さは加工の速さ（作業員がいないとゆっくり）
const machPh = new WeakMap();
function drawMachAnim(x, y, m) {
  const cell = cp, ph = (machPh.get(m) || 0) + drawDt * valOf(m) * workFactor(m) * 6;
  machPh.set(m, ph % 6283);
  const cx = x + cell / 2, cy = y + cell / 2;
  ctx.save();
  const flame = (px, py, w, h) => {   // 炎：3本の舌が、高さだけゆらゆら変わる（明るさは変えない）
    for (let i = 0; i < 3; i++) {
      const hh = h * (0.65 + 0.35 * Math.sin(ph * 1.7 + i * 2.1)), fx = px + (i - 1) * w * 0.32;
      ctx.fillStyle = i === 1 ? '#ffd34d' : '#f08a3c';
      ctx.beginPath(); ctx.moveTo(fx - w * 0.18, py); ctx.lineTo(fx, py - hh); ctx.lineTo(fx + w * 0.18, py); ctx.closePath(); ctx.fill();
    }
  };
  switch (m.m) {
    case 'kiln': case 'smelter': flame(cx, y + cell * 0.86, cell * 0.42, cell * 0.22); break;
    case 'crusher': {
      for (const sx of [-1, 1]) { ctx.save(); ctx.translate(cx + sx * cell * 0.13, cy + cell * 0.08); ctx.rotate(sx * ph); ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = Math.max(1, cell * 0.04); ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * cell * 0.11, Math.sin(a) * cell * 0.11); } ctx.stroke(); ctx.restore(); }
      break;
    }
    case 'cutter': case 'drawer': case 'polisher': {
      ctx.save(); ctx.translate(cx + cell * 0.2, cy - cell * 0.16); ctx.rotate(ph * (m.m === 'polisher' ? 1.4 : 2));
      const r = cell * 0.11;
      ctx.fillStyle = m.m === 'polisher' ? '#bfe9ff' : '#d8d2c4'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = Math.max(1, cell * 0.03);
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4); ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); } ctx.stroke();
      ctx.restore(); break;
    }
    case 'factory': {   // ハンマーが上下する
      const hy = cy - cell * 0.12 + Math.abs(Math.sin(ph * 1.2)) * cell * 0.12;
      ctx.fillStyle = '#2b2b2e'; ctx.fillRect(cx - cell * 0.02, y + cell * 0.12, cell * 0.04, hy - y - cell * 0.12); ctx.fillRect(cx - cell * 0.1, hy, cell * 0.2, cell * 0.08);
      break;
    }
    case 'washer': {    // 泡が上がる
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#6fa9d6'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const t = ((ph * 0.25 + i / 3) % 1), bx = cx + (i - 1) * cell * 0.16, by = y + cell * (0.78 - t * 0.5); ctx.beginPath(); ctx.arc(bx, by, cell * (0.03 + 0.02 * t), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'bagger': {    // 袋がゆれる
      ctx.save(); ctx.translate(cx, y + cell * 0.72); ctx.rotate(Math.sin(ph * 1.5) * 0.25);
      ctx.fillStyle = '#d8c9a0'; ctx.strokeStyle = '#6d5f3c'; ctx.lineWidth = 1; ctx.fillRect(-cell * 0.08, -cell * 0.16, cell * 0.16, cell * 0.16); ctx.strokeRect(-cell * 0.08, -cell * 0.16, cell * 0.16, cell * 0.16);
      ctx.restore(); break;
    }
    case 'atelier': {   // 小さな光が作業台のまわりを回る
      const a = ph * 1.2, px = cx + Math.cos(a) * cell * 0.18, py = cy + Math.sin(a) * cell * 0.1;
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(px, py - cell * 0.06); ctx.lineTo(px + cell * 0.02, py); ctx.lineTo(px, py + cell * 0.06); ctx.lineTo(px - cell * 0.02, py); ctx.closePath(); ctx.fill();
      break;
    }
    case 'adit': {      // 横穴：資源が穴の奥から、こちらに向かって大きくなって出てくる
      const t = Math.min(1, Math.max(0, (m.prog / MACHINES.adit.time - 0.5) / 0.5));
      if (t > 0) drawItemShape({ k: m.cur.k }, cx, cy + cell * 0.02, 0.15 + 1.05 * t * t);
      break;
    }
  }
  ctx.restore();
}
// エレベーター：マスの左右に縦のレールと、横の桟（ほかの物の上に重ねて描く）
function drawElev(x, y) {
  const cell = cp, lw = Math.max(2, cell * 0.07);
  ctx.fillStyle = 'rgba(40,44,52,.28)'; ctx.fillRect(x + cell * 0.12, y, cell * 0.76, cell);                 // 縦穴の影
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(x + cell * 0.12, y, lw, cell); ctx.fillRect(x + cell * 0.88 - lw, y, lw, cell);   // レール
  ctx.fillStyle = '#f0a030'; for (let i = 0; i < 2; i++) { const yy = y + cell * (0.25 + i * 0.5); ctx.fillRect(x + cell * 0.12, yy, cell * 0.76, Math.max(1, lw * 0.5)); }   // 黄色の桟（目立つように）
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(x + cell * 0.5 - 0.5, y, 1, cell);                                  // ワイヤー
}
// エレベーターに乗っている作業員：作業員をちょうど囲む箱
function drawElevCar(px, footY) {
  const cell = cp, w = cell * 0.5, h = cell * 0.62;
  ctx.fillStyle = 'rgba(240,160,48,.25)'; ctx.fillRect(px - w / 2, footY - h, w, h);
  ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = Math.max(1.5, cell * 0.05); ctx.strokeRect(px - w / 2, footY - h, w, h);
  ctx.fillStyle = '#f0a030'; ctx.fillRect(px - w / 2, footY - h, w, Math.max(2, cell * 0.06));
}
// 置く物の見本（設置中のカーソル位置）
function drawLamp(x, y, glow) {
  const cell = cp, cx = x + cell / 2, cy = y + cell * 0.18;
  if (glow) { const g2 = ctx.createRadialGradient(cx, cy, cell * 0.2, cx, cy, cell * 2.4); g2.addColorStop(0, 'rgba(255,220,150,.22)'); g2.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g2; ctx.fillRect(cx - cell * 2.4, cy - cell * 2.4, cell * 4.8, cell * 4.8); }   // やわらかい光（一定）
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(cx - cell * 0.02, y, cell * 0.04, cell * 0.1);
  ctx.fillStyle = '#5a5d64'; ctx.beginPath(); ctx.moveTo(cx - cell * 0.14, cy); ctx.lineTo(cx + cell * 0.14, cy); ctx.lineTo(cx + cell * 0.08, y + cell * 0.08); ctx.lineTo(cx - cell * 0.08, y + cell * 0.08); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(cx, cy + cell * 0.02, cell * 0.06, 0, Math.PI * 2); ctx.fill();
}
function drawGhost(x, y) {
  if (tool === 'lamp') { drawLamp(x, y, false); return; }
  if (isDrillTool(tool)) { drawDrill(x, y, { dir: 'down', tid: tool }); return; }
  if (tool === 'lab') { drawLabAt(x / cp, true); return; }
  if (isFacTool(tool)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite(tool), x, y, cp, cp); return; }
  if (tool === 'pipe') { drawPipe(x, y, -9, -9, true); return; }
  if (tool === 'elev') { drawElev(x, y); return; }
  const gd = dir === 'auto' ? (tool === 'conv' ? autoDir(Math.round(x / cp), Math.round(y / cp)) : 'right') : dir;
  if (tool === 'machine') { drawMachine(x, y, { m: machSel, dir: gd, cur: null }); return; }
  if (!['conv', 'sort', 'tee', 'cross'].includes(tool)) return;
  drawBeltCell(x, y, { type: tool, dir: gd, filter: 'iron', side: 'left' }, 0, true);
}
// ドリルのドット絵（16×16・下向き）：上が本体、下が刃。掘っている時は刃の模様が回る
function makeDrillFrames(body, light) {
  return [0, 1].map(f => {
    const c2 = document.createElement('canvas'); c2.width = 16; c2.height = 16;
    const g = c2.getContext('2d'), px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const K = '#2b2b2e', S1 = '#c4c8cc', S2 = '#eef0f2', S3 = '#7a7e84';
    for (let y = 0; y <= 6; y++) for (let x = 1; x <= 14; x++) {          // 本体
      if ((y === 0 || y === 6) && (x === 1 || x === 14)) continue;
      const edge = y === 0 || y === 6 || x === 1 || x === 14;
      px(x, y, edge ? K : y === 1 || x === 2 ? light : body);
    }
    for (let x = 4; x <= 11; x++) px(x, 4, K);                             // 通気口
    const span = [[4, 11], [4, 11], [5, 10], [5, 10], [6, 9], [6, 9], [7, 8], [7, 8], [7, 8]];
    span.forEach(([a1, b1], i) => {                                        // 刃（らせん）
      const y = 7 + i;
      for (let x = a1; x <= b1; x++) px(x, y, x === a1 || x === b1 ? K : ((x + y + f) % 3 === 0 ? S2 : (x + y + f) % 3 === 1 ? S1 : S3));
    });
    return c2;
  });
}
const DRILL_FR = { run: makeDrillFrames(THEME.drill, '#f1a46a'), stuck: makeDrillFrames('#9a9a9a', '#c4c4c4') };
// アタックの動き（マスの大きさに対する前後のずれ）：当たった直後にぐっと前へ・すぐ戻り・次の直前にすっと引く
function drillPunch(s) {
  if (s.stuck || s.off || fpsCtl.lite >= 2) return 0;
  const iv = drillIv(s), t = S.time - (s.hit || -99);
  if (t < 0 || t > iv * 1.5) return 0;
  if (t < 0.05) return 0.12 * (t / 0.05);                       // がっ
  if (t < 0.14) return 0.12 * (1 - (t - 0.05) / 0.09);          // 戻る
  if (t > iv - 0.12 && t < iv) return -0.07 * ((t - (iv - 0.12)) / 0.12);   // すっ（引く）
  return 0;
}
let dusts = [];   // 土の粒（保存しない）
function dust(tc, tr, dir, g) {
  const [dx, dy] = DIRS[dir], col = g.mat === 'rock' ? '#5a5d64' : g.mat === 'stone' ? '#9a958d' : '#8a6a48';
  for (let i = 0; i < 3; i++) dusts.push({ x: tc + 0.5 - dx * 0.45 + (Math.random() - 0.5) * 0.5 * (dy ? 1 : 0.3), y: tr + 0.5 - dy * 0.45 + (Math.random() - 0.5) * 0.5 * (dx ? 1 : 0.3),
    vx: -dx * (0.6 + Math.random()) + (Math.random() - 0.5), vy: -dy * (0.6 + Math.random()) + (Math.random() - 0.5) - 0.6, t0: performance.now(), col });
  if (dusts.length > 120) dusts.splice(0, dusts.length - 120);
}
function drawDust() {
  if (!dusts.length) return;
  const now = performance.now(), cell = cp;
  dusts = dusts.filter(d => now - d.t0 < 350);
  for (const d of dusts) {
    const t = (now - d.t0) / 1000;
    ctx.globalAlpha = 1 - t / 0.35; ctx.fillStyle = d.col;
    ctx.fillRect((d.x + d.vx * t) * cell - 1.5, (d.y + d.vy * t + 2 * t * t) * cell - 1.5, Math.max(2, cell * 0.06), Math.max(2, cell * 0.06));
  }
  ctx.globalAlpha = 1;
}
function drawDrill(x, y, s) {
  const cell = cp, fr = s.stuck || s.off ? DRILL_FR.stuck : DRILL_FR.run;
  const k = findKey(s);
  if (k >= 0) { const [ox, oy] = drillShift(k, s), pu = drillPunch(s), [ddx, ddy] = DIRS[s.dir]; x += (ox + ddx * pu) * cell; y += (oy + ddy * pu) * cell; }
  const f = !s.stuck && S.time - (s.hit || -99) < 0.7 ? Math.floor(S.time * 10) % 2 : 0;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.translate(x + cell / 2, y + cell / 2); ctx.rotate(ANGLE[s.dir]);
  ctx.drawImage(fr[f], -cell / 2, -cell / 2, cell, cell);
  ctx.restore();
  if (s.tid === 'fdrill' || s.tid === 'adrill') {   // 種類の印（本体に小さく）
    ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.round(cell * 0.2)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const [dx, dy] = DIRS[OPP[s.dir]];
    ctx.fillText(s.tid === 'fdrill' ? 'F' : 'A', x + cell / 2 + dx * cell * 0.28, y + cell / 2 + dy * cell * 0.28);
  }
}
// 事務所：レベルが上がるほど高く・立派に（レベル1＝小屋 → レベル5＝塔つきのビル）
const offFloors = lv => (lv < 5 ? [1, 1.6, 2, 2.6, 3.2][lv] : Math.min(6, 3.2 + 0.3 * (lv - 4)));   // 事務所の高さ（階）。レベル5の先も少しずつ高く
// 事務所の見た目が入っているマス（上の方をタップしても選べるように）
const officeTap = (c, r) => (c === OFFICE_C || c === OFFICE_C + 1) && r <= YARD_R && r >= YARD_R + 1 - Math.ceil(0.72 * offFloors(S.office.lv) + 0.1);
// 発進の動き（e＝発進してからの秒）：lift＝上がった高さ（マス。マイナスは沈む）・sx＝横のゆれ・fl＝火の長さ
const LAUNCH_SEC = 6.6;   // この秒で宇宙の絵へ
function launchPose(e) {
  if (e < 0.45) return { lift: -0.05 * (e / 0.45), sx: 0, fl: 0.2 };                                        // ぐっ（重さで沈む）
  if (e < 1.3) return { lift: -0.05, sx: Math.sin(e * 95) * 0.035, fl: 0.35 + 0.15 * Math.sin(e * 40) };    // ぶるぶる
  if (e < 1.7) return { lift: -0.05 + 0.22 * ((e - 1.3) / 0.4), sx: 0, fl: 0.6 };                          // ぐぐっ
  if (e < 2.15) return { lift: 0.17, sx: Math.sin(e * 85) * 0.03, fl: 0.65 + 0.1 * Math.sin(e * 50) };     // ぶるっ
  const u = e - 2.15;
  return { lift: 0.17 + 0.12 * u + 0.32 * u * u, sx: Math.sin(e * 70) * 0.03 / (1 + u), fl: 0.9 + 0.35 * Math.sin(e * 33) };   // ぐぐーん！
}
const launchShake = e => (e > 0.45 && e < 1.3) || (e > 1.7 && e < 4.6) ? 1 - Math.max(0, e - 3.2) / 1.4 : 0;   // どどど（画面のゆれの強さ）
function drawOffice() {
  const e = launchT ? (performance.now() - launchT) / 1000 : -1;
  if (e < 0) { drawOffice0(); return; }
  const P = launchPose(e), lift = P.lift;
  const cell = cp, x0 = OFFICE_C * cell + cell * 0.04, w = cell * 1.92, base = (YARD_R + 1) * cell;
  if (e > 0.45) {   // 地面のけむり：ロケットの足もとから左右へもくもく広がる（灰色。光らせない）
    const cx = x0 + w / 2, gy = base - cell * 0.1;
    for (let i = 0; i < 14; i++) {
      const t0 = 0.45 + i * 0.28; if (e < t0) break;
      const a2 = e - t0, side = i % 2 ? 1 : -1, dist = Math.min(4.5, a2 * (1.4 + (i % 3) * 0.3)) * cell;   // 左右へ転がる
      const rr = cell * (0.22 + Math.min(0.55, a2 * 0.22)), al = Math.max(0, 0.6 - a2 * 0.12);
      ctx.fillStyle = `rgba(150,150,155,${al.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(cx + side * (w * 0.3 + dist), gy - rr * 0.35 - (i % 3) * cell * 0.05, rr, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.save(); ctx.translate(P.sx * cell, -lift * cell); drawOffice0();
  const L = cell * P.fl;
  ctx.fillStyle = '#f0a040'; ctx.beginPath(); ctx.moveTo(x0 + w * 0.15, base); ctx.lineTo(x0 + w / 2, base + L); ctx.lineTo(x0 + w * 0.85, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(x0 + w * 0.32, base); ctx.lineTo(x0 + w / 2, base + L * 0.6); ctx.lineTo(x0 + w * 0.68, base); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawOffice0() {
  const cell = cp, T2 = THEME.office, lv = S.office.lv;
  const x = OFFICE_C * cell, base = (YARD_R + 1) * cell - Math.max(1, cell * 0.03);   // v0.96：地面の線の上に建つ
  const floors = offFloors(lv);
  if (S.tut2 && (S.tut2.step === 'hire' || S.tut2.step === 'office')) {   // 案内：事務所をタップ
    const hh = cell * 0.72 * floors;
    ctx.save(); ctx.globalAlpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 400)); ctx.strokeStyle = '#d0661f'; ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.strokeRect(x - cell * 0.04, base - hh - cell * 0.14, cell * 2.08, hh + cell * 0.14); ctx.restore();
  }
  const w = cell * 1.92, x0 = x + cell * 0.04;   // いつも2マス幅
  const h = cell * 0.72 * floors, top = base - h;
  ctx.fillStyle = T2.wall; ctx.fillRect(x0, top, w, h);
  ctx.fillStyle = T2.wall2; ctx.fillRect(x0 + w * 0.82, top, w * 0.18, h);       // 影
  ctx.fillStyle = T2.roof; ctx.fillRect(x0 - cell * 0.04, top - cell * 0.07, w + cell * 0.08, cell * 0.09);   // 屋根（平ら）
  if (sk('build') || tripTestOn) {   // 建造：屋上に▲、左右に羽（テストの時も）
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(x0 - cell * 0.04, top - cell * 0.07); ctx.lineTo(x0 + w / 2, top - cell * 1.0); ctx.lineTo(x0 + w + cell * 0.04, top - cell * 0.07); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0, base - h * 0.45); ctx.lineTo(x0 - cell * 0.42, base); ctx.lineTo(x0, base); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0 + w, base - h * 0.45); ctx.lineTo(x0 + w + cell * 0.42, base); ctx.lineTo(x0 + w, base); ctx.closePath(); ctx.fill();
  }
  // 窓（階ごと）
  const rows = Math.max(1, Math.round(floors * 1.4)), cols = 3;
  ctx.fillStyle = T2.win;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const wy = top + cell * 0.12 + i * (h - cell * 0.4) / rows;
    if (wy > base - cell * 0.45) continue;
    ctx.fillRect(x0 + w * (0.1 + j * 0.27), wy, w * 0.16, cell * 0.12);
  }
  ctx.fillStyle = T2.door; ctx.fillRect(x0 + w * 0.62, base - cell * 0.36, w * 0.17, cell * 0.36);   // 出入り口
  if (lv >= 4) {   // 屋上のアンテナ
    ctx.strokeStyle = T2.roof; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + w * 0.3, top - cell * 0.07); ctx.lineTo(x0 + w * 0.3, top - cell * 0.4); ctx.stroke();
  }
  drawLevel(x0 + cell * 0.02, top + cell * 0.02, lv);
  if (sk('garden')) {   // 屋上庭園：屋上が森に
    ctx.fillStyle = '#4f8a5b'; ctx.fillRect(x0, top - cell * 0.1, w, cell * 0.06);
    for (let i = 0; i < 5; i++) { const tx3 = x0 + w * (0.08 + i * 0.21), r3 = cell * (0.09 + 0.03 * ((i * 7) % 3)); ctx.fillStyle = i % 2 ? '#8fc07a' : '#4f8a5b'; ctx.beginPath(); ctx.arc(tx3, top - cell * 0.1 - r3 * 0.7, r3, 0, Math.PI * 2); ctx.fill(); }
  }
  if (sk('statue')) {   // 社長像：玄関の前（台の上に、赤いヘルメットの社長）
    const sx = x0 + w * 0.42, sb = base;
    ctx.fillStyle = '#9a958d'; ctx.fillRect(sx - cell * 0.1, sb - cell * 0.12, cell * 0.2, cell * 0.12);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.95; ctx.drawImage(BOSS_FR[1], sx - cell * 0.13 * (1 + (S.bossFat || 0)), sb - cell * 0.12 - cell * 0.26, cell * 0.26 * (1 + (S.bossFat || 0)), cell * 0.26); ctx.restore();
  }
  const boss = bossOf();
  if (boss && boss.state === 'off') {
    const ph = Math.floor(S.time / 25) % 3;   // 25秒ごとに：屋上（2回）か、窓
    if (ph < 2) {   // 屋上をうろうろ
      const u = (Math.sin(S.time * 0.35 + ph) + 1) / 2, bx = x0 + w * (0.12 + u * 0.76);
      drawWorkerSprite(bx, top - cell * 0.07, Math.round(cell * 0.4), Math.floor(S.time / 0.25) % 2, 1, true);
    } else {        // 窓から顔を出す（いちばん上の段・まん中の窓）
      const wy = top + cell * 0.12, wx = x0 + w * (0.1 + 0.27) + w * 0.08, s2 = Math.max(4, Math.round(cell * 0.16));
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(BOSS_FR[1], 3, 0, 2, 2, Math.round(wx - s2 / 2), Math.round(wy + cell * 0.12 - s2), s2, s2); ctx.restore();
    }
  }
  const inside = S.workers.filter(wk => wk.state === 'idle' || wk.state === 'rest').length;
  if (inside) {
    ctx.fillStyle = T2.text; ctx.font = `600 ${Math.round(cell * 0.22)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('i×' + inside, x0 + w * 0.08, base - cell * 0.04);
  }
}
// 研究所：1マスの小さな建物（地上のどこでも）
function drawLab() { if (S.lab.built) drawLabAt(S.lab.c, false); }
// パイプ：つながっている向きへ管をのばす。地上につながって流れていれば、中に液体の色
function drawPipe(x, y, c, r, ghost) {
  const cell = cp, cx = x + cell / 2, cy = y + cell / 2, w = cell * 0.34;
  const conn = [];
  if (!ghost) for (const [dx, dy] of NB) { if ((dy === -1 && r === SKY) || isPipeLike(inB(c + dx, r + dy) && S.st.get(key(c + dx, r + dy)))) conn.push([dx, dy]); }
  if (!conn.length) conn.push([0, -1], [0, 1]);
  const seg = (dx, dy, wid, col) => { ctx.fillStyle = col; if (dx) ctx.fillRect(dx > 0 ? cx : x, cy - wid / 2, cell / 2, wid); else ctx.fillRect(cx - wid / 2, dy > 0 ? cy : y, wid, cell / 2); };
  for (const [dx, dy] of conn) seg(dx, dy, w + 2, THEME.pipe.line);
  ctx.fillStyle = THEME.pipe.line; ctx.fillRect(cx - w / 2 - 2, cy - w / 2 - 2, w + 4, w + 4);
  for (const [dx, dy] of conn) seg(dx, dy, w, THEME.pipe.body);
  ctx.fillStyle = THEME.pipe.joint; ctx.fillRect(cx - w / 2, cy - w / 2, w, w);
  const n = !ghost && pipeNet().get(key(c, r));
  if (n && n.surface && n.kind) for (const [dx, dy] of conn) seg(dx, dy, w * 0.36, THEME.pipe[n.kind]);
}
// よその土地：地下は暗く、土地の境目に柵
function drawLand(g0, r1) {
  const cell = cp;
  ctx.fillStyle = THEME.otherLand;
  for (let c = 0; c < COLS; c++) if (!owned(c)) ctx.fillRect(c * cell, g0 * cell, cell, (r1 - g0 + 1) * cell);
  ctx.fillStyle = THEME.fence;
  for (const fx of [S.landL, S.landR + 1]) {
    if (fx <= 0 || fx >= COLS) continue;
    const x = fx * cell, top = (YARD_R + 0.55) * cell;
    ctx.fillRect(x - 1.5, top, 3, SKY * cell - top);                                   // 杭（v0.97：横木はなし）
  }
}
// 橋：地表の段（地下1段目）が掘られた所。床は地面と同じ高さ（フォークリフトの高さは変わらない）。両端に橋台
function drawBridges() {
  const cell = cp, y = SKY * cell, a = row(SKY);
  for (let c = S.landL; c <= S.landR; c++) {
    if (a[c] !== null) continue;
    const x = c * cell, left = c === S.landL || a[c - 1] !== null, right = c === S.landR || a[c + 1] !== null;
    ctx.fillStyle = THEME.bridge.deck; ctx.fillRect(x, y - cell * 0.02, cell, cell * 0.1);            // 床
    ctx.fillStyle = THEME.bridge.dark; ctx.fillRect(x, y + cell * 0.08, cell, Math.max(1, cell * 0.03));
    ctx.strokeStyle = THEME.bridge.truss; ctx.lineWidth = Math.max(1, cell * 0.03);                  // 下のトラス（三角）
    ctx.beginPath(); ctx.moveTo(x, y + cell * 0.1); ctx.lineTo(x + cell / 2, y + cell * 0.26); ctx.lineTo(x + cell, y + cell * 0.1);
    ctx.moveTo(x, y + cell * 0.26); ctx.lineTo(x + cell, y + cell * 0.26); ctx.stroke();
    ctx.fillStyle = THEME.bridge.rail;                                                                // 手すり
    ctx.fillRect(x, y - cell * 0.17, cell, Math.max(1, cell * 0.025));
    for (const px of [0.1, 0.5, 0.9]) ctx.fillRect(x + cell * px - 0.5, y - cell * 0.17, Math.max(1, cell * 0.025), cell * 0.16);
    ctx.fillStyle = THEME.bridge.dark;                                                                // 橋台（両端だけ）
    if (left) ctx.fillRect(x, y - cell * 0.02, cell * 0.06, cell * 0.32);
    if (right) ctx.fillRect(x + cell * 0.94, y - cell * 0.02, cell * 0.06, cell * 0.32);
  }
}
// 地上の施設と、温泉のお客さん
function drawFacs() {
  const cell = cp;
  for (const f of S.fac) {
    const x = f.c * cell, y = YARD_R * cell;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite(f.f), x, y, cell, cell); ctx.restore();
    if (!facWorkers(f).length) { ctx.fillStyle = THEME.zMark || '#2b2b2e'; ctx.font = `bold ${Math.round(cell * 0.22)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('z', x + cell * 0.84, y + cell * 0.17); }
    const tk = f.f === 'refinery' ? S.tank.oil : f.f === 'spa' ? S.tank.hot : S.tank.hot + S.tank.oil;   // タンクの残り
    ctx.fillStyle = THEME.gaugeBg; ctx.fillRect(x + 3, y + cell - 5, cell - 6, 3);
    ctx.fillStyle = f.f === 'refinery' ? THEME.pipe.oil : THEME.pipe.hot; ctx.fillRect(x + 3, y + cell - 5, (cell - 6) * Math.min(1, tk / BAL.tankCap), 3);
  }
  for (const car of S.cars) {
    const cx = car.x * cell, by = (YARD_R + 0.95) * cell, w = cell * 0.62, h = cell * 0.26;
    ctx.fillStyle = car.col; ctx.fillRect(cx, by - h, w, h * 0.62); ctx.fillRect(cx + w * 0.18, by - h * 1.45, w * 0.55, h * 0.5);
    ctx.fillStyle = '#cfe6f5'; ctx.fillRect(cx + w * 0.24, by - h * 1.35, w * 0.2, h * 0.35); ctx.fillRect(cx + w * 0.48, by - h * 1.35, w * 0.2, h * 0.35);
    ctx.fillStyle = '#2b2b2e'; ctx.fillRect(cx + w * 0.12, by - h * 0.42, w * 0.2, h * 0.42); ctx.fillRect(cx + w * 0.66, by - h * 0.42, w * 0.2, h * 0.42);
    if (car.st === 'walkIn' || car.st === 'walkOut') {   // 車と入口の間を歩く人
      const p = car.st === 'walkIn' ? car.t / 0.8 : 1 - car.t / 0.8, px = (car.x + 0.62 + (car.f + 0.55 - car.x - 0.62) * p) * cell;
      drawGuest(px, (YARD_R + 0.95) * cell, Math.round(cell * 0.4), Math.floor(S.time * 6) % 2, car);   // お客さん（ヘルメットなし・服と髪はいろいろ）
    }
  }
}
function drawLabAt(c, ghost) {
  const cell = cp, T2 = THEME.lab, x0 = c * cell + cell * 0.06, base = (YARD_R + 1) * cell;
  const w = cell * 0.88, h = cell * 0.95, top = base - h;
  ctx.fillStyle = T2.wall; ctx.fillRect(x0, top, w, h);
  ctx.fillStyle = T2.roof; ctx.fillRect(x0, top, w, cell * 0.1);                    // 屋根の帯
  ctx.beginPath(); ctx.arc(x0 + w * 0.68, top, cell * 0.17, Math.PI, 0); ctx.fill();  // 観測ドーム
  ctx.fillStyle = T2.win; ctx.fillRect(x0 + w * 0.12, top + cell * 0.24, w * 0.46, cell * 0.18);
  ctx.strokeStyle = T2.line; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, top + 0.5, w - 1, h - 1);
  ctx.fillStyle = T2.roof; ctx.fillRect(x0 + w * 0.64, base - cell * 0.32, w * 0.2, cell * 0.32);   // 扉
  if (ghost) return;
  const rooms = labRooms(), staff = labStaff(), fh = cell * 0.42;
  for (let i = 0; i < rooms; i++) {   // 研究室：1階（元の建物）から上へ積む
    const ry = i === 0 ? top + cell * 0.2 : top - i * fh, r = S.researches[i];
    if (i > 0) {   // 増室した階
      ctx.fillStyle = T2.wall; ctx.fillRect(x0, ry, w, fh);
      ctx.strokeStyle = T2.line; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, ry + 0.5, w - 1, fh - 1);
      ctx.fillStyle = T2.roof; ctx.fillRect(x0, ry, w, cell * 0.05);
    }
    const wx = x0 + w * 0.12, wy = i === 0 ? top + cell * 0.24 : ry + cell * 0.1, ww = w * 0.76, wh = cell * 0.18;
    ctx.fillStyle = r ? (r.on ? THEME.labLit : THEME.labIdle) : T2.win; ctx.fillRect(wx, wy, ww, wh);
    if (r && staff[i]) { ctx.save(); ctx.imageSmoothingEnabled = false; const s2 = Math.max(3, Math.round(cell * 0.12)); ctx.drawImage((staff[i].boss ? BOSS_FR : WORKER_FR)[1], 3, 0, 2, 2, Math.round(wx + ww * 0.3), Math.round(wy + wh - s2), s2, s2); ctx.restore(); }
    if (r) { ctx.fillStyle = THEME.gaugeBg; ctx.fillRect(wx, wy + wh + 1, ww, 2); ctx.fillStyle = THEME.labOn; ctx.fillRect(wx, wy + wh + 1, ww * r.t / r.total, 2); }
  }
  if (rooms > 1) { ctx.fillStyle = T2.roof; ctx.fillRect(x0 - cell * 0.03, top - (rooms - 1) * fh - cell * 0.04, w + cell * 0.06, cell * 0.05); }
}
function drawYard() {   // ヤード（1マス）：トラックの後ろに山が積もる（荷台からはみ出た分がトラックと重なる）
  const cell = cp, x0 = YARD_C * cell, y = YARD_R * cell, n = S.yard.length;
  ctx.fillStyle = THEME.paved; ctx.fillRect(x0, SKY * cell - 3, cell, 3);
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 2, y + 2, cell - 4, cell - 4); ctx.setLineDash([]);
  const h = Math.min(sk('yardPlus') ? 1.5 : 0.85, 0.12 + n * 0.014);   // ヤード拡張で高く積める
  const show = Math.min(n, sk('yardPlus') ? 120 : 50);
  for (let i = 0; i < show; i++) {
    const it = S.yard[i];
    const px = x0 + cell * (0.14 + it.rx * 0.72);
    const py = y + cell * (0.86 - it.ry * h * (1 - Math.abs(it.rx - 0.5)));
    drawItemShape(it, px, py, 0.8);
  }
}
function drawYardCount() {   // 山の数（トラックの上に重ねて読めるように、いちばん最後に描く）
  const n = S.yard.length; if (!n) return;
  const cell = cp, x0 = YARD_C * cell, y = YARD_R * cell;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
  ctx.font = `bold ${Math.round(cell * 0.26)}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.strokeText('×' + n, x0 + cell - 3, y + 2); ctx.fillText('×' + n, x0 + cell - 3, y + 2);
}
// 荷おろし場：地上に出た資源の小さな山（フォークリフト待ち）
function drawDock() {
  const cell = cp, y = YARD_R * cell;
  for (const c of Object.keys(S.dock)) {
    const pile = S.dock[c]; if (!pile.length) continue;
    const x0 = +c * cell, h = Math.min(0.5, 0.08 + pile.length * 0.02);
    for (let i = 0; i < Math.min(pile.length, 25); i++) {
      const it = pile[i];
      drawItemShape(it, x0 + cell * (0.25 + it.rx * 0.5), y + cell * (0.885 - it.ry * h), 0.7);   // v0.96：地面に置く（絵の下の余白ぶん）
    }
    if (pile.length > 3) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
      ctx.font = `bold ${Math.round(cell * 0.24)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const t = '×' + pile.length, ty = y + cell * (0.8 - h);
      ctx.strokeText(t, x0 + cell / 2, ty); ctx.fillText(t, x0 + cell / 2, ty);
    }
  }
  for (const f of S.forks) drawFork(f);
  if (S.bossFork) drawFork(S.bossFork);   // 社長のフォークリフト（赤）
}
// フォークリフト：小さく、走るとちょこちょこ揺れる
function drawFork(f) {
  const cell = cp, s = cell * 0.42;
  const bob = f.moving ? Math.abs(Math.sin(S.time * 22)) * cell * 0.025 : 0;
  const x = f.x * cell, yb = (YARD_R + 1) * cell - s * 0.02 - bob;   // 車輪の下（v0.96：地面にぴったり）
  const dir = f.face || 1;
  ctx.save(); ctx.translate(x, yb); ctx.scale(dir, 1);
  ctx.fillStyle = f.boss ? '#c0392b' : THEME.fork.body; ctx.fillRect(-s * 0.55, -s * 0.55, s * 0.8, s * 0.38);           // 車体
  ctx.strokeStyle = THEME.fork.frame; ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.strokeRect(-s * 0.45, -s * 0.95, s * 0.45, s * 0.42);                                  // 運転席の枠
  ctx.fillStyle = THEME.fork.mast; ctx.fillRect(s * 0.3, -s * 1.05, s * 0.08, s * 0.95);              // マスト
  ctx.fillRect(s * 0.3, -s * 0.16, s * 0.42, s * 0.06);                                      // フォーク
  if (opOf(f)) { ctx.scale(dir, 1); drawWorkerSprite(-s * 0.22 * dir, -s * 0.5, s * 0.6, 1, 1, opOf(f).boss); ctx.scale(dir, 1); }   // 運転手（社長は赤いヘルメット）
  ctx.fillStyle = THEME.fork.tire;
  for (const wx of [-s * 0.35, s * 0.12]) { ctx.beginPath(); ctx.arc(wx, -s * 0.1, s * 0.12, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  drawLvPix(x - s * 0.5 * dir + (dir < 0 ? -s * 0.8 : 0) + s * 0.05, yb - s * 0.5, s * 0.7, f.lv);   // 車体の上の線に1ドットずつ
  // 積んでいる物（フォークの上に小さく）
  for (let i = 0; i < Math.min(f.load.length, 3); i++) {
    drawItemShape(f.load[i], x + dir * s * 0.52, yb - s * 0.28 - i * s * 0.22, 0.45);
  }
}
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function drawTruck() {   // 1マスの小さなトラック。右からヤードに直接入ってきて、右へ出ていく
  const cell = cp, t = bayTruck() || { phase: 'away' }, y = YARD_R * cell, bx = BED * cell;
  if (t.phase === 'away') return;
  let p = 0;
  if (t.phase === 'leaving') p = ease(t.t / animSec());
  else if (t.phase === 'returning') p = 1 - ease(t.t / animSec());
  ctx.save();
  ctx.globalAlpha = 1 - p * 0.9;
  ctx.translate(p * cell * 3, 0);
  ctx.fillStyle = THEME.truck.body;
  ctx.fillRect(bx + cell * 0.04, y + cell * 0.52, cell * 0.6, cell * 0.24);              // 荷台
  ctx.fillRect(bx + cell * 0.04, y + cell * 0.34, cell * 0.05, cell * 0.2);
  const fill = Math.min(1, t.load / valOf('truck'));
  ctx.fillStyle = THEME.truck.load;
  ctx.fillRect(bx + cell * 0.1, y + cell * 0.52 - cell * 0.18 * fill, cell * 0.54, cell * 0.18 * fill);
  const cx = bx + cell * 0.64;
  ctx.fillStyle = THEME.truck.cab; ctx.fillRect(cx, y + cell * 0.34, cell * 0.32, cell * 0.42);   // 運転席
  ctx.fillStyle = THEME.truck.win; ctx.fillRect(cx + cell * 0.14, y + cell * 0.4, cell * 0.14, cell * 0.14);
  if (opOf(t)) drawWorkerSprite(cx + cell * 0.2, y + cell * 0.6, cell * 0.22, 1, 1, opOf(t).boss);   // 運転手（社長は赤いヘルメット）
  ctx.fillStyle = THEME.truck.tire;
  for (const wx of [bx + cell * 0.22, bx + cell * 0.8]) { ctx.beginPath(); ctx.arc(wx, y + cell * 0.82, cell * 0.1, 0, Math.PI * 2); ctx.fill(); }
  drawLvPix(bx + cell * 0.08, y + cell * 0.55, cell * 0.52, S.truck.lv);   // 荷台の横に1ドットずつ
  ctx.restore();
}

// 遊び方の挿絵：ゲームのドット絵を並べる
const HELP_FIG = { adit: ['m:adit', '@rock', '#stone', '#iron'], greet: ['drill', 'conv', 'm:kiln', '@truck'], 0: ['drill', 'conv', 'remove'], 1: ['drill', '@rock', '#soil', '#stone'], 2: ['conv', 'sort', '#brick', '@truck'],
  3: ['m:kiln', 'm:crusher', 'm:smelter'], 4: ['@worker', 'drill', 'm:kiln'], 5: ['lab', '@worker'], 6: ['#goldbar', '#gem', '@truck'], 7: ['@spring', '@oilwell', 'spa', 'power'] };
function helpFig(k) {
  const list = HELP_FIG[k]; if (!list) return null;
  const box = document.createElement('div'); box.className = 'hfig';
  for (const id of list) {
    let c;
    if (id === '@sec') { c = secIcon('good', 'hpic'); }
    else if (id[0] === '#') { c = document.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(itemSprite(id.slice(1)), 0, 0); c.className = 'hpic'; }
    else if (id[0] === '@') {
      c = document.createElement('canvas'); c.width = c.height = 48; c.className = 'hpic';
      const saved = [ctx, cp]; ctx = c.getContext('2d'); cp = 48; ctx.imageSmoothingEnabled = false;
      try {
        if (id === '@worker') ctx.drawImage(WORKER_FR[0], 8, 8, 32, 32);
        else if (id === '@rock') ctx.drawImage(rockTex(1), 0, 0, 48, 48);
        else if (id === '@truck') { ctx.translate(0, -YARD_R * 48 - 6); const t0 = S.fleet, b0 = S.truck; drawTruckAt(0); }
        else ctx.drawImage(sprite(id.slice(1)), 0, 0, 48, 48);
      } finally { [ctx, cp] = saved; }
    } else { const t = thumb(id); c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(t, 0, 0); c.className = 'hpic'; }
    box.append(c);
  }
  return box;
}
// 挿絵用のトラック（止まっている形）
function drawTruckAt(col) {
  const cell = cp, y = YARD_R * cell, bx = col * cell;
  ctx.fillStyle = THEME.truck.body; ctx.fillRect(bx + cell * 0.04, y + cell * 0.52, cell * 0.6, cell * 0.24);
  ctx.fillStyle = THEME.truck.load; ctx.fillRect(bx + cell * 0.1, y + cell * 0.36, cell * 0.54, cell * 0.16);
  ctx.fillStyle = THEME.truck.cab; ctx.fillRect(bx + cell * 0.64, y + cell * 0.34, cell * 0.32, cell * 0.42);
  ctx.fillStyle = THEME.truck.win; ctx.fillRect(bx + cell * 0.78, y + cell * 0.4, cell * 0.14, cell * 0.14);
  ctx.fillStyle = THEME.truck.tire; for (const wx of [bx + cell * 0.22, bx + cell * 0.8]) { ctx.beginPath(); ctx.arc(wx, y + cell * 0.82, cell * 0.1, 0, Math.PI * 2); ctx.fill(); }
}
// ---- 画面の数字・ボタン ----
const pxOf = b => { const q = b.dataset.px; return q.startsWith('#') ? document.querySelector(q) : $(q); };
document.querySelectorAll('#dash [data-px]').forEach(b => b.addEventListener('click', () => {
  // 引き出しは1つだけ：パネルのタブを押したら、設置などの引き出しは閉じる（逆は元のボタンが閉じる）
  const k = b.dataset.open;
  if (tool !== 'none' && tool !== 'pan') { tool = 'none'; closePop(); }   // メニューを開くと、道具の選択は外れる
  if (k === 'infoCat' && !$('info').hidden) { $('info').hidden = true; updateUI(); return; }   // 情報を開いている時は閉じるだけ
  $('info').hidden = true;
  if (isPanelKey(k) && openCat) { openCat = null; renderSub(); }
  const o = pxOf(b); if (o) o.click();
  updateUI();
}));
function closeDrawers() { openCat = null; renderSub(); closePanels(); closePop(); $('info').hidden = true; updateUI(); }
$('dClose').addEventListener('click', closeDrawers);
function applyDash() {
  document.body.classList.toggle('dash', dashOn);
  const inf = $('info');
  inf.classList.toggle('bottom', dashOn);
  inf.style.left = inf.style.top = inf.style.bottom = '';
  $('dash').hidden = !dashOn;
  if (dashOn) menuOpen = true;   // 計器盤では命令がいつも見えている
}
const isPanelKey = k => !!document.getElementById(k);   // パネル（強化・スキル・情報） or 設置などの項目名
const isOpenTab = k => k === 'infoCat' ? openCat === k || !$('info').hidden : isPanelKey(k) ? !$(k).hidden : openCat === k;
const drawerOf = k => k === 'infoCat' ? (openCat === k ? $('subMenu') : $('info')) : isPanelKey(k) ? $(k) : $('subMenu');
// 使ったことの無い物・見ていない研究があるメニュー（タブに●）
function newCats() {
  const facs = S.office.lv >= 1 ? facTools() : [];
  return {
    build: BUILD_GRPS.some(g => grpList(g).some(isNewTool)),
    skillPanel: !!(S.lab.built && S.seenRes && allResIds().some(id => resAvail(id) && !resDef(id).done && !S.seenRes[id])),
  };
}
function syncNewLamps() {
  const nc = newCats();
  document.querySelectorAll('#dash .dtab').forEach(b => b.classList.toggle('hasNew', !!nc[b.dataset.open]));
  document.querySelectorAll('#catBar .cat').forEach(b => b.classList.toggle('hasNew', !!nc[b.dataset.cat]));
  const sb = $('skillBtn'); if (sb) sb.classList.toggle('hasNew', !!nc.skillPanel);
}
function syncDash() {
  syncNewLamps();
  const hd = $('dHandle');
  if (!dashOn) { hd.hidden = true; return; }
  let open = null;
  document.querySelectorAll('#dash .dtab').forEach(b => {
    const o = pxOf(b); if (!o) return;
    b.hidden = o.hidden;
    const on = isOpenTab(b.dataset.open);
    b.classList.toggle('open', on);
    b.classList.toggle('cur', o.classList.contains('active'));
    if (on) open = b;
  });
  // 取っ手：開いている引き出しの左上に、タブの名前を付ける
  const drawer = open && drawerOf(open.dataset.open);
  const was = !hd.hidden && hd.dataset.k;
  hd.hidden = !drawer || drawer.hidden;
  if (!hd.hidden && was !== open.dataset.open) {   // 開いたとき・別のタブに替えたとき：引き出しと一緒にせり上がる
    hd.dataset.k = open.dataset.open;
    hd.style.setProperty('--dh', drawer.offsetHeight + 'px');
    hd.classList.remove('go'); drawer.style.animation = 'none'; void hd.offsetWidth; drawer.style.animation = ''; hd.classList.add('go');
    const dc0 = $('dClose'); dc0.style.setProperty('--dh', drawer.offsetHeight + 'px'); dc0.classList.remove('go'); void dc0.offsetWidth; dc0.classList.add('go');   // ×も一緒にせり上がる
  }
  if (hd.hidden) hd.dataset.k = '';
  if (!hd.hidden) {
    hd.querySelector('b').textContent = open.querySelector('b').textContent;
    hd.querySelector('i').textContent = open.querySelector('i').textContent;
    hd.style.left = (drawer.offsetLeft + 8) + 'px'; hd.style.top = (drawer.offsetTop - 22) + 'px';   // 伸びる動きの途中でもずれないよう offset で
  }
  const dc = $('dClose');   // 引き出しを閉じる「×」（右上）
  dc.hidden = hd.hidden;
  if (!dc.hidden) { dc.style.top = (drawer.offsetTop - 24) + 'px'; dc.style.right = 'auto'; dc.style.left = (drawer.offsetLeft + drawer.offsetWidth - dc.offsetWidth - 8) + 'px'; }
}
// メッセージをタップ：関係する所へ画面を動かし、そのメニューを開く
function jumpTo(at) {
  metrics();
  cam.x = at.c + 0.5 - cw / cp / 2; cam.y = at.r + 0.5 - ch / cp / 2; metrics();
  if (at.open) at.open();
}
$('tutMsg').addEventListener('pointerup', () => { if (!S.tut && S.tut2 && S.tut2.step !== 'wait') { tut2Next(); updateUI(); return; } if (tutWait()) { tutNext(); updateUI(); } });
$('tutSkip').addEventListener('click', () => {   // はじめの手順をとばす（ドリルを1台もらって、ふつうに始める）。そのあとの案内も出さない
  if (!S.tut) { S.tut2 = null; tutShow(); document.querySelectorAll('.tutPulse2, .tutPulse').forEach(el => el.classList.remove('tutPulse2', 'tutPulse')); updateUI(); return; }
  tutSkipped = true;
  if (![...S.st.values()].some(x => x.type === 'drill')) { const c = OFFICE_C - 1; row(SKY)[c] = null; S.digVer++; S.st.set(key(c, SKY), { type: 'drill', tid: 'drill', dir: 'down', lv: 0, t: 0, hit: -99, op: null, no: 1 }); S.stVer++; }
  tutEnd(); updateUI();
});
$('msg').addEventListener('pointerup', () => { const a = msgAt; say(''); if (a) { jumpTo(a); updateUI(); } });   // タップで消える（飛べる物は飛ぶ）
$('curTool').addEventListener('pointerup', e => { e.preventDefault(); tool = 'none'; closePop(); updateUI(); });
// ---- 会社レベルの知らせ・秘書の提案 ----
// 事務所を開いて、会社レベルの行へ（光らせる。点滅はしない）
let coFocusUntil = 0;   // この時刻まで、会社レベルの行に枠
function focusCoUp() {
  S.opts = S.opts || {}; S.opts.fold = S.opts.fold || {}; S.opts.fold.co = true;
  if ($('office').hidden) togglePanel('office'); else renderPanel('office');
  coFocusUntil = performance.now() + 3000; renderPanel('office');
  setTimeout(() => { const b = document.querySelector('#officeBody [data-tut="coUp"]'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
}
const advOn = () => !!S && sk('secAdv') > 0 && (S.opts || {}).secAdv !== false && !inTitle;
let coCanUp = null;
function coLvWatch() {   // 会社レベルを上げられるようになった時に1回だけ（秘書の提案がある時は、そちらに入る）
  if (!S || inTitle || autoBusy || catchBusy) return;
  const c = offCost(S.office.lv), can = c != null && S.money >= c;
  if (coCanUp === false && can && !advOn()) say(tx().coLvMsg, 5000, 'good', { c: OFFICE_C, r: YARD_R, open: focusCoUp });
  coCanUp = can;
}
let advCache = [], advT = 0, advIdx = 0, advOpen = false;
function advList() {   // 今の提案（大事な順）
  const T = tx(), A = T.adv, out = [];
  let jam = null;
  for (const st of S.st.values()) { if (!isBelt(st)) continue; const k = stationKey(st); if (k < 0) continue; if ((beltN.get(k) || 0) >= BELT_CAP[st.lv || 0] && (!jam || rOf(k) < rOf(jam))) jam = k; }
  if (jam !== null) out.push({ id: 'jam', text: A.jam, at: { c: cOf(jam), r: rOf(jam), open: () => { const s2 = S.st.get(jam); if (s2) openPop(s2); } } });
  for (const m of typeList('mach')) {
    const n = Object.values(m.buf || {}).reduce((a, v) => a + v, 0) + Object.values(m.bags || {}).reduce((a, v) => a + v, 0);
    if (n >= 100) { const k = stationKey(m); if (k >= 0) { out.push({ id: 'buf' + k, text: A.buf(T.mach[m.m]), at: { c: cOf(k), r: rOf(k), open: () => openPop(m) } }); break; } }
  }
  const oc = offCost(S.office.lv); if (oc != null && S.money >= oc) out.push({ id: 'co', text: A.coUp, at: { c: OFFICE_C, r: YARD_R, open: focusCoUp } });
  if (YARD_C >= 0 && S.yard.length > valOf('truck') * 3) out.push({ id: 'truck', text: A.truck, at: { c: YARD_C, r: YARD_R, open: () => openPop('truck') } });
  const dockN = Object.values(S.dock).reduce((a, q) => a + q.length, 0);
  if (dockN > 30 && S.forks.length) out.push({ id: 'fork', text: A.fork, at: { c: OFFICE_C, r: YARD_R, open: () => openPop(S.forks[0]) } });
  const have = new Set(typeList('mach').map(m => m.m));
  for (const k of Object.keys(S.seenIt || {})) {
    if (!RAW_KINDS.has(k) || k === 'soil' || k === 'stone') continue;   // 土・石は案内で分かるので出さない
    const m = MACHINE_ORDER.find(mm => S.unlock[mm] && !have.has(mm) && (MACHINES[mm].recipes || []).some(rc => rc.in === k || (rc.ins && rc.ins[k])));
    if (m) { out.push({ id: 'use' + k, text: A.useRes(T.items[k], T.mach[m]), at: null }); break; }
  }
  return out;
}
function advSync() {   // 右下の顔と吹き出しを今の状態に
  const box = $('secAdv'), bub = $('secAdvBub');
  if (!advOn()) { box.hidden = true; bub.hidden = true; advOpen = false; return; }
  box.hidden = false;
  const fc = $('secAdvFace'); if (!fc.dataset.ok) { fc.width = fc.height = 16; fc.getContext('2d').drawImage(secFace('normal'), 0, 0); fc.dataset.ok = 1; }   // 顔は最初に出す時に描く
  const min = !!S.opts.advMin; box.classList.toggle('min', min);
  $('secAdvN').textContent = !min && advCache.length ? advCache.length : ''; $('secAdvN').hidden = min || !advCache.length;
  $('secAdvX').hidden = min;
  bub.hidden = !advOpen;
  if (advOpen) {
    const T = tx(), a = advCache[advIdx % Math.max(1, advCache.length)];
    $('secAdvT').textContent = a ? a.text : T.adv.none; $('secAdvT').classList.toggle('jump', !!(a && a.at));
    $('secAdvNext').hidden = advCache.length < 2; $('secAdvNext').textContent = T.adv.next + `（${advIdx % advCache.length + 1}/${advCache.length}）`;
  }
}
function advTick() {
  if (!S || inTitle) return;
  coLvWatch();
  if (!advOn()) { if (!$('secAdv').hidden) advSync(); return; }
  if (performance.now() - advT < 1000) return;
  advT = performance.now(); advCache = advList(); advSync();
}
{
  $('secAdvFace').addEventListener('click', () => { if (S.opts.advMin) { S.opts.advMin = false; advOpen = true; advIdx = 0; } else { advOpen = !advOpen; advIdx = 0; } advCache = advList(); advSync(); });
  $('secAdvX').addEventListener('click', e => { e.stopPropagation(); S.opts.advMin = true; advOpen = false; advSync(); });   // かなり小さく灰色に。次に押すまで出ない
  $('secAdvNext').addEventListener('click', e => { e.stopPropagation(); advIdx++; advSync(); });
  $('secAdvT').addEventListener('click', () => { const a = advCache[advIdx % Math.max(1, advCache.length)]; if (a && a.at) { advOpen = false; advSync(); jumpTo(a.at); updateUI(); } });
}
// 100：メッセージが、開いている画面の×に重なる時は、×だけメッセージの下へ下げる（画面は動かさない）
function xAvoidMsg() {
  const m = $('msg'), mr = m && m.childNodes.length ? m.getBoundingClientRect() : null;
  for (const x of document.querySelectorAll('.panel:not([hidden]) > .head .x, #pop:not([hidden]) #popClose')) {
    const dy0 = +(x.dataset.dy || 0), r = x.getBoundingClientRect(), top = r.top - dy0, bot = r.bottom - dy0;
    let dy = 0;
    if (mr && mr.width && r.right > mr.left && r.left < mr.right && bot > mr.top && top < mr.bottom) dy = Math.ceil(mr.bottom - top + 4);
    if (dy !== dy0) { x.dataset.dy = dy; x.style.transform = dy ? `translateY(${dy}px)` : ''; x.style.position = dy ? 'relative' : ''; x.style.zIndex = dy ? '50' : ''; }
  }
}
function updateUI() {
  advTick(); xAvoidMsg();
  const T = tx(), m = $('money');
  m.textContent = fmt(S.money); m.classList.toggle('neg', S.money < 0);
  $('goalHud').textContent = S && !inTitle ? tx().coHud(S.office.lv + 1) : '';   // 会社レベル（主な目標）
  const mn = S.stats.cur.sale - S.stats.cur.cost, mh = $('monthHud');   // 今月の収支（リアルタイム）
  mh.textContent = `${T.monthNet} ${mn > 0 ? '+' : ''}${fmt(mn)}`; mh.className = mn > 0 ? 'pos' : mn < 0 ? 'neg' : '';
  const month = Math.floor(S.time / TUNE.month);
  $('date').textContent = T.date(Math.floor(month / 12) + 1, month % 12 + 1);
  const pTxt = running ? T.pause : T.play; if ($('playBtn').textContent !== pTxt) { $('playBtn').textContent = pTxt; fitHeader(); }   // 字が変わったら、はみ出しを測り直す
  const spN = speedIdx + 1, spB = $('speedBtn');   // 速いほど ▶ が増える（数字は出さない）。文字だと iPhone で絵文字になって幅が変わるので、三角を描く
  if (spB.dataset.n !== String(spN)) { spB.dataset.n = spN; const W = 16, tw = 6, step = spN > 1 ? (W - tw) / (spN - 1) : 0, x0 = spN > 1 ? 0 : (W - tw) / 2;   // いつも同じ幅（16）に収める。数が多いほど詰める
    spB.innerHTML = `<svg viewBox="0 0 ${W} 8" width="20" height="10" fill="currentColor" aria-hidden="true">${[...Array(spN)].map((_, i) => `<path d="M${x0 + i * step} 0L${x0 + i * step + tw} 4L${x0 + i * step} 8Z"/>`).join('')}</svg>`; }
  spB.title = spB.ariaLabel = '×' + speeds()[speedIdx];
  const spHide = speeds().length < 2; if ($('speedBtn').hidden !== spHide) { $('speedBtn').hidden = spHide; fitHeader(); }   // 速くできるようになるまで出さない（出た時は、はみ出しを測り直す）
  // 端まで来た向きの▲▼◀▶は消す
  $('mvUp').hidden = cam.y <= camLim.y0 + 0.02; $('mvDown').hidden = cam.y >= camLim.y1 - 0.02;
  $('mvLeft').hidden = cam.x <= camLim.x0 + 0.02; $('mvRight').hidden = cam.x >= camLim.x1 - 0.02;
  $('panBtn').classList.toggle('active', tool === 'pan');
  $('mapBtn').classList.toggle('active', !$('mapPanel').hidden);
  $('menuBtn').hidden = menuOpen;
  $('catBar').hidden = !menuOpen;
  if (!menuOpen) $('subMenu').hidden = true;
  const curCat = catOfTool();
  document.querySelectorAll('#catBar .cat').forEach(b => {
    b.classList.toggle('active', curCat === b.dataset.cat);
    b.classList.toggle('open', openCat === b.dataset.cat);
  });
  // まだ使えない物は見せない（施設＝事務所レベル2から、スキル＝研究所ができてから）
  $('facBtn').hidden = true;   // v0.56：施設は「工事」にまとめた
  $('powerBtn').hidden = S.stage < 2;   // 段階1（岩盤Lv0の前）では「強化」を出さない（トラック・フォークリフトはタップで強化できる）
  $('skillBtn').hidden = !S.lab.built;
  $('tradeBtn').hidden = S.office.lv < 1;
  const curName = tool === 'none' || tool === 'pan' ? '' : tool === 'machine' ? T.mach[machSel] : tool === 'lab' ? T.labName : T[tool];
  const dirTool = tool === 'conv' || tool === 'sort' || tool === 'tee' || tool === 'cross' || tool === 'machine';
  $('menuCur').textContent = curName ? `（${curName}）` : '';
  // 選択中の道具（左下に表示）：名前・向き・費用
  const ct = $('curTool');
  ct.hidden = !curName;
  if (curName) {
    const cost = buildCost(toolId());
    const txt = `${curName}${cost ? '　' + fmt(cost) : ''}`;   // 向きは、すぐ右の向きのバーに出る
    if (ct.dataset.txt !== txt) {   // 変わった時だけ作り直す（押している間に作り直すと、押せない）
      ct.dataset.txt = txt; ct.textContent = '';
      const xb = document.createElement('span'); xb.className = 'ctx'; xb.textContent = '✕';
      const nm = document.createElement('span'); nm.textContent = txt; ct.append(xb, nm);   // ✕ を左に
    }
  } else ct.dataset.txt = '';
  document.querySelectorAll('.dir').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
  $('dirBar').hidden = !dirTool; document.querySelector('.dir[data-dir="auto"]').hidden = tool !== 'conv';
  cv.classList.toggle('grab', tool === 'pan' && !(gesture && gesture.type === 'pan'));
  cv.classList.toggle('grabbing', !!(gesture && gesture.type === 'pan'));
  cv.classList.toggle('place', tool !== 'pan' && tool !== 'none');
  layoutFloats();
  if (S.tut || S.tut2) tutArrow(); else if (!$('tutArrow').hasAttribute('hidden')) $('tutArrow').setAttribute('hidden', '');
}
// 浮いているボタン類の位置（実際の大きさを見て、重ならないように）
// 右下：メニュー（またはメニューを開いた列）→ その上に種類 → その上に向き
function layoutFloats() {
  const H = window.innerHeight;
  $('msg').style.top = '';   // メッセージは上の真ん中（資金などに重なってよい）
  const mh = $('moneyHud');
  if (S && !S.tut && !(S.tut2 && S.tut2.step !== 'wait')) $('tutMsg').style.top = '';   // はじめの手順のメッセージも、上に（引き出しと重ならない）   // 資金・目標・AIの表示と重ならないように
  const base = dashOn ? $('dash') : !$('catBar').hidden ? $('catBar') : $('menuBtn');
  const bt = base.getBoundingClientRect().top;
  let bottom = H - bt + 4;
  if (dashOn) bottom = H - bt;
  if (!$('subMenu').hidden) { $('subMenu').style.bottom = bottom + 'px'; bottom += $('subMenu').offsetHeight + 4 + (dashOn ? 22 : 0); }
  // 向きのバーは、左下の「× コンベア」のすぐ右に1本につなげる（入らない時は、その上の段）
  const ct2 = $('curTool'), db = $('dirBar');
  if (!ct2.hidden && !db.hidden) {
    const r2 = ct2.getBoundingClientRect(), W2 = window.innerWidth;
    db.classList.add('joined'); db.style.right = 'auto';
    if (r2.right + db.offsetWidth <= W2 - 4) { db.style.left = (r2.right - 1) + 'px'; db.style.bottom = (H - r2.bottom) + 'px'; db.style.height = r2.height + 'px'; db.classList.remove('above'); }
    else { db.style.left = r2.left + 'px'; db.style.bottom = (H - r2.top + 2) + 'px'; db.style.height = ''; db.classList.add('above'); }
  } else { db.classList.remove('joined', 'above'); db.style.left = ''; db.style.right = ''; db.style.height = ''; db.style.bottom = bottom + 'px'; }
  document.querySelectorAll('.panel.bottom').forEach(p => { p.style.bottom = (H - bt + (dashOn ? 0 : 4)) + 'px'; });
  syncDash();
}
let msgTimer = 0;
// 秘書の顔（16×16のドット絵）：good＝笑顔・bad＝困り顔・normal＝ふつう
const SEC_PAL = { k: '#2b2420', h: '#3b2b26', s: '#f6d2b4', S: '#e7b693', e: '#2b2b2e', w: '#ffffff', m: '#c0583c', c: '#f0a0a0', b: '#3f4a5c', B: '#56647c', t: '#f4f2ee', g: '#8a96a8' };
const SEC_BASE = [
  '.....hhhhhh.....', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhhsssssshhh..', '.hhhssssssssshh.', '.hhsssssssssshh.',
  '.hhsssssssssshh.', '.hhsssssssssshh.', '.hhsssssssssshh.', '..hhssssssssh...', '...hSsssssSh....', '.....SssssS.....',
  '....bbtttbbb....', '..bbbbBtBbbbbb..', '.bbbbbBtBbbbbbb.', '.bbbbbbbbbbbbbb.',
];
const SEC_FACE = {   // 目（行6）・まゆ（行5）・口（行9）・ほお（行8）
  normal: { 5: [[5, 'h'], [10, 'h']], 6: [[5, 'e'], [10, 'e']], 9: [[7, 'm'], [8, 'm']] },
  good:   { 5: [[5, 'h'], [10, 'h']], 6: [[4, 'e'], [6, 'e'], [9, 'e'], [11, 'e']], 7: [[5, 'e'], [10, 'e']], 8: [[4, 'c'], [11, 'c']], 9: [[6, 'm'], [9, 'm']], 10: [[7, 'm'], [8, 'm']] },
  bad:    { 5: [[4, 'h'], [6, 'h'], [9, 'h'], [11, 'h']], 4: [[5, 'h'], [10, 'h']], 6: [[5, 'e'], [10, 'e']], 9: [[7, 'm'], [8, 'm']], 10: [[6, 'm'], [9, 'm']] },
};
const SEC_CV = {};
const WHO_PAL = {   // 部署の人：髪（h）・服（b,B）・えり（t）の色を変える
  sec: {}, hr: { h: '#7a4a2a', b: '#3f7a52', B: '#5a9a6e' }, tech: { h: '#2a2a2a', b: '#6a6f78', B: '#8a909a', t: '#e8c34a' }, sales: { h: '#4a3020', b: '#2a3550', B: '#3a4a6a', t: '#d8402c' },
};
function secFace(mood, who = 'sec') {
  const id = mood + who; if (SEC_CV[id]) return SEC_CV[id];
  const pal = { ...SEC_PAL, ...(WHO_PAL[who] || {}) };
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
  const base = who === 'sec' ? SEC_BASE : SEC_BASE.map((row, y) => (y < 3 ? row.replace(/h/g, (m2, x) => (x > 3 && x < 12 ? 'h' : '.')) : row));   // 部署の人は短い髪
  base.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  for (const [y, pts] of Object.entries(SEC_FACE[mood] || SEC_FACE.normal)) for (const [x, ch] of pts) { g.fillStyle = pal[ch]; g.fillRect(x, +y, 1, 1); }
  return (SEC_CV[id] = c);
}
const secOn = () => !!S && S.office.lv >= 2;   // 秘書は、会社レベル3から（それまでは名前も顔もないお知らせ）
// 気分：困った知らせは bad、うれしい知らせは good
function moodOf(t) {
  const T = tx();
  const bad = [T.noMoney, T.cantPlace, T.cantDig, T.underOnly, T.full, T.quit, T.busy, T.forkFull, T.needLab, T.labWhere, T.saveNG, T.landHint];
  if (bad.includes(t)) return 'bad';
  return 'normal';
}
function secIcon(mood, cls, who) { const c = document.createElement('canvas'); c.width = c.height = 16; c.className = cls || 'secIcon'; const g = c.getContext('2d'); g.drawImage(secFace(mood, who), 0, 0); return c; }
let msgAt = null;   // メッセージに関係する所（タップでそこへ飛ぶ）
function say(t, ms, mood, at, who) {
  const el = $('msg');
  if (t && S && (S.tut || (S.tut2 && S.tut2.step !== 'wait')) && t !== tx().tutDone) return;   // 案内の間は、ふつうのメッセージは出さない
  if (t && (tripGather || launchT) && !t.startsWith(tx().tripCall) && t !== tx().tripGo) return;   // 集合・発進の間は、社員旅行の知らせだけ
  msgAt = at || null; el.classList.toggle('jump', !!msgAt);
  if (!t) { el.innerHTML = ''; xAvoidMsg(); return; }
  mood = mood || moodOf(t);
  el.innerHTML = ''; el.className = 'msg ' + mood + (msgAt ? ' jump' : '');
  const tx_ = document.createElement('span'); tx_.className = 'mtext'; tx_.textContent = t;
  if (who || secOn()) el.append(secIcon(mood, null, who || 'sec'), tx_); else el.append(tx_);
  el.classList.toggle('jump', !!msgAt);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.innerHTML = ''; xAvoidMsg(); }, ms || Math.max(2200, 900 + t.length * 90));   // 長い文は長めに出す
  requestAnimationFrame(xAvoidMsg);   // ×と重なったら下げる
}

function setupText() {
  const T = tx();
  document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
  document.title = T.title;
  document.querySelectorAll('[data-t]').forEach(el => { const v = T[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  $('ver').textContent = 'v' + VERSION; $('tVer').textContent = 'v' + VERSION;
  document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  document.querySelector('#hdr .wm').hidden = lang === 'en';
  $('adminBtn').hidden = !DEV;
  $('panBtn').title = T.pan;
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
  updateUI(); fitHeader();   // 言葉を変えたら、ヘッダーのはみ出しを測り直す
}

// ---- 入力 ----
const ptrs = new Map();
let gesture = null, down = false, lastK = -1, dragSet = new Set(), lastPend = false;
// 指を離した時のタップ：設置中は置く（地上の施設・地下の物はメニュー）
function tapPlace(p) {
  if (S.tut && tutTap(p)) return;
  if (tool !== 'dig' && (!isBuildTool() || p.r < SKY) && tapAt(p)) return;
  apply(p.c, p.r, false);
}
function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function cellAtXY(x, y) { const wx = (x - offX) / cp + cam.x, wy = y / cp + cam.y; return { c: Math.floor(wx), r: Math.floor(wy), wx, wy }; }
const stLabel = st => { const T = tx(); return st.type === 'machine' ? T.mach[st.m] : st.type === 'sort' ? T.sortTitle : st.type === 'well' ? T.wellName[st.kind] : st.type === 'pipe' ? T.pipe : T[st.tid || st.type] || st.type; };
function tapAt(p) {
  if (S.tut && tutTap(p)) return true;   // はじめの手順
  const truckT = p.r === YARD_R && p.c === BED && BED >= 0, offT = isOffice(p.c, p.r) || officeTap(p.c, p.r), labT = isLab(p.c, p.r);
  const openLab = () => { if (S.lab.built) togglePanel('skillPanel'); else say(tx().needLab); };
  if (tool !== 'none') {   // 道具を持っている時：撤去なら、そのまま撤去へ（メニューは開かない）
    if (tool !== 'remove') { if (truckT) { openPop('truck'); return true; } if (offT) { togglePanel('office'); return true; } if (labT) { openLab(); return true; } }
  }
  if (!owned(p.c) && p.r >= YARD_R && tool === 'none') { say(tx().landHint, 3500); return true; }
  const T = tx(), s = inB(p.c, p.r) && S.st.get(key(p.c, p.r)), ev = inB(p.c, p.r) && S.elev[key(p.c, p.r)];
  if (tool === 'none') {   // 重なっている物は、全部どれを選ぶか選べる（1つだけなら、すぐそれ）
    const cands = [];
    if (truckT) cands.push([T.truck, () => openPop('truck')]);
    if (offT) cands.push([T.office, () => togglePanel('office')]);
    if (labT) cands.push([T.labName, openLab]);
    const addKinds = (list, c0, r0) => {   // 資源は種類ごとにまとめる（数つき）
      const cnt = new Map();
      for (const it of list) { const id = it.k + '|' + (it.of || ''); const e = cnt.get(id) || { k: it.k, of: it.of, n: 0 }; e.n++; cnt.set(id, e); }
      for (const e of [...cnt.values()].sort((x, y) => y.n - x.n)) cands.push([(e.k === 'bag' && e.of ? `${T.items.bag}（${T.items[e.of]}）` : T.items[e.k]) + (e.n > 1 ? ` ×${e.n}` : ''), () => openPop({ type: 'item', k: e.k, of: e.of, c: c0, r: r0 })]);
    };
    if (p.wx !== undefined) addKinds(S.items.filter(it => Math.hypot(it.x - p.wx, it.y - p.wy) < 0.4), p.c, p.r);   // 資源（動いている物）
    if (p.r === YARD_R && facAt(p.c)) { const f0 = facAt(p.c); cands.push([T.fac[f0.f], () => openPop(f0)]); }
    if (p.r === YARD_R) { const f = S.forks.find(o => Math.abs(o.x - (p.c + 0.5)) < 0.6); if (f) cands.push([T.forkName, () => openPop(f)]); }
    if (p.r === YARD_R && S.dock[p.c] && S.dock[p.c].length) addKinds(S.dock[p.c], p.c, p.r);   // 地上に出た資源の山：種類ごと
    if (s) cands.push([stLabel(s), () => openPop(s)]);
    if (ev) cands.push([T.elev, () => openPop({ type: 'elev', c: p.c, r: p.r })]);
    if (inB(p.c, p.r) && S.lamps[key(p.c, p.r)]) cands.push([T.lamp, () => openPop({ type: 'lamp', c: p.c, r: p.r })]);
    if (!s && inB(p.c, p.r) && S.lids[key(p.c, p.r)]) cands.push([T.lidName, () => openPop({ type: 'lid', c: p.c, r: p.r })]);
    if (cands.length === 1) { cands[0][1](); return true; }
    if (cands.length > 1) { openPop({ type: 'pick', c: p.c, r: p.r, opts: cands }); return true; }
  } else {
    if (p.r === YARD_R && facAt(p.c) && tool !== 'remove') { openPop(facAt(p.c)); return true; }
    if (s && tool !== 'remove') { openPop(s); return true; }
  }
  // 何も選んでいない時に土をタップ → 「掘削？」（掘れる所だけ）
  const b = tool === 'none' && inB(p.c, p.r) && p.r >= SKY && blk(p.c, p.r);
  if (b) {
    if (diggable().has(key(p.c, p.r)) && !(b.mat === 'rock' && false)) { openPop({ type: 'digcell', c: p.c, r: p.r }); return true; }
    if (b.mat === 'rock' && diggable().has(key(p.c, p.r))) { say(tx().needDig(rockLv(b.layer))); return true; }
  }
  return false;
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  const q = local(e);
  ptrs.set(e.pointerId, q);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 指の情報が無い環境 */ }
  if (ptrs.size === 2) {
    down = false; if (gesture && gesture.tm) clearTimeout(gesture.tm);
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z,
      wc: (mx - offX) / cp + cam.x, wr: my / cp + cam.y };
    return;
  }
  if (ptrs.size > 2) return;
  const hadPop = !!popTarget || PANELS.some(id => !$(id).hidden) || !!openCat;
  lastPend = !!popTarget && popTarget.type === 'pend';
  closePop(); closePanels();
  if (openCat) { openCat = null; renderSub(); }
  const pendTap = popTarget === null && hadPop && lastPend;   // ドリルの仮置き中に別のマスを押した → そこへ置き直す
  if (tool === 'pan' || e.button === 1 || e.button === 2 || !isDragTool(tool)) {
    gesture = { type: 'pan', sx: q.x, sy: q.y, cx: cam.x, cy: cam.y, moved: false, hadPop: hadPop && !pendTap, tap: e.button === 0 && tool !== 'pan' };
    updateUI();
    return;
  }
  const p = cellAtXY(q.x, q.y);
  dragDir = null;
  if (e.pointerType !== 'mouse') {   // 指：すぐ離したら1つ置く・動かしたら画面の移動・長押ししてからなぞると続けて置く
    gesture = { type: 'hold', sx: q.x, sy: q.y, cx: cam.x, cy: cam.y, p, hadPop };
    const g = gesture;
    g.tm = setTimeout(() => { if (gesture === g && !g.hadPop && g.p.r >= SKY) startDrag(g.p); }, 380);
    updateUI();
    return;
  }
  // 設置中は、地下の物をタップすると上書き（地上の施設はいつもどおりメニュー）
  if (tool !== 'dig' && (!isBuildTool() || p.r < SKY) && tapAt(p)) return;
  if (hadPop) return;
  startDrag(p);
});
// なぞって続けて置く（マウスは押したらすぐ。指は長押ししてから）
function startDrag(p) {
  gesture = null;
  down = true; lastK = key(p.c, p.r); dragSet = new Set(); apply(p.c, p.r, false);
  const s0 = S.st.get(lastK); if (s0 && s0.type === 'conv') dragSet.add(s0);
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { /* 震えない端末 */ }
  updateUI();
}
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
  if (gesture && gesture.type === 'hold') {   // 長押しの前に指が動いた → 画面の移動（置かない）
    if (Math.abs(q.x - gesture.sx) + Math.abs(q.y - gesture.sy) <= 10) return;
    clearTimeout(gesture.tm);
    gesture = { type: 'pan', sx: gesture.sx, sy: gesture.sy, cx: gesture.cx, cy: gesture.cy, moved: true, hadPop: true, tap: false };
  }
  if (gesture && gesture.type === 'pan') {
    if (Math.abs(q.x - gesture.sx) + Math.abs(q.y - gesture.sy) > 8) gesture.moved = true;
    if (!gesture.moved) return;   // 少し動いただけなら、まだタップ扱い（画面は動かさない）
    cam.x = gesture.cx - (q.x - gesture.sx) / cp;
    cam.y = gesture.cy - (q.y - gesture.sy) / cp;
    metrics();
    return;
  }
  if (!down) return;
  const k = key(hover.c, hover.r);
  if (k !== lastK) {
    const pk = lastK; lastK = k;
    if (tool === 'conv') {   // なぞった向きにそろえる（曲がり角も）。v0.61から基本機能
      const dc = cOf(k) - cOf(pk), dr = rOf(k) - rOf(pk);
      const d = dc === 1 && !dr ? 'right' : dc === -1 && !dr ? 'left' : dr === 1 && !dc ? 'down' : dr === -1 && !dc ? 'up' : null;
      if (d) { const ps = S.st.get(pk); if (ps && dragSet.has(ps)) ps.dir = d; dragDir = d; }
    }
    apply(hover.c, hover.r, true);
    const ns = S.st.get(k); if (ns && ns.type === 'conv') dragSet.add(ns);
    updateUI();
  }
});
function endPtr(e) {
  const q = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (gesture && gesture.type === 'hold') {   // 長押しにならずに離した → 1つ置く（物があればメニュー）
    clearTimeout(gesture.tm); const g = gesture; gesture = null;
    if (!g.hadPop && e.type === 'pointerup') { const p = g.p; if (!(tool !== 'dig' && (!isBuildTool() || p.r < SKY) && tapAt(p))) apply(p.c, p.r, false); }
  }
  if (gesture && gesture.type === 'pan' && !gesture.moved && e.button === 0 && q && !gesture.hadPop) { const p = cellAtXY(q.x, q.y); if (gesture.tap) tapPlace(p); else tapAt(p); }
  if (ptrs.size === 0) gesture = null;
  else if (gesture && gesture.type === 'pinch') gesture = null;
  down = false;
  updateUI();
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

// ▲▼◀▶：押している間なめらかに動く
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
  const sp = 8 * dt;
  for (const d of moveHeld) { const [dx, dy] = DIRS[d]; cam.x += dx * sp; cam.y += dy * sp; }
  metrics();
}

document.querySelectorAll('.dir').forEach(b => b.addEventListener('click', () => { dir = b.dataset.dir; memSet(toolId(), dir); updateUI(); }));
$('playBtn').addEventListener('click', () => { running = !running; updateUI(); });
$('speedBtn').addEventListener('click', () => { speedIdx = (speedIdx + 1) % speeds().length; updateUI(); });
$('zoomIn').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 0.8));
$('topBtn').addEventListener('click', () => { cam.y = camTop(); metrics(); });
$('powerBtn').addEventListener('click', () => togglePanel('powerPanel'));
$('tradeBtn').addEventListener('click', () => togglePanel('tradePanel'));
$('skillBtn').addEventListener('click', () => { if (S.lab.built) togglePanel('skillPanel'); });
$('helpBtn').addEventListener('click', () => togglePanel('help'));
$('setBtn').addEventListener('click', () => togglePanel('settings'));
$('adminBtn').addEventListener('click', () => togglePanel('admin'));
// タイトルを押すと「タイトルにもどりますか？」（自動でセーブしてから）
document.querySelector('#hdr .brand').addEventListener('click', () => askConfirm(tx().confirmTitle, () => { autoSave(); showTitle(); }));
$('resetBtn').addEventListener('click', () => askConfirm(tx().confirmReset, () => {
  closePop(); closePanels(); newGame(); resetCam(); updateUI(); autoSave();
}));
window.addEventListener('keydown', e => {
  if (!$('confirm').hidden || inTitle) return;
  if (e.code === 'Space') { e.preventDefault(); running = !running; }
  else if (e.key === 'r' || e.key === 'R') { dir = ROT[(ROT.indexOf(dir) + 1) % 4]; memSet(toolId(), dir); }
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
// ヘッダーがはみ出していたら、段階的に詰める（画面幅の決め打ちではなく、実際に測る）
function fitHeader() {
  const h = $('hdr'), rows = [...h.querySelectorAll('.hrow')];
  const over = () => rows.some(r => r.scrollWidth > r.clientWidth + 1);
  h.classList.remove('c1', 'c2', 'c3', 'c4', 'c5');
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) { if (!over()) break; h.classList.add(c); }   // c4：「ズーム」の字と区切りを消す・c5：さらに詰める
}
window.addEventListener('resize', fitHeader);
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });   // iOS：ページ全体の拡大を止める
function setFold(f) {
  document.body.classList.toggle('hfold', f);
  $('unfoldBtn').hidden = !f;
  fitHeader(); resize(); updateUI();
}
$('foldBtn').addEventListener('click', () => setFold(true));
$('unfoldBtn').addEventListener('click', () => setFold(false));
setInterval(fitHeader, 1000);   // 資金の桁が増えたときも
requestAnimationFrame(fitHeader);

// ---- テスト用：自動プレイ（簡単なAI） ----
// 雇う・会社レベル・研究所・研究・強化（ドリル・トラック・フォークリフト・売値）に加えて、
// build=true なら「設置」も考える：ドリルを増やす／コンベアの列の途中に機械を入れる／湧き口をパイプでつなぐ／地上の施設を建てる
// 機械を入れる段（地下1段目から数えて）：上ほど最後の仕上げ。下の機械で作った物が、上の機械に流れて行く
const AUTO_SLOT = { bagger: 0, kiln: 1, crusher: 2, factory: 3, smelter: 4, polisher: 5, cutter: 6, washer: 7 };
const autoFreeCol = () => { for (let c = S.landL; c <= S.landR; c++) if (surfaceFree(c)) return c; return undefined; };
function autoPut(k, obj, cost) {   // 地下に置く（今ある物は撤去してから）
  if (S.money < cost) return false;
  if (S.st.has(k)) removeAt(k);
  spend(cost, cOf(k) + 0.5, rOf(k) + 0.3); S.st.set(k, obj); S.stVer++;
  return true;
}
// 湧き口から地下1段目まで、空いたマスをたどってパイプの道を探す
// 湧き口から地下1段目まで、パイプの道を探す。空いたマス（安い）と、掘れる土（掘る費用がかかる）を通れる。
// 縦穴のコンベアなど、置いた物のあるマスは通れない（湧き口はたいてい縦穴の底にできるので、横の土を掘って上がる）
function autoPipePath(wk) {
  const dist = new Map([[wk, 0]]), prev = new Map([[wk, -1]]), done = new Set();
  const stepCost = (c, r) => {
    const b = blk(c, r);
    if (b) return b.mat === 'rock' && false ? Infinity : COST.pipe + digCost(b);
    const s2 = S.st.get(key(c, r));
    if (s2 && s2.type !== 'pipe') return Infinity;
    return s2 ? 0 : COST.pipe;
  };
  for (let guard = 0; guard < 4000; guard++) {   // 小さな盤面なので、いちばん安い所を順に広げる
    let k = -1, bd = Infinity;
    for (const [k2, d] of dist) if (!done.has(k2) && d < bd) { bd = d; k = k2; }
    if (k < 0) return null;
    done.add(k);
    const c = cOf(k), r = rOf(k);
    if (r === SKY && k !== wk) { const p2 = []; for (let x = k; x !== wk; x = prev.get(x)) p2.push(x); return { path: p2, cost: bd }; }
    for (const [dx, dy] of NB) {
      const nc = c + dx, nr = r + dy, nk = key(nc, nr);
      if (!inB(nc, nr) || nr < SKY || done.has(nk)) continue;
      const sc = stepCost(nc, nr); if (sc === Infinity) continue;
      const nd = bd + sc;
      if (!dist.has(nk) || nd < dist.get(nk)) { dist.set(nk, nd); prev.set(nk, k); }
    }
  }
  return null;
}
// ---- 機械の使い方を、AIが自分で考える（MACHINES のレシピから。新しい機械が増えても、そのまま使える） ----
// 振り分けの組み方：縦のコンベア（↑）の途中を仕分けにして、材料だけを横の機械へ。機械は上向き、製品は1マス上のコンベアで列に戻す。
//   ↑ ← 戻し        （r-1）
//   仕 → 機械↑      （r）      材料が2つの機械は、もう1段下に「仕 → ↑」を足して、下からも入れる（r+1）
// 上の段ほど後の工程（下で作った物が、上の機械に流れて行く）
const AUTO_RAW = ['soil', 'stone', 'iron', 'gold', 'dia'];
const recInsOf = rec => (rec.ins ? Object.keys(rec.ins) : [rec.in]);
const recNOf = (rec, x) => (rec.ins ? rec.ins[x] : rec.n);
const AUTO_LINES = (() => {
  const depth = {}; for (const r of AUTO_RAW) depth[r] = 0;
  const all = [];
  for (const m of MACHINE_ORDER) for (const rec of MACHINES[m].recipes || []) all.push({ m, rec, ins: recInsOf(rec), id: m + ':' + rec.out });
  for (let pass = 0; pass < 12; pass++) for (const l of all) {
    if (l.ins.some(x => depth[x] === undefined)) continue;
    const d = Math.max(...l.ins.map(x => depth[x])) + 1;
    if (depth[l.rec.out] === undefined || depth[l.rec.out] < d) depth[l.rec.out] = d;
  }
  const lines = all.filter(l => depth[l.rec.out] !== undefined).map(l => ({ ...l, depth: depth[l.rec.out] }));
  lines.sort((a, b) => a.depth - b.depth);   // 前の工程から
  return lines;
})();
// 今使う工程を選ぶ：掘っている資源から作れる物だけ。材料ごとに、いちばん得になる使い道を1つ
function autoPlan() {
  const lines = AUTO_LINES.filter(l => S.unlock[l.m]);
  const raw = AUTO_RAW.filter(r => S.sold['@' + r]);
  const prod = new Set(raw);
  for (let p = 0; p < 8; p++) for (const l of lines) if (l.ins.every(x => prod.has(x))) prod.add(l.rec.out);
  const usable = lines.filter(l => l.ins.every(x => prod.has(x)));
  // 1個あたりの値打ち：売る・加工する のうち高い方。材料が2つの物は、もうけを材料で山分けして考える
  const value = cand => {
    const w = {}; for (const k of ITEM_ORDER) w[k] = ITEMS[k].v;
    const single = cand.filter(l => l.ins.length === 1), multi = cand.filter(l => l.ins.length > 1);
    const up = () => { for (let p = 0; p < 8; p++) for (const l of single) w[l.ins[0]] = Math.max(w[l.ins[0]], w[l.rec.out] / l.rec.n); };
    up();
    const w1 = { ...w }, per = new Map();
    for (const l of multi) {
      const n = l.ins.reduce((a, y) => a + recNOf(l.rec, y), 0), gain = w[l.rec.out] - l.ins.reduce((a, y) => a + w1[y] * recNOf(l.rec, y), 0);
      per.set(l, x => w1[x] + gain / n);
    }
    for (const l of multi) for (const x of l.ins) w[x] = Math.max(w[x], per.get(l)(x));
    up();
    return { w, per: (l, x) => (l.ins.length > 1 ? per.get(l)(x) : w[l.rec.out] / l.rec.n) };
  };
  // 選ぶ：材料ごとに、いちばん値打ちの出る使い道。選べなかった使い道は外して、もう一度考える
  const out = new Set();
  let cand = usable;
  for (let loop = 0; loop < 10; loop++) {
    const { w, per } = value(cand);
    const chosen = new Set(), have = new Set(raw), failed = [];
    for (const l of cand) {   // 浅い工程から
      if (!l.ins.every(x => have.has(x))) { failed.push(l); continue; }
      if (!l.ins.every(x => per(l, x) > ITEMS[x].v + 1e-9 && per(l, x) >= w[x] - 1e-9)) { failed.push(l); continue; }
      chosen.add(l.id); have.add(l.rec.out);
    }
    // 材料なのに使い道が1つも選ばれていない物があれば、それを当てにして選べなかった工程を外す
    const drop = failed.filter(l => l.ins.some(x => have.has(x) && !cand.some(o => chosen.has(o.id) && o.ins.includes(x))) && per0(l, w, per));
    out.clear(); for (const id of chosen) out.add(id);
    if (!drop.length) break;
    cand = cand.filter(l => !drop.includes(l));
  }
  return out;
  function per0(l, w, per) { return l.ins.some(x => per(l, x) >= w[x] - 1e-9); }   // その材料のいちばんの使い道だった
}
// 縦穴（列c）に今ある工程を読み取る：仕分けの段と、横の機械から
function shaftLines(c) {
  const out = [];
  for (let rr = SKY + 1; rr <= S.deepest + 1; rr++) {
    const s = S.st.get(key(c, rr));
    if (!s || s.type !== 'sort') continue;
    const dx = s.side === 'right' ? 1 : -1;
    const m = machineAt(c + dx, rr), below = S.st.get(key(c + dx, rr));
    if (m && m.dir === 'up') {
      const rec = (MACHINES[m.m].recipes || []).find(x => recInsOf(x).includes(s.filter));
      if (rec) out.push({ id: m.m + ':' + rec.out, top: rr - 1, bot: rr, ins: [s.filter], out: rec.out, rows: [rr] });
    } else if (below && below.type === 'conv' && below.dir === 'up' && out.length && out[out.length - 1].bot === rr - 1) {   // 2つ目の材料（下から入れる段）
      const l = out[out.length - 1]; l.bot = rr; l.ins.push(s.filter); l.rows.push(rr);
    }
  }
  return out;
}
function autoSortLines(drills) {
  const chosen = autoPlan();
  const drillCols = new Set(drills.map(([k]) => cOf(k)));
  const free = (c, r) => inB(c, r) && !S.st.has(key(c, r)) && !drillCols.has(c) && (blk(c, r) === null || blk(c, r).mat !== 'rock');
  const upConv = s => s && s.type === 'conv' && s.dir === 'up';
  for (const [dk] of drills) {
    const c = cOf(dk);
    let have = shaftLines(c);
    // もっと良い使い道ができた工程は、仕分けをただのコンベアに戻す
    for (const l of have) if (!chosen.has(l.id)) {   // 使わなくなった工程：仕分けはただのコンベアに、横の機械は撤去して縦穴向きのコンベアに（敷きなおせるよう場所を空ける）
      for (const rr of l.rows) { const s = S.st.get(key(c, rr)); const dx2 = s.side === 'right' ? 1 : -1; s.type = 'conv'; delete s.filter; delete s.side; S.stVer++;
        const mk = key(c + dx2, rr), ms2 = S.st.get(mk); if (ms2 && (ms2.type === 'machine' || ms2.type === 'conv')) { removeAt(mk); S.st.set(mk, { type: 'conv', dir: dx2 > 0 ? 'left' : 'right', lv: 0 }); aiNote.push(tx().aiRebuild); } }
    }
    have = have.filter(l => chosen.has(l.id));
    for (const l of AUTO_LINES) {   // 前の工程から順に
      if (!chosen.has(l.id) || have.some(h => h.id === l.id)) continue;
      // 置ける段：材料を作る工程より上、製品を使う工程より下。その中でいちばん深い所（上は後の工程のために空けておく）
      const raw = l.ins.every(x => AUTO_RAW.includes(x));
      const prods = have.filter(h => l.ins.includes(h.out)), cons = have.filter(h => h.ins.includes(l.rec.out));
      if (!raw && !l.ins.every(x => AUTO_RAW.includes(x) || prods.some(h => h.out === x))) continue;   // 材料をこの縦穴で作っていない
      const hi = prods.length ? Math.min(...prods.map(h => h.top)) - 1 : rOf(dk) - 2;   // ここより上（ブロックの一番下の段）
      const lo = cons.length ? Math.max(...cons.map(h => h.bot)) + 1 : SKY;             // ここより下（ブロックの一番上の段）
      const n = l.ins.length;
      for (let bot = hi; bot - n >= lo; bot--) {
        const r = bot - n + 1, rows = l.ins.map((_, i) => r + i), side = [r - 1, ...rows];
        if (have.some(h => h.bot >= r - 1 && h.top <= bot)) continue;   // ほかの工程と重なる
        if (!rows.every(rr => upConv(S.st.get(key(c, rr)))) || !isBelt(S.st.get(key(c, r - 1)))) continue;
        const dx = [1, -1].find(d => side.every(rr => free(c + d, rr)));
        if (dx === undefined) continue;
        const digs = side.map(rr => blk(c + dx, rr)).filter(Boolean).reduce((a, b) => a + digCost(b), 0);
        const cost = buildCost('m:' + l.m) + (COST.sort + COST.conv) * n + digs;
        if (S.money < cost * 2 * aiR()) return;
        for (const rr of side) if (blk(c + dx, rr)) { spend(digCost(blk(c + dx, rr)), c + dx + 0.5, rr + 0.3); row(rr)[c + dx] = null; S.digVer++; }
        autoPut(key(c + dx, r), { type: 'machine', m: l.m, dir: 'up', lv: 0, buf: {}, bags: {}, cur: null, prog: 0, op: null }, buildCost('m:' + l.m));
        autoPut(key(c + dx, r - 1), { type: 'conv', dir: dx > 0 ? 'left' : 'right', lv: 0 }, COST.conv);
        if (n > 1) autoPut(key(c + dx, rows[1]), { type: 'conv', dir: 'up', lv: 0 }, COST.conv);   // 2つ目の材料は下から
        rows.forEach((rr, i) => autoPut(key(c, rr), { type: 'sort', dir: 'up', lv: 0, filter: l.ins[i], side: dx > 0 ? 'right' : 'left' }, COST.sort));
        return;   // 1回に1つずつ
      }
    }
  }
}
// 地上の施設：使う液体（新しい施設はここに足すだけで、AIも使う）
const FAC_USE = { spa: ['hot'], power: ['hot', 'oil'], refinery: ['oil'], museum: ['rare'] };

// ---- 自動プレイの「失敗」：銀行の融資（300）はプレイヤーの救済なので、AIが借りたら失敗として原因を残す ----
// 学んだこと（お金の残し方など）は、この端末に覚えておき、次の自動プレイで使う
const AI_KEY = 'digfactory.aiLearn';
const aiLearn = (() => { let d = null; try { d = JSON.parse(localStorage.getItem(AI_KEY)); } catch (e) { /* 読めない時は初期値 */ } return Object.assign({ reserve: 1, truck: 1, fails: [] }, d || {}); })();
const aiR = () => aiLearn.reserve;   // お金を残す倍率（失敗すると上がる）
function aiSave() { try { localStorage.setItem(AI_KEY, JSON.stringify(aiLearn)); } catch (e) { /* 保存できなくても続ける */ } }
function autoDiagnose() {
  const c = [], sts = [...S.st.values()], drills = sts.filter(s => s.type === 'drill');
  const ms = S.stats.months.slice(-3), sale = ms.reduce((a, m) => a + m.sale, 0), cost = ms.reduce((a, m) => a + m.cost, 0);
  if (!drills.length) c.push('noDrill');
  else if (drills.every(d => d.off || d.stuck)) c.push('drillStop');
  if (!S.workers.length) c.push('noWorker');
  if (S.yard.length > valOf('truck') * 4) c.push('yard');
  if (Object.values(S.dock).reduce((a, p) => a + p.length, 0) > 20) c.push('dock');
  if (S.items.length > 300) c.push('jam');
  if (sale === 0) c.push('noSale');
  if (!c.length || cost > sale * 1.2) c.push('spend');
  return c;
}
function autoFail() {
  const causes = autoDiagnose();
  aiLearn.fails.unshift({ at: Date.now(), t: Math.round(S.time), stage: S.stage, depth: S.deepest - SKY, causes });
  aiLearn.fails = aiLearn.fails.slice(0, 20);
  if (causes.includes('spend') || causes.includes('noSale')) aiLearn.reserve = Math.min(3, Math.round((aiLearn.reserve + 0.25) * 100) / 100);   // 使いすぎ → 次はお金を多めに残す
  if (causes.includes('yard')) aiLearn.truck = Math.max(0.5, Math.round((aiLearn.truck - 0.1) * 100) / 100);    // ヤードが山 → 次はトラックを早めに強化
  aiSave(); autoRun.fails++;
  const T = tx(); aiLog = [T.aiFail(causes.map(x => T.aiCause[x]).join('・')), ...aiLog].slice(0, 4); showAiLog();
}
function aiFailText() {
  const T = tx(), A = T.adm;
  if (!aiLearn.fails.length) return A.failNone;
  return A.failHead(aiLearn.reserve, aiLearn.truck) + '\n' + aiLearn.fails.slice(0, 8).map(f =>
    A.failRow(fmtDur(f.t), f.stage, f.depth, f.causes.map(x => T.aiCause[x]).join('・'))).join('\n');
}

// 自動プレイ（見る）：AIが何をしたかを、前後の様子を比べて短い文にする（資金の下に小さく出す）
function autoSnap() {
  const sts = [...S.st.values()];
  return { w: S.workers.length, ol: S.office.lv, lab: S.lab.built, res: S.researches.map(r => r.id), tl: S.truck.lv, fn: S.forks.length,
    fl: S.forks.reduce((a, f2) => a + f2.lv, 0), dl: sts.filter(s => s.type === 'drill').reduce((a, s) => a + s.lv, 0),
    ml: sts.filter(s => s.type === 'machine').reduce((a, s) => a + s.lv, 0), pr: { ...(S.priceLv || {}) },
    dn: sts.filter(s => s.type === 'drill').length, ms: sts.filter(s => s.type === 'machine').map(s => s.m),
    pn: sts.filter(s => s.type === 'pipe').length, fac: S.fac.map(x => x.f), dirs: sts.filter(s => s.type === 'drill').map(s => s.dir).join(),
    sorts: sts.filter(s => s.type === 'sort').length };
}
let aiNote = [];   // その場で起きたこと（ドリルの撤去など）
function autoDiff(a, b) {
  const T = tx(), o = [...aiNote]; aiNote = [];
  if (b.w > a.w) o.push(T.aiHire(b.w - a.w));
  if (b.ol > a.ol) o.push(T.aiCompany(b.ol + 1));
  if (b.lab && !a.lab) o.push(T.aiLab);
  for (const id of b.res) if (!a.res.includes(id)) o.push(T.aiRes(resDef(id).name));
  if (b.tl > a.tl) o.push(T.aiTruck(b.tl + 1));
  if (b.fn > a.fn) o.push(T.aiForkBuy); else if (b.fl > a.fl) o.push(T.aiFork);
  if (b.dn > a.dn) o.push(T.aiDrill); else if (b.dl > a.dl) o.push(T.aiDrillUp);
  if (b.dirs !== a.dirs && b.dn === a.dn) o.push(T.aiTurn);
  for (const m of b.ms) { const i = a.ms.indexOf(m); if (i < 0) o.push(T.aiMach(T.mach[m])); else a.ms.splice(i, 1); }
  if (b.sorts < a.sorts) o.push(T.aiUnsort);
  if (b.ml > a.ml) o.push(T.aiMachUp);
  for (const r of Object.keys(b.pr)) if (b.pr[r] > (a.pr[r] || 0)) o.push(T.aiPrice(T.items[r]));
  if (b.pn > a.pn) o.push(T.aiPipe);
  for (const x of b.fac) if (!a.fac.includes(x)) o.push(T.aiFac(T.fac[x]));
  return o;
}
let aiLog = [];
function autoLiveStep() {
  const a = autoSnap(); autoStep(true);
  const lines = autoDiff(a, autoSnap());
  if (lines.length) { aiLog = [...lines.reverse(), ...aiLog].slice(0, 4); showAiLog(); }
}
function showAiLog() {
  const el = $('aiHud'); el.textContent = autoLive ? aiLog.map(x => '・' + x).join('\n') : '';
  $('liveBar').hidden = !autoLive; fitHeader();
}
// (c,r)から上へ、上向きのコンベア（仕分け）が地上まで続いているか（掘った物が地上まで上がるか）
function upToTop(c, r) {
  for (let rr = r; rr >= SKY; rr--) { const s = S.st.get(key(c, rr)); if (blk(c, rr) !== null || !s || !(s.type === 'conv' || s.type === 'sort') || s.dir !== 'up') return false; }
  return true;
}
// 新しいドリルを置く場所：地表か、上向きのコンベアの真下（撤去したドリルの縦穴など）。深いほど良い
function autoNewDrill(drills) {
  const used = new Set(drills.map(([k]) => cOf(k)));
  let best = null, side = null;
  for (const k of diggable()) {
    const c = cOf(k), r = rOf(k);
    if (r < SKY || c === YARD_C || used.has(c)) continue;
    const g = blk(c, r); if (!g || g.mat === 'rock' && false) continue;
    const upAt = upToTop;
    // 横向き（下向きが置けない時だけ）：縦穴の横から外へ掘る。掘った物は縦穴に戻って上がる
    for (const dx of [1, -1]) if (inB(c - dx, r) && upAt(c - dx, r) && (!side || r > side.r)) side = { c, r, ur: r, dir: dx > 0 ? 'right' : 'left' };
    if (used.has(c - 1) || used.has(c + 1)) continue;
    let ur = r - 1;   // 上の空いたマスをたどって、上向きのコンベアか地上に着けば、掘った物が上がる
    while (ur >= SKY && blk(c, ur) === null && !S.st.has(key(c, ur))) ur--;
    if (ur >= SKY && !upAt(c, ur)) continue;
    if (!best || r > best.sc) best = { c, r, ur, dir: 'down', sc: r };
  }
  if (!best) best = side;
  if (!best) return false;
  const keep = tool; tool = 'drill';
  const ok = canPlaceAt(best.c, best.r) && placePend({ c: best.c, r: best.r, dir: best.dir, tid: 'drill' });
  tool = keep;
  if (ok) for (let rr = Math.max(SKY, best.ur + 1); rr < best.r; rr++) autoPut(key(best.c, rr), { type: 'conv', dir: 'up', lv: 0 }, COST.conv);   // すき間にも上向きのコンベア
  return ok;
}
function autoAdit(drills) {
  const drillCols = new Set(drills.map(([k]) => cOf(k))), cost = buildCost('m:adit');
  if (S.money < cost + 60) return;   // 横穴は稼ぎの元なので、買えればすぐ置く
  for (const [dk] of drills) {
    const c = cOf(dk);
    for (let r = rOf(dk) - 2; r > SKY; r--) {   // 深い所から
      const sh = S.st.get(key(c, r));
      if (!sh || sh.type !== 'conv' || sh.dir !== 'up' || !upToTop(c, r) || !aditFree(c, r)) continue;
      for (const dx of [1, -1]) {
        const ac = c + dx, b = inB(ac, r) && blk(ac, r);
        if (!inB(ac, r) || drillCols.has(ac) || S.st.has(key(ac, r)) || b && b.mat === 'rock') continue;
        if (b) { spend(digCost(b), ac + 0.5, r + 0.3); row(r)[ac] = null; S.digVer++; }
        autoPut(key(ac, r), { type: 'machine', m: 'adit', dir: dx > 0 ? 'left' : 'right', lv: 0, buf: {}, bags: {}, cur: null, prog: 0, op: null }, cost);
        return;
      }
    }
  }
}
// AIのお金の使い方（試走で「24・60・120か月後の資金」が大きくなるように調整する重み）
// 数字＝「値段の何倍のお金があったら買うか」。大きいほど慎重
const AI_W = { belt: 1.5, hire: 100, office: 1.6, office0: 1.05, drill: 2, mach: 3, price: 3, resPad: 300, truck: 1.3, fork: 1.3,
  save: 0.5, gate: 1, mq: 1 };   // mq＝機械を強化する時の、順番待ちの数の下限   // save＝次の会社レベルの値段の何割を残しておくか／gate＝1なら、効く時だけ強化（機械は順番待ちがたまっている・ドリルは運ぶ所が空いている）
const AI_SKIP = new Set(['sk:speed', 'sk:dragPlus', 'sk:away']);   // 稼ぎに関係しない研究（画面の速さ・操作・放置時間）はAIは買わない
const aiResRank = id => (id === 'sk:digLv' ? 0 : id === 'm:adit' ? 1 : id === 'sk:labRoom' ? 1 : 2);
function autoStep(build = true) {
  const R = aiR(), W = AI_W;
  const all = [...S.st.entries()];
  const drills = all.filter(([, x]) => x.type === 'drill'), machines = all.filter(([, x]) => x.type === 'machine');
  const posts = drills.length + machines.length + S.fac.length + (S.lab.built ? 1 : 0);
  if (staffN() < Math.min(offCap(S.office.lv), posts + 1) && S.money > HIRE_FEE(hireLv()) + W.hire * R) hire();
  if (S.money > offCost(S.office.lv) * (S.office.lv ? W.office : W.office0) * R) officeUp();
  if (S.office.lv >= 1 && !S.lab.built && S.money > COST.lab + 50 * R) { const c = autoFreeCol(); if (c !== undefined) { spend(COST.lab, c + 0.5, YARD_R); S.lab.built = true; S.lab.c = c; addHist(tx().labBuilt); } }
  if (S.lab.built && S.researches.length < labRooms()) {
    const ids = allResIds().filter(id => resAvail(id) && !resDef(id).done && !AI_SKIP.has(id) && (id !== 'sk:digLv' || permitOk()) && !S.researches.some(r => r.id === id)).sort((a, b) => aiResRank(a) - aiResRank(b) || resDef(a).cost - resDef(b).cost);   // 掘削レベル → 横穴掘削口 → 安い順
    for (const id of ids) if (S.money >= resDef(id).cost + (aiResRank(id) < 2 ? 0 : W.resPad * R + offCost(S.office.lv) * W.save)) { startResearch(id); break; }
  }
  // 止まったドリル：掘れる向きがあれば向きを変える（横を先に、次に下）。どこも掘れなければ撤去して、別の所に置き直す
  for (const [dk, d] of drills) {
    if (!build || d.off || !d.stuck || (d.stuckT || 0) < 10) continue;
    // 向きを変えてよいのは、掘った物の出口（後ろ）が上へつながっている時だけ（つながらないと地下で詰まる）
    const c0 = cOf(dk), r0 = rOf(dk), exitOk = x => { const [bx, by] = DIRS[OPP[x]], bc = c0 + bx, br = r0 + by; return br < SKY || upToTop(bc, br) || (S.st.get(key(bc, br)) || {}).type === 'conv' && by === 0; };
    const nd = ['left', 'right', 'down'].find(x => x !== d.dir && !blockedFor(c0, r0, x) && exitOk(x));
    if (nd) { d.dir = nd; d.stuck = false; d.stuckT = 0; }
    else { removeAt(dk); aiNote.push(tx().aiRemove); }
    break;   // 1回に1台ずつ
  }
  // 運ぶ所が詰まっていたら、トラック・フォークリフトを先に強化
  const dockN = Object.values(S.dock).reduce((a, p) => a + p.length, 0);
  if (S.yard.length > valOf('truck') * 2 * aiLearn.truck) { const c = nextCost('truck'); if (c !== null && S.money > c * W.truck) levelUp('truck'); else if (c === null && S.money > truckAddCost() * 2 * R) addTruck(); }   // 上限なら増車
  if (dockN > 6) {
    const f0 = S.forks.reduce((a, b) => (a.lv <= b.lv ? a : b));
    const c = nextCost(f0);
    if (S.forks.length < forkMax() && S.money > FORK_BUY(S.forks.length + 1) * 1.5 && (f0.lv >= 2 || c === null)) buyFork();   // v0.98：台数を増やす方が効く
    else if (c !== null && S.money > c * W.fork) levelUp(f0);
  }
  if (S.yard.length > valOf('truck') * 4 && nextCost('truck') !== null && S.money < nextCost('truck') * 3) return;   // ヤードが山になっている → トラックのためにお金を残す
  // 会社レベル（目標）のためにためておく額。ほかの買い物は、これを割らない範囲で
  const keep = offCost(S.office.lv) * W.save;
  const can = c => c !== null && S.money - c >= keep;
  const queue = m => Object.values(m.buf || {}).reduce((a, v) => a + v, 0) + Object.values(m.bags || {}).reduce((a, v) => a + v, 0);
  const flowOk = S.yard.length <= valOf('truck') * 2 && dockN <= 6 && S.items.length < 60;
  // あふれているコンベア（乗る数を超えている）を、混んでいる所から強化する
  const jam = [...S.st.entries()].filter(([k2, b]) => isBelt(b) && (beltN.get(k2) || 0) > beltCap(b)).sort((a, b) => (beltN.get(b[0]) || 0) - (beltN.get(a[0]) || 0));
  for (const [, b] of jam.slice(0, 6)) { const c = nextCost(b); if (c !== null && S.money > c * W.belt * R) levelUp(b); }
  for (const [dk, d] of drills) {   // v0.79：硬い所（残り5分以上）を掘っているドリルは、ためている額より先に強化する
    const [dx, dy] = DIRS[d.dir], c = nextCost(d);
    if (c !== null && S.money > c * 3 && drillEta(cOf(dk) + dx, rOf(dk) + dy) > 300) levelUp(d);
  }
  for (const [, d] of drills) { const c = nextCost(d); if (c !== null && S.money > c * W.drill * R && can(c) && (!W.gate || flowOk)) levelUp(d); }
  for (const [, m] of machines) { const c = nextCost(m); if (c !== null && S.money > c * W.mach * R && can(c) && (MACHINES[m.m].src || !W.gate || queue(m) >= W.mq)) levelUp(m); }   // 横穴は順番待ちが無いので、いつでも
  for (const r of ROOT_ORDER) if (S.sold['@' + r] && S.money > priceCost(r) * W.price * R && can(priceCost(r))) priceUp(r);
  if (!build) return;
  // ドリルを増やす・置き直す：段階＋1台まで（撤去された時も、ここで補う）
  const live = [...S.st.entries()].filter(([, x]) => x.type === 'drill');
  if (live.length < S.stage + 1 && S.money > buildCost('drill') * 2.5 * R) autoNewDrill(live);
  if (build === 'inline') {   // 比べる用：縦のコンベアの途中に機械をそのまま入れる（受け付けない物は機械の中をゆっくり通る）
    for (const [dk] of drills) {
      const c = cOf(dk);
      for (const m of MACHINE_ORDER) {
        if (!S.unlock[m] || AUTO_SLOT[m] === undefined) continue;
        const k = key(c, SKY + AUTO_SLOT[m]), s = S.st.get(k);
        if (!s || s.type !== 'conv' || s.dir !== 'up' || rOf(dk) <= SKY + AUTO_SLOT[m] + 1) continue;
        const cost = buildCost('m:' + m);
        if (S.money < cost * 2.5) continue;
        if (autoPut(k, { type: 'machine', m, dir: 'up', lv: 0, buf: {}, bags: {}, cur: null, prog: 0, op: null }, cost)) break;
      }
    }
  } else autoSortLines(live);
  if (S.unlock.adit) autoAdit(live);
  // 湧き口：パイプで地下1段目までつなぐ
  if (S.unlock.pipe) {
    const net = pipeNet();
    for (const [wk, w] of all) {
      if (w.type !== 'well') continue;
      const n = net.get(wk); if (n && n.surface) continue;
      const found = autoPipePath(wk);
      if (!found || S.money < found.cost * 2) continue;
      for (const k of found.path) {
        if (S.st.has(k)) continue;
        const b = blk(cOf(k), rOf(k)); if (b) { spend(digCost(b), cOf(k) + 0.5, rOf(k) + 0.3); row(rOf(k))[cOf(k)] = null; S.digVer++; }   // 土を掘ってから
        autoPut(k, { type: 'pipe', dir: 'up', lv: 0 }, COST.pipe);
      }
      break;
    }
  }
  // 地上の施設：使う液体がたまっていれば建てる（1種類1つ）
  for (const fid of FAC_IDS) {
    const use = FAC_USE[fid] || [];
    const ok = fid === 'museum' ? RARE.some(([k2]) => S.sold[k2] || S.yard.some(it => it.k === k2)) : use.some(l => S.tank[l] > 20);   // 博物館は珍しい物を見つけてから
    if (!ok || !S.unlock[fid] || S.fac.some(x => x.f === fid)) continue;
    const c = autoFreeCol(), cost = buildCost(fid);
    if (c === undefined || S.money < cost * 1.5 * R) continue;
    spend(cost, c + 0.5, YARD_R); S.fac.push({ type: 'fac', f: fid, c, op: null, t: 0, lv: 0 }); addHist(tx().facBuilt(tx().fac[fid]));
  }
}
let autoBusy = false, autoBuild = true, autoLive = false, liveT = 0;
// 実際に遊ぶと何日何時間かかるか（ゲームの時間＝×1で遊んだ時間。研究の倍速なら、その分短い）
const capTxt = n => (n === Infinity ? tx().beltInf : tx().beltN(n));
const fmtMul = v => (v < 100 ? (Math.round(v * 100) / 100).toString() : fmt(Math.round(v)));
function realDur(sec) {
  const T = tx(), m = Math.round(sec / 60), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
  if (sec > 0 && m === 0) return T.lt1m;   // 1分に満たない
  return T.durDHM(d, h, mm);
}
function playTimeText() {
  const T = tx(), t = S.time;
  return T.playTime(Math.floor(t / TUNE.month), realDur(t), [2, 4, 8].map(x => `×${x} ${realDur(t / x)}`).join('・'));
}
const autoRun = { fails: 0 };
async function autoPlay(min) {
  const T = tx(), sec = min * 60;
  autoBusy = true; autoRun.fails = 0;
  $('away').hidden = false; $('awayOk').hidden = true;
  let done = 0;
  while (done < sec) {
    const t0 = performance.now();
    while (done < sec && performance.now() - t0 < 30) { sim(3); if (autoLive) autoLiveStep(); else autoStep(autoBuild); done += 3; }
    $('awayMsg').textContent = T.autoMsg(Math.round(done / 60), min) + '\n' + playTimeText();
    $('awayBar').style.width = (100 * done / sec) + '%';
    await new Promise(r => setTimeout(r, 0));
  }
  S.pops = [];
  $('awayMsg').textContent = T.autoDone(min) + (autoRun.fails ? '\n' + T.aiFailRun(autoRun.fails) : '');
  $('awayOk').hidden = false;
  autoBusy = false;
}

// ---- 取引：CMを見ると特典。続けて見ると効果時間が足される（上限あり） ----
// 今は広告サービスの代わりに数秒待つだけ（showAd）。本物のCMを入れる時は showAd の中だけ差し替える
const DEALS = [
  { id: 'idle2h', run: () => catchUp(7200) },                                                                     // 2時間ぶん放置と同じ
  { id: 'price2', run: () => { S.boost.priceT = Math.min(28800, S.boost.priceT + 1800); } },                       // 30分 売値2倍（最大8時間ぶん）
  { id: 'wage0',  run: () => { S.boost.wageM = Math.min(24, S.boost.wageM + 6); } },                               // 半年間 給料カット（最大2年ぶん）
  { id: 'speed10', run: () => { S.boost.speedUntil = Math.min(Date.now() + 1800e3, Math.max(Date.now(), S.boost.speedUntil) + 180e3); } },   // 3分間 速さ10倍（最大30分ぶん）
  { id: 'land', run: () => { if (sk('land') < LAND_MAX) gainSkill('land'); } },                                   // 地上げ：土地買収のレベルが1つ上がる
];
let adBusy = false;
// ---- 広告：本物の広告サービスが読み込まれていれば、それを使う。無ければ今までどおり「CM（仮）」で5秒待つ ----
// 本物にする時：index.html の広告スクリプト（Google の H5 ゲーム広告＝adBreak など）を有効にし、AD_ON を true にする（広告の準備.txt を参照）
const AD_ON = false;   // 広告サービスの用意ができたら true
let adLastAt = 0;      // 前に広告を見た時刻（短い間に何度も出さない）
function showAd(done) {
  if (adBusy) return;
  if (AD_ON && typeof window.adBreak === 'function') {   // 本物の広告（報酬つき）
    adBusy = true; let got = false;
    window.adBreak({
      type: 'reward', name: 'deal',
      // 広告の用意ができた：「広告を見る」ボタンを出し、押した時に広告を出す（広告は、遊ぶ人が押した操作の中で出す決まり）
      beforeReward: showAdFn => adAsk(() => showAdFn(), () => { adBusy = false; }),
      adViewed: () => { got = true; },               // 最後まで見た → 特典
      adDismissed: () => { got = false; },           // 途中でやめた → 特典なし
      adBreakDone: info => {
        adBusy = false; adLastAt = Date.now();
        if (got) done();
        else if (info && info.breakStatus !== 'viewed' && info.breakStatus !== 'dismissed') fakeAd(done);   // 広告が無かった時は、仮のCMで特典（遊ぶ人が損をしない）
        else say(tx().adSkip, 3000);
      },
    });
    return;
  }
  fakeAd(done);
}
// 「広告を見る／やめる」を聞く（本物の広告の時）
function adAsk(onWatch, onCancel) {
  const box = $('adBox'), T = tx();
  box.hidden = false; $('adMsg').textContent = T.adReady; $('adBar').style.width = '0%';
  let row = $('adAsk'); if (!row) { row = document.createElement('div'); row.id = 'adAsk'; row.className = 'adAsk'; box.querySelector('.box').append(row); }
  row.hidden = false; row.innerHTML = '';
  const mk = (label, f) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { row.hidden = true; box.hidden = true; f(); }); row.append(b); };
  mk(T.adWatch, onWatch); mk(T.adCancel, onCancel);
}
function fakeAd(done) {   // CM（仮）：5秒待つ
  if (adBusy) return; adBusy = true;
  const box = $('adBox'), T = tx(), len = 5;
  box.hidden = false; let t = 0;
  if ($('adAsk')) $('adAsk').hidden = true;
  const tick = () => {
    $('adMsg').textContent = T.adWait(Math.ceil(len - t));
    $('adBar').style.width = (100 * t / len) + '%';
    if (t >= len) { box.hidden = true; adBusy = false; done(); return; }
    t = Math.min(len, t + 0.1); setTimeout(tick, 100);
  };
  tick();
}
function dealLeft(id) {
  const B = S.boost, T = tx();
  if (id === 'price2' && B.priceT > 0) return T.leftT(fmtDur(B.priceT));
  if (id === 'wage0' && B.wageM > 0) return T.leftM(B.wageM);
  if (id === 'speed10' && Date.now() < B.speedUntil) return T.leftT(fmtDur((B.speedUntil - Date.now()) / 1000));
  return '';
}
const mmss = sec => { sec = Math.max(0, Math.ceil(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0'); };
function cmBoxText() {   // 時間で切れる効果（売値2倍・速さ10倍）
  const T = tx(), B = S.boost, a = [];
  if (B.priceT > 0) a.push(`${T.deal.price2[2]} ${mmss(B.priceT)}`);
  if (Date.now() < B.speedUntil) a.push(`${T.deal.speed10[2]} ${mmss((B.speedUntil - Date.now()) / 1000)}`);
  if (B.wageM > 0) a.push(`${T.deal.wage0[2]} ${B.wageM}${T.months}`);   // 給料カットは残りの月数
  return a.join('\n');
}
function boostText() {
  const T = tx(), a = [];
  for (const d of DEALS) { const l = dealLeft(d.id); if (l) a.push(`${T.deal[d.id][2]} ${l}`); }
  return a.join('・');
}

// ---- タイトル画面 ----
function showTitle() {
  inTitle = true; document.body.classList.add('title'); $('title').hidden = false;
  closePop(); closePanels(); $('info').hidden = true; tool = 'none'; openCat = null; renderSub();
  $('tCont').hidden = !savedJson();
  document.body.classList.remove('tut');
  $('tutMsg').hidden = true; $('tutSkip').hidden = true; $('tutArrow').setAttribute('hidden', '');   // 案内の物は残さない
  document.querySelectorAll('.tutPulse2, .tutPulse').forEach(el => el.classList.remove('tutPulse2', 'tutPulse'));
  // 地上を画面の下に置き、上はぜんぶ空にする
  cam.z = START_ZOOM; metrics();
  cam.y = SKY + 2.6 - ch / cp; cam.x = OFFICE_C + 1 - cw / cp / 2; metrics();
  updateUI();
}
function leaveTitle() {
  inTitle = false; document.body.classList.remove('title'); $('title').hidden = true;
  if (typeof tutShow === 'function' && S) tutShow();
  fitHeader(); resize(); resetCam(); updateUI();
}
$('tNew').addEventListener('click', () => {
  const go = () => { newGame(); leaveTitle(); startTutorial(); autoSave(); };
  if (savedJson()) askConfirm(tx().confirmNew, go); else go();
});
$('tCont').addEventListener('click', () => {
  const j = savedJson(); if (!j) return;
  let at = 0;
  try { S = deserialize(j); at = JSON.parse(j).at || 0; } catch (e) { say(tx().saveNG); return; }
  pathCache.ver = -1; digCache.ver = -1; speedIdx = 0;
  leaveTitle();
  const gone = at ? Math.min((Date.now() - at) / 1000, awayLimit()) : 0;
  if (gone >= 10) catchUp(gone);
});
$('tHelp').addEventListener('click', () => togglePanel('help'));
$('awayOk').addEventListener('click', () => { $('away').hidden = true; });
$('noticeOk').addEventListener('click', () => { $('notice').hidden = true; });
window.addEventListener('pagehide', autoSave);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { autoSave(); hiddenAt = Date.now(); return; }
  const gone = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0; hiddenAt = 0;
  last0 = last = performance.now();   // 画面のすき間の検出と、二重に計算しないように
  if (gone >= AWAY_MIN && !inTitle && S && !autoBusy) catchUp(Math.min(gone, awayLimit()));
});
setInterval(autoSave, 30000);

function showNotice(text, mood) {
  const nm = $('noticeMsg'); nm.innerHTML = ''; nm.append(secIcon(mood, 'secBig'));
  const sp = document.createElement('span'); sp.textContent = text; nm.append(sp);
  $('notice').hidden = false;
}
$('live10').addEventListener('click', () => { if (!autoBusy) autoPlay(10); });
$('live60').addEventListener('click', () => { if (!autoBusy) autoPlay(60); });
// ---- 今の目標（段階ごと）：資金の下に1行 ----
function goalText() {
  const T = tx(), st = Math.min(S.stage, 9), theme = T.stageGoal[st - 1] || '';
  let next = '';
  if (S.stage === 1 && S.office.lv < 1) next = T.gCompany(2, fmt(Math.max(0, offCost(0) - S.money)));
  else if (S.stage >= 9) next = '';
  else if (sk('digLv') >= S.stage) next = T.gBreak(rockLv(S.stage));                 // 研究は済んだ：掘り抜く
  else if (!permitOk()) { const need = permitNeed(); next = T.gPermit(need, fmt(Math.max(0, offCost(S.office.lv) - S.money))); }
  else if (S.researches.some(r => r.id === 'sk:digLv')) next = T.gResearching;
  else next = S.lab.built ? T.gDigRes(rockLv(S.stage)) : T.gLab;
  return T.gLine(st, theme, next);
}
// ---- FPS：測って表示する。目標（50f/s）を下回ったら、マスごとに描く資源の数を減らす（計算は変えない） ----
const fpsCtl = { fps: 60, cap: 30, t: 0 };
// 1フレームの内訳（ミリ秒・ならした値）
function fpsMs(k, v) { const m = fpsCtl.ms || (fpsCtl.ms = {}); m[k] = (m[k] || 0) * 0.9 + v * 0.1; }
function fpsTick(dt) {
  if (dt > 0) fpsCtl.fps = fpsCtl.fps * 0.95 + (1 / dt) * 0.05;
  fpsCtl.t += dt; if (fpsCtl.t < 0.5) return;
  fpsCtl.t = 0;
  if (fpsCtl.fps < 25) fpsCtl.cap = Math.max(3, Math.floor(fpsCtl.cap * 0.7));   // スマホは30f/sまでのことがあるので、25を下回った時だけ
  // 重い時は段階的に軽くする（3秒続いたら1段）。1＝作業員の動きを1枚に 2＝ほかの動きも止める・1倍の解像度 3＝描く作業員を半分に
  // 軽くなったら（15秒続いたら）1段ずつ戻す
  fpsCtl.lowT = fpsCtl.fps < 25 ? (fpsCtl.lowT || 0) + 0.5 : 0;
  fpsCtl.highT = fpsCtl.fps > 48 ? (fpsCtl.highT || 0) + 0.5 : 0;
  const lite0 = fpsCtl.lite || 0;
  if (fpsCtl.lowT >= 3 && lite0 < 3) { fpsCtl.lite = lite0 + 1; fpsCtl.lowT = 0; }
  else if (fpsCtl.highT >= 15 && lite0 > 0) { fpsCtl.lite = lite0 - 1; fpsCtl.highT = 0; }
  const lr = (fpsCtl.lite || 0) >= 2 && (window.devicePixelRatio || 1) > 1;
  if (lr !== !!fpsCtl.lowRes) { fpsCtl.lowRes = lr; resize(); }
  else if (fpsCtl.fps > 27) fpsCtl.cap = Math.min(30, fpsCtl.cap + 1);
  const pm = fpsCtl.ms || {}, ms = v => (v || 0).toFixed(v < 10 ? 1 : 0);
  $('fpsHud').textContent = `${Math.round(fpsCtl.fps)} f/s`;   // 右上は f/s だけ（内訳 fpsCtl.ms は試験用に残す）
}
// ---- ループ ----
let last = performance.now(), panelTick = 0;
// スリープ・ほかのアプリを見ていた間も放置あつかい（20秒以上あいたら、戻った時にまとめて計算）
const AWAY_MIN = 20;
let last0 = performance.now(), hiddenAt = 0;
let noDraw = false;   // 試走用：画面を描かず計算だけ（自動プレイ10分・60分の間も描かない）
function frame(now) {
  const dt = Math.min(now - last, 250) / 1000; last = now;
  const gap0 = now - last0; last0 = now;
  if (catchBusy) { requestAnimationFrame(frame); return; }   // 放置の計算中は、何も描かない（バーだけ）
  if (gap0 > AWAY_MIN * 1000 && !inTitle && !autoBusy && !document.hidden) { catchUp(Math.min(gap0 / 1000, awayLimit())); requestAnimationFrame(frame); return; }   // スリープ解除など
  if (noDraw || autoBusy) { requestAnimationFrame(frame); return; }   // 画面表示カット
  fpsTick(dt);
  const sp = speeds(); if (speedIdx >= sp.length) speedIdx = sp.length - 1;
  if (running && !inTitle && !launchT) {   // 発進〜宇宙の間は、ゲームを止める
    const gdt = dt * sp[speedIdx] * (Date.now() < S.boost.speedUntil ? 10 : 1);
    drawDt = gdt;
    const tS = performance.now(); sim(gdt); fpsMs('sim', performance.now() - tS);
    if (autoLive) { liveT += gdt; if (liveT >= 3) { liveT = 0; autoLiveStep(); } }   // 自動プレイ（見る）：ゲームの3秒ごとにAIが考える
  }
  if (!running || inTitle) drawDt = 0;
  applyMove(dt);
  const tU = performance.now();
  tripTick();
  if (launchT && performance.now() - launchT > LAUNCH_SEC * 1000 && (!$('space') || $('space').hidden)) showSpace();
  updateUI();
  if (S.notice && !autoBusy) { showNotice(S.notice, 'good'); S.notice = null; }
  if ((panelTick = (panelTick + 1) % 15) === 0) {
    for (const id of ['powerPanel', 'office', 'skillPanel', 'tradePanel']) if (!$(id).hidden && !panelBusy($(id))) renderPanel(id);
    $('aiTime').textContent = autoLive ? playTimeText() : '';   // 自動プレイ（見る）：実際に遊ぶと何日何時間か
    const cmT = cmBoxText(), bt = boostText().split('・').filter(x => x && !cmT.includes(x.split(' ')[0])).join('・');   // 上の枠に出した物は、資金の下には出さない   // 時間の効果は上の枠へ
    $('boostHud').textContent = (autoLive ? tx().adm.liveTag + (bt ? '・' : '') : '') + bt;
    const cb = $('cmBox');
    if (cb.dataset.t !== cmT) { cb.dataset.t = cmT; cb.innerHTML = ''; for (const x of cmT ? cmT.split('\n') : []) { const sp = document.createElement('span'); sp.textContent = x; cb.append(sp); } }   // 効果ごとに1つ（狭い画面では折り返す）
    cb.hidden = !cmT; document.body.classList.toggle('cmOn', !!cmT);
    if (cmT) document.body.style.setProperty('--cmH', cb.offsetHeight + 'px');
    if (!$('info').hidden) renderInfo();
    if (popTarget) updatePop();
    syncDash();
  }
  if (!$('mapPanel').hidden && panelTick % 5 === 0) renderMap();
  metrics();
  placePop();
  if (!$('office').hidden) drawCutaway($('officeView'), 'office');   // 断面図（開いている時だけ）
  if (popTarget && popTarget.type === 'fac' && !$('popView').hidden) drawFacView($('popView'), popTarget);
  if (!$('skillPanel').hidden) drawCutaway($('labView'), 'lab');
  const tD = performance.now(); fpsMs('ui', tD - tU);
  try { draw(); } catch (e) { if (!frame.errSaid) { frame.errSaid = true; console.error(e); } }   // 描くのに失敗しても、ループは止めない
  fpsMs('draw', performance.now() - tD);
  requestAnimationFrame(frame);
}

// ---- 釣り合い調整：ゲームの数字の表をたどり、数字1つずつに入力欄を作る。変えた所だけコピーできる ----
const BAL_ROOTS = { ITEMS, MACHINES, LV, COST, OFFICE_LV, RESEARCH_MACH, RESEARCH_TOOL, RESEARCH_FAC, RESEARCH_BATCH, SKILLS, RES_STAGE, SK_STAGE,
  DIG_PERMIT, BELT_CAP, PRICE_BASE, FORK, WELL_RATE, TUNE, AI_W, BAL };
const BAL_KEY = 'digfactory.balance';
function balLeaves() {
  const out = [];
  const walk = (o, path) => {
    for (const k of Object.keys(o)) {
      const v = o[k], p2 = path + '.' + k;
      if (typeof v === 'number') { if (Number.isFinite(v)) out.push(p2); }
      else if (v && typeof v === 'object') walk(v, p2);
    }
  };
  for (const r of Object.keys(BAL_ROOTS)) walk(BAL_ROOTS[r], r);
  return out;
}
const balGet = path => path.split('.').slice(1).reduce((o, k) => o[k], BAL_ROOTS[path.split('.')[0]]);
function balSet(path, v) {
  const ks = path.split('.'), last = ks.pop();
  const o = ks.slice(1).reduce((a, k) => a[k], BAL_ROOTS[ks[0]]);
  o[last] = v;
}
// キノメノが「釣り合い調整」で決めた数字（2026-11-24）。標準として先に入れる
const BAL_PRESET = {"ITEMS.iron.v": 15, "ITEMS.gold.v": 50, "ITEMS.dia.v": 100, "ITEMS.gravel.v": 5, "ITEMS.brick.v": 7, "ITEMS.ironbar.v": 200, "ITEMS.goldbar.v": 800, "ITEMS.tool.v": 700, "ITEMS.jewel.v": 1000, "ITEMS.diaClean.v": 800, "ITEMS.diaCut.v": 1200, "ITEMS.gem.v": 500, "ITEMS.tile.v": 8, "ITEMS.glossTile.v": 16, "ITEMS.wire.v": 300, "ITEMS.goldleaf.v": 950, "ITEMS.decoIron.v": 3200, "ITEMS.decoGold.v": 7000, "LV.belt.cost.1": 50, "LV.belt.cost.2": 500, "COST.fdrill": 1200, "COST.adrill": 1500, "OFFICE_LV.cap.0": 5, "OFFICE_LV.cap.1": 10, "OFFICE_LV.cap.2": 20, "OFFICE_LV.cap.3": 50, "OFFICE_LV.cap.4": 100, "RESEARCH_TOOL.pipe.0": 200, "RESEARCH_TOOL.pipe.1": 1, "RESEARCH_BATCH.0": 10000, "RESEARCH_BATCH.1": 6, "SKILLS.speed.cost.2": 10000, "SKILLS.dragPlus.months.0": 1, "SKILLS.welfare.cost.0": 4000, "SKILLS.welfare.cost.1": 8000, "SKILLS.black.cost.0": 5000, "SKILLS.labRoom.cost.0": 1000, "SKILLS.labRoom.cost.1": 4000, "SKILLS.labRoom.cost.2": 8000, "RES_STAGE.m:bagger": 2, "RES_STAGE.sk:yardPlus": 3, "RES_STAGE.t:cross": 4, "RES_STAGE.t:pipe": 4, "RES_STAGE.sk:truck2": 4, "SK_STAGE.speed.0": 2, "SK_STAGE.labRoom.0": 2, "BELT_CAP.0": 5, "BELT_CAP.1": 10, "BELT_CAP.2": 20, "BELT_CAP.3": 40, "LV.truck.cap": 10, "OFFICE_LV.cost.0": 1200, "OFFICE_LV.cost.1": 5000, "OFFICE_LV.cost.2": 56000, "OFFICE_LV.cost.3": 164000, "RES_STAGE.sk:land": 4, "RES_STAGE.batch": 3, "RES_STAGE.sk:veteran": 3, "RES_STAGE.f:refinery": 5, "SK_STAGE.labRoom.1": 3, "SK_STAGE.labRoom.2": 4, "BAL.priceUpMul": 1.2, "BAL.priceCostG": 2, "BAL.hotP": 0.033, "BAL.beltSlowMin": 0.03};
for (const [p2, v] of Object.entries(BAL_PRESET)) balSet(p2, v);
const BAL_DEF = new Map(balLeaves().map(p2 => [p2, balGet(p2)]));   // 標準の数字（変えた所を見分ける）
for (const d of TUNE_DEF) if (BAL_DEF.has('TUNE.' + d.k)) BAL_DEF.set('TUNE.' + d.k, d.def);   // 「調整」は保存済みの値が先に入っているので、標準は表の値
const balChanged = () => { const o = {}; for (const [p2, d] of BAL_DEF) { const v = balGet(p2); if (v !== d) o[p2] = v; } return o; };
function balApply(obj) { for (const [p2, v] of Object.entries(obj || {})) if (BAL_DEF.has(p2) && typeof v === 'number' && Number.isFinite(v)) balSet(p2, v); }
function balSave() { try { localStorage.setItem(BAL_KEY, JSON.stringify(balChanged())); } catch (e) { /* 保存できなくても続ける */ } saveTune(); }
try { balApply(JSON.parse(localStorage.getItem(BAL_KEY) || '{}')); } catch (e) { /* 読めない時は標準のまま */ }
// 名前（日本語）：表の名前と、中の言葉
const BAL_GROUP = { ITEMS: '資源・製品', MACHINES: '機械', LV: 'レベルの表', COST: '設置の値段', OFFICE_LV: '会社レベル', RESEARCH_MACH: '研究：機械（値段・か月）',
  RESEARCH_TOOL: '研究：道具（値段・か月）', RESEARCH_FAC: '研究：地上の施設（値段・か月）', RESEARCH_BATCH: '研究：まとめて強化（値段・か月）', SKILLS: '研究：スキル',
  RES_STAGE: '研究が出る段階', SK_STAGE: 'スキルが出る段階（段ごと）', DIG_PERMIT: '行政の許可（掘削レベル → 要る会社レベル）', BELT_CAP: 'コンベア1マスに乗る数（レベルごと）',
  PRICE_BASE: '売値アップ1回目の値段', FORK: 'フォークリフト', WELL_RATE: '湧き口が1秒に出す量', TUNE: '全体の倍率（前からの「調整」）', AI_W: 'AIのお金の使い方', BAL: 'その他（単独の数字・式の中の数字）' };
const BAL_WORD = { v: '売値', cost: '値段', time: '加工の時間（秒）', n: '使う数', recipes: '作り方', val: '値', v0: '最初の値', vg: '値の伸び（倍）', c0: '最初の値段', cg: '値段の伸び（倍）',
  cap: '上限', rest: '休憩の速さ', forks: 'フォークリフトの台数', months: 'か月', max: '上限', speed: '速さ', rate: '積みおろしの速さ', ins: '材料',
  tankCap: 'タンクの容量', facSlow: '作業員なしの施設の速さ', drillHit: 'ドリルが1回削る間隔（秒）', grav: '資源が落ちる強さ', loadRate: 'トラックに積む速さ（個/秒）',
  walkH: '歩く速さ（横）', walkV: 'はしごの速さ（縦）', restSec: '休みきるまでの秒', valueUp: '機械レベルごとの売値の倍率（付加価値）', loan: '銀行の融資の額', loanMax: '融資の上限',
  advLv: '研究所・運転に要る作業員のレベル', facSlots: '地上施設で働ける人数', aditMax: '横穴のレベルアップ回数', aditMaxSpeed: '横穴の最大レベルの速さ（倍）',
  hireFee0: '契約金（基本）', hireFeeLv: '契約金（レベルごと）', wage0: '給料（基本）', wageLv: '給料（レベルごと）', forkSpd0: 'フォークリフトの速さ（基本）',
  forkSpdG: 'フォークリフトの速さの伸び（倍）', forkSpdMax: 'フォークリフトの速さの上限', forkBuy0: 'フォークリフト2台目の値段', forkBuyStep: 'フォークリフト1台ごとの値上がり',
  digCost0: '掘削レベル研究の値段（基本）', digCostG: '掘削レベル研究の値段の伸び（倍）', digMon0: '掘削レベル研究のか月（基本）', digMonG: '掘削レベル研究のか月の伸び（倍）',
  landCost0: '土地買収の値段（基本）', landCostG: '土地買収の値段の伸び（倍）', awayCost0: '放置時間の値段（基本）', awayCostG: '放置時間の値段の伸び（倍）',
  priceUpMul: '売値アップ1回の倍率', priceCostG: '売値アップの値段の伸び（倍）', ironP5: '鉄の出やすさ（5〜10m）', ironP10: '鉄の出やすさ（10m〜）',
  goldP10: '金の出やすさ（10〜30m）', goldP30: '金の出やすさ（30m〜）', diaP30: 'ダイヤの出やすさ（30〜50m）', diaP50: 'ダイヤの出やすさ（50m〜）',
  oilP: '石油が湧く確率（50m〜）', hotP: '温泉が湧く確率（30m〜）', bossFatPer: '社長の太り方（会社レベルごと）', bossFatRate: '社長の太る速さ（1秒あたり）',
  beltSlowPow: 'あふれた時の遅くなり方（乗数）', beltSlowMin: 'あふれた時のいちばん遅い速さ（倍）', truckWait: 'トラックが待ってから出る秒', gift: '最初の資金ショートのプレゼント',
  oil: '石油', hot: 'お湯', 0: '値段', 1: 'か月' };
function balLabel(path) {
  const T = tx(), ks = path.split('.'), g = ks[0], rest = ks.slice(1);
  const word = (k, i) => {
    if (g === 'ITEMS' && i === 0) return T.items[k] || k;
    if ((g === 'MACHINES' || g === 'RESEARCH_MACH') && i === 0) return T.mach[k] || k;
    if (g === 'SKILLS' && i === 0) return (T.sk[k] || [k])[0];
    if ((g === 'RESEARCH_FAC' || g === 'COST') && T.fac && T.fac[k]) return T.fac[k];
    if (g === 'RES_STAGE') { const id = k; try { return resDef(id).name; } catch (e) { return k; } }
    if (g === 'MACHINES' && rest[i - 1] === 'recipes') { const rc = MACHINES[rest[0]].recipes[+k]; return rc ? (T.items[rc.out] || rc.out) : k; }
    if (g === 'MACHINES' && rest[i - 1] === 'ins') return T.items[k] || k;
    if (g === 'TUNE') { const d = TUNE_DEF.find(x => x.k === k); if (d) return d.ja; }
    if (g === 'LV' && rest[i - 1] === 'cost' && /^\d+$/.test(k)) return `Lv${+k + 1}→Lv${+k + 2}の強化`;
    if ((g === 'OFFICE_LV' || g === 'BELT_CAP' || g === 'SK_STAGE' || (g === 'LV' && (rest[i - 1] === 'val' || rest[i - 1] === 'cost')) || (g === 'SKILLS' && (rest[i - 1] === 'cost' || rest[i - 1] === 'months'))) && /^\d+$/.test(k)) return (g === 'OFFICE_LV' ? 'レベル' : 'Lv') + (+k + (g === 'OFFICE_LV' && rest[i - 1] === 'cost' ? 2 : 1));
    if (g === 'DIG_PERMIT') return '掘削レベル' + k;
    if (g === 'LV' && (k === 'v0' || k === 'val')) return (T.pw[rest[0]] || k) + (k === 'v0' ? '（最初）' : '');
    if (g === 'LV' && k === 'vg') return (T.pw[rest[0]] || '値') + 'の伸び（倍）';
    if (g === 'LV' && i === 0) return ({ drill: 'ドリル', belt: 'コンベア', machine: '機械', truck: 'トラック', fork: 'フォークリフト' })[k] || k;
    return BAL_WORD[k] !== undefined ? BAL_WORD[k] : k;
  };
  return rest.map(word).join(' ・ ');
}
function openBalance() {
  let box = $('balPanel');
  if (!box) { box = document.createElement('div'); box.id = 'balPanel'; document.body.append(box); }
  box.hidden = false; box.innerHTML = '';
  const head = document.createElement('div'); head.className = 'balHead';
  const title = document.createElement('b'); title.textContent = '釣り合い調整';
  const q = document.createElement('input'); q.type = 'search'; q.placeholder = '探す（例：売値・ドリル・研究）';
  const cnt = document.createElement('small');
  const mk = (label, f) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', f); return b; };
  const ta = document.createElement('textarea'); ta.placeholder = 'ここに貼り付けて「読み込む」'; ta.hidden = true;
  const showCnt = () => { cnt.textContent = `変えた数字 ${Object.keys(balChanged()).length}個`; };
  head.append(title, q, cnt,
    mk('変えた所をコピー', () => { const txt = JSON.stringify(balChanged(), null, 1); ta.hidden = false; ta.value = txt; ta.select(); if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => say('コピーしました'), () => {}); }),
    mk('貼り付け', () => { ta.hidden = false; ta.value = ''; ta.focus(); }),
    mk('読み込む', () => { try { balApply(JSON.parse(ta.value)); balSave(); openBalance(); say('読み込みました'); } catch (e) { say('読み込めませんでした（形が違います）'); } }),
    mk('全部元に戻す', () => askConfirm('全部の数字を標準に戻しますか？', () => { for (const [p2, d] of BAL_DEF) balSet(p2, d); balSave(); openBalance(); })),
    mk('閉じる', () => { box.hidden = true; updateUI(); }));
  box.append(head, ta);
  const body = document.createElement('div'); body.className = 'balBody'; box.append(body);
  const groups = new Map();
  for (const p2 of BAL_DEF.keys()) { const g = p2.split('.')[0]; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p2); }
  const rows = [];
  for (const [g, list] of groups) {
    const det = document.createElement('details'); const sum = document.createElement('summary'); sum.textContent = `${BAL_GROUP[g] || g}（${list.length}）`; det.append(sum);
    for (const p2 of list) {
      const def = BAL_DEF.get(p2), row = document.createElement('div'); row.className = 'balRow';
      const lab = document.createElement('span'); lab.className = 'bl'; lab.textContent = balLabel(p2); lab.title = p2;
      const step = Number.isInteger(def) ? 1 : Math.pow(10, Math.floor(Math.log10(Math.abs(def) || 0.1)) - 1);
      const num = document.createElement('input'); num.type = 'number'; num.step = step; num.value = balGet(p2);
      const rng = document.createElement('input'); rng.type = 'range'; rng.min = 0; rng.max = def > 0 ? def * 3 : 10; rng.step = step; rng.value = balGet(p2);
      const rst = document.createElement('button'); rst.textContent = '標準'; rst.title = `標準：${def}`;
      const mark = () => { row.classList.toggle('chg', balGet(p2) !== def); showCnt(); };
      const set = v => { if (!Number.isFinite(v)) return; balSet(p2, v); num.value = v; rng.value = v; mark(); balSave(); };
      num.addEventListener('change', () => set(parseFloat(num.value)));
      rng.addEventListener('input', () => set(parseFloat(rng.value)));
      rst.addEventListener('click', () => set(def));
      row.append(lab, rng, num, rst); mark(); det.append(row); rows.push([row, (BAL_GROUP[g] || '') + ' ' + lab.textContent + ' ' + p2, det]);
    }
    body.append(det);
  }
  q.addEventListener('input', () => {
    const w = q.value.trim();
    for (const [row, text, det] of rows) { const hit = !w || text.includes(w); row.hidden = !hit; if (w && hit) det.open = true; }
  });
  showCnt();
}

newGame();
applyDash();
setupText();
resize();
resetCam();
showTitle();
window.__game = { tapAt: p => tapAt(p), key: (c, r) => key(c, r), updateMachines: dt => updateMachines(dt), itemSprite: (k, of) => itemSprite(k, of), ITEMS: () => ITEMS, get YARD_R() { return YARD_R; }, get OFFICE_C() { return OFFICE_C; }, get SKY() { return SKY; }, // 動作確認用
  get S() { return S; }, draw: () => draw(), openPop: t => openPop(t), launchAt: e => { launchT = performance.now() - e * 1000; }, tutTarget: () => tutTarget(), closePop: () => closePop(), tripStart: () => tripStart(), cappedAllDone: () => cappedAllDone(), TRIP_NEED, toggle: id => togglePanel(id), openCatT: c => { openCat = c; renderSub(); updateUI(); }, tutStart: () => startTutorial(), tutSet: st => tutSet(st), setNoDraw: v => { noDraw = !!v; }, BAL, openBalance, balChanged, TUNE, OFFICE_LV, AI_W, BELT_CAP, fpsCtl, row, canPlaceAt, officeUp, buyFork, finishResearch, sim, apply, gainSkill, startResearch, saveTo, loadFrom, speeds, bayTruck, levelUp, levelUpAll, departNow, cam, diggable, hire,
  setTool: t => setTool(t), setDir: d => { dir = d; }, pause: () => { running = false; },
  checkStage, resAvail, buildCost, allResIds, resDef, autoSave, catchUp, showTitle, leaveTitle, autoPlay, autoStep, workNeed,
  deserialize, serialize, newGame: () => newGame(), aiLearn, autoPlan, AUTO_LINES, autoDiagnose, setLive: v => { autoLive = v; showAiLog(); }, setAutoBuild: v => { autoBuild = v; }, fmt, itemVal, placePend, priceUp, lvVal, lvCost, catalogIds,
};
requestAnimationFrame(frame);
})();
