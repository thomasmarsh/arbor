import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LedgerToolbar } from './LedgerToolbar.js';
import { initialLedgerState, initialFilters } from './ledger.store.js';
import type { LedgerAction, LedgerState } from './ledger.store.js';
import { groupsWithTasks, emptyGroups } from './ledger.env.mock.js';
import type { DisplayGroupsResponse } from '@arbor/api/ledger';
import type { Snapshot } from 'valtio';

afterEach(cleanup);

function makeState(overrides: Partial<LedgerState> = {}): Snapshot<LedgerState> {
  return { ...initialLedgerState, ...overrides };
}

const loadedGroups = groupsWithTasks as unknown as Snapshot<DisplayGroupsResponse>;
const noGroups = emptyGroups as unknown as Snapshot<DisplayGroupsResponse>;

describe('LedgerToolbar', () => {
  it('dispatches setTextFilter immediately on input change', () => {
    const send = vi.fn<(action: LedgerAction) => void>();
    render(<LedgerToolbar state={makeState()} send={send} groups={noGroups} />);

    fireEvent.change(screen.getByRole('textbox', { name: /search tasks/i }), { target: { value: 'auth' } });
    expect(send).toHaveBeenCalledWith({ tag: 'setTextFilter', text: 'auth' });
  });

  it('dispatches setWaveFilter with the chosen wave', async () => {
    const user = userEvent.setup();
    const send = vi.fn<(action: LedgerAction) => void>();
    render(<LedgerToolbar state={makeState()} send={send} groups={loadedGroups} />);

    await user.click(screen.getByLabelText('Wave'));
    await user.click(await screen.findByRole('option', { name: 'w1' }));

    expect(send).toHaveBeenCalledWith({ tag: 'setWaveFilter', wave: 'w1' });
  });

  it('dispatches setStatusFilter with the chosen status', async () => {
    const user = userEvent.setup();
    const send = vi.fn<(action: LedgerAction) => void>();
    render(<LedgerToolbar state={makeState()} send={send} groups={noGroups} />);

    await user.click(screen.getByLabelText('Status'));
    await user.click(await screen.findByRole('option', { name: 'next' }));

    expect(send).toHaveBeenCalledWith({ tag: 'setStatusFilter', status: 'next' });
  });

  it('dispatches setKindFilter when kind toggle is clicked', () => {
    const send = vi.fn<(action: LedgerAction) => void>();
    render(<LedgerToolbar state={makeState()} send={send} groups={noGroups} />);

    fireEvent.click(screen.getByRole('button', { name: 'Spike' }));
    expect(send).toHaveBeenCalledWith({ tag: 'setKindFilter', kind: 'spike' });
  });

  it('hides Clear button when no filter is active', () => {
    const send = vi.fn<(action: LedgerAction) => void>();
    render(<LedgerToolbar state={makeState()} send={send} groups={noGroups} />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('shows Clear button when a filter is active', () => {
    const send = vi.fn<(action: LedgerAction) => void>();
    render(
      <LedgerToolbar
        state={makeState({ filters: { ...initialFilters, wave: 'w3' } })}
        send={send}
        groups={noGroups}
      />,
    );
    expect(screen.getByRole('button', { name: /clear/i })).toBeTruthy();
  });

  it('dispatches clearFilters when Clear is clicked', () => {
    const send = vi.fn<(action: LedgerAction) => void>();
    render(
      <LedgerToolbar
        state={makeState({ filters: { ...initialFilters, wave: 'w3' } })}
        send={send}
        groups={noGroups}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(send).toHaveBeenCalledWith({ tag: 'clearFilters' });
  });

  it('dispatches toggleShowAll when Show done switch is toggled', () => {
    const send = vi.fn<(action: LedgerAction) => void>();
    render(<LedgerToolbar state={makeState()} send={send} groups={noGroups} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(send).toHaveBeenCalledWith({ tag: 'toggleShowAll' });
  });
});
