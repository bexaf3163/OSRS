"""Сжимает qh_steps.json (steps_info.py) в tests/fixtures/qh-steps.json: клетка (wp) каждого шага Quest Helper и id NPC/объекта первого аргумента.
Тест tests/questMachines.test.ts сверяет с ним клетки и подсветку строк этапов."""
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
    note = 'Zoinkwiz/quest-helper' + (', коммит %s от %s' % (rev[0][:7], rev[1][:10]) if len(rev) >= 2 else '') + \
        ': клетка (wp) и id первого аргумента шага, извлечённые из исходников квестов'
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
    print('шагов с клеткой:', n, '→', FIXTURE, len(text), 'байт')


if __name__ == '__main__':
    main()
