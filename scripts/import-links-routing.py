#!/usr/bin/env python3
"""Add guide-cross-referenced Links display routes using unchanged OSM coordinates."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
data_path = root / 'mobile/www/data/national-geometry.json'
data = json.loads(data_path.read_text())
routing = json.loads((root / 'mobile/www/data/national-links-routing.json').read_text())
data['features'] = [f for f in data['features'] if not str(f.get('id', '')).startswith('links-guide/')]
by_id = {f['id']: f for f in data['features']}
metadata = json.loads((root / 'mobile/www/data/national.json').read_text())['courses'][0]

def center(feature):
    ring = feature['geometry']['coordinates'][0][:-1]
    return [sum(p[i] for p in ring) / len(ring) for i in range(2)]

for hole in routing['holes']:
    tee, green = by_id[hole['teeReference']], by_id[hole['greenReference']]
    assert tee['properties']['tags']['golf'] == 'tee'
    assert green['properties']['tags']['golf'] == 'green'
    number = hole['number']
    info = metadata['holes'][number - 1]
    data['features'].append({
        'type': 'Feature', 'id': 'links-guide/' + str(number),
        'properties': {'course': 'links', 'tags': {'golf': 'hole', 'ref': str(number), 'par': str(info['par'])},
                       'routingMethod': 'guide-cross-reference', 'sourceUrl': routing['sourceUrl'],
                       'teeReference': hole['teeReference'], 'greenReference': hole['greenReference'],
                       'approximate': True},
        'geometry': {'type': 'LineString', 'coordinates': [center(tee), center(green)]}
    })
data['linksRouting'] = {k: v for k, v in routing.items() if k != 'holes'}
data_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Added 18 Links display routes. Tee/green endpoints use original OSM polygon coordinates; no flags added.')
