/** Only factual game prerequisites belong here. Authored route order is not a game requirement. */
export interface QuestNode { id: string; requires: readonly string[] }

export function questGraph(nodes: readonly QuestNode[]): ReadonlyMap<string, QuestNode> {
  const graph = new Map(nodes.map(node => [node.id, node]));
  if (graph.size !== nodes.length) throw new Error('Duplicate quest ID');
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`Cyclic quest prerequisite: ${id}`);
    if (visited.has(id)) return;
    const node = graph.get(id);
    if (!node) throw new Error(`Unknown quest prerequisite: ${id}`);
    visiting.add(id);
    node.requires.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  graph.forEach(node => visit(node.id));
  return graph;
}

/** Lowest unmet predecessors for an explicit goal; deterministic under catalogue reordering. */
export function prerequisiteFrontier(graph: ReadonlyMap<string, QuestNode>, goal: string, completed: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  function collect(id: string) {
    if (completed.has(id)) return;
    const node = graph.get(id);
    if (!node) throw new Error(`Unknown quest objective: ${id}`);
    const missing = node.requires.filter(id => !completed.has(id));
    if (missing.length) missing.forEach(collect);
    else out.add(id);
  }
  collect(goal);
  return [...out].sort();
}
