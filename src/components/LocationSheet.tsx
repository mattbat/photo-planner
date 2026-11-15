import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useState } from 'react';
import { db } from '../data/db';
import { currentPosition, fetchTimeZone, isOnline, NeedsConnection, searchPlaces, type Place } from '../data/online';
import { addLocation, deleteLocation, updateShoot } from '../data/repo';
import type { LocationSource } from '../data/types';
import { parseCoordinates, roundCoord } from '../domain/light';
import { guessTimeZone } from '../sun';
import { Sheet } from './ui';

const MapPicker = lazy(() => import('./MapPicker'));

const NEEDS = 'Needs a connection. You can still type the coordinates.';

const errorText = (e: unknown) => (e instanceof NeedsConnection ? NEEDS : e instanceof Error ? e.message : 'Something went wrong.');

/** Choose or add the place for a shoot (L1): saved places, GPS, search, coordinates or a map pin. */
export function LocationSheet({ shootId, currentId, onClose }: { shootId: string; currentId: string | undefined; onClose: () => void }) {
  const saved = useLiveQuery(() => db.locations.orderBy('name').toArray(), []) ?? [];
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const choose = async (id: string) => {
    await updateShoot(shootId, { locationId: id });
    onClose();
  };

  /** The zone from the place if known, else asked from the forecast service when online, else the phone's. */
  const save = async (p: Place, source: LocationSource) => {
    let timeZone = p.timeZone;
    if (!timeZone && isOnline()) {
      try {
        timeZone = await fetchTimeZone(p.latitude, p.longitude);
      } catch {
        /* offline or slow: use the phone's zone */
      }
    }
    const loc = await addLocation({
      name: p.name,
      ...(p.address ? { address: p.address } : {}),
      latitude: roundCoord(p.latitude),
      longitude: roundCoord(p.longitude),
      timeZone: timeZone ?? guessTimeZone(),
      source,
    });
    await choose(loc.id);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const typedName = (fallback: string) => name.trim() || fallback;

  return (
    <Sheet title="Shoot location" onClose={onClose}>
      {message && (
        <p className="problems" role="alert">
          {message}
        </p>
      )}

      <label className="row stack">
        <span className="row-label">Name for a new place (optional)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Park" autoComplete="off" />
      </label>

      {saved.length > 0 && (
        <>
          <h3 className="sheet-sub">Saved places</h3>
          <ul className="list">
            {saved.map((l) => (
              <li key={l.id}>
                <div className="list-item">
                  <button type="button" className="loc-pick" onClick={() => void choose(l.id)} aria-pressed={l.id === currentId}>
                    <span className="list-title">
                      {l.name}
                      <span className="list-sub">
                        {l.address ? `${l.address} · ` : ''}
                        {l.latitude.toFixed(3)}, {l.longitude.toFixed(3)}
                      </span>
                    </span>
                    {l.id === currentId && <span className="list-meta">In use</span>}
                  </button>
                  <button type="button" className="btn small secondary" aria-label={`Forget ${l.name}`} onClick={() => void deleteLocation(l.id)}>
                    Forget
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="sheet-sub">Set a new place</h3>
      <button
        type="button"
        className="btn wide"
        disabled={busy !== null}
        onClick={() =>
          void run('gps', async () => {
            const p = await currentPosition();
            await save({ name: typedName('My location'), ...p }, 'gps');
          })
        }
      >
        {busy === 'gps' ? 'Finding you…' : 'Use my location'}
      </button>

      <form
        className="loc-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run('search', async () => {
            if (!isOnline()) throw new NeedsConnection();
            setResults(await searchPlaces(query));
          });
        }}
      >
        <label className="row stack">
          <span className="row-label">Search for a place or address</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Town or park name" autoComplete="off" enterKeyHint="search" />
        </label>
        <button type="submit" className="btn secondary wide" disabled={busy !== null || !query.trim()}>
          {busy === 'search' ? 'Searching…' : 'Search'}
        </button>
        {!isOnline() && <p className="muted-note">Needs a connection.</p>}
      </form>
      {results && results.length === 0 && <p className="muted-note">Nothing found. Try another spelling, or type the coordinates.</p>}
      {results && results.length > 0 && (
        <ul className="list" aria-label="Search results">
          {results.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button type="button" className="list-item loc-pick" onClick={() => void run('save', () => save({ ...r, name: name.trim() || r.name }, 'search'))}>
                <span className="list-title">
                  {r.name}
                  <span className="list-sub">{r.address ?? `${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="fold" open>
        <summary>Type coordinates</summary>
        <div className="field-row">
          <label className="field">
            <span>Latitude</span>
            <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="41.88" autoComplete="off" />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" placeholder="-87.63" autoComplete="off" />
          </label>
        </div>
        <button
          type="button"
          className="btn secondary wide"
          disabled={busy !== null}
          onClick={() =>
            void run('coords', async () => {
              const c = parseCoordinates(lat, lon);
              if ('error' in c) throw new Error(c.error);
              await save({ name: typedName('Typed place'), ...c }, 'coordinates');
            })
          }
        >
          Use these coordinates
        </button>
      </details>

      <details className="fold" onToggle={(e) => setMapOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Drop a pin on a map</summary>
        {mapOpen &&
          (isOnline() ? (
            <>
              <Suspense fallback={<p className="muted-note">Loading the map…</p>}>
                <MapPicker latitude={pin?.latitude} longitude={pin?.longitude} onPick={(latitude, longitude) => setPin({ latitude, longitude })} />
              </Suspense>
              <p className="muted-note">Tap the map to place the pin.</p>
              <button
                type="button"
                className="btn secondary wide"
                disabled={!pin || busy !== null}
                onClick={() => pin && void run('pin', () => save({ name: typedName('Pinned spot'), ...pin }, 'pin'))}
              >
                Use this pin
              </button>
            </>
          ) : (
            <p className="muted-note">The map needs a connection.</p>
          ))}
      </details>
    </Sheet>
  );
}
