# アイコン・ファビコン・SNS用画像を作る（ドット絵をコードで描いて、拡大する）
# 使い方：py -3 tools/make_icons.py （app フォルダで実行）→ icons/ に書き出す
import os
from PIL import Image, ImageDraw, ImageFont

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'icons')
os.makedirs(out, exist_ok=True)

C = {
    's': (127, 184, 230), 'S': (169, 211, 242), 'g': (94, 143, 58), 'G': (122, 176, 74),
    'd': (168, 118, 63), 'D': (138, 94, 48), 'e': (110, 74, 38),
    'r': (208, 74, 58), 'R': (150, 50, 38), 'w': (200, 204, 210), 'W': (130, 136, 146),
    'y': (255, 211, 77), 'Y': (201, 160, 32), 'b': (174, 184, 198), 'B': (96, 106, 122),
    'k': (43, 43, 46), 'h': (239, 255, 98), 'f': (201, 181, 122), 'c': (122, 197, 201),
}

def scene(n=32, w=None, ox=0):
    """32×32 のドット絵：空・草・土、ドリルが下へ掘っている。金と銀の粒。上に作業員（w：横長にする時の幅、ox：ドリルの位置をずらす）"""
    w = w or n
    px = [['s'] * w for _ in range(n)]
    for y in range(n):
        for x in range(w):
            if y < 4: px[y][x] = 'S'
            elif y < 12: px[y][x] = 's'
            elif y == 12: px[y][x] = 'G'
            elif y == 13: px[y][x] = 'g'
            else: px[y][x] = 'D' if (x * 7 + y * 13) % 11 == 0 else ('e' if (x * 5 + y * 3) % 17 == 0 else 'd')
    P = lambda x, y, v: px[y].__setitem__(x + ox, v)
    # 掘った縦穴（ドリルの通り道）
    for y in range(12, 22):
        for x in range(12, 20): P(x, y, 'e')
    # ドリル本体（赤い箱）
    for y in range(13, 20):
        for x in range(11, 21): P(x, y, 'r')
    for x in range(11, 21): P(x, 13, 'R'); P(x, 19, 'R')
    for y in range(13, 20): P(11, y, 'R'); P(20, y, 'R')
    for x in range(13, 19): P(x, 15, 'k' if x in (13, 18) else 'W')
    # 刃（下向きの三角・すじ入り）
    for i, y in enumerate(range(20, 28)):
        half = 5 - (i * 5) // 8
        for x in range(16 - half - 1, 16 + half + 1):
            P(x, y, 'W' if (x + y) % 3 == 0 else 'w')
    # 金・銀の粒
    for (cx, cy, col, dk) in [(5, 24, 'y', 'Y'), (26, 21, 'b', 'B'), (24, 28, 'y', 'Y')]:
        for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1)]:
            P(cx + dx, cy + dy, col)
        P(cx + 1, cy + 1, dk)
    # 上に乗っている作業員（黄色いヘルメット）
    for (x, y, ch) in [(15, 8, 'h'), (16, 8, 'h'), (15, 9, 'f'), (16, 9, 'f'), (15, 10, 'c'), (16, 10, 'c'), (14, 11, 'c'), (17, 11, 'c'), (15, 11, 'c'), (16, 11, 'c'), (15, 12, 'k'), (16, 12, 'k')]:
        P(x, y, ch)
    img = Image.new('RGB', (w, n))
    for y in range(n):
        for x in range(w): img.putpixel((x, y), C[px[y][x]])
    return img

base = scene()
for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (32, 'favicon-32.png')]:
    base.resize((size, size), Image.NEAREST).save(os.path.join(out, name))
# マスク用（Androidの丸いアイコン）：まわりに余白を足す
pad = Image.new('RGB', (40, 40), C['s']); pad.paste(base, (4, 4))
for y in range(36, 40):
    for x in range(40): pad.putpixel((x, y), C['d'])
for y in range(0, 4):
    for x in range(40): pad.putpixel((x, y), C['S'])
pad.resize((512, 512), Image.NEAREST).save(os.path.join(out, 'icon-maskable-512.png'))

# SNS用（1200×630）：横長の場面（20倍）。空に題名、土に説明
W, H = 1200, 630
og = scene(32, 60, 2).resize((1200, 640), Image.NEAREST).crop((0, 0, W, H))
d = ImageDraw.Draw(og)
font_dir = 'C:/Windows/Fonts'
def font(name, size):
    try: return ImageFont.truetype(os.path.join(font_dir, name), size)
    except Exception: return ImageFont.load_default()
f1, f2, f3 = font('meiryob.ttc', 96), font('meiryob.ttc', 38), font('meiryob.ttc', 34)
x0 = 470
d.text((x0 + 4, 34 + 4), 'ほりほり工場', font=f1, fill=(60, 90, 130)); d.text((x0, 34), 'ほりほり工場', font=f1, fill=(255, 255, 255))
d.text((x0 + 4, 168), 'DIG FACTORY TYCOON', font=f2, fill=(40, 60, 90))
for t, y in [('掘って、運んで、加工して、売る。', 330), ('縦に掘り進む採掘経営ゲーム', 390), ('horihori.kinomeno.com', 540)]:
    d.text((x0 + 3, y + 3), t, font=f3, fill=(80, 50, 20)); d.text((x0, y), t, font=f3, fill=(255, 248, 230))
og.save(os.path.join(out, 'og.png'))
print('ok')
