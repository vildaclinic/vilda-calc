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
// 3) E3-PR0c (odsyłanie poprawionych wizyt, uśpione przełącznikiem): klucz vilda-event-echo-v1 = '1' ustawiony przed
//    załadowaniem, dziennik włączony (vilda-event-log-v1 = '1'). A: karta „Testowy Jan” z wizytą v 24 kg, rejestracja,
//    rozruch drenażu; B — drugi kontekst z kopią profilu A (storageState z IndexedDB, bez synchronizacji) poprawia v na
//    17,2 kg — koperta snap B (builder i szyfrowanie zdarzenia); A daje v gwiazdkę i opróżnia kolejkę (outboxTake,
//    outboxAccept); koperta B w dzienniku atrapy; A: drenaż (syncPull z czekaniem na drenaż; prawdziwy kursor
//    i kwarantanna) i emissionsSettled — w kolejce A dokładnie jeden wiersz snap P/v pending z rekordem złożonym
//    (17,2 kg z gwiazdką); B stosuje kopertę echa (applyEncryptedEvent przy otwartej bramce i kluczu '1') — v na B
//    17,2 kg z gwiazdką, kolejka B bez nowego wiersza.
// 4) Bez klucza: ten sam przebieg — w kolejce A po drenażu bez wiersza snap (rekord złożony tylko na A, jak dziś).
//    Wiersze innych encji, które przegląd kolejki po drenażu dokłada (np. cred), są poza tymi przypadkami.
// 5) E3-PR0d (odsyłanie wpisów Kosza, ten sam przełącznik): A — karta „Testowy Jan” z wizytami v (24 kg) i w (25 kg),
//    rejestracja, rozruch drenażu; B (kopia profilu A, bez synchronizacji) daje v gwiazdkę — koperta snap B; A daje v do
//    Kosza (później) i opróżnia kolejkę. Drenaż A z kluczem '1': w kolejce A dokładnie jeden wiersz stomb v pending
//    (wpis Kosza z gwiazdką i treścią); A: v w Koszu z gwiazdką; B (klucz '1' z kopii profilu — sprawdzany) stosuje
//    kopertę wpisu — v w Koszu B z gwiazdką, bez nowego wiersza stomb.
// 6) Bez klucza: ten sam drenaż — gwiazdka wpisu Kosza tylko na A, w kolejce A bez wiersza stomb.
// 7) E3-PR0d2 (odsyłanie ukrytego wpisu Kosza karty usuniętej, ten sam przełącznik): A — karta „Testowy Jan” z wizytami
//    v (24 kg) i w (25 kg), rejestracja, rozruch drenażu; B (kopia profilu A, bez synchronizacji) daje v do Kosza —
//    koperta stomb B, drenaż A (A: wpis Kosza v); B „Przywróć” v — koperta snap B; A „Usuń pacjenta” (nagrobek karty
//    w kolejce A). Po „Usuń pacjenta” pobranie A w tej uprzęży wraca do trybu od zera (since0-legacy, bez drenażu
//    stronami), więc kopertę snap B A stosuje przez applyEncryptedEvent z kluczem '1' — tę samą funkcję, którą woła
//    drenaż: karta P przegrywa z nagrobkiem, wersja nie wchodzi, wpis Kosza zostaje ukryty — w kolejce A za nagrobkiem
//    karty dokładnie jeden wiersz stomb v pending (wpis 24 kg z treścią, koperta bez kart); B stosuje nagrobek karty
//    i ten wiersz: karta usunięta, wpis ukryty, bez nowego wiersza stomb.
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

// ── E3-PR0c: odsyłanie poprawionych wizyt po drenażu ─────────────────────────────────────────────────────────────────
async function przygotujOdsylanie(page, context, browser, klucz) {
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, originy: [ORIGIN], zegar: () => Date.now() });
  await podlaczAtrapeDoKontekstu(context, atrapa);
  await page.addInitScript((k) => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vilda-sync-enabled-v1', 'false');
      window.localStorage.setItem('vilda-event-log-v1', '1');
      if (k !== null) window.localStorage.setItem('vilda-event-echo-v1', k);
    } catch (_) { /* brak storage — pomiń */ }
  }, klucz);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const userId = (await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO)).userId;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaSync && window.VildaSync.detectApi));
  const start = await page.evaluate(async () => {
    window.VILDA_EVENT_LOG = true; // koperta rozruchu z kolejki tej strony (przed pierwszym health z „events”)
    const r = await window.VildaVault.savePatient({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    }, { dedup: false });
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const take = await L.outboxTake();
    const env = take.ok && take.wiersze.length ? take.wiersze[0].env : null;
    if (take.ok) await L.outboxAccept(take.wiersze.map((w) => w.eid));
    delete window.VILDA_EVENT_LOG;
    const push = await window.VildaSync.syncPush();
    const api = await window.VildaSync.detectApi();
    return { env, P: r.patientId, v: r.snapshotId, push: push.action, features: api.features, log: window.VildaSync.isEventLogEnabled() };
  });
  expect(start.push).toBe('registered');
  expect(start.features).toContain('events');
  expect(start.log, 'A: dziennik włączony').toBe(true);
  atrapa.dopisz({ src: 'ev', payload: { iv: start.env.iv, data: start.env.data } });
  const r0 = await page.evaluate(async () => { const w = await window.VildaSync.syncPull({ czekajNaDrenaz: true }); return w.drain && w.drain.stop; });
  expect(r0).toBe('since0-legacy');
  // B: kopia profilu A po rozruchu (bez synchronizacji); poprawka v i koperta snap B.
  const stan = await context.storageState({ indexedDB: true });
  const ctxB = await browser.newContext({ storageState: stan, serviceWorkers: 'block' });
  const pageB = await ctxB.newPage();
  await pageB.goto('/index.html', { waitUntil: 'load' });
  await pageB.waitForFunction(() => Boolean(window.VildaVault));
  const envB = await pageB.evaluate(async ([u, pw, P, v]) => {
    if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(u, pw);
    const s = (await window.VildaVault.getPatient(P)).snapshots.find((x) => x.snapshotId === v);
    await window.VildaVault.updateSnapshotPayload(P, v, { ...s.payload, user: { ...s.payload.user, weight: 17.2 } }, { preserveSavedAt: true });
    const L = window.VildaVault._eventLog;
    return (await L.encryptEvent(await L.buildSnapshotEvent(P, v, null))).env;
  }, [userId, HASLO, start.P, start.v]);
  // A: gwiazdka v (wiersz gwiazdki z kolejki — wysłany), potem koperta B w dzienniku atrapy.
  const pusta = await page.evaluate(async ([P, v]) => {
    await window.VildaVault.setSnapshotPinned(P, v, true);
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const take = await L.outboxTake();
    if (take.ok && take.wiersze.length) await L.outboxAccept(take.wiersze.map((w) => w.eid));
    return (await L.outboxCount()).total;
  }, [start.P, start.v]);
  expect(pusta, 'A: kolejka pusta przed drenażem').toBe(0);
  atrapa.dopisz({ src: 'ev', payload: { iv: envB.iv, data: envB.data } });
  return { atrapa, ctxB, pageB, ...start };
}
async function drenazA(page, P, v) {
  return page.evaluate(async ([pid, sid]) => {
    const r = await window.VildaSync.syncPull({ czekajNaDrenaz: true });
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const lista = await L.outboxList();
    const wiersze = [];
    // wiersze snap (przegląd kolejki po drenażu dokłada też wiersze innych encji, np. cred — poza tym przypadkiem)
    for (const w of lista.ok ? lista.wiersze.filter((x) => x.kind === 'snap') : []) {
      const k = await window.VildaVault.decryptPayloadForCurrentUser(w.env.iv, w.env.data);
      const s = k.patients && k.patients[0] && k.patients[0].snapshots[0];
      wiersze.push({ kind: w.kind, klucz: w.entityKey === `${pid}/${sid}` ? 'P/v' : w.entityKey, stan: w.state, masa: s ? s.payload.user.weight : null, gwiazdka: !!(s && s.payload._pinned), env: { iv: w.env.iv, data: w.env.data } });
    }
    const s = (await window.VildaVault.getPatient(pid)).snapshots.find((x) => x.snapshotId === sid);
    return { drain: r.drain, wiersze, v: { masa: s.payload.user.weight, gwiazdka: !!s.payload._pinned } };
  }, [P, v]);
}

test("E3-PR0c: vilda-event-echo-v1 = '1' — drenaż zdarzenia z poprawką B składa rekord złożony na A: jeden wiersz snap P/v (17,2 kg z gwiazdką) w kolejce A; B przyjmuje go bez nowego wiersza", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const s = await przygotujOdsylanie(page, context, browser, '1');
  try {
    const a = await drenazA(page, s.P, s.v);
    expect(a.drain).toMatchObject({ tryb: 'strony', dziennik: true, zastosowane: 1 });
    expect(a.v, 'A: rekord złożony').toEqual({ masa: 17.2, gwiazdka: true });
    expect(a.wiersze.map(({ env: _e, ...w }) => w), 'kolejka A: wiersz echa').toEqual([{ kind: 'snap', klucz: 'P/v', stan: 'pending', masa: 17.2, gwiazdka: true }]);
    const b = await s.pageB.evaluate(async ([env, P, v]) => {
      window.VILDA_EVENT_LOG = true;
      const L = window.VildaVault._eventLog;
      const snapy = async () => { const l = await L.outboxList(); return l.ok ? l.wiersze.filter((x) => x.kind === 'snap').length : -1; };
      const przed = await snapy();
      const r = await L.applyEncryptedEvent(env);
      await L.emissionsSettled();
      const s = (await window.VildaVault.getPatient(P)).snapshots.find((x) => x.snapshotId === v);
      return { status: r.status, v: { masa: s.payload.user.weight, gwiazdka: !!s.payload._pinned }, nowe: (await snapy()) - przed };
    }, [a.wiersze[0].env, s.P, s.v]);
    expect(b, 'B: przyjęty rekord złożony, bez echa').toEqual({ status: 'applied', v: { masa: 17.2, gwiazdka: true }, nowe: 0 });
    expect(naruszenia(s.atrapa)).toEqual([]);
  } finally { await s.ctxB.close(); }
});

test('E3-PR0c: bez klucza vilda-event-echo-v1 — ten sam drenaż: rekord złożony tylko na A, w kolejce A bez wiersza snap (jak dziś)', async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const s = await przygotujOdsylanie(page, context, browser, null);
  try {
    const a = await drenazA(page, s.P, s.v);
    expect(a.drain).toMatchObject({ tryb: 'strony', dziennik: true, zastosowane: 1 });
    expect(a.v, 'A: rekord złożony').toEqual({ masa: 17.2, gwiazdka: true });
    expect(a.wiersze, 'kolejka A bez wierszy snap').toEqual([]);
    expect(naruszenia(s.atrapa)).toEqual([]);
  } finally { await s.ctxB.close(); }
});

// ── E3-PR0d: odsyłanie wpisów Kosza po drenażu ────────────────────────────────────────────────────────────────────
async function przygotujOdsylanieKosza(page, context, browser, klucz) {
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, originy: [ORIGIN], zegar: () => Date.now() });
  await podlaczAtrapeDoKontekstu(context, atrapa);
  await page.addInitScript((k) => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vilda-sync-enabled-v1', 'false');
      window.localStorage.setItem('vilda-event-log-v1', '1');
      if (k !== null) window.localStorage.setItem('vilda-event-echo-v1', k);
    } catch (_) { /* brak storage — pomiń */ }
  }, klucz);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const userId = (await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO)).userId;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaSync && window.VildaSync.detectApi));
  const start = await page.evaluate(async () => {
    window.VILDA_EVENT_LOG = true; // koperta rozruchu z kolejki tej strony (przed pierwszym health z „events”)
    const naglowek = (masa) => ({ name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: masa } });
    const r = await window.VildaVault.savePatient(naglowek(24), { dedup: false });
    const r2 = await window.VildaVault.savePatient(naglowek(25), { dedup: false, patientId: r.patientId });
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const take = await L.outboxTake();
    const env = take.ok && take.wiersze.length ? take.wiersze[0].env : null;
    if (take.ok) await L.outboxAccept(take.wiersze.map((w) => w.eid));
    delete window.VILDA_EVENT_LOG;
    const push = await window.VildaSync.syncPush();
    const api = await window.VildaSync.detectApi();
    return { env, P: r.patientId, v: r.snapshotId, w: r2.snapshotId, push: push.action, features: api.features, log: window.VildaSync.isEventLogEnabled() };
  });
  expect(start.push).toBe('registered');
  expect(start.features).toContain('events');
  expect([start.log, start.v !== start.w], 'A: dziennik włączony, dwie wizyty karty').toEqual([true, true]);
  atrapa.dopisz({ src: 'ev', payload: { iv: start.env.iv, data: start.env.data } });
  const r0 = await page.evaluate(async () => { const w = await window.VildaSync.syncPull({ czekajNaDrenaz: true }); return w.drain && w.drain.stop; });
  expect(r0).toBe('since0-legacy');
  // B: kopia profilu A po rozruchu (bez synchronizacji); gwiazdka v i koperta snap B.
  const stan = await context.storageState({ indexedDB: true });
  const ctxB = await browser.newContext({ storageState: stan, serviceWorkers: 'block' });
  const pageB = await ctxB.newPage();
  await pageB.goto('/index.html', { waitUntil: 'load' });
  await pageB.waitForFunction(() => Boolean(window.VildaVault));
  const envB = await pageB.evaluate(async ([u, pw, P, v]) => {
    if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(u, pw);
    await window.VildaVault.setSnapshotPinned(P, v, true);
    const L = window.VildaVault._eventLog;
    return (await L.encryptEvent(await L.buildSnapshotEvent(P, v, null))).env;
  }, [userId, HASLO, start.P, start.v]);
  // A: v do Kosza (później niż gwiazdka B; wiersz Kosza z kolejki — wysłany), potem koperta B w dzienniku atrapy.
  const pusta = await page.evaluate(async ([P, v]) => {
    await window.VildaVault.moveSnapshotToTrash(P, v);
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const take = await L.outboxTake();
    if (take.ok && take.wiersze.length) await L.outboxAccept(take.wiersze.map((w) => w.eid));
    return (await L.outboxCount()).total;
  }, [start.P, start.v]);
  expect(pusta, 'A: kolejka pusta przed drenażem').toBe(0);
  atrapa.dopisz({ src: 'ev', payload: { iv: envB.iv, data: envB.data } });
  return { atrapa, ctxB, pageB, ...start };
}
// Wiersze stomb kolejki strony (wpisy koperty: masa, gwiazdka rejestru, z treścią) i wiersz okna Kosza wersji v.
async function koszStrony(page, v) {
  return page.evaluate(async (sid) => {
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const lista = await L.outboxList();
    const wiersze = [];
    for (const w of lista.ok ? lista.wiersze.filter((x) => x.kind === 'stomb') : []) {
      const k = await window.VildaVault.decryptPayloadForCurrentUser(w.env.iv, w.env.data);
      const wpisy = (k.snapshotTombstones || []).map((e) => ({ masa: e.payload ? e.payload.user.weight : null, gwiazdka: !!(e.gwiazdka && e.gwiazdka.pin), tresc: !!e.payload }));
      wiersze.push({ kind: w.kind, klucz: w.entityKey === sid ? 'v' : w.entityKey, stan: w.state, wpisy, env: { iv: w.env.iv, data: w.env.data } });
    }
    const kosz = (await window.VildaVault.listTrashedSnapshots()).filter((e) => e.snapshotId === sid).map((e) => ({ masa: e.payload.user.weight, gwiazdka: e.pinned }));
    return { wiersze, kosz };
  }, v);
}

test("E3-PR0d: vilda-event-echo-v1 = '1' — drenaż koperty z gwiazdką drugiego kontekstu przy wizycie w Koszu A: w kolejce A jeden wiersz stomb v z gwiazdką; B przyjmuje go bez nowego wiersza", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const s = await przygotujOdsylanieKosza(page, context, browser, '1');
  try {
    const d = await page.evaluate(async () => (await window.VildaSync.syncPull({ czekajNaDrenaz: true })).drain);
    expect(d).toMatchObject({ tryb: 'strony', dziennik: true, zastosowane: 1 });
    const a = await koszStrony(page, s.v);
    expect(a.kosz, 'A: v w Koszu z gwiazdką').toEqual([{ masa: 24, gwiazdka: true }]);
    expect(a.wiersze.map(({ env: _e, ...w }) => w), 'kolejka A: wiersz odsyłania wpisu').toEqual([{ kind: 'stomb', klucz: 'v', stan: 'pending', wpisy: [{ masa: 24, gwiazdka: true, tresc: true }] }]);
    const b = await s.pageB.evaluate(async ([env, v]) => {
      window.VILDA_EVENT_LOG = true;
      const L = window.VildaVault._eventLog;
      const stomby = async () => { const l = await L.outboxList(); return l.ok ? l.wiersze.filter((x) => x.kind === 'stomb').length : -1; };
      const przed = await stomby();
      const r = await L.applyEncryptedEvent(env);
      await L.emissionsSettled();
      const kosz = (await window.VildaVault.listTrashedSnapshots()).filter((e) => e.snapshotId === v).map((e) => ({ masa: e.payload.user.weight, gwiazdka: e.pinned }));
      return { klucz: window.localStorage.getItem('vilda-event-echo-v1'), status: r.status, kosz, nowe: (await stomby()) - przed };
    }, [a.wiersze[0].env, s.v]);
    expect(b, 'B: przełącznik odsyłania włączony (klucz z profilu A), v w Koszu z gwiazdką, bez odsyłania').toEqual({ klucz: '1', status: 'applied', kosz: [{ masa: 24, gwiazdka: true }], nowe: 0 });
    expect(naruszenia(s.atrapa)).toEqual([]);
  } finally { await s.ctxB.close(); }
});

test('E3-PR0d: bez klucza vilda-event-echo-v1 — ten sam drenaż: gwiazdka wpisu Kosza tylko na A, w kolejce A bez wiersza stomb (jak dziś)', async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const s = await przygotujOdsylanieKosza(page, context, browser, null);
  try {
    const d = await page.evaluate(async () => (await window.VildaSync.syncPull({ czekajNaDrenaz: true })).drain);
    expect(d).toMatchObject({ tryb: 'strony', dziennik: true, zastosowane: 1 });
    const a = await koszStrony(page, s.v);
    expect(a.kosz, 'A: v w Koszu z gwiazdką').toEqual([{ masa: 24, gwiazdka: true }]);
    expect(a.wiersze, 'kolejka A bez wierszy stomb').toEqual([]);
    expect(naruszenia(s.atrapa)).toEqual([]);
  } finally { await s.ctxB.close(); }
});

// ── E3-PR0d2: odsyłanie ukrytego wpisu Kosza karty usuniętej po drenażu ─────────────────────────────────────────────
async function przygotujUkrytyWpis(page, context, browser) {
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: true, originy: [ORIGIN], zegar: () => Date.now() });
  await podlaczAtrapeDoKontekstu(context, atrapa);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vilda-sync-enabled-v1', 'false');
      window.localStorage.setItem('vilda-event-log-v1', '1');
      window.localStorage.setItem('vilda-event-echo-v1', '1');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const userId = (await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO)).userId;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaSync && window.VildaSync.detectApi));
  const start = await page.evaluate(async () => {
    window.VILDA_EVENT_LOG = true; // koperta rozruchu z kolejki tej strony (przed pierwszym health z „events”)
    const naglowek = (masa) => ({ name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: masa } });
    const r = await window.VildaVault.savePatient(naglowek(24), { dedup: false });
    const r2 = await window.VildaVault.savePatient(naglowek(25), { dedup: false, patientId: r.patientId });
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const take = await L.outboxTake();
    const env = take.ok && take.wiersze.length ? take.wiersze[0].env : null;
    if (take.ok) await L.outboxAccept(take.wiersze.map((w) => w.eid));
    delete window.VILDA_EVENT_LOG;
    const push = await window.VildaSync.syncPush();
    const api = await window.VildaSync.detectApi();
    return { env, P: r.patientId, v: r.snapshotId, w: r2.snapshotId, push: push.action, features: api.features, log: window.VildaSync.isEventLogEnabled() };
  });
  expect(start.push).toBe('registered');
  expect(start.features).toContain('events');
  expect([start.log, start.v !== start.w], 'A: dziennik włączony, dwie wizyty karty').toEqual([true, true]);
  atrapa.dopisz({ src: 'ev', payload: { iv: start.env.iv, data: start.env.data } });
  const r0 = await page.evaluate(async () => { const w = await window.VildaSync.syncPull({ czekajNaDrenaz: true }); return w.drain && w.drain.stop; });
  expect(r0).toBe('since0-legacy');
  // B: kopia profilu A po rozruchu (bez synchronizacji); v do Kosza — koperta stomb B.
  const stan = await context.storageState({ indexedDB: true });
  const ctxB = await browser.newContext({ storageState: stan, serviceWorkers: 'block' });
  const pageB = await ctxB.newPage();
  await pageB.goto('/index.html', { waitUntil: 'load' });
  await pageB.waitForFunction(() => Boolean(window.VildaVault));
  const envKosz = await pageB.evaluate(async ([u, pw, P, v]) => {
    if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(u, pw);
    await window.VildaVault.moveSnapshotToTrash(P, v, { odepnij: true });
    const L = window.VildaVault._eventLog;
    return (await L.encryptEvent(await L.buildSnapshotTombstoneEvent(v, null))).env;
  }, [userId, HASLO, start.P, start.v]);
  atrapa.dopisz({ src: 'ev', payload: { iv: envKosz.iv, data: envKosz.data } });
  const d1 = await page.evaluate(async () => (await window.VildaSync.syncPull({ czekajNaDrenaz: true })).drain);
  expect(d1, 'A: drenaż koperty Kosza B').toMatchObject({ tryb: 'strony', dziennik: true, zastosowane: 1 });
  // B „Przywróć” v (później niż Kosz) — koperta snap B; A potem „Usuń pacjenta”.
  const envSnap = await pageB.evaluate(async ([P, v]) => {
    await window.VildaVault.restoreTrashedSnapshot(P, v);
    const L = window.VildaVault._eventLog;
    return (await L.encryptEvent(await L.buildSnapshotEvent(P, v, null))).env;
  }, [start.P, start.v]);
  const usun = await page.evaluate(async ([P, v]) => {
    const kosz = (await window.VildaVault.listTrashedSnapshots()).filter((e) => e.snapshotId === v).map((e) => e.payload.user.weight);
    await window.VildaVault.removePatient(P);
    const L = window.VildaVault._eventLog;
    await L.emissionsSettled();
    const lista = await L.outboxList();
    return { kosz, wiersze: lista.ok ? lista.wiersze.filter((x) => x.kind === 'ptomb' || x.kind === 'stomb').map((x) => [x.kind, x.entityKey === P ? 'P' : x.entityKey === v ? 'v' : x.entityKey, x.state]) : null };
  }, [start.P, start.v]);
  expect(usun, 'A po „Usuń pacjenta”: wpis Kosza v (24 kg), w kolejce nagrobek karty P').toEqual({ kosz: [24], wiersze: [['ptomb', 'P', 'pending']] });
  return { atrapa, ctxB, pageB, envSnap, ...start };
}

test("E3-PR0d2: vilda-event-echo-v1 = '1' — koperta „Przywróć” drugiego kontekstu zastosowana po „Usuń pacjenta” na A: w kolejce A za nagrobkiem karty jeden wiersz stomb v z treścią; B przyjmuje go jako ukryty wpis bez nowego wiersza", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const s = await przygotujUkrytyWpis(page, context, browser);
  try {
    const a = await page.evaluate(async ([P, v, env]) => {
      const L = window.VildaVault._eventLog;
      const status = (await L.applyEncryptedEvent(env)).status;
      await L.emissionsSettled();
      const lista = await L.outboxList();
      const wiersze = [];
      for (const w of lista.ok ? lista.wiersze.filter((x) => x.kind === 'ptomb' || x.kind === 'stomb') : []) {
        const k = await window.VildaVault.decryptPayloadForCurrentUser(w.env.iv, w.env.data);
        const wpisy = (k.snapshotTombstones || []).map((e) => ({ karta: e.patientId === P ? 'P' : e.patientId, masa: e.payload ? e.payload.user.weight : null, tresc: !!e.payload }));
        wiersze.push({ kind: w.kind, klucz: w.entityKey === P ? 'P' : w.entityKey === v ? 'v' : w.entityKey, stan: w.state, wpisy, karty: (k.patients || []).length, env: { iv: w.env.iv, data: w.env.data } });
      }
      const wpis = ((await window.VildaVault.exportSyncPayload()).snapshotTombstones || []).filter((e) => e.snapshotId === v).map((e) => ({ karta: e.patientId === P ? 'P' : e.patientId, masa: e.payload ? e.payload.user.weight : null }));
      return { status, karta: !!(await window.VildaVault.getPatient(P)), wpis, wiersze };
    }, [s.P, s.v, s.envSnap]);
    expect({ status: a.status, karta: a.karta, wpis: a.wpis }, 'A: zastosowane, karta P usunięta, wpis Kosza v ukryty').toEqual({ status: 'applied', karta: false, wpis: [{ karta: 'P', masa: 24 }] });
    expect(a.wiersze.map(({ env: _e, ...w }) => w), 'kolejka A: nagrobek karty, za nim odesłanie ukrytego wpisu').toEqual([
      { kind: 'ptomb', klucz: 'P', stan: 'pending', wpisy: [], karty: 0 },
      { kind: 'stomb', klucz: 'v', stan: 'pending', wpisy: [{ karta: 'P', masa: 24, tresc: true }], karty: 0 },
    ]);
    const b = await s.pageB.evaluate(async ([envy, P, v]) => {
      window.VILDA_EVENT_LOG = true;
      const L = window.VildaVault._eventLog;
      const stomby = async () => { const l = await L.outboxList(); return l.ok ? l.wiersze.filter((x) => x.kind === 'stomb').length : -1; };
      const przed = await stomby();
      const statusy = [];
      for (const env of envy) { statusy.push((await L.applyEncryptedEvent(env)).status); await L.emissionsSettled(); }
      const wpis = ((await window.VildaVault.exportSyncPayload()).snapshotTombstones || []).filter((e) => e.snapshotId === v).map((e) => ({ karta: e.patientId === P ? 'P' : e.patientId, masa: e.payload ? e.payload.user.weight : null }));
      return { klucz: window.localStorage.getItem('vilda-event-echo-v1'), statusy, karta: !!(await window.VildaVault.getPatient(P)), wpis, nowe: (await stomby()) - przed };
    }, [a.wiersze.map((w) => w.env), s.P, s.v]);
    expect(b, 'B: przełącznik włączony (klucz z profilu A), nagrobek karty i wpis zastosowane — karta usunięta, wpis ukryty, bez odsyłania').toEqual({ klucz: '1', statusy: ['applied', 'applied'], karta: false, wpis: [{ karta: 'P', masa: 24 }], nowe: 0 });
    expect(naruszenia(s.atrapa)).toEqual([]);
  } finally { await s.ctxB.close(); }
});
