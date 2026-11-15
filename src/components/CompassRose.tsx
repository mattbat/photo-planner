import { useEffect, useState } from 'react';
import { headingFromEvent } from '../domain/light';

type IOSOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * A compass rose with a sun marker where the sun will be (L5). With "Use
 * compass" the rose turns with the phone, so the sun marker points the real
 * way and the top of the rose is where you are facing. Without a compass it
 * stays north-up.
 */
export function CompassRose({ bearing, label, caption }: { bearing: number; label: string; caption: string }) {
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
      setNote('');
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
      <svg viewBox="-64 -66 128 132" width="160" height="165" role="img" aria-label={`Sun direction: ${label}, ${Math.round(bearing)} degrees`}>
        {live && <polygon points="0,-63 -5,-55 5,-55" className="rose-facing" data-testid="facing" />}
        <g style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 0.15s linear' }} data-testid="rose" data-rotation={Math.round(rotate)}>
          <circle r="52" className="rose-ring" />
          {[0, 90, 180, 270].map((a) => (
            <line key={a} x1="0" y1="-52" x2="0" y2="-46" className="rose-tick" transform={`rotate(${a})`} />
          ))}
          <text y="-36" textAnchor="middle" className="rose-n">N</text>
          <text y="43" textAnchor="middle" className="rose-l">S</text>
          <text x="40" y="4" textAnchor="middle" className="rose-l">E</text>
          <text x="-40" y="4" textAnchor="middle" className="rose-l">W</text>
          <g transform={`rotate(${bearing})`} data-testid="sun-marker">
            <line x1="0" y1="-6" x2="0" y2="-24" className="rose-arrow" />
            <g transform="translate(0 -31)">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line key={a} x1="0" y1="-8.5" x2="0" y2="-12" className="rose-ray" transform={`rotate(${a})`} />
              ))}
              <circle r="6" className="rose-sun" />
            </g>
          </g>
          <circle r="2.5" className="rose-hub" />
        </g>
      </svg>
      <p className="compass-caption">{caption}</p>
      {supported && (
        <div className="compass-controls">
          {live ? (
            <button type="button" className="btn small" onClick={stop}>
              Compass on
            </button>
          ) : (
            <button type="button" className="btn small secondary" onClick={() => void start()}>
              Use compass
            </button>
          )}
          <p className="muted-note">{live ? 'You are facing the top of the rose. Hold the phone flat.' : 'Turn your phone and the sun marker points the real way.'}</p>
        </div>
      )}
      {note && <p className="muted-note">{note}</p>}
      {!supported && <p className="muted-note">This phone has no compass to use here. The rose has north at the top.</p>}
    </div>
  );
}
