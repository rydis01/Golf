#!/usr/bin/env python3
"""Build a standalone, installable iPhone PWA from the tested desktop prototype."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
from shutil import copy2

root = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(root/'scripts/export-prototype.py')], cwd=root, check=True)
html = (root/'golf-caddie-prototyp.html').read_text()
html = html.replace('window.GOLF_PROTOTYPE=true;', 'window.GOLF_PROTOTYPE=true;window.GOLF_LOCAL_ONLY=true;')
html = html.replace('Golf Caddie · Öppningsbar prototyp', 'Golf Caddie · iPhone')
html = html.replace('ÖPPNINGSBAR PROTOTYP', 'IPHONE · PÅ DIN TELEFON')
head = '''
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Golf Caddie">
<style>
.iphone-status{padding:12px 0 0;font-size:11px;color:#62725e;line-height:1.6}.iphone-status p{margin:3px 0}.iphone-install{padding:11px 14px;background:#eaf0de;border-radius:10px;margin:8px 0}.iphone-status button{font-size:11px;border:1px solid #bdcf9e;border-radius:7px;padding:6px 10px;background:white;color:#193d33}.topbar{height:auto;min-height:74px;padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:12px}body{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}
</style>
'''
html = html.replace('</head>', head+'</head>')
banner = '''<section class="iphone-status" aria-live="polite"><p id="offline-state">Förbereder appen för användning utan internet…</p><p>Beräkningen och hålvyn fungerar offline. Satellitbilder och nytt väder kräver internet.</p><div class="iphone-install" id="iphone-install">Installera: öppna i Safari → Dela → Lägg till på hemskärmen.</div><button id="install-update" hidden>Uppdatera appen</button></section>'''
html = html.replace('<main>', '<main>'+banner, 1)
html = html.replace('</body>', '<script src="install.js"></script></body>')
out = root/'iphone'
out.mkdir(exist_ok=True)
(out/'index.html').write_text(html)
(out/'.nojekyll').write_text('')
manifest = {'id': './', 'name': 'Golf Caddie · The National', 'short_name': 'Golf Caddie', 'lang': 'sv',
            'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'portrait-primary',
            'background_color': '#f5f5ef', 'theme_color': '#193d33',
            'description': 'Spelavstånd, GPS och manuell placering för Links och Lakes i Bara.',
            'icons': [{'src': f'icons/icon-{size}.png', 'sizes': f'{size}x{size}', 'type': 'image/png', 'purpose': 'any'} for size in [192, 512]]}
(out/'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
assets = ['index.html','install.js','manifest.webmanifest','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png']
metadata = json.loads((root/'mobile/www/data/national.json').read_text())
for course in metadata['courses']:
    for hole in course['holes']:
        if 'guide' not in hole: continue
        relative = hole['guide']['localPath']
        destination = out/relative
        destination.parent.mkdir(exist_ok=True)
        copy2(root/'mobile/www'/relative, destination)
        assets.append(relative)
digest = hashlib.sha256(b''.join((out/name).read_bytes() for name in assets)).hexdigest()[:16]
template = (root/'scripts/iphone-service-worker.js').read_text()
(out/'sw.js').write_text(template.replace('__CACHE_VERSION__', digest).replace('__GUIDE_ASSETS__', json.dumps(['./'+name for name in assets if name.startswith('guides/')])) )
print('iPhone app built:', out, 'cache version', digest)
