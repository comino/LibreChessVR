# Third-party notices

LibreChessVR's project code and original artwork use the [MIT license](LICENSE).
The following third-party works retain their own licenses.

## Chess pieces and scene models

`assets/pieces.glb` is adapted from [Chess Set](https://polyhaven.com/a/chess_set)
by Riley Queen. The scene models in `assets/props/` are also from Poly Haven.
All these models are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/);
see [Poly Haven's asset license](https://polyhaven.com/license).

The copies here have been processed for real-time rendering: selected nodes, merged meshes,
and resized/compressed textures. The conversion scripts are in `tools/`.

| File in `assets/props/` | Original asset |
| --- | --- |
| `ArmChair_01.glb` | [ArmChair_01](https://polyhaven.com/a/ArmChair_01) |
| `ClassicNightstand_01.glb` | [ClassicNightstand_01](https://polyhaven.com/a/ClassicNightstand_01) |
| `GothicCommode_01.glb` | [GothicCommode_01](https://polyhaven.com/a/GothicCommode_01) |
| `Ottoman_01.glb` | [Ottoman_01](https://polyhaven.com/a/Ottoman_01) |
| `Rockingchair_01.glb` | [Rockingchair_01](https://polyhaven.com/a/Rockingchair_01) |
| `brass_diya_lantern.glb` | [brass_diya_lantern](https://polyhaven.com/a/brass_diya_lantern) |
| `fancy_picture_frame_01.glb` | [fancy_picture_frame_01](https://polyhaven.com/a/fancy_picture_frame_01) |
| `fern_02.glb` | [fern_02](https://polyhaven.com/a/fern_02) |
| `folding_wooden_stool.glb` | [folding_wooden_stool](https://polyhaven.com/a/folding_wooden_stool) |
| `jug_01.glb` | [jug_01](https://polyhaven.com/a/jug_01) |
| `moon_rock_02.glb` | [moon_rock_02](https://polyhaven.com/a/moon_rock_02) |
| `painted_wooden_bench.glb` | [painted_wooden_bench](https://polyhaven.com/a/painted_wooden_bench) |
| `planter_pot_clay.glb` | [planter_pot_clay](https://polyhaven.com/a/planter_pot_clay) |
| `potted_plant_04.glb` | [potted_plant_04](https://polyhaven.com/a/potted_plant_04) |
| `round_wooden_table_02.glb` | [round_wooden_table_02](https://polyhaven.com/a/round_wooden_table_02) |
| `sofa_03.glb` | [sofa_03](https://polyhaven.com/a/sofa_03) |
| `stone_fire_pit.glb` | [stone_fire_pit](https://polyhaven.com/a/stone_fire_pit) |
| `throw_pillows_01.glb` | [throw_pillows_01](https://polyhaven.com/a/throw_pillows_01) |
| `vintage_day_bed.glb` | [vintage_day_bed](https://polyhaven.com/a/vintage_day_bed) |
| `vintage_oil_lamp.glb` | [vintage_oil_lamp](https://polyhaven.com/a/vintage_oil_lamp) |
| `wooden_lantern_01.glb` | [wooden_lantern_01](https://polyhaven.com/a/wooden_lantern_01) |

## Model in earlier commits

The former `assets/chess.glb`, retained in Git history, is based on
[Chess Pieces](https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38)
by [Aitordsgn](https://sketchfab.com/aitordsgn), licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The original attribution is also embedded in the GLB metadata. The version used here was
simplified and its materials adapted for the chess scene. This attribution also applies to
images showing that earlier model. That model is not covered by the project's MIT license.

## Libraries and fonts

These are loaded from their upstream CDNs at runtime:

| Dependency | License and source |
| --- | --- |
| Three.js 0.170.0 and its addons | [MIT](https://github.com/mrdoob/three.js/blob/r170/LICENSE), three.js authors |
| chess.js 1.0.0 | [BSD-2-Clause](https://github.com/jhlywa/chess.js/blob/v1.0.0/LICENSE), Jeff Hlywa |
| WebXR Input Profiles hand models | [MIT](https://github.com/immersive-web/webxr-input-profiles/blob/main/packages/assets/LICENSE.md), Amazon; loaded by Three.js |
| Inter | [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt), Inter Project Authors |
| Space Grotesk | [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/spacegrotesk/OFL.txt), Space Grotesk Project Authors |
| JetBrains Mono | [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/jetbrainsmono/OFL.txt), JetBrains Mono Project Authors |

The optional model-conversion tools use glTF Transform (MIT) and sharp (Apache-2.0).
The optional Android wrapper uses Meta's Bubblewrap fork (Apache-2.0). These tools are
installed separately; their own packages contain their license notices.

## Lichess

Puzzles and optional online games use the [Lichess API](https://lichess.org/api).
LibreChessVR is an independent project. Lichess puzzle data and services are not relicensed
by the MIT license for this repository.
