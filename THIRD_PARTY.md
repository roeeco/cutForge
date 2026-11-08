# Third-party code

No source code has been copied from the reference repositories (MocknSlice, Foldform, Die Cut Studio, Extrudo, SketchForge-3D). The SVG and DXF writers, joint geometry, outline booleans, through-cuts and packer in this repository are original.

**Adapted from Foldform** ([roeeco/foldform](https://github.com/roeeco/foldform), the owner's code; the commit read on 2026-11-07 was not recorded in `CORRUGATED_JOINTS.md`): design rules and constants only, re-implemented here — no code was copied. From `app/lib/template-kernel.ts` (fold-over walls, lines ~467–610): the rim strip of 2t + score allowance with a crease at each edge, the liner of h − t, lock tabs as trapezoids tapered by 18% of their width, the tab width clamp and the two-tabs-at-0.3L/0.7L rule, and the validation rules (wall ≤ 2t, lock depth > 0.6h, edge too narrow, c < 0.75t, hem > 0.45h). From `dieline.ts` (~line 416): the score allowance `max(0.3, round(1.25t/0.05)·0.05)`, which equals CutForge's `foldAllowance`. Used in `src/model/foldover.ts` and `src/model/validate.ts`. Differences: slots use CutForge's clearance-once rule (foldform adds 2c), slots are set back for a minimum web, and liners give way at corners.

When code is copied or adapted, record it here with repository, commit and license (and keep the MIT notices for Die Cut Studio and Extrudo `packages/io`). Extrudo's GPL code and SketchForge-3D's AGPL code are behaviour references only and must not be copied or translated.

## npm dependencies
Runtime: react, react-dom (MIT), three (MIT), @react-three/fiber and @react-three/drei (MIT), zustand (MIT), immer (MIT), polygon-clipping (MIT, outline union for folded nets and flaps). opentype.js (MIT), bidi-js (MIT), drizzle-orm (Apache-2.0). Tooling: wrangler (MIT/Apache-2.0), drizzle-kit, @cloudflare/workers-types. Test tooling: vitest, @playwright/test (Apache-2.0), fake-indexeddb, jsdom. Python test helpers (not shipped): ezdxf (MIT), svgpathtools (MIT).

## Fonts
Bundled in `public/fonts/` (Hebrew and Latin subsets, WOFF, from the @fontsource 5.3.0 packages), each under the SIL Open Font License 1.1 — license texts next to the files:
- Rubik — Copyright 2015 The Rubik Project Authors (also the interface font: `rubik-{latin,hebrew}-wght-normal.woff2`, variable weight, from @fontsource-variable/rubik 5.3.0)
- Frank Ruhl Libre — see `frank-ruhl-libre-LICENSE.txt`
- Amatic SC — see `amatic-sc-LICENSE.txt`

Text layout and outlines use bidi-js (MIT) and opentype.js (MIT).
