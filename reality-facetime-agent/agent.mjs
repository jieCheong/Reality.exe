import { fileURLToPath } from 'node:url';
import { AutoSubscribe, cli, defineAgent, ServerOptions, voice } from '@livekit/agents';
import { createVoiceOptions, requireFreeBuild } from './voice-stack.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { observeCall } from './call-observer.mjs';
import { CallerVideoAdapter } from './caller-video.mjs';
import { FrameSampler } from './frame-sampler.mjs';
import { publishHud } from './hud-video.mjs';
import { join } from 'node:path';

// Change these instructions to build your own agent. Keep replies conversational.
const instructions = `You are a friendly AI study partner on a FaceTime video call.
The caller sees a simple animated face while you talk.
Help the caller understand a topic by asking one question at a time.
Keep each reply to one or two short sentences. Be clear that you are an AI.`;
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Hi! I am your AI study partner. What would you like to learn?';

export default defineAgent({
  entry: async ctx => {
    requireFreeBuild();
    // Register before room join: Chert may publish its tracks later in a warm room.
    const callerVideo = new CallerVideoAdapter(ctx.room);
    callerVideo.start();
    callerVideo.on('status', status => console.log('[caller-video]', JSON.stringify(status)));
    const sampler = process.env.DEBUG_CALLER_FRAMES === 'yes'
      ? new FrameSampler(join('.local', 'frames', `${Date.now()}-${ctx.job.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`)) : null;
    if (sampler) callerVideo.on('frame', frame => {
      void sampler.offer(frame, () => callerVideo.isCurrent(frame)).then(saved => {
        if (saved) console.log('[caller-frame-saved]', JSON.stringify(saved));
      }).catch(() => console.error('[caller-video] JPEG save failed'));
    });
    ctx.addShutdownCallback(async () => { await callerVideo.close(); await sampler?.close(); });
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    callerVideo.scan();
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    const caller = await ctx.waitForParticipant();

    // Video: one camera track, published by this agent. The Mac shows video only
    // from the participant that speaks, so the picture and the voice stay together.
    const hud = await publishHud(ctx.room.localParticipant, {
      onError: () => console.error('[hud-video] frame publication failed'),
    });
    ctx.addShutdownCallback(async () => { await hud.close(); });

    const session = new voice.AgentSession(createVoiceOptions());
    observeCall(session, ctx.job.id);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, event => { hud.setState({ speaking: event.newState === 'speaking' }); });
    ctx.addShutdownCallback(async () => {
      await session.close();
    });
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => {
      // TTS only: do not wait for an LLM round trip to meet Chert's deadline.
      session.say(greeting);
    });
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: process.env.AGENT_NAME || 'video-agent',
}));
