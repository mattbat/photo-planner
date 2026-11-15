import { useState } from 'react';
import { Sheet } from '../components/ui';
import { addPose, updatePose } from '../data/repo';
import { POSE_CATEGORIES, POSE_TAGS, type Pose, type PoseCategory, type PoseDifficulty, type PoseTag } from '../data/types';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, TAG_LABELS } from '../poses/labels';

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Adds your own pose, or edits one of them (PL4). Built-in poses are not edited. */
export function PoseEditSheet({ pose, onClose, onSaved }: { pose?: Pose; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(pose?.name ?? '');
  const [category, setCategory] = useState<PoseCategory>(pose?.category ?? 'couples');
  const [minSize, setMinSize] = useState(pose?.minSize ?? 2);
  const [maxSize, setMaxSize] = useState(pose?.maxSize ?? 2);
  const [description, setDescription] = useState(pose?.description ?? '');
  const [directions, setDirections] = useState((pose?.directions ?? []).join('\n'));
  const [tips, setTips] = useState((pose?.tips ?? []).join('\n'));
  const [mistakes, setMistakes] = useState((pose?.mistakes ?? []).join('\n'));
  const [tags, setTags] = useState<PoseTag[]>(pose?.tags ?? []);
  const [difficulty, setDifficulty] = useState<PoseDifficulty>(pose?.difficulty ?? 'easy');

  const ok = name.trim().length > 0;
  const toggle = (t: PoseTag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const num = (v: string, fallback: number) => Math.min(99, Math.max(1, Math.round(Number(v)) || fallback));

  const save = async () => {
    if (!ok) return;
    const lo = Math.min(minSize, maxSize);
    const hi = Math.max(minSize, maxSize);
    const fields = {
      name: name.trim(),
      category,
      minSize: lo,
      maxSize: hi,
      description: description.trim(),
      directions: lines(directions),
      tips: lines(tips),
      mistakes: lines(mistakes),
      tags,
      difficulty,
    };
    if (pose) {
      await updatePose(pose.id, { ...fields, name: fields.name });
      onSaved(pose.id);
    } else {
      const created = await addPose({ ...fields, favorite: false, builtIn: false });
      onSaved(created.id);
    }
  };

  return (
    <Sheet title={pose ? 'Edit pose' : 'New pose'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="row stack">
          <span className="row-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label className="row stack">
          <span className="row-label">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as PoseCategory)}>
            {POSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="pl-two">
          <label className="row stack">
            <span className="row-label">Fewest people</span>
            <input type="number" inputMode="numeric" min={1} max={99} value={minSize} onChange={(e) => setMinSize(num(e.target.value, 1))} />
          </label>
          <label className="row stack">
            <span className="row-label">Most people</span>
            <input type="number" inputMode="numeric" min={1} max={99} value={maxSize} onChange={(e) => setMaxSize(num(e.target.value, 1))} />
          </label>
        </div>
        <label className="row stack">
          <span className="row-label">Description</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="row stack">
          <span className="row-label">How to direct it (one step per line)</span>
          <textarea rows={4} value={directions} onChange={(e) => setDirections(e.target.value)} />
        </label>
        <label className="row stack">
          <span className="row-label">Tips (one per line)</span>
          <textarea rows={2} value={tips} onChange={(e) => setTips(e.target.value)} />
        </label>
        <label className="row stack">
          <span className="row-label">Common mistakes (one per line)</span>
          <textarea rows={2} value={mistakes} onChange={(e) => setMistakes(e.target.value)} />
        </label>
        <div className="row stack">
          <span className="row-label">Tags</span>
          <div className="pl-tags" role="group" aria-label="Pose tags">
            {POSE_TAGS.map((t) => (
              <button key={t} type="button" className="pl-pill" aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>
                {TAG_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <label className="row stack">
          <span className="row-label">Difficulty</span>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as PoseDifficulty)}>
            {(Object.keys(DIFFICULTY_LABELS) as PoseDifficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn wide" disabled={!ok}>
          {pose ? 'Save' : 'Add pose'}
        </button>
      </form>
    </Sheet>
  );
}
