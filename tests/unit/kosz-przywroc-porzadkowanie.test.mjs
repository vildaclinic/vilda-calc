// E2-PR3c5 (decyzja 7 właściciela z 2026-11-10, P-KOSZ-USUWANEJ-KARTY): wizyta oddana do Kosza, przywrócona, a potem
// usunięta przy porządkowaniu starych wizyt na innym urządzeniu — każde urządzenie przestaje pokazywać ją w Koszu.
//
// Przygotowanie trzyKarty (s4d7-wspolne.mjs): na K karta X z trzema wizytami (s — druga, 125 cm / 23 kg) i karty Y, Z;
// komplet na P i C. Kroki co minutę: P daje s do Kosza, C dostaje kopię P (zna wpis Kosza), P przywraca s (nowa chwila
// zmiany), K — bez wiedzy o obu — przycina s porządkowaniem i robi „Scal pacjentów” X → Y. Potem wymiany pełnych kopii
// albo delta karty X z P.
//
// Na bazie (46f3fe9c) K dostawał wpis Kosza z C i kartę X z P (przegraną tu z nagrobkiem X), a reguła brała wkład wersji
// z ładunku tylko przy wygranej Kosza — wersja przywrócona po Koszu przepadała, wpis zostawał ważnym Koszem ze starą
// treścią, a P po wymianie z K tracił przywróconą wizytę razem z kartą X (karta usuwana też brała wkład tylko przy
// wygranej Kosza): na obu urządzeniach s w Koszu z treścią 23 kg, na stałe. Teraz wersja zmieniona po ważnym Koszu,
// z którą wygrywa późniejsze porządkowanie, oddaje wpisowi zmianę, opis i rejestr gwiazdki (bez treści i bez cienia —
// decyzja 1 z 2026-10-26 bez zmian) — w karcie z ładunku (Bsl_koszZLadunku) i w karcie usuwanej (Bsl_koszUsuwanejKarty):
// s poza Kosza na obu (nagrobek porządkowania rev 1, opis wersji przywróconej).
// Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRZYGOTOWANIA, sztucznyZegar, przesunZegar, zegar, doKosza, przytnij, przypnij, scalPacjentow, stan, krotko, sync } from './s4d7-wspolne.mjs';

afterEach(() => { vi.useRealTimers(); });

async function przygotuj({ porzadkowanie = true, scalenie = true, gwiazdka = false } = {}) {
  sztucznyZegar();
  const u = await PRZYGOTOWANIA.trzyKarty();
  u.dziennik = []; u.warunki = []; u.warunkiBledne = false; u.slad = []; u.t0 = zegar.t;
  przesunZegar(60e3);
  await doKosza(u, 'P');
  await sync(u.P, u.C); przesunZegar(60e3);
  const r = await u.P.restoreTrashedSnapshot(u.X, u.sid); przesunZegar(60e3);
  expect(r && !r.alreadyInCard, 'P: Przywróć zapisuje wersję').toBe(true);
  if (gwiazdka) await przypnij(u, 'P', true);
  if (porzadkowanie) await przytnij(u, 'K');
  if (scalenie) await scalPacjentow(u, 'K', 'X', 'Y');
  expect(u.warunkiBledne, u.warunki.join('; ')).toBe(false);
  return u;
}
// Widok s (karta, Kosz) i nagrobek s: powód, rev, czy ma treść.
async function widok(u, v) {
  const s = await stan(u, v);
  const n = s.nagrobek;
  return `${krotko(s, true)}${n ? ` | ${n.powod === 'retencja' ? 'porządkowanie' : 'kosz'} rev ${n.rev}${n.masa != null ? ` treść ${n.masa}` : ''}` : ''}`;
}
const PORZADKOWANIE = 'brak | porządkowanie rev 1';

describe('E2-PR3c5 — Kosz po przywróceniu i porządkowaniu na innym urządzeniu', () => {
  it('[czerwony na bazie] K dostaje najpierw wpis Kosza z C, potem kopię P: K od razu bez s w Koszu, P po wymianie z K tak samo; stan stały', async () => {
    const u = await przygotuj();
    await sync(u.C, u.K);
    expect(await widok(u, u.K), 'K zna Kosz z C (wizyta jeszcze w Koszu)').toBe('kosz 23 | kosz rev 0 treść 23');
    await sync(u.P, u.K);
    expect(await widok(u, u.K), 'K po kopii P').toBe(PORZADKOWANIE);
    await sync(u.K, u.P);
    expect(await widok(u, u.P), 'P po kopii K').toBe(PORZADKOWANIE);
    const przed = [await widok(u, u.P), await widok(u, u.K)];
    for (const [z, na] of [['P', 'K'], ['K', 'P'], ['C', 'K'], ['K', 'C']]) await sync(u[z], u[na]);
    expect([await widok(u, u.P), await widok(u, u.K), await widok(u, u.C)], 'stan stały, także C').toEqual([...przed, PORZADKOWANIE]);
  });

  it('[czerwony na bazie] K dostaje najpierw kopię P, potem wpis Kosza z C: P bez s w Koszu po wymianie z K, K po następnej kopii P', async () => {
    const u = await przygotuj();
    await sync(u.P, u.K); await sync(u.C, u.K);
    expect(await widok(u, u.K), 'K: wpis Kosza z C (wersji przywróconej K już nie ma)').toBe('kosz 23 | kosz rev 0 treść 23');
    await sync(u.K, u.P);
    expect(await widok(u, u.P), 'P po kopii K (karta X usuwana z wersją przywróconą)').toBe(PORZADKOWANIE);
    await sync(u.P, u.K);
    expect(await widok(u, u.K), 'K po kopii P').toBe(PORZADKOWANIE);
  });

  it('[czerwony na bazie] delta: K zna wpis Kosza z C, potem dostaje samą kartę X z P — od razu bez s w Koszu', async () => {
    const u = await przygotuj();
    await sync(u.C, u.K);
    const lad = await u.P.exportSyncPayload();
    const karta = { ...lad, patients: lad.patients.filter((p) => p.patientId === u.X), tombstones: [], snapshotTombstones: [],
      notes: [], noteTombstones: [], patientNotes: [], patientNoteTombstones: [] };
    await u.K.mergeSyncPayload(JSON.parse(JSON.stringify(karta)));
    expect(await widok(u, u.K)).toBe(PORZADKOWANIE);
    await sync(u.K, u.P);
    expect(await widok(u, u.P)).toBe(PORZADKOWANIE);
  });

  it('[kontrola] bez „Scal pacjentów”: s poza Koszem na obu (jak na bazie)', async () => {
    const u = await przygotuj({ scalenie: false });
    await sync(u.C, u.K); await sync(u.P, u.K); await sync(u.K, u.P); await sync(u.P, u.K);
    expect([await widok(u, u.P), await widok(u, u.K)]).toEqual([PORZADKOWANIE, PORZADKOWANIE]);
  });

  // Znane ograniczenie P-KOSZ-USUWANEJ-KARTY (E4a-kp, bez zmian): późniejsza zmiana niż Kosz (tu „Przywróć” albo
  // gwiazdka) przegrywa ze „Scal pacjentów” na innym urządzeniu — wpis Kosza wskazuje starą kartę X, a żadne urządzenie
  // nie zna karty docelowej. Przypięta wizyta przeżywa porządkowanie, więc reguła wyżej jej nie dotyczy.
  it('[znane ograniczenie, jak na bazie] przywrócona i przypięta na P: po wymianach s w Koszu na obu (treść 23 kg)', async () => {
    const u = await przygotuj({ gwiazdka: true });
    await sync(u.C, u.K); await sync(u.P, u.K); await sync(u.K, u.P); await sync(u.P, u.K);
    expect([await widok(u, u.P), await widok(u, u.K)]).toEqual(['kosz 23 | kosz rev 0 treść 23', 'kosz 23 | kosz rev 0 treść 23']);
  });
  it('[znane ograniczenie, jak na bazie] bez porządkowania: wynik zależy od kolejności (Kosz albo karta Y)', async () => {
    const wyniki = [];
    for (const najpierwC of [true, false]) {
      const u = await przygotuj({ porzadkowanie: false });
      if (najpierwC) { await sync(u.C, u.K); await sync(u.P, u.K); } else { await sync(u.P, u.K); await sync(u.C, u.K); }
      await sync(u.K, u.P); await sync(u.P, u.K);
      wyniki.push([await widok(u, u.P), await widok(u, u.K)]);
      vi.useRealTimers();
    }
    expect(wyniki).toEqual([['kosz 23 | kosz rev 1 treść 23', 'kosz 23 | kosz rev 1 treść 23'], ['karta Y 23', 'karta Y 23']]);
  });
});
