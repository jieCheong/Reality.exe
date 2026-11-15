/** Geometry-only A/B profile; never changes room, voice, codec or track selection. */
export function resolveHudVideoProfile(name = 'default') {
  if (!['default', 'juan-original', 'landscape-test'].includes(name)) throw new Error('HUD_VIDEO_PROFILE must be default, juan-original or landscape-test');
  if (name === 'landscape-test') return Object.freeze({ name, width: 640, height: 360, fps: 15 });
  return Object.freeze({ name, width: 540, height: name === 'juan-original' ? 1170 : 960, fps: 15 });
}
export const HUD_VIDEO_PROFILE = resolveHudVideoProfile(process.env.HUD_VIDEO_PROFILE || 'default');
