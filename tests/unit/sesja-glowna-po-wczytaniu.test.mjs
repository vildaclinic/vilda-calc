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
//   2. zapis z input/change w oknie zawieszenia jest pomijany JAK DOTĄD (nie ponawiany): pierwsza wersja
//      naprawy ponawiała go po zdjęciu okna, a po F5 odtworzenie wspólnego stanu odpala input/change na
//      częściowym formularzu (bez nazwiska) zanim strona odtworzy sesję główną — ponowiony zapis
//      nadpisywał pełną sesję połowicznym formularzem (czerwony „E2E odłamek 3/3” w CI);
//   3. żaden zapis, także wymuszony, nie nadpisuje istniejącej sesji, zanim strona nie spróbowała jej
//      odtworzyć (`Gp_k`, latka `Ke`); po próbie odtworzenia zapis działa;
//   4. wymuszony zapis nie kasuje sesji przy pustym formularzu i jest pomijany w trakcie odtwarzania;
//   5. pagehide zapisuje z force (jak flush persist);
//   6. strażnicy źródła: wymuszony zapis na końcu applyLoadedData i restoreLoadedState przed pingiem
//      vilda:sharedLoadSeq, pomijany przy odtwarzaniu sesji; `Pe` identyczne z audyt; powłoka zapisuje
//      panel źródłowy przed przełączeniem i odtwarza docelowy po zmianie odcisku sesji.
// Kontrola negatywna: bez `Gp_k` wymuszony zapis nadpisuje sesję przed jej odtworzeniem. Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const REKORD = () => ({ version: 1, name: 'Fikcyjna Ewa', user: { age: 9, ageMonths: 4, sex: 'K', height: 134, weight: 30.2 } });
const CZESCIOWY = () => ({ version: 1, name: '', user: { age: 9, ageMonths: 4, height: 135, weight: 30.8 } });

function atrapaOkna(sesjaStart) {
  const nasluchy = { doc: {}, win: {} };
  const zapisy = [];
  let sesja = sesjaStart || null;
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
      // jak index.html: pole #intakePal istnieje, więc oe nie scala pustych pól z poprzednią sesją
      getElementById: (id) => (id === 'intakePal' ? { value: '' } : null), querySelector: () => null, querySelectorAll: () => [],
    },
    VildaPersistence: {
      getStorage: (k) => (k === 'session' ? {} : null),
      readMainSession: () => sesja,
      writeMainSession: (p) => { zapisy.push(p); sesja = p; return true; },
      clearMainSession: () => { sesja = null; },
    },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  return { win, nasluchy, zapisy, sesja: () => sesja };
}

const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
const zdarzenie = (typ) => ({ type: typ, target: { matches: () => true } });

/* Ładuje moduł i inicjuje sesję główną. Domyślnie czeka, aż strona wykona swoją próbę odtworzenia sesji
   (jak po starcie strony); `przedOdtworzeniem` zwraca od razu — do testu zapisu PRZED tą próbą. */
async function uruchom(src, opcje) {
  const o = opcje || {};
  const env = atrapaOkna(o.sesja || null);
  if (src) new Function('window', 'globalThis', src)(env.win, env.win); else loadBrowserScript('vilda_data_import_export.js', env.win);
  const api = env.win.VildaDataImportExport;
  expect(typeof api.initMainSessionPersistence).toBe('function');
  // kolektor jest podmienialny: test „pustego formularza” przełącza go na pusty rekord
  env.rekord = REKORD();
  expect(api.initMainSessionPersistence({ collectUserData: () => env.rekord })).toBe(true);
  expect(env.win.vildaSession && typeof env.win.vildaSession.saveNow, 'moduł wystawia vildaSession').toBe('function');
  if (!o.przedOdtworzeniem) await czekaj(30);
  return env;
}

describe('P-POWLOKA-PANELE — sesja główna po wczytaniu nie czeka na zdarzenia z pól', () => {
  it('saveNow({force:true}) zapisuje w oknie zawieszenia; saveNow() bez force nadal nie', async () => {
    const { win, zapisy } = await uruchom();
    win.__vildaPersistPauseUntil = Date.now() + 5000;
    expect(win.vildaSession.saveNow()).toBe(false);
    expect(zapisy, 'bez force zapis czeka (dotychczasowe zachowanie)').toHaveLength(0);
    expect(win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].name).toBe('Fikcyjna Ewa');
    expect(zapisy[0].user.height).toBe(134);
  });

  it('zapis z input w oknie zawieszenia jest pomijany jak dotąd (nie ponawiany) — zdarzenia programowe odtwarzania nie mogą nadpisać sesji', async () => {
    const { win, nasluchy, zapisy } = await uruchom();
    win.__vildaPersistPauseUntil = Date.now() + 500;
    nasluchy.doc.input.forEach((f) => f(zdarzenie('input')));
    await czekaj(1300);
    expect(zapisy, 'zapis zaplanowany w oknie zawieszenia przepada').toHaveLength(0);
    win.__vildaPersistPauseUntil = 0;
    nasluchy.doc.input.forEach((f) => f(zdarzenie('input')));
    await czekaj(450);
    expect(zapisy, 'poza oknem zapis z input działa').toHaveLength(1);
  });

  it('adapter odmawia zapisu w oknie po czyszczeniu — wymuszony zapis czeka i wykonuje się po jego końcu', async () => {
    const { win, zapisy } = await uruchom();
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

  it('przed własną próbą odtworzenia sesji strona nie nadpisuje istniejącej sesji — nawet z force; po próbie zapisuje', async () => {
    const env = await uruchom(null, { przedOdtworzeniem: true, sesja: REKORD() });
    env.rekord = CZESCIOWY(); // formularz po odtworzeniu wspólnego stanu: pomiary bez nazwiska
    expect(env.win.vildaSession.saveNow({ force: true }), 'force przed odtworzeniem: odmowa').toBe(false);
    expect(env.win.vildaSession.saveNow(), 'bez force przed odtworzeniem: odmowa').toBe(false);
    expect(env.zapisy).toHaveLength(0);
    expect(env.sesja().name, 'sesja z nazwiskiem nietknięta').toBe('Fikcyjna Ewa');
    await czekaj(30); // strona wykonała próbę odtworzenia (latka Ke)
    expect(env.win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(env.zapisy).toHaveLength(1);
  });

  it('kontrola negatywna: bez strażnika Gp_k wymuszony zapis nadpisuje sesję przed jej odtworzeniem (zgłoszony przebieg z CI)', async () => {
    const src = czytaj('vilda_data_import_export.js').replace('if(!ge(t)||Gp_r(t)||Gp_k(t)||!a&&Be(t))return!1;', 'if(!ge(t)||Gp_r(t)||!a&&Be(t))return!1;');
    expect(src, 'kontrola musi usunąć strażnika').not.toContain('Gp_k(t)||');
    const env = await uruchom(src, { przedOdtworzeniem: true, sesja: REKORD() });
    env.rekord = CZESCIOWY();
    expect(env.win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(env.sesja().name, 'to jest zgłoszony przebieg: sesja bez nazwiska').toBe('');
  });

  it('zapis z force przy PUSTYM formularzu nie kasuje istniejącej sesji (pusty zrzut przy pagehide, np. po zablokowaniu sejfu w tle)', async () => {
    const env = await uruchom();
    const { win, zapisy } = env;
    expect(win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(zapisy).toHaveLength(1);
    let skasowano = 0;
    win.VildaPersistence.clearMainSession = () => { skasowano += 1; };
    // od tej chwili "formularz" jest pusty: kolektor oddaje pusty rekord
    env.rekord = { version: 1, name: '', user: {} };
    expect(win.vildaSession.saveNow({ force: true }), 'force na pustym formularzu: nic nie zapisuje').toBe(false);
    expect(skasowano, 'i nic nie kasuje').toBe(0);
    expect(zapisy).toHaveLength(1);
    // bez force pusty formularz nadal czyści sesję (dotychczasowe zachowanie przy „Wyczyść”)
    expect(win.vildaSession.saveNow()).toBe(false);
    expect(skasowano, 'zwykły zapis pustego formularza kasuje sesję jak dotąd').toBe(1);
  });

  it('zapis z force w trakcie odtwarzania stanu (__vildaPersistRestoring) jest pomijany — nie nadpisuje sesji pół-odtworzonym formularzem', async () => {
    const { win, zapisy } = await uruchom();
    win.__vildaPersistRestoring = true;
    expect(win.vildaSession.saveNow({ force: true })).toBe(false);
    expect(zapisy).toHaveLength(0);
    win.__vildaPersistRestoring = false;
    expect(win.vildaSession.saveNow({ force: true })).toBe(true);
    expect(zapisy).toHaveLength(1);
  });

  it('pagehide zapisuje z force, także w oknie zawieszenia', async () => {
    const { win, nasluchy, zapisy } = await uruchom();
    win.__vildaPersistPauseUntil = Date.now() + 5000;
    expect(nasluchy.win.pagehide, 'moduł nasłuchuje pagehide').toBeTruthy();
    nasluchy.win.pagehide.forEach((f) => f({ type: 'pagehide' }));
    expect(zapisy).toHaveLength(1);
  });

  it('strażnicy źródła: wymuszony zapis po wczytaniu i odtworzeniu, Pe jak w audyt, powłoka zapisuje przed przełączeniem i odtwarza docelowy panel', () => {
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
    // strażnicy zapisu: odtwarzanie w toku, sesja jeszcze nieodtworzona, pauza tylko dla zwykłego zapisu
    expect(ie).toContain('function oe(e){const t=pe(e),a=!!(t&&t.force);if(!ge(t)||Gp_r(t)||Gp_k(t)||!a&&Be(t))return!1;');
    expect(ie).toContain('function Gp_k(e){if(Ke)return!1;');
    expect(ie).toContain('if(!Re(n))return a?!1:(re(t),!1);');
    // planowanie zapisu z input/change dokładnie jak w audyt — bez ponawiania w oknie zawieszenia
    expect(ie).toContain('function Pe(e,t){const a=pe(t);if(!ge(a)||Be(a))return!1;');
    expect(ie).toContain('return $&&clearTimeout($),$=setTimeout(()=>{$=null,!Be(a)&&oe(a)},300),!0}');
    expect(ie).not.toContain('Gp_t');
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
