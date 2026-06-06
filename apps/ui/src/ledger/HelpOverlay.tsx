import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';

const KEYBINDINGS: [string, string][] = [
  ['j / ↓', 'Select next row'],
  ['k / ↑', 'Select previous row'],
  ['Enter', 'Open detail drawer'],
  ['Escape', 'Close detail drawer'],
  ['?', 'Show this help'],
];

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Table size="small">
          <TableBody>
            {KEYBINDINGS.map(([key, desc]) => (
              <TableRow key={key}>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, border: 0 }}>{key}</TableCell>
                <TableCell sx={{ border: 0 }}>{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
