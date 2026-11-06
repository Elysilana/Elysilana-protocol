"""Gate helper: every palette token must be an exact real pixel of its named source asset."""
import re, sys
from PIL import Image
tok = open('src/tokens.css', encoding='utf8').read()
SRC = {
 'bg': ('reference/SAMPUL ELYSILANA JPG.jpg.jpeg', 38, 0),
 'panel': ('brand/LOGO ELYSILANA PNG.png', 0, 0),
 'mint': ('brand/LOGO ELYSILANA PNG...png', 1150, 461),
 'ink': ('reference/SAMPUL ELYSILANA JPG.jpg.jpeg', 568, 139),
 'muted': ('reference/SAMPUL ELYSILANA JPG.jpg.jpeg', 396, 355),
 'line': ('brand/LOGO ELYSILANA JPG.jpg.jpeg', 1238, 463),
 'soft': ('brand/LOGO ELYSILANA JPG.jpg.jpeg', 1122, 588),
 'deep': ('reference/SAMPUL ELYSILANA JPG.jpg.jpeg', 1308, 5),
}
declared = dict(re.findall(r'--color-(\w+):\s*(#[0-9a-f]{6})', tok))
bad = 0
for k, v in declared.items():
    if k not in SRC: print('FAIL no provenance for', k); bad += 1; continue
    f, x, y = SRC[k]
    px = Image.open(f).convert('RGBA').getpixel((x, y))
    got = '#%02x%02x%02x' % px[:3]
    ok = got == v
    print(('ok  ' if ok else 'FAIL'), k, v, 'pixel', (x, y), 'of', f, '->', got); bad += not ok
sys.exit(1 if bad else 0)
