"""Build a conservative surface subset from a pinned, licensed collision dump, never map imagery."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

PIN = '375ce2c061df5c3961116dda6443f307df3223f1'
ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True, help='External Skretzo/shortest-path checkout')
args = parser.parse_args()
revision = subprocess.check_output(['git', '-C', str(args.source), 'rev-parse', 'HEAD'], text=True).strip()
if revision != PIN:
    raise SystemExit(f'Expected reviewed collision format {PIN}, got {revision}; review source before changing the pin')
license_text = (args.source / 'LICENSE').read_text(encoding='utf-8')
if 'BSD 2-Clause License' not in license_text:
    raise SystemExit('Reviewed source license missing')
archive = args.source / 'src/main/resources/collision-map.zip'
committed = subprocess.check_output(['git', '-C', str(args.source), 'show', f'{PIN}:src/main/resources/collision-map.zip'])
if archive.read_bytes() != committed:
    raise SystemExit('Collision resource differs from the pinned commit; refusing unreviewed topology')
regions = []
with zipfile.ZipFile(archive) as source:
    for name in sorted(source.namelist()):
        x, y = map(int, name.split('_'))
        # A limited mainland surface rectangle, south of the Wilderness. No implicit membership/access claims.
        if not (45 <= x < 53 and 47 <= y < 55):
            continue
        bits = source.read(name)
        if not bits:
            continue
        # Upstream SplitFlagMap: four little-endian bits per tile, 64*64 tiles per plane.
        surface = bits[:2048].ljust(2048, b'\0')
        regions.append({'x': x, 'y': y, 'bits': base64.b64encode(surface).decode('ascii')})
if not regions:
    raise SystemExit('No surface collision coverage')
out = {'source': {'repository': 'https://github.com/Skretzo/shortest-path', 'revision': revision,
                  'resource': 'src/main/resources/collision-map.zip', 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                  'license': 'BSD-2-Clause', 'cacheRevision': None, 'format': 'SplitFlagMap: N/E movement + N/E structural walls, four bits per tile'},
       'coverage': 'Limited mainland surface; structural walls/doors blocked, no transports, instances or Wilderness',
       'regions': regions}
(ROOT / 'src/data/generated/worldRouting.json').write_text(json.dumps(out, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Written {len(regions)} surface regions; conditional edges stay unsupported')
