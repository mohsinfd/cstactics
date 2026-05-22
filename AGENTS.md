# Agent Entry Point

This repository uses a main-orchestrator plus specialist-agent workflow.

Cold-start order:

1. Read `CLAUDE.md`.
2. Read `docs/current-state.md`.
3. Read `ROADMAP.md`.
4. Read `docs/orchestrator-framework.md`.
5. Read the relevant specialist memory doc for your task.

Active branch/PR:

- Branch: `codex/cs2-xcom-roadmap-slice`
- Draft PR: https://github.com/mohsinfd/cstactics/pull/1

Important rule:

- Durable learnings must be written back to docs, not left only in chat.

Specialist memory docs:

- Map/Inferno: `docs/banana-b-fidelity-task-list.md`
- Player visuals: `docs/player-visualization-roadmap.md`
- Movement/camera/input: `docs/movement-smoothing-roadmap.md`
- Human usability: `docs/human-usability-regression.md`
- Luanti visual spike: `docs/luanti-visual-spike.md`
- S&box visual spike: `docs/sbox-visual-spike.md`
- Visual spike resume handoff: `docs/visual-spike-resume-handoff.md`
- Process: `docs/orchestrator-framework.md`

Required checks by area:

- Code: `npm run build`, `npm run lint`
- Map/cover/LOS: `npm run map:validate`
- Luanti spike data: `npm run luanti:validate`
- S&box spike data: `npm run sbox:validate`
- HUD/camera/input/major UX: `npm run test:browser`

Do not revert or overwrite work you did not make.
