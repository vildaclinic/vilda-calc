import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-ODTWORZ-ZYWO (zgłoszenie właściciela 2026-09-16): odtworzenie „na żywo" w panelu powłoki
// informuje moduły zdarzeniem `vilda:persist-restored`; lustro formularza nie kasuje wpisanych
// wartości pustą paczką i nie odsyła echa w trakcie odtwarzania. Dane wyłącznie FIKCYJNE.

describe('Odtworzenie „na żywo” wysyła vilda:persist-restored, a moduły daty i tożsamości je słuchają', () => {
  it('vilda_persist_runtime.js wysyła zdarzenie na końcu restore-all (w finally, po zdjęciu flag)', () => {
    const src = zrodlo('vilda_persist_runtime.js');
    const i = src.indexOf('document.dispatchEvent(new CustomEvent("vilda:persist-restored"');
    expect(i).toBeGreaterThan(-1);
    const przed = src.slice(Math.max(0, i - 700), i);
    expect(przed).toContain('window.__vildaPersistRestoring=!1');
    expect(src.slice(i, i + 400)).toContain('window.vildaAppOnReady("app:persist-restore-all"');
  });

  it('moduł daty urodzenia czyta lastLoadedData także po tym zdarzeniu', () => {
    const src = zrodlo('vilda_dob_age.js');
    expect(src).toMatch(/\['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored'\]\.forEach/);
    expect(src).toContain("var VERSION = '7';");
  });

  it('blokada tożsamości ocenia pola także po tym zdarzeniu', () => {
    const src = zrodlo('vilda_pola_tozsamosci.js');
    expect(src).toMatch(/'vilda:user-state-cleared', 'vilda:persist-restored'\]\.forEach/);
  });
});

/* Lustro formularza z custom-fixes.js uruchomione na atrapie okna: prawdziwy kod, sterowane wejścia. */
function lustro() {
  const src = zrodlo('custom-fixes.js');
  const i = src.indexOf('vilda-form-mirror-ping-v1');
  const start = src.lastIndexOf('(function(){', i);
  const koniec = src.indexOf('})()', i) + 4;
  const modul = src.slice(start, koniec);
  expect(modul).toContain('BroadcastChannel("vilda-form-mirror")');

  const el = (id) => ({
    id, value: '', nasluchy: {},
    addEventListener(n, f) { (this.nasluchy[n] = this.nasluchy[n] || []).push(f); },
    dispatchEvent(ev) { (this.nasluchy[ev.type] || []).forEach((f) => f(ev)); return true; },
  });
  const pola = {};
  ['name', 'age', 'ageMonths', 'weight', 'height', 'sex'].forEach((id) => { pola[id] = el(id); });
  const kanaly = [];
  class BC {
    constructor() { this.wyslane = []; this.nasluchy = {}; kanaly.push(this); }
    postMessage(m) { this.wyslane.push(m); }
    addEventListener(n, f) { this.nasluchy[n] = f; }
  }
  const win = {
    location: { pathname: '/index.html' },
    localStorage: { setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => (k === 'vildaTabIdV1' ? 'karta-1' : null) },
    addEventListener() {},
    __vildaPersistRestoring: false,
  };
  const doc = { getElementById: (id) => pola[id] || null, addEventListener() {} };
  new Function('window', 'document', 'BroadcastChannel', 'setTimeout', 'clearTimeout', 'Event', modul)(
    win, doc, BC, () => 0, () => {}, function Event(type) { this.type = type; });
  const kanal = kanaly[0];
  const odbierz = (msg) => kanal.nasluchy.message({ data: Object.assign({ sender: 'drugie-okno', tabId: 'karta-1', ts: 1 }, msg) });
  return { pola, win, kanal, odbierz };
}

describe('Lustro formularza (custom-fixes.js) po P-ODTWORZ-ZYWO', () => {
  it('paczka z pustymi polami nie kasuje wpisanej wagi, wzrostu ani wieku; paczka z wartościami nadpisuje', () => {
    const { pola, odbierz } = lustro();
    pola.weight.value = '30.2'; pola.height.value = '134'; pola.age.value = '9';
    odbierz({ type: 'bulk', fields: { name: '', age: '', ageMonths: '', weight: '', height: '', sex: '' } });
    expect(pola.weight.value).toBe('30.2');
    expect(pola.height.value).toBe('134');
    expect(pola.age.value).toBe('9');
    odbierz({ type: 'bulk', fields: { weight: '31', height: '135' } });
    expect(pola.weight.value).toBe('31');
    expect(pola.height.value).toBe('135');
  });

  it('jawne „Wyczyść” (clear) kasuje, a ping pojedynczego pola z pustą wartością też', () => {
    const { pola, odbierz } = lustro();
    pola.weight.value = '30.2'; pola.height.value = '134';
    odbierz({ type: 'bulk', clear: true, fields: { weight: '', height: '' } });
    expect(pola.weight.value).toBe('');
    expect(pola.height.value).toBe('');
    pola.weight.value = '30.2';
    odbierz({ key: 'weight', value: '' });
    expect(pola.weight.value).toBe('');
  });

  it('własny nadawca i obca karta są nadal ignorowane', () => {
    const { pola, odbierz, kanal } = lustro();
    pola.weight.value = '30.2';
    odbierz({ type: 'bulk', tabId: 'inna-karta', fields: { weight: '40' } });
    expect(pola.weight.value).toBe('30.2');
    pola.weight.dispatchEvent({ type: 'input' });
    const wlasny = kanal.wyslane[kanal.wyslane.length - 1];
    odbierz({ type: 'bulk', sender: wlasny.sender, fields: { weight: '41' } });
    expect(pola.weight.value).toBe('30.2');
  });

  it('w trakcie odtwarzania wspólnego stanu (__vildaPersistRestoring) zmiana pola nie wysyła pingu', () => {
    const { pola, win, kanal } = lustro();
    win.__vildaPersistRestoring = true;
    pola.weight.value = '28';
    pola.weight.dispatchEvent({ type: 'input' });
    expect(kanal.wyslane.filter((m) => m.key === 'weight')).toHaveLength(0);
    win.__vildaPersistRestoring = false;
    pola.weight.value = '29';
    pola.weight.dispatchEvent({ type: 'input' });
    expect(kanal.wyslane.filter((m) => m.key === 'weight').map((m) => m.value)).toEqual(['29']);
  });
});
