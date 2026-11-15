import { createServer } from 'node:http';
import { createCanvas } from '@napi-rs/canvas';
import { drawFace, HEIGHT, THEMES, WIDTH } from './face.mjs';

const host = process.env.HUD_PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.HUD_PREVIEW_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('HUD_PREVIEW_PORT must be a valid TCP port.');
}

const canvas = createCanvas(WIDTH, HEIGHT);
const context = canvas.getContext('2d');

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#07131d">
  <title>Reality.exe HUD Preview</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #07131d;
      margin: 0;
      min-height: 100dvh;
    }
    main {
      height: min(100dvh, calc(100vw * 19.5 / 9));
      margin: 0 auto;
      max-width: 100vw;
      width: min(100vw, calc(100dvh * 9 / 19.5));
    }
    img {
      display: block;
      height: 100%;
      object-fit: fill;
      width: 100%;
    }
  </style>
</head>
<body>
  <main>
    <img id="frame" alt="Reality.exe game HUD video frame">
  </main>
  <script>
    const frame = document.querySelector('#frame');
    const previewParams = new URLSearchParams(location.search);
    const themeId = previewParams.get('theme');
    let tick = 0;
    function updateFrame() {
      const speaking = Math.floor(tick / 16) % 2;
      const requestParams = new URLSearchParams({ tick: String(tick++), speaking: String(speaking) });
      if (themeId) requestParams.set('theme', themeId);
      for (const key of ['complete', 'tasks', 'seconds', 'timeouts']) {
        const value = previewParams.get(key);
        if (value !== null) requestParams.set(key, value);
      }
      frame.src = '/frame?' + requestParams.toString();
    }
    updateFrame();
    window.setInterval(updateFrame, 250);
  </script>
</body>
</html>`;

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Method not allowed');
    return;
  }

  const [path, query = ''] = (request.url || '/').split('?');
  if (path === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(page);
    return;
  }

  if (path === '/frame') {
    const params = new URLSearchParams(query);
    const tick = Number(params.get('tick') || 0);
    const speaking = params.get('speaking') === '1';
    const themeId = params.get('theme');
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > 1000000) {
      response.writeHead(400);
      response.end('Invalid frame tick');
      return;
    }
    if (themeId !== null && !Object.prototype.hasOwnProperty.call(THEMES, themeId)) {
      response.writeHead(400);
      response.end('Invalid HUD theme');
      return;
    }

    const complete = params.get('complete');
    if (complete !== null && complete !== '0' && complete !== '1') {
      response.writeHead(400);
      response.end('Invalid completion state');
      return;
    }

    let missionResult = null;
    if (complete === '1') {
      if (themeId === null) {
        response.writeHead(400);
        response.end('A HUD theme is required for mission completion');
        return;
      }
      const tasksCompleted = Number(params.get('tasks') || 3);
      const elapsedSeconds = Number(params.get('seconds') || 245);
      const timedOutTasks = Number(params.get('timeouts') || 0);
      if (!Number.isSafeInteger(tasksCompleted) || tasksCompleted < 0 ||
          !Number.isSafeInteger(elapsedSeconds) || elapsedSeconds < 0 ||
          !Number.isSafeInteger(timedOutTasks) || timedOutTasks < 0) {
        response.writeHead(400);
        response.end('Invalid completion statistics');
        return;
      }
      missionResult = { tasksCompleted, elapsedSeconds, timedOutTasks };
    }

    const image = context.createImageData(WIDTH, HEIGHT);
    image.data.set(drawFace(tick, speaking, themeId, missionResult));
    context.putImageData(image, 0, 0);
    response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    response.end(canvas.toBuffer('image/png'));
    return;
  }

  response.writeHead(404);
  response.end('Not found');
});

server.listen(port, host, () => {
  console.log(`HUD preview ready at http://${host}:${port}`);
  if (host === '127.0.0.1') console.log('For phone access on your Wi-Fi, set HUD_PREVIEW_HOST=0.0.0.0 before starting.');
});
