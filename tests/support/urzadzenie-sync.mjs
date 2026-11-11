// E2-PR0 — uprząż „urządzenia synchronizacji” dla testów jednostkowych: prawdziwy sejf (vilda_crypto.js,
// vilda_retention.js, vilda_vault.js) i prawdziwy vilda_sync.js w osobnym oknie na urządzenie, połączenie z atrapą
// workera (tests/support/atrapa-workera-sync.mjs) przez OSOBNY HOST urządzenia, bliźniak tego samego konta (klon stanu
// adaptera Ze), atrapa Web Locks ze `steal`, wspólna oś zdarzeń, wykrywanie ciszy i sprzątanie. Dane wyłącznie FIKCYJNE
// („Testowy Jan”, „Fikcyjna Lekarka”).
//
// Przypisanie ruchu: każde urządzenie dostaje VILDA_SYNC_WORKER_URL = https://<slug>.<id atrapy>.atrapa-workera.invalid;
// vilda_sync.js (j() 4:2257), integracja (A()) i realtime (B()) czytają je przy każdym żądaniu. Bliźniaki mają ten sam
// token, więc przypisanie po Authorization nie działa; AsyncLocalStorage jest niepewne przy fałszywych timerach.
// Strażnik sieci: import tego pliku instaluje globalny dyspozytor fetch (zainstalujStraznikaSieci) i nigdy nie wraca do
// prawdziwego fetch w trakcie pliku; vi.stubGlobal działa nad nim, a vi.unstubAllGlobals() wraca do strażnika. Każde
// żądanie spoza atrapy, po zamknięciu urządzenia albo do trasy poza modelem = TypeError i wpis w naruszeniach, a
// sprzatnijUrzadzenia() rzuca, gdy lista nie jest pusta (test czerwony). Import rejestruje też afterAll pliku: czeka do 5 s
// na operacje osierocone (urządzenie zamknięte z operacją w toku) i rzuca przy naruszeniu strażnika po ostatnim
// sprzątaniu albo operacji, która dalej trwa — praca w tle, która przeżyła test, wywraca plik zamiast przepaść.
// Operacje synchronizacji: onSyncStart / onSyncComplete / onSyncError liczą operacje w toku na urządzeniu. Operacja
// uśpiona w prawdziwym setTimeout vilda_sync.js (odstęp po 412 albo 429) nie ma żądań w locie ani aktywności, więc bez
// tego licznika cisza() wracałaby przed jej końcem; teraz cisza czeka, a po limicie zgłasza „operacja synchronizacji w
// toku: <urządzenie> <operacja>”.
//
// Reużycie: okno(), atrapaTimerow, magazynZRejestrem, HASLO_A, naglowek, wytnijFunkcje, zrodlo z
// tests/unit/sesja-zapisu-uprzaz.mjs (bez urzadzenie(), zaladujSync() i sprzatnij(): tamte zakładają jedno urządzenie i własny fetch).
// Fałszywe timery: uprząż ich nie włącza; test, który je włącza, robi to przed utworzUrzadzenie i woła vi.useRealTimers()
// w swoim afterEach PO sprzatnijUrzadzenia().
//
// EKSPORTY
//   utworzUrzadzenie(o) → Promise<Urzadzenie>
//       o: atrapa, nazwa ('A', 'B', 'telefon'…), zBlizniaka (Urzadzenie — to samo konto, slot i token), klon ('sejf' |
//       'wszystko' — także localStorage/sessionStorage źródła), haslo (HASLO_A), sync (true — ładuje vilda_sync.js),
//       beacon (true — navigator.sendBeacon i win.fetch = polaczenie.beacon / fetchOkna), blokady (true — atrapaBlokad),
//       krypto (false — atrapaKrypto), rejestrMagazynu (true — magazynZRejestrem), dodatki (pola okna), ip,
//       blokadyWOsi (RegExp, domyślnie /^vilda-sync-/), konto (opcje createUser nowego konta, np. { storageMode:
//       'cloud-only' } — tryb „Komputer w pracy” jak w tests/unit/sesja-zapisu-uprzaz.mjs; bliźniak dziedziczy konto),
//       zrodla ({ plik: (win) => void } — przekazywane do okno(): plik z listy skryptów sejfu ładuje podana funkcja
//       zamiast pliku z repozytorium, np. kopia z rejestrem łańcucha w teście A ≡ B, E2-PR3a3; bez opcji jak dotąd),
//       magazynSejfu ('natywny' — E2-PR4c: sejf na natywnym adapterze IndexedDB, tryb „Komputer prywatny” z prawdziwym
//       magazynem kolejki i kwarantanny; wymaga indexedDB (atrapa tests/support/atrapa-indexeddb.mjs) albo natywnego
//       zBlizniaka — wtedy klon jego atrapy; test stubuje IDBKeyRange; migawka() niedostępna), nawigator (dodatkowe pola
//       navigator, np. serviceWorker; okno dostaje wtedy MessageChannel z Node).
//       E2-PR4d (nadawca kolejki): karta (Urzadzenie natywne — druga karta TEJ SAMEJ przeglądarki: ta sama atrapa
//       IndexedDB (nie klon), wspólny localStorage, wspólna atrapa Web Locks i ta sama grupa kanałów; własny
//       sessionStorage, własne połączenie i własny dokument; to samo konto odblokowane hasłem), ramka (Urzadzenie
//       natywne — ramka tego samego dokumentu: jak karta, a do tego wspólny sessionStorage i win.top = okno rodzica, więc
//       self !== top), kanal (true — atrapa BroadcastChannel tej grupy przeglądarki; przy karcie i ramce zawsze),
//       zdarzeniaOkna (true — addEventListener/dispatchEvent okna na EventTarget zamiast no-op; przy karcie i ramce
//       zawsze). Dziennik zapisów wspólnego localStorage prowadzi urządzenie, które go utworzyło.
//   sprzatnijUrzadzenia({ czekaj = true }) → Promise — afterEach: zwalnia bramy, czeka na ciszę (także na operacje
//       synchronizacji w toku), zamyka urządzenia, sprawdza naruszenia i żądania w locie wszystkich atrap oraz strażnika;
//       rzuca z listą (przy limicie ciszy: „operacja synchronizacji w toku: <urządzenie> <operacja>”).
//   cisza(lista, { K = 5, limitMs = 5000 }) → Promise<liczba tur>
//   eksportKanoniczny(ladunek, { pominSeq = false, pominSnapshotCount = false }) → JSON do porównań A ≡ B
//       Domyślnie jak dotąd (U1–U16). pominSeq — bez snapshotTombstones[].seq (licznik lokalny wpisu kosza, różny na
//       urządzeniach przy tej samej treści); pominSnapshotCount — bez patients[].snapshotCount (licznik karty, który
//       zdarzenia jednej encji i pełny ładunek ustalają różnie) — porównanie „modulo seq i snapshotCount” (plan 3.10, E2-PR2a).
//   atrapaBlokad({ naZadanie, ctx }) — Web Locks ze `steal` (nadzbiór atrapaLocks z sesja-zapisu-uprzaz)
//   straznik() (z atrapy) — naruszenia globalnego dyspozytora.
//
// URZĄDZENIE d
//   d.nazwa, d.adres, d.polaczenie, d.atrapa, d.win, d.vault, d.sync, d.konto ({ userId, haslo }), d.blokady, d.timery,
//   d.dziennikMagazynu (zapisy localStorage/sessionStorage z okno()), d.adapter (surowy Ze; natywne — null), d.magazyn (rejestr
//   albo null), d.indexedDB (atrapa urządzenia natywnego albo null), d.krypto (atrapa kryptografii z hakami przy krypto: true),
//   d.slotId (po utworzeniu), d.material(), d.odblokuj(), d.zablokuj(powod), d.zapiszKarte(i, o) → { patientId },
//   d.wyslijDelteKarty(patientId) → wynik prawdziwego Bsb_wyslij z vilda_sync_integration.js, d.eksportKanoniczny(opcje?),
//   d.kursor(), d.zadania(), d.rzutOsi(o), d.rzutMagazynu({ od }), d.znacznik() (długość osi), d.znacznikMagazynu(),
//   d.zaznacz(opis) (wpis 'test'), d.cisza(o), d.migawka() (stan adaptera do klonu), d.zamknij();
//   d._licz { zdarzenia, scalenia, operacje (Map operacja → liczba w toku) } — liczniki ciszy.
//   d.przegladarka (grupa przeglądarki: kanaly — wiadomości atrapy BroadcastChannel { kanal, od, data } w kolejności
//   wysłania; utworzone — instancje { kanal, od }), d.zdarzenieOkna(typ), d.zdarzenieDokumentu(typ, { visibilityState }) — E2-PR4d.
import { afterAll } from 'vitest';
import { loadBrowserScript } from './load-browser-script.mjs';
import { okno, magazynZRejestrem, HASLO_A, naglowek, wytnijFunkcje, zrodlo } from '../unit/sesja-zapisu-uprzaz.mjs';
import {
  zainstalujStraznikaSieci, straznik, wszystkieAtrapy, zamknijAtrape, tura,
} from './atrapa-workera-sync.mjs';

zainstalujStraznikaSieci();
export { straznik };

const BEZ_KONTEKSTU = { kto: () => null, nrSesji: () => 0 };
const URZADZENIA = new Set();
const OSIEROCONE = new Set(); // urządzenia zamknięte z operacją synchronizacji w toku (cisza po limicie, czekaj: false)
let licznikUrzadzen = 0;

// Ostatnia kontrola pliku (vitest izoluje pliki, więc import = jedna rejestracja na plik testu): czeka do 5 s na koniec
// operacji osieroconych przy zamknięciu, potem rzuca, gdy strażnik ma naruszenia albo operacja dalej trwa.
afterAll(async () => {
  const start = process.hrtime.bigint();
  const trwa = () => [...OSIEROCONE].flatMap((d) => operacjeWToku(d).map(([op]) => `${d.nazwa} ${op}`));
  while (trwa().length && Number(process.hrtime.bigint() - start) / 1e6 < 5000) await tura();
  const problemy = straznik().przyjmijNaruszenia().map((x) => `strażnik: ${x.rodzaj}: ${x.opis}`);
  for (const o of trwa()) problemy.push(`operacja synchronizacji w toku po zamknięciu urządzenia: ${o}`);
  OSIEROCONE.clear();
  if (problemy.length) throw new Error('po ostatnim sprzątaniu pliku praca w tle przeżyła test:\n  ' + problemy.join('\n  '));
});

// ── Atrapa Web Locks ze steal ────────────────────────────────────────────────────────────────────────────────────────
// Nadzbiór API atrapaLocks (tests/unit/sesja-zapisu-uprzaz.mjs): request(nazwa, [opcje], cb) z mode exclusive/shared,
// ifAvailable (cb(null)), signal (AbortError, także przerwanie w kolejce) i steal; query() { held, pending }; zadania
// ({ nr, nazwa, tryb, ifAvailable, sygnal, steal, test, sesja, nrSesji, wynik: 'przyznana' | 'w-kolejce' | 'zajeta' |
// 'przerwana' | 'skradziona' | 'kradziez' | 'odrzucona' }); trzymaj, zajeta, czekajacych, czekajNaKolejke, czekajNaZadanie,
// zwolnijWszystkie. Semantyka steal jak w specyfikacji Web Locks: steal z ifAvailable, mode 'shared' albo signal →
// NotSupportedError bez przyznania; trzymający tracą blokadę od razu (ich obietnica request odrzuca się AbortError,
// callback biegnie dalej, a jego koniec niczego nie zwalnia); kradnący przyznany natychmiast, przed kolejką.
export function atrapaBlokad({ naZadanie = null, ctx = BEZ_KONTEKSTU } = {}) {
  const stan = new Map();
  const zadania = [];
  const czekajacy = new Set();
  const nazwa = (n) => { if (!stan.has(n)) stan.set(n, { trzymajacy: [], kolejka: [] }); return stan.get(n); };
  const wolna = (s, tryb) => (tryb === 'shared' ? s.trzymajacy.every((t) => t.tryb === 'shared') : s.trzymajacy.length === 0);
  const powiadom = () => { for (const c of [...czekajacy]) if (c.sprawdz()) czekajacy.delete(c); };
  const bladPrzerwania = () => { const e = new Error('Żądanie blokady przerwane.'); e.name = 'AbortError'; return e; };
  function przetworzKolejke(s) {
    while (s.kolejka.length && wolna(s, s.kolejka[0].tryb)) s.kolejka.shift().start();
  }
  function przyznaj(n, s, wpis, cb, resolve, reject) {
    const uchwyt = { tryb: wpis.tryb, wpis, skradziona: false, reject };
    s.trzymajacy.push(uchwyt);
    const w = Promise.resolve().then(() => cb({ name: n, mode: wpis.tryb }));
    const zwolnij = () => {
      if (uchwyt.skradziona) return; // po kradzieży koniec callbacku niczego nie zwalnia
      const i = s.trzymajacy.indexOf(uchwyt);
      if (i >= 0) s.trzymajacy.splice(i, 1);
      przetworzKolejke(s);
      powiadom();
    };
    w.then(zwolnij, zwolnij);
    w.then((x) => { if (!uchwyt.skradziona) resolve(x); }, (e) => { if (!uchwyt.skradziona) reject(e); });
  }
  function request(n, opcje, cb) {
    if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
    opcje = opcje || {};
    const tryb = opcje.mode === 'shared' ? 'shared' : 'exclusive';
    const wpis = {
      nr: zadania.length, nazwa: String(n), tryb, ifAvailable: !!opcje.ifAvailable, sygnal: !!opcje.signal, steal: !!opcje.steal,
      test: !!opcje.__test, sesja: ctx.kto(), nrSesji: ctx.nrSesji(), wynik: null,
    };
    zadania.push(wpis);
    const s = nazwa(wpis.nazwa);
    let p;
    if (wpis.steal && (wpis.ifAvailable || opcje.mode === 'shared' || opcje.signal)) {
      wpis.wynik = 'odrzucona';
      p = Promise.reject(new DOMException('steal wymaga trybu exclusive, bez ifAvailable i bez signal', 'NotSupportedError'));
    } else if (opcje.signal && opcje.signal.aborted) {
      wpis.wynik = 'przerwana';
      p = Promise.reject(bladPrzerwania());
    } else if (wpis.steal) {
      for (const t of [...s.trzymajacy]) {
        t.skradziona = true;
        t.wpis.wynik = 'skradziona';
        t.reject(bladPrzerwania());
      }
      s.trzymajacy.length = 0;
      wpis.wynik = 'kradziez';
      p = new Promise((resolve, reject) => { przyznaj(wpis.nazwa, s, wpis, cb, resolve, reject); });
    } else if (wolna(s, tryb) && !s.kolejka.length) {
      wpis.wynik = 'przyznana';
      p = new Promise((resolve, reject) => { przyznaj(wpis.nazwa, s, wpis, cb, resolve, reject); });
    } else if (wpis.ifAvailable) {
      wpis.wynik = 'zajeta';
      p = Promise.resolve().then(() => cb(null));
    } else {
      wpis.wynik = 'w-kolejce';
      p = new Promise((resolve, reject) => {
        const w = { tryb, start: () => { wpis.wynik = 'przyznana'; przyznaj(wpis.nazwa, s, wpis, cb, resolve, reject); } };
        s.kolejka.push(w);
        if (opcje.signal) {
          opcje.signal.addEventListener('abort', () => {
            const i = s.kolejka.indexOf(w);
            if (i < 0) return;
            s.kolejka.splice(i, 1);
            wpis.wynik = 'przerwana';
            reject(bladPrzerwania());
            powiadom();
          });
        }
      });
    }
    if (naZadanie && !wpis.test) naZadanie(wpis);
    powiadom();
    return p;
  }
  function czekaj(sprawdz) {
    return new Promise((r) => {
      const c = { sprawdz: () => { const w = sprawdz(); if (w === undefined || w === false) return false; r(w); return true; } };
      if (!c.sprawdz()) czekajacy.add(c);
    });
  }
  const trzymane = new Set();
  return {
    request,
    zadania,
    query: async () => ({
      held: [...stan.entries()].flatMap(([n, s]) => s.trzymajacy.map((t) => ({ name: n, mode: t.tryb }))),
      pending: [...stan.entries()].flatMap(([n, s]) => s.kolejka.map((k) => ({ name: n, mode: k.tryb }))),
    }),
    zajeta: (n) => nazwa(n).trzymajacy.length > 0,
    czekajacych: (n) => nazwa(n).kolejka.length,
    czekajNaKolejke: (n, ile = 1) => czekaj(() => nazwa(n).kolejka.length >= ile || undefined),
    czekajNaZadanie(gdy, { od = 0 } = {}) {
      const g = typeof gdy === 'string' ? (z) => z.nazwa === gdy : gdy instanceof RegExp ? (z) => gdy.test(z.nazwa) : gdy;
      return czekaj(() => zadania.slice(od).find((z) => !z.test && g(z)));
    },
    trzymaj(n, { tryb } = {}) {
      let pusc, przyznano;
      const trzymana = new Promise((r) => { pusc = r; });
      const przyznana = new Promise((r) => { przyznano = r; });
      const uchwyt = { zwolnij: null };
      const p = request(n, { mode: tryb, __test: true }, () => { przyznano(uchwyt); return trzymana; });
      p.catch(() => {});
      uchwyt.zwolnij = () => { trzymane.delete(uchwyt); pusc(); return p.then(() => {}, () => {}); };
      trzymane.add(uchwyt);
      return przyznana;
    },
    zwolnijWszystkie() { return Promise.all([...trzymane].map((u) => u.zwolnij())).then(() => {}); },
  };
}

// ── Eksport kanoniczny (porównania A ≡ B) ────────────────────────────────────────────────────────────────────────────
// Pomija userId, label, exportedAtISO, lastMergeAtISO (poziom główny) i patients[].header.timestampISO; klucze obiektów
// sortowane, tablice obiektów po patientId|snapshotId|id|credentialId (bliźniak równy źródłu po klonie i po wymianie — testy U1–U3).
// Opcje (E2-PR2a, zgodne wstecz — bez opcji wynik bez zmian): pominSeq usuwa snapshotTombstones[].seq,
// pominSnapshotCount usuwa patients[].snapshotCount.
const POMIJANE = ['userId', 'label', 'exportedAtISO', 'lastMergeAtISO'];
const KLUCZE_ID = ['patientId', 'snapshotId', 'id', 'credentialId'];
function kanon(x) {
  if (Array.isArray(x)) {
    const klucz = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? KLUCZE_ID.map((k) => (o[k] == null ? '' : String(o[k]))).join('|') : JSON.stringify(o));
    return x.map(kanon).map((v) => [klucz(v), v]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, v]) => v);
  }
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = kanon(x[k]);
    return o;
  }
  return x;
}
export function eksportKanoniczny(ladunek, { pominSeq = false, pominSnapshotCount = false } = {}) {
  const c = structuredClone(ladunek);
  for (const k of POMIJANE) delete c[k];
  for (const p of c.patients || []) {
    if (p && p.header) delete p.header.timestampISO;
    if (p && pominSnapshotCount) delete p.snapshotCount;
  }
  if (pominSeq) for (const e of c.snapshotTombstones || []) if (e) delete e.seq;
  return JSON.stringify(kanon(c));
}

// ── Cisza ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Urządzenie jest ciche, gdy jednocześnie: brak żądań w locie (także bram i opóźnień), brak czytanych ciał odpowiedzi,
// trwających scaleń sejfu i operacji synchronizacji w toku (onSyncStart bez onSyncComplete/onSyncError) — a liczniki
// aktywności atrap i zdarzeń urządzeń nie zmieniły się przez K kolejnych tur setImmediate (nie fałszowanych przez
// toFake ['Date'] ani ['setTimeout','clearTimeout','Date']). Limit w czasie rzeczywistym (process.hrtime) → wyjątek z
// diagnozą (operacje w toku na początku komunikatu).
const operacjeWToku = (d) => [...((d._licz.operacje && d._licz.operacje.entries()) || [])].filter(([, n]) => n > 0);
export async function cisza(lista, { K = 5, limitMs = 5000 } = {}) {
  const urz = (Array.isArray(lista) ? lista : [lista]).filter(Boolean);
  const atrapy = [...new Set(urz.map((d) => d.atrapa))];
  const start = process.hrtime.bigint();
  let ost = null;
  let spokoj = 0;
  let tury = 0;
  for (;;) {
    await tura();
    tury += 1;
    const cicho = urz.every((d) => {
      const r = d.atrapa.ruch(d.nazwa);
      return r.wLocie === 0 && r.konsumpcje === 0 && d._licz.scalenia === 0 && operacjeWToku(d).length === 0;
    });
    const akt = atrapy.reduce((n, a) => n + a.aktywnosc(), 0) + urz.reduce((n, d) => n + d._licz.zdarzenia, 0);
    if (cicho && akt === ost) {
      spokoj += 1;
      if (spokoj >= K) return tury;
    } else { spokoj = 0; ost = akt; }
    if (Number(process.hrtime.bigint() - start) / 1e6 > limitMs) {
      const ops = urz.flatMap((d) => operacjeWToku(d).map(([op]) => `${d.nazwa} ${op}`));
      const diag = urz.map((d) => ({ urzadzenie: d.nazwa, ...d.atrapa.ruch(d.nazwa), scalenia: d._licz.scalenia, operacje: Object.fromEntries(operacjeWToku(d)), os: d.atrapa.rzutOsi({ urzadzenie: d.nazwa }).slice(-5) }));
      throw new Error('cisza: brak ciszy w ' + limitMs + ' ms' + (ops.length ? '; operacja synchronizacji w toku: ' + ops.join(', ') : '') + ': ' + JSON.stringify(diag));
    }
  }
}

// ── Grupa przeglądarki: atrapa BroadcastChannel (E2-PR4d) ─────────────────────────────────────────────────────────────
// Kanały o tej samej nazwie w tej samej grupie (karty i ramki jednej przeglądarki) dostają wiadomość innych instancji
// (nie własną) w osobnej turze setImmediate, jako MessageEvent z klonem danych (structuredClone); close() kończy odbiór.
// Każda wysłana wiadomość trafia do grupa.kanaly ({ kanal, od: nazwa urządzenia, data }); grupa.utworzone — utworzone
// instancje ({ kanal, od }; sejf ma własny kanał vilda-notes).
function grupaPrzegladarki() {
  const instancje = new Map();
  const kanaly = [];
  const grupa = { kanaly, utworzone: [], klasa: null };
  grupa.klasa = (wlasciciel, wlasne) => class AtrapaBroadcastChannel {
    constructor(nazwa) {
      this.name = String(nazwa);
      grupa.utworzone.push({ kanal: this.name, od: wlasciciel });
      this.onmessage = null;
      this._et = new EventTarget();
      this._zamkniety = false;
      if (!instancje.has(this.name)) instancje.set(this.name, new Set());
      instancje.get(this.name).add(this);
      wlasne.add(this);
    }
    postMessage(data) {
      if (this._zamkniety) throw new DOMException('Kanał zamknięty.', 'InvalidStateError');
      const kopia = structuredClone(data);
      kanaly.push({ kanal: this.name, od: wlasciciel, data: structuredClone(kopia) });
      for (const k of instancje.get(this.name)) {
        if (k === this) continue;
        setImmediate(() => {
          if (k._zamkniety) return;
          const e = new MessageEvent('message', { data: structuredClone(kopia) });
          k._et.dispatchEvent(e);
          if (typeof k.onmessage === 'function') k.onmessage(e);
        });
      }
    }
    addEventListener(...a) { this._et.addEventListener(...a); }
    removeEventListener(...a) { this._et.removeEventListener(...a); }
    close() { this._zamkniety = true; instancje.get(this.name).delete(this); }
  };
  return grupa;
}

// ── Okno urządzenia ──────────────────────────────────────────────────────────────────────────────────────────────────
function dokumentZOsia(zapisz) {
  const et = new EventTarget();
  return {
    hidden: false, readyState: 'complete', visibilityState: 'visible',
    addEventListener: (...a) => et.addEventListener(...a),
    removeEventListener: (...a) => et.removeEventListener(...a),
    dispatchEvent(e) {
      if (e && typeof e.type === 'string' && /^vilda:sync/.test(e.type)) {
        const d = e.detail || {};
        zapisz([e.type, d.phase, d.source].filter((x) => typeof x === 'string' && x).join(' '));
      }
      try { return et.dispatchEvent(e); } catch (_) { return true; }
    },
  };
}
// This test-only closure uses the actual helper and its actual clinical-route
// dependencies. The legacy path remains unchanged; an unavailable selection
// still runs the real guard and real status publisher rather than a bypass.
const WYSLIJ_DELTE = (win) => {
  const source = zrodlo('vilda_sync_integration.js');
  const functions = ['s', 'v', 'WorkspaceIntegrationProtected', 'PatientClinicalRouteFailure', 'PatientClinicalLegacyAllowed', 'Bsb_wyslij']
    .map(name => wytnijFunkcje(source, name)).join('\n');
  return new Function('n', functions + ';return Bsb_wyslij')(win);
};

export async function utworzUrzadzenie(o = {}) {
  const atrapa = o.atrapa;
  if (!atrapa) throw new Error('utworzUrzadzenie: wymagana atrapa');
  licznikUrzadzen += 1;
  const nr = licznikUrzadzen;
  const nazwa = String(o.nazwa || `U${nr}`);
  const polaczenie = atrapa.polacz(nazwa, { ip: o.ip });
  const licz = { zdarzenia: 0, scalenia: 0, operacje: new Map() };
  const wOsi = (rodzaj, opis) => { licz.zdarzenia += 1; atrapa.zaznacz(nazwa, rodzaj, opis); };
  const wzorBlokad = o.blokadyWOsi || /^vilda-sync-/;
  // E2-PR4d: druga karta albo ramka tej samej przeglądarki — wspólne IndexedDB (ta sama atrapa), localStorage, blokady i
  // grupa kanałów; ramka także sessionStorage i okno nadrzędne.
  const wspolne = o.ramka || o.karta || null;
  if (wspolne && !wspolne.indexedDB) throw new Error('utworzUrzadzenie: karta i ramka wymagają natywnego urządzenia źródłowego');
  const blokady = o.blokady === false ? null : (o.blokady && typeof o.blokady.request === 'function') ? o.blokady
    : wspolne && wspolne.blokady ? wspolne.blokady : atrapaBlokad({
      naZadanie: (w) => { if (wzorBlokad.test(w.nazwa)) wOsi('blokada', `blokada ${w.nazwa} ${w.tryb}`); else licz.zdarzenia += 1; },
    });
  const przegladarka = wspolne ? wspolne.przegladarka : grupaPrzegladarki();
  const wlasneKanaly = new Set();
  const zKanalem = !!wspolne || o.kanal === true;
  const zdarzeniaOkna = !!wspolne || o.zdarzeniaOkna === true;
  const etOkna = zdarzeniaOkna ? new EventTarget() : null;
  const beacon = o.beacon !== false;
  const zrodloKlonu = o.zBlizniaka || wspolne || null;
  // E2-PR4c: sejf na natywnym adapterze IndexedDB (atrapa tests/support/atrapa-indexeddb.mjs) — tryb „Komputer prywatny”
  // z prawdziwym magazynem kolejki i kwarantanny. Bliźniak natywnego urządzenia dostaje klon jego atrapy IndexedDB.
  const natywny = o.magazynSejfu === 'natywny' || !!wspolne;
  if (natywny && typeof globalThis.IDBKeyRange === 'undefined') {
    throw new Error('utworzUrzadzenie: magazynSejfu natywny wymaga vi.stubGlobal(\'IDBKeyRange\', AtrapaIDBKeyRange)');
  }
  if (natywny && zrodloKlonu && !zrodloKlonu.indexedDB) throw new Error('utworzUrzadzenie: bliźniak natywny wymaga natywnego źródła');
  const idb = natywny ? (o.indexedDB || (wspolne ? wspolne.indexedDB : zrodloKlonu ? zrodloKlonu.indexedDB.__atrapa.klonuj() : null)) : null;
  if (natywny && !idb) throw new Error('utworzUrzadzenie: magazynSejfu natywny wymaga indexedDB (atrapa)');
  const ow = okno({
    locks: blokady || false,
    krypto: o.krypto ? undefined : false,
    dokument: dokumentZOsia((opis) => wOsi('dokument', opis)),
    navigator: { ...(beacon ? { sendBeacon: polaczenie.beacon, onLine: true } : { onLine: true }), ...(o.nawigator || {}) },
    dodatki: {
      VILDA_SYNC_WORKER_URL: polaczenie.adres, ...(beacon ? { fetch: polaczenie.fetchOkna } : {}), Blob, CustomEvent,
      ...(natywny ? { indexedDB: idb } : {}), ...(o.nawigator ? { MessageChannel } : {}),
      ...(wspolne ? { localStorage: wspolne.win.localStorage } : {}), ...(o.ramka ? { sessionStorage: o.ramka.win.sessionStorage } : {}),
      ...(zKanalem ? { BroadcastChannel: przegladarka.klasa(nazwa, wlasneKanaly) } : {}),
      ...(etOkna ? {
        addEventListener: (...a) => etOkna.addEventListener(...a),
        removeEventListener: (...a) => etOkna.removeEventListener(...a),
        dispatchEvent: (e) => etOkna.dispatchEvent(e),
      } : {}),
      ...(o.dodatki || {}),
    },
    ...(o.zrodla ? { zrodla: o.zrodla } : {}),
  });
  const win = ow.win;
  if (o.ramka) win.top = o.ramka.win; // ramka: self !== top (przed załadowaniem vilda_sync.js — Nt czyta to przy starcie)
  const vault = win.VildaVault;
  const persistKey = `urz-${nr}`;
  let ostatniStan = null;
  const backend = { readState: () => null, writeState: (k, st) => { ostatniStan = structuredClone(st); }, wipe() { ostatniStan = null; } };
  if (zrodloKlonu && !natywny) {
    const stanZrodla = await zrodloKlonu.migawka();
    backend.readState = () => structuredClone(stanZrodla);
  }
  const adapter = natywny ? null : vault.createInMemoryAdapter({ persistKey, durableBackend: backend, durableKey: persistKey });
  if (adapter && adapter.whenHydrated) await adapter.whenHydrated;
  const magazyn = natywny || o.rejestrMagazynu === false ? null : magazynZRejestrem(adapter);
  if (!natywny) vault.setStorageAdapter(magazyn ? magazyn.adapter : adapter);
  let konto;
  if (zrodloKlonu) {
    konto = { userId: zrodloKlonu.konto.userId, haslo: zrodloKlonu.konto.haslo };
    await vault.unlockUser(konto.userId, konto.haslo);
  } else {
    const haslo = o.haslo || HASLO_A;
    const u = await vault.createUser(haslo, { iterations: 1000, label: `Fikcyjna Lekarka ${nazwa}`, ...(o.konto || {}) });
    konto = { userId: u.userId, haslo };
  }
  if (zrodloKlonu && o.klon === 'wszystko' && !wspolne) {
    // „Ta sama przeglądarka po skopiowaniu profilu”: klucze źródła poza jego persistKey i vildaRetention.
    const pomin = new Set(['vildaRetention', `urz-${zrodloKlonu._nr}`]);
    for (const m of ['localStorage', 'sessionStorage']) {
      const z = zrodloKlonu.win[m];
      for (const k of z.klucze()) if (!pomin.has(k)) win[m].setItem(k, z.getItem(k));
    }
  }
  for (const m of ['applyEncryptedDelta', 'mergeSyncPayload']) {
    const f = vault[m];
    if (typeof f !== 'function') continue;
    vault[m] = function (...a) {
      licz.scalenia += 1;
      licz.zdarzenia += 1;
      let w;
      try { w = f.apply(this, a); } catch (e) { licz.scalenia -= 1; throw e; }
      return Promise.resolve(w).finally(() => { licz.scalenia -= 1; licz.zdarzenia += 1; });
    };
  }
  const material = async () => {
    const m = await vault.getSyncMaterial();
    return { slotId: m.slotId, authToken: m.authToken, authTokenHash: m.authTokenHash };
  };
  const slotId = (await material()).slotId;
  let sync = null;
  if (o.sync !== false) {
    loadBrowserScript('vilda_sync.js', win);
    sync = win.VildaSync;
    const operacja = (e, o) => {
      const op = String((e && e.operation) || '?');
      const n = (licz.operacje.get(op) || 0) + o;
      if (n > 0) licz.operacje.set(op, n); else licz.operacje.delete(op);
    };
    sync.onSyncStart((e) => { operacja(e, 1); wOsi('sync', `start ${e && e.operation}`); });
    sync.onSyncComplete((e) => { operacja(e, -1); wOsi('sync', `koniec ${e && e.operation}${e && e.result && e.result.action ? ' ' + e.result.action : ''}`); });
    sync.onSyncError((e) => { operacja(e, -1); wOsi('sync', `blad ${e && e.operation}${e && e.error && e.error.code ? ' ' + e.error.code : ''}`); });
  }
  ow.dziennik.length = 0;
  let wyslijDelte = null;
  let zamkniete = false;

  const d = {
    nazwa, adres: polaczenie.adres, polaczenie, atrapa, win, vault, sync, konto, blokady, timery: ow.timery,
    dziennikMagazynu: ow.dziennik, adapter, magazyn, indexedDB: idb, krypto: ow.krypto, slotId, _nr: nr, _licz: licz,
    przegladarka,
    material,
    zdarzenieOkna(typ) {
      if (!etOkna) throw new Error(`zdarzenieOkna ${nazwa}: urządzenie bez zdarzeniaOkna`);
      return etOkna.dispatchEvent(new Event(typ));
    },
    zdarzenieDokumentu(typ, { visibilityState } = {}) {
      if (visibilityState) { win.document.visibilityState = visibilityState; win.document.hidden = visibilityState === 'hidden'; }
      return win.document.dispatchEvent(new Event(typ));
    },
    odblokuj: () => vault.unlockUser(konto.userId, konto.haslo),
    zablokuj: (powod) => vault.lock(powod || 'manual'),
    zapiszKarte: (i, op = {}) => vault.savePatient(naglowek(i, op), { dedup: false, ...(op.zapis || {}) }),
    async wyslijDelteKarty(patientId) {
      const m = await material();
      const delta = await vault.buildPatientDelta(patientId);
      if (!delta || !delta.iv || !delta.data || delta.data.length > 6e4) return false; // próg jak gt (integracja 1:22520)
      const cialo = new win.Blob([JSON.stringify({ token: m.authToken, payload: delta })], { type: 'text/plain' });
      if (!wyslijDelte) wyslijDelte = WYSLIJ_DELTE(win);
      return wyslijDelte(polaczenie.adres + '/v1/slots/' + m.slotId + '/delta', cialo);
    },
    eksportKanoniczny: async (opcje) => eksportKanoniczny(await vault.exportSyncPayload(), opcje),
    kursor: () => Number(win.localStorage.getItem('vilda-sync-cursor-v1:' + slotId) || 0),
    zadania: () => atrapa.zadania.filter((z) => z.urzadzenie === nazwa),
    rzutOsi: (op = {}) => atrapa.rzutOsi({ urzadzenie: nazwa, ...op }),
    rzutMagazynu: ({ od = 0 } = {}) => ow.dziennik.slice(od)
      .filter((w) => /^vilda-(sync|cloud-etag)/.test(String(w.klucz)))
      .map((w) => `${w.op} ${w.magazyn} ${String(w.klucz).replace(/[0-9a-f]{64}/g, '<slot>')}`),
    znacznik: () => atrapa.os.length,
    znacznikMagazynu: () => ow.dziennik.length,
    zaznacz: (opis) => wOsi('test', opis),
    cisza: (op) => cisza([d], op),
    // Stan adaptera do klonu: Ze odkłada utrwalenie timerem 0 ms okna — flushPersist i jedna tura setImmediate.
    async migawka() {
      if (!adapter) throw new Error(`migawka ${nazwa}: urządzenie natywne (bliźniak przez klon atrapy IndexedDB)`);
      adapter.flushPersist();
      await tura();
      if (!ostatniStan) throw new Error(`migawka ${nazwa}: adapter nie utrwalił stanu`);
      return structuredClone(ostatniStan);
    },
    async zamknij() {
      if (zamkniete) return;
      zamkniete = true;
      if (operacjeWToku(d).length) OSIEROCONE.add(d);
      polaczenie.rozlacz();
      ow.timery.wyczysc();
      for (const k of [...wlasneKanaly]) k.close();
      if (blokady) await blokady.zwolnijWszystkie();
      if (magazyn) magazyn.rozbroj();
      ow.timery.wyczysc();
      URZADZENIA.delete(d);
    },
  };
  URZADZENIA.add(d);
  return d;
}

/** Po teście (afterEach). Kolejność: bramy → cisza → zamknięcie → kontrola naruszeń i żądań w locie → rzut z listą. */
export async function sprzatnijUrzadzenia({ czekaj = true } = {}) {
  const lista = [...URZADZENIA];
  const atrapy = wszystkieAtrapy();
  const problemy = [];
  for (const a of atrapy) a.zwolnijWszystko();
  if (czekaj && lista.length) {
    try { await cisza(lista, { K: 5, limitMs: 5000 }); } catch (e) { problemy.push(String(e.message || e)); }
  }
  for (const d of lista) await d.zamknij();
  for (const a of atrapy) {
    for (const n of a.przyjmijNaruszenia()) problemy.push(`${a.id}: naruszenie ${n.rodzaj} (${n.urzadzenie || '-'}): ${n.opis}`);
    for (const z of a.zadania) if (z.wynik === 'w-locie') problemy.push(`${a.id}: żądanie w locie #${z.nr} ${z.metoda} ${z.sciezka}${z.zapytanie} (${z.urzadzenie})`);
    zamknijAtrape(a);
  }
  for (const n of straznik().przyjmijNaruszenia()) problemy.push(`strażnik: naruszenie ${n.rodzaj}: ${n.opis}`);
  if (problemy.length) throw new Error('sprzątanie urządzeń: test zostawił naruszenia albo pracę w tle:\n  ' + problemy.join('\n  '));
}
