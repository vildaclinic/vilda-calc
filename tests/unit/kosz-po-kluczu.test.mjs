// P-KOSZ-PO-KLUCZU (PR-E3, decyzja właściciela D7 = a i Q8 z 2026-10-21) — nagrobek wersji (kosz albo retencja) działa
// na wersję tam, gdzie leży na tym urządzeniu, a ostatnia wersja karty, którą nagrobek oszczędza, przyjmuje najnowszą
// treść.
//
// Reguła.
//   A1 W pełnym scalaniu wpis kosza (i retencji) szuka swojej wersji po kluczu (snapshotId) także pod inną kartą niż
//      karta wpisu — typowo pod starą kartą X, którą inne urządzenie scaliło („Scal pacjentów” X → Y → Z), a to
//      urządzenie o scaleniu nie wiedziało i poprawiło w X wizytę. Ta sama decyzja co pod kartą wpisu (zmiana później
//      niż usunięcie wygrywa, przypięta przeżywa retencję, nieczytelna przy retencji zostaje). Wersja pokonana oddaje
//      wkład wpisowi (treść poprawki trafia do kosza) i znika dopiero po zapisie listy kosza; karta, która zostaje bez
//      wersji, znika bez nagrobka (nagrobek X już jest). Wyjątek ostatniej wersji karty pod inną kartą nie obowiązuje
//      tylko dla starego duplikatu: karta, w której wizyta leży, ma znany nagrobek pacjenta (z ładunku albo tutejszy),
//      a karta wpisu jest tu (tam wizytę oddaje „Przywróć”); inaczej wizyta zostaje i przyjmuje najnowszą treść (A3),
//      a karta nie znika (np. żywa karta docelowa „Scal pacjentów”; Q8-obca-2 niżej).
//   A3 (Q8) Wersja zostawiona wyjątkiem ostatniej wersji karty przyjmuje najnowszą treść (ściśle późniejsza chwila
//      treści S4: z treści kosza albo z kopii z ładunku) i najpóźniejszy rejestr gwiazdki; rev = max (bez +1), chwila
//      zmiany nie późniejsza niż usunięcie, które ją pokonało. Dotąd zostawała stara treść (23 kg), choć kosz i inne
//      urządzenia miały poprawkę (74 kg).
//   A4 Wersja wspólna dwóm kartom („Scal pacjentów”) — treść po chwili treści, gwiazdka po rejestrze (W3), jak w jednej
//      karcie; dotąd cały rekord z kopii o późniejszej chwili zmiany (E4a-Cpin — kosz-usuwanej-karty.test.mjs).
//
// Przygotowania (kosz-po-kluczu-wspolne.mjs): trzyKarty — na K „Testowy Jan” X (x1 120 cm / 20 kg, x 125 cm / 23 kg,
// x3 130 cm / 25 kg; w widoku od najnowszej: x3, x, x1), „Testowa Ola” Y (y) i Z (z); jan2 — „Testowy Jan” X (s1 20 kg,
// x 23 kg). Komplet na P i C.
// Kroki co minutę (K: „Scal pacjentów” X → Y, Y → Z tworzy głowy m1 i m2), pierwsze scalenia w jednej z 8 kolejności,
// 3 rundy pełnej wymiany w kolejności katalogu s4d7 albo cel.md, pomiar, runda kontrolna z licznikiem zapisów.
// Widok: karty z wersjami (masa i gwiazdka przy x i s1), kosz (wersja@karta wpisu:masa), nagrobki pacjentów.
//
// Wynik na kodzie sprzed zmiany (8240e0df, sejf 230) — zmierzony tymi samymi krokami w 16 przebiegach (8 kolejności × 2
// porządki rund):
//   E4b       K: X → Y → Z; P (bez wiedzy) poprawia x w X na 74; K: kosz x (pod Z) → Z[m2,m1,z,y,x3,x1], kosz x@Z:74,
//             nagrobki X i Y na trzech. Dotąd 16/16 rozjazd: P zostawało z kartą X[x:74] (bez nagrobka X), C w 3/16
//             z X[x:23] (stara treść), w 4/16 z X[x:74].
//   E4b-1     jedno scalenie X → Y → kosz x@Y:74 (dotąd 16/16 rozjazd, C w 3/16 X[x:23])
//   E4b-pin   P przypina x w X zamiast poprawki → kosz x@Z:23* (dotąd 16/16 rozjazd: P X[x:23*], C w 4/16 X[x:23*],
//             w 3/16 X[x:23] — bez gwiazdki)
//   E4b-C     C poprawia x zamiast P → kosz x@Z:74 (dotąd 16/16 rozjazd, P w 2/16 X[x:23])
//   E4b-2w    P dopisuje do X nową wizytę → X[nowa], kosz x@Z:74, nagrobek Y (dotąd 16/16 rozjazd: P X[nowa,x:74]
//             w 16/16, C X[nowa,x:23] w 8/16 i X[nowa,x:74] w 4/16)
//   kosz-przed P: kosz x w X; K (bez wiedzy): X → Y → kosz x@X:23, x w żadnej karcie (dotąd K i w 4/16 C: Y[…,x:23,…])
//   kosz-po   K: X → Y; P (bez wiedzy): kosz x w X → to samo (dotąd K i w 4/16 C: Y[…,x:23,…])
//   E4b-ret   retencja K przycina Z (zamiast kosza) → Z[m2], nagrobki X i Y, x w żadnej karcie (dotąd P X[x3,x:74,x1]
//             w 16/16, C X[x3,x:74,x1] w 4/16 i X[x3,x:23,x1] w 3/16)
//   E4b-ret-pin P przypina x w X, retencja K przycina Z → X[x:23*] na trzech (przypięta przeżywa retencję; dotąd P
//             i w 12/16 C X[x3,x:23*,x1], K X[x:23*])
//   kontrole bez zmian (zielone także na 8240e0df): E4b-bez-kosza, PRZ0 i PRZ (s4d7-wspolne.mjs).
//   np-ret-A1 (fuzz wielu kart, ziarna 168 i 198; Bsw_przezyteRetencji) — wersja starej karty, która wygrywa ze swoim
//   wpisem retencji, przechodzi pod kartę docelową, zamiast zginąć z kartą od nagrobka „Scal pacjentów”:
//   npret-pin  P przypina x w X; C (bez wiedzy) przycina X (x i x1); K (bez wiedzy o obu): X → Y → Y[m3,y,x3,x:23*],
//             nagrobek X (bez tej reguły: x w żadnej karcie na trzech w 4 z 8 kolejności — A1 przycinał na K kopię x pod Y,
//             a przypięta x ginęła na P z X; 8240e0df: rozjazd 16/16, w 6/16 K ze starą x:23 bez gwiazdki, a P i C bez x)
//   npret-popr C przycina X; P poprawia x na 74 (później); K: X → Y → Y[m3,y,x3,x:74] (bez tej reguły: 4 z 8 bez x)
//   npret-K    P przypina x w X; K: X → Y, retencja K przycina Y → Y[m2,x:23*] (bez tej reguły i na 8240e0df: x w żadnej karcie
//             w 8 z 8 — E4a-ret-pin z jednym scaleniem)
//   npret-kosz3-K jak npret-pin, a K daje do kosza x3 pod Y — w tej fazie z X nie przechodzi żadna wersja; karta
//             docelowa z wpisu kosza x3 (karta Y) → Y[m3,y,x:23*], kosz x3@Y (bez tej reguły: x w żadnej karcie w 4 z 8,
//             8240e0df: rozjazd 16/16, K ze starą x:23 bez gwiazdki w 6/16)
//   npret-nowaW jak npret-pin, a karta docelowa W powstaje na K tuż przed scaleniem X → W (P i C jej nie znają): na P
//             W zakłada pętla kart z ładunku (głowa scalenia i w), x przechodzi pod nią → W[m4,w,x3,x:23*]
//   Q8 (jan2; P: kosz s1 — x ostatnią wersją karty P; K: kosz x; obecność wizyty w karcie nadal zależy od kolejności —
//   znane ograniczenie E1, niżej):
//   E1-C      C poprawia x na 74 → na każdym urządzeniu z x w karcie x:74, kosz x:74 (dotąd P x:23 w 14/16)
//   E1-popr-C jak E1-C, kosz K z zegarem +10 min → to samo (dotąd P x:23 w 14/16)
//   PRZ0-bez  P: kosz s1; K (+10 min): kosz x; P←K; P poprawia x na 78 → x:78 wszędzie (dotąd C x:23 w 7/16)
//   E1-C-sav  jak E1-C, ale poprawka C z nową chwilą zapisu → to samo, a rekord x na P ma chwile poprawki C (zmiana
//             i zapis t+1, rev 1 — rekord całej nowszej wersji ze źródła; dotąd P x:23 z rev 0 w 14/16)
//   E1-dwa    kontrola bez poprawki: P i C trzymają x:23, K i C s1:20 — jak dotąd.
//   Q8-obca-2 trzyKarty; P: „Scal pacjentów” X → Y, P daje do kosza y, x1 i głowę scalenia (na P Y = [x3, x]); K (bez
//             wiedzy o scaleniu): kosz x i x3 w X → na P oba wpisy kosza karty X (na P jej nie ma) trafiają w Y: x
//             przegrywa, x3 zostaje jako ostatnia wersja Y — karta Y nie znika; P Y[x3], K Y[y], C jedno z dwóch (E1
//             pod inną kartą), kosz i nagrobek X na trzech (dotąd P Y[x3,x:23] w 16/16, K i w 9/16 C X[x1] Y[y] bez
//             nagrobka X).
// Znane ograniczenia (opis w ALGORITHMS, P-KOSZ-PO-KLUCZU):
//   E1 (obecność) — dwa urządzenia dają offline do kosza różne wizyty jedynej pary: każde zostawia inną (P x, K s1),
//      bo nagrobek nigdy nie usuwa ostatniej wersji karty; obie treści są w koszu na wszystkich urządzeniach. To samo
//      pod inną kartą (Q8-obca-2: P x3, K y). Wybór ocalałej wersji (P4) — poza tym PR.
//   kosz-po-2 — K: X → Y → Z; C poprawia x w X (t+3); P (bez wiedzy o scaleniach) daje x do kosza w X (t+4) → kosz
//      x@X:74 na trzech, ale C w 8/16 zostaje z X[x:74] obok nagrobka Y: wpis kosza wskazuje X, a x jest na C ostatnią
//      wersją karty X (wyjątek ostatniej wersji pod kartą wpisu), a karta X przeżywa na C nagrobek „Scal pacjentów”,
//      bo poprawka C (t+3) jest późniejsza niż ten nagrobek (t+1) (dotąd do tego K z x pod Z — x:23 w 10/16, x:74
//      w 6/16). Domknięcie wymaga zmiany formatu wpisu.
//   npret-kosz3-P — P przypina x w X i daje do kosza x3 w X (bez wiedzy o scaleniu); C przycina X; K: X → Y. Karta
//      docelowa z ładunku K (x3 pod Y) → Y[m4,y,x:23*] w 6 z 8 kolejności; w K←C,K←P i K←P,K←C K zna już i
//      przycięcie, i kosz x3, zanim P zobaczy jego ładunek: w ładunku K nie ma żadnej wersji X, a wszystkie wpisy
//      wskazują X — nic nie mówi P, dokąd scalono X, i przypięta x ginie z X na trzech (jak bez tej reguły w 4 z 8;
//      8240e0df w tych kolejnościach: K ze starą x:23 bez gwiazdki przy rundach katalogu, x:23* na trzech przy rundach
//      cel.md). Domknięcie wymaga celu scalenia w nagrobku (zmiana formatu, P5).
//
// Przy zbieżnych scenariuszach: ten sam widok i ten sam pełny stan (chwile, rev, nagrobki) na trzech, stan stabilny,
// 0 zapisów listy, wersji i kart w rundzie kontrolnej. Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar,
// dane fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KOLEJNOSCI_8 } from './s4d7-wspolne.mjs';
import { SCEN, przebiegE3 } from './kosz-po-kluczu-wspolne.mjs';

afterEach(() => { vi.useRealTimers(); });

const RUNDY = ['katalog', 'cel'];
const ZERO = { lista: 0, wersje: 0, karty: 0 };
const nagrobekX = (st) => {
  const n = st.nagrW.find((e) => e.w === 'x');
  return n ? { powod: n.powod, rev: n.rev, masa: n.kg } : null;
};

const ZBIEZNE = {
  E4b: ['Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y', { powod: 'kosz', rev: 2, masa: 74 }],
  'E4b-1': ['Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X', { powod: 'kosz', rev: 1, masa: 74 }],
  'E4b-pin': ['Z[m2,m1,z,y,x3,x1] | kosz x@Z:23* | nagr X,Y', { powod: 'kosz', rev: 2, masa: 23 }],
  'E4b-C': ['Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y', { powod: 'kosz', rev: 2, masa: 74 }],
  'E4b-2w': ['X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y', { powod: 'kosz', rev: 2, masa: 74 }],
  'kosz-przed': ['Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X', { powod: 'kosz', rev: 1, masa: 23 }],
  'kosz-po': ['Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X', { powod: 'kosz', rev: 1, masa: 23 }],
  'E4b-ret': ['Z[m2] | nagr X,Y', { powod: 'retencja', rev: 2, masa: null }],
  'E4b-ret-pin': ['X[x:23*] Z[m2] | nagr Y', { powod: 'retencja', rev: 2, masa: null }],
  'npret-pin': ['Y[m3,y,x3,x:23*] Z[z] | nagr X', { powod: 'retencja', rev: 0, masa: null }],
  'npret-popr': ['Y[m3,y,x3,x:74] Z[z] | nagr X', null],
  'npret-K': ['Y[m2,x:23*] Z[z] | nagr X', { powod: 'retencja', rev: 1, masa: null }],
  'npret-kosz3-K': ['Y[m3,y,x:23*] Z[z] | kosz x3@Y:25 | nagr X', { powod: 'retencja', rev: 0, masa: null }],
  'npret-nowaW': ['W[m4,w,x3,x:23*] Y[y] Z[z] | nagr X', { powod: 'retencja', rev: 0, masa: null }],
  // kontrole
  'E4b-bez-kosza': ['Z[m2,m1,z,y,x3,x:74,x1] | nagr X,Y', null],
  PRZ0: ['X[x:78] | kosz s1@X:20', null],
  PRZ: ['X[x:78] | kosz s1@X:20', null],
};

describe('P-KOSZ-PO-KLUCZU — rodzina E4b (wpis kosza po kluczu) i kontrole: ten sam pełny stan na trzech', () => {
  for (const [nazwa, [widok, nagrobek]] of Object.entries(ZBIEZNE)) {
    for (const runda of RUNDY) {
      for (const kol of KOLEJNOSCI_8) {
        it(`${nazwa} (${kol}, rundy ${runda}): ${widok}`, async () => {
          const r = await przebiegE3(SCEN[nazwa], kol, runda);
          expect(r.u.warunkiBledne, `warunki scenariusza: ${r.u.warunki.join('; ')}`).toBe(false);
          if (nazwa === 'PRZ0' || nazwa === 'PRZ') expect(r.u.przywroc, '„Przywróć” na P').toBe('przywrócono');
          expect(r.widoki, 'widok na trzech').toEqual({ P: widok, K: widok, C: widok });
          for (const n of ['P', 'K', 'C']) expect(nagrobekX(r.st[n]), `${n}: nagrobek x`).toEqual(nagrobek);
          expect(r.zbieznyPelny, 'ten sam pełny stan na trzech').toBe(true);
          expect(r.stabilny, 'stan stabilny').toBe(true);
          expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, C: ZERO });
        });
      }
    }
  }
});

// Q8 i znane ograniczenie E1: obecność x w karcie zależy od kolejności (P trzyma x, K s1, C jedno z dwóch), ale żadne
// urządzenie nie trzyma w karcie starszej treści x niż kosz. Masa x (karta i kosz) i rekord x na P: rev, chwila zmiany
// i zapisu (minuty od początku kroków) — Q8 bierze rekord całej nowszej wersji ze źródła treści (rev = max, czasy
// źródła); urządzenie z x w karcie ma ten sam rekord co P.
const Q8 = {
  'E1-C': [74, { rev: 1, upd: '1', sav: '0' }],
  'E1-popr-C': [74, { rev: 1, upd: '1', sav: '0' }],
  'PRZ0-bez': [78, { rev: 1, upd: '3', sav: '0' }],
  'E1-dwa': [23, { rev: 0, upd: '0', sav: '0' }],
  // poprawka C z nową chwilą zapisu: P przyjmuje savedAtISO poprawki (t+1), nie swój dawny (t+0)
  'E1-C-sav': [74, { rev: 1, upd: '1', sav: '1' }],
};
const rekordX = (st) => st.karty.flatMap((k) => k.wersje).find((w) => w.w === 'x') || null;
describe('P-KOSZ-PO-KLUCZU — Q8: ostatnia wersja karty przyjmuje nowszą treść kosza; obecność (E1) bez zmian', () => {
  for (const [nazwa, [kg, rekord]] of Object.entries(Q8)) {
    const zX = `X[x:${kg}] | kosz s1@X:20 kosz x@X:${kg}`, zS1 = `X[s1:20] | kosz s1@X:20 kosz x@X:${kg}`;
    for (const runda of RUNDY) {
      for (const kol of KOLEJNOSCI_8) {
        it(`${nazwa} (${kol}, rundy ${runda}): x w karcie i w koszu — ${kg} kg`, async () => {
          const r = await przebiegE3(SCEN[nazwa], kol, runda);
          expect({ P: r.widoki.P, K: r.widoki.K }, 'P trzyma x, K s1 (E1)').toEqual({ P: zX, K: zS1 });
          expect([zX, zS1], 'C: x albo s1 (E1)').toContain(r.widoki.C);
          const xP = rekordX(r.st.P);
          expect({ kg: xP.kg, rev: xP.rev, upd: xP.upd, sav: xP.sav }, 'P: rekord x').toEqual({ kg, ...rekord });
          for (const n of ['K', 'C']) if (rekordX(r.st[n])) expect(rekordX(r.st[n]), `${n}: rekord x jak na P`).toEqual(xP);
          expect(r.stabilny, 'stan stabilny').toBe(true);
          expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, C: ZERO });
        });
      }
    }
  }
});

// Dwa wpisy kosza karty X (na P jej nie ma) na obie wersje karty Y na P: jedna przegrywa, druga zostaje jako ostatnia
// wersja Y — karta Y nie znika (mutant bez zliczania pokonanych wersji usuwa na P całą kartę Y).
describe('P-KOSZ-PO-KLUCZU — Q8-obca-2: wpisy kosza pod inną kartą na wszystkie wersje karty — ostatnia zostaje, karta Y nie znika', () => {
  const kosz = 'kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X';
  const naP = `Y[x3] Z[z] | ${kosz}`, naK = `Y[y] Z[z] | ${kosz}`;
  for (const runda of RUNDY) {
    for (const kol of KOLEJNOSCI_8) {
      it(`Q8-obca-2 (${kol}, rundy ${runda}): P Y[x3], K Y[y], C jedno z dwóch; ten sam kosz i nagrobek X na trzech`, async () => {
        const r = await przebiegE3(SCEN['Q8-obca-2'], kol, runda);
        expect(r.u.warunkiBledne, `warunki scenariusza: ${r.u.warunki.join('; ')}`).toBe(false);
        expect({ P: r.widoki.P, K: r.widoki.K }, 'P trzyma x3, K y (E1 pod inną kartą)').toEqual({ P: naP, K: naK });
        expect([naP, naK], 'C: x3 albo y (E1)').toContain(r.widoki.C);
        for (const n of ['P', 'K', 'C']) expect(nagrobekX(r.st[n]), `${n}: nagrobek x`).toEqual({ powod: 'kosz', rev: 1, masa: 23 });
        expect(r.stabilny, 'stan stabilny').toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, C: ZERO });
      });
    }
  }
});

describe('P-KOSZ-PO-KLUCZU — znane ograniczenie kosz-po-2: kosz z poprawką na trzech, C może zostać ze starą kartą X', () => {
  const zbiezny = 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y';
  const resztaC = 'X[x:74] Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr Y';
  for (const runda of RUNDY) {
    for (const kol of KOLEJNOSCI_8) {
      it(`kosz-po-2 (${kol}, rundy ${runda}): P i K — x w żadnej karcie, kosz 74; C — to samo albo stara X z x 74`, async () => {
        const r = await przebiegE3(SCEN['kosz-po-2'], kol, runda);
        expect({ P: r.widoki.P, K: r.widoki.K }).toEqual({ P: zbiezny, K: zbiezny });
        expect([zbiezny, resztaC]).toContain(r.widoki.C);
        for (const n of ['P', 'K', 'C']) expect(nagrobekX(r.st[n]), `${n}: nagrobek x`).toEqual({ powod: 'kosz', rev: 2, masa: 74 });
        expect(r.stabilny, 'stan stabilny').toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, C: ZERO });
      });
    }
  }
});

describe('P-KOSZ-PO-KLUCZU — npret-kosz3-P: przypięta x idzie pod Y, gdy ładunek K wskazuje kartę docelową; znane ograniczenie w dwóch kolejnościach', () => {
  const zX = 'Y[m4,y,x:23*] Z[z] | kosz x3@X:25 | nagr X', bezX = 'Y[m4,y] Z[z] | kosz x3@X:25 | nagr X';
  for (const runda of RUNDY) {
    for (const kol of KOLEJNOSCI_8) {
      const ogr = ['K←C,K←P', 'K←P,K←C'].includes(kol);
      it(`npret-kosz3-P (${kol}, rundy ${runda}): ${ogr ? 'x w żadnej karcie (bez celu scalenia)' : 'x 23* pod Y'} na trzech`, async () => {
        const r = await przebiegE3(SCEN['npret-kosz3-P'], kol, runda);
        expect(r.u.warunkiBledne, `warunki scenariusza: ${r.u.warunki.join('; ')}`).toBe(false);
        const w = ogr ? bezX : zX;
        expect(r.widoki, 'widok na trzech').toEqual({ P: w, K: w, C: w });
        for (const n of ['P', 'K', 'C']) expect(nagrobekX(r.st[n]), `${n}: nagrobek x`).toEqual({ powod: 'retencja', rev: 0, masa: null });
        expect(r.zbieznyPelny, 'ten sam pełny stan na trzech').toBe(true);
        expect(r.stabilny, 'stan stabilny').toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, C: ZERO });
      });
    }
  }
});
