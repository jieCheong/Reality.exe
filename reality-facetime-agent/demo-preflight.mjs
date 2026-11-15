import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadRoutine } from './routine-contract.mjs';
import { resolveHudVideoProfile } from './hud-video-profile.mjs';

const NODE_PACKAGES = ['@livekit/agents', '@livekit/rtc-node', '@napi-rs/canvas', 'sharp'];
const LIVEKIT_KEYS = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const hasConfiguredValue = (env, key) => typeof env[key] === 'string' &&
  env[key].trim().length > 0 && !env[key].includes('YOUR_');

function packageAvailable(name) {
  try {
    import.meta.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function pythonDependencies(python, env) {
  const source = "import importlib.util,json; print(json.dumps({name: importlib.util.find_spec(name) is not None for name in ('PIL','pydantic','groq')}))";
  const result = spawnSync(python, ['-c', source], {
    encoding: 'utf8',
    timeout: 3000,
    env: { PATH: env.PATH || '/usr/bin:/bin', PYTHONNOUSERSITE: '1' },
  });
  if (result.error || result.status !== 0) return { PIL: false, pydantic: false, groq: false };
  try {
    const parsed = JSON.parse(result.stdout);
    return Object.fromEntries(['PIL', 'pydantic', 'groq'].map(name => [name, parsed[name] === true]));
  } catch {
    return { PIL: false, pydantic: false, groq: false };
  }
}

function probePort(port) {
  return new Promise(resolveResult => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = state => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolveResult({ state });
    };
    const timer = setTimeout(() => finish('unknown'), 750);
    socket.once('connect', () => finish('occupied'));
    socket.once('error', error => finish(error.code === 'ECONNREFUSED' ? 'free' : 'unknown'));
  });
}

function localBridgeOrigin(value) {
  try {
    const url = new URL(value);
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { origin: url.origin, port };
  } catch {
    return null;
  }
}

function supportedNodeVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return major === 24 || major === 26 || (major === 22 && (minor > 23 || (minor === 23 && patch >= 2)));
}

function previewState(routine) {
  return {
    mode: 'routine',
    routineId: routine.id,
    routineName: routine.name,
    theme: routine.theme,
    verificationMode: 'mock',
    phase: 'POWER',
    objective: routine.steps[0].label,
    missionName: routine.steps[0].label,
    missionInstruction: routine.steps[0].label,
    stepIndex: 0,
    currentStep: 1,
    totalSteps: routine.steps.length,
    timeLeftSeconds: routine.timer.startSeconds,
    budgetSeconds: routine.timer.startSeconds,
    uiState: 'in_progress',
    verificationStatus: 'idle',
    routineSteps: routine.steps.map((step, index) => ({
      label: step.label,
      status: index === 0 ? 'active' : 'pending',
    })),
  };
}

export async function inspectDemoPreflight({
  env = process.env,
  routineFile = env.ROUTINE_FILE || 'examples/routines/morning.json',
  profileName = env.HUD_VIDEO_PROFILE || 'routine-game',
  bridgeUrl = env.VISION_SERVICE_URL || 'http://127.0.0.1:8765',
  live = false,
  checkBridge = false,
  fetchImpl = fetch,
  portProbe = probePort,
  moduleCheck = packageAvailable,
  pythonCheck = pythonDependencies,
} = {}) {
  const issues = [];
  const version = process.versions.node;
  const runtimeOk = process.platform === 'linux' && supportedNodeVersion(version);
  if (!runtimeOk) issues.push('unsupported_runtime');

  const visionMode = env.VISION_MODE || 'groq';
  const visionModeOk = ['mock', 'groq'].includes(visionMode);
  if (!visionModeOk) issues.push('invalid_vision_mode');

  let routine = null;
  try {
    routine = await loadRoutine(resolve(routineFile));
  } catch {
    issues.push('invalid_routine');
  }

  let profile = null;
  try {
    profile = resolveHudVideoProfile(profileName);
  } catch {
    issues.push('unknown_hud_profile');
  }

  const nodePackages = Object.fromEntries(NODE_PACKAGES.map(name => [name, moduleCheck(name)]));
  const pythonModules = await pythonCheck(env.VISION_PYTHON || 'python3', env);
  const pythonRequired = ['PIL', 'pydantic', ...(visionMode === 'groq' ? ['groq'] : [])];
  const dependenciesOk = Object.values(nodePackages).every(Boolean) &&
    pythonRequired.every(name => pythonModules[name] === true);
  if (!dependenciesOk) issues.push('missing_dependency');

  let hud = { ok: false, profile: profile?.name ?? null, width: profile?.width ?? null,
    height: profile?.height ?? null, fps: profile?.fps ?? null, rotation: 0, rgbaBytes: null };
  if (profile && routine && nodePackages['@napi-rs/canvas']) {
    try {
      const { renderRoutineFrame } = await import('./routine-game-hud.mjs');
      const frame = renderRoutineFrame(previewState(routine), {
        width: profile.width,
        height: profile.height,
      });
      hud = { ...hud, rgbaBytes: frame.pixels.byteLength,
        ok: frame.pixels.byteLength === profile.width * profile.height * 4 };
    } catch {
      issues.push('hud_render_failed');
    }
  }
  if (!hud.ok && profile && routine) issues.push('invalid_hud_frame');

  const bridge = { requested: checkBridge, state: 'not_checked', provider: null,
    port: null, localOnly: false };
  const bridgeAddress = localBridgeOrigin(bridgeUrl);
  if (!bridgeAddress) {
    bridge.state = 'invalid_local_url';
    issues.push('invalid_vision_bridge_url');
  } else {
    bridge.port = bridgeAddress.port;
    bridge.localOnly = true;
    if (checkBridge) {
      try {
        const response = await fetchImpl(`${bridgeAddress.origin}/health`, {
          redirect: 'error',
          signal: AbortSignal.timeout(1200),
        });
        const body = response.ok ? await response.json() : null;
        const healthy = response.ok && body && body.provider === visionMode;
        bridge.state = healthy ? 'healthy' : 'unhealthy';
        bridge.provider = body?.provider === 'mock' || body?.provider === 'groq' ? body.provider : null;
        if (!healthy) issues.push('vision_bridge_unhealthy');
      } catch {
        bridge.state = 'unreachable';
        issues.push('vision_bridge_unreachable');
      }
    } else {
      const portState = await portProbe(bridgeAddress.port);
      bridge.state = portState.state === 'free' ? 'port_free' :
        portState.state === 'occupied' ? 'unexpectedly_occupied' : 'port_unknown';
      if (bridge.state !== 'port_free') issues.push('vision_bridge_port_not_free');
    }
  }

  const liveCredentials = Object.fromEntries(LIVEKIT_KEYS.map(key => [key, hasConfiguredValue(env, key)]));
  liveCredentials.GROQ_API_KEY = visionMode === 'groq' ? hasConfiguredValue(env, 'GROQ_API_KEY') : null;
  const liveConfigurationOk = env.ENABLE_GAME === 'yes' &&
    LIVEKIT_KEYS.every(key => liveCredentials[key]) &&
    (visionMode !== 'groq' || liveCredentials.GROQ_API_KEY) && visionModeOk;
  if (live && !liveConfigurationOk) issues.push('live_configuration_incomplete');

  return {
    scope: 'LOCAL_FINAL_DEMO_PREFLIGHT',
    ready: issues.length === 0,
    issues,
    runtime: { platform: process.platform, version, executable: process.execPath, supported: runtimeOk },
    configuration: {
      gameEnabled: env.ENABLE_GAME === 'yes',
      routineSelected: Boolean(routineFile),
      visionMode: visionModeOk ? visionMode : 'invalid',
      liveCredentialsPresent: liveCredentials,
      credentialScope: 'Presence only in this process; the bridge process is checked separately.',
      liveConfigurationRequired: live,
      complete: live ? liveConfigurationOk : true,
    },
    routine: routine ? { valid: true, id: routine.id, stepCount: routine.steps.length } : { valid: false },
    hud,
    dependencies: { node: nodePackages, python: pythonModules, requiredPython: pythonRequired },
    bridge,
    sideEffects: { providerRequests: 0, chertStarted: false, faceTimeCalls: 0, portListenerStarted: false },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const { values } = parseArgs({
    options: {
      routine: { type: 'string' },
      profile: { type: 'string' },
      live: { type: 'boolean', default: false },
      'check-bridge': { type: 'boolean', default: false },
    },
  });
  const report = await inspectDemoPreflight({
    routineFile: values.routine,
    profileName: values.profile,
    live: values.live,
    checkBridge: values['check-bridge'],
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
