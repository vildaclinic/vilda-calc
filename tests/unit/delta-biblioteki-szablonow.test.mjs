import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Rata B synchronizacji Notatek: biblioteka szablonów dostaje własną deltę, tak jak notatki
// pacjenta. Worker (`handlers/delta.js`) rozgłasza ją po WebSocket jako `{type:'delta', payload}`
// i NIE zagląda do środka — sprawdza wyłącznie, czy `payload.iv` i `payload.data` są stringami.
// Cały ciężar poprawności koperty leży więc po stronie klienta i to jest przedmiot tych testów.
//
// UWAGA na pułapkę nazw: `buildNoteDelta` i `buildNoteTombstoneDelta` w sejfie dotyczą notatek
// PACJENTA (czytają `getPatientNoteForUser` i pakują do `patientNotes`). Przerobienie ich na
// bibliotekę zerwałoby jedyną działającą dziś natychmiastowość — Terminarz. Stąd osobna para
// `buildLibraryNoteDelta` / `buildLibraryNoteTombstoneDelta`.

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
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  const adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  vault.__adapter = adapter;
  return vault;
}

let licznik = 0;
async function urzadzenie(label) {
  const v = loadDevice();
  licznik += 1;
  await v.createUser(`Delta#Biblioteka2026!${label}${licznik}`, { label, iterations: 10000 });
  return v;
}

const tytuly = async (v) => (await v.listNotes()).map((x) => x.title).sort();

describe('delta biblioteki szablonów', () => {
  it('koperta niesie szablon w polu notes, a nie w patientNotes', async () => {
    const v = await urzadzenie('A');
    const zapis = await v.saveNote({ title: 'Opis USG tarczycy', category: 'badanie', body: 'treść A' });

    const koperta = await v.buildLibraryNoteDelta(zapis.id);
    expect(koperta, 'builder oddaje zaszyfrowaną kopertę').toBeTruthy();
    expect(typeof koperta.iv, 'worker sprawdza iv jako string').toBe('string');
    expect(typeof koperta.data, 'worker sprawdza data jako string').toBe('string');

    const srodek = await v.decryptPayloadForCurrentUser(koperta.iv, koperta.data);
    expect(srodek.notes.length, 'szablon jedzie w polu notes').toBe(1);
    expect(srodek.notes[0].id).toBe(zapis.id);
    expect(srodek.notes[0].title).toBe('Opis USG tarczycy');
    expect(srodek.notes[0].body).toBe('treść A');
    expect(srodek.notes[0].updatedAtISO, 'bez znacznika scalanie odrzuci wpis').toBeTruthy();
    expect(srodek.patientNotes.length, 'i NIE w polu notatek pacjenta').toBe(0);
    expect(srodek.noteTombstones.length).toBe(0);
  });

  it('koperta kasowania niesie nagrobek z podanym znacznikiem', async () => {
    const v = await urzadzenie('B');
    const zapis = await v.saveNote({ title: 'Do skasowania', category: 'wlasne', body: 'x' });

    const znacznik = '2030-01-01T00:00:00.000Z';
    const koperta = await v.buildLibraryNoteTombstoneDelta(zapis.id, znacznik);
    const srodek = await v.decryptPayloadForCurrentUser(koperta.iv, koperta.data);

    expect(srodek.noteTombstones.length).toBe(1);
    expect(srodek.noteTombstones[0].id).toBe(zapis.id);
    expect(srodek.noteTombstones[0].deletedAtISO, 'znacznik z removeNote, nie własny')
      .toBe(znacznik);
    expect(srodek.notes.length).toBe(0);
    expect(srodek.patientNoteTombstones.length).toBe(0);
  });

  it('spóźniona delta nie cofa nowszej wersji szablonu', async () => {
    // Delta jest rozgłaszana „na żywo", ale trafia też do trwałego logu w R2 i może dojść
    // z opóźnieniem (urządzenie było offline). Nie może wtedy nadpisać nowszej treści.
    const v = await urzadzenie('C');
    const zapis = await v.saveNote({ title: 'Szablon', category: 'wlasne', body: 'wersja 1' });
    const stara = await v.buildLibraryNoteDelta(zapis.id);

    await new Promise((r) => { setTimeout(r, 5); });
    await v.saveNote({ id: zapis.id, title: 'Szablon', category: 'wlasne', body: 'wersja 2' });

    await v.applyEncryptedDelta(stara);
    const po = (await v.listNotes()).find((n) => n.id === zapis.id);
    expect(po.body, 'nowsza wersja zostaje').toBe('wersja 2');
  });

  it('spóźniona delta nie wskrzesza skasowanego szablonu', async () => {
    const v = await urzadzenie('D');
    const zapis = await v.saveNote({ title: 'Szablon', category: 'wlasne', body: 'treść' });
    const stara = await v.buildLibraryNoteDelta(zapis.id);

    await new Promise((r) => { setTimeout(r, 5); });
    await v.removeNote(zapis.id);
    expect(await tytuly(v)).toEqual([]);

    await v.applyEncryptedDelta(stara);
    expect(await tytuly(v), 'nagrobek wygrywa z wcześniejszą deltą').toEqual([]);
  });

  it('builder nie rozsyła notatki, której nie da się odszyfrować', async () => {
    // nn() przy nieudanym odszyfrowaniu NIE rzuca, tylko zwraca notatkę zastępczą z tytułem
    // „(błąd odczytu)". Rozesłanie jej deltą nadpisałoby dobrą kopię na pozostałych urządzeniach
    // — jedno uszkodzone szyfrogramem urządzenie zepsułoby całą flotę.
    const v = await urzadzenie('E');
    const zapis = await v.saveNote({ title: 'Uszkodzony', category: 'wlasne', body: 'x' });

    // kontrola dodatnia: zanim popsujemy, builder oddaje kopertę
    expect(await v.buildLibraryNoteDelta(zapis.id), 'przed uszkodzeniem koperta jest').toBeTruthy();

    const { userId } = await v.exportSyncPayload();
    const rekord = await v.__adapter.getNoteForUser(userId, zapis.id);
    await v.__adapter.putNoteForUser(userId, {
      id: rekord.id,
      noteCipher: { iv: rekord.noteCipher.iv, data: 'AAAAAAAAAAAAAAAAAAAAAAAA' },
      createdAtISO: rekord.createdAtISO,
      updatedAtISO: rekord.updatedAtISO,
    });

    // sejf sam w sobie nadal działa — pokazuje notatkę zastępczą, i tak ma być
    const lista = await v.listNotes();
    expect(lista[0].title, 'lista pokazuje zastępczy tytuł zamiast wywalać się').toContain('błąd odczytu');

    // ale delty z takiej notatki nie wolno rozesłać
    expect(await v.buildLibraryNoteDelta(zapis.id),
      'uszkodzona notatka nie opuszcza urządzenia').toBeNull();
  });

  it('nieistniejące id nie produkuje koperty', async () => {
    const v = await urzadzenie('F');
    expect(await v.buildLibraryNoteDelta('nie-ma-takiego-id')).toBeNull();
    expect(await v.buildLibraryNoteTombstoneDelta('')).toBeNull();
  });
});
