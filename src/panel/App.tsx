import { useMemo } from 'react';
import './styles/tokens.css';
import './styles/base.css';
import { AppShell } from './AppShell';
import { createRuntime, RuntimeProvider } from './runtime';

export function App() {
  const runtime = useMemo(() => createRuntime(), []);
  return (
    <RuntimeProvider runtime={runtime}>
      <AppShell />
    </RuntimeProvider>
  );
}
