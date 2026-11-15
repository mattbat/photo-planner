import { renderToStaticMarkup } from 'react-dom/server';
import { layoutTree } from '../tree/layout';
import type { TreePerson } from '../tree/types';
import type { FamilyTreeProps } from './FamilyTree';
import { TreeContent } from './TreeContent';
import { treeCss } from './treeStyles';

/** Standalone light-theme SVG markup of the whole tree (V9). Caller rasterises. */
export function exportTreeSvg(
  people: TreePerson[],
  opts: Pick<FamilyTreeProps, 'highlightIds' | 'statusById'> = {},
): string {
  const layout = layoutTree(people);
  const byId = new Map(people.map((p) => [p.id, p]));
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" className="ft" width={layout.width} height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}>
      <style>{treeCss('light')}</style>
      <rect width={layout.width} height={layout.height} fill="var(--ft-bg)" />
      <TreeContent layout={layout} byId={byId} {...opts} />
    </svg>,
  );
}
