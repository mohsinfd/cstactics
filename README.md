# CS2 Tactics

Browser-based tactical prototype for Counter-Strike-style timing, lanes, cover,
utility, trades, and bomb pressure.

## Local Development

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Useful checks:

```powershell
npm run build
npm run lint
npm run map:validate
```

## Unit Sprite Export Pipeline

The current generated SVG locomotion frames are placeholder programmer art. They
prove the runtime animation plumbing only. Production unit frames should follow
`docs/unit-sprite-asset-contract.md`.

To regenerate the placeholder frames:

```powershell
npm run sprites:generate
```

To export authored PNG frames from Blender, use the stub manually. Blender is
not required for normal builds.

```powershell
blender --background art/blender/units/cs2-tactics-unit.blend --python scripts/blender/export-unit-sprite-sheet.py -- --team ct
blender --background art/blender/units/cs2-tactics-unit.blend --python scripts/blender/export-unit-sprite-sheet.py -- --team t
```

The export script writes manifest-compatible files to:

- `public/board2d5/units/exported/ct/`
- `public/board2d5/units/exported/t/`

Switch `UNIT_ANIMATION_SOURCE` in
`src/renderer/locomotion/unitAnimationManifest.ts` from `generated` to
`exported` only after the exported folders contain the full required clip set.
