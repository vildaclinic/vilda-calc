import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nasluchy, powloka } from '../support/powloka-harness.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Real shell and panel authority, plus the unchanged production mirror IIFE
// boundaries used by the older mirror regression suites. Only DOM, clocks and
// transport delivery are controlled; no duplicate ownership implementation.
const source = fs.readFileSync(new URL('../../custom-fixes.js', import.meta.url), 'utf8');
const marker = source.indexOf('vilda-form-mirror-ping-v1');
const mirror = source.slice(source.lastIndexOf('(function(){', marker), source.indexOf('})()', marker) + 4);
const PID = 'fictional-mirror-visit';

function store() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}
function mount(frame, session, local, route) {
  const win = frame.contentWindow, document = frame.contentDocument, fields = {}, dispatched = [], sent = [];
  let sequence = 1, sessionToken = {}, account = 'fictional-mirror-account';
  for (const [id, value] of Object.entries({ name: 'Fikcyjny Pacjent Lustra', age: '13', ageMonths: '0', weight: '46', height: '158', sex: 'M' })) {
    const element = nasluchy({ id, value });
    const dispatch = element.dispatchEvent;
    element.dispatchEvent = event => { dispatched.push({ id, type: event.type, mirror: !!win.__vildaLustroWpis }); return dispatch(event); };
    fields[id] = element;
  }
  document.getElementById = id => fields[id] || null;
  document.defaultView = win;
  Object.assign(win, { sessionStorage: session, localStorage: local, frameElement: frame,
    location: { pathname: route === 'start' ? '/index.html' : '/docpro.html', reload() {} },
    VildaDataImportExport: { anyDataEntered: () => true, getApplyLoadedDataSequence: () => sequence },
    VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: account }),
      captureSyncOperationSession: () => sessionToken,
      assertSyncOperationSession: token => { if (token !== sessionToken) throw new Error('fictional expired account'); } },
  });
  loadBrowserScript('vilda_panel_pacjent.js', win);
  let channel;
  class BroadcastChannel {
    constructor() { channel = nasluchy(this); }
    postMessage(message) { sent.push(JSON.parse(JSON.stringify(message))); }
  }
  class Event { constructor(type) { this.type = type; } }
  new Function('window', 'document', 'BroadcastChannel', 'setTimeout', 'clearTimeout', 'Event', mirror)(
    win, document, BroadcastChannel, setTimeout, clearTimeout, Event);
  return { win, document, fields, sent, dispatched,
    input(id, value) { fields[id].value = value; fields[id].dispatchEvent({ type: 'input' }); },
    queue() { document.dispatchEvent({ type: 'vilda:state-restored' }); },
    receive(packet, transport = 'broadcast') {
      if (transport === 'broadcast') channel.dispatchEvent({ type: 'message', data: JSON.parse(JSON.stringify(packet)) });
      else win.dispatchEvent({ type: 'storage', key: packet.type === 'bulk' ? 'vilda-form-bulk-ping-v1' : 'vilda-form-mirror-ping-v1', newValue: JSON.stringify(packet) });
    },
    newVisit() { sequence += 1; win.VildaPanelPacjent.wczytanie(); },
    rotateAccount() { account = 'fictional-mirror-next-account'; sessionToken = {}; },
  };
}
function harness({ legacy = false, standalone = false } = {}) {
  const session = store(), local = store();
  session.setItem('vildaCurrentPatientId', PID); session.setItem('vildaTabIdV1', 'fictional-mirror-tab');
  const h = powloka(null, host => { host.sessionStorage = session; host.localStorage = local; });
  const docproFrame = h.ramki.get(h.shell.routes.docpro.src.split('?')[0]);
  h.shell.show('start');
  const startFrame = h.ramki.get(h.shell.routes.start.src.split('?')[0]);
  h.shell.show('docpro');
  const docpro = mount(docproFrame, session, local, 'docpro'), start = mount(startFrame, session, local, 'start');
  if (standalone) docpro.win.parent = docpro.win;
  else if (legacy) docpro.win.parent = { VildaShell: { protokolPanelu: 1 } };
  return { ...h, session, docpro, start };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('form mirror keeps the active source and same visit through queued delivery', () => {
  it('hidden same-PID pane neither sends edits/bulk nor replays deferred changes', () => {
    const h = harness();
    h.shell.show('start');
    expect(h.docpro.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    h.docpro.input('weight', '47'); h.docpro.queue();
    h.docpro.dispatched.length = 0;
    vi.advanceTimersByTime(3500);
    expect(h.docpro.sent).toEqual([]);
    expect(h.docpro.dispatched).toEqual([]);
    expect(h.start.fields.weight.value).toBe('46');
  });

  it.each(['switch', 'return', 'apply', 'account', 'clear'])('queued bulk and replay expire after %s without writing a stale visit', change => {
    const h = harness(); h.docpro.queue();
    if (change === 'switch' || change === 'return') h.shell.show('start');
    if (change === 'return') h.shell.show('docpro');
    if (change === 'apply') h.docpro.newVisit();
    if (change === 'account') h.docpro.rotateAccount();
    if (change === 'clear') {
      h.docpro.win.dispatchEvent({ type: 'vilda:user-state-cleared' });
      h.session.removeItem('vildaCurrentPatientId');
      h.docpro.win.VildaPanelPacjent.zakonczWyczyszczenie();
    }
    vi.advanceTimersByTime(3500);
    expect(h.docpro.sent).toEqual([]);
    expect(h.docpro.dispatched).toEqual([]);
  });

  it.each(['broadcast', 'storage'])('already sent %s packet is rejected after switching panes or same-PID apply', transport => {
    const h = harness();
    h.docpro.input('weight', '47');
    const packet = h.docpro.sent.at(-1);
    expect(packet).toMatchObject({ key: 'weight', value: '47', pacjent: PID, writerAuthority: expect.any(String) });
    h.start.receive(packet, transport);
    expect(h.start.fields.weight.value).toBe('47');
    h.start.fields.weight.value = '48';
    h.shell.show('start'); h.start.receive(packet, transport);
    expect(h.start.fields.weight.value).toBe('48');
    h.shell.show('docpro'); h.docpro.input('weight', '49');
    const samePatientPacket = h.docpro.sent.at(-1);
    h.docpro.newVisit(); h.start.receive(samePatientPacket, transport);
    expect(h.start.fields.weight.value).toBe('48');
  });

  it('active pane remains authorized with the browser tab hidden; mirror receiver preserves no-echo flag', () => {
    const h = harness();
    h.docpro.document.hidden = true; h.docpro.document.visibilityState = 'hidden';
    h.docpro.input('weight', '47');
    const packet = h.docpro.sent.at(-1);
    h.start.receive(packet);
    expect(h.start.fields.weight.value).toBe('47');
    expect(h.start.dispatched).toEqual([{ id: 'weight', type: 'input', mirror: true }, { id: 'weight', type: 'change', mirror: true }]);
    expect(h.start.sent).toEqual([]);
    h.docpro.dispatched.length = 0; h.docpro.sent.length = 0;
    h.docpro.queue(); vi.advanceTimersByTime(3500);
    expect(h.docpro.sent.filter(packet => packet.type === 'bulk')).toHaveLength(3);
    expect(h.docpro.dispatched).toHaveLength(6);
  });

  it('replay stops within the same callback if its first field starts a different visit', () => {
    const h = harness();
    h.docpro.fields.name.addEventListener('change', () => h.docpro.newVisit());
    h.docpro.queue(); vi.advanceTimersByTime(3200);
    expect(h.docpro.dispatched.map(event => event.id)).toEqual(['name']);
  });

  it('receiving a bulk stops after the first input if its source starts a new same-PID visit', () => {
    const h = harness();
    h.docpro.fields.name.value = 'Fikcyjny Następny Pomiar';
    h.docpro.fields.weight.value = '47'; h.docpro.fields.height.value = '159';
    h.docpro.queue(); vi.advanceTimersByTime(180);
    const packet = h.docpro.sent.at(-1);
    h.start.fields.name.addEventListener('input', () => h.docpro.newVisit());
    h.start.receive(packet);
    expect(h.start.dispatched).toEqual([{ id: 'name', type: 'input', mirror: true }]);
    expect(h.start.fields.weight.value).toBe('46');
    expect(h.start.fields.height.value).toBe('158');
    expect(h.start.sent).toEqual([]);
    expect(h.start.win.__vildaLustroWpis).toBeFalsy();
  });

  it.each([{ standalone: true }, { legacy: true }])('standalone/older shell keeps explicit blank Clear and legacy receive: %j', options => {
    const h = harness(options);
    h.docpro.document.dispatchEvent({ type: 'click', target: { closest: () => ({ id: 'clearAllDataBtn' }) } });
    h.docpro.win.dispatchEvent({ type: 'vilda:user-state-cleared' });
    h.session.removeItem('vildaCurrentPatientId');
    for (const field of Object.values(h.docpro.fields)) field.value = '';
    h.docpro.win.VildaPanelPacjent.zakonczWyczyszczenie();
    vi.advanceTimersByTime(180);
    expect(h.docpro.sent.at(-1)).toMatchObject({ type: 'bulk', clear: true, fields: { name: '', weight: '', height: '' }, pacjent: null });
    h.docpro.receive({ sender: 'fictional-legacy', tabId: 'fictional-mirror-tab', key: 'weight', value: '27' });
    expect(h.docpro.fields.weight.value).toBe('27');
  });

  it('new shell rejects an unscoped or forged legacy packet without changing any field', () => {
    const h = harness(), before = Object.fromEntries(Object.entries(h.start.fields).map(([id, field]) => [id, field.value]));
    for (const writerAuthority of [undefined, 'forged-source-ticket']) h.start.receive({
      sender: 'fictional-old-pane', tabId: 'fictional-mirror-tab', pacjent: PID, type: 'bulk', fields: { weight: '99' }, writerAuthority,
    });
    expect(Object.fromEntries(Object.entries(h.start.fields).map(([id, field]) => [id, field.value]))).toEqual(before);
  });
});
