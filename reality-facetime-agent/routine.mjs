import { readFileSync } from 'node:fs';

/**
 * Kid routine definition, in the team's shared routine format. A parent-made routine can replace
 * the default by pointing ROUTINE_FILE at a JSON file with the same shape.
 *
 * Every step uses a check the vision service already verifies:
 *   SHOW (1 thing, any matching item counts; the words may describe its state, e.g. "folded pajamas"),
 *   HELD_UP / COVERED / HIDDEN (1 object), ON_TOP_OF / LEFT_OF (2: first is top / left),
 *   ORDER_LEFT_TO_RIGHT (2-3).
 * `short` is the checkpoint label on the HUD (max 6 characters, A-Z).
 */
export const DEFAULT_ROUTINE = Object.freeze({
  id: 'morning',
  name: 'Morning Launch',
  steps: [
    { short: 'TEETH', check: 'SHOW', objects: ['toothbrush'], hud: 'SHOW YOUR TOOTHBRUSH',
      say: 'Step one: brush your teeth, then show me your toothbrush.' },
    { short: 'HAIR', check: 'SHOW', objects: ['hairbrush or comb'], hud: 'SHOW YOUR HAIRBRUSH',
      say: 'Step two: brush your hair, then show me your hairbrush or comb.' },
    { short: 'PJS', check: 'SHOW', objects: ['folded pajamas'], hud: 'FOLD YOUR PAJAMAS',
      say: 'Step three: fold your pajamas and hold them up so I can see they are folded.' },
    { short: 'SOCKS', check: 'SHOW', objects: ['socks'], hud: 'SHOW YOUR SOCKS',
      say: 'Step four: put on your socks and show them to the camera.' },
    { short: 'WATER', check: 'SHOW', objects: ['cup of water'], hud: 'DRINK SOME WATER',
      say: 'Step five: get a cup of water and show it to me.' },
    { short: 'FOOD', check: 'SHOW', objects: ['breakfast bowl or plate'], hud: 'SHOW YOUR BREAKFAST',
      say: 'Step six: breakfast time! Show me your breakfast bowl or plate.' },
    { short: 'BAG', check: 'SHOW', objects: ['backpack'], hud: 'GET YOUR BACKPACK',
      say: 'Step seven: grab your backpack and show it to the camera.' },
    { short: 'LUNCH', check: 'ON_TOP_OF', objects: ['lunchbox', 'backpack'], hud: 'LUNCHBOX ON BACKPACK',
      say: 'Step eight: put your lunchbox on top of your backpack, then hold still.' },
    { short: 'SHOES', check: 'HELD_UP', objects: ['shoes'], hud: 'HOLD UP YOUR SHOES',
      say: 'Last step: hold your shoes up to the camera. Then you are ready to launch!' },
  ],
});

const ARITY = { SHOW: [1, 1], HELD_UP: [1, 1], COVERED: [1, 1], HIDDEN: [1, 1], ON_TOP_OF: [2, 2], LEFT_OF: [2, 2],
  ORDER_LEFT_TO_RIGHT: [2, 3] };
const NAME = /^[a-z][a-z -]{0,30}$/;   // same rule the vision bridge applies to SHOW
const SHORT = /^[A-Z]{1,6}$/;

/** Validate and normalize a routine. Throws with a readable message for parents' files. */
export function validateRoutine(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.steps)) throw new Error('Routine needs a steps list');
  if (input.steps.length < 1 || input.steps.length > 9) throw new Error('A routine has 1 to 9 steps');
  const seen = new Set();
  const steps = input.steps.map((s, i) => {
    const n = i + 1;
    if (!ARITY[s.check]) throw new Error(`Step ${n}: unknown check ${s.check}`);
    const [lo, hi] = ARITY[s.check];
    if (!Array.isArray(s.objects) || s.objects.length < lo || s.objects.length > hi) throw new Error(`Step ${n}: ${s.check} takes ${lo === hi ? lo : `${lo}-${hi}`} object(s)`);
    for (const o of s.objects) if (typeof o !== 'string' || !NAME.test(o)) throw new Error(`Step ${n}: object names are short lowercase words`);
    const short = s.short ?? `STEP${n}`;
    if (!SHORT.test(short) || seen.has(short)) throw new Error(`Step ${n}: short label must be unique, A-Z, up to 6 letters`);
    seen.add(short);
    const label = String(s.label ?? s.hud ?? s.say ?? '').trim();
    return Object.freeze({
      short, check: s.check, objects: Object.freeze([...s.objects]),
      hud: String(s.hud ?? label).trim().toUpperCase().slice(0, 60) || short,
      say: String(s.say ?? label).trim().slice(0, 180) || `Next: ${short.toLowerCase()}.`,
    });
  });
  return Object.freeze({ id: String(input.id ?? 'routine'), name: String(input.name ?? 'Routine'), steps: Object.freeze(steps) });
}

export function loadRoutine(path = process.env.ROUTINE_FILE) {
  if (!path) return validateRoutine(DEFAULT_ROUTINE);
  return validateRoutine(JSON.parse(readFileSync(path, 'utf8')));
}

export const ROUTINE = loadRoutine();
/** HUD checkpoints and engine phases, in order. */
export const PHASES = Object.freeze(ROUTINE.steps.map(s => s.short));
export const predicateFor = step => `${step.check}(${step.objects.join(', ')})`;
