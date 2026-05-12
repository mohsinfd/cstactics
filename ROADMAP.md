# CS2 Tactics Roadmap

## Product North Star

CS2 Tactics should feel like Counter-Strike slowed down into readable tactical
decisions: recognizable maps, meaningful timing, readable crossfires, tense bomb
pressure, synchronized utility, trades, and clean turn-based command decisions.
The game can look indie, but it should never feel rough, vague, or toy-like.

The first five seconds matter. A CS player should look at the board and say:
"That is Inferno." If the map silhouette, routes, timings, and site geometry do
not land, every other feature sits on weak ground.

## Product Pillars

1. **Map Recognition**
   Inferno must read immediately from a single camera view: T spawn, Banana, B
   site, Mid, Apartments, A site, Arch, Library, CT, and rotations should form a
   familiar mental model.

2. **Tactical Readability**
   Every tile, wall, cover object, bombsite, unit, and threat state should be
   understandable without tooltips. The player should spend their brain on
   tactics, not decoding the UI.

3. **Counter-Strike Pressure**
   Rounds should be driven by timing, trades, bomb threat, utility denial,
   economy pressure, and role identity. It should not become generic XCOM with
   CS names.

4. **Synchronized Execution**
   The best CS moments happen when three or four things collide in two seconds:
   a flash pops, an entry swings, a smoke blooms, a CT holds an angle, and a
   trade arrives. The long-term game loop should let players plan those beats,
   then resolve them together in short frozen-time chunks.

5. **Polished Indie Execution**
   Modest assets are acceptable. Sloppy interaction is not. Movement previews,
   shooting feedback, turn transitions, camera framing, and HUD hierarchy should
   feel deliberate.

6. **Data-Driven Production**
   Maps, weapons, roles, economy, and abilities should live as data plus tested
   systems. Professional quality comes from repeatable pipelines, not one-off
   hand edits.

## Target Round Loop

Long term, the game should not be strictly "one player moves, then the next."
That is useful for prototyping, but it misses CS timing. The intended structure:

1. **Free Positioning / Map Control**
   Players move into early-round shape until contact, noise, utility, or a
   watched lane creates tactical commitment.

2. **Freeze / Planning Window**
   Time slows. The player assigns multiple orders: swing, hold, smoke, flash,
   rotate, plant, defuse, reload, or save.

3. **Synchronized Resolution**
   Queued orders resolve over a short timeline. Utility pops, units move, hold
   angles trigger, trades occur, and the board lands in a new tactical state.

4. **Re-Freeze On New Information**
   Contact, damage, a kill, bomb state, or utility expiry pauses the action
   again so the player can make the next high-quality CS decision.

5. **Endgame Pressure**
   Plant/defuse timers, ammo, HP, utility, and known/unknown positions decide
   whether the right call is execute, retake, save, or hunt.

## Simultaneous Execute Roadmap

Goal: make the game feel like a slowed-down CS execute/retake rather than a
generic squad tactics turn.

The first proof point is not broad combat. It is angle ownership: a player
should be able to hold a lane, preview the danger of crossing it, commit the
move, trigger contact, and freeze into a trade decision. See
`docs/first-contact-vertical-slice.md` for the immediate build spec.

### Milestone A: Planned Orders Foundation

- Planning mode that queues moves instead of executing immediately.
- Planned path and destination previews for several active units at once.
- Commit button that resolves queued moves together.
- Basic conflict handling for occupied/duplicate destinations.
- Clear/cancel planned orders.

### Milestone B: Hold Angles and Contact

- Hold Angle order as CS-flavored overwatch. Implemented.
- Watched-lane overlay from held angles. Implemented.
- Hold-angle hover preview before committing a lane. Implemented.
- Movement through a watched lane can trigger reaction fire. Implemented for
  queued movement.
- Freeze when first contact happens. Implemented as an immediate contact break.
- Basic hit chance and damage resolver for reaction fire. Implemented.
- Contact banner/interrupt state after first visible threat or damage.
  Implemented.
- Destination exposure readout and board-level hit/miss marker. Implemented.
- Threat tint for movement tiles visible to known enemies. Implemented.
- Queued move `WATCH`/`DANGER` planning warnings. Implemented.
- Shoot-mode line-of-fire overlay. Implemented.
- Automatic shoot-mode trade prompt after contact break. Implemented.
- First-pass ticked movement/contact resolution. Implemented.
- Landmark cover silhouettes and destination risk card. Implemented.
- Protected/flanked/exposed shot and movement warnings. Implemented as a
  first-pass directional cover readout.
- Procedural shot/contact audio cues. Implemented.
- Next: tighten cover-corner fidelity, add richer shot VFX, then build true
  simultaneous order timing.

### Milestone C: Utility Timing

- Smoke, flash, molly, and HE as planned orders.
- Timeline offsets: flash pops before entry swing, smoke blooms before cross,
  molly denies retake path.
- Utility preview volumes on the map.

### Milestone D: Resolution Timeline

- Resolve planned orders in small ticks instead of instant teleports. First pass
  implemented for movement/contact.
- Interrupt resolution on contact, death, bomb event, or major utility effect.
  First pass implemented for held-angle contact.
- Show a compact execute timeline: `0.0 smoke`, `0.5 flash`, `0.7 entry swing`.

### Milestone E: CS Match Loop

- Buy phase, economy, weapons, armor, kit, utility loadout.
- Bomb plant/defuse/save/hunt pressure.
- Round-to-round strategic consequences.

## Priority Rules

- Build contact before economy, AI, or role progression.
- Build Hold Angle before full utility depth, because angle ownership is the
  bridge between CS and XCOM.
- Build decision preview before complex resolution. The player must understand
  the risk before the action commits.
- Use scripted scenarios before broad AI. A good Banana hold/crossing slice is
  more valuable than weak full-map bot behavior.
- Keep new combat logic rendering-independent.

## Phase 0: Stabilize the Prototype

Goal: make the project easy to run, inspect, and iterate.

Acceptance:
- `npm run build` passes.
- `npm run lint` passes.
- Local dev server starts reliably.
- README explains what the game is, how to run it, and current status.
- Map validation script reports connectivity and route timings.
- Debug map view or exported image makes the silhouette inspectable.

## Phase 1: Inferno Recognition Sprint

Goal: rebuild the map until it is recognizable before adding more systems.

Work:
- Source a clean top-down Inferno reference workflow without committing
  copyrighted source imagery to the repo.
- Generate or trace a tile grid from a radar/reference image.
- Replace rectangle-only zones with a higher-fidelity silhouette.
- Add callout anchors for Banana, B, Mid, Second Mid, Apps, A, Arch, Library,
  Construction, CT, and T spawn.
- Validate route timings from T and CT spawns to both sites.
- Tune camera orientation so the first viewport presents Inferno clearly.
- Add a lightweight visual regression artifact for the map silhouette.

Acceptance:
- A CS player can identify Inferno from the first screen.
- T to A, T to B, CT to A, and CT to B timings are plausible relative to each
  other.
- Banana is curved and narrow, not a straight rectangular hallway.
- A site has pit, short, balcony/apps pressure, and library/moto access.
- B site has Banana choke, coffins/CT, construction, and site cover.

## Phase 2: Combat Vertical Slice

Goal: make one round playable and emotionally legible.

Work:
- Line of sight through walls and cover.
- Shoot action with aim preview before commit.
- Damage, headshot/crit, death, and kill feed.
- Cover penalties and range penalties.
- Basic VFX: tracer, hit marker, damage number, death fade.
- Combat action panel for selected units.

Acceptance:
- Players can move, take contact, shoot, kill, and trade.
- The UI explains hit chance before firing.
- A dead unit is impossible to act with and clearly removed from the tactical
  state.

## Phase 3: Round Rules and Bomb

Goal: make the core CS round loop real.

Work:
- Elimination win condition.
- Round timer and timeout win condition.
- Bomb carrier, plant, dropped bomb, pickup, defuse, detonation.
- Post-plant phase and bomb timer pressure.
- Round reset.

Acceptance:
- A full round can end by elimination, time, plant/defuse, or detonation.
- Bomb state is visible at all times.
- T and CT decisions feel asymmetrical.

## Phase 4: Economy and Buy Phase

Goal: turn isolated rounds into a match.

Work:
- Multi-round match state.
- Per-player money, loss bonus, kill rewards, bomb plant bonus.
- Buy phase UI for pistols, rifles, SMGs, AWP, armor/kit/utility later.
- Save/force/full-buy tradeoffs.

Acceptance:
- Losing and winning changes future choices.
- Buying is fast, legible, and skippable for quick testing.

## Phase 5: Utility and Role Identity

Goal: make CS tactics deeper than raw aim.

Work:
- Smoke, flash, molotov/incendiary, HE.
- Role abilities: FlickShot, SprayTransfer, ExecuteCall, PopFlash, GhostRotate.
- Clear ability previews and cooldown/cost language.

Acceptance:
- Utility changes movement and sight decisions.
- Roles create different tactical jobs without breaking CS logic.

## Phase 6: Presentation Polish

Goal: move from prototype to polished indie.

Work:
- Better map materials and landmark props. Landmark prop silhouettes are started.
- Camera presets and smoother pan/zoom limits.
- Sound design for shots, plants, defuses, UI, and phase changes.
- Better unit silhouettes and animations.
- Onboarding overlay for first-time players.
- Settings for performance and accessibility.

Acceptance:
- The game looks intentional in screenshots.
- Common actions have satisfying audio/visual feedback.
- Text and controls remain readable on laptop and desktop screens.

## Phase 7: Multiplayer Foundation

Goal: support real two-player matches.

Work:
- Authoritative game engine shared by client/server.
- Rooms and side assignment.
- Turn/action synchronization.
- Reconnect handling.
- Match history/debug logs.

Acceptance:
- Two browser tabs can complete a match without desync.
- Invalid actions are rejected by the authoritative state.

## Operating Rules

- Do not add major gameplay systems until Inferno recognition is fixed.
- Every feature needs a visible debug path while the game is in prototype.
- Keep game logic rendering-independent.
- Prefer small, testable systems over large opaque rewrites.
- Optimize for a professional vertical slice before expanding content.
