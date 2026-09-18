import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOTATKI rata 3b, znalezisko G14b (decyzja właściciela D10) — pełny mechanizm konfliktu edycji.
//
// Rata 2 dała baner „Ta notatka zmieniła się na innym urządzeniu" — ostrzeżenie, po którym zapis
// i tak nadpisywał cudzą wersję; baner sam to zapowiadał. Zmierzone w audycie: dopisek zrobiony
// na telefonie znikał i z komputera, i — po synchronizacji — z telefonu.
//
// Teraz edytor podaje `baseRev` (wersję, którą miał na ekranie w chwili otwarcia), a sejf przy
// niezgodności zwraca `{conflict:true, current}` zamiast nadpisać. Kluczowa jest WSTECZNA
// ZGODNOŚĆ: `savePatientNote` woła też Terminarz i moduły terapii, które `baseRev` nie podają —
// dla nich zachowanie musi zostać dokładnie takie, jak było.

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
async function sejf(label) {
  licznik += 1;
  const v = loadDevice();
  await v.createUser(`Konflikt#Rata3!${label}${licznik}`, { label, iterations: 10000 });
  return v;
}
const syncTo = async (cel, zrodlo) => cel.mergeSyncPayload(await zrodlo.exportSyncPayload());

async function pacjentZNotatka(v) {
  const p = await v.savePatient({ name: 'Testowy Konflikt', sex: 'M', age: 8, height: 130, weight: 27 });
  const zapis = await v.savePatientNote({
    patientId: p.patientId, title: 'Wizyta kontrolna', body: 'Pierwsza wersja treści.', category: 'observation',
  });
  return { patientId: p.patientId, noteId: zapis.id };
}

describe('G14b — sejf odmawia cichego nadpisania cudzej wersji', () => {
  it('baseRev starszy niż wersja w sejfie zwraca konflikt razem z aktualną treścią', async () => {
    const v = await sejf('konflikt');
    const { patientId, noteId } = await pacjentZNotatka(v);
    const przed = await v.getPatientNote(noteId);
    expect(przed.rev).toBe(1);

    // Ktoś inny (drugie urządzenie albo scalanie) zapisuje nowszą wersję.
    await v.savePatientNote({ patientId, id: noteId, title: 'Wizyta kontrolna', body: 'Dopisek z drugiego urządzenia.' });
    expect((await v.getPatientNote(noteId)).rev).toBe(2);

    // Edytor, który otworzył się na wersji 1, próbuje zapisać swoją treść.
    const wynik = await v.savePatientNote({
      patientId, id: noteId, baseRev: przed.rev, title: 'Wizyta kontrolna', body: 'Moja treść z otwartego edytora.',
    });

    expect(wynik.conflict, 'zapis ma się zatrzymać, a nie nadpisać').toBe(true);
    expect(wynik.rev).toBe(2);
    expect(wynik.current.body, 'konflikt niesie treść, którą lekarz może wczytać')
      .toBe('Dopisek z drugiego urządzenia.');
    expect((await v.getPatientNote(noteId)).body, 'nic się nie zapisało')
      .toBe('Dopisek z drugiego urządzenia.');
  });

  it('po podniesieniu baseRev do wersji z sejfu zapis przechodzi („Nadpisz moją wersją")', async () => {
    const v = await sejf('nadpisz');
    const { patientId, noteId } = await pacjentZNotatka(v);
    await v.savePatientNote({ patientId, id: noteId, body: 'Wersja druga.' });
    const konflikt = await v.savePatientNote({ patientId, id: noteId, baseRev: 1, body: 'Moja treść.' });
    expect(konflikt.conflict).toBe(true);

    const po = await v.savePatientNote({ patientId, id: noteId, baseRev: konflikt.rev, body: 'Moja treść.' });
    expect(po.conflict, 'drugie podejście nie jest już konfliktem').toBeUndefined();
    expect((await v.getPatientNote(noteId)).body).toBe('Moja treść.');
    expect((await v.getPatientNote(noteId)).rev).toBe(3);
  });

  it('baseRev równy albo wyższy niż wersja w sejfie zapisuje normalnie', async () => {
    const v = await sejf('rowny');
    const { patientId, noteId } = await pacjentZNotatka(v);
    const wynik = await v.savePatientNote({ patientId, id: noteId, baseRev: 1, body: 'Zwykła edycja.' });
    expect(wynik.conflict).toBeUndefined();
    expect((await v.getPatientNote(noteId)).body).toBe('Zwykła edycja.');
  });

  it('WSTECZNA ZGODNOŚĆ: zapis bez baseRev zachowuje się dokładnie jak dotąd', async () => {
    // Tak woła Terminarz, moduły terapii i każdy zapis nowej notatki.
    const v = await sejf('bezbaserev');
    const { patientId, noteId } = await pacjentZNotatka(v);
    await v.savePatientNote({ patientId, id: noteId, body: 'Wersja druga.' });
    const wynik = await v.savePatientNote({ patientId, id: noteId, body: 'Nadpisanie bez baseRev.' });
    expect(wynik.conflict, 'brak baseRev to brak ochrony — i tak ma zostać').toBeUndefined();
    expect((await v.getPatientNote(noteId)).body).toBe('Nadpisanie bez baseRev.');
  });

  it('nowa notatka z baseRev nie jest konfliktem (nie ma z czym kolidować)', async () => {
    const v = await sejf('nowa');
    const p = await v.savePatient({ name: 'Testowy Nowy', sex: 'K', age: 4, height: 100, weight: 16 });
    const wynik = await v.savePatientNote({ patientId: p.patientId, baseRev: 7, title: 'Nowa', body: 'Treść.' });
    expect(wynik.conflict).toBeUndefined();
    expect(wynik.isNew).toBe(true);
  });

  it('wskrzeszenie notatki skasowanej na innym urządzeniu też nie jest konfliktem', async () => {
    const A = await sejf('wskrzesA');
    const B = await sejf('wskrzesB');
    const p = await A.savePatient({ name: 'Testowy Wskrzeszony', sex: 'M', age: 6, height: 118, weight: 21 });
    const { id } = await A.savePatientNote({ patientId: p.patientId, title: 'Do wskrzeszenia', body: 'Treść.' });
    await syncTo(B, A);
    await B.removePatientNote(id);
    await syncTo(A, B);
    expect(await A.getPatientNote(id)).toBeNull();

    const wynik = await A.savePatientNote({ patientId: p.patientId, id, baseRev: 1, title: 'Do wskrzeszenia', body: 'Treść.' });
    expect(wynik.conflict, 'wskrzeszenie idzie ścieżką P5, nie konfliktem').toBeUndefined();
    expect(wynik.isNew).toBe(true);
  });

  it('pusty zapis nadal rzuca wyjątkiem, a nie konfliktem (kolejność bramek)', async () => {
    const v = await sejf('pusty');
    const { patientId, noteId } = await pacjentZNotatka(v);
    await v.savePatientNote({ patientId, id: noteId, body: 'Wersja druga.' });
    await expect(v.savePatientNote({ patientId, id: noteId, baseRev: 1, title: '', body: '' }))
      .rejects.toThrow(/tytu/);
  });

  it('dwa urządzenia: konflikt łapie treść przyniesioną scalaniem, nie tylko lokalny zapis', async () => {
    const A = await sejf('dwaA');
    const B = await sejf('dwaB');
    const p = await A.savePatient({ name: 'Testowy Dwa', sex: 'K', age: 9, height: 136, weight: 30 });
    const { id } = await A.savePatientNote({ patientId: p.patientId, title: 'Wizyta', body: 'Baza.' });
    await syncTo(B, A);

    // Lekarz otwiera edytor na A (wersja 1), a w tym czasie B dopisuje dawkę i zmiana dojeżdża.
    const naEkranie = await A.getPatientNote(id);
    await B.savePatientNote({ patientId: p.patientId, id, title: 'Wizyta', body: 'Baza. Dawka 25 µg.' });
    await syncTo(A, B);

    const wynik = await A.savePatientNote({
      patientId: p.patientId, id, baseRev: naEkranie.rev, title: 'Wizyta', body: 'Baza. Zalecenia kontrolne.',
    });
    expect(wynik.conflict, 'dopisek z telefonu nie może zginąć po cichu').toBe(true);
    expect(wynik.current.body).toBe('Baza. Dawka 25 µg.');
    expect((await A.getPatientNote(id)).body).toBe('Baza. Dawka 25 µg.');
  });
});
