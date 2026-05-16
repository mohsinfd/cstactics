# CS2 Tactics S&box Visual Spike

This is Spike B from the original two-engine comparison:

- Spike A: Luanti/Minetest-style generated voxel whitebox.
- Spike B: S&box / Source-2-adjacent generated tactical board.

The purpose is to test whether S&box gives enough visual lift to justify its
platform and workflow risk. This is not a gameplay port.

## Current State

This folder currently contains the shared Banana -> B-site spike data:

- `banana_b_site.json`

The data is validated by:

```powershell
npm run sbox:validate
```

S&box is not installed on the current machine, so no runnable `.sbproj` has been
generated or verified yet.

## Setup Target

When S&box is available:

1. Install/open S&box and the S&box editor.
2. Create a new empty Game project.
3. Copy or reference `banana_b_site.json` inside the project.
4. Add a `SpikeMapGenerator` component that reads the JSON and instantiates:
   - off-white floor slabs;
   - taller clay/gray wall blocks;
   - primitive props for car/crates/logs/sandbags/fountain/coffins/oranges;
   - five red T unit markers;
   - five blue CT unit markers;
   - movement range, planned path, and danger/LOS overlays.
5. Add a locked tactical camera.
6. Add click/raycast selection and optional one-step movement.

## Acceptance

- First screenshot is materially better than the current React/Three board and
  at least competitive with Luanti.
- Banana -> B-site reads without labels.
- Units are readable from the default camera.
- The camera feels tactical, not first-person.
- A wall/cover edit is a data/code edit, not manual scene dressing.
- The implementation does not port combat, economy, bomb logic, utility, or AI.

## Kill Criteria

Kill S&box as a main-client candidate if the camera, editor workflow,
programmatic generation, or platform constraints make iteration slower than the
visual gain is worth.

