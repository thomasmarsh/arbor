import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { DisplayGroupsResponse } from '@arbor/api/ledger';
import type { LedgerState } from './ledger.store.js';
import { initialLedgerState } from './ledger.store.js';
import { LedgerDetailDrawer } from './LedgerDetailDrawer.js';
import { emptyGroups } from './ledger.env.mock.js';

afterEach(cleanup);

const task1 = {
  type: 'task' as const, kind: 'task' as const, id: 1,
  epic: 'e1', story: 's1', wave: 'w1', layer: 'ui', status: 'next' as const,
  text: 'Task Alpha', file: '1.md', deps: [42, 43], rank: 100, size: 'm' as const,
};

const loadedGroups: DisplayGroupsResponse = { ...emptyGroups, ready: [task1] };

function makeState(overrides: Partial<LedgerState> = {}): LedgerState {
  return {
    ...initialLedgerState,
    loadState: { tag: 'loaded', groups: loadedGroups },
    ...overrides,
  };
}

describe('LedgerDetailDrawer', () => {
  it('drawer is absent when detailTaskId is null', () => {
    render(<LedgerDetailDrawer state={makeState()} send={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('renders task metadata chips when detailTaskId is set', () => {
    render(
      <LedgerDetailDrawer
        state={makeState({ detailTaskId: 1, planDoc: { tag: 'loading', taskId: 1 } })}
        send={vi.fn()}
      />,
    );
    expect(screen.getByText('epic: e1')).toBeTruthy();
    expect(screen.getByText('story: s1')).toBeTruthy();
    expect(screen.getByText('layer: ui')).toBeTruthy();
    expect(screen.getByText('kind: task')).toBeTruthy();
    expect(screen.getByText('size: m')).toBeTruthy();
  });

  it('shows CircularProgress while planDoc.tag === "loading"', () => {
    render(
      <LedgerDetailDrawer
        state={makeState({ detailTaskId: 1, planDoc: { tag: 'loading', taskId: 1 } })}
        send={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('renders markdown content when planDoc.tag === "loaded"', () => {
    render(
      <LedgerDetailDrawer
        state={makeState({ detailTaskId: 1, planDoc: { tag: 'loaded', taskId: 1, content: '# Hello World' } })}
        send={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Hello World' })).toBeTruthy();
  });

  it('renders error alert when planDoc.tag === "error"', () => {
    render(
      <LedgerDetailDrawer
        state={makeState({ detailTaskId: 1, planDoc: { tag: 'error', taskId: 1, message: 'plan not found' } })}
        send={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('plan not found')).toBeTruthy();
  });

  it('close button dispatches closeDetail', () => {
    const send = vi.fn();
    render(
      <LedgerDetailDrawer
        state={makeState({ detailTaskId: 1, planDoc: { tag: 'idle' } })}
        send={send}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(send).toHaveBeenCalledWith({ tag: 'closeDetail' });
  });
});
