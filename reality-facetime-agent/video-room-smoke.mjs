import { measureRgbaContent } from './video-geometry.mjs';
// Generated video only. No AgentSession, inference, Chert connector, or real call.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { join } from 'node:path';
import { Room, VideoFrame, VideoBufferType, dispose } from '@livekit/rtc-node';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { CallerVideoAdapter } from './caller-video.mjs';
import { FrameSampler } from './frame-sampler.mjs';
import { WIDTH, HEIGHT, STATUS_STRIPE_Y } from './spaceship-face.mjs';
import { publishHud } from './hud-video.mjs';

if (process.env.LIVEKIT_FREE_BUILD_CONFIRMED !== 'yes') throw new Error('Confirm the existing free Build plan before this transport-only room test.');
const url = process.env.LIVEKIT_URL;
const key = process.env.LIVEKIT_API_KEY;
const secret = process.env.LIVEKIT_API_SECRET;
if (!url || !key || !secret) throw new Error('Missing LiveKit configuration');
const roomName = `reality-video-smoke-${randomUUID()}`;
const api = new RoomServiceClient(url.replace(/^wss:/, 'https:'), key, secret);
const sender = new Room(), receiver = new Room();
const adapter = new CallerVideoAdapter(receiver, { sampleIntervalMs: 100 });
const directory = join('.local', 'synthetic-video', roomName);
const sampler = new FrameSampler(directory, { minIntervalMs: 250 });
const states = new Set();
const diagnosticPattern = process.env.HUD_VIDEO_DIAGNOSTIC === 'yes';
let localSaved = false;
let received = 0, hud, toggle, created = false, saveError, receivedWidth, receivedHeight;
adapter.on('frame', frame => {
  received++; receivedWidth = frame.width; receivedHeight = frame.height;
  if (received === 1) console.log('[hud-remote-geometry]', JSON.stringify({
    width: frame.width, height: frame.height, rotation: frame.rotation,
    ...measureRgbaContent(frame.data, frame.width, frame.height),
  }));
  // WebRTC may align encoded dimensions (1170 source decoded as 1168 in this run).
  assert.ok(Math.abs(frame.width - WIDTH) <= 4 && Math.abs(frame.height - HEIGHT) <= 4, 'Unexpected remote size change beyond codec alignment');
  assert.equal(frame.height > frame.width, HEIGHT > WIDTH, 'Received frame orientation must match selected profile');
  assert.equal(frame.rotation, 0);
  const i = (Math.round((STATUS_STRIPE_Y + 2) * frame.height / HEIGHT) * frame.width + Math.floor(frame.width / 2)) * 4;
  // Classify the broad colored HUD stripe after lossy WebRTC video encoding.
  states.add(frame.data[i + 1] > frame.data[i] ? 'online' : 'offline');
  void sampler.offer(frame, () => adapter.isCurrent(frame)).catch(error => { saveError = error; });
});
adapter.start();
const token = async (identity, publish) => {
  const access = new AccessToken(key, secret, { identity, ttl: '5m' });
  access.addGrant({ roomJoin: true, room: roomName, canPublish: publish, canSubscribe: true });
  return access.toJwt();
};

try {
  await api.createRoom({ name: roomName, emptyTimeout: 30, maxParticipants: 2 });
  created = true;
  await receiver.connect(url, await token('synthetic-receiver', false), { autoSubscribe: false, dynacast: false });
  adapter.scan();
  await sender.connect(url, await token(`chert-bridge-synthetic-${randomUUID()}`, true), { autoSubscribe: false, dynacast: false });
  await mkdir(directory, { recursive: true });
  hud = await publishHud(sender.localParticipant, { diagnosticPattern, trackName: 'facetime-remote-video',
    createFrame: pixels => {
      const frame = new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA);
      assert.deepEqual(frame.data, pixels, 'SDK frame must contain exactly the rendered pixels');
      if (!localSaved) { localSaved = true;
        void sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).png().toFile(join(directory, 'submitted-local.png')).catch(error => { saveError = error; });
      }
      return frame;
    },
  });
  let online = false;
  toggle = setInterval(() => { online = !online; hud.setState({ reactor: online ? 'online' : 'offline' }); }, 800);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && (!states.has('online') || !states.has('offline') || sampler.saved.length < 5)) {
    if (saveError) throw saveError;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const publishedVideo = [...receiver.remoteParticipants.values()].flatMap(p => [...p.trackPublications.values()]).find(p => p.name === 'facetime-remote-video');
  assert.ok(publishedVideo?.width && publishedVideo?.height, 'Remote publication must have dimensions');
  assert.equal(publishedVideo.height > publishedVideo.width, HEIGHT > WIDTH, 'Remote publication orientation must match selected profile');
  assert.ok(states.has('online') && states.has('offline'), 'Must receive BOTH HUD states remotely');
  assert.equal(sampler.saved.length, 5, 'Must save five distinct generated camera JPEGs');
  assert.equal(new Set(sampler.saved.map(item => item.sha256)).size, 5);
  console.log(JSON.stringify({ result: 'PASS', scope: 'LIVEKIT_TRANSPORT_ONLY_SYNTHETIC',
    receivedWidth, receivedHeight,
    publishedWidth: publishedVideo.width, publishedHeight: publishedVideo.height, rotation: 0,
    received, states: [...states], saved: sampler.saved.length, directory,
    inferenceRequests: 0, chertCalls: 0 }));
} finally {
  clearInterval(toggle);
  await adapter.close();
  await sampler.close();
  try { await hud?.close(); } finally {
    await Promise.allSettled([sender.disconnect(), receiver.disconnect()]);
    try { if (created) await api.deleteRoom(roomName); } finally { dispose(); }
  }
}
