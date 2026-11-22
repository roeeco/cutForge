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

### 3.1–3.2 Boards meeting at a point, and corners outside 30–150° — fixed in milestone 187
*Build from boards* stood a board inside every face, but only edges that take a joint were cut
back. Boards meeting at a single point (a pyramid's apex, a cone's tip, a loft's corners, the
obelisk's shoulders) ran into each other, and edges sharper than 30° or flatter than 150° (a
wedge's tip, a diamond's crown, a sphere's facets, rounded corners) were left unjoined and
colliding.

Now (`src/model/boardRelief.ts`, used by `buildBoards`): of each such pair the smaller board
gives way. The part of it that would lie in the other board's slab is cut off its outline, the
face's edges keeping their names so the joints still match the face graph. At a point it keeps
0.3 mm clear; along an edge it stands on the other board's inside face and is glued there
edge to face (a butt seam onto `'face'`, reason *Glued edge to edge…*). Plywood 3 mm, shapes
with export problems 18 of 40 → 8; the sphere (144 collisions, 24 unjoinable corners), the
diamond, the cone, the loft, the obelisk, the wedge, the half sphere and the rounded box are
clean. Corrugated boards the same (sphere, diamond, wedge, rounded box, half sphere clean).

Two things learnt about `polygon-clipping` on the way, for whoever touches this next: it returns
a region touching an outline's corner as a hole rather than a cut, it can answer "nothing left"
for a long sliver at a corner, and it throws when two sides lie on one line (boards at right
angles). The clash region is convex, so it is clipped with our own Sutherland–Hodgman and every
subtraction is checked against our own area.

Still open on boards: the torus (64 boards, 16 broken joints, 5 s), a bitten sphere and a hull
(1–2 collisions each), twin spheres (11 broken tab-and-slot joints from the general joiner,
as before), and hole walls still left out on boards (listed).

### 3.3 Faces around a curve — fixed in milestone 188
Every curve had 12 faces a turn folded and 8 for boards, whatever its size: a ring of 4 mm
corrugated came out as 144 faces 5 mm wide (120 collisions), a plywood ring as 64 boards with 16
broken joints (5 s).

Now `autoFacets` (`src/sculpt/polyhedron.ts`) works each curve's count out from its radius
(a ring's tube, a rounded corner's radius) and the material: the old default, raised until no
face is wider than 25 mm folded (35 on a sphere or ring) or 60 mm as boards, lowered until none
is narrower than 6t (at least 4 mm) folded or 8t and 20 mm as boards; folded at most 24 (16 on a
sphere or ring, so it stays gluable), boards at most 12 (neighbours at 150° or less take a joint);
even, a sphere's a multiple of 4 (the kernel cuts it so). The Make card shows it (*Automatic, from
each curve's size and the board: 10*); a number typed there wins for every curve, *Automatic*
gives it back. A change of material that changes the faces makes the model again (it used to only
re-choose the joints of the old faces).

Corrugated 4 mm folded: shapes with nothing to fix 32 → 34 of 40 (ring, twin spheres); plywood
32 → 33 (the ring: 14 boards, clean, 0.2 s). Card unchanged.

### 3.4 The unfolder still splits some curved and holed shapes
Card: a tall cylinder 60 × 150 (2–3 pieces, by seed), corrugated cylinders (2), the T-pipe (5),
three crossed holes (4, on 2 sheets: the rim flaps take room), the ring (6).

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
- Corrugated 1.6 mm folded: a box with a square hole through it (the "square donut") has 8
  collisions, and a 5 mm-walled tray 5: thick board in thin walls, not a curve.
- A 0.5 mm step between two boxes leaves 0.5 mm slivers (listed). The face graph could weld
  faces that are flush within a thickness (`src/model/polyhedron.ts`, tidy).
- Two boxes touching only along an edge make a solid that is not one piece (listed as unjoined).
- Enter in the new shape's height box sets the height but does not confirm the shape, though the
  hint says "✓ or Enter".
- The new Hebrew line `joint.why.rim` needs the owner's check.
