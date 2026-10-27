import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function api() {
  const win = {};
  loadBrowserScript('vilda_centile_live_colors.js', win);
  return win.VildaCentileLiveColors;
}

// This oracle checks the returned geometry independently of production's slab
// clipping: line segments are intersected with the four rectangle edges.
function intersects(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const within = (p, q, r) => r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x)
    && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC === 0 && within(a, b, c) || abD === 0 && within(a, b, d)
    || cdA === 0 && within(c, d, a) || cdB === 0 && within(c, d, b)) return true;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

function assertClear(rect, cfg) {
  expect(rect).not.toBeNull();
  const plot = cfg.plot, gap = cfg.gap ?? 4, radius = cfg.pointRadius ?? 6.8;
  expect(rect.x).toBeGreaterThanOrEqual(plot.x);
  expect(rect.y).toBeGreaterThanOrEqual(plot.y);
  expect(rect.x + rect.width).toBeLessThanOrEqual(plot.x + plot.w);
  expect(rect.y + rect.height).toBeLessThanOrEqual(plot.y + plot.h);
  for (const point of cfg.mapped) {
    const dx = Math.max(rect.x - point.x, point.x - rect.x - rect.width, 0);
    const dy = Math.max(rect.y - point.y, point.y - rect.y - rect.height, 0);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(radius + gap);
  }
  const margin = (cfg.lineWidth ?? 6.3) / 2 + gap;
  const x = rect.x - margin, y = rect.y - margin;
  const right = rect.x + rect.width + margin, bottom = rect.y + rect.height + margin;
  const corners = [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }];
  const inside = p => p.x >= x && p.x <= right && p.y >= y && p.y <= bottom;
  cfg.mapped.slice(1).forEach((b, index) => {
    const a = cfg.mapped[index];
    expect(inside(a) || inside(b)).toBe(false);
    corners.forEach((c, edge) => expect(intersects(a, b, c, corners[(edge + 1) % 4])).toBe(false));
  });
}

const plot = { x: 50, y: 28, w: 420, h: 360 };

describe('patient value label avoids every patient line and point', () => {
  it.each([
    ['falling weight from the reported screenshot', [{ x: 220, y: 130 }, { x: 226, y: 190 }, { x: 237, y: 197 }]],
    ['rising height', [{ x: 140, y: 310 }, { x: 200, y: 250 }, { x: 237, y: 197 }]],
    ['vertical and duplicate-age measurements', [{ x: 237, y: 100 }, { x: 237, y: 250 }, { x: 237, y: 197 }]],
    ['coincident measurements', [{ x: 237, y: 197 }, { x: 237, y: 197 }]],
    ['path reversing back through the preferred right-hand area', [{ x: 340, y: 197 }, { x: 340, y: 140 }, { x: 237, y: 197 }]],
  ])('%s', (_, mapped) => {
    const cfg = { plot, mapped, pointIndex: mapped.length - 1, width: 80, height: 23 };
    const before = JSON.stringify(cfg);
    assertClear(api().placeLabel(cfg), cfg);
    expect(JSON.stringify(cfg)).toBe(before);
  });

  it('prefers the right side rather than obscuring a descending earlier segment', () => {
    const mapped = [{ x: 220, y: 130 }, { x: 226, y: 190 }, { x: 237, y: 197 }];
    const cfg = { plot, mapped, pointIndex: 2, width: 80, height: 23 };
    const rect = api().placeLabel(cfg);
    assertClear(rect, cfg);
    expect(rect.x).toBeGreaterThan(mapped[2].x + 10);
  });

  it.each([
    ['top left', { x: 50, y: 28 }], ['top right', { x: 470, y: 28 }],
    ['bottom left', { x: 50, y: 388 }], ['bottom right', { x: 470, y: 388 }],
  ])('keeps a label clear and contained at the %s boundary', (_, point) => {
    const cfg = { plot, mapped: [point], pointIndex: 0, width: 80, height: 23 };
    assertClear(api().placeLabel(cfg), cfg);
  });

  it('checks later measurements too when the current point is not chronologically last', () => {
    const cfg = { plot, width: 88, height: 23, pointIndex: 0,
      mapped: [{ x: 220, y: 180 }, { x: 330, y: 180 }, { x: 360, y: 230 }] };
    assertClear(api().placeLabel(cfg), cfg);
  });

  it('checks visible crossings even when both segment endpoints lie outside the plot', () => {
    const cfg = { plot, width: 88, height: 23, pointIndex: 2,
      mapped: [{ x: 10, y: 180 }, { x: 500, y: 180 }, { x: 237, y: 197 }] };
    assertClear(api().placeLabel(cfg), cfg);
  });

  it('returns a header fallback instead of choosing an overlapping label in a dense history', () => {
    const mapped = [];
    for (let y = 30; y <= 380; y += 5) {
      mapped.push({ x: mapped.length % 4 === 0 ? 50 : 470, y });
      mapped.push({ x: mapped.length % 4 === 1 ? 470 : 50, y });
    }
    expect(api().placeLabel({ plot, mapped, pointIndex: mapped.length - 1, width: 80, height: 23 })).toBeNull();
    expect(api().placeLabel({ plot, mapped: [{ x: 200, y: 200 }], pointIndex: 0, width: 80, height: 23,
      obstacles: [{ x: 50, y: 28, w: 420, h: 360 }] })).toBeNull();
  });

  it('recomputes conservative clearances in the coordinate scale supplied by each view', () => {
    const mapped = [{ x: 220, y: 130 }, { x: 226, y: 190 }, { x: 237, y: 197 }];
    for (const scale of [0.1, 0.25, 0.5, 1, 2, 4]) {
      const cfg = { plot: { x: plot.x / scale, y: plot.y / scale, w: plot.w / scale, h: plot.h / scale },
        mapped: mapped.map(point => ({ x: point.x / scale, y: point.y / scale })), pointIndex: 2,
        width: 80 / scale, height: 23 / scale, gap: 4 / scale, pointRadius: 6.8 / scale, lineWidth: 6.3 / scale };
      assertClear(api().placeLabel(cfg), cfg);
    }
  });

  it('never fabricates a position for invalid or smaller-than-label plots', () => {
    const base = { plot, mapped: [{ x: 200, y: 200 }], pointIndex: 0, width: 80, height: 23 };
    for (const patch of [{ width: Infinity }, { height: -1 }, { pointIndex: 3 }, { plot: null },
      { plot: { ...plot, w: 70 } }, { mapped: [{ x: NaN, y: 200 }] }]) {
      expect(api().placeLabel({ ...base, ...patch })).toBeNull();
    }
  });

  it('keeps the no-overlap contract through a deterministic variety of dense and irregular histories', () => {
    let seed = 43119, placements = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let run = 0; run < 120; run += 1) {
      const mapped = Array.from({ length: 3 + run % 17 }, (_, index) => ({
        x: plot.x + plot.w * index / (2 + run % 17), y: plot.y + random() * plot.h,
      }));
      const cfg = { plot, mapped, pointIndex: run % mapped.length, width: 88, height: 23 };
      const rect = api().placeLabel(cfg);
      if (rect) { placements += 1; assertClear(rect, cfg); }
    }
    expect(placements).toBeGreaterThan(60);
  });
});

function documentStub() {
  const doc = {};
  function element(tag) {
    return { tag, ownerDocument: doc, dataset: {}, attributes: {}, children: [], className: '',
      setAttribute(name, value) { this.attributes[name] = String(value); },
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = [...children]; } };
  }
  doc.createElement = element;
  doc.createElementNS = (_, tag) => element(tag);
  return doc;
}

describe('fullscreen labels at their final screen scale', () => {
  it('replaces its rectangle on each resize while retaining exactly the original patient geometry', () => {
    const doc = documentStub(), image = doc.createElement('canvas');
    const asset = { metric: 'weight', source: 'OLAF', width: 2296, height: 3041,
      plot: { x: 190, y: 115, w: 1946, h: 2745, ageMin: 36, ageMax: 216, minY: 10, maxY: 80 },
      points: [{ ageMonths: 108, value: 61, percentile: 99 }, { ageMonths: 111, value: 52.5, percentile: 98 },
        { ageMonths: 115, value: 51.5, percentile: 98, current: true }] };
    const wrapper = api().fullLayer(image, asset);
    const all = node => [node, ...node.children.flatMap(all)];
    for (const scale of [0.1, 0.3, 1, 0.2]) {
      wrapper.fitPatientLayer(scale);
      expect(wrapper.dataset.valueLabel).toBe('placed');
      const rectNode = all(wrapper).find(node => node.attributes.class === 'vilda-centile-live-full-latest-label-box');
      const dots = all(wrapper).filter(node => node.attributes.class === 'vilda-centile-live-full-point');
      const mapped = dots.map(node => ({ x: Number(node.attributes.cx), y: Number(node.attributes.cy) }));
      const rect = Object.fromEntries(['x', 'y', 'width', 'height'].map(name => [name, Number(rectNode.attributes[name])]));
      assertClear(rect, { plot: asset.plot, mapped, gap: 4 / scale, pointRadius: 6.8 / scale, lineWidth: 6.3 / scale });
      expect(rect.height * scale).toBeCloseTo(23, 8);
      expect(mapped[2].x).toBeCloseTo(190 + (115 - 36) / 180 * 1946, 8);
      expect(mapped[2].y).toBeCloseTo(115 + (80 - 51.5) / 70 * 2745, 8);
    }
  });

  it('omits the internal label when no safe space exists or the Creator hides it', () => {
    const doc = documentStub(), base = { metric: 'weight', source: 'DS', width: 100, height: 100,
      plot: { x: 0, y: 0, w: 30, h: 30, ageMin: 0, ageMax: 240, minY: 0, maxY: 100 },
      points: [{ ageMonths: 120, value: 50, current: true }] };
    const dense = api().fullLayer(doc.createElement('canvas'), base);
    dense.fitPatientLayer(1);
    expect(dense.dataset.valueLabel).toBe('header');
    const hidden = api().fullLayer(doc.createElement('canvas'), { ...base, valueLabelVisible: false });
    hidden.fitPatientLayer(1);
    expect(hidden.dataset.valueLabel).toBe('hidden');
    expect(hidden.children[1].children[2].children).toHaveLength(0);
  });
});
