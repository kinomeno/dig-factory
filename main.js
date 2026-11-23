// ほりほり工場 / Dig Factory Tycoon v0.29（作業フォルダ名：採掘ゲーム）
// 画面をマス目に割り、地形・設備を描く。資源だけは別レイヤーで、マスに縛られず自由に動く。
// 横は固定の列数、縦（深さ）は無制限。拡大縮小・上下移動できる。
// 地上の事務所から作業員がドリル・機械へ歩いて行って操作する。
(() => {
'use strict';

const VERSION = '0.29';
const NOTE_URL = 'https://note.com/kinomeno/xxxxxxx'; // 紹介記事ができたら差し替え
// テスト用の管理メニュー：実機テストのため、当面は公開版でも出す（キノメノ指示 2026-11-23）。
// 消すときは false にする（または URL に ?nodev を付けるとその時だけ消える）
const DEV = !new URLSearchParams(location.search).has('nodev');

// ---- 盤面の設定 ----
const COLS = 14;
const SKY = 4;                 // 上から4行が空（地上）
const YARD_R = SKY - 1;        // 地上の建物の行（地面のすぐ上）
const OFFICE_C = Math.floor(COLS / 2) - 1;   // 事務所（地上の中央の2マス）
const YARD_C = COLS - 4;       // ヤード（資源置き場）の左端の列。2マス
const BED = COLS - 2, CAB = COLS - 1; // トラックの荷台と運転席の列
const COST = { drill: 50, fdrill: 120, adrill: 150, conv: 5, sort: 20, tee: 15, cross: 15, lab: 200 };
// 調整できる数値：def＝初期値。キノメノが管理メニュー「調整」で動かし、結果をコピーしてClaudeに渡せる
const TUNE_DEF = [
  { k: 'month',      ja: '1か月の長さ（秒）',         en: 'Month length (s)',        min: 10,  max: 120,  step: 5,    def: 60 },
  { k: 'startMoney', ja: '最初の資金',                en: 'Starting money',          min: 100, max: 3000, step: 50,   def: 500 },
  { k: 'price',      ja: '売値の倍率',                en: 'Sale price ×',            min: 0.5, max: 4,    step: 0.1,  def: 2.5 },
  { k: 'ore',        ja: '鉄・金・ダイヤの出やすさ',  en: 'Ore richness ×',          min: 0.5, max: 3,    step: 0.1,  def: 1.3 },
  { k: 'hard',       ja: '地面の硬さ',                en: 'Ground hardness ×',       min: 0.3, max: 3,    step: 0.1,  def: 1 },
  { k: 'drill',      ja: 'ドリルの速さ',              en: 'Drill speed ×',           min: 0.3, max: 3,    step: 0.1,  def: 1.5 },
  { k: 'unmanned',   ja: '作業員なしの時の速さ',      en: 'Speed without operator',  min: 0.05, max: 1,   step: 0.05, def: 0.3 },
  { k: 'wage',       ja: '給料の倍率',                en: 'Wages ×',                 min: 0,   max: 3,    step: 0.1,  def: 0.7 },
  { k: 'walk',       ja: '作業員の歩く速さ',          en: 'Worker walk speed ×',     min: 0.5, max: 3,    step: 0.1,  def: 1 },
  { k: 'belt',       ja: 'コンベアの速さ',            en: 'Conveyor speed ×',        min: 0.5, max: 3,    step: 0.1,  def: 1 },
  { k: 'fork',       ja: 'フォークリフトの速さ',      en: 'Forklift speed ×',        min: 0.5, max: 3,    step: 0.1,  def: 1 },
  { k: 'away',       ja: 'トラックが出かける秒数',    en: 'Truck trip (s)',          min: 1,   max: 20,   step: 1,    def: 5 },
  { k: 'digCost',    ja: '掘削の費用',                en: 'Dig cost ×',              min: 0.2, max: 3,    step: 0.1,  def: 1 },
  { k: 'resCost',    ja: '研究の費用',                en: 'Research cost ×',         min: 0.2, max: 3,    step: 0.1,  def: 1 },
  { k: 'resTime',    ja: '研究の時間',                en: 'Research time ×',         min: 0.2, max: 3,    step: 0.1,  def: 1 },
];
const TUNE = {};
for (const d of TUNE_DEF) TUNE[d.k] = d.def;
try { Object.assign(TUNE, JSON.parse(localStorage.getItem('digfactory.tune') || '{}')); } catch (e) { /* 保存できない環境 */ }
const saveTune = () => { try { localStorage.setItem('digfactory.tune', JSON.stringify(TUNE)); } catch (e) { /* 無視 */ } };
const DRILL_HIT_SEC = 0.6;     // ドリルが1回削る間隔（秒）
const SUB_SEC = 0.02;          // 計算の刻み（秒）
const GRAV = 14;               // 資源が落ちる強さ
const LOAD_RATE = 10;          // トラックに積む速さ（個/秒）
const ANIM_SEC = 1.4;          // 出発・帰還アニメの長さ
const START_ZOOM = 1.8;        // 最初は拡大した状態から

// 作業員
const WALK_H = 2.2, WALK_V = 1.2;   // 歩く速さ（横）・はしごを登り降りする速さ（縦）（マス/秒）
const REST_SEC = 12;           // 体力が空から満タンまで休む時間
const HIRE_FEE_X = 2;          // 契約金＝給料×2

// レベル（マスごと。レベル1が最弱）
const LV = {
  drill:   { val: [0.5, 0.75, 1, 1.4, 2, 2.8, 4], cost: [80, 200, 450, 900, 1800, 3500] }, // 1回で削る力
  belt:    { val: [0.8, 1.1, 1.5, 2, 2.6, 3.3, 4.2, 5.2], cost: [10, 25, 60, 150, 350, 800, 1800] }, // コンベアの速さ（マス/秒）。最後の2段はスキル「コンベア最高速アップ」で解禁
  machine: { val: [1, 1.5, 2.2, 3, 4],            cost: [100, 250, 600, 1500] },           // 加工の速さ（倍）
  truck:   { val: [8, 12, 18, 26, 36, 50],        cost: [80, 200, 450, 1000, 2000] },      // 積める数
  fork:    { val: [6, 8, 10, 13, 16, 20],         cost: [150, 350, 800, 1600, 3200] },     // フォークリフトの積める数（速さも上がる）
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

// フォークリフト：地上に出た資源を、出た場所（荷おろし場）からヤードまで運ぶ
const FORK = { cap: 6, speed: 2.4, rate: 8 };   // 積める数・走る速さ（マス/秒）・積みおろしの速さ（個/秒）
const newFork = () => ({ type: 'fork', lv: 0, op: null, x: 0, state: 'idle', load: [], tc: null, acc: 0, face: 1 });
const LOAN = 300;        // 銀行の融資の額（行き詰まり防止）
const LOAN_MAX = 1500;   // 借りられる合計の上限
const LAYER_EVERY = 10;   // 10mごとに硬い岩盤の層（スキル「掘削レベル」が足りないと掘れない）
// 事務所のレベル：休憩の速さ・定員
const OFFICE_LV = { rest: [1, 1.5, 2, 3, 4], cap: [3, 5, 8, 12, 16], forks: [1, 2, 3, 4, 5], cost: [300, 1500, 4000, 9000] };   // レベル2（研究所）は安め
const ADV_LV = 2;                // 地上・上級勤務（フォークリフト・トラック・研究所）に必要なレベル
const LV_EXP = [60, 180, 400, 750, 1300, 2100, 3200, 4600];   // 働いた時間（秒）の合計でレベルアップ
const HIRE_FEE = lv => 40 + 30 * lv;                           // 雇うときの契約金
const wageOf = w => 10 + 6 * w.lv;                             // 給料（月）
const FORK_SPEED = [2.4, 2.7, 3.0, 3.4, 3.9, 4.5];             // フォークリフトの速さ（レベル別）
const FORK_BUY = n => 400 + 200 * (n - 1);                     // n台目のフォークリフトの値段
// 研究所で研究して使えるようになる機械 [費用, 月数]。レンガ焼成機・クラッシャーは最初から
const RESEARCH_MACH = { smelter: [600, 2], bagger: [500, 2], factory: [1500, 3], washer: [1200, 3], cutter: [1800, 3], polisher: [2500, 4] };
const RESEARCH_BATCH = [800, 2];
// 研究で増える設置物：高速ドリル・自動ドリル（ふさがると向きを変える）・T字路・交差
const RESEARCH_TOOL = { fdrill: [800, 2], adrill: [1500, 3], tee: [300, 1], cross: [400, 2] };                               // まとめて強化の研究
// スキル（研究：お金を払い、ゲーム内で何か月か待つと手に入る。研究は1つずつ）
const SKILLS = {
  speed:    { max: 3, cost: [800, 2500, 8000], months: [2, 3, 4] },
  dragPlus: { max: 1, cost: [1200], months: [2] },
  hr:       { max: 2, cost: [1500, 5000], months: [2, 3] },   // 雇う人が Lv1 → Lv2 から
  veteran:  { max: 1, cost: [2000], months: [3] },
  welfare:  { max: 2, cost: [1500, 4000], months: [2, 3] },
  black:    { max: 1, cost: [2500], months: [2] },
  digLv:    { max: 999, cost: k => (k === 0 ? 250 : Math.round(250 * Math.pow(2.8, k) / 50) * 50), months: k => 1 + k },   // 1段目は安く（最初の穴の稼ぎで払える）
  truck2:   { max: 1, cost: [3000], months: [3] },
  speeding: { max: 1, cost: [2000], months: [2] },
  beltMax:  { max: 2, cost: [2500, 6000], months: [2, 3] },
  yardPlus: { max: 1, cost: [1500], months: [2] },
  saveSlot: { max: 2, cost: [1000, 3000], months: [1, 2] },
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
    play: '▶︎ 再生', pause: '❚❚ 停止', top: '地上', dir: '向き', move: '移動', uiOpt: '画面', uiStd: 'ふつう', uiDash: 'タブ（試験）',
    help: '遊び方', settings: '設定', lang: '表示', reset: '最初から',
    confirmReset: '最初からやり直しますか？', confirmReload: 'リセットしますか？（ページを読み込み直します）', yes: 'はい', no: 'いいえ',
    noMoney: '資金が足りません', cantPlace: 'ここには置けません', underOnly: 'ドリル・コンベア・機械は地下に置きます',
    cantDig: 'ここは掘れません（地上からつながる穴の隣だけ）', maxed: '最大',
    drillDir: 'ドリル', convDir: 'コンベア', sortTitle: '仕分けコンベア',
    filter: '選ぶ資源', side: '出す側', left: '左', right: '右',
    sortInfo: '選んだ資源だけを横に出します。他はまっすぐ進みます。',
    outDir: '出す向き（前）', making: '加工中', waiting: '材料待ち', inBuf: '材料',
    truck: 'トラック', loaded: '積んだ数', worth: '売値', depart: '今すぐ出発', away: '出発中', yard: 'ヤード',
    lv: n => `レベル${n}`, levelUp: 'レベルアップ',
    pw: { drill: '掘る力', belt: '速さ', machine: '加工の速さ', truck: '積める数', fork: '積める数' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v}マス/秒`, machine: v => `×${v}`, truck: v => `${v}個`, fork: v => `${v}個` },
    grp: { drill: 'ドリル', belt: 'コンベア・仕分け', machine: '機械', truck: 'トラック' },
    allUp: (g, n) => `${g}をまとめてレベルアップ（${n}台）`, none: '対象がありません',
    items: { soil: '土', stone: '石', iron: '鉄', gold: '金', dia: 'ダイヤ原石', gravel: '砂利', brick: 'レンガ',
      ironbar: '鉄の延べ棒', goldbar: '金の延べ棒', tool: '鉄製品', jewel: '金細工', diaClean: '洗ったダイヤ',
      diaCut: 'カットダイヤ', gem: '宝石', bag: '袋詰め' },
    mach: { kiln: 'レンガ焼成機', crusher: 'クラッシャー', smelter: '溶鉱炉', factory: '商品製造機', bagger: '袋詰め機',
      washer: 'クリーニング機', cutter: 'カット機', polisher: '研磨機' },
    glyph: { kiln: '窯', crusher: '砕', smelter: '炉', factory: '製', bagger: '袋', washer: '洗', cutter: '切', polisher: '磨' },
    bagRule: '同じ物5個 → 1袋（売値1.2倍・3種類まで同時に）',
    office: '事務所', workers: '作業員', hire: '雇う', fire: '解雇', stamina: '体力', tech: '技術',
    wage: '給料', perMonth: '/月', fee: '契約金', payroll: '人件費（毎月）', cands: '雇える人（毎月入れかわる）',
    noCands: '今月はもういません', nobody: 'まだいません',
    wstate: { idle: '待機', toWork: '持ち場へ', work: '作業中', drive: '運転中', toRest: '休みに戻る', rest: '休憩中' },
    worker: n => `作業員${n}`, manned: n => `作業員：${n}`, unmanned: '作業員なし（とても遅い）',
    payPop: '人件費',
    infoRows: { money: '資金', mSale: '今月の売上', mCost: '今月の経費', mNet: '今月の収支', lNet: '先月の収支',
      tSale: '売上の合計', tCost: '経費の合計', ships: '出荷した回数', deepest: 'いちばん深い所', drills: 'ドリル',
      machines: '機械', belts: 'コンベア・仕分け', workers: '作業員（作業中）', yard: 'ヤードの資源', loan: '借入（売上から返す）' },
    infoGrp: ['お金', '累計', '現場'],
    loanPop: '銀行から融資',
    unitN: '台', unitP: '人', unitK: '個', unitT: '回',
    gMoney: '資金の動き', gMonth: '月ごとの収支（緑＝プラス・赤＝マイナス）',
    adm: { m1: '資金 ＋1000', m10: '資金 ＋10000', maxLv: '全部レベル最大', ace: '優秀な作業員を雇う',
      month: '1か月進める', fast: '速さ ×16', clear: '地中を見る（切替）', allSk: 'スキル全部取得', finRes: '研究を即完了', tune: '調整' },
    tuneInfo: 'バーを動かすとすぐ反映されます（最初の資金・鉱石の出やすさ・硬さは「最初から」の後に反映）。「結果をコピー」でチャットに貼れます。',
    tuneCopy: '結果をコピー', tuneCopied: 'コピーしました。チャットに貼ってください', tuneReset: '初期値に戻す', tuneT: '調整',
    helpTopics: [
      ['操作', '画面は、右上の手のひらでつかんで動かすか、画面の端（▲▼◀▶の帯）を押すと動きます。2本指・Ctrl＋ホイール・＋－で拡大縮小、「地図」で全体を見られます。\n下のタブ（設置・工事など）を押すと引き出しが開き、道具を選べます。選んだ道具は、もう一度押すか、タブを押すと解除できます。置いた物をタップすると、向きの変更やレベルアップができます。'],
      ['掘る', 'ドリルは地下に置きます（地上とつながった穴の隣なら、土を上書きして置けます）。置くと下へ掘ります。掘った資源はドリルの後ろに出て、空中の資源は下に落ちます。\n10mごとに硬い岩盤があり、研究所で「掘削レベル」を研究しないと掘れません（上限なし・だんだん高くなる）。ドリルを横向きにすれば横へ掘れます。「掘削」で、地上とつながった穴の隣を掘って場所を広げられます。'],
      ['運ぶ', 'コンベアで資源を運びます。仕分けコンベアは、選んだ資源だけを左右に出します。\n地上に出た資源はその場に置かれ、フォークリフトがヤードまで運びます。トラックが積んで出発し、帰ってきたら売上になります。'],
      ['加工', '機械は、前以外の方向から材料を入れると、前に製品を出します。対応していない資源は、機械の中を2倍の時間をかけて通り抜けます。\n最初はレンガ焼成機とクラッシャーだけ。'],
      ['作業員', '事務所で「Lv0を増員」して雇います。作業員はドリル・機械へ自分で歩いて行って操作し、働くほどレベルが上がります。作業員がいない所は「z」の印が付き、とても遅くなります。\nLv2以上になると、地上・上級勤務（フォークリフト・トラック・研究所）にも就きます。疲れると事務所で休みます。給料は毎月。払えない月は1人やめます。'],
      ['事務所と研究所', '事務所はタップでレベルアップできます。定員・フォークリフトの台数・休憩の速さが上がり、レベル2で下のタブの「施設」から研究所（1マス・地上のどこでも）を建てられます。\n研究所では、機械・まとめて強化・スキルを研究できます。Lv2以上の研究員がいないと、研究はとても遅くなります。フォークリフトは「強化」で買い足せます。'],
      ['お金', '売上はトラックが帰ってきた時に入ります。お金が少なく売上も無い月は、銀行が融資してくれます（売上から少しずつ返します）。\n「情報」で経営の様子をグラフで見られます。セーブは設定から。タイトルを押すとリセットできます。'],
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
      '下のタブの「スキル」で研究すると便利な力が手に入ります。10mごとの硬い岩盤は「掘削レベル」を研究しないと掘れません。事務所はタップでレベルアップできます。セーブは設定から。',
    ],
    skill: 'スキル', researching: '研究中', researchDone: n => `研究完了：${n}`, busy: 'ほかの研究中です', months: 'か月',
    startRes: '研究', got: '取得済み', resInfo: 'お金を払って研究すると、何か月か後にスキルが手に入ります（研究は1つずつ）。',
    sk: {
      autoConv: ['コンベア自動設置', 'ドリルが掘り進むと、後ろに自動でコンベアを置きます（1マス5）。設定でオン・オフできます。'],
      speed: ['時間速度アップ', '時間の速さ ×2 → ×4 → ×8 が選べるようになります。'],
      dragPlus: ['ドラッグ設置の強化', 'コンベアをなぞると、なぞった向きにそろえて置けます（曲がり角もOK）。'],
      hr: ['人事力', '新しく雇う人が Lv1 → Lv2 から始まります。'],
      veteran: ['ベテラン教育', '作業員のレベルが2倍の速さで上がります。'],
      welfare: ['福利厚生', '作業員が疲れにくくなり、休憩も早く終わります。'],
      black: ['ブラック企業', '給料を2割安くします。'],
      digLv: ['掘削レベル', '10mごとにある硬い岩盤を、1段ずつ掘れるようになります。'],
      truck2: ['トラック2台目', 'トラックが2台になり、交代で出発します。'],
      speeding: ['スピード違反', 'トラックが出かけている時間が半分になります。'],
      beltMax: ['コンベア最高速アップ', 'コンベアのレベル上限が1つ上がります。'],
      yardPlus: ['ヤード拡張', 'ヤードからの積み込みが2倍速くなり、山も大きく積めます。'],
      saveSlot: ['セーブ枠の追加', 'セーブできる場所が1つ増えます。'],
    },
    needDig: n => `掘削レベル${n}が必要です（スキル）`,
    rockHint: n => `硬い岩盤：掘削レベル${n}が必要（スキル）。ドリルを横向きにすれば横へ掘れます`,
    quit: '給料が払えず、作業員が1人やめました',
    autoConvOpt: 'コンベア自動設置', on: 'オン', off: 'オフ',
    saveT: 'セーブ', save: 'セーブ', load: 'ロード', slot: n => `スロット${n}`, empty: '空き', saved: 'セーブしました', loaded: 'ロードしました',
    confirmLoad: 'ロードしますか？（今の状態は消えます）', saveNG: 'この環境ではセーブできません',
    officeLv: '事務所', capP: n => `定員${n}人`, restSp: '休憩の速さ', full: '事務所の定員がいっぱいです', techUp: '技術UP',
    build: '設置', works: '工事', grpName: { drill: 'ドリル', belt: 'コンベア', machine: '機械' },
    fdrill: '高速ドリル', adrill: '自動ドリル', tee: 'T字路', cross: '交差', resTool: '設置物', toolRes: 'この設置物を置けるようになります。',
    digDo: '掘削する', overwriteQ: '上書きしますか？（今ある物は撤去して半額戻ります）', advNote0: 'Lv2以上になると、地上の仕事（フォークリフト・トラック）にも就きます。',
    facility: '施設', labUnlocked: '研究所を建てられるようになりました（下のタブの「施設」から）', labWhere: '研究所は地上の空いているマスに置けます', labOne: '研究所はもう建っています',
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
    play: '▶︎ うごかす', pause: '❚❚ とめる', top: 'ちじょう', dir: 'むき', move: 'いどう', uiOpt: 'がめん', uiStd: 'ふつう', uiDash: 'タブ（ためし）',
    help: 'あそびかた', settings: 'せってい', lang: 'もじ', reset: 'さいしょから',
    confirmReset: 'さいしょから やりなおしますか？', confirmReload: 'リセット しますか？（さいしょから よみこみ なおします）', yes: 'はい', no: 'いいえ',
    noMoney: 'おかねが たりません', cantPlace: 'ここには おけません', underOnly: 'ドリル・コンベア・きかいは ちかに おきます',
    cantDig: 'ここは ほれません（ちじょうと つながる あなの となりだけ）', maxed: 'さいだい',
    drillDir: 'ドリル', convDir: 'コンベア', sortTitle: 'しわけコンベア',
    filter: 'えらぶ もの', side: 'だす ほう', left: 'ひだり', right: 'みぎ',
    sortInfo: 'えらんだ ものだけを よこに だします。ほかは まっすぐ すすみます。',
    outDir: 'だす むき（まえ）', making: 'つくっている', waiting: 'ざいりょう まち', inBuf: 'ざいりょう',
    truck: 'トラック', loaded: 'つんだ かず', worth: 'うりね', depart: 'いますぐ しゅっぱつ', away: 'しゅっぱつちゅう', yard: 'おきば',
    lv: n => `レベル${n}`, levelUp: 'レベルアップ',
    pw: { drill: 'ほる ちから', belt: 'はやさ', machine: 'つくる はやさ', truck: 'つめる かず', fork: 'つめる かず' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v}マス/びょう`, machine: v => `×${v}`, truck: v => `${v}こ`, fork: v => `${v}こ` },
    grp: { drill: 'ドリル', belt: 'コンベア・しわけ', machine: 'きかい', truck: 'トラック' },
    allUp: (g, n) => `${g}を まとめて レベルアップ（${n}だい）`, none: 'ありません',
    items: { soil: 'つち', stone: 'いし', iron: 'てつ', gold: 'きん', dia: 'ダイヤの げんせき', gravel: 'じゃり', brick: 'レンガ',
      ironbar: 'てつの ぼう', goldbar: 'きんの ぼう', tool: 'てつの どうぐ', jewel: 'きんの かざり', diaClean: 'あらった ダイヤ',
      diaCut: 'カットした ダイヤ', gem: 'ほうせき', bag: 'ふくろづめ' },
    mach: { kiln: 'レンガやき', crusher: 'クラッシャー', smelter: 'ようこうろ', factory: 'しょうひん こうば', bagger: 'ふくろづめき',
      washer: 'あらいき', cutter: 'カットき', polisher: 'みがきき' },
    glyph: { kiln: 'か', crusher: 'く', smelter: 'ろ', factory: 'せ', bagger: 'ふ', washer: 'あ', cutter: 'き', polisher: 'み' },
    bagRule: 'おなじ もの 5こ → 1ふくろ（うりね 1.2ばい・3しゅるいまで いっしょに）',
    office: 'じむしょ', workers: 'さぎょういん', hire: 'やとう', fire: 'やめてもらう', stamina: 'たいりょく', tech: 'うでまえ',
    wage: 'きゅうりょう', perMonth: '/つき', fee: 'けいやくきん', payroll: 'きゅうりょう（まいつき）', cands: 'やとえる ひと（まいつき かわる）',
    noCands: 'こんげつは もう いません', nobody: 'まだ いません',
    wstate: { idle: 'まち', toWork: 'しごとへ', work: 'しごとちゅう', drive: 'うんてんちゅう', toRest: 'やすみに もどる', rest: 'やすみちゅう' },
    worker: n => `さぎょういん${n}`, manned: n => `さぎょういん：${n}`, unmanned: 'さぎょういん なし（とても おそい）',
    payPop: 'きゅうりょう',
    infoRows: { money: 'おかね', mSale: 'こんげつ うれた', mCost: 'こんげつ つかった', mNet: 'こんげつの もうけ', lNet: 'せんげつの もうけ',
      tSale: 'うれた ごうけい', tCost: 'つかった ごうけい', ships: 'しゅっか した かいすう', deepest: 'いちばん ふかい ところ', drills: 'ドリル',
      machines: 'きかい', belts: 'コンベア・しわけ', workers: 'さぎょういん（しごとちゅう）', yard: 'おきばの もの', loan: 'かりている おかね' },
    infoGrp: ['おかね', 'ぜんぶで', 'げんば'],
    loanPop: 'ぎんこうから かりた',
    unitN: 'だい', unitP: 'にん', unitK: 'こ', unitT: 'かい',
    gMoney: 'おかねの うごき', gMonth: 'つきごとの もうけ（みどり＝プラス・あか＝マイナス）',
    adm: { m1: 'おかね ＋1000', m10: 'おかね ＋10000', maxLv: 'ぜんぶ レベル さいだい', ace: 'すごい さぎょういんを やとう',
      month: '1かげつ すすめる', fast: 'はやさ ×16', clear: 'つちの なかを みる（きりかえ）', allSk: 'スキル ぜんぶ', finRes: 'けんきゅうを すぐ おわらせる', tune: 'ちょうせい' },
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
      'したの タブの「スキル」で けんきゅうすると べんりな ちからが てに はいります。10mごとの かたい がんばんは「あなほり レベル」が ないと ほれません。セーブは せっていから。',
    ],
    skill: 'スキル', researching: 'けんきゅうちゅう', researchDone: n => `けんきゅう おわり：${n}`, busy: 'ほかの けんきゅうちゅう です', months: 'かげつ',
    startRes: 'けんきゅう', got: 'てにいれた', resInfo: 'おかねを はらって けんきゅうすると、なんかげつか あとに スキルが てに はいります（けんきゅうは 1つずつ）。',
    sk: {
      autoConv: ['コンベア じどう おき', 'ドリルが ほりすすむと、うしろに じどうで コンベアを おきます（1マス5）。せっていで オン・オフ できます。'],
      speed: ['じかんの はやさ アップ', 'じかんの はやさ ×2 → ×4 → ×8 が えらべるように なります。'],
      dragPlus: ['なぞって おく', 'コンベアを なぞると、なぞった むきに そろえて おけます（まがりかども OK）。'],
      hr: ['ひとを みる ちから', 'あたらしく やとう ひとが Lv1 → Lv2 から はじまります。'],
      veteran: ['ベテランきょういく', 'さぎょういんの レベルが 2ばいの はやさで あがります。'],
      welfare: ['ふくりこうせい', 'さぎょういんが つかれにくく なり、やすみも はやく おわります。'],
      black: ['ブラックきぎょう', 'きゅうりょうを 2わり やすく します。'],
      digLv: ['あなほり レベル', '10mごとに ある かたい がんばんを、1だんずつ ほれるように なります。'],
      truck2: ['トラック 2だいめ', 'トラックが 2だいに なり、こうたいで でかけます。'],
      speeding: ['スピードいはん', 'トラックが でかけている じかんが はんぶんに なります。'],
      beltMax: ['コンベア さいこうそく アップ', 'コンベアの レベルの じょうげんが 1つ あがります。'],
      yardPlus: ['おきば かくちょう', 'おきばから つむのが 2ばい はやく なり、やまも おおきく つめます。'],
      saveSlot: ['セーブわく ついか', 'セーブ できる ばしょが 1つ ふえます。'],
    },
    needDig: n => `あなほり レベル${n}が ひつよう です（スキル）`,
    rockHint: n => `かたい がんばん：あなほり レベル${n}が ひつよう。ドリルを よこむきに すれば よこへ ほれます`,
    quit: 'きゅうりょうが はらえず、さぎょういんが 1にん やめました',
    autoConvOpt: 'コンベア じどう おき', on: 'オン', off: 'オフ',
    saveT: 'セーブ', save: 'セーブ', load: 'ロード', slot: n => `スロット${n}`, empty: 'あき', saved: 'セーブ しました', loaded: 'ロード しました',
    confirmLoad: 'ロード しますか？（いまの じょうたいは きえます）', saveNG: 'ここでは セーブ できません',
    officeLv: 'じむしょ', capP: n => `ていいん${n}にん`, restSp: 'やすむ はやさ', full: 'じむしょが いっぱい です', techUp: 'うでまえUP',
    build: 'おく', works: 'こうじ', grpName: { drill: 'ドリル', belt: 'コンベア', machine: 'きかい' },
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
    play: '▶︎ Play', pause: '❚❚ Pause', top: 'Top', dir: 'Dir', move: 'Move', uiOpt: 'Screen', uiStd: 'Standard', uiDash: 'Tabs (test)',
    help: 'How to play', settings: 'Settings', lang: 'Text', reset: 'Restart',
    confirmReset: 'Start over from the beginning?', confirmReload: 'Reset? (reloads the page)', yes: 'Yes', no: 'No',
    noMoney: 'Not enough money', cantPlace: 'Cannot place here', underOnly: 'Drills, conveyors and machines go underground',
    cantDig: 'Cannot dig here (only next to holes connected to the surface)', maxed: 'MAX',
    drillDir: 'Drill', convDir: 'Conveyor', sortTitle: 'Sorting conveyor',
    filter: 'Picks', side: 'Out to', left: 'Left', right: 'Right',
    sortInfo: 'Sends the chosen item out to the side. Everything else goes straight.',
    outDir: 'Output (front)', making: 'Working', waiting: 'Waiting', inBuf: 'Input',
    truck: 'Truck', loaded: 'Loaded', worth: 'Value', depart: 'Leave now', away: 'Away', yard: 'Yard',
    lv: n => `Lv ${n}`, levelUp: 'Level up',
    pw: { drill: 'Power', belt: 'Speed', machine: 'Work speed', truck: 'Capacity', fork: 'Capacity' },
    pwUnit: { drill: v => `×${v}`, belt: v => `${v} cells/s`, machine: v => `×${v}`, truck: v => `${v}`, fork: v => `${v}` },
    grp: { drill: 'drills', belt: 'conveyors & sorters', machine: 'machines', truck: 'truck' },
    allUp: (g, n) => `Level up all ${g} (${n})`, none: 'Nothing to upgrade',
    items: { soil: 'Dirt', stone: 'Stone', iron: 'Iron', gold: 'Gold', dia: 'Raw diamond', gravel: 'Gravel', brick: 'Brick',
      ironbar: 'Iron bar', goldbar: 'Gold bar', tool: 'Iron goods', jewel: 'Gold jewelry', diaClean: 'Clean diamond',
      diaCut: 'Cut diamond', gem: 'Gem', bag: 'Bag' },
    mach: { kiln: 'Brick kiln', crusher: 'Crusher', smelter: 'Smelter', factory: 'Workshop', bagger: 'Bagger',
      washer: 'Washer', cutter: 'Cutter', polisher: 'Polisher' },
    glyph: { kiln: 'K', crusher: 'C', smelter: 'S', factory: 'W', bagger: 'B', washer: 'Wa', cutter: 'Cu', polisher: 'P' },
    bagRule: '5 of the same → 1 bag (value ×1.2, up to 3 kinds at once)',
    office: 'Office', workers: 'Workers', hire: 'Hire', fire: 'Dismiss', stamina: 'Stamina', tech: 'Skill',
    wage: 'Wage', perMonth: '/mo', fee: 'Signing fee', payroll: 'Payroll (monthly)', cands: 'Candidates (change monthly)',
    noCands: 'No more candidates this month', nobody: 'Nobody yet',
    wstate: { idle: 'Idle', toWork: 'Going to work', work: 'Working', drive: 'Driving', toRest: 'Going to rest', rest: 'Resting' },
    worker: n => `Worker ${n}`, manned: n => `Operator: ${n}`, unmanned: 'No operator (very slow)',
    payPop: 'Wages',
    infoRows: { money: 'Money', mSale: 'Sales this month', mCost: 'Costs this month', mNet: 'Net this month', lNet: 'Net last month',
      tSale: 'Total sales', tCost: 'Total costs', ships: 'Shipments', deepest: 'Deepest', drills: 'Drills',
      machines: 'Machines', belts: 'Conveyors & sorters', workers: 'Workers (working)', yard: 'Items in yard', loan: 'Loan (repaid from sales)' },
    infoGrp: ['Money', 'Totals', 'Site'],
    loanPop: 'Bank loan',
    unitN: '', unitP: '', unitK: '', unitT: '',
    gMoney: 'Money over time', gMonth: 'Monthly net (green = profit, red = loss)',
    adm: { m1: 'Money +1000', m10: 'Money +10000', maxLv: 'Max all levels', ace: 'Hire an ace worker',
      month: 'Skip 1 month', fast: 'Speed ×16', clear: 'Reveal underground (toggle)', allSk: 'All skills', finRes: 'Finish research now', tune: 'Tuning' },
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
      'Research "Skills" from the menu. The hard bedrock every 10m needs the Dig level skill. Tap the office to upgrade it. Save from Settings.',
    ],
    skill: 'Skills', researching: 'Researching', researchDone: n => `Research done: ${n}`, busy: 'Another research is in progress', months: ' mo',
    startRes: 'Research', got: 'Acquired', resInfo: 'Pay to research; the skill arrives after a few in-game months (one at a time).',
    sk: {
      autoConv: ['Auto conveyor', 'Drills lay conveyors behind them as they dig (5 per cell). Toggle in Settings.'],
      speed: ['Faster time', 'Unlocks time speeds x2 -> x4 -> x8.'],
      dragPlus: ['Smart drag', 'Dragged conveyors follow the direction you draw, corners included.'],
      hr: ['HR power', 'New hires start at Lv1, then Lv2.'],
      veteran: ['Veteran training', 'Workers level up twice as fast.'],
      welfare: ['Welfare', 'Workers tire more slowly and rest faster.'],
      black: ['Black company', 'Wages are 20% cheaper.'],
      digLv: ['Dig level', 'Lets you break through the hard bedrock layer every 10m, one layer per level.'],
      truck2: ['Second truck', 'Two trucks take turns.'],
      speeding: ['Speeding', 'Trucks are away for half the time.'],
      beltMax: ['Conveyor top speed', 'Raises the conveyor level cap by one.'],
      yardPlus: ['Bigger yard', 'Loading from the yard is twice as fast and the pile can grow bigger.'],
      saveSlot: ['Extra save slot', 'Adds one more save slot.'],
    },
    needDig: n => `Needs dig level ${n} (skill)`,
    rockHint: n => `Hard bedrock: needs dig level ${n}. Turn the drill sideways to keep digging`,
    quit: 'Could not pay wages: one worker quit',
    autoConvOpt: 'Auto conveyor', on: 'On', off: 'Off',
    saveT: 'Save', save: 'Save', load: 'Load', slot: n => `Slot ${n}`, empty: 'Empty', saved: 'Saved', loaded: 'Loaded',
    confirmLoad: 'Load this save? (current game will be lost)', saveNG: 'Saving is not available here',
    officeLv: 'Office', capP: n => `${n} staff max`, restSp: 'Rest speed', full: 'The office is full', techUp: 'Skill up',
    build: 'Build', works: 'Works', grpName: { drill: 'Drills', belt: 'Conveyors', machine: 'Machines' },
    fdrill: 'Fast drill', adrill: 'Auto drill', tee: 'T-junction', cross: 'Crossing', resTool: 'Equipment', toolRes: 'Lets you place this equipment.',
    digDo: 'Dig', overwriteQ: 'Replace it? (the current one is removed for a half refund)', advNote0: 'From Lv2, workers also take surface jobs (forklifts, trucks).',
    facility: 'Facilities', labUnlocked: 'You can now build the Lab (Facilities tab)', labWhere: 'Place the Lab on a free surface cell', labOne: 'The Lab is already built',
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
const inB = (c, r) => c >= 0 && c < COLS && r >= 0;
const isBelt = s => !!s && (s.type === 'conv' || s.type === 'sort' || s.type === 'tee' || s.type === 'cross');
const isDrillTool = t => t === 'drill' || t === 'fdrill' || t === 'adrill';
const isStation = s => !!s && (s.type === 'drill' || s.type === 'machine');   // 作業員がつく物
const isYard = (c, r) => r === YARD_R && c >= YARD_C;
const isOffice = (c, r) => r === YARD_R && (c === OFFICE_C || c === OFFICE_C + 1);
const isLab = (c, r) => S.lab.built && r === YARD_R && c === S.lab.c;   // 研究所（1マス・地上のどこでも）
const labC = () => (S.lab.built ? S.lab.c : OFFICE_C + 1);
// 地上（施設の段）で空いているマス：施設どうしだけが重ならない。地下とはお互いに干渉しない
const surfaceFree = c => inB(c, YARD_R) && !isYard(c, YARD_R) && !isOffice(c, YARD_R) && !isLab(c, YARD_R);
const OFFICE_K = key(OFFICE_C + 1, YARD_R);   // 事務所の出入り口
const itemVal = it => Math.round((it.v !== undefined ? it.v : ITEMS[it.k].v) * TUNE.price);   // 売値（調整の倍率つき）
const grpOf = s => (s === 'truck' ? 'truck' : s.type === 'fork' ? 'fork' : s.type === 'drill' ? 'drill' : isBelt(s) ? 'belt' : 'machine');
const lvOf = s => (s === 'truck' ? S.truck.lv : s.lv);
const valOf = s => LV[grpOf(s)].val[lvOf(s)];
const sk = id => (S.skills[id] || 0);
const lvCap = g => (g === 'belt' ? 5 + sk('beltMax') : LV[g].cost.length);   // レベルの上限
// 時間の速さ：最初は×1だけ。スキルで増える（管理メニューの×16はテスト用）
function speeds() { const a = [1, 2, 4, 8].slice(0, 1 + sk('speed')); if (S.adminFast) a.push(16); return a; }
const drainMul = () => [1, 0.75, 0.5][sk('welfare')];                         // 福利厚生：疲れにくい
const restMul = () => [1, 1.5, 2][sk('welfare')] * OFFICE_LV.rest[S.office.lv]; // 休憩の速さ
const newTruck = phase => ({ type: 'truck', op: null, load: 0, value: 0, phase, t: 0, acc: 0 });

// ■をつくる（中身は見えない）
function makeBlock(r) {
  const d = r - SKY;
  if (d > 0 && d % LAYER_EVERY === 0) {   // 硬い岩盤（掘削レベルが必要）
    return { mat: 'rock', layer: d / LAYER_EVERY, ore: null, yieldN: 2, left: 2, h: (2 + d * 0.08) * 3, p: 0 };
  }
  const stone = Math.random() < clamp(0.04 + 0.025 * d, 0, 0.7);
  const x = Math.random();
  const diaP = d >= 15 ? Math.min(0.06, 0.01 + 0.002 * (d - 15)) * TUNE.ore : 0;
  const goldP = d >= 6 ? Math.min(0.14, 0.03 + 0.006 * (d - 6)) * TUNE.ore : 0;
  const ironP = Math.min(0.35, 0.16 + 0.01 * d) * TUNE.ore;
  const ore = x < diaP ? 'dia' : x < diaP + goldP ? 'gold' : x < diaP + goldP + ironP ? 'iron' : null;
  const yieldN = Math.min(16, 8 + Math.floor(d / 5));     // 1マスから出る数（多めに。そのぶん1マス掘るのに時間がかかる）
  const h = (2 + d * 0.08) * (stone ? 2 : 1) * TUNE.hard;             // 1個出すのに必要な削る量（硬さ）
  return { mat: stone ? 'stone' : 'soil', ore, yieldN, left: yieldN, h, p: 0 };
}
function oreFrom(b) {
  const share = { iron: 0.45, gold: 0.35, dia: 0.25 };
  return b.ore && Math.random() < share[b.ore] ? b.ore : (b.mat === 'rock' ? 'stone' : b.mat);
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
const digCost = b => Math.round((10 + b.h * b.yieldN * 1.5) * TUNE.digCost);  // 掘削の費用（硬いほど高い）

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
const hireLv = () => Math.min(2, sk('hr'));   // 雇う人のレベル（人事力で上がる）
function gainExp(w, dt) {
  w.exp += dt * (sk('veteran') ? 2 : 1);
  if (w.lv < LV_EXP.length && w.exp >= LV_EXP[w.lv]) { w.lv++; w.stamina = Math.min(w.stamina + 10, maxStamina(w)); pop(tx().lvUpW(w.lv), w.x, w.y - 0.5, 'sale'); }
}

function newGame() {
  S = {
    rows: new Map(),
    st: new Map(),      // 設備：key -> {type:'drill'|'conv'|'sort'|'machine', dir, lv, op?, ...}
    items: [],          // 資源レイヤー：{k, x, y, vy, lane, spd, ox, oy, tk, v?, of?}
    yard: [],           // ヤードに溜まった資源：{k, v?, of?, rx, ry}
    money: TUNE.startMoney,
    truck: { lv: 0 }, fleet: [newTruck('here')],   // トラック（レベルは共通）
    skills: {}, research: null, opts: { autoConv: true }, office: { lv: 0 }, adminFast: false,
    workers: [], wid: 0, month: 0,
    lab: { type: 'lab', built: false, op: null },   // 研究所
    unlock: { kiln: true, crusher: true },          // 研究で使えるようになった物
    time: 0,
    deepest: SKY + 6,
    pops: [],
    dock: {},           // 地上に出て、フォークリフトを待っている資源（列ごと）
    forks: [],          // フォークリフト（最初から1台）
    digVer: 0,          // 地形が変わった回数（掘れる場所・歩ける道の再計算用）
    stats: { saleTotal: 0, costTotal: 0, ships: 0, cur: { sale: 0, cost: 0 }, months: [], hist: [], histT: 0 },
    reveal: false,
  };
  // 最初は作業員0人（自分ひとりでやっている設定）。事務所で雇う
  S.forks.push(Object.assign(newFork(), { x: PARK_X }));
  row(SKY)[3] = null;   // 最初からドリルが1つ置いてある
  S.st.set(key(3, SKY), { type: 'drill', tid: 'drill', dir: 'down', lv: 0, t: 0, hit: -99, op: null });
  resetCam();
}

// 設備を置けるマス
const isOpen = (c, r) => inB(c, r) && r >= SKY && blk(c, r) === null && !S.st.has(key(c, r));   // 地下の空いたマス
// 設置する道具を選んでいるか／そのマスに置けるか（ドリルは地上にも、コンベア・機械は地下だけ）
const isBuildTool = () => isDrillTool(tool) || tool === 'conv' || tool === 'sort' || tool === 'tee' || tool === 'cross' || tool === 'machine' || tool === 'lab';
// そのマスに置けるか
// ・研究所：地上の段、施設の無いマス
// ・ドリル：地下1段目より下。空いたマス、または地上とつながった穴の隣の土・石（上書きして置く）
// ・コンベア・機械：地下の空いたマス
function canPlaceAt(c, r) {
  if (tool === 'lab') return r === YARD_R && surfaceFree(c) && !S.lab.built;
  if (!inB(c, r) || r < SKY) return false;
  const b = blk(c, r);
  if (isDrillTool(tool) && b) return diggable().has(key(c, r)) && !(b.mat === 'rock' && sk('digLv') < b.layer);
  return b === null;   // 何か置いてあっても上書きできる
}
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

// ---- お金と浮き文字 ----
function pop(text, wx, wy, kind) { S.pops.push({ text, wx, wy, kind, t0: performance.now() }); }
function spend(cost, wx, wy, label) {
  S.money -= cost; S.stats.cur.cost += cost; S.stats.costTotal += cost;
  pop((label ? label + ' ' : '') + '-' + cost, wx, wy, 'cost');
}
function earn(v, wx, wy) {
  S.money += v;
  if (v >= 0) { S.stats.cur.sale += v; S.stats.saleTotal += v; }
  pop((v >= 0 ? '+' : '') + v, wx, wy, v >= 0 ? 'sale' : 'cost');
}

// ---- 機械 ----
function accepts(m, it) {
  const def = MACHINES[m.m];
  if (def.bag) {   // 袋詰め機：3種類まで同時に詰められる
    if (it.k === 'bag') return false;
    const b = m.bags || (m.bags = {});
    if (b[it.k] !== undefined) return b[it.k] < def.bag * 2;
    return Object.keys(b).length < 3;
  }
  const rec = def.recipes.find(x => x.in === it.k);
  return !!rec && (m.buf[it.k] || 0) < rec.n * 3;
}
function absorb(m, it) {
  if (MACHINES[m.m].bag) { const b = m.bags || (m.bags = {}); b[it.k] = (b[it.k] || 0) + 1; }
  else m.buf[it.k] = (m.buf[it.k] || 0) + 1;
}
const machineAt = (c, r) => { const s = inB(c, r) && S.st.get(key(c, r)); return s && s.type === 'machine' ? s : null; };
// 作業員がついていれば普通の速さ（技術で上がる）、いなければとても遅い
function workFactor(s) {
  const w = opOf(s);
  return w ? techFactor(w) : TUNE.unmanned;
}

function updateMachines(dt) {
  for (const [k, m] of S.st) {
    if (m.type !== 'machine') continue;
    const def = MACHINES[m.m];
    if (!m.cur) {
      if (def.bag) {
        const b = m.bags || (m.bags = {});
        const kind = Object.keys(b).find(k2 => b[k2] >= def.bag);
        if (kind) {
          const v1 = ITEMS[kind].v;
          m.cur = { k: 'bag', of: kind, v: v1 > 0 ? Math.round(v1 * def.bag * 1.2) : v1 * def.bag };
          b[kind] -= def.bag; if (!b[kind]) delete b[kind];
          m.prog = 0;
        }
      } else {
        for (const rec of def.recipes) {
          if ((m.buf[rec.in] || 0) >= rec.n) { m.buf[rec.in] -= rec.n; m.cur = { k: rec.out }; m.prog = 0; break; }
        }
      }
    }
    if (m.cur) {
      m.prog = Math.min(def.time, m.prog + dt * valOf(m) * workFactor(m));
      if (m.prog >= def.time && emitFront(k, m)) m.cur = null;
    }
  }
}
// 対応していない資源は、機械の中をそのまま通って前に出る。出られた／機械に入ったら true
function passThrough(m, mc, mr, it) {
  const [dx, dy] = DIRS[m.dir];
  const fc = mc + dx, fr = mr + dy;
  const next = machineAt(fc, fr);
  if (next) { if (!accepts(next, it)) return false; absorb(next, it); it.gone = true; return true; }
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
function toYard(it) { S.yard.push({ k: it.k, v: it.v, of: it.of, rx: Math.random(), ry: Math.random() }); }
const PARK_X = OFFICE_C - 0.35;   // フォークリフトの待機場所（事務所の左横）
function toSurface(it) {
  const c = clamp(Math.floor(it.x), 0, COLS - 1);
  if (c >= YARD_C) { toYard(it); return; }
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
      f.x += Math.sign(d) * Math.min(Math.abs(d), FORK_SPEED[f.lv] * TUNE.fork * (drv ? techFactor(drv) : 0.45) * dt);
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
    if (f.state === 'toYard') { if (move(YARD_C + 0.5)) { f.state = 'unloading'; f.acc = 0; } continue; }
    if (f.state === 'unloading') {
      f.acc += dt * FORK.rate * 1.5;
      while (f.acc >= 1 && f.load.length) { const it = f.load.shift(); S.yard.push({ ...it, rx: Math.random(), ry: Math.random() }); f.acc--; }
      if (!f.load.length) f.state = 'idle';
    }
  }
}

// ---- 時間を進める ----
function sim(sec) {
  while (sec > 1e-9) {
    const dt = Math.min(SUB_SEC, sec);
    sec -= dt;
    S.time += dt;
    updateItems(dt);
    updateWorkers(dt);
    updateDrills(dt);
    updateMachines(dt);
    updateForks(dt);
    updateTruck(dt);
    updateResearch(dt);
    updateMonth();
    S.stats.histT += dt;   // 情報グラフ用に資金を記録（1秒ごと）
    if (S.stats.histT >= 1) { S.stats.histT -= 1; S.stats.hist.push(S.money); if (S.stats.hist.length > 300) S.stats.hist.shift(); }
  }
}

// 月が変わったら：給料を払う・その月の収支を記録・雇える人を入れかえ
function updateMonth() {
  const m = Math.floor(S.time / TUNE.month);
  if (m === S.month) return;
  S.month = m;
  const total = Math.round(S.workers.reduce((a, w) => a + wageOf(w), 0) * (sk('black') ? 0.8 : 1) * TUNE.wage);
  if (total > 0) {
    if (S.money >= total) spend(total, OFFICE_C + 1, YARD_R, tx().payPop);
    else {
      // 払えない月：給料は払わず、いちばん給料の高い作業員が1人やめる（借金が雪だるまにならないように）
      const w = S.workers.reduce((a, b) => (wageOf(b) > wageOf(a) ? b : a));
      fireWorker(w.id);
      say(tx().quit); pop(tx().quit, OFFICE_C + 1, YARD_R - 0.4, 'cost');
    }
  }
  // 銀行の融資：お金が100未満で、先月の売上が0なら300貸してくれる（売上の2割ずつ返す。合計1500まで）
  if (S.money < 100 && S.stats.cur.sale === 0 && (S.loan || 0) + LOAN <= LOAN_MAX && S.month > 1) {   // 返している途中でも、上限までは借りられる
    S.money += LOAN; S.loan = (S.loan || 0) + LOAN;
    pop(tx().loanPop + ' +' + LOAN, OFFICE_C + 1, YARD_R - 0.4, 'sale'); say(tx().loanPop + ' +' + LOAN);
  }
  S.stats.months.push(S.stats.cur); if (S.stats.months.length > 24) S.stats.months.shift();
  S.stats.cur = { sale: 0, cost: 0 };
}

function approach(v, target, d) { return Math.abs(target - v) <= d ? target : v + Math.sign(target - v) * d; }

function updateItems(dt) {
  for (let i = S.items.length - 1; i >= 0; i--) {
    const it = S.items[i];
    if (it.y < SKY) { toSurface(it); S.items.splice(i, 1); continue; }   // 地上に出た → その場に置く（フォークリフトが運ぶ）
    const c = Math.floor(it.x), r = Math.floor(it.y), k = key(c, r);
    const s = S.st.get(k);
    if (s && s.type === 'machine' && it.thru) {   // 機械の中を通り抜け中（コンベアの半分の速さ＝2倍の時間）
      const [dx, dy] = DIRS[s.dir], v = (it.ps || 0.8) * 0.5 * it.spd * dt * TUNE.belt;
      if (dx !== 0) it.y = approach(it.y, r + 0.5 + it.lane, v); else it.x = approach(it.x, c + 0.5 + it.lane, v);
      const nx = it.x + dx * v, ny = it.y + dy * v, nc = Math.floor(nx), nr = Math.floor(ny);
      if (nc === c && nr === r) { it.x = nx; it.y = ny; continue; }
      const m2 = machineAt(nc, nr);
      if (m2 && accepts(m2, it)) { absorb(m2, it); S.items.splice(i, 1); continue; }
      if (!m2 && inB(nc, nr) && blk(nc, nr) === null && (nr < SKY || isBelt(S.st.get(key(nc, nr))))) { it.x = nx; it.y = ny; it.thru = false; continue; }
      if (dx) it.x = c + 0.5 + dx * 0.42; else it.y = r + 0.5 + dy * 0.42;   // 出口がふさがっている
      continue;
    }
    if (!isBelt(s)) {
      it.x = approach(it.x, c + 0.5 + it.ox, dt * 0.6);
      const restY = r + 0.78 + it.oy * 0.3;
      if (!isSolid(c, r + 1)) {
        it.vy = Math.min(it.vy + GRAV * dt, 9); it.y += it.vy * dt;
      } else if (it.y < restY) {
        it.vy = Math.min(it.vy + GRAV * dt, 9); it.y = Math.min(restY, it.y + it.vy * dt);
      } else {
        it.vy = 0;
        const m = machineAt(c, r + 1);
        if (m && accepts(m, it)) { absorb(m, it); S.items.splice(i, 1); }
        else if (m && passThrough(m, c, r + 1, it) && it.gone) S.items.splice(i, 1);   // 上から落ちてきた対応外の物も通す
      }
      continue;
    }
    it.vy = 0;
    it.ps = valOf(s);
    const v = valOf(s) * it.spd * dt * TUNE.belt;
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
    if (s.type === 'sort' && it.k === s.filter) {
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
      if (accepts(m, it)) { absorb(m, it); S.items.splice(i, 1); continue; }
      it.thru = true; it.x = nx; it.y = ny; continue;   // 対応外：機械の中を通り抜ける（2倍の時間）
    }
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
    const iv = s.tid === 'fdrill' ? 0.35 : DRILL_HIT_SEC;   // 高速ドリルは速い
    if (s.t < iv) continue;
    s.t -= iv;
    drillHit(k, s);
  }
}
function moveDrill(k, s, nk) {
  S.st.delete(k); S.st.set(nk, s); S.deepest = Math.max(S.deepest, rOf(nk));
  const came = s.came; s.came = s.dir;   // そのマスに入ってきた向きを覚える
  // スキル「コンベア自動設置」：空いた後ろのマスに、後ろ向き（↓に掘るなら↑）のコンベアを置く
  if (S.opts.autoConv) {
    const c = cOf(k), r = rOf(k);
    if (r >= SKY && isOpen(c, r) && S.money >= COST.conv) {
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
  return g.mat === 'rock' && sk('digLv') < g.layer;
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
  if (g.mat === 'rock' && sk('digLv') < g.layer) {   // 掘削レベルが足りない → 止まる（最初の1回だけヒント）
    if (!s.stuck && !s.rockHint) { s.rockHint = true; say(tx().rockHint(g.layer)); }
    s.stuck = true; return;
  }
  s.stuck = false; s.hit = S.time;
  g.p += valOf(s) * workFactor(s) * TUNE.drill;
  while (g.p >= g.h && g.left > 0) { g.p -= g.h; g.left--; emitOre(c, r, s, oreFrom(g)); }
  if (g.left <= 0) { row(tr)[tc] = null; S.digVer++; moveDrill(k, s, key(tc, tr)); }
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
  earn(t.value, BED + 1, YARD_R);          // 帰ってきたら売上
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
        t.acc += dt * LOAD_RATE * (sk('yardPlus') ? 2 : 1);
        while (t.acc >= 1 && t.load < cap && S.yard.length) {
          const it = S.yard.shift();
          t.value += itemVal(it); t.load++; t.acc--;
        }
      } else t.acc = 0;
      if (t.load >= cap) { t.phase = 'leaving'; t.t = 0; }
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
function resDef(id) {
  if (id.startsWith('m:')) {
    const m = id.slice(2), [c, mo] = RESEARCH_MACH[m];
    return { name: tx().mach[m], desc: tx().machRes, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock[m] };
  }
  if (id.startsWith('t:')) {
    const t = id.slice(2), [c, mo] = RESEARCH_TOOL[t];
    return { name: tx()[t], desc: tx().toolRes, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock[t] };
  }
  if (id === 'batch') {
    const [c, mo] = RESEARCH_BATCH;
    return { name: tx().batchName, desc: tx().batchDesc, cost: Math.round(c * TUNE.resCost / 10) * 10, months: Math.max(1, Math.round(mo * TUNE.resTime)), done: !!S.unlock.batch };
  }
  const sid = id.slice(3), lv = sk(sid), def = SKILLS[sid];
  return { name: tx().sk[sid][0], desc: tx().sk[sid][1], cost: skCost(sid, lv), months: skMonths(sid, lv), done: lv >= def.max, lv, max: def.max };
}
const labRate = () => { const w = opOf(S.lab); return w ? techFactor(w) : 0.25; };   // 研究員がいないととても遅い
function startResearch(id) {
  if (SKILLS[id]) id = 'sk:' + id;             // 古い呼び方にも対応
  if (!S.lab.built) { say(tx().needLab); return; }
  const d = resDef(id);
  if (d.done) return;
  if (S.research) { say(tx().busy); return; }
  if (S.money < d.cost) { say(tx().noMoney); return; }
  spend(d.cost, labC() + 0.5, YARD_R);
  S.research = { id, t: 0, total: d.months * TUNE.month };
}
function gainSkill(id) {
  S.skills[id] = sk(id) + 1;
  if (id === 'speed') speedIdx = speeds().length - 1;          // 取ったら一番速く（あとで変えられる）
  if (id === 'truck2') S.fleet.push(newTruck('standby'));
  if (id === 'autoConv') S.opts.autoConv = true;
}
function finishResearch(id) {
  if (id.startsWith('m:') || id.startsWith('t:')) S.unlock[id.slice(2)] = true;
  else if (id === 'batch') S.unlock.batch = true;
  else gainSkill(id.slice(3));
}
function updateResearch(dt) {
  const r = S.research;
  if (!r) return;
  r.t += dt * labRate();
  if (r.t < r.total) return;
  S.research = null;
  const name = resDef(r.id).name;
  finishResearch(r.id);
  const msg = tx().researchDone(name);
  pop(msg, labC() + 0.5, YARD_R - 0.4, 'sale'); say(msg);
}
// 事務所のレベルアップ（レベル2で研究所が建つ）
function officeUp() {
  const ol = S.office.lv;
  if (ol >= OFFICE_LV.cost.length) return;
  if (S.money < OFFICE_LV.cost[ol]) { say(tx().noMoney); return; }
  spend(OFFICE_LV.cost[ol], OFFICE_C + 1, YARD_R); S.office.lv++;
  if (S.office.lv === 1 && !S.lab.built) say(tx().labUnlocked);   // 研究所を建てられるようになった（メニュー「施設」）
}
// フォークリフトを買う（台数の上限は事務所のレベル）
const forkMax = () => OFFICE_LV.forks[S.office.lv];
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
    workers: S.workers.map(w => ({ ...w, target: !w.target ? null : w.target.type === 'lab' ? 'lab'
      : w.target.type === 'fork' ? 'f' + S.forks.indexOf(w.target) : w.target.type === 'truck' ? 't' + S.fleet.indexOf(w.target)
      : keyOf.has(w.target) ? keyOf.get(w.target) : null })) };
  return JSON.stringify({ v: VERSION, at: Date.now(), S: data });
}
function deserialize(json) {
  const d = JSON.parse(json).S;
  d.rows = new Map(d.rows); d.st = new Map(d.st); d.pops = [];
  d.dock = d.dock || {}; d.forks = d.forks || [Object.assign(newFork(), { x: PARK_X })];
  // 古いセーブへの対応
  d.lab = d.lab || { type: 'lab', built: false, op: null };
  if (d.lab.built && d.lab.c === undefined) d.lab.c = OFFICE_C + 2;   // v0.17のセーブ（予定地に建っていた）
  d.unlock = d.unlock || Object.fromEntries(MACHINE_ORDER.map(m => [m, true]));
  for (const f of d.forks) { f.type = 'fork'; f.lv = f.lv || 0; f.op = f.op || null; }
  for (const t of d.fleet) { t.type = 'truck'; t.op = t.op || null; }
  for (const w of d.workers) {
    if (w.lv === undefined) { w.lv = Math.max(0, (w.techLv || 1) - 1); w.exp = w.lv ? LV_EXP[w.lv - 1] : 0; w.vs = 1; w.vt = 1; }
    const t = w.target;
    w.target = t === null || t === undefined ? null : t === 'lab' ? d.lab
      : typeof t === 'string' && t[0] === 'f' ? d.forks[+t.slice(1)] || null
      : typeof t === 'string' && t[0] === 't' ? d.fleet[+t.slice(1)] || null
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
function officeMap() {
  if (pathCache.ver === S.digVer) return pathCache;
  const prev = new Map(), dist = new Map([[OFFICE_K, 0]]), q = [OFFICE_K];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], c = cOf(k), r = rOf(k);
    for (const [dx, dy] of NB) {
      const nc = c + dx, nr = r + dy;
      if (!inB(nc, nr) || blk(nc, nr) !== null) continue;
      const nk = key(nc, nr);
      if (dist.has(nk)) continue;
      dist.set(nk, dist.get(k) + 1); prev.set(nk, k); q.push(nk);
    }
  }
  pathCache = { ver: S.digVer, prev, dist };
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
  const prev = new Map([[fromK, -1]]), q = [fromK];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], c = cOf(k), r = rOf(k);
    for (const [dx, dy] of NB) {
      const nc = c + dx, nr = r + dy;
      if (!inB(nc, nr) || blk(nc, nr) !== null) continue;
      const nk = key(nc, nr);
      if (prev.has(nk)) continue;
      prev.set(nk, k);
      if (nk === toK) { const p = []; for (let x = toK; x !== fromK; x = prev.get(x)) p.push(x); return p.reverse(); }
      q.push(nk);
    }
  }
  return null;
}
const wKey = w => key(clamp(Math.floor(w.x), 0, COLS - 1), Math.max(0, Math.floor(w.y)));
const isAdvPost = p => p.type === 'lab' || p.type === 'fork' || p.type === 'truck';
// 持ち場の場所（マス）
function postKey(p) {
  if (p.type === 'lab') return key(labC(), YARD_R);
  if (p.type === 'fork') return key(clamp(Math.floor(p.x), 0, COLS - 1), YARD_R);
  if (p.type === 'truck') return key(BED, YARD_R);
  return stationKey(p);
}
function postAlive(p) {
  if (p.type === 'lab') return S.lab.built;
  if (p.type === 'fork') return S.forks.includes(p);
  if (p.type === 'truck') return S.fleet.includes(p);
  return stationKey(p) >= 0;
}
// その持ち場で今働いている（運転している）作業員
const opOf = p => (p && p.op ? S.workers.find(w => w.id === p.op && w.target === p && (w.state === 'work' || w.state === 'drive')) : null);
const stationKey = s => { for (const [k, v] of S.st) if (v === s) return k; return -1; };

// 1マスずつ歩く（横は速く、縦ははしごでゆっくり）
function walk(w, dt) {
  while (w.path.length && dt > 0) {
    const k = w.path[0], tx_ = cOf(k) + 0.5, ty = rOf(k) + 0.5;
    const ddx = tx_ - w.x, ddy = ty - w.y;
    if (Math.abs(ddx) < 1e-3 && Math.abs(ddy) < 1e-3) { w.path.shift(); continue; }
    const sp = (Math.abs(ddy) > Math.abs(ddx) ? WALK_V : WALK_H) * TUNE.walk;
    const d = Math.hypot(ddx, ddy), step = sp * dt;
    if (step >= d) { w.x = tx_; w.y = ty; dt -= d / sp; w.path.shift(); }
    else { w.x += ddx / d * step; w.y += ddy / d * step; dt = 0; }
  }
  return w.path.length === 0;
}

function updateWorkers(dt) {
  const taken = new Set(S.workers.filter(w => w.target && (w.state === 'toWork' || w.state === 'work' || w.state === 'drive')).map(w => w.target));
  for (const w of S.workers) {
    const maxS = maxStamina(w);
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
        const { dist } = officeMap();
        let best = null, bd = Infinity;
        // Lv2以上は、地上・上級勤務（研究所・フォークリフト・トラック）を先に
        if (w.lv >= ADV_LV) {
          const adv = [];
          if (S.lab.built) adv.push(S.lab);
          for (const f of S.forks) adv.push(f);
          for (const t of S.fleet) if (t.phase === 'here') adv.push(t);
          for (const p of adv) { if (taken.has(p)) continue; const d = dist.get(postKey(p)); if (d !== undefined && d < bd) { bd = d; best = p; } }
        }
        if (!best) for (const [k, st] of S.st) {
          if (!isStation(st) || taken.has(st)) continue;
          const d = dist.get(k);
          if (d !== undefined && d < bd) { bd = d; best = st; }
        }
        if (best) {
          w.target = best; taken.add(best);
          w.path = pathFromOffice(postKey(best)) || [];
          w.state = 'toWork';
        }
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
        gainExp(w, dt);
        if (w.stamina <= 0) { w.stamina = 0; goRest(w); }
        break;
      }
      case 'drive': {  // フォークリフト・トラックを運転（乗り物と一緒に動く）
        const v = w.target;
        v.op = w.id;
        if (v.type === 'fork') { w.x = v.x; w.y = YARD_R + 0.5; }
        else { w.x = BED + 0.5; w.y = YARD_R + 0.5; }
        w.stamina = Math.max(0, w.stamina - dt * drainMul());
        gainExp(w, dt);
        if (w.stamina <= 0 && (v.type === 'fork' || v.phase === 'here')) goRest(w);   // トラックは戻ってから降りる
        break;
      }
      case 'toRest':
        if (walk(w, dt)) w.state = 'rest';
        break;
      case 'rest':
        w.stamina = Math.min(maxS, w.stamina + dt * maxS / REST_SEC * restMul());
        if (w.stamina >= maxS) { w.state = 'idle'; w.lastLook = -9; }
        break;
    }
  }
}
function goRest(w) {
  if (w.target && w.target.op === w.id) w.target.op = null;
  w.target = null;
  w.path = pathBetween(wKey(w), OFFICE_K) || [];
  w.state = 'toRest';
}
// 雇う：選ばずに「Lv0（人事力でLv1・Lv2）を増員」
function hire() {
  if (S.workers.length >= OFFICE_LV.cap[S.office.lv]) { say(tx().full); return; }
  const lv = hireLv(), fee = HIRE_FEE(lv);
  if (S.money < fee) { say(tx().noMoney); return; }
  spend(fee, OFFICE_C + 1, YARD_R);
  addWorker(lv);
}
// その レベルの人を1人やめさせる（休んでいる人から）
function fireLevel(lv) {
  const order = ['rest', 'idle', 'toRest', 'toWork', 'work', 'drive'];
  const ws = S.workers.filter(w => w.lv === lv).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  if (ws.length) fireWorker(ws[0].id);
}
function fireWorker(id) {
  const w = S.workers.find(x => x.id === id);
  if (!w) return;
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
  if (b.mat === 'rock' && sk('digLv') < b.layer) { say(tx().needDig(b.layer)); return; }
  const cost = digCost(b);
  if (S.money < cost) { say(tx().noMoney); return; }
  spend(cost, c + 0.5, r + 0.3);
  row(r)[c] = null; S.digVer++;
  S.deepest = Math.max(S.deepest, r);
}

// ---- 設置・レベル ----
let tool = 'none', machSel = 'kiln', dir = 'right', running = true, speedIdx = 0;

function costOf(s) { return s.type === 'machine' ? MACHINES[s.m].cost : s.type === 'drill' ? COST[s.tid || 'drill'] : COST[s.type]; }
// 同じ物がもう置いてあるか（同じなら何もしない）
function sameAs(st) {
  if (!st) return false;
  if (st.type === 'drill') return isDrillTool(tool) && (st.tid || 'drill') === tool;
  if (st.type === 'machine') return tool === 'machine' && st.m === machSel && st.dir === dir;
  return st.type === tool && st.dir === dir;
}
function apply(c, r, dragging) {
  if (!inB(c, r) || tool === 'pan' || tool === 'none') return;
  if (tool === 'dig') { if (!dragging) digAt(c, r); return; }
  const k = key(c, r), s = S.st.get(k);
  if (tool === 'remove') { if (s) removeAt(k); return; }
  if (dragging && tool !== 'conv') return;
  if (tool === 'lab' && S.office.lv < 1) { say(tx().needLab); return; }
  if (!canPlaceAt(c, r)) {
    if (!dragging) say(tool === 'lab' ? tx().labWhere : r < SKY ? tx().underOnly : tx().cantPlace);
    return;
  }
  if (sameAs(s)) return;
  const cost = tool === 'machine' ? MACHINES[machSel].cost : COST[tool];
  if (S.money < cost) { if (!dragging) say(tx().noMoney); return; }
  // 上書き：今ある物を撤去（半額戻る）してから置く。高い物（機械）は確認してから
  if (s && !dragging && costOf(s) >= 100) { askConfirm(tx().overwriteQ, () => { removeAt(k); placeAt(c, r, cost); updateUI(); }); return; }
  if (s) removeAt(k);
  placeAt(c, r, cost);
}
function placeAt(c, r, cost) {
  const k = key(c, r);
  spend(cost, c + 0.5, r + 0.3);
  if (tool === 'lab') { S.lab.built = true; S.lab.c = c; tool = 'none'; say(tx().labBuilt); return; }
  if (isDrillTool(tool) && blk(c, r)) { row(r)[c] = null; S.digVer++; }   // ドリルは土を上書きして置く（中の資源はなくなる）
  if (isDrillTool(tool)) S.st.set(k, { type: 'drill', tid: tool, dir: 'down', lv: 0, t: 0, hit: -99, op: null });
  else if (tool === 'sort') S.st.set(k, { type: 'sort', dir, lv: 0, filter: 'iron', side: 'left' });
  else if (tool === 'machine') S.st.set(k, { type: 'machine', m: machSel, dir, lv: 0, buf: {}, bags: {}, cur: null, prog: 0, op: null });
  else S.st.set(k, { type: tool, dir, lv: 0 });   // conv / tee / cross
}
function removeAt(k) {
  const s = S.st.get(k); if (!s) return;
  const back = Math.floor(costOf(s) / 2);
  S.money += back; pop('+' + back, cOf(k) + 0.5, rOf(k) + 0.3, 'sale');
  S.st.delete(k);
}
function nextCost(t) { const g = grpOf(t), lv = lvOf(t); return lv < lvCap(g) ? LV[g].cost[lv] : null; }
function posOf(t) { if (t === 'truck') return [BED + 1, YARD_R]; if (t.type === 'fork') return [t.x, YARD_R]; const k = findKey(t); return [cOf(k) + 0.5, rOf(k) + 0.3]; }
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
const dashOn = true;   // 下のタブ方式に決定（2026-11-23）。旧メニュー（右下の「メニュー」）の部品は、タブが中で使っている
const camTop = () => -0.3 - hdrH / cp;      // ゲーム画面はヘッダーの下にも広がっている

function metrics() {
  cw = cv.clientWidth; ch = cv.clientHeight;
  hdrH = $('hdr').offsetHeight || 44;
  const base = Math.min(cw / COLS, 46);
  cam.z = clamp(cam.z, Math.min(3, cw / (COLS * base)), 3);   // 縮小は、左右に空きが出ないところまで
  cp = base * cam.z;
  const worldW = COLS * cp;
  if (worldW <= cw) { offX = (cw - worldW) / 2; cam.x = 0; }
  else { offX = 0; cam.x = clamp(cam.x, 0, COLS - cw / cp); }
  const viewRows = ch / cp;
  cam.y = clamp(cam.y, camTop() - 0.7, Math.max(0, S.deepest + 4 - viewRows * 0.5));
}
function resetCam() {
  cam.z = START_ZOOM;
  if (cv.clientWidth) { metrics(); cam.y = camTop(); cam.x = (3 + OFFICE_C + 2) / 2 - cw / cp / 2; metrics(); }   // 最初のドリル(3列目)〜事務所(2マス)の真ん中
}
function zoomAt(sx, sy, f) {
  metrics();
  const wc = (sx - offX) / cp + cam.x, wr = sy / cp + cam.y;
  cam.z *= f; metrics();
  if (COLS * cp > cw) cam.x = wc - (sx - offX) / cp;
  cam.y = wr - sy / cp;
  metrics();
}
function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  metrics(); placePop();
}

// ---- タップメニュー ----
let popTarget = null;   // 設備 or 'truck'
function findKey(s) { for (const [k, v] of S.st) if (v === s) return k; return -1; }
function popCell() {
  if (!popTarget) return null;
  if (popTarget === 'truck') return { c: BED + 0.5, r: YARD_R };
  if (popTarget.type === 'fork') return { c: popTarget.x - 0.5, r: YARD_R };
  if (popTarget.type === 'digcell') return { c: popTarget.c, r: popTarget.r };
  const k = findKey(popTarget);
  return k < 0 ? null : { c: cOf(k), r: rOf(k) };
}
function openPop(t) { closePanels(); popTarget = t; buildPop(); $('pop').hidden = false; placePop(); }
function buildPop() {
  const t = popTarget, T = tx();
  const isTruck = t === 'truck', isFork = t.type === 'fork';
  if (t.type === 'digcell') {   // 土をタップ：「掘削？」
    $('popTitle').textContent = T.dig;
    for (const id of ['popDirs', 'popFilterRow', 'popSideRow', 'popInfo', 'popLevel', 'popLvUp', 'popRemove']) $(id).hidden = true;
    const a = $('popAction'); a.hidden = false; a.innerHTML = '';
    a.append(document.createTextNode(T.digDo + ' ')); const sm = document.createElement('small'); sm.textContent = digCost(blk(t.c, t.r)); a.append(sm);
    a.disabled = S.money < digCost(blk(t.c, t.r));
    return;
  }
  for (const id of ['popInfo', 'popLevel', 'popLvUp']) $(id).hidden = false;
  $('popTitle').textContent = isTruck ? T.truck : isFork ? T.forkName
    : t.type === 'drill' ? T[t.tid || 'drill'] : t.type === 'sort' ? T.sortTitle : t.type === 'tee' || t.type === 'cross' ? T[t.type]
    : t.type === 'machine' ? T.mach[t.m] : T.convDir;
  $('popDirs').hidden = isTruck || isFork;
  $('popFilterRow').hidden = $('popSideRow').hidden = !(t !== 'truck' && t.type === 'sort');
  $('popAction').hidden = !isTruck;
  $('popAction').textContent = T.depart;
  $('popRemove').hidden = isTruck || isFork;
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
    const tr = S.fleet.find(x => x.phase === 'here');
    if (!tr) return T.away;
    const d = opOf(tr);
    return `${T.loaded} ${tr.load}/${valOf('truck')}　${T.worth} ${tr.value}　${T.yard} ${S.yard.length}\n${d ? T.driver(d.lv) : T.truckNoDriver}`;
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
    const rule = def.bag ? T.bagRule
      : def.recipes.map(x => `${T.items[x.in]}×${x.n} → ${T.items[x.out]}`).join(' / ');
    const have = def.bag ? (Object.entries(t.bags || {}).map(([k2, n]) => `${T.items[k2]}×${n}`).join(' ') || '-')
      : Object.entries(t.buf).filter(([, n]) => n > 0).map(([k2, n]) => `${T.items[k2]}×${n}`).join(' ') || '-';
    return `${rule}\n${T.outDir}：${ARROW[t.dir]}　${T.inBuf}：${have}　${t.cur ? T.making : T.waiting}${opLine}`;
  }
  return opLine.trim();
}
function updatePop() {
  if (!popTarget || popTarget.type === 'digcell') return;
  const t = popTarget, T = tx();
  document.querySelectorAll('#pop [data-pdir]').forEach(b => b.classList.toggle('active', t !== 'truck' && b.dataset.pdir === t.dir));
  document.querySelectorAll('#pop [data-pf]').forEach(b => b.classList.toggle('active', b.dataset.pf === t.filter));
  document.querySelectorAll('#pop [data-ps]').forEach(b => b.classList.toggle('active', b.dataset.ps === t.side));
  const info = popInfoText();
  $('popInfo').hidden = !info;
  $('popInfo').innerText = info;
  const g = grpOf(t), lv = lvOf(t), cost = nextCost(t), unit = T.pwUnit[g];
  $('popLevel').textContent = `${T.lv(lv + 1)}　${T.pw[g]} ${unit(LV[g].val[lv])}` + (cost !== null ? ` → ${unit(LV[g].val[lv + 1])}` : '');
  const btn = $('popLvUp'); btn.innerHTML = '';
  if (cost === null) { btn.textContent = T.maxed; btn.disabled = true; }
  else {
    btn.append(document.createTextNode(T.levelUp + ' '));
    const sm = document.createElement('small'); sm.textContent = cost; btn.append(sm);
    btn.disabled = S.money < cost;
  }
  $('popAction').disabled = t === 'truck' && !S.fleet.some(x => x.phase === 'here' && x.load > 0);
}
function closePop() { popTarget = null; $('pop').hidden = true; }
function placePop() {
  if (!popTarget) return;
  const p = popCell();
  if (!p) { closePop(); return; }
  const pop2 = $('pop');
  const sx = offX + (p.c + 0.5 - cam.x) * cp, sy = (p.r - cam.y) * cp;
  let x = sx - pop2.offsetWidth / 2;
  let y = sy + cp + 6;
  if (y + pop2.offsetHeight > window.innerHeight - 8) y = sy - pop2.offsetHeight - 6;
  x = clamp(x, 8, window.innerWidth - pop2.offsetWidth - 8);
  pop2.style.left = x + 'px'; pop2.style.top = clamp(y, hdrH + 4, window.innerHeight - pop2.offsetHeight - 4) + 'px';
}
document.querySelectorAll('#pop [data-pdir]').forEach(b => b.addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck' && popTarget.type !== 'fork' && popTarget.type !== 'digcell') { popTarget.dir = b.dataset.pdir; popTarget.stuck = false; updatePop(); }
}));
document.querySelectorAll('#pop [data-ps]').forEach(b => b.addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck') { popTarget.side = b.dataset.ps; updatePop(); }
}));
$('popLvUp').addEventListener('click', () => { if (popTarget) { levelUp(popTarget); updatePop(); updateUI(); } });
$('popAction').addEventListener('click', () => {
  if (popTarget && popTarget.type === 'digcell') { digAt(popTarget.c, popTarget.r); closePop(); updateUI(); return; }
  departNow(); updatePop();
});
$('popRemove').addEventListener('click', () => {
  if (popTarget && popTarget !== 'truck') { const k = findKey(popTarget); if (k >= 0) removeAt(k); }
  closePop();
});
$('popClose').addEventListener('click', closePop);

// ---- 下のメニュー：設置（ドリル・コンベア・機械）／施設／スキル／強化／工事（掘削・撤去） ----
let menuOpen = false, openCat = null, openGrp = null;
// 設置の中の3つの項目と、その種類（研究したものだけ。レベル1では追加要素は見せない）
const grpList = g => g === 'drill' ? ['drill', ...['fdrill', 'adrill'].filter(t => S.unlock[t])]
  : g === 'belt' ? ['conv', 'sort', ...['tee', 'cross'].filter(t => S.unlock[t])]
  : MACHINE_ORDER.filter(m => S.unlock[m]).map(m => 'm:' + m);
const BUILD_GRPS = ['drill', 'belt', 'machine'];
const toolId = () => (tool === 'machine' ? 'm:' + machSel : tool);
const grpOfTool = () => BUILD_GRPS.find(g => grpList(g).includes(toolId())) || null;
function catOfTool() {
  if (grpOfTool()) return 'build';
  if (tool === 'dig' || tool === 'remove') return 'works';
  if (tool === 'lab') return 'facility';
  return null;
}
function setTool(id) {
  if (id.startsWith('m:')) { machSel = id.slice(2); tool = 'machine'; }
  else tool = id;
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
    else if (id === 'conv' || id === 'sort' || id === 'tee' || id === 'cross') drawBeltCell(0, 0, { type: id, dir: 'right', filter: 'iron', side: 'left' }, 0, true);
    else if (id === 'lab') { ctx.translate(0, -YARD_R * cp); drawLabAt(0, true); }
    else if (id === 'dig') { ctx.fillStyle = groundColor({ mat: 'soil' }, SKY); ctx.fillRect(4, 4, 40, 40); ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, 36); ctx.lineTo(34, 14); ctx.moveTo(26, 12); ctx.lineTo(38, 20); ctx.stroke(); }
    else if (id === 'remove') { ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(36, 36); ctx.moveTo(36, 12); ctx.lineTo(12, 36); ctx.stroke(); }
  } finally { [ctx, cp] = saved; }
  thumbCache.set(key2, c2);
  return c2;
}
function toolBtn(id) {
  const T = tx(), b = document.createElement('button'); b.className = 'si';
  let name, cost;
  if (id.startsWith('m:')) { const m = id.slice(2); name = T.mach[m]; cost = MACHINES[m].cost; }
  else { name = id === 'lab' ? T.labName : T[id]; cost = COST[id]; }
  b.append(thumb(id));
  const lab = document.createElement('span'); lab.className = 'nm'; lab.append(document.createTextNode(name));
  if (cost) { const sm = document.createElement('small'); sm.textContent = cost; lab.append(sm); }
  b.append(lab);
  if (id.startsWith('m:')) { const def = MACHINES[id.slice(2)]; const rc = document.createElement('span'); rc.className = 'rec'; rc.textContent = def.bag ? T.bagRule : def.recipes.map(x => `${T.items[x.in]}×${x.n}→${T.items[x.out]}`).join(' / '); b.append(rc); }
  b.classList.toggle('active', toolId() === id);
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
      const rowD = document.createElement('div'); rowD.className = 'brow';
      const lb = document.createElement('button'); lb.className = 'grp'; lb.textContent = T.grpName[g];
      lb.classList.toggle('active', grpOfTool() === g);
      lb.classList.toggle('open', openGrp === g);
      lb.addEventListener('click', () => { openGrp = openGrp === g ? null : g; renderSub(); updateUI(); });
      rowD.append(lb);
      if (openGrp === g) { const list = document.createElement('div'); list.className = 'types'; for (const id of grpList(g)) list.append(toolBtn(id)); rowD.append(list); }
      box.append(rowD);
    }
  } else {
    const list = document.createElement('div'); list.className = 'types';
    const ids = openCat === 'works' ? ['dig', 'remove'] : ['lab'];
    for (const id of ids) list.append(toolBtn(id));
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
const PANELS = ['powerPanel', 'skillPanel', 'office', 'help', 'settings', 'admin', 'tune'];   // 情報・地図は別（開いたまま遊べる）
function closePanels() { PANELS.forEach(x => { $(x).hidden = true; }); }
function togglePanel(id) {
  const show = $(id).hidden;
  closePanels(); closePop();
  $(id).hidden = !show;
  if (show) renderPanel(id);
  updateUI();
}
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
  if (cost !== undefined) { const sm = document.createElement('small'); sm.textContent = cost; b.append(sm); b.disabled = S.money < cost; }
  b.addEventListener('click', onClick);
  return b;
}
function renderPanel(id) {
  const T = tx();
  if (id === 'powerPanel') {
    const box = $('powerItems'); box.innerHTML = '';
    // フォークリフト購入（台数の上限は事務所のレベル）
    const fn = S.forks.length, fm = forkMax();
    let fb;
    if (fn >= fm) { fb = document.createElement('button'); fb.textContent = T.maxed; fb.disabled = true; }
    else fb = costBtn(T.buyFork, FORK_BUY(fn + 1), () => { buyFork(); renderPanel('powerPanel'); updateUI(); });
    box.append(rowEl(T.forkName, T.forkMax(fn, fm), fb));
    for (const g of ['drill', 'belt', 'machine', 'truck']) {
      if (g !== 'truck' && !S.unlock.batch) continue;
      const ts = groupTargets(g), total = groupCost(g);
      const name = g === 'truck' ? `${T.grp.truck}　${T.lv(S.truck.lv + 1)}` : T.allUp(T.grp[g], ts.length);
      const spec = g === 'truck' ? `${T.pw.truck} ${T.pwUnit.truck(valOf('truck'))}` : (ts.length ? '' : T.none);
      let btn;
      if (!ts.length) { btn = document.createElement('button'); btn.textContent = g === 'truck' ? T.maxed : '-'; btn.disabled = true; }
      else btn = costBtn(T.levelUp, total, () => { levelUpAll(g); renderPanel('powerPanel'); updateUI(); });
      box.append(rowEl(name, spec, btn));
    }
  } else if (id === 'office') {
    const box = $('officeBody'); box.innerHTML = '';
    const pay = Math.round(S.workers.reduce((a, w) => a + wageOf(w), 0) * (sk('black') ? 0.8 : 1) * TUNE.wage);
    const ol = S.office.lv, cap = OFFICE_LV.cap[ol];
    const sum = document.createElement('div'); sum.className = 'sub';
    sum.textContent = `${T.workers} ${S.workers.length}/${cap}${T.unitP}　${T.payroll} ${pay}`;
    box.append(sum);
    // 事務所のレベル（定員・休憩の速さ・フォークリフトの台数。レベル2で研究所）
    let olBtn;
    if (ol >= OFFICE_LV.cost.length) { olBtn = document.createElement('button'); olBtn.textContent = T.maxed; olBtn.disabled = true; }
    else olBtn = costBtn(T.levelUp, OFFICE_LV.cost[ol], () => { officeUp(); renderPanel('office'); updateUI(); });
    const nx = ol < OFFICE_LV.cost.length ? ` → ${T.capP(OFFICE_LV.cap[ol + 1])}・${T.forksMax(OFFICE_LV.forks[ol + 1])}` : '';
    box.append(rowEl(`${T.officeLv}　${T.lv(ol + 1)}`, `${T.capP(cap)}・${T.forksMax(OFFICE_LV.forks[ol])}・${T.restSp} ×${OFFICE_LV.rest[ol]}${nx}`, olBtn));
    // 作業員：レベルごとの人数
    const h1 = document.createElement('div'); h1.className = 'secT'; h1.textContent = T.workers; box.append(h1);
    const note = document.createElement('div'); note.className = 'sub'; note.textContent = S.lab.built ? T.advNote : T.advNote0; box.append(note);
    if (!S.workers.length) { const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.nobody; box.append(n); }
    const lvs = [...new Set(S.workers.map(w => w.lv))].sort((a, b) => a - b);
    for (const lv of lvs) {
      const ws = S.workers.filter(w => w.lv === lv);
      const cnt = st => ws.filter(w => st.includes(w.state)).length;
      const el = rowEl(T.wCount(lv, ws.length), T.wBreak(cnt(['work', 'drive']), cnt(['toWork', 'toRest', 'idle']), cnt(['rest'])),
        costBtn(T.fireOne, undefined, () => { fireLevel(lv); renderPanel('office'); }));
      const bar = document.createElement('div'); bar.className = 'bar';
      const avg = ws.reduce((a, w) => a + w.stamina / maxStamina(w), 0) / ws.length;
      const fill = document.createElement('i'); fill.style.width = (100 * avg) + '%'; bar.append(fill);
      el.querySelector('.spec').append(bar);
      box.append(el);
    }
    const hl = hireLv();
    box.append(rowEl(T.hireLv(hl), `${T.wage}${Math.round((10 + 6 * hl) * TUNE.wage)}${T.perMonth}`,
      costBtn(T.hire, HIRE_FEE(hl), () => { hire(); renderPanel('office'); updateUI(); })));
  } else if (id === 'skillPanel') {
    const box = $('skillBody'); box.innerHTML = '';
    if (!S.lab.built) { const n = document.createElement('div'); n.className = 'sub'; n.textContent = T.needLab; box.append(n); return; }
    const rw = opOf(S.lab);
    const info = document.createElement('div'); info.className = 'sub'; info.textContent = `${T.resInfo}\n${rw ? T.researcher(rw.lv) : T.noResearcher}`; info.style.whiteSpace = 'pre-line'; box.append(info);
    if (S.research) {
      const r = S.research;
      const el = document.createElement('div'); el.className = 'sub lvline';
      el.textContent = `${T.researching}：${resDef(r.id).name}（${Math.round(100 * r.t / r.total)}%）`;
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = (100 * r.t / r.total) + '%'; bar.append(fill);
      box.append(el, bar);
    }
    const section = (title, ids) => {
      const list = ids.filter(id => !resDef(id).done || id.startsWith('sk:'));
      if (!list.length) return;
      const h = document.createElement('div'); h.className = 'secT'; h.textContent = title; box.append(h);
      for (const id of list) {
        const d = resDef(id);
        const title2 = d.max > 50 ? `${d.name}　Lv${d.lv}` : d.max > 1 ? `${d.name}　${d.lv}/${d.max}` : d.name;
        let btn;
        if (d.done) { btn = document.createElement('button'); btn.textContent = T.got; btn.disabled = true; }
        else { btn = costBtn(`${T.startRes}（${d.months}${T.months}）`, d.cost, () => { startResearch(id); renderPanel('skillPanel'); updateUI(); }); if (S.research) btn.disabled = true; }
        box.append(rowEl(title2, d.desc, btn));
      }
    };
    section(T.resTool, Object.keys(RESEARCH_TOOL).map(t => 't:' + t));
    section(T.resMach, Object.keys(RESEARCH_MACH).map(m => 'm:' + m));
    section(T.resBatch, ['batch']);
    section(T.resSkill, SKILL_ORDER.map(x => 'sk:' + x));
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
    add(A.maxLv, () => { for (const s of S.st.values()) s.lv = lvCap(grpOf(s)); S.truck.lv = lvCap('truck'); });
    add(A.ace, () => { addWorker(5); });
    add(A.month, () => { S.time = (Math.floor(S.time / TUNE.month) + 1) * TUNE.month; updateMonth(); });
    add(A.fast, () => { S.adminFast = true; speedIdx = speeds().length - 1; });
    add(A.clear, () => { S.reveal = !S.reveal; });
    add(A.allSk, () => { for (const sid of SKILL_ORDER) while (sk(sid) < Math.min(SKILLS[sid].max, 10)) gainSkill(sid); for (const m of MACHINE_ORDER) S.unlock[m] = true; S.unlock.batch = true; if (!S.lab.built) { S.office.lv = Math.max(1, S.office.lv); const c = [...Array(COLS).keys()].find(surfaceFree); S.lab.built = true; S.lab.c = c; } });
    add(A.finRes, () => { if (S.research) S.research.t = S.research.total; });
    add(A.tune, () => { togglePanel('tune'); });
  } else if (id === 'help') {
    // 2ペイン：左に項目、右に説明
    const nav = $('helpNav'), body = $('helpBody');
    nav.innerHTML = '';
    const fill = i => {
      body.innerHTML = '';
      const h = document.createElement('h3'); h.textContent = topics[i][0]; body.append(h);
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
    const topics = T.helpTopics.filter((tp, i) => i !== 5 || S.office.lv >= 1);   // 事務所と研究所の話はレベル2から
    nav.append(mark);
    topics.forEach(([t], i) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', () => show(i)); nav.append(b); });
    // 高さは、いちばん長い説明に合わせて最初に確保する（項目を替えても窓の大きさが変わらない）
    body.style.minHeight = '';
    let tall = 0;
    for (let i = 0; i < topics.length; i++) { fill(i); tall = Math.max(tall, body.offsetHeight); }
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
    const h = document.createElement('div'); h.className = 'secT'; h.textContent = T.saveT; box.append(h);
    for (let n = 1; n <= saveSlots(); n++) {
      const two = document.createElement('span'); two.className = 'btn2';
      const sv = document.createElement('button'); sv.textContent = T.save; sv.addEventListener('click', () => { saveTo(n); renderPanel('settings'); });
      const ld = document.createElement('button'); ld.textContent = T.load; ld.disabled = !slotInfo(n); ld.addEventListener('click', () => loadFrom(n));
      two.append(sv, ld);
      box.append(rowEl(T.slot(n), slotInfo(n) || T.empty, two));
    }
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
function renderInfo() {
  const T = tx(), R = T.infoRows, st = S.stats;
  const last = st.months[st.months.length - 1];
  const sts = [...S.st.values()];
  const num = v => typeof v === 'number' ? v.toLocaleString() : v;
  const net = v => ({ v: typeof v === 'number' && v > 0 ? '+' + num(v) : num(v), cls: typeof v === 'number' ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : '' });
  const mn = net(st.cur.sale - st.cur.cost), ln = net(last ? last.sale - last.cost : '-');
  // まとまりごと：[見出し, [[名前, 値, 強調?, 色], ...]]
  const groups = [
    [T.infoGrp[0], [
      [R.money, num(S.money), true],
      [R.mSale, num(st.cur.sale)], [R.mCost, num(st.cur.cost)],
      [R.mNet, mn.v, false, mn.cls], [R.lNet, ln.v, false, ln.cls],
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
  for (const [title, rows] of groups) {
    const g = document.createElement('div'); g.className = 'igrp';
    const hd = document.createElement('div'); hd.className = 'ihead'; hd.textContent = title;
    const d = document.createElement('div'); d.className = 'data';
    for (const [a, b, big, cls] of rows) {
      const x = document.createElement('span'); x.textContent = a;
      const y = document.createElement(big ? 'b' : 'span'); y.textContent = b; if (cls) y.className = cls;
      d.append(x, y);
    }
    g.append(hd, d); box.append(g);
  }
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
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals), pad = 6;
  const Y = v => h - pad - (v - lo) / (hi - lo) * (h - pad * 2);
  g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
  g.strokeStyle = THEME.accent; g.lineWidth = 1.5; g.beginPath();
  vals.forEach((v, i) => { const x = i / (vals.length - 1) * (w - 4) + 2; if (i) g.lineTo(x, Y(v)); else g.moveTo(x, Y(v)); });
  g.stroke();
  g.fillStyle = THEME.graphText; g.font = '10px sans-serif'; g.textBaseline = 'top'; g.fillText(hi, 4, 2); g.textBaseline = 'bottom'; g.fillText(lo, 4, h - 2);
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
  g.fillStyle = THEME.graphText; g.font = '10px sans-serif'; g.textBaseline = 'top'; g.fillText('+' + m, 4, 2); g.textBaseline = 'bottom'; g.fillText('-' + m, 4, h - 2);
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
  g.fillStyle = '#3a6ea5'; g.fillRect(BED * s, YARD_R * s, 2 * s, s);                // トラック
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
function askConfirm(msg, onYes) { $('confirmMsg').textContent = msg; confirmYes = onYes; $('confirm').hidden = false; }
$('confirmNo').addEventListener('click', () => { $('confirm').hidden = true; confirmYes = null; });
$('confirmYes').addEventListener('click', () => { $('confirm').hidden = true; const f = confirmYes; confirmYes = null; if (f) f(); });

// ---- 描画 ----
// 画面の色（デザイン）。ここを変えるだけで見た目が変わる。ゲームの仕組みとは分けてある
const THEME = {
  // 明るいグレーが基本。色を付けるのは「資源（中身）・ドリル・お金・選択」だけに絞る
  bg: '#e6e6e3', skyTop: '#6fa9d6', skyLow: '#b9d7ec',   // 空は青（原色より少しだけ彩度を落とす）
  dug: '#8fa8ba', grass: '#5f8a44', paved: '#8d8f93',     // 穴＝空より少し暗い水色
  grassMid: '#7aa35a', grassDark: '#5f8a44', grassLight: '#a3c47e',   // 地表の草（ドット絵）
  soil: [[196, 190, 180], [140, 134, 125]], stone: [[168, 169, 170], [112, 113, 115]], rock: '#5b5a60', rockLine: 'rgba(255,255,255,.3)',
  gauge: '#2b2b2e', gaugeBg: 'rgba(255,255,255,.55)', depth: 'rgba(0,0,0,.45)',
  conv: { rail: '#3d3e43', railHi: '#a2a4aa', belt: '#5c5e63', slat: '#8a8c92' },   // コンベアのドット絵：外の枠・枠の光・ベルト・流れる板
  sortLine: '#e0782f', arrow: 'rgba(255,255,255,.7)',
  machBg: '#d6d6d3', machLine: '#6d6d70', machText: '#2b2b2e', machOut: '#2b2b2e', machProg: '#e0782f',
  drill: '#e0782f', drillStuck: '#9a9a9a', bit: '#4a4a4d',
  level: '#e0782f', levelLine: 'rgba(0,0,0,.35)', zBg: 'rgba(0,0,0,.6)', zText: '#ffffff',
  office: { wall: '#f6f6f4', wall2: '#dcdcd9', roof: '#4a4a4d', win: '#9aa3a8', door: '#4a4a4d', text: '#2b2b2e' },
  lab: { wall: '#f6f6f4', roof: '#4a4a4d', win: '#9aa3a8', line: '#8d8f93' },
  labOn: '#e0782f', labOff: '#9a9a9a',
  truck: { body: '#55565b', cab: '#f6f6f4', win: '#9aa3a8', load: '#b9b3a6', tire: '#2b2b2e' },
  fork: { body: '#e0a43a', mast: '#4a4a4d', frame: '#2b2b2e', tire: '#2b2b2e' },
  worker: { head: [224, 120, 47], body: '#3a3a3d' },
  sel: '#2b2b2e', hover: 'rgba(0,0,0,.6)', hatch: 'rgba(0,0,0,.38)', hatchHi: 'rgba(255,255,255,.35)', hatchFill: 'rgba(0,0,0,.06)',
  sale: '#2f7d4a', cost: '#c0392b', popLine: 'rgba(255,255,255,.9)',
  okFill: 'rgba(70, 145, 235, .26)',   // 置ける所の薄い青
  accent: '#e0782f', graphText: '#77767a', good: '#4f8a5b', bad: '#c0392b', mapView: '#2b2b2e',
};
function groundColor(b, r) {
  if (b.mat === 'rock') return THEME.rock;
  const t = clamp((r - SKY) / 40, 0, 1);
  const [a, z] = b.mat === 'stone' ? THEME.stone : THEME.soil;
  return `rgb(${a.map((v, i) => Math.round(v + (z[i] - v) * t)).join(',')})`;
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = THEME.bg; ctx.fillRect(0, 0, cw, ch);
  const cell = cp;
  const r0 = Math.floor(cam.y) - 1, r1 = Math.ceil(cam.y + ch / cp) + 1;
  ctx.save();
  ctx.translate(offX - cam.x * cp, -cam.y * cp);
  const W = COLS * cell;
  const sky = ctx.createLinearGradient(0, (SKY - 6) * cell, 0, SKY * cell);   // 空（落ち着いたグラデーション）
  sky.addColorStop(0, THEME.skyTop); sky.addColorStop(1, THEME.skyLow);
  ctx.fillStyle = sky; ctx.fillRect(0, (r0 - 2) * cell, W, (SKY - r0 + 2) * cell);
  const g0 = Math.max(SKY, r0);
  ctx.fillStyle = THEME.dug; ctx.fillRect(0, g0 * cell, W, (r1 - g0 + 1) * cell);

  const digSet = tool === 'dig' ? diggable() : null;
  for (let r = g0; r <= r1; r++) {
    const a = row(r);
    for (let c = 0; c < COLS; c++) {
      const b = a[c]; if (!b) continue;
      const x = c * cell, y = r * cell;
      const v = (c * 7 + r * 13) % 4;   // 模様の種類（隣と同じにならないよう散らす）
      ctx.imageSmoothingEnabled = false;
      if (b.mat === 'rock') ctx.drawImage(rockTex(v), x + 1, y + 1, cell - 2, cell - 2);
      else {
        ctx.fillStyle = groundColor(b, r); ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.drawImage(groundTex(b.mat, v), x + 1, y + 1, cell - 2, cell - 2);
      }
      if (r === SKY && c < YARD_C) ctx.drawImage(grassTex(v), x, y, cell, cell);   // 地表の1段目は草
      if (S.reveal && b.ore) { ctx.fillStyle = ITEMS[b.ore].c[0]; ctx.fillRect(x + cell * 0.4, y + cell * 0.4, cell * 0.2, cell * 0.2); } // 管理：中身を見る
      if (b.left < b.yieldN || b.p > 0) {
        ctx.fillStyle = THEME.gaugeBg; ctx.fillRect(x + 3, y + cell - 6, cell - 6, 3);
        ctx.fillStyle = THEME.gauge; ctx.fillRect(x + 3, y + cell - 6, (cell - 6) * (b.left - b.p / b.h) / b.yieldN, 3);
      }
      if (digSet && digSet.has(key(c, r)) && !(b.mat === 'rock' && sk('digLv') < b.layer)) { ctx.fillStyle = THEME.okFill; ctx.fillRect(x, y, cell, cell); }   // 掘れる所だけ薄い青
    }
    drawRockLabel(r, a);
  }
  ctx.fillStyle = THEME.grass; ctx.fillRect(0, SKY * cell - 1, YARD_C * cell, 1);
  ctx.fillStyle = THEME.depth; ctx.font = `${Math.max(9, Math.round(cell * 0.3))}px sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let r = g0; r <= r1; r++) if (r > SKY && (r - SKY) % 5 === 0) ctx.fillText(tx().depthM(r - SKY), 2, r * cell + 2);

  for (const [k, s] of S.st) {
    const c = cOf(k), r = rOf(k);
    if (r < r0 || r > r1 || s.type === 'drill') continue;
    const x = c * cell, y = r * cell;
    if (s.type === 'machine') { drawMachine(x, y, s); drawLevel(x, y, s.lv); continue; }
    drawBeltCell(x, y, s, valOf(s) * TUNE.belt, false, c, r);
    drawLevel(x, y, s.lv);
  }

  drawOffice();
  drawLab();
  drawYard();
  drawDock();
  drawTruck();

  for (const it of S.items) {
    if (it.y < r0 || it.y > r1 + 1) continue;
    drawItemShape(it, it.x * cell, it.y * cell, 1);
  }

  for (const [k, s] of S.st) {
    if (s.type !== 'drill') continue;
    const c = cOf(k), r = rOf(k);
    if (r < r0 || r > r1) continue;
    const shaking = S.time - s.hit < 0.12;
    const j = shaking ? (Math.random() < 0.5 ? -1 : 1) : 0;
    drawDrill(c * cell + j, r * cell, s);
    drawLevel(c * cell, r * cell, s.lv);
  }
  // 作業員がいない持ち場には「z」の印（とても遅い）
  for (const [k, s] of S.st) {
    if (!isStation(s) || workFactor(s) > TUNE.unmanned) continue;
    const c = cOf(k), r = rOf(k);
    if (r < r0 || r > r1) continue;
    ctx.fillStyle = THEME.zBg; ctx.beginPath(); ctx.arc(c * cell + cell * 0.84, r * cell + cell * 0.16, cell * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = THEME.zText; ctx.font = `bold ${Math.round(cell * 0.18)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('z', c * cell + cell * 0.84, r * cell + cell * 0.17);
  }
  // 作業員（i の形）
  for (const w of S.workers) {
    if (w.state === 'idle' || w.state === 'rest') continue;      // 事務所の中
    if (w.target && w.target.type === 'lab' && w.state === 'work') continue;   // 研究所の中
    if (w.state === 'drive') continue;                            // 乗り物の絵の中に描く
    if (w.state === 'work' && w.target && isStation(w.target)) {   // ドリル・機械で作業中は、そのマスの右上に頭だけ
      const k = stationKey(w.target);
      if (k >= 0 && rOf(k) >= r0 && rOf(k) <= r1) drawWorkerHead(cOf(k) * cell, rOf(k) * cell, S.st.get(k));
      continue;
    }
    if (w.y < r0 || w.y > r1 + 1) continue;
    drawWorker(w.x * cell, w.y * cell, w);
  }

  // 設置中：置けないマスに斜線、カーソルの所に置く物の半透明の見本
  if (isBuildTool()) {
    // 置ける所（空いているマス）だけ薄い青で塗る
    ctx.fillStyle = THEME.okFill;
    for (let r = Math.max(0, r0); r <= r1; r++) for (let c = 0; c < COLS; c++) {
      if (canPlaceAt(c, r) && !S.st.has(key(c, r))) ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
    }
    if (hover && inB(hover.c, hover.r) && canPlaceAt(hover.c, hover.r)) {
      ctx.save(); ctx.globalAlpha = 0.55;
      drawGhost(hover.c * cell, hover.r * cell);
      ctx.restore();
    }
  }
  const p = popCell();
  if (p) {
    const isT = popTarget === 'truck';
    ctx.strokeStyle = THEME.sel; ctx.lineWidth = 2;
    ctx.strokeRect((isT ? BED : p.c) * cell + 1, p.r * cell + 1, cell * (isT ? 2 : 1) - 2, cell - 2);
  }
  if (hover && inB(hover.c, hover.r) && tool !== 'pan' && tool !== 'none') {
    ctx.strokeStyle = THEME.hover; ctx.lineWidth = 2;
    ctx.strokeRect(hover.c * cell + 1, hover.r * cell + 1, cell - 2, cell - 2);
    if (tool === 'dig' && digSet && digSet.has(key(hover.c, hover.r))) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(cell * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(digCost(blk(hover.c, hover.r)), hover.c * cell + cell / 2, hover.r * cell + cell / 2);
    }
  }
  const now = performance.now();
  S.pops = S.pops.filter(q => now - q.t0 < 1800);
  for (const q of S.pops) {
    const a = 1 - (now - q.t0) / 1800;
    ctx.globalAlpha = Math.min(1, a * 1.5);
    ctx.fillStyle = q.kind === 'cost' ? THEME.cost : THEME.sale;
    ctx.strokeStyle = THEME.popLine; ctx.lineWidth = 3;
    ctx.font = `bold ${Math.round(cell * (q.kind === 'sale' ? 0.55 : 0.42))}px sans-serif`;
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
    if (mat === 'stone') {   // 小石：上に光、下に影
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(rnd() * 12) + 1, y = Math.floor(rnd() * 12) + 1, w = 2 + Math.floor(rnd() * 2);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + 1, w, 2);
        g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x, y, w, 1);
      }
    }
    for (let i = 0; i < 20; i++) {   // 土の粒
      const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16), dark = rnd() < 0.62;
      g.fillStyle = dark ? 'rgba(70,45,20,.16)' : 'rgba(255,255,255,.18)';
      g.fillRect(x, y, rnd() < 0.4 ? 2 : 1, 1);
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
function drawRockLabel(r, a) {
  let best = -1;
  for (let c = 0; c < COLS; c++) if (a[c] && a[c].mat === 'rock' && (best < 0 || Math.abs(c - (COLS - 1) / 2) < Math.abs(best - (COLS - 1) / 2))) best = c;
  if (best < 0) return;
  const b = a[best], cell = cp, x = best * cell + cell / 2, y = r * cell + cell / 2;
  ctx.font = `bold ${Math.round(cell * 0.32)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText('Lv' + b.layer, x, y);
  ctx.fillStyle = sk('digLv') >= b.layer ? '#ffffff' : '#ffb09f';   // 掘れない間は赤っぽく
  ctx.fillText('Lv' + b.layer, x, y);
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
function drawBeltCell(x, y, s, speed, ghost, c, r) {
  const cell = cp;
  const side = ghost ? null : curveSide(c, r, s);
  if (side) {
    const f = Math.floor(S.time * speed * 16) % 4;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(x + cell / 2, y + cell / 2); ctx.rotate(CONV_ROT[s.dir]); if (side === 'left') ctx.scale(-1, 1);
    ctx.drawImage(CURVE_FRAMES[f], -cell / 2, -cell / 2, cell, cell);
    ctx.restore();
  } else drawConvSprite(x, y, s.dir, speed);
  if (s.type === 'cross') { ctx.save(); ctx.globalAlpha = 0.7; drawConvSprite(x, y, CW[s.dir], speed); ctx.restore(); }
  if (s.type === 'sort') { ctx.strokeStyle = THEME.sortLine; ctx.lineWidth = Math.max(1.5, cell * 0.05); ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3); }
  if (s.type === 'tee') { drawChevron(x, y, CCW[s.dir], THEME.arrow); drawChevron(x, y, CW[s.dir], THEME.arrow); }
  else if (!side) drawChevron(x, y, s.dir, THEME.arrow);
  if (s.type === 'sort') {
    const sd = s.side === 'left' ? CCW[s.dir] : CW[s.dir], [sx, sy] = DIRS[sd];
    drawItemShape({ k: s.filter }, x + cell / 2 + sx * cell * 0.3, y + cell / 2 + sy * cell * 0.3, 0.8);
  }
}
function drawConvSprite(x, y, d, speed) {
  const cell = cp, f = Math.floor(S.time * speed * 16) % 4;   // 速さに合わせてコマを進める（1コマ＝1ドット）
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x + cell / 2, y + cell / 2); ctx.rotate(CONV_ROT[d]);
  ctx.drawImage(CONV_FRAMES[f], -cell / 2, -cell / 2, cell, cell);
  ctx.restore();
}
// 向きの小さな印（止まっている時も向きが分かるように、控えめに）
function drawChevron(x, y, d, color) {
  const cell = cp;
  ctx.save(); ctx.translate(x + cell / 2, y + cell / 2); ctx.rotate(CONV_ROT[d]);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, cell * 0.05); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-cell * 0.12, cell * 0.05); ctx.lineTo(0, -cell * 0.08); ctx.lineTo(cell * 0.12, cell * 0.05); ctx.stroke();
  ctx.restore();
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
function drawLevel(x, y, lv) {
  if (!lv) return;
  const cell = cp, r = Math.max(1.5, cell * 0.055);
  ctx.fillStyle = THEME.level; ctx.strokeStyle = THEME.levelLine; ctx.lineWidth = 1;
  for (let i = 0; i < Math.min(lv, 8); i++) {
    ctx.beginPath(); ctx.arc(x + cell * 0.14 + i * r * 2.6, y + cell * 0.14, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
// 作業員：「i」の形（丸い頭＋縦の体）。疲れると頭の色がくすむ
// 作業員のドット絵（参考画像「New Piskel」：8×8・2コマ・0.17秒ごと）。a=ヘルメット b=肌 c=服 d=くつ
const WORKER_PIX = [
  ['...aa...', '...bb...', '....c...', '..bcccb.', '....c...', '....c...', '...c.c..', '..d...d.'],
  ['...aa...', '...bb...', '....c...', '...ccc..', '...ccc..', '...bcb..', '....c...', '...dd...'],
];
const WORKER_COL = { a: '#efff62', b: '#c9b57a', c: '#7ac5c9', d: '#000000' };
const WORKER_FR = WORKER_PIX.map(rows => {
  const c2 = document.createElement('canvas'); c2.width = c2.height = 8;
  const g = c2.getContext('2d');
  rows.forEach((rw, y) => [...rw].forEach((ch, x) => { if (WORKER_COL[ch]) { g.fillStyle = WORKER_COL[ch]; g.fillRect(x, y, 1, 1); } }));
  return c2;
});
function drawWorkerSprite(cx, footY, size, frame, alpha) {
  ctx.save(); ctx.imageSmoothingEnabled = false; if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(WORKER_FR[frame], Math.round(cx - size / 2), Math.round(footY - size), size, size);
  ctx.restore();
}
// 作業中の印：作業員の頭（ヘルメットと顔）だけを、マスの中の右上に小さく
function drawWorkerHead(x, y, st) {
  const s = Math.max(4, Math.round(cp * 0.14));
  // 基本はマスの右上。ドリルは刃の反対側（本体側）に来るよう、向きに合わせて回す（下向き＝右上）
  let lx = 0.42 - s / cp / 2, ly = -0.42 + s / cp / 2;          // マス中心からの位置（マス幅=1）
  if (st && st.type === 'drill') {
    const a = ANGLE[st.dir] || 0, c = Math.cos(a), n = Math.sin(a);
    [lx, ly] = [lx * c - ly * n, lx * n + ly * c];
  }
  const hx = Math.round(x + cp * (0.5 + lx) - s / 2), hy = Math.round(y + cp * (0.5 + ly) - s / 2);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(WORKER_FR[1], 3, 0, 2, 2, hx, hy, s, s);   // 8×8の絵のうち、頭の2×2ドット
  ctx.restore();
}
function drawWorker(x, y, w) {   // x,y＝マスの中心（画面座標）。小さく表示
  const moving = w.path && w.path.length, working = w.state === 'work';
  const f = moving || working ? Math.floor(S.time / 0.17) % 2 : 1;
  const tired = w.stamina / maxStamina(w) < 0.25;
  drawWorkerSprite(x, y + cp * 0.48, cp * 0.42, f, tired ? 0.6 : 1);
}
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
    else if (sh === 'gem') on = Math.abs(X - 8) * 1.05 + Math.abs(Y - 8) * (Y < 6.5 ? 2.2 : 0.95) <= 7 && Y > 2.5;
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
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  if (k === 'bag' && of) { g.fillStyle = ITEMS[of].c[0]; g.fillRect(6, 9, 4, 3); g.fillStyle = ITEMS[of].c[1]; g.fillRect(6, 12, 4, 1); }   // 中身の色
  if (k === 'bag') { g.fillStyle = line; g.fillRect(5, 5, 6, 1); }   // 袋のひも
  SPR_CACHE.set(id, c2);
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
function drawMachine(x, y, m) {
  const cell = cp;
  ctx.fillStyle = THEME.machBg; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
  ctx.strokeStyle = THEME.machLine; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
  glyph(tx().glyph[m.m], x, y + cell * 0.02, THEME.machText, 0.38);
  const [dx, dy] = DIRS[m.dir];
  const cx = x + cell / 2 + dx * cell * 0.38, cy = y + cell / 2 + dy * cell * 0.38;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = THEME.machOut; ctx.beginPath(); ctx.moveTo(cell * 0.08, 0); ctx.lineTo(-cell * 0.05, -cell * 0.08); ctx.lineTo(-cell * 0.05, cell * 0.08); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (m.cur) {
    const def = MACHINES[m.m];
    ctx.fillStyle = THEME.gaugeBg; ctx.fillRect(x + 4, y + cell - 7, cell - 8, 3);
    ctx.fillStyle = THEME.machProg; ctx.fillRect(x + 4, y + cell - 7, (cell - 8) * m.prog / def.time, 3);
  }
}
// 置く物の見本（設置中のカーソル位置）
function drawGhost(x, y) {
  if (isDrillTool(tool)) { drawDrill(x, y, { dir: 'down', tid: tool }); return; }
  if (tool === 'lab') { drawLabAt(x / cp, true); return; }
  if (tool === 'machine') { drawMachine(x, y, { m: machSel, dir, cur: null }); return; }
  drawBeltCell(x, y, { type: tool, dir, filter: 'iron', side: 'left' }, 0, true);
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
function drawDrill(x, y, s) {
  const cell = cp, fr = s.stuck ? DRILL_FR.stuck : DRILL_FR.run;
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
function drawOffice() {
  const cell = cp, T2 = THEME.office, lv = S.office.lv;
  const x = OFFICE_C * cell, base = (YARD_R + 1) * cell;
  const floors = [1, 1.6, 2, 2.6, 3.2][lv];                   // 高さ（マス）
  const w = cell * 1.92, x0 = x + cell * 0.04;   // いつも2マス幅
  const h = cell * 0.72 * floors, top = base - h;
  ctx.fillStyle = T2.wall; ctx.fillRect(x0, top, w, h);
  ctx.fillStyle = T2.wall2; ctx.fillRect(x0 + w * 0.82, top, w * 0.18, h);       // 影
  ctx.fillStyle = T2.roof; ctx.fillRect(x0 - cell * 0.04, top - cell * 0.07, w + cell * 0.08, cell * 0.09);   // 屋根（平ら）
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
  const inside = S.workers.filter(wk => wk.state === 'idle' || wk.state === 'rest').length;
  if (inside) {
    ctx.fillStyle = T2.text; ctx.font = `600 ${Math.round(cell * 0.22)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('i×' + inside, x0 + w * 0.08, base - cell * 0.04);
  }
}
// 研究所：1マスの小さな建物（地上のどこでも）
function drawLab() { if (S.lab.built) drawLabAt(S.lab.c, false); }
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
  const r = opOf(S.lab);
  if (r || S.research) {   // 研究中の小さな印（点滅しない）
    ctx.fillStyle = r ? THEME.labOn : THEME.labOff;
    ctx.beginPath(); ctx.arc(x0 + w * 0.2, base - cell * 0.16, cell * 0.055, 0, Math.PI * 2); ctx.fill();
  }
}
function drawYard() {
  const cell = cp, x0 = YARD_C * cell, y = YARD_R * cell, n = S.yard.length;
  ctx.fillStyle = THEME.paved; ctx.fillRect(x0, SKY * cell - 3, (COLS - YARD_C) * cell, 3);
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 2, y + 2, cell * 2 - 4, cell - 4); ctx.setLineDash([]);
  const h = Math.min(sk('yardPlus') ? 1.5 : 0.75, 0.12 + n * 0.012);   // ヤード拡張で高く積める
  const show = Math.min(n, sk('yardPlus') ? 150 : 60);
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
// 荷おろし場：地上に出た資源の小さな山（フォークリフト待ち）
function drawDock() {
  const cell = cp, y = YARD_R * cell;
  for (const c of Object.keys(S.dock)) {
    const pile = S.dock[c]; if (!pile.length) continue;
    const x0 = +c * cell, h = Math.min(0.5, 0.08 + pile.length * 0.02);
    for (let i = 0; i < Math.min(pile.length, 25); i++) {
      const it = pile[i];
      drawItemShape(it, x0 + cell * (0.25 + it.rx * 0.5), y + cell * (0.86 - it.ry * h), 0.7);
    }
    if (pile.length > 3) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
      ctx.font = `bold ${Math.round(cell * 0.24)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const t = '×' + pile.length, ty = y + cell * (0.8 - h);
      ctx.strokeText(t, x0 + cell / 2, ty); ctx.fillText(t, x0 + cell / 2, ty);
    }
  }
  for (const f of S.forks) drawFork(f);
}
// フォークリフト：小さく、走るとちょこちょこ揺れる
function drawFork(f) {
  const cell = cp, s = cell * 0.42;
  const bob = f.moving ? Math.abs(Math.sin(S.time * 22)) * cell * 0.025 : 0;
  const x = f.x * cell, yb = (YARD_R + 1) * cell - cell * 0.06 - bob;   // 車輪の下
  const dir = f.face || 1;
  ctx.save(); ctx.translate(x, yb); ctx.scale(dir, 1);
  ctx.fillStyle = THEME.fork.body; ctx.fillRect(-s * 0.55, -s * 0.55, s * 0.8, s * 0.38);           // 車体
  ctx.strokeStyle = THEME.fork.frame; ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.strokeRect(-s * 0.45, -s * 0.95, s * 0.45, s * 0.42);                                  // 運転席の枠
  ctx.fillStyle = THEME.fork.mast; ctx.fillRect(s * 0.3, -s * 1.05, s * 0.08, s * 0.95);              // マスト
  ctx.fillRect(s * 0.3, -s * 0.16, s * 0.42, s * 0.06);                                      // フォーク
  if (opOf(f)) { ctx.scale(dir, 1); drawWorkerSprite(-s * 0.22 * dir, -s * 0.5, s * 0.6, 1, 1); ctx.scale(dir, 1); }   // 運転手
  ctx.fillStyle = THEME.fork.tire;
  for (const wx of [-s * 0.35, s * 0.12]) { ctx.beginPath(); ctx.arc(wx, -s * 0.1, s * 0.12, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  drawLevel(x - s * 0.5, yb - s * 1.25, f.lv);
  // 積んでいる物（フォークの上に小さく）
  for (let i = 0; i < Math.min(f.load.length, 3); i++) {
    drawItemShape(f.load[i], x + dir * s * 0.52, yb - s * 0.28 - i * s * 0.22, 0.45);
  }
}
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function drawTruck() {
  const cell = cp, t = bayTruck() || { phase: 'away' }, y = YARD_R * cell, bx = BED * cell;
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(bx + 2, y + 2, cell * 2 - 4, cell - 4); ctx.setLineDash([]);
  if (t.phase === 'away') return;
  let p = 0;
  if (t.phase === 'leaving') p = ease(t.t / animSec());
  else if (t.phase === 'returning') p = 1 - ease(t.t / animSec());
  ctx.save();
  ctx.beginPath(); ctx.rect(bx - cell, y - cell, cell * 3 + 2, cell * 2.2); ctx.clip();
  ctx.globalAlpha = 1 - p * 0.9;
  ctx.translate(p * cell * 2.2, 0);
  ctx.fillStyle = THEME.truck.body;
  ctx.fillRect(bx + 2, y + cell * 0.45, cell - 2, cell * 0.33);
  ctx.fillRect(bx + 2, y + cell * 0.2, cell * 0.1, cell * 0.3);
  const fill = t.load / valOf('truck');
  ctx.fillStyle = THEME.truck.load;
  ctx.fillRect(bx + cell * 0.14, y + cell * 0.45 - cell * 0.28 * fill, (cell - 2) - cell * 0.14, cell * 0.28 * fill);
  const cx = bx + cell;
  ctx.fillStyle = THEME.truck.cab; ctx.fillRect(cx, y + cell * 0.2, cell * 0.8, cell * 0.58);
  ctx.fillStyle = THEME.truck.win; ctx.fillRect(cx + cell * 0.4, y + cell * 0.28, cell * 0.3, cell * 0.2);
  if (opOf(t)) drawWorkerSprite(cx + cell * 0.55, y + cell * 0.5, cell * 0.28, 1, 1);   // 運転手
  ctx.fillStyle = THEME.truck.tire;
  for (const wx of [bx + cell * 0.35, cx + cell * 0.45]) { ctx.beginPath(); ctx.arc(wx, y + cell * 0.84, cell * 0.13, 0, Math.PI * 2); ctx.fill(); }
  drawLevel(cx, y + cell * 0.12, S.truck.lv);
  ctx.restore();
}

// ---- 画面の数字・ボタン ----
const pxOf = b => { const q = b.dataset.px; return q.startsWith('#') ? document.querySelector(q) : $(q); };
document.querySelectorAll('#dash [data-px]').forEach(b => b.addEventListener('click', () => {
  // 引き出しは1つだけ：パネルのタブを押したら、設置などの引き出しは閉じる（逆は元のボタンが閉じる）
  const k = b.dataset.open;
  if (isPanelKey(k) && openCat) { openCat = null; renderSub(); }
  if (k !== 'info') $('info').hidden = true;
  else if ($('info').hidden) { closePanels(); closePop(); }
  const o = pxOf(b); if (o) o.click();
  updateUI();
}));
function applyDash() {
  document.body.classList.toggle('dash', dashOn);
  const inf = $('info');
  inf.classList.toggle('bottom', dashOn);
  inf.style.left = inf.style.top = inf.style.bottom = '';
  $('dash').hidden = !dashOn;
  if (dashOn) menuOpen = true;   // 計器盤では命令がいつも見えている
}
const isPanelKey = k => !!document.getElementById(k);   // パネル（強化・スキル・情報） or 設置などの項目名
const isOpenTab = k => isPanelKey(k) ? !$(k).hidden : openCat === k;
function syncDash() {
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
  const drawer = open && (isPanelKey(open.dataset.open) ? $(open.dataset.open) : $('subMenu'));
  const was = !hd.hidden && hd.dataset.k;
  hd.hidden = !drawer || drawer.hidden;
  if (!hd.hidden && was !== open.dataset.open) {   // 開いたとき・別のタブに替えたとき：引き出しと一緒にせり上がる
    hd.dataset.k = open.dataset.open;
    hd.style.setProperty('--dh', drawer.offsetHeight + 'px');
    hd.classList.remove('go'); drawer.style.animation = 'none'; void hd.offsetWidth; drawer.style.animation = ''; hd.classList.add('go');
  }
  if (hd.hidden) hd.dataset.k = '';
  if (!hd.hidden) {
    hd.querySelector('b').textContent = open.querySelector('b').textContent;
    hd.querySelector('i').textContent = open.querySelector('i').textContent;
    hd.style.left = (drawer.offsetLeft + 8) + 'px'; hd.style.top = (drawer.offsetTop - 22) + 'px';   // 伸びる動きの途中でもずれないよう offset で
  }
}
function updateUI() {
  const T = tx(), m = $('money');
  m.textContent = S.money; m.classList.toggle('neg', S.money < 0);
  const month = Math.floor(S.time / TUNE.month);
  $('date').textContent = T.date(Math.floor(month / 12) + 1, month % 12 + 1);
  $('playBtn').textContent = running ? T.pause : T.play;
  $('speedBtn').textContent = '×' + speeds()[speedIdx];
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
  $('facBtn').hidden = !(S.office.lv >= 1 && !S.lab.built);
  $('skillBtn').hidden = !S.lab.built;
  const curName = tool === 'none' || tool === 'pan' ? '' : tool === 'machine' ? T.mach[machSel] : tool === 'lab' ? T.labName : T[tool];
  const dirTool = tool === 'conv' || tool === 'sort' || tool === 'tee' || tool === 'cross' || tool === 'machine';
  $('menuCur').textContent = curName ? `（${curName}）` : '';
  // 選択中の道具（左下に表示）：名前・向き・費用
  const ct = $('curTool');
  ct.hidden = !curName;
  if (curName) {
    const cost = tool === 'machine' ? MACHINES[machSel].cost : COST[tool];
    const arrow = dirTool ? ' ' + ARROW[dir] : '';
    ct.textContent = `${curName}${arrow}${cost ? '　' + cost : ''}`;
  }
  document.querySelectorAll('.dir').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
  $('dirBar').hidden = !dirTool;
  cv.classList.toggle('grab', tool === 'pan' && !(gesture && gesture.type === 'pan'));
  cv.classList.toggle('grabbing', !!(gesture && gesture.type === 'pan'));
  cv.classList.toggle('place', tool !== 'pan' && tool !== 'none');
  layoutFloats();
}
// 浮いているボタン類の位置（実際の大きさを見て、重ならないように）
// 右下：メニュー（またはメニューを開いた列）→ その上に種類 → その上に向き
function layoutFloats() {
  const H = window.innerHeight;
  const base = dashOn ? $('dash') : !$('catBar').hidden ? $('catBar') : $('menuBtn');
  const bt = base.getBoundingClientRect().top;
  let bottom = H - bt + 4;
  if (dashOn) bottom = H - bt;
  if (!$('subMenu').hidden) { $('subMenu').style.bottom = bottom + 'px'; bottom += $('subMenu').offsetHeight + 4 + (dashOn ? 22 : 0); }
  $('dirBar').style.bottom = bottom + 'px';
  document.querySelectorAll('.panel.bottom').forEach(p => { p.style.bottom = (H - bt + (dashOn ? 0 : 4)) + 'px'; });
  syncDash();
}
let msgTimer = 0;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 2000); }

function setupText() {
  const T = tx();
  document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
  document.title = T.title;
  document.querySelectorAll('[data-t]').forEach(el => { const v = T[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  $('ver').textContent = 'v' + VERSION;
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
  updateUI();
}

// ---- 入力 ----
const ptrs = new Map();
let gesture = null, down = false, lastK = -1, dragSet = new Set();
function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function cellAtXY(x, y) { return { c: Math.floor((x - offX) / cp + cam.x), r: Math.floor(y / cp + cam.y) }; }
function tapAt(p) {
  if (p.r === YARD_R && (p.c === BED || p.c === CAB)) { openPop('truck'); return true; }
  if (isOffice(p.c, p.r)) { togglePanel('office'); return true; }
  if (isLab(p.c, p.r)) { if (S.lab.built) togglePanel('skillPanel'); else say(tx().needLab); return true; }
  if (p.r === YARD_R) { const f = S.forks.find(o => Math.abs(o.x - (p.c + 0.5)) < 0.6); if (f) { openPop(f); return true; } }
  const s = inB(p.c, p.r) && S.st.get(key(p.c, p.r));
  if (s && tool !== 'remove') { openPop(s); return true; }
  // 何も選んでいない時に土をタップ → 「掘削？」（掘れる所だけ）
  const b = tool === 'none' && inB(p.c, p.r) && p.r >= SKY && blk(p.c, p.r);
  if (b) {
    if (diggable().has(key(p.c, p.r)) && !(b.mat === 'rock' && sk('digLv') < b.layer)) { openPop({ type: 'digcell', c: p.c, r: p.r }); return true; }
    if (b.mat === 'rock' && diggable().has(key(p.c, p.r))) { say(tx().needDig(b.layer)); return true; }
  }
  return false;
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  const q = local(e);
  ptrs.set(e.pointerId, q);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 指の情報が無い環境 */ }
  if (ptrs.size === 2) {
    down = false;
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z,
      wc: (mx - offX) / cp + cam.x, wr: my / cp + cam.y };
    return;
  }
  if (ptrs.size > 2) return;
  const hadPop = !!popTarget || PANELS.some(id => !$(id).hidden) || !!openCat;
  closePop(); closePanels();
  if (openCat) { openCat = null; renderSub(); }
  if (tool === 'pan' || e.button === 1 || e.button === 2) {
    gesture = { type: 'pan', sx: q.x, sy: q.y, cx: cam.x, cy: cam.y, moved: false, hadPop };
    updateUI();
    return;
  }
  const p = cellAtXY(q.x, q.y);
  // 設置中は、地下の物をタップすると上書き（地上の施設はいつもどおりメニュー）
  if (tool !== 'dig' && (!isBuildTool() || p.r < SKY) && tapAt(p)) return;
  if (hadPop) return;
  down = true; lastK = key(p.c, p.r); dragSet = new Set(); apply(p.c, p.r, false);
  const s0 = S.st.get(lastK); if (s0 && s0.type === 'conv') dragSet.add(s0);
  updateUI();
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
  if (k !== lastK) {
    const pk = lastK; lastK = k;
    if (tool === 'conv' && sk('dragPlus')) {   // スキル：なぞった向きにそろえる（曲がり角も）
      const dc = cOf(k) - cOf(pk), dr = rOf(k) - rOf(pk);
      const d = dc === 1 && !dr ? 'right' : dc === -1 && !dr ? 'left' : dr === 1 && !dc ? 'down' : dr === -1 && !dc ? 'up' : null;
      if (d) { const ps = S.st.get(pk); if (ps && dragSet.has(ps)) ps.dir = d; dir = d; }
    }
    apply(hover.c, hover.r, true);
    const ns = S.st.get(k); if (ns && ns.type === 'conv') dragSet.add(ns);
    updateUI();
  }
});
function endPtr(e) {
  const q = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (gesture && gesture.type === 'pan' && !gesture.moved && e.button === 0 && q && !gesture.hadPop) tapAt(cellAtXY(q.x, q.y));
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

document.querySelectorAll('.dir').forEach(b => b.addEventListener('click', () => { dir = b.dataset.dir; updateUI(); }));
$('playBtn').addEventListener('click', () => { running = !running; updateUI(); });
$('speedBtn').addEventListener('click', () => { speedIdx = (speedIdx + 1) % speeds().length; updateUI(); });
$('zoomIn').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 0.8));
$('topBtn').addEventListener('click', () => { cam.y = camTop(); metrics(); });
$('powerBtn').addEventListener('click', () => togglePanel('powerPanel'));
$('skillBtn').addEventListener('click', () => { if (S.lab.built) togglePanel('skillPanel'); });
$('helpBtn').addEventListener('click', () => togglePanel('help'));
$('setBtn').addEventListener('click', () => togglePanel('settings'));
$('adminBtn').addEventListener('click', () => togglePanel('admin'));
// タイトルを押すと「リセットしますか？」→ はい で再読み込み
document.querySelector('#hdr .brand').addEventListener('click', () => askConfirm(tx().confirmReload, () => location.reload()));
$('resetBtn').addEventListener('click', () => askConfirm(tx().confirmReset, () => {
  closePop(); closePanels(); newGame(); updateUI();
}));
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
// ヘッダーがはみ出していたら、段階的に詰める（画面幅の決め打ちではなく、実際に測る）
function fitHeader() {
  const h = $('hdr'), rows = [...h.querySelectorAll('.hrow')];
  const over = () => rows.some(r => r.scrollWidth > r.clientWidth + 1);
  h.classList.remove('c1', 'c2', 'c3');
  for (const c of ['c1', 'c2', 'c3']) { if (!over()) break; h.classList.add(c); }
}
window.addEventListener('resize', fitHeader);
function setFold(f) {
  document.body.classList.toggle('hfold', f);
  $('unfoldBtn').hidden = !f;
  fitHeader(); resize(); updateUI();
}
$('foldBtn').addEventListener('click', () => setFold(true));
$('unfoldBtn').addEventListener('click', () => setFold(false));
setInterval(fitHeader, 1000);   // 資金の桁が増えたときも
requestAnimationFrame(fitHeader);

// ---- ループ ----
let last = performance.now(), panelTick = 0;
function frame(now) {
  const dt = Math.min(now - last, 250) / 1000; last = now;
  const sp = speeds(); if (speedIdx >= sp.length) speedIdx = sp.length - 1;
  if (running) sim(dt * sp[speedIdx]);
  applyMove(dt);
  updateUI();
  if ((panelTick = (panelTick + 1) % 15) === 0) {
    for (const id of ['powerPanel', 'office', 'skillPanel']) if (!$(id).hidden && !panelBusy($(id))) renderPanel(id);
    if (!$('info').hidden) renderInfo();
    if (popTarget) updatePop();
    syncDash();
  }
  if (!$('mapPanel').hidden && panelTick % 5 === 0) renderMap();
  metrics();
  placePop();
  draw();
  requestAnimationFrame(frame);
}

newGame();
applyDash();
setupText();
resize();
resetCam();
window.__game = { // 動作確認用
  get S() { return S; }, TUNE, row, canPlaceAt, officeUp, buyFork, finishResearch, sim, apply, gainSkill, startResearch, saveTo, loadFrom, speeds, bayTruck, levelUp, levelUpAll, departNow, cam, diggable, hire,
  setTool: t => setTool(t), setDir: d => { dir = d; }, pause: () => { running = false; },
};
requestAnimationFrame(frame);
})();
