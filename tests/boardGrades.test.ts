// Milestone 116 (D5b): board grades beside the four classroom materials.
import { describe, expect, it } from 'vitest';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { BOARD_GRADES, profileById } from '../src/model/boards';
import { defaults, generate, STRUCTURES, templateById } from '../src/templates/registry';
import { makes } from '../src/templates/types';
import { chooseStructure, listOf } from '../src/sentence/resolve';
import { createDesign, setMaterial } from '../src/model/ops';
import { boxRecipe } from '../src/easy/recipes';
import { boxSize, setBoxSize } from '../src/model/boxSize';
import { mainTray } from '../src/templates/structures/box';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import { prepareExport } from '../src/export/prepare';
import { parseProject, serializeProject } from '../src/model/serialize';
import { materialName } from '../src/ui/materialName';
import { en } from '../src/i18n/en';
import type { Design } from '../src/model/types';

const blocking = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map((i) => i.key);
const t = (k: string) => (en as Record<string, string>)[k] ?? k;

describe('board grades', () => {
  it('ten grades, ids not clashing with the built-ins, each found by id and named', () => {
    expect(BOARD_GRADES).toHaveLength(10);
    for (const g of BOARD_GRADES) {
      expect(MATERIALS.some((m) => m.id === g.id)).toBe(false);
      expect(profileById(g.id)).toBe(g);
      expect(g.foldAllowance).toBe(0);
      expect(materialName(t as never, g)).toBe(t(g.nameKey));
    }
  });

  it('every grade survives a save and load, cuts a tray and (where it is offered) the organiser clean, and exports', () => {
    for (const g of BOARD_GRADES) {
      const d = createDesign(g);
      boxRecipe(d, { kind: 'rect', x0: -60, z0: -40, x1: 60, z1: 40 }, 40);
      const back = parseProject(serializeProject(d));
      expect(back.material).toEqual(g);
      expect(blocking(d), g.id).toEqual([]);
      expect(prepareExport(d).errors, g.id).toEqual([]);
      const org = templateById('organiser')!;
      if (org.materials.includes(g.kind)) expect(blocking(generate(org, g, defaults(org))), `organiser ${g.id}`).toEqual([]);
    }
  });

  it('greyboard over 1 mm folds into nothing (1 mm is the ceiling, so it does); double wall makes no carton or sleeve; B flute a carton with shipping or full-overlap flaps only', () => {
    const offered = (id: string) => STRUCTURES().filter((s) => makes(s, profileById(id)!)).map((s) => s.id);
    expect(offered('grey-1')).toContain('carton');
    for (const id of ['grey-1.5', 'grey-2']) for (const s of ['carton', 'sleeve', 'drawer', 'envelope', 'folder', 'cardHolder']) expect(offered(id), id).not.toContain(s);
    for (const s of ['carton', 'sleeve', 'drawer']) expect(offered('corr-7')).not.toContain(s);
    const carton = templateById('carton')!;
    const p = chooseStructure(carton, profileById('corr-3')!, defaults(carton)).params;
    expect(listOf(carton, profileById('corr-3')!, p, 'top')).toEqual(['rsc', 'full']);
    // thin boxboard folds as card does
    expect(offered('card-0.4')).toEqual(expect.arrayContaining(['carton', 'sleeve', 'envelope']));
  });

  it('with the inside stated, card 0.5 → greyboard 2 mm keeps the inside, the outside growing by 3 mm', () => {
    const d = createDesign(MATERIALS[0]);
    boxRecipe(d, { kind: 'rect', x0: -40, z0: -30, x1: 40, z1: 30 }, 30);
    const tray = mainTray(d)!;
    d.sizeAs = 'inside';
    setBoxSize(d, tray, { w: 60, d: 40, h: 30 }, 'inside');
    const o0 = boxSize(d, tray, 'outside')!;
    setMaterial(d, profileById('grey-2')!);
    const i1 = boxSize(d, tray, 'inside')!, o1 = boxSize(d, tray, 'outside')!;
    expect(i1.w).toBeCloseTo(60, 6);
    expect(i1.d).toBeCloseTo(40, 6);
    expect(o1.w - o0.w).toBeCloseTo(3, 6);
  });
});
