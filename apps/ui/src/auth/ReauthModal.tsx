import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

export function ReauthModal() {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <Paper sx={{ p: 4, borderRadius: 2, maxWidth: 360 }}>
        <Typography gutterBottom>Your session has expired. Please log in again.</Typography>
        <Typography>A login window has been opened.</Typography>
      </Paper>
    </Box>
  );
}
