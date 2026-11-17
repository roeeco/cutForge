# CutForge: bends, closures and dielines: plan (milestones 61–72)

Planning notes from 2026-11-17. **Status: plan only, nothing built.** Starts from `main` at `c47c273` (milestone 43 and the bug-fix pass).

This plan replaces the parked branch `claude/charming-einstein-lqhfxq` (its milestones 44–48: dividers, round outlines, curved walls, bend patterns, strips, lids). Everything in it is rebuilt on a simpler model, and four things are added: closing lips, a slit-lock joint, a snap-lock bottom, and splitting a dieline to save material. §14 looks further: what would make CutForge a real packaging design tool.

The decisions in §2 come from the interview of 2026-11-17. §12 lists the defaults the owner can still change before work starts.

Milestone numbers start at 61 so they collide with nothing: `main` ends at 43, the parked branch used 44–48, and the waffle branch (`claude/waffle-mode`, unmerged) uses 49–60. `PRESETS_PLAN.md` (49–56) and `IMAGES_ON_BOARDS.md` (42–49) need renumbering whenever they are built (§15).

## 1. What was wrong with the parked branch

Read from its code and measured in this session (Node, this container; a school Chromebook is several times slower).

| Finding | Evidence | Cause |
| --- | --- | --- |
| **Hinges are separate parts.** | A rounded-rectangle tray is 9 panels: the base, 4 straight walls and 4 "curved walls", one per corner. | `reconcileTrays` stands one panel per curve run (`src/model/bent.ts`). A later pass (`src/model/strips.ts`, 340 lines) tries to stitch each corner back onto a neighbour with in-line seams, `rides` and puzzle keys. |
| **Slow.** | `solve` on a 120 × 80 rounded card tray: **12.4 ms**, against 1.1 ms for the same tray with square corners. 8.5 ms of that is `planStrips`. | `planStrips` runs polygon unions and intersections on every solve, for every corner and every candidate neighbour. |
| **Slower still in the app.** | On `main`, `solve` inside the store's `produce` costs 6–8 ms against 1.3–2 ms outside it. | `solve` runs on an Immer draft (`src/store/store.ts`), so every property read goes through a proxy. Facets, pattern lines and joint geometry are all written into the design there. |
| **Unstable.** | Sweeping a rounded box's corner radius 15 → 55 → 10 → 3 mm: the curved walls went 4 → 2 → 4 → 1, with new ids each time. After that the plywood box was 4 pieces, and 6–7 once its base was resized. | A curved wall's identity is its run's key. Runs merge and split as the radius changes, so walls are deleted and re-made, and what was on them goes with them. |
| **Special cases everywhere.** | Bent walls take no fold-over and nothing grows from them; the "touching but not joined" check skips them; dividers need a per-facet joint path (`onFacet`); picking, shapes and the fold view each have a bent branch. | A bent wall is a panel with many frames, in a codebase where a panel has one. |

The model, not the details, is the problem: **a curve was given its own panel.**

## 2. Decisions (interview, 2026-11-17)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Scope | **Rebuild everything from `main`**, including dividers (old 44) and round outlines (old 45). Nothing is merged from the parked branch. Its tests and documents are a reference for behaviour. |
| 2 | Living hinges | **Never a part of their own.** A hinge is a zone of a wall, or of a fold between two panels. Its far end joins the next face in one piece, with a glue lip, with a slot or key. |
| 3 | Hinge pattern | **The student chooses the pattern.** Its density is worked out from the curve and the material. A pattern that cannot work in a design is shown greyed, with the reason. |
| 4 | Closing lips | **Made automatically when a grown panel seals an opening**, with snapping that finds the sealing size. The student can also mark the closing edge themselves. |
| 5 | Snap lock | **Both meanings:** a slit-lock joint for card and corrugated (no glue), and a snap-lock (1-2-3) bottom. |
| 6 | Dielines | **Split a dieline into several pieces** when that saves material, automatically. |
| 7 | Direction | Follow packaging-industry practice, and plan towards a custom, quick-turnaround packaging designer (§3, §14). |
| 8 | This session | **Plan only.** |

## 3. Packaging practice this plan follows

These are the working rules of folding-carton and corrugated design. Each line says where the plan uses it.

- **One piece wherever it can be.** A carton is one blank with one glue seam (the manufacturer's joint). Parts are split only for a reason: the sheet, the nest, or the material. §4 (hinges stay in their wall), §9 (splitting is a choice with a stated gain).
- **Glue-free where it can be.** Tucks, slit locks and snap-lock bottoms close and hold without glue. §7, §8.
- **Closures are a small set of proven mechanisms**, each with known proportions: tuck flap with dust flaps, slit-lock tuck, tab lock, snap-lock bottom, seal-end flaps, telescoping lid. §7, §8.
- **Dimensions follow the board.** A blank is drawn crease to crease, and every panel is corrected for the board's thickness so the inside size is what was asked for. CutForge already derives sizes from thickness, clearance and fold allowance; bends add the bend allowance (§4.3).
- **Grain and flutes decide what bends.** Flutes run up a wall for stacking strength and bend easily only across themselves. The checks in §5 know this.
- **Every line in a dieline has one meaning:** cut, crease (score), perforation, kiss cut. CutForge's layers already separate cut, score and engrave; perforations and hinge slits go on the cut layer as open lines, kiss scores on the score layer with a face-up mark.
- **Calibrate on scrap.** Fit, bend and crease values are starting points until a test piece is cut. §5.4 keeps the bend test.
- **Nest before you cut.** Blanks are laid out interlocked, turned 180° against each other, to use the sheet. §9.2.
- **Design from the product.** A box is sized from what goes inside. CutForge's *What goes inside* objects are the start of this; §14 extends it.

## 4. The model: bends are bands, and a band belongs to a wall or a fold

### 4.1 Three terms

- **Band:** a strip of material that is flat when cut and curved when assembled. It bends about one direction only (a cylinder, not a dome).
- **Wing:** a band that continues a wall past its side edge, following the curve of the base. The wall and its wings are one panel with one outline.
- **Seam flat:** a short straight edge on a round base (circle, oval) where the wall strip starts and closes. It gives the strip a flat place for its glue lip or key.

Every panel keeps exactly one flat frame. That is what removes the special cases: growing, fold-overs, joints, dividers, snapping and the gizmo all work on the flat part as they do today.

### 4.2 Where bands appear

| In the design | What it is | Band is owned by | Replaces (parked branch) |
| --- | --- | --- | --- |
| A fold with a radius: a panel grown by *Fold* with *Radius* above 0 | A band between the parent's edge and the child's edge | The fold connection (a wider fold strip) | New: gives plywood a fold (a living-hinge lid, a flex spine) |
| A tray corner made a fold (milestone 35 `hingeOf`), with a radius | The same | The corner connection | New |
| A rounded corner of a tray | A wing on the wall before the corner, joined to the wall after it | The wall panel (its outline includes the wing) | A separate "curved wall" panel plus two in-line seams |
| A round base (circle, oval, stadium) | One wall on the seam flat (or on each straight side), with wings round the curves | The wall panel | One closed bent panel |
| An arched lid | A wing on the lid's flat landing strip, guided by the end wall's arched top | The lid panel | A bent panel grown on a wall's top run |

So a rounded-rectangle tray is 5 panels (a base and 4 walls), the same as a square one. A plywood one is 2 pieces: the base, and one strip of 4 walls and 4 hinge zones closed by one key.

### 4.3 Geometry

**A fold with a radius** (`Connection.radius`, inner radius r, in mm; absent or 0 is today's crease):
- Developed length of the band: `θ · (r + k·t)`, where θ is the turn (180° − the connection's `angle`), t the thickness and k the material's neutral-line factor (`BendLimits.k`).
- In the flat net this replaces `foldAllowance` in `foldXform` and in the fold strip that `groupPieces` draws. With r = 0 the strip and its single score are unchanged, so every golden export stays byte-identical.
- In 3D the child's frame starts where the arc ends: the parent's edge is the first tangent line, the child's edge 0 the second.

**A wing** follows a **run**: the stretch of the base's outline between two walled straight edges. A run can hold arcs, flattened curves and straight bits too short for a wall (under `MIN_EDGE`). It must be smooth: no corner sharper than 2° inside it, and it must leave the owner wall's edge tangentially.
- The wing starts as the owner wall ends: same height, same distance in from the base's outline, same bottom level. They are in line by construction, whatever joint the wall has with the base.
- Its developed length is measured at the neutral line: the outline's length less `(inset + (1 − k)·t)` times the turn, summed along the run. This is the parked branch's `bendAlong` arithmetic, kept.
- Derived on every solve: `Panel.wings = { s?: { len, run }, e?: { len, run } }`. `straightRing` (`src/model/edges.ts`) moves the wall's end corners out by the wing lengths, as it already does for `Panel.ext`. Inserted outline points keep their place: their fractions are taken on the wall without its wings.
- Shapes sit on a wing like anywhere else on the wall, because the wing is inside the wall's own outline. Their x is simply below 0 or above `w`.

**In 3D** a band is a chain of flat facets (at most 5° of turn or 0.1 mm of sag each, as before).
- `panelToWorld(p, x, y, z)` and `panelToLocal(p, world)` map through the flat part or a wing's facets. They are the only two functions that know about facets.
- The mesh is made by **warping, not re-clipping**: triangulate the panel's flat outline once (as today), split the triangles in a wing's range along the facet lines, then move every vertex through `panelToWorld`. The parked branch sliced the outline polygon at every facet instead.
- The fold view scales each facet's turn, so the slider unrolls bands with the net.

### 4.4 How a wing's far end joins the next wall

The corner connection between the owner wall A and the next wall B carries the choice (`kind`), like any corner seam:

| Kind | What is cut | Offered for |
| --- | --- | --- |
| `fold` ("one piece") | Nothing: B continues A in the flat net (`netFolds` places B in line after A's wing, with no allowance and no score) | Every material, when the run meets B tangentially |
| `glue` (lip) | A glue lip past the wing's end, lying on B's inner face | Card, corrugated; any end angle |
| `key` | A puzzle key on the wing's end, its socket in B's start | Plywood; tangential ends |
| `tabslot` | Tabs on the wing's end through slots in B's face | Later (§12, decision 6): only where the end meets B's face squarely |
| `butt` | Plain edges | Always |

Defaults:
- **Plywood:** `fold` all round, so the walls are one strip. A closed strip needs one break: the join nearest the back left becomes `key`. The student can move it (*Closing seam at*, per tray). A strip longer than the sheet gets more `key` joins, at the wing ends nearest to equal parts.
- **Card and corrugated, walls folded from the base:** the wing rides on A and is glued to B with a lip. At a convex corner this never overlaps in the flat net: unfolded, A's wing lies outside A's own edge line, and B lies outside B's. Inside (reflex) rounded corners go through `fixFlatNets` as square ones do.
- A choice that cannot be made (a `fold` that would overlap, a `key` on a strip too low for one) falls back as joints do today (`pref` is kept and returns when it can).

### 4.5 What holds the base under a wing

At a rounded corner the straight walls already hold the base, so the default under a corner wing is **nothing**: the base's rounded corner sits against the wing. Where the wing's material would overlap the base (finger-jointed walls stand flush with the base's edge), the base is cut back there, as `wrap` did.

On a round base nearly the whole wall is wing, so it needs a joint. `Tray.curveKind`, by material:
- **Card:** glue teeth folded in onto the base. When the wall folds from the base (the seam flat), a tooth is shortened where it would lie on the base in the flat net. This is one ray against the base's outline per tooth, with no polygon clipping.
- **Corrugated:** tabs in slots that follow the curve.
- **Plywood:** the wall wraps the base and is glued to its edge; or tabs in curved slots where the hinge pattern leaves room (§5.3).

These three generators are the parked branch's `bentGeom` cases, kept.

### 4.6 Stability rules

1. **Rounding never makes or removes a panel.** Walls belong to straight edges, wings to walls. A wing's connection is keyed by its two walls.
2. **A walled straight edge keeps at least 5 mm** (`MIN_EDGE`). The corner radius is clamped to leave it, and the card says so (*Largest: 27.5 mm; the wall between needs 5 mm*). A true stadium or circle is a round base (§6.2), not a rectangle rounded to its limit.
3. **Solving twice changes nothing**, and a design opened from its file solves to itself. Fuzzed (§11).
4. **A radius or size sweep is reversible:** going from A to B and back gives the same design, ids included. Tested (§11).
5. **The app never re-plans silently.** Where a strip is keyed, which wall a wing rides on and how a dieline is split are stored choices with stated defaults. They change only when the student changes them or the old choice becomes impossible, and then a note says so.

### 4.7 Speed rules

1. **No polygon clipping in `solve` for bends.** Wing lengths, in-line joins and tooth trimming are closed-form or a ray test.
2. **Heavy derived data stays out of the design.** Facets, pattern lines and closure flaps are computed by `derive(design)`, memoised in a `WeakMap` on the design object. Designs are immutable once they leave the store's `produce`, so this is safe, and none of it runs through Immer's proxies. `solve` writes only small numbers (`Panel.wings` lengths).
3. **A per-panel index of joint geometry**, built once per design, replaces `panelExtras` and `panelNotches` scanning every connection for every panel.
4. **Budgets, enforced by tests:** `solve` on a rounded tray takes at most 2× the same tray with square corners; a round box with 4 dividers at most 3×. The measured ratio on the parked branch was 11×.

## 5. Bend patterns

### 5.1 The catalogue

A pattern is an entry in a registry (`src/model/bendPatterns.ts`): which materials it suits, the tightest radius it reaches, the band height it needs, and a function that draws its lines in band coordinates (s along the bend, y across).

| Pattern | Material | Lines | Notes |
| --- | --- | --- | --- |
| Smooth | all | none | Only down to the material's own radius. Corrugated: only with flutes along the bend axis. |
| Scored | card | score lines across | The multi-crease radius corner of premium cartons. |
| Perforated | card, corrugated | short cut dashes | Tighter than scores; weaker. |
| Kiss-scored | corrugated | scores in the inner liner only | Bends one way. The face-up rule and the mirrored file with *THIS SIDE UP* stay as built before. |
| Straight slits | plywood | staggered straight cuts | The standard living hinge. The default. |
| Wave slits | plywood | staggered S-shaped cuts | Spreads the stress; needs a wider spacing. |
| Diamonds | plywood | staggered lens-shaped holes | Loosest and lightest; least stiff. |

*Automatic* picks the first pattern in the material's order that reaches the band's tightest radius, and patterns only the zones that need it. Two-way patterns (cross, honeycomb) are left out: a band bends one way.

### 5.2 Density is calculated, never typed

- **Line patterns** (scored, kiss, perforated): each line lets the band turn by `φ = pitch / reach` (the material's calibrated pair). The spacing at a point is `R · φ`, held between half and twice the material's pitch. Tighter curve, closer lines. This is the rule built before.
- **Slit patterns:** the links between two slit columns twist. A link of free length ℓ and thinner side c twists safely by `C · ℓ / c`, where C is the material's allowed shear strain (`BendLimits.strain`). Setting that equal to the turn one column must take (`p / R` at spacing p):
  - `p = sqrt(C · ℓ · R)` while p ≤ t, else `p = C · ℓ · R / t`.
  - ℓ comes from the pattern and the band's height: a straight slit of length S with bridges b gives `ℓ = (S − b) / 2`; S is as long as the height allows, up to 24 mm.
  - Starting value: C = 0.016 for 3 mm plywood. It reproduces the earlier default (2 mm spacing at R 30 with 20 mm slits). Calibrate with the bend test.
- The student may only ask for *looser* (a larger spacing cap) or leave it automatic. The card shows the result: *Spacing 1.8–2.4 mm, 26 lines*.

### 5.3 When a pattern is unavailable

The picker lists every pattern for the material. One that cannot work is greyed with its reason and, where there is one, a fix:

| Reason | Example line | Fix offered |
| --- | --- | --- |
| Radius too tight for it | *Needs a radius of 18 mm or more here* | *Set radius to 18* |
| Band too low for its links | *Needs a wall at least 22 mm high* | — |
| A joint needs solid material there | *The tabs under this corner leave no room* | *Glue this corner instead* |
| A shape is in the bend | *The window is in the way* | *Move the shape* (when the wall has a straight stretch) |
| The strip bends both ways | *Kiss scores bend one way only* | *Automatic* |
| Flutes run the wrong way | *Flutes must run up the wall to bend it* | *Turn the piece on the sheet* |
| Not for this material | *Slits are for plywood* | — |

The export check uses the same reasons (`val.bendTight`, `val.bendStyle`, `val.bendShape`, `val.bendJoint`, `val.kissTwoWay`, `val.fluteBend`), each with its *Fix*.

### 5.4 Limits and calibration

`MaterialProfile.bend` (`BendLimits`): `smoothR`, `patternR`, `pitch`, `k`, and new `strain`. Defaults per kind as before; editable in the material drawer. *Download a bend test* stays: a strip with five quarter-turn zones from 0.7 to 1.6 times the material's limit, labelled, in the material's default pattern or the one selected.

Every cut pattern keeps a bridge of solid material from the band's edges, its ends, holes and joints, and a solid land at each end of a band where a key or lip attaches.

## 6. Round outlines, dividers and lids (rebuilt)

### 6.1 Dividers that find their own ends (old milestone 44)

Same behaviour as built and documented in the parked branch's `DIVIDERS_PLAN.md`; that document is copied in when the milestone starts. The model is kept because it is sound: a divider is a standing board with `Panel.divider = { at, rot, reach }`, and `reconcileDividers` finds each end.

Changes:
- **Footprints come from one function** that also returns a wing's facets, so a divider can end on a curved wall without a second code path. The joint there is the ordinary edge-on-face joint, run on a flat view of the wall at that facet.
- The 30° floor, the grid snapping, the *Divider* tool, the card's ‹ › end steps and the schema migration of old dividers are as before.
- The two limitations listed before are fixed in the rebuild: a line ending exactly in a corner stops at the corner's inner point, and a divider turned below 30° is refused at the turn, not left unjoined.

### 6.2 Round outlines (old milestone 45)

As before: `curve: 'round'` with a radius on a sketch point; round bases (`Sketch.round`: circle, four-centre oval, stadium); the polygon tool's *Round* and *Rounded* modes; arcs given back at export; kerf compensation following tangent arcs; bend limits on materials.

Changes:
- **The radius clamp** of §4.6 rule 2.
- **A seam flat** on circles and ovals once they are walled: `RoundShape.seam = { at, w }` (where on the outline, how wide). The flat is a real straight edge `seam` in the ring, so a wall grows on it with every existing joint. Width by material: 12 mm card, 16 mm corrugated, 20 mm plywood (room for the key). The outline shows it, honestly: a 20 mm flat on an 80 mm circle is 1.25 mm inside the true circle.
- `src/geom/arcfit.ts` is written to be **byte-identical to the parked branch's**, because the waffle branch carries a copy and must merge without a conflict.
- The fillet arithmetic goes in `src/geom/fillet.ts`, so the waffle branch's `src/sculpt/round.ts` can be folded into it when both land.
- A closed outline with no straight edge and no seam flat (every point a curve) is not walled; the tray card says what it needs (*Add one straight edge of 12 mm*).

### 6.3 Lids, matched walls, arches (old milestones 46 and 48)

- **Telescoping lid** (`Tray.lidOf`): as before. A shallow tray on the box's outline grown by the wall thickness and the clearance.
- **Matched walls** (`WallSketch.match`): as before. A follower takes its leader's top profile; an edit on either edits the shared profile.
- **Arched lid:** the lid is a panel with a narrow flat landing strip on one side wall's top and a wing over the arch, guided by the end wall's arched top (`WallSketch.arch`), with glue teeth onto both end walls. Card and corrugated fold the landing strip from the side wall; plywood rests it on top, glued. This is the last milestone because it is the only wing not at a wall's side edge.

## 7. Openings and closures: closing lips

### 7.1 Terms

- **Opening:** a mouth of the design: the rim of a tray, or an end of a tube of walls.
- **Closure:** how an opening is closed. It is a record (`Design.closures`) so its card shows it as one thing, as a tray's does.

### 7.2 What the student does

1. **Grow a panel from a rim edge** (Workshop's grow, or Quick build's *Wall / lid*). The height arrow already snaps to the opposite wall (`heightTargets`). New: while the ghost would seal the opening, its label reads *Closes the box: tuck flap*, and the lip is drawn on the ghost. The snap lands the panel's edge where that closure needs it (for a tuck: the opposite wall's inner face, less the clearance).
2. **✓ makes the panel and its closure.** A **complete seal is the trigger**: the panel is hinged by a fold or a bend, and each of its other edges meets a wall's top edge or inner face. Then `autoConnect` makes a closure where it would have made plain corner joints.
3. **Resize later:** the closure follows. Pulled short of sealing, it is removed (as automatic joints are); back at the snap, it returns with its settings.
4. **Mark the closing edge:** with the lid selected, each free edge has a small tag in *How it's built*: *Lip*, *Dust flap*, *Rests*, *Glued*. Clicking one changes that edge. *Closing edge* on the lid's card moves the lip to another edge.
5. **Any free edge** of a card or corrugated panel can take a plain **edge flap** (*Add a flap*): a lip with a score, a length and rounded or tapered corners. It holds nothing by itself; it is what a student uses for a hang tab or a hand-made lock.

### 7.3 Closure styles

| Style | Lid's far edge | Side edges | Material |
| --- | --- | --- | --- |
| **Tuck** (default for card) | A lip that tucks inside the opposite wall, held by friction | Dust flaps on the side walls, folded in under the lid | Card, corrugated 1.6 |
| **Tuck with slit locks** | The same, with a short slit at each end of the lip's score that catches the dust flaps' shoulders | Dust flaps with shoulders | Card |
| **Tab lock** (default for corrugated) | A lip with a tongue through a slot in the opposite wall | Dust flaps, or side lips | Corrugated, card |
| **Rests** | Plain edge on the walls' tops | Plain | All; the default for plywood |
| **Glued** | A glue flap (today's corner joint) | Glue flaps | Card, corrugated |

Starting proportions, to calibrate on scrap and adjust on the card:
- Lip length: 30% of the lid's depth, between 12 and 22 mm. Lip width: the opening less `2 · (t + 0.5)`. Corners rounded 4 mm.
- The lid is set back by `t + clearance` from the opposite wall's inner face, so the lip slides in.
- Dust flaps: half the box's width at most, tapered 15° on the hinge side, relieved on the lip side so the lip passes.
- *Thumb notch* (a tick): a half-round cut, 9 mm radius, in the top of the opposite wall.

### 7.4 How it is built

- A closure's geometry is derived like a fold-over's (`src/model/foldover.ts` is the pattern): additions and scores on the lid and the walls in their own flat coordinates, slots in the receiving wall, and folded flaps for 3D. It reaches nets, the cut plan, 3D and the fold view through the same channel (`panelExtras`), so none of those change.
- The tuck lip reuses the corner glue flap's fit (`cornerGlue` in `src/model/seams.ts`): same place, inner face, unglued, different outline.
- `Closure = { id, style, lid, hinge, edges: { edge, role: 'lip' | 'dust' | 'rest' | 'glue' }[], lip?, lock?, thumb? }`. Roles are stored, so a student's change survives a resize.
- Plywood lids do not fold, so a plywood panel that seals an opening gets *Rests* (or its finger joints, when it was grown with them). With a living-hinge fold (§4.2) a plywood lid is hinged, and gets *Rests* plus the hinge.

## 8. Slit-lock joint, open-base trays, snap-lock bottom

### 8.1 Slit-lock joint (card and corrugated)

A new joint kind, `lock`, offered wherever a glue flap is: tray corners, a flap on a face, a wall cut as its own piece.
- The flap lies on the other panel's inner face, as a glue flap does. At its end, one or two **tongues** pass out through **slits** in that panel. A tongue has a neck as wide as the slit and a head 2–3 mm wider each side, rounded, so it flexes through and stays.
- The slit is a single cut line on card (the kerf is the gap), a slot `t + clearance` wide on corrugated, with a small round relief at each end so it does not tear.
- It reuses the glue flap's fit and outline code; the new geometry is the tongue and the slit.
- Where an edge meets a face square on (a divider's end), the existing self-locking tab (`tabLen: 'snap'`) is already this joint. The UI names both *Slit lock (no glue)*.
- Design-wide: *Joints → Corners → Slit lock* sets it for every corner, so a whole card tray goes glue-free in one choice.

### 8.2 Open-base trays: tubes

A carton is a tube of walls with no base panel. `Tray.base: 'cut' | 'open'`:
- `open`: the base panel is a footprint only. It positions the walls and is drawn faintly, but is never cut or joined.
- The walls then fold off each other, not off the base. This is milestone 35's hinged corner (`hingeOf`), used for every corner but one; that one is the glue seam (the manufacturer's joint), by default at the back left.
- Both ends of the tube are openings.

### 8.3 End closures on a tube

`Tray.top` and `Tray.bottom` name a closure style for each end; the tray reconciles them like its walls.

| Style | What it is | Glue |
| --- | --- | --- |
| **Tuck end** | A lid panel from the back wall with a tuck closure (§7.3) | none |
| **Snap-lock bottom** (1-2-3) | Four shaped flaps: the back flap folds in first, the two side flaps hook over it, the front flap's tongue locks under them | none |
| **Seal end** | Four plain flaps, the two long ones meeting at the middle | glue or tape |
| **Open** | Nothing (a sleeve) | — |

With these a student can make the main carton families from one footprint and a height: straight tuck, reverse tuck (top lid from the back wall, bottom lid from the front), tuck top with snap-lock bottom, seal end, sleeve, and today's tray.

**The snap-lock bottom is one closure, not four panels.** Its flaps overlap in layers and have fixed proportions, so they are derived geometry on the four walls' bottom edges (again like a fold-over), drawn folded in 3D and flat in the net. Rectangular openings only. Its proportions are set by a **spike before the milestone**: cut three sizes (60 × 40, 100 × 70, 150 × 100 mm) in card and in corrugated 1.6, and adjust until each locks by hand and holds 500 g. The proportions and their limits (smallest size, the range of width to depth) are then written into `DECISIONS.md`.

Crash-lock (pre-glued) bottoms need diagonal creases and gluing in the flat; later (§14).

## 9. Dielines: splitting and nesting

### 9.1 Splitting a net into pieces

A net is the set of panels joined by folds; today it is always cut as one piece, except where `fixFlatNets` cuts a tray wall off (`TrayFix: 'own'`).

- **Where a net may be cut:** at any fold, except a closure's hinge and inside a band. The cut fold becomes the joint a wall cut as its own piece already gets (`ownKind`: a glue flap on card, tabs on corrugated, or the slit lock when that is the design's choice).
- **A panel longer than the sheet** with no fold to cut is split across with a puzzle key (plywood) or a glued lap (card, corrugated), at the place that balances the parts.
- **The planner** scores a set of cuts by: sheets used; then the sheet area the layout occupies; then the number of cuts (each is assembly work). It searches cut sets with a beam search over the net's folds, placing each candidate with the packer.
- **Settings** (`Design.split`), in *Material & sheet*:
  - *Only when it must* (default): a net that does not fit the sheet is split so that it does. Today this is only reported.
  - *To save material*: the planner runs when the student presses **Save material**, and shows what it found before changing anything: *3 pieces, not 1. 1 sheet, not 2. 2 more glue joints.* **Apply** stores the cuts; one undo step.
  - *Never*.
- Each fold has *Keep whole* and *Cut here* in *How it's built* (`Connection.cut`), which the planner obeys.
- Cuts are stored, never re-planned behind the student's back (§4.6 rule 5). When the design changes so that a stored cut no longer helps, the sheet meter offers *Save material* again.

### 9.2 Nesting by true shape

Today's packer places bounding boxes (`src/model/pack.ts`). A cross-shaped net wastes most of its box.
- **Raster nesting:** each piece becomes a 1 mm bitmap (grown by half the spacing), tried at 0° and 180°, and at 90° and 270° when the material has no grain or the student allowed turning. Bottom-left placement, largest piece first. Pieces are never mirrored: scores and engraving belong to one face.
- Runs in a Web Worker, on demand (*Repack*, *Save material*, export), with the bounding-box packer as the instant first answer. Manual placements are kept as they are today.
- **Copies** of one piece are tried as an interlocked pair (the second turned 180°) before being placed one by one.

### 9.3 The yield report

Next to the sheet meter: sheets, percent of sheet used, total cut length, number of pieces, number of glue joints. The same numbers go with a class submission. They are what a packaging designer quotes from.

## 10. Milestones

Each is shippable on its own. Every milestone ends as the others in `PROGRESS.md` do: unit suite, typecheck, golden exports (byte-identical unless the change is intended and listed), the app's browser suite, English and Hebrew strings, `README.md` and `DECISIONS.md` updated.

| # | Milestone | Done when |
| --- | --- | --- |
| **61** | **Foundations.** `derive(design)` memoised outside Immer; the per-panel index of joint geometry; fold strips drawn by one function (`foldBand`) with no change in output; the speed and stability harness of §11. | Golden exports byte-identical. `solve` on the organiser template is no slower. The harness runs on `main`'s features. |
| **62** | **Round outlines.** §6.2: rounded corners with the clamp, round bases, the polygon tool's modes, arcs at export, bend limits and their drawer fields. No walls on curves yet. | The old `round.test.ts` cases pass, plus the clamp and a radius sweep that returns to its start. |
| **63** | **Folds with a radius, and the pattern engine.** `Connection.radius` on grown folds and hinged corners; band length, 3D band, fold view; patterns *Smooth*, *Scored*, *Straight slits* with automatic density; the *Bend* card; the bend test. | A plywood lid hinged on a living hinge to its box is one piece with it, opens in the fold view and exports clean. A card fold at radius 8 has scores at the calculated spacing. Goldens for both. |
| **64** | **Curved tray walls.** Wings on rounded corners; the end joins `fold`, `glue`, `key`; the base cut back under a wing; strips keyed for the sheet; *Closing seam at*; Quick build's *Rounded* box. | Card rounded tray: 5 panels, 1 piece, lies flat. Plywood: 2 pieces. The speed budget of §4.7 holds. The radius sweep of §1 ends where it began. |
| **65** | **Round boxes.** The seam flat; walls on circles, ovals and stadiums; teeth, curved tab slots and wrap under a wing; shapes, text and picking on wings; Quick build's *Round* box with its radius guard. | A circle box in each material: one wall panel, joined to its base, closed at the seam flat, export check clean. A rectangle drawn on the curved wall lands where it was drawn. |
| **66** | **Pattern library.** *Perforated*, *Kiss-scored* with its face rule, *Wave slits*, *Diamonds*; the picker with greyed reasons; the bend checks and their fixes. | Each pattern has a golden. Every reason in §5.3 is produced by a test and cleared by its fix. |
| **67** | **Closures.** §7: sealing detection and snapping, the closure record, *Tuck*, *Tuck with slit locks*, *Tab lock*, *Rests*, *Glued*, dust flaps, the thumb notch, edge tags, plain edge flaps. | Growing a lid to the snap makes a tuck closure in one ✓; pulling it short removes it; pushing it back restores it with its settings. A card tuck box exports clean and lies flat. |
| **68** | **Glue-free joints and cartons.** §8: the slit-lock joint; open-base trays; tuck ends, seal ends and, after its spike, the snap-lock bottom. Quick build's *Box* gets *Bottom: flat base, snap-lock, tuck*. | A card tray with slit-lock corners has no glue flap. A reverse-tuck carton and a tuck-top snap-bottom carton are each one piece with one glue seam. The three spike sizes lock by hand. |
| **69** | **Splitting and nesting.** §9: split when it must, *Save material*, per-fold pins, true-shape nesting in a Worker, the yield report. | A tray too large for its sheet is cut into pieces that fit, with joints. On a set of 20 saved designs, nesting never uses more sheets than today's packer, and fewer on at least a quarter of them. |
| **70** | **Dividers that find their own ends.** §6.1, including ends on curved walls. | The old `dividerEnds.test.ts` cases pass; a divider across a round box is joined at both ends. |
| **71** | **Lids.** §6.3: telescoping lid, matched walls, arched lid. | The old lid, matched-wall and arch cases pass on the new model. |
| **72** | **Final verification** in the usual form: everything re-run, `PROGRESS.md` complete, limitations listed, what needs the owner (real cuts, Safari, a Chromebook) listed. | — |

Order: 61 → 62 → 63 → 64 is fixed. After 64 the rest are independent, apart from 66 after 65, and 68 after 67. If time is short, 67–69 (closures, cartons, splitting) come before 70–71.

## 11. Tests to add

**The harness (milestone 61), run by every later milestone:**
- **Idempotence fuzz:** seeded random designs; `solve(solve(d))` equals `solve(d)`, and a design saved and re-opened solves to itself.
- **Sweep and return:** for each numeric setting a card can change (radius, height, size, lip length), sweep it up and back; the design, ids included, equals the start.
- **Identity:** no edit other than a delete removes a panel that has shapes on it.
- **Speed budgets** as ratios against a plain design built in the same test, so they hold on any machine.
- **Nets lie flat** and **exports are watertight** (closed outlines, no zero-area rings) for every fuzzed design.

**Per feature:**
- `bands.test.ts`: developed lengths against closed forms (a quarter turn at radius r); the wing's outer face on the base's offset curve at every facet; `panelToLocal` inverts `panelToWorld`.
- `bendPatterns.test.ts`: spacing from the formulas of §5.2; bridges kept from edges, holes and joints; availability reasons.
- `closures.test.ts`: sealing detection (each edge role), the lip inside the wall by the clearance, dust flaps clear of the lip, roles kept across a resize.
- `cartons.test.ts`: each end style on an open-base tray; one piece and one glue seam; flat nets.
- `split.test.ts`: every part fits the sheet; pins obeyed; the reported gain equals the measured one.
- `nest.test.ts`: no overlap at the spacing; grain rule; never worse than the bounding-box packer.
- Goldens: one per pattern, per closure style, per carton family.
- Browser specs: one per milestone, on the path a student takes.

The parked branch's test files (`dividerEnds`, `round`, `bentWalls`, `bendPattern`, `strips`, `matchedWalls`) are the checklist of behaviours to keep. They are rewritten against the new model, not copied: most assert on bent panels that no longer exist.

## 12. Decisions still open (defaults; change them here before work starts)

| # | Topic | Default |
| --- | --- | --- |
| 1 | Seam flat on circles and ovals | **Yes**, 12 / 16 / 20 mm by material. The alternative is a truly round wall with no flat part, which brings back the many-framed panel of §1. |
| 2 | Largest corner radius on a walled edge | **Leaves 5 mm of wall.** |
| 3 | Joint under a corner wing | **None** (the straight walls hold the base). |
| 4 | Plywood strip closure | **Puzzle key** at the back left. |
| 5 | Default hinge pattern | **Straight slits.** |
| 6 | Tabs on a wing's end into a square-on face | **Later.** Glue lip, key and one piece cover the rounded and round boxes. |
| 7 | Default closure when a lid seals | **Tuck** on card, **Tab lock** on corrugated, **Rests** on plywood. |
| 8 | Closures in Quick build | **Yes**, automatic, with the style on the lid's card. |
| 9 | Dieline splitting | **Only when it must**, automatically; *Save material* on request. |
| 10 | Nesting | **True shape, on demand**, in a Worker. |
| 11 | Old files | Nothing to migrate from the parked branch (its schema 10–14 never reached `main`). New fields are optional; the schema number goes up once, at milestone 70, for the divider migration. |
| 12 | Names in the UI | *Bend*, *Living hinge* (plywood), *Closing lip*, *Dust flap*, *Slit lock*, *Snap-lock bottom*, *Save material*. Hebrew to be reviewed by a native speaker. |

## 13. Risks

1. **Wings in planar code.** A wall's outline now reaches past its flat part, and planar checks (contact, seams, snapping) must use only the flat part. Guard: those functions take the outline from one helper that clips to `[0, w]`; the harness fuzzes rounded and round boxes through every check.
2. **The seam flat is visible.** A circle that is not quite a circle. If it reads badly, narrow it for card (8 mm is enough for a lip).
3. **The slit formula is a model.** Real plywood varies by batch and grain. The bend test, and `strain` as an editable number, are the answer; the defaults must be cut once on the school's material.
4. **Snap-lock proportions.** Not derivable from first principles; hence the spike with real cuts before the milestone. If it cannot be made reliable, ship tuck and seal ends and leave the snap-lock listed as later.
5. **Sealing detection that surprises.** A panel that happens to cover an opening gets lips. Guard: only panels hinged by a fold or bend, only when every free edge meets a wall, and the ghost says what it will make before ✓.
6. **Nesting time.** A raster search on a Chromebook can take seconds. It is on demand, in a Worker, with the old packer as the instant answer.
7. **Merging with the waffle branch.** `arcfit.ts` identical; the fillet code shared (§6.2); no schema clash (the waffle adds none).
8. **Size.** Twelve milestones. 61–64 alone fix what was reported about the parked branch; each later one stands alone.

## 14. Beyond this plan: towards a packaging designer

What would still be missing after milestone 72, in the order it would matter to someone designing real packaging quickly.

1. **Start from the product.** Enter what is being packed (size, weight, how many, how much room around it) and get a right-sized box in a chosen style. *What goes inside* already checks fit; this turns it round.
2. **Dimension intent.** State a size as *inside*, *outside* or *crease to crease*, per design, and let thickness corrections follow. Templates do this by hand today (`PRESETS_PLAN.md` §3.5).
3. **A style catalogue** on the preset kit of `PRESETS_PLAN.md`: tuck-end cartons, snap-bottom cartons, mailers, sleeves, telescoping boxes, trays, partitions. Each labelled with its trade name and standard code (FEFCO for corrugated, ECMA for cartons; check each code against the current code book before it is shown). Milestone 68 provides the mechanisms; the catalogue is recipes.
4. **Board grades.** A material library by trade grade: folding boxboard and greyboard by caliper, corrugated by flute (E, B, C, micro-flute), each with its fold allowance, bend limits and grain rule.
5. **Print.** `IMAGES_ON_BOARDS.md` covers pictures on boards. For packaging add: the dieline exported as an artwork template (cut and crease on named spot colours, bleed, safe zone, glue areas kept clear), and artwork brought back in and shown on the folded 3D box.
6. **Trade file formats.** PDF with spot-colour line types for printers; DXF with the layer names die makers and sample tables expect; CF2 if a die maker asks for it.
7. **Holding tabs** (nicks): tiny uncut bridges so card parts stay in the sheet during cutting, placed automatically, off by default.
8. **Cost and time.** From the yield report: board cost per unit at a sheet price, cut time from cut length and machine speed, for one and for a run.
9. **Strength hints.** For corrugated, an estimate of stacking strength from board grade and perimeter (the McKee formula), and a warning when flutes run the wrong way for the load.
10. **Fitted inserts.** Partitions exist (dividers with half-laps). Add an insert whose cut-outs are generated from the product's outline.
11. **Share and approve.** A link to a read-only 3D view that folds and unfolds, with sizes, for a client or teacher to approve before anything is cut.
12. **More closures.** Crash-lock bottoms, tear strips (a perforated zipper), hang tabs, magnets and ribbon pulls for rigid boxes.

Two changes to the engine would pay for themselves across all of these:
- **One registry of edge features.** Fold-overs, closure flaps, lips, glue flaps, lock tongues and bands are all "extra material and lines on an edge, derived from a few stored choices". One interface (`applies`, `geom`, its card's fields) makes the next closure a file, not a change in six places. Milestones 63, 67 and 68 are written towards it.
- **Derived data outside the design**, begun in milestone 61, finished for joint geometry and frames. `solve` then runs outside Immer, and can move to a Worker.

## 15. Relation to other branches and plans

| Branch or plan | Relation |
| --- | --- |
| `claude/charming-einstein-lqhfxq`, `focused-bardeen-5g87jl`, `gifted-lamport-uwf70b` (old 44–48) | **Superseded by this plan.** Keep them until milestone 71 as the reference for behaviour and tests, then delete. |
| `claude/waffle-mode` (49–60, built) | Independent. Merge either first. `arcfit.ts` must stay identical; fold `src/sculpt/round.ts` into `src/geom/fillet.ts` when both are in. |
| `PRESETS_PLAN.md` (plan) | Builds on this plan's dividers (70), round bases (65) and closures (67–68): its pen cup, hinged lid and double walls. Renumber it after 72. Its *little house*, *mailer* and *drawer* become much smaller once closures and open-base trays exist. |
| `IMAGES_ON_BOARDS.md` (plan) | Independent. Its *spread onto neighbours* should treat a wall and its wings as one surface. Renumber it. |

## References in the code

| For | Read |
| --- | --- |
| Walls that reach past their edge | `Panel.ext`, `straightRing` in `src/model/edges.ts`, `insideCornerExtensions` in `src/model/trays.ts` |
| Folds in nets, hinged corners | `netFolds`, `cornerFoldXform`, `groupPieces` in `src/model/pieces.ts`; `fixKind` in `src/model/flatnet.ts` |
| Edge features | `src/model/foldover.ts`, `panelExtras` in `src/model/geometry.ts` |
| Corner flaps and self-locking tabs | `cornerGlue`, `snapTab`, `tabLocks` in `src/model/seams.ts` |
| Lid snapping | `heightTargets` in `src/model/adapt.ts`; `autoConnect` in `src/model/ops.ts` |
| Walls cut as their own piece | `ownKind`, `fixFlatNets`, `Tray.pin` in `src/model/flatnet.ts` |
| Packing | `src/model/pack.ts` |
| Band arithmetic and joint generators to keep | `bendAlong`, `bentGeom`, `panelToWorld`, `unbendPanel` in the parked branch's `src/model/bent.ts`; `bendPattern.ts`; `keyDims`, `keyAdd`, `keySocket`, `splitCut` in its `strips.ts` |
