import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { EpicEntry } from './ledger.store.js';

interface EpicGroupRowProps {
  epic: EpicEntry;
  taskCount: number;
  collapsed: boolean;
  colSpan: number;
  onToggle: () => void;
}

export function EpicGroupRow({ epic, taskCount, collapsed, colSpan, onToggle }: EpicGroupRowProps) {
  return (
    <TableRow
      sx={{ bgcolor: 'action.selected', cursor: 'pointer' }}
      onClick={onToggle}
    >
      <TableCell colSpan={colSpan} sx={{ py: 0.5, fontWeight: 700, fontSize: '0.8rem' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" sx={{ p: 0 }} tabIndex={-1}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Chip label={epic.id} size="small" sx={{ fontFamily: 'monospace', mr: 0.5 }} />
          {epic.title}
          <Chip label={taskCount} size="small" color="default" sx={{ ml: 'auto' }} />
        </Box>
      </TableCell>
    </TableRow>
  );
}
