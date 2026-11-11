// migrateDesign/parseProject check only that `panels` is an object: a file with one missing
// coordinate loads (the class server's own check is parseProject, worker/index.ts), then the export
// throws (teacher batch: TeacherApp makeBatch has no catch) or writes NaN into the cut files.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../../src/model/materials';
import { addPathShape, addRootPanel, createDesign } from '../../src/model/ops';
import { ProjectError, parseProject, serializeProject } from '../../src/model/serialize';
import { defaults, generate, templateById } from '../../src/templates/registry';
import { prepareExport } from '../../src/export/prepare';
import { sheetsToSvg } from '../../src/export/svg';
import { batchExport } from '../../src/export/batch';
import { STICKERS } from '../../src/easy/stickers';

/** Load, or the ProjectError it was refused with. */
function load(file: any) {
  try {
    return parseProject(JSON.stringify(file));
  } catch (e) {
    expect(e).toBeInstanceOf(ProjectError);
    return null;
  }
}

describe('repro: unvalidated project files', () => {
  it('organiser with one sketch point missing its x', () => {
    const file = JSON.parse(serializeProject(generate(templateById('organiser')!, MATERIALS[3], defaults(templateById('organiser')!))));
    delete file.design.panels['t:base'].sketch.pts[3].x;
    const d = load(file);
    if (!d) return;
    expect(() => prepareExport(d)).not.toThrow(); // actual: TypeError in buildPieces (pieces.ts ringContours)
    expect(() => batchExport([{ id: 's', label: 'S', design: d }])).not.toThrow();
  });
  it('a sticker with one point missing its y', () => {
    const d0 = createDesign(MATERIALS[3]);
    const p = addRootPanel(d0, 0, 0, 100, 100);
    addPathShape(d0, p, STICKERS[0].polys, 50, 50, 30, 30, 'engrave');
    const file = JSON.parse(serializeProject(d0));
    delete file.design.panels[p].details[0].path.polys[0][2].y;
    const d = load(file);
    if (!d) return;
    expect(sheetsToSvg(prepareExport(d).sheets)).not.toMatch(/NaN/); // actual: "NaN" in the path data
  });
});
