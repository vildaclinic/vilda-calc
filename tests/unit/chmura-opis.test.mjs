import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-CHMURA-OPIS (decyzja właściciela 2026-10-26, 5a i A). Teksty o trybie chmurowym obiecywały więcej, niż robi kod:
// „wyłącznie w chmurze”, „do pamięci RAM”, „nikt nie znajdzie ich na dysku”, „nigdy na dysku… znikają bez śladu”,
// „Zamknięcie przeglądarki i tak wylogowuje”, a polityka prywatności opisywała wyłączony cache „vilda-cloud-cache”.
// Właściciel przyjął dosłownie nowy akapit „Dane pacjentów” w Ustawieniach (z dwoma wyjątkami: kosz i dane sprzed
// włączenia trybu chmurowego) i poprawki tej samej obietnicy w pozostałych miejscach.
//
// Ten plik pilnuje dwóch rzeczy:
//   (a) teksty — bez starych obietnic, z nowym tekstem (czytane z plików; napisy w JS w zapisie \uXXXX jak w pliku);
//   (b) fakty z kodu, na których stoją oba wyjątki — na prawdziwym vilda_vault.js, z magazynem w pamięci. Gdy przyszły
//       PR zacznie kasować dawną kopię przy przełączeniu na tryb chmurowy albo przestanie trzymać kosz na dysku, test
//       się zaczerwieni: wtedy trzeba usunąć odpowiedni wyjątek z tekstów (Ustawienia, polityka) i z tego pliku.
// Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const surowy = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');
const tekst = (plik) => surowy(plik).replace(/\s+/g, ' ');
// Sprawdzenia na całych plikach jako tak/nie — przy błędzie komunikat podaje szukany napis, a nie cały plik.
const ma = (t, napis) => expect(t.includes(napis), `brak: ${napis}`).toBe(true);
const nieMa = (t, napis) => expect(t.includes(napis), `stara obietnica: ${napis}`).toBe(false);

const TEKST_WLASCICIELA = '<strong>Dane pacjentów</strong> — całość ich dokumentacji medycznej — przechowywane są w chmurze. '
  + 'Na ten komputer pobierają się tylko na czas sesji, do pamięci karty przeglądarki, i są usuwane z chwilą wylogowania. '
  + 'Wyjątki, zaszyfrowane Twoim hasłem: kosz, czyli treść usuniętych zapisów (także z innych urządzeń), który znika przy '
  + 'pierwszym logowaniu po 30 dniach, oraz dane pacjentów zapisane na tym komputerze, zanim włączono tryb chmurowy.';

describe('P-CHMURA-OPIS (a): teksty dla użytkownika', () => {
  it('Ustawienia: tekst właściciela dosłownie, bez starych obietnic', () => {
    const t = tekst('ustawienia.html');
    ma(t, TEKST_WLASCICIELA); // akapit „Dane pacjentów” (decyzja 5a, dosłownie)
    ma(t, 'Zamknięcie przeglądarki nie zawsze wylogowuje');
    // Podsumowanie sekcji „Logowanie na innych urządzeniach”: obietnica tylko dla logowania telefonem jednorazowo.
    ma(t, 'telefonem także jednorazowo, bez zostawiania danych pacjentów na obcym urządzeniu');
    nieMa(t, 'kodem konta — bez zostawiania danych na obcym urządzeniu');
    for (const stare of ['wyłącznie w chmurze', 'pamięci RAM', 'nie znajdzie ich na dysku', 'i tak wylogowuje',
      'w pełni zaszyfrowane', 'Żadne dane nie zostają', 'nie ma śladu']) {
      nieMa(t, stare);
    }
  });

  it('ekran logowania (vilda_auth_ui.js): karta „Komputer w pracy” i podtytuły trybu chmurowego', () => {
    const t = surowy('vilda_auth_ui.js');
    ma(t, 'pobieraj\\u0105 si\\u0119 tylko na czas sesji i s\\u0105 usuwane po wylogowaniu');
    ma(t, 'Zostaj\\u0105 konto, ustawienia i kosz zapis\\xF3w (zaszyfrowany).');
    // Karta logowania kodem QR: wybór dotyczy kopii pacjentów na dysku.
    ma(t, 'czy kopia pacjent\\xF3w ma zosta\\u0107 na dysku, czy tylko w chmurze');
    nieMa(t, 'czy pacjenci maj\\u0105 zosta\\u0107 na dysku');
    for (const stare of ['nigdy na dysku', 'bez \\u015Bladu', 'tylko w chmurze</strong>', 'pacjent\\xF3w tylko w chmurze']) {
      nieMa(t, stare);
    }
  });

  it('dymek przycisku synchronizacji (vilda_chrome.js i podgląd design-system)', () => {
    nieMa(surowy('vilda_chrome.js'), 'pacjent\\xF3w tylko w chmurze');
    ma(surowy('vilda_chrome.js'), 'Tryb chmurowy aktywny \\u2014 dane pacjent\\xF3w w chmurze.');
    const podglad = surowy('design-system/src/project/components/ChromeActionButton/preview.html');
    nieMa(podglad, 'pacjentów tylko w chmurze');
  });

  it('polityka prywatności: bez wyłączonego cache, z oboma wyjątkami trybu chmurowego', () => {
    const t = tekst('polityka-prywatnosci.html');
    for (const stare of ['vilda-cloud-cache', 'lokalny cache', "offline'owe"]) nieMa(t, stare);
    ma(t, 'Wyjątek stanowią, w postaci zaszyfrowanej');
    ma(t, 'przed włączeniem trybu chmurowego');
    ma(t, 'W trybie chmurowym ponadto dane pacjentów pobrane z chmury na czas sesji');
    ma(t, '(w trybie chmurowym zob. niżej)'); // odesłanie w wierszu IndexedDB
  });
});

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
}

function urzadzenie() {
  const win = {
    name: '',
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    navigator: {},
    document: {
      addEventListener() {}, removeEventListener() {}, hidden: false,
      documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } },
    },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const dysk = win.VildaVault.createInMemoryAdapter();
  win.VildaVault.setStorageAdapter(dysk);
  return { win, sejf: win.VildaVault, dysk };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const HASLO = 'Chmura#Opis!2026aa';
const wizyta = (wzrost) => ({ name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: wzrost, weight: 22 } });

describe('P-CHMURA-OPIS (b): fakty z kodu, na których stoją wyjątki w tekstach', () => {
  it('tryb chmurowy po wylogowaniu: na dysku zostaje kosz z zaszyfrowaną treścią, pacjentów nie ma (wyjątek 1)', async () => {
    const { win, sejf, dysk } = urzadzenie();
    const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000, storageMode: 'cloud-only' });
    expect(sejf.isCloudOnlyMode()).toBe(true);
    const a = await sejf.savePatient(wizyta(120), { dedup: false });
    for (const w of [121, 122]) {
      await chwila(3);
      await sejf.savePatient(wizyta(w), { patientId: a.patientId, dedup: false });
    }
    const wersje = (await sejf.getPatient(a.patientId)).snapshots;
    await sejf.moveSnapshotToTrash(a.patientId, wersje[1].snapshotId);
    sejf.lock('manual');
    await chwila(30);
    const meta = await dysk.getUserMeta(konto.userId);
    const kosz = (meta.snapshotTombstones || []).filter((e) => e.snapshotId === wersje[1].snapshotId);
    expect(kosz.length, 'wpis kosza w trwałym rekordzie konta').toBe(1);
    expect(typeof kosz[0].payloadCipher.data, 'treść zapisu w koszu — zaszyfrowana').toBe('string');
    expect(JSON.stringify(meta)).not.toContain('Testowy');
    expect(await dysk.listPatientsForUser(konto.userId), 'trwały sklep pacjentów pusty').toEqual([]);
    expect(win.sessionStorage.klucze().filter((k) => k.startsWith('veph:')), 'pamięć karty bez danych sesji').toEqual([]);
  });

  it('przełączenie na tryb chmurowy nie kasuje dawnej kopii pacjentów (wyjątek 2 — usunąć z tekstów, gdy to się zmieni)', async () => {
    const { sejf, dysk } = urzadzenie();
    const konto = await sejf.createUser(HASLO, { label: 'Fikcyjna Lekarka', iterations: 1000 });
    await sejf.savePatient(wizyta(120), { dedup: false });
    await sejf.setStorageMode(konto.userId, 'cloud-only');
    sejf.lock('manual');
    await sejf.unlockUser(konto.userId, HASLO);
    expect(sejf.isCloudOnlyMode()).toBe(true);
    expect((await dysk.listPatientsForUser(konto.userId)).length,
      'dawna kopia zostaje na dysku — gdy PR zacznie ją kasować, usuń wyjątek „dane sprzed trybu chmurowego” z tekstów').toBe(1);
  });
});
