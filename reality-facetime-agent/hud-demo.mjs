// Local rendering only: no env file, voice session, room, connector, or API.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { WIDTH, HEIGHT } from './spaceship-face.mjs';
import { drawHud } from './hud-video.mjs';
import { MOCK_HUD_SEQUENCE } from './hud-mock.mjs';

const directory = WIDTH > HEIGHT ? '.local/hud-landscape-preview' : HEIGHT === 1170 ? '.local/hud-juan-original-preview' : '.local/hud-juan-preview';
await mkdir(directory, { recursive: true });
const frames = [];
for (const [index, gameState] of MOCK_HUD_SEQUENCE.entries()) {
  const pixels = drawHud(index * 15, { speaking: index % 2 === 1, gameState });
  frames.push(Buffer.from(pixels));
  await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png().toFile(join(directory, `${index + 1}-${gameState.phase.toLowerCase()}.png`));
}
await sharp(Buffer.concat(frames), {
  raw: { width: WIDTH, height: HEIGHT * frames.length, pageHeight: HEIGHT, channels: 4 },
}).gif({ delay: 1200, loop: 0 }).toFile(join(directory, 'mission-sequence.gif'));
console.log(`Local HUD sequence: ${directory}/mission-sequence.gif`);
