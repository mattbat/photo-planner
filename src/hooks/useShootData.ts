import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db } from '../data/db';
import { getSettings, regenerateShoot } from '../data/repo';
import type { AppSettings, Extra, Family, Location, Partnership, Person, Shoot } from '../data/types';

export interface ShootData {
  shoot: Shoot;
  family: Family | null;
  people: Person[];
  partnerships: Partnership[];
  extras: Extra[];
  settings: AppSettings;
  location: Location | null;
}

/**
 * One shoot with its family, read live. When the family changes (a person, a
 * partnership or an extra is added, edited or removed), the shot list is
 * rebuilt so it never goes stale (E6).
 */
export function useShootData(shootId: string): ShootData | null | undefined {
  const data = useLiveQuery(async (): Promise<ShootData | null> => {
    const shoot = await db.shoots.get(shootId);
    if (!shoot) return null;
    return {
      shoot,
      family: (await db.families.get(shoot.familyId)) ?? null,
      people: await db.people.where('familyId').equals(shoot.familyId).toArray(),
      partnerships: await db.partnerships.where('familyId').equals(shoot.familyId).toArray(),
      extras: await db.extras
        .where('familyId')
        .equals(shoot.familyId)
        .filter((e) => e.shootId === undefined || e.shootId === shootId)
        .toArray(),
      settings: await getSettings(),
      location: shoot.locationId ? ((await db.locations.get(shoot.locationId)) ?? null) : null,
    };
  }, [shootId]);

  const stamp = data
    ? [...data.people, ...data.partnerships, ...data.extras].map((r) => `${r.id}:${r.updatedAt}`).join('|')
    : '';
  useEffect(() => {
    if (stamp) void regenerateShoot(shootId);
  }, [shootId, stamp]);

  return data;
}
