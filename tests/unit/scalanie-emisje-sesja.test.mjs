// P-SESJA-ZAPISU — powiadomienia scalania z chmury (mergeSyncPayload) tylko w sesji, w której scalanie ruszyło.
//
// Pilnuje powiadomień wysyłanych na końcu sekcji scalania: o notatkach pacjenta (onPatientNoteChanged z ping
// localStorage 'vilda-note-changed-ping-v1' dla innych kart), o listach pacjentów (onPatientListChanged) i o zmianie
// hasła na innym urządzeniu (onCredentialChanged 'password-changed-remotely' oraz
// VildaPersistence.writePreferenceRaw('PASSWORD_CHANGED_REMOTELY_AT')). Sesja to konto i klucz z chwili wejścia do
// scalania; ponowne zalogowanie tego samego konta to inna sesja. Gdy w trakcie scalania sejf zostanie zablokowany albo
// zaloguje się inne konto, scalanie kończy się SESSION_CHANGED, a po zmianie sesji nie ma powiadomień, pingu ani
// wysyłki delt notatek przez prawdziwy vilda_sync_integration.js (atrapa navigator.sendBeacon i fetch) — także gdy
// konto po zmianie sesji ma notatki o tych samych identyfikatorach. W jednej sesji powiadomienia i echa delt bez zmian.
//
// Prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js (w B1 i B4-notatki także vilda_sync_integration.js)
// na wspólnej uprzęży ./sesja-zapisu-uprzaz.mjs: konto A zalogowane i konto B zablokowane na jednym magazynie
// w pamięci z rejestrem wywołań, atrapa Web Locks (blokady notatek trzymane przez test jak przez inną kartę
// przeglądarki), haki magazynu przełączające sesję zaraz po wskazanym zapisie. Ładunek scalania pochodzi z osobnego
// okna i konta („inne urządzenie”). Czekanie wyłącznie na zdarzenia i obietnice (kolejka blokady, hak, obietnice
// wysyłki integracji). Dane wyłącznie FIKCYJNE („Testowy Jan”).
//
// Przypadki:
//   B1        ładunek z dwiema notatkami pacjenta; pierwsza zapisana, druga czeka na blokadę vilda-note-<id>; w tym
//             czasie zalogowanie B, sama blokada sejfu albo ponowne zalogowanie A; potem blokada notatki zwolniona.
//             SESSION_CHANGED, po zmianie sesji brak powiadomień i pingu, integracja nie wysyła delty notatki.
//   B1-kol    jak B1 z zalogowaniem B, gdy konto B ma własne notatki o tych samych identyfikatorach.
//   B2        ładunek z dwiema listami; zalogowanie B zaraz po drugim zapisie listy w A — brak onPatientListChanged
//             po zmianie sesji.
//   B3        ładunek z nowszym hasłem konta A; zalogowanie B zaraz po zapisie metadanych konta A — brak
//             onCredentialChanged 'password-changed-remotely' i brak writePreferenceRaw('PASSWORD_CHANGED_REMOTELY_AT')
//             po zmianie sesji.
//   B4        kontrole w jednej sesji (te same ładunki, bez przełączenia): dwa powiadomienia {action:'merge'} o
//             notatkach w A, dwa echa delt notatek do slotu konta A (odszyfrowane kluczem A), ping; jedno
//             powiadomienie {action:'merge'} o listach w A; zmiana hasła — powiadomienie i preferencja w A.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b): B1 (każdy wariant), B1-kol, B2, B3.
// Zielone na audycie sprzed zmiany: B4.
import { afterEach, describe, expect, it } from 'vitest';
import { ADRES_CHMURY, SKRYPTY_SEJFU, naglowek, okno, sprzatnij, urzadzenie, wynik } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const PING = 'vilda-note-changed-ping-v1';
const PREF_HASLA = 'PASSWORD_CHANGED_REMOTELY_AT';
const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const kopia = (x) => JSON.parse(JSON.stringify(x));
const blokadaNotatki = (id) => `vilda-note-${id}`;
const opisZdarzenia = (e) => `${e.typ}(${e.dane && e.dane.action}) w sesji ${e.sesja}`;

// Ładunek „innego urządzenia” (osobne okno i konto, bez danych logowania): karta z notatkami pacjenta i listy.
async function ladunekZInnegoUrzadzenia({ notatki = 0, listy = 0 } = {}) {
  const o = okno({ krypto: false });
  const z = o.win.VildaVault;
  z.setStorageAdapter(z.createInMemoryAdapter());
  await z.createUser('Inne#Urzadzenie!2026cc', { label: 'Inne urządzenie (fikcyjne)', iterations: 1000 });
  if (notatki) {
    const p = await z.savePatient(naglowek(2), { dedup: false });
    for (let i = 1; i <= notatki; i += 1) {
      await z.savePatientNote({ patientId: p.patientId, title: `Notatka ${i} (fikcyjna)`, body: `Treść fikcyjna nr ${i}`, category: 'wynik-badania' });
    }
  }
  for (let i = 1; i <= listy; i += 1) await z.savePatientList({ name: `Lista testowa ${i}`, memberIds: [] });
  const ladunek = await z.exportSyncPayload();
  delete ladunek.credential;
  delete ladunek.passkeys;
  z.lock('manual');
  o.timery.wyczysc();
  return ladunek;
}

// Własny ładunek konta A z nowszym hasłem (inna sól, późniejsza chwila zmiany) — „zmiana hasła na innym urządzeniu”.
async function ladunekZNowszymHaslem(d) {
  const ladunek = await d.v.exportSyncPayload();
  const chwila = new Date(Date.now() + 60_000).toISOString();
  ladunek.credential = { ...ladunek.credential, updatedAtISO: chwila, passwordSalt: 'SW5uZVVyemFkemVuaWUhIQ==' };
  return { ladunek, chwila };
}

// Urządzenie z atrapą VildaPersistence: rejestr writePreferenceRaw z sesją w chwili wywołania.
async function urzadzenieZPreferencjami() {
  const preferencje = [];
  let d = null;
  const VildaPersistence = {
    writePreferenceRaw(klucz, wartosc, opcje) {
      preferencje.push({ klucz, wartosc, opcje, sesja: d ? d.sesja() : null, nrSesji: d ? d.nrSesji() : 0 });
    },
  };
  d = await urzadzenie({ dodatki: { VildaPersistence } });
  d.preferencje = preferencje;
  return d;
}

// Urządzenie z prawdziwym vilda_sync_integration.js: atrapa navigator.sendBeacon i fetch okna (rejestr wysyłek z sesją
// w chwili wysyłki), atrapa VildaSync (bez sieci). Synchronizacja włączona po przygotowaniu kont. Integracja buduje
// deltę notatki asynchronicznie (getSyncMaterial → buildNoteDelta → sendBeacon) — obietnice tych wywołań trafiają do
// rejestru `ruch`, a ucichnij() czeka, aż wszystkie się rozstrzygną.
async function urzadzenieZIntegracja({ przygotujB = null } = {}) {
  const slad = { wysylki: [], ruch: [] };
  let d = null;
  const zapisz = (rodzaj, url, body) => slad.wysylki.push({ rodzaj, url: String(url), body, sesja: d ? d.sesja() : null });
  const pusto = () => Promise.resolve({});
  d = await urzadzenie({
    skrypty: [...SKRYPTY_SEJFU, 'vilda_sync_integration.js'],
    navigator: { sendBeacon(url, body) { zapisz('beacon', url, body); return true; } },
    dodatki: {
      Blob,
      VILDA_SYNC_WORKER_URL: ADRES_CHMURY,
      VildaSync: { syncPush: pusto, syncFull: pusto, syncPull: pusto },
      fetch(url, init) { zapisz('fetch', url, init && init.body); return Promise.resolve({ ok: true, status: 204 }); },
    },
  });
  const slot = { A: (await d.v.getSyncMaterial()).slotId };
  await d.zaloguj('B');
  slot.B = (await d.v.getSyncMaterial()).slotId;
  if (przygotujB) await przygotujB(d);
  await d.zaloguj('A');
  d.win.localStorage.setItem('vilda-sync-enabled-v1', 'true');
  for (const metoda of ['getSyncMaterial', 'buildNoteDelta', 'buildNoteTombstoneDelta']) {
    const f = d.v[metoda];
    d.v[metoda] = function (...a) {
      const p = f.apply(this, a);
      slad.ruch.push(Promise.resolve(p).then(() => {}, () => {}));
      return p;
    };
  }
  d.slad = slad;
  d.slot = slot;
  d.ucichnij = async () => {
    for (let n = -1; n !== slad.ruch.length;) {
      n = slad.ruch.length;
      await Promise.all(slad.ruch);
      await kolejnaTura();
    }
  };
  const slotKonta = (url) => (url.includes(`/slots/${slot.A}/`) ? 'A' : url.includes(`/slots/${slot.B}/`) ? 'B' : 'inny');
  d.wysylkiOd = (od) => slad.wysylki.slice(od).map((w) => `${w.rodzaj} do slotu ${slotKonta(w.url)} w sesji ${w.sesja}`);
  return d;
}

// Scalanie ładunku z dwiema notatkami pacjenta: obie blokady vilda-note-<id> trzyma „inna karta”; pierwsza zwolniona,
// gdy scalanie stanie na niej w kolejce, więc pierwsza notatka jest zapisana, a druga czeka w kolejce na swoją blokadę.
async function scalanieNotatekCzeka(d, ladunek) {
  const ids = ladunek.patientNotes.map((n) => n.id);
  expect(ids.length).toBe(2);
  const nazwy = ids.map(blokadaNotatki);
  const inne = [];
  for (const n of nazwy) inne.push(await d.locks.trzymaj(n));
  const od = d.locks.zadania.length;
  const start = d.znacznik();
  const wysylkiOd = d.slad ? d.slad.wysylki.length : 0;
  const scalanie = wynik(d.v.mergeSyncPayload(ladunek));
  const pierwsze = await d.locks.czekajNaZadanie((z) => nazwy.includes(z.nazwa), { od });
  const i = nazwy.indexOf(pierwsze.nazwa);
  await inne[i].zwolnij();
  await d.locks.czekajNaKolejke(nazwy[1 - i]);
  return { pierwsza: ids[i], druga: ids[1 - i], scalanie, start, wysylkiOd, zwolnijDruga: () => inne[1 - i].zwolnij() };
}

// Identyfikatory notatek pacjenta w magazynie trwałym konta (surowy adapter, bez wpisów w rejestrze).
const notatkiKonta = async (d, k) => ((await d.baza.listPatientNotesForUser(d[k].userId)) || []).map((n) => n.id).sort();

function przerwane(r) {
  expect(r.ok, 'scalanie przerwane zmianą sesji nie kończy się powodzeniem').toBe(false);
  expect(r.kod, `scalanie kończy się w sesji, w której ruszyło (komunikat: ${r.komunikat})`).toBe('SESSION_CHANGED');
}

describe('P-SESJA-ZAPISU: powiadomienia scalania tylko w sesji, w której scalanie ruszyło', () => {
  describe('B1: notatki pacjenta — scalanie czeka na blokadę drugiej notatki, w tym czasie zmiana sesji', () => {
    it.each([
      ['B', 'zalogowanie konta B'],
      ['blokada', 'sama blokada sejfu'],
      ['A', 'ponowne zalogowanie konta A'],
    ])('%s (%s): po zmianie sesji brak powiadomień o notatkach, pingu i wysyłki delty', async (wariant) => {
      const d = await urzadzenieZIntegracja();
      const ladunek = await ladunekZInnegoUrzadzenia({ notatki: 2 });
      const s = await scalanieNotatekCzeka(d, ladunek);
      expect(await notatkiKonta(d, 'A'), 'pierwsza notatka zapisana w A przed zmianą sesji').toEqual([s.pierwsza]);
      const pingPrzed = d.win.localStorage.getItem(PING);
      const z = await d.przelacz(wariant);
      await s.zwolnijDruga();
      const r = await s.scalanie;
      await d.ucichnij();
      przerwane(r);
      const po = d.po(z);
      expect(po.zdarzenia.filter((e) => e.typ === 'patientNoteChanged').map(opisZdarzenia), 'po zmianie sesji brak powiadomień o notatkach pacjenta').toEqual([]);
      expect(po.zdarzenia.map(opisZdarzenia), 'po zmianie sesji brak powiadomień').toEqual([]);
      expect(po.dziennik.filter((x) => x.klucz === PING).map((x) => `${x.op} w sesji ${x.sesja}`), 'po zmianie sesji brak pingu notatek dla innych kart').toEqual([]);
      expect(d.win.localStorage.getItem(PING), 'ping notatek bez zmian').toBe(pingPrzed);
      expect(d.wysylkiOd(s.wysylkiOd), 'scalanie przerwane zmianą sesji nie wysyła delty notatki').toEqual([]);
      expect(po.zapisy, 'po zmianie sesji brak zapisów').toEqual([]);
      expect(await notatkiKonta(d, 'A'), 'druga notatka nie zapisana w A').toEqual([s.pierwsza]);
      expect(await notatkiKonta(d, 'B'), 'w B brak notatek ze scalania').toEqual([]);
    });

    it('B1-kol: zalogowanie B, które ma własne notatki o tych samych identyfikatorach: po zmianie sesji brak powiadomień, pingu i wysyłki delty', async () => {
      const ladunek = await ladunekZInnegoUrzadzenia({ notatki: 2 });
      const ids = ladunek.patientNotes.map((n) => n.id).sort();
      const d = await urzadzenieZIntegracja({
        async przygotujB(u) {
          await u.v.mergeSyncPayload(kopia(ladunek));
          for (const n of ladunek.patientNotes) {
            await u.v.savePatientNote({ id: n.id, patientId: n.patientId, title: `${n.title} w koncie B`, body: 'Treść fikcyjna konta B', category: 'wynik-badania' });
          }
        },
      });
      expect(await notatkiKonta(d, 'B'), 'konto B ma notatki o tych samych identyfikatorach').toEqual(ids);
      const s = await scalanieNotatekCzeka(d, ladunek);
      expect(await notatkiKonta(d, 'A'), 'pierwsza notatka zapisana w A przed zmianą sesji').toEqual([s.pierwsza]);
      const pingPrzed = d.win.localStorage.getItem(PING);
      const z = await d.przelacz('B');
      await s.zwolnijDruga();
      const r = await s.scalanie;
      await d.ucichnij();
      przerwane(r);
      const po = d.po(z);
      expect(po.zdarzenia.map(opisZdarzenia), 'po zmianie sesji brak powiadomień o notatkach pacjenta').toEqual([]);
      expect(po.dziennik.filter((x) => x.klucz === PING).map((x) => `${x.op} w sesji ${x.sesja}`), 'po zmianie sesji brak pingu notatek dla innych kart').toEqual([]);
      expect(d.win.localStorage.getItem(PING), 'ping notatek bez zmian').toBe(pingPrzed);
      expect(d.wysylkiOd(s.wysylkiOd), 'scalanie przerwane zmianą sesji nie wysyła delty notatki').toEqual([]);
      expect(po.zapisy, 'po zmianie sesji brak zapisów').toEqual([]);
      expect(await notatkiKonta(d, 'B'), 'notatki konta B bez zmian').toEqual(ids);
    });
  });

  it('B2: listy — zalogowanie B zaraz po drugim zapisie listy w A: po zmianie sesji brak onPatientListChanged', async () => {
    const d = await urzadzenie();
    const ladunek = await ladunekZInnegoUrzadzenia({ listy: 2 });
    expect(ladunek.patientLists.length).toBe(2);
    const hak = d.przelaczPo({ metoda: 'putPatientListForUser', konto: 'A', ktory: 2 }, 'B');
    const r = await wynik(d.v.mergeSyncPayload(ladunek));
    expect(hak.zrobione, 'zmiana sesji zaraz po drugim zapisie listy').toBe(true);
    const z = await hak.gotowe;
    przerwane(r);
    expect((await d.trwaly('A')).listy, 'obie listy zapisane w A przed zmianą sesji').toBe(2);
    expect((await d.trwaly('B')).listy, 'w B brak list ze scalania').toBe(0);
    const po = d.po(z);
    expect(po.zdarzenia.filter((e) => e.typ === 'patientListChanged').map(opisZdarzenia), 'po zmianie sesji brak powiadomień o listach pacjentów').toEqual([]);
    expect(po.zdarzenia.map(opisZdarzenia), 'po zmianie sesji brak powiadomień').toEqual([]);
    expect(po.zapisy, 'po zmianie sesji brak zapisów').toEqual([]);
  });

  it('B3: zmiana hasła na innym urządzeniu — zalogowanie B zaraz po zapisie metadanych A: po zmianie sesji brak powiadomienia i preferencji', async () => {
    const d = await urzadzenieZPreferencjami();
    const { ladunek, chwila } = await ladunekZNowszymHaslem(d);
    const hak = d.przelaczPo({ metoda: 'putUserMeta', konto: 'A', gdy: (m, a) => !!a[1] && a[1].passwordUpdatedAtISO === chwila }, 'B');
    const r = await wynik(d.v.mergeSyncPayload(ladunek));
    expect(hak.zrobione, 'zmiana sesji zaraz po zapisie nowszego hasła w metadanych A').toBe(true);
    const z = await hak.gotowe;
    przerwane(r);
    expect((await d.baza.getUserMeta(d.A.userId)).passwordUpdatedAtISO, 'nowsze hasło zapisane w A przed zmianą sesji').toBe(chwila);
    const po = d.po(z);
    expect(po.zdarzenia.filter((e) => e.typ === 'credentialChanged').map(opisZdarzenia), "po zmianie sesji brak onCredentialChanged 'password-changed-remotely'").toEqual([]);
    expect(po.zdarzenia.map(opisZdarzenia), 'po zmianie sesji brak powiadomień').toEqual([]);
    expect(d.preferencje.filter((p) => p.nrSesji >= z.nrSesji).map((p) => `${p.klucz} w sesji ${p.sesja}`), `po zmianie sesji brak writePreferenceRaw('${PREF_HASLA}')`).toEqual([]);
    expect(po.zapisy, 'po zmianie sesji brak zapisów').toEqual([]);
  });

  describe('B4: kontrole w jednej sesji (te same ładunki, bez zmiany sesji)', () => {
    it('notatki pacjenta: dwa powiadomienia {action: merge} w A, ping i dwa echa delt do slotu A', async () => {
      const d = await urzadzenieZIntegracja();
      const ladunek = await ladunekZInnegoUrzadzenia({ notatki: 2 });
      const ids = ladunek.patientNotes.map((n) => n.id).sort();
      const s = await scalanieNotatekCzeka(d, ladunek);
      await s.zwolnijDruga();
      const r = await s.scalanie;
      await d.ucichnij();
      expect(r.ok, `scalanie w jednej sesji kończy się powodzeniem (${r.komunikat})`).toBe(true);
      expect(await notatkiKonta(d, 'A'), 'obie notatki zapisane w A').toEqual(ids);
      const po = d.po(s.start);
      const notatki = po.zdarzenia.filter((e) => e.typ === 'patientNoteChanged');
      expect(notatki.map((e) => [e.sesja, e.dane && e.dane.action]), 'dwa powiadomienia o notatkach w A').toEqual([['A', 'merge'], ['A', 'merge']]);
      expect(notatki.map((e) => e.dane.id).sort()).toEqual(ids);
      expect(po.dziennik.filter((x) => x.klucz === PING).map((x) => x.sesja), 'ping notatek dla innych kart w A').toEqual(['A', 'A']);
      expect(d.wysylkiOd(s.wysylkiOd), 'dwa echa delt notatek do slotu A').toEqual(['beacon do slotu A w sesji A', 'beacon do slotu A w sesji A']);
      const echa = [];
      for (const w of d.slad.wysylki.slice(s.wysylkiOd)) {
        const { payload } = JSON.parse(typeof w.body === 'string' ? w.body : await w.body.text());
        const delta = await d.v.decryptPayloadForCurrentUser(payload.iv, payload.data);
        echa.push(...(delta.patientNotes || []).map((n) => n.id));
      }
      expect(echa.sort(), 'echa niosą obie scalone notatki (odszyfrowane kluczem A)').toEqual(ids);
    });

    it('listy: jedno powiadomienie {action: merge} w A', async () => {
      const d = await urzadzenie();
      const ladunek = await ladunekZInnegoUrzadzenia({ listy: 2 });
      const start = d.znacznik();
      const r = await wynik(d.v.mergeSyncPayload(ladunek));
      expect(r.ok, `scalanie w jednej sesji kończy się powodzeniem (${r.komunikat})`).toBe(true);
      expect((await d.trwaly('A')).listy).toBe(2);
      const po = d.po(start);
      expect(po.zdarzenia.filter((e) => e.typ === 'patientListChanged').map((e) => [e.sesja, e.dane && e.dane.action]), 'powiadomienie o listach w A').toEqual([['A', 'merge']]);
    });

    it("zmiana hasła na innym urządzeniu: onCredentialChanged 'password-changed-remotely' i preferencja w A", async () => {
      const d = await urzadzenieZPreferencjami();
      const { ladunek, chwila } = await ladunekZNowszymHaslem(d);
      const start = d.znacznik();
      const r = await wynik(d.v.mergeSyncPayload(ladunek));
      expect(r.ok, `scalanie w jednej sesji kończy się powodzeniem (${r.komunikat})`).toBe(true);
      expect(r.w.credentialUpdated).toBe(true);
      const po = d.po(start);
      expect(po.zdarzenia.filter((e) => e.typ === 'credentialChanged').map((e) => [e.sesja, e.dane && e.dane.action]), 'powiadomienie o zmianie hasła w A').toEqual([['A', 'password-changed-remotely']]);
      expect(d.preferencje.filter((p) => p.klucz === PREF_HASLA).map((p) => [p.sesja, p.wartosc, p.opcje && p.opcje.force]), 'preferencja zmiany hasła w A').toEqual([['A', chwila, true]]);
    });
  });
});
