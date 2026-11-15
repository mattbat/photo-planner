import { useRef, useState, type ReactNode } from 'react';
import { createDemoFamily } from '../data/repo';
import { markIntroSeen } from '../help/intro';
import { SHOT_SIZE, SHOTS, shotUrl, type ShotName } from '../help/shots';
import { navigate, paths } from '../router';

interface Card {
  title: string;
  text: ReactNode;
  shot?: ShotName;
  emoji?: string;
}

const CARDS: Card[] = [
  {
    title: 'Every family photo, planned',
    text: <>Photo Planner turns a family tree into a shot list, then lets an assistant tick the shots off on the day, so nobody gets forgotten.</>,
  },
  {
    title: 'Describe the family once',
    text: (
      <>
        Add people, who is married to whom and whose child they are. The tree draws itself, and you can reuse it for
        every shoot.
      </>
    ),
    shot: 'tree',
  },
  {
    title: 'The shot list builds itself',
    text: (
      <>
        Switch on the kinds of photo you want: everyone, each generation, each household, cousins, solo portraits. Each
        shows how many shots it makes.
      </>
    ),
    shot: 'templates',
  },
  {
    title: 'Plan the light',
    text: <>Pick the place and the date. Photo Planner finds golden hour, suggests when to start and which way the sun will be.</>,
    shot: 'light',
  },
  {
    title: 'On the day: tap Done',
    text: (
      <>
        The checklist shows who to call in for each shot, and who can leave. One big <b>Done</b> button, and <b>Undo</b>{' '}
        if you tap too soon.
      </>
    ),
    shot: 'live',
  },
  {
    title: 'It all stays on your phone',
    text: (
      <>
        No account, and it works without internet. Back up now and then from <b>Settings</b>, and hand a shoot to an
        assistant’s phone whenever you like.
      </>
    ),
    emoji: '🔒',
  },
];

function theme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * The first-run walkthrough (H-3): a few skippable cards on what Photo Planner
 * does, ending with the demo family or the photographer's own. Also
 * replayable from Help.
 */
export function Intro({ onClose, offerDemo }: { onClose: () => void; offerDemo: boolean }) {
  const [at, setAt] = useState(0);
  const touchX = useRef<number | null>(null);
  const card = CARDS[at]!;
  const last = at === CARDS.length - 1;

  const finish = () => {
    markIntroSeen();
    onClose();
  };
  const go = (index: number) => setAt(Math.max(0, Math.min(CARDS.length - 1, index)));

  return (
    <main
      className="screen intro"
      aria-label="Welcome to Photo Planner"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50) return;
        go(end < start ? at + 1 : at - 1);
      }}
    >
      <div className="intro-top">
        <span className="brand">Photo Planner</span>
        {!last && (
          <button type="button" className="link" onClick={finish}>
            Skip
          </button>
        )}
      </div>

      <section className="intro-card" aria-live="polite" aria-label={`${at + 1} of ${CARDS.length}`}>
        {card.shot ? (
          <img className="intro-shot" src={shotUrl(card.shot, theme())} alt={SHOTS[card.shot]} width={SHOT_SIZE.width} height={SHOT_SIZE.height} />
        ) : (
          <div className="intro-hero" aria-hidden>
            {at === 0 ? <img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="" width={96} height={96} /> : <span>{card.emoji}</span>}
          </div>
        )}
        <h1 className="intro-title">{card.title}</h1>
        <p className="intro-text">{card.text}</p>
      </section>

      <div className="intro-dots" aria-hidden>
        {CARDS.map((_, i) => (
          <span key={i} className={i === at ? 'on' : ''} />
        ))}
      </div>

      <footer className="intro-footer">
        {last ? (
          <div className="actions">
            {offerDemo && (
              <button
                type="button"
                className="btn wide big"
                onClick={() => {
                  markIntroSeen();
                  void createDemoFamily().then((f) => navigate(paths.family(f.id)));
                }}
              >
                Try the demo family
              </button>
            )}
            <button
              type="button"
              className={`btn wide ${offerDemo ? 'secondary' : 'big'}`}
              onClick={() => {
                finish();
                if (offerDemo) navigate(paths.families());
              }}
            >
              {offerDemo ? 'Add my own family' : 'Done'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                markIntroSeen();
                navigate(paths.help('start'));
              }}
            >
              Read the full guide
            </button>
          </div>
        ) : (
          <div className="footer-row">
            <button type="button" className="btn secondary" disabled={at === 0} onClick={() => go(at - 1)}>
              Back
            </button>
            <button type="button" className="btn big grow" onClick={() => go(at + 1)}>
              Next
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}
