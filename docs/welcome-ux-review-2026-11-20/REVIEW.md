# Welcome screen and interface: review and image prompts (2026-11-20)

Screens are in `shots/` (headless Chromium at 1440×900 unless named otherwise, on `b158f2e`). The 3D in these shots uses software rendering, so it shows the *Simple* quality. The owner's three Hebrew screenshots of the same screen (library on top, the sentence, the cards view with the blank tile hovered) were reviewed too.

## 1. How the welcome screen works today

`src/ui/StartScreen.tsx`, from top to bottom:

1. **Brand + language toggle.**
2. **"What are you making?"**: a very large display title.
3. **Your designs** (`Library.tsx`). Only shown once designs exist. Each card has Duplicate, Open, Rename and Delete, and there is *Recently deleted (n)*.
4. A lead line: *Pick the material first…*
5. **Tour card**. Off for now (`TOUR_OFFERED`).
6. **Step 1: Choose a material**: four material cards plus the **New blank design** tile, which starts at once.
7. **Step 2: Choose a template**, which holds four things:
   - **Shapes** (Workshop only; it starts at once).
   - A **Sentence | Cards** switch.
   - The **sentence**: *I'd like to make [a box] that is [160] wide…* + more, with a live picture and its own **Start**.
   - Or the **style cards**, also with their own Start.
8. **Or a mission**. Quick build only: five mission cards with goal lists, below everything else.
9. A calibration note.

So there are up to six ways in (library, blank, shapes, sentence, cards, mission), and each has its own Start. The welcome screen is also where *New design* and *Your designs…* in the project menu lead.

## 2. Welcome screen flaws

| # | Flaw | Where |
|---|------|-------|
| W1 | **The title asks "what", but step 1 asks "which material".** A student thinks *pencil box*, not *3 mm plywood*. The material comes first for a good engineering reason (the sentence offers only what it can make), but the screen makes the student answer the expert question first. | `01`, `02` |
| W2 | **Too many ways in, with no hierarchy.** Blank, Shapes, Sentence/Cards, missions and library each look like their own section, and each has its own Start. Nothing says which way to take. | `01`, `16`, `17` |
| W3 | **The New blank design tile is broken and misplaced.** Its picture is a grey vertical strip, not a full art box. Its dashed border reads as a drop zone. It sits in the *material* row although it isn't a material. On hover it turns dark teal, its title becomes unreadable, and the native tooltip covers the title. | `01`, `10`, owner's shots 1–3 |
| W4 | **"Step 2: Choose a template" holds no templates.** It holds a Shapes link, a view switch and a sentence. The Shapes row sits between the label and the switch, so the switch looks like it belongs to Shapes. | `01`, `05` |
| W5 | **The main action is below the fold.** Once a library exists, the sentence and its Start fall below 900 px. On a 1366×768 Chromebook, the target hardware, it is worse. On a phone, the four material cards fill the whole first screen. | owner's shot 1, `09`, `10`, `16` |
| W6 | **The sentence is noisy and loose.** Every word and number has a dashed underline. Numbers float in wide boxes, so commas detach (`160 ,`). Big empty space sits under it. Start is pinned to the far corner, away from the sentence. | `01`, owner's shot 2 |
| W7 | **The cards view has no selected state, and Start is detached.** You can't see which card Start will make. The pastel card backgrounds (mint, peach, lilac, yellow) are outside the cream/teal palette. Black tag pills are heavy. With four cards, half the row is empty. | `05`, owner's shot 3 |
| W8 | **Missions, the most inviting content for students, are hidden.** They appear only in Quick build, at the very bottom, after the sentence. | `17` |
| W9 | **Library cards can't be told apart.** Three *Untitled design* cards have tiny thumbnails. Four icon-only buttons give Delete the same weight as Open. In Quick build the library is left-aligned while everything else is centred. | owner's shot 1, `16` |
| W10 | **Materials look alike.** The two corrugated cards are near-identical pictures with identical captions. The card material's preview box renders grey, not paper. | `01`, `07` |
| W11 | **Type scale has no middle.** A huge heavy title sits over 12 px letter-spaced step labels and small lead text. There is no clear second level. | all |

## 3. Interface flaws (the editor)

| # | Flaw | Where |
|---|------|-------|
| E1 | **Three levels, three shells.** Guided has a Build · Decorate · Send stepper, a ☰ menu, text Undo/Redo and a bottom action dock. Quick build and Workshop have a project menu, a material pill, two look-alike segmented controls, icon Undo/Redo, a cloud icon, Submit, Download and a language button. Switching level changes the whole frame. | `11`, `14`, `18` |
| E2 | **The level switch and the view switch are twin pills side by side.** *Guided/Quick build/Workshop* is about who you are; *3D workspace/Cut plan* is about what you look at. In Quick build the top bar runs out of room: the name truncates (*Untitled desi*) and the material pill loses its label. | `11`, `14` |
| E3 | **The rail is icons only.** Workshop has five, Quick build has seven, and none are labelled. The rectangle icon for *Shapes* isn't guessable. | `11`, `14` |
| E4 | **Two floating cards for three things.** With nothing selected, a *Design settings ›* card sits above a separate *Joints / Outlines* card (Quick build: *How it's built*). | `11`, `14` |
| E5 | **The view cube is two flat grey squares** (TOP / FRONT) in a large empty frame, next to four unlabelled icons. | `11` |
| E6 | **3D lacks depth.** Every wall is the same tan, so inside and outside are hard to tell apart. (This is partly the software renderer; check *Rich* on real hardware.) | `11`, `14` |
| E7 | **The cut plan stacks three toolbars.** There are zoom/Repack, Dimensions, Sheets/Nets, a stats line, and *Use less board · Nest · Save material*: three look-alike buttons with no clear default. The laser legend overlaps the sheet corner. Parts huddle in one corner of a huge sheet. | `13` |
| E8 | **The selected panel's card repeats its name.** It shows the title *Base*, then a *Name: Base* field. The part card is long for a single board. | `12` |
| E9 | **Guided is already the clearest.** It has one stepper, one summary card, a labelled bottom dock and labels on the stage. It is the best candidate skeleton for all three levels. | `18` |

## 4. Direction, in short

- **Lead with the thing, not the material.** One composer: the sentence plus a big live preview and one Start. Material becomes a word in the sentence (*…in [3 mm plywood ▾]*) or compact swatch chips right beside it, so it still filters the sentence.
- **One primary way in, and quiet secondaries.** The composer is primary. *Start blank*, *Build from shapes* and *Take the tour* become quiet links or buttons. Missions become a visual row of "things to make" that fill the composer when clicked. That puts them in every level, not only Quick build.
- **Returning students get a "Continue" hero** (their last design, big), with the library as a row of large thumbnails.
- **One editor shell for every level.** Guided's stepper (Build · Decorate · Send) becomes the frame. The level picks which tools show in the rail and dock, not a different layout. Move the level switch into the project/profile menu, out of the top bar.
- **Labelled tools**: rail labels on hover, or always shown in Guided/Quick. Merge the right side into one contextual card.

## 5. Image prompts

Use them in any image model (ChatGPT/DALL·E, Gemini, Midjourney). Each prompt is self-contained: the **style block** is already inside it, so you can paste each one alone. Image models garble small text, Hebrew especially, so the prompts keep text short. Treat the results as mood, not spec.

**Shared style block** (already included in each prompt below):
> Clean modern web app UI mockup, flat vector-quality rendering, 16:10 desktop screenshot framing, warm cream background (#F7F2EA), white cards with soft shadows and 12–18 px rounded corners, deep teal primary (#15706B) with bright teal highlights (#1FB8AC), dark slate tool rail (#232B38), friendly rounded sans-serif type, generous whitespace, laser-cut plywood objects rendered in soft isometric 3D with visible finger joints, light wood tone, no photographs of people, no lorem ipsum clutter.

### Welcome screen

**P1: The composer (recommended direction)**
> Clean modern web app UI mockup of the welcome screen of "CutForge", a laser-cutting design tool for high-school students. Warm cream background (#F7F2EA), deep teal primary (#15706B), friendly rounded sans-serif type, generous whitespace. Centre of the screen: one large white card. On the left half of the card, a big editable sentence in large type: "I'd like to make a box 160 wide, 110 deep and 45 mm tall, in 3 mm plywood". The changeable words are teal with a subtle pill background, not underlined. On the right half, a large live 3D preview of that plywood box with visible finger joints, on a soft light-grey stage with a gentle shadow. Under the sentence, a small grey line "5 pieces · 1 sheet". One prominent teal "Start" button directly under the sentence. Above the card, a modest heading "What are you making?". Below the card, a horizontal row titled "Ideas to make" with five small illustrated cards: pencil box, dice tray, card stand, game organiser, escape box. Top right, quiet text links: "Start blank", "Build from shapes", "עברית". Flat vector-quality rendering, 16:10, soft shadows, rounded corners.

**P2: Gallery first**
> Clean modern web app UI mockup, a welcome screen styled like a bright craft gallery for a laser-cutting app for teenagers. Warm cream background (#F7F2EA), teal accents (#15706B). Top: a friendly heading "What are you making?" and a row of four material filter chips with tiny swatches: "Card", "Corrugated 1.6", "Corrugated 4", "Plywood 3 mm", with plywood selected in teal. Below, a masonry grid of large white cards, each showing a finished laser-cut object in soft isometric 3D: a pencil box with three compartments, a hexagon dice tray, a leaning card stand, a game organiser with a lid, a folded cardboard carton, a box with a hinged lid. Each card has a short bold name and two small grey tags like "1 sheet" and "Lid". One card is hovered and shows a teal "Make this" button. Top right: a quiet outlined button "Start from scratch". Flat vector-quality rendering, 16:10, generous spacing, rounded 16 px corners.

**P3: Three doors**
> Clean modern web app UI mockup of a laser-cutting design tool's start screen for students. Warm cream background, teal (#15706B) accents, rounded friendly sans-serif. Under a heading "What are you making?", three large equal cards side by side, each with a big soft isometric illustration. 1) "Follow a mission": a plywood pencil box with a small checklist. 2) "Describe it": a speech-bubble sentence morphing into a plywood box. 3) "Start blank": an empty isometric grid with a teal plus. Each card has one line of description and a teal arrow button. Above the three cards, a slim material bar of four swatch chips (card, corrugated, corrugated thick, plywood) with plywood selected. Flat vector rendering, 16:10, soft shadows.

**P4: Returning student**
> Clean modern web app UI mockup, the home screen a returning high-school student sees in a laser-cutting design app. Warm cream background (#F7F2EA), white cards, teal (#15706B) primary. Left two-thirds: a large "Continue" hero card with a big 3D render of their unfinished plywood pencil box, its name "Pencil box for Maya", "edited 2 hours ago", and a teal "Continue" button. Right third: a compact "New design" card with a one-line sentence field and a "Start" button. Below: a row "Your designs" with five large thumbnail cards of different laser-cut boxes, each with a distinct name and a small "…" menu (no row of icon buttons). Flat vector-quality rendering, 16:10, rounded corners, calm and tidy.

**P5: Materials as real samples**
> Product-style UI component mockup: a material picker for a laser-cutting app, four selectable cards on a warm cream background. Each card shows a realistic close-up sample of the material at an angle with its cut edge visible: thin white card, thin corrugated cardboard with small flutes, thick corrugated cardboard with large flutes, 3 mm birch plywood with visible plies. Each card has a bold name, a thickness badge ("1.6 mm"), and two small icons with labels for what it is good at ("folds", "finger joints"). The plywood card is selected with a teal (#15706B) outline and a check mark. Soft studio lighting, rounded 16 px cards, clean typography, 3:1 wide banner framing.

**P6: Chromebook fit (1366×768)**
> Clean web app UI mockup at laptop size 1366×768 (16:9), the welcome screen of a laser-cutting design app for students, everything visible without scrolling. Warm cream background, teal primary (#15706B). A compact top bar with a logo "CutForge" and a language button. Left column: the heading "What are you making?", a sentence builder in large type with teal pill-shaped editable words ("a box", "160", "110", "45", "plywood 3 mm"), and a teal "Start" button. Right column: a 3D preview of a plywood box with finger joints. Bottom strip: a horizontal scroll row of six small "ideas" cards with mini 3D objects. Flat vector-quality rendering, dense but calm, rounded corners.

**P7: Hebrew, right to left**
> Clean modern web app UI mockup of a right-to-left Hebrew interface for a laser-cutting design tool for students. The layout is mirrored: logo top right, navigation flowing right to left, sentence text aligned right. Warm cream background (#F7F2EA), teal (#15706B) primary, rounded Hebrew-friendly sans-serif type. Centre: a large white card with a short Hebrew sentence on the right and a 3D preview of a plywood box with finger joints on the left. A teal button at the end of the sentence's reading line. Keep text minimal and large. Flat vector-quality rendering, 16:10.

### Editor (interface overhaul)

**P8: One shell for every level**
> Clean modern web app UI mockup of a 3D design workspace for a laser-cutting app for students. Top bar on warm cream (#F7F2EA): logo and project name "Pencil box" on the left; in the centre a three-step progress stepper "1 Build · 2 Decorate · 3 Send" with step 1 active in teal (#15706B); on the right, Undo/Redo and one teal "Download for laser" button. Left: a dark slate (#232B38) floating tool rail with icons and small text labels under each ("Select", "Board", "Divider", "Text", "Import"). Centre: a calm light cool-grey 3D stage with a subtle grid and a plywood box with finger joints, in clear light and shadow so inside and outside walls read differently. Right: one floating white card titled "Pencil box" with a few size rows and two collapsible sections. Bottom centre: a small floating dock with labelled buttons "Divider", "Lid", "Window", "How?". Bottom right: a neat 3D view cube. Flat vector-quality rendering, 16:10, soft shadows.

**P9: Editing a selected part**
> Clean UI mockup, close view of a 3D laser-cut box editor: one wall of a plywood box is selected and outlined in bright teal (#1FB8AC). On the stage near the wall: two teal push-pull arrows, a dimension label "W 166 mm" you can click to type, and a small round flip badge. Next to the selection, a compact floating white card titled "Front wall" with a height stepper, a joint type dropdown showing "Finger joint", and a red "Delete" icon kept small. Other walls are tinted slightly different light wood tones with small role labels ("Base", "Left wall"). Cool light-grey stage, subtle grid, soft shadow, flat vector-quality rendering, 16:10.

**P10: Cut plan**
> Clean web app UI mockup of a laser cut plan screen. Warm cream background (#F7F2EA). Centre: a plywood sheet drawn to scale in light wood tone. Five box parts (Base, Front wall, Back wall, Left wall, Right wall) are packed tightly with finger-joint edges in thin red cut lines, each part lightly tinted to match its colour in the 3D view, with its name in small text. One slim summary bar above the sheet: "1 sheet · 18% used · 2.4 m cut · 5 pieces", with one teal "Pack tighter" button. A small docked legend at the bottom left of the screen, outside the sheet: red Cut, blue Score, black Engrave. Top bar with a "3D | Cut plan" toggle and a teal "Download for laser" button. Flat vector-quality rendering, 16:10, generous margins.

**P11: The Send step**
> Clean web app UI mockup of the final "Send" step of a student laser-cutting design app. Warm cream background, teal (#15706B) primary. Left: a large thumbnail of the cut plan on one plywood sheet. Right: a white card titled "Ready to cut" with a green-teal check list: "Fits on one sheet", "All walls connected", "No parts too small", "Name engraved". Below the list: two large buttons, "Download for laser (SVG)" in teal and "Send to my teacher" outlined. A small three-step stepper at the top with "3 Send" active. Flat vector-quality rendering, 16:10, friendly and calm.

**P12: Design system board**
> Design system presentation board for a friendly educational laser-cutting web app called CutForge. Laid out on a warm cream (#F7F2EA) canvas: a colour palette row (cream, white, deep teal #15706B, bright teal #1FB8AC, slate #232B38, laser red, laser blue, black); a type scale from a big rounded display heading down to small labels; buttons in primary, secondary, quiet and danger styles; segmented controls; a stepper; a material swatch card; a tool rail with labelled icons; a floating inspector card; isometric plywood object icons (box, tray, divider, lid). Neat grid, flat vector rendering, 16:9.

### Variations to try on any prompt

Add one of these at the end of a prompt:

- *"…in a bolder, more playful style: chunky shapes, thicker outlines, a sticker-like feel, for 14-year-olds."*
- *"…in a calmer, more professional style, like a pro CAD tool simplified, with thin lines and muted colours."*
- *"…with the 3D stage in a dark slate colour scheme while the panels stay cream."*
- *"…made to look like it sits on a real wooden workbench, with subtle wood grain under the cards."*

## 6. Chosen direction: the Composer (P1)

*Chosen by the owner on 2026-11-20.*

### 6.1 What we already have to build it from

- **Guided has its own start screen** (`src/guided/GuidedStart.tsx`, shot `19-guided-start.png`), and it is already halfway to the Composer. It has *What do you want to make?*, a *Keep working on …* pill with *All my designs*, the material as four chips (no step 1 cards), and a gallery of large cards that mixes missions and plain things. Its flaws:
  - the *Keep working* thumbnail is an empty grey box;
  - *Carton* is shown greyed in plywood, against the owner's "hidden, never greyed" rule for the sentence;
  - the gallery runs below the fold with no order between missions and things.
- **Quick build and Workshop** use `StartScreen.tsx` (§1).

So today there are **two welcome screens with two vocabularies** (*What are you making?* vs *What do you want to make?*). The Composer is the chance to make them one screen, with the level deciding which parts show.

### 6.2 Layout

One screen. It fits 1366×768 without scrolling for a first-time student.

1. **Header:** logo · *Your designs* · language.
2. **Keep working strip** (only once a design exists): the last design's real thumbnail, its name, *Continue*. Everything else in the library moves behind *Your designs* (its own view) and no longer sits on top of the page.
3. **Heading:** *What are you making?* at about 40 px, not the current display size.
4. **The composer card** is the only primary thing on the page.
   - **Left (about 55%):**
     - the material as four compact swatch chips above the sentence (see Q1);
     - the sentence, with its words as teal pills instead of dashed underlines;
     - the readout line (*outside 166 × 116 × 48 mm · 5 pieces · 1 sheet*);
     - change notes in a soft note row;
     - under all of that, **Start**, with a quiet *or start blank in plywood* text button beside it.
   - **Right (about 45%):** the live preview, large, on the cool 3D-stage grey, matching the editor.
5. **Ideas row:** one horizontal row of cards. Missions, the packaging styles (today's *Cards* view) and Guided's things all go here, ordered: missions first. A click **fills the composer**:
   - A **style** or **thing** sets the sentence's words.
   - A **mission** turns the left side into the mission's name, goals and Start, with *← back to the sentence*.

   This retires the *Sentence | Cards* switch.
6. **Footer links:** *Build from shapes* (Workshop) · *Take the tour* (when on) · the calibration note.

**By level:**
- **Guided:** the composer without the readout, sizes or *+ more*: just *[a box] in [plywood]*. The ideas row is big, like today's gallery.
- **Quick build:** the full sentence plus missions.
- **Workshop:** the full sentence, Shapes and blank.

**Narrow (under 600 px):** chips, then the preview, then the sentence as labelled rows (as today), then Start, then the ideas row.

### 6.3 Owner questions

- **Q1: Material.** Chips above the sentence keep "step 1 stays" literally. The alternative is a word inside the sentence (*…in [3 mm plywood ▾]*), which reads better but merges step 1 into step 2. *My recommendation: chips.*
- **Q2: Ideas in every level?** Missions are Quick build only today, and a class can choose which. Should the ideas row show missions in Workshop too?
- **Q3: Fill or start?** Should a click on an idea fill the composer (one Start for everything), or start at once, as missions do today?
- **Q4: One screen for all levels?** Should `GuidedStart` and `StartScreen` become one component with level switches, or should Guided keep its own screen with the same look?

### 6.4 Prompt series for the Composer

Each prompt stands alone. They share this base, which is already written into each one:

> Clean modern web app UI mockup, flat vector-quality rendering, warm cream background (#F7F2EA), white cards with soft shadows and 16 px rounded corners, deep teal primary (#15706B), bright teal highlight (#1FB8AC), friendly rounded sans-serif type, generous whitespace, laser-cut plywood objects in soft isometric 3D with visible finger joints.

**P1a: First visit, desktop**
> Clean modern web app UI mockup, 16:10 desktop, the welcome screen of "CutForge", a laser-cutting design app for high-school students. Warm cream background (#F7F2EA), deep teal (#15706B), friendly rounded sans-serif, generous whitespace, flat vector-quality rendering. Slim header: a small teal logo mark with "CutForge" on the left; "Your designs" and "עברית" as quiet links on the right. A medium heading "What are you making?". Below it, one wide white card with soft shadow and 16 px corners. Left side of the card: a row of four small material chips with tiny swatches ("Card", "Corrugated 1.6", "Corrugated 4", "Plywood 3 mm"), plywood selected in teal. Under the chips, a large sentence: "I'd like to make a box that is 160 wide, 110 deep and 45 mm tall inside, with square corners." The changeable words ("a box", "160", "110", "45", "inside", "with square corners") are teal text on pale-teal pill backgrounds, and a small "+ more" pill follows. A small grey line: "outside 166 × 116 × 48 mm · 5 pieces · 1 sheet". A prominent teal "Start" button, and beside it a quiet text button "or start blank". Right side of the card: a large 3D preview of that open plywood box with finger joints on a light cool-grey stage with a soft shadow. Below the card, a row titled "Ideas" with five cards showing small isometric objects (pencil box, dice tray, card stand, game organiser, escape box), each with a tiny teal "Mission" tag.

**P1b: Returning student**
> Clean modern web app UI mockup, 16:10 desktop, the welcome screen of a laser-cutting design app for students, for a returning user. Warm cream background (#F7F2EA), teal (#15706B) primary, rounded sans-serif, flat vector rendering. Directly under the header, a slim white strip with a real thumbnail of a plywood pencil box, the text "Pencil box · edited yesterday", and a teal "Continue" button. Below it, the heading "What are you making?" and a wide white composer card: material chips (plywood selected) and a sentence with teal pill words on the left, "I'd like to make a tray with a lid that lifts off, 200 wide, 120 deep and 40 mm tall", with a "Start" button under it; a large 3D preview of a plywood tray and its separate lid on the right. A row of idea cards at the bottom. Calm, tidy, soft shadows.

**P1c: Typing a size, with its limit**
> Close-up UI mockup of a sentence builder in a laser-cutting app. Warm cream and white, teal (#15706B) accents, rounded sans-serif, flat vector rendering. The sentence "I'd like to make a box that is 160 wide, 110 deep and 45 mm tall" in large type with teal pill words. The number "160" is focused with a bright teal ring. Under it, a small floating popover with a horizontal slider from 20 to 384, the thumb at 160, and a caption "Up to 384 mm: one sheet". Beside the sentence, a 3D preview of a plywood box that is visibly wider than usual. 4:3 framing.

**P1d: Choosing what to make**
> Close-up UI mockup of a sentence builder dropdown in a laser-cutting app for students. Warm cream and white, teal (#15706B) accents, rounded sans-serif, flat vector rendering. The word "a box" in the sentence "I'd like to make a box…" is open as a white dropdown with soft shadow, grouped "Boxes and trays" and "More". Each row has a small isometric thumbnail of a plywood object and a name with one grey line: "a box", "a tray (open, no lid)", "a tray with a hinged lid", "a hexagon box with a lid", "a card stand". The hovered row is pale teal. 4:3 framing.

**P1e: Changing the material, with a note**
> UI mockup of a welcome composer in a laser-cutting app. Warm cream background, white card, teal (#15706B) accents, rounded sans-serif, flat vector rendering. The material chips show "Corrugated 4 mm" newly selected in teal. Under the sentence, a soft pale-amber note with a small info icon: "Corrugated folds, so the box now has glue flaps." The 3D preview on the right shows a folded corrugated cardboard box with visible flutes on its cut edges and a glue flap, in brown kraft tones. 16:10 framing.

**P1f: A mission picked from the ideas row**
> UI mockup of a laser-cutting app's welcome composer after a student clicked an idea card. Warm cream background, white card, teal (#15706B) accents, rounded sans-serif, flat vector rendering. The left side of the composer card now shows a small teal "Mission" tag, the title "Pencil box", one line "A box with three compartments; one holds 12 pencils", a checklist of goals with empty circles ("Holds 12 pencils", "3 compartments", "Fits on one sheet", "Your name engraved"), a teal "Start mission" button and a quiet "← back to the sentence" link. On the right, a large 3D preview of a long plywood pencil box with three compartments. Below the card, the ideas row with the "Pencil box" card highlighted with a teal outline. 16:10 framing.

**P1g: Chromebook, 1366×768**
> UI mockup at 1366×768 laptop size (16:9) of a laser-cutting app's welcome screen for students, everything visible without scrolling. Warm cream background (#F7F2EA), teal (#15706B), rounded sans-serif, flat vector rendering, compact spacing. A slim header, a modest heading "What are you making?", one composer card taking most of the screen (material chips, a two-line sentence with teal pill words, a Start button on the left; a 3D plywood box preview on the right), and a single row of five small idea cards along the bottom edge.

**P1h: Phone**
> Mobile UI mockup, 390×844 portrait phone screen, of a laser-cutting app's welcome screen. Warm cream background, white cards, teal (#15706B) accents, rounded sans-serif, flat vector rendering. From top to bottom: a small header with the logo and a language button; the heading "What are you making?"; a horizontal scroll row of four material chips; a 3D preview of a plywood box; the sentence as labelled rows ("Make: a box ▾", "Width: 160 mm", "Depth: 110 mm", "Height: 45 mm inside", "Corners: square ▾"); a full-width teal "Start" button; then the start of an "Ideas" row.

**P1i: Hebrew, right to left**
> Mirrored right-to-left UI mockup of a Hebrew laser-cutting app welcome screen, 16:10. Warm cream background (#F7F2EA), white composer card, teal (#15706B) accents, Hebrew-friendly rounded sans-serif, flat vector rendering. Logo at the top right. In the composer card, the sentence and material chips sit on the right side, aligned right, with teal pill words; the 3D preview of a plywood box with finger joints is on the left. The teal Start button sits under the sentence on its right edge. The ideas row runs right to left. Keep the Hebrew text short and large.

**P1j: Guided level of the same screen**
> UI mockup, 16:10, the simplest level of a laser-cutting app's welcome screen for students who are new to design software. Warm cream background (#F7F2EA), teal (#15706B), large friendly rounded type, flat vector rendering. The heading "What do you want to make?" and a "Keep working on Pencil box" pill with a real thumbnail. Below, a big composer card with only a short sentence, "I'd like to make a box in plywood", where the two words are large teal pills, a 3D preview and a big "Start" button. Below it, a large two-row gallery of idea cards with isometric plywood objects (pencil box, dice tray, card stand, game organiser, box, box with a lid), each with a big name.

### 6.5 Generating them

`generate-images.mjs` (in this folder) sends these prompts to the Gemini API and saves the results in `images/`. It reads `GEMINI_API_KEY` from the environment or from `.dev.vars`, and it never prints the key.

- `node docs/welcome-ux-review-2026-11-20/generate-images.mjs` runs P1a–P1j.
- Name prompts to run only those, for example `P1a P8`.
- `--ref` sends the current welcome screenshot along as a "redesign this" reference.
- `--models` lists the image models your key can use. Pick one with `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`).
