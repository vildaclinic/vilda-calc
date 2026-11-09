import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';
const source = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
function fixture() {
  const timeline = {}, frames = [], handlers = new Set();
  let animations = [];
  const element = { getAnimations: () => animations,
    addEventListener: (_, handler) => handlers.add(handler), removeEventListener: (_, handler) => handlers.delete(handler) };
  const normalize = new Function('document', 'requestAnimationFrame',
    wytnijFunkcje(source, 'vildaPulsWspolnaFaza') + ';return vildaPulsWspolnaFaza;')({ timeline }, fn => frames.push(fn));
  const start = (name = 'pulseOrange', iterations = Infinity) => {
    const animation = { animationName: name, timeline, startTime: 745,
      effect: { target: element, getComputedTiming: () => ({ iterations }) } };
    animations = [animation];
    for (const handler of [...handlers]) handler({ target: element, animationName: name });
    return animation;
  };
  return { element, frames, handlers, normalize, start };
}
describe('actual shared pulse phase at first visible start', () => {
  it('normalizes an infinite pulse when results remain hidden beyond the first frame', () => {
    const h = fixture(); h.normalize(h.element);
    h.frames.shift()();
    const animation = h.start();
    expect(animation.startTime).toBe(0); expect(h.handlers.size).toBe(0);
    expect(h.element.__vildaPulsePhaseHandler).toBeUndefined();
  });
  it('ignores entrance animations and keeps only one pending pulse listener', () => {
    const h = fixture(); h.normalize(h.element); h.normalize(h.element);
    expect(h.handlers.size).toBe(1); expect(h.start('fadeSlideUp', 1).startTime).toBe(745);
    expect(h.handlers.size).toBe(1); expect(h.start('pulseRed').startTime).toBe(0);
  });
  it('preserves finite pulse timing', () => {
    const h = fixture(); h.normalize(h.element);
    expect(h.start('pulseOrange', 1).startTime).toBe(745);
  });
});
