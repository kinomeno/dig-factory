# v1.99 アイコン：白地に秘書の顔（ゲームの点の並び secface.json）。
# アプリ（ホーム画面）＝顔が右下からのぞく＋吹き出し「ほりほり」（案B）／ブラウザのタブ（ファビコン）＝顔をまん中に大きく（案C）
# 使い方：py -3 tools/make_icons_sec.py （app フォルダで実行）→ icons/ と favicon.svg に書き出す
from PIL import Image, ImageDraw, ImageFont
import json, os
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'icons')
PX = json.load(open(os.path.join(here, 'secface.json'), encoding='utf-8'))
FONT = r'C:\Windows\Fonts\YuGothB.ttc'

def face(scale):
    im = Image.new('RGBA', (16 * scale, 16 * scale), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, c in enumerate(PX):
        if c: x, y = i % 16, i // 16; d.rectangle([x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1], fill=c)
    return im

def bubble(im, tipx, tipy, text, fs):   # ゲームの吹き出しと同じ形
    d = ImageDraw.Draw(im); font = ImageFont.truetype(FONT, fs)
    w = d.textlength(text, font=font) + fs * 0.9; h = fs * 1.5; lw = max(3, fs // 13); line = (0, 0, 0, 140)
    bx = tipx - w * 0.25; by = tipy - h - fs * 0.5
    d.rounded_rectangle([bx, by, bx + w, by + h], radius=h * 0.35, fill='white', outline=line, width=lw)
    d.polygon([(tipx - fs * 0.32, by + h - lw), (tipx, tipy), (tipx + fs * 0.32, by + h - lw)], fill='white')
    d.line([(tipx - fs * 0.32, by + h - 1), (tipx, tipy), (tipx + fs * 0.32, by + h - 1)], fill=line, width=lw)
    d.text((bx + w / 2, by + h / 2 + 2), text, font=font, fill='#333333', anchor='mm')

S = 512
app = Image.new('RGBA', (S, S), 'white'); f = face(30); app.alpha_composite(f, (S - f.width + 40, S - f.height + 120)); bubble(app, 130, 190, 'ほりほり', 58)
for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]:
    app.resize((size, size), Image.LANCZOS).convert('RGB').save(os.path.join(out, name))
# マスク用（丸く切られても大丈夫なように、まわりに白い余白）
pad = Image.new('RGBA', (S, S), 'white'); small = app.resize((int(S * 0.78), int(S * 0.78)), Image.LANCZOS); pad.alpha_composite(small, ((S - small.width) // 2, (S - small.height) // 2))
pad.convert('RGB').save(os.path.join(out, 'icon-maskable-512.png'))

# ファビコン（案C）：PNG と、くっきり表示用の SVG（点を四角で並べる）
fav = Image.new('RGBA', (S, S), 'white'); f2 = face(34); fav.alpha_composite(f2, ((S - f2.width) // 2, 40))
fav.resize((32, 32), Image.LANCZOS).convert('RGB').save(os.path.join(out, 'favicon-32.png'))
ox, oy, vw = -(S - f2.width) / 2 / 34, -40 / 34, S / 34   # 顔の升目で見た、見える範囲
rects = ''.join(f'<rect x="{i % 16}" y="{i // 16}" width="1.02" height="1.02" fill="{c}"/>' for i, c in enumerate(PX) if c)
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox:.3f} {oy:.3f} {vw:.3f} {vw:.3f}" shape-rendering="crispEdges"><rect x="{ox:.3f}" y="{oy:.3f}" width="{vw:.3f}" height="{vw:.3f}" fill="#fff"/>{rects}</svg>\n'
open(os.path.join(here, '..', 'favicon.svg'), 'w', encoding='utf-8', newline='\n').write(svg)
print('ok')
