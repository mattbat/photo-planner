/**
 * Integration tests for the screens, run against an in-memory IndexedDB.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { createShoot } from './data/repo';
import { logError } from './errorLog';
import { clearDb, seedFamily } from './test/helpers';

beforeEach(async () => {
  await clearDb();
  localStorage.clear();
  window.location.hash = '#/';
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('App', () => {
  it('opens on Shoots with an empty state, and a tab bar for the three main screens', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Shoots' })).toBeInTheDocument();
    expect(await screen.findByText('No shoots yet')).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(tabs.map((t) => t.textContent)).toEqual(['📷Shoots', '👪Families', '🧍Poses']);
    expect(tabs[0]).toHaveAttribute('aria-current', 'page');
  });

  it('moves between Shoots, Families and Poses', async () => {
    render(<App />);
    await screen.findByText('No shoots yet');
    await goTo('#/families');
    expect(await screen.findByRole('heading', { name: 'Families' })).toBeInTheDocument();
    expect(await screen.findByText('No families yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Families/ })).toHaveAttribute('aria-current', 'page');
    await goTo('#/poses');
    expect(await screen.findByRole('heading', { name: 'Poses' })).toBeInTheDocument();
    expect(screen.getByText('The pose library is coming')).toBeInTheDocument();
    await goTo('#/');
    expect(await screen.findByText('No shoots yet')).toBeInTheDocument();
  });

  it('lists the families and shoots that are saved', async () => {
    const { family } = await seedFamily();
    await createShoot(family, { date: '2026-12-05' });
    render(<App />);
    expect(await screen.findByText(/0 of 0 shots/)).toBeInTheDocument();
    expect(screen.getByText('The Testers')).toBeInTheDocument();
    await goTo('#/families');
    expect(await screen.findByText('5 people')).toBeInTheDocument();
  });

  it('reaches Settings from a tab and goes back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Shoots' })).toBeInTheDocument();
  });

  it('shows the diagnostics page, including the last unexpected error', async () => {
    logError({ message: 'Storage is full', source: 'promise', shown: true });
    await goTo('#/diagnostics');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByText(/Storage is full/)).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
  });
});
