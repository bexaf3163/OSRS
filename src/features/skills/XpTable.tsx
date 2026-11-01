// The experience table shown on the Skills spread and on each skill's page.
import { xpData } from '../../data';
import { formatXp } from '../../domain/quests/goals';
import { Table } from '../../ui/Table';

export function XpTable() {
  const half = Math.ceil(xpData.points.length / 2);
  const rows = xpData.points.slice(0, half).map((p, i) => {
    const q = xpData.points[i + half];
    return [String(p.level), formatXp(p.xp), q ? String(q.level) : '', q ? formatXp(q.xp) : ''];
  });
  return <Table head={['Level', 'XP', 'Level', 'XP']} rows={rows} caption="XP to level" />;
}
