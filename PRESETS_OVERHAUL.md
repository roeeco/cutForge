# CutForge: presets overhaul — one collection of distinct things, each shown the way it works (milestones 146–155)

Written 2026-11-21 on `main` at `126556f`, after milestone 145 (the QA round) and the SVG pictures (`src/views/illustrate.ts`). It replaces an earlier draft of this file, which was written against `1917440` (milestone 91) by mistake.

Evidence: every preset was built in every material and drawn with the app's own picture function (`designPicture`: the SVG, WebGL as fallback), beside the WebGL thumbnail, and eight were opened on the stage. The sheets are in `docs/preset-shots/before/`:
- `sheet-1…4-*.png`: 38 presets × 4 materials. In each pair, the left image is the SVG picture the app shows and the right image is the WebGL thumbnail. A dash means the material doesn't make it.
- `stage-after-start.png`, `sentence-list-card.png` and `guided-gallery-ply.png`.

## 1. What a "preset" is today

A preset is any ready starting point a student picks. There are **38**, spread over four lists that grew separately:

| List | Where it is shown | Entries | Defined in |
| --- | --- | --- | --- |
| Structures | the sentence's first word | 10: `box`, `tray`, `carton`, `sleeve`, `drawer`, `envelope`, `folder`, `cardHolder`, `stand`, and `organiser` (cards only) | `templates/registry.ts`, `templates/structures/*` |
| Styles | the sentence's first-word list, grouped | 18 (`autoBottom` planned) | `templates/styles.ts` |
| Missions | Quick build's *Follow a mission*, Guided's gallery | 5 | `easy/missions.ts` |
| Guided things | Guided's gallery | 6: `box`, `box-lid`, `round-box`, `carton`, `pyramid`, `diamond` | `guided/things.ts` |

Pictures come from `views/picture.ts`. It draws the SVG illustration and falls back to the WebGL thumbnail. A third route is being prepared: 30 AI-rendered product images (`docs/welcome-ux-review-2026-11-20/preset-image-prompts.md`).

## 2. What is wrong

### 2.1 Some are the same thing twice

**The same design under two names.** These five pairs build the same design (or the same with one size changed):

| Pair | Why |
| --- | --- |
| `openTray` = `tray` | alias, no words fixed |
| `drawerBox` = `drawer` | alias |
| mission `card-stand` = `stand` | same template, same defaults |
| Guided `box-lid` ≈ `trayLid` | same structure and words; only the sizes differ |
| Guided `carton` = `carton` | the structure at its defaults |

**Different designs, the same picture.** These groups build different designs, but at the size a picture is seen they look the same:

| Group | Members | What actually differs | Why it does not show |
| --- | --- | --- | --- |
| A. Tuck cartons | `carton`, `ste`, `rte`, `tuckSnap`, Guided `carton` (and `autoBottom` when offered) | the bottom, and which panel each tuck hinges from | the picture is from above, and the bottom is underneath |
| B. Closed bricks | `sealed`, `rsc` | flap depth, and the slots between flaps | the flaps are drawn closed |
| C. Open rectangular box | `box`, `tray`, `openTray`, Guided `box`, mission `escape-box` | height; Escape box's hasp and lid only come later | — |
| D. Box with dividers | `organiser`, `pencil-box`, `game-organiser` | sizes and the number of dividers | — |
| E. Blank sheets | `envelope`, `diamondEnvelope`, `pocketEnvelope`; `presFolder` nearly | the flap outline (diamond vs pocket), pockets, slits | the flaps are folded flat at 180°, and edge flaps are not drawn at all (§2.2, R1) |
| F. Footprint only | `hexLid` vs `trayLid`, `hexBox` vs `hingedTray` | 6 sides vs 4 | — (each pair is acceptable as two footprints of one thing) |
| G. Sleeve vs box | `openSleeve`, `sleeve` vs `box` | the sleeve has no base | seen from above, a tube looks like a box |

Of 38 entries, about **15 look different from each other**.

### 2.2 How they are shown

| # | Defect | Seen in | Cause |
| --- | --- | --- | --- |
| R1 | **Flaps are not drawn in pictures.** Carton end flaps, RSC flaps, glue flaps, closure flaps, envelope and folder flaps, gable lock ears are all missing. | sheets 2–3 | `illustrate.ts` draws `panelShape`, bands and lid poses only. It draws neither `ConnGeom.flaps3d` nor the edge-feature registry (milestones 111–112). |
| R2 | **One camera for everything.** Every picture is from the front-right, about 41° above (`VIEW`). A carton's bottom, a drawer's front and a stand's lean are never seen. | all sheets | the fixed `VIEW` constant |
| R3 | **Shown as cut, not as used.** The drawer's tray sits beside its sleeve, which stands on end. Envelopes are closed flat. The folder's pockets lie at 3°. The gift-card holder holds no card. A sleeve holds nothing. | sheet 1, `stage-after-start.png` | Pictures and the stage both draw the design pose. Only lids have a view-only pose (`lidPose`). |
| R4 | **White card disappears.** White card on a pale #EEF1F5 background, with a thin grey outline, reads as an empty frame at 64 px (the sentence list). On the stage, card renders grey (the welcome review's W10). | `sentence-list-card.png` | `LOOK.card`'s contrast is 0.55; the stage material |
| R5 | **The stage opens without showing the point of the preset.** Tall cartons are cropped at the top at 1200 × 800. The tuck cartons look the same on the stage too. The fold slider plays the walls, but nothing shows how the thing *closes*. | `stage-after-start.png` | camera fit, and no closing animation |
| R6 | **Three picture systems are in flight**: the SVG, the WebGL fallback, and the 30 planned raster images. A raster image is fixed at one size and one material. The list would show one object and the live preview another, and they drift apart with every engine change. | `picture.ts`, `preset-image-prompts.md` | — |

### 2.3 What is missing

The engine has more than the collection shows, and the materials are not served evenly:

| Material | Distinct presets today | Missing, though the engine (nearly) has it |
| --- | --- | --- |
| Plywood 3 | open box, organiser, lidded box (rect and hex), hinged tray, stand, round box (Guided only), escape box | a **living-hinge box** with a lid that flexes open (`bendPatterns.ts`), a **dice tower** (angled boards between side walls, `addSideWalls`), a **phone/tablet stand**, a **pen cup**, a **magazine file** |
| Corrugated 4 | open box, organiser, lidded box, RSC, sleeve, stand | the **mailer box** (the roll-end, tuck-front box most often laser-cut from corrugated), the magazine file |
| Card | most styles | a **window carton** that shows its window (the word exists; pictures don't show it), a **triangle prism carton** (n-sided cartons, C4), a **pen cup** |
| Any | — | the **round box** is only in Guided, not in the sentence |

The pillow box stays out: it needs curved creases (`SENTENCE_STYLES_PLAN.md` §1 #9).

## 3. Rules for the new collection

1. **One card per thing that looks and works differently.** Variants that differ only underneath, or only in footprint, are one card with a **variant switch**. The variant's picture must show the difference (§4.3).
2. **Every preset has a tell**: the feature that tells it apart from every other card. Its picture is posed so the tell is visible: a tuck half open, a lock seen from below, a drawer half out, an envelope's flaps open.
3. **Pictures are generated, never painted.** Each picture is the real design in a view-only pose, so it follows material and sizes and cannot drift. The raster prompts become the art direction for the poses (§4.6).
4. **One catalogue.** A single list feeds the sentence, the cards, *Follow a mission* and Guided's gallery. Missions become **challenges** on a card. Guided things become a card plus a variant. Saved designs keep their ids (`template.id`, style words, `mission.id`).
5. **Each material gets at least six distinct cards**, so plywood and thick corrugated stop being "boxes only".
6. **A look-alike fails the build** (§5.1), instead of being caught in review.

## 4. Showing them: one posing layer for pictures and the stage

### 4.1 `views/pose.ts`: a view-only pose per preset

This generalises `lidPose.ts`. It runs after `foldDisplay` and changes only display transforms, never the design.

```ts
export type PresetPose = {
  view: 'front34' | 'side34' | 'under34' | 'top';  // camera direction
  inset?: 'under34' | 'front34';                    // a second, small view in the corner (carton bottoms)
  open?: { lids?: number; tucks?: number; ends?: number; edgeFlaps?: number }; // 0 shut … 1 fully open
  assemble?: { drawer?: number };                   // 0 out … 1 in; the sleeve stands as it is used
  cutaway?: string[];                               // boards drawn as a ghost (a dice tower's near wall)
  props?: Prop[];                                   // pencils, dice, sweets, + cards, letter, giftCard, sheets, soap
};
```

What it needs from the model:
- **Flap hinges.** `Flap3d` gains its hinge line (two points and an axis), so a flap can be posed part-open instead of only folded flat. The flaps come from `cartons.endGeom`, `closures.closureGeom` and `lid.flatLidGeom`.
- **Edge-feature angles.** An edge flap's display angle can be overridden: an envelope's flaps at 120°, a folder's pocket at 30°.
- **The drawer's relation.** The drawer builder (`drawerShell`) already knows the tray and its sleeve. The pose moves the tray into the sleeve's frame and stands the sleeve as it is used.

### 4.2 Pictures (`illustrate.ts`)

1. Draw `flaps3d` and edge features (R1), with the same face splitting and painter's order as boards.
2. Draw a board's *Cut* lines and windows. Slits are the tell of the folder and the gift-card holder.
3. Take the camera from the pose. `under34` looks from below at about 35°, with the ground shadow dropped.
4. Draw the inset as a second projection into a corner circle, about 38% of the height.
5. Raise card's contrast to 0.8 with a darker outline, and use a warmer background for card pictures, so white card reads at 64 px (R4).
6. Add the new props as simple solids, like the existing pencils and dice.
7. Retire the WebGL fallback once the coverage test (§5.2) passes for every preset.

### 4.3 Variants that look different

| Card | Variant switch | How each variant's picture differs |
| --- | --- | --- |
| Tuck-end carton | bottom: tuck (same side), tuck (opposite), snap-lock, crash-lock | main view: top tuck half open (same for all). Inset from below: the bottom flaps, posed `ends: 0.3`, so the lock pattern shows. Same vs opposite shows as which side the bottom tuck is lifted from. |
| Lidded box | footprint: rectangle, hexagon, round | lid lifted and tilted above the box |
| Hinged box | footprint: rectangle, hexagon | lid open at about 110°, tuck visible |
| Flapped box | flaps meet in the middle (sealed) / RSC | top flaps standing open at 100°, so their depth and the slots show |
| Envelope | diamond / pocket | flaps open at 120°, a letter half out; the diamond's points are visible |

### 4.4 The stage

1. A preset opens in its hero pose, framed on the **projected** bounding box so nothing is cropped (R5). Selecting a board shuts the pose, as `lidPose` already does, so the student draws on the board where it really is.
2. **Show how it closes.** A play button beside the fold bar animates the closing order. The order comes from `assemblySteps` (milestone 131): walls fold up, glue seams close, end flaps fold in, tucks go in, the drawer slides home. Each step reuses the pose fields of §4.1 with time as the fraction.
3. The variant switch from §4.3 is on the design card too, so a student who picked the wrong bottom can change it after Start.

### 4.5 The card colour on the stage

The stage renders card grey (W10). This is fixed in the stage's material, not in the pose, and it is in milestone 149.

### 4.6 Raster images

**Recommendation:** don't put the 30 AI images on preset cards. Keep them, if wanted, for the welcome screen's three large tiles, which already use photos (`public/welcome`). Their prompts become the pose table: the same "flap half open, lid lifted, contents inside", but drawn from the real design (R6).

## 5. Tests

### 5.1 Distinctness (`tests/presetCatalogue.test.ts` and a browser spec)

- **Structural.** For every pair of shown cards (variant 0, every material that makes it), the fingerprints differ. The fingerprint combines:
  - the structure id
  - the multiset of connection kinds
  - the tray's `top`, `bottom` and `base`
  - bands present
  - the set of grow angles
  - the lid kind
  - the edge features
  - the bounding box's proportions, bucketed to thirds
- **Visual (browser).** Each card's picture is rasterised at 96 × 64 and given a perceptual hash. A pair of shown cards (or of variants within a card) closer than a threshold fails, naming both. Today the test would fail for groups A–G of §2.1. Those pairs go into an allowlist that milestone 146 creates and milestones 147–151 must empty.

### 5.2 Coverage (`tests/illustrate.test.ts`, extended)

For every preset × material, the illustration has faces for:
- every board
- every band
- every `flaps3d` polygon
- every edge feature
- every *Cut* line longer than 5 mm

This is the test that would have caught R1.

### 5.3 Poses (`tests/pose.test.ts`)

- The drawer at `assemble.drawer = 1` lies inside the sleeve's inside box, within clearance.
- An end flap at `open = 0` matches today's folded `flaps3d` exactly.
- A pose never changes the design (deep-equal before and after).

### 5.4 The contact sheet

`npm run preset-sheet` writes `docs/preset-shots/sheet-<material>.png`: every shown card and every variant, as the app draws it. It is the before/after for each milestone, made the same way as `docs/preset-shots/before/`.

## 6. The collection after the overhaul

★ new. ◐ beta. Materials: C card, c1 corrugated 1.6, c4 corrugated 4, P plywood 3.

| # | Card | Tell (hero pose) | Variants | Absorbs | C | c1 | c4 | P |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Boxes and trays** | | | | | | | | |
| 1 | Open box | corners per material (fingers, glue flaps); sweets inside | height sets *box* or *tray* (the sentence word stays) | box, tray, openTray, Guided box | ✅ | ✅ | ✅ | ✅ |
| 2 | Organiser | dividers with objects in the compartments | — | organiser; challenges: Pencil box, Game organiser | ✅ | ✅ | ✅ | ✅ |
| 3 | Lidded box | lid lifted and tilted | rect · hex · round | trayLid, hexLid, Guided box-lid | ✅ | ✅ | ✅ | ✅ |
| 4 | Hinged box | lid open at 110°; on plywood a living hinge | rect · hex | hingedTray, hexBox; challenge: Escape box (flat lid + hasp) | ✅ | ✅ | — | ✅ ★ |
| 5 | Round box | bend pattern visible, lid beside | — | Guided round-box (now in the sentence too) | ✅ | ✅ | ✅ | ✅ |
| 6 | Drawer box | assembled, drawer half out | — | drawer, drawerBox | ✅ | ✅ | ✅ | — |
| **Cartons** | | | | | | | | |
| 7 | Tuck-end carton | top tuck half open, bottom in the inset | 4 bottoms (§4.3) | carton, ste, rte, tuckSnap, autoBottom, Guided carton | ✅ | ✅ | — | — |
| 8 | Gable box | roof and handle, lock ears drawn | — | gable | ✅ | — | — | — |
| 9 | Flapped box | top flaps open | sealed · RSC | sealed, rsc | ✅ | ✅ | ✅ | — |
| 10 | Sleeve | around a bar of soap | — | sleeve, openSleeve | ✅ | ✅ | ✅ | — |
| 11 ★ | Mailer box | lid open, front tuck and dust ears | — | — | ◐ | ◐ | ◐ | — |
| 12 ★ | Window carton | a window with the object behind it | — | the `window` word, shown | ✅ | ✅ | — | — |
| **Flat pieces** | | | | | | | | |
| 13 | Envelope | flaps open, a letter half out | diamond · pocket | envelope, diamondEnvelope, pocketEnvelope | ✅ | — | — | — |
| 14 | Presentation folder | open at 160°, pocket lifted, sheets and a business card in the slits | — | folder, presFolder | ✅ | — | — | — |
| 15 | Gift-card holder | open at 120°, a card in the corner slits | — | cardHolder, giftCardHolder | ✅ | — | — | — |
| **Stand and play** | | | | | | | | |
| 16 | Stand | side view, cards leaning in it | cards · tiles · phone ★ | stand; challenge: Card stand | ✅ | ✅ | ✅ | ✅ |
| 17 ★ | Dice tower | near wall cut away, baffles visible, a die mid-fall | — | — | — | ◐ | ◐ | ◐ |
| 18 ★ | Pen cup | pencils standing in it, optionally a slanted top | sided · round | the dice tray challenge (a low hexagon) | ✅ | ✅ | ✅ | ✅ |
| 19 ★ | Magazine file | sloped sides, an A4 slab inside | — | — | — | ◐ | ◐ | ◐ |
| **Shapes** (Guided and the Shapes way in) | | | | | | | | |
| 20 | Pyramid | net half folded | — | — | ✅ | — | — | — |
| 21 | Diamond | as now | — | — | ✅ | — | — | — |

That is 21 cards in place of 38 entries, every one different from every other. Cards per material, counting beta: card 19, corrugated 1.6 15, corrugated 4 12, plywood 9 (today about 6 distinct for plywood).

The **triangle prism carton** waits until n-sided carton ends (C4) are checked for three sides. If they work, it is a footprint variant of card 7, not a card of its own.

## 7. Milestones

Each ends as before: typecheck, unit suite, goldens byte-identical unless a change is intended and listed, the browser spec, English and Hebrew, `README.md`, `DECISIONS.md`, `PROGRESS.md`, the feature table, and the contact sheet.

| # | Milestone | Done when |
| --- | --- | --- |
| **146** | **One catalogue.** `templates/catalogue.ts` lists the cards of §6 (family, variants, challenges, Guided entries) over the existing structures and styles; the sentence list, *Follow a mission* and Guided's gallery read it; aliases and duplicates leave the lists (their ids still open). `npm run preset-sheet`. The distinctness test lands with an allowlist of today's look-alikes. | Every saved design and mission file in `tests/goldenDesigns.ts` and the library fixtures opens unchanged; no list shows two cards with the same design. |
| **147** | **Pictures draw everything.** Flaps, edge features, cut lines and windows in `illustrate.ts`; card contrast; list thumbnails at ×2. | §5.2 passes for every preset × material; groups B and E drop out of the allowlist. |
| **148** | **Poses.** `pose.ts` with flap hinges on `Flap3d`, edge-flap angles, the drawer assembled, cutaways and the new props; `lidPose` folded into it. | §5.3; groups G and the drawer drop out; flat pieces show their tell. |
| **149** | **Views and variants.** Per-card camera, `under34` and the inset; the variant switch on cards and the design card; the stage's card colour. | Group A drops out: each of the four bottoms is told apart by the hash test. |
| **150** | **The stage.** Hero pose on open, projected-box framing, *Show how it closes* from `assemblySteps`; the pose shuts when a board is selected. | e2e: no preset cropped at 1366 × 768; the closing play runs for every card with a closure. |
| **151** | **Challenges and merges.** Missions as challenges on cards 2, 4, 16, 18; Guided's gallery from the catalogue; groups C, D and F settled as variants or challenges. | The allowlist is empty. |
| **152** | **New presets on the engine as it is:** Round box in the sentence, Pen cup (sided, round as beta), Window carton, Stand's phone variant, Hinged box on plywood with a living hinge. | Contract tests per card × material (the sentence's `cleanWith` for every word); goldens at defaults. |
| **153** | **New presets that need engine work:** Magazine file (a sloped wall outline that keeps its joints), Dice tower (angled baffles between side walls), Mailer box (a spike: a three-deep flap chain; if the spike fails, a hinged lid with a front lip and no tuck). All beta. | Each spike's result in `DECISIONS.md`; the fallback is taken if a spike fails. |
| **154** | **Words and pictures:** Hebrew names, `docs/preset-shots/after/`, README for students and teachers. | i18n coverage; the contact sheet reviewed in en and he. |
| **155** | **Verification**, as milestone 145. | `PROGRESS.md`. |

If time is short: 146–149 fix what the owner sees (pictures and look-alikes) without a new preset. 150 makes the stage show how things close. 152 is the first that adds variety.

## 8. Decisions for the owner

| # | Question | My call |
| --- | --- | --- |
| 1 | Posed SVG pictures on cards instead of the 30 AI images? | Yes. Keep the AI images for the three large welcome tiles only. |
| 2 | Merge the four tuck-end cartons into one card with a *bottom* switch, and `sealed` with `rsc`? | Yes. The trade names stay as the variant names, and the sentence still names the style when its words match. |
| 3 | Merge `tray` into *Open box* on cards, keeping *a tray* as a sentence word? | Yes. |
| 4 | Missions as challenges on a card, not cards of their own (Guided too)? | Yes. Guided keeps a *Missions* row that links to the same cards. |
| 5 | The new cards of §6 (mailer, window carton, pen cup, magazine file, dice tower, phone stand, plywood living-hinge box): anything to add or drop? | As listed. Mailer, magazine file and dice tower as beta. |
| 6 | Should *Show how it closes* play once on its own when a preset opens? | Once, the first time a student opens that card. After that, on demand. |
