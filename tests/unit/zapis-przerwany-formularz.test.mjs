// P-SESJA-ZAPISU — „Zapisz dane” w formularzu, gdy sejf kończy zapis błędem SESSION_CHANGED.
//
// Pilnuje głównego „Zapisz dane” (prawdziwy vilda_data_import_export.js, saveUserData). Zapis kończy się w sesji, w której
// ruszył: gdy w trakcie zapisu sejf zostanie zablokowany albo zaloguje się inne konto (także ponownie to samo), sejf
// odrzuca zapis kodem SESSION_CHANGED („Zapis przerwany”). Formularz traktuje to odrzucenie jako koniec zapisu poprzedniej
// sesji: bez komunikatu w pasku statusu (VildaStatusBar), bez wskaźnika błędu zapisu (VildaSaveStatusIndicator.
// notifySaveFailed), bez zdarzenia vilda:patient-loaded; lastLoadedData, __vildaOstatniWlasnyZapis,
// _vildaCurrentPatientId i sessionStorage vildaCurrentPatientId zostają bez zmian, a obietnica saveUserData jest
// rozwiązana payloadem formularza. Pozostałe odrzucenia i zapis w jednej sesji — komunikaty bez zmian.
//
// Formularz jak w tests/unit/zapis-usunietej-karty.test.mjs (formularz(): trasa /index.html, VildaStatusBar
// i VildaSaveStatusIndicator jako szpiedzy, dokument zapisujący zdarzenia). E1 i K1–K2: sejf-atrapa. E2, E2-war i K3:
// prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js na wspólnej uprzęży ./sesja-zapisu-uprzaz.mjs (konto A
// zalogowane, konto B zablokowane, jeden magazyn w pamięci z rejestrem); okno konfliktu (setSaveConflictResolver)
// z pytaniem wstrzymanym do odpowiedzi testu. Czekanie wyłącznie na zdarzenia i obietnice. Dane wyłącznie FIKCYJNE
// („Testowy Jan”).
//
// Przypadki:
//   E1      sejf-atrapa odrzuca savePatient kodem SESSION_CHANGED — brak komunikatu i notifySaveFailed, brak
//           vilda:patient-loaded, stan formularza bez zmian, obietnica rozwiązana payloadem.
//   E2      prawdziwy sejf: formularz z bazą starszą niż głowa karty konta A, okno konfliktu czeka na odpowiedź; blokada
//           sejfu i zalogowanie konta B; odpowiedź „nadpisz” — brak komunikatu sukcesu i vilda:patient-loaded, sejf
//           odrzuca zapis SESSION_CHANGED, konto B bez kart, karta A bez nowej wersji.
//   E2-war  jak E2: zalogowanie B i odpowiedź „scal”; ponowne zalogowanie A i odpowiedź „nadpisz” albo „scal”; sama
//           blokada sejfu i odpowiedź „nadpisz”.
//   K1      kontrola E1: inny błąd sejfu — „Nie udało się zapisać pacjenta: …” (ton blad) i notifySaveFailed.
//   K2      kontrola E1: zapis anulowany (vildaSaveAborted) — „Zapis anulowany — nic nie zmieniono.” (ton info).
//   K3      kontrola E2: ten sam przebieg bez zmiany sesji, odpowiedź „nadpisz” — „Zapisano (snapshot 3) dla Testowy
//           Jan.”, vilda:patient-loaded z id karty, baza formularza = zapisany payload, nowa wersja karty A.
//   W1      wskaźnik zapisu (prawdziwy vilda_save_status_indicator.js, przegląd 4): stan „zapisywanie” po kliknięciu
//           „Zapisz” czyści blokada sejfu zdarzeniem onLock, które wskaźnik rejestruje w sejfie — cicha gałąź
//           SESSION_CHANGED nie woła notifySaveFailed, więc tylko ta blokada zdejmuje „zapisywanie”.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b): E1, E2, E2-war (każdy wariant). Zielone na nim: K1,
// K2, K3, W1 (W1 — na c209fa6b; rejestracja onLock we wskaźniku jest starsza niż PR-S, W1 pilnuje, żeby została).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { sprzatnij, urzadzenie, wynik } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const kopia = (x) => JSON.parse(JSON.stringify(x));

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

const pomiar = (ageMonths, height) => ({ ageMonths, ageYears: ageMonths / 12, height, weight: 12 + ageMonths / 6 });
const payload = (wiersze) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wiersze.map(([m, h]) => pomiar(m, h)) } },
});

/* Główny „Zapisz dane” (prawdziwy vilda_data_import_export.js) w oknie, które trzyma kartę idOkna. Szpiedzy: kom —
   komunikaty paska statusu, wskaznik — wywołania VildaSaveStatusIndicator, zd — zdarzenia dokumentu, wywolania —
   zapisy, które doszły do sejfu (payload, opcje i wynik obietnicy sejfu). */
function formularz(V, { idOkna } = {}) {
  const pole = (id) => ({
    id, value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    dispatchEvent() { return true; }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const pola = {};
  ['name', 'age', 'weight', 'height'].forEach((id) => { pola[id] = pole(id); });
  const kom = []; const zd = []; const wskaznik = []; const wywolania = [];
  const ses = magazyn();
  const w = {
    localStorage: magazyn(), sessionStorage: ses, setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0), location: { pathname: '/index.html', href: 'http://localhost/index.html' },
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = (i || {}).detail; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false, addEventListener() {}, removeEventListener() {}, dispatchEvent(e) { zd.push(e); return true; },
      getElementById: (id) => pola[id] || null, querySelector: () => null, querySelectorAll: () => [], body: pole('body'), documentElement: pole('html'),
    },
    VildaStatusBar: { pokaz(o) { kom.push({ tekst: o.tekst, ton: o.ton }); return true; } },
    VildaSaveStatusIndicator: {
      notifySaveFailed(m) { wskaznik.push(['notifySaveFailed', m]); },
      notifySaving(m) { wskaznik.push(['notifySaving', m]); },
      notifySaved(m) { wskaznik.push(['notifySaved', m]); },
    },
  };
  w.window = w; w.self = w; w.top = w; w.parent = w;
  w.VildaPersistence = { updateShared(fn) { const k = {}; fn(k, {}); return k; }, readShared: () => ({}), writeShared: () => true, writeMainSession: () => true, readMainSession: () => null };
  w.VildaPanelPacjent = { wczytanie() {}, nieaktualny: () => false, cel: (d) => d };
  w.VildaVault = Object.assign(Object.create(V), {
    savePatient(p, o) {
      const obietnica = V.savePatient(p, o);
      wywolania.push({ p, o, wynik: wynik(obietnica) });
      return obietnica;
    },
  });
  if (idOkna) { w._vildaCurrentPatientId = idOkna; ses.setItem('vildaCurrentPatientId', idOkna); }
  loadBrowserScript('vilda_data_import_export.js', w);
  const zapisz = (dane) => w.VildaDataImportExport.saveUserData({ collectUserData: () => kopia(dane) });
  return { w, kom, zd, wskaznik, wywolania, ses, zapisz };
}

const wczytania = (F) => F.zd.filter((e) => e.type === 'vilda:patient-loaded');

// Stan formularza, który zapis przerwany zmianą sesji zostawia bez zmian.
function stanFormularza(F) {
  return {
    lastLoadedData: F.w.lastLoadedData,
    wlasnyZapis: F.w.__vildaOstatniWlasnyZapis,
    idOkna: F.w._vildaCurrentPatientId,
    idSesjiKarty: F.ses.getItem('vildaCurrentPatientId'),
  };
}
function stanBezZmian(F, przed) {
  const po = stanFormularza(F);
  expect(po.lastLoadedData, 'lastLoadedData bez zmian').toBe(przed.lastLoadedData);
  expect(po.wlasnyZapis, '__vildaOstatniWlasnyZapis bez zmian').toBe(przed.wlasnyZapis);
  expect(po.idOkna, '_vildaCurrentPatientId bez zmian').toBe(przed.idOkna);
  expect(po.idSesjiKarty, 'sessionStorage vildaCurrentPatientId bez zmian').toBe(przed.idSesjiKarty);
}

// ── E1 i kontrole: sejf-atrapa ───────────────────────────────────────────────────────────────────────────────────────
const ID_KARTY = 'karta-testowa-a1';
function bladSesji() {
  const e = new Error('W trakcie zapisu zablokowano sejf albo przełączono konto. Zapis przerwany.');
  e.code = 'SESSION_CHANGED';
  return e;
}
function sejfAtrapa(blad) {
  return {
    isUnlocked: () => true,
    getCurrentUser: () => ({ userId: 'konto-testowe-a' }),
    onLock() {}, onUnlock() {},
    normalizePatientName: (n) => String(n || '').trim().toLowerCase(),
    savePatient: () => Promise.reject(blad()),
  };
}
function formularzAtrapy(blad) {
  const F = formularz(sejfAtrapa(blad), { idOkna: ID_KARTY });
  F.w.lastLoadedData = payload([[60, 120]]);
  F.w.__vildaOstatniWlasnyZapis = { patientId: ID_KARTY, snapshotId: 'wersja-testowa-1', kiedy: 1 };
  return F;
}

describe('P-SESJA-ZAPISU: „Zapisz dane” przy odrzuceniu SESSION_CHANGED (sejf-atrapa)', () => {
  it('E1: zapis przerwany zmianą sesji — brak komunikatu i wskaźnika błędu, brak vilda:patient-loaded, stan formularza bez zmian', async () => {
    const F = formularzAtrapy(bladSesji);
    const przed = stanFormularza(F);

    const r = await F.zapisz(payload([[60, 120], [66, 123]]));
    await kolejnaTura();

    expect(F.wywolania, 'zapis doszedł do sejfu').toHaveLength(1);
    expect(F.wywolania[0].o.patientId, 'zapis celował w kartę okna').toBe(ID_KARTY);
    expect((await F.wywolania[0].wynik).kod).toBe('SESSION_CHANGED');
    expect(F.kom, 'po zmianie sesji brak komunikatu w pasku statusu').toEqual([]);
    expect(F.wskaznik, 'po zmianie sesji brak wskaźnika błędu zapisu').toEqual([]);
    expect(wczytania(F), 'brak vilda:patient-loaded').toEqual([]);
    expect(F.zd.map((e) => e.type), 'brak zdarzeń dokumentu').toEqual([]);
    stanBezZmian(F, przed);
    expect(r, 'obietnica rozwiązana payloadem formularza').toBe(F.wywolania[0].p);
    expect(r).toMatchObject({ name: 'Testowy Jan' });
  });

  it('K1: inny błąd sejfu — „Nie udało się zapisać pacjenta: …” (ton blad) i notifySaveFailed', async () => {
    const F = formularzAtrapy(() => new Error('Atrapa: magazyn niedostępny.'));
    const przed = stanFormularza(F);

    const r = await F.zapisz(payload([[60, 120], [66, 123]]));

    expect(F.kom).toEqual([{ tekst: 'Nie udało się zapisać pacjenta: Atrapa: magazyn niedostępny.', ton: 'blad' }]);
    expect(F.wskaznik).toEqual([['notifySaveFailed', 'Atrapa: magazyn niedostępny.']]);
    expect(wczytania(F)).toEqual([]);
    stanBezZmian(F, przed);
    expect(r).toBe(F.wywolania[0].p);
  });

  it('K2: zapis anulowany (vildaSaveAborted) — „Zapis anulowany — nic nie zmieniono.” (ton info), bez wskaźnika błędu', async () => {
    const F = formularzAtrapy(() => Object.assign(new Error('Zapis anulowany.'), { vildaSaveAborted: true }));
    const przed = stanFormularza(F);

    await F.zapisz(payload([[60, 120], [66, 123]]));

    expect(F.kom).toEqual([{ tekst: 'Zapis anulowany — nic nie zmieniono.', ton: 'info' }]);
    expect(F.wskaznik).toEqual([]);
    expect(wczytania(F)).toEqual([]);
    stanBezZmian(F, przed);
  });
});

// ── E2 i kontrola: prawdziwy sejf ────────────────────────────────────────────────────────────────────────────────────
/* Karta „Testowy Jan” konta A: wersja wczytana do formularza (pomiar 60 mies.), potem drugi pomiar (66 mies.) dopisany
   gdzie indziej — głowa karty jest nowsza niż baza formularza. Formularz zapisuje swoją wersję (pomiar 72 mies.); sejf
   pyta w oknie konfliktu pod blokadą karty, a pytanie czeka na odpowiedź testu. */
async function konfliktWFormularzu(d) {
  const wczytana = payload([[60, 120]]);
  const p = await d.v.savePatient(kopia(wczytana), { dedup: false });
  await d.v.savePatient(payload([[60, 120], [66, 123]]), { patientId: p.patientId, dedup: false });
  const przedA = await d.kartaTrwala('A', p.patientId);
  const F = formularz(d.v, { idOkna: p.patientId });
  F.w.lastLoadedData = kopia(wczytana);
  const przed = stanFormularza(F);
  const okno = d.oknoKonfliktu();
  const zapis = F.zapisz(payload([[60, 120], [72, 126]]));
  const pytanie = await okno.czekaj();
  return { pid: p.patientId, przedA, F, przed, okno, zapis, pytanie };
}

describe('P-SESJA-ZAPISU: „Zapisz dane” z prawdziwym sejfem — okno konfliktu otwarte w czasie zmiany sesji', () => {
  it('E2: blokada sejfu i zalogowanie B, odpowiedź „nadpisz” — brak komunikatu sukcesu i vilda:patient-loaded, w B 0 kart', async () => {
    const d = await urzadzenie();
    const k = await konfliktWFormularzu(d);
    expect(k.pytanie.sesja, 'okno konfliktu pyta w sesji A').toBe('A');

    const z = await d.przelacz('B');
    k.okno.odpowiedz('nadpisz');
    const r = await k.zapis;
    await kolejnaTura();

    expect(k.F.kom.filter((x) => /^Zapisano/.test(x.tekst)), 'po zmianie sesji brak komunikatu sukcesu').toEqual([]);
    expect(wczytania(k.F), 'po zmianie sesji brak vilda:patient-loaded').toEqual([]);
    expect(k.F.kom, 'po zmianie sesji brak komunikatu w pasku statusu').toEqual([]);
    expect(k.F.wskaznik, 'po zmianie sesji brak wskaźnika błędu zapisu').toEqual([]);
    expect((await k.F.wywolania[0].wynik).kod, 'zapis kończy się w sesji, w której ruszył').toBe('SESSION_CHANGED');
    expect(d.po(z).zdarzenia.map((e) => [e.typ, e.sesja]), 'po zmianie sesji brak powiadomień sejfu').toEqual([]);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'konto B bez kart').toEqual([]);
    expect((await d.trwaly('B')).karty).toBe(0);
    expect(await d.kartaTrwala('A', k.pid), 'karta A bez nowej wersji').toEqual(k.przedA);
    stanBezZmian(k.F, k.przed);
    expect(r, 'obietnica rozwiązana payloadem formularza').toBe(k.F.wywolania[0].p);
  });

  it.each([
    ['B', 'scal'], ['A', 'nadpisz'], ['A', 'scal'], ['blokada', 'nadpisz'],
  ])('E2-war: przełączenie %s, odpowiedź „%s” — po zmianie sesji brak komunikatów i zapisów', async (wariant, odpowiedz) => {
    const d = await urzadzenie();
    const k = await konfliktWFormularzu(d);
    expect(k.pytanie.sesja).toBe('A');

    const z = await d.przelacz(wariant);
    k.okno.odpowiedz(odpowiedz);
    const r = await k.zapis;
    await kolejnaTura();

    expect(k.F.kom, 'po zmianie sesji brak komunikatu w pasku statusu').toEqual([]);
    expect(wczytania(k.F), 'po zmianie sesji brak vilda:patient-loaded').toEqual([]);
    expect(k.F.wskaznik, 'po zmianie sesji brak wskaźnika błędu zapisu').toEqual([]);
    expect((await k.F.wywolania[0].wynik).kod, 'zapis kończy się w sesji, w której ruszył').toBe('SESSION_CHANGED');
    expect(d.po(z).zdarzenia.map((e) => [e.typ, e.sesja]), 'po zmianie sesji brak powiadomień sejfu').toEqual([]);
    expect(await d.baza.listPatientsForUser(d.B.userId), 'konto B bez kart').toEqual([]);
    expect(await d.kartaTrwala('A', k.pid), 'karta A bez nowej wersji').toEqual(k.przedA);
    stanBezZmian(k.F, k.przed);
    expect(r).toBe(k.F.wywolania[0].p);
  });

  it('K3: ten sam przebieg bez zmiany sesji, odpowiedź „nadpisz” — „Zapisano…”, vilda:patient-loaded z id karty, nowa wersja karty A', async () => {
    const d = await urzadzenie();
    const k = await konfliktWFormularzu(d);
    expect(k.pytanie.sesja).toBe('A');

    k.okno.odpowiedz('nadpisz');
    const r = await k.zapis;

    expect((await k.F.wywolania[0].wynik).ok).toBe(true);
    expect(k.F.kom).toEqual([{ tekst: 'Zapisano (snapshot 3) dla Testowy Jan.', ton: 'ok' }]);
    expect(k.F.wskaznik).toEqual([]);
    expect(wczytania(k.F).map((e) => e.detail)).toMatchObject([{ patientId: k.pid, source: 'save', name: 'Testowy Jan' }]);
    expect(k.F.w.lastLoadedData, 'baza formularza = zapisany payload').not.toBe(k.przed.lastLoadedData);
    expect(k.F.w.lastLoadedData).toEqual(kopia(r));
    expect(k.F.w.__vildaOstatniWlasnyZapis).toMatchObject({ patientId: k.pid });
    expect(await d.kartaTrwala('A', k.pid)).toEqual({ jest: true, wersje: k.przedA.wersje + 1 });
    expect(await d.baza.listPatientsForUser(d.B.userId), 'konto B bez kart').toEqual([]);
  });
});

// ── Wskaźnik zapisu: blokada sejfu czyści „zapisywanie” (przegląd 4, M3-05) ─────────────────────────────────────────
describe('P-SESJA-ZAPISU: wskaźnik zapisu po przerwanym zapisie', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-30T10:00:00Z')); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('W1: stan „zapisywanie” po kliknięciu „Zapisz” — blokada sejfu zdarzeniem onLock zarejestrowanym przez wskaźnik daje stan ukryty', () => {
    const zdarzenia = {};
    const naBlokade = [];
    const sesja = new Map([['vildaCurrentPatientId', 'fikcyjny-pierwszy']]);
    const formularzWsk = { name: 'Fikcyjny Pierwszy', user: { sex: 'M', age: 16, height: 174, weight: 62 } };
    let zapisana = kopia(formularzWsk);
    let odblokowany = true;
    const win = {
      setTimeout, clearTimeout, setInterval, clearInterval, console: { debug() {} }, addEventListener() {},
      document: { readyState: 'complete', addEventListener(typ, l) { (zdarzenia[typ] ||= []).push(l); }, getElementById: () => null },
      sessionStorage: { getItem: (k) => sesja.get(k) ?? null, setItem: (k, v) => sesja.set(k, String(v)), removeItem: (k) => sesja.delete(k) },
      VildaVault: { isUnlocked: () => odblokowany, onPatientSaved() {}, onUnlock() {}, onLock(cb) { naBlokade.push(cb); } },
      VildaPanelPacjent: { nieaktualny: () => false },
      VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
      VildaPersistence: { readMainSession: () => kopia(zapisana) },
      collectUserData: () => kopia(formularzWsk),
      hasMeaningfulMainSessionData: (x) => Boolean(x && x.name),
      saveMainSessionNow: () => { zapisana = kopia(formularzWsk); return true; },
    };
    loadBrowserScript('vilda_save_status_indicator.js', win);
    const wsk = win.VildaSaveStatusIndicator;
    for (const l of zdarzenia['vilda:patient-loaded'] || []) l({ type: 'vilda:patient-loaded', detail: { patientId: 'fikcyjny-pierwszy', applySequence: 1, name: formularzWsk.name } });
    vi.advanceTimersByTime(150);
    formularzWsk.user.weight = 63;
    for (const l of zdarzenia.input || []) l({ type: 'input', isTrusted: true });
    vi.advanceTimersByTime(1000);
    expect(wsk.getState(), 'formularz zmieniony').toBe('dirty');
    wsk._onSaveClicked();
    expect(wsk.getState(), 'zapis w toku').toBe('saving');
    expect(naBlokade.length, 'wskaźnik rejestruje onLock sejfu').toBeGreaterThan(0);

    odblokowany = false;
    naBlokade.forEach((cb) => cb());
    expect(wsk.getState(), 'po blokadzie sejfu „zapisywanie” znika').toBe('hidden');
  });
});
