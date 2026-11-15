import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Empty, SettingsLink, TopBar } from '../components/ui';
import { db } from '../data/db';
import { seedStarterPoses } from '../data/repo';
import { POSE_CATEGORIES, POSE_TAGS, type Pose, type PoseCategory, type PoseTag } from '../data/types';
import { CATEGORY_LABELS, sizeLabel, TAG_LABELS } from '../poses/labels';
import { filterPoses } from '../poses/suggest';
import { paths } from '../router';
import { PoseEditSheet } from './PoseEditSheet';
import { poseImageSrc } from './posePhoto';

const SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15];

/** The pose library (PL1–PL6): category chips, search, size and tag filters, favourites. */
export function PosesScreen() {
  const poses = useLiveQuery(() => db.poses.toArray());
  const [category, setCategory] = useState<PoseCategory | null>(null);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState<number | undefined>();
  const [tags, setTags] = useState<PoseTag[]>([]);
  const [favOnly, setFavOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);

  // The starter library lives in the poses table; this adds any that are missing (a no-op after the first run).
  useEffect(() => {
    void seedStarterPoses();
  }, []);

  const shown = useMemo(() => {
    const list = filterPoses(poses ?? [], { ...(category ? { category } : {}), ...(size ? { size } : {}), tags, query });
    return (favOnly ? list.filter((p) => p.favorite) : list).sort(
      (a, b) => POSE_CATEGORIES.indexOf(a.category) - POSE_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name),
    );
  }, [poses, category, size, tags, query, favOnly]);

  const toggleTag = (t: PoseTag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const activeFilters = (size ? 1 : 0) + tags.length;

  return (
    <main className="screen">
      <TopBar
        title="Poses"
        action={<SettingsLink />}
      />
      <div className="pl-cats" role="group" aria-label="Category">
        <button type="button" className="pl-pill" aria-pressed={category === null} onClick={() => setCategory(null)}>
          All
        </button>
        {POSE_CATEGORIES.map((c) => (
          <button key={c} type="button" className="pl-pill" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <input
        className="search"
        type="search"
        aria-label="Search poses"
        placeholder="Search poses"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="pl-toolbar">
        <button type="button" className="pl-pill" aria-pressed={showFilters || activeFilters > 0} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
        </button>
        <button type="button" className="pl-pill" aria-pressed={favOnly} onClick={() => setFavOnly(!favOnly)}>
          ★ Favourites
        </button>
        <button type="button" className="btn small" onClick={() => setAdding(true)}>
          + Add pose
        </button>
      </div>
      {showFilters && (
        <div className="pl-filters">
          <label className="row stack">
            <span className="row-label">Group size</span>
            <select value={size ?? ''} onChange={(e) => setSize(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Any size</option>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'person' : 'people'}
                </option>
              ))}
            </select>
          </label>
          <div className="pl-tags" role="group" aria-label="Tags">
            {POSE_TAGS.map((t) => (
              <button key={t} type="button" className="pl-pill" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>
                {TAG_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {poses && shown.length === 0 && (
        <Empty>
          <b>No poses match</b>
          <br />
          Try a different category, or clear the search and filters.
        </Empty>
      )}
      <ul className="pl-grid" aria-label="Poses">
        {shown.map((p) => (
          <li key={p.id}>
            <PoseCard pose={p} />
          </li>
        ))}
      </ul>
      {adding && <PoseEditSheet onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />}
    </main>
  );
}

function PoseCard({ pose }: { pose: Pose }) {
  return (
    <a className="pl-card" href={paths.pose(pose.id)} aria-label={pose.name}>
      <span className="pl-thumb">
        {pose.image ? <img src={poseImageSrc(pose.image)} alt="" loading="lazy" /> : <span className="pl-noimg" aria-hidden>🧍</span>}
        {pose.favorite && (
          <span className="pl-star" aria-label="Favourite">
            ★
          </span>
        )}
      </span>
      <span className="pl-card-name">{pose.name}</span>
      <span className="pl-card-sub">{sizeLabel(pose.minSize, pose.maxSize)}</span>
    </a>
  );
}
