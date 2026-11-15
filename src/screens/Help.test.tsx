/**
 * The in-app guide and the first-run intro (H-1, H-3, H-4, H-8).
 */
import { existsSync, readFileSync } from 'node:fs';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { INTRO_KEY, introSeen } from '../help/intro';
import { SHOTS } from '../help/shots';
import { GROUPS, TOPICS } from '../help/topics';
import { parseRoute, paths } from '../router';
import { clearDb } from '../test/helpers';

beforeEach(async () => {
  await clearDb();
  localStorage.clear();
  document.documentElement.dataset.theme = 'dark';
  window.location.hash = '#/';
});

async function goTo(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('help routes', () => {
  it('parses the help index, a topic and the intro', () => {
    expect(parseRoute('#/help')).toEqual({ name: 'help', topic: null });
    expect(parseRoute('#/help/light')).toEqual({ name: 'help', topic: 'light' });
    expect(parseRoute('#/welcome')).toEqual({ name: 'welcome' });
  });
});

describe('help topics', () => {
  it('covers the required topics, each in a known group', () => {
    const ids = TOPICS.map((t) => t.id);
    for (const id of ['start', 'families', 'shot-types', 'shot-list', 'light', 'shoot-day', 'assistant', 'poses', 'backup', 'faq']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOPICS) expect(GROUPS).toContain(t.group);
  });

  it('every topic renders, and the screenshots it shows exist in both themes', async () => {
    for (const topic of TOPICS) {
      await goTo(paths.help(topic.id));
      const { container, unmount } = render(<App />);
      expect(await screen.findByRole('heading', { level: 1, name: topic.title })).toBeInTheDocument();
      for (const img of container.querySelectorAll('img')) {
        const name = /\/help\/(.+)-(dark|light)\.webp$/.exec(img.getAttribute('src') ?? '')?.[1];
        expect(name, `${topic.id} shows an unknown screenshot`).toBeDefined();
        expect(Object.keys(SHOTS)).toContain(name);
      }
      unmount();
    }
  });

  it('every screenshot in the list exists as a webp in both themes, and is precached', () => {
    for (const name of Object.keys(SHOTS)) {
      for (const theme of ['dark', 'light']) expect(existsSync(`public/help/${name}-${theme}.webp`), `${name}-${theme}`).toBe(true);
    }
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('webp');
  });

  it('lists topics on the index, with the intro replay', async () => {
    await goTo(paths.help());
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Replay the intro' })).toHaveAttribute('href', paths.welcome());
    for (const t of TOPICS) expect(screen.getByRole('link', { name: new RegExp(t.title) })).toBeInTheDocument();
  });

  it('shows a friendly page for an unknown topic', async () => {
    await goTo(paths.help('nope'));
    render(<App />);
    expect(await screen.findByText(/That help page doesn’t exist/)).toBeInTheDocument();
  });

  it('is reached from Settings', async () => {
    await goTo(paths.settings());
    render(<App />);
    expect(await screen.findByRole('link', { name: /Help and guide/ })).toHaveAttribute('href', paths.help());
  });
});

describe('first-run intro', () => {
  it('shows on a fresh phone, steps through, and offers the demo family', async () => {
    localStorage.removeItem(INTRO_KEY);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Every family photo, planned' })).toBeInTheDocument();
    for (let i = 0; i < 5; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Add my own family' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try the demo family' }));
    expect(introSeen()).toBe(true);
    expect(await screen.findByRole('heading', { name: /Pike–Vega/ })).toBeInTheDocument();
  });

  it('can be skipped, and then does not come back', async () => {
    localStorage.removeItem(INTRO_KEY);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('No shoots yet')).toBeInTheDocument();
    expect(introSeen()).toBe(true);
  });

  it('is not shown once there is a family', async () => {
    localStorage.removeItem(INTRO_KEY);
    const { seedFamily } = await import('../test/helpers');
    await seedFamily();
    render(<App />);
    expect(await screen.findByText('No shoots yet')).toBeInTheDocument();
  });

  it('can be replayed from Help', async () => {
    await goTo(paths.welcome());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Every family photo, planned' })).toBeInTheDocument();
  });
});
