import { EventEmitter } from 'node:events';
import { HUD_VIDEO_PROFILE } from './hud-video-profile.mjs';

export const PHASES = ['SCAN', 'POWER', 'SECURITY', 'HIDE', 'FIND', 'PORTAL'];
/** FIND asks for a random everyday object that was not one of the scanned three. */
export const FIND_KINDS = ['pen', 'spoon', 'cup', 'book', 'sock', 'charger', 'remote', 'bottle'];
const article = word => (/^[aeiou]/.test(word) ? 'an' : 'a');

/**
 * Each game picks one variant per mission so replays feel different. Every variant uses a
 * predicate the perception layer already verifies. R = reactor, P = panel, K = access key.
 */
export const VARIANTS = {
  POWER: [
    { pred: ({ R, P }) => `ON_TOP_OF(${R}, ${P})`, hud: ({ R, P }) => `PLACE ${R} ON TOP OF ${P}`,
      say: ({ R, P }) => `Place the ${R} on top of the ${P}, then hold still.` },
    { pred: ({ K, P }) => `ON_TOP_OF(${K}, ${P})`, hud: ({ K, P }) => `LAY ${K} ON ${P}`,
      say: ({ K, P }) => `Bridge the power cell: lay the ${K} on top of the ${P}, then hold still.` },
  ],
  SECURITY: [
    { pred: ({ K }) => `HELD_UP(${K})`, hud: ({ K }) => `HOLD UP ${K}`,
      say: ({ K }) => `Hold the ${K} up in your hand toward the camera, clearly off the desk.` },
    { pred: ({ R }) => `HELD_UP(${R})`, hud: ({ R }) => `HOLD UP ${R}`,
      say: ({ R }) => `The scanner needs a close look. Lift the ${R} off the desk and hold it up to the camera.` },
    { pred: ({ K }) => `COVERED(${K})`, hud: ({ K }) => `PALM SCAN: COVER ${K}`,
      say: ({ K }) => `Hand-print scan: press your palm flat over the ${K} so it is covered, then hold still.` },
  ],
  HIDE: [
    { pred: ({ K }) => `HIDDEN(${K})`, hud: ({ K }) => `HIDE ${K}`,
      say: ({ R, P, K }) => `Engage cloaking: hide the ${K} completely out of sight, but keep the ${R} and ${P} in view. Then hold still.` },
    { pred: ({ R }) => `HIDDEN(${R})`, hud: ({ R }) => `HIDE ${R}`,
      say: ({ R, P, K }) => `Engage cloaking: hide the ${R} completely out of sight, but keep the ${P} and ${K} in view. Then hold still.` },
  ],
};
const PERMUTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
// The landscape HUD only fills the screen when the player's phone is sideways.
const ROTATE_HINT = HUD_VIDEO_PROFILE.name === 'landscape-test' ? 'Turn your phone sideways for the full ship display. ' : '';
const clean = text => String(text || '').replace(/[\x00-\x1f]/g, ' ').slice(0, 180);

/** Deterministic state only. Neither speech nor a raw model YES advances a mission. */
export class MissionEngine extends EventEmitter {
  /** @param {{ random?: () => number }} [options] inject `random` for reproducible games/tests. */
  constructor({ random = Math.random } = {}) {
    super();
    this.random = random;
    this.phase = 'SCAN'; this.revision = 0; this.escaped = false;
    this.catalog = []; this.findKind = FIND_KINDS[0]; this.streak = 0; this.inventoryCandidate = '';
    this.plan = { POWER: 0, SECURITY: 0, HIDE: 0 }; this.order = [0, 1, 2];
    this.usedFrames = new Set();
  }
  resetEvidence() { this.streak = 0; this.inventoryCandidate = ''; }
  pick(n) { return Math.min(n - 1, Math.floor(this.random() * n)); }
  roles() { const [R, P, K] = this.catalog.map(o => o.name); return { R, P, K }; }
  variant() { return VARIANTS[this.phase]?.[this.plan[this.phase]]; }
  portalOrder() { const names = this.catalog.map(o => o.name); return this.order.map(i => names[i]); }
  instruction() {
    const roles = this.roles(), { R, P, K } = roles;
    if (this.escaped) return 'Escape complete. All ship systems verified. Well done, crew!';
    if (this.phase === 'SCAN') return `I am ORBIT, your AI ship guide. ${ROTATE_HINT}Show three distinct desk objects to the camera, then hold still.`;
    if (this.phase === 'FIND') return `Find ${article(this.findKind)} ${this.findKind} anywhere nearby and show it to the camera.`;
    if (this.phase === 'PORTAL') {
      const [x, y, z] = this.portalOrder();
      return `Bring everything back onto the desk. Arrange ${x}, ${y}, and ${z} in that order from the left edge of the camera picture to the right. Then hold still.`;
    }
    const say = this.variant().say(roles);
    return this.phase === 'POWER' ? `The ${R} is our reactor, the ${P} our control panel, and the ${K} our access key. ${say}` : say;
  }
  hudState() {
    const index = PHASES.indexOf(this.phase);
    const objective = this.escaped ? 'ESCAPE COMPLETE'
      : this.phase === 'SCAN' ? 'SHOW 3 OBJECTS'
      : this.phase === 'FIND' ? `SHOW ${article(this.findKind)} ${this.findKind}`
      : this.phase === 'PORTAL' ? `LEFT TO RIGHT: ${this.portalOrder().join(', ')}`
      : this.variant().hud(this.roles());
    return { phase: this.phase, objective, missionProgress: this.escaped ? 1 : index / PHASES.length,
      checkpoints: Object.fromEntries(PHASES.map((p, i) => [p, this.escaped || i < index ? 'complete' : i === index ? 'active' : 'pending'])) };
  }
  request() {
    const predicate = this.phase === 'SCAN' ? undefined
      : this.phase === 'FIND' ? `SHOW(${this.findKind})`
      : this.phase === 'PORTAL' ? `ORDER_LEFT_TO_RIGHT(${this.portalOrder().join(', ')})`
      : this.variant().pred(this.roles());
    return { revision: this.revision, operation: this.phase === 'SCAN' ? 'inventory' : 'verify', catalog: this.catalog,
      ...(predicate ? { predicate } : {}) };
  }
  feedback(hint) {
    this.resetEvidence();
    this.emit('message', clean(hint) || 'I cannot verify that yet. Keep the objects visible and hold still.');
  }
  apply(request, result) {
    if (this.escaped || request.revision !== this.revision || request.operation !== this.request().operation || request.predicate !== this.request().predicate) return false;
    const needed = request.operation === 'inventory' ? 2 : 3;
    if (!Array.isArray(request.frameIds) || request.frameIds.length !== needed || new Set(request.frameIds).size !== needed ||
      request.frameIds.some(id => typeof id !== 'string' || this.usedFrames.has(id))) {
      this.feedback('I need fresh camera frames before checking again.'); return false;
    }
    for (const id of request.frameIds) this.usedFrames.add(id);
    if (result.status !== 'checked') { this.feedback(result.correction_hint); return false; }
    if (this.phase === 'SCAN') {
      const objects = result.objects;
      const valid = Array.isArray(objects) && objects.length === 3 && objects.every(o =>
        typeof o.name === 'string' && /^[a-z0-9][a-z0-9 -]{0,47}$/.test(o.name) &&
        typeof o.description === 'string' && o.description.length > 0 && o.description.length <= 300 &&
        Array.isArray(o.box_2d) && o.box_2d.length === 4 && o.box_2d.every(x => Number.isInteger(x) && x >= 0 && x <= 1000) &&
        o.box_2d[0] < o.box_2d[2] && o.box_2d[1] < o.box_2d[3]);
      if (!valid || new Set(objects?.map(o => o.name)).size !== 3) { this.feedback('Show three distinct objects clearly.'); return false; }
      const sorted = objects.map(o => ({ ...o, box_2d: [...o.box_2d] })).sort((a, b) => a.name.localeCompare(b.name));
      const signature = sorted.map(o => o.name).join('|');
      this.streak = signature === this.inventoryCandidate ? this.streak + 1 : 1;
      this.inventoryCandidate = signature;
      if (this.streak < 2) return false;
      // Prefer a flat support and a small access key, with deterministic fallbacks.
      const panel = sorted.find(o => /\b(notebook|book|pad|box|folder)\b/.test(o.name)) || sorted[1];
      const key = sorted.find(o => o !== panel && /\b(pen|pencil|key|spoon)\b/.test(o.name)) || sorted.filter(o => o !== panel).at(-1);
      const reactor = sorted.find(o => o !== panel && o !== key);
      this.catalog = [reactor, panel, key];
      // Roll this game's variants once, so retries of a mission keep the same task.
      const scanned = this.catalog.map(o => o.name);
      const kinds = FIND_KINDS.filter(kind => !scanned.some(name => name.split(/[ -]/).includes(kind)));
      this.findKind = kinds[this.pick(kinds.length)] || FIND_KINDS[0];
      for (const phase of Object.keys(VARIANTS)) this.plan[phase] = this.pick(VARIANTS[phase].length);
      this.order = PERMUTATIONS[this.pick(PERMUTATIONS.length)];
    } else {
      const verdicts = result.frame_verdicts;
      const yes = Array.isArray(verdicts) ? verdicts.filter(v => v.satisfied === true && Number.isFinite(v.confidence) &&
        v.confidence >= 0.7 && v.confidence <= 1 && !v.error && !v.geometry_override) : [];
      if (result.predicate !== request.predicate || result.satisfied !== true || result.votes_total !== 3 ||
        verdicts?.length !== 3 || result.votes_for !== yes.length || yes.length < 2 ||
        new Set(verdicts.map(v => v.frame_index)).size !== 3 || verdicts.some(v => ![0, 1, 2].includes(v.frame_index))) {
        this.feedback(result.correction_hint); return false;
      }
      if (++this.streak < 2) return false;
    }
    const oldPhase = this.phase;
    if (this.phase === 'PORTAL') this.escaped = true;
    else this.phase = PHASES[PHASES.indexOf(this.phase) + 1];
    this.revision++; this.resetEvidence();
    this.emit('state', this.hudState());
    this.emit('message', this.escaped ? this.instruction() : `${oldPhase.toLowerCase()} verified. ${this.instruction()}`);
    return true;
  }
}

// Opt-in parent-authored routine mode; fixed spaceship missions remain the default.
export { RoutineMissionEngine } from './routine-engine.mjs';
