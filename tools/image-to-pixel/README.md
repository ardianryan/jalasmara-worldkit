# WorldKit palette preparation

Offline PNG conversion using [Image-to-Pixel 3.2.0](https://github.com/Tezumie/Image-to-Pixel), by Tezumie, MIT. The original Jalasmara adapter chooses an explicitly authored comfy palette and CPU backend; no service key, browser, GPU, or game-runtime dependency is required.

```sh
npm ci --prefix tools/image-to-pixel --ignore-scripts
node tools/image-to-pixel/convert.mjs input.png artifacts/worldkit/palette-preview.png 128
node --test tools/image-to-pixel/convert.test.mjs
```

Input must be a PNG up to 4096 pixels per side. Width is explicit, aspect ratio is retained, and output cannot upscale the source. Nearest sampling, no dithering, and disabled cleanup preserve a predictable grid. Original material colors define the palette in `convert.mjs`; it is not extracted from the user's reference artwork. Exact source/target SHA-256, dimensions, palette, and settings accompany the output in a JSON report.

Existing files are never overwritten. Output is a review preview, not an automatic asset promotion. Frame boundaries, pivots, animation consistency, and semitransparent edges still require inspection; this converter does not produce 3D geometry or repair anatomy. No production PNG is changed by installing or testing this tool.

## Attribution

- Image-to-Pixel 3.2.0: Tezumie, MIT, [license](LICENSE.upstream.txt).
- ShaderMate dependency: Tezumie, MIT, [license](LICENSE.shadermate.txt). The adapter uses the CPU path.
- pngjs 7.0.0: Luke Page, Kuba Niegowski and contributors, MIT, [license](LICENSE.pngjs.txt), used to decode PNG input.
- `convert.mjs`, its tests, and the Jalasmara palette are original Jalasmara WorldKit code under MIT. Upstream code and package names retain their attribution.

`package-lock.json` records exact versions and integrity hashes. Run `npm audit --prefix tools/image-to-pixel` to inspect dependencies. Tests use an original generated RGBA fixture, verify palette membership, preserved transparent/opaque cells, repeatable pixels, and protection of source/existing files. Processing is offline after installing the packages.
