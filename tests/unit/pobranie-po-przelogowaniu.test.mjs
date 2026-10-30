// P-SESJA-ZAPISU (PR-S, S8) — pełne pobranie z chmury scala tylko w sesji konta, którego materiałem pobrano blob.
//
// VildaSync.syncPull i VildaSync.syncFull biorą materiał synchronizacji konta zalogowanego na starcie (slot, klucz),
// pytają serwer o stan slotu (/status), czekają na blob i dopiero potem scalają ładunek. Pobranie kończy się w sesji
// konta, które je zaczęło (liczy się konto, nie klucz): gdy w czasie czekania na /status, na sprawdzenie pustej bazy,
// na odpowiedź GET /blob (także 304 i 404) albo na treść bloba sejf zablokowano (sama blokada albo blokada i
// zalogowanie innego konta), pobranie kończy się SESSION_CHANGED („Nic nie scalono”). Po zmianie sesji: żadnych zapisów
// magazynu ani powiadomień, w koncie bieżącym brak kart pierwszego konta, stan synchronizacji slotu pierwszego konta
// (rejestracja, ETag, znacznik pobrania, kursor zmian) bez zmian, żadnych dalszych żądań do serwera (po /status — bez
// GET /blob; bez pobierania delt slotu) — pełna synchronizacja nie rejestruje ani nie wysyła slotu bieżącego konta.
// Pobieranie delt slotu po pobraniu idzie tylko w sesji konta tego slotu: zalogowanie innego konta w czasie pobierania
// delt (żądanie /changes) kończy partię bez stosowania delt i bez przesunięcia kursora slotu, a po powrocie do konta
// slotu delta przychodzi jeszcze raz i trafia do niego. Ponowne zalogowanie TEGO SAMEGO konta to ta sama tożsamość:
// pobranie scala jak dotąd. Bez API sesji sejfu (getCurrentUser) strażnik nie działa — zachowanie jak dotąd (atrapy
// sejfu w testach synchronizacji).
//
// Integracja (prawdziwy vilda_sync_integration.js): pobranie przerwane zmianą sesji należy do poprzedniej sesji — bez
// wpisu ostatniego błędu synchronizacji (vilda-sync-last-error-v1) i dziennika (sync.error) w bieżącym koncie, bez
// stanu „błąd” wskaźnika synchronizacji, a start trybu chmurowego nie zgłasza vilda:cloud-only-sync-failed. Ekran
// ładowania trybu chmurowego (stan w vilda_chrome.js) nie zostaje w „pulling”: gdy nowa sesja nie jest w trybie
// chmurowym (albo sejf zostaje zablokowany), start kończy się neutralnym „complete” (przerwane) i waitForCloudOnlySync
// się rozstrzyga; gdy jest — stan kończy jej własny start. Inne błędy synchronizacji — jak dotąd.
//
// Prawdziwe vilda_crypto.js, vilda_retention.js, vilda_vault.js i vilda_sync.js (uprząż sesja-zapisu-uprzaz.mjs: dwa
// konta na jednym magazynie w pamięci, atrapa serwera synchronizacji z przytrzymaniem żądania; odpowiedzi 304 i 404
// oraz treść bloba podawana po otwarciu bramy — przez nakładkę na fetch atrapy). C8: atrapa sejfu z getCurrentUser.
// I1: prawdziwa integracja na prawdziwym vilda_sync.js; I2–I3: prawdziwa integracja z atrapą VildaSync (pobranie
// rozstrzygane przez test, nasłuch błędów wywoływany wprost); I4–I5: maszyna stanu trybu chmurowego wycięta z prawdziwego
// vilda_chrome.js po kotwicach (stan T, lt, H, ut i trzy nasłuchy vilda:cloud-only-sync-*), zdarzenia dokumentu
// przekazywane do niej. C9: delta slotu podawana przez nakładkę na fetch atrapy (odpowiedź /changes), wywołania
// applyEncryptedDelta zapisywane z sesją. Czekanie wyłącznie na zdarzenia i obietnice (żądanie
// dotarło do atrapy serwera, operacja magazynu, odczyt treści bloba), bez stałych odczekań. Dane wyłącznie FIKCYJNE.
//
// Przypadki:
//   C1  syncPull konta A czeka na blob; lock('manual') + unlockUser(B); blob dociera → SESSION_CHANGED („Nic nie
//       scalono”), B bez kart A, po zmianie sesji brak zapisów i powiadomień, stan slotu A bez zmian, brak dalszych
//       żądań; po powrocie do A kolejne pobranie scala kartę w A.
//   C2  syncFull jak w C1 → SESSION_CHANGED, brak POST /register i PUT /blob do slotu B, ETag A bez zmian; kolejna
//       pełna synchronizacja w sesji B wysyła do slotu B tylko dane B.
//   C3a kontrola: bez zmiany sesji — 'merged', karta w A.
//   C3b kontrola: ponowne zalogowanie A w czasie czekania na blob — 'merged', karta w A, B bez niej.
//   C3c kontrola: atrapa sejfu bez getCurrentUser (jak w sync-rotacja-kart) — syncPull i syncFull jak dotąd ('merged',
//       bez pobierania delt: atrapa nie ma applyEncryptedDelta).
//   C4  syncPull czeka na /status (slot jeszcze niezarejestrowany na urządzeniu albo zarejestrowany z innym ETagiem);
//       zalogowanie B → SESSION_CHANGED bez GET /blob, stan slotu A bez zmian.
//   C5  slot A aktualny (ETag zgodny), przełączenie na B w czasie sprawdzania pustej bazy (karta A lokalnie albo pusta
//       baza A) → SESSION_CHANGED, bez pobierania delt slotu A i bez GET /blob, stan slotu A bez zmian.
//   C6  GET /blob konta A odpowiada 304 albo 404 po zalogowaniu B → SESSION_CHANGED, bez pobierania delt slotu A.
//   C7  treść bloba konta A dociera po zalogowaniu B (odpowiedź już przyszła) → SESSION_CHANGED, nic nie scalone.
//   C8  atrapa sejfu: konto zmienia się w czasie scalania — wynik 'merged', bez pobierania delt slotu po scaleniu.
//   C9  slot A aktualny, pobieranie delt slotu A (/changes) przytrzymane; zalogowanie B, delta dociera → bez
//       applyEncryptedDelta, kursor i stan slotu A bez zmian, w B nic; po powrocie do A następne pobranie stosuje deltę
//       w A (kursor przesunięty).
//   C10 błąd pobrania A po zalogowaniu B (przegląd 4), także sama blokada sejfu (bez logowania innego konta): /status
//       500, 401 albo bez sieci (slot zarejestrowany), /status 500 przy slocie niezarejestrowanym na urządzeniu,
//       GET /blob 500 albo bez sieci → SESSION_CHANGED, nasłuch błędów dostaje SESSION_CHANGED (w sesji B albo bez
//       sesji), stan slotu A bez zmian (401 nie zeruje rejestracji slotu A), bez zapisów stanu synchronizacji, brak
//       dalszych żądań.
//   K-C kontrole w jednej sesji: C4–C9 bez zmiany konta — 'merged' / 'up-to-date' / 'no-remote-blob' jak dotąd,
//       pobieranie delt slotu po pobraniu (K-C9: delta zastosowana w A, kursor przesunięty); K-C10: te same błędy
//       w jednej sesji — STATUS_FAILED, AUTH_FAILED (rejestracja slotu wyzerowana), błąd sieci, 'not-registered',
//       DOWNLOAD_FAILED, jak dotąd.
//   I1  integracja, syncPull konta A przerwany zalogowaniem B → brak vilda-sync-last-error-v1, brak sync.error w
//       dzienniku, brak stanu „błąd”.
//   I2  integracja, tryb chmurowy: start (pobranie konta A) kończy się SESSION_CHANGED → brak
//       vilda:cloud-only-sync-failed i stanu „błąd”.
//   I3  integracja: nasłuch błędów synchronizacji dostaje SESSION_CHANGED w sesji B → brak wpisu ostatniego błędu
//       i dziennika w B, brak stanu „błąd”.
//   I4  integracja, tryb chmurowy: start A przerwany SESSION_CHANGED, potem konto B lokalne (zalogowanie B albo sama
//       blokada i później zalogowanie B) → stan ekranu ładowania „complete” (przerwane), nie „pulling”;
//       waitForCloudOnlySync rozstrzygnięte, bez „failed”.
//   I5  jak I4, B też w trybie chmurowym → po przerwaniu startu A stan zostaje „pulling” do końca startu B, potem
//       „complete”.
//   I6  integracja (przegląd 4): /status konta A odpowiada 500 albo nie dociera (brak sieci) po zalogowaniu B → brak
//       wpisu ostatniego błędu i sync.error w B, brak stanu „błąd”.
//   K-I kontrole I2 i I3 z innym błędem (DOWNLOAD_FAILED) — „failed”, stan „błąd” i wpis ostatniego błędu jak dotąd;
//       K-I6: /status 500 w jednej sesji — wpis ostatniego błędu i sync.error w A, stan „błąd”.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b; C10 i I6 — na c209fa6b): C1, C2, C4–C10, I1–I6. Na
// kodzie bez poprawki przeglądu 4 czerwone C10 (poza GET /blob 500 — sprawdzenie po odpowiedzi GET /blob jest od
// przeglądu 1) i I6. Zielone wszędzie: C3a, C3b, C3c, K-C, K-I.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import {
  ADRES_CHMURY, atrapaChmury, naglowek, sprzatnij, urzadzenie, wynik, zaladujSync, zrodlo,
} from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const POBRANO = 'vilda-sync-pulled-v1';
const KLUCZ_SYNCHRONIZACJI = /^vilda-(sync-state-v1|sync-cursor-v1|cloud-etag-v1|sync-pulled-v1)(:|$)/;

/* Urządzenie z kontami A (zalogowane) i B; w chmurze slot A z kartą „Testowy Jan1”, lokalnie A tej karty nie ma —
   jak przy pierwszej synchronizacji po zalogowaniu na nowym urządzeniu (scalenie ma co dodać). */
async function przygotuj() {
  const d = await urzadzenie();
  const chmura = atrapaChmury();
  const sync = zaladujSync(d, { fetch: chmura.fetch });
  const karta = await d.v.savePatient(naglowek(1), { dedup: false });
  const { slotId: slotA, etag: etagA } = await chmura.wgrajKonto(d, { etag: 'A-1' });
  await d.baza.removePatientForUser(d.A.userId, karta.patientId);
  expect((await d.v.listPatients()).length, 'karta A tylko w chmurze').toBe(0);
  return { d, chmura, sync, pid: karta.patientId, slotA, etagA };
}

/* Stan synchronizacji slotu po stronie urządzenia: rekord stanu (ETag, chwila ostatniej synchronizacji), kursor zmian,
   ETag trybu chmurowego i znacznik pobrania w tej karcie przeglądarki. */
function stanSlotu(d, sync, slot) {
  return {
    stan: sync._loadSyncState(slot),
    kursor: d.win.localStorage.getItem(`vilda-sync-cursor-v1:${slot}`),
    etagChmurowy: d.win.localStorage.getItem(`vilda-cloud-etag-v1:${slot}`),
    pobrano: d.win.sessionStorage.getItem(POBRANO),
  };
}

/* Zapisy kluczy synchronizacji (localStorage i sessionStorage) po znaczniku. */
const zapisySynchronizacji = (d, z) => d.po(z).dziennik
  .filter((x) => x.klucz == null || KLUCZ_SYNCHRONIZACJI.test(x.klucz))
  .map((x) => `${x.magazyn}.${x.op} ${x.klucz}`);

const zadaniaOd = (chmura, nr) => chmura.log.slice(nr).map((x) => `${x.metoda} ${x.slot}${x.sciezka}`);

/* Ładunek slotu w atrapie serwera, odszyfrowany kluczem synchronizacji konta (iv 12 B || AES-GCM, JSON bez gzip —
   próg kompresji to 4 MB). */
async function ladunekSlotu(chmura, slot, klucz) {
  const s = chmura.sloty.get(slot);
  if (!s) return null;
  const jawne = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.body.slice(0, 12) }, klucz, s.body.slice(12));
  return JSON.parse(new TextDecoder().decode(jawne));
}

/* Pobranie (syncPull albo syncFull) ruszone w sesji A, przytrzymane na GET /blob slotu A; w czasie czekania `w trakcie`
   (np. przełączenie sesji), potem blob dociera. */
async function pobranieZPrzytrzymanymBlobem(k, operacja, wTrakcie) {
  const brama = k.chmura.wstrzymaj({ metoda: 'GET', sciezka: '/blob', slot: k.slotA });
  const wynikPobrania = wynik(k.sync[operacja]());
  const zadanieBloba = await brama.osiagnieta;
  const z = wTrakcie ? await wTrakcie() : k.d.znacznik();
  const przed = stanSlotu(k.d, k.sync, k.slotA);
  brama.zwolnij();
  const r = await wynikPobrania;
  return { r, z, przed, nrBloba: zadanieBloba.nr };
}

describe('P-SESJA-ZAPISU: pełne pobranie z chmury kończy się w sesji, w której ruszyło', () => {
  it('C1: syncPull konta A, w czasie czekania na blob lock + zalogowanie B — SESSION_CHANGED, B bez kart A, stan slotu A bez zmian', async () => {
    const k = await przygotuj();
    const { d, chmura, sync, pid, slotA, etagA } = k;

    const { r, z, przed, nrBloba } = await pobranieZPrzytrzymanymBlobem(k, 'syncPull', () => d.przelacz('B'));
    expect(d.sesja()).toBe('B');
    expect({ ok: r.ok, kod: r.kod }, `pobranie zakończone w sesji B: ${r.ok ? r.w && r.w.action : r.komunikat}`)
      .toEqual({ ok: false, kod: 'SESSION_CHANGED' });
    expect(r.komunikat).toMatch(/Nic nie scalono/);

    // po zmianie sesji brak zapisów i powiadomień; B bez kart A
    expect(d.po(z).zapisy, 'zapisy magazynu po zalogowaniu B').toEqual([]);
    expect(d.po(z).zdarzenia.map((x) => x.typ), 'powiadomienia po zalogowaniu B').toEqual([]);
    expect((await d.baza.listPatientsForUser(d.B.userId)).map((x) => x.patientId)).not.toContain(pid);
    expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
    expect((await d.v.listPatients()).map((x) => x.patientId), 'lista pacjentów sesji B').toEqual([]);

    // stan synchronizacji slotu A bez zmian, żadnych dalszych żądań do serwera
    expect(stanSlotu(d, sync, slotA), 'ETag, znacznik pobrania i kursor slotu A').toEqual(przed);
    expect(przed.stan.localEtag, 'ETag slotu A na urządzeniu przed pobraniem').toBe(null);
    expect(zapisySynchronizacji(d, z), 'zapisy stanu synchronizacji po zalogowaniu B').toEqual([]);
    expect(chmura.sloty.get(slotA).etag, 'ETag slotu A na serwerze').toBe(etagA);
    expect(zadaniaOd(chmura, nrBloba + 1), 'żądania po dotarciu bloba').toEqual([]);
    const slotB = (await d.v.getSyncMaterial()).slotId;
    expect(chmura.log.filter((x) => x.slot === slotB), 'żądania do slotu B').toEqual([]);

    // po powrocie do A kolejne pobranie scala kartę w A
    await d.zaloguj('A');
    const r2 = await wynik(sync.syncPull());
    expect(r2.ok, r2.komunikat).toBe(true);
    expect(r2.w.action).toBe('merged');
    expect((await d.v.listPatients()).map((x) => x.patientId)).toEqual([pid]);
    expect(await d.kartaTrwala('A', pid)).toMatchObject({ jest: true });
    expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
    expect(sync._loadSyncState(slotA).localEtag).toBe(etagA);
  });

  it('C2: syncFull konta A, w czasie czekania na blob lock + zalogowanie B — SESSION_CHANGED, bez POST /register i PUT /blob do slotu B', async () => {
    const k = await przygotuj();
    const { d, chmura, sync, pid, slotA, etagA } = k;

    const { r, z, przed, nrBloba } = await pobranieZPrzytrzymanymBlobem(k, 'syncFull', () => d.przelacz('B'));
    expect(d.sesja()).toBe('B');
    const opis = r.ok ? `pull ${r.w && r.w.pull && r.w.pull.action}, push ${r.w && r.w.push && r.w.push.action}` : r.komunikat;
    expect({ ok: r.ok, kod: r.kod }, `pełna synchronizacja zakończona w sesji B: ${opis}`).toEqual({ ok: false, kod: 'SESSION_CHANGED' });
    expect(r.komunikat).toMatch(/Nic nie scalono/);

    const slotB = (await d.v.getSyncMaterial()).slotId;
    const doSlotuB = chmura.log.filter((x) => x.slot === slotB).map((x) => `${x.metoda} ${x.sciezka}`);
    expect(doSlotuB.filter((x) => x === 'POST /register' || x === 'PUT /blob'), 'rejestracja i wysyłka do slotu B').toEqual([]);
    expect(doSlotuB, 'żądania do slotu B').toEqual([]);
    expect(chmura.sloty.has(slotB), 'slot B na serwerze').toBe(false);
    expect(zadaniaOd(chmura, nrBloba + 1), 'żądania po dotarciu bloba').toEqual([]);

    expect(d.po(z).zapisy, 'zapisy magazynu po zalogowaniu B').toEqual([]);
    expect(d.po(z).zdarzenia.map((x) => x.typ), 'powiadomienia po zalogowaniu B').toEqual([]);
    expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
    expect(chmura.sloty.get(slotA).etag, 'ETag slotu A na serwerze').toBe(etagA);
    expect(stanSlotu(d, sync, slotA), 'ETag, znacznik pobrania i kursor slotu A').toEqual(przed);
    expect(zapisySynchronizacji(d, z), 'zapisy stanu synchronizacji po zalogowaniu B').toEqual([]);

    // kolejna pełna synchronizacja w sesji B wysyła do slotu B tylko dane B
    const r2 = await wynik(sync.syncFull());
    expect(r2.ok, r2.komunikat).toBe(true);
    const { syncEncKey: kluczB } = await d.v.getSyncMaterial();
    const ladunekB = await ladunekSlotu(chmura, slotB, kluczB);
    expect(ladunekB, 'slot B po synchronizacji w sesji B').not.toBe(null);
    expect((ladunekB.patients || []).map((x) => x.patientId)).not.toContain(pid);
    expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
    expect(chmura.sloty.get(slotA).etag, 'ETag slotu A na serwerze').toBe(etagA);
  });

  describe('C3: kontrole pobrania', () => {
    it('C3a: bez zmiany sesji — pobranie scala kartę w A', async () => {
      const k = await przygotuj();
      const { d, chmura, sync, pid, slotA, etagA } = k;
      const { r } = await pobranieZPrzytrzymanymBlobem(k, 'syncPull', null);
      expect(r.ok, r.komunikat).toBe(true);
      expect(r.w.action).toBe('merged');
      expect(d.sesja()).toBe('A');
      expect((await d.v.listPatients()).map((x) => x.patientId)).toEqual([pid]);
      expect(await d.kartaTrwala('A', pid)).toMatchObject({ jest: true });
      expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
      expect(sync._loadSyncState(slotA).localEtag, 'ETag slotu A po scaleniu').toBe(etagA);
      expect(chmura.sloty.get(slotA).etag).toBe(etagA);
    });

    it('C3b: ponowne zalogowanie tego samego A w czasie czekania na blob — pobranie scala kartę w A', async () => {
      const k = await przygotuj();
      const { d, sync, pid, slotA, etagA } = k;
      const { r } = await pobranieZPrzytrzymanymBlobem(k, 'syncPull', () => d.przelacz('A'));
      expect(d.sesja()).toBe('A');
      expect(r.ok, r.komunikat).toBe(true);
      expect(r.w.action).toBe('merged');
      expect((await d.v.listPatients()).map((x) => x.patientId)).toEqual([pid]);
      expect(await d.kartaTrwala('A', pid)).toMatchObject({ jest: true });
      expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
      expect(sync._loadSyncState(slotA).localEtag, 'ETag slotu A po scaleniu').toBe(etagA);
    });

    it('C3c: atrapa sejfu bez getCurrentUser — syncPull i syncFull scalają jak dotąd', async () => {
      const chmura = atrapaChmury();
      vi.stubGlobal('fetch', chmura.fetch);
      const slot = 'fikcyjny-slot-atrapy-sejfu';
      const klucz = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const jawne = new TextEncoder().encode(JSON.stringify({ patients: [{ patientId: 'FIKCYJNY-1' }] }));
      const szyfr = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, jawne));
      const body = new Uint8Array(12 + szyfr.length);
      body.set(iv, 0); body.set(szyfr, 12);
      chmura.sloty.set(slot, { body, etag: 'S-1' });

      const scalenia = [];
      const sejf = {
        isUnlocked: () => true,
        isCloudOnlyMode: () => false,
        getSyncMaterial: async () => ({ slotId: slot, authToken: 'TOK-FIKCYJNY', authTokenHash: 'HASH-FIKCYJNY', syncEncKey: klucz }),
        exportSyncPayload: async () => ({ patients: [{ patientId: 'FIKCYJNY-1' }] }),
        listPatients: async () => [{ patientId: 'FIKCYJNY-1' }],
        mergeSyncPayload: async (ladunek) => { scalenia.push(ladunek); return {}; },
      };
      expect('getCurrentUser' in sejf).toBe(false);
      const win = {
        localStorage: magazynPrzegladarki(), sessionStorage: magazynPrzegladarki(),
        document: { dispatchEvent() { return true; } }, VildaVault: sejf, VILDA_SYNC_WORKER_URL: ADRES_CHMURY,
      };
      win.window = win; win.self = win; win.top = win;
      loadBrowserScript('vilda_sync.js', win);
      const sync = win.VildaSync;

      const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/blob', slot });
      const pobranie = wynik(sync.syncPull());
      await brama.osiagnieta;
      brama.zwolnij();
      const r = await pobranie;
      expect(r.ok, r.komunikat).toBe(true);
      expect(r.w.action).toBe('merged');
      expect(scalenia.map((x) => x.patients.map((p) => p.patientId))).toEqual([['FIKCYJNY-1']]);
      expect(zadaniaDelt(chmura, slot), 'sejf bez applyEncryptedDelta — bez pobierania delt, jak dotąd').toEqual([]);

      chmura.sloty.get(slot).etag = 'S-2';
      const r2 = await wynik(sync.syncFull());
      expect(r2.ok, r2.komunikat).toBe(true);
      expect(r2.w.pull.action).toBe('merged');
      expect(scalenia.length).toBe(2);
    });
  });
});

function magazynPrzegladarki() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

// ── Pobranie: sprawdzenie konta po /status, po sprawdzeniu pustej bazy, po odpowiedzi GET /blob i po treści bloba ────
const zadaniaDelt = (chmura, slot, nr = 0) => chmura.log.slice(nr).filter((x) => x.slot === slot && (x.sciezka === '/changes' || x.sciezka === '/deltas'));
const jestZadanie = (chmura, slot, sciezka, nr = 0) => chmura.log.slice(nr).some((x) => x.slot === slot && x.sciezka === sciezka);

/* Urządzenie i chmura jak w przygotuj(), z nakładką na fetch atrapy: `nakladka.blob` — odpowiedź GET /blob slotu A
   zamieniana na 304 / 404 albo na treść podawaną po otwarciu bramy (`nakladka.trescBrama`); `nakladka.zamiana`
   ({ sciezka: '/status' | '/blob', status: kod HTTP | 'siec' }) — odpowiedź GET tej ścieżki slotu A zamieniana na pustą
   z danym kodem albo na błąd sieci (po bramie atrapy serwera); `opcje.kartaLokalnie` —
   karta A zostaje w bazie urządzenia; `opcje.stan` — stan synchronizacji slotu A zapisany na urządzeniu przed pobraniem
   (jak po wcześniejszym pobraniu). `nakladka.zmiany` — delta slotu A ({ seq, payload }) w odpowiedzi /changes (dla
   since < seq); `nakladka.zadaniaZmian` — since każdego żądania /changes slotu A z sesją; `nakladka.poZmianach(n)` —
   odpowiedź n-tego żądania /changes odczytana (JSON). */
async function przygotujZNakladka({ kartaLokalnie = false, stan = null } = {}) {
  const d = await urzadzenie();
  const chmura = atrapaChmury();
  const nakladka = { blob: null, czytanie: null, brama: null, zmiany: null, zadaniaZmian: [], odczytaneZmiany: 0, zamiana: null };
  const czekajacyNaZmiany = [];
  nakladka.poZmianach = (n = 1) => (nakladka.odczytaneZmiany >= n ? Promise.resolve() : new Promise((r) => { czekajacyNaZmiany.push({ n, r }); }));
  const fetch = async (url, init) => {
    const u = new URL(String(url));
    const zmiany = !!(nakladka.slot && nakladka.zmiany && u.pathname.endsWith(`/slots/${nakladka.slot}/changes`));
    const since = parseInt(u.searchParams.get('since') || '0', 10);
    if (zmiany) nakladka.zadaniaZmian.push({ since, sesja: d.sesja() });
    const odp = await chmura.fetch(url, init);
    const z = nakladka.zamiana;
    if (z && nakladka.slot && u.pathname.endsWith(`/slots/${nakladka.slot}${z.sciezka}`) && String((init && init.method) || 'GET').toUpperCase() === 'GET') {
      if (z.status === 'siec') throw new TypeError('atrapa: brak sieci');
      return new Response('{}', { status: z.status, headers: { 'content-type': 'application/json' } });
    }
    if (zmiany) {
      const { seq, payload } = nakladka.zmiany;
      const r = new Response(JSON.stringify({ deltas: since < seq ? [{ seq, payload }] : [], headSeq: seq }), { status: 200, headers: { 'content-type': 'application/json' } });
      const json = r.json.bind(r);
      r.json = async () => {
        const w = await json();
        nakladka.odczytaneZmiany += 1;
        for (const c of czekajacyNaZmiany.splice(0)) if (nakladka.odczytaneZmiany >= c.n) c.r(); else czekajacyNaZmiany.push(c);
        return w;
      };
      return r;
    }
    if (!nakladka.slot || !u.pathname.endsWith(`/slots/${nakladka.slot}/blob`) || String((init && init.method) || 'GET').toUpperCase() !== 'GET') return odp;
    if (nakladka.blob === 304 || nakladka.blob === 404) return new Response(null, { status: nakladka.blob });
    if (nakladka.blob === 'brama') {
      const bajty = new Uint8Array(await odp.arrayBuffer());
      const strumien = new ReadableStream({
        async pull(k) { nakladka.czytanie(); await nakladka.brama; k.enqueue(bajty); k.close(); },
      }, { highWaterMark: 0 });
      return new Response(strumien, { status: odp.status, headers: odp.headers });
    }
    return odp;
  };
  const sync = zaladujSync(d, { fetch });
  const karta = await d.v.savePatient(naglowek(1), { dedup: false });
  const { slotId: slotA, etag: etagA } = await chmura.wgrajKonto(d, { etag: 'A-1' });
  nakladka.slot = slotA;
  if (!kartaLokalnie) await d.baza.removePatientForUser(d.A.userId, karta.patientId);
  if (stan) sync._saveSyncState(slotA, { ...sync._loadSyncState(slotA), ...stan });
  return { d, chmura, sync, nakladka, pid: karta.patientId, slotA, etagA };
}

// Wspólne oczekiwania po pobraniu przerwanym zmianą sesji.
async function pobranieKonczySieWSesjiA(k, { r, z, przed, nrOd }) {
  const { d, chmura, sync, pid, slotA, etagA } = k;
  expect(d.sesja()).toBe('B');
  expect({ ok: r.ok, kod: r.kod }, `pobranie zakończone w sesji B: ${r.ok ? r.w && r.w.action : r.komunikat}`).toEqual({ ok: false, kod: 'SESSION_CHANGED' });
  expect(r.komunikat).toMatch(/Nic nie scalono/);
  expect(d.po(z).zapisy, 'zapisy magazynu po zalogowaniu B').toEqual([]);
  expect(d.po(z).zdarzenia.map((x) => x.typ), 'powiadomienia po zalogowaniu B').toEqual([]);
  expect(await d.kartaTrwala('B', pid)).toEqual({ jest: false, wersje: 0 });
  expect(stanSlotu(d, sync, slotA), 'rejestracja, ETag, znacznik pobrania i kursor slotu A').toEqual(przed);
  expect(zapisySynchronizacji(d, z), 'zapisy stanu synchronizacji po zalogowaniu B').toEqual([]);
  expect(zadaniaDelt(chmura, slotA, nrOd), 'bez pobierania delt slotu A').toEqual([]);
  expect(chmura.sloty.get(slotA).etag, 'ETag slotu A na serwerze').toBe(etagA);
  const slotB = (await d.v.getSyncMaterial()).slotId;
  expect(chmura.log.filter((x) => x.slot === slotB), 'żądania do slotu B').toEqual([]);
}

const ZAREJESTROWANY_INNY_ETAG = { registered: true, localEtag: 'A-0', lastSyncAt: '2026-10-28T08:00:00.000Z' };
const ZAREJESTROWANY_AKTUALNY = { registered: true, localEtag: 'A-1', lastSyncAt: '2026-10-28T08:00:00.000Z' };

describe('P-SESJA-ZAPISU: pobranie sprawdza konto po każdym oczekiwaniu na serwer i na bazę', () => {
  it.each([
    ['slot niezarejestrowany na urządzeniu', null],
    ['slot zarejestrowany, ETag inny niż na serwerze', ZAREJESTROWANY_INNY_ETAG],
  ])('C4: syncPull konta A czeka na /status (%s); zalogowanie B — SESSION_CHANGED bez GET /blob, stan slotu A bez zmian', async (_opis, stan) => {
    const k = await przygotujZNakladka({ stan });
    const { d, chmura, sync, slotA } = k;
    const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/status', slot: slotA });
    const pobranie = wynik(sync.syncPull());
    const zadanie = await brama.osiagnieta;
    const z = await d.przelacz('B');
    const przed = stanSlotu(d, sync, slotA);
    brama.zwolnij();
    const r = await pobranie;
    await kolejnaTura();

    await pobranieKonczySieWSesjiA(k, { r, z, przed, nrOd: zadanie.nr });
    expect(zadaniaOd(chmura, zadanie.nr + 1), 'po /status żadnych żądań (bez GET /blob)').toEqual([]);
    expect(przed.stan.registered, 'rejestracja slotu A na urządzeniu jak przed pobraniem').toBe(!!stan);
  });

  it.each([
    ['karta A w bazie urządzenia', true],
    ['pusta baza A na urządzeniu', false],
  ])('C5: slot A aktualny, przełączenie na B w czasie sprawdzania pustej bazy (%s) — SESSION_CHANGED, bez delt i GET /blob', async (_opis, kartaLokalnie) => {
    const k = await przygotujZNakladka({ kartaLokalnie, stan: ZAREJESTROWANY_AKTUALNY });
    const { d, chmura, sync, slotA } = k;
    const nrOd = chmura.log.length;
    const hak = d.przelaczPo({ metoda: 'listPatientsForUser', konto: 'A' }, 'B');
    const przed = stanSlotu(d, sync, slotA);
    const r = await wynik(sync.syncPull());
    expect(hak.zrobione, 'pobranie sprawdziło pustą bazę (gałąź „aktualny”)').toBe(true);
    const z = await hak.gotowe;
    await kolejnaTura();

    await pobranieKonczySieWSesjiA(k, { r, z, przed, nrOd });
    expect(zadaniaOd(chmura, nrOd), 'tylko /status slotu A').toEqual([`GET ${slotA}/status`]);
    expect(stanSlotu(d, sync, slotA).stan.localEtag, 'ETag slotu A nie wyzerowany').toBe('A-1');
  });

  it.each([304, 404])('C6: GET /blob konta A odpowiada %s po zalogowaniu B — SESSION_CHANGED, bez pobierania delt slotu A', async (status) => {
    const k = await przygotujZNakladka({ stan: ZAREJESTROWANY_INNY_ETAG });
    const { d, chmura, sync, nakladka, slotA } = k;
    nakladka.blob = status;
    const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/blob', slot: slotA });
    const pobranie = wynik(sync.syncPull());
    const zadanie = await brama.osiagnieta;
    const z = await d.przelacz('B');
    const przed = stanSlotu(d, sync, slotA);
    brama.zwolnij();
    const r = await pobranie;
    await kolejnaTura();

    await pobranieKonczySieWSesjiA(k, { r, z, przed, nrOd: zadanie.nr });
    expect(zadaniaOd(chmura, zadanie.nr + 1), 'po GET /blob żadnych żądań').toEqual([]);
  });

  it('C7: treść bloba konta A dociera po zalogowaniu B (odpowiedź GET /blob już przyszła) — SESSION_CHANGED, nic nie scalone', async () => {
    const k = await przygotujZNakladka({ stan: ZAREJESTROWANY_INNY_ETAG });
    const { d, chmura, sync, nakladka, slotA } = k;
    let otworz;
    nakladka.blob = 'brama';
    nakladka.brama = new Promise((r) => { otworz = r; });
    const czytanie = new Promise((r) => { nakladka.czytanie = r; });
    const nrOd = chmura.log.length;
    const pobranie = wynik(sync.syncPull());
    await czytanie;
    const z = await d.przelacz('B');
    const przed = stanSlotu(d, sync, slotA);
    otworz();
    const r = await pobranie;
    await kolejnaTura();

    await pobranieKonczySieWSesjiA(k, { r, z, przed, nrOd });
    expect((await d.v.listPatients()).map((x) => x.patientId), 'lista pacjentów sesji B').toEqual([]);
  });

  it('C8: atrapa sejfu — konto zmienia się w czasie scalania; wynik „merged”, bez pobierania delt slotu po scaleniu', async () => {
    const a = await atrapaSejfuSynchronizacji({ zmienKontoWScalaniu: true });
    const r = await wynik(a.sync.syncPull());
    await a.poDrenazu();
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe('merged');
    expect(a.scalenia, 'scalenie w koncie, które zaczęło pobranie').toEqual(['U-A']);
    expect(zadaniaDelt(a.chmura, a.slot), 'bez pobierania delt slotu po zmianie konta').toEqual([]);
  });
});

// Przegląd 4 (ADW4-3): błąd pobrania A, który przychodzi już w sesji B albo po samej blokadzie sejfu — SESSION_CHANGED,
// nie zwykły błąd w bieżącej sesji.
const BLEDY_POBRANIA = [
  ['slot zarejestrowany, /status 500', ZAREJESTROWANY_INNY_ETAG, '/status', 500, 'STATUS_FAILED'],
  ['slot zarejestrowany, /status 401', ZAREJESTROWANY_INNY_ETAG, '/status', 401, 'AUTH_FAILED'],
  ['slot zarejestrowany, /status bez sieci', ZAREJESTROWANY_INNY_ETAG, '/status', 'siec', null],
  ['slot niezarejestrowany na urządzeniu, /status 500', null, '/status', 500, 'not-registered'],
  ['GET /blob 500', ZAREJESTROWANY_INNY_ETAG, '/blob', 500, 'DOWNLOAD_FAILED'],
  ['GET /blob bez sieci', ZAREJESTROWANY_INNY_ETAG, '/blob', 'siec', null],
];
async function pobranieZBledem(k, sciezka, status, wTrakcie) {
  const { d, chmura, sync, nakladka, slotA } = k;
  nakladka.zamiana = { sciezka, status };
  const bledy = [];
  sync.onSyncError((e) => { const x = (e && e.error) || e; bledy.push({ kod: (x && x.code) || null, sesja: d.sesja() }); });
  const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka, slot: slotA });
  const pobranie = wynik(sync.syncPull());
  const zadanie = await brama.osiagnieta;
  const z = wTrakcie ? await wTrakcie() : d.znacznik();
  const przed = stanSlotu(d, sync, slotA);
  brama.zwolnij();
  const r = await pobranie;
  await kolejnaTura();
  return { r, z, przed, zadanie, bledy };
}

describe('P-SESJA-ZAPISU (przegląd 4): błąd pobrania konta A po zalogowaniu B albo samej blokadzie sejfu należy do poprzedniej sesji', () => {
  it.each(BLEDY_POBRANIA)('C10: %s po zalogowaniu B — SESSION_CHANGED, stan slotu A bez zmian, bez dalszych żądań', async (_opis, stan, sciezka, status) => {
    const k = await przygotujZNakladka({ stan });
    const { r, z, przed, zadanie, bledy } = await pobranieZBledem(k, sciezka, status, () => k.d.przelacz('B'));

    await pobranieKonczySieWSesjiA(k, { r, z, przed, nrOd: zadanie.nr });
    expect(zadaniaOd(k.chmura, zadanie.nr + 1), 'po odpowiedzi żadnych żądań').toEqual([]);
    expect(przed.stan.registered, 'rejestracja slotu A na urządzeniu jak przed pobraniem').toBe(!!stan);
    expect(bledy, 'nasłuch błędów: SESSION_CHANGED w sesji B, nie błąd pobrania').toEqual([{ kod: 'SESSION_CHANGED', sesja: 'B' }]);
  });

  it.each(BLEDY_POBRANIA)('C10: %s po samej blokadzie sejfu (bez logowania innego konta) — SESSION_CHANGED, stan slotu A bez zmian, bez dalszych żądań', async (_opis, stan, sciezka, status) => {
    const k = await przygotujZNakladka({ stan });
    const { r, z, przed, zadanie, bledy } = await pobranieZBledem(k, sciezka, status, () => k.d.przelacz('blokada'));

    expect(k.d.sesja(), 'sejf zablokowany').toBe(null);
    expect({ ok: r.ok, kod: r.kod }, `pobranie zakończone po blokadzie: ${r.ok ? JSON.stringify(r.w) : r.komunikat}`).toEqual({ ok: false, kod: 'SESSION_CHANGED' });
    expect(stanSlotu(k.d, k.sync, k.slotA), 'rejestracja, ETag, znacznik pobrania i kursor slotu A').toEqual(przed);
    expect(zapisySynchronizacji(k.d, z), 'zapisy stanu synchronizacji po blokadzie').toEqual([]);
    expect(zadaniaOd(k.chmura, zadanie.nr + 1), 'po odpowiedzi żadnych żądań').toEqual([]);
    expect(przed.stan.registered, 'rejestracja slotu A na urządzeniu jak przed pobraniem').toBe(!!stan);
    expect(bledy, 'nasłuch błędów: SESSION_CHANGED bez sesji, nie błąd pobrania').toEqual([{ kod: 'SESSION_CHANGED', sesja: null }]);
  });
});

describe('P-SESJA-ZAPISU: kontrole pobrania w jednej sesji (C4–C8 bez zmiany konta)', () => {
  it.each([
    ['C4', null, 'merged'],
    ['C4', ZAREJESTROWANY_INNY_ETAG, 'merged'],
    ['C5', ZAREJESTROWANY_AKTUALNY, 'up-to-date'],
  ])('K-%s: stan slotu %j — wynik „%s”, pobieranie delt slotu po pobraniu', async (_id, stan, akcja) => {
    const k = await przygotujZNakladka({ stan, kartaLokalnie: akcja === 'up-to-date' });
    const { d, chmura, sync, slotA, etagA } = k;
    const r = await wynik(sync.syncPull());
    await poDrenazuSlotu(chmura, slotA);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe(akcja);
    expect(d.sesja()).toBe('A');
    expect(zadaniaDelt(chmura, slotA).length, 'pobieranie delt slotu A').toBe(1);
    expect(sync._loadSyncState(slotA)).toMatchObject({ registered: true, localEtag: etagA });
    expect(await d.kartaTrwala('A', k.pid)).toMatchObject({ jest: true });
  });

  it.each([[304, 'up-to-date'], [404, 'no-remote-blob']])('K-C6: GET /blob odpowiada %s w tej samej sesji — wynik „%s”, pobieranie delt slotu', async (status, akcja) => {
    const k = await przygotujZNakladka({ stan: ZAREJESTROWANY_INNY_ETAG });
    const { chmura, sync, nakladka, slotA } = k;
    nakladka.blob = status;
    const r = await wynik(sync.syncPull());
    await poDrenazuSlotu(chmura, slotA);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe(akcja);
    expect(zadaniaDelt(chmura, slotA).length).toBe(1);
  });

  it('K-C7: treść bloba podawana po otwarciu bramy w tej samej sesji — „merged”, karta w A', async () => {
    const k = await przygotujZNakladka({ stan: ZAREJESTROWANY_INNY_ETAG });
    const { d, sync, nakladka, pid } = k;
    let otworz;
    nakladka.blob = 'brama';
    nakladka.brama = new Promise((r) => { otworz = r; });
    const czytanie = new Promise((r) => { nakladka.czytanie = r; });
    const pobranie = wynik(sync.syncPull());
    await czytanie;
    otworz();
    const r = await pobranie;
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe('merged');
    expect((await d.v.listPatients()).map((x) => x.patientId)).toEqual([pid]);
  });

  it.each(BLEDY_POBRANIA)('K-C10: %s w tej samej sesji — błąd jak dotąd', async (_opis, stan, sciezka, status, oczek) => {
    const k = await przygotujZNakladka({ stan });
    const { d, sync, slotA } = k;
    const { r, bledy } = await pobranieZBledem(k, sciezka, status, null);
    expect(d.sesja()).toBe('A');
    if (oczek === 'not-registered') {
      expect(r.ok, r.komunikat).toBe(true);
      expect(r.w).toMatchObject({ action: 'not-registered', httpStatus: 500 });
      expect(bledy).toEqual([]);
      return;
    }
    expect(r.ok).toBe(false);
    expect(r.kod, r.komunikat).not.toBe('SESSION_CHANGED');
    if (oczek) expect(r.kod).toBe(oczek);
    else expect(r.komunikat).toMatch(/brak sieci|Failed to fetch|sieci/i);
    expect(bledy.map((x) => x.sesja), 'nasłuch błędów w A').toEqual(['A']);
    expect(bledy[0].kod).toBe(r.kod);
    expect(sync._loadSyncState(slotA).registered, '401 zeruje rejestrację slotu jak dotąd').toBe(status !== 401);
  });

  it('K-C8: atrapa sejfu bez zmiany konta — „merged” i pobieranie delt slotu po scaleniu', async () => {
    const a = await atrapaSejfuSynchronizacji({ zmienKontoWScalaniu: false });
    const r = await wynik(a.sync.syncPull());
    await a.poDrenazu();
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe('merged');
    expect(a.scalenia).toEqual(['U-A']);
    expect(zadaniaDelt(a.chmura, a.slot).length).toBe(1);
  });
});

/* Slot A aktualny (karta k1 lokalnie, ETag zgodny), a w dzienniku zmian slotu A delta karty k2 (seq 7), której A
   lokalnie nie ma — pobranie kończy się „up-to-date” i rusza pobieranie delt slotu A. Wywołania applyEncryptedDelta
   zapisywane z sesją; zastosowane(n) — czeka na n-te wywołanie, na wyniki wszystkich i na koniec partii (kursor). */
async function zDeltaSlotu() {
  const k = await przygotujZNakladka({ kartaLokalnie: true, stan: ZAREJESTROWANY_AKTUALNY });
  const { d, nakladka } = k;
  const k2 = await d.v.savePatient(naglowek(2), { dedup: false });
  nakladka.zmiany = { seq: 7, payload: await d.v.buildPatientDelta(k2.patientId) };
  await d.baza.removePatientForUser(d.A.userId, k2.patientId);
  expect((await d.baza.listPatientsForUser(d.A.userId)).map((x) => x.patientId), 'karta k2 tylko w delcie').not.toContain(k2.patientId);
  const delty = [];
  const czekajacy = [];
  const zastosuj = d.v.applyEncryptedDelta;
  d.v.applyEncryptedDelta = function (x) {
    const w = { sesja: d.sesja(), p: Promise.resolve(zastosuj.call(this, x)) };
    delty.push(w);
    for (const c of czekajacy.splice(0)) if (delty.length >= c.n) c.r(); else czekajacy.push(c);
    return w.p;
  };
  const zastosowane = async (n) => {
    if (delty.length < n) await new Promise((r) => { czekajacy.push({ n, r }); });
    await Promise.allSettled(delty.map((x) => x.p));
    await kolejnaTura();
  };
  return { ...k, k2: k2.patientId, delty, zastosowane };
}
const kursorSlotu = (d, slot) => d.win.localStorage.getItem(`vilda-sync-cursor-v1:${slot}`);

describe('P-SESJA-ZAPISU: pobieranie delt slotu przerwane zalogowaniem innego konta', () => {
  it('C9: zalogowanie B w czasie żądania /changes slotu A — delta nie stosowana, kursor slotu A bez zmian; po powrocie do A delta trafia do A', async () => {
    const k = await zDeltaSlotu();
    const { d, chmura, sync, nakladka, slotA, k2 } = k;
    const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/changes', slot: slotA });
    const r = await wynik(sync.syncPull());
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.action).toBe('up-to-date');
    await brama.osiagnieta;

    const z = await d.przelacz('B');
    const przed = stanSlotu(d, sync, slotA);
    brama.zwolnij();
    await nakladka.poZmianach(1);
    await kolejnaTura();

    expect(nakladka.zadaniaZmian, 'żądanie /changes slotu A wysłane w sesji A').toEqual([{ since: 0, sesja: 'A' }]);
    expect(k.delty.map((x) => x.sesja), 'po zalogowaniu B delta slotu A nie jest stosowana').toEqual([]);
    expect(stanSlotu(d, sync, slotA), 'kursor i stan slotu A bez zmian').toEqual(przed);
    expect(przed.kursor, 'kursor slotu A przed pobraniem delt').toBe(null);
    expect(zapisySynchronizacji(d, z), 'zapisy stanu synchronizacji po zalogowaniu B').toEqual([]);
    expect(d.po(z).zapisy, 'zapisy magazynu po zalogowaniu B').toEqual([]);
    expect(await d.kartaTrwala('B', k2), 'karta k2 nie trafia do B').toEqual({ jest: false, wersje: 0 });

    await d.zaloguj('A');
    const r2 = await wynik(sync.syncPull());
    expect(r2.ok, r2.komunikat).toBe(true);
    await nakladka.poZmianach(2);
    await k.zastosowane(1);
    expect(nakladka.zadaniaZmian[1], 'po powrocie do A delty od tego samego kursora').toEqual({ since: 0, sesja: 'A' });
    expect(k.delty.map((x) => x.sesja), 'delta zastosowana w A').toEqual(['A']);
    expect((await d.baza.listPatientsForUser(d.A.userId)).map((x) => x.patientId), 'karta k2 w A').toContain(k2);
    expect(kursorSlotu(d, slotA), 'kursor slotu A przesunięty po zastosowaniu').toBe('7');
    expect(await d.kartaTrwala('B', k2)).toEqual({ jest: false, wersje: 0 });
  });

  it('K-C9: pobieranie delt slotu A bez zmiany konta — delta zastosowana w A, kursor przesunięty', async () => {
    const k = await zDeltaSlotu();
    const { d, chmura, sync, nakladka, slotA, k2 } = k;
    const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/changes', slot: slotA });
    const r = await wynik(sync.syncPull());
    expect(r.ok, r.komunikat).toBe(true);
    await brama.osiagnieta;
    brama.zwolnij();
    await nakladka.poZmianach(1);
    await k.zastosowane(1);
    expect(k.delty.map((x) => x.sesja)).toEqual(['A']);
    expect((await d.baza.listPatientsForUser(d.A.userId)).map((x) => x.patientId)).toContain(k2);
    expect(kursorSlotu(d, slotA)).toBe('7');
  });
});

// Czeka, aż pobieranie delt slotu (po pobraniu, bez czekania na nie) dotrze do atrapy serwera.
function poDrenazuSlotu(chmura, slot) {
  if (zadaniaDelt(chmura, slot).length) return kolejnaTura();
  const brama = chmura.wstrzymaj((w) => w.slot === slot && (w.sciezka === '/changes' || w.sciezka === '/deltas'));
  return brama.osiagnieta.then(() => { brama.zwolnij(); return kolejnaTura(); });
}

/* Atrapa sejfu z getCurrentUser i applyEncryptedDelta dla prawdziwego vilda_sync.js (C8): slot z jednym ładunkiem;
   mergeSyncPayload zapisuje konto, w którym scala, i — gdy `zmienKontoWScalaniu` — kończy scalanie już w koncie 'U-B'.
   poDrenazu() czeka, aż ewentualne pobieranie delt po scaleniu dotrze do atrapy serwera, albo — bez niego — na koniec
   pobrania (kolejna tura). */
async function atrapaSejfuSynchronizacji({ zmienKontoWScalaniu }) {
  const chmura = atrapaChmury();
  vi.stubGlobal('fetch', chmura.fetch);
  const slot = 'fikcyjny-slot-atrapy-konta';
  const klucz = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const jawne = new TextEncoder().encode(JSON.stringify({ patients: [{ patientId: 'FIKCYJNY-2' }] }));
  const szyfr = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, jawne));
  const body = new Uint8Array(12 + szyfr.length);
  body.set(iv, 0); body.set(szyfr, 12);
  chmura.sloty.set(slot, { body, etag: 'S-1' });
  let konto = 'U-A';
  const scalenia = [];
  const sejf = {
    isUnlocked: () => true,
    isCloudOnlyMode: () => false,
    getCurrentUser: () => ({ userId: konto }),
    getSyncMaterial: async () => ({ slotId: slot, authToken: 'TOK-FIKCYJNY', authTokenHash: 'HASH-FIKCYJNY', syncEncKey: klucz }),
    exportSyncPayload: async () => ({ patients: [] }),
    listPatients: async () => [{ patientId: 'FIKCYJNY-2' }],
    mergeSyncPayload: async () => { scalenia.push(konto); if (zmienKontoWScalaniu) konto = 'U-B'; return {}; },
    applyEncryptedDelta: async () => null,
  };
  const win = {
    localStorage: magazynPrzegladarki(), sessionStorage: magazynPrzegladarki(),
    document: { dispatchEvent() { return true; } }, VildaVault: sejf, VILDA_SYNC_WORKER_URL: ADRES_CHMURY,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  const poDrenazu = () => (zmienKontoWScalaniu ? kolejnaTura() : poDrenazuSlotu(chmura, slot));
  return { chmura, sync: win.VildaSync, slot, scalenia, poDrenazu };
}

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });

// ── Integracja: pobranie przerwane zmianą sesji nie zgłasza błędu w nowej sesji ───────────────────────────────────────
const OSTATNI_BLAD = 'vilda-sync-last-error-v1';
const PRZERWANE = 'VildaSync: pobieranie przerwane — w trakcie zablokowano sejf albo przełączono konto. Nic nie scalono.';
const bladSynchronizacji = (kod, komunikat) => Object.assign(new Error(komunikat), { code: kod });

/* Maszyna stanu ekranu ładowania trybu chmurowego z prawdziwego vilda_chrome.js (po kotwicach): stan T i P, lt() —
   stan, H() — isCloudOnlySyncInProgress, ut() — waitForCloudOnlySync, oraz trzy nasłuchy vilda:cloud-only-sync-*
   (pulling, complete, failed) na własnym EventTarget; nakładka i baner to atrapy bez skutku. */
function maszynaTrybuChmurowego() {
  const src = zrodlo('vilda_chrome.js');
  const a = src.indexOf('var T="idle",P=null;');
  const b = src.indexOf('function ft(){', a);
  const l0 = src.indexOf('o.addEventListener("vilda:cloud-only-sync-pulling"');
  const koniec = 'o.addEventListener("vilda:cloud-only-sync-failed",function(l){T="failed",P=l&&l.detail||{},t.style.display==="flex"?s(P):c(P),E()})';
  const l1 = src.indexOf(koniec, l0);
  if (a < 0 || b < 0 || l0 < 0 || l1 < 0) throw new Error('vilda_chrome.js: nie znaleziono maszyny stanu trybu chmurowego');
  const o = new EventTarget();
  const nic = () => {};
  const api = new Function('o', 'u', 'i', 'E', 's', 'c', 't', `${src.slice(a, b)};${src.slice(l0, l1 + koniec.length)};return { lt, H, ut };`)(
    o, nic, nic, nic, nic, nic, { style: { display: 'none' } });
  return { o, ...api };
}

/* Urządzenie z prawdziwym vilda_sync_integration.js: dokument zapisuje zdarzenia (typ, szczegóły, sesja) i przekazuje
   zdarzenia trybu chmurowego do maszyny stanu z vilda_chrome.js (d.integracja.chrome), dziennik dostępu
   (VildaAuditLog) — wpisy z sesją. `atrapaSync` — VildaSync testu (bez sieci); bez niej integracja korzysta
   z prawdziwego vilda_sync.js załadowanego przez `przed(d)`. `wlaczona` — synchronizacja włączona w Ustawieniach;
   `chmura` / `chmuraB` — konto A / B w trybie chmurowym. */
async function urzadzenieZIntegracja({ chmura = false, chmuraB = false, atrapaSync = null, wlaczona = false, przed = null } = {}) {
  const zdarzenia = [];
  const dziennik = [];
  let d = null;
  const chrome = maszynaTrybuChmurowego();
  const dokument = {
    hidden: false, readyState: 'complete', addEventListener() {}, removeEventListener() {},
    dispatchEvent(e) {
      zdarzenia.push({ typ: e.type, detail: e.detail || null, sesja: d ? d.sesja() : null });
      if (/^vilda:cloud-only-sync-/.test(e.type)) chrome.o.dispatchEvent(new CustomEvent(e.type, { detail: e.detail }));
      return true;
    },
  };
  const VildaAuditLog = { log(typ, dane) { dziennik.push({ typ, dane, sesja: d ? d.sesja() : null }); } };
  d = await urzadzenie({ chmura, chmuraB, dokument, dodatki: { VildaAuditLog, ...(atrapaSync ? { VildaSync: atrapaSync } : {}) } });
  const ctx = przed ? await przed(d) : {};
  if (wlaczona) d.win.localStorage.setItem('vilda-sync-enabled-v1', 'true');
  loadBrowserScript('vilda_sync_integration.js', d.win);
  d.integracja = {
    zdarzenia, dziennik, chrome,
    trybChmurowy: (nr = 0) => zdarzenia.slice(nr).filter((x) => /^vilda:cloud-only-sync-/.test(x.typ)).map((x) => ({ typ: x.typ.slice('vilda:cloud-only-sync-'.length), detail: x.detail, sesja: x.sesja })),
    od: (nr = 0) => zdarzenia.slice(nr),
    bledy: () => d.win.localStorage.klucze().filter((x) => x.startsWith(OSTATNI_BLAD)),
    stanyBledu: (nr = 0) => zdarzenia.slice(nr).filter((x) => x.typ === 'vilda:sync-status-changed' && x.detail && x.detail.state === 'error'),
    nieudane: (nr = 0) => zdarzenia.slice(nr).filter((x) => x.typ === 'vilda:cloud-only-sync-failed'),
  };
  return { d, ...ctx };
}

// Atrapa VildaSync: pobrania rozstrzyga test, nasłuchy błędów zapisane.
function atrapaVildaSync() {
  const a = { pobrania: [], nasluchyBledu: [], czekajacy: [] };
  const pusto = () => Promise.resolve({});
  a.api = {
    syncPull: () => new Promise((res, rej) => { a.pobrania.push({ res, rej }); for (const c of a.czekajacy.splice(0)) c(); }),
    syncFull: pusto, syncPush: pusto,
    onSyncError(f) { a.nasluchyBledu.push(f); }, onSyncStart() {}, onSyncComplete() {},
  };
  a.pobranie = (n = 0) => (a.pobrania.length > n ? Promise.resolve(a.pobrania[n]) : new Promise((r) => {
    const sprawdz = () => { if (a.pobrania.length > n) r(a.pobrania[n]); else a.czekajacy.push(sprawdz); };
    a.czekajacy.push(sprawdz);
  }));
  return a;
}

// Stan obietnicy bez czekania na nią.
function sledz(obietnica) {
  const st = { rozstrzygnieta: false, wartosc: undefined, blad: undefined };
  obietnica.then((w) => { st.rozstrzygnieta = true; st.wartosc = w; }, (e) => { st.rozstrzygnieta = true; st.blad = e; });
  return st;
}

/* Integracja z prawdziwym vilda_sync.js: slot A zarejestrowany z innym ETagiem; odpowiedź GET /status slotu A zamieniana
   na pustą z danym kodem albo na błąd sieci (po bramie atrapy serwera). */
async function integracjaZBledemStatusu() {
  return urzadzenieZIntegracja({
    przed: async (u) => {
      const ch = atrapaChmury();
      const nak = { slot: null, zamiana: null };
      const fetch = async (url, init) => {
        const odp = await ch.fetch(url, init);
        const uu = new URL(String(url));
        if (nak.zamiana && nak.slot && uu.pathname.endsWith(`/slots/${nak.slot}${nak.zamiana.sciezka}`)) {
          if (nak.zamiana.status === 'siec') throw new TypeError('atrapa: brak sieci');
          return new Response('{}', { status: nak.zamiana.status, headers: { 'content-type': 'application/json' } });
        }
        return odp;
      };
      const s = zaladujSync(u, { fetch });
      await u.v.savePatient(naglowek(1), { dedup: false });
      const { slotId } = await ch.wgrajKonto(u, { etag: 'A-1' });
      nak.slot = slotId;
      s._saveSyncState(slotId, { ...s._loadSyncState(slotId), ...ZAREJESTROWANY_INNY_ETAG });
      return { chmura: ch, sync: s, slotA: slotId, nakladka: nak };
    },
  });
}

describe('P-SESJA-ZAPISU: integracja — pobranie przerwane zmianą sesji nie zgłasza błędu w nowej sesji', () => {
  it('I1: syncPull konta A przerwany zalogowaniem B — bez wpisu ostatniego błędu, dziennika sync.error i stanu „błąd”', async () => {
    const { d, chmura, sync, slotA } = await urzadzenieZIntegracja({
      przed: async (u) => {
        const ch = atrapaChmury();
        const s = zaladujSync(u, { fetch: ch.fetch });
        const karta = await u.v.savePatient(naglowek(1), { dedup: false });
        const { slotId } = await ch.wgrajKonto(u, { etag: 'A-1' });
        await u.baza.removePatientForUser(u.A.userId, karta.patientId);
        return { chmura: ch, sync: s, slotA: slotId };
      },
    });
    const nr = d.integracja.zdarzenia.length;
    const { r } = await pobranieZPrzytrzymanymBlobem({ d, chmura, sync, slotA }, 'syncPull', () => d.przelacz('B'));
    await kolejnaTura();

    expect({ ok: r.ok, kod: r.kod }, `pobranie: ${r.ok ? r.w && r.w.action : r.komunikat}`).toEqual({ ok: false, kod: 'SESSION_CHANGED' });
    expect(d.integracja.bledy(), 'bez wpisu ostatniego błędu synchronizacji').toEqual([]);
    expect(d.integracja.dziennik.filter((x) => x.typ === 'sync.error'), 'bez wpisu sync.error w dzienniku').toEqual([]);
    expect(d.integracja.stanyBledu(nr), 'bez stanu „błąd” wskaźnika synchronizacji').toEqual([]);
  });

  it.each([[500], ['siec']])('I6: /status konta A (%s) po zalogowaniu B — bez wpisu ostatniego błędu, dziennika sync.error i stanu „błąd” w B', async (status) => {
    const { d, chmura, sync, slotA, nakladka } = await integracjaZBledemStatusu();
    nakladka.zamiana = { sciezka: '/status', status };
    const nr = d.integracja.zdarzenia.length;
    const brama = chmura.wstrzymaj({ metoda: 'GET', sciezka: '/status', slot: slotA });
    const pobranie = wynik(sync.syncPull());
    await brama.osiagnieta;
    await d.przelacz('B');
    brama.zwolnij();
    const r = await pobranie;
    await kolejnaTura();

    expect({ ok: r.ok, kod: r.kod }, `pobranie: ${r.ok ? r.w && r.w.action : r.komunikat}`).toEqual({ ok: false, kod: 'SESSION_CHANGED' });
    expect(d.integracja.bledy(), 'bez wpisu ostatniego błędu synchronizacji').toEqual([]);
    expect(d.integracja.dziennik.filter((x) => x.typ === 'sync.error'), 'bez wpisu sync.error w dzienniku').toEqual([]);
    expect(d.integracja.stanyBledu(nr), 'bez stanu „błąd” wskaźnika synchronizacji').toEqual([]);
  });

  it('I2: tryb chmurowy — start (pobranie konta A) kończy się SESSION_CHANGED po zalogowaniu B: bez „failed” i stanu „błąd”', async () => {
    const a = atrapaVildaSync();
    const { d } = await urzadzenieZIntegracja({ chmura: true, atrapaSync: a.api, wlaczona: true });
    const pobranie = await a.pobranie();
    expect(d.integracja.zdarzenia.some((x) => x.typ === 'vilda:cloud-only-sync-pulling' && x.sesja === 'A'), 'start trybu chmurowego w sesji A').toBe(true);
    const nr = d.integracja.zdarzenia.length;
    await d.przelacz('B');
    pobranie.rej(bladSynchronizacji('SESSION_CHANGED', PRZERWANE));
    await kolejnaTura();

    expect(d.integracja.nieudane(nr), 'bez vilda:cloud-only-sync-failed').toEqual([]);
    expect(d.integracja.stanyBledu(nr), 'bez stanu „błąd” wskaźnika synchronizacji').toEqual([]);
    expect(d.integracja.bledy()).toEqual([]);
  });

  it('I3: nasłuch błędów synchronizacji dostaje SESSION_CHANGED w sesji B — bez wpisu ostatniego błędu i dziennika w B, bez stanu „błąd”', async () => {
    const a = atrapaVildaSync();
    const { d } = await urzadzenieZIntegracja({ atrapaSync: a.api });
    expect(a.nasluchyBledu, 'integracja słucha błędów synchronizacji').toHaveLength(1);
    await d.zaloguj('B');
    const nr = d.integracja.zdarzenia.length;
    a.nasluchyBledu[0]({ operation: 'pull', error: bladSynchronizacji('SESSION_CHANGED', PRZERWANE) });
    await kolejnaTura();

    expect(d.integracja.bledy(), 'bez wpisu ostatniego błędu w żadnym koncie').toEqual([]);
    expect(d.integracja.dziennik.filter((x) => x.typ === 'sync.error'), 'bez wpisu sync.error').toEqual([]);
    expect(d.integracja.stanyBledu(nr), 'bez stanu „błąd”').toEqual([]);
  });
  it.each([
    ['zalogowanie B (konto lokalne)', async (d) => { await d.przelacz('B'); }, null],
    ['sama blokada, potem zalogowanie B (konto lokalne)', async (d) => { await d.przelacz('blokada'); }, async (d) => { await d.zaloguj('B'); }],
  ])('I4: tryb chmurowy — start A przerwany SESSION_CHANGED, %s: ekran ładowania kończy się neutralnym „complete”, waitForCloudOnlySync rozstrzygnięte', async (_opis, zmien, potem) => {
    const a = atrapaVildaSync();
    const { d } = await urzadzenieZIntegracja({ chmura: true, atrapaSync: a.api, wlaczona: true });
    const { chrome } = d.integracja;
    const pobranie = await a.pobranie();
    expect(chrome.lt(), 'start trybu chmurowego A: „pulling”').toBe('pulling');
    const nr = d.integracja.zdarzenia.length;
    await zmien(d);
    pobranie.rej(bladSynchronizacji('SESSION_CHANGED', PRZERWANE));
    await kolejnaTura();
    if (potem) { await potem(d); await kolejnaTura(); }
    expect(d.sesja()).toBe('B');
    expect(d.v.isCloudOnlyMode(), 'konto B lokalne').toBe(false);

    expect(d.integracja.trybChmurowy(nr).map((x) => [x.typ, x.detail]), 'zdarzenia trybu chmurowego po przerwaniu').toEqual([['complete', { przerwane: true }]]);
    expect({ stan: chrome.lt(), H: chrome.H() }, 'ekran ładowania trybu chmurowego nie zostaje w „pulling”').toEqual({ stan: 'complete', H: false });
    const czekanie = sledz(chrome.ut());
    await kolejnaTura();
    expect(czekanie, 'waitForCloudOnlySync rozstrzygnięte bez błędu').toEqual({ rozstrzygnieta: true, wartosc: 'complete', blad: undefined });
    expect(d.integracja.nieudane(nr), 'bez vilda:cloud-only-sync-failed').toEqual([]);
    expect(d.integracja.stanyBledu(nr), 'bez stanu „błąd”').toEqual([]);
    expect(d.integracja.bledy()).toEqual([]);
  });

  it('I5: tryb chmurowy — start A przerwany SESSION_CHANGED, B też w trybie chmurowym: stan „pulling” do końca startu B, potem „complete”', async () => {
    const a = atrapaVildaSync();
    const { d } = await urzadzenieZIntegracja({ chmura: true, chmuraB: true, atrapaSync: a.api, wlaczona: true });
    const { chrome } = d.integracja;
    const pobranieA = await a.pobranie(0);
    await d.przelacz('B');
    const pobranieB = await a.pobranie(1);
    const nr = d.integracja.zdarzenia.length;
    pobranieA.rej(bladSynchronizacji('SESSION_CHANGED', PRZERWANE));
    await kolejnaTura();
    expect(d.integracja.trybChmurowy(nr), 'przerwanie startu A nie kończy stanu startu B').toEqual([]);
    expect({ stan: chrome.lt(), H: chrome.H() }, 'start B w toku').toEqual({ stan: 'pulling', H: true });

    pobranieB.res({ action: 'merged' });
    await kolejnaTura();
    expect(d.integracja.trybChmurowy(nr).map((x) => [x.typ, x.detail, x.sesja]), 'start B kończy stan').toEqual([['complete', null, 'B']]);
    expect({ stan: chrome.lt(), H: chrome.H() }).toEqual({ stan: 'complete', H: false });
    expect(d.integracja.nieudane(), 'bez vilda:cloud-only-sync-failed').toEqual([]);
  });
});

describe('P-SESJA-ZAPISU: integracja — inne błędy synchronizacji jak dotąd', () => {
  it('K-I2: tryb chmurowy — start kończy się innym błędem (DOWNLOAD_FAILED) w tej samej sesji: „failed” i stan „błąd”', async () => {
    const a = atrapaVildaSync();
    const { d } = await urzadzenieZIntegracja({ chmura: true, atrapaSync: a.api, wlaczona: true });
    const pobranie = await a.pobranie();
    const nr = d.integracja.zdarzenia.length;
    pobranie.rej(bladSynchronizacji('DOWNLOAD_FAILED', 'VildaSync: błąd pobierania danych (500).'));
    await kolejnaTura();

    expect(d.integracja.nieudane(nr).map((x) => x.detail && x.detail.code), 'vilda:cloud-only-sync-failed').toEqual(['CLOUD_ONLY_PULL_FAILED']);
    expect(d.integracja.stanyBledu(nr)).toHaveLength(1);
  });

  it('K-I6: /status 500 w tej samej sesji — wpis ostatniego błędu i sync.error w A, stan „błąd”', async () => {
    const { d, sync, nakladka } = await integracjaZBledemStatusu();
    nakladka.zamiana = { sciezka: '/status', status: 500 };
    const nr = d.integracja.zdarzenia.length;
    const r = await wynik(sync.syncPull());
    await kolejnaTura();

    expect(r.kod).toBe('STATUS_FAILED');
    expect(d.integracja.bledy(), 'wpis ostatniego błędu konta A').toEqual([`${OSTATNI_BLAD}:${d.A.userId}`]);
    expect(d.integracja.dziennik.filter((x) => x.typ === 'sync.error').map((x) => [x.sesja, x.dane.code])).toEqual([['A', 'STATUS_FAILED']]);
    expect(d.integracja.stanyBledu(nr).map((x) => x.detail.code)).toEqual(['STATUS_FAILED']);
  });

  it('K-I3: nasłuch błędów dostaje DOWNLOAD_FAILED — wpis ostatniego błędu i sync.error w bieżącym koncie, stan „błąd”', async () => {
    const a = atrapaVildaSync();
    const { d } = await urzadzenieZIntegracja({ atrapaSync: a.api });
    const nr = d.integracja.zdarzenia.length;
    a.nasluchyBledu[0]({ operation: 'pull', error: bladSynchronizacji('DOWNLOAD_FAILED', 'VildaSync: błąd pobierania danych (500).') });
    await kolejnaTura();

    expect(d.integracja.bledy(), 'wpis ostatniego błędu konta A').toEqual([`${OSTATNI_BLAD}:${d.A.userId}`]);
    expect(d.integracja.dziennik.filter((x) => x.typ === 'sync.error').map((x) => [x.sesja, x.dane.code])).toEqual([['A', 'DOWNLOAD_FAILED']]);
    expect(d.integracja.stanyBledu(nr).map((x) => x.detail.code)).toEqual(['DOWNLOAD_FAILED']);
  });
});
