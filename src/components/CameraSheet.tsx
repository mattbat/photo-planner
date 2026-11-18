import { useState } from 'react';
import { setCameraPeople } from '../data/repo';
import type { Person, Shoot } from '../data/types';
import { ChoosePerson } from './ChoosePerson';
import { Sheet } from './ui';

type Field = 'cameraPersonId' | 'backupCameraPersonId';

/**
 * Behind the camera (P6): who usually takes the photos, and who takes the
 * shots that include them. Picked from the people attending; each can be cleared.
 */
export function CameraSheet({ shoot, people, nameOf, onClose }: { shoot: Shoot; people: Person[]; nameOf: (id: string) => string; onClose: () => void }) {
  const [choosing, setChoosing] = useState<Field | null>(null);
  const [note, setNote] = useState('');
  const attending = people.filter((p) => shoot.attendingIds.includes(p.id));
  const save = async (field: Field, id: string | null) => {
    const { reordered } = await setCameraPeople(shoot.id, { [field]: id });
    setChoosing(null);
    setNote(reordered ? 'Saved. Their shots are now together.' : 'Saved.');
  };
  const row = (field: Field, label: string, others: string | undefined) => {
    const current = shoot[field];
    return (
      <div className="camera-row" key={field}>
        <p className="row-label">{label}</p>
        {choosing === field ? (
          <ChoosePerson
            label={label}
            people={attending.filter((p) => p.id !== others)}
            onPick={(p) => void save(field, p.id)}
            onCancel={() => setChoosing(null)}
          />
        ) : (
          <div className="camera-pick">
            <button type="button" className="btn secondary small" aria-label={`${label}: ${current ? nameOf(current) : 'nobody'}. Change`} onClick={() => setChoosing(field)}>
              {current ? nameOf(current) : 'Choose'}
            </button>
            {current && (
              <button type="button" className="link" aria-label={`Clear ${label}`} onClick={() => void save(field, null)}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
  return (
    <Sheet title="Behind the camera" onClose={onClose}>
      <p className="hint">If the photographer is in some shots, say who takes those. Their shots are kept together so the camera is handed over once.</p>
      {note && (
        <p className="status-msg" role="status">
          {note}
        </p>
      )}
      {row('cameraPersonId', 'Usually takes the photos', shoot.backupCameraPersonId)}
      {shoot.cameraPersonId && row('backupCameraPersonId', `Takes ${nameOf(shoot.cameraPersonId)}’s shots`, shoot.cameraPersonId)}
      {shoot.cameraPersonId && !shoot.backupCameraPersonId && <p className="hint">With no one chosen, their shots say “Use a timer or tripod”.</p>}
    </Sheet>
  );
}
