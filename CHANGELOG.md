# Changelog

All notable changes, newest first. Work lives on branch `hoplite/messene-ithome-eccd3356`.

## [0.5.0] - Seven Sins: story mode (2026-11-12)
### Added
- Renamed the game to **Seven Sins** (title screen, HUD logo, page title, package name). New save key `seven-sins-v1`, save VERSION 4 (old saves are not loaded).
- `src/sim/story.ts`: 7 chapters (I Sloth/weed, II Gluttony/moonshine, III Wrath/meth, IV Lust/MDMA, V Pride/LSD, VI Greed/cocaine, VII Envy/heroin), each with a character, a story card and 4-8 goals.
- Products, stations, recipes, Sal's supplies and random phone deals unlock per chapter. A chapter starts only when the previous one is complete AND its `minDay` is reached (days 1/3/5/7/9/11/14). This is the main pacing control.
- Story card overlay (`#story`) at the start of each chapter; STORY button re-opens it; epilogue/victory screen with stats.
- Objective panel: chapter header, goal checklist with progress, GO buttons, "chapter X arrives on day Y".
- Locked content UI: build bar "N MORE · STORY", recipe chips "LOCKED · CH X", Recipes screen hides future chains.
### Changed
- Removed `src/sim/tutorial.ts`; chapter I is the guided tutorial (one goal at a time, SHOW ME button, skip).
- Rival gangs don't attack you in chapter I and grab neutral blocks more slowly early on.
- Starting stash is 12 weed only.
- UI polish: toasts moved above the bottom bar, readable tutorial header, calmer stash-house floor, corrected worker hint, workers only walk to loaded stations.

## [0.4.0] - Production chains (commit c0d89df)
- Production replaced buy-and-resell. 12 placeable stations in stash houses, warehouses and motels; 7 chains:
  weed (Grow Tent > Drying Rack > Trim Table), moonshine (Mash Barrel > Copper Still), meth (Lab Bench > Cooling Trays),
  MDMA (Lab Bench > Pill Press), LSD (Lab Bench > Blotter Bench), cocaine (Leaf Pit > Refinery), heroin (Boil Pot > Refinery).
- Staffing (1 worker runs 2 stations, Smarts speeds it up), stash capacity, Sal supply orders delivered by van, Marina boat imports.
- Recipes screen, Stash tab, station panel (recipe switch, sell).
- Pixel art for every station, grow lamps, burner glow, steam/smoke, worker animations. Guided tutorial with SHOW ME.

## [0.3.0] - Scale, combat, audio (commit 817b9a8)
- Real-world scale (10 px per metre), walk animations, gunfights, synth soundtrack, clickable alerts, daily wrap-up report.

## [0.2.0] - Hotline Miami art pass (commit 72f6fe2)
- Roofless buildings, hard shadows, colour-wash shader (CRT/wobble toggles), script-font HUD.

## [0.1.0] - Neon Kingpin (commit c435839)
- Rebuilt as a pixel-art Miami turf war: procedural city, 6 districts, 3 rival gangs, block control, businesses (own/extort/launder), crew stats, police heat and raids, phone with jobs and deals.

## [0.0.1] - Prototype (commit 9c7c472)
- "Totally Legit Business": first top-down empire management prototype.
