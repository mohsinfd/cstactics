# Human Usability Regression Framework

## Purpose

Build/lint/map validation are not enough. After every major feature, a tester
agent must use the game like an impatient human: quick zooms, sloppy pans,
visible-button clicks, changing plans, and returning to core actions without
hunting for the HUD.

## Post-Feature Tester Agent

Spawn a read-only tester agent after every major feature milestone.

Prompt shape:

> You are the post-feature human usability tester for CS Tactics. Do not edit
> files. Run the app, use the browser like a human with mouse and trackpad
> behavior, and report blockers with exact reproduction steps. Focus on HUD
> reachability, camera movement, action discoverability, tile targeting, console
> errors, and whether the new feature remains usable after zoom/pan abuse.

The orchestrator keeps implementation authority. The tester agent reports:

- Pass/fail verdict.
- Exact viewport(s) tested.
- Human sequence performed.
- HUD/action controls that became hidden, overlapped, disabled unexpectedly, or
  required hunting.
- Console/runtime errors observed.
- Screenshots only when visual layout is the failure.

## Human-Click Contract

At every supported viewport, after camera abuse, these must remain visible and
clickable without panning the page or searching:

- `hud-command-bar`: plan execute, Banana drill, run execute/end turn.
- `hud-view-controls`: zoom in, zoom out, reset.
- `hud-top-bar`: score/round/phase.
- `hud-team-roster`: active side unit selection.
- `hud-selected-unit-panel`: move, shoot, hold, utility, reload, done.

Stable automation hooks are available through `data-testid` attributes for the
HUD containers and primary action buttons. Active roster entries should be
semantic buttons with `hud-roster-unit-{id}` hooks, a `Select ...` accessible
name, and a center point that remains reachable after camera abuse.

## Required Human Sequences

### Mouse

- Start at `http://127.0.0.1:5174/`.
- Click `Banana Drill`.
- Wheel zoom in three times.
- Drag quickly from lower-left to upper-right, then back.
- Wheel zoom out twice.
- Click `Reset camera`.
- Click `Plan Execute`, `Move`, `Shoot`, `Hold`, and `Done` where enabled.
- Verify visible target buttons remain reachable in shoot mode.

### Laptop Trackpad

- Start at default camera.
- Two-finger vertical pan north/south at default zoom.
- Two-finger horizontal pan across the board.
- Pinch/modified-wheel zoom in, then perform a fast vertical swipe.
- Pan from T Spawn toward B, then back toward A/CT.
- Reset camera.
- Verify the command bar and selected-unit panel never leave the viewport.

### Narrow Laptop View

- Repeat the mouse sequence at a narrow viewport such as `900x700`.
- Ensure compact HUD does not overlap the command bar, view controls, or action
  panel in a way that blocks clicks.
- Ensure labels fit inside buttons and visible target cards.

## Browser Assertions

Run the automated browser pass with:

```bash
npm run test:browser
```

For each sequence, assert:

- Every required HUD test id has a non-empty bounding box inside the viewport.
- Primary buttons can be clicked by visible label or `data-testid`.
- After zoom/pan/reset, no fresh console errors appear.
- Canvas still receives tile hover/click input after HUD clicks.
- The player can return to a known state with `Reset camera` and `Banana Drill`.
- Banana Drill can queue a watched crossing, run execute, and show the Contact
  Break decision panel without hiding the command bar or trade action.
- Direct movement should not leave the player manually hunting for the next
  actor: after a move completes, selection cycles to the next same-side unit
  with AP; when the active side is spent, control advances to the opposing side.
- The next-action panel should answer "what should I click now?" in the common
  states: setup/meta defaults, selected unit ready, planning, aiming, utility
  targeting, execute resolution, contact break, AI response, and round end.
  Fresh loads must clearly say the side is still in spawn; optional meta should
  only reassign spawn slots by lane intent, not move units down the map.
- Wrong board clicks should not be silent: empty-floor shoot clicks, movement
  clicks without a selected unit, blocked tiles, occupied tiles, and out-of-range
  destinations should show a brief denial reason and play the denied-action cue.
- Duel Lab must open as a readable 1v1, hovered tile/risk information must not
  overlap the selected-unit action deck or command bar, and ordinary direct
  movement must not leave a completed execute debrief panel over the duel.
- The playable cinematic proof at `/cinematic-1v1` must preserve its minimal
  contract: click `Shoot 70%`, click empty floor and receive invalid feedback,
  click the T target and receive shot/kill feedback, then `Reset` returns to a
  standing target. It intentionally has no main HUD root.
- The board-camera proof at `/duel-2-5d` must preserve the same contract in a
  tactical view: click `Move Peek`, click the highlighted peek tile, click
  `Shoot 70%`, click empty floor for invalid feedback, click the T target for
  kill feedback, then reset. It intentionally has no main HUD root.
- The `/duel-2-5d` proof must keep its isometric tile graph measurable: the
  browser regression checks that eight floor tiles exist and that the CT
  gameplay marker visibly moves after clicking a tile.
- The automated pass covers desktop, narrow laptop, and real compact HUD
  viewports, including `540x700`.

### HUD Footprint Budget

Visibility and clickability are not enough. Compact and zoomed states must leave
the tactical board readable instead of turning the HUD into the main surface.

The browser regression should measure the major HUD containers after Banana
Drill contact and, on compact viewports, again under simulated browser zoom.
Use viewport-area budgets as guardrails:

- Selected unit panel: no more than roughly 32% of the compact viewport.
- Command bar: no more than roughly 16% of the compact viewport.
- Active roster: no more than roughly 7% of the compact viewport.
- Combined measured HUD footprint: no more than roughly 50% of the compact
  viewport.
- The center board safe area should stay mostly clear; Contact Break can occupy
  the decision area, but duplicate combat/objective/legend panels should yield
  in dense contact states.

### Visual Quality Contract

Major HUD changes must be checked with screenshots in at least these states:
default desktop, Banana Drill desktop, Banana Contact Break desktop, compact
Banana Drill, compact Contact Break, and compact Contact Break under simulated
browser zoom. Preserve all existing `data-testid` hooks while improving the
visual layer.

The first glance should communicate a tactical cockpit, not stacked debug
cards. Core match commands must visually outrank scenario/lab shortcuts, compact
Contact Break must lead with the decision call even when scrollable, and passive
map labels should stay quiet enough that units, paths, danger, and contact state
own the board.

XCOM-style proportion is the current target: selected-unit status, weapon/ammo,
and actions should sit in a compact lower-edge command deck; objectives,
score/phase, and camera controls should stay small at the edges; the board
center should remain open except for brief targeting/combat feedback.

The HUD layer must never dim the tactical board. Atmosphere belongs to scene
lighting/materials, not a full-screen UI overlay. Any future vignette or
cinematic darkening must be event-scoped and must have a screenshot/readability
gate.

## Immediate Failure Examples

- Zooming or panning makes `End Turn`, `Run Execute`, or action buttons disappear.
- Camera controls are visible but not clickable because another HUD layer covers
  them.
- A button can only be found through DOM automation, not by visible human scan.
- A selected unit panel overlaps command buttons on laptop viewports.
- Compact/browser zoom makes the HUD cover most of the screen even though the
  controls technically remain inside the viewport.
- Trackpad vertical pan stalls at high zoom.
