import { PHASES } from './mission-engine.mjs';
const normalize = text => String(text).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const numbers = [['1','one','first'], ['2','two','second'], ['3','three','third']];

export function validateThemes(themes) {
  if (!Array.isArray(themes) || themes.length !== 3) throw new Error('Exactly three final themes must be configured');
  const ids = new Set(), names = new Map();
  return themes.map((theme, index) => {
    if (!theme || typeof theme.id !== 'string' || !/^[a-z0-9-]{1,48}$/.test(theme.id) || ids.has(theme.id)) throw new Error('Invalid or duplicate theme ID');
    if (typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 48) throw new Error('Invalid theme name');
    ids.add(theme.id);
    if (theme.aliases !== undefined && (!Array.isArray(theme.aliases) || theme.aliases.length > 8)) throw new Error('Invalid theme aliases');
    const aliases = [...numbers[index], theme.name, ...(theme.aliases || [])].map(value => {
      if (typeof value !== 'string' || value.length > 48 || !normalize(value)) throw new Error('Invalid theme alias');
      return normalize(value);
    });
    for (const alias of aliases) {
      if (names.has(alias) && names.get(alias) !== index || numbers.some((group, i) => i !== index && group.includes(alias))) throw new Error('Ambiguous theme alias');
      names.set(alias, index);
    }
    if (theme.intro !== undefined && (typeof theme.intro !== 'string' || theme.intro.length > 240)) throw new Error('Theme intro too long');
    const missionIntros = { ...(theme.missionIntros || {}) };
    for (const [phase, text] of Object.entries(missionIntros)) {
      if (!PHASES.includes(phase) || typeof text !== 'string' || text.length > 160) throw new Error('Invalid mission introduction');
    }
    return Object.freeze({ id: theme.id, name: theme.name.trim(), aliases: Object.freeze([...new Set(aliases)]),
      intro: theme.intro || '', missionIntros: Object.freeze(missionIntros) });
  });
}

export function matchTheme(text, themes) {
  const choice = normalize(text).replace(/^(i choose |i pick |choose |pick |option |theme |lets play )/, '');
  const matches = themes.filter(theme => theme.aliases.includes(choice));
  return matches.length === 1 ? matches[0] : null;
}

/** Spoken menu is a gate before GameRuntime.start(), never a mission authority. */
export class ThemeSelection {
  constructor({ themes, speech, game }) {
    this.rawThemes = themes; this.speech = speech; this.game = game;
    this.state = 'idle'; this.version = 0; this.seen = new Set();
  }
  async utter(text, after, { force = true } = {}) {
    const version = ++this.version;
    try {
      await this.speech.say(text, { force });
      if (this.state !== 'closed' && this.version === version) this.state = after;
      return this.version === version && this.state !== 'closed';
    } catch {
      if (this.version === version && this.state !== 'closed') this.state = 'paused';
      return false;
    }
  }
  async start() {
    if (this.state !== 'idle') return;
    try { this.themes = validateThemes(this.rawThemes); }
    catch {
      this.state = 'unconfigured';
      await this.utter('I am ORBIT. The three game themes are not configured yet. Please contact the host.', 'unconfigured');
      return;
    }
    await this.menu();
  }
  async menu() {
    this.candidate = null; this.state = 'presenting';
    const list = this.themes.map((theme, i) => `${i + 1}: ${theme.name}`).join('. ');
    if (await this.utter(`${this.greeted ? '' : 'I am ORBIT, your AI guide. '}Choose a theme. ${list}. Say its name or number.`, 'choosing')) this.greeted = true;
  }
  async confirm(theme) {
    this.candidate = theme; this.state = 'presenting';
    await this.utter(`You chose ${theme.name}. Say yes to confirm, or no to choose again.`, 'confirming');
  }
  async handleTranscript(event) {
    if (!event.isFinal || this.state === 'closed' || this.state === 'idle' || this.state === 'unconfigured') return;
    const id = event.itemId || `${event.createdAt}:${event.transcript}`;
    if (this.seen.has(id)) return;
    this.seen.add(id); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value);
    const text = normalize(event.transcript);
    if (['stop','wait','pause'].includes(text)) {
      this.resumeState = this.state; this.version++; this.state = 'paused';
      if (this.game.started) this.game.pause();
      await this.speech.interrupt(); return;
    }
    if (this.speech.busy) return; // half-duplex selection: do not interpret menu echo as a choice
    if (this.state === 'paused' && ['resume','repeat','help','hint'].includes(text)) {
      if (this.game.started) { this.state = 'running'; this.game.announce(this.game.engine.instruction(), { force: true }); }
      else if (this.candidate) await this.confirm(this.candidate);
      else await this.menu();
      return;
    }
    if (this.state === 'running') {
      if (['help','hint','repeat'].includes(text)) this.game.announce(this.game.engine.instruction(), { force: true });
      return;
    }
    if (this.state === 'choosing') {
      const theme = matchTheme(text, this.themes);
      if (theme) await this.confirm(theme);
      else { this.state = 'presenting'; await this.utter('Please say one, two, three, or an exact theme name.', 'choosing', { force: false }); }
      return;
    }
    if (this.state === 'confirming') {
      if (['no','no thanks','choose again'].includes(text)) return this.menu();
      if (!['yes','yes please','confirm'].includes(text)) return;
      this.state = 'confirming_playout';
      if (await this.utter(`${this.candidate.name} confirmed. ${this.candidate.intro}`.trim(), 'running')) {
        this.game.setTheme(this.candidate);
        this.game.start();
      }
    }
  }
  async close() { this.version++; this.state = 'closed'; await this.speech.close(); await this.game.close(); }
}
