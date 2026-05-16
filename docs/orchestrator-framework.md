# Orchestrator Framework

## Purpose

This repo should move through one main orchestrator thread, supported by focused
agents. The orchestrator owns product direction, integration, testing, commits,
and roadmap truth. Specialist agents help by exploring or implementing bounded
slices without fragmenting the codebase.

## Operating Model

1. The orchestrator keeps the north star visible:
   CS2 timing, angles, utility, bomb pressure, and role identity translated into
   readable turn-based decisions.
2. Major work starts with a small milestone, not a vague feature cloud.
3. Agents are spawned for focused parallel work only when they have clear
   ownership and a concrete output.
4. The orchestrator reviews every agent result before integration.
5. A milestone is not complete until it is tested, documented, committed, and
   pushed.
6. Durable specialist learning is written back into repo docs so the next agent
   starts with better context than the previous one.

## Cold-Start Entry Points

Future orchestrator threads and specialist agents should begin with the root
handoff files:

- `CLAUDE.md`: full current agent brief and product/process context.
- `AGENTS.md`: compact cross-agent entry point.
- `HANDOFF_PROMPT.md`: copy-paste prompt for new orchestrator threads.

Then read:

- `docs/current-state.md`
- `ROADMAP.md`
- the specialist memory doc that matches the task.

Current active handoff:

- Branch: `codex/cs2-xcom-roadmap-slice`
- Draft PR: https://github.com/mohsinfd/cstactics/pull/1

## Agent Types

### Explorer Agent

Use for read-only investigation.

Output:
- Exact files/functions/data involved.
- What is wrong or missing.
- Prioritized fix list.
- Suggested first execution slice.

Rules:
- No file edits.
- No broad speculation without code references.
- Keep findings implementation-oriented.

### Worker Agent

Use for bounded additive execution.

Output:
- Files changed.
- What was implemented.
- Tests run.
- Integration risks.

Rules:
- Must be told it is not alone in the codebase.
- Must have an explicit owned write set or an additive-only scope.
- Must not edit likely conflict files unless the orchestrator assigns them.
- Must not revert unrelated work.

### Tester Agent

Use after every major feature.

Output:
- Pass/fail verdict.
- Viewports/devices tested.
- Exact human sequence performed.
- HUD, camera, action, console, and usability blockers.
- Reproduction steps for failures.

Rules:
- Read-only by default.
- Run `docs/human-usability-regression.md`.
- Report failures; the orchestrator fixes or delegates follow-up.

## Standard Milestone Loop

1. Define the milestone in one sentence.
2. Add or update the task list/roadmap if the work changes direction.
3. Spawn explorers for independent unknowns.
4. Spawn workers only for disjoint write sets or additive artifacts.
5. Integrate overlapping code locally in the orchestrator thread.
6. Run the minimum relevant checks:
   - `npm run build`
   - `npm run lint`
   - `npm run map:validate` for map/cover/LOS work
   - `npm run test:browser` for HUD, camera, input, movement, or major UX work
7. Spawn a read-only tester agent for major UX/gameplay milestones.
8. Commit and push a small named milestone.
9. Update the user with what shipped, what passed, and what is next.
10. If the milestone changes handoff context, update `CLAUDE.md`,
    `AGENTS.md`, `HANDOFF_PROMPT.md`, or the draft PR body.

## Specialist Memory Loop

Specialists should improve the repo's memory, not just the code.

When a specialist finishes, the orchestrator should capture durable learnings in
the matching file:

- Map/Inferno truth:
  `docs/banana-b-fidelity-task-list.md`
- Player/unit visuals:
  `docs/player-visualization-roadmap.md`
- Movement/camera/input feel:
  `docs/movement-smoothing-roadmap.md`
- Human usability:
  `docs/human-usability-regression.md`
- Luanti visual-client feasibility:
  `docs/luanti-visual-spike.md`
- S&box visual-client feasibility:
  `docs/sbox-visual-spike.md`
- Product status:
  `docs/current-state.md`
- Process/handoff:
  `docs/orchestrator-framework.md`, `CLAUDE.md`, `AGENTS.md`,
  `HANDOFF_PROMPT.md`

Examples of durable learning:

- exact coordinates that made Banana route order plausible;
- a visual design rule for making CT/T readable at tactical zoom;
- a trackpad or mouse interaction bug found by human-style testing;
- a failed approach that should not be repeated;
- route timing or cover-adjacency numbers that should remain stable.

Do not write every chat thought into docs. Capture only lessons that should
change how the next agent acts.

## Write-Set Rules

- Do not run two agents against the same high-churn file at the same time.
- `src/renderer/UnitRenderer.tsx` is high conflict. Visual and movement agents
  may audit it in parallel, but integration edits should normally happen in the
  orchestrator thread or in one worker at a time.
- Prefer additive helper modules and docs for parallel exploration:
  - `src/renderer/unitVisualIdentity.ts`
  - `src/renderer/movementEasing.ts`
  - `docs/*-roadmap.md`
- If two agents need the same file, serialize execution.

## Recurring Specialist Tracks

### Map Fidelity

Focus:
- Inferno silhouette, blocked areas, cover truth, route timing, utility/LOS
  consequences.

Required checks:
- `npm run map:validate`
- Browser Banana Drill
- Human visual check of first viewport

### Player Visualization

Focus:
- T/CT identity, role silhouettes, weapon readability, casualty/readability
  states, hit feedback.
- Maintain and improve `docs/player-visualization-roadmap.md` after every visual
  slice so a future visual designer agent inherits the latest decisions.

Required checks:
- `npm run build`
- `npm run lint`
- Browser screenshot/human usability check after integration

### Movement Feel

Focus:
- Path preview responsiveness, unit interpolation, execute cadence, camera/input
  interaction, no accidental clicks during drag.

Required checks:
- `npm run build`
- `npm run lint`
- `npm run test:browser`

### Human Usability

Focus:
- HUD reachability, action discoverability, camera zoom/pan abuse, laptop and
  compact viewports.

Required checks:
- `npm run test:browser`
- Read-only tester agent report after major milestones

### Luanti Visual Spike

Focus:
- Data-generated Banana/B whitebox map readability, tactical camera feasibility,
  unit visibility, and whether constrained voxel/nodebox authoring is safer for
  agents than continuing the Three.js presentation path.

Rules:
- Do not port combat, economy, bomb logic, AI, or the TypeScript game store.
- Keep map edits in
  `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/banana_b_site.json`
  unless a Lua runtime issue is being fixed.
- Treat React/Three as the tactical rules source of truth until the spike passes
  a real runtime screenshot and interaction check.

Required checks:
- `npm run luanti:validate`
- Real Luanti first-load screenshot before any main-client recommendation

### S&box Visual Spike

Focus:
- Source-2-adjacent C# workflow, generated Banana/B board fidelity, tactical
  camera feasibility, and whether the visual lift beats Luanti/Three.js enough
  to justify platform risk.

Rules:
- Use the same authored Banana/B data as the Luanti spike.
- Do not port combat, economy, bomb logic, utility, AI, or the TypeScript game
  store.
- Do not call the spike runnable until it has been opened in S&box and verified
  with a first-load screenshot.

Required checks:
- `npm run sbox:validate`
- Real S&box first-load screenshot before any main-client recommendation

## Agent Prompt Template

```text
You are the <specialist> for CS Tactics in <repo path>. You are not alone in the
codebase; other agents may be working in parallel. Do not revert or overwrite
others' edits.

Goal: <one-sentence milestone>.

Bounds:
- Owned write set: <files/folders or additive-only>.
- Avoid: <conflict files/systems>.
- Exploration phase: inspect <files>.
- Execution phase: implement <small slice> or produce <artifact>.

Final answer:
- Findings.
- Files changed.
- Tests run.
- Next integration step.
```

## Done Definition

A milestone is done when:

- The product behavior is visibly better.
- The roadmap/current-state docs are not lying.
- Relevant automated checks pass.
- A tester pass is run for major UX/gameplay changes.
- The branch is pushed with a clear commit.
