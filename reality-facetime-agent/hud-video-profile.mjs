/** Selects HUD presentation and geometry; never changes room, voice, codec or track selection. */
export function resolveHudVideoProfile(name = 'default') {
  if (!['default', 'juan-original', 'landscape-test', 'routine-game', 'juan-themes'].includes(name)) throw new Error('HUD_VIDEO_PROFILE must be default, juan-original, landscape-test, routine-game or juan-themes');
  if (name === 'landscape-test') return Object.freeze({ name, width: 640, height: 360, fps: 15 });
  return Object.freeze({ name, width: 540, height: ['juan-original','juan-themes'].includes(name) ? 1170 : 960, fps: 15 });
}
export const HUD_VIDEO_PROFILE = resolveHudVideoProfile(process.env.HUD_VIDEO_PROFILE || 'default');
