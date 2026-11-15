import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markBackedUp } from '../data/backup';
import { createFamily } from '../data/repo';
import { db } from '../data/db';
import { useInLiveShoot, useShootIsLive } from '../hooks/useInLiveShoot';
import { useWakeLock } from '../hooks/useWakeLock';
import { clearDb, seedFamily } from '../test/helpers';
import { Empty, Info, Section, Segmented, Sheet, Stepper, Toggle, TopBar } from './ui';
import { InstallHint } from './InstallHint';

const pwa = vi.hoisted(() => ({ needRefresh: true }));
vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react');
  return {
    useRegisterSW: () => {
      const [needRefresh, setNeedRefresh] = useState(pwa.needRefresh);
      return { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker: vi.fn() };
    },
  };
});

const { UpdateBanner } = await import('./UpdateBanner');
const { ErrorBanner } = await import('./ErrorBanner');
const { lastError } = await import('../errorLog');

describe('ErrorBanner', () => {
  it('shows unhandled errors and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<ErrorBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(rejection, { reason: new Error('Storage is full') });
    act(() => {
      window.dispatchEvent(rejection);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Storage is full');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Oops', error: new Error('Oops') }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Oops');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    // An error in one of the app's own files, even without the error object.
    act(() => {
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'Bad thing', filename: `${location.origin}/photo-planner/assets/index.js` }),
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Bad thing');
  });

  it('ignores errors from other sites’ scripts, e.g. when Safari’s Share sheet opens, but notes them', () => {
    localStorage.clear();
    render(<ErrorBanner />);
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'TypeError: undefined is not an object', filename: 'safari-web-extension://abc/content.js' }),
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastError()).toMatchObject({
      message: 'TypeError: undefined is not an object',
      source: 'safari-web-extension://abc/content.js',
      shown: false,
    });
  });
});

describe('InstallHint', () => {
  beforeEach(() => localStorage.clear());

  it('explains how to install in Safari, and stays away once dismissed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InstallHint />);
    expect(screen.getByRole('complementary', { name: 'Install Photo Planner' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('is hidden in the Home Screen app, and survives blocked storage', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const { unmount } = render(<InstallHint />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    unmount();
    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<InstallHint />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('shared building blocks', () => {
  it('Segmented, Toggle, Stepper, Info and Sheet respond to taps', async () => {
    const user = userEvent.setup();
    const onSeg = vi.fn();
    const onToggle = vi.fn();
    const onStep = vi.fn();
    const onClose = vi.fn();
    render(
      <>
        <Segmented
          label="Size"
          value="a"
          onChange={onSeg}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
        <Toggle label="Kids first" checked={false} onChange={onToggle} info="Kids tire first." />
        <Stepper label="shots" value={2} min={1} max={3} onChange={onStep} />
        <Section title="Section" aside={<Info label="sections">About sections.</Info>}>
          <Empty>Nothing here</Empty>
        </Section>
        <Sheet title="A sheet" onClose={onClose}>
          Body
        </Sheet>
      </>,
    );
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onSeg).toHaveBeenCalledWith('b');
    await user.click(screen.getByRole('switch', { name: 'Kids first' }));
    expect(onToggle).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'More shots' }));
    expect(onStep).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Fewer shots' }));
    expect(onStep).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: 'About sections' }));
    expect(screen.getByText('About sections.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('TopBar goes back through history when asked to, else follows its link', async () => {
    const user = userEvent.setup();
    render(<TopBar title="Title" back="#/families" lead="x" action={<span>act</span>} />);
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(window.location.hash).toBe('#/families');
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
  });
});

describe('UpdateBanner', () => {
  beforeEach(async () => {
    await clearDb();
    localStorage.clear();
  });

  afterEach(() => {
    window.location.hash = '';
    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  it('updates straight away when there’s nothing to back up, and can be dismissed', async () => {
    const user = userEvent.setup();
    const update = vi.fn(async () => {});
    const { unmount } = render(<UpdateBanner update={update} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
    unmount();

    render(<UpdateBanner update={update} />);
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers a backup first when there are families (B3)', async () => {
    const user = userEvent.setup();
    await createFamily('The Testers');
    const update = vi.fn(async () => {});
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    render(<UpdateBanner update={update} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));
    const sheet = await screen.findByRole('dialog', { name: 'Update Photo Planner' });
    expect(sheet).toHaveTextContent('Last backup: Never');
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back up, then update' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('doesn’t update if the backup is canceled, but can update without one', async () => {
    const user = userEvent.setup();
    await createFamily('The Testers');
    const update = vi.fn(async () => {});
    const share = vi.fn(async () => {
      throw new DOMException('canceled', 'AbortError');
    });
    Object.assign(navigator, { canShare: () => true, share });
    render(<UpdateBanner update={update} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await user.click(await screen.findByRole('button', { name: 'Back up, then update' }));
    expect(await screen.findByText('Backup canceled. Nothing was updated.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Update without a backup' }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('skips the question when a backup was made today', async () => {
    const user = userEvent.setup();
    await createFamily('The Testers');
    markBackedUp();
    const update = vi.fn(async () => {});
    render(<UpdateBanner update={update} />);
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('useInLiveShoot', () => {
  beforeEach(clearDb);

  it('is false on screens that are not about a shoot', () => {
    window.location.hash = '#/families';
    const { result } = renderHook(() => useInLiveShoot());
    expect(result.current).toBe(false);
  });

  it('is true while a shoot is running (T5), and false once it is planned or done', async () => {
    const { family } = await seedFamily();
    const base = { familyId: family.id, date: '2026-12-05', createdAt: 1, updatedAt: 1 };
    await db.shoots.add({ ...base, id: 's-live', status: 'live' } as never);
    await db.shoots.add({ ...base, id: 's-done', status: 'done' } as never);
    expect(renderHook(() => useShootIsLive(null)).result.current).toBe(false);
    // Loading counts as live, so the banner never flashes up first.
    const live = renderHook(() => useShootIsLive('s-live'));
    expect(live.result.current).toBe(true);
    await waitFor(() => expect(live.result.current).toBe(true));
    const done = renderHook(() => useShootIsLive('s-done'));
    await waitFor(() => expect(done.result.current).toBe(false));
    const missing = renderHook(() => useShootIsLive('nope'));
    await waitFor(() => expect(missing.result.current).toBe(false));
  });
});

describe('useWakeLock', () => {
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  function fakeWakeLock() {
    const listeners: (() => void)[] = [];
    const sentinel = {
      release: vi.fn(async () => listeners.forEach((l) => l())),
      addEventListener: (_: string, l: () => void) => listeners.push(l),
    };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return { request, sentinel };
  }

  it('does nothing when the browser has no wake lock, and says the phone may lock', () => {
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    expect(result.current).toEqual({ held: false, failed: true });
    rerender({ on: false });
    expect(result.current).toEqual({ held: false, failed: false });
  });

  it('holds the lock while active and releases it afterwards', async () => {
    const { request, sentinel } = fakeWakeLock();
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current).toEqual({ held: true, failed: false });

    // iOS drops the lock when the app is hidden; it's requested again on return.
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);

    rerender({ on: false });
    await act(async () => {});
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('reports a refused request, so the screen can warn', async () => {
    const request = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(result.current).toEqual({ held: false, failed: true });
  });
});
