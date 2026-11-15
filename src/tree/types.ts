export interface TreePerson {
  id: string;
  name: string;
  sex?: 'male' | 'female';
  /** Grown (own household). Anyone with a partner or children counts as grown too. */
  grown: boolean;
  parentIds: string[];
  partnerIds: string[];
  separatedPartnerIds?: string[];
}

export type AttendanceStatus = 'absent' | 'arrived' | 'waiting' | 'left';
