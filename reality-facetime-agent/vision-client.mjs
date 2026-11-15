import { randomUUID } from 'node:crypto';

/** Loopback-only transport. Does not hold provider credentials. */
export class VisionClient {
  constructor({ url = 'http://127.0.0.1:8765', allowMock = false, fetchImpl = fetch } = {}) {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search) {
      throw new Error('Vision service must be an HTTP IPv4 loopback origin');
    }
    this.url = endpoint.origin; this.allowMock = allowMock; this.fetch = fetchImpl;
  }
  async analyze(request, signal) {
    const response = await this.fetch(`${this.url}/analyze`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(9500)]),
    });
    if (!response.ok) throw new Error(`Vision HTTP ${response.status}`);
    const bytes = await response.text();
    if (bytes.length > 100_000) throw new Error('Vision response too large');
    const reply = JSON.parse(bytes);
    if (reply.requestId !== request.requestId || reply.revision !== request.revision || reply.operation !== request.operation ||
      JSON.stringify(reply.frameIds) !== JSON.stringify(request.frames.map(f => f.id)) ||
      reply.provider !== (this.allowMock ? 'mock' : 'groq') || !reply.result || typeof reply.result !== 'object') throw new Error('Unbound or wrong-provider vision reply');
    return reply.result;
  }
  newRequestId() { return randomUUID(); }
}
