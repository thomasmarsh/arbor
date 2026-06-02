import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { LedgerTable } from './LedgerTable.js';
import { emptyGroups, mockLedgerEnv, mockLedgerEnvError } from './ledger.env.mock.js';

describe('LedgerTable', () => {
  it('shows loading before fetch resolves', () => {
    render(<LedgerTable env={mockLedgerEnv} />);
    expect(screen.getByText('Loading ledger…')).toBeTruthy();
  });

  it('renders an empty table when there are no tasks', async () => {
    render(<LedgerTable env={mockLedgerEnv} />);
    await waitFor(() => screen.getByRole('table'));
    expect(screen.queryAllByRole('row').length).toBe(1); // header only
  });

  it('renders an error message on fetch failure', async () => {
    render(<LedgerTable env={mockLedgerEnvError} />);
    await waitFor(() => screen.getByText(/Error: network error/));
  });
});
