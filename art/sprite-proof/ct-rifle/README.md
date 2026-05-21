# CT Rifle Authored Movement Proof

This folder is the handoff point for the first production-quality CT movement
proof. Do not put generated SVG frame variations here.

Required proof clips before switching CT to `exported` in
`src/renderer/locomotion/unitAnimationManifest.ts`:

- `idle_0.png`
- `run_forward_0.png` through `run_forward_5.png`
- `strafe_left_0.png` through `strafe_left_3.png`
- `stop_brace_0.png` through `stop_brace_2.png`

Quality bar:

- transparent background;
- stable foot/base anchor;
- visibly authored foot plants and weight shifts;
- weapon remains readable at default tactical zoom;
- stop brace reads as plant, brace, settle before idle.

When the proof is ready, copy the frames to
`public/board2d5/units/exported/ct/` and set only CT to `exported` in the
per-team animation source map. T can keep using generated placeholder frames
until its authored set exists.
