"""Собирает src/data/questMachines.json из исходников Quest Helper (рабочая папка work/, её наполняет fetch_qh.py).
  python qhm/build_machines.py           записать файл
  python qhm/build_machines.py --check   только сравнить с тем, что лежит в репозитории (код возврата 1, если отличается)"""
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
        print('%-6s %-18s этапов %-3d узлов %-3d условий %-3d «не знаю» %d' % (sid, q['cls'], len(q['stages']), len(q['nodes']), len(q['reqs']), unknown))
    return json.dumps({'v': 1, 'quests': machines}, ensure_ascii=False, separators=(',', ':')) + '\n'


def main():
    text = render()
    if '--check' in sys.argv:
        cur = open(MACHINES, encoding='utf-8', newline='').read()
        if cur == text:
            print('questMachines.json совпадает с исходниками')
            return 0
        print('questMachines.json ОТЛИЧАЕТСЯ от того, что получается из исходников (%d и %d байт)' % (len(cur), len(text)))
        return 1
    open(MACHINES, 'w', encoding='utf-8', newline='\n').write(text)
    print('записано', MACHINES, len(text), 'байт')
    return 0


if __name__ == '__main__':
    sys.exit(main())
