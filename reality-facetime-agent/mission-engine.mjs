import { EventEmitter } from 'node:events';
import { HUD_VIDEO_PROFILE } from './hud-video-profile.mjs';

export const PHASES = ['SCAN', 'POWER', 'SECURITY', 'HIDE', 'FIND', 'PORTAL'];
/** FIND asks for a generic everyday object; the first kind not already scanned is used. */
export const FIND_KINDS = ['pen', 'spoon', 'cup', 'book', 'key', 'phone'];
const article = word => (/^[aeiou]/.test(word) ? 'an' : 'a');
// The landscape HUD only fills the screen when the player's phone is sideways.
const ROTATE_HINT = HUD_VIDEO_PROFILE.name === 'landscape-test' ? 'Turn your phone sideways for the full ship display. ' : '';
const clean = text => String(text || '').replace(/[\x00-\x1f]/g, ' ').slice(0, 180);

/** Deterministic state only. Neither speech nor a raw model YES advances a mission. */
export class MissionEngine extends EventEmitter {
  constructor() {
    super();
    this.phase = 'SCAN'; this.revision = 0; this.escaped = false;
    this.catalog = []; this.findKind = FIND_KINDS[0]; this.streak = 0; this.inventoryCandidate = '';
    this.usedFrames = new Set();
  }
  resetEvidence() { this.streak = 0; this.inventoryCandidate = ''; }
  instruction() {
    const [reactor, panel, key] = this.catalog.map(o => o.name);
    if (this.escaped) return 'Escape complete. All ship systems verified. Well done, crew!';
    return {
      SCAN: `I am ORBIT, your AI ship guide. ${ROTATE_HINT}Show three distinct desk objects to the camera, then hold still.`,
      POWER: `The ${reactor} is our reactor, the ${panel} our control panel, and the ${key} our access key. Place the ${reactor} on top of the ${panel}, then hold still.`,
      SECURITY: `Hold the ${key} up in your hand toward the camera, clearly off the desk.`,
      HIDE: `Hide the ${key} completely out of sight, but keep the ${reactor} and ${panel} in view. Then hold still.`,
      FIND: `Find ${article(this.findKind)} ${this.findKind} anywhere nearby and show it to the camera.`,
      PORTAL: `Bring the ${key} back. Arrange ${reactor}, ${panel}, and ${key} in that order from the left edge of the camera picture to the right. Then hold still.`,
    }[this.phase];
  }
  hudState() {
    const index = PHASES.indexOf(this.phase);
    const [a, b, c] = this.catalog.map(o => o.name);
    const objective = this.escaped ? 'ESCAPE COMPLETE' : {
      SCAN: 'SHOW 3 OBJECTS', POWER: `PLACE ${a} ON TOP OF ${b}`,
      SECURITY: `HOLD UP ${c}`, HIDE: `HIDE ${c}`, FIND: `SHOW ${article(this.findKind)} ${this.findKind}`,
      PORTAL: `LEFT TO RIGHT: ${a}, ${b}, ${c}`,
    }[this.phase];
    return { phase: this.phase, objective, missionProgress: this.escaped ? 1 : index / PHASES.length,
      checkpoints: Object.fromEntries(PHASES.map((p, i) => [p, this.escaped || i < index ? 'complete' : i === index ? 'active' : 'pending'])) };
  }
  request() {
    const [a, b, c] = this.catalog.map(o => o.name);
    const predicate = { POWER: `ON_TOP_OF(${a}, ${b})`, SECURITY: `HELD_UP(${c})`, HIDE: `HIDDEN(${c})`,
      FIND: `SHOW(${this.findKind})`, PORTAL: `ORDER_LEFT_TO_RIGHT(${a}, ${b}, ${c})` }[this.phase];
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
      const scanned = this.catalog.map(o => o.name);
      this.findKind = FIND_KINDS.find(kind => !scanned.some(name => name.split(/[ -]/).includes(kind))) || FIND_KINDS[0];
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
