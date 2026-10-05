"""Reachability of lines: for each quest variable value — which stage lines the machine can choose at all (the leaf, the name of the nested
conditional step or the parent from addSubSteps matches the line key k)."""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import MACHINES, STAGES  # noqa: E402
machines = json.load(open(MACHINES, encoding='utf-8'))['quests']
stages = json.load(open(STAGES, encoding='utf-8'))['quests']


def leaves(m, ref, path, out, seen):
    n = m['nodes'][ref] if isinstance(ref, str) else ref
    here = path + ([n['n']] if n.get('n') else [])
    if 's' in n:
        out.append(here + [n['s']])
        return
    for _, ch in n['c']:
        leaves(m, ch, here, out, seen)
    leaves(m, n['d'], here, out, seen)


def names_of(m, p):
    names = []
    for nm in reversed(p):
        names.append(nm)
        names.extend(m.get('alias', {}).get(nm, []))
    return names


total = 0
unreach = []
missing_stage = []
for sid, m in machines.items():
    q = stages[sid]
    var_values = sorted(int(k) for k in m['stages'])
    sts = q['stages']
    # which stage the plugin shows for a value: the last stage with at <= value
    def stage_for(v):
        idx = 0
        for i, s in enumerate(sts):
            if s['at'] <= v:
                idx = i
        return idx
    for v in var_values:
        idx = stage_for(v)
        lines = sts[idx]['do']
        ks = [l.get('k') for l in lines]
        paths = []
        leaves(m, m['stages'][str(v)], [], paths, set())
        reachable = set()
        for p in paths:
            for nm in names_of(m, p):
                reachable.add(nm)
        for i, k in enumerate(ks):
            total += 1
            if k not in reachable:
                unreach.append((sid, v, idx, i + 1, k))
    for i, s in enumerate(sts):
        if not any(int(k) >= s['at'] for k in m['stages']):
            missing_stage.append((sid, i, s['at']))
print('lines in total (by values)', total, 'unreachable', len(unreach))
for u in unreach[:120]:
    print(u)
print('stages without a QH step:', missing_stage)
