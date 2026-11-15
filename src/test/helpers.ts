import { ALL_TABLES } from '../data/db';
import { addExtra, addPartnership, addPerson, createFamily } from '../data/repo';

/** Empties every table, so each test starts from a blank phone. */
export async function clearDb(): Promise<void> {
  await Promise.all(ALL_TABLES.map((table) => table.clear()));
}

/** A small made-up family: two grandparents, their son Max with his wife Nia and daughter Ivy, and a dog. */
export async function seedFamily() {
  const family = await createFamily('The Testers');
  const gran = await addPerson(family.id, { name: 'Gran Tester', sex: 'female' });
  const grandad = await addPerson(family.id, { name: 'Grandad Tester', sex: 'male' });
  await addPartnership(family.id, [gran.id, grandad.id]);
  const max = await addPerson(family.id, { name: 'Max Tester', sex: 'male', parentIds: [gran.id, grandad.id], grown: true });
  const nia = await addPerson(family.id, { name: 'Nia Tester', sex: 'female' });
  await addPartnership(family.id, [max.id, nia.id]);
  const ivy = await addPerson(family.id, { name: 'Ivy Tester', sex: 'female', ageGroup: 'child', parentIds: [max.id, nia.id] });
  const dog = await addExtra(family.id, { name: 'Biscuit', kind: 'pet', emoji: '🐶' });
  return { family, gran, grandad, max, nia, ivy, dog };
}
