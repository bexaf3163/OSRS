"""Символьное выполнение исходников квестов Quest Helper: из loadSteps() получается машина состояний каждого этапа —
дерево шагов с условиями (предметы, зоны, переменные, сообщения чата, диалоги, текст виджетов), в порядке проверки Quest Helper.
Результат — JSON: {'stages': {N: узел}, 'nodes': {...}, 'reqs': {...}, 'alias': {...}, 'unknown': [...]}."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jparse import parse_class  # noqa: E402

from paths import WORK as SP  # noqa: E402


# ---------------------------------------------------------------- константы
def load_consts():
    out = {}
    d = os.path.join(SP, 'consts')
    for fn in os.listdir(d):
        if not fn.endswith('.txt') or fn == 'iface_classes.txt':
            continue
        tab = {}
        for line in open(os.path.join(d, fn), encoding='utf-8'):
            p = line.split()
            if len(p) == 2:
                try:
                    tab[p[0]] = int(p[1])
                except ValueError:
                    pass
        out[fn[:-4]] = tab
    return out


def load_collections():
    src = open(os.path.join(SP, 'qhcore', 'ItemCollections.java'), encoding='utf-8').read()
    shared = {}
    for m in re.finditer(r'static final ImmutableList<Integer>\s+(\w+)\s*=\s*ImmutableList\.of\((.*?)\);', src, re.S):
        shared[m.group(1)] = re.findall(r'ItemID\.(\w+)', m.group(2))
    start = src.index('public enum ItemCollections')
    body = src[start:]
    out = {}
    # записи: ИМЯ( ... ),  — до следующей записи верхнего уровня
    for m in re.finditer(r'^\t([A-Z][A-Z0-9_]*)\(', body, re.M):
        name = m.group(1)
        j = m.end()
        depth = 1
        while depth and j < len(body):
            if body[j] == '(':
                depth += 1
            elif body[j] == ')':
                depth -= 1
            j += 1
        chunk = body[m.end():j]
        ids = re.findall(r'ItemID\.(\w+)', chunk)
        for ref in re.findall(r'SharedCollections\.(\w+)', chunk):
            ids += shared.get(ref, [])
        out[name] = ids
    return out


CONSTS = load_consts()


def load_qh_enum(fname, cons_tables):
    """Перечисления Quest Helper (QuestVarbits, QuestVarPlayer): ИМЯ(VarbitID.X) или ИМЯ(123)."""
    path = os.path.join(SP, fname)
    out = {}
    if not os.path.exists(path):
        return out
    src = open(path, encoding='utf-8').read()
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    for m in re.finditer(r'^\s*([A-Z][A-Z0-9_]*)\(\s*([A-Za-z_0-9.]+)\s*\)', src, re.M):
        name, val = m.group(1), m.group(2)
        if val.isdigit():
            out[name] = int(val)
        else:
            cls, _, const = val.rpartition('.')
            for t in cons_tables:
                if const in CONSTS.get(t, {}):
                    out[name] = CONSTS[t][const]
                    break
    return out


QUEST_VARBITS = load_qh_enum('QuestVarbits.java', ['gv_VarbitID', 'api_Varbits'])
QUEST_VARPLAYERS = load_qh_enum('QuestVarPlayer.java', ['gv_VarPlayerID', 'api_VarPlayer'])
COLLECTIONS = load_collections()
IFACE = {}
for _l in open(os.path.join(SP, 'consts', 'gv_InterfaceID_nested.txt'), encoding='utf-8'):
    _p = _l.split()
    if len(_p) == 2:
        IFACE[_p[0]] = int(_p[1])

OPS = {'GREATER': '>', 'LESS': '<', 'LESS_EQUAL': '<=', 'EQUAL': '==', 'GREATER_EQUAL': '>=', 'NOT_EQUAL': '!='}


# ---------------------------------------------------------------- значения
class Enum:
    def __init__(self, cls, name, value=None):
        self.cls, self.name, self.value = cls, name, value

    def __repr__(self):
        return '%s.%s' % (self.cls, self.name)


class WP:
    def __init__(self, x, y, p):
        self.x, self.y, self.p = x, y, p


class Zone:
    def __init__(self, x1, x2, y1, y2, p1=0, p2=2):
        self.x1, self.x2, self.y1, self.y2, self.p1, self.p2 = x1, x2, y1, y2, p1, p2

    def json(self):
        return [self.x1, self.y1, self.x2, self.y2, self.p1, self.p2]


class Coll:
    def __init__(self, name, ids):
        self.name, self.ids = name, ids


class Unk:
    def __init__(self, what):
        self.what = what


class Step:
    def __init__(self, kind, name=None):
        self.kind = kind          # 'leaf' | 'cond'
        self.name = name
        self.default = None
        self.entries = []         # [(req, Step)]
        self.lock = None
        self.subs = []
        self.owner = None         # имя переменной-хозяина для шагов из вспомогательного класса

    def __repr__(self):
        return '<Step %s %s>' % (self.kind, self.name)


class Req(dict):
    """Узел условия (JSON-словарь). Тождество объекта важно: Conditions с защёлкой — одно состояние на все места использования."""

    def __hash__(self):
        return id(self)

    def __eq__(self, other):
        return self is other


def req(o, **kw):
    r = Req(o=o)
    r.update({k: v for k, v in kw.items() if v is not None and v is not False})
    return r


def flat(xs):
    out = []
    for x in xs:
        if isinstance(x, list):
            out += flat(x)
        else:
            out.append(x)
    return out


class Interp:
    def __init__(self, cls_name, classes):
        self.classes = classes            # имя класса -> разобранный класс
        self.main = classes[cls_name]
        self.env = {}
        self.stages = {}
        self.unknown = []
        self.this_stack = []
        self.depth = 0
        self.imports = dict(self.main['imports'])
        self.static_imports = dict(self.main['static_imports'])
        self.quest_name = ''

    # ------------------------------------------------------------ константы
    def const(self, cls, name):
        full = self.imports.get(cls, '')
        pkg = 'gv' if 'gameval' in full else 'api'
        tab = CONSTS.get('%s_%s' % (pkg, cls))
        if tab is None:
            tab = CONSTS.get('gv_' + cls) or CONSTS.get('api_' + cls)
        if tab is not None and name in tab:
            return tab[name]
        # запасной вариант: другое пространство
        for alt in ('gv_', 'api_'):
            t = CONSTS.get(alt + cls)
            if t and name in t:
                return t[name]
        return None

    # ------------------------------------------------------------ выполнение
    def run(self):
        for f in self.main['fields']:
            self.stmt(f)
        self.call_method(self.main, 'loadSteps')
        return self.stages

    def call_method(self, cls, name, args=None):
        body = cls['methods'].get(name)
        if body is None:
            return None
        if self.depth > 20:
            return None
        self.depth += 1
        try:
            for s in body:
                self.stmt(s)
        finally:
            self.depth -= 1

    def stmt(self, s):
        k = s[0]
        if k == 'decl':
            _, name, init = s
            val = self.ev(init) if init is not None else None
            self.bind(name, val)
        elif k == 'multi':
            for x in s[1]:
                self.stmt(x)
        elif k == 'assign':
            lhs, rhs = s[1], s[2]
            val = self.ev(rhs)
            if lhs[0] == 'name':
                self.bind(lhs[1], val)
            elif lhs[0] == 'field' and lhs[1] == ('name', 'this'):
                self.bind(lhs[2], val)
            elif lhs[0] == 'index':
                pass
        elif k == 'expr':
            self.ev(s[1])

    def bind(self, name, val):
        self.env[name] = val
        if isinstance(val, Step) and val.name is None:
            val.name = name

    # ------------------------------------------------------------ выражения
    def ev(self, e):
        if e is None:
            return None
        k = e[0]
        if k == 'lit':
            return e[1]
        if k == 'name':
            n = e[1]
            if n in self.env:
                return self.env[n]
            if n == 'this':
                return self.this_stack[-1] if self.this_stack else None
            return Unk(n)
        if k == 'field':
            return self.ev_field(e)
        if k == 'call':
            return self.ev_call(e)
        if k == 'new':
            return self.ev_new(e)
        if k == 'arr':
            return [self.ev(x) for x in e[1]]
        if k == 'cast':
            return self.ev(e[1])
        if k == 'bin':
            a, b = self.ev(e[2]), self.ev(e[3])
            if e[1] == '+' and (isinstance(a, str) or isinstance(b, str)):
                return '%s%s' % (a if a is not None else '', b if b is not None else '')
            try:
                return {'+': lambda: a + b, '-': lambda: a - b, '*': lambda: a * b, '/': lambda: a // b,
                        '|': lambda: a | b, '&': lambda: a & b}.get(e[1], lambda: Unk('bin'))()
            except Exception:
                return Unk('bin')
        if k == 'un':
            v = self.ev(e[2])
            if e[1] == '-' and isinstance(v, (int, float)):
                return -v
            return Unk('un')
        if k == 'tern':
            return Unk('tern')
        if k == 'lambda':
            return ('closure', e[1], e[2], e[3])
        if k == 'mref':
            return Unk('lambda')
        return Unk(str(e))

    def ev_field(self, e):
        obj, name = e[1], e[2]
        if obj[0] == 'name':
            cls = obj[1]
            if cls == 'this':
                return self.env.get(name, Unk('this.' + name))
            if cls in self.env and not cls[0].isupper():
                v = self.env[cls]
                return Unk('field')
            if cls == 'ItemCollections':
                ids = [self.const_item(n) for n in COLLECTIONS.get(name, [])]
                return Coll(name, [i for i in ids if i is not None])
            if cls in ('LogicType', 'Operation'):
                return Enum(cls, name)
            if cls == 'QuestVarbits':
                v = QUEST_VARBITS.get(name)
                return Enum('QuestVarbits', name) if v is None else Enum('QuestVarbits', name, v)
            if cls == 'QuestVarPlayer':
                v = QUEST_VARPLAYERS.get(name)
                return Enum('QuestVarPlayer', name) if v is None else Enum('QuestVarPlayer', name, v)
            if cls in ('Skill', 'QuestState', 'QuestHelperQuest', 'Prayer', 'ChatMessageType', 'Quest', 'Varbits', 'VarPlayer', 'VarbitID',
                       'VarPlayerID', 'ItemID', 'NpcID', 'ObjectID', 'NullObjectID', 'InterfaceID'):
                v = self.const(cls, name)
                if v is not None:
                    return v
                return Enum(cls, name)
            return Unk('%s.%s' % (cls, name))
        if obj[0] == 'field' and obj[1][0] == 'name' and obj[1][1] == 'InterfaceID':
            v = IFACE.get('%s.%s' % (obj[2], name))
            return v if v is not None else Unk('InterfaceID.%s.%s' % (obj[2], name))
        if obj[0] == 'field' and obj[1][0] == 'name' and obj[1][1] in ('ItemID',):
            return Unk('field')
        return Unk('field')

    def const_item(self, name):
        for tab in ('gv_ItemID', 'api_ItemID'):
            if name in CONSTS.get(tab, {}):
                return CONSTS[tab][name]
        return None

    # ------------------------------------------------------------ new
    def ev_new(self, e):
        typ, args = e[1], [self.ev(a) for a in e[2]]
        if typ == 'WorldPoint':
            if len(args) == 3 and all(isinstance(a, int) for a in args):
                return WP(*args)
            return Unk('WorldPoint')
        if typ == 'Zone':
            return self.make_zone(args)
        if typ in ('ArrayList', 'LinkedList', 'HashSet'):
            return list(flat(args[:1])) if args and isinstance(args[0], list) else []
        if typ in ('HashMap', 'LinkedHashMap', 'TreeMap'):
            return {}
        if typ == 'VarbitBuilder':
            return ('vbuilder', args[0]) if args and isinstance(args[0], int) else Unk('VarbitBuilder')
        if typ == 'ItemRequirement':
            return self.make_item(args)
        if typ == 'ItemRequirements':
            return self.make_items(args)
        if typ == 'Conditions':
            return self.make_conditions(args)
        if typ == 'ZoneRequirement':
            return self.make_zone_req(args)
        if typ == 'VarbitRequirement':
            return self.make_varbit(args)
        if typ == 'VarplayerRequirement':
            return self.make_varp(args)
        if typ == 'ChatMessageRequirement':
            return self.make_chat('chat', args)
        if typ == 'MesBoxRequirement':
            return self.make_chat('mes', args)
        if typ == 'DialogRequirement':
            return self.make_dialog(args)
        if typ == 'WidgetTextRequirement':
            return self.make_widget(args)
        if typ == 'NpcCondition':
            return self.make_npc(args)
        if typ == 'ObjectCondition':
            return self.make_obj(args)
        if typ == 'ItemOnTileRequirement':
            return self.make_ground(args)
        if typ == 'SkillRequirement':
            return self.make_skill(args)
        if typ == 'QuestRequirement':
            return self.make_quest(args)
        if typ in ('QuestPointRequirement',):
            return req('qp', n=args[0] if args and isinstance(args[0], int) else None)
        if typ in ('RuneliteRequirement', 'ManualRequirement', 'NpcHintArrowRequirement', 'NpcInteractingRequirement', 'NpcRequirement',
                   'PrayerRequirement', 'PrayerPointRequirement', 'InInstanceRequirement', 'FreeInventorySlotRequirement',
                   'CombatLevelRequirement', 'NoItemRequirement', 'MultiChatMessageRequirement', 'WidgetModelRequirement',
                   'ItemRequirementsOr', 'FollowerRequirement', 'NpcCondition2'):
            return req('?', d=typ)
        if typ == 'Requirement' or e[3] == 'anon':
            return req('?', d='anon')
        if typ in self.classes and typ != self.main['name']:
            return self.make_helper_step(typ, args)
        if typ.endswith('Step') or typ in ('ConditionalStep', 'QuestStep'):
            return self.make_step(typ, args, e)
        return Unk('new ' + typ)

    # ------------------------------------------------------------ требования
    def make_zone(self, args):
        a = [x for x in args if not isinstance(x, str)]
        if not a:
            return Zone(1152, 3903, 2496, 4159, 0, 0)
        if len(a) == 2 and all(isinstance(x, WP) for x in a):
            p, q = a
            return Zone(min(p.x, q.x), max(p.x, q.x), min(p.y, q.y), max(p.y, q.y), min(p.p, q.p), max(p.p, q.p))
        if len(a) == 1 and isinstance(a[0], WP):
            p = a[0]
            return Zone(p.x, p.x, p.y, p.y, p.p, p.p)
        if len(a) >= 1 and isinstance(a[0], int):
            rid = a[0]
            x1 = ((rid >> 8) & 0xFF) << 6
            y1 = (rid & 0xFF) << 6
            plane = a[1] if len(a) > 1 and isinstance(a[1], int) else None
            return Zone(x1, x1 + 64, y1, y1 + 64, plane if plane is not None else 0, plane if plane is not None else 2)
        return Unk('Zone')

    def make_item(self, args):
        name = next((a for a in args if isinstance(a, str)), None)
        ids = []
        qty = 1
        equipped = False
        ints = []
        for a in args:
            if isinstance(a, Coll):
                ids += a.ids
            elif isinstance(a, list):
                ids += [x for x in flat(a) if isinstance(x, int)]
            elif isinstance(a, bool):
                equipped = a
            elif isinstance(a, int):
                ints.append(a)
        if not ids and ints:
            ids = [ints[0]]
            if len(ints) > 1:
                qty = ints[1]
        elif ids and ints:
            qty = ints[0]
        return req('item', nm=name, ids=ids or None, q=qty if qty != 1 else None, eq=equipped or None)

    def make_items(self, args):
        logic = next((a for a in args if isinstance(a, Enum)), None)
        reqs = [a for a in flat(args) if isinstance(a, Req)]
        op = 'and'
        if logic is not None and logic.name == 'OR':
            op = 'or'
        elif logic is not None and logic.name == 'NOR':
            op = 'nor'
        return req(op, a=reqs)

    def make_conditions(self, args):
        latch = False
        logic = 'and'
        reqs = []
        opq = None
        for a in args:
            if isinstance(a, bool):
                latch = a
            elif isinstance(a, Enum) and a.cls == 'LogicType':
                logic = a.name.lower()
            elif isinstance(a, Enum) and a.cls == 'Operation':
                opq = [OPS.get(a.name)]
            elif isinstance(a, int) and opq is not None and len(opq) == 1:
                opq.append(a)
            elif isinstance(a, list):
                reqs += [x for x in flat(a) if isinstance(x, (Req, Unk)) or x is None]
            elif isinstance(a, (Req, Unk)) or a is None:
                reqs.append(a)
        reqs = [r if isinstance(r, Req) else req('?', d=getattr(r, 'what', 'null')) if r is not None else req('true') for r in reqs]
        if opq and len(opq) == 2:
            return req('count', op=opq[0], q=opq[1], a=reqs, latch=latch)
        return req(logic, a=reqs, latch=latch)

    def make_zone_req(self, args):
        zones = []
        inside = True
        for a in flat(args):
            if isinstance(a, Zone):
                zones.append(a.json())
            elif isinstance(a, WP):
                zones.append([a.x, a.y, a.x, a.y, a.p, a.p])
            elif isinstance(a, bool):
                inside = a
            elif isinstance(a, str):
                pass
        if not zones:
            return req('?', d='zone')
        return req('zone', z=zones, **({} if inside else {'out': 1}))

    def make_varbit(self, args):
        a = [x for x in args if not isinstance(x, str)]
        if not a or not isinstance(a[0], int):
            return req('?', d='varbit')
        vid = a[0]
        rest = a[1:]
        op = '=='
        val = None
        bit = None
        for x in rest:
            if isinstance(x, Enum):
                op = OPS.get(x.name, '==')
        nums = [x for x in rest if isinstance(x, int) and not isinstance(x, bool)]
        bools = [x for x in rest if isinstance(x, bool)]
        if bools and nums:
            return req('vb', id=vid, bit=nums[0], set=1 if bools[0] else 0)
        if nums:
            val = nums[0]
        return req('vb', id=vid, op=op if op != '==' else None, v=val)

    def make_varp(self, args):
        a = [x for x in args if not isinstance(x, str) or False]
        if not a or not isinstance(a[0], int):
            return req('?', d='varp')
        vid = a[0]
        rest = [x for x in a[1:] if not isinstance(x, str)]
        op = '=='
        for x in rest:
            if isinstance(x, Enum):
                op = OPS.get(x.name, '==')
        bools = [x for x in rest if isinstance(x, bool)]
        nums = [x for x in rest if isinstance(x, int) and not isinstance(x, bool)]
        lists = [x for x in rest if isinstance(x, list)]
        if bools and nums:
            return req('vp', id=vid, bit=nums[0], set=1 if bools[0] else 0)
        if lists:
            return req('vp', id=vid, vs=[x for x in lists[0] if isinstance(x, int)], sh=nums[0] if nums else None)
        if len(nums) == 2 and not any(isinstance(x, Enum) for x in rest):
            return req('vp', id=vid, vs=[nums[0]], sh=nums[1])
        return req('vp', id=vid, op=op if op != '==' else None, v=nums[0] if nums else None)

    def make_chat(self, kind, args):
        msgs = [x for x in flat(args) if isinstance(x, str)]
        return req(kind, m=msgs)

    def make_dialog(self, args):
        """DialogRequirement(String... text) | (talker, text, mustBeActive) | (talker, mustBeActive, String... text)."""
        flat_args = list(args)
        bools = [x for x in flat_args if isinstance(x, bool)]
        strs = [x for x in flat(flat_args) if isinstance(x, str)]
        who = None
        text = strs
        if bools:
            # есть логический аргумент: первая строка — имя говорящего
            if flat_args and isinstance(flat_args[0], str):
                who = flat_args[0]
                text = [x for x in flat(flat_args[1:]) if isinstance(x, str)]
        return req('dlg', m=text, who=who, act=bools[0] if bools else None)

    def make_widget(self, args):
        ints = [x for x in args if isinstance(x, int) and not isinstance(x, bool)]
        strs = [x for x in flat(args) if isinstance(x, str)]
        bools = [x for x in args if isinstance(x, bool)]
        if not ints or not strs:
            return req('?', d='widget')
        first = ints[0]
        if first > 65535:
            g, c = first >> 16, first & 0xFFFF
            rest = ints[1:]
        elif len(ints) >= 2:
            g, c = ints[0], ints[1]
            rest = ints[2:]
        else:
            return req('?', d='widget')
        return req('wt', g=g, c=c, m=strs, ch=1 if (bools and bools[0]) else None, cc=rest[0] if rest else None)

    def make_npc(self, args):
        a = [x for x in args]
        if not a or not isinstance(a[0], int):
            return req('?', d='npc')
        z = None
        if len(a) > 1 and isinstance(a[1], WP):
            z = [a[1].x, a[1].y, a[1].x, a[1].y, a[1].p, a[1].p]
        elif len(a) > 1 and isinstance(a[1], Zone):
            z = a[1].json()
        return req('npc', id=a[0], z=z)

    def make_obj(self, args):
        a = list(args)
        ids = None
        if a and isinstance(a[0], int):
            ids = [a[0]]
        elif a and isinstance(a[0], list):
            ids = [x for x in a[0] if isinstance(x, int)]
        if not ids:
            return req('?', d='obj')
        z = None
        if len(a) > 1 and isinstance(a[1], WP):
            z = [a[1].x, a[1].y, a[1].x, a[1].y, a[1].p, a[1].p]
        elif len(a) > 1 and isinstance(a[1], Zone):
            z = a[1].json()
        return req('obj', ids=ids, z=z)

    def make_ground(self, args):
        return req('?', d='ground')

    def make_skill(self, args):
        sk = next((a for a in args if isinstance(a, Enum) and a.cls == 'Skill'), None)
        lv = next((a for a in args if isinstance(a, int) and not isinstance(a, bool)), None)
        if sk is None or lv is None:
            return req('?', d='skill')
        return req('skill', s=sk.name, l=lv)

    def make_quest(self, args):
        q = next((a for a in args if isinstance(a, Enum)), None)
        st = [a for a in args if isinstance(a, Enum)]
        if not st:
            return req('?', d='quest')
        qn = None
        state = 'FINISHED'
        for a in st:
            if a.cls == 'QuestHelperQuest':
                qn = a.name
            elif a.cls == 'QuestState':
                state = a.name
        return req('quest', q=qn, st=state)

    # ------------------------------------------------------------ шаги
    def make_step(self, typ, args, e):
        if typ == 'ConditionalStep':
            st = Step('cond')
            # new ConditionalStep(questHelper, step, [text], reqs...) — второй аргумент: шаг по умолчанию
            for a in args[1:]:
                if isinstance(a, Step):
                    st.default = a
                    break
            return st
        st = Step('leaf')
        st.typ = typ
        st.wp = next((a for a in args if isinstance(a, WP)), None)
        st.ids = [a for a in args[1:] if isinstance(a, int) and not isinstance(a, bool)]
        st.text = next((a for a in args if isinstance(a, str)), None)
        if typ == 'PuzzleWrapperStep':
            for a in args:
                if isinstance(a, Step):
                    st.subs.append(a)
        return st

    def make_helper_step(self, typ, args):
        """Вспомогательный класс шага (RumSmugglingStep и т. п.): выполняем его конструктор в своём окружении."""
        cls = self.classes[typ]
        st = Step('cond') if cls.get('extends') == 'ConditionalStep' else Step('leaf')
        if st.kind == 'cond':
            st.helper = typ
        saved_env, saved_imports = self.env, self.imports
        env = dict(self.env)
        # поля вспомогательного класса: свои
        self.env = {}
        self.imports = dict(cls['imports'])
        self.this_stack.append(st)
        before_names = set()
        try:
            for f in cls['fields']:
                self.stmt(f)
            for s in cls['ctor']:
                self.ctor_stmt(cls, s, st)
        finally:
            self.this_stack.pop()
            inner = self.env
            self.env = saved_env
            self.imports = saved_imports
        # имена внутренних шагов получают префикс владельца (узнаём его при присваивании)
        st.inner_env = inner
        return st

    def ctor_stmt(self, cls, s, st):
        # super(...) — первое: new ConditionalStep(..., defaultStep)
        if s[0] == 'expr' and s[1][0] == 'call' and s[1][1] is None and s[1][2] == 'super':
            args = [self.ev(a) for a in s[1][3]]
            for a in args[1:]:
                if isinstance(a, Step):
                    st.default = a
                    break
            return
        self.stmt(s)

    def ev_call(self, e):
        obj, name, rawargs = e[1], e[2], e[3]
        # статические помощники логики
        if obj is None:
            if name in ('and', 'or', 'nor', 'nand', 'not'):
                args = flat([self.ev(a) for a in rawargs])
                reqs = [a if isinstance(a, Req) else req('?', d='arg') for a in args]
                op = 'nor' if name in ('not', 'nor') else name
                return req(op, a=reqs)
            if name == 'super':
                return None
            if name in ('setupZones', 'setupRequirements', 'setupSteps', 'setupConditions', 'initializeRequirements', 'addSteps'):
                cls = self.current_class()
                if name == 'initializeRequirements':
                    for n in ('setupZones', 'setupRequirements'):
                        self.call_method(cls, n)
                else:
                    self.call_method(cls, name)
                return None
            if name in self.current_class()['methods']:
                self.call_method(self.current_class(), name)
                return None
            if name == 'addStep' and self.this_stack:
                return self.add_step(self.this_stack[-1], [self.ev(a) for a in rawargs])
            if name in ('List', 'asList'):
                return flat([self.ev(a) for a in rawargs])
            return Unk('call ' + name)
        # this.steps.get(null) — шаг по умолчанию вспомогательного условного шага
        if obj == ('field', ('name', 'this'), 'steps') and name == 'get' and self.this_stack:
            return self.this_stack[-1].default
        # getQuestHelper().getQuest().getName() — название квеста
        if name == 'getName' and obj[0] == 'call' and obj[2] == 'getQuest':
            return self.quest_name
        # List.of / Arrays.asList / ImmutableList.of
        if obj[0] == 'name' and obj[1] in ('List', 'Arrays', 'ImmutableList', 'Set', 'Collections') and name in ('of', 'asList', 'singletonList', 'copyOf'):
            return flat([self.ev(a) for a in rawargs])
        if obj[0] == 'name' and obj[1] == 'LogicHelper':
            return self.ev_call(('call', None, name, rawargs))
        # статическая фабрика шага: DigStep.withCustomSpadeRequirement(...) и т. п.
        if obj[0] == 'name' and obj[1].endswith('Step') and obj[1] not in self.env:
            for a in rawargs:
                self.ev(a)
            return Step('leaf')
        if obj[0] == 'name' and obj[1] == 'IntStream' and name in ('range', 'rangeClosed'):
            a = [self.ev(x) for x in rawargs]
            if len(a) == 2 and all(isinstance(x, int) for x in a):
                return ('range', a[0], a[1] + (1 if name == 'rangeClosed' else 0))
            return Unk('IntStream')
        target = self.ev(obj)
        args = [self.ev(a) for a in rawargs]
        return self.dispatch(target, name, args)

    def current_class(self):
        # внутри вспомогательного класса — он; иначе главный
        if self.this_stack and hasattr(self.this_stack[-1], 'helper'):
            return self.classes[self.this_stack[-1].helper]
        return self.main

    def dispatch(self, target, name, args):
        if isinstance(target, tuple) and target and target[0] == 'range' and name == 'forEach' and args and isinstance(args[0], tuple) and args[0][0] == 'closure':
            _, params, kind, body = args[0]
            for i in range(target[1], target[2]):
                if params:
                    self.env[params[0]] = i
                if kind == 'expr':
                    self.ev(body)
                else:
                    for st in body:
                        self.stmt(st)
            return None
        if isinstance(target, Enum) and name == 'getId':
            return target.value if target.value is not None else Unk('getId')
        if isinstance(target, tuple) and target and target[0] == 'vbuilder':
            vid = target[1]
            if name == 'eq' and args and isinstance(args[0], int):
                return req('vb', id=vid, v=args[0])
            if name == 'ge' and args and isinstance(args[0], int):
                return req('vb', id=vid, op='>=', v=args[0])
            return Unk('vbuilder.' + name)
        if isinstance(target, Step):
            return self.step_call(target, name, args)
        if isinstance(target, dict) and not isinstance(target, Req):
            if name == 'put' and len(args) == 2 and isinstance(args[0], int):
                target[args[0]] = args[1]
                if target is self.env.get('steps') or True:
                    self.stages[args[0]] = args[1]
            return None
        if isinstance(target, list):
            if name == 'add' and args:
                target.append(args[-1])
            elif name == 'addAll' and args and isinstance(args[0], list):
                target.extend(args[0])
            return None
        if isinstance(target, Req):
            return self.req_call(target, name, args)
        return Unk('call ' + name)

    def req_call(self, r, name, args):
        o = r.get('o')
        if o == 'item':
            if name == 'alsoCheckBank':
                c = Req(r)
                c['bank'] = 1
                return c
            if name == 'equipped':
                c = Req(r)
                c['eq'] = 1
                return c
            if name in ('quantity', 'withQuantity') and args and isinstance(args[0], int):
                c = Req(r)
                c['q'] = args[0]
                return c
            if name == 'addAlternates':
                ids = [x for x in flat(args) if isinstance(x, int)]
                for a in args:
                    if isinstance(a, Coll):
                        ids += a.ids
                r['ids'] = list(r.get('ids') or []) + ids
                return None
            if name in ('highlighted', 'hideConditioned', 'showConditioned', 'isNotConsumed', 'canBeObtainedDuringQuest', 'named', 'setTooltip',
                        'copy', 'setConditionToHide', 'setDisplayMatchedItemName', 'doNotAggregate', 'setHighlightInInventory', 'alsoCheckBank2'):
                return r
            return r
        if name == 'setHasPassed' or name == 'setText':
            return None
        return r

    def step_call(self, st, name, args):
        if name == 'addStep':
            return self.add_step(st, args)
        if name == 'setLockingCondition' and args and isinstance(args[0], Req):
            st.lock = args[0]
            return None
        if name in ('addSubSteps', 'addSubStep'):
            for a in flat(args):
                if isinstance(a, Step):
                    st.subs.append(a)
            return None
        if name.startswith('puzzleWrapStep'):
            w = Step('leaf')
            w.subs.append(st)
            for a in flat(args):
                if isinstance(a, Step):
                    w.subs.append(a)
            return w
        if name == 'copy':
            c = Step(st.kind)
            c.default, c.entries, c.lock, c.subs = st.default, list(st.entries), st.lock, list(st.subs)
            return c
        # остальные методы шага — «текучий» интерфейс (возвращают тот же шаг) или пустышки
        return st

    def add_step(self, st, args):
        if not args:
            return None
        if len(args) == 1 and isinstance(args[0], Step) and args[0].kind == 'cond':
            sub = args[0]
            conds = [r for r, _ in sub.entries if isinstance(r, Req)]
            st.entries.append((req('or', a=conds), sub))
            return None
        if len(args) >= 2:
            cond, step = args[0], args[1]
            if not isinstance(step, Step):
                return None
            if not isinstance(cond, Req):
                cond = req('?', d=getattr(cond, 'what', 'cond'))
            st.entries.append((cond, step))
        return None


# ---------------------------------------------------------------- сборка
def collect_classes(cls_name, qdir):
    """Главный класс и вспомогательные из той же папки пакета."""
    classes = {}
    main = os.path.join(SP, 'qh', cls_name + '.java')
    classes[cls_name] = parse_class(open(main, encoding='utf-8').read())
    d = os.path.join(SP, 'qhpkg', qdir)
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if fn.endswith('.java') and fn[:-5] != cls_name:
                src = open(os.path.join(d, fn), encoding='utf-8').read()
                if src.strip():
                    c = parse_class(src)
                    classes[c['name'] or fn[:-5]] = c
    return classes
