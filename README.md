# Totally Legit Business Co.

A satirical top-down browser management game. Grow, pack and sell "oregano" out of Grandma's garage, launder the cash through front businesses, and expand across the city while keeping police heat down.

## Run

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # typecheck + production build into dist/
```

## Controls

- Drag / WASD to pan, scroll / Q-E to zoom
- Click a building to inspect it, click again to go inside
- Space pauses, 1/2/3 set speed, Tab opens the Empire screen, Esc leaves a building

## Code layout

- `src/sim/` – simulation (city generation, workers, economy, heat, raids), independent of rendering
- `src/scenes/` – Phaser scenes: city view and building interiors
- `src/gfx/` – all art is drawn procedurally on canvas, no asset files
- `src/ui/` – HTML/CSS overlay (HUD, panels, toolbar)
