import assert from 'node:assert/strict';
import test from 'node:test';
import { drawFace, HEIGHT, WIDTH } from '../face.mjs';

test('HUD produces an opaque RGBA frame at the LiveKit video dimensions', () => {
  const frame = drawFace(0, false);

  assert.ok(frame instanceof Uint8Array);
  assert.equal(frame.length, WIDTH * HEIGHT * 4);
  assert.equal(frame[3], 255);
  assert.equal(frame[(WIDTH * HEIGHT - 1) * 4 + 3], 255);
});

test('voice activity changes the HUD frame', () => {
  const idleFrame = drawFace(10, false);
  const speakingFrame = drawFace(10, true);

  assert.notDeepEqual(speakingFrame, idleFrame);
});
