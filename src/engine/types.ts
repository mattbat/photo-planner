export interface EnginePerson {
  id: string;
  name: string;
  nickname?: string;
  sex?: 'male' | 'female';
  /** Anyone with a partner or a child counts as grown regardless of this flag. */
  grown: boolean;
  parentIds: string[];
  partnerIds: string[];
  /** Former partners (still co-parents, but not a couple). */
  separatedPartnerIds?: string[];
}

export interface EngineExtra {
  id: string;
  name: string;
  kind: 'guest' | 'pet';
  /** Templates whose shots this extra joins. */
  joinTemplates: TemplateId[];
  /** If set, the extra only joins non-"full group" shots that include one of these people. */
  ownerIds?: string[];
}

export type TemplateId =
  | 'fullGroup' | 'fullGroupNoPartners'
  | 'generations' | 'generationsWithPartners'
  | 'grandparentsChildren' | 'grandparentsGrandkids' | 'grandparentsGrandkidsGreat'
  | 'siblings' | 'siblingPairs' | 'sonsDaughters' | 'grandsonsGranddaughters' | 'cousins'
  | 'branches' | 'grandparentsBranches'
  | 'households' | 'couples' | 'parentChildren' | 'childKids'
  | 'grandparentGrandkid' | 'auntUncleNiblings' | 'parentChild' | 'grandmaGranddaughters'
  | 'soloEveryone' | 'soloKids' | 'soloAdults'
  | 'grownChildrenAll' | 'parentsEachGrownChild' | 'parentsEachGrownHousehold' | 'grownHouseholdAlone';

export type TemplateGroup =
  | 'Everyone' | 'Generations' | 'Siblings' | 'Branches' | 'Households' | 'Pairs' | 'Solo' | 'Grown children' | 'Custom';

export interface Template {
  id: TemplateId;
  group: TemplateGroup;
  label: string;
  description: string;
  defaultOn: boolean;
  minSize: number;
}

export interface Shot {
  /** Stable: primary template + sorted person ids (custom shots keep their own key). */
  key: string;
  name: string;
  peopleIds: string[];
  extraIds: string[];
  templateIds: TemplateId[];
  groupLabel: string;
  branchId?: string;
  custom?: boolean;
}

export interface ShotEdits {
  removed: string[];
  renamed: Record<string, string>;
  custom: Shot[];
}

export interface GenerateInput {
  people: EnginePerson[];
  extras: EngineExtra[];
  attendingIds: string[];
  templateIds: TemplateId[];
  edits?: ShotEdits;
  /** Used in names such as "Carter cousins". */
  familyName?: string;
}

export interface GenerateResult {
  shots: Shot[];
  flagged: { key: string; reason: string }[];
  counts: Record<TemplateId, number>;
}

export interface PreviewCount {
  /** Shots this template makes on its own. */
  standalone: number;
  /** Shots it would add to the list produced by the currently selected templates. */
  added: number;
}
