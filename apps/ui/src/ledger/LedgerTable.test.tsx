import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { Effect, Result } from '@arbor/common';
import type { TaskStatus } from '@arbor/api/ledger';
import type { LedgerEnv } from './ledger.env.js';
import { LedgerTable } from './LedgerTable.js';
import { mockLedgerEnv, groupsWithTasks } from './ledger.env.mock.js';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const envWithTasks: LedgerEnv = {
  ...mockLedgerEnv,
  fetchQueue: Effect.send(Result.ok(groupsWithTasks)),
};

const selectedText = () => {
  const row = screen.getAllByRole('row').find((r) => r.getAttribute('aria-selected') === 'true');
  return row?.textContent ?? '';
};

describe('LedgerTable', () => {
  it('shows loading skeleton before fetch resolves', () => {
    render(<LedgerTable env={mockLedgerEnv} />);
    expect(screen.getByTestId('ledger-loading')).toBeTruthy();
  });

  it('renders an empty table when there are no tasks', async () => {
    render(<LedgerTable env={mockLedgerEnv} />);
    await waitFor(() => screen.getByRole('table'));
    expect(screen.queryAllByRole('row').length).toBe(1); // header only
  });

  it('renders an error message on fetch failure', async () => {
    const errEnv: LedgerEnv = {
      ...mockLedgerEnv,
      fetchQueue: Effect.send(Result.err('network error')),
    };
    render(<LedgerTable env={errEnv} />);
    await waitFor(() => screen.getByText(/Error: network error/));
  });

  describe('with tasks loaded', () => {
    it('renders task rows', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));
      expect(screen.getByText('Task Beta')).toBeTruthy();
    });

    it('shows last-updated timestamp in toolbar after load', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText(/Last:/));
    });

    it('hides done tasks by default', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));
      expect(screen.queryByText('Task Done')).toBeNull();
    });

    it('a toggles visibility of done tasks', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      fireEvent.keyDown(window, { key: 'a' });
      await waitFor(() => screen.getByText('Task Done'));

      fireEvent.keyDown(window, { key: 'a' });
      await waitFor(() => { expect(screen.queryByText('Task Done')).toBeNull(); });
    });

    it('renders group separator row for non-empty sections only', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));
      expect(screen.getByText('Ready')).toBeTruthy();
      expect(screen.queryByText('In Progress')).toBeNull();
      expect(screen.queryByText('Blocked')).toBeNull();
    });

    it('shows "Done" group separator when showAll is toggled on', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      fireEvent.keyDown(window, { key: 'a' });
      await waitFor(() => screen.getByText('Done'));
    });

    it('j moves selection to next row, k moves it back', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      expect(selectedText()).toContain('Task Alpha');

      fireEvent.keyDown(window, { key: 'j' });
      await waitFor(() => { expect(selectedText()).toContain('Task Beta'); });

      fireEvent.keyDown(window, { key: 'k' });
      await waitFor(() => { expect(selectedText()).toContain('Task Alpha'); });
    });

    it('k at first row stays at first row', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      fireEvent.keyDown(window, { key: 'k' });
      await waitFor(() => { expect(selectedText()).toContain('Task Alpha'); });
    });

    it('ArrowDown and ArrowUp also move selection', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await waitFor(() => { expect(selectedText()).toContain('Task Beta'); });

      fireEvent.keyDown(window, { key: 'ArrowUp' });
      await waitFor(() => { expect(selectedText()).toContain('Task Alpha'); });
    });

    it('ArrowDown calls e.preventDefault()', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      const preventDefaultMock = vi.fn();
      const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      Object.defineProperty(e, 'preventDefault', { value: preventDefaultMock, configurable: true });
      window.dispatchEvent(e);
      expect(preventDefaultMock).toHaveBeenCalledOnce();
    });

    it('ArrowUp calls e.preventDefault()', async () => {
      render(<LedgerTable env={envWithTasks} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      const preventDefaultMock = vi.fn();
      const e = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      Object.defineProperty(e, 'preventDefault', { value: preventDefaultMock, configurable: true });
      window.dispatchEvent(e);
      expect(preventDefaultMock).toHaveBeenCalledOnce();
    });

    it('n calls setStatus with toggled status', async () => {
      const calls: [number, TaskStatus][] = [];
      const env: LedgerEnv = {
        ...envWithTasks,
        setStatus: (id, status) => { calls.push([id, status]); return Effect.none(); },
      };
      render(<LedgerTable env={env} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      // Task Alpha has status 'next' → toggle to 'todo'
      fireEvent.keyDown(window, { key: 'n' });
      await waitFor(() => { expect(calls).toEqual([[1, 'todo']]); });
    });

    it('d calls setStatus with toggled done status', async () => {
      const calls: [number, TaskStatus][] = [];
      const env: LedgerEnv = {
        ...envWithTasks,
        setStatus: (id, status) => { calls.push([id, status]); return Effect.none(); },
      };
      render(<LedgerTable env={env} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      // Task Alpha status 'next' → toggleDone → 'done'
      fireEvent.keyDown(window, { key: 'd' });
      await waitFor(() => { expect(calls).toEqual([[1, 'done']]); });
    });

    it('b calls setRank with min(waveRanks)-10', async () => {
      const calls: [number, number][] = [];
      const env: LedgerEnv = {
        ...envWithTasks,
        setRank: (id, rank) => { calls.push([id, rank]); return Effect.none(); },
      };
      render(<LedgerTable env={env} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      // wave 'w1' ranks: [100, 200, 50] → min=50 → 50-10=40, max(1,40)=40
      fireEvent.keyDown(window, { key: 'b' });
      await waitFor(() => { expect(calls).toEqual([[1, 40]]); });
    });

    it('D calls setRank with max(waveRanks)+10', async () => {
      const calls: [number, number][] = [];
      const env: LedgerEnv = {
        ...envWithTasks,
        setRank: (id, rank) => { calls.push([id, rank]); return Effect.none(); },
      };
      render(<LedgerTable env={env} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      // wave 'w1' ranks: [100, 200, 50] → max=200 → 200+10=210
      fireEvent.keyDown(window, { key: 'D' });
      await waitFor(() => { expect(calls).toEqual([[1, 210]]); });
    });

    it('r triggers a reload', async () => {
      let fetchCount = 0;
      const env: LedgerEnv = {
        ...envWithTasks,
        fetchQueue: Effect.of((send) => {
          fetchCount++;
          send(Result.ok(groupsWithTasks));
        }),
      };
      render(<LedgerTable env={env} />);
      await waitFor(() => screen.getByText('Task Alpha'));
      expect(fetchCount).toBe(1);

      fireEvent.keyDown(window, { key: 'r' });
      await waitFor(() => { expect(fetchCount).toBe(2); });
    });

    it('ignores keyboard input when target is an input element', async () => {
      const calls: unknown[] = [];
      const env: LedgerEnv = {
        ...envWithTasks,
        setStatus: (id, status) => { calls.push([id, status]); return Effect.none(); },
      };
      render(<LedgerTable env={env} />);
      await waitFor(() => screen.getByText('Task Alpha'));

      const input = document.createElement('input');
      document.body.appendChild(input);
      fireEvent.keyDown(input, { key: 'n' });
      // No status call should have been made
      expect(calls).toEqual([]);
      document.body.removeChild(input);
    });
  });

  it('does not respond to keyboard after unmount', async () => {
    const calls: unknown[] = [];
    const env: LedgerEnv = {
      ...envWithTasks,
      setStatus: (id, status) => { calls.push([id, status]); return Effect.none(); },
    };
    const { unmount } = render(<LedgerTable env={env} />);
    await waitFor(() => screen.getByText('Task Alpha'));

    unmount();
    fireEvent.keyDown(window, { key: 'n' });
    expect(calls).toEqual([]);

    vi.useRealTimers(); // guard against timer leaks from prior tests
  });
});
