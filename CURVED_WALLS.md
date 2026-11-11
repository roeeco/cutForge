# Curved walls: feasibility study and plan (milestones 45–48)

Can CutForge stand walls on curved outlines (round boxes, rounded corners, ovals, S-curves)? It would use creases, perforations and living hinges where the material needs them. The current approach must stay: simple actions, and everything adjustable after it is made.

**Verdict: doable in the current architecture.** It's a bounded extension, not a rewrite.
- The flat side (sketch → outline → joints → export, packing, validation) needs almost nothing new.
- The 3D side needs one new idea: a **bent panel** placed by a chain of planar **facets**. The existing planar algorithms then run once per facet.
- One physical rule changes the joints: a wall can **never fold up from a curved base edge** (§2.1).
- Plywood bends only with a living hinge, and 4 mm corrugated only at large radii (§2.2).

Planned as four milestones (§8), each shippable on its own. Defaults are listed in §9 so the owner can change them before work starts.
- **Milestone 44 comes first:** the new divider model (`DIVIDERS_PLAN.md`). Dividers in round boxes need it, and it doesn't depend on anything here.
- **Round and oval boxes** are worked through in §6, **matched walls and arched lids** in §7.

---

## 1. What exists today

| Piece | Where | State |
| --- | --- | --- |
| Curved outline points (`curve: 'auto'`) on base vertices and wall top points | `types.ts` `CurveKind`, `edges.ts` `curveRing` | Cubic through the point, flattened at 0.02 mm into edges keyed `<edge>~<n>` |
| Curves are never growable, walled or joined | `isCurveKey` in `trays.ts`, `adapt.ts`, `seams.ts` (`seamsBetween`), `View3D.tsx` | A tray on a curved base leaves the curve open; `curveBlocked` refuses a curve next to a joined edge |
| Curves in Quick build | `easy/features.ts` `curves: 'hide'` | Hidden |
| Panel placement | `Frame` (`o,u,v,side`); `frame.ts` `toWorld`/`toLocal`; `three-geom.ts` extrudes the flat outline once | **Every panel is one rigid plane.** 29 files read frames, mostly `View3D`, `seams`, `adapt`, `ops`, `snap` |
| Running joints per sub-range and merging | wall sets `<wall>~n` (`ops.ts` `reconcileWallSets`); `connectionGeom` per edge piece; `mergeGeoms` | Ready to reuse for facets |
| Laying walls flat in line with a neighbour | milestone 35: `cornerFoldXform`, `fixFlatNets`, `Tray.pin`, `fixPlan.hinge` | Ready to reuse for tangent joins and for "cut it as its own piece" |
| Fold display | `foldView.ts`: rotation about a hinge line, scaled by `foldT` | Extends to "unbend" by scaling each facet's turn |
| Joint fallback with a reason | `fitKind` + `pref`; `seamKinds`, `connectionsFor` | A curved edge just removes `fold` from the allowed list, and the card says why |
| Flute and grain | `MaterialProfile.grain` (corrugated `'y'`: flutes along sheet y; plywood `'x'`); `val.flute` check; packer keeps rotation off | Reused for "flutes must run up the wall" |
| Score / perforation / hinge output | Layers: `cut`, `score`, `engrave`, `guide` (`export/layers.ts`) | No perforation layer; a hinge is just cut lines |

The original brief listed living hinges as out of scope (`laser-fabrication-editor-agent-prompt.md`). This plan brings them in.

## 2. Physical constraints

### 2.1 A curved crease cannot fold if one side stays flat
- **The rule.** Fold paper along a curve and the crease's osculating plane bisects the angle between the two sides (Fuchs & Tabachnikov, *More on paperfolding*). The base stays flat and the crease lies in its plane, so the fold angle must be 0.
- **Consequence:** a wall cannot fold up from a curved base edge in one piece, in any material.
- **What holds a curved wall to its base instead:**
  - **Glue teeth** (card, corrugated): a row of narrow flaps on the wall's bottom, scored, folded under and glued to the base. The teeth are tapered so they don't overlap when they fan around a convex curve. This is the classic round paper box.
  - **Tabs in slots** (corrugated, plywood): short tabs in the wall's bottom, through slots that follow the curve in the base. A tab ≤ ~3t wide bends with the wall. The slot is the tab's footprint along the curve plus clearance.
  - **Wrap / glue edge** (all): the base sits inside the wall; the wall's inner face is glued to the base's edge. This is the plywood default, as in most kerf-bent boxes.
- The same rule blocks:
  - **Fold-overs on a bent wall's top:** the liner would have to shrink by ~2t/R and buckle. Refused with a note, like `curveBlocked`.
  - **Lids grown off a curved top edge.** A lid for a round box is a shallow matching tray instead (§6.3); an arched lid is a bent panel on matched walls (§7).
- **What stays possible:** where a curved run meets a straight wall **tangentially** (rounded rectangle, stadium), the strip just continues in the flat net. There's no fold there, so a straight wall and its rounded corner can be one piece.

### 2.2 How each built-in material can bend

**How the numbers are worked out.**
- **Strain.** Bending a solid sheet strains its outer fibres by about ε = t / 2R.
- **Patterns.** A pattern of lines at pitch *p*, each allowing a small turn φ, gives a smallest radius R ≈ p / φ. A bend of angle θ needs R·θ of patterned strip; on a curved wall that is exactly the curved part.
- **These are starting points to calibrate** (§5.5), like kerf and clearance today. The two sources below agree only in magnitude.

| Preset | Plain bend (no pattern) | With a pattern | Pattern and its catch | Verdict |
| --- | --- | --- | --- | --- |
| **Card 0.5 mm** | R ≥ ~10 mm (ε ≈ 2.5 %) | **Scores** every 2–3 mm: R ≥ ~4 mm, faceted. **Perforation** (dashed cut): R ≥ ~3 mm | Scores show as facets. Perforation weakens the wall; keep it off glue teeth | **Easy.** Smooth is the default. Circles down to ~20 mm across |
| **Corrugated 1.6 mm (E-flute)** | Flutes **up the wall**: R ≥ ~25 mm. Flutes **round the wall**: not possible (it kinks) | Laser **kiss-score** of the inner liner every ~3–4 mm (the scores go along the flutes): R ≥ ~8 mm | A kiss-score is **one-sided**: it must face the inside of the bend, so the sheet goes in with that face up. A strip with both convex and concave curves can't kiss-score both; the other side gets a perforation, or stays smooth if R allows | **Good,** with flutes up the wall (§5.4) |
| **Corrugated 4 mm** | Flutes up the wall: R ≥ ~60 mm | Kiss-score every ~6–8 mm: R ≥ ~20 mm | As above, plus the existing 4 mm flute rules (`val.flute`) | **Limited.** Rounded corners R ≥ 20 are fine; small round boxes are not |
| **Plywood 3 mm** | R ≳ 150–300 mm (ε must stay < ~1 %). Not useful at box scale | **Living hinge** (straight lattice: pitch ~1.5–2 mm, cut ~15–25 mm, bridge ~3 mm): R ≥ ~25–35 mm | The hinge zone can't carry fingers, tabs or slots. Keep a bridge's length of solid wood to every hole and joint. The grain should run along the bend. The wall is weaker and springy until it's glued | **Possible, with care.** Default joint: wrap/glue to the base; tabs only in solid "islands" |

Reference points:
- [Made Good Designs' living hinge generator](https://madegooddesigns.com/tools/living-hinge-generator/) estimates ~33 mm minimum radius for 3 mm birch ply at ~2 mm pitch, using min R = hinge width ÷ maximum bend. It also asks for one bridge length of solid material to edges and holes, and grain along the bend.
- A [kerf-hinge build in 4 mm ply](https://instructables.com/Developing-Kerf-Hinges) bent to a 25 mm radius at 1 mm line spacing.
- [Trotec's bending technique notes](https://www.troteclaser.com/en-gb/learn-support/helpcenter/bending-technique) and the [FSL kerf article](https://blog.fslaser.com/utilizing-kerf-in-designing-living-hinges-for-laser-cutters) both say spacing depends on material **and** laser, so test.
- For corrugated, no published minimum radius was found. Scoring and orientation guidance (scores along the flutes, deep scores that sever flutes ruin strength) is in [this corrugated board overview](https://racklify.com/encyclopedia/die-cut-corrugated-box-%E2%80%94-materials%2C-flute-types-and-structural-performance). The corrugated radii above are estimates, so the calibration strip (§5.5) matters most there.

**Custom profiles** get their kind's defaults. A class profile can carry calibrated values (§3.3).

## 3. The model

### 3.1 Round outlines (layer 1)
`CurveKind` already says "room for 'bezier'". Add a **rounded corner** next to `'auto'`:
- `SketchPt.curve: 'auto' | 'round'`, with `SketchPt.r?: number` (mm) when round.
- The corner is replaced by a tangent **circular arc** of radius r, and both neighbouring edges are shortened. r is clamped so the two arcs on an edge never overlap.
- **One primitive gives every round base:**
  - square, all four points round, r = side/2 → **circle**
  - rectangle, r = h/2 → **stadium/oval**
  - any r → **rounded rectangle / rounded polygon**
- Arcs have constant curvature. That makes the hinge pitch, the radius check and the true-arc export trivial; `export/dxf.ts` already writes bulged polylines.
- Rounded corners on a point-based outline cover rounded rectangles and polygons. Round and oval boxes get their own parametric sketch, edited by size rather than points (§6.1).

**Curve runs.** `edges.ts` gains `curveRuns(p)`:
- A run is the maximal chain of `~` segments between straight edges or sharp corners. It carries its arc-length parameter, curvature κ(s), and whether each end is tangent to its neighbour.
- A run is keyed by its first sketch key plus `~`, e.g. `e2~`.
- The arc of a rounded corner is keyed `<outgoing edge>^`, with segments `e2^~0…` (`isCurveKey` already matches them).
- A circle's outline is a single **closed** run.

### 3.2 Bent panels (layer 3D)
A wall on a curve run is an ordinary grown panel. Its connection's `a.edge` is the run key, and its sketch stays a wall rectangle:
- **w = the run's developed length:** arc length at the material's neutral line (`bend.k`, §3.3)
- **h = the wall height**

Its outline, shapes, joints and export all live in these flat (s, y) coordinates, unchanged.

What's new, re-derived by `solve` like `ext`:

```ts
/** Derived: planar facets that place a bent wall in 3D, along its flat x (s). */
Panel.bent?: { run: string; facets: { s0: number; s1: number; frame: Frame }[]; closed: boolean };
/** Stored: the student's choices; absent = automatic. */
Panel.bend?: { style?: BendStyle; pitch?: number | null; seamAt?: number /* closed runs: where the strip starts, 0–1 */ };
type BendStyle = 'auto' | 'smooth' | 'score' | 'kiss' | 'perf' | 'lattice';
```

**Facets** are chords of the run (with the wall's grow offset and seating applied, as `growFrame` does), and each has its own `Frame`:
- **Smooth bends:** facets are cut finely enough for display and contact (sagitta ≤ 0.1 mm and ≤ 5° each).
- **Scored bends:** a facet is the material between two scores, which is exactly what is built.

**`facetsOf(d, p)`** is the single adapter: a bent panel gives its facets; a planar panel gives one facet `{0, w, p.frame}`. Frame consumers switch to it one by one:
- `toWorld`/`toLocal` become `panelToWorld`/`panelToLocal`, piecewise by s.
- `three-geom.panelGeometry` clips the flat outline into facet slices (`polygon-clipping`), extrudes each and maps it by its facet frame. The mesh is pre-transformed into the panel's own frame, so `View3D` draws it unchanged.
- Picking, hover and snapping use `panelToLocal`.
- `foldView` **unbends**: each facet's turn relative to the previous one is scaled by `foldT`, so the fold slider shows the flat strip.
- Joints and contacts use the per-facet wrapper (§4.2).

Consumers that don't apply to curved walls (growing from a curved edge, gizmo turning, leaning angles) stay planar-only and refuse with a note.

### 3.3 Material bend limits
Add to `MaterialProfile`:
```ts
bend?: { smoothR: number; patternR: number; pitch: number; k: number; styles: BendStyle[] };
```
- `smoothR` / `patternR`: the smallest radius without and with the kind's pattern.
- `k`: neutral-line factor (developed length = θ·(R_inner + k·t)). Card ≈ 0.5; kiss-scored corrugated ≈ 1 (the outer liner keeps its length); plywood lattice ≈ 0.5.
- Defaults by kind follow §2.2 (`bendDefaults(kind)`), so older files need no migration of values. Schema 10 only adds the optional fields.
- The material drawer shows them as calibration values next to kerf and clearance.

### 3.4 Joints on curves
- `connectionsFor` / `seamKinds` take a `curved` flag:
  - **Wall to base on a run:** card `['teeth', 'glue edge', 'butt']`; corrugated `['tabslot', 'teeth', 'glue edge', 'butt']`; plywood `['glue edge', 'tabslot', 'butt']`.
  - `fold` and `finger` are never offered on a curve. `fitKind` falls back from `pref` and the card says why (§2.1). A tray whose design default is *fold* gets teeth on its curved walls and keeps folds on its straight walls.
- **New `ConnectionKind`s:**
  - `'teeth'`: tapered glue flaps on the wall's bottom, each scored at its root. Their count follows the curvature, so neighbouring teeth don't overlap when folded.
  - `'inline'`: two walls joined end to end along a tangent (§4.3).
- **Glue edge** reuses `slide`/`butt` seating with the wall standing on the base's edge face.
- **Curved tab-and-slot:**
  - Tabs are placed along s (`tabCount`, `minTabWidth`), outside hinge zones.
  - The slot in the base is the tab's band along the curve, offset by the wall's seat and grown by clearance/2. It's built from the run's parametrisation, not from `faceFit`.
  - Each tab is a small solid island in the hinge pattern, so the wall turns slightly at it. Its sagitta w²/8R stays within clearance for w ≤ 3t.

## 4. Algorithms

### 4.1 Bend pattern (derived, like joint geometry)
`bendPattern(d, p)` turns the wall's run curvature, its material and its `bend` choice into lines on the flat strip, and is stored in a `ConnGeom`-like record:
- **Style.** `auto` picks the first style in `bend.styles` that reaches the run's smallest radius:
  - **Card:** smooth, then score, then perf.
  - **Corrugated:** smooth, then kiss on a one-sided strip, then perf.
  - **Plywood:** lattice.
- **Lines.** Each line is vertical (parallel to the bend axis). The pitch is min(`pitch`, R(s)·φ), so a varying curve (`auto` Bézier, an S-curve) gets denser lines where it is tighter.
- **Output by style:**
  - **score:** SCORE layer.
  - **kiss:** SCORE layer, plus a "this face up" label on the GUIDE layer.
  - **perf:** short CUT dashes with bridges.
  - **lattice:** staggered CUT lines (two alternating rows, bridges at the ends and middle). Plain cut lines also keep kerf compensation correct: the cut length shortens by the kerf.
- **Keep-outs.** Every hole, slot, tab, tooth root and edge joint, grown by one bridge length (plywood) or `minWeb`, is clipped out of the pattern.
  - If what's left can't bend the run (patterned length < R·θ needed per zone), the wall gets a validation issue naming the shape or joint in the way.
  - A shape whose clipped island is longer than the sagitta allows also gets one. That is the "wall goes flat here" case.

### 4.2 Joints and contacts per facet (adapting the existing code)
`seams.ts` and `contact.ts` assume planar panels. Instead of rewriting them, `withFacet(d, p, k)` returns a shallow design view:
- `panels[p.id]` is replaced by a planar stand-in: facet k's frame, and the wall outline clipped to [s0, s1] and shifted by −s0.
- A joint function (`cornerFit`, `faceFit`, `crossFit`) runs on that view.
- Notches, holes and adds on the bent panel are shifted back by +s0 and merged with `mergeGeoms`, as wall sets and edge pieces already do.

This gives, with no new joint maths:
- **A curved wall's end meeting a straight wall at a corner:** end facet, `cornerFit`; fingers, tabs and glue as today.
- **A divider ending on a curved wall's inner face:** the facet under the divider, `faceFit`.
  - Slots are allowed only outside hinge zones; otherwise the divider falls back to glue or slide fit.
  - A divider between two facets uses the facet nearest its midline; the contact check allows the sagitta.
- **Open-seam detection and the "touching but not joined" export check:** each facet is a planar slab.

### 4.3 Strips: tangent joins, closing seam, sheet length
- **Where a curved run meets a straight wall tangentially, they join `'inline'`:**
  - In the net: `netFolds` treats an inline join like a fold with a straight-continuation transform, `cornerFoldXform` at 180° with no allowance and no score.
  - In 3D: it's simply the next facet.
- **Card and corrugated trays** keep their straight walls folding from the base. To keep the net a tree, each curved wall joins **one** neighbour inline and glues to the other with an in-line overlap flap. This is the same choice `fixFlatNets` already makes for hinged walls, so it reuses `Tray.pin`.
  - On corrugated, the solver prefers the neighbour whose orientation keeps flutes **up** the curved wall.
  - If neither works, the wall is cut as its own piece, using existing fix `'own'` plus a new reason, *flutes*.
- **Plywood trays and closed runs (circles) form one strip** and must be broken once, at the **closing seam**:
  - Placed by `Panel.bend.seamAt`: a straight section if there is one, else the back.
  - Its joint: card/corrugated, an overlap glue flap; plywood, a glued backing strip (an extra small piece), or a puzzle key with no glue.
- **A strip longer than the sheet** is split at extra in-line seams (placed on straight sections where possible), each named in the card. Today `sheetIssues` would only report it.

## 5. User-facing actions and settings

### 5.1 Simple actions
| Mode | Action | Change |
| --- | --- | --- |
| Quick build | **Box (B)** | Footprints *Rectangle · Regular · **Round** · **Rounded*** (round = circle/oval by the drag's aspect; rounded = rectangle with a corner radius, default 15 mm). Walls rise as today; curved runs get bent walls automatically |
| Quick build | Divider (D), Hole (H), Text (T) | Unchanged. They work on bent walls through the unrolled solo view (§5.3) |
| Workshop | **Polygon (G)** | *Regular · Round · Rounded* presets; *Edit outline* point card: *Corner · Curve · **Round (r)*** |
| Workshop | **Extrude walls / tray** | Curved runs are now walled (`reconcileTrays` stops skipping `isCurveKey` runs and stands one bent wall per run) |
| Workshop | Grow from a curved edge (click it) | Ghost of a bent wall, 90° only in this release; the angle dial is greyed with a note |

**Guard rails (Quick build's "can't make a file the laser can't cut"):** while dragging a corner radius or a round box, r is clamped to the material's reachable radius (`patternR`). A faint ring shows the limit and a note says why (*"Plywood bends this tight only with a living hinge: 30 mm at least"*).

### 5.2 Settings after creation (all stored as choices, re-derived by `solve`)
- **Base / tray card:**
  - corner radius (all rounded corners at once, or per point in *Edit outline*)
  - the tray's wall-to-base joint for curved walls, next to the existing straight one
  - closing seam position
- **Curved wall card:**
  - *Bend*: **Auto** · Smooth · Scored · Kiss-scored · Perforated · Living hinge (only the styles its material allows; the one Auto chose is marked)
  - *Line spacing* (auto or mm)
  - for corrugated, *which face is up when cutting*
  - the reached radius vs the material's limit, as one sentence: *"Tightest bend 22 mm; this material: 8 mm with kiss-scores"*
- **Quick build:** bend style and pitch are `auto` (hidden). Corner radius and the joint stay changeable, as with *Wall to base* today. `features.ts` gains `bend: 'auto'` and `curves: 'show'` for round/rounded only (auto Bézier stays Workshop).
- Changing material re-fits everything:
  - a bend style the new material doesn't allow falls back, like joint kinds
  - a radius below the new material's limit gives a validation issue, never a silent change

### 5.3 Editing on a bent wall
- **Shapes** (holes, text, stickers) are drawn on the **unrolled wall**: double-click opens solo view showing the flat strip, with the hinge zones tinted. In the 3D view, hits on a bent wall map through `panelToLocal`, so shapes can be placed and dragged there too; the gizmo's turn ring stays solo/cut-plan only for bent walls.
- **Wall outline editing** (gable, top points) is unchanged: it's in flat coordinates.

### 5.4 Checks (export check and the Ready badge)
New issues:
- radius below the reachable limit
- a hinge zone too short, or broken by a shape or joint
- flutes across a corrugated bend
- a kiss-scored strip with bends both ways
- fold-over or grow refused on a bent wall
- a strip longer than the sheet (before it is split)

Quick build's `fix.ts` gets **Fix** actions: raise radius, switch style, move the shape, split the strip.

### 5.5 Calibration strip
The material drawer gets *Download a bend test*: a strip with zones patterned for 5 radii around the material's defaults, labelled on the GUIDE layer. Wrap it round cans or bottles and enter the tightest radius that held. This mirrors the kerf test-cut workflow the app already recommends, and makes §2.2's estimates per-classroom facts.

## 6. Round and oval boxes

These are the likeliest first use (pencil cups, dice cups, oval trays), and they differ from rounded corners in a few ways.

### 6.1 The shape: parametric, not points
A circle or oval drawn as points with rounded corners is awkward to edit: a circle's points would sit on a square around it. A round base gets its own layer-1 sketch instead:

```ts
Sketch |= { kind: 'round'; shape: 'circle' | 'oval' | 'stadium'; rEnd?: number /* oval only */ };  // size from Panel.w / h
```
- It produces tangent arcs (and, for a stadium, two straight sides), keyed by stable ids (`a0…a3`, `s0`, `s1`).
- Its card edits **width, depth, shape** and, for an oval, **end radius**: no points. *Convert to points* turns it into a point outline with rounded corners for free editing (one way).
- **Oval = four-centre oval:** four tangent circular arcs with two radii, the draftsman's oval. It looks like an ellipse but stays exact arcs, so radius checks and hinge pitch stay simple.

A true ellipse is **not** offered, because its tightest bend is much tighter than it looks. For a 120 × 60 mm footprint:

| Shape | Tightest radius | 3 mm plywood (≥ ~30 mm) |
| --- | --- | --- |
| Ellipse | b²/a = 15 mm | No |
| Four-centre oval, end radius 20 | 20 mm (sides 105 mm) | No |
| Four-centre oval, end radius 30 | 30 mm (sides ∞): the stadium | Yes |
| Stadium | 30 mm | Yes |

The radius guard (§5.1) clamps the end radius to the material's limit, so on a stiff material an oval turns into a stadium by itself. The card says so (*"Plywood: ends at least 30 mm round, so this oval is a stadium"*).

### 6.2 Walls on a round base
- **One wall.** A circle is one closed run, so one bent wall goes all the way round, with a **closing seam** (§4.3) at the back by default. An oval and a stadium are the same: one strip, the seam on a straight side for a stadium.
- **Nothing folds from the base** (§2.1). Wall to base by material:
  - card: glue teeth
  - corrugated: tabs in curved slots
  - plywood: the base glued inside the wall
- **Flutes and grain:** a separate strip packs with its height along the sheet's y, which puts corrugated flutes up the wall without turning anything.
- **Size limits** (calibrate, §5.5). Smallest diameter is 2 × the reachable radius; largest is the strip fitting the sheet in one piece (longer strips split, §4.3):

| Preset | Smallest diameter | Largest in one piece (default sheet) |
| --- | --- | --- |
| Card 0.5 | ~20 mm (room for teeth) | ~155 mm (500 mm sheet) |
| Corrugated 1.6 | ~16 mm with kiss-scores, ~50 smooth | ~185 mm (600 mm sheet) |
| Corrugated 4 | ~40 mm with kiss-scores, ~120 smooth | ~185 mm |
| Plywood 3 | ~60 mm (living hinge) | ~185 mm |

### 6.3 Lids
A lid can't grow off a curved top edge (§2.1). For any box, the lid becomes **a shallow tray of the box's outline, offset outward** by wall thickness + clearance, turned over (a hat-box or telescoping lid, rim ~12 mm). It's made from parts that exist by then (an offset base, a tray, bent walls), so it costs little.
- **Quick build:** *Wall / lid* on a round box's top edge offers **Lid**. One ✓; the rim height arrow afterwards.
- **Workshop:** the same from the box card, plus *Lip lid* (a disc with a short strip glued under it, inset to sit inside the wall).

### 6.4 Dividers in round boxes
These use milestone 44's divider rules (`DIVIDERS_PLAN.md`), with three additions:
- **Ends on a curved wall:** they find the curved wall's face like any other, and the joint is made per facet (§4.2). Plywood dividers there default to glue or a slide fit, since slots need a solid island in the hinge.
- **Direction snapping** follows milestone 44's grid. A round box's grid axes are its own: an oval's long axis, or along the sheet for a circle. With Shift (30° steps), radial lines through the centre are targets too, so 3-, 4-, 6- and 12-way pies snap exactly.
- **Pie compartments fall out of the rule:** draw one line across the box, then lines from the rim to the centre. Each ends on the first divider it reaches, so no hub part is needed.

### 6.5 Quick build Box: Round
- Drag the footprint's bounding box. **Shift** makes it a circle.
- The box card then has *Circle · Oval · Stadium*, the size, and the end radius for an oval.
- Walls rise at the last height used, as for every box.

## 7. Matched walls and arched lids

### 7.1 The problem
- **The second curved case:** a curved panel spanning *between* two walls (an arched lid, a chute, a curved card holder). It's a bent panel (§3.2) whose run is a wall's **top** edge. Like every curved crease, it can't fold off that edge, so it's a separate piece joined by teeth, tabs or glue.
- **Why matching matters:** its far edge rests on the opposite wall, so the two walls' top outlines must stay identical.
- **Why the obvious fixes fall short:**
  - **Editing both walls together in outline mode** keeps them matched only while both are selected. A later height change, a curve flag or an undo breaks the match silently. And facing walls run their local x in opposite directions, so a point-by-point copy mirrors an off-centre arch.
  - **Snapping to the parallel wall** matches points one by one. But a curve's shape depends on all its neighbouring points and their flags, so matching every point by hand is tedious and fragile.

### 7.2 One profile, used by both walls
- **Matched walls.** `WallSketch.match?: string` names the leader wall. The follower stores no top points: its top is the leader's top **projected through 3D** onto it, which handles mirroring and offsets.
  - Offered only for parallel walls facing each other (within 1°, overlapping across).
  - Non-parallel facing walls (a tapered box) would need a cone-shaped panel; they get a one-time *Copy outline from…* instead.
- **Editing.** Outline mode on either wall edits the shared profile (on the follower it writes the leader's points through the projection). The other wall's handles show faintly and move live.
- **Opting out.** *Own outline* on the follower's card copies the profile into its own points and drops the link. That's the tray's *Own height* checkbox again: shared by default, opt-out per wall.
- **The curved panel turns it on.** Growing a panel from a curved top edge already finds the opposite wall it reaches (lids do this today, `heightTargets`). If that wall is parallel, it becomes a follower.
  - The student shapes the arch once, on either wall, and everything follows.
  - The far joint is the bent panel's edge against the follower's top run: per facet (§4.2), or the curved tab-and-slot (§3.4) with the follower's top as the "base".
- **`curveBlocked` relaxes:** a point may be curved next to an edge joined to a bent panel, because that joint follows the curve. It still refuses for any other joint.
- **Snapping as a supplement:** points projected from a parallel facing wall join the outline snap targets (DECISIONS *Outline point snapping*). This is useful even without a link (matching two gable peaks) and cheap.

### 7.3 Arched lid (one action)
- **Quick build:** *Arched lid* on a box's card. It picks the two walls across the short side, links them, gives the leader a circular arch, and grows the bent lid across.
  - There's one arrow on the stage for the arch's **rise**, like the tray height arrow.
  - The rise is clamped so the arc's radius stays above the material's reachable radius.
- **Workshop:** the same result from parts: curve the top in *Edit outline* and grow from the curved edge.
- The two side walls under the lid's long edges keep their straight tops; the lid sits on them by its straight edges with the usual joints.

## 8. Milestones

Each one keeps every existing test green and adds its own. Golden exports change only where a milestone says so. **Milestone 44 (dividers, `DIVIDERS_PLAN.md`) comes first.**

### Milestone 45: round outlines and material bend limits (no curved walls yet) ✅
*Done (PROGRESS.md). Changed while building:*
- *Quick build's Round / Rounded Box moved to milestone 46: without curved walls it would be a floor with no wall.*
- *`curveRuns` moved to milestone 46, its first user.*
- *The oval's default end radius is the draftsman's construction rather than b²/a, which gave pointed ends.*
- *Schema 11 (10 went to the dividers).*

- **Model:**
  - `SketchPt.curve: 'round'` + `r`
  - arc rings and `curveRuns` in `edges.ts`
  - `normalizeSketch` and the `w`/`h` bounding size follow arcs
  - self-crossing and overlapping fillets refused (`isSimplePolygon` on the flattened ring)
  - `check.ts` accepts the new fields; schema 10
- **Material:** `MaterialProfile.bend` + `bendDefaults(kind)`; drawer fields.
- **Round sketch** (§6.1): circle, four-centre oval, stadium; card fields; *Convert to points*.
- **Actions:** Polygon tool *Round / Rounded* presets; point card *Round (r)*; Quick build Box *Round / Rounded* with the radius guard (§6.5).
- **Export:** arcs from rounded corners stay true arcs in SVG/DXF. The base outline is refit from the run's arcs; booleans that cross them still flatten, as today.
- **Tests:**
  - `tests/round.test.ts`: circle, oval and stadium sketches (tangent arcs, both oval radii, the clamp turning an oval into a stadium); rounded rectangles; save/load; export arcs read back by `ezdxf`/`svgpathtools`
  - e2e: Box *Round* in Quick build
- Trays still leave curves open. This milestone is useful alone: round trays, coasters, game boards.

### Milestone 46: bent walls on curves (smooth bends, base joints, matched walls) ✅
*Done (PROGRESS.md). Changed while building:*
- *Developed length is worked out per flattened segment, from its chord and the turn at its ends (exact for arcs), at the neutral line `off + (1 − k)·t` in from the outline.*
- *Facets carry their end points on the outer face and the inward direction there; `panelToWorld` interpolates between them, so neighbouring facets meet without a gap. A bent panel's `frame` is its middle facet (labels and anything still reading one frame land on the wall).*
- *Glue edge is a new kind, `'wrap'`: the wall stands full height with its outer face flush with the base's edge, and the base is cut back by the wall's thickness under it. `'teeth'` is the other new kind; `'butt'` stands the wall on the base, glued.*
- *A tray's bent walls have their own joint (`Tray.curveKind`, the tray card's "Curved walls"); by default the counterpart of the straight walls' joint, so both stand in line (fold or glue → teeth, finger → wrap, tab-and-slot → tab-and-slot), and on a round base the material's default.*
- *In-line seams (a bent wall meeting a straight wall at a tangent point) are connections `<wall>|s` / `<wall>|e`, kept by `reconcileInline`: a glue flap behind the straight wall (card, corrugated) or edge to edge (plywood). A closed strip's closing flap belongs to its base joint's geometry.*
- *Bent tab-and-slot walls stand 0.05 mm further in than straight ones: the flattened curve's chords lie inside the arc.*
- *Schema 12 (new joint kinds).*
- *A closed strip's closing seam is at the back left (135°) rather than the back: a divider drawn on the box's grid, or in 30° steps through its middle, then never meets it.*
- *A divider ends on a curved wall at its far face like on any wall; its end is joined on the facet it meets, through a view of the design in which the wall is planar there (`onFacet`), so the joint code is unchanged. Plywood gets a slide fit there.*
- *Quick build's Round box keeps the circle/oval split by the drag's aspect (within 3 %), and its guard grows the footprint about its centre rather than refusing it. No faint ring on the stage: the card states the limit.*
- *The telescoping lid is a tray with `lidOf` (its box's tray), its base re-derived on every solve: the box's outline grown by wall thickness + clearance, turned over, its underside a clearance above the walls. It is offered on every tray's card (round or not), in both modes; *Lip lid* is left for later.*
- *Matched walls copy the top only: the top corners' heights (and a sideways offset only where the leader's corner has one, so walls of different lengths keep square sides) and the points on the top edge. Side points stay each wall's own. A follower's edit is written back to the leader and followed again, so the ops need no projection of their own arguments.*
- *Matching is switched on from the wall card in 46 (*Match top with*), since growing a bent panel from a curved top edge comes with the arched lid (milestone 48). The other wall's handles are not drawn faintly in outline mode; its shape updates live instead. `curveBlocked` is unchanged until a bent panel can be joined to a top edge (48).*
- *From milestone 45:* `curveRuns` in `edges.ts`; Quick build Box *Round · Rounded* with the radius guard (§6.5).
- **Model:**
  - `facetsOf`, `panelToWorld`/`panelToLocal`
  - `Panel.bent` derived in `solveOnce` after frames
  - `reconcileTrays` walls curve runs (stable ids `<tray>/<runKey>`)
  - `growPanel` accepts a run at 90°
- **Joints:**
  - `'teeth'`, curved tab-and-slot, glue edge
  - `fold`/`finger` filtered on curves with the reason
  - `withFacet` adapter for end-corner joints and dividers
- **3D:**
  - sliced `panelGeometry`
  - picking and snapping through `panelToLocal`
  - fold slider unbends
  - bend beads along the zone
- **Checks:** radius vs `smoothR`; fold-over and grow refused on bent walls.
- **Round boxes:** one closed wall with a fixed closing seam at the back (the movable seam comes in 48); the telescoping lid (§6.3).
- **Matched walls** (§7.2): `WallSketch.match`, projected profile, live handles, *Own outline*, *Copy outline from…*, parallel-wall snap targets.
- **Tests:**
  - a corrugated-1.6 round box R 40: one wall of length 2π(R − t + k·t), tabs and slots matching, the export check clean
  - its telescoping lid fits over the wall with the clearance
  - matched walls: an off-centre arch on the leader appears unmirrored on the follower; *Own outline* keeps the shape and drops the link; undo restores the link
  - a card rounded-rectangle tray: straight walls fold, corners are teeth
  - a plywood rounded box: a glue edge, and a check that names the missing hinge
  - a divider ending on the curved wall joins it
  - `autoseam` fuzzer extended with round bases

### Milestone 47: bend patterns
- `bendPattern`: score / kiss / perf / lattice; keep-outs; variable pitch.
- Layers: perforation dashes on CUT; a "this side up" GUIDE label for kiss scores.
- Card settings (§5.2); Quick build `bend: 'auto'`.
- Checks: hinge zone length, broken zones, flutes across a bend, a two-way kiss strip.
- Calibration strip download (§5.5).
- **Tests:**
  - pitch follows R(s)
  - every keep-out keeps a bridge length
  - a 3 mm ply rounded box R 30 gets a lattice and is clean; at R 15 it's flagged
  - kerf-compensated hinge lines are shortened by the kerf
  - golden files for one pattern of each kind

### Milestone 48: strips: tangent joins, closing seam, sheet splitting, arched lid
- `'inline'` joins in `netFolds` and `fixFlatNets` (a curved corner rides on one straight neighbour, preferring flutes up the wall).
- Closing seam with `seamAt`: card/corrugated overlap flap; plywood backing strip or puzzle key.
- Splitting strips longer than the sheet.
- **Arched lid** (§7.3): the Quick build action, the rise arrow and its radius clamp.
- **Tests:**
  - an arched lid on a corrugated box: both end walls follow the rise, the lid's length is the arc's developed length, and its far edge joins the follower
  - a card rounded tray is one net that lies flat
  - a plywood flex box is one strip of four straight sections and four hinge corners, plus a closing seam
  - a 600 mm circumference on a 500 mm card sheet splits in two

### Later, feasible but out of these milestones
- **Flared walls on arcs** (cone strips: exact development for circular runs; general curves need a full developable solver).
- **Through-cuts through bent walls** (per facet).
- **Bézier handles.**
- **Half-laps into hinge zones.**

## 9. Decisions (defaults; change them here before starting if the owner disagrees)
1. **Round corners are circular arcs** (`'round'`, radius r). `auto` Bézier curves get bent walls too, but stay Workshop-only and need the variable-pitch pattern.
2. **Curved walls stand at 90° only** in this release.
3. **Plywood's default curved joint is a glue edge** (the base inside the wall); tabs are offered, not defaulted.
4. **Perforations are short CUT dashes,** not a new layer, so every LightBurn setup cuts them correctly. A separate PERF colour is a one-line change in `layers.ts` if the classroom prefers per-layer control; confirm on the classroom machine.
5. **Material limits are starting points** shown in the drawer and calibrated with the bend test. The guard clamps to `patternR`, not `smoothR`, so Quick build picks the pattern itself.
6. **The closing seam defaults** to the middle of the longest straight section, else the back of the box.
7. **"Oval" is a four-centre oval, not an ellipse** (§6.1), clamped toward a stadium on stiff materials.
8. **Every lid on a curved box is a telescoping shallow tray** (§6.3); the arched lid (§7.3) is the one exception.
9. **Matching is a stored link with an opt-out** (*Own outline*), switched on by growing a curved panel across to a parallel wall (§7.2). There is no multi-wall editing selection.

## 10. Risks
- **Facet count vs performance.** A 300 mm smooth circle at ≤ 5° is ~72 facets. Contacts only test facets whose bounds touch, and bent meshes are cached by content like `ownOutline`.
- **The one-frame assumption is everywhere** (29 files). `facetsOf` lets each consumer move over separately. Until it does, it must refuse bent panels explicitly: a lint-style test lists every `.frame` read outside the allow-list.
- **The material figures are estimates,** especially for corrugated. The bend test (§5.5) and teacher class profiles are how they become real; the UI must say "starting point" as it does for kerf.
- **Kiss-scoring depends on the laser's power setting,** which CutForge doesn't control. The export says which layer it is and that it must not cut through.
