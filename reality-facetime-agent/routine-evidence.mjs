/** Untrusted adapter data: malformed evidence must never become a pass or penalty. */
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const optionalReason = value => value == null || typeof value === 'string';

export function verdictRound(result, predicate) {
  if (!isRecord(result)) return null;
  const frames = result.frame_verdicts;
  if (result.status !== 'checked' || result.predicate !== predicate || typeof result.satisfied !== 'boolean' ||
      result.votes_total !== 3 || !Array.isArray(frames) || frames.length !== 3 ||
      !Array.from(frames).every(f => isRecord(f) && Number.isInteger(f.frame_index) && [0,1,2].includes(f.frame_index) &&
        typeof f.satisfied === 'boolean' && Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 1 &&
        optionalReason(f.error) && optionalReason(f.geometry_override)) ||
      new Set(frames.map(f => f.frame_index)).size !== 3) return null;
  const yes = frames.filter(f => f.satisfied && f.confidence >= .7 && !f.error && !f.geometry_override).length;
  if (result.votes_for !== yes || result.satisfied !== (yes >= 2)) return null;
  return { pass: yes >= 2, conclusiveFailure: frames.every(f => !f.error) &&
    frames.filter(f => (!f.satisfied && f.confidence >= .7) || f.geometry_override).length >= 2 };
}
