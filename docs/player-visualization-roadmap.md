# Player Visualization Roadmap

## Scope

This pass is a read-only renderer audit plus an additive identity artifact. It
does not edit `src/renderer/UnitRenderer.tsx`, because movement smoothing work
may be touching that file at the same time.

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

| Role | Primary Read | Secondary Read | Avoid |
| --- | --- | --- | --- |
| AWPer | Long rifle and scope | Tall, precise cyan accent | Making every rifle look like an AWP |
| Entry | Forward wedge and broad torso | Red/orange aggression tabs | Over-bulking into a toy silhouette |
| IGL | Command tablet/radio | Yellow planning badge | Hiding the antenna behind headgear |
| Support | Utility belt/canisters | Green utility pack | Turning grenades into bright confetti |
| Lurker | Slim/dark profile | Suppressor and violet stealth tab | Making the unit too invisible |

## Next UnitRenderer Patch

The orchestrator can integrate this safely with a small renderer-only patch:

1. Import `getRoleVisualIdentity`, `getTeamVisualIdentity`, and
   `ROLE_VISUAL_IDENTITIES` from `src/renderer/unitVisualIdentity.ts`.
2. Replace local `CT_PALETTE`, `T_PALETTE`, `ROLE_TAGS`, and `ROLE_CONFIG` reads
   with adapter objects from the helper. Keep geometry and animation unchanged
   for the first wiring patch.
3. Keep `UnitRenderer.tsx` behavior visually equivalent on the first commit:
   same colors, same role tags, same body scales, same weapon lengths.
4. In a follow-up polish patch, tune the actual meshes around the contract:
   stronger team-first headgear/chest marks, role silhouettes readable without
   text, and less saturated role accents on inactive units.
5. After integration, run `npm run build` and a quick browser screenshot check at
   normal and zoomed-out tactical camera distances.

## Acceptance Checks

- At zoomed-out board scale, a player can tell T from CT before reading labels.
- At normal tactical zoom, each role reads from silhouette or gear before text.
- HUD short tags match board short tags.
- Selected, hovered, spent, targetable, casualty, bomb, and kit states remain
  more visually prominent than decorative role details when they are active.
- No new texture assets are required for this pass.
