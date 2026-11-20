# CutForge: named styles in the sentence builder (milestones C1–C5)

Status: plan, 2026-11-19; **built 2026-11-20 as C1–C5** (see `PROGRESS.md`; what changed from this plan is in `DECISIONS.md`). The card grid is a switch beside the sentence (the owner, 20 November): §3's decisions 1–2 are superseded. It extends `SENTENCE_BUILDER_PLAN.md` (S1–S7, milestones 94–100 in `ROADMAP.md` §5, on `origin/claude/bold-archimedes-aib4wy`). Its own milestones are named C1–C5 here; §6 proposes their numbers.

**In one paragraph.** The sentence's first word, *[a box ▾]*, today lists a handful of structures. This plan turns that list into a catalogue of named packaging styles: the twenty styles of Die Cut Studio's gallery (2026-11-19), less the pillow box. Each one is a style the packaging trade already names (*Reverse tuck end*, *Tuck-top snap-lock*, *Regular slotted container*). Picking one fills in several words at once. A style is not a new template: it is **a name for a set of words**, and the sentence shows the name whenever its words match one. Eight styles need nothing but words, three need small additions to the engine, and the rest need new geometry (crash-lock bottoms, a gable top, n-sided carton ends, flaps folded flat).

## 0. Sources and licence

- **Die Cut Studio** (`gitlab.com/pradeepsiddappa/die-cut-studio-public`, read 2026-11-19). MIT licence, © 2026 Pradeep Siddappa. It is a 2D dieline generator: every model is `(L, W, H, thickness) → flat dieline`, and its 3D is derived from the flat net. Its `docs/models/*.md` give each style's anatomy, formulas and dimension semantics, and `docs/box-styles-catalog.md` maps each one to its ECMA / FEFCO code.
- **What we take:** the list of styles; their anatomy and proportions, from `docs/models/*.md`; the trade codes, as references to check (that catalogue itself says some ECMA numbers are approximate); and the tests at several sizes per model.
- **What we do not take:** its code, its flat-net builders, its UI and its gallery layout. CutForge is 3D-first (boards, joints, trays, closures and several materials), so a flat-net function has no place to land. Any formula constant we copy is credited in `THIRD_PARTY.md` (MIT asks for the notice).
- **Names in the interface** are the trade's own (*Straight tuck end*, *Crash-lock bottom*, *Regular slotted container*), never another tool's name or brand.
- **Patents.** Die Cut Studio's auto-bottom doc cites US 6,386,437 for its mechanism. C3 builds the generic B40 crash-lock bottom from public descriptions; before C3 ships, the owner confirms that patent's status. Branded lock variants are out (see that catalogue's §12 flag list).

## 1. The twenty styles against the engine today

Checked on `origin/main` at `1917440`. *Golden* means a case in `tests/goldenDesigns.ts` already builds it.

| # | Style | Trade code (to check) | Materials | On `main` today | What it needs | Milestone |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Straight tuck end | ECMA A50 | card | A carton with a tuck top; its tuck bottom folds off the front (a reverse tuck, `types.ts`) | A bottom tuck off the back wall: S3's *tuck direction* word, built in the engine | C2 |
| 2 | Reverse tuck end | ECMA A55 | card | `top: 'tuck', bottom: 'tuck'` (golden `cartonDesign`) | Words only | C1 |
| 3 | Auto-bottom lock (RTE + crash-lock) | ECMA A67 / B40 | card | — | A crash-lock bottom | C3 |
| 4 | Tuck-top auto-bottom | ECMA A65 | card | — | A crash-lock bottom with a straight tuck top | C3 |
| 5 | Tuck-top snap-lock | ECMA A60 | card, corrugated 1.6 | `top: 'tuck', bottom: 'snap'` (golden) | Words only | C1 |
| 6 | Sealed-end carton | ECMA A10 / B10 | card, corrugated 1.6 | `top: 'seal', bottom: 'seal'` (golden) | Words only | C1 |
| 7 | Open tray | ECMA C10 | all | S2's tray: a box with no lid, 30 mm tall to start | Words only | C1 |
| 8 | Hinged-lid tray | ECMA C30 | card, corrugated | A box with a hinged lid that closes with a tuck (`closureStyles`) | Words only | C1 |
| 9 | Pillow box | ECMA E10 | — | — | Curved creases: not in the model (`DIELINE_DNA_PLAN.md` §9) | **Not planned** |
| 10 | Open sleeve | ECMA D10 | card, corrugated | S3's sleeve | Words only | C1 |
| 11 | Drawer box | tray + sleeve | card, corrugated | A tray and a sleeve, each on its own | A sleeve sized from the tray's measured outside, with thumb notches (the sentence plan's §8) | C2 |
| 12 | Regular slotted container (shipping box) | FEFCO 0201 | corrugated 1.6, 4 | `seal` ends: all four flaps meet in the middle, so that is FEFCO 0204, not 0201 | An `rsc` end: every flap W/2 deep, slots between the flaps | C2 |
| 13 | Tray + lid (telescope) | ECMA C20 / FEFCO 0301, 0304 | all | A box with a lid that lifts off (a cap; a full rim through `setCapRim`) | Words only | C1 |
| 14 | Gable top box | gable (no clean ECMA code) | card | — | Peaked end walls, roof boards grown at an angle, lock ears into slits, a handle slot | C4 |
| 15 | Hexagon box (one piece) | ECMA E50 | card | A 6-sided open box; a carton needs four sides (`boxRecipe`) | Carton ends on an n-sided tube | C4 |
| 16 | Hexagon box + lid | — | all | A 6-sided box with a lift-off lid builds with no blocking issue in card, corrugated 1.6 and plywood (checked) | Words only | C1 |
| 17 | Diamond envelope | craft | card | — | Shaped flaps folded flat (D3b) | C5 |
| 18 | Pocket envelope | craft | card | — | The same | C5 |
| 19 | Presentation folder | craft (not in Die Cut Studio's public repo) | card | Card slits as *Cut* lines (milestone 83) | A fold that lies flat (180°), pocket flaps with glue tabs (D3b) | C5 |
| 20 | Gift-card holder | craft | card | Corner slits as *Cut* lines (milestone 83) | A board folded flat at 180° | C5 |

After C1: 8 styles. After C2: 11. After C3: 13. After C4: 15. After C5: 19.

## 2. The model

### 2.1 A style is a name for a set of words

`src/templates/styles.ts`:

```ts
export type StyleDef = {
  id: string;                          // 'rte', 'ste', 'tuckSnap', 'rsc', …
  structure: string;                   // the template it sets: 'box', 'tray', 'carton', 'sleeve', 'drawer', …
  words: Params;                       // the words it fixes, e.g. { top: 'tuck', bottom: 'tuck', tuckFrom: 'opposite' }
  defaults?: Params;                   // sizes it starts at when chosen from scratch (never over a size already typed)
  group: 'boxes' | 'cartons' | 'shipping' | 'flat';
  uses?: ('cosmetics' | 'pharma' | 'food' | 'gift' | 'retail' | 'shipping' | 'stationery')[];
  code?: string;                       // shown only once the owner has checked it (the sentence plan's decision on trade codes)
  status: 'planned' | 'beta' | 'stable';
};
export const STYLES: StyleDef[];
/** The style whose words all match, the most specific first; null when none does (the sentence then shows the plain structure word). */
export function styleOf(structure: string, p: Params): StyleDef | null;
```

- **No new template per style.** A style picks a structure and fixes some of its words. `regenerate`, `changeMaterial`, milestone 88's sizes, missions and the library see an ordinary sentence design. Nothing new is stored: the style is worked out from the words every time.
- **The word reads the style.** *I'd like to make [a reverse tuck end carton ▾] that is…* when the words match. Change *bottom* to *snap-lock* and it reads *[a tuck-top snap-lock carton ▾]*. Change it to a combination no style names and it reads *[a carton ▾]*. The line under the sentence names the style, with its code once checked.
- **Choosing a style** goes through the resolver's `chooseStructure` and then `choose` for each of its fixed words, in sentence order. The rules of S1 apply unchanged: a word the material cannot have takes its fallback, and the note says so.
- **The list hides what cannot be made.** A style is listed only when its structure is allowed and every word it fixes is allowed (`allowed` of S1) in the chosen material. On plywood the list holds boxes, trays, *Tray + lid* and *Hexagon box + lid*; every carton, the RSC and the flat pieces are hidden.

### 2.2 The first word's list

- **Grouped:** *Boxes and trays · Cartons · Shipping · Flat pieces*, each with its group heading.
- **Each entry** has a picture (`renderThumbnail`, cached by style and material), the style's name, a one-line description (*Tuck top, glue-free 1-2-3 bottom*) and, in grey, its code once checked. The structures stay at the top of their groups as plain words (*a box*, *a carton*) for anyone who wants to build up from the words.
- **Keyboard and screen readers** as in the sentence plan §4.3, with each option named alone: *Reverse tuck end carton: tuck top and bottom from opposite sides*.
- **Narrow screens:** the same list as a sheet (the sentence plan §4.4).

### 2.3 New words and structures

| Key | On | Options | Allowed by |
| --- | --- | --- | --- |
| `tuckFrom` | carton, when `top` and `bottom` are both `tuck` | *same side* (STE) · *opposite sides* (RTE) | the material folds |
| `bottom` | carton | adds *crash-lock* (C3) | card |
| `top` | carton | adds *gable* (C4) | card; a rectangle |
| `ends` | carton | adds *RSC flaps* (C2) | corrugated |
| `drawer` | a new structure | the tray's words plus `fit` (the sleeve's clearance, from the material's `clearance`) | card, corrugated |
| `envelope`, `folder`, `cardHolder` | new structures (C5) | their own flaps and pockets | card |

Every key and option goes in `en.ts` and `he.ts` under `sen.*` and `style.*`. The owner checks the Hebrew.

## 3. Decisions (defaults; change them here before work starts)

| # | Topic | Default |
| --- | --- | --- |
| 1 | Where styles appear | In the first word's list only. The welcome screen keeps the sentence, not a card grid (the sentence plan's decision 3 stands). |
| 2 | A card gallery like Die Cut Studio's | Belongs to Guided's gallery (G3, *Things and the gallery*): its things become the styles, shown as cards with their pictures. No second list. |
| 3 | Tags (*Cosmetics, Pharma, Gift…*) | Stored as `uses` on each style. Not shown in the sentence's list; Guided's gallery may filter by them. |
| 4 | Proportions of the existing cartons | Unchanged: goldens byte-identical. New geometry (crash-lock, gable, RSC) may take Die Cut Studio's proportions, credited. Retuning today's tuck and snap-lock flaps would be its own change, and would regenerate goldens on purpose. |
| 5 | Pillow box | Not planned until the model has curved creases. |
| 6 | Presentation folder | Designed from public descriptions; Die Cut Studio's public repo has no model for it. |
| 7 | Trade codes | Shown only once the owner has checked each one (as the sentence plan decided). |

## 4. Rules for the implementer

- As the sentence plan's §6: one commit per milestone, named with its number and letter; typecheck and `npm test` after each; a look in the dev server; no deploys; `SITE_PASSWORD` untouched.
- **Goldens stay byte-identical.** Each new style adds its own golden case, in its first listed material, at its default size.
- Styles, words and structures are pure and unit-tested. Structures go in `src/templates/structures/`, styles in `src/templates/styles.ts`, geometry in `src/model/`.
- Every new control gets a `data-testid` and a `FEATURES` row with its state in Guided, Quick build and Workshop (`ROADMAP.md` rule 4b).
- The templates fuzzer (`tests/fuzz/templates.test.ts`) covers every new structure. It needs commit `d0192a8` (`pipecheck` accepts `val.tooBigGrain` and the kiss-score note), or rounded and corrugated boxes give false failures.
- Update `PROGRESS.md`, `DECISIONS.md` and `THIRD_PARTY.md` after each milestone.

## 5. Milestones

### C1. Styles as named sets of words (no new geometry)

- `src/templates/styles.ts` (§2.1) with the eight styles that need only words: Reverse tuck end, Tuck-top snap-lock, Sealed-end carton, Open tray, Hinged-lid tray, Open sleeve, Tray + lid, Hexagon box + lid.
- The grouped list (§2.2), the style name in the word and in the line under the sentence.
- Tests (`tests/styles.test.ts`):
  - for every style, `styleOf(def.structure, words after choosing it) === def`;
  - choosing a style, then changing one of its words, names the new style or none, and never leaves a stale name;
  - every listed style builds with no blocking issue in every material that lists it, at its default size and at the ends of its size limits;
  - on plywood, no carton, sleeve or flat piece is listed;
  - the random walks of S2 and S3 also start from styles.
- **Done when** each of the eight starts from the sentence and reaches *Ready to cut ✓* in its first material.

### C2. Three small additions: straight tuck, the RSC and the drawer

- **Straight tuck end.** The carton's tuck bottom folds off the back wall when `tuckFrom` is *same side*. Read `cartons.ts` first: the bottom tuck's wall is chosen with `backAndFront`.
- **Regular slotted container.** An `rsc` end in `cartons.ts` beside `seal`: every flap W/2 deep (W, the shorter side), the long sides' flaps meeting in the middle and the short sides' flaps leaving a gap, with slots one thickness wide between flaps instead of tapers. Corrugated only. `seal` stays as it is (it is FEFCO 0204).
- **Drawer.** A structure of two trays: an open tray, and a sleeve sized from the tray's **measured** outside (built, then read) plus the material's `clearance`, with a thumb notch at each open end. Changing the tray's size re-sizes the sleeve.
- Tests: STE and RTE differ only in which wall the bottom tuck folds off; an RSC of 300 × 200 × 200 in corrugated 4 has four 100 mm flaps per end and its short flaps leave a 100 mm gap; a drawer's tray slides in its sleeve with `clearance` on each side (checked on the built design); goldens for each.

### C3. The crash-lock bottom

- A `crash` bottom in `cartons.ts`, as derived flaps like today's `snap`. Major flaps off the front and back, W/2 deep, each with a 45° crease from its hinge corner that cuts off a glue triangle; minor flaps off the sides, L/2 deep. In 3D the bottom is shown erected and locked.
- The glue triangles go on the glue layer (milestone 89's glue areas) and in the spec sheet.
- Before shipping: the owner confirms the patent question of §0.
- Styles added: Auto-bottom lock (RTE top), Tuck-top auto-bottom (STE top, so after C2).
- Tests: the flat net's glue triangles are right isosceles with legs W/2; the bottom covers the whole base in 3D with no gap over 0.5 mm; card only, refused with a reason elsewhere; goldens.

### C4. Shaped ends: the gable top and n-sided cartons

- **Spike first** (one test file): end walls with a peaked outline, a board grown from the front wall's top at the roof angle, and its joint to the peak's sloped edge. Does `solve` and `adapt` give a closed roof? If not, write down the smallest change.
- **Gable top**: a `gable` top on a rectangular carton. End walls peaked to the ridge; roof boards off the front and back meeting at the ridge, each with a handle slot; lock ears at the roof's top corners into slits near each peak. Tuck bottom.
- **n-sided carton ends**: a carton on a regular polygon (3–12 sides; 6 for the Hexagon box). The tube glued at one corner, each end closed by a polygon lid hinged on one wall with a tuck, and dust flaps where the material allows. This lifts the four-sides rule in `boxRecipe` for these ends only.
- Styles added: Gable top box, Hexagon box (one piece).
- Tests: the gable's two handle slots line up in 3D within 0.5 mm; a 6-sided carton's ends close with no gap over 0.5 mm; goldens.

### C5. Flat pieces: envelopes, the folder and the gift-card holder (after D3b)

- **Spike first:** `DIELINE_DNA_PLAN.md` D7's first question, whether a grown board at `angle: 180` solves, unfolds and exports. These pieces need folds that lie flat.
- **Envelope** (diamond and pocket): a base board with four shaped flaps (D3b's tuck, glue and plain shapes), folded flat in layers like today's seal flaps (`flaps3d`), with rounded tips. Card only.
- **Presentation folder**: two covers joined by a fold that lies flat; a pocket flap off each bottom edge with glue tabs folded behind; card slits on one pocket as *Cut* lines.
- **Gift-card holder**: one board folded once, with four corner slits as *Cut* lines.
- Styles added: Diamond envelope, Pocket envelope, Presentation folder, Gift-card holder.
- Tests: each folds flat in 3D with its layers in order; each flat net matches its folded size; goldens.

## 6. Where it goes in the order (proposed)

C1 and C2 need only the sentence's own milestones, so they go before the sentence's verification (S7), which then checks them too. C3 and C4 need nothing from the other plans, but they can wait behind the 2D editing and Guided mode, which the owner asked for first. C5 needs shaped flaps (D3b).

Proposed numbers, if this is merged into `ROADMAP.md` §5.1 (every later row moves up by the count shown):

| # | Milestone | Plan |
| --- | --- | --- |
| 92–99 | as today (G1, D5a, S1–S6) | — |
| **100** | **Styles as named sets of words** | C1 |
| **101** | **Straight tuck, the RSC and the drawer** | C2 |
| 102 | Sentence verification (now also of C1–C2) | S7 (was 100) |
| 103–106 | Outline mode, the sketch engine, the transform frame, edit outlines | D0, D0b-1, D0c, D0b-2 (were 101–104) |
| 107–112 | Guided mode | G2–G7 (were 105–110) |
| 113–114 | The edge-feature registry, shaped flaps | D3a, D3b (were 111–112) |
| **115** | **The crash-lock bottom** | C3 |
| **116** | **Shaped ends: the gable top and n-sided cartons** | C4 |
| **117** | **Flat pieces: envelopes, the folder, the gift-card holder** | C5 |
| 118–122 | The Net view, building in the flat, the artwork template, board grades, production | D1, D2, D8, D5b, D9 (were 113–117) |
| 123 | Verification of 92–122 | all four plans (was 118) |

As blocks, C3–C4 can move anywhere after 102, and C5 anywhere after D3b. Guided's G3 (gallery) reads `STYLES` from C1 onward, so its gallery grows with each milestone here.

### Rough guesses

| Milestone | Time |
| --- | --- |
| C1 | four to five days |
| C2 | a week |
| C3 | a week |
| C4 | a week and a half (the spike decides) |
| C5 | a week and a half, after D3b |

## 7. Still open (defaults chosen; say if you want them different)

- Whether the welcome screen should also offer a card grid of styles, beside the sentence, instead of only Guided's gallery (§3, decisions 1–2).
- Whether to retune the existing carton flaps to Die Cut Studio's proportions (§3, decision 4). Doing so regenerates the carton goldens.
- Whether the gable top and the flat pieces should also come in corrugated 1.6.
- Die Cut Studio's other families (animal treat boxes, tags and wraps, display cards, party pieces) are not in this plan. Most are flat pieces that C5 would make possible.
