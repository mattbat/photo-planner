import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Empty, Section, TopBar } from '../components/ui';
import { db } from '../data/db';
import { addPosePhoto, deletePose, deletePosePhoto, seedStarterPoses, setPoseFavorite } from '../data/repo';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, sizeLabel, TAG_LABELS } from '../poses/labels';
import { paths, navigate } from '../router';
import { PoseEditSheet } from './PoseEditSheet';
import { poseImageSrc, resizePhoto } from './posePhoto';

/** One pose (PL2, PL4): image and your photos, how to direct it, tips, favorite, your own edits. */
export function PoseDetailScreen({ poseId }: { poseId: string }) {
  // `null` once looked up and missing; `undefined` while loading.
  const pose = useLiveQuery(async () => (await db.poses.get(poseId)) ?? null, [poseId]);
  const photos = useLiveQuery(() => db.posePhotos.where('poseId').equals(poseId).sortBy('createdAt'), [poseId]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void seedStarterPoses();
  }, []);

  if (pose === undefined) return <main className="screen" />;
  if (pose === null) {
    return (
      <main className="screen">
        <TopBar title="Pose" back={paths.poses()} historyBack />
        <Empty>This pose is not in the library.</Empty>
      </main>
    );
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      await addPosePhoto({ poseId, ...(await resizePhoto(file)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be added.');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${pose.name}” and its photos?`)) return;
    await deletePose(pose.id);
    navigate(paths.poses());
  };

  return (
    <main className="screen">
      <TopBar
        title={pose.name}
        back={paths.poses()}
        historyBack
        action={
          <button
            type="button"
            className="pl-fav"
            aria-pressed={pose.favorite}
            aria-label={pose.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => void setPoseFavorite(pose.id, !pose.favorite)}
          >
            {pose.favorite ? '★' : '☆'}
          </button>
        }
      />
      <div className="pl-gallery" aria-label="Pictures">
        {pose.image && (
          <figure className="pl-slide">
            <img src={poseImageSrc(pose.image)} alt={`Illustration of ${pose.name}`} />
          </figure>
        )}
        {(photos ?? []).map((ph) => (
          <figure key={ph.id} className="pl-slide">
            <img src={ph.dataUrl} alt={`Your photo of ${pose.name}`} />
            <button type="button" className="btn small danger pl-slide-del" onClick={() => void deletePosePhoto(ph.id)}>
              Delete photo
            </button>
          </figure>
        ))}
      </div>
      <label className="btn secondary wide pl-add-photo">
        Add my photo
        <input className="file-input" type="file" accept="image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <p className="pl-meta">
        {CATEGORY_LABELS[pose.category]} · {sizeLabel(pose.minSize, pose.maxSize)} · {DIFFICULTY_LABELS[pose.difficulty]}
      </p>
      {pose.description && <p>{pose.description}</p>}
      {pose.tags.length > 0 && (
        <ul className="pl-tags" aria-label="Tags">
          {pose.tags.map((t) => (
            <li key={t} className="pl-tag">
              {TAG_LABELS[t]}
            </li>
          ))}
        </ul>
      )}

      {pose.directions.length > 0 && (
        <Section title="How to direct it">
          <ol className="pl-steps">
            {pose.directions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ol>
        </Section>
      )}
      {pose.tips.length > 0 && (
        <Section title="Tips">
          <ul className="pl-bullets">
            {pose.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      )}
      {pose.mistakes.length > 0 && (
        <Section title="Common mistakes">
          <ul className="pl-bullets">
            {pose.mistakes.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      )}
      {pose.imageCredit && (
        <p className="pl-credit">
          Image: {pose.imageCredit.source}
          {pose.imageCredit.credit ? `, ${pose.imageCredit.credit}` : ''} · {pose.imageCredit.license}
        </p>
      )}

      {!pose.builtIn && (
        <div className="action-row">
          <button type="button" className="btn secondary" onClick={() => setEditing(true)}>
            Edit pose
          </button>
          <button type="button" className="btn danger" onClick={() => void remove()}>
            Delete pose
          </button>
        </div>
      )}
      {editing && <PoseEditSheet pose={pose} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </main>
  );
}
