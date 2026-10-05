"""The reference evaluator of the Quest Helper machines (Python). The same rules as in the plugin (QhEval.java): three values (yes / no / unknown),
the latches Conditions(true, …), the chat/dialogue events by the message history. The generator needs it for checks and for the "golden" vectors of the plugin tests."""
import re

T, F, U = True, False, None
OPS = {'>': lambda a, b: a > b, '<': lambda a, b: a < b, '<=': lambda a, b: a <= b, '==': lambda a, b: a == b,
       '>=': lambda a, b: a >= b, '!=': lambda a, b: a != b}
TAG = re.compile(r'<[^>]*>')


def sanitize(s):
    return TAG.sub('', s).replace(' ', ' ')


class Facts:
    def __init__(self, items=None, equip=None, bank=None, pos=None, vb=None, vp=None, events=None, widgets=None, npcs=None, objs=None,
                 quests=None, skills=None):
        self.items = items or {}
        self.equip = equip or {}
        self.bank = bank or {}
        self.pos = pos
        self.vb = vb or {}
        self.vp = vp or {}
        self.events = events or []      # (type, name, text)
        self.widgets = widgets or {}    # (group, child) -> [texts]: the first is the widget itself, the rest are children
        self.npcs = npcs or []          # (id, x, y, plane)
        self.objs = objs or []
        self.quests = quests or {}
        self.skills = skills or {}


class Machine:
    """One quest machine: the reqs/nodes tables and the latch state."""

    def __init__(self, data):
        self.reqs = data.get('reqs', {})
        self.nodes = data.get('nodes', {})
        self.latched = {}

    def r(self, ref):
        return self.reqs[ref] if isinstance(ref, str) else ref

    def count_items(self, node, facts):
        ids = node.get('ids') or []
        if not ids:
            return None
        total = 0
        eq = node.get('eq')
        if not eq:
            total += sum(facts.items.get(i, 0) for i in ids)
        total += sum(facts.equip.get(i, 0) for i in ids)
        if node.get('bank'):
            total += sum(facts.bank.get(i, 0) for i in ids)
        return total

    def ev(self, ref, facts):
        node = self.r(ref)
        key = ref if isinstance(ref, str) else id(node)
        if node.get('latch') and self.latched.get(key):
            return T
        v = self._ev(node, facts)
        if v is T and node.get('latch'):
            self.latched[key] = True
        return v

    def _ev(self, n, facts):
        o = n['o']
        if o in ('and', 'or', 'nor', 'nand'):
            vals = [self.ev(a, facts) for a in n['a']]
            if o == 'and':
                if any(v is F for v in vals):
                    return F
                return U if any(v is U for v in vals) else T
            if o == 'or':
                if any(v is T for v in vals):
                    return T
                return U if any(v is U for v in vals) else F
            if o == 'nor':
                if any(v is T for v in vals):
                    return F
                return U if any(v is U for v in vals) else T
            if any(v is F for v in vals):
                return T
            return U if any(v is U for v in vals) else F
        if o == 'count':
            vals = [self.ev(a, facts) for a in n['a']]
            if any(v is U for v in vals):
                return U
            return OPS[n['op']](sum(1 for v in vals if v is T), n['q'])
        if o == 'true':
            return T
        if o == 'item':
            c = self.count_items(n, facts)
            if c is None:
                return U
            return c >= n.get('q', 1)
        if o == 'zone':
            if facts.pos is None:
                return F
            x, y, p = facts.pos
            inside = any(z[0] <= x <= z[2] and z[1] <= y <= z[3] and z[4] <= p <= z[5] for z in n['z'])
            return inside != bool(n.get('out'))
        if o == 'vb':
            val = facts.vb.get(n['id'], 0)
            if 'bit' in n:
                return bool((val >> n['bit']) & 1) == bool(n['set'])
            return OPS[n.get('op', '==')](val, n.get('v', 0))
        if o == 'vp':
            val = facts.vp.get(n['id'], 0)
            if 'bit' in n:
                return bool((val >> n['bit']) & 1) == bool(n['set'])
            if 'vs' in n:
                sh = n.get('sh')
                v2 = val >> sh if sh is not None else val
                return any(v2 == x for x in n['vs'])
            return OPS[n.get('op', '==')](val, n.get('v', 0))
        if o == 'chat':
            return any(t in ('GAMEMESSAGE', 'ENGINE', 'SPAM') and any(m in txt or m in sanitize(txt) for m in n['m']) for t, _, txt in facts.events)
        if o == 'mes':
            return any(t == 'MESBOX' and any(m in txt or m in sanitize(txt) for m in n['m']) for t, _, txt in facts.events)
        if o == 'dlg':
            who = n.get('who')
            for t, _, txt in facts.events:
                if t != 'DIALOG':
                    continue
                s = sanitize(txt)
                if who and (who + '|') not in s:
                    continue
                if any(m in s for m in n['m']):
                    return T
            return F
        if o == 'wt':
            w = facts.widgets.get((n['g'], n['c']))
            if w is None:
                return F
            texts = w if n.get('ch') else w[:1]
            return any(m in t for t in texts for m in n['m'])
        if o == 'npc':
            z = n.get('z')
            for nid, x, y, p in facts.npcs:
                if nid == n['id'] and (not z or (z[0] <= x <= z[2] and z[1] <= y <= z[3] and z[4] <= p <= z[5])):
                    return T
            return F
        if o == 'obj':
            z = n.get('z')
            for oid, x, y, p in facts.objs:
                if oid in n['ids'] and (not z or (z[0] <= x <= z[2] and z[1] <= y <= z[3] and z[4] <= p <= z[5])):
                    return T
            return F
        if o == 'skill':
            return facts.skills.get(n['s'], 1) >= n['l']
        if o == 'quest':
            st = facts.quests.get(n['q'])
            if st is None:
                return U
            return st == n['st']
        return U

    # ------------------------------------------------------------ the machine
    def node(self, ref):
        return self.nodes[ref] if isinstance(ref, str) else ref

    def locked(self, nd, facts):
        lk = nd.get('l')
        if lk is None:
            return False
        return self.ev(lk, facts) is T

    def resolve(self, ref, facts, path=None, strong=False):
        """(the leaf, the name path, whether the inference is strong) or None if it cannot be decided (an "unknown" was met)."""
        nd = self.node(ref)
        path = (path or []) + ([nd['n']] if nd.get('n') else [])
        if 's' in nd:
            return nd['s'], path + [nd['s']], strong
        last_possible = None
        for cref, child in nd['c']:
            ch = self.node(child)
            locked = self.locked(ch, facts)
            r = self.ev(cref, facts)
            if r is T and not locked:
                return self.resolve(child, facts, path, True)
            if r is U and not locked:
                return None
            if not locked:
                last_possible = child
        d = nd['d']
        if self.locked(self.node(d), facts):
            if last_possible is not None:
                return self.resolve(last_possible, facts, path, strong)
        return self.resolve(d, facts, path, strong)
