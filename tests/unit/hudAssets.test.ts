import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
}

const assets = [
  { path: 'images/hud/cargo-crate.png', width: 32, height: 36 },
  { path: 'images/hud/instrument-bezel.png', width: 64, height: 40 },
  { path: 'images/hud/cabinet-screw.png', width: 8, height: 8 },
] as const;

function readPngHeader(path: string): PngHeader {
  const bytes = readFileSync(new URL(`../../${path}`, import.meta.url));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24]!,
    colorType: bytes[25]!,
  };
}

test('HUD pixel-art assets keep their authored native dimensions and alpha channel', () => {
  for (const asset of assets) {
    assert.deepEqual(readPngHeader(asset.path), {
      width: asset.width,
      height: asset.height,
      bitDepth: 8,
      colorType: 6,
    });
  }
});

test('HUD pixel-art assets are available offline', () => {
  const serviceWorkerCore = readFileSync(new URL('../../sw-core.js', import.meta.url), 'utf8');
  for (const asset of assets) {
    assert.match(serviceWorkerCore, new RegExp(`'/${asset.path.replaceAll('.', '\\.')}'`));
  }
});
