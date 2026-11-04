// Model kolejki zmian dla testów A ≡ B (tests/unit/sync-dziennik-wlasnosciowy.test.mjs) i magazynu kolejki
// (tests/unit/sync-dziennik-magazyn.test.mjs, M5c)
//
// Model NIE implementuje reguły łączenia wpisów: wycina funkcję Bob_plan z vilda_vault.js (wytnijFunkcje z
// tests/unit/sesja-zapisu-uprzaz.mjs) i wykonuje ją w osobnym kontekście node:vm. Bob_plan jest samowystarczalna (tylko
// parametry, literały i metody tablic), więc działa bez reszty sejfu. Testy sprawdzają w ten sposób kod produktu, a nie
// kopię reguły. Sejf bez Bob_plan → planKolejki() rzuca, a testy łączenia wpisów są czerwone.
//
// EKSPORTY
//   planKolejki() → plan(klucza, nowe, e, sufiks) → { usun: [eid], istnial } — wycięta Bob_plan (wynik skopiowany do
//       tablic i obiektów tej dziedziny). klucza — wiersze encji { eid, seqLocal, state, setId }; nowe — [{ state,
//       setId }] nowych wierszy; e — epoka (licznik przed builderem); sufiks — wiersze pending/inflight kolejki o seqLocal
//       większym niż najstarszy kandydat do zastąpienia.
//   dopiszDoKolejki(Q, od, nowe) → { usuniete, kandydaci } — kolejka testowa A ≡ B (tablica wpisów { kind, key, setId, … }
//       w kolejności dopisania, zmieniana w miejscu). Wpisy Q[od..] (nigdy niedostarczone) to wiersze pending z
//       seqLocal = indeks + 1; dopisania są szeregowe, więc e = Q.length. Porcje jednego zestawu pfull z jednej emisji
//       przychodzą razem (jak jedno enqueue). Plan usuwa wpisy (zawsze o indeksie ≥ od, więc kursory dostaw ≤ od są
//       nadal ważne), nowe trafiają na koniec. usuniete — liczba usuniętych wpisów, kandydaci — liczba oczekujących
//       wpisów tej encji przed dopisaniem (do liczników „łączenie” i „pominięte, bo nie na ogonie”).
//   modelMagazynu() → m — model wierszy magazynu (M5c): wiersze { eid, seqLocal, kind, entityKey, setId, state },
//       licznik jak rekord meta (ostatni nadany seqLocal). Operacje szeregowe (e = licznik przy budowie):
//       m.dopisz(nowe) → { zastapione, istnial } — nowe: [{ eid, kind, entityKey, setId, state }] z jednego enqueue;
//       m.wez(limit) → [eid] — wybór do wysyłki bez limitu bajtów (pierwszy inflight kończy wybór; oversize,
//       unreadable, rejected pomijane; wybrane → inflight); m.przyjmij(eids) → usunięte [eid], m.porzuc(eids) →
//       usunięte, m.niepowodzenie(eids) → [eid] z inflight do pending, m.zLotu() → wszystkie inflight do pending (dla
//       olderThanMs mniejszego niż wiek każdego wiersza w locie), m.odrzuc([{ eid, code }]) → [{ eid, stan }];
//       m.lista() → [[kind, entityKey, state, setId]] po seqLocal, m.wiersze(), m.licznik().
import vm from 'node:vm';
import { wytnijFunkcje, zrodlo } from '../unit/sesja-zapisu-uprzaz.mjs';

let plan = null;
export function planKolejki() {
  if (plan) return plan;
  const kod = wytnijFunkcje(zrodlo('vilda_vault.js'), 'Bob_plan');
  const f = vm.runInContext(`(${kod})`, vm.createContext({}));
  plan = (klucza, nowe, e, sufiks) => {
    const w = f(klucza, nowe, e, sufiks);
    return { usun: Array.from(w.usun), istnial: w.istnial === true };
  };
  return plan;
}

export function dopiszDoKolejki(Q, od, nowe) {
  if (!nowe.length) return { usuniete: 0, kandydaci: 0 };
  const { kind, key } = nowe[0];
  const wiersz = (q, i) => ({ eid: i, seqLocal: i + 1, state: 'pending', kind: q.kind, entityKey: q.key, setId: q.setId === undefined ? null : q.setId });
  const oczekujace = Q.map(wiersz).slice(od);
  const klucza = oczekujace.filter((w) => w.kind === kind && w.entityKey === key);
  const m0 = klucza.length ? Math.min(...klucza.map((w) => w.seqLocal)) : Infinity;
  const sufiks = oczekujace.filter((w) => w.seqLocal > m0);
  const p = planKolejki()(klucza, nowe.map((q) => ({ state: 'pending', setId: q.setId === undefined ? null : q.setId })), Q.length, sufiks);
  const usun = [...p.usun].sort((a, b) => b - a);
  for (const i of usun) {
    if (!(i >= od && i < Q.length)) throw new Error(`model kolejki: plan usuwa wpis spoza oczekujących (${i})`);
    Q.splice(i, 1);
  }
  Q.push(...nowe);
  return { usuniete: usun.length, kandydaci: klucza.length };
}

export function modelMagazynu() {
  let wiersze = [];
  let licznik = 0;
  const po = (eids) => new Set(eids);
  const m = {
    dopisz(nowe) {
      const zTresci = nowe.some((x) => x.state === 'pending');
      const { kind, entityKey } = nowe[0];
      const e = licznik;
      const klucza = wiersze.filter((w) => w.kind === kind && w.entityKey === entityKey);
      const kandydaci = klucza.filter((w) => w.state === 'pending' && w.seqLocal <= e);
      const m0 = zTresci && kandydaci.length ? Math.min(...kandydaci.map((w) => w.seqLocal)) : Infinity;
      const sufiks = wiersze.filter((w) => w.seqLocal > m0 && (w.state === 'pending' || w.state === 'inflight'));
      const p = planKolejki()(klucza.map((w) => ({ ...w })), nowe.map((x) => ({ state: x.state, setId: x.setId })), e, sufiks.map((w) => ({ ...w })));
      if (p.istnial) return { zastapione: 0, istnial: true };
      const nast = Math.max(licznik, ...wiersze.map((w) => w.seqLocal), 0) + 1;
      const usun = po(p.usun);
      wiersze = wiersze.filter((w) => !usun.has(w.eid));
      nowe.forEach((x, i) => { wiersze.push({ eid: x.eid, seqLocal: nast + i, kind: x.kind, entityKey: x.entityKey, setId: x.setId, state: x.state }); });
      licznik = nast + nowe.length - 1;
      return { zastapione: usun.size, istnial: false };
    },
    wez(limit) {
      const wybrane = [];
      for (const w of [...wiersze].sort((a, b) => a.seqLocal - b.seqLocal)) {
        if (w.state === 'inflight') break;
        if (w.state !== 'pending') continue;
        if (wybrane.length >= limit) break;
        wybrane.push(w);
      }
      for (const w of wybrane) w.state = 'inflight';
      return wybrane.map((w) => w.eid);
    },
    przyjmij(eids) {
      const z = po(eids);
      const usuniete = wiersze.filter((w) => z.has(w.eid) && (w.state === 'pending' || w.state === 'inflight')).map((w) => w.eid);
      const u = po(usuniete);
      wiersze = wiersze.filter((w) => !u.has(w.eid));
      return usuniete;
    },
    porzuc(eids) { const z = po(eids); const usuniete = wiersze.filter((w) => z.has(w.eid)).map((w) => w.eid); wiersze = wiersze.filter((w) => !z.has(w.eid)); return usuniete; },
    niepowodzenie(eids) {
      const z = po(eids);
      const lot = wiersze.filter((w) => z.has(w.eid) && w.state === 'inflight');
      for (const w of lot) w.state = 'pending';
      return lot.map((w) => w.eid);
    },
    zLotu() {
      const lot = wiersze.filter((w) => w.state === 'inflight');
      for (const w of lot) w.state = 'pending';
      return lot.map((w) => w.eid);
    },
    odrzuc(wpisy) {
      const zmienione = [];
      for (const { eid, code } of wpisy) {
        const w = wiersze.find((x) => x.eid === eid && (x.state === 'pending' || x.state === 'inflight'));
        if (w) { w.state = code === 'oversize' ? 'oversize' : 'rejected'; zmienione.push({ eid, stan: w.state }); }
      }
      return zmienione;
    },
    lista: () => [...wiersze].sort((a, b) => a.seqLocal - b.seqLocal).map((w) => [w.kind, w.entityKey, w.state, w.setId]),
    wiersze: () => [...wiersze].sort((a, b) => a.seqLocal - b.seqLocal).map((w) => ({ ...w })),
    licznik: () => licznik,
  };
  return m;
}
