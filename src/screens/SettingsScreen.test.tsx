import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_FORMAT, createBackup, lastBackupAt } from '../data/backup';
import { db } from '../data/db';
import { createFamily } from '../data/repo';
import { clearDb, seedFamily } from '../test/helpers';
import { themePreference } from '../theme';

const beta = vi.hoisted(() => ({ value: null as null | { branch: string; next: Record<string, string[]> } }));
vi.mock('../beta', () => ({
  get BETA() {
    return beta.value;
  },
  versionLabel: () => '0.1.0',
}));

const { SettingsScreen } = await import('./SettingsScreen');

beforeEach(async () => {
  await clearDb();
  localStorage.clear();
  beta.value = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

function file(content: unknown) {
  return new File([typeof content === 'string' ? content : JSON.stringify(content)], 'backup.json', { type: 'application/json' });
}

describe('SettingsScreen', () => {
  it('follows the phone by default and lets you choose Light or Dark', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    expect(screen.getByRole('radio', { name: 'Match phone' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(themePreference()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('radio', { name: 'Match phone' }));
    expect(themePreference()).toBe('system');
  });

  it('backs up everything and shows the date', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    render(<SettingsScreen />);
    expect(screen.getByText('Last backup: Never')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up everything' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup ready');
    expect(share).toHaveBeenCalledTimes(1);
    expect(lastBackupAt()).not.toBeNull();
  });

  it('rejects a file that is not a backup, naming the problem', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.upload(screen.getByLabelText('Backup file'), file('{"hello":1}'));
    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a Photo Planner backup.");
  });

  it('restores: merge keeps what is here, replace asks first and warns about families that would be lost', async () => {
    const user = userEvent.setup();
    const { family } = await seedFamily();
    const backup = await createBackup();
    const only = await createFamily('Only on this phone');
    render(<SettingsScreen />);
    await user.upload(screen.getByLabelText('Backup file'), file(backup));
    expect(await screen.findByText(/This backup has/)).toHaveTextContent('1 family (The Testers), 5 people and 0 shoots');
    expect(screen.getByText(/Not in this backup, so they’d be lost: Only on this phone/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Merge into this phone' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Merged: 0 items added');
    expect(await db.families.count()).toBe(2);

    await user.upload(screen.getByLabelText('Backup file'), file(backup));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(await screen.findByRole('button', { name: 'Replace everything' }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Only on this phone'));
    expect(await db.families.count()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(async () => expect(await db.families.count()).toBe(1));
    expect(await db.families.get(family.id)).toBeDefined();
    expect(await db.families.get(only.id)).toBeUndefined();
    expect(await screen.findByRole('status')).toHaveTextContent('Restored.');
  });

  it('can cancel a restore', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.upload(screen.getByLabelText('Backup file'), file({ format: BACKUP_FORMAT, version: 1, poses: [] }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Restore from a backup file' })).toBeInTheDocument();
  });

  it('checks for updates, and says when it can’t', async () => {
    const user = userEvent.setup();
    const update = vi.fn(async () => {});
    const getRegistration = vi.fn(async () => ({ update, waiting: null, installing: null }));
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration }, configurable: true });
    render(<SettingsScreen />);
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Checked for updates');
    expect(update).toHaveBeenCalled();

    getRegistration.mockResolvedValueOnce({ update, waiting: {} as never, installing: null });
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('A new version is downloading'));

    getRegistration.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t check for updates');
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  });

  it('shows the version, a Diagnostics link and an empty What’s new on the first version', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(/Photo Planner version 0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diagnostics' })).toHaveAttribute('href', '#/diagnostics');
    expect(screen.getByText('Nothing yet. This is the first version.')).toBeInTheDocument();
  });

  it('on a beta build, lists what is coming next and can erase the beta data', async () => {
    const user = userEvent.setup();
    beta.value = { branch: 'claude/families', next: { new: ['See the family tree.'] } };
    await createFamily('The Testers');
    const reload = vi.fn();
    Object.assign(navigator, { canShare: () => true, share: vi.fn(async () => {}) });
    render(<SettingsScreen reload={reload} />);
    expect(screen.getByText(/built from/)).toHaveTextContent('claude/families');
    expect(screen.getByText('See the family tree.')).toBeInTheDocument();

    // Declining the backup offer, then the erase itself: nothing is erased.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: 'Erase beta data' }));
    expect(await db.families.count()).toBe(1);
    expect(reload).not.toHaveBeenCalled();

    confirm.mockReset().mockReturnValueOnce(true).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Erase beta data' }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(await db.families.count()).toBe(0);
  });

  it('does not erase if the backup offered first is cancelled', async () => {
    const user = userEvent.setup();
    beta.value = { branch: 'claude/families', next: {} };
    await createFamily('The Testers');
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reload = vi.fn();
    render(<SettingsScreen reload={reload} />);
    await user.click(screen.getByRole('button', { name: 'Erase beta data' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing was erased.');
    expect(await db.families.count()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
