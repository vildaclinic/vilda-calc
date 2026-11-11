// P-SYNC-ZDARZENIA (E2-PR4b, plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.2 „Pętla wysyłki”, wiersz 8b): wysyłka zdarzeń
// dziennika (VildaSync.pushEvents → POST /v1/slots/<slot>/events) i włącznik dziennika (VildaSync.isEventLogEnabled,
// czytany przez bramkę kolejki sejfu). USPIONE: kod produkcyjny nie woła pushEvents (nadawca w E2-PR4d), a włącznik jest
// otwarty tylko przy „events” w health i fladze vilda-event-log-v1 = '1'.
//
// Prawdziwy vilda_sync.js i sejf (uprząż urządzeń), atrapa workera v37a z eventsEnabled (kontrakt events.js wzorca).
// Zegar atrapy = Date.now() urządzenia (+ przesunięcie w teście różnicy zegara). Dane wyłącznie FIKCYJNE.
//
// PE1 kształt żądania i 200 (dup przy powtórce); PE2 rejected oversize; PE3 429 → wspólna pauza, następne bez żądania;
// PE4 401 → AUTH_FAILED i stan slotu wyczyszczony; PE5 404 → włącznik zamknięty do następnego health; PE6 pozostałe
// statusy i sieć; PE7 treść wisi → TIMEOUT po 30 s; PE8 różnica zegara; PE9 jedno w locie; PE10 niezarejestrowany;
// PE11 złe wejście; PE12 sesja; PE13 tabela włącznika (bez „events” — bez odczytu magazynu); PE14 bramka sejfu;
// PE15 strażnik: nikt w produkcie nie woła pushEvents; PE16 trasa formatu klinicznego inna niż legacy → format.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tura, utworzAtrapeWorkera } from '../support/atrapa-workera-sync.mjs';
import { cisza, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const RL = 'vilda-sync-rl-until-v1';
const FLAGA = 'vilda-event-log-v1';

afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

const zdarzenie = (o = {}) => ({ eid: randomUUID(), iv: 'aXYtZmlrY3lqbmU=', data: 'ZGFuZS1maWtjeWpuZS0x', ...o });
async function wynikAlboWisi(p, ms = 1500) {
  const st = { v: null };
  p.then((w) => { st.v = { ok: true, w }; }, (e) => { st.v = { ok: false, e }; });
  const koniec = performance.now() + ms;
  while (!st.v && performance.now() < koniec) await tura();
  return st.v || 'wisi';
}

// Świat: A zarejestrowane z kartą 1, health w pamięci (detectApi), flaga dziennika według opcji.
async function swiat(o = {}) {
  if (o.timery) { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(T0); }
  const przes = o.przesuniecie || 0;
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: o.events !== false, zegar: () => Date.now() + przes, ...(o.atrapa || {}) });
  const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
  await A.zapiszKarte(1);
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza([A]);
  if (o.flaga !== null) A.win.localStorage.setItem(FLAGA, o.flaga === undefined ? '1' : o.flaga);
  await A.sync.detectApi();
  await cisza([A]);
  return { atrapa, A };
}
const zEvents = (s) => s.atrapa.zadania.filter((z) => z.trasa === 'events');
function podsluchFetch() {
  const ciala = [];
  const dalej = globalThis.fetch;
  vi.stubGlobal('fetch', (u, i) => { if (/\/events$/.test(String(u))) ciala.push({ i, cialo: JSON.parse(i.body) }); return dalej(u, i); });
  return ciala;
}

describe('P-SYNC-ZDARZENIA — pushEvents (POST /events)', () => {
  it('PE1 [czerwony na bazie]: POST z Bearer i application/json, na serwer tylko eid/iv/data; 200 → accepted z seq, powtórka tej samej partii → dup z tym samym seq', async () => {
    const s = await swiat();
    const ciala = podsluchFetch();
    const e1 = zdarzenie({ z: 'gzip', aad: 1, kind: 'snap' });
    const e2 = zdarzenie();
    const w = await s.A.sync.pushEvents([e1, e2]);
    expect(w.ok).toBe(true);
    expect(w.rejected).toEqual([]);
    expect(w.accepted.map((a) => [a.eid, a.dup])).toEqual([[e1.eid, false], [e2.eid, false]]);
    expect(w.accepted[1].seq).toBe(w.accepted[0].seq + 1);
    expect(w.headSeq).toBe(w.accepted[1].seq);
    expect(typeof w.ts).toBe('number');
    expect(ciala).toHaveLength(1);
    expect(ciala[0].i.method).toBe('POST');
    expect(ciala[0].i.headers).toEqual({ Authorization: expect.stringMatching(/^Bearer \S+$/), 'Content-Type': 'application/json' });
    expect(ciala[0].cialo).toEqual({ events: [{ eid: e1.eid, iv: e1.iv, data: e1.data }, { eid: e2.eid, iv: e2.iv, data: e2.data }] });
    const z = zEvents(s);
    expect(z.map((x) => `${x.metoda} ${x.status} ${x.naglowki.autoryzacja}`)).toEqual(['POST 200 bearer']);
    const w2 = await s.A.sync.pushEvents([e1, e2]);
    expect(w2.accepted).toEqual(w.accepted.map((a) => ({ ...a, dup: true })));
    expect(s.atrapa.slot(s.A.slotId).dz.head, 'powtórka bez nowych numerów').toBe(w.headSeq);
  });

  it('PE2 [czerwony na bazie]: zdarzenie ponad limit serwera → rejected oversize, reszta partii przyjęta', async () => {
    const s = await swiat({ atrapa: { limity: { eventBytes: 300 } } });
    const male = zdarzenie();
    const duze = zdarzenie({ data: 'x'.repeat(400) });
    const w = await s.A.sync.pushEvents([male, duze]);
    expect(w.ok).toBe(true);
    expect(w.accepted.map((a) => a.eid)).toEqual([male.eid]);
    expect(w.rejected).toEqual([{ eid: duze.eid, code: 'oversize' }]);
  });

  it('PE3 [czerwony na bazie]: 429 → Retry-After do wspólnej pauzy vilda-sync-rl-until-v1; następna próba w pauzie bez żądania; dłuższa pauza ustawiona w trakcie nie jest skracana', async () => {
    const s = await swiat({ timery: true });
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'rate_limited' });
    const w = await s.A.sync.pushEvents([zdarzenie()]);
    expect(w).toMatchObject({ ok: false, powod: 'odmowa', kod: 'RATE_LIMITED', http: 429 });
    expect(w.retryAfterMs).toBeGreaterThanOrEqual(1000);
    expect(Number(s.A.win.localStorage.getItem(RL))).toBe(Date.now() + w.retryAfterMs);
    const n = zEvents(s).length;
    const w2 = await s.A.sync.pushEvents([zdarzenie()]);
    expect(w2).toMatchObject({ ok: false, powod: 'pauza', kod: 'RATE_LIMITED' });
    expect(w2.retryAfterMs).toBeGreaterThan(0);
    expect(zEvents(s).length, 'w pauzie bez żądania').toBe(n);
    await vi.advanceTimersByTimeAsync(w.retryAfterMs + 1000);
    // Pełna wysyłka (integracja) ustawiła w tym czasie dłuższą pauzę: 429 z /events jej nie skraca.
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' }, { faza: 'po' });
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'rate_limited' });
    const p = s.A.sync.pushEvents([zdarzenie()]);
    await brama.osiagnieta;
    const dalej = Date.now() + 600000;
    s.A.win.localStorage.setItem(RL, String(dalej));
    brama.zwolnij();
    brama.rozbroj();
    expect((await p).kod).toBe('RATE_LIMITED');
    expect(Number(s.A.win.localStorage.getItem(RL)), 'najdalszy termin wygrywa').toBe(dalej);
  });

  it('PE4 [czerwony na bazie]: 401 → AUTH_FAILED, stan slotu wyczyszczony (registered false), jak przy innych 401', async () => {
    const s = await swiat();
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, status: 401, cialo: JSON.stringify({ error: { code: 'invalid_credentials' } }) }) });
    const w = await s.A.sync.pushEvents([zdarzenie()]);
    expect(w).toEqual({ ok: false, powod: 'odmowa', kod: 'AUTH_FAILED', http: 401 });
    expect((await s.A.sync.getSyncStatus()).registered).toBeFalsy();
  });

  it('PE5 [czerwony na bazie]: 404 (zdarzenia wyłączone na serwerze) → EVENTS_DISABLED, włącznik i bramka sejfu zamknięte do następnego health z „events”', async () => {
    const s = await swiat({ timery: true });
    expect(s.A.sync.isEventLogEnabled()).toBe(true);
    // Worker z EVENTS_ENABLED="0" nie ma trasy /events: 404 not_found jak każda nieznana trasa (nie naruszenie testu).
    s.atrapa.ustaw({ eventsEnabled: false, nieznanaTrasa: 'odpowiedz' });
    const w = await s.A.sync.pushEvents([zdarzenie()]);
    expect(w).toMatchObject({ ok: false, powod: 'odmowa', kod: 'EVENTS_DISABLED', http: 404 });
    expect(s.A.sync.isEventLogEnabled()).toBe(false);
    expect(s.A.vault._eventLog.gateOpen()).toBe(false);
    expect((await s.A.sync.pushEvents([zdarzenie()])).powod, 'następna próba bez żądania').toBe('wylaczone');
    s.atrapa.ustaw({ eventsEnabled: true });
    await vi.advanceTimersByTimeAsync(11 * 60e3);
    await s.A.sync.detectApi();
    expect(s.A.sync.isEventLogEnabled()).toBe(true);
    expect(s.A.vault._eventLog.gateOpen()).toBe(true);
  });

  it('PE6 [czerwony na bazie]: pozostałe odpowiedzi — 413, 415, 400 z kodem, 507, 503, 500, sieć, 200 z obcym eid albo bez JSON dają kody bez skutków ubocznych', async () => {
    const s = await swiat();
    const pr = () => s.A.sync.pushEvents([zdarzenie()]).then((w) => { expect(w.ok).toBe(false); return [w.powod, w.kod, w.http, w.code]; });
    s.atrapa.ustaw({ limity: { eventsBodyBytes: 50 } });
    expect(await pr()).toEqual(['odmowa', 'PAYLOAD_TOO_LARGE', 413, undefined]);
    s.atrapa.ustaw({ limity: { eventsBodyBytes: 1048576 } });
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, status: 415, cialo: JSON.stringify({ error: { code: 'unsupported_media_type' } }) }) });
    expect(await pr()).toEqual(['odmowa', 'UNSUPPORTED_MEDIA_TYPE', 415, undefined]);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, status: 400, cialo: JSON.stringify({ error: { code: 'invalid_events' } }) }) });
    expect(await pr()).toEqual(['odmowa', 'INVALID_EVENTS', 400, 'invalid_events']);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'log_full' });
    expect(await pr()).toEqual(['odmowa', 'LOG_FULL', 507, undefined]);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'hub_unavailable' });
    expect(await pr()).toEqual(['odmowa', 'SERVER', 503, undefined]);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'kv_error' });
    expect(await pr()).toEqual(['odmowa', 'SERVER', 500, undefined]);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, siec: true });
    expect(await pr()).toEqual(['siec', 'NETWORK', undefined, undefined]);
    // 200 z eid spoza partii albo bez JSON: odpowiedz (INVALID_RESPONSE), nic nie przyjęte.
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, cialo: JSON.stringify({ ok: true, accepted: [{ eid: randomUUID(), seq: 1, dup: false }], rejected: [], headSeq: 1, ts: Date.now() }) }) });
    expect(await pr()).toEqual(['odpowiedz', 'INVALID_RESPONSE', 200, undefined]);
    s.atrapa.usterka({ gdy: { trasa: 'events' }, zmien: (o) => ({ ...o, cialo: 'nie-json' }) });
    expect(await pr()).toEqual(['odpowiedz', 'INVALID_RESPONSE', 200, undefined]);
    expect(s.A.win.localStorage.getItem(RL)).toBeNull();
    expect((await s.A.sync.getSyncStatus()).registered).toBe(true);
    expect(s.A.sync.isEventLogEnabled()).toBe(true);
  });

  it('PE7 [czerwony na bazie]: treść odpowiedzi wisi — po 30 s TIMEOUT (żądanie przerwane); przed 30 s czeka; nagłówki nie przychodzą — po 30 s TIMEOUT', async () => {
    const s = await swiat({ timery: true });
    const u = s.atrapa.usterka({ gdy: { trasa: 'events' }, trescWisi: true });
    const p = s.A.sync.pushEvents([zdarzenie()]);
    await u.osiagnieta;
    for (let k = 0; k < 30; k++) await tura();
    try {
      await vi.advanceTimersByTimeAsync(29000);
      expect(await wynikAlboWisi(p, 300)).toBe('wisi');
      await vi.advanceTimersByTimeAsync(1500);
      const w = await wynikAlboWisi(p, 3000);
      expect(w.ok).toBe(true);
      expect(w.w).toEqual({ ok: false, powod: 'siec', kod: 'TIMEOUT', http: 200 });
      for (let k = 0; k < 20; k++) await tura();
      expect(s.atrapa.ruch('A').konsumpcje, 'połączenie zwolnione').toBe(0);
    } finally { u.zwolnij(); }
    // Nagłówki nie przychodzą (opóźnienie 40 s przed odpowiedzią): po 30 s TIMEOUT bez statusu.
    const u2 = s.atrapa.usterka({ gdy: { trasa: 'events' }, opoznienie: { ms: 40000 } });
    const p2 = s.A.sync.pushEvents([zdarzenie()]);
    await u2.osiagnieta;
    await vi.advanceTimersByTimeAsync(30500);
    const w2 = await wynikAlboWisi(p2, 3000);
    expect(w2.w).toEqual({ ok: false, powod: 'siec', kod: 'TIMEOUT' });
  });

  it('PE8 [czerwony na bazie]: ts serwera różni się od zegara urządzenia o ponad 60 s → vilda:sync-clock-skew (źródło server); do 60 s bez zdarzenia', async () => {
    for (const [przes, jest] of [[120000, true], [-90000, true], [45000, false]]) {
      try {
        const s = await swiat({ przesuniecie: przes });
        const detale = [];
        s.A.win.document.addEventListener('vilda:sync-clock-skew', (e) => detale.push(e.detail));
        const w = await s.A.sync.pushEvents([zdarzenie()]);
        expect(w.ok).toBe(true);
        if (!jest) { expect(detale, String(przes)).toEqual([]); continue; }
        expect(detale, String(przes)).toHaveLength(1);
        expect(detale[0]).toMatchObject({ warn: true, thresholdMs: 60000, source: 'server', serverTsISO: new Date(w.ts).toISOString() });
        expect(Math.abs(detale[0].offsetMs - przes)).toBeLessThan(2000);
      } finally { await sprzatnijUrzadzenia(); }
    }
  });

  it('PE9 [czerwony na bazie]: jedno żądanie w locie — druga próba w trakcie: w-locie bez żądania; po końcu pierwszej następna idzie', async () => {
    const s = await swiat();
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' });
    const p1 = s.A.sync.pushEvents([zdarzenie()]);
    await brama.osiagnieta;
    expect(await s.A.sync.pushEvents([zdarzenie()])).toEqual({ ok: false, powod: 'w-locie' });
    expect(zEvents(s)).toHaveLength(1);
    brama.zwolnij();
    expect((await p1).ok).toBe(true);
    brama.rozbroj();
    expect((await s.A.sync.pushEvents([zdarzenie()])).ok).toBe(true);
    expect(zEvents(s)).toHaveLength(2);
  });

  it('PE10 [czerwony na bazie]: slot niezarejestrowany (stan wyczyszczony) → niezarejestrowany, bez żądania', async () => {
    const s = await swiat();
    await s.A.sync.clearSyncState();
    expect(await s.A.sync.pushEvents([zdarzenie()])).toEqual({ ok: false, powod: 'niezarejestrowany' });
    expect(zEvents(s)).toEqual([]);
  });

  it('PE11 [czerwony na bazie]: złe wejście → argument, bez żądania (pusta i za duża partia, eid nie UUID v4 małymi literami, powtórzony eid, iv, data, ciało ponad 1 MiB)', async () => {
    const s = await swiat();
    const e = zdarzenie();
    const zle = [
      undefined, [], Array.from({ length: 201 }, () => zdarzenie()), [{ ...e, eid: 'abc' }], [{ ...e, eid: e.eid.toUpperCase() }],
      [{ ...e, eid: 'd:' + e.eid }], [e, { ...zdarzenie(), eid: e.eid }], [{ ...e, iv: '' }], [{ ...e, iv: 'a'.repeat(65) }],
      [{ ...e, data: 7 }], [{ eid: e.eid, iv: e.iv }], [null], Array.from({ length: 5 }, () => zdarzenie({ data: 'y'.repeat(220000) })),
    ];
    for (const z of zle) expect(await s.A.sync.pushEvents(z), JSON.stringify(z && z.length)).toEqual({ ok: false, powod: 'argument' });
    expect(zEvents(s)).toEqual([]);
    expect((await s.A.sync.pushEvents([{ ...e, iv: 'a'.repeat(64) }])).ok, 'iv 64 znaki — na granicy').toBe(true);
  });

  it('PE12 [czerwony na bazie]: sesja — blokada w trakcie żądania: sesja bez skutków ubocznych (429 nie ustawia pauzy); sejf zablokowany przed wysyłką: zablokowany bez żądania', async () => {
    const s = await swiat();
    const brama = s.atrapa.wstrzymaj({ trasa: 'events' }, { faza: 'po' });
    s.atrapa.usterka({ gdy: { trasa: 'events' }, kod: 'rate_limited' });
    const p = s.A.sync.pushEvents([zdarzenie()]);
    await brama.osiagnieta;
    s.A.zablokuj();
    brama.zwolnij();
    brama.rozbroj();
    expect(await p).toEqual({ ok: false, powod: 'sesja' });
    expect(s.A.win.localStorage.getItem(RL), '429 z zakończonej sesji nie ustawia pauzy').toBeNull();
    const n = zEvents(s).length;
    expect(await s.A.sync.pushEvents([zdarzenie()])).toEqual({ ok: false, powod: 'zablokowany' });
    expect(zEvents(s).length).toBe(n);
    await s.A.odblokuj();
    await cisza([s.A]);
    expect((await s.A.sync.pushEvents([zdarzenie()])).ok).toBe(true);
  });
});

describe('P-SYNC-ZDARZENIA — format kliniczny', () => {
  it('PE16 [czerwony na bazie]: trasa formatu klinicznego inna niż legacy → format, przed tożsamością i bez żądania; funkcja nie rzuca', async () => {
    const s = await swiat();
    const v = s.A.win.VildaVault;
    const material = vi.spyOn(v, 'getSyncMaterial');
    const trasa = v.selectPatientClinicalRoute;
    v.selectPatientClinicalRoute = () => ({ mode: 'protected-unavailable', code: 'CLINICAL_AUTHORITY_STALE', writeAvailable: false });
    try {
      expect(await s.A.sync.pushEvents([zdarzenie()])).toEqual({ ok: false, powod: 'format' });
    } finally { v.selectPatientClinicalRoute = trasa; }
    expect(material).not.toHaveBeenCalled();
    expect(zEvents(s)).toEqual([]);
    // Trasa zmienia się po pierwszym sprawdzeniu (odczyt stanu slotu odmawia): wynik format, nie odrzucona obietnica.
    v.selectPatientClinicalRoute = (op) => (op === 'sync-events' ? { mode: 'legacy', writeAvailable: false } : { mode: 'protected-unavailable', code: 'CLINICAL_AUTHORITY_STALE', writeAvailable: false });
    try {
      expect(await s.A.sync.pushEvents([zdarzenie()])).toEqual({ ok: false, powod: 'format' });
    } finally { v.selectPatientClinicalRoute = trasa; }
    expect(zEvents(s)).toEqual([]);
    expect((await s.A.sync.pushEvents([zdarzenie()])).ok, 'trasa legacy — wysyłka działa').toBe(true);
  });
});

describe('P-SYNC-ZDARZENIA — włącznik dziennika i bramka sejfu', () => {
  it('PE13 [czerwony na bazie]: włącznik tylko przy „events” w health, fladze dokładnie „1” i pobieraniu stronami; bez „events” bez odczytu magazynu', async () => {
    const tab = [
      [{ events: false, flaga: '1' }, false], [{ events: true, flaga: null }, false], [{ events: true, flaga: '0' }, false],
      [{ events: true, flaga: 'true' }, false], [{ events: true, flaga: '1' }, true],
    ];
    for (const [o, ma] of tab) {
      const s = await swiat(o);
      expect(s.A.sync.isEventLogEnabled(), JSON.stringify(o)).toBe(ma);
      await sprzatnijUrzadzenia();
    }
    const s = await swiat({ flaga: '1' });
    s.A.win.localStorage.setItem('vilda-sync-paged-v1', '0');
    expect(s.A.sync.isEventLogEnabled(), "pobieranie stronami wyłączone ('0')").toBe(false);
    s.A.win.localStorage.removeItem('vilda-sync-paged-v1');
    s.A.win.VILDA_SYNC_PAGED = false;
    expect(s.A.sync.isEventLogEnabled(), 'VILDA_SYNC_PAGED = false').toBe(false);
    delete s.A.win.VILDA_SYNC_PAGED;
    s.A.win.localStorage.setItem('vilda-incr-sync-v1', '0');
    expect(s.A.sync.isEventLogEnabled(), "szybka synchronizacja wyłączona ('vilda-incr-sync-v1' = '0')").toBe(false);
    await sprzatnijUrzadzenia();
    // Bez „events” w health: ani jednego odczytu localStorage i sessionStorage we włączniku.
    const b = await swiat({ events: false, flaga: '1' });
    const odczyty = [];
    for (const m of ['localStorage', 'sessionStorage']) {
      const st = b.A.win[m];
      const g = st.getItem.bind(st);
      vi.spyOn(st, 'getItem').mockImplementation((k) => { odczyty.push(m + ':' + k); return g(k); });
    }
    expect(b.A.sync.isEventLogEnabled()).toBe(false);
    expect(b.A.vault._eventLog.gateOpen()).toBe(false);
    expect(odczyty).toEqual([]);
  });

  it('PE14 [czerwony na bazie]: bramka sejfu (gateOpen) idzie za włącznikiem synchronizacji tego okna; VILDA_EVENT_LOG === true otwiera jak dotąd; wyjątek we włączniku = zamknięta', async () => {
    const s = await swiat({ flaga: null });
    expect(s.A.vault._eventLog.gateOpen()).toBe(false);
    s.A.win.localStorage.setItem(FLAGA, '1');
    expect(s.A.vault._eventLog.gateOpen()).toBe(true);
    s.A.win.localStorage.setItem(FLAGA, '0');
    expect(s.A.vault._eventLog.gateOpen()).toBe(false);
    s.A.win.VILDA_EVENT_LOG = true;
    expect(s.A.vault._eventLog.gateOpen()).toBe(true);
    s.A.win.VILDA_EVENT_LOG = 'true';
    expect(s.A.vault._eventLog.gateOpen()).toBe(false);
    delete s.A.win.VILDA_EVENT_LOG;
    s.A.win.localStorage.setItem(FLAGA, '1');
    const prawdziwy = s.A.win.VildaSync;
    s.A.win.VildaSync = { isEventLogEnabled: () => { throw new Error('x'); } };
    expect(s.A.vault._eventLog.gateOpen()).toBe(false);
    s.A.win.VildaSync = { isEventLogEnabled: () => 'true' };
    expect(s.A.vault._eventLog.gateOpen()).toBe(false);
    s.A.win.VildaSync = prawdziwy;
    expect(s.A.vault._eventLog.gateOpen()).toBe(true);
  });

  it('PE15 [czerwony na bazie]: strażnik — pushEvents i isEventLogEnabled bez wywołań w plikach produktu poza vilda_sync.js (isEventLogEnabled także w bramce sejfu)', () => {
    const pliki = fs.readdirSync(KORZEN).filter((n) => /\.(js|html)$/.test(n) && n !== 'vilda_sync.js');
    expect(pliki.length).toBeGreaterThan(100);
    const zPush = pliki.filter((n) => /\bpushEvents\b/.test(fs.readFileSync(path.join(KORZEN, n), 'utf8')));
    expect(zPush).toEqual([]);
    const zWl = pliki.filter((n) => /\bisEventLogEnabled\b/.test(fs.readFileSync(path.join(KORZEN, n), 'utf8')));
    expect(zWl).toEqual(['vilda_vault.js']);
    const sync = fs.readFileSync(path.join(KORZEN, 'vilda_sync.js'), 'utf8');
    expect(sync.match(/\bBze_pushEvents\b/g)).toHaveLength(3); // definicja, eksport i partia nadawcy (E2-PR4d)
    expect(sync.match(/\bBze_pushEvents\(/g), 'jedyne wywołanie — partia nadawcy').toHaveLength(2);
    const partia = sync.slice(sync.indexOf('async function Bns_partia('), sync.indexOf('async function Bns_flushJeden('));
    expect(partia.match(/\bBze_pushEvents\(/g), 'wywołanie w Bns_partia').toHaveLength(1);
    expect(sync.split("'vilda-event-log-v1'").length - 1, 'klucz flagi tylko w stałej').toBe(1);
  });
});
