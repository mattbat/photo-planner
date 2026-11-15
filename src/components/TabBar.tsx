import type { ReactNode } from 'react';
import { CameraIcon, FigureIcon, PeopleIcon } from './icons';
import { paths, TABS, type TabName } from '../router';

const TAB_INFO: Record<TabName, { label: string; icon: ReactNode; href: string }> = {
  shoots: { label: 'Shoots', icon: <CameraIcon />, href: paths.shoots() },
  families: { label: 'Families', icon: <PeopleIcon />, href: paths.families() },
  poses: { label: 'Poses', icon: <FigureIcon />, href: paths.poses() },
};

/** The bottom navigation between Shoots, Families and Poses. */
export function TabBar({ current }: { current: TabName }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((tab) => (
          <a key={tab} className="tab" href={TAB_INFO[tab].href} aria-current={tab === current ? 'page' : undefined}>
            <span className="tab-icon" aria-hidden>
              {TAB_INFO[tab].icon}
            </span>
            <span>{TAB_INFO[tab].label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
