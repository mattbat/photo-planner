import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useConfirm } from './ConfirmSheet';

function Demo({ onResult }: { onResult: (r: boolean | string | null) => void }) {
  const { confirm, choose, confirmSheet } = useConfirm();
  return (
    <>
      <button type="button" onClick={() => void confirm({ title: 'Delete shoot?', body: 'It will be gone.', confirmLabel: 'Delete shoot', destructive: true }).then(onResult)}>
        ask
      </button>
      <button
        type="button"
        onClick={() =>
          void choose({
            title: 'Back up first?',
            choices: [
              { label: 'Back up', value: 'backup' },
              { label: 'Skip', value: 'skip' },
              { label: 'Cancel', value: 'cancel' },
            ],
          }).then(onResult)
        }
      >
        choose
      </button>
      {confirmSheet}
    </>
  );
}

describe('ConfirmSheet', () => {
  it('shows an alert dialog with labelled title and body, and focuses it', async () => {
    const user = userEvent.setup();
    render(<Demo onResult={() => {}} />);
    await user.click(screen.getByText('ask'));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete shoot?' });
    expect(dialog).toHaveAccessibleDescription('It will be gone.');
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Delete shoot' })).toHaveClass('destructive');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveClass('secondary');
  });

  it('resolves true on the main button and closes', async () => {
    const user = userEvent.setup();
    const results: unknown[] = [];
    render(<Demo onResult={(r) => results.push(r)} />);
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Delete shoot' }));
    expect(results).toEqual([true]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves false on Cancel, Escape and a tap outside', async () => {
    const user = userEvent.setup();
    const results: unknown[] = [];
    render(<Demo onResult={(r) => results.push(r)} />);
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByText('ask'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('alertdialog').parentElement!);
    expect(results).toEqual([false, false, false]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('offers several choices: a value, or null for Cancel', async () => {
    const user = userEvent.setup();
    const results: unknown[] = [];
    render(<Demo onResult={(r) => results.push(r)} />);
    await user.click(screen.getByText('choose'));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByText('choose'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(results).toEqual(['skip', null]);
  });
});
