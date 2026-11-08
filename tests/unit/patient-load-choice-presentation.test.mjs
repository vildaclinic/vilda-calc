import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Run the production sidebar, including its identity listener and visit chooser.
// The DOM adapter discovers button IDs in the real modal markup; no chooser or
// patient-choice algorithm is reproduced in this harness.
const source = fs.readFileSync(new URL('../../custom-fixes.js', import.meta.url), 'utf8');
const start = source.indexOf('(function(){function s(i,h){if(typeof showTooltip');
const marker = 'custom-fixes:sidebar-menu",S)})()';
const end = source.indexOf(marker, start) + marker.length;
if (start < 0 || end < start) throw new Error('Missing actual sidebar module boundary');
const sidebar = source.slice(start, end);
const PATIENT = 'fictional-choice-presentation-patient';
const SEQUENCE = 7;

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback)); },
    dispatchEvent(event) { for (const callback of [...listeners.get(event.type) || []]) callback(event); return true; },
  };
}

function environment({ controls = true, visible = true, presentation = true, ticketAccepted = true, dix = true } = {}) {
  const order = [], timers = [], store = new Map(), ticket = Object.freeze({});
  let wrapped = false;
  function node(tagName = 'div', id = '') {
    const attrs = new Map();
    const element = { ...eventTarget(), tagName: tagName.toUpperCase(), id, children: [], parentNode: null,
      style: {}, value: '', disabled: false, readOnly: false,
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      getAttribute: name => attrs.get(name) ?? null,
      hasAttribute: name => attrs.has(name), removeAttribute: name => attrs.delete(name),
      querySelector(selector) { return find(this, selector.slice(1)); },
      click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {} }); },
      focus() {},
    };
    Object.defineProperty(element, 'innerHTML', { set(html) {
      this.children = [];
      for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"/g)) this.appendChild(node(match[1], match[2]));
    } });
    return element;
  }
  function find(root, id) {
    if (root.id === id) return root;
    for (const child of root.children || []) { const result = find(child, id); if (result) return result; }
    return null;
  }
  const document = { ...eventTarget(), body: node('body'), createElement: tag => node(tag),
    getElementById(id) { return find(this.body, id); },
  };
  const restore = node('button', 'restoreStateBtn'); restore.style.display = visible ? 'inline-block' : 'none';
  if (controls) { document.body.appendChild(restore); document.body.appendChild(node('div', 'prevSummaryWrap')); }
  for (const id of ['age', 'ageMonths']) {
    const field = node('input', id); field.value = '13'; field.readOnly = true; field.disabled = true;
    field.addEventListener('input', () => order.push(`${id}:input`));
    field.addEventListener('change', () => order.push(`${id}:change`));
    document.body.appendChild(field);
  }
  const payload = { name: 'Fikcyjna Pacjentka Wyboru', user: { weight: 46, height: 158, dobISO: '2013-01-01' },
    advanced: { data: { measurements: [] } }, growthBasic: { data: { measurements: [] } } };
  const row = { ageMonths: 156, weight: 46, height: 158 };
  const api = {
    getApplyLoadedDataSequence: () => SEQUENCE,
    _ensureCurrentMeasurementInHistory: vi.fn(value => {
      order.push('archive');
      value.advanced.data.measurements.push({ ...row });
      value.growthBasic.data.measurements.push({ ...row });
    }),
    _reimportGhTherapyPoints: vi.fn(() => order.push('gh')),
  };
  const capture = vi.fn(detail => { order.push('capture'); return ticketAccepted ? ticket : null; });
  const finish = vi.fn(value => order.push(['finish', value]));
  const runRestore = vi.fn((value, callback) => {
    order.push(['restore:begin', value]); wrapped = true;
    try { return callback(); } finally { wrapped = false; order.push('restore:end'); }
  });
  if (presentation) Object.assign(api, {
    capturePatientLoadChoicePresentation: capture,
    finishPatientLoadChoicePresentation: finish,
    runPatientLoadChoiceRestorePresentation: runRestore,
  });
  const originalConfirm = vi.fn(() => false);
  const win = { ...eventTarget(), document, lastLoadedData: payload, confirm: originalConfirm,
    sessionStorage: { getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    VildaSession: { isLoggedIn: () => true },
    VildaVault: { calcAgeFromDOB: () => ({ years: 13, ageMonths: 9 }), onUnlock() {}, onLock() {} },
    vildaOnReady: (_name, callback) => callback(),
    vildaRehydrateAdvancedFromState: vi.fn(() => order.push('rehydrate')),
    restoreLoadedState: vi.fn(() => order.push({ type: 'fallback', wrapped, confirmed: win.confirm() })),
  };
  if (dix) win.VildaDataImportExport = api;
  const restored = [];
  restore.addEventListener('click', () => {
    restored.push({ wrapped, confirmed: win.confirm(), choice: store.get('vildaLoadChoiceV1') });
    order.push('native:restore');
  });
  const choices = [];
  document.addEventListener('vilda:load-choice-applied', event => {
    order.push('choice:applied'); choices.push(event.detail);
  });
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  new Function('window', 'document', 'setTimeout', 'setInterval', 'clearInterval', 'Event', 'CustomEvent', sidebar)(
    win, document, callback => { timers.push(callback); return timers.length; }, () => 0, () => {}, Event, CustomEvent,
  );
  const detail = { source: 'pick', patientId: PATIENT, name: payload.name, applySequence: SEQUENCE, acceptedLoadAuthority: {} };
  function load(value = detail) { document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: value })); }
  return { win, document, store, ticket, api, capture, finish, runRestore, payload, row, restore, restored,
    originalConfirm, order, choices, detail, timers, load,
    open() { load(); expect(timers).toHaveLength(1); timers.shift()(); return document.getElementById('vildaLoadChoiceModal'); },
    click(id) { const control = document.getElementById(id); expect(control, `missing production control ${id}`).not.toBeNull(); control.click(); },
  };
}

describe('actual native visit chooser presentation lifecycle', () => {
  it('captures the exact native detail synchronously before the queued chooser opens', () => {
    const h = environment(); h.load();
    expect(h.capture).toHaveBeenCalledExactlyOnceWith(h.detail);
    expect(h.document.getElementById('vildaLoadChoiceModal')).toBeNull();
    expect(h.timers).toHaveLength(1); expect(h.finish).not.toHaveBeenCalled();
    h.timers.shift()();
    expect(h.document.getElementById('vildaLoadChoiceModal')).not.toBeNull();
    expect(h.finish).not.toHaveBeenCalled();
    expect(h.store.get('vildaCurrentPatientId')).toBe(PATIENT);
  });

  it.each([{ controls: false }, { visible: false }])('finishes when the native page has no available chooser (%j)', options => {
    const h = environment(options); expect(h.open()).toBeNull();
    expect(h.finish).toHaveBeenCalledExactlyOnceWith(h.ticket);
    expect(h.api._ensureCurrentMeasurementInHistory).not.toHaveBeenCalled();
    expect(h.restored).toEqual([]);
  });

  it('finishes New only after exact loaded-payload archiving, age update and the existing choice event', () => {
    const h = environment(); h.open(); h.click('vildaLcmNew');
    expect(h.api._ensureCurrentMeasurementInHistory).toHaveBeenCalledExactlyOnceWith(h.payload);
    expect(h.win.advancedGrowthData.measurements).toEqual([h.row]);
    expect(h.win.basicGrowthData.measurements).toEqual([h.row]);
    expect(h.win.advancedGrowthData.measurements[0]).not.toBe(h.payload.advanced.data.measurements[0]);
    expect(h.win.basicGrowthData.measurements[0]).not.toBe(h.payload.growthBasic.data.measurements[0]);
    expect(h.document.getElementById('age').value).toBe('13');
    expect(h.document.getElementById('ageMonths').value).toBe('9');
    expect(h.store.get('vildaLoadChoiceV1')).toBe('new');
    expect(h.choices).toEqual([{ choice: 'new', patientId: PATIENT, applySequence: SEQUENCE }]);
    expect(h.order).toEqual(['capture', 'archive', 'rehydrate', 'gh', 'age:input', 'age:change',
      'ageMonths:input', 'ageMonths:change', 'choice:applied', ['finish', h.ticket]]);
    expect(h.finish).toHaveBeenCalledExactlyOnceWith(h.ticket);
    expect(h.document.getElementById('vildaLoadChoiceModal')).toBeNull();
    expect(h.runRestore).not.toHaveBeenCalled(); expect(h.restored).toEqual([]);
  });

  it.each(['Escape', 'backdrop'])('finishes a dismissed chooser by %s without changing the visit', action => {
    const h = environment(), modal = h.open();
    if (action === 'Escape') h.document.dispatchEvent({ type: 'keydown', key: 'Escape' });
    else modal.dispatchEvent({ type: 'mousedown', target: modal });
    expect(h.finish).toHaveBeenCalledExactlyOnceWith(h.ticket);
    expect(h.document.getElementById('vildaLoadChoiceModal')).toBeNull();
    expect(h.restore.style.display).toBe('inline-block');
    expect(h.store.has('vildaLoadChoiceV1')).toBe(false);
    expect(h.api._ensureCurrentMeasurementInHistory).not.toHaveBeenCalled();
    expect(h.choices).toEqual([]); expect(h.restored).toEqual([]);
  });

  it('keeps Restore inside its presentation continuation until the native API completes it', () => {
    const h = environment(); h.open(); h.click('vildaLcmRestore');
    expect(h.runRestore).toHaveBeenCalledOnce();
    expect(h.runRestore.mock.calls[0][0]).toBe(h.ticket);
    expect(h.restored).toEqual([{ wrapped: true, confirmed: true, choice: 'restore' }]);
    expect(h.win.confirm).toBe(h.originalConfirm);
    expect(h.finish).not.toHaveBeenCalled(); expect(h.choices).toEqual([]);
    expect(h.api._ensureCurrentMeasurementInHistory).not.toHaveBeenCalled();
    expect(h.document.getElementById('vildaLoadChoiceModal')).toBeNull();
  });

  it('preserves the existing Restore fallback inside the same continuation', () => {
    const h = environment(); h.open(); h.restore.parentNode.removeChild(h.restore); h.click('vildaLcmRestore');
    expect(h.win.restoreLoadedState).toHaveBeenCalledOnce();
    expect(h.order).toContainEqual({ type: 'fallback', wrapped: true, confirmed: true });
    expect(h.finish).not.toHaveBeenCalled(); expect(h.win.confirm).toBe(h.originalConfirm);
  });

  it('keeps the native Restore callback when the presentation capability refuses a ticket', () => {
    const h = environment({ ticketAccepted: false }); h.open(); h.click('vildaLcmRestore');
    expect(h.runRestore.mock.calls[0][0]).toBeNull();
    expect(h.restored).toEqual([{ wrapped: true, confirmed: true, choice: 'restore' }]);
    expect(h.finish).not.toHaveBeenCalled();
  });

  it.each([true, false])('preserves legacy Restore when presentation methods are absent (DIX=%s)', dix => {
    const h = environment({ presentation: false, dix }); h.open(); h.click('vildaLcmRestore');
    expect(h.restored).toEqual([{ wrapped: false, confirmed: true, choice: 'restore' }]);
    expect(h.win.confirm).toBe(h.originalConfirm);
    expect(h.capture).not.toHaveBeenCalled(); expect(h.finish).not.toHaveBeenCalled();
  });

  it('preserves legacy New when only the presentation methods are absent', () => {
    const h = environment({ presentation: false }); h.open(); h.click('vildaLcmNew');
    expect(h.api._ensureCurrentMeasurementInHistory).toHaveBeenCalledExactlyOnceWith(h.payload);
    expect(h.choices).toEqual([{ choice: 'new', patientId: PATIENT, applySequence: SEQUENCE }]);
    expect(h.store.get('vildaLoadChoiceV1')).toBe('new'); expect(h.finish).not.toHaveBeenCalled();
  });

  it('does not arm a chooser for an own Save or an explicitly skipped choice', () => {
    const h = environment();
    h.load({ ...h.detail, source: 'save' });
    h.load({ ...h.detail, skipLoadChoice: true });
    expect(h.capture).not.toHaveBeenCalled(); expect(h.timers).toEqual([]);
    expect(h.finish).not.toHaveBeenCalled();
  });
});
