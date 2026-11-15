import { readFile } from 'node:fs/promises';

const ARITY = { HELD_UP: [1, 1], COVERED: [1, 1], HIDDEN: [1, 1], ON_TOP_OF: [2, 2],
  LEFT_OF: [2, 2], ORDER_LEFT_TO_RIGHT: [2, 3] };
const noun = value => typeof value === 'string' && /^[a-z0-9][a-z0-9 -]{0,47}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value);
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => allowed.includes(key));

/** Shared parent-file contract. No predicates, code or model output can alter it. */
export function validateRoutine(input) {
  if (!keys(input, ['id','name','theme','timer','objects','steps','lives','monsterSeconds']) || !text(input.id, 64) ||
      !text(input.name, 120) || !text(input.theme, 64)) throw new Error('Invalid routine identity/name/theme');
  if (input.lives !== undefined && (!Number.isInteger(input.lives) || input.lives < 1 || input.lives > 9)) throw new Error('Invalid lives');
  if (input.monsterSeconds !== undefined && (!Number.isInteger(input.monsterSeconds) || input.monsterSeconds < 0 || input.monsterSeconds > 300)) throw new Error('Invalid monster window');
  const timerKeys = ['startSeconds','stepDecreaseSeconds','minSeconds','fakeDonePenaltySeconds','missPenaltySeconds'];
  if (!keys(input.timer, timerKeys) || timerKeys.some(key => !Number.isSafeInteger(input.timer[key]) ||
      input.timer[key] < 0 || input.timer[key] > 3600) || input.timer.minSeconds < 1 ||
      input.timer.startSeconds < input.timer.minSeconds) throw new Error('Invalid routine timer');
  if (!Array.isArray(input.objects) || !input.objects.length || input.objects.length > 32 ||
      !input.objects.every(noun) || new Set(input.objects).size !== input.objects.length) throw new Error('Invalid routine objects');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 100) throw new Error('Invalid routine steps');
  const steps = input.steps.map(step => {
    if (!keys(step, ['label','check','objects']) || !text(step.label, 180) || !Object.hasOwn(ARITY, step.check) ||
        !Array.isArray(step.objects)) throw new Error('Invalid routine step');
    const [min,max] = ARITY[step.check];
    if (step.objects.length < min || step.objects.length > max || new Set(step.objects).size !== step.objects.length ||
        !step.objects.every(name => input.objects.includes(name))) throw new Error('Step names unknown objects or has wrong arity');
    return Object.freeze({ label: step.label.trim(), check: step.check, objects: Object.freeze([...step.objects]) });
  });
  return Object.freeze({ id: input.id.trim(), name: input.name.trim(), theme: input.theme.trim(),
    ...(input.lives !== undefined ? { lives: input.lives } : {}),
    ...(input.monsterSeconds !== undefined ? { monsterSeconds: input.monsterSeconds } : {}),
    timer: Object.freeze({ ...input.timer }), objects: Object.freeze([...input.objects]), steps: Object.freeze(steps) });
}

/** Explicit compatibility gate for the installed Part B, not a fake HIDDEN verdict. */
export function assertRoutineCapabilities(routine) {
  if (routine.objects.length > 3) throw new Error('Installed Part B supports at most three routine objects; coordinate larger inventories with Shivam');
  if (routine.steps.some(step => step.check === 'HIDDEN')) throw new Error('HIDDEN is in the shared contract but not implemented by installed Part B');
  return routine;
}

export async function loadRoutine(file) {
  const bytes = await readFile(file);
  if (bytes.byteLength > 64000) throw new Error('Routine file exceeds 64 KB');
  let input;
  try { input = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Routine file must contain valid JSON'); }
  return assertRoutineCapabilities(validateRoutine(input));
}
