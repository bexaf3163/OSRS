"""A check of our stage lines against the Quest Helper steps: the arrow tile (at) and the highlight (hl) against wp and the step id with the same key k."""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import MACHINES, STAGES  # noqa: E402
steps = json.load(open(STAGES, encoding='utf-8'))['quests']
qh = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qh_steps.json'), encoding='utf-8'))

far, plane, nopt, nohl, nok = [], [], [], [], []
total = 0
same = 0
for sid, q in steps.items():
    info = qh.get(sid, {})
    for si, st in enumerate(q['stages']):
        for li, line in enumerate(st['do']):
            k = line.get('k')
            total += 1
            if not k:
                nok.append((sid, si + 1, li + 1))
                continue
            qs = info.get(k)
            if qs is None:
                nok.append((sid, si + 1, li + 1, k, 'no such step in QH'))
                continue
            wp = qs.get('wp')
            at = line.get('at')
            if wp and at:
                d = max(abs(wp[0] - at[0]), abs(wp[1] - at[1]))
                if wp[2] != at[2]:
                    plane.append((sid, si + 1, li + 1, k, 'ours is floor %d, QH is %d' % (at[2], wp[2]), line.get('s')))
                elif d > 12:
                    far.append((d, sid, si + 1, li + 1, k, tuple(at), tuple(wp), qs['typ'], line.get('s')))
                else:
                    same += 1
            elif wp and not at:
                nopt.append((sid, si + 1, li + 1, k, 'we have no tile, QH has', wp, line.get('s')))
print('lines', total, 'matched by tile (≤12)', same)
print('\nFAR (> 12 tiles):', len(far))
for r in sorted(far, reverse=True):
    print(' ', r)
print('\nANOTHER FLOOR:', len(plane))
for r in plane:
    print(' ', r)
print('\nWE HAVE NO TILE, QH HAS ONE:', len(nopt))
for r in nopt:
    print(' ', r)
print('\nNO KEY / NOT IN QH:', len(nok))
for r in nok:
    print(' ', r)
