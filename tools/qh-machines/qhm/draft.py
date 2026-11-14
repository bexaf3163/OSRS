"""The Quest Helper facts of a quest that is not on the route yet: its state machine, the variable that tracks it
and every step's type, tile, ids and text. Nothing here is written by hand or by an AI; the quest draft
(scripts/data/quest-draft.ts) builds on it.

  python qhm/draft.py "Druidic Ritual" out.json     # the Quest Helper sources must be in work/ (fetch_qh.py)
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8')

import build as B  # noqa: E402
import quests as C  # noqa: E402
from interp import Interp, collect_classes  # noqa: E402
from paths import WORK  # noqa: E402

REPO = os.path.join(WORK, 'quest-helper')
ENUM = os.path.join(REPO, 'src', 'main', 'java', 'com', 'questhelper', 'questinfo', 'QuestHelperQuest.java')


def registered(title):
    """(class, variable kind, variable id) from Quest Helper's own quest table."""
    name = re.sub(r'[^A-Z0-9]+', '_', title.upper().replace("'", '')).strip('_')
    line = re.search(r'^\s*%s\(new (\w+)\(\), [^,]+, (QuestVarPlayer|QuestVarbits)\.(\w+),' % name,
                     open(ENUM, encoding='utf-8').read(), re.M)
    if not line:
        sys.exit('%s: no %s in QuestHelperQuest.java' % (title, name))
    cls, table, var = line.groups()
    vid = re.search(r'\b%s\((\d+)\)' % var, open(os.path.join(WORK, table + '.java'), encoding='utf-8').read())
    if not vid:
        sys.exit('%s: no id for %s.%s' % (title, table, var))
    return cls, 'varp' if table == 'QuestVarPlayer' else 'varbit', int(vid.group(1))


def lay_out(cls):
    """The quest's main class and package, where the generators read them (as fetch_qh.py does for the route)."""
    hits = [os.path.join(root, f) for root, _, files in os.walk(os.path.join(REPO, 'src', 'main', 'java'))
            for f in files if f == cls + '.java' and '/helpers/quests/' in root.replace('\\', '/')]
    if len(hits) != 1:
        sys.exit('class %s found %d time(s)' % (cls, len(hits)))
    pkg = os.path.dirname(hits[0])
    os.makedirs(os.path.join(WORK, 'qh'), exist_ok=True)
    shutil.copy(hits[0], os.path.join(WORK, 'qh', cls + '.java'))
    dst = os.path.join(WORK, 'qhpkg', os.path.basename(pkg))
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(pkg):
        if f.endswith('.java'):
            shutil.copy(os.path.join(pkg, f), dst)


def main():
    title, out = sys.argv[1], sys.argv[2]
    cls, kind, vid = registered(title)
    lay_out(cls)
    sid = 'DRAFT'
    C.QUESTS[sid] = (cls, kind, vid)
    B.QUEST_NAMES[sid] = title
    q = B.build_quest(sid)
    it = Interp(cls, collect_classes(cls, B.cls_dir(cls)))
    it.quest_name = title
    stages = it.run()
    B.rename_helpers(stages)
    steps, seen = {}, set()
    for st in stages.values():
        for s in B.all_steps(st, seen):
            if s.kind != 'leaf' or not s.name:
                continue
            wp = getattr(s, 'wp', None)
            steps[s.name] = {'typ': getattr(s, 'typ', None), 'wp': [wp.x, wp.y, wp.p] if wp else None,
                             'ids': getattr(s, 'ids', []), 'text': getattr(s, 'text', None)}
    rev = open(os.path.join(WORK, 'QH_REVISION.txt'), encoding='utf-8').read().split()
    json.dump({'title': title, 'cls': cls, 'var': [kind, vid], 'revision': rev[0],
               'machine': {k: q[k] for k in ('stages', 'nodes', 'reqs', 'alias')}, 'unknown': q['unknown'],
               'steps': steps}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(title, cls, kind, vid, 'stages', len(q['stages']), 'steps', len(steps), 'unknown', q['unknown'])


if __name__ == '__main__':
    main()
