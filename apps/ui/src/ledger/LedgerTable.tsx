import { Fragment, useEffect, useRef, type Ref } from 'react';
import { withLogging } from '@arbor/common';
import { useStore } from '@arbor/common/react';
import type { TaskEntry, TaskStatus } from '@arbor/api/ledger';
import type { Snapshot } from 'valtio';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import ScienceIcon from '@mui/icons-material/Science';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { liveLedgerEnv, type LedgerEnv } from './ledger.env.js';
import { ledgerReducer, initialLedgerState } from './ledger.store.js';
import { LedgerDetailDrawer } from './LedgerDetailDrawer.js';
import { useLedgerKeyboard } from './useLedgerKeyboard.js';

// Task-column widths cycle through a deterministic spread so rows look natural.
const TASK_WIDTHS = [160, 130, 190, 145, 175, 120, 165, 140];

function LedgerSkeleton() {
  return (
    <Box data-testid="ledger-loading">
      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {['ID', 'Wave', 'Epic', 'Story', 'Layer', 'Status', 'Size', 'Task'].map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 8 }, (_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton width={24} /></TableCell>
                <TableCell><Skeleton width={36} /></TableCell>
                <TableCell><Skeleton variant="rounded" width={32} height={24} /></TableCell>
                <TableCell><Skeleton variant="rounded" width={32} height={24} /></TableCell>
                <TableCell><Skeleton variant="rounded" width={48} height={24} /></TableCell>
                <TableCell><Skeleton variant="rounded" width={64} height={24} /></TableCell>
                <TableCell><Skeleton width={16} /></TableCell>
                <TableCell><Skeleton width={TASK_WIDTHS[i % TASK_WIDTHS.length] ?? 150} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

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

function TaskRow({
  task, isSelected, rowRef,
}: {
  task: Snapshot<TaskEntry>;
  isSelected: boolean;
  rowRef: Ref<HTMLTableRowElement> | null;
}) {
  const isDim = task.status === 'done' || task.status === 'canceled';
  return (
    <TableRow
      ref={rowRef}
      selected={isSelected}
      aria-selected={isSelected || undefined}
      sx={isDim ? { opacity: 0.4 } : {}}
    >
      <TableCell>{task.id}</TableCell>
      <TableCell>{task.wave}</TableCell>
      <TableCell><Chip label={task.epic}  size="small" sx={{ fontFamily: 'monospace' }} /></TableCell>
      <TableCell><Chip label={task.story} size="small" sx={{ fontFamily: 'monospace' }} /></TableCell>
      <TableCell><Chip label={task.layer} size="small" sx={{ fontFamily: 'monospace' }} /></TableCell>
      <TableCell><StatusChip status={task.status} /></TableCell>
      <TableCell>{task.size ?? '—'}</TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <KindIcon kind={task.kind} />
          {task.text}
        </Box>
      </TableCell>
    </TableRow>
  );
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

  useLedgerKeyboard(send, selected, visibleRows, allTasksForRanks);

  if ($.state.loadState.tag === 'idle' || $.state.loadState.tag === 'loading') {
    return <LedgerSkeleton />;
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
                    return (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isSelected={isSelected}
                        rowRef={isSelected ? selectedRowRef : null}
                      />
                    );
                  })}
                </Fragment>
              ) : null
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        j/k · n=next · d=done · b=bump · D=defer · a=all · r=refresh · Enter=detail
      </Typography>
      <LedgerDetailDrawer state={$.state} send={send} />
    </Box>
  );
}
