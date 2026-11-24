import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-SZYBKIE (decyzja właściciela 2026-11-24): dwa odczyty sejfu dla statystyk Bazy pacjentów.
//   getNewestSnapshot(patientId)            — najnowsza wersja karty bez odszyfrowania pozostałych,
//   listPatientNotesByCategory(category)    — notatki jednej kategorii w jednym odczycie.
// PRAWDZIWY sejf (vilda_crypto.js + vilda_vault.js) na adapterze pamięciowym. Dane wyłącznie FIKCYJNE.

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
async function urzadzenie() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const plik of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(plik, win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fikcyjny#Najnowsza!2026', { label: 'Fikcyjny sejf odczytu', iterations: 10000 });
  return { win, vault };
}
const karta = (masa, dodatki = {}) => ({ version: 1, name: 'Fikcyjny Odczyt Najnowszej', user: { lastName: 'Fikcyjny Odczyt', firstName: 'Najnowszej', sex: 'M', age: 9, ageMonths: 0, height: 130, weight: masa }, ...dodatki });
// Liczba odszyfrowań (AES-GCM) w trakcie jednego wywołania.
async function odszyfrowania(akcja) {
  const szpieg = vi.spyOn(globalThis.crypto.subtle, 'decrypt');
  try { const wynik = await akcja(); return { wynik, razy: szpieg.mock.calls.length }; } finally { szpieg.mockRestore(); }
}

describe('getNewestSnapshot — najnowsza wersja karty', () => {
  it('oddaje to samo, co getLatestSnapshot, ale odszyfrowuje jedną wersję zamiast wszystkich', async () => {
    const { vault } = await urzadzenie();
    const id = (await vault.savePatient(karta(30), { dedup: false })).patientId;
    for (const masa of [31, 32, 33, 34]) await vault.savePatient(karta(masa), { patientId: id, dedup: false });
    expect((await vault.listPatientDirectory()).find((p) => p.patientId === id).snapshotCount).toBe(5);

    const stary = await odszyfrowania(() => vault.getLatestSnapshot(id));
    const nowy = await odszyfrowania(() => vault.getNewestSnapshot(id));
    expect(nowy.wynik).toEqual(stary.wynik);
    expect(nowy.wynik.payload.user.weight).toBe(34);
    expect(Object.keys(nowy.wynik)).toEqual(Object.keys(stary.wynik));
    expect(stary.razy, 'dotychczasowy odczyt: nagłówek i każda z pięciu wersji').toBe(6);
    expect(nowy.razy, 'nowy odczyt: tylko najnowsza wersja').toBe(1);
  });

  it('wskazuje tę samą wersję po poprawce starszej wersji, przypięciu i przywróceniu wersji jako nowej', async () => {
    const { vault } = await urzadzenie();
    // Zapisy w różnych milisekundach — jak w prawdziwej pracy; przy tej samej chwili zapisu o kolejności decyduje chwila zmiany.
    const pauza = () => new Promise((resolve) => { setTimeout(resolve, 4); });
    const id = (await vault.savePatient(karta(30), { dedup: false })).patientId;
    await pauza(); await vault.savePatient(karta(31), { patientId: id, dedup: false });
    await pauza(); await vault.savePatient(karta(32), { patientId: id, dedup: false });
    await pauza();
    const zgodne = async (opis) => {
      const [stary, nowy] = [await vault.getLatestSnapshot(id), await vault.getNewestSnapshot(id)];
      expect(nowy, opis).toEqual(stary);
      return nowy;
    };
    const wersje = (await vault.getPatient(id)).snapshots;
    const najstarsza = wersje[wersje.length - 1];
    expect(najstarsza.payload.user.weight).toBe(30);

    // Która wersja jest „najnowsza” po każdej operacji, rozstrzyga sejf (porządek yr); tu liczy się tylko to,
    // że tańszy odczyt wskazuje zawsze DOKŁADNIE tę samą wersję, co dotychczasowy.
    const przebieg = [(await zgodne('trzy zapisy')).payload.user.weight];
    await vault.updateSnapshotPayload(id, najstarsza.snapshotId, { ...najstarsza.payload, user: { ...najstarsza.payload.user, weight: 30.5 } });
    przebieg.push((await zgodne('po poprawce starszej wersji')).payload.user.weight);
    await pauza(); await vault.setSnapshotPinned(id, najstarsza.snapshotId, true);
    const przypieta = await zgodne('po przypięciu starszej wersji');
    przebieg.push(przypieta.payload.user.weight);
    await pauza(); await vault.restoreSnapshotAsNew(id, wersje[0].snapshotId);
    przebieg.push((await zgodne('po przywróceniu wersji jako nowej')).payload.user.weight);
    expect(przebieg[0]).toBe(32);
    expect(przebieg[3], 'przywrócona treść (32 kg) jest najnowszą wersją').toBe(32);
    expect((await vault.getPatient(id)).snapshots).toHaveLength(4);
  });

  it('pacjent bez wersji i nieznany identyfikator dają null; zablokowany sejf odmawia', async () => {
    const { vault } = await urzadzenie();
    expect(await vault.getNewestSnapshot('nie-ma-takiego-pacjenta')).toBeNull();
    await expect(vault.getNewestSnapshot('')).rejects.toThrow('getNewestSnapshot: brak patientId.');
    const id = (await vault.savePatient(karta(30), { dedup: false })).patientId;
    // Odczyt ścisły przerywa się, gdy widok, który o niego prosił, już nie istnieje.
    await expect(vault.getNewestSnapshot(id, { strict: true, isCurrent: () => false })).rejects.toMatchObject({ code: 'VAULT_READ_CANCELLED' });
    expect((await vault.getNewestSnapshot(id, { strict: true, isCurrent: () => true })).payload.user.weight).toBe(30);
    vault.lock('manual');
    await expect(vault.getNewestSnapshot(id)).rejects.toThrow('Zaloguj się, by pobrać pacjenta.');
  });
});

describe('listPatientNotesByCategory — notatki jednej kategorii', () => {
  it('odszyfrowuje tylko notatki wskazanej kategorii i oddaje je jak listAllPatientNotes', async () => {
    const { vault } = await urzadzenie();
    const a = (await vault.savePatient(karta(30), { dedup: false })).patientId;
    const b = (await vault.savePatient({ ...karta(40), name: 'Fikcyjna Odczyt Druga', user: { ...karta(40).user, firstName: 'Druga' } }, { dedup: false })).patientId;
    for (let i = 0; i < 6; i += 1) await vault.savePatientNote({ patientId: i % 2 ? a : b, title: `Fikcyjna notatka ${i}`, body: 'Fikcyjna treść.', category: 'followup' });
    await vault.savePatientNoteOnce({ id: 'fikcyjny-wpis-1', patientId: a, title: 'Leczenie otyłości — Kontynuacja', body: 'Fikcyjny wpis 1', category: 'leczenie-otylosci', clinicalDateISO: '2026-04-01' });
    await vault.savePatientNoteOnce({ id: 'fikcyjny-wpis-2', patientId: b, title: 'Leczenie otyłości — Kontynuacja', body: 'Fikcyjny wpis 2', category: 'leczenie-otylosci', clinicalDateISO: '2026-05-01' });

    const wszystkie = await odszyfrowania(() => vault.listAllPatientNotes());
    const wpisy = await odszyfrowania(() => vault.listPatientNotesByCategory('leczenie-otylosci'));
    expect(wszystkie.wynik).toHaveLength(8);
    expect(wszystkie.razy).toBe(8);
    expect(wpisy.razy, 'tylko dwie notatki tej kategorii').toBe(2);
    expect(wpisy.wynik.map((n) => n.id).sort()).toEqual(['fikcyjny-wpis-1', 'fikcyjny-wpis-2']);
    expect(wpisy.wynik).toEqual(wszystkie.wynik.filter((n) => n.category === 'leczenie-otylosci'));
    expect(wpisy.wynik.map((n) => n.patientId).sort()).toEqual([a, b].sort());
    expect(await vault.listPatientNotesByCategory('kategoria-bez-notatek')).toEqual([]);
  });

  it('wymaga kategorii, odblokowanego sejfu i żywego widoku przy odczycie ścisłym', async () => {
    const { vault } = await urzadzenie();
    await expect(vault.listPatientNotesByCategory('')).rejects.toThrow('listPatientNotesByCategory: brak kategorii.');
    await expect(vault.listPatientNotesByCategory('leczenie-otylosci', { strict: true, isCurrent: () => false })).rejects.toMatchObject({ code: 'VAULT_READ_CANCELLED' });
    vault.lock('manual');
    await expect(vault.listPatientNotesByCategory('leczenie-otylosci')).rejects.toThrow('Zaloguj się, by wyświetlić notatki pacjentów.');
  });
});
