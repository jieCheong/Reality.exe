// Parent routine editor: a local-only page for editing the morning and night routine files.
// Every save goes through the same validator the agent uses, so a bad routine never reaches a call.
// Run: npm run editor  ->  http://127.0.0.1:8787  (changes apply the next time the agent starts)
import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateRoutine, assertRoutineCapabilities } from './routine-contract.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_FILES = {
  morning: process.env.ROUTINE_MORNING_FILE || 'examples/routines/kids-morning.json',
  night: process.env.ROUTINE_NIGHT_FILE || 'examples/routines/kids-night.json',
};

export function makeEditorServer({ files = DEFAULT_FILES, port = 8787 } = {}) {
  const page = readFile(new URL('./parent-editor/index.html', import.meta.url));
  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  return createServer(async (req, res) => {
    try {
      // Local only: refuse other Host names (DNS rebinding) and cross-site writes.
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 403, { error: 'Local editor only' });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, await page, 'text/html; charset=utf-8');
      const match = url.pathname.match(/^\/api\/routines\/(morning|night)$/);
      if (!match) return send(res, 404, { error: 'Not found' });
      const file = resolve(here, files[match[1]]);
      if (req.method === 'GET') return send(res, 200, JSON.parse(await readFile(file, 'utf8')));
      if (req.method !== 'PUT') return send(res, 405, { error: 'Use GET or PUT' });
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON only' });
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`) return send(res, 403, { error: 'Cross-site save refused' });
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 64000) return send(res, 413, { error: 'Routine too large' }); chunks.push(chunk); }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
      try { assertRoutineCapabilities(validateRoutine(input)); } catch (error) { return send(res, 422, { error: error.message }); }
      if (input.greeting !== undefined && input.greeting !== match[1]) return send(res, 422, { error: `This routine's greeting must be "${match[1]}"` });
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify(input, null, 2) + '\n'); await rename(temp, file);
      return send(res, 200, { saved: match[1] });
    } catch { return send(res, 500, { error: 'Editor error' }); }
  }).listen(port, '127.0.0.1');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.EDITOR_PORT || 8787);
  makeEditorServer({ port }).on('listening', () => console.log(`Parent routine editor: http://127.0.0.1:${port}`));
}
