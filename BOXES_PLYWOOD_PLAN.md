# Every doable boxes.py design, in plywood: plan (milestones 171–185)

Written 2026-11-21 on `claude/clever-rubin-58475m` after merging `claude/gallant-bardeen-fu1j98` (milestones 161–169: thirteen cards built from boards, the board kit `structures/boards.ts`, the joint census, the `slot` body). It continues `BOXES_PRESETS_PLAN.md`; that plan's rules stand (one catalogue, records, no look-alikes, boxes.py a behaviour reference only), except where this file says otherwise.

Source: [florianfesti/boxes](https://github.com/florianfesti/boxes): 187 generator classes, 183 offered in its web UI. Every one was read (survey of 21 November); the ten the owner marked were read line by line.

## 0. In short

- **Plywood only** (owner, 21 November). Every new card or variant here has `canMake: plywoodOnly`. The cards 161–169 made for 4 mm board keep it; nothing new is added for card or corrugated.
- **The owner's ten come first** (§2): seven need no new engine (milestones 171–172), three need two new engine pieces, a face-glued joint and a sliding flex door (173–175).
- **Then everything else that can be made in plywood** (§3): about 95 more generators. They become a new card, a variant, a challenge on a card, or a word on the box. Each waits on at most one named engine step (§4).
- **What is left out, and why** (§3.9): paper, foam and acrylic designs, demos and calibration pieces, servo kits, and one generator its author marks as broken: about 25 in all.
- boxes.py's code is not ported. It draws flat parts for a laser; CutForge builds boards in 3D and derives the cut. What is read: which boards, how they meet, proportions, defaults.

## 1. Where we start

| | Count | Cards |
|---|---|---|
| On `main` before 161 | about 9 distinct on plywood | open box, organiser, lidded box (rect, hex), hinged box (living hinge on plywood), round box, pen cup, drawer box, magazine file, dice tower, stand (+ phone) |
| Added by 161–169 (merged) | 13 | open-front box, pen holder, scoop tray, sliding-lid box, bird house, laptop stand, grid insert, shelf, bottle rack, desk sign, slanted shelf, bookend; drawer box on plywood |

Contact sheet `docs/preset-shots/sheet-ply-3.png`: 31 entries on plywood.

Fix first, small (from that sheet):
- **Desk sign:** its picture shows only the plate; the two feet behind it are hidden. Turn the camera (`side34`) or ghost the plate.
- **Shelf** reads as a stack of boards, and **slanted shelf** as a box, at list size. Give them props (small boxes on the shelf, cards on the tiers) so they read as what they are.

## 2. The owner's ten

| boxes.py | What it is | In CutForge | Needs | Milestone |
|---|---|---|---|---|
| **UniversalBox** | One box with every top edge and lid boxes.py has | Not a card: a catalogue of words for the box structure (§2.1) | Most words: nothing. Plug lid: E1. Pin hinges: E5. Stacking: E6. | 171, then with each engine step |
| **TwoPiece** | Two shells; the outer slips over the inner down to the table | **Lidded box**, variant *Two-piece*: a cap whose rim is the box's full height (`setCapRim('full')` exists; not a sentence word yet) | the word `rim` (shallow · half · full) when the lid lifts off | 171 |
| **HalfBox** | Base, back and triangular supports: a bookend, a hanging shelf, an angle-clamping jig | **Bookend** card becomes **Half box**, three variants (§2.2) | a keyhole mounting hole (a shape, §4 E0) | 171 |
| **ShutterBox** | A box whose door is a flex sheet that rolls in curved grooves over one or two rounded top corners | New card **Roll-top box**, variants *one corner*, *two corners* | E1 face-glued rails, E2 tambour door | 174 |
| **BreadBox** | The same door, running from the front up over the top to the back | **Roll-top box**, variant *bread box* | E1, E2 | 174 |
| **DoubleFlexDoorBox** | Rounded box on its side; its wrap-around wall is split at the top into two doors that bend open on the corners' living hinges, closed by a latch | New card **Flex-door box** | E3 a wrap that opens, E4 a latch | 175 |
| **BinTray** | Upright rack of bins: a frame, crossing shelves and uprights, a 45° retainer across each row's front, saw-toothed front edges, screw holes in the back | New card **Bin rack** | nothing (board kit: crossing half-slots, angled boards in slots, free outlines) | 172 |
| **DisplayShelf** | Shelf with slanted floors, a lip at each floor's front, dividers on each floor, optional back and front, sloped sides | **Slanted shelf** gains words (§2.3) | nothing | 172 |
| **StorageRack** | Sides, a full top and bottom, pairs of rails at each level for trays or boxes to slide in, a back | **Shelf**, variant *Rack*: rails instead of shelves | nothing (rails exist since 169) | 172 |
| **WallRack** | A back board that hangs on the wall, with small shelves, each a board with a front lip and two sloping side lips | New card **Wall rack** | E0 keyhole holes | 172 |

### 2.1 UniversalBox, word by word

| boxes.py option | CutForge today | Plan |
|---|---|---|
| top `e` / `E` (open) | open box | — |
| top `f` / `F` / `h` (closed top) | not a word (lid `fixed` is in the records, from the bird house) | **lid: closed** (a top fingered on): 171 |
| lid `overthetop` / `ontop` | lid lifts off, style *cap* | — |
| lid `flat` (two layers: a top and a smaller board under it that locates it) | — | **lid: plug** after E1 (173) |
| lid `flatbrim` (a top with a brim of four strips standing inside the walls) | — (`ROADMAP.md` §4: the inset lid) | **lid: brim**: strips on the lid's underside in slots, set in by the wall and a play: 173 |
| lid `flatfang` (four corner pegs through the lid) | — | dropped: the brim does the same job, better |
| lid `chest` (a curved lid) | lid *arched* (bend band) | — |
| lid handle (long rounded, trapezoid, double-rounded, knob) | — | **a handle on the lid**: a small board standing on the lid, in slots, with a hand hole: 171 |
| top `t`, `y`, `Y` (raised grips on two walls' tops) | handles = slots only | **handles: grips** (the wall's top raised in a rounded tongue with a hand hole), beside *slots*: 171 |
| top `G` (mounting holes) | — | E0 keyhole holes on the back: 172 |
| top `i`, `k` (wooden pin hinge), `v` (cabinet hinge) | hinged = living hinge | **lid hinged: pins** after E5 (176) |
| top `L` (slide-on lid) | sliding-lid box (169) | — |
| top `S` / `Š`, bottom `s` / `š` (stackable) | — | **stackable** after E6 (177) |
| top `c` (click-on lid) | `tabLen: 'snap'` exists for tabs | **lid: snap** on a flat lid: 178 |
| vertical edges as finger holes (T-joints) | corner kind *tabs in slots* | — |
| bottom `h` (base inside the walls) | base kinds | — |
| BasedBox (the base overhangs the walls) | — | **base: overhang** word: 171 |

### 2.2 Half box (was *Bookend*)

| Variant | From HalfBox | Boards |
|---|---|---|
| *Bookend* | default | base, back, right-triangle supports (n, from `sy`), joined to both at 90° with fingers |
| *Wall shelf* | `Mounting` | the same turned so the back hangs; keyhole holes in the back's top |
| *Clamping square* | `Clamping`, `Sturdy` | full side walls with square clamp holes in each support |

The bookend built in 166 (a rectangular side) becomes *Sturdy* (`sturdy: true`) of the bookend.

### 2.3 Slanted shelf words (from DisplayShelf)

`lip` (front lip height, 0 = none) · `dividers` per tier (count) · `back` (on/off) · `sloped sides` (the sides cut back along the tiers) · `tilt` up to 35°, and backwards (−10 … −25) for a shelf seen from behind.

## 3. Everything else, by what it needs

Legend: **★** new card · **◇** variant of a card · **⚑** challenge on a card (a mission: fixed sizes and words) · **w** a word on an existing structure · **=** already there (the recogniser names it; nothing to build).

### 3.1 Already there (=)

| boxes.py | Is |
|---|---|
| ABox | open box / lidded box |
| OpenBox, NotesHolder | open-front box (NotesHolder stacking: E6) |
| RegularBox (no taper) | box, shape *poly* (taper: E7) |
| RoundedBox | box, shape *rounded* |
| TypeTray, TrayLayout | organiser (spaces by count or size) |
| SlidingLidBox | sliding-lid box |
| SlidingDrawer | drawer box (plywood since 162) |
| PenHolderBox | pen holder |
| SmallPartsTray, SlantedTray | scoop tray |
| MagazineFile, DiceTower, LaptopStand, Desksign, BirdHouse, StorageShelf, TrayInsert | their cards |
| PhoneHolder, BookHolder | stand, phone variant (BookHolder is the same at a book's size) |
| CardHolder (shelf) | slanted shelf |
| JointPanel | *Split* with puzzle keys |
| BurnTest, FlexTest, FlexTest2, FillTest | the kerf test and bend test in the download; not presets |
| RectangularWall, TriangularWall, LBeam, ZBeam | one board, or a strip of boards, drawn in Workshop; as presets they would be look-alikes of a plain board |

### 3.2 Doable on today's engine and the board kit (171, 172, 178)

| boxes.py | Becomes | Boards and joints |
|---|---|---|
| ClosedBox | w lid *closed* (§2.1) | a box with a fingered top |
| BasedBox | w base *overhang* | — |
| DisplayCase | ⚑ on *closed* with *overhang* on the top | the acrylic dropped: plywood throughout |
| CardBox | ⚑ on lidded box: spaces for decks, a finger notch | — |
| CompartmentBox | w spaces on the sliding-lid box | dividers under the rails |
| SmallPartsTray (two-sided) | ◇ scoop tray *both ends* | two ramps |
| DividerTray | ◇ organiser *loose dividers*: dividers whose top corners rest in notches in the walls' tops, lifted out by hand | notches on a wall's top edge |
| SmallPartsTray2 | ★ **Scoop organiser**: an organiser with a ramp in each space | ramps between dividers |
| UnevenHeightBox | ◇ magazine file *uneven*: a height per corner | `setWallCorner` per wall |
| Console, Ramp | ★ **Console**, variants *console* (low front, sloped top) and *wedge* (no front) | a board grown off the side walls' sloped edges, as the bird house's roof |
| Dispenser | ★ **Dispenser**: a tall box, an opening at the foot of the front, a viewing slot | holes in the front |
| DiscRack | ★ **Record rack**: sides with angled slits that the discs stand in | slit details, base, back |
| WineRack | ★ **Honeycomb rack**: slats crossing at 60° in half-slots | the slot body at 60° (half-slots at any angle: 165) |
| BottleStack | ◇ bottle rack *stack*: cradle beams crossing in half-slots | arcs on the beams' edges |
| SpicesRack, PaintStorage | ◇ bottle rack *jars*: level boards with round holes, jars standing (PaintStorage stacking: E6) | — |
| CanStorage | ★ **Can dispenser**: chutes sloping between two side walls | angled boards in slots (`lean`) |
| HobbyCase | ⚑ on Shelf *Rack*, with organiser trays | large: needs E9 |
| SBCMicroRack | ⚑ on Shelf: level boards with a hole grid for board mounts | — |
| CoinDisplay | ★ **Showcase**: a small box with a plate at a slant inside, a hole for a coin | the dice tower's angled-board helper |
| Display (flyer stand) | ◇ stand *flyer*: a rounded plate in a slotted foot | — |
| Silverware | ★ **Cutlery caddy**: a rounded tray with one tall middle divider with a hand hole | divider taller than the walls (allowed without a lid) |
| Folder | ★ **Book cover**: two boards and a living-hinge spine | a plywood fold with a radius is a living hinge (63) |
| Castle | ★ **Castle tower**: walls with crenellated tops | wall-top outline points |
| GridfinityBase, GridfinityTrayLayout | ★ **Gridfinity base**: a frame with a top plate of 42 mm openings; its tray layout is an organiser ⚑ | a plate with an array of rounded squares |
| SkadisBoard, SkadisStand | ★ **Pegboard** (slot array, rounded), ◇ with feet | arrays (README §7) |
| Clock | ★ **Clock face**: a round board, engraved numbers, two legs in slots | text details, engraved |
| StevensonScreenBox | ★ **Louvred box**: slats at a slant between side walls | angled boards in slots |
| TrafficLight, TriangleLamp, OrganPipe, BeeQueenCage | ⚑ on closed box / pen cup (n = 3) | holes, small hood boards |
| Platonic | ★ **Platonic solid** in Shapes: Shapes' *Build from boards* (125) picks fingers or tabs per dihedral | the icosahedron (138°) gets tabs |
| NemaMount | ★ **Motor bracket**: two boards at 90° and triangular gussets | — |
| AngledCutJig, LaserHoldfast | ★ **Laser jigs** (one card, two variants) | small boards |
| PizzaShovel | ★ **Pizza peel** (board and handle; the paper conveyor dropped) | — |
| PoleHook | ⚑ low priority: discs and forks, bolts | — |

### 3.3 Wall-mounted (E0 only: 179)

boxes.py hangs 22 generators on a wall system (`walltype`: plain, reinforced, slatwall, DIN rail, French cleat, Skådis). Here, **one word on every wall card: hang by *screws* (keyhole holes) or *cleat*** (a second board with a hook profile; a laser cannot bevel, so boxes.py's stepped cleat is the model). Slatwall, DIN rail and Skådis hooks come later, as more values of the same word.

| Card | boxes.py |
|---|---|
| ★ **Wall rack** (172) | WallRack, WallConsole |
| ★ **Tool holder**, variants slotted · round holes · wrench · pliers · caliper · plane | WallSlottedHolder, WallChiselHolder, WallWrenchHolder, WallPliersHolder, WallCaliper, WallPlaneHolder |
| ★ **Hooks**, variants hook · pin row · key board | WallHook, Hook, WallPinRow, KeyHolder |
| ★ **Roll holder** | RollHolder, WallRollHolder |
| ★ **Hopper** | WallHopper |
| ★ **Wall steps**, variants steps · drill stand (stepped bins, also stands on a desk) | WallStairs, WallDrillBox, DrillStand (dividers of different heights: the organiser-heights work left open in 162) |
| ⚑ on the organiser | WallTypeTray |
| after E6 | WallStackableBin |

### 3.4 After a face-glued joint, E1 (173; cards in 182)

| boxes.py | Becomes |
|---|---|
| UniversalBox lid `flat` | w lid *plug* |
| PhotoFrame, EngravingFrame | ★ **Frame**, variants photo (a slot for the photo and its glass) · plaque (an engraved board) |
| Shadowbox | ◇ frame *shadow box*: spacer layers |
| NightLightBox | ★ **Light box**: layered art plates in a lit box (diffuser in plywood or left out) |
| BayonetBox | ★ **Twist-lid box**: layered rings, a bayonet lid |
| CoffeeCapsuleHolder, Stachel | ⚑ layered stacks |
| Spool, FilamentSpool | ★ **Spool**: two discs on a polygon hub (the bayonet split: E1) |
| DrillBox, GridfinityDrillBox | ★ **Drill box**: layered plates with stepped holes (stacking: E6) |
| BeeQueenTransportBox | ⚑ on drill box |
| ShutterBox and BreadBox rails | E2 needs E1 |

### 3.5 After the flex door, E2–E4 (174–175, 181)

| boxes.py | Becomes | Needs |
|---|---|---|
| ShutterBox, BreadBox | ★ **Roll-top box** | E1, E2 |
| DoubleFlexDoorBox | ★ **Flex-door box** | E3, E4 |
| FlexBox, FlexBox2, FlexBox4 | ◇ flex-door box: *one door*, rounded at all corners · at the top two · at the left two | E3 |
| FlexBox3 | = hinged box on plywood (living hinge) | — |
| FlexBook | ★ **Book box**: a flex spine, a latch | E3, E4 |
| UBox | ◇ rounded box, *U*: two corners rounded | E8 |
| RoundedRegularBox, RoundedTrapezoidBox | box, shape *poly* rounded / trapezoid rounded | E8 (+E7 for the trapezoid) |
| HeartBox | ★ **Heart box** | E8 (a band round any outline) |
| Shoe | ⚑ low priority | E8 |

### 3.6 After pin hinges, E5 (176)

| boxes.py | Becomes |
|---|---|
| UniversalBox `i`, `k`, `v` | w hinged *pins* · *cabinet* |
| IntegratedHingeBox | = hinged box with pins |
| DiceBox | ★ **Dice box**: a flat box, a hinged lid, magnet holes, hex pockets |
| PirateChest | ★ **Chest**: a lid of n angled boards on a pin hinge |
| HingeBox, SideHingeBox | ◇ hinged box *cabinet hinge* · *side pivot* |
| CoinBankSafe | ★ **Coin safe**: a door on pins, a dial |
| Kamishibai | ★ **Picture theatre** (needs 5 mm ply or more; large: E9) |

### 3.7 After stacking feet, E6 (177)

Crate (stackable) w · StackableBin ★ **Stacking bin** · WallStackableBin ◇ · PaintStorage w · StorageRack w · NotesHolder w · BrickSorter ★ **Sieve stack** · Dispenser w · DrillBox w.

### 3.8 After footprints and tapers, E7 (180); shapes and game parts, E10 (183); enclosures (184)

- **E7, any footprint for a box of boards** (irregular, concave): AngledBox ◇ box *chamfered*, Coffin ★ **Coffin box**, Tetris ★ **Tetromino boxes**, RegularStarBox ★ **Star box**. A tapered regular box (RegularBox with two radii) is a spike: compound-angle fingers.
- **E7 also:** FatBallDispenser ★ **Feeder**: a hexagonal box with a pyramid roof (roof boards meeting at compound angles: the taper spike).
- **E10 Shapes** (the Shapes tool, as planned in 168): Gears, Pulley, ConcaveKnob, WavyKnob, HolePattern, FanHole, NemaPattern, SevenSegmentPattern, DrillGauge, JigsawPuzzle, and FrontPanel's layouts. **Game parts**: RoyalGame (board and tokens), FrameLoom's comb and shuttles. After gears: GearBox ★, Planetary ⚑, Linkage ⚑.
- **Enclosures** as challenges on *closed box* with a screw-on top on corner blocks: ElectronicsBox, RackBox, Rack19Box, Rack10Box, Rack19HalfWidth, EuroRackSkiff, Matrix, SevenSegmentClock, AirPurifier and Arcade (large: E9), CarbonFilter. Hatches that latch (E4): Console2, SideDoorHousing, DinRailBox.
- **AgricolaInsert**: ⚑ on the organiser (fixed sizes).

### 3.9 Not offered, and why

| boxes.py | Why |
|---|---|
| PaperBox, BottleTag, Sphere | paper or 1 mm card, folded |
| OttoSoles | foam |
| Keypad, Atreus21 | 1.5 mm switch plates, switch-specific cut-outs |
| OttoBody, OttoLegs, RobotArm | servo kits, sized to one servo |
| MakitaPowerSupply | one battery's mount profile |
| LaserClamp, Rotary | spring-flex clamp; a rotary attachment with bearings and belts |
| Planetary2 | its author: "not yet working properly" |
| FlexBox5 | a cone: a band on a cone is not a cylinder's band (E8 bends round straight lines only) |
| Lamp | unfinished, CLI only |
| AllEdges, Edges, WallEdges, TrayLayoutFile | demos and a CLI helper |

## 4. Engine steps

| # | Step | Unlocks | Risk and notes |
|---|---|---|---|
| E0 | **Mounting holes**: a keyhole (pear) shape and a countersunk screw hole in the Shapes list; a board's *hang by* word places two near its top | HalfBox shelf, WallRack, BinTray, all of §3.3 | low |
| E1 | **Face-glued joint** (`laminate`): two boards face to face, glued; the export check accepts the contact; 3D stacks them; the cut plan marks the glue face | plug lid, rails and grooves, frames, layered things | medium: a new `ConnectionKind`; the census allows it on plywood. Needed by 167 already (frames). |
| E2 | **Tambour door**: a free board with a living-hinge slit field over most of its length; its 3D shape follows a path (straight–arc–straight) through a groove; posed shut, half open and open | roll-top box | medium-high: the bend band is drawn today only between two boards; here it is a free strip on a path. The groove is two laminated rails (E1) with an arc. **Test cut required.** |
| E3 | **A wrap that opens**: a box's wall ring (rounded corners as living-hinge bands) split at a point; the segments either side are released from the base and top plates over a span, so they swing about the bands | flex-door box, the FlexBox family, book box | medium: the hinged box on plywood (155) already turns a lid about a band; this generalises it to a wall segment |
| E4 | **Latch**: a pair of interlocking hooks where two edges meet (a flexing tongue and a catch) | flex-door box, book box, latched hatches | low-medium; **test cut required** |
| E5 | **Pin hinges**: knuckles on two boards and a wooden or wire pin; chest hinge; cabinet hinge | §3.6 | the pin-hinge spike in `ROADMAP.md` §4 (three boxes cut until each opens past 100°) |
| E6 | **Stacking feet**: a wall reaching below its base as feet, and matching notches in the walls' tops | §3.7 | as found in 169: a wall's bottom corners only slide along the base's edge; the wall outline must reach past it |
| E7 | **Any footprint** for a box of boards (irregular, concave); taper as a spike | §3.8 | concave corners: fingers at a 270° corner seen from outside |
| E8 | **A band round any outline**: rounded corners on chosen corners only, on any polygon, and round an outline of arcs | UBox, rounded poly and trapezoid, heart | the round box's band (64–65) works on rounded rectangles and circles today |
| E9 | **Bigger than the sheet**: plywood profiles at the owner's sheet size, and a board larger than the sheet split with puzzle keys on its own (the Split exists; it is not automatic for boards) | HobbyCase, Kamishibai, Arcade, AirPurifier | low, once the owner's sheet size is known |
| E10 | **Shapes footprints and game parts** (168) | §3.8 | Shapes-tool work |

## 5. Milestones

| # | Milestone | Done when |
|---|---|---|
| **171** | **Owner's picks I, on today's engine**: the two picture fixes (§1); lid *closed*, *rim* (two-piece), *grips*, a lid handle, base *overhang* (§2.1); Half box with three variants (§2.2); E0 keyhole holes | each new variant differs from its siblings by the hash test; goldens for TwoPiece, Half box × 3 on ply-3 |
| **172** | **Owner's picks II, shelves**: Shelf *Rack* (StorageRack), Slanted shelf words (DisplayShelf), ★ Bin rack, ★ Wall rack | contract tests (defaults, every min and max, on one sheet), census clean, contact sheet |
| **173** | **E1 face-glued joint**; lid *plug*, lid *brim* | a plug lid seats in 3D within clearance; export check clean |
| **174** | **E2 tambour door**; ★ Roll-top box (one corner, two corners, bread box) | the door follows the groove shut and open in 3D; its slit pitch from `bendPatterns.ts` at the groove's radius; beta until cut |
| **175** | **E3 a wrap that opens, E4 latch**; ★ Flex-door box; the FlexBox variants; ★ Book box | doors swing on their bands in the pose; latch closes within clearance; beta until cut |
| **176** | **E5 pin hinges** (the spike's three test boxes first); §3.6 | the spike's result in `DECISIONS.md`; the fallback (living hinge) if it fails |
| **177** | **E6 stacking feet**; §3.7 | two bins stack in 3D within clearance |
| **178** | **The rest of §3.2** | contract tests and goldens per card |
| **179** | **Wall-mounted** (§3.3) | each card hangs by screws and by cleat |
| **180** | **E7 any footprint**; chamfered, coffin, tetromino, star | concave corners fingered; census clean |
| **181** | **E8 a band round any outline**; UBox, rounded poly, rounded trapezoid, heart | bands at each rounded corner develop to the right length |
| **182** | **Layered things** (§3.4) | — |
| **183** | **E10 shapes and game parts**; gearbox | — |
| **184** | **E9 bigger than the sheet; enclosures** (§3.8) | a board larger than the sheet is split and keyed on its own |
| **185** | **Verification**: test cuts in plywood, en and he, contact sheets before and after | cards that passed their cut leave beta |

Plywood after 185: about 31 entries today → about 75 cards and variants, plus the challenges.

## 6. Decisions for the owner

| # | Question | Proposed |
|---|---|---|
| 1 | Which plywood thicknesses and sheet size? Only `ply-3` on 600 × 400 exists. Several designs want 4–6 mm (Kamishibai, Skådis, key board), several are bigger than 600 × 400 (HobbyCase, Arcade, AirPurifier). | Add the owner's stock as profiles before 178 (E9). |
| 2 | The roll-top box, flex-door box, latches and pin hinges only work if their clearances are right. Can test pieces be cut? | They stay beta until a cut; the plan doesn't block on it. |
| 3 | UniversalBox's options as words on the box, not a card of their own? | Yes: a card of every lid would be look-alikes of the lidded box. |
| 4 | *Bookend* renamed *Half box* (with bookend as its first variant)? | Yes; the word *a bookend* stays. |
