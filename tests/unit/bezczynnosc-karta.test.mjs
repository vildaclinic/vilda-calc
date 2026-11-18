import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

// P-BEZCZYNNOSC-KARTA: jedna karta = jedna sesja aktywności i jeden koniec sesji. Produkcyjne funkcje z
// vilda_auth_ui.js (wycięte po nazwie), prawdziwy vilda_persistence_adapter.js i prawdziwy vilda_session_bridge.js;
// atrapy dotyczą tylko okien i sejfu. Dane fikcyjne.
const source = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const SESSION_RECORD = 'vilda-vault-session-v2';
const MARKERS = ['vildaCurrentPatientId', 'vilda-save-ref-v1', 'vildaPrevSummaryPid', 'vildaPrevSummaryAnchor', 'vildaLoadChoiceV1', 'vildaDobAgeZapisV1'];
const SESSIONS = ['vildaMainSessionV1', 'vildaClcrSessionV1', 'vildaSteroidsSessionV1', 'sharedUserData'];
const KEPT = ['VildaGuestMode', 'vilda-vault-removed-v1'];
const FUNCTIONS = ['vildaRecordActivity', 'vildaRecordPeerActivity', 'vildaTabPeers', 'vildaClearTabWorkState', 'vildaEndTabSession'];
const cut = FUNCTIONS.map(name => wytnijFunkcje(source, name)).join(';');

function storage() {
  const data = new Map();
  return {
    get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(String(key)) ?? null, setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: key => { data.delete(String(key)); }, clear: () => { throw new Error('the tab storage must never be cleared as a whole'); },
  };
}

// Okno z prawdziwym adapterem zapisu i wyciętymi funkcjami modułu konta.
function clearHarness({ sessionRecord = false, mode = 'normal' } = {}) {
  const local = storage(), session = storage(), events = [], warnings = [];
  const win = { localStorage: local, sessionStorage: session, navigator: {}, name: '', _vildaCurrentPatientId: 'FICTIONAL-ID',
    dispatchEvent: event => { events.push(event); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
  loadBrowserScript('vilda_persistence_adapter.js', win);
  if (mode === 'ephemeral') win.VildaPersistence.setEphemeralMode(true);
  for (const key of [...SESSIONS, ...MARKERS, ...KEPT]) session.setItem(key, JSON.stringify({ fictional: 'FICTIONAL-PATIENT ' + key }));
  local.setItem('vilda-trust-device-v1', '1');
  local.setItem('labAssayProfiles', 'FICTIONAL-PROFILE');
  if (sessionRecord) session.setItem(SESSION_RECORD, 'FICTIONAL-ENCRYPTED-SESSION');
  const api = new Function('i', 'jt', 'Ot', 'let Bn=0;' + cut + ';return {clear:vildaClearTabWorkState,end:vildaEndTabSession};')(
    win, () => null, (where, error) => warnings.push(where + ': ' + error.message));
  return { win, local, session, events, warnings, api };
}

describe('stan roboczy karty po końcu sesji (vildaClearTabWorkState)', () => {
  it('karta bez zapisu sesji: znikają sesje formularzy i znaczniki wczytanego pacjenta, bez zdarzenia', () => {
    const h = clearHarness();
    expect(h.api.clear()).toBe(true);
    for (const key of [...SESSIONS, ...MARKERS]) expect(h.session.getItem(key), key).toBeNull();
    for (const key of KEPT) expect(h.session.getItem(key), key).not.toBeNull();
    expect(h.win._vildaCurrentPatientId).toBeNull();
    expect(h.local.getItem('vilda-trust-device-v1')).toBe('1');
    expect(h.local.getItem('labAssayProfiles')).toBe('FICTIONAL-PROFILE');
    expect(h.events).toEqual([]);
    expect(h.warnings).toEqual([]);
  });
  it('karta z zapisem sesji (inny dokument karty nadal zalogowany): nic nie znika', () => {
    const h = clearHarness({ sessionRecord: true });
    expect(h.api.clear()).toBe(false);
    for (const key of [...SESSIONS, ...MARKERS]) expect(h.session.getItem(key), key).not.toBeNull();
    expect(h.win._vildaCurrentPatientId).toBe('FICTIONAL-ID');
    expect(h.events).toEqual([]);
  });
  it('bez adaptera zapisu usuwa znaczniki; nieczytelny magazyn nie rzuca', () => {
    const h = clearHarness();
    h.win.VildaPersistence = undefined;
    expect(h.api.clear()).toBe(true);
    for (const key of MARKERS) expect(h.session.getItem(key), key).toBeNull();
    const broken = clearHarness();
    broken.session.getItem = () => { throw new Error('FICTIONAL-STORAGE-FAILURE'); };
    expect(broken.api.clear()).toBe(false);
    expect(broken.warnings).toHaveLength(1);
  });
});

// Dokument karty: własny sejf, własny znacznik aktywności i wycięte funkcje produkcyjne.
function view(name, { unlocked = true, top = null } = {}) {
  const calls = [];
  const vault = { isUnlocked: () => v.unlocked, resetIdleTimer: () => calls.push('timer'), refreshPersistedSession: () => calls.push('session'),
    lock: reason => { calls.push('lock:' + reason); v.unlocked = false; } };
  const session = top ? top.sessionStorage : storage();
  const v = { name, unlocked, calls, VildaVault: vault, frames: [], document: {}, sessionStorage: session };
  v.top = top || v;
  const api = new Function('i', 'jt', 'Ot', 'let Bn=0;' + cut
    + ';return {record:vildaRecordActivity,peer:vildaRecordPeerActivity,peers:vildaTabPeers,end:vildaEndTabSession,last:()=>Bn};')(v, () => vault, () => {});
  v.api = api;
  v.VildaAuthUI = { recordActivity: api.record, recordPeerActivity: (...args) => { calls.push('peer'); return api.peer(...args); } };
  return v;
}
function tab() {
  const shell = view('shell');
  const a = view('a', { top: shell }), b = view('b', { top: shell }), locked = view('locked', { top: shell, unlocked: false });
  const foreign = new Proxy({}, { get() { throw new Error('SecurityError (fictional cross-origin frame)'); } });
  const empty = {};
  shell.frames.push(a, b, locked, foreign, empty);
  return { shell, a, b, locked };
}

describe('aktywność w drzewie ramek jednej karty', () => {
  it('aktywność w ramce odświeża własny dokument i raz każdy inny, bez dalszego rozsyłania i bez zapisu sesji u rówieśników', () => {
    const t = tab();
    t.a.api.record({ isTrusted: true });
    expect(t.a.calls).toEqual(['timer', 'session']);
    expect(t.shell.calls).toEqual(['peer', 'timer']);
    expect(t.b.calls).toEqual(['peer', 'timer']);
    expect(t.locked.calls).toEqual(['peer', 'timer']);
    for (const v of [t.a, t.shell, t.b]) expect(v.api.last()).toBeGreaterThan(0);
  });
  it('wywołanie bez zdarzenia (okna przeniesione do powłoki) też dociera do pozostałych dokumentów', () => {
    const t = tab();
    t.shell.api.record();
    expect(t.shell.calls).toEqual(['timer', 'session']);
    expect(t.a.calls).toEqual(['peer', 'timer']);
    expect(t.b.calls).toEqual(['peer', 'timer']);
  });
  it('zdarzenie niezaufane zostaje lokalne', () => {
    const t = tab();
    t.a.api.record({ isTrusted: false });
    expect(t.a.calls).toEqual(['timer', 'session']);
    for (const v of [t.shell, t.b, t.locked]) expect(v.calls).toEqual([]);
  });
  it('odbiorca niczego nie rozsyła i nie zapisuje sesji', () => {
    const t = tab();
    t.b.api.peer();
    expect(t.b.calls).toEqual(['timer']);
    for (const v of [t.shell, t.a, t.locked]) expect(v.calls).toEqual([]);
  });
  it('kolejność: dokument główny pierwszy, potem ramki; bez własnego dokumentu', () => {
    const t = tab();
    expect(t.a.api.peers().slice(0, 3).map(v => v.name)).toEqual(['shell', 'b', 'locked']);
    expect(t.a.api.peers()).toHaveLength(5);
    expect(t.shell.api.peers()).not.toContain(t.shell);
    expect(t.shell.api.peers()).toHaveLength(5);
  });
  it('okno bez drzewa ramek i okno w obcej domenie: tylko lokalnie, bez wyjątku', () => {
    const alone = view('alone'); delete alone.frames; alone.top = undefined;
    expect(() => alone.api.record()).not.toThrow();
    expect(alone.calls).toEqual(['timer', 'session']);
    const embedded = view('embedded');
    Object.defineProperty(embedded, 'top', { get() { return new Proxy({}, { get() { throw new Error('SecurityError'); } }); } });
    expect(() => embedded.api.record()).not.toThrow();
    expect(embedded.calls).toEqual(['timer', 'session']);
    expect(embedded.api.peers()).toEqual([]);
  });
});

describe('koniec sesji karty (vildaEndTabSession)', () => {
  it.each(['idle', 'manual'])('blokada %s z dokumentu głównego blokuje odblokowane ramki tym samym powodem; zablokowana jest pomijana', reason => {
    const t = tab();
    t.shell.unlocked = false;
    t.shell.api.end(reason);
    expect(t.a.calls).toEqual(['lock:' + reason]);
    expect(t.b.calls).toEqual(['lock:' + reason]);
    expect(t.locked.calls).toEqual([]);
  });
  it('blokada idle z ramki blokuje dokument główny i pozostałe ramki, dokument główny pierwszy', () => {
    const t = tab(); const order = [];
    for (const v of [t.shell, t.b]) { const lock = v.VildaVault.lock; v.VildaVault.lock = reason => { order.push(v.name); lock(reason); }; }
    t.a.unlocked = false;
    t.a.api.end('idle');
    expect(order).toEqual(['shell', 'b']);
    t.a.api.end('idle');
    expect(order).toEqual(['shell', 'b']);
  });
  it('wylogowanie zaczęte w ramce: dokument główny idzie istniejącą drogą resync, pozostałe ramki są blokowane', () => {
    const t = tab(); let resync = 0;
    t.shell.VildaFrameSync = { resync: () => { resync += 1; } };
    t.a.unlocked = false;
    t.a.api.end('manual');
    expect(resync).toBe(1);
    expect(t.shell.calls).toEqual([]);
    expect(t.b.calls).toEqual(['lock:manual']);
    t.b.unlocked = true; t.b.calls.length = 0;
    t.a.api.end('idle');
    expect(resync).toBe(1);
    expect(t.shell.calls).toEqual(['lock:idle']);
  });
  it('wylogowanie z ramki bez modułu powiadomień w dokumencie głównym blokuje także dokument główny', () => {
    const t = tab();
    t.a.unlocked = false;
    t.a.api.end('manual');
    expect(t.shell.calls).toEqual(['lock:manual']);
  });
  it.each(['user', 'sync', 'user-removed', 'user-removed-elsewhere', 'invalid-qr-session', undefined])('powód %s nie jest rozsyłany, a stan roboczy karty i tak znika', reason => {
    const t = tab();
    for (const key of [...SESSIONS, ...MARKERS]) t.shell.sessionStorage.setItem(key, 'FICTIONAL');
    t.a.unlocked = false;
    t.a.api.end(reason);
    for (const v of [t.shell, t.b, t.locked]) expect(v.calls).toEqual([]);
    for (const key of MARKERS) expect(t.shell.sessionStorage.getItem(key), key).toBeNull();
  });
  it('usunięcie konta przy zapisie sesji innego konta w karcie: stan roboczy zostaje', () => {
    const t = tab();
    for (const key of MARKERS) t.shell.sessionStorage.setItem(key, 'FICTIONAL');
    t.shell.sessionStorage.setItem(SESSION_RECORD, 'FICTIONAL-OTHER-ACCOUNT-SESSION');
    t.a.unlocked = false;
    t.a.api.end('user-removed');
    for (const key of MARKERS) expect(t.shell.sessionStorage.getItem(key), key).toBe('FICTIONAL');
  });
});

describe('most sesji: aktywność strony bez czynnego modułu konta', () => {
  function bridge({ top = true, ownAuth = false, ownUnlocked = false } = {}) {
    const listeners = {};
    const record = vi.fn();
    const win = {
      sessionStorage: storage(), localStorage: storage(), location: { pathname: '/homa-ir.html', search: '?embedded=1' },
      document: { readyState: 'complete', documentElement: { classList: { contains: () => false } }, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
        querySelector: () => null, dispatchEvent: () => {}, createElement: () => ({}), head: { appendChild: () => {} } },
      addEventListener: () => {}, CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout,
    };
    win.top = top === true ? { VildaAuthUI: { recordActivity: record } } : top === 'self' ? win : top;
    if (ownAuth) { win.VildaAuthUI = {}; win.VildaVault = { isUnlocked: () => ownUnlocked }; }
    loadBrowserScript('vilda_session_bridge.js', win);
    const fire = (type, event) => (listeners[type] || []).forEach(fn => fn(event));
    return { fire, record, listeners };
  }
  it('zaufane wejście w dokumencie bez modułu konta trafia do dokumentu głównego', () => {
    const h = bridge();
    for (const type of ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown']) h.fire(type, { isTrusted: true });
    expect(h.record).toHaveBeenCalledTimes(5);
  });
  it('zdarzenie niezaufane, własny czynny moduł konta, strona samodzielna i obca domena: nic nie jest przekazywane', () => {
    const untrusted = bridge(); untrusted.fire('keydown', { isTrusted: false }); untrusted.fire('keydown', undefined);
    expect(untrusted.record).not.toHaveBeenCalled();
    const own = bridge({ ownAuth: true, ownUnlocked: true }); own.fire('keydown', { isTrusted: true });
    expect(own.record).not.toHaveBeenCalled();
    const alone = bridge({ top: 'self' }); expect(() => alone.fire('keydown', { isTrusted: true })).not.toThrow();
    const foreign = bridge({ top: new Proxy({}, { get() { throw new Error('SecurityError'); } }) });
    expect(() => foreign.fire('keydown', { isTrusted: true })).not.toThrow();
  });
  it('własny moduł konta z zamkniętym sejfem: wejście trafia do dokumentu głównego', () => {
    const h = bridge({ ownAuth: true, ownUnlocked: false }); h.fire('keydown', { isTrusted: true });
    expect(h.record).toHaveBeenCalledOnce();
  });
});

// Start zablokowanego dokumentu: prawdziwy cykl startu modułu konta (jak auth-boot-readiness.test.mjs).
describe('start strony po zakończonej sesji', () => {
  const from = source.indexOf('var authBootReady=false;'), to = source.indexOf('function uo(', from);
  const bootCode = source.slice(from, to);
  async function boot({ guest = false, restored = false, sessionRecord = false, residue = true } = {}) {
    const local = storage(), session = storage();
    const win = { localStorage: local, sessionStorage: session, navigator: {}, name: '', dispatchEvent: () => {}, document: { dispatchEvent: () => {} },
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
    loadBrowserScript('vilda_persistence_adapter.js', win);
    if (residue) for (const key of [...SESSIONS, ...MARKERS]) session.setItem(key, JSON.stringify({ version: 1, name: 'FICTIONAL-RETAINED-PATIENT' }));
    if (sessionRecord) session.setItem(SESSION_RECORD, 'FICTIONAL-ENCRYPTED-SESSION');
    const left = () => [...SESSIONS, ...MARKERS].filter(key => session.getItem(key) != null).length;
    const vault = { onLock() {}, onUnlock() {}, tryRestoreSession: async () => restored, getStatus: () => null };
    const seen = [];
    const show = vi.fn(async (_banner, options) => { seen.push({ options, left: left() }); });
    const mode = vi.fn();
    const api = new Function('i', 'jt', 'Ya', 'Xi', 'Aa', '$t', 'Io', 'me', 'ma', 'Ot', 'Bkr_sluchaj', 'Bkr_banerStartu',
      `let Ni=false;${bootCode};return {boot:Ei};`)(win, () => vault, () => true, () => {}, mode, () => {}, () => guest, show, () => {}, () => {}, () => {}, () => undefined);
    await api.boot();
    return { seen, mode, left: left(), total: SESSIONS.length + MARKERS.length };
  }
  it('zablokowany start z pozostałym stanem i bez zapisu sesji: stan znika przed ekranem logowania, reset ekranu bez zmian', async () => {
    const h = await boot();
    expect(h.seen).toEqual([{ options: { skipReset: false }, left: 0 }]);
  });
  it('tryb gościa: stan zostaje', async () => {
    const h = await boot({ guest: true });
    expect(h.left).toBe(h.total);
    expect(h.mode).toHaveBeenCalledExactlyOnceWith(true, { skipReset: true });
    expect(h.seen).toEqual([]);
  });
  it('sesja odtworzona (odświeżenie przy odblokowanym sejfie): stan zostaje', async () => {
    const h = await boot({ restored: true, sessionRecord: true });
    expect(h.left).toBe(h.total);
    expect(h.seen).toEqual([]);
  });
  it('odtworzenie nieudane, ale karta nadal ma zapis sesji: stan zostaje, reset ekranu jak dotąd', async () => {
    const h = await boot({ sessionRecord: true });
    expect(h.seen).toEqual([{ options: { skipReset: false }, left: h.total }]);
  });
  it('pusty start: nic do czyszczenia, ekran bez resetu', async () => {
    const h = await boot({ residue: false });
    expect(h.seen).toEqual([{ options: { skipReset: true }, left: 0 }]);
  });
});
