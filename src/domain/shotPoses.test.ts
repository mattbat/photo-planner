import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Shot } from '../data/types';
import { migrateShoot, migrateShot, poseIdsOf } from './shotPoses';

const shot = (extra: Partial<Shot> = {}): Shot => ({ id: 's', name: 'S', nameEdited: false, personIds: [], source: 'custom', reasons: [], mustHave: false, notes: '', status: 'todo', ...extra });

describe('shot poses (PL5)', () => {
  it('reads either layout', () => {
    expect(poseIdsOf(shot())).toEqual([]);
    expect(poseIdsOf(shot({ poseId: 'a' }))).toEqual(['a']);
    expect(poseIdsOf(shot({ poseIds: ['a', 'b'] }))).toEqual(['a', 'b']);
    expect(poseIdsOf(shot({ poseIds: [], poseId: 'z' }))).toEqual(['z']);
  });

  it('turns poseId into poseIds and drops the old field', () => {
    expect(migrateShot(shot({ poseId: 'a' }))).toEqual(shot({ poseIds: ['a'] }));
    expect(migrateShot(shot({ poseIds: ['a', 'b', 'a'], poseId: 'x' }))).toEqual(shot({ poseIds: ['a', 'b'] }));
    expect('poseIds' in migrateShot(shot({ poseIds: [] }))).toBe(false);
    expect('poseId' in migrateShot(shot({ poseId: '' }))).toBe(false);
  });

  it('migrates a shoot, and leaves one that is already new untouched', () => {
    const fresh = { shots: [shot({ poseIds: ['a'] })] };
    expect(migrateShoot(fresh)).toBe(fresh);
    expect(migrateShoot({ shots: [shot({ poseId: 'a' }), shot({ id: 't' })] }).shots.map(poseIdsOf)).toEqual([['a'], []]);
  });

  it('property: migrating never loses a pose, keeps order, and is idempotent', () => {
    fc.assert(
      fc.property(fc.option(fc.string({ minLength: 1 }), { nil: undefined }), fc.option(fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }), { nil: undefined }), (poseId, poseIds) => {
        const s = shot({ ...(poseId ? { poseId } : {}), ...(poseIds ? { poseIds } : {}) });
        const once = migrateShot(s) as Shot;
        expect(poseIdsOf(once)).toEqual([...new Set(poseIdsOf(s))]);
        expect(once.poseId).toBeUndefined();
        expect(migrateShot(once)).toEqual(once);
      }),
    );
  });
});
