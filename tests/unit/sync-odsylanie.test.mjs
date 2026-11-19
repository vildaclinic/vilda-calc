// P-DZIENNIK-ZDARZEN (E3-PR0c, P-ZBIEZNOSC-ZDARZEN) — odsyłanie poprawionych wizyt po zastosowaniu pojedynczej zmiany
// z innego urządzenia (applyEncryptedEvent). USPIONE: przełącznik odsyłania — pole okna VILDA_EVENT_ECHO === true
// (testy) albo klucz localStorage vilda-event-echo-v1 dokładnie '1'; brak, inna wartość albo wyjątek — zastosowanie
// zdarzenia dokładnie jak dziś (ta sama obietnica, te same zapisy, te same wiersze kolejki). Reguły scalania (Le) bez
// zmian. Decyzje właściciela z 2026-11-17 (blok planu „Decyzje z 2026-11-17 (E3-PR0c, pytania 1–6 projektu)”): bez
// osobnego odsyłania samego opisu karty, bez notatek i ich nagrobków, tylko po pojedynczych zmianach (nie po pełnej
// kopii ani delcie), dopuszczona podwójna wysyłka wersji (pełna karta z haka H1 i osobne odesłanie).
// Reguła: przy włączonym przełączniku, bramce dziennika i warunku kolejki („Komputer prywatny”, IndexedDB) po
// zastosowaniu koperty zdarzenia (ładunek z polem event; stara delta tą samą drogą — bez odsyłania) do kolejki trafia
// snap każdej wersji z ładunku (patients[].snapshots[] i snapshotTombstones[]), którą scalanie zapisało inaczej, niż
// przyszła: wersja leży po scaleniu pod kartą p, a przed — pod p albo nigdzie (bez przeniesień); rekord sklepu przed ≠ po;
// wersja w kształcie eksportu (tożsamość wizyty wyliczona dla starych rekordów) bez rev przed ≠ po; wersji nie ma
// w ładunku pod p albo po regule pola (tożsamość wizyty dopisana przez bieżącą wersję, odcisk przeliczony z niej) wersja
// ≠ ładunek (bez rev). Echo także po busy i apply-error rzuconych z Le (po zapisie wersji); bez echa przy
// session-changed i locked. Błędy odczytu osobno dla każdego kandydata: stan „przed” nieznany albo nieczytelny —
// porównanie tylko z ładunkiem (z warunkami z rekordów sklepu, gdy są); nieczytelna treść „po” — snap tego kandydata;
// cały odczyt „po” zawodzi — snap każdego kandydata (klucz bez wersji — bez wiersza). Strażnik tożsamości chronionego
// sejfu niedostępny przy odczycie „przed” — busy z kodem jak dziś, bez scalania.
// Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs (emisja: true, przegląd przy odblokowaniu, moduły
// punktu odzyskiwania) na adapterze IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs (tryb „Komputer
// prywatny”, jeśli przypadek nie mówi inaczej), ładowany z kopii źródła z licznikiem (tests/support/sejf-bez-wstawek.mjs:
// l.emisje, l.zastosowania — odczyty bramki w Bem_zastosujEcho, l.odczyty() — suma). Pola okna VILDA_EVENT_LOG
// i VILDA_EVENT_ECHO z getterami (stan i licznik odczytów); konta zakładane przy zamkniętej bramce. Bliźniak — okno na
// niezależnej kopii baz atrapy (o.idb.__atrapa.klonuj()) z tym samym kontem; bliźniak bez emisji (domyślnie) buduje
// koperty zdarzeń builderami części Bev_ (bez bramki); bliźniak z emisją — kopia źródła z licznikiem, otwarta bramka
// i przełącznik odsyłania według przypadku. Koperta poza builderem (sam rev z wyższym rev, ładunek bez tożsamości wizyty) to jawna treść koperty buildera
// z jedną opisaną zmianą, zaszyfrowana encryptEvent (jak koperta z innej wersji aplikacji). Sztuczny zegar (tylko Date)
// z jawnym krokiem; po każdej operacji emissionsSettled() i cisza okna. Wiersze echa = wiersze kolejki od znacznika
// (seqLocal), treść — decryptPayloadForCurrentUser. Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”, masy 15–45 kg), bez PESEL.
//
// E3-PR0d (P-ZBIEZNOSC-ZDARZEN, odsyłanie wpisów Kosza; ten sam przełącznik): po zastosowaniu koperty zdarzenia do
// kolejki trafia także stomb każdej wersji z ładunku (te same identyfikatory kandydatów), której wpis Kosza scalanie
// zapisało inaczej, niż był przed scaleniem i niż przyszedł: po scaleniu jest wpis tej wersji; surowe elementy listy
// Kosza w metadanych konta przed ≠ po (inaczej bez odszyfrowania); wpis w postaci wysyłkowej (Bev_wpisKosza) po kanonie —
// bez opisu (rev, updatedAtISO, zmianaISO, koszISO, revPary), seq i postaci gwiazdki w treści (payload._pinned,
// payload._pinnedState), lista posortowana — przed ≠ po i nie samo wygaśnięcie treści (po bez treści tam, gdzie przed ją
// miał, a poza tym równy); wpisu nie ma w ładunku albo po regule pola (bez visitIdentity i payload.visit nieobecnych
// w elemencie ładunku tej samej karty) ≠ wpis z ładunku i nie samo wygaśnięcie względem ładunku. Emisja po odsyłaniu
// wersji: Bem_zmiana('stomb', identyfikatory wersji, sesja scalania). Odczyt wpisów przez strzeżony adapter po odczycie
// wersji i jego kontrolach („przed”) oraz po odczycie wersji „po”; sesja zastosowania sprawdzana przed odczytem i po nim;
// SYNC_DB_DELETED i PATIENT_AUTHORITY_UNAVAILABLE z odczytu „przed” — jak z odczytu wersji; SYNC_DB_DELETED w odczycie
// „po” — bez odsyłania wersji i wpisów; błędy osobno dla każdego kandydata (stan przed nieznany — porównanie z ładunkiem;
// nieczytelna tożsamość „po” — odesłanie, dopisanie odmawia z kodem; cały odczyt „po” zawodzi — każdy kandydat). Wpis
// Kosza, który zostaje tylko na jednym urządzeniu, gdy późniejsza wersja nie weszła, bo karta jest tu usunięta — poza
// tym PR (E3-PR0d2). Przypadki E3-PR0d na końcu listy niżej.
//
// HIGIENA: po przypadku cisza każdego okna, zero otwartych połączeń baz kolejki, zero transakcji atrapy w toku, każde
// wstrzymanie zwolnione.
//
// PRZYPADKI (tytuły opisowe; w nawiasie — wynik na bazie bez odsyłania: czerwony na bazie albo zielony z natury)
//   przełącznik wyłączony — sejf a sejf bez odsyłania (bezOdsylania: applyEncryptedEvent = Bev_zastosuj) w bliźniaczych
//        oknach: zestaw kopert (rekord złożony, sam rev, wpis Kosza, ładunek nieczytelny, stara delta) — te same
//        wyniki, zapis przebiegu atrapy (zbiór z krotnością), wiersze kolejki, operacje crypto.subtle i odczyty
//        VILDA_EVENT_LOG; jeden odczyt pola przełącznika i jeden odczyt klucza na zastosowanie w sejfie, 0 w sejfie bez
//        odsyłania (zielony z natury).
//   przełącznik wyłączony — brak pola i klucza, klucz '0', 'true', '1 ', pole 'true' (napis), pole 1, getter
//        localStorage rzucający: jeden odczyt pola i jeden odczyt klucza (albo localStorage), zapis przebiegu atrapy
//        jak w sejfie bez odsyłania, 0 wierszy (zielony z natury); przełącznik włączony — klucz '1' i pole true: wiersz
//        echa (czerwony na bazie).
//   rekord złożony (poprawka masy z ładunku i tutejsza gwiazdka) — jeden wiersz snap P/v z rekordem złożonym (czerwony
//        na bazie);
//   gwiazdka z ładunku, tutejsza późniejsza treść — jeden wiersz (czerwony na bazie);
//   sam rev: tutejsza treść wygrywa chwilą, ładunek ma wyższy rev (zapis samego rev) — 0; wersja z ładunku o wyższym
//        rev, ta sama treść i chwila (nowy szyfrogram) — 0 (zielony z natury);
//   to samo zdarzenie drugi raz — 0 (stan przed = po), bez odszyfrowania w porównaniu (zielony z natury);
//   ładunek bez payload.visit z odciskiem h liczonym z treści bez tożsamości — 0, reguła pola (zielony z natury);
//   porównanie w kształcie eksportu: Bev_wersjaEcha czyta treść przez Bvisit_read — strażnik źródła (rekordu bez
//        tożsamości wizyty bieżący sejf nie zapisuje; osiągalny tylko z kopii starszej aplikacji) (czerwony na bazie);
//   ładunek równy stanowi — 0 (zielony z natury); wersja z ładunku nowsza, przyjęta bez zmian — 0 (zielony z natury);
//   porównanie JSON-em z posortowanymi kluczami — Bev_json wycięty z sejfu (czerwony na bazie);
//   reguła pola — Bev_echoT wycięty z sejfu: tożsamość wizyty usuwana, gdy ładunek jej nie ma; odcisk h z ładunku tylko
//        przy świeżym odcisku po scaleniu (czerwony na bazie);
//   Bev_ECHO_ZAWSZE (tekst sejfu) = POLA_ZAWSZE.snap licznika odsyłania (czerwony na bazie);
//   zdarzenie stomb: wpis Kosza z gwiazdką przegrywa z późniejszą tutejszą poprawką (v tylko w snapshotTombstones) —
//        snap P/v (czerwony na bazie);
//   wersja spoza ładunku pod inną kartą: gwiazdka v pod P po „Scal pacjentów” P → G na A — snap G/v (czerwony na
//        bazie);
//   v przed scaleniem tylko w Koszu A, późniejsza poprawka z ładunku wraca z rejestrem gwiazdki wpisu Kosza — snap P/v
//        (czerwony na bazie);
//   wersja w snapshots i w snapshotTombstones jednego ładunku (koperta spoza buildera) — jeden kandydat, emisja z
//        kluczem P/v raz (czerwony na bazie);
//   sam nagłówek karty inny — 0 wierszy, bez wiersza karty (zielony z natury);
//   hak H1 i echo w jednym zdarzeniu (koperta ptomb z kartą docelową): pfull P i snap G/g — bez pomijania echa przy H1
//        (czerwony na bazie). Wariant „pełna karta p i echo p/v tej samej wersji” nie jest osiągalny kopertą buildera:
//        wersję z karty docelowej koperty scalanie przenosi pod tę kartę (przeniesienie, bez echa) także wtedy, gdy
//        nagrobek przegrywa; z koperty spoza buildera (snap z nagrobkiem karty P starszym od karty) — pfull P i snap
//        P/v (czerwony na bazie);
//   notatki (samo oznaczenie, rekord złączony) — te same wiersze co w sejfie bez odsyłania, także po sweepOutbox
//        (zielony z natury);
//   ładunki bez wersji (notatka, lista) — zapis przebiegu atrapy jak w sejfie bez odsyłania, bez odczytów wersji
//        (zielony z natury);
//   zdarzenie w otwartym kroku (wstrzymane „Usuń do Kosza” innej karty) — applyEncryptedEvent przed końcem kroku,
//        wiersz echa po końcu kroku, raz (czerwony na bazie);
//   wpis echa wstrzymany w bazie kolejki — applyEncryptedEvent rozstrzyga się przed wpisem (czerwony na bazie);
//   po emissionsSettled wiersz echa w kolejce, sweepOutbox go nie dubluje (czerwony na bazie);
//   odbiorcy odesłanego rekordu: bez nowszego składnika — zapis i 0 echa; z nowszym — jedno złączenie i koniec
//        (czerwony na bazie);
//   łączenie wpisów (Bob_plan): echo zastępuje czekający wiersz tej wersji; własny wiersz zastępuje echo; echo z
//        wierszem innej encji między nimi — oba zostają (czerwony na bazie bez echa);
//   busy z fazy Kosza po zapisie wersji — echo przy pierwszej próbie, ponowienie bez duplikatu (czerwony na bazie);
//   apply-error z Le po zapisie wersji — echo (czerwony na bazie); błąd przed zapisem — 0 (zielony z natury);
//   zmiana sesji w trakcie Le (blokada albo ponowne odblokowanie A) i zablokowany sejf — locked albo session-changed,
//        bez emisji odsyłania, 0 (zielony z natury); w trakcie odczytu stanu „przed” (blokada albo ponowne odblokowanie
//        A) — Le nie rusza ani w nowej sesji (czerwony na bazie); blokada przy odczycie pierwszego z trzech kandydatów
//        — bez dalszych odczytów sklepu wersji (czerwony na bazie); w trakcie odczytu stanu „po” — applied, bez emisji
//        odsyłania, 0 (zielony z natury);
//   błędy odczytu treści osobno dla każdego kandydata: nieczytelna treść „przed” — porównanie z ładunkiem; nieczytelna
//        treść „po” — echo tego kandydata (czerwony na bazie); cały odczyt „przed” zawodzi — porównanie z ładunkiem;
//        cały odczyt „po” zawodzi — echo kandydatów z kartą z odczytu „przed”, wersja tylko w Koszu bez wiersza
//        (czerwony na bazie);
//   removeUser tego konta w toku (sejf jeszcze odblokowany) w chwili wznowienia odczytu stanu „przed” —
//        session-changed, scalanie nie rusza (czerwony na bazie); usuwanie konta w trakcie odczytu „po” (odmowa
//        SYNC_DB_DELETED) — applied, bez emisji odsyłania (czerwony na bazie, gdzie odczytu stanu nie ma);
//   strażnik tożsamości chronionego sejfu niedostępny od chwili po odszyfrowaniu koperty — busy z kodem jak dziś, bez
//        scalania i bez emisji odsyłania (zielony z natury);
//   wersja przeniesiona (ptomb z kartą docelową), pełna kopia, delta, stara delta przez applyEncryptedEvent — 0
//        (zielony z natury);
//   zamknięta bramka dziennika przy włączonym przełączniku — 0, zapis przebiegu atrapy jak w sejfie bez odsyłania,
//        jeden odczyt bramki w Bem_zastosujEcho (czerwony na bazie); „Komputer w pracy” — rekord złożony bez wiersza i
//        bez bazy kolejki, bez porównania stanu kandydatów (zielony z natury);
//   wartownik treści przy włączonym przełączniku: fikcyjny napis z nazwiska nie wychodzi poza szyfrogram (wyniki, także
//        ścieżka błędu porównania; emisja odsyłania z samymi identyfikatorami wersji; console, localStorage,
//        sessionStorage) (czerwony na bazie bez emisji odsyłania);
//   samokontrola kopii bez odsyłania (bezOdsylania na tekstach syntetycznych) (zielony z natury).
// PRZYPADKI E3-PR0d (odsyłanie wpisów Kosza):
//   gwiazdka spoza ładunku (koperta snap z gwiazdką sprzed Kosza) i w ładunku (koperta stomb bez tutejszej gwiazdki),
//        poprawka spoza ładunku i w ładunku — jeden wiersz stomb v z wpisem złożonym (czerwony na bazie);
//   sam opis wpisu (wyższy rev, inne seq), sama postać gwiazdki w treści, koperta starszej aplikacji bez pola gwiazdka
//        i bez rejestru w treści (dowód widoku: okno Kosza i „Przywróć” równe), koperta bez tożsamości wizyty, powtórka
//        zdarzenia (bez odszyfrowania), ładunek równy stanowi, zmiana samych składników lokalnych wpisu, wpis zdjęty
//        scaleniem — 0 wierszy stomb (zielony z natury);
//   wersja i wpis zmienione w jednym scaleniu — snap, potem stomb; łączenie wpisów kolejki; busy po zapisie listy Kosza
//        (czerwony na bazie);
//   zmiana sesji w odczycie wpisów „przed” (zielony z natury); zmiana sesji w odczycie wersji „przed” bez wejścia do
//        odczytu wpisów, zmiana sesji w porównaniu „po”, kody z odczytu wpisów „przed” i „po”, strażnik formy odczytu
//        (czerwony na bazie);
//   błędy osobno dla każdego kandydata: nieczytelna tożsamość „po”, cały odczyt „przed”, cały odczyt „po”, oba
//        (czerwony na bazie);
//   stałe wpisu Kosza równe licznikowi; kanon, reguła pola i samo wygaśnięcie z kodu sejfu (czerwony na bazie);
//   notatka, stara delta, delta, pełna kopia — 0 wierszy stomb; przełącznik wyłączony przy kopertach wpisów — jak
//        sejf bez odsyłania; zamknięta bramka i „Komputer w pracy” (zielony z natury);
//   wartownik treści — emisja odsyłania wpisu z samym identyfikatorem (czerwony na bazie);
//   odbiorca odesłanego wpisu po „Usuń pacjenta” (czerwony na bazie); samo wygaśnięcie treści przy kopercie bez
//        nowości (zielony z natury) a Kosz połączony z późniejszym przycięciem (czerwony na bazie);
//   zegar: granica 30 dni (− 1 ms, = granica, + 1 ms), granica w trakcie scalania, okno nagrobków 365 dni, rozjazd
//        zegarów (czerwony na bazie); odbiorca po granicy bez innej różnicy — 0 (zielony z natury).
// Kopia sejfu tylko w tym pliku (busy, apply-error i błąd odczytu stanu): wstawka na początku Bkz_scalKoniec (faza Kosza,
// po zapisie wersji w Le), na początku Le albo na początku Bev_stanEcha (odczyt stanu kandydatów) rzuca raz fikcyjny błąd
// z pola okna — prawdziwą drogą zajęta blokada karty w fazie Kosza wymaga limitu blokady; strażnik osiągalności: Le
// ponownie rzuca vildaMergeBusy i VISIT_IDENTITY_CONFLICT z fazy Kosza.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKRYPTY_PUNKTU, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';
import { ZRODLO_SEJFU, bezOdsylania, licznikEmisji } from '../support/sejf-bez-wstawek.mjs';
import { POLA_D7, POLA_ZAWSZE, POSTAC_GWIAZDKI, odcisk } from '../support/licznik-odsylania.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 60_000;
const KLUCZ_ECHA = 'vilda-event-echo-v1';
let zegar = START;
const tik = (ms = 1000) => { zegar += ms; vi.setSystemTime(zegar); };
const naStart = () => { zegar = START; vi.setSystemTime(zegar); };
const ustawZegar = (t) => { zegar = t; vi.setSystemTime(zegar); };
// Sejf z odsyłaniem (E3-PR0c). Sprawdzenia, że przełącznik doszedł do części odsyłania (odczyty bramki
// w Bem_zastosujEcho), — tylko na sejfie z nim.
const MA_ECHO = /function Bem_zastosujEcho\(/.test(ZRODLO_SEJFU);

const OKNA = [];
const UCHWYTY = [];

beforeEach(() => {
  przechwycZadaniaWTle();
  vi.useFakeTimers({ toFake: ['Date'] });
  naStart();
  vi.stubGlobal('fetch', async () => { throw new Error('Fikcyjny brak sieci'); });
});
afterEach(async () => {
  const bledy = [];
  for (const u of UCHWYTY.splice(0)) if (!u.zwolniony) { bledy.push('wstrzymanie bez zwolnienia'); u.zwolnij(); }
  for (const o of OKNA) { if (o.locks) await o.locks.zwolnijWszystkie(); }
  const atrapy = new Set(OKNA.map((o) => o.idb));
  for (const o of OKNA) { try { await o.cisza(); } catch (x) { bledy.push(String(x && x.message)); } }
  for (const idb of atrapy) {
    const p = idb.__atrapa.polaczenia(/^vilda_sync_/);
    if (p) bledy.push(`otwarte połączenia baz kolejki: ${p}`);
    if (idb.__atrapa.wToku()) bledy.push(`transakcje atrapy w toku: ${idb.__atrapa.wToku()}`);
    if (idb.__atrapa.niezwolnione()) bledy.push(`wstrzymania atrapy bez zwolnienia: ${idb.__atrapa.niezwolnione()}`);
  }
  for (const o of OKNA.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(bledy, 'higiena po przypadku').toEqual([]);
}, 60_000);

// ── Okna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pola okna z getterem: bramka dziennika (VILDA_EVENT_LOG) i przełącznik odsyłania (VILDA_EVENT_ECHO) — stan i licznik
// odczytów; licznik odczytów klucza przełącznika w localStorage okna (getItem).
function zPolem(o, nazwa, wartosc) {
  const stan = { wartosc, odczyty: 0 };
  Object.defineProperty(o.win, nazwa, {
    get() { stan.odczyty += 1; return stan.wartosc; },
    set(x) { stan.wartosc = x; },
    configurable: true,
  });
  return stan;
}
function przygotuj(o, l, bramka, echo) {
  o.l = l;
  o.bramka = zPolem(o, 'VILDA_EVENT_LOG', bramka);
  o.echo = zPolem(o, 'VILDA_EVENT_ECHO', echo);
  o.klucz = { odczyty: 0 };
  const ls = o.win.localStorage;
  const getItem = ls.getItem;
  ls.getItem = (k) => { if (k === KLUCZ_ECHA) o.klucz.odczyty += 1; return getItem(k); };
  o.uid = o.A.userId;
  o.gotowe = async () => { if (typeof o.ev.emissionsSettled === 'function') await o.ev.emissionsSettled(); await o.cisza(); };
  return o;
}
// Okno A z kopią sejfu z licznikiem (zrodlo — tekst sejfu); przegląd przy odblokowaniu jak w przeglądarce; konta
// zakładane przy zamkniętej bramce, potem bramka i przełącznik według opcji (echo: wartość pola VILDA_EVENT_ECHO).
async function okno({ bramka = true, echo = undefined, zrodlo = null, ...reszta } = {}) {
  const l = licznikEmisji(zrodlo ? { zrodlo } : {});
  const o = await oknoMagazynu({ konta: 'A', skrypty: SKRYPTY_PUNKTU, ...reszta, emisja: true, przeglad: true, bramka: false, zrodla: { 'vilda_vault.js': l.zaladuj } });
  OKNA.push(o);
  return przygotuj(o, l, bramka, echo);
}
// Bliźniak: niezależna kopia baz atrapy z tym samym kontem (ten sam klucz). Domyślnie bez emisji (bramka zamknięta,
// koperty z builderów); emisja: true — kopia źródła z licznikiem (zrodlo), otwarta bramka i przełącznik echo.
async function blizniak(o, { emisja = false, echo = undefined, zrodlo = null } = {}) {
  const l = licznikEmisji(zrodlo ? { zrodlo } : {});
  const B = await oknoMagazynu({
    idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU,
    emisja: true, zrodla: { 'vilda_vault.js': l.zaladuj },
  });
  OKNA.push(B);
  return przygotuj(B, l, emisja, emisja ? echo : undefined);
}

// ── Dane fikcyjne i pomocnicze ───────────────────────────────────────────────────────────────────────────────────────
const ostatni = (o) => o.kolejka('A').reduce((m, w) => Math.max(m, w.seqLocal), 0);
const wierszeOd = (o, od) => o.kolejka('A').filter((w) => w.seqLocal > od);
const opis = (w) => [w.kind, w.entityKey, w.state];
const odszyfruj = (o, env) => o.v.decryptPayloadForCurrentUser(env.iv, env.data);
const zbior = (l) => l.slice().sort();
const bezKonta = (log, uid) => log.map((w) => JSON.stringify(w).split(uid).join('<konto>'));
// Karta „Testowy Jan<i>” z wersjami o podanych masach (krok zegara 1 s po każdej).
async function karta(o, i = 1, masy = [20]) {
  const r = await o.v.savePatient(naglowek(i, { masa: masy[0] }), { dedup: false });
  tik();
  const w = [r.snapshotId];
  for (const m of masy.slice(1)) { w.push((await o.v.savePatient(naglowek(i, { masa: m }), { dedup: false, patientId: r.patientId })).snapshotId); tik(); }
  return { P: r.patientId, w };
}
const wersja = async (o, P, sid) => ((await o.v.getPatient(P)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null;
// Poprawka masy wersji sid w miejscu (jak okno Karty: bez nowej wersji, savedAtISO bez zmian).
async function popraw(o, P, sid, masa) {
  const s = await wersja(o, P, sid);
  await o.v.updateSnapshotPayload(P, sid, { ...s.payload, user: { ...s.payload.user, weight: masa } }, { preserveSavedAt: true });
  tik();
}
async function gwiazdka(o, P, sid, tak = true) { await o.v.setSnapshotPinned(P, sid, tak); tik(); }
// Koperta zdarzenia zbudowana i zaszyfrowana teraz (builder części Bev_, bez bramki); jawna — { k, env }.
async function koperta(B, k) {
  expect(k, 'kontrola: builder dał kopertę').toBeTruthy();
  return { env: (await B.ev.encryptEvent(k)).env, k };
}
const kopertaSnap = (B, P, sid) => B.ev.buildSnapshotEvent(P, sid, null).then((k) => koperta(B, k));
// Koperta z jawnej treści (kopia koperty buildera po zmianie) — jak od innej wersji aplikacji.
async function zTresci(B, k) { return { env: (await B.ev.encryptEvent(k)).env, k }; }
async function zastosuj(o, env) {
  const r = await o.ev.applyEncryptedEvent(env);
  await o.gotowe();
  return r;
}
// Treść wiersza snap kolejki: masa, gwiazdka i rev wersji koperty (jedna karta, jedna wersja).
async function trescWiersza(o, w) {
  const k = await odszyfruj(o, w.env);
  const s = k.patients[0].snapshots[0];
  return { kind: k.event.kind, key: k.event.key, masa: s.payload.user.weight, gwiazdka: !!s.payload._pinned, rev: s.rev };
}
const stanWersji = async (o, P, sid) => {
  const s = await wersja(o, P, sid);
  return s ? { masa: s.payload.user.weight, gwiazdka: !!s.payload._pinned, rev: s.rev } : null;
};
function wstrzymaj(o, wz) {
  const h = o.idb.__atrapa.wstrzymaj(wz);
  const u = { czeka: h.czeka, zwolniony: false, zwolnij() { u.zwolniony = true; h.zwolnij(); } };
  UCHWYTY.push(u);
  return u;
}
const bazaSejfu = (o) => `vilda_user_${o.uid}`;
// Transakcje atrapy na sklepie wersji bazy sejfu od znacznika (odczyty stanu kandydatów).
const txWersji = (o, z) => o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'tx' && w[1] === bazaSejfu(o) && w[2].includes('snapshots') && w[4] === 'start').length;
// Transakcje zapisu sklepu wersji bazy sejfu od znacznika.
const zapisyWersji = (o, z) => o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'tx' && w[1] === bazaSejfu(o) && w[3] === 'readwrite' && String(w[2]).includes('snapshots'));
// Licznik odszyfrowań w porównaniu (Bev_wersjaEcha) w oknie o od chwili wywołania.
function odszWersji(o) {
  const n = { ile: 0 };
  o.krypto.obserwuj((metoda, _argumenty, stos) => { if (metoda === 'decrypt' && String(stos).includes('Bev_wersjaEcha')) n.ile += 1; });
  return n;
}
// Wywołania emisji rodzaju snap (Bem_zmiana) od znacznika e0 (l.emisje kopii sejfu z licznikiem).
const emisjeSnap = (o, e0) => o.l.emisje.slice(e0).filter((x) => x.kind === 'snap');
// Funkcja najwyższego poziomu z tekstu sejfu (do sprawdzeń funkcji czystych poza oknem).
function wytnij(nazwa) {
  const m = ZRODLO_SEJFU.match(new RegExp(`\\nfunction ${nazwa}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  expect(m, `funkcja ${nazwa} w sejfie`).toBeTruthy();
  return m[0];
}

// Scenariusz bazowy rekordu złożonego (przykład 1 projektu bez retencji): A — karta P z wersją v (20 kg); bliźniak B
// poprawia v na 17,2 kg (koperta snap B); A daje v gwiazdkę. Zastosowanie koperty B u A składa rekord 17,2 kg
// z gwiazdką.
async function rekordZlozony(o, { echoB = undefined, emisjaB = false } = {}) {
  const k = await karta(o, 1, [20]);
  const v = k.w[0];
  await o.gotowe();
  const B = await blizniak(o, { emisja: emisjaB, echo: echoB });
  tik(MIN);
  await popraw(B, k.P, v, 17.2);
  const kB = await kopertaSnap(B, k.P, v);
  tik(MIN);
  await gwiazdka(o, k.P, v);
  await o.gotowe();
  return { P: k.P, v, B, kB };
}
// Pełna karta P z bliźniaka B u A (jedna porcja; wersje w kolejności ładunku): v — poprawka B (17,2 kg) i gwiazdka A
// (rekord złożony), w — poprawka B (30 kg) przyjęta bez zmian, x — w Koszu A (po scaleniu bez wersji pod kartą), y — bez
// zmian (rekord sklepu przed = po).
async function pelnaKarta(o) {
  const k = await karta(o, 1, [20, 21, 22, 23]);
  const [v, w, x, y] = k.w;
  await o.gotowe();
  const B = await blizniak(o);
  tik(MIN);
  await popraw(B, k.P, v, 17.2);
  await popraw(B, k.P, w, 30);
  const porcje = await B.ev.buildPatientFullEvents(k.P, null);
  expect(porcje.length, 'kontrola: jedna porcja pełnej karty').toBe(1);
  const kB = await koperta(B, porcje[0]);
  expect(kB.k.patients[0].snapshots.map((q) => q.snapshotId), 'kontrola: wersje w kolejności ładunku').toEqual([v, w, x, y]);
  tik(MIN);
  await gwiazdka(o, k.P, v);
  await o.v.moveSnapshotToTrash(k.P, x);
  tik();
  await o.gotowe();
  return { P: k.P, v, w, x, y, kB };
}
// Nazwy wersji (v, w, x, y) wierszy snap kolejki — posortowane.
const nazwyWersji = (s, wiersze) => wiersze.filter((r) => r.kind === 'snap')
  .map((r) => ({ [s.v]: 'v', [s.w]: 'w', [s.x]: 'x', [s.y]: 'y' })[r.entityKey.split('/')[1]] || r.entityKey).sort();
// Stan pełnej karty po zastosowaniu: masa v i w, gwiazdka v, x poza kartą.
const stanKarty = async (o, s) => ({ v: await stanWersji(o, s.P, s.v), w: (await stanWersji(o, s.P, s.w)).masa, x: await wersja(o, s.P, s.x) });
const STAN_KARTY = { v: { masa: 17.2, gwiazdka: true, rev: 2 }, w: 30, x: null };

// ── przełącznik wyłączony = jak dziś ───────────────────────────────────────────────────────────────────────
// Zestaw kopert przypadku równoważności na A: rekord złożony (v), sam rev (w: tutejsza treść późniejsza, ładunek z wyższym rev), wpis Kosza
// (x do Kosza na B), ładunek nieczytelny (szyfrogram obcy), stara delta (ładunek bez event).
async function zestawRownowaznosci(o) {
  const k = await karta(o, 1, [20, 21, 22]);
  const [v, w, x] = k.w;
  await o.gotowe();
  const B = await blizniak(o);
  tik(MIN);
  await popraw(B, k.P, v, 17.2);
  await popraw(B, k.P, w, 30);
  await popraw(B, k.P, w, 31);
  const kv = await kopertaSnap(B, k.P, v);
  const kw = await kopertaSnap(B, k.P, w);
  await B.v.moveSnapshotToTrash(k.P, x, { odepnij: true });
  tik();
  const kx = await koperta(B, await B.ev.buildSnapshotTombstoneEvent(x, null));
  const kd = { env: await B.v.buildPatientDelta(k.P) };
  tik(MIN);
  await gwiazdka(o, k.P, v);
  await popraw(o, k.P, w, 33);
  await o.gotowe();
  const nieczytelna = { iv: kv.env.iv, data: kw.env.data };
  return { ...k, B, koperty: [kv.env, kw.env, kx.env, nieczytelna, kd.env] };
}
// Bliźniacze okno wobec A (ta sama kopia baz atrapy) z kopią źródła zrodlo, otwartą bramką i przełącznikiem echo.
async function klonA(o, zrodlo, echo = undefined) {
  const l = licznikEmisji({ zrodlo });
  const X = await oknoMagazynu({
    idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU,
    emisja: true, zrodla: { 'vilda_vault.js': l.zaladuj },
  });
  OKNA.push(X);
  return przygotuj(X, l, true, echo);
}
// Przebieg zastosowań kopert na oknie X: wyniki (bez pól niewyliczalnych), zapis atrapy, operacje crypto, wiersze
// kolejki od znacznika, odczyty pól.
async function przebieg(X, koperty) {
  await X.gotowe();
  const z = X.znacznik();
  const k0 = X.krypto.log.length;
  const s0 = ostatni(X);
  const odczyty0 = { bramka: X.bramka.odczyty, echo: X.echo.odczyty, klucz: X.klucz.odczyty };
  const wyniki = [];
  for (const env of koperty) { wyniki.push(JSON.parse(JSON.stringify(await X.ev.applyEncryptedEvent(env)))); tik(); await X.gotowe(); }
  return {
    wyniki, log: zbior(bezKonta(X.idb.__atrapa.log.slice(z.log), X.uid)), krypto: zbior(X.krypto.log.slice(k0).map((x) => x.metoda)),
    wiersze: wierszeOd(X, s0).map(opis), bramka: X.bramka.odczyty - odczyty0.bramka, echo: X.echo.odczyty - odczyty0.echo,
    klucz: X.klucz.odczyty - odczyty0.klucz,
  };
}

describe('przełącznik wyłączony — zastosowanie zdarzenia jak dziś', () => {
  it('sejf a sejf bez odsyłania w bliźniaczych oknach (rekord złożony, sam rev, wpis Kosza, ładunek nieczytelny, stara delta) — te same wyniki, zapis przebiegu atrapy, wiersze kolejki, operacje crypto.subtle i odczyty bramki; jeden odczyt pola przełącznika na zastosowanie', async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const s = await zestawRownowaznosci(o);
    const bez = bezOdsylania();
    expect(bez.jest, 'kopia bez odsyłania różni się od sejfu dokładnie wtedy, gdy sejf ma odsyłanie').toBe(MA_ECHO);
    const t = zegar;
    ustawZegar(t);
    const a = await przebieg(await klonA(o, ZRODLO_SEJFU), s.koperty);
    ustawZegar(t);
    const b = await przebieg(await klonA(o, bez.zrodlo), s.koperty);
    expect(a.wyniki.map((w) => w.status), 'kontrola: statusy zestawu').toEqual(['applied', 'applied', 'applied', 'unreadable', 'applied']);
    expect(a.wyniki, 'wyniki applyEncryptedEvent').toEqual(b.wyniki);
    expect(a.log.length, 'kontrola: zapis przebiegu atrapy niepusty').toBeGreaterThan(0);
    expect(a.log, 'zapis przebiegu atrapy IndexedDB').toEqual(b.log);
    expect(a.krypto, 'operacje crypto.subtle').toEqual(b.krypto);
    expect(a.wiersze, 'wiersze kolejki').toEqual(b.wiersze);
    expect({ sejf: a.bramka, bez: b.bramka }, 'odczyty pola bramki').toEqual({ sejf: b.bramka, bez: b.bramka });
    expect({ sejf: a.echo, bez: b.echo }, 'odczyty pola przełącznika').toEqual({ sejf: MA_ECHO ? 5 : 0, bez: 0 });
    expect({ sejf: a.klucz, bez: b.klucz }, 'odczyty klucza przełącznika').toEqual({ sejf: MA_ECHO ? 5 : 0, bez: 0 });
  }, 2 * CZAS);

  const WARIANTY = [
    ['brak pola i klucza', {}],
    ["klucz '0'", { klucz: '0' }],
    ["klucz 'true'", { klucz: 'true' }],
    ["klucz '1 '", { klucz: '1 ' }],
    ["pole 'true' (napis)", { pole: 'true' }],
    ['pole 1', { pole: 1 }],
    ['getter localStorage rzucający', { rzuca: true }],
  ];
  it(`przełącznik wyłączony (${WARIANTY.map((w) => w[0]).join(', ')}) — jeden odczyt pola i jeden odczyt klucza na zastosowanie, zapis przebiegu atrapy jak w sejfie bez odsyłania, 0 wierszy`, async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const t = zegar;
    ustawZegar(t);
    const wzor = await przebieg(await klonA(o, bezOdsylania().zrodlo), [s.kB.env]);
    expect(wzor.wyniki.map((w) => w.status), 'kontrola: zastosowane').toEqual(['applied']);
    for (const [nazwa, w] of WARIANTY) {
      ustawZegar(t);
      const X = await klonA(o, ZRODLO_SEJFU, w.pole);
      if (w.klucz !== undefined) X.win.localStorage.setItem(KLUCZ_ECHA, w.klucz);
      if (w.rzuca) {
        X.lsOdczyty = 0;
        Object.defineProperty(X.win, 'localStorage', { get() { X.lsOdczyty += 1; throw new Error('Fikcyjny brak dostępu do localStorage'); }, configurable: true });
      }
      const r = await przebieg(X, [s.kB.env]);
      expect(r.wyniki, `${nazwa}: wynik`).toEqual(wzor.wyniki);
      expect(r.log, `${nazwa}: zapis przebiegu atrapy`).toEqual(wzor.log);
      expect(r.wiersze, `${nazwa}: wiersze kolejki`).toEqual([]);
      expect(r.echo, `${nazwa}: odczyty pola przełącznika`).toBe(MA_ECHO ? 1 : 0);
      if (w.rzuca) expect(X.lsOdczyty, `${nazwa}: odczyty localStorage`).toBe(MA_ECHO ? 1 : 0);
      else expect(r.klucz, `${nazwa}: odczyty klucza przełącznika`).toBe(MA_ECHO ? 1 : 0);
    }
  }, 4 * CZAS);

  for (const [nazwa, ustaw] of [["klucz '1'", (X) => { X.win.localStorage.setItem(KLUCZ_ECHA, '1'); }], ['pole true', (X) => { X.echo.wartosc = true; }]]) {
    it(`przełącznik włączony (${nazwa}) — jeden wiersz echa snap P/v`, async () => {
      const o = await okno({ bramka: true });
      await o.zaloguj('A');
      const s = await rekordZlozony(o);
      ustaw(o);
      const s0 = ostatni(o);
      expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
      expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
    }, CZAS);
  }
});

// ── warunki reguły ──────────────────────────────────────────────────────────────────────────────
describe('wersja, którą scalanie zapisało inaczej, niż przyszła', () => {
  it('rekord złożony (poprawka masy z ładunku i tutejsza gwiazdka) — jeden wiersz snap P/v z rekordem złożonym (17,2 kg z gwiazdką); jedyny wiersz tej wersji w kolejce', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    const stan = await stanWersji(o, s.P, s.v);
    expect([stan.masa, stan.gwiazdka], 'kontrola: A złożyło rekord').toEqual([17.2, true]);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze echa').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
    expect(await trescWiersza(o, nowe[0]), 'treść wiersza echa = rekord złożony').toEqual({ kind: 'snap', key: `${s.P}/${s.v}`, ...stan });
    expect(o.kolejka('A').filter((w) => w.entityKey === `${s.P}/${s.v}`).map(opis), 'jeden wiersz tej wersji (echo zastąpiło czekający wiersz gwiazdki)').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
    if (MA_ECHO) expect(o.l.zastosowania.length, 'odczyt bramki w Bem_zastosujEcho').toBe(1);
  }, CZAS);

  it('gwiazdka z ładunku, tutejsza późniejsza treść — jeden wiersz (treść tutejsza 21,4 kg z gwiazdką)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await gwiazdka(B, k.P, v);
    const kB = await kopertaSnap(B, k.P, v);
    tik(MIN);
    await popraw(o, k.P, v, 21.4);
    await o.gotowe();
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const stan = await stanWersji(o, k.P, v);
    expect([stan.masa, stan.gwiazdka], 'kontrola: tutejsza treść z gwiazdką').toEqual([21.4, true]);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze echa').toEqual([['snap', `${k.P}/${v}`, 'pending']]);
    expect(await trescWiersza(o, nowe[0]), 'treść wiersza echa').toEqual({ kind: 'snap', key: `${k.P}/${v}`, ...stan });
  }, CZAS);

  it('sam rev — tutejsza treść wygrywa chwilą, ładunek ma wyższy rev (zapis samego rev, ten sam szyfrogram) — 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, k.P, v, 18);
    await popraw(B, k.P, v, 19);
    const kB = await kopertaSnap(B, k.P, v);
    tik(MIN);
    await popraw(o, k.P, v, 23);
    await o.gotowe();
    const przed = await stanWersji(o, k.P, v);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const po = await stanWersji(o, k.P, v);
    expect({ przed, po }, 'kontrola: zapis samego rev (treść tutejsza, rev z ładunku)').toEqual({ przed: { ...przed }, po: { ...przed, rev: kB.k.patients[0].snapshots[0].rev } });
    expect(po.rev, 'kontrola: rev wyższy').toBeGreaterThan(przed.rev);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('sam rev — wersja z ładunku o wyższym rev, ta sama treść i chwila (nowy szyfrogram) — 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await popraw(o, k.P, v, 19);
    await o.gotowe();
    const B = await blizniak(o);
    const jawna = (await kopertaSnap(B, k.P, v)).k;
    const wyzszy = JSON.parse(JSON.stringify(jawna));
    wyzszy.patients[0].snapshots[0].rev += 1;
    const kB = await zTresci(B, wyzszy);
    const przed = await o.idb.__atrapa.bazy()[bazaSejfu(o)].sklepy.snapshots.wiersze.find((r) => r.snapshotId === v);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const po = await o.idb.__atrapa.bazy()[bazaSejfu(o)].sklepy.snapshots.wiersze.find((r) => r.snapshotId === v);
    expect([po.rev, po.payloadCipher.data !== przed.payloadCipher.data], 'kontrola: przyjęta wersja z ładunku (wyższy rev, nowy szyfrogram)').toEqual([przed.rev + 1, true]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('to samo zdarzenie drugi raz — 0 wierszy (stan przed = po), bez odszyfrowania w porównaniu', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    tik();
    const s0 = ostatni(o);
    const przed = await stanWersji(o, s.P, s.v);
    const n = odszWersji(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    expect(await stanWersji(o, s.P, s.v), 'kontrola: stan bez zmian').toEqual(przed);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa po powtórce').toEqual([]);
    expect(n.ile, 'bez odszyfrowania w porównaniu (rekord sklepu przed = po)').toBe(0);
  }, CZAS);

  it('ładunek bez payload.visit z odciskiem h liczonym z treści bez tożsamości (jak od starszej aplikacji) — scalanie dopisuje tożsamość i przelicza odcisk, rekord z gwiazdką z ładunku: 0 wierszy (reguła pola)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await gwiazdka(B, k.P, v);
    const jawna = JSON.parse(JSON.stringify((await kopertaSnap(B, k.P, v)).k));
    const s = jawna.patients[0].snapshots[0];
    expect(!!(s.payload.visit && s.payload._pinnedState && s.payload._pinnedState.h), 'kontrola: wersja z tożsamością i odciskiem').toBe(true);
    delete s.payload.visit;
    s.payload._pinnedState.h = odcisk(s.payload);
    const kB = await zTresci(B, jawna);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const po = await wersja(o, k.P, v);
    expect([!!po.payload._pinned, !!po.payload.visit, po.payload._pinnedState.h !== s.payload._pinnedState.h], 'kontrola: gwiazdka przyjęta, tożsamość dopisana, odcisk przeliczony').toEqual([true, true, true]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('porównanie w kształcie eksportu — Bev_wersjaEcha czyta treść wersji przez Bvisit_read (tożsamość wizyty wyliczona dla starych rekordów), jak exportSyncPayload', () => {
    const m = ZRODLO_SEJFU.match(/async function Bev_wersjaEcha\([^)]*\) \{[\s\S]*?\n\}/);
    expect(m, 'funkcja Bev_wersjaEcha w części Bev_').toBeTruthy();
    expect(m[0], 'treść przez Bvisit_read w kształcie Bev_wersja').toMatch(/Bev_wersja\([^;]*await Bvisit_read\(/);
  });

  it('ładunek równy stanowi — 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21]);
    await gwiazdka(o, k.P, k.w[0]);
    await o.gotowe();
    const B = await blizniak(o);
    const kB = await kopertaSnap(B, k.P, k.w[0]);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('wersja z ładunku nowsza, przyjęta bez zmian — 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, k.P, v, 17.2);
    const kB = await kopertaSnap(B, k.P, v);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect(await stanWersji(o, k.P, v), 'kontrola: przyjęta wersja z ładunku').toEqual(await stanWersji(B, k.P, v));
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('porównanie rekordów i wersji JSON-em z posortowanymi kluczami — Bev_json z kodu sejfu: ta sama treść z inną kolejnością kluczy (także zagnieżdżonych) daje ten sam tekst, pole undefined pomijane, inna wartość — inny tekst', () => {
    const json = new Function(`${wytnij('Bgw_kanon')}\n${wytnij('Bev_kopia')}\n${wytnij('Bev_json')}\nreturn Bev_json;`)();
    const w1 = { snapshotId: 'v', rev: 2, payload: { user: { weight: 17.2, height: 120 }, _pinned: true }, updatedAtISO: null };
    const w2 = { updatedAtISO: null, payload: { _pinned: true, user: { height: 120, weight: 17.2 } }, rev: 2, snapshotId: 'v', brak: undefined };
    expect(json(w1), 'inna kolejność kluczy, pole undefined').toBe(json(w2));
    expect(json(w1), 'inna wartość').not.toBe(json({ ...w1, payload: { ...w1.payload, user: { weight: 17.3, height: 120 } } }));
  });

  it('reguła pola — Bev_echoT z kodu sejfu: tożsamość wizyty z wersji po scaleniu usuwana, gdy ładunek jej nie ma; odcisk h po scaleniu świeży (z treści z tożsamością) — h z ładunku; nieświeży (gwiazdka sprzed zmiany treści) — bez podstawienia; ładunek z tożsamością — wersja bez zmian', () => {
    const stala = ZRODLO_SEJFU.match(/\nconst Bev_ECHO_ZAWSZE = [^;]*;/);
    expect(stala, 'stała Bev_ECHO_ZAWSZE w sejfie').toBeTruthy();
    const NAZWY = ['Bev_obiekt', 'Bev_ma', 'Bev_kopia', 'Bgw_kanon', 'Bgw_odcisk', 'Bev_pole', 'Bev_bezPola', 'Bev_json', 'Bev_echoT'];
    const f = new Function(`${stala[0]}\n${NAZWY.map(wytnij).join('\n')}\nreturn { echoT: Bev_echoT, json: Bev_json, odcisk: Bgw_odcisk };`)();
    const tresc = { user: { weight: 17.2, height: 120 } };
    const gwiazdkaZ = (h) => ({ _pinned: true, _pinnedState: { pin: true, at: '2026-03-02T08:03:00.000Z', h } });
    const P = { snapshotId: 'v', payload: { ...tresc, ...gwiazdkaZ(f.odcisk(tresc)) } };
    const zTozsamoscia = { ...tresc, visit: { key: 'fikcyjny-klucz', date: '2026-03-02' } };
    const swiezy = { snapshotId: 'v', payload: { ...zTozsamoscia, ...gwiazdkaZ(f.odcisk(zTozsamoscia)) } };
    const nieswiezy = { snapshotId: 'v', payload: { ...zTozsamoscia, ...gwiazdkaZ(f.odcisk({ user: { weight: 20, height: 120 } })) } };
    expect(f.json(f.echoT(swiezy, P)), 'świeży odcisk: bez tożsamości, h z ładunku — równe ładunkowi').toBe(f.json(P));
    expect(f.json(f.echoT(nieswiezy, P)), 'nieświeży odcisk: bez podstawienia').not.toBe(f.json(P));
    expect(f.json(f.echoT(nieswiezy, P)), 'nieświeży odcisk: tożsamość usunięta, h bez zmian').toBe(f.json({ snapshotId: 'v', payload: { ...tresc, ...gwiazdkaZ(nieswiezy.payload._pinnedState.h) } }));
    const PzT = { snapshotId: 'v', payload: { ...zTozsamoscia, ...gwiazdkaZ(f.odcisk(zTozsamoscia)) } };
    expect(f.json(f.echoT(swiezy, PzT)), 'ładunek z tożsamością: wersja bez zmian').toBe(f.json(swiezy));
  });
});

// ── stała pól zawsze zapisywanych ──────────────────────────────────────────────────────────────────────────────
describe('pola zapisywane zawsze przez bieżącą wersję', () => {
  it('stała w części Bev_ równa polom reguły pola licznika (rodzaj snap)', () => {
    const m = ZRODLO_SEJFU.match(/const Bev_ECHO_ZAWSZE = Object\.freeze\((\[[^\]]*\])\);/);
    expect(m, 'stała Bev_ECHO_ZAWSZE w sejfie').toBeTruthy();
    expect(JSON.parse(m[1].replace(/'/g, '"'))).toEqual([...POLA_ZAWSZE.snap]);
  });
});

// ── kandydaci spoza kart z ładunku, wpisy Kosza, nagłówek karty ─────────────────────────────────────
describe('kandydaci z ładunku — wersje pod inną kartą, w Koszu i nagłówek karty', () => {
  it('zdarzenie stomb — wpis Kosza z gwiazdką (B: v do Kosza, potem gwiazdka z C) przegrywa z późniejszą poprawką A; scalanie oddaje wersji A rejestr gwiazdki wpisu: snap P/v (v tylko w snapshotTombstones ładunku)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    const C = await blizniak(o);
    tik(MIN);
    await gwiazdka(C, k.P, v);
    const kC = await kopertaSnap(C, k.P, v);
    tik(MIN);
    await B.v.moveSnapshotToTrash(k.P, v, { odepnij: true });
    tik();
    expect((await B.ev.applyEncryptedEvent(kC.env)).status, 'kontrola: B przyjmuje gwiazdkę C').toBe('applied');
    await B.cisza();
    const kB = await koperta(B, await B.ev.buildSnapshotTombstoneEvent(v, null));
    const wpis = (kB.k.snapshotTombstones || []).find((e) => e.snapshotId === v);
    expect([!!wpis, !!(wpis && wpis.gwiazdka), (kB.k.patients || []).some((p) => (p.snapshots || []).length)], 'kontrola: koperta stomb — wpis Kosza z gwiazdką, bez wersji w patients').toEqual([true, true, false]);
    tik(MIN);
    await popraw(o, k.P, v, 23.5);
    await o.gotowe();
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const stan = await stanWersji(o, k.P, v);
    expect([stan && stan.masa, stan && stan.gwiazdka], 'kontrola: v zostaje w karcie (późniejsza poprawka) z gwiazdką z wpisu Kosza').toEqual([23.5, true]);
    const nowe = wierszeOd(o, s0).filter((w) => w.kind === 'snap');
    expect(nowe.map(opis), 'wiersze echa').toEqual([['snap', `${k.P}/${v}`, 'pending']]);
    expect(await trescWiersza(o, nowe[0]), 'treść wiersza echa').toEqual({ kind: 'snap', key: `${k.P}/${v}`, ...stan });
  }, CZAS);

  it('wersja spoza ładunku pod inną kartą — B daje v gwiazdkę pod P, potem A „Scal pacjentów” P → G (nagrobek P późniejszy); koperta B u A: gwiazdka v przyjęta pod G — snap G/v', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const kp = await karta(o, 1, [20]);
    const kg = await karta(o, 2, [30]);
    const v = kp.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await gwiazdka(B, kp.P, v);
    const kB = await kopertaSnap(B, kp.P, v);
    tik(MIN);
    await o.v.mergePatients(kp.P, kg.P);
    tik();
    await o.gotowe();
    expect(await wersja(o, kg.P, v), 'kontrola: v pod G na A').toBeTruthy();
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const stan = await stanWersji(o, kg.P, v);
    expect(stan && stan.gwiazdka, 'kontrola: gwiazdka z ładunku na v pod G').toBe(true);
    const nowe = wierszeOd(o, s0).filter((w) => w.kind === 'snap');
    expect(nowe.map(opis), 'wiersze echa').toEqual([['snap', `${kg.P}/${v}`, 'pending']]);
    expect(await trescWiersza(o, nowe[0]), 'treść wiersza echa').toEqual({ kind: 'snap', key: `${kg.P}/${v}`, ...stan });
  }, CZAS);

  it('v przed scaleniem tylko w Koszu A (gwiazdka zdjęta przy usunięciu — rejestr wpisu Kosza); późniejsza poprawka B wraca do karty i dostaje rejestr wpisu — snap P/v (przed scaleniem v nie leżała pod żadną kartą)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await gwiazdka(o, k.P, v);
    await o.v.moveSnapshotToTrash(k.P, v, { odepnij: true });
    tik();
    await o.gotowe();
    expect(await wersja(o, k.P, v), 'kontrola: v tylko w Koszu A').toBe(null);
    tik(MIN);
    await popraw(B, k.P, v, 17.2);
    const kB = await kopertaSnap(B, k.P, v);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const po = await wersja(o, k.P, v);
    expect([po && po.payload.user.weight, !!(po && po.payload._pinnedState)], 'kontrola: v wróciła z poprawką B i rejestrem gwiazdki wpisu Kosza').toEqual([17.2, true]);
    const nowe = wierszeOd(o, s0).filter((w) => w.kind === 'snap');
    expect(nowe.map(opis), 'wiersze echa').toEqual([['snap', `${k.P}/${v}`, 'pending']]);
    const kk = await odszyfruj(o, nowe[0].env);
    expect(kk.patients[0].snapshots[0].payload, 'treść wiersza echa = wersja po scaleniu').toEqual(po.payload);
  }, CZAS);

  it('wersja w patients[].snapshots i w snapshotTombstones jednego ładunku (koperta spoza buildera: snap v z wpisem Kosza v) — jeden kandydat: emisja odsyłania z kluczem P/v raz', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, k.P, v, 17.2);
    const ks = await kopertaSnap(B, k.P, v);
    tik(MIN);
    await B.v.moveSnapshotToTrash(k.P, v, { odepnij: true });
    tik();
    const kx = await koperta(B, await B.ev.buildSnapshotTombstoneEvent(v, null));
    tik(MIN);
    await gwiazdka(o, k.P, v);
    await o.gotowe();
    const c = await B.v.encryptPayloadForCurrentUser({ ...ks.k, snapshotTombstones: kx.k.snapshotTombstones });
    expect(kx.k.snapshotTombstones.map((e) => e.snapshotId), 'kontrola: wpis Kosza v w ładunku').toEqual([v]);
    const e0 = o.l.emisje.length;
    expect((await zastosuj(o, { iv: c.iv, data: c.data })).status).toBe('applied');
    const klucze = emisjeSnap(o, e0).flatMap((x) => [].concat(x.klucze)).map((x) => `${x.patientId}/${x.snapshotId}`);
    expect(klucze, 'klucze emisji odsyłania').toEqual([`${k.P}/${v}`]);
  }, CZAS);

  it('sam nagłówek karty inny (koperta starszej wersji z opisem karty B; A ma nowszą własną wersję) — 0 wierszy echa, bez wiersza karty', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21]);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await o.v.savePatient(naglowek(1, { masa: 24, wzrost: 131 }), { dedup: false, patientId: k.P });
    tik();
    await o.gotowe();
    const kB = await kopertaSnap(B, k.P, k.w[0]);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const naglowekA = (await o.v.getPatient(k.P)).header;
    expect(JSON.stringify(naglowekA) !== JSON.stringify(kB.k.patients[0].header), 'kontrola: nagłówek karty A inny niż w kopercie').toBe(true);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);
});

// ── pełna karta z haka H1 i osobne echo w jednym zdarzeniu (decyzja z 2026-11-17: dopuszczona podwójna wysyłka) ───────────────
// Wariant z projektu (pełna karta p i echo p/v tej samej wersji z koperty ptomb z kartą docelową) nie jest osiągalny
// kopertą buildera: wersja v, którą koperta niesie pod kartą docelową G, scalanie przenosi pod G także wtedy, gdy nagrobek
// P przegrywa (przeniesienie — bez echa, E3-PR0f). Osiągalny jest hak H1 karty P i echo wersji karty G z tej samej
// koperty, a z koperty spoza buildera (snap z nagrobkiem karty, jak od innej wersji aplikacji) — pełna karta P i echo P/v:
// echa się nie pomija.
describe('hak H1 i echo w jednym zdarzeniu', () => {
  it('koperta ptomb P z kartą docelową G (B: poprawka g pod G, potem „Scal pacjentów” P → G); A daje g gwiazdkę i dopisuje wersję P później — nagrobek P przegrywa (pełna karta P z haka H1), v przeniesiona pod G (bez echa), g z rekordem złożonym: wiersze pfull P i snap G/g', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const kp = await karta(o, 1, [20]);
    const kg = await karta(o, 2, [30]);
    const [v, g] = [kp.w[0], kg.w[0]];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, kg.P, g, 31.5);
    await B.v.mergePatients(kp.P, kg.P);
    tik();
    const kB = await koperta(B, await B.ev.buildPatientTombstoneEvent(kp.P, null));
    const wG = ((kB.k.patients || []).find((p) => p.patientId === kg.P) || { snapshots: [] }).snapshots.map((q) => q.snapshotId);
    expect([wG.includes(v), wG.includes(g)], 'kontrola: koperta ptomb z kartą docelową G (wersje v i g)').toEqual([true, true]);
    tik(MIN);
    await gwiazdka(o, kg.P, g);
    await o.v.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: kp.P });
    tik();
    await o.gotowe();
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect([!!(await wersja(o, kg.P, v)), !!(await o.v.getPatient(kp.P))], 'kontrola: v pod G, karta P zostaje').toEqual([true, true]);
    const stan = await stanWersji(o, kg.P, g);
    expect([stan.masa, stan.gwiazdka], 'kontrola: g — treść B z gwiazdką A').toEqual([31.5, true]);
    expect(wierszeOd(o, s0).map((w) => [w.kind, w.entityKey]), 'pełna karta P z haka H1 i echo G/g').toEqual([['pfull', kp.P], ['snap', `${kg.P}/${g}`]]);
  }, CZAS);

  it('koperta snap spoza buildera z nagrobkiem karty P starszym od karty (nagrobek przegrywa — pełna karta P z haka H1) i poprawką v pod P; A dało v gwiazdkę — v z rekordem złożonym: wiersze pfull P i snap P/v', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const c = await s.B.v.encryptPayloadForCurrentUser({ ...s.kB.k, tombstones: [{ patientId: s.P, deletedAtISO: '2026-03-01T00:00:00.000Z' }] });
    expect((await zastosuj(o, { iv: c.iv, data: c.data })).status).toBe('applied');
    const stan = await stanWersji(o, s.P, s.v);
    expect([stan.masa, stan.gwiazdka, !!(await o.v.getPatient(s.P))], 'kontrola: rekord złożony, karta P zostaje').toEqual([17.2, true, true]);
    expect(wierszeOd(o, s0).map(opis).sort(), 'pełna karta P z haka H1 i echo P/v').toEqual([['pfull', s.P, 'pending'], ['snap', `${s.P}/${s.v}`, 'pending']].sort());
  }, CZAS);
});

// ── notatki i ładunki bez kandydatów ────────────────────────────────────────────────────────────────────
describe('notatki i ładunki bez wersji — bez odsyłania, jak dziś', () => {
  it('zdarzenia pnote (samo oznaczenie, poprawka treści z rekordem złączonym, sam rev) przy włączonym przełączniku — te same wiersze kolejki co w sejfie bez odsyłania, także po sweepOutbox; 0 wierszy snap', async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const n = (await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' })).id;
    tik();
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.completePatientNote(n);
    tik();
    const k1 = await koperta(B, await B.ev.buildPatientNoteEvent(n, null));
    tik(MIN);
    await o.v.savePatientNote({ id: n, patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść poprawiona.', category: 'inne' });
    tik();
    await o.gotowe();
    const koperty = [k1.env, k1.env];
    const t = zegar;
    const w = {};
    for (const [nazwa, zrodlo, echo] of [['sejf', ZRODLO_SEJFU, true], ['bez odsyłania', bezOdsylania().zrodlo, undefined]]) {
      ustawZegar(t);
      const X = await klonA(o, zrodlo, echo);
      const r = await przebieg(X, koperty);
      const s1 = ostatni(X);
      tik(MIN);
      await X.ev.sweepOutbox();
      await X.gotowe();
      w[nazwa] = { r, przeglad: wierszeOd(X, s1).map(opis), notatka: await X.v.getPatientNote(n) };
    }
    expect(w.sejf.r.wyniki.map((x) => x.status), 'kontrola: zastosowane').toEqual(['applied', 'applied']);
    expect(w.sejf.notatka, 'kontrola: ta sama notatka po scaleniu').toEqual(w['bez odsyłania'].notatka);
    expect(w.sejf.r.wiersze, 'wiersze kolejki po zdarzeniach').toEqual(w['bez odsyłania'].r.wiersze);
    expect(w.sejf.r.wiersze.filter((x) => x[0] === 'snap'), 'bez wierszy snap').toEqual([]);
    expect(w.sejf.przeglad, 'wiersze z przeglądu kolejki').toEqual(w['bez odsyłania'].przeglad);
  }, 2 * CZAS);

  it('ładunki bez wersji (notatka, lista pacjentów, preferencja) przy włączonym przełączniku — zapis przebiegu atrapy jak w sejfie bez odsyłania (bez odczytów wersji ponad dziś), 0 wierszy', async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const n = (await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' })).id;
    tik();
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.savePatientNote({ id: n, patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść B.', category: 'inne' });
    tik();
    const lista = await B.v.savePatientList({ name: 'Fikcyjna lista', patientIds: [k.P] });
    tik();
    const koperty = [(await koperta(B, await B.ev.buildPatientNoteEvent(n, null))).env, (await koperta(B, await B.ev.buildPatientListEvent(lista.id, null))).env];
    const t = zegar;
    const w = {};
    for (const [nazwa, zrodlo, echo] of [['sejf', ZRODLO_SEJFU, true], ['bez odsyłania', bezOdsylania().zrodlo, undefined]]) {
      ustawZegar(t);
      w[nazwa] = await przebieg(await klonA(o, zrodlo, echo), koperty);
    }
    expect(w.sejf.wyniki.map((x) => x.status), 'kontrola: zastosowane').toEqual(['applied', 'applied']);
    expect(w.sejf.log, 'zapis przebiegu atrapy').toEqual(w['bez odsyłania'].log);
    expect(w.sejf.wiersze, 'wiersze kolejki').toEqual(w['bez odsyłania'].wiersze);
  }, 2 * CZAS);
});

// ── kolejka, kroki, odbiorcy, łączenie wpisów ────────────────────────────────────────────────────────────
describe('wiersz echa w łańcuchu dopisań — krok, przegląd, odbiorcy, łączenie wpisów', () => {
  it('zdarzenie zastosowane w otwartym kroku (A: „Usuń do Kosza” wersji innej karty wstrzymane na odszyfrowaniu) — applyEncryptedEvent rozstrzyga się przed końcem kroku, wiersz echa po końcu kroku, raz', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const kq = await karta(o, 2, [30, 31]);
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const h = o.krypto.wstrzymaj({ metoda: 'decrypt', wStosie: 'Bkz_doKosza' });
    const kosz = o.v.moveSnapshotToTrash(kq.P, kq.w[0]);
    await h.osiagnieta;
    const r = await Promise.race([o.ev.applyEncryptedEvent(s.kB.env), new Promise((ok) => { setTimeout(() => ok({ status: 'czeka' }), 5000); })]);
    if (r.status !== 'applied') h.zwolnij();
    expect(r.status, 'applyEncryptedEvent przed końcem kroku').toBe('applied');
    for (let i = 0; i < 60; i += 1) await new Promise((ok) => { setImmediate(ok); });
    expect(wierszeOd(o, s0).map(opis), 'w otwartym kroku: bez wiersza echa').toEqual([]);
    h.zwolnij();
    await kosz;
    tik();
    await o.gotowe();
    const nowe = wierszeOd(o, s0).filter((w) => w.kind === 'snap');
    expect(nowe.map(opis), 'po końcu kroku: jeden wiersz echa').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
    // E3-PR0d: jedyny wiersz stomb to własny Kosz wersji karty Q z tego kroku (kandydatem koperty jest tylko v, której
    // wpisu Kosza nie ma) — bez odsyłania wpisu.
    expect(wierszeOd(o, s0).filter((w) => w.kind === 'stomb').map(opis), 'po końcu kroku: wiersz stomb tylko z własnego Kosza').toEqual([['stomb', kq.w[0], 'pending']]);
  }, CZAS);

  it('wpis echa wstrzymany w bazie kolejki (dodanie wiersza) — applyEncryptedEvent rozstrzyga się przed wpisem; wiersz echa po zwolnieniu', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const h = wstrzymaj(o, { przy: 'success', baza: `vilda_sync_${o.uid}`, sklep: 'outbox', metoda: 'add' });
    const r = await Promise.race([o.ev.applyEncryptedEvent(s.kB.env), new Promise((ok) => { setTimeout(() => ok({ status: 'czeka' }), 5000); })]);
    const stan = await Promise.race([h.czeka.then(() => 'wstrzymane'), new Promise((ok) => { setTimeout(() => ok('bez wpisu'), 5000); })]);
    h.zwolnij();
    expect(r.status, 'applyEncryptedEvent przed wpisem echa').toBe('applied');
    expect(stan, 'kontrola: wpis echa doszedł do wstrzymania').toBe('wstrzymane');
    await o.gotowe();
    expect(wierszeOd(o, s0).map(opis), 'wiersz echa po zwolnieniu').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
  }, CZAS);

  it('po emissionsSettled wiersz echa jest w kolejce; przegląd kolejki (sweepOutbox) go nie dubluje', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    await o.ev.applyEncryptedEvent(s.kB.env);
    await o.ev.emissionsSettled();
    expect(wierszeOd(o, s0).map(opis), 'wiersz echa po emissionsSettled').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
    const s1 = ostatni(o);
    tik(MIN);
    await o.ev.sweepOutbox();
    await o.gotowe();
    expect(wierszeOd(o, s1).map(opis), 'przegląd kolejki bez nowych wierszy').toEqual([]);
  }, CZAS);

  it('odbiorcy odesłanego rekordu — B (bez nowszego składnika) zapisuje rekord i nic nie odsyła; C (późniejsza poprawka) składa nowe złączenie i odsyła je raz; A po złączeniu C nic nie odsyła', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await o.gotowe();
    const B = await blizniak(o, { emisja: true, echo: true });
    const C = await blizniak(o, { emisja: true, echo: true });
    tik(MIN);
    await popraw(B, k.P, v, 17.2);
    await B.gotowe();
    const kB = await kopertaSnap(B, k.P, v);
    tik(MIN);
    await gwiazdka(o, k.P, v);
    tik(MIN);
    await popraw(C, k.P, v, 19.4);
    await C.gotowe();
    await o.gotowe();
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const echoA = wierszeOd(o, s0).filter((w) => w.kind === 'snap');
    expect(echoA.map(opis), 'A: wiersz echa').toEqual([['snap', `${k.P}/${v}`, 'pending']]);
    const sB = ostatni(B);
    expect((await zastosuj(B, echoA[0].env)).status).toBe('applied');
    expect(await stanWersji(B, k.P, v), 'B: zapisany rekord złożony A').toEqual(await stanWersji(o, k.P, v));
    expect(wierszeOd(B, sB).map(opis), 'B: bez echa').toEqual([]);
    const sC = ostatni(C);
    expect((await zastosuj(C, echoA[0].env)).status).toBe('applied');
    const stanC = await stanWersji(C, k.P, v);
    expect([stanC.masa, stanC.gwiazdka], 'C: złączenie (poprawka C z gwiazdką A)').toEqual([19.4, true]);
    const echoC = wierszeOd(C, sC).filter((w) => w.kind === 'snap');
    expect(echoC.map(opis), 'C: jedno echo złączenia').toEqual([['snap', `${k.P}/${v}`, 'pending']]);
    const s1 = ostatni(o);
    expect((await zastosuj(o, echoC[0].env)).status).toBe('applied');
    expect(await stanWersji(o, k.P, v), 'A: złączenie C').toEqual(stanC);
    expect(wierszeOd(o, s1).map(opis), 'A: koniec — bez echa').toEqual([]);
  }, 2 * CZAS);

  it('łączenie wpisów — echo po własnym czekającym wierszu tej wersji zastępuje go; własny wiersz po echu zastępuje echo; echo z wierszem innej encji między nimi — oba zostają', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const klucz = `${s.P}/${s.v}`;
    const tejWersji = () => o.kolejka('A').filter((w) => w.kind === 'snap' && w.entityKey === klucz);
    const przed = tejWersji().map((w) => w.seqLocal);
    expect(przed.length, 'kontrola: czekający wiersz gwiazdki A').toBe(1);
    await zastosuj(o, s.kB.env);
    const poEchu = tejWersji();
    expect([poEchu.length, poEchu[0].seqLocal > przed[0]], '(a) echo zastąpiło czekający wiersz gwiazdki').toEqual([1, true]);
    await popraw(o, s.P, s.v, 18.1);
    await o.gotowe();
    const poWlasnym = tejWersji();
    expect([poWlasnym.length, poWlasnym[0].seqLocal > poEchu[0].seqLocal, (await trescWiersza(o, poWlasnym[0])).masa], '(b) własny wiersz zastąpił echo').toEqual([1, true, 18.1]);
    // (c) B przyjmuje wiersz A (gwiazdka) i ją zdejmuje (później niż gwiazdka A); A poprawia v jeszcze raz (później niż
    // zdjęcie) i zapisuje nową wersję w (wiersz innej encji za czekającym wierszem v); koperta B u A składa treść A
    // bez gwiazdki — echo v z wierszem w między nim a wierszem własnym v.
    expect((await zastosuj(s.B, poWlasnym[0].env)).status, 'kontrola (c): B przyjmuje wiersz A').toBe('applied');
    tik(MIN);
    await gwiazdka(s.B, s.P, s.v, false);
    const kB2 = await kopertaSnap(s.B, s.P, s.v);
    tik(MIN);
    await popraw(o, s.P, s.v, 18.9);
    await o.v.savePatient(naglowek(1, { masa: 26 }), { dedup: false, patientId: s.P });
    tik();
    await o.gotowe();
    await zastosuj(o, kB2.env);
    const stan = await stanWersji(o, s.P, s.v);
    expect([stan.masa, stan.gwiazdka], 'kontrola (c): treść A bez gwiazdki').toEqual([18.9, false]);
    const oba = tejWersji();
    expect(oba.length, '(c) oba wiersze v zostają (wiersz innej encji między nimi)').toBe(2);
  }, CZAS);
});

// ── wyniki zastosowania i ścieżka błędu ────────────────────────────────────────────────────────────────
// Kopia sejfu w teście (tylko tutaj): wstawka na początku Bkz_scalKoniec (faza Kosza, po zapisie wersji w Le), na
// początku Le (przed zapisem) albo na początku Bev_stanEcha (odczyt stanu kandydatów) rzuca raz fikcyjny błąd z polem
// okna __fikcyjnyBlad — jak zajęta blokada karty w fazie Kosza (vildaMergeBusy), konflikt tożsamości wizyty
// (VISIT_IDENTITY_CONFLICT), błąd przed zapisem albo błąd odczytu sklepu wersji.
const KOTWICA_KOSZA = 'async function Bkz_scalKoniec(';
const KOTWICA_LE = 'async function Le(t,e){';
// Kopia z usterką odczytu stanu kandydatów (błąd na początku Bev_stanEcha — cały odczyt „przed” albo „po” zawodzi).
const KOTWICA_STANU = 'async function Bev_stanEcha(';
// E3-PR0d: kopia z usterką na początku wyszukania wersji pod innymi kartami w fazie Kosza (Bkz_obceKarty — w try, po
// błędzie lista Kosza i tak jest zapisana, potem błąd idzie dalej) i na początku odczytu wpisów Kosza kandydatów
// (Bev_stanKosza — odczyt „przed” albo „po” zawodzi). Na sejfie bez odsyłania wpisów kotwicy Bev_stanKosza nie ma —
// kopia rzuca w przypadku (czerwień przypadku, nie pliku).
const KOTWICA_OBCE = 'async function Bkz_obceKarty(';
const KOTWICA_STANU_KOSZA = 'async function Bev_stanKosza(';
// Kopia z usterką rzucającą przy kolejnych wejściach: window.__fikcyjneBledy — lista (null = wejście bez błędu).
function zUsterkaKolejna(kotwica) {
  const ile = ZRODLO_SEJFU.split(kotwica).length - 1;
  if (ile !== 1) throw new Error(`kopia z usterką: kotwica nie dokładnie raz: ${kotwica}`);
  const i = ZRODLO_SEJFU.indexOf(kotwica);
  const j = ZRODLO_SEJFU.indexOf('{', i + kotwica.length - 1) + 1;
  const wstawka = 'if (Array.isArray(window.__fikcyjneBledy) && window.__fikcyjneBledy.length) { const Bx_e = window.__fikcyjneBledy.shift(); if (Bx_e) throw Bx_e; }';
  return ZRODLO_SEJFU.slice(0, j) + wstawka + ZRODLO_SEJFU.slice(j);
}
function zUsterka(kotwica) {
  const ile = ZRODLO_SEJFU.split(kotwica).length - 1;
  if (ile !== 1) throw new Error(`kopia z usterką: kotwica nie dokładnie raz: ${kotwica}`);
  const i = ZRODLO_SEJFU.indexOf(kotwica);
  const j = ZRODLO_SEJFU.indexOf('{', i + kotwica.length - 1) + 1;
  const wstawka = 'if (window.__fikcyjnyBlad) { const Bx_e = window.__fikcyjnyBlad; window.__fikcyjnyBlad = null; throw Bx_e; }';
  return ZRODLO_SEJFU.slice(0, j) + wstawka + ZRODLO_SEJFU.slice(j);
}
const blad = (pola) => Object.assign(new Error('Fikcyjny błąd scalania'), pola);

describe('busy, apply-error, zmiana sesji i błąd odczytu', () => {
  it('busy z fazy Kosza po zapisie wersji (vildaMergeBusy) — status busy jak dziś, echo przy pierwszej próbie; ponowienie (applied) bez duplikatu', async () => {
    const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_KOSZA) });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    o.win.__fikcyjnyBlad = blad({ vildaMergeBusy: true, code: 'PATIENT_LOCK_TIMEOUT' });
    const r = await zastosuj(o, s.kB.env);
    expect([r.status, r.code, o.win.__fikcyjnyBlad], 'kontrola: busy z fazy Kosza').toEqual(['busy', 'PATIENT_LOCK_TIMEOUT', null]);
    expect((await stanWersji(o, s.P, s.v)).masa, 'kontrola: wersja zapisana przed fazą Kosza').toBe(17.2);
    expect(wierszeOd(o, s0).map(opis), 'echo przy pierwszej próbie').toEqual([['snap', `${s.P}/${s.v}`, 'pending']]);
    const s1 = ostatni(o);
    expect((await zastosuj(o, s.kB.env)).status, 'ponowienie').toBe('applied');
    expect(wierszeOd(o, s1).map(opis), 'ponowienie bez duplikatu').toEqual([]);
  }, CZAS);

  it('apply-error z Le po zapisie wersji (VISIT_IDENTITY_CONFLICT z fazy Kosza) — echo zmienionej wersji; błąd przed zapisem (na początku Le) — 0 wierszy; status apply-error jak dziś', async () => {
    for (const [nazwa, kotwica, wiersze] of [['po zapisie wersji', KOTWICA_KOSZA, 1], ['przed zapisem', KOTWICA_LE, 0]]) {
      const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(kotwica) });
      await o.zaloguj('A');
      const s = await rekordZlozony(o);
      const s0 = ostatni(o);
      o.win.__fikcyjnyBlad = blad({ code: nazwa === 'przed zapisem' ? 'CARE_FIKCYJNY' : 'VISIT_IDENTITY_CONFLICT' });
      const r = await zastosuj(o, s.kB.env);
      expect([r.status, r.code], `${nazwa}: kontrola — apply-error`).toEqual(['apply-error', nazwa === 'przed zapisem' ? 'CARE_FIKCYJNY' : 'VISIT_IDENTITY_CONFLICT']);
      expect((await stanWersji(o, s.P, s.v)).masa, `${nazwa}: kontrola — wersja`).toBe(wiersze ? 17.2 : 20);
      expect(wierszeOd(o, s0).map(opis), `${nazwa}: wiersze echa`).toEqual(wiersze ? [['snap', `${s.P}/${s.v}`, 'pending']] : []);
    }
  }, 2 * CZAS);

  it('zmiana sesji w trakcie Le (blokada sejfu albo ponowne odblokowanie A przy szyfrowaniu rekordu złożonego) i zablokowany sejf przed zastosowaniem — wynik jak dziś (locked, przy ponownym odblokowaniu session-changed), bez emisji odsyłania, 0 wierszy (także w nowej sesji)', async () => {
    for (const [nazwa, oczek] of [['blokada w trakcie Le', 'locked'], ['ponowne odblokowanie A w trakcie Le', 'session-changed'], ['sejf zablokowany', 'locked']]) {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await rekordZlozony(o);
      const s0 = ostatni(o);
      const e0 = o.l.emisje.length;
      let r;
      if (nazwa === 'sejf zablokowany') {
        o.zablokuj();
        r = await o.ev.applyEncryptedEvent(s.kB.env);
      } else {
        const h = o.krypto.wstrzymaj({ metoda: 'encrypt', wStosie: 'Bgw_scal' });
        const p = o.ev.applyEncryptedEvent(s.kB.env);
        await h.osiagnieta;
        if (nazwa.startsWith('blokada')) o.zablokuj();
        else await o.przelaczWTle('A').koniec;
        h.zwolnij();
        r = await p;
      }
      await o.cisza();
      expect(r, `${nazwa}: wynik`).toEqual({ status: oczek });
      expect(emisjeSnap(o, e0), `${nazwa}: emisje odsyłania`).toEqual([]);
      if (oczek === 'locked') await o.zaloguj('A');
      await o.gotowe();
      expect(wierszeOd(o, s0).map(opis), `${nazwa}: wiersze echa`).toEqual([]);
    }
  }, 3 * CZAS);

  it('zmiana sesji w trakcie odczytu stanu „przed” (blokada sejfu albo blokada i ponowne odblokowanie A przy odczycie wersji kandydata) — wynik locked albo session-changed, Le nie rusza ani w starej, ani w nowej sesji (0 transakcji zapisu sklepu wersji, v bez rekordu złożonego), 0 wierszy', async () => {
    for (const [nazwa, oczek] of [['blokada', 'locked'], ['ponowne odblokowanie A', 'session-changed']]) {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await rekordZlozony(o);
      const s0 = ostatni(o);
      const h = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep: 'snapshots', metoda: 'get' });
      const p = o.ev.applyEncryptedEvent(s.kB.env);
      const stan = await Promise.race([h.czeka.then(() => 'wstrzymane'), p.then(() => 'koniec')]);
      expect(stan, `${nazwa}: odczyt wersji kandydata przed Le (stan „przed”)`).toBe('wstrzymane');
      const z = o.znacznik();
      let prz = null;
      if (nazwa === 'blokada') o.zablokuj();
      else {
        prz = o.przelaczWTle('A');
        await prz.sesja;
      }
      h.zwolnij();
      const r = await p;
      if (prz) await prz.koniec;
      await o.cisza();
      expect(r, `${nazwa}: wynik`).toEqual({ status: oczek });
      expect(zapisyWersji(o, z), `${nazwa}: Le nie rusza — bez transakcji zapisu sklepu wersji`).toEqual([]);
      if (oczek === 'locked') await o.zaloguj('A');
      expect((await stanWersji(o, s.P, s.v)).masa, `${nazwa}: v bez rekordu złożonego`).toBe(20);
      await o.gotowe();
      expect(wierszeOd(o, s0).map(opis), `${nazwa}: wiersze echa`).toEqual([]);
    }
  }, 2 * CZAS);

  it('blokada sejfu przy odczycie stanu „przed” pierwszego z trzech kandydatów (pełna karta) — locked, bez dalszych odczytów sklepu wersji', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21, 22]);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, k.P, k.w[0], 17.2);
    const porcje = await B.ev.buildPatientFullEvents(k.P, null);
    expect(porcje.length, 'kontrola: jedna porcja pełnej karty').toBe(1);
    const kB = await koperta(B, porcje[0]);
    const h = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep: 'snapshots', metoda: 'get' });
    const p = o.ev.applyEncryptedEvent(kB.env);
    const stan = await Promise.race([h.czeka.then(() => 'wstrzymane'), p.then(() => 'koniec')]);
    expect(stan, 'kontrola: odczyt pierwszego kandydata wstrzymany').toBe('wstrzymane');
    o.zablokuj();
    const z = o.znacznik();
    h.zwolnij();
    expect(await p).toEqual({ status: 'locked' });
    await o.cisza();
    expect(txWersji(o, z), 'odczyty sklepu wersji po blokadzie').toBe(0);
    await o.zaloguj('A');
  }, CZAS);

  it('zmiana sesji w trakcie odczytu stanu „po” (blokada sejfu przy odszyfrowaniu wersji po scaleniu) — wynik applied jak dziś (Le skończony), bez emisji odsyłania, 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const h = o.krypto.wstrzymaj({ metoda: 'decrypt', wStosie: 'Bev_wersjaEcha' });
    const p = o.ev.applyEncryptedEvent(s.kB.env);
    const stan = await Promise.race([h.osiagnieta.then(() => 'wstrzymane'), p.then(() => 'koniec')]);
    if (MA_ECHO) expect(stan, 'kontrola: odszyfrowanie wersji po scaleniu (stan „po”)').toBe('wstrzymane');
    o.zablokuj();
    h.zwolnij();
    const r = await p;
    await o.cisza();
    expect(r.status, 'wynik').toBe('applied');
    expect(emisjeSnap(o, e0), 'bez emisji odsyłania').toEqual([]);
    await o.zaloguj('A');
    await o.gotowe();
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('błędy odczytu treści osobno dla każdego kandydata (pełna karta: v z rekordem złożonym, w przyjęta z ładunku bez zmian, x tylko w Koszu A, y bez zmian) — bez błędu: v; nieczytelna treść „przed” v albo w: v (porównanie z ładunkiem); nieczytelna treść „po” w: v i w; x i y bez odszyfrowania i bez wiersza', async () => {
    // Odszyfrowania w porównaniu w kolejności ładunku: 1 — „po” v, 2 — „przed” v, 3 — „po” w, 4 — „przed” w.
    for (const [nazwa, ktory, oczek] of [['bez błędu', 0, ['v']], ['„przed” v', 2, ['v']], ['„po” w', 3, ['v', 'w']], ['„przed” w', 4, ['v']]]) {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await pelnaKarta(o);
      const s0 = ostatni(o);
      const n = odszWersji(o);
      if (ktory) o.krypto.blad({ metoda: 'decrypt', wStosie: 'Bev_wersjaEcha', ktory }, { kod: 'OperationError' });
      expect((await zastosuj(o, s.kB.env)).status, `${nazwa}: wynik`).toBe('applied');
      expect(await stanKarty(o, s), `${nazwa}: kontrola — stan karty po scaleniu`).toEqual(STAN_KARTY);
      if (!ktory) expect(n.ile, 'kontrola: odszyfrowania w porównaniu (po i przed v, po i przed w)').toBe(4);
      expect(nazwyWersji(s, wierszeOd(o, s0)), `${nazwa}: wiersze echa`).toEqual(oczek);
    }
  }, 4 * CZAS);

  it('cały odczyt stanu „przed” zawodzi (błąd odczytu sklepu wersji) — scalanie jak dziś, porównanie tylko z ładunkiem: v; cały odczyt stanu „po” zawodzi — ścieżka błędu: v, w i y z kartą z odczytu „przed”, x (tylko w Koszu) bez wiersza', async () => {
    for (const [nazwa, oczek] of [['przed', ['v']], ['po', ['v', 'w', 'y']]]) {
      const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_STANU) });
      await o.zaloguj('A');
      const s = await pelnaKarta(o);
      const s0 = ostatni(o);
      const bladOdczytu = blad({ name: 'UnknownError' });
      if (nazwa === 'przed') o.win.__fikcyjnyBlad = bladOdczytu;
      else o.krypto.po({ metoda: 'encrypt', wStosie: 'Bgw_scal' }, () => { o.win.__fikcyjnyBlad = bladOdczytu; });
      expect((await zastosuj(o, s.kB.env)).status, `${nazwa}: wynik`).toBe('applied');
      expect(o.win.__fikcyjnyBlad, `${nazwa}: kontrola — błąd odczytu stanu użyty`).toBe(null);
      expect(await stanKarty(o, s), `${nazwa}: kontrola — stan karty po scaleniu`).toEqual(STAN_KARTY);
      expect(nazwyWersji(s, wierszeOd(o, s0)), `${nazwa}: wiersze echa`).toEqual(oczek);
    }
  }, 2 * CZAS);

  it('usuwanie konta w tym dokumencie w trakcie odczytu stanu „po” (odczyt odmawia: SYNC_DB_DELETED) — applied (scalanie skończone), bez emisji odsyłania, 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_STANU) });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    o.krypto.po({ metoda: 'encrypt', wStosie: 'Bgw_scal' }, () => { o.win.__fikcyjnyBlad = blad({ code: 'SYNC_DB_DELETED' }); });
    expect((await zastosuj(o, s.kB.env)).status, 'wynik').toBe('applied');
    expect(o.win.__fikcyjnyBlad, 'kontrola: odmowa odczytu „po” użyta').toBe(null);
    expect((await stanWersji(o, s.P, s.v)).masa, 'kontrola: rekord złożony zapisany').toBe(17.2);
    expect(emisjeSnap(o, e0), 'bez emisji odsyłania').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);

  it('removeUser tego konta w toku (konto oznaczone, sejf jeszcze odblokowany) w chwili wznowienia odczytu stanu „przed” — session-changed, scalanie nie rusza, bez emisji odsyłania; potem konto usunięte', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const e0 = o.l.emisje.length;
    const h = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep: 'snapshots', metoda: 'get' });
    const p = o.ev.applyEncryptedEvent(s.kB.env);
    expect(await Promise.race([h.czeka.then(() => 'wstrzymane'), p.then(() => 'koniec')]), 'kontrola: odczyt stanu „przed” wstrzymany').toBe('wstrzymane');
    // removeUser oznacza konto przed pierwszym oczekiwaniem; wstrzymane na wyprowadzeniu powiązania lokalnego (przed blokadą sejfu).
    const k = o.krypto.wstrzymaj((_metoda, _argumenty, stos) => String(stos).includes('deriveLocalBinding'));
    const z = o.znacznik();
    const usuwanie = o.v.removeUser(o.A.userId, o.A.haslo).then(() => 'usunięte', (x) => `błąd ${x && x.code}`);
    await k.osiagnieta;
    expect(o.v.isUnlocked(), 'kontrola: sejf odblokowany w chwili wznowienia odczytu').toBe(true);
    h.zwolnij();
    const r = await p;
    k.zwolnij();
    expect(await usuwanie, 'removeUser').toBe('usunięte');
    await o.cisza();
    expect(r, 'wynik').toEqual({ status: 'session-changed' });
    expect(zapisyWersji(o, z), 'scalanie nie rusza — bez transakcji zapisu sklepu wersji').toEqual([]);
    expect(emisjeSnap(o, e0), 'bez emisji odsyłania').toEqual([]);
  }, CZAS);

  it('strażnik tożsamości chronionego sejfu niedostępny od chwili po odszyfrowaniu koperty (odczyt stanu „przed” odmawia) — busy z kodem PATIENT_AUTHORITY_UNAVAILABLE jak dziś, scalanie nie rusza, bez emisji odsyłania, 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const z = o.znacznik();
    o.krypto.po({ metoda: 'decrypt' }, () => { o.v.inspectPatientAuthority().catch(() => {}); });
    const r = await o.ev.applyEncryptedEvent(s.kB.env);
    await o.gotowe();
    expect(r, 'wynik').toEqual({ status: 'busy', code: 'PATIENT_AUTHORITY_UNAVAILABLE' });
    expect(zapisyWersji(o, z), 'bez transakcji zapisu sklepu wersji').toEqual([]);
    expect(emisjeSnap(o, e0), 'bez emisji odsyłania').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze echa').toEqual([]);
  }, CZAS);
});

// ── drogi bez echa ───────────────────────────────────────────────────────────────────────────────
describe('przeniesienie, pełna kopia, delta, tryb i bramka — bez echa', () => {
  it('wersja przeniesiona w tym scaleniu pod inną kartę (koperta ptomb P z kartą docelową G po „Scal pacjentów” na B; A dało v gwiazdkę) — 0 wierszy snap', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const kp = await karta(o, 1, [20]);
    const kg = await karta(o, 2, [30]);
    const v = kp.w[0];
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await gwiazdka(o, kp.P, v);
    await o.gotowe();
    tik(MIN);
    await B.v.mergePatients(kp.P, kg.P);
    tik();
    const kB = await koperta(B, await B.ev.buildPatientTombstoneEvent(kp.P, null));
    expect((kB.k.patients || []).some((p) => p.patientId === kg.P && p.snapshots.some((q) => q.snapshotId === v)), 'kontrola: koperta ptomb z kartą docelową G i wersją v').toBe(true);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect(!!(await wersja(o, kg.P, v)), 'kontrola: v przeniesiona pod G').toBe(true);
    expect(wierszeOd(o, s0).filter((w) => w.kind === 'snap').map(opis), 'wiersze snap').toEqual([]);
  }, CZAS);

  for (const droga of ['pełna kopia (mergeSyncPayload)', 'delta (applyEncryptedDelta)', 'stara delta przez applyEncryptedEvent']) {
    it(`rekord złożony po drodze „${droga}” — 0 wierszy`, async () => {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await rekordZlozony(o);
      const s0 = ostatni(o);
      if (droga.startsWith('pełna')) await o.v.mergeSyncPayload(await s.B.v.exportSyncPayload());
      else {
        const d = await s.B.v.buildPatientDelta(s.P);
        if (droga.startsWith('delta')) expect(await o.v.applyEncryptedDelta(d), 'kontrola: delta zastosowana').toBeTruthy();
        else expect((await o.ev.applyEncryptedEvent({ iv: d.iv, data: d.data })).status, 'kontrola: stara delta zastosowana').toBe('applied');
      }
      tik();
      await o.gotowe();
      const stan = await stanWersji(o, s.P, s.v);
      expect([stan.masa, stan.gwiazdka], 'kontrola: rekord złożony').toEqual([17.2, true]);
      expect(wierszeOd(o, s0).filter((w) => w.kind === 'snap').map(opis), 'wiersze snap').toEqual([]);
    }, CZAS);
  }

  it('zamknięta bramka dziennika przy włączonym przełączniku — 0 wierszy, zapis przebiegu atrapy jak w sejfie bez odsyłania (bez odczytów stanu kandydatów); jeden odczyt bramki w części odsyłania', async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const t = zegar;
    const w = {};
    for (const [nazwa, zrodlo, echo] of [['sejf', ZRODLO_SEJFU, true], ['bez odsyłania', bezOdsylania().zrodlo, undefined]]) {
      ustawZegar(t);
      const X = await klonA(o, zrodlo, echo);
      X.bramka.wartosc = false;
      const z0 = X.l.zastosowania.length;
      w[nazwa] = { ...(await przebieg(X, [s.kB.env])), zastosowania: X.l.zastosowania.length - z0 };
    }
    expect(w.sejf.wyniki, 'wynik').toEqual(w['bez odsyłania'].wyniki);
    expect(w.sejf.log, 'zapis przebiegu atrapy').toEqual(w['bez odsyłania'].log);
    expect(w.sejf.wiersze, 'wiersze kolejki').toEqual([]);
    expect({ sejf: w.sejf.zastosowania, bez: w['bez odsyłania'].zastosowania }, 'odczyty bramki w Bem_zastosujEcho').toEqual({ sejf: 1, bez: 0 });
    expect({ sejf: w.sejf.bramka, bez: w['bez odsyłania'].bramka }, 'odczyty pola bramki: jeden ponad sejf bez odsyłania').toEqual({ sejf: w['bez odsyłania'].bramka + 1, bez: w['bez odsyłania'].bramka });
  }, 2 * CZAS);

  it('„Komputer w pracy” przy otwartej bramce i włączonym przełączniku — rekord złożony bez wiersza, bez bazy kolejki, bez porównania stanu kandydatów', async () => {
    const o = await okno({ bramka: true, echo: true, chmura: ['A'] });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20]);
    const v = k.w[0];
    await o.gotowe();
    const { drugieOkno } = await import('../support/okno-magazynu.mjs');
    const B = await drugieOkno(o, { bramka: false, zaloguj: 'A' });
    OKNA.push(B);
    await B.v.mergeSyncPayload(await o.v.exportSyncPayload());
    tik(MIN);
    await popraw(B, k.P, v, 17.2);
    const kB = await kopertaSnap(B, k.P, v);
    tik(MIN);
    await gwiazdka(o, k.P, v);
    await o.gotowe();
    const n = odszWersji(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const stan = await stanWersji(o, k.P, v);
    expect([stan.masa, stan.gwiazdka], 'kontrola: rekord złożony').toEqual([17.2, true]);
    expect(o.jestBaza('A'), 'bez bazy kolejki').toBe(false);
    expect(n.ile, 'bez odczytu i porównania stanu kandydatów (odszyfrowania w porównaniu)').toBe(0);
    if (MA_ECHO) expect(o.l.zastosowania.length, 'odczyt bramki w Bem_zastosujEcho (potem odmowa trybu)').toBe(1);
  }, CZAS);
});

// ── wartownik treści i samokontrola kopii bez odsyłania ─────────────────────────────────────────────────────────────
describe('wartownik treści przy włączonym przełączniku; samokontrola kopii sejfu bez odsyłania', () => {
  it('fikcyjny napis z nazwiska nie wychodzi poza szyfrogram: wyniki applyEncryptedEvent (także ścieżka błędu porównania), emisja odsyłania z samymi identyfikatorami wersji, console, localStorage i sessionStorage', async () => {
    const W = 'Wartownik-Testowy-QX7';
    const WZ = W.slice(0, 9);
    const util = await import('node:util');
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const szpiedzy = [console, o.win.console].flatMap((c) => ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(c, m)));
    const r0 = await o.v.savePatient({ name: 'Testowy ' + W, user: { lastName: W, firstName: 'Jan', sex: 'M', height: 120, weight: 20 } }, { dedup: false });
    tik();
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, r0.patientId, r0.snapshotId, 17.2);
    const kB = await kopertaSnap(B, r0.patientId, r0.snapshotId);
    expect(JSON.stringify(kB.k), 'kontrola: napis w treści koperty').toContain(W);
    tik(MIN);
    await gwiazdka(o, r0.patientId, r0.snapshotId);
    await o.gotowe();
    const e0 = o.l.emisje.length;
    const wyniki = [await zastosuj(o, kB.env)];
    tik(MIN);
    await popraw(B, r0.patientId, r0.snapshotId, 16.4);
    await gwiazdka(o, r0.patientId, r0.snapshotId, false);
    await o.gotowe();
    o.krypto.blad({ metoda: 'decrypt', wStosie: 'Bev_wersjaEcha' }, { kod: 'OperationError' });
    wyniki.push(await zastosuj(o, (await kopertaSnap(B, r0.patientId, r0.snapshotId)).env));
    expect(wyniki.map((x) => x.status), 'kontrola: zastosowane').toEqual(['applied', 'applied']);
    expect(JSON.stringify(wyniki)).not.toContain(WZ);
    // emisje odsyłania: snap z sesją scalania (zapisy lekarza na A emitują bez podanej sesji)
    const odsylanie = o.l.emisje.slice(e0).filter((x) => x.kind === 'snap' && x.sesja);
    expect(odsylanie.length, 'emisje odsyłania (zwykła ścieżka i ścieżka błędu)').toBe(2);
    for (const x of odsylanie) {
      for (const k of Array.isArray(x.klucze) ? x.klucze : [x.klucze]) expect(Object.keys(k).sort(), 'klucz emisji odsyłania').toEqual(['patientId', 'snapshotId']);
      expect(JSON.stringify(x)).not.toContain(WZ);
    }
    for (const s of szpiedzy) for (const wywolanie of s.mock.calls) expect(util.inspect(wywolanie, { depth: 8, showHidden: true })).not.toContain(WZ);
    expect(JSON.stringify(o.lokalny.m)).not.toContain(WZ);
    const ss = o.win.sessionStorage;
    const sesyjne = typeof ss.klucze === 'function' ? ss.klucze().map((k) => ss.getItem(k)) : [];
    expect(JSON.stringify(sesyjne)).not.toContain(WZ);
  }, CZAS);

  it('bezOdsylania: kotwica w literale Bev_EKSPORT dokładnie raz → zamiana; sejf sprzed odsyłania (applyEncryptedEvent: Bev_zastosuj) → kopia = źródło; kotwica dwa razy, poza literałem albo bez applyEncryptedEvent → wyjątek', () => {
    const LIT = (srodek) => `const Bev_EKSPORT = Object.freeze({\n  kinds: 1,\n${srodek}});\nfunction Bem_zastosuj(env) { return env; }\n`;
    const z = bezOdsylania(LIT('  applyEncryptedEvent: Bem_zastosuj,\n'));
    expect([z.jest, z.zrodlo.includes('applyEncryptedEvent: Bev_zastosuj,'), z.zrodlo.includes('applyEncryptedEvent: Bem_zastosuj,')]).toEqual([true, true, false]);
    const przed = LIT('  applyEncryptedEvent: Bev_zastosuj,\n');
    expect(bezOdsylania(przed)).toEqual({ zrodlo: przed, jest: false });
    expect(() => bezOdsylania(LIT('  applyEncryptedEvent: Bem_zastosuj,\n  applyEncryptedEvent: Bem_zastosuj,\n')), 'dwa razy').toThrow(/nie dokładnie raz/);
    expect(() => bezOdsylania(`${LIT('  kinds2: 2,\n')}const X = { applyEncryptedEvent: Bem_zastosuj, };\n`), 'poza literałem').toThrow(/poza literałem/);
    expect(() => bezOdsylania(LIT('  kinds2: 2,\n')), 'bez applyEncryptedEvent').toThrow(/brak applyEncryptedEvent/);
    expect(bezOdsylania().jest, 'sejf z repozytorium: kopia różni się dokładnie wtedy, gdy sejf ma odsyłanie').toBe(MA_ECHO);
  });
});

// ══ Odsyłanie wpisów Kosza (E3-PR0d, P-ZBIEZNOSC-ZDARZEN) ═══════════════════════════════════════════════════════════
// Scenariusz podstawowy: A — karta P z wersjami v (20 kg) i w (21 kg) (Kosz nie przyjmuje ostatniej wersji karty);
// bliźniak B (koperty z builderów, bez bramki). Wiersze odsyłania wpisów — stomb od znacznika; emisje odsyłania — wywołania
// Bem_zmiana rodzaju stomb z sesją scalania (własny Kosz emituje bez podanej sesji). Treść wiersza stomb: wpisy koperty
// (karta, masa, gwiazdka rejestru, z treścią albo bez).
const doKosza = async (o, P, sid) => { await o.v.moveSnapshotToTrash(P, sid, { odepnij: true }); tik(); };
const wierszeKosza = (o, od) => wierszeOd(o, od).filter((w) => w.kind === 'stomb');
const emisjeKosza = (o, e0) => o.l.emisje.slice(e0).filter((x) => x.kind === 'stomb' && x.sesja);
// Wpisy Kosza wersji sid w eksporcie (kształt wysyłkowy, bez seq).
const wpisyEksportu = async (o, sid) => ((await o.v.exportSyncPayload()).snapshotTombstones || []).filter((e) => e.snapshotId === sid).map(({ seq: _s, ...e }) => e);
const faktWpisu = (e) => ({ masa: e.payload ? e.payload.user.weight : null, gwiazdka: !!(e.gwiazdka && e.gwiazdka.pin), tresc: !!e.payload });
async function trescWierszaKosza(o, w) {
  const k = await odszyfruj(o, w.env);
  return { kind: k.event.kind, key: k.event.key, wpisy: (k.snapshotTombstones || []).map((e) => ({ karta: e.patientId, ...faktWpisu(e) })) };
}
// Odszyfrowania w porównaniu wpisów (Bev_echoKosza) w oknie o od chwili wywołania.
function odszKosza(o) {
  const n = { ile: 0 };
  o.krypto.obserwuj((metoda, _argumenty, stos) => { if (metoda === 'decrypt' && String(stos).includes('Bev_echoKosza')) n.ile += 1; });
  return n;
}
// Transakcje atrapy na sklepie metadanych bazy sejfu od znacznika (odczyty listy Kosza).
const txMeta = (o, z) => o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'tx' && w[1] === bazaSejfu(o) && String(w[2]).includes('meta') && w[4] === 'start').length;
// Okno na niezależnej kopii baz atrapy okna X (to samo konto), bez emisji — do dowodu widoku i „Przywróć”.
async function klonOkna(o, X) {
  const K = await oknoMagazynu({
    idb: X.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU, emisja: true,
  });
  OKNA.push(K);
  return K;
}
// Widok wpisu sid w oknie Kosza (listTrashedSnapshots: gwiazdka widoku, treść bez postaci gwiazdki, karta) i wynik
// „Przywróć” (masa i gwiazdka wersji po przywróceniu) na klonach obu okien.
async function widokKoszaObu(o, X, Y, P, sid) {
  const wiersz = async (U) => {
    const e = (await U.v.listTrashedSnapshots()).find((x) => x.snapshotId === sid);
    if (!e) return null;
    const { _pinned: _p, _pinnedState: _s, ...tresc } = e.payload || {};
    return JSON.stringify({ pinned: e.pinned, patientExists: e.patientExists, deletedAtISO: e.deletedAtISO, tresc });
  };
  const wynik = {};
  for (const [nazwa, U] of [['X', X], ['Y', Y]]) {
    const K = await klonOkna(o, U);
    const w = await wiersz(K);
    let przywroc = null;
    if (w) {
      await K.v.restoreTrashedSnapshot(P, sid);
      await K.cisza();
      przywroc = await stanWersji(K, P, sid);
      if (przywroc) delete przywroc.rev;
    }
    wynik[nazwa] = { wiersz: w, przywroc };
  }
  return wynik;
}
// Ten sam scenariusz bazowy: A — karta P [v 20 kg, w 21 kg], bliźniak B po bazie.
async function bazaKosza(o) {
  const k = await karta(o, 1, [20, 21]);
  await o.gotowe();
  const B = await blizniak(o);
  return { P: k.P, v: k.w[0], w: k.w[1], B };
}
// Gwiazdka spoza ładunku: B daje v gwiazdkę (koperta snap B), A — później, bez wiedzy o gwiazdce — daje v do Kosza.
async function gwiazdkaSpoza(o) {
  const s = await bazaKosza(o);
  tik(MIN);
  await gwiazdka(s.B, s.P, s.v);
  const kB = await kopertaSnap(s.B, s.P, s.v);
  tik(MIN);
  await doKosza(o, s.P, s.v);
  await o.gotowe();
  return { ...s, kB };
}

describe('odsyłanie wpisów Kosza: wpis, który scalanie zapisało inaczej, niż był i niż przyszedł', () => {
  it('gwiazdka spoza ładunku — v w Koszu A (Kosz później), koperta snap B z gwiazdką sprzed Kosza: jeden wiersz stomb v (wpis z treścią 20 kg i gwiazdką), bez wiersza snap', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const s0 = ostatni(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    expect([await wersja(o, s.P, s.v), (await wpisyEksportu(o, s.v)).map(faktWpisu)], 'kontrola: v zostaje w Koszu A, wpis z gwiazdką z ładunku').toEqual([null, [{ masa: 20, gwiazdka: true, tresc: true }]]);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze odsyłania').toEqual([['stomb', s.v, 'pending']]);
    expect(await trescWierszaKosza(o, nowe[0]), 'treść wiersza stomb').toEqual({ kind: 'stomb', key: s.v, wpisy: [{ karta: s.P, masa: 20, gwiazdka: true, tresc: true }] });
  }, CZAS);

  it('gwiazdka w ładunku — wpis Kosza z innego urządzenia bez gwiazdki, tutejsza gwiazdka sprzed Kosza: jeden wiersz stomb v z gwiazdką', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await gwiazdka(o, s.P, s.v);
    await o.gotowe();
    tik(MIN);
    await doKosza(s.B, s.P, s.v);
    const kB = await koperta(s.B, await s.B.ev.buildSnapshotTombstoneEvent(s.v, null));
    expect(kB.k.snapshotTombstones.map(faktWpisu), 'kontrola: wpis B bez gwiazdki').toEqual([{ masa: 20, gwiazdka: false, tresc: true }]);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect(await wersja(o, s.P, s.v), 'kontrola: v w Koszu A').toBe(null);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze odsyłania').toEqual([['stomb', s.v, 'pending']]);
    expect(await trescWierszaKosza(o, nowe[0]), 'treść wiersza stomb').toEqual({ kind: 'stomb', key: s.v, wpisy: [{ karta: s.P, masa: 20, gwiazdka: true, tresc: true }] });
  }, CZAS);

  it('poprawka spoza ładunku — koperta snap B z późniejszą treścią (40 kg) sprzed Kosza A: jeden wiersz stomb v z wpisem 40 kg', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await popraw(s.B, s.P, s.v, 40);
    const kB = await kopertaSnap(s.B, s.P, s.v);
    tik(MIN);
    await doKosza(o, s.P, s.v);
    await o.gotowe();
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect((await wpisyEksportu(o, s.v)).map(faktWpisu), 'kontrola: wpis Kosza A z poprawką B').toEqual([{ masa: 40, gwiazdka: false, tresc: true }]);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze odsyłania').toEqual([['stomb', s.v, 'pending']]);
    expect(await trescWierszaKosza(o, nowe[0]), 'treść wiersza stomb').toEqual({ kind: 'stomb', key: s.v, wpisy: [{ karta: s.P, masa: 40, gwiazdka: false, tresc: true }] });
  }, CZAS);

  it('poprawka w ładunku — wpis Kosza B (20 kg), tutejsza poprawka sprzed Kosza (40 kg): jeden wiersz stomb v z poprawioną masą', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await popraw(o, s.P, s.v, 40);
    await o.gotowe();
    tik(MIN);
    await doKosza(s.B, s.P, s.v);
    const kB = await koperta(s.B, await s.B.ev.buildSnapshotTombstoneEvent(s.v, null));
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze odsyłania').toEqual([['stomb', s.v, 'pending']]);
    expect(await trescWierszaKosza(o, nowe[0]), 'treść wiersza stomb').toEqual({ kind: 'stomb', key: s.v, wpisy: [{ karta: s.P, masa: 40, gwiazdka: false, tresc: true }] });
  }, CZAS);
});

// Surowe elementy listy Kosza wersji sid w metadanych konta (atrapa IndexedDB, bez odszyfrowania).
const surowyKosz = (o, sid) => {
  const m = o.idb.__atrapa.bazy()[bazaSejfu(o)].sklepy.meta.wiersze.find((r) => r && Array.isArray(r.snapshotTombstones)) || { snapshotTombstones: [] };
  return JSON.stringify(m.snapshotTombstones.filter((e) => e.snapshotId === sid));
};
// Stan po scaleniu koperty z gwiazdką spoza ładunku: wpis v w Koszu A z gwiazdką z ładunku.
async function wpisZGwiazdka(o) {
  const s = await gwiazdkaSpoza(o);
  expect((await zastosuj(o, s.kB.env)).status, 'kontrola: wpis z gwiazdką').toBe('applied');
  tik(MIN);
  await o.gotowe();
  return s;
}
// Koperta stomb wpisu sid okna X z jawną zmianą elementów (zmien(e) — kopia elementu), jak od innej wersji aplikacji.
async function kopertaKoszaZ(X, sid, zmien) {
  const k = JSON.parse(JSON.stringify(await X.ev.buildSnapshotTombstoneEvent(sid, null)));
  k.snapshotTombstones = k.snapshotTombstones.map((e) => zmien(JSON.parse(JSON.stringify(e))));
  return zTresci(X, k);
}
const pozniej = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

describe('odsyłanie wpisów Kosza: bez odsyłania — opis wpisu, postać gwiazdki, tożsamość wizyty, powtórka, stan równy', () => {
  it('sam opis wpisu inny (wyższy rev i inne seq — koperta spoza buildera; scalanie zapisuje rev) — 0 wierszy i 0 emisji stomb; widok Kosza i „Przywróć” takie same na urządzeniu po scaleniu i bez niego', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    await wpisZGwiazdka(o);
    const s = { P: (await o.v.listTrashedSnapshots())[0].patientId, v: (await o.v.listTrashedSnapshots())[0].snapshotId };
    const Y = await klonOkna(o, o);
    const przed = surowyKosz(o, s.v);
    const k = await kopertaKoszaZ(o, s.v, (e) => ({ ...e, rev: (e.rev || 0) + 3, seq: 917 }));
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    expect((await zastosuj(o, k.env)).status).toBe('applied');
    expect(surowyKosz(o, s.v) !== przed, 'kontrola: scalanie zapisało opis wpisu').toBe(true);
    expect(wierszeKosza(o, s0).map(opis), 'wiersze stomb').toEqual([]);
    expect(emisjeKosza(o, e0), 'emisje odsyłania wpisów').toEqual([]);
    const w = await widokKoszaObu(o, o, Y, s.P, s.v);
    expect(w.X.wiersz, 'kontrola: wiersz okna Kosza').toBeTruthy();
    expect(w.X, 'widok Kosza i „Przywróć”: urządzenie po scaleniu = urządzenie bez scalenia').toEqual(w.Y);
  }, CZAS);

  it('sama postać gwiazdki w treści wpisu (R4n: koperta z treścią bez _pinned i z wcześniejszym, odpiętym _pinnedState; rejestr gwiazdki ten sam) — 0 wierszy; widok Kosza i „Przywróć” takie same', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    await wpisZGwiazdka(o);
    const [e0w] = await o.v.listTrashedSnapshots();
    const s = { P: e0w.patientId, v: e0w.snapshotId };
    const Y = await klonOkna(o, o);
    const przed = surowyKosz(o, s.v);
    const k = await kopertaKoszaZ(o, s.v, (e) => {
      const p = { ...e.payload, _pinnedState: { pin: false, at: pozniej(e.savedAtISO, 30_000) } };
      delete p._pinned;
      return { ...e, payload: p };
    });
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    expect((await zastosuj(o, k.env)).status).toBe('applied');
    const [po] = await wpisyEksportu(o, s.v);
    expect([surowyKosz(o, s.v) !== przed, !!po.payload._pinned, !!(po.gwiazdka && po.gwiazdka.pin)], 'kontrola: scalanie zapisało inną postać gwiazdki w treści, rejestr wpisu bez zmian').toEqual([true, false, true]);
    expect(wierszeKosza(o, s0).map(opis), 'wiersze stomb').toEqual([]);
    expect(emisjeKosza(o, e0), 'emisje odsyłania wpisów').toEqual([]);
    const w = await widokKoszaObu(o, o, Y, s.P, s.v);
    expect(w.X, 'widok Kosza i „Przywróć”').toEqual(w.Y);
  }, CZAS);

  it('koperta starszej aplikacji (wpis bez pola gwiazdka, treść bez rejestru i bez _pinned, późniejsza chwila zmiany wpisu, wyższy rev) przy równym rejestrze gwiazdki — 0 wierszy; zapisany widok Kosza i „Przywróć” obu urządzeń taki sam (gwiazdka widoczna na obu)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    await wpisZGwiazdka(o);
    const [e0w] = await o.v.listTrashedSnapshots();
    const s = { P: e0w.patientId, v: e0w.snapshotId };
    const Y = await klonOkna(o, o);
    const k = await kopertaKoszaZ(o, s.v, (e) => {
      const p = { ...e.payload };
      delete p._pinned; delete p._pinnedState;
      const x = { ...e, payload: p, rev: (e.rev || 0) + 2, updatedAtISO: pozniej(e.deletedAtISO, -10_000) };
      delete x.gwiazdka;
      return x;
    });
    expect(k.k.snapshotTombstones.map((e) => [e.gwiazdka, e.payload._pinned, e.payload._pinnedState, e.updatedAtISO > e0w.deletedAtISO]), 'kontrola: koperta starszej aplikacji').toEqual([[undefined, undefined, undefined, false]]);
    const s0 = ostatni(o);
    expect((await zastosuj(o, k.env)).status).toBe('applied');
    const [po] = await wpisyEksportu(o, s.v);
    expect([!!(po.gwiazdka && po.gwiazdka.pin), po.payload._pinnedState === undefined], 'kontrola: rejestr wpisu bez zmian, treść bez rejestru').toEqual([true, true]);
    expect(wierszeKosza(o, s0).map(opis), 'wiersze stomb').toEqual([]);
    const w = await widokKoszaObu(o, o, Y, s.P, s.v);
    expect(JSON.parse(w.X.wiersz).pinned, 'gwiazdka w oknie Kosza po scaleniu').toBe(true);
    expect(w.X, 'widok Kosza i „Przywróć”: urządzenie po scaleniu = urządzenie bez scalenia').toEqual(w.Y);
  }, CZAS);

  it('koperta stomb bez visitIdentity i payload.visit (jak od starszej aplikacji) — scalanie dopisuje oba: 0 wierszy (reguła pola)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await doKosza(s.B, s.P, s.v);
    const k = await kopertaKoszaZ(s.B, s.v, (e) => { const p = { ...e.payload }; delete p.visit; const x = { ...e, payload: p }; delete x.visitIdentity; return x; });
    expect(k.k.snapshotTombstones.map((e) => [!!e.visitIdentity, !!e.payload.visit]), 'kontrola: koperta bez tożsamości wizyty').toEqual([[false, false]]);
    const s0 = ostatni(o);
    expect((await zastosuj(o, k.env)).status).toBe('applied');
    expect((await wpisyEksportu(o, s.v)).map((e) => [!!e.visitIdentity, !!(e.payload && e.payload.visit)]), 'kontrola: wpis A z tożsamością wizyty').toEqual([[true, true]]);
    expect(wierszeKosza(o, s0).map(opis), 'wiersze stomb').toEqual([]);
  }, CZAS);

  it('to samo zdarzenie drugi raz — 0 wierszy stomb, bez odszyfrowania w porównaniu wpisów (surowy zapis przed = po)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    tik();
    const s0 = ostatni(o);
    const n = odszKosza(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    expect(wierszeOd(o, s0).map(opis), 'wiersze po powtórce').toEqual([]);
    expect(n.ile, 'bez odszyfrowania w porównaniu wpisów').toBe(0);
  }, CZAS);

  it('ładunek równy stanowi (koperta stomb tego samego wpisu u bliźniaka z tym samym stanem) — 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await wpisZGwiazdka(o);
    const X = await klonA(o, ZRODLO_SEJFU, true);
    const k = await koperta(o, await o.ev.buildSnapshotTombstoneEvent(s.v, null));
    const s0 = ostatni(X);
    expect((await zastosuj(X, k.env)).status).toBe('applied');
    expect(wierszeOd(X, s0).map(opis), 'wiersze').toEqual([]);
  }, CZAS);

  it('zmiana samych składników lokalnych wpisu (koperta snap v bez nowości, wersja przegrywa z Koszem) — surowy zapis wpisu zmieniony, 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    const kB = await kopertaSnap(s.B, s.P, s.v);
    tik(MIN);
    await doKosza(o, s.P, s.v);
    await o.gotowe();
    const przed = surowyKosz(o, s.v);
    const eksport = await wpisyEksportu(o, s.v);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect([surowyKosz(o, s.v) !== przed, JSON.stringify(await wpisyEksportu(o, s.v)) === JSON.stringify(eksport)], 'kontrola: surowy zapis zmieniony, eksport wpisu ten sam').toEqual([true, true]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze').toEqual([]);
  }, CZAS);

  it('wpis przegrywa z późniejszą wersją z ładunku (poprawka B po Koszu A — wpis zdjęty scaleniem) — 0 wierszy stomb i 0 emisji stomb; wersja przyjęta bez zmian — 0 wierszy snap (jak w odsyłaniu wersji)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await doKosza(o, s.P, s.v);
    await o.gotowe();
    tik(MIN);
    await popraw(s.B, s.P, s.v, 40);
    const kB = await kopertaSnap(s.B, s.P, s.v);
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect([(await stanWersji(o, s.P, s.v) || {}).masa, (await wpisyEksportu(o, s.v)).length], 'kontrola: v wraca do karty z poprawką, wpisu nie ma').toEqual([40, 0]);
    expect(emisjeKosza(o, e0), 'emisje odsyłania wpisów').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze').toEqual([]);
  }, CZAS);
});

describe('odsyłanie wpisów Kosza: kolejność z odsyłaniem wersji, łączenie wpisów kolejki, busy', () => {
  it('wersja i wpis zmienione w jednym scaleniu (koperta spoza buildera: snap w z poprawką B i wpis Kosza v z B bez gwiazdki; A dało w i v gwiazdki) — wiersze snap P/w i stomb v, w tej kolejności', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 21, 22]);
    const [v, w] = k.w;
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await popraw(B, k.P, w, 17.2);
    const ks = await kopertaSnap(B, k.P, w);
    tik(MIN);
    await gwiazdka(o, k.P, v);
    await gwiazdka(o, k.P, w);
    await o.gotowe();
    tik(MIN);
    await doKosza(B, k.P, v);
    const kx = await koperta(B, await B.ev.buildSnapshotTombstoneEvent(v, null));
    const c = await B.v.encryptPayloadForCurrentUser({ ...ks.k, snapshotTombstones: kx.k.snapshotTombstones });
    const s0 = ostatni(o);
    expect((await zastosuj(o, { iv: c.iv, data: c.data })).status).toBe('applied');
    expect(wierszeOd(o, s0).map((x) => [x.kind, x.entityKey]), 'wiersze odsyłania (wersja, potem wpis)').toEqual([['snap', `${k.P}/${w}`], ['stomb', v]]);
    const nowe = wierszeOd(o, s0);
    expect(await trescWiersza(o, nowe[0]), 'treść wiersza snap').toEqual({ kind: 'snap', key: `${k.P}/${w}`, ...(await stanWersji(o, k.P, w)) });
    expect((await trescWierszaKosza(o, nowe[1])).wpisy, 'treść wiersza stomb').toEqual([{ karta: k.P, masa: 20, gwiazdka: true, tresc: true }]);
  }, CZAS);

  it('łączenie wpisów kolejki — odesłanie wpisu po własnym czekającym stomb v zastępuje go; własne „Przywróć” i ponowny Kosz v po odesłaniu — odesłanie zostaje (wiersz snap P/v między nimi), własny wiersz za nim; odesłanie z wierszem innej encji za własnym stomb v — oba zostają', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const tegoWpisu = () => o.kolejka('A').filter((x) => x.kind === 'stomb' && x.entityKey === s.v);
    const wlasny = tegoWpisu();
    expect(wlasny.map((x) => x.state), 'kontrola: czekający własny wiersz Kosza v').toEqual(['pending']);
    await zastosuj(o, s.kB.env);
    const poOdeslaniu = tegoWpisu();
    expect([poOdeslaniu.length, poOdeslaniu[0].seqLocal > wlasny[0].seqLocal, (await trescWierszaKosza(o, poOdeslaniu[0])).wpisy[0].gwiazdka], '(a) odesłanie zastąpiło czekający własny wiersz').toEqual([1, true, true]);
    tik(MIN);
    await o.v.restoreTrashedSnapshot(s.P, s.v);
    tik();
    await doKosza(o, s.P, s.v);
    await o.gotowe();
    // Własny stomb v jest możliwy dopiero po powrocie v do karty: wiersz snap P/v z „Przywróć” stoi między odesłaniem
    // a własnym stomb v, więc odesłanie zostaje (reguła ogona), a własny wiersz idzie za nim.
    const poWlasnym = tegoWpisu();
    const miedzy = o.kolejka('A').filter((x) => x.seqLocal > poOdeslaniu[0].seqLocal && x.seqLocal < poWlasnym[poWlasnym.length - 1].seqLocal).map((x) => [x.kind, x.entityKey]);
    expect([poWlasnym.map((x) => x.seqLocal), miedzy], '(b) odesłanie zostaje, własny wiersz za wierszem „Przywróć”').toEqual([[poOdeslaniu[0].seqLocal, poWlasnym[1].seqLocal], [['snap', `${s.P}/${s.v}`]]]);
    // (c) nowy przebieg: własny stomb v, za nim wiersz innej encji (nowa wersja karty Q), potem odesłanie wpisu v.
    const o2 = await okno({ bramka: true, echo: true });
    await o2.zaloguj('A');
    const s2 = await gwiazdkaSpoza(o2);
    await karta(o2, 2, [30]);
    await o2.gotowe();
    await zastosuj(o2, s2.kB.env);
    expect(o2.kolejka('A').filter((x) => x.kind === 'stomb' && x.entityKey === s2.v).length, '(c) oba wiersze stomb v zostają').toBe(2);
  }, 2 * CZAS);

  it('busy z fazy Kosza po zapisie listy Kosza (błąd w wyszukaniu wersji pod innymi kartami) — status busy jak dziś, odesłanie wpisu przy pierwszej próbie; ponowienie (applied) bez duplikatu', async () => {
    const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_OBCE) });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const przed = JSON.stringify(await wpisyEksportu(o, s.v));
    const s0 = ostatni(o);
    o.win.__fikcyjnyBlad = blad({ vildaMergeBusy: true, code: 'PATIENT_LOCK_TIMEOUT' });
    const r = await zastosuj(o, s.kB.env);
    expect([r.status, r.code, o.win.__fikcyjnyBlad], 'kontrola: busy z fazy Kosza').toEqual(['busy', 'PATIENT_LOCK_TIMEOUT', null]);
    expect(JSON.stringify(await wpisyEksportu(o, s.v)) !== przed, 'kontrola: lista Kosza zapisana przed błędem').toBe(true);
    expect(wierszeOd(o, s0).map(opis), 'odesłanie przy pierwszej próbie').toEqual([['stomb', s.v, 'pending']]);
    const s1 = ostatni(o);
    expect((await zastosuj(o, s.kB.env)).status, 'ponowienie').toBe('applied');
    expect(wierszeOd(o, s1).map(opis), 'ponowienie bez duplikatu').toEqual([]);
  }, CZAS);
});

describe('odsyłanie wpisów Kosza: zmiana sesji, usuwanie konta, strażnik tożsamości', () => {
  it('zmiana sesji w odczycie wpisów Kosza „przed” (blokada sejfu albo ponowne odblokowanie A przy odczycie metadanych konta po odczycie wersji) — locked albo session-changed, scalanie nie rusza (bez zapisu listy Kosza), 0 wierszy', async () => {
    for (const [nazwa, oczek] of [['blokada', 'locked'], ['ponowne odblokowanie A', 'session-changed']]) {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await gwiazdkaSpoza(o);
      const przed = surowyKosz(o, s.v);
      const s0 = ostatni(o);
      const h = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep: 'meta', metoda: 'get' });
      const p = o.ev.applyEncryptedEvent(s.kB.env);
      const stan = await Promise.race([h.czeka.then(() => 'wstrzymane'), p.then(() => 'koniec')]);
      expect(stan, `${nazwa}: kontrola — odczyt metadanych konta wstrzymany`).toBe('wstrzymane');
      let prz = null;
      if (nazwa === 'blokada') o.zablokuj();
      else { prz = o.przelaczWTle('A'); await prz.sesja; }
      h.zwolnij();
      const r = await p;
      if (prz) await prz.koniec;
      await o.cisza();
      expect(r, `${nazwa}: wynik`).toEqual({ status: oczek });
      if (oczek === 'locked') await o.zaloguj('A');
      await o.gotowe();
      expect(surowyKosz(o, s.v), `${nazwa}: lista Kosza bez zapisu (v bez gwiazdki)`).toBe(przed);
      // Przegląd kolejki przy ponownym odblokowaniu dopisuje wiersz karty P (Kosz zmienił kartę bez nowej wersji) —
      // jak dziś; odsyłanie wpisu sprawdzają wiersze stomb.
      expect(wierszeKosza(o, s0).map(opis), `${nazwa}: wiersze stomb`).toEqual([]);
    }
  }, 2 * CZAS);

  it('zmiana sesji w odczycie wersji „przed” (ponowne odblokowanie A przy odczycie sklepu wersji) — session-changed, bez wejścia do odczytu wpisów Kosza w nowej sesji (znacznik na początku Bev_stanKosza nietknięty) i bez zapisu listy Kosza', async () => {
    const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_STANU_KOSZA) });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const przed = surowyKosz(o, s.v);
    const znak = blad({ name: 'UnknownError' });
    o.win.__fikcyjnyBlad = znak;
    const h = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep: 'snapshots', metoda: 'get' });
    const p = o.ev.applyEncryptedEvent(s.kB.env);
    expect(await Promise.race([h.czeka.then(() => 'wstrzymane'), p.then(() => 'koniec')]), 'kontrola: odczyt wersji „przed” wstrzymany').toBe('wstrzymane');
    const prz = o.przelaczWTle('A');
    await prz.sesja;
    h.zwolnij();
    const r = await p;
    await prz.koniec;
    await o.cisza();
    expect(r, 'wynik').toEqual({ status: 'session-changed' });
    expect(o.win.__fikcyjnyBlad, 'bez wejścia do odczytu wpisów Kosza').toBe(znak);
    o.win.__fikcyjnyBlad = null;
    expect(surowyKosz(o, s.v), 'lista Kosza bez zapisu').toBe(przed);
  }, CZAS);

  it('zmiana sesji w porównaniu wpisów „po” (blokada sejfu przy odszyfrowaniu wpisu po scaleniu) — applied jak dziś (scalanie skończone), bez emisji odsyłania wpisów, 0 wierszy', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const h = o.krypto.wstrzymaj({ metoda: 'decrypt', wStosie: 'Bev_echoKosza' });
    const p = o.ev.applyEncryptedEvent(s.kB.env);
    const stan = await Promise.race([h.osiagnieta.then(() => 'wstrzymane'), p.then(() => 'koniec')]);
    if (stan !== 'wstrzymane') h.zwolnij();
    expect(stan, 'kontrola: odszyfrowanie wpisu po scaleniu (porównanie „po”)').toBe('wstrzymane');
    o.zablokuj();
    h.zwolnij();
    const r = await p;
    await o.cisza();
    expect(r.status, 'wynik').toBe('applied');
    expect(emisjeKosza(o, e0), 'bez emisji odsyłania wpisów').toEqual([]);
    await o.zaloguj('A');
    await o.gotowe();
    expect(wierszeKosza(o, s0).map(opis), 'wiersze stomb').toEqual([]);
  }, CZAS);

  it('usuwanie konta (SYNC_DB_DELETED) albo strażnik tożsamości niedostępny (PATIENT_AUTHORITY_UNAVAILABLE) w odczycie wpisów Kosza „przed” — session-changed albo busy z kodem, scalanie nie rusza, 0 wierszy', async () => {
    for (const [kod, oczek] of [['SYNC_DB_DELETED', { status: 'session-changed' }], ['PATIENT_AUTHORITY_UNAVAILABLE', { status: 'busy', code: 'PATIENT_AUTHORITY_UNAVAILABLE' }]]) {
      const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_STANU_KOSZA) });
      await o.zaloguj('A');
      const s = await gwiazdkaSpoza(o);
      const przed = surowyKosz(o, s.v);
      const s0 = ostatni(o);
      o.win.__fikcyjnyBlad = blad({ code: kod });
      expect(await zastosuj(o, s.kB.env), `${kod}: wynik`).toEqual(oczek);
      expect(o.win.__fikcyjnyBlad, `${kod}: kontrola — błąd odczytu użyty`).toBe(null);
      expect(surowyKosz(o, s.v), `${kod}: scalanie nie rusza`).toBe(przed);
      expect(wierszeOd(o, s0).map(opis), `${kod}: wiersze`).toEqual([]);
    }
  }, 2 * CZAS);

  it('usuwanie konta (SYNC_DB_DELETED) w odczycie wpisów Kosza „po” przy udanym odczycie wersji „po” — applied, bez odsyłania wersji i wpisów (rekord złożony bez wiersza snap)', async () => {
    const o = await okno({ bramka: true, echo: true, zrodlo: zUsterkaKolejna(KOTWICA_STANU_KOSZA) });
    await o.zaloguj('A');
    const s = await rekordZlozony(o);
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    o.win.__fikcyjneBledy = [null, blad({ code: 'SYNC_DB_DELETED' })];
    expect((await zastosuj(o, s.kB.env)).status, 'wynik').toBe('applied');
    expect(o.win.__fikcyjneBledy, 'kontrola: odczyt „przed” bez błędu, odczyt „po” z odmową').toEqual([]);
    expect((await stanWersji(o, s.P, s.v)).masa, 'kontrola: rekord złożony zapisany').toBe(17.2);
    expect(o.l.emisje.slice(e0).filter((x) => x.sesja), 'bez emisji odsyłania wersji i wpisów').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze').toEqual([]);
  }, CZAS);

  it('strażnik formy: odczyt wpisów Kosza kandydatów sprawdza sesję zastosowania przed strzeżonym adapterem i po odczycie metadanych konta', async () => {
    const { parse } = await import('acorn');
    const m = ZRODLO_SEJFU.match(/\nasync function Bev_stanKosza\(([^)]*)\) \{[\s\S]*?\n\}/);
    expect(m, 'funkcja Bev_stanKosza w części Bev_').toBeTruthy();
    const f = parse(m[0], { ecmaVersion: 'latest', sourceType: 'script' }).body[0];
    const s = f.params[1] && f.params[1].name;
    expect(s, 'drugi parametr — sesja zastosowania').toBeTruthy();
    const tekst = (n) => m[0].slice(n.start, n.end);
    const instr = f.body.body.map(tekst);
    const i0 = instr.findIndex((t) => /Bev_start\(/.test(t));
    const iMeta = instr.findIndex((t) => /await c\.a\.getUserMeta\(/.test(t));
    expect([instr[0], i0 > 0, iMeta > i0, instr[iMeta + 1]], 'Bses_pilnuj(sesja) przed Bev_start i zaraz po getUserMeta').toEqual([`Bses_pilnuj(${s});`, true, true, `Bses_pilnuj(${s});`]);
  });
});

describe('odsyłanie wpisów Kosza: błędy osobno dla każdego kandydata', () => {
  it('nieczytelna tożsamość wpisu „po” (odszyfrowanie tożsamości usuniętej wizyty zawodzi w porównaniu i w builderze) — emisja odsyłania v, dopisanie odmawia bez wiersza; tak samo własny Kosz takiego wpisu', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const q = await karta(o, 2, [30, 31]);
    await o.gotowe();
    const s0 = ostatni(o);
    const e0 = o.l.emisje.length;
    const h = o.krypto.blad({ metoda: 'decrypt', gdy: (_m, _a, stos) => String(stos).includes('Bvisit_deletedIdentity') && (String(stos).includes('Bev_echoKosza') || String(stos).includes('Bev_stomb')) }, { kod: 'OperationError', staly: true });
    expect((await zastosuj(o, s.kB.env)).status, 'wynik').toBe('applied');
    expect(emisjeKosza(o, e0).map((x) => x.klucze), 'emisja odsyłania wpisu v').toEqual([[s.v]]);
    expect(wierszeKosza(o, s0).map(opis), 'bez wiersza stomb (odmowa dopisania)').toEqual([]);
    await doKosza(o, q.P, q.w[0]);
    await o.gotowe();
    expect(wierszeKosza(o, s0).map(opis), 'kontrola: własny Kosz takiego wpisu — też bez wiersza').toEqual([]);
    h.rozbroj();
  }, CZAS);

  it('cały odczyt wpisów Kosza „przed” zawodzi — porównanie tylko z ładunkiem: koperta stomb inna niż wpis po scaleniu — wiersz stomb v; koperta równa stanowi — 0', async () => {
    for (const [nazwa, wiersze] of [['koperta bez gwiazdki, tutejsza gwiazdka', 1], ['koperta równa stanowi', 0]]) {
      const o = await okno({ bramka: true, echo: true, zrodlo: zUsterka(KOTWICA_STANU_KOSZA) });
      await o.zaloguj('A');
      let env;
      let v;
      if (wiersze) {
        const s = await bazaKosza(o);
        v = s.v;
        tik(MIN);
        await gwiazdka(o, s.P, s.v);
        await o.gotowe();
        tik(MIN);
        await doKosza(s.B, s.P, s.v);
        env = (await koperta(s.B, await s.B.ev.buildSnapshotTombstoneEvent(s.v, null))).env;
      } else {
        const s = await wpisZGwiazdka(o);
        v = s.v;
        env = (await koperta(o, await o.ev.buildSnapshotTombstoneEvent(s.v, null))).env;
      }
      const s0 = ostatni(o);
      o.win.__fikcyjnyBlad = blad({ name: 'UnknownError' });
      expect((await zastosuj(o, env)).status, `${nazwa}: wynik`).toBe('applied');
      expect(o.win.__fikcyjnyBlad, `${nazwa}: kontrola — błąd odczytu użyty`).toBe(null);
      expect(wierszeOd(o, s0).map(opis), `${nazwa}: wiersze`).toEqual(wiersze ? [['stomb', v, 'pending']] : []);
    }
  }, 2 * CZAS);

  it('cały odczyt wpisów Kosza „po” zawodzi — emisja odsyłania każdego kandydata (pełna karta: v w Koszu A, w i x w karcie), wiersz tylko dla v (klucz bez wpisu — bez wiersza); oba odczyty zawodzą przy kopercie snap z gwiazdką — wiersz stomb v', async () => {
    {
      const o = await okno({ bramka: true, echo: true, zrodlo: zUsterkaKolejna(KOTWICA_STANU_KOSZA) });
      await o.zaloguj('A');
      const k = await karta(o, 1, [20, 21, 22]);
      const [v, w, x] = k.w;
      await o.gotowe();
      const B = await blizniak(o);
      tik(MIN);
      await popraw(B, k.P, w, 30);
      const porcje = await B.ev.buildPatientFullEvents(k.P, null);
      expect(porcje.length, 'kontrola: jedna porcja').toBe(1);
      const kB = await koperta(B, porcje[0]);
      tik(MIN);
      await doKosza(o, k.P, v);
      await o.gotowe();
      const s0 = ostatni(o);
      const e0 = o.l.emisje.length;
      o.win.__fikcyjneBledy = [null, blad({ name: 'UnknownError' })];
      expect((await zastosuj(o, kB.env)).status, 'odczyt „po”: wynik').toBe('applied');
      expect(o.win.__fikcyjneBledy, 'kontrola: błąd odczytu „po” użyty').toEqual([]);
      expect(emisjeKosza(o, e0).map((q) => [...q.klucze].sort()), 'odczyt „po”: emisja każdego kandydata').toEqual([[v, w, x].sort()]);
      expect(wierszeKosza(o, s0).map(opis), 'odczyt „po”: wiersz tylko dla wpisu, który jest').toEqual([['stomb', v, 'pending']]);
    }
    {
      const o = await okno({ bramka: true, echo: true, zrodlo: zUsterkaKolejna(KOTWICA_STANU_KOSZA) });
      await o.zaloguj('A');
      const s = await gwiazdkaSpoza(o);
      const s0 = ostatni(o);
      o.win.__fikcyjneBledy = [blad({ name: 'UnknownError' }), blad({ name: 'UnknownError' })];
      expect((await zastosuj(o, s.kB.env)).status, 'oba odczyty: wynik').toBe('applied');
      expect(o.win.__fikcyjneBledy, 'kontrola: oba błędy użyte').toEqual([]);
      expect(wierszeOd(o, s0).map(opis), 'oba odczyty: wiersze').toEqual([['stomb', s.v, 'pending']]);
    }
  }, 2 * CZAS);
});

describe('odsyłanie wpisów Kosza: stałe, kanon, reguła pola i samo wygaśnięcie z kodu sejfu', () => {
  it('stałe wpisu Kosza w części Bev_ równe licznikowi odsyłania: pola zawsze zapisywane = POLA_ZAWSZE.stomb; ścieżki kanonu = POLA_D7 + seq + postać gwiazdki w treści', () => {
    const z = ZRODLO_SEJFU.match(/const Bev_ECHO_ZAWSZE_KOSZA = Object\.freeze\((\[[^\]]*\])\);/);
    const k = ZRODLO_SEJFU.match(/const Bev_KANON_KOSZA = Object\.freeze\((\[[^\]]*\])\);/);
    expect([!!z, !!k], 'stałe Bev_ECHO_ZAWSZE_KOSZA i Bev_KANON_KOSZA w sejfie').toEqual([true, true]);
    const lista = (x) => JSON.parse(x[1].replace(/'/g, '"').replace(/\s+/g, ''));
    expect(lista(z)).toEqual([...POLA_ZAWSZE.stomb]);
    expect(lista(k)).toEqual([...POLA_D7, 'seq', ...POSTAC_GWIAZDKI.map((p) => `payload.${p}`)]);
  });

  it('kanon, reguła pola i samo wygaśnięcie — Bev_kanonKosza, Bev_echoKoszaT i Bev_samoWygasniecie z kodu sejfu', () => {
    const stale = ['Bev_ECHO_ZAWSZE_KOSZA', 'Bev_KANON_KOSZA'].map((n) => { const m = ZRODLO_SEJFU.match(new RegExp(`\\nconst ${n} = [^;]*;`)); expect(m, `stała ${n}`).toBeTruthy(); return m[0]; });
    const NAZWY = ['Bev_obiekt', 'Bev_ma', 'Bev_kopia', 'Bgw_kanon', 'Bev_pole', 'Bev_bezPola', 'Bev_json', 'Bev_kanonKosza', 'Bev_samoWygasniecie', 'Bev_echoKoszaT'];
    const f = new Function(`${stale.join('\n')}\n${NAZWY.map(wytnij).join('\n')}\nreturn { kanon: Bev_kanonKosza, samo: Bev_samoWygasniecie, T: Bev_echoKoszaT, json: Bev_json };`)();
    const T0 = '2026-03-02T08:00:00.000Z', T1 = '2026-03-02T08:05:00.000Z';
    const e = (pid, o = {}) => ({ patientId: pid, snapshotId: 'v', deletedAtISO: T1, savedAtISO: T0, rev: 1, updatedAtISO: T0, gwiazdka: { pin: true, at: T0 }, visitIdentity: { version: 1, visitId: 'w-1' }, payload: { user: { weight: 20 }, visit: { visitId: 'w-1' }, _pinned: true, _pinnedState: { pin: true, at: T0 } }, ...o });
    const kl = (l) => f.json(f.kanon(l));
    // kanon: kolejność kluczy i elementów bez znaczenia
    const odwr = (x) => Object.fromEntries(Object.entries(x).reverse());
    expect(kl([e('P'), e('Q')]), 'kolejność elementów i kluczy').toBe(kl([odwr(e('Q')), odwr(e('P'))]));
    expect(kl([e('P')]), 'tylko opis (rev, updatedAtISO, zmianaISO, koszISO, revPary, seq)').toBe(kl([e('P', { rev: 7, updatedAtISO: T1, zmianaISO: T1, koszISO: T1, revPary: [[1, 2]], seq: 9 })]));
    expect(kl([e('P')]), 'tylko postać gwiazdki w treści').toBe(kl([e('P', { payload: { user: { weight: 20 }, visit: { visitId: 'w-1' }, _pinnedState: { pin: false, at: T1 } } })]));
    expect(kl([e('P')]), 'pole gwiazdka w kanonie').not.toBe(kl([e('P', { gwiazdka: { pin: false, at: T1 } })]));
    expect(kl([e('P')]), 'treść w kanonie').not.toBe(kl([e('P', { payload: { user: { weight: 40 }, visit: { visitId: 'w-1' } } })]));
    // samo wygaśnięcie: tylko zdjęta treść
    const bezTresci = (x) => { const { payload: _p, ...r } = x; return r; };
    expect(f.samo(f.kanon([e('P')]), f.kanon([bezTresci(e('P'))])), 'zdjęta tylko treść').toBe(true);
    expect(f.samo(f.kanon([e('P')]), f.kanon([bezTresci(e('P', { gwiazdka: { pin: false, at: T1 } }))])), 'zdjęta treść i inna gwiazdka').toBe(false);
    expect(f.samo(f.kanon([e('P')]), f.kanon([e('P')])), 'nic nie zdjęto').toBe(false);
    expect(f.samo(f.kanon([e('P')]), f.kanon([bezTresci(e('Q'))])), 'element innej karty').toBe(false);
    expect(f.samo(f.kanon([e('P'), e('Q')]), f.kanon([bezTresci(e('P')), e('Q')])), 'dwie karty, treść zdjęta w jednej').toBe(true);
    // reguła pola: bez visitIdentity i payload.visit nieobecnych w elemencie ładunku tej samej karty
    const bezTozsamosci = (x) => { const { visitIdentity: _v, payload: { visit: _w, ...p }, ...r } = x; return { ...r, payload: p }; };
    expect(f.json(f.T(f.kanon([e('P')]), [bezTozsamosci(e('P'))])), 'ładunek bez tożsamości: równe ładunkowi').toBe(kl([bezTozsamosci(e('P'))]));
    expect(f.json(f.T(f.kanon([e('P')]), [e('P')])), 'ładunek z tożsamością: bez zmian').toBe(kl([e('P')]));
    expect(f.json(f.T(f.kanon([e('P'), e('Q')]), [bezTozsamosci(e('P'))])), 'element innej karty bez pary w ładunku — bez zmian').toBe(kl([bezTozsamosci(e('P')), e('Q')]));
    expect(f.json(f.T(f.kanon([e('P')]), [{ ...bezTozsamosci(e('P')), gwiazdka: null }])), 'inne pole nieobecne w ładunku zostaje').not.toBe(kl([{ ...bezTozsamosci(e('P')), gwiazdka: null }]));
  });
});

// Zestaw kopert z czterech przypadków odsyłania wpisów (gwiazdka i poprawka, w ładunku i spoza) na jednej karcie P
// [v, w, x, y, z]: B — gwiazdka v, poprawka x (40 kg), Kosz w i y; A — wcześniej gwiazdka w i poprawka y (40 kg),
// później Kosz v i x. Koperty: snap v, stomb w, snap x, stomb y.
async function zestawKosza(o) {
  const k = await karta(o, 1, [20, 21, 22, 23, 24]);
  const [v, w, x, y] = k.w;
  await o.gotowe();
  const B = await blizniak(o);
  tik(MIN);
  await gwiazdka(o, k.P, w);
  await popraw(o, k.P, y, 40);
  await o.gotowe();
  tik(MIN);
  await gwiazdka(B, k.P, v);
  await popraw(B, k.P, x, 40);
  await doKosza(B, k.P, w);
  await doKosza(B, k.P, y);
  const koperty = [(await kopertaSnap(B, k.P, v)).env, (await koperta(B, await B.ev.buildSnapshotTombstoneEvent(w, null))).env,
    (await kopertaSnap(B, k.P, x)).env, (await koperta(B, await B.ev.buildSnapshotTombstoneEvent(y, null))).env];
  tik(MIN);
  await doKosza(o, k.P, v);
  await doKosza(o, k.P, x);
  await o.gotowe();
  return { P: k.P, v, w, x, y, B, koperty };
}

describe('odsyłanie wpisów Kosza: drogi bez odsyłania, przełącznik wyłączony, bramka i tryb', () => {
  it('notatka pacjenta, stara delta, delta i pełna kopia z różnicą wpisu Kosza (gwiazdka B dla v w Koszu A) — 0 wierszy stomb; wpis przyjmuje gwiazdkę', async () => {
    for (const droga of ['notatka pacjenta (pnote)', 'stara delta przez applyEncryptedEvent', 'delta (applyEncryptedDelta)', 'pełna kopia (mergeSyncPayload)']) {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await gwiazdkaSpoza(o);
      const s0 = ostatni(o);
      if (droga.startsWith('notatka')) {
        const n = (await s.B.v.savePatientNote({ patientId: s.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' })).id;
        tik();
        expect((await zastosuj(o, (await koperta(s.B, await s.B.ev.buildPatientNoteEvent(n, null))).env)).status, `${droga}: kontrola`).toBe('applied');
      } else if (droga.startsWith('pełna')) await o.v.mergeSyncPayload(await s.B.v.exportSyncPayload());
      else {
        const d = await s.B.v.buildPatientDelta(s.P);
        if (droga.startsWith('delta')) expect(await o.v.applyEncryptedDelta(d), `${droga}: kontrola`).toBeTruthy();
        else expect((await o.ev.applyEncryptedEvent({ iv: d.iv, data: d.data })).status, `${droga}: kontrola`).toBe('applied');
      }
      tik();
      await o.gotowe();
      if (!droga.startsWith('notatka')) expect((await wpisyEksportu(o, s.v)).map(faktWpisu), `${droga}: kontrola — wpis z gwiazdką`).toEqual([{ masa: 20, gwiazdka: true, tresc: true }]);
      expect(wierszeKosza(o, s0).map(opis), `${droga}: wiersze stomb`).toEqual([]);
    }
  }, 3 * CZAS);

  it('przełącznik wyłączony — sejf a sejf bez odsyłania w bliźniaczych oknach przy kopertach wpisów Kosza (gwiazdka i poprawka, w ładunku i spoza): te same wyniki, zapis przebiegu atrapy, wiersze i operacje crypto.subtle; 4 odczyty pola i 4 klucza przełącznika na 4 zastosowania', async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const s = await zestawKosza(o);
    const t = zegar;
    ustawZegar(t);
    const a = await przebieg(await klonA(o, ZRODLO_SEJFU), s.koperty);
    ustawZegar(t);
    const b = await przebieg(await klonA(o, bezOdsylania().zrodlo), s.koperty);
    expect(a.wyniki.map((w) => w.status), 'kontrola: statusy').toEqual(['applied', 'applied', 'applied', 'applied']);
    expect(a.wyniki, 'wyniki').toEqual(b.wyniki);
    expect(a.log, 'zapis przebiegu atrapy').toEqual(b.log);
    expect(a.krypto, 'operacje crypto.subtle').toEqual(b.krypto);
    expect(a.wiersze, 'wiersze kolejki').toEqual(b.wiersze);
    expect({ sejf: a.echo, bez: b.echo }, 'odczyty pola przełącznika').toEqual({ sejf: MA_ECHO ? 4 : 0, bez: 0 });
    expect({ sejf: a.klucz, bez: b.klucz }, 'odczyty klucza przełącznika').toEqual({ sejf: MA_ECHO ? 4 : 0, bez: 0 });
  }, 2 * CZAS);

  it('zamknięta bramka dziennika przy włączonym przełączniku i kopercie snap z gwiazdką dla v w Koszu — 0 wierszy, zapis przebiegu atrapy jak w sejfie bez odsyłania (bez odczytu metadanych konta ponad dziś); „Komputer w pracy” — bez bazy kolejki i bez porównania wpisów', async () => {
    const o = await okno({ bramka: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const t = zegar;
    const w = {};
    for (const [nazwa, zrodlo, echo] of [['sejf', ZRODLO_SEJFU, true], ['bez odsyłania', bezOdsylania().zrodlo, undefined]]) {
      ustawZegar(t);
      const X = await klonA(o, zrodlo, echo);
      X.bramka.wartosc = false;
      w[nazwa] = await przebieg(X, [s.kB.env]);
    }
    expect(w.sejf.wyniki, 'wynik').toEqual(w['bez odsyłania'].wyniki);
    expect(w.sejf.log, 'zapis przebiegu atrapy').toEqual(w['bez odsyłania'].log);
    expect(w.sejf.wiersze, 'wiersze kolejki').toEqual([]);
    const c = await okno({ bramka: true, echo: true, chmura: ['A'] });
    await c.zaloguj('A');
    const k = await karta(c, 1, [20, 21]);
    await c.gotowe();
    const { drugieOkno } = await import('../support/okno-magazynu.mjs');
    const B = await drugieOkno(c, { bramka: false, zaloguj: 'A' });
    OKNA.push(B);
    await B.v.mergeSyncPayload(await c.v.exportSyncPayload());
    tik(MIN);
    await gwiazdka(B, k.P, k.w[0]);
    const kB = await kopertaSnap(B, k.P, k.w[0]);
    tik(MIN);
    await doKosza(c, k.P, k.w[0]);
    await c.gotowe();
    const n = odszKosza(c);
    expect((await zastosuj(c, kB.env)).status).toBe('applied');
    expect((await wpisyEksportu(c, k.w[0])).map(faktWpisu), '„Komputer w pracy”: kontrola — wpis z gwiazdką').toEqual([{ masa: 20, gwiazdka: true, tresc: true }]);
    expect([c.jestBaza('A'), n.ile], '„Komputer w pracy”: bez bazy kolejki, bez odszyfrowań w porównaniu wpisów').toEqual([false, 0]);
  }, 3 * CZAS);

  it('wartownik treści: fikcyjny napis z nazwiska nie wychodzi poza szyfrogram — emisja odsyłania wpisu z samym identyfikatorem wersji, wyniki, console, localStorage i sessionStorage', async () => {
    const W = 'Wartownik-Testowy-KZ4';
    const WZ = W.slice(0, 9);
    const util = await import('node:util');
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const szpiedzy = [console, o.win.console].flatMap((c) => ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(c, m)));
    const r0 = await o.v.savePatient({ name: 'Testowy ' + W, user: { lastName: W, firstName: 'Jan', sex: 'M', height: 120, weight: 20 } }, { dedup: false });
    tik();
    const r1 = await o.v.savePatient({ name: 'Testowy ' + W, user: { lastName: W, firstName: 'Jan', sex: 'M', height: 121, weight: 21 } }, { dedup: false, patientId: r0.patientId });
    tik();
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await gwiazdka(B, r0.patientId, r0.snapshotId);
    const kB = await kopertaSnap(B, r0.patientId, r0.snapshotId);
    expect(JSON.stringify(kB.k), 'kontrola: napis w treści koperty').toContain(W);
    tik(MIN);
    await doKosza(o, r0.patientId, r0.snapshotId);
    await o.gotowe();
    const e0 = o.l.emisje.length;
    const wynik = await zastosuj(o, kB.env);
    expect([wynik.status, r1.patientId], 'kontrola: zastosowane').toEqual(['applied', r0.patientId]);
    expect(JSON.stringify(wynik)).not.toContain(WZ);
    const odsylanie = emisjeKosza(o, e0);
    expect(odsylanie.map((x) => x.klucze), 'emisja odsyłania wpisu: sam identyfikator wersji').toEqual([[r0.snapshotId]]);
    for (const x of odsylanie) expect(JSON.stringify(x)).not.toContain(WZ);
    for (const s of szpiedzy) for (const wywolanie of s.mock.calls) expect(util.inspect(wywolanie, { depth: 8, showHidden: true })).not.toContain(WZ);
    expect(JSON.stringify(o.lokalny.m)).not.toContain(WZ);
    const ss = o.win.sessionStorage;
    const sesyjne = typeof ss.klucze === 'function' ? ss.klucze().map((k) => ss.getItem(k)) : [];
    expect(JSON.stringify(sesyjne)).not.toContain(WZ);
  }, CZAS);
});

describe('odsyłanie wpisów Kosza: odbiorcy, samo wygaśnięcie treści i okno nagrobków (sztuczny zegar)', () => {
  const D30 = 30 * 24 * 3600e3;
  const D365 = 365 * 24 * 3600e3;
  it('odesłany wpis z gwiazdką u urządzenia, które usunęło kartę później niż Kosz — karta zostaje usunięta, okno Kosza bez wiersza tej karty, 0 odesłań', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const C = await klonA(o, ZRODLO_SEJFU, true);
    tik(MIN);
    await C.v.removePatient(s.P);
    tik();
    await C.gotowe();
    const s0 = ostatni(o);
    expect((await zastosuj(o, s.kB.env)).status).toBe('applied');
    const odeslane = wierszeKosza(o, s0);
    expect(odeslane.map(opis), 'kontrola: wiersz odsyłania A').toEqual([['stomb', s.v, 'pending']]);
    const sC = ostatni(C);
    expect((await zastosuj(C, odeslane[0].env)).status).toBe('applied');
    expect(await C.v.getPatient(s.P), 'karta P zostaje usunięta').toBe(null);
    expect((await C.v.listTrashedSnapshots()).filter((e) => e.snapshotId === s.v && e.patientExists), 'okno Kosza bez wiersza karty P').toEqual([]);
    expect(wierszeOd(C, sC).map(opis), 'bez odesłań').toEqual([]);
  }, CZAS);

  it('samo wygaśnięcie treści: wpis z treścią po granicy 30 dni i koperta snap v bez nowości — zapis wpisu bez treści, 0 wierszy', async () => {
    {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await bazaKosza(o);
      const kB = await kopertaSnap(s.B, s.P, s.v);
      tik(MIN);
      await doKosza(o, s.P, s.v);
      await o.gotowe();
      const [e] = await wpisyEksportu(o, s.v);
      ustawZegar(Date.parse(e.deletedAtISO) + D30 + 1);
      const przed = surowyKosz(o, s.v);
      const s0 = ostatni(o);
      expect((await zastosuj(o, kB.env)).status).toBe('applied');
      expect([surowyKosz(o, s.v) !== przed, (await wpisyEksportu(o, s.v)).map(faktWpisu)], 'samo wygaśnięcie: kontrola — zapis wpisu bez treści').toEqual([true, [{ masa: null, gwiazdka: false, tresc: false }]]);
      expect(wierszeOd(o, s0).map(opis), 'samo wygaśnięcie: wiersze').toEqual([]);
    }
  }, CZAS);

  it('unieważnienie Kosza: Kosz A połączony z późniejszym przycięciem v z B (porządkowanie) — jeden wiersz stomb v', async () => {
    {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await bazaKosza(o);
      tik(MIN);
      await doKosza(o, s.P, s.v);
      await o.gotowe();
      tik(MIN);
      await s.B.v.pruneSnapshotsForPatient(s.P, { recentHours: 0 });
      tik();
      const kB = await koperta(s.B, await s.B.ev.buildSnapshotTombstoneEvent(s.v, null));
      expect(kB.k.snapshotTombstones.map((x) => [x.powod, !!x.payload]), 'kontrola: wpis retencji B bez treści').toEqual([['retencja', false]]);
      const s0 = ostatni(o);
      expect((await zastosuj(o, kB.env)).status).toBe('applied');
      const [po] = await wpisyEksportu(o, s.v);
      expect([!!po.przycietoISO, !!po.payload, po.powod], 'kontrola: Kosz A z późniejszym przycięciem, z treścią').toEqual([true, true, undefined]);
      expect(wierszeOd(o, s0).map(opis), 'unieważnienie: wiersze').toEqual([['stomb', s.v, 'pending']]);
    }
  }, CZAS);

  it('zegar: gwiazdka spoza ładunku przy Kosz + 30 d − 1 ms, dokładnie + 30 d i + 30 d + 1 ms — jeden wiersz stomb v z treścią, z treścią, bez treści (zawsze z gwiazdką); odbiorca odesłanego wpisu (B) nic nie odsyła, okno Kosza i „Przywróć” takie same na obu', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const [e] = await wpisyEksportu(o, s.v);
    const granica = Date.parse(e.deletedAtISO) + D30;
    const wynik = [];
    for (const [nazwa, t] of [['− 1 ms', granica - 1], ['= granica', granica], ['+ 1 ms', granica + 1]]) {
      ustawZegar(t);
      const X = await klonA(o, ZRODLO_SEJFU, true);
      const Y = await klonA(s.B, ZRODLO_SEJFU, true);
      const s0 = ostatni(X);
      expect((await zastosuj(X, s.kB.env)).status, `${nazwa}: wynik`).toBe('applied');
      const nowe = wierszeOd(X, s0);
      const wpisy = nowe.length === 1 ? (await trescWierszaKosza(X, nowe[0])).wpisy : null;
      const sY = ostatni(Y);
      if (nowe.length === 1) expect((await zastosuj(Y, nowe[0].env)).status, `${nazwa}: odbiorca`).toBe('applied');
      const w = await widokKoszaObu(o, X, Y, s.P, s.v);
      wynik.push({ nazwa, wiersze: nowe.map((x) => x.kind), wpisy, odbiorca: wierszeOd(Y, sY).map(opis), widokRowny: JSON.stringify(w.X) === JSON.stringify(w.Y), oknoKosza: !!w.X.wiersz });
    }
    const wpis = (tresc) => [{ karta: s.P, masa: tresc ? 20 : null, gwiazdka: true, tresc }];
    expect(wynik, 'wiersze odsyłania, odbiorca, okno Kosza').toEqual([
      { nazwa: '− 1 ms', wiersze: ['stomb'], wpisy: wpis(true), odbiorca: [], widokRowny: true, oknoKosza: true },
      { nazwa: '= granica', wiersze: ['stomb'], wpisy: wpis(true), odbiorca: [], widokRowny: true, oknoKosza: true },
      { nazwa: '+ 1 ms', wiersze: ['stomb'], wpisy: wpis(false), odbiorca: [], widokRowny: true, oknoKosza: false },
    ]);
  }, 3 * CZAS);

  it('zegar: granica 30 dni w trakcie scalania (zegar przestawiony przy szyfrowaniu treści z ładunku w fazie Kosza) — poprawka z gwiazdką: jeden wiersz stomb v bez treści, z gwiazdką; sama poprawka: 0 wierszy', async () => {
    const wynik = {};
    for (const [nazwa, zGwiazdka] of [['poprawka z gwiazdką', true], ['sama poprawka', false]]) {
      const o = await okno({ bramka: true, echo: true });
      await o.zaloguj('A');
      const s = await bazaKosza(o);
      tik(MIN);
      await popraw(s.B, s.P, s.v, 40);
      if (zGwiazdka) await gwiazdka(s.B, s.P, s.v);
      const kB = await kopertaSnap(s.B, s.P, s.v);
      tik(MIN);
      await doKosza(o, s.P, s.v);
      await o.gotowe();
      const [e] = await wpisyEksportu(o, s.v);
      const granica = Date.parse(e.deletedAtISO) + D30;
      ustawZegar(granica - 1000);
      const h = o.krypto.po({ metoda: 'encrypt', wStosie: 'Bkz_scalKoniec' }, () => { ustawZegar(granica + 1); });
      const s0 = ostatni(o);
      expect((await zastosuj(o, kB.env)).status, `${nazwa}: wynik`).toBe('applied');
      expect([h.zrobione, (await wpisyEksportu(o, s.v)).map((x) => x.payload ? 'z treścią' : 'bez treści')], `${nazwa}: kontrola — hak przy szyfrowaniu treści, wpis bez treści`).toEqual([true, ['bez treści']]);
      // Wiersze stomb: skok zegara o 30 dni uruchamia przy pierwszej emisji przegląd kolejki „po dobie”, który dopisuje
      // wiersz karty P (nośnik — snap najnowszej wersji w) — jak dziś, poza odsyłaniem.
      const nowe = wierszeKosza(o, s0);
      wynik[nazwa] = { wiersze: nowe.map((x) => [x.kind]), wpisy: nowe.length ? (await trescWierszaKosza(o, nowe[0])).wpisy.map((x) => [x.gwiazdka, x.tresc]) : [] };
    }
    expect(wynik).toEqual({ 'poprawka z gwiazdką': { wiersze: [['stomb']], wpisy: [[true, false]] }, 'sama poprawka': { wiersze: [], wpisy: [] } });
  }, 2 * CZAS);

  it('zegar: okno nagrobków 365 dni — przy ostatniej chwili wpisu + 365 d − 1 ms jeden wiersz stomb v bez treści, z gwiazdką; przy + 365 d + 1 ms wpisu nie ma: 0 wierszy i 0 emisji stomb, v wraca do karty ze starej koperty B (z gwiazdką) bez wiersza snap', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await gwiazdkaSpoza(o);
    const [e] = await wpisyEksportu(o, s.v);
    const granica = Date.parse(e.deletedAtISO) + D365;
    const wynik = [];
    for (const [nazwa, t] of [['− 1 ms', granica - 1], ['+ 1 ms', granica + 1]]) {
      ustawZegar(t);
      const X = await klonA(o, ZRODLO_SEJFU, true);
      const s0 = ostatni(X);
      const e0 = X.l.emisje.length;
      expect((await zastosuj(X, s.kB.env)).status, `${nazwa}: wynik`).toBe('applied');
      const nowe = wierszeOd(X, s0);
      wynik.push({
        nazwa, wiersze: nowe.map((x) => x.kind), emisjeKosza: emisjeKosza(X, e0).length, wpisy: (await wpisyEksportu(X, s.v)).map(faktWpisu),
        wersja: await stanWersji(X, s.P, s.v),
      });
    }
    expect(wynik).toEqual([
      { nazwa: '− 1 ms', wiersze: ['stomb'], emisjeKosza: 1, wpisy: [{ masa: null, gwiazdka: true, tresc: false }], wersja: null },
      { nazwa: '+ 1 ms', wiersze: [], emisjeKosza: 0, wpisy: [], wersja: { masa: 20, gwiazdka: true, rev: 1 } },
    ]);
  }, 2 * CZAS);

  it('zegar: rozjazd zegarów — odbiorca (A) po granicy 30 dni scala kopertę stomb nadawcy (B) przed granicą: A odsyła raz wpis bez treści z gwiazdką; B (przed granicą) zachowuje treść i odsyła raz złączenie z gwiazdką; A nic; potem B po granicy przy kolejnym zdarzeniu z v — 0', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await gwiazdka(o, s.P, s.v);
    await o.gotowe();
    const X = await klonA(s.B, ZRODLO_SEJFU, true);
    tik(MIN);
    await doKosza(X, s.P, s.v);
    await X.gotowe();
    const kX = await koperta(X, await X.ev.buildSnapshotTombstoneEvent(s.v, null));
    const [e] = await wpisyEksportu(X, s.v);
    const granica = Date.parse(e.deletedAtISO) + D30;
    ustawZegar(granica + 1);
    const sA = ostatni(o);
    expect((await zastosuj(o, kX.env)).status).toBe('applied');
    const odA = wierszeOd(o, sA);
    expect(await Promise.all(odA.map(async (w) => (await trescWierszaKosza(o, w)).wpisy.map((x) => [x.gwiazdka, x.tresc]))), 'A po granicy: jeden wiersz bez treści, z gwiazdką').toEqual([[[true, false]]]);
    ustawZegar(Date.parse(e.deletedAtISO) + 2 * MIN);
    const sX = ostatni(X);
    expect((await zastosuj(X, odA[0].env)).status).toBe('applied');
    expect((await wpisyEksportu(X, s.v)).map((x) => [!!(x.gwiazdka && x.gwiazdka.pin), !!x.payload]), 'kontrola: B zachowuje treść, przyjmuje gwiazdkę').toEqual([[true, true]]);
    const odX = wierszeOd(X, sX);
    expect(await Promise.all(odX.map(async (w) => (await trescWierszaKosza(X, w)).wpisy.map((x) => [x.gwiazdka, x.tresc]))), 'B przed granicą: jedno złączenie z gwiazdką i treścią').toEqual([[[true, true]]]);
    ustawZegar(granica + 2);
    const sA2 = ostatni(o);
    expect((await zastosuj(o, odX[0].env)).status).toBe('applied');
    expect(wierszeOd(o, sA2).map(opis), 'A po złączeniu B: nic').toEqual([]);
    const sX2 = ostatni(X);
    expect((await zastosuj(X, odA[0].env)).status).toBe('applied');
    expect(wierszeOd(X, sX2).map(opis), 'B po granicy, kolejne zdarzenie z v: 0').toEqual([]);
  }, 2 * CZAS);

  it('zegar: odbiorca po granicy 30 dni dostaje wpis Kosza z treścią (u nadawcy przed granicą), bez innej różnicy — zapisuje wpis bez treści, 0 wierszy (samo wygaśnięcie względem ładunku)', async () => {
    const o = await okno({ bramka: true, echo: true });
    await o.zaloguj('A');
    const s = await bazaKosza(o);
    tik(MIN);
    await doKosza(s.B, s.P, s.v);
    const kB = await koperta(s.B, await s.B.ev.buildSnapshotTombstoneEvent(s.v, null));
    expect(kB.k.snapshotTombstones.map((x) => !!x.payload), 'kontrola: wpis z treścią').toEqual([true]);
    ustawZegar(Date.parse(kB.k.snapshotTombstones[0].deletedAtISO) + D30 + 1);
    const s0 = ostatni(o);
    expect((await zastosuj(o, kB.env)).status).toBe('applied');
    expect((await wpisyEksportu(o, s.v)).map(faktWpisu), 'kontrola: wpis A bez treści').toEqual([{ masa: null, gwiazdka: false, tresc: false }]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze').toEqual([]);
  }, CZAS);
});
