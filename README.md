# NEON KINGPIN · Miami 1986

A satirical top-down crime management game for the browser. Pixel art in a Hotline Miami / GTA 2 vein, with a CRT filter and neon at night.

You inherit Uncle Vic's stash house in Palmetto Flats. Run corners, take blocks from three rival gangs, buy or shake down businesses, launder the money and keep the Vice Squad off your back.

## Run

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # typecheck + production build into dist/
```

## How it plays

- **Turf:** the city is 30 blocks. Los Flamingos, The Barracudas and Tiger Mob hold the rest. Send crew to take blocks next to yours. Rivals counter-attack, so post guards.
- **Corners:** post dealers on your blocks. They sell from your stash for dirty cash.
- **Product:** order from Sal (a van drives it in) or own the Marina and import by boat. Deliveries can get pulled over.
- **Businesses:** buy them with clean money or shake them down for protection. Each type has a perk, and owned ones have upgrades you place inside.
- **Heat:** wanted stars lead to corner busts and DEA raids. Pay off Captain Morales or own a diner.
- **Phone:** the answering machine brings jobs, deals, threats and truce offers.

## Controls

Drag / WASD to pan, wheel or Q/E to zoom, click blocks and businesses, double-click a business you own to go inside. Space pauses, 1/2/3 set speed, P phone, C crew, Tab city overview, Esc back.

## Code layout

- `src/sim/` – simulation (city generation, ops, fights, economy, rival AI, phone), independent of rendering
- `src/gfx/` – all art is drawn procedurally pixel by pixel (no asset files), plus the CRT post-processing shader
- `src/scenes/` – Phaser scenes: city and building interiors
- `src/ui/` – HTML/CSS overlay
