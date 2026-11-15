import { useMemo } from 'react';
import type { Location, Shoot } from '../data/types';
import { countdownText, parseYMD } from '../domain/light';
import { goldenHourCountdown, guessTimeZone, sunTimes } from '../sun';

/**
 * "Golden hour: 34 min left" for the live shoot screen (L8, D7). Pass the
 * current time as `now` so the caller decides how often it ticks.
 */
export function LightBanner({ shoot, location, now }: { shoot: Pick<Shoot, 'date'>; location: Location | null | undefined; now: Date }) {
  const times = useMemo(
    () => (location ? sunTimes(parseYMD(shoot.date), location.latitude, location.longitude, location.timeZone ?? guessTimeZone()) : null),
    [shoot.date, location],
  );
  if (!times) return null;
  const c = goldenHourCountdown(now, times);
  return (
    <p className={`light-banner ${c.state}`} role="status" aria-label="Golden hour countdown">
      <span aria-hidden>☀</span> {countdownText(c)}
    </p>
  );
}
