#!/usr/bin/env python3
"""Convert real OSM geometry to a GPS-aligned vector course map. Never infer hole IDs."""
from datetime import datetime, timezone
from pathlib import Path
import json
import sys
import subprocess
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
osm = ET.parse(source).getroot()
nodes = {node.get('id'): [float(node.get('lon')), float(node.get('lat'))] for node in osm.findall('node')}
course_by_member = {}
for relation in osm.findall('relation'):
    tags = {t.get('k'): t.get('v') for t in relation.findall('tag')}
    if tags.get('golf') != 'course': continue
    identity = 'lakes' if 'lakes' in tags.get('name', '').lower() else 'links' if 'links' in tags.get('name', '').lower() else 'unassigned'
    for member in relation.findall('member'): course_by_member[(member.get('type'), member.get('ref'))] = identity
features = []
for way in osm.findall('way'):
    tags = {t.get('k'): t.get('v') for t in way.findall('tag')}
    if not ('golf' in tags or tags.get('leisure') == 'golf_course' or tags.get('natural') in ['water', 'wood'] or tags.get('landuse') == 'forest' or tags.get('waterway') == 'stream'): continue
    references = [n.get('ref') for n in way.findall('nd')]
    if any(ref not in nodes for ref in references) or len(references) < 2: continue
    coordinates = [nodes[ref] for ref in references]
    polygon = references[0] == references[-1] and tags.get('golf') != 'hole'
    features.append({'type': 'Feature', 'id': 'way/' + way.get('id'),
                     'properties': {'tags': tags, 'course': course_by_member.get(('way', way.get('id')), 'unassigned')},
                     'geometry': {'type': 'Polygon' if polygon else 'LineString', 'coordinates': [coordinates] if polygon else coordinates}})
data = {'type': 'FeatureCollection', 'source': 'OpenStreetMap API', 'sourceUrl': 'https://www.openstreetmap.org/way/34563422',
        'attribution': '© OpenStreetMap contributors · ODbL 1.0', 'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'center': [55.5690857,13.1887799], 'features': features,
        'notice': 'GPS-geometri från OSM. Hållinjer identifieras endast genom källans banrelation. Dagens flaggposition ingår inte.'}
path = root/'mobile/www/data/national-geometry.json'
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')
holes = [f for f in features if f['properties']['tags'].get('golf') == 'hole']
for course in ['links','lakes']:
    known = [f for f in holes if f['properties']['course'] == course]
    print(course, len(known), 'identified hole centerlines')
print('Wrote',len(features),'real vector features;',path.stat().st_size,'bytes')

# Preserve the separately documented guide cross-reference after an OSM refresh.
if (root/'mobile/www/data/national-links-routing.json').exists():
    subprocess.run([sys.executable, str(root/'scripts/import-links-routing.py')], check=True)
