"""Клетка, тип и текст каждого шага Quest Helper (по именам листьев машин): для сверки с координатами стрелок в данных программы."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8')
import build as B  # noqa: E402
from interp import Interp, Step, collect_classes  # noqa: E402


def main():
    out = {}
    for sid in B.C.QUESTS:
        cls, kind, vid = B.C.QUESTS[sid]
        classes = collect_classes(cls, B.cls_dir(cls))
        it = Interp(cls, classes)
        it.quest_name = B.QUEST_NAMES.get(sid, '')
        stages = it.run()
        B.rename_helpers(stages)
        info = {}
        seen = set()
        for st in stages.values():
            for s in B.all_steps(st, seen):
                if s.kind != 'leaf' or not s.name:
                    continue
                wp = getattr(s, 'wp', None)
                info[s.name] = {'typ': getattr(s, 'typ', None), 'wp': [wp.x, wp.y, wp.p] if wp else None, 'ids': getattr(s, 'ids', []),
                                'text': getattr(s, 'text', None)}
        out[sid] = info
    json.dump(out, open(os.path.join(HERE, 'qh_steps.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    n = sum(len(v) for v in out.values())
    w = sum(1 for v in out.values() for x in v.values() if x['wp'])
    print('квестов', len(out), 'шагов', n, 'с клеткой', w)


if __name__ == '__main__':
    main()
