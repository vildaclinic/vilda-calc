import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POWLOKA-PANELE (zgłoszenie właściciela 2026-09-28): w powłoce app.html po wczytaniu pacjenta na Start
// i przejściu na DocPro formularz główny DocPro był pusty albo częściowy. Przełączenie paneli nie wywołuje
// pagehide, a sesja główna (jedyny kanał niosący cały rekord) była zapisywana wyłącznie z zdarzeń
// input/change z debounce 300 ms — i pomijana, gdy timer trafiał w okno zawieszenia po wczytaniu
// (`__vildaPersistPauseUntil`, odtwarzanie w toku). Zmierzone: pierwszy zapis ~3,9 s po „Odtwórz zapis”.
//
// Test woła PRAWDZIWY moduł vilda_data_import_export.js na atrapie okna z atrapą VildaPersistence:
//   1. `vildaSession.saveNow({force:true})` zapisuje mimo okna zawieszenia; bez force — nie (jak dotąd);
//   2. zaplanowany zapis z input/change nie przepada w oknie zawieszenia, tylko jest ponawiany;
//   3. pagehide zapisuje z force (jak flush persist);
//   4. strażnicy źródła: wymuszony zapis na końcu applyLoadedData i restoreLoadedState przed pingiem
//      vilda:sharedLoadSeq, pomijany przy odtwarzaniu sesji; powłoka zapisuje panel źródłowy przed
//      przełączeniem i odtwarza docelowy po zmianie odcisku sesji.
// Kontrola negatywna przywraca stary timer (zapis porzucany w oknie zawieszenia). Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const REKORD = () => ({ version: 1, name: 'Fikcyjna Ewa', user: { age: 9, ageMonths: 4, sex: 'K', height: 134, weight: 30.2 } });

function atrapaOkna() {
  const nasluchy = { doc: {}, win: {} };
  const zapisy = [];
  let sesja = null;
  const win = {
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/index.html', href: 'http://localhost/index.html' },
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    addEventListener(n, f) { (nasluchy.win[n] = nasluchy.win[n] || []).push(f); },
    removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false, visibilityState: 'visible',
      addEventListener(n, f) { (nasluchy.doc[n] = nasluchy.doc[n] || []).push(f); },
      removeEventListener() {}, dispatchEvent() { return true; },
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    },
    VildaPersistence: {
      getStorage: (k) => (k === 'session' ? {} : null),
      readMainSession: () => sesja,
      writeMainSession: (p) => { zapisy.push(p); sesja = p; return true; },
      clearMainSession: () => { sesja = null; },
    },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  return { win, nasluchy, zapisy };
}

const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
const zdarzenie = (typ) => ({ type: typ, target: { matches: () => true } });

function uruchom(src) {
  const env = atrapaOkna();
  if (src) new Function('window', 'globalThis', src)(env.win, env.win); else loadBrowserScript('vilda_data_import_export.js', env.win);
  const api = env.win.VildaDataImportExport;
  expect(typeof api.initMainSessionPersistence).toBe('function');
  expect(api.initMainSessionPersistence({ collectUserData: REKORD })).toBe(true);
  expect(env.win.vildaSession && typeof env.win.vildaSession.saveNow, 'moduł wystawia vildaSession').toBe('function');
  return env;
}

describe('P-POWLOKA-PANELE — sesja główna po wczytaniu nie czeka na zdarzenia z pól', () => {
  it('saveNow({force:true}) zapisuje w oknie zawieszenia; saveNow() bez force nadal nie', () => {
    const { win, zapisy } = uruchom();
    win.__vildaPersistPauseUntil = Date.now() + 5000;
    expect(win.vildaSession.saveNow()).toBe(false);
    expect(zapisy, 'bez force zapis czeka (dotychczasowe zachowanie)').toHaveLength(0);
    expect(win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].name).toBe('Fikcyjna Ewa');
    expect(zapisy[0].user.height).toBe(134);
  });

  it('zapis zaplanowany z input w oknie zawieszenia jest ponawiany i wykonuje się po zdjęciu okna — dokładnie raz', async () => {
    const { win, nasluchy, zapisy } = uruchom();
    win.__vildaPersistPauseUntil = Date.now() + 500;
    nasluchy.doc.input.forEach((f) => f(zdarzenie('input')));
    await czekaj(350);
    expect(zapisy, 'w oknie zawieszenia jeszcze nic').toHaveLength(0);
    await czekaj(900);
    expect(zapisy, 'po zdjęciu okna zapis dochodzi').toHaveLength(1);
    await czekaj(700);
    expect(zapisy, 'i nie powtarza się').toHaveLength(1);
  });

  it('adapter odmawia zapisu w oknie po czyszczeniu — wymuszony zapis czeka i wykonuje się po jego końcu', async () => {
    const { win, zapisy } = uruchom();
    // atrapa adaptera odmawia jak prawdziwy VildaPersistence w oknie __vildaPersistClearUntil
    const pisz = win.VildaPersistence.writeMainSession;
    win.VildaPersistence.writeMainSession = (p) => (Number(win.__vildaPersistClearUntil || 0) > Date.now() ? false : pisz(p));
    win.__vildaPersistClearUntil = Date.now() + 400;
    expect(win.vildaSession.saveNow({ force: true }), 'w oknie blokady nawet force nie zapisuje (tak działa adapter)').toBe(false);
    expect(zapisy).toHaveLength(0);
    await czekaj(500);
    expect(win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(zapisy).toHaveLength(1);
  });

  it('pagehide zapisuje z force, także w oknie zawieszenia', () => {
    const { win, nasluchy, zapisy } = uruchom();
    win.__vildaPersistPauseUntil = Date.now() + 5000;
    expect(nasluchy.win.pagehide, 'moduł nasłuchuje pagehide').toBeTruthy();
    nasluchy.win.pagehide.forEach((f) => f({ type: 'pagehide' }));
    expect(zapisy).toHaveLength(1);
  });

  it('kontrola negatywna: ze starym timerem zapis z input w oknie zawieszenia przepada', async () => {
    const src = czytaj('vilda_data_import_export.js').replace('Gp_n=0,$=setTimeout(Gp_t(a),300),!0}', '$=setTimeout(()=>{$=null,!Be(a)&&oe(a)},300),!0}');
    expect(src, 'kontrola musi przywrócić stary timer').toContain('$=setTimeout(()=>{$=null,!Be(a)&&oe(a)},300),!0}');
    const { win, nasluchy, zapisy } = uruchom(src);
    win.__vildaPersistPauseUntil = Date.now() + 500;
    nasluchy.doc.input.forEach((f) => f(zdarzenie('input')));
    await czekaj(1300);
    expect(zapisy, 'to jest zgłoszony przebieg: sesja główna nie powstaje').toHaveLength(0);
  });

  it('strażnicy źródła: wymuszony zapis po wczytaniu i odtworzeniu, powłoka zapisuje przed przełączeniem i odtwarza docelowy panel', () => {
    const ie = czytaj('vilda_data_import_export.js');
    expect(ie).toContain('P-POWLOKA-PANELE (zgloszenie wlasciciela 2026-09-28)');
    // applyLoadedData: zapis PRZED pingiem vilda:sharedLoadSeq, pominięty przy odtwarzaniu sesji
    expect(ie).toContain('if(Gp_a(a),tt(),a.isSessionRestore!==!0)try{');
    expect(ie).toContain('function Gp_a(e){const t=pe(e);if(t&&t.isSessionRestore)return!1;let a=!1;try{a=!!oe(Object.assign({},t,{force:!0}))}');
    // wczytanie/odtworzenie kończy okno blokady po czyszczeniu (adapter odmawiał w nim każdego zapisu)
    expect(ie).toContain('function Gp_b(){try{const e=Number(r.__vildaPersistClearUntil||0);if(e>Date.now())return r.__vildaPersistClearUntil=0,!0}');
    expect(ie).toContain('if(!m){Gp_b();try{typeof r.vildaPersistFlushNow=="function"&&r.vildaPersistFlushNow({force:!0})}');
    // restoreLoadedState
    expect(ie).toContain('try{Gp_b(),Gp_a(t),tt()}catch{}');
    // pagehide z force
    expect(ie).toContain('r.addEventListener("pagehide",()=>oe(Object.assign({},t,{force:!0})),{capture:!0})');
    const sh = czytaj('vilda_shell.js');
    expect(sh).toContain('P-POWLOKA-PANELE (zgloszenie wlasciciela 2026-09-28)');
    expect(sh).toContain('function w(t){t=y(t);var Gp_c=c;c&&c!==t&&Gp_f(c);var e=_(t);');
    expect(sh).toContain('Gp_c!==t&&Gp_p(t,e);');
    expect(sh).toContain('n.loaded=!0,n.sessionStamp=Gp_s(),');
    // odcisk sesji bez pola czasu — inaczej każde przełączenie odtwarzałoby panel od nowa
    expect(sh).toContain('var n=Object.assign({},r);delete n.timestampISO;');
    // kolejność w panelu docelowym jak przy starcie strony: wspólny stan, potem sesja główna
    expect(sh).toMatch(/vildaPersistRestoreAll\(\)\}catch\{\}try\{n\.vildaSession&&typeof n\.vildaSession\.restore=="function"&&n\.vildaSession\.restore\(\)/);
  });
});
