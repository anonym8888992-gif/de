# Architecture

Stack: **Phaser 3** (rendering, scenes, input), **TypeScript** (strict, `noUnusedLocals`), **Vite** (dev server/build).
No backend. All art is generated in code (no image files). Save = `localStorage`.

## Data flow

```
config.ts (static data) ──> state.ts (one mutable GameState + View)
                                │
     sim/*.ts mutate state each game tick (called from main.ts)
                                │
     bus.ts events ('changed', 'enter', 'exit', 'story', 'toast', ...)
                │                              │
   scenes/*.ts draw the world          ui/ui.ts renders HTML overlay
   (Phaser canvas)                      (innerHTML + data-a click delegation)
```

- Game time: `state.minutes` (game minutes since start). `GAME_MIN_PER_SEC = 2` at speed 1; `view.speed` is 0 (paused), 1, 2 or 4.
- `clock(minutes)` in `state.ts` gives `{ day, hour, min, date }` (day 1 = Mon 3 Mar 1986).
- UI never mutates deep state directly for game rules; it calls functions in `sim/`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Root DOM: Phaser canvas container plus HUD containers (`#topbar`, `#menu`, `#objective`, `#panel`, `#bottom`, `#toasts`, `#modal`, `#report`, `#story`, `#title`). |
| `src/main.ts` | Boots Phaser, `BootScene` generates textures, starts City and Interior scenes, runs the sim tick loop, autosaves, calls `checkObjectives()`. Exposes `window.__nk` (state, map, view, bus) for debugging and Playwright tests. |
| `src/config.ts` | All static game data: tile sizes, colours, `ITEMS` (supplies, intermediates, products with price/heat), `STATIONS` (cost, size, recipes with inputs/outputs/minutes), `CHAINS`, `DISTRICTS` (demand per product), `GANGS`, `BIZ` (business types, laundering, upgrades), name lists, `recipeProduct()`. **Tune balance here.** |
| `src/state.ts` | `GameState` / `View` types, the city `map`, `newGame()`, save/load (`SAVE_KEY`, `VERSION` - bump VERSION when the state shape changes), helpers like `clock`, `playerBlocks`, `makeCandidate`. |
| `src/bus.ts` | Tiny event bus (`on`, `emit`) and `toast(text, kind)`. |
| `src/audio.ts` | WebAudio synth soundtrack and sound effects (`sfx(name)`), no audio files. |
| `src/sim/cityMap.ts` | Seeded procedural city: blocks, lots, roads, districts, starter lot. |
| `src/sim/rng.ts` | Seeded RNG helpers. |
| `src/sim/sim.ts` | Core simulation: crew posts (corner, guard, work), street sales, ops (takeover, extort, drop, delivery, import, contract), vehicles, combat, turf, laundering, heat/cops/raids, rival gang AI, hiring, bail, bribes, daily report. |
| `src/sim/production.ts` | Stations: `canProduce`, `placeStation`, `removeStation`, `setRecipe`, per-tick `tickProduction` (staffing, inputs from stash, progress, outputs, heat). Locked stations/recipes are rejected via `story.ts`. |
| `src/sim/story.ts` | **Story mode + tutorial.** `CHAPTERS` (sin, product, `minDay`, story text, goals), unlock helpers (`productUnlocked`, `stationUnlocked`, `recipeUnlocked`, `supplyUnlocked`), `checkObjectives()` (completes goals, advances chapters, fires `story` / `victory` events), `skipTutorial()`. |
| `src/sim/phone.ts` | Phone messages, intro calls, random deals/jobs (filtered to unlocked supplies). |
| `src/gfx/pix.ts` | Pixel-drawing helpers to make canvas textures. |
| `src/gfx/sprites.ts` | All character, vehicle, station and prop sprites. |
| `src/gfx/cityArt.ts` | Building, road and district art for the city. |
| `src/gfx/shadows.ts` | Hard drop-shadow helper. |
| `src/gfx/crt.ts` | Colour-wash / CRT post-processing pipeline (toggle in Options). |
| `src/scenes/CityScene.ts` | Whole-city camera: tiles, buildings, turf overlay, people, cars, selection, hover cards. |
| `src/scenes/InteriorScene.ts` | Building interiors: floors, stations, placement ghost, workers walking between stations, smoke/steam. |
| `src/ui/ui.ts` | All HTML UI: top bar, side menu, objective/chapter panel, right panel (selection, crew pickers, station panel), bottom bar (speed, build bar), modals (phone, supplies/Sal, recipes, crew, city, help, options), story card, title screen. Click handling = one delegated listener switching on `data-a`. `tutAction()` maps goal ids to SHOW ME behaviour. |
| `src/style.css` | All UI styling (pixel font `--px`, neon palette vars `--pink`, `--cyan`, `--gold`). |

## Save format

`localStorage[SAVE_KEY]` = the `GameState` as JSON. `state.version` must equal `VERSION` (currently 5), otherwise the save is ignored.
Fields added in v4: `chapter` (current chapter index) and `storySeen` (last chapter whose card was shown). v5: `chapterAt` (game minute the chapter started, for timed story beats).

## Testing

There is no unit-test suite. Verification so far = `pnpm build` (typecheck) plus Playwright scripts run against `pnpm dev`
that drive the game through `window.__nk` and take screenshots. Headless Chrome renders the canvas very slowly, so the sim
barely ticks there: call `__nk.checkObjectives()` directly instead of waiting for goals or story beats to fire.
A good next step is adding a `tests/` folder with these scripts.
