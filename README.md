# SEVEN SINS · Miami 1986

A satirical, top-down pixel-art crime management game for the browser (Phaser 3 + TypeScript + Vite).
You inherit Uncle Vic's stash house in 1986 Miami. Across seven story chapters (one sin, one product each)
you build production chains, staff them with your crew, sell on street corners, take turf from rival gangs,
launder money and keep the Vice Squad off your back.

Production is deliberately **game-abstract**: fictional supplies ("Lab Chemicals", "Mash Kit"), timers and
station names only. Never add real chemistry, precursors or procedures.

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build into dist/
```

## Docs (read these before changing anything)

| File | What it covers |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | **Start here if you are an AI or new dev.** Current status, open bugs, next tasks, rules. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Every source file and what it does, data flow, save format. |
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | Game design: story chapters, production chains, economy, turf, heat, crew. |
| [CHANGELOG.md](CHANGELOG.md) | Full history of what was built. |

## Controls

Mouse: click blocks, buildings and people · drag or WASD to pan · wheel to zoom · double-click a building to go inside.
Keys: `Space` pause · `1` `2` `3` speed · `Esc` leave interior / cancel placing.
