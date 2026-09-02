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
