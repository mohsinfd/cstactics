# CS Tactics Gameplay Manual

This is a quick user-experience manual for testing the current browser build.
It explains what to click, what the interface is telling you, and how to reach
the important gameplay moments quickly.

## Start Here

Open the game at:

```text
http://127.0.0.1:5174/
```

The first screen is the main tactical board. You do not need to know the whole
map to start testing. Use the scenario buttons first:

- `Duel Lab`: fastest way to test move, shoot, utility, ammo, and target UI.
- `Banana Drill`: fastest way to test planned movement into held-angle contact.
- Normal round: use when you want to test turn flow, setup movement, bomb play,
  and the larger map.

## Screen Layout

- Top center: score, round number, phase, active side.
- Small row below the score: active team roster. Click a role card to select
  that unit.
- Bottom command bar: scenario buttons, `Plan Execute`, `Run Execute`, and
  `End Turn`.
- Lower-left unit panel: selected unit details and action buttons.
- Right side: camera controls, plus tile/target information when relevant.

## Camera

- Drag the board to pan.
- Use the `+`, `-`, and `RST` buttons on the right to zoom or reset.
- Mouse wheel zooms on normal wheel steps.
- Trackpad scrolling pans the board.
- If you get lost, click `RST`.

## Selecting Units

Click a unit on the board or click its roster card.

The selected unit panel shows:

- HP and AP.
- weapon and ammo.
- available actions.
- disabled-action reasons when an action is unavailable.

Green AP dots mean the unit still has action points. Dim or empty dots mean it
is spent.

## Moving

1. Select a unit.
2. Click `Move`.
3. Hover the board to preview a path.
4. Click a reachable tile to move.

Movement colors:

- Green tiles: usually a 1 AP move.
- Yellow tiles: usually a 2 AP full-commit move.
- Red/orange danger tint: enemy vision or held-lane risk.
- Path line: the exact route the unit will take.

In setup phase, movement is the main action. Firing and utility are mostly
disabled until combat unless you use a test scenario.

## Shooting

The fastest way to test shooting is `Duel Lab`.

1. Click `Duel Lab`.
2. Select the active unit if needed.
3. Click `Shoot`.
4. Click a target card or a highlighted enemy.

The UI shows hit chance, range, cover, headshot chance, and whether the target
is out of range. Rifle/AWP shots may cost 2 AP; pistols/SMGs can be cheaper.

## Planning An Execute

Use planning when you want orders to resolve together instead of immediately.

1. Click `Plan Execute`.
2. Select a unit.
3. Queue `Move`, `Smoke`, or `Flash` actions.
4. Adjust timing with the small `-` and `+` controls in the execute queue.
5. Click `Run Execute`.

Good first test: click `Banana Drill`, then use `Plan Execute` to move through
the watched Banana lane. The game should stop on contact and show the decision.

## Contact Break

`Contact Break` means movement hit a dangerous moment and the game paused.

Read the panel from top to bottom:

- who was stopped.
- who fired.
- what happened.
- whether a trade shot is available.
- bomb or objective pressure.

If a trade shot button is shown, click it to answer immediately. If not, use the
unit panel or `End Turn` depending on the position.

## Utility

Use `Duel Lab` or combat phase to test utility quickly.

- `Smoke`: blocks line of sight for a few turns.
- `Flash`: weakens affected enemies' aim for a short time.
- In planning mode, smoke and flash resolve before movement by default.

If a utility button is disabled, the selected panel usually explains why:
setup phase, no AP, or no grenades remaining.

## Hold Angle

`Hold` sets a watched lane for the selected unit.

1. Select a unit.
2. Click `Hold`.
3. Hover a tile to preview the watched lane.
4. Click to commit the hold.

Enemy movement through that lane can trigger reaction fire and a Contact Break.

## Bomb Actions

The T entry starts with the bomb in normal rounds.

- `Plant`: available when the bomb carrier is on an A or B plant zone in combat.
- `Defuse`: available to CTs near the planted bomb.
- `Pickup`: available to Ts when the bomb is dropped and a T reaches it.

The objective panel appears when the bomb is planted or dropped.

## Ending Turns

Click `Done` to spend or skip the selected unit.
Click `End Turn` to pass to the other side.

When CT becomes active, the prototype may run a simple CT response automatically.

## Best First Test Runs

### 1. Duel Lab

Use this to test whether the core loop feels readable.

1. Click `Duel Lab`.
2. Move once.
3. Shoot the visible target.
4. Try smoke or flash.
5. Confirm the action panel and target readouts stay understandable.

### 2. Banana Drill

Use this to test the CS/XCOM contact moment.

1. Click `Banana Drill`.
2. Click `Plan Execute`.
3. Queue a move through Banana.
4. Click `Run Execute`.
5. Read the Contact Break panel and take the trade shot if available.

### 3. Normal Round

Use this after the first two tests.

1. Move T units during setup.
2. End turns until combat starts.
3. Use hold angles, utility, and shooting.
4. Try to carry the bomb to a site and plant.

## If Something Feels Wrong

Useful things to report:

- which scenario you started from.
- which unit was selected.
- what action button you clicked.
- what tile or target you clicked.
- whether the issue was visual, input, camera, or rules feedback.

The most important user-experience failures are: unclear selected unit, unclear
move tile, unclear target, camera getting lost, action button hidden, or Contact
Break not explaining the next decision.
