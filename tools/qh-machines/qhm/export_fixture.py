"""Compresses qh_steps.json (steps_info.py) into tests/fixtures/qh-steps.json: the tile (wp) of each Quest Helper step and the id of the NPC/object of the first argument.
The test tests/questMachines.test.ts checks the tiles and the highlight of the stage lines against it."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8')
from paths import FIXTURE  # noqa: E402


def main():
    qh = json.load(open(os.path.join(HERE, 'qh_steps.json'), encoding='utf-8'))
    rev = ''
    try:
        from paths import WORK
        rev = open(os.path.join(WORK, 'QH_REVISION.txt'), encoding='utf-8').read().split()
    except OSError:
        pass
    note = 'Zoinkwiz/quest-helper' + (', commit %s of %s' % (rev[0][:7], rev[1][:10]) if len(rev) >= 2 else '') + \
        ': the tile (wp) and the id of the first argument of a step, extracted from the quest sources'
    out = {'source': note, 'steps': {}}
    n = 0
    for sid, steps in qh.items():
        d = {}
        for leaf, info in steps.items():
            if not info.get('wp'):
                continue
            d[leaf] = {'typ': info['typ'], 'wp': info['wp']}
            if info['typ'] in ('NpcStep', 'ObjectStep') and info.get('ids'):
                d[leaf]['id'] = info['ids'][0]
            n += 1
        if d:
            out['steps'][sid] = d
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    open(FIXTURE, 'w', encoding='utf-8', newline='\n').write(text)
    print('steps with a tile:', n, '→', FIXTURE, len(text), 'bytes')


if __name__ == '__main__':
    main()
