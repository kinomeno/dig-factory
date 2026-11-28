// 説明ページ（検索・AI検索向け）を作る：main.js のデータ（資源・機械・言葉）から、日本語と英語のページを書き出す
// 使い方：node tools/make_guide.js （app フォルダで実行）→ guide/ ・ en/guide/ ・ sitemap.xml を書き出す
// ゲームの中身（資源・機械）を変えたら、公開の前にもう一度実行する
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(app, 'main.js'), 'utf8');
const SITE = 'https://horihori.kinomeno.com';
const VERSION = (src.match(/const VERSION = '([\d.]+)'/) || [])[1] || '';

// ---- main.js から、オブジェクトの書き方のまま取り出して読む ----
function block(head) {
  const i = src.indexOf(head); if (i < 0) throw new Error('not found: ' + head);
  const j = src.indexOf('\n};', i); return src.slice(i + head.length - 1, j + 2);
}
const ev = t => Function('"use strict"; return (' + t + ');')();
const ITEMS = ev(block('const ITEMS = {'));
const MACHINES = ev(block('const MACHINES = {'));
const TXT = ev(block('const TXT = {'));
const TXT_ADD = ev(block('const TXT_ADD = {'));
const RARE = ev(src.match(/const RARE = (\[.*?\]);/)[1]);
const BAL_PRESET = ev(src.match(/const BAL_PRESET = (\{.*?\});/)[1]);
const FAC_IDS = ev(src.match(/const FAC_IDS = (\[.*?\]);/)[1]);
for (const l of Object.keys(TXT_ADD)) {   // ゲームと同じように言葉を足す
  const a = TXT_ADD[l];
  for (const k of Object.keys(a)) {
    if (k === 'sk' || k === 'deal') Object.assign(TXT[l][k], a[k]);
    else if (k === 'help0') TXT[l].helpTopics[0] = a[k];
    else if (k === 'help7') TXT[l].helpTopics[7] = a[k];
    else if (k === 'help1') TXT[l].helpTopics[1] = a[k];
    else if (['adm', 'items', 'mach', 'glyph', 'fac', 'facDesc'].includes(k)) Object.assign(TXT[l][k] || (TXT[l][k] = {}), a[k]);
    else TXT[l][k] = a[k];
  }
}
for (const [p, v] of Object.entries(BAL_PRESET)) {   // 調整の表（売値など）
  const [root, ...rest] = p.split('.'); const obj = { ITEMS, MACHINES }[root]; if (!obj) continue;
  let o = obj; for (let i = 0; i < rest.length - 1; i++) { o = o[rest[i]]; if (!o) break; } if (o) o[rest[rest.length - 1]] = v;
}

// ---- 加工のつながり ----
const rareSet = new Set(RARE.map(r => r[0]));
const recipes = [];   // { m, ins: {k:n}, out, outN }
for (const [m, d] of Object.entries(MACHINES)) for (const r of d.recipes || []) recipes.push({ m, ins: r.ins ? r.ins : { [r.in]: r.n }, out: r.out, outN: r.outN || 1 });
const DEPTH_ROWS = src.match(/const rows = (\[\[T\.dAlways[\s\S]*?\]\]);/)[1];   // 資源の出る深さ（ゲームの「資源の出る深さ」と同じ表）
const depthOf = (lg, k) => { const rows = Function('T', 'return ' + DEPTH_ROWS)(T[lg]); for (const [b, ks] of rows) if (ks.includes(k)) return typeof b === 'number' ? T[lg].dBelow(b) : b; return ''; };
const RAW = ['soil', 'stone', 'clay', 'iron', 'copper', 'coal', 'gold', 'quartz', 'silver', 'dia'];

// ---- 書き出しの部品 ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl = s => esc(s).replace(/\n/g, '<br>').replace(/\[[a-z]+\]/g, '');
const L = {
  ja: { lang: 'ja', game: 'ほりほり工場', play: '▶ 今すぐ遊ぶ（無料・ブラウザで）', home: 'ガイド', items: '資源と製品の一覧', machines: '機械の一覧', faq: 'よくある質問', other: 'English', otherPath: '/en/guide/',
        foot: 'キノメノ（Kinomeno）が作っています。', more: 'ほかのゲーム（kinomeno.com）', diary: '制作日誌', privacy: 'プライバシーポリシー', base: '/guide/' },
  en: { lang: 'en', game: 'Dig Factory Tycoon', play: '▶ Play now (free, in your browser)', home: 'Guide', items: 'Resources & products', machines: 'Machines', faq: 'FAQ', other: '日本語', otherPath: '/guide/',
        foot: 'Made by Kinomeno.', more: 'More games (kinomeno.com)', diary: 'Dev diary (Japanese)', privacy: 'Privacy policy', base: '/en/guide/' },
};
const T = { ja: TXT.kanji, en: TXT.en };
const iname = (lg, k) => (T[lg].items || {})[k] || k;
const mname = (lg, m) => (T[lg].mach || {})[m] || m;
const insText = (lg, ins) => Object.entries(ins).map(([k, n]) => `${iname(lg, k)}×${n}`).join(lg === 'ja' ? '＋' : ' + ');

function page(lg, file, title, desc, body, ld) {
  const t = L[lg], url = SITE + t.base + (file === 'index' ? '' : file + '.html');
  const alt = SITE + (lg === 'ja' ? '/en/guide/' : '/guide/') + (file === 'index' ? '' : file + '.html');
  const nav = [['index', t.home], ['items', t.items], ['machines', t.machines], ['faq', t.faq]].map(([f, n]) => `<a href="${t.base}${f === 'index' ? '' : f + '.html'}"${f === file ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('');
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${lg}" href="${url}">
<link rel="alternate" hreflang="${lg === 'ja' ? 'en' : 'ja'}" href="${alt}">
<link rel="alternate" hreflang="x-default" href="${SITE}/guide/${file === 'index' ? '' : file + '.html'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/icons/og.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png?v=199">
<style>
:root { --bg: #f4f2ec; --paper: #fff; --text: #2b2b2e; --sub: #6b6a70; --line: rgba(0,0,0,.12); --accent: #d0661f; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1f24; --paper: #25282e; --text: #e8e6e1; --sub: #a3a2a8; --line: rgba(255,255,255,.14); } }
body { margin: 0; background: var(--bg); color: var(--text); font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", system-ui, sans-serif; line-height: 1.8; }
header, main, footer { max-width: 760px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 18px; } header .t { font-family: "Shippori Mincho B1", "Yu Mincho", serif; font-size: 22px; font-weight: 600; letter-spacing: .04em; color: inherit; text-decoration: none; }
nav { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 8px 0 4px; font-size: 14px; } nav a { color: var(--sub); } nav a[aria-current] { color: var(--text); font-weight: 700; text-decoration: none; }
.play { display: inline-block; margin: 12px 0; padding: 10px 18px; background: var(--accent); color: #fff; border-radius: 6px; text-decoration: none; font-weight: 700; }
article { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 18px 18px 8px; margin: 12px 0; }
h1 { font-size: 22px; margin: 0 0 6px; line-height: 1.4; } h2 { font-size: 17px; margin: 22px 0 6px; } h3 { font-size: 15px; margin: 16px 0 4px; }
p, li, td, th { font-size: 14.5px; } .sub { color: var(--sub); font-size: 13px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; } th, td { border-bottom: 1px solid var(--line); padding: 6px 6px; text-align: left; vertical-align: top; } th { font-size: 13px; color: var(--sub); font-weight: 600; }
td.n { white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
img { max-width: 100%; height: auto; border-radius: 6px; }
footer { padding: 10px 16px 40px; font-size: 13px; color: var(--sub); } footer a { color: var(--sub); margin-right: 12px; }
a { color: #3f7cc4; }
</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
</head>
<body>
<header>
<a class="t" href="/">${esc(t.game)}</a>
<nav>${nav}<a href="${t.otherPath}${file === 'index' ? '' : file + '.html'}" hreflang="${lg === 'ja' ? 'en' : 'ja'}">${esc(t.other)}</a></nav>
</header>
<main>
${body}
<p><a class="play" href="/">${esc(t.play)}</a></p>
</main>
<footer>
<p>${esc(t.foot)} <a href="https://www.kinomeno.com/">${esc(t.more)}</a><a href="/diary/">${esc(t.diary)}</a><a href="/privacy/">${esc(t.privacy)}</a></p>
<p>v${VERSION}</p>
</footer>
</body>
</html>
`;
}

// ---- ページの中身 ----
const nProducts = Object.keys(ITEMS).filter(k => k !== 'bag' && !RAW.includes(k) && !rareSet.has(k) && k !== 'fuel').length;
const nMach = Object.keys(MACHINES).length;
const GAME_LD = lg => ({
  '@context': 'https://schema.org', '@type': 'VideoGame', name: lg === 'ja' ? 'ほりほり工場' : 'Dig Factory Tycoon', alternateName: lg === 'ja' ? 'Dig Factory Tycoon' : 'ほりほり工場',
  url: SITE + '/', image: SITE + '/icons/og.png', inLanguage: ['ja', 'en'], genre: lg === 'ja' ? ['経営シミュレーション', '採掘ゲーム', '放置ゲーム'] : ['Management simulation', 'Mining', 'Idle game'],
  gamePlatform: ['Web browser', 'iOS (Safari)', 'Android (Chrome)', 'PC'], applicationCategory: 'Game', operatingSystem: 'Any (web browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' }, author: { '@type': 'Person', name: 'キノメノ / Kinomeno', url: 'https://www.kinomeno.com/' },
  description: lg === 'ja' ? 'ドリルで地面を掘り、コンベアと機械で資源を運んで加工し、トラックで売る。縦に掘り進む採掘経営ゲーム。無料・ブラウザで遊べます。' : 'Dig down with drills, carry resources on conveyors, process them in machines and sell by truck. A free browser mining & factory management game.',
});

const INTRO = {
  ja: `<article>
<h1>ほりほり工場 ガイド：縦に掘り進む、無料の採掘・工場経営ゲーム</h1>
<p>「ほりほり工場」は、ドリルで地面を掘り、コンベアで資源を地上へ運び、機械で加工して、トラックで売る、ブラウザで遊べる採掘・工場経営ゲームです。スマホでもパソコンでも、インストールせずに無料で遊べます。</p>
<p>はじめは社長ひとり。スコップで穴を掘るところから始まり、ドリルを置き、作業員を雇い、研究を進めて、深い岩盤の下へ掘り進みます。</p>
<img src="/icons/og.png" alt="ほりほり工場のタイトル画像" width="1200" height="630" loading="lazy">
<h2>こんなゲームです</h2>
<ul>
<li><b>掘る</b>：ドリルが土・石・鉄・金・ダイヤなどを掘り出します。深いほど、珍しい資源や化石が出ます。</li>
<li><b>運ぶ</b>：コンベア、仕分けコンベア、エレベーター、フォークリフト、トラック。流れを組むのがパズルのように楽しい。</li>
<li><b>加工する</b>：${nMach}種類の機械で、レンガから鉄の延べ棒、宝石、ラジコン、そして「家」まで、${nProducts}種類以上の製品を作れます。</li>
<li><b>人を雇う</b>：作業員はドリルや機械へ自分で歩いて行き、働くほど上手になります。疲れたら事務所で休みます。</li>
<li><b>研究する</b>：研究所で新しい機械や便利な力を研究。会社レベルを上げて、硬い岩盤を破っていきます。</li>
<li><b>放置もOK</b>：留守の間も工場は動きます（最初は30分、研究で最大1日）。</li>
<li><b>ひらがなモード</b>：10歳くらいの子どもでも読める言葉の「ひらがな」、ふつうの「漢字」、「English」から選べます。</li>
</ul>
<h2>はじめ方（3ステップ）</h2>
<ol>
<li>トップページで「はじめから」を押します。</li>
<li>社長が穴を掘って見せてくれます。案内に沿って、ドリルを置きましょう。</li>
<li>コンベアで地上へ運び、トラックで売ってお金をためます。あとは自由に会社を大きくしてください。</li>
</ol>
</article>`,
  en: `<article>
<h1>Dig Factory Tycoon guide: a free vertical mining & factory game</h1>
<p><b>Dig Factory Tycoon</b> (ほりほり工場) is a browser game about digging down with drills, carrying resources up with conveyors, processing them in machines and selling them by truck. It runs on phones and PCs with no install, and it is free.</p>
<p>You start as a lone boss with a shovel. Place drills, hire workers, research new machines and break through harder and harder bedrock.</p>
<img src="/icons/og.png" alt="Dig Factory Tycoon title image" width="1200" height="630" loading="lazy">
<h2>What you do</h2>
<ul>
<li><b>Dig</b>: drills dig soil, stone, iron, gold, diamonds and more. Deeper layers hide rare finds and fossils.</li>
<li><b>Carry</b>: conveyors, sorters, elevators, forklifts and trucks. Building the flow is a relaxing puzzle.</li>
<li><b>Process</b>: ${nMach} machines turn raw resources into ${nProducts}+ products, from bricks and iron bars to gems, RC cars and even houses.</li>
<li><b>Hire</b>: workers walk to drills and machines, get better as they work, and rest at the office when tired.</li>
<li><b>Research</b>: unlock machines and perks at the lab, raise your company level and break bedrock.</li>
<li><b>Idle friendly</b>: the factory keeps running while you are away (30 minutes at first, up to a day with research).</li>
<li><b>Languages</b>: English, Japanese (kanji) and a simple Japanese hiragana mode for kids.</li>
</ul>
<h2>Getting started</h2>
<ol>
<li>Open the game and press "New game".</li>
<li>The boss digs the first hole for you. Follow the guide and place a drill.</li>
<li>Carry resources up with conveyors and sell them by truck. Then grow your company your own way.</li>
</ol>
</article>`,
};

function howto(lg) {   // ゲームの中の「遊び方」と同じ説明（文字で読めるように）
  const H = T[lg].helpTopics || [];
  const parts = H.filter(h => h && h[0] && h[1]).map(h => `<h3>${esc(h[0])}</h3><p>${nl(h[1])}</p>`).join('\n');
  return `<article><h2>${lg === 'ja' ? '遊び方（ゲームの中の説明と同じ）' : 'How to play (same as the in-game help)'}</h2>\n${parts}</article>`;
}

function itemsPage(lg) {
  const madeBy = k => recipes.filter(r => r.out === k).map(r => `${insText(lg, r.ins)} → ${mname(lg, r.m)}${r.outN > 1 ? ` (×${r.outN})` : ''}`);
  const usedIn = k => recipes.filter(r => r.ins[k]).map(r => `${iname(lg, r.out)}（${mname(lg, r.m)}）`);
  const where = (T[lg].iWhere || {});
  const head = lg === 'ja' ? ['名前', '売値', '作り方・出る場所', '使い道'] : ['Name', 'Price', 'How to get', 'Used for'];
  const how = k => (RAW.includes(k) || rareSet.has(k)) ? [where[k] || (depthOf(lg, k) + (rareSet.has(k) ? (lg === 'ja' ? '（まれに掘り当てる）' : ' (rare find)') : '')), ...madeBy(k).map(x => (lg === 'ja' ? '機械でも：' : 'Also: ') + x)].filter(Boolean).join(' / ') : madeBy(k).join(' / ');
  const row = k => `<tr><td>${esc(iname(lg, k))}</td><td class="n">${ITEMS[k].v}</td><td>${esc(how(k))}</td><td>${esc([...new Set(usedIn(k))].join(lg === 'ja' ? '、' : ', '))}</td></tr>`;
  const table = (keys, cap) => `<h2>${esc(cap)}</h2><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${keys.map(row).join('')}</tbody></table>`;
  const products = Object.keys(ITEMS).filter(k => k !== 'bag' && !RAW.includes(k) && !rareSet.has(k)).sort((a, b) => ITEMS[a].v - ITEMS[b].v);
  const rare = RARE.map(r => r[0]).filter(k => ITEMS[k]);
  const body = `<article>
<h1>${lg === 'ja' ? 'ほりほり工場 資源と製品の一覧（作り方・売値・使い道）' : 'Dig Factory Tycoon: all resources & products (recipes, prices, uses)'}</h1>
<p>${lg === 'ja' ? `掘って出る資源と、機械で作れる製品の一覧です。売値は、売値アップなどをしていない時の1個の値段です。` : `Every resource you can dig and every product you can make. Prices are the base price for one item, before any price upgrades.`}</p>
${table(RAW.filter(k => ITEMS[k]), lg === 'ja' ? '掘って出る資源' : 'Raw resources')}
${table(products, lg === 'ja' ? '機械で作る製品（安い順）' : 'Products (cheapest first)')}
${table(rare, lg === 'ja' ? '珍しい物（深い所でまれに掘り当てる）' : 'Rare finds (dug up rarely in deep layers)')}
</article>`;
  return body;
}

function machinesPage(lg) {
  const head = lg === 'ja' ? ['機械', '値段', '1回の時間', '作れる物'] : ['Machine', 'Cost', 'Time', 'Recipes'];
  const rows = Object.entries(MACHINES).map(([m, d]) => {
    const rec = d.bag ? (T[lg].bagRule || '') : d.src ? (T[lg].aditRule || '') : (d.recipes || []).map(r => `${insText(lg, r.ins ? r.ins : { [r.in]: r.n })} → ${iname(lg, r.out)}${r.outN > 1 ? ` ×${r.outN}` : ''}`).join(lg === 'ja' ? '　/　' : '  /  ');
    return `<tr><td>${esc(mname(lg, m))}</td><td class="n">${d.cost}</td><td class="n">${d.time}${lg === 'ja' ? '秒' : 's'}</td><td>${esc(rec)}</td></tr>`;
  }).join('');
  const facs = FAC_IDS.map(f => `<li><b>${esc((T[lg].fac || {})[f] || f)}</b>：${esc((T[lg].facDesc || {})[f] || '')}</li>`).join('');
  return `<article>
<h1>${lg === 'ja' ? 'ほりほり工場 機械の一覧（レシピ・値段）' : 'Dig Factory Tycoon: all machines (recipes & costs)'}</h1>
<p>${lg === 'ja' ? '機械は、前以外の方向から材料を入れると、前に製品を出します。人がいると速く動きます。' : 'Feed a machine from any side except its front; the product comes out of the front. Machines run much faster with a worker.'}</p>
<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
<h2>${lg === 'ja' ? '地上の施設' : 'Surface facilities'}</h2>
<ul>${facs}</ul>
</article>`;
}

const FAQ = {
  ja: [
    ['ほりほり工場は無料ですか？', 'はい、無料です。お金はかかりません。アプリのインストールもいりません。ブラウザ（Safari・Chrome・Edge など）で、ページを開くだけで遊べます。'],
    ['スマホでも遊べますか？', 'はい。iPhone・Android・パソコンで遊べます。ホーム画面に追加すると、アプリのように全画面で遊べます。'],
    ['セーブはどうなりますか？', '遊んだ記録は、ブラウザに自動で保存されます。機種を変える時は、設定の「書き出す」でファイルにして、新しい機種で「読み込む」と続きから遊べます。'],
    ['放置しても進みますか？', 'はい。留守の間も工場は動きます。はじめは30分ぶん、研究「放置時間延長」で最大1日ぶん進みます。'],
    ['子どもでも遊べますか？', 'はい。「ひらがな」モードがあり、10歳くらいの子どもでも読める言葉で遊べます。はじめての人には、社長が操作を案内します。'],
    ['どんな言葉に対応していますか？', 'ひらがな・漢字（日本語）・English の3つです。タイトル画面で選べます。'],
    ['どんなジャンルのゲームですか？', '縦に掘り進む採掘ゲームと、工場づくり・経営シミュレーションを合わせたゲームです。放置ゲームのように、少しずつ大きくなる工場を眺めて楽しめます。'],
    ['作ったのは誰ですか？', 'キノメノ（Kinomeno）です。ほかのゲームや道具は kinomeno.com にあります。制作の様子は「制作日誌」で読めます。'],
  ],
  en: [
    ['Is Dig Factory Tycoon free?', 'Yes. It is free to play and needs no install. Just open the page in a browser such as Safari, Chrome or Edge.'],
    ['Can I play on my phone?', 'Yes. It works on iPhone, Android and PC. Add it to your home screen to play full screen like an app.'],
    ['How does saving work?', 'Your progress is saved automatically in your browser. To move to a new device, use Export in Settings and Import the file on the new device.'],
    ['Does it progress while I am away?', 'Yes. The factory keeps running while you are away: 30 minutes at first, up to a full day with the Longer idle research.'],
    ['Is it OK for kids?', 'Yes. There is a simple Japanese hiragana mode, and the boss walks new players through the controls.'],
    ['Which languages are supported?', 'English, Japanese (kanji) and Japanese hiragana. Choose on the title screen.'],
    ['What kind of game is it?', 'A vertical mining game combined with factory building and management simulation, with relaxing idle-game growth.'],
    ['Who made it?', 'Kinomeno. More games and tools are at kinomeno.com.'],
  ],
};
function faqPage(lg) {
  const qa = FAQ[lg].map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join('\n');
  return `<article><h1>${lg === 'ja' ? 'ほりほり工場 よくある質問' : 'Dig Factory Tycoon FAQ'}</h1>\n${qa}</article>`;
}
const FAQ_LD = lg => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ[lg].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

// ---- 書き出す ----
const out = [];
for (const lg of ['ja', 'en']) {
  const dir = path.join(app, lg === 'ja' ? 'guide' : 'en/guide'); fs.mkdirSync(dir, { recursive: true });
  const w = (f, html) => { fs.writeFileSync(path.join(dir, f + '.html'), html.replace(/\r?\n/g, '\n')); out.push((lg === 'ja' ? '/guide/' : '/en/guide/') + (f === 'index' ? '' : f + '.html')); };
  const g = L[lg].game;
  w('index', page(lg, 'index', lg === 'ja' ? 'ほりほり工場 ガイド｜無料ブラウザの採掘・工場経営ゲーム' : 'Dig Factory Tycoon guide | Free browser mining & factory game',
    lg === 'ja' ? 'ほりほり工場の遊び方ガイド。ドリルで掘って、コンベアで運んで、機械で加工して売る、無料のブラウザ採掘・工場経営ゲーム。スマホ・PC対応、ひらがなモードあり。' : 'How to play Dig Factory Tycoon, a free browser game where you dig with drills, carry resources on conveyors, process them in machines and sell them. Works on phone and PC.',
    INTRO[lg] + howto(lg), GAME_LD(lg)));
  w('items', page(lg, 'items', lg === 'ja' ? `${g} 資源と製品の一覧｜作り方・売値・使い道` : `${g}: resources & products list | recipes, prices, uses`,
    lg === 'ja' ? `ほりほり工場の資源と製品、全部の一覧。鉄・金・ダイヤから、鉄の延べ棒・宝石・ラジコン・家まで、作り方と売値と使い道。` : 'Every resource and product in Dig Factory Tycoon, from iron, gold and diamonds to iron bars, gems, RC cars and houses, with recipes, prices and uses.',
    itemsPage(lg), null));
  w('machines', page(lg, 'machines', lg === 'ja' ? `${g} 機械の一覧｜レシピ・値段` : `${g}: machines list | recipes & costs`,
    lg === 'ja' ? 'ほりほり工場の機械の一覧。レンガ焼成機・溶鉱炉・研磨機・組立機など、作れる物と値段。地上の施設（温泉・博物館など）も。' : 'All machines in Dig Factory Tycoon (kiln, smelter, polisher, assembler and more) with what they make and their cost, plus surface facilities.',
    machinesPage(lg), null));
  w('faq', page(lg, 'faq', lg === 'ja' ? `${g} よくある質問｜無料？スマホ？セーブは？` : `${g} FAQ | free? mobile? saving?`,
    lg === 'ja' ? 'ほりほり工場のよくある質問。無料で遊べる？スマホは？セーブや放置は？子どもでも遊べる？' : 'Frequently asked questions about Dig Factory Tycoon: is it free, does it work on mobile, how saving and idle progress work.',
    faqPage(lg), FAQ_LD(lg)));
}
// sitemap.xml（日誌は1本ずつ）
let diaries = []; try { diaries = JSON.parse(fs.readFileSync(path.join(app, 'diary', 'list.json'), 'utf8')); } catch (e) { }
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', ...out, '/diary/', '/privacy/'];
const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(app, 'sitemap.xml'), sm);
console.log('pages:', out.length, 'products:', nProducts, 'machines:', nMach, 'diaries:', diaries.length);
