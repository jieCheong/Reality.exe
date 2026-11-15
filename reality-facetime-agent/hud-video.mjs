import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';

// Tiny bitmap lettering keeps rendering local and independent of fonts/browsers.
const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  N: ['10001','11001','11001','10101','10011','10011','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
};

export function drawHud(tick, { reactor = 'offline', speaking = false } = {}) {
  if (!['offline', 'online'].includes(reactor)) throw new Error('reactor must be offline or online');
  const pixels = drawFace(tick, speaking);
  const color = reactor === 'online' ? [120, 245, 165] : [255, 165, 110];
  const rect = (x, y, w, h, rgb) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const offset = (j * WIDTH + i) * 4;
      pixels.set([...rgb, 255], offset);
    }
  };
  rect(0, 0, WIDTH, 55, [10, 22, 30]);
  const text = `REACTOR ${reactor.toUpperCase()}`;
  const scale = 3;
  let x = Math.floor((WIDTH - text.length * 6 * scale) / 2);
  for (const char of text) {
    const glyph = FONT[char];
    if (glyph) for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (glyph[row][col] === '1') rect(x + col * scale, 16 + row * scale, scale, scale, color);
    }
    x += 6 * scale;
  }
  rect(0, 51, WIDTH, 4, color);
  return pixels;
}

/** One camera publisher on the SAME participant as the starter's voice. */
export async function publishHud(localParticipant, {
  fps = FPS,
  trackName = 'agent-video',
  source = new VideoSource(WIDTH, HEIGHT),
  createTrack = s => LocalVideoTrack.createVideoTrack(trackName, s),
  createFrame = pixels => new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA),
  onError = () => {},
} = {}) {
  const track = createTrack(source);
  let tick = 0, closed = false, timer, publication;
  let state = { reactor: 'offline', speaking: false };
  const render = () => {
    if (!closed) source.captureFrame(createFrame(drawHud(tick++, state)));
  };
  try {
    render();
    publication = await localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    timer = setInterval(() => { try { render(); } catch (error) { clearInterval(timer); onError(error); } }, 1000 / fps);
  } catch (error) { await track.close(); await source.close(); throw error; }
  let closing;
  return {
    publication,
    setState(update) {
      if (closed) return;
      if (update.reactor !== undefined && !['offline', 'online'].includes(update.reactor)) throw new Error('Invalid reactor state');
      state = { ...state, ...update };
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
