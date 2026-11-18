// Board names in what the editor says (maintenance round after milestone 72).
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addTray, autoConnect, createDesign, growPanel, setConnection, solve } from '../src/model/ops';
import { validate } from '../src/model/validate';
import { issueVars, panelLabel } from '../src/model/names';
import { translate } from '../src/i18n';
import { roundedTray } from './goldenDesigns';

const [CARD] = MATERIALS;
const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);

describe('board names', () => {
  it('a check message names boards as the editor does, not by a bare number', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 120, 80);
    addTray(d, base, 50);
    autoConnect(d);
    const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2')!.b.panelId;
    // card folded round a 2 mm radius: too tight, and the bend check names the lid and the back wall
    const g = growPanel(d, back, 'e2', { height: 70, angle: 90, dir: 'up', kind: 'fold' })!;
    setConnection(d, g.connectionId, { radius: 2 });
    solve(d);
    const i = validate(d).find((x) => x.key === 'val.bendTight')!;
    expect(i).toBeTruthy();
    // stored: the boards' own (automatic) names, numbers
    expect(String(i.vars.other)).toMatch(/^\d+$/);
    const text = t(i.key, issueVars(d, i, t));
    expect(text).toContain(panelLabel(d, back, t));
    expect(text).toContain(panelLabel(d, g.panelId, t));
    expect(text).not.toMatch(/\b\d+ and \d+\b/);
  });

  it('walls on a rounded tray are numbered among its straight edges (they were Wall 1, 24, 47, 70)', () => {
    const d = roundedTray(CARD, 15);
    const walls = d.order.filter((id) => /^Wall \d+$/.test(panelLabel(d, id, t))).map((id) => panelLabel(d, id, t)).sort();
    expect(walls).toEqual(['Wall 1', 'Wall 2', 'Wall 3', 'Wall 4']);
  });
});
