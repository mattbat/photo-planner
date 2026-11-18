import { describe, expect, it } from 'vitest';
import { defaultSettings } from './defaults';
import {
  isValidExtra,
  isValidFamily,
  isValidLocation,
  isValidPartnership,
  isValidPerson,
  isValidPose,
  isValidPosePhoto,
  isValidSettings,
  isValidShoot,
} from './validate';

const stamps = { createdAt: 1, updatedAt: 2 };
const shoot = {
  id: 's',
  ...stamps,
  familyId: 'f',
  date: '2026-12-05',
  status: 'planned',
  attendingIds: ['a'],
  templates: [{ id: 'fullGroup', enabled: true }],
  shots: [
    {
      id: 'x',
      name: 'Everyone',
      nameEdited: false,
      personIds: ['a'],
      source: 'fullGroup',
      reasons: ['fullGroup'],
      mustHave: true,
      notes: '',
      status: 'todo',
    },
  ],
  order: ['x'],
  manualOrder: false,
  orderOptions: { kidsFirst: true, releaseOlderEarly: true, bigGroupFirst: true, mustHavesEarly: false },
  removedKeys: [],
  presence: { a: 'here' },
  events: [{ at: 5, type: 'done', shotId: 'x', previous: 'todo' }],
};

describe('validators', () => {
  it('accept well-formed records, with and without their optional fields', () => {
    expect(isValidFamily({ id: 'f', ...stamps, name: 'The Testers', archived: false })).toBe(true);
    expect(isValidPerson({ id: 'p', ...stamps, familyId: 'f', name: 'Ivy', parentIds: [] })).toBe(true);
    expect(
      isValidPerson({ id: 'p', ...stamps, familyId: 'f', name: 'Ivy', parentIds: ['a'], sex: 'female', ageGroup: 'child', birthYear: 2018 }),
    ).toBe(true);
    expect(isValidPartnership({ id: 'c', ...stamps, familyId: 'f', personIds: ['a', 'b'], status: 'together' })).toBe(true);
    expect(isValidExtra({ id: 'e', ...stamps, familyId: 'f', name: 'Biscuit', kind: 'pet', emoji: '🐶' })).toBe(true);
    expect(isValidShoot(shoot)).toBe(true);
    expect(isValidShoot({ ...shoot, handoff: { n: 1, role: 'assistant', away: false }, startTime: '16:30' })).toBe(true);
    expect(isValidLocation({ id: 'l', ...stamps, name: 'Park', latitude: 41.8, longitude: -87.6, source: 'gps' })).toBe(true);
    expect(isValidPosePhoto({ id: 'pp', ...stamps, poseId: 'x', dataUrl: 'data:image/jpeg;base64,AA', width: 10, height: 10 })).toBe(true);
    expect(isValidSettings({ key: 'app', value: defaultSettings(), updatedAt: 1 })).toBe(true);
    expect(
      isValidPose({
        id: 'po',
        ...stamps,
        name: 'Walk',
        category: 'couples',
        minSize: 2,
        maxSize: 2,
        description: '',
        directions: [],
        tips: [],
        mistakes: [],
        tags: ['walking'],
        difficulty: 'easy',
        favorite: false,
        builtIn: true,
      }),
    ).toBe(true);
  });

  it('turn away damaged or made-up records', () => {
    expect(isValidFamily(null)).toBe(false);
    expect(isValidFamily({ id: 'f', ...stamps, name: 3, archived: false })).toBe(false);
    expect(isValidFamily({ ...stamps, name: 'No id', archived: false })).toBe(false);
    expect(isValidPerson({ id: 'p', ...stamps, familyId: 'f', name: 'Ivy', parentIds: 'a' })).toBe(false);
    expect(isValidPerson({ id: 'p', ...stamps, familyId: 'f', name: 'Ivy', parentIds: [], sex: 'robot' })).toBe(false);
    expect(isValidPartnership({ id: 'c', ...stamps, familyId: 'f', personIds: ['a'], status: 'together' })).toBe(false);
    expect(isValidShoot({ ...shoot, priorities: { a: 'early', b: 'late' } })).toBe(true);
    expect(isValidShoot({ ...shoot, priorities: { a: 'urgent' } })).toBe(false);
    expect(isValidShoot({ ...shoot, priorities: ['early'] })).toBe(false);
    expect(isValidShoot(shoot)).toBe(true); // older shoots have no camera people
    expect(isValidShoot({ ...shoot, cameraPersonId: 'a', backupCameraPersonId: 'b' })).toBe(true);
    expect(isValidShoot({ ...shoot, cameraPersonId: 5 })).toBe(false);
    expect(isValidShoot({ ...shoot, backupCameraPersonId: ['b'] })).toBe(false);
    expect(isValidShoot({ ...shoot, status: 'soon' })).toBe(false);
    expect(isValidShoot({ ...shoot, shots: [{ id: 'x' }] })).toBe(false);
    expect(isValidShoot({ ...shoot, templates: [{ id: 'made-up', enabled: true }] })).toBe(false);
    expect(isValidShoot({ ...shoot, presence: { a: 'asleep' } })).toBe(false);
    expect(isValidLocation({ id: 'l', ...stamps, name: 'Moon', latitude: 99, longitude: 0, source: 'gps' })).toBe(false);
    expect(isValidPosePhoto({ id: 'pp', ...stamps, poseId: 'x', dataUrl: 'javascript:alert(1)', width: 1, height: 1 })).toBe(false);
    expect(isValidSettings({ key: 'app', value: {}, updatedAt: 1 })).toBe(false);
    expect(isValidSettings({ id: 'app', value: defaultSettings(), updatedAt: 1 })).toBe(false);
    expect(isValidSettings({ key: 'app', value: { ...defaultSettings(), units: 'metric' }, updatedAt: 1 })).toBe(true);
    const { units, ...older } = defaultSettings();
    void units;
    expect(isValidSettings({ key: 'app', value: older, updatedAt: 1 })).toBe(true); // older backups
    expect(isValidSettings({ key: 'app', value: { ...defaultSettings(), units: 'imperial' }, updatedAt: 1 })).toBe(false);
  });
});
