import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatTemp, formatWind, unitsOf } from '../domain/units';
import { fetchForecast, isOnline, NeedsConnection } from '../data/online';
import { getSettings, today, updateShoot } from '../data/repo';
import type { Location, Shoot } from '../data/types';
import { formatDate } from '../domain/dates';
import {
  defaultSession,
  fetchedText,
  forecastForShoot,
  formatRange,
  formatSpan,
  hourTicks,
  inForecastRange,
  lightHeadline,
  parseYMD,
  sessionWindow,
  shootFit,
  shootSpan,
  toHHmm,
  windowPosition,
  zoneCity,
  type LightSession,
} from '../domain/light';
import { daysOverview, guessTimeZone, sunBearingAt, sunTimes, suggestStart, zonedTimeToUtc, formatLocalTime } from '../sun';
import { CompassRose } from './CompassRose';
import { LocationSheet } from './LocationSheet';
import { Segmented } from './ui';

const SEGMENT_LABEL = { day: 'Daylight', golden: 'Golden hour', dark: 'Too dark' } as const;

/** The Light part of a shoot (§10): place, the session around golden hour, suggested start, then a "More" fold. */
export function LightSection({ shoot, location, totalMinutes }: { shoot: Shoot; location: Location | null; totalMinutes: number }) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="light">
      <div className="light-place">
        <div className="light-place-name">{location ? location.name : 'No location yet'}</div>
        <button type="button" className={`btn small ${location ? 'secondary' : ''}`} onClick={() => setPicking(true)}>
          {location ? 'Change' : 'Set location'}
        </button>
      </div>
      {!location && <p className="muted-note">Pick a place to see golden hour, the sun’s direction and a suggested start time.</p>}
      {location && <Lit shoot={shoot} location={location} totalMinutes={totalMinutes} />}
      {picking && <LocationSheet shootId={shoot.id} currentId={shoot.locationId} onClose={() => setPicking(false)} />}
    </div>
  );
}

function Lit({ shoot, location, totalMinutes }: { shoot: Shoot; location: Location; totalMinutes: number }) {
  const tz = location.timeZone ?? guessTimeZone();
  const [session, setSession] = useState<LightSession>(() => defaultSession(shoot.startTime));
  const now = useMinute();

  const times = useMemo(() => sunTimes(parseYMD(shoot.date), location.latitude, location.longitude, tz), [shoot.date, location.latitude, location.longitude, tz]);
  const span = shootSpan(times, shoot.startTime, totalMinutes);
  const win = useMemo(() => sessionWindow(times, session, span), [times, session, span]);
  const ticks = useMemo(() => hourTicks(win, tz), [win, tz]);
  const suggestion = useMemo(() => suggestStart({ times, shootMinutes: Math.max(totalMinutes, 5), session }), [times, totalMinutes, session]);
  const suggestedHHmm = toHHmm(suggestion.start, tz);
  const startInstant = shoot.startTime ? zonedTimeToUtc(times.date.y, times.date.m, times.date.d, ...hm(shoot.startTime), tz) : suggestion.start;
  const sun = sunBearingAt(startInstant, location.latitude, location.longitude);
  const headline = lightHeadline(times, session);
  const fit = shootFit(win.golden, span);
  const nowAt = shoot.date === today() ? windowPosition(win, new Date(now)) : null;
  const spanFrom = span ? (span.start.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime()) : 0;
  const spanTo = span ? (span.end.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime()) : 0;
  const here = guessTimeZone();

  return (
    <>
      <Segmented
        label="Which session"
        value={session}
        onChange={setSession}
        options={[
          { value: 'morning', label: 'Morning' },
          { value: 'evening', label: 'Evening' },
        ]}
      />
      <p className="light-headline" data-testid="light-headline">
        {headline}
      </p>
      {fit && (
        <p className="light-fit" data-testid="light-fit">
          {fit}
        </p>
      )}

      <div className="timeline" role="img" aria-label={`${headline}.${span ? ` Your shoot ${formatRange(span.start, span.end, tz)}.` : ''}`} data-testid="timeline">
        <div className="timeline-bar">
          {win.segments.map((s, i) => (
            <span key={i} className={`seg ${s.kind}`} style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%` }}>
              {s.to - s.from > 0.16 && <span className="seg-label">{SEGMENT_LABEL[s.kind]}</span>}
            </span>
          ))}
          {nowAt !== null && <span className="now-marker" data-testid="now-marker" style={{ left: `${nowAt * 100}%` }} title="Now" />}
        </div>
        <div className="timeline-ticks" aria-hidden>
          {ticks.map((t) => (
            <span key={t.label + t.at} style={{ left: `${t.at * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        {span && (
          <div className="shoot-row">
            <div className="shoot-track">
              <span className="shoot-span" data-testid="shoot-span" style={{ left: `${Math.max(0, spanFrom) * 100}%`, width: `${Math.max((Math.min(1, spanTo) - Math.max(0, spanFrom)) * 100, 1)}%` }} />
            </div>
            <div className="shoot-caption">Your shoot {formatRange(span.start, span.end, tz)}</div>
          </div>
        )}
      </div>
      {tz !== here && <p className="muted-note">Times are local to {zoneCity(tz)}.</p>}

      <h3 className="light-sub">Suggested start</h3>
      <p className="light-suggest">
        Start at <b>{formatLocalTime(suggestion.start, tz)}</b>, finish about {formatLocalTime(suggestion.end, tz)}
        <span className="muted"> (list takes about {Math.max(totalMinutes, 5)} min)</span>
      </p>
      {suggestion.warning && (
        <p className="problems" role="note">
          {suggestion.warning}
        </p>
      )}
      <button
        type="button"
        className="btn wide"
        disabled={shoot.startTime === suggestedHHmm}
        onClick={() => void updateShoot(shoot.id, { startTime: suggestedHHmm })}
      >
        {shoot.startTime === suggestedHHmm ? 'Start time is set' : 'Use this start time'}
      </button>

      <details className="fold light-more">
        <summary>More: sun direction, weather, other dates</summary>
        <h3 className="light-sub">Sun direction</h3>
        <div className="sun-dir">
          <CompassRose bearing={sun.bearingDeg} label={sun.label} caption={`Where the sun will be at ${formatLocalTime(startInstant, tz)}`} />
          <p>
            In the <b>{sun.label}</b> ({Math.round(sun.bearingDeg)}°)
            {sun.aboveHorizon ? `, ${Math.round(sun.altitudeDeg)}° up.` : ', below the horizon.'}
            <span className="muted"> Sun behind your family gives glow; off to one side gives soft light on faces.</span>
          </p>
        </div>
        <Weather shoot={shoot} location={location} totalMinutes={totalMinutes} />
        <DatePicker shoot={shoot} location={location} tz={tz} />
      </details>
    </>
  );
}

/** The current time, updated every minute, for the "now" marker. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const hm = (t: string): [number, number] => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return [h, m];
};

/** L6: the next three weeks of golden hours, tap one to set the date. */
function DatePicker({ shoot, location, tz }: { shoot: Shoot; location: Location; tz: string }) {
  const [open, setOpen] = useState(false);
  const days = useMemo(
    () => (open ? daysOverview(parseYMD(today()), 21, location.latitude, location.longitude, tz) : []),
    [open, location.latitude, location.longitude, tz],
  );
  return (
    <details className="fold" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Pick a date: the next 3 weeks</summary>
      {open && (
        <ul className="date-list" aria-label="Golden hour by day">
          {days.map((d) => (
            <li key={d.iso}>
              <button type="button" className={d.iso === shoot.date ? 'on' : ''} aria-pressed={d.iso === shoot.date} aria-label={`Use ${formatDate(d.iso)}`} onClick={() => void updateShoot(shoot.id, { date: d.iso })}>
                <span className="date-day">{formatDate(d.iso)}</span>
                <span className="date-times">
                  <span>Evening {formatSpan(d.goldenEvening, tz) ?? 'none'}</span>
                  <span>Morning {formatSpan(d.goldenMorning, tz) ?? 'none'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

const pct = (n: number | null) => (n === null ? '–' : `${n}%`);

/** L7: forecast on demand, cached on the shoot for offline viewing. */
function Weather({ shoot, location, totalMinutes }: { shoot: Shoot; location: Location; totalMinutes: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const units = unitsOf(useLiveQuery(async () => (await getSettings()).units, []));
  const inRange = inForecastRange(shoot.date, today());
  const cached = shoot.forecast && shoot.forecast.date === shoot.date ? shoot.forecast : null;
  const summary = cached ? forecastForShoot(cached, shoot.startTime, totalMinutes) : null;

  if (!inRange && !cached) {
    return (
      <>
        <h3 className="light-sub">Weather</h3>
        <p className="muted-note">The forecast is available for shoots in the next 14 days.</p>
      </>
    );
  }

  const get = async () => {
    if (!isOnline()) {
      setMessage('Needs a connection.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const f = await fetchForecast(location.latitude, location.longitude, shoot.date);
      if (f.hours.length === 0) {
        setMessage('No forecast for that day yet.');
      } else {
        await updateShoot(shoot.id, { forecast: { fetchedAt: Date.now(), date: shoot.date, latitude: location.latitude, longitude: location.longitude, hours: f.hours } });
      }
    } catch (e) {
      setMessage(e instanceof NeedsConnection ? 'Needs a connection.' : 'The forecast service didn’t answer. Try again later.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3 className="light-sub">Weather</h3>
      {summary && cached && (
        <div className="weather" data-testid="weather">
          {summary.hours.length === 0 ? (
            <p className="muted-note">The saved forecast doesn’t cover your shoot time.</p>
          ) : (
            <>
              <div className="weather-grid">
                <span>Cloud<b>{pct(summary.cloudPercent)}</b></span>
                <span>Rain chance<b>{pct(summary.rainPercent)}</b></span>
                <span>Wind<b>{formatWind(summary.windKmh, units)}</b></span>
                <span>Temperature<b>{formatTemp(summary.tempC, units)}</b></span>
              </div>
              <ul className="weather-hours">
                {summary.hours.map((h) => (
                  <li key={h.time}>
                    {h.time} · cloud {pct(h.cloudPercent)} · rain {pct(h.rainPercent)} · wind {formatWind(h.windKmh, units)} · {formatTemp(h.tempC, units)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted-note">Fetched {fetchedText(cached.fetchedAt)}{isOnline() ? '' : ' (saved on this phone)'}.</p>
        </div>
      )}
      {inRange && (
        <button type="button" className="btn secondary wide" disabled={busy} onClick={() => void get()}>
          {busy ? 'Getting forecast…' : cached ? 'Refresh forecast' : 'Get forecast'}
        </button>
      )}
      {message && (
        <p className="muted-note" role="status">
          {message}
        </p>
      )}
    </>
  );
}
