# The shapes-to-fold and shapes-to-boards engine: tested as a student (22 November)

What was tested, what milestone 186 fixed, and what is still worth changing, with how.
The engine is the face graph (`src/sculpt/polyhedron.ts`, `src/model/polyhedron.ts`), the
unfolder (`src/model/unfold.ts`), the seam net (`src/model/seamNet.ts`, `seamFold.ts`) and
the reassembler (`src/model/reassemble.ts`), driven by *Fold it* and *Build from boards*
(`src/make/run.ts`).

## 1. How it was tested

- In the app, as a student: welcome screen → Card → *Build from shapes*, a box dragged on the
  floor, its height typed, *Fold it*, then the 3D view and the Cut plan.
- Then 40 shapes, each made in one click in card (*Fold it*), corrugated 4 mm (*Fold it*) and
  plywood 3 mm (*Build from boards*), with the cut plan read back: pieces, joints, Make's
  problems, the export checks (`validate`) and the exported SVG. Simple shapes, and awkward
  booleans: holes across corners and edges, a U-channel, three crossing holes, a thin tray,
  a T-pipe, a bitten sphere, a spherical dent, an oblique cut, a chopped corner, two boxes
  touching only along an edge, a 0.5 mm step, a hull, twin spheres.
- The probe is kept for the next round: `src/dev/makeProbe.ts`. In the dev server's console:
  `const p = await import('/src/dev/makeProbe.ts'); (await p.table('fold', 0)).map(p.line).join('\n')`
  (materials: 0 card, 1 corrugated 1.6, 2 corrugated 4, 3 plywood 3); `p.show('hole|fold|card-0.5')`
  draws that case's export full screen, `p.show(null)` closes it.

## 2. Fixed in milestone 186

| # | What a student saw | Cause | Fix |
| --- | --- | --- | --- |
| 1 | *Fold it* clicked while a new shape's height box was still open: the model was made, then the shape vanished (the card offered *Update from shape* at once, and going back showed an empty stage). | `makeNow` read the design with the ghost in it, then cancelled the ghost. | The ghost is confirmed first (`src/make/run.ts`). |
| 2 | Every shape with an inside corner (an L, a notch, a U-channel, a step, a chopped corner, twin spheres) and every hole had boards overlapping in the cut plan (*1 thing to fix*), while the Make card said nothing was wrong. | After Make, any edit runs the general joiner (`autoConnect`), which saw a board's edge on another's face at a 270° corner, or a hole's wall on its rim, and added a second, automatic joint (glue, or tab and slot on card) whose flap lay over the net. | The joiner leaves two boards of a folded made model alone: the face graph chose every joint between them (`findOpenSeams`, `src/model/seams.ts`). |
| 3 | A hole through a shape: its walls were a loose strip, never attached to the boards round the hole (the extra joints of 2 had hidden this). | The unfolder skipped every edge on a hole's rim, and a joint cannot be made to a hole (it is a cut-out, not an edge). | A rim glue seam: the unfolder fits a flap on the wall's rim edge (sized and checked like any flap), and Make glues it from that edge onto the holed board's inside face (`rimGlue`, edge `'face'`). The tube comes out toothed at both ends. Card and corrugated: every hole case has nothing to fix. |
| 4 | A 12-sided cylinder (and a cone) lay flat in 2 pieces where 1 fits easily, and took 1.2 s. | The flaps beside where a cap meets the strip sit in a 30° wedge; they could narrow by at most a third of their edge, and a crease's shift there overlapped them by about 1 mm², just over the limit. | A flap may lean away at one end only (up to `TAPER_MAX`), and may overlap a face that meets its own edge's corner by what the export check allows, kept per pair of boards so several flaps never add up past it. One piece, 9 ms. Checked over 80 seeds of the Guided diamond (none overlap). |
| 5 | A box with rounded corners became 70 faces (16 slivers a corner), too long for the sheet: 3 pieces, 2.3 s. | Rounded footprint corners ignored *Faces around a curve*. | They follow it like a cylinder (12 a turn: 3 a corner). 18 faces, one piece. |
| 6 | Heavy shapes were slow: three crossed holes 3.2 s, torus 2.5 s, T-pipe 1.9 s, a cylinder 1 s (Make runs on the main thread after the Worker's first unfold). | Two-thirds of the time was polygon-clipping measuring a flap against faces; flap sizes were worked out again on every join. | An exact convex clip for convex pairs (every flap is convex), area-first flap tests, the sheet fit from one box, flap sizes kept per edge. Crossed holes 0.25 s, torus 0.5 s, T-pipe 0.2 s, cylinder 0.03 s. |

Measured on card (*Fold it*), before → after: pieces for cylinder 2 → 1, cone 2 → 1, rounded
box 3 → 1 (with real rounded corners), corrugated torus 5 → 1; shapes with export problems 14 of 40 → 2
(both expected: a 0.5 mm step's slivers, and two boxes touching only along an edge).

Tests: `tests/makeEngine.test.ts` (7). Unit tests 2102 passed; `make-fold` and `make-boards`
app specs pass.

## 3. Still open, most useful first

### 3.1 Plywood: boards collide where they meet only at a corner
*Build from boards* on a pyramid (2), cone (20), loft (8), obelisk (10), diamond (44), sphere (144):
every one is two boards that share **one point** of the shape (an apex, the corner of a loft).
Boards stand inside the faces, so near a point where several meet at angles other than 90°,
their thickness runs into each other. The engine cuts boards back along shared **edges**
(`cornerDepths`) but never at **vertices**.

*How:* after the corners are joined (`buildBoards`), for each vertex of the face graph where
three or more boards meet: for each board, the part of its slab (its outline × thickness) that
lies inside a neighbour's slab, projected onto the board, is cut off its outline (a small notch or
bevel-free chamfer at that corner, `polygon-clipping` difference in the board's own plane). Pure,
in `src/model/reassemble.ts` or a new `vertexRelief.ts`; tests on the pyramid and the loft.

### 3.2 Plywood: corners outside 30–150° get no joint
Sphere (24), half sphere (12), diamond crown (8), wedge tip, rounded corners (8), a torus (32):
listed as *corner* problems, the boards just touch (and the torus's are broken).

*How:* two kinds. (a) **Near flat** (over 150°, facets of a curve): fewer, larger boards: choose the
facet count for boards so neighbouring facets meet at 150° or less (8 a turn does, 12 does not),
or glue a backing strip (a cleat cut from the same board) behind the seam. (b) **Sharp** (under 30°,
a wedge's edge): blunt the tip, cut both boards back to where they are a thickness apart and butt
them on that flat; or offer the living hinge once it is no longer parked.

### 3.3 Faces around a curve ignore the size and the material
Every curved shape gets 12 faces a turn on card and 8 on boards, whatever its size. A 20 mm
tube of corrugated 4 mm becomes 96 slivers (and boards running into each other); a 100 mm
sphere of card is coarse.

*How:* pick N for each curved shape from its radius r and the thickness t: each face about
6t wide or more and 25 mm or less (N = 2πr / clamp(·)), between 6 and 24, still overridden by the
student's per-shape number. Facet keys already follow N, so this is one function in
`src/make/run.ts` (`facetsFor`) and `src/sculpt/polyhedron.ts` (`facetedCopy`).

### 3.4 The unfolder still splits some curved and holed shapes
Card: a tall cylinder 60 × 150 (2–3 pieces, by seed), corrugated cylinders (2), the T-pipe (5),
three crossed holes (5, now on 2 sheets: the rim flaps take room), the torus (7).

*How:* (a) **strip first** for a ruled face: fold all of one curve's facet-to-facet edges before
anything else, then hang each cap from facets far apart along the strip; (b) the **merge pass**
planned in `SHAPES_TO_DIELINES_PLAN.md` §4.4 step 4 is not built: for two islands, cut one fold
inside one of them and rejoin the smaller part elsewhere (re-rooting), smallest island first;
(c) for holes, the rim flaps can only go on the wall (a hole has no edge to carry them), so the
tube should be laid where its toothed ends have room: beside its board, not folded off it.

### 3.5 Make says nothing when its repairs run out
Make re-unfolds up to six times to cut folds the laid net overlaps on; after that an overlap is
left and only the top bar's *things to fix* shows it. *How:* a Make problem *Two faces overlap in
the net* naming them, with a *Cut here* fix (the fold `netProblems` would cut).

### 3.6 Boards are slow on many faces
A plywood torus (64 boards) takes 5 s, twin spheres 1.6 s: `autoConnect` tries every pair of
boards. *How:* for made boards, take the pairs from the face graph's edges (it knows which boards
meet), and run the general search only for boards the student added.

### 3.7 Small things
- A 0.5 mm step between two boxes leaves 0.5 mm slivers (listed). The face graph could weld
  faces that are flush within a thickness (`src/model/polyhedron.ts`, tidy).
- Two boxes touching only along an edge make a solid that is not one piece (listed as unjoined).
- Enter in the new shape's height box sets the height but does not confirm the shape, though the
  hint says "✓ or Enter".
- The new Hebrew line `joint.why.rim` needs the owner's check.
