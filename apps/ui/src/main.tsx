import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useSnapshot } from 'valtio';
import App from './App.js';
import { DevToolbar } from './dev/DevToolbar.js';
import { createAppTheme } from './theme.js';
import { themeStore } from './theme.store.js';
import './index.css';

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { mode } = useSnapshot(themeStore);
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeWrapper>
      <App />
      {import.meta.env.DEV && <DevToolbar />}
    </ThemeWrapper>
  </StrictMode>,
);
