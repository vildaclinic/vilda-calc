// E2-PR0 — kontrakt atrapy workera tests/support/atrapa-workera-sync.mjs wobec workera vilda-sync v37a (4551678) i v36
// (8396f47). Każdy przypadek odpowiada fragmentowi kodu workera i ma w opisie odwołanie do
// pliku wzorca; atrapa nie ma automatycznej kontroli wierności z prawdziwym workerem (osobne repo), więc ten plik pilnuje
// kształtów, kodów, kolejności kroków i limitów. Dane wyłącznie FIKCYJNE (slot 'b'*64, token 43 znaki, ładunek
// {iv:'AAAAAAAAAAAAAAAA', data: base64(JSON {id})} jak test/support/fakes.mjs:33-221).
//
// Przypadki:
//   K1–K5  /v1/health v37a (flaga EVENTS_ENABLED, stany huba) i v36; HEAD/POST /v1/health → 404.
//   K6–K7  uwierzytelnienie (401 invalid_credentials także dla brakującego slotu, missing_token) i wyrażenie trasy.
//   K8–K11 register, PUT/GET /blob (428 → 412 → 413, 304), /status slotu tylko tożsamości.
//   K12    /delta (202 stored, nowy eid, lustro, 413 bez wywołania DO, 400, ponowienie callHub).
//   K13–K17 /changes legacy (okno since=0, prefiks, zaślepki, parametry) i stronicowany (400, 13 pól, requiresBase).
//   K18–K19 /events przy fladze 0 (404, preflight 204) i 1 (pełny kontrakt).
//   K20–K22 licznik DO 120/min, kubełek KV 40/min, Retry-After przez CORS (v36 bez Retry-After w Expose).
//   K23–K27 import (503 log_import_pending), stany huba, 507, dziennik v36 (lustro: jedna strona, TTL tylko przy przycinaniu
//          i GET /deltas), import ogona po TTL i przy importPending (K26b), DELETE i ponowna rejestracja.
//   K28–K30 adaptery fetch i beacon, rejestr bez tokenów, naruszenia.
//   K31    nagłówek wierności: SHA wzorca i odwołanie do każdej trasy i każdego kodu usterki.
//   K32    restore-prev i /deltas.
//   K33    usterka bez skutku (kod niewytwarzany w trybie albo stanie huba, 401 przed usterką, druga brama), ile per żądanie.
//   K34    domyślny Content-Type ciała w adapterze fetch i fetchOkna (napis, Blob, URLSearchParams, bajty).
//   K35    sprawdzCzystosc przy żądaniu w locie; zdejmijStraznikaSieci i idempotentna instalacja.
//   K36–K37 budżet DO zdarzeń i bajtów na minutę; import ogona z zaślepką.
//   K38    kolejność kroków /events i /delta (413, Bearer, 415, token z ciała, walidacja).
//   K39–K40 nagłówki /status i /blob, ramka changed; kubełek na slot, 413 v36, granica eventBytes, originy v36.
//   K41    filtr urządzenia, gdy.ktore, licznik aktywności, czytanie ciała.
//   K42    restart instancji DO (wdrożenie, ewikcja) wobec zmiany limitów.
//
// Czerwone na bazie: żadne — narzędzia testowe, zielone na e49ff33e.
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  KODY_USTEREK, TRASY_MODELU, TRASY_POZA_MODELEM, sprawdzCzystosc, straznik, utworzAtrapeWorkera, zainstalujStraznikaSieci,
  zdejmijStraznikaSieci,
} from '../support/atrapa-workera-sync.mjs';

zainstalujStraznikaSieci();

const SLOT = 'b'.repeat(64);
const SLOT2 = 'c'.repeat(64);
const TOKEN = 'Fikcyjny-token_' + 'x'.repeat(28);
const TOKEN2 = 'Inny-fikcyjny_' + 'y'.repeat(29);
const hash = (t) => createHash('sha256').update(t).digest('hex');
const ladunek = (id) => ({ iv: 'AAAAAAAAAAAAAAAA', data: Buffer.from(JSON.stringify({ id })).toString('base64') });
const uuid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const tura = () => new Promise((r) => { setImmediate(r); });
const ORIGIN = 'http://localhost';

const atrapy = [];
function nowa(opcje) { const a = utworzAtrapeWorkera(opcje); atrapy.push(a); return a; }
afterEach(() => {
  const lista = atrapy.splice(0);
  for (const a of lista) a.zwolnijWszystko();
  expect(straznik().przyjmijNaruszenia(), 'globalny fetch spoza atrapy').toEqual([]);
  sprawdzCzystosc(...lista);
});

let ipNr = 0;
async function zadaj(a, metoda, url, { token, naglowki = {}, cialo = null, ip } = {}) {
  const n = { ...naglowki };
  if (token) n.authorization = 'Bearer ' + token;
  const o = await a.obsluz({ metoda, url, naglowki: n, cialo, ip });
  const json = typeof o.cialo === 'string' && /json/.test(o.naglowki['content-type'] || '') ? JSON.parse(o.cialo) : null;
  return { ...o, json };
}
// Każda rejestracja z innego IP (kubełek rl:reg 3/min per IP) — chyba że test sprawdza właśnie ten limit.
const zarejestruj = (a, { slot = SLOT, token = TOKEN, cialo = 'zaszyfrowany-blob', ip } = {}) => {
  ipNr += 1;
  return zadaj(a, 'POST', `/v1/slots/${slot}/register`, { naglowki: { 'x-auth-token-hash': hash(token) }, cialo, ip: ip || `198.51.100.${ipNr % 250}` });
};
const delta = (a, payload, { slot = SLOT, token = TOKEN, naglowki } = {}) => zadaj(a, 'POST', `/v1/slots/${slot}/delta`, { cialo: JSON.stringify({ token, payload }), naglowki });
const zmiany = (a, q, { slot = SLOT, token = TOKEN } = {}) => zadaj(a, 'GET', `/v1/slots/${slot}/changes${q}`, { token });
const status = (a, { slot = SLOT, token = TOKEN } = {}) => zadaj(a, 'GET', `/v1/slots/${slot}/status`, { token });
const zdarzenia = (a, events, { token = TOKEN, naglowki = { 'content-type': 'application/json' }, cialo } = {}) =>
  zadaj(a, 'POST', `/v1/slots/${SLOT}/events`, { token, naglowki, cialo: cialo !== undefined ? cialo : JSON.stringify({ events }) });
const zdarzenie = (n, extra = {}) => ({ eid: uuid(n), iv: 'AAAAAAAAAAAAAAAA', data: 'ZmlrY3lqbmU=', ...extra });
const licznikDO = (a, slot = SLOT) => a.slot(slot).dz.rl.n;
const seqs = (j) => j.deltas.map((d) => d.seq);
const TTL = 3 * 24 * 3600 * 1000; // TTL lustra (v36/delta_log.mjs:23)

describe('E2-PR0: atrapa workera vilda-sync — kontrakt v37a i v36', () => {
  it('K1: v37a health przy EVENTS_ENABLED=0 (worker.js:135-171; limits_cors_health.test.mjs:177-190)', async () => {
    const a = nowa();
    const r = await zadaj(a, 'GET', '/v1/health');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: 'ok', version: '37', api: 37, sqlite: true, features: ['changes-paged', 'aad'], ts: '2026-10-30T08:00:05.000Z' });
    const p = a.polacz('kontrakt');
    const res = await p.fetch(p.adres + '/v1/health');
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('X-Api-Version'), 'X-Api-Version widoczny przez CORS (Expose)').toBe('37');
  });

  it('K2: v37a health przy EVENTS_ENABLED=1 ogłasza events (worker.js:136,168)', async () => {
    const r = await zadaj(nowa({ eventsEnabled: true }), 'GET', '/v1/health');
    expect(r.json.features).toEqual(['events', 'changes-paged', 'aad']);
  });

  it('K3: health przy hubie kv / stary / brak — sqlite false/null/null, features [] (worker.js:150-159,168)', async () => {
    const wyniki = [];
    for (const hub of ['kv', 'stary', 'brak']) {
      const r = await zadaj(nowa({ hub, eventsEnabled: true }), 'GET', '/v1/health');
      wyniki.push([hub, r.json.api, r.json.sqlite, r.json.features]);
    }
    expect(wyniki).toEqual([['kv', 37, false, []], ['stary', 37, null, []], ['brak', 37, null, []]]);
  });

  it('K4: v36 health — tylko status, version 0.1.0, ts; X-Api-Version 0.1.0 (8396f47:src/worker.js:118-126)', async () => {
    const a = nowa({ tryb: 'v36' });
    const r = await zadaj(a, 'GET', '/v1/health');
    expect(Object.keys(r.json)).toEqual(['status', 'version', 'ts']);
    expect(r.json.version).toBe('0.1.0');
    expect(r.naglowki['x-api-version']).toBe('0.1.0');
  });

  it('K5: HEAD i POST /v1/health → 404 not_found (worker.js:240,246-251)', async () => {
    const a = nowa({ nieznanaTrasa: 'odpowiedz' });
    for (const m of ['HEAD', 'POST']) {
      const r = await zadaj(a, m, '/v1/health');
      expect([r.status, r.json.error.code, r.json.error.message]).toEqual([404, 'not_found', `Endpoint nie istnieje: ${m} /v1/health`]);
    }
    expect(a.naruszenia).toEqual([]);
    const b = nowa();
    await zadaj(b, 'HEAD', '/v1/health');
    expect(b.przyjmijNaruszenia().map((n) => n.rodzaj), 'domyślnie trasa spoza workera to też błąd klienta').toEqual(['nieznana-trasa']);
  });

  it('K6: brak slotu i zły token → 401 invalid_credentials; brak/zły format Bearer → 401 missing_token (auth.js:53-61,91-93,106-108)', async () => {
    const a = nowa();
    const kody = async (token, naglowki = {}) => {
      const out = [];
      for (const [m, u] of [['GET', 'status'], ['GET', 'blob'], ['GET', 'changes?since=0'], ['DELETE', '']]) {
        const r = await zadaj(a, m, `/v1/slots/${SLOT}${u ? '/' + u : ''}`, { token, naglowki });
        out.push(`${r.status} ${r.json.error.code}`);
      }
      return out;
    };
    expect(await kody(TOKEN), 'brak slotu: 401, nie 404').toEqual(Array(4).fill('401 invalid_credentials'));
    expect((await status(a)).json.error.message).toBe('Nieprawidłowy slotId lub token');
    await zarejestruj(a);
    expect(await kody(TOKEN2), 'zły token: ten sam kod').toEqual(Array(4).fill('401 invalid_credentials'));
    expect(await kody(null)).toEqual(Array(4).fill('401 missing_token'));
    expect(await kody(null, { authorization: 'bearer ' + TOKEN })).toEqual(Array(4).fill('401 missing_token'));
    expect(await kody(TOKEN.slice(1))).toEqual(Array(4).fill('401 missing_token'));
  });

  it('K7: slot wielkimi literami albo 63 znaki → 404 not_found z wyrażenia trasy; licznik KV nietknięty (worker.js:88-104)', async () => {
    const a = nowa({ nieznanaTrasa: 'odpowiedz' });
    for (const s of ['B'.repeat(64), 'b'.repeat(63)]) {
      const r = await zadaj(a, 'GET', `/v1/slots/${s}/status`, { token: TOKEN });
      expect([r.status, r.json.error.code]).toEqual([404, 'not_found']);
      expect(a.slot(s)).toBe(null);
    }
    expect(a.zadania.map((z) => z.trasa)).toEqual([null, null]);
  });

  it('K8: register — 201, 409 przed ciałem, 400, wipe zależny od huba, 503 hub_unavailable, 429 rl:reg (register.js:39-149; register_v37.test.mjs:19-88)', async () => {
    const a = nowa();
    const r = await zarejestruj(a);
    expect(r.status).toBe(201);
    expect(Object.keys(r.json)).toEqual(['slotId', 'etag', 'uploadedAt']);
    expect(r.json.etag).toMatch(/^[0-9a-f]{32}$/);
    expect(r.naglowki.etag).toBe(`"${r.json.etag}"`);
    expect((await zarejestruj(a, { cialo: null })).json.error.code, '409 przed czytaniem ciała').toBe('slot_exists');
    const zly = await zadaj(a, 'POST', `/v1/slots/${SLOT2}/register`, { naglowki: { 'x-auth-token-hash': 'ABC' }, cialo: 'x', ip: '198.51.100.251' });
    expect([zly.status, zly.json.error.code]).toEqual([400, 'invalid_token_hash']);
    expect((await zarejestruj(a, { slot: SLOT2, cialo: null })).json.error.code).toBe('empty_payload');
    // wipe przy rejestracji: sql czyści dziennik (licznik zostaje), stary/brak — rejestracja bez wipe
    for (const [hub, ev] of [['sql', 0], ['stary', 1], ['brak', 1]]) {
      const h = nowa({ hub });
      h.dopisz({ slotId: SLOT, payload: ladunek(1) });
      expect((await zarejestruj(h)).status, hub).toBe(201);
      expect([hub, h.slot(SLOT).dz.ev.length, h.slot(SLOT).dz.head]).toEqual([hub, ev, 1]);
    }
    const u = nowa();
    u.usterka({ gdy: { trasa: 'register' }, kod: 'hub_unavailable' });
    const r503 = await zarejestruj(u);
    expect([r503.status, r503.json.error.code]).toEqual([503, 'hub_unavailable']);
    expect((await status(u)).status, 'nic nie zapisane').toBe(401);
    const lim = nowa();
    const kody = [];
    for (const s of ['1', '2', '3', '4']) kody.push((await zarejestruj(lim, { slot: s.repeat(64), ip: '203.0.113.9' })).status);
    expect(kody).toEqual([201, 201, 201, 429]);
    const r429 = await zarejestruj(lim, { slot: '5'.repeat(64), ip: '203.0.113.9' });
    expect([r429.naglowki['retry-after'], r429.json.error.retryAfterSeconds]).toEqual(['55', 55]);
  });

  it('K9: PUT /blob — 428, 412, 200; kolejność 401 → 428 → 412 → 413; identity-only bez If-Match; blobSeq = head (upload.js:89-142,203-209)', async () => {
    const a = nowa({ limity: { maxPayloadBytes: 10 } });
    const e1 = (await zarejestruj(a, { cialo: 'mały' })).json.etag;
    const put = (o = {}) => zadaj(a, 'PUT', `/v1/slots/${SLOT}/blob`, { token: o.token || TOKEN, naglowki: { ...(o.im ? { 'if-match': o.im } : {}), ...(o.dl ? { 'content-length': String(o.dl) } : {}) }, cialo: o.cialo || 'nowy' });
    const kod = async (o) => { const r = await put(o); return `${r.status} ${r.json ? r.json.error ? r.json.error.code : 'ok' : ''}`; };
    expect(await kod({ token: TOKEN2, dl: 99, cialo: 'x'.repeat(99) })).toBe('401 invalid_credentials');
    expect(await kod({ dl: 99, cialo: 'x'.repeat(99) })).toBe('428 precondition_required');
    expect(await kod({ im: '"' + 'f'.repeat(32) + '"', dl: 99, cialo: 'x'.repeat(99) })).toBe('412 precondition_failed');
    expect(await kod({ im: `"${e1}"`, dl: 99, cialo: 'x'.repeat(99) })).toBe('413 payload_too_large');
    expect(await kod({ im: `"${e1}"`, cialo: 'x'.repeat(11) }), 'bez Content-Length — 413 przy odczycie').toBe('413 payload_too_large');
    a.dopisz({ payload: ladunek(1) });
    a.dopisz({ payload: ladunek(2) });
    const ok = await put({ im: `"${e1}"` });
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.json)).toEqual(['etag', 'updatedAt']);
    expect(ok.naglowki.etag).toBe(`"${ok.json.etag}"`);
    expect(ok.naglowki['x-slot-updated-at']).toBe(ok.json.updatedAt);
    expect(a.slot().dz.blobSeq, 'notify kind blob: blobSeq := head').toBe(2);
    expect(a.ramki.map((x) => x.ramka.type)).toEqual(['changed']);
    const t = nowa();
    await zadaj(t, 'POST', `/v1/slots/${SLOT}/register-identity`, { naglowki: { 'x-auth-token-hash': hash(TOKEN) } });
    const rT = await zadaj(t, 'PUT', `/v1/slots/${SLOT}/blob`, { token: TOKEN, cialo: 'pierwszy' });
    expect(rT.status, 'identity-only: If-Match niepotrzebny').toBe(200);
    expect(t.slot().kv.registeredAt).toBe(t.slot().kv.uploadedAt);
  });

  it('K10: GET /blob — 304 przy równym If-None-Match, 200 octet-stream, 404 blob_not_found dla identity-only (download.js:50-86)', async () => {
    const a = nowa();
    const e = (await zarejestruj(a, { cialo: 'zawartość-bloba' })).json.etag;
    const r304 = await zadaj(a, 'GET', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-none-match': `"${e}"` } });
    expect([r304.status, r304.cialo, r304.naglowki.etag]).toEqual([304, null, `"${e}"`]);
    const r = await zadaj(a, 'GET', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-none-match': '"inny"' } });
    expect(r.status).toBe(200);
    expect(r.naglowki['content-type']).toBe('application/octet-stream');
    expect(r.naglowki['content-length']).toBe(String(new TextEncoder().encode('zawartość-bloba').length));
    expect(new TextDecoder().decode(r.cialo)).toBe('zawartość-bloba');
    const t = nowa();
    await zadaj(t, 'POST', `/v1/slots/${SLOT}/register-identity`, { naglowki: { 'x-auth-token-hash': hash(TOKEN) } });
    const r404 = await zadaj(t, 'GET', `/v1/slots/${SLOT}/blob`, { token: TOKEN });
    expect([r404.status, r404.json.error.code]).toEqual([404, 'blob_not_found']);
  });

  it('K11: /status slotu identity-only — bez etag i uploadedAt, nagłówek ETag "undefined" (status.js:46-54; register_identity.js:82-88)', async () => {
    const a = nowa();
    const r1 = await zadaj(a, 'POST', `/v1/slots/${SLOT}/register-identity`, { naglowki: { 'x-auth-token-hash': hash(TOKEN) } });
    expect([r1.status, r1.json.ok, Object.keys(r1.json)]).toEqual([201, true, ['ok', 'slotId', 'registeredAt']]);
    const r2 = await zadaj(a, 'POST', `/v1/slots/${SLOT}/register-identity`, { naglowki: { 'x-auth-token-hash': hash(TOKEN) } });
    expect([r2.status, r2.json.alreadyRegistered]).toEqual([200, true]);
    const s = await status(a);
    expect(Object.keys(s.json)).toEqual(['updatedAt', 'size']);
    expect(s.naglowki.etag).toBe('"undefined"');
  });

  it('K12: /delta — 202 stored, nowy eid, treść dosłownie, lustro z tym samym seq, 413 bez DO, 400, ponowienie callHub (delta.js:45-109)', async () => {
    const a = nowa();
    await zarejestruj(a);
    const p = { ...ladunek(1), dodatkowe: 'zostaje' };
    const r1 = await delta(a, p);
    expect([r1.status, r1.json]).toEqual([202, { ok: true, delivered: 0, seq: 1, stored: true }]);
    const r2 = await delta(a, p);
    expect(r2.json.seq).toBe(2);
    const st = a.slot();
    expect(st.dz.ev.map((w) => [w.seq, w.src, w.body])).toEqual([[1, 'd', JSON.stringify(p)], [2, 'd', JSON.stringify(p)]]);
    expect(st.dz.ev[0].eid).toMatch(/^d:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(st.dz.ev[0].eid).not.toBe(st.dz.ev[1].eid);
    expect(st.lustro.map((e) => [e.seq, new RegExp(`/d/s${String(e.seq).padStart(12, '0')}-[0-9a-f]{8}$`).test(e.klucz)])).toEqual([[1, true], [2, true]]);
    expect(a.ramki.map((x) => [x.ramka.type, x.ramka.seq, typeof x.ramka.eid])).toEqual([['delta', 1, 'string'], ['delta', 2, 'string']]);
    expect((await delta(a, p, { token: TOKEN2 })).json.error.code).toBe('invalid_credentials');
    const n = licznikDO(a);
    const duza = await delta(a, { iv: 'x', data: 'y'.repeat(66000) });
    expect([duza.status, duza.json.error.code, duza.json.error.message]).toEqual([413, 'payload_too_large', 'Delta przekracza limit 65536 bajtów']);
    expect((await delta(a, p, { naglowki: { 'content-length': '70000' } })).status, '413 z Content-Length przed odczytem').toBe(413);
    const kod = async (cialo) => (await zadaj(a, 'POST', `/v1/slots/${SLOT}/delta`, { cialo })).json.error.code;
    expect([await kod(null), await kod('{nie-json'), await kod('null'), await kod(JSON.stringify({ token: TOKEN, payload: { data: 'x' } }))])
      .toEqual(['empty_payload', 'invalid_json', 'invalid_body', 'invalid_delta']);
    expect(licznikDO(a), '401/400/413 nie zużywają licznika DO').toBe(n);
    expect(a.zadania.every((z) => z.naglowki.contentType === null), 'brak Content-Type przyjęty').toBe(true);
    a.usterka({ gdy: { trasa: 'delta' }, ponowienieHub: true });
    const r3 = await delta(a, p);
    expect([r3.status, r3.json]).toEqual([202, { ok: true, delivered: 0, seq: 3, stored: true }]);
    expect(licznikDO(a), 'ponowienie callHub zużywa dwie jednostki').toBe(n + 2);
    expect(a.slot().dz.ev.length).toBe(3);
  });

  it('K13: legacy since=0 — bez blobSeq od oldest−1, z blobSeq=30 i marginesem 20 od 11 (slot_hub.js:720-724; changes_v37.test.mjs:57-71)', async () => {
    const a = nowa({ limity: { legacySince0Margin: 20 } });
    const e = (await zarejestruj(a)).json.etag;
    for (let i = 1; i <= 30; i += 1) a.dopisz({ payload: ladunek(i) });
    const bez = await zmiany(a, '?since=0');
    expect([bez.json.deltas[0].seq, bez.json.count]).toEqual([1, 30]);
    await zadaj(a, 'PUT', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-match': `"${e}"` }, cialo: 'nowy' });
    for (let i = 31; i <= 40; i += 1) a.dopisz({ payload: ladunek(i) });
    const z = await zmiany(a, '?since=0');
    expect([z.json.deltas[0].seq, z.json.deltas.at(-1).seq, z.json.count, z.json.headSeq]).toEqual([11, 40, 30, 40]);
  });

  it('K14: strona legacy — prefiks 200 wierszy, zaślepki osobno, pułap bajtów, 4 klucze (slot_hub.js:683-734; changes_v37.test.mjs:26-55)', async () => {
    const a = nowa();
    await zarejestruj(a);
    for (let i = 1; i <= 250; i += 1) a.dopisz({ payload: ladunek(i) });
    const r = await zmiany(a, '?since=0');
    expect(Object.keys(r.json)).toEqual(['deltas', 'count', 'headSeq', 'snapshotSeq']);
    expect([r.json.count, r.json.headSeq, r.json.deltas.at(-1).seq]).toEqual([200, 200, 200]);
    expect(Object.keys(r.json.deltas[0])).toEqual(['seq', 'payload']);
    const b = nowa();
    await zarejestruj(b);
    for (let i = 1; i <= 100; i += 1) b.dopisz({ payload: ladunek(i) });
    for (let i = 0; i < 5; i += 1) b.dopiszZaslepke();
    for (let i = 1; i <= 150; i += 1) b.dopisz({ payload: ladunek(i) });
    const z = await zmiany(b, '?since=0');
    expect([z.json.count, z.json.headSeq]).toEqual([205, 205]);
    expect(z.json.deltas.slice(100, 105)).toEqual([101, 102, 103, 104, 105].map((seq) => ({ seq, gap: true })));
    b.ustaw({ limity: { legacyPageBytes: 1 } });
    const jeden = await zmiany(b, '?since=0');
    expect([jeden.json.count, jeden.json.headSeq]).toEqual([1, 1]);
  });

  it('K15: parametry legacy — since > head, parseInt, ujemne → 0 (slot_hub.js:717; changes.js:39-43)', async () => {
    const a = nowa();
    await zarejestruj(a);
    for (let i = 1; i <= 6; i += 1) a.dopisz({ payload: ladunek(i) });
    expect((await zmiany(a, '?since=99')).json).toEqual({ deltas: [], count: 0, headSeq: 6, snapshotSeq: 0 });
    const pierwszy = async (q) => (await zmiany(a, q)).json.deltas[0].seq;
    expect([await pierwszy('?since=abc'), await pierwszy('?since=1.5'), await pierwszy('?since=-1'), await pierwszy('?since=5abc'), await pierwszy('')])
      .toEqual([1, 2, 1, 6, 1]);
  });

  it('K16: stronicowany — 400 invalid_query dla złych since/limit, limit=500 → 200, 400 nie zużywa licznika DO (changes.js:57-68)', async () => {
    const a = nowa();
    await zarejestruj(a);
    const n = licznikDO(a);
    for (const q of ['?since=0&limit=0', '?since=0&limit=501', '?since=-1&limit=5', '?since=1.5&limit=5', '?limit=5', '?since=0&limit=abc', '?since=0&limit=']) {
      const r = await zmiany(a, q);
      expect([q, r.status, r.json.error.code, r.json.error.message]).toEqual([q, 400, 'invalid_query', 'since musi być liczbą całkowitą ≥ 0, a limit liczbą całkowitą 1..500']);
    }
    expect(licznikDO(a)).toBe(n);
    expect((await zmiany(a, '?since=0&limit=500')).status).toBe(200);
    expect(licznikDO(a)).toBe(n + 1);
  });

  it('K17: strona stronicowana — 13 pól, zaślepka jak wiersz, headSeq prawdziwy, nextSince, cursorAhead, requiresBase, blobSeq (slot_hub.js:737-759)', async () => {
    const a = nowa({ limity: { maxRangeBytes: 1 } });
    const e = (await zarejestruj(a)).json.etag;
    a.dopisz({ payload: ladunek(1) });
    a.dopiszZaslepke();
    for (let i = 3; i <= 5; i += 1) a.dopisz({ payload: ladunek(i) });
    a.ustaw({ limity: { maxRangeBytes: 1048576 } });
    const r = await zmiany(a, '?since=0&limit=2');
    expect(Object.keys(r.json)).toEqual(['deltas', 'count', 'headSeq', 'nextSince', 'truncated', 'snapshotSeq', 'oldestSeq', 'requiresBase', 'cursorAhead', 'blobSeq', 'checkpoint', 'format']);
    expect(r.json.deltas).toEqual([{ seq: 1, eid: a.slot().dz.ev[0].eid, payload: ladunek(1) }, { seq: 2, gap: true }]);
    expect([r.json.headSeq, r.json.nextSince, r.json.truncated, r.json.oldestSeq, r.json.requiresBase, r.json.cursorAhead, r.json.checkpoint, r.json.format])
      .toEqual([5, 2, true, 1, false, false, null, 'sql']);
    const pusta = await zmiany(a, '?since=5&limit=10');
    expect([pusta.json.deltas, pusta.json.nextSince, pusta.json.truncated, pusta.json.cursorAhead]).toEqual([[], 5, false, false]);
    const przed = await zmiany(a, '?since=9&limit=10');
    expect([przed.json.deltas, przed.json.cursorAhead, przed.json.nextSince]).toEqual([[], true, 9]);
    await zadaj(a, 'PUT', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-match': `"${e}"` }, cialo: 'nowy' });
    expect((await zmiany(a, '?since=0&limit=1')).json.blobSeq).toBe(5);
    a.ustaw({ limity: { maxRangeBytes: 1 } });
    expect((await zmiany(a, '?since=0&limit=500')).json.count, 'pułap bajtów — co najmniej jeden wiersz').toBe(1);
    a.ustaw({ limity: { maxRangeBytes: 1048576 } });
    a.wipe();
    a.dopisz({ payload: ladunek(6) });
    a.dopisz({ payload: ladunek(7) });
    const pw = await zmiany(a, '?since=3&limit=10');
    expect([pw.json.requiresBase, pw.json.oldestSeq, seqs(pw.json), pw.json.blobSeq]).toEqual([true, 6, [6, 7], 0]);
    expect((await zmiany(a, '?since=5&limit=10')).json.requiresBase).toBe(false);
  });

  it('K18: /events przy EVENTS_ENABLED=0 → 404 not_found bez licznika DO; preflight OPTIONS 204 (worker.js:141-143,186,235-237)', async () => {
    const a = nowa({ nieznanaTrasa: 'odpowiedz' });
    await zarejestruj(a);
    const n = licznikDO(a);
    const r = await zdarzenia(a, [zdarzenie(1)]);
    expect([r.status, r.json.error.code, r.json.error.message]).toEqual([404, 'not_found', `Endpoint nie istnieje: POST /v1/slots/${SLOT}/events`]);
    expect(licznikDO(a)).toBe(n);
    const o = await zadaj(a, 'OPTIONS', `/v1/slots/${SLOT}/events`, { naglowki: { origin: ORIGIN } });
    expect([o.status, o.naglowki['access-control-expose-headers'], o.naglowki['x-api-version']]).toEqual([204, 'ETag, X-Api-Version, X-Slot-Updated-At, Retry-After', undefined]);
    expect((await zadaj(a, 'OPTIONS', '/v1/health', { naglowki: { origin: 'https://obcy.invalid' } })).status).toBe(403);
  });

  it('K19: /events przy EVENTS_ENABLED=1 — accepted/rejected, dup, walidacja, 415, beacon, 413, z i aad (events.js:43-152; events.test.mjs:25-120)', async () => {
    const a = nowa({ eventsEnabled: true, limity: { eventBytes: 300 } });
    await zarejestruj(a);
    const r = await zdarzenia(a, [zdarzenie(1), zdarzenie(2, { z: 'gzip', aad: 1 })]);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(['ok', 'accepted', 'rejected', 'headSeq', 'ts']);
    expect([r.json.accepted, r.json.rejected, r.json.headSeq, r.json.ts]).toEqual([[{ eid: uuid(1), seq: 1, dup: false }, { eid: uuid(2), seq: 2, dup: false }], [], 2, Date.UTC(2026, 9, 30, 8, 0, 5)]);
    const dup = await zdarzenia(a, [zdarzenie(1), zdarzenie(3), zdarzenie(3)]);
    expect(dup.json.accepted).toEqual([{ eid: uuid(1), seq: 1, dup: true }, { eid: uuid(3), seq: 3, dup: false }, { eid: uuid(3), seq: 3, dup: true }]);
    expect(dup.json.headSeq).toBe(3);
    const n = licznikDO(a);
    const zle = [
      { eid: '00000000-0000-1000-8000-000000000009', iv: 'A', data: 'x' }, zdarzenie(10, { iv: '' }), zdarzenie(11, { iv: 'A'.repeat(65) }),
      zdarzenie(12, { z: null }), zdarzenie(13, { aad: true }), null, zdarzenie(14, { data: 'x'.repeat(400) }),
    ];
    const odrz = await zdarzenia(a, zle);
    expect(odrz.json.accepted).toEqual([]);
    expect(odrz.json.rejected.map((x) => x.code)).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'oversize']);
    expect(odrz.json.rejected[5].eid).toBe(null);
    expect(licznikDO(a), 'partia samych odrzuceń zużywa licznik').toBe(n + 1);
    expect((await zdarzenia(a, [])).json.error.code).toBe('invalid_events');
    expect((await zdarzenia(a, Array.from({ length: 201 }, (_, i) => zdarzenie(100 + i)))).json.error.code).toBe('invalid_events');
    const bezCt = await zdarzenia(a, [zdarzenie(20)], { naglowki: {} });
    expect([bezCt.status, bezCt.json.error.code]).toEqual([415, 'unsupported_media_type']);
    const beacon = await zdarzenia(a, null, { token: null, naglowki: { 'content-type': 'text/plain;charset=UTF-8' }, cialo: JSON.stringify({ token: TOKEN, events: [zdarzenie(21)] }) });
    expect([beacon.status, beacon.json.accepted[0].seq]).toEqual([200, 4]);
    const duzy = await zdarzenia(a, null, { token: null, naglowki: { 'content-type': 'text/plain', 'content-length': String(64 * 1024 + 1) }, cialo: '{}' });
    expect([duzy.status, duzy.json.error.message]).toEqual([413, 'Partia zdarzeń przekracza limit 65536 bajtów']);
    const ch = await zmiany(a, '?since=1');
    expect(ch.json.deltas[0]).toEqual({ seq: 2, payload: { iv: 'AAAAAAAAAAAAAAAA', data: 'ZmlrY3lqbmU=', z: 'gzip', aad: 1 } });
    expect(a.slot().lustro, '/events nie pisze do lustra').toEqual([]);
  });

  it('K20: licznik DO 120/min — 60 /delta + 60 /changes, 121. → 429 z Retry-After 55, wspólny dla urządzeń slotu (slot_hub.js:124-133,421-433; limits_cors_health.test.mjs:18-50)', async () => {
    const a = nowa({ eventsEnabled: true });
    await zarejestruj(a);
    await zarejestruj(a, { slot: SLOT2, token: TOKEN2 });
    const A = a.polacz('A');
    const B = a.polacz('B');
    const adres = (p, u) => `${p.adres}/v1/slots/${SLOT}${u}`;
    const bearer = { Authorization: 'Bearer ' + TOKEN };
    expect((await delta(a, ladunek(1), { token: TOKEN2 })).status).toBe(401);
    expect((await zmiany(a, '?since=0&limit=0')).status).toBe(400);
    expect((await zadaj(a, 'POST', `/v1/slots/${SLOT}/delta`, { cialo: 'x'.repeat(70000) })).status).toBe(413);
    expect(licznikDO(a), '401/400/413 nie zużywają').toBe(0);
    const pelne = async () => {
      const st = [];
      for (let i = 0; i < 60; i += 1) st.push((await A.fetch(adres(A, '/delta'), { method: 'POST', body: JSON.stringify({ token: TOKEN, payload: ladunek(i) }) })).status);
      for (let i = 0; i < 60; i += 1) st.push((await B.fetch(adres(B, i % 2 ? '/changes?since=0' : '/changes?since=0&limit=5'), { headers: bearer })).status);
      return st;
    };
    const st = await pelne();
    expect(st.filter((s) => s !== 202 && s !== 200)).toEqual([]);
    const r = await A.fetch(adres(A, '/events'), { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [zdarzenie(1)] }) });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('55');
    expect(await r.json()).toEqual({ error: { code: 'rate_limited', message: 'Zbyt wiele żądań. Spróbuj ponownie za 55 sekund.', retryAfterSeconds: 55 } });
    expect((await zmiany(a, '?since=0', { slot: SLOT2, token: TOKEN2 })).status, 'inny slot — własny licznik').toBe(200);
    a.zegar.doNastepnejMinuty();
    expect((await zmiany(a, '?since=0')).status).toBe(200);
    await pelne();
    expect((await zmiany(a, '?since=0')).status).toBe(429);
    a.ewikcjaDO(SLOT);
    expect((await zmiany(a, '?since=0')).status, 'wyrzucenie DO z pamięci zeruje licznik').toBe(200);
  });

  it('K21: kubełek KV rl:slot 40/min — przed uwierzytelnieniem; v37a bez /changes i /delta, v36 z nimi (ratelimit.js:94-165)', async () => {
    const a = nowa();
    await zarejestruj(a);
    for (let i = 0; i < 20; i += 1) { await zmiany(a, '?since=0'); await delta(a, ladunek(i)); }
    const st = [];
    for (let i = 0; i < 39; i += 1) st.push((await status(a)).status);
    st.push((await status(a, { token: TOKEN2 })).status);
    expect(st.filter((s) => s === 200).length).toBe(39);
    const r = await status(a);
    expect([r.status, r.naglowki['retry-after'], r.json.error.retryAfterSeconds]).toEqual([429, '55', 55]);
    const v36 = nowa({ tryb: 'v36' });
    await zarejestruj(v36);
    for (let i = 0; i < 20; i += 1) { await zmiany(v36, '?since=0'); await delta(v36, ladunek(i)); }
    expect((await status(v36)).status, 'v36: /changes i /delta w tym samym kubełku').toBe(429);
    expect((await zmiany(v36, '?since=0')).status).toBe(429);
  });

  it('K22: Retry-After przez CORS — widoczny w v37a, niewidoczny w v36 (cors.js:20; v36/cors.mjs:21; README.md:86)', async () => {
    const wynik = {};
    for (const tryb of ['v37a', 'v36']) {
      const a = nowa({ tryb, limity: { slotRpm: 1 } });
      await zarejestruj(a);
      const p = a.polacz('kontrakt');
      await p.fetch(`${p.adres}/v1/slots/${SLOT}/status`, { headers: { Authorization: 'Bearer ' + TOKEN } });
      const res = await p.fetch(`${p.adres}/v1/slots/${SLOT}/status`, { headers: { Authorization: 'Bearer ' + TOKEN } });
      const surowe = await status(a);
      wynik[tryb] = [res.status, res.headers.get('Retry-After'), surowe.naglowki['retry-after']];
    }
    expect(wynik).toEqual({ v37a: [429, '55', '55'], v36: [429, null, '55'] });
  });

  it('K23: usterka log_import_pending — 503 bez Retry-After, licznik DO +1, następne 200 (changes.js:84-86; changes_v37.test.mjs:158-168)', async () => {
    const a = nowa();
    await zarejestruj(a);
    const u = a.usterka({ gdy: { trasa: 'changes' }, kod: 'log_import_pending' });
    const r = await zmiany(a, '?since=0');
    expect([r.status, r.json.error.code, r.naglowki['retry-after']]).toEqual([503, 'log_import_pending', undefined]);
    expect([licznikDO(a), u.trafienia]).toEqual([1, 1]);
    expect((await zmiany(a, '?since=0')).status).toBe(200);
    expect(() => a.usterka({ gdy: { trasa: 'status' }, kod: 'log_import_pending' }), 'kod spoza trasy workera').toThrow(/nie wytwarza/);
    const z = await zadaj(a, 'GET', `/v1/slots/${SLOT}/changes`, { token: TOKEN2 });
    const u503 = a.usterka({ gdy: { trasa: 'changes' }, kod: 'hub_unavailable' });
    expect([z.status, (await zmiany(a, '?since=0', { token: TOKEN2 })).status], 'zły token: 401 mimo uzbrojonego 503').toEqual([401, 401]);
    expect(u503.trafienia, '401 przed wywołaniem DO: usterka bez skutku').toBe(0);
    expect(a.przyjmijNaruszenia().map((n) => n.rodzaj)).toEqual(['usterka-bez-skutku']);
  });

  it('K24: stany huba — brak, stary DO, klasa bez SQLite (delta.js:112-125; changes.js:76-88; slot_hub_kv_mode.test.mjs:72-95)', async () => {
    const brak = nowa({ hub: 'brak' });
    await zarejestruj(brak);
    expect((await zmiany(brak, '?since=0')).json.error.code).toBe('hub_unavailable');
    const d = await delta(brak, ladunek(1));
    expect([d.status, d.json.error.code, brak.slot().dz.ev.length, brak.slot().lustro.length]).toEqual([503, 'hub_unavailable', 0, 0]);
    expect((await zadaj(brak, 'DELETE', `/v1/slots/${SLOT}`, { token: TOKEN })).status).toBe(204);
    const stary = nowa({ hub: 'stary', eventsEnabled: true });
    await zarejestruj(stary);
    const ds = await delta(stary, ladunek(1));
    expect([ds.status, ds.json]).toEqual([202, { ok: true, delivered: 0, seq: 1 }]);
    expect((await zmiany(stary, '?since=0')).json.error.code).toBe('hub_unavailable');
    expect((await zdarzenia(stary, [zdarzenie(1)])).json.error.code).toBe('hub_unavailable');
    const kv = nowa({ hub: 'kv', eventsEnabled: true });
    await zarejestruj(kv);
    expect((await delta(kv, ladunek(1))).json).toEqual({ ok: true, delivered: 0, seq: 1 });
    await tura();
    const leg = await zmiany(kv, '?since=0');
    expect([leg.status, Object.keys(leg.json), seqs(leg.json), leg.json.headSeq]).toEqual([200, ['deltas', 'count', 'headSeq', 'snapshotSeq'], [1], 1]);
    expect((await zmiany(kv, '?since=0&limit=5')).json.error.code).toBe('hub_not_sqlite');
    expect((await zdarzenia(kv, [zdarzenie(1)])).json.error.code).toBe('hub_not_sqlite');
  });

  it('K25: 507 log_full — bez wiersza i lustra, ramka delta bez seq ze stored:false; /events bez ramki; duplikaty przy pełnym → 200 (slot_hub.js:625-634)', async () => {
    const a = nowa({ eventsEnabled: true });
    await zarejestruj(a);
    expect((await zdarzenia(a, [zdarzenie(1)])).status).toBe(200);
    a.ustaw({ limity: { maxLogBytes: 10 } });
    const d = await delta(a, ladunek(2));
    expect([d.status, d.json.error.code]).toEqual([507, 'log_full']);
    expect([a.slot().dz.ev.length, a.slot().lustro.length]).toEqual([1, 0]);
    expect(a.ramki.at(-1).ramka).toMatchObject({ type: 'delta', stored: false });
    expect('seq' in a.ramki.at(-1).ramka).toBe(false);
    const ile = a.ramki.length;
    expect((await zdarzenia(a, [zdarzenie(3)])).status).toBe(507);
    expect(a.ramki.length, '/events przy 507 bez ramki').toBe(ile);
    const dup = await zdarzenia(a, [zdarzenie(1)]);
    expect([dup.status, dup.json.accepted]).toEqual([200, [{ eid: uuid(1), seq: 1, dup: true }]]);
  });

  it('K26: dziennik v36 — limit ignorowany, /delta bez stored, lustroOpoznione; lustro: jedna strona 100 bez CAP, TTL tylko przy przycinaniu po /delta i GC GET /deltas (v36/changes.mjs:30-64; v36/delta_log.mjs:69-139; README.md:155)', async () => {
    const a = nowa({ tryb: 'v36', limity: { slotRpm: 1000 } });
    await zarejestruj(a);
    const d = await delta(a, ladunek(1));
    expect(d.json).toEqual({ ok: true, delivered: 0, seq: 1 });
    await tura();
    for (const q of ['?since=0&limit=5', '?since=-1&limit=abc']) {
      const r = await zmiany(a, q);
      expect([q, r.status, Object.keys(r.json), seqs(r.json)]).toEqual([q, 200, ['deltas', 'count', 'headSeq', 'snapshotSeq'], [1]]);
    }
    a.usterka({ gdy: { trasa: 'delta' }, lustroOpoznione: true });
    expect((await delta(a, ladunek(2))).json.seq).toBe(2);
    await tura();
    const bez = await zmiany(a, '?since=1');
    expect([seqs(bez.json), bez.json.headSeq], 'headSeq wyprzedza treść (README.md:41)').toEqual([[], 2]);
    a.zwolnijWszystko();
    await tura();
    expect(seqs((await zmiany(a, '?since=1')).json)).toEqual([2]);
    for (let i = 3; i <= 205; i += 1) a.dopisz({ payload: ladunek(i), lustro: true });
    expect(a.slot().lustro.length, 'zasiew bez przycinania').toBe(205);
    expect((await delta(a, ladunek(206))).json.seq).toBe(206);
    await tura();
    expect(a.slot().lustro.length, 'v36 przycina tylko pierwszą stronę (100): CAP 200 nie działa').toBe(206);
    const strona = await zmiany(a, '?since=0');
    expect([strona.json.count, strona.json.deltas[0].seq, strona.json.headSeq], 'jedna strona R2.list (100) od najstarszego klucza').toEqual([100, 1, 206]);
    a.zegar.przesun(TTL + 1);
    expect((await zmiany(a, '?since=0')).json.count, 'odczyt /changes bez TTL (listDeltasSince)').toBe(100);
    const l = await zadaj(a, 'GET', `/v1/slots/${SLOT}/deltas`, { token: TOKEN });
    expect([l.json.count, a.slot().lustro.length], 'GET /deltas: TTL i GC w pierwszej stronie').toEqual([0, 106]);
    expect(seqs((await zmiany(a, '?since=0')).json).slice(0, 2)).toEqual([101, 102]);
    await delta(a, ladunek(207));
    await tura();
    expect(a.slot().lustro.map((e) => e.seq), 'przycinanie po /delta: TTL w pierwszej stronie').toEqual([201, 202, 203, 204, 205, 206, 207]);
    // v37a stronicuje listy: CAP 200 po całym lustrze (src/utils/delta_log.js:51-64,148-166)
    const c = nowa({ limity: { syncRpm: 1000 } });
    await zarejestruj(c);
    for (let i = 1; i <= 205; i += 1) await delta(c, ladunek(i));
    expect([c.slot().lustro.length, c.slot().lustro[0].seq], 'v37a: CAP 200 po całości').toEqual([200, 6]);
  });

  it('K26b: import ogona v36 — powrót do v37a po > 3 dniach bez zapisu daje treść; /delta przy importPending nie przycina (from, to] (slot_hub.js:204-246,899-933; delta.js:100-107; delta_log.js:148-166,193-225)', async () => {
    // ponowny import (first:false): v37a → v36 przy starym DO → v37a
    const b = nowa();
    await zarejestruj(b);
    await delta(b, ladunek(1));
    b.ustaw({ tryb: 'v36', hub: 'stary' });
    await delta(b, ladunek(2));
    await delta(b, ladunek(3));
    await tura();
    expect(b.slot().dz.ev.length, 'stary DO: numery bez wierszy ev').toBe(1);
    b.zegar.przesun(TTL + 1);
    b.ustaw({ tryb: 'v37a', hub: 'sql' });
    expect(b.slot().dz.importRange).toEqual({ from: 1, to: 3, first: false });
    const imp = await zmiany(b, '?since=0&limit=10');
    expect(imp.json.deltas.map((x) => [x.seq, x.eid.slice(0, 3)]), 'import bez TTL').toEqual([[1, 'd:0'], [2, 'r2:'], [3, 'r2:']]);
    expect([imp.json.requiresBase, imp.json.oldestSeq]).toEqual([false, 1]);
    expect(b.slot().dz.importRange).toBe(null);
    // pierwszy import (first:true) po > 3 dniach: treść, oldestSeq 1, requiresBase false przy kursorze 0
    const p = nowa({ tryb: 'v36', hub: 'stary' });
    await zarejestruj(p);
    for (let i = 1; i <= 3; i += 1) await delta(p, ladunek(i));
    await tura();
    p.zegar.przesun(TTL + 1);
    p.ustaw({ tryb: 'v37a', hub: 'sql' });
    const pi = await zmiany(p, '?since=0&limit=10');
    expect([pi.json.deltas.map((x) => (x.gap ? 'gap' : x.eid.slice(0, 3)) + x.seq), pi.json.oldestSeq, pi.json.requiresBase]).toEqual([['r2:1', 'r2:2', 'r2:3'], 1, false]);
    // importPending: 150 delt v36, potem 100 /delta v37a przed pierwszym /changes — CAP bez numerów (0, 150]
    const q = nowa({ tryb: 'v36', hub: 'stary', limity: { slotRpm: 1000 } });
    await zarejestruj(q);
    for (let i = 1; i <= 150; i += 1) { await delta(q, ladunek(i)); await tura(); }
    q.ustaw({ tryb: 'v37a', hub: 'sql' });
    expect(q.slot().dz.importRange).toEqual({ from: 0, to: 150, first: true });
    for (let i = 151; i <= 250; i += 1) await delta(q, ladunek(i));
    expect(q.slot().lustro.length, 'ogon chroniony przed CAP').toBe(250);
    const qi = await zmiany(q, '?since=0&limit=500');
    expect([qi.json.count, qi.json.deltas.filter((x) => x.gap).length, qi.json.oldestSeq]).toEqual([250, 0, 1]);
  });

  it('K27: DELETE i ponowna rejestracja — 204, licznik zostaje, oldest = head+1, numeracja dalej (remove.js:48-100; remove_v37.test.mjs:18-40,101-117)', async () => {
    const a = nowa();
    await zarejestruj(a);
    for (let i = 1; i <= 5; i += 1) await delta(a, ladunek(i));
    const r = await zadaj(a, 'DELETE', `/v1/slots/${SLOT}`, { token: TOKEN });
    expect([r.status, r.cialo]).toEqual([204, null]);
    expect((await status(a)).status).toBe(401);
    const dz = a.slot().dz;
    expect([dz.ev.length, dz.head, dz.oldest, a.slot().lustro.length, a.slot().blob]).toEqual([0, 5, 6, 0, null]);
    expect(a.ramki.at(-1).ramka).toMatchObject({ type: 'changed', etag: null });
    await zarejestruj(a);
    expect([(await delta(a, ladunek(6))).json.seq, (await delta(a, ladunek(7))).json.seq]).toEqual([6, 7]);
    expect(seqs((await zmiany(a, '?since=5')).json)).toEqual([6, 7]);
    expect(seqs((await zmiany(a, '?since=0')).json)).toEqual([6, 7]);
    expect((await zmiany(a, '?since=3&limit=10')).json.requiresBase).toBe(true);
    const h = nowa();
    await zarejestruj(h);
    h.usterka({ gdy: { trasa: 'delete' }, kod: 'hub_error' });
    const e = await zadaj(h, 'DELETE', `/v1/slots/${SLOT}`, { token: TOKEN });
    expect([e.status, e.json.error.code, (await status(h)).status], 'KV zostaje — ponowienie przejdzie uwierzytelnienie').toEqual([500, 'hub_error', 200]);
  });

  it('K28: adapter fetch — Response, AbortError przed i w bramie, faza przed/po, zgub, siec, keepalive 64 KiB w locie', async () => {
    const a = nowa();
    await zarejestruj(a);
    const p = a.polacz('A');
    const url = `${p.adres}/v1/slots/${SLOT}/delta`;
    const wyslij = (i, o = {}) => p.fetch(url, { method: 'POST', body: JSON.stringify({ token: TOKEN, payload: ladunek(i) }), ...o });
    const ile = () => a.slot().dz.ev.length;
    const ac0 = new AbortController();
    ac0.abort();
    await expect(wyslij(0, { signal: ac0.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect([ile(), a.zadania.at(-1).wynik]).toEqual([0, 'przerwana-przed']);
    const przed = a.wstrzymaj({ trasa: 'delta' }, { faza: 'przed' });
    const ac1 = new AbortController();
    const w1 = wyslij(1, { signal: ac1.signal });
    await przed.osiagnieta;
    ac1.abort();
    await expect(w1).rejects.toMatchObject({ name: 'AbortError' });
    expect(ile(), 'faza przed + abort: nic nie zastosowane').toBe(0);
    const po = a.wstrzymaj({ trasa: 'delta' }, { faza: 'po' });
    const ac2 = new AbortController();
    const w2 = wyslij(2, { signal: ac2.signal });
    await po.osiagnieta;
    ac2.abort();
    await expect(w2).rejects.toMatchObject({ name: 'AbortError' });
    expect([ile(), a.zadania.at(-1).wynik], 'faza po + abort: zastosowane, odpowiedź przepada').toEqual([1, 'przerwana-po']);
    a.usterka({ gdy: { trasa: 'delta' }, zgub: true });
    await expect(wyslij(3)).rejects.toThrow(TypeError);
    expect([ile(), a.zadania.at(-1).wynik]).toEqual([2, 'zgubiona']);
    a.usterka({ gdy: { trasa: 'delta' }, siec: true });
    await expect(wyslij(4)).rejects.toThrow(TypeError);
    expect([ile(), a.zadania.at(-1).wynik]).toEqual([2, 'siec']);
    const ms = a.usterka({ gdy: { trasa: 'delta' }, opoznienie: { ms: 5 } });
    const res = await wyslij(5);
    expect([res instanceof Response, res.status, ms.trafienia]).toEqual([true, 202, 1]);
    const brama = a.wstrzymaj({ trasa: 'status' }, { faza: 'przed' });
    const duzy = p.fetch(`${p.adres}/v1/slots/${SLOT}/status`, { headers: { Authorization: 'Bearer ' + TOKEN }, method: 'GET', keepalive: true, body: null });
    const k1 = p.fetch(url, { method: 'POST', keepalive: true, body: JSON.stringify({ token: TOKEN, payload: { iv: 'A', data: 'x'.repeat(40 * 1024) } }) });
    await expect(p.fetch(url, { method: 'POST', keepalive: true, body: 'y'.repeat(30 * 1024) })).rejects.toThrow(TypeError);
    expect(a.zadania.at(-1).wynik).toBe('siec');
    expect((await k1).status).toBe(202);
    brama.zwolnij();
    expect((await duzy).status).toBe(200);
  });

  it('K29: adapter beacon — typ treści, true synchronicznie, token w ciele, wspólny limit 64 KiB, rezerwa fetchOkna no-cors (integracja 1:20276)', async () => {
    const a = nowa();
    await zarejestruj(a);
    const p = a.polacz('A');
    const url = `${p.adres}/v1/slots/${SLOT}/delta`;
    const cialo = (i, n = 0) => JSON.stringify({ token: TOKEN, payload: { iv: 'AAAAAAAAAAAAAAAA', data: 'x'.repeat(n) + i } });
    expect(p.beacon(url, cialo(1))).toBe(true);
    expect(a.zadania.at(-1).wynik, 'przetworzenie później').toBe('w-locie');
    expect(p.beacon(url, new Blob([cialo(2)], { type: 'text/plain' }))).toBe(true);
    await tura();
    await tura();
    expect(a.zadania.map((z) => [z.transport, z.naglowki.contentType, z.status, z.tokenWCiele, z.keepalive, z.tryb]).slice(-2)).toEqual([
      ['beacon', 'text/plain;charset=UTF-8', 202, 'zgodny', true, 'no-cors'], ['beacon', 'text/plain', 202, 'zgodny', true, 'no-cors'],
    ]);
    expect(p.beacon(url, cialo(3, 40 * 1024))).toBe(true);
    expect(p.beacon(url, cialo(4, 30 * 1024)), 'drugi beacon ponad wspólny limit 64 KiB').toBe(false);
    expect(a.zadania.at(-1).wynik).toBe('beacon-odrzucony');
    await tura();
    await tura();
    expect(a.slot().dz.ev.length).toBe(3);
    const n = await p.fetchOkna(url, { method: 'POST', body: new Blob([cialo(5)], { type: 'text/plain' }), mode: 'no-cors', credentials: 'omit' });
    expect([n.type, n.status, n.ok]).toEqual(['opaque', 0, false]);
    await expect(n.json()).rejects.toThrow(TypeError);
    expect([a.slot().dz.ev.length, a.zadania.at(-1).transport, a.rzutOsi().filter((l) => /\(fetch okna\)$/.test(l)).length]).toEqual([4, 'fetch-okna', 1]);
    expect(a.rzutOsi().filter((l) => /\(beacon\)$/.test(l)).length).toBe(3);
  });

  it('K30: rejestr i naruszenia — ścieżki z aliasem slotu, bez tokenu i hasha; obcy host, trasy poza modelem, nieznana trasa', async () => {
    const a = nowa();
    await zarejestruj(a);
    await zarejestruj(a, { slot: SLOT2, token: TOKEN2 });
    await delta(a, ladunek(1));
    await status(a, { slot: SLOT2, token: TOKEN2 });
    expect(a.zadania.map((z) => z.sciezka)).toEqual(['/v1/slots/<slot>/register', '/v1/slots/<slot-2>/register', '/v1/slots/<slot>/delta', '/v1/slots/<slot-2>/status']);
    const tekst = JSON.stringify(a.zadania) + JSON.stringify(a.os);
    for (const tajne of [TOKEN, TOKEN2, hash(TOKEN), hash(TOKEN2), SLOT, SLOT2]) expect(tekst.includes(tajne)).toBe(false);
    const p = a.polacz('A');
    await expect(p.fetch('https://inny-host.invalid/v1/health')).rejects.toThrow(TypeError);
    await expect(p.fetch(`${p.adres}/v1/slots/${SLOT}/entitlement`, { headers: { Authorization: 'Bearer ' + TOKEN } })).rejects.toThrow(TypeError);
    await expect(p.fetch(`${p.adres}/v1/slots/${SLOT}/passkey/cred-fikcyjny`, { method: 'PUT', body: '{}' })).rejects.toThrow(TypeError);
    const nz = await p.fetch(`${p.adres}/v1/nie-ma`);
    expect(nz.status).toBe(404);
    expect(a.naruszenia.map((x) => x.rodzaj)).toEqual(['poza-atrapa', 'trasa-poza-modelem', 'trasa-poza-modelem', 'nieznana-trasa']);
    expect(a.naruszenia[0].opis).toContain('inny-host.invalid');
    expect(() => sprawdzCzystosc(a)).toThrow(/trasa-poza-modelem/);
    expect(a.przyjmijNaruszenia((x) => x.rodzaj === 'trasa-poza-modelem').length).toBe(2);
    expect(a.przyjmijNaruszenia().length).toBe(2);
    expect(() => sprawdzCzystosc(a)).not.toThrow();
  });

  it('K31: nagłówek wierności — SHA 4551678 i odwołanie src/…:N do każdej trasy i każdego kodu usterki', () => {
    const src = readFileSync(new URL('../support/atrapa-workera-sync.mjs', import.meta.url), 'utf8');
    const naglowek = src.slice(0, src.indexOf('\nimport '));
    expect(naglowek).toMatch(/4551678/);
    expect(naglowek).toMatch(/8396f47/);
    const brak = [];
    for (const t of [...TRASY_MODELU, ...TRASY_POZA_MODELEM]) {
      if (!/^src\/\S+\.js:\d+/.test(t.odwolanie) || !naglowek.includes(t.odwolanie)) brak.push(`trasa ${t.klucz}: ${t.odwolanie}`);
    }
    for (const [kod, k] of Object.entries(KODY_USTEREK)) {
      if (!/^src\/\S+\.js:\d+/.test(k.odwolanie) || !naglowek.includes(k.odwolanie) || !naglowek.includes(kod)) brak.push(`kod ${kod}: ${k.odwolanie}`);
    }
    expect(brak).toEqual([]);
    expect(TRASY_MODELU.map((t) => t.klucz).sort()).toEqual(['blob', 'blob-put', 'changes', 'delete', 'delta', 'deltas', 'events', 'health', 'register', 'register-identity', 'restore-prev', 'status']);
  });

  it('K32: restore-prev i /deltas — zamiana z nowym ETagiem i blobSeq, 404 no_archive; lista lustra po kluczu (restore_prev.js:39-130; deltas_list.js:21-47)', async () => {
    const a = nowa();
    const e1 = (await zarejestruj(a, { cialo: 'pierwszy' })).json.etag;
    expect((await zadaj(a, 'POST', `/v1/slots/${SLOT}/blob/restore-prev`, { token: TOKEN })).json.error.code).toBe('no_archive');
    await delta(a, ladunek(1));
    const e2 = (await zadaj(a, 'PUT', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-match': `"${e1}"` }, cialo: 'drugi-dłuższy' })).json.etag;
    await delta(a, ladunek(2));
    const e3 = (await zadaj(a, 'PUT', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-match': `"${e2}"` }, cialo: 'trzeci' })).json.etag;
    expect([a.slot().dz.blobSeq, a.slot().dz.prevBlobSeq]).toEqual([2, 1]);
    const r = await zadaj(a, 'POST', `/v1/slots/${SLOT}/blob/restore-prev`, { token: TOKEN });
    expect([r.status, Object.keys(r.json), r.json.size, r.json.archived]).toEqual([200, ['etag', 'updatedAt', 'size', 'archived'], new TextEncoder().encode('drugi-dłuższy').length, { size: 6 }]);
    expect([r.json.etag === e3, r.naglowki.etag]).toEqual([false, `"${r.json.etag}"`]);
    expect([a.slot().dz.blobSeq, a.slot().dz.prevBlobSeq], 'notify kind restore zamienia blobSeq').toEqual([1, 2]);
    const l = await zadaj(a, 'GET', `/v1/slots/${SLOT}/deltas`, { token: TOKEN });
    expect([l.json.count, l.json.deltas.map((x) => x.key.replace(SLOT, '<slot>'))]).toEqual([2, ['<slot>/d/s000000000001-00000001', '<slot>/d/s000000000002-00000002']]);
  });

  it('K33: usterka bez skutku — kod, którego bieżący tryb albo hub nie wytwarza: zwykła odpowiedź, trafienia 0, zastosowano false, naruszenie usterka-bez-skutku; zużycie per żądanie', async () => {
    const przypadki = [
      // v36 /changes nie woła DO (v36/changes.mjs:30-64); stary DO: /append → 404 przed licznikiem; v36 DELETE bez /wipe (v36/remove.mjs:49-94)
      ['v36 changes', { tryb: 'v36' }, { trasa: 'changes' }, 'hub_unavailable', (a) => zmiany(a, '?since=0'), 200],
      ['stary delta', { hub: 'stary' }, { trasa: 'delta' }, 'rate_limited', (a) => delta(a, ladunek(1)), 202],
      ['v36 delete', { tryb: 'v36' }, { trasa: 'delete' }, 'hub_error', (a) => zadaj(a, 'DELETE', `/v1/slots/${SLOT}`, { token: TOKEN }), 204],
    ];
    for (const [nazwa, opcje, gdy, kod, wywolaj, st] of przypadki) {
      const a = nowa(opcje);
      await zarejestruj(a);
      const u = a.usterka({ gdy, kod });
      const r = await wywolaj(a);
      expect([nazwa, r.status, u.trafienia, r.meta.zastosowano]).toEqual([nazwa, st, 0, false]);
      const n = a.przyjmijNaruszenia();
      expect([nazwa, n.map((x) => x.rodzaj), /bez skutku \[kod\]/.test(n[0].opis)]).toEqual([nazwa, ['usterka-bez-skutku'], true]);
    }
    const ok = nowa();
    await zarejestruj(ok);
    const u = ok.usterka({ gdy: { trasa: 'changes' }, kod: 'hub_unavailable' });
    const r = await zmiany(ok, '?since=0');
    expect([r.status, u.trafienia, r.meta.zastosowano], 'ten sam kod przy v37a i sql').toEqual([503, 1, true]);
    const dwa = ok.usterka({ gdy: { trasa: 'status', ile: 2 }, kod: 'internal_error' });
    expect([(await status(ok)).status, (await status(ok)).status, (await status(ok)).status, dwa.trafienia], 'ile 2: każde przypięte żądanie').toEqual([500, 500, 200, 2]);
    // dwie bramy przed na jednym żądaniu: działa pierwsza, druga bez skutku
    const p = ok.polacz('A');
    const b1 = ok.wstrzymaj({ trasa: 'status' });
    ok.wstrzymaj({ trasa: 'status' });
    const w = p.fetch(`${p.adres}/v1/slots/${SLOT}/status`, { headers: { Authorization: 'Bearer ' + TOKEN } });
    await b1.osiagnieta;
    b1.zwolnij();
    expect((await w).status).toBe(200);
    expect(ok.przyjmijNaruszenia().map((x) => [x.rodzaj, /bez skutku \[opoznienie\]/.test(x.opis)])).toEqual([['usterka-bez-skutku', true]]);
  });

  it('K34: adapter fetch — domyślny Content-Type ciała jak przeglądarka; /events przez fetchOkna z Blob text/plain i tokenem w ciele zapisane (events.js:82-85; integracja Bsb_wyslij)', async () => {
    const a = nowa({ eventsEnabled: true });
    await zarejestruj(a);
    const p = a.polacz('A');
    const url = `${p.adres}/v1/slots/${SLOT}/events`;
    const cialo = (n) => JSON.stringify({ token: TOKEN, events: [zdarzenie(n)] });
    const ost = () => [a.zadania.at(-1).status, a.zadania.at(-1).naglowki.contentType];
    const n = await p.fetchOkna(url, { method: 'POST', body: new Blob([cialo(1)], { type: 'text/plain' }), mode: 'no-cors', credentials: 'omit' });
    expect([n.type, ...ost(), a.slot().dz.ev.length]).toEqual(['opaque', 200, 'text/plain', 1]);
    await p.fetch(url, { method: 'POST', body: cialo(2) });
    expect(ost(), 'napis').toEqual([200, 'text/plain;charset=UTF-8']);
    await p.fetch(url, { method: 'POST', body: new URLSearchParams({ x: '1' }) });
    expect(ost(), 'URLSearchParams').toEqual([415, 'application/x-www-form-urlencoded;charset=UTF-8']);
    await p.fetch(url, { method: 'POST', body: new Blob([cialo(3)]) });
    expect(ost(), 'Blob bez typu: bez nagłówka').toEqual([415, null]);
    await p.fetch(url, { method: 'POST', body: new TextEncoder().encode(cialo(4)) });
    expect(ost(), 'Uint8Array: bez nagłówka').toEqual([415, null]);
    await p.fetch(url, { method: 'POST', body: cialo(5), headers: { 'Content-Type': 'application/json' } });
    expect(ost(), 'jawny nagłówek zostaje').toEqual([200, 'application/json']);
    expect(a.slot().dz.ev.map((x) => x.seq)).toEqual([1, 2, 3]);
  });

  it('K35: sprawdzCzystosc rzuca przy żądaniu w locie; zdejmijStraznikaSieci przywraca fetch sprzed instalacji, instalacja idempotentna', async () => {
    const a = nowa();
    await zarejestruj(a);
    const p = a.polacz('A');
    const brama = a.wstrzymaj({ trasa: 'status' });
    const w = p.fetch(`${p.adres}/v1/slots/${SLOT}/status`, { headers: { Authorization: 'Bearer ' + TOKEN } });
    await brama.osiagnieta;
    expect(() => sprawdzCzystosc(a)).toThrow(/żądanie w locie #1 GET \/v1\/slots\/<slot>\/status \(A\)/);
    brama.zwolnij();
    expect((await w).status).toBe(200);
    expect(() => sprawdzCzystosc(a)).not.toThrow();
    // Synchronicznie: między zdjęciem a ponowną instalacją nie biegnie żaden kod (żadnego wywołania fetch).
    const d = straznik().dyspozytor;
    expect(globalThis.fetch).toBe(d);
    try {
      zdejmijStraznikaSieci();
      const pierwotny = globalThis.fetch;
      expect([pierwotny === d, straznik().zainstalowany]).toEqual([false, false]);
      zainstalujStraznikaSieci();
      zainstalujStraznikaSieci();
      expect(globalThis.fetch).toBe(d);
      zdejmijStraznikaSieci();
      expect(globalThis.fetch === pierwotny, 'podwójna instalacja nie gubi fetch sprzed pierwszej').toBe(true);
    } finally {
      zainstalujStraznikaSieci();
    }
    expect([globalThis.fetch === d, straznik().zainstalowany]).toEqual([true, true]);
  });

  it('K36: budżet DO na minutę — zdarzenia i bajty: druga partia ponad budżet → 429 z Retry-After, duplikaty poza budżetem, pusta minuta przyjmuje partię ponad budżet (slot_hub.js:434-445,607-624)', async () => {
    const a = nowa({ eventsEnabled: true, limity: { syncEventsPm: 3 } });
    await zarejestruj(a);
    expect((await zdarzenia(a, [zdarzenie(1), zdarzenie(2)])).status).toBe(200);
    const r = await zdarzenia(a, [zdarzenie(3), zdarzenie(4)]);
    expect([r.status, r.json.error.code, r.naglowki['retry-after'], r.json.error.retryAfterSeconds]).toEqual([429, 'rate_limited', '55', 55]);
    expect((await zdarzenia(a, [zdarzenie(1)])).json.accepted, 'same duplikaty nie zużywają budżetu').toEqual([{ eid: uuid(1), seq: 1, dup: true }]);
    a.zegar.doNastepnejMinuty();
    const duza = await zdarzenia(a, [5, 6, 7, 8, 9].map((i) => zdarzenie(i)));
    expect([duza.status, duza.json.headSeq], 'pierwsza partia w oknie przechodzi zawsze').toEqual([200, 7]);
    const b = nowa({ eventsEnabled: true, limity: { syncBytesPm: 60 } });
    await zarejestruj(b);
    expect([(await zdarzenia(b, [zdarzenie(1)])).status, (await zdarzenia(b, [zdarzenie(2)])).status], 'bajty: 45 + 45 > 60').toEqual([200, 429]);
  });

  it('K37: import ogona v36 z brakującym obiektem lustra — zaślepka dla numeru bez treści (slot_hub.js:899-933)', async () => {
    const a = nowa();
    await zarejestruj(a);
    await delta(a, ladunek(1));
    a.ustaw({ tryb: 'v36', hub: 'stary' });
    a.usterka({ gdy: { trasa: 'delta' }, lustroOpoznione: true });
    await delta(a, ladunek(2));
    await delta(a, ladunek(3));
    await tura();
    expect(a.slot().lustro.map((e) => e.seq)).toEqual([1, 3]);
    a.ustaw({ tryb: 'v37a', hub: 'sql' });
    const r = await zmiany(a, '?since=0&limit=10');
    expect(r.json.deltas.map((x) => [x.seq, x.gap ? 'gap' : x.eid.slice(0, 3)])).toEqual([[1, 'd:0'], [2, 'gap'], [3, 'r2:']]);
    expect([r.json.oldestSeq, r.json.requiresBase]).toEqual([1, false]);
  });

  it('K38: kolejność kroków — /events: 413 → Bearer → 415 → ciało → token z ciała → invalid_events; /delta: token przed invalid_delta (events.js:65-116; delta.js:50-82)', async () => {
    const a = nowa({ eventsEnabled: true });
    await zarejestruj(a);
    const kod = (r) => [r.status, r.json.error.code];
    expect(kod(await zdarzenia(a, null, { token: TOKEN2, naglowki: { 'content-length': '1048577' }, cialo: '{}' })), '413 przed Bearer').toEqual([413, 'payload_too_large']);
    expect(kod(await zdarzenia(a, [zdarzenie(1)], { token: TOKEN2, naglowki: {} })), 'zły Bearer przed 415').toEqual([401, 'invalid_credentials']);
    expect(kod(await zdarzenia(a, null, { token: null, naglowki: {}, cialo: JSON.stringify({ token: TOKEN, events: [zdarzenie(2)] }) })), 'bez Bearer: 415 przed tokenem z ciała').toEqual([415, 'unsupported_media_type']);
    expect(kod(await zdarzenia(a, null, { token: null, naglowki: { 'content-type': 'text/plain' }, cialo: JSON.stringify({ token: TOKEN2, events: [] }) })), 'token z ciała przed invalid_events').toEqual([401, 'invalid_credentials']);
    expect(kod(await delta(a, { data: 'x' }, { token: TOKEN2 })), 'token przed invalid_delta').toEqual([401, 'invalid_credentials']);
    expect(kod(await delta(a, { data: 'x' }))).toEqual([400, 'invalid_delta']);
  });

  it('K39: nagłówki i ramki — /status X-Slot-Updated-At, GET /blob 200 z ETag (też przez CORS), ramka changed po PUT z etag i updatedAt (status.js:46-54; download.js:80-86; upload.js:203-209)', async () => {
    const a = nowa();
    const e = (await zarejestruj(a)).json.etag;
    const s = await status(a);
    expect([s.naglowki['x-slot-updated-at'], s.naglowki.etag]).toEqual([s.json.updatedAt, `"${e}"`]);
    const b = await zadaj(a, 'GET', `/v1/slots/${SLOT}/blob`, { token: TOKEN });
    expect([b.status, b.naglowki.etag, b.naglowki['x-slot-updated-at']]).toEqual([200, `"${e}"`, s.json.updatedAt]);
    const p = a.polacz('A');
    const res = await p.fetch(`${p.adres}/v1/slots/${SLOT}/blob`, { headers: { Authorization: 'Bearer ' + TOKEN } });
    expect([res.status, res.headers.get('ETag'), res.headers.get('X-Slot-Updated-At')]).toEqual([200, `"${e}"`, s.json.updatedAt]);
    await res.arrayBuffer();
    a.zegar.przesun(1000);
    const put = await zadaj(a, 'PUT', `/v1/slots/${SLOT}/blob`, { token: TOKEN, naglowki: { 'if-match': `"${e}"` }, cialo: 'nowy' });
    expect(put.json.updatedAt).not.toBe(s.json.updatedAt);
    expect(a.ramki.at(-1).ramka).toEqual({ type: 'changed', etag: put.json.etag, updatedAt: put.json.updatedAt, ts: Date.UTC(2026, 9, 30, 8, 0, 6) });
  });

  it('K40: osobny kubełek rl:slot na slot; v36 /delta: 413 po odczycie, Content-Length ignorowany; granica eventBytes włącznie; originy v36 (ratelimit.js:148-182; v36/delta.mjs:38-52; events.js:55; v36/cors.mjs)', async () => {
    const a = nowa({ limity: { slotRpm: 1 } });
    await zarejestruj(a);
    await zarejestruj(a, { slot: SLOT2, token: TOKEN2 });
    expect([(await status(a)).status, (await status(a, { slot: SLOT2, token: TOKEN2 })).status, (await status(a)).status]).toEqual([200, 200, 429]);
    const v = nowa({ tryb: 'v36' });
    await zarejestruj(v);
    const d = await delta(v, { iv: 'x', data: 'y'.repeat(66000) });
    expect([d.status, d.json.error.code]).toEqual([413, 'payload_too_large']);
    expect((await delta(v, ladunek(1), { naglowki: { 'content-length': '70000' } })).status, 'v36: deklaracja bez znaczenia').toBe(202);
    const e = nowa({ eventsEnabled: true, limity: { eventBytes: 300 } });
    await zarejestruj(e);
    // JSON {iv,data} = 35 bajtów + długość data
    const r = await zdarzenia(e, [zdarzenie(1, { data: 'x'.repeat(265) }), zdarzenie(2, { data: 'x'.repeat(266) })]);
    expect([r.status, r.json.accepted.map((x) => x.seq), r.json.rejected]).toEqual([200, [1], [{ eid: uuid(2), code: 'oversize' }]]);
    const pre = async (tryb, origin) => (await zadaj(nowa({ tryb }), 'OPTIONS', `/v1/slots/${SLOT}/status`, { naglowki: { origin } })).status;
    expect([await pre('v37a', 'https://wagaiwzrost.pl'), await pre('v36', 'https://wagaiwzrost.pl'), await pre('v36', 'https://vildaclinic.github.io')]).toEqual([204, 403, 204]);
  });

  it('K41: silnik usterek i ruch — filtr urządzenia w bramie, gdy.ktore, licznik aktywności, czytanie ciała przez json() i getReader()', async () => {
    const a = nowa();
    await zarejestruj(a);
    const A = a.polacz('A');
    const B = a.polacz('B');
    const st = (p) => p.fetch(`${p.adres}/v1/slots/${SLOT}/status`, { headers: { Authorization: 'Bearer ' + TOKEN } });
    const brama = a.wstrzymaj({ trasa: 'status', urzadzenie: 'A' });
    const wB = st(B);
    await tura();
    expect([a.zadania.at(-1).urzadzenie, a.zadania.at(-1).wynik], 'B bez bramy').toEqual(['B', 'odpowiedz']);
    const wA = st(A);
    await brama.osiagnieta;
    expect([a.ruch('A').wLocie, a.ruch('B').wLocie]).toEqual([1, 0]);
    brama.zwolnij();
    expect([(await wA).status, (await wB).status]).toEqual([200, 200]);
    a.usterka({ gdy: { trasa: 'status', ktore: 2 }, kod: 'internal_error' });
    const kody = [];
    for (let i = 0; i < 3; i += 1) kody.push((await st(A)).status);
    expect(kody).toEqual([200, 500, 200]);
    const akt = a.aktywnosc();
    const r1 = await st(A);
    expect(a.aktywnosc()).toBeGreaterThan(akt);
    const pj = r1.json();
    expect(a.ruch('A').konsumpcje, 'json() w toku').toBeGreaterThan(0);
    await pj;
    expect(a.ruch('A').konsumpcje).toBe(0);
    const rd = (await st(A)).body.getReader();
    expect(a.ruch('A').konsumpcje, 'getReader() do done').toBe(1);
    for (let x = await rd.read(); !x.done; x = await rd.read()) { /* czytanie do końca */ }
    expect(a.ruch('A').konsumpcje).toBe(0);
  });

  it('K42: restart instancji DO — wdrożenie (zmiana tryb albo hub) i ewikcjaDO zerują licznik i wykrywają import; zmiana limitów bez restartu (slot_hub.js:182,232-246)', async () => {
    const a = nowa({ limity: { syncRpm: 2 } });
    await zarejestruj(a);
    const pelny = async () => { await zmiany(a, '?since=0'); await zmiany(a, '?since=0'); return (await zmiany(a, '?since=0')).status; };
    expect(await pelny()).toBe(429);
    a.ustaw({ limity: { slotRpm: 41 } });
    expect((await zmiany(a, '?since=0')).status, 'limity: bez restartu').toBe(429);
    a.ustaw({ tryb: 'v36' });
    a.ustaw({ tryb: 'v37a' });
    expect(licznikDO(a), 'wdrożenie: nowa instancja, licznik od zera').toBe(0);
    expect(await pelny()).toBe(429);
    a.ustaw({ hub: 'kv' });
    a.ustaw({ hub: 'sql' });
    expect((await zmiany(a, '?since=0')).status).toBe(200);
    a.wymusDziure({ ile: 2 });
    a.ustaw({ limity: { slotRpm: 40 } });
    expect(a.slot().dz.importRange, 'limity: bez wykrycia importu').toBe(null);
    a.ewikcjaDO();
    expect([licznikDO(a), a.slot().dz.importRange], 'ewikcja: licznik od zera i wykrycie ogona').toEqual([0, { from: 0, to: 2, first: true }]);
  });
});
