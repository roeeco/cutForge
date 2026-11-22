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

Still open on boards (after milestone 188's facets): a bitten sphere and a hull (1–2 collisions
each), twin spheres (11 broken tab-and-slot joints from the general joiner, as before), a dent (4
broken joints), and hole walls still left out on boards (listed). The ring is clean since 188.

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

### 3.4 Fixed in milestone 189
- **Broken joints on boards** (twin spheres 11, a spherical dent 4) were the general joiner's own
  edge-on-face contacts, turned into plain butts by Make where a corner takes no joint (an inside
  corner of 222° or 250°, where the spheres meet): a plain butt has no geometry off the square. An
  edge on a face that Make makes a butt is now the glued edge-to-face seam (it cuts nothing and
  never breaks). Plywood shapes with nothing to fix 33 → 34 of 40; corrugated boards stay at 34.
  (Reading an inside corner from its other side and giving it tabs was tried: the slots fall too
  close to the board's edge on every L, notch and step. A glued butt is right there.)
- A joinable edge the general search missed is joined from the face graph (it helps where the two
  boards keep their edges' names; see 3.6).
- **The Make card says when its repairs run out** with the net still overlapping (*The net still
  overlaps itself where it is folded*), with *Cut it there*.
- **Enter in a new shape's height box** sets the height and confirms the shape, as its hint says.
- The flap a card sphere of 24 faces a turn sometimes drops (about one seed in ten) is the input's:
  288 faces, past the 200 a made model takes, crowd into a dozen islands. The test that met it at
  random now has a fixed seed; automatic facets give that sphere 12.

### 3.5 Still open: the unfolder splits some curved and holed shapes
Card: a tall cylinder 60 × 150 (2–3 pieces, by seed), the T-pipe (5), the ring (6), three crossed
holes (4, on 2 sheets: the rim flaps take room); corrugated cylinders and cones (2).

*How:* (a) **strip first** for a ruled face: fold all of one curve's facet-to-facet edges before
anything else, then hang each cap from facets far apart along the strip; (b) the **merge pass**
planned in `SHAPES_TO_DIELINES_PLAN.md` §4.4 step 4 is not built: for two islands, cut one fold
inside one of them and rejoin the smaller part elsewhere (re-rooting), smallest island first;
(c) for holes, the rim flaps can only go on the wall (a hole has no edge to carry them), so the
tube should be laid where its toothed ends have room: beside its board, not folded off it.
A long piece of work (a new search in the unfolder, its tests and timing).

### 3.6 Still open: boards trimmed too much where they meet at a shallow point
Twin spheres (4 collisions) and the hull (1): two boards sharing an ordinary edge (108°, 138°) get no
joint, because trims against *other* boards they meet only at a point cut their shared edge away
(boards with 8–10 trimmed edges). The clash region (the other board seen along this one's normal, cut
by a band) over-reaches when the two meet at a shallow angle. *How:* bound a point clash to the
neighbourhood of the shared corner, or clip it by the other board's own outline instead of its hull.

### 3.7 Still open: hole walls on boards
*Build from boards* leaves a hole's walls out (listed): a hole is a cut-out, not an edge, so no corner
joint can be cut round it. The glued edge-to-face seam of 187 would now let the walls stand on the
board round the hole (glued), or tabs could go into slots round it. **A product decision first** (§4).

### 3.8 Still open: boards are slow on many faces
Twin spheres (56 boards) take about 2 s: `autoConnect` tries every pair of boards. *How:* for made
boards, take the pairs from the face graph's edges, and run the general search only for boards the
student added.

### 3.9 Still open: small things
- Thick board in thin walls: a 5 mm-walled tray in corrugated (collides, *too thin*); a box with a
  square hole through it in corrugated 1.6 mm (8 collisions); a bitten sphere in corrugated 4 mm (the
  hole's walls graze the sphere's boards, 15).
- A 0.5 mm step between two boxes leaves 0.5 mm slivers (listed). The face graph could weld faces
  flush within a thickness (`src/model/polyhedron.ts`, tidy); that changes the shape by up to t.
- Two boxes touching only along an edge are not one solid (listed as unjoined or colliding).
- *No board faces up* on a pyramid or a cone (listed, with *Fold it instead*).
- Large boxes in corrugated: too big for the sheet along the flutes (listed).
- Hebrew to check: `joint.why.rim`, `make.facetsAuto`, `make.facetsReset`, `make.p.overlap`,
  `make.fix.cutThere`.

## 4. To decide before the long pieces of work

1. **Hole walls on boards (3.7):** line a hole with boards (glued on the board round it, or tabs in
   slots round it), or keep a hole a plain cut-out with nothing round it?
2. **The unfolder's next search (3.5):** worth a milestone now (fewer pieces for cylinders, pipes,
   rings, holes), or later?
3. **Welding near-flush faces (3.9):** may Make move a face by up to a board's thickness to drop a
   sliver (a 0.5 mm step), or must the made model keep the shape exactly and only list it?
4. **Thick board in thin walls (3.9):** only list it, or offer a thinner board (or *Fold it*) as the
   fix, or warn already on the shape stage?
