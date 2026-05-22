"""Export authored CS2 Tactics unit sprite frames from Blender.

This script establishes the production asset pipeline. It is intentionally not
part of the normal npm build because Blender may not be installed on every
developer or CI machine.

Example:
  blender --background art/blender/units/cs2-tactics-unit.blend --python scripts/blender/export-unit-sprite-sheet.py -- --team ct
  blender --background art/blender/units/cs2-tactics-unit.blend --python scripts/blender/export-unit-sprite-sheet.py -- --team t

The Blender file should contain actions named like:
  ct_run_forward, ct_strafe_left, t_run_forward, t_dead

Frames are written to:
  public/board2d5/units/exported/ct/
  public/board2d5/units/exported/t/
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


CLIPS = {
    "idle": 1,
    "run_forward": 6,
    "diagonal_left": 4,
    "diagonal_right": 4,
    "strafe_left": 4,
    "strafe_right": 4,
    "backpedal": 4,
    "stop_brace": 3,
    "hit": 2,
    "dead": 1,
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--team", choices=("ct", "t"), required=True)
    parser.add_argument("--out-root", default="public/board2d5/units/exported")
    parser.add_argument("--camera", default="SpriteCamera")
    parser.add_argument("--resolution", type=int, default=512)
    return parser.parse_args(args)


def ensure_camera(name: str) -> bpy.types.Object:
    camera = bpy.data.objects.get(name)
    if camera is None or camera.type != "CAMERA":
        bpy.ops.object.camera_add(location=(4.5, -6.5, 5.2), rotation=(1.047, 0, 0.62))
        camera = bpy.context.object
        camera.name = name
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.8
    bpy.context.scene.camera = camera
    return camera


def configure_render(resolution: int) -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"


def set_action(action_name: str) -> bool:
    action = bpy.data.actions.get(action_name)
    if action is None:
        print(f"[WARN] Missing action {action_name}; rendering current pose.")
        return False

    for obj in bpy.context.scene.objects:
        if obj.animation_data and obj.animation_data.action:
            obj.animation_data.action = action
        elif obj.type == "ARMATURE":
            obj.animation_data_create()
            obj.animation_data.action = action
    return True


def render_clip(team: str, clip: str, frame_count: int, out_dir: Path) -> None:
    action_name = f"{team}_{clip}"
    set_action(action_name)

    scene = bpy.context.scene
    start = int(scene.frame_start)
    end = int(scene.frame_end)
    span = max(1, end - start)

    for index in range(frame_count):
        t = 0 if frame_count == 1 else index / (frame_count - 1)
        scene.frame_set(start + round(span * t))
        scene.render.filepath = str(out_dir / f"{clip}_{index}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[OK] {scene.render.filepath}")


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out_root) / args.team
    out_dir.mkdir(parents=True, exist_ok=True)

    ensure_camera(args.camera)
    configure_render(args.resolution)

    for clip, frame_count in CLIPS.items():
        render_clip(args.team, clip, frame_count, out_dir)


if __name__ == "__main__":
    main()
