# CutForge visual overhaul: brief

> **Status (2026-11-07): implemented on branch `visual-overhaul`.** Where the build differs from this brief:
> - The grow card sits in the card slot (top inline-end), not next to the edge; the angle dial, flip badge, height arrow and label are on the stage at the hinge, so nothing covers the ghost.
> - *Rich* quality is GTAO ambient occlusion plus the contact shadow; no shadow maps (thin panels shadow-acne).
> - The connection type in the grow card stays a menu (`grow-kind`), and the template's *Lid*/*Sizes are* stay menus (`tp-*`), to keep the existing tests' `selectOption` steps.
> - The *Add a divider* section is collapsed by default (`div-toggle`).
> - Icons are a hand-drawn inline set (`src/ui/icons.tsx`); no icon package was added.
> - Review screenshots are in `docs/overhaul-shots/` (taken with software rendering, so in *Simple* quality).

Decisions from the design interview (2026-11-07), plus what a walkthrough of the current app turned up. This is the brief for one overhaul branch. It covers the look and the interaction layer only: the model, geometry, joints, export and Worker do not change. The reference mockups are in `ref/` (Gemini images 1–4).

## 1. What we're fixing (from the walkthrough)

**3D readability**
- Every panel uses one flat tan `meshStandardMaterial` (`COLORS` in `src/views/View3D.tsx`) with no outlines or AO. Neighbouring walls merge into one shape, and finger joints and tabs are invisible except at silhouettes.
- A selected panel gets a blue emissive wash (it reads as lavender), which flattens its shape.
- Corrugated and card look like recoloured plywood. Folds aren't visible in 3D, only in the flat net.
- Edge hit boxes are invisible until hover and very thin, so selecting edges is unreliable. Clicks often hit the wrong edge or nothing.
- At an angle that needs side walls (plywood at 45°), the ghost disappears entirely. Only a warning box remains.
- After switching views and changing material, the 3D view came back empty until *Fit view* was pressed.

**Busy interface**
- The inspector always shows material calibration (kerf, clearance, sheet, gap, margin, grain), even with a template open.
- A selected wall lists every connection as a full card, each with angle chips.
- With an edge selected, the edge bar and the panel inspector both show.
- The top bar has 13 controls in two rows: file actions, the teacher link, language and so on.
- The getting-started tip says "draw your first panel" even after starting from a template.
- Parts are named `1`, `2`, `Panel 1`, although templates already know their roles (`t:base`, `t:wall0`, `t:divX1`…).

**Controls**
- Angle is a row of chips, direction is a text button, and counts and sizes are plain number boxes.

## 2. Decisions

| Topic | Decision |
| --- | --- |
| Overall look | **Hybrid.** Warm cream shell (top bar, start screen, cut-plan stage) with a teal accent; the 3D stage is a calm cool grey with a dark floating icon rail (mockups 3–4). |
| Layout | **Floating and contextual.** A dark floating tool rail; small floating cards next to the selection that show only what is relevant; design and material settings in a drawer. |
| Target hardware | **School Chromebooks.** Low-end GPUs and trackpads, so every effect has a cheap path. |
| 3D surface | **Flat tinted colour** per material, with a small **per-part tint variation**. No image textures. |
| 3D depth cues | **Outline edges (toggleable)** and **soft shadows + AO**, both behind a quality setting. |
| Stage widgets | All four: **angle dial at the hinge**, **push-pull height/width arrows**, **flip arrow on the ghost**, **in-place dimensions** (click to type). |
| Number editing | **Mixed by type.** Counts use a − / + stepper with a short slider; sizes use a scrub label plus typing; angles use the dial. |
| Declutter | Material calibration goes into a **Material & sheet drawer**; **file actions** go into a menu on the project name; the **teacher link** leaves the top bar; **joints show on demand** as seam pills. The language toggle, view buttons and hint bar stay. |
| Folds | **Bent strip + crease + fold/unfold animation slider.** |
| Part identity | **Role names + matched tint** across 3D and the cut plan, with cross-highlighting on hover. |
| Cut plan | **In between.** Enough material character that the student knows what they chose, but calm: no grain or photo textures. |
| Name | **Keep CutForge**, with a new logo mark in the style of the mockups. |
| Theme | **Light only**, with all colours as tokens so dark mode can come later. |
| Images | **No Gemini assets for now.** Everything is code, SVG or shaders. |
| Delivery | **Single pass** on one branch (internal order in §13). |

## 3. Design tokens

Replace the `:root` block in `src/styles.css` with semantic tokens. No raw hex values outside the token block and the 3D palette module.

```
/* shell (warm) */
--bg-shell:      #F7F2EA   /* cream app background, cut-plan stage */
--surface:       #FFFFFF   /* cards, drawers, popovers */
--surface-sunk:  #F1EBE1   /* input wells, segmented-control track */
--line:          #E4DCCF
--ink:           #2B2622   /* primary text */
--ink-muted:     #6E655B
--accent:        #15706B   /* primary actions (Download), selected tool */
--accent-ink:    #FFFFFF
--accent-bright: #1FB8AC   /* selection, focus rings, active widget */
--accent-soft:   #DDF3F0
--danger:        #C2410C   --warn-bg: #FFF6E0
/* 3D stage (cool) */
--stage-bg:      #EEF1F5   --stage-grid: #DCE2EA   --stage-grid-major: #C9D1DC
--rail-bg:       #232B38   --rail-ink: #C9D2DE   --rail-on: var(--accent-bright)
/* laser ops: LightBurn colours, used for meaning, never decoration */
--op-cut: #E5322D   --op-score: #2F6FEB   --op-engrave: #1C1C1C
/* shape */
--r-sm: 8px  --r-md: 12px  --r-lg: 18px  --r-pill: 999px
--shadow-float: 0 8px 28px rgba(35,43,56,.14), 0 1px 3px rgba(35,43,56,.08)
```

- **Type:** Rubik is already bundled (Latin + Hebrew, `public/fonts/`), so use it for the UI too: 14px base, 13px labels, 600 weight for headings. Add an `@font-face` for UI weights 400/500/600 if the bundled subset lacks them. Keep it offline: no Google Fonts.
- **Icons:** a single inline SVG icon set (`src/ui/icons.tsx`) on a 24px grid with a 1.75px stroke, covering select, panel, rect, round-rect, circle, text, import, undo, redo, menu, material, flip, joint kinds, eye and settings. Hand-drawn or `lucide-react` (ISC; record it in `THIRD_PARTY.md` if used).
- **Spacing:** a 4px scale. Hit targets are at least 36px (trackpad-friendly) on the rail and in widgets.
- Use logical properties everywhere (`inset-inline-start` and so on) so Hebrew RTL keeps working. Canvases and numbers never mirror.

## 4. Shell and layout

```
┌ [logo] CutForge │ Desk Organiser ▾ │ ◖Plywood 3 mm▾◗ │ [3D | Cut plan] │ ↶ ↷ ······ ✓saved  [Submit to class] [Download for laser] עברית ┐
│ ┌──┐                                                                              ┌──────────────┐ │
│ │↖ │                                                                              │ Front wall   │ │
│ │▱ │                         stage (full bleed)                                   │ W ⟷ 166 mm   │ │
│ │▭ │                                                                              │ H ⟷  48 mm   │ │
│ │▢ │                                                                              │ Copies − 1 + │ │
│ │◯ │                                                                    [cube]    └──────────────┘ │
│ │T │                                                                    [⚙ view]                   │
│ │⇪ │                                                                                                │
│ │●●●│ ← cut / engrave / score swatches                                                             │
│ └──┘                                                                                                │
└──────────────────────────────────────────── hint pill ─────────────────────────────────────────────┘
```

- **Top bar** (`src/ui/TopBar.tsx`): one row, cream background.
  - Logo mark + "CutForge".
  - **Project name** with a ▾ menu: rename inline, New design, Open project…, Save project, and at the bottom a muted "Teacher view" entry. The teacher view is also reachable at `/#/teacher`. Remove the `open-teacher` link from the bar.
  - **Material pill**: a swatch dot + "Plywood 3 mm" ▾. It opens the **Material & sheet drawer** (§7).
  - **3D | Cut plan** segmented control; undo and redo as icon buttons; save state as a subtle icon with a tooltip.
  - Submit to class (secondary) and Download for laser (primary, `--accent`), then the language toggle.
- **Tool rail** (`src/ui/Toolbar.tsx`): a floating dark rounded rail inset 16px from the stage edge, with icons only. Tooltips show the label and shortcut (V select, P panel, R rect, U rounded, C circle, T text). A divider separates Import SVG. At the bottom, the **operation for new shapes** becomes three swatch buttons (cut red / engrave black / score blue) instead of the select. The Panel tool hides in the cut plan, as today.
- **Inspector → contextual card** (`src/ui/Inspector.tsx`): a floating card anchored top-right (top-left in RTL) that appears only when something is selected. With nothing selected and a template design, it shows the **template card** (sizes, dividers, lid). With nothing selected and a blank design, there is no card. Sections inside the card can collapse; only one connection's details are open at a time (§6).
- **View controls**: the view cube stays. *Perspective / Fit view* become two small icon buttons under the cube, plus a ⚙ **View** popover: Outlines on/off, Quality (Auto / Simple / Rich), Show dimensions on/off.
- **Hint pill**: keep it, restyled as a small cream pill. It must say the right thing for the current tool and selection.
- **Getting-started tips** (`src/ui/Hints.tsx`): restyle as coach marks anchored to the relevant control. **Fix:** skip "draw your first panel" when the design already has panels (template start).
- **Modals** (export, submit): same tokens, `--r-lg`, `--shadow-float`, with the cream header band.

## 5. 3D stage rendering (`src/views/View3D.tsx`, `src/views/three-geom.ts`)

**Palette module** (`src/views/palette.ts`): a base colour per material kind, plus `partTint(partId, index)`. The tint is a deterministic small offset in lightness (±6%) and hue (±4°) keyed on creation order, so neighbouring parts always differ and the cut plan can use the same tint.

| Material | Face base | Cut-edge colour | Notes |
| --- | --- | --- | --- |
| Plywood 3 mm | `#E2C9A0` | `#C9A877` with 2 faint lighter lines (ply layers) | edge colour applied to side faces of the extrusion |
| Corrugated 1.6 / 4 mm | `#CFA875` | `#B88E58` with flute stripes on cut edges (procedural, cheap) | flutes only in Rich |
| Thick card 0.5 mm | `#EDE6D8` | `#D9D0BF` | |

- **Faces vs edges:** split the extrusion into face groups (front/back cap vs side walls) so cut edges get the darker edge colour. This alone makes thickness, fingers and tabs readable. Use `ExtrudeGeometry` groups (caps = group 0, sides = group 1) with a two-material array.
- **Lighting:** a hemisphere light (sky `#FFFFFF` / ground `#D9DEE6`) plus one key directional light. Lower the ambient so faces at different angles separate clearly.
- **Outlines (toggle, default on):** `EdgesGeometry(geom, 25°)` as `LineSegments` in `#3A3530` at 55% opacity, one per part, rebuilt only when that part's geometry changes. This draws silhouettes, joint steps and creases. Selected part: outline in `--accent-bright`, 2px (drei `<Edges>` or a second `LineSegments` with `linewidth`-independent fat lines via `Line2`, only for the selected part).
- **Shadows and AO behind Quality:**
  - **Simple:** no shadow maps. A single drei `<ContactShadows frames={1}>` under the model, re-rendered only when the design changes (not every frame).
  - **Rich:** adds the N8AO or SSAO post pass (half resolution) and a soft directional shadow map (1024).
  - **Auto (default):** start Rich, measure frame time over the first ~60 frames, and drop to Simple if the median is above 22 ms. Remember the result per browser in `localStorage`. Render on demand (`frameloop="demand"`) so an idle stage costs nothing on Chromebooks.
- **Selection:** no emissive wash. The selected part gets the bright outline and a +4% lightness lift, and other parts dim slightly (multiply 0.92) while something is selected. Hover shows a thin bright outline.
- **Edge picking:** make edges easy to hit.
  - Hit targets are sized in **screen pixels** (about 14px wide, recomputed from camera distance/zoom like `tolAt`), not in millimetres.
  - When a panel is selected (or hovered with the Select tool), its free edges show as faint dashed teal lines, so they are discoverable without hovering. Hover thickens the edge, and a "+ grow" pill appears at the edge midpoint.
  - Connected edges show the joint pill instead (§6).
- **Grow ghost:** translucent `--accent-bright` (opacity 0.35) with an outline and the material side indicated by a thin darker slab face. If the chosen angle is blocked (lean needs side walls), **still show the ghost**, in warning amber with a hatched fill, and attach the "needs side walls" message plus the *Add side walls* button to it.
- **Floor:** a cool grid with major lines every 10 mm and minor lines every 1 mm, the minor ones fading out with distance. Contact shadow under the model.
- **Bug: blank view.** On view switch, solo exit and material/template regeneration, if no part's bounding box is in the frustum, re-run fit view automatically.

## 6. Stage widgets (new, `src/views/widgets/`)

All widgets are R3F components drawn on top (`depthTest: false`, rendered after the model) with screen-constant size, so they keep the same size at any zoom. Each widget has a keyboard path and an accessible fallback (see §12).

1. **Angle dial at the hinge** (grow ghost and selected connection). A quarter-to-half arc centred on the fold line, in the plane perpendicular to it. The handle is a ball on the ghost's far edge. Dragging rotates the ghost live, with **detents at 15° steps limited to `ANGLES` (90/60/45/30/15)**: a magnetic snap and a tick mark at each, and a degree label riding the arc. Release commits; Esc cancels (reuse the store's `preview`/`commit`/`cancel`). Wheel or arrow keys step between detents.
2. **Push-pull arrows.** On the ghost's far edge, an arrow sets **height**. On a selected panel's free edges, arrows set width or height (for a connected child, width belongs to the parent edge, and the arrow says so in its tooltip, as the inspector does today). Dragging snaps to 1 mm, to heights of sibling panels, and to the template's sizes. A live dimension label rides the arrow.
3. **Flip arrow on the ghost.** A curved arrow badge at the ghost's hinge shows which side it grows from. Clicking flips up/down (replaces the `grow-flip` button).
4. **In-place dimensions.** For the selected panel or shape, W and H dimension lines with labels sit along two edges, as in mockup 4. Clicking a label turns it into a numeric input in place (Enter commits, Esc reverts). They can be turned off in the View popover. The grow ghost shows its height dimension the same way.
5. **Seam pills (joints on demand).** At each connection's midpoint, a small pill with the joint-kind icon (fingers / tabs / fold / glue / half-lap / butt). Pills are visible only for the **selected panel's** connections, or for a hovered seam, so the stage stays clean. A broken connection's pill is always visible, in danger colour. Clicking a pill opens a small floating card next to it: connection type, count stepper, angle dial affordance, Remove.
6. **Grow card.** This replaces `src/ui/EdgeBar.tsx`. A compact floating card next to the selected edge (not a fixed corner box) holds: connection type (segmented icons when there are 3 or fewer options, otherwise a menu), height (scrub field), and the **Add panel** button. Angle and direction live on the stage widgets. While an edge is selected, the inspector card is hidden, so there is only one panel on screen for one task.

## 7. Inspector content and number controls

- **Shared controls** (`src/ui/controls/`):
  - `ScrubField`: label you can drag horizontally to change the value (1 mm per 4 px; Shift ×10; Alt ×0.1), click the number to type, unit suffix in muted ink. It replaces `NumField` for sizes and positions.
  - `Stepper`: − value + with a short slider underneath for counts (fingers, tabs, dividers, copies). The range comes from the model's valid range (odd finger counts step by 2).
  - `Segmented`: icon or text segments for small enums (op, sizes inside/outside, lid none/lift-off).
- **Panel card:** role name (editable), W/H, copies, *Open face-on view* as an icon button in the card header, then a collapsed "Joints (n)" row that lists connections by partner name. Expanding one shows the same controls as its seam pill; the others stay collapsed.
- **Shape card:** position/size scrubs, op segmented control (red/black/blue swatches), radius, array (stepper nx, ny + spacing), text value.
- **Template card** (nothing selected): sizes with scrubs, dividers with steppers, lid segmented control. Below it, one muted line: "Material & sheet settings →", which opens the drawer.
- **Material & sheet drawer:** opened from the material pill. It slides in from the inline end and holds the material picker (swatch cards), thickness, kerf, clearance, sheet W/H, gap, margin, grain, and the existing "these are starting points, measure your material" note. This is the **only** place these settings appear.

## 8. Folds (card and corrugated)

- **Bent strip:** between two panels joined by `fold`, render a short curved strip: a sweep of the material cross-section around the fold axis, with radius ≈ fold allowance / bend angle and arc length = the material's fold allowance. This replaces the sharp meeting corner. It is view-only geometry from the connection frames; the model is unchanged.
- **Crease line:** a dashed line along the fold on the outer face, coloured `--op-score`, with a small mountain/valley glyph on the seam pill.
- **Fold/unfold slider:** a slider in the panel card of any piece that is a folded net, and in the View popover for "all nets". 0 = flat net, 1 = as designed. Implementation: for fraction `f`, rotate each child's subtree about its fold axis by `(1 − f) × (180° − angle)`, using the same rigid unfold the net builder uses (`src/model/pieces.ts`), computed in the view only. Animate with a 600 ms ease when toggled via its ▶ button; drag for manual control. Editing is disabled while `f < 1`, and the hint says so.

## 9. Cut plan (`src/views/Plan2D.tsx`)

The brief is "in between": it should show the material without getting busy.
- Stage background `--bg-shell` with a faint 10 mm grid outside the sheet only.
- **Sheet:** a flat, lightly tinted fill of the material's base colour at about 35% strength over white. For corrugated, add a hairline every 4 mm along the flute direction at 6% opacity, only on the sheet (not the pieces). The sheet has a soft shadow and `--r-sm` corners. A small material chip at the sheet's top-left reads "Plywood 3 mm · 600 × 400" and replaces the plain sheet label.
- **Pieces:** filled with their matched part tint at low strength (about 25%), with role-name labels in `--ink-muted` (no numbers). Lines use the LightBurn op colours: cut red, score blue dashed, engrave black. Selected piece: `--accent-bright` outline plus handles.
- **Cross-highlight:** hovering a piece in the cut plan highlights the part in 3D (and back again) through a shared `hoverPart` in the store. The other view isn't rendered at the same time, so this matters mostly for the cross-view selection memory and for solo view. It costs little and keeps identity consistent.
- *+ / − / Fit / Repack* become an icon cluster matching the 3D view controls.

## 10. Start screen (`src/ui/MaterialDialog.tsx`, `src/ui/TemplateUI.tsx`)

- A full-screen cream page, "What are you making?", following mockup 2's order: **Step 1: material** (4 cards), then **Step 2: template** (Blank / Organiser with dividers / Card stand). The current dialog asks for the template before the material.
- **Card art without Gemini:**
  - Material swatches are CSS/SVG illustrations of a corner of the sheet, showing its layers: ply stripes, corrugated flutes, card edge.
  - Template thumbnails are **rendered from the real templates** with the new 3D renderer into an offscreen canvas at first load (cached as data URLs in memory). They always match the generator.
- A **Start** button, primary teal, bottom-end. The language toggle stays top-end, keeping `lang-toggle-dialog`.
- Out of scope: "Recent projects" (only one autosaved design exists today). Leave room in the layout.

## 11. Part names

- `src/templates/*` already has roles. Give each generated panel a translated role name: Base, Front wall, Back wall, Left wall, Right wall, Divider 1…, Lid, Lid wall, Side, Support, Lip. Put the keys in `en.ts`/`he.ts`, and store the key, not the string, so switching language renames.
- Hand-drawn panels: the first is "Base". Grown panels are named from their relation ("Wall 1", "Wall 2"…), editable. Migrating old projects keeps their names.

## 12. Constraints and verification

- **Keep every `data-testid`.** The e2e suite (`tests/e2e/*.spec.ts`) uses about 110 of them. Where a control changes form:
  - The angle dial renders an accessible radiogroup (visually part of the dial, keyboard-operable) that keeps `grow-angle-{90,60,45,30,15}`.
  - `grow-height` stays on the grow card's scrub field input.
  - `grow-flip` moves to the flip-arrow badge.
  - `grow-go` goes on *Add panel*.
  - `material-select` stays on a real `<select>` inside the drawer, or the tests are updated in the same commit.
  - `save-project` and `open-file` live in the project menu.
  - `open-teacher` is removed: update `classroom.spec.ts` to navigate to `/#/teacher`.
- **i18n:** every new string goes in both `src/i18n/en.ts` and `he.ts`. `tests/i18n.test.ts` checks completeness and that no UI text is hard-coded. Check the RTL layout with the rail and card mirrored, while the stage, dial and numbers are not mirrored.
- **Performance budget on Chromebooks:** the idle stage renders 0 frames per second (`frameloop="demand"`). Simple quality holds 30+ fps while orbiting the organiser template with lid under Playwright CPU throttling ×4. Outline geometry is cached per part.
- **Accessibility:** focus rings in `--accent-bright`; every icon button has a translated `aria-label` and tooltip; widgets have keyboard equivalents (arrow keys on a focused dial or arrow; Enter to type a dimension).
- **Done means:**
  - `npm run typecheck`, `npm test` and `npm run e2e` are green.
  - New e2e checks cover dial detents, push-pull, the flip arrow, the in-place dimension edit, a seam pill opening a joint card, the material drawer and the fold slider.
  - A screenshot set (start screen, 3D organiser idle, selected wall, grow at 60° and at blocked 45°, folded corrugated tray mid-unfold, cut plan; EN and HE) is saved to `docs/overhaul-shots/` for review.
  - `DECISIONS.md` gets an "Interface" section update.

## 13. Order of work inside the single branch

1. Tokens, font and icon set; restyle the base elements (buttons, inputs, cards, modals).
2. Shell: top bar with project menu, material pill and drawer, floating rail, contextual card container, View popover. Fix the hint text for template starts.
3. 3D look: palette and part tints, face/edge materials, lighting, outlines toggle, Quality (Simple/Rich/Auto), on-demand rendering, selection styling, auto-fit on blank view.
4. Edge discoverability and picking; ghost restyle including the blocked state.
5. Widgets: angle dial, push-pull, flip arrow, in-place dimensions; grow card replaces EdgeBar.
6. Seam pills and joint card; inspector cards with ScrubField, Stepper and Segmented.
7. Role names (templates plus grown panels) and the matched tint in the cut plan; cut plan restyle.
8. Folds: bent strip, crease, fold slider and animation.
9. Start screen with rendered template thumbnails.
10. Tests, the screenshot set, docs.
