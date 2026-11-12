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
- Branch: `hoplite/messene-ithome-eccd3356`. `pnpm build` passes.
- Story mode (v0.5.0) is implemented and smoke-tested: new game shows the Chapter I card, only weed stations are unlocked, no runtime errors.
- **Not yet fully playtested:** chapters II-VII end-to-end, the balance of goal numbers vs `minDay`, the victory screen.

## Open bugs / known issues
1. Some menus were reported "still buggy" by the owner. Not yet pinned down. Check at 1366x768: modals overlapping the bottom bar, the right panel (`#panel`) overlapping the objective panel, clicks intercepted by the build bar (previously fixed by raising `#modal` z-index).
2. Story card styling is basic (added quickly in `style.css` under `/* story mode */`). Polish it.
3. Old saves (`neon-kingpin-v3`) are ignored after the rename. That's intended.
4. `tutAction()` in `ui.ts` only has SHOW ME behaviour for some goal ids. Goals without an `action` show no button.

## Next tasks (owner's requests, in priority order)
1. **UI polish pass + fix buggy menus** (see bugs above). Test every modal: Phone, Supplies, Recipes, Crew, City, Help, Options.
2. **Graphics polish** (owner is happy with the style; light polish only, not a redesign).
3. **Pacing/balance**: play through chapters, tune `minDay`, goal amounts and recipe times so each chapter takes about 30-60 minutes. Consider more mid-chapter phone story events.
4. More story flavour: side jobs per character, consequences (Uncle Vic calls, betrayals).
5. Later: Electron `.exe` packaging.

## How to verify changes
- `pnpm build` must pass (strict TS; unused imports fail the build).
- Run `pnpm dev`, open http://localhost:5173. In the browser console, `window.__nk` gives `state`, `map`, `view`, `bus`.
  Cheats for testing: `__nk.state.minutes += 1440*3` (skip days), `__nk.state.dirty += 1e5`, `__nk.state.chapter = 3`.
- Playwright (playwright-core + system Chrome) scripts were used for screenshots. They aren't committed yet.

## Where things are
See [ARCHITECTURE.md](ARCHITECTURE.md) for every file, [GAMEPLAY.md](GAMEPLAY.md) for design and [../CHANGELOG.md](../CHANGELOG.md) for history.
