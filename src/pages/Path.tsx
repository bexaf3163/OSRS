// "Path": the route rail and the step workspace (PathWide). Below the wide layout the same workspace is one column and the rail is a drawer.
import { PathWide } from './PathWide';

export function PathPage(props: { focusStep?: string; focusKey: number }) {
  return <PathWide {...props} />;
}
