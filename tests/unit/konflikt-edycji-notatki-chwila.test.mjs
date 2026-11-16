import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// E3-PR0b2a — konflikt zapisu notatki pacjenta po chwili zapisu wersji pokazanej lekarzowi.
//
// Scalanie przy równym numerze wersji (rev) przyjmuje późniejszą wersję z innego urządzenia:
// treść i updatedAtISO się zmieniają, rev zostaje ten sam. Sprawdzenie po samym numerze
// („baseRev starszy niż rev w sejfie”) tego nie widzi — edytor otwarty na starej treści,
// wykonanie przypomnienia i zmiana albo usunięcie wyniku Klirensu przechodziły bez konfliktu
// i nadpisywały późniejszą zmianę z drugiego urządzenia (dawkę, termin, komentarz).
//
// Wołający, który zna wersję pokazaną lekarzowi, podaje teraz także baseUpdatedAtISO — chwilę
// zapisu tej wersji. Gdy pole jest niepustym napisem, o konflikcie decyduje tylko ono; bez niego
// (Terminarz, moduły terapii, starsze wywołania) zostaje dawna umowa po rev. Reguła scalania
// się nie zmienia. Uzasadnienie i skutki: docs/clinical/ALGORITHMS.md (E3-PR0b2a).
//
// Dane fikcyjne. Prawdziwy vilda_crypto.js + vilda_vault.js na adapterze pamięciowym, dwa
// urządzenia; podstawiony zegar Date, żeby chwile zapisu były rozróżnialne i powtarzalne.

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

function urzadzenie(pliki) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  for (const plik of pliki) loadBrowserScript(plik, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  return { win, vault, adapter };
}

let licznik = 0;
async function sejf(pliki = ['vilda_crypto.js', 'vilda_vault.js'], opcje = {}) {
  licznik += 1;
  const d = urzadzenie(pliki);
  await d.vault.createUser(`Fikcyjne#Chwila!${licznik}`, { label: `Fikcyjny sejf chwili zapisu ${licznik}`, iterations: 10000, ...opcje });
  d.uid = d.vault.getCurrentUser().userId;
  return d;
}

let teraz = Date.parse('2026-11-16T08:00:00.000Z');
const krok = (ms = 60e3) => { teraz += ms; vi.setSystemTime(teraz); };
const kopia = (x) => JSON.parse(JSON.stringify(x));
const operacja = () => `fikcyjna-op-chwila-${++licznik}`;

async function wyslij(zrodlo, cel) {
  const ladunek = kopia(await zrodlo.vault.exportSyncPayload());
  krok(1000);
  return cel.vault.mergeSyncPayload(ladunek);
}

// Kopia notatki, w której zmienił się sam numer wersji: ta sama treść i ta sama chwila zapisu,
// rev o jeden wyższy. Scalenie ją przyjmuje (wyższy rev wygrywa), a lekarz ma na ekranie tę samą treść.
async function samNumerWersji(zrodlo, cel, id) {
  const ladunek = kopia(await zrodlo.vault.exportSyncPayload());
  ladunek.patientNotes = ladunek.patientNotes.map((n) => (n.id === id ? { ...n, rev: (n.rev || 0) + 1 } : n));
  krok(1000);
  await cel.vault.mergeSyncPayload(ladunek);
}

afterEach(() => { vi.useRealTimers(); });

async function dwaUrzadzenia(notatka = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(teraz);
  const A = await sejf(), B = await sejf();
  const p = await A.vault.savePatient({ name: 'Fikcyjna Pacjentka Chwila', user: { sex: 'F', age: 9, height: 130, weight: 28 } });
  krok();
  const { id } = await A.vault.savePatientNote({ patientId: p.patientId, title: 'Wizyta', body: 'Baza.', category: 'observation', ...notatka });
  krok();
  await wyslij(A, B);
  return { A, B, patientId: p.patientId, id };
}

// A zapisuje wersję, którą lekarz ma na ekranie; B pięć sekund później swoją. Obie mają ten sam rev.
// Scalenie B → A przyjmuje późniejszą wersję B: rev bez zmian, treść i chwila zapisu z B.
async function pozniejszaZmianaPrzyRownymRev(s, zmianaA, zmianaB) {
  krok();
  await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, ...zmianaA });
  const naEkranie = await s.A.vault.getPatientNote(s.id);
  krok(5000);
  await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, ...zmianaB });
  await wyslij(s.B, s.A);
  const poScaleniu = await s.A.vault.getPatientNote(s.id);
  expect(poScaleniu.rev, 'scalenie nie zmienia numeru wersji').toBe(naEkranie.rev);
  expect(poScaleniu.updatedAtISO > naEkranie.updatedAtISO, 'scalenie przyjęło późniejszą wersję z B').toBe(true);
  krok();
  return { naEkranie, poScaleniu };
}

describe('E3-PR0b2a — edytor notatki: konflikt po chwili zapisu wersji na ekranie', () => {
  it('scalenie przy równym rev przyniosło późniejszą treść: zapis z edytora otwartego na starej wersji zatrzymuje się', async () => {
    const s = await dwaUrzadzenia();
    const { naEkranie } = await pozniejszaZmianaPrzyRownymRev(s,
      { title: 'Wizyta', body: 'Wersja z tego urządzenia.' },
      { title: 'Wizyta', body: 'Dawka 75 od jutra (drugie urządzenie).' });

    const wynik = await s.A.vault.savePatientNote({
      patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Moja treść na starej wersji.',
      baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
    });

    expect(wynik.conflict, 'późniejsza zmiana z drugiego urządzenia nie może zginąć po cichu').toBe(true);
    expect(wynik.rev).toBe(naEkranie.rev);
    expect(wynik.current.body, 'konflikt niesie wersję, którą lekarz może wczytać')
      .toBe('Dawka 75 od jutra (drugie urządzenie).');
    expect((await s.A.vault.getPatientNote(s.id)).body, 'nic się nie zapisało')
      .toBe('Dawka 75 od jutra (drugie urządzenie).');
  });

  it('ta sama chwila zapisu przy wyższym rev (zmienił się sam numer wersji) nie jest konfliktem', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.A.vault.getPatientNote(s.id);
    await samNumerWersji(s.B, s.A, s.id);
    const po = await s.A.vault.getPatientNote(s.id);
    expect(po.rev).toBe(naEkranie.rev + 1);
    expect(po.updatedAtISO).toBe(naEkranie.updatedAtISO);
    expect(po.body).toBe(naEkranie.body);
    krok();

    const wynik = await s.A.vault.savePatientNote({
      patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Baza. Dopisek do tej samej treści.',
      baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
    });

    expect(wynik.conflict, 'na ekranie jest ta sama wersja, którą ma sejf — zmienił się tylko numer').toBeUndefined();
    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec.body).toBe('Baza. Dopisek do tej samej treści.');
    expect(koniec.rev).toBe(naEkranie.rev + 2);
  });

  it('„Nadpisz moją wersją”: podniesienie samego rev nie wystarcza, podniesienie rev i chwili z current zapisuje', async () => {
    const s = await dwaUrzadzenia();
    const { naEkranie, poScaleniu } = await pozniejszaZmianaPrzyRownymRev(s,
      { title: 'Wizyta', body: 'Wersja z tego urządzenia.' },
      { title: 'Wizyta', body: 'Późniejsza wersja z drugiego urządzenia.' });
    const tresc = { patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Moja treść.' };

    const konflikt = await s.A.vault.savePatientNote({ ...tresc, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO });
    expect(konflikt.conflict).toBe(true);
    expect(konflikt.current.updatedAtISO, 'current niesie chwilę zapisu wersji z sejfu').toBe(poScaleniu.updatedAtISO);

    const samRev = await s.A.vault.savePatientNote({ ...tresc, baseRev: konflikt.rev, baseUpdatedAtISO: naEkranie.updatedAtISO });
    expect(samRev.conflict, 'stara chwila zapisu dalej wskazuje inną wersję niż w sejfie').toBe(true);
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Późniejsza wersja z drugiego urządzenia.');

    const oba = await s.A.vault.savePatientNote({ ...tresc, baseRev: konflikt.rev, baseUpdatedAtISO: konflikt.current.updatedAtISO });
    expect(oba.conflict, 'świadomy wybór lekarza zapisuje jego tekst').toBeUndefined();
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Moja treść.');
  });

  it('bez baseUpdatedAtISO zostaje dawna umowa po rev: równy rev po scaleniu zapisuje, starszy baseRev daje konflikt', async () => {
    const s = await dwaUrzadzenia();
    const { naEkranie } = await pozniejszaZmianaPrzyRownymRev(s,
      { title: 'Wizyta', body: 'Wersja z tego urządzenia.' },
      { title: 'Wizyta', body: 'Późniejsza wersja z drugiego urządzenia.' });

    // Tak wołają Terminarz, moduły terapii i starsze wywołania: tylko baseRev albo nic.
    const rowny = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Zapis bez chwili.', baseRev: naEkranie.rev });
    expect(rowny.conflict).toBeUndefined();
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Zapis bez chwili.');

    const starszy = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Zapis na starszym numerze.', baseRev: naEkranie.rev });
    expect(starszy.conflict, 'starszy baseRev nadal zatrzymuje zapis').toBe(true);
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Zapis bez chwili.');
  });

  it.each([
    ['pusty napis', ''],
    ['null', null],
    ['liczba', Date.parse('2026-11-16T08:01:00.000Z')],
  ])('baseUpdatedAtISO jako %s działa jak brak pola (decyduje rev)', async (_opis, wartosc) => {
    const s = await dwaUrzadzenia();
    const przed = await s.A.vault.getPatientNote(s.id);
    krok();
    const zgodny = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Zwykła edycja.', baseRev: przed.rev, baseUpdatedAtISO: wartosc });
    expect(zgodny.conflict, 'zgodny rev zapisuje — wartość nie udaje podanej chwili').toBeUndefined();
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Zwykła edycja.');

    krok();
    const starszy = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Druga edycja na starej wersji.', baseRev: przed.rev, baseUpdatedAtISO: wartosc });
    expect(starszy.conflict, 'starszy rev nadal daje konflikt').toBe(true);
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Zwykła edycja.');
  });

  it('nowa notatka i wskrzeszenie notatki usuniętej na innym urządzeniu z baseUpdatedAtISO nie są konfliktem', async () => {
    const s = await dwaUrzadzenia();
    const nowa = await s.A.vault.savePatientNote({ patientId: s.patientId, baseRev: 7, baseUpdatedAtISO: '2026-01-01T00:00:00.000Z', title: 'Nowa', body: 'Treść.' });
    expect(nowa.conflict).toBeUndefined();
    expect(nowa.isNew).toBe(true);

    const naEkranie = await s.A.vault.getPatientNote(s.id);
    krok();
    await s.B.vault.removePatientNote(s.id);
    await wyslij(s.B, s.A);
    expect(await s.A.vault.getPatientNote(s.id)).toBeNull();
    krok();
    const wskrzeszona = await s.A.vault.savePatientNote({
      patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'Baza.', baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
    });
    expect(wskrzeszona.conflict, 'wskrzeszenie idzie dawną ścieżką, nie konfliktem').toBeUndefined();
    expect(wskrzeszona.isNew).toBe(true);
  });
});

describe('E3-PR0b2a — wykonanie przypomnienia: konflikt po chwili zapisu wiersza', () => {
  const przypomnienie = { category: 'followup', title: 'Fikcyjna kontrola', dueDateISO: '2026-11-20' };

  it('„przełóż” z widoku sprzed scalenia nie nadpisuje terminu ustawionego na drugim urządzeniu przy równym rev', async () => {
    const s = await dwaUrzadzenia(przypomnienie);
    const { naEkranie } = await pozniejszaZmianaPrzyRownymRev(s,
      { body: 'Ustalenia z tego urządzenia.' },
      { body: 'Przełożone na drugim urządzeniu: nie wykonywać przed wynikiem.', dueDateISO: '2026-12-10' });
    const ileNotatek = (await s.A.vault.listPatientNotesForPatient(s.patientId)).length;

    const wynik = await s.A.vault.saveReminderOutcome({
      id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
      operationId: operacja(), action: 'reschedule', dateISO: '2026-11-25', text: '',
    });

    expect(wynik).toMatchObject({ saved: false, conflict: true, reason: 'conflict' });
    expect(wynik.current.dueDateISO).toContain('2026-12-10');
    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec.dueDateISO, 'termin z drugiego urządzenia zostaje').toContain('2026-12-10');
    expect(koniec.body).toBe('Przełożone na drugim urządzeniu: nie wykonywać przed wynikiem.');
    expect(await s.A.vault.listPatientNotesForPatient(s.patientId)).toHaveLength(ileNotatek);
  });

  it('„wykonane” z kolejnym krokiem z widoku sprzed scalenia: konflikt, sprawa otwarta, bez kolejnego kroku', async () => {
    const s = await dwaUrzadzenia(przypomnienie);
    const { naEkranie } = await pozniejszaZmianaPrzyRownymRev(s,
      { body: 'Ustalenia z tego urządzenia.' },
      { body: 'Drugie urządzenie: najpierw kontrola dawki 75.' });
    const ileNotatek = (await s.A.vault.listPatientNotesForPatient(s.patientId)).length;

    const wynik = await s.A.vault.saveReminderOutcome({
      id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
      operationId: operacja(), action: 'complete', dateISO: '2026-11-16', text: 'Wykonano z widoku sprzed scalenia.',
      next: { title: 'Fikcyjna kolejna kontrola', dateISO: '2026-12-20' },
    });

    expect(wynik).toMatchObject({ saved: false, conflict: true, reason: 'conflict' });
    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec.completedAtISO, 'sprawa zostaje otwarta').toBeNull();
    expect(koniec.body).toBe('Drugie urządzenie: najpierw kontrola dawki 75.');
    const notatki = await s.A.vault.listPatientNotesForPatient(s.patientId);
    expect(notatki).toHaveLength(ileNotatek);
    expect(notatki.some((n) => n.id.indexOf('rem-next-') === 0), 'bez kolejnego kroku').toBe(false);
  });

  it('ta sama chwila zapisu przy wyższym rev zapisuje wykonanie (transakcja sprawdza rev świeżo odczytany pod blokadą)', async () => {
    const s = await dwaUrzadzenia(przypomnienie);
    const naEkranie = await s.A.vault.getPatientNote(s.id);
    await samNumerWersji(s.B, s.A, s.id);
    krok();

    const wynik = await s.A.vault.saveReminderOutcome({
      id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
      operationId: operacja(), action: 'complete', dateISO: '2026-11-16', text: 'Wykonano.',
      next: { title: 'Fikcyjna kolejna kontrola', dateISO: '2026-12-20' },
    });

    expect(wynik).toMatchObject({ saved: true, id: s.id });
    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec.completedAtISO).toBeTruthy();
    expect(koniec.rev).toBe(naEkranie.rev + 2);
    expect(await s.A.vault.getPatientNote(wynik.nextId)).toMatchObject({ title: 'Fikcyjna kolejna kontrola', completedAtISO: null });
  });

  it('z podaną chwilą zapisu rev podbity w trakcie transakcji nadal daje konflikt', async () => {
    const s = await dwaUrzadzenia(przypomnienie);
    const naEkranie = await s.A.vault.getPatientNote(s.id), commit = s.A.adapter.commitReminderForUser;
    s.A.adapter.commitReminderForUser = async (user, change) => {
      const zapisana = await s.A.adapter.getPatientNoteForUser(user, s.id);
      await s.A.adapter.putPatientNoteForUser(user, { ...zapisana, rev: zapisana.rev + 1 });
      return commit(user, change);
    };

    const wynik = await s.A.vault.saveReminderOutcome({
      id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
      operationId: operacja(), action: 'complete', dateISO: '2026-11-16', text: 'Wykonano.',
      next: { title: 'Fikcyjna kolejna kontrola', dateISO: '2026-12-20' },
    });

    expect(wynik).toMatchObject({ saved: false, conflict: true });
    expect((await s.A.vault.getPatientNote(s.id)).completedAtISO).toBeNull();
    expect(await s.A.vault.listPatientNotesForPatient(s.patientId)).toHaveLength(1);
  });

  it('termin z historii planu opieki (zapis przez commitCarePlanForUser): ta sama chwila przy wyższym rev zapisuje wykonanie', async () => {
    // Uprząż jak w tests/unit/care-plans-calendar-history.test.mjs: dwa urządzenia rezerwują ten sam krok
    // planu, po scaleniu jedna rezerwacja zostaje „bieżąca”, druga przechodzi do historii planu.
    const DZIEN = '2026-10-29';
    const pliki = ['vilda_crypto.js', 'vilda_vault.js', 'vilda_care_plans.js'];
    const nowe = async () => {
      const d = await sejf(pliki, { deferServerContact: true });
      d.patientId = (await d.vault.savePatient({ name: 'Fikcyjna Alicja Chwila', user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
      return d;
    };
    const zmien = (d, plan, action, extra = {}) => d.vault.mutateCarePlan({ planId: plan.id, patientId: plan.patientId, baseRev: plan.rev, operationId: operacja(), action, ...extra });
    const a = await nowe(), b = await nowe();
    let plan = (await a.vault.mutateCarePlan({ patientId: a.patientId, operationId: operacja(), action: 'create', title: 'Fikcyjny plan chwili zapisu' })).plan;
    plan = (await zmien(a, plan, 'addStep', { step: { title: 'Fikcyjna wspólna konsultacja', kind: 'Konsultacja', state: 'pending', description: 'Fikcyjny wspólny opis.', reminderDateISO: DZIEN } })).plan;
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const stepId = plan.steps[0].id, drugi = await b.vault.getCarePlan(plan.id);
    const pa = (await zmien(a, plan, 'editStep', { stepId, step: { ...plan.steps[0], eventDateISO: '2026-11-12', eventTime: '10:15', description: 'Fikcyjna gałąź A.' } })).plan;
    const pb = (await zmien(b, drugi, 'editStep', { stepId, step: { ...drugi.steps[0], eventDateISO: '2026-11-13', eventTime: '14:45', description: 'Fikcyjna gałąź B.' } })).plan;
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    plan = (await zmien(a, await a.vault.getCarePlan(plan.id), 'acknowledgeMerge')).plan;
    const biezacy = plan.steps[0].calendarNoteId;
    const historyczny = [pa.steps[0].calendarNoteId, pb.steps[0].calendarNoteId].find((id) => id !== biezacy);
    const rodzic = await a.vault.getPatientNote(plan.id);
    expect(a.vault.getCarePlanCalendarRelation(rodzic.careContext, rodzic.title, historyczny, stepId)).toBe('historical');

    const naEkranie = await a.vault.getPatientNote(historyczny);
    const zapisana = await a.adapter.getPatientNoteForUser(a.uid, historyczny);
    await a.adapter.putPatientNoteForUser(a.uid, { ...zapisana, rev: zapisana.rev + 1 });

    const wynik = await a.vault.saveReminderOutcome({
      id: historyczny, patientId: plan.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
      operationId: operacja(), action: 'complete', dateISO: DZIEN, text: 'Fikcyjne wykonanie terminu z historii planu.',
    });

    expect(wynik).toMatchObject({ saved: true, id: historyczny });
    expect((await a.vault.getPatientNote(historyczny)).completedAtISO).toBeTruthy();
  });
});

describe('E3-PR0b2a — wynik Klirensu: zmiana i usunięcie po chwili zapisu wersji w szczegółach', () => {
  const pomiar = {
    category: 'wynik-klirens', title: 'Fikcyjny ACR', clinicalDateISO: '2026-10-25', body: 'Fikcyjna ocena.',
    labResult: { test: 'Fikcyjny ACR', value: '45', valueNum: 45, unit: 'mg/g' },
  };
  const edycja = (s, naEkranie, zmiany = {}) => ({
    id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
    category: 'wynik-klirens', title: 'Fikcyjny ACR', clinicalDateISO: '2026-10-24', body: 'Fikcyjna nowa ocena.',
    labResult: { test: 'Fikcyjny ACR', value: '13,6', valueNum: 13.6, unit: 'mg/g' },
    ...zmiany,
  });
  const nagrobki = async (d) => (await d.adapter.listPatientNoteTombstonesForUser(d.uid)).map((n) => n.id);

  it('zmiana z widoku sprzed scalenia przy równym rev: konflikt, zostaje późniejszy komentarz z drugiego urządzenia', async () => {
    const s = await dwaUrzadzenia(pomiar);
    const { naEkranie } = await pozniejszaZmianaPrzyRownymRev(s,
      { body: 'Komentarz z tego urządzenia.' },
      { body: 'Późniejszy komentarz z drugiego urządzenia.' });

    const wynik = await s.A.vault.updateExistingPatientNote(edycja(s, naEkranie));

    expect(wynik).toMatchObject({ id: s.id, updated: false, reason: 'conflict', conflict: true, rev: naEkranie.rev });
    expect(wynik.current.body).toBe('Późniejszy komentarz z drugiego urządzenia.');
    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec.body).toBe('Późniejszy komentarz z drugiego urządzenia.');
    expect(koniec.labResult.valueNum).toBe(45);
  });

  it('usunięcie z widoku sprzed scalenia przy równym rev: konflikt, pomiar zostaje, bez nagrobka', async () => {
    const s = await dwaUrzadzenia(pomiar);
    const { naEkranie } = await pozniejszaZmianaPrzyRownymRev(s,
      { body: 'Komentarz z tego urządzenia.' },
      { body: 'Późniejszy komentarz z drugiego urządzenia.' });

    const wynik = await s.A.vault.removeExistingPatientNote({ id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO });

    expect(wynik).toMatchObject({ id: s.id, removed: false, reason: 'conflict', conflict: true, rev: naEkranie.rev });
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('Późniejszy komentarz z drugiego urządzenia.');
    expect(await nagrobki(s.A)).not.toContain(s.id);
  });

  it.each(['zmiana', 'usunięcie'])('ta sama chwila zapisu przy wyższym rev: %s przechodzi', async (rodzaj) => {
    const s = await dwaUrzadzenia(pomiar);
    const naEkranie = await s.A.vault.getPatientNote(s.id);
    await samNumerWersji(s.B, s.A, s.id);
    expect((await s.A.vault.getPatientNote(s.id)).rev).toBe(naEkranie.rev + 1);
    krok();

    if (rodzaj === 'zmiana') {
      expect(await s.A.vault.updateExistingPatientNote(edycja(s, naEkranie))).toMatchObject({ id: s.id, updated: true });
      const koniec = await s.A.vault.getPatientNote(s.id);
      expect(koniec).toMatchObject({ body: 'Fikcyjna nowa ocena.', clinicalDateISO: '2026-10-24', rev: naEkranie.rev + 2 });
      expect(koniec.labResult.valueNum).toBe(13.6);
    } else {
      expect(await s.A.vault.removeExistingPatientNote({ id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO }))
        .toEqual({ id: s.id, removed: true });
      expect(await s.A.vault.getPatientNote(s.id)).toBeNull();
      expect(await nagrobki(s.A)).toContain(s.id);
    }
  });

  it.each([0, 2])('bez baseUpdatedAtISO decyduje dokładny rev: baseRev=%s przy rev 1 to konflikt zmiany i usunięcia', async (baseRev) => {
    const s = await dwaUrzadzenia(pomiar);
    const przed = await s.A.vault.getPatientNote(s.id);
    expect(przed.rev).toBe(1);
    const { baseUpdatedAtISO: _pominiete, ...bezChwili } = edycja(s, przed, { baseRev });

    expect(await s.A.vault.updateExistingPatientNote(bezChwili)).toMatchObject({ updated: false, reason: 'conflict', rev: 1 });
    expect(await s.A.vault.removeExistingPatientNote({ id: s.id, patientId: s.patientId, baseRev })).toMatchObject({ removed: false, reason: 'conflict', rev: 1 });
    expect(await s.A.vault.getPatientNote(s.id)).toMatchObject({ rev: 1, body: 'Fikcyjna ocena.' });
  });
});
