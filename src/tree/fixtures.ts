import type { TreePerson } from './types';

const P = (id: string, name: string, o: Partial<TreePerson> = {}): TreePerson => ({
  id, name, grown: true, parentIds: [], partnerIds: [], ...o,
});

/** Made-up demo family: 20 people, 4 generations. */
export const demoFamily: TreePerson[] = [
  P('harold', 'Harold Pike', { sex: 'male', partnerIds: ['margaret'] }),
  P('margaret', 'Margaret Pike', { sex: 'female', partnerIds: ['harold'] }),
  P('luis', 'Luis Vega', { sex: 'male', partnerIds: ['rosa'] }),
  P('rosa', 'Rosa Vega', { sex: 'female', partnerIds: ['luis'] }),
  P('ruth', 'Ruth Pike', { sex: 'female', parentIds: ['harold', 'margaret'], partnerIds: ['tom'] }),
  P('tom', 'Tom Vega', { sex: 'male', parentIds: ['luis', 'rosa'], partnerIds: ['ruth'] }),
  P('ben', 'Ben Pike', { sex: 'male', parentIds: ['harold', 'margaret'] }),
  P('dana', 'Dana Pike', { sex: 'female', parentIds: ['harold', 'margaret'], separatedPartnerIds: ['carl'] }),
  P('carl', 'Carl Ames', { sex: 'male', separatedPartnerIds: ['dana'] }),
  P('leo', 'Leo', { sex: 'male', grown: false, parentIds: ['dana'] }),
  P('carla', 'Carla Vega', { sex: 'female', parentIds: ['luis', 'rosa'], partnerIds: ['omar'] }),
  P('omar', 'Omar Khan', { sex: 'male', partnerIds: ['carla'] }),
  P('gabe', 'Gabe Vega', { sex: 'male', parentIds: ['luis', 'rosa'] }),
  P('noah', 'Noah Vega', { sex: 'male', parentIds: ['ruth', 'tom'], partnerIds: ['priya'] }),
  P('priya', 'Priya Rao', { sex: 'female', partnerIds: ['noah'] }),
  P('mia', 'Mia Vega', { sex: 'female', grown: false, parentIds: ['ruth', 'tom'] }),
  P('eve', 'Eve Vega', { sex: 'female', grown: false, parentIds: ['ruth', 'tom'] }),
  P('max', 'Max Vega', { sex: 'male', grown: false, parentIds: ['tom'] }),
  P('ana', 'Ana Khan', { sex: 'female', grown: false, parentIds: ['carla', 'omar'] }),
  P('zoe', 'Zoe', { sex: 'female', grown: false, parentIds: ['noah', 'priya'] }),
];

export const simpleFamily: TreePerson[] = [
  P('a', 'Al', { partnerIds: ['b'] }),
  P('b', 'Bo', { partnerIds: ['a'] }),
  P('c', 'Cy', { grown: false, parentIds: ['a', 'b'] }),
  P('d', 'Di', { grown: false, parentIds: ['a', 'b'] }),
];

/** remarriage: Pat has kids with ex Sam and with new partner Lee */
export const remarriedFamily: TreePerson[] = [
  P('pat', 'Pat', { partnerIds: ['lee'], separatedPartnerIds: ['sam'] }),
  P('sam', 'Sam', { separatedPartnerIds: ['pat'] }),
  P('lee', 'Lee', { partnerIds: ['pat'] }),
  P('k1', 'Kid One', { grown: false, parentIds: ['pat', 'sam'] }),
  P('k2', 'Kid Two', { grown: false, parentIds: ['pat', 'lee'] }),
  P('k3', 'Kid Three', { grown: false, parentIds: ['lee'] }),
];

export const singleParentFamily: TreePerson[] = [
  P('gm', 'Gran', {}),
  P('mum', 'Mom', { parentIds: ['gm'] }),
  P('kid', 'Kid', { grown: false, parentIds: ['mum'] }),
  P('kid2', 'Kid2', { grown: false, parentIds: ['mum'] }),
];

export const fixtures: Record<string, TreePerson[]> = {
  demoFamily, simpleFamily, remarriedFamily, singleParentFamily,
};
