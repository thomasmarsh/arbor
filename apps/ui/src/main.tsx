import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App.js';
import { DevToolbar } from './dev/DevToolbar.js';
import { theme } from './theme.js';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
      {import.meta.env.DEV && <DevToolbar />}
    </ThemeProvider>
  </StrictMode>,
);
