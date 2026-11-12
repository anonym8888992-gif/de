# Handoff notes (read first)

Written for whichever AI or developer continues this project. Last updated 2026-11-12.

## Owner's wishes (keep these)
- Name: **Seven Sins**. Miami 1986, neon Hotline-Miami-style pixel art.
- Satirical but realistic-feeling management; real-time with pause; top-down city plus interiors.
- 7 products made through worker-run production chains: weed, moonshine ("illegal high-proof alcohol"), meth, MDMA, LSD, cocaine, heroin.
- **Slow pacing via story** - the owner felt the game was "bam bam too fast" and could be finished in 30 minutes.
- Windows `.exe` later (planned route: Electron + electron-builder; Tauri is a lighter option). **Not now.**
- **Hard rule:** production stays abstract and fictional. Never add real synthesis steps, real precursors, quantities or conditions.

## Current status
- Branch: `hoplite/aigeai-e145465a` (v0.6.0, based on `hoplite/messene-ithome-eccd3356` which holds v0.5.0). `pnpm build` passes.
- v0.6.0: story stretched to a ~9-12 hour fast run (see GAMEPLAY.md "Pacing target"), mid-chapter story calls with choices, calendar date in the HUD, menu/layout fixes at 1366x768, restyled story card.
- **Not yet fully playtested:** chapters II-VII end-to-end, the balance of goal numbers vs `minDay`, the victory screen. The 9-12 h figure is an estimate from production math.

## Open bugs / known issues
1. Balance is unverified over a full run. Watch for: waiting idle before a chapter's `minDay`, goals that take far longer than the gate (e.g. "wipe all 3 gangs"), money snowballing late.
2. Old saves (VERSION 4 and the earlier `neon-kingpin-v3`) are ignored. Intended.
3. Interior build bar scrolls horizontally on small screens (it now stays between the objective card and the right panel).
4. Graphics polish this round was UI-only (story card, objective list, HUD). The in-world pixel art was left as is, by the owner's request ("pretty happy with what we have").

## Next tasks (owner's requests, in priority order)
1. **Playtest pass** through chapters II-VII; tune `minDay`, goal amounts and recipe times in `story.ts` / `config.ts`.
2. More story beats/side jobs per character if chapters feel empty while waiting for `minDay`.
3. Light in-world graphics polish if the owner asks.
4. Later: Electron `.exe` packaging.

## How to verify changes
- `pnpm build` must pass (strict TS; unused imports fail the build).
- Run `pnpm dev`, open http://localhost:5173. In the browser console, `window.__nk` gives `state`, `map`, `view`, `bus`.
  Cheats for testing: `__nk.state.minutes += 1440*3` (skip days), `__nk.state.dirty += 1e5`, `__nk.state.chapter = 3`.
- Playwright (playwright-core + system Chrome) scripts were used for screenshots. They aren't committed yet.

## Where things are
See [ARCHITECTURE.md](ARCHITECTURE.md) for every file, [GAMEPLAY.md](GAMEPLAY.md) for design and [../CHANGELOG.md](../CHANGELOG.md) for history.
