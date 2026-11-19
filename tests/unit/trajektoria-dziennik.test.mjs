import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-TRAJEKTORIA-DZIENNIK (decyzja właściciela 2026-11-19: „trajektoria i karta zbiorcza z dziennika”). Kontekst kliniczny
// analizy trajektorii (kursy leczenia otyłości: od Włączenia do Zakończenia) liczy się z dziennika leczenia, a nie
// z samego zapisu ostatniej wizyty. Różnica jest wtedy, gdy dziennik wyprzedza zapis wizyty — np. Zakończenie dodane
// w monitorze DocPro przed „Zapisz dane”. Karta porównania na Start i w Klirensie (vilda_summary_cards.js) bierze
// punkty z VildaDziennikOtylosci.punktyWczytanego() — pamięci dziennika pacjenta karty odczytanej po wczytaniu pacjenta.
//
// Test woła PRODUKCYJNE moduły na PRAWDZIWYM sejfie (vilda_crypto.js + vilda_vault.js, adapter pamięciowy):
// vilda_cykle_leczenia.js (dziennik) i vilda_trajectory_analysis.js (buildClinicalContext). Dane wyłącznie FIKCYJNE.

const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)', dose: '2,4 mg / tydz.' };
// Dziewczynka ur. 15.11.2011: wiek w miesiącach i data wizyty idą razem.
const DATA = { 152: '2024-07-15', 158: '2025-01-15', 161: '2025-04-15' };
const pkt = (type, mies, kg) => ({
  id: `${type}-${mies}`, type, ageYears: Math.floor(mies / 12), ageMonths: mies % 12, dateISO: DATA[mies],
  weight: kg, height: 155, ...WEGOVY,
});
const MIGAWKA = [pkt('start', 152, 68), pkt('continue', 158, 66)];

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; },
  };
}
function okno() {
  const doc = new EventTarget();
  doc.hidden = false;
  const win = new EventTarget();
  Object.assign(win, {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(), CustomEvent: globalThis.CustomEvent,
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis), document: doc,
  });
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  loadBrowserScript('vilda_trajectory_analysis.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  const sygnaly = [];
  doc.addEventListener('vilda:therapy-points-changed', (e) => sygnaly.push(e.detail && e.detail.source));
  return { win, vault, D: win.VildaDziennikOtylosci, T: win.VildaTrajectoryAnalysis, sygnaly };
}

let teraz = Date.parse('2026-11-19T08:00:00.000Z');
const krok = (ms = 60e3) => { teraz += ms; vi.setSystemTime(teraz); };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(teraz); });
afterEach(() => { vi.useRealTimers(); });

const PACJENTKA = { name: 'Testowa Fikcyjna', user: { sex: 'F', age: 13, ageMonths: 5, height: 156, weight: 66 } };
const kontekst = (T, punkty) => T.buildClinicalContext({ ghTherapyPoints: [], obesityTherapyPoints: punkty, sex: 'F', source: 'OLAF' });

async function przygotuj() {
  const U = okno();
  await U.vault.createUser('Fikcyjne#Trajektoria!1', { label: 'Fikcyjny lekarz', iterations: 10000 });
  krok();
  const pid = (await U.vault.savePatient({ ...PACJENTKA, obesityTherapyPoints: MIGAWKA }, { dedup: false })).patientId;
  U.win.sessionStorage.setItem('vildaCurrentPatientId', pid);
  return { U, pid };
}

describe('dziennik wczytanego pacjenta (punktyWczytanego) i kontekst trajektorii', () => {
  it('bez wpisów w dzienniku — null i bez sygnału: konsumenci zostają przy zapisie wizyty', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    expect(U.D.punktyWczytanego()).toBeNull();
    expect(U.sygnaly).toEqual([]);
  });

  it('Zakończenie dodane w monitorze (dziennik), zanim zapis wizyty je ma — kurs zakończony z dziennika, aktywny z migawki', async () => {
    const { U, pid } = await przygotuj();
    // Monitor DocPro zapisuje wpis od razu w dzienniku; migawka wizyty dostanie go dopiero przy „Zapisz dane”.
    const plan = U.D.planNowego(await U.D.wczytaj(pid, MIGAWKA), pid, {
      type: 'end', dateISO: DATA[161], ageYears: 13, ageMonths: 5, weight: 64.5, weightSource: 'gabinet', height: 155, heightSource: 'gabinet', ...WEGOVY,
    });
    expect(plan.ok).toBe(true);
    krok();
    await U.D.zapisz(pid, plan.wersje, { vault: U.vault });
    await U.D.odswiezWczytanego();
    const punkty = U.D.punktyWczytanego();
    expect(punkty.map((p) => p.type)).toEqual(['start', 'continue', 'end']);
    expect(U.sygnaly).toEqual(['obesity-dziennik']);

    const zDziennika = kontekst(U.T, punkty);
    const zMigawki = kontekst(U.T, MIGAWKA);
    expect(zMigawki.redKursy).toEqual([{ a: 152, b: null, label: 'Wegovy' }]);
    expect(zDziennika.redKursy).toEqual([{ a: 152, b: 161, label: 'Wegovy' }]);

    // Ponowny odczyt bez zmian — bez drugiego sygnału (karta porównania nie czyta sejfu na darmo).
    await U.D.odswiezWczytanego();
    expect(U.sygnaly).toEqual(['obesity-dziennik']);
  });

  it('zapis wpisu z Karty (bez podanego sejfu) odświeża pamięć i daje sygnał', async () => {
    const { U, pid } = await przygotuj();
    const plan = U.D.planNowego(await U.D.wczytaj(pid, MIGAWKA), pid, {
      type: 'continue', dateISO: '2025-03-10', ageYears: 13, ageMonths: 3, weight: 65.4, weightSource: 'pacjent', height: null, ...WEGOVY,
    });
    krok();
    await U.D.zapisz(pid, plan.wersje);
    await vi.waitFor(() => expect(U.D.punktyWczytanego() && U.D.punktyWczytanego().length).toBe(3));
    expect(U.sygnaly).toEqual(['obesity-dziennik']);
  });

  it('inny pacjent karty, zablokowany sejf, „Wyczyść” — null (bez danych poprzedniego pacjenta)', async () => {
    const { U, pid } = await przygotuj();
    const plan = U.D.planNowego(await U.D.wczytaj(pid, MIGAWKA), pid, {
      type: 'end', dateISO: DATA[161], ageYears: 13, ageMonths: 5, weight: 64.5, weightSource: 'gabinet', height: 155, heightSource: 'gabinet', ...WEGOVY,
    });
    krok();
    await U.D.zapisz(pid, plan.wersje, { vault: U.vault });
    await U.D.odswiezWczytanego();
    expect(U.D.punktyWczytanego()).not.toBeNull();

    U.win.sessionStorage.setItem('vildaCurrentPatientId', 'fikcyjny-inny-pacjent');
    expect(U.D.punktyWczytanego(), 'pacjent karty się zmienił').toBeNull();
    U.win.sessionStorage.setItem('vildaCurrentPatientId', pid);
    expect(U.D.punktyWczytanego()).not.toBeNull();

    U.win.document.dispatchEvent(new CustomEvent('vilda:user-state-cleared'));
    expect(U.D.punktyWczytanego(), '„Wyczyść”').toBeNull();
    await U.D.odswiezWczytanego();
    expect(U.D.punktyWczytanego()).not.toBeNull();

    U.vault.lock();
    expect(U.D.punktyWczytanego(), 'zablokowany sejf').toBeNull();
  });
});
