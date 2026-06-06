# `vfx/generate/templates/` — per-use-case prompt templates

Each file is one recurring use-case. The router (`route.ts`) picks the model; these files give the *prompt
form* the planner pastes into the wrapper's `--prompt` argument. Each wrapper's header carries the
provider-specific prompting rules — read both together.

| Template | Brief shape | Default model | Rules of record |
|---|---|---|---|
| [talking-head-cutaway.md](./talking-head-cutaway.md) | Presenter-on-camera B-roll cutaway (identity-locked) | Veo 3.1 Standard | Ingredients to Video; NEVER Seedance 2.0 |
| [9-16-establishing-plate-vertical.md](./9-16-establishing-plate-vertical.md) | 9:16 vertical ad establishing plate | Veo 3.1 Standard | Native 9:16, audio, Extend; bottom-480-px safe zone |
| [mood-texture-black-bg.md](./mood-texture-black-bg.md) | Tier-2 mood/textural element on black bg | Seedance 2.0 | `cameraFixed:false` for motion; `mixBlendMode:'screen'` composite |
| [v2v-relight.md](./v2v-relight.md) | Relight / restyle an existing clip | Runway Aleph | Granular phrasing; "Preserve subject, camera, composition" |
| [identity-multishot.md](./identity-multishot.md) | Identity-consistent multi-shot character | Veo 3.1 (Ingredients) + Runway Gen-4.5 (References) hybrid | Contact-sheet refs; repeat character descriptor verbatim |
