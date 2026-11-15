import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnostic } from './diagnostics.mjs';
import { selectGameThemes } from './game-test-config.mjs';
import { validateThemes } from './theme-selection.mjs';
import { THEMES } from './themes.mjs';

test('test catalog requires explicit opt-in and never mutates production themes', () => {
  assert.equal(selectGameThemes(THEMES, {}), THEMES);
  assert.throws(() => selectGameThemes(THEMES, { GAME_TEST_MODE: 'yes' }));
  assert.equal(validateThemes(selectGameThemes(THEMES, { GAME_TEST_MODE: 'yes', ENABLE_GAME: 'yes' })).length, 3);
  assert.equal(THEMES.length, 0);
});
test('diagnostics reject payloads, object names, credentials, and arbitrary field values', () => {
  let output;
  diagnostic('verification_finished', { provider: 'groq', latencyMs: 12, errors: 1,
    phase: 'private-player-name', frames: new Uint8Array([1,2]), apiKey: 'secret', transcript: 'private', objective: 'private' },
    (...args) => { output = args.join(' '); });
  assert.ok(output.includes('groq')); assert.ok(output.includes('latencyMs'));
  assert.ok(!/private|secret|apiKey|transcript|objective|frames/.test(output));
});
