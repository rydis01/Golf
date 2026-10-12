#!/usr/bin/env python3
"""Export a single HTML prototype; bundled assets/data need no Java server or CDNs."""
from pathlib import Path
import json
import re
from html import escape

root = Path(__file__).resolve().parent.parent
web = root/'mobile/www'
html = (web/'index.html').read_text()
data = {'metadata': json.loads((web/'data/national.json').read_text()), 'boundary': json.loads((web/'data/national-boundary.json').read_text())}
geometry = web/'data/national-geometry.json'
if geometry.exists(): data['geometry'] = json.loads(geometry.read_text())
bootstrap = 'window.GOLF_PROTOTYPE=true;window.GOLF_BUNDLED_DATA='+json.dumps(data,ensure_ascii=False)+';\n'
html = html.replace('<title>Golf Caddie</title>', '<title>Golf Caddie · Öppningsbar prototyp</title>')
html = html.replace('FÖRSTA VERSIONEN', 'ÖPPNINGSBAR PROTOTYP')
html = html.replace('<a class="text-button" href="privacy.html">Integritet & datakällor</a>', '<span>Kartbilder: OSM/Esri · väder: Open-Meteo · GPS efter ditt godkännande</span>')
licenses = '\n\n'.join((web/p).read_text() for p in ['vendor/LEAFLET-LICENSE.txt','vendor/CAPACITOR-LICENSE.txt'])
notice = '<details class="prototype-info"><summary>Om den här prototypen och dina uppgifter</summary><p>Beräkningen körs lokalt i webbläsaren med en testad kopia av Java-appens startmodell. Ingen Java-server behövs. Satellitplattor och nytt väder behöver internet; den stiliserade banvyn är inbakad. Originalbilderna från banguiden ligger i projektets guides-mapp. GPS startar efter ditt godkännande och kan stoppas med Placera själv. Väder-/höjdkoordinater skickas direkt till Open-Meteo; kartleverantörerna OSM/Esri får din IP-adress och de kartområden som visas. Vald bana, tee och aktuellt hål sparas på din enhet. Flaggpositioner, kikarmått och slaghistorik sparas inte mellan sessioner. En eventuell API-adress sparas bara på din enhet.</p><p>Par, HCP och teeavstånd kommer från The Nationals officiella webbplats. Geografiska banformer är OpenStreetMap-data, © OpenStreetMap contributors, ODbL 1.0. Exemplet på 160 m är två valda punkter, inte ett officiellt hål eller dagens flagga. Modellen behöver kalibreras mot dina slag.</p><details><summary>Programbibliotekens licenser</summary><pre style="white-space:pre-wrap;font-size:11px">'+escape(licenses)+'</pre></details></details>'
html = html.replace('</main>',notice+'</main>')

# Editable version: use the project's actual CSS and JavaScript files directly.
editable = re.sub(r'(href|src)="((?:vendor/|style\.css|config\.js|landing-advisor\.js|hole-view\.js|app\.js)[^"]*)"', lambda m: m[1]+'="../mobile/www/'+m[2]+'"', html)
editable = editable.replace('<script defer src="../mobile/www/app.js"></script>', '<script defer src="../scripts/prototype-model.js"></script><script defer src="../mobile/www/app.js"></script>')
editable = editable.replace('</head>', '<script>'+bootstrap.replace('</script','<\\/script')+'</script></head>')
editable = editable.replace('window.GOLF_PROTOTYPE=true;', 'window.GOLF_PROTOTYPE=true;window.GOLF_ASSET_BASE="../mobile/www/";')
editable_path = root/'prototype/index.html'
editable_path.parent.mkdir(exist_ok=True)
editable_path.write_text(editable)

# Portable version: one HTML file, including source assets, facts and licenses.
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>\n'+(web/m[1]).read_text()+'\n</style>', html)
sources = [web/'vendor/leaflet.js',web/'vendor/capacitor.js',web/'config.js',root/'scripts/prototype-model.js',web/'landing-advisor.js',web/'hole-view.js',web/'app.js']
scripts = bootstrap + '\n;\n'.join(p.read_text() for p in sources)
html = re.sub(r'<script defer src="[^"]+"></script>', '', html)
html = html.replace('</body>', '<script>\n'+scripts.replace('</script','<\\/script')+'\n</script></body>')
for out in [root/'golf-caddie-prototyp.html', root/'.runtime/golf-caddie-prototyp.html']:
    out.parent.mkdir(exist_ok=True)
    out.write_text(html)
    print('Exported:',out,'('+str(out.stat().st_size)+' bytes)')
print('Editable prototype:',editable_path)
