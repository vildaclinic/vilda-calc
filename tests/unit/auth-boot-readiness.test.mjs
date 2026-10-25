import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Prawdziwy boot i getter; atrapy dotyczą tylko DOM i asynchronicznych zależności.
const source = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const start = source.indexOf('var authBootReady=false;');
const end = source.indexOf('function uo(', start);
if (start < 0 || end < 0) throw new Error('Brak produkcyjnego cyklu auth boot');
const code = source.slice(start, end);
const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function harness({ guest = false, dependencies = true, initialize = () => {} } = {}) {
  const restore = pending(), startup = pending();
  const vault = { onLock() {}, onUnlock() {}, tryRestoreSession: vi.fn(() => restore.promise) };
  const hide = vi.fn(), mode = vi.fn(), show = vi.fn(() => startup.promise);
  const events = [];
  const win = { document: { dispatchEvent: event => { event.bootReady = api.isBootReady(); events.push(event); } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } };
  const api = new Function('i', 'jt', 'Ya', 'Xi', 'Aa', '$t', 'Io', 'me', 'ma', 'Ot',
    `let Ni=false;${code};return {boot:Ei,isBootReady:isAuthBootReady};`)(
    win, () => vault, () => dependencies, initialize, mode, hide, () => guest, show, () => {}, () => {},
  );
  return { api, restore, startup, vault, hide, mode, show, events };
}

describe('AuthUI: gotowość po całym pierwszym boot', () => {
  it('czeka na restore i końcowe hide, a ponowny boot nie kończy pierwszej próby', async () => {
    const h = harness();
    expect(h.api.isBootReady()).toBe(false);
    h.hide.mockImplementation(() => expect(h.api.isBootReady()).toBe(false));
    const first = h.api.boot();
    await h.api.boot();
    expect(h.api.isBootReady()).toBe(false);
    expect(h.vault.tryRestoreSession).toHaveBeenCalledOnce();
    h.restore.resolve(true); await first;
    expect(h.mode).toHaveBeenCalledExactlyOnceWith(false);
    expect(h.hide).toHaveBeenCalledOnce();
    expect(h.api.isBootReady()).toBe(true);
    expect(h.events.filter(event => event.type === 'vilda:auth-boot-settled'))
      .toMatchObject([{ detail: { ready: true }, bootReady: true }]);
  });
  it('kończy gotowość gościa dopiero po ustawieniu trybu i hide', async () => {
    const h = harness({ guest: true }); const first = h.api.boot();
    h.hide.mockImplementation(() => expect(h.api.isBootReady()).toBe(false));
    h.restore.resolve(false); await first;
    expect(h.mode).toHaveBeenCalledExactlyOnceWith(true, { skipReset: true });
    expect(h.hide).toHaveBeenCalledOnce();
    expect(h.events).toMatchObject([
      { type: 'vilda:auth-state-settled', detail: { loggedIn: false }, bootReady: false },
      { type: 'vilda:auth-boot-settled', detail: { ready: true }, bootReady: true },
    ]);
    expect(h.api.isBootReady()).toBe(true);
    expect(h.events.filter(event => event.type === 'vilda:auth-boot-settled'))
      .toMatchObject([{ detail: { ready: true }, bootReady: true }]);
  });
  it('czeka również na asynchroniczny ekran startowy bez sesji', async () => {
    const h = harness(); const first = h.api.boot();
    h.restore.resolve(false); await Promise.resolve();
    expect(h.show).toHaveBeenCalledOnce();
    expect(h.api.isBootReady()).toBe(false);
    h.startup.resolve(); await first;
    expect(h.api.isBootReady()).toBe(true);
    expect(h.events.filter(event => event.type === 'vilda:auth-boot-settled'))
      .toMatchObject([{ detail: { ready: true }, bootReady: true }]);
  });
  it('odrzucony restore nadal czeka na ekran startowy', async () => {
    const h = harness(); const first = h.api.boot();
    h.restore.reject(new Error('Fikcyjny błąd restore')); await Promise.resolve();
    expect(h.show).toHaveBeenCalledOnce();
    expect(h.api.isBootReady()).toBe(false);
    h.startup.resolve(); await first;
    expect(h.api.isBootReady()).toBe(true);
    expect(h.events.filter(event => event.type === 'vilda:auth-boot-settled'))
      .toMatchObject([{ detail: { ready: true }, bootReady: true }]);
  });
  it('zakończona błędem próba nie blokuje powłoki na zawsze i nie jest ponawiana', async () => {
    const failure = new Error('Fikcyjny błąd ekranu');
    const h = harness(); const first = h.api.boot();
    h.restore.resolve(false); await Promise.resolve(); h.startup.reject(failure);
    await expect(first).rejects.toBe(failure);
    expect(h.api.isBootReady()).toBe(true);
    expect(h.events.filter(event => event.type === 'vilda:auth-boot-settled'))
      .toMatchObject([{ detail: { ready: true }, bootReady: true }]);
    await h.api.boot();
    expect(h.vault.tryRestoreSession).toHaveBeenCalledOnce();
  });
  it('zachowuje early return brakujących zależności oraz błąd inicjalizacji', async () => {
    const missing = harness({ dependencies: false }); await missing.api.boot();
    expect(missing.api.isBootReady()).toBe(true);
    expect(missing.events).toMatchObject([{ type: 'vilda:auth-boot-settled', bootReady: true }]);
    expect(missing.vault.tryRestoreSession).not.toHaveBeenCalled();
    const failure = new Error('Fikcyjny błąd DOM');
    const broken = harness({ initialize: () => { throw failure; } });
    await expect(broken.api.boot()).rejects.toBe(failure);
    expect(broken.api.isBootReady()).toBe(true);
    expect(broken.events).toMatchObject([{ type: 'vilda:auth-boot-settled', bootReady: true }]);
    expect(broken.vault.tryRestoreSession).not.toHaveBeenCalled();
  });
});
