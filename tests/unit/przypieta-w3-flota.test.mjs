// P-PRZYPIETA-POLKRATA (S4, W3) — testy regresji ze zgłoszeń panelu sędziów (2026-10-22): flota mieszana
// z tests/fixtures/vilda_vault-221.js.txt (starsza aplikacja, D11 = a), aktualizacja z danymi sprzed W3, rozjazd zegarów,
// błąd zapisu kosza, zapis z nieaktualnej kopii okna poprawki. Każdy przypadek: kroki lokalne bez synchronizacji (1 min
// po sobie), 8 kolejności pierwszych scaleń, 3 rundy pełnej wymiany i runda kontrolna bez zapisów. Prawdziwy
// vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane wyłącznie fikcyjne („Testowy Jan”, wizyta 103 cm / 23 kg).
// Uprząż: polkrata-uprzaz.mjs. Identyfikatory zgłoszeń (Z1, F-B…) — w nawiasach, opis w docs/clinical/ALGORITHMS.md
// (P-PRZYPIETA-POLKRATA). Na końcu pliku przegląd 2 (2026-10-22): gałęzie bez testu zachowania (R2P-4) i znane
// ograniczenia floty mieszanej (R2P-1, R2P-2, R2P-3, R2-K2, R2-K3) — do decyzji właściciela.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  zegar, sztucznyZegar, przesunZegar, urzadzenia, sync, rundy, widoki, poprawMase, przypnij, przytnij, zeruj, zapisy, gdzie,
  aktualizuj, doKosza,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const KOLEJNOSCI_8 = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P'];
const krok = async (fn) => { await fn(); przesunZegar(M); };
// Sztuczny zegar wspólny dla pliku idzie naprzód: każdy przebieg zaczyna o 9:00 UTC (12 wizyt „Testowego Jana” co minutę
// i kroki mieszczą się w jednym dniu — retencja zostawia ostatnią wersję dnia, więc przejście przez północ psuło przycięcie).
function zegarRano() {
  const d = new Date(zegar.t);
  if (d.getUTCHours() >= 9 && d.getUTCHours() < 12) { sztucznyZegar(); return; }
  zegar.t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 9);
  sztucznyZegar();
}

// Jeden przebieg: kroki, pierwsze scalenia w kolejności kol, 3 rundy, opcjonalnie poRundach (+3 rundy); widoki
// i liczba zapisów w rundzie kontrolnej.
async function przebieg(flota, kroki, kol, opcje = {}) {
  zegarRano();
  const urz = await urzadzenia(opcje.nazwy || ['P', 'K', 'C'], flota);
  const { u, sid } = urz;
  przesunZegar(M);
  await kroki(u, sid, urz);
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  const lista = () => Object.values(u);
  await rundy(lista(), 3);
  if (opcje.poRundach) { await opcje.poRundach(u, sid); await rundy(lista(), 3); }
  const w = await widoki(u, sid);
  zeruj(lista()); await rundy(lista(), 1);
  const zap = Object.values(zapisy(lista())).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0);
  return { w, zap };
}
// Ten sam widok cel na każdym urządzeniu w każdej z 8 kolejności i 0 zapisów w rundzie kontrolnej.
function wszedzie(nazwa, flota, kroki, cel, opcje = {}) {
  it(`${nazwa} → ${cel} w 8 kolejnościach`, async () => {
    const zle = [];
    for (const kol of KOLEJNOSCI_8) {
      const r = await przebieg(flota, kroki, kol, opcje);
      if (Object.values(r.w).some((x) => x !== cel) || r.zap) zle.push(`${kol}: ${JSON.stringify(r.w)} zapisy ${r.zap}`);
    }
    expect(zle).toEqual([]);
  }, 240_000);
}

describe('W3 z odciskiem treści: zmiana gwiazdki i poprawka zrobione razem przez starszą aplikację (Z1, F-B, Z2)', () => {
  // Starsza aplikacja kopiuje treść w całości razem z polami W3 nowej aplikacji. Bez odcisku jej poprawka zrobiona razem
  // ze zmianą gwiazdki dostawała chwilę treści z pola (sprzed poprawki) i po cichu przegrywała z wcześniejszą poprawką
  // z nowego urządzenia — także na urządzeniu, które ją wpisało (P-POZNIEJSZA-POPRAWKA). Flota samych 221: jak cel.
  const P221 = { P: 'S221' }, C221 = { C: 'S221' };
  wszedzie('Z1a: C 74; P (221) poprawia 58, potem przypina', P221, async (u, s) => {
    await krok(() => poprawMase(u.C, s, 74)); await krok(() => poprawMase(u.P, s, 58)); await krok(() => przypnij(u.P, s, true));
  }, 'karta 58*');
  wszedzie('Z1b: C 74; P (221) przypina, potem poprawia 58', P221, async (u, s) => {
    await krok(() => poprawMase(u.C, s, 74)); await krok(() => przypnij(u.P, s, true)); await krok(() => poprawMase(u.P, s, 58));
  }, 'karta 58*');
  wszedzie('Z1c: gwiazdka K na trzech; C 74; P (221) poprawia 58 i odpina', P221, async (u, s) => {
    await krok(async () => { await przypnij(u.K, s, true); await sync(u.K, u.P); await sync(u.K, u.C); });
    await krok(() => poprawMase(u.C, s, 74)); await krok(() => poprawMase(u.P, s, 58)); await krok(() => przypnij(u.P, s, false));
  }, 'karta 58');
  wszedzie('F-B B1: C (221) przypina; P bez wiedzy 58; C później 74', C221, async (u, s) => {
    await krok(() => przypnij(u.C, s, true)); await krok(() => poprawMase(u.P, s, 58)); await krok(() => poprawMase(u.C, s, 74));
  }, 'karta 74*');
  wszedzie('F-B B2: gwiazdka P na trzech; C (221) odpina; P bez wiedzy 58; C później 74', C221, async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.C); await sync(u.P, u.K); });
    await krok(() => przypnij(u.C, s, false)); await krok(() => poprawMase(u.P, s, 58)); await krok(() => poprawMase(u.C, s, 74));
  }, 'karta 74');
  wszedzie('F-B U3: P 58; C (221) 74, potem przypina', C221, async (u, s) => {
    await krok(() => poprawMase(u.P, s, 58)); await krok(() => poprawMase(u.C, s, 74)); await krok(() => przypnij(u.C, s, true));
  }, 'karta 74*');
  wszedzie('F-B U4: C (221) przypina i wysyła; P zna gwiazdkę i poprawia 58; C 74 przed pobraniem', C221, async (u, s) => {
    await krok(async () => { await przypnij(u.C, s, true); await sync(u.C, u.P); await sync(u.C, u.K); });
    await krok(() => poprawMase(u.P, s, 58)); await krok(() => poprawMase(u.C, s, 74));
  }, 'karta 74*');
  wszedzie('kontrola F-B B3: P 58; C (221) później 74, bez gwiazdki', C221, async (u, s) => {
    await krok(() => poprawMase(u.P, s, 58)); await krok(() => poprawMase(u.C, s, 74));
  }, 'karta 74');
  // Z2: przypięcie i odpięcie starszej aplikacji, kopia z gwiazdką na K i C — odpięcie późniejsze wygrywa (odcisk ten sam:
  // starsza aplikacja wróciła do stanu rejestru).
  wszedzie('Z2a: P (221) przypina, kopie na K i C, P odpina', P221, async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.K); await sync(u.P, u.C); });
    await krok(() => przypnij(u.P, s, false));
  }, 'karta 23');
  wszedzie('kontrola Z2: przypina nowa K, odpina P (221)', P221, async (u, s) => {
    await krok(async () => { await przypnij(u.K, s, true); await sync(u.K, u.P); await sync(u.K, u.C); });
    await krok(() => przypnij(u.P, s, false));
  }, 'karta 23');
});

describe('W3: poprawka z okna otwartego przed synchronizacją nie zmienia gwiazdki (Z7, K4)', () => {
  // Okno „Popraw pomiar” (vilda_auth_ui.js) czyta treść przy otwarciu i zapisuje jej kopię JSON z nową masą. Gwiazdka albo
  // odpięcie z innego urządzenia scalone w tym czasie nie może zniknąć przy zapisie: rejestr gwiazdki zapisanej wersji,
  // nie _pinned z kopii okna (dotąd jawne odpięcie albo przypięcie z chwilą zapisu — wizyta traciła ochronę przed
  // retencją; tak samo na f612fe09 i 221).
  const otworz = async (v, s) => JSON.parse(JSON.stringify((await gdzie(v, s)).s.payload));
  const zapiszZOkna = async (v, s, kopia, kg) => {
    const g = await gdzie(v, s);
    await v.updateSnapshotPayload(g.pid, s, { ...kopia, user: { ...kopia.user, weight: kg } }, { preserveSavedAt: true });
  };
  const z7 = async (u, s) => {
    const kopia = await otworz(u.P, s); przesunZegar(M);
    await krok(() => przypnij(u.K, s, true)); await krok(() => sync(u.K, u.P));
    await krok(() => zapiszZOkna(u.P, s, kopia, 58));
  };
  wszedzie('Z7: P otwiera okno; K przypina, gwiazdka dochodzi do P; P zapisuje 58 z okna', {}, z7, 'karta 58*');
  wszedzie('Z7 z retencją C (bez wiedzy o gwiazdce): wizyta przypięta przeżywa', {}, async (u, s) => {
    await z7(u, s); await krok(() => przytnij(u.C, s));
  }, 'karta 58*');
  wszedzie('Z7 odwrotnie: wizyta przypięta na trzech; P otwiera okno; K odpina, odpięcie dochodzi do P; P zapisuje 58', {}, async (u, s) => {
    await krok(async () => { await przypnij(u.K, s, true); await sync(u.K, u.P); await sync(u.K, u.C); });
    const kopia = await otworz(u.P, s); przesunZegar(M);
    await krok(() => przypnij(u.K, s, false)); await krok(() => sync(u.K, u.P));
    await krok(() => zapiszZOkna(u.P, s, kopia, 58));
  }, 'karta 58');
  wszedzie('kontrola: gwiazdka K dochodzi do P po zapisie z okna', {}, async (u, s) => {
    const kopia = await otworz(u.P, s); przesunZegar(M);
    await krok(() => przypnij(u.K, s, true)); await krok(() => zapiszZOkna(u.P, s, kopia, 58));
  }, 'karta 58*');
});

describe('W3: chwila treści wpisu kosza starszej aplikacji po aktualizacji — z treści (Z4)', () => {
  // C poprawia 37 i wysyła K; P (221) przypina swoją kopię (23); K bez wiedzy daje do kosza; rundy; aktualizacja P.
  // Wpis kosza zapisany na P przez 221 nie ma składników ani trescISO: chwila treści z opisu (chwila gwiazdki P) była
  // późniejsza niż ta sama treść z ładunku na K i C — kosz rozjeżdżał się na stałe (P 23*, K i C 37*).
  const z4 = async (u, s) => {
    await krok(async () => { await poprawMase(u.C, s, 37); await sync(u.C, u.K); });
    await krok(() => przypnij(u.P, s, true)); await krok(() => doKosza(u.K, s));
  };
  // Treść kosza — 37 na trzech w każdej kolejności. Gwiazdka w koszu (niewidoczna w liście kosza, liczy się przy
  // „Przywróć”): rejestr kosza starszej aplikacji jest „nieznany” (W20, F-A), więc gdy P (221) zamieni swoją przypiętą
  // wersję na wpis kosza, zanim K albo C ją zobaczą, gwiazdka ginie — 4 z 8 kolejności (znane ograniczenie floty mieszanej).
  it('Z4: po aktualizacji P jeden kosz na trzech (kosz 37, z gwiazdką albo bez — ta sama na urządzeniach)', async () => {
    const zle = [], gw = [];
    for (const kol of KOLEJNOSCI_8) {
      const r = await przebieg({ P: 'S221' }, z4, kol, { poRundach: async (u) => { u.P = await aktualizuj(u.P, 'N'); } });
      const w = new Set(Object.values(r.w));
      if (w.size !== 1 || ![...w][0].startsWith('kosz 37') || r.zap) zle.push(`${kol}: ${JSON.stringify(r.w)} zapisy ${r.zap}`);
      gw.push([...w][0].endsWith('*'));
    }
    expect(zle).toEqual([]);
    expect(gw.filter(Boolean).length, 'kolejności z gwiazdką w koszu').toBe(4);
  }, 240_000);
  it('Z4D: czwarte urządzenie (offline od początku) przypina wizytę po aktualizacji P — wraca 37*, nie 23*', async () => {
    const zle = [];
    for (const kol of KOLEJNOSCI_8) {
      zegarRano();
      const { u, sid } = await urzadzenia(['P', 'K', 'C', 'D'], { P: 'S221' });
      przesunZegar(M); await z4(u, sid);
      for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
      await rundy([u.P, u.K, u.C], 3);
      u.P = await aktualizuj(u.P, 'N');
      await rundy([u.P, u.K, u.C], 3);
      await krok(() => przypnij(u.D, sid, true));
      await sync(u.D, u.P);
      await rundy([u.P, u.K, u.C, u.D], 4);
      const w = await widoki(u, sid);
      if (Object.values(w).some((x) => x !== 'karta 37*')) zle.push(`${kol}: ${JSON.stringify(w)}`);
    }
    expect(zle).toEqual([]);
  }, 240_000);
});

describe('W3: „Odepnij i usuń” w starszej aplikacji — rejestr nagrobka tylko z pola gwiazdka (F-A, K3, D2 = a)', () => {
  // Kosz starszej aplikacji nie ma pola gwiazdka, a jego treść ma _pinned: true. Czytana jako przypięcie robiła ze
  // świadomie usuniętej wizyty przypiętą (T4 5/8 karta 74*, T4b 5/8 karta 23*). Teraz brak pola = „nieznany”, jak we
  // flocie samych 221 i na f612fe09: T4 — 74 bez gwiazdki, T4b — brak.
  const P221 = { P: 'S221' };
  const t4 = async (u, s) => {
    await krok(() => przypnij(u.P, s, true)); await krok(() => doKosza(u.P, s)); await krok(() => poprawMase(u.C, s, 74));
  };
  wszedzie('T4: P (221) przypina i „Odepnij i usuń”; C bez wiedzy poprawia 74', P221, t4, 'karta 74');
  wszedzie('T4b: jak T4, C potem przycina', P221, async (u, s) => { await t4(u, s); await krok(() => przytnij(u.C, s)); }, 'brak');
  // Znane ograniczenie (ALGORITHMS, „Flota mieszana”): gdy inne urządzenie ma kopię z gwiazdką ze starszej aplikacji,
  // jej odpięcia nie zna nikt (221 go nie zapisuje) — wizyta wraca z gwiazdką (T4K, T4d; f612fe09: 74 / brak albo kosz).
  // Test pilnuje dzisiejszego wyniku; zmiana na cel D2 = a („karta 74” / „brak”) to sygnał do aktualizacji opisu.
  const t4k = async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.K); });
    await krok(() => doKosza(u.P, s)); await krok(() => poprawMase(u.C, s, 74));
  };
  wszedzie('znane ograniczenie T4K: P (221) przypina i wysyła K, „Odepnij i usuń” na P; C poprawia 74', P221, t4k, 'karta 74*');
  wszedzie('znane ograniczenie T4d: jak T4K, C potem przycina', P221, async (u, s) => { await t4k(u, s); await krok(() => przytnij(u.C, s)); }, 'karta 23*');
});

describe('W3: wersje bez pól W3 (dane sprzed W3) — odpięcie starszej aplikacji (K2 MU1, Z3, Z2)', () => {
  // Cała flota na 221 (wizyty bez pól W3): P przypina i wysyła K i C, potem odpina bez synchronizacji. Odczyt bez pól
  // („nieprzypięta — nigdy jawnie”) dawał starej kopii z gwiazdką późniejszy rejestr i rekord złożony 23* na wszystkich
  // urządzeniach, także na P. Teraz ta sama treść poza _pinned — cała nowsza wersja, jak we flocie 221 i na f612fe09.
  const S221 = { P: 'S221', K: 'S221', C: 'S221' };
  const przypnijOdepnij = async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.K); await sync(u.P, u.C); });
    await krok(() => przypnij(u.P, s, false));
  };
  const zaktualizuj = async (u, nazwy) => { for (const n of nazwy) u[n] = await aktualizuj(u[n], 'N'); };
  wszedzie('Z3 / MU1: odpięcie w drodze, potem aktualizacja P, K i C', S221, async (u, s) => {
    await przypnijOdepnij(u, s); await zaktualizuj(u, ['P', 'K', 'C']);
  }, 'karta 23');
  wszedzie('Z3: odpięcie w drodze, aktualizuje się tylko K', S221, async (u, s) => {
    await przypnijOdepnij(u, s); await zaktualizuj(u, ['K']);
  }, 'karta 23');
  wszedzie('Z2 (dane sprzed W3): K i C zaktualizowane, P (221) przypina, wysyła i odpina', S221, async (u, s) => {
    await zaktualizuj(u, ['K', 'C']); await przypnijOdepnij(u, s);
  }, 'karta 23');
  // Kontrola W3: poprawka starszej aplikacji bez wiedzy o gwiazdce (inna treść) nie zdejmuje gwiazdki.
  wszedzie('kontrola: P (221) przypina i wysyła; C (221) bez wiedzy poprawia 58; aktualizacja wszystkich', S221, async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.K); });
    await krok(() => poprawMase(u.C, s, 58)); await zaktualizuj(u, ['P', 'K', 'C']);
  }, 'karta 58*');
});

describe('W3: poprawka wersji przypiętej bez stempla po przycięciu z zegara do przodu (F-C)', () => {
  // K (zegar +60 min) przycina wizytę przypiętą na P i C; nagrobek retencji zostaje przy przypiętej (A3a). Stempel
  // Bpk_retencjaZapisu dawał każdej zmianie tej wersji chwilę „przycięcie + 1 ms + los”, więc dwie poprawki z dobrych
  // zegarów (P 58 o t+2, C 74 o t+4) traciły kolejność: 58* w 5/8 (C1) i 8/8 (C2); f612fe09 74* w 16/16.
  const przytnijZPrzyszlosci = async (v, s) => { przesunZegar(60 * M); await przytnij(v, s); przesunZegar(-60 * M); };
  const c1 = async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.C); });
    await krok(async () => { await przytnijZPrzyszlosci(u.K, s); await sync(u.K, u.P); await sync(u.K, u.C); });
    await krok(() => poprawMase(u.P, s, 58)); przesunZegar(M); await krok(() => poprawMase(u.C, s, 74));
  };
  wszedzie('C1: P i C znają nagrobek retencji; P 58, C później 74', {}, c1, 'karta 74*');
  wszedzie('C2: nagrobek zna tylko P; P 58, C później 74', {}, async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.C); });
    await krok(async () => { await przytnijZPrzyszlosci(u.K, s); await sync(u.K, u.P); });
    await krok(() => poprawMase(u.P, s, 58)); przesunZegar(M); await krok(() => poprawMase(u.C, s, 74));
  }, 'karta 74*');
  // Znane ograniczenie (rozjazd zegarów, G17/D13): poprawka zrobiona po przycięciu na urządzeniu, które o nim wie, a potem
  // świadome odpięcie na urządzeniu, które go nie zna — chwila odpięcia jest przed chwilą przycięcia z zegara do przodu,
  // więc retencja usuwa wizytę (wcześniej poprawka ze stemplem ją ratowała). Wizyta świadomie odpięta; retencja i tak
  // usunęłaby ją przy następnym zapisie.
  wszedzie('znane ograniczenie G1: P przypina i wysyła C; K (+60 min) przycina i wysyła P; P 58; C (bez nagrobka) odpina', {}, async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.C); });
    await krok(async () => { await przytnijZPrzyszlosci(u.K, s); await sync(u.K, u.P); });
    await krok(() => poprawMase(u.P, s, 58)); await krok(() => przypnij(u.C, s, false));
  }, 'brak');
});

describe('W3: dwa różne rekordy złożone z tą samą rev i chwilą a starsza aplikacja (F-D)', () => {
  // K poprawia 37, C 41 (później), P przypina po obu; K i C składają osobno rekordy złożone 37* i 41* (rev 2, ta sama
  // chwila). Starsza aplikacja O, która dostanie najpierw 37*, przy remisie rev i chwili zostawała przy nim na stałe
  // (P, K, C: 41*, O: 37*). Teraz zwycięzca dostaje rev + 1 i O go przyjmuje.
  async function jeden(nazwy, flota, kroki) {
    zegarRano();
    const { u, lista, sid } = await urzadzenia(nazwy, flota);
    await kroki(u, sid);
    await rundy(lista, 3);
    const w = await widoki(u, sid);
    zeruj(lista); await rundy(lista, 1);
    return { w, zap: Object.values(zapisy(lista)).reduce((a, z) => a + z.lista + z.wersje + z.karty, 0) };
  }
  const dwieIGwiazdka = async (u, s, kto) => {
    przesunZegar(M); await poprawMase(u.K, s, 37);
    przesunZegar(M); await poprawMase(u.C, s, 41);
    przesunZegar(M); await przypnij(u[kto], s, true);
    przesunZegar(M);
  };
  it('F-D: cztery urządzenia, O (221) dostaje najpierw 37* z K, potem 41* z C', async () => {
    const r = await jeden(['P', 'K', 'C', 'O'], { O: 'S221' }, async (u, s) => {
      await dwieIGwiazdka(u, s, 'P');
      await sync(u.P, u.K); await sync(u.P, u.C); await sync(u.K, u.O); await sync(u.C, u.O);
    });
    expect(r).toEqual({ w: { P: 'karta 41*', K: 'karta 41*', C: 'karta 41*', O: 'karta 41*' }, zap: 0 });
  }, 120_000);
  it('F-D: trzy urządzenia, gwiazdkę stawia starsza aplikacja O (221)', async () => {
    const r = await jeden(['K', 'C', 'O'], { O: 'S221' }, async (u, s) => {
      await dwieIGwiazdka(u, s, 'O');
      await sync(u.O, u.K); await sync(u.O, u.C); await sync(u.K, u.O); await sync(u.K, u.C); await sync(u.C, u.O);
    });
    expect(r).toEqual({ w: { K: 'karta 41*', C: 'karta 41*', O: 'karta 41*' }, zap: 0 });
  }, 120_000);
  it('F-D, flota nowych: ten sam przebieg bez starszej aplikacji — 41* na czterech', async () => {
    const r = await jeden(['P', 'K', 'C', 'O'], {}, async (u, s) => {
      await dwieIGwiazdka(u, s, 'P');
      await sync(u.P, u.K); await sync(u.P, u.C); await sync(u.K, u.O); await sync(u.C, u.O);
    });
    expect(r).toEqual({ w: { P: 'karta 41*', K: 'karta 41*', C: 'karta 41*', O: 'karta 41*' }, zap: 0 });
  }, 120_000);
});

describe('W3: „Odepnij i usuń” z nieudanym zapisem kosza — zapis wraca przypięty (F-F)', () => {
  // Odpięcie jest zapisane przed koszem (D2 = a). Gdy zapis listy nagrobków się nie uda (brak miejsca w IndexedDB,
  // utrata połączenia), wersja zostawała odpięta mimo komunikatu „Karta jest bez zmian”, a odpięcie szło w synchronizacji —
  // retencja usuwała potem wizytę bez kosza na wszystkich urządzeniach (f612fe09: karta 23* i retencja jej nie tnie).
  async function zBledemKosza(blednaPrzypinka) {
    zegarRano();
    const { u, sid } = await urzadzenia(['P', 'K']);
    przesunZegar(M); await przypnij(u.K, sid, true); await sync(u.K, u.P); przesunZegar(M);
    const px = u.K.__px;
    const meta = px.putUserMeta, wersja = px.putSnapshotForUser;
    let poBledzie = false;
    px.putUserMeta = async function (uid, m) {
      if (((m && m.snapshotTombstones) || []).some((e) => e.snapshotId === sid)) { poBledzie = true; throw new Error('QuotaExceededError (symulowany)'); }
      return meta.call(this, uid, m);
    };
    px.putSnapshotForUser = async function (...a) {
      if (poBledzie && blednaPrzypinka) throw new Error('Connection to Indexed Database server lost (symulowany)');
      return wersja.apply(this, a);
    };
    let kod = null;
    try { await doKosza(u.K, sid); } catch (e) { kod = e.code || e.message; }
    px.putUserMeta = meta; px.putSnapshotForUser = wersja;
    const poBledzieWidok = (await widoki(u, sid)).K;
    przesunZegar(M); await sync(u.K, u.P); await sync(u.P, u.K);
    przesunZegar(M);
    for (const n of ['K', 'P']) { const g = await gdzie(u[n], sid); await u[n].pruneSnapshotsForPatient(g.pid, { recentHours: 0 }); }
    await sync(u.K, u.P); await sync(u.P, u.K);
    return { kod, poBledzieWidok, w: await widoki(u, sid) };
  }
  it('F-F: błąd zapisu kosza — K pokazuje błąd (wyjątek magazynu idzie dalej, okno: „Karta jest bez zmian”), zapis przypięty na K i P, retencja go nie usuwa', async () => {
    expect(await zBledemKosza(false)).toEqual({ kod: 'QuotaExceededError (symulowany)', poBledzieWidok: 'karta 23*', w: { P: 'karta 23*', K: 'karta 23*' } });
  }, 120_000);
  it('F-F: zawodzi też ponowne przypięcie — prawdziwy komunikat „kosz-odpiety” (zapis w karcie, odpięty)', async () => {
    const r = await zBledemKosza(true);
    expect({ kod: r.kod, po: r.poBledzieWidok }).toEqual({ kod: 'kosz-odpiety', po: 'karta 23' });
  }, 120_000);
});

// Przegląd 2 (2026-10-22, R2P-4): gałęzie poprawek panelu, których nie pilnował żaden test zachowania — mutant jednej
// gałęzi przeżywał wszystkie 69 plików testów sejfu. Każdy przypadek: zielony na vilda_vault.js, czerwony na mutancie
// opisanym w komentarzu.
describe('Przegląd 2: ścieżka K1 przy wpisie kosza po starszej aplikacji (Z4, R2P-4)', () => {
  // C 74, K 58; C przypina i „Odepnij i usuń”; P (bez wiedzy) „Usuń”. P cofnięte do 221 (D10: cofnięcie wydania, stara
  // karta przeglądarki) dostaje kosz C — 221 zmienia pola wpisu i przenosi Bpk bez zmian (odcisk niezgodny, ścieżka K1).
  // Po powrocie P na nową aplikację chwila treści takiego wpisu musi przyjść z odszyfrowanej treści (Bgw_przygotujCz
  // także dla wpisów z Bpk). Mutant bez tego: P „kosz 74”, K i C „kosz 58” na stałe (5/5 kolejności, 0 zapisów).
  const KOL = ['K←P', 'P←K', 'C←P', 'P←C,K←P', 'K←C,P←K'];
  it('T-K1: kosz 58 na trzech w 5 kolejnościach, wpis P idzie ścieżką K1', async () => {
    const zle = [];
    for (const kol of KOL) {
      zegarRano();
      const { u, sid } = await urzadzenia(['P', 'K', 'C']);
      przesunZegar(M); await poprawMase(u.C, sid, 74);
      przesunZegar(M); await poprawMase(u.K, sid, 58);
      przesunZegar(M); await przypnij(u.C, sid, true);
      przesunZegar(M); await doKosza(u.C, sid);
      przesunZegar(M); await doKosza(u.P, sid);
      przesunZegar(M); u.P = await aktualizuj(u.P, 'S221');
      await sync(u.C, u.P);
      const meta = await u.P.__px.getUserMeta(u.P.__uid);
      const wpis = (meta.snapshotTombstones || []).find((e) => e.snapshotId === sid);
      przesunZegar(M); u.P = await aktualizuj(u.P, 'N');
      for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
      const lista = [u.P, u.K, u.C];
      await rundy(lista, 3);
      const w = await widoki(u, sid);
      zeruj(lista); await rundy(lista, 1);
      const zap = Object.values(zapisy(lista)).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0);
      if (!(wpis && wpis.Bpk) || zap || Object.values(w).some((x) => x !== 'kosz 58')) zle.push(`${kol}: K1 ${!!(wpis && wpis.Bpk)} ${JSON.stringify(w)} zapisy ${zap}`);
    }
    expect(zle).toEqual([]);
  }, 240_000);
});

describe('Przegląd 2: „Odepnij i usuń”, gdy zapis zmienił się w trakcie — wraca przypięty (F-F, R2P-4)', () => {
  // Między zapisem kosza a usunięciem wersji inna karta przeglądarki albo scalanie bez blokady podnosi wersję: sejf
  // odpowiada kodem 'zmieniony' (okno otwiera się od nowa) i przypina zapis z powrotem. Mutant bez ponownego przypięcia
  // przy 'zmieniony': zapis zostaje odpięty, a retencja usuwa go potem bez kosza na obu urządzeniach.
  it('T-G: kod „zmieniony”, karta 23* na K i P, retencja jej nie tnie', async () => {
    zegarRano();
    const { u, sid, pid } = await urzadzenia(['P', 'K']);
    przesunZegar(M); await przypnij(u.K, sid, true); await sync(u.K, u.P); przesunZegar(M);
    const px = u.K.__px, meta = px.putUserMeta;
    let raz = false;
    px.putUserMeta = async function (uid, m) {
      const r = await meta.call(this, uid, m);
      if (!raz && ((m && m.snapshotTombstones) || []).some((e) => e.snapshotId === sid && e.payloadCipher)) {
        raz = true;
        const s = (await px.listSnapshotsForUser(uid, pid)).find((x) => x.snapshotId === sid);
        await px.putSnapshotForUser(uid, { ...s, rev: (s.rev || 0) + 1, updatedAtISO: new Date(Date.parse(s.updatedAtISO) + 5).toISOString() });
      }
      return r;
    };
    let kod = null;
    try { await doKosza(u.K, sid); } catch (e) { kod = e.code || e.message; }
    px.putUserMeta = meta;
    const po = (await widoki(u, sid, ['K'])).K;
    przesunZegar(M); await sync(u.K, u.P); await sync(u.P, u.K); przesunZegar(M);
    for (const n of ['K', 'P']) { const g = await gdzie(u[n], sid); if (g) await u[n].pruneSnapshotsForPatient(g.pid, { recentHours: 0 }); }
    await sync(u.K, u.P); await sync(u.P, u.K);
    expect({ kod, po, w: await widoki(u, sid) }).toEqual({ kod: 'zmieniony', po: 'karta 23*', w: { P: 'karta 23*', K: 'karta 23*' } });
  }, 120_000);
});

describe('Przegląd 2: okno poprawki otwarte przed gwiazdką i przycięcie z zegara do przodu (F-C × Z7, R2P-4)', () => {
  // P otwiera okno „Popraw pomiar”; C przypina i wysyła P; K (zegar +60 min) przycina i wysyła P i C; P zapisuje 58
  // z okna (kopia sprzed gwiazdki); C 2 min później 74. Poprawka wersji, która po zapisie zostaje przypięta, nie dostaje
  // stempla „po przycięciu” — decyduje gwiazdka zapisanej wersji, nie _pinned z kopii okna. Mutant (przypietaPo
  // z treści okna): 58* w 8 z 8 — późniejsza poprawka 74 ginie.
  wszedzie('T-FCZ7: okno P przed gwiazdką C; K (+60 min) przycina; P 58 z okna; C później 74', {}, async (u, s) => {
    const okno = JSON.parse(JSON.stringify((await gdzie(u.P, s)).s.payload)); przesunZegar(M);
    await krok(async () => { await przypnij(u.C, s, true); await sync(u.C, u.P); });
    await krok(async () => { przesunZegar(60 * M); await przytnij(u.K, s); przesunZegar(-60 * M); await sync(u.K, u.P); await sync(u.K, u.C); });
    await krok(async () => { const g = await gdzie(u.P, s); await u.P.updateSnapshotPayload(g.pid, s, { ...okno, user: { ...okno.user, weight: 58 } }, { preserveSavedAt: true }); });
    przesunZegar(M); await krok(() => poprawMase(u.C, s, 74));
  }, 'karta 74*');
});

describe('Przegląd 2: zwycięzca F-D ma prawdziwą chwilę rekordu, nie „teraz” (D3 = a, R2P-4)', () => {
  // K 37, C 41, P zmienia gwiazdkę i wysyła K i C — każde składa osobno rekord złożony (ta sama rev i chwila); P bez
  // synchronizacji zmienia gwiazdkę jeszcze raz; K←C (F-D). Chwila zmiany zwycięzcy F-D = chwila rekordów złożonych.
  // Mutant („teraz”): odczyt bierze ją za potwierdzenie gwiazdki w tej chwili i późniejsza zmiana gwiazdki z P przegrywa.
  async function fd(odwrotnie) {
    zegarRano();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    if (odwrotnie) { przesunZegar(M); await przypnij(u.P, sid, true); await sync(u.P, u.K); await sync(u.P, u.C); }
    przesunZegar(M); await poprawMase(u.K, sid, 37);
    przesunZegar(M); await poprawMase(u.C, sid, 41);
    przesunZegar(M); await przypnij(u.P, sid, !odwrotnie);
    const chwila = (await gdzie(u.P, sid)).s.updatedAtISO;
    przesunZegar(M); await sync(u.P, u.K); await sync(u.P, u.C);
    przesunZegar(M); await przypnij(u.P, sid, odwrotnie);
    przesunZegar(M); await sync(u.C, u.K); // F-D na K
    const k = (await gdzie(u.K, sid)).s;
    const poFD = { masa: k.payload.user.weight, pin: !!k.pinned, chwila: k.updatedAtISO === chwila };
    przesunZegar(M);
    const lista = [u.P, u.K, u.C];
    await rundy(lista, 3);
    if (odwrotnie) { przesunZegar(M); const g = await gdzie(u.K, sid); await u.K.pruneSnapshotsForPatient(g.pid, { recentHours: 0 }); await rundy(lista, 3); }
    const w = await widoki(u, sid);
    zeruj(lista); await rundy(lista, 1);
    return { poFD, w, zap: Object.values(zapisy(lista)).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0) };
  }
  it('F-D a: P przypina i wysyła, potem odpina offline — karta 41 na trzech (mutant: 41*)', async () => {
    expect(await fd(false)).toEqual({ poFD: { masa: 41, pin: true, chwila: true }, w: { P: 'karta 41', K: 'karta 41', C: 'karta 41' }, zap: 0 });
  }, 120_000);
  it('F-D b: P odpina i wysyła, potem przypina offline; K przycina — karta 41* na trzech (mutant: brak, bez kosza)', async () => {
    expect(await fd(true)).toEqual({ poFD: { masa: 41, pin: false, chwila: true }, w: { P: 'karta 41*', K: 'karta 41*', C: 'karta 41*' }, zap: 0 });
  }, 120_000);
});

describe('Przegląd 2: odcisk treści — przypięcie i odpięcie starszej aplikacji po poprawce z innego urządzenia (Z2, R2P-1)', () => {
  // K poprawia 33; P (221) bez wiedzy przypina i odpina (treść bez zmian — odcisk ten sam: rejestr odpięcia w chwili
  // zmiany, chwila treści z pola); potem K przypina. Treść 33 z K jest późniejsza niż treść P, gwiazdka K późniejsza niż
  // odpięcie P: 33*. Wariant „ten sam odcisk = zmiana treści w chwili zmiany” (proponowany na T-E) daje 23*: poprawka K
  // ginie, także ponad flotę samych 221 (fuzz floty, ziarno 15).
  wszedzie('Z2b: K 33; P (221) bez wiedzy przypina i odpina; K przypina', { P: 'S221' }, async (u, s) => {
    await krok(() => poprawMase(u.K, s, 33));
    await krok(() => przypnij(u.P, s, true)); await krok(() => przypnij(u.P, s, false));
    await krok(() => przypnij(u.K, s, true));
  }, 'karta 33*');
});

// Znane ograniczenia floty mieszanej po przeglądzie 2 (ALGORITHMS, „Ograniczenia, flota mieszana”; decyzja właściciela).
// Testy pilnują dzisiejszego wyniku; zmiana to sygnał do aktualizacji opisu i listy „Do potwierdzenia przez właściciela”.
describe('Znane ograniczenia floty mieszanej (przegląd 2)', () => {
  // R2P-1 / R4 (P-POZNIEJSZA-POPRAWKA): „Przywróć” w starszej aplikacji nie zmienia treści ani gwiazdki (ten sam odcisk),
  // więc liczy się jak potwierdzenie gwiazdki, nie jak zmiana treści w chwili przywrócenia — poprawka 58 z C, zrobiona
  // bez wiedzy o koszu, wygrywa z przywróceniem 23 (f612fe09 i flota samych 221: karta 23).
  wszedzie('znane ograniczenie T-E: K do kosza i wysyła P; C bez wiedzy 58; P (221) „Przywróć”', { P: 'S221' }, async (u, s, urz) => {
    await doKosza(u.K, s); await sync(u.K, u.P); przesunZegar(M);
    await poprawMase(u.C, s, 58); przesunZegar(M);
    await u.P.restoreTrashedSnapshot(urz.pid, s); przesunZegar(M);
  }, 'karta 58');
  it('znane ograniczenie T-E na dwóch urządzeniach: P (221) do kosza i „Przywróć”; K w tym czasie 58', async () => {
    const zle = [];
    for (const kol of ['K←P', 'P←K']) {
      const r = await przebieg({ P: 'S221' }, async (u, s, urz) => {
        await krok(() => doKosza(u.P, s)); await krok(() => poprawMase(u.K, s, 58));
        await krok(() => u.P.restoreTrashedSnapshot(urz.pid, s));
      }, kol, { nazwy: ['P', 'K'] });
      if (Object.values(r.w).some((x) => x !== 'karta 58') || r.zap) zle.push(`${kol}: ${JSON.stringify(r.w)} zapisy ${r.zap}`);
    }
    expect(zle).toEqual([]);
  }, 120_000);
  // R2P-3: zapis starszej aplikacji bez zmiany treści (np. „Edytuj” wiersza z tymi samymi wartościami) — ten sam odcisk,
  // więc rejestr gwiazdki w chwili zapisu: zdejmuje wcześniejsze przypięcie z innego urządzenia (T-D1, wbrew D1 = C)
  // albo cofa świadome odpięcie (T-D2, wbrew D2 = a). f612fe09 i flota samych 221: ten sam wynik (bez regresji wobec
  // wydania).
  wszedzie('znane ograniczenie T-D1: K przypina; P (221) bez wiedzy zapisuje 23 → 23', { P: 'S221' }, async (u, s) => {
    await krok(() => przypnij(u.K, s, true)); await krok(() => poprawMase(u.P, s, 23));
  }, 'karta 23');
  wszedzie('znane ograniczenie T-D2: K przypina i wysyła P; K odpina; P (221) zapisuje 23 → 23', { P: 'S221' }, async (u, s) => {
    await krok(async () => { await przypnij(u.K, s, true); await sync(u.K, u.P); });
    await krok(() => przypnij(u.K, s, false)); await krok(() => poprawMase(u.P, s, 23));
  }, 'karta 23*');
  // R2P-2: dane sprzed W3 w dniu wydania — odpięcie w starszej aplikacji niewysłane przed aktualizacją, kopia z gwiazdką
  // na trzecim urządzeniu i przycięcie na urządzeniu, które przyjęło odpięcie: nagrobek retencji wersji bez pól ma rejestr
  // „nieznany” i uczy się rejestru starej kopii (A3a) — gwiazdka wraca w 7 z 8 kolejności (f612fe09: 23 ×3, brak ×3, 23* ×2).
  it('znane ograniczenie T-F: flota 221; P przypina i wysyła K, C; P odpina; aktualizacja; P→K; K przycina — 23* w 7 z 8', async () => {
    const S221 = { P: 'S221', K: 'S221', C: 'S221' };
    const rozklad = {}; let zap = 0;
    for (const kol of KOLEJNOSCI_8) {
      const r = await przebieg(S221, async (u, s) => {
        await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.K); await sync(u.P, u.C); });
        await krok(() => przypnij(u.P, s, false));
        for (const n of ['P', 'K', 'C']) u[n] = await aktualizuj(u[n], 'N');
        await krok(async () => { await sync(u.P, u.K); await przytnij(u.K, s); });
      }, kol);
      const w = [...new Set(Object.values(r.w))];
      const klucz = w.length === 1 ? w[0] : JSON.stringify(r.w);
      rozklad[klucz] = (rozklad[klucz] || 0) + 1; zap += r.zap;
    }
    expect({ rozklad, zap }).toEqual({ rozklad: { 'karta 23*': 7, brak: 1 }, zap: 0 });
  }, 240_000);
  wszedzie('znane ograniczenie T-F′: jak T-F, ale przycina samo P (jak f612fe09)', { P: 'S221', K: 'S221', C: 'S221' }, async (u, s) => {
    await krok(async () => { await przypnij(u.P, s, true); await sync(u.P, u.K); await sync(u.P, u.C); });
    await krok(() => przypnij(u.P, s, false));
    for (const n of ['P', 'K', 'C']) u[n] = await aktualizuj(u[n], 'N');
    await krok(() => przytnij(u.P, s));
  }, 'karta 23*');
  // R2-K2 (PD-13, F3): rekord złożony dostaje rev = wyższa + 1, a starsza aplikacja porównuje najpierw rev. Gwiazdka i
  // poprawka 37 na dwóch niezsynchronizowanych nowych urządzeniach (rekord złożony 37* r2), potem poprawka 50 offline na
  // starszym (r1), które najpierw pobiera: późniejsza poprawka 50 ginie na wszystkich, także na urządzeniu, które ją
  // wpisało. Flota samych 221: 50 (wcześniejsza 37 i gwiazdka giną tam zamiast niej).
  async function r2k2(flota, stary) {
    const [A, B] = ['P', 'K', 'C'].filter((n) => n !== stary);
    zegarRano();
    const { u, sid } = await urzadzenia(['P', 'K', 'C'], flota);
    przesunZegar(M); await poprawMase(u[B], sid, 37);
    przesunZegar(M); await przypnij(u[A], sid, true);
    przesunZegar(M); await sync(u[A], u[B]); await sync(u[B], u[A]);
    przesunZegar(M); await poprawMase(u[stary], sid, 50);
    przesunZegar(M); await sync(u[A], u[stary]); await sync(u[stary], u[A]);
    const lista = Object.values(u);
    await rundy(lista, 3);
    const w = await widoki(u, sid);
    zeruj(lista); await rundy(lista, 1);
    return { w: [...new Set(Object.values(w))], zap: Object.values(zapisy(lista)).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0) };
  }
  it('znane ograniczenie R2-K2: 221 na P, K albo C poprawia 50 offline po rekordzie złożonym 37* — 37* na trzech', async () => {
    const r = {};
    for (const stary of ['P', 'K', 'C']) r[stary] = await r2k2({ [stary]: 'S221' }, stary);
    expect(r).toEqual({ P: { w: ['karta 37*'], zap: 0 }, K: { w: ['karta 37*'], zap: 0 }, C: { w: ['karta 37*'], zap: 0 } });
  }, 120_000);
  it('kontrola R2-K2: flota samych 221 — 50 na trzech', async () => {
    expect(await r2k2({ P: 'S221', K: 'S221', C: 'S221' }, 'C')).toEqual({ w: ['karta 50'], zap: 0 });
  }, 120_000);
  // R2-K3 (ta sama klasa co R2-K2, bez F-D): jeden blob jak w vilda_sync.js (wysyłka z If-Match, po 412 pobranie, scalenie,
  // wysyłka). K 37 i C 41 offline, P przypina i wysyła, O (221) pobiera gwiazdkę; K, potem C wysyłają po kolei — C składa
  // 41* z rekordem K (rev 3). O później poprawia 50 offline i wysyła: 50 ginie (f612fe09 i flota samych 221: 50*).
  async function r2k3(flota) {
    zegarRano();
    const { u, sid } = await urzadzenia(['P', 'K', 'C', 'O'], flota);
    const srv = { blob: null, etag: 0 };
    const pobierz = async (v) => { if (srv.blob) await v.mergeSyncPayload(JSON.parse(srv.blob)); v.__etag = srv.etag; };
    const wyslij = async (v) => { if (v.__etag !== srv.etag) await pobierz(v); srv.blob = JSON.stringify(await v.exportSyncPayload()); srv.etag += 1; v.__etag = srv.etag; };
    for (const n of ['K', 'P', 'C', 'O']) { await pobierz(u[n]); await wyslij(u[n]); }
    for (const n of ['P', 'K', 'C', 'O']) await pobierz(u[n]);
    przesunZegar(M); await poprawMase(u.K, sid, 37);
    przesunZegar(M); await poprawMase(u.C, sid, 41);
    przesunZegar(M); await przypnij(u.P, sid, true); await wyslij(u.P);
    przesunZegar(M); await pobierz(u.O);
    await wyslij(u.K); await wyslij(u.C);
    przesunZegar(M); await poprawMase(u.O, sid, 50);
    przesunZegar(M); await wyslij(u.O);
    for (let r = 0; r < 3; r += 1) for (const n of ['P', 'K', 'C', 'O']) { await pobierz(u[n]); await wyslij(u[n]); }
    return [...new Set(Object.values(await widoki(u, sid)))];
  }
  it('znane ograniczenie R2-K3: trasa szeregowa przez blob, O (221) poprawia 50 offline — 41* na czterech', async () => {
    expect(await r2k3({ O: 'S221' })).toEqual(['karta 41*']);
  }, 120_000);
  it('kontrola R2-K3: flota samych 221 — 50*', async () => {
    expect(await r2k3({ P: 'S221', K: 'S221', C: 'S221', O: 'S221' })).toEqual(['karta 50*']);
  }, 120_000);
});
