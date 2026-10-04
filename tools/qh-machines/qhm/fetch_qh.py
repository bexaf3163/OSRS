"""Скачивает исходники Quest Helper (Zoinkwiz/quest-helper, ветка master) и раскладывает в work/ так, как их читают генераторы:

  work/quest-helper/          клон репозитория (мелкий, --depth 1)
  work/QH_REVISION.txt        коммит и дата — какую версию Quest Helper разобрали
  work/qh/<Квест>.java        главный класс каждого квеста маршрута
  work/qhpkg/<пакет>/*.java   весь пакет квеста (вспомогательные шаги вроде RumSmugglingStep)
  work/qhcore/ItemCollections.java
  work/QuestVarbits.java, work/QuestVarPlayer.java

Константы RuneLite (id предметов, NPC, объектов, переменных) выгружает dump_consts.py. Нужен git."""
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
        shutil.rmtree(repo, ignore_errors=True)  # недокачанный клон прошлой попытки
        # core.longpaths: в Quest Helper есть файлы с очень длинными путями, без этого Windows не даёт их создать
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
            sys.exit('%s: класс %s найден %d раз(а): %s' % (sid, cls, len(hits), hits))
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
            sys.exit('%s найден %d раз(а): %s' % (name, len(hits), hits))
        shutil.copy(hits[0], os.path.join(WORK, dest, name))
    print('разложено квестов:', len(C.QUESTS), '→', WORK)


if __name__ == '__main__':
    main()
