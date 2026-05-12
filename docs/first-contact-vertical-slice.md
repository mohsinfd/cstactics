# First Contact Vertical Slice

## Goal

Make one Inferno Banana interaction feel tactical and CS-authentic:

> A CT holds Banana. A T plans a crossing. The preview shows danger. The player
> commits. Contact happens, a reaction shot resolves, and the game freezes.

This slice is more important than adding many disconnected systems because it
proves the central promise: CS timing and angle ownership translated into
previewable tactical decisions.

## Why This Comes Next

Movement answers only "can I go there?" A tactical CS/XCOM game must answer:

- Who can see me there?
- Who can shoot me there?
- Am I crossing a held angle?
- What cover protects me from that shooter?
- What shot/trade is available after contact?

Until those questions exist in the UI and resolver, the game remains a movement
demo rather than a contact-based tactics game.

## Build Order

1. **LOS Foundation**
   - Add `hasLineOfSight(map, from, to)`.
   - Add `getVisibleEnemies(state, unitId)`.
   - Keep it tile/grid based first; refine later for cover corners and height.

2. **Hold Angle Action**
   - Selected unit can enter Hold Angle mode.
   - Player chooses a target direction/tile.
   - Store a watched lane with `unitId`, `origin`, `target`, `laneTiles`, and
     shot count/aim modifier.
   - Render watched lane as red transparent tiles.

3. **Danger Preview**
   - Movement hover warns when a destination/path crosses a watched lane.
   - Tile info includes `Watched by: <unit/role/callout>`.
   - Planned move previews should show risk before `Run Execute`.

4. **Reaction Shot Resolver**
   - During planned movement resolution, if a unit enters an enemy watched lane,
     pause movement and resolve reaction fire.
   - Use a simple first hit chance formula from role aim, weapon aim, range, and
     cover penalty.
   - Apply damage and death state.

5. **Freeze On Contact**
   - After reaction fire, stop remaining movement.
   - Clear/mark the consumed held angle.
   - Surface a contact banner and let the player decide the next action.

## Explicitly Defer

- Full AI.
- Full utility kit.
- Economy/buy phase.
- Role progression.
- Ammo/reload depth.
- Cinematic 2.5D animations.
- Full simultaneous timeline with offsets.

These are important, but they should stack on top of the first contact loop.

## Acceptance

- A player can make a CT hold Top Banana or B approach. Implemented.
- A T move through the watched lane shows risk before commit. Implemented for
  hover and queued movement.
- Running the queued move can trigger reaction fire. Implemented.
- Hit chance and damage are visible enough to understand the result. Implemented
  through target rings, target list, board marker, and contact log.
- Shot previews and contact logs show range and directional cover modifiers,
  including protected, flanked, and exposed states. Implemented.
- Direct/reaction shots have procedural audio cues. Implemented.
- The game pauses after contact instead of blindly continuing. Implemented as a
  contact break with immediate movement stop and automatic shoot-mode trade
  prompt.
- Planned movement now resolves in short visible ticks before the contact break.
  This is still a first-pass execution timeline, not a full simultaneous CS
  execute system.

## Remaining Polish

- Add deeper per-modifier shot breakdowns: held-angle bonus, movement penalty,
  recoil/ammo, and final clamped/unclamped aim.
- Harden directional cover further: diagonal corners and tighter cover-corner
  fidelity.
- Add richer shot VFX and damage numbers so contact reads without scanning the
  HUD.
- Make board-level combat markers animated and temporary instead of persistent
  until the next event.
- Build true simultaneous multi-order resolution with timing offsets for
  flashes, entries, trades, and utility.
