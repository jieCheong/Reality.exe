import { loadRoutine } from './routine-contract.mjs';
// Local only: never constructs providers or contacts any service.
import { requireFreeBuild } from './voice-stack.mjs';
import { selectGameThemes } from './game-test-config.mjs';
import { validateThemes } from './theme-selection.mjs';
import { THEMES } from './themes.mjs';
const env = process.env;
const configured = key => Boolean(env[key] && !env[key].includes('YOUR_'));
const checks = Object.fromEntries(['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','AGENT_NAME'].map(key => [key, configured(key)]));
try { requireFreeBuild(env); checks.livekitGuard = true; } catch { checks.livekitGuard = false; }
checks.gameEnabled = env.ENABLE_GAME === 'yes';
checks.testCatalog = env.GAME_TEST_MODE === 'yes';
try { validateThemes(selectGameThemes(THEMES, env)); checks.themeCatalogReady = true; } catch { checks.themeCatalogReady = false; }
checks.routineSelected = Boolean(env.ROUTINE_FILE);
checks.routineReady = false;
if (checks.routineSelected) { try { await loadRoutine(env.ROUTINE_FILE); checks.routineReady = true; } catch { /* never print parent file contents */ } }
checks.gameSessionReady = checks.routineSelected ? checks.routineReady : checks.themeCatalogReady;
checks.elevenlabsSelected = env.TTS_PROVIDER === 'elevenlabs';
checks.elevenlabsApproved = env.ELEVENLABS_REQUESTS_APPROVED === 'yes';
checks.elevenlabsCredentials = configured('ELEVEN_API_KEY') && configured('ELEVEN_VOICE_ID');
checks.livekitFallback = (env.TTS_FALLBACK_PROVIDER || 'livekit') === 'livekit';
checks.realVisionSelected = env.VISION_MODE === 'groq';
console.log(JSON.stringify({ scope: 'LOCAL_CONFIG_ONLY', checks,
  note: 'No account, balance, model access, Python key, Chert authentication or live connection verified.' }, null, 2));
