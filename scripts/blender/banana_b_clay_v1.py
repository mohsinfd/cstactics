"""Generate the Banana/B clay diorama board package renders.

Run from the repo root with Blender:

blender --background --python scripts/blender/banana_b_clay_v1.py

The script builds real Blender geometry against the same percentage coordinate
space used by the browser board package. The existing concept image is not
used as a texture; it is only the layout target.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_OUT = REPO_ROOT / "public" / "board2d5" / "scenes" / "banana-b-clay-v1"
BLEND_OUT = REPO_ROOT / "art" / "blender" / "banana-b-clay-v1"

WIDTH = 998
HEIGHT = 768
ASPECT = WIDTH / HEIGHT
ORTHO_SCALE = 12.4

CAMERA_LOCATION = Vector((7.8, -8.7, 7.1))
CAMERA_TARGET = Vector((0.2, 0.0, 0.0))


def ensure_dirs() -> None:
    PUBLIC_OUT.mkdir(parents=True, exist_ok=True)
    BLEND_OUT.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.collections,
    ):
        for item in list(block):
            if not item.users:
                block.remove(item)


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def make_mat(name: str, color: tuple[float, float, float, float], roughness: float = 0.84) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    mat.blend_method = "BLEND" if color[3] < 1 else "OPAQUE"
    mat.use_screen_refraction = False
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = color[3]
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
    return mat


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_camera() -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("banana-b-clay-camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE
    camera = bpy.data.objects.new("banana-b-clay-camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = CAMERA_LOCATION
    look_at(camera, CAMERA_TARGET)
    bpy.context.scene.camera = camera
    bpy.context.view_layer.update()
    return camera


def setup_render(camera: bpy.types.Object) -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.film_transparent = True
    scene.camera = camera
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 96
        scene.cycles.use_denoising = True
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 96
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "gtao_distance"):
            scene.eevee.gtao_distance = 3
        if hasattr(scene.eevee, "gtao_factor"):
            scene.eevee.gtao_factor = 1.2
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


def setup_lights() -> None:
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.035, 0.04, 0.045)

    sun_data = bpy.data.lights.new("soft tactical sun", "SUN")
    sun_data.energy = 2.0
    sun = bpy.data.objects.new("soft tactical sun", sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(42), math.radians(0), math.radians(-36))

    area_data = bpy.data.lights.new("large studio bounce", "AREA")
    area_data.energy = 440
    area_data.size = 6.5
    area = bpy.data.objects.new("large studio bounce", area_data)
    bpy.context.scene.collection.objects.link(area)
    area.location = (-3.6, -4.8, 7.2)
    look_at(area, Vector((0, 0, 0)))

    fill_data = bpy.data.lights.new("cool fill", "AREA")
    fill_data.energy = 80
    fill_data.size = 8
    fill = bpy.data.objects.new("cool fill", fill_data)
    bpy.context.scene.collection.objects.link(fill)
    fill.location = (4.8, 3.5, 5.2)
    look_at(fill, Vector((0, 0, 0)))


def camera_basis(camera: bpy.types.Object) -> tuple[Vector, Vector, Vector]:
    quat = camera.matrix_world.to_quaternion()
    right = quat @ Vector((1, 0, 0))
    up = quat @ Vector((0, 1, 0))
    forward = quat @ Vector((0, 0, -1))
    return right, up, forward


def screen_to_ground(camera: bpy.types.Object, x_pct: float, y_pct: float, z: float = 0) -> Vector:
    right, up, forward = camera_basis(camera)
    view_h = camera.data.ortho_scale
    view_w = view_h * ASPECT
    origin = camera.location.copy()
    origin += right * ((x_pct / 100.0 - 0.5) * view_w)
    origin += up * ((0.5 - y_pct / 100.0) * view_h)
    if abs(forward.z) < 0.0001:
        raise RuntimeError("Camera forward vector cannot hit ground plane")
    t = (z - origin.z) / forward.z
    return origin + forward * t


def screen_vector(camera: bpy.types.Object, anchor: tuple[float, float], length_pct: float, angle_deg: float) -> Vector:
    angle = math.radians(angle_deg)
    start = screen_to_ground(camera, anchor[0], anchor[1])
    end = screen_to_ground(
        camera,
        anchor[0] + math.cos(angle) * length_pct,
        anchor[1] + math.sin(angle) * length_pct,
    )
    return end - start


def add_bevel(obj: bpy.types.Object, amount: float, segments: int = 1) -> None:
    bevel = obj.modifiers.new("soft clay bevel", "BEVEL")
    bevel.width = amount
    bevel.segments = segments
    bevel.affect = "EDGES"
    weighted = obj.modifiers.new("weighted clay normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True


def add_box(
    camera: bpy.types.Object,
    collection: bpy.types.Collection,
    name: str,
    anchor: tuple[float, float],
    size: tuple[float, float],
    height: float,
    material: bpy.types.Material,
    rotation: float = -25,
    z_base: float = 0,
    bevel: float = 0.035,
) -> bpy.types.Object:
    center = screen_to_ground(camera, anchor[0], anchor[1])
    width_vec = screen_vector(camera, anchor, size[0], rotation)
    depth_vec = screen_vector(camera, anchor, size[1], rotation + 90)
    width = Vector((width_vec.x, width_vec.y, 0)).length
    depth = Vector((depth_vec.x, depth_vec.y, 0)).length
    angle = math.atan2(width_vec.y, width_vec.x)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(center.x, center.y, z_base + height * 0.5))
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler[2] = angle
    obj.dimensions = (width, depth, height)
    obj.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        add_bevel(obj, bevel)
    link_to_collection(obj, collection)
    return obj


def duplicate_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection, name: str) -> bpy.types.Object:
    clone = obj.copy()
    clone.data = obj.data.copy()
    clone.name = name
    collection.objects.link(clone)
    return clone


def add_text(
    camera: bpy.types.Object,
    collection: bpy.types.Collection,
    name: str,
    text: str,
    anchor: tuple[float, float],
    material: bpy.types.Material,
    size: float,
    rotation: float = -25,
    z_base: float = 0.2,
) -> bpy.types.Object:
    loc = screen_to_ground(camera, anchor[0], anchor[1])
    bpy.ops.object.text_add(location=(loc.x, loc.y, z_base), rotation=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.rotation_euler[2] = math.atan2(
        screen_vector(camera, anchor, 4, rotation).y,
        screen_vector(camera, anchor, 4, rotation).x,
    )
    obj.data.materials.append(material)
    link_to_collection(obj, collection)
    return obj


def add_barrel(
    camera: bpy.types.Object,
    collection: bpy.types.Collection,
    name: str,
    anchor: tuple[float, float],
    radius: float,
    height: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    loc = screen_to_ground(camera, anchor[0], anchor[1])
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=height, location=(loc.x, loc.y, height / 2))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    add_bevel(obj, 0.015)
    link_to_collection(obj, collection)
    return obj


def add_log(
    camera: bpy.types.Object,
    collection: bpy.types.Collection,
    name: str,
    anchor: tuple[float, float],
    angle: float,
    radius: float,
    length_pct: float,
    z: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    loc = screen_to_ground(camera, anchor[0], anchor[1])
    direction = screen_vector(camera, anchor, length_pct, angle)
    direction.z = 0
    length = direction.length
    quat = direction.normalized().to_track_quat("Z", "Y")
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=18,
        radius=radius,
        depth=length,
        location=(loc.x, loc.y, z),
        rotation=quat.to_euler(),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    add_bevel(obj, 0.008)
    link_to_collection(obj, collection)
    return obj


def add_shadow_plane(
    camera: bpy.types.Object,
    collection: bpy.types.Collection,
    name: str,
    anchor: tuple[float, float],
    size: tuple[float, float],
    material: bpy.types.Material,
    rotation: float = -25,
) -> bpy.types.Object:
    return add_box(camera, collection, name, anchor, size, 0.012, material, rotation, 0.012, bevel=0)


def add_arch(camera: bpy.types.Object, collection: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    add_box(camera, collection, "arch left pier", (24.4, 42.8), (3.2, 8.5), 1.25, mats["wall"], -25, bevel=0.05)
    add_box(camera, collection, "arch right pier", (32.4, 39.8), (3.0, 8.0), 1.25, mats["wall"], -25, bevel=0.05)
    add_box(camera, collection, "arch lintel", (28.4, 38.4), (11.5, 2.6), 1.8, mats["wall"], -25, z_base=1.08, bevel=0.045)
    add_box(camera, collection, "arch back step", (28.4, 44.9), (10.5, 4.8), 0.22, mats["floor_dark"], -25, bevel=0.025)


def add_roof_ribs(camera: bpy.types.Object, collection: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    add_box(camera, collection, "left roof slab", (23.8, 28.4), (23.5, 10.2), 0.32, mats["roof"], -25, z_base=1.48, bevel=0.035)
    for index in range(7):
        add_box(
            camera,
            collection,
            f"left roof rib {index + 1}",
            (15.4 + index * 2.8, 28.1 - index * 0.15),
            (0.45, 10.1),
            0.08,
            mats["roof_rib"],
            -25,
            z_base=1.8,
            bevel=0.015,
        )


def add_stairs(camera: bpy.types.Object, collection: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    for index in range(5):
        add_box(
            camera,
            collection,
            f"banana stair {index + 1}",
            (44.8 + index * 1.7, 55.6 - index * 1.0),
            (12.6, 1.25),
            0.10 + index * 0.035,
            mats["step"],
            -25,
            z_base=0.08 + index * 0.035,
            bevel=0.012,
        )


def add_log_stack(camera: bpy.types.Object, collection: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    positions = [
        (38.0, 58.8, 0.19),
        (40.0, 57.9, 0.19),
        (42.0, 57.0, 0.19),
        (39.0, 56.6, 0.35),
        (41.0, 55.7, 0.35),
        (40.0, 54.5, 0.51),
    ]
    for index, (x, y, z) in enumerate(positions):
        add_log(camera, collection, f"stacked log {index + 1}", (x, y), -25, 0.085, 5.2, z, mats["wood"])


def build_scene(camera: bpy.types.Object) -> dict[str, bpy.types.Collection]:
    collections = {
        "base": make_collection("render_base_geometry"),
        "foreground": make_collection("render_foreground_lips"),
        "shadow": make_collection("render_shadow_overlay"),
    }

    mats = {
        "base": make_mat("matte base clay", (0.54, 0.54, 0.50, 1)),
        "floor": make_mat("warm stone floor", (0.68, 0.65, 0.58, 1)),
        "floor_dark": make_mat("recessed stone floor", (0.52, 0.50, 0.45, 1)),
        "floor_line": make_mat("etched stone seams", (0.36, 0.35, 0.32, 0.42)),
        "site": make_mat("muted b site clay", (0.62, 0.47, 0.38, 1)),
        "site_line": make_mat("faded site marking", (0.42, 0.20, 0.16, 0.92)),
        "wall": make_mat("off white wall clay", (0.80, 0.78, 0.71, 1)),
        "wall_cap": make_mat("pale stone caps", (0.92, 0.90, 0.84, 1)),
        "step": make_mat("step edge clay", (0.70, 0.68, 0.61, 1)),
        "cover": make_mat("box cover clay", (0.55, 0.49, 0.39, 1)),
        "wood": make_mat("desaturated wood clay", (0.48, 0.39, 0.29, 1)),
        "barrel": make_mat("barrel clay", (0.48, 0.42, 0.35, 1)),
        "roof": make_mat("chalk roof mass", (0.73, 0.70, 0.63, 1)),
        "roof_rib": make_mat("subtle roof ribs", (0.64, 0.61, 0.55, 1)),
        "foliage": make_mat("muted planter green", (0.34, 0.42, 0.28, 1)),
        "shadow": make_mat("transparent contact shadow", (0.02, 0.025, 0.03, 0.35)),
        "foreground": make_mat("foreground clay lip", (0.74, 0.73, 0.68, 1)),
    }

    base = collections["base"]
    shadow = collections["shadow"]
    foreground = collections["foreground"]

    # Ground plinth and playable surfaces.
    add_box(camera, base, "floating tactical plinth", (50.0, 55.2), (82.0, 73.0), 0.22, mats["base"], -25, z_base=-0.22, bevel=0.075)
    add_box(camera, base, "banana approach floor", (34.4, 61.2), (42.0, 15.4), 0.12, mats["floor"], -25, bevel=0.022)
    add_box(camera, base, "lower banana shoulder", (24.2, 73.5), (24.5, 14.2), 0.12, mats["floor_dark"], -25, bevel=0.022)
    add_box(camera, base, "b site floor", (63.5, 43.6), (37.2, 28.5), 0.13, mats["floor"], -25, bevel=0.022)
    add_box(camera, base, "back site platform", (72.6, 34.2), (25.0, 15.5), 0.18, mats["floor_dark"], -25, z_base=0.04, bevel=0.024)
    add_box(camera, base, "b site red wash", (61.2, 48.4), (24.0, 17.4), 0.015, mats["site"], -25, z_base=0.14, bevel=0.006)
    add_text(camera, base, "b site letter", "B", (62.2, 45.2), mats["site_line"], 0.82)

    for index, x in enumerate([49.2, 53.8, 58.4, 63.0, 67.6, 72.2]):
        add_box(camera, base, f"site vertical floor seam {index + 1}", (x, 45.4), (0.16, 25.2), 0.012, mats["floor_line"], -25, z_base=0.156, bevel=0)
    for index, y in enumerate([34.8, 39.2, 43.6, 48.0, 52.4]):
        add_box(camera, base, f"site horizontal floor seam {index + 1}", (61.0, y), (35.5, 0.16), 0.012, mats["floor_line"], -25, z_base=0.157, bevel=0)
    for index, y in enumerate([56.0, 59.8, 63.6, 67.4]):
        add_box(camera, base, f"banana lane stone seam {index + 1}", (34.0, y), (38.0, 0.15), 0.012, mats["floor_line"], -25, z_base=0.148, bevel=0)

    # Walls and architectural massing.
    add_box(camera, base, "top perimeter wall", (51.7, 24.4), (56.0, 4.6), 1.15, mats["wall"], -25, bevel=0.045)
    add_box(camera, base, "top perimeter cap", (51.7, 24.1), (58.0, 5.2), 0.18, mats["wall_cap"], -25, z_base=1.15, bevel=0.035)
    add_box(camera, base, "right orange wall clay", (81.3, 31.7), (25.5, 5.0), 1.55, mats["wall"], -25, bevel=0.045)
    add_box(camera, base, "right wall cap", (81.3, 31.2), (26.8, 5.4), 0.18, mats["wall_cap"], -25, z_base=1.55, bevel=0.035)
    add_box(camera, base, "front lower wall", (50.4, 78.7), (61.0, 4.8), 0.95, mats["wall"], -25, bevel=0.045)
    add_box(camera, base, "front lower wall cap", (50.4, 78.5), (62.0, 5.2), 0.16, mats["wall_cap"], -25, z_base=0.95, bevel=0.03)
    add_box(camera, base, "left banana lane wall", (20.8, 61.8), (35.0, 4.2), 0.76, mats["wall"], -25, bevel=0.04)
    add_box(camera, base, "central banana divider", (43.4, 50.4), (18.5, 3.7), 0.58, mats["wall"], -25, bevel=0.035)
    add_box(camera, base, "site divider wall", (59.9, 38.8), (10.2, 4.0), 0.92, mats["wall"], -25, bevel=0.04)
    add_box(camera, base, "coffins back wall", (76.4, 36.9), (16.0, 4.1), 0.92, mats["wall"], -25, bevel=0.04)
    add_arch(camera, base, mats)
    add_roof_ribs(camera, base, mats)
    add_stairs(camera, base, mats)

    # Cover clusters and props matching the current reference composition.
    add_log_stack(camera, base, mats)
    add_box(camera, base, "center crate", (52.4, 50.2), (6.0, 5.0), 0.64, mats["cover"], -25, bevel=0.035)
    add_box(camera, base, "site tall crate", (68.9, 39.3), (8.6, 6.2), 1.05, mats["cover"], -25, bevel=0.04)
    add_box(camera, base, "coffins crate", (76.7, 35.5), (8.8, 5.2), 0.78, mats["cover"], -25, bevel=0.035)
    add_box(camera, base, "right small crates", (85.1, 43.7), (6.7, 8.4), 0.68, mats["cover"], -25, bevel=0.035)
    add_box(camera, base, "lower right cart block", (82.6, 74.4), (8.4, 6.8), 0.38, mats["cover"], -25, bevel=0.035)
    for index, point in enumerate([(16.8, 49.5), (20.0, 48.2), (84.1, 78.2), (80.0, 73.2), (35.6, 28.1)]):
        add_barrel(camera, base, f"barrel cluster {index + 1}", point, 0.14, 0.44, mats["barrel"])
    for index, point in enumerate([(17.4, 74.8), (63.0, 75.2), (84.3, 58.2), (31.2, 43.4)]):
        add_box(camera, base, f"planter base {index + 1}", point, (5.0, 2.6), 0.24, mats["cover"], -25, bevel=0.025)
        add_box(camera, base, f"planter foliage {index + 1}", (point[0], point[1] - 0.4), (4.5, 2.0), 0.15, mats["foliage"], -25, z_base=0.24, bevel=0.03)

    # Purpose-built transparent shadow layer.
    add_shadow_plane(camera, shadow, "site broad shadow wash", (61.5, 43.5), (42.0, 33.0), mats["shadow"], -25)
    add_shadow_plane(camera, shadow, "banana lane contact shadow", (36.4, 61.2), (45.0, 16.0), mats["shadow"], -25)
    add_shadow_plane(camera, shadow, "front wall cast shadow", (50.0, 75.0), (58.0, 7.5), mats["shadow"], -25)

    # Foreground occluders are rendered as image layers above runtime actors.
    fg_logs = add_box(camera, base, "logs front lip base", (39.9, 58.2), (14.2, 2.4), 0.27, mats["wood"], -25, z_base=0.45, bevel=0.02)
    duplicate_to_collection(fg_logs, foreground, "logs front lip foreground")
    fg_wall = add_box(camera, base, "front wall lip base", (51.4, 76.4), (24.0, 2.8), 0.30, mats["foreground"], -25, z_base=0.74, bevel=0.025)
    duplicate_to_collection(fg_wall, foreground, "front wall lip foreground")
    fg_target = add_box(camera, base, "target cover lip base", (73.6, 38.4), (12.4, 2.4), 0.24, mats["foreground"], -25, z_base=0.76, bevel=0.025)
    duplicate_to_collection(fg_target, foreground, "target cover lip foreground")

    return collections


def set_collection_render_state(collections: dict[str, bpy.types.Collection], visible: set[str]) -> None:
    for name, collection in collections.items():
        hidden = name not in visible
        collection.hide_render = hidden
        collection.hide_viewport = hidden


def render_layer(collections: dict[str, bpy.types.Collection], name: str, visible: set[str]) -> None:
    set_collection_render_state(collections, visible)
    bpy.context.scene.render.filepath = str(PUBLIC_OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main() -> None:
    ensure_dirs()
    clear_scene()
    camera = setup_camera()
    setup_render(camera)
    setup_lights()
    collections = build_scene(camera)
    render_layer(collections, "base", {"base"})
    render_layer(collections, "shadow", {"shadow"})
    render_layer(collections, "foreground", {"foreground"})
    set_collection_render_state(collections, {"base", "shadow", "foreground"})
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT / "banana-b-clay-v1.blend"))


if __name__ == "__main__":
    main()
