import { readFile } from 'node:fs/promises';

// SHOW(x): any item matching the short description x is shown (e.g. "folded pajamas"); added for kid routines.
// DOING(x): the child is visibly doing action x (e.g. "brushing their teeth"); x is an action, not a routine object.
const ARITY = { SHOW: [1, 1], DOING: [1, 1], HELD_UP: [1, 1], COVERED: [1, 1], HIDDEN: [1, 1], ON_TOP_OF: [2, 2],
  LEFT_OF: [2, 2], ORDER_LEFT_TO_RIGHT: [2, 3] };
const noun = value => typeof value === 'string' && /^[a-z0-9][a-z0-9 -]{0,47}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value);
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));

/** Shared parent-file contract. No predicates, code or model output can alter it. */
export function validateRoutine(input) {
  if (!keys(input, ['id','name','theme','timer','objects','steps','lives','monsterSeconds','greeting']) || !text(input.id, 64) ||
      !text(input.name, 120) || !text(input.theme, 64)) throw new Error('Invalid routine identity/name/theme');
  const timerKeys = ['startSeconds','stepDecreaseSeconds','minSeconds','fakeDonePenaltySeconds','missPenaltySeconds'];
  if (!keys(input.timer, timerKeys) || timerKeys.some(key => !Number.isSafeInteger(input.timer[key]) ||
      input.timer[key] < 0 || input.timer[key] > 3600) || input.timer.minSeconds < 1 ||
      input.timer.startSeconds < input.timer.minSeconds) throw new Error('Invalid routine timer');
  // lives: timeouts allowed before the mission fails (default 3). monsterSeconds: the monster shows up
  // when this many seconds are left on a step (default 25, 0 = no monster). greeting: which greeting
  // ("good morning" / "good night") starts this routine when both are installed.
  const lives = input.lives ?? 3, monsterSeconds = input.monsterSeconds ?? 25;
  if (!Number.isSafeInteger(lives) || lives < 1 || lives > 9) throw new Error('Invalid routine lives (1-9)');
  if (!Number.isSafeInteger(monsterSeconds) || monsterSeconds < 0 || monsterSeconds > 300) throw new Error('Invalid routine monsterSeconds (0-300)');
  if (input.greeting !== undefined && !['morning','night'].includes(input.greeting)) throw new Error('Invalid routine greeting (morning or night)');
  if (!Array.isArray(input.objects) || (!input.objects.length && !input.steps?.every?.(step => step?.check === 'DOING')) || input.objects.length > 32 ||
      !input.objects.every(noun) || new Set(input.objects).size !== input.objects.length) throw new Error('Invalid routine objects');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 100) throw new Error('Invalid routine steps');
  const shorts = new Set();
  const steps = input.steps.map(step => {
    if (!keys(step, ['label','check','objects','short','seconds']) || !text(step.label, 180) || !Object.hasOwn(ARITY, step.check) ||
        !Array.isArray(step.objects)) throw new Error('Invalid routine step');
    // Optional HUD checkpoint label: A-Z, up to 6 letters, unique.
    if (step.short !== undefined && (typeof step.short !== 'string' || !/^[A-Z]{1,6}$/.test(step.short) || shorts.has(step.short)))
      throw new Error('Invalid routine step short label');
    if (step.short !== undefined) shorts.add(step.short);
    // Optional per-step time allowance; otherwise the routine timer formula decides.
    if (step.seconds !== undefined && (!Number.isSafeInteger(step.seconds) || step.seconds < 10 || step.seconds > 900))
      throw new Error('Invalid routine step seconds (10-900)');
    const [min,max] = ARITY[step.check];
    if (step.objects.length < min || step.objects.length > max || new Set(step.objects).size !== step.objects.length ||
        !step.objects.every(name => step.check === 'DOING' ? noun(name) : input.objects.includes(name)))
      throw new Error('Step names unknown objects or has wrong arity');
    return Object.freeze({ label: step.label.trim(), check: step.check, objects: Object.freeze([...step.objects]),
      ...(step.short !== undefined ? { short: step.short } : {}), ...(step.seconds !== undefined ? { seconds: step.seconds } : {}) });
  });
  return Object.freeze({ id: input.id.trim(), name: input.name.trim(), theme: input.theme.trim(), lives, monsterSeconds,
    ...(input.greeting !== undefined ? { greeting: input.greeting } : {}),
    timer: Object.freeze({ ...input.timer }), objects: Object.freeze([...input.objects]), steps: Object.freeze(steps) });
}

/** Explicit compatibility gate for the installed Part B, not a fake HIDDEN verdict. */
export function assertRoutineCapabilities(routine) {
  // Up to 3 objects: one opening scan names them all. More than 3: no scan; each step sends only its own
  // objects (the bridge accepts at most 3 per check, and every check names 1-3).
  if (routine.steps.some(step => step.check === 'HIDDEN')) throw new Error('HIDDEN is in the shared contract but not implemented by installed Part B');
  // The vision bridge accepts a SHOW description of lowercase letters, spaces and hyphens, up to 31 characters.
  if (routine.steps.some(step => ['SHOW','DOING'].includes(step.check) && !/^[a-z][a-z -]{0,30}$/.test(step.objects[0])))
    throw new Error('SHOW items and DOING actions must be short lowercase descriptions (letters, spaces, hyphens; up to 31 characters)');
  return routine;
}

/** True when the routine starts with one scan of all its objects (Jie's original flow). */
// SHOW and DOING steps are found when their step comes up (a toothbrush, a lunchbox, an action), so routines
// that use them never open with a desk scan.
export const scansFirst = routine => routine.objects.length > 0 && routine.objects.length <= 3 &&
  !routine.steps.some(step => ['SHOW','DOING'].includes(step.check));

export async function loadRoutine(file) {
  const bytes = await readFile(file);
  if (bytes.byteLength > 64000) throw new Error('Routine file exceeds 64 KB');
  let input;
  try { input = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Routine file must contain valid JSON'); }
  return assertRoutineCapabilities(validateRoutine(input));
}
