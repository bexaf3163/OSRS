"""Выгружает константы RuneLite API (id предметов, NPC, объектов, переменных, виджетов) в work/consts/*.txt: «ИМЯ значение» построчно.
Генераторы читают их вместо кода — исходники Quest Helper ссылаются на ItemID.GARLIC, NpcID.MORGAN, InterfaceID.Questjournal.TITLE.

  python qhm/dump_consts.py [путь к runelite-api-X.jar]

Без аргумента берётся самый свежий runelite-api из кэша Gradle (~/.gradle/caches/modules-2/files-2.1/net.runelite/runelite-api).
Нужен javap из JDK (JAVA_HOME или PATH)."""
import glob
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from paths import WORK  # noqa: E402

API = ['ItemID', 'NpcID', 'ObjectID', 'NullObjectID', 'VarPlayer', 'Varbits', 'WidgetInfo']
GAMEVAL = ['ItemID', 'NpcID', 'ObjectID', 'NullObjectID', 'VarPlayerID', 'VarbitID', 'AnimationID', 'SpotanimID', 'InterfaceID']
FIELD = re.compile(r'^\s+public static final int (\w+) = (-?\d+);')
CLASS = re.compile(r'^(?:public )?(?:final )?(?:abstract )?class (\S+)')


def find_jar():
    if len(sys.argv) > 1:
        return sys.argv[1]
    found = glob.glob(os.path.expanduser('~/.gradle/caches/modules-2/files-2.1/net.runelite/runelite-api/*/*/runelite-api-*.jar'))
    found = [f for f in found if not f.endswith(('-sources.jar', '-javadoc.jar'))]
    if not found:
        sys.exit('нет runelite-api в кэше Gradle: передай путь к jar первым аргументом')
    return sorted(found)[-1]


def javap_exe():
    home = os.environ.get('JAVA_HOME')
    return os.path.join(home, 'bin', 'javap') if home else 'javap'


def constants(jar, classes):
    """{полное имя класса: [(имя, значение)]}; классы, которых нет в jar, пропускаются."""
    out = {}
    for i in range(0, len(classes), 60):  # командная строка Windows короткая
        batch = classes[i:i + 60]
        run = subprocess.run([javap_exe(), '-cp', jar, '-constants'] + batch, capture_output=True, text=True, encoding='utf-8')
        current = None
        for line in run.stdout.splitlines():
            m = CLASS.match(line)
            if m:
                current = m.group(1)
                out[current] = []
                continue
            f = FIELD.match(line)
            if f and current is not None:
                out[current].append((f.group(1), int(f.group(2))))
    return out


def main():
    jar = find_jar()
    print('runelite-api:', jar)
    names = zipfile.ZipFile(jar).namelist()
    classes = {n[:-6].replace('/', '.') for n in names if n.endswith('.class')}
    os.makedirs(os.path.join(WORK, 'consts'), exist_ok=True)

    def write(fname, rows):
        with open(os.path.join(WORK, 'consts', fname), 'w', encoding='utf-8', newline='\n') as f:
            for name, value in rows:
                f.write('%s %d\n' % (name, value))
        print('%-28s %6d' % (fname, len(rows)))

    for prefix, pkg, wanted in (('api', 'net.runelite.api.', API), ('gv', 'net.runelite.api.gameval.', GAMEVAL)):
        have = [pkg + n for n in wanted if pkg + n in classes]
        table = constants(jar, have)
        for n in wanted:
            write('%s_%s.txt' % (prefix, n), table.get(pkg + n, []))
    # вложенные классы InterfaceID: «Questjournal.TITLE значение»
    nested = sorted(c for c in classes if c.startswith('net.runelite.api.gameval.InterfaceID$') and c.count('$') == 1)
    table = constants(jar, nested)
    rows = []
    for c in nested:
        short = c.split('$', 1)[1]
        rows += [('%s.%s' % (short, name), value) for name, value in table.get(c, [])]
    write('gv_InterfaceID_nested.txt', rows)


if __name__ == '__main__':
    main()
