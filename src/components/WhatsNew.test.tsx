import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { RELEASES, releaseToShow, SEEN_KEY, seenVersion } from '../data/whatsNew';
import { createFamily } from '../data/repo';
import { clearDb } from '../test/helpers';
import { WhatsNewSheet } from './WhatsNew';

// The real changelog is empty until the first release, so the tests bring their own.
vi.mock('../changelog.json', () => ({
  default: [
    { version: __APP_VERSION__, date: '2026-11-15', new: ['See the family as a tree.'] },
    { version: '0.0.9', date: '2026-11-01', fixed: ['An old fix.'] },
  ],
}));

beforeEach(async () => {
  await clearDb();
  localStorage.clear();
  window.location.hash = '#/';
});

describe('What’s new (REL3)', () => {
  it('has notes for the version being built', () => {
    expect(RELEASES[0]?.version).toBe(__APP_VERSION__);
  });

  it('counts as seen on a new phone, where there is nothing to protect yet', () => {
    expect(releaseToShow(false)).toBeNull();
    expect(seenVersion()).toBe(__APP_VERSION__);
    expect(releaseToShow(true)).toBeNull();
  });

  it('has nothing to show for a version without notes', () => {
    localStorage.setItem(SEEN_KEY, '0.0.1');
    expect(releaseToShow(true, '9.9.9')).toBeNull();
  });

  it('shows once after an update, and not again', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SEEN_KEY, '0.0.1');
    render(<WhatsNewSheet />);
    const sheet = await screen.findByRole('dialog', { name: `What’s new in ${__APP_VERSION__}` });
    expect(sheet).toHaveTextContent('See the family as a tree.');
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(seenVersion()).toBe(__APP_VERSION__);
  });

  it('shows to someone who had the app before notes existed', async () => {
    await createFamily('The Testers');
    render(<WhatsNewSheet />);
    expect(await screen.findByRole('dialog', { name: /What’s new/ })).toBeInTheDocument();
  });

  it('is listed in Settings, latest first, with earlier versions on request', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SEEN_KEY, __APP_VERSION__);
    window.location.hash = '#/settings';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What’s new' })).toBeInTheDocument();
    expect(screen.getByText('See the family as a tree.')).toBeInTheDocument();
    expect(screen.queryByText('An old fix.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show earlier versions (1)' }));
    expect(screen.getByText('An old fix.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show only the latest' })).toBeInTheDocument());
  });
});
