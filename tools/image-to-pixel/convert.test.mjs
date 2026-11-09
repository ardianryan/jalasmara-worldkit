import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { convert, COMFY_PALETTE } from './convert.mjs';

test('offline conversion preserves transparent cells, deterministic dimensions and palette, leaves source intact', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'worldkit-palette-'));
  try {
    const source = new PNG({ width: 8, height: 8 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      source.data.set([80 + x * 18, 70 + y * 18, 125, x < 2 ? 0 : 255], i);
    }
    const input = join(dir, 'source.png'), output = join(dir, 'preview.png');
    const original = PNG.sync.write(source);
    writeFileSync(input, original);
    const report = await convert(input, output, 4);
    const again = await convert(input, join(dir, 'repeat.png'), 4);
    assert.equal(report.backend, 'cpu');
    assert.deepEqual(report.outputSize, [4, 4]);
    assert.equal(report.outputSha256, again.outputSha256);
    assert.deepEqual(readFileSync(input), original);
    const image = PNG.sync.read(readFileSync(output));
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      assert.equal(image.data[i + 3], x === 0 ? 0 : 255);
      if (x) assert(COMFY_PALETTE.includes('#' + image.data.subarray(i, i + 3).toString('hex')));
    }
    await assert.rejects(convert(input, output, 4), /new output path/);
    await assert.rejects(convert(input, input, 4), /new output path/);
    await assert.rejects(convert(input, join(dir, 'large.png'), 16), /cannot exceed/);
    await assert.rejects(convert(input, join(dir, 'invalid.png'), NaN), /integer/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
