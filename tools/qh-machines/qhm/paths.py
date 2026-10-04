"""Пути генераторов: корень репозитория и рабочая папка с исходниками Quest Helper (её наполняет fetch_qh.py, в git она не попадает)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(TOOLS, '..', '..'))
WORK = os.environ.get('QH_WORK') or os.path.join(TOOLS, 'work')
MACHINES = os.path.join(REPO, 'src', 'data', 'questMachines.json')
STAGES = os.path.join(REPO, 'src', 'data', 'questStages.json')
STEPS = os.path.join(REPO, 'src', 'data', 'steps.json')
GOLDEN = os.path.join(REPO, 'runelite-bridge', 'src', 'test', 'resources', 'qh-golden.json')
FIXTURE = os.path.join(REPO, 'tests', 'fixtures', 'qh-steps.json')
