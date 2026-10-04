"""Собирает машины Quest Helper всех квестов маршрута: {шаг маршрута: {'stages': {N: узел}, 'nodes': {...}, 'reqs': {...}, 'alias': {...}}}."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from paths import WORK as SP, STEPS as STEPS_PATH  # noqa: E402
import interp as I  # noqa: E402
from interp import Req, Step, Interp, collect_classes  # noqa: E402

import quests as C  # noqa: E402  (таблица QUESTS: шаг маршрута -> (класс, вид переменной, номер))


STEPS = json.load(open(STEPS_PATH, encoding='utf-8'))
QUEST_NAMES = {x['id']: x.get('title') or x.get('name') or '' for x in STEPS}


def cls_dir(cls):
    for d in os.listdir(os.path.join(SP, 'qhpkg')):
        if os.path.exists(os.path.join(SP, 'qhpkg', d, cls + '.java')):
            return d
    return ''


def all_steps(root, seen=None):
    seen = seen if seen is not None else set()
    out = []

    def walk(st):
        if not isinstance(st, Step) or id(st) in seen:
            return
        seen.add(id(st))
        out.append(st)
        if st.default is not None:
            walk(st.default)
        for _, ch in st.entries:
            walk(ch)
        for s in st.subs:
            walk(s)
        env = getattr(st, 'inner_env', None)
        if env:
            for v in env.values():
                if isinstance(v, Step):
                    walk(v)
    walk(root)
    return out


def rename_helpers(stages):
    """Шаги вспомогательного класса: имя = «хозяин.имя» (так их называют строки этапов)."""
    seen = set()
    for st in stages.values():
        for s in all_steps(st, seen):
            env = getattr(s, 'inner_env', None)
            if env and s.name:
                for v, val in env.items():
                    if isinstance(val, Step):
                        base = val.name or v
                        if not base.startswith(s.name + '.'):
                            val.name = s.name + '.' + base


class Emitter:
    def __init__(self):
        self.reqs = {}
        self.req_key = {}
        self.nodes = {}
        self.node_key = {}
        self.refcount = {}
        self.unknown = {}

    # ---- подсчёт использований условий
    def count(self, r, seen_nodes=None):
        if isinstance(r, str) or r is None:
            return
        self.refcount[id(r)] = self.refcount.get(id(r), 0) + 1
        if self.refcount[id(r)] > 1:
            return
        for a in r.get('a', []):
            self.count(a)

    def count_step(self, st, seen):
        if id(st) in seen:
            return
        seen.add(id(st))
        for cond, ch in st.entries:
            self.count(cond)
            self.count_step(ch, seen)
        if st.lock is not None:
            self.count(st.lock)
        if st.default is not None:
            self.count_step(st.default, seen)

    # ---- вывод
    def req_ref(self, r):
        if r is None:
            return None
        if self.refcount.get(id(r), 1) >= 2 and r['o'] not in ('true',):
            if id(r) not in self.req_key:
                key = 'r%d' % (len(self.req_key) + 1)
                self.req_key[id(r)] = key
                self.reqs[key] = None  # бронь: рекурсия безопасна, циклов нет
                self.reqs[key] = self.req_plain(r)
            return self.req_key[id(r)]
        return self.req_plain(r)

    def req_plain(self, r):
        out = {}
        for k, v in r.items():
            if k == 'a':
                out['a'] = [self.req_ref(x) for x in v]
            elif k == 'd':
                out['d'] = v
                self.unknown[v] = self.unknown.get(v, 0) + 1
            else:
                out[k] = v
        if r['o'] == 'item' and not out.get('ids'):
            out['o'] = '?'
            out['d'] = 'item-no-id'
            self.unknown['item-no-id'] = self.unknown.get('item-no-id', 0) + 1
        return out

    def node_ref(self, st):
        if st.kind == 'leaf':
            d = {'s': st.name or '?'}
            if st.lock is not None:
                d['l'] = self.req_ref(st.lock)
            return d
        if id(st) in self.node_key:
            return self.node_key[id(st)]
        key = 'n%d' % (len(self.node_key) + 1)
        self.node_key[id(st)] = key
        self.nodes[key] = None
        d = {}
        if st.name:
            d['n'] = st.name
        d['c'] = [[self.req_ref(c), self.node_ref(ch)] for c, ch in st.entries]
        if st.default is None:
            d['d'] = {'s': '?'}
        else:
            d['d'] = self.node_ref(st.default)
        if st.lock is not None:
            d['l'] = self.req_ref(st.lock)
        self.nodes[key] = d
        return key


def alias_table(stages):
    alias = {}
    seen = set()
    for st in stages.values():
        for s in all_steps(st, seen):
            for sub in s.subs:
                if sub.name and s.name and sub.name != s.name:
                    alias.setdefault(sub.name, [])
                    if s.name not in alias[sub.name]:
                        alias[sub.name].append(s.name)
            # вложенный условный шаг: имя контейнера для поиска строки
    return alias


def build_quest(step_id):
    cls, kind, vid = C.QUESTS[step_id]
    classes = collect_classes(cls, cls_dir(cls))
    it = Interp(cls, classes)
    it.quest_name = QUEST_NAMES.get(step_id, '')
    stages = it.run()
    rename_helpers(stages)
    em = Emitter()
    seen = set()
    for st in stages.values():
        if isinstance(st, Step):
            em.count_step(st, seen)
    out_stages = {}
    for n, st in sorted(stages.items()):
        if isinstance(st, Step):
            out_stages[str(n)] = em.node_ref(st)
    return {'cls': cls, 'stages': out_stages, 'nodes': em.nodes, 'reqs': em.reqs, 'alias': alias_table(stages), 'unknown': em.unknown}


def main():
    out = {}
    report = {}
    for sid in C.QUESTS:
        try:
            out[sid] = build_quest(sid)
        except Exception as ex:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            report[sid] = repr(ex)
    json.dump(out, open(os.path.join(HERE, 'machines_raw.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    for sid, q in out.items():
        n_nodes = len(q['nodes'])
        n_reqs = len(q['reqs'])
        print(sid, q['cls'], 'этапов', len(q['stages']), 'узлов', n_nodes, 'условий', n_reqs, 'неизвестное', q['unknown'])
    if report:
        print('ОШИБКИ', report)


if __name__ == '__main__':
    main()
