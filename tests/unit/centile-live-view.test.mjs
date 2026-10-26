import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Only the document and layout measurements are simulated. The production SVG
// mapper and view handle geometry, pointer/keyboard state and canvas replacement.
function environment() {
  const frames = new Map();
  let nextFrame = 0;
  const events = target => {
    const listeners = new Map();
    target.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
    target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
    target.dispatchEvent = event => { for (const fn of listeners.get(event.type) || []) fn(event); };
    return target;
  };
  const doc = {};
  class Element {
    constructor(tag) {
      Object.assign(this, { tagName: tag.toUpperCase(), ownerDocument: doc, children: [], style: {}, dataset: {}, attributes: {}, hidden: false, className: '', textContent: '', parentNode: null, rect: { left: 0, top: 0, width: 600, height: 450 } });
      events(this);
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' '); },
        toggle: (name, active) => active ? this.classList.add(name) : this.classList.remove(name),
      };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'class') this.className = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
    replaceChildren(...children) { [...this.children].forEach(child => child.remove()); this.append(...children); }
    getBoundingClientRect() { return this.rect; }
    focus() { doc.activeElement = this; }
  }
  doc.createElement = tag => new Element(tag);
  doc.createElementNS = (_, tag) => new Element(tag);
  doc.createTextNode = value => { const node = new Element('#text'); node.textContent = value; return node; };
  const win = events({ document: doc, getComputedStyle: () => ({}),
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  doc.defaultView = win;
  loadBrowserScript('vilda_centile_live_colors.js', win);
  loadBrowserScript('vilda_centile_live_preview.js', win);
  loadBrowserScript('vilda_centile_live_view.js', win);
  const all = node => [node, ...node.children.flatMap(all)];
  return { win, doc, all, byClass: (node, suffix) => all(node).filter(item => item.classList.contains('vilda-centile-live-' + suffix)),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}
function preview(metric = 'height', overrides = {}) {
  const values = metric === 'height' ? [80, 100, 130] : [11, 17, 33];
  return { preview: true, metric, source: 'OLAF', sex: 'F', population: 'OGOLNA', units: metric === 'height' ? 'cm' : 'kg', sampleStepMonths: 1,
    plot: { x: 0, y: 0, w: 1, h: 1, ageMin: 36, ageMax: 216, minY: 0, maxY: 200 },
    curves: { 3: Array(181).fill(80), 50: Array(181).fill(120), 97: Array(181).fill(160) },
    points: values.map((value, index) => ({ ageMonths: [36, 84, 144][index], value, percentile: [10, 20, 60][index], exact: true, current: index === 2 })),
    ...overrides };
}
function bundle(height = preview(), weight = preview('weight')) {
  return { status: 'ready', source: 'OLAF', height, weight, activeRangeId: 'olaf', ranges: [{ id: 'olaf', height, weight }] };
}

describe('screen-sized centile preview and view', () => {
  it('renders only the selected reference curves without a canvas or altered domain', () => {
    const e = environment();
    const data = preview();
    const result = e.win.VildaCentileLivePreview.draw(e.doc, data, 600, 450);
    const curves = e.byClass(result.element, 'preview-centile');
    expect(curves.map(curve => curve.getAttribute('data-centile'))).toEqual(['3', '50', '97']);
    expect(e.all(result.element).some(node => node.tagName === 'CANVAS')).toBe(false);
    expect(result.plot).toMatchObject({ ageMin: 36, ageMax: 216, minY: 0, maxY: 200 });
    expect(e.byClass(result.element, 'preview-point')).toHaveLength(3);
    expect(e.byClass(result.element, 'preview-patient-path')[0].getAttribute('stroke-width')).toBe('3.2');
    expect(e.all(result.element).filter(node => node.tagName === 'TEXT' && node.textContent === '50')[0].getAttribute('font-size')).toBe('12');
    expect(data.plot).toEqual({ x: 0, y: 0, w: 1, h: 1, ageMin: 36, ageMax: 216, minY: 0, maxY: 200 });
  });

  it('keeps a readable number of Palczewska ticks without crowding short previews', () => {
    const e = environment();
    const data = preview('height', { plot: { x: 0, y: 0, w: 1, h: 1, ageMin: 12, ageMax: 216, minY: 70, maxY: 195 } });
    for (const height of [140, 220, 450]) {
      const result = e.win.VildaCentileLivePreview.draw(e.doc, data, 320, height);
      const lines = e.all(result.element).filter(node => node.tagName === 'LINE');
      if (height === 450) expect(lines).toHaveLength(6);
      const positions = lines.map(node => Number(node.getAttribute('y1'))).sort((a, b) => a - b);
      positions.slice(1).forEach((position, index) => expect(position - positions[index]).toBeGreaterThanOrEqual(32));
    }
  });

  it('keeps reference gaps empty and labels the WHO infant domain in months', () => {
    const e = environment();
    const data = preview('height', { source: 'WHO', plot: { x: 0, y: 0, w: 1, h: 1, ageMin: 0, ageMax: 35, minY: 40, maxY: 110 }, curves: { 3: [45, null, 48], 50: [50, null, 53], 97: [55, null, 58] } });
    const result = e.win.VildaCentileLivePreview.draw(e.doc, data, 300, 300);
    const paths = e.all(result.element).filter(node => node.tagName === 'PATH');
    expect(paths.every(node => !/NaN|Infinity/.test(node.getAttribute('d')))).toBe(true);
    expect(e.byClass(result.element, 'preview-centile')[0].getAttribute('d').match(/M/g)).toHaveLength(2);
    expect(e.byClass(result.element, 'preview-band')).toHaveLength(2);
    const texts = e.all(result.element).filter(node => node.tagName === 'TEXT').map(node => node.textContent);
    expect(texts).toContain('Wiek · miesiące');
    expect(texts).toContain('35');
  });

  it('maps pointer and keyboard to the same clinical point after resize without recalculating a percentile', () => {
    const e = environment();
    const data = preview();
    const probe = vi.fn((asset, age) => asset.points.find(point => point.ageMonths === age));
    const view = e.win.VildaCentileLiveView.create({ document: e.doc, probe });
    view.update(bundle(data), { patientId: 'fictional-a', sex: 'F' });
    const viewport = e.byClass(view.element, 'viewport')[0], input = e.byClass(view.element, 'interaction')[0];
    for (const width of [600, 330]) {
      viewport.rect.width = width; view.fit();
      const point = e.byClass(view.element, 'preview-point')[2];
      input.dispatchEvent({ type: 'pointermove', pointerType: 'mouse', clientX: Number(point.getAttribute('cx')) });
      e.flush();
      expect(view.getState().probes.height).toMatchObject({ ageMonths: 144, value: 130, percentile: 60 });
      expect(e.byClass(view.element, 'probe-dot')[0].style.left).toBe(point.getAttribute('cx') + 'px');
      input.dispatchEvent({ type: 'pointerleave' });
    }
    input.dispatchEvent({ type: 'keydown', key: 'End', preventDefault() {} });
    expect(view.getState()).toMatchObject({ ageMonths: 144, pinned: true });
    expect(e.byClass(view.element, 'latest-value')[0].textContent).toBe('130 cm');
    expect(e.byClass(view.element, 'latest-centile')[0].textContent).toBe('60. centyl');
    expect(probe).toHaveBeenCalled();
    const fallback = preview(); fallback.points[2].source = 'WHO';
    view.update(bundle(fallback), { patientId: 'fictional-a', sex: 'F' });
    expect(e.byClass(view.element, 'latest-centile')[0].textContent).toBe('60. centyl · WHO');
    view.destroy();
  });

  it('replaces both fullscreen canvases when restoring SVG and preserves selected Palczewska range', () => {
    const e = environment();
    const view = e.win.VildaCentileLiveView.create({ document: e.doc });
    const infant = { id: 'palInfant', height: preview(), weight: preview('weight') };
    const regular = { id: 'palRegular', height: preview(), weight: preview('weight') };
    const rendered = { status: 'ready', source: 'PALCZEWSKA', activeRangeId: 'palRegular', ranges: [infant, regular] };
    view.update(rendered, { patientId: 'fictional-a', sex: 'F' });
    const select = e.byClass(view.element, 'range')[0]; select.value = 'palInfant'; select.dispatchEvent({ type: 'change' });
    const full = { ...rendered, ranges: rendered.ranges.map(range => ({ ...range, ...Object.fromEntries(['height', 'weight'].map(metric => [metric, { ...range[metric], preview: false, vectorPatient: true, canvas: e.doc.createElement('canvas'), width: 200, height: 300, contentBounds: { x: 0, y: 0, width: 200, height: 300 } }])) })) };
    view.update(full, { patientId: 'fictional-a', sex: 'F' }); view.setFullscreen(true); view.setMetric('both');
    expect(e.byClass(view.element, 'image')).toHaveLength(2);
    expect(view.getState().rangeId).toBe('palInfant');
    view.setFullscreen(false); view.update(rendered, { patientId: 'fictional-a', sex: 'F' });
    expect(e.all(view.element).filter(node => node.tagName === 'CANVAS')).toHaveLength(0);
    expect(e.byClass(view.element, 'preview')).toHaveLength(1);
    expect(view.getState().rangeId).toBe('palInfant');
    expect(e.byClass(view.element, 'latest')[0].hidden).toBe(false);
    view.destroy();
  });
  it('uses colored measurement endpoints and unique per-segment gradients in the inline preview', () => {
    const e = environment();
    const data = preview();
    data.points.forEach((point, index) => { point.percentile = [22, 9, 2][index]; });
    const before = JSON.stringify(data);
    const a = e.win.VildaCentileLivePreview.draw(e.doc, data, 600, 450);
    const b = e.win.VildaCentileLivePreview.draw(e.doc, data, 330, 450);
    const dots = e.byClass(a.element, 'preview-point');
    expect(dots.map(dot => dot.getAttribute('fill'))).toEqual(['#087c80', '#b97519', '#bd4b50']);
    expect(dots.map(dot => dot.getAttribute('data-tone'))).toEqual(['neutral', 'warn', 'danger']);
    const gradients = e.all(a.element).filter(node => node.tagName === 'LINEARGRADIENT');
    expect(gradients).toHaveLength(2);
    expect(gradients.map(node => node.children.map(stop => stop.getAttribute('stop-color')))).toEqual([
      ['#087c80', '#b97519'], ['#b97519', '#bd4b50'],
    ]);
    expect(gradients.every(node => node.getAttribute('gradientUnits') === 'userSpaceOnUse')).toBe(true);
    const ids = e.all(a.element).concat(e.all(b.element)).filter(node => node.tagName === 'LINEARGRADIENT').map(node => node.getAttribute('id'));
    expect(new Set(ids).size).toBe(4);
    expect(e.byClass(a.element, 'preview-patient-path')).toHaveLength(2);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('shows one actual measurement as one colored dot with no fabricated path', () => {
    const e = environment();
    const data = preview(); data.points = [data.points[2]];
    const result = e.win.VildaCentileLivePreview.draw(e.doc, data, 330, 450);
    expect(e.byClass(result.element, 'preview-point')).toHaveLength(1);
    expect(e.byClass(result.element, 'preview-patient-path')).toHaveLength(0);
    expect(e.all(result.element).filter(node => node.tagName === 'LINEARGRADIENT')).toHaveLength(0);
  });

  it('keeps fullscreen point radii in CSS pixels and honors Creator label visibility', () => {
    const e = environment();
    const view = e.win.VildaCentileLiveView.create({ document: e.doc });
    const data = { ...preview(), preview: false, vectorPatient: true, valueLabelVisible: false,
      canvas: e.doc.createElement('canvas'), width: 2296, height: 3041,
      plot: { x: 190, y: 115, w: 1946, h: 2745, ageMin: 36, ageMax: 216, minY: 0, maxY: 200 },
      contentBounds: { x: 100, y: 100, width: 2100, height: 2850 } };
    data.points.forEach((point, index) => { point.percentile = [22, 9, 2][index]; });
    view.update(bundle(data), { patientId: 'fictional', sex: 'F' }); view.setFullscreen(true);
    const viewport = e.byClass(view.element, 'viewport')[0];
    for (const width of [600, 350, 900]) {
      viewport.rect.width = width; viewport.rect.height = width; view.fit();
      const layer = e.byClass(view.element, 'image')[0], scale = parseFloat(layer.style.width) / data.width;
      const dots = e.byClass(layer, 'full-point');
      expect(dots).toHaveLength(3);
      expect(Number(dots[0].getAttribute('r')) * scale).toBeCloseTo(4.6, 8);
      expect(Number(dots[2].getAttribute('r')) * scale).toBeCloseTo(5.8, 8);
      expect(dots.map(dot => dot.getAttribute('fill'))).toEqual(['#087c80', '#b97519', '#bd4b50']);
      expect(e.byClass(layer, 'full-latest-label')).toHaveLength(0);
      expect(data.canvas.parentNode).toBe(layer);
    }
    view.destroy();
  });

});
