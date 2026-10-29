// P-PRZYWROC-Z-KARTY (PRZ0, decyzja właściciela D5 = a, 2026-10-21) — flota mieszana ze starszą aplikacją
// (tests/fixtures/vilda_vault-221.js.txt, D11 = a) w rundach „każdy z każdym” uprzęży polkrata-uprzaz.mjs.
//
// Reguła: „Przywróć” wersji, która jest i w karcie, i w koszu, odpowiada „już w karcie” ({ alreadyInCard: true }, bez
// zapisu wersji, tylko zdjęcie nieaktualnego wpisu kosza) wyłącznie wtedy, gdy wersję w karcie zmieniono po usunięciu
// i po przycięciu, a jej treść nie jest starsza niż treść kosza (chwila treści W3). Inaczej — także gdy wersja w karcie
// ma nowszą treść, ale usunięcie z innego urządzenia jest późniejsze — jeden zapis przywrócenia: treść nowsza z dwóch
// po chwili treści, chwila zmiany późniejsza niż usunięcie (Bpp_chwilaZmiany), rev = max(rev wpisu kosza, rev karty) + 1,
// wpis kosza zdjęty, nagłówek przebudowany (lastSavedAtISO nie maleje), onPatientSaved({ isSnapshotRestore: true }).
// Odbiorcy 221 przyjmują ten zapis po rev i po chwili; urządzenie, które klika „Przywróć”, musi mieć nową aplikację.
//
// Scenariusz PRZ0 (jak sonda z mapy zmian): „Testowy Jan”, dwie wizyty zapisane na K (s1: 120 cm / 20 kg, s2: 125 cm /
// 23 kg), kopie na P i C. Kroki co minutę, bez synchronizacji poza P←K: P daje s1 do kosza (s2 zostaje ostatnią wersją
// karty P); K z zegarem +10 min daje s2 do kosza (usunięcie t+12); P←K (s2 na P w karcie — ostatnia wersja, E1 — i w
// koszu 23); P poprawia s2 na 78 kg (t+4, przed chwilą usunięcia K); P klika „Przywróć” (t+5). Potem pierwsze scalenia
// w jednej z 8 kolejności, 3 pełne rundy, odczyt stanu i runda kontrolna z licznikiem zapisów (lista nagrobków, wersje,
// karty). Uprząż z 12 wizytami (urzadzenia()) nie pasuje: s2 musi być ostatnią wersją karty P.
//
// Prawdziwy vilda_vault.js (i kopia 221) w osobnych oknach, magazyny w pamięci, sztuczny zegar
// (vi.useFakeTimers({ toFake: ['Date'] })), automatyczna retencja wyłączona. Dane wyłącznie fikcyjne.
//
// Testy (jeden `it` na kolejność) i wynik na kodzie sprzed zmiany (baza ae1ac892: „już w karcie” dla każdej wersji
// w karcie nowszej po chwili zmiany rekordu, w 221 — po rev; bez strażnika sesji), zmierzony sondą z tymi samymi krokami:
// F1 flota nowa → pierwsze „Przywróć” bez alreadyInCard; na P od razu karta 78 rev 2, chwila zmiany = chwila treści,
//    późniejsza niż usunięcie K, lastSavedAtISO nie wcześniejszy, kosz P pusty, jedno onPatientSaved z isSnapshotRestore;
//    po rundach P, K i C dokładnie „karta 78”, rev 2, ta sama chwila zmiany, bez nagrobka, 0 zapisów w rundzie
//    kontrolnej. Dawniej (czerwony 8/8): „już w karcie”, bez zapisu i bez onPatientSaved (karta P 78 rev 1); po rundach
//    P „karta 78 + kosz 78”, K „kosz 78”, C „karta 23 + kosz 78” (rev 0) w K←C,P←K, P←K,K←C i P←C,P←K (tylko rundy tej
//    uprzęży pokazują 23 kg na C), „karta 78 + kosz 78” w K←P,K←C, K←C,K←P i C←P,C←K, „kosz 78” w C←K,P←C i C←K,C←P;
//    0 zapisów w rundzie kontrolnej (rozjazd cichy i stały).
// F2 K (221), P nowa klika „Przywróć” → to samo co F1 (K 221 przyjmuje zapis przywrócenia: karta 78 rev 2, bez
//    nagrobka), 0 zapisów. Dawniej (czerwony 8/8): „już w karcie”, widoki jak w F1 dla tej samej kolejności, 2 zapisy
//    w każdej rundzie kontrolnej (wymiana bez końca między K 221 a resztą).
// F3 C (221) → jak F2 (C 221 dawniej: 23 kg w karcie w 3/8 i 2 zapisy w rundzie kontrolnej; czerwony 8/8).
// F4 P (221) klika „Przywróć” — znane ograniczenie: starsza aplikacja odpowiada „już w karcie” (jej warunek: rev karty
//    wyższy niż rev usunięcia), a widoki i karty na P, K i C po rundach są takie same jak we flocie samych 221
//    (równoległy przebieg w tym samym teście) albo lepsze: od P-KOSZ-PO-KLUCZU (sejf 231) C w K←C,P←K, P←K,K←C
//    i P←C,P←K ma w karcie 78 (rev 1) — ostatnia wersja karty przyjmuje nowszą treść kosza (Q8) — gdzie flota samych
//    221 zostawia 23 kg (rev 0). Po aktualizacji P do nowej aplikacji wpis jest w koszu P, ponowne
//    „Przywróć” → karta 78 rev 2 na trzech, bez nagrobka, 0 zapisów. Kontrola: zielony także na bazie (drugie
//    „Przywróć” na bazie: pełny remis chwili zmiany i rev → zwykła gałąź, rev 2).
// Stan P tuż po kliknięciu sprawdza expect.soft: na kodzie sprzed zmiany raport pokazuje też widoki i zapisy po rundach.
// Strażnik sesji (SESSION_CHANGED) — poza tym plikiem: flota nie przełącza konta w trakcie „Przywróć”.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  zegar, sztucznyZegar, przesunZegar, urzadzenie, aktualizuj, zapisz, jan, sync, rundy, stan, widok, gdzie, poprawMase,
  doKosza, zeruj, zapisy,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
const KOLEJNOSCI_8 = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P'];
const NAZWY = ['P', 'K', 'C'];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// „Testowy Jan”: s1 (120 cm / 20 kg) i s2 (125 cm / 23 kg) zapisane na K, kopie na P i C.
async function jan2(flota = {}) {
  sztucznyZegar();
  const u = {};
  for (const n of NAZWY) u[n] = await urzadzenie(n, flota[n] || 'N');
  const s1 = await zapisz(u.K, jan(120, 20));
  const s2 = await zapisz(u.K, jan(125, 23), { patientId: s1.patientId });
  await sync(u.K, u.P); await sync(u.K, u.C);
  return { u, pid: s1.patientId, sid: s2.snapshotId, s1: s1.snapshotId };
}
// Krok na zegarze urządzenia przesuniętym o ms (wspólny zegar wraca po kroku).
async function naZegarze(ms, fn) {
  vi.setSystemTime(zegar.t + ms);
  try { return await fn(); } finally { vi.setSystemTime(zegar.t); }
}
// Kroki PRZ0, zwraca chwilę usunięcia K (z kosza P po P←K).
async function krokiPRZ0(d) {
  const { u, sid, s1 } = d;
  przesunZegar(M); await doKosza(u.P, s1); // t+1: s2 ostatnią wersją karty P
  przesunZegar(M); await naZegarze(10 * M, () => doKosza(u.K, sid)); // t+2, zegar K +10 min → usunięcie t+12
  przesunZegar(M); await sync(u.K, u.P); // t+3: P — s2 w karcie (23, ostatnia) i w koszu (23)
  przesunZegar(M); await poprawMase(u.P, sid, 78); // t+4: poprawka wcześniejsza niż usunięcie K
  przesunZegar(M); // t+5: „Przywróć” na P
  const wpis = (await u.P.listTrashedSnapshots()).find((e) => e.snapshotId === sid);
  return wpis.deletedAtISO;
}
function opisWyniku(w) { return w && w.alreadyInCard ? 'już w karcie' : 'przywrócono'; }
async function pierwszeScalenia(u, kol) {
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
}
// Stan sid na P, K i C: widoki, karty, rodzaj eksportowanego nagrobka, chwile zmiany wersji w karcie.
async function stanFloty(u, sid) {
  const w = {}, karty = {}, nagrobki = {}, chwile = {};
  for (const n of NAZWY) {
    const s = await stan(u[n], sid);
    w[n] = widok(s);
    karty[n] = s.karta ? { masa: s.karta.masa, pin: s.karta.pin, rev: s.karta.rev } : null;
    nagrobki[n] = s.nagrobek ? s.nagrobek.rodzaj : null;
    const g = await gdzie(u[n], sid);
    chwile[n] = g ? g.s.updatedAtISO : null;
  }
  return { w, karty, nagrobki, chwile };
}
// Runda kontrolna: liczba zapisów (lista nagrobków + wersje + karty) na wszystkich urządzeniach.
async function rundaKontrolna(u) {
  const lista = NAZWY.map((n) => u[n]);
  zeruj(lista); await rundy(lista, 1);
  return Object.values(zapisy(lista)).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0);
}
// Stan końcowy po zapisie przywrócenia: dokładnie „karta 78” rev 2 na trzech, ta sama chwila zmiany późniejsza niż
// usunięcie K, bez nagrobka, 0 zapisów w rundzie kontrolnej.
async function koniec(u, sid, usuniecie) {
  const st = await stanFloty(u, sid);
  const zap = await rundaKontrolna(u);
  return {
    widoki: st.w,
    karty: st.karty,
    nagrobki: st.nagrobki,
    jednaChwila: new Set(Object.values(st.chwile)).size === 1,
    poUsunieciu: Object.fromEntries(NAZWY.map((n) => [n, !!st.chwile[n] && st.chwile[n] > usuniecie])),
    zap,
  };
}
const KONIEC_78 = {
  widoki: { P: 'karta 78', K: 'karta 78', C: 'karta 78' },
  karty: { P: { masa: 78, pin: false, rev: 2 }, K: { masa: 78, pin: false, rev: 2 }, C: { masa: 78, pin: false, rev: 2 } },
  nagrobki: { P: null, K: null, C: null },
  jednaChwila: true,
  poUsunieciu: { P: true, K: true, C: true },
  zap: 0,
};

// PRZ0 z „Przywróć” na P z nową aplikacją: stan P tuż po kliknięciu i stan floty po 8 kolejnościach + 3 rundach.
async function przebiegNowyP(flota, kol) {
  const d = await jan2(flota);
  const { u, pid, sid } = d;
  const usuniecie = await krokiPRZ0(d);
  const zdarzenia = [];
  u.P.onPatientSaved((e) => { if (e && e.snapshotId === sid) zdarzenia.push(!!e.isSnapshotRestore); });
  let wynik;
  try { wynik = await u.P.restoreTrashedSnapshot(pid, sid); } catch (er) { wynik = { blad: er.code || er.message }; }
  const karta = await u.P.getPatient(pid);
  const s = karta.snapshots.find((x) => x.snapshotId === sid);
  const lokalnie = {
    wynik,
    karta: s ? { masa: s.payload.user.weight, pin: !!s.pinned, rev: s.rev } : null,
    poUsunieciu: !!s && s.updatedAtISO > usuniecie,
    chwilaTresci: !!s && s.payload._contentAtISO === s.updatedAtISO,
    naglowek: !!s && karta.lastSavedAtISO >= s.updatedAtISO,
    koszP: (await u.P.listTrashedSnapshots()).some((e) => e.snapshotId === sid),
    zdarzenia,
  };
  przesunZegar(M);
  await pierwszeScalenia(u, kol);
  await rundy(NAZWY.map((n) => u[n]), 3);
  return { d, lokalnie, koniec: await koniec(u, sid, usuniecie) };
}
function lokalnieOczekiwane(d) {
  return {
    wynik: { patientId: d.pid, snapshotId: d.sid },
    karta: { masa: 78, pin: false, rev: 2 },
    poUsunieciu: true,
    chwilaTresci: true,
    naglowek: true,
    koszP: false,
    zdarzenia: [true],
  };
}

describe('PRZ0, flota nowa (F1): „Przywróć” na P zapisuje 78 z chwilą późniejszą niż usunięcie K', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`${kol}: P 78 w karcie i w koszu (23, usunięcie K +10 min) → przywrócono, P, K i C dokładnie „karta 78” rev 2, kosz pusty, 0 zapisów`, async () => {
      const { d, lokalnie, koniec: k } = await przebiegNowyP({}, kol);
      expect.soft(lokalnie, 'P tuż po „Przywróć”').toEqual(lokalnieOczekiwane(d));
      // Rundy „każdy z każdym” tej uprzęży — dawniej tu C zostawała z 23 kg w karcie (3/8).
      expect.soft(k.widoki.C, 'C po rundach').toBe('karta 78');
      expect(k).toEqual(KONIEC_78);
    }, 60_000);
  }
});

describe('PRZ0, K na starszej aplikacji 221 (F2): K przyjmuje zapis przywrócenia z P', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`${kol}: K (221) usuwa, P (nowa) przywraca → „karta 78” rev 2 na P, K i C, bez nagrobka, 0 zapisów w rundzie kontrolnej`, async () => {
      const { d, lokalnie, koniec: k } = await przebiegNowyP({ K: 'S221' }, kol);
      expect.soft(lokalnie, 'P tuż po „Przywróć”').toEqual(lokalnieOczekiwane(d));
      expect(k).toEqual(KONIEC_78);
    }, 60_000);
  }
});

describe('PRZ0, C na starszej aplikacji 221 (F3): C przyjmuje zapis przywrócenia z P', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`${kol}: C (221) bez wiedzy o krokach, P (nowa) przywraca → „karta 78” rev 2 na P, K i C, bez nagrobka, 0 zapisów w rundzie kontrolnej`, async () => {
      const { d, lokalnie, koniec: k } = await przebiegNowyP({ C: 'S221' }, kol);
      expect.soft(lokalnie, 'P tuż po „Przywróć”').toEqual(lokalnieOczekiwane(d));
      expect(k).toEqual(KONIEC_78);
    }, 60_000);
  }
});

// F4: „Przywróć” na P ze starszą aplikacją — znane ograniczenie (cel nieosiągalny, póki P nie ma nowej aplikacji).
async function przebiegStaryP(flota, kol) {
  const d = await jan2(flota);
  const { u, pid, sid } = d;
  const usuniecie = await krokiPRZ0(d);
  let wynik;
  try { wynik = opisWyniku(await u.P.restoreTrashedSnapshot(pid, sid)); } catch (er) { wynik = `błąd ${er.code || er.message}`; }
  przesunZegar(M);
  await pierwszeScalenia(u, kol);
  await rundy(NAZWY.map((n) => u[n]), 3);
  const st = await stanFloty(u, sid);
  return { d, usuniecie, porownanie: { pierwsze: wynik, widoki: st.w, karty: st.karty, nagrobki: st.nagrobki } };
}

describe('PRZ0, P na starszej aplikacji 221 (F4): ograniczenie, potem aktualizacja P i ponowne „Przywróć”', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`${kol}: P (221) przywraca → jak flota samych 221; po aktualizacji P ponowne „Przywróć” → „karta 78” rev 2 na trzech, 0 zapisów`, async () => {
      const wszystkie221 = await przebiegStaryP({ P: 'S221', K: 'S221', C: 'S221' }, kol);
      const r = await przebiegStaryP({ P: 'S221' }, kol);
      // Ograniczenie: starsza aplikacja na P odpowiada „już w karcie” i nie zapisuje; K i C (nowe) kończą tak samo
      // jak we flocie samych 221 — bez pogorszenia — albo lepiej: C (231) przyjmuje w karcie nowszą treść kosza (Q8).
      expect(r.porownanie.pierwsze).toBe('już w karcie');
      const oczekiwane = JSON.parse(JSON.stringify(wszystkie221.porownanie));
      if (oczekiwane.widoki.C === 'karta 23 + kosz 78') {
        oczekiwane.widoki.C = 'karta 78 + kosz 78';
        oczekiwane.karty.C = { masa: 78, pin: false, rev: 1 };
      }
      expect(r.porownanie).toEqual(oczekiwane);
      const { d, usuniecie } = r;
      const { u, pid, sid } = d;
      u.P = await aktualizuj(u.P, 'N');
      przesunZegar(M);
      const wKoszuP = (await u.P.listTrashedSnapshots()).some((e) => e.snapshotId === sid);
      let wynik;
      try { wynik = await u.P.restoreTrashedSnapshot(pid, sid); } catch (er) { wynik = { blad: er.code || er.message }; }
      przesunZegar(M);
      await rundy(NAZWY.map((n) => u[n]), 3);
      const k = await koniec(u, sid, usuniecie);
      expect({ wKoszuP, wynik }).toEqual({ wKoszuP: true, wynik: { patientId: pid, snapshotId: sid } });
      expect(k).toEqual(KONIEC_78);
    }, 120_000);
  }
});
