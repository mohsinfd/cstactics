# Camera Input Usability Test

Purpose: verify the map can be inspected like a human player will use it, not
only through ideal clicks. This test must be run after camera, HUD, map, or input
changes.

## Device Profiles

### Laptop Trackpad

- Two-finger vertical scroll pans the board north/south at default zoom.
- Two-finger horizontal scroll pans the board east/west at default zoom.
- Fast vertical swipes move a meaningful distance at high zoom, not tiny
  increments.
- Pinch/modified wheel zooms in and out without losing the map.
- Quick sequence: zoom in, pan from T Spawn toward B, pan back toward A/CT,
  zoom out, reset.

### Mouse

- Wheel steps zoom in/out by default.
- Left-drag pans the map without selecting tiles during the drag.
- Right-drag pans the map.
- Quick sequence: wheel zoom in, drag across the map, wheel zoom out, use reset.

## Acceptance

- Player can move vertically at every useful zoom level.
- Player can traverse from one end of Inferno to the other in a few human
  gestures.
- Hover/click tile targeting remains correct after panning and zooming.
- HUD panels do not block the central map interaction path.
- Command bar, view controls, team roster, and selected-unit action panel remain
  visible and human-clickable after zooming, panning, and reset.
- The player can find and click `Plan Execute`, `Banana Drill`, `End Turn`,
  camera reset, and selected-unit actions without hunting around the screen.
- No fresh browser console errors appear during the test.

## Human-Click HUD Probe

Automated pass:

```bash
npm run test:browser
```

Run this after camera, HUD, input, or major gameplay changes:

- Click `Banana Drill`.
- Use zoom controls and wheel zoom to reach high zoom.
- Perform a quick mouse drag across the map and back.
- Perform a trackpad-like vertical and horizontal pan.
- Click camera reset.
- Click `Plan Execute`, then return to `Planning`/move controls.
- Select `Shoot`/`Hold`/`Move` from the selected-unit panel where enabled.
- Confirm no required HUD control leaves the viewport or becomes covered.

The full post-feature checklist is in `docs/human-usability-regression.md`.

## Current Implementation Notes

- Trackpad-like wheel input pans the board.
- Discrete mouse-wheel steps zoom the orthographic camera.
- Pinch/modified wheel input zooms the orthographic camera.
- Trackpad pan scale is clamped with a higher minimum so vertical movement still
  works when zoomed in.
- Keyboard fallback remains available: arrows/WASD pan, `+`/`-` zoom, `0`/Home
  reset.

## Latest Run

- URL: `http://127.0.0.1:5174/`
- Scenario: Banana Drill, default tactical camera.
- Checks: build, lint, trackpad-style pan/zoom smoke, mouse-style wheel/drag
  smoke, high-zoom vertical trackpad pan, and HUD reachability smoke.
- Result: passed with no fresh browser console errors.
