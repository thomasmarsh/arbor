import type { TaskEntry, TaskStatus } from '@arbor/api/ledger';
import { withLogging } from '@arbor/common';
import { useStore } from '@arbor/common/react';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ScienceIcon from '@mui/icons-material/Science';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Fragment, useRef, type Ref } from 'react';
import type { Snapshot } from 'valtio';
import { DndSortWrapper, useDndItem } from './dnd-adapter.js';
import { EpicGroupRow } from './EpicGroupRow.js';
import { HelpOverlay } from './HelpOverlay.js';
import { liveLedgerEnv, type LedgerEnv } from './ledger.env.js';
import type {
  ColId,
  EpicEntry,
  LedgerAction,
  LedgerFilters,
  LedgerState,
  StoryEntry,
  WorkOrderResponse,
} from './ledger.store.js';
import {
  applyFilters,
  initialLedgerState,
  ledgerReducer,
  ledgerSubscriptions,
} from './ledger.store.js';
import { LedgerDetailDrawer } from './LedgerDetailDrawer.js';
import { LedgerToolbar } from './LedgerToolbar.js';
import { StoryGroupRow } from './StoryGroupRow.js';

// Task-column widths cycle through a deterministic spread so rows look natural.
const TASK_WIDTHS = [160, 130, 190, 145, 175, 120, 165, 140];

const COLUMN_LABELS: Record<ColId, string> = {
  id: 'ID',
  wave: 'Wave',
  epic: 'Epic',
  story: 'Story',
  layer: 'Layer',
  status: 'Status',
  size: 'Size',
  task: 'Task',
};

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

const COLUMN_RENDER: Record<ColId, (task: Snapshot<TaskEntry>) => React.ReactNode> = {
  id: (t) => t.id,
  wave: (t) => t.wave,
  epic: (t) => <Chip label={t.epic} size="small" sx={{ fontFamily: 'monospace' }} />,
  story: (t) => <Chip label={t.story} size="small" sx={{ fontFamily: 'monospace' }} />,
  layer: (t) => <Chip label={t.layer} size="small" sx={{ fontFamily: 'monospace' }} />,
  status: (t) => <StatusChip status={t.status} />,
  size: (t) => t.size ?? '—',
  task: (t) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <KindIcon kind={t.kind} />
      {t.text}
    </Box>
  ),
};

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
                <TableCell>
                  <Skeleton width={24} />
                </TableCell>
                <TableCell>
                  <Skeleton width={36} />
                </TableCell>
                <TableCell>
                  <Skeleton variant="rounded" width={32} height={24} />
                </TableCell>
                <TableCell>
                  <Skeleton variant="rounded" width={32} height={24} />
                </TableCell>
                <TableCell>
                  <Skeleton variant="rounded" width={48} height={24} />
                </TableCell>
                <TableCell>
                  <Skeleton variant="rounded" width={64} height={24} />
                </TableCell>
                <TableCell>
                  <Skeleton width={16} />
                </TableCell>
                <TableCell>
                  <Skeleton width={TASK_WIDTHS[i % TASK_WIDTHS.length] ?? 150} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function GroupRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        sx={{
          py: 0.5,
          color: 'text.secondary',
          fontWeight: 600,
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
        }}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function SortableColHeader({ id }: { id: ColId }) {
  const { ref, style, handleProps } = useDndItem(id);
  return (
    <TableCell ref={ref} style={style} {...handleProps}>
      {COLUMN_LABELS[id]}
    </TableCell>
  );
}

function TaskRow({
  task,
  isSelected,
  rowRef,
  columnOrder,
  onClick,
  dim,
  pendingDeps,
}: {
  task: Snapshot<TaskEntry>;
  isSelected: boolean;
  rowRef: Ref<HTMLTableRowElement> | null;
  columnOrder: readonly ColId[];
  onClick: () => void;
  dim?: boolean;
  pendingDeps?: number[];
}) {
  const isDim = dim ?? (task.status === 'done' || task.status === 'canceled');
  return (
    <TableRow
      ref={rowRef}
      selected={isSelected}
      aria-selected={isSelected || undefined}
      sx={{ ...(isDim ? { opacity: 0.4 } : {}), cursor: 'pointer' }}
      onClick={onClick}
    >
      {columnOrder.map((id) => (
        <TableCell key={id}>
          {id === 'task' && pendingDeps && pendingDeps.length > 0
            ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                {COLUMN_RENDER[id](task)}
                <Chip
                  label={`waiting on: ${pendingDeps.map((d) => `#${String(d)}`).join(', ')}`}
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: '0.65rem', height: 18 }}
                />
              </Box>
            )
            : COLUMN_RENDER[id](task)}
        </TableCell>
      ))}
    </TableRow>
  );
}

function TreeTableBody({
  epicMeta,
  storyMeta,
  allTasks,
  collapsedEpics,
  collapsedStories,
  columnOrder,
  selectedId,
  selectedRowRef,
  send,
}: {
  epicMeta: EpicEntry[];
  storyMeta: StoryEntry[];
  allTasks: TaskEntry[];
  collapsedEpics: ReadonlySet<string>;
  collapsedStories: ReadonlySet<string>;
  columnOrder: readonly ColId[];
  selectedId: number | null;
  selectedRowRef: Ref<HTMLTableRowElement>;
  send: (a: LedgerAction) => void;
}) {
  return (
    <>
      {epicMeta.map((epic) => {
        const epicTasks = allTasks.filter((t) => t.epic === epic.id);
        if (epicTasks.length === 0) return null;
        const isEpicCollapsed = collapsedEpics.has(epic.id);
        return (
          <Fragment key={epic.id}>
            <EpicGroupRow
              epic={epic}
              taskCount={epicTasks.length}
              collapsed={isEpicCollapsed}
              colSpan={columnOrder.length}
              onToggle={() => {
                send({ tag: 'toggleEpicCollapse', epicId: epic.id });
              }}
            />
            {!isEpicCollapsed &&
              storyMeta
                .filter((s) => s.epic === epic.id)
                .map((story) => {
                  const storyTasks = epicTasks.filter((t) => t.story === story.id);
                  if (storyTasks.length === 0) return null;
                  const isStoryCollapsed = collapsedStories.has(story.id);
                  return (
                    <Fragment key={story.id}>
                      <StoryGroupRow
                        story={story}
                        collapsed={isStoryCollapsed}
                        colSpan={columnOrder.length}
                        onToggle={() => {
                          send({ tag: 'toggleStoryCollapse', storyId: story.id });
                        }}
                      />
                      {!isStoryCollapsed &&
                        storyTasks.map((task) => {
                          const isSelected = task.id === selectedId;
                          return (
                            <TaskRow
                              key={task.id}
                              task={task}
                              isSelected={isSelected}
                              rowRef={isSelected ? selectedRowRef : null}
                              columnOrder={columnOrder}
                              onClick={() => {
                                send({ tag: 'selectRow', taskId: task.id });
                              }}
                            />
                          );
                        })}
                    </Fragment>
                  );
                })}
          </Fragment>
        );
      })}
    </>
  );
}

export function LedgerTable({ env = liveLedgerEnv }: { env?: LedgerEnv } = {}) {
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const [$, send, watch] = useStore(
    withLogging('ledger', ledgerReducer),
    env,
    initialLedgerState,
    { tag: 'fetch' },
    ledgerSubscriptions,
  );
  watch(
    (s: LedgerState) => s.selectedId ?? -1,
    () => {
      selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
    },
  );

  const groups = $.state.loadState.tag === 'loaded' ? $.state.loadState.groups : null;
  // Snapshot<LedgerFilters> is structurally identical to LedgerFilters (all primitives)
  const filters = $.state.filters as LedgerFilters;
  // Two-statement splits for Snapshot<string-literal-union> and Snapshot<Set<string>>
  const colOrderRaw: unknown = $.state.columnOrder;
  const columnOrder = colOrderRaw as readonly ColId[];
  const viewModeRaw: unknown = $.state.viewMode;
  const viewMode = viewModeRaw as 'flat' | 'tree' | 'workOrder';
  const workOrderRaw: unknown =
    $.state.workOrderLoadState.tag === 'loaded'
      ? $.state.workOrderLoadState.workOrder
      : null;
  const workOrder = workOrderRaw as WorkOrderResponse | null;
  const collapsedEpicsRaw: unknown = $.state.collapsedEpics;
  const collapsedEpics = collapsedEpicsRaw as ReadonlySet<string>;
  const collapsedStoriesRaw: unknown = $.state.collapsedStories;
  const collapsedStories = collapsedStoriesRaw as ReadonlySet<string>;
  const epicMetaRaw: unknown = $.state.epicMeta;
  const epicMeta = epicMetaRaw as EpicEntry[];
  const storyMetaRaw: unknown = $.state.storyMeta;
  const storyMeta = storyMetaRaw as StoryEntry[];

  const rawSections = groups
    ? [
        {
          label: 'In Progress',
          tasks: applyFilters([...groups.inProgress] as TaskEntry[], filters),
        },
        { label: 'Ready', tasks: applyFilters([...groups.ready] as TaskEntry[], filters) },
        {
          label: 'Blocked',
          tasks: applyFilters(groups.blocked.map((b) => b.task) as TaskEntry[], filters),
        },
        ...($.state.showAll
          ? [
              {
                label: 'Done',
                tasks: applyFilters(groups.done.concat(groups.canceled) as TaskEntry[], filters),
              },
            ]
          : []),
      ]
    : [];

  let runningOffset = 0;
  const sections = rawSections.map((section) => {
    const startIndex = runningOffset;
    runningOffset += section.tasks.length;
    return { ...section, startIndex };
  });

  const allTasksForTree: TaskEntry[] = groups
    ? [
        ...applyFilters([...groups.inProgress] as TaskEntry[], filters),
        ...applyFilters([...groups.ready] as TaskEntry[], filters),
        ...applyFilters(groups.blocked.map((b) => b.task) as TaskEntry[], filters),
        ...($.state.showAll
          ? applyFilters(groups.done.concat(groups.canceled) as TaskEntry[], filters)
          : []),
      ]
    : [];

  const selectedIdRaw: unknown = $.state.selectedId;
  const selectedId = selectedIdRaw as number | null;

  if ($.state.loadState.tag === 'idle' || $.state.loadState.tag === 'loading') {
    return <LedgerSkeleton />;
  }
  if ($.state.loadState.tag === 'error') {
    return <p style={{ color: 'red' }}>Error: {$.state.loadState.message}</p>;
  }

  return (
    <Box>
      <LedgerToolbar state={$.state} send={send} groups={groups} />
      <TableContainer>
        <Table stickyHeader size="small">
          <TableHead>
            <DndSortWrapper<ColId>
              ids={columnOrder}
              onReorder={(fromId, toId) => {
                send({ tag: 'reorderColumn', fromId, toId });
              }}
              direction="horizontal"
            >
              <TableRow>
                {columnOrder.map((id) => (
                  <SortableColHeader key={id} id={id} />
                ))}
              </TableRow>
            </DndSortWrapper>
          </TableHead>
          <TableBody>
            {viewMode === 'flat' &&
              sections.map((section) =>
                section.tasks.length > 0 ? (
                  <Fragment key={section.label}>
                    <GroupRow label={section.label} colSpan={columnOrder.length} />
                    {section.tasks.map((task) => {
                      const isSelected = task.id === $.state.selectedId;
                      return (
                        <TaskRow
                          key={task.id}
                          task={task}
                          isSelected={isSelected}
                          rowRef={isSelected ? selectedRowRef : null}
                          columnOrder={columnOrder}
                          onClick={() => {
                            send({ tag: 'selectRow', taskId: task.id });
                          }}
                        />
                      );
                    })}
                  </Fragment>
                ) : null,
              )}
            {viewMode === 'tree' && (
              <TreeTableBody
                epicMeta={epicMeta}
                storyMeta={storyMeta}
                allTasks={allTasksForTree}
                collapsedEpics={collapsedEpics}
                collapsedStories={collapsedStories}
                columnOrder={columnOrder}
                selectedId={selectedId}
                selectedRowRef={selectedRowRef}
                send={send}
              />
            )}
            {viewMode === 'workOrder' &&
              workOrder &&
              applyFilters(workOrder.tasks, filters).map((task) => {
                const isSelected = task.id === $.state.selectedId;
                const taskPendingDeps: number[] =
                  workOrder.pendingDeps[String(task.id)] ?? [];
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isSelected={isSelected}
                    rowRef={isSelected ? selectedRowRef : null}
                    columnOrder={columnOrder}
                    onClick={() => { send({ tag: 'selectRow', taskId: task.id }); }}
                    dim={taskPendingDeps.length > 0}
                    {...(taskPendingDeps.length > 0 ? { pendingDeps: taskPendingDeps } : {})}
                  />
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>
      <LedgerDetailDrawer state={$.state} send={send} />
      {$.state.helpOpen && (
        <HelpOverlay
          open
          onClose={() => {
            send({ tag: 'closeHelp' });
          }}
        />
      )}
    </Box>
  );
}
