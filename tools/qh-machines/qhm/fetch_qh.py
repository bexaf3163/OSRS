"""Downloads the Quest Helper sources (Zoinkwiz/quest-helper, the master branch) and lays them out in work/ the way the generators read them:

  work/quest-helper/          a clone of the repository (shallow, --depth 1)
  work/QH_REVISION.txt        the commit and date — which Quest Helper version was parsed
  work/qh/<Quest>.java        the main class of each route quest
  work/qhpkg/<package>/*.java   the whole quest package (helper steps like RumSmugglingStep)
  work/qhcore/ItemCollections.java
  work/QuestVarbits.java, work/QuestVarPlayer.java

The RuneLite constants (ids of items, NPCs, objects, variables) are dumped by dump_consts.py. git is needed."""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8')
import quests as C  # noqa: E402
from paths import WORK  # noqa: E402

URL = 'https://github.com/Zoinkwiz/quest-helper'


def run(*args):
    subprocess.run(args, check=True)


def out(*args):
    return subprocess.check_output(args, text=True, encoding='utf-8').strip()


def main():
    os.makedirs(WORK, exist_ok=True)
    repo = os.path.join(WORK, 'quest-helper')
    if os.path.isdir(os.path.join(repo, '.git')):
        run('git', '-C', repo, 'pull', '--ff-only')
    else:
        shutil.rmtree(repo, ignore_errors=True)  # an incompletely downloaded clone from the previous attempt
        # core.longpaths: Quest Helper has files with very long paths, without this Windows does not let them be created
        run('git', '-c', 'core.longpaths=true', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', URL, repo)
        run('git', '-C', repo, 'config', 'core.longpaths', 'true')
        run('git', '-C', repo, 'sparse-checkout', 'set', 'src/main/java')
    rev = out('git', '-C', repo, 'rev-parse', 'HEAD')
    date = out('git', '-C', repo, 'log', '-1', '--format=%cI')
    open(os.path.join(WORK, 'QH_REVISION.txt'), 'w', encoding='utf-8', newline='\n').write(rev + '\n' + date + '\n')
    print('Quest Helper', rev, date)

    index = {}
    for root, _, files in os.walk(os.path.join(repo, 'src', 'main', 'java')):
        for f in files:
            if f.endswith('.java'):
                index.setdefault(f, []).append(os.path.join(root, f))

    for d in ('qh', 'qhpkg', 'qhcore'):
        shutil.rmtree(os.path.join(WORK, d), ignore_errors=True)
        os.makedirs(os.path.join(WORK, d))
    for sid, (cls, _kind, _vid) in C.QUESTS.items():
        hits = [h for h in index.get(cls + '.java', []) if '/helpers/quests/' in h.replace('\\', '/')]
        if len(hits) != 1:
            sys.exit('%s: class %s found %d time(s): %s' % (sid, cls, len(hits), hits))
        pkg = os.path.dirname(hits[0])
        shutil.copy(hits[0], os.path.join(WORK, 'qh', cls + '.java'))
        dst = os.path.join(WORK, 'qhpkg', os.path.basename(pkg))
        os.makedirs(dst, exist_ok=True)
        for f in os.listdir(pkg):
            if f.endswith('.java'):
                shutil.copy(os.path.join(pkg, f), dst)
    for name, dest in (('ItemCollections.java', 'qhcore'), ('QuestVarbits.java', ''), ('QuestVarPlayer.java', '')):
        hits = index.get(name, [])
        if len(hits) != 1:
            sys.exit('%s found %d time(s): %s' % (name, len(hits), hits))
        shutil.copy(hits[0], os.path.join(WORK, dest, name))
    print('quests laid out:', len(C.QUESTS), '→', WORK)


if __name__ == '__main__':
    main()
