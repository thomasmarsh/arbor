import type { DisplayGroupsResponse, TaskStatus } from '@arbor/api/ledger';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewListIcon from '@mui/icons-material/ViewList';
import type { Snapshot } from 'valtio';
import type { LedgerAction, LedgerFilters, LedgerState } from './ledger.store.js';

const TASK_STATUSES: TaskStatus[] = ['next', 'in_progress', 'todo', 'done', 'canceled'];

function deriveWaves(groups: Snapshot<DisplayGroupsResponse>): string[] {
  const all = [
    ...groups.inProgress,
    ...groups.ready,
    ...groups.blocked.map((b) => b.task),
    ...groups.done,
    ...groups.canceled,
  ];
  const seen = new Set<string>();
  const waves: string[] = [];
  for (const t of all) {
    if (!seen.has(t.wave)) {
      seen.add(t.wave);
      waves.push(t.wave);
    }
  }
  return waves;
}

function isAnyFilterActive(filters: Snapshot<LedgerFilters>): boolean {
  return (
    filters.text !== '' || filters.wave !== null || filters.status !== null || filters.kind !== null
  );
}

interface LedgerToolbarProps {
  state: Snapshot<LedgerState>;
  send: (action: LedgerAction) => void;
  groups: Snapshot<DisplayGroupsResponse> | null;
}

export function LedgerToolbar({ state, send, groups }: LedgerToolbarProps) {
  const waves = groups ? deriveWaves(groups) : [];
  const anyActive = isAnyFilterActive(state.filters);
  const viewModeRaw: unknown = state.viewMode;
  const viewMode = viewModeRaw as 'flat' | 'tree';

  return (
    <Paper variant="outlined" sx={{ mb: 1 }}>
      <Toolbar disableGutters sx={{ px: 1, gap: 1, flexWrap: 'wrap', minHeight: 'unset', py: 0.5 }}>
        <TextField
          size="small"
          placeholder="Search tasks…"
          value={state.filters.text}
          onChange={(e) => {
            send({ tag: 'setTextFilter', text: e.target.value });
          }}
          slotProps={{ htmlInput: { 'aria-label': 'search tasks' } }}
          sx={{ width: 200 }}
        />

        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel id="wave-label">Wave</InputLabel>
          <Select
            labelId="wave-label"
            label="Wave"
            value={state.filters.wave ?? ''}
            onChange={(e) => {
              send({ tag: 'setWaveFilter', wave: e.target.value === '' ? null : e.target.value });
            }}
          >
            <MenuItem value="">All</MenuItem>
            {waves.map((w) => (
              <MenuItem key={w} value={w}>
                {w}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel id="status-label">Status</InputLabel>
          <Select
            labelId="status-label"
            label="Status"
            value={state.filters.status ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              send({ tag: 'setStatusFilter', status: v === '' ? null : (v as TaskStatus) });
            }}
          >
            <MenuItem value="">All</MenuItem>
            {TASK_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={state.filters.kind ?? 'all'}
          onChange={(_e, val: string | null) => {
            if (val === null) return;
            send({ tag: 'setKindFilter', kind: val === 'all' ? null : (val as 'task' | 'spike') });
          }}
          aria-label="kind filter"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="task">Task</ToggleButton>
          <ToggleButton value="spike">Spike</ToggleButton>
        </ToggleButtonGroup>

        {anyActive && (
          <Button
            size="small"
            onClick={() => {
              send({ tag: 'clearFilters' });
            }}
          >
            Clear
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        <ToggleButtonGroup
          exclusive
          size="small"
          value={viewMode}
          onChange={(_e, val: string | null) => {
            if (val !== null) send({ tag: 'toggleViewMode' });
          }}
          aria-label="view mode"
        >
          <ToggleButton value="flat" aria-label="flat view"><ViewListIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="tree" aria-label="tree view"><AccountTreeIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={state.showAll}
              onChange={() => {
                send({ tag: 'toggleShowAll' });
              }}
            />
          }
          label={<Typography variant="caption">Show done</Typography>}
          sx={{ mr: 0 }}
        />

        {state.lastUpdated !== null && (
          <Typography variant="caption" color="text.secondary" noWrap>
            Last: {state.lastUpdated.toLocaleTimeString()}
          </Typography>
        )}
      </Toolbar>
    </Paper>
  );
}
