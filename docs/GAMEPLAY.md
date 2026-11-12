# Gameplay design

## Pillars
- Satirical but realistic-feeling crime management (references: *Definitely Not Fried Chicken*, *Schedule I*, *Hotline Miami* look).
- Real-time with pause, whole-city top-down camera, step inside buildings to build.
- Story-paced: one chapter, one sin, one new product. A full run should take many hours, not 30 minutes.
- Production stays abstract and fictional. No real chemistry ever.

## Story chapters (`src/sim/story.ts`)

| # | Sin | Product | Earliest day | Character | Key goals |
|---|---|---|---|---|---|
| I | Sloth | Weed | 1 | Uncle Vic (jail) | Guided tutorial (8 steps), then: hire, 2 grow tents, 200 weed, $6k street |
| II | Gluttony | Moonshine | 8 | Earl Pruitt | Barrel + still, 3 barrels, take a block, crew of 4, 400 jars, 3 blocks, $25k street |
| III | Wrath | Meth | 20 | Prof. Lionel Pike | Front business, launder $15k, lab bench + trays, 2 guards, 400 meth, 5 blocks |
| IV | Lust | MDMA | 36 | Velvet | Pill press, nightclub, Ocean Drive block, 2 fronts, crew of 8, 2,000 pills |
| V | Pride | LSD | 56 | Doctor Sunshine | Blotter bench, 3 upgrades, crew of 10, 8 blocks, 3,000 tabs, $250k street |
| VI | Greed | Cocaine | 80 | Don Aurelio | Own Marina, 4 boats, 12 blocks, wipe out a gang, 500 cocaine, launder $250k |
| VII | Envy | Heroin | 106 | The Dutchman | Boil pot, 2 refineries, 20 blocks, 600 heroin, $1M street, wipe all 3 gangs = victory |

A chapter begins when every goal of the previous chapter is done **and** the in-game day is at least `minDay`.

### Pacing target: 9-12 hours for a fast player
- `GAME_MIN_PER_SEC = 2`: a game day is 12 real minutes at `>` and 3 minutes at `>>>`.
- The campaign is sized for ~160-180 game days. A fast player sits on `>>>` and pauses to manage, so ~3.5 real minutes per day, ~10 hours total.
- Goal amounts are sized from station throughput (e.g. one Lab Bench ~36 bags/day, one Refinery ~24/day) so an efficient player finishes near the next `minDay`, not long before.
- **Estimated, not play-tested end to end.** Tune `minDay`, goal amounts and recipe minutes after a real playthrough.

### Story beats (`Chapter.beats`)
Each chapter has 3 phone calls from its characters: fired after a goal (`after: goalId`) or N days into the chapter (`day: n`, measured from `state.chapterAt`). Some have choices with consequences (pay to lower heat, refuse and anger a gang, fire a suspected rat, ...). Fired beats are recorded in `state.objectives` as `beat:<id>`; answers go through `resolveBeat()` via the phone action `story`.

## Production
- Stations are placed inside buildings that can produce (stash house, warehouse, motel). Each has a footprint and cost.
- A station runs a recipe: consumes inputs from the stash, waits N game minutes, outputs items. Chains pass intermediates (wet bud, dry bud, wash, raw meth, ...) through the stash.
- Workers: crew posted with kind `work`. One worker keeps 2 stations running; higher Smarts is faster.
- Running stations add heat. Stash has a capacity.
- Supplies: order from Sal (van delivery, can be pulled over) or, for coca leaves / opium, import by boat once you own the Marina.

## Selling
- Crew posted on a corner sell product in their block. Price depends on product and district demand (`DISTRICTS[].demand`). Earns dirty cash.

## Turf & gangs
- City of blocks in 6 districts. 3 rival gangs (Los Flamingos, Barracudas, Tiger Mob) own blocks.
- Takeover ops on blocks adjacent to yours; guards defend. Rivals attack (not in chapter I) and grab neutral blocks.
- Wipe out a gang by taking all their blocks.

## Money
- Dirty cash from the street; clean cash needed for big purchases. Businesses (laundromat, video store, diner, ...) launder dirty to clean (fee `LAUNDER_FEE`). Businesses can be owned or extorted.

## Heat
- Sales, production, violence raise heat. High heat brings patrols and raids (arrests, seizures). Bribes and lying low lower it.

## Crew
- Goons have stats (muscle, smarts, cool...), quirks, status (idle, posted, op, hurt, jail). Hire from candidates in the Crew screen.
