import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
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


test('existing report and report-path directory remain intact without orphan preview', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'worldkit-pair-'));
  try {
    const input = join(dir, 'source.png');
    const original = PNG.sync.write(new PNG({width:4,height:4}));
    writeFileSync(input, original);
    const output = join(dir, 'preview.png');
    writeFileSync(output + '.json', 'existing report');
    await assert.rejects(convert(input, output, 2), /new output path/);
    assert.equal(existsSync(output), false);
    assert.equal(readFileSync(output + '.json', 'utf8'), 'existing report');
    const directoryOutput = join(dir, 'directory-preview.png');
    mkdirSync(directoryOutput + '.json');
    await assert.rejects(convert(input, directoryOutput, 2), /new output path/);
    assert.equal(existsSync(directoryOutput), false);
    assert.equal(existsSync(directoryOutput + '.json'), true);
    const alias = join(dir, 'source.png.json');
    writeFileSync(alias, original);
    await assert.rejects(convert(alias, join(dir,'source.png'),2), /new output path/);
    assert.deepEqual(readFileSync(input), original);
    assert.deepEqual(readFileSync(alias), original);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('concurrent conversions publish exactly one complete preview/report pair', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'worldkit-race-'));
  try {
    const input = join(dir,'source.png'), output=join(dir,'preview.png');
    const original=PNG.sync.write(new PNG({width:4,height:4}));
    writeFileSync(input,original);
    const results=await Promise.allSettled([convert(input,output,2),convert(input,output,2)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected').length,1);
    const pixels=readFileSync(output), report=JSON.parse(readFileSync(output+'.json','utf8'));
    assert.equal(report.outputSha256,createHash('sha256').update(pixels).digest('hex'));
    assert.deepEqual(report.outputSize,[PNG.sync.read(pixels).width,PNG.sync.read(pixels).height]);
    assert.deepEqual(readFileSync(input),original);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
