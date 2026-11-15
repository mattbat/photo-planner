import { Empty, TopBar } from '../components/ui';
import { paths } from '../router';

/** Pose library placeholder (PL1–PL7 arrive in M7). */
export function PosesScreen() {
  return (
    <main className="screen">
      <TopBar
        title="Poses"
        action={
          <a href={paths.settings()} aria-label="Settings">
            ⚙︎
          </a>
        }
      />
      <Empty>
        <b>The pose library is coming</b>
        <br />
        Example poses with directions you can say out loud, matched to each shot.
      </Empty>
    </main>
  );
}
