"""«Золотые» векторы для теста плагина: случайные и целевые наборы фактов игры → ответ эталонного вычислителя (qeval.py).
Тест плагина (QhGoldenTest) прогоняет те же факты через QhMachine.java и сверяет ответ: Python и Java обязаны совпасть на каждом."""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8')
from qeval import Facts, Machine  # noqa: E402

from paths import MACHINES, GOLDEN as OUT  # noqa: E402


def atoms(m, ref, out=None, seen=None):
    out = out if out is not None else []
    seen = seen if seen is not None else set()
    n = m.r(ref)
    if id(n) in seen:
        return out
    seen.add(id(n))
    if n['o'] in ('and', 'or', 'nor', 'nand', 'count'):
        for a in n['a']:
            atoms(m, a, out, seen)
    else:
        out.append(n)
    return out


def stage_atoms(m, ref):
    out, seen = [], set()

    def walk(r, seen_nodes):
        nd = m.node(r)
        if id(nd) in seen_nodes:
            return
        seen_nodes.add(id(nd))
        if 's' in nd:
            if nd.get('l'):
                atoms(m, nd['l'], out, seen)
            return
        for c, ch in nd['c']:
            atoms(m, c, out, seen)
            walk(ch, seen_nodes)
        walk(nd['d'], seen_nodes)
        if nd.get('l'):
            atoms(m, nd['l'], out, seen)
    walk(ref, set())
    return out


def apply_atom(f, a, truth, rng):
    """Подправить факты так, чтобы атом стал truth (или случайным, если не знаем как)."""
    o = a['o']
    if o == 'item' and a.get('ids'):
        ids = a['ids']
        i = rng.choice(ids[:3])
        q = a.get('q', 1)
        if truth:
            where = rng.choice(['inv', 'inv', 'eq', 'bank']) if not a.get('eq') else 'eq'
            if where == 'bank' and not a.get('bank'):
                where = 'inv'
            (f.items if where == 'inv' else f.equip if where == 'eq' else f.bank)[i] = max(q, 1) + rng.choice([0, 0, 1])
        else:
            for t in (f.items, f.equip, f.bank):
                for x in ids:
                    t.pop(x, None)
            if q > 1 and rng.random() < 0.3:
                f.items[i] = q - 1
    elif o == 'zone':
        z = rng.choice(a['z'])
        inside = bool(truth) != bool(a.get('out'))
        if inside:
            f.pos = (rng.randint(z[0], z[2]), rng.randint(z[1], z[3]), rng.randint(z[4], z[5]))
        else:
            f.pos = (z[2] + 500, z[3] + 500, 0) if rng.random() < 0.5 else (max(1, z[0] - 500), max(1, z[1] - 500), 3)
    elif o in ('vb', 'vp'):
        tab = f.vb if o == 'vb' else f.vp
        if 'bit' in a:
            cur = tab.get(a['id'], 0)
            want = a['set'] if truth else 1 - a['set']
            tab[a['id']] = (cur | (1 << a['bit'])) if want else (cur & ~(1 << a['bit']))
        elif 'vs' in a:
            sh = a.get('sh') or 0
            tab[a['id']] = (a['vs'][0] << sh) if truth else ((a['vs'][0] + 7) << sh)
        else:
            v = a.get('v', 0)
            op = a.get('op', '==')
            if truth:
                tab[a['id']] = {'==': v, '>=': v + rng.randint(0, 2), '>': v + 1, '<': v - 1, '<=': v, '!=': v + 1}[op]
            else:
                tab[a['id']] = {'==': v + 1, '>=': v - 1, '>': v, '<': v, '<=': v + 1, '!=': v}[op]
    elif o in ('chat', 'mes', 'dlg'):
        typ = {'chat': rng.choice(['GAMEMESSAGE', 'ENGINE', 'SPAM']), 'mes': 'MESBOX', 'dlg': 'DIALOG'}[o]
        if truth:
            msg = rng.choice(a['m'])
            if o == 'dlg':
                msg = '%s|%s' % (a.get('who') or 'Npc', msg)
            if rng.random() < 0.4:
                msg = '<col=ff0000>' + msg + '</col>'
            f.events.append((typ, '', msg))
        else:
            f.events = [e for e in f.events if not any(m in e[2] for m in a['m'])]
    elif o == 'wt':
        key = (a['g'], a['c'])
        if truth:
            texts = [rng.choice(a['m'])] + ['x']
            f.widgets[key] = texts if a.get('ch') else texts[:1]
            if a.get('ch'):
                f.widgets[key] = ['title'] + [rng.choice(a['m'])]
        else:
            f.widgets.pop(key, None)
    elif o == 'npc':
        z = a.get('z')
        f.npcs = [n for n in f.npcs if n[0] != a['id']]
        if truth:
            f.npcs.append((a['id'], z[0] if z else 3000, z[1] if z else 3000, z[4] if z else 0))
    elif o == 'obj':
        z = a.get('z')
        f.objs = [n for n in f.objs if n[0] not in a['ids']]
        if truth:
            f.objs.append((a['ids'][0], z[0] if z else 3000, z[1] if z else 3000, z[4] if z else 0))
    elif o == 'skill':
        f.skills[a['s']] = a['l'] + (0 if truth else -1) if truth else max(1, a['l'] - 1)
    elif o == 'quest':
        f.quests[a['q']] = a['st'] if truth else 'NOT_STARTED'


def random_facts(atom_list, rng):
    f = Facts(pos=(rng.randint(2500, 3500), rng.randint(2900, 3600), 0))
    for a in atom_list:
        if rng.random() < 0.5:
            apply_atom(f, a, rng.random() < 0.5, rng)
    return f


def satisfy(m, ref, f, rng, want=True, depth=0):
    n = m.r(ref)
    if depth > 8:
        return
    o = n['o']
    if o == 'and':
        for a in n['a']:
            satisfy(m, a, f, rng, want, depth + 1) if want else None
        if not want and n['a']:
            satisfy(m, rng.choice(n['a']), f, rng, False, depth + 1)
    elif o == 'or':
        if want:
            satisfy(m, rng.choice(n['a']), f, rng, True, depth + 1)
        else:
            for a in n['a']:
                satisfy(m, a, f, rng, False, depth + 1)
    elif o in ('nor',):
        for a in n['a']:
            satisfy(m, a, f, rng, not want if want else True, depth + 1)
    elif o in ('nand',):
        for a in n['a']:
            satisfy(m, a, f, rng, not want if want else True, depth + 1)
    elif o == 'count':
        for a in n['a']:
            satisfy(m, a, f, rng, True, depth + 1)
    else:
        apply_atom(f, n, want, rng)


def facts_json(f):
    return {'items': {str(k): v for k, v in f.items.items()}, 'equip': {str(k): v for k, v in f.equip.items()},
            'bank': {str(k): v for k, v in f.bank.items()}, 'pos': list(f.pos) if f.pos else None,
            'vb': {str(k): v for k, v in f.vb.items()}, 'vp': {str(k): v for k, v in f.vp.items()},
            'events': [list(e) for e in f.events], 'widgets': {'%d:%d' % k: v for k, v in f.widgets.items()},
            'npcs': [list(n) for n in f.npcs], 'objs': [list(n) for n in f.objs], 'quests': f.quests, 'skills': f.skills}


def copy_facts(f):
    return Facts(dict(f.items), dict(f.equip), dict(f.bank), f.pos, dict(f.vb), dict(f.vp), list(f.events), dict(f.widgets), list(f.npcs),
                 list(f.objs), dict(f.quests), dict(f.skills))


def expect(m, var, f):
    r = m.resolve(m.stages_root[str(var)], f)
    if r is None:
        return {'undecided': True, 'leaf': None, 'strong': False, 'path': []}
    leaf, path, strong = r
    return {'undecided': False, 'leaf': leaf, 'strong': bool(strong), 'path': path}


def main():
    rng = random.Random(20261004)
    data = json.load(open(MACHINES, encoding='utf-8'))['quests']
    vectors = []
    for sid, q in data.items():
        m = Machine(q)
        m.stages_root = q['stages']
        done_roots = set()
        for var, root in q['stages'].items():
            key = json.dumps(root, sort_keys=True) if not isinstance(root, str) else root
            if isinstance(root, dict) and 's' in root and not root.get('l'):
                continue   # лист без условий: проверять нечего
            if key in done_roots:
                continue
            done_roots.add(key)
            al = stage_atoms(m, root)
            nd = m.node(root)
            made = []
            # случайные наборы
            for _ in range(10):
                made.append(random_facts(al, rng))
            # целевые: условия верхнего условного шага по очереди
            if 'c' in nd:
                for cref, _ in nd['c'][:14]:
                    f = random_facts([], rng)
                    satisfy(m, cref, f, rng)
                    made.append(f)
            for base in made:
                steps = []
                f = base
                for k in range(3):
                    m.latched = {}
                    if k == 0:
                        pass
                    # последовательность: защёлки живут между шагами; факты меняются
                    steps.append({'facts': facts_json(f), 'expect': expect(m, int(var), f)})
                    f = copy_facts(f)
                    # случайно «забыть» часть фактов, но защёлки остаются
                    if rng.random() < 0.7:
                        f.events = []
                    if rng.random() < 0.5:
                        f.items = {}
                    if rng.random() < 0.5:
                        f.pos = (rng.randint(2500, 3500), rng.randint(2900, 3600), 0)
                # состояние защёлок надо считать последовательно: пересчитать ответы одним проходом с общим состоянием
                m.latched = {}
                f = base
                steps = []
                for k in range(3):
                    steps.append({'facts': facts_json(f), 'expect': expect(m, int(var), f)})
                    f = copy_facts(f)
                    if rng.random() < 0.7:
                        f.events = []
                    if rng.random() < 0.5:
                        f.items = {}
                vectors.append({'quest': sid, 'var': int(var), 'steps': steps})
    # размер: ограничим
    rng.shuffle(vectors)
    vectors = vectors[:900]
    json.dump({'v': 1, 'vectors': vectors}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('векторов', len(vectors), 'байт', os.path.getsize(OUT))


if __name__ == '__main__':
    main()
