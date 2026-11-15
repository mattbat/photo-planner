import { useEffect, useState } from 'react';
import { headingFromEvent } from '../domain/light';

type IOSOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * A compass rose with an arrow towards the sun (L5). With "Use compass" the
 * rose turns with the phone, so the arrow points at the real sun. Without a
 * compass it stays north-up.
 */
export function CompassRose({ bearing, label }: { bearing: number; label: string }) {
  const supported = typeof DeviceOrientationEvent !== 'undefined';
  const [live, setLive] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!live) return;
    const onEvent = (e: Event) => {
      const h = headingFromEvent(e as DeviceOrientationEvent & { webkitCompassHeading?: number });
      if (h !== null) setHeading(h);
    };
    window.addEventListener('deviceorientationabsolute', onEvent);
    window.addEventListener('deviceorientation', onEvent);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onEvent);
      window.removeEventListener('deviceorientation', onEvent);
    };
  }, [live]);

  const start = async () => {
    const api = DeviceOrientationEvent as IOSOrientation;
    try {
      if (typeof api.requestPermission === 'function') {
        if ((await api.requestPermission()) !== 'granted') {
          setNote('The compass is switched off for this app.');
          return;
        }
      }
      setLive(true);
      setNote('Hold the phone flat. The rose turns to match north.');
    } catch {
      setNote('Couldn’t start the compass.');
    }
  };

  const stop = () => {
    setLive(false);
    setHeading(null);
    setNote('');
  };

  const rotate = heading === null ? 0 : -heading;
  return (
    <div className="compass">
      <svg viewBox="-60 -60 120 120" width="150" height="150" role="img" aria-label={`Sun direction: ${label}, ${Math.round(bearing)} degrees`}>
        <g style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 0.15s linear' }} data-testid="rose" data-rotation={Math.round(rotate)}>
          <circle r="52" className="rose-ring" />
          {[0, 90, 180, 270].map((a) => (
            <line key={a} x1="0" y1="-52" x2="0" y2="-44" className="rose-tick" transform={`rotate(${a})`} />
          ))}
          <text y="-34" textAnchor="middle" className="rose-n">N</text>
          <text y="42" textAnchor="middle" className="rose-l">S</text>
          <text x="40" y="4" textAnchor="middle" className="rose-l">E</text>
          <text x="-40" y="4" textAnchor="middle" className="rose-l">W</text>
          <g transform={`rotate(${bearing})`}>
            <line x1="0" y1="0" x2="0" y2="-30" className="rose-arrow" />
            <polygon points="0,-38 -6,-26 6,-26" className="rose-head" />
          </g>
        </g>
      </svg>
      {supported && (
        <div className="compass-controls">
          {live ? (
            <button type="button" className="btn small secondary" onClick={stop}>
              Stop compass
            </button>
          ) : (
            <button type="button" className="btn small secondary" onClick={() => void start()}>
              Use compass
            </button>
          )}
        </div>
      )}
      {note && <p className="muted-note">{note}</p>}
      {!supported && <p className="muted-note">This phone has no compass to use here. The rose has north at the top.</p>}
    </div>
  );
}
