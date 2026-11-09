# JalasmaraWorldKit: Pixel Snapper adapter

Offline asset preparation using **Sprite Fusion Pixel Snapper**, created by **Hugo Duprez / Sprite Fusion**. The upstream processing code is vendored unchanged under MIT at commit [`02f9315d73d3219274d17767b36d9a231a6b1f4b`](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/02f9315d73d3219274d17767b36d9a231a6b1f4b). JalasmaraWorldKit names the integration layer; it does not claim authorship of Pixel Snapper.

This uses the upstream native Rust CLI, not the desktop/browser application. It detects a pixel grid, quantizes colors, resamples grid cells and optionally constrains the result to a custom palette. It accepts individual PNG/JPEG files or a directory. No paid API, online image service or Godot runtime dependency is used.

## Setup

Python 3.9+ and Cargo/Rust are required. The first build may download the dependencies pinned in `vendor/Cargo.lock`:

```sh
python3 tools/pixel-snapper/snap.py verify
python3 tools/pixel-snapper/snap.py build
```

After those dependencies are cached, the build can explicitly prohibit network access:

```sh
python3 tools/pixel-snapper/snap.py build --offline
```

Compiled binaries and build/proof files stay in ignored `tools/pixel-snapper/.cache/`. No global CLI installation is required. Upstream source hashes are checked before building or processing.

## Prepare a review output

From the repository root:

```sh
python3 tools/pixel-snapper/snap.py snap path/to/source.png artifacts/worldkit/review.png --pixel-size 4 --palette jala-muara
python3 tools/pixel-snapper/snap.py snap path/to/input-directory artifacts/worldkit/review-batch --colors 16
```

Omit `--pixel-size` to use upstream detection. `--palette` accepts the optional original Jala Muara review palette or comma-separated six-digit RGB values such as `202d3a,6faba2,af8759,f1e1bc`. A fixed palette is a review choice, not a mandatory conversion of all Jalasmara art.

The adapter refuses existing outputs, in-place conversion, a batch output inside its input directory, and output under live Godot resources or web public assets. Inspect results, compare animation and transparency, then promote chosen files in a separate deliberate change. It never silently processes live PNGs.

## Important limits

- This is a lossy grid/color preparation step. It does not generate or repair missing character anatomy, rebuild animation poses, create 3D models or add cultural details.
- Output dimensions can change beyond simple division by the requested grid size. On the included generated fixture, the pinned upstream CLI turns a 64×64 image into **9×9**, with `--pixel-size 8`; it does not output 8×8. The detector retains boundary cuts.
- Do not process a complete production sprite sheet and assume its frame grid, foot anchors or UVs remain valid. Prefer reviewing individual frames, then explicitly repack/validate the atlas.
- Transparent cells and custom palette membership are tested on the fixture; that is not a guarantee that every semitransparent antialiased edge or delicate woven detail survives unchanged.
- The direct upstream binary has its own output behavior. The extra review/output protections apply when using `snap.py`.

No live game asset was modified during this integration.

## Verification

```sh
python3 -m unittest discover -s tools/pixel-snapper/tests -v
cargo test --locked --offline --manifest-path tools/pixel-snapper/vendor/Cargo.toml --target-dir tools/pixel-snapper/.cache/target
```

Verified on 9 November 2026: eight adapter tests and five upstream CLI tests pass. The adapter tests generate their own small RGBA PNG without Pillow or downloaded artwork. They cover observed grid dimensions, fixed palette, transparent/opaque cells, byte-identical repeat processing, unchanged input, batch processing, invalid grid rejection and output protections.

## Provenance and licenses

- [`source.json`](source.json): upstream repository, commit, version and SHA-256 of every vendored file.
- [`vendor/LICENSE`](vendor/LICENSE): the unmodified upstream MIT license, including Hugo Duprez's copyright.
- [`vendor/README.md`](vendor/README.md): original upstream documentation and acknowledgments.
- [`LICENSE`](LICENSE): MIT terms for this distribution, with upstream and adapter notices.
- [`palettes/jala-muara.json`](palettes/jala-muara.json), `snap.py` and `tests/`: original Jalasmara integration files.

Upstream Cargo dependencies remain pinned in the original lockfile; they retain their respective licenses. No compiled binary, dependency source tree, web frontend or upstream Git history is committed here.
