import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb } from '../test/helpers';
import { db } from './db';
import { addPose, addPosePhoto, deletePosePhoto, seedStarterPoses, setPoseFavorite } from './repo';

beforeEach(clearDb);

describe('starter poses, favorites and photos', () => {
  it('seeds the starter library once and keeps favorites and photos on a second seed', async () => {
    const added = await seedStarterPoses();
    expect(added).toBeGreaterThanOrEqual(55);
    expect(await db.poses.count()).toBe(added);
    const first = (await db.poses.toCollection().first())!;
    expect(first.builtIn).toBe(true);
    await setPoseFavorite(first.id, true);
    const photo = await addPosePhoto({ poseId: first.id, dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 10 });
    expect(await seedStarterPoses()).toBe(0);
    expect((await db.poses.get(first.id))!.favorite).toBe(true);
    expect(await db.posePhotos.count()).toBe(1);
    await deletePosePhoto(photo.id);
    expect(await db.posePhotos.count()).toBe(0);
  });

  it("adds back a starter pose that is missing and leaves the user's own poses alone", async () => {
    await seedStarterPoses();
    const own = await addPose({
      name: 'Mine',
      category: 'couples',
      minSize: 2,
      maxSize: 2,
      description: '',
      directions: [],
      tips: [],
      mistakes: [],
      tags: [],
      difficulty: 'easy',
      favorite: false,
      builtIn: false,
    });
    const gone = (await db.poses.filter((p) => p.builtIn).first())!;
    await db.poses.delete(gone.id);
    expect(await seedStarterPoses()).toBe(1);
    expect((await db.poses.get(own.id))!.builtIn).toBe(false);
  });
});
