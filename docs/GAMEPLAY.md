# Gameplay design

## Pillars
- Satirical but realistic-feeling crime management (references: *Definitely Not Fried Chicken*, *Schedule I*, *Hotline Miami* look).
- Real-time with pause, whole-city top-down camera, step inside buildings to build.
- Story-paced: one chapter, one sin, one new product. A full run should take many hours, not 30 minutes.
- Production stays abstract and fictional. No real chemistry ever.

## Story chapters (`src/sim/story.ts`)

| # | Sin | Product | Earliest day | Character | Key goals |
|---|---|---|---|---|---|
| I | Sloth | Weed | 1 | Uncle Vic (jail) | Guided tutorial: build tent/rack/trim, assign worker, order supplies, first bag, corner dealer, $1,500 sales |
| II | Gluttony | Moonshine | 3 | Earl Pruitt | Barrel + still, 40 jars, take a block, hire someone |
| III | Wrath | Meth | 5 | Prof. Lionel Pike | Buy a laundering front, lab bench + trays, 36 bags, 4 blocks |
| IV | Lust | MDMA | 7 | Velvet | Nightclub, pill press, 120 pills, hold an Ocean Drive block |
| V | Pride | LSD | 9 | Doctor Sunshine | Blotter bench, 150 tabs, 8 crew, $60k net worth |
| VI | Greed | Cocaine | 11 | Don Aurelio | Own Marina, boat import, 40 cocaine, wipe out a gang |
| VII | Envy | Heroin | 14 | The Dutchman | Boil pot, 40 heroin, 20 blocks, wipe all 3 gangs = victory |

A chapter begins when every goal of the previous chapter is done **and** the in-game day is at least `minDay`.
Pacing knobs: `minDay`, goal amounts, `GAME_MIN_PER_SEC` in config, recipe minutes in `STATIONS`.

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
