/** Geometry-only A/B profile; never changes room, voice, codec or track selection.
 *  rotated-ccw / rotated-cw: the portrait HUD is drawn natively at 540x960, then turned a quarter turn into a
 *  960x540 frame. FaceTime via Chert shows our landscape frame turned 90 degrees on a portrait phone, so the
 *  pre-rotation makes the HUD come out upright and full-screen. Which direction is right is a real-call test. */
const PROFILES = ['default', 'juan-original', 'landscape-test', 'rotated-ccw', 'rotated-cw'];
export function resolveHudVideoProfile(name = 'default') {
  if (!PROFILES.includes(name)) throw new Error(`HUD_VIDEO_PROFILE must be one of ${PROFILES.join(', ')}`);
  if (name === 'landscape-test') return Object.freeze({ name, width: 640, height: 360, fps: 15 });
  if (name.startsWith('rotated-')) return Object.freeze({ name, width: 960, height: 540, fps: 15,
    rotate: name.slice(8), layoutWidth: 540, layoutHeight: 960 });
  return Object.freeze({ name, width: 540, height: name === 'juan-original' ? 1170 : 960, fps: 15 });
}
export const HUD_VIDEO_PROFILE = resolveHudVideoProfile(process.env.HUD_VIDEO_PROFILE || 'default');
