# Машины состояний Quest Helper — генераторы

Плагин ведёт шаг квеста так же, как [Quest Helper](https://github.com/Zoinkwiz/quest-helper): по тому, что игрок сделал (сообщения чата и диалогов,
дневник квеста, предметы, место, переменные), а не только по месту и сумке. Порядок и условия Quest Helper (`ConditionalStep`) вынуты из его
исходников и лежат в `src/data/questMachines.json` — это ресурс плагина (`QhMachine.java` читает его и считает).
Здесь — скрипты, которыми файл собирается. Ничего из этого не нужно для сборки приложения и плагина: нужно, когда вышла новая версия Quest Helper
или в маршрут добавили квест.

Лицензия Quest Helper (BSD 2-Clause) — в `THIRD_PARTY_NOTICES.md` в корне репозитория.

## Что где

| Файл | Зачем |
|---|---|
| `qhm/quests.py` | Квесты маршрута: шаг маршрута → класс Quest Helper, вид и номер переменной |
| `qhm/fetch_qh.py` | Клонирует Quest Helper (`--depth 1`, только `src/main/java`) и раскладывает исходники квестов в `work/` |
| `qhm/dump_consts.py` | Выгружает константы RuneLite API (`ItemID.GARLIC`, `NpcID.MORGAN`, `InterfaceID.Questjournal.TITLE`…) в `work/consts/` |
| `qhm/jparse.py`, `qhm/interp.py` | Разбор Java-подмножества и «символьное» выполнение `loadSteps()` каждого квеста: получается дерево шагов с условиями |
| `qhm/build.py`, `qhm/build_machines.py` | Из дерева — таблицы узлов и условий; `build_machines.py` пишет `src/data/questMachines.json` |
| `qhm/qeval.py` | Эталонный вычислитель (Python): три значения «да / нет / не знаю», защёлки, сообщения чата |
| `qhm/golden.py` | Случайные и подобранные наборы фактов → ответы эталона → `runelite-bridge/src/test/resources/qh-golden.json` |
| `qhm/steps_info.py`, `qhm/export_fixture.py` | Клетка, тип и id каждого шага Quest Helper → `tests/fixtures/qh-steps.json` |
| `qhm/reach.py`, `qhm/gaps.py`, `qhm/compare_pos.py`, `qhm/compare_hl.py` | Сверка наших данных с Quest Helper: недостижимые строки, шаги без строки, клетки, подсветка |
| `qhm/pretty.py` | Машина квеста читаемым деревом: `python qhm/pretty.py S2-09 1` |

## Как обновить после новой версии Quest Helper

Нужны git, Python 3, JDK (`JAVA_HOME`, из него берётся `javap`) и собранный плагин (`runelite-bridge`, чтобы в кэше Gradle был `runelite-api`).
Рабочая папка `work/` (в git не попадает) — или любая другая через `QH_WORK`. Пути длинные: `fetch_qh.py` включает `core.longpaths`.

```bash
cd tools/qh-machines
python qhm/fetch_qh.py            # исходники Quest Helper → work/ (в work/QH_REVISION.txt — какой коммит разобран)
python qhm/dump_consts.py         # константы RuneLite → work/consts/
python qhm/build_machines.py      # src/data/questMachines.json (с --check только сверяет, ничего не пишет)
python qhm/golden.py              # эталонные вектора для QhGoldenTest
python qhm/steps_info.py && python qhm/export_fixture.py   # tests/fixtures/qh-steps.json
```

Потом проверки: `npm test` (`tests/questMachines.test.ts` скажет, у каких строк `k` больше нет среди шагов Quest Helper, а у каких клетка или
подсветка разошлись) и `cd runelite-bridge && ./gradlew test` (`QhGoldenTest`: Java и эталон отвечают одинаково на всех векторах).

Если Quest Helper переименовал или добавил шаг:

- у строк в `src/data/questStages.json` поле `k` — имя шага Quest Helper; его ставит человек (строки переведены и выверены вручную). Переименованный шаг
  — поправить `k` у строки. Новый шаг без строки показывает `qhm/gaps.py`: решить, нужна ли ему строка в списке.
- число недостижимых строк (`qhm/reach.py`) и шагов без строки (`qhm/gaps.py`) в `tests/questMachines.test.ts` ограничено сверху: расти оно не должно.

Что генератор не умеет (плагин в этих местах скажет «не знаю», а не «нет»): условия, которые читают клиент напрямую (стрелка на NPC, `NpcInteractingRequirement`,
`InInstanceRequirement`, `RuneliteRequirement`, предметы на земле). `DialogRequirement` с `mustBeActive` и `allowMesbox` считается как обычный: в данных
сейчас таких условий нет, при появлении — доработать `interp.py` (`make_dialog`) и `qeval.py`/`QhMachine.java`.

`build_machines.py --check` на свежем клоне Quest Helper (коммит `75b623a`, 16.09.2026) и свежей выгрузке констант (runelite-api 1.12.39) даёт файл,
побайтно совпадающий с лежащим в репозитории: так проверено, что генератор воспроизводим.
