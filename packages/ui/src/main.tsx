import { createRoot } from 'react-dom/client';
import App from './App.js';
import { DevToolbar } from './dev/DevToolbar.js';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('#root element not found');

createRoot(rootEl).render(
  // <StrictMode>
  <div>
    <App />
    {import.meta.env.DEV && <DevToolbar />}
  </div>,
  // </StrictMode>,
);
