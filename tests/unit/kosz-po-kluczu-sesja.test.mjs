// P-KOSZ-PO-KLUCZU (PR-E3) — przerwane scalenie, zmiana sesji i błąd zapisu listy przy wersji pod inną kartą niż jej
// wpis kosza (A1), przy ostatniej wersji karty, która przyjmuje nowszą treść (Q8, A3), i przy rekordzie W3 wersji
// wspólnej dwóm kartom (A4).
//
// Reguła sesji (P-CHMURA-OPIS). Odczyt wersji po kluczu, decyzja i usunięcie wersji spod innej karty, zapis wersji
// zostawionej wyjątkiem ostatniej wersji karty i zapis rekordu W3 — tylko w sesji scalania: Bses_pilnuj tuż przed każdym
// zapisem, bez await pomiędzy. Bkz_obceKarty czyta wersje karty zaraz po sprawdzeniu sesji przy blokadzie (przed
// getPatientForUser), a każdą decyzję oddaje do ctx (Bkz_przegral i mapa.delete, mapa.set, Bkz_doUsuniecia.push) dopiero po
// ponownym Bses_pilnuj — decyzja powstaje tylko z rekordów sesji scalania (dodatkowe sprawdzenia sesji). Wersje spod innej
// karty znikają dopiero po zapisie listy kosza z ich treścią (Bkz_usunZObcych po Bkz_zmienListe): przerwanie przed nim
// albo nieudany zapis listy zostawia je do następnego scalenia (jak kartę w P-KOSZ-USUWANEJ-KARTY), a nie gubi treści;
// świeży odczyt pod blokadą karty usuwa tylko rekord z chwili decyzji, a zbiór kart usuniętych (Bpc_usunieta) dostaje
// kartę tylko w sesji scalania.
//
// Stan E4b (jak E4b w kosz-po-kluczu.test.mjs): na K „Testowy Jan” X (trzy wizyty, x = druga, 125 cm / 23 kg), „Testowa
// Ola” Y i Z; komplet na P i C. K: „Scal pacjentów” X → Y, Y → Z; P (bez wiedzy o scaleniach) poprawia x w starej X na
// 74 kg; K daje x do kosza (pod Z). Oczekiwane wszędzie po rundach: kosz x 74 (rev 2), x w żadnej karcie, karty X nie ma.
//
// Przypadki (zmierzone na kodzie tego PR; na bazie 8240e0df — niżej):
//   E-S1 P: zalogowanie od nowa (to samo konto) zaraz po zapisie listy kosza z x w scalaniu, które znalazło x pod X
//        (odczyt po kluczu), przed usunięciem x i X — SESSION_CHANGED, po przełączeniu żadnego zapisu, na P karta X z x
//        74 i kosz 74; po rundach zbieżnie, bez karty X.
//   E-S2 P: konto B na tym samym magazynie z kopią kart A; przełączenie na B zaraz po świeżym odczycie wersji X przed ich
//        usunięciem (Bkz_usunZObcych) — karta X konta B zostaje, po przełączeniu żadnego zapisu; po zalogowaniu A
//        i rundach zbieżnie.
//   E-S3 P: każdy zapis listy z x nie udaje się (trwały błąd magazynu) — scalenie bez błędu, X z x 74 zostaje na P (bez
//        zapisanej treści nie usuwamy); K bierze 74 z ładunku P; po ustąpieniu błędu zbieżnie.
//   E-S4 P: zapis listy z x nie udaje się raz — X z x 74 zostaje do następnego scalenia, potem zbieżnie.
//   E-S5 P: przełączenie na konto B przy odczycie x po kluczu (Bkz_gdzieIndziej) — po przełączeniu żadnego zapisu.
//   E-S8 P: w trakcie zapisu listy kosza z x (decyzja: usunąć x spod X) druga karta przeglądarki zapisuje pod X nowszy
//        rekord x (80 kg, rev 2, późniejsza chwila zmiany) — świeży odczyt w Bkz_usunZObcych go widzi: x 80 i karta X
//        zostają, nic nie ginie; po rundach na trzech x 80 (rev 2) pod X, bez wpisu kosza (zmiana późniejsza niż kosz).
//        Mutant „usuń bez porównania rev i chwili zmiany ze świeżego odczytu”: x 80 i karta X znikają na P.
//   E-S9 P (S3): konto B z kopią kart A ma cień (2 rekordy) wpisów retencji swojej żywej karty X; przełączenie na B zaraz
//        po usunięciu karty X konta A w Bkz_usunZObcych — SESSION_CHANGED, po przełączeniu żadnego zapisu; następna
//        zmiana listy kosza konta B (B daje do kosza nową wizytę w Z) zostawia oba rekordy cienia B.
//   E-S6 częściowe usunięcie (E4b-2w: P dopisuje do X nową wizytę, X zostaje z nią): konto B z kopią kart A, przełączenie
//        na B zaraz po świeżym odczycie wersji X przed usunięciem x — x w X konta B zostaje, po przełączeniu żadnego
//        zapisu; po zalogowaniu A i rundach na trzech X[nowa] i kosz 74.
//   E-S7 częściowe usunięcie, zapis listy z x nie udaje się raz — x zostaje w X do następnego scalenia, potem zbieżnie.
//   S1-a (decyzja Bkz_obceKarty) E4b + karta W (dwie wizyty) na trzech; K daje do kosza także w1 (P usuwa w1 w pętli
//        kart, ctx.Bkz_po). Konto B z kopią kart A; przełączenie na B zaraz po getPatientForUser(b, X)
//        w Bkz_obceKarty — SESSION_CHANGED; jedyny zapis po przełączeniu to lista konta A (Bkz_po, z założenia,
//        P-CHMURA-OPIS), po zalogowaniu A cała czytelna dla A; po rundach na trzech kosz 74 (rev 2), bez X.
//   S1-b jak S1-a, a konto B poprawiło swoją kopię x na 99 kg po koszu K — lista A zachowuje wpis kosza x (decyzja
//        tylko z rekordów sesji scalania); po rundach kosz 74.
//   S1-c jak S1-a, ponowne zalogowanie konta A w tym samym miejscu — SESSION_CHANGED, tylko lista konta A; po rundach
//        kosz 74, bez X.
//   Q8-S1 (jan2: dwie wizyty s1, x) C poprawia x na 74; P daje s1 do kosza (x ostatnią wersją karty P); K (zegar +10 min)
//        daje x do kosza; P←K, potem P←C: x z C przegrywa z koszem, a jej treść (później) przyjmuje zostawiona x na P.
//        Przełączenie na B w szyfrowaniu tej treści (Bkz_zostawOstatnia) — SESSION_CHANGED, żadnego zapisu po
//        przełączeniu; po zalogowaniu A to samo scalenie P←C: na P karta x 74 i kosz 74 (rev 1); po rundach na trzech
//        kosz x 74 (rev 1), na P karta x 74 (K trzyma s1, C x — obecność E1), runda kontrolna bez zapisów.
//   Q8-S2 (M52) P: X → Y i do kosza wszystko w Y poza x (Y = [x], rev 1); C (bez wiedzy): X → W → V (x rev 2 na C, ta
//        sama treść i chwila zmiany); K (bez wiedzy) daje x do kosza w X. P←K: x pod Y — żywą kartą docelową scalenia
//        P, bez nagrobka pacjenta — zostaje wyjątkiem ostatniej wersji (F3: Bkz_zostawOstatnia, nic nowszego). P←C:
//        wyższa rev pominiętej x z ładunku (Bpk_podnies w Bkz_obceKarty) — przełączenie na B w odszyfrowaniu x
//        w Bkz_obceKarty, przed podniesieniem — SESSION_CHANGED, żadnego zapisu po przełączeniu (mutant bez
//        Bses_pilnuj w Bpk_podnies pada na tym teście); po zalogowaniu A to samo scalenie: x rev 2 w Y; po rundach kosz 23 (rev 2) na trzech, na P Y[x].
//   Q8-S3 jak Q8-S1 bez +10 min, ale C dostaje kosz K przed P (C←K: x 74 z C przegrywa, jej treść idzie do wpisu kosza
//        C); P←C: ładunek C nie ma już x, więc zostawiona x na P przyjmuje treść z samego wpisu kosza (Bpc_pelny
//        w Bkz_zostawOstatnia, nie kandydat z ładunku). Przełączenie na B w szyfrowaniu tej treści — SESSION_CHANGED,
//        żadnego zapisu po przełączeniu, P bez zmian (x 23, bez kosza); po zalogowaniu A to samo scalenie: P karta x 74
//        i kosz 74 (rev 1); po rundach kosz 74 (rev 1) na trzech, P [x], K i C [s1] (E1). Mutant „Q8 bez treści
//        nagrobka”: brak szyfrowania w Bkz_zostawOstatnia (test pada na „przełączenie”).
//   A4-S1 K: „Scal pacjentów” X → Y → Z i gwiazdka x pod Z; P (bez wiedzy) poprawia x w starej X na 74; delta karty X
//        z P na K — rekord W3 x pod Z (treść P, gwiazdka K; Bsw_poprawTresc). Przełączenie na konto B w szyfrowaniu
//        rekordu — SESSION_CHANGED, żadnego zapisu po przełączeniu; po zalogowaniu A to samo scalenie daje x 74* pod Z.
//   A4-S1b (S2) jak A4-S1 bez gwiazdki, a K daje do kosza wszystkie wersje Z późniejsze niż x (x — najnowsza wersja Z,
//        nagłówek Z z niej); przełączenie na B zaraz po zapisie rekordu x w Bsw_poprawTresc — SESSION_CHANGED,
//        żadnego zapisu po przełączeniu, konto B bez kart. Po zalogowaniu A to samo scalenie: x 74 pod Z.
//   A4-S2 jak A4-S1, pełny ładunek K na P — x spod X (karta w zbiorze N) pod Z w rekordzie W3 (Bsw_przenies, Bsw_doF);
//        to samo.
//   A4-S2b (S2) jak A4-S2, przełączenie na B zaraz po zapisie rekordu x w Bsw_doF — żadnego zapisu po przełączeniu.
//   A4-S2c (S2) jak A4-S2, przełączenie na B zaraz po zapisie karty F w Bsw_doF (przed Bsw_poOddaniu) — żadnego zapisu
//        po przełączeniu.
//   NR-S1 (np-ret-A1, Bsw_przezyteRetencji) P przypina x w X; C (bez wiedzy) przycina X; K (bez wiedzy o obu): X → Y;
//        K←C (A1 przycina na K kopię x pod Y). P←K: przypięta x spod X przechodzi pod Y. Zalogowanie od nowa zaraz po
//        zapisie x pod Y — SESSION_CHANGED, żadnego zapisu po przełączeniu (nagłówek Y, karta X); to samo scalenie od
//        nowa — x 23* pod Y, bez karty X; po rundach to samo na trzech, runda kontrolna bez zapisów.
//   NR-S2 jak NR-S1, konto B z kopią kart A; przełączenie na B zaraz po świeżym odczycie wersji X pod blokadami obu
//        kart — żadnego zapisu po przełączeniu, karta X konta B z x zostaje; po zalogowaniu A to samo.
//   F-S1 K: X → Y → Z (bez poprawki i kosza); konto B z kopią kart A ma cień (2 rekordy) swojej karty X; na P (konto A)
//        decyzje 'zabierz' opróżniają X, a Bsw_poOddaniu ją usuwa — przełączenie na B zaraz po removePatientForUser(A,
//        X): SESSION_CHANGED, po przełączeniu żadnego zapisu, następna zmiana listy kosza konta B zostawia oba rekordy
//        cienia B; po zalogowaniu A i rundach x pod Z na trzech, bez X.
//   NR-S3 stan npret, konto B z kopią kart A; przełączenie na B po odczycie karty X w Bsw_przezyteRetencji — po
//        przełączeniu żadnego wywołania magazynu w koncie B; po zalogowaniu A x pod Y.
//   S-K1 K dopisuje do X nową wizytę; przełączenie na B po odczycie po kluczu tej wersji (Bsw_decyzja) — żadnego zapisu
//        po przełączeniu, konto B bez tej wersji; po zalogowaniu A wizyta pod X.
//   R6-A, R6-B (przegląd 6) nowa karta W z ładunku (2 albo 1 wizyta); przełączenie na B po zapisie wersji W (przed
//        rekordem karty) — SESSION_CHANGED, żadnego zapisu po przełączeniu, konto B bez W; po zalogowaniu A to samo
//        scalenie zakłada W (stan pośredni — wersje bez rekordu karty — leczy następne scalenie).
//   R6-C K dopisuje x2 do X; przełączenie na B po zapisie x2 pod X (przed rekordem karty) — karta X konta B bez zmian;
//        po zalogowaniu A licznik X = 2.
//   R6-D stan npret; przełączenie na B zaraz po odczycie karty X pod blokadami (Bsw_przeniesPrzezyta) — po
//        przełączeniu żadnego wywołania magazynu w koncie B.
//   U-S1, U-S1b karta X zostaje mimo nagrobka (druga karta przeglądarki zapisuje w X wizytę zaraz po starcie scalania);
//        przełączenie na B po odczycie wersji X (licznik X w tyle) albo po odczycie rekordu X w Bsl_usunPacjenta —
//        żadnego zapisu, karta X konta B bez zmian (dodatkowe sprawdzenia sesji).
//   U-S2 przegrany nagrobek X konta A (starszy niż karta); przełączenie na B po odczycie karty w Bsl_zdejmijNagrobek —
//        nagrobek X konta B zostaje; po zalogowaniu A przegrany nagrobek zdjęty (dodatkowe sprawdzenia sesji).
//   F-S2a (przegląd 3, REV3S2) E4b, konto B z kopią kart A; przełączenie na B zaraz po odczycie wersji Z w pętli kart
//        (Bkz_scalKoniec) — SESSION_CHANGED, po przełączeniu żadnego wywołania magazynu w koncie B, także odczytu; po zalogowaniu A
//        zbieżnie.
//   F-S2b M01 (krawędzie) na K: wpis retencji x pod Z z przypiętym rejestrem — odczyt po kluczu jeszcze w pętli kart
//        (od niego zależy Bgw_wskrzes); przełączenie na B zaraz po odczycie wersji Z — żadnego wywołania magazynu
//        w koncie B; po zalogowaniu A to samo scalenie: K X[x:74*] Z[m].
//   F-S2c E4b, przełączenie na B zaraz po liście kart w wyszukaniu po pętli (Bkz_gdzieIndziejRazem, F-C1) — żadnego
//        dalszego odczytu w koncie B; po zalogowaniu A zbieżnie.
//   Strażniki źródła: Bkz_obceKarty — pierwszy odczyt pod blokadą to listSnapshotsForUser (przed getPatientForUser),
//        każda decyzja do ctx i zapis podniesionej rev tuż po Bses_pilnuj; Bkz_usunZObcych — Bses_pilnuj tuż przed
//        removePatientForUser, Bpc_usunieta, nagrobkiem karty (F-R2) i removeSnapshotForUser; Bsl_przeniesWersje —
//        tuż przed Bpc_usunieta(G) (F-S1); Bkz_zostawOstatnia — tuż przed odczytem treści
//        wpisu kosza (Bpc_pelny) i zapisem wersji; Bsw_poprawTresc, Bsw_doF, Bsw_poOddaniu — każdy zapis magazynu tuż
//        po Bses_pilnuj (także removeTombstoneForUser karty F, do którego żaden przypadek tanio nie dochodzi);
//        Bsw_przeniesPrzezyta — zapis wersji pod kartą docelową i zbiór kart usuniętych tuż po Bses_pilnuj;
//        Bkz_gdzieIndziej i Bkz_gdzieIndziejRazem (F-S2) — każdy odczyt magazynu (po kluczu, lista kart, lista wersji)
//        i każda decyzja do ctx po await tuż po Bses_pilnuj (także wpis odłożony do kolejki i lista wersji karty z pętli
//        kart w Bkz_scalKoniec); R6 — Bsl_scalPacjenta (tuż po Bsw_decyzja, rekord karty, zdjęcie nagrobka),
//        Bsw_przezyteRetencji, Bsw_przeniesPrzezyta, Bsl_usunPacjenta i Bsl_zdejmijNagrobek: każdy zapis i każdy odczyt
//        po await tuż po Bses_pilnuj (pierwszy odczyt pod blokadą sprawdza Bsl_podBlokada). Każde
//        z dwóch sprawdzeń w Bkz_obceKarty (kolejność odczytów, sprawdzenie sesji przed decyzją do ctx) samo wystarcza
//        dla S1-a i S1-b: mutant, który usuwa tylko jedno, pada wyłącznie na strażniku; usunięcie obu — także
//        na S1-a i S1-b. Tak samo sprawdzenie sesji przed Bpc_pelny: po przełączeniu treść nagrobka i tak się nie
//        odszyfruje, a zapis zatrzymuje następna straż.
//
// Baza 8240e0df (bez E3): plik się zbiera, czerwone wszystkie (43 z 43) — brak wiersza albo funkcji, w której ma paść
// przełączenie lub którą czyta strażnik (Bkz_usunZObcych, Bkz_obceKarty, Bkz_zostawOstatnia, Bsw_przeniesPrzezyta,
// Bkz_gdzieIndziej: E-S2, E-S6, E-S9, S1-a…c, Q8-S2, strażniki S1, S3, Q8, NR i F-S2), scalenie bez odczytu po kluczu
// i bez Q8 (E-S1, E-S5, Q8-S1, Q8-S3, F-S2c: 'ok' zamiast SESSION_CHANGED; E-S3, E-S4, E-S7, E-S8, F-S2b: hak nie
// rusza; F-S2a: inny stan po rundach), bez rekordu W3 (A4-S1, A4-S2: brak szyfrowania w Bsw_poprawTresc / Bsw_doF),
// bez przeniesienia wersji, która przeżywa przycięcie (NR-S1, NR-S2: K zostaje z kopią x); A4-S1b, A4-S2b, A4-S2c,
// F-S1 i strażniki S2 i F-S1 — dodatkowe sprawdzenia sesji w fazie przeniesień.
//
// Prawdziwy vilda_vault.js (urządzenie z hakiem — magazyn w pamięci z rejestrem wywołań i przełączeniem sesji, jak
// w kosz-usuwanej-karty-sesja.test.mjs; pozostałe z polkrata-uprzaz.mjs), sztuczny zegar (vi.useFakeTimers({ toFake:
// ['Date'] })), automatyczna retencja wyłączona. Haki rozpoznają miejsce po nazwie funkcji sejfu albo po numerze wiersza
// w stosie wywołań: Error.stackTraceLimit = 100 (przy domyślnych 10 nazwa wypadała dopiero na 7. ramce — o krok od
// zniknięcia), a numery wierszy liczymy leniwie, w teście, który ich używa (plik zbiera się na każdym sejfie; bez
// funkcji pada tylko ten test). Dane wyłącznie FIKCYJNE („Testowy Jan”, „Testowa Ola”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repo, SEJF, sztucznyZegar, przesunZegar, urzadzenie, jan, zapisz, gdzie, poprawMase, przypnij, doKosza, sync, rundy, zeruj, zapisy } from './polkrata-uprzaz.mjs';
import { ola } from './s4d7-wspolne.mjs';

Error.stackTraceLimit = 100;
const M = 60e3;
const HASLO_B = 'Druga#Lekarka!2026bb';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const KOD = {};
const kod = (f) => (KOD[f] || (KOD[f] = readFileSync(path.join(repo, f), 'utf8')));
// Wiersz kodu sejfu w funkcji `funkcja` pasujący do re — w stosie wywołań jako „<anonymous>:wiersz:” (new Function
// dokleja dwa wiersze nagłówka). Wywołania magazynu spod blokady karty (Bsl_podBlokada) nie mają w stosie nazwy funkcji.
function wierszW(funkcja, re) {
  const l = kod(SEJF.N).split('\n');
  const od = l.findIndex((x) => x.startsWith(`async function ${funkcja}(`));
  const i = l.findIndex((x, j) => j > od && re.test(x));
  if (od < 0 || i < 0 || l.slice(od + 1, i).some((x) => /^(async )?function /.test(x))) throw new Error(`brak wiersza w ${funkcja}`);
  return `<anonymous>:${i + 3}:`;
}
// Znaczniki wierszy — liczone dopiero w teście, który ich używa.
const znak = {
  usunOdczyt: () => wierszW('Bkz_usunZObcych', /await I\(\)\.listSnapshotsForUser\(b, karta\)/),
  // Te same operacje magazynu; argument i wynik mają teraz synchroniczną blokadę protokołu.
  usunKarte: () => wierszW('Bkz_usunZObcych', /await I\(\)\.removePatientForUser\(b, PatientClinicalWriteValue\(b,karta\)\)/),
  obceKarta: () => wierszW('Bkz_obceKarty', /await I\(\)\.getPatientForUser\(b, karta\)\)\) return PatientClinicalWriteValue\(PatientClinicalOperationAccount,undefined\);/),
  obceTresc: () => wierszW('Bkz_obceKarty', /tresc = await G\(lokalna\.payloadCipher\.iv, lokalna\.payloadCipher\.data\)/),
};

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
const cicho = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
function okno() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: cicho,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', kod(f))(win, win);
  return win;
}

/* Urządzenie z przełączeniem sesji: konto B (zablokowane) i konto A w tym samym magazynie. hak.kiedy(metoda, argumenty,
   stos) — po zakończeniu wywołania magazynu, dla którego zwróci true, raz wykonuje hak.akcja, dopiero potem oddaje
   wynik. hak.blad(metoda, argumenty, stos) — wywołanie magazynu kończy się błędem bez zapisu (raz albo, przy
   hak.bladStaly, za każdym razem). hak.obserwuj(metoda, argumenty, stos) — przy każdym wywołaniu (flagi przypadków).
   Rejestr: [metoda, userId, drugi argument]. Licznik zapisów jak w polkrata-uprzaz.mjs (lista, wersje, karty). */
let nr = 0;
async function urzadzenieH(nazwa) {
  nr += 1;
  const hak = { kiedy: null, akcja: null, blad: null, bladStaly: false, obserwuj: null };
  const v = okno().VildaVault;
  const wyw = [];
  const licz = { lista: 0, wersje: 0, karty: 0 };
  const baza = v.createInMemoryAdapter();
  const px = new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return function (...a) {
      wyw.push([String(k), a[0], a[1]]);
      const stos = hak.kiedy || hak.blad || hak.obserwuj ? String(new Error().stack) : '';
      if (hak.obserwuj) hak.obserwuj(String(k), a, stos);
      if (hak.blad && hak.blad(String(k), a, stos)) {
        if (!hak.bladStaly) hak.blad = null;
        return Promise.reject(new Error('atrapa: zapis nie powiódł się'));
      }
      const licznik = async () => {
        if (k === 'putUserMeta') {
          const stare = await cel.getUserMeta(a[0]);
          if (JSON.stringify((stare && stare.snapshotTombstones) || []) !== JSON.stringify((a[1] && a[1].snapshotTombstones) || [])) licz.lista += 1;
        } else if (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser') licz.wersje += 1;
        else if (k === 'putPatientForUser' || k === 'removePatientForUser') licz.karty += 1;
      };
      const r0 = k === 'putUserMeta' ? licznik().then(() => f.apply(cel, a)) : (licznik(), f.apply(cel, a));
      if (!hak.kiedy || !r0 || typeof r0.then !== 'function') return r0;
      return r0.then(async (w) => {
        if (hak.kiedy && hak.kiedy(String(k), a, stos)) { hak.kiedy = null; await hak.akcja(); }
        return w;
      });
    };
  } });
  v.setStorageAdapter(px);
  const kontoB = await v.createUser(HASLO_B, { label: `Fikcyjna Druga ${nr}`, iterations: 1000 });
  v.lock('manual');
  const haslo = `Kosz#Karty!2026${nr}aa`;
  const kontoA = await v.createUser(haslo, { label: `${nazwa}${nr}`, iterations: 1000 });
  Object.assign(v, { __nazwa: nazwa, __app: 'N', __licz: licz, __px: px, __baza: baza, __haslo: haslo, __uid: kontoA.userId, __uidB: kontoB.userId, __hak: hak, __wyw: wyw });
  return v;
}
// Przełączenie sesji raz, w miejscu wskazanym przez kiedy: blokada i zalogowanie konta B albo ponownie konta A.
function przelacz(v, kiedy, naB) {
  const st = { zrobione: false, od: -1 };
  v.__hak.kiedy = kiedy;
  v.__hak.akcja = async () => {
    st.zrobione = true;
    v.lock('manual');
    if (naB) await v.unlockUser(v.__uidB, HASLO_B);
    else await v.unlockUser(v.__uid, v.__haslo);
    st.od = v.__wyw.length;
  };
  return st;
}
const kto = (v, u) => (u === v.__uid ? 'A' : u === v.__uidB ? 'B' : String(u));
const ZAPIS = /^(put|remove|write|delete|update)/;
const zapisyPo = (v, st) => v.__wyw.slice(st.od).filter(([k]) => ZAPIS.test(k)).map(([k, u]) => `${k}(${kto(v, u)})`);
async function zalogujA(v) { v.__hak.kiedy = null; v.lock('manual'); await v.unlockUser(v.__uid, v.__haslo); }
// Scalenie, które może się skończyć zmianą sesji (SESSION_CHANGED) — wynik: 'ok' albo kod błędu.
async function scal(z, na) {
  try { await sync(z, na); return 'ok'; } catch (er) { if (er && er.code === 'SESSION_CHANGED') return 'SESSION_CHANGED'; throw er; }
}

// Przełączenie sesji raz, w szyfrowaniu (crypto.subtle.encrypt) albo odszyfrowaniu (decrypt), gdy stos wywołań zawiera
// `wStosie` (nazwa funkcji sejfu albo znacznik wiersza): wynik powstaje jeszcze kluczem konta A, przełączenie zaraz
// potem — zapis, który z niego wynika, musi zatrzymać straż sesji.
function przelaczWKrypto(v, metoda, wStosie, naB) {
  const st = { zrobione: false, od: -1 };
  const subtle = globalThis.crypto.subtle;
  const oryg = subtle[metoda].bind(subtle);
  vi.spyOn(subtle, metoda).mockImplementation(async (...a) => {
    if (st.zrobione || !String(new Error().stack).includes(wStosie)) return oryg(...a);
    st.zrobione = true;
    const r = await oryg(...a);
    v.lock('manual');
    if (naB) await v.unlockUser(v.__uidB, HASLO_B);
    else await v.unlockUser(v.__uid, v.__haslo);
    st.od = v.__wyw.length;
    return r;
  });
  return st;
}
const przelaczWSzyfrowaniu = (v, funkcja, naB) => przelaczWKrypto(v, 'encrypt', funkcja, naB);

// E4b: X (3 wizyty, x druga 125 cm / 23 kg), Y, Z na K, komplet na P i C. P z hakiem (konto A), K i C — zwykłe.
async function trzyKarty() {
  sztucznyZegar();
  const P = await urzadzenieH('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
  const x1 = await zapisz(K, jan(120, 20));
  const X = x1.patientId;
  const x2 = await zapisz(K, jan(125, 23), { patientId: X });
  await zapisz(K, jan(130, 25), { patientId: X });
  const Y = (await zapisz(K, ola(110, 18))).patientId;
  const Z = (await zapisz(K, ola(111, 19))).patientId;
  await sync(K, P); await sync(K, C);
  const u = { P, K, C, urz: [P, K, C], X, Y, Z, sid: x2.snapshotId, poKluczu: false };
  // Flaga: P przeczytał x po kluczu, szukając wersji wpisu kosza pod inną kartą (stos z Bkz_gdzieIndziej).
  P.__hak.obserwuj = (k, a, stos) => {
    if (k === 'getSnapshotForUser' && a[1] === u.sid && stos.includes('Bkz_gdzieIndziej')) u.poKluczu = true;
  };
  return u;
}
// Kroki E4b: K: X → Y, Y → Z; P poprawia x w starej X na 74; K daje x do kosza (co minutę).
async function krokiE4b(u, { kosz = true } = {}) {
  przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
  przesunZegar(M); await u.K.mergePatients(u.Y, u.Z);
  przesunZegar(M); await poprawMase(u.P, u.sid, 74);
  if (kosz) { przesunZegar(M); await doKosza(u.K, u.sid); }
  przesunZegar(M);
}
async function stanX(v, sid) {
  const g = await gdzie(v, sid);
  const k = (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
  // rev wpisu kosza — z nagrobka w ładunku synchronizacji (lista kosza jej nie pokazuje)
  const n = k ? ((await v.exportSyncPayload()).snapshotTombstones || []).find((e) => e.snapshotId === sid) : null;
  return { karta: g ? { masa: g.s.payload.user.weight, rev: g.s.rev } : null, kosz: k ? { masa: k.payload ? k.payload.user.weight : null, rev: n ? n.rev : null } : null };
}
const kartaX = async (v, u) => !!(await v.getPatient(u.X));
const bezZapisow = (urz) => Object.fromEntries(urz.map((v) => [v.__nazwa, { lista: 0, wersje: 0, karty: 0 }]));
// Po rundach: ten sam stan x na trzech, bez karty X i 0 zapisów w rundzie kontrolnej.
async function rundyIKontrola(u, oczekiwany, bezX = true) {
  await rundy(u.urz, 3);
  for (const v of u.urz) expect(await stanX(v, u.sid), `${v.__nazwa}: po rundach`).toEqual(oczekiwany);
  if (bezX) for (const v of u.urz) expect(await kartaX(v, u), `${v.__nazwa}: bez karty X`).toBe(false);
  zeruj(u.urz);
  await rundy(u.urz, 1);
  expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(bezZapisow(u.urz));
}
const KOSZ_74 = { karta: null, kosz: { masa: 74, rev: 2 } };
// Zapis listy kosza z wpisem x w scalaniu, które znalazło x pod X po kluczu (P dotąd o koszu x nie wiedział).
const listaZx = (u) => (k, a) => k === 'putUserMeta' && u.poKluczu
  && ((a[1] && a[1].snapshotTombstones) || []).some((e) => e && e.snapshotId === u.sid);
// Konto B na tym samym magazynie z kopią kart konta A (te same patientId i snapshotId — np. kopia zaimportowana).
async function kopiaWB(v) {
  const ex = JSON.parse(JSON.stringify(await v.exportSyncPayload()));
  delete ex.credential; delete ex.passkeys; delete ex.passkeyTombstones; ex.userPreferences = {};
  v.lock('manual'); await v.unlockUser(v.__uidB, HASLO_B);
  await v.mergeSyncPayload(ex);
  v.lock('manual'); await v.unlockUser(v.__uid, v.__haslo);
}
async function zalogujB(v) { v.__hak.kiedy = null; v.lock('manual'); await v.unlockUser(v.__uidB, HASLO_B); }
const kartyB = async (v) => (await v.__baza.listPatientsForUser(v.__uidB)).length;
const cienB = async (v) => ((await v.__baza.listSnapshotShadowKeysForUser(v.__uidB)) || []).length;

describe('P-KOSZ-PO-KLUCZU — E4b: przerwane scalenie, zmiana sesji i błąd zapisu listy', () => {
  it('E-S1: zalogowanie od nowa zaraz po zapisie listy z x, przed usunięciem x i X — SESSION_CHANGED, na P X z x 74 i kosz 74; po rundach zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    const st = przelacz(u.P, listaZx(u), false);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po zapisie listy').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await stanX(u.P, u.sid), 'P: x 74 dalej w X, kosz 74').toEqual({ karta: { masa: 74, rev: 1 }, kosz: { masa: 74, rev: 2 } });
    expect(await kartaX(u.P, u), 'P: karta X zostaje do następnego scalenia').toBe(true);
    await rundyIKontrola(u, KOSZ_74);
  });

  it('E-S2: konto B z kopią kart A, przełączenie na B zaraz po świeżym odczycie wersji X przed ich usunięciem — karta X konta B zostaje; po zalogowaniu A zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    await kopiaWB(u.P);
    const w = znak.usunOdczyt();
    const st = przelacz(u.P, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.X && stos.includes(w), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie przed usunięciem').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(!!(await u.P.__baza.getPatientForUser(u.P.__uidB, u.X)), 'konto B: karta X zostaje').toBe(true);
    expect((await u.P.__baza.listSnapshotsForUser(u.P.__uidB, u.X)).some((s) => s.snapshotId === u.sid), 'konto B: x w X').toBe(true);
    await zalogujA(u.P);
    await rundyIKontrola(u, KOSZ_74);
  });

  it('E-S3: trwały błąd zapisu listy z x na P — X z x 74 zostaje, K bierze 74 z ładunku P; po ustąpieniu błędu zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    u.P.__hak.bladStaly = true;
    u.P.__hak.blad = (k, a) => k === 'putUserMeta' && ((a[1] && a[1].snapshotTombstones) || []).some((e) => e && e.snapshotId === u.sid);
    expect(await scal(u.K, u.P), 'scalenie bez błędu').toBe('ok');
    expect(u.poKluczu, 'kontrola: P szukał x po kluczu').toBe(true);
    expect(await stanX(u.P, u.sid), 'P: X z poprawką zostaje, bez kosza').toEqual({ karta: { masa: 74, rev: 1 }, kosz: null });
    expect(await scal(u.P, u.K)).toBe('ok');
    expect((await stanX(u.K, u.sid)).kosz, 'K po K←P: kosz 74').toEqual({ masa: 74, rev: 2 });
    u.P.__hak.blad = null; u.P.__hak.bladStaly = false;
    await rundyIKontrola(u, KOSZ_74);
  });

  it('E-S4: zapis listy z x nie udaje się raz — X z x 74 zostaje do następnego scalenia, potem zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    let byl = false;
    const l = listaZx(u);
    u.P.__hak.blad = (k, a, s) => { const t = l(k, a, s); if (t) byl = true; return t; };
    expect(await scal(u.K, u.P)).toBe('ok');
    expect(byl, 'atrapa błędu zadziałała').toBe(true);
    expect((await stanX(u.P, u.sid)).karta, 'P: X z x 74 zostaje').toEqual({ masa: 74, rev: 1 });
    await rundyIKontrola(u, KOSZ_74);
  });

  it('E-S5: przełączenie na konto B przy odczycie x po kluczu — po przełączeniu żadnego zapisu; po zalogowaniu A zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    await kopiaWB(u.P);
    const st = przelacz(u.P, (k, a, stos) => k === 'getSnapshotForUser' && a[1] === u.sid && stos.includes('Bkz_gdzieIndziej'), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie przy odczycie po kluczu').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    await zalogujA(u.P);
    await rundyIKontrola(u, KOSZ_74);
  });

  it('E-S8: druga karta przeglądarki zapisuje pod X nowszy rekord x (80 kg) w trakcie zapisu listy — świeży odczyt go widzi: x 80 i karta X zostają; po rundach x 80 pod X na trzech', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    let zrobione = false;
    u.P.__hak.kiedy = listaZx(u);
    u.P.__hak.akcja = async () => {
      zrobione = true;
      // „druga karta”: poprawka x na 80 kg zapisana wprost w magazynie (rev + 1, późniejsza chwila zmiany), bez blokad
      // sejfu — scalanie decydowało na rekordzie sprzed niej
      const rek = (await u.P.__baza.listSnapshotsForUser(u.P.__uid, u.X)).find((q) => q.snapshotId === u.sid);
      const t = await u.P.decryptPayloadForCurrentUser(rek.payloadCipher.iv, rek.payloadCipher.data);
      const c = await u.P.encryptPayloadForCurrentUser({ ...t, user: { ...t.user, weight: 80 } });
      await u.P.__baza.putSnapshotForUser(u.P.__uid, { ...rek, rev: (rek.rev || 0) + 1, updatedAtISO: new Date().toISOString(), payloadCipher: c });
    };
    expect(await scal(u.K, u.P)).toBe('ok');
    expect(zrobione, 'zapis drugiej karty w trakcie zapisu listy').toBe(true);
    expect(await stanX(u.P, u.sid), 'P: x 80 zostaje w X (kosz z chwili decyzji: 74)').toEqual({ karta: { masa: 80, rev: 2 }, kosz: { masa: 74, rev: 2 } });
    expect(await kartaX(u.P, u), 'P: karta X zostaje').toBe(true);
    await rundy(u.urz, 3);
    for (const v of u.urz) {
      expect(await stanX(v, u.sid), `${v.__nazwa}: po rundach x 80, bez kosza`).toEqual({ karta: { masa: 80, rev: 2 }, kosz: null });
      expect((await gdzie(v, u.sid))?.pid, `${v.__nazwa}: x pod X`).toBe(u.X);
    }
    zeruj(u.urz);
    await rundy(u.urz, 1);
    expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(bezZapisow(u.urz));
  });

  it('E-S9: konto B z cieniem swojej karty X, przełączenie na B zaraz po usunięciu karty X konta A — zbiór kart usuniętych bez karty B: następna zmiana listy B zostawia jej cień', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    await kopiaWB(u.P);
    // konto B: przycięcie X (retencja) i scalenie własnego wcześniejszego ładunku — przycięte wersje oddają treść do cienia B
    await zalogujB(u.P);
    const ladunekB = JSON.parse(JSON.stringify(await u.P.exportSyncPayload()));
    expect((await u.P.pruneSnapshotsForPatient(u.X, { recentHours: 0 })).prunedIds, 'kontrola: B przycina x i x1').toHaveLength(2);
    przesunZegar(M); await u.P.mergeSyncPayload(ladunekB);
    expect(await cienB(u.P), 'kontrola: cień konta B — dwa rekordy wpisów karty X').toBe(2);
    przesunZegar(M); const nowaZ = (await u.P.savePatient(ola(115, 22), { dedup: false, patientId: u.Z })).snapshotId;
    await zalogujA(u.P);
    const w = znak.usunKarte();
    const st = przelacz(u.P, (k, a, stos) => k === 'removePatientForUser' && a[1] === u.X && stos.includes(w), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po usunięciu karty X konta A').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    // dalej w sesji B: zmiana listy kosza konta B
    przesunZegar(M); await u.P.moveSnapshotToTrash(u.Z, nowaZ, { odepnij: true });
    expect(await cienB(u.P), 'konto B: cień karty X zostaje').toBe(2);
    await zalogujA(u.P);
    await rundyIKontrola(u, KOSZ_74);
  });
});

describe('P-KOSZ-PO-KLUCZU — E4b-2w: częściowe usunięcie (karta X zostaje z nową wizytą)', () => {
  // P dopisuje do starej X nową wizytę (po poprawce x), zanim dostanie kosz K.
  async function krokiE4b2w(u) {
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
    przesunZegar(M); await u.K.mergePatients(u.Y, u.Z);
    przesunZegar(M); await poprawMase(u.P, u.sid, 74);
    przesunZegar(M); u.nowa = (await u.P.savePatient(jan(135, 27), { dedup: false, patientId: u.X })).snapshotId;
    przesunZegar(M); await doKosza(u.K, u.sid);
    przesunZegar(M);
  }
  // Po rundach: X z samą nową wizytą na trzech.
  async function tylkoNowaWX(u) {
    for (const v of u.urz) {
      const x = await v.getPatient(u.X);
      expect(x && x.snapshots.map((q) => q.snapshotId), `${v.__nazwa}: X z nową wizytą`).toEqual([u.nowa]);
    }
  }
  it('E-S6: konto B z kopią kart A, przełączenie na B zaraz po świeżym odczycie wersji X przed usunięciem x — x w X konta B zostaje; po zalogowaniu A zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b2w(u);
    await kopiaWB(u.P);
    const w = znak.usunOdczyt();
    const st = przelacz(u.P, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.X && stos.includes(w), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie przed usunięciem').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect((await u.P.__baza.listSnapshotsForUser(u.P.__uidB, u.X)).some((q) => q.snapshotId === u.sid), 'konto B: x w X').toBe(true);
    await zalogujA(u.P);
    await rundyIKontrola(u, KOSZ_74, false);
    await tylkoNowaWX(u);
  });
  it('E-S7: zapis listy z x nie udaje się raz — x zostaje w X do następnego scalenia, potem zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b2w(u);
    let byl = false;
    const l = listaZx(u);
    u.P.__hak.blad = (k, a, st) => { const t = l(k, a, st); if (t) byl = true; return t; };
    expect(await scal(u.K, u.P)).toBe('ok');
    expect(byl, 'atrapa błędu zadziałała').toBe(true);
    expect((await stanX(u.P, u.sid)).karta, 'P: x 74 zostaje w X').toEqual({ masa: 74, rev: 1 });
    await rundyIKontrola(u, KOSZ_74, false);
    await tylkoNowaWX(u);
  });
});

describe('P-KOSZ-PO-KLUCZU — S1: zmiana sesji między odczytem wersji karty a decyzją w Bkz_obceKarty', () => {
  // E4b + karta W (dwie wizyty) na trzech; K daje do kosza także w1 (P usuwa w1 w pętli kart, ctx.Bkz_po, P-CHMURA-OPIS).
  // Konto B z kopią kart A; przy edytujB konto B poprawia potem swoją kopię x na 99 kg (później niż kosz K).
  async function e4bZW({ edytujB = false } = {}) {
    const u = await trzyKarty();
    const w1 = await zapisz(u.K, ola(100, 15));
    await zapisz(u.K, ola(101, 16), { patientId: w1.patientId });
    await sync(u.K, u.P); await sync(u.K, u.C);
    await krokiE4b(u);
    await doKosza(u.K, w1.snapshotId);
    przesunZegar(M);
    await kopiaWB(u.P);
    if (edytujB) {
      await zalogujB(u.P);
      przesunZegar(M); await poprawMase(u.P, u.sid, 99);
      await zalogujA(u.P);
      przesunZegar(M);
    }
    return u;
  }
  const naGetX = (u) => { const w = znak.obceKarta(); return (k, a, stos) => k === 'getPatientForUser' && a[1] === u.X && stos.includes(w); };
  const wpisXwA = async (u) => ((await u.P.__baza.getUserMeta(u.P.__uid)).snapshotTombstones || []).find((e) => e.snapshotId === u.sid) || null;
  // Szyfry listy kosza konta A ({ iv, data } i zaślepki cienia z ich rekordem), których konto A nie odszyfruje (po
  // zalogowaniu A) — ścieżki w liście; ile — liczba szyfrów.
  async function obceSzyfryA(v) {
    const sz = [];
    const zbierz = (o, s) => {
      if (!o || typeof o !== 'object') return;
      if (typeof o.iv === 'string' && (typeof o.data === 'string' || o.cien === 1)) sz.push([s, o]);
      for (const [k, x] of Object.entries(o)) zbierz(x, `${s}.${k}`);
    };
    zbierz((await v.__baza.getUserMeta(v.__uid)).snapshotTombstones, 'lista');
    const zle = [];
    for (const [s, c0] of sz) {
      const r = 'data' in c0 ? null : await v.__baza.getSnapshotShadowForUser(v.__uid, c0.iv);
      const c = 'data' in c0 ? c0 : r && r.c;
      try { await v.decryptPayloadForCurrentUser(c.iv, c.data); } catch { zle.push(s); }
    }
    return { ile: sz.length, zle };
  }

  it('S1-a: przełączenie na B po getPatientForUser(b, X) w Bkz_obceKarty — jedyny zapis to lista konta A, bez szyfru konta B; po rundach kosz 74 na trzech', async () => {
    const u = await e4bZW();
    const rB = (await u.P.__baza.listSnapshotsForUser(u.P.__uidB, u.X)).find((s) => s.snapshotId === u.sid);
    expect(rB, 'kontrola: konto B ma x pod X').toBeTruthy();
    const ivB = rB.payloadCipher.iv;
    const st = przelacz(u.P, naGetX(u), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bkz_obceKarty').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu tylko lista konta A (ctx.Bkz_po)').toEqual(['putUserMeta(A)']);
    expect(await wpisXwA(u), 'konto A: wpis kosza x (z ładunku K)').toBeTruthy();
    expect(JSON.stringify(await u.P.__baza.getUserMeta(u.P.__uid)).includes(ivB), 'metadane konta A bez szyfru konta B').toBe(false);
    expect(await u.P.__baza.getSnapshotShadowForUser(u.P.__uid, ivB), 'cień konta A bez szyfru konta B').toBeFalsy();
    await zalogujA(u.P);
    expect(await obceSzyfryA(u.P), 'lista kosza konta A: każdy szyfr (i rekord cienia) czytelny dla konta A').toEqual({ ile: 2, zle: [] });
    await rundyIKontrola(u, KOSZ_74);
  });

  it('S1-b: jak S1-a, a konto B poprawiło swoją kopię x po koszu K — lista konta A zachowuje wpis kosza x; po rundach kosz 74', async () => {
    const u = await e4bZW({ edytujB: true });
    const st = przelacz(u.P, naGetX(u), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bkz_obceKarty').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu tylko lista konta A (ctx.Bkz_po)').toEqual(['putUserMeta(A)']);
    expect(await wpisXwA(u), 'konto A: wpis kosza x zostaje (decyzja nie z rekordu konta B)').toBeTruthy();
    await zalogujA(u.P);
    expect(await stanX(u.P, u.sid), 'P po zalogowaniu A: x 74 w X do następnego scalenia, kosz z ładunku K').toEqual({ karta: { masa: 74, rev: 1 }, kosz: { masa: 23, rev: 2 } });
    await rundyIKontrola(u, KOSZ_74);
  });

  it('S1-c: ponowne zalogowanie A w tym samym miejscu — SESSION_CHANGED, tylko lista konta A; po rundach kosz 74, bez X', async () => {
    const u = await e4bZW();
    const st = przelacz(u.P, naGetX(u), false);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bkz_obceKarty').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu tylko lista konta A (ctx.Bkz_po)').toEqual(['putUserMeta(A)']);
    await rundyIKontrola(u, KOSZ_74);
  });
});

describe('P-KOSZ-PO-KLUCZU — zmiana sesji w zapisie ostatniej wersji karty (Q8) i rekordu W3 (A4)', () => {
  // jan2: s1 i x (125 cm / 23 kg) na K, komplet na P i C.
  async function jan2() {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
    const s1 = await zapisz(K, jan(120, 20));
    const pid = s1.patientId;
    const sid = (await zapisz(K, jan(125, 23), { patientId: pid })).snapshotId;
    await sync(K, P); await sync(K, C);
    return { P, K, C, urz: [P, K, C], X: pid, sid, s1: s1.snapshotId };
  }
  const wizyty = async (v, u) => ((await v.getPatient(u.X)) || { snapshots: [] }).snapshots.map((q) => (q.snapshotId === u.sid ? 'x' : q.snapshotId === u.s1 ? 's1' : '?'));
  // Po rundach: kosz x na trzech, wizyty karty (E1: P trzyma x, K s1), runda kontrolna bez zapisów.
  async function rundyQ8(u, kosz, wiz) {
    await rundy(u.urz, 3);
    for (const v of u.urz) expect((await stanX(v, u.sid)).kosz, `${v.__nazwa}: kosz x po rundach`).toEqual(kosz);
    expect(Object.fromEntries(await Promise.all(u.urz.map(async (v) => [v.__nazwa, await wizyty(v, u)]))), 'wizyty karty po rundach').toEqual(wiz);
    expect((await stanX(u.P, u.sid)).karta, 'P: karta x 74').toEqual({ masa: 74, rev: 1 });
    zeruj(u.urz);
    await rundy(u.urz, 1);
    expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(bezZapisow(u.urz));
  }

  it('Q8-S1: przełączenie na konto B w szyfrowaniu nowszej treści zostawionej ostatniej wersji — SESSION_CHANGED, żadnego zapisu po przełączeniu; po zalogowaniu A i rundach kosz x 74 na trzech, na P karta x 74', async () => {
    const u = await jan2();
    const { P, K, C, X: pid, sid } = u;
    przesunZegar(M); await poprawMase(C, sid, 74);
    przesunZegar(M); await P.moveSnapshotToTrash(pid, u.s1);
    przesunZegar(M); vi.setSystemTime(Date.now() + 10 * M); await K.moveSnapshotToTrash(pid, sid); vi.setSystemTime(Date.now() - 10 * M);
    przesunZegar(M);
    expect(await scal(K, P)).toBe('ok');
    expect((await stanX(P, sid)).karta, 'kontrola: P po P←K — x 23 w karcie (treść kosza nie nowsza)').toEqual({ masa: 23, rev: 0 });
    const st = przelaczWSzyfrowaniu(P, 'Bkz_zostawOstatnia', true);
    expect(await scal(C, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w szyfrowaniu treści zostawionej wersji').toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    vi.restoreAllMocks();
    await zalogujA(P);
    expect(await scal(C, P)).toBe('ok');
    expect(await stanX(P, sid), 'P po ponownym scaleniu: karta x 74 i kosz').toEqual({ karta: { masa: 74, rev: 1 }, kosz: { masa: 74, rev: 1 } });
    await rundyQ8(u, { masa: 74, rev: 1 }, { P: ['x'], K: ['s1'], C: ['x'] });
  });

  it('Q8-S2: przełączenie na konto B w odszyfrowaniu x w Bkz_obceKarty, przed podniesieniem rev (Bpk_podnies) — SESSION_CHANGED, żadnego zapisu po przełączeniu; po zalogowaniu A x rev 2 w Y', async () => {
    const u = await trzyKarty();
    przesunZegar(M); await u.P.mergePatients(u.X, u.Y);
    for (const s of (await u.P.getPatient(u.Y)).snapshots) if (s.snapshotId !== u.sid) { przesunZegar(M); await doKosza(u.P, s.snapshotId); }
    przesunZegar(M); const W = (await zapisz(u.C, ola(112, 20))).patientId;
    przesunZegar(M); const V = (await zapisz(u.C, ola(113, 21))).patientId;
    przesunZegar(M); await u.C.mergePatients(u.X, W);
    przesunZegar(M); await u.C.mergePatients(W, V);
    przesunZegar(M); await doKosza(u.K, u.sid);
    przesunZegar(M);
    expect(await scal(u.K, u.P)).toBe('ok');
    const rek = async () => u.P.__baza.getSnapshotForUser(u.P.__uid, u.sid);
    expect({ karta: (await rek()).patientId === u.Y, rev: (await rek()).rev, Y: (await u.P.getPatient(u.Y)).snapshots.length }, 'kontrola: P po P←K — Y = [x], rev 1').toEqual({ karta: true, rev: 1, Y: 1 });
    const st = przelaczWKrypto(u.P, 'decrypt', znak.obceTresc(), true);
    expect(await scal(u.C, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w odszyfrowaniu x w Bkz_obceKarty').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    vi.restoreAllMocks();
    await zalogujA(u.P);
    expect((await rek()).rev, 'P po zalogowaniu A: x bez zmian (rev 1)').toBe(1);
    expect(await scal(u.C, u.P)).toBe('ok');
    expect({ karta: (await rek()).patientId === u.Y, rev: (await rek()).rev }, 'P po ponownym scaleniu: x rev 2 w Y').toEqual({ karta: true, rev: 2 });
    await rundy(u.urz, 3);
    expect(await stanX(u.P, u.sid), 'P po rundach: Y[x] i kosz').toEqual({ karta: { masa: 23, rev: 2 }, kosz: { masa: 23, rev: 2 } });
    for (const v of [u.K, u.C]) expect(await stanX(v, u.sid), `${v.__nazwa} po rundach: kosz`).toEqual({ karta: null, kosz: { masa: 23, rev: 2 } });
    zeruj(u.urz);
    await rundy(u.urz, 1);
    expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(bezZapisow(u.urz));
  });

  it('Q8-S3: treść z samego wpisu kosza (Bpc_pelny w Bkz_zostawOstatnia) — przełączenie na B w jej szyfrowaniu: SESSION_CHANGED, żadnego zapisu po przełączeniu; po zalogowaniu A i rundach kosz 74 na trzech, na P karta x 74', async () => {
    const u = await jan2();
    const { P, K, C, X: pid, sid } = u;
    przesunZegar(M); await poprawMase(C, sid, 74);
    przesunZegar(M); await P.moveSnapshotToTrash(pid, u.s1);
    przesunZegar(M); await K.moveSnapshotToTrash(pid, sid);
    przesunZegar(M);
    expect(await scal(K, C)).toBe('ok');
    expect(await stanX(C, sid), 'kontrola: C po C←K — x poza kartą, kosz 74').toEqual({ karta: null, kosz: { masa: 74, rev: 1 } });
    const st = przelaczWSzyfrowaniu(P, 'Bkz_zostawOstatnia', true);
    expect(await scal(C, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w szyfrowaniu treści z wpisu kosza').toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    vi.restoreAllMocks();
    await zalogujA(P);
    expect(await stanX(P, sid), 'P po zalogowaniu A: bez zmian').toEqual({ karta: { masa: 23, rev: 0 }, kosz: null });
    expect(await scal(C, P)).toBe('ok');
    expect(await stanX(P, sid), 'P po ponownym scaleniu: karta x 74 i kosz').toEqual({ karta: { masa: 74, rev: 1 }, kosz: { masa: 74, rev: 1 } });
    await rundyQ8(u, { masa: 74, rev: 1 }, { P: ['x'], K: ['s1'], C: ['s1'] });
  });

  // A4: K „Scal pacjentów” X → Y → Z i przypina x pod Z; P (bez wiedzy) poprawia x w starej X na 74. Rekord W3 wersji
  // wspólnej dwóm kartom: treść z poprawki P, gwiazdka z rejestru K — rekord złożony, szyfrowany od nowa. Przy glowaX
  // K nie przypina x, tylko daje do kosza wszystkie wersje Z późniejsze niż x — x jest najnowszą wersją Z (nagłówek Z
  // z niej), a rekord W3 to cała kopia z ładunku (jej treść jawna przy liczeniu nagłówka, bez odszyfrowania).
  async function a4(hakNaK, { glowaX = false } = {}) {
    sztucznyZegar();
    const K = hakNaK ? await urzadzenieH('K') : await urzadzenie('K');
    const P = hakNaK ? await urzadzenie('P') : await urzadzenieH('P');
    const x1 = await zapisz(K, jan(120, 20));
    const X = x1.patientId;
    const sid = (await zapisz(K, jan(125, 23), { patientId: X })).snapshotId;
    await zapisz(K, jan(130, 25), { patientId: X });
    const Y = (await zapisz(K, ola(110, 18))).patientId;
    const Z = (await zapisz(K, ola(111, 19))).patientId;
    await sync(K, P);
    przesunZegar(M); await K.mergePatients(X, Y);
    przesunZegar(M); await K.mergePatients(Y, Z);
    if (glowaX) {
      const zs = (await K.getPatient(Z)).snapshots;
      const ox = zs.find((q) => q.snapshotId === sid).savedAtISO;
      for (const q of zs) if (q.savedAtISO > ox) { przesunZegar(M); await K.moveSnapshotToTrash(Z, q.snapshotId, { odepnij: true }); }
    } else { przesunZegar(M); await K.setSnapshotPinned(Z, sid, true); }
    przesunZegar(M); await poprawMase(P, sid, 74);
    przesunZegar(M);
    return { K, P, X, Z, sid };
  }
  async function deltaX(d) {
    const z = await d.P.buildPatientDelta(d.X);
    return JSON.parse(JSON.stringify(await d.P.decryptPayloadForCurrentUser(z.iv, z.data)));
  }
  async function scalLadunek(v, ladunek) {
    try { await v.mergeSyncPayload(ladunek); return 'ok'; } catch (er) { return er && er.code; }
  }
  const xPodZ = async (v, d) => { const g = await gdzie(v, d.sid); return { karta: g.pid === d.Z, masa: g.s.payload.user.weight, pin: !!g.s.pinned }; };

  it('A4-S1: delta karty X z P na K — poprawka x pod Z w rekordzie W3 (Bsw_poprawTresc); przełączenie na konto B w szyfrowaniu rekordu: SESSION_CHANGED, żadnego zapisu po przełączeniu', async () => {
    const d = await a4(true);
    const delta = await deltaX(d);
    const st = przelaczWSzyfrowaniu(d.K, 'Bsw_poprawTresc', true);
    const w = await scalLadunek(d.K, delta);
    expect(st.zrobione, 'przełączenie w szyfrowaniu rekordu W3').toBe(true);
    expect(w).toBe('SESSION_CHANGED');
    expect(zapisyPo(d.K, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    vi.restoreAllMocks();
    await zalogujA(d.K);
    await d.K.mergeSyncPayload(delta);
    expect(await xPodZ(d.K, d), 'K po ponownym scaleniu: x 74* pod Z').toEqual({ karta: true, masa: 74, pin: true });
  });
  it('A4-S1b: x najnowszą wersją Z — przełączenie na konto B zaraz po zapisie rekordu x w Bsw_poprawTresc: SESSION_CHANGED, żadnego zapisu po przełączeniu (nagłówek Z nie idzie do konta B)', async () => {
    const d = await a4(true, { glowaX: true });
    expect((await d.K.getPatient(d.Z)).snapshots[0].snapshotId, 'kontrola: x najnowszą wersją Z').toBe(d.sid);
    const delta = await deltaX(d);
    const st = przelacz(d.K, (k, a, stos) => k === 'putSnapshotForUser' && a[1] && a[1].snapshotId === d.sid && stos.includes('Bsw_poprawTresc'), true);
    expect(await scalLadunek(d.K, delta)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po zapisie rekordu x').toBe(true);
    expect(zapisyPo(d.K, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await kartyB(d.K), 'konto B bez kart').toBe(0);
    await zalogujA(d.K);
    await d.K.mergeSyncPayload(delta);
    expect(await xPodZ(d.K, d), 'K po ponownym scaleniu: x 74 pod Z').toEqual({ karta: true, masa: 74, pin: false });
  });
  it('A4-S2: pełny ładunek K na P — x spod X (zbiór N) pod Z w rekordzie W3 (Bsw_doF); przełączenie na konto B w szyfrowaniu rekordu: SESSION_CHANGED, żadnego zapisu po przełączeniu', async () => {
    const d = await a4(false);
    const ladunek = JSON.parse(JSON.stringify(await d.K.exportSyncPayload()));
    const st = przelaczWSzyfrowaniu(d.P, 'Bsw_doF', true);
    const w = await scalLadunek(d.P, ladunek);
    expect(st.zrobione, 'przełączenie w szyfrowaniu rekordu W3').toBe(true);
    expect(w).toBe('SESSION_CHANGED');
    expect(zapisyPo(d.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    vi.restoreAllMocks();
    await zalogujA(d.P);
    await d.P.mergeSyncPayload(ladunek);
    expect(await xPodZ(d.P, d), 'P po ponownym scaleniu: x 74* pod Z').toEqual({ karta: true, masa: 74, pin: true });
  });
  for (const [nazwa, metoda, opis] of [
    ['A4-S2b', 'putSnapshotForUser', 'zaraz po zapisie rekordu x w Bsw_doF'],
    ['A4-S2c', 'putPatientForUser', 'zaraz po zapisie karty F w Bsw_doF (przed Bsw_poOddaniu)'],
  ]) {
    it(`${nazwa}: pełny ładunek K na P, przełączenie na konto B ${opis} — SESSION_CHANGED, żadnego zapisu po przełączeniu; po zalogowaniu A x 74* pod Z`, async () => {
      const d = await a4(false);
      const ladunek = JSON.parse(JSON.stringify(await d.K.exportSyncPayload()));
      const st = przelacz(d.P, (k, a, stos) => k === metoda && stos.includes('Bsw_doF'), true);
      expect(await scalLadunek(d.P, ladunek)).toBe('SESSION_CHANGED');
      expect(st.zrobione, 'przełączenie w Bsw_doF').toBe(true);
      expect(zapisyPo(d.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
      expect(await kartyB(d.P), 'konto B bez kart').toBe(0);
      await zalogujA(d.P);
      await d.P.mergeSyncPayload(ladunek);
      expect(await xPodZ(d.P, d), 'P po ponownym scaleniu: x 74* pod Z').toEqual({ karta: true, masa: 74, pin: true });
      expect(await d.P.getPatient(d.X), 'P: karty X nie ma').toBeFalsy();
    });
  }
});

describe('P-KOSZ-PO-KLUCZU — np-ret-A1: zmiana sesji w przeniesieniu wersji, która przeżywa retencję (Bsw_przezyteRetencji)', () => {
  // npret-pin: P przypina x w X; C (bez wiedzy) przycina X (x i x1); K (bez wiedzy o obu): X → Y; K←C.
  async function stanNpret() {
    const u = await trzyKarty();
    przesunZegar(M); await przypnij(u.P, u.sid, true);
    przesunZegar(M);
    const r = await u.C.pruneSnapshotsForPatient(u.X, { recentHours: 0 });
    expect(r.prunedIds, 'kontrola: retencja C przycina x').toContain(u.sid);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
    przesunZegar(M);
    await sync(u.C, u.K);
    expect(await gdzie(u.K, u.sid), 'kontrola: K bez x (A1 przyciął kopię pod Y)').toBe(null);
    return u;
  }
  const xPod = async (v, u) => {
    const g = await gdzie(v, u.sid);
    return g ? { karta: g.pid === u.Y ? 'Y' : g.pid === u.X ? 'X' : '?', masa: g.s.payload.user.weight, pin: !!g.s.pinned } : null;
  };
  const X_POD_Y = { karta: 'Y', masa: 23, pin: true };
  async function rundyNpret(u) {
    await rundy(u.urz, 3);
    for (const v of u.urz) expect(await xPod(v, u), `${v.__nazwa}: po rundach x 23* pod Y`).toEqual(X_POD_Y);
    for (const v of u.urz) expect(await kartaX(v, u), `${v.__nazwa}: bez karty X`).toBe(false);
    zeruj(u.urz);
    await rundy(u.urz, 1);
    expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(bezZapisow(u.urz));
  }
  const zapisPodY = () => wierszW('Bsw_przeniesPrzezyta', /await I\(\)\.putSnapshotForUser\(b, PatientClinicalWriteValue\(b,Object\.assign\(Bm1\(g\), g, \{ patientId: H \}\)\)\);/);
  const odczytX = () => wierszW('Bsw_przeniesPrzezyta', /const wX = await I\(\)\.listSnapshotsForUser\(b, X\);/);

  it('NR-S1: zalogowanie od nowa zaraz po zapisie x pod Y — SESSION_CHANGED, żadnego zapisu po przełączeniu; to samo scalenie od nowa: x 23* pod Y, bez X; po rundach na trzech', async () => {
    const u = await stanNpret();
    const w = zapisPodY();
    const st = przelacz(u.P, (k, a, stos) => k === 'putSnapshotForUser' && a[1] && a[1].snapshotId === u.sid && stos.includes(w), false);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po zapisie x pod Y').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await scal(u.K, u.P)).toBe('ok');
    expect(await xPod(u.P, u), 'P: x 23* pod Y').toEqual(X_POD_Y);
    expect(await kartaX(u.P, u), 'P: bez karty X').toBe(false);
    await rundyNpret(u);
  });

  it('NR-S2: konto B z kopią kart A, przełączenie na B zaraz po świeżym odczycie wersji X pod blokadami — żadnego zapisu po przełączeniu, karta X konta B z x zostaje; po zalogowaniu A x 23* pod Y', async () => {
    const u = await stanNpret();
    await kopiaWB(u.P);
    const w = odczytX();
    const st = przelacz(u.P, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.X && stos.includes(w), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie przed zapisem x pod Y').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(!!(await u.P.__baza.getPatientForUser(u.P.__uidB, u.X)), 'konto B: karta X zostaje').toBe(true);
    expect((await u.P.__baza.listSnapshotsForUser(u.P.__uidB, u.X)).some((s) => s.snapshotId === u.sid), 'konto B: x w X').toBe(true);
    await zalogujA(u.P);
    expect(await scal(u.K, u.P)).toBe('ok');
    expect(await xPod(u.P, u), 'P: x 23* pod Y').toEqual(X_POD_Y);
    await rundyNpret(u);
  });
});

describe('P-KOSZ-PO-KLUCZU — faza przeniesień: zbiór kart usuniętych tylko w sesji scalania (F-S1)', () => {
  // K: X → Y → Z (bez poprawki i kosza). Na P (konto A) X przegrywa ze swoim nagrobkiem, a decyzje 'zabierz' przenoszą
  // x1, x i x3 pod Z: Bsw_poOddaniu usuwa opróżnioną X (bez nagrobka), a faza przeniesień dopisuje ją do zbioru kart
  // usuniętych (Bpc_usunieta) już po zwolnieniu blokad obu kart.
  it('F-S1: konto B z cieniem swojej karty X, przełączenie na B zaraz po usunięciu opróżnionej X konta A w fazie przeniesień — SESSION_CHANGED, żadnego zapisu po przełączeniu, następna zmiana listy B zostawia jej cień; po zalogowaniu A i rundach x pod Z na trzech, bez X', async () => {
    const u = await trzyKarty();
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
    przesunZegar(M); await u.K.mergePatients(u.Y, u.Z);
    przesunZegar(M);
    await kopiaWB(u.P);
    // konto B: przycięcie X (retencja) i scalenie własnego wcześniejszego ładunku — przycięte wersje oddają treść do cienia B
    await zalogujB(u.P);
    const ladunekB = JSON.parse(JSON.stringify(await u.P.exportSyncPayload()));
    expect((await u.P.pruneSnapshotsForPatient(u.X, { recentHours: 0 })).prunedIds, 'kontrola: B przycina x i x1').toHaveLength(2);
    przesunZegar(M); await u.P.mergeSyncPayload(ladunekB);
    expect(await cienB(u.P), 'kontrola: cień konta B — dwa rekordy wpisów karty X').toBe(2);
    przesunZegar(M); const nowaZ = (await u.P.savePatient(ola(115, 22), { dedup: false, patientId: u.Z })).snapshotId;
    await zalogujA(u.P);
    const st = przelacz(u.P, (k, a, stos) => k === 'removePatientForUser' && a[1] === u.X && stos.includes('Bsw_poOddaniu'), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po usunięciu opróżnionej X konta A (Bsw_poOddaniu)').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    // dalej w sesji B: zmiana listy kosza konta B
    przesunZegar(M); await u.P.moveSnapshotToTrash(u.Z, nowaZ, { odepnij: true });
    expect(await cienB(u.P), 'konto B: cień karty X zostaje').toBe(2);
    await zalogujA(u.P);
    await rundy(u.urz, 3);
    for (const v of u.urz) {
      expect((await gdzie(v, u.sid))?.pid, `${v.__nazwa}: po rundach x pod Z`).toBe(u.Z);
      expect(await kartaX(v, u), `${v.__nazwa}: bez karty X`).toBe(false);
    }
    zeruj(u.urz);
    await rundy(u.urz, 1);
    expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual(bezZapisow(u.urz));
  });
});

describe('P-KOSZ-PO-KLUCZU — F-S2: odczyty wyszukania po kluczu tylko w sesji scalania', () => {
  // Wywołania magazynu w koncie B po przełączeniu (odczyty i zapisy).
  const wKoncieB = (v, st) => v.__wyw.slice(st.od).filter(([, uid]) => uid === v.__uidB).map(([k]) => k);
  const odczytZ = () => wierszW('Bkz_scalKoniec', /const wersje = nagrobki\.length \|\| Bgw_tu\.length \? await I\(\)\.listSnapshotsForUser\(b, patientId\)/);

  it('F-S2a: E4b, przełączenie na konto B zaraz po odczycie wersji Z w pętli kart — SESSION_CHANGED, po przełączeniu żadnego wywołania magazynu w koncie B; po zalogowaniu A zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    await kopiaWB(u.P);
    const w = odczytZ();
    const st = przelacz(u.P, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.Z && stos.includes(w), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po odczycie wersji Z').toBe(true);
    expect(wKoncieB(u.P, st), 'po przełączeniu żadnego wywołania magazynu w koncie B (także odczytu po kluczu)').toEqual([]);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    await zalogujA(u.P);
    await rundyIKontrola(u, KOSZ_74);
  });

  it('F-S2b: M01 na K — wpis retencji x pod Z z przypiętym rejestrem (odczyt po kluczu w pętli kart); przełączenie na B zaraz po odczycie wersji Z — żadnego wywołania magazynu w koncie B; po zalogowaniu A K X[x:74*] Z[m]', async () => {
    sztucznyZegar();
    const K = await urzadzenieH('K'), P = await urzadzenie('P'), C = await urzadzenie('C');
    const X = (await zapisz(K, jan(120, 20))).patientId;
    const sid = (await zapisz(K, jan(125, 23), { patientId: X })).snapshotId;
    const Z = (await zapisz(K, ola(111, 19))).patientId;
    await sync(K, P); await sync(K, C);
    przesunZegar(M); await K.mergePatients(X, Z);
    przesunZegar(M); await sync(K, C);
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await P.setSnapshotPinned(X, sid, true);
    przesunZegar(M); await poprawMase(C, sid, 74);
    przesunZegar(M); await sync(C, K);
    przesunZegar(M); expect((await C.pruneSnapshotsForPatient(Z, { recentHours: 0 })).prunedIds, 'kontrola: C przycina x pod Z').toContain(sid);
    przesunZegar(M); await sync(C, K);
    expect(await gdzie(K, sid), 'kontrola: K bez x (wpis retencji x pod Z)').toBe(null);
    przesunZegar(M);
    await kopiaWB(K);
    const w = odczytZ();
    const ladunek = JSON.parse(JSON.stringify(await P.exportSyncPayload()));
    const st = przelacz(K, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === Z && stos.includes(w), true);
    let wynik;
    try { await K.mergeSyncPayload(ladunek); wynik = 'ok'; } catch (er) { wynik = er && er.code; }
    expect(wynik).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po odczycie wersji Z').toBe(true);
    expect(wKoncieB(K, st), 'po przełączeniu żadnego wywołania magazynu w koncie B').toEqual([]);
    expect(zapisyPo(K, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    await zalogujA(K);
    // To samo scalenie w koncie A: odczyt x po kluczu z wyszukania jeszcze w pętli kart (wpis z przypiętym rejestrem).
    let poKluczu = false;
    K.__hak.obserwuj = (k, a, stos) => { if (k === 'getSnapshotForUser' && a[1] === sid && stos.includes('Bkz_gdzieIndziej (')) poKluczu = true; };
    await K.mergeSyncPayload(ladunek);
    K.__hak.obserwuj = null;
    expect(poKluczu, 'kontrola: odczyt x po kluczu w Bkz_gdzieIndziej (pętla kart)').toBe(true);
    const g = await gdzie(K, sid);
    expect(g && { karta: g.pid === X ? 'X' : g.pid === Z ? 'Z' : '?', masa: g.s.payload.user.weight, pin: !!g.s.pinned }, 'K: x 74* pod X (jak M01)').toEqual({ karta: 'X', masa: 74, pin: true });
    expect((await K.getPatient(Z)).snapshots.some((s) => s.snapshotId === sid), 'K: Z bez x').toBe(false);
  });

  it('F-S2c: E4b, przełączenie na konto B zaraz po liście kart w wyszukaniu po pętli (Bkz_gdzieIndziejRazem) — żadnego dalszego odczytu w koncie B; po zalogowaniu A zbieżnie', async () => {
    const u = await trzyKarty();
    await krokiE4b(u);
    await kopiaWB(u.P);
    const st = przelacz(u.P, (k, a, stos) => k === 'listPatientsForUser' && stos.includes('Bkz_gdzieIndziejRazem'), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po liście kart w wyszukaniu').toBe(true);
    expect(wKoncieB(u.P, st), 'po przełączeniu żadnego wywołania magazynu w koncie B').toEqual([]);
    expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    await zalogujA(u.P);
    await rundyIKontrola(u, KOSZ_74);
  });
});

describe('P-KOSZ-PO-KLUCZU — strażniki źródła (sesja)', () => {
  // Ciało funkcji sejfu (część czytelna): od „async function nazwa(” do następnej funkcji na początku wiersza; wiersze
  // bez komentarzy końcowych.
  function wiersze(nazwa) {
    const l = kod(SEJF.N).split('\n');
    const od = l.findIndex((x) => x.startsWith(`async function ${nazwa}(`));
    if (od < 0) throw new Error(`brak funkcji ${nazwa}`);
    let i = od + 1;
    while (i < l.length && !/^(async )?function /.test(l[i])) i += 1;
    return l.slice(od, i).map((x) => x.replace(/\s*\/\/.*$/, ''));
  }
  // Każde wywołanie pasujące do re: idąc wstecz od niego (gałąź else pomija wiersz if), pierwszy wiersz z await albo
  // Bses_pilnuj to Bses_pilnuj(opcje) — sprawdzenie sesji tuż przed, bez await pomiędzy. Zwraca liczbę wywołań i listę
  // wywołań bez takiej straży.
  function bezStrazy(nazwa, re) {
    const l = wiersze(nazwa);
    const zle = [];
    let ile = 0;
    l.forEach((x, i) => {
      const m = x.match(re);
      if (!m) return;
      ile += 1;
      const przed = x.slice(0, m.index).replace(/await\s*$/, '');
      if (/Bses_pilnuj\(opcje\);/.test(przed)) return;
      if (/\bawait\b/.test(przed)) { zle.push(x.trim()); return; }
      let j = i - 1;
      if (/^\s*else\b/.test(x)) j -= 1;
      for (; j >= 0; j -= 1) {
        if (/Bses_pilnuj\(opcje\);/.test(l[j])) return;
        if (/\bawait\b/.test(l[j])) break;
      }
      zle.push(x.trim());
    });
    return { ile, zle };
  }
  const ZAPIS_MAG = /I\(\)\.(put|remove)\w*ForUser\(/;

  it('S1: Bkz_obceKarty — wersje karty czytane jako pierwsze pod blokadą (przed getPatientForUser), każda decyzja do ctx tuż po Bses_pilnuj', () => {
    const l = wiersze('Bkz_obceKarty');
    const iBlok = l.findIndex((x) => x.includes('await Bsl_podBlokada(karta, async function () {'));
    const iWersje = l.findIndex((x) => x.includes('await I().listSnapshotsForUser(b, karta)'));
    const iKarta = l.findIndex((x) => x.includes('await I().getPatientForUser(b, karta)'));
    expect(iBlok).toBeGreaterThan(0);
    expect(iWersje, 'pierwszy wiersz pod blokadą: odczyt wersji karty').toBe(iBlok + 1);
    expect(l[iWersje].indexOf('await'), 'odczyt wersji to pierwsze await pod blokadą').toBe(l[iWersje].indexOf('await I().listSnapshotsForUser(b, karta)'));
    expect(iKarta, 'odczyt karty po odczycie wersji').toBeGreaterThanOrEqual(iWersje);
    const d = bezStrazy('Bkz_obceKarty', /Bkz_przegral\(ctx, e\)|ctx\.mapa\.(set|delete)\(|ctx\.Bkz_doUsuniecia\.push\(/);
    expect(d.ile, 'decyzje do ctx: przegrana, wersja przypięta, usunięcie (mapa.set i lista do usunięcia)').toBe(4);
    expect(d.zle, 'decyzje do ctx bez sprawdzenia sesji tuż przed').toEqual([]);
    expect(bezStrazy('Bkz_obceKarty', ZAPIS_MAG), 'zapis podniesionej rev (Bpk_podnies)').toEqual({ ile: 1, zle: [] });
  });

  it('S3: Bkz_usunZObcych — Bses_pilnuj tuż przed usunięciem karty, zbiorem kart usuniętych (Bpc_usunieta), nagrobkiem karty (F-R2) i usunięciem wersji', () => {
    expect(bezStrazy('Bkz_usunZObcych', /Bpc_usunieta\(karta\)/), 'zbiór kart usuniętych tylko w sesji scalania').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bkz_usunZObcych', ZAPIS_MAG), 'usunięcie karty, nagrobek karty i usunięcie wersji').toEqual({ ile: 3, zle: [] });
    const l = wiersze('Bkz_usunZObcych');
    expect(l.findIndex((x) => x.includes('Bpc_usunieta(karta)')), 'Bpc_usunieta po usunięciu karty').toBeGreaterThan(l.findIndex((x) => x.includes('removePatientForUser(b, karta)')));
  });

  it('Q8: Bkz_zostawOstatnia — odczyt treści wpisu kosza (Bpc_pelny) i zapis zostawionej wersji tuż po Bses_pilnuj', () => {
    expect(bezStrazy('Bkz_zostawOstatnia', /Bpc_pelny\(/), 'treść nagrobka i cień tylko w sesji scalania').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bkz_zostawOstatnia', ZAPIS_MAG), 'zapis zostawionej wersji').toEqual({ ile: 1, zle: [] });
  });

  it('S2: Bsw_poprawTresc, Bsw_doF, Bsw_poOddaniu — każdy zapis magazynu (wersja, karta, nagrobek) tuż po Bses_pilnuj', () => {
    expect(bezStrazy('Bsw_poprawTresc', ZAPIS_MAG), 'Bsw_poprawTresc: rekord W3 i nagłówek G').toEqual({ ile: 2, zle: [] });
    expect(bezStrazy('Bsw_doF', ZAPIS_MAG), 'Bsw_doF: zdjęcie nagrobka F, rekord W3, karta F').toEqual({ ile: 3, zle: [] });
    expect(bezStrazy('Bsw_poOddaniu', ZAPIS_MAG), 'Bsw_poOddaniu: licznik albo usunięcie pustej karty G').toEqual({ ile: 2, zle: [] });
  });

  it('F-S1: Bsl_przeniesWersje — zbiór kart usuniętych (Bpc_usunieta) po zwolnieniu blokad tuż po Bses_pilnuj', () => {
    expect(bezStrazy('Bsl_przeniesWersje', /Bpc_usunieta\(G\)/), 'zbiór kart usuniętych tylko w sesji scalania').toEqual({ ile: 1, zle: [] });
  });

  it('NR: Bsw_przeniesPrzezyta — zapis wersji pod kartą docelową i zbiór kart usuniętych (Bpc_usunieta) tuż po Bses_pilnuj; Bsw_przezyteRetencji bez zapisów', () => {
    expect(bezStrazy('Bsw_przeniesPrzezyta', ZAPIS_MAG), 'zapis wersji pod kartą docelową').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bsw_przeniesPrzezyta', /Bpc_usunieta\(X\)/), 'zbiór kart usuniętych tylko w sesji scalania').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bsw_przezyteRetencji', ZAPIS_MAG).ile, 'szukanie kandydatów bez zapisów magazynu').toBe(0);
  });

  it('F-S2: Bkz_gdzieIndziej i Bkz_gdzieIndziejRazem — każdy odczyt magazynu (po kluczu, lista kart, lista wersji) i każda decyzja do ctx po await (także kolejka i lista wersji karty z pętli) tuż po Bses_pilnuj', () => {
    const ODCZYT = /(?:\bh|I\(\))\.(?:get|list)\w+ForUser\(|Bsw_wersjaLokalna\(/;
    expect(bezStrazy('Bkz_gdzieIndziej', ODCZYT), 'Bkz_gdzieIndziej: odczyt po kluczu').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bkz_gdzieIndziej', /q\.push\(/), 'Bkz_gdzieIndziej: wynik odczytu i wpis odłożony do ctx (kolejka)').toEqual({ ile: 2, zle: [] });
    expect(bezStrazy('Bkz_scalKoniec', /ctx\.Bkz_listy = new Map/), 'Bkz_scalKoniec: lista wersji karty z pętli do ctx').toEqual({ ile: 1, zle: [] });
    // Ściślej w Bkz_gdzieIndziej: wiersz wcześniej — własne Bses_pilnuj (straż z gałęzi odłożonego wpisu nie liczy się
    // dla odczytu po kluczu).
    const l = wiersze('Bkz_gdzieIndziej');
    const tuzPo = (re) => l.flatMap((x, i) => (re.test(x) ? [/^\s*Bses_pilnuj\(opcje\);\s*$/.test(l[i - 1] || '')] : []));
    expect(tuzPo(/Bsw_wersjaLokalna\(/), 'Bkz_gdzieIndziej: odczyt po kluczu tuż po własnym Bses_pilnuj').toEqual([true]);
    expect(bezStrazy('Bkz_gdzieIndziejRazem', ODCZYT), 'Bkz_gdzieIndziejRazem: lista kart, odczyt po kluczu, lista wersji').toEqual({ ile: 3, zle: [] });
    expect(bezStrazy('Bkz_gdzieIndziejRazem', /\.push\(\{ sid: x\.sid/), 'Bkz_gdzieIndziejRazem: decyzje do ctx (Bkz_obce)').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bkz_gdzieIndziejRazem', ZAPIS_MAG).ile, 'wyszukanie bez zapisów magazynu').toBe(0);
  });

  it('R6: Bsl_scalPacjenta, Bsw_przezyteRetencji, Bsw_przeniesPrzezyta, Bsl_usunPacjenta, Bsl_zdejmijNagrobek — zapisy i odczyty po await tuż po Bses_pilnuj (pierwszy odczyt pod blokadą sprawdza Bsl_podBlokada)', () => {
    const ODCZYT = /I\(\)\.(?:get|list)\w+ForUser\(|Bpu_nagrobek\(/;
    expect(wiersze('Bsl_podBlokada').join('\n'), 'Bsl_podBlokada: sprawdzenie sesji pod blokadą, przed krokiem').toContain('function () { Bses_pilnuj(opcje); return dzialanie(); }');
    // Bsl_scalPacjenta: decyzja z odczytu po kluczu (Bsw_decyzja), rekord karty i zdjęcie przegranego nagrobka
    const l = wiersze('Bsl_scalPacjenta');
    const poDecyzji = l.flatMap((x, i) => (x.includes('= await Bsw_decyzja(ctx, F, S);') ? [/^\s*Bses_pilnuj\(opcje\);\s*$/.test(l[i + 1] || '')] : []));
    expect(poDecyzji, 'Bsl_scalPacjenta: sprawdzenie sesji tuż po Bsw_decyzja (karta istniejąca i nowa)').toEqual([true, true]);
    expect(bezStrazy('Bsl_scalPacjenta', /I\(\)\.(?:putPatientForUser|removeTombstoneForUser)\(/), 'Bsl_scalPacjenta: rekord karty i zdjęcie nagrobka').toEqual({ ile: 5, zle: [] });
    // Bsw_przezyteRetencji: lista kart przed pętlą, karta i jej wersje, karta docelowa w cel() (wyrażenie z przecinkiem)
    const r = bezStrazy('Bsw_przezyteRetencji', ODCZYT);
    expect(r.ile, 'Bsw_przezyteRetencji: lista kart, karta X, wersje X, karta docelowa').toBe(4);
    expect(r.zle, 'Bsw_przezyteRetencji: jedyny wiersz bez straży w wierszu wyżej — cel() ze strażą w wyrażeniu').toHaveLength(1);
    expect(r.zle[0]).toContain('(Bses_pilnuj(opcje), await I().getPatientForUser(b, e.patientId))');
    expect(wiersze('Bsw_przezyteRetencji').join('\n'), 'karty, których tu nie ma, pomijane bez odczytu').toContain('if (!Bsw_tu.has(X)) continue;');
    // Bsw_przeniesPrzezyta: każdy odczyt po await (karta docelowa, nagrobek, wersje X) i przebudowa nagłówka H
    expect(bezStrazy('Bsw_przeniesPrzezyta', ODCZYT), 'Bsw_przeniesPrzezyta: bez straży tylko pierwszy odczyt pod blokadą').toEqual({ ile: 4, zle: ['const rekX = await I().getPatientForUser(b, X);'] });
    expect(bezStrazy('Bsw_przeniesPrzezyta', /Bkz_przebudujNaglowek\(H,/), 'Bsw_przeniesPrzezyta: nagłówek karty docelowej').toEqual({ ile: 1, zle: [] });
    // Bsl_usunPacjenta i Bsl_zdejmijNagrobek: zapisy i odczyty po await
    expect(bezStrazy('Bsl_usunPacjenta', ZAPIS_MAG), 'Bsl_usunPacjenta: licznik karty, która zostaje, usunięcie karty, nagrobek').toEqual({ ile: 3, zle: [] });
    expect(bezStrazy('Bsl_usunPacjenta', ODCZYT), 'Bsl_usunPacjenta: bez straży tylko pierwszy odczyt pod blokadą').toEqual({ ile: 3, zle: ['const Bsl_lok = await Bpu_nagrobek(patientId);'] });
    expect(bezStrazy('Bsl_zdejmijNagrobek', ZAPIS_MAG), 'Bsl_zdejmijNagrobek: zdjęcie nagrobka').toEqual({ ile: 1, zle: [] });
    expect(bezStrazy('Bsl_zdejmijNagrobek', ODCZYT), 'Bsl_zdejmijNagrobek: bez straży tylko pierwszy odczyt pod blokadą').toEqual({ ile: 2, zle: ['const n = await Bpu_nagrobek(patientId);'] });
  });
});

// Wizyta, która przeżywa przycięcie, idzie za scaleniem (Bsw_przezyteRetencji): odczyty kart starego duplikatu tylko
// w sesji scalania. Stan npret: P przypina x w X; C (bez wiedzy) przycina X; K (bez wiedzy o obu): X → Y, K←C — na K x
// w żadnej karcie. Konto B z kopią kart A; przełączenie na B zaraz po odczycie karty X w tej fazie — SESSION_CHANGED,
// po przełączeniu żadnego wywołania magazynu konta B.
describe('P-KOSZ-PO-KLUCZU — wizyta, która przeżywa przycięcie: odczyty tylko w sesji scalania', () => {
  it('NR-S3: przełączenie na B po odczycie karty X w Bsw_przezyteRetencji — żadnego wywołania magazynu w koncie B', async () => {
    const u = await trzyKarty();
    przesunZegar(M); await przypnij(u.P, u.sid, true);
    przesunZegar(M);
    const r = await u.C.pruneSnapshotsForPatient(u.X, { recentHours: 0 });
    expect(r.prunedIds).toContain(u.sid);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
    przesunZegar(M); await sync(u.C, u.K);
    expect(await gdzie(u.K, u.sid), 'K: x w żadnej karcie').toBe(null);
    await kopiaWB(u.P);
    const wKoncieB = (v, st) => v.__wyw.slice(st.od).filter(([, uid]) => uid === v.__uidB).map(([k]) => k);
    const st = przelacz(u.P, (k, a, stos) => k === 'getPatientForUser' && a[1] === u.X && stos.includes('Bsw_przezyteRetencji'), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bsw_przezyteRetencji').toBe(true);
    expect(wKoncieB(u.P, st), 'po przełączeniu żadnego wywołania magazynu w koncie B').toEqual([]);
    await zalogujA(u.P);
    expect(await scal(u.K, u.P)).toBe('ok');
    expect((await gdzie(u.P, u.sid)).pid, 'po zalogowaniu A to samo scalenie: x pod Y').toBe(u.Y);
  });
});

// Scalanie karty z ładunku (Bsl_scalPacjenta): nowa wersja z ładunku i rekord karty — tylko w sesji scalania (dodatkowe
// sprawdzenia sesji). K dopisuje do X nową wizytę; konto B z kopią kart A; przełączenie na B zaraz po odczycie po kluczu
// tej wersji (Bsw_decyzja) — SESSION_CHANGED, po przełączeniu żadnego zapisu, konto B bez tej wersji; po zalogowaniu A to
// samo scalenie dopisuje ją pod X.
describe('P-KOSZ-PO-KLUCZU — scalanie karty z ładunku: zapisy tylko w sesji scalania', () => {
  it('S-K1: nowa wersja z ładunku — przełączenie na B po odczycie po kluczu w Bsw_decyzja: żadnego zapisu po przełączeniu', async () => {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K');
    const X = (await zapisz(K, jan(120, 20))).patientId;
    await sync(K, P);
    przesunZegar(M);
    const nowa = (await zapisz(K, jan(125, 23), { patientId: X })).snapshotId;
    await kopiaWB(P);
    const st = przelacz(P, (k, a, stos) => k === 'getSnapshotForUser' && a[1] === nowa && stos.includes('Bsw_decyzja'), true);
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bsw_decyzja').toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await P.__baza.getSnapshotForUser(P.__uidB, nowa), 'konto B bez wersji z ładunku').toBeFalsy();
    await zalogujA(P);
    expect(await scal(K, P)).toBe('ok');
    expect((await gdzie(P, nowa)).pid, 'po zalogowaniu A: nowa wersja pod X').toBe(X);
  });
});

// Przegląd 6 (R6): zapisy po await w scalaniu karty z ładunku, w fazie wizyty, która przeżywa przycięcie, i w dwóch
// krokach nagrobka pacjenta — tylko w sesji scalania. Konto B z kopią kart A; przełączenie na B w podanym miejscu —
// SESSION_CHANGED, po przełączeniu żadnego zapisu (dodatkowe sprawdzenia sesji), a po zalogowaniu A to samo scalenie
// kończy pracę (stan pośredni — wersje bez rekordu karty albo licznik karty w tyle — leczy następne scalenie).
const wywolaniaB = (v, st) => v.__wyw.slice(st.od).filter(([, uid]) => uid === v.__uidB).map(([k]) => k);

describe('P-KOSZ-PO-KLUCZU — R6: scalanie karty z ładunku, nowa karta (Bsl_scalPacjenta)', () => {
  it('R6-A: nowa karta W z dwiema wizytami — przełączenie na B po zapisie pierwszej wersji W: SESSION_CHANGED, żadnego zapisu po przełączeniu, konto B bez W; po zalogowaniu A W z obiema wizytami, runda kontrolna bez zapisów', async () => {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K');
    await zapisz(K, jan(120, 20));
    await sync(K, P);
    const w1 = await zapisz(K, ola(110, 18));
    const W = w1.patientId;
    const w2 = await zapisz(K, ola(111, 19), { patientId: W });
    await kopiaWB(P);
    const st = przelacz(P, (k, a) => k === 'putSnapshotForUser' && a[0] === P.__uid && a[1] && a[1].patientId === W, true);
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po zapisie pierwszej wersji W').toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await P.__baza.getPatientForUser(P.__uidB, W), 'konto B bez karty W').toBeFalsy();
    await zalogujA(P);
    expect(await scal(K, P)).toBe('ok');
    expect((await P.getPatient(W)).snapshots.map((s) => s.snapshotId).sort()).toEqual([w1.snapshotId, w2.snapshotId].sort());
    expect((await P.__baza.getPatientForUser(P.__uid, W)).snapshotCount).toBe(2);
    zeruj([P, K]);
    await rundy([P, K], 1);
    expect(zapisy([P, K])).toEqual(bezZapisow([P, K]));
  });

  it('R6-B: nowa karta W z jedną wizytą — przełączenie na B po zapisie jej wersji, przed rekordem karty: SESSION_CHANGED, żadnego zapisu po przełączeniu, konto B bez W; po zalogowaniu A W z wizytą', async () => {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K');
    await zapisz(K, jan(120, 20));
    await sync(K, P);
    const W = (await zapisz(K, ola(110, 18))).patientId;
    await kopiaWB(P);
    const st = przelacz(P, (k, a) => k === 'putSnapshotForUser' && a[0] === P.__uid && a[1] && a[1].patientId === W, true);
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione).toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await P.__baza.getPatientForUser(P.__uidB, W), 'konto B bez karty W').toBeFalsy();
    await zalogujA(P);
    expect(await scal(K, P)).toBe('ok');
    expect((await P.__baza.getPatientForUser(P.__uid, W)).snapshotCount).toBe(1);
    zeruj([P, K]);
    await rundy([P, K], 1);
    expect(zapisy([P, K])).toEqual(bezZapisow([P, K]));
  });
});

describe('P-KOSZ-PO-KLUCZU — R6: scalanie karty z ładunku, istniejąca karta (Bsl_scalPacjenta)', () => {
  it('R6-C: K dopisuje x2 do X — przełączenie na B po zapisie x2 pod X, przed rekordem karty: żadnego zapisu po przełączeniu, karta X konta B bez zmian; po zalogowaniu A licznik X = 2', async () => {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K');
    const X = (await zapisz(K, jan(120, 20))).patientId;
    await sync(K, P);
    const x2 = await zapisz(K, jan(125, 23), { patientId: X });
    await kopiaWB(P);
    const przedB = await P.__baza.getPatientForUser(P.__uidB, X);
    const st = przelacz(P, (k, a) => k === 'putSnapshotForUser' && a[0] === P.__uid && a[1] && a[1].snapshotId === x2.snapshotId, true);
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione).toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await P.__baza.getPatientForUser(P.__uidB, X), 'konto B: karta X bez zmian').toEqual(przedB);
    await zalogujA(P);
    expect(await scal(K, P)).toBe('ok');
    expect((await P.__baza.getPatientForUser(P.__uid, X)).snapshotCount).toBe(2);
    zeruj([P, K]);
    await rundy([P, K], 1);
    expect(zapisy([P, K])).toEqual(bezZapisow([P, K]));
  });
});

describe('P-KOSZ-PO-KLUCZU — R6: wizyta, która przeżywa przycięcie, pod blokadami (Bsw_przeniesPrzezyta)', () => {
  it('R6-D: stan npret, konto B z kopią kart A — przełączenie na B zaraz po odczycie karty X pod blokadami: SESSION_CHANGED, po przełączeniu żadnego wywołania magazynu w koncie B; po zalogowaniu A x pod Y', async () => {
    const u = await trzyKarty();
    przesunZegar(M); await przypnij(u.P, u.sid, true);
    przesunZegar(M);
    expect((await u.C.pruneSnapshotsForPatient(u.X, { recentHours: 0 })).prunedIds).toContain(u.sid);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
    przesunZegar(M); await sync(u.C, u.K);
    expect(await gdzie(u.K, u.sid), 'K: x w żadnej karcie').toBe(null);
    await kopiaWB(u.P);
    const w = wierszW('Bsw_przeniesPrzezyta', /const rekX = await I\(\)\.getPatientForUser\(b, X\);/);
    const st = przelacz(u.P, (k, a, stos) => k === 'getPatientForUser' && a[1] === u.X && stos.includes(w), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bsw_przeniesPrzezyta').toBe(true);
    expect(wywolaniaB(u.P, st), 'po przełączeniu żadnego wywołania magazynu w koncie B').toEqual([]);
    await zalogujA(u.P);
    expect(await scal(u.K, u.P)).toBe('ok');
    expect((await gdzie(u.P, u.sid)).pid).toBe(u.Y);
  });
});

// Nagrobek pacjenta w scalaniu: karta, która zostaje (zapis w drugiej karcie przeglądarki po chwili usunięcia —
// Bsl_usunPacjenta), i zdjęcie przegranego nagrobku (Bsl_zdejmijNagrobek) — tylko w sesji scalania (dodatkowe
// sprawdzenia sesji).
describe('P-KOSZ-PO-KLUCZU — R6: nagrobek pacjenta tylko w sesji scalania (Bsl_usunPacjenta, Bsl_zdejmijNagrobek)', () => {
  async function stanUsuniecia(rozjazdLicznika) {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K');
    const X = (await zapisz(K, jan(120, 20))).patientId;
    await zapisz(K, jan(125, 23), { patientId: X });
    await zapisz(K, ola(110, 18));
    await sync(K, P);
    await kopiaWB(P);
    if (rozjazdLicznika) {
      // dawny rozjazd licznika karty X konta A (np. wersje zabrane przez starszą aplikację)
      const rec = await P.__baza.getPatientForUser(P.__uid, X);
      await P.__baza.putPatientForUser(P.__uid, { ...rec, snapshotCount: 7 });
    }
    przesunZegar(M); await K.removePatient(X);
    przesunZegar(M);
    return { P, K, X, przedB: await P.__baza.getPatientForUser(P.__uidB, X) };
  }
  // Druga karta przeglądarki zapisuje w X nową wizytę zaraz po starcie scalania (X zostaje mimo nagrobka), a potem
  // przełączenie na B w podanym wierszu Bsl_usunPacjenta.
  function zapisIPrzelaczenie(P, X, metoda, w) {
    const st = { zrobione: false, od: -1, inna: false };
    P.__hak.kiedy = (k, a, stos) => k === 'listTombstonesForUser' && a[0] === P.__uid && /at (Object\.)?Le[ (]/.test(stos);
    P.__hak.akcja = async () => {
      przesunZegar(1000);
      await P.savePatient(jan(126, 24), { dedup: false, patientId: X });
      st.inna = true;
      P.__hak.kiedy = (k, a, stos) => k === metoda && a[0] === P.__uid && a[1] === X && stos.includes(w);
      P.__hak.akcja = async () => { st.zrobione = true; P.lock('manual'); await P.unlockUser(P.__uidB, HASLO_B); st.od = P.__wyw.length; };
    };
    return st;
  }

  it('U-S1: karta X zostaje (zapis w drugiej karcie po usunięciu na K), licznik X w tyle — przełączenie na B po odczycie wersji X: SESSION_CHANGED, żadnego zapisu po przełączeniu, karta X konta B bez zmian', async () => {
    const { P, K, X, przedB } = await stanUsuniecia(true);
    const st = zapisIPrzelaczenie(P, X, 'listSnapshotsForUser', wierszW('Bsl_usunPacjenta', /await I\(\)\.listSnapshotsForUser\(b, patientId\)\)\.length/));
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.inna, 'zapis drugiej karty').toBe(true);
    expect(st.zrobione, 'przełączenie w Bsl_usunPacjenta').toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await P.__baza.getPatientForUser(P.__uidB, X), 'konto B: karta X bez zmian').toEqual(przedB);
    await zalogujA(P);
    expect(await scal(K, P), 'po zalogowaniu A to samo scalenie').toBe('ok');
    expect(await P.getPatient(X), 'karta X zostaje (zapis po usunięciu na K)').not.toBeNull();
    expect(await P.__baza.getPatientForUser(P.__uidB, X), 'konto B: karta X nadal bez zmian').toEqual(przedB);
  });

  it('U-S1b: karta X zostaje — przełączenie na B po odczycie rekordu X: SESSION_CHANGED, po przełączeniu żadnego wywołania magazynu w koncie B', async () => {
    const { P, K, X, przedB } = await stanUsuniecia(false);
    const st = zapisIPrzelaczenie(P, X, 'getPatientForUser', wierszW('Bsl_usunPacjenta', /const rekord = await I\(\)\.getPatientForUser\(b, patientId\)/));
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.inna).toBe(true);
    expect(st.zrobione).toBe(true);
    expect(wywolaniaB(P, st), 'po przełączeniu żadnego wywołania magazynu w koncie B').toEqual([]);
    expect(await P.__baza.getPatientForUser(P.__uidB, X), 'konto B: karta X bez zmian').toEqual(przedB);
  });

  it('U-S2: przegrany nagrobek X konta A (starszy niż karta) — przełączenie na B po odczycie karty w Bsl_zdejmijNagrobek: SESSION_CHANGED, nagrobek X konta B zostaje', async () => {
    sztucznyZegar();
    const P = await urzadzenieH('P'), K = await urzadzenie('K');
    const X = (await zapisz(P, jan(120, 20))).patientId;
    await zapisz(K, ola(110, 18));
    await kopiaWB(P);
    // konto B usuwa swoją kopię X („Usuń pacjenta”)
    await zalogujB(P); przesunZegar(M); await P.removePatient(X); await zalogujA(P);
    const nagrobekB = async () => (await P.__baza.listTombstonesForUser(P.__uidB)).filter((t) => t.patientId === X).length;
    expect(await nagrobekB(), 'kontrola: nagrobek X konta B').toBe(1);
    // konto A: karta X i starszy nagrobek X (stan dawnej aplikacji, np. import karty)
    const rekA = await P.__baza.getPatientForUser(P.__uid, X);
    await P.__baza.putTombstoneForUser(P.__uid, { patientId: X, deletedAtISO: new Date(Date.parse(rekA.lastSavedAtISO) - 1000).toISOString() });
    przesunZegar(M);
    const w = wierszW('Bsl_zdejmijNagrobek', /await I\(\)\.getPatientForUser\(b, patientId\)/);
    const st = przelacz(P, (k, a, stos) => k === 'getPatientForUser' && a[0] === P.__uid && a[1] === X && stos.includes(w), true);
    expect(await scal(K, P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie w Bsl_zdejmijNagrobek').toBe(true);
    expect(zapisyPo(P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(await nagrobekB(), 'nagrobek X konta B zostaje').toBe(1);
    await zalogujA(P);
    expect(await scal(K, P)).toBe('ok');
    expect((await P.__baza.listTombstonesForUser(P.__uid)).filter((t) => t.patientId === X), 'po zalogowaniu A przegrany nagrobek X zdjęty').toEqual([]);
  });
});
