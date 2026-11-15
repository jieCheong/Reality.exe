import { measureRgbaContent } from './video-geometry.mjs';
import { HUD_VIDEO_PROFILE } from './hud-video-profile.mjs';
import { drawDiagnostic } from './hud-diagnostic.mjs';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoRotation, VideoSource } from '@livekit/rtc-node';
import { drawFace, normalizeGameState, FPS, HEIGHT, WIDTH } from './spaceship-face.mjs';

/** Existing Part A entry point, now rendering Juan's adapted spaceship HUD. */
export function drawHud(tick, { reactor = 'offline', speaking = false, gameState = undefined } = {}) {
  if (!['offline', 'online'].includes(reactor)) throw new Error('reactor must be offline or online');
  return drawFace(tick, speaking, gameState ?? { phase: reactor === 'online' ? 'POWER' : 'SCAN' });
}

/** One camera publisher on the SAME participant as the starter's voice. */
export async function publishHud(localParticipant, {
  fps = FPS,
  diagnosticPattern = false,
  trackName = 'agent-video',
  source = new VideoSource(WIDTH, HEIGHT),
  createTrack = s => LocalVideoTrack.createVideoTrack(trackName, s),
  createFrame = pixels => new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA),
  onError = () => {},
} = {}) {
  if (source.width !== undefined && (source.width !== WIDTH || source.height !== HEIGHT)) throw new Error('HUD source must match selected portrait/landscape renderer dimensions');
  const track = createTrack(source);
  let sourceGeometry;
  let tick = 0, closed = false, timer, publication;
  /** @type {import('./part-a-types.js').HudState} */
  let state = { reactor: 'offline', speaking: false };
  const render = () => {
    if (!closed) {
      const pixels = diagnosticPattern ? drawDiagnostic(tick++, state) : drawHud(tick++, state);
      if (pixels.byteLength !== WIDTH * HEIGHT * 4) throw new Error('Invalid HUD RGBA buffer size');
      const frame = createFrame(pixels);
      if (frame.width !== undefined && (frame.width !== WIDTH || frame.height !== HEIGHT)) throw new Error('HUD VideoFrame geometry differs from renderer');
      if (!sourceGeometry) {
        sourceGeometry = { rendererWidth: WIDTH, rendererHeight: HEIGHT, rgbaBytes: pixels.byteLength,
          sourceWidth: source.width ?? null, sourceHeight: source.height ?? null,
          frameWidth: frame.width ?? null, frameHeight: frame.height ?? null,
          ...measureRgbaContent(pixels, WIDTH, HEIGHT) };
        console.log('[hud-source-geometry]', JSON.stringify(sourceGeometry));
      }
      source.captureFrame(frame, undefined, VideoRotation.VIDEO_ROTATION_0);
    }
  };
  try {
    render();
    publication = await localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    console.log('[hud-video-format]', JSON.stringify({ profile: HUD_VIDEO_PROFILE.name, width: WIDTH, height: HEIGHT, fps, rotation: 0, pixelFormat: 'RGBA', source: 'camera', publishedWidth: publication.width ?? null, publishedHeight: publication.height ?? null,
      layoutWidth: WIDTH, layoutHeight: HEIGHT, scaling: 'none',
      receiverViewportWidth: null, receiverViewportHeight: null }));
    timer = setInterval(() => { try { render(); } catch (error) { clearInterval(timer); onError(error); } }, 1000 / fps);
  } catch (error) { await track.close(); await source.close(); throw error; }
  let closing;
  return {
    publication,
    setState(update) {
      if (closed) return;
      if (update.reactor !== undefined && !['offline', 'online'].includes(update.reactor)) throw new Error('Invalid reactor state');
      // Validate and copy the display snapshot, so outside mutation cannot alter a frame.
      const gameState = update.gameState === undefined ? state.gameState : normalizeGameState(update.gameState);
      state = { ...state, ...update, gameState };
    },
    render,
    close() {
      if (closing) return closing;
      closed = true;
      clearInterval(timer);
      closing = (async () => {
        try { if (publication.sid) await localParticipant.unpublishTrack(publication.sid); }
        finally { try { await track.close(); } finally { await source.close(); } }
      })();
      return closing;
    },
  };
}
