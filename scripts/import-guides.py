#!/usr/bin/env python3
"""Import the 36 original hole guide images linked by The National. No image editing."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import json
import re
import struct

root = Path(__file__).resolve().parent.parent
headers = {'User-Agent': 'GolfCaddie/0.1 (https://github.com/rydis01/Golf)'}
class GuideImages(HTMLParser):
    def __init__(self, course):
        super().__init__(); self.course = course; self.images = {}
    def handle_starttag(self, tag, attrs):
        if tag != 'img': return
        src = dict(attrs).get('src', '')
        if urlsplit(src).hostname != 'thenational.se': return
        match = re.search(r'/' + self.course + r'[_-]?(\d{1,2})(?:-\d+)?\.(png|webp)$', src, re.I)
        if match: self.images[int(match[1])] = src

metadata_path = root/'mobile/www/data/national.json'
metadata = json.loads(metadata_path.read_text())
jobs = []
for course in metadata['courses']:
    with urlopen(Request(course['source'], headers=headers), timeout=30) as response:
        parser = GuideImages(course['id']); parser.feed(response.read().decode())
    assert sorted(parser.images) == list(range(1, 19)), f"Incomplete guide image list: {course['id']}"
    jobs.extend((course, hole, parser.images[hole['number']]) for hole in course['holes'])

def download(job):
    course, hole, url = job
    with urlopen(Request(url, headers=headers), timeout=35) as response: image = response.read()
    suffix = '.png' if image.startswith(b'\x89PNG\r\n\x1a\n') else '.webp' if image[:4] == b'RIFF' and image[8:12] == b'WEBP' else None
    if not suffix: raise ValueError('Guide URL did not return a supported image')
    relative = f"guides/{course['id']}-{hole['number']:02d}{suffix}"
    destination = root/'mobile/www'/relative
    destination.parent.mkdir(exist_ok=True); destination.write_bytes(image)
    guide = {'sourceUrl': url, 'localPath': relative, 'sha256': sha256(image).hexdigest(),
             'attribution': 'The National · officiell banguide', 'fetchedAt': datetime.now(timezone.utc).isoformat(),
             'georeferenced': False}
    if suffix == '.png': guide['width'], guide['height'] = struct.unpack('>II', image[16:24])
    hole['guide'] = guide
    return len(image)

with ThreadPoolExecutor(max_workers=4) as pool: sizes = list(pool.map(download, jobs))
metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
print(f'Imported {len(sizes)} original guide images, {sum(sizes)/1024/1024:.1f} MiB. No geographic placement was invented.')
