# Third-party code

No source code has been copied or adapted from the reference repositories (MocknSlice, Foldform, Die Cut Studio, Extrudo, SketchForge-3D) so far. The SVG and DXF writers, joint geometry and packer in this repository are original.

When code is copied or adapted, record it here with repository, commit and license (and keep the MIT notices for Die Cut Studio and Extrudo `packages/io`). Extrudo's GPL code and SketchForge-3D's AGPL code are behaviour references only and must not be copied or translated.

## npm dependencies
Runtime: react, react-dom (MIT), three (MIT), @react-three/fiber and @react-three/drei (MIT), zustand (MIT), immer (MIT), polygon-clipping (MIT, outline union for folded nets and flaps). Declared for later milestones: opentype.js (MIT), bidi-js (MIT). Test tooling: vitest, @playwright/test (Apache-2.0), fake-indexeddb, jsdom. Python test helpers (not shipped): ezdxf (MIT), svgpathtools (MIT).

## Fonts
Bundled in `public/fonts/` (Hebrew and Latin subsets, WOFF, from the @fontsource 5.3.0 packages), each under the SIL Open Font License 1.1 — license texts next to the files:
- Rubik — Copyright 2015 The Rubik Project Authors
- Frank Ruhl Libre — see `frank-ruhl-libre-LICENSE.txt`
- Amatic SC — see `amatic-sc-LICENSE.txt`

Text layout and outlines use bidi-js (MIT) and opentype.js (MIT).
