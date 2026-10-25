import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function setup({ messageChannel = true, readDuration = 0 } = {}) {
  const tasks = [], channels = [], reads = [];
  let clock = 0, nextTimer = 0;
  const cancelledTimers = new Set();
  const win = {
    performance: { now: () => clock },
    setTimeout(fn) { const id = ++nextTimer; tasks.push(() => { if (!cancelledTimers.has(id)) fn(); }); return id; },
    clearTimeout: id => cancelledTimers.add(id),
  };
  if (messageChannel) win.MessageChannel = class {
    constructor() {
      this.port1 = { onmessage: null, close: vi.fn() };
      this.port2 = { postMessage: () => tasks.push(() => this.port1.onmessage?.()), close: vi.fn() };
      channels.push(this);
    }
  };
  loadBrowserScript('vilda_centile_live_render.js', win);
  function asset(width, height, marks = [], onRead) {
    const canvas = { width, height };
    const context = { getImageData(x, y, w, h) {
      reads.push({ canvas, x, y, width: w, height: h });
      clock += readDuration;
      if (onRead) onRead();
      const data = new Uint8ClampedArray(w * h * 4).fill(255);
      for (const [atX, atY, rgba = [0, 0, 0, 255]] of marks) {
        if (atX >= x && atX < x + w && atY >= y && atY < y + h) {
          data.set(rgba, ((atY - y) * w + atX - x) * 4);
        }
      }
      return { data };
    } };
    canvas.getContext = () => context;
    return { canvas, width, height, contentBounds: null };
  }
  function step() { tasks.shift()?.(); }
  function drain() { let limit = 10_000; while (tasks.length && limit--) step(); expect(tasks).toHaveLength(0); }
  return { api: win.VildaCentileLiveRender, asset, tasks, channels, reads, step, drain };
}

function bundle(height, weight = null) {
  return { height, weight, ranges: [{ id: 'fictional', height, weight }] };
}

describe('deferred centile canvas bounds', () => {
  it('does no pixel read in the caller task and publishes all bounds atomically after yielded work', async () => {
    const e = setup();
    const small = e.asset(25, 25, [[12, 12]]);
    const large = e.asset(5000, 80, [[100, 30], [4800, 60]]);
    const job = e.api.prepareContentBounds(bundle(small, large));
    expect(e.reads).toHaveLength(0);
    e.step();
    expect(e.reads.length).toBeGreaterThan(0);
    expect(e.tasks.length).toBeGreaterThan(0);
    expect(small.contentBounds).toBeNull();
    expect(large.contentBounds).toBeNull();
    e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'ready' });
    expect(small.contentBounds).toEqual({ x: 0, y: 0, width: 25, height: 25 });
    expect(large.contentBounds).toEqual({ x: 88, y: 18, width: 4725, height: 55 });
    expect(e.channels[0].port1.close).toHaveBeenCalledOnce();
    expect(e.channels[0].port2.close).toHaveBeenCalledOnce();
  });

  it('visits every pixel once in wide expanded canvases, including tile and final row boundaries', async () => {
    const e = setup();
    const image = e.asset(5003, 53, [[4095, 7], [4096, 8], [4990, 40]]);
    const job = e.api.prepareContentBounds(bundle(image));
    e.drain(); await job.promise;
    expect(image.contentBounds).toEqual({ x: 4083, y: 0, width: 920, height: 53 });
    expect(e.reads.reduce((area, read) => area + read.width * read.height, 0)).toBe(5003 * 53);
    expect(e.reads.every(read => read.width <= 4096 && read.width * read.height <= 32768)).toBe(true);
    for (const read of e.reads) {
      expect(read.x + read.width).toBeLessThanOrEqual(5003);
      expect(read.y + read.height).toBeLessThanOrEqual(53);
    }
  });

  it.each([
    ['white image', 130, 77, [], { x: 0, y: 0, width: 130, height: 77 }],
    ['white RGB with transparent alpha', 80, 80, [[40, 40, [255, 255, 255, 0]]], { x: 0, y: 0, width: 80, height: 80 }],
    ['black RGB with transparent alpha', 80, 80, [[40, 40, [0, 0, 0, 0]]], { x: 28, y: 28, width: 25, height: 25 }],
    ['only blue differs from white', 80, 80, [[40, 40, [255, 255, 254, 255]]], { x: 28, y: 28, width: 25, height: 25 }],
    ['corner pixels', 90, 70, [[0, 0], [89, 69]], { x: 0, y: 0, width: 90, height: 70 }],
    ['one pixel canvas', 1, 1, [[0, 0]], { x: 0, y: 0, width: 1, height: 1 }],
    ['thin tall canvas', 1, 103, [[0, 51]], { x: 0, y: 39, width: 1, height: 25 }],
  ])('preserves the previous scanner rules: %s', async (_name, width, height, marks, expected) => {
    const e = setup(); const image = e.asset(width, height, marks);
    const job = e.api.prepareContentBounds(bundle(image)); e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'ready' });
    expect(image.contentBounds).toEqual(expected);
  });

  it('keeps prepared assets and deduplicates the active range aliases', async () => {
    const e = setup(); const height = e.asset(50, 50), weight = e.asset(60, 60);
    const originalBounds = { x: 12, y: 12, width: 25, height: 25 };
    height.contentBounds = originalBounds;
    const output = bundle(height, weight);
    output.ranges.push({ height, weight });
    const job = e.api.prepareContentBounds(output); e.drain(); await job.promise;
    expect(height.contentBounds).toBe(originalBounds);
    expect(e.reads.every(read => read.canvas === weight.canvas)).toBe(true);
    expect(e.reads.reduce((area, read) => area + read.width * read.height, 0)).toBe(3600);
  });

  it('cancels before the first task without retaining a scheduled channel callback', async () => {
    const e = setup(); const image = e.asset(300, 300);
    const job = e.api.prepareContentBounds(bundle(image)); job.cancel(); e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'cancelled' });
    expect(e.reads).toHaveLength(0);
    expect(image.contentBounds).toBeNull();
    expect(e.channels[0].port1.onmessage).toBeNull();
    expect(e.channels[0].port1.close).toHaveBeenCalledOnce();
  });

  it('cancels an obsolete patient between tasks without publishing a completed first asset', async () => {
    const e = setup(); let current = true;
    const a = e.asset(1, 1), b = e.asset(4000, 800);
    const job = e.api.prepareContentBounds(bundle(a, b), { isCurrent: () => current });
    e.step(); const reads = e.reads.length;
    expect(reads).toBeGreaterThan(1);
    current = false; e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'cancelled' });
    expect(e.reads).toHaveLength(reads);
    expect(a.contentBounds).toBeNull(); expect(b.contentBounds).toBeNull();
  });

  it('rechecks ownership after the final pixel read before publishing geometry', async () => {
    const e = setup(); let current = true;
    const image = e.asset(10, 10, [[5, 5]], () => { current = false; });
    const job = e.api.prepareContentBounds(bundle(image), { isCurrent: () => current }); e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'cancelled' });
    expect(image.contentBounds).toBeNull();
  });

  it('settles a thrown ownership check and a readback error without partial bounds', async () => {
    const e = setup();
    const first = e.api.prepareContentBounds(bundle(e.asset(10, 10)), { isCurrent() { throw new Error('ownership unavailable'); } });
    await expect(first.promise).resolves.toMatchObject({ status: 'error', error: { message: 'ownership unavailable' } });
    expect(e.reads).toHaveLength(0);
    const a = e.asset(1, 1), b = e.asset(10, 10, [], () => { throw new Error('readback failed'); });
    const second = e.api.prepareContentBounds(bundle(a, b)); e.drain();
    await expect(second.promise).resolves.toMatchObject({ status: 'error', error: { message: 'readback failed' } });
    expect(a.contentBounds).toBeNull(); expect(b.contentBounds).toBeNull();
    expect(e.channels[0].port1.close).toHaveBeenCalledOnce();
  });

  it('rejects resized canvas geometry instead of publishing stale bounds', async () => {
    const e = setup(); const image = e.asset(4000, 800);
    const job = e.api.prepareContentBounds(bundle(image)); e.step(); image.canvas.width = 4010; e.drain();
    await expect(job.promise).resolves.toMatchObject({ status: 'error' });
    expect(image.contentBounds).toBeNull();
  });

  it('yields at the normal time budget and keeps prioritized work bounded', async () => {
    const e = setup({ readDuration: 3 }); const image = e.asset(4000, 800);
    const job = e.api.prepareContentBounds(bundle(image));
    e.step(); expect(e.reads).toHaveLength(2);
    job.prioritize(); e.step(); expect(e.reads).toHaveLength(5);
    job.cancel(); e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'cancelled' });
  });

  it('uses cancellable timer tasks when MessageChannel is absent', async () => {
    const e = setup({ messageChannel: false }); const image = e.asset(500, 500, [[250, 250]]);
    const job = e.api.prepareContentBounds(bundle(image));
    expect(e.reads).toHaveLength(0); e.step();
    expect(e.tasks).toHaveLength(1); job.cancel(); const count = e.reads.length; e.drain();
    await expect(job.promise).resolves.toEqual({ status: 'cancelled' });
    expect(e.reads).toHaveLength(count);
    expect(image.contentBounds).toBeNull();
  });

  it('finishes an empty/already prepared result without scheduling work', async () => {
    const e = setup();
    const job = e.api.prepareContentBounds({ status: 'unavailable', ranges: [] });
    await expect(job.promise).resolves.toEqual({ status: 'ready' });
    expect(e.tasks).toHaveLength(0); expect(e.channels).toHaveLength(0);
    job.cancel(); await expect(job.promise).resolves.toEqual({ status: 'ready' });
  });
});
