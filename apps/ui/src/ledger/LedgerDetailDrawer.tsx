import type { DisplayGroupsResponse, TaskEntry } from '@arbor/api/ledger';
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import 'highlight.js/styles/github-dark.css';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { Snapshot } from 'valtio';
import type { LedgerAction, LedgerState } from './ledger.store.js';

interface LedgerDetailDrawerProps {
  state: Snapshot<LedgerState>;
  send: (action: LedgerAction) => void;
}

function findTask(groups: DisplayGroupsResponse, id: number): TaskEntry | undefined {
  return (
    groups.inProgress.find((t) => t.id === id) ??
    groups.ready.find((t) => t.id === id) ??
    groups.blocked.find((b) => b.task.id === id)?.task ??
    groups.done.find((t) => t.id === id) ??
    groups.canceled.find((t) => t.id === id)
  );
}

const MIN_WIDTH = 240;

export function LedgerDetailDrawer({ state, send }: LedgerDetailDrawerProps) {
  const [drawerWidth, setDrawerWidth] = useState(520);
  const { detailTaskId, planDoc, loadState } = state;
  const open = detailTaskId !== null;

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = drawerWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setDrawerWidth(Math.max(MIN_WIDTH, Math.min(window.innerWidth, startWidth + delta)));
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
  const groups = loadState.tag === 'loaded' ? loadState.groups : null;
  const task =
    open && groups !== null ? findTask(groups as DisplayGroupsResponse, detailTaskId) : undefined;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => {
        send({ tag: 'closeDetail' });
      }}
      sx={{
        '& .MuiDrawer-paper': {
          width: `min(${String(drawerWidth)}px, 100vw)`,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box
        onMouseDown={onResizeMouseDown}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'ew-resize',
          zIndex: 1,
          '&:hover': { bgcolor: 'divider' },
        }}
      />
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="subtitle1" sx={{ flexGrow: 1, fontFamily: 'monospace' }}>
            {task ? `#${String(task.id)}  ${task.text}` : '—'}
          </Typography>
          {task && <Chip label={task.status} size="small" sx={{ mr: 1 }} />}
          <IconButton
            edge="end"
            onClick={() => {
              send({ tag: 'closeDetail' });
            }}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {task && (
        <Box
          sx={{
            px: 2,
            py: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Chip label={`epic: ${task.epic}`} size="small" sx={{ fontFamily: 'monospace' }} />
          <Chip label={`story: ${task.story}`} size="small" sx={{ fontFamily: 'monospace' }} />
          <Chip label={`wave: ${task.wave}`} size="small" sx={{ fontFamily: 'monospace' }} />
          <Chip label={`layer: ${task.layer}`} size="small" sx={{ fontFamily: 'monospace' }} />
          <Chip label={`kind: ${task.kind}`} size="small" sx={{ fontFamily: 'monospace' }} />
          {task.size && (
            <Chip label={`size: ${task.size}`} size="small" sx={{ fontFamily: 'monospace' }} />
          )}
          {task.deps.map((dep) => (
            <Chip
              key={dep}
              label={String(dep)}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'monospace' }}
            />
          ))}
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
        {planDoc.tag === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {planDoc.tag === 'error' && <Alert severity="error">{planDoc.message}</Alert>}
        {planDoc.tag === 'loaded' && (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              pre: ({ children, ...props }) => (
                <pre
                  {...props}
                  style={{
                    background: '#1e1e1e',
                    borderRadius: 4,
                    padding: '12px',
                    overflowX: 'auto',
                  }}
                >
                  {children}
                </pre>
              ),
              table: ({ children }) => (
                <Box sx={{ overflowX: 'auto', mb: 2 }}>
                  <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                    {children}
                  </Table>
                </Box>
              ),
              thead: ({ children }) => <TableHead>{children}</TableHead>,
              tbody: ({ children }) => <TableBody>{children}</TableBody>,
              tr: ({ children }) => <TableRow hover>{children}</TableRow>,
              th: ({ children }) => (
                <TableCell
                  sx={{
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    borderBottom: 2,
                    borderColor: 'divider',
                  }}
                >
                  {children}
                </TableCell>
              ),
              td: ({ children }) => <TableCell sx={{ verticalAlign: 'top' }}>{children}</TableCell>,
            }}
          >
            {planDoc.content}
          </ReactMarkdown>
        )}
      </Box>
    </Drawer>
  );
}
