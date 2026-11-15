import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateShots } from './generate';
import { minutesForSize, orderShots } from './order';
import { TEMPLATE_IDS } from './templates';
import type { EngineExtra, EnginePerson, GenerateInput, Shot, ShotEdits, TemplateId } from './types';

/** A random family of 2-30 made-up people: parents, partners, separations, step-children, grown flags, guests and pets. */
interface World { people: EnginePerson[]; extras: EngineExtra[]; attend: boolean[]; templates: TemplateId[] }

const worldArb: fc.Arbitrary<World> = fc.integer({ min: 2, max: 30 }).chain((n) =>
  fc.record({
    parents: fc.array(fc.tuple(fc.nat(99), fc.nat(99), fc.integer({ min: 0, max: 3 })), { minLength: n, maxLength: n }),
    pairs: fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.boolean()), { maxLength: 8 }),
    sexes: fc.array(fc.constantFrom<'male' | 'female' | undefined>('male', 'female', undefined), { minLength: n, maxLength: n }),
    grown: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
    attend: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
    extras: fc.array(
      fc.record({ kind: fc.constantFrom<'guest' | 'pet'>('guest', 'pet'), join: fc.subarray(TEMPLATE_IDS, { maxLength: 4 }), owner: fc.option(fc.nat(n - 1), { nil: undefined }) }),
      { maxLength: 4 },
    ),
    templates: fc.subarray(TEMPLATE_IDS),
  }).map(({ parents, pairs, sexes, grown, attend, extras, templates }) => {
    const people: EnginePerson[] = parents.map(([a, b, k], i) => {
      const parentIds: string[] = [];
      if (i > 0 && k >= 1) parentIds.push(`p${a % i}`);
      // k === 3 gives a step-parent: the second parent is not the first parent's partner.
      if (i > 1 && k >= 2 && b % i !== a % i) parentIds.push(`p${b % i}`);
      return { id: `p${i}`, name: `Person${i}`, sex: sexes[i], grown: grown[i] ?? false, parentIds, partnerIds: [] };
    });
    for (const [x, y, sep] of pairs) {
      const px = people[x]!, py = people[y]!;
      if (x === y || px.parentIds.includes(py.id) || py.parentIds.includes(px.id)) continue;
      if (px.partnerIds.includes(py.id) || px.separatedPartnerIds?.includes(py.id)) continue;
      if (sep) {
        px.separatedPartnerIds = [...(px.separatedPartnerIds ?? []), py.id];
        py.separatedPartnerIds = [...(py.separatedPartnerIds ?? []), px.id];
      } else {
        px.partnerIds.push(py.id);
        py.partnerIds.push(px.id);
      }
    }
    const ex: EngineExtra[] = extras.map((e, i) => ({
      id: `x${i}`, name: e.kind === 'pet' ? `Pet${i}` : `Guest${i}`, kind: e.kind, joinTemplates: e.join,
      ...(e.owner !== undefined ? { ownerIds: [`p${e.owner}`] } : {}),
    }));
    return { people, extras: ex, attend, templates };
  }));

const attendingOf = (w: World) => [...w.people.filter((_, i) => w.attend[i]).map((p) => p.id), ...w.extras.map((e) => e.id)];
const toInput = (w: World, over: Partial<GenerateInput> = {}): GenerateInput => ({
  people: w.people, extras: w.extras, attendingIds: attendingOf(w), templateIds: w.templates, familyName: 'Fairweather', ...over,
});
const sig = (ids: string[]) => [...ids].sort().join(',');

describe('generateShots on random families (2-30 people)', () => {
  it('is deterministic, attendance-only, and has no duplicate groups', () => {
    fc.assert(
      fc.property(worldArb, (w) => {
        const r = generateShots(toInput(w));
        expect(generateShots(toInput(w))).toEqual(r);
        // Key order of the input must not matter either.
        expect(generateShots(JSON.parse(JSON.stringify(toInput(w))))).toEqual(r);
        const attending = new Set(attendingOf(w));
        const groups = new Set<string>();
        const keys = new Set<string>();
        for (const s of r.shots) {
          for (const id of [...s.peopleIds, ...s.extraIds]) expect(attending.has(id)).toBe(true);
          // The same people may appear twice only with different pets or guests.
          const g = `${sig(s.peopleIds)}|${sig(s.extraIds)}`;
          expect(groups.has(g)).toBe(false);
          groups.add(g);
          expect(keys.has(s.key)).toBe(false);
          keys.add(s.key);
        }
        if (!w.extras.length) expect(new Set(r.shots.map((s) => sig(s.peopleIds))).size).toBe(r.shots.length);
      }),
      { numRuns: 120 },
    );
  });

  const nonCustom = (shots: Shot[]) => shots.filter((s) => !s.custom);

  it('removed, renamed and custom edits survive adding or removing a person', () => {
    fc.assert(
      fc.property(worldArb, fc.nat(100), fc.nat(100), fc.nat(100), fc.boolean(), (w, a, b, c, adding) => {
        const first = generateShots(toInput(w));
        const plain = nonCustom(first.shots);
        if (plain.length < 2) return;
        const victim = plain[a % plain.length]!;
        const renamedShot = plain[b % plain.length]!;
        const customIds = [w.people[c % w.people.length]!.id];
        const custom: Shot = { key: 'custom:mine', name: 'Our own shot', peopleIds: customIds, extraIds: [], templateIds: [], groupLabel: 'Custom', custom: true };
        const edits: ShotEdits = { removed: [victim.key], renamed: { [renamedShot.key]: 'Renamed by hand' }, custom: [custom] };

        let people: EnginePerson[];
        let attend: boolean[];
        if (adding) {
          // a new baby for the first person, who is also at the shoot
          people = [...w.people, { id: 'newcomer', name: 'Newcomer', grown: false, parentIds: [w.people[0]!.id], partnerIds: [] }];
          attend = [...w.attend, true];
        } else {
          // drop the last person, cleaning up references to them
          const gone = w.people[w.people.length - 1]!.id;
          people = w.people.slice(0, -1).map((p) => ({
            ...p,
            parentIds: p.parentIds.filter((x) => x !== gone),
            partnerIds: p.partnerIds.filter((x) => x !== gone),
            ...(p.separatedPartnerIds ? { separatedPartnerIds: p.separatedPartnerIds.filter((x) => x !== gone) } : {}),
          }));
          attend = w.attend.slice(0, -1);
        }
        const w2: World = { ...w, people, attend };
        const after = generateShots(toInput(w2, { edits }));

        for (const s of nonCustom(after.shots)) expect(sig(s.peopleIds)).not.toBe(sig(victim.peopleIds));
        for (const s of after.shots) if (sig(s.peopleIds) === sig(renamedShot.peopleIds)) expect(s.name).toBe('Renamed by hand');
        const here = new Set(attendingOf(w2));
        const kept = after.shots.find((s) => s.key === 'custom:mine');
        if (customIds.some((id) => here.has(id))) {
          expect(kept).toMatchObject({ custom: true, name: expect.any(String) });
          expect(kept!.peopleIds.every((id) => here.has(id))).toBe(true);
        } else {
          expect(kept).toBeUndefined();
        }
        // With the edits taken away again, nothing but the edited shots differs.
        const bare = generateShots(toInput(w2));
        const bareKeys = new Set(bare.shots.map((s) => s.key));
        for (const s of nonCustom(after.shots)) expect(bareKeys.has(s.key)).toBe(true);
      }),
      { numRuns: 120 },
    );
  });

  it('only attending people ever appear, however attendance changes', () => {
    fc.assert(
      fc.property(worldArb, fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }), (w, flip) => {
        const w2 = { ...w, attend: w.people.map((_, i) => flip[i]!) };
        const here = new Set(attendingOf(w2));
        for (const s of generateShots(toInput(w2)).shots) for (const id of [...s.peopleIds, ...s.extraIds]) expect(here.has(id)).toBe(true);
      }),
      { numRuns: 80 },
    );
  });
});

describe('orderShots on generated shot lists', () => {
  it('keeps the fixed prefix, is a permutation, and steps and minutes agree', () => {
    fc.assert(
      fc.property(worldArb, fc.nat(10), fc.record({ kidsFirst: fc.boolean(), releaseOlderEarly: fc.boolean(), bigGroupFirst: fc.boolean(), mustHavesEarly: fc.boolean() }), fc.nat(5), (w, pre, o, setup) => {
        const shots = generateShots(toInput(w)).shots;
        if (!shots.length) return;
        const prefix = shots.slice(0, Math.min(pre, shots.length)).map((s) => s.key).reverse();
        const r = orderShots(shots, w.people, { ...o, fixedPrefix: prefix, mustHaveKeys: [shots[shots.length - 1]!.key], setupMinutes: setup });
        expect([...r.order].sort()).toEqual(shots.map((s) => s.key).sort());
        expect(r.order.slice(0, prefix.length)).toEqual(prefix);
        expect(r.steps.map((s) => s.key)).toEqual(r.order);
        expect(r.minutes.map((m) => m.key)).toEqual(r.order);
        const byKey = new Map(shots.map((s) => [s.key, s]));
        let t = setup;
        r.minutes.forEach((m, i) => {
          expect(m.start).toBe(t);
          expect(m.duration).toBe(minutesForSize(byKey.get(r.order[i]!)!.peopleIds.length + byKey.get(r.order[i]!)!.extraIds.length));
          t += m.duration;
          if (i > 0) {
            const prev = new Set([...byKey.get(r.order[i - 1]!)!.peopleIds, ...byKey.get(r.order[i - 1]!)!.extraIds]);
            const cur = new Set([...byKey.get(r.order[i]!)!.peopleIds, ...byKey.get(r.order[i]!)!.extraIds]);
            expect([...r.steps[i]!.callIn].sort()).toEqual([...cur].filter((x) => !prev.has(x)).sort());
            expect([...r.steps[i]!.canLeave].sort()).toEqual([...prev].filter((x) => !cur.has(x)).sort());
          }
        });
        expect(r.totalMinutes).toBe(t);
      }),
      { numRuns: 80 },
    );
  });
});
