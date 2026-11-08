// "Path": the planner's order and the step workspace (PathWide); the old guide's walkthrough rail is gone (2.82.4).
import { PathWide } from './PathWide';

export function PathPage(props: { focusStep?: string; focusKey: number }) {
  return <PathWide {...props} />;
}
