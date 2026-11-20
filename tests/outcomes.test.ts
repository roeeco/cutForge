// Milestone 120 (from claude/guided-mode's milestone 60): outcomes. On this branch a
// sculpture with no outcome is not made yet; the waffle stays on its own branch.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, isSculpture, primitiveShape } from '../src/sculpt/ops';
import { buildPieces, outcomeHooks, registerOutcome } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { outcomeOf, OUTCOMES } from '../src/sculpt/outcomes';
import { createDesign } from '../src/model/ops';
import { parseProject, serializeProject } from '../src/model/serialize';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

describe('outcomes', () => {
  it('src/sculpt imports nothing from src/waffle, and src/waffle is not here', () => {
    const bad = files('src/sculpt').filter((f) => /\.(ts|tsx)$/.test(f) && /from '(\.\.\/)+(waffle)\//.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
    expect(readdirSync('src').includes('waffle')).toBe(false);
  });

  it('a sculpture with no outcome is not made yet: no pieces, no checks', async () => {
    await kernel();
    const d = createWaffleDesign();
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 60, d: 60 }, 40));
    expect(outcomeOf(d)).toBeNull();
    expect(outcomeHooks(d)).toBeNull();
    expect(buildPieces(d)).toEqual([]);
    expect(validate(d)).toEqual([]);
  });

  it('an outcome with its own hooks gives the pieces and checks', () => {
    const d = { ...createWaffleDesign(), outcome: 'waffle' as const };
    expect(buildPieces(d)).toEqual([]);
    registerOutcome('waffle', { pieces: () => [], checks: () => [{ key: 'sculpt.empty', vars: {}, target: { kind: 'none', id: '' } }] });
    expect(outcomeHooks(d)).not.toBeNull();
    expect(validate(d).length).toBe(1);
  });

  it('a file keeps a known outcome and drops an unknown one', () => {
    for (const o of OUTCOMES) {
      const d = { ...createWaffleDesign(), outcome: o };
      expect(parseProject(serializeProject(d)).outcome).toBe(o);
    }
    const bad = JSON.parse(serializeProject(createWaffleDesign()));
    bad.design.outcome = 'pottery';
    expect(parseProject(JSON.stringify(bad)).outcome).toBeUndefined();
  });

  it('isSculpture: shapes, whatever they become', () => {
    expect(isSculpture(createWaffleDesign())).toBe(true);
    expect(isSculpture(createDesign())).toBe(false);
  });
});
