/** Solar position (SunCalc / NOAA-style low-precision formulas, ~0.01 deg). Pure, offline. */

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

export interface SunPosition { altitudeDeg: number; azimuthDeg: number }

export function sunPosition(date: Date, lat: number, lng: number): SunPosition {
  const d = date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI; // ecliptic longitude
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - RAD * -lng - ra;
  const phi = RAD * lat;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azFromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { altitudeDeg: alt / RAD, azimuthDeg: (((azFromSouth / RAD + 180) % 360) + 360) % 360 };
}

export const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;

/** 16-point compass label for a bearing in degrees. */
export function compassLabel(bearingDeg: number): string {
  const i = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[i]!;
}

/** Sun bearing (0 = N, clockwise) with a 16-point label; also altitude. */
export function sunBearingAt(date: Date, lat: number, lng: number) {
  const { altitudeDeg, azimuthDeg } = sunPosition(date, lat, lng);
  return { bearingDeg: azimuthDeg, label: compassLabel(azimuthDeg), altitudeDeg, aboveHorizon: altitudeDeg > -0.833 };
}
