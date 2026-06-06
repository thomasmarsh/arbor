import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { StoryEntry } from './ledger.store.js';

interface StoryGroupRowProps {
  story: StoryEntry;
  collapsed: boolean;
  colSpan: number;
  onToggle: () => void;
}

export function StoryGroupRow({ story, collapsed, colSpan, onToggle }: StoryGroupRowProps) {
  return (
    <TableRow
      sx={{ bgcolor: 'action.hover', cursor: 'pointer' }}
      onClick={onToggle}
    >
      <TableCell colSpan={colSpan} sx={{ py: 0.25, pl: 4, fontSize: '0.75rem', color: 'text.secondary' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" sx={{ p: 0 }} tabIndex={-1}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Chip label={story.id} size="small" sx={{ fontFamily: 'monospace', mr: 0.5 }} />
          {story.title}
        </Box>
      </TableCell>
    </TableRow>
  );
}
