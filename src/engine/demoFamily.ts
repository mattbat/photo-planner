import type { EngineExtra, EnginePerson } from './types';

const p = (id: string, name: string, sex: 'male' | 'female', grown: boolean, parentIds: string[] = [], partnerIds: string[] = [], extra: Partial<EnginePerson> = {}): EnginePerson =>
  ({ id, name, sex, grown, parentIds, partnerIds, ...extra });

/**
 * Made-up demo family (18 people, 4 generations):
 *  - Ruth & Frank (top couple 1), Lena & Omar (top couple 2, Jen's parents)
 *  - Mike (m. Jen), Sarah (single parent), Dan (grown, unmarried)
 *  - Jen's sister Maya, separated from Carlos, with Mia
 *  - Mike & Jen: Emma (grown, with Theo, baby Zoe), Noah, plus Jen's step-child to Mike, Lily
 */
export const DEMO_PEOPLE: EnginePerson[] = [
  p('ruth', 'Ruth Carter', 'female', true, [], ['frank']),
  p('frank', 'Frank Carter', 'male', true, [], ['ruth']),
  p('lena', 'Lena Moreno', 'female', true, [], ['omar']),
  p('omar', 'Omar Moreno', 'male', true, [], ['lena']),
  p('mike', 'Michael Carter', 'male', true, ['ruth', 'frank'], ['jen'], { nickname: 'Mike' }),
  p('sarah', 'Sarah Carter', 'female', true, ['ruth', 'frank']),
  p('dan', 'Daniel Carter', 'male', true, ['ruth', 'frank'], [], { nickname: 'Dan' }),
  p('jen', 'Jennifer Moreno', 'female', true, ['lena', 'omar'], ['mike'], { nickname: 'Jen' }),
  p('maya', 'Maya Moreno', 'female', true, ['lena', 'omar'], [], { separatedPartnerIds: ['carlos'] }),
  p('carlos', 'Carlos Vega', 'male', true, [], [], { separatedPartnerIds: ['maya'] }),
  p('emma', 'Emma Carter', 'female', true, ['mike', 'jen'], ['theo']),
  p('theo', 'Theo Brandt', 'male', true, [], ['emma']),
  p('noah', 'Noah Carter', 'male', false, ['mike', 'jen']),
  p('lily', 'Lily Moreno', 'female', false, ['jen']),
  p('ava', 'Ava Carter', 'female', false, ['sarah']),
  p('ben', 'Ben Carter', 'male', false, ['sarah']),
  p('mia', 'Mia Vega', 'female', false, ['maya', 'carlos']),
  p('zoe', 'Zoe Brandt', 'female', false, ['emma', 'theo']),
];

export const DEMO_EXTRAS: EngineExtra[] = [
  { id: 'biscuit', name: 'Biscuit', kind: 'pet', joinTemplates: ['fullGroup', 'households'], ownerIds: ['mike', 'jen'] },
  { id: 'pat', name: 'Pat (family friend)', kind: 'guest', joinTemplates: ['fullGroup'] },
];

export const DEMO_ATTENDING: string[] = [...DEMO_PEOPLE.map((x) => x.id), ...DEMO_EXTRAS.map((x) => x.id)];
