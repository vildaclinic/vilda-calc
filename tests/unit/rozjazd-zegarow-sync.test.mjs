import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOTATKI rata 3e — G17, decyzja właściciela D13: rozjazd zegarów urządzeń.
//
// Nagrobek ostemplowany zegarem „do przodu" wygrywa z genuinnie późniejszą edycją na drugim
// urządzeniu — ten sam mechanizm, co przy G13, tylko odwrócony. Poprawka rat 1–2
// (`deletedAtISO = max(teraz, updatedAtISO)`) chroni kierunek G13, ale gdy samo „teraz"
// pochodzi z zegara przesuniętego o +10 min, nagrobek przykrywa każdą edycję z następnych
// dziesięciu minut. D13: na razie wchodzi SAMO OSTRZEŻENIE, bez korekty znaczników czasu.
//
// Źródłem pomiaru jest `exportedAtISO` ładunku — zegar ścienny urządzenia nadającego, pole,
// które każdy ładunek już niesie. Świadomie NIE używamy nagłówka `Date` odpowiedzi Workera:
// `Date` nie jest nagłówkiem bezpiecznym dla CORS, a w repozytorium nie ma ani źródeł Workera,
// ani `Access-Control-Expose-Headers`, więc nie da się ustalić, czy w ogóle dojdzie do JS.
//
// Test jest ASYMETRYCZNY z rozmysłem: opóźnienie transmisji i leżenie ładunku w chmurze mogą
// sprawić tylko, że `exportedAtISO` wygląda na STARSZY, nigdy na nowszy. Dodatni offset jest
// więc rzetelnym dolnym oszacowaniem rozjazdu; ujemny jest zaszumiony i nie alarmuje.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (n) => fs.readFileSync(path.join(korzen, n), 'utf8');

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function loadDevice() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function urzadzenie(label) {
  const v = loadDevice();
  licznik += 1;
  await v.createUser(`Zegar#G17!${label}${licznik}`, { label, iterations: 10000 });
  return v;
}

// Eksport z przesuniętym zegarem. `exportSyncPayload` jest asynchroniczne, więc przywrócenie
// oryginalnego Date MUSI czekać na promise — inaczej zegar wraca do normy, zanim ładunek
// zdąży się ostemplować (zmierzone: offset 0 przy naiwnym try/finally).
function zZegarem(przesuniecieMs, fn) {
  const Org = Date;
  class Przesunieta extends Org {
    constructor(...a) { if (a.length === 0) { super(Org.now() + przesuniecieMs); } else { super(...a); } }
    static now() { return Org.now() + przesuniecieMs; }
  }
  globalThis.Date = Przesunieta;
  return Promise.resolve().then(fn).finally(() => { globalThis.Date = Org; });
}

const pacjent = (v, nazwisko) => v.savePatient({
  name: `${nazwisko} Probny`,
  user: { lastName: nazwisko, firstName: 'Probny', sex: 'M', age: 7, height: 122, weight: 24 },
}, { dedup: false });

describe('G17 — sejf wykrywa rozjazd zegarów ze znacznika nadawcy', () => {
  it('zegar nadawcy +10 min: ostrzega i podaje rozmiar rozjazdu', async () => {
    const A = await urzadzenie('A');
    const B = await urzadzenie('B');
    await pacjent(A, 'Testowy');

    const ladunek = await zZegarem(600_000, () => A.exportSyncPayload());
    const wynik = await B.mergeSyncPayload(ladunek);

    expect(wynik.clockSkew, 'werdykt jest w wyniku scalania').toBeTruthy();
    expect(wynik.clockSkew.warn).toBe(true);
    expect(wynik.clockSkew.thresholdMs).toBe(60_000);
    expect(Math.abs(wynik.clockSkew.offsetMs - 600_000)).toBeLessThan(5_000);
    expect(wynik.clockSkew.otherExportedAtISO).toBe(ladunek.exportedAtISO);
  });

  it('zegary zgodne: nie alarmuje (kontrola negatywna)', async () => {
    const A = await urzadzenie('C');
    const B = await urzadzenie('D');
    await pacjent(A, 'Testowa');

    const wynik = await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(wynik.clockSkew.warn).toBe(false);
    expect(Math.abs(wynik.clockSkew.offsetMs)).toBeLessThan(60_000);
  });

  it('zegar nadawcy DO TYŁU: nie alarmuje, bo tego nie da się odróżnić od opóźnienia', async () => {
    const A = await urzadzenie('E');
    const B = await urzadzenie('F');
    await pacjent(A, 'Fikcyjny');

    const ladunek = await zZegarem(-600_000, () => A.exportSyncPayload());
    const wynik = await B.mergeSyncPayload(ladunek);
    expect(wynik.clockSkew.offsetMs).toBeLessThan(-500_000);
    expect(wynik.clockSkew.warn, 'ujemny offset jest zaszumiony i milczy').toBe(false);
  });

  it('próg 60 s: rozjazd tuż pod progiem milczy', async () => {
    const A = await urzadzenie('G');
    const B = await urzadzenie('H');
    await pacjent(A, 'Probna');

    const wynik = await B.mergeSyncPayload(await zZegarem(30_000, () => A.exportSyncPayload()));
    expect(wynik.clockSkew.offsetMs).toBeGreaterThan(25_000);
    expect(wynik.clockSkew.warn).toBe(false);
  });

  it('ładunek bez exportedAtISO nie zgaduje — oddaje null', async () => {
    const A = await urzadzenie('I');
    const B = await urzadzenie('J');
    await pacjent(A, 'Testowy');
    const ladunek = await A.exportSyncPayload();
    delete ladunek.exportedAtISO;
    const wynik = await B.mergeSyncPayload(ladunek);
    expect(wynik.clockSkew).toBeNull();
  });

  it('nie rusza dotychczasowego werdyktu o nieaktualnym urządzeniu', async () => {
    // Kontrola pozytywna: staleDevice zostaje tam, gdzie był, z tym samym kształtem.
    const A = await urzadzenie('K');
    const B = await urzadzenie('L');
    await pacjent(A, 'Testowa');
    const wynik = await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(wynik.staleDevice).toBeTruthy();
    expect(typeof wynik.staleDevice.thresholdDays).toBe('number');
    expect(wynik.staleDevice.warn).toBe(false);
  });
});

describe('G17 — droga werdyktu do lekarza', () => {
  const SYNC = zrodlo('vilda_sync.js');
  const INLINE = zrodlo('inline_ustawienia_04.js');
  const HTML = zrodlo('ustawienia.html');

  it('synchronizacja rozgłasza werdykt tym samym wzorcem, co ostrzeżenie o nieaktualnym urządzeniu', () => {
    expect(SYNC).toContain('new CustomEvent("vilda:sync-clock-skew"');
    expect(SYNC).toContain('function Nv(t){'); // kontrola pozytywna: wzorzec źródłowy zostaje
  });

  it('rozgłasza na OBU ścieżkach scalania, nie tylko na jednej', () => {
    expect(SYNC).toContain('Nv(Qcw.staleDevice),Qcs(Qcw.clockSkew);');
    expect(SYNC).toContain('return Nv(J.staleDevice),Qcs(et&&et.clockSkew||null),');
  });

  it('rozgłasza tylko przy ostrzeżeniu — cisza nie zaśmieca zdarzeniami', () => {
    const i = SYNC.indexOf('function Qcs(t){');
    expect(i).toBeGreaterThan(0);
    expect(SYNC.slice(i, i + 220)).toContain('t.warn!==!0)return');
  });

  it('Ustawienia mają osobny akapit na to ostrzeżenie, domyślnie ukryty', () => {
    expect(HTML).toContain('id="syncClockSkewWarning"');
    expect(HTML).toContain('id="syncStaleWarning"'); // kontrola pozytywna: stary zostaje
  });

  it('renderer zapala się wyłącznie przy dodatnim offsecie', () => {
    const i = INLINE.indexOf('function Zk(t){');
    expect(i).toBeGreaterThan(0);
    expect(INLINE.slice(i, i + 200)).toContain('t.warn!==!0||!(t.offsetMs>0)');
  });

  it('inline_ustawienia_04.js zostaje czysto ASCII', () => {
    // Plik nie miał ani jednego znaku spoza ASCII i to się nie zmienia — polskie znaki
    // idą escape'ami, tak jak reszta tego pliku.
    expect([...INLINE].filter((c) => c.charCodeAt(0) > 127).length).toBe(0);
  });
});
