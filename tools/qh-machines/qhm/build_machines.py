"""Builds src/data/questMachines.json from the Quest Helper sources (the work/ folder, filled by fetch_qh.py).
  python qhm/build_machines.py           write the file
  python qhm/build_machines.py --check   only compare with what lies in the repository (exit code 1 if it differs)"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8')
import build  # noqa: E402
import quests as C  # noqa: E402
from paths import MACHINES  # noqa: E402


def render():
    machines = {}
    for sid in C.QUESTS:
        q = build.build_quest(sid)
        machines[sid] = {'stages': dict(q['stages']), 'nodes': q['nodes'], 'reqs': q['reqs'], 'alias': q['alias']}
        unknown = sum(q['unknown'].values())
        print('%-6s %-18s stages %-3d nodes %-3d conditions %-3d "unknown" %d' % (sid, q['cls'], len(q['stages']), len(q['nodes']), len(q['reqs']), unknown))
    return json.dumps({'v': 1, 'quests': machines}, ensure_ascii=False, separators=(',', ':')) + '\n'


def main():
    text = render()
    if '--check' in sys.argv:
        cur = open(MACHINES, encoding='utf-8', newline='').read()
        if cur == text:
            print('questMachines.json matches the sources')
            return 0
        print('questMachines.json DIFFERS from what the sources give (%d and %d bytes)' % (len(cur), len(text)))
        return 1
    open(MACHINES, 'w', encoding='utf-8', newline='\n').write(text)
    print('written', MACHINES, len(text), 'bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
