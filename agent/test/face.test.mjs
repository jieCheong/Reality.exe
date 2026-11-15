import assert from 'node:assert/strict';
import test from 'node:test';
import { drawFace, HEIGHT, THEMES, WIDTH } from '../face.mjs';

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

test('theme chooser and selected themes render distinct HUD screens', () => {
  const chooser = drawFace(0, false);

  for (const themeId of Object.keys(THEMES)) {
    assert.notDeepEqual(drawFace(0, false, themeId), chooser);
  }
  assert.notDeepEqual(drawFace(0, false, 'odyssey'), drawFace(0, false, 'backrooms'));
});

test('theme chooser cards use distinct image backgrounds', () => {
  const chooser = drawFace(0, false);
  const pixelAt = (x, y) => [...chooser.slice((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
  const cardBackgrounds = [400, 536, 672].map((y) => pixelAt(470, y));

  for (const background of cardBackgrounds) {
    assert.equal(background[3], 0xff);
    assert.notDeepEqual(background, [0x10, 0x1f, 0x2a, 0xff]);
  }
  assert.notDeepEqual(cardBackgrounds[0], cardBackgrounds[1]);
  assert.notDeepEqual(cardBackgrounds[1], cardBackgrounds[2]);
});

test('mission completion renders theme-specific summary pages and supplied stats', () => {
  const result = { tasksCompleted: 3, elapsedSeconds: 3725 };
  const pixelAt = (frame, x, y) => [...frame.slice((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
  for (const themeId of Object.keys(THEMES)) {
    const activeFrame = drawFace(0, false, themeId);
    const completedFrame = drawFace(0, false, themeId, result);
    assert.notDeepEqual(
      completedFrame,
      activeFrame,
    );
    assert.deepEqual(pixelAt(completedFrame, 270, 250), pixelAt(activeFrame, 270, 250));
  }
  assert.notDeepEqual(
    drawFace(0, false, 'odyssey', result),
    drawFace(0, false, 'odyssey', { tasksCompleted: 4, elapsedSeconds: 3725 }),
  );
  assert.notDeepEqual(
    drawFace(0, false, 'backrooms', result),
    drawFace(0, false, 'backrooms', { tasksCompleted: 3, elapsedSeconds: 3726 }),
  );
});

test('mission completion requires a theme and valid statistics', () => {
  assert.throws(() => drawFace(0, false, null, { tasksCompleted: 3, elapsedSeconds: 60 }), RangeError);
  assert.throws(() => drawFace(0, false, 'space', { tasksCompleted: -1, elapsedSeconds: 60 }), RangeError);
  assert.throws(() => drawFace(0, false, 'space', { tasksCompleted: 3, elapsedSeconds: 1.5 }), RangeError);
  assert.throws(() => drawFace(0, false, 'space', {
    tasksCompleted: 3,
    elapsedSeconds: 60,
    timedOutTasks: -1,
  }), RangeError);
});

test('loss triggers only after more than three timed-out tasks', () => {
  for (const themeId of Object.keys(THEMES)) {
    const result = { tasksCompleted: 2, elapsedSeconds: 180, timedOutTasks: 3 };
    const defeat = { ...result, timedOutTasks: 4 };

    assert.deepEqual(
      drawFace(0, false, themeId, result),
      drawFace(0, false, themeId, { tasksCompleted: 2, elapsedSeconds: 180 }),
    );
    assert.notDeepEqual(
      drawFace(0, false, themeId, defeat),
      drawFace(0, false, themeId, result),
    );
  }
});

test('Odyssey image sits behind opaque HUD panels', () => {
  const odyssey = drawFace(0, false, 'odyssey');
  const pixelAt = (x, y) => [...odyssey.slice((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
  const background = pixelAt(270, 250);
  const objectivePanel = pixelAt(250, 600);
  const checkpointPanel = pixelAt(470, 890);

  assert.equal(background[3], 0xff);
  assert.deepEqual(objectivePanel, [0xf2, 0xe7, 0xcd, 0xff]);
  assert.deepEqual(checkpointPanel, objectivePanel);
  assert.notDeepEqual(background, objectivePanel);
  assert.notDeepEqual(odyssey, drawFace(0, false, 'space'));
});

test('Space lunar photo sits behind opaque HUD panels', () => {
  const space = drawFace(0, false, 'space');
  const pixelAt = (x, y) => [...space.slice((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
  const background = pixelAt(270, 250);
  const headerPanel = pixelAt(200, 60);
  const objectivePanel = pixelAt(250, 550);
  const checkpointPanel = pixelAt(470, 890);

  assert.equal(background[3], 0xff);
  assert.deepEqual(headerPanel, [0xf8, 0xfc, 0xff, 0xff]);
  assert.deepEqual(objectivePanel, headerPanel);
  assert.deepEqual(checkpointPanel, headerPanel);
  assert.notDeepEqual(background, headerPanel);
});

test('Backrooms photo sits behind an opaque objective panel', () => {
  const backrooms = drawFace(0, false, 'backrooms');
  const background = [...backrooms.slice(0, 4)];
  const panelOffset = (550 * WIDTH + 250) * 4;
  const checkpointHeaderOffset = (890 * WIDTH + 250) * 4;
  const panel = [...backrooms.slice(panelOffset, panelOffset + 4)];
  const checkpointHeader = [...backrooms.slice(checkpointHeaderOffset, checkpointHeaderOffset + 4)];

  assert.equal(background[3], 0xff);
  assert.notDeepEqual(background, panel);
  assert.deepEqual(panel, [0xf6, 0xef, 0xcc, 0xff]);
  assert.deepEqual(checkpointHeader, panel);
});

test('unknown theme IDs are rejected', () => {
  assert.throws(() => drawFace(0, false, 'unknown'), RangeError);
});
