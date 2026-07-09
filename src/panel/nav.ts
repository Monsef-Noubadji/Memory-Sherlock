import type { Route } from './stores/ui';

export interface NavItem {
  route: Route;
  label: string;
  icon: string;
}

export const NAV: NavItem[] = [
  { route: 'overview', label: 'Memory Overview', icon: 'overview' },
  { route: 'snapshots', label: 'Heap Snapshots', icon: 'snapshots' },
  { route: 'leaks', label: 'Leak Candidates', icon: 'leaks' },
  { route: 'detached', label: 'Detached DOM', icon: 'detached' },
  { route: 'react', label: 'React', icon: 'react' },
  { route: 'listeners', label: 'Event Listeners', icon: 'listeners' },
  { route: 'observers', label: 'Observers', icon: 'observers' },
  { route: 'caches', label: 'Caches', icon: 'caches' },
  { route: 'timeline', label: 'Timeline', icon: 'timeline' },
  { route: 'insights', label: 'AI Insights', icon: 'insights' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];
