import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const LEGACY = Object.freeze({ mode: 'legacy', code: null, writeAvailable: false });
const BLOCKED = Object.freeze({ mode: 'protected-unavailable', code: 'IDENTITY_BOOTSTRAP_UNVERIFIED', writeAvailable: false });
const MATERIAL = { slotId: 'FICTIONAL-REALTIME-SLOT', authToken: 'FICTIONAL-REALTIME-TOKEN' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function device({ selection = LEGACY, missingSelector = false } = {}) {
  let route = selection;
  const sockets = [], listeners = new Map(), documentListeners = new Map();
  class Socket {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.readyState = 0;
      this.send = vi.fn();
      // Synchronous close deliberately stresses the route guard's reentrancy.
      this.close = vi.fn(() => { this.readyState = 3; this.onclose?.({ code: 1000 }); });
      sockets.push(this);
    }
  }
  const vault = { isUnlocked: () => true, getSyncMaterial: vi.fn(async () => MATERIAL), onUnlock: vi.fn(), onLock: vi.fn() };
  if (!missingSelector) vault.selectPatientClinicalRoute = vi.fn(() => route);
  const integration = { isSyncEnabled: () => true, pullNow: vi.fn(), applyDelta: vi.fn() };
  const win = { VildaVault: vault, VildaSyncIntegration: integration, WebSocket: Socket,
    navigator: { onLine: true }, setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener: (name, callback) => listeners.set(name, callback),
    document: { hidden: false, addEventListener: (name, callback) => documentListeners.set(name, callback) } };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_realtime.js', win);
  return { win, vault, integration, sockets, listeners, documentListeners, realtime: win.VildaRealtime,
    setRoute: value => { route = value; } };
}

async function open(d) {
  d.realtime.connect();
  await Promise.resolve(); await Promise.resolve();
  const socket = d.sockets[0];
  expect(socket).toBeTruthy();
  socket.readyState = 1; socket.onopen();
  return socket;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('patient authority routing in the real WebSocket client', () => {
  it('does not acquire identity, create a socket or add timers on a protected connection attempt', () => {
    const d = device({ selection: BLOCKED }), originalTimerCount = vi.getTimerCount();
    d.realtime.connect();
    expect(d.vault.getSyncMaterial).not.toHaveBeenCalled(); expect(d.sockets).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(originalTimerCount);
    expect(d.realtime.info()).toMatchObject({ status: 'closed', lastError: BLOCKED.code });
  });

  it.each([false, true])('preserves the legacy socket URL, protocol, heartbeat and pull (old bundle = %s)', async missingSelector => {
    const d = device({ missingSelector }), socket = await open(d);
    expect(socket.url).toBe('wss://vilda-sync.maciej-4b9.workers.dev/v1/slots/FICTIONAL-REALTIME-SLOT/socket');
    expect(socket.protocols).toEqual(['vilda-auth', MATERIAL.authToken]);
    expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1); expect(d.integration.pullNow).toHaveBeenCalledTimes(1);
    expect(d.realtime.info()).toMatchObject({ status: 'open', opens: 1, lastError: null });
    await vi.advanceTimersByTimeAsync(25000);
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ type: 'ping', ts: expect.any(Number) });
    expect(d.sockets).toHaveLength(1); expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    d.realtime.disconnect();
  });

  it('rechecks held material before constructing a socket', async () => {
    const d = device(), held = deferred(); d.vault.getSyncMaterial.mockReturnValue(held.promise);
    d.realtime.connect(); expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    d.setRoute(BLOCKED); held.resolve(MATERIAL);
    await Promise.resolve(); await Promise.resolve();
    expect(d.sockets).toHaveLength(0); expect(d.integration.pullNow).not.toHaveBeenCalled();
    expect(d.realtime.status()).toBe('closed');
    await vi.advanceTimersByTimeAsync(60000);
    expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1); expect(d.sockets).toHaveLength(0);
  });

  it.each([
    ['old open callback', (_d, socket) => socket.onopen()],
    ['changed frame', (_d, socket) => socket.onmessage({ data: JSON.stringify({ type: 'changed' }) })],
    ['delta frame', (_d, socket) => socket.onmessage({ data: JSON.stringify({ type: 'delta', payload: { fictional: true } }) })],
    ['error callback', (_d, socket) => socket.onerror()],
    ['close callback', (_d, socket) => socket.onclose({ code: 1006 })],
    ['focus callback', d => d.listeners.get('focus')()],
    ['visibility callback', d => d.documentListeners.get('visibilitychange')()],
  ])('prevents %s from acting after private selection changes', async (_label, trigger) => {
    const d = device(), socket = await open(d);
    d.integration.pullNow.mockClear(); d.setRoute(BLOCKED);
    trigger(d, socket);
    expect(d.integration.pullNow).not.toHaveBeenCalled(); expect(d.integration.applyDelta).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled(); expect(socket.close).toHaveBeenCalledTimes(1);
    expect(d.realtime.info()).toMatchObject({ status: 'closed', lastError: BLOCKED.code });
    // The pre-existing startup callback can fire, but cannot reconnect.
    await vi.advanceTimersByTimeAsync(60000);
    expect(d.sockets).toHaveLength(1); expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
  });

  it('stops the existing heartbeat before sending after private selection changes', async () => {
    const d = device(), socket = await open(d);
    await vi.advanceTimersByTimeAsync(1200);
    d.setRoute(BLOCKED);
    await vi.advanceTimersByTimeAsync(23800);
    expect(socket.send).not.toHaveBeenCalled(); expect(socket.close).toHaveBeenCalledTimes(1);
    expect(d.sockets).toHaveLength(1); expect(d.realtime.status()).toBe('closed');
  });

  it('retains ordinary legacy inbound delta delivery', async () => {
    const d = device(), socket = await open(d), payload = { fictional: 'encrypted-delta' };
    socket.onmessage({ data: JSON.stringify({ type: 'delta', payload }) });
    expect(d.integration.applyDelta).toHaveBeenCalledExactlyOnceWith(payload);
    socket.onmessage({ data: JSON.stringify({ type: 'changed' }) });
    expect(d.integration.pullNow).toHaveBeenCalledTimes(2);
    d.realtime.disconnect();
  });

  it('ignores callbacks retained from a disconnected legacy socket', async () => {
    const d = device(), socket = await open(d);
    d.realtime.disconnect(); d.integration.pullNow.mockClear();
    socket.onopen(); socket.onmessage({ data: JSON.stringify({ type: 'delta', payload: { fictional: true } }) });
    socket.onclose({ code: 1006 }); socket.onerror();
    expect(d.integration.applyDelta).not.toHaveBeenCalled(); expect(d.integration.pullNow).not.toHaveBeenCalled();
    expect(d.realtime.status()).toBe('closed'); expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('cannot construct an old socket after disconnect while legacy identity material was pending', async () => {
    const d = device(), held = deferred(); d.vault.getSyncMaterial.mockReturnValueOnce(held.promise);
    d.realtime.connect(); expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    d.realtime.disconnect(); held.resolve(MATERIAL);
    await Promise.resolve(); await Promise.resolve();
    expect(d.sockets).toHaveLength(0); expect(d.realtime.status()).toBe('closed');
    expect(d.integration.pullNow).not.toHaveBeenCalled();
  });
});
