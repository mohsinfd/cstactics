# Unit Sprite Asset Contract

This contract defines production unit animation assets for the current
`AnimatedUnitSpriteBody` runtime. The generated SVGs are placeholder
programmer art only; final frames should be Blender-exported or artist-authored
assets that keep these names and clip counts.

## Format

- Frame size: `256x256` minimum, `512x512` preferred for final exports.
- Background: transparent.
- Camera angle: same board-facing tactical miniature angle as the current unit
  sprites.
- Safe margins: keep the full character, rifle, and death pose inside the frame
  with at least `12%` empty margin at the edges.
- Anchor: unit centered around the same foot/base anchor in every live frame.
- Weapon: visible and readable in every non-dead frame.
- Team palettes:
  - CT: blue/steel/white.
  - T: red/rust/warm cloth.
- No text or role labels inside the sprite.
- Shadow: handled by the renderer. Do not bake a heavy shadow into the sprite
  unless a separate shadow layer is exported deliberately.

## Required Clips Per Team

Each team must provide this exact file set:

- `idle`: 1 frame.
- `run_forward`: 6 frames.
- `diagonal_left`: 4 frames.
- `diagonal_right`: 4 frames.
- `strafe_left`: 4 frames.
- `strafe_right`: 4 frames.
- `backpedal`: 4 frames.
- `stop_brace`: 3 frames.
- `hit`: 2 frames.
- `dead`: 1 frame.

Expected output folders:

- `public/board2d5/units/exported/ct/`
- `public/board2d5/units/exported/t/`

Expected names must match the generated placeholder names, for example:

- `run_forward_0.png`
- `run_forward_1.png`
- `strafe_left_0.png`
- `stop_brace_2.png`
- `dead_0.png`

## Quality Bar

- Run frames must show alternating foot plants, not just body bob.
- Strafe frames must show lateral weight shift while the weapon remains
  tactically readable.
- Backpedal frames must show the body retreating while the weapon stays forward.
- `stop_brace` must show deceleration, foot plant, and weapon brace before
  idle.
- `hit` must read as impact without hiding team identity.
- `dead` must read immediately from the top/isometric tactical view.
- CT and T must be readable without labels at default tactical zoom.

## Runtime Contract

`src/renderer/locomotion/unitAnimationManifest.ts` is the switchboard. Keep its
pose names and clip counts stable so generated placeholders, Blender exports,
and artist-authored sheets can be swapped without touching AP, pathfinding,
LOS, cover, combat, utility, bomb, or round resolution code.
