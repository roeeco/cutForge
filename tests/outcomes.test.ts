// Milestone 60: outcomes. With only the waffle registered nothing changes.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, isSculpture, primitiveShape } from '../src/sculpt/ops';
import { buildPieces, outcomeHooks, registerOutcome, waffleHooksNow } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { outcomeIds, outcomeOf, outcomeUi } from '../src/sculpt/outcomes';
import { createDesign } from '../src/model/ops';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

describe('outcomes', () => {
  it('src/sculpt imports nothing from src/waffle', () => {
    const bad = files('src/sculpt').filter((f) => /\.(ts|tsx)$/.test(f) && /from '(\.\.\/)+(waffle)\//.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('the waffle registers its hooks and its stage-2 editor; pieces and checks come from them', async () => {
    await kernel();
    await import('../src/waffle/pieces');
    expect(waffleHooksNow()).not.toBeNull();
    const d = createWaffleDesign();
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 60, d: 60 }, 40));
    expect(outcomeOf(d)).toBe('waffle');
    expect(outcomeHooks(d)).toBe(waffleHooksNow());
    const { wafflePieces } = await import('../src/waffle/pieces');
    expect(buildPieces(d).length).toBe(wafflePieces(d).length);
    expect(buildPieces(d).length).toBeGreaterThan(0);
    expect(validate(d)).toEqual(waffleHooksNow()!.checks!(d));
    // a fold outcome with nothing registered has no pieces yet
    expect(buildPieces({ ...d, outcome: 'fold' })).toEqual([]);
    registerOutcome('fold', { pieces: () => [], partOf: () => null });
    expect(outcomeHooks({ outcome: 'fold' })).not.toBeNull();
    await import('../src/waffle/ui/register').catch(() => null);
    // the stage-2 editor registers only the waffle (no fold entry in this milestone)
    expect(outcomeIds()).toEqual(['waffle']);
    expect(outcomeUi('waffle')?.nameKey).toBe('stage.waffle');
  });

  it('isSculpture: shapes, whatever they become', () => {
    expect(isSculpture(createWaffleDesign())).toBe(true);
    expect(isSculpture(createDesign())).toBe(false);
  });
});
