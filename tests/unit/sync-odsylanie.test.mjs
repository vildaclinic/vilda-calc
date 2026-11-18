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
// Kopia sejfu tylko w tym pliku (busy, apply-error i błąd odczytu stanu): wstawka na początku Bkz_scalKoniec (faza Kosza,
// po zapisie wersji w Le), na początku Le albo na początku Bev_stanEcha (odczyt stanu kandydatów) rzuca raz fikcyjny błąd
// z pola okna — prawdziwą drogą zajęta blokada karty w fazie Kosza wymaga limitu blokady; strażnik osiągalności: Le
// ponownie rzuca vildaMergeBusy i VISIT_IDENTITY_CONFLICT z fazy Kosza.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKRYPTY_PUNKTU, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';
import { ZRODLO_SEJFU, bezOdsylania, licznikEmisji } from '../support/sejf-bez-wstawek.mjs';
import { POLA_ZAWSZE, odcisk } from '../support/licznik-odsylania.mjs';

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
