import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layoutTree } from '../tree/layout';
import type { AttendanceStatus, TreePerson } from '../tree/types';
import { TreeContent } from './TreeContent';
import { treeCss } from './treeStyles';

export interface FamilyTreeProps {
  people: TreePerson[];
  highlightIds?: Set<string>;
  statusById?: Record<string, AttendanceStatus>;
  selectedIds?: Set<string>;
  onPersonTap?: (id: string) => void;
  onCoupleAddChild?: (aId: string, bId: string) => void;
  className?: string;
}

interface Pt { x: number; y: number }

interface View { k: number; tx: number; ty: number }

export function FamilyTree(props: FamilyTreeProps) {
  const { people, className, ...rest } = props;
  const layout = useMemo(() => layoutTree(people), [people]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  /** Fits the tree in the box, but not smaller than `minK`, so a big family starts readable (pinch out or tap Fit to see everyone). */
  const place = useCallback((minK: number) => {
    const el = boxRef.current;
    const w = el?.clientWidth || layout.width, h = el?.clientHeight || layout.height;
    const k = Math.max(minK, Math.min(w / layout.width, h / layout.height, 1.5));
    setView({ k, tx: (w - layout.width * k) / 2, ty: Math.max(0, (h - layout.height * k) / 2) });
  }, [layout]);
  const fit = useCallback(() => place(0), [place]);
  useEffect(() => { place(0.6); }, [place]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const moved = useRef(false);

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const v = viewRef.current;
    const k = Math.min(4, Math.max(0.15, v.k * factor));
    const f = k / v.k;
    setView({ k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f });
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (!moved.current && Math.hypot(dx, dy) < 4) return;
      if (!moved.current) { moved.current = true; try { boxRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    } else if (pointers.current.size === 2 && gesture.current) {
      moved.current = true;
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const g = gesture.current;
      zoomAt(mx, my, dist / (g.dist || dist));
      setView((v) => ({ ...v, tx: v.tx + mx - g.mx, ty: v.ty + my - g.my }));
      gesture.current = { dist, mx, my };
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  };
  // swallow the click that ends a drag so it doesn't count as a tap
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; }
  };

  const btn: React.CSSProperties = {
    position: 'absolute', right: 8, top: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--ft-line)',
    background: 'var(--ft-card)', color: 'var(--ft-text)', font: '600 13px system-ui', cursor: 'pointer',
  };
  return (
    <div ref={boxRef} className={`ft ${className ?? ''}`} data-testid="family-tree"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 240, overflow: 'hidden', touchAction: 'none', background: 'var(--ft-bg)' }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      onClickCapture={onClickCapture}>
      <style>{treeCss('auto')}</style>
      <svg width="100%" height="100%" role="group" aria-label="Family tree" style={{ display: 'block' }}>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          <TreeContent layout={layout} byId={byId} {...rest} />
        </g>
      </svg>
      <button type="button" style={btn} onClick={fit} aria-label="Fit whole family on screen">Fit</button>
    </div>
  );
}

