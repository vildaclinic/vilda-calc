import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Testy strażnicze po audycie Terminarza (2026-09-02) — znaleziska D9, I1, I2.
// Ładują PRAWDZIWE pliki repo (vilda_crypto.js + vilda_vault.js) z adapterem in-memory,
// dokładnie tak jak skrypty reprodukcji z audytu (repro_obalacz48_rmw.js,
// repro_stale_quickaction_2dev.js, repro37_wlsched_2dev.js). Każde „urządzenie” to
// osobna instancja IIFE vaulta z własnym obiektem okna i własnym użytkownikiem;
// synchronizacja między urządzeniami idzie tą samą parą funkcji, której używa
// vilda_sync: exportSyncPayload -> mergeSyncPayload.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; }
  };
}

// Jedno „urządzenie”: osobny obiekt okna (guard IIFE `v.VildaVault.__vildaVault`
// blokuje drugie załadowanie do tego samego obiektu), własny adapter in-memory.
function loadDevice() {
  const win = {
    // vilda_crypto.js bierze te globale z przekazanego obiektu okna (loadBrowserScript
    // przesłania `globalThis`), więc trzeba je jawnie przekazać
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false }
  };
  win.window = win;
  win.self = win;
  win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  if (!vault || typeof vault.savePatientNote !== 'function') {
    throw new Error('vilda_vault.js nie załadował się do obiektu okna testowego');
  }
  const adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  return { vault, adapter };
}

let deviceCounter = 0;
async function createDevice(label) {
  const dev = loadDevice();
  deviceCounter += 1;
  await dev.vault.createUser(`Audyt#Terminarz2026!${label}${deviceCounter}`, { label, iterations: 10000 });
  if (!dev.vault.isUnlocked()) throw new Error(`vault (${label}) nie został odblokowany`);
  return dev;
}

async function syncTo(target, source) {
  return target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
}

// Wierna replika Ce() z terminarza (terminarz_pretty.js 398-407): pełny payload
// z kopii trzymanej w UI — używana dziś przez modal edycji / drag / kopiowanie.
function Ce(t) {
  return {
    id: t.id,
    patientId: t.patientId,
    title: t.title || '',
    body: t.body || '',
    category: t.category,
    dueDateISO: t.dueDateISO || null
  };
}

// Payload intencyjny szybkich akcji po naprawie I1 (terminarz: Ab(t)={id,patientId}
// + pola statusu) — vault ma zachować resztę pól z magazynu.
function statusPayloadDone(t) {
  return { id: t.id, patientId: t.patientId, completedAtISO: new Date().toISOString(), noShowAtISO: null };
}

const day = (n) => (n && n.dueDateISO ? String(n.dueDateISO).slice(0, 10) : null);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('VildaVault.savePatientNote — serializacja równoległych zapisów (D9, audyt Terminarza 2026-09-02)', () => {
  let dev;
  beforeAll(async () => {
    dev = await createDevice('D9');
  });

  it('równoległe zapisy tej samej notatki („✓ Wykonane” + drag godziny) zachowują oba pola, a rev rośnie do 3', async () => {
    // Źródło: OBALACZ #48 / D9 — savePatientNote było nieatomowym read-modify-write:
    // Promise.all dwóch zapisów tej samej notatki gubiło pola (10/10 prób
    // completedAtISO=null, oba rev=2). Po naprawie (kolejka per id) nic nie ginie.
    const { vault } = dev;
    const pid = 'pat-d9';
    for (let proba = 0; proba < 5; proba += 1) {
      const created = await vault.savePatientNote({
        patientId: pid,
        title: 'Kontrola',
        body: '',
        category: 'followup',
        dueDateISO: '2026-09-07',
        dueTime: '09:00'
      });
      const noteMem = { id: created.id, patientId: pid, title: 'Kontrola', body: '', category: 'followup', dueDateISO: '2026-09-07' };

      // A: '✓ Wykonane' (replika ai() sprzed naprawy — pełne Ce + status)
      const a = Ce(noteMem);
      a.completedAtISO = new Date().toISOString();
      a.noShowAtISO = null;
      // B: drag na inną godzinę (replika mr() — pełne Ce + dueTime)
      const b = Ce(noteMem);
      b.dueTime = '10:30';

      await Promise.all([vault.savePatientNote(a), vault.savePatientNote(b)]);

      const po = await vault.getPatientNote(created.id);
      expect(po, `próba ${proba}: notatka istnieje`).toBeTruthy();
      expect(po.completedAtISO, `próba ${proba}: completedAtISO zachowane`).toBeTruthy();
      expect(po.dueTime, `próba ${proba}: dueTime zachowane`).toBe('10:30');
      expect(po.rev, `próba ${proba}: rev = 1 (utworzenie) + 2 zapisy`).toBe(3);
      await vault.removePatientNote(created.id);
    }
  });
});

describe('VildaVault — merge terminów list oczekujących per lista (I2, audyt Terminarza 2026-09-02)', () => {
  let A;
  let B;
  beforeAll(async () => {
    A = await createDevice('I2A');
    B = await createDevice('I2B');
  });

  it('termin BACC z urządzenia A i termin OGTT z urządzenia B przeżywają dwustronny sync', async () => {
    // Źródło: I2 — wszystkie terminy list w JEDNYM wpisie userPreferences.wlsched,
    // a mergeSyncPayload robił LWW całym stringiem per klucz preferencji: termin
    // ustawiony na A znikał po syncu z B, które ustawiło inny termin
    // (repro37_wlsched_2dev.js). Po naprawie merge idzie per wpis (lista).
    await A.vault.addWaitlistList('BACC');
    await A.vault.setWaitlistSchedule('BACC', { dateISO: '2026-09-15', time: '08:00', durationMin: 60 });
    await sleep(3);
    await B.vault.addWaitlistList('OGTT');
    await B.vault.setWaitlistSchedule('OGTT', { dateISO: '2026-09-16', time: '09:30' });

    await syncTo(A, B);
    await syncTo(B, A);

    const schedA = await A.vault.getWaitlistSchedules();
    const schedB = await B.vault.getWaitlistSchedules();
    const listsA = await A.vault.getWaitlistLists();
    const listsB = await B.vault.getWaitlistLists();

    expect(schedA.bacc && schedA.bacc.dateISO, 'A: termin BACC przetrwał').toBe('2026-09-15');
    expect(schedA.ogtt && schedA.ogtt.dateISO, 'A: termin OGTT dotarł z B').toBe('2026-09-16');
    expect(schedB.bacc && schedB.bacc.dateISO, 'B: termin BACC dotarł z A').toBe('2026-09-15');
    expect(schedB.bacc && schedB.bacc.durationMin, 'B: durationMin BACC zachowany').toBe(60);
    expect(schedB.ogtt && schedB.ogtt.dateISO, 'B: termin OGTT przetrwał').toBe('2026-09-16');
    expect(Object.keys(listsA).sort()).toEqual(['bacc', 'ogtt']);
    expect(Object.keys(listsB).sort()).toEqual(['bacc', 'ogtt']);

    // ponowny merge tego samego payloadu jest idempotentny (brak zbędnego zapisu)
    const again = await syncTo(B, A);
    expect(again.updatedPreferenceCount, 'ponowny merge nie zmienia preferencji').toBe(0);
  });

  it('usunięcie listy na A propaguje się na B (tombstone), a ponowne dodanie listy nie wskrzesza starego terminu', async () => {
    // Źródło: I2 + I6 — removeWaitlistList robił zwykłe delete z mapy (bez tombstonu)
    // i nie sprzątał terminu listy w wlsched; merge LWW całą mapą wskrzeszał usuniętą
    // listę, gdy drugie urządzenie zapisało później cokolwiek innego. Po naprawie:
    // tombstone {deleted:true,updatedAtISO} w wllists i wlsched, merge per wpis.
    // Test ma własne urządzenia (niezależny od poprzedniego).
    const A2 = await createDevice('I2A2');
    const B2 = await createDevice('I2B2');
    await A2.vault.addWaitlistList('BACC');
    await A2.vault.setWaitlistSchedule('BACC', { dateISO: '2026-09-15', time: '08:00' });
    await syncTo(B2, A2);
    expect((await B2.vault.getWaitlistSchedules()).bacc.dateISO, 'B2: BACC dotarło przed usunięciem').toBe('2026-09-15');

    // A2 usuwa listę
    await sleep(3);
    await A2.vault.removeWaitlistList('BACC');
    const listsAfterA = await A2.vault.getWaitlistLists();
    const schedAfterA = await A2.vault.getWaitlistSchedules();
    expect(listsAfterA.bacc, 'A2: lista BACC usunięta').toBeUndefined();
    expect(schedAfterA.bacc, 'A2: termin BACC sprzątnięty razem z listą (I6)').toBeUndefined();

    // B2, nie widząc jeszcze usunięcia, zmienia INNĄ listę (jego mapa ma nowszy znacznik)
    await sleep(3);
    await B2.vault.addWaitlistList('OGTT');
    await B2.vault.setWaitlistSchedule('OGTT', { dateISO: '2026-09-16', time: '09:30' });

    // sync B2 -> A2: stary LWW całą mapą wskrzesiłby BACC na A2; tombstone ma wygrać
    await syncTo(A2, B2);
    const listsA = await A2.vault.getWaitlistLists();
    const schedA = await A2.vault.getWaitlistSchedules();
    expect(listsA.bacc, 'A2: usunięta lista nie wskrzeszona przez nowszą mapę z B2').toBeUndefined();
    expect(schedA.bacc, 'A2: termin usuniętej listy nie wskrzeszony').toBeUndefined();
    expect(schedA.ogtt && schedA.ogtt.dateISO, 'A2: termin OGTT dotarł z B2').toBe('2026-09-16');

    // sync A2 -> B2: usunięcie propaguje się na B2
    await syncTo(B2, A2);
    const listsB = await B2.vault.getWaitlistLists();
    const schedB = await B2.vault.getWaitlistSchedules();
    expect(listsB.bacc, 'B2: usunięcie listy dotarło z A2').toBeUndefined();
    expect(schedB.bacc, 'B2: termin usuniętej listy zniknął').toBeUndefined();
    expect(schedB.ogtt && schedB.ogtt.dateISO, 'B2: termin OGTT nietknięty').toBe('2026-09-16');

    // ponowne dodanie listy o tej samej nazwie: lista wraca, stary termin NIE
    await sleep(3);
    await A2.vault.addWaitlistList('BACC');
    const listsReA = await A2.vault.getWaitlistLists();
    const schedReA = await A2.vault.getWaitlistSchedules();
    expect(listsReA.bacc && listsReA.bacc.label, 'A2: lista BACC odtworzona').toBe('BACC');
    expect(schedReA.bacc, 'A2: stary termin BACC nie wskrzeszony').toBeUndefined();

    await syncTo(B2, A2);
    const listsReB = await B2.vault.getWaitlistLists();
    const schedReB = await B2.vault.getWaitlistSchedules();
    expect(listsReB.bacc && listsReB.bacc.label, 'B2: odtworzona lista dotarła').toBe('BACC');
    expect(schedReB.bacc, 'B2: stary termin BACC nie wskrzeszony po syncu').toBeUndefined();
  });

  it('dane zastane w starym formacie wlsched/wllists (bez znaczników per wpis) są czytane i mergowane bez wyjątku', async () => {
    // Źródło: I2 — kompatybilność wsteczna: przed naprawą wpisy w wlsched/wllists nie
    // miały własnego updatedAtISO (znacznik tylko na całej mapie). Nowy kod ma je
    // czytać (dziedziczenie znacznika mapy) i scalać per wpis z payloadem w starym formacie.
    const C = await createDevice('I2C');
    const D = await createDevice('I2D');
    const userId = C.vault.getCurrentUser().userId;
    const T1 = '2026-08-01T10:00:00.000Z';
    const T2 = '2026-08-02T10:00:00.000Z';

    // stary format zapisany bezpośrednio w magazynie urządzenia C
    const meta = (await C.adapter.getUserMeta(userId)) || {};
    const prefs = Object.assign({}, meta.userPreferences || {});
    prefs.wlsched = { value: JSON.stringify({ bacc: { dateISO: '2026-09-20', time: '08:00', label: 'BACC' } }), updatedAtISO: T1 };
    prefs.wllists = { value: JSON.stringify({ bacc: { label: 'BACC', createdAtISO: T1 } }), updatedAtISO: T1 };
    await C.adapter.putUserMeta(userId, Object.assign({}, meta, { userPreferences: prefs }));

    const schedLegacy = await C.vault.getWaitlistSchedules();
    const listsLegacy = await C.vault.getWaitlistLists();
    expect(schedLegacy.bacc && schedLegacy.bacc.dateISO, 'stary wpis wlsched czytany').toBe('2026-09-20');
    expect(listsLegacy.bacc && listsLegacy.bacc.label, 'stary wpis wllists czytany').toBe('BACC');

    // payload syncu ze „starego” klienta (mapa bez znaczników per wpis, nowszy znacznik mapy)
    const payload = await D.vault.exportSyncPayload();
    payload.userPreferences = Object.assign({}, payload.userPreferences, {
      wlsched: { value: JSON.stringify({ ogtt: { dateISO: '2026-09-21', time: '09:00', label: 'OGTT' } }), updatedAtISO: T2 },
      wllists: { value: JSON.stringify({ ogtt: { label: 'OGTT', createdAtISO: T2 } }), updatedAtISO: T2 }
    });
    let result;
    await expect((async () => { result = await C.vault.mergeSyncPayload(payload); })()).resolves.toBeUndefined();
    expect(result && result.updatedPreferenceCount, 'merge zaktualizował wlsched i wllists').toBe(2);

    const schedMerged = await C.vault.getWaitlistSchedules();
    const listsMerged = await C.vault.getWaitlistLists();
    // stary klient robił LWW całym stringiem — wpis bacc by przepadł; teraz oba istnieją
    expect(schedMerged.bacc && schedMerged.bacc.dateISO, 'lokalny stary wpis BACC przetrwał merge').toBe('2026-09-20');
    expect(schedMerged.ogtt && schedMerged.ogtt.dateISO, 'wpis OGTT ze starego payloadu dotarł').toBe('2026-09-21');
    expect(Object.keys(listsMerged).sort()).toEqual(['bacc', 'ogtt']);

    // po merge normalne zapisy nadal działają i nie gubią wpisów
    await C.vault.setWaitlistSchedule('BACC', { dateISO: '2026-09-22', time: '08:30' });
    const schedFinal = await C.vault.getWaitlistSchedules();
    expect(schedFinal.bacc.dateISO).toBe('2026-09-22');
    expect(schedFinal.ogtt.dateISO).toBe('2026-09-21');
  });
});

describe('VildaVault.savePatientNote — payload statusu nie cofa danych z synchronizacji (I1, audyt Terminarza 2026-09-02)', () => {
  it('„✓ Wykonane” z nieaktualnej kopii (tylko id+patientId+status) zachowuje datę przełożoną na B', async () => {
    // Źródło: I1 — szybkie akcje wysyłały pełne Ce(t) z obiektu trzymanego w UI
    // (repro_stale_quickaction_2dev.js): B przełożył wizytę, merge dotarł na A,
    // klik „Wykonane” na starej kopii cofał datę i wygrywał LWW po rev na obu
    // urządzeniach. Po naprawie terminarz wysyła payload intencyjny, a vault
    // (hasOwnProperty dla title/body/category/dueDateISO) zachowuje pola z magazynu.
    const A = await createDevice('I1A');
    const B = await createDevice('I1B');

    const created = await A.vault.savePatientNote({
      patientId: 'pat-jan-kowalski',
      title: 'Kontrola wzrostu',
      body: '',
      category: 'followup',
      dueDateISO: '2026-09-03',
      dueTime: '12:00'
    });
    const id = created.id;
    await syncTo(B, A);

    const a0 = await A.vault.getPatientNote(id);
    const b0 = await B.vault.getPatientNote(id);
    expect(day(a0)).toBe('2026-09-03');
    expect(day(b0)).toBe('2026-09-03');
    expect(b0.rev).toBe(1);

    // A: popover trzyma STARĄ kopię obiektu (sprzed merge)
    const staleCopy = Object.assign({}, a0);

    // B: przełożenie (drag/przełóż — pełne Ce + nowa data i godzina)
    const moved = Ce(b0);
    moved.dueDateISO = '2026-09-10';
    moved.dueTime = '09:30';
    await B.vault.savePatientNote(moved);
    const b1 = await B.vault.getPatientNote(id);
    expect(day(b1)).toBe('2026-09-10');
    expect(b1.rev).toBe(2);

    // sync B -> A (merge w tle na A)
    await syncTo(A, B);
    const a1 = await A.vault.getPatientNote(id);
    expect(day(a1), 'merge z B dotarł na A').toBe('2026-09-10');

    // A: klik „✓ Wykonane” na starej kopii — payload intencyjny
    await A.vault.savePatientNote(statusPayloadDone(staleCopy));
    const a2 = await A.vault.getPatientNote(id);
    expect(day(a2), 'A: data z B nie została cofnięta').toBe('2026-09-10');
    expect(a2.dueTime, 'A: godzina z B zachowana').toBe('09:30');
    expect(a2.title, 'A: tytuł zachowany z magazynu').toBe('Kontrola wzrostu');
    expect(a2.category, 'A: kategoria zachowana z magazynu').toBe('followup');
    expect(a2.completedAtISO, 'A: status wykonane ustawiony').toBeTruthy();
    expect(a2.rev).toBe(3);

    // sync A -> B: zapis rev 3 wygrywa LWW, ale niesie datę z B
    await syncTo(B, A);
    const b2 = await B.vault.getPatientNote(id);
    expect(day(b2), 'B: data przełożenia przetrwała').toBe('2026-09-10');
    expect(b2.dueTime).toBe('09:30');
    expect(b2.completedAtISO, 'B: status wykonane dotarł').toBeTruthy();
    expect(b2.rev).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------
// K1–K3 — krawędzie NIEDOMKNIĘTE przez PR #166–#169, wykryte w kontroli końcowej audytu
// Terminarza (2026-09-02) i naprawione w tym PR. Wszystkie scenariusze odtworzone ze skryptów
// pomiarowych kontroli (t_k1.mjs, t_k2.mjs, t_d9d.mjs, t_k3.mjs) na PRAWDZIWYCH plikach repo.

/**
 * Wstrzykuje akcję lokalną DOKŁADNIE w okno migawki mergeSyncPayload: pierwsze wywołanie
 * adapter.listPatientNotesForUser zrobione przez merge zwraca listę sprzed akcji, a akcja
 * kończy się, zanim merge zdąży cokolwiek zapisać. Zwraca funkcję zdejmującą hak.
 */
function wOknieMigawkiMerge(dev, akcja) {
  const adapter = dev.adapter;
  const oryginal = adapter.listPatientNotesForUser.bind(adapter);
  let uzbrojone = true;
  adapter.listPatientNotesForUser = async function (userId) {
    const migawka = await oryginal(userId);
    if (uzbrojone) {
      uzbrojone = false;
      await akcja();
    }
    return migawka;
  };
  return () => { adapter.listPatientNotesForUser = oryginal; };
}

const maTombstone = (payload, id) =>
  (payload.patientNoteTombstones || []).some((t) => t && t.id === id);

describe('VildaVault.removePatientNote — wspólna kolejka zapisów per notatka (K1, kontrola 2026-09-02)', () => {
  it('usunięcie wystartowane w trakcie zapisu tej samej notatki nie jest wskrzeszane, a tombstone zostaje w payloadzie synchronizacji', async () => {
    // Źródło: K1 (z D9) — kolejka serializująca obejmowała wyłącznie savePatientNote;
    // removePatientNote szło obok niej. Gdy zapis wystartował pierwszy, a usunięcie w trakcie,
    // read-modify-write zapisu WSKRZESZAŁ notatkę (10/10 prób) i kasował jej tombstone
    // (removePatientNoteTombstoneForUser), więc usunięcie znikało także z synchronizacji.
    const dev = await createDevice('K1');
    const pid = 'pat-k1';

    for (let proba = 0; proba < 4; proba += 1) {
      const created = await dev.vault.savePatientNote({
        patientId: pid,
        title: `Kontrola ${proba}`,
        body: 'x',
        category: 'followup',
        dueDateISO: '2026-09-07',
        dueTime: '09:00'
      });
      // zapis („✓ Wykonane”) startuje pierwszy, usunięcie (swipe/UNDO) w trakcie
      const zapis = dev.vault.savePatientNote({
        id: created.id,
        patientId: pid,
        completedAtISO: new Date().toISOString()
      });
      const usuniecie = dev.vault.removePatientNote(created.id);
      await Promise.allSettled([zapis, usuniecie]);

      expect(
        await dev.vault.getPatientNote(created.id),
        `próba ${proba}: równoległy zapis nie wskrzesza usuniętej notatki`
      ).toBeFalsy();
      expect(
        maTombstone(await dev.vault.exportSyncPayload(), created.id),
        `próba ${proba}: tombstone usunięcia jest w payloadzie synchronizacji`
      ).toBe(true);
    }

    // Kontrola pozytywna (odwrotna kolejność, działała już przed naprawą): usunięcie pierwsze,
    // zapis w trakcie — zapis ma zostać odrzucony, notatka pozostaje usunięta.
    for (let proba = 0; proba < 3; proba += 1) {
      const created = await dev.vault.savePatientNote({
        patientId: pid,
        title: `Odwrotna ${proba}`,
        body: '',
        category: 'followup',
        dueDateISO: '2026-09-07'
      });
      const usuniecie = dev.vault.removePatientNote(created.id);
      const zapis = dev.vault.savePatientNote({
        id: created.id,
        patientId: pid,
        completedAtISO: new Date().toISOString()
      });
      const wyniki = await Promise.allSettled([usuniecie, zapis]);
      expect(wyniki[1].status, `próba ${proba}: zapis po usunięciu odrzucony`).toBe('rejected');
      expect(String(wyniki[1].reason && wyniki[1].reason.message)).toMatch(/nie istnieje/);
      expect(await dev.vault.getPatientNote(created.id), `próba ${proba}: notatka pozostaje usunięta`).toBeFalsy();
    }

    // Kontrola pozytywna: równoległe zapisy PIĘCIU RÓŻNYCH notatek nie blokują się nawzajem.
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push((await dev.vault.savePatientNote({
        patientId: pid, title: `Rowna ${i}`, body: '', category: 'followup', dueDateISO: '2026-09-08'
      })).id);
    }
    await Promise.all(ids.map((id) => dev.vault.savePatientNote({ id, patientId: pid, dueTime: '11:45' })));
    for (const id of ids) {
      expect((await dev.vault.getPatientNote(id)).dueTime, 'różne notatki zapisane równolegle').toBe('11:45');
    }
  });
});

describe('VildaVault.mergeSyncPayload — sekcja krytyczna per notatka (K2, kontrola 2026-09-02)', () => {
  it('lokalny zapis wykonany w oknie migawki merge nie jest nadpisany starszą wersją zdalną', async () => {
    // Źródło: K2 (z D9/I1) — merge decydował o nadpisaniu na podstawie MIGAWKI zrobionej na
    // starcie fazy notatek, a pisał dziesiątki/setki ms później, prosto przez adapter, poza
    // kolejką. Lokalny zapis wstrzelony w to okno ginął bezgłośnie (zmierzone 10/10).
    // Po naprawie merge bierze blokadę per notatka i czyta rekord NA ŚWIEŻO w sekcji krytycznej.
    const A = await createDevice('K2A');
    const B = await createDevice('K2B');
    const pid = 'pat-k2';

    for (let proba = 0; proba < 3; proba += 1) {
      const created = await A.vault.savePatientNote({
        patientId: pid, title: `Wizyta ${proba}`, body: '', category: 'followup',
        dueDateISO: '2026-09-07', dueTime: '09:00'
      });
      await syncTo(B, A);
      await sleep(3);
      // B przekłada wizytę i wysyła payload
      await B.vault.savePatientNote({ id: created.id, patientId: pid, dueDateISO: '2026-09-10', dueTime: '11:00' });
      const payload = await B.vault.exportSyncPayload();
      await sleep(3);

      // A: „✓ Wykonane” wykonane DOKŁADNIE w oknie migawki merge
      const zdejmij = wOknieMigawkiMerge(A, () =>
        A.vault.savePatientNote({ id: created.id, patientId: pid, completedAtISO: new Date().toISOString() }));
      await A.vault.mergeSyncPayload(payload);
      zdejmij();

      const po = await A.vault.getPatientNote(created.id);
      expect(po, `próba ${proba}: notatka istnieje po merge`).toBeTruthy();
      expect(po.completedAtISO, `próba ${proba}: status „Wykonane” z okna migawki nie został zgubiony`).toBeTruthy();
    }

    // Kontrola pozytywna: merge BEZ wyścigu nadal przenosi zmiany i jest idempotentny.
    const spokojna = await A.vault.savePatientNote({
      patientId: pid, title: 'Spokojna', body: 'tresc', category: 'followup', dueDateISO: '2026-09-07', dueTime: '09:00'
    });
    await syncTo(B, A);
    await sleep(3);
    await B.vault.savePatientNote({ id: spokojna.id, patientId: pid, dueDateISO: '2026-09-12', dueTime: '13:15' });
    await syncTo(A, B);
    const poSpokojnej = await A.vault.getPatientNote(spokojna.id);
    expect(day(poSpokojnej), 'merge bez wyścigu przenosi datę').toBe('2026-09-12');
    expect(poSpokojnej.dueTime).toBe('13:15');
    expect(poSpokojnej.title, 'tytuł zachowany').toBe('Spokojna');
    expect(poSpokojnej.body, 'treść zachowana').toBe('tresc');
    const powtorka = await syncTo(A, B);
    expect(powtorka.updatedPatientNoteCount || 0, 'powtórzony merge nie zmienia notatek').toBe(0);
  });

  it('usunięcie przyniesione przez merge nie jest cofane przez równoległą szybką akcję i nie wraca na urządzenie, które kasowało', async () => {
    // Źródło: K2 — merge kasował notatki bezpośrednio przez adapter, poza kolejką: równoległe
    // „✓ Wykonane” wskrzeszało wizytę usuniętą na drugim urządzeniu (zmierzone 8/8) i wskrzeszenie
    // replikowało się z powrotem na WSZYSTKIE urządzenia. Reguła po naprawie: w oknie
    // współbieżności merge↔zapis wygrywa tombstone, deterministycznie i niezależnie od przeplotu.
    const A = await createDevice('K2C');
    const B = await createDevice('K2D');
    const pid = 'pat-k2b';

    for (let proba = 0; proba < 3; proba += 1) {
      const created = await A.vault.savePatientNote({
        patientId: pid, title: `Do usunięcia ${proba}`, body: '', category: 'followup', dueDateISO: '2026-09-07'
      });
      await syncTo(B, A);
      await sleep(3);
      await B.vault.removePatientNote(created.id); // usunięcie na drugim urządzeniu
      const payload = await B.vault.exportSyncPayload();

      // merge w tle na A + szybka akcja lekarza na tej samej wizycie (nieaktualny widok)
      const merge = A.vault.mergeSyncPayload(payload);
      const akcja = A.vault
        .savePatientNote({ id: created.id, patientId: pid, completedAtISO: new Date().toISOString() })
        .catch(() => null);
      await Promise.all([merge, akcja]);

      expect(await A.vault.getPatientNote(created.id), `próba ${proba}: usunięcie nie zostało cofnięte na A`).toBeFalsy();
      expect(maTombstone(await A.vault.exportSyncPayload(), created.id), `próba ${proba}: A niesie tombstone dalej`).toBe(true);
      await syncTo(B, A);
      expect(await B.vault.getPatientNote(created.id), `próba ${proba}: wizyta nie wróciła na urządzenie, które kasowało`).toBeFalsy();
    }

    // Kontrola pozytywna LWW (poza wyścigiem): edycja lokalna ZAKOŃCZONA przed startem merge
    // i nowsza niż deletedAtISO nadal przeżywa starsze usunięcie zdalne.
    const lww = await A.vault.savePatientNote({
      patientId: pid, title: 'LWW', body: '', category: 'followup', dueDateISO: '2026-09-07'
    });
    await syncTo(B, A);
    await sleep(3);
    await B.vault.removePatientNote(lww.id);
    const payloadLww = await B.vault.exportSyncPayload();
    await sleep(25);
    await A.vault.savePatientNote({ id: lww.id, patientId: pid, completedAtISO: new Date().toISOString() });
    await A.vault.mergeSyncPayload(payloadLww);
    expect(
      await A.vault.getPatientNote(lww.id),
      'nowsza edycja zakończona przed merge przeżywa starsze usunięcie zdalne (LWW bez zmian)'
    ).toBeTruthy();
  });
});

describe('VildaVault.removeWaitlistList — awaria sprzątania nie kończy się cichym sukcesem (K3, kontrola 2026-09-02)', () => {
  const ACT = '__vilda_activity__';

  async function zalozListeZTerminem(dev, nazwa) {
    await dev.vault.addWaitlistList(nazwa);
    const rezerwacja = await dev.vault.savePatientNote({
      patientId: ACT, category: 'reservation', externalName: nazwa, title: '',
      dueDateISO: '2026-09-16', dueTime: '09:00', durationMin: 60, procedureType: nazwa
    });
    await dev.vault.setWaitlistSchedule(nazwa, {
      dateISO: '2026-09-16', time: '09:00', reservationNoteId: rezerwacja.id, durationMin: 60
    });
    return rezerwacja.id;
  }

  async function stan(dev, klucz, rezerwacjaId) {
    return {
      lista: Boolean((await dev.vault.getWaitlistLists())[klucz]),
      termin: Boolean((await dev.vault.getWaitlistSchedules())[klucz]),
      rezerwacja: Boolean(await dev.vault.getPatientNote(rezerwacjaId))
    };
  }

  it('awaria kasowania notatki-rezerwacji zgłasza błąd, nie zostawia sieroty w kalendarzu, a ponowna próba sprząta komplet', async () => {
    // Źródło: K3 (z I6) — sprzątanie po usunięciu listy było opakowane w try{}catch{}: przy awarii
    // kasowania rezerwacji funkcja kończyła się CICHYM SUKCESEM (lista znikała, w kalendarzu
    // zostawał osierocony blok 🔒, bez komunikatu i bez ścieżki sprzątnięcia z UI).
    const dev = await createDevice('K3B');

    // Kontrola pozytywna: ścieżka szczęśliwa sprząta wszystko i propaguje się przez sync.
    const drugie = await createDevice('K3Bs');
    const idOk = await zalozListeZTerminem(dev, 'BACC');
    await syncTo(drugie, dev);
    await sleep(3);
    await dev.vault.removeWaitlistList('BACC');
    expect(await stan(dev, 'bacc', idOk), 'ścieżka szczęśliwa sprząta listę, termin i rezerwację')
      .toEqual({ lista: false, termin: false, rezerwacja: false });
    await syncTo(drugie, dev);
    expect(await stan(drugie, 'bacc', idOk), 'usunięcie propaguje się na drugie urządzenie')
      .toEqual({ lista: false, termin: false, rezerwacja: false });

    // Awaria kasowania rezerwacji.
    const idAwaria = await zalozListeZTerminem(dev, 'OGTT');
    const oryginal = dev.adapter.removePatientNoteForUser.bind(dev.adapter);
    dev.adapter.removePatientNoteForUser = async () => { throw new Error('symulowana awaria IndexedDB'); };
    let blad = null;
    try {
      await dev.vault.removeWaitlistList('OGTT');
    } catch (e) {
      blad = e;
    }
    dev.adapter.removePatientNoteForUser = oryginal;

    expect(blad, 'awaria sprzątania jest zgłoszona wywołującemu, a nie połknięta').toBeTruthy();
    expect(blad.message, 'komunikat mówi, czego nie udało się usunąć').toMatch(/rezerwacji/);
    expect(blad.message, 'komunikat mówi, że lista i termin pozostają bez zmian').toMatch(/pozostaj/);
    expect(await stan(dev, 'ogtt', idAwaria), 'stan spójny: nic nie zniknęło, brak osieroconej rezerwacji')
      .toEqual({ lista: true, termin: true, rezerwacja: true });

    // Ponowne kliknięcie „Usuń listę” po ustaniu awarii domyka sprzątanie.
    await dev.vault.removeWaitlistList('OGTT');
    expect(await stan(dev, 'ogtt', idAwaria), 'ponowna próba sprząta komplet')
      .toEqual({ lista: false, termin: false, rezerwacja: false });
  });

  it('awaria zapisu terminu listy zgłasza, co już zostało usunięte, a lista nie znika przed swoim terminem', async () => {
    // Źródło: K3 (z I6) — drugi punkt awarii: zapis wlsched. Przed naprawą lista była kasowana
    // JAKO PIERWSZA, więc porażka kolejnego kroku zostawiała osierocony termin listy bez listy;
    // po naprawie kolejność jest odwrócona (rezerwacja → termin → lista) i błąd jest jawny.
    const dev = await createDevice('K3C');
    const id = await zalozListeZTerminem(dev, 'USG');

    const oryginal = dev.adapter.putUserMeta.bind(dev.adapter);
    let wywolania = 0;
    dev.adapter.putUserMeta = async (...args) => {
      wywolania += 1;
      if (wywolania === 1) throw new Error('symulowana awaria zapisu terminu');
      return oryginal(...args);
    };
    let blad = null;
    try {
      await dev.vault.removeWaitlistList('USG');
    } catch (e) {
      blad = e;
    }
    dev.adapter.putUserMeta = oryginal;

    expect(blad, 'awaria zapisu terminu jest zgłoszona wywołującemu').toBeTruthy();
    expect(blad.message, 'komunikat wskazuje termin listy').toMatch(/terminu listy/);
    expect(blad.message, 'komunikat mówi, co JUŻ się udało (rezerwacja usunięta)').toMatch(/rezerwacj[ęe] usunięto/);
    expect(await stan(dev, 'usg', id), 'lista i jej termin zostają — brak osieroconego terminu')
      .toEqual({ lista: true, termin: true, rezerwacja: false });

    await dev.vault.removeWaitlistList('USG');
    expect(await stan(dev, 'usg', id), 'ponowna próba domyka usunięcie listy')
      .toEqual({ lista: false, termin: false, rezerwacja: false });
  });
});
