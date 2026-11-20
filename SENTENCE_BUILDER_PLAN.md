# CutForge: the sentence builder, presets you say instead of pick (milestones S1–S7)

Status: plan, 2026-11-19. Revised the same day with the owner's answers (§0.1), and **merged the same day with `DIELINE_DNA_PLAN.md` and `GUIDED_MODE.md` into one order (`ROADMAP.md` §5; what that changed here is in §0.2 and marked *(merged)*)**. Nothing here is built.

**In one paragraph.** On the welcome screen, the grid of presets in step 2 is replaced by one sentence, next to *Blank design*. Every word in the sentence that matters is a button:

> I'd like to make **[a box ▾]** that is **[160]** wide, **[110]** deep and **[45]** mm tall **[inside ▾]**, with **[a lid that lifts off ▾]**, divided **[into 3 × 2 spaces ▾]**. **[+ more]**
> *Each space 51.3 × 53.5 mm · outside 166 × 116 × 51 mm · 11 pieces · 1 sheet, 58 % used*

The material chosen in step 1 sets what each list offers, and it applies to *Blank design* in the same way. Tapping a word lists only what that material and thickness can make. Every word stays changeable until *Start*. When a word changes, including a size or a count typed in a number field, the preset engine checks every word after it again. Underneath, a sentence is an ordinary template (`Design.template`) with parameters. No new geometry engine is needed and nothing new is stored.

## 0. Base, and the other plans

- **Base: `origin/main` at `1917440`** (milestone 91 and the fold overhaul). Do not build on `claude/guided-mode`: it is behind `main`. Every function named here was found with `grep` on that commit (re-checked at the merge: `lidWhy`, `lidStyleWhy`, `closureStyles`, `roundedMin`, `minWeb`, `MIN_COMPARTMENT`, `holeRecipe`, `compartments`, `DIVIDER_GAP`, `setTrayEnds`, `setClosure`, `boxRecipe`, `addDividerLine`, `renderThumbnail`, `TemplateDef.materials: MaterialKind[]`, `tplOk` in `StartScreen.tsx`); check each signature before using it.
- **Numbers S1–S7.** `main` has built up to milestone 91. *(merged)* `ROADMAP.md` §5 gives these their real numbers, in one order with `GUIDED_MODE.md` (renamed G1–G7, as this plan asked) and `DIELINE_DNA_PLAN.md` (D0–D10).
- **`PRESETS_PLAN.md`** (on `origin/claude/affectionate-clarke-7g8ybc`, not merged): its preset contract (§3) is the engine under the sentence. That means declared roles, one `limits(material, params)`, diagnostics that name a fix, families of presets over one builder, ids taken from roles, and a status per preset.
  - Its `when`, `affects` and grouped fields also make today's template card show only what is relevant after *Start* (S6).
  - One part is reversed: that plan hid presets a material could not make but greyed options inside the material drawer. Here, anything not relevant is hidden everywhere.
- **`DIELINE_DNA_PLAN.md`:** *(merged)* D5's size intent is its own milestone, **D5a**, built **before S1** (Guided's G4 needs it too); S2 uses it. It lives in `src/model/boxSize.ts`, not `sizes.ts` (milestone 88 owns that file). D6's four carton recipes become the carton words in S3, and **D6's row of style cards is replaced by the sentence**: D6 is dropped from the dieline plan, its mailer and *start from the product* moved to §8 here.
- **`GUIDED_MODE.md`:** its gallery could later open with the same sentence (§8). Nothing here waits for Guided, and nothing here blocks it. *(merged)* Guided's G1 (milestone 92) builds the divider fix S2 needs, and Guided's G3 takes its plain things (*Box*, *Box with a lid*, *Round box*, *Carton*) from the structures of S2–S3 instead of a list of its own.

### 0.1 The owner's answers (2026-11-19)

| Question | Answer |
| --- | --- |
| Where the sentence goes | Only the welcome screen, for now. It replaces the presets in step 2. *Blank design* stays. Step 1, the material, stays as it is and applies to both. |
| Options a material cannot make | Not shown. Each list holds only what the chosen material and thickness can make. Nothing is greyed, and there is no *Not in plywood* group. |
| Typed text | None in the sentence. Words are picked from lists; only numbers are typed, in number fields. A name to engrave is added in the editor after *Start*, as now. |
| Going back | Any word can be changed at any time before *Start*, including sizes and counts in number fields. The engine then checks every later word and keeps it, adjusts it or drops it. |
| Dividers | Two ways: the number of divisions each way, or the size of the spaces wanted. Whichever was not given is worked out and shown live. |
| Hebrew | The owner checks and debugs the Hebrew sentences. |
| Testing with people | Students and teachers already test the app. No separate study is planned. |

### 0.2 Merged with the other plans (2026-11-19)

| # | Meeting | Settled |
| --- | --- | --- |
| 1 | **Inside sizes**: this plan's S2 builds `boxSize` / `setBoxSize` "in `src/model/sizes.ts` (from D5)"; Guided's G4 needs the same | **D5a** (milestone 93) builds them once, in `src/model/boxSize.ts`, with `Design.sizeAs` (optional, absent = outside). S2 and G4 call them. *Divider keeps its distance from the side that did not move* is in `setBoxSize`. |
| 2 | **The `sizeAs` word** (a template parameter) and D5a's `Design.sizeAs` (a design field) | One value: `generate` writes the word into `d.sizeAs`, so after *Start* the box's card, a material change and milestone 88's size rows all read it. The sentence itself still stores nothing new; the field is D5a's. The list offers *inside · outside*, and *crease to crease* only for card and corrugated (where a crease exists). Since the fold overhaul a crease lies where the mid-planes meet, so for a folded box *crease to crease* is exactly *outside − t*. |
| 3 | **Styles**: D6's style catalogue and start-screen cards | Replaced by the sentence (S3's carton words; §8 for the mailer and sized-by-contents). D6 leaves `DIELINE_DNA_PLAN.md`. |
| 4 | **One list of things to start from**: Guided's G3 `things.ts`; D6's `STYLES` | **The template registry is the one list** (`src/templates/registry.ts` with `src/templates/structures/`). Guided's plain things are structures with their default words; missions stay missions. |
| 5 | **The divider fix** (Guided 87 item 2, "S2 builds it if `main` does not have it yet") | Re-checked on `1917440`: `regenerate` still has no divider step. Guided's **G1 is milestone 92**, before everything here, so S2 does not build it. |
| 6 | **Hidden, not greyed** | Applies to the sentence's lists and to the template card (S6). Elsewhere the app keeps greying with a reason (the *Lid* pictures of milestone 73, the grow card of 77–78): those are not changed by this plan. |
| 7 | **Board grades** (D5b; §8 *More boards*) | `materials(m)` and `allowed` check the thickness as well as the kind, so grades work in the lists unchanged when D5b adds them. Whether step 1 shows them stays D5b's question. |
| 8 | **Shaped flaps** (D3) | Needed by §8's envelope and the mailer's dust flaps on the lid; no first-release word depends on them. |
| 9 | **Feature rows** | The sentence is on `StartScreen` (Workshop and Quick build). Guided replaces `StartScreen` with its gallery (G3), so the sentence is not shown there until §8's *Guided's gallery opening with the sentence*. Each new control's row says its state in all three levels (`ROADMAP.md` rule 4b). |
| 10 | **The fold overhaul** (`1917440`) | Folded boxes are now the size of their model (no 2t growth), schema 11. The line under the sentence reads sizes from the built design (§3.5), so nothing here changes; goldens for card and corrugated were regenerated by that commit, not by this plan. |

## 1. What other generators do (looked at 2026-11-19)

| Tool | How you choose | What it gets right | What to avoid |
| --- | --- | --- | --- |
| Boxes.py (Festi) | A gallery of about 150 generators in 9 groups, then one long form | Joint sizes are multiples of the thickness, so they rescale with the material; dividers can be given as section sizes (`50*3`); an explicit *outside* switch | No dependency logic at all: every option always shows, and a bad combination makes a bad file; edges are set by single-letter codes |
| MakerCase | The structure first (basic, hinge, dividers, drawer, sliding lid…), then sizes, inside/outside, thickness, joints | The structure is the first choice; a live 3D view | — |
| Madegood box generator | Size, inside/outside, style (closed / tray / lid with a lip), lip clearance (shown for the lid style only), dividers each way, thickness, kerf, sheet | The closest to this sentence: fields depend on the style; it shows the values it worked out and warns about parts bigger than the sheet | — |
| Cuttle | Five box templates; sliders or typed values; inside/outside | A kerf test | — |
| Templatemaker.nl | A flat list of about 35 shapes (boxes, trays, mailers, envelopes, bags) | Fields for one shape appear only for that shape | No limits, no inside/outside |
| DieCut Templates | Material family first (folding carton · corrugated · rigid), then a subcategory, then a coded template | Material before structure, as here | — |
| Pacdora | 3000+ dielines by use or by structure | Says which of three sizes it means (outer, manufacturing, inner) | A catalogue too big to browse |
| Packhelp, Packlane, noissue | Product type, size, material, print, extras | The material narrows the later options; the result updates live | Listed sizes are outside sizes |
| FEFCO / ECMA | A code family, then a style | Sizes are inside sizes (L × W × D) | Codes mean nothing to a student |

Sources: the research of 2026-11-19 (the Boxes.py source on GitHub; madegooddesigns.com; cuttle.xyz; templatemaker.nl; diecuttemplates.com; pacdora.com; packhelp.com/fefco-codes). MakerCase's form and the ECMA group letters were not all checked first-hand.

None of these tools uses a sentence. Published reviews of sentence forms (Adrian Roselli; Adam Silver) list these problems:

- screen readers read the words without their sentence;
- there is no place for error messages;
- translations break the word order;
- lines wrap badly on a phone.

§3.4 and §4 answer each one: whole sentences per language, a readout line for messages, words named so they make sense alone, and a list layout on narrow screens.

What is taken:

- the structure word first;
- fields that depend on earlier choices (Madegood, Templatemaker);
- inside / outside as a word beside the numbers;
- dividers as a count or as the size of the spaces (Madegood, Boxes.py);
- a live picture, with a line of the values worked out;
- warnings about the sheet.

What is not: showing every option at once, or making a file the check would refuse.

## 2. What changes for a student

- **Step 1 is unchanged**: choose the material.
- **In step 2**, choose between *Blank design* and the sentence. The sentence has a live picture beside it.
- **Each list only offers what this material and thickness can make.** In plywood, a carton and a sleeve are not in the list at all.
- **Go back to any word and change it**, before or after the words that follow it. Those later words are kept when they still make sense. When they do not, they are adjusted, and a short note under the sentence says what changed and why: *Plywood can't fold, so the carton is now a box with a lid*, or *The box is narrower, so 4 spaces across became 3*.
- **Numbers say their limit.** Focusing a size or a count opens a slider that ends at the real limit and says why: *up to 132 mm tall: one sheet*. A typed number past the limit is refused, and the range is shown.
- **Spaces, two ways.** Either *divided into [3] × [2] spaces* (the line under it shows each space's size), or *divided into spaces of about [50] × [50] mm* (the line shows how many that makes and their exact size).
- **After Start** it is an ordinary preset design: the preset's card shows the same choices, and decorating works as it does for the organiser today.

## 3. The model

### 3.1 A word is a template parameter

A sentence design is `Design.template = { id: <structure>, version, params }`, so `regenerate`, `changeMaterial`, sizes (milestone 88), missions and the library treat it as they treat the organiser now. The material is the design's material (step 1); it is not a parameter. No new design field is added by this plan *(merged: `Design.sizeAs` is D5a's, §0.2 row 2)* and the schema version does not change.

`ParamDef` (`src/templates/types.ts`) gains optional fields:

| Field | Meaning |
| --- | --- |
| `when(p, m)` | The word appears only when this is true (for example `bottom` only for a carton). |
| `allowed(value, p, m) → boolean` | Per option: can it be made now? A false option is not shown. |
| `why(value, p, m) → MsgKey` | The reason an option dropped out. It is used only for the change note (§2) and the tests; it is never shown in a list. |
| `fallback(p, m)` | What the word becomes when its value is no longer allowed. By default, the first allowed option in the list's order. |
| `addon: { off: value }` | The word is a clause added with *+ more* and removed with ×. When the value equals `off`, the clause is left out of the sentence. |
| `affects` | The roles of the boards this word changes, so they light up in the picture (from `PRESETS_PLAN`). |

`TemplateDef` gains:

- `limits(m, p) → Record<key, { min?, max?, why? }>` (`PRESETS_PLAN` §3.2);
- `materials(m) → boolean`, which can check the thickness as well as the kind (in place of today's `materials: MaterialKind[]`, which stays readable);
- `status: 'planned' | 'beta' | 'stable'`;
- `fallback(m)`, the structure to become when this one stops being allowed;
- `sentence`, its sentence keys (§3.4).

The lists ask the engine, never a table of their own. `allowed` calls the functions that already decide these things:

- `lidWhy` and `lidStyleWhy` in `src/easy/lid.ts`;
- `closureStyles(kind)` in `src/model/closures.ts`;
- the carton rule in `boxRecipe` (a rectangle, and a material that folds);
- `roundedMin` for round and rounded shapes (`src/easy/recipes.ts`);
- `minWeb` and `MIN_COMPARTMENT`.

That way the lists cannot drift away from what the engine can build.

### 3.2 Structures

Structures share parameter keys wherever they mean the same thing: `width`, `depth`, `height`, `sizeAs`, `shape`, `lid`, `spacesBy`, `nx`, `ny`, `sx`, `sy`, `window`. So when *box* changes to *carton*, the sizes and the window are kept, and whatever a carton cannot have is dropped with a note.

First release (everything here is already in the engine):

| Word | Recipe on `main` | Shown for | Its own words | Add-ons |
| --- | --- | --- | --- | --- |
| a box | `boxRecipe(d, f, h, 'open' \| 'lid')`, `setBoxLid`, `addDividerLine` | all four materials | shape (rectangle · rounded · round · 3–12 sides, each only where `roundedMin` and the size allow it), sizes | lid, spaces, window, finger hole |
| a tray | a box starting 30 mm tall, with no lid | all | shape, sizes | spaces, handles (two holes) |
| a carton | `boxRecipe(…, 'carton')`, `setTrayEnds`, `setClosure`; D6's straight tuck, reverse tuck, snap-lock bottom and seal end | card, corrugated 1.6 | top (tuck · seal), bottom (tuck · snap-lock · seal), tuck direction | thumb notch, dust flaps, window |
| a sleeve | `addTray` with `base: 'open'`, and top and bottom open | card, corrugated | sizes | window, thumb notch |
| a card stand | the stand template, its parameters as words | all | card width, lean, slots | — |

- The organiser template stays, for saved files and for the two missions that start from it. A new organiser is *a box … with a lid that lifts off, divided into 3 × 2 spaces*. It leaves the welcome screen with the other preset cards.
- Each material's lid options come from `lidWhy` and `closureStyles`. For example:
  - card has *hinged, closing with a tuck*;
  - plywood's *hinged* is the living hinge;
  - *arched* appears only where `lidWhy` allows it.
- *(merged)* The lid kinds of milestones 79–80 (*Cap · Flat · Drop-in*) are not words: the box's lid is made with kind *Automatic*, and the card after *Start* offers the others, as today.

### 3.3 The resolver (pure, no React)

`src/sentence/resolve.ts`:

```ts
export type WordState = {
  key: string; value: string | number; shown: boolean;
  options?: (string | number)[];          // allowed ones only, in list order
  min?: number; max?: number; limitWhy?: MsgKey;
};
export type Change = { key: string; from: string | number; to: string | number; why: MsgKey };

export function resolve(def: TemplateDef, m: MaterialProfile, p: Params): WordState[];
/** Change one word (a pick or a typed number); every later word is checked in order. */
export function choose(def: TemplateDef, m: MaterialProfile, p: Params, key: string, value: string | number): { params: Params; changes: Change[] } | { refused: { min: number; max: number; why?: MsgKey } };
/** Step 1 changed: the structure and then every word are checked again. */
export function chooseMaterial(def: TemplateDef, m: MaterialProfile, p: Params): { def: TemplateDef; params: Params; changes: Change[] };
export function chooseStructure(to: TemplateDef, m: MaterialProfile, p: Params): { params: Params; changes: Change[] };
```

Rules:

- **Words are checked in sentence order.** A change re-checks every word after it, and only those. A number is a word like any other: changing `width` re-checks the lid, the spaces and the window.
- **A word that is no longer allowed takes its fallback**; a number moves to the nearest end of its new range. Each of these is a `Change`, shown in the line under the sentence and announced (§4.3).
- **A typed number outside its own range is refused**, and the range is shown. Only a change to an earlier word may move a number, and the change note always says so. This is `PRESETS_PLAN`'s *no silent correction*.
- **A structure the material cannot make becomes its fallback** (on plywood, carton → box with a lid that lifts off).
- **Limits that depend on the sheet**, such as the tallest box whose net lies flat on one sheet, come from `limits()`. Where there is no formula, they are found by bisection over `generate` + `validate`: at most eight builds, cached with `memo` by structure, material and the other parameters, and worked out when the number field is opened. A static range is used until the result is ready.

### 3.4 Words in two languages

The sentence is never glued together from fragments.

- Each structure has **one whole sentence per language, with named slots.** For example `sen.box` → *I'd like to make {structure} that is {width} wide, {depth} deep and {height} mm tall {sizeAs}*.
- Add-ons have their own clause keys (`sen.add.lid` → *with {lid}*), joined by a list rule for each language.
- Hebrew puts the slots in its own order. It prefers wording that does not agree with gender (עם מכסה, ברוחב… וגובה…). Where agreement cannot be avoided, an option carries `he: { g: 'f' | 'm' }` and the sentence uses a two-way `{g:…|…}` select. The owner checks these strings.
- Numbers, × and mm sit in `<bdi dir="ltr">`.
- `tests/i18n.test.ts` gains a check that every slot in an English sentence appears in the Hebrew one, and the reverse.

### 3.5 Spaces (dividers)

The clause reads *divided {spacesBy}*. Its first word is a list with two entries:

| `spacesBy` | Reads | Typed | Worked out and shown live |
| --- | --- | --- | --- |
| `count` | *into [nx] × [ny] spaces* | the number of spaces across and front to back (1 means no divider that way) | each space's inside size: *Each space 51.3 × 53.5 mm* |
| `size` | *into spaces of about [sx] × [sy] mm* | the space size wanted | how many that makes, and their exact size: *3 × 2 spaces, each 51.3 × 53.5 mm* |

- **Working it out.** With an inside width W, a divider thickness t and n spaces, each space is (W − (n − 1)t) / n wide. From a wanted size s, the count is n = max(1, floor((W + t) / (s + t))). The same holds front to back, with the depth.
- **The box keeps its size.** In size mode the spaces come out at least as big as asked, and the line says so (*about 50 → 51.3 mm*). Growing the box to fit the spaces exactly is left for later (§8).
- **The numbers shown are measured, not calculated.** After each change the design is built, and the line reads the spaces from `compartments()` on the built design. The formula only chooses n, so the line cannot disagree with what will be cut. A test checks the two against each other.
- **Limits.**
  - The largest count is the one that keeps every space at least `MIN_COMPARTMENT` wide.
  - A wanted size runs from `MIN_COMPARTMENT` to the inside size.
  - When the box shrinks, a count that no longer fits drops, with a note. A wanted size is kept, and the count it makes changes: that is not a correction, so there is no note unless the count falls to 1.
- **Switching between the two keeps the result.** `count → size` fills in the current space size; `size → count` fills in the current counts.
- **Shapes.** Both modes are offered on rectangles and rounded rectangles. Round and many-sided boxes get `count` only, because equal steps give spaces of different sizes there. The line then gives the range, *spaces 38–52 mm*.
- **Height.** The dividers are as tall as the engine makes them now: the walls less `DIVIDER_GAP`, or less the lid's rest for a drop-in lid. This is not a word.
- **Moved dividers.** Dividers moved after *Start* stay where they were moved when a size changes on the preset card. *(merged)* This is Guided's G1 item 2, milestone 92, built before S1.

## 4. The interface

### 4.1 The welcome screen

```
 1  Material      [Card 0.5] [Corrugated 1.6] [Corrugated 4] [Plywood 3]       (as today)

 2  Start from
    ○ Blank design
    ● I'd like to make [a box ▾] that is [160] wide, [110] deep     ┌──────────┐
      and [45] mm tall [inside ▾], with [a lid that lifts off ▾],   │ picture  │
      divided [into 3 × 2 spaces ▾]. [+ more]                       │          │
      Each space 51.3 × 53.5 mm · outside 166 × 116 × 51 mm ·       └──────────┘
      11 pieces · 1 sheet, 58 % used
      ⓘ The box is narrower, so 4 spaces across became 3.

    Or try a mission (Quick build, as today)                             [Start]
```

- The template grid's cards (`TEMPLATES.map` in `StartScreen.tsx`) are removed. *Blank design* stays as the first choice.
- Changing the material in step 1 runs `chooseMaterial`, and the note line says what changed.
- Today's cards are greyed through `tplOk(…)`; nothing is greyed in the new screen.
- Missions stay below, as now, in Quick build.
- A class with a material profile keeps step 1 as it does today.
- *(merged)* *Your designs* (milestone 86) stays above step 1, as now.

### 4.2 A word

- A word is a button with a dashed underline and a ▾, at least 44 px tall.
- Its list has a small picture per option, drawn with `renderThumbnail` and cached by structure, option and material. The list holds only the options that are allowed.
- Number fields are 4–5 characters wide. Focusing one opens a slider with − / +, its range and the reason for the limit. Enter or leaving the field commits the value; Esc puts the old one back.
- **Add-ons.** *+ more* lists the add-ons that are off and allowed. Each one that is on is a clause with a small ×.
- **The line under the sentence** holds the values worked out by the engine, any problem, and the change notes. Each note fades after its next change, and the latest one stays readable in the live region.
- **The picture** is rebuilt 150 ms after the last change. Focusing a word lights up the boards it affects.

### 4.3 Keyboard and screen readers

- **Keyboard.** Tab moves from word to word. Enter or Space opens a list; the arrows and type-ahead move through it; Enter chooses; Esc closes. No modifier keys are needed.
- The sentence is a `<fieldset>` with a hidden `<legend>` (*Describe what you want to make*).
- Each word has a name that makes sense alone: *Lid: a lid that lifts off. Change.* Number fields are named like *Box width inside, millimetres*.
- Lists follow the WAI-ARIA *select-only combobox* pattern.
- Every `Change` is read out from an `aria-live="polite"` region.

### 4.4 Narrow screens

Under 600 px the same words are shown as labelled rows, in the same order and from the same `resolve` state (`PRESETS_PLAN`'s settings card). The picture moves above them. S4 builds one component with these two layouts.

### 4.5 After Start

The design is an ordinary preset design. Today's template card (`TemplateUI.tsx`) shows its parameters, now following `when` and `allowed`: S6. A sentence bar inside the design is left for later (§8).

## 5. Decisions

| Topic | Decision |
| --- | --- |
| What a sentence is | A template's parameters. No new design field from this plan (D5a adds `Design.sizeAs`, §0.2), no schema bump. The material is step 1's. |
| Scope | The welcome screen's step 2 only, beside *Blank design*. |
| Where the rules live | In the engine's own functions, through `allowed` and `limits`. No hand-written table of what goes with what. |
| Options not allowed | Not shown. That includes a whole structure, a shape, a lid kind and an add-on. (In the sentence and the template card only, §0.2 row 6.) |
| Typed text | None in the sentence. Only numbers are typed. |
| Changing an earlier word | Later words are kept when allowed. Otherwise they take their fallback or the nearest limit, and a note says so. |
| Typed numbers out of range | Refused, with the range shown. |
| Sizes | Inside by default for every structure. The inside / outside word is shown in Workshop and Quick build. |
| Spaces | A count or a wanted size. The box keeps its size; the line shows measured sizes (§3.5). |
| Trade codes | Small grey text under a structure option (≈ ECMA A20.20.03.01), only once the owner has checked the code (D6 decision 10). |
| Planned structures | Registered with `status: 'planned'` and never shown. |
| Missions | Unchanged. |
| Old preset designs | The organiser and the stand still open with their card. The organiser is no longer offered on the welcome screen; the stand is offered as *a card stand*. |

## 6. Rules for the implementer

- *(merged)* Work on the session's branch, from `origin/main` at `1917440` or later. One commit per milestone, named with its number from `ROADMAP.md` §5 and its letter (`Milestone 94 (Sentence S1): …`). Do not deploy. Never touch `SITE_PASSWORD`.
- After each milestone, run `npm run typecheck` and `npm test`, and have a short look in the dev server (`npm run dev`, port 5199; `http://fresh.localhost:5199` gives a browser with no saved data). Do not run the full e2e suite or the `SHOTS` specs.
- **The goldens stay byte-identical**: the organiser and the stand move onto the contract unchanged. New structures add new cases in `tests/goldenDesigns.ts`.
- The resolver and the structures are pure and unit-tested. Interface code goes in `src/sentence/`; structures go in `src/templates/structures/`.
- Every string goes in `en.ts` and `he.ts` under `sen.*`. Every control gets a `data-testid`, and every new control a row in `FEATURES` with its state in Guided, Quick build and Workshop (`ROADMAP.md` rule 4b).
- After each milestone, update `PROGRESS.md` and `DECISIONS.md`.

## 7. Milestones

### S1. The contract and the resolver (no interface)

- The `ParamDef` and `TemplateDef` fields of §3.1. Old templates need none of them.
- `src/sentence/resolve.ts` as described in §3.3, with bisection limits and `memo`.
- `organiser` and `stand` gain `limits` and `allowed`. Their goldens do not change.
- Tests (`tests/sentence.resolve.test.ts`):
  - a change re-checks only the words after it;
  - a changed number re-checks the words after it;
  - a later word that is no longer allowed takes its fallback and is reported once;
  - a typed number past its limit is refused;
  - `resolve` gives the same result after `choose` with the current value.

### S2. The box, the tray and spaces

- **Sizes.** *(merged)* `boxSize` / `setBoxSize` come from D5a (milestone 93, `src/model/boxSize.ts`); the `sizeAs` word writes `Design.sizeAs` (§0.2 row 2).
- The **box** and **tray** structures over `boxRecipe`:
  - the shape word;
  - the lid word through `setBoxLid` and `LidStyle`;
  - window and finger hole through `holeRecipe`.
- **Spaces** as described in §3.5. Both modes go through `addDividerLine` at equal steps, with the line read from `compartments()`.
- *(merged)* The divider fix is milestone 92 (Guided G1); S2 relies on it.
- Tests:
  - **Every sentence the lists allow builds clean**: 500 seeded random walks through the words in each material, going back to earlier words as well as forward. After every step, `validate` reports no blocking issue.
  - **Nothing allowed is missing**: every option that a random walk hides has a `why`, and a build with it really fails or is refused by the engine.
  - **Spaces**: count and size modes agree with `compartments()` to 0.1 mm; switching mode keeps the spaces; shrinking the box lowers a count with a note.
  - **Inside sizes survive a change of material.**

### S3. The carton and the sleeve

- D6's four carton recipes move out of `tests/goldenDesigns.ts` into `src/templates/structures/carton.ts`, and the goldens call them there (byte-identical).
- The top and bottom words, the tuck direction, the thumb notch and the dust flaps, through `setTrayEnds` and `setClosure`.
- The sleeve.
- Tests:
  - the random walks over cartons and sleeves;
  - box → carton → box keeps the sizes and the window;
  - on plywood, neither structure is listed, and a carton chosen on card becomes a box with a lid when the material changes to plywood.

### S4. The sentence component

- `src/sentence/Sentence.tsx`, `Word.tsx`, `NumberWord.tsx`, `AddClause.tsx` and the narrow layout.
- The sentence keys and list rule in both languages.
- Lists with pictures; the line under the sentence; the live region; keyboard use.
- A development-only route (`?sentence`) shows the component on its own.
- Tests:
  - the i18n slot test;
  - `tests/e2e/sentence.spec.ts`, in English and Hebrew, at 1366 and 375 px wide:
    - every word can be chosen with the keyboard alone;
    - changing the width lowers the space count and announces it;
    - a refused number shows its range;
    - the narrow layout has the same state.

### S5. The welcome screen

- `StartScreen.tsx`: the sentence and its picture replace the template grid in step 2; *Blank design* stays.
- Step 1's material drives `chooseMaterial`.
- *Start* runs `generate` with the sentence's parameters.
- Missions stay where they are.
- Tests:
  - *Blank design* still gives an empty design in each material;
  - every first-release structure starts from the sentence in every material that lists it;
  - a change of material after the sentence was filled in keeps what it can and notes the rest;
  - `tests/e2e/templates.spec.ts` is updated, because the organiser card is gone.

### S6. The preset card after Start

- `TemplateUI.tsx` shows the same parameters, following `when` and `allowed`, with ranges from `limits`.
- A parameter change there goes through `choose`, so the same checks apply and the same notes appear (as a toast).
- Tests:
  - a change on the card that drops a later choice says so;
  - a name engraved after *Start* survives a size change;
  - a moved divider survives a size change.

### S7. Final verification

- Run typecheck, the unit suite, the goldens, the random walks at 2000 steps, `sentence.spec.ts`, `templates.spec.ts` and `classroom.spec.ts`.
- Update `README.md`, `DECISIONS.md` and `PROGRESS.md`.
- In the dev server, in both languages: every structure from the sentence to *Ready to cut ✓*.

### Order and size

S1 → S2 → S3 → S4 → S5 → S6 → S7. S3 and S4 do not depend on each other and could run side by side. *(merged)* Before S1: milestones 92 (Guided G1, the divider fix) and 93 (Dieline D5a, inside sizes).

Rough guesses:

| Milestone | Time |
| --- | --- |
| S1 | three to four days |
| S2 | a week (the random walks will find things) |
| S3 | three days |
| S4 | a week and a half |
| S5 | two or three days |
| S6 | three days |
| S7 | two days |

## 8. Later (structures registered as `planned` and not shown)

| Item | What it needs |
| --- | --- |
| A sentence bar inside the design | §4.5. The card in S6 covers the need until then. |
| Guided's gallery opening with the sentence | Guided's shell (`GUIDED_MODE.md` G2–G3, milestones 105–106). |
| Sized by what goes inside (*a box that holds [12] [pencils]*) | `bundleSize` and `bestCell` from `src/easy/objects.ts`, with the result written to `Design.contents`. *(merged)* Guided's G4 builds `fitContent` (grow one space by what is missing) through `setBoxSize`; this word would use the same path. It replaces D6's *start from the product*. |
| Grow the box so the spaces are exact | A third `spacesBy` entry, or a word on size mode. |
| Unequal spaces | Boxes.py-style sections (`50, 30, 30`). |
| A mailer (≈ FEFCO 0427) | D6's recipe: fold-overs with lock tabs, a lid with a tab lock, and dust flaps on the lid (shaped flaps, D3, milestones 111–112). Corrugated only. |
| A drawer (≈ FEFCO 05: tray + sleeve) | A sleeve sized from the tray's measured outside (`PRESETS_PLAN` §3.5). |
| An envelope | Shaped glue and tuck flaps on a flat board (D3). Card only. |
| A pen cup, a magazine file, a phone stand; double walls | `PRESETS_PLAN` §7–8. |
| A sliding lid | Not in the engine. |
| More boards | D5's board grades (D5b) in step 1. |

## 9. Still open (defaults chosen; say if you want them different)

- Spaces in size mode keep the box's size and round the spaces up (§3.5). The alternative is that the box grows to fit them.
- The inside / outside word shows in Workshop and Quick build, with *inside* the default. The alternative is always inside, with no word.
- A class choosing which structures it offers, beside its missions list, is not in this plan.
