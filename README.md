# JalasmaraWorldKit

Offline tools for creating **reviewable map drafts and pixel-asset previews** for [Jalasmara](https://git.ppti.me/ardianryan/Jalasmara-The-Game). WorldKit is an authoring workflow, not the game engine, a live editor, or a map publishing service. Outputs require visual and gameplay review before they enter Godot or the server-owned world.

[Development screenshots](docs/visual/README.md) · [Tool provenance](THIRD_PARTY_NOTICES.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

| Tool | What it does | Boundary |
| --- | --- | --- |
| [`tools/worldkit`](tools/worldkit/README.md) | Converts explicitly mapped OpenWorld-style JSON into polygon, elevation, and portal drafts | Original Node adapter; does not copy or run the OpenWorld engine |
| [`tools/pixel-snapper`](tools/pixel-snapper/README.md) | Detects/snaps pixel grids and applies authored palettes | Original Python wrapper around pinned, attributed Sprite Fusion Pixel Snapper Rust code |
| [`tools/image-to-pixel`](tools/image-to-pixel/README.md) | Produces PNG palette previews with a CPU backend | Uses the separately licensed Image-to-Pixel npm package |

## Requirements and checks

Use Node.js 22.12+, Python 3.9+, and Rust/Cargo 1.90. Installing the nested npm packages and building Rust initially needs network access; processing can then run locally.

```sh
npm run setup:images
npm run verify:snapper
npm run build:snapper
npm run check
npm run audit:images
```

`npm run check` covers map/image tests, snapper verification and Python tests, and Rust tests using its locked dependencies. The root package has no runtime dependencies. Generated outputs, caches, and installed packages are ignored by Git.

## Make a draft

```sh
mkdir -p artifacts
npm run map:import -- tools/worldkit/fixtures/connected.json \
  --config tools/worldkit/fixtures/mapping.json \
  --out artifacts/world-draft.json
npm run palette -- path/to/source.png artifacts/palette-preview.png 128
npm run snap -- path/to/source.png artifacts/grid-preview.png \
  --pixel-size 4 --palette jala-muara
```

Each command writes to a new output path and refuses unsafe overwrites. The map adapter requires explicit tile/material mappings, reachable portals, and authored height connectors. It reports invalid geometry rather than silently flattening it. Pixel conversion is lossy; inspect transparency, frame boundaries, small details, and foot pivots before using a preview. The [in-game copy of the adapter](https://git.ppti.me/ardianryan/Jalasmara-The-Game/src/branch/main/tools/worldkit) has a separate compatibility check against current world geometry.

## What the screenshots show

The [gallery](docs/visual/README.md) documents actual Jalasmara world development: village building alignment, grounded stairs, and a forest gateway. **These are game screenshots, not WorldKit-generated output or evidence that the adapter built every pictured object.** Their source builds, hashes, limits, and separate game-art rights are recorded beside the images.

## CI, license, and reporting

Gitea is the primary repository and CI home. GitHub and GitLab are source backups; their CI is disabled for this kit. The CI workflow validates the tools but does not deploy Jalasmara. Original WorldKit adapters, tests, fixtures, and documentation use the [MIT license](LICENSE). Vendored upstream code retains its own notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Game screenshots are **not MIT-licensed**; see [gallery rights](docs/visual/README.md).

Do not include credentials, player data, paid assets, or private moodboards in issues or contributions. No independent security audit of this toolset has been completed; report concerns under [SECURITY.md](SECURITY.md).

The [roadmap](ROADMAP.md), [changelog](CHANGELOG.md), [code of conduct](CODE_OF_CONDUCT.md), and [citation files](CITATION.cff) document this early public toolset.
