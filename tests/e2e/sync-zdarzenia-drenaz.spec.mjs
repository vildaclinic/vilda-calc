import { expect, test } from '@playwright/test';
import { utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { podlaczAtrapeDoKontekstu } from '../support/atrapa-workera-route.mjs';

// E2-PR4c (P-SYNC-DRENAZ-ZDARZEN) — drenaż zdarzeń z kwarantanną na prawdziwej przeglądarce: prawdziwy sejf (kwarantanna
// w IndexedDB) i prawdziwe vilda_sync.js na „Komputerze prywatnym”, serwer synchronizacji to atrapa workera v37a
// (tests/support/atrapa-workera-sync.mjs) przez adapter route Playwright, z „events” w health. Synchronizacja
// automatyczna wyłączona (test woła VildaSync wprost). Wiersze dziennika dopisane do atrapy wprost: koperta zdarzenia
// z kolejki tej strony (outboxTake; poza pierścieniem własnych zdarzeń, bo nie przeszła przez pushEvents) oraz ta sama
// koperta z polem z (format nieznany tej wersji).
// 1) Flaga '1': rozruch (kursor 0 → jedno pobranie legacy), potem drenaż stronami — zdarzenie zastosowane przez
//    applyEncryptedEvent, nieczytelne w kwarantannie (IndexedDB), appliedUpTo = numer przed nim, markSyncCaughtUp.
// 2) Flaga '0' (wyłącznik na urządzeniu; do E2-PR6 — brak klucza): ten sam dziennik — drenaż jak dotąd: applyEncryptedDelta nie zna pola z, więc oba wiersze są
//    zastosowane; bez pól dziennika i nowych kluczy.
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Drenaz!26zd';
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
    window.VILDA_EVENT_LOG = true; // kopertę zdarzenia daje kolejka tej strony także przy fladze wyłączonej (tylko budowa wiersza)
    await window.VildaVault.savePatient({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    }, { dedup: false });
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const take = await L.outboxTake();
    const env = take.ok && take.wiersze.length ? take.wiersze[0].env : null;
    if (take.ok) await L.outboxAccept(take.wiersze.map((r) => r.eid));
    delete window.VILDA_EVENT_LOG;
    const push = await window.VildaSync.syncPush();
    const api = await window.VildaSync.detectApi();
    return { env, push: push.action, features: api.features };
  });
  expect(start.push).toBe('registered');
  expect(start.features).toContain('events');
  expect(start.env, 'koperta zdarzenia z kolejki').toBeTruthy();
  // rozruch: wiersz 1 i pobranie przy kursorze 0 (legacy) — dalej drenaż stronami
  atrapa.dopisz({ src: 'ev', payload: { iv: start.env.iv, data: start.env.data } });
  const r0 = await page.evaluate(async () => { const w = await window.VildaSync.syncPull({ czekajNaDrenaz: true }); return w.drain && w.drain.stop; });
  expect(r0).toBe('since0-legacy');
  const dobry = atrapa.dopisz({ src: 'ev', payload: { iv: start.env.iv, data: start.env.data } });
  const zly = atrapa.dopisz({ src: 'ev', payload: { iv: start.env.iv, data: start.env.data }, z: 'gzip' });
  return { atrapa, dobry, zly };
}
function naruszenia(atrapa) {
  atrapa.przyjmijNaruszenia((n) => n.rodzaj === 'trasa-poza-modelem' && /^GET \/v1\/slots\/<slot>\/(entitlement|trial) \(/.test(n.opis));
  return atrapa.naruszenia;
}

test("E2-PR4c: vilda-event-log-v1 = '1' — drenaż stronami: zdarzenie zastosowane, nieczytelne w kwarantannie IndexedDB, appliedUpTo przed nim, markSyncCaughtUp", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, dobry, zly } = await przygotuj(page, context, '1');
  const w = await page.evaluate(async () => {
    const r = await window.VildaSync.syncPull({ czekajNaDrenaz: true });
    const L = window.VildaVault._eventLog;
    const kw = await L.quarantineList();
    const slot = (await window.VildaVault.getSyncMaterial()).slotId;
    return {
      drain: r.drain,
      kw: kw.ok ? kw.wiersze.map((q) => ({ seq: q.seq, reason: q.reason, z: q.z, slotZgodny: q.slotId === slot })) : kw,
      applied: window.localStorage.getItem('vilda-sync-applied-v1:' + slot),
      kursor: window.localStorage.getItem('vilda-sync-cursor-v1:' + slot),
      lastMerge: (await window.VildaVault.exportSyncPayload()).lastMergeAtISO,
    };
  });
  expect(w.drain).toMatchObject({ tryb: 'strony', stop: 'head', dziennik: true, zastosowane: 1, kwarantanna: 1, nieczytelne: 1 });
  expect(w.kw).toEqual([{ seq: zly.seq, reason: 'format', z: 'gzip', slotZgodny: true }]);
  expect(w.applied).toBe(String(zly.seq - 1));
  expect(w.kursor).toBe(String(zly.seq));
  expect(dobry.seq).toBe(zly.seq - 1);
  expect(w.lastMerge, 'markSyncCaughtUp').toBeTruthy();
  expect(naruszenia(atrapa)).toEqual([]);
});

test("E2-PR4c: flaga '0' — ten sam dziennik: drenaż jak dotąd (applyEncryptedDelta bez pola z: oba wiersze zastosowane, bez pól dziennika), bez nowych kluczy", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { atrapa, zly } = await przygotuj(page, context, '0');
  const w = await page.evaluate(async () => {
    const r = await window.VildaSync.syncPull({ czekajNaDrenaz: true });
    const slot = (await window.VildaVault.getSyncMaterial()).slotId;
    const klucze = Object.keys(window.localStorage).filter((k) => /^vilda-sync-(own-eids|applied)-v1:/.test(k));
    return { drain: r.drain, klucze, kursor: window.localStorage.getItem('vilda-sync-cursor-v1:' + slot) };
  });
  expect(w.drain).toMatchObject({ tryb: 'strony', stop: 'head', zastosowane: 2, nieczytelne: 0 });
  expect(w.drain.dziennik).toBeUndefined();
  expect(w.klucze).toEqual([]);
  expect(w.kursor).toBe(String(zly.seq));
  expect(naruszenia(atrapa)).toEqual([]);
});
