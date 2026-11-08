# Corrugated tab-and-slot and fold-over reinforcement: plan

This plan is based on reading [roeeco/foldform](https://github.com/roeeco/foldform) (2026-11-07; its code was read, not run) and on CutForge's current joints. Nothing in it is implemented yet. The open decisions are in §5.

## 1. What foldform does

**Fold-over walls** are its main structural feature (`app/lib/template-kernel.ts:467-610`, `WallConstruction = "single-wall" | "fold-over-tuck" | "fold-over-lock"`). Each wall edge continues past its top into a chain of parts, all joined by valley folds:

| Part | Size |
| --- | --- |
| Outer wall | H |
| Rim strip | 2t + s, with a crease line at **each** edge of the strip (not one in the middle) |
| Inner liner | H − t (it stands on the base, so it loses one board thickness) |
| Lock tabs (lock mode only) | trapezoid, `lockTab` deep (default 6 mm), sides tapered by 18% of the tab width |

- **Score allowance:** `s = max(0.3, round(1.25·t / 0.05)·0.05)` (`dieline.ts:416`). That gives 2.0 mm for 1.6 mm board and 5.0 mm for 4 mm board, the same as CutForge's `foldAllowance` values.
- **Tuck mode:** the liner is glued, with no tabs.
- **Lock mode:** tabs fold under the liner's bottom and go through slots in the base.
  - Tab width is `clamp(0.16·L, 4, 14)` mm.
  - There are two tabs, at 0.3L and 0.7L, when they fit; otherwise one tab at 0.5L.
  - Each slot is (tab width + 2c) by (t + c), set back `t + c + s/2` from the base edge.
- **Validation:**
  - error: wall height ≤ 2t;
  - error: lock depth > 0.6 × wall height;
  - error: edge ≤ 2c + 2 mm;
  - warning: c < 0.75t;
  - error: a partial hem (`topFold`) deeper than 0.45 × height.
- **Not in foldform:**
  - general panel-to-panel tab-and-slot;
  - flute direction handling;
  - crease styles: they are stored but the exporters ignore them (always dashed on a CREASE layer).

## 2. What CutForge has now

- Corrugated tab-and-slot on grown 90° panels only. Tabs are exactly t long and flush, so they hold by friction.
- No tab-and-slot on corrugated closing seams, although `POLYGONS_AND_CUTS.md` plans it as the corrugated corner joint.
- No through-and-fold-under lock tabs.
- No minimum tab width for flutes.
- No flute or score direction checks. `grain` is used only by the packer.
- Every fold gets one score in the middle of one allowance strip.

## 3. Proposal: fold-over as an edge feature

Model it like glue flaps (extra material, score lines and a 3D flap on the panel), not as an extra panel:

```ts
Panel.foldOvers?: {
  id: string; edge: number;
  depth: number | null;              // null = liner down to the base; a number = partial hem
  lock: 'glue' | 'tabs';
  locks: number | null; lockDepth: number | null;
}[]
```

`foldOverGeom(d, panel, f): ConnGeom` is merged in `panelExtras` the same way joint geometry is. It produces:

- **Extra material:** the rim strip (2t + fa) beyond the free edge, then the liner.
  - The liner is h − t long when it runs to the base, or `depth` for a partial hem.
  - It is shortened by t at each end where a neighbouring wall meets it, and by 2t where that neighbour also has a fold-over, so liners don't collide at inside corners. Foldform doesn't handle this.
  - Lock tabs use foldform's trapezoid and spacing.
- **Scores:** one at each edge of the rim strip, and one at each lock tab's root.
- **Holes:** lock slots in the panel the wall stands on, using the existing tab-to-slot projection so clearance is applied once (CutForge's rule; foldform adds 2c).
  - Each slot is set back so at least `minWeb` of material stays between it and the base edge. On 1.6 mm board this matters: without the set-back, the web is only about 1.5 mm.
- **3D:** the liner on the wall's inner face, a rounded bead along the rim (like the fold bead), and the tabs through the base. The fold slider unfolds the liner too.
- **Flat net:** no change in `pieces.ts`, because the extra material is drawn in the wall's own coordinates.

**Fold-over is offered** only on card and corrugated, and only on a free edge. Its card has depth (full or a partial hem), lock (glue or tabs), and the tab count.

**Validation:** foldform's rules above, plus:
- the liner must not collide with neighbouring walls, liners or dividers (the existing volume check);
- slot webs must be at least `minWeb`;
- once flute direction is known: a warning when a fold-over score runs across the flutes on 4 mm board.

## 4. Tab-and-slot for corrugated

- Offer `tabslot` on corrugated **closing seams**, at any corner angle, matching `POLYGONS_AND_CUTS.md` §7.
- Add a tab length option `'flush' | 'through'`. A through tab is t + lockDepth long, with a score at the receiver's far face, and folds under to lock.
- Minimum tab width: max(4 mm, 3t), so a tab spans several flutes.

| Default | corr-1.6 | corr-4 |
| --- | --- | --- |
| Rim strip (2t + fa) | 5.2 mm | 13 mm |
| Liner | h − 1.6 | h − 4 |
| Lock tab width | 4.8–14 mm | 12–24 mm |
| Lock depth t + max(4, 1.5t) | 5.6 mm | 10 mm |
| Slot | 1.8 × (w + 0.2) | 4.3 × (w + 0.3) |

The tab width and lock depth for 4 mm board are estimates, not from foldform. Check them with a test cut.

## 5. Decisions needed before building

1. **Edge feature or real liner panel?** The plan above uses an edge feature: cheaper, and the net needs no change. A real panel would only be needed if students should draw shapes on the liner or run divider slots through it.
2. **Lock modes:** glue, and tabs through the base (as foldform has). Tabs into the wall's own fold strip are a possible third.
3. **Crease style on 4 mm board:** plain score lines on the SCORE layer, or a "crush" (a light engraved band 2t + fa wide) for a cleaner fold. This could be a per-material `scoreStyle`.
4. **Flute direction:** warn only, or also have the packer turn pieces so fold-over scores run along the flutes.
5. **Holes in a wall with a liner:** cut through the liner as well (aligned automatically), or only through the outer wall.
6. **Order:** corrugated tab-and-slot on closing seams now, or wait for the polygon work, which needs it anyway.
