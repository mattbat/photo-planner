import type { Template, TemplateId } from './types';

const t = (id: TemplateId, group: Template['group'], label: string, description: string, defaultOn: boolean, minSize: number): Template =>
  ({ id, group, label, description, defaultOn, minSize });

/** Canonical order (also the order shots are listed in). */
export const TEMPLATES: Template[] = [
  t('fullGroup', 'Everyone', 'Full group', 'Everyone attending, in one photo.', true, 2),
  t('fullGroupNoPartners', 'Everyone', 'Full group, no partners', 'Blood relatives only (people who married in step aside).', false, 2),
  t('generations', 'Generations', 'Each generation', 'Grandparents, then the children, then the grandkids, then the great-grandkids.', false, 2),
  t('generationsWithPartners', 'Generations', 'Each generation with partners', 'Each generation including their partners.', false, 2),
  t('grandparentsChildren', 'Generations', 'Grandparents + all children', 'The top couple with all their children.', false, 3),
  t('grandparentsGrandkids', 'Generations', 'Grandparents + all grandkids', 'The top couple with all their grandkids.', true, 3),
  t('grandparentsGrandkidsGreat', 'Generations', 'Grandparents + all grandkids + great-grandkids', 'The top couple with every grandkid and great-grandkid.', false, 3),
  t('siblings', 'Siblings', 'All siblings', 'Each set of siblings together.', true, 2),
  t('siblingPairs', 'Siblings', 'Sibling pairs', 'Each pair of siblings on their own.', false, 2),
  t('sonsDaughters', 'Siblings', 'All sons / all daughters', 'Brothers together, sisters together (needs sex).', false, 2),
  t('grandsonsGranddaughters', 'Siblings', 'All grandsons / granddaughters', 'All the grandsons, all the granddaughters (needs sex).', false, 2),
  t('cousins', 'Siblings', 'Cousins', 'A generation of cousins across branches.', true, 2),
  t('branches', 'Branches', 'Each branch', 'One child of the top couple with their partner and descendants.', false, 2),
  t('grandparentsBranches', 'Branches', 'Grandparents + each branch', 'The top couple with each branch.', false, 3),
  t('households', 'Households', 'Each household', 'A couple or single parent with their children who are not grown.', true, 2),
  t('couples', 'Households', 'Each couple', 'Each couple on their own.', true, 2),
  t('parentChildren', 'Households', 'Each parent + their children', 'One parent with all their children.', false, 2),
  t('childKids', 'Households', "Each child's kids only", "One person's children without the parents.", false, 2),
  t('grandparentGrandkid', 'Pairs', 'Each grandparent + each grandkid', 'Off by default: it multiplies fast.', false, 2),
  t('auntUncleNiblings', 'Pairs', 'Aunt or uncle + nieces and nephews', "Each aunt or uncle with their nieces and nephews: all of them, then each family's kids.", false, 2),
  t('parentChild', 'Pairs', 'Each parent + each child', 'Every parent and child pair.', false, 2),
  t('grandmaGranddaughters', 'Pairs', 'Grandma with the granddaughters / grandpa with the grandsons', 'Needs sex.', false, 3),
  t('soloEveryone', 'Solo', 'Solo portraits: everyone', 'A portrait of each person.', false, 1),
  t('soloKids', 'Solo', 'Solo portraits: kids only', 'A portrait of each child.', true, 1),
  t('soloAdults', 'Solo', 'Solo portraits: adults only', 'A portrait of each grown-up.', false, 1),
  t('grownChildrenAll', 'Grown children', 'Parents + all their grown children', 'No partners or grandkids.', true, 3),
  t('parentsEachGrownChild', 'Grown children', 'Parents + each grown child', 'The parents with one grown child at a time.', false, 2),
  t('parentsEachGrownHousehold', 'Grown children', "Parents + each grown child's household", 'The parents with a grown child, partner and kids.', true, 3),
  t('grownHouseholdAlone', 'Grown children', "Each grown child's household alone", 'A grown child, partner and kids.', false, 2),
];

export const TEMPLATE_IDS: TemplateId[] = TEMPLATES.map((x) => x.id);
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((x) => [x.id, x])) as Record<TemplateId, Template>;
/** Templates ticked for a new shoot (Q12). */
export const DEFAULT_TEMPLATE_IDS: TemplateId[] = TEMPLATES.filter((x) => x.defaultOn).map((x) => x.id);

/** Most specific first: decides which template names a merged shot. */
export const SPECIFICITY: TemplateId[] = [
  'soloKids', 'soloAdults', 'soloEveryone', 'parentChild', 'grandparentGrandkid', 'grandmaGranddaughters',
  'couples', 'childKids', 'auntUncleNiblings', 'parentChildren', 'households', 'grownHouseholdAlone', 'parentsEachGrownChild',
  'parentsEachGrownHousehold', 'grownChildrenAll', 'branches', 'grandparentsBranches', 'siblingPairs', 'siblings', 'sonsDaughters',
  'grandsonsGranddaughters', 'cousins', 'grandparentsChildren', 'grandparentsGrandkids', 'grandparentsGrandkidsGreat',
  'generations', 'generationsWithPartners', 'fullGroupNoPartners', 'fullGroup',
];
