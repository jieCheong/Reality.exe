import { fileURLToPath } from 'node:url';
import { AutoSubscribe, cli, defineAgent, ServerOptions, voice } from '@livekit/agents';
import { createVoiceOptions, requireFreeBuild } from './voice-stack.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { observeCall } from './call-observer.mjs';
import { CallerVideoAdapter } from './caller-video.mjs';
import { FrameSampler } from './frame-sampler.mjs';
import { publishHud } from './hud-video.mjs';
import { join } from 'node:path';
import { GameRuntime } from './game-runtime.mjs';
import { VisionClient } from './vision-client.mjs';
import { SpeechCoordinator, sessionSpeechOutput } from './speech-coordinator.mjs';
import { ThemeSelection } from './theme-selection.mjs';
import { THEMES } from './themes.mjs';
import { selectGameThemes } from './game-test-config.mjs';
import { loadRoutine } from './routine-contract.mjs';
import { RoutineSession } from './routine-session.mjs';
import { routineReportWriter } from './routine-report.mjs';
import { diagnostic } from './diagnostics.mjs';

const gameEnabled = process.env.ENABLE_GAME === 'yes';
// Validate parent input and installed verifier capabilities before worker registration.
const routine = gameEnabled && process.env.ROUTINE_FILE ? await loadRoutine(process.env.ROUTINE_FILE) : null;
class OrbitAgent extends voice.Agent {
  // Game mode uses scripted TTS. Free-form LLM replies cannot announce an unverified win.
  async onUserTurnCompleted() { throw new voice.StopResponse(); }
}

// Speech-only mode retains ORBIT's identity without starting mission progression.
const instructions = `You are ORBIT, Reality.exe's spaceship AI, speaking on a FaceTime video call.
The caller sees the ship HUD while you talk. Be welcoming, calm, and concise.
This is a voice connection test; gameplay is not active. If asked to start a mission,
explain that the host must enable gameplay first. Do not invent themes, claim to
see the caller's surroundings, or announce verified actions or mission progress.
Keep each reply to one or two short sentences. Be clear that you are an AI.`;
// Greet only after the existing Chert bridge-ready signal.
const greeting = 'Hello, crew. I am ORBIT, the spaceship AI for Reality.exe. Voice link online. Can you hear me?';

export default defineAgent({
  entry: async ctx => {
    requireFreeBuild();
    // Register before room join: Chert may publish its tracks later in a warm room.
    const callerVideo = new CallerVideoAdapter(ctx.room);
    callerVideo.start();
    callerVideo.on('status', status => diagnostic('camera_status', { state: status.state }));
    let delivered = 0;
    callerVideo.on('frame', frame => {
      if (++delivered === 1 || delivered % 25 === 0) diagnostic('camera_delivery', { frames: delivered, generation: frame.generation });
    });
    const sampler = !routine && process.env.DEBUG_CALLER_FRAMES === 'yes'
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
      diagnosticPattern: process.env.HUD_VIDEO_DIAGNOSTIC === 'yes',
      onError: () => console.error('[hud-video] frame publication failed'),
    });
    ctx.addShutdownCallback(async () => { await hud.close(); });

    const voiceOptions = createVoiceOptions();
    // Retain STT during scripted speech for explicit stop/wait commands; no automatic barge-in.
    if (gameEnabled) voiceOptions.turnHandling.interruption.discardAudioIfUninterruptible = false;
    const session = new voice.AgentSession(voiceOptions);
    observeCall(session, ctx.job.id);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, event => { hud.setState({ speaking: event.newState === 'speaking' }); });
    ctx.addShutdownCallback(async () => {
      await session.close();
      await voiceOptions.tts.close();
    });
    await session.start({
      room: ctx.room,
      agent: gameEnabled ? new OrbitAgent({ instructions: 'You are ORBIT. The deterministic mission engine owns all instructions and verification.' }) : new voice.Agent({ instructions }),
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
    const speech = gameEnabled ? new SpeechCoordinator(sessionSpeechOutput(session)) : null;
    const game = gameEnabled ? new GameRuntime({
      callerVideo, hud, routine,
      onReport: routineReportWriter(join('.local', 'routine-reports', ctx.job.id.replace(/[^a-zA-Z0-9_-]/g, '_'))),
      say: (text, options) => speech.say(text, options),
      vision: new VisionClient({ url: process.env.VISION_SERVICE_URL || 'http://127.0.0.1:8765', allowMock: process.env.VISION_MODE === 'mock' }),
    }) : null;
    const selection = game ? (routine ? new RoutineSession({ game, speech }) : new ThemeSelection({ themes: selectGameThemes(THEMES), speech, game })) : null;
    if (game) {
      const onTranscript = event => {
        void selection.handleTranscript(event).catch(() => { game.pause(); });
      };
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, onTranscript);
      ctx.addShutdownCallback(async () => {
        session.off(voice.AgentSessionEventTypes.UserInputTranscribed, onTranscript);
        await selection.close();
      });
    }
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => {
      // TTS only: do not wait for an LLM round trip to meet Chert's deadline.
      if (selection) void selection.start();
      else session.say(greeting);
    });
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: process.env.AGENT_NAME || 'video-agent',
}));
