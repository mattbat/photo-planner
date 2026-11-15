import {
  TEMPLATE_IDS,
  type AppSettings,
  type OrderOptions,
  type TemplateId,
  type TemplateSetting,
  type TimeEstimates,
} from './types';

/**
 * The shot types ticked for a new shoot (REQUIREMENTS.md Q12 default):
 * full group, grandparents + all grandkids, parents + all grown children,
 * parents + each grown child's household, each household, each couple, all
 * siblings, cousins, and solo portraits of the kids.
 */
export const DEFAULT_ENABLED_TEMPLATES: readonly TemplateId[] = [
  'full-group',
  'grandparents-all-grandkids',
  'parents-all-grown-children',
  'parents-each-grown-child-household',
  'each-household',
  'each-couple',
  'all-siblings',
  'cousins',
  'solo-portraits',
];

/** Every template, in §6.1 order, with the Q12 ones on. */
export function defaultTemplates(): TemplateSetting[] {
  return TEMPLATE_IDS.map((id) => ({
    id,
    enabled: DEFAULT_ENABLED_TEMPLATES.includes(id),
    ...(id === 'solo-portraits' ? { soloScope: 'kids' as const } : {}),
  }));
}

export const DEFAULT_ORDER_OPTIONS: OrderOptions = {
  kidsFirst: true,
  releaseOlderEarly: true,
  bigGroupFirst: true,
  mustHavesEarly: false,
};

/** O5: 2 min for 1–2 people, 3 for 3–6, 5 for 7+, and a short set-up allowance. */
export const DEFAULT_TIME_ESTIMATES: TimeEstimates = { small: 2, medium: 3, large: 5, setup: 5 };

export function defaultSettings(): AppSettings {
  return {
    defaultTemplates: defaultTemplates(),
    defaultOrderOptions: { ...DEFAULT_ORDER_OPTIONS },
    timeEstimates: { ...DEFAULT_TIME_ESTIMATES },
  };
}
