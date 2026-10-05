"""Builds src/data/skills/<skill>.json (23 files) from content_*.py. Network: the OSRS Wiki (quest XP rewards, article map points), cached in work/.

    python tools/skill-guides/build.py            # write the files
    python tools/skill-guides/build.py --check    # build in memory and compare with the files (no writes)
    python tools/skill-guides/build.py --report   # also print every place with its resolved tile

The coordinates are not typed: a place is a key of src/data/majorLocations.json or the {{Map}} point of a wiki article; the quest XP is read from the quest's
{{SCP|Skill|xp}} reward lines, and the level a quest step ends on is computed from it with the XP table. Nothing here is a guess the wiki can contradict.
"""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'src', 'data', 'skills')

from wikifetch import wikitext  # noqa: E402
import content_combat  # noqa: E402
import content_skilling  # noqa: E402

SKILLS = ['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft', 'construction', 'hitpoints', 'agility', 'herblore', 'thieving', 'crafting',
          'fletching', 'slayer', 'hunter', 'mining', 'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'farming']
START = {'hitpoints': 10}
# The highest level a free account reaches by this guide (0: members only).
F2P_CAP = {'attack': 99, 'strength': 99, 'defence': 99, 'hitpoints': 99, 'ranged': 99, 'prayer': 99, 'magic': 99, 'runecraft': 44, 'crafting': 43, 'mining': 99,
           'smithing': 99, 'fishing': 99, 'cooking': 99, 'firemaking': 99, 'woodcutting': 99}


def xp_for(level):
    total = 0
    for l in range(1, level):
        total += int(l + 300 * 2 ** (l / 7.0))
    return total // 4


def level_for(xp):
    lv = 1
    while lv < 99 and xp_for(lv + 1) <= xp:
        lv += 1
    return lv


def quest_xp(quest, skill):
    t = wikitext(quest)
    m = re.search(r'\|\s*rewards\s*=(.*?)(?:\n\}\}|\n==)', t, re.S)
    body = m.group(1) if m else t
    for mm in re.finditer(r'\{\{SCP\|([^|}]+)\|([^|}]+)', body):
        if mm.group(1).strip().lower() == skill:
            return int(mm.group(2).replace(',', ''))
    # A reward you put on a skill of your choice (The Tourist Trap: 4,650 twice, "you may pick same skill twice"): both picks on this skill.
    m2 = re.search(r'([\d,]+)\s*\[\[Experience\]\]\s*in your choice of two skills', body)
    if m2 and re.search(r'SCP\|' + skill + r'\}\}', body, re.I):
        return 2 * int(m2.group(1).replace(',', ''))
    return None


def points(body):
    named = {}
    for p in body.split('|'):
        if '=' in p:
            k, v = p.split('=', 1)
            named[k.strip().lower()] = v.strip()
    try:
        return (int(named['x']), int(named['y']), int(named.get('plane', 0) or 0))
    except (KeyError, ValueError):
        pass
    for p in body.split('|'):
        m = re.match(r'^\s*(\d{3,5})\s*[,:]\s*(\d{3,5})(?:\s*,\s*(\d))?\s*$', p)
        if m:
            return (int(m.group(1)), int(m.group(2)), int(m.group(3) or named.get('plane', 0) or 0))
    return None


def wiki_point(article):
    t = wikitext(article)
    for m in re.finditer(r'\{\{\s*Map\s*\|([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}', t, re.I):
        p = points(m.group(1))
        if p:
            return p
    # Monster and NPC articles list where they stand as {{LocLine}}: "x:3253,y:3270" or "1275,3160" pairs.
    for m in re.finditer(r'\{\{\s*(?:Object)?LocLine\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}', t, re.I):
        body = m.group(1)
        pl = re.search(r'plane\s*=\s*(\d)', body, re.I)
        q = re.search(r'x:\s*(\d{3,5})\s*,\s*y:\s*(\d{3,5})', body) or re.search(r'(?:^|\|)\s*(\d{3,5})\s*,\s*(\d{3,5})\s*(?=\||$)', body)
        if q:
            return (int(q.group(1)), int(q.group(2)), int(pl.group(1)) if pl else 0)
    return None


LOC = json.load(open(os.path.join(ROOT, 'src', 'data', 'majorLocations.json'), encoding='utf-8'))['locations']
STEP_TITLES = {x['title']: x['id'] for x in json.load(open(os.path.join(ROOT, 'src', 'data', 'steps.json'), encoding='utf-8'))}


FAILED = []


def resolve(place):
    if place in LOC:
        l = LOC[place]
        return place, (l['x'], l['y'], l['plane'])
    if place.startswith('tile:'):
        x, y, p = (int(v) for v in place[5:].split(','))
        return place, (x, y, p)
    assert place.startswith('wiki:'), place
    article = place[5:]
    p = wiki_point(article)
    if not p:
        FAILED.append(article)
        p = (0, 0, 0)
    return article, p


def build():
    steps = content_combat.STEPS + content_skilling.STEPS
    by = {sk: [] for sk in SKILLS}
    for st in steps:
        assert st['skill'] in by, st['skill']
        by[st['skill']].append(st)
    files = {}
    report = []
    for sk in SKILLS:
        rows = by[sk]
        assert rows, 'no steps for ' + sk
        out = []
        for i, st in enumerate(rows, 1):
            lo, hi = st['lo'], st['hi']
            reward = None
            if st['type'] == 'QUEST' and st.get('quest'):
                xp = quest_xp(st['quest'], st.get('skill_xp', sk))
                assert xp, '%s: no %s XP in the wiki rewards of %s' % (sk, st.get('skill_xp', sk), st['quest'])
                # A chain of quest steps: each starts where the previous quest step of this skill ended.
                prev = [o for o in out if o['methodType'] == 'QUEST']
                lo = prev[-1]['levelRange'][1] if prev else START.get(sk, 1)
                hi = level_for(xp_for(lo) + xp)
                reward = {'quest': st['quest'], 'xp': xp}
                step_id = STEP_TITLES.get(st['quest'])
                if step_id:
                    reward['routeStepId'] = step_id
            name, (x, y, p) = resolve(st['place'])
            loc = {'name': name, 'tile': [x, y, p]}
            if st.get('obj'):
                loc['objectName'] = st['obj']
            if st.get('npc'):
                loc['npcName'] = st['npc']
            pre = {}
            if st.get('quest') and st['type'] != 'QUEST':
                pre['questIds'] = [st['quest']]
            if st.get('items'):
                pre['items'] = st['items']
            step = {
                'id': '%s-%02d' % (sk, i), 'skill': sk, 'levelRange': [lo, hi], 'methodType': st['type'], 'title': st['title'], 'description': st['text'],
                'targetLevel': hi, 'lane': st['lane'], 'members': st['members'], 'location': loc,
            }
            if st.get('rate'):
                step['recommendedXpRate'] = st['rate']
            if reward:
                step['reward'] = reward
            if pre:
                step['prerequisites'] = pre
            out.append(step)
            report.append('%-12s %-42s %-28s %s' % (sk, st['title'][:42], name[:28], (x, y, p)))
        files[sk] = {'skill': sk, 'start': START.get(sk, 1), 'f2pCap': F2P_CAP.get(sk, 0), 'steps': out}
    return files, report


def main():
    files, report = build()
    if FAILED:
        print('NO POINT for:', sorted(set(FAILED)))
        return 1
    if '--report' in sys.argv:
        print('\n'.join(report))
    text = {sk: json.dumps(v, indent=2, ensure_ascii=False) + '\n' for sk, v in files.items()}
    if '--check' in sys.argv:
        bad = [sk for sk, t in text.items() if not os.path.exists(os.path.join(OUT, sk + '.json')) or open(os.path.join(OUT, sk + '.json'), encoding='utf-8').read() != t]
        print('differs:', bad or 'none')
        return 1 if bad else 0
    os.makedirs(OUT, exist_ok=True)
    for sk, t in text.items():
        open(os.path.join(OUT, sk + '.json'), 'w', encoding='utf-8', newline='\n').write(t)
    print('wrote', len(text), 'files,', sum(len(v['steps']) for v in files.values()), 'steps')
    return 0


if __name__ == '__main__':
    sys.exit(main())
