import { DEFAULT_TEMPLATE_IDS, TEMPLATE_IDS } from '../engine/templates';
import type { AppSettings, OrderOptions, TemplateSetting, TimeEstimates } from './types';

/** Every template, in §6.1 order, with the Q12 ones on (the engine's defaults). */
export function defaultTemplates(): TemplateSetting[] {
  return TEMPLATE_IDS.map((id) => ({ id, enabled: DEFAULT_TEMPLATE_IDS.includes(id) }));
}

export const DEFAULT_ORDER_OPTIONS: OrderOptions = {
  kidsFirst: true,
  releaseOlderEarly: true,
  bigGroupFirst: true,
  mustHavesEarly: false,
  everyoneFirst: true,
};

/** O5: 2 min for 1–2 people, 3 for 3–6, 5 for 7+, and a short set-up allowance. */
export const DEFAULT_TIME_ESTIMATES: TimeEstimates = { small: 2, medium: 3, large: 5, setup: 5 };

export function defaultSettings(): AppSettings {
  return {
    defaultTemplates: defaultTemplates(),
    defaultOrderOptions: { ...DEFAULT_ORDER_OPTIONS },
    timeEstimates: { ...DEFAULT_TIME_ESTIMATES },
    units: 'us',
  };
}
