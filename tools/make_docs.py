# 開発用の資料を作る：現在の仕様.txt・説明文一覧.txt・加工チェーン.png（採掘ゲーム フォルダに書き出す）
# データは v1.66 の main.js から写したもの（__game.specDump() で取り出せる）。仕様を変えたら書き直すこと
# 使い方：py -3 tools/make_docs.py （app フォルダで実行）
import os
from PIL import Image, ImageDraw, ImageFont

here = os.path.dirname(os.path.abspath(__file__))
dst = os.path.normpath(os.path.join(here, '..', '..'))

# ---- 会社レベル（内部の値。表示は −1：会社レベル0から） ----
CO = {'m:crusher': 2, 'm:adit': 2, 'sk:autoHire': 2, 'm:smelter': 3, 'm:sieve': 3, 'sk:hr': 3, 'sk:away': 3, 'm:bagger': 4, 't:tee': 4, 't:branch': 5, 't:tri': 6, 'sk:secAdv': 4, 'sk:bored': 4,
      't:elev': 5, 'm:roller': 5, 'sk:land': 5, 'sk:autoUpg': 5, 't:lamp': 6, 'm:drawer': 6, 't:vend': 3, 'f:hc': 9, 'sk:autoPrice': 6, 'sk:vein': 6, 't:pipe': 7, 'm:factory': 7, 'f:spa': 7, 'sk:statue': 7,
      'm:glassF': 8, 't:cross': 8, 'f:power': 8, 'sk:garden': 8, 'sk:conne': 8, 't:fdrill': 9, 'm:caster': 9, 'sk:goldUp': 9, 'sk:sortPlus': 9, 'sk:sortPlus2': 11, 'm:metalwork': 10, 'f:refinery': 10,
      'sk:yardPlus': 10, 'sk:newTech': 10, 'm:washer': 11, 'm:cutter': 11, 'batch': 11, 'sk:treasure': 11, 't:adrill': 12, 'm:polisher': 12, 'f:museum': 12, 'sk:veteran': 12, 'sk:black': 13, 'sk:speeding': 13,
      'sk:diaUp': 13, 'm:atelier': 14, 'sk:oilScan': 14, 'm:assembler': 13, 'm:chem': 11}
COSK = {'auto': [4, 8, 12], 'speed': [2, 6, 10], 'hr': [3, 7], 'welfare': [6, 9], 'labRoom': [2, 5, 8]}
OFF_COST = [600, 5000, 56000, 164000]
BR = [5, 11, 17, 23, 29, 35, 41, 47, 53, 59]   # 岩盤の段（地表からの行）。1マス3m

NAME = {}
ITEMS = [('soil', '土', 1), ('stone', '石', 2), ('iron', '鉄', 15), ('gold', '金', 50), ('dia', 'ダイヤ原石', 100), ('clay', '粘土', 2), ('copper', '銅', 25), ('coal', '石炭', 8), ('quartz', '石英', 60), ('silver', '銀', 70),
         ('gravel', '砂利', 5), ('brick', 'レンガ', 7), ('kawara', '瓦', 12), ('pottery', '陶器', 40), ('tile', 'タイル', 8), ('glossTile', 'つやタイル', 16), ('concrete', 'コンクリートブロック', 15), ('decoGravel', '化粧砂利', 14),
         ('ironbar', '鉄の延べ棒', 200), ('goldbar', '金の延べ棒', 800), ('copperBar', '銅の延べ棒', 300), ('silverBar', '銀の延べ棒', 1000), ('steel', '鋼', 650), ('goldDust', '金粉', 30),
         ('tool', '鉄製品', 700), ('jewel', '金細工', 1000), ('wire', 'ワイヤー', 300), ('goldleaf', '金箔', 950), ('copperWire', '銅線', 380), ('cable', '電線', 900), ('ironPlate', '鉄板', 280), ('copperPlate', '銅板', 420),
         ('ironPot', '鉄鍋', 350), ('copperPot', '銅鍋', 480), ('wireMesh', '金網', 750), ('silverware', '銀食器', 2600), ('steelPart', '鋼の部品', 1100),
         ('glass', 'ガラス', 30), ('luxGlass', '高級ガラス', 400), ('lens', 'レンズ', 1000), ('diaClean', '洗ったダイヤ', 800), ('diaCut', 'カットダイヤ', 1200), ('gem', '宝石', 500),
         ('decoIron', '高級装飾品（鉄）', 3200), ('decoGold', '高級装飾品（金）', 7000), ('goldTile', '金縁タイル', 2200), ('engine', '機械', 3500), ('switchboard', '配電盤', 3200), ('decoPanel', '装飾パネル', 5500), ('telescope', '望遠鏡', 3600),
         ('plastic', 'プラスチック', 140), ('hose', 'ホース', 420), ('bucket', 'バケツ', 380), ('rcCar', 'ラジコン', 6500), ('fuel', '燃料', 40),
         ('ammonite', 'アンモナイト', 2000), ('fossil', '化石', 3000), ('haniwa', '埴輪', 5000), ('rareMin', '稀少鉱物', 8000), ('relic', '古代文明の宝', 15000), ('mummy', 'ミイラ', 25000)]
for k, n, v in ITEMS: NAME[k] = n
VAL = {k: v for k, n, v in ITEMS}
RAW = ['soil', 'stone', 'clay', 'iron', 'copper', 'gold', 'coal', 'quartz', 'silver', 'dia']
DEPTH = [('いつでも', ['soil', 'stone']), ('岩盤1の下', ['iron', 'clay']), ('岩盤2の下', ['copper']), ('岩盤3の下', ['gold', 'coal', 'ammonite', '（温泉）']), ('岩盤4の下', ['fossil', '（石油）']),
         ('岩盤5の下', ['quartz', 'haniwa']), ('岩盤6の下', ['silver', 'rareMin']), ('岩盤7の下', ['dia']), ('岩盤8の下', ['relic']), ('岩盤9の下', ['mummy'])]
# ※粘土は岩盤3より下では出ない

# 機械：[id, 名前, 値段, 時間, [(材料dict, 出る物)]]
M = [
 ('kiln', 'レンガ焼成機', 120, 3, [({'soil': 2}, 'brick'), ({'clay': 1}, 'kawara'), ({'brick': 1, 'tile': 1}, 'pottery')]),
 ('crusher', 'クラッシャー', 100, 2, [({'stone': 1}, 'gravel'), ({'gold': 1}, 'goldDust')]),
 ('smelter', '溶鉱炉', 200, 4, [({'iron': 2}, 'ironbar'), ({'gold': 2}, 'goldbar'), ({'copper': 2}, 'copperBar'), ({'silver': 2}, 'silverBar'), ({'ironbar': 1, 'coal': 1}, 'steel')]),
 ('sieve', 'ふるい', 300, 3, [({'soil': 6}, 'iron'), ({'gravel': 5}, 'copper')]),
 ('factory', '商品製造機', 400, 5, [({'ironbar': 2}, 'tool'), ({'goldbar': 2}, 'jewel'), ({'gravel': 1, 'stone': 1}, 'concrete'), ({'copperWire': 2}, 'cable'), ({'plastic': 2}, 'bucket')]),
 ('washer', 'クリーニング機', 300, 2, [({'dia': 1}, 'diaClean')]),
 ('cutter', 'カット機', 400, 3, [({'diaClean': 1}, 'diaCut'), ({'stone': 1}, 'tile')]),
 ('polisher', '研磨機', 500, 3, [({'diaCut': 1}, 'gem'), ({'tile': 1}, 'glossTile'), ({'luxGlass': 1}, 'lens'), ({'gravel': 2}, 'decoGravel')]),
 ('drawer', '伸線機', 350, 3, [({'ironbar': 1}, 'wire'), ({'goldbar': 1}, 'goldleaf'), ({'copperBar': 1}, 'copperWire'), ({'plastic': 1}, 'hose')]),
 ('roller', '圧延機', 800, 4, [({'ironbar': 1}, 'ironPlate'), ({'copperBar': 1}, 'copperPlate')]),
 ('caster', '鋳造機', 900, 5, [({'ironbar': 1}, 'ironPot'), ({'copperBar': 1}, 'copperPot')]),
 ('glassF', 'ガラス炉', 700, 4, [({'gravel': 2}, 'glass'), ({'quartz': 1}, 'luxGlass')]),
 ('metalwork', '金属加工機', 1500, 5, [({'wire': 2}, 'wireMesh'), ({'silverBar': 2}, 'silverware'), ({'steel': 1}, 'steelPart')]),
 ('atelier', '装飾工房', 700, 6, [({'ironbar': 1, 'gem': 1}, 'decoIron'), ({'goldbar': 1, 'gem': 1}, 'decoGold'), ({'glossTile': 1, 'goldleaf': 1}, 'goldTile')]),
 ('chem', '化学プラント', 2500, 5, [({'coal': 2}, 'plastic')]),
 ('assembler', '組立機', 3000, 6, [({'steelPart': 1, 'ironPlate': 1}, 'engine'), ({'cable': 1, 'copperPlate': 1}, 'switchboard'), ({'goldTile': 1, 'glossTile': 1}, 'decoPanel'), ({'lens': 1, 'copperPlate': 1}, 'telescope'), ({'plastic': 1, 'cable': 1}, 'rcCar')]),
]
OTHER_M = [('bagger', '袋詰め機', 150, 2, '同じ物5個 → 1袋（売値1.2倍）'), ('adit', '横穴掘削口', 500, 3, 'その深さの資源が出続ける（岩盤と岩盤の間に1つ）')]
FAC = [('spa', '温泉', 'お湯を使って、お客さんが車で来ます。帰る時にその場で料金。'), ('power', '発電所', 'お湯（地熱）か石油で発電して、その場で売電。'),
       ('refinery', '製油所', '石油2つから燃料1つ。燃料はヤードからトラックで売ります。'), ('museum', '博物館', '掘り当てた珍しい物を展示します。お客さんが来て入場料（展示の種類が多いほど高い）。2つ目からは売店で1.5倍で売ります。'),
       ('hc', 'ホームセンター', 'ヤードの製品を棚に並べます（種類ごとに10個まで）。お客さんが車で来て、出荷の1.5倍で買っていきます。')]
TOOLS = [('drill', 'ドリル', '地面を掘り進みます。掘った資源は後ろに出ます。'), ('fdrill', '高速ドリル', '速く掘るドリル。'), ('adrill', '自動ドリル', 'ふさがると自分で向きを変えるドリル。'),
         ('conv', 'コンベア', '資源を運びます。なぞって続けて置けます。'), ('sort', '仕分け', '選んだ資源だけを横へ出します。'), ('tee', 'T字路', '真ん中で左右に振り分けます。'), ('cross', '交差', '2つの流れを交差させます。'),
         ('tri', '三叉路', 'まっすぐ・左・右に、順番に均等に分けます。'), ('branch', 'ト字路', 'まっすぐと横に、順番に均等に分けます（横は左か右を選べます）。'), ('pipe', 'パイプライン', '湧き口と地上のタンクをつなぎます。'),
         ('elev', 'エレベーター', '作業員が上り下りする時、とても速くなります（ほかの物の上にも置けます）。'),
         ('lamp', '照明', '（研究の説明は「この設置物を置けるようになります。」だけ）ほかの物と別の層に置けます。周り2マスの作業が少し速くなります。'),
         ('vend', '自販機コーナー', '坑道の空いたマスに置きます。近く（1マス以内）を通ったり働いたりする作業員が、疲れていたら一息ついて1本買います（体力+25%・100）。同じ人は1分に1回まで。')]
RES = [('batch', 'まとめて強化', 10000, 6, '同じ種類の設備を、まとめてレベルアップできるようになります。'),
 ('sk:speed', '時間速度アップ', 800, 2, '時間の速さが1段ずつ速くなります（いちばん速くて約2.5倍）。上の ▶ を押すと切りかわります。'),
 ('sk:dragPlus', 'ドラッグ設置の強化', 1200, 1, 'コンベアをなぞると、なぞった向きにそろえて置けます（曲がり角もOK）。'),
 ('sk:hr', '人事力', 1500, 2, '新しく雇う人が Lv1 → Lv2 から始まります。'), ('sk:veteran', 'ベテラン教育', 2000, 3, '作業員のレベルが2倍の速さで上がります。'),
 ('sk:welfare', '福利厚生', 4000, 2, '作業員が疲れにくくなり、休憩も早く終わります。'), ('sk:black', 'ブラック企業', 5000, 2, '給料を2割安くします。'),
 ('sk:digLv', '掘削レベル', 250, 1, '硬い岩盤（10mにLv1、その後は10mごと）を1段ずつ破れるようになります（Lv0は会社レベル1で破れる）。'),
 ('sk:truck2', 'トラック増車', 8000, 3, 'トラックが1台増え、交代で出発します（何台でも増やせます。1台ごとに高くなる）。'),
 ('sk:speeding', 'スピード違反', 2000, 2, 'トラックが出かけている時間が半分になります。'), ('sk:beltMax', 'コンベア最高速アップ', 2500, 2, 'コンベアのレベル上限が1つ上がります。'),
 ('sk:autoHire', '人事部', 2000, 2, '持ち場に対して人が足りない時、自動で雇います（事務所でオン・オフ）。'),
 ('sk:autoUpg', '技術部', 5000, 3, 'お金にかなり余裕がある時、ときどき強化します。どれを強化するかは気まぐれです（事務所でオン・オフ）。'),
 ('sk:autoPrice', '営業部', 4000, 3, 'お金に余裕がある時、いちばん安い売値アップを自動で買います（事務所でオン・オフ）。'),
 ('sk:goldUp', '金の匂い', 2000, 2, '金が出やすくなります（1段ごとに+10%。これから掘る所から）。'), ('sk:diaUp', '暗闇の光', 4000, 2, 'ダイヤが出やすくなります（1段ごとに+10%。これから掘る所から）。'),
 ('sk:newTech', '新技術導入', 3000, 2, '加工機械が速くなります（1段ごとに+5%）。'), ('sk:bored', '飽き性', 1000, 1, '仕事の無い作業員が、早くほかの持ち場へ移ります（8秒 → 5秒 → 3秒 → 2秒）。'),
 ('sk:treasure', '人間国宝見学', 1000000, 3, '作業員の経験がたまる速さが上がります（1段ごとに+25%）。'), ('sk:statue', '社長像', 1000000000, 4, '事務所の前に、社長の銅像が建ちます。'),
 ('sk:garden', '屋上庭園', 10000000, 3, '事務所の屋上が森に。休憩が少し速くなります。'), ('sk:sortPlus', '仕分けコンベア改良', 20000, 3, '仕分けコンベアで、選ぶ資源を複数にできます。'),
 ('sk:sortPlus2', '仕分けコンベア改良2', 60000, 3, '仕分けコンベアで、選んだ資源「のみ」を横に出すか、選んだ資源「以外」を横に出すかを切りかえられます。'),
 ('sk:secAdv', '秘書の提案', 3000, 2, '右下に秘書が出て、詰まり・溜まった材料・会社レベルなどを提案します（吹き出しをタップで、その場所へ）。'),
 ('sk:oilScan', '油田探索', 30000, 3, '今の深さから下を調べて、石油の湧く場所を地図に印します。研究するたびに、調べる深さがのびます。'),
 ('sk:warehouse', '事務所倉庫', 10000000, 4, '事務所に倉庫の部屋ができます。社長の私物（？）を置けるようになります。'),
 ('sk:trip', '最高の社員旅行', 50000000, 6, '社員旅行の計画が始まります。必要な材料を事務所倉庫に集めましょう。社長が自分でヤードから運びます。事務所の真下まで地下からコンベアをつないでも運び込めます。'),
 ('sk:build', '建造', 200000000, 8, '事務所を、宇宙へ行ける形に作り直します。'), ('sk:depart', '出発', 500000000, 3, '事務所に「出発」ボタンができます。'),
 ('sk:conne', 'コネ採用', 5000, 2, '雇える人数が増えます（1段ごとに+10%・最低+2人。最大200人）。'),
 ('sk:vein', '鉱脈探知', 3000, 2, '地面の中の鉱脈が、灰色の粒で見えるようになります（掘り始めると資源の色に）。珍しい物（化石・埴輪など）も出やすくなります（1段ごとに+25%）。'),
 ('sk:labRoom', '研究室の増室', 1000, 3, '研究室が1つ増え、同時に研究できる数が増えます（最大4室）。研究所にいる研究員の数だけ、並んで進みます。'),
 ('sk:yardPlus', 'ヤード拡張', 1500, 2, 'トラックへの積み込みが2倍速くなり、ヤードに同時に入れるトラックが1台増えます（3台→4台）。'),
 ('sk:land', '土地買収', 150000, 2, '自分の土地が左右に1マスずつ広がります（研究するごとに高くなる）。'),
 ('sk:auto', '自動化', 5000, 2, '人がいない機械とフォークリフトも、わずかに動くようになります（×0.02 → ×0.035 → ×0.05）。人がいると、ずっと速く動きます。'),
 ('sk:away', '放置時間延長', 300, 1, '留守の間も工場が動く時間が、30分のびます（最初は30分・最大1日）。※実際は「1時間＋研究ごとに1時間」になっている（説明と合っていない）'),
]
RES_COST = {'t:vend': 1200, 't:lamp': 2000, 't:elev': 300, 't:fdrill': 800, 't:adrill': 1500, 't:tee': 300, 't:cross': 400, 't:pipe': 200, 't:branch': 600, 't:tri': 900,
            'm:chem': 15000, 'm:assembler': 20000, 'm:sieve': 800, 'm:roller': 3000, 'm:caster': 3500, 'm:glassF': 2500, 'm:metalwork': 6000, 'm:adit': 800, 'm:smelter': 600, 'm:bagger': 500,
            'm:factory': 1500, 'm:washer': 1200, 'm:cutter': 1800, 'm:polisher': 2500, 'm:drawer': 1500, 'm:atelier': 5000, 'f:spa': 1500, 'f:power': 2000, 'f:refinery': 3000, 'f:museum': 20000, 'f:hc': 25000}

def label(i):
    if i.startswith('m:'):
        for m in M:
            if m[0] == i[2:]: return m[1]
        for m in OTHER_M:
            if m[0] == i[2:]: return m[1]
    if i.startswith('t:'):
        for t in TOOLS:
            if t[0] == i[2:]: return t[1]
    if i.startswith('f:'):
        for f in FAC:
            if f[0] == i[2:]: return f[1]
    for r in RES:
        if r[0] == i or r[0] == 'sk:' + i[3:]: return r[1]
    return i
kind = lambda i: '機械' if i.startswith('m:') else '設置物' if i.startswith('t:') else '施設' if i.startswith('f:') else '研究'

# ---- 現在の仕様.txt ----
L = []
L.append('■ ほりほり工場　現在の仕様（v1.66・2026-11-28）')
L.append('（tools/make_docs.py で作成。数値は main.js から写したもの。仕様を変えたら書き直す）')
L.append('')
L.append('━━ 会社レベルと解放の順番（表示のレベル。0から始まる） ━━')
L.append('会社レベルを上げる値段：' + ' → '.join(f'Lv{i}→{i + 1}：{c:,}' for i, c in enumerate(OFF_COST)) + '（その先は前の段×offCostG）')
L.append('会社レベル0：ドリル・コンベア・仕分け・レンガ焼成機・事務所（雇う）・トラック・フォークリフト')
by = {}
for i, lv in CO.items():
    if i.startswith('sk:') and i[3:] in COSK: continue   # 何段もある研究は下で段ごとに
    by.setdefault(lv - 1, []).append(i)
for k, v in COSK.items():
    for j, lv in enumerate(v): by.setdefault(lv - 1, []).append(f'sk:{k}（{j + 1}段目）')
for lv in sorted(by):
    items = '・'.join(f'{label(i.split("（")[0])}{"（" + i.split("（")[1] if "（" in i else ""}［{kind(i)}］' for i in sorted(by[lv]))
    L.append(f'会社レベル{lv}：{items}')
L.append('（研究所は会社レベル1から建てられる。研究で手に入る物は、会社レベルで「研究できる」ようになり、研究が終わると使える）')
L.append('')
L.append('━━ 深さと資源 ━━')
L.append('岩盤の段（地表から何マス下）：' + '・'.join(f'岩盤{i}＝{d}段（{d * 3}m）' for i, d in enumerate(BR)))
for a, b in DEPTH: L.append(f'{a}：' + '・'.join(NAME.get(x, x) for x in b))
L.append('岩盤は「その段で予想される平均的な作業員が乗ったドリル」で約24時間（ROCK_G 4300）。会社レベル1で岩盤0、研究「掘削レベル」で1段ずつ')
L.append('')
L.append('━━ 資源・製品（売値の基本） ━━')
L.append('原料：' + '・'.join(f'{NAME[k]} {VAL[k]}' for k in RAW))
L.append('製品：' + '・'.join(f'{n} {v:,}' for k, n, v in ITEMS if k not in RAW and k not in ('ammonite', 'fossil', 'haniwa', 'rareMin', 'relic', 'mummy')))
L.append('珍品：' + '・'.join(f'{n} {v:,}' for k, n, v in ITEMS if k in ('ammonite', 'fossil', 'haniwa', 'rareMin', 'relic', 'mummy')))
L.append('')
L.append('━━ 機械と作り方 ━━')
for mid, n, c, t, rs in M:
    L.append(f'{n}（{c:,}・{t}秒）：' + ' / '.join('＋'.join(f'{NAME[a]}×{b}' for a, b in ins.items()) + '→' + NAME[o] for ins, o in rs))
for mid, n, c, t, d in OTHER_M: L.append(f'{n}（{c:,}・{t}秒）：{d}')
L.append('')
L.append('━━ 地上の施設 ━━')
for f, n, d in FAC: L.append(f'{n}：{d}')
L.append('')
L.append('━━ 人と乗り物（決まり） ━━')
L.append('・ドリル・機械・フォークリフト・トラックは作業員が必要（はじめの手順の間と、研究「自動化」の後は、人がいなくても少し動く）。ドリルは人がいなくても×0.05で動く')
L.append('・仕事の無い持ち場に8秒（飽き性で最短2秒）いたら、仕事のある空いた持ち場へ移る。先が詰まって4秒進まない時も同じ（v1.60）')
L.append('・Lv2以上は、研究所・フォークリフト・トラックを先に選ぶ。Lv1も、運ぶ物のあるフォークリフト・積んだトラックには乗る')
L.append('・プラスチックは石炭×2から（石油は地上のタンクにたまるだけで、ベルトには乗らないため）')
open(os.path.join(dst, '現在の仕様.txt'), 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')

# ---- 説明文一覧.txt（書き直し用） ----
D = ['■ ひとこと説明文の一覧（書き直し用・v1.66）', '書き方：「新：」の後ろに新しい文を書いてください。空のままなら今のまま。', '機械の説明は作り方（材料→製品）を自動で出しています。', '']
D.append('━━ 設置物 ━━')
for t, n, d in TOOLS: D += [f'【{n}】（t:{t}）', f'今：{d}', '新：', '']
D.append('━━ 地上の施設 ━━')
for f, n, d in FAC: D += [f'【{n}】（f:{f}）', f'今：{d}', '新：', '']
D.append('━━ 研究 ━━')
for i, n, c, mo, d in RES: D += [f'【{n}】（{i}・{c:,}・{mo}か月）', f'今：{d}', '新：', '']
D.append('━━ 機械（参考：作り方が説明になる。ひとこと足したい時だけ） ━━')
for mid, n, c, t, rs in M: D += [f'【{n}】（m:{mid}）', '今：' + ' / '.join('＋'.join(f'{NAME[a]}×{b}' for a, b in ins.items()) + '→' + NAME[o] for ins, o in rs), '新：', '']
open(os.path.join(dst, '説明文一覧.txt'), 'w', encoding='utf-8', newline='\n').write('\n'.join(D) + '\n')

# ---- 加工チェーン.png（原料 → 製品の段で並べる） ----
edges = []   # (材料, 製品, 機械)
for mid, n, c, t, rs in M:
    for ins, o in rs:
        for a in ins: edges.append((a, o, n))
lvl = {k: 0 for k in RAW}
for _ in range(10):
    for a, o, n in edges:
        if a in lvl and o not in RAW: lvl[o] = max(lvl.get(o, 0), lvl[a] + 1)
cols = {}
for k, v in lvl.items(): cols.setdefault(v, []).append(k)
order = [k for k, n, v in ITEMS]
for v in cols: cols[v].sort(key=order.index)
font = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', 15); fs = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', 11); fb = ImageFont.truetype('C:/Windows/Fonts/meiryob.ttc', 22)
CW, RH, BW, BH, TOP = 260, 44, 180, 30, 80
H = TOP + max(len(v) for v in cols.values()) * RH + 80
W = 60 + (max(cols) + 1) * CW
img = Image.new('RGB', (W, H), (250, 249, 245)); d = ImageDraw.Draw(img)
d.text((30, 20), 'ほりほり工場　加工チェーン（v1.66・左が原料、右へ行くほど加工）', font=fb, fill=(40, 40, 50))
pos = {}
for v, ks in cols.items():
    for i, k in enumerate(ks): pos[k] = (40 + v * CW, TOP + i * RH)
MC = {}
pal = [(208, 74, 58), (63, 124, 196), (90, 160, 90), (200, 140, 40), (140, 90, 180), (60, 150, 160), (180, 90, 120), (120, 120, 60), (90, 90, 90)]
LANE = {}
for i, (mid, n, c, t, rs) in enumerate(M): MC[n] = pal[i % len(pal)]; LANE[n] = i
for a, o, n in edges:
    if a not in pos or o not in pos: continue
    x1, y1 = pos[a][0] + BW, pos[a][1] + BH // 2; x2, y2 = pos[o][0], pos[o][1] + BH // 2
    mx = x1 + 8 + LANE[n] * 4   # 機械ごとに縦の線の位置をずらす（重ならない）
    d.line([(x1, y1), (mx, y1), (mx, y2), (x2, y2)], fill=MC[n], width=2)
for k, (x, y) in pos.items():
    raw = k in RAW
    d.rounded_rectangle([x, y, x + BW, y + BH], radius=6, fill=(255, 244, 214) if raw else (255, 255, 255), outline=(120, 120, 130))
    d.text((x + 8, y + 5), NAME[k], font=font, fill=(30, 30, 40)); d.text((x + BW - 6, y + 9), f'{VAL[k]:,}', font=fs, fill=(130, 130, 140), anchor='ra')
# 凡例（線の色＝機械）
ly = H - 62
lx = 30
d.text((30, ly - 20), '線の色＝その製品を作る機械', font=fs, fill=(90, 90, 100))
for n, col in MC.items():
    w = 26 + int(d.textlength(n, font=fs)) + 16
    if lx + w > W - 20: lx = 30; ly += 22
    d.line([(lx, ly + 8), (lx + 22, ly + 8)], fill=col, width=3); d.text((lx + 26, ly), n, font=fs, fill=(60, 60, 70)); lx += w
img.save(os.path.join(dst, '加工チェーン.png'))
print('ok', W, H)
