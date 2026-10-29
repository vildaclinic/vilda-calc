// P-KOSZ-PO-KLUCZU (PR-E3) — koszt wyszukania wersji wpisu kosza po kluczu (A1).
//
// W pełnym scalaniu wpis kosza albo retencji, którego wersji nie ma pod jego kartą (zwykły stan: wersja usunięta razem
// z koszem albo przycięciem), sprawdza, czy wersja nie leży tu pod inną kartą. W pierwszej wersji tej zmiany — jednym odczytem po kluczu
// (getSnapshotForUser) na każdy taki wpis przy każdym pełnym scaleniu, a wpisy retencji żyją 365 dni: konto 40 kart po
// 12 wizyt z retencją — 440 osobnych transakcji magazynu na każde pobranie z chmury (przegląd 3, F-C1). Teraz
// (Bkz_gdzieIndziejRazem, po pętli kart): najpierw listy wersji kart, które pętla kart i tak przeczytała (karty
// z wpisami), a wpisy, których wersji tam nie ma — lista kart konta (jeden odczyt) i potem odczyt po kluczu każdego z nich
// albo lista wersji każdej karty bez wpisów, co mniej odczytów. Koszt wyszukania: 1 + mniejsza z liczb (wpisy do
// szukania, karty bez wpisów) — najwyżej jeden odczyt na kartę konta, najwyżej o jeden więcej niż dotąd. Odczyt po
// kluczu w pętli kart zostaje tylko dla wpisu z przypiętym rejestrem gwiazdki (od niego zależy Bgw_wskrzes). Delta
// (jedna karta, bez listy kosza) nie szuka wcale: wersja z delty i tak przechodzi Bkz_pomin po kluczu. Stan zbieżny — bez
// zapisów. Wyszukanie nie patrzy na nagrobki pacjenta: wersja leży pod inną kartą także wtedy, gdy nagrobka „Scal
// pacjentów” tu nie znamy (H1 niżej — filtr „tylko karty ze znanym nagrobkiem” zostawiał tam wizytę w starej karcie).
//
// Zmierzone (magazyn w pamięci; sprawdzane dokładnie; odczyty wyszukania — wywołania magazynu z Bkz_gdzieIndziej albo
// Bkz_gdzieIndziejRazem w stosie; „dotąd” — pierwsza wersja tej zmiany, z odczytem po kluczu na wpis, ten sam scenariusz;
// 8240e0df nie szuka wcale):
//   K1 40 kart × 3 wizyty, 30 wpisów kosza (30 kart z wpisem, 10 bez) — lista kart + 10 list wersji, 0 po kluczu
//      (dotąd: 30 po kluczu); listy wersji pętli kart 70, jak dotąd; delta — 0; pierwsze pobranie na puste
//      urządzenie — 0 (jak dotąd).
//   K2 40 kart × 3 wizyty, 3 wpisy kosza (37 kart bez wpisów) — lista kart + 3 odczyty po kluczu (dotąd: 3).
//   K5 40 kart × 3 wizyty, na 30 kartach dwie wizyty do kosza i „Usuń pacjenta” (60 wpisów kart, których tu nie ma) —
//      lista kart + 10 list wersji pozostałych kart, 0 po kluczu (dotąd: 60 po kluczu).
//   K3 retencja na każdej z 40 kart po 12 wizyt (450 wpisów retencji; 5 kart to cele „Scal pacjentów” starszych niż
//      każdy wpis, nagrobki duplikatów znane na obu), stan zbieżny — sama lista kart, 0 po kluczu, 0 list wersji
//      (dotąd: 450 po kluczu); to samo i 20 kart z jedną wizytą (bez wpisów) — lista kart + 20 list wersji
//      (dotąd: 450). Faza wizyty, która przeżywa przycięcie (Bsw_przezyteRetencji): jedna lista kart, 0 odczytów karty
//      (pierwsza wersja tej fazy: 5 — odczyt karty na każdy znany nagrobek D_i, choć tych kart tu już nie ma).
//   K4 jak K3 bez kart jednowizytowych i 3 pary X → Y na A (stare duplikaty X żywe na B: B poprawił w nich wizytę), A daje
//      poprawioną wizytę do kosza pod Y — lista kart + 3 listy wersji (tylko stare duplikaty), 0 po kluczu (dotąd:
//      443 po kluczu); wynik jak dotąd: wizyta w koszu z poprawką B (74), starych duplikatów nie ma.
//   K6 40 kart × 3 wizyty i 3 pary X → Y na A; B poprawia w starej X wizytę x i daje do kosza inną (x5 — X ma własny
//      wpis), A daje x do kosza pod Y — x znaleziona w liście wersji X, którą pętla kart i tak czyta; po kluczu tylko
//      3 wpisy x5 — lista kart + 3 po kluczu (dotąd: 6 po kluczu); wynik jak dotąd: x w koszu z poprawką 74, X nie ma.
//   H1 (strażnik wyniku) K: X → Z, potem kosz x pod Z; C (bez wiedzy o scaleniu) dopisało do X nową wizytę (D-4 A:
//      nagrobek X przegrywa i nie jest zapisany); P (bez wiedzy) dostaje od C nową wizytę X i wpis kosza x@Z — ani P,
//      ani ładunek C nie znają nagrobka X, a x leży na P pod X: x znika z X, po rundach jest tylko w koszu (jak
//      dotąd). Filtr po nagrobkach pacjenta (karta wpisu albo żywa karta ze znanym nagrobkiem) nie szukał tu wcale —
//      x zostawała w X na P na zawsze (sprawdzone na wariancie z filtrem; tak samo fuzz: 32 czerwone ziarna z 300).
// Odczyt z wyszukania licznik rozpoznaje po stosie wywołań (ramka Bkz_gdzieIndziej… w asynchronicznym śladzie V8) —
// z zapasem ramek (Error.stackTraceLimit), żeby dodatkowa warstwa między sejfem a magazynem (wersja vitest, pomocnik)
// nie wypchnęła jej poza ślad.
// Prawdziwy vilda_vault.js, magazyn w pamięci z licznikiem wywołań, automatyczna retencja wyłączona; K3, K4 i H1 na
// sztucznym zegarze (vi.useFakeTimers({ toFake: ['Date'] })). Dane fikcyjne („Testowy Jan”, „Testowa Ola”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { zegar, sztucznyZegar, przesunZegar, urzadzenie as urzadzenieU, jan as janU, zapisz, gdzie, doKosza, sync, rundy } from './polkrata-uprzaz.mjs';
import { ola } from './s4d7-wspolne.mjs';

Error.stackTraceLimit = 100;
afterEach(() => { vi.useRealTimers(); });

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
let nr = 0;
async function urzadzenie(nazwa) {
  nr += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const licz = {};
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      return async function (...a) {
        if (k === 'putUserMeta') {
          const stare = await cel.getUserMeta(a[0]);
          if (JSON.stringify((stare && stare.snapshotTombstones) || []) !== JSON.stringify((a[1] && a[1].snapshotTombstones) || [])) licz.lista = (licz.lista || 0) + 1;
        } else licz[k] = (licz[k] || 0) + 1;
        // odczyt z wyszukania wersji wpisu kosza (A1) — osobno od reguły właściciela wersji (Bsw_decyzja)
        if (String(new Error().stack).includes('Bkz_gdzieIndziej')) {
          licz.szukanie = (licz.szukanie || 0) + 1;
          if (k === 'getSnapshotForUser') licz.poKluczuKosz = (licz.poKluczuKosz || 0) + 1;
          if (k === 'listSnapshotsForUser') licz.szukanieListy = (licz.szukanieListy || 0) + 1;
          if (k === 'listPatientsForUser') licz.szukanieKarty = (licz.szukanieKarty || 0) + 1;
        }
        // odczyt fazy wizyty, która przeżywa przycięcie (Bsw_przezyteRetencji, przed blokadami)
        if (String(new Error().stack).includes('Bsw_przezyteRetencji')) licz[`v5_${k}`] = (licz[`v5_${k}`] || 0) + 1;
        return f.apply(cel, a);
      };
    },
  }));
  await v.createUser(`Koszt#Kosza!2026${nr}aa`, { label: `${nazwa}${nr}`, iterations: 1000 });
  const [uz] = await v.listUsers();
  return { v, licz, baza, uid: uz.userId, zeruj() { for (const k of Object.keys(licz)) delete licz[k]; } };
}
const jan = (i, w) => ({ name: `Testowy Jan ${i}`, user: { lastName: 'Testowy', firstName: `Jan${i}`, dobISO: '2016-03-12', sex: 'M', height: 120 + w, weight: 20 + w } });
const zapisy = (l) => ['putSnapshotForUser', 'removeSnapshotForUser', 'putPatientForUser', 'removePatientForUser', 'lista'].reduce((s, k) => s + (l[k] || 0), 0);
// Odczyty wyszukania: lista kart, listy wersji, odczyty po kluczu (wszystkie wywołania z Bkz_gdzieIndziej…).
const szukanie = (l) => ({ karty: l.szukanieKarty || 0, listy: l.szukanieListy || 0, poKluczu: l.poKluczuKosz || 0, razem: l.szukanie || 0 });
const M = 60e3;
const krok = (ms = M) => przesunZegar(ms);
// Sztuczny zegar od tej samej chwili w każdym teście (retencja z recentHours: 0 zostawia ostatnią wizytę dnia — cały test
// mieści się w jednym dniu).
function zegarOd() { zegar.t = Date.parse('2026-10-20T08:00:00Z'); sztucznyZegar(); }

// Konto A: `karty` kart × `wizyt` wizyt (co minutę), B dostaje komplet. Zwraca [patientId, snapshotId-y].
async function konto(A, B, karty, wizyt, { zegar: zZegarem = false } = {}) {
  const ids = [];
  for (let i = 0; i < karty; i += 1) {
    let pid = null; const s = [];
    for (let j = 0; j < wizyt; j += 1) {
      if (zZegarem) krok(5e3);
      const r = await A.v.savePatient(jan(i, j), pid ? { dedup: false, patientId: pid } : { dedup: false });
      pid = r.patientId; s.push(r.snapshotId);
    }
    ids.push([pid, s]);
  }
  await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
  return ids;
}
// Retencja (recentHours: 0 — zostaje ostatnia wizyta dnia) na kartach A i dwa scalenia B←A: stan zbieżny wpisów.
async function retencja(A, B, ids) {
  let przyciete = 0;
  for (const [pid] of ids) przyciete += (await A.v.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds.length;
  await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
  await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
  return przyciete;
}

describe('P-KOSZ-PO-KLUCZU — koszt odczytów wyszukania po kluczu', () => {
  it('K1: konto 40 kart × 3 wizyty, 30 wpisów kosza: pełne scalenie — lista kart i listy wersji 10 kart bez wpisów, bez odczytów po kluczu (dotąd: 30), delta — żadnego; bez zapisów', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const ids = await konto(A, B, 40, 3);
    for (let i = 0; i < 30; i += 1) await A.v.moveSnapshotToTrash(ids[i][0], ids[i][1][1]);
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    expect((await B.v.listTrashedSnapshots()).length, 'kontrola: 30 wpisów kosza na B').toBe(30);
    // Pierwsze pobranie na puste urządzenie (konto bez kart na starcie scalania): wersji tu nie ma — wyszukania nie ma
    // wcale, jak odczytu po kluczu dotąd (Bsw_wersjaLokalna).
    const C = await urzadzenie('C');
    await C.v.mergeSyncPayload(await A.v.exportSyncPayload());
    expect(szukanie(C.licz).razem, 'pierwsze pobranie na puste urządzenie: bez odczytów wyszukania').toBe(0);
    expect((await C.v.listTrashedSnapshots()).length, 'kontrola: 30 wpisów kosza na C').toBe(30);

    B.zeruj();
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    const pelne = { ...B.licz };
    expect(szukanie(pelne), 'pełne scalenie: odczyty wyszukania — 1 + min(30 wpisów, 10 kart bez wpisów) (dotąd: 30 po kluczu)')
      .toEqual({ karty: 1, listy: 10, poKluczu: 0, razem: 11 });
    expect(pelne.getSnapshotForUser || 0, 'pełne scalenie: wszystkie odczyty po kluczu').toBe(0);
    // jak na 8240e0df: 40 (pętla kart z ładunku) + 30 (karty z wpisami kosza w fazie nagrobków); + 10 z wyszukania
    expect((pelne.listSnapshotsForUser || 0) - (pelne.szukanieListy || 0), 'pełne scalenie: odczyty listy wersji poza wyszukaniem bez zmian').toBe(70);
    expect(zapisy(pelne), 'pełne scalenie stanu zbieżnego bez zapisów').toBe(0);

    await A.v.savePatient(jan(39, 5), { dedup: false, patientId: ids[39][0] });
    const z = await A.v.buildPatientDelta(ids[39][0]);
    // Delta jak z serwera synchronizacji (tu dwa osobne konta: odszyfrowana kluczem A, scalana jako ładunek bez listy kosza).
    const delta = JSON.parse(JSON.stringify(await A.v.decryptPayloadForCurrentUser(z.iv, z.data)));
    expect(Array.isArray(delta.snapshotTombstones), 'kontrola: delta bez listy kosza').toBe(false);
    B.zeruj();
    await B.v.mergeSyncPayload(delta);
    expect(szukanie(B.licz).razem, 'delta: bez wyszukania wpisów kosza').toBe(0);
    expect(B.licz.getSnapshotForUser || 0, 'delta: jeden odczyt po kluczu reguły właściciela wersji (nowa wizyta), jak dotąd').toBe(1);
    expect(B.licz.putSnapshotForUser || 0, 'delta: jeden zapis nowej wizyty').toBe(1);
  }, 300_000);

  it('K2: konto 40 kart × 3 wizyty, 3 wpisy kosza (37 kart bez wpisów): lista kart i 3 odczyty po kluczu — o jeden odczyt więcej niż dotąd', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const ids = await konto(A, B, 40, 3);
    for (let i = 0; i < 3; i += 1) await A.v.moveSnapshotToTrash(ids[i][0], ids[i][1][1]);
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    B.zeruj();
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    expect(szukanie(B.licz), 'odczyty wyszukania: lista kart + 3 po kluczu (dotąd: 3 po kluczu)').toEqual({ karty: 1, listy: 0, poKluczu: 3, razem: 4 });
    expect(zapisy(B.licz), 'bez zapisów').toBe(0);
  }, 300_000);

  it('K5: konto 40 kart × 3 wizyty, na 30 kartach dwie wizyty do kosza, potem „Usuń pacjenta” tych 30 kart (60 wpisów kosza kart, których już nie ma): lista kart i listy wersji 10 pozostałych kart, bez odczytów po kluczu (dotąd: 60)', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const ids = await konto(A, B, 40, 3);
    for (let i = 0; i < 30; i += 1) {
      await A.v.moveSnapshotToTrash(ids[i][0], ids[i][1][0]);
      await A.v.moveSnapshotToTrash(ids[i][0], ids[i][1][1]);
      await A.v.removePatient(ids[i][0]);
    }
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    expect({ karty: (await B.v.listPatients()).length, kosz: (await B.v.listTrashedSnapshots()).length }, 'kontrola: B — 10 kart, 60 wpisów kosza').toEqual({ karty: 10, kosz: 60 });
    B.zeruj();
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    expect(szukanie(B.licz), 'odczyty wyszukania: lista kart + 10 list wersji (dotąd: 60 po kluczu)').toEqual({ karty: 1, listy: 10, poKluczu: 0, razem: 11 });
    expect(zapisy(B.licz), 'bez zapisów').toBe(0);
  }, 300_000);

  for (const jednowizytowe of [0, 20]) {
    it(`K3: retencja na 40 kartach po 12 wizyt (450 wpisów retencji, 5 celów starszych „Scal pacjentów”)${jednowizytowe ? ` i ${jednowizytowe} kart z jedną wizytą` : ''}, stan zbieżny — ${jednowizytowe ? `lista kart i ${jednowizytowe} list wersji` : 'sama lista kart'}, bez odczytów po kluczu (dotąd: 450)`, async () => {
      zegarOd();
      const A = await urzadzenie('A'), B = await urzadzenie('B');
      const ids = await konto(A, B, 40, 12, { zegar: true });
      // „Scal pacjentów” starsze niż każdy wpis: duplikat D_i (jedna wizyta) → karta i (i < 5); nagrobki D_i na obu.
      for (let i = 0; i < 5; i += 1) {
        krok();
        const d = await A.v.savePatient(jan(i, 30), { dedup: false });
        krok(); await A.v.mergePatients(d.patientId, ids[i][0]);
      }
      const extra = await konto(A, B, jednowizytowe, 1, { zegar: true });
      await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
      krok();
      const przyciete = await retencja(A, B, ids);
      const lista = (await A.v.exportSyncPayload()).snapshotTombstones;
      // 35 kart × 11 wizyt i 5 kart × 13 (12 wizyt i wizyta duplikatu; zostaje głowa scalenia — ostatnia wersja dnia)
      expect({ przyciete, lista: lista.length }, 'kontrola: każda przycięta wizyta we wpisie retencji').toEqual({ przyciete: 450, lista: 450 });
      expect(lista.every((e) => e.powod === 'retencja')).toBe(true);
      expect((await B.v.exportSyncPayload()).tombstones.length, 'kontrola: nagrobki pacjenta D_i znane na B').toBe(5);
      for (let k = 0; k < 2; k += 1) {
        krok();
        const ladunek = await A.v.exportSyncPayload();
        B.zeruj();
        await B.v.mergeSyncPayload(ladunek);
        expect(szukanie(B.licz), `pełne scalenie ${k + 1}: odczyty wyszukania (dotąd: 450 po kluczu)`)
          .toEqual({ karty: 1, listy: jednowizytowe, poKluczu: 0, razem: 1 + jednowizytowe });
        expect(B.licz.getSnapshotForUser || 0, 'wszystkie odczyty po kluczu').toBe(0);
        expect((B.licz.listSnapshotsForUser || 0) - jednowizytowe, 'listy wersji pętli kart: karty z ładunku i karty z wpisami, jak dotąd').toBe(80 + jednowizytowe);
        expect(zapisy(B.licz), 'stan zbieżny bez zapisów').toBe(0);
        // Faza wizyty, która przeżywa przycięcie: jedna lista kart, bez odczytu karty dla nagrobków D_i, których tu już
        // nie ma (pierwsza wersja tej fazy — odczyt karty na każdy znany nagrobek pacjenta w każdym scaleniu).
        expect({ lista: B.licz.v5_listPatientsForUser || 0, karta: B.licz.v5_getPatientForUser || 0 }, `pełne scalenie ${k + 1}: odczyty fazy przeżytych przycięć`)
          .toEqual({ lista: 1, karta: 0 });
      }
      expect(extra.length).toBe(jednowizytowe);
    }, 600_000);
  }

  it('K4: retencja na 40 kartach (440 wpisów) i 3 stare duplikaty X żywe na B (B poprawił w nich wizytę po „Scal pacjentów” na A), A daje ją do kosza pod Y — listy wersji tylko trzech duplikatów, bez odczytów po kluczu (dotąd: 443); wizyta w koszu z poprawką 74, duplikatów nie ma', async () => {
    zegarOd();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const ids = await konto(A, B, 40, 12, { zegar: true });
    const pary = [];
    for (let i = 0; i < 3; i += 1) {
      const x = [];
      let X = null;
      for (const w of [0, 3, 5]) { krok(); const r = await A.v.savePatient(jan(100 + i, w), X ? { dedup: false, patientId: X } : { dedup: false }); X = r.patientId; x.push(r.snapshotId); }
      krok();
      const Y = (await A.v.savePatient({ name: `Testowa Ola ${i}`, user: { lastName: 'Testowa', firstName: `Ola${i}`, dobISO: '2017-05-02', sex: 'F', height: 110, weight: 18 } }, { dedup: false })).patientId;
      pary.push({ X, Y, x: x[1] });
    }
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    krok();
    expect(await retencja(A, B, ids), 'kontrola: 440 wpisów retencji').toBe(440);
    for (const p of pary) { krok(); await A.v.mergePatients(p.X, p.Y); }
    for (const p of pary) {
      krok();
      const g = (await B.v.getPatient(p.X)).snapshots.find((s) => s.snapshotId === p.x);
      await B.v.updateSnapshotPayload(p.X, p.x, { ...g.payload, user: { ...g.payload.user, weight: 74 } }, { preserveSavedAt: true });
    }
    for (const p of pary) { krok(); await A.v.moveSnapshotToTrash(p.Y, p.x, { odepnij: true }); }
    krok();
    const ladunek = await A.v.exportSyncPayload();
    B.zeruj();
    await B.v.mergeSyncPayload(ladunek);
    expect(szukanie(B.licz), 'odczyty wyszukania: lista kart + listy wersji trzech starych duplikatów (dotąd: 443 po kluczu)')
      .toEqual({ karty: 1, listy: 3, poKluczu: 0, razem: 4 });
    const kosz = await B.v.listTrashedSnapshots();
    for (const p of pary) {
      const k = kosz.find((e) => e.snapshotId === p.x);
      expect(k && { karta: k.patientId === p.Y, masa: k.payload && k.payload.user.weight }, 'B: wizyta w koszu pod Y z poprawką B').toEqual({ karta: true, masa: 74 });
      expect(await B.v.getPatient(p.X), 'B: starego duplikatu X nie ma').toBeFalsy();
      expect((await B.baza.getSnapshotForUser(B.uid, p.x)), 'B: wizyty w żadnej karcie').toBeFalsy();
    }
    // Stan zbieżny po tym scaleniu: duplikatów już nie ma — sama lista kart.
    krok();
    B.zeruj();
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    expect(szukanie(B.licz), 'następne pełne scalenie: sama lista kart').toEqual({ karty: 1, listy: 0, poKluczu: 0, razem: 1 });
  }, 600_000);

  it('K6: 40 kart × 3 wizyty i 3 stare duplikaty X żywe na B z własnym wpisem kosza (B poprawił w X wizytę x i dał do kosza inną), A daje x do kosza pod Y — x znaleziona w liście wersji X, którą pętla kart i tak czyta: lista kart i 3 odczyty po kluczu tylko dla wpisów X (dotąd: 6 po kluczu); x w koszu z poprawką 74, w żadnej karcie', async () => {
    zegarOd();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    await konto(A, B, 40, 3, { zegar: true });
    const pary = [];
    for (let i = 0; i < 3; i += 1) {
      const x = [];
      let X = null;
      for (const w of [0, 3, 5]) { krok(); const r = await A.v.savePatient(jan(100 + i, w), X ? { dedup: false, patientId: X } : { dedup: false }); X = r.patientId; x.push(r.snapshotId); }
      krok();
      const Y = (await A.v.savePatient({ name: `Testowa Ola ${i}`, user: { lastName: 'Testowa', firstName: `Ola${i}`, dobISO: '2017-05-02', sex: 'F', height: 110, weight: 18 } }, { dedup: false })).patientId;
      pary.push({ X, Y, x: x[1], x5: x[2] });
    }
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    for (const p of pary) { krok(); await A.v.mergePatients(p.X, p.Y); }
    for (const p of pary) {
      krok();
      const g = (await B.v.getPatient(p.X)).snapshots.find((s) => s.snapshotId === p.x);
      await B.v.updateSnapshotPayload(p.X, p.x, { ...g.payload, user: { ...g.payload.user, weight: 74 } }, { preserveSavedAt: true });
      krok(); await B.v.moveSnapshotToTrash(p.X, p.x5, { odepnij: true });
    }
    for (const p of pary) { krok(); await A.v.moveSnapshotToTrash(p.Y, p.x, { odepnij: true }); }
    krok();
    const ladunek = await A.v.exportSyncPayload();
    B.zeruj();
    await B.v.mergeSyncPayload(ladunek);
    expect(szukanie(B.licz), 'odczyty wyszukania: lista kart + 3 po kluczu (wpisy x5 pod X); x — z listy wersji X z pętli kart (dotąd: 6 po kluczu)')
      .toEqual({ karty: 1, listy: 0, poKluczu: 3, razem: 4 });
    const kosz = await B.v.listTrashedSnapshots();
    for (const p of pary) {
      const k = kosz.find((e) => e.snapshotId === p.x);
      expect(k && { karta: k.patientId === p.Y, masa: k.payload && k.payload.user.weight }, 'B: x w koszu pod Y z poprawką B').toEqual({ karta: true, masa: 74 });
      expect(await B.v.getPatient(p.X), 'B: starego duplikatu X nie ma').toBeFalsy();
      expect((await B.baza.getSnapshotForUser(B.uid, p.x)), 'B: x w żadnej karcie').toBeFalsy();
    }
  }, 600_000);

  it('H1 (strażnik wyniku): P (bez wiedzy o „Scal pacjentów” X → Z) dostaje od C wpis kosza x@Z i nową wizytę X; ani P, ani ładunek C nie znają nagrobka X (C dopisało wizytę do X po scaleniu, D-4 A) — x znika z X na P jak dotąd i po rundach jest tylko w koszu (filtr po nagrobkach pacjenta zostawiał x w X na P na zawsze)', async () => {
    sztucznyZegar();
    const K = await urzadzenieU('K'), P = await urzadzenieU('P'), C = await urzadzenieU('C');
    const x = await zapisz(K, janU(125, 23)); const X = x.patientId; const sid = x.snapshotId;
    const Z = (await zapisz(K, ola(111, 19))).patientId;
    await zapisz(K, ola(112, 20), { patientId: Z });
    await sync(K, P); await sync(K, C);
    krok(); await K.mergePatients(X, Z);
    const nowa = (await zapisz(C, janU(126, 24), { patientId: X })).snapshotId;
    krok(); await doKosza(K, sid);
    krok(); await sync(K, C);
    // C: nagrobek X przegrywa z nową wizytą (D-4 A) i nie jest zapisany; x (wpis kosza x@Z z K) znika z X — X ma dwie
    // wersje, więc bez wyjątku ostatniej wersji.
    expect(await gdzie(C, sid), 'kontrola: C bez x w karcie').toBe(null);
    expect((await C.exportSyncPayload()).tombstones || [], 'kontrola: ładunek C bez nagrobka pacjenta').toEqual([]);
    expect((await P.exportSyncPayload()).tombstones || [], 'kontrola: P nie zna nagrobka pacjenta').toEqual([]);
    expect((await gdzie(P, sid))?.pid, 'kontrola: P — x w starej X').toBe(X);
    krok(); await sync(C, P);
    const wersjeX = async (v) => ((await v.getPatient(X))?.snapshots || []).map((s) => (s.snapshotId === sid ? 'x' : s.snapshotId === nowa ? 'nowa' : '?')).sort();
    const wKoszu = async (v) => (await v.listTrashedSnapshots()).some((e) => e.snapshotId === sid);
    expect(await gdzie(P, sid), 'P: x w żadnej karcie (dotąd: tak samo; filtr po nagrobkach: x zostaje w X)').toBe(null);
    expect({ X: await wersjeX(P), kosz: await wKoszu(P) }, 'P: X z nową wizytą, x w koszu').toEqual({ X: ['nowa'], kosz: true });
    await rundy([P, K, C], 3);
    for (const [n, v] of [['P', P], ['K', K], ['C', C]]) {
      expect({ x: await gdzie(v, sid), X: await wersjeX(v), kosz: await wKoszu(v) }, `${n} po rundach: x tylko w koszu, X z nową wizytą`).toEqual({ x: null, X: ['nowa'], kosz: true });
    }
  }, 120_000);
});
