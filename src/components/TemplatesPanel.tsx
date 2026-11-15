import { soloScopeOf, type SoloScope } from '../domain/shotView';
import type { PreviewCount } from '../engine';
import { TEMPLATES } from '../engine/templates';
import type { TemplateGroup } from '../engine/types';
import type { TemplateId, TemplateSetting } from '../data/types';
import { Segmented } from './ui';

const GROUPS: TemplateGroup[] = ['Everyone', 'Generations', 'Siblings', 'Branches', 'Households', 'Pairs', 'Solo', 'Grown children'];

const shotsWord = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;

/** Templates, grouped (§6.1). Each shows how many shots it makes, before you switch it on (E5). */
export function TemplatesPanel({
  templates,
  previews,
  onToggle,
  onSolo,
}: {
  templates: TemplateSetting[];
  previews: Record<TemplateId, PreviewCount>;
  onToggle: (id: TemplateId, enabled: boolean) => void;
  onSolo: (scope: SoloScope) => void;
}) {
  const enabled = new Set(templates.filter((t) => t.enabled).map((t) => t.id));
  const count = (id: TemplateId) => {
    const p = previews[id];
    if (enabled.has(id)) return shotsWord(p.standalone);
    return p.added > 0 ? `+${shotsWord(p.added)}` : 'no new shots';
  };
  const solo = soloScopeOf(templates);
  const soloId: TemplateId | undefined = solo === 'off' ? undefined : (`solo${solo[0]!.toUpperCase()}${solo.slice(1)}` as TemplateId);
  return (
    <div className="templates">
      {GROUPS.map((group) => (
        <div key={group} className="template-group">
          <h3 className="sheet-sub">{group}</h3>
          {group === 'Solo' ? (
            <div className="row stack">
              <span className="row-label">
                Solo portraits <span className="list-sub inline">{soloId ? count(soloId) : 'off'}</span>
              </span>
              <Segmented<SoloScope>
                label="Solo portraits for"
                value={solo}
                onChange={onSolo}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'everyone', label: 'Everyone' },
                  { value: 'kids', label: 'Kids' },
                  { value: 'adults', label: 'Adults' },
                ]}
              />
            </div>
          ) : (
            TEMPLATES.filter((t) => t.group === group).map((t) => (
              <div className="row toggle-row" key={t.id}>
                <label className="toggle-label">
                  <span>
                    {t.label}
                    <span className="list-sub">{t.description}</span>
                  </span>
                  <span className="template-count">{count(t.id)}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={t.label}
                    checked={enabled.has(t.id)}
                    onChange={(e) => onToggle(t.id, e.target.checked)}
                  />
                  <span className="switch" aria-hidden />
                </label>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
