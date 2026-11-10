# Third-party notices

Original adapters and synthetic fixtures are covered by the root MIT license. Upstream tools retain their names, authorship, and notices.

| Component | Source and pin | License and local notice |
| --- | --- | --- |
| Sprite Fusion Pixel Snapper | [Hugo Duprez / Sprite Fusion](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/02f9315d73d3219274d17767b36d9a231a6b1f4b), commit `02f9315d73d3219274d17767b36d9a231a6b1f4b` | MIT; unchanged Rust source under `tools/pixel-snapper/vendor/`, original notice in `vendor/LICENSE`. File hashes and provenance are recorded in `tools/pixel-snapper/source.json`. The Python wrapper is original. |
| Image-to-Pixel | [Tezumie](https://github.com/Tezumie/Image-to-Pixel), npm `image-to-pixel@3.2.0` | MIT; `tools/image-to-pixel/LICENSE.upstream.txt`. Installed through the nested lockfile; not claimed as an original WorldKit implementation. |
| ShaderMate | [Tezumie package](https://www.npmjs.com/package/shadermate), transitive Image-to-Pixel dependency | MIT; `tools/image-to-pixel/LICENSE.shadermate.txt`. The WorldKit adapter selects Image-to-Pixel's CPU backend. |
| pngjs | [pngjs](https://github.com/pngjs/pngjs), npm `pngjs@7.0.0` | MIT; `tools/image-to-pixel/LICENSE.pngjs.txt`, retaining Luke Page/Original Contributors and Kuba Niegowski notices. |

The map adapter reads a format documented by [OpenWorld](https://github.com/SihanXU/openworld/tree/076ab27d5312416cbabe19c12b90e086f5fc32d7). It is original code and does not vendor the OpenWorld engine, editor, maps, or assets. Reference pin and format sources are recorded in `tools/worldkit/source.json`; upstream's MIT code license has separate art/audio/font exceptions.

Cargo and npm lockfiles identify further dependencies, which retain their respective licenses. No game artwork, audio, fonts, paid service, or upstream Git history is part of the toolset's processing inputs or distributable outputs. Preserve the corresponding notices if redistributing upstream code or substantial portions of it.

The three Jalasmara screenshots in `docs/visual/` are documentation evidence, not tool input/output or MIT-licensed assets. Their rights and source hashes are recorded in [the gallery](docs/visual/README.md).
