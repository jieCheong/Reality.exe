// Separate controlled-test catalog: never edits or fills teammate-owned production themes.
export function selectGameThemes(production, env = process.env) {
  if (env.GAME_TEST_MODE !== 'yes') return production;
  if (env.ENABLE_GAME !== 'yes') throw new Error('GAME_TEST_MODE requires explicit ENABLE_GAME=yes');
  return [1, 2, 3].map(n => ({ id: `controlled-test-${n}`, name: `Test ${n}`,
    intro: 'Controlled gameplay test. Camera images will be sent to the configured vision service.' }));
}
