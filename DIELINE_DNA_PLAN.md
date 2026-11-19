# CutForge: dieline DNA: plan (milestones D1–D10)

Status: plan, 2026-11-19. Nothing here is built.

**Read first.**
- **Base: `origin/main` at `1c4cb96` (milestone 73).** Do not build this on `claude/waffle-mode` or `claude/guided-mode`: they are 30 commits behind `main` and lack closures, cartons, nesting and bends. Every file, function and line number below was read from `origin/main` at that commit. Line numbers drift: grep for the name before editing.
- **Milestones are numbered D1–D10 on purpose.** `main` has built 61–73 and planned 74–86 (`LIDS_LINES_PROJECTS_PLAN.md`); `GUIDED_MODE.md` and `UI_CLEANUP_PLAN.md` are also waiting. Give these real numbers when work starts.
- **How deeply each part was checked.** `Plan2D.tsx`, `geometry.ts` (`extrasByPanel`, `edgeFlapGeom`, `flapOn`), `pieces.ts`, `foldView.ts`, `export/*`, `store.ts` types, `Inspector.tsx`, `EdgeBar.tsx`, `features.ts`, `fix.ts` and the golden harness were read. `closures.ts`, `cartons.ts`, `split.ts` and `nest.ts` were read at the level of their exports and their `PROGRESS.md` sections, not line by line. Where a step depends on their insides it says "read first".

**The idea in one paragraph.** Panel building in 3D stays the default and the model does not change shape: boards, joints, trays, closures. What changes is that the flat net becomes a second place to do the same work, the things that hang off an edge become one engine concept, sizes can be stated the way a packaging designer states them, and the output becomes a dieline a printer or die maker can use. Every action added here is an existing operation or a new one in `src/model/ops.ts`; no second document type, no second geometry path.

## 1. What is already there, so it is not rebuilt

| Dieline need | State on `main` | Where |
| --- | --- | --- |
| Tuck flaps, slit locks, tab lock, dust flaps, thumb notch | Built (67), for a lid over a tray's walls | `src/model/closures.ts`, `src/ui/ClosureUI.tsx` |
| Tube cartons, tuck ends, seal ends, snap-lock bottom, glue seam | Built (68), four walls only | `src/model/cartons.ts`, `Tray.base / top / bottom` |
| Slit-lock (no glue) joints | Built (68) | `slitLock` in `src/model/seams.ts` |
| Plain edge flaps | Built (67): `{ id, edge, len }`, fixed 30° taper, drawn flat in 3D | `Panel.edgeFlaps`, `flapOn` in `src/model/geometry.ts` |
| Folds with a radius, perforated / kiss-scored / slit bend patterns | Built (63, 66), inside bend bands only | `src/model/bands.ts`, `bendPatterns.ts` |
| Splitting a net, true-shape nesting, yield report | Built (69) | `split.ts`, `nest.ts`, `src/ui/SplitUI.tsx` |
| Lids (cap, matched walls, arched) | Built (71); four generated kinds planned (74–75) | `src/model/lid.ts` |
| Open lines with types (cut, crease, perforation, cut-crease, guide), crease style per fold | **Planned, 78–80** | `LIDS_LINES_PROJECTS_PLAN.md` Part B |
| Dimensions, legend, title block, spec sheet | **Planned, 84–85** | same plan, Part D |

## 2. What is still missing (the evidence for each part)

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | **The flat view shows structure but cannot edit it.** Only boards and shapes can be selected there. No edge can be picked, so nothing can be grown or given a flap in the flat; a fold line is drawn but not clickable. | `Plan2D.tsx` calls `select` with `kind: 'panel'` and `detailSel` only. Its `Drag` union has pan, marquee, shape move / resize / rotate / draw, and piece. `Inspector.tsx:103`: `if (sel?.kind === 'edge') return view === '3d' ? <EdgeBar … /> : null`. |
| F2 | **A net is only ever seen packed on a sheet** (or one board alone in solo view). There is no view of one whole net, upright, beside its folded form. | `Plan2D`'s `layout` memo has two branches: `solo` and sheets. `View = '3d' \| '2d' \| 'solo'`. |
| F3 | **Things on an edge are wired by hand, kind by kind.** Fold-overs, plain flaps and joint geometry each have their own loop, their own 3D drawing and their own card code. | `extrasByPanel` in `geometry.ts`: one loop for `allFoldOvers`, one for `edgeFlaps`, one for connections. `three-geom.ts:53` draws edge flaps flat. `foldOver3d.tsx` is a renderer for one kind. `PACKAGING_PLAN.md` §14 names this as the engine change that would pay for itself. |
| F4 | **A hand-made flap has one number.** No tuck, dust, glue or hang shape, no fold angle, no radius. | `Panel.edgeFlaps?: { id; edge; len }[]`; `flapOn(e, len)`. |
| F5 | **A closure needs a tray.** A lid over hand-built walls, a door hinged on a side, a tube lying down get no closure. The lip is always on the far edge. | `reachFor` in `closures.ts` returns null unless the hinge wall belongs to a tray. Milestone 67's limitations say the same. |
| F6 | **Sizes mean the outside of the boards.** There is no inside or crease-to-crease size, and a thicker board does not keep the inside. | `growFrame` (`src/model/frame.ts`): "the outer faces stay flush (outer dimensions)". Templates correct by hand. |
| F7 | **Four materials.** No board grades. | `MATERIALS` in `src/model/materials.ts`: card 0.5, corrugated 1.6 and 4, plywood 3. |
| F8 | **No artwork output.** No print side, bleed, safe zone or spot-colour PDF. The lids plan leaves trade PDFs out by decision. | `src/export`: SVG and DXF of packed sheets only. `LIDS_LINES_PROJECTS_PLAN.md` decision 10. |
| F9 | **No holding nicks, no run sheet, no cost.** | Nothing in `src/export` or `split.ts`. |
| F10 | **Carton families are reached through three lists on a tray's card**, with no catalogue, trade names or a way to start from the product. | `CornersUI.tsx` / `TrayUI.tsx`: *Base*, *Top*, *Bottom*. |
| F11 | **A drawn crease is a mark, not a fold.** Even after 78–79, a dieline drawn as an outline with crease lines stays one flat board. | `LIDS_LINES_PROJECTS_PLAN.md` §15, *Fold along a drawn line*: left for later. |

## 3. Decisions (defaults; change them here before work starts)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Default way to work | **Unchanged.** The app opens in 3D and panel building is the first thing shown. Nothing in this plan removes or renames a 3D tool. |
| 2 | The flat workspace | **A third view tab, *Net*,** between *3D* and *Cut plan*: every net unpacked at true size, with a folded 3D preview beside it. It is `Plan2D` in a new mode, not a new editor. |
| 3 | What Net can do | **Exactly what 3D can do to structure:** pick an edge, grow, add a flap, pick a fold, resize a board. Same cards, same ghost and ✓, same undo. Outline editing stays in 3D and solo. |
| 4 | Edge features | **One registry** (`src/model/edgeFeatures.ts`). Fold-overs and flaps move onto it with no change in output; closures and tray ends stay joints (`ConnGeom`) and are not moved. |
| 5 | Flap shapes | *Plain* (today's), *Tuck*, *Dust*, *Glue*, *Hang tab*. Stored on the existing `Panel.edgeFlaps` items as optional fields, so old files are plain flaps. |
| 6 | Size intent | **A display and entry setting per design** (`Design.sizeAs`): *Outside* (today), *Inside*, *Crease to crease*. Stored geometry stays outside sizes. A material change keeps the stated size. Boxes (trays) only. |
| 7 | Board grades | **A library beside the four classroom materials,** opened from the material drawer. Values are starting points and say so. |
| 8 | Artwork template | **Per net, not per sheet:** print side up, cut and crease on named spot colours, bleed, safe zone, glue areas, face names and an *up* arrow. PDF written by a small writer in the repo (paths only, no library) and SVG with the same layers. |
| 9 | Nicks | Off by default; card and corrugated only; added at export, never stored as geometry. |
| 10 | Styles | **Recipes over what exists,** shown on the start screen. A trade code (ECMA, FEFCO) is shown only after the owner has checked it against the code book. |
| 11 | Fold from a line | Last, and only after milestones 78–79 exist. |

## 4. Rules for whoever builds this

1. `git fetch origin`, then branch from `origin/main` (`claude/dieline-dna`). One commit per milestone: `Dieline D1: the Net view`. Do not push or deploy unless asked. Never touch `SITE_PASSWORD`.
2. After each milestone: `npm run typecheck`, `npm test`, and a short look in the dev server (`cutforge-dev`, port 5199). Do not run the full e2e suite or the `SHOTS` specs.
3. **Golden exports stay byte-identical** unless the milestone lists a new or changed case. Regenerate only with `UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts`. New cases are functions in `tests/goldenDesigns.ts`.
4. Every stored field added is optional, accepted in `src/model/check.ts`, and absent means today's behaviour. Bump `SCHEMA_VERSION` only if a stored value changes meaning (none here should).
5. Every string in `src/i18n/en.ts` and `he.ts` (`tests/i18n.test.ts` fails on a missing key or hard-coded text).
6. Every new control gets a row in `FEATURES` (`src/easy/features.ts`) and is read with `useFeature`. Default for everything here: `'hide'` in Quick build, unless the milestone says otherwise.
7. A new check goes in `src/model/validate.ts`; if it has a one-click fix, add its case to `fixIssue` in `src/easy/fix.ts`.
8. Derived geometry is never stored except through the existing `Connection.geom`. Per-design caches use `memo(d, key, fn)` from `src/model/derived.ts`.
9. After each milestone add its section to `PROGRESS.md` (Implemented / Verified / Limitations) and its decisions to `DECISIONS.md`.

## 5. Milestones

Order: **D1 → D2 → D3** are the core and each builds on the one before. **D4, D5, D6, D8, D9** are independent of each other after D3. **D7** waits for milestones 78–79. If time is short: D1, D2, D3 and D8.

| # | Milestone | Size | Needs |
| --- | --- | --- | --- |
| D1 | The Net view: see and pick | M | — |
| D2 | Building in the flat | M | D1 |
| D3 | The edge-feature registry and shaped flaps | L | D1 for its handles |
| D4 | Closures anywhere | M | D3 |
| D5 | Size intent and board grades | M | — |
| D6 | The style catalogue, and starting from the product | M | D4, D5 |
| D7 | Fold along a line | L | 78–79, D2 |
| D8 | The artwork template (PDF and SVG) | L | — (uses 80 and 84 if built) |
| D9 | Production: nicks, fill the sheet, cost | S | — |
| D10 | Final verification | S | all |

---

### D1. The Net view: see and pick

**Goal.** A tab where each net lies flat, whole and unpacked, with the folded box beside it. Clicking an edge selects it; clicking a fold opens its joint. No new operations yet.

**Store** (`src/store/store.ts`)
- `View = '3d' | 'net' | '2d' | 'solo'`. In `setView`, treat `'net'` like `'2d'` for the tool reset (`ONLY_3D`).
- `viewPrefs.netPreview: boolean` (default true), stored where `viewPrefs.dims` is.

**Shell**
- `src/ui/TopBar.tsx` (the view tabs, near `data-testid="view-2d"`): add `view-net` between them. Keys `view.net`: *Net* / *פריסה*.
- `src/App.tsx:55`: `view === 'net' ? <NetView /> : …`.
- New `src/views/NetView.tsx`: a flex row. Left: `<Plan2D mode="net" />`. Right, when `netPreview`: `<View3D />` at 40% width, min 320 px. Under 900 px wide the preview is hidden and a button (`net-preview-toggle`) shows it instead of the net. A toggle in the plan dock turns the preview on and off.
- `View3D` when `view === 'net'`: keep orbit, selection and the fold slider; hide the tool docks and grow handles (they live in the net here). Find what it hides for `folded` and reuse that switch.

**Plan2D** (`src/views/Plan2D.tsx`)
- Props: `{ soloPanel?: string; mode?: 'sheets' | 'net' }`. `modeKey = solo ? 'solo:…' : mode ?? 'sheets'` (it keys the saved view box).
- In the `layout` memo add a third branch before the sheets one:
  ```ts
  if (mode === 'net') {
    const copies = pieceCopies(d).filter((c) => c.copy === 0);
    let x = 0;
    const placed = copies.map((copy) => {
      const p: Placed = { copy, sheet: 0, xf: IDENTITY, ox: x, H: copy.h };
      x += copy.w + GAP;
      return p;
    });
    return { placed, slots: [], placements: {}, mixed: false };
  }
  ```
  Check how `ox` and `H` are used by the solo branch and follow it exactly; if pieces of different heights do not share a baseline, set every `H` to the tallest and shift with `xf.ty`.
- In net mode do not render: sheets, margins, the `YieldBar`, *Repack* / *Nest*, and do not start a `piece` drag.
- **Picking.** New pure module `src/views/netPick.ts`:
  ```ts
  export type NetEdge = { panelId: string; key: string; a: Vec2; b: Vec2; free: boolean; foldId?: string };
  /** Every straight keyed edge of every board of a placed piece, in the piece's flat coordinates. */
  export function netEdges(d: Design, copy: PieceCopy): NetEdge[]
  ```
  For each `{ panelId, xf }` in `copy.panels`: `panelEdges(d.panels[panelId])`, skip curve pieces (`isCurveKey`), map both ends with `applyX(xf, ·)`, then subtract `copy.origin` if `copy.panels` is not already in bbox coordinates (check `pieceCopies` in `src/model/pack.ts`). `free = edgeHasRoom(d, panelId, key)` (`src/model/adapt.ts`). `foldId` = the id of the fold whose parent edge or child edge this is (`netFolds(d)` in `pieces.ts`).
- Draw, above the pieces and below the shapes, one transparent hit line per `NetEdge` (`stroke-width` = `SNAP_PX` in view units, class `edge-hit`, `data-testid="net-edge-<panelId>-<key>"`). On hover of a free edge show the `+` pill the 3D edge shows. On pointer down:
  - a free edge: `select({ kind: 'edge', panelId, edge: key })`;
  - an edge with `foldId`: `select({ kind: 'panel', id: <the fold's child> })` and `set({ openJoint: foldId })`;
  - any other joined edge: select its board and `set({ openJoint: <that connection's id> })`.
- The existing fold lines (`c.ref?.foldId`, class `fold-line`) get the same handler. At each fold's middle draw a chip with its angle and a valley or mountain mark (`Connection.angle`, `foldDir`); class `fold-chip`, pointer events off.
- A selected edge is drawn as a thick line in the selection colour (`#1fb8ac`, as shapes use).

**Inspector** (`src/ui/Inspector.tsx:103`): show `EdgeBar` when `view === '3d' || view === 'net'`.

**Tests**
- `tests/netpick.test.ts`: on `cardTray()` (from `goldenDesigns.ts`): one piece; each wall's top edge is free, its bottom edge carries its fold's id, each side edge is not free; every edge's two ends lie on the piece's outer contour or on a fold line (within 1e-6). On `cartonDesign(card, 'tuck', 'snap')`: one piece, the glue seam's edges are joined, not free.
- `tests/store.test.ts`: `setView('net')` drops a 3D-only tool; `setView('3d')` restores nothing it should not.
- Dev look: a card tray, tab to Net, click a wall's top edge (the grow card appears), click a fold (its joint card opens), fold slider moves the preview.

**Done when** a student can go to Net, see the tray's cross with the folded tray beside it, and reach the grow card and a fold's joint card by clicking in the flat. Goldens byte-identical.

---

### D2. Building in the flat

**Goal.** Grow, add a flap and resize from the Net view, with the result appearing unfolded where it will be cut and folded in the preview.

**The grow ghost in the flat**
- Where: `Plan2D`, net mode, when `sel.kind === 'edge'` and `edgeHasRoom`.
- The ghost board: `effectiveGrow(d, panelId, edge, grow)` (`src/views/ghost.ts`) gives height, span, kind and sketch; `ghostPanel(d, panelId, edge, spec)` (`src/model/adapt.ts`) gives the board. Its outline: `sketchRing(ghost).map((e) => e.a)`.
- Where it lies: the ghost's local points through the unfold of a fold on that edge, then through the parent's net transform. Use the function `netFolds` uses for a grown fold (`foldXform(parent, edge, allowance, s0)` in `pieces.ts`; on `main` read `netFolds` first, a fold with a radius adds its band length). New helper in `netPick.ts`:
  ```ts
  export function ghostInNet(d: Design, copy: PieceCopy, panelId: string, edge: string, ghost: Panel, s0: number): Vec2[] | null
  ```
- Draw it dashed in the selection colour, with its size in a label, and the closure note the grow card shows (`grow-closes`) unchanged.
- **Height handle:** a round handle at the middle of the ghost's far edge. New `Drag` kind `{ kind: 'growH'; panelId; edge; axis: Vec2; base: Vec2 }`. On move: project the pointer onto `axis`, snap with `heightTargets(d, ghost, exclude)` and `snapTo` (both in `adapt.ts`; tolerance `SNAP_PX` in mm at the current zoom), else the grid; `setGrow({ height })`.
- **✓** uses what 3D uses: `doGrow(panelId, edge)` in `ghost.ts`, shown with `PendingBarHtml` (already imported by `Plan2D`). Esc cancels the selection.
- A joint that is not a fold (plywood fingers) cannot lie in the net: draw the ghost beside the edge in a lighter style with the note *Cut as its own piece* (`net.ownPiece`), and after ✓ it appears as a second piece. Do not block it.

**Flap handle.** For each `edgeFlaps` item of a board in the net: a handle at the middle of the flap's far edge. Drag kind `{ kind: 'flapLen'; panelId; edge }`: `preview((x) => setEdgeFlap(x, panelId, edge, len))` while dragging, `commit()` on release, `cancel()` on Esc (the store's transaction calls; a drag is one undo step).

**Resize a board.** For a selected board that is a plain rectangle (`isRectSketch`), handles at the middle of each free straight edge. Drag kind `{ kind: 'boardSize'; panelId; edge }`, calling `setPanelSize(d, id, w, h)` in a `preview`. A grown board resizes by its far edge only (its width comes from its parent). A tray wall: call what the tray card calls (`setTrayHeight`, or `setCustomHeight` first), so the tray's rule holds. Boards with a moved corner or inserted points get no handles; the card's *Edit outline* stays the way.

**The joint card in the flat** (`src/ui/Connections.tsx`, the fold section near `conn.foldDir`): if the angle is not already editable there, add a `NumField` for `angle` (`setConnection(x, c.id, { angle })`, already in `ConnPatch`). Bounds from `checkHinge` (`src/model/hinge.ts`).

**Features:** `'net.build': 'hide'` (ghost, handles) so Quick build's Net, if it is ever shown, is read-only. Decide with the owner whether Quick build gets the Net tab at all; default: no (`'view.net': 'hide'`).

**Tests**
- `tests/netbuild.test.ts`: `ghostInNet` for a card tray wall's top edge at 90° fold: its four points are the rectangle the fold makes after ✓ (compare with the new board's corners through the piece's `NetPanel.xf`, within 1e-6); for an edge on a board turned in the net (a wall of a hexagon tray) the same.
- Store-level: a `flapLen` sequence of three previews and a commit is one undo step.
- Dev look: card tray → Net → top edge of the back wall → drag the height to the snap at the front wall → the card says it will close the box with a tuck → ✓ → the lid and its lip appear in the net and fold in the preview.

**Done when** a reverse-tuck box can be built without leaving the Net view except to draw the first base. Goldens byte-identical.

---

### D3. The edge-feature registry and shaped flaps

**Goal.** One engine concept for material and lines added to a free edge; flaps that are tuck, dust, glue and hang shapes and fold in 3D.

**Step 1: the registry, with no change in output.** New `src/model/edgeFeatures.ts`:
```ts
/** A part that turns about a line on its board (flat in the net, folded in 3D). */
export type HingedPart = { owner: string; poly: P2[]; hinge: [P2, P2]; angle: number; side: 1 | -1 };
export type EdgeFeatureOut = {
  adds: P2[][];
  scores: { a: P2; b: P2 }[];
  /** Slots in other boards. */
  holes: { panelId: string; poly: P2[] }[];
  linerHoles?: P2[][];
  hinged: HingedPart[];
};
export type EdgeFeatureKind = {
  id: 'foldover' | 'flap';
  /** The features of this kind a board carries: its stored item and edge. */
  on(p: Panel): { key: string; edge: string; item: unknown }[];
  /** Why it cannot be on this edge (a message key), or null. */
  blocked(d: Design, p: Panel, edge: string): MsgKey | null;
  geom(d: Design, p: Panel, item: unknown): EdgeFeatureOut | null;
  checks?(d: Design, p: Panel, item: unknown): Issue[];
};
export const EDGE_FEATURES: EdgeFeatureKind[] = [foldOverKind, flapKind];
export function edgeFeatures(d: Design): { panelId: string; kind: EdgeFeatureKind; key: string; out: EdgeFeatureOut }[]  // memo(d, 'edgeFeatures', …) when frozen
```
- `foldOverKind` wraps `foldOverGeom` (`src/model/foldover.ts`): same adds, scores, holes and `linerHoles`, `hinged: []` (its 3D stays in `foldOver3d.tsx` for now).
- `flapKind` wraps `edgeFlapGeom`.
- In `extrasByPanel` (`geometry.ts`) replace the fold-over loop and the edge-flap loop with one loop over `edgeFeatures(d)`, pushing in the same order as today (fold-overs first, then flaps, by `d.order`). The connections loop stays.
- Run the goldens: **byte-identical** is the proof. Then move the fold-over checks in `validate.ts` (near `val.foldShort`) behind `checks`, again with no change in the issues a design gets (`tests/foldover.test.ts`).

**Step 2: the flap model** (`src/model/types.ts`)
```ts
export type FlapShape = 'plain' | 'tuck' | 'dust' | 'glue' | 'hang';
export type EdgeFlap = {
  id: string; edge: string; len: number;
  /** Absent: 'plain', exactly today's flap. */
  shape?: FlapShape;
  /** Degrees each end leans in from square: [at the edge's start, at its end]. */
  taper?: [number, number];
  /** How far each end starts in from the edge's end (mm). */
  inset?: [number, number];
  /** Radius of the two far corners (mm). */
  r?: number;
  /** How far it folds from flat (degrees, 0–180), and to which face. */
  angle?: number;
  dir?: 'in' | 'out';
  /** Hang tab: the hole. */
  hole?: 'round' | 'euro';
};
// Panel.edgeFlaps?: EdgeFlap[]
```
Defaults, in one table `FLAP_DEFAULTS` beside the geometry (t = the board's thickness, L = the edge's length):

| Shape | len | taper | inset | r | angle | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| plain | as stored | 30, 30 | 0, 0 | 0 | 0 | `flapOn` unchanged; must stay byte-identical |
| tuck | `lipLength` rule: 30% of the board's depth, 12–22 | 0, 0 | t + 0.5 each | min(4, len / 2) | 90 in | the same numbers the closure's lip uses (`closures.ts`) |
| dust | min(0.45 · L, 40) | 15, 8 | 0, 0 | 3 | 90 in | the closure's dust flap numbers |
| glue | `autoFlap(m)` (`seams.ts`) | 30, 30 | 0, 0 | 0 | 90 in | counts as a glue area in D8 |
| hang | max(25, len) | 0, 0 | 0, 0 | 4 | 0 | hole: round 6 mm, or a 32 × 6 mm slot with round ends, centred 10 mm from the far edge; no score while angle is 0 |

**Step 3: the geometry.** In `geometry.ts`, `flapOutline(e: EdgeSeg, f: EdgeFlap, t: number)`:
1. Work in the edge's frame: `at(s, o)` as `flapOn` has it (s along the edge, o outward).
2. Corner points: `at(i0, -0.01)`, `at(L − i1, -0.01)`, `at(L − i1 − len·tan(τ1), len)`, `at(i0 + len·tan(τ0), len)`. Clamp each taper so the far edge keeps at least 4 mm.
3. Round the two far corners with the fillet helper round outlines use (`src/model/round.ts`), flattened at 0.05 mm; clamp r to half the far edge and half of len.
4. Score from `at(i0, 0)` to `at(L − i1, 0)` unless `angle === 0` and shape is `hang`.
5. A hang tab's hole is returned as a hole on the board itself (`holes` with its own `panelId`).
6. `hinged`: one part: the outline, the hinge `[at(i0, 0), at(L − i1, 0)]`, `angle`, `side` from `dir` and the board's `frame.side`.
`shape` absent must return `flapOn(e, f.len)` untouched.

**Step 4: 3D.** New `src/views/hinged3d.tsx`, modelled on `FoldOverObject`:
- geometry: `flapGeometry(p, part.poly, 0, t)` (`three-geom.ts`), the board's own slab;
- matrix: `display.xf.get(owner) × frameMatrix(owner.frame) × turn about the hinge by angle × foldT` (the swing in `foldOver3d.tsx` is the pattern; the pivot sits half a thickness in, as milestone 22 worked out for glue flaps);
- colour from `boardColors`, as flaps take their owner's.
In `View3D` render `<HingedParts />` once for all `edgeFeatures(d)`; in `three-geom.ts:53` keep drawing in the board's plane only the flaps whose `angle` is 0.

**Step 5: operations and the card.**
- `ops.ts`: `addEdgeFlap(d, panelId, edge, shape?: FlapShape)` fills the defaults; `setEdgeFlap` takes a patch (`Partial<Omit<EdgeFlap, 'id' | 'edge'>> | null`). Keep the old call shape (`len: number | null`) working, the Net handle uses it.
- `EdgeBar.tsx` (the block at `edge-add-flap`): a row of five pictures (`src/ui/Pictures.tsx` is how lids and kinds show choices), then length, fold angle, the two tapers, radius, and for a hang tab the hole. Test ids `flap-shape-<shape>`, `flap-angle`, `flap-taper-a`, `flap-taper-b`, `flap-r`.
- `check.ts`: accept the new optional fields with their ranges.
- Features: `'flap.shape': 'hide'`.
- Checks: `val.flapNarrow` (the edge is shorter than its insets, tapers and 4 mm), with the fix *Make it a plain flap*.

**Tests**
- `tests/edgefeatures.test.ts`: the registry returns for `v6CorrFoldover()` exactly what `allFoldOvers` gave; goldens unchanged.
- `tests/flapshapes.test.ts`: each shape's outline area, far-edge width and score ends for a 60 mm edge on card; a tuck flap's inset is t + 0.5; a hang tab has a hole and no score; a plain flap equals `flapOn`; `hinged` at foldT 0 lies in the board's plane (its points equal the net's added outline) and at 1 is turned by its angle about the score.
- New goldens: `flap-card-tuck-dust` (a hand-built lid with a tuck flap and two dust flaps), `flap-card-hang`.

**Done when** a hang tab and a hand-made tuck flap can be added from either view, fold in the preview, and export clean; every earlier golden is byte-identical.

---

### D4. Closures anywhere

**Goal.** A closure for any board that folds shut over walls, not only a lid over a tray.

**Read first:** all of `src/model/closures.ts` (`reachFor`, `sealOf`, `reconcileClosures`, `closureGeom`) and `tests/closures.test.ts`.

1. **Walls without a tray.** In `reachFor`, when the hinge wall belongs to no tray, the candidate walls become: every board that is not the lid, the hinge wall or a construction guide, and whose plane is square to the lid's (the test already there: `along(v) > 0.99` for the front, the same with `u` for sides), within 1 mm of the lid's underside. The rest of the function is unchanged. Keep the tray path first so tray results do not change.
2. **The closing edge.** `Closure.lipOn?: 'e1' | 'e2' | 'e3'` (absent: `e2`, the far edge). `Seal.front` becomes `{ panelId, under: 'e1' | 'e2' | 'e3' }`; dust flaps go on the walls under the two edges next to the lip that are not the hinge. `ClosureUI.tsx`: *Closing edge*, a three-way choice drawn on a small picture of the lid. Message keys `closure.lipOn.*`.
3. **A tube lying down** (a sleeve, a drawer's shell): `Tray` gets no change; a sleeve is built by hand from a standing board (`addPlacedPanel` with `pose: 'standing'`) and three grown folds. Check that item 1 lets its end panels close with a tuck. If `planOpenTrays` is the only thing that makes the last corner a glue seam, add an op `closeLoop(d, panelIds)` that does what it does for four hand-built walls.
4. **Check** `val.lidLoose`: a board folded over an opening on a fold, sealing it, with closure style *Rests* and no flap on any free edge: *Nothing holds this lid shut*. Advice, not blocking. Fix: *Give it a tuck flap*. (This is the one check `LIDS_LINES_PROJECTS_PLAN.md` §16 says Workshop could still use.)

**Tests** (`tests/closures.test.ts`, added cases): four hand-grown card walls on a base with no tray, a lid grown to the front wall: a tuck closure with two dust flaps, one piece, clean; `lipOn: 'e1'` moves the lip and the dust flaps; every existing case unchanged. Goldens: new `closure-card-side-lip`; the rest byte-identical.

**Done when** the box from D2's dev look closes with a tuck when its walls were grown one by one.

---

### D5. Size intent and board grades

**Size intent**
- `Design.sizeAs?: 'outside' | 'inside' | 'crease'` (absent: outside).
- New `src/model/sizes.ts`:
  ```ts
  export function boxSize(d: Design, trayId: string, as = d.sizeAs ?? 'outside'): { w: number; d: number; h: number }
  export function setBoxSize(d: Design, trayId: string, size: Partial<{ w: number; d: number; h: number }>, as = d.sizeAs ?? 'outside'): void
  ```
  Rules, for a four-sided box with walls of thickness t (use each wall's own `tOf`):
  | | width and depth | height |
  | --- | --- | --- |
  | outside | the base's `w`, `h` | `tray.height` |
  | inside | outside − 2t | cut base: outside − t; open base: outside |
  | crease | outside − t | cut base: outside − t / 2; open base: outside |
  Check each against the existing clear-size helper (`clearSpans`, used by dividers and the title block plan) and against a measured export before trusting the table; fix the table, not the helper.
- The box's card (`TrayUI.tsx`, the size fields; milestone 73 renamed them *Width / Depth / Height*): show and take sizes through these two functions, with a small three-way switch above them (`size-as-outside|inside|crease`). Other boards keep outside sizes.
- **A material change keeps the stated size:** in `setMaterial` and `editMaterial` (`ops.ts`), for each tray read `boxSize(d, id)` before the change and `setBoxSize` after it when `sizeAs` is not `outside`.
- Features: `'size.as': 'hide'`. The spec sheet's title block (85) prints the intent with the sizes.

**Board grades**
- New `src/model/boards.ts`: `BOARD_GRADES: MaterialProfile[]`, each with a `kind` so every rule keyed on kind still applies. Start with: folding boxboard 0.3, 0.4, 0.6 mm; greyboard 1, 1.5, 2 mm; corrugated E flute 1.6, B flute 3, C flute 4, double wall 7 mm; plywood 4 and 6 mm. Kerf, clearance and fold allowance: scale from the nearest built-in profile of the same kind by thickness; `bend` left absent so `bendDefaults` applies.
- `MaterialDrawer.tsx`: *More boards…* opens the list grouped by kind; choosing one calls the same path as a built-in material. Each row carries the note the drawer already has about trying values on scrap.
- Names under `mat.grade.*` in both languages.

**Tests** (`tests/sizes.test.ts`): a card and a corrugated box, each intent round-trips (`setBoxSize` then `boxSize`); switching from card 0.5 to greyboard 2 with *Inside* keeps the inside to 1e-6 while the outside grows by 3 mm; with *Outside* nothing but the thickness changes; a carton (open base) follows its own column. `tests/boardmaterials.test.ts`: every grade solves the organiser template and a tray with no issue.

**Done when** a 60 × 40 × 30 inside size typed on a box's card survives a change of board.

---

### D6. The style catalogue, and starting from the product

**Read first:** `PACKAGING_AND_LEARNING.md` milestones 48 and 49 on `origin/claude/busy-pascal-9rlxzv`. This milestone replaces both; take its wording for the start screen if the owner prefers it.

- New `src/model/styles.ts`:
  ```ts
  export type CartonStyle = {
    id: string; name: MsgKey; help: MsgKey;
    materials: MaterialKind[];
    /** Shown only when `checked` is true (decision 10). */
    code?: { std: 'ECMA' | 'FEFCO'; code: string; checked: boolean };
    build(d: Design, size: { w: number; d: number; h: number }): void;
  };
  export const STYLES: CartonStyle[];
  ```
- Each `build` is a few calls to existing operations, with the size applied through `setBoxSize` so it honours `Design.sizeAs`:
  | Style | Recipe |
  | --- | --- |
  | Straight tuck end | base, `addTray`, `setTrayEnds` → open base, top *tuck*, bottom *tuck*; both closing lids off the back wall |
  | Reverse tuck end | as above, the bottom lid off the front wall (what `cartonDesign(m, 'tuck', 'tuck')` in `goldenDesigns.ts` builds) |
  | Tuck top, snap-lock bottom | `cartonDesign(m, 'tuck', 'snap')` |
  | Seal end | `cartonDesign(m, 'seal', 'seal')` |
  | Sleeve | open base, no ends |
  | Tray, glued corners / lock corners | `addTray` with the corner kind `glue` or `lock` |
  | Tray with a cap lid | a tray and `addLid` (the generated *Cap* when 74 exists) |
  | Mailer | a tray with a cut base; fold-overs with lock tabs on the two side walls (`addFoldOver`); a lid off the back wall closing with a tab lock; a *dust* flap (D3) on each side edge of the lid |
  The first four are already golden designs: move their builders out of the test file into `styles.ts` and have `goldenDesigns.ts` call them, so the goldens prove nothing changed.
- Start screen (`src/ui/StartScreen.tsx`): a row *Packaging styles* of picture cards; choosing one asks for width, depth, height (in the design's size intent, default *Inside* for styles) and the board, then builds. Workshop only unless the owner says otherwise.
- **Starting from the product.** `Design.contents` already holds what goes inside a box (milestone 40). New `fitToContents(d, trayId, room)` in `sizes.ts`: the contents' box plus `room` all round becomes the inside size. A button on the box's card when it has contents: *Fit the box to what's inside* (`fit-to-contents`), with a room field (default 2 mm).
- Trade codes: put the candidate codes in the table with `checked: false`. Do not show one until the owner has confirmed it against the current ECMA or FEFCO code book.

**Tests** (`tests/styles.test.ts`): every style, in every material it lists, at three sizes: solves, one piece where the table says so, export check clean, lies flat (`netOverlaps` empty). `fitToContents` leaves the stated room on every side. Goldens: byte-identical for the four moved builders; new `style-corr-mailer`.

**Done when** *Start → Packaging styles → Mailer → 200 × 150 × 60* gives a mailer that closes in the preview.

---

### D7. Fold along a line (after milestones 78–79)

**Goal.** A straight crease drawn from edge to edge becomes a real fold: the dieline-first way of working, landing on the same panel model.

**Spike before anything else** (one test file, thrown away or kept):
1. Does a grown board at `angle: 180` solve, unfold and export? (`checkHinge` zones; `growFrame` with θ = 180°.) If not, find the smallest change that lets a fold start flat.
2. Can the cut-off part be a `WallSketch`? `polyToWall` below must round-trip through `sketchRing` (`edges.ts`: `wallCorners` and the inserts) for a rectangle, a trapezoid and an L. Write down what it cannot represent.

**The operation** (`ops.ts`):
```ts
export function foldAlongLine(d: Design, panelId: string, lineId: string): { panelId: string; connectionId: string } | { why: MsgKey }
```
1. Refuse unless the line is a *Crease*, has two points and no bulge, and both ends are within 0.05 mm of the board's outline (`fold.why.notAcross`), and the board is card or corrugated (`fold.why.material`).
2. Split the board's outline ring at the two ends into two polygons. The part that keeps the board's identity is the one with more joined edges, then the larger. If both carry joints: refuse (`fold.why.bothJoined`).
3. `polyToWall(part, hinge)`: put the part in the hinge's frame (origin at the hinge's start, x along it, y away from the kept part). `w` = the hinge's length, `h` = the largest y. Walk the other vertices from the hinge's end back to its start; they must fall into three runs: rising in y (side `e1`), falling in x (top `e2`), falling in y (side `e3`). The run ends become the `tr` and `tl` corner offsets, every other vertex an insert on its run's edge. Not three such runs: refuse (`fold.why.shape`).
4. Replace the kept board's outline with its polygon (a root board: its `pts` and fresh `edgeIds` for the new edge, as `insertVertex` names them; a wall: corners and inserts through `polyToWall` in its own frame). Grow the new board from the new edge: `growPanel(…, { height: h, angle: 180, dir: 'up', kind: 'fold', sketch })`.
5. Move to the new board every shape and line whose centre lies in the cut-off part, re-expressed in its frame. Delete the crease line.
6. One `apply`, so one undo step.

**Interface.** A selected crease line's card: *Make it a fold* (`line-make-fold`), greyed with its reason. In the Net view the new fold's chip reads 180° and its joint card opens, so the next thing the student does is set the angle. Features: `'line.fold': 'hide'`.

**Tests** (`tests/foldline.test.ts`): a 100 × 60 card rectangle creased at x = 40: two boards, one fold at 180°, the net's outline equal to the original rectangle (area and bounding box to 1e-6), a hole that was at x = 70 is on the new board at the same place in the net; set to 90° it stands; undo restores one board and the line. Each refusal is produced. A crease across an L-shaped board on its long arm folds; across a shape `polyToWall` cannot hold, it refuses with `fold.why.shape`.

**Done when** an outline drawn with the polygon tool and three creases drawn with the Line tool becomes a folding tray without the grow tool.

---

### D8. The artwork template (PDF and SVG)

**Goal.** The file a designer puts artwork on and a printer accepts: one net, print side up, line types on named spot colours, bleed, safe zones, glue areas, face names.

**Which face is up.** Before writing anything, cut-plan a card tray and confirm which face the net shows. Expected from `GROUND_FRAME` (`frame.ts`: the material rises from the base's plane): the inside. The template mirrors the net when the print side is the outside. The mirror is the one kiss scores already use in `prepare.ts` (`xformContour({ tx: c.w, ty: 0, rot: 0, mirror: true }, …)`).

**The data** (new `src/export/artwork.ts`, pure):
```ts
export type ArtLayer = 'cut' | 'crease' | 'perf' | 'bleed' | 'safe' | 'glue' | 'labels';
export type ArtPath = { layer: ArtLayer; contour: Contour; dash?: [number, number]; fill?: boolean };
export type ArtSheet = { key: string; w: number; h: number; paths: ArtPath[]; texts: { at: Vec2; text: string; size: number; rot: number }[] };
export type ArtOptions = { side: 'outside' | 'inside'; bleed: number; safe: number; margin: number };
export function artworkSheets(d: Design, o: ArtOptions, t: T): ArtSheet[]   // one per kind of piece (copy 0 of each)
```
For each piece (`pieceCopies(d)`, `copy === 0`):
| Layer | From |
| --- | --- |
| cut | contours with `op: 'cut'` |
| crease | `op: 'score'`. If milestone 80 exists, a fold whose style is perforated or cut-crease goes to `perf` as one line with its dash pair, not as cut pieces. |
| perf | perforation lines (78), bend patterns of the perforated kind |
| bleed | the outer contour grown by `o.bleed` (default 3 mm): `offsetContour` in `src/export/offset.ts`, the function kerf compensation uses. If it returns null for a contour, flatten and offset the polygon with `offsetConvex`'s general cousin there; report the piece if both fail. |
| safe | per board: its outline in the net (`sketchRing` through `NetPanel.xf`) moved in by `o.safe` (default 3 mm), dashed |
| glue | every glue flap's outline (`ConnGeom.adds` of joints of kind `glue`, D3 flaps of shape `glue`) and where it lands (`annotate`'s glue areas if 84 is built), hatched at 45°, 2 mm apart, with the word *glue* |
| labels | each board's name (`panelLabel`), an arrow for *up when folded*, the blank size, the title line |
- The *up* arrow: the world's up (0, 1, 0) projected on the board's plane (`frame.u`, `frame.v`), carried through the board's net transform (and the mirror). For a board that lies flat when folded (a base, a lid): the direction away from its hinge; none for a base.
- The sheet is the piece's box plus bleed plus `o.margin` (default 10 mm) all round.

**The PDF writer** (new `src/export/pdf.ts`, no dependency):
- `artworkPdf(sheets: ArtSheet[], names: Record<ArtLayer, string>): Uint8Array`. PDF 1.4, one page per sheet, `MediaBox` in points (1 mm = 72 / 25.4 pt), a content stream that scales by that factor so the rest is in mm with y up.
- One **spot colour per layer**: a `/Separation` colour space named by `names[layer]` over `/DeviceCMYK` with a type 2 function (`/C0 [0 0 0 0] /C1 [c m y k]`). Defaults: cut `CutContour` (0 1 0 0), crease `Crease` (1 0 0 0), perf `Perforation` (0 0.5 1 0), bleed `Bleed` (0.6 0 1 0), safe `Safe` (0.4 0 0 0), glue `Glue` (0 0 0 0.3), labels `Info` (0 0 0 0.6). Names are fields in the dialog, since printers differ.
- One **optional content group (layer)** per `ArtLayer`: `/OCProperties` in the catalog, each layer's paths between `/OC /L_x BDC` and `EMC`.
- Strokes 0.25 pt, overprint on (`/ExtGState` with `/OP true /op true /OPM 1`) so the lines do not knock out the artwork under them.
- Paths: `m`, `l`, and arcs as cubic Béziers split at 90° at most (`c`); dashes with `d`. Text: outlines from `outlineText` (`src/text`), filled in the labels colour, so no font is embedded and Hebrew is right.
- Cross-reference table with byte offsets; streams uncompressed (the files are small and a test can read them).

**The SVG twin:** `artworkSvg(sheet)` in the same file as the data: one `<g id="…">` per layer named as the spot colour, real text. For designers who work in an SVG editor.

**Interface** (`src/ui/ExportDialog.tsx`): a second tab, *Artwork template* (`export-tab-art`): print side (*Outside* default), bleed, safe zone, the layer names, *PDF* / *SVG*, a small preview drawn from `artworkSvg`. The first tab is today's dialog, untouched. Download with a new `downloadBytes` beside `downloadText` (`src/ui/download.ts`). File name: `<design>-<piece>-artwork.pdf`. Features: `'export.artwork': 'hide'`.

**Tests** (`tests/artwork.test.ts`)
- `artworkSheets` on `cartonDesign(card, 'tuck', 'snap')`: one sheet; the bleed contour contains the cut outline and is 3 mm from it at ten sampled points; one safe outline per board, inside its board; the glue seam's flap is on the glue layer; mirrored for *Outside* (the sheet's cut outline is the inside one flipped in x).
- `artworkPdf`: starts with `%PDF-1.4`, ends with `%%EOF`; every `xref` offset points at its `n 0 obj`; one `/Separation` per layer with the given name; the page's `MediaBox` equals the sheet in points to 0.01; the number of `m` operators in the cut layer equals the number of cut contours.
- Golden: `artwork-card-carton.pdf` and `.svg` beside the others.
- By hand: open the PDF in the browser pane and in whatever viewer is on the machine; the owner checks it in Illustrator or Affinity (layers named, swatches present, sizes true).

**Done when** the PDF of a tuck carton opens at true size with seven named layers and seven spot swatches.

---

### D9. Production: nicks, fill the sheet, cost

**Nicks** (holding tabs so parts stay in the sheet)
- `Design.nicks?: { width: number; every: number }` (absent: none). Defaults when turned on: card 0.4 mm, corrugated 0.8 mm; every 80 mm; at least two per outer contour. Not offered on plywood.
- `src/export/nicks.ts`: `nickContour(c: Contour, width: number, every: number, keepOff: Vec2[]): Contour[]`: walk the contour by length (arcs included; `shortenOpen` in `prepare.ts` shows how a contour is cut at a length), leave a gap of `width` at each station, never within 5 mm of a corner (a change of direction over 20°) or of a point in `keepOff` (the ends of the piece's fold lines). Returns open contours.
- In `prepareExport` after kerf compensation: outer cut contours of card and corrugated pieces only; holes are left alone. With `nicks` absent the output is byte-identical.
- *Material & sheet* in the settings card: *Holding nicks* tick, width, spacing. Check `val.nickFew` when an outer contour is too short for two.

**Fill the sheet.** In the yield bar (`src/ui/SplitUI.tsx`), beside *Nest*: *Fill the sheet* (`yield-fill`) for a design with one kind of piece: the largest quantity whose nested layout (`nest`, `nest.ts`) still takes one sheet, found by doubling then bisecting; sets `pieces[key].quantity` in one undo step and stores the nested layout.

**Cost and time.** `MaterialProfile.sheetPrice?: number` and `Design.cutSpeed?: number` (mm/s), both edited where the material's numbers are. `yieldReport` (`split.ts`) gains `costPerUnit` (sheets × price ÷ quantity of the first piece) and `minutes` (metres of cut ÷ speed), shown in the yield bar only when their inputs are set.

**Tests** (`tests/nicks.test.ts`, added cases in `tests/split.test.ts`): a 100 × 60 card rectangle gets at least four nicks, none within 5 mm of a corner, total uncut length = count × width; off is byte-identical; *Fill the sheet* on a 60 mm tray gives a count whose layout is one sheet and count + 1 is two.

---

### D10. Final verification

In the usual form: typecheck, the unit suite, goldens, the specs added here run one by one (not the whole e2e suite), `PROGRESS.md` complete with limitations, `README.md` updated, and the list of what needs the owner:
- a real cut of a hand-built tuck box, a hang tab and a mailer in card and corrugated;
- the artwork PDF opened in the owner's design program and sent once through a printer's preflight;
- the trade codes checked against the code books;
- nick widths on the school's laser;
- the Net view on a Chromebook and in Safari (two canvases side by side);
- Hebrew wording of every new string.

## 6. Tests to add (summary)

| File | Milestone | Proves |
| --- | --- | --- |
| `tests/netpick.test.ts` | D1 | edges and folds of a net are found where they are drawn |
| `tests/netbuild.test.ts` | D2 | the flat ghost is where the board lands; a drag is one undo step |
| `tests/edgefeatures.test.ts` | D3 | the registry changes nothing |
| `tests/flapshapes.test.ts` | D3 | each shape's outline, score, hole and folded pose |
| `tests/closures.test.ts` (more cases) | D4 | closures without a tray; the lip on a side |
| `tests/sizes.test.ts` | D5 | intent round-trips; a board change keeps the stated size |
| `tests/styles.test.ts` | D6 | every style solves, lies flat and exports clean |
| `tests/foldline.test.ts` | D7 | a crease becomes a fold; every refusal |
| `tests/artwork.test.ts` | D8 | layers, bleed, mirror, a well-formed PDF |
| `tests/nicks.test.ts` | D9 | nick count and placement; off changes nothing |

## 7. Decisions still open

| # | Question | Default taken |
| --- | --- | --- |
| 1 | Does Quick build get the Net tab? | No. |
| 2 | Is *Inside* the default size intent for a new packaging style? | Yes for styles; existing designs stay *Outside*. |
| 3 | Spot colour names | `CutContour`, `Crease`, `Perforation`, `Bleed`, `Safe`, `Glue`, `Info`; editable in the dialog. |
| 4 | Bleed and safe zone | 3 mm each. |
| 5 | Should the artwork template also be offered per sheet (several nets, as nested)? | No: one net per page. A run sheet is the cut file. |
| 6 | Hang tab hole sizes | Round 6 mm; slot 32 × 6 mm. Check against the hooks the school or client uses. |
| 7 | Which board grades to list | The twelve in D5. |

## 8. Risks

| Risk | What limits it |
| --- | --- |
| `View3D` mounted beside `Plan2D` is slow on a Chromebook | The preview can be turned off and is remembered; under 900 px it is not mounted. |
| The registry changes output | Step 1 of D3 ships alone, proven by byte-identical goldens, before any new shape. |
| Closures without a tray find walls that are not an opening | The tray path runs first and is unchanged; the wider search needs a fold hinge and a front wall, as today. |
| `angle: 180` or a free outline does not fit a grown board (D7) | The spike decides before the milestone starts; D7 is last and nothing depends on it. |
| A PDF a viewer opens but a RIP rejects | Uncompressed, PDF 1.4, paths only; the owner's preflight is on the D10 list. |
| Size intent disagrees with the clear-size helper | One table in `sizes.ts`, tested against `clearSpans` and a measured export. |
| Other plans touch the same files (`UI_CLEANUP_PLAN.md`: the grow card and rail; 74–86: lids, lines, the export dialog) | D1–D3 touch `Plan2D`, `Inspector.tsx:103`, `EdgeBar`'s flap block and `geometry.ts` only. Rebase on whichever lands first; D8 adds a tab and leaves the existing dialog alone. |

## 9. Left for later

- **Crash-lock (pre-glued) bottoms:** diagonal creases and gluing in the flat.
- **Curved creases** (pillow packs): a fold that is not a straight line is not a fold in this model.
- **Ends on tubes that are not four-sided.**
- **Tear strip in one action** and **a window with its patch:** after the Line tool (79).
- **Artwork brought back onto the 3D box:** with `IMAGES_ON_BOARDS.md`.
- **CF2 / DDES files** for die makers: when one asks.
- **Stacking-strength hints** for corrugated.
- **A shareable read-only 3D link** for approval: needs the server.

## 10. Relation to other plans

| Plan | Relation |
| --- | --- |
| `PACKAGING_PLAN.md` (61–72, built) | The base. This plan does §14's items 1–8 and its first engine change (the registry). Items 9–11 stay there. |
| `LIDS_LINES_PROJECTS_PLAN.md` (74–86, planned) | Independent except: D7 needs 78–79; D8 uses 80's crease styles and 84's `annotate` when they exist and works without them. Its §15 *Fold along a drawn line* is D7. |
| `PACKAGING_AND_LEARNING.md` (`claude/busy-pascal-9rlxzv`) | Its 48 (styles) and 49 (start from the product) are D6; its 54's artwork guide is D8. Its learning milestones (50–53) are untouched. |
| `UI_CLEANUP_PLAN.md` | Changes the rail and the grow card. Build it first if both are going ahead: D2 then calls whatever the grow card has become. |
| `GUIDED_MODE.md` | Quick build only. This plan is Workshop only (decisions 1 and 10, open question 1). |
| `claude/waffle-mode` (49–60) | Independent. Its 2D sketch workspace is for sculptures; the Net view is `Plan2D`. Do not merge the two editors. |

## References in the code (`origin/main` at `1c4cb96`)

- `src/views/Plan2D.tsx`: the `layout` memo (solo and sheets), `Placed`, `Drag`, fold lines at `c.ref?.foldId`.
- `src/ui/Inspector.tsx:103`: the edge card is 3D-only.
- `src/App.tsx:55`, `src/ui/TopBar.tsx` (`view-2d`): the view switch.
- `src/views/ghost.ts`: `effectiveGrow`, `doGrow`, `growWith`. `src/model/adapt.ts`: `ghostPanel`, `edgeHasRoom`, `heightTargets`, `snapTo`.
- `src/model/pieces.ts`: `netFolds`, `netGroups`, `foldXform`, `NetPanel`. `src/model/pack.ts`: `pieceCopies`, `PieceCopy`.
- `src/model/geometry.ts`: `extrasByPanel`, `panelExtras`, `edgeFlapGeom`, `flapOn`. `src/model/foldover.ts`: `foldOverGeom`, `allFoldOvers`.
- `src/views/foldOver3d.tsx`, `src/views/foldView.ts` (`foldDisplay`, `flapMatrix`), `src/views/three-geom.ts:53`.
- `src/model/closures.ts`: `reachFor`, `sealFor`, `sealOf`, `closureGeom`, `lipLength`. `src/model/cartons.ts`: `planOpenTrays`, `endGeom`.
- `src/model/ops.ts`: `addEdgeFlap`, `setEdgeFlap`, `setPanelSize`, `setConnection`, `setMaterial`, `editMaterial`, `growPanel`, `insertVertex`.
- `src/export/prepare.ts`: `prepareExport`, the kiss-score mirror, `shortenOpen`. `src/export/offset.ts`: `offsetContour`. `src/export/layers.ts`.
- `src/model/split.ts`: `yieldReport`. `src/model/nest.ts`: `nest`.
- `src/easy/features.ts`: `FEATURES`. `src/easy/fix.ts`: `fixIssue`. `src/model/check.ts`. `src/model/derived.ts`: `memo`.
- `tests/goldenDesigns.ts`, `tests/golden.test.ts`.
