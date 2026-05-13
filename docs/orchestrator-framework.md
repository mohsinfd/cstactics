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
- Browser Contact Drill
- Human visual check of first viewport

### Player Visualization

Focus:
- T/CT identity, role silhouettes, weapon readability, casualty/readability
  states, hit feedback.

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
