# Player Visualization Roadmap

## Specialist Memory Contract

A future visual designer agent should start here after reading `CLAUDE.md`,
`AGENTS.md`, and `docs/current-state.md`.

When improving player visuals:

- Preserve team readability before role flair. CT and T should be recognizable
at tactical zoom before labels are read.
- Preserve role readability before decorative detail. AWPer, Entry, IGL,
Support, and Lurker should have distinct silhouettes, weapons, and base marks.
- Keep visual edits scoped. `src/renderer/UnitRenderer.tsx` is high-conflict;
prefer extending `src/renderer/unitVisualIdentity.ts` and small renderer
patches.
- After every visual slice, update this file with the decision, what worked,
what failed, and the next visual target.
- Run `npm run build`, `npm run lint`, and a browser screenshot/human usability
pass after integration.

## Scope

This roadmap began as a renderer audit plus an additive identity artifact. The
current player-visualization slice now makes a small renderer-only polish pass
in `src/renderer/UnitRenderer.tsx`, limited to team headgear and sprite marks.

## Current Visual Vocabulary

`UnitRenderer.tsx` already has a meaningful tactical miniature vocabulary:

- Team color language: CT uses navy armor, white markings, hard helmet shapes,
and blue base accents. T uses olive/gold cloth, red bands, headwrap shapes,
and warmer base accents.
- Role language: AWPer has the longest weapon, scope cues, and a tall read;
Entry is bulkier with wedge/aggression cues; IGL has antenna/tablet command
cues; Support carries utility cylinders and a pack; Lurker is slimmer with a
suppressed weapon and darker stealth gear.
- Board readability: selected/hovered units get rings, brackets, facing arcs,
AP dots, shoot-target rings, hit chance labels, HP bars, and casualty markers.
- HUD references: the roster and selected-unit panel repeat role text and short
tags (`AWP`, `ENT`, `IGL`, `SUP`, `LRK`) and use team-color framing.
- Config references: roles define display names, pro-name stand-ins, mobility,
aim, utility capacity, default weapon IDs, and role abilities. Weapons define
category/range/damage identity, with default loadouts now role-aware.

## Weaknesses

- Identity data is duplicated inside `UnitRenderer.tsx` and `HUD.tsx`, so role
tags, colors, body scale, and silhouette language can drift.
- Role accents are vivid and helpful, but they can overpower team identity at
zoomed-out board scale. The read should be team first, role second.
- Some role cues are decorative instead of diagnostic. At tactical zoom, players
should be able to identify "long gun AWPer", "frontline Entry", "command IGL",
"utility Support", and "quiet Lurker" from silhouette before reading text.
- Floating/base text does useful work, but relying on text alone risks clutter
and weakens screenshot readability.
- Weapon category identity is only partially coupled to role visuals. The AWP is
clear, but rifle/utility/command reads should still stay distinct when loadouts
change later.

## Proposed Identity Contract

Use a three-layer read for every unit:

1. Team first: headgear, chest badge, armband, base shape, and armor color.
2. Role second: silhouette, posture/scale, gear, role accent, and base glyph.
3. State third: selected, hovered, active/spent, shootable, hit/dead, AP, HP.

The additive helper in `src/renderer/unitVisualIdentity.ts` captures that contract
without requiring integration yet.

## Role Direction


| Role    | Primary Read                  | Secondary Read                    | Avoid                                 |
| ------- | ----------------------------- | --------------------------------- | ------------------------------------- |
| AWPer   | Long rifle and scope          | Tall, precise cyan accent         | Making every rifle look like an AWP   |
| Entry   | Forward wedge and broad torso | Red/orange aggression tabs        | Over-bulking into a toy silhouette    |
| IGL     | Command tablet/radio          | Yellow planning badge             | Hiding the antenna behind headgear    |
| Support | Utility belt/canisters        | Green utility pack                | Turning grenades into bright confetti |
| Lurker  | Slim/dark profile             | Suppressor and violet stealth tab | Making the unit too invisible         |


## Next UnitRenderer Patch

The first integration patch has landed: `UnitRenderer.tsx` reads team and role
identity from `src/renderer/unitVisualIdentity.ts`. Remaining safe follow-ups:

1. Continue tuning actual meshes around the contract:
  stronger team-first headgear/chest marks, role silhouettes readable without
   text, and less saturated role accents on inactive units.
2. Keep each slice renderer-only unless identity data needs a small extension.
3. After each visual slice, run `npm run build` and a quick browser screenshot check at
  normal and zoomed-out tactical camera distances.

## Completed Polish Slices

- CT vs T headgear read: CT helmets now have a pale top armor strip and side ear
guards in both the 3D miniature and sprite canvas. T headwraps now get a
darker crown wrap plus a second trailing cloth tab, making the red cloth
silhouette clearer from tactical zoom without adding imported assets.
- Role glyph readability: the existing `baseGlyph` contract now drives small
non-text role marks on both generated unit sprites and 3D vest plates. AWPer
gets a long-gun/scope glyph, Entry a chevron, IGL a command tablet block,
Support utility canisters, and Lurker offset stealth slashes. This keeps
team color/headgear as the first read while making role identity less
dependent on floating text at tactical zoom.
- Weapon-class shot readability: combat events now carry weapon identity, and a
shared shot-presentation profile drives tracer count/width, damage-number
scale, muzzle/recoil strength, combat log weapon chips, contact-break styling,
and procedural audio weight. This makes AWP shots, rifles, SMG bursts, and
pistols feel different without changing tactical math.
- Weapon mesh identity: the actual equipped `unit.weapon.category` now drives a
  `WeaponVisualProfile` for weapon body length, barrel, stock, magazine, scope,
  suppressor, muzzle anchor, and muzzle scale. Role identity still owns body,
  gear, and base glyphs, but the held weapon no longer lies when loadouts change.
- Sprite identity contract: generated canvas sprites now read from
  `SpriteVisualProfile` data in `unitVisualIdentity.ts` for team palette,
  helmet/headwrap marks, armband/chest badge, role glyph placement, role weapon
  layer, and gear-layer intent. This keeps the high-DPI generated sprite path,
  but moves its art direction beside the 3D identity contract.
- Combat beat decay: tracer overlays, muzzle flashes, impact rings, and damage
  labels should use the weapon `markerDurationSeconds` and fade/scale away as a
single action beat. Contact VFX can punch hard, especially on reaction hits or
kills, but it should clear quickly so it does not compete with movement,
threat, or utility overlays.
- Combat audio presentation: procedural audio now uses a small cue/mix profile
  layer with restrained UI/movement buses and stronger combat/reaction/impact
  buses. `AudioFeedback` scans recent event arrays, dedupes by id, and plays
  newly seen combat/feedback events chronologically, which is the first step
  toward multi-beat execute audio without committing authored samples yet.
- Interaction audio vocabulary: non-gun actions now emit explicit feedback
  types for `reload_weapon`, `smoke_bloom`, `flash_pop`, `bomb_pickup`,
  `bomb_plant`, `bomb_tick`, and `bomb_defuse`. The audio layer keeps these on
  the existing utility/movement buses, so they feel authored without introducing
  a sample pipeline or changing combat/bomb math.
- Visual readability smoke: `tests/visual-readability.spec.js` now captures
  Banana Drill and Duel Lab canvas screenshots and asserts nonblank board
  rendering, CT/T color-family pixels, and selected/target action pixels across
  the existing browser viewports. It is a coarse guard, not screenshot matching.
- Unit state hierarchy: `UnitRenderer.tsx` now routes selected, selected-spent,
  hovered, shootable target, out-of-range target, spent, live, and inactive
  units through a local state visual profile. Selected gets the strongest
  ownership ring, shootable targets get red high-priority treatment, out-of-range
  targets are muted, and selected zero-AP units keep a slate `DONE` read instead
  of looking actionable.
- Selected-spent visual guard: the browser visual smoke now forces a Duel Lab
  selected unit to 0 AP and asserts slate/DONE-state pixels plus selected
  ownership pixels so selected-but-unavailable readability does not regress.
- Playable cinematic proof: `/cinematic-1v1` now uses larger 2.5D silhouettes,
  team-colored selection/target frames, world-space action chips, invalid-click
  feedback, shot lane, impact bloom, and collapse state. This is not the final
  tactical renderer, but it establishes the near-term visual contract: actions
  should read in the world first, with HUD kept minimal and secondary.
- Board-camera proof: `/duel-2-5d` applies that same contract to an angled
  tactical map slice. The important visual learning is that units must remain
  larger and more billboarded than pure top-down pieces, while the map plane
  carries recognizable cover and site geometry underneath them.

## Next Presentation Targets

1. Replace latest-event visual assumptions in remaining board markers/casualty
   effects as the execute timeline grows beyond one or two combat beats.
2. Add richer pixel/screenshot checks for casualty, targetable enemy, and
   selected-spent states once scenarios can force those states without direct
   store mutation.
3. Graduate procedural audio into an authored-asset pipeline once the cue
   vocabulary and mix hierarchy stop changing every slice.

## Acceptance Checks

- At zoomed-out board scale, a player can tell T from CT before reading labels.
- At normal tactical zoom, each role reads from silhouette or gear before text.
- HUD short tags match board short tags.
- Selected, hovered, spent, targetable, casualty, bomb, and kit states remain
more visually prominent than decorative role details when they are active.
- No new texture assets are required for this pass.
