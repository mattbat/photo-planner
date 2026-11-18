import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cameraFor } from './camera';
import { shotListText } from './shotView';
import type { Shot } from '../data/types';

const name = (id: string) => id.toUpperCase();
const inShot = (...personIds: string[]) => ({ personIds });

describe('cameraFor (P6)', () => {
  it('says nothing when no camera person is set or they are not in the shot', () => {
    expect(cameraFor(inShot('a', 'b'), undefined, 'p', name)).toBeUndefined();
    expect(cameraFor(inShot('a', 'b'), 't', 'p', name)).toBeUndefined();
  });
  it('names the backup when the camera person is in the shot and the backup is not', () => {
    expect(cameraFor(inShot('t', 'b'), 't', 'p', name)).toBe('📷 P takes this');
  });
  it('suggests a timer when both are in the shot, or no backup is set', () => {
    expect(cameraFor(inShot('t', 'p'), 't', 'p', name)).toBe('📷 Use a timer or tripod');
    expect(cameraFor(inShot('t'), 't', undefined, name)).toBe('📷 Use a timer or tripod');
    expect(cameraFor(inShot('t'), 't', 't', name)).toBe('📷 Use a timer or tripod');
  });
  it('property: a label appears exactly when the camera person is in the shot', () => {
    fc.assert(
      fc.property(fc.subarray(['t', 'p', 'a', 'b']), fc.option(fc.constantFrom('p', 'a'), { nil: undefined }), (ids, backup) => {
        const label = cameraFor(inShot(...ids), 't', backup, name);
        expect(label !== undefined).toBe(ids.includes('t'));
        if (label?.includes('takes this')) expect(ids.includes(backup!)).toBe(false);
      }),
    );
  });
  it('shows in the shared shot list', () => {
    const shot = (id: string, personIds: string[]): Shot => ({ id, name: id, nameEdited: false, personIds, source: 'custom', reasons: [], mustHave: false, notes: '', status: 'todo' });
    const text = shotListText({
      title: 'T',
      date: 'D',
      shots: [shot('one', ['t', 'a']), shot('two', ['a'])],
      order: [],
      nameOf: name,
      camera: { personId: 't', backupId: 'p' },
    });
    expect(text).toBe('T, D\n\n1. one\n   T, A\n   📷 P takes this\n2. two\n   A');
  });
});
