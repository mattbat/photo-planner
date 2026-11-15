import { CARD_W, CARD_H, type TreeLayout, type LayoutNode } from '../tree/layout';
import type { AttendanceStatus, TreePerson } from '../tree/types';
import type { FamilyTreeProps } from './FamilyTree';

const BADGE: Record<AttendanceStatus, { ch: string; fill: string }> = {
  absent: { ch: '–', fill: '#8e8e93' },
  arrived: { ch: '✓', fill: '#2a9d6f' },
  waiting: { ch: '!', fill: '#d99a00' },
  left: { ch: '→', fill: '#6b6b70' },
};
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  absent: 'not attending', arrived: 'arrived', waiting: 'waiting', left: 'left',
};

const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1]![0] : '')).toUpperCase();
};
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export interface ContentProps extends Omit<FamilyTreeProps, 'people' | 'className'> {
  layout: TreeLayout;
  byId: Map<string, TreePerson>;
}

export function TreeContent({ layout, byId, highlightIds, statusById, selectedIds, onPersonTap, onCoupleAddChild }: ContentProps) {
  const dimming = !!highlightIds && highlightIds.size > 0;
  const color = (n: LayoutNode) => (n.branchId ? `var(--branch-${n.colorIndex})` : 'var(--ft-line)');
  return (
    <g>
      {layout.households.map((h, i) => (
        <rect key={`h${i}`} data-testid="household" x={h.rect.x} y={h.rect.y} width={h.rect.w} height={h.rect.h} rx={14}
          fill="none" stroke="var(--ft-hh)" strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" />
      ))}
      {layout.childLinks.map((l, i) => {
        const dim = dimming && !(highlightIds!.has(l.childId));
        return (
          <polyline key={`l${i}`} points={l.path.map((p) => `${p.x},${p.y}`).join(' ')} fill="none"
            stroke="var(--ft-line)" strokeWidth={1.6} strokeLinejoin="round" opacity={dim ? 0.25 : 0.9} />
        );
      })}
      {layout.couples.map((c, i) => (
        <line key={`c${i}`} x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} stroke="var(--ft-line)" strokeWidth={2.4}
          strokeDasharray={c.separated ? '5 4' : undefined} data-separated={c.separated ? 'true' : 'false'} />
      ))}
      {onCoupleAddChild && layout.couples.filter((c) => !c.separated).map((c, i) => {
        const mx = (c.x1 + c.x2) / 2;
        return (
          <g key={`a${i}`} role="button" tabIndex={0} className="card" transform={`translate(${mx},${c.y})`}
            aria-label={`Add child to ${byId.get(c.aId)?.name} and ${byId.get(c.bId)?.name}`}
            onClick={() => onCoupleAddChild(c.aId, c.bId)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCoupleAddChild(c.aId, c.bId); } }}>
            <circle r={9} fill="var(--ft-card)" stroke="var(--ft-line)" strokeWidth={1.5} />
            <path d="M-4 0H4M0 -4V4" stroke="var(--ft-text)" strokeWidth={1.8} strokeLinecap="round" />
          </g>
        );
      })}
      {layout.nodes.map((n) => {
        const p = byId.get(n.id)!;
        const st = statusById?.[n.id];
        const hl = !dimming || highlightIds!.has(n.id);
        const sel = selectedIds?.has(n.id);
        const gray = st === 'absent' || st === 'left';
        const opacity = (hl ? 1 : 0.28) * (gray ? 0.5 : 1);
        const label = `${p.name}, generation ${n.generation}${p.grown ? '' : ', child'}${st ? `, ${STATUS_LABEL[st]}` : ''}${dimming && hl ? ', highlighted' : ''}`;
        const col = color(n);
        return (
          <g key={n.id} className="card" role="button" tabIndex={0} aria-label={label} data-person-id={n.id}
            data-dimmed={hl ? 'false' : 'true'} transform={`translate(${n.x},${n.y})`} opacity={opacity}
            onClick={() => onPersonTap?.(n.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPersonTap?.(n.id); } }}>
            <rect className="box" width={CARD_W} height={CARD_H} rx={10} fill="var(--ft-card)" stroke={sel ? 'var(--ft-text)' : col}
              strokeWidth={sel ? 3.5 : 2} />
            <circle cx={20} cy={CARD_H / 2} r={13} fill={col} />
            <text x={20} y={CARD_H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{initials(p.name)}</text>
            <text x={38} y={26} fontSize={11.5} fontWeight={600} fill="var(--ft-text)">{clip(p.name, 13)}</text>
            <text x={38} y={42} fontSize={10} fill="var(--ft-sub)">G{n.generation}</text>
            {!p.grown && (
              <g aria-hidden="true" transform={`translate(${CARD_W - 18},${CARD_H - 16})`}>
                <circle cx={5} cy={3} r={3} fill="var(--ft-sub)" />
                <path d="M0 12 C0 7 10 7 10 12 Z" fill="var(--ft-sub)" />
              </g>
            )}
            {st && (
              <g aria-hidden="true" transform={`translate(${CARD_W - 6},6)`}>
                <circle r={9} fill={BADGE[st].fill} />
                <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{BADGE[st].ch}</text>
              </g>
            )}
            <title>{p.name}</title>
          </g>
        );
      })}
    </g>
  );
}

