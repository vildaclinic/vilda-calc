import { expect, test } from '@playwright/test';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { podlaczAtrapeDoKontekstu } from '../support/atrapa-workera-route.mjs';

// E2-PR4b (P-SYNC-ZDARZENIA) — wysyłka zdarzeń dziennika i włącznik dziennika na prawdziwej przeglądarce: prawdziwy sejf
// (kolejka w IndexedDB) i prawdziwe vilda_sync.js na „Komputerze prywatnym”, serwer synchronizacji to atrapa workera v37a
// (tests/support/atrapa-workera-sync.mjs) przez adapter route Playwright (tests/support/atrapa-workera-route.mjs), z
// „events” w health (EVENTS_ENABLED=1) i originem strony e2e na liście dozwolonych. Synchronizacja automatyczna wyłączona
// (test woła VildaSync wprost): rejestracja pełną wysyłką, potem GET /v1/health (detectApi).
// 1) Flaga '0' (wyłącznik na urządzeniu; do E2-PR6 — brak klucza vilda-event-log-v1): włącznik i bramka kolejki
//    zamknięte, zapis karty nie tworzy bazy kolejki, żadne POST /events (to samo, gdy health nie ma „events”).
// 2) Flaga '1': bramka otwarta, zapis karty dopisuje zdarzenia do kolejki w IndexedDB, outboxTake → pushEvents →
//    accepted (seq od 1) → outboxAccept; powtórka tej samej partii — dup z tymi samymi numerami.
// E2-PR4d (P-SYNC-NADAWCA) — nadawca kolejki, dwie karty jednego profilu (wspólne IndexedDB, localStorage i Web Locks).
// Synchronizacja automatyczna wyłączona przy starcie strony (bez pętli integracji); włącznik synchronizacji ustawiony
// potem w localStorage (integracja czyta go przy każdym wywołaniu), test woła VildaSync wprost.
// 3) Flaga '1': zapis karty → flushOutbox wysyła wiersze kolejki (POST /events), druga karta tego profilu nie wysyła
//    (inny nadawca), jej wiersze wysyła nadawca (także keepalive przy utracie fokusu); chowanie strony —
//    flushKeepalive (fetch z keepalive).
// 4) Flaga '0': zapis karty, pobranie i chowanie strony bez POST /events i bez klucza bicia serca (bez nowego
//    API — zielony także na bazie).
// E2-PR4e1 (P-SYNC-NADAWCA-WPIECIA) — przypadki 5–7 przy końcu pliku: dwa urządzenia i ramka powłoki.
// E2-PR5a (P-SYNC-WIDOK-KOLEJKI) — przypadki 8–10 na końcu pliku: widok kolejki w Ustawieniach (licznik, ostatni błąd;
//    od E2-PR5d w przypadku 8 po przeładowaniu strony wysłane i przyjęte zmiany nie wracają do kolejki),
//    ukryty przełącznik „Wysyłaj zmiany pojedynczo” odblokowywany 5 kliknięciami linii „Wersja aplikacji” (od E2-PR6
//    wyłącznik na urządzeniu) i Ustawienia w ramce powłoki.
// E2-PR5b (P-SYNC-WIDOK-KOLEJKI) — przypadek 11 na końcu pliku: „Zmiany do wyjaśnienia” („Porzuć” i „Zwolnij”); od
//    E2-PR5c (P-DZIENNIK-ZDARZEN) porzucone zmiany nie wracają przy przeglądzie kolejki (także w trakcie przeglądu
//    z odblokowania strony) ani po przeładowaniu strony.
// E2-PR6 (PR włączający, wiersz 12 planu) — przypadki 12–13 na końcu pliku: dwa urządzenia bez klucza flagi (dziennik
//    domyślnie włączony; A to kontekst strony, w atrapie urządzenie 'strona'). 12) PUT /blob urządzenia A zablokowany (r2_error): nowa karta i notatka z A docierają do B
//    samymi zdarzeniami (POST /events, drenaż stronami u B), bez POST /delta i bez udanej pełnej wysyłki A.
//    13) PUT /blob liczony: po zdarzeniach i pełnej wysyłce A, B po pobraniu ma te same karty i notatki co A.
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

test("E2-PR4b: flaga '0' (wyłączona na urządzeniu) — przy „events” w health włącznik i bramka kolejki zamknięte, zapis karty bez bazy kolejki, bez POST /events", async ({ page, context }) => {
  test.setTimeout(120_000);
  const atrapa = await przygotuj(page, context, '0');
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

test("E2-PR4d: flaga '0' — zapis karty, pobranie i chowanie strony bez POST /events i bez klucza bicia serca (jak dotąd)", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '0');
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
// 7) Flaga '0', dwa urządzenia: zapis karty — delta beaconem (POST /delta) jak dotąd, bez POST /events; ramka
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

test("E2-PR4e1: flaga '0' — dwa urządzenia: karta idzie deltą beaconem jak dotąd (bez POST /events), ramka u B przez applyEncryptedDelta, kursor B bez zmian", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '0');
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
  // GET /v1/health tej strony — jak pobieranie przy starcie strony z włączoną synchronizacją (skrypt startowy testu ją
  // wyłącza). Do E2-PR6 pytała o to także karta przełącznika, widoczna przy fladze '1'.
  await page.evaluate(() => window.VildaSync.detectApi());
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

test("E2-PR5a: vilda-event-log-v1 = '1' — Ustawienia: znaczek i linia „N zmian czeka”, ostatni błąd bez sieci, po wysyłce „Wszystkie zmiany wysłane.”, po przeładowaniu wysłane zmiany nie wracają", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '1');
  // Kolejkę ma wysłać dokument Ustawień. W poprzednim dokumencie wyłącz wysyłkę przed zapisem:
  // pagehide/keepalive mógł zabrać wiersze do inflight przy nawigacji, zanim test wymusi błąd w Ustawieniach.
  // Takie wiersze prawidłowo czekają 60 s, czyli dłużej niż 15 s tej asercji. otworzUstawienia włącza wysyłkę ponownie.
  await page.evaluate(() => window.localStorage.setItem('vilda-sync-enabled-v1', 'false'));
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
  // Flaga '1' (z testu właściciela) bez odblokowania — od E2-PR6 to ustawienie domyślne, więc karta przełącznika ukryta.
  await page.evaluate(() => { document.getElementById('syncSlotCard').open = true; });
  await expect(page.locator('#syncEventLogTestCard')).toBeHidden();

  const wyslane = await page.evaluate(async () => (await window.VildaVault._eventLog.outboxList()).wiersze
    .map((w) => w.kind + '|' + w.entityKey));
  expect(wyslane.length, 'wiersze do wysłania').toBeGreaterThan(0);
  await page.unroute(EVENTS_URL);
  await expect.poll(async () => (await page.evaluate(() => window.VildaSync.flushOutbox())).ok, { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#syncOutboxCount')).toHaveText('Wszystkie zmiany wysłane.', { timeout: 15_000 });
  await expect(znaczek).toBeHidden();
  await expect(blad).toBeHidden();
  expect(zadaniaEvents(atrapa).every((z) => z.status === 200)).toBe(true);

  // E2-PR5d (P-DZIENNIK-ZDARZEN): zmiany przyjęte przez serwer nie wracają do kolejki po przeładowaniu strony
  // (przegląd przy odblokowaniu i jawny przegląd w nowym dokumencie).
  await otworzUstawienia(page, userId);
  const poPrzeladowaniu = await page.evaluate(async () => {
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const sw = await L.sweepOutbox();
    await L.emissionsSettled();
    return { sw, klucze: (await L.outboxList()).wiersze.map((w) => w.kind + '|' + w.entityKey) };
  });
  expect(poPrzeladowaniu.sw).toMatchObject({ ok: true });
  expect(poPrzeladowaniu.klucze.filter((k) => wyslane.includes(k)), 'wysłane zmiany po przeładowaniu').toEqual([]);
  expect(naruszenia(atrapa)).toEqual([]);
});

test("E2-PR6: bez klucza flagi — Ustawienia z widokiem kolejki, przełącznik ukryty; 5 kliknięć „Wersja aplikacji” i „Odblokuj” — pole zaznaczone, odznaczenie zapisuje '0', po przeładowaniu karta widoczna, zaznaczenie usuwa klucz", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, null);
  await otworzUstawienia(page, userId);
  await page.evaluate(() => { document.getElementById('syncSlotCard').open = true; });
  await expect(page.locator('#syncOutboxCount')).toHaveText('Wszystkie zmiany wysłane.', { timeout: 15_000 });
  await expect(page.locator('#syncEventLogTestCard')).toBeHidden();
  expect(await page.evaluate(() => [window.localStorage.getItem('vilda-event-log-v1'), window.VildaSync.isEventLogEnabled()])).toEqual([null, true]);

  const wersja = page.locator('#settingsAppVersion');
  for (let i = 0; i < 4; i++) await wersja.click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await wersja.click();
  const arkusz = page.getByRole('alertdialog', { name: 'Odblokować ukrytą opcję?' });
  await expect(arkusz).toBeVisible();
  await arkusz.getByRole('button', { name: 'Odblokuj' }).click();
  await expect(arkusz).toHaveCount(0);
  await expect(page.locator('#syncEventLogTestCard')).toBeVisible();
  const pole = page.locator('#syncEventLogTestToggle');
  await expect(pole).toBeVisible();
  await expect(pole).toBeChecked();
  await expect(pole).toBeFocused();
  await expect(page.locator('#syncEventLogTestTag')).toHaveText('Włączone');
  await expect(page.locator('#syncEventLogTestStatus')).toHaveText('');

  await pole.uncheck();
  expect(await page.evaluate(() => window.localStorage.getItem('vilda-event-log-v1'))).toBe('0');
  await expect(page.locator('#syncEventLogTestTag')).toHaveText('Wyłączone');
  await expect(page.locator('#syncOutboxBox')).toBeHidden();
  expect(await page.evaluate(() => window.VildaSync.isEventLogEnabled())).toBe(false);

  // Po odświeżeniu strony z '0' przełącznik widoczny bez odblokowania (da się włączyć z powrotem).
  await otworzUstawienia(page, userId);
  await page.evaluate(() => { document.getElementById('syncSlotCard').open = true; });
  await expect(page.locator('#syncEventLogTestCard')).toBeVisible();
  const pole2 = page.locator('#syncEventLogTestToggle');
  await expect(pole2).toBeVisible();
  await expect(pole2).not.toBeChecked();
  await pole2.check();
  expect(await page.evaluate(() => window.localStorage.getItem('vilda-event-log-v1'))).toBeNull();
  await expect(page.locator('#syncEventLogTestCard')).toBeHidden();
  await expect(page.locator('#syncOutboxCount')).toHaveText('Wszystkie zmiany wysłane.', { timeout: 15_000 });
  expect(await page.evaluate(() => window.VildaSync.isEventLogEnabled())).toBe(true);
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
  // Od E2-PR6 karta przełącznika przy fladze '1' ukryta: odblokowanie w ramce (5 kliknięć „Wersja aplikacji”), health
  // karty z okna nadrzędnego.
  await expect(ramka.locator('#syncEventLogTestCard')).toBeHidden();
  await page.evaluate(() => {
    const ramkaDok = document.getElementById('ramkaUstawien').contentWindow.document;
    for (const d of [document, ramkaDok]) {
      for (const id of ['vilda-auth-ui-root', 'consent-banner']) {
        const a = d.getElementById(id);
        if (a) a.style.display = 'none';
      }
    }
  });
  const wersja = ramka.locator('#settingsAppVersion');
  for (let i = 0; i < 5; i++) await wersja.click();
  await ramka.getByRole('alertdialog', { name: 'Odblokować ukrytą opcję?' }).getByRole('button', { name: 'Odblokuj' }).click();
  await expect(ramka.locator('#syncEventLogTestCard')).toBeVisible();
  await expect(ramka.locator('#syncEventLogTestToggle')).toBeChecked();
  await expect(ramka.locator('#syncEventLogTestStatus')).toHaveText('');
  expect(await page.evaluate(() => window.__healthTop), 'health z okna nadrzędnego').toBeGreaterThan(0);
  expect(naruszenia(atrapa)).toEqual([]);
});

// E2-PR5b (P-SYNC-WIDOK-KOLEJKI) — „Zmiany do wyjaśnienia” na prawdziwej stronie Ustawień: serwer odrzuca zmiany karty
// (wiersze „rejected”), a zdarzenie, którego urządzenie nie umie odszyfrować, leży w kwarantannie (zapis przez API
// kwarantanny sejfu — jak robi to drenaż). „Porzuć” i „Zwolnij” po potwierdzeniu czyszczą kolejkę i kwarantannę;
// porzucone zmiany nie wracają przy przeglądzie kolejki ani po przeładowaniu strony (E2-PR5c).
test("E2-PR5b: vilda-event-log-v1 = '1' — Ustawienia: zmiany odrzucone przez serwer i zdarzenie w kwarantannie; „Porzuć” i „Zwolnij” po potwierdzeniu, po przeładowaniu porzucone zmiany nie wracają", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, '1');
  await page.route(EVENTS_URL, (r) => {
    const events = (r.request().postDataJSON() || {}).events || [];
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ accepted: [], rejected: events.map((e) => ({ eid: e.eid, code: 'invalid' })), headSeq: 0, ts: Date.now() }) });
  });
  expect(await zapiszKarteNadawcy(page, 'Jan')).toBeGreaterThan(0);
  const w = await page.evaluate(() => window.VildaSync.flushOutbox());
  expect(w).toMatchObject({ ok: true, wyslane: 0 });
  expect(w.odrzucone).toBeGreaterThan(0);
  const stan = await page.evaluate(async () => {
    const L = window.VildaVault._eventLog;
    const m = await window.VildaVault.getSyncMaterial();
    const kw = await L.quarantinePut({ seq: 7, eid: '00000000-0000-4000-8000-0000000000e7', payload: { iv: 'Rmlrc3lqbmVJVjEy', data: 'AAAA' } },
      { status: 'unreadable', reason: 'decrypt' }, { slotId: m.slotId, appVersion: 'e2e' });
    const c = await L.outboxCount();
    return { kw: kw && kw.ok, rejected: c.rejected, pending: c.pending };
  });
  expect(stan).toMatchObject({ kw: true, pending: 0 });
  expect(stan.rejected).toBeGreaterThan(0);

  await otworzUstawienia(page, userId);
  // Bez czekania na przegląd kolejki z odblokowania strony Ustawień: „Porzuć” w jego trakcie zostawia parę w pamięci
  // przeglądu, a zapis przeglądu jej nie gubi (E2-PR5c).
  const box = page.locator('#syncProblemsBox');
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#syncProblemsTag')).toHaveText(String(stan.rejected + 1));
  const wlasne = page.locator('#syncProblemsOwnList > li');
  await expect(wlasne).toHaveCount(stan.rejected);
  await expect(wlasne.first().locator('.settings-kosz-wpis-karta')).toHaveText(/: Testowy Jan$/);
  await expect(wlasne.first().locator('.settings-kosz-wpis-meta')).toHaveText(/^serwer odrzucił zmianę · dziś \d\d:\d\d$/);
  const obce = page.locator('#syncProblemsOtherList > li');
  await expect(obce).toHaveCount(1);
  await expect(obce.first().locator('.settings-kosz-wpis-karta')).toHaveText('Zdarzenie nr 7');
  await expect(obce.first().locator('.settings-kosz-wpis-meta')).toHaveText(/^nie udało się odszyfrować · od dziś \d\d:\d\d$/);

  const porzucane = await page.evaluate(async () => (await window.VildaVault._eventLog.outboxList()).wiersze
    .filter((w) => w.state === 'rejected').map((w) => w.kind + '|' + w.entityKey));
  expect(porzucane).toHaveLength(stan.rejected);
  // „Porzuć” — Anuluj bez skutku, potem potwierdzenie dla każdego wiersza.
  await wlasne.first().getByRole('button').click();
  let arkusz = page.getByRole('alertdialog', { name: 'Porzucić tę zmianę?' });
  await expect(arkusz).toBeVisible();
  await expect(arkusz.getByRole('button', { name: 'Anuluj' })).toBeFocused();
  await arkusz.getByRole('button', { name: 'Anuluj' }).click();
  await expect(wlasne).toHaveCount(stan.rejected);
  for (let i = stan.rejected; i > 0; i--) {
    await wlasne.first().getByRole('button').click();
    await page.getByRole('alertdialog', { name: 'Porzucić tę zmianę?' }).getByRole('button', { name: 'Porzuć' }).click();
    await expect(wlasne).toHaveCount(i - 1);
  }
  await expect(page.locator('#syncProblemsOwn')).toBeHidden();

  // „Zwolnij” — ostrzeżenie o niepełnej karcie, potwierdzenie.
  await obce.first().getByRole('button', { name: 'Zwolnij: Zdarzenie nr 7' }).click();
  arkusz = page.getByRole('alertdialog', { name: 'Zwolnić to zdarzenie?' });
  await expect(arkusz).toContainText('karta pacjenta na tym urządzeniu może być niepełna albo może jej brakować');
  await arkusz.getByRole('button', { name: 'Zwolnij' }).click();
  await expect(box).toBeHidden();
  const po = await page.evaluate(async () => {
    const L = window.VildaVault._eventLog;
    return { c: await L.outboxCount(), q: await L.quarantineCount() };
  });
  expect(po.c).toMatchObject({ rejected: 0, total: 0 });
  expect(po.q).toMatchObject({ ok: true, total: 0 });

  // Przeładowanie strony (nowy dokument, przegląd przy odblokowaniu) i jawny przegląd: porzucone zmiany nie wracają.
  // Sprawdzane są tylko encje porzuconych wierszy — przyjęta wcześniej zmiana innej encji może wrócić (ograniczenie
  // w ALGORITHMS, P-DZIENNIK-ZDARZEN, E2-PR5c).
  await otworzUstawienia(page, userId);
  const poPrzeladowaniu = await page.evaluate(async () => {
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const sw = await L.sweepOutbox();
    await L.emissionsSettled();
    return { sw, klucze: (await L.outboxList()).wiersze.map((w) => w.kind + '|' + w.entityKey) };
  });
  expect(poPrzeladowaniu.sw).toMatchObject({ ok: true });
  expect(poPrzeladowaniu.klucze.filter((k) => porzucane.includes(k)), 'porzucone zmiany po przeładowaniu').toEqual([]);
  expect(naruszenia(atrapa)).toEqual([]);
});

const pelneWysylki = (atrapa, u) => atrapa.zadania.filter((z) => z.trasa === 'blob-put' && z.urzadzenie === u && z.status === 200).length;
const zapiszKarteINotatke = (page, imie) => page.evaluate(async (n) => {
  const p = await window.VildaVault.savePatient({
    name: `Testowa ${n}`,
    user: { lastName: 'Testowa', firstName: n, sex: 'F', age: 9, ageMonths: 4, height: 133, weight: 29 },
  }, { dedup: false });
  await window.VildaVault.savePatientNote({ patientId: p.patientId, title: `Fikcyjna notatka ${n}`, body: 'Fikcyjna treść.', category: 'inne' });
  await window.VildaVault._eventLog.emissionsSettled();
  return p.patientId;
}, imie);
const stanKart = (page) => page.evaluate(async () => {
  const karty = (await window.VildaVault.listPatients()).map((p) => p.patientId).sort();
  const notatki = [];
  for (const id of karty) {
    for (const n of await window.VildaVault.listPatientNotesForPatient(id)) notatki.push([id, n.title, n.body].join('|'));
  }
  return { karty, notatki: notatki.sort() };
});

test('E2-PR6: bez klucza flagi — dwa urządzenia, PUT /blob urządzenia A zablokowany: nowa karta i notatka z A docierają do B samymi zdarzeniami', async ({ page, context, browser }) => {
  test.setTimeout(150_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, null);
  expect(await page.evaluate(() => [window.localStorage.getItem('vilda-event-log-v1'), window.VildaSync.isEventLogEnabled()])).toEqual([null, true]);
  const { ctxB, pageB, log } = await drugieUrzadzenie(browser, context, atrapa, userId);
  try {
    expect(log, 'B bez klucza flagi: dziennik włączony').toBe(true);
    atrapa.usterka({ gdy: { trasa: 'blob-put', urzadzenie: 'strona', ile: 100 }, kod: 'r2_error' });
    const pelnePrzed = pelneWysylki(atrapa, 'strona');
    const przed = zadaniaEvents(atrapa).length;
    const pid = await zapiszKarteINotatke(page, 'Ewa');
    await expect.poll(() => zadaniaEvents(atrapa).length, { timeout: 15_000 }).toBeGreaterThan(przed);
    await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
    // Pełna wysyłka A idzie jak dotąd (tu wywołana wprost) i dostaje błąd serwera.
    await page.evaluate(() => window.VildaSync.syncPush().catch(() => null));
    expect(atrapa.zadania.filter((z) => z.trasa === 'blob-put' && z.urzadzenie === 'strona').length, 'pełna wysyłka A próbowała').toBeGreaterThan(0);
    expect(pelneWysylki(atrapa, 'strona'), 'bez udanej pełnej wysyłki A').toBe(pelnePrzed);
    expect(atrapa.zadania.filter((z) => z.trasa === 'delta'), 'bez POST /delta').toEqual([]);
    await pageB.evaluate(() => window.VildaSync.syncPull({ czekajNaDrenaz: true }));
    const b = await pageB.evaluate(async (p) => ({
      karta: Boolean(await window.VildaVault.getPatient(p)),
      notatki: (await window.VildaVault.listPatientNotesForPatient(p)).map((n) => n.title),
    }), pid);
    expect(b).toEqual({ karta: true, notatki: ['Fikcyjna notatka Ewa'] });
    expect(naruszenia(atrapa)).toEqual([]);
  } finally {
    await ctxB.close();
  }
});

test('E2-PR6: bez klucza flagi — dwa urządzenia, PUT /blob liczony: po zdarzeniach i pełnej wysyłce A urządzenie B ma te same karty i notatki co A', async ({ page, context, browser }) => {
  test.setTimeout(150_000);
  const { atrapa, userId } = await przygotujNadawce(page, context, null);
  const { ctxB, pageB, log } = await drugieUrzadzenie(browser, context, atrapa, userId);
  try {
    expect(log, 'B bez klucza flagi: dziennik włączony').toBe(true);
    const pelnePrzed = pelneWysylki(atrapa, 'strona');
    const przed = zadaniaEvents(atrapa).length;
    await zapiszKarteINotatke(page, 'Ewa');
    await zapiszKarteINotatke(page, 'Ola');
    await expect.poll(() => zadaniaEvents(atrapa).length, { timeout: 15_000 }).toBeGreaterThan(przed);
    await expect.poll(() => page.evaluate(async () => (await window.VildaVault._eventLog.outboxCount()).total), { timeout: 15_000 }).toBe(0);
    expect((await page.evaluate(() => window.VildaSync.syncPush())).action, 'pełna wysyłka A').toBeTruthy();
    expect(pelneWysylki(atrapa, 'strona'), 'pełna wysyłka A liczona').toBeGreaterThan(pelnePrzed);
    await pageB.evaluate(() => window.VildaSync.syncPull({ czekajNaDrenaz: true }));
    const [sa, sb] = [await stanKart(page), await stanKart(pageB)];
    expect(sa.karty).toHaveLength(2);
    expect(sa.notatki).toHaveLength(2);
    expect(sb, 'zbieżność A i B').toEqual(sa);
    expect(naruszenia(atrapa)).toEqual([]);
  } finally {
    await ctxB.close();
  }
});
