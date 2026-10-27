// P-KOSZ-POLKRATA (S4 krok 1) i P-PRZYPIETA-POLKRATA (S4 krok 2, W3): katalog S4 / K10 / X5 / S1 / X1 / X6 / X3 / PC-PK / T4 /
// PRZ / E4a w 8 kolejnościach
// pierwszych scaleń i 3 rundach pełnej wymiany na trzech (S5: czterech) urządzeniach. Prawdziwy vilda_vault.js, sejfy
// w pamięci, sztuczny zegar, dane fikcyjne („Testowy Jan”). Scenariusze i pomocniki: s4d7-wspolne.mjs (pomiar S4 po
// D-7) + scenariusze z cel.md (S4bp, S4po, S1b, X1b, T4d, ODP). Oczekiwania z cel.md, rozdz. 3:
//   [W3] krok 2 S4 (decyzje właściciela 2026-10-21: D1 = C „gwiazdka z własną datą”, D2 = a, D3 = a): treść = najnowsza
//        po chwili treści, gwiazdka = rejestr o najpóźniejszej chwili, przypięta → karta, nieprzypięta i przycięcie
//        nie wcześniejsze niż znana zmiana → brak (Bpk_przypieta). Rekord złożony (treść jednego urządzenia, gwiazdka
//        drugiego): rev = najwyższa znana + 1 (cel.md F3 — w tabeli 3b cel.md podaje rev bez „+1”: S5 r2, K10a r3,
//        K10b r2, S6 r1; tu r3, r4, r3, r2), chwila zmiany = późniejsza z prawdziwych chwil treści i gwiazdki (D3 = a).
//        Świadomie odpięta albo usunięta wizyta nie wraca ze starej kopii z gwiazdką (D2 = a: T4d, ODP); „Odepnij
//        i usuń” zapisuje odpięcie przed koszem (rev + 1), więc kosz trzyma treść bez gwiazdki;
//   [Q4] decyzja właściciela D4 = a: treść kosza unieważnionego i wersji pokonanej przycięciem w scalaniu zostaje
//        lokalnie w cieniu (30 dni), późniejszy ważny kosz bierze z niej nowszą treść;
//   [F1] rev wpisu kosza bez treści unieważnionych (P-REV-MAX, przegląd końcowy D-7 F1) — odstępstwo od cel.md X1b/X6
//        („r2”), zgodne z tests/unit/pozniejsza-poprawka-mutacje.test.mjs E1b;
//   [R]  cel jednoznaczny z reguł; [POZA] poza zakresem półkraty — przypięte zachowanie 1d6be72e (znane ograniczenie).
// Przy każdej kolejności: ten sam pełny stan na wszystkich urządzeniach (także nagrobek i chwile), stan stabilny, 0 zapisów
// listy, wersji i kart w dodatkowej rundzie, a stan zgodny z oczekiwanym (ten sam w każdej kolejności).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCENARIUSZE, KOLEJNOSCI_8, przebieg, popraw, przypnij, doKosza, przytnij, sync, przesunZegar } from './s4d7-wspolne.mjs';

afterEach(() => { vi.useRealTimers(); });

// Scenariusze z cel.md spoza pomiaru (te same kroki co w reguly/testy/zz-cel-scen.test.mjs).
const DODATKOWE = {
  S4bp: { opis: 'kontrola S4 bez poprawki: gwiazdka P; kosz K; retencja C', przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await doKosza(u, 'K'); przesunZegar(60e3); await przytnij(u, 'C'); } },
  S4po: { opis: 'kontrola: kosz K; gwiazdka P (po koszu); retencja C', przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await doKosza(u, 'K'); await przypnij(u, 'P', true); await przytnij(u, 'C'); } },
  S1b: { opis: '(mapa-d7) P 99; kosz P; C 74; kosz K (23); retencja C', przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 99); await doKosza(u, 'P'); await popraw(u, 'C', 74); await doKosza(u, 'K'); await przytnij(u, 'C'); } },
  X1b: { opis: '(mapa-d7 X1) P 77, P 78, kosz P; C 74; kosz K', przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 77); await popraw(u, 'P', 78); await doKosza(u, 'P'); await popraw(u, 'C', 74); await doKosza(u, 'K'); } },
  T4d: { opis: 'gwiazdka P, P→K (K: kopia z gwiazdką, offline); „Odepnij i usuń” P; C 74; retencja C', przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await sync(u.P, u.K); await doKosza(u, 'P'); await popraw(u, 'C', 74); await przytnij(u, 'C'); } },
  ODP: { opis: 'gwiazdka P, P→C; C świadomie odpina; retencja C; P (stara kopia z gwiazdką) offline do scaleń', przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await sync(u.P, u.C); await przypnij(u, 'C', false); await przytnij(u, 'C'); } },
};
const SCEN = { ...SCENARIUSZE, ...DODATKOWE };

// st: krótki stan (s4d7-wspolne krotko); karta / kosz / n: pola stanu do sprawdzenia (chwile w minutach od t0;
// kroki co minutę, pierwszy krok w t+1). Wartość pominięta = nie sprawdzamy.
const RET = (del, upd, zmiana = null, rev = undefined) => ({ powod: 'retencja', del, upd, zmiana, przyc: null, masa: null, ...(rev === undefined ? {} : { rev }) });
const KARTA_23P = (rev, upd) => ({ masa: 23, pin: true, rev, upd });
const OCZEKIWANE = {
  // [W3] t+1 gwiazdka P; t+2 kosz K; t+3 C 74; t+4 retencja C → przypięta wersja P przeżywa przycięcie (nagrobek retencji
  // zostaje przy niej, A3a), poprawka C przepada (C sam ją przyciął). P←K,K←C: P dostaje kosz K, zanim się okaże, że
  // jest nieaktualny (poprawka C po nim) — przypięta trafia do kosza; gdy kosz przegrywa, wersja wraca z cienia z gwiazdką
  // z rejestru nagrobka (Bgw_wskrzes, dawny rekord r1). Karta 23* r1 w 8 z 8 (w kroku 1: brak w P←K,K←C).
  S4: { st: 'karta 23*', karta: KARTA_23P(1, '1'), n: RET('4', '3', null, 1) },
  'S4-kontrola': { st: 'karta 23*', karta: KARTA_23P(1, '1'), n: RET('4', '3', null, 1) },
  // [W3] S5 (4 urządzenia): kosz K nieaktualny (poprawka D po nim), przycięcie C późniejsze niż poprawka D, gwiazdka P
  // (rejestr z t+1, znany z wersji P albo z treści kosza) przypięta → karta z najnowszą treścią (74 kg z D) i gwiazdką
  // P: rekord złożony 74* r3 (2 + 1), chwila zmiany = chwila poprawki D (t+4). W kroku 1: brak w 5 kolejnościach,
  // 99* w 3. Opis nagrobka bez rev (zależy od kolejności, D7).
  S5: { st: 'karta 74*', karta: { masa: 74, pin: true, rev: 3, upd: '4' }, n: RET('5', '4') },
  // [W3] K10a, S6: późniejsza poprawka C bez wiedzy o gwiazdce nie kasuje gwiazdki P (rejestr P), a gwiazdka nie kasuje
  // poprawki: rekord złożony 58* (K10a r4 = 3 + 1, S6 r2 = 1 + 1), chwila zmiany = chwila poprawki C. Gdy C przytnie się
  // wcześniej, niż pozna gwiazdkę, poprawka czeka w cieniu C i wraca jako rekord złożony (Bgw_zloz). Nagrobek K z chwilą
  // poprawki C. W kroku 1: karta 23* (poprawka 58 kg przepadała) albo brak (P←C,P←K).
  K10a: { st: 'karta 58*', karta: { masa: 58, pin: true, rev: 4, upd: '4' }, n: RET('5', '-8', '4', 0) },
  S6: { st: 'karta 58*', karta: { masa: 58, pin: true, rev: 2, upd: '2' }, n: RET('3', '-8', '2', 0) },
  // [W3] K10b (PD-12 dla gwiazdki, decyzja D1 = C): późniejsza gwiazdka P nie kasuje wcześniejszych poprawek C (57, 58) —
  // karta 58* r3 (2 + 1), chwila zmiany = chwila gwiazdki P (t+3). W kroku 1 (D-7 K9, LWW całej wersji): 23*, rev 2 albo 1.
  K10b: { st: 'karta 58*', karta: { masa: 58, pin: true, rev: 3, upd: '3' }, n: RET('4', '-8', '3', 0) },
  // [Q4] X5: w koszu najnowsza istniejąca treść (78, rev 2), usunięto t+5 (K), przycięto t+6, zmiana C t+4.
  X5: { st: 'kosz 78', n: { powod: null, masa: 78, rev: 2, del: '5', przyc: '6', zmiana: '4', upd: '2' } },
  // [Q4] S1, S1b: kosz 99 (rev 1), przycięcie i zmiana po pierwszym koszu w nagrobku.
  S1: { st: 'kosz 99', n: { powod: null, masa: 99, rev: 1, del: '4', przyc: '5', zmiana: '3', upd: '1' } },
  S1b: { st: 'kosz 99', n: { powod: null, masa: 99, rev: 1, del: '4', przyc: '5', zmiana: '3', upd: '1' } },
  // [R]+[F1] X1 (= X6): kosz 74 (C) z rev 1 — rev 78 z kosza P unieważnionego zmianą C nie liczy się (cel.md: r2).
  X1: { st: 'kosz 74', n: { powod: null, masa: 74, rev: 1, del: '6', przyc: null, zmiana: null, upd: '4' } },
  X1b: { st: 'kosz 74', n: { powod: null, masa: 74, rev: 1, del: '5', przyc: null, zmiana: null, upd: '4' } },
  // [R] X3: brak; jeden nagrobek retencji t+5 z opisem wersji P zmienionej po koszu (t+3), bez zmianaISO.
  X3: { st: 'brak', n: RET('5', '3', null, 1) },
  // [Q4] PC-PK: kosz 99 w 8 z 8 (dotąd w P←C,P←K kosz 23 — znane ograniczenie „P←C,P←K”).
  'PC-PK': { st: 'kosz 99', n: { powod: null, masa: 99, rev: 1, del: '2', przyc: '3', zmiana: null } },
  // [R] T4 (pomiar; cel T4b): świadomie usunięta przypięta, C poprawia i przycina → brak.
  T4: { st: 'brak', n: RET('4', '3', null, 1) },
  // [R]/[W3] T4-poprawka (cel T4): zmiana po usunięciu zostaje, bez gwiazdki. rev 3: odpięcie zapisane przed koszem
  // (r2), poprawka C (r1) przyjmuje rejestr odpięcia z nagrobka jako rekord złożony (2 + 1); w kroku 1 — r1.
  'T4-poprawka': { st: 'karta 74', karta: { masa: 74, pin: false, rev: 3 }, n: null },
  // [W3] T4b (pomiar; cel T4c): „Odepnij i usuń” zapisuje odpięcie (r2), kosz z treścią bez gwiazdki; przycięcie później.
  // Chwila kosza: stempel po chwili odpięcia (Bpp_chwilaZmiany, ułamek minuty — bez sprawdzania). W kroku 1: kosz 23* r1.
  T4b: { st: 'kosz 23', n: { powod: null, masa: 23, pin: false, rev: 2, upd: '2', przyc: '3' } },
  // [R] kontrole S4.
  S4bp: { st: 'kosz 23*', n: { powod: null, masa: 23, pin: true, rev: 1, del: '2', przyc: '4' } },
  S4po: { st: 'karta 23*', karta: { masa: 23, pin: true, rev: 1, upd: '2' }, n: { powod: 'retencja', del: '3' } },
  // [W3] T4d, ODP: stara kopia z gwiazdką nie cofa świadomego usunięcia / odpięcia (decyzja D2 = a) — rejestr odpięcia
  // z treści kosza (T4d) albo z przycinanej wersji (ODP) jedzie w nagrobku (pole gwiazdka). W kroku 1 (B2)
  // stara kopia K (T4d) albo P (ODP) wraca do karty z gwiazdką: T4d 7 z 8 (poza K←P,K←C), ODP 8 z 8.
  T4d: { st: 'brak', n: RET('4', '3', null, 1) },
  ODP: { st: 'brak', n: RET('3', '2', null, 2) },
  // [R] PRZ0 (P-PRZYWROC-Z-KARTY, D5 = a; dotąd ograniczenie P-POZNIEJSZA-POPRAWKA, Q6): już pierwsze „Przywróć” zapisuje
  // nowszą z dwóch treści (z karty) ze stemplem po usunięciu — karta 78 na trzech, bez drugiego „Przywróć”.
  PRZ: { st: 'karta 78', karta: { masa: 78, pin: false, rev: 2 }, n: null, pierwsze: 'przywrócono' },
  'PRZ-gw': { st: 'karta 23*', karta: { masa: 23, pin: true, rev: 2 }, n: null, pierwsze: 'przywrócono' },
  'PRZ-pg': { st: 'karta 78*', karta: { masa: 78, pin: true, rev: 3 }, n: null, pierwsze: 'przywrócono' },
  'PRZ-odp': { st: 'karta 78', karta: { masa: 78, pin: false, rev: 3 }, n: null, pierwsze: 'przywrócono' },
  'PRZ-nie-ostatnia': { st: 'karta 78', karta: { masa: 78, pin: false, rev: 2 }, n: null, pierwsze: 'przywrócono' },
  'PRZ-kontrola': { st: 'karta 78', karta: { masa: 78, rev: 2 }, n: null },
  'PRZ-po-koszu': { st: 'karta 78', karta: { masa: 78, rev: 1 }, n: null },
  'PRZ-K7': { st: 'karta 74', karta: { masa: 74, rev: 3 }, n: null },
  // [POZA] E4a (K6, PD-16, Q7): poprawka sprzed „Scal pacjentów” dalej ginie — w koszu 23.
  E4a: { st: 'kosz 23', n: { powod: null, masa: 23, rev: 2 } },
  'E4a-1': { st: 'kosz 23', n: { powod: null, masa: 23, rev: 1 } },
  'E4a-kontrola': { st: 'karta Z 74', karta: { masa: 74, rev: 2 }, n: null },
};

const podzbior = (obiekt, wzor) => Object.fromEntries(Object.keys(wzor).map((k) => [k, obiekt ? obiekt[k] : undefined]));

for (const [nazwa, oczScen] of Object.entries(OCZEKIWANE)) {
  const scen = SCEN[nazwa];
  describe(`${nazwa}: ${scen.opis}`, () => {
    for (const kolejnosc of scen.kolejnosci) {
      const ocz = (oczScen.wyjatki && oczScen.wyjatki[kolejnosc]) || oczScen;
      it(`${kolejnosc}: ${ocz.st}`, async () => {
        const w = await przebieg(scen, kolejnosc);
        expect(w.u.warunkiBledne, w.u.warunki.join('; ')).toBe(false);
        for (const [n, k] of Object.entries(w.krotko)) expect(k, `${n}: stan`).toBe(ocz.st);
        expect(w.zbieznyPelny, 'ten sam pełny stan (nagrobek, chwile) na wszystkich urządzeniach').toBe(true);
        expect(w.stabilny, 'stan stabilny').toBe(true);
        for (const [n, z] of Object.entries(w.zapisy)) expect({ lista: z.lista, wersje: z.wersje, karty: z.karty }, `${n}: zapisy w dodatkowej rundzie`).toEqual({ lista: 0, wersje: 0, karty: 0 });
        const s = Object.values(w.st)[0];
        if (ocz.karta) expect(podzbior(s.karta, ocz.karta), 'karta').toEqual(ocz.karta);
        if (ocz.n === null) expect(s.nagrobek, 'bez nagrobka').toBeNull();
        else if (ocz.n) expect(podzbior(s.nagrobek, ocz.n), 'nagrobek').toEqual(ocz.n);
        if (ocz.pierwsze) expect(w.poRundach && w.poRundach.pierwsze, 'pierwsze „Przywróć”').toBe(ocz.pierwsze);
      }, 60_000);
    }
  });
}
