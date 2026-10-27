// P-PRZYPIETA-POLKRATA (S4, W3) — jawny import a gwiazdka z własną datą: „Scal kopię konta” (mergeVaultBackup, ss)
// i import pliku karty (importPatientFromEnvelope, ns). Zgłoszenia przeglądu 2 (2026-10-22): R2-K1 (kopia konta
// podbijała wersje obecne w karcie i gubiła późniejszą poprawkę) i R2-K4 (import zapisu usuniętego przez „Odepnij i usuń”
// pokazywał gwiazdkę, która po synchronizacji po cichu znikała). Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny
// zegar, dane wyłącznie fikcyjne („Testowy Jan”, wizyta 103 cm / 23 kg). Uprząż: polkrata-uprzaz.mjs; starsza
// aplikacja — tests/fixtures/vilda_vault-221.js.txt (D11 = a). Opis: docs/clinical/ALGORITHMS.md (P-PRZYPIETA-POLKRATA).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  zegar, sztucznyZegar, przesunZegar, urzadzenia, sync, rundy, widoki, widok, stan, poprawMase, przypnij, przytnij, doKosza,
  zeruj, zapisy, gdzie,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
const DZIEN = 864e5;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const KOLEJNOSCI_8 = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P'];
const krok = async (fn) => { const r = await fn(); przesunZegar(M); return r; };
// Każdy przebieg od 9:00 UTC (12 wizyt co minutę i kroki w jednym dniu — jak przypieta-w3-flota).
function zegarRano() {
  const d = new Date(zegar.t);
  if (d.getUTCHours() >= 9 && d.getUTCHours() < 12) { sztucznyZegar(); return; }
  zegar.t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 9);
  sztucznyZegar();
}
const sumaZapisow = (lista) => Object.values(zapisy(lista)).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0);
async function pierwszeIRundy(u, kol) {
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  const lista = Object.values(u);
  await rundy(lista, 3);
  return lista;
}

describe('„Scal kopię konta” nie podbija wersji, które karta już ma (R2-K1)', () => {
  // Kopia konta K z wizytą; P przypina i wysyła K; C (bez wiedzy o gwiazdce) przycina i wysyła K — na K zostaje 23*
  // i nagrobek retencji (A3a, D9 = a); P poprawia 74 bez synchronizacji; lekarz na K robi „Scal kopię konta”.
  // ss wołał Bkz_poImporcie dla wszystkich wersji z kopii, także tych, które pominął, bo karta je ma: wersja dostawała
  // rev + 1 i chwilę treści i zmiany = „teraz” (później niż poprawka P), a nagrobek A3a znikał. Wynik: 23* w 8 z 8 na
  // trzech urządzeniach — poprawka 74 kg ginęła po cichu także na P (f612fe09: 74* w 8 z 8). Cel: 74* (P-POZNIEJSZA-POPRAWKA).
  async function r2k1(flota, kol, scal) {
    zegarRano();
    const { u, sid } = await urzadzenia(['P', 'K', 'C'], flota);
    przesunZegar(M);
    const kopia = await u.K.exportVaultBackup();
    await krok(async () => { await przypnij(u.P, sid, true); await sync(u.P, u.K); });
    await krok(async () => { await przytnij(u.C, sid); await sync(u.C, u.K); });
    const przed = (await gdzie(u.K, sid)).s;
    await krok(() => poprawMase(u.P, sid, 74));
    let po = null;
    if (scal) {
      const wynik = await krok(() => u.K.mergeVaultBackup(kopia, u.K.__haslo));
      const s = (await gdzie(u.K, sid)).s;
      po = { pominieta: wynik.skippedSnapshotCount >= 1, rev: s.rev - przed.rev, zm: s.updatedAtISO === przed.updatedAtISO };
    }
    const lista = await pierwszeIRundy(u, kol);
    const w = await widoki(u, sid);
    zeruj(lista); await rundy(lista, 1);
    return { po, w, zap: sumaZapisow(lista) };
  }
  for (const [nazwa, flota] of [['nowe', {}], ['C na 221', { C: 'S221' }]]) {
    it(`R2-K1 (${nazwa}): po „Scal kopię konta” na K zostaje 74* w 8 kolejnościach; wersja z karty bez nowej rev i chwili`, async () => {
      const zle = [];
      for (const kol of KOLEJNOSCI_8) {
        const r = await r2k1(flota, kol, true);
        const ok = r.po.pominieta && r.po.rev === 0 && r.po.zm && !r.zap && Object.values(r.w).every((x) => x === 'karta 74*');
        if (!ok) zle.push(`${kol}: ${JSON.stringify(r)}`);
      }
      expect(zle).toEqual([]);
    }, 300_000);
  }
  it('kontrola R2-K1: bez „Scal kopię konta” — 74* w 8 kolejnościach', async () => {
    const zle = [];
    for (const kol of KOLEJNOSCI_8) {
      const r = await r2k1({}, kol, false);
      if (r.zap || Object.values(r.w).some((x) => x !== 'karta 74*')) zle.push(`${kol}: ${JSON.stringify(r)}`);
    }
    expect(zle).toEqual([]);
  }, 300_000);
});

describe('Import zapisu usuniętego przez „Odepnij i usuń” — bez gwiazdki, jak „Przywróć” (R2-K4, D2 = a)', () => {
  // K przypina i wysyła; powstaje plik karty albo kopia konta; K robi „Odepnij i usuń” i wysyła; K importuje plik albo
  // scala kopię. Bkz_poImporcie brał rejestr gwiazdki tylko z treści z pliku (przypięta w chwili sprzed usunięcia), a wpis
  // kosza (odpięcie z „Odepnij i usuń”) zdejmował: tuż po imporcie karta 23*, a po pierwszej synchronizacji (nagrobek
  // z odpięciem w chmurze i na innych urządzeniach) gwiazdka znikała po cichu — lekarz nie wiedział, że ma przypiąć
  // ponownie. Teraz rejestr = późniejszy z treści i wpisu kosza, tak jak w „Przywróć” (okno usunięcia: „wróci
  // nieprzypięty — przypniesz go wtedy ponownie”): 23 bez gwiazdki od razu, na każdym urządzeniu i po synchronizacji.
  const importuj = (v, sposob, plik) => (sposob === 'plik' ? v.importPatientFromEnvelope(plik, v.__haslo) : v.mergeVaultBackup(plik, v.__haslo));
  const zrobPlik = (v, sposob, pid) => (sposob === 'plik' ? v.exportPatientEnvelope(pid) : v.exportVaultBackup());
  // Chmura jak w vilda_sync.js: blob = ostatni wysłany ładunek; wysyłka = pobierz, scal, wyślij.
  async function chmura(v, blob) {
    if (blob.p) await v.mergeSyncPayload(JSON.parse(JSON.stringify(blob.p)));
    blob.p = JSON.parse(JSON.stringify(await v.exportSyncPayload()));
  }
  for (const sposob of ['plik', 'kopia']) {
    it(`R2-K4 (${sposob}): jedno urządzenie z chmurą — 23 bez gwiazdki tuż po imporcie i po synchronizacji`, async () => {
      zegarRano();
      const { u, sid, pid } = await urzadzenia(['K']);
      const blob = {};
      await krok(() => chmura(u.K, blob));
      await krok(async () => { await przypnij(u.K, sid, true); await chmura(u.K, blob); });
      const plik = await zrobPlik(u.K, sposob, pid);
      await krok(async () => { await doKosza(u.K, sid); await chmura(u.K, blob); });
      await krok(() => importuj(u.K, sposob, plik));
      const poImporcie = widok(await stan(u.K, sid));
      await krok(() => chmura(u.K, blob));
      const poSync = widok(await stan(u.K, sid));
      expect({ poImporcie, poSync }).toEqual({ poImporcie: 'karta 23', poSync: 'karta 23' });
    }, 120_000);
    it(`R2-K4 (${sposob}): trzy urządzenia, import 2 dni po pliku — 23 bez gwiazdki na trzech w 8 kolejnościach`, async () => {
      const zle = [];
      for (const kol of KOLEJNOSCI_8) {
        zegarRano();
        const { u, sid, pid } = await urzadzenia(['P', 'K', 'C']);
        await krok(async () => { await przypnij(u.K, sid, true); await sync(u.K, u.P); await sync(u.K, u.C); });
        const plik = await zrobPlik(u.K, sposob, pid);
        przesunZegar(2 * DZIEN);
        await krok(async () => { await doKosza(u.K, sid); await sync(u.K, u.P); await sync(u.K, u.C); });
        await krok(() => importuj(u.K, sposob, plik));
        const poImporcie = widok(await stan(u.K, sid));
        const lista = await pierwszeIRundy(u, kol);
        const w = await widoki(u, sid);
        zeruj(lista); await rundy(lista, 1);
        const zap = sumaZapisow(lista);
        if (poImporcie !== 'karta 23' || zap || Object.values(w).some((x) => x !== 'karta 23')) zle.push(`${kol}: ${poImporcie} → ${JSON.stringify(w)} zapisy ${zap}`);
      }
      expect(zle).toEqual([]);
    }, 300_000);
  }
  it('kontrola R2-K4: import pliku z wizytą przypiętą, której nikt nie usunął — gwiazdka zostaje (23*)', async () => {
    zegarRano();
    const { u, sid, pid } = await urzadzenia(['K', 'P']);
    await krok(async () => { await przypnij(u.K, sid, true); await sync(u.K, u.P); });
    const plik = await u.P.exportPatientEnvelope(pid);
    await krok(() => u.P.removePatient(pid));
    await krok(() => u.P.importPatientFromEnvelope(plik, u.P.__haslo));
    await rundy([u.K, u.P], 3);
    expect(await widoki(u, sid)).toEqual({ K: 'karta 23*', P: 'karta 23*' });
  }, 120_000);
});
