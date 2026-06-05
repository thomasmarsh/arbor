import { proxy } from 'valtio';

const stored = localStorage.getItem('theme-mode');
const initialMode: 'light' | 'dark' =
  stored === 'light' || stored === 'dark' ? stored : 'dark';

export const themeStore = proxy({ mode: initialMode });

export function toggleTheme() {
  themeStore.mode = themeStore.mode === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme-mode', themeStore.mode);
}
