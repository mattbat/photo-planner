import type { Shot } from '../data/types';

/**
 * Who takes the photo for a shot (P6). Nothing when the camera person is not
 * in it. When they are, the backup takes it, unless the backup is in it too
 * (or nobody is set): then use a timer or tripod.
 */
export function cameraFor(
  shot: Pick<Shot, 'personIds'>,
  cameraPersonId: string | undefined,
  backupId: string | undefined,
  nameOf: (id: string) => string,
): string | undefined {
  if (!cameraPersonId || !shot.personIds.includes(cameraPersonId)) return undefined;
  const backup = backupId && backupId !== cameraPersonId ? backupId : undefined;
  if (!backup || shot.personIds.includes(backup)) return '📷 Use a timer or tripod';
  return `📷 ${nameOf(backup)} takes this`;
}
