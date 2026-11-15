import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoseSuggestions } from '../components/PoseSuggestions';
import { db } from '../data/db';
import { addPosePhoto, seedStarterPoses } from '../data/repo';
import { starterPoses } from '../poses/starterPoses';
import { clearDb } from '../test/helpers';
import { PoseDetailScreen } from './PoseDetailScreen';
import { PosesScreen } from './PosesScreen';

vi.mock('./posePhoto', async (orig) => ({
  ...(await orig<typeof import('./posePhoto')>()),
  resizePhoto: vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', width: 1600, height: 1200 })),
}));

beforeEach(async () => {
  await clearDb();
  window.location.hash = '#/poses';
});
afterEach(() => vi.restoreAllMocks());

const cards = () => within(screen.getByRole('list', { name: 'Poses' })).getAllByRole('listitem');

describe('PosesScreen', () => {
  it('seeds the library on first run and shows every pose', async () => {
    render(<PosesScreen />);
    await waitFor(() => expect(cards()).toHaveLength(starterPoses.length));
    expect(await db.poses.count()).toBe(starterPoses.length);
    expect(within(cards()[0]!).getByText(/person|people|group/)).toBeInTheDocument();
  });

  it('filters by category, search, size and tag, and shows favorites only', async () => {
    const user = userEvent.setup();
    render(<PosesScreen />);
    await waitFor(() => expect(cards()).toHaveLength(starterPoses.length));

    await user.click(screen.getByRole('button', { name: 'Couples' }));
    const couples = starterPoses.filter((p) => p.category === 'couples');
    expect(cards()).toHaveLength(couples.length);
    await user.click(screen.getByRole('button', { name: 'Couples' }));
    expect(cards()).toHaveLength(starterPoses.length);

    await user.type(screen.getByRole('searchbox', { name: 'Search poses' }), 'piggyback');
    expect(cards()).toHaveLength(1);
    expect(within(cards()[0]!).getByText('Piggyback ride')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search poses' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search poses' }), 'zzzz nothing');
    expect(screen.getByText('No poses match')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search poses' }));

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.selectOptions(screen.getByLabelText('Group size'), '2');
    const twos = starterPoses.filter((p) => p.minSize <= 2 && p.maxSize >= 2);
    expect(cards()).toHaveLength(twos.length);
    await user.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Playful' }));
    expect(cards()).toHaveLength(twos.filter((p) => p.tags.includes('playful')).length);
    await user.selectOptions(screen.getByLabelText('Group size'), '');
    await user.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Playful' }));

    await user.click(screen.getByRole('button', { name: '★ Favorites' }));
    expect(screen.getByText('No poses match')).toBeInTheDocument();
    await db.poses.update(starterPoses[0]!.id, { favorite: true });
    await waitFor(() => expect(cards()).toHaveLength(1));
  });

  it('adds my own pose, which shows in the grid', async () => {
    const user = userEvent.setup();
    render(<PosesScreen />);
    await waitFor(() => expect(cards()).toHaveLength(starterPoses.length));
    await user.click(screen.getByRole('button', { name: '+ Add pose' }));
    const sheet = screen.getByRole('dialog', { name: 'New pose' });
    expect(within(sheet).getByRole('button', { name: 'Add pose' })).toBeDisabled();
    await user.type(within(sheet).getByLabelText('Name'), 'Back to back');
    await user.selectOptions(within(sheet).getByLabelText('Category'), 'couples');
    await user.type(within(sheet).getByLabelText(/How to direct it/), 'Stand back to back{enter}Cross your arms');
    await user.click(within(sheet).getByRole('button', { name: 'Playful' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add pose' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const saved = (await db.poses.toArray()).find((p) => p.name === 'Back to back')!;
    expect(saved).toMatchObject({ builtIn: false, favorite: false, tags: ['playful'], directions: ['Stand back to back', 'Cross your arms'] });
    await waitFor(() => expect(cards()).toHaveLength(starterPoses.length + 1));
  });
});

describe('PoseDetailScreen', () => {
  const first = starterPoses[0]!;

  it('shows the pose, steps and credit, and toggles the favorite', async () => {
    const user = userEvent.setup();
    await seedStarterPoses();
    render(<PoseDetailScreen poseId={first.id} />);
    expect(await screen.findByRole('heading', { name: first.name })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `Illustration of ${first.name}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How to direct it' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(first.directions.length);
    expect(screen.getByText(/Image: Photo Planner/)).toBeInTheDocument();
    // Built-in poses can't be edited or deleted.
    expect(screen.queryByRole('button', { name: 'Delete pose' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(async () => expect((await db.poses.get(first.id))!.favorite).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Remove from favorites' }));
    await waitFor(async () => expect((await db.poses.get(first.id))!.favorite).toBe(false));
  });

  it('adds and deletes my own photo', async () => {
    const user = userEvent.setup();
    await seedStarterPoses();
    render(<PoseDetailScreen poseId={first.id} />);
    const input = await screen.findByLabelText('Add my photo');
    expect(input).toHaveAttribute('accept', 'image/*');
    await user.upload(input, new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByRole('img', { name: `Your photo of ${first.name}` })).toBeInTheDocument();
    expect(await db.posePhotos.count()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Delete photo' }));
    await waitFor(async () => expect(await db.posePhotos.count()).toBe(0));
  });

  it('shows photos added earlier next to the illustration', async () => {
    await seedStarterPoses();
    await addPosePhoto({ poseId: first.id, dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 10 });
    render(<PoseDetailScreen poseId={first.id} />);
    expect(await screen.findByRole('img', { name: `Your photo of ${first.name}` })).toBeInTheDocument();
  });

  it('edits and deletes my own pose, and says so for an unknown one', async () => {
    const user = userEvent.setup();
    const { addPose } = await import('../data/repo');
    const own = await addPose({
      name: 'Mine',
      category: 'candid',
      minSize: 1,
      maxSize: 4,
      description: 'Mine.',
      directions: ['Step one'],
      tips: [],
      mistakes: [],
      tags: [],
      difficulty: 'easy',
      favorite: false,
      builtIn: false,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PoseDetailScreen poseId={own.id} />);
    await user.click(await screen.findByRole('button', { name: 'Edit pose' }));
    const sheet = screen.getByRole('dialog', { name: 'Edit pose' });
    await user.clear(within(sheet).getByLabelText('Name'));
    await user.type(within(sheet).getByLabelText('Name'), 'Mine again');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Mine again' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete pose' }));
    await waitFor(async () => expect(await db.poses.get(own.id)).toBeUndefined());
    expect(window.location.hash).toBe('#/poses');
  });

  it('says when a pose is not in the library', async () => {
    render(<PoseDetailScreen poseId="nope" />);
    expect(await screen.findByText('This pose is not in the library.')).toBeInTheDocument();
  });
});

describe('PoseSuggestions', () => {
  it('suggests poses for a couple and hands back the tapped one', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<PoseSuggestions peopleCount={2} hasKids={false} hasBaby={false} generations={1} isCouple hasSeniors={false} onPick={onPick} />);
    const list = await screen.findByRole('list', { name: 'Suggested poses' });
    const buttons = within(list).getAllByRole('listitem');
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]!);
    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]![0]).toMatchObject({ category: 'couples' });
  });
});
