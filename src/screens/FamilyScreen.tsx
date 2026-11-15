import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ExtraSheet } from '../components/ExtraSheet';
import { FamilyTree } from '../components/FamilyTree';
import { NameSheet } from '../components/NameSheet';
import { QuickAddFamilySheet } from '../components/QuickAddFamilySheet';
import { PersonSheet } from '../components/PersonSheet';
import { shareTreeImage } from '../components/treeImage';
import { Empty, Section, Segmented, TopBar } from '../components/ui';
import { HelpLink } from '../help/parts';
import { db } from '../data/db';
import { addChild, addPerson, linkChild } from '../data/repo';
import { linkCandidates } from '../domain/links';
import type { Extra } from '../data/types';
import { checkFamily, describePair } from '../domain/shotView';
import { displayName, groupByGeneration, indexFamily, toTreePeople } from '../domain/familyView';
import { paths } from '../router';

type View = 'tree' | 'list';
type Dialog =
  | { kind: 'addPerson' }
  | { kind: 'quickAdd' }
  | { kind: 'addChild'; parentIds: [string, string] }
  | { kind: 'extra'; extra?: Extra }
  | null;

/** One family: Tree and List views, problems, extras (F3, F6–F8, V1–V5, V9). */
export function FamilyScreen({ familyId }: { familyId: string }) {
  const data = useLiveQuery(async () => ({
    family: (await db.families.get(familyId)) ?? null,
    people: await db.people.where('familyId').equals(familyId).toArray(),
    partnerships: await db.partnerships.where('familyId').equals(familyId).toArray(),
    extras: await db.extras.where('familyId').equals(familyId).filter((e) => e.shootId === undefined).toArray(),
  }), [familyId]);
  const [view, setView] = useState<View>('tree');
  const [personId, setPersonId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState('');
  /** V6: "How are they related?" mode, with the people tapped so far (at most two). */
  const [relating, setRelating] = useState<string[] | null>(null);

  const people = data?.people;
  const partnerships = data?.partnerships;
  const treePeople = useMemo(() => (people && partnerships ? toTreePeople(people, partnerships) : []), [people, partnerships]);
  const problems = useMemo(() => (people && partnerships ? checkFamily(people, partnerships) : []), [people, partnerships]);
  const groups = useMemo(() => (people && partnerships ? groupByGeneration(people, partnerships) : []), [people, partnerships]);

  if (!data) return <main className="screen" />;
  if (!data.family) {
    return (
      <main className="screen">
        <TopBar title="Family" back={paths.families()} historyBack />
        <Empty>This family isn’t on this phone any more.</Empty>
      </main>
    );
  }
  const { family, extras } = data;
  const index = indexFamily(data.people, data.partnerships);

  const share = async () => {
    setStatus('Making the picture…');
    try {
      const outcome = await shareTreeImage(treePeople, `${family.name} tree.png`);
      setStatus(outcome === 'downloaded' ? 'Picture saved to your downloads.' : outcome === 'shared' ? 'Picture shared.' : '');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Couldn’t make the picture.');
    }
  };

  return (
    <main className="screen">
      <TopBar
        title={family.name}
        back={paths.families()}
        historyBack
        action={
          data.people.length > 0 ? (
            <button type="button" className="link" onClick={() => void share()}>
              Share
            </button>
          ) : undefined
        }
      />
      {problems.length > 0 && (
        <section className="problems" aria-label="Problems">
          <h2>Something looks off</h2>
          {problems.map((p, i) => (
            <button key={i} type="button" onClick={() => setPersonId(p.personIds[0] ?? null)}>
              {p.message}
            </button>
          ))}
        </section>
      )}
      <div className="view-switch">
        <p className="help-link-row">
          <HelpLink topic="families">Help</HelpLink>
        </p>
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'tree', label: 'Tree' },
            { value: 'list', label: 'List' },
          ]}
        />
      </div>
      {status && (
        <p className="status-msg" role="status">
          {status}
        </p>
      )}

      {data.people.length === 0 ? (
        <Empty>
          <b>No one here yet</b>
          <br />
          Add the first person, then build the family from them.
        </Empty>
      ) : view === 'tree' ? (
        <>
        <div className="action-row">
          <button
            type="button"
            className={`btn small ${relating ? '' : 'secondary'}`}
            aria-pressed={relating !== null}
            onClick={() => setRelating(relating ? null : [])}
          >
            How are they related?
          </button>
        </div>
        {relating && (
          <p className="relate-banner" role="status">
            {relating.length < 2
              ? relating.length === 0
                ? 'Tap two people to see how they are related.'
                : `Now tap someone else to compare with ${nameOf(index.byId.get(relating[0]!)?.name)}.`
              : describePair(data.people, data.partnerships, relating[0]!, relating[1]!)}
            {relating.length > 0 && (
              <>
                {' '}
                <button type="button" className="link" onClick={() => setRelating([])}>
                  Clear
                </button>
              </>
            )}
          </p>
        )}
        <div className="tree-box">
          <FamilyTree
            people={treePeople}
            {...(relating ? { selectedIds: new Set(relating) } : {})}
            onPersonTap={(id) => {
              if (!relating) return setPersonId(id);
              setRelating(relating.length >= 2 || relating.includes(id) ? [id] : [...relating, id]);
            }}
            onCoupleAddChild={(a, b) => setDialog({ kind: 'addChild', parentIds: [a, b] })}
          />
        </div>
        <p className="status-msg">Pinch to zoom, drag to move around, tap Fit to see everyone. Tap a person to edit them{relating ? '' : ', or use “How are they related?”'}.</p>
        </>
      ) : (
        groups.map((g) => (
          <section key={g.generation}>
            <h2 className="gen-head">Generation {g.generation}</h2>
            <ul className="list">
              {g.people.map((p) => {
                const partners = (index.partnersOf.get(p.id) ?? []).map((id) => index.byId.get(id)?.name).filter(Boolean);
                const notes = [
                  treePeople.find((t) => t.id === p.id)?.grown ? '' : 'Kid',
                  partners.length ? `with ${partners.join(', ')}` : '',
                  p.usuallyAbsent ? 'not usually at shoots' : '',
                ].filter(Boolean);
                return (
                  <li key={p.id}>
                    <button type="button" className="list-item" onClick={() => setPersonId(p.id)}>
                      <span className="list-title">
                        {displayName(p)}
                        {notes.length > 0 && <span className="list-sub">{notes.join(' · ')}</span>}
                      </span>
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <button type="button" className="btn secondary wide" onClick={() => setDialog({ kind: 'addPerson' })}>
        + Person
      </button>
      {data.people.length > 0 && (
        <button type="button" className="btn secondary wide" onClick={() => setDialog({ kind: 'quickAdd' })}>
          Quick add people
        </button>
      )}

      <Section title="Extras (guests and pets)">
        {extras.length === 0 && <p className="status-msg">Pets and guests aren’t part of the tree. Add them here to put them in shots.</p>}
        <ul className="list">
          {extras.map((e) => (
            <li key={e.id}>
              <button type="button" className="list-item" onClick={() => setDialog({ kind: 'extra', extra: e })}>
                <span aria-hidden>{e.emoji ?? (e.kind === 'pet' ? '🐾' : '🙂')}</span>
                <span className="list-title">
                  {e.name}
                  <span className="list-sub">{e.kind === 'pet' ? 'Pet' : 'Guest'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn secondary wide" onClick={() => setDialog({ kind: 'extra' })}>
          + Guest or pet
        </button>
      </Section>

      {personId && (
        <PersonSheet
          personId={personId}
          people={data.people}
          partnerships={data.partnerships}
          onClose={() => setPersonId(null)}
          onOpen={setPersonId}
        />
      )}
      {dialog?.kind === 'quickAdd' && (
        <QuickAddFamilySheet into={{ familyId, people: data.people }} onClose={() => setDialog(null)} onCreated={() => setDialog(null)} />
      )}
      {dialog?.kind === 'addPerson' && (
        <NameSheet
          title="Add a person"
          label="Name"
          submitLabel="Add"
          onClose={() => setDialog(null)}
          existing={{
            people: data.people,
            action: 'Open',
            onPick: (p) => {
              setDialog(null);
              setPersonId(p.id);
              return { ok: true };
            },
          }}
          onSubmit={async (name) => {
            const p = await addPerson(familyId, { name, grown: true });
            setDialog(null);
            setPersonId(p.id);
          }}
        />
      )}
      {dialog?.kind === 'addChild' && (
        <NameSheet
          title={`New child of ${nameOf(index.byId.get(dialog.parentIds[0])?.name)} and ${nameOf(index.byId.get(dialog.parentIds[1])?.name)}`}
          label="Child’s name"
          submitLabel="Add child"
          onClose={() => setDialog(null)}
          existing={{
            people: linkCandidates(data.people, data.partnerships, dialog.parentIds[0], 'child', dialog.parentIds[1]),
            onPick: async (p) => {
              const result = await linkChild(dialog.parentIds[0], p.id, dialog.parentIds[1]);
              if (result.ok) setDialog(null);
              return result;
            },
          }}
          onSubmit={async (name) => {
            await addChild(familyId, name, dialog.parentIds);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'extra' && <ExtraSheet familyId={familyId} extra={dialog.extra} onClose={() => setDialog(null)} />}
    </main>
  );
}

const nameOf = (n: string | undefined) => n ?? 'someone';
