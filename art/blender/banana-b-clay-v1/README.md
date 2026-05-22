# Banana B Clay V1

This folder is the source-art home for the Blender-authored `/duel-2-5d`
board layer.

Generate the scene and render layers from the repo root:

```powershell
npm run board2d5:render
```

The render script creates:

- `public/board2d5/scenes/banana-b-clay-v1/base.png`
- `public/board2d5/scenes/banana-b-clay-v1/shadow.png`
- `public/board2d5/scenes/banana-b-clay-v1/foreground.png`
- `art/blender/banana-b-clay-v1/banana-b-clay-v1.blend`
- `src/renderer/board2d5/bananaBClayGeometry.ts`

The existing concept image is used only as the layout target. The rendered
board is built from Blender geometry so gameplay anchors and occlusion can be
kept separate from the board art.

Movement cells are owned by the Blender scene too: the script creates
non-rendered gameplay tile guide meshes, renders matching subtle floor grooves
into the base layer, and exports the exact board-space polygons consumed by the
browser overlay.
