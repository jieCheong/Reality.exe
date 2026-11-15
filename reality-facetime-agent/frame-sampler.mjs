import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export async function encodeJpeg(frame) {
  if (frame.format !== 'rgba' || frame.data.length !== frame.width * frame.height * 4) throw new Error('Invalid RGBA frame');
  // Installed VideoRotation enum uses 0/1/2/3, not degrees.
  const angle = [0, 90, 180, 270][frame.rotation];
  if (angle === undefined) throw new Error('Invalid VideoRotation');
  return sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .rotate(angle).jpeg({ quality: 85 }).toBuffer();
}

/** Debug-only sampler: five content-distinct JPEGs, no unbounded queue. */
export class FrameSampler {
  constructor(directory, { limit = 5, minIntervalMs = 500, encode = encodeJpeg } = {}) {
    this.directory = directory;
    this.limit = limit;
    this.minIntervalMs = minIntervalMs;
    this.encode = encode;
    this.hashes = new Set();
    this.jpegHashes = new Set();
    this.saved = [];
    this.lastSavedAt = -Infinity;
    this.pending = null;
    this.closed = false;
  }

  offer(frame, isCurrent = () => true) {
    if (this.closed || this.pending || this.saved.length >= this.limit ||
      frame.capturedAtMs - this.lastSavedAt < this.minIntervalMs || !isCurrent()) return Promise.resolve(null);
    this.pending = this.save(frame, isCurrent).finally(() => { this.pending = null; });
    return this.pending;
  }

  async save(frame, isCurrent) {
    const hash = createHash('sha256').update(`${frame.width}:${frame.height}:${frame.rotation}:`).update(frame.data).digest('hex');
    if (this.hashes.has(hash)) return null;
    const jpeg = await this.encode(frame);
    const jpegHash = createHash('sha256').update(jpeg).digest('hex');
    if (this.jpegHashes.has(jpegHash)) return null;
    if (this.closed || !isCurrent()) return null;
    await mkdir(this.directory, { recursive: true });
    if (this.closed || !isCurrent()) return null;
    const file = join(this.directory, `caller-${String(this.saved.length + 1).padStart(2, '0')}.jpg`);
    await writeFile(file, jpeg, { flag: 'wx' });
    const item = { file, sha256: jpegHash, pixelSha256: hash, sequence: frame.sequence, capturedAtMs: frame.capturedAtMs,
      participantIdentity: frame.participantIdentity, trackSid: frame.trackSid,
      timestampUs: frame.timestampUs, rotation: frame.rotation, width: frame.width, height: frame.height };
    this.hashes.add(hash);
    this.jpegHashes.add(jpegHash);
    this.saved.push(item);
    this.lastSavedAt = frame.capturedAtMs;
    await writeFile(join(this.directory, 'manifest.json'), JSON.stringify(this.saved, null, 2) + '\n');
    return item;
  }

  async close() { this.closed = true; await this.pending; }
}
