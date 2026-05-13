# CS2 Tactics Agent Brief

## Cold-Start Protocol

If you are Claude Code, Codex, or any other coding agent starting cold, do this
before changing files:

1. Read this file completely.
2. Read `docs/current-state.md`.
3. Read `ROADMAP.md`.
4. Read `docs/orchestrator-framework.md`.
5. For the active slice, read the matching specialist memory doc:
   - Map and Inferno fidelity: `docs/banana-b-fidelity-task-list.md`
   - Player/unit visuals: `docs/player-visualization-roadmap.md`
   - Movement/camera/input feel: `docs/movement-smoothing-roadmap.md`
   - Human testing: `docs/human-usability-regression.md`
6. Check `git status --short` and protect any existing user/agent changes.
7. Continue from the latest pushed branch/PR context, not from old assumptions.

Current active roadmap branch:

- Branch: `codex/cs2-xcom-roadmap-slice`
- Draft PR: https://github.com/mohsinfd/cstactics/pull/1
- Local dev URL usually used for testing: `http://127.0.0.1:5174/`

## Product North Star

CS2 Tactics is a browser-based turn-based tactical game that should feel like
Counter-Strike slowed down into readable, XCOM-style decisions.

It is not "XCOM with CS skins." The soul is CS timing:

- map recognition;
- angle ownership;
- utility timing;
- trades;
- bomb pressure;
- role identity;
- synchronized executes/retakes that resolve in short readable beats.

The first five seconds matter. A CS player should look at the board and say:
"That is Inferno." Indie-looking is acceptable; vague, rough, or toy-like is not.

## Orchestrator Model

The preferred workflow is one main orchestrator thread plus focused specialist
agents.

The orchestrator owns:

- product direction and roadmap truth;
- task decomposition into small milestones;
- branch hygiene, integration, commits, pushes, and PR updates;
- deciding which specialist agents run in parallel;
- reviewing specialist output before integrating it;
- running final checks before each pushed milestone.

Specialists should be used for bounded work only:

- Map Fidelity specialist
- Player Visualization / Visual Design specialist
- Movement Feel specialist
- Human Usability tester
- Gameplay Systems specialist
- Audio/VFX specialist

Every specialist prompt must say:

- "You are not alone in the codebase."
- Do not revert or overwrite others' edits.
- Owned write set.
- Files/systems to avoid.
- Expected final output: findings, files changed, tests run, next integration
  risk.

After every major feature or UX-facing slice, spawn or run a read-only tester
pass using `docs/human-usability-regression.md`.

## Living Memory Rule

Do not let specialist learning disappear into chat history.

When a specialist learns something durable, update the relevant memory doc in
the same milestone:

- Map geometry, route timings, cover truth:
  `docs/banana-b-fidelity-task-list.md`
- Unit silhouettes, role readability, sprite/model direction:
  `docs/player-visualization-roadmap.md`
- Movement interpolation, camera, trackpad/mouse quirks:
  `docs/movement-smoothing-roadmap.md`
- Testing sequences, human friction, HUD reachability:
  `docs/human-usability-regression.md`
- Broad project truth:
  `docs/current-state.md`
- Orchestrator process:
  `docs/orchestrator-framework.md`

This is how future agents avoid cold start and how visual/gameplay context keeps
improving over time.

## Current Implementation Snapshot

The repo is no longer just a movement demo. It already has first-pass systems
for:

- Inferno-inspired map data and radar-derived walkable mask.
- Banana/B cover validation and route-order guardrails.
- Angled orthographic tactical camera.
- Unit selection, AP movement, A* pathing, movement range, and path preview.
- Plan Execute mode with queued movement, smoke, and flash orders.
- Run Execute with visible ticked movement and held-angle contact interrupts.
- Hold Angle, watched-lane overlays, reaction fire, and contact break.
- Direct Shoot action, hit chance, damage, headshot/crit, combat log, and
  kill/casualty feedback.
- Directional cover readouts: protected, flanked, exposed, and corner cover.
- First-pass smoke and flash utility.
- Bomb plant, defuse, dropped bomb, pickup, detonation/defuse/time/elimination
  round outcomes, and score progression.
- Ammo, reload, weapon AP shot costs, and role-aware loadouts.
- Basic CT auto-response for testing.
- Procedural feedback audio and first-pass combat VFX.
- Human usability browser regression across desktop, narrow laptop, and compact
  HUD viewports.

Read `docs/current-state.md` for the full updated list.

## Latest Critical Map Truth

Banana/B is a priority because utility, LOS, and gameplay fairness depend on it.

Recent validation route sanity:

- `T_to_Banana_Car`: 46
- `T_to_Banana_Logs`: 63
- `T_to_Banana_Sandbags`: 67
- `T_to_B`: 80
- `coverPlacementWarnings`: 0
- `coverAdjacencyWarnings`: 0
- `routeSanityWarnings`: 0

Important recent fix:

- Enlarging Banana Car accidentally sealed lower Banana.
- The validation script exposed it.
- A single walkable-mask tile at `(42,51)` restored the intended route order.

Do not edit Inferno cover/mask casually. Run `npm run map:validate` after any
map or cover change.

## Tech Stack

- React + TypeScript + Vite
- React Three Fiber and Three.js
- Zustand for game state
- Playwright for browser usability regression
- `tsconfig` uses `verbatimModuleSyntax`; use `import type` for type-only
  imports.

Useful commands:

- `npm run dev -- --host 127.0.0.1 --port 5174`
- `npm run build`
- `npm run lint`
- `npm run map:validate`
- `npm run test:browser`

## Key Files

- `src/game/store.ts`: game state, movement, actions, execute, bomb, AI.
- `src/game/combat.ts`: shot preview/resolution and cover math.
- `src/game/los.ts`: line of sight.
- `src/game/maps/inferno.ts`: cover, zones, map assembly.
- `src/game/maps/infernoWalkable.ts`: walkable mask.
- `src/renderer/IsometricScene.tsx`: camera, controls, lighting.
- `src/renderer/MapRenderer.tsx`: map, cover props, overlays, input plane.
- `src/renderer/UnitRenderer.tsx`: unit miniatures, sprites, combat VFX.
- `src/renderer/unitVisualIdentity.ts`: shared team/role visual identity.
- `src/renderer/movementEasing.ts`: movement timing/easing helpers.
- `src/ui/HUD.tsx`: command bar, roster, selected unit panel, objective panels.
- `scripts/validate-map.mjs`: map connectivity, routes, cover validation.
- `tests/human-usability.spec.ts`: mouse/trackpad-style HUD/camera regression.

## Current Player-Facing Labels

Use these terms consistently:

- `Plan Execute`: queue orders before simultaneous resolution.
- `Run Execute`: resolve queued orders.
- `Banana Drill`: prepared first-contact Banana scenario.
- `End Turn`: pass control to the other side.

Avoid reverting to old labels like `Plan Moves`, `Contact Drill`, or `End Side`
unless there is a deliberate UX reason.

## Working Rules

- Keep changes small and shippable.
- Prefer existing patterns over new architecture.
- Do not make unrelated refactors.
- Use `apply_patch` or normal editor-style changes; do not rewrite files through
  shell hacks.
- Protect dirty worktree changes you did not make.
- For renderer/HUD/input changes, run `npm run test:browser`.
- For map/cover/LOS changes, run `npm run map:validate`.
- For most code changes, run `npm run build` and `npm run lint`.
- Commit and push clean milestones to `codex/cs2-xcom-roadmap-slice`.
- Update the draft PR when a milestone meaningfully changes handoff context.

## Forbidden Product Drift

- Do not add XCOM concealment/pod mechanics.
- Do not make cover destructible.
- Do not use procedural map generation for Inferno gameplay.
- Do not let roles exceed 100 HP.
- Do not make this generic squad tactics; CS timing and map knowledge must stay
  central.
