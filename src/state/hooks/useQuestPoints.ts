// Quest points as shown and checked: the game's own count while it is connected, else the count from the route steps. The two differ when
// a step is marked done that the game does not count, such as an optional quest that cannot be finished alone (Shield of Arrav).

import { useBridge } from '../bridge';
import { useStore } from '../store';

export function useQuestPoints(): number {
  const { qp } = useStore();
  const { questPoints } = useBridge();
  return questPoints ?? qp;
}
