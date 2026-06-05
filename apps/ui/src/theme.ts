import { createTheme, type Theme } from '@mui/material/styles';

export function createAppTheme(mode: 'light' | 'dark'): Theme {
  return createTheme({
    palette: {
      mode,
      ...(mode === 'dark'
        ? {
            background: { default: '#0d0d0d', paper: '#161616' },
            primary: { main: '#4a9eff' },
          }
        : {}),
    },
  });
}
