# Handoff Prompt

Use this when starting a new orchestrator thread or another coding agent:

---

You are continuing CS2 Tactics, a browser-based turn-based tactical game that
should feel like Counter-Strike slowed down into readable XCOM-style decisions.

Repo: https://github.com/mohsinfd/cstactics

Active branch: `codex/cs2-xcom-roadmap-slice`

Draft PR for handoff: https://github.com/mohsinfd/cstactics/pull/1

Local workspace may already be running at `http://127.0.0.1:5174/`.

First, read:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/current-state.md`
4. `ROADMAP.md`
5. `docs/orchestrator-framework.md`
6. `docs/luanti-visual-spike.md` if the task touches the visual-client pivot

Then check:

```powershell
git status --short
git log --oneline -8
```

You are the main orchestrator unless explicitly assigned as a specialist. Keep
the project moving through small milestones. Use focused agents for bounded
subtasks, but integrate, test, commit, push, and update the PR from the
orchestrator thread.

Current product thesis:

- The game should be a polished CS2/XCOM amalgamation.
- Map recognition comes first: a CS player should instantly recognize Inferno.
- The core gameplay soul is angle ownership, utility timing, trades, bomb
  pressure, and synchronized executes/retakes.
- Do not build generic XCOM with CS labels.
- A contained Luanti visual spike now exists as a dual-track feasibility test.
  It is not a gameplay port; React/Three remains the rules prototype.

Current labels:

- Plan Execute
- Run Execute
- Banana Drill
- End Turn

Current Banana route sanity from `npm run map:validate`:

- `T_to_Banana_Car`: 46
- `T_to_Banana_Logs`: 63
- `T_to_Banana_Sandbags`: 67
- `T_to_B`: 80
- `routeSanityWarnings`: 0

Next likely work:

- Continue Banana/B fidelity: lower/mid Banana mask, B-entry, coffins, oranges,
  construction, and cover truth.
- Continue player visual design through `docs/player-visualization-roadmap.md`.
- Continue movement/camera smoothness through `docs/movement-smoothing-roadmap.md`.
- If continuing the visual-client pivot, validate the Luanti data with
  `npm run luanti:validate`, then run Luanti locally and capture a first-load
  screenshot before arguing for or against a port.
- After major UX/gameplay changes, run `npm run test:browser`.

Important: durable learning must be written back to the matching memory doc so
future specialist agents start better than the previous one.

---
