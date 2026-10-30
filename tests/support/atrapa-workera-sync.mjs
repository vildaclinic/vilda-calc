// E2-PR0 — atrapa workera vilda-sync (v37a i v36) dla testów jednostkowych klienta. Czysty model w pamięci, bez
// node:sqlite i bez sieci: rdzeń obsluz() bez transportu oraz adaptery fetch (Response jak w przeglądarce),
// fetchOkna (rezerwa no-cors integracji) i beacon (navigator.sendBeacon). Dane wyłącznie FIKCYJNE.
//
// WZORZEC: vilda-source@origin/agent/canonical-vilda-sync-source 4551678 (v37a; produkcja 2026-10-30: api 37,
// sqlite true, features changes-paged i aad, EVENTS_ENABLED "0"), v36 = 8396f47 i kopie test/support/v36/*.mjs.
// Ścieżki względem vilda-sync-worker/. Pliki wzorca (4551678): src/worker.js, src/middleware/{auth,ratelimit,cors}.js,
//   src/utils/{responses,etag,validation,realtime,delta_log}.js,
//   src/handlers/{status,download,upload,register,register_identity,remove,restore_prev,delta,deltas_list,changes,events}.js,
//   src/durable/slot_hub.js, wrangler.toml, README.md; testy wzorca: test/{changes_v37,delta_v37,events,
//   limits_cors_health,register_v37,remove_v37,upload_v37,slot_hub_log,slot_hub_wipe,slot_hub_kv_mode,
//   slot_hub_import,okno_wdrozenia}.test.mjs; v36: test/support/v36/{changes,cors,delta,delta_log,realtime,register,
//   remove,restore_prev,slot_hub,upload}.mjs, 8396f47:src/worker.js.
// Zmiana wzorca (nowy commit workera) = przegląd każdej pozycji poniżej i aktualizacja SHA w tej linii: 4551678.
//
// POTOK (kolejność jak src/worker.js:228-285): OPTIONS → preflight (:235-237); GET /v1/health (:240-243); dopasowanie
//   trasy (:183-202; /events pomijane bez EVENTS_ENABLED==='1', :141-143,186) → brak: 404 not_found (:246-251); limit KV
//   slot/registration przed handlerem (:216-224,253-264; src/middleware/ratelimit.js:94-165); handler; wyjątek → 500
//   internal_error (src/worker.js:267-274).
// TRASY MODELU (src/worker.js:87-125):
//   GET  /v1/health                         src/worker.js:127-171 (v36: 8396f47:src/worker.js:118-126)
//   POST /v1/slots/:s/register              src/handlers/register.js:39-149 (v36: v36/register.mjs:41-121)   rl registration
//   POST /v1/slots/:s/register-identity     src/handlers/register_identity.js:48-98                        rl registration
//   PUT  /v1/slots/:s/blob                  src/handlers/upload.js:72-210 (v36: v36/upload.mjs:48-165)       rl slot
//   GET  /v1/slots/:s/blob                  src/handlers/download.js:41-87                                 rl slot
//   GET  /v1/slots/:s/status                src/handlers/status.js:37-55                                   rl slot
//   POST /v1/slots/:s/delta                 src/handlers/delta.js:45-150 (v36: v36/delta.mjs:35-102)         rl do (v36: slot)
//   GET  /v1/slots/:s/deltas                src/handlers/deltas_list.js:21-47, src/utils/delta_log.js:51-64,120-141   rl slot
//   GET  /v1/slots/:s/changes               src/handlers/changes.js:48-109, src/durable/slot_hub.js:655-759
//                                           (v36: v36/changes.mjs:30-64)                                   rl do (v36: slot)
//   POST /v1/slots/:s/events                src/handlers/events.js:59-152, src/durable/slot_hub.js:577-650   rl do
//   POST /v1/slots/:s/blob/restore-prev     src/handlers/restore_prev.js:39-130                            rl slot
//   DELETE /v1/slots/:s                     src/handlers/remove.js:48-100 (v36: v36/remove.mjs:49-94)        rl slot
// TRASY WORKERA POZA MODELEM (dopasowane → naruszenie 'trasa-poza-modelem'): GET /socket src/worker.js:93; POST i GET
//   /trial src/worker.js:106, src/worker.js:108; GET /entitlement src/worker.js:110; GET /checkout src/worker.js:112;
//   POST /v1/stripe/webhook src/worker.js:114; /v1/transfer src/worker.js:118, src/worker.js:119, src/worker.js:120;
//   passkey src/worker.js:122, src/worker.js:123, src/worker.js:124.
// UWIERZYTELNIENIE: Bearer src/middleware/auth.js:41-65 + src/utils/validation.js:21,67-75; token w ciele
//   src/middleware/auth.js:78-111; brak slotu = 401 invalid_credentials (src/middleware/auth.js:91-93,106-108), nie 404.
// LIMITY: KV rl:slot / rl:reg src/middleware/ratelimit.js:46-128,148-182 (okno minuty epoki, Retry-After = windowEnd − nowSec);
//   DO 120/min src/durable/slot_hub.js:70,124-133,421-433 (Retry-After = max(1, ceil((win+60000−now)/1000)));
//   budżet 600 zdarzeń / 4 MiB src/durable/slot_hub.js:81-82,436-445; pułap 1 GiB src/durable/slot_hub.js:83,625-634;
//   rozmiary: src/handlers/delta.js:34, src/handlers/events.js:37-39, src/utils/validation.js:142-146, wrangler.toml:68,89,92.
// ODPOWIEDZI: src/utils/responses.js:15-69 (JSON charset=utf-8, no-store; błąd {error:{code,message}}); 429 +
//   retryAfterSeconds src/middleware/ratelimit.js:119-127, src/utils/realtime.js:119-124; ETag src/utils/etag.js:20-63;
//   CORS src/middleware/cors.js:17-110 (Expose: ETag, X-Api-Version, X-Slot-Updated-At, Retry-After; v36 v36/cors.mjs:21
//   bez Retry-After); X-Api-Version wrangler.toml:70 (v36: 8396f47:wrangler.toml:64).
// DZIENNIK: src/durable/slot_hub.js:53-61 (ev), :519-550 (seq), :528-533 (dup), :683-712 (wiersze, zaślepki), :715-734
//   (legacy), :737-759 (stronicowany), :764-796 (/wipe), :343-352 (blobSeq), :557-575 (ramki), :899-933 (import ogona v36).
// LUSTRO R2: zapis bez przycinania (persistDelta, src/utils/delta_log.js:72-85). TTL 3 dni i CAP 200 (pruneDeltaLog,
//   src/utils/delta_log.js:148-166; v36/delta_log.mjs:121-139) tylko po zapisie /delta (src/handlers/delta.js:99-107,
//   :138-146; v36/delta.mjs:90-99) i w GC GET /deltas (src/handlers/deltas_list.js:37-43). Przy importPending /delta v37a
//   chroni numery (from, to] (src/handlers/delta.js:100-107, src/utils/delta_log.js:151-153). Odczyty bez TTL: /changes v36
//   i rezerwa bez SQLite (listDeltasSince, v36/delta_log.mjs:69-91, src/utils/delta_log.js:93-114) oraz import ogona
//   (listDeltaKeysForImport, src/utils/delta_log.js:193-225). v36 widzi jedną stronę R2.list z include (100 kluczy w
//   workerd, README.md:155) przy /changes, przycinaniu i GET /deltas, więc przy stronie 100 jego CAP nie działa; v37a
//   stronicuje (listAll, src/utils/delta_log.js:51-64).
// INSTANCJA DO: restart (zmiana tryb albo hub w ustaw() = wdrożenie, ewikcjaDO = wyrzucenie z pamięci) zeruje licznik
//   (src/durable/slot_hub.js:182) i przy SQLite wykrywa ogon v36 do importu (:232-246). Zmiana limitów, cors, nieznanaTrasa
//   i eventsEnabled to pokrętła testu bez restartu (w workerze zmiana zmiennej też jest wdrożeniem; restart jawnie: ewikcjaDO).
// SKUTEK USTERKI: usterka przypięta do żądania liczy trafienie dopiero, gdy zadziała (kod zużyty w potoku, opóźnienie,
//   siec, zgub, zmien, ponowienieHub, lustroOpoznione). Przypięta bez skutku (np. kod, którego bieżący tryb albo stan huba
//   nie wytwarza: hub_unavailable na /changes v36, rate_limited na /delta przy starym DO, hub_error na DELETE v36; albo
//   401 przed miejscem usterki) → naruszenie 'usterka-bez-skutku', meta.zastosowano false.
// KODY USTEREK (usterka({kod})): rate_limited src/middleware/ratelimit.js:117-128, src/durable/slot_hub.js:124-133;
//   log_import_pending src/handlers/changes.js:84-86; hub_unavailable src/handlers/delta.js:125, src/handlers/changes.js:88,
//   src/handlers/events.js:151, src/handlers/register.js:104-111; hub_not_sqlite src/handlers/changes.js:80-83,
//   src/handlers/events.js:148-150; log_full src/handlers/delta.js:120-123, src/handlers/events.js:145-147; hub_error
//   src/handlers/remove.js:68-71; kv_error src/middleware/auth.js:96, src/handlers/register.js:58; r2_error
//   src/handlers/download.js:61, src/handlers/upload.js:172, src/handlers/remove.js:63; internal_error src/worker.js:267-274;
//   body_read_error src/handlers/delta.js:51-57, src/handlers/events.js:88-93, src/handlers/upload.js:133,
//   src/handlers/register.js:92.
// POZA MODELEM ŚWIADOMIE: WebSocket (ramki tylko w atrapa.ramki), nagłówki bezpieczeństwa poza X-Api-Version
//   (niewidoczne przez CORS), nowe wcielenie po X-Vilda-Reg (src/durable/slot_hub.js:459-498), wyścig 10 s importu (import
//   natychmiastowy albo usterka), pamięć sondy health 10 min/15 s (wynik liczony przy każdym żądaniu), fail-open limitera,
//   crypto_error, preflight w adapterze fetch (OPTIONS tylko przez obsluz), PRO/passkey/transfer. notify po PUT/DELETE/restore
//   synchronicznie przed odpowiedzią (w workerze waitUntil); tak samo przycinanie lustra po /delta v37a i GC GET /deltas.
//   Okno importu 1000 brakujących numerów na próbę (src/durable/slot_hub.js:88,831-849): atrapa importuje cały zakres.
//   DELETE v36 kasuje całe lustro (deleteAllDeltas v36 czyta jedną stronę list bez include; > 1000 kluczy poza modelem).
//
// EKSPORTY
//   utworzAtrapeWorkera(opcje) → atrapa (JSDoc niżej); zegarSterowany(startMs); sprawdzCzystosc(...atrapy);
//   zainstalujStraznikaSieci() / zdejmijStraznikaSieci() / straznik() — globalny dyspozytor fetch (jeden na plik testu);
//   wszystkieAtrapy(), zamknijAtrape(a) — rejestr atrap modułu (dla sprzątania uprzęży urządzeń);
//   TRASY_MODELU, TRASY_POZA_MODELEM, KODY_USTEREK, DOMYSLNE_LIMITY, DOMENA_ATRAPY — kontrakt z odwołaniami (K31).
//
// REJESTR i OŚ: nigdy surowy token, hash tokenu ani treść ciała; slot jako alias '<slot>', '<slot-2>'…, ETag jako 'E<n>'.
// Determinizm: ETag = licznik atrapy jako 32 hex, eid delty = 'd:' + UUID v4 z licznika, losowa część klucza lustra =
// licznik 8 hex; zegar atrapy niezależny od Date klienta (domyślnie sterowany, 2026-10-30T08:00:05Z).
import { createHash } from 'node:crypto';

export const SHA_WZORCA = '4551678';
export const DOMENA_ATRAPY = 'atrapa-workera.invalid';

/**
 * @typedef {'v37a'|'v36'} TrybWorkera
 * @typedef {'sql'|'kv'|'stary'|'brak'} StanHuba
 *   sql — DO v37 z SQLite (norma); kv — klasa DO bez SQLite (src/durable/slot_hub.js:378-391,581,658);
 *   stary — DO v36 (/append, /range, /wipe → 404); brak — brak bindingu SLOT_HUB.
 */

/** Domyślne limity = produkcja (wrangler.toml 4551678). */
export const DOMYSLNE_LIMITY = Object.freeze({
  slotRpm: 40, // rl:slot (wrangler.toml:89; kod domyślnie 20, src/middleware/ratelimit.js:48)
  regRpm: 3, // rl:reg per IP (wrangler.toml:92)
  syncRpm: 120, // DO /append + /range (src/durable/slot_hub.js:70; wrangler.toml:128)
  syncEventsPm: 600, // src/durable/slot_hub.js:81
  syncBytesPm: 4194304, // src/durable/slot_hub.js:82
  maxLogBytes: 1073741824, // src/durable/slot_hub.js:83
  maxPayloadBytes: 52428800, // PUT /blob, /register (wrangler.toml:68; src/utils/validation.js:142-146)
  deltaMaxBytes: 65536, // src/handlers/delta.js:34
  eventsBodyBytes: 1048576, eventsPerBatch: 200, eventBytes: 262144, // src/handlers/events.js:37-39
  legacyPageEvents: 200, legacyPageBytes: 1048576, legacyPageGaps: 10000, legacySince0Margin: 200, // slot_hub.js:70-77
  maxRangeBytes: 1048576, pagedMaxLimit: 500, // src/durable/slot_hub.js:78,85
  lustroCap: 200, lustroTtlMs: 259200000, // v36/delta_log.mjs:22-23 (src/utils/delta_log.js:24-25)
  lustroStronaV36: 100, // jedna strona R2.list w v36 (README.md:155)
});

const R_SLOT = '([0-9a-f]{64})';
const trasaSlotu = (koncowka) => new RegExp(`^\\/v1\\/slots\\/${R_SLOT}${koncowka}$`);

/** Trasy modelu: klucz, metoda, wzorzec ścieżki, limit v37a, odwołanie do wzorca (K31 sprawdza obecność w nagłówku). */
export const TRASY_MODELU = Object.freeze([
  { klucz: 'health', metoda: 'GET', wzorzec: /^\/v1\/health$/, rl: 'none', odwolanie: 'src/worker.js:127-171' },
  { klucz: 'register', metoda: 'POST', wzorzec: trasaSlotu('\\/register'), rl: 'registration', odwolanie: 'src/handlers/register.js:39-149' },
  { klucz: 'blob-put', metoda: 'PUT', wzorzec: trasaSlotu('\\/blob'), rl: 'slot', odwolanie: 'src/handlers/upload.js:72-210' },
  { klucz: 'blob', metoda: 'GET', wzorzec: trasaSlotu('\\/blob'), rl: 'slot', odwolanie: 'src/handlers/download.js:41-87' },
  { klucz: 'status', metoda: 'GET', wzorzec: trasaSlotu('\\/status'), rl: 'slot', odwolanie: 'src/handlers/status.js:37-55' },
  { klucz: 'delta', metoda: 'POST', wzorzec: trasaSlotu('\\/delta'), rl: 'do', rlV36: 'slot', odwolanie: 'src/handlers/delta.js:45-150' },
  { klucz: 'deltas', metoda: 'GET', wzorzec: trasaSlotu('\\/deltas'), rl: 'slot', odwolanie: 'src/handlers/deltas_list.js:21-47' },
  { klucz: 'changes', metoda: 'GET', wzorzec: trasaSlotu('\\/changes'), rl: 'do', rlV36: 'slot', odwolanie: 'src/handlers/changes.js:48-109' },
  { klucz: 'events', metoda: 'POST', wzorzec: trasaSlotu('\\/events'), rl: 'do', tylkoV37aZFlaga: true, odwolanie: 'src/handlers/events.js:59-152' },
  { klucz: 'restore-prev', metoda: 'POST', wzorzec: trasaSlotu('\\/blob\\/restore-prev'), rl: 'slot', odwolanie: 'src/handlers/restore_prev.js:39-130' },
  { klucz: 'delete', metoda: 'DELETE', wzorzec: trasaSlotu(''), rl: 'slot', odwolanie: 'src/handlers/remove.js:48-100' },
  { klucz: 'register-identity', metoda: 'POST', wzorzec: trasaSlotu('\\/register-identity'), rl: 'registration', odwolanie: 'src/handlers/register_identity.js:48-98' },
]);

/** Trasy workera spoza modelu: dopasowanie = naruszenie 'trasa-poza-modelem' (nie cicha 404). */
export const TRASY_POZA_MODELEM = Object.freeze([
  { klucz: 'socket', metoda: 'GET', wzorzec: trasaSlotu('\\/socket'), odwolanie: 'src/worker.js:93' },
  { klucz: 'trial', metoda: 'POST', wzorzec: trasaSlotu('\\/trial'), odwolanie: 'src/worker.js:106' },
  { klucz: 'trial-get', metoda: 'GET', wzorzec: trasaSlotu('\\/trial'), odwolanie: 'src/worker.js:108' },
  { klucz: 'entitlement', metoda: 'GET', wzorzec: trasaSlotu('\\/entitlement'), odwolanie: 'src/worker.js:110' },
  { klucz: 'checkout', metoda: 'GET', wzorzec: trasaSlotu('\\/checkout'), odwolanie: 'src/worker.js:112' },
  { klucz: 'stripe-webhook', metoda: 'POST', wzorzec: /^\/v1\/stripe\/webhook$/, odwolanie: 'src/worker.js:114' },
  { klucz: 'transfer', metoda: 'POST', wzorzec: /^\/v1\/transfer$/, odwolanie: 'src/worker.js:118' },
  { klucz: 'transfer-get', metoda: 'GET', wzorzec: /^\/v1\/transfer\/([A-Za-z0-9\-_]{43})$/, odwolanie: 'src/worker.js:119' },
  { klucz: 'transfer-put', metoda: 'PUT', wzorzec: /^\/v1\/transfer\/([A-Za-z0-9\-_]{43})$/, odwolanie: 'src/worker.js:120' },
  { klucz: 'passkey-challenge', metoda: 'POST', wzorzec: /^\/v1\/passkey\/challenge$/, odwolanie: 'src/worker.js:122' },
  { klucz: 'passkey-put', metoda: 'PUT', wzorzec: /^\/v1\/slots\/([0-9a-f]{64})\/passkey\/([A-Za-z0-9\-_]{4,512})$/, odwolanie: 'src/worker.js:123' },
  { klucz: 'passkey-unlock', metoda: 'POST', wzorzec: /^\/v1\/passkey\/([A-Za-z0-9\-_]{4,512})\/unlock$/, odwolanie: 'src/worker.js:124' },
]);

const TRASY_DOPASOWANE = TRASY_MODELU.filter((t) => t.klucz !== 'health').map((t) => t.klucz);
/**
 * Kody usterek: tylko na trasach, na których worker je wytwarza (inna para → wyjątek przy usterka()).
 * etap — miejsce w potoku: 'rl' (limit KV przed handlerem), 'handler' (zaraz po limicie), 'kv' (odczyt metadanych
 * slotu), 'cialo' (odczyt ciała), 'do' (licznik DO, przed zużyciem), 'do-po-liczniku', 'do-wywolanie' (zamiast
 * wywołania DO, licznik bez zmian), 'do-budzet' (po budżecie), 'wipe' (POST /wipe), 'r2' (magazyn obiektów).
 */
export const KODY_USTEREK = Object.freeze({
  rate_limited: { status: 429, trasy: TRASY_DOPASOWANE, odwolanie: 'src/middleware/ratelimit.js:117-128' },
  log_import_pending: { status: 503, trasy: ['changes'], etap: 'do-po-liczniku', odwolanie: 'src/handlers/changes.js:84-86' },
  hub_unavailable: { status: 503, trasy: ['delta', 'changes', 'events', 'register'], odwolanie: 'src/handlers/delta.js:125' },
  hub_not_sqlite: { status: 503, trasy: ['changes', 'events'], etap: 'do-po-liczniku', odwolanie: 'src/handlers/changes.js:80-83' },
  log_full: { status: 507, trasy: ['delta', 'events'], etap: 'do-budzet', odwolanie: 'src/handlers/delta.js:120-123' },
  hub_error: { status: 500, trasy: ['delete'], etap: 'wipe', odwolanie: 'src/handlers/remove.js:68-71' },
  kv_error: { status: 500, trasy: ['status', 'blob', 'blob-put', 'register', 'register-identity', 'delete', 'restore-prev', 'changes', 'delta', 'events', 'deltas'], etap: 'kv', odwolanie: 'src/middleware/auth.js:96' },
  r2_error: { status: 500, trasy: ['blob', 'blob-put', 'register', 'delete', 'restore-prev'], etap: 'r2', odwolanie: 'src/handlers/download.js:61' },
  internal_error: { status: 500, trasy: TRASY_DOPASOWANE, etap: 'handler', odwolanie: 'src/worker.js:267-274' },
  // status zależny od trasy (400 w /delta i /events, 500 w blob-put i register) — patrz odpUsterki.
  body_read_error: { status: null, trasy: ['delta', 'events', 'blob-put', 'register'], etap: 'cialo', odwolanie: 'src/handlers/delta.js:51-57' },
});
const KOMUNIKATY = {
  rate_limited: null,
  log_import_pending: 'Trwa przenoszenie dziennika zmian. Spróbuj ponownie.',
  hub_unavailable: 'Dziennik zmian chwilowo niedostępny',
  hub_not_sqlite: 'Dziennik zmian niedostępny (tryb bez SQLite)',
  log_full: 'Dziennik zmian tego slotu osiągnął limit rozmiaru',
  hub_error: 'Błąd czyszczenia dziennika zmian. Ponów żądanie.',
  kv_error: 'Błąd odczytu metadanych slotu',
  r2_error: 'Błąd odczytu storage',
  internal_error: 'Wewnętrzny błąd serwera',
  body_read_error: 'Błąd odczytu ciała requestu',
};
// Komunikaty zależne od trasy (src/handlers/upload.js:172, register.js:58 i 125, register_identity.js:67,
// restore_prev.js:64); poza tymi trasami — KOMUNIKATY.
const KOMUNIKATY_TRAS = {
  r2_error: { 'blob-put': 'Błąd zapisu do storage', register: 'Błąd zapisu do storage', 'restore-prev': 'Błąd odczytu ze storage' },
  kv_error: { register: 'Błąd odczytu KV', 'register-identity': 'Błąd odczytu KV' },
};
function komunikatTrasy(kod, trasa) {
  const t = KOMUNIKATY_TRAS[kod];
  return (t && t[trasa]) || KOMUNIKATY[kod];
}
// Etap usterki zależny od trasy (rate_limited: KV albo DO; hub_unavailable: wywołanie DO albo /wipe przy rejestracji).
function etapKodu(kod, trasa, rl) {
  if (kod === 'rate_limited') return rl === 'do' ? 'do' : 'rl';
  if (kod === 'hub_unavailable') return trasa === 'register' ? 'wipe' : 'do-wywolanie';
  return KODY_USTEREK[kod].etap;
}

// ── Pomocnicze ───────────────────────────────────────────────────────────────────────────────────────────────────────
const ENC = new TextEncoder();
const DEC = new TextDecoder();
const utf8 = (s) => ENC.encode(String(s)).length;
const sha256Hex = (s) => createHash('sha256').update(String(s)).digest('hex');
const RE_TOKEN = /^[A-Za-z0-9\-_]{43}$/;
const RE_HASH = /^[0-9a-f]{64}$/;
const RE_SLOT_W_TEKSCIE = /[0-9a-f]{64}/g;
const hex = (n, dl) => n.toString(16).padStart(dl, '0');
const uuidV4Z = (n) => `00000000-0000-4000-8000-${hex(n, 12)}`;
const kopia = (x) => (x === undefined ? undefined : structuredClone(x));
const BLAD_SIECI = () => new TypeError('Failed to fetch');
const BLAD_PRZERWANIA = () => new DOMException('The operation was aborted.', 'AbortError');
const bezpiecznyNaglowek = new Set(['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma']);
const EXPOSE_V37A = 'ETag, X-Api-Version, X-Slot-Updated-At, Retry-After';
const EXPOSE_V36 = 'ETag, X-Api-Version, X-Slot-Updated-At';
const ORIGINY_V37A = ['https://wagaiwzrost.pl', 'https://vildaclinic.github.io']; // wrangler.toml:49
const ORIGIN_V36 = 'https://vildaclinic.github.io'; // 8396f47:wrangler.toml:45
const ORIGIN_STRONY = 'http://localhost'; // okno() z sesja-zapisu-uprzaz ma location.origin 'http://localhost'

function legacySince(raw) {
  const n = parseInt(raw, 10);
  if (!(isFinite(n) && n >= 0)) return 0;
  return Math.min(n, Number.MAX_SAFE_INTEGER);
}
const scislaLiczba = (raw) => ((typeof raw === 'string' && /^\d{1,15}$/.test(raw)) ? Number(raw) : null);
function parseIfMatch(h) {
  const v = h.get('if-match');
  if (!v) return null;
  return v.trim().replace(/^"(.*)"$/, '$1');
}
function parseIfNoneMatch(h) {
  const v = h.get('if-none-match');
  if (!v) return null;
  const t = v.trim();
  return t === '*' ? '*' : t.replace(/^"(.*)"$/, '$1');
}
function dlugoscZNaglowka(h) {
  const v = h.get('content-length');
  if (v == null) return -1;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}
function rozmiarSync(cialo) {
  if (cialo == null) return 0;
  if (typeof cialo === 'string') return utf8(cialo);
  if (typeof Blob !== 'undefined' && cialo instanceof Blob) return cialo.size;
  if (cialo instanceof ArrayBuffer) return cialo.byteLength;
  if (ArrayBuffer.isView(cialo)) return cialo.byteLength;
  return null; // strumień, FormData… — nieznany synchronicznie
}
const tura = () => new Promise((r) => { setImmediate(r); });

/** Zegar sterowany testem (niezależny od Date klienta). Domyślnie 5 s po początku minuty (Retry-After 55). */
export function zegarSterowany(startMs = Date.UTC(2026, 9, 30, 8, 0, 5)) {
  let t = startMs;
  return {
    teraz: () => t,
    przesun(ms) { t += ms; },
    ustaw(ms) { t = ms; },
    doNastepnejMinuty() { t = Math.floor(t / 60000) * 60000 + 65000; },
  };
}

// ── Rejestr modułu: wszystkie atrapy, połączenia i strażnik ──────────────────────────────────────────────────────────
const ATRAPY = new Set();
const POLACZENIA = new Map(); // origin → { polaczenie, atrapa }
const STRAZNIK = { zainstalowany: false, poprzedni: null, naruszenia: [], licznik: 0 };
let licznikAtrap = 0;

function naruszenieGlobalne(rodzaj, opis) {
  STRAZNIK.licznik += 1;
  STRAZNIK.naruszenia.push({ nr: STRAZNIK.licznik, rodzaj, urzadzenie: null, opis });
}
function przyjmijZ(lista, gdy) {
  const g = typeof gdy === 'function' ? gdy : () => true;
  const zdjete = lista.filter(g);
  for (const n of zdjete) lista.splice(lista.indexOf(n), 1);
  return zdjete;
}
function urlZWejscia(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return String(input);
}
function dyspozytor(input, init) {
  let u;
  try { u = new URL(urlZWejscia(input)); } catch (_) {
    naruszenieGlobalne('poza-atrapa', 'nieprawidłowy adres');
    return Promise.reject(BLAD_SIECI());
  }
  const p = POLACZENIA.get(u.origin);
  if (!p) {
    naruszenieGlobalne('poza-atrapa', `globalny fetch do hosta spoza atrapy: ${u.host}`);
    return Promise.reject(BLAD_SIECI());
  }
  return p.polaczenie.fetch(input, init);
}

/** Globalny dyspozytor fetch (jeden na plik testu; vitest izoluje pliki). Idempotentna. Nigdy nie wraca do sieci. */
export function zainstalujStraznikaSieci() {
  if (!STRAZNIK.zainstalowany) {
    STRAZNIK.poprzedni = globalThis.fetch;
    globalThis.fetch = dyspozytor;
    STRAZNIK.zainstalowany = true;
  }
  return straznik();
}
/** Zdjęcie strażnika (testy PR0 go nie wołają; wartość sprzed instalacji). */
export function zdejmijStraznikaSieci() {
  if (!STRAZNIK.zainstalowany) return;
  globalThis.fetch = STRAZNIK.poprzedni;
  STRAZNIK.zainstalowany = false;
}
export function straznik() {
  return {
    dyspozytor,
    get zainstalowany() { return STRAZNIK.zainstalowany; },
    naruszenia: STRAZNIK.naruszenia,
    przyjmijNaruszenia: (gdy) => przyjmijZ(STRAZNIK.naruszenia, gdy),
  };
}
export function wszystkieAtrapy() { return [...ATRAPY]; }
/** Zamyka atrapę: połączenia odłączone, atrapa znika z rejestru; dalsze żądania → naruszenie globalne 'po-zamknieciu'. */
export function zamknijAtrape(a) {
  for (const p of a._polaczenia()) p.rozlacz();
  a._zamknieta = true;
  ATRAPY.delete(a);
}

/** Rzuca z listą, gdy którakolwiek atrapa ma naruszenia albo żądania w locie. */
export function sprawdzCzystosc(...atrapy) {
  const problemy = [];
  for (const a of atrapy) {
    for (const n of a.naruszenia) problemy.push(`${a.id}: naruszenie ${n.rodzaj} (${n.urzadzenie || '-'}): ${n.opis}`);
    for (const z of a.zadania) if (z.wynik === 'w-locie') problemy.push(`${a.id}: żądanie w locie #${z.nr} ${z.metoda} ${z.sciezka}${z.zapytanie} (${z.urzadzenie})`);
  }
  if (problemy.length) throw new Error('atrapa workera nie jest czysta:\n  ' + problemy.join('\n  '));
}

// ── Atrapa ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * @param {Object} [opcje]
 * @param {TrybWorkera} [opcje.tryb='v37a']  @param {boolean} [opcje.eventsEnabled=false]  @param {StanHuba} [opcje.hub='sql']
 * @param {Partial<typeof DOMYSLNE_LIMITY>} [opcje.limity]
 * @param {(() => number) | ReturnType<typeof zegarSterowany>} [opcje.zegar]  funkcja → np. () => Date.now() (fałszywe Date)
 * @param {'naruszenie'|'odpowiedz'} [opcje.nieznanaTrasa='naruszenie']  trasa spoza ROUTES: 404 not_found jak worker,
 *        przy 'naruszenie' dodatkowo wpis w naruszenia
 * @param {boolean} [opcje.cors=true]  adapter fetch pokazuje skryptowi tylko nagłówki bezpieczne i z Expose-Headers
 * @param {string} [opcje.ip='203.0.113.7']  domyślne IP połączeń (CF-Connecting-IP)
 */
export function utworzAtrapeWorkera(opcje = {}) {
  licznikAtrap += 1;
  const id = 'w' + licznikAtrap;
  const adresBazowy = `https://${id}.${DOMENA_ATRAPY}`;
  const konf = { tryb: 'v37a', eventsEnabled: false, hub: 'sql', limity: { ...DOMYSLNE_LIMITY }, nieznanaTrasa: 'naruszenie', cors: true };
  const zegar = typeof opcje.zegar === 'function' ? null : (opcje.zegar || zegarSterowany());
  const teraz = typeof opcje.zegar === 'function' ? opcje.zegar : () => zegar.teraz();
  const iso = () => new Date(teraz()).toISOString();
  const ipDomyslne = opcje.ip || '203.0.113.7';

  const sloty = new Map(); // slotId → StanSlotu
  const rlSlot = new Map(); // 'rl:slot:<slot>' → { windowStart, count }
  const rlReg = new Map(); // 'rl:reg:<ip>' → { windowStart, count }
  const lic = { etag: 0, eid: 0, rand: 0, os: 0, naruszenie: 0, ramka: 0, aktywnosc: 0, usterka: 0 };
  const zadania = [];
  const os = [];
  const naruszenia = [];
  const ramki = [];
  const usterki = [];
  const polaczenia = new Map(); // origin → Polaczenie
  const aliasySlotow = new Map();
  const etagi = new Map(); // etag → 'E<n>'
  const ruchUrz = new Map(); // urządzenie → { wLocie, konsumpcje }
  const czekajace = new Set(); // bramy i opóźnienia w toku (zwolnijWszystko)
  const odlozoneLustra = new Set();

  const L = () => konf.limity;
  const bump = () => { lic.aktywnosc += 1; };
  const ruch = (u) => { const k = u || '-'; if (!ruchUrz.has(k)) ruchUrz.set(k, { wLocie: 0, konsumpcje: 0 }); return ruchUrz.get(k); };

  function ustaw(z = {}) {
    const przed = { tryb: konf.tryb, hub: konf.hub };
    if (z.tryb !== undefined) {
      if (!['v37a', 'v36'].includes(z.tryb)) throw new Error(`atrapa: nieznany tryb ${z.tryb}`);
      konf.tryb = z.tryb;
    }
    if (z.hub !== undefined) {
      if (!['sql', 'kv', 'stary', 'brak'].includes(z.hub)) throw new Error(`atrapa: nieznany stan huba ${z.hub}`);
      konf.hub = z.hub;
    }
    if (z.eventsEnabled !== undefined) konf.eventsEnabled = !!z.eventsEnabled;
    if (z.limity) {
      for (const k of Object.keys(z.limity)) if (!(k in DOMYSLNE_LIMITY)) throw new Error(`atrapa: nieznany limit ${k}`);
      Object.assign(konf.limity, z.limity);
    }
    if (z.nieznanaTrasa !== undefined) konf.nieznanaTrasa = z.nieznanaTrasa;
    if (z.cors !== undefined) konf.cors = !!z.cors;
    // Zmiana kodu workera albo DO = wdrożenie: nowe instancje DO wszystkich slotów (nagłówek, INSTANCJA DO).
    if (konf.tryb !== przed.tryb || konf.hub !== przed.hub) for (const s of sloty.values()) restartDO(s);
  }
  // Nowa instancja DO: licznik tylko w pamięci od zera (src/durable/slot_hub.js:182), przy SQLite wykrycie ogona v36 do
  // importu w _init (src/durable/slot_hub.js:204-246).
  function restartDO(s) {
    s.dz.rl = { win: 0, n: 0, ev: 0, b: 0 };
    if (konf.hub === 'sql') wykryjImport(s.dz);
  }
  ustaw(opcje);

  // ── Stan slotów ──
  function nowyDziennik() {
    return { head: 0, oldest: 0, blobSeq: 0, prevBlobSeq: 0, wipeFloor: 0, evBytes: 0, ev: [], rl: { win: 0, n: 0, ev: 0, b: 0 }, importRange: null };
  }
  function stan(slotId) {
    let s = sloty.get(slotId);
    if (!s) { s = { kv: null, blob: null, prev: null, dz: nowyDziennik(), lustro: [] }; sloty.set(slotId, s); }
    return s;
  }
  function aliasSlotu(slotId) {
    if (!slotId) return null;
    if (!aliasySlotow.has(slotId)) {
      const n = aliasySlotow.size + 1;
      aliasySlotow.set(slotId, n === 1 ? '<slot>' : `<slot-${n}>`);
    }
    return aliasySlotow.get(slotId);
  }
  const maskuj = (tekst) => String(tekst).replace(RE_SLOT_W_TEKSCIE, (s) => aliasSlotu(s));
  function nowyEtag() {
    lic.etag += 1;
    const e = hex(lic.etag, 32);
    etagi.set(e, `E${lic.etag}`);
    return e;
  }
  const aliasEtagu = (e) => (e == null ? null : (etagi.get(e) || 'nieznany'));
  const tylkoPoprawne = (p) => !!(p && typeof p === 'object' && typeof p.iv === 'string' && typeof p.data === 'string');

  // ── Lustro R2 <slot>/d/… (nagłówek, LUSTRO R2). s.lustro: wszystkie obiekty, rosnąco po kluczu jak R2.list. ──
  // Lista, którą widzi bieżący kod workera: v36 jedna strona R2.list (v36/delta_log.mjs:72,99,125), v37a całość (listAll).
  function stronaLustra(s) {
    return konf.tryb === 'v36' ? s.lustro.slice(0, L().lustroStronaV36) : [...s.lustro];
  }
  // persistDelta (src/utils/delta_log.js:72-85): sam zapis, bez przycinania.
  function dopiszLustro(slotId, payload, seq) {
    const s = stan(slotId);
    lic.rand += 1;
    const ts = teraz();
    const klucz = seq > 0 ? `${slotId}/d/s${String(seq).padStart(12, '0')}-${hex(lic.rand, 8)}` : `${slotId}/d/${ts.toString(36)}-${hex(lic.rand, 8)}`;
    s.lustro.push({ klucz, seq: seq > 0 ? seq : 0, payload: kopia(payload), ts });
    s.lustro.sort((a, b) => (a.klucz < b.klucz ? -1 : a.klucz > b.klucz ? 1 : 0));
  }
  // pruneDeltaLog (src/utils/delta_log.js:148-166; v36/delta_log.mjs:121-139): na liście bieżącego kodu, bez numerów
  // chronionych (from, to]: najpierw TTL, potem nadmiar ponad CAP od najstarszego klucza.
  function przytnijLustro(s, chron = null) {
    const chroniony = (e) => !!chron && e.seq > chron.from && e.seq <= chron.to;
    const objs = stronaLustra(s).filter((e) => !chroniony(e));
    const granica = teraz() - L().lustroTtlMs;
    const usun = new Set(objs.filter((e) => e.ts && e.ts < granica).map((e) => e.klucz));
    const swieze = objs.filter((e) => !usun.has(e.klucz));
    if (swieze.length > L().lustroCap) for (const e of swieze.slice(0, swieze.length - L().lustroCap)) usun.add(e.klucz);
    if (usun.size) s.lustro = s.lustro.filter((e) => !usun.has(e.klucz));
  }

  // ── Ramki WS (bez transportu; src/durable/slot_hub.js:353-363,557-575) ──
  function ramka(slotId, r) {
    lic.ramka += 1;
    ramki.push({ nr: lic.ramka, slot: aliasSlotu(slotId), ramka: r });
  }
  function rozglos(slotId, swieze, ts, zapisane = true) {
    if (!swieze.length) return;
    if (swieze.length > 20) { ramka(slotId, { type: 'changed', etag: null, updatedAt: null, ts }); return; }
    for (const f of swieze) {
      ramka(slotId, zapisane
        ? { type: 'delta', payload: kopia(f.payload), seq: f.seq, eid: f.eid, ts }
        : { type: 'delta', payload: kopia(f.payload), eid: f.eid, stored: false, ts });
    }
  }

  // ── DO: /wipe, /notify, import ──
  function wipeDO(dz) {
    dz.ev = [];
    dz.oldest = dz.head + 1;
    dz.blobSeq = 0;
    dz.prevBlobSeq = 0;
    dz.importRange = null;
    dz.wipeFloor = dz.head;
    dz.evBytes = 0;
  }
  function notify(slotId, p) {
    if (konf.hub === 'brak') return;
    const dz = stan(slotId).dz;
    const sql = konf.hub === 'sql';
    if (sql && p.etag === null && typeof p.updatedAt === 'string' && p.kind === undefined) wipeDO(dz);
    if (sql && p.kind === 'blob') { dz.prevBlobSeq = dz.blobSeq; dz.blobSeq = dz.head; }
    else if (sql && p.kind === 'restore') { const b = dz.blobSeq; dz.blobSeq = dz.prevBlobSeq; dz.prevBlobSeq = b; }
    ramka(slotId, { type: 'changed', etag: p.etag ? String(p.etag) : null, updatedAt: p.updatedAt ? String(p.updatedAt) : null, ts: teraz() });
  }
  function maxEvSeq(dz) { return dz.ev.length ? Math.max(...dz.ev.map((r) => r.seq)) : null; }
  function wykryjImport(dz) {
    const maxEv = maxEvSeq(dz);
    if (!dz.importRange) {
      const dno = Math.max(maxEv === null ? 0 : maxEv, dz.wipeFloor, dz.oldest > 0 ? dz.oldest - 1 : 0);
      if (dz.head > dno) dz.importRange = { from: dno, to: dz.head, first: dno === 0 };
    } else if (dz.head > Math.max(dz.importRange.to, maxEv === null ? 0 : maxEv)) {
      dz.importRange = { from: dz.importRange.from, to: dz.head, first: dz.importRange.first };
    }
  }
  // Import natychmiastowy (bez wyścigu 10 s): wiersze z lustra src 'r2', brakujące → zaślepki (slot_hub.js:904-933).
  // Klucze z całego lustra, bez TTL (listDeltaKeysForImport, src/utils/delta_log.js:193-225).
  function importuj(slotId) {
    const s = stan(slotId);
    const dz = s.dz;
    const r = dz.importRange;
    if (!r) return;
    const obecne = new Set(dz.ev.map((w) => w.seq));
    for (const e of s.lustro) {
      if (!(e.seq > r.from && e.seq <= r.to) || obecne.has(e.seq) || !tylkoPoprawne(e.payload)) continue;
      const body = JSON.stringify(e.payload);
      dz.ev.push({ seq: e.seq, eid: 'r2:' + e.seq, ts: e.ts, bytes: utf8(body), z: null, aad: 0, body, src: 'r2' });
      dz.evBytes += utf8(body);
      obecne.add(e.seq);
    }
    let low = null;
    for (const q of obecne) if (q > r.from && q <= r.to && (low === null || q < low)) low = q;
    const gapFrom = r.first ? (low === null ? r.to + 1 : low) : r.from + 1;
    for (let q = gapFrom; q <= r.to; q += 1) {
      if (!obecne.has(q)) dz.ev.push({ seq: q, eid: 'gap:' + q, ts: teraz(), bytes: 0, z: null, aad: 0, body: null, src: 'gap' });
    }
    if (r.first) dz.oldest = low === null ? r.to + 1 : low;
    dz.ev.sort((a, b) => a.seq - b.seq);
    dz.importRange = null;
  }

  // ── Odpowiedzi (src/utils/responses.js:15-69) ──
  function odp(status, cialo, naglowki = {}, kod = null) { return { status, naglowki: { ...naglowki }, cialo, meta: { kod } }; }
  function json(status, body, extra = {}) {
    const n = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    for (const [k, v] of Object.entries(extra)) n[k.toLowerCase()] = v;
    return odp(status, JSON.stringify(body), n, body && body.error ? body.error.code : null);
  }
  const blad = (status, code, message) => json(status, { error: { code, message } });
  function blad429(retry) {
    return json(429, { error: { code: 'rate_limited', message: 'Zbyt wiele żądań. Spróbuj ponownie za ' + retry + ' sekund.', retryAfterSeconds: retry } }, { 'Retry-After': String(retry) });
  }
  const retryKV = () => { const s = Math.floor(teraz() / 1000); return Math.floor(s / 60) * 60 + 60 - s; };
  const retryDO = () => { const n = teraz(); const win = n - (n % 60000); return Math.max(1, Math.ceil((win + 60000 - n) / 1000)); };
  function odpUsterki(u, c) {
    const kod = u.kod;
    if (kod === 'rate_limited') return blad429(u.retryAfter != null ? u.retryAfter : (c.rl === 'do' ? retryDO() : retryKV()));
    if (kod === 'body_read_error') return blad(c.trasa === 'delta' || c.trasa === 'events' ? 400 : 500, kod, KOMUNIKATY[kod]);
    return blad(KODY_USTEREK[kod].status, kod, komunikatTrasy(kod, c.trasa));
  }

  // ── Limity ──
  function limitKV(mapa, klucz, limit) {
    const nowSec = Math.floor(teraz() / 1000);
    const ws = Math.floor(nowSec / 60) * 60;
    let e = mapa.get(klucz);
    if (!e || e.windowStart !== ws) e = { windowStart: ws, count: 0 };
    if (e.count >= limit) return blad429(ws + 60 - nowSec);
    e.count += 1;
    mapa.set(klucz, e);
    return null;
  }
  function oknoDO(dz) { const n = teraz(); const win = n - (n % 60000); if (dz.rl.win !== win) dz.rl = { win, n: 0, ev: 0, b: 0 }; return n; }
  function licznikDO(dz) {
    const n = oknoDO(dz);
    if (dz.rl.n >= L().syncRpm) return blad429(Math.max(1, Math.ceil((dz.rl.win + 60000 - n) / 1000)));
    dz.rl.n += 1;
    return null;
  }
  function budzetDO(dz, zdarzen, bajtow) {
    const n = oknoDO(dz);
    const zajety = dz.rl.ev > 0 || dz.rl.b > 0;
    if (zajety && (dz.rl.ev + zdarzen > L().syncEventsPm || dz.rl.b + bajtow > L().syncBytesPm)) return blad429(Math.max(1, Math.ceil((dz.rl.win + 60000 - n) / 1000)));
    dz.rl.ev += zdarzen;
    dz.rl.b += bajtow;
    return null;
  }

  // ── Uwierzytelnienie ──
  function tokenem(c, token) {
    if (!token || typeof token !== 'string') return { odp: blad(401, 'missing_token', 'Brak tokenu') };
    const uk = c.usterka('kv');
    if (uk) return { odp: uk };
    const s = sloty.get(c.slotId);
    if (!s || !s.kv) return { odp: blad(401, 'invalid_credentials', 'Nieprawidłowy slotId lub token') };
    if (sha256Hex(token) !== s.kv.tokenHash) return { odp: blad(401, 'invalid_credentials', 'Nieprawidłowy slotId lub token') };
    return { s, kv: s.kv };
  }
  function bearer(c) {
    const a = c.h.get('authorization') || '';
    if (!a.startsWith('Bearer ')) return { odp: blad(401, 'missing_token', 'Brak lub nieprawidłowy nagłówek Authorization (wymagany format: Bearer <token>)') };
    const t = a.slice('Bearer '.length).trim();
    if (!RE_TOKEN.test(t)) return { odp: blad(401, 'missing_token', 'authToken musi mieć dokładnie 43 znaki base64url [A-Za-z0-9-_]') };
    return tokenem(c, t);
  }

  // ── DO /append (src/durable/slot_hub.js:577-650) ──
  function przygotujD(eid, payload) { return { eid, body: JSON.stringify(payload), z: null, aad: 0, payload }; }
  function przygotujEv(e) {
    const payload = { iv: e.iv, data: e.data };
    if (e.z === 'gzip') payload.z = 'gzip';
    if (e.aad === 1) payload.aad = 1;
    return { eid: e.eid, body: JSON.stringify({ iv: e.iv, data: e.data }), z: e.z === 'gzip' ? 'gzip' : null, aad: e.aad === 1 ? 1 : 0, payload };
  }
  function zatwierdz(slotId, przygotowane, src) {
    const dz = stan(slotId).dz;
    const ts = teraz();
    const przyjete = [];
    const swieze = [];
    for (const p of przygotowane) {
      const byl = dz.ev.find((r) => r.eid === p.eid);
      if (byl) { przyjete.push({ eid: p.eid, seq: byl.seq, dup: true }); continue; }
      dz.head += 1;
      const bytes = utf8(p.body);
      dz.ev.push({ seq: dz.head, eid: p.eid, ts, bytes, z: p.z, aad: p.aad, body: p.body, src });
      dz.evBytes += bytes;
      przyjete.push({ eid: p.eid, seq: dz.head, dup: false });
      swieze.push({ seq: dz.head, eid: p.eid, payload: p.payload });
    }
    return { przyjete, swieze, ts };
  }
  function doAppend(c, przygotowane, src) {
    const uw = c.usterka('do-wywolanie');
    if (uw) return { status: 503, kod: 'hub_unavailable' };
    if (konf.hub === 'brak') return { status: 0 };
    if (konf.hub === 'stary') return { status: 404 };
    const dz = stan(c.slotId).dz;
    const ur = c.usterka('do');
    if (ur) return { status: 429, odp: ur };
    const lim = licznikDO(dz);
    if (lim) return { status: 429, odp: lim };
    const up = c.usterka('do-po-liczniku');
    if (up) return { status: up.status, kod: up.meta.kod };
    if (konf.hub === 'kv') return { status: 503, kod: 'hub_not_sqlite' };
    const nowe = przygotowane.filter((p) => !dz.ev.some((r) => r.eid === p.eid));
    const bajtow = nowe.reduce((n, p) => n + utf8(p.body), 0);
    if (nowe.length) { const b = budzetDO(dz, nowe.length, bajtow); if (b) return { status: 429, odp: b }; }
    const pelny = c.usterka('do-budzet') || (nowe.length && dz.evBytes + bajtow > L().maxLogBytes);
    if (pelny) {
      if (src === 'd') rozglos(c.slotId, nowe.map((p) => ({ eid: p.eid, payload: p.payload })), teraz(), false);
      return { status: 507, kod: 'log_full' };
    }
    let w = przygotowane.length ? zatwierdz(c.slotId, przygotowane, src) : { przyjete: [], swieze: [], ts: teraz() };
    rozglos(c.slotId, w.swieze, w.ts);
    if (c.ponowienieHub) {
      // Wewnętrzne ponowienie callHub po zgubionej odpowiedzi DO (src/utils/realtime.js:27-34): druga próba zużywa
      // licznik i dostaje dup:true z tym samym seq, bez nowej ramki (test/delta_v37.test.mjs:264-283,329-372).
      c.zadzialalo('ponowienieHub');
      const lim2 = licznikDO(dz);
      if (lim2) return { status: 429, odp: lim2 };
      w = zatwierdz(c.slotId, przygotowane, src);
    }
    // importPending / importRange z odpowiedzi /append (src/durable/slot_hub.js:644-651).
    const ir = dz.importRange ? { from: dz.importRange.from, to: dz.importRange.to } : null;
    return { status: 200, przyjete: w.przyjete, headSeq: dz.head, ts: w.ts, importRange: ir };
  }
  // ── DO /range (src/durable/slot_hub.js:655-759) ──
  function czytajWiersze(dz, start, maxCount, maxBytes, maxGaps = 0) {
    const osobno = maxGaps > 0;
    const sqlLimit = osobno ? maxCount + maxGaps : maxCount;
    const out = [];
    let razem = 0; let tresc = 0; let zasl = 0;
    for (const r of dz.ev) {
      if (r.seq <= start) continue;
      if (out.length >= sqlLimit) break;
      const zaslepka = osobno && r.body === null;
      if (out.length && (razem + r.bytes > maxBytes || (zaslepka ? zasl >= maxGaps : (osobno && tresc >= maxCount)))) break;
      out.push(r);
      razem += r.bytes;
      if (zaslepka) zasl += 1; else tresc += 1;
    }
    return out;
  }
  function wierszNaWyjscie(r, zEid) {
    if (r.body === null) return { seq: r.seq, gap: true };
    let p;
    try { p = JSON.parse(r.body); } catch (_) { return { seq: r.seq, gap: true }; }
    if (!p || typeof p !== 'object') return { seq: r.seq, gap: true };
    if (r.z) p.z = r.z;
    if (Number(r.aad) === 1) p.aad = 1;
    return zEid ? { seq: r.seq, eid: r.eid, payload: p } : { seq: r.seq, payload: p };
  }
  function stronaLegacy(dz, since) {
    const head = dz.head;
    if (since > head) return { deltas: [], count: 0, headSeq: head, snapshotSeq: 0 };
    const oldest = dz.oldest || 1;
    let start = since;
    if (since === 0) start = dz.blobSeq > 0 ? Math.max(oldest - 1, dz.blobSeq - L().legacySince0Margin) : oldest - 1;
    const rows = czytajWiersze(dz, start, L().legacyPageEvents, L().legacyPageBytes, L().legacyPageGaps);
    const deltas = rows.map((r) => wierszNaWyjscie(r, false));
    const last = rows.length ? rows[rows.length - 1].seq : null;
    return { deltas, count: deltas.length, headSeq: (last !== null && last < head) ? last : head, snapshotSeq: 0 };
  }
  function stronaStronicowana(dz, since, limit) {
    const head = dz.head;
    const oldest = dz.oldest || 1;
    const cursorAhead = since > head;
    const rows = cursorAhead ? [] : czytajWiersze(dz, since, limit, L().maxRangeBytes);
    const deltas = rows.map((r) => wierszNaWyjscie(r, true));
    const last = rows.length ? rows[rows.length - 1].seq : null;
    return {
      deltas, count: deltas.length, headSeq: head, nextSince: last !== null ? last : since, truncated: last !== null && last < head,
      snapshotSeq: 0, oldestSeq: oldest, requiresBase: since < oldest - 1, cursorAhead, blobSeq: dz.blobSeq, checkpoint: null, format: 'sql',
    };
  }
  function doRange(c, since, limit) {
    const uw = c.usterka('do-wywolanie');
    if (uw) return { status: 503, kod: 'hub_unavailable' };
    if (konf.hub === 'brak') return { status: 0 };
    if (konf.hub === 'stary') return { status: 404 };
    const dz = stan(c.slotId).dz;
    const ur = c.usterka('do');
    if (ur) return { status: 429, odp: ur };
    const lim = licznikDO(dz);
    if (lim) return { status: 429, odp: lim };
    const up = c.usterka('do-po-liczniku');
    if (up) return { status: up.status, kod: up.meta.kod };
    if (konf.hub === 'kv') return { status: 503, kod: 'hub_not_sqlite' };
    if (dz.importRange) importuj(c.slotId);
    return { status: 200, body: limit === null ? stronaLegacy(dz, since) : stronaStronicowana(dz, since, limit) };
  }
  // Ścieżka v36 /changes: headSeq z /meta, delty z lustra bez TTL (src/handlers/changes.js:91-109; v36/changes.mjs:30-64;
  // listDeltasSince: v36 jedna strona, v37a całość).
  function changesZLustra(c, since) {
    const s = stan(c.slotId);
    const metaHead = konf.hub === 'brak' ? 0 : s.dz.head;
    let maxSeq = since;
    const rows = [];
    for (const e of stronaLustra(s)) {
      if (e.seq > maxSeq) maxSeq = e.seq;
      if (e.seq <= since || !tylkoPoprawne(e.payload)) continue;
      rows.push({ seq: e.seq, payload: kopia(e.payload) });
    }
    rows.sort((a, b) => a.seq - b.seq);
    return json(200, { deltas: rows, count: rows.length, headSeq: metaHead > 0 ? metaHead : (maxSeq || since), snapshotSeq: 0 });
  }
  // /notify-delta (v36): DO sql — wiersz ev 'd:…' bez licznika; DO kv/stary — tylko head++; brak DO — seq 0.
  function deltaSciezkaV36(c, payload) {
    const s = stan(c.slotId);
    let seq = 0;
    if (konf.hub === 'sql') {
      lic.eid += 1;
      const w = zatwierdz(c.slotId, [przygotujD('d:' + uuidV4Z(lic.eid), payload)], 'd');
      rozglos(c.slotId, w.swieze, w.ts);
      seq = w.przyjete[0].seq;
    } else if (konf.hub === 'kv' || konf.hub === 'stary') {
      s.dz.head += 1;
      seq = s.dz.head;
      ramka(c.slotId, { type: 'delta', payload: kopia(payload), seq, ts: teraz() });
    }
    // Lustro i przycinanie (bez ochrony importu) w waitUntil — po odpowiedzi (v36/delta.mjs:86-99; src/handlers/delta.js:
    // 138-146); usterka lustroOpoznione trzyma je do zwolnij().
    const zapisz = () => { dopiszLustro(c.slotId, payload, seq); przytnijLustro(s); };
    if (c.lustroOpoznione) {
      c.zadzialalo('lustroOpoznione');
      const u = c.lustroOpoznione;
      const w = { zwolnij: null };
      w.p = new Promise((r) => { w.zwolnij = r; });
      odlozoneLustra.add(w);
      if (u.zwolniona) w.zwolnij();
      u.odlozone.push(w);
      w.p.then(() => { odlozoneLustra.delete(w); zapisz(); });
    } else {
      Promise.resolve().then(zapisz);
    }
    return json(202, { ok: true, delivered: 0, seq });
  }

  // ── Handlery ──
  function odczytajTekst(c) { return DEC.decode(c.bajty); }
  const HANDLERY = {
    health() {
      if (konf.tryb === 'v36') return json(200, { status: 'ok', version: '0.1.0', ts: iso() });
      const sqlite = konf.hub === 'sql' ? true : (konf.hub === 'kv' ? false : null);
      const features = sqlite === true ? ['events', 'changes-paged', 'aad'].filter((f) => f !== 'events' || konf.eventsEnabled) : [];
      return json(200, { status: 'ok', version: '37', api: 37, sqlite, features, ts: iso() });
    },
    status(c) {
      const a = bearer(c);
      if (a.odp) return a.odp;
      const kv = a.kv;
      return json(200, { etag: kv.etag, uploadedAt: kv.uploadedAt, updatedAt: kv.updatedAt, size: kv.size }, { ETag: '"' + kv.etag + '"', 'X-Slot-Updated-At': kv.updatedAt });
    },
    blob(c) {
      const a = bearer(c);
      if (a.odp) return a.odp;
      const inm = parseIfNoneMatch(c.h);
      if (inm !== null && inm === a.kv.etag) return odp(304, null, { etag: `"${a.kv.etag}"`, 'cache-control': 'no-store' });
      const ur = c.usterka('r2');
      if (ur) return ur;
      if (!a.s.blob) return blad(404, 'blob_not_found', 'Dane dla tego slotu nie zostały znalezione. Wykonaj nową rejestrację.');
      return odp(200, a.s.blob.slice(), {
        'content-type': 'application/octet-stream', 'cache-control': 'no-store', etag: `"${a.kv.etag}"`,
        'x-slot-updated-at': a.kv.updatedAt, 'content-length': String(a.s.blob.byteLength),
      });
    },
    'blob-put'(c) {
      const max = L().maxPayloadBytes;
      const a = bearer(c);
      if (a.odp) return a.odp;
      const kv = a.kv;
      const poczatkowy = !kv.etag;
      if (!poczatkowy) {
        const im = parseIfMatch(c.h);
        if (im === null) return blad(428, 'precondition_required', 'Nagłówek If-Match jest wymagany. Pobierz bieżący ETag przez GET /v1/slots/:slotId/status.');
        if (im !== kv.etag) return blad(412, 'precondition_failed', 'ETag niezgodny — dane zostały zmodyfikowane od czasu ostatniego odczytu. Pobierz aktualną wersję i powtórz upload.');
      }
      const dekl = dlugoscZNaglowka(c.h);
      if (konf.tryb === 'v37a' && dekl > max) return blad(413, 'payload_too_large', `Payload przekracza limit ${max} bajtów (otrzymano: ${dekl})`);
      const ub = c.usterka('cialo');
      if (ub) return ub;
      if (!c.bajty.byteLength) return blad(400, 'empty_payload', 'Ciało requestu nie może być puste');
      if (c.bajty.byteLength > max) return blad(413, 'payload_too_large', `Payload przekracza limit ${max} bajtów (otrzymano: ${c.bajty.byteLength})`);
      const ur = c.usterka('r2');
      if (ur) return ur;
      if (!poczatkowy) a.s.prev = { blob: a.s.blob, etag: kv.etag, updatedAt: kv.updatedAt };
      const etag = nowyEtag();
      const updatedAt = iso();
      a.s.blob = c.bajty.slice();
      // Rezerwa przez registeredAt tylko w v37a (src/handlers/upload.js:187); v36 bierze czas żądania (8396f47 upload.js:140).
      const meta = { tokenHash: kv.tokenHash, etag, uploadedAt: kv.uploadedAt || (konf.tryb === 'v37a' && kv.registeredAt) || updatedAt, updatedAt, size: c.bajty.byteLength };
      if (konf.tryb === 'v37a' && kv.registeredAt) meta.registeredAt = kv.registeredAt;
      a.s.kv = meta;
      notify(c.slotId, { etag, updatedAt, kind: konf.tryb === 'v37a' ? 'blob' : undefined });
      return json(200, { etag, updatedAt }, { ETag: '"' + etag + '"', 'X-Slot-Updated-At': updatedAt });
    },
    register(c) {
      const max = L().maxPayloadBytes;
      const th = (c.h.get('x-auth-token-hash') || '').trim();
      if (!RE_HASH.test(th)) return blad(400, 'invalid_token_hash', 'Nieprawidłowy nagłówek X-Auth-Token-Hash: authTokenHash musi mieć dokładnie 64 znaki lowercase hex [0-9a-f]');
      const uk = c.usterka('kv');
      if (uk) return uk;
      const s = stan(c.slotId);
      if (s.kv) return blad(409, 'slot_exists', 'Slot o podanym slotId już istnieje. Użyj PUT /v1/slots/:slotId/blob do aktualizacji.');
      const dekl = dlugoscZNaglowka(c.h);
      if (konf.tryb === 'v37a' && dekl > max) return blad(413, 'payload_too_large', `Payload przekracza limit ${max} bajtów (otrzymano: ${dekl})`);
      const ub = c.usterka('cialo');
      if (ub) return ub;
      if (!c.bajty.byteLength) return blad(400, 'empty_payload', 'Ciało requestu nie może być puste');
      if (c.bajty.byteLength > max) return blad(413, 'payload_too_large', `Payload przekracza limit ${max} bajtów (otrzymano: ${c.bajty.byteLength})`);
      if (konf.tryb === 'v37a') {
        // /wipe: 200, 404 (stary DO) albo brak bindingu → dalej; wyjątek DO (usterka) → 503, nic nie zapisane.
        const uh = c.usterka('wipe');
        if (uh) return blad(503, 'hub_unavailable', 'Dziennik zmian chwilowo niedostępny. Ponów rejestrację.');
        if (konf.hub === 'sql') wipeDO(s.dz);
      }
      const ur = c.usterka('r2');
      if (ur) return ur;
      const etag = nowyEtag();
      const uploadedAt = iso();
      s.blob = c.bajty.slice();
      s.kv = { tokenHash: th, etag, uploadedAt, updatedAt: uploadedAt, size: c.bajty.byteLength };
      return json(201, { slotId: c.slotId, etag, uploadedAt }, { ETag: '"' + etag + '"' });
    },
    'register-identity'(c) {
      const th = (c.h.get('x-auth-token-hash') || '').trim();
      if (!RE_HASH.test(th)) return blad(400, 'invalid_token_hash', 'Nieprawidłowy nagłówek X-Auth-Token-Hash: authTokenHash musi mieć dokładnie 64 znaki lowercase hex [0-9a-f]');
      const uk = c.usterka('kv');
      if (uk) return uk;
      const s = stan(c.slotId);
      if (s.kv) return json(200, { ok: true, slotId: c.slotId, alreadyRegistered: true });
      if (konf.tryb === 'v37a' && konf.hub === 'sql') wipeDO(s.dz); // best-effort, wynik ignorowany
      const registeredAt = iso();
      s.kv = { tokenHash: th, registeredAt, updatedAt: registeredAt, identityOnly: true, size: 0 };
      return json(201, { ok: true, slotId: c.slotId, registeredAt });
    },
    delete(c) {
      const a = bearer(c);
      if (a.odp) return a.odp;
      const ur = c.usterka('r2');
      if (ur) return blad(500, 'r2_error', 'Błąd usuwania danych ze storage');
      a.s.blob = null;
      a.s.prev = null;
      a.s.lustro = [];
      if (konf.tryb === 'v37a') {
        const uh = c.usterka('wipe');
        if (uh) return uh;
        if (konf.hub === 'sql') wipeDO(a.s.dz);
      }
      a.s.kv = null;
      notify(c.slotId, { etag: null, updatedAt: iso(), kind: konf.tryb === 'v37a' ? 'delete' : undefined });
      return odp(204, null, { 'cache-control': 'no-store' });
    },
    'restore-prev'(c) {
      const a = bearer(c);
      if (a.odp) return a.odp;
      const ur = c.usterka('r2');
      if (ur) return ur;
      if (!a.s.prev) return blad(404, 'no_archive', 'Brak zarchiwizowanej poprzedniej wersji dla tego slotu.');
      const kv = a.kv;
      const cur = a.s.blob;
      const prev = a.s.prev;
      const nowISO = iso();
      if (cur) a.s.prev = { blob: cur, etag: kv.etag || '', updatedAt: kv.updatedAt || '' };
      const etag = nowyEtag();
      a.s.blob = prev.blob;
      const meta = { tokenHash: kv.tokenHash, etag, uploadedAt: kv.uploadedAt || (konf.tryb === 'v37a' && kv.registeredAt) || nowISO, updatedAt: nowISO, size: prev.blob.byteLength };
      if (konf.tryb === 'v37a' && kv.registeredAt) meta.registeredAt = kv.registeredAt;
      a.s.kv = meta;
      notify(c.slotId, { etag, updatedAt: nowISO, kind: konf.tryb === 'v37a' ? 'restore' : undefined });
      return json(200, { etag, updatedAt: nowISO, size: prev.blob.byteLength, archived: { size: cur ? cur.byteLength : 0 } }, { ETag: '"' + etag + '"', 'X-Slot-Updated-At': nowISO });
    },
    deltas(c) {
      const a = bearer(c);
      if (a.odp) return a.odp;
      // listDeltas (src/utils/delta_log.js:120-141; v36/delta_log.mjs:97-119): świeże po kluczu, przeterminowane do GC.
      const granica = teraz() - L().lustroTtlMs;
      const lista = stronaLustra(a.s);
      const stare = new Set(lista.filter((e) => e.ts && e.ts < granica).map((e) => e.klucz));
      const swieze = lista.filter((e) => !stare.has(e.klucz) && tylkoPoprawne(e.payload));
      // GC w waitUntil (src/handlers/deltas_list.js:37-43), bez ochrony zakresu importu.
      if (stare.size) a.s.lustro = a.s.lustro.filter((e) => !stare.has(e.klucz));
      return json(200, { deltas: swieze.map((e) => ({ key: e.klucz, payload: kopia(e.payload) })), count: swieze.length });
    },
    delta(c) {
      const max = L().deltaMaxBytes;
      const zaDuza = () => blad(413, 'payload_too_large', 'Delta przekracza limit ' + max + ' bajtów');
      const v36 = konf.tryb === 'v36';
      if (!v36 && dlugoscZNaglowka(c.h) > max) return zaDuza();
      const ub = c.usterka('cialo');
      if (ub) return ub;
      if (!v36 && c.bajty.byteLength > max) return zaDuza();
      const raw = odczytajTekst(c);
      if (!raw) return blad(400, 'empty_payload', 'Ciało requestu nie może być puste');
      if (v36 && c.bajty.byteLength > max) return zaDuza();
      let body;
      try { body = JSON.parse(raw); } catch (_) { return blad(400, 'invalid_json', 'Nieprawidłowy JSON'); }
      if (!body || typeof body !== 'object') return blad(400, 'invalid_body', 'Nieprawidłowe ciało');
      const a = tokenem(c, typeof body.token === 'string' ? body.token : null);
      if (a.odp) return a.odp;
      const payload = body.payload;
      if (!tylkoPoprawne(payload)) return blad(400, 'invalid_delta', 'Brak/niepoprawny payload delty');
      if (v36) return deltaSciezkaV36(c, payload);
      lic.eid += 1;
      const h = doAppend(c, [przygotujD('d:' + uuidV4Z(lic.eid), payload)], 'd');
      if (h.status === 200) {
        const seq = h.przyjete[0].seq;
        dopiszLustro(c.slotId, payload, seq);
        // Przycinanie w waitUntil (src/handlers/delta.js:100-107): przy importPending bez numerów (from, to].
        przytnijLustro(a.s, h.importRange);
        return json(202, { ok: true, delivered: 0, seq, stored: true });
      }
      if (h.status === 404 || h.kod === 'hub_not_sqlite') return deltaSciezkaV36(c, payload);
      if (h.status === 429) return h.odp;
      if (h.kod === 'log_full') return blad(507, 'log_full', KOMUNIKATY.log_full);
      return blad(503, 'hub_unavailable', KOMUNIKATY.hub_unavailable);
    },
    changes(c) {
      const a = bearer(c);
      if (a.odp) return a.odp;
      const sp = c.url.searchParams;
      if (konf.tryb === 'v36') return changesZLustra(c, legacySince(sp.get('since')));
      const stron = sp.has('limit');
      let since;
      let limit = null;
      if (stron) {
        since = scislaLiczba(sp.get('since'));
        limit = scislaLiczba(sp.get('limit'));
        if (since === null || limit === null || limit < 1 || limit > L().pagedMaxLimit) {
          return blad(400, 'invalid_query', 'since musi być liczbą całkowitą ≥ 0, a limit liczbą całkowitą 1..' + L().pagedMaxLimit);
        }
      } else {
        since = legacySince(sp.get('since'));
      }
      const h = doRange(c, since, limit);
      if (h.status === 200) return json(200, h.body);
      if (h.status === 429) return h.odp;
      if (h.kod === 'hub_not_sqlite') return stron ? blad(503, 'hub_not_sqlite', KOMUNIKATY.hub_not_sqlite) : changesZLustra(c, since);
      if (h.kod === 'log_import_pending') return blad(503, 'log_import_pending', KOMUNIKATY.log_import_pending);
      return blad(503, 'hub_unavailable', KOMUNIKATY.hub_unavailable);
    },
    events(c) {
      const l = L();
      const zBearer = !!c.h.get('authorization');
      const cap = zBearer ? l.eventsBodyBytes : Math.min(l.eventsBodyBytes, 64 * 1024);
      const zaDuza = () => blad(413, 'payload_too_large', 'Partia zdarzeń przekracza limit ' + cap + ' bajtów');
      if (dlugoscZNaglowka(c.h) > cap) return zaDuza();
      if (zBearer) { const a = bearer(c); if (a.odp) return a.odp; }
      const ct = (c.h.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (ct !== 'application/json' && ct !== 'text/plain') return blad(415, 'unsupported_media_type', 'Wymagany Content-Type application/json albo text/plain');
      const ub = c.usterka('cialo');
      if (ub) return ub;
      if (c.bajty.byteLength > cap) return zaDuza();
      let body;
      try { body = JSON.parse(odczytajTekst(c)); } catch (_) { return blad(400, 'invalid_json', 'Nieprawidłowy JSON'); }
      if (!body || typeof body !== 'object') return blad(400, 'invalid_body', 'Nieprawidłowe ciało');
      if (!zBearer) { const a = tokenem(c, typeof body.token === 'string' ? body.token : null); if (a.odp) return a.odp; }
      if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > l.eventsPerBatch) {
        return blad(400, 'invalid_events', 'Lista events musi mieć od 1 do ' + l.eventsPerBatch + ' zdarzeń');
      }
      const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const powod = (e) => {
        if (!e || typeof e !== 'object') return 'invalid';
        if (typeof e.eid !== 'string' || !UUID_V4.test(e.eid)) return 'invalid';
        if (typeof e.iv !== 'string' || e.iv.length < 1 || e.iv.length > 64) return 'invalid';
        if (typeof e.data !== 'string') return 'invalid';
        if (!(e.z === undefined || e.z === 'gzip')) return 'invalid';
        if (!(e.aad === undefined || e.aad === 0 || e.aad === 1)) return 'invalid';
        if (utf8(JSON.stringify({ iv: e.iv, data: e.data })) > l.eventBytes) return 'oversize';
        return null;
      };
      const poprawne = [];
      const rejected = [];
      for (const e of body.events) {
        const k = powod(e);
        if (k) { rejected.push({ eid: (e && typeof e.eid === 'string') ? e.eid.slice(0, 64) : null, code: k }); continue; }
        poprawne.push(przygotujEv(e));
      }
      const h = doAppend(c, poprawne, 'ev');
      if (h.status === 200) return json(200, { ok: true, accepted: h.przyjete, rejected, headSeq: h.headSeq, ts: h.ts });
      if (h.status === 429) return h.odp;
      if (h.kod === 'log_full') return blad(507, 'log_full', KOMUNIKATY.log_full);
      if (h.kod === 'hub_not_sqlite') return blad(503, 'hub_not_sqlite', KOMUNIKATY.hub_not_sqlite);
      return blad(503, 'hub_unavailable', KOMUNIKATY.hub_unavailable);
    },
  };

  // ── Dopasowanie trasy (src/worker.js:183-202) ──
  function dopasuj(metoda, sciezka) {
    if (metoda === 'OPTIONS') return { klucz: 'options', slotId: null, rl: 'none' };
    if (metoda === 'GET' && sciezka === '/v1/health') return { klucz: 'health', slotId: null, rl: 'none' };
    for (const t of TRASY_MODELU) {
      if (t.klucz === 'health' || t.metoda !== metoda) continue;
      if (t.tylkoV37aZFlaga && !(konf.tryb === 'v37a' && konf.eventsEnabled)) continue;
      const m = sciezka.match(t.wzorzec);
      if (m) return { klucz: t.klucz, slotId: m[1] || null, rl: konf.tryb === 'v36' && t.rlV36 ? t.rlV36 : t.rl };
    }
    for (const t of TRASY_POZA_MODELEM) {
      if (t.metoda !== metoda) continue;
      const m = sciezka.match(t.wzorzec);
      if (m) return { klucz: t.klucz, slotId: /^[0-9a-f]{64}$/.test(m[1] || '') ? m[1] : null, rl: 'none', pozaModelem: true };
    }
    return null;
  }
  function originDozwolony(origin) {
    if (!origin) return null;
    if (konf.tryb === 'v37a' ? ORIGINY_V37A.includes(origin) : origin === ORIGIN_V36) return origin;
    return /^https?:\/\/localhost(:\d+)?$/.test(origin) ? origin : null;
  }
  function dopnij(c, r) {
    if (c.metoda !== 'OPTIONS') r.naglowki['x-api-version'] = konf.tryb === 'v37a' ? '37' : '0.1.0';
    const o = originDozwolony(c.h.get('origin'));
    if (o && c.metoda !== 'OPTIONS') {
      r.naglowki['access-control-allow-origin'] = o;
      r.naglowki['access-control-expose-headers'] = konf.tryb === 'v37a' ? EXPOSE_V37A : EXPOSE_V36;
      r.naglowki.vary = 'Origin';
    }
    return r;
  }
  function preflight(c) {
    const o = originDozwolony(c.h.get('origin'));
    if (!o) return odp(403, null, {});
    return odp(204, null, {
      'access-control-allow-origin': o, 'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization, If-Match, If-None-Match, X-Auth-Token-Hash',
      'access-control-expose-headers': konf.tryb === 'v37a' ? EXPOSE_V37A : EXPOSE_V36, 'access-control-max-age': '86400', vary: 'Origin',
    });
  }

  // Rdzeń: potok workera (src/worker.js:228-285) dla jednego żądania.
  function rdzen(c) {
    if (c.metoda === 'OPTIONS') return preflight(c);
    if (c.trasa === 'health') return dopnij(c, HANDLERY.health());
    if (!c.t) return dopnij(c, blad(404, 'not_found', 'Endpoint nie istnieje: ' + c.metoda + ' ' + c.url.pathname));
    const ur = c.usterka('rl');
    if (ur) return dopnij(c, ur);
    if (c.rl === 'slot') { const r = limitKV(rlSlot, 'rl:slot:' + c.slotId, L().slotRpm); if (r) return dopnij(c, r); }
    if (c.rl === 'registration') { const r = limitKV(rlReg, 'rl:reg:' + c.ip, L().regRpm); if (r) return dopnij(c, r); }
    const ui = c.usterka('handler');
    if (ui) return dopnij(c, ui);
    return dopnij(c, HANDLERY[c.trasa](c));
  }

  // ── Rejestr żądań i oś ──
  function zaznacz(urzadzenie, rodzaj, opis) {
    lic.os += 1;
    bump();
    os.push({ nr: lic.os, urzadzenie: urzadzenie || '-', rodzaj, opis });
  }
  function naruszenie(rodzaj, urzadzenie, opis) {
    lic.naruszenie += 1;
    const n = { nr: lic.naruszenie, rodzaj, urzadzenie: urzadzenie || null, opis };
    if (api._zamknieta) STRAZNIK.naruszenia.push({ ...n, opis: `${id}: ${opis}` });
    else naruszenia.push(n);
    return n;
  }
  function podsumujNaglowki(h, slotId) {
    const a = h.get('authorization');
    const s = slotId ? sloty.get(slotId) : null;
    let autoryzacja = 'brak';
    if (a != null) {
      if (!a.startsWith('Bearer ')) autoryzacja = 'inna';
      else {
        const t = a.slice(7).trim();
        if (!RE_TOKEN.test(t)) autoryzacja = 'bearer-format';
        else autoryzacja = s && s.kv && sha256Hex(t) === s.kv.tokenHash ? 'bearer' : 'bearer-zly';
      }
    }
    const th = h.get('x-auth-token-hash');
    let tokenHash = null;
    if (th != null) {
      const t = th.trim();
      if (!RE_HASH.test(t)) tokenHash = 'zly-format';
      else tokenHash = s && s.kv && s.kv.tokenHash !== t ? 'inny' : 'zgodny';
    }
    const im = parseIfMatch(h);
    const inm = parseIfNoneMatch(h);
    return {
      autoryzacja, ifMatch: im === null ? null : aliasEtagu(im), ifNoneMatch: inm === null ? null : (inm === '*' ? '*' : aliasEtagu(inm)),
      contentType: h.get('content-type'), tokenHash,
    };
  }
  function opisZadania(w, h) {
    const flagi = [];
    const a = h.get('authorization');
    if (a != null && a.startsWith('Bearer ')) flagi.push('Bearer');
    if (h.get('if-match') != null) flagi.push('If-Match');
    if (h.get('if-none-match') != null) flagi.push('If-None-Match');
    if (h.get('x-auth-token-hash') != null) flagi.push('X-Auth-Token-Hash');
    if (w.keepalive) flagi.push('keepalive');
    const sufiks = w.transport === 'beacon' ? ' (beacon)' : w.transport === 'fetch-okna' ? ' (fetch okna)' : '';
    return `→ ${w.metoda} ${w.sciezka}${w.zapytanie}${flagi.length ? ` [${flagi.join(', ')}]` : ''}${sufiks}`;
  }
  function pasuje(gdy, w) {
    if (typeof gdy === 'function') return !!gdy(w);
    const g = gdy || {};
    if (g.trasa != null && g.trasa !== w.trasa) return false;
    if (g.metoda != null && g.metoda !== w.metoda) return false;
    if (g.urzadzenie != null && g.urzadzenie !== w.urzadzenie) return false;
    if (g.slot != null && g.slot !== w.slot && aliasySlotow.get(g.slot) !== w.slot) return false;
    if (g.gdy && !g.gdy(w)) return false;
    return true;
  }
  // Przyjęcie żądania — synchronicznie (kolejność wobec słuchaczy klienta): wpis rejestru, oś, usterki.
  function przyjmij(z) {
    const t = dopasuj(z.metoda, z.url.pathname);
    const slotId = t ? t.slotId : null;
    const w = {
      nr: zadania.length, urzadzenie: z.urzadzenie || '-', transport: z.transport || 'bezposrednio', metoda: z.metoda,
      sciezka: maskuj(z.url.pathname), zapytanie: maskuj(z.url.search), slot: aliasSlotu(slotId), trasa: t ? t.klucz : null,
      naglowki: podsumujNaglowki(z.h, slotId), tokenWCiele: null, keepalive: !!z.keepalive, tryb: z.tryb || null,
      rozmiar: z.rozmiar || 0, czasStart: teraz(), czasKoniec: null, status: null, kod: null, wynik: 'w-locie', pozaKontraktem: false,
    };
    zadania.push(w);
    zaznacz(w.urzadzenie, 'zadanie', opisZadania(w, z.h));
    const przypiete = [];
    if (t && t.pozaModelem) {
      w.wynik = 'naruszenie';
      w.czasKoniec = w.czasStart;
      naruszenie('trasa-poza-modelem', z.urzadzenie, `${z.metoda} ${w.sciezka} (trasa workera poza modelem atrapy)`);
      zaznacz(w.urzadzenie, 'odpowiedz', '✗ naruszenie');
      return { w, t, slotId, przypiete, odrzucone: true };
    }
    if (!t && z.metoda !== 'OPTIONS' && konf.nieznanaTrasa === 'naruszenie') {
      naruszenie('nieznana-trasa', z.urzadzenie, `${z.metoda} ${w.sciezka}${w.zapytanie} (brak trasy w workerze)`);
    }
    ruch(w.urzadzenie).wLocie += 1;
    for (const u of usterki) {
      if (!u.aktywna || !pasuje(u.gdy, w)) continue;
      u.licznik += 1;
      if (u.licznik < u.ktore) continue;
      u.pozostalo -= 1;
      if (u.pozostalo <= 0) u.aktywna = false;
      przypiete.push(u);
      if (!u.opoznienie) u.osiagnij(w);
    }
    return { w, t, slotId, przypiete, skutki: new Map(), odrzucone: false };
  }
  // Skutek usterki w tym żądaniu: pierwszy aspekt = trafienie (nagłówek, SKUTEK USTERKI).
  function oznaczSkutek(x, u, aspekt) {
    let s = x.skutki.get(u);
    if (!s) { s = new Set(); x.skutki.set(u, s); u.trafienia += 1; }
    s.add(aspekt);
  }
  function brakiSkutku(x) {
    const out = [];
    for (const u of x.przypiete) {
      const s = x.skutki.get(u) || new Set();
      const brak = u.aspekty.filter((a) => !s.has(a));
      if (brak.length) out.push({ u, brak });
    }
    return out;
  }
  function czekaj(u, w, sygnal) {
    return new Promise((res, rej) => {
      const o = u.opoznienie;
      const wpis = { zwolnij: null };
      let timer = null;
      const koniec = () => { czekajace.delete(wpis); if (timer) clearTimeout(timer); if (sygnal) sygnal.removeEventListener('abort', przerwij); };
      const przerwij = () => { koniec(); rej(BLAD_PRZERWANIA()); };
      wpis.zwolnij = () => { koniec(); res(); };
      if (sygnal && sygnal.aborted) { rej(BLAD_PRZERWANIA()); return; }
      czekajace.add(wpis);
      if (sygnal) sygnal.addEventListener('abort', przerwij);
      u.osiagnij(w);
      if (o.brama) { if (u.zwolniona) wpis.zwolnij(); else u.czekajacy.add(wpis); }
      else timer = setTimeout(() => wpis.zwolnij(), Number(o.ms) || 0);
    });
  }
  // Dokończenie żądania: usterki transportu, rdzeń, zapis odpowiedzi w rejestrze i osi.
  async function dokoncz(x, bajty, sygnal) {
    const { w } = x;
    const r = ruch(w.urzadzenie);
    let wynik = null;
    let opisOsi = null;
    const skutek = (u, aspekt) => oznaczSkutek(x, u, aspekt);
    try {
      const us = x.przypiete;
      if (x.odrzuconyKeepalive || us.some((u) => u.siec)) {
        for (const u of us.filter((q) => q.siec)) skutek(u, 'siec');
        wynik = 'siec'; opisOsi = '✗ siec'; throw BLAD_SIECI();
      }
      const przed = us.find((u) => u.opoznienie && (u.opoznienie.faza || 'przed') === 'przed');
      if (przed) {
        skutek(przed, 'opoznienie');
        try { await czekaj(przed, w, sygnal); } catch (e) { wynik = 'przerwana-przed'; opisOsi = '✗ przerwana'; throw e; }
      }
      if (sygnal && sygnal.aborted) { wynik = 'przerwana-przed'; opisOsi = '✗ przerwana'; throw BLAD_PRZERWANIA(); }
      const h = x.h;
      if (w.trasa === 'delta' || (w.trasa === 'events' && !h.get('authorization'))) {
        try {
          const b = JSON.parse(DEC.decode(bajty));
          const s = sloty.get(x.slotId);
          w.tokenWCiele = typeof (b && b.token) !== 'string' || !b.token ? 'brak' : (s && s.kv && sha256Hex(b.token) === s.kv.tokenHash ? 'zgodny' : 'zly');
        } catch (_) { w.tokenWCiele = 'brak'; }
      }
      const c = {
        metoda: w.metoda, url: x.url, h, bajty, ip: (h.get('cf-connecting-ip') || '').trim() || (h.get('x-forwarded-for') || '').split(',')[0].trim() || x.ip, t: x.t, trasa: x.t ? x.t.klucz : null, slotId: x.slotId, rl: x.t ? x.t.rl : 'none',
        ponowienieHub: us.some((u) => u.ponowienieHub), lustroOpoznione: us.find((u) => u.lustroOpoznione) || null,
        // Kod zużyty w miejscu potoku, w którym worker go wytwarza (etapKodu) — dopiero wtedy trafienie.
        usterka(etap) {
          const u = us.find((q) => q.kod && !(x.skutki.get(q) || new Set()).has('kod') && etapKodu(q.kod, c.trasa, c.rl) === etap);
          if (!u) return null;
          skutek(u, 'kod');
          return odpUsterki(u, c);
        },
        zadzialalo(aspekt) { for (const u of us.filter((q) => q[aspekt])) skutek(u, aspekt); },
      };
      let o = rdzen(c);
      w.status = o.status;
      w.kod = o.meta.kod;
      for (const u of us.filter((q) => q.zmien)) { skutek(u, 'zmien'); o = u.zmien(o) || o; o.meta = { ...(o.meta || {}), pozaKontraktem: true }; w.pozaKontraktem = true; w.status = o.status; }
      const po = us.find((u) => u.opoznienie && u.opoznienie.faza === 'po');
      if (po) {
        skutek(po, 'opoznienie');
        try { await czekaj(po, w, sygnal); } catch (e) { wynik = 'przerwana-po'; opisOsi = '✗ przerwana'; throw e; }
      }
      if (us.some((u) => u.zgub)) {
        for (const u of us.filter((q) => q.zgub)) skutek(u, 'zgub');
        wynik = 'zgubiona'; opisOsi = '✗ zgubiona'; throw BLAD_SIECI();
      }
      o.meta = { trasa: w.trasa, kod: w.kod, pozaKontraktem: w.pozaKontraktem, etap: null, ...o.meta, zastosowano: brakiSkutku(x).length === 0 };
      wynik = 'odpowiedz';
      opisOsi = `← ${o.status}${o.status >= 400 && w.kod ? ' ' + w.kod : ''}`;
      return o;
    } finally {
      w.wynik = wynik || 'siec';
      w.czasKoniec = teraz();
      r.wLocie -= 1;
      zaznacz(w.urzadzenie, 'odpowiedz', opisOsi || '✗ siec');
      for (const { u, brak } of brakiSkutku(x)) {
        naruszenie('usterka-bez-skutku', w.urzadzenie, `usterka #${u.nr} (${u.opis}) przypięta do żądania #${w.nr} ${w.metoda} ${w.sciezka}${w.zapytanie} → ${w.status == null ? w.wynik : w.status}: bez skutku [${brak.join(', ')}] (tryb ${konf.tryb}, hub ${konf.hub})`);
      }
    }
  }
  function wejscie(z) {
    const url = new URL(String(z.url), adresBazowy);
    const h = z.naglowki instanceof Headers ? new Headers(z.naglowki) : new Headers(z.naglowki || {});
    let bajty;
    if (z.cialo == null) bajty = new Uint8Array(0);
    else if (typeof z.cialo === 'string') bajty = ENC.encode(z.cialo);
    else if (z.cialo instanceof Uint8Array) bajty = z.cialo;
    else if (z.cialo instanceof ArrayBuffer) bajty = new Uint8Array(z.cialo);
    else throw new Error('atrapa.obsluz: cialo musi być napisem, Uint8Array albo null');
    return { url, h, bajty };
  }

  /** Rdzeń bez transportu: pełny zestaw nagłówków (małe litery), ciało JSON jako tekst. */
  async function obsluz(z) {
    const { url, h, bajty } = wejscie(z);
    const metoda = String(z.metoda || 'GET').toUpperCase();
    const x = przyjmij({ metoda, url, h, urzadzenie: z.urzadzenie || '-', transport: z.transport || 'bezposrednio', rozmiar: bajty.byteLength });
    if (x.odrzucone) return { status: 0, naglowki: {}, cialo: null, meta: { trasa: x.w.trasa, kod: 'trasa-poza-modelem', zastosowano: false, pozaKontraktem: false, etap: null } };
    return dokoncz({ ...x, url, h, ip: z.ip || ipDomyslne }, bajty, null);
  }

  // ── Adaptery transportu ──
  function widoczneNaglowki(n) {
    if (!konf.cors) return n;
    const expose = new Set(String(n['access-control-expose-headers'] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    const out = {};
    for (const [k, v] of Object.entries(n)) if (bezpiecznyNaglowek.has(k) || expose.has(k)) out[k] = v;
    return out;
  }
  function sledzKonsumpcje(res, urzadzenie) {
    const r = ruch(urzadzenie);
    const start = () => { r.konsumpcje += 1; bump(); let gotowe = false; return () => { if (gotowe) return; gotowe = true; r.konsumpcje -= 1; bump(); }; };
    for (const m of ['json', 'text', 'arrayBuffer', 'blob']) {
      const f = res[m].bind(res);
      res[m] = () => { const kon = start(); return f().finally(kon); };
    }
    const body = res.body;
    if (body && typeof body.getReader === 'function') {
      const g = body.getReader.bind(body);
      body.getReader = (...a) => {
        const rd = g(...a);
        const kon = start();
        const read = rd.read.bind(rd);
        rd.read = () => read().then((x) => { bump(); if (x.done) kon(); return x; }, (e) => { kon(); throw e; });
        const rel = rd.releaseLock.bind(rd);
        rd.releaseLock = () => { kon(); return rel(); };
        const can = rd.cancel.bind(rd);
        rd.cancel = (...b) => { kon(); return can(...b); };
        return rd;
      };
    }
    return res;
  }
  function nieprzezroczysta() {
    const odrzuc = () => Promise.reject(new TypeError('odpowiedź nieprzezroczysta (no-cors)'));
    const o = { type: 'opaque', status: 0, ok: false, statusText: '', url: '', redirected: false, headers: new Headers(), body: null, bodyUsed: false, json: odrzuc, text: odrzuc, arrayBuffer: odrzuc, blob: odrzuc };
    o.clone = () => o;
    return o;
  }
  function wyslij(p, input, init, transport) {
    const i = init || {};
    let url;
    try { url = new URL(urlZWejscia(input)); } catch (_) { naruszenie('poza-atrapa', p.nazwa, 'nieprawidłowy adres'); return Promise.reject(BLAD_SIECI()); }
    if (p.zamkniete) { naruszenie('po-zamknieciu', p.nazwa, `${transport}: ${String(i.method || 'GET').toUpperCase()} ${maskuj(url.pathname)} po zamknięciu urządzenia`); return Promise.reject(BLAD_SIECI()); }
    if (url.origin !== p.origin) { naruszenie('poza-atrapa', p.nazwa, `${transport} do hosta spoza połączenia: ${url.host}`); return Promise.reject(BLAD_SIECI()); }
    const metoda = String(i.method || (input && input.method) || 'GET').toUpperCase();
    const h = new Headers(i.headers || (input && input.headers) || {});
    if (!h.has('origin')) h.set('origin', ORIGIN_STRONY);
    if (!h.has('cf-connecting-ip')) h.set('cf-connecting-ip', p.ip);
    // Domyślny Content-Type ciała jak w przeglądarce (Fetch, „extract a body”): napis → text/plain;charset=UTF-8, Blob →
    // jego type (pusty: bez nagłówka), URLSearchParams → application/x-www-form-urlencoded;charset=UTF-8, FormData →
    // multipart z granicą; ArrayBuffer i widoki — bez nagłówka. Ten sam obiekt daje potem bajty (ta sama granica).
    const cialoZ = i.body == null ? null : new Response(i.body);
    if (cialoZ && !h.has('content-type')) { const typ = cialoZ.headers.get('content-type'); if (typ) h.set('content-type', typ); }
    const rozmiar = rozmiarSync(i.body);
    if (rozmiar != null && i.body != null && !h.has('content-length')) h.set('content-length', String(rozmiar));
    const x = przyjmij({ metoda, url, h, urzadzenie: p.nazwa, transport, keepalive: !!i.keepalive, tryb: i.mode || null, rozmiar: rozmiar || 0 });
    if (x.odrzucone) return Promise.reject(BLAD_SIECI());
    const sygnal = i.signal || null;
    if (i.keepalive && p.wLocieKeepalive + (rozmiar || 0) > 65536) {
      // Przeglądarka odrzuca keepalive ponad wspólny limit przed wysłaniem: TypeError, usterki przypięte bez skutku.
      return dokoncz({ ...x, odrzuconyKeepalive: true, url, h, ip: p.ip }, new Uint8Array(0), null);
    }
    if (i.keepalive) p.wLocieKeepalive += rozmiar || 0;
    return (async () => {
      try {
        if (sygnal && sygnal.aborted) {
          return await dokoncz({ ...x, url, h, ip: p.ip }, new Uint8Array(0), sygnal);
        }
        const bajty = cialoZ ? new Uint8Array(await cialoZ.arrayBuffer()) : new Uint8Array(0);
        x.w.rozmiar = bajty.byteLength;
        const o = await dokoncz({ ...x, url, h, ip: p.ip }, bajty, sygnal);
        if (transport === 'fetch-okna' && i.mode === 'no-cors') return nieprzezroczysta();
        const bezCiala = o.status === 204 || o.status === 304;
        const res = new Response(bezCiala ? null : o.cialo, { status: o.status, headers: widoczneNaglowki(o.naglowki) });
        return sledzKonsumpcje(res, p.nazwa);
      } finally {
        if (i.keepalive) p.wLocieKeepalive -= rozmiar || 0;
      }
    })();
  }
  function beacon(p, adres, data) {
    if (typeof FormData !== 'undefined' && data instanceof FormData) { naruszenie('beacon-typ', p.nazwa, 'sendBeacon z FormData (klient tego nie używa)'); return false; }
    if (data instanceof URLSearchParams) { naruszenie('beacon-typ', p.nazwa, 'sendBeacon z URLSearchParams (klient tego nie używa)'); return false; }
    let url;
    try { url = new URL(String(adres)); } catch (_) { naruszenie('poza-atrapa', p.nazwa, 'beacon: nieprawidłowy adres'); return true; }
    if (p.zamkniete) { naruszenie('po-zamknieciu', p.nazwa, `beacon: POST ${maskuj(url.pathname)} po zamknięciu urządzenia`); return true; }
    if (url.origin !== p.origin) { naruszenie('poza-atrapa', p.nazwa, `beacon do hosta spoza połączenia: ${url.host}`); return true; }
    const rozmiar = rozmiarSync(data) || 0;
    const h = new Headers({ origin: ORIGIN_STRONY, 'cf-connecting-ip': p.ip, 'content-length': String(rozmiar) });
    if (typeof data === 'string') h.set('content-type', 'text/plain;charset=UTF-8');
    else if (typeof Blob !== 'undefined' && data instanceof Blob && data.type) h.set('content-type', data.type);
    if (p.wLocieKeepalive + rozmiar > 65536) {
      const w = { nr: zadania.length, urzadzenie: p.nazwa, transport: 'beacon', metoda: 'POST', sciezka: maskuj(url.pathname), zapytanie: maskuj(url.search), slot: null, trasa: null, naglowki: podsumujNaglowki(h, null), tokenWCiele: null, keepalive: true, tryb: 'no-cors', rozmiar, czasStart: teraz(), czasKoniec: teraz(), status: null, kod: null, wynik: 'beacon-odrzucony', pozaKontraktem: false };
      zadania.push(w);
      zaznacz(p.nazwa, 'zadanie', `✗ beacon odrzucony (${w.sciezka}, ${rozmiar} B w kolejce ponad limit)`);
      return false;
    }
    const x = przyjmij({ metoda: 'POST', url, h, urzadzenie: p.nazwa, transport: 'beacon', keepalive: true, tryb: 'no-cors', rozmiar });
    if (x.odrzucone) return true;
    p.wLocieKeepalive += rozmiar;
    Promise.resolve().then(async () => {
      try {
        const bajty = new Uint8Array(await new Response(data == null ? null : data).arrayBuffer());
        await dokoncz({ ...x, url, h, ip: p.ip }, bajty, null);
      } catch (_) { /* odpowiedź beaconu niewidoczna dla strony */ } finally { p.wLocieKeepalive -= rozmiar; }
    });
    return true;
  }

  function polacz(nazwa, o = {}) {
    const slug = String(nazwa).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'u';
    const adres = `https://${slug}.${id}.${DOMENA_ATRAPY}`;
    const origin = new URL(adres).origin;
    if (polaczenia.has(origin)) throw new Error(`atrapa ${id}: połączenie ${nazwa} już istnieje`);
    const p = { nazwa: String(nazwa), adres, origin, ip: o.ip || ipDomyslne, zamkniete: false, wLocieKeepalive: 0 };
    p.fetch = (input, init) => wyslij(p, input, init, 'fetch');
    p.fetchOkna = (input, init) => wyslij(p, input, init, 'fetch-okna');
    p.beacon = (url, data) => beacon(p, url, data);
    p.rozlacz = () => { p.zamkniete = true; };
    polaczenia.set(origin, p);
    POLACZENIA.set(origin, { polaczenie: p, atrapa: api });
    return p;
  }

  // ── Usterki ──
  function usterka(u) {
    if (!u || u.gdy === undefined) throw new Error('usterka: wymagane pole gdy');
    if (u.kod) {
      const k = KODY_USTEREK[u.kod];
      if (!k) throw new Error(`usterka: nieznany kod ${u.kod}`);
      const trasa = typeof u.gdy === 'object' ? u.gdy.trasa : undefined;
      if (!trasa) throw new Error(`usterka: kod ${u.kod} wymaga gdy.trasa`);
      if (!k.trasy.includes(trasa)) throw new Error(`usterka: worker nie wytwarza ${u.kod} na trasie ${trasa}`);
    }
    if (u.ponowienieHub && !(typeof u.gdy === 'object' && ['delta', 'events'].includes(u.gdy.trasa))) throw new Error('usterka: ponowienieHub tylko dla delta i events');
    lic.usterka += 1;
    const g = typeof u.gdy === 'object' ? u.gdy : {};
    let osiagnietaR;
    const osiagnieta = new Promise((r) => { osiagnietaR = r; });
    const q = {
      nr: lic.usterka, gdy: u.gdy, kod: u.kod || null, retryAfter: u.retryAfter, siec: !!u.siec, zgub: !!u.zgub,
      opoznienie: u.opoznienie || null, zmien: u.zmien || null, lustroOpoznione: !!u.lustroOpoznione, ponowienieHub: !!u.ponowienieHub,
      ktore: g.ktore || 1, pozostalo: g.ile == null ? 1 : g.ile, licznik: 0, trafienia: 0, aktywna: true, zwolniona: false,
      czekajacy: new Set(), odlozone: [], osiagnieta, osiagnietaJuz: false,
      osiagnij(w) { if (!q.osiagnietaJuz) { q.osiagnietaJuz = true; osiagnietaR(w); } },
    };
    // Aspekty, z których każdy musi zadziałać w przypiętym żądaniu (inaczej 'usterka-bez-skutku').
    q.aspekty = ['kod', 'opoznienie', 'siec', 'zgub', 'zmien', 'lustroOpoznione', 'ponowienieHub'].filter((a) => q[a]);
    q.opis = [q.kod ? 'kod ' + q.kod : null, ...q.aspekty.filter((a) => a !== 'kod'), g.trasa ? 'trasa ' + g.trasa : null].filter(Boolean).join(', ');
    if (q.lustroOpoznione && typeof u.gdy === 'object' && !u.gdy.trasa) throw new Error('usterka: lustroOpoznione wymaga gdy.trasa delta');
    usterki.push(q);
    return {
      get trafienia() { return q.trafienia; },
      osiagnieta,
      zwolnij() {
        q.zwolniona = true;
        for (const c of [...q.czekajacy]) c.zwolnij();
        q.czekajacy.clear();
        for (const w of q.odlozone) w.zwolnij();
      },
      rozbroj() { q.aktywna = false; },
    };
  }
  function wstrzymaj(gdy, { faza = 'przed' } = {}) {
    const u = usterka({ gdy, opoznienie: { brama: true, faza } });
    return { osiagnieta: u.osiagnieta, zwolnij: u.zwolnij, rozbroj: u.rozbroj, get trafienia() { return u.trafienia; } };
  }
  function zwolnijWszystko() {
    for (const q of usterki) { q.zwolniona = true; for (const c of [...q.czekajacy]) c.zwolnij(); q.czekajacy.clear(); for (const w of q.odlozone) w.zwolnij(); q.aktywna = false; }
    for (const c of [...czekajace]) c.zwolnij();
    for (const w of [...odlozoneLustra]) w.zwolnij();
  }

  // ── Zasiewanie (bez HTTP, bez limitów, bez wpisu w rejestrze; wpis w osi 'zasiew') ──
  async function zasiejSlot(o) {
    if (!RE_HASH.test(String(o.slotId))) throw new Error('zasiejSlot: slotId musi mieć 64 znaki hex');
    const s = stan(o.slotId);
    const tokenHash = o.tokenHash || (o.token ? sha256Hex(o.token) : null);
    if (!tokenHash) throw new Error('zasiejSlot: wymagany token albo tokenHash');
    const t = iso();
    if (o.tylkoTozsamosc) {
      s.kv = { tokenHash, registeredAt: t, updatedAt: t, identityOnly: true, size: 0 };
      s.blob = null;
      zaznacz('-', 'zasiew', `zasiew slot ${aliasSlotu(o.slotId)} tylko tożsamość`);
      return { etag: null };
    }
    const blob = o.blob ? new Uint8Array(o.blob) : new Uint8Array([1, 2, 3, 4]);
    const etag = nowyEtag();
    s.blob = blob;
    s.kv = { tokenHash, etag, uploadedAt: t, updatedAt: t, size: blob.byteLength };
    zaznacz('-', 'zasiew', `zasiew slot ${aliasSlotu(o.slotId)} blob ${blob.byteLength} B ${aliasEtagu(etag)}`);
    return { etag };
  }
  function pierwszySlot() {
    const k = [...sloty.keys()];
    if (k.length !== 1) throw new Error('atrapa: podaj slotId (sloty: ' + k.length + ')');
    return k[0];
  }
  function dopisz(o) {
    const slotId = o.slotId || pierwszySlot();
    const s = stan(slotId);
    const dz = s.dz;
    const src = o.src || 'd';
    let eid = o.eid;
    if (!eid) { lic.eid += 1; eid = src === 'ev' ? uuidV4Z(lic.eid) : 'd:' + uuidV4Z(lic.eid); }
    const body = src === 'ev' ? JSON.stringify({ iv: o.payload.iv, data: o.payload.data }) : JSON.stringify(o.payload);
    dz.head += 1;
    const seq = dz.head;
    dz.ev.push({ seq, eid: src === 'r2' ? 'r2:' + seq : eid, ts: teraz(), bytes: utf8(body), z: o.z === 'gzip' ? 'gzip' : null, aad: o.aad === 1 ? 1 : 0, body, src });
    dz.evBytes += utf8(body);
    if (o.lustro) dopiszLustro(slotId, o.payload, seq);
    zaznacz('-', 'zasiew', `zasiew wiersz ${aliasSlotu(slotId)} seq ${seq} src ${src}`);
    return { seq, eid: src === 'r2' ? 'r2:' + seq : eid };
  }
  function dopiszZaslepke(o = {}) {
    const slotId = o.slotId || pierwszySlot();
    const dz = stan(slotId).dz;
    dz.head += 1;
    dz.ev.push({ seq: dz.head, eid: 'gap:' + dz.head, ts: teraz(), bytes: 0, z: null, aad: 0, body: null, src: 'gap' });
    zaznacz('-', 'zasiew', `zasiew zaślepka ${aliasSlotu(slotId)} seq ${dz.head}`);
    return { seq: dz.head };
  }
  /** POZA KONTRAKTEM v37a (seq ciągły, src/durable/slot_hub.js:519-550): head += ile bez wierszy — tylko odporność klienta. */
  function wymusDziure(o) {
    const slotId = o.slotId || pierwszySlot();
    stan(slotId).dz.head += o.ile;
    zaznacz('-', 'zasiew', `POZA KONTRAKTEM dziura ${aliasSlotu(slotId)} +${o.ile}`);
  }
  function slot(slotId) {
    const id2 = slotId || pierwszySlot();
    const s = sloty.get(id2);
    if (!s) return null;
    return {
      kv: kopia(s.kv), blob: s.blob ? s.blob.slice() : null, prev: s.prev ? s.prev.blob.slice() : null,
      dz: kopia(s.dz), lustro: kopia(s.lustro), rlSlot: kopia(rlSlot.get('rl:slot:' + id2) || { windowStart: 0, count: 0 }),
    };
  }

  // ── Rzuty (zapis bazowy) ──
  function rzutOsi({ urzadzenie, od = 0, filtr } = {}) {
    const out = [];
    let poprzedni = null;
    for (const w of os.slice(od)) {
      if (urzadzenie != null && w.urzadzenie !== urzadzenie) continue;
      if (filtr && !filtr(w)) continue;
      const tekst = w.rodzaj === 'test' ? `test: ${w.opis}` : w.opis;
      if (w.rodzaj === 'dokument' && poprzedni && poprzedni.rodzaj === 'dokument' && poprzedni.tekst === tekst) continue;
      out.push(tekst);
      poprzedni = { rodzaj: w.rodzaj, tekst };
    }
    return out;
  }
  function rzutZadan({ urzadzenie, od = 0 } = {}) {
    return zadania.slice(od).filter((z) => urzadzenie == null || z.urzadzenie === urzadzenie).map((z) => {
      const n = z.naglowki;
      const flagi = [n.autoryzacja !== 'brak' ? n.autoryzacja : null, n.ifMatch ? 'If-Match:' + n.ifMatch : null, n.ifNoneMatch ? 'If-None-Match:' + n.ifNoneMatch : null, n.tokenHash ? 'hash:' + n.tokenHash : null, z.tokenWCiele ? 'token:' + z.tokenWCiele : null, z.keepalive ? 'keepalive' : null].filter(Boolean);
      return `${z.urzadzenie} ${z.transport} ${z.metoda} ${z.sciezka}${z.zapytanie} [${flagi.join(' ')}] ${z.rozmiar} B → ${z.status == null ? '-' : z.status}${z.kod ? ' ' + z.kod : ''} ${z.wynik}${z.pozaKontraktem ? ' POZA-KONTRAKTEM' : ''}`;
    });
  }

  const api = {
    id, adresBazowy, zegar, ustaw, obsluz, polacz,
    get konfiguracja() { return kopia({ ...konf }); },
    slot, zasiejSlot, dopisz, dopiszZaslepke, wymusDziure,
    wipe(slotId) { wipeDO(stan(slotId || pierwszySlot()).dz); },
    ewikcjaDO(slotId) { restartDO(stan(slotId || pierwszySlot())); },
    nazwijSlot(slotId, alias) { aliasySlotow.set(slotId, alias); },
    aliasSlotu, aliasEtagu,
    usterka, wstrzymaj, zwolnijWszystko,
    zadania, os, ramki, naruszenia,
    zaznacz(urzadzenie, rodzaj, opis) { zaznacz(urzadzenie, rodzaj, opis); },
    przyjmijNaruszenia: (gdy) => przyjmijZ(naruszenia, gdy),
    ruch(urzadzenie) {
      if (urzadzenie != null) { const r = ruch(urzadzenie); return { wLocie: r.wLocie, konsumpcje: r.konsumpcje }; }
      let wLocie = 0; let konsumpcje = 0;
      for (const r of ruchUrz.values()) { wLocie += r.wLocie; konsumpcje += r.konsumpcje; }
      return { wLocie, konsumpcje };
    },
    aktywnosc: () => lic.aktywnosc,
    rzutOsi, rzutZadan,
    _polaczenia: () => [...polaczenia.values()],
    _zamknieta: false,
  };
  ATRAPY.add(api);
  return api;
}

export { tura };
