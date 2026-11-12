# 3D-model modes: research notes (2026-11-12)

These notes back up `WAFFLE_MODE.md` and the modes that come after it: papercraft unfolding, 3D-file import, and stacked and radial slices. Four surveys produced them; each read the code of the repositories named, not only their READMEs. The licence rule from `THIRD_PARTY.md` applies throughout: MIT, BSD, Apache, ISC and BSL code may be adapted (record it). GPL, AGPL, unlicensed and view-only code is a reference for behaviour only.

## 1. Why MocknSlice's versions fell short

Read from `roeeco/Mocknslice`, with its tests and a few experiments on harder meshes.

### Unfolding, v1 (`triangle-tree-v1`)

- **Refuses most models:**
  - over 200 faces, or anything not closed, manifold and consistently wound.
  - A downloaded 50k-triangle STL is simply refused (`UNFOLD_FACE_LIMIT`).
- **Weak search:**
  - one breadth-first spanning tree, with at most 18 variants (root and child order);
  - it never cuts a seam to remove an overlap. A 144-face torus came out with 72 overlapping face pairs.
- **Wrong fold directions:** the sign comes from the vertex-index order, not the face winding. Even a convex cube got 5 mountain and 2 valley folds.
- **Tab collisions:** a tab on every seam, always on face A. Collisions are only warned about.

### Unfolding, v2 (`papercraft-v2`)

- **What works:** greedy joins with an overlap check at every join. The nets were overlap-free with few islands: a torus in 1–2.
- **Tabs come too late:** they are added after the net is fixed and never shape it.
  - One tab that doesn't fit blocks the result, and then no parts are produced at all.
  - This happened on 4 of 6 test meshes.
- **Slow:** 2–4 s for under 200 faces, from O(n²) bookkeeping.
- **Broken local search:** a misplaced `break` means only the first seam is ever tried.

### Simplifier

- It isn't true QEM: quadrics are not accumulated and vertices are not placed optimally.
- Its deviation bound is measured to the nearest source *vertex*, which always reads 0, so nothing stops it while it runs.
- A real surface check at the end then rejects the whole result, so sources over about 1,000 faces never pass.

### Slicing

- Axis-aligned only.
- Triangle-by-triangle cutting with epsilon welding:
  - one missing triangle loses whole slices;
  - two overlapping shells give wrong holes.
- No gap closing, contour simplification or check for floating pieces.
- Registration holes are fixed bounding-box points, so a tapering model always fails.

### Waffle

- Slot depth comes from each 2D outline's scan, not the shared material.
- The default *alternating* pattern can't be assembled from rigid stock.
- The checker blocked output on a plain sphere.

### Over-engineering

Hashes and provenance, v1–v9 migrations, 3 MB of baseline fixtures, and about 35 ADRs, while the core loops are O(n²)–O(n³).

### Worth keeping as ideas

- Greedy joins with collisions checked.
- Fold sign taken from the face winding.
- Hiding creases on coplanar edges.
- One closed outline per island, with tabs spliced in.
- Paired seam labels.
- Nonzero-winding slice contours.
- A worker with cancellation.
- Best-effort output plus warnings, instead of nothing.

## 2. Slicing tools and ideas

- **Benchmark:** Autodesk *Slicer for Fusion 360* (successor to 123D Make).
  - Techniques: Stacked, Interlocked, Curve, Radial, Folded Panels, 3D Slices.
  - Settings: slot offset (negative allowed for cardboard); notch factor and angle; reliefs (square, dog-bone).
  - Dowels: automatic or placed by hand; round, square, pencil, cross.
  - Modify Form: hollow, thicken, shrinkwrap.
  - Assembly: animated steps; labels like `Z-6-2`; outer cut, inner cut and a scored line where the next part goes; oversized stacked parts split with puzzle tabs.
  - Named errors: unconnected pieces, part too small or narrow, notches split a part, blocked notch, notch hits a hole, part too large for the sheet.
- **[Lamina](https://github.com/marcelfarres/lamina)** (Python, AGPL, active) is the best open reference.
  - Slots: the line where two planes meet is cast against the mesh, with one slot per stretch of shared material, split by a notch ratio, open end past the outline. A "through" slot is used where the line leaves the material and comes back.
  - `check_insertion` sweeps the crossing part along the slot to find what blocks it.
  - Union-find finds floating pieces, and an auto-fix adds a crossing slice through any of them.
  - Thin spots are found by erosion then dilation.
  - Dowels: placed in the area common to all layers.
  - Stacked: mid, outer or inner surface; the next layer's outline engraved.
- **[MakeSlice](https://github.com/whatmakeart/make-slice)** (TS, GPL-3), browser-only. Calibration kit, blind pins, kerf compensation, assembly PDF, nesting into scrap, flute orientation lock.
- **[OpenSlicer Studio](https://github.com/iSuat/Slicer-Studio)** (GPL-3). Engraves the partner's ID inside each slot.
- **[object-slicer](https://github.com/Kikketer/object-slicer)** (TS, MIT). Simple and copyable, but naive: 50/50 notches cut with `polygon-clipping`, maxrects packing.
- **[Kiri:Moto](https://github.com/GridSpace/grid-apps)** (MIT in the README, "All Rights Reserved" in file headers; check before copying).
  - `sliceConnect` joins dangling ends within a bridge distance; at forks it keeps the path with the largest area.
  - It drops segments where an edge only touches the plane.
  - Laser mode engraves the previous layer.
- **Papers:**
  - [crdbrd](https://hildebrand.bht-berlin.de/crdbrd/crdbrd.pdf): when a part can slide in, splitting blocked parts, insertion order by branch and bound.
  - Schwartzburg & Pauly 2013: angled crossings need wide slits, so prefer 90°.
- **Robust cutting of imperfect meshes:**
  - Weld vertices first.
  - Treat a vertex on the plane as above it.
  - One crossing point per mesh *edge*, so loops close by topology, not by tolerance.
  - Orient segments by face normal, then fill by nonzero winding.
  - Join stubs within a gap tolerance.
  - Last resort: rasterise inside/outside and run marching squares.
- **Waffle rules:**
  - slot directions consistent per family, never alternating;
  - split ratio 0.35–0.65, chosen so no part splits;
  - a through-slot or dropped crossing where the line has several stretches of material;
  - angled slot width = t_B/sinθ + t_A·|cotθ| + clearance, with θ ≥ about 60°;
  - minimum gap in a family = t + clearance + minimum feature;
  - a crossing slice added through any floating piece.

## 3. Papercraft unfolding

- **No mature unfolder exists under a permissive licence in JS or TS.**
- **[Export Paper Model](https://github.com/addam/Export-Paper-Model-from-Blender)** (Blender, GPL) gives the best plain results.
  - Every face starts as its own island. Edges are joined in order of `0.5·convex/π` or `1.0·concave/π`, minus `0.05·len/avgLen`, so flat and long edges join first.
  - The smaller island moves onto the larger. A join is refused if the islands' outlines cross (sweep-line) or the result won't fit the page.
  - The net is overlap-free by construction.
  - Tabs go on the face with the smaller area-to-perimeter ratio. They are trapezoids clamped to the target face's corner angles, with the fold slid by `t/sinθ` for thickness.
  - Labels only where the match isn't obvious.
- **[PolyZamboni](https://github.com/AntonFlorey/PolyZamboni)** (GPL).
  - Manual cuts and glued edges.
  - Its auto-cut removes cuts in order of how well edges line up with an axis, which gives loops and strips, with a face limit per piece.
  - Zigzag tab placement.
  - Pieces are coloured by quality.
- **[rodrigorc/papercraft](https://github.com/rodrigorc/papercraft)** (Rust, GPL). Click edges to join; its auto-join undoes any join that makes a piece overlap itself; coplanar faces merge; tab width is limited by neighbouring angles.
- **Permissive, can be adapted:**
  - **[jmlien/mesh_unfolder](https://github.com/jmlien/mesh_unfolder)** (MIT, C++). Edge-weight rules (flat-tree `|c·e|/len` with a random direction `c`, steepest edge, perimeter), spanning tree, overlap test, up to about 100 retries with new random weights. Also has a genetic algorithm and a set-cover repair.
  - **[felixfeliz/paperfoldmodels](https://github.com/felixfeliz/paperfoldmodels)** (MIT, Python, written for high-school students). Straub & Prautzsch: a minimum spanning tree weighted by edge length, then a greedy set cover that cuts the tree edges breaking the most overlaps. About 150 lines.
  - **[hermes98761234/papercraft-unfolder](https://github.com/hermes98761234/papercraft-unfolder)** (MIT, TS, likely AI-built). A clean skeleton, but triangles only and no merge pass.
  - **Don't copy KamiMock:** its `growNet` is a port of the Blender addon's `join`, so treat it as GPL-derived.
- **Single-piece nets:**
  - **Zawallich's tabu search** ([arXiv 2405.07922](https://arxiv.org/abs/2405.07922)): about 99–100% success, with median times in C++ of 0.015 s at 100 faces, 1 s at 400 and 3.4 s at 600. [Its code](https://github.com/LZaw/Unfolding) has no licence, so it is a reference only.
  - **Korpitsch et al. 2020** (simulated annealing): **count tabs in the overlap check.**
  - **Takahashi et al. 2011** (genetic algorithm): too heavy.
- **Recommended pipeline for later:**
  1. Weld, then check the mesh is manifold. Cut every edge shared by three or more faces, except its most coplanar pair. Merge faces whose angle is under 0.5° into polygons.
  2. Weight edges by the Blender formula, with an optional axis term for a *strips* look.
  3. Greedy join with a union-find. Refuse a join if it overlaps (including the space each tab needs) or doesn't fit the bed. Find candidate pairs with `flatbush` (ISC) and test them with convex polygons.
  4. Restart for about 1 s with jittered weights, keeping the result with the fewest pieces and the least cut length.
  5. Merge pass, smallest piece first.
  6. Fallback: the set-cover repair.
  7. Optionally, tabu search for a single piece, with a 3–5 s limit in a Worker.
- **Tabs and laser:**
  - Tabs alternate along chains of cut edges and are clamped to angles. Each is tested, then flipped, shrunk, or dropped and flagged. Overlapping tabs are a hard error on a laser.
  - Separate layers for cut, valley score, mountain fold (perforated) and engraved labels.
  - Tab-and-slot closures only near 90° on thick stock.

## 4. Bringing in 3D files (for later)

Measured on an M1 Pro (a mid-range laptop is about 1.5–2× slower).

- **[meshoptimizer](https://github.com/zeux/meshoptimizer)** 1.3 (MIT): `simplifier.js` is about 20 KB gzipped with the WASM inside, and runs in a Worker.
  - `simplifyWithUpdate` takes 200k triangles to 300 in 45–90 ms with no non-manifold edges.
  - At 100 triangles it left 1 non-manifold edge: the output isn't guaranteed manifold, so check it.
  - Avoid `simplifySloppy` (27–32 non-manifold edges).
  - The new `remesh` voxel remesher closes, merges and fills, but thin sheets collapse; not yet timed.
  - three r187's `SimplifyModifier` wraps the older 1.1.
- **Plain simplification doesn't give big flat panels:** a rounded box came out as 72 panels at 8°.
  - Papercraft needs **VSA** (Cohen-Steiner variational shape approximation). There is no JS or WASM port; CGAL's is GPL.
  - [nissmar/VSA](https://github.com/nissmar/VSA) (MIT C++, about 1.5k lines) is a translation reference.
  - Estimate: 800–1200 lines of TS, 1–2 weeks. Lloyd iterations on a 2–5k-triangle pre-simplified mesh, k = 20–80 panels on a slider, then anchors where three or more regions meet.
- **Retopology: skip.** Instant Meshes and QuadriFlow (BSD) have no WASM builds, and quads on curved surfaces aren't flat, so they would be split anyway.
- **[manifold-3d](https://github.com/elalish/manifold)** (Apache-2.0; also the waffle kernel):
  - `ofMesh` throws on input that isn't manifold, and `Mesh.merge()` welds open edges where it can. It doesn't repair meshes.
  - `union` resolves overlapping closed parts.
  - It also has `slice`, `project`, `levelSet`, `hull`, `simplify`, `CrossSection.offset/simplify/decompose`.
- **Repair:**
  - [meshfix-wasm](https://github.com/anthonygreco/meshfix-wasm) (MIT, young) does welds, bowtie splits, hole filling and normal fixes.
  - [@itk-wasm/mesh-filters](https://www.npmjs.com/package/@itk-wasm/mesh-filters) (Geogram, Apache-2.0) does remeshing and repair.
  - A distance field computed on the CPU is too slow: about 31 s for 128³ on 200k triangles.
- **[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)** (MIT; drei already brings 0.8.3) for fast plane cuts and raycasts.
- **Loaders:**
  - STL: assume mm, usually Z-up. Delete normals before welding.
  - GLB: metres. Bake world matrices; read quantised attributes with `getX`.
  - 3MF: needs `DOMParser`, so parse it on the main thread.
  - Always ask for the real size in mm.
- **Fallback:** convex hull (three `ConvexHull` or `Manifold.hull`), then simplify to 20–60 faces.
- **Pipelines for later:**
  - **Low-poly, for papercraft:** weld → (`remesh` if open or broken) → `simplifyWithUpdate` to 2–5k → VSA to 20–80 panels → check.
  - **Watertight, for slicing:** weld → `merge` → `ofMesh` per part → `union` → (`remesh` if that fails) → the waffle and stacked pipelines in `WAFFLE_MODE.md`.
