import { useMemo, useState } from 'react';
import { fetchForecast, isOnline, NeedsConnection } from '../data/online';
import { today, updateShoot } from '../data/repo';
import type { Location, Shoot } from '../data/types';
import { formatDate } from '../domain/dates';
import {
  dayTimeline,
  fetchedText,
  forecastForShoot,
  formatSpan,
  inForecastRange,
  lightRows,
  parseYMD,
  shootSpan,
  toHHmm,
} from '../domain/light';
import { daysOverview, guessTimeZone, sunBearingAt, sunTimes, suggestStart, zonedTimeToUtc, formatLocalTime } from '../sun';
import { CompassRose } from './CompassRose';
import { LocationSheet } from './LocationSheet';
import { Segmented } from './ui';

const KIND_LABEL = { night: 'Night', blue: 'Blue hour', golden: 'Golden hour', day: 'Daylight' } as const;

/** The Light part of a shoot (§10): place, timeline, suggested start, sun direction, date helper and weather. */
export function LightSection({ shoot, location, totalMinutes }: { shoot: Shoot; location: Location | null; totalMinutes: number }) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="light">
      <div className="light-place">
        <div>
          <div className="light-place-name">{location ? location.name : 'No location yet'}</div>
          {location && (
            <div className="light-place-sub">
              {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)} · {location.timeZone ?? guessTimeZone()}
            </div>
          )}
        </div>
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
  const [session, setSession] = useState<'evening' | 'morning'>('evening');

  const times = useMemo(() => sunTimes(parseYMD(shoot.date), location.latitude, location.longitude, tz), [shoot.date, location.latitude, location.longitude, tz]);
  const segments = useMemo(() => dayTimeline(times), [times]);
  const span = shootSpan(times, shoot.startTime, totalMinutes);
  const rows = lightRows(times);
  const suggestion = useMemo(() => suggestStart({ times, shootMinutes: Math.max(totalMinutes, 5), session }), [times, totalMinutes, session]);
  const suggestedHHmm = toHHmm(suggestion.start, tz);
  const startInstant = shoot.startTime ? zonedTimeToUtc(times.date.y, times.date.m, times.date.d, ...hm(shoot.startTime), tz) : suggestion.start;
  const sun = sunBearingAt(startInstant, location.latitude, location.longitude);

  return (
    <>
      <div className="timeline" role="img" aria-label={timelineLabel(segments, span, tz)} data-testid="timeline">
        <div className="timeline-bar">
          {segments.map((s, i) => (
            <span key={i} className={`seg ${s.kind}`} style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%` }} />
          ))}
          {span && <span className="shoot-span" data-testid="shoot-span" style={{ left: `${span.from * 100}%`, width: `${Math.max((span.to - span.from) * 100, 1)}%` }} />}
        </div>
        <div className="timeline-axis" aria-hidden>
          {['12 am', '6 am', '12 pm', '6 pm', '12 am'].map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="timeline-key" aria-hidden>
          {(['night', 'blue', 'golden', 'day'] as const).map((k) => (
            <span key={k}>
              <i className={`seg ${k}`} /> {KIND_LABEL[k]}
            </span>
          ))}
          {span && (
            <span>
              <i className="shoot-swatch" /> Your shoot
            </span>
          )}
        </div>
      </div>

      <ul className="light-times" aria-label="Light times">
        {rows.map((r) => (
          <li key={r.key} className={r.missing ? 'missing' : ''}>
            <span>{r.label}</span>
            <b>{r.text}</b>
          </li>
        ))}
      </ul>

      <details className="fold">
        <summary>What do golden hour and blue hour mean?</summary>
        <p className="info-text">
          <b>Golden hour</b> is when the sun is between about 6° above and 4° below the horizon: warm, soft, low light that flatters skin.{' '}
          <b>Blue hour</b> is when it is 4° to 6° below the horizon: the sky glows deep blue just after sunset or before sunrise. Daylight is the sun higher than 6°; night is lower than 6° below.
        </p>
      </details>

      <h3 className="light-sub">Suggested start</h3>
      <Segmented
        label="Which golden hour"
        value={session}
        onChange={setSession}
        options={[
          { value: 'morning', label: 'Morning' },
          { value: 'evening', label: 'Evening' },
        ]}
      />
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

      <h3 className="light-sub">Sun direction</h3>
      <div className="sun-dir">
        <CompassRose bearing={sun.bearingDeg} label={sun.label} />
        <p>
          At {formatLocalTime(startInstant, tz)} the sun is in the <b>{sun.label}</b> ({Math.round(sun.bearingDeg)}°)
          {sun.aboveHorizon ? `, ${Math.round(sun.altitudeDeg)}° up.` : ', below the horizon.'}
          <span className="muted"> Put your family with the sun behind them for glow, or off to one side for soft light on faces.</span>
        </p>
      </div>

      <DatePicker shoot={shoot} location={location} tz={tz} />
      <Weather shoot={shoot} location={location} totalMinutes={totalMinutes} />
    </>
  );
}

const hm = (t: string): [number, number] => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return [h, m];
};

function timelineLabel(segments: ReturnType<typeof dayTimeline>, span: ReturnType<typeof shootSpan>, tz: string) {
  const parts = segments
    .filter((s) => s.kind === 'golden' || s.kind === 'blue')
    .map((s) => `${KIND_LABEL[s.kind]} ${formatSpan({ start: s.start, end: s.end }, tz)}`);
  return `Light across the day. ${parts.join('; ')}.${span ? ` Your shoot ${formatLocalTime(span.start, tz)} to ${formatLocalTime(span.end, tz)}.` : ''}`;
}

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

const temp = (c: number | null) => (c === null ? '–' : `${Math.round(c)}°C`);
const pct = (n: number | null) => (n === null ? '–' : `${n}%`);

/** L7: forecast on demand, cached on the shoot for offline viewing. */
function Weather({ shoot, location, totalMinutes }: { shoot: Shoot; location: Location; totalMinutes: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
                <span>Wind<b>{summary.windKmh === null ? '–' : `${summary.windKmh} km/h`}</b></span>
                <span>Temperature<b>{temp(summary.tempC)}</b></span>
              </div>
              <ul className="weather-hours">
                {summary.hours.map((h) => (
                  <li key={h.time}>
                    {h.time} · cloud {pct(h.cloudPercent)} · rain {pct(h.rainPercent)} · wind {h.windKmh ?? '–'} km/h · {temp(h.tempC)}
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
