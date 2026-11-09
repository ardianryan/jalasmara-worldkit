# JalasmaraWorldKit

Offline tools for map drafts and pixel-asset preparation. Outputs are review candidates: these tools do not publish content, alter a running game, or access player accounts.

| Tool | Purpose | Runtime |
| --- | --- | --- |
| `tools/worldkit` | Convert explicitly mapped OpenWorld JSON into validated polygon/elevation/portal drafts. Original adapter with no runtime dependencies. | Node.js |
| `tools/pixel-snapper` | Detect/snap a pixel grid and optionally apply a palette through the pinned Sprite Fusion Pixel Snapper CLI. Original Python wrapper; unchanged upstream MIT Rust source. | Python + Rust |
| `tools/image-to-pixel` | Prepare PNG palette previews using Image-to-Pixel 3.2.0's CPU backend and pngjs. | Node.js + locked npm dependencies |

## Setup and checks

Use Node.js 22.12+, Python 3.9+, and Rust/Cargo 1.90. The vendored Cargo lockfile is version 4. Initial dependency installation/build requires network access; subsequent processing runs locally.

```sh
npm run setup:images
npm run verify:snapper
npm run build:snapper
npm run check
npm run audit:images
```

The root package has no dependencies. `setup:images` installs only the nested image tool's locked packages. `build:snapper` verifies vendored source hashes and creates the local Rust binary; cached dependencies permit `python3 tools/pixel-snapper/snap.py build --offline`.

## Prepare review outputs

```sh
mkdir -p artifacts
npm run map:import -- tools/worldkit/fixtures/connected.json --config tools/worldkit/fixtures/mapping.json --out artifacts/world-draft.json
npm run palette -- path/to/source.png artifacts/palette-preview.png 128
npm run snap -- path/to/source.png artifacts/grid-preview.png --pixel-size 4 --palette jala-muara
```

Use a fresh output path. Existing files are not silently overwritten. Pixel conversion is lossy: inspect transparency, small details, frame boundaries, and foot pivots before promoting an asset. Map drafts require explicit terrain/entity mapping, safe floors, authored height connectors, and reachable portal destinations; they are not automatically accepted as production manifests.

Each tool's README documents its exact flags, limits, and provenance. These utilities do not provide a game runtime, editor GUI, 3D reconstruction, or live map publishing.

## CI and licenses

GitLab CI runs the Node adapter/image tests and dependency audit, then Python adapter and upstream Rust tests in a separate Rust job. No GitHub Actions or GitHub report publishing is configured here. The pipeline validates this toolset; it does not build or deploy Jalasmara.

Original code uses the [MIT license](LICENSE). Upstream code and dependencies retain their own notices: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
