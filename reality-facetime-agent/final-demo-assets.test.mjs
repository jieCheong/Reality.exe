import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { writeRoutineGif } from './final-demo-assets.mjs';

test('routine GIF writer applies the requested delay to every frame', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'reality-routine-gif-'));
  try {
    const path = join(temporaryRoot, 'timed.gif');
    const frameBytes = 540 * 960 * 4;
    await writeRoutineGif([
      Buffer.alloc(frameBytes, 0),
      Buffer.alloc(frameBytes, 255),
    ], path, [100, 200]);
    const metadata = await sharp(path, { animated: true }).metadata();
    assert.deepEqual([metadata.width, metadata.pageHeight, metadata.pages], [540, 960, 2]);
    assert.deepEqual(metadata.delay, [100, 200]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
