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
