import { expect, test } from '@playwright/test';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { podlaczAtrapeDoKontekstu } from '../support/atrapa-workera-route.mjs';

// E2-PR4b (P-SYNC-ZDARZENIA) — wysyłka zdarzeń dziennika i włącznik dziennika na prawdziwej przeglądarce: prawdziwy sejf
// (kolejka w IndexedDB) i prawdziwe vilda_sync.js na „Komputerze prywatnym”, serwer synchronizacji to atrapa workera v37a
// (tests/support/atrapa-workera-sync.mjs) przez adapter route Playwright (tests/support/atrapa-workera-route.mjs), z
// „events” w health (EVENTS_ENABLED=1) i originem strony e2e na liście dozwolonych. Synchronizacja automatyczna wyłączona
// (test woła VildaSync wprost): rejestracja pełną wysyłką, potem GET /v1/health (detectApi).
// 1) Flaga wyłączona (brak klucza vilda-event-log-v1): włącznik i bramka kolejki zamknięte, zapis karty nie tworzy bazy
//    kolejki, żadne POST /events (to samo przy uśpieniu w produkcji, gdzie health nie ma „events”).
// 2) Flaga '1': bramka otwarta, zapis karty dopisuje zdarzenia do kolejki w IndexedDB, outboxTake → pushEvents →
//    accepted (seq od 1) → outboxAccept; powtórka tej samej partii — dup z tymi samymi numerami.
// E2-PR4d (P-SYNC-NADAWCA) — nadawca kolejki, dwie karty jednego profilu (wspólne IndexedDB, localStorage i Web Locks).
// Synchronizacja automatyczna wyłączona przy starcie strony (bez pętli integracji); włącznik synchronizacji ustawiony
// potem w localStorage (integracja czyta go przy każdym wywołaniu), test woła VildaSync wprost.
// 3) Flaga '1': zapis karty → flushOutbox wysyła wiersze kolejki (POST /events), druga karta tego profilu nie wysyła
//    (inny nadawca), jej wiersze wysyła nadawca (także keepalive przy utracie fokusu); chowanie strony —
//    flushKeepalive (fetch z keepalive).
// 4) Flaga wyłączona: zapis karty, pobranie i chowanie strony bez POST /events i bez klucza bicia serca (bez nowego
//    API — zielony także na bazie).
// E2-PR4e1 (P-SYNC-NADAWCA-WPIECIA) — przypadki 5–7 przy końcu pliku: dwa urządzenia i ramka powłoki.
// E2-PR5a (P-SYNC-WIDOK-KOLEJKI) — przypadki 8–10 na końcu pliku: widok kolejki w Ustawieniach (licznik, ostatni błąd),
//    ukryty przełącznik „Wysyłaj zmiany pojedynczo (test)” odblokowywany 5 kliknięciami linii „Wersja aplikacji”
//    i Ustawienia w ramce powłoki.
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Zdarzenia!26cc';
const ORIGIN = 'http://127.0.0.1:4173';

async function przygotuj(page, context, flaga) {
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, originy: [ORIGIN], zegar: () => Date.now() });
  await podlaczAtrapeDoKontekstu(context, atrapa);
  await page.addInitScript((f) => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vilda-sync-enabled-v1', 'false');
      if (f !== null) window.localStorage.setItem('vilda-event-log-v1', f);
    } catch (_) { /* brak storage — pomiń */ }
  }, flaga);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaSync && window.VildaSync.detectApi));
  const start = await page.evaluate(async () => {
    await window.VildaVault.savePatient({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    }, { dedup: false });
    const push = await window.VildaSync.syncPush();
    const api = await window.VildaSync.detectApi();
    return { push: push.action, features: api.features };
  });
  expect(start.push).toBe('registered');
  expect(start.features).toContain('events');
  return atrapa;
}

const zEvents = (atrapa) => atrapa.zadania.filter((z) => z.trasa === 'events').map((z) => `${z.metoda} ${z.status}`);
// Strona sama pyta o PRO: przy starcie o uprawnienia (GET /entitlement), a po świeżym zalogowaniu (tu: createUser) o okres
// próbny (GET /trial; vilda_auth_ui.js, P-KONTO-BEZ-SERWERA). To trasy workera poza modelem atrapy, które adapter przerywa jak
// błąd sieci. GET /trial wychodzi albo nie, zależnie od tego, czy zdąży przed przeładowaniem strony (w CI zdąża), więc obie
// trasy są przyjęte jawnie, czy wystąpią, czy nie; każde inne naruszenie atrapy wywraca test.
const PRO_POZA_MODELEM = /^GET \/v1\/slots\/<slot>\/(entitlement|trial) \(/;
function naruszenia(atrapa) {
  atrapa.przyjmijNaruszenia((n) => n.rodzaj === 'trasa-poza-modelem' && PRO_POZA_MODELEM.test(n.opis));
  return atrapa.naruszenia;
}

test('E2-PR4b: flaga wyłączona — przy „events” w health włącznik i bramka kolejki zamknięte, zapis karty bez bazy kolejki, bez POST /events', async ({ page, context }) => {
  test.setTimeout(120_000);
  const atrapa = await przygotuj(page, context, null);
  const w = await page.evaluate(async () => {
    const L = window.VildaVault._eventLog;
    await window.VildaVault.savePatient({
      name: 'Testowa Ewa',
      user: { lastName: 'Testowa', firstName: 'Ewa', sex: 'F', age: 9, ageMonths: 4, height: 133, weight: 29 },
    }, { dedup: false });
    await L.emissionsSettled();
    const push = typeof window.VildaSync.pushEvents === 'function'
      ? await window.VildaSync.pushEvents([{ eid: crypto.randomUUID(), iv: 'aXYtZmlrY3lqbmU=', data: 'ZGFuZQ==' }]) : 'brak-api';
    return {
      wl: typeof window.VildaSync.isEventLogEnabled === 'function' ? window.VildaSync.isEventLogEnabled() : 'brak-api',
      brama: L.gateOpen(), push,
      bazy: (await indexedDB.databases()).map((d) => d.name).filter((n) => /^vilda_sync_/.test(n)),
    };
  });
  expect([false, 'brak-api']).toContain(w.wl);
  expect(w.brama).toBe(false);
  if (w.push !== 'brak-api') expect(w.push).toEqual({ ok: false, powod: 'wylaczone' });
  expect(w.bazy, 'bez bazy kolejki').toEqual([]);
  expect(zEvents(atrapa)).toEqual([]);
  expect(naruszenia(atrapa)).toEqual([]);
});

test("E2-PR4b: vilda-event-log-v1 = '1' — zapis karty w kolejce IndexedDB, outboxTake → pushEvents → accepted → outboxAccept; powtórka partii → dup", async ({ page, context }) => {
  test.setTimeout(120_000);
  const atrapa = await przygotuj(page, context, '1');
  const w = await page.evaluate(async () => {
    const L = window.VildaVault._eventLog;
    const przed = { wl: window.VildaSync.isEventLogEnabled(), brama: L.gateOpen() };
    await window.VildaVault.savePatient({
      name: 'Testowa Ewa',
      user: { lastName: 'Testowa', firstName: 'Ewa', sex: 'F', age: 9, ageMonths: 4, height: 133, weight: 29 },
    }, { dedup: false });
    await L.emissionsSettled();
    const take = await L.outboxTake();
    const zdarzenia = take.ok ? take.wiersze.map((r) => ({ eid: r.eid, iv: r.env.iv, data: r.env.data })) : [];
    const push = await window.VildaSync.pushEvents(zdarzenia);
    const acc = push.ok ? await L.outboxAccept(push.accepted.map((a) => a.eid)) : null;
    const powtorka = await window.VildaSync.pushEvents(zdarzenia);
    const lista = await L.outboxList();
    return { przed, take: { ok: take.ok, n: zdarzenia.length, eidy: zdarzenia.map((z) => z.eid) }, push, acc, powtorka, pozostalo: lista.ok ? lista.wiersze.length : lista };
  });
  expect(w.przed).toEqual({ wl: true, brama: true });
  expect(w.take.ok).toBe(true);
  expect(w.take.n, 'zapis karty dopisał zdarzenia').toBeGreaterThan(0);
  expect(w.push.ok).toBe(true);
  expect(w.push.rejected).toEqual([]);
  expect(w.push.accepted.map((a) => a.eid)).toEqual(w.take.eidy);
  expect(w.push.accepted.map((a) => a.seq)).toEqual(w.take.eidy.map((_, i) => i + 1));
  expect(w.push.accepted.every((a) => a.dup === false)).toBe(true);
  expect(w.acc).toMatchObject({ ok: true });
  expect(w.powtorka.accepted).toEqual(w.push.accepted.map((a) => ({ ...a, dup: true })));
  expect(w.pozostalo, 'po outboxAccept kolejka pusta').toBe(0);
  expect(zEvents(atrapa)).toEqual(['POST 200', 'POST 200']);
  expect(naruszenia(atrapa)).toEqual([]);
});

// ── E2-PR4d: nadawca kolejki ─────────────────────────────────────────────────────────────────────────────────────────
async function zalogujStrone(page, flaga, { inicjuj = true } = {}) {
  // Druga karta tego profilu: bez skryptu startowego (localStorage jest wspólny — nie nadpisuje włącznika).
  if (inicjuj) await page.addInitScript((f) => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vilda-sync-enabled-v1', 'false');
      if (f !== null) window.localStorage.setItem('vilda-event-log-v1', f);
    } catch (_) { /* brak storage — pomiń */ }
  }, flaga);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
}
async function przygotujNadawce(page, context, flaga) {
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, originy: [ORIGIN], zegar: () => Date.now() });
  await podlaczAtrapeDoKontekstu(context, atrapa);
  await zalogujStrone(page, flaga);
  const userId = await page.evaluate(async (pw) => (await window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 })).userId, HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaSync && window.VildaSync.detectApi));
  const start = await page.evaluate(async () => {
    const push = await window.VildaSync.syncPush();
    const api = await window.VildaSync.detectApi();
    window.localStorage.setItem('vilda-sync-enabled-v1', 'true');
    return { push: push.action, features: api.features };
  });
  expect(start.push).toBe('registered');
  expect(start.features).toContain('events');
  return { atrapa, userId };
}
const zadaniaEvents = (atrapa) => atrapa.zadania.filter((z) => z.trasa === 'events');
const zapiszKarteNadawcy = (page, imie) => page.evaluate(async (n) => {
  await window.VildaVault.savePatient({
    name: `Testowy ${n}`,
    user: { lastName: 'Testowy', firstName: n, sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
  }, { dedup: false });
  await window.VildaVault._eventLog.emissionsSettled();
  const c = await window.VildaVault._eventLog.outboxCount();
  return c.pending;
}, imie);

test("E2-PR4d: vilda-event-log-v1 = '1' — flushOutbox wysyła kolejkę, druga karta profilu nie wysyła (inny nadawca), chowanie strony — flushKeepalive", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '1');
  expect(await zapiszKarteNadawcy(page, 'Jan'), 'wiersze w kolejce').toBeGreaterThan(0);
  const w1 = await page.evaluate(async () => {
    const w = await window.VildaSync.flushOutbox();
    const c = await window.VildaVault._eventLog.outboxCount();
    return { w, total: c.total };
  });
  expect(w1.w).toMatchObject({ ok: true, powod: null, partie: 1, odrzucone: 0 });
  expect(w1.w.wyslane).toBeGreaterThan(0);
  expect(w1.total).toBe(0);
  const poWysylce = zadaniaEvents(atrapa).length;
  expect(poWysylce).toBe(1);
  expect(zadaniaEvents(atrapa)[0]).toMatchObject({ metoda: 'POST', status: 200 });

  // druga karta tego profilu: to samo konto, ta sama baza kolejki — wiersz dopisuje, ale nie wysyła
  const page2 = await context.newPage();
  await zalogujStrone(page2, '1', { inicjuj: false });
  await page2.evaluate(async ([u, pw]) => { await window.VildaVault.unlockUser(u, pw); await window.VildaSync.detectApi(); }, [userId, HASLO]);
  expect(await page2.evaluate(() => window.VildaSync.isEventLogEnabled())).toBe(true);
  expect(await zapiszKarteNadawcy(page2, 'Adam')).toBeGreaterThan(0);
  const przed = zadaniaEvents(atrapa).length;
  const w2 = await page2.evaluate(() => window.VildaSync.flushOutbox());
  expect(w2).toMatchObject({ ok: false, powod: 'inny-nadawca' });
  expect(zadaniaEvents(atrapa), 'druga karta bez wysyłki').toHaveLength(przed);
  // nadawca wysyła wiersze drugiej karty (część mogła już pójść przez keepalive przy utracie fokusu — blur)
  const w3 = await page.evaluate(() => window.VildaSync.flushOutbox());
  expect(w3, 'nadawca').toMatchObject({ ok: true, powod: null });
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);

  // chowanie strony nadawcy: visibilitychange (ukryta) → flushKeepalive (fetch z keepalive)
  await zapiszKarteNadawcy(page, 'Ewa');
  const przedUkryciem = zadaniaEvents(atrapa).length;
  await page.evaluate(() => {
    window.__keepalive = [];
    const f = window.fetch;
    window.fetch = function (u, i) {
      if (/\/events$/.test(String(u))) window.__keepalive.push(!!(i && i.keepalive));
      return f.apply(this, arguments);
    };
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
  expect((await page.evaluate(() => window.__keepalive))[0], 'pierwszy POST /events po ukryciu — z keepalive').toBe(true);
  expect(zadaniaEvents(atrapa).length).toBeGreaterThan(przedUkryciem);
  expect(zadaniaEvents(atrapa).every((z) => z.status === 200)).toBe(true);
  const bicie = await page.evaluate((u) => JSON.parse(window.localStorage.getItem('vilda-outbox-heartbeat-v1:' + u)), userId);
  expect(bicie).toMatchObject({ d: expect.any(String), t: expect.any(Number) });
  expect(naruszenia(atrapa)).toEqual([]);
});

test('E2-PR4d: flaga wyłączona — zapis karty, pobranie i chowanie strony bez POST /events i bez klucza bicia serca (jak dotąd)', async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, null);
  await page.evaluate(async () => {
    await window.VildaVault.savePatient({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    }, { dedup: false });
    await window.VildaSync.syncPull({ czekajNaDrenaz: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => { setTimeout(r, 2000); });
  });
  expect(zadaniaEvents(atrapa)).toEqual([]);
  expect(await page.evaluate((u) => window.localStorage.getItem('vilda-outbox-heartbeat-v1:' + u), userId)).toBeNull();
  expect(naruszenia(atrapa)).toEqual([]);
});

// ── E2-PR4e1: wpięcia nadawcy — dwa urządzenia i ramka powłoki ───────────────────────────────────────────────────────
// 5) Flaga '1', dwa urządzenia jednego konta: B to drugi kontekst przeglądarki z kopią profilu A (localStorage i
//    IndexedDB z chwili po rejestracji; synchronizacja automatyczna B wyłączona, żeby pobranie w tle nie wyprzedziło
//    ramki). A zapisuje notatkę — integracja woła scheduleFlush zamiast beaconu, nadawca wysyła POST /events, żadnego
//    POST /delta; ramka WebSocket tego zdarzenia (z atrapy; gniazdo jest poza modelem) trafia do integracji B — notatka
//    w sejfie B, kursor B o jeden, odświeżenie widoku; ta sama ramka u A — własne zdarzenie.
// 6) Flaga '1', ramka powłoki: strona w iframe (notatki.html?embedded=1, ta sama karta) zapisuje notatkę — ramka nie
//    wysyła sama (bez POST /events, beaconu i POST /delta z ramki), ping vilda-sync-data, wysyła okno nadrzędne.
// 7) Flaga wyłączona, dwa urządzenia: zapis karty — delta beaconem (POST /delta) jak dotąd, bez POST /events; ramka
//    u B stosowana jak dotąd (applyEncryptedDelta), kursor B bez zmian (zielony także na bazie).
async function drugieUrzadzenie(browser, context, atrapa, userId) {
  const stan = await context.storageState({ indexedDB: true });
  for (const o of stan.origins) {
    for (const w of o.localStorage) if (w.name === 'vilda-sync-enabled-v1') w.value = 'false';
  }
  const ctxB = await browser.newContext({ storageState: stan, serviceWorkers: 'block' });
  await podlaczAtrapeDoKontekstu(ctxB, atrapa, { urzadzenie: 'B' });
  const pageB = await ctxB.newPage();
  await pageB.goto('/index.html', { waitUntil: 'load' });
  await pageB.waitForFunction(() => Boolean(window.VildaVault && window.VildaSync && window.VildaSyncIntegration));
  const b = await pageB.evaluate(async ([u, pw]) => {
    if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(u, pw);
    await window.VildaSync.detectApi();
    await window.VildaSync.syncPull({ czekajNaDrenaz: true });
    const m = await window.VildaVault.getSyncMaterial();
    window.__scalone = 0;
    document.addEventListener('vilda:sync-merged', () => { window.__scalone += 1; });
    return { slot: m.slotId, log: window.VildaSync.isEventLogEnabled() };
  }, [userId, HASLO]);
  return { ctxB, pageB, ...b };
}
const kursorStrony = (page, slot) => page.evaluate((s) => Number(window.localStorage.getItem('vilda-sync-cursor-v1:' + s) || 0), slot);
const ramkaZAtrapy = (atrapa, eid) => {
  const r = atrapa.ramki.filter((x) => x.ramka.type === 'delta' && (!eid || x.ramka.eid === eid)).at(-1);
  return r ? JSON.parse(JSON.stringify(r.ramka)) : null;
};

test("E2-PR4e1: vilda-event-log-v1 = '1' — dwa urządzenia: notatka idzie kolejką (bez POST /delta), ramka WebSocket u B — zastosowanie i kursor, u A — własne zdarzenie", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '1');
  await zapiszKarteNadawcy(page, 'Jan');
  await page.evaluate(() => window.VildaSync.flushOutbox());
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
  const { ctxB, pageB, slot, log } = await drugieUrzadzenie(browser, context, atrapa, userId);
  try {
    expect(log, 'B: dziennik włączony').toBe(true);
    const k0 = await kursorStrony(pageB, slot);
    const przed = zadaniaEvents(atrapa).length;
    // A: notatka przez sejf strony — integracja (synchronizacja włączona) woła scheduleFlush, nadawca wysyła po 1,5 s
    const pid = await page.evaluate(async () => {
      const [p] = await window.VildaVault.listPatients();
      await window.VildaVault.savePatientNote({ patientId: p.patientId, title: 'Fikcyjna notatka e2e', body: 'Fikcyjna treść.', category: 'inne' });
      await window.VildaVault._eventLog.emissionsSettled();
      return p.patientId;
    });
    await expect.poll(() => zadaniaEvents(atrapa).length, { timeout: 15_000 }).toBeGreaterThan(przed);
    await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
    expect(atrapa.zadania.filter((z) => z.trasa === 'delta'), 'bez POST /delta (beaconu)').toEqual([]);
    const fr = ramkaZAtrapy(atrapa);
    expect(fr && fr.seq, 'ramka zdarzenia z seq').toBe(k0 + 1);
    // B: ramka do integracji (tak woła ją vilda_realtime.js)
    await pageB.evaluate((r) => window.VildaSyncIntegration.applyDelta(r.payload, r), fr);
    await expect.poll(() => pageB.evaluate(async (p) => (await window.VildaVault.listPatientNotesForPatient(p)).map((n) => n.title), pid), { timeout: 15_000 }).toEqual(['Fikcyjna notatka e2e']);
    expect(await kursorStrony(pageB, slot), 'kursor B o jeden').toBe(k0 + 1);
    await expect.poll(() => pageB.evaluate(() => window.__scalone), { timeout: 5_000 }).toBeGreaterThan(0);
    // A: ta sama ramka — własne zdarzenie, kursor A bez zmian
    const kA = await kursorStrony(page, slot);
    expect(await page.evaluate((r) => window.VildaSync.applyRealtimeFrame(r), fr)).toEqual({ ok: true, powod: null, status: 'wlasne', kursor: false, zmiana: false });
    expect(await kursorStrony(page, slot)).toBe(kA);
    expect(naruszenia(atrapa)).toEqual([]);
  } finally {
    await ctxB.close();
  }
});

test("E2-PR4e1: vilda-event-log-v1 = '1' — ramka powłoki: notatka zapisana w iframe wysyła okno nadrzędne, ramka bez własnych żądań", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa } = await przygotujNadawce(page, context, '1');
  await zapiszKarteNadawcy(page, 'Jan');
  await page.evaluate(() => window.VildaSync.flushOutbox());
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
  await page.evaluate(() => {
    const f = document.createElement('iframe');
    f.id = 'ramkaTestu';
    f.src = '/notatki.html?embedded=1';
    document.body.appendChild(f);
  });
  const ramka = page.frameLocator('#ramkaTestu');
  await expect.poll(() => page.evaluate(() => {
    const w = document.getElementById('ramkaTestu').contentWindow;
    return !!(w && w.VildaVault && w.VildaVault.isUnlocked() && w.VildaSync && w.VildaSync.isEventLogEnabled() && w.VildaSyncIntegration);
  }), { timeout: 30_000 }).toBe(true);
  expect(ramka).toBeTruthy();
  // skrypt startowy testu działa też w ramce i wyłącza synchronizację we wspólnym localStorage — włącznik z powrotem
  await page.evaluate(() => window.localStorage.setItem('vilda-sync-enabled-v1', 'true'));
  const przed = zadaniaEvents(atrapa).length;
  const zRamki = await page.evaluate(async () => {
    const w = document.getElementById('ramkaTestu').contentWindow;
    w.__zadania = [];
    const f = w.fetch;
    w.fetch = function (u) { if (/\/(events|delta)$/.test(String(u))) w.__zadania.push('fetch ' + String(u).split('/').pop()); return f.apply(this, arguments); };
    const b = w.navigator.sendBeacon.bind(w.navigator);
    w.navigator.sendBeacon = function (u, d) { w.__zadania.push('beacon ' + String(u).split('/').pop()); return b(u, d); };
    const [p] = await w.VildaVault.listPatients();
    window.__ping = [];
    const bc = new BroadcastChannel('vilda-sync-data');
    bc.onmessage = (e) => { window.__ping.push(e.data && e.data.type); };
    await w.VildaVault.savePatientNote({ patientId: p.patientId, title: 'Fikcyjna notatka z ramki', body: 'Fikcyjna treść.', category: 'inne' });
    await w.VildaVault._eventLog.emissionsSettled();
    return { gora: window.VildaSync.isEventLogEnabled(), ramka: w.VildaSync.isEventLogEnabled(), osadzona: w.document.documentElement.classList.contains('vilda-embedded') };
  });
  expect(zRamki).toEqual({ gora: true, ramka: true, osadzona: true });
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
  expect(zadaniaEvents(atrapa).length, 'wysłało okno nadrzędne').toBeGreaterThan(przed);
  expect(await page.evaluate(() => document.getElementById('ramkaTestu').contentWindow.__zadania), 'ramka bez własnych żądań').toEqual([]);
  expect(await page.evaluate(() => window.__ping), 'ping ramki na vilda-sync-data').toContain('outbox');
  expect(atrapa.zadania.filter((z) => z.trasa === 'delta'), 'bez POST /delta').toEqual([]);
  expect(naruszenia(atrapa)).toEqual([]);
});

test('E2-PR4e1: flaga wyłączona — dwa urządzenia: karta idzie deltą beaconem jak dotąd (bez POST /events), ramka u B przez applyEncryptedDelta, kursor B bez zmian', async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, null);
  const { ctxB, pageB, slot, log } = await drugieUrzadzenie(browser, context, atrapa, userId);
  try {
    expect(log).toBe(false);
    const k0 = await kursorStrony(pageB, slot);
    const pid = await page.evaluate(async () => (await window.VildaVault.savePatient({
      name: 'Testowa Ewa',
      user: { lastName: 'Testowa', firstName: 'Ewa', sex: 'F', age: 9, ageMonths: 4, height: 133, weight: 29 },
    }, { dedup: false })).patientId);
    await expect.poll(() => atrapa.zadania.filter((z) => z.trasa === 'delta').length, { timeout: 15_000 }).toBeGreaterThan(0);
    const fr = ramkaZAtrapy(atrapa);
    expect(fr, 'ramka delty').toBeTruthy();
    await pageB.evaluate((r) => window.VildaSyncIntegration.applyDelta(r.payload, r), fr);
    await expect.poll(() => pageB.evaluate(async (p) => !!(await window.VildaVault.getPatient(p).catch(() => null)), pid), { timeout: 15_000 }).toBe(true);
    expect(await kursorStrony(pageB, slot), 'kursor B bez zmian').toBe(k0);
    expect(zadaniaEvents(atrapa)).toEqual([]);
    expect(naruszenia(atrapa)).toEqual([]);
  } finally {
    await ctxB.close();
  }
});

// E2-PR5a (P-SYNC-WIDOK-KOLEJKI) — widok kolejki w Ustawieniach na prawdziwej stronie ustawienia.html (ten sam profil,
// sejf odblokowany na stronie Ustawień). Banery konta i zgody schowane, żeby kliknięcia trafiały w stronę.
async function otworzUstawienia(page, userId) {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaSync));
  await page.evaluate(async ([u, pw]) => { if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(u, pw); }, [userId, HASLO]);
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    // Skrypt startowy tej strony wyłącza synchronizację przy każdym wejściu; stan jak po przygotujNadawce.
    window.localStorage.setItem('vilda-sync-enabled-v1', 'true');
    for (const id of ['vilda-auth-ui-root', 'consent-banner']) {
      const a = document.getElementById(id);
      if (a) a.style.display = 'none';
    }
    document.getElementById('settings-section-sync').open = true;
  });
}
const EVENTS_URL = /\/v1\/slots\/[^/]+\/events$/;

test("E2-PR5a: vilda-event-log-v1 = '1' — Ustawienia: znaczek i linia „N zmian czeka”, ostatni błąd bez sieci, po wysyłce „Wszystkie zmiany wysłane.”", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '1');
  // POST /events bez sieci (trasa strony ma pierwszeństwo przed atrapą kontekstu).
  await page.route(EVENTS_URL, (r) => r.abort('internetdisconnected'));
  const n = await zapiszKarteNadawcy(page, 'Jan');
  expect(n, 'wiersze w kolejce').toBeGreaterThan(0);

  await otworzUstawienia(page, userId);
  // Nadawcą zostaje strona Ustawień: bicie serca poprzedniego dokumentu (index.html) usunięte, jak po 90 s.
  await page.evaluate(async (u) => {
    window.localStorage.removeItem('vilda-outbox-heartbeat-v1:' + u);
    await window.VildaSync.detectApi();
  }, userId);
  await expect.poll(async () => (await page.evaluate(() => window.VildaSync.flushOutbox())).kod, { timeout: 15_000 }).toBe('NETWORK');
  const znaczek = page.locator('#syncOutboxChip');
  await expect(znaczek).toBeVisible({ timeout: 15_000 });
  await expect(znaczek).toHaveText(/^\d+ zmian(a|y)? czek(a|ają)$/);
  await expect(page.locator('#syncOutboxCount')).toHaveText(/^\d+ zmian(a|y)? czek(a|ają) na wysłanie\.$/);
  await expect(page.locator('#syncOutboxHint')).toHaveText(/^Wysyła(ją)? się sam(a|e), zwykle w ciągu kilku sekund\.$/);
  const blad = page.locator('#syncOutboxError');
  await expect(blad).toBeVisible({ timeout: 15_000 }); // najbliższe odświeżenie widoku (co 5 s)
  await expect(blad).toHaveText(/^Ostatni błąd \(dziś \d\d:\d\d\): brak połączenia z serwerem\. Aplikacja spróbuje ponownie sama\.$/);
  // Flaga '1' bez odblokowania — karta przełącznika widoczna (do wyłączenia), zaznaczona.
  await page.evaluate(() => { document.getElementById('syncSlotCard').open = true; });
  await expect(page.locator('#syncEventLogTestCard')).toBeVisible();
  await expect(page.locator('#syncEventLogTestToggle')).toBeChecked();
  await expect(page.locator('#syncEventLogTestTag')).toHaveText('Włączone');

  await page.unroute(EVENTS_URL);
  await expect.poll(async () => (await page.evaluate(() => window.VildaSync.flushOutbox())).ok, { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#syncOutboxCount')).toHaveText('Wszystkie zmiany wysłane.', { timeout: 15_000 });
  await expect(znaczek).toBeHidden();
  await expect(blad).toBeHidden();
  expect(zadaniaEvents(atrapa).every((z) => z.status === 200)).toBe(true);
  expect(naruszenia(atrapa)).toEqual([]);
});

test('E2-PR5a: flaga wyłączona — Ustawienia jak dotąd; 5 kliknięć „Wersja aplikacji” i „Odblokuj” — przełącznik zapisuje i usuwa flagę', async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, null);
  await otworzUstawienia(page, userId);
  await page.evaluate(() => { document.getElementById('syncSlotCard').open = true; });
  await page.waitForTimeout(6000); // jeden obrót zegara widoku (5 s)
  await expect(page.locator('#syncOutboxChip')).toBeHidden();
  await expect(page.locator('#syncOutboxBox')).toBeHidden();
  await expect(page.locator('#syncEventLogTestCard')).toBeHidden();

  const wersja = page.locator('#settingsAppVersion');
  for (let i = 0; i < 4; i++) await wersja.click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await wersja.click();
  const arkusz = page.getByRole('alertdialog', { name: 'Odblokować opcje testowe?' });
  await expect(arkusz).toBeVisible();
  await arkusz.getByRole('button', { name: 'Odblokuj' }).click();
  await expect(arkusz).toHaveCount(0);
  const karta = page.locator('#syncEventLogTestCard');
  await expect(karta).toBeVisible();
  const pole = page.locator('#syncEventLogTestToggle');
  await expect(pole).toBeVisible();
  await expect(pole).not.toBeChecked();
  await expect(pole).toBeFocused();
  await expect(page.locator('#syncEventLogTestTag')).toHaveText('Wyłączone');
  await expect(page.locator('#syncEventLogTestStatus')).toHaveText('');

  await pole.check();
  expect(await page.evaluate(() => window.localStorage.getItem('vilda-event-log-v1'))).toBe('1');
  await expect(page.locator('#syncEventLogTestTag')).toHaveText('Włączone');
  await expect(page.locator('#syncOutboxCount')).toHaveText('Wszystkie zmiany wysłane.');
  expect(await page.evaluate(() => window.VildaSync.isEventLogEnabled())).toBe(true);

  await pole.uncheck();
  expect(await page.evaluate(() => window.localStorage.getItem('vilda-event-log-v1'))).toBeNull();
  await expect(page.locator('#syncEventLogTestTag')).toHaveText('Wyłączone');
  await expect(page.locator('#syncOutboxBox')).toBeHidden();

  // Po odświeżeniu strony bez flagi przełącznik znowu ukryty (odblokowanie tylko w pamięci strony).
  await otworzUstawienia(page, userId);
  await page.evaluate(() => { document.getElementById('syncSlotCard').open = true; });
  await expect(page.locator('#syncEventLogTestCard')).toBeHidden();
  expect(zadaniaEvents(atrapa)).toEqual([]);
  expect(naruszenia(atrapa)).toEqual([]);
});

test("E2-PR5a: vilda-event-log-v1 = '1' — Ustawienia w ramce powłoki (ustawienia.html?embedded=1): licznik i ostatni błąd z kolejki konta, health z okna nadrzędnego", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa } = await przygotujNadawce(page, context, '1');
  await page.route(EVENTS_URL, (r) => r.abort('internetdisconnected'));
  expect(await zapiszKarteNadawcy(page, 'Jan')).toBeGreaterThan(0);
  await expect.poll(async () => (await page.evaluate(() => window.VildaSync.flushOutbox())).kod, { timeout: 15_000 }).toBe('NETWORK');
  await page.evaluate(() => {
    window.__healthTop = 0;
    const d = window.VildaSync.detectApi;
    window.VildaSync.detectApi = function () { window.__healthTop += 1; return d.apply(this, arguments); };
    const f = document.createElement('iframe');
    f.id = 'ramkaUstawien';
    f.src = '/ustawienia.html?embedded=1';
    document.body.appendChild(f);
  });
  await expect.poll(() => page.evaluate(() => {
    const w = document.getElementById('ramkaUstawien').contentWindow;
    return !!(w && w.VildaVault && w.VildaVault.isUnlocked() && w.document.getElementById('settings-section-sync'));
  }), { timeout: 30_000 }).toBe(true);
  // skrypt startowy testu działa też w ramce i wyłącza synchronizację we wspólnym localStorage — włącznik z powrotem
  await page.evaluate(() => window.localStorage.setItem('vilda-sync-enabled-v1', 'true'));
  const ramka = page.frameLocator('#ramkaUstawien');
  await page.evaluate(() => {
    const d = document.getElementById('ramkaUstawien').contentWindow.document;
    d.getElementById('settings-section-sync').open = true;
    d.getElementById('syncSlotCard').open = true;
  });
  await expect(ramka.locator('#syncOutboxChip')).toHaveText(/^\d+ zmian(a|y)? czek(a|ają)$/, { timeout: 15_000 });
  await expect(ramka.locator('#syncOutboxError')).toHaveText(/^Ostatni błąd \(dziś \d\d:\d\d\): brak połączenia z serwerem\. Aplikacja spróbuje ponownie sama\.$/, { timeout: 15_000 });
  await expect(ramka.locator('#syncEventLogTestToggle')).toBeChecked();
  await expect(ramka.locator('#syncEventLogTestStatus')).toHaveText('');
  expect(await page.evaluate(() => window.__healthTop), 'health z okna nadrzędnego').toBeGreaterThan(0);
  expect(naruszenia(atrapa)).toEqual([]);
});
