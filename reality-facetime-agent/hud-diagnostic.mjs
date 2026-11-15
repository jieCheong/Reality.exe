// Synthetic geometry only. No caller images, game text or provider data.
import { createCanvas } from '@napi-rs/canvas';
import { WIDTH, HEIGHT, STATUS_STRIPE_Y } from './spaceship-face.mjs';
const canvas = createCanvas(WIDTH, HEIGHT), ctx = canvas.getContext('2d');
export function drawDiagnostic(tick, state = {}) {
  ctx.fillStyle = '#203b69'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, WIDTH - 12, HEIGHT - 12);
  for (const [x,y,color,label] of [[16,16,'#ff5050','TL'],[WIDTH-96,16,'#50ff50','TR'],[16,HEIGHT-96,'#5080ff','BL'],[WIDTH-96,HEIGHT-96,'#ffff50','BR']]) {
    ctx.fillStyle=color; ctx.fillRect(x,y,80,80); ctx.fillStyle='#101010'; ctx.font='bold 26px sans-serif'; ctx.fillText(label,x+17,y+50);
  }
  ctx.fillStyle = state.reactor === 'online' ? '#66e5d1' : '#ffcb78'; ctx.fillRect(0,STATUS_STRIPE_Y,WIDTH,8);
  ctx.fillStyle='#ffffff'; ctx.textAlign='center'; ctx.font='bold 32px sans-serif';
  const landscape = WIDTH > HEIGHT;
  ctx.fillText(`${WIDTH} x ${HEIGHT}`, WIDTH/2, landscape ? 100 : 260);
  ctx.fillText(`${landscape ? '16:9' : HEIGHT === 1170 ? '9:19.5' : '9:16'} / ROTATION 0`, WIDTH/2, landscape ? 145 : 310);
  ctx.font='24px sans-serif'; ctx.fillText(`FRAME ${tick}`, WIDTH/2, WIDTH > HEIGHT ? 180 : 360);
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(WIDTH/2,HEIGHT/2,WIDTH > HEIGHT ? 65 : 100,0,2*Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(WIDTH/2-130,HEIGHT/2); ctx.lineTo(WIDTH/2+130,HEIGHT/2); ctx.moveTo(WIDTH/2,HEIGHT/2-130); ctx.lineTo(WIDTH/2,HEIGHT/2+130); ctx.stroke();
  ctx.fillStyle='#ff80ff'; ctx.fillRect(30+(tick*7)%(WIDTH-80),HEIGHT-160,30,20);
  ctx.textAlign='left';
  return new Uint8Array(ctx.getImageData(0,0,WIDTH,HEIGHT).data);
}
