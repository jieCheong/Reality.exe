// Compile-only assignment checks against the actual JS implementations and SDK types.
import { Room } from '@livekit/rtc-node';
import { CallerVideoAdapter } from './caller-video.mjs';
import { publishHud } from './hud-video.mjs';
import type { CallerVideoPort, HudVideoPort, CallerFrame, HudState } from './part-a-types.js';

const input: CallerVideoPort = new CallerVideoAdapter(new Room());
const output: Promise<HudVideoPort> = publishHud(new Room().localParticipant!);
const consume = (frame: CallerFrame) => { void frame.data; void frame.timestampUs; };
input.on('frame', consume);
const update: Partial<HudState> = { reactor: 'online' };
void output.then(hud => hud.setState(update));
