"""Сверка подсветки: id NPC/объекта шага Quest Helper против hl.npc / hl.obj нашей строки."""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import MACHINES, STAGES  # noqa: E402
steps = json.load(open(STAGES, encoding='utf-8'))['quests']
qh = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qh_steps.json'), encoding='utf-8'))
miss_npc, miss_obj, extra, ok = [], [], [], 0
kinds = {}
for sid, q in steps.items():
    info = qh.get(sid, {})
    for si, st in enumerate(q['stages']):
        for li, line in enumerate(st['do']):
            k = line.get('k')
            qs = info.get(k) if k else None
            if not qs:
                continue
            typ = qs['typ']
            kinds[typ] = kinds.get(typ, 0) + 1
            hl = line.get('hl') or {}
            ids = qs.get('ids') or []
            if typ == 'NpcStep' and ids:
                have = set(hl.get('npc') or [])
                if ids[0] in have:
                    ok += 1
                else:
                    miss_npc.append((sid, si + 1, li + 1, k, 'QH npc', ids[0], 'у нас', sorted(have), line.get('s')))
            elif typ in ('ObjectStep',) and ids:
                have = set(hl.get('obj') or [])
                if ids[0] in have:
                    ok += 1
                else:
                    miss_obj.append((sid, si + 1, li + 1, k, 'QH obj', ids[0], 'у нас', sorted(have), line.get('s')))
print('типы шагов в сверке:', kinds)
print('совпало', ok)
print('NPC не подсвечен:', len(miss_npc))
for r in miss_npc:
    print(' ', r)
print('объект не подсвечен:', len(miss_obj))
for r in miss_obj:
    print(' ', r)
