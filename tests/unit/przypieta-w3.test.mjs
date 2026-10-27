// P-PRZYPIETA-POLKRATA (S4 krok 2, W3 — decyzje właściciela 2026-10-21: D1 = C „gwiazdka z własną datą”, D2 = a,
// D3 = a): format pól gwiazdki w treści wersji, rozpoznanie zmiany zrobionej przez starszą aplikację, rekord złożony,
// „Odepnij i usuń” / „Przywróć”, rejestr gwiazdki w nagrobku i flota mieszana z 221. Prawdziwy vilda_vault.js, sejfy
// w pamięci, sztuczny zegar, dane wyłącznie fikcyjne („Testowy Jan”). Uprząż: polkrata-uprzaz.mjs; starsza aplikacja —
// tests/fixtures/vilda_vault-221.js.txt (54a84da3, D11 = a). Katalog scenariuszy: polkrata-katalog.test.mjs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  repo, sztucznyZegar, przesunZegar, zegar, urzadzenia, aktualizuj, sync, rundy, gdzie, widoki, poprawMase, przypnij,
  doKosza, przytnij, zeruj, zapisy,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const kopia = (x) => JSON.parse(JSON.stringify(x));
const wersja = async (v, sid) => (await gdzie(v, sid)).s;
// Rejestr gwiazdki bez odcisku treści h (Z1: odcisk z ostatniego zapisu tej aplikacji; sprawdzany osobno).
const rejestr = (s) => { const r = { ...s.payload._pinnedState }; delete r.h; return r; };

describe('W3: pola gwiazdki w treści wersji (jedno urządzenie)', () => {
  it('nowa wizyta: rejestr „nigdy jawnie” i chwila treści = chwila zapisu', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['K']);
    const s = await wersja(u.K, sid);
    expect(rejestr(s)).toEqual({ pin: false, at: null });
    expect(s.payload._contentAtISO).toBe(s.savedAtISO);
    expect(s.pinned).toBe(false);
  });
  it('gwiazdka i odpięcie zmieniają tylko rejestr (chwila = stempel zmiany), poprawka — tylko chwilę treści', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['K']);
    const s0 = await wersja(u.K, sid);
    przesunZegar(M); await przypnij(u.K, sid, true);
    const s1 = await wersja(u.K, sid);
    expect({ rev: s1.rev, pin: s1.pinned, rej: rejestr(s1), cz: s1.payload._contentAtISO })
      .toEqual({ rev: s0.rev + 1, pin: true, rej: { pin: true, at: s1.updatedAtISO }, cz: s0.payload._contentAtISO });
    przesunZegar(M); await poprawMase(u.K, sid, 31);
    const s2 = await wersja(u.K, sid);
    expect({ rev: s2.rev, pin: s2.pinned, rej: rejestr(s2), cz: s2.payload._contentAtISO })
      .toEqual({ rev: s1.rev + 1, pin: true, rej: { pin: true, at: s1.updatedAtISO }, cz: s2.updatedAtISO });
    przesunZegar(M); await przypnij(u.K, sid, false);
    const s3 = await wersja(u.K, sid);
    expect({ pin: s3.pinned, rej: rejestr(s3), cz: s3.payload._contentAtISO })
      .toEqual({ pin: false, rej: { pin: false, at: s3.updatedAtISO }, cz: s2.updatedAtISO });
  });
  it('odcisk treści h (Z1, F-B): pisze go każdy zapis tej aplikacji; gwiazdka go nie zmienia, poprawka — tak', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['K']);
    const h0 = (await wersja(u.K, sid)).payload._pinnedState.h;
    expect(h0).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/);
    przesunZegar(M); await przypnij(u.K, sid, true);
    expect((await wersja(u.K, sid)).payload._pinnedState.h, 'gwiazdka — ta sama treść').toBe(h0);
    przesunZegar(M); await poprawMase(u.K, sid, 31);
    const h2 = (await wersja(u.K, sid)).payload._pinnedState.h;
    expect(h2, 'poprawka — inna treść').not.toBe(h0);
    przesunZegar(M); await poprawMase(u.K, sid, 23);
    expect((await wersja(u.K, sid)).payload._pinnedState.h, 'powrót do tej samej treści — ten sam odcisk').toBe(h0);
  });
  it('„Odepnij i usuń”: najpierw odpięcie (rev + 1), kosz z treścią bez gwiazdki i z rejestrem w nagrobku; „Przywróć” — bez gwiazdki (D2 = a)', async () => {
    sztucznyZegar();
    const { u, pid, sid } = await urzadzenia(['K']);
    przesunZegar(M); await przypnij(u.K, sid, true);
    const s1 = await wersja(u.K, sid);
    przesunZegar(M);
    const wynik = await doKosza(u.K, sid);
    expect(wynik.wasPinned, 'okno pokazało przypięty').toBe(true);
    const kosz = (await u.K.listTrashedSnapshots()).find((e) => e.snapshotId === sid);
    expect({ pin: kosz.pinned, rej: kosz.payload._pinnedState.pin }).toEqual({ pin: false, rej: false });
    const n = (await u.K.exportSyncPayload()).snapshotTombstones.find((e) => e.snapshotId === sid);
    expect(n.rev, 'odpięcie zapisane przed koszem').toBe(s1.rev + 1);
    expect(n.gwiazdka.pin).toBe(false);
    expect(n.gwiazdka.at > s1.updatedAtISO && n.deletedAtISO > n.gwiazdka.at, 'odpięcie po gwiazdce, kosz po odpięciu').toBe(true);
    przesunZegar(M);
    await u.K.restoreTrashedSnapshot(pid, sid);
    const s2 = await wersja(u.K, sid);
    expect({ pin: s2.pinned, rej: rejestr(s2).pin }).toEqual({ pin: false, rej: false });
  });
});

describe('W3: rozpoznanie zmiany zrobionej przez starszą aplikację (pola w treści bez zmian, _pinned ≠ rejestr)', () => {
  // Ładunek „jak od starszej aplikacji”: treść wersji przeniesiona w całości (pola W3 bez zmian), zmieniona tylko _pinned
  // albo masa, z nową chwilą zmiany i rev + 1 — tak robi 221 przy gwiazdce i przy poprawce.
  async function zLadunkiem(zmien) {
    sztucznyZegar();
    const { u, sid, pid } = await urzadzenia(['P', 'K']);
    const s0 = await wersja(u.K, sid);
    przesunZegar(M);
    const lad = kopia(await u.K.exportSyncPayload());
    delete lad.credential;
    const S = lad.patients.find((p) => p.patientId === pid).snapshots.find((x) => x.snapshotId === sid);
    zmien(S);
    S.rev = (S.rev || 0) + 1; S.updatedAtISO = new Date(zegar.t).toISOString();
    przesunZegar(M);
    return { u, sid, s0, lad, S };
  }
  it('gwiazdka starszej aplikacji (pole _pinnedState { pin: false }) wygrywa z późniejszą poprawką tutaj bez wiedzy o niej — rekord złożony', async () => {
    const { u, sid, lad, S } = await zLadunkiem((x) => { x.payload._pinned = true; });
    expect(rejestr(S), 'rejestr bez zmian (starsza aplikacja go nie zna)').toEqual({ pin: false, at: null });
    await poprawMase(u.P, sid, 58); // P nie zna gwiazdki: poprawka później niż gwiazdka
    const p = await wersja(u.P, sid);
    await u.P.mergeSyncPayload(lad);
    const w = await wersja(u.P, sid);
    expect({ masa: w.payload.user.weight, pin: w.pinned, rev: w.rev, upd: w.updatedAtISO, rej: rejestr(w) })
      .toEqual({ masa: 58, pin: true, rev: Math.max(p.rev, S.rev) + 1, upd: p.updatedAtISO, rej: { pin: true, at: S.updatedAtISO, zl: true } });
  });
  it('poprawka starszej aplikacji (pola zgodne, chwila zmiany późniejsza niż obie chwile) — zmiana treści, gwiazdka tutaj zostaje', async () => {
    const { u, sid, lad, S } = await zLadunkiem((x) => { x.payload = { ...x.payload, user: { ...x.payload.user, weight: 74 } }; });
    przesunZegar(-3 * M); // gwiazdka P wcześniej niż poprawka starszej aplikacji
    await przypnij(u.P, sid, true);
    przesunZegar(3 * M);
    const p = await wersja(u.P, sid);
    expect(p.updatedAtISO < S.updatedAtISO, 'kontrola: gwiazdka P przed poprawką').toBe(true);
    await u.P.mergeSyncPayload(lad);
    const w = await wersja(u.P, sid);
    expect({ masa: w.payload.user.weight, pin: w.pinned, rev: w.rev, upd: w.updatedAtISO, cz: w.payload._contentAtISO })
      .toEqual({ masa: 74, pin: true, rev: Math.max(p.rev, S.rev) + 1, upd: S.updatedAtISO, cz: S.updatedAtISO });
  });
  it('wersja bez pól W3 (starsza aplikacja, dane sprzed W3): przypięta — gwiazdka w chwili zmiany, nieprzypięta — „nigdy jawnie”', async () => {
    const { u, sid, lad, S } = await zLadunkiem((x) => {
      delete x.payload._pinnedState; delete x.payload._contentAtISO;
      x.payload = { ...x.payload, user: { ...x.payload.user, weight: 74 } };
    });
    przesunZegar(-3 * M);
    await przypnij(u.P, sid, true); // gwiazdka P wcześniejsza niż poprawka bez pól
    przesunZegar(3 * M);
    await u.P.mergeSyncPayload(lad);
    const w = await wersja(u.P, sid);
    expect({ masa: w.payload.user.weight, pin: w.pinned, rev: w.rev, upd: w.updatedAtISO }, 'poprawka bez pól nie odpina — rekord złożony')
      .toEqual({ masa: 74, pin: true, rev: 2, upd: S.updatedAtISO });
  });
});

describe('W3: rekord złożony — ta sama rev i chwila zmiany, inna treść (znacznik zl)', () => {
  // Dwa urządzenia składają różne treści z tą samą gwiazdką: rev = 1 + 1 i chwila zmiany = chwila gwiazdki na obu. Bez
  // znacznika scalenie pomijało wersję (ta sama rev i chwila zmiany = ta sama wersja) i urządzenia rozjeżdżały się na
  // stałe (fuzz praw, zestaw A, ziarna 51 i 86).
  it('K i C poprawiają (C później), P przypina po obu; K i C składają osobno — po rundach na trzech treść C z gwiazdką', async () => {
    sztucznyZegar();
    const { u, lista, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.K, sid, 37);
    przesunZegar(M); await poprawMase(u.C, sid, 41);
    przesunZegar(M); await przypnij(u.P, sid, true);
    przesunZegar(M);
    await sync(u.P, u.K); await sync(u.P, u.C);
    const k = await wersja(u.K, sid), c = await wersja(u.C, sid);
    expect({ k: [k.payload.user.weight, k.pinned, k.rev, k.updatedAtISO], c: [c.payload.user.weight, c.pinned, c.rev, c.updatedAtISO] }, 'kontrola: dwa różne rekordy złożone z tą samą rev i chwilą')
      .toEqual({ k: [37, true, 2, c.updatedAtISO], c: [41, true, 2, k.updatedAtISO] });
    expect(rejestr(k).zl && rejestr(c).zl).toBe(true);
    await rundy(lista, 2);
    expect(await widoki(u, sid)).toEqual({ P: 'karta 41*', K: 'karta 41*', C: 'karta 41*' });
    zeruj(lista); await rundy(lista, 1);
    expect(Object.values(zapisy(lista)).map((z) => z.lista + z.wersje + z.karty)).toEqual([0, 0, 0]);
  });
});

describe('W3: rejestr gwiazdki w nagrobku (pole gwiazdka; brak = „nieznany”)', () => {
  it('ODP: P przypina i wysyła C; C świadomie odpina i przycina; P (stara kopia z gwiazdką) scala — nagrobek niesie odpięcie, wizyty nie ma', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await przypnij(u.P, sid, true); await sync(u.P, u.C);
    przesunZegar(M); await przypnij(u.C, sid, false);
    const c = await wersja(u.C, sid);
    przesunZegar(M); await przytnij(u.C, sid);
    const n = (await u.C.exportSyncPayload()).snapshotTombstones.find((e) => e.snapshotId === sid);
    expect({ powod: n.powod, gwiazdka: n.gwiazdka }).toEqual({ powod: 'retencja', gwiazdka: { pin: false, at: c.updatedAtISO } });
    przesunZegar(M); await sync(u.C, u.P);
    expect(await widoki(u, sid, ['P', 'C'])).toEqual({ P: 'brak', C: 'brak' });
  });
  it('ten sam ładunek bez pola gwiazdka (nagrobek starszej aplikacji): rejestr nieznany — decyduje gwiazdka wersji, przypięta zostaje', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await przypnij(u.P, sid, true); await sync(u.P, u.C);
    przesunZegar(M); await przypnij(u.C, sid, false);
    przesunZegar(M); await przytnij(u.C, sid);
    const lad = kopia(await u.C.exportSyncPayload());
    delete lad.credential;
    for (const e of lad.snapshotTombstones) delete e.gwiazdka;
    przesunZegar(M); await u.P.mergeSyncPayload(lad);
    expect((await widoki(u, sid)).P).toBe('karta 23*');
  });
});

describe('W3: flota mieszana z 221 (tests/fixtures/vilda_vault-221.js.txt)', () => {
  it('S6 z C na 221: P przypina, C (221, bez wiedzy) poprawia 58, K przycina — po rundach 58* na trzech (rekord złożony z rev 2 przyjmuje też 221)', async () => {
    sztucznyZegar();
    const { u, lista, sid } = await urzadzenia(['P', 'K', 'C'], { C: 'S221' });
    przesunZegar(M); await przypnij(u.P, sid, true);
    przesunZegar(M); await poprawMase(u.C, sid, 58);
    przesunZegar(M); await przytnij(u.K, sid);
    przesunZegar(M);
    await rundy(lista, 3);
    expect(await widoki(u, sid)).toEqual({ P: 'karta 58*', K: 'karta 58*', C: 'karta 58*' });
    expect((await wersja(u.C, sid)).rev, 'rekord złożony: 1 + 1').toBe(2);
    zeruj(lista); await rundy(lista, 1);
    expect(Object.values(zapisy(lista)).map((z) => z.lista + z.wersje + z.karty)).toEqual([0, 0, 0]);
  }, 120_000);
  it('ODP z P na 221 (stara kopia z gwiazdką): do aktualizacji P pokazuje 23*, K i C — brak (rejestru 221 nie zna); po aktualizacji P — brak na trzech', async () => {
    sztucznyZegar();
    const { u, lista, sid } = await urzadzenia(['P', 'K', 'C'], { P: 'S221' });
    przesunZegar(M); await przypnij(u.P, sid, true); await sync(u.P, u.C);
    przesunZegar(M); await przypnij(u.C, sid, false);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M);
    await rundy(lista, 3);
    expect(await widoki(u, sid)).toEqual({ P: 'karta 23*', K: 'brak', C: 'brak' });
    zeruj(lista); await rundy(lista, 1);
    expect(Object.values(zapisy(lista)).map((z) => z.lista + z.wersje + z.karty), 'bez pętli zapisów').toEqual([0, 0, 0]);
    u.P = await aktualizuj(u.P, 'N');
    await rundy([u.P, u.K, u.C], 3);
    expect(await widoki(u, sid)).toEqual({ P: 'brak', K: 'brak', C: 'brak' });
  }, 120_000);
});

describe('strażnik źródła W3', () => {
  const src = readFileSync(path.join(repo, 'vilda_vault.js'), 'utf8');
  const czesc = (od, doo) => src.slice(src.indexOf(od), src.indexOf(doo));
  it('jedna decyzja „przypięta przeżywa przycięcie” (Bpk_przypieta) w Bkz_wygrywa i na końcu scalania', () => {
    expect(czesc('function Bkz_wygrywa(', 'function Bpk_przypieta(')).toContain('return !!ret && ret >= zmiana && !Bpk_przypieta(e, st);');
    expect(czesc('async function Bkz_scalKoniec(', 'async function Bkz_poImporcie(')).toContain('if (Bpk_przypieta(e, st)) {');
    expect(src).not.toContain('Bpk_przypietaPrzegrywa');
  });
  it('odczyt pól: bez pól — przypięta w chwili zmiany, nieprzypięta „nigdy”; _pinned ≠ rejestr — gwiazdka starszej aplikacji', () => {
    const stan = czesc('function Bgw_stan(', 'function Bgw_porownaj(');
    expect(stan).toContain('return { cz: u, pin: pin, at: pin ? u || null : null };');
    expect(stan).toContain('if (r.pin !== pin) return { cz: zm ? u : c, pin: pin, at: u || null };');
    // Z1, Z2, F-B: odcisk treści — inny: starsza aplikacja zmieniła treść; ten sam przy późniejszej chwili: gwiazdkę.
    expect(stan).toContain('const zm = h ? Bgw_odcisk(t) !== h : null;');
    expect(stan).toContain("if (u > (Bkz_pozniejsza(c, r.at) || '')) return zm === false ? { cz: c, pin: pin, at: u } : { cz: u, pin: pin, at: r.at };");
    expect(czesc('function Bgw_ustaw(', 'function Bgw_nowa(')).toContain('t._pinnedState.h = Bgw_odcisk(t);');
  });
  it('rekord złożony: rev = wyższa z dwóch + 1, chwila = późniejsza z chwil treści i gwiazdki, znacznik zl', () => {
    const scal = czesc('async function Bgw_scal(', 'async function Bsl_scalPacjenta(');
    expect(scal).toContain('rev: Math.max(mt(S), mt(g)) + 1, updatedAtISO: Bkz_pozniejsza(st.cz, rej.at)');
    expect(scal).toContain('{ pin: rej.pin, at: rej.at }, true)');
    expect(czesc('async function Bsl_scalPacjenta(', 'function Bsw_bezNowych(')).toContain('Bkz_wersjaZgodna(S, g) && !Bgw_zlozony(S.payload)');
  });
});
