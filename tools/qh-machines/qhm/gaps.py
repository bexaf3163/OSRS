"""Дыры в данных: листья машины Quest Helper (шаги, которые QH показывает на этом значении переменной), для которых в нашем этапе нет строки."""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import MACHINES, STAGES  # noqa: E402
machines = json.load(open(MACHINES, encoding='utf-8'))['quests']
stages = json.load(open(STAGES, encoding='utf-8'))['quests']
qh = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qh_steps.json'), encoding='utf-8'))


def leaves(m, ref, path, out):
    n = m['nodes'][ref] if isinstance(ref, str) else ref
    here = path + ([n['n']] if n.get('n') else [])
    if 's' in n:
        out.append(here + [n['s']])
        return
    for _, ch in n['c']:
        leaves(m, ch, here, out)
    leaves(m, n['d'], here, out)


def names_of(m, p):
    names = []
    for nm in reversed(p):
        names.append(nm)
        names.extend(m.get('alias', {}).get(nm, []))
    return names


gaps = {}
for sid, m in machines.items():
    sts = stages[sid]['stages']

    def stage_for(v):
        idx = 0
        for i, s in enumerate(sts):
            if s['at'] <= v:
                idx = i
        return idx
    for v in sorted(int(k) for k in m['stages']):
        idx = stage_for(v)
        ks = {l.get('k') for l in sts[idx]['do']}
        paths = []
        leaves(m, m['stages'][str(v)], [], paths)
        for p in paths:
            if not any(n in ks for n in names_of(m, p)):
                leaf = p[-1]
                info = qh.get(sid, {}).get(leaf) or {}
                gaps.setdefault((sid, leaf), []).append(v)
                gaps[(sid, leaf)] = sorted(set(gaps[(sid, leaf)]))
print('листьев без строки:', len(gaps))
for (sid, leaf), vs in sorted(gaps.items()):
    info = qh.get(sid, {}).get(leaf) or {}
    print('%-6s %-45s var=%-18s %-18s %s' % (sid, leaf, ','.join(map(str, vs))[:18], info.get('typ'), (info.get('text') or '')[:90]))
