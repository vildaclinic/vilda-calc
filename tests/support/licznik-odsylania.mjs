// Licznik odsyłania (E3-PR0b, P-ZBIEZNOSC-ZDARZEN): rekordy pochodne jednego scalenia (echo), które urządzenie musiałoby
// odesłać, liczone BEZ wiedzy o źródle ładunku. Funkcje czyste: bez okna, sejfu i zegara; stany to eksporty
// (exportSyncPayload), bajty kopert podaje wołający. Używany przez test A ≡ B (tests/unit/sync-dziennik-wlasnosciowy.test.mjs);
// przypadki modułu: tests/unit/licznik-odsylania.test.mjs. Dane w testach wyłącznie fikcyjne.
//
// DEFINICJE
//   Echo jednego scalenia na urządzeniu Y z ładunkiem P (zdarzenie, delta, pełna kopia, pół wymiany):
//     E = { k : po[k] ≠ przed[k] ∧ (k ∉ P ∨ po[k] ≠ P[k]) }, encje jak encje() z tests/support/encje-ladunku.mjs.
//   Warunek „scalanie zapisało” porównuje rekord przed i po scaleniu (nie sam fakt zapisu w Le): bez niego pełna kopia
//   ze starszej aplikacji wraca bez końca (rekord zapisany jeszcze raz w tej samej postaci nie jest echem).
//   Warstwy (od najszerszej):
//     surowe   — każda encja z E;
//     po2a     — kanon decyzji 2a (PD-17): snap bez rev (R2); wpis Kosza bez opisu D7 (rev, updatedAtISO, zmianaISO,
//                koszISO, revPary) i bez postaci gwiazdki w treści (payload._pinned, payload._pinnedState — R4n);
//                nagrobki bez rev. Encja równa w kanonie stanowi przed albo ładunkowi — bez echa;
//     wyk      — warstwa WYKONALNA: po2a bez encji z ładunku, których różnicę wobec P[k] tłumi reguła pola (REGULY;
//                aplikacja widzi tylko P i swój rekord, nie wie, kto wysłał P). Domyślna reguła T:
//                (i) całe pole z POLA_ZAWSZE, którego nie ma w P[k] (bieżąca wersja zapisuje je zawsze i wyznacza
//                    deterministycznie — tożsamość wizyty, docs/PATIENT_VISITS.md „Zgodność i wycofanie”);
//                (ii) payload._pinnedState.h wersji, gdy h(po) = odcisk(treść po), a odcisk(treść po bez pól z (i)
//                    nieobecnych w P[k]) = h(P) — odcisk przeliczony z samej tożsamości wizyty.
//                Brak całego elementu tablicy (np. wpisu Kosza innej karty) nie jest tłumiony. Między bieżącymi
//                urządzeniami (ładunki zawsze z polami POLA_ZAWSZE — strażnik polaZawsze) (i) nie zachodzi, a (ii)
//                bez (i) tłumi tylko różnicę, której nie ma, więc wyk = po2a z konstrukcji;
//     nowe     — wyk bez tego, co dziś wysyła się natychmiast: wpisy haków H1/H2/H3 tego scalenia oraz przegląd kolejki
//                tylko po drenażu zdarzeń, który coś scalił (vilda_sync.js Bns_cykl → sweepOutbox);
//     noweOst  — wyk bez haków i bez przeglądu przy dowolnym źródle: przegląd rusza też na początku odblokowania
//                (vilda_vault.js He → Bem_przeglad(true)), po bezczynności łańcucha konta (Bem_poBezczynnosci) i co
//                24 h (vilda_sync.js Bns_tik). Tylko druk: nowe − noweOst przy pełnej kopii to opóźnienie, nie utrata;
//     po221    — TYLKO DRUK DIAGNOSTYCZNY: po2a bez pól nieznanych sejfowi 221 (POLA_221), gdy wołający wie, że P
//                przyszło z 221 (opcja z221). Nie wpływa na wyk.
//   Model przeglądu: encja pokryta, gdy jej chwila po scaleniu (jak Bev_chwila) jest późniejsza od chwili w ładunku
//   i od chwili przed scaleniem (wiersz kolejki z wcześniejszą chwilą już jest).
//   Reguły diagnostyczne (E2_AB_ODSYL_REGULA): A — każde pole nieobecne w P[k] (za szeroka: tłumi R4a w ładunku
//   i rekordy złożone ze starszej aplikacji); B — tylko punkt (i) reguły T.
//
// WIERSZ: jeden na encję. Karta (nagłówek) bez własnego snap ani stomb w zbiorze → wiersz karty, którego nośnikiem jest
// snap najnowszej wersji (reguła emituj testu A ≡ B); karta z własnym snap albo stomb w zbiorze — bez dodatkowego wiersza.
//   rodzaj ∈ snap, stomb, ptomb, pnote, pnotetomb, karta, inne; pochodzenie: w ładunku (k ∈ P) albo spoza ładunku;
//   klasa (klasaEcha): rekord złożony, gwiazdka, R4a, R4a′, R5, nagłówek karty, tożsamość wizyty, nowa, inne;
//   przydział: snap w ładunku → E3-PR0c; stomb w ładunku i spoza ładunku (P-KOSZ-NOWSZA-TRESC przy zdarzeniu snap)
//   → E3-PR0d; reszta → „bez przydziału”.
//   Klucz literału: źródło|rodzaj|w ładunku albo spoza|klasa (bez ścieżek pól i bez bajtów).
// ŹRÓDŁA (etykieta testu, nie wejście reguły): ZRODLA. Pół wymiany (w4) = Y scala pełny stan X, X jeszcze nie scala Y.
// USUNIĘCIA PRZEZ SCALANIE: encja była przed albo w ładunku, po scaleniu jej nie ma. Ślad w stanie po (nagrobek karty,
//   Kosz, wersja pod inną kartą, przywrócenie, nagrobek notatki …) albo „bez śladu” = utrata bez nośnika (karta
//   opróżniona przez Bsw_poOddaniu bez nagrobka, wygaśnięcie wpisu Kosza w Bkz_czysc).
// ŻĄDANIA: bajty zdarzenia = rozmiar szyfrogramu {iv, data} (Bev_bajty, jak bytes wiersza kolejki); element ciała
//   {"eid","iv","data"} = bajty + 45 B (eid 36 znaków); ciało = 13 + Σ elementów + (n − 1) (Bob_element, Bob_cialo);
//   partia ≤ 200 zdarzeń i ciało ≤ 1 MiB, pierwsze niemieszczące się kończy partię (Bob_wez); zdarzenie
//   > 262 144 B (Bev_MAX_BAJTOW) — oversize, poza partiami.
// STRONA DOSTAWY = MINUTA: strona pobrania (≤ 200 zdarzeń) jest scalana naraz, pełna kopia liczy się jak jedna strona.
//   MINUTA SLOTU = wszystkie strony i pełne kopie scalone w jednym kroku zegara uprzęży (t) na wszystkich urządzeniach
//   slotu. Budżet slotu (budzetSlotow) na bajtach realnych warstwy wyk: ≤ 600 wierszy i ≤ 4 MiB przy górnej granicy
//   przeliczenia na slot, ≤ 20 żądań na urządzenie (wiersz ponad limit zdarzenia przy górnej granicy — osobne żądanie,
//   oversize w wyniku). Przeliczenie (docs/SYNC_PRZYROSTOWA_PLAN.md, rozdz. 3.6: zdarzenie zapisu
//   24–34 tys. znaków, nagrobek, notatka, preferencja 0,4–3 KB): wiersz z treścią wizyty (snap, karta, stomb z payload)
//   — 32 768–46 080 B na treść, pozostałe — 3 072 B; nigdy mniej niż bajty uprzęży. Okna przesuwne 60 s
//   (oknaPrzesuwne) — tylko druk.
// ECHO NA KLONACH: echo E scalenia na Y stosowane na świeżych klonach pozostałych urządzeń; drugi rząd i dalsze obiegi
//   wymiany liczone TYLKO na kluczach encji z E (opcja klucze w echoScalenia, kluczeKopert), najwyżej MAKS_OBIEGOW.
//
// EKSPORTY
//   LIMITY, EID_ZNAKOW, SZKIELET_CIALA, NAD_KOPERTA, TRESC_REALNA, BEZ_TRESCI_BAJTOW, MAKS_OBIEGOW, RODZAJE, ZRODLA,
//   WARSTWY, POLA_D7, POSTAC_GWIAZDKI, POLA_221, POLA_ZAWSZE, POLA_KANDYDACI, REGULY.
//   kanon2a(kind, v), kanon221(kind, v), odcisk(tresc), roznicePol(x, y), wPolach(s, pola), bezIdentyfikatorow(s),
//   rodzajEncji(kind), chwilaEncji(kind, e), trescWizyt(kind, e), klasaEcha(...), przydzial(r), kluczLiteralu(zrodlo, r).
//   echoScalenia(przed, po, ladunek, { z221, rekordZlozony, klucze }) → wiersze z flagami warstw (po2a, wykA, wykB,
//     wykT, po221) i tłumienia reguł (tlumiA, tlumiB, tlumiT).
//   usunieciaScalenia(przed, po, ladunek), wierszeEcha(lista), pokrycie(r, haki), kluczeKopert(koperty).
//   elementCiala(bajty), cialo(elementy), partie(bajty), strony(n), realny(w), realne(wiersze), budzetSlotow(strony),
//   oknaPrzesuwne(os, filtr).
//   nowyLicznikOdsylania({ regula = 'T', rekordZlozony }) → L (zapiszScalenie, sprawdzPolaZawsze, zapiszUsuniecia,
//     zapiszBrakNosnika, zapiszStrone, zapiszPartie, wyslij, klony, zapiszOdeslane, podsumuj).
//   kandydaciEcha(ladunek), modelEcha(przed, po, ladunek, { rekordZlozony }) — E3-PR0c, niżej.
//
// MODEL ODSYŁANIA (E3-PR0c, odsyłanie poprawionych wizyt; E3-PR0d, odsyłanie wpisów Kosza; wyrocznia sejfu z włączonym
// przełącznikiem odsyłania)
//   modelEcha(przed, po, ladunek) → { wiersze, spoza } — wiersze echa, które sejf odsyła po zastosowaniu jednego zdarzenia:
//   tylko ładunek z polem event (koperta zdarzenia; stara delta tą samą drogą — pusto), z echoScalenia warstwa wykonalna
//   reguły pola (wykT) rodzajów snap i stomb, bez odejmowania haków. snap — bez wersji przeniesionej w tym scaleniu (przed
//   scaleniem pod inną kartą niż po). stomb (klucz = snapshotId) — bez samego wygaśnięcia treści (samoWygasniecie, na
//   kanonie 2a po patientId): wpis po scaleniu bez treści tam, gdzie wpis przed scaleniem (albo wpis z ładunku po regule
//   pola) ją miał, a poza tym równy — każde urządzenie czyści treść po 30 dniach samo. spoza — wiersze, których
//   snapshotId nie ma wśród kandydatów ładunku (kandydaciEcha: patients[].snapshots[] i snapshotTombstones[]); sejf ich
//   nie odsyła, więc niepusta lista to niezgodność modelu z sejfem (strażnik kandydatów).
//   wierszeTylkoSavedAtISO(przed, po, ladunek, wiersze) → klucze wierszy stomb z wiersze, które bez savedAtISO by
//   zniknęły (wpis po = przed albo = ładunek po regule pola, w kanonie) — sprawdzian długich przebiegów, oczekiwane 0.
//   L.zapiszOdeslane(zrodlo, koperty, wiersze) — warstwa „odesłane”: koperty echa z łańcucha sejfu (jawne, rodzaje snap
//   i stomb) wobec wierszy modelu tego samego zdarzenia; para (klucz encji) → odeslane.literal[klucz literału wiersza];
//   koperta bez wiersza modelu — ponadModel, wiersz bez koperty — nieodeslane (przykłady — druk). Przy wyłączonym
//   przełączniku nikt jej nie woła: podsumowanie ma pustą warstwę.
//
// MODEL ODSYŁANIA UKRYTEGO WPISU KOSZA KARTY USUNIĘTEJ (E3-PR0d2; ten sam przełącznik)
//   modelStanu(przed, po, ladunek, { nagrobekWygrywa }) → wiersze stomb, które sejf odsyła ze stanu po udanym
//   zastosowaniu jednego zdarzenia (wpis odesłany, bo stan po scaleniu tego wymaga, choć scalanie niczego nie zapisało):
//   ładunek z polem event niesie wersję S pod kartą P (patients[].snapshots[]); po scaleniu S nie ma pod żadną kartą;
//   jest wpis Kosza tej wersji i S wygrywa z każdym jego elementem: nagrobekWygrywa(e, S) = Bkz_wygrywa(e, Bkz_zmiana(S),
//   Bgw_stan(S, S.payload)) — prawda, gdy element e wpisu wygrywa z S; S wygrywa z wpisem, gdy dla każdego elementu e
//   !nagrobekWygrywa(e, S) (wyjątek rozstrzygnięcia — jak wygrywa S). To JEDYNA część modelu z kodu wyciętego z sejfu
//   (wygrywaZKodu, lista WYGRYWA_Z_SEJFU i stała STALE_WYGRYWA wycięta przez stalaZKodu); karty żadnego elementu wpisu
//   nie ma po scaleniu (element bez poprawnego patientId — jak „karta jest”); karta P
//   przegrała tu z nagrobkiem pacjenta (karty nie ma, najpóźniejszy nagrobek P po scaleniu nie wcześniejszy niż
//   lastSavedAtISO karty P z ładunku; brak zapisu — jak spełnione). Pozostałe warunki są tu napisane osobno (na
//   eksportach). Jeden wiersz na wersję i zdarzenie; klasa KLASA_ZE_STANU, przydział E3-PR0d2, pole retencja (wpis
//   z elementem porządkowania). Stara delta (bez event) — pusto.
//   ponadGranica(ladunki, koperty) — górna granica niezależna od modeli: na klucz v kopert stomb odsyłania sejfu w partii
//   (E3-PR0d i ze stanu razem) liczba ≤ liczba ładunków partii, które wymieniają v (patients[].snapshots[] albo
//   snapshotTombstones[]); wynik — lista naruszeń.
//   przypiszKoperty(koperty, wiersze, zeStanu) — koperty odsyłania sejfu w partii (kolejność rejestru) → źródło: stomb
//   klucza v najpierw do wierszy E3-PR0d tego klucza ('echo'), potem do wierszy ze stanu ('stan', z polem retencja);
//   snap — 'echo'; koperta stomb bez wiersza — wyjątek.
import { encje, sortuj } from './encje-ladunku.mjs';

export const LIMITY = Object.freeze({
  partiaZdarzen: 200, partiaBajtow: 1048576, zdarzenieBajtow: 262144,
  zadanUrzMin: 20, wierszySlotMin: 600, bajtowSlotMin: 4 * 1048576, stronaDostawy: 200,
});
export const EID_ZNAKOW = 36;
export const SZKIELET_CIALA = 13; // {"events":[ … ]}
export const NAD_KOPERTA = 8 + EID_ZNAKOW + 1; // "eid":"<36>", — 45 B ponad {"iv":…,"data":…}
export const TRESC_REALNA = Object.freeze({ od: 32 * 1024, do: 45 * 1024 }); // na jedną treść wizyty
export const BEZ_TRESCI_BAJTOW = 3 * 1024; // wiersz bez treści wizyty (nagrobek, notatka, nagłówek bez wersji …)
export const MAKS_OBIEGOW = 4;
export const RODZAJE = Object.freeze(['snap', 'stomb', 'ptomb', 'pnote', 'pnotetomb', 'karta', 'inne']);
export const ZRODLA = Object.freeze(['zdarzenie', 'zdarzenie276', 'delta221', 'blob221', 'blob276', 'blobN', 'w4', 'powtórka']);
export const WARSTWY = Object.freeze(['surowe', 'po2a', 'wykA', 'wykB', 'wykT', 'wyk', 'nowe', 'noweOst', 'po221']);

const BEZ_REV = ['ptomb', 'pnotetomb', 'notetomb', 'plisttomb', 'pktomb'];
export const POLA_D7 = Object.freeze(['rev', 'updatedAtISO', 'zmianaISO', 'koszISO', 'revPary']);
export const POSTAC_GWIAZDKI = Object.freeze(['_pinned', '_pinnedState']);
// Tylko druk: pola, których sejf 221 nie zna (tests/fixtures/vilda_vault-221.js.txt).
export const POLA_221 = Object.freeze({
  snap: Object.freeze(['payload.visit']),
  stomb: Object.freeze(['visitIdentity', 'gwiazdka', 'koszISO', 'revPary', 'deletedWithPatient', 'visitCipher', 'payload.visit']),
  pnotetomb: Object.freeze(['deletedWithPatient']),
});
// Punkt (i) reguły T: pola, które bieżąca wersja zapisuje ZAWSZE, gdy jest ich rodzic (tożsamość wizyty; Bvisit_legacy).
// Założenie sprawdza strażnik polaZawsze licznika na ładunkach od bieżącej wersji.
export const POLA_ZAWSZE = Object.freeze({ snap: Object.freeze(['payload.visit']), stomb: Object.freeze(['visitIdentity', 'payload.visit']) });
// Kandydaci do POLA_ZAWSZE: strażnik liczy ich osobno; pole wchodzi do reguły dopiero przy 0 encji bez pola.
export const POLA_KANDYDACI = Object.freeze({ stomb: Object.freeze(['visitCipher']) });

const obiekt = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bez = (o, pola) => { if (!obiekt(o)) return o; const x = { ...o }; for (const p of pola) delete x[p]; return x; };
const bezW = (o, pole, pola) => (obiekt(o) && obiekt(o[pole]) ? { ...o, [pole]: bez(o[pole], pola) } : o);
const usunSciezke = (o, s) => { // s: 'a.b' (bez tablic)
  const [g, ...r] = s.split('.');
  if (!obiekt(o) || !(g in o)) return o;
  if (!r.length) return bez(o, [g]);
  return { ...o, [g]: usunSciezke(o[g], r.join('.')) };
};
const wartosc = (o, s) => s.split('.').reduce((x, g) => (obiekt(x) ? x[g] : undefined), o);
const rowne = (x, y) => JSON.stringify(x) === JSON.stringify(y);
export const wPolach = (s, pola) => pola.some((d) => s === d || s.startsWith(d + '.'));
export const bezIdentyfikatorow = (s) => s.replace(/\[[^\]]*\]\.?/g, '').replace(/^\./, '') || '(element)';
export const rodzajEncji = (kind) => (RODZAJE.includes(kind) ? kind : 'inne');

// Kanon decyzji 2a (warstwa po2a). Wartość: obiekt encji (JSON.parse(val)).
export function kanon2a(kind, v) {
  if (kind === 'snap') return bez(v, ['rev']);
  // E3-PR0b2b (P-NOTATKA-POZNIEJSZA): scalenie, w którym zostaje tutejsza treść notatki, zapisuje sam rev = najwyższy
  // z obu wersji; ta różnica nie jest zmianą dla lekarza i nie jest odsyłana (jak R2 wersji, decyzja 2a) — klasa
  // „sam rev notatki” (echoScalenia).
  if (kind === 'pnote') return bez(v, ['rev']);
  if (kind === 'stomb') return (Array.isArray(v) ? v : []).map((e) => bezW(bez(e, POLA_D7), 'payload', POSTAC_GWIAZDKI));
  if (BEZ_REV.includes(kind)) return bez(v, ['rev']);
  return v;
}
// Kanon diagnostyczny po221: kanon2a bez pól nieznanych 221.
export function kanon221(kind, v) {
  const k = kanon2a(kind, v);
  if (kind === 'stomb') return k.map((e) => POLA_221.stomb.reduce(usunSciezke, e));
  if (kind === 'snap' || kind === 'pnotetomb') return POLA_221[kind].reduce(usunSciezke, k);
  return k;
}

// Odcisk treści wersji — kopia Bgw_kanon i Bgw_odcisk (vilda_vault.js, blok gwiazdki W3): treść bez _pinned,
// _pinnedState i _contentAtISO, JSON z posortowanymi kluczami, FNV-1a 32 i długość (base36). Zgodność z sejfem
// sprawdza tests/unit/licznik-odsylania.test.mjs na kodzie wyciętym z vilda_vault.js.
function kanonOdcisku(x) {
  if (Array.isArray(x)) return '[' + x.map(kanonOdcisku).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + kanonOdcisku(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
export function odcisk(tresc) {
  const o = JSON.parse(JSON.stringify(tresc));
  delete o._pinned; delete o._pinnedState; delete o._contentAtISO;
  const z = kanonOdcisku(o);
  let h = 0x811c9dc5;
  for (let i = 0; i < z.length; i += 1) { h ^= z.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + z.length.toString(36);
}

// Różnice dwóch wartości z obecnością pola: [{ s, wX, wY, element }] — wX/wY: pole istnieje po stronie X/Y;
// element: brak całego elementu tablicy (wpis Kosza innej karty itp. — reguła pola go nie tłumi).
export function roznicePol(x, y, p = '', out = []) {
  if (rowne(x, y)) return out;
  if (Array.isArray(x) && Array.isArray(y)) {
    const id = (e, i) => (obiekt(e) && (e.patientId || e.snapshotId || e.id || e.credentialId)) || '#' + i;
    const mx = new Map(x.map((e, i) => [String(id(e, i)), e])), my = new Map(y.map((e, i) => [String(id(e, i)), e]));
    for (const k of new Set([...mx.keys(), ...my.keys()])) {
      if (!mx.has(k) || !my.has(k)) out.push({ s: `${p}[${k}]`, wX: mx.has(k), wY: my.has(k), element: true });
      else roznicePol(mx.get(k), my.get(k), `${p}[${k}]`, out);
    }
    return out;
  }
  if (obiekt(x) && obiekt(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const s = p ? `${p}.${k}` : k;
      if (!(k in x) || !(k in y)) out.push({ s, wX: k in x, wY: k in y, element: false });
      else roznicePol(x[k], y[k], s, out);
    }
    return out;
  }
  out.push({ s: p || '(wartość)', wX: x !== undefined, wY: y !== undefined, element: false });
  return out;
}

// Punkt (i): różnica to CAŁE pole z POLA_ZAWSZE, którego nie ma w encji ładunku (brak części pola, np. visit.patientId
// przy obecnym visit, to inna wartość pola — bez tłumienia).
const poleZawszeBrakWP = (kind, d) => !d.element && !d.wX && d.wY && (POLA_ZAWSZE[kind] || []).includes(bezIdentyfikatorow(d.s));
// Punkt (ii) (wersja): h odcisku po scaleniu jest świeży, a bez pól z (i) nieobecnych w P równa się h ładunku.
const SCIEZKA_H = 'payload._pinnedState.h';
function odciskZTozsamosci(kind, P, po) {
  if (kind !== 'snap' || !obiekt(P) || !obiekt(po) || !obiekt(P.payload) || !obiekt(po.payload)) return false;
  const hP = wartosc(P, SCIEZKA_H), hPo = wartosc(po, SCIEZKA_H);
  if (typeof hP !== 'string' || typeof hPo !== 'string' || hPo !== odcisk(po.payload)) return false;
  const brakWP = POLA_ZAWSZE.snap.filter((s) => s.startsWith('payload.') && wartosc(P, s) === undefined).map((s) => s.slice('payload.'.length));
  return odcisk(brakWP.reduce(usunSciezke, po.payload)) === hP;
}
// Reguły warstwy wykonalnej (niezależne od źródła). roz — różnice kanonu 2a encji ładunku (X) i stanu po (Y);
// P, po — wartości encji (JSON.parse(val)).
export const REGULY = Object.freeze({
  A: Object.freeze({
    nazwa: 'każde pole nieobecne w encji ładunku (diagnostyka)',
    tlumi: (kind, roz) => roz.length > 0 && roz.every((d) => !d.element && !d.wX && d.wY),
  }),
  B: Object.freeze({
    nazwa: 'pole z POLA_ZAWSZE nieobecne w encji ładunku (diagnostyka)',
    tlumi: (kind, roz) => roz.length > 0 && roz.every((d) => poleZawszeBrakWP(kind, d)),
  }),
  T: Object.freeze({
    nazwa: 'pole z POLA_ZAWSZE nieobecne w encji ładunku albo odcisk przeliczony z tożsamości wizyty',
    tlumi: (kind, roz, { P = null, po = null } = {}) => roz.length > 0 && roz.every((d) => poleZawszeBrakWP(kind, d)
      || (!d.element && d.wX && d.wY && bezIdentyfikatorow(d.s) === SCIEZKA_H && odciskZTozsamosci(kind, P, po))),
  }),
});

// Chwila zmiany encji jak Bev_chwila (vilda_vault.js; snap — poprawka albo savedAtISO, stomb — ostatnia chwila wpisów).
export function chwilaEncji(kind, e) {
  const pozn = (a, b) => ((a || '') > (b || '') ? a || '' : b || '');
  if (kind === 'snap') return (e && (e.updatedAtISO || e.savedAtISO)) || '';
  if (kind === 'stomb') return (e || []).reduce((m, x) => pozn(m, pozn(x.deletedAtISO, x.przycietoISO)), '');
  if (['pnote', 'note', 'plist'].includes(kind)) return (e && (e.updatedAtISO || e.createdAtISO)) || '';
  if (kind === 'pk') return (e && e.createdAtISO) || '';
  if (kind === 'pref' || kind === 'cred') return (e && e.updatedAtISO) || '';
  if (kind === 'karta') return (e && e.lastSavedAtISO) || '';
  return (e && e.deletedAtISO) || '';
}
// Liczba treści wizyt w kopercie nośnika (przeliczenie bajtów): snap i karta (snap najnowszej wersji) — 1;
// stomb — wpisy z treścią; reszta — 0.
export function trescWizyt(kind, e) {
  if (kind === 'snap' || kind === 'karta') return 1;
  if (kind === 'stomb') return (e || []).filter((x) => obiekt(x.payload)).length;
  return 0;
}

const kartaZywa = (lad, pid) => (lad.patients || []).some((p) => p.patientId === pid) && !(lad.tombstones || []).some((t) => t.patientId === pid);
const POLA_WIZYTY = ['visitIdentity', 'payload.visit', 'visitCipher'];
// Klasa wiersza echa (klucz literału; bez ścieżek). ref — encja odniesienia (P[k] albo przed[k]), e — po[k] (obiekty),
// roz — różnice kanonu 2a, lad — stan po. rekordZlozony — predykat klasyfikatora testu A ≡ B na rekordzie D
// ({ rodzaj: 'wersja', a, b }); bez niego klasa „rekord złożony” nie występuje.
export function klasaEcha(kind, ref, e, roz, lad, { rekordZlozony = null } = {}) {
  if (ref == null) return 'nowa';
  const sc = roz.map((d) => bezIdentyfikatorow(d.s));
  const tylko = (pola) => sc.length > 0 && sc.every((s) => wPolach(s, pola));
  if (kind === 'snap') {
    if (rekordZlozony && rekordZlozony({ rodzaj: 'wersja', a: ref, b: e })) return 'rekord złożony';
    if (tylko(['payload.visit', SCIEZKA_H]) && sc.some((s) => wPolach(s, ['payload.visit']))) return 'tożsamość wizyty';
    if (tylko(['updatedAtISO', 'payload._pinned', 'payload._pinnedState'])) return 'gwiazdka';
    return 'inne';
  }
  if (kind === 'stomb') {
    if (roz.some((d) => d.element)) return 'inne';
    if (tylko(POLA_WIZYTY)) return 'tożsamość wizyty';
    if (!(e || []).every((x) => kartaZywa(lad, x.patientId))) return 'R5';
    if (tylko(['gwiazdka'])) return 'R4a';
    if (tylko(['gwiazdka', 'payload', ...POLA_WIZYTY]) && sc.some((s) => wPolach(s, ['payload']) && !wPolach(s, ['payload.visit']))) return 'R4a′';
    return 'inne';
  }
  if (kind === 'karta') return tylko(['header', 'lastSavedAtISO']) ? 'nagłówek karty' : 'inne';
  return 'inne';
}
export const przydzial = (r) => (r.kind === 'snap' && r.wLadunku ? 'E3-PR0c' : r.kind === 'stomb' ? 'E3-PR0d' : 'bez przydziału');
export const kluczLiteralu = (zrodlo, r) => `${zrodlo}|${r.rodzaj}|${r.wLadunku ? 'w ładunku' : 'spoza'}|${r.klasa}`;

// Echo jednego scalenia: wiersze z flagami warstw. Opcje: z221 — tylko druk po221; rekordZlozony — predykat klasy;
// klucze (Set) — tylko encje o tych kluczach (echo na klonach: drugi rząd i dalsze obiegi na kluczach z E).
export function echoScalenia(przed, po, ladunek, { z221 = false, rekordZlozony = null, klucze = null } = {}) {
  const a = encje(przed), b = encje(po), p = encje(ladunek);
  const out = [];
  for (const [k, e] of b) {
    if (klucze && !klucze.has(k)) continue;
    const x = a.get(k);
    if (x && x.val === e.val) continue; // scalanie nie zapisało
    const q = p.get(k);
    if (q && q.val === e.val) continue; // zapisało to, co przyszło
    const ev = JSON.parse(e.val), xv = x ? JSON.parse(x.val) : null, qv = q ? JSON.parse(q.val) : null;
    const ke = kanon2a(e.kind, ev);
    const po2a = !(xv && rowne(kanon2a(e.kind, xv), ke)) && !(qv && rowne(kanon2a(e.kind, qv), ke));
    const ref = qv || xv;
    const roz = ref ? roznicePol(kanon2a(e.kind, ref), ke) : [];
    const rozP = qv ? roznicePol(kanon2a(e.kind, qv), ke) : null;
    const tl = {};
    for (const [n, R] of Object.entries(REGULY)) tl[n] = po2a && !!rozP && R.tlumi(e.kind, rozP, { P: qv, po: ev });
    const k221 = kanon221(e.kind, ev);
    const po221 = po2a && !(z221 && ((xv && rowne(kanon221(e.kind, xv), k221)) || (qv && rowne(kanon221(e.kind, qv), k221))));
    const r = {
      k, kind: e.kind, rodzaj: rodzajEncji(e.kind), key: e.key, pid: e.patientId || null, pids: e.patientIds || null,
      wLadunku: !!q, nowa: !x, po2a, wykA: po2a && !tl.A, wykB: po2a && !tl.B, wykT: po2a && !tl.T,
      tlumiA: tl.A, tlumiB: tl.B, tlumiT: tl.T, po221,
      sc: ref ? [...new Set(roz.map((d) => bezIdentyfikatorow(d.s)))].sort().slice(0, 4) : ['(nowa)'],
      chwila: chwilaEncji(e.kind, ev), chwilaP: qv ? chwilaEncji(e.kind, qv) : '', chwilaPrzed: xv ? chwilaEncji(e.kind, xv) : '',
      tresci: trescWizyt(e.kind, ev),
    };
    // E3-PR0b2b: notatka równa tutejszej sprzed scalenia poza rev — zapis samego rev (klasa niezależna od ładunku).
    r.klasa = e.kind === 'pnote' && xv && rowne(kanon2a(e.kind, xv), ke) ? 'sam rev notatki' : klasaEcha(e.kind, ref, ev, roz, po, { rekordZlozony });
    r.przydzial = przydzial(r);
    out.push(r);
  }
  return out;
}

// Kandydaci odsyłania (E3-PR0c): snapshotId wersji ładunku — patients[].snapshots[] i snapshotTombstones[].
export function kandydaciEcha(ladunek) {
  const s = new Set();
  for (const p of (ladunek && ladunek.patients) || []) for (const w of (p && p.snapshots) || []) if (w && w.snapshotId) s.add(w.snapshotId);
  for (const e of (ladunek && ladunek.snapshotTombstones) || []) if (e && e.snapshotId) s.add(e.snapshotId);
  return s;
}
// E3-PR0d: kanon wpisu Kosza (kanon 2a bez seq — jak encja wpisu — lista posortowana; ta sama lista ścieżek co w części
// odsyłania sejfu), reguła pola wpisu (bez pól POLA_ZAWSZE.stomb nieobecnych w elemencie ładunku tej samej karty) i samo
// wygaśnięcie treści: ref bez payload w elementach, których odpowiednik po (ta sama karta) treści nie ma, a ref ma —
// równe po; tylko gdy coś zdjęto. Wejście — listy elementów wpisu (eksport).
export const kanonKosza = (l) => kanon2a('stomb', l).map((e) => sortuj(bez(e, ['seq']))).sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : JSON.stringify(x) > JSON.stringify(y) ? 1 : 0));
export function regulaPolaKosza(po, P) {
  return po.map((e) => {
    const p = (P || []).find((x) => obiekt(x) && x.patientId === e.patientId);
    return p ? POLA_ZAWSZE.stomb.filter((s) => wartosc(p, s) === undefined).reduce(usunSciezke, e) : e;
  });
}
export function samoWygasniecie(ref, po) {
  const a = kanonKosza(ref || []), b = kanonKosza(po || []);
  let zdjete = false;
  const r = a.map((e) => {
    const x = b.find((q) => q.patientId === e.patientId);
    if (!x || 'payload' in x || !('payload' in e)) return e;
    zdjete = true;
    return bez(e, ['payload']);
  });
  return zdjete && rowne(kanonKosza(r), b);
}
// Model odsyłania jednego zdarzenia (E3-PR0c, E3-PR0d; opis w nagłówku, MODEL ODSYŁANIA).
const sidWiersza = (r) => (r.kind === 'stomb' ? String(r.key) : String(r.key).split('/')[1]);
export function modelEcha(przed, po, ladunek, { rekordZlozony = null } = {}) {
  if (!ladunek || !obiekt(ladunek.event)) return { wiersze: [], spoza: [] };
  const kartaPrzed = new Map();
  for (const [, e] of encje(przed)) if (e.kind === 'snap') kartaPrzed.set(e.snapshotId, e.patientId);
  const kand = kandydaciEcha(ladunek);
  const a = encje(przed), p = encje(ladunek), b = encje(po);
  const wpis = (m, k) => (m.has(k) ? JSON.parse(m.get(k).val) : null);
  const wiersze = echoScalenia(przed, po, ladunek, { rekordZlozony })
    .filter((r) => (r.kind === 'snap' || r.kind === 'stomb') && r.wykT)
    .filter((r) => { if (r.kind !== 'snap') return true; const sid = sidWiersza(r); return !kartaPrzed.has(sid) || kartaPrzed.get(sid) === r.pid; })
    .filter((r) => {
      if (r.kind !== 'stomb') return true;
      const xv = wpis(a, r.k), qv = wpis(p, r.k), ev = wpis(b, r.k);
      if (xv && samoWygasniecie(xv, ev)) return false;
      return !(qv && samoWygasniecie(qv, regulaPolaKosza(ev, qv)));
    });
  return { wiersze, spoza: wiersze.filter((r) => !kand.has(sidWiersza(r))) };
}
// E3-PR0d: wiersze stomb modelu jednego zdarzenia, które są tylko przez savedAtISO — pole opisu wpisu, które zostaje
// w porównaniu (wersja zachowuje je przy poprawce i „Przywróć”): bez savedAtISO we wszystkich elementach wpis po
// scaleniu równa się wpisowi przed scaleniem albo wpisowi z ładunku po regule pola (kanon wpisu, także przez samo
// wygaśnięcie treści). Sprawdzian długich przebiegów (oczekiwane 0); wynik — klucze takich wierszy (funkcja czysta).
export function wierszeTylkoSavedAtISO(przed, po, ladunek, wiersze) {
  const a = encje(przed), p = encje(ladunek), b = encje(po);
  const wpis = (m, k) => (m.has(k) ? JSON.parse(m.get(k).val).map((e) => bez(e, ['savedAtISO'])) : null);
  return (wiersze || []).filter((r) => r.kind === 'stomb').filter((r) => {
    const xv = wpis(a, r.k), qv = wpis(p, r.k), ev = wpis(b, r.k);
    if (!ev) return false;
    if (xv && (rowne(kanonKosza(xv), kanonKosza(ev)) || samoWygasniecie(xv, ev))) return true;
    if (!qv) return false;
    const t = regulaPolaKosza(ev, qv);
    return rowne(kanonKosza(qv), kanonKosza(t)) || samoWygasniecie(qv, t);
  }).map((r) => r.k);
}

// Usunięcia przez scalanie: encje przed ∪ ładunek, których po scaleniu nie ma, ze śladem w stanie po albo bez śladu.
export function usunieciaScalenia(przed, po, ladunek) {
  const a = encje(przed), b = encje(po), p = encje(ladunek);
  const wersjePo = new Map();
  for (const [, e] of b) if (e.kind === 'snap') wersjePo.set(e.snapshotId, e.patientId);
  const slad = (e) => {
    const [kind, key] = [e.kind, e.key];
    if (kind === 'karta') return b.has('ptomb:' + key) ? 'nagrobek karty' : null;
    if (kind === 'snap') {
      if (b.has('stomb:' + e.snapshotId)) return 'Kosz';
      if (b.has('ptomb:' + e.patientId)) return 'nagrobek karty';
      if (wersjePo.has(e.snapshotId)) return 'pod inną kartą';
      return null;
    }
    if (kind === 'stomb') return wersjePo.has(key) ? 'przywrócona' : null;
    const nagrobek = { pnote: 'pnotetomb', note: 'notetomb', plist: 'plisttomb', pk: 'pktomb' }[kind];
    if (nagrobek) return b.has(`${nagrobek}:${key}`) ? 'nagrobek' : null;
    const zywa = { ptomb: 'karta', pnotetomb: 'pnote', notetomb: 'note', plisttomb: 'plist', pktomb: 'pk' }[kind];
    if (zywa) return b.has(`${zywa}:${key}`) ? 'encja wróciła' : null;
    return null;
  };
  const out = [];
  for (const [k, e] of new Map([...a, ...p])) {
    if (b.has(k)) continue;
    const s = slad(e);
    const oprozniona = e.kind === 'karta' && !s && (e.wersje || []).length > 0 && e.wersje.every((sid) => wersjePo.has(sid) && wersjePo.get(sid) !== e.key);
    out.push({ k, kind: e.kind, rodzaj: rodzajEncji(e.kind), wLadunku: p.has(k), wPrzed: a.has(k), slad: s, bezSladu: !s, podtyp: oprozniona ? 'karta opróżniona (wersje pod inną kartą)' : e.kind === 'stomb' && !s ? 'wpis Kosza bez wersji (wygaśnięcie albo przycięcie)' : null });
  }
  return out;
}

// Wiersze: karta bez własnego snap/stomb w zbiorze zostaje (nośnik — snap najnowszej wersji), z nim — odpada.
export function wierszeEcha(lista) {
  const snapKart = new Set(lista.filter((r) => r.kind === 'snap').map((r) => r.pid));
  const stombKart = new Set(lista.filter((r) => r.kind === 'stomb').flatMap((r) => r.pids || []));
  return lista.filter((r) => r.kind !== 'karta' || (!snapKart.has(r.key) && !stombKart.has(r.key)));
}
// Pokrycie „dziś”: hak (klucz encji albo pfull karty) i model przeglądu (nowa chwila).
export function pokrycie(r, haki) {
  const hak = haki.has(r.k) || (!!r.pid && haki.has('pfull:' + r.pid)) || (r.kind === 'karta' && haki.has('pfull:' + r.key));
  const przeglad = !!r.chwila && r.chwila > (r.chwilaP || '') && r.chwila > (r.chwilaPrzed || '');
  return { hak, przeglad };
}
// Klucze encji kopert (echo na klonach, wpisy haków): klucze encje() każdej koperty i pfull:<karta> porcji pełnej karty.
export function kluczeKopert(koperty) {
  const s = new Set();
  for (const k of koperty) {
    if (k && k.event && k.event.kind === 'pfull') s.add('pfull:' + k.event.key);
    for (const key of encje(k).keys()) s.add(key);
  }
  return s;
}

// Żądania jak Bob_wez.
export const elementCiala = (bajty) => bajty + NAD_KOPERTA;
export const cialo = (elementy) => SZKIELET_CIALA + elementy.reduce((s, d) => s + d, 0) + Math.max(0, elementy.length - 1);
export function partie(bajtyZdarzen) {
  const out = [];
  let biez = [];
  let oversize = 0;
  for (const b of bajtyZdarzen) {
    if (b > LIMITY.zdarzenieBajtow) { oversize += 1; continue; }
    const d = elementCiala(b);
    if (biez.length && (biez.length >= LIMITY.partiaZdarzen || cialo(biez.concat([d])) > LIMITY.partiaBajtow)) { out.push(biez); biez = []; }
    biez.push(d);
  }
  if (biez.length) out.push(biez);
  return { zadan: out.length, oversize, cialo: out.map(cialo), zdarzen: out.map((x) => x.length) };
}
// Strony dostawy (≤ 200 zdarzeń, scalane naraz): indeksy [od, do) kolejnych stron partii.
export const strony = (n, rozmiar = LIMITY.stronaDostawy) => Array.from({ length: Math.ceil(n / rozmiar) }, (_, i) => [i * rozmiar, Math.min(n, (i + 1) * rozmiar)]);
// Przeliczenie wiersza ({ tresci, bajty }) na bajty realne: t treści → t × 32–45 KiB, bez treści — 3 KiB; nigdy mniej
// niż bajty uprzęży.
export const realny = ({ tresci, bajty }) => ({
  od: Math.max(bajty, tresci ? tresci * TRESC_REALNA.od : BEZ_TRESCI_BAJTOW),
  do: Math.max(bajty, tresci ? tresci * TRESC_REALNA.do : BEZ_TRESCI_BAJTOW),
});
export const realne = (wiersze) => wiersze.reduce((s, w) => { const r = realny(w); return { od: s.od + r.od, do: s.do + r.do }; }, { od: 0, do: 0 });
// Budżet minut slotu. strony: [{ t, dev, wiersze: [{ tresci, bajty }] }] (warstwa wyk). Minuta slotu = ten sam t na
// wszystkich urządzeniach. Żądania na urządzenie liczone z bajtów realnych przy górnej granicy (i w uprzęży — druk).
// Wiersz, którego górna granica przekracza limit zdarzenia (oversize: nie wejdzie do żadnej partii zdarzeń, np. stomb
// z sześcioma treściami), liczy się jako osobne żądanie; oversize na urządzenie i w slocie — w wyniku.
export function budzetSlotow(stronyLista) {
  const sloty = new Map();
  for (const s of stronyLista) {
    if (!sloty.has(s.t)) sloty.set(s.t, { t: s.t, wierszy: 0, bajty: 0, realneOd: 0, realneDo: 0, naUrz: new Map() });
    const x = sloty.get(s.t);
    const re = realne(s.wiersze);
    x.wierszy += s.wiersze.length; x.bajty += s.wiersze.reduce((a, w) => a + w.bajty, 0); x.realneOd += re.od; x.realneDo += re.do;
    if (!x.naUrz.has(s.dev)) x.naUrz.set(s.dev, []);
    x.naUrz.get(s.dev).push(...s.wiersze);
  }
  const lista = [...sloty.values()].sort((a, b) => a.t - b.t).map((x) => {
    const urz = {};
    for (const [dev, w] of x.naUrz) {
      const p = partie(w.map((q) => realny(q).do));
      urz[dev] = { wierszy: w.length, zadan: p.zadan + p.oversize, oversize: p.oversize, zadanUprzaz: partie(w.map((q) => q.bajty)).zadan };
    }
    const zadanMaks = Math.max(0, ...Object.values(urz).map((u) => u.zadan));
    const oversize = Object.values(urz).reduce((n, u) => n + u.oversize, 0);
    const ok = { wierszy: x.wierszy <= LIMITY.wierszySlotMin, bajtow: x.realneDo <= LIMITY.bajtowSlotMin, zadan: zadanMaks <= LIMITY.zadanUrzMin };
    return { t: x.t, wierszy: x.wierszy, bajty: x.bajty, realneOd: x.realneOd, realneDo: x.realneDo, zadanMaks, oversize, urz, ok, zgodny: ok.wierszy && ok.bajtow && ok.zadan };
  });
  const maks = (pole) => lista.reduce((m, s) => (m && m[pole] >= s[pole] ? m : s), null);
  return { slotow: lista.length, zgodne: lista.every((s) => s.zgodny), przekroczone: lista.filter((s) => !s.zgodny), maksWierszy: maks('wierszy'), maksRealne: maks('realneDo'), maksZadan: maks('zadanMaks'), oversize: lista.reduce((n, s) => n + s.oversize, 0) };
}
// Okna przesuwne 60 s zegara uprzęży (tylko druk): os — [{ t, dev, wiersze, bajty, zad }].
export function oknaPrzesuwne(os, filtr = () => true) {
  const l = os.filter(filtr).sort((a, b) => a.t - b.t);
  let j = 0, w = 0, b = 0, mw = 0, mb = 0, mz = 0;
  const zd = {};
  for (let i = 0; i < l.length; i += 1) {
    w += l[i].wiersze; b += l[i].bajty; zd[l[i].dev] = (zd[l[i].dev] || 0) + l[i].zad;
    while (l[i].t - l[j].t >= 60000) { w -= l[j].wiersze; b -= l[j].bajty; zd[l[j].dev] -= l[j].zad; j += 1; }
    mw = Math.max(mw, w); mb = Math.max(mb, b); mz = Math.max(mz, ...Object.values(zd));
  }
  return { slotWierszy: mw, slotBajtow: mb, urzZadan: mz };
}

// Licznik świata: scalenia według źródła, wiersze według warstw, klucze literału, koszt reguł, usunięcia, strony.
// regula — klucz REGULY warstwy wyk (literał, budżety, nowe, noweOst); pozostałe reguły liczone obok (diagnostyka).
export function nowyLicznikOdsylania({ regula = 'T', rekordZlozony = null } = {}) {
  if (!REGULY[regula]) throw new Error(`licznik odsyłania: nieznana reguła ${regula}`);
  const wyk = 'wyk' + regula;
  const dodaj = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  const L = {
    regula, scalen: {}, zEchem: {}, wiersze: {}, maks: {}, literal: {}, literal2a: {}, literalNowe: {}, rodzajePrzydzial: {},
    tlumi: { A: {}, B: {}, T: {} }, usuniecia: {}, utrata: {}, przykladyUtraty: [], przyklady: [],
    polaZawsze: { encji: 0, bezPola: 0, przyklady: [], kandydaci: {} },
    strony: [], partieDostaw: { n: 0, maks: 0, ponad200: 0, opisMaks: '' }, os: [], brakNosnika: 0, brakNosnikaKlasy: {}, bladBuildera: 0, ms: 0,
    // czas pracy uprzęży tylko dla licznika poza echem stron (ms; druk): eksporty po każdym zdarzeniu dostawy, eksporty
    // przed scaleniem w pół wymiany, powtórka partii — wypełnia uprząż
    msDodatkowe: { eksportyDostawy: 0, eksportyWymiany: 0, powtorka: 0 },
    // echo na klonach — wypełnia uprząż: drugi rząd na klonach bieżących urządzeń, przez starszą aplikację (do nadawcy
    // i do drugiego bieżącego), obiegi wymiany (1…MAKS_OBIEGOW) i pętle ponad limit
    klony: { prob: 0, urzadzen: 0, drugiRzad: 0, drugiRzad2a: 0, przezStarsza: { prob: 0, doNadawcy: 0, doInnych: 0, po2a: 0 }, obiegi: Array(MAKS_OBIEGOW).fill(0), ponadObiegi: 0, przyklady: [], ms: 0 },
    // E3-PR0c: warstwa „odesłane” — koperty echa sejfu wobec modelu odsyłania (zapiszOdeslane)
    odeslane: { literal: {}, ponadModel: 0, nieodeslane: 0, przyklady: [] },
  };
  L.echo = (przed, po, ladunek, o = {}) => echoScalenia(przed, po, ladunek, { rekordZlozony, ...o });
  // Jedno scalenie. natychmiast — przegląd rusza zaraz po tym scaleniu (drenaż zdarzeń ze zmianą).
  L.zapiszScalenie = (zrodlo, lista, haki = new Set(), { natychmiast = false, opis = '' } = {}) => {
    if (!ZRODLA.includes(zrodlo)) throw new Error(`licznik odsyłania: nieznane źródło ${zrodlo}`);
    dodaj(L.scalen, zrodlo);
    const war = {};
    for (const w of ['surowe', 'po2a', 'wykA', 'wykB', 'wykT', 'po221']) war[w] = wierszeEcha(w === 'surowe' ? lista : lista.filter((r) => r[w]));
    war.wyk = war[wyk];
    const pok = new Map(lista.map((r) => [r.k, pokrycie(r, haki)]));
    war.nowe = war.wyk.filter((r) => { const p = pok.get(r.k); return !p.hak && !(natychmiast && p.przeglad); });
    war.noweOst = war.wyk.filter((r) => { const p = pok.get(r.k); return !p.hak && !p.przeglad; });
    if (war.surowe.length) dodaj(L.zEchem, zrodlo);
    for (const [w, l] of Object.entries(war)) { dodaj(L.wiersze, `${zrodlo}:${w}`, l.length); L.maks[`${zrodlo}:${w}`] = Math.max(L.maks[`${zrodlo}:${w}`] || 0, l.length); }
    for (const r of war.wyk) { dodaj(L.literal, kluczLiteralu(zrodlo, r)); dodaj(L.rodzajePrzydzial, `${zrodlo}|${r.rodzaj}|${r.wLadunku ? 'w ładunku' : 'spoza'}|${r.przydzial}`); }
    for (const r of war.po2a) dodaj(L.literal2a, kluczLiteralu(zrodlo, r));
    for (const r of war.nowe) dodaj(L.literalNowe, kluczLiteralu(zrodlo, r));
    for (const r of lista) for (const n of Object.keys(L.tlumi)) if (r['tlumi' + n]) dodaj(L.tlumi[n], `${zrodlo}|${r.klasa}`);
    if (war.wyk.length && L.przyklady.length < 16) L.przyklady.push(`${opis} → ${war.wyk.map((r) => `${r.kind}${r.wLadunku ? '' : '(spoza)'} ${String(r.key).slice(0, 8)} ${r.klasa} [${r.sc.join(',')}]`).join('; ')}`);
    return war;
  };
  // Strażnik pól zawsze obecnych: ładunek od bieżącej wersji (wie to wołający) — wersje i wpisy Kosza, które mają rodzica
  // pola z POLA_ZAWSZE, a nie mają samego pola (warunek reguły T: 0). Kandydaci z POLA_KANDYDACI liczeni osobno.
  L.sprawdzPolaZawsze = (ladunek, opis = '') => {
    const brakuje = (x, s) => { const g = s.split('.'); const rodzic = g.length > 1 ? wartosc(x, g.slice(0, -1).join('.')) : x; return obiekt(rodzic) && rodzic[g[g.length - 1]] === undefined; };
    for (const [, e] of encje(ladunek)) {
      if (!POLA_ZAWSZE[e.kind]) continue;
      const v = JSON.parse(e.val);
      for (const x of e.kind === 'stomb' ? v : [v]) {
        L.polaZawsze.encji += 1;
        const brak = POLA_ZAWSZE[e.kind].filter((s) => brakuje(x, s));
        if (brak.length) { L.polaZawsze.bezPola += 1; if (L.polaZawsze.przyklady.length < 6) L.polaZawsze.przyklady.push(`${opis} ${e.kind} ${String(e.key).slice(0, 8)} bez ${brak.join(',')}`); }
        for (const s of POLA_KANDYDACI[e.kind] || []) {
          const kl = `${e.kind}:${s}`;
          const k = L.polaZawsze.kandydaci[kl] || (L.polaZawsze.kandydaci[kl] = { encji: 0, bezPola: 0 });
          k.encji += 1; if (brakuje(x, s)) k.bezPola += 1;
        }
      }
    }
  };
  L.zapiszUsuniecia = (zrodlo, lista, opis = '') => {
    for (const u of lista) {
      dodaj(L.usuniecia, `${zrodlo}|${u.rodzaj}|${u.wLadunku ? 'w ładunku' : 'tylko przed'}|${u.slad || 'bez śladu'}`);
      if (u.bezSladu) { dodaj(L.utrata, `${zrodlo}|${u.rodzaj}${u.podtyp ? ' — ' + u.podtyp : ''}`); if (L.przykladyUtraty.length < 10) L.przykladyUtraty.push(`${opis} ${u.k.slice(0, 20)}${u.podtyp ? ' (' + u.podtyp + ')' : ''}`); }
    }
  };
  // Builder zwrócił null (brak nośnika) — wiersz poza bajtami i budżetem, liczony według klucza literału.
  L.zapiszBrakNosnika = (zrodlo, r) => { L.brakNosnika += 1; dodaj(L.brakNosnikaKlasy, kluczLiteralu(zrodlo, r)); };
  // Strona = minuta: wiersze warstwy wyk i po2a ([{ tresci, bajty }]); t — krok zegara uprzęży, dev — urządzenie.
  L.zapiszStrone = (zrodlo, wiersze, wiersze2a, { t, dev, opis = '' }) => {
    if (!Number.isFinite(t) || !dev) throw new Error('licznik odsyłania: strona bez chwili albo urządzenia');
    L.strony.push({ zrodlo, opis, t, dev, wiersze: wiersze.map(({ tresci, bajty }) => ({ tresci, bajty })), wiersze2a: wiersze2a.map(({ tresci, bajty }) => ({ tresci, bajty })) });
  };
  // Partia dostawy (zdarzeń pobranych naraz) — druk: największa i ile ponad jedną stronę (200).
  L.zapiszPartie = (n, opis = '') => { const P = L.partieDostaw; P.n += 1; if (n > LIMITY.stronaDostawy) P.ponad200 += 1; if (n > P.maks) { P.maks = n; P.opisMaks = opis; } };
  // Oś czasu wysyłek (okna przesuwne, druk): zrodlo — 'wlasne', 'haki', 'echo' (warstwa wyk), 'echo2a' (naiwna).
  L.wyslij = (dev, t, zrodlo, bajty) => { if (bajty.length) L.os.push({ t, dev, zrodlo, wiersze: bajty.length, bajty: bajty.reduce((a, b) => a + b, 0), zad: partie(bajty).zadan }); };
  // E3-PR0c: koperty echa sejfu (jawne) wobec wierszy modelu odsyłania jednego zdarzenia.
  // E3-PR0d2: wiersze to wiersze E3-PR0c/E3-PR0d i wiersze ze stanu partii. Wiersze są tu zebrane po kluczu (jeden na
  // klucz): przy wierszu E3-PR0d i wierszu ze stanu tego samego klucza w jednej partii wszystkie koperty klucza dostają
  // klasę ostatniego (krotność — E3-PR0h); liczby odesłań ze stanu — z S.stat.zeStanu testu A ≡ B.
  L.zapiszOdeslane = (zrodlo, koperty, wiersze, opis = '') => {
    if (!ZRODLA.includes(zrodlo)) throw new Error(`licznik odsyłania: nieznane źródło ${zrodlo}`);
    const O = L.odeslane;
    const model = new Map(wiersze.map((r) => [r.k, r]));
    const wyslane = new Set();
    for (const k of koperty) {
      const klucz = `${k.event.kind}:${k.event.key}`;
      wyslane.add(klucz);
      const r = model.get(klucz);
      if (r) dodaj(O.literal, kluczLiteralu(zrodlo, r));
      else { O.ponadModel += 1; if (O.przyklady.length < 10) O.przyklady.push(`${opis} ponad model: ${klucz.slice(0, 24)}`); }
    }
    for (const [klucz] of model) if (!wyslane.has(klucz)) { O.nieodeslane += 1; if (O.przyklady.length < 10) O.przyklady.push(`${opis} nieodesłane: ${klucz.slice(0, 24)}`); }
  };
  L.podsumuj = () => {
    const wyk2a = L.strony.map((s) => ({ t: s.t, dev: s.dev, wiersze: s.wiersze2a }));
    const oversize = L.strony.reduce((n, s) => n + partie(s.wiersze.map((w) => w.bajty)).oversize, 0);
    return {
      regula: L.regula, scalen: L.scalen, zEchem: L.zEchem, wiersze: L.wiersze, maks: L.maks, literal: L.literal, literal2a: L.literal2a, literalNowe: L.literalNowe, rodzajePrzydzial: L.rodzajePrzydzial,
      tlumi: L.tlumi, usuniecia: L.usuniecia, utrata: L.utrata, przykladyUtraty: L.przykladyUtraty, polaZawsze: L.polaZawsze,
      stron: L.strony.length, partieDostaw: L.partieDostaw, oversize, brakNosnika: L.brakNosnika, brakNosnikaKlasy: L.brakNosnikaKlasy, bladBuildera: L.bladBuildera,
      budzet: budzetSlotow(L.strony), budzetNaiwny: budzetSlotow(wyk2a),
      okno: { wykonalne: oknaPrzesuwne(L.os, (x) => x.zrodlo !== 'echo2a'), echo: oknaPrzesuwne(L.os, (x) => x.zrodlo === 'echo'), naiwne: oknaPrzesuwne(L.os, (x) => x.zrodlo !== 'echo') },
      przyklady: L.przyklady, klony: L.klony, odeslane: L.odeslane, ms: Math.round(L.ms), msDodatkowe: Object.fromEntries(Object.entries(L.msDodatkowe).map(([k, v]) => [k, Math.round(v)])),
    };
  };
  return L;
}

// ── Model odsyłania ukrytego wpisu Kosza karty usuniętej (E3-PR0d2; opis w nagłówku) ─────────────────────────────────
// Domknięcie wywołań Bkz_wygrywa, Bkz_zmiana i Bgw_stan w vilda_vault.js (25 funkcji) i jedyna zmienna modułu w nim;
// strażnik „wycięte = sejf” w tests/unit/licznik-odsylania.test.mjs.
export const WYGRYWA_Z_SEJFU = Object.freeze(['Bm1', 'Bkz_pozniejsza', 'Bkz_chwilaKosza', 'Bkz_chwilaRetencji', 'Bkz_ostatnie', 'Bkz_zmiana',
  'Bkz_znanaZmiana', 'Bkz_wygrywa', 'Bpk_przypieta', 'Bgw_rej', 'Bgw_g', 'Bgw_stan', 'Bgw_kanon', 'Bgw_odcisk', 'Bgw_porownaj', 'Bgw_pozniejszy',
  'Bgw_zWpisu', 'Bpk_opis', 'Bpk_tr', 'Bpk_odcisk', 'Bgw_czKlucz', 'Bgw_czZTresci', 'Bpk_zWpisu', 'Bpk_revPary', 'mt']);
export const STALE_WYGRYWA = Object.freeze(['Bgw_czPam']);
// Tekst deklaracji stałej modułu n z tekstu sejfu (od „const” do pierwszego średnika; strażnik w teście licznika
// porównuje go z deklaracją z drzewa składni) — jedno źródło wycinka stałych dla licznika i testów.
export function stalaZKodu(src, n) {
  const m = src.match(new RegExp(`\\n(const ${n} = [^;]*;)`));
  if (!m) throw new Error(`licznik odsyłania: brak stałej ${n} w tekście sejfu`);
  return m[1];
}
// Rozstrzygnięcie „nagrobek wygrywa z wersją S” z tekstu sejfu (src) i funkcji wycinającej (wytnij(src, nazwa) — tekst
// deklaracji); moduł nie czyta plików. Wynik (e, S) → Bkz_wygrywa(e, Bkz_zmiana(S), Bgw_stan(S, S.payload)) — prawda,
// gdy element e wpisu Kosza wygrywa z wersją S.
export function wygrywaZKodu(src, wytnij) {
  const stale = STALE_WYGRYWA.map((n) => stalaZKodu(src, n));
  const kod = `${stale.join('\n')}\n${WYGRYWA_Z_SEJFU.map((n) => wytnij(src, n)).join('\n')}\nreturn function (e, S) { return Bkz_wygrywa(e, Bkz_zmiana(S), Bgw_stan(S, S.payload)); };`;
  return new Function(kod)();
}
export const KLASA_ZE_STANU = 'ukryty wpis karty usuniętej, późniejsza wersja nie weszła';
// nagrobekWygrywa(e, S) — z wygrywaZKodu; S wygrywa z wpisem, gdy z żadnym jego elementem nie przegrywa.
export function modelStanu(przed, po, ladunek, { nagrobekWygrywa } = {}) {
  if (!ladunek || !obiekt(ladunek.event) || typeof nagrobekWygrywa !== 'function') return [];
  const zywe = new Set();
  const karty = new Set();
  for (const p of (po && po.patients) || []) { karty.add(p.patientId); for (const q of p.snapshots || []) zywe.add(q.snapshotId); }
  const nagrobki = new Map();
  for (const t of (po && po.tombstones) || []) {
    if (!t || typeof t.patientId !== 'string' || !t.patientId || typeof t.deletedAtISO !== 'string' || !t.deletedAtISO) continue;
    const n = nagrobki.get(t.patientId);
    if (!n || t.deletedAtISO > n) nagrobki.set(t.patientId, t.deletedAtISO);
  }
  const wpisy = new Map();
  for (const e of (po && po.snapshotTombstones) || []) {
    if (!obiekt(e) || !e.snapshotId) continue;
    if (!wpisy.has(e.snapshotId)) wpisy.set(e.snapshotId, []);
    wpisy.get(e.snapshotId).push(e);
  }
  const kartaJest = (e) => typeof e.patientId !== 'string' || !e.patientId || karty.has(e.patientId);
  const out = [];
  const byly = new Set();
  for (const p of ladunek.patients || []) {
    if (!obiekt(p) || typeof p.patientId !== 'string' || !p.patientId) continue;
    for (const S of p.snapshots || []) {
      if (!obiekt(S) || !S.snapshotId) continue;
      const v = S.snapshotId;
      if (byly.has(v) || zywe.has(v)) continue;
      const b = wpisy.get(v) || [];
      if (!b.length) continue;
      let wygr;
      try { wygr = b.every((e) => !nagrobekWygrywa(e, S)); } catch { wygr = true; }
      if (!wygr || b.some(kartaJest)) continue;
      const n = nagrobki.get(p.patientId);
      const zapis = typeof p.lastSavedAtISO === 'string' ? p.lastSavedAtISO : '';
      if (karty.has(p.patientId) || !n || n < zapis) continue;
      byly.add(v);
      out.push({ k: 'stomb:' + v, kind: 'stomb', rodzaj: rodzajEncji('stomb'), key: v, pid: p.patientId, wLadunku: false, klasa: KLASA_ZE_STANU, przydzial: 'E3-PR0d2', zeStanu: true, retencja: b.some((e) => e.powod === 'retencja') });
    }
  }
  return out;
}
// Ładunki partii, które wymieniają wersję v (patients[].snapshots[] albo snapshotTombstones[]).
const wymienia = (l, v) => obiekt(l) && ((l.patients || []).some((p) => obiekt(p) && (p.snapshots || []).some((q) => obiekt(q) && q.snapshotId === v))
  || (l.snapshotTombstones || []).some((e) => obiekt(e) && e.snapshotId === v));
export function ponadGranica(ladunki, koperty) {
  const n = new Map();
  for (const k of koperty || []) if (k && k.event && k.event.kind === 'stomb') n.set(k.event.key, (n.get(k.event.key) || 0) + 1);
  const out = [];
  for (const [v, ile] of n) {
    const zdarzen = (ladunki || []).filter((l) => wymienia(l, v)).length;
    if (ile > zdarzen) out.push({ v, n: ile, zdarzen });
  }
  return out;
}
export function przypiszKoperty(koperty, wiersze, zeStanu) {
  const echo = new Map();
  for (const r of wiersze || []) if (r.kind === 'stomb') echo.set(r.key, (echo.get(r.key) || 0) + 1);
  const stan = new Map();
  for (const r of zeStanu || []) { if (!stan.has(r.key)) stan.set(r.key, []); stan.get(r.key).push(r); }
  return (koperty || []).map((k) => {
    if (k.event.kind !== 'stomb') return { src: 'echo' };
    const v = k.event.key;
    if ((echo.get(v) || 0) > 0) { echo.set(v, echo.get(v) - 1); return { src: 'echo' }; }
    const r = (stan.get(v) || []).shift();
    if (!r) throw new Error(`licznik odsyłania: koperta stomb ${String(v).slice(0, 8)} bez wiersza modelu`);
    return { src: 'stan', retencja: !!r.retencja };
  });
}
