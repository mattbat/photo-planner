import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Extra, Partnership, Person, Shot, TemplateSetting } from '../data/types';
import { TEMPLATE_IDS } from '../engine/templates';
import type { TemplateId } from '../engine/types';
import {
  analyzeOrder,
  checkFamily,
  clockAt,
  describePair,
  inOrder,
  minutesBySize,
  moveShot,
  planShoot,
  previewShoot,
  shotListText,
  soloScopeOf,
  suggestOrder,
  toEngineExtras,
  toEnginePeople,
  toEngineShot,
  type OrderInput,
  type PlanInput,
  type PlanShoot,
} from './shotView';

const person = (id: string, name: string, fields: Partial<Person> = {}): Person => ({
  id,
  familyId: 'f',
  name,
  parentIds: [],
  createdAt: 1,
  updatedAt: 1,
  ...fields,
});
const pair = (a: string, b: string): Partnership => ({ id: `${a}${b}`, familyId: 'f', personIds: [a, b], status: 'together', createdAt: 1, updatedAt: 1 });
const extra = (id: string, name: string, kind: Extra['kind'] = 'pet'): Extra => ({ id, familyId: 'f', name, kind, createdAt: 1, updatedAt: 1 });

/** Gran + Grandad; their son Max with Nia; Max and Nia's kids Ivy and Finn; Gran's daughter Cleo (single). */
function family() {
  const people = [
    person('gran', 'Gran Tester', { sex: 'female', createdAt: 1 }),
    person('grandad', 'Grandad Tester', { sex: 'male', createdAt: 2 }),
    person('max', 'Max Tester', { sex: 'male', parentIds: ['gran', 'grandad'], grown: true, createdAt: 3 }),
    person('cleo', 'Cleo Tester', { sex: 'female', parentIds: ['gran', 'grandad'], grown: true, createdAt: 4 }),
    person('nia', 'Nia Tester', { sex: 'female', createdAt: 5 }),
    person('ivy', 'Ivy Tester', { sex: 'female', parentIds: ['max', 'nia'], ageGroup: 'child', createdAt: 6 }),
    person('finn', 'Finn Tester', { sex: 'male', parentIds: ['max', 'nia'], ageGroup: 'child', createdAt: 7 }),
  ];
  const partnerships = [pair('gran', 'grandad'), pair('max', 'nia')];
  return { people, partnerships };
}

const settings = (on: TemplateId[]): TemplateSetting[] => TEMPLATE_IDS.map((id) => ({ id, enabled: on.includes(id) }));
const baseShoot = (on: TemplateId[], over: Partial<PlanShoot> = {}): PlanShoot => ({
  attendingIds: ['gran', 'grandad', 'max', 'cleo', 'nia', 'ivy', 'finn', 'rex'],
  templates: settings(on),
  shots: [],
  order: [],
  removedKeys: [],
  ...over,
});
const input = (shoot: PlanShoot, extras: Extra[] = [extra('rex', 'Rex')]): PlanInput => ({ ...family(), extras, shoot, familyName: 'Tester' });

describe('toEnginePeople', () => {
  it('turns people and partnerships into the engine’s shape, kid or grown worked out', () => {
    const [gran, , max, , , ivy] = toEnginePeople(family().people, family().partnerships, 2026);
    expect(gran).toMatchObject({ id: 'gran', name: 'Gran Tester', sex: 'female', grown: true, partnerIds: ['grandad'] });
    expect(max).toMatchObject({ id: 'max', parentIds: ['gran', 'grandad'], partnerIds: ['nia'], grown: true });
    expect(ivy).toMatchObject({ grown: false, parentIds: ['max', 'nia'] });
  });

  it('carries nicknames and separated partners, and ignores records that point at no one', () => {
    const people = [person('a', 'Al', { nickname: ' Ally ' }), person('b', 'Bo'), person('c', 'Cy')];
    const out = toEnginePeople(people, [pair('a', 'b'), { ...pair('a', 'c'), status: 'separated' }, pair('a', 'ghost')], 2026);
    expect(out[0]).toMatchObject({ nickname: 'Ally', partnerIds: ['b'], separatedPartnerIds: ['c'] });
    expect(out[1]).not.toHaveProperty('nickname');
  });

  it('lists people oldest first whatever order and ids they come in', () => {
    const { people, partnerships } = family();
    const shuffled = [...people].reverse().map((p) => ({ ...p, id: `x-${p.id}`, parentIds: p.parentIds.map((i) => `x-${i}`) }));
    const out = toEnginePeople(shuffled, partnerships.map((p) => ({ ...p, personIds: [`x-${p.personIds[0]}`, `x-${p.personIds[1]}`] as [string, string] })));
    expect(out.map((p) => p.name)).toEqual(people.map((p) => p.name));
  });
});

describe('toEngineExtras', () => {
  it('joins the full group unless a template lists the extra', () => {
    const rex = extra('rex', 'Rex');
    expect(toEngineExtras([rex], [])).toEqual([{ id: 'rex', name: 'Rex', kind: 'pet', joinTemplates: ['fullGroup'] }]);
    const chosen = toEngineExtras([rex], [{ id: 'households', extraIds: ['rex'] }, { id: 'couples' }]);
    expect(chosen[0]!.joinTemplates).toEqual(['households']);
  });
});

describe('checkFamily', () => {
  it('uses the engine’s checks, in plain words', () => {
    expect(checkFamily(family().people, family().partnerships)).toEqual([]);
    const people = family().people.map((p) => (p.id === 'ivy' ? { ...p, parentIds: ['max', 'gran'] } : p));
    const [problem] = checkFamily(people, family().partnerships);
    expect(problem?.message).toBe("Ivy is listed as a child of both Max and Max's parent Gran.");
  });
});

describe('planShoot', () => {
  it('makes the shots of the templates that are on, with the full group including the pet', () => {
    const plan = planShoot(input(baseShoot(['fullGroup', 'couples', 'siblings'])));
    const names = plan.shots.map((s) => s.name);
    expect(names).toContain('Everyone');
    expect(plan.shots.find((s) => s.source === 'fullGroup')!.personIds).toContain('rex');
    expect(plan.shots.every((s) => s.status === 'todo' && !s.mustHave && s.notes === '')).toBe(true);
    expect(plan.order).toEqual(plan.shots.map((s) => s.id));
    expect(plan.removed).toEqual([]);
    expect(plan.shots.map((s) => s.id)).toEqual([...new Set(plan.shots.map((s) => s.id))]);
  });

  it('is deterministic: the same input gives the same list, however the records are ordered', () => {
    const shoot = baseShoot(['fullGroup', 'couples', 'siblings', 'households', 'soloKids']);
    const a = planShoot(input(shoot));
    const reversed = input(shoot);
    reversed.people = [...reversed.people].reverse();
    reversed.partnerships = [...reversed.partnerships].reverse();
    expect(planShoot(reversed)).toEqual(a);
    expect(planShoot(input(shoot))).toEqual(a);
  });

  it('follows who is attending, flagging shots that can no longer be made (E3)', () => {
    const on: TemplateId[] = ['siblings', 'sonsDaughters', 'couples'];
    const all = planShoot(input(baseShoot(on)));
    expect(all.flagged).toEqual([]);
    const some = planShoot(input(baseShoot(on, { attendingIds: ['max', 'nia', 'ivy'] })));
    expect(some.shots.map((s) => s.name)).not.toEqual(all.shots.map((s) => s.name));
    expect(some.shots.every((s) => s.personIds.every((id) => ['max', 'nia', 'ivy'].includes(id)))).toBe(true);
    expect(some.flagged.length).toBeGreaterThan(0);
    expect(some.flagged[0]!.reason).toMatch(/needs at least/);
  });

  it('keeps names, must-haves, notes and progress when the list is built again (E6)', () => {
    const first = planShoot(input(baseShoot(['fullGroup', 'couples'])));
    const couple = first.shots.find((s) => s.name !== 'Everyone')!;
    const edited = first.shots.map((s) =>
      s.id === couple.id ? { ...s, name: 'The big two', nameEdited: true, mustHave: true, notes: 'By the tree', status: 'done' as const, doneAt: 5, poseId: 'p1' } : s,
    );
    const again = planShoot(input(baseShoot(['fullGroup', 'couples'], { shots: edited, order: first.order })));
    expect(again.shots.find((s) => s.id === couple.id)).toMatchObject({ name: 'The big two', nameEdited: true, mustHave: true, notes: 'By the tree', status: 'done', doneAt: 5, poseIds: ['p1'] });
    // Another template on: the edits stay, and the shot is still the same shot.
    const more = planShoot(input(baseShoot(['fullGroup', 'couples', 'siblings'], { shots: edited, order: first.order })));
    expect(more.shots.find((s) => s.id === couple.id)?.name).toBe('The big two');
  });

  it('carries edits over to a shot whose main template changed', () => {
    const first = planShoot(input(baseShoot(['grandparentsChildren'])));
    const shot = first.shots[0]!;
    const edited = [{ ...shot, mustHave: true, notes: 'n' }];
    // Gran + Grandad + children: a more specific template now makes the same people.
    const next = planShoot(input(baseShoot(['grandparentsChildren', 'parentChildren'], { shots: edited, order: [shot.id] })));
    const same = next.shots.find((s) => s.personIds.slice().sort().join() === shot.personIds.slice().sort().join());
    expect(same?.mustHave).toBe(true);
    expect(same?.notes).toBe('n');
    expect(next.order[0]).toBe(same!.id);
  });

  it('leaves out removed shots, lists them for restoring, and brings them back (E6)', () => {
    const shoot = baseShoot(['fullGroup', 'couples']);
    const first = planShoot(input(shoot));
    const gone = first.shots.find((s) => s.source === 'couples')!;
    const kept = first.shots.filter((s) => s.id !== gone.id);
    const after = planShoot(input({ ...shoot, shots: kept, order: first.order, removedKeys: [gone.id] }));
    expect(after.shots.map((s) => s.id)).not.toContain(gone.id);
    expect(after.removed).toEqual([{ key: gone.id, name: gone.name }]);
    expect(after.order).toEqual(first.order.filter((id) => id !== gone.id));
    const restored = planShoot(input({ ...shoot, shots: after.shots, order: after.order, removedKeys: [] }));
    expect(restored.shots.map((s) => s.id).sort()).toEqual(first.shots.map((s) => s.id).sort());
    // Removed shots that nothing makes any more are not listed.
    const off = planShoot(input({ ...shoot, templates: settings(['fullGroup']), shots: after.shots, order: after.order, removedKeys: [gone.id] }));
    expect(off.removed).toEqual([]);
  });

  it('keeps custom shots, including their people and name, and drops people who are not coming', () => {
    const custom: Shot = {
      id: 'custom:1',
      name: 'Grandkids with Gran',
      nameEdited: false,
      personIds: ['gran', 'ivy', 'finn', 'rex'],
      source: 'custom',
      reasons: [],
      mustHave: true,
      notes: '',
      status: 'todo',
    };
    const plan = planShoot(input(baseShoot(['fullGroup'], { shots: [custom], order: ['custom:1'] })));
    expect(plan.shots.find((s) => s.id === 'custom:1')).toMatchObject({ name: 'Grandkids with Gran', source: 'custom', mustHave: true });
    expect(plan.shots.find((s) => s.id === 'custom:1')!.personIds.sort()).toEqual(['finn', 'gran', 'ivy', 'rex']);
    const partly = planShoot(input(baseShoot(['fullGroup'], { shots: [custom], order: ['custom:1'], attendingIds: ['gran', 'ivy'] })));
    expect(partly.shots.find((s) => s.id === 'custom:1')!.personIds.sort()).toEqual(['gran', 'ivy']);
    const nobody = planShoot(input(baseShoot(['fullGroup'], { shots: [custom], order: ['custom:1'], attendingIds: ['max', 'nia'] })));
    expect(nobody.shots.find((s) => s.id === 'custom:1')).toBeUndefined();
    expect(nobody.flagged.map((f) => f.key)).toContain('custom:1');
  });

  it('keeps the order it had, with new shots last, and ignores shots that are gone', () => {
    const first = planShoot(input(baseShoot(['fullGroup'])));
    const reversed = [...first.order].reverse();
    const more = planShoot(input(baseShoot(['fullGroup', 'couples'], { shots: first.shots, order: ['ghost', ...reversed] })));
    expect(more.order[0]).toBe(first.shots[0]!.id);
    expect(more.order).toHaveLength(more.shots.length);
    expect(new Set(more.order).size).toBe(more.order.length);
  });

  it('property: the order is always a permutation of the shots, whatever is on and who comes', () => {
    fc.assert(
      fc.property(
        fc.subarray([...TEMPLATE_IDS]),
        fc.subarray(['gran', 'grandad', 'max', 'cleo', 'nia', 'ivy', 'finn', 'rex']),
        (on, attending) => {
          const plan = planShoot(input(baseShoot(on, { attendingIds: attending })));
          expect([...plan.order].sort()).toEqual(plan.shots.map((s) => s.id).sort());
          for (const s of plan.shots) expect(s.personIds.every((id) => attending.includes(id))).toBe(true);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('previewShoot', () => {
  it('counts what each template makes on its own and what it adds (E5)', () => {
    const p = previewShoot(input(baseShoot(['fullGroup'])));
    expect(p.fullGroup).toEqual({ standalone: 1, added: 0 });
    expect(p.couples.standalone).toBe(2);
    expect(p.couples.added).toBe(2);
    expect(Object.keys(p)).toHaveLength(TEMPLATE_IDS.length);
  });
});

describe('order', () => {
  const makeOrder = (on: TemplateId[], over: Partial<OrderInput> = {}): OrderInput => {
    const plan = planShoot(input(baseShoot(on)));
    return {
      ...family(),
      extras: [extra('rex', 'Rex')],
      shots: plan.shots,
      order: plan.order,
      options: { kidsFirst: true, releaseOlderEarly: true, bigGroupFirst: true, mustHavesEarly: false },
      estimates: { small: 2, medium: 3, large: 5, setup: 5 },
      ...over,
    };
  };

  it('suggests an order that holds every shot once, starting with the big group', () => {
    const o = makeOrder(['fullGroup', 'couples', 'households', 'siblings', 'soloKids']);
    const order = suggestOrder(o);
    expect([...order].sort()).toEqual(o.shots.map((s) => s.id).sort());
    expect(order[0]).toBe(o.shots.find((s) => s.source === 'fullGroup')!.id);
    expect(suggestOrder(o)).toEqual(order);
  });

  it('pulls must-haves forward when asked', () => {
    const base = makeOrder(['fullGroup', 'couples', 'soloKids', 'siblings']);
    const last = suggestOrder({ ...base, options: { ...base.options, bigGroupFirst: false, kidsFirst: false } }).at(-1)!;
    const must = base.shots.map((s) => (s.id === last ? { ...s, mustHave: true } : s));
    const early = suggestOrder({ ...base, shots: must, options: { kidsFirst: false, releaseOlderEarly: false, bigGroupFirst: false, mustHavesEarly: true } });
    expect(early.indexOf(last)).toBeLessThan(base.shots.length - 1);
  });

  it('re-orders only the rest, keeping shots already taken first (O4)', () => {
    const base = makeOrder(['fullGroup', 'couples', 'households', 'soloKids']);
    const reversed = [...base.order].reverse();
    const shots = base.shots.map((s) => (s.id === reversed[0] ? { ...s, status: 'done' as const } : s));
    const order = suggestOrder({ ...base, shots, order: reversed }, true);
    expect(order[0]).toBe(reversed[0]);
    expect(order).toHaveLength(reversed.length);
  });

  it('works out who to call in, who can leave and the minutes for the order as it stands (O3, O5)', () => {
    const o = makeOrder(['fullGroup', 'couples', 'soloKids']);
    const a = analyzeOrder(o);
    expect(a.order).toEqual(o.order);
    expect(a.steps[0]!.callIn.length).toBeGreaterThan(0);
    const minutes = a.minutes.reduce((t, m) => t + m.duration, 0) + 5;
    expect(a.totalMinutes).toBe(minutes);
    expect(a.minutes[0]!.start).toBe(5);
    const faster = analyzeOrder({ ...o, estimates: { small: 1, medium: 1, large: 1, setup: 0 } });
    expect(faster.totalMinutes).toBe(o.shots.length);
  });

  it('fills in shots missing from the order and skips ids that are not shots', () => {
    const o = makeOrder(['fullGroup', 'couples']);
    expect(inOrder(o.shots, ['ghost', o.shots[1]!.id]).map((s) => s.id)).toEqual([o.shots[1]!.id, o.shots[0]!.id, ...o.shots.slice(2).map((s) => s.id)]);
    expect(analyzeOrder({ ...o, order: [] }).order).toEqual(o.shots.map((s) => s.id));
  });

  it('turns time estimates into the engine’s size table', () => {
    expect(minutesBySize({ small: 1, medium: 2, large: 3, setup: 9 })).toEqual({ '1-2': 1, '3-6': 2, '7+': 3 });
  });

  it('splits a stored shot into people and extras for the engine', () => {
    const shot: Shot = { id: 'k', name: 'n', nameEdited: false, personIds: ['a', 'rex'], source: 'custom', reasons: [], mustHave: false, notes: '', status: 'todo' };
    expect(toEngineShot(shot, new Set(['rex']))).toMatchObject({ key: 'k', peopleIds: ['a'], extraIds: ['rex'], custom: true });
    expect(toEngineShot({ ...shot, source: 'couples', reasons: ['couples'] }, new Set())).toMatchObject({ groupLabel: '', templateIds: ['couples'] });
  });
});

describe('moveShot', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('moves to a place or by one, and stays inside the list', () => {
    expect(moveShot(order, 'a', { to: 2 })).toEqual(['b', 'c', 'a', 'd']);
    expect(moveShot(order, 'd', { by: -1 })).toEqual(['a', 'b', 'd', 'c']);
    expect(moveShot(order, 'a', { by: -1 })).toEqual(order);
    expect(moveShot(order, 'a', { to: 99 })).toEqual(['b', 'c', 'd', 'a']);
    expect(moveShot(order, 'zz', { to: 1 })).toBe(order);
  });
  it('property: always a permutation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), fc.integer({ min: -2, max: 6 }), (from, to) => {
        expect([...moveShot(order, order[from]!, { to })].sort()).toEqual(order);
      }),
    );
  });
});

describe('text', () => {
  it('writes the time of day', () => {
    expect(clockAt('09:05', 0)).toBe('9:05 AM');
    expect(clockAt('11:50', 20)).toBe('12:10 PM');
    expect(clockAt('00:00', 5)).toBe('12:05 AM');
    expect(clockAt('23:30', 60)).toBe('12:30 AM');
    expect(clockAt('16:00', -30)).toBe('3:30 PM');
    expect(clockAt('x', 0)).toBe('12:00 AM');
  });

  it('writes the shot list for sharing (P5)', () => {
    const shot = (id: string, name: string, personIds: string[], extra: Partial<Shot> = {}): Shot => ({
      id, name, nameEdited: false, personIds, source: 'custom', reasons: [], mustHave: false, notes: '', status: 'todo', ...extra,
    });
    const shots = [shot('a', 'Everyone', ['x', 'y']), shot('b', 'Kids', ['y'], { mustHave: true, notes: ' By the gate ' })];
    const text = shotListText({
      title: 'The Testers',
      date: 'Sat, Dec 5',
      startTime: '16:00',
      shots,
      order: ['b', 'a'],
      nameOf: (id) => id.toUpperCase(),
      minutes: [{ key: 'b', start: 5 }, { key: 'a', start: 8 }],
    });
    expect(text).toBe(
      ['The Testers, Sat, Dec 5, from 4:00 PM', '', '1. ★ Kids (4:05 PM)', '   Y', '   Note: By the gate', '2. Everyone (4:08 PM)', '   X, Y'].join('\n'),
    );
    expect(shotListText({ title: 'T', date: 'D', shots, order: [], nameOf: (id) => id })).toBe(
      'T, D\n\n1. Everyone\n   x, y\n2. ★ Kids\n   y\n   Note: By the gate',
    );
  });
});

describe('relationships and solo scope', () => {
  it('describes how two people are related in plain words (V6)', () => {
    const { people, partnerships } = family();
    expect(describePair(people, partnerships, 'ivy', 'gran')).toMatch(/grand/i);
    expect(describePair(people, partnerships, 'ivy', 'finn')).toMatch(/sister|brother|sibling/i);
  });

  it('reads the solo scope from the three solo templates', () => {
    expect(soloScopeOf(settings([]))).toBe('off');
    expect(soloScopeOf(settings(['soloKids']))).toBe('kids');
    expect(soloScopeOf(settings(['soloAdults']))).toBe('adults');
    expect(soloScopeOf(settings(['soloEveryone']))).toBe('everyone');
  });
});

describe('shoot-day priorities (O8)', () => {
  it('reorderNote says what happened in plain words', async () => {
    const { reorderNote } = await import('./shotView');
    expect(reorderNote('Grandma', 'early', 4)).toBe('Reordered: Grandma’s 4 shots are next.');
    expect(reorderNote('Grandma', 'early', 1)).toBe('Reordered: Grandma’s 1 shot is next.');
    expect(reorderNote('Noah', 'late', 2)).toBe('Reordered: Noah’s 2 shots are last.');
    expect(reorderNote('Noah', 'normal', 2)).toMatch(/Reordered/);
  });
});

describe('shotListText with poses (PL5)', () => {
  it('lists every pose on a shot', async () => {
    const { shotListText } = await import('./shotView');
    const base = { id: 'a', name: 'Everyone', nameEdited: false, personIds: ['x'], source: 'custom' as const, reasons: [], mustHave: false, notes: '', status: 'todo' as const };
    const text = shotListText({
      title: 'T',
      date: 'D',
      shots: [{ ...base, poseIds: ['p1', 'p2'] }, { ...base, id: 'b', name: 'One', poseIds: ['p1'] }, { ...base, id: 'c', name: 'None' }],
      order: ['a', 'b', 'c'],
      nameOf: () => 'X',
      poseName: (id) => ({ p1: 'Huddle', p2: 'Walk' })[id],
    });
    expect(text).toContain('Poses: Huddle, Walk');
    expect(text).toContain('Pose: Huddle');
    expect(text.match(/Pose/g)).toHaveLength(2);
  });
});

describe('everyoneWaitsFor (O9)', () => {
  const mk = (id: string, personIds: string[], reasons: Shot['reasons'] = []): Shot => ({ id, name: id, nameEdited: false, personIds, source: 'custom', reasons, mustHave: false, notes: '', status: 'todo' });
  it('names the Late people who are in an everyone shot, and nobody when it is off', async () => {
    const { everyoneWaitsFor } = await import('./shotView');
    const shots = [mk('all', ['a', 'b', 'c'], ['fullGroup']), mk('ab', ['a', 'b']), mk('c', ['c'])];
    expect(everyoneWaitsFor(shots, { c: 'late' }, {})).toEqual(['c']);
    expect(everyoneWaitsFor(shots, { c: 'early' }, {})).toEqual([]);
    expect(everyoneWaitsFor(shots, { c: 'late' }, { everyoneFirst: false })).toEqual([]);
    expect(everyoneWaitsFor(shots, undefined, {})).toEqual([]);
    // A shot with everybody counts even without the template.
    expect(everyoneWaitsFor([mk('x', ['a', 'b']), mk('y', ['a'])], { b: 'late' }, {})).toEqual(['b']);
  });
});
