import { createServer } from 'node:http';
import { createCanvas } from '@napi-rs/canvas';
import { drawFace, HEIGHT, WIDTH } from './face.mjs';

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
    let tick = 0;
    function updateFrame() {
      const speaking = Math.floor(tick / 16) % 2;
      frame.src = '/frame?tick=' + tick++ + '&speaking=' + speaking;
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
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > 1000000) {
      response.writeHead(400);
      response.end('Invalid frame tick');
      return;
    }

    const image = context.createImageData(WIDTH, HEIGHT);
    image.data.set(drawFace(tick, speaking));
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
