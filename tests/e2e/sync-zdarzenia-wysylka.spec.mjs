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
