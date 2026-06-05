import { createTheme, type Theme } from '@mui/material/styles';

export const theme: Theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0d0d0d',
      paper: '#161616',
    },
    primary: {
      main: '#4a9eff',
    },
  },
});
