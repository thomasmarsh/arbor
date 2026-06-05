import { Fragment, useEffect, useRef } from 'react';
import { withLogging } from '@arbor/common';
import { useStore } from '@arbor/common/react';
import type { TaskStatus } from '@arbor/api/ledger';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import ScienceIcon from '@mui/icons-material/Science';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { liveLedgerEnv, type LedgerEnv } from './ledger.env.js';
import { ledgerReducer, initialLedgerState } from './ledger.store.js';

const STATUS_COLORS: Record<TaskStatus, 'primary' | 'warning' | 'default' | 'success'> = {
  next: 'primary',
  in_progress: 'warning',
  todo: 'default',
  done: 'success',
  canceled: 'default',
};

function StatusChip({ status }: { status: TaskStatus }) {
  return <Chip label={status} color={STATUS_COLORS[status]} size="small" />;
}

function KindIcon({ kind }: { kind: 'spike' | 'task' }) {
  return kind === 'spike' ? <ScienceIcon fontSize="small" /> : <AssignmentIcon fontSize="small" />;
}

function GroupRow({ label }: { label: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={8}
        sx={{ py: 0.5, color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem', bgcolor: 'action.hover' }}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function toggleNext(status: TaskStatus): TaskStatus {
  return status === 'next' ? 'todo' : 'next';
}

function toggleDone(status: TaskStatus): TaskStatus {
  return status === 'done' ? 'todo' : 'done';
}

function waveRanksFor(wave: string, tasks: readonly { wave: string; rank?: number | undefined }[]): number[] {
  return tasks.flatMap((t) => (t.wave === wave && t.rank !== undefined ? [t.rank] : []));
}

export function LedgerTable({ env = liveLedgerEnv }: { env?: LedgerEnv } = {}) {
  const [$, send] = useStore(withLogging('ledger', ledgerReducer), env, initialLedgerState);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const groups = $.state.loadState.tag === 'loaded' ? $.state.loadState.groups : null;
  const activeTasks = groups
    ? [...groups.inProgress, ...groups.ready, ...groups.blocked.map((b) => b.task)]
    : [];
  const doneTasks = groups ? [...groups.done, ...groups.canceled] : [];
  const allTasksForRanks = [...activeTasks, ...doneTasks];
  const visibleRows = $.state.showAll ? [...activeTasks, ...doneTasks] : activeTasks;
  const selected = visibleRows[$.state.selectedIndex];

  const rawSections = groups
    ? [
        { label: 'In Progress', tasks: groups.inProgress },
        { label: 'Ready', tasks: groups.ready },
        { label: 'Blocked', tasks: groups.blocked.map((b) => b.task) },
        ...($.state.showAll ? [{ label: 'Done', tasks: doneTasks }] : []),
      ]
    : [];

  let runningOffset = 0;
  const sections = rawSections.map((section) => {
    const startIndex = runningOffset;
    runningOffset += section.tasks.length;
    return { ...section, startIndex };
  });

  useEffect(() => { send({ tag: 'fetch' }); }, []);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [$.state.selectedIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const rowCount = visibleRows.length;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          send({ tag: 'selectUp' });
          break;
        case 'ArrowDown':
          e.preventDefault();
          send({ tag: 'selectDown', rowCount });
          break;
        case 'k': send({ tag: 'selectUp' }); break;
        case 'j': send({ tag: 'selectDown', rowCount }); break;
        case 'n':
          if (selected) send({ tag: 'setStatus', taskId: selected.id, status: toggleNext(selected.status) });
          break;
        case 'd':
          if (selected) send({ tag: 'setStatus', taskId: selected.id, status: toggleDone(selected.status) });
          break;
        case 'b':
          if (selected) send({ tag: 'bump', taskId: selected.id, waveRanks: waveRanksFor(selected.wave, allTasksForRanks) });
          break;
        case 'D':
          if (selected) send({ tag: 'defer', taskId: selected.id, waveRanks: waveRanksFor(selected.wave, allTasksForRanks) });
          break;
        case 'a': send({ tag: 'toggleShowAll' }); break;
        case 'r': send({ tag: 'refresh' }); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [send, selected, visibleRows]);

  if ($.state.loadState.tag === 'idle' || $.state.loadState.tag === 'loading') {
    return <p>Loading ledger…</p>;
  }
  if ($.state.loadState.tag === 'error') {
    return <p style={{ color: 'red' }}>Error: {$.state.loadState.message}</p>;
  }

  return (
    <Box>
      {$.state.lastUpdated !== null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mb: 0.5 }}>
          Last updated: {$.state.lastUpdated.toLocaleTimeString()}
        </Typography>
      )}
      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Wave</TableCell>
              <TableCell>Epic</TableCell>
              <TableCell>Story</TableCell>
              <TableCell>Layer</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Task</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sections.map((section) =>
              section.tasks.length > 0 ? (
                <Fragment key={section.label}>
                  <GroupRow label={section.label} />
                  {section.tasks.map((task, i) => {
                    const isSelected = section.startIndex + i === $.state.selectedIndex;
                    const isDim = task.status === 'done' || task.status === 'canceled';
                    return (
                      <TableRow
                        key={task.id}
                        ref={isSelected ? selectedRowRef : null}
                        selected={isSelected}
                        aria-selected={isSelected || undefined}
                        sx={isDim ? { opacity: 0.4 } : {}}
                      >
                        <TableCell>{task.id}</TableCell>
                        <TableCell>{task.wave}</TableCell>
                        <TableCell>
                          <Chip label={task.epic} size="small" sx={{ fontFamily: 'monospace' }} />
                        </TableCell>
                        <TableCell>
                          <Chip label={task.story} size="small" sx={{ fontFamily: 'monospace' }} />
                        </TableCell>
                        <TableCell>
                          <Chip label={task.layer} size="small" sx={{ fontFamily: 'monospace' }} />
                        </TableCell>
                        <TableCell>
                          <StatusChip status={task.status} />
                        </TableCell>
                        <TableCell>{task.size ?? '—'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <KindIcon kind={task.kind} />
                            {task.text}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ) : null
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        j/k · n=next · d=done · b=bump · D=defer · a=all · r=refresh
      </Typography>
    </Box>
  );
}
