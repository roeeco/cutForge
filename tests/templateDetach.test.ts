// A template's settings until the design is changed by hand (src/templates/detach.ts): in Workshop the first hand edit
// ends the template, and undoing it brings the template back; settings, the name, the sheets, moving the box and
// moving a divider keep it.
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/store';
import { defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { addDetail, movePanel, setAllJoints, setDividerOffset, setPanelSize } from '../src/model/ops';
import { groupKinds, groupShown } from '../src/model/jointDefaults';
import { dividerRow } from '../src/model/dividers';
import { MATERIALS } from '../src/model/materials';
import type { Design } from '../src/model/types';

const s = () => useStore.getState();
const box = templateById('box')!;
const PLY = MATERIALS[3];

beforeEach(() => {
  s().setPrefs({ mode: 'workshop', modeLocked: false });
  s().replaceDesign(generate(box, PLY, { ...defaults(box), spacesBy: 'count' }));
});

const wall = () => s().design.order.find((id) => id !== 't:base' && !s().design.panels[id].divider)!;
const divider = () => s().design.order.find((id) => s().design.panels[id].divider)!;

describe('a template design changed by hand', () => {
  it('keeps its template for its own settings, its name, the box moved, a divider moved, and the joints for every corner', () => {
    s().apply((d) => void Object.assign(d, JSON.parse(JSON.stringify(regenerate(d as Design, { ...d.template!.params, width: 180 }).design))));
    expect(s().design.template?.params.width).toBe(180);
    s().apply((d) => void (d.name = 'Pencils'));
    const o0 = s().design.panels['t:base'].frame.o;
    s().apply((d) => void movePanel(d as Design, 't:base', 30, -20));
    expect(s().design.panels['t:base'].frame.o).not.toEqual(o0);
    const id = divider();
    const row = dividerRow(s().design, id)!;
    s().apply((d) => void setDividerOffset(d as Design, id, row.pos + 6));
    expect(dividerRow(s().design, id)!.pos).toBeCloseTo(row.pos + 6, 6);
    const kinds = groupKinds(s().design, 'corner');
    const other = kinds.find((k) => k !== groupShown(s().design, 'corner')) ?? kinds[0];
    const j0 = s().design.joints;
    if (other) s().apply((d) => void setAllJoints(d as Design, 'corner', other));
    if (other) expect(s().design.joints).not.toBe(j0);
    expect(s().design.template).toBeTruthy();
  });

  it('a board resized ends the template; undo brings it back', () => {
    const w = wall();
    s().apply((d) => void setPanelSize(d as Design, w, undefined, d.panels[w].h + 10));
    expect(s().design.template).toBeUndefined();
    s().undo();
    expect(s().design.template).toBeTruthy();
  });

  it('a shape cut in a wall ends it, and so does a change made by dragging', () => {
    s().apply((d) => void addDetail(d as Design, wall(), 'circle', 'cut', 20, 20, 10, 10));
    expect(s().design.template).toBeUndefined();
    s().undo();
    const w = wall();
    s().preview((d) => void setPanelSize(d as Design, w, undefined, d.panels[w].h + 8));
    expect(s().design.template).toBeTruthy();
    s().commit();
    expect(s().design.template).toBeUndefined();
    s().undo();
    expect(s().design.template).toBeTruthy();
  });

  it('Quick build keeps the template as before', () => {
    s().setPrefs({ mode: 'quick' });
    const w = wall();
    s().apply((d) => void setPanelSize(d as Design, w, undefined, d.panels[w].h + 10));
    expect(s().design.template).toBeTruthy();
  });
});
