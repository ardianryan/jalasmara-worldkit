import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { createPixelator } from 'image-to-pixel';

export const COMFY_PALETTE = [
  '#202d3a', '#3a3446', '#425e65', '#4c8178', '#6faba2', '#9ddbd0',
  '#445e45', '#657361', '#76a268', '#abc681', '#654733', '#9b7c52',
  '#cdbb87', '#f1e1bc', '#969d98', '#d2bd91', '#a76045', '#d99a68',
];

export async function convert(input, output, width) {
  input = resolve(input);
  output = resolve(output);
  if (input === output || existsSync(output) || existsSync(output + '.json')) {
    throw new Error('Choose a new output path; source assets and existing previews are never overwritten.');
  }
  if (!Number.isInteger(width) || width < 1 || width > 2048) throw new Error('Width must be an integer from 1 to 2048.');
  const source = readFileSync(input);
  if (source.length < 24 || !source.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Input must be a PNG.');
  const sourceWidth = source.readUInt32BE(16), sourceHeight = source.readUInt32BE(20);
  if (!sourceWidth || !sourceHeight || sourceWidth > 4096 || sourceHeight > 4096) throw new Error('Source dimensions must be between 1 and 4096.');
  if (width > sourceWidth) throw new Error('Output width cannot exceed source width. Use integer scaling in the engine.');
  const decoded = PNG.sync.read(source);
  const engine = await createPixelator({ backend: 'cpu' });
  try {
    const result = await engine.process(decoded, {
      size: { width, resample: 'nearest' },
      palette: { source: 'custom', name: 'Jalasmara Comfy', colors: COMFY_PALETTE, distance: 'oklab' },
      dither: { method: 'none', strength: 0 },
      cleanup: { orphans: false, smooth: false },
      outline: { mode: 'none' },
    });
    const bytes = await result.toPNG({ scale: 1, indexed: false });
    const hash = value => createHash('sha256').update(value).digest('hex');
    const report = {
      tool: 'Jalasmara WorldKit / image-to-pixel', version: '3.2.0',
      backend: result.backend, sourceSha256: hash(source), outputSha256: hash(bytes),
      sourceSize: [sourceWidth, sourceHeight], outputSize: [result.width, result.height],
      palette: COMFY_PALETTE, settings: result.settings,
      status: 'preview-requires-visual-review',
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, bytes, { flag: 'wx' });
    writeFileSync(output + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } finally { engine.destroy(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, width] = process.argv.slice(2);
  if (!input || !output || !width || process.argv.length !== 5) {
    console.error('Usage: node tools/image-to-pixel/convert.mjs input.png new-preview.png width');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await convert(input, output, Number(width)), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
