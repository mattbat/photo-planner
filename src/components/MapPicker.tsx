import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

/**
 * Tap the map to drop a pin (L1). Loaded on demand, because Leaflet is
 * heavy and the map needs a connection for its tiles anyway. Tiles are never
 * precached.
 */
export default function MapPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | undefined;
  longitude: number | undefined;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    if (!el.current) return;
    const has = latitude !== undefined && longitude !== undefined;
    const map = L.map(el.current, { zoomControl: true }).setView(has ? [latitude, longitude] : [20, 0], has ? 13 : 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // A circle, not Leaflet's image marker, so there are no icon files to bundle.
    let pin: L.CircleMarker | null = has ? L.circleMarker([latitude, longitude], { radius: 9, color: '#fff', weight: 3, fillColor: '#e8a33d', fillOpacity: 1 }).addTo(map) : null;
    map.on('click', (e: L.LeafletMouseEvent) => {
      pin?.remove();
      pin = L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 3, fillColor: '#e8a33d', fillOpacity: 1 }).addTo(map);
      pick.current(e.latlng.lat, e.latlng.lng > 180 || e.latlng.lng < -180 ? ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180 : e.latlng.lng);
    });
    return () => {
      map.remove();
    };
    // The map is built once; the pin is moved by clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} className="map-box" data-testid="map" />;
}
