// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FamilyTree } from './FamilyTree';
import { exportTreeSvg } from './exportTreeSvg';
import { demoFamily } from '../tree/fixtures';

afterEach(cleanup);

describe('FamilyTree', () => {
  it('renders every name', () => {
    render(<FamilyTree people={demoFamily} />);
    for (const p of demoFamily) expect(screen.getByRole('button', { name: new RegExp(`^${p.name}, generation`) })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fit/ })).toBeTruthy();
  });
  it('tap calls onPersonTap', () => {
    const fn = vi.fn();
    render(<FamilyTree people={demoFamily} onPersonTap={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ruth Pike/ }));
    expect(fn).toHaveBeenCalledWith('ruth');
  });
  it('highlight dims others; statuses show', () => {
    const { container } = render(<FamilyTree people={demoFamily} highlightIds={new Set(['ruth', 'tom'])} statusById={{ ben: 'absent', mia: 'arrived' }} />);
    const dimmed = container.querySelectorAll('[data-dimmed="true"]').length;
    expect(dimmed).toBe(demoFamily.length - 2);
    expect(container.querySelector('[data-person-id="ruth"]')!.getAttribute('data-dimmed')).toBe('false');
    expect(screen.getByRole('button', { name: /^Ben Pike.*not attending/ })).toBeTruthy();
  });
  it('couple add-child button and pan/zoom/fit', () => {
    const add = vi.fn();
    const { container } = render(<FamilyTree people={demoFamily} onCoupleAddChild={add} selectedIds={new Set(['ruth'])} />);
    fireEvent.click(screen.getByRole('button', { name: /Add child to Ruth Pike and Tom Vega|Add child to Tom Vega and Ruth Pike/ }));
    expect(add).toHaveBeenCalled();
    const box = screen.getByTestId('family-tree');
    const g = container.querySelector('svg > g')!;
    const before = g.getAttribute('transform');
    fireEvent.wheel(box, { deltaY: -200, clientX: 50, clientY: 50 });
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(g.getAttribute('transform')).not.toBe(before);
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(box, { pointerId: 2, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(box, { pointerId: 2, clientX: 90, clientY: 10 });
    fireEvent.pointerUp(box, { pointerId: 2 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Fit/ }));
  });
  it('exportTreeSvg is standalone', () => {
    const s = exportTreeSvg(demoFamily);
    expect(s.startsWith('<svg')).toBe(true);
    expect(s).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(s).toContain('Harold Pike');
  });
});
