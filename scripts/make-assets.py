"""One-off asset pass: premultiplied resizes + favicon traced from the real pixel grid.
Run: python -I scripts/make-assets.py   (needs Pillow, numpy)"""
import re, numpy as np
from PIL import Image
tok = open('src/tokens.css', encoding='utf8').read()
col = lambda n: re.search(r'--color-%s:\s*(#[0-9a-f]{6})' % n, tok).group(1)
src = Image.open('brand/LOGO ELYSILANA PNG...png').convert('RGBA')
# transparent region is pure black (rgb 0,0,0 alpha 0): resize premultiplied so no dark fringe
def pm(im, n):
    return im.convert('RGBa').resize((n, n), Image.LANCZOS).convert('RGBA')
for n in (192, 512):
    pm(src, n).save('src/assets/logo-%d.png' % n, optimize=True)
pm(src, 512).save('brand/elysilana-logo.png', optimize=True)
# favicon: crop square around glyph, 32x32 box-average of alpha, threshold .5, run-length rows
a = np.array(src)[..., 3].astype(float) / 255
ys, xs = np.where(a > 0.5)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
side = max(x1 - x0, y1 - y0) * 1.18
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
L, T = int(round(cx - side / 2)), int(round(cy - side / 2)); S = int(round(side))
crop = Image.fromarray((a * 255).astype('uint8')).crop((L, T, L + S, T + S)).resize((32, 32), Image.BOX)
g = np.array(crop) >= 128
d = []
for y in range(32):
    x = 0
    while x < 32:
        if g[y, x]:
            s = x
            while x < 32 and g[y, x]: x += 1
            d.append('M%d %dh%dv1h-%dz' % (s, y, x - s, x - s))
        else: x += 1
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       '<rect width="32" height="32" rx="7" fill="%s"/><path fill="%s" d="%s"/></svg>\n') % (col('panel'), col('mint'), ''.join(d))
assert '--' not in svg
open('src/assets/favicon.svg', 'w', encoding='utf8').write(svg)
print('bbox', x0, y0, x1, y1, 'crop', L, T, S, 'lit', int(g.sum()), 'svg bytes', len(svg))
