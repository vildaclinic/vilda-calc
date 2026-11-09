// P-DZIENNIK-ZDARZEN (E2-PR2a, E2-PR2b1, E2-PR2b2, E2-PR3a1, E2-PR3a1b, E2-PR3a2, E2-PR3a3, E2-PR3a4) — strażniki uśpienia bloku
// dziennika zdarzeń w vilda_vault.js:
// kod produkcyjny woła nowe funkcje wyłącznie z listy miejsc (literał MIEJSCA_POZA_BLOKIEM); bez bramki działają
// sprzątanie po koncie, część Bev_ oraz kasowanie bazy (deleteDatabase) i podsumowanie wyniku (resultSummary) z części
// Bob_, a reszta kończy się na bramce: bez otwarcia bazy kolejki, szyfrowania i żądań. Sprzątanie po koncie: kasowanie
// kolejki w removeUser i ponowienie przy odblokowaniu działają przy każdym stanie bramki (w trybie „Zaloguj
// jednorazowo” nie sięgają do IndexedDB, localStorage ani Web Locks), a przy zamkniętej bramce kończą się na
// liście baz (databases(); bez listy — na deleteDatabase nieistniejącej bazy, bez otwarcia) i nie zostawiają klucza;
// znacznik ponowienia zostaje wtedy tylko po nieudanym albo niedokończonym kasowaniu (np. błąd deleteDatabase
// w przeglądarce bez listy baz; limit blokady konta wymaga trwającego ponowienia, czyli wcześniejszego znacznika)
// — do udanego ponowienia przy odblokowaniu poza trybem „Zaloguj jednorazowo”. Eksport tylko pod VildaVault._eventLog
// (nikt go nie używa), blok nie ma skutków ubocznych przy ładowaniu, część Bev_ (koperty, buildery, szyfrowanie,
// zastosowanie) nie zawiera wywołań zapisu, emisji, sieci ani magazynów przeglądarki, a część magazynu kolejki
// i kwarantanny (Bob_, poniżej znacznika magazynu) sięga do okna wyłącznie przez nazwane pola w nazwanych funkcjach
// i poza wymienionymi wyżej działa tylko za bramką (pole okna VILDA_EVENT_LOG === true).
// E2-PR3a2: część emisji (Bem_, poniżej znacznika emisji) — emitery hooków sejfu i miejsca zapisu bez haka dopisują
// zmiany do kolejki, a kroki operacji złożonych porządkują je w obrębie karty przeglądarki. Przy zamkniętej bramce
// każda emisja to jeden odczyt pola bramki i nic więcej (bez otwarcia bazy kolejki, szyfrowania zdarzeń, blokad, kluczy
// i żądań); hak, który niczego nie oznacza, i kroki nie czytają bramki; emissionsSettled działa bez bramki.
// E2-PR3a3: importy (import karty z pliku — ns, scalanie kopii konta — ss, odtworzenie konta z kopii — as) są krokiem
// i emitują partią wersje zapisane przez import i encje sekcji pliku (Bem_sekcje); znak końca partii (Bem_partia) to wpis
// do zbioru w pamięci, a słuchacze onBulkChange (klucz _eventLog, 37 kluczy) są wołani po ostatnim dopisaniu partii.
// Przy zamkniętej bramce każda emisja importu to jeden odczyt pola bramki, partia nie trafia do łańcucha i słuchacze nie
// są wołani; rejestracja słuchacza działa bez bramki, pól okna i magazynów.
// E2-PR3a4: przegląd kolejki. Dwie wstawki poza blokiem: Bem_przeglad(true) — pierwsza instrukcja odblokowania (He, przed
// słuchaczami odblokowania; Bob_poOdblokowaniu zostaje po go()) i Bem_zChmury(t) — w scalaniu (Le) tuż po sprawdzeniu
// kształtu ładunku (31 wpisów literału miejsc, 45 wywołań Bem_). Przy zamkniętej bramce każda z nich to jeden odczyt pola
// bramki i nic więcej, a scalanie w otwartym kroku importu bramki nie czyta (warunek kroku przed bramką); przegląd kolejki
// z eksportu (sweepOutbox, 38 kluczy) jest chroniony bramką. Silnik przeglądu (Bob_przeglad: znacznik przeglądu i pamięć
// par w bazie kolejki, przegląd sierot) leży w części Bob_ i jako jedyny poza enqueue woła Bob_dopiszZ; część Bem_
// (wyzwalacze, krok łańcucha, pary scalania, przegląd pilny) nie ma zegara ani pól okna; pary z ładunku scalania
// (Bev_pary) to funkcja czysta części Bev_.
// Testy źródła (vilda_vault.js, pliki produktu z git ls-files) i eksportu (prawdziwy sejf w oknie uprzęży, dane wyłącznie
// fikcyjne).
//
//   U1    bramka: gateOpen() fałszywe dla każdej wartości pola poza true (także getter rzucający); każda chroniona
//         operacja magazynu — kolejki i kwarantanny (pętla po kluczach eksportu minus jawna lista niechronionych; nowy
//         klucz bez argumentów albo bez bramki = czerwony test; lista chronionych sprawdzana osobno) → { ok: false,
//         powod: 'bramka' } bez odczytu window.indexedDB, localStorage i crypto (gettery liczące) i bez wywołań magazynu
//         sejfu; na adapterze IndexedDB nad atrapą — bez wpisów vilda_sync_* w jej dzienniku i bez klucza urządzenia;
//         zablokowany sejf przy zamkniętej bramce → bramka. resultSummary (niechronione, czysta funkcja) przy zamkniętej
//         bramce i zablokowanym sejfie daje pełne podsumowanie synchronicznie, bez odczytu pól okna (także
//         VILDA_EVENT_LOG), bez zegara i bez wywołań magazynu sejfu. emissionsSettled (niechronione, E2-PR3a2) po zapisach
//         przy zamkniętej bramce i przy zablokowanym sejfie: obietnica rozstrzygnięta wartością undefined, bez odczytu pól
//         okna (także VILDA_EVENT_LOG), bez zegara i bez wywołań magazynu sejfu. onBulkChange (niechronione, E2-PR3a3)
//         z funkcją i bez (brak argumentu, liczba, obiekt) przy zamkniętej bramce i przy zablokowanym sejfie:
//         synchronicznie undefined, bez odczytu pól okna, bez zegara, bez wywołań magazynu sejfu i bez wywołania słuchacza.
//         sweepOutbox (E2-PR3a4, chronione, bez argumentów) przy zamkniętej bramce i przy zablokowanym sejfie: obietnica
//         { ok: false, powod: 'bramka' }, jeden odczyt pola bramki, bez odczytu indexedDB, localStorage i crypto, bez zegara
//         i bez wywołań magazynu sejfu.
//   U2(a) identyfikatory Bev_, Bob_ i Bem_ leżą między znacznikami bloku (każdy znacznik dokładnie raz) poza literałem
//         miejsc: `_eventLog:Bev_EKSPORT` oraz wywołania z MIEJSCA_POZA_BLOKIEM (funkcja otaczająca → nazwa → liczba;
//         wyrażenie funkcyjne jako „<najbliższa deklaracja>/(funkcja zagnieżdżona)”; drzewo składni: każde wywołanie
//         instrukcją wyrażeniową albo elementem wyrażenia przecinkowego bez użycia wyniku;
//         Bob_poKasowaniuSejfu wyłącznie w Buk_obce bloku P-USUN-KONTO-KARTY, w bloku try,
//         poza wyjątkami form: `await Bob_kasujKonto(t)` w xa, `const PatientCheckpointSyncMark=Bob_oznacz(userId)`
//         w PatientCheckpointRemoveUser z wynikiem wyłącznie jako argument Bob_odznacz w bloku catch; w xa kolejność
//         usunięcie wpisu rejestru → Bob_poRejestrze → blokada sejfu → await Bob_kasujKonto; w He Bob_poOdblokowaniu po
//         go()). E2-PR3a2: Bem_hak raz w każdym z 7 emiterów (Vn, ws, qr, Qr, jn, Yn, Qe2) w instrukcji ciała emitera,
//         z nazwą jego hooka i pierwszym parametrem, przed pierwszym …forEach( słuchaczy; Bem_zmiana raz w każdym z 8
//         miejsc zapisu bez haka (Ps, Aj, Bnp_poZapisie, Bsc_podBlokada, Bkz_poImporcie, Bkz_przywrocWSesji i wyrażenia
//         funkcyjne w Bkz_doKosza i Bkz_przytnij), bez await i bez użycia wyniku; kroki w 6 operacjach (Bsc0, $a,
//         Bpu_usun, Ad, Bkz_doKosza, qa): Bem_krokStart() — instrukcja tuż przed try, którego finally ma jedyną
//         instrukcję Bem_krokKoniec(); samokontrola wariantami zła. `_eventLog` dokładnie raz w pliku; zero `._eventLog`
//         i `VildaVault._eventLog`; blok stoi między Bsl_usunPacjenta a `function yr(`. Znacznik magazynu kolejki
//         dokładnie raz, za literałem Bev_EKSPORT; w części Bev_ identyfikatory Bob_ wyłącznie w tym literale (17 kluczy
//         magazynu kolejki i kwarantanny) i jedno Bob_wKasowaniu w Bev_start (adapter sejfu strzeżony przy kasowaniu
//         konta). Znacznik emisji dokładnie raz, za częścią Bob_, przed znacznikiem końca (blok w trzech częściach);
//         w części Bev_ jedyne Bem_ to `emissionsSettled: Bem_gotowe` i (E2-PR3a3) `onBulkChange: Bem_naPartie`
//         w literale Bev_EKSPORT, w części Bob_ żadnego; w części Bob_ dochodzi Bob_dopiszZ (blokada współdzielona konta
//         przed Bob_dopiszPod; woła je enqueue i łańcuch dopisań części Bem_). E2-PR3a3: w importach (ns, ss, as) para
//         kroku, Bem_zmiana wersji zapisanych przez import (ns 1 i ss 2 w wyrażeniach funkcyjnych, as 1), Bem_sekcje
//         i Bem_partia — 5 wpisów literału więcej (30 wpisów, 43 wywołania Bem_); Bem_zmiana, Bem_sekcje i Bem_partia
//         importu w bloku try kroku, Bem_sekcje i Bem_partia w samej funkcji importu, Bem_partia z literałem nazwy metody
//         API tej funkcji, w as krok w bloku try, którego finally woła He(); samokontrola wariantami zła. E2-PR3a4:
//         Bem_przeglad(true) — pierwsza instrukcja ciała He, jedyny argument to literał true, wynik nieużyty, przed pierwszym
//         $n.forEach( (słuchacze odblokowania); Bem_zChmury(t) — instrukcja ciała Le tuż po `if(!t||typeof t!="object")
//         throw …`, jedyny argument to pierwszy parametr Le (2 wpisy literału więcej: 31 wpisów, 45 wywołań Bem_);
//         w literale Bev_EKSPORT dochodzi `sweepOutbox: Bem_przegladTeraz`, a Bob_dopiszZ woła też silnik przeglądu
//         (Bob_przeglad); samokontrola wariantami zła.
//   U2(b) żaden plik produktu poza vilda_vault.js (git ls-files *.js *.mjs *.cjs *.html *.htm bez tests/ i docs/) nie
//         zawiera `_eventLog`, applyEncryptedEvent, encryptEvent, nazw 14 builderów, nazw API magazynu (gateOpen,
//         outbox…), emissionsSettled, onBulkChange (E2-PR3a3), sweepOutbox (E2-PR3a4), VILDA_EVENT_LOG, klucza
//         urządzenia, nazwy bazy kolejki (vilda_sync_ poza vilda_sync_integration.js), Bev_, Bob_ ani Bem_ (bez nazw
//         ogólnych: enqueue, eventBytes, kinds, deleteDatabase — istnieją w innych plikach).
//   U2(c) część Bev_: lista zakazana (zapis, emisja, sieć, magazyny przeglądarki, legacy buildery delt, eksport
//         ładunku, console.), także w komentarzach; część Bob_: własna lista tekstowa i reguła domknięcia na drzewie
//         składni (acorn + eslint-scope): wolne identyfikatory wyłącznie z listy, pola okna tylko w swoich funkcjach,
//         Date tylko w funkcjach chwili, zakaz dostępu przez nawias do v, Date, Object, Reflect, liczności wywołań
//         kasowania, listy baz i rejestru. Funkcje eksportu kwarantanny i podsumowania wyniku są deklaracjami
//         najwyższego poziomu części Bob_ (obejmują je obie reguły); navigator tylko w Bob_blokady (lista tekstowa na części
//         bez tej funkcji), AbortController tylko w Bob_podBlokada, localStorage tylko w funkcjach identyfikatora
//         urządzenia, znacznika ponowienia, ponowienia i kasowania konta; żądanie blokady tylko w Bob_podBlokada;
//         liczności kasowania (deleteDatabase w Bob_kasujBaze), listy baz (Bob_istnieje, Bob_kasujKonto) i rejestru
//         (Bob_konto, Bob_poOdblokowaniu); podsumowanie wyniku jest czyste: synchroniczne,
//         a w domknięciu wywołań (funkcje i stałe bloku osiągalne z niej) wolne identyfikatory tylko z listy czystych
//         (bez okna, stanu logowania, sejfu, rejestru, zegara, losowości) — z samokontrolą. Część Bem_ (E2-PR3a2):
//         reguła domknięcia — wolne identyfikatory wyłącznie z listy (funkcje bramki, trybu, IndexedDB, wejścia,
//         argumentów i dopisania z części Bob_, T, sesja, Promise, Array, Object, String, Map, Set, undefined), bez v,
//         Date, setTimeout, localStorage, indexedDB, navigator, fetch i console w żadnym miejscu drzewa; Bob_bramka raz,
//         jako pierwsza instrukcja Bem_zmiana (`if (!Bob_bramka()) return;`, potem jedno try z catch); Bob_wejscie
//         i Bob_dopiszZ wyłącznie w Bem_dopisz (async, jedno try z catch); emisja i kroki synchroniczne; Bem_zHaka czysta
//         jak podsumowanie wyniku — z samokontrolą. E2-PR3a3: lista wolnych identyfikatorów bez zmian; synchroniczne także
//         Bem_sekcje, Bem_partia, Bem_naPartie i Bem_powiadom; Bem_partia, Bem_naPartie i Bem_powiadom czyste (bez
//         bramki, emisji i części Bob_ w domknięciu), Bem_sekcje sięga poza siebie tylko do Bem_SEKCJE i Bem_zmiana.
//         E2-PR3a4: w części Bob_ Date także w cofnięciu chwili (Bob_cofnij), w odczycie chwili ostatniej wysyłki
//         (Bob_wysylka) wyłącznie Date.parse(…) i localStorage; przegląd sierot (Bob_sieroty) — jedna lista baz i jeden
//         odczyt rejestru przez I(). W części Bem_ wolne identyfikatory także Bob_przeglad, Bob_przegladProg,
//         Bob_przegladNalezny i Bev_pary; Bob_bramka po jednym razie: pierwsza instrukcja Bem_zmiana i Bem_przeglad
//         (odmowa — Promise.resolve z literałem), w Bem_zChmury pierwsza po warunku otwartego kroku; po bramce jedno try
//         z catch, Bem_poBezczynnosci — jedno try z catch; Bob_wejscie i Bob_dopiszZ nadal tylko w Bem_dopisz;
//         synchroniczne także Bem_zChmury, Bem_przeglad, Bem_przegladTeraz, Bem_poBezczynnosci i Bem_kolejka. Bev_pary
//         czysta (w domknięciu poza listą czystych tylko Bkz_ostatnie), a Bkz_ostatnie i Bkz_pozniejsza w całym pliku
//         sięgają tylko do parametrów, arguments, zmiennych lokalnych i literałów.
//   U2(d) najwyższy poziom bloku (AST): w części Bev_ nazwy ^Bev_, w części Bob_ ^Bob_, w części Bem_ ^Bem_ (z nazwami
//         wiążącymi części emisji); wyłącznie deklaracje function / async function oraz const z literałem,
//         Object.freeze(…) albo new Map() / new Set(); argumenty Object.freeze tylko z literałów, tablic, obiektów (bez
//         kluczy obliczanych i rozwinięć), identyfikatorów, wyrażeń funkcyjnych i zagnieżdżonego Object.freeze — bez
//         odczytów przy ładowaniu.
//   U2(e) eksport _eventLog zamrożony; klucze = dokładnie lista (38: 18 z E2-PR2a, 11 kluczy magazynu kolejki z E2-PR2b1,
//         6 kluczy kwarantanny i podsumowania wyniku z E2-PR2b2, emissionsSettled z E2-PR3a2, onBulkChange z E2-PR3a3
//         i sweepOutbox z E2-PR3a4).
//   U4    krótki scenariusz sejfu na adapterze IndexedDB nad atrapą przy zamkniętej bramce (każda istniejąca operacja
//         magazynu, także kwarantanny): databases() bez vilda_sync_*, brak klucza o przedrostku vilda-sync-device-v1.
//   U4′   zwykłe użycie z usunięciem konta przy zamkniętej bramce (sejf jak w przeglądarce, moduły punktu
//         odzyskiwania), z navigator.locks i bez: 0 baz vilda_sync_*, 0 kluczy i 0 zapisów vilda-sync-* w localStorage,
//         odczyty pola bramki = liczba emisji scenariusza (literał EMISJE_U4).
//   U5    (E2-PR3a2) klucz dostępu (WebAuthn: rejestracja zwykła i „roaming” z atrapą VildaCrypto, logowanie, usunięcie)
//         i hak VildaPersistence.onPreferenceWrite (klucz cloud-synced, sejf odblokowany i zablokowany) przy zamkniętej
//         bramce: odczyty pola bramki = liczba emisji na krok, 0 wpisów vilda_sync_* atrapy, 0 kluczy vilda-sync-*,
//         0 blokad vilda-sync*, operacje crypto.subtle i żądania sieci jak na sejfie bez wstawek emisji (kopia źródła
//         z wywołaniami Bem_ spoza bloku zastąpionymi przez void 0 — liczba z literału miejsc, od E2-PR3a4 45 wstawek;
//         logowanie kluczem dostępu przez uprząż przy zamkniętej bramce, bez przeglądu kolejki; jedyne żądanie to wysyłka
//         koperty klucza „roaming”), 0 sendBeacon i XMLHttpRequest.
// Każdy przypadek, który tnie blok na części, zaczyna od sprawdzenia, że znacznik magazynu jest dokładnie raz (przypadki
// części Bem_ — także znacznik emisji).
// Czerwone na sejfie bez kasowania konta (E2-PR2b2): literał miejsc poza blokiem U2(a) (tekst i drzewo składni), Bob_wKasowaniu
// w części Bev_, liczności reguły domknięcia części Bob_ (navigator, AbortController, żądanie blokady, kasowanie, lista
// baz, rejestr).
// Czerwone na bazie (sejf sprzed E2-PR3a2; 14 przypadków): U1 listy kluczy chronionych i niechronionych (bez
// emissionsSettled) i U1 emissionsSettled, U2(a) literał miejsc (tekst i drzewo składni), znacznik emisji i trzy części,
// Bem_ w części Bev_, Bob_dopiszZ, U2(c) domknięcie części Bem_ i czystość Bem_zHaka, U2(d) części Bem_, U2(e) (36
// kluczy), U4′ ×2 (odczyty pola bramki 0 zamiast 4), U5; zielone z natury (strażniki regresji): pozostałe przypadki U1,
// U2(b), samokontrole wzorców, form i reguł, położenie bloku i znacznik magazynu, listy tekstowe i reguła domknięcia
// części Bob_, U2(d) części Bev_ i Bob_, U4.
// Czerwone na bazie E2-PR3a3 (sejf 422a9a7b — z częścią emisji, bez partii importu; 10 przypadków): U1 listy kluczy
// chronionych i niechronionych (bez onBulkChange) i U1 onBulkChange, U2(a) literał miejsc (tekst i drzewo składni) i Bem_
// w części Bev_ (bez onBulkChange: Bem_naPartie), U2(c) domknięcie części Bem_ (brak deklaracji Bem_sekcje, Bem_partia,
// Bem_naPartie, Bem_powiadom) i czystość funkcji partii, U2(d) części Bem_ (nazwy wiążące), U2(e) (37 kluczy), U5
// (27 wstawek zamiast 43); zielone z natury (strażniki regresji): pozostałe przypadki U1, U2(b), samokontrole form
// (także form importów — kod syntetyczny), wzorców i reguł, U4, U4′.
// Czerwone na bazie E2-PR3a4 (sejf 77b05e6f — bez przeglądu kolejki; 12 przypadków): U1 lista kluczy chronionych (bez
// sweepOutbox) i U1 sweepOutbox, U2(a) literał miejsc (tekst i drzewo składni), Bem_ w części Bev_ (bez sweepOutbox:
// Bem_przegladTeraz) i Bob_dopiszZ (bez Bob_przeglad), U2(c) domknięcie części Bob_ (liczności przeglądu sierot),
// domknięcie części Bem_ (brak deklaracji i odczytów bramki przeglądu) i czystość Bev_pary (brak deklaracji), U2(d)
// części Bem_ (nazwy wiążące), U2(e) (37 kluczy), U5 (43 wstawki zamiast 45); zielone z natury (strażniki regresji):
// pozostałe przypadki U1 (pętla po kluczach eksportu sejfu bazy), U2(b), samokontrole form (także form przeglądu
// kolejki — kod syntetyczny), wzorców i reguł, czystość Bkz_ostatnie i Bkz_pozniejsza, U4, U4′.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { magazynZRejestrem, naglowek, okno, wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';
import { PRZEDROSTEK_URZADZENIA, SKRYPTY_PUNKTU, ZNACZNIK_MAGAZYNU, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEJF = 'vilda_vault.js';
const ZRODLO = fs.readFileSync(path.join(KORZEN, SEJF), 'utf8');
const POCZATEK = '/* P-DZIENNIK-ZDARZEN: poczatek bloku */';
const KONIEC = '/* P-DZIENNIK-ZDARZEN: koniec bloku */';
const ZNACZNIK_EMISJI = '/* P-DZIENNIK-ZDARZEN: emisja */';
const BUILDERY = ['buildSnapshotEvent', 'buildPatientFullEvents', 'buildPatientTombstoneEvent', 'buildSnapshotTombstoneEvent',
  'buildPatientNoteEvent', 'buildPatientNoteTombstoneEvent', 'buildNoteEvent', 'buildNoteTombstoneEvent', 'buildPatientListEvent',
  'buildPatientListTombstoneEvent', 'buildPreferenceEvent', 'buildPasskeyEvent', 'buildPasskeyTombstoneEvent', 'buildCredentialEvent'];
// Klucze magazynu kolejki (E2-PR2b1) oraz kwarantanny i podsumowania wyniku (E2-PR2b2).
const KLUCZE_KWARANTANNY = ['quarantinePut', 'quarantineList', 'quarantineCount', 'quarantineMinSeq', 'quarantineRelease', 'resultSummary'];
const KLUCZE_MAGAZYNU = ['gateOpen', 'enqueue', 'outboxCount', 'outboxList', 'outboxTake', 'outboxAccept', 'outboxReject',
  'outboxFail', 'outboxRequeueStale', 'outboxDiscard', 'deleteDatabase', ...KLUCZE_KWARANTANNY];
// Fikcyjne argumenty operacji kwarantanny (slot: 64 znaki hex; wynik o kształcie unreadable z applyEncryptedEvent).
const SLOT = '1a2b3c4d'.repeat(8);
const ZMIANA = Object.freeze({ seq: 1, eid: '00000000-0000-4000-8000-000000000001', payload: { iv: 'Rmlrc3lqbmVJVjEy', data: 'AAAA' } });
const NIECZYTELNY = Object.freeze({ status: 'unreadable', reason: 'decrypt' });
// Klucz części emisji (E2-PR3a2): rozstrzygnięcie łańcuchów dopisań, bez bramki.
const KLUCZ_EMISJI = 'emissionsSettled';
// Klucz partii importu (E2-PR3a3): rejestracja słuchacza onBulkChange, bez bramki i pól okna.
const KLUCZ_PARTII = 'onBulkChange';
// Klucz przeglądu kolejki (E2-PR3a4): sweepOutbox — chroniony bramką (część Bem_, nie magazyn Bob_).
const KLUCZ_PRZEGLADU = 'sweepOutbox';
const KLUCZE_EKSPORTU = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent', ...KLUCZE_MAGAZYNU, KLUCZ_EMISJI, KLUCZ_PARTII,
  KLUCZ_PRZEGLADU];
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
const ile = (tekst, fragment) => tekst.split(fragment).length - 1;
const ID_BEV_BOB = /(?<![A-Za-z0-9_$])B(?:ev|ob|em)_[A-Za-z0-9_$]*/g;
// Wywołania części dziennika spoza bloku: funkcja otaczająca → nazwa → liczba. Sprzątanie po koncie w removeUser i ponowienie
// przy odblokowaniu (E2-PR3a1); emisja zmian (E2-PR3a2): emitery hooków sejfu (Bem_hak przed słuchaczami), miejsca zapisu bez
// haka (Bem_zmiana; w wyrażeniu funkcyjnym — „<najbliższa deklaracja>/(funkcja zagnieżdżona)”) i kroki operacji złożonych
// (Bem_krokStart tuż przed try, Bem_krokKoniec jako jedyna instrukcja jego finally). Importy partią (E2-PR3a3): import
// karty z pliku (ns), scalanie (ss) i odtworzenie kopii konta (as) są krokiem; w kroku wersje zapisane przez import
// (Bem_zmiana — w ns i ss w wyrażeniu funkcyjnym), sekcje pliku (Bem_sekcje) i znak końca partii (Bem_partia).
// Przegląd kolejki (E2-PR3a4): Bem_przeglad(true) — pierwsza instrukcja odblokowania (He, przed słuchaczami) i pary
// scalania z chmury Bem_zChmury(t) w Le tuż po sprawdzeniu kształtu ładunku (31 wpisów, 45 wywołań Bem_).
const MIEJSCA_POZA_BLOKIEM = Object.freeze({
  PatientCheckpointRemoveUser: { Bob_oznacz: 1, Bob_odznacz: 1 },
  Buk_obce: { Bob_poKasowaniuSejfu: 1 },
  xa: { Bob_poRejestrze: 2, Bob_kasujKonto: 2 },
  He: { Bob_poOdblokowaniu: 1, Bem_przeglad: 1 },
  Le: { Bem_zChmury: 1 },
  Vn: { Bem_hak: 1 },
  ws: { Bem_hak: 1 },
  qr: { Bem_hak: 1 },
  Qr: { Bem_hak: 1 },
  jn: { Bem_hak: 1 },
  Yn: { Bem_hak: 1 },
  Qe2: { Bem_hak: 1 },
  Ps: { Bem_zmiana: 1 },
  Aj: { Bem_zmiana: 1 },
  Bnp_poZapisie: { Bem_zmiana: 1 },
  Bsc_podBlokada: { Bem_zmiana: 1 },
  Bkz_poImporcie: { Bem_zmiana: 1 },
  Bkz_przywrocWSesji: { Bem_zmiana: 1 },
  'Bkz_doKosza/(funkcja zagnieżdżona)': { Bem_zmiana: 1 },
  'Bkz_przytnij/(funkcja zagnieżdżona)': { Bem_zmiana: 1 },
  Bsc0: { Bem_krokStart: 1, Bem_krokKoniec: 1 },
  $a: { Bem_krokStart: 1, Bem_krokKoniec: 1 },
  Bpu_usun: { Bem_krokStart: 1, Bem_krokKoniec: 1 },
  Ad: { Bem_krokStart: 1, Bem_krokKoniec: 1 },
  Bkz_doKosza: { Bem_krokStart: 1, Bem_krokKoniec: 1 },
  qa: { Bem_krokStart: 1, Bem_krokKoniec: 1 },
  ns: { Bem_krokStart: 1, Bem_krokKoniec: 1, Bem_sekcje: 1, Bem_partia: 1 },
  'ns/(funkcja zagnieżdżona)': { Bem_zmiana: 1 },
  ss: { Bem_krokStart: 1, Bem_krokKoniec: 1, Bem_sekcje: 1, Bem_partia: 1 },
  'ss/(funkcja zagnieżdżona)': { Bem_zmiana: 2 },
  as: { Bem_krokStart: 1, Bem_krokKoniec: 1, Bem_zmiana: 1, Bem_sekcje: 1, Bem_partia: 1 },
});
// Importy partią (E2-PR3a3): funkcja → nazwa metody API, którą podaje jedyny argument Bem_partia (literał napisu).
// W `as` (odtworzenie konta z kopii) krok leży w bloku try, którego finally woła He() (słuchacze odblokowania) — wpisy
// partii idą do łańcucha, zanim ruszą słuchacze odblokowania.
const IMPORTY = Object.freeze({ ns: 'importPatientFromEnvelope', ss: 'mergeVaultBackup', as: 'restoreVaultBackup' });
// Emitery hooków (E2-PR3a2): funkcja → nazwa hooka, którą podaje pierwszy argument Bem_hak (drugi — pierwszy parametr
// emitera, czyli ładunek bez zmian).
const EMITERY = Object.freeze({
  Vn: 'onPatientSaved', ws: 'onPatientDeleted', qr: 'onPatientNoteChanged', Qr: 'onNoteChanged', jn: 'onPatientListChanged',
  Yn: 'onPasskeyChanged', Qe2: 'onCredentialChanged',
});
// Porównanie list miejsc (funkcja → nazwa → liczba) bez względu na kolejność kluczy.
const uporzadkuj = (x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, uporzadkuj(x[k])])) : x);
const takieSame = (x, y) => JSON.stringify(uporzadkuj(x)) === JSON.stringify(uporzadkuj(y));
const ID_BOB = /(?<![A-Za-z0-9_$])Bob_[A-Za-z0-9_$]*/g;

function blok() {
  const a = ZRODLO.indexOf(POCZATEK);
  const z = ZRODLO.indexOf(KONIEC);
  if (a < 0 || z < a) throw new Error('brak bloku P-DZIENNIK-ZDARZEN (znaczniki początku i końca)');
  return { a, z: z + KONIEC.length, tekst: ZRODLO.slice(a, z + KONIEC.length) };
}
// Część Bev_ = od znacznika początku do znacznika magazynu (bez niego); część Bob_ = od znacznika magazynu (bez niego) do
// znacznika emisji (bez niego); część Bem_ (E2-PR3a2) = od znacznika emisji (bez niego) do znacznika końca (bez niego).
// Pozycje względem całego pliku. Bez znacznika emisji część Bob_ sięga do znacznika końca, a część Bem_ jest pusta (znacznik
// sprawdza osobny przypadek); znacznik emisji więcej niż raz albo poza miejscem za częścią Bob_ — błąd.
function czesci() {
  const { a, z } = blok();
  const i = ZRODLO.indexOf(ZNACZNIK_MAGAZYNU);
  if (ile(ZRODLO, ZNACZNIK_MAGAZYNU) !== 1 || i < a || i > z) throw new Error('brak znacznika magazynu kolejki w bloku');
  const zBob = i + ZNACZNIK_MAGAZYNU.length;
  const zKonca = z - KONIEC.length;
  const e = ZRODLO.indexOf(ZNACZNIK_EMISJI);
  const emisje = ile(ZRODLO, ZNACZNIK_EMISJI);
  if (emisje > 1 || (emisje === 1 && (e < zBob || e + ZNACZNIK_EMISJI.length > zKonca))) {
    throw new Error('znacznik emisji więcej niż raz albo poza miejscem między częścią Bob_ a znacznikiem końca');
  }
  const kBob = emisje ? e : zKonca;
  const zBem = emisje ? e + ZNACZNIK_EMISJI.length : zKonca;
  return { a, z, i, e: emisje ? e : -1, bev: ZRODLO.slice(a, i), bob: ZRODLO.slice(zBob, kBob), bem: ZRODLO.slice(zBem, zKonca), odBob: zBob, odBem: zBem };
}
// Literał Object.freeze({ … }) obiektu Bev_EKSPORT (pozycje w pliku).
function literalEksportu() {
  const start = ZRODLO.indexOf('const Bev_EKSPORT = Object.freeze(');
  if (start < 0) throw new Error('brak const Bev_EKSPORT = Object.freeze(');
  let g = 0;
  for (let k = ZRODLO.indexOf('(', start); k < ZRODLO.length; k += 1) {
    if (ZRODLO[k] === '(') g += 1;
    else if (ZRODLO[k] === ')') { g -= 1; if (!g) return { start, koniec: k + 1, tekst: ZRODLO.slice(start, k + 1) }; }
  }
  throw new Error('nie domknięto literału Bev_EKSPORT');
}
const znacznikRaz = () => expect(ile(ZRODLO, ZNACZNIK_MAGAZYNU), 'znacznik magazynu kolejki dokładnie raz').toBe(1);
const znacznikEmisjiRaz = () => {
  znacznikRaz();
  expect(ile(ZRODLO, ZNACZNIK_EMISJI), 'znacznik emisji dokładnie raz').toBe(1);
};
// Wywołania części dziennika w kodzie spoza bloku (blok zastąpiony spacjami): { miejsca: funkcja → nazwa → liczba, bledy }.
// Forma domyślna: instrukcja wyrażeniowa albo element wyrażenia przecinkowego, który nie jest ostatni (wynik nieużyty).
// Wyjątki: `await Bob_kasujKonto(…)` w xa (element wyrażenia przecinkowego, nie ostatni);
// `const PatientCheckpointSyncMark = Bob_oznacz(…)` w PatientCheckpointRemoveUser, a ta stała wyłącznie jako drugi argument
// Bob_odznacz w bloku catch. Kolejność: w xa (w każdym wyrażeniu przecinkowym z kasowaniem kolejki) usunięcie wpisu
// rejestru → Bob_poRejestrze → [blokada sejfu kn] → await Bob_kasujKonto; w He Bob_poOdblokowaniu po go().
// Emisja (E2-PR3a2): Bem_hak i Bem_zmiana w formie domyślnej; Bem_hak w ciele emitera z EMITERY (instrukcja albo element
// wyrażenia przecinkowego w instrukcji ciała), z argumentami (nazwa hooka emitera, pierwszy parametr emitera), przed
// pierwszym …forEach( słuchaczy; Bem_krokStart() — instrukcja tuż przed try tego samego bloku, a jego finally ma jedyną
// instrukcję Bem_krokKoniec(); Bem_krokKoniec() wyłącznie w takim finally. Funkcja otaczająca wyrażenia funkcyjnego:
// „<najbliższa deklaracja>/(funkcja zagnieżdżona)”. Importy partią (E2-PR3a3, literał IMPORTY): Bem_zmiana, Bem_sekcje
// i Bem_partia w funkcji importu leżą w bloku try jej kroku; Bem_sekcje i Bem_partia w formie domyślnej, w samej funkcji
// importu (nie w zagnieżdżonej), Bem_partia z jedynym argumentem — literałem nazwy metody API; w `as` instrukcja
// Bem_krokStart() leży w bloku try, którego finally woła He(). Przegląd kolejki (E2-PR3a4): Bem_przeglad(true) — pierwsza
// instrukcja ciała He, jedyny argument to literał true, wynik nieużyty, przed pierwszym $n.forEach( (słuchacze
// odblokowania); Bem_zChmury(t) — instrukcja ciała Le tuż po `if(!t||typeof t!="object")throw …`, jedyny argument to
// pierwszy parametr Le.
function miejscaPozaBlokiem(zrodlo) {
  const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script' });
  const rodzic = new Map();
  const idz = (n, p) => {
    if (!n || typeof n.type !== 'string') return;
    rodzic.set(n, p);
    for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => idz(y, n)); else if (x && typeof x.type === 'string') idz(x, n); }
  };
  idz(ast, null);
  const FUNKCJE = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];
  const funkcja = (n) => { let p = rodzic.get(n); while (p && !FUNKCJE.includes(p.type)) p = rodzic.get(p); return p; };
  const deklaracja = (n) => { let p = rodzic.get(n); while (p && p.type !== 'FunctionDeclaration') p = rodzic.get(p); return p; };
  const nazwaFunkcji = (f) => {
    if (f && f.type === 'FunctionDeclaration' && f.id) return f.id.name;
    if (!f) return '(najwyższy poziom)';
    const d = deklaracja(f);
    return `${d && d.id ? d.id.name : '(najwyższy poziom)'}/(funkcja zagnieżdżona)`;
  };
  // Instrukcja z tym samym rodzicem tuż przed st (blok, ciało funkcji albo program) albo null.
  const poprzednia = (st) => { const b = rodzic.get(st); const lista = b && Array.isArray(b.body) ? b.body : null; const i = lista ? lista.indexOf(st) : -1; return i > 0 ? lista[i - 1] : null; };
  const nastepna = (st) => { const b = rodzic.get(st); const lista = b && Array.isArray(b.body) ? b.body : null; const i = lista ? lista.indexOf(st) : -1; return i >= 0 && i + 1 < lista.length ? lista[i + 1] : null; };
  const instrukcjaWywolania = (st, nazwa) => !!st && st.type === 'ExpressionStatement' && wywolanie(st.expression, nazwa) && !st.expression.arguments.length;
  const finallyZKoncem = (tr) => !!tr && tr.type === 'TryStatement' && !!tr.finalizer && tr.finalizer.body.length === 1 && instrukcjaWywolania(tr.finalizer.body[0], 'Bem_krokKoniec');
  const zawiera = (n, test) => {
    let jest = false;
    const szukaj = (x) => { if (jest || !x || typeof x.type !== 'string') return; if (test(x)) { jest = true; return; } for (const k of Object.keys(x)) { const y = x[k]; if (Array.isArray(y)) y.forEach(szukaj); else if (y && typeof y.type === 'string') szukaj(y); } };
    szukaj(n);
    return jest;
  };
  // Węzeł n leży w bloku try kroku (try tuż po instrukcji Bem_krokStart()) w obrębie deklaracji d.
  const wKroku = (n, d) => {
    let c = n;
    let w = rodzic.get(c);
    while (w && w !== d) {
      if (w.type === 'TryStatement' && w.block === c && instrukcjaWywolania(poprzednia(w), 'Bem_krokStart')) return true;
      c = w;
      w = rodzic.get(w);
    }
    return false;
  };
  const wywolanie = (x, nazwa) => x.type === 'CallExpression' && x.callee.type === 'Identifier' && x.callee.name === nazwa;
  const metoda = (x, nazwa) => x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && !x.callee.computed && x.callee.property.name === nazwa;
  // Sprawdzenie kształtu ładunku scalania: `if(!t||typeof t!="object")throw …` (t — pierwszy parametr Le), bez else.
  const nazwany = (x, n) => !!x && x.type === 'Identifier' && x.name === n;
  const sprawdzenieLadunku = (st, n) => !!st && !!n && st.type === 'IfStatement' && !st.alternate && st.consequent.type === 'ThrowStatement'
    && st.test.type === 'LogicalExpression' && st.test.operator === '||'
    && st.test.left.type === 'UnaryExpression' && st.test.left.operator === '!' && nazwany(st.test.left.argument, n)
    && st.test.right.type === 'BinaryExpression' && ['!=', '!=='].includes(st.test.right.operator)
    && st.test.right.left.type === 'UnaryExpression' && st.test.right.left.operator === 'typeof' && nazwany(st.test.right.left.argument, n)
    && st.test.right.right.type === 'Literal' && st.test.right.right.value === 'object';
  const miejsca = {};
  const bledy = [];
  const wezly = [];
  const zbierz = (n) => { if (!n || typeof n.type !== 'string') return; wezly.push(n); for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(zbierz); else if (x && typeof x.type === 'string') zbierz(x); } };
  zbierz(ast);
  for (const id of wezly) {
    if (id.type !== 'Identifier' || !/^B(?:ev|ob|em)_/.test(id.name)) continue;
    const p = rodzic.get(id);
    if (p.type === 'MemberExpression' && p.property === id && !p.computed) continue;
    if (p.type === 'Property' && p.key === id && !p.computed) continue;
    if (id.name === 'Bev_EKSPORT' && p.type === 'Property' && p.value === id && !p.computed && p.key.name === '_eventLog') continue;
    const f = funkcja(id);
    const fn = nazwaFunkcji(f);
    const gdzie = `${id.name} w ${fn}`;
    miejsca[fn] = miejsca[fn] || {};
    miejsca[fn][id.name] = (miejsca[fn][id.name] || 0) + 1;
    if (!(p.type === 'CallExpression' && p.callee === id)) { bledy.push(`${gdzie}: odwołanie bez wywołania`); continue; }
    const wyzej = rodzic.get(p);
    const nieOstatni = (seq, el) => seq && seq.type === 'SequenceExpression' && seq.expressions.indexOf(el) >= 0 && seq.expressions.indexOf(el) < seq.expressions.length - 1;
    if (id.name === 'Bob_kasujKonto' && fn === 'xa') {
      if (!(wyzej.type === 'AwaitExpression' && nieOstatni(rodzic.get(wyzej), wyzej))) bledy.push(`${gdzie}: forma inna niż await jako element wyrażenia przecinkowego`);
      continue;
    }
    if (id.name === 'Bob_oznacz' && fn === 'PatientCheckpointRemoveUser') {
      const dekl = rodzic.get(wyzej);
      if (!(wyzej.type === 'VariableDeclarator' && wyzej.id.name === 'PatientCheckpointSyncMark' && dekl.kind === 'const')) { bledy.push(`${gdzie}: forma inna niż const PatientCheckpointSyncMark = Bob_oznacz(…)`); continue; }
      const uzycia = wezly.filter((x) => x.type === 'Identifier' && x.name === 'PatientCheckpointSyncMark' && x !== wyzej.id && funkcja(x) === f);
      const poprawne = uzycia.filter((x) => { const c = rodzic.get(x); return wywolanie(c, 'Bob_odznacz') && c.arguments[1] === x; });
      if (uzycia.length !== 1 || poprawne.length !== 1) bledy.push(`${gdzie}: wynik użyty poza jednym argumentem Bob_odznacz (${uzycia.length} użyć)`);
      continue;
    }
    if (!(wyzej.type === 'ExpressionStatement' || nieOstatni(wyzej, p))) { bledy.push(`${gdzie}: wynik użyty (${wyzej.type})`); continue; }
    // Importy partią (E2-PR3a3): emisje w funkcjach importu (także w ich wyrażeniach funkcyjnych) i znak końca partii leżą
    // w bloku try kroku; Bem_sekcje i Bem_partia tylko w samej funkcji importu (nie w zagnieżdżonej), Bem_partia z jednym
    // argumentem — literałem nazwy metody API tej funkcji; w `as` krok w bloku try, którego finally woła He().
    const fImp = f && f.type === 'FunctionDeclaration' ? f : deklaracja(id);
    const imp = fImp && fImp.id && Object.hasOwn(IMPORTY, fImp.id.name) ? fImp.id.name : null;
    if (imp && ['Bem_zmiana', 'Bem_sekcje', 'Bem_partia'].includes(id.name) && !wKroku(p, fImp)) bledy.push(`${gdzie}: poza blokiem try kroku importu`);
    if ((id.name === 'Bem_sekcje' || id.name === 'Bem_partia') && (!imp || f !== fImp)) bledy.push(`${gdzie}: poza funkcją importu (${Object.keys(IMPORTY).join(', ')}) albo w funkcji zagnieżdżonej`);
    if (id.name === 'Bem_partia' && imp) {
      const a0 = p.arguments[0];
      if (p.arguments.length !== 1 || a0.type !== 'Literal' || a0.value !== IMPORTY[imp]) bledy.push(`${gdzie}: argument inny niż '${IMPORTY[imp]}'`);
    }
    if (id.name === 'Bem_krokStart' && imp === 'as') {
      const blokTry = wyzej.type === 'ExpressionStatement' ? rodzic.get(wyzej) : null;
      const tr = blokTry ? rodzic.get(blokTry) : null;
      if (!(tr && tr.type === 'TryStatement' && tr.block === blokTry && tr.finalizer && zawiera(tr.finalizer, (x) => wywolanie(x, 'He')))) {
        bledy.push(`${gdzie}: krok odtworzenia konta poza blokiem try, którego finally woła He()`);
      }
    }
    if (id.name === 'Bem_hak') {
      const hak = Object.hasOwn(EMITERY, fn) ? EMITERY[fn] : null;
      const [nazwaHaka, ladunek] = p.arguments;
      const parametr = f && f.params[0] && f.params[0].type === 'Identifier' ? f.params[0].name : null;
      if (!hak || p.arguments.length !== 2 || nazwaHaka.type !== 'Literal' || nazwaHaka.value !== hak || ladunek.type !== 'Identifier' || ladunek.name !== parametr) {
        bledy.push(`${gdzie}: argumenty inne niż (${hak ? `'${hak}'` : 'hook emitera'}, pierwszy parametr emitera)`);
      }
      const st = wyzej.type === 'SequenceExpression' ? rodzic.get(wyzej) : wyzej;
      if (!(st.type === 'ExpressionStatement' && f && rodzic.get(st) === f.body)) bledy.push(`${gdzie}: nie w instrukcji ciała emitera`);
      const sluchacze = wezly.filter((x) => metoda(x, 'forEach') && funkcja(x) === f).map((x) => x.start);
      if (!sluchacze.length || p.end > Math.min(...sluchacze)) bledy.push(`${gdzie}: nie przed pierwszym …forEach( słuchaczy`);
    }
    if (id.name === 'Bem_krokStart') {
      const tr = wyzej.type === 'ExpressionStatement' ? nastepna(wyzej) : null;
      if (p.arguments.length || wyzej.type !== 'ExpressionStatement' || !finallyZKoncem(tr)) {
        bledy.push(`${gdzie}: nie instrukcja tuż przed try, którego finally ma jedyną instrukcję Bem_krokKoniec()`);
      }
    }
    if (id.name === 'Bem_krokKoniec') {
      const fin = wyzej.type === 'ExpressionStatement' ? rodzic.get(wyzej) : null;
      const tr = fin ? rodzic.get(fin) : null;
      if (p.arguments.length || !tr || tr.finalizer !== fin || !finallyZKoncem(tr) || !instrukcjaWywolania(poprzednia(tr), 'Bem_krokStart')) {
        bledy.push(`${gdzie}: poza finally (jedyna instrukcja) try poprzedzonego instrukcją Bem_krokStart()`);
      }
    }
    if (id.name === 'Bem_przeglad') {
      const a0 = p.arguments[0];
      if (fn !== 'He' || p.arguments.length !== 1 || a0.type !== 'Literal' || a0.value !== true) bledy.push(`${gdzie}: poza He albo argument inny niż jedyny literał true`);
      if (!(wyzej.type === 'ExpressionStatement' && f && f.body.body[0] === wyzej)) bledy.push(`${gdzie}: nie pierwsza instrukcja ciała funkcji`);
      const sluchacze = wezly.filter((x) => metoda(x, 'forEach') && x.callee.object.type === 'Identifier' && x.callee.object.name === '$n' && funkcja(x) === f).map((x) => x.start);
      if (!sluchacze.length || p.end > Math.min(...sluchacze)) bledy.push(`${gdzie}: nie przed pierwszym $n.forEach( słuchaczy odblokowania`);
    }
    if (id.name === 'Bem_zChmury') {
      const parametr = f && f.params[0] && f.params[0].type === 'Identifier' ? f.params[0].name : null;
      const a0 = p.arguments[0];
      if (fn !== 'Le' || p.arguments.length !== 1 || a0.type !== 'Identifier' || a0.name !== parametr) bledy.push(`${gdzie}: poza Le albo argument inny niż pierwszy parametr Le`);
      const przed = wyzej.type === 'ExpressionStatement' && f && rodzic.get(wyzej) === f.body ? poprzednia(wyzej) : null;
      if (!sprawdzenieLadunku(przed, parametr)) bledy.push(`${gdzie}: nie instrukcja ciała Le tuż po if(!t||typeof t!="object")throw …`);
    }
    if (id.name === 'Bob_odznacz') {
      let c = rodzic.get(p);
      while (c && c !== f && c.type !== 'CatchClause') c = rodzic.get(c);
      if (!c || c.type !== 'CatchClause') bledy.push(`${gdzie}: poza blokiem catch`);
    }
    if (id.name === 'Bob_poKasowaniuSejfu') {
      let c = wyzej;
      let w = rodzic.get(c);
      while (w && w !== f && !(w.type === 'TryStatement' && w.block === c)) { c = w; w = rodzic.get(w); }
      if (!w || w === f) bledy.push(`${gdzie}: poza blokiem try`);
    }
  }
  // Kolejność w xa: każde wyrażenie przecinkowe z Bob_poRejestrze ma kasowanie kolejki po nim i usunięcie wpisu rejestru przed nim.
  for (const seq of wezly.filter((x) => x.type === 'SequenceExpression' && x.expressions.some((e) => wywolanie(e, 'Bob_poRejestrze')))) {
    const el = seq.expressions;
    const i = (test) => el.findIndex((e) => zawiera(e, test));
    const rej = i((x) => metoda(x, 'removeRegistryEntry'));
    const po = el.findIndex((e) => wywolanie(e, 'Bob_poRejestrze'));
    const kas = el.findIndex((e) => e.type === 'AwaitExpression' && wywolanie(e.argument, 'Bob_kasujKonto'));
    const kn = i((x) => wywolanie(x, 'kn'));
    if (!(rej >= 0 && rej < po && po < kas)) bledy.push(`xa: kolejność usunięcie wpisu rejestru (${rej}) → Bob_poRejestrze (${po}) → await Bob_kasujKonto (${kas})`);
    if (kn >= 0 && !(po < kn && kn < kas)) bledy.push(`xa: blokada sejfu (${kn}) nie między Bob_poRejestrze (${po}) a await Bob_kasujKonto (${kas})`);
  }
  // He: Bob_poOdblokowaniu po go().
  for (const he of wezly.filter((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === 'He')) {
    const go = wezly.filter((x) => wywolanie(x, 'go') && funkcja(x) === he).map((x) => x.start);
    const po = wezly.filter((x) => wywolanie(x, 'Bob_poOdblokowaniu') && funkcja(x) === he).map((x) => x.start);
    if (po.length && !(go.length && po.every((x) => x > Math.max(...go)))) bledy.push('He: Bob_poOdblokowaniu przed go()');
  }
  return { miejsca, bledy };
}
// Sejf bez wstawek emisji (E2-PR3a2): kopia źródła, w której każde wywołanie Bem_* spoza bloku (drzewo składni, jak w U2(a))
// jest zastąpione przez `void 0`; blok i reszta kodu bez zmian. { zrodlo, wstawki } — wstawki: liczba zastąpionych wywołań.
function sejfBezWstawek() {
  const { a, z } = blok();
  const poza = ZRODLO.slice(0, a) + ' '.repeat(z - a) + ZRODLO.slice(z);
  const ast = parse(poza, { ecmaVersion: 'latest', sourceType: 'script' });
  const wywolania = [];
  const idz = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name.startsWith('Bem_')) wywolania.push(n);
    for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(idz); else if (x && typeof x.type === 'string') idz(x); }
  };
  idz(ast);
  let zrodlo = ZRODLO;
  for (const w of [...wywolania].sort((x, y) => y.start - x.start)) zrodlo = zrodlo.slice(0, w.start) + 'void 0' + zrodlo.slice(w.end);
  return { zrodlo, wstawki: wywolania.length };
}
function plikiProdukcyjne() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs', '*.html', '*.htm'], { cwd: KORZEN, encoding: 'utf8' })
    .split('\0')
    .filter((p) => p && !p.startsWith('tests/') && !p.startsWith('docs/') && p !== SEJF);
}

let eksport = null;
beforeAll(() => {
  const { win } = okno();
  eksport = win.VildaVault._eventLog;
});

describe('U1: bramka zamknięta — każda chroniona operacja magazynu kończy się na bramce', () => {
  // Klucze bez bramki: z E2-PR2a (nie dotykają magazynu kolejki), gateOpen i resultSummary (czyste), deleteDatabase
  // (sprzątanie po koncie), emissionsSettled (E2-PR3a2: rozstrzygnięcie łańcuchów dopisań, bez pól okna i magazynów)
  // oraz onBulkChange (E2-PR3a3: rejestracja słuchacza partii importu, bez pól okna i magazynów). Przegląd kolejki
  // sweepOutbox (E2-PR3a4) jest chroniony: bez argumentów, przy zamkniętej bramce odmowa bez odczytu innych pól okna.
  const NIECHRONIONE = ['kinds', ...BUILDERY, 'encryptEvent', 'eventBytes', 'applyEncryptedEvent', 'gateOpen', 'resultSummary', 'deleteDatabase', KLUCZ_EMISJI, KLUCZ_PARTII];
  const EID = '00000000-0000-4000-8000-000000000001';
  const ARGUMENTY = (k) => ({
    enqueue: ['snap', k], outboxCount: [], outboxList: [], outboxTake: [], outboxAccept: [[EID]],
    outboxReject: [[{ eid: EID, code: 'EVENT_REJECTED' }]], outboxFail: [[EID], { code: 'NETWORK' }], outboxRequeueStale: [],
    outboxDiscard: [[EID], { potwierdzone: true }],
    quarantinePut: [ZMIANA, NIECZYTELNY, { slotId: SLOT, appVersion: '1.1.459' }], quarantineList: [], quarantineCount: [],
    quarantineMinSeq: [{ slotId: SLOT }], quarantineRelease: [[1], { slotId: SLOT }],
    sweepOutbox: [],
  });
  const POLA = ['indexedDB', 'localStorage', 'crypto'];
  const makrozadania = async (n) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setImmediate(r); }); };
  const okna = [];
  beforeEach(() => { przechwycZadaniaWTle(); });
  afterEach(() => {
    for (const o of okna.splice(0)) { if (o.krypto) o.krypto.rozbroj(); o.timery.wyczysc(); }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  // Na czas każdego wywołania: gettery pól okna liczą odczyty i rzucają; potem pola wracają.
  async function bezDostepu(win, wywolanie) {
    const odczyty = { indexedDB: 0, localStorage: 0, crypto: 0 };
    const oryginalne = {};
    for (const k of POLA) {
      oryginalne[k] = Object.getOwnPropertyDescriptor(win, k);
      Object.defineProperty(win, k, { get() { odczyty[k] += 1; throw new Error(`odczyt ${k}`); }, configurable: true });
    }
    let w;
    let odrzucona = null;
    try { w = await wywolanie(); } catch (x) { odrzucona = x; } finally {
      for (const k of POLA) {
        if (oryginalne[k]) Object.defineProperty(win, k, oryginalne[k]);
        else delete win[k];
      }
    }
    return { w, odrzucona: odrzucona && String(odrzucona.message || odrzucona), odczyty };
  }
  // Klucze obecne w eksporcie poza niechronionymi (pełną listę sprawdza osobny przypadek niżej).
  const chronione = (ev) => Object.keys(ev).filter((k) => !NIECHRONIONE.includes(k));
  async function kazdaNaBramce(win, ev, k, tylko = null) {
    const arg = ARGUMENTY(k);
    const lista = chronione(ev).filter((n) => !tylko || tylko.includes(n));
    if (tylko) expect(lista.sort(), 'operacje do sprawdzenia').toEqual([...tylko].sort());
    for (const nazwa of lista) {
      expect(arg[nazwa], `${nazwa}: nowy klucz eksportu bez argumentów w U1 (dopisać i sprawdzić bramkę)`).toBeTruthy();
      const r = await bezDostepu(win, () => ev[nazwa](...arg[nazwa]));
      expect(r, nazwa).toEqual({ w: { ok: false, powod: 'bramka' }, odrzucona: null, odczyty: { indexedDB: 0, localStorage: 0, crypto: 0 } });
    }
  }

  it('U1: gateOpen() — false dla braku pola, false, \'true\', 1, obiektu (element o tym id) i gettera rzucającego; true → true', () => {
    const { win, timery } = okno();
    okna.push({ timery });
    const ev = win.VildaVault._eventLog;
    expect(typeof ev.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    expect(ev.gateOpen()).toBe(false);
    for (const x of [false, 'true', 1, {}, { tagName: 'DIV', id: 'VILDA_EVENT_LOG' }, null]) {
      win.VILDA_EVENT_LOG = x;
      expect(ev.gateOpen(), String(x)).toBe(false);
    }
    Object.defineProperty(win, 'VILDA_EVENT_LOG', { get() { throw new Error('Fikcyjny getter'); }, configurable: true });
    expect(ev.gateOpen(), 'getter rzucający').toBe(false);
    Object.defineProperty(win, 'VILDA_EVENT_LOG', { value: true, writable: true, configurable: true });
    expect(ev.gateOpen()).toBe(true);
  });

  it('U1(a): sejf na adapterze w pamięci z rejestrem — każda chroniona operacja → bramka; zero odczytów pól okna i wywołań magazynu', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await makrozadania(50);
    const przed = m.wyw.length;
    await kazdaNaBramce(o.win, v._eventLog, { patientId: r.patientId, snapshotId: r.snapshotId });
    await makrozadania(20);
    expect(m.wyw.slice(przed), 'wywołania magazynu sejfu').toEqual([]);
  });

  it('U1(b): adapter IndexedDB nad atrapą (tryb prywatny spełniony) — każda chroniona operacja → bramka; dziennik atrapy bez vilda_sync_*, brak klucza urządzenia', async () => {
    const o = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o);
    expect(typeof o.ev.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.cisza();
    await kazdaNaBramce(o.win, o.ev, { patientId: r.patientId, snapshotId: r.snapshotId });
    await o.cisza();
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_'))).toEqual([]);
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  it('U1: zablokowany sejf przy zamkniętej bramce → bramka (bramka sprawdzana przed blokadą)', async () => {
    const o = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o);
    expect(typeof o.ev.gateOpen, 'API magazynu kolejki (gateOpen)').toBe('function');
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.cisza();
    o.zablokuj();
    await kazdaNaBramce(o.win, o.ev, { patientId: r.patientId, snapshotId: r.snapshotId });
  });

  it('U1 (E2-PR2b2, E2-PR3a2, E2-PR3a3, E2-PR3a4): chronione klucze eksportu = operacje kolejki i kwarantanny i przegląd kolejki sweepOutbox (15), każdy z argumentami w U1; niechronione — klucze E2-PR2a, gateOpen, resultSummary, deleteDatabase, emissionsSettled, onBulkChange', () => {
    const { win, timery } = okno();
    okna.push({ timery });
    const ev = win.VildaVault._eventLog;
    expect(typeof ev.quarantinePut, 'API kwarantanny (quarantinePut)').toBe('function');
    const lista = chronione(ev).sort();
    expect(lista, 'chronione klucze eksportu').toEqual([...KLUCZE_MAGAZYNU.filter((k) => !NIECHRONIONE.includes(k)), KLUCZ_PRZEGLADU].sort());
    expect(lista).toHaveLength(15);
    expect(Object.keys(ARGUMENTY(null)).sort(), 'argumenty U1 dla każdego chronionego klucza').toEqual(lista);
    expect(Object.keys(ev).filter((k) => NIECHRONIONE.includes(k)).sort()).toEqual([...NIECHRONIONE].sort());
  });

  it('U1 (kwarantanna): każda operacja kwarantanny → bramka bez odczytu pól okna — sejf na adapterze w pamięci z rejestrem (zero wywołań magazynu) i na adapterze IndexedDB nad atrapą (bez wpisów vilda_sync_*), także przy zablokowanym sejfie', async () => {
    const KW = KLUCZE_KWARANTANNY.filter((k) => k !== 'resultSummary');
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.quarantinePut, 'API kwarantanny (quarantinePut)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    await makrozadania(50);
    const przed = m.wyw.length;
    await kazdaNaBramce(o.win, v._eventLog, null, KW);
    await makrozadania(20);
    expect(m.wyw.slice(przed), 'wywołania magazynu sejfu').toEqual([]);
    const o2 = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o2);
    await o2.cisza();
    await kazdaNaBramce(o2.win, o2.ev, null, KW);
    o2.zablokuj();
    await kazdaNaBramce(o2.win, o2.ev, null, KW);
    await o2.cisza();
    expect(o2.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_'))).toEqual([]);
    expect(o2.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  // Synchronicznie, na czas jednego wywołania: gettery pól okna (także pola bramki) liczą odczyty i rzucają, zegar (Date:
  // konstruktor, wywołanie, now) liczy użycia; potem wszystko wraca.
  function bezDostepuSync(win, wywolanie) {
    const pola = [...POLA, 'VILDA_EVENT_LOG'];
    const odczyty = Object.fromEntries(pola.map((k) => [k, 0]));
    const oryginalne = {};
    for (const k of pola) {
      oryginalne[k] = Object.getOwnPropertyDescriptor(win, k);
      Object.defineProperty(win, k, { get() { odczyty[k] += 1; throw new Error(`odczyt ${k}`); }, configurable: true });
    }
    const D = globalThis.Date;
    let zegar = 0;
    globalThis.Date = new Proxy(D, {
      construct(t, a) { zegar += 1; return Reflect.construct(t, a); },
      apply(t, ten, a) { zegar += 1; return Reflect.apply(t, ten, a); },
      get(t, k) { if (k === 'now') return () => { zegar += 1; return D.now(); }; return Reflect.get(t, k); },
    });
    let s;
    let blad = null;
    try { s = wywolanie(); } catch (x) { blad = String(x && x.message); } finally {
      globalThis.Date = D;
      for (const k of pola) {
        if (oryginalne[k]) Object.defineProperty(win, k, oryginalne[k]);
        else delete win[k];
      }
    }
    return { s, blad, obietnica: !!s && typeof s.then === 'function', zegar, odczyty };
  }
  it('U1: resultSummary (bez bramki) przy zamkniętej bramce i przy zablokowanym sejfie — pełne podsumowanie synchronicznie, bez odczytu pól okna (indexedDB, localStorage, crypto, VILDA_EVENT_LOG), bez zegara i bez wywołań magazynu sejfu', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.resultSummary, 'API podsumowania wyniku (resultSummary)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    await makrozadania(50);
    const blad = { status: 'apply-error', code: 'QuotaExceededError' };
    Object.defineProperty(blad, 'error', { value: new Error('Fikcyjny błąd zapisu'), enumerable: false });
    const PRZYPADKI = [
      [{ status: 'applied', result: { mergedPatientCount: 1, addedPatientCount: 1, credentialUpdated: false, staleDevice: { warn: false }, clockSkew: null } },
        { status: 'applied', liczniki: { mergedPatientCount: 1, addedPatientCount: 1 } }],
      [NIECZYTELNY, { status: 'unreadable', reason: 'decrypt' }],
      [{ status: 'busy', code: 'MERGE_BUSY' }, { status: 'busy', code: 'MERGE_BUSY' }],
      [blad, { status: 'apply-error', code: 'QuotaExceededError' }],
      [{ status: 'locked' }, { status: 'locked' }],
      [{ status: 'session-changed' }, { status: 'session-changed' }],
      [null, { status: 'nieznany' }],
    ];
    const ZERO = { indexedDB: 0, localStorage: 0, crypto: 0, VILDA_EVENT_LOG: 0 };
    for (const stan of ['bramka zamknięta', 'sejf zablokowany']) {
      if (stan === 'sejf zablokowany') v.lock('manual');
      const przed = m.wyw.length;
      for (const [w, ocz] of PRZYPADKI) {
        const r = bezDostepuSync(o.win, () => v._eventLog.resultSummary(w));
        expect(r, `${stan}: ${JSON.stringify(w)}`).toEqual({ s: ocz, blad: null, obietnica: false, zegar: 0, odczyty: ZERO });
      }
      await makrozadania(20);
      expect(m.wyw.slice(przed), `${stan}: wywołania magazynu sejfu`).toEqual([]);
    }
  });

  // Jak bezDostepuSync, ale gettery i zegar zostają do rozstrzygnięcia obietnicy z wywołania.
  async function bezDostepuAsync(win, wywolanie) {
    const pola = [...POLA, 'VILDA_EVENT_LOG'];
    const odczyty = Object.fromEntries(pola.map((k) => [k, 0]));
    const oryginalne = {};
    for (const k of pola) {
      oryginalne[k] = Object.getOwnPropertyDescriptor(win, k);
      Object.defineProperty(win, k, { get() { odczyty[k] += 1; throw new Error(`odczyt ${k}`); }, configurable: true });
    }
    const D = globalThis.Date;
    let zegar = 0;
    globalThis.Date = new Proxy(D, {
      construct(t, a) { zegar += 1; return Reflect.construct(t, a); },
      apply(t, ten, a) { zegar += 1; return Reflect.apply(t, ten, a); },
      get(t, k) { if (k === 'now') return () => { zegar += 1; return D.now(); }; return Reflect.get(t, k); },
    });
    let obietnica = false;
    let s;
    let blad = null;
    try {
      const p = wywolanie();
      obietnica = !!p && typeof p.then === 'function';
      s = await p;
    } catch (x) { blad = String(x && x.message); } finally {
      globalThis.Date = D;
      for (const k of pola) {
        if (oryginalne[k]) Object.defineProperty(win, k, oryginalne[k]);
        else delete win[k];
      }
    }
    return { s, blad, obietnica, zegar, odczyty };
  }
  it('U1 (E2-PR3a2): emissionsSettled (bez bramki) po zapisach przy zamkniętej bramce i przy zablokowanym sejfie — obietnica rozstrzygnięta wartością undefined, bez odczytu pól okna (indexedDB, localStorage, crypto, VILDA_EVENT_LOG), bez zegara i bez wywołań magazynu sejfu', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.emissionsSettled, 'API emisji (emissionsSettled)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: r.patientId });
    await makrozadania(50);
    const ZERO = { indexedDB: 0, localStorage: 0, crypto: 0, VILDA_EVENT_LOG: 0 };
    for (const stan of ['bramka zamknięta', 'sejf zablokowany']) {
      if (stan === 'sejf zablokowany') v.lock('manual');
      const przed = m.wyw.length;
      const w = await bezDostepuAsync(o.win, () => v._eventLog.emissionsSettled());
      expect(w, stan).toEqual({ s: undefined, blad: null, obietnica: true, zegar: 0, odczyty: ZERO });
      expect('s' in w && w.s === undefined, `${stan}: wartość undefined`).toBe(true);
      await makrozadania(20);
      expect(m.wyw.slice(przed), `${stan}: wywołania magazynu sejfu`).toEqual([]);
    }
  });

  it('U1 (E2-PR3a3): onBulkChange (bez bramki) przy zamkniętej bramce i przy zablokowanym sejfie — z funkcją i bez (brak argumentu, liczba, obiekt): synchronicznie undefined, bez odczytu pól okna (indexedDB, localStorage, crypto, VILDA_EVENT_LOG), bez zegara, bez wywołań magazynu sejfu i bez wywołania słuchacza', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.onBulkChange, 'API partii importu (onBulkChange)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    await v.savePatient(naglowek(1), { dedup: false });
    await makrozadania(50);
    const ZERO = { indexedDB: 0, localStorage: 0, crypto: 0, VILDA_EVENT_LOG: 0 };
    let wywolania = 0;
    const sluchacz = () => { wywolania += 1; };
    for (const stan of ['bramka zamknięta', 'sejf zablokowany']) {
      if (stan === 'sejf zablokowany') v.lock('manual');
      const przed = m.wyw.length;
      for (const [opis, argumenty] of [['funkcja', [sluchacz]], ['bez argumentu', []], ['liczba', [1]], ['obiekt', [{ fikcyjny: true }]]]) {
        const r = bezDostepuSync(o.win, () => v._eventLog.onBulkChange(...argumenty));
        expect(r, `${stan}: ${opis}`).toEqual({ s: undefined, blad: null, obietnica: false, zegar: 0, odczyty: ZERO });
      }
      await makrozadania(20);
      expect(m.wyw.slice(przed), `${stan}: wywołania magazynu sejfu`).toEqual([]);
    }
    expect(wywolania, 'słuchacz bez wywołania przy rejestracji').toBe(0);
  });

  it('U1 (E2-PR3a4): sweepOutbox przy zamkniętej bramce i przy zablokowanym sejfie — obietnica { ok: false, powod: \'bramka\' }, jeden odczyt pola bramki i nic więcej (bez indexedDB, localStorage, crypto i zegara), bez wywołań magazynu sejfu', async () => {
    const o = okno();
    okna.push(o);
    const v = o.win.VildaVault;
    expect(typeof v._eventLog.sweepOutbox, 'API przeglądu kolejki (sweepOutbox)').toBe('function');
    const m = magazynZRejestrem(v.createInMemoryAdapter());
    v.setStorageAdapter(m.adapter);
    await v.createUser('Fikcyjne#Bramka!2026aa', { label: 'Fikcyjna Lekarka Bramka', iterations: 1000 });
    await v.savePatient(naglowek(1), { dedup: false });
    await makrozadania(50);
    for (const stan of ['bramka zamknięta', 'sejf zablokowany']) {
      if (stan === 'sejf zablokowany') v.lock('manual');
      const przed = m.wyw.length;
      const w = await bezDostepuAsync(o.win, () => v._eventLog.sweepOutbox());
      expect(w, stan).toEqual({ s: { ok: false, powod: 'bramka' }, blad: null, obietnica: true, zegar: 0, odczyty: { indexedDB: 0, localStorage: 0, crypto: 0, VILDA_EVENT_LOG: 1 } });
      await makrozadania(20);
      expect(m.wyw.slice(przed), `${stan}: wywołania magazynu sejfu`).toEqual([]);
    }
  });
});

describe('U2(a): identyfikatory Bev_, Bob_ i Bem_ tylko w bloku; _eventLog dokładnie raz', () => {
  it('eksport dziennika zdarzeń istnieje (VildaVault._eventLog)', () => {
    expect(typeof eksport).toBe('object');
  });

  it('znaczniki bloku dokładnie raz; poza blokiem Bev_/Bob_/Bem_ tylko _eventLog:Bev_EKSPORT i wywołania z literału miejsc (tekst, także komentarze)', () => {
    expect(ile(ZRODLO, POCZATEK), 'znacznik początku').toBe(1);
    expect(ile(ZRODLO, KONIEC), 'znacznik końca').toBe(1);
    const { a, z } = blok();
    const poza = ZRODLO.slice(0, a) + ZRODLO.slice(z);
    const ids = [...poza.matchAll(ID_BEV_BOB)].map((m) => m[0]);
    const policz = (lista) => lista.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
    const oczekiwane = { Bev_EKSPORT: 1 };
    for (const nazwy of Object.values(MIEJSCA_POZA_BLOKIEM)) for (const [n, k] of Object.entries(nazwy)) oczekiwane[n] = (oczekiwane[n] || 0) + k;
    expect(policz(ids), 'Bev_/Bob_/Bem_ poza blokiem (nazwa → liczba)').toEqual(oczekiwane);
    expect(ile(poza, '_eventLog:Bev_EKSPORT')).toBe(1);
    expect(ile(ZRODLO, 'STORAGE_MODE_CLOUD_ONLY:Se,_eventLog:Bev_EKSPORT};'), 'klucz na końcu eksportu').toBe(1);
    expect(Object.keys(eksport).sort()).toEqual([...KLUCZE_EKSPORTU].sort());
  });

  it('U2(a): wywołania z literału miejsc poza blokiem — funkcja otaczająca, liczba i forma (drzewo składni; bez użycia wyniku poza wyjątkami form), kolejność w xa i He', () => {
    const { a, z } = blok();
    const poza = ZRODLO.slice(0, a) + ' '.repeat(z - a) + ZRODLO.slice(z);
    expect(miejscaPozaBlokiem(poza)).toEqual({ miejsca: MIEJSCA_POZA_BLOKIEM, bledy: [] });
  });

  // Formy z literału miejsc w małych funkcjach (kształt jak w sejfie): sprzątanie po koncie (E2-PR3a1), emisja (E2-PR3a2),
  // importy (E2-PR3a3) i przegląd kolejki (E2-PR3a4: He z Bem_przeglad(true) na początku, Le z Bem_zChmury(t)).
  const DOBRE = [
    'async function PatientCheckpointRemoveUser(userId, password) { const PatientCheckpointSyncMark=Bob_oznacz(userId); try { await f(); } catch (e) { Bob_odznacz(userId, PatientCheckpointSyncMark); throw e; } finally { g(); } }',
    'async function xa(t,e){ if(!r){ return W(A,(await I().getRegistryEntry(t)&&await I().removeRegistryEntry(W(A,t)),Bob_poRejestrze(t),await Bob_kasujKonto(t),true)); } return W(A,(await I().deleteUserDatabase(W(t,t)),await I().removeRegistryEntry(W(A,t)),Bob_poRejestrze(t),b===t&&kn("user-removed"),await Bob_kasujKonto(t),true)); }',
    'function He(t){ Bem_przeglad(true); Bkr_wyczyscKarte(); $n.forEach(function(n){ n(e); }); try{go()}catch(x){r(x);} Bob_poOdblokowaniu(); Bkr_ponowDziennik(); }',
    'async function Le(t,e){const A=b;PatientClinicalGuard(A);if(!T())throw new Error("x");if(!t||typeof t!="object")throw new Error("VildaVault.mergeSyncPayload: format.");Bem_zChmury(t);if(PatientPortablePayload(t))await PatientPortableModules();return W(A,{})}',
    'function Buk_obce(uid) { try { Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid); } catch (x) { g(); } }',
    "function Vn(detail) {\n  PatientClinicalGuard(); Dn();\n  const signal = VaultChangeSignal(detail, 'patient-saved');\n  Bem_hak('onPatientSaved', detail);\n  Zr.forEach(function (callback) { try { callback(detail, signal); } catch {} });\n  try { Is(detail, signal); } catch {}\n}",
    "function ws(detail) {\n  const signal = VaultChangeSignal(detail, 'patient-deleted');\n  Bem_hak('onPatientDeleted', detail);\n  Gr.forEach(function (callback) { try { callback(detail, signal); } catch {} });\n}",
    "function qr(detail) {\n  PatientClinicalGuard();\n  const signal = VaultChangeSignal(detail);\n  Bem_hak('onPatientNoteChanged', detail);\n  Xr.forEach(function (callback) { try { callback(detail, signal); } catch {} });\n}",
    'function Qr(t){PatientClinicalGuard();Bem_hak("onNoteChanged",t);Jr.forEach(function(e){try{e(t)}catch{}})}',
    'function jn(t){PatientClinicalGuard();Bem_hak("onPatientListChanged",t);xr.forEach(function(e){try{e(t)}catch{}})}',
    'function Yn(t){Bem_hak("onPasskeyChanged",t);ta.forEach(function(e){try{e(t)}catch{}});try{v.VildaSync&&v.VildaSync.syncPush()}catch(e){}}',
    'function Qe2(t){Bem_hak("onCredentialChanged",t);Qe0.forEach(function(e){try{e(t)}catch{}})}',
    'async function Ps(t,e,P){try{if(!T()||!b)return null;const o=new Date().toISOString();return M(P,await Bmk_zmien(b,function(n){return n},P))?(Bem_zmiana("pref",t),o):null}catch(x){return null}}',
    'async function Aj(t,e){return W(A,(await Bmk_zmien(b,function(n){return n},O(null,b)),Bem_zmiana("pref",t),a))}',
    "async function Bnp_poZapisie(id, kiedy, rev, patientId, o) {\n  if (k) {\n    await h.putPatientNoteTombstoneForUser(b, n);\n    Bem_zmiana('pnotetomb', id, o);\n    return undefined;\n  }\n}",
    'async function Bsc_podBlokada(t,e,Bsc_s){for(let d=0;d<o.length;d+=1)await I().putSnapshotForUser(b,W(b,o[d])),Bpz_pilnuj(Bsc_s),Bem_zmiana("snap",{patientId:e,snapshotId:o[d].snapshotId},Bsc_s),a+=1;}',
    "async function Bkz_poImporcie(snapshotIds) {\n  const przepisane = [];\n  await Bkz_zmienListe([], t);\n  if (przepisane.length) Bem_zmiana('snap', przepisane);\n  return 1;\n}",
    "async function Bkz_przywrocWSesji(patientId, snapshotId, Bses_o) {\n  const naglowekKarty = await Bkz_przebudujNaglowek(karta, z, Bses_o);\n  if (naglowekKarty) Bem_zmiana('snap', { patientId: karta, snapshotId: snapshotId }, Bses_o);\n  return 1;\n}",
    "async function Bkz_doKosza(patientId, snapshotId, opcje) {\n  Bem_krokStart();\n  try {\n  return await Ap('pat:' + patientId, async function () {\n    if (!(await Bkz_jest(snapshotId))) await Bkz_zmienListe([wpis], []);\n    Bem_zmiana('stomb', snapshotId);\n    return {};\n  }, { timeoutMs: 3e4 });\n  } finally {\n    Bem_krokKoniec();\n  }\n}",
    "async function Bkz_przytnij(patientId, opcje) {\n  return Ap('pat:' + patientId, async function () {\n    const zostaly = [];\n    if (zostaly.length) Bem_zmiana('stomb', zostaly);\n    return {};\n  }, { timeoutMs: 3e4 });\n}",
    'async function Bsc0(t,e,Bpu_o){const Bsc_s=Bses_opcje(null);Bem_krokStart();try{return await Bzw_podBlokada(k,f)}catch(Bsc_x){throw Bpz_zamien(Bsc_s,Bsc_x)}finally{Bem_krokKoniec()}}',
    'async function $a(t,e){const Bme_s=Bses_opcje(null);Bem_krokStart();try{return await f()}catch(Bme_x){throw Bpz_zamien(Bme_s,Bme_x)}finally{Bem_krokKoniec()}}',
    'async function Bpu_usun(t,Bpu_s){Bem_krokStart();try{const A=b;return W(A,!0)}finally{Bem_krokKoniec()}}',
    'async function Ad(t,e){Bem_krokStart();try{const A=b;return W(A,U)}finally{Bem_krokKoniec()}}',
    'async function qa(){Bem_krokStart();try{if(!T())throw new Error("x");return{persons:a,notes:s}}finally{Bem_krokKoniec()}}',
    'async function ns(t,e,Bpb_o){const Bpi_s=Bses_opcje(null);Bem_krokStart();try{const O=[],N=[];await Bzw_podBlokada(k,async function(){await Bkz_poImporcie(O);if(O.length)Bem_zmiana("snap",O.map(function(Bq){return{patientId:i,snapshotId:Bq.snapshotId}}),Bpi_s)});if(N.length){try{const C=await Le({patientNotes:N});_=C.n;Bem_sekcje({patientNotes:N},Bpi_s)}catch(Bpi_x){g()}}Bem_partia("importPatientFromEnvelope");return W(A,{patientId:i})}catch(Bpi_x){throw Bpz_zamien(Bpi_s,Bpi_x)}finally{Bem_krokKoniec()}}',
    'async function ss(t,e,Bpb_o){Bem_krokStart();try{const A=b;for(const u of m)await Bzw_podBlokada(k,async function(){if(A>0){Bem_zmiana("snap",Bng_zs.map(function(Bq){return{patientId:u.patientId,snapshotId:Bq.snapshotId}}));y++}else{d++;if(Bng_zn.length)Bem_zmiana("snap",Bng_zn.map(function(Bq){return{patientId:u.patientId,snapshotId:Bq.snapshotId}}))}});await Le(a);Bem_sekcje(a);Bem_partia("mergeVaultBackup");return W(A,{mergedPatientCount:y})}finally{Bem_krokKoniec()}}',
    'async function as(t,e,n){await Qe(),Ae();try{Bem_krokStart();try{for(const C of m){E+=1;if(J.length)Bem_zmiana("snap",J.filter(function(tt){return tt&&tt.snapshotId}).map(function(tt){return{patientId:C.patientId,snapshotId:tt.snapshotId}}))}await Le(p);Bem_sekcje(p);Bem_partia("restoreVaultBackup");return W(A,{userId:w})}finally{Bem_krokKoniec()}}finally{He()}}',
  ].join('\n');
  // Wariant jest czerwony, gdy wyszukiwacz zgłasza błąd formy albo lista miejsc różni się od literału (bez względu na kolejność).
  const czerwony = (kod) => { const w = miejscaPozaBlokiem(kod); return w.bledy.length + (takieSame(w.miejsca, MIEJSCA_POZA_BLOKIEM) ? 0 : 1); };

  it('samokontrola literału miejsc: użycie wyniku, await, return, miejsce spoza literału, zła kolejność w xa albo He i wynik oznaczenia poza Bob_odznacz — czerwone; formy z literału zielone', () => {
    expect(miejscaPozaBlokiem(DOBRE)).toEqual({ miejsca: MIEJSCA_POZA_BLOKIEM, bledy: [] });
    const zle = [
      DOBRE.replace('Bob_poOdblokowaniu();', 'const x = Bob_poOdblokowaniu();'),
      DOBRE.replace('function He(t){', 'async function He(t){').replace('Bob_poOdblokowaniu();', 'await Bob_poOdblokowaniu();'),
      DOBRE.replace('Bob_poOdblokowaniu();', 'return Bob_poOdblokowaniu();'),
      DOBRE.replace('Bob_poOdblokowaniu();', 'Bob_poOdblokowaniu().then(f);'),
      DOBRE.replace('try{go()}catch(x){r(x);} Bob_poOdblokowaniu();', 'Bob_poOdblokowaniu(); try{go()}catch(x){r(x);}'),
      DOBRE.replace(',Bob_poRejestrze(t),b===t&&kn("user-removed"),await Bob_kasujKonto(t),true', ',Bob_poRejestrze(t),await Bob_kasujKonto(t),b===t&&kn("user-removed"),true'),
      DOBRE.replace('await I().deleteUserDatabase(W(t,t)),await I().removeRegistryEntry(W(A,t)),Bob_poRejestrze(t)', 'await I().deleteUserDatabase(W(t,t)),Bob_poRejestrze(t),await I().removeRegistryEntry(W(A,t))'),
      DOBRE.replace(',Bob_poRejestrze(t),await Bob_kasujKonto(t),true));', ',Bob_poRejestrze(t),Bob_kasujKonto(t),true));'),
      DOBRE.replace(',Bob_poRejestrze(t),await Bob_kasujKonto(t),true));', ',Bob_poRejestrze(t),true)); await Bob_kasujKonto(t);'),
      DOBRE.replace('Bob_odznacz(userId, PatientCheckpointSyncMark);', 'Bob_odznacz(userId, PatientCheckpointSyncMark); h(PatientCheckpointSyncMark);'),
      DOBRE.replace('catch (e) { Bob_odznacz(userId, PatientCheckpointSyncMark); throw e; } finally { g(); }', 'catch (e) { throw e; } finally { g(); } Bob_odznacz(userId, PatientCheckpointSyncMark);'),
      DOBRE.replace('const PatientCheckpointSyncMark=Bob_oznacz(userId);', 'let PatientCheckpointSyncMark=Bob_oznacz(userId);'),
      `${DOBRE}\nfunction Inna() { Bob_poRejestrze(u); }`,
      `${DOBRE}\nfunction fs() { Bem_partia(1); }`,
      DOBRE.replace('try{go()}catch(x){r(x);} Bob_poOdblokowaniu(); Bkr_ponowDziennik(); }', 'try{go()}catch(x){r(x);} Bkr_ponowDziennik(); }').replace('$n.forEach(function(n){ n(e); });', '$n.forEach(function(n){ n(e); Bob_poOdblokowaniu(); });'),
      DOBRE.replace('try { Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid); } catch (x) { g(); }', 'Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid);'),
      DOBRE.replace('Bob_poKasowaniuSejfu(uid); } catch (x) { g(); }', '} catch (x) { Bob_poKasowaniuSejfu(uid); }'),
      DOBRE.replace('Bob_poKasowaniuSejfu(uid);', 'const x = Bob_poKasowaniuSejfu(uid);'),
      DOBRE.replace('function Buk_obce(uid) {', 'function Buk_zmiana(uid) {'),
      DOBRE.replace('try { Buk_usuniete.add(uid); Bob_poKasowaniuSejfu(uid); }', 'try { Buk_usuniete.add(uid); [1].forEach(function () { Bob_poKasowaniuSejfu(uid); }); }'),
    ];
    for (const [i, kod] of zle.entries()) {
      expect(kod, `wariant ${i} różni się od form z literału`).not.toBe(DOBRE);
      expect(czerwony(kod), `wariant ${i}`).toBeGreaterThan(0);
    }
  });

  it('samokontrola form emisji (E2-PR3a2): await Bem_zmiana, wynik użyty, Bem_krokKoniec poza finally, Bem_krokStart nie tuż przed try, Bem_hak po słuchaczach albo z innym hookiem, nowe miejsce spoza literału — czerwone', () => {
    const zle = [
      DOBRE.replace("    Bem_zmiana('pnotetomb', id, o);", "    await Bem_zmiana('pnotetomb', id, o);"),
      DOBRE.replace('?(Bem_zmiana("pref",t),o):null', '?(o,Bem_zmiana("pref",t)):null'),
      DOBRE.replace('?(Bem_zmiana("pref",t),o):null', '?Bem_zmiana("pref",t):null'),
      DOBRE.replace("  if (przepisane.length) Bem_zmiana('snap', przepisane);", "  const w = Bem_zmiana('snap', przepisane);"),
      DOBRE.replace("  if (naglowekKarty) Bem_zmiana('snap', { patientId: karta, snapshotId: snapshotId }, Bses_o);\n  return 1;", "  return Bem_zmiana('snap', { patientId: karta, snapshotId: snapshotId }, Bses_o);"),
      DOBRE.replace("    Bem_zmiana('stomb', snapshotId);", "    Bem_zmiana('stomb', snapshotId).then(f);"),
      DOBRE.replace('async function Bpu_usun(t,Bpu_s){Bem_krokStart();try{const A=b;return W(A,!0)}finally{Bem_krokKoniec()}}', 'async function Bpu_usun(t,Bpu_s){Bem_krokStart();try{const A=b;await W(A,!0)}catch(x){throw x}Bem_krokKoniec()}'),
      DOBRE.replace('async function Ad(t,e){Bem_krokStart();try{const A=b;return W(A,U)}finally{Bem_krokKoniec()}}', 'async function Ad(t,e){Bem_krokStart();try{const A=b;Bem_krokKoniec();return W(A,U)}finally{g()}}'),
      DOBRE.replace('async function Ad(t,e){Bem_krokStart();try{', 'async function Ad(t,e){Bem_krokStart();g();try{'),
      DOBRE.replace('finally{Bem_krokKoniec()}}\nasync function $a', 'finally{Bem_krokKoniec();g()}}\nasync function $a'),
      DOBRE.replace('async function qa(){Bem_krokStart();try{', 'async function qa(){if(k)Bem_krokStart();try{'),
      DOBRE.replace('Bem_krokStart();try{const A=b;return W(A,!0)}', 'Bem_krokStart(1);try{const A=b;return W(A,!0)}'),
      DOBRE.replace('function Yn(t){Bem_hak("onPasskeyChanged",t);ta.forEach(function(e){try{e(t)}catch{}});', 'function Yn(t){ta.forEach(function(e){try{e(t)}catch{}});Bem_hak("onPasskeyChanged",t);'),
      DOBRE.replace('function Qr(t){PatientClinicalGuard();Bem_hak("onNoteChanged",t);Jr.forEach(function(e){try{e(t)}catch{}})}', 'function Qr(t){PatientClinicalGuard();Jr.forEach(function(e){Bem_hak("onNoteChanged",t);try{e(t)}catch{}})}'),
      DOBRE.replace('Bem_hak("onCredentialChanged",t)', 'Bem_hak("onPasskeyChanged",t)'),
      DOBRE.replace('Bem_hak("onPatientListChanged",t)', 'Bem_hak("onPatientListChanged",{action:"save"})'),
      DOBRE.replace("  Bem_hak('onPatientDeleted', detail);", "  if (detail) Bem_hak('onPatientDeleted', detail);"),
      `${DOBRE}\nfunction fs() { Bem_zmiana('snap', przepisane); }`,
      `${DOBRE}\nfunction Le(t) { Bem_hak('onPatientNoteChanged', t); Xr.forEach(function (c) { c(t); }); }`,
      DOBRE.replace("    Bem_zmiana('pnotetomb', id, o);", "    [id].forEach(function (x) { Bem_zmiana('pnotetomb', x, o); });"),
      DOBRE.replace('a+=1;}', 'a+=1;f(Bem_zmiana);}'),
    ];
    for (const [i, kod] of zle.entries()) {
      expect(kod, `wariant ${i} różni się od form z literału`).not.toBe(DOBRE);
      expect(czerwony(kod), `wariant ${i}`).toBeGreaterThan(0);
    }
  });

  it('samokontrola form importów (E2-PR3a3): Bem_partia z inną nazwą, bez literału, poza krokiem albo w funkcji zagnieżdżonej, Bem_sekcje i Bem_zmiana importu poza krokiem, krok odtworzenia konta zamknięty po He() albo poza try z He() — czerwone', () => {
    const PARTIA_AS = 'Bem_partia("restoreVaultBackup");return W(A,{userId:w})}finally{Bem_krokKoniec()}}finally{He()}}';
    // Literał miejsc bez zmian — czerwone wyłącznie z reguły formy.
    const tylkoForma = [
      DOBRE.replace('Bem_partia("importPatientFromEnvelope")', 'Bem_partia("mergeVaultBackup")'),
      DOBRE.replace('Bem_partia("mergeVaultBackup")', 'Bem_partia(nazwa)'),
      DOBRE.replace('Bem_partia("mergeVaultBackup")', 'Bem_partia("mergeVaultBackup",1)'),
      DOBRE.replace(PARTIA_AS, 'return W(A,{userId:w})}finally{Bem_krokKoniec()}Bem_partia("restoreVaultBackup")}finally{He()}}'),
      DOBRE.replace('await Le(a);Bem_sekcje(a);Bem_partia("mergeVaultBackup");return W(A,{mergedPatientCount:y})}finally{Bem_krokKoniec()}}',
        'await Le(a);Bem_partia("mergeVaultBackup");return W(A,{mergedPatientCount:y})}finally{Bem_krokKoniec()}Bem_sekcje(a)}'),
      DOBRE.replace('async function ss(t,e,Bpb_o){Bem_krokStart();try{const A=b;for(const u of m)await Bzw_podBlokada(k,async function(){',
        'async function ss(t,e,Bpb_o){const A=b;for(const u of m)await Bzw_podBlokada(k,async function(){').replace('}});await Le(a);Bem_sekcje(a);', '}});Bem_krokStart();try{await Le(a);Bem_sekcje(a);'),
      DOBRE.replace('try{Bem_krokStart();try{for(const C of m){', 'Bem_krokStart();try{try{for(const C of m){').replace(PARTIA_AS, 'Bem_partia("restoreVaultBackup");return W(A,{userId:w})}finally{He()}}finally{Bem_krokKoniec()}}'),
      DOBRE.replace('try{Bem_krokStart();try{for(const C of m){', 'Bem_krokStart();try{for(const C of m){').replace('}finally{Bem_krokKoniec()}}finally{He()}}', '}finally{Bem_krokKoniec()}He()}'),
    ];
    for (const [i, kod] of tylkoForma.entries()) {
      expect(kod, `wariant formy ${i} różni się od form z literału`).not.toBe(DOBRE);
      const w = miejscaPozaBlokiem(kod);
      expect(takieSame(w.miejsca, MIEJSCA_POZA_BLOKIEM), `wariant formy ${i}: literał miejsc bez zmian`).toBe(true);
      expect(w.bledy.length, `wariant formy ${i}`).toBeGreaterThan(0);
    }
    const zle = [
      DOBRE.replace('Bem_partia("importPatientFromEnvelope");return', '[0].forEach(function(){Bem_partia("importPatientFromEnvelope")});return'),
      DOBRE.replace('Bem_sekcje({patientNotes:N},Bpi_s)', '[N].forEach(function(x){Bem_sekcje({patientNotes:x},Bpi_s)})'),
      DOBRE.replace('try{Bem_krokStart();try{for(const C of m){', 'for(const C of m){Bem_zmiana("snap",[])}try{Bem_krokStart();try{for(const C of m){'),
      `${DOBRE}\nfunction fs() { Bem_sekcje(t); }`,
      `${DOBRE}\nfunction fs() { Bem_krokStart();try{Bem_partia("importPatientFromEnvelope")}finally{Bem_krokKoniec()} }`,
    ];
    for (const [i, kod] of zle.entries()) {
      expect(kod, `wariant ${i} różni się od form z literału`).not.toBe(DOBRE);
      expect(czerwony(kod), `wariant ${i}`).toBeGreaterThan(0);
    }
  });

  it('samokontrola form przeglądu kolejki (E2-PR3a4): Bem_przeglad nie pierwsze w He, po słuchaczach, z argumentem innym niż true, w innej funkcji, z użytym wynikiem albo z await; Bem_zChmury przed sprawdzeniem ładunku, nie tuż po nim, w bloku zagnieżdżonym, z innym argumentem, z użytym wynikiem albo z await — czerwone', () => {
    const HE = 'function He(t){ Bem_przeglad(true); Bkr_wyczyscKarte(); $n.forEach(';
    const LE = 'if(!t||typeof t!="object")throw new Error("VildaVault.mergeSyncPayload: format.");Bem_zChmury(t);';
    const SPR = 'if(!t||typeof t!="object")throw new Error("VildaVault.mergeSyncPayload: format.");';
    // Literał miejsc bez zmian — czerwone wyłącznie z reguły formy.
    const tylkoForma = [
      DOBRE.replace(HE, 'function He(t){ Bkr_wyczyscKarte(); Bem_przeglad(true); $n.forEach('),
      DOBRE.replace(HE, 'function He(t){ Bkr_wyczyscKarte(); $n.forEach(').replace('try{go()}catch(x){r(x);} Bob_poOdblokowaniu();', 'try{go()}catch(x){r(x);} Bem_przeglad(true); Bob_poOdblokowaniu();'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad(false);'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad();'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad(true, t);'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad(t);'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad("true");'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad(true), Bkr_x();'),
      DOBRE.replace('Bem_przeglad(true);', 'if (t) Bem_przeglad(true);'),
      DOBRE.replace(LE, `Bem_zChmury(t);${SPR}`),
      DOBRE.replace(LE, `${SPR}g();Bem_zChmury(t);`),
      DOBRE.replace(LE, `${SPR}{Bem_zChmury(t);}`),
      DOBRE.replace(LE, `${SPR}Bem_zChmury(e);`),
      DOBRE.replace(LE, `${SPR}Bem_zChmury();`),
      DOBRE.replace(LE, `${SPR}Bem_zChmury(t,e);`),
      DOBRE.replace(LE, `${SPR}Bem_zChmury({t});`),
      DOBRE.replace(LE, 'if(!t)throw new Error("VildaVault.mergeSyncPayload: format.");Bem_zChmury(t);'),
      DOBRE.replace(LE, 'if(!t||typeof t!="object")return null;Bem_zChmury(t);'),
      DOBRE.replace(LE, 'if(!e||typeof e!="object")throw new Error("VildaVault.mergeSyncPayload: format.");Bem_zChmury(t);'),
    ];
    for (const [i, kod] of tylkoForma.entries()) {
      expect(kod, `wariant formy ${i} różni się od form z literału`).not.toBe(DOBRE);
      const w = miejscaPozaBlokiem(kod);
      expect(takieSame(w.miejsca, MIEJSCA_POZA_BLOKIEM), `wariant formy ${i}: literał miejsc bez zmian`).toBe(true);
      expect(w.bledy.length, `wariant formy ${i}`).toBeGreaterThan(0);
    }
    const zle = [
      DOBRE.replace('Bem_przeglad(true);', 'const p = Bem_przeglad(true);'),
      DOBRE.replace('Bem_przeglad(true);', 'Bem_przeglad(true).then(f);'),
      DOBRE.replace('function He(t){ Bem_przeglad(true);', 'async function He(t){ await Bem_przeglad(true);'),
      DOBRE.replace(HE, 'function He(t){ Bkr_wyczyscKarte(); $n.forEach('),
      `${DOBRE.replace(HE, 'function He(t){ Bkr_wyczyscKarte(); $n.forEach(')}\nfunction Fa(t){ Bem_przeglad(true); He("login"); }`,
      DOBRE.replace(LE, `${SPR}const p=Bem_zChmury(t);`),
      DOBRE.replace(LE, `${SPR}await Bem_zChmury(t);`),
      DOBRE.replace(LE, `${SPR}[t].forEach(function(x){Bem_zChmury(x)});`),
      `${DOBRE.replace(LE, SPR)}\nfunction ps(t){ Bem_zChmury(t); return Le(t); }`,
      `${DOBRE}\nfunction Inna(t){ Bem_zChmury(t); }`,
    ];
    for (const [i, kod] of zle.entries()) {
      expect(kod, `wariant ${i} różni się od form z literału`).not.toBe(DOBRE);
      expect(czerwony(kod), `wariant ${i}`).toBeGreaterThan(0);
    }
  });

  it('_eventLog dokładnie raz w pliku; zero odwołań przez obiekt (._eventLog, VildaVault._eventLog, [\'_eventLog\'])', () => {
    expect(ile(ZRODLO, '_eventLog')).toBe(1);
    expect(ZRODLO.match(/\._eventLog\b/g)).toBe(null);
    expect(ZRODLO.match(/VildaVault\s*\.\s*_eventLog/g)).toBe(null);
    expect(ZRODLO.match(/\[\s*['"`]_eventLog['"`]\s*\]/g)).toBe(null);
  });

  it('blok stoi na końcu czytelnego bloku B???_: po Bsl_usunPacjenta, tuż przed `function yr(t,e){`', () => {
    const { a, z } = blok();
    expect(ZRODLO.indexOf('async function Bsl_usunPacjenta(')).toBeLessThan(a);
    expect(ZRODLO.slice(z, z + 1 + 'function yr(t,e){'.length)).toBe('\nfunction yr(t,e){');
    expect(ZRODLO.slice(0, a).endsWith('}\n'), 'blok zaczyna się od nowej linii po klamrze Bsl_usunPacjenta').toBe(true);
  });

  it('U2(a) (E2-PR2b, E2-PR3a1): znacznik magazynu kolejki dokładnie raz, za literałem Bev_EKSPORT, przed znacznikiem końca; Bob_ w części Bev_ wyłącznie w tym literale (17 kluczy magazynu kolejki i kwarantanny) i jedno Bob_wKasowaniu w Bev_start', () => {
    znacznikRaz();
    expect(ZNACZNIK_MAGAZYNU.includes('Bob_'), 'tekst znacznika bez Bob_').toBe(false);
    const { a, z, i, bev } = czesci();
    const lit = literalEksportu();
    expect(lit.start).toBeGreaterThan(a);
    expect(lit.koniec, 'znacznik magazynu za literałem Bev_EKSPORT').toBeLessThan(i);
    expect(i).toBeLessThan(z);
    expect(ZRODLO.slice(lit.koniec, i).trim(), 'między literałem eksportu a znacznikiem magazynu tylko średnik').toBe(';');
    const wBev = [...bev.matchAll(ID_BOB)].map((m) => ({ poz: a + m.index, nazwa: m[0] }));
    const start = ZRODLO.indexOf('function Bev_start(');
    const poza = wBev.filter((x) => x.poz < lit.start || x.poz >= lit.koniec);
    const wStart = start >= 0 ? start + wytnijFunkcje(ZRODLO.slice(start), 'Bev_start').length : -1;
    expect(poza.map((x) => `${x.nazwa}${x.poz > start && x.poz < wStart ? ' w Bev_start' : ''}`), 'Bob_ w części Bev_ poza literałem eksportu').toEqual(['Bob_wKasowaniu w Bev_start']);
    expect(KLUCZE_MAGAZYNU).toHaveLength(17);
    expect(wBev.length - poza.length, 'Bob_ w literale eksportu: 17 kluczy magazynu kolejki i kwarantanny').toBe(KLUCZE_MAGAZYNU.length);
    const pary = [...lit.tekst.matchAll(/(\w+)\s*:\s*(Bob_[A-Za-z0-9_$]*)/g)].map((m) => m[1]);
    expect(pary.sort()).toEqual([...KLUCZE_MAGAZYNU].sort());
  });

  it('U2(a) (E2-PR3a2): znacznik emisji dokładnie raz, za częścią Bob_ (za znacznikiem magazynu), przed znacznikiem końca; czesci() dzieli blok na trzy części Bev_, Bob_ i Bem_', () => {
    znacznikEmisjiRaz();
    expect(/B(?:ev|ob|em)_/.test(ZNACZNIK_EMISJI), 'tekst znacznika bez identyfikatorów bloku').toBe(false);
    const { a, z, i, e, bev, bob, bem, odBob, odBem } = czesci();
    expect(i, 'znacznik magazynu za początkiem bloku').toBeGreaterThan(a);
    expect(e, 'znacznik emisji za częścią Bob_').toBeGreaterThan(i);
    expect(e + ZNACZNIK_EMISJI.length, 'znacznik emisji przed znacznikiem końca').toBeLessThanOrEqual(z - KONIEC.length);
    expect(odBem).toBe(e + ZNACZNIK_EMISJI.length);
    expect(bev + ZNACZNIK_MAGAZYNU + bob + ZNACZNIK_EMISJI + bem + KONIEC, 'trzy części i znaczniki składają się na cały blok').toBe(blok().tekst);
    expect(ZRODLO.slice(odBob, e), 'część Bob_ kończy się na znaczniku emisji').toBe(bob);
    const nazwy = (tekst) => [...new Set([...tekst.matchAll(/(?:^|\n)(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1].slice(0, 4)))].sort();
    expect(nazwy(bob), 'część Bob_: same funkcje Bob_').toEqual(['Bob_']);
    expect(nazwy(bem), 'część Bem_: same funkcje Bem_').toEqual(['Bem_']);
    expect(bem.trim().length, 'część Bem_ nie jest pusta').toBeGreaterThan(1000);
  });

  it('U2(a) (E2-PR3a2, E2-PR3a3, E2-PR3a4): w części Bev_ jedyne identyfikatory Bem_ to emissionsSettled: Bem_gotowe, onBulkChange: Bem_naPartie i sweepOutbox: Bem_przegladTeraz w literale Bev_EKSPORT; w części Bob_ brak Bem_', () => {
    znacznikEmisjiRaz();
    const { a, bev, bob } = czesci();
    const lit = literalEksportu();
    const wBev = [...bev.matchAll(/(?<![A-Za-z0-9_$])Bem_[A-Za-z0-9_$]*/g)].map((m) => ({ poz: a + m.index, nazwa: m[0] }));
    expect(wBev.map((x) => `${x.nazwa}${x.poz > lit.start && x.poz < lit.koniec ? ' w Bev_EKSPORT' : ''}`), 'Bem_ w części Bev_').toEqual(['Bem_gotowe w Bev_EKSPORT', 'Bem_naPartie w Bev_EKSPORT', 'Bem_przegladTeraz w Bev_EKSPORT']);
    expect([...lit.tekst.matchAll(/(\w+)\s*:\s*(Bem_[A-Za-z0-9_$]*)/g)].map((m) => `${m[1]}: ${m[2]}`)).toEqual([`${KLUCZ_EMISJI}: Bem_gotowe`, `${KLUCZ_PARTII}: Bem_naPartie`, `${KLUCZ_PRZEGLADU}: Bem_przegladTeraz`]);
    expect(bob.match(/(?<![A-Za-z0-9_$])Bem_[A-Za-z0-9_$]*/g), 'Bem_ w części Bob_').toBe(null);
  });

  it('U2(a) (E2-PR3a2, E2-PR3a4): w części Bob_ dochodzi Bob_dopiszZ — async, blokada współdzielona konta (Bob_podBlokada, Bob_LIMIT_BLOKADY_MS) przed Bob_dopiszPod; enqueue (Bob_dopisz), silnik przeglądu kolejki (Bob_przeglad) i łańcuch emisji wołają je, Bob_dopiszPod woła tylko ono', () => {
    znacznikEmisjiRaz();
    const { bob, bem } = czesci();
    const ast = parse(bob, { ecmaVersion: 'latest', sourceType: 'script' });
    const dekl = new Map(ast.body.filter((s) => s.type === 'FunctionDeclaration').map((s) => [s.id.name, s]));
    expect(dekl.has('Bob_dopiszZ'), 'deklaracja Bob_dopiszZ w części Bob_').toBe(true);
    expect(dekl.get('Bob_dopiszZ').async).toBe(true);
    // Wywołania funkcji Bob_ w części Bob_: nazwa → funkcje, w których stoją.
    const wywolania = {};
    const idz = (n, f) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier') (wywolania[n.callee.name] = wywolania[n.callee.name] || []).push(f);
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => idz(y, f)); else if (x && typeof x.type === 'string') idz(x, f); }
    };
    for (const [nazwa, s] of dekl) idz(s.body, nazwa);
    expect(wywolania.Bob_dopiszZ, 'Bob_dopiszZ w części Bob_').toEqual(['Bob_dopisz', 'Bob_przeglad']);
    expect(wywolania.Bob_dopiszPod, 'Bob_dopiszPod').toEqual(['Bob_dopiszZ']);
    expect((wywolania.Bob_podBlokada || []).filter((f) => f === 'Bob_dopisz'), 'Bob_dopisz bez własnej blokady').toEqual([]);
    const z = wytnijFunkcje(bob.slice(bob.indexOf('async function Bob_dopiszZ(')), 'Bob_dopiszZ');
    expect(z).toMatch(/Bob_podBlokada\(uid, 'shared', Bob_LIMIT_BLOKADY_MS,/);
    expect(z.indexOf('Bob_podBlokada(')).toBeLessThan(z.indexOf('Bob_dopiszPod('));
    expect(z).toMatch(/SYNC_DB_TIMEOUT/);
    expect(bem.match(/(?<![A-Za-z0-9_$])Bob_dopiszZ\(/g), 'Bob_dopiszZ w części Bem_').toHaveLength(1);
  });
});

describe('U2(b): pliki produktu poza sejfem nie znają nowego API', () => {
  const NAZWY = ['_eventLog', 'applyEncryptedEvent', 'encryptEvent', ...BUILDERY, 'VILDA_EVENT_LOG', PRZEDROSTEK_URZADZENIA,
    ...KLUCZE_MAGAZYNU.filter((k) => k !== 'enqueue' && k !== 'deleteDatabase'), KLUCZ_EMISJI, KLUCZ_PARTII, KLUCZ_PRZEGLADU];
  const WZORCE = [/vilda_sync_(?!integration\.js)/, /(?<![A-Za-z0-9_$])Bev_/, /(?<![A-Za-z0-9_$])Bob_/, /(?<![A-Za-z0-9_$])Bem_/];
  it('żaden plik produktu poza vilda_vault.js nie zawiera _eventLog, nazw API dziennika, magazynu, emisji, partii i przeglądu kolejki (emissionsSettled, onBulkChange, sweepOutbox), VILDA_EVENT_LOG, klucza urządzenia, nazwy bazy kolejki, Bev_, Bob_ ani Bem_', () => {
    const winne = [];
    for (const plik of plikiProdukcyjne()) {
      const tresc = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const n of NAZWY) if (tresc.includes(n)) winne.push(`${plik}: ${n}`);
      for (const re of WZORCE) if (re.test(tresc)) winne.push(`${plik}: ${re}`);
    }
    expect(winne).toEqual([]);
  });

  it('strażnik nie jest pusty — skan widzi moduły synchronizacji, service worker i strony; wzorzec bazy kolejki przepuszcza tylko vilda_sync_integration.js', () => {
    const pliki = plikiProdukcyjne();
    for (const p of ['vilda_sync.js', 'vilda_sync_integration.js', 'vilda_realtime.js', 'service-worker-kalorii.js', 'app.html']) {
      expect(pliki, p).toContain(p);
    }
    expect(pliki).not.toContain(SEJF);
    const re = WZORCE[0];
    for (const p of ["'vilda_sync_' + uid", '`vilda_sync_${uid}`', '"vilda_sync_"', 'vilda_sync_x']) expect(re.test(p), p).toBe(true);
    for (const p of ['<script src="vilda_sync_integration.js"></script>', 'vilda_sync.js', 'vilda-sync-data']) expect(re.test(p), p).toBe(false);
  });
});

describe('U2(c): wywołania zakazane i reguła domknięcia części magazynu', () => {
  // Część Bev_ (lista z E2-PR2a; ALGORITHMS, P-DZIENNIK-ZDARZEN): zapis magazynu i metadanych konta, emisje
  // i powiadomienia, sieć, magazyny przeglądarki, legacy buildery delt i eksport ładunku (is kasuje stare nagrobki),
  // skutki uboczne przy ładowaniu.
  // „.delete…(” to wywołania metod delete* (Map.delete, deleteDatabase, deleteSnapshot…), nie pole deletedAtISO.
  // Wzorce bez nawiasu wywołania: dostęp przez nawias (c.a['putUserMeta'](…)) i przez .call
  // (.removeNoteTombstoneForUser.call(…)) — sama nazwa metody zapisu/usuwania, poza polami deletedAtISO i deletedWithPatient.
  const ZAKAZANE = [
    /console\./, /fetch\(/, /sendBeacon/, /BroadcastChannel/, /postMessage/, /indexedDB/, /localStorage/, /sessionStorage/,
    /\.putUserMeta\(/, /Bmk_zmien\(/, /\.put[A-Za-z]*ForUser\(/, /\.remove[A-Za-z]*ForUser\(/, /\.delete[A-Za-z]*\s*\(/, /Bkz_zmienListe\(/,
    /VaultChangeSignal/, /syncPush/, /addEventListener/, /setTimeout/, /setInterval/, /navigator\./,
    /(?<![A-Za-z0-9_$])(?:Vn|ws|Qr|qr|vs|Yn|Qe2|jn|is|Bkz_eksport|Gc5|Gc3|us|ls|ds|cs|Qb0|Qb1|Bsw_deltaNagrobka|ps)\(/,
    /\.delete(?!dAtISO\b|dWithPatient\b)[A-Za-z]*/, /\.(?:put|remove)[A-Za-z]*ForUser\b/, /\.putUserMeta\b/,
    /\[\s*['"`](?:put|remove|write|update|delete(?!dAtISO\b|dWithPatient\b))/,
  ];
  // Część Bob_: lista tekstowa (także komentarze). Magazyn kolejki sięga do IndexedDB, localStorage i zegarów okna
  // wyłącznie przez pola v (reguła domknięcia niżej); tu zakazane są pozostałe kanały, emitery i zapisy sejfu.
  const ZAKAZANE_BOB = [
    /console\./, /fetch/, /sendBeacon/, /BroadcastChannel/, /postMessage/, /sessionStorage/, /addEventListener/, /setInterval/,
    /navigator/, /document/, /XMLHttpRequest/, /importScripts/,
    /(?<![\w$])(?:Vn|ws|Qr|qr|vs|Yn|Qe2|jn|is|Le|ps|G|V|kn|xa|us|ls|ds|cs|Qb0|Qb1|Gc5|Gc3)\s*\(/,
    /Bkz_/, /Bsl_/, /Bsw_/, /Bnp_/, /Bpk_/, /Bgw_/, /VaultChangeSignal/, /syncPush/, /\$s\b/, /Bmk_zmien/,
    /\.(?:put|remove|delete|update|write)[A-Za-z]*ForUser\b/, /\.putUserMeta\b/, /deleteUserDatabase/,
    /\[\s*['"`](?:put|remove|write|update|delete)/, /\.call\s*\(/, /\.apply\s*\(/, /\bReflect\./, /\bFunction\b/, /\beval\b/,
  ];
  const znajdz = (lista, tekst) => {
    const out = [];
    for (const re of lista) {
      const g = new RegExp(re.source, 'g');
      for (const m of tekst.matchAll(g)) out.push(`${re}: …${tekst.slice(Math.max(0, m.index - 30), m.index + 30)}…`);
    }
    return out;
  };

  it('część Bev_: żaden zakazany wzorzec (także w komentarzach)', () => {
    expect(typeof eksport).toBe('object');
    znacznikRaz();
    expect(znajdz(ZAKAZANE, czesci().bev)).toEqual([]);
  });
  it('samokontrola wzorców części Bev_: lista łapie przykładowe naruszenia', () => {
    const proby = ['console.log(1)', 'await I().putPatientForUser(b, x)', 'Vn({})', 'is()', 'x.deleteDatabase(n)', 'm.delete(k)', 'v.localStorage.setItem(k, v)', 'Bkz_eksport()',
      "await c.a['putUserMeta'](c.u, m)", 'await c.a.removeNoteTombstoneForUser.call(c.a, c.u, id)', 'const f = c.a.putUserMeta', 'a[`deleteSnapshotForUser`](u, s)'];
    for (const p of proby) expect(ZAKAZANE.some((re) => re.test(p)), p).toBe(true);
    for (const p of ['Bev_kluczeW(o, k)', 'Number.isInteger(x)', 'Object.keys(o)', 'await Le(t)', 'n.deletedAtISO', 'r.deletedWithPatient', 'Bev_wynik(status)',
      'await c.a.getPatientForUser(c.u, id)', "e['deletedAtISO']", 'deleteDatabase: Bob_usunBaze', 'outboxDiscard: Bob_porzuc']) expect(ZAKAZANE.some((re) => re.test(p)), p).toBe(false);
  });

  // Funkcja dostępu do Web Locks (jedyne miejsce z navigator w części Bob_) — lista tekstowa obejmuje resztę części.
  const bezBlokad = (bob) => {
    const i = bob.indexOf('function Bob_blokady(');
    return i < 0 ? bob : bob.slice(0, i) + bob.slice(i + wytnijFunkcje(bob.slice(i), 'Bob_blokady').length);
  };
  it('część Bob_: żaden zakazany wzorzec tekstowy (także w komentarzach) poza funkcją Bob_blokady (navigator tylko tam)', () => {
    znacznikRaz();
    const { bob } = czesci();
    expect(bob.trim().length, 'część Bob_ nie jest pusta').toBeGreaterThan(1000);
    expect(znajdz(ZAKAZANE_BOB, bezBlokad(bob))).toEqual([]);
    const i = bob.indexOf('function Bob_blokady(');
    if (i >= 0) {
      const f = wytnijFunkcje(bob.slice(i), 'Bob_blokady');
      expect(znajdz(ZAKAZANE_BOB, f).filter((x) => !x.startsWith('/navigator/')), 'Bob_blokady: zakazane wzorce poza navigator').toEqual([]);
    }
  });
  it('samokontrola wzorców części Bob_: lista łapie przykładowe naruszenia, przepuszcza zwykły kod magazynu', () => {
    const proby = ['console.log(1)', 'fetch(u)', 'navigator.locks.request(n, f)', 'document.cookie', 'Vn({})', 'V(k)', 'G (iv, d)', 'Le(t)', 'kn("x")',
      'is()', 'xa(u)', 'Bkz_czytaj()', 'Bnp_nagrobek(a, id)', '$s.removeUser(u)', 'a.putPatientForUser(u, p)', 'a.putUserMeta(u, m)', "a['put' + n](x)",
      'x.call(y)', 'f.apply(t, a)', 'Reflect.get(o, k)', 'new Function("x")', 'eval("1")', 'setInterval(f, 1)', 'sessionStorage.getItem(k)',
      'new BroadcastChannel(n)', 'self.postMessage(x)', 'navigator.sendBeacon(u, b)', 'new XMLHttpRequest()', 'a.deleteUserDatabase(u)', 'Bmk_zmien(u, f)'];
    for (const p of proby) expect(ZAKAZANE_BOB.some((re) => re.test(p)), p).toBe(true);
    for (const p of ['Bev_szyfruj(k)', 'Bob_tx(db, s, t, x, f)', 'store.put(w)', 'k.delete(e)', 'store.add(w)', 'Number.isSafeInteger(x)', 'r.onsuccess = f',
      'Bev_BUILDERY[kind](k, dev, o)', 'v.indexedDB', 'v.setTimeout(f, Bob_LIMIT_MS)', 'Object.freeze([])', "meta.get('licznik')", 'I().getRegistryEntry(uid)',
      'idb.deleteDatabase(n)', 'db.transaction(s, t)', 'this.x', 'Bses_zmieniona(s)', 'T()', 'be(w.storageMode)']) expect(ZAKAZANE_BOB.some((re) => re.test(p)), p).toBe(false);
  });

  // Reguła domknięcia (drzewo składni części Bob_ jako skryptu). W uprzęży goły identyfikator trafia w obiekt globalny Node,
  // nie w okno (load-browser-script.mjs: new Function('window', 'globalThis', source)), więc testy dynamiczne by go nie
  // widziały — dlatego lista wolnych identyfikatorów jest zamknięta.
  const WOLNE = new Set(['v', 'T', 'b', 'yt', 'ee', 'lt', 'gt', '$t', 'I', 'ne', 'be', 'Bses_opcje', 'Bses_zmieniona',
    'PatientCheckpointNativeAdapters', 'Object', 'Array', 'JSON', 'Number', 'String', 'Math', 'Promise', 'Uint8Array', 'Error', 'Set',
    'Map', 'Date', 'isFinite', 'undefined']);
  // Pola okna i funkcje, w których wolno ich użyć (napis albo wzorzec nazwy funkcji). E2-PR3a4: localStorage także w odczycie
  // chwili ostatniej wysyłki (Bob_wysylka — pierwszy znacznik przeglądu, tylko getItem klucza integracji).
  const POLA_V = {
    VILDA_EVENT_LOG: ['Bob_bramka'], indexedDB: ['Bob_idb'], crypto: ['Bob_urzadzenie'],
    localStorage: ['Bob_urzadzenie', 'Bob_urzadzenieZapisz', 'Bob_urzadzenieUsun', /^Bob_znacznik[A-Za-z]*$/, 'Bob_poOdblokowaniu', 'Bob_kasujKonto',
      'Bob_wysylka'],
    setTimeout: ['Bob_limit', 'Bob_podBlokada'], clearTimeout: ['Bob_limit', 'Bob_podBlokada'], navigator: ['Bob_blokady'],
    AbortController: ['Bob_podBlokada'],
  };
  const wolnoPole = (pole, gdzie) => POLA_V[pole].some((x) => (x instanceof RegExp ? x.test(gdzie) : x === gdzie));
  // Funkcje chwili (Date bez ograniczeń): teraz, wiek i (E2-PR3a4) cofnięcie chwili o margines okna przeglądu.
  const CHWILA = ['Bob_teraz', 'Bob_wiek', 'Bob_cofnij'];
  // Date wyłącznie jako wywołanie Date.parse(…) (sprawdzenie chwili, bez zegara): odczyt chwili ostatniej wysyłki.
  const TYLKO_PARSE = ['Bob_wysylka'];
  function analizuj(zrodlo) {
    const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const rodzic = new Map();
    const idz = (n, p) => {
      if (!n || typeof n.type !== 'string') return;
      rodzic.set(n, p);
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => idz(y, n)); else if (x && typeof x.type === 'string') idz(x, n); }
    };
    idz(ast, null);
    const funkcje = ast.body.filter((s) => s.type === 'FunctionDeclaration');
    const wFunkcji = (n) => { const f = funkcje.find((x) => x.start <= n.start && n.end <= x.end); return f ? f.id.name : '(najwyższy poziom)'; };
    const naruszenia = [];
    const uzycia = { pola: [], wywolania: [], I: [] };
    for (const r of sm.globalScope.through) {
      const id = r.identifier;
      const nazwa = id.name;
      const gdzie = wFunkcji(id);
      if (!WOLNE.has(nazwa) && !nazwa.startsWith('Bev_')) { naruszenia.push(`wolny identyfikator ${nazwa} w ${gdzie}`); continue; }
      const p = rodzic.get(id);
      if (nazwa === 'v') {
        if (!p || p.type !== 'MemberExpression' || p.object !== id || p.computed || !Object.hasOwn(POLA_V, p.property.name)) {
          naruszenia.push(`v poza dostępem do nazwanego pola okna w ${gdzie}`);
          continue;
        }
        const pole = p.property.name;
        if (!wolnoPole(pole, gdzie)) naruszenia.push(`v.${pole} w ${gdzie}`);
        if (pole === 'crypto') {
          const pp = rodzic.get(p);
          if (!pp || pp.type !== 'MemberExpression' || pp.object !== p || pp.computed || pp.property.name !== 'getRandomValues') naruszenia.push(`v.crypto poza getRandomValues w ${gdzie}`);
        }
        uzycia.pola.push(`${pole}@${gdzie}`);
      }
      const parse = !!p && p.type === 'MemberExpression' && p.object === id && !p.computed && p.property.name === 'parse'
        && rodzic.get(p).type === 'CallExpression' && rodzic.get(p).callee === p;
      if (nazwa === 'Date' && !CHWILA.includes(gdzie) && !(TYLKO_PARSE.includes(gdzie) && parse)) naruszenia.push(`Date w ${gdzie}`);
      if (nazwa === 'I') uzycia.I.push(`${p && p.type === 'CallExpression' && p.callee === id ? 'I()' : 'I'}@${gdzie}`);
    }
    const sprawdzWezel = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'MemberExpression' && n.computed && n.object.type === 'Identifier' && ['v', 'Date', 'Object', 'Reflect'].includes(n.object.name)) {
        naruszenia.push(`dostęp przez nawias do ${n.object.name} w ${wFunkcji(n)}`);
      }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && ['deleteDatabase', 'databases', 'getRegistryEntry', 'request'].includes(n.callee.property.name)) {
        uzycia.wywolania.push(`${n.callee.property.name}@${wFunkcji(n)}`);
      }
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(sprawdzWezel); else if (x && typeof x.type === 'string') sprawdzWezel(x); }
    };
    sprawdzWezel(ast);
    return { naruszenia, uzycia };
  }
  // Liczności w całej części: każde pole i wywołanie dokładnie tam, gdzie wolno, w podanej liczbie.
  function licznosci({ uzycia }) {
    const policz = (lista) => lista.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
    const bledy = [];
    const p = policz(uzycia.pola);
    const raz = { 'VILDA_EVENT_LOG@Bob_bramka': 1, 'indexedDB@Bob_idb': 1, 'crypto@Bob_urzadzenie': 1, 'setTimeout@Bob_limit': 1, 'clearTimeout@Bob_limit': 1 };
    for (const [k, n] of Object.entries(raz)) if (p[k] !== n) bledy.push(`${k}: ${p[k] || 0} zamiast ${n}`);
    // Co najmniej raz i tylko tam (E2-PR3a1): navigator w Bob_blokady, AbortController w Bob_podBlokada.
    const conajmniej = ['navigator@Bob_blokady', 'AbortController@Bob_podBlokada'];
    for (const k of conajmniej) if (!p[k]) bledy.push(`${k}: brak`);
    // Bez liczności (wolno w swoich funkcjach): localStorage w funkcjach identyfikatora urządzenia, znacznika, ponowienia
    // i kasowania konta; zegar limitu blokady w Bob_podBlokada.
    for (const k of Object.keys(p)) if (!raz[k] && !conajmniej.includes(k) && !/^localStorage@/.test(k) && !/^(setTimeout|clearTimeout)@Bob_podBlokada$/.test(k)) bledy.push(`pole okna ${k}`);
    const w = policz(uzycia.wywolania);
    // E2-PR3a4: przegląd sierot (Bob_sieroty) — jedna lista baz i jeden odczyt rejestru przez I() (tylko getRegistryEntry).
    const wolania = {
      'deleteDatabase@Bob_kasujBaze': 1, 'databases@Bob_istnieje': 1, 'databases@Bob_kasujKonto': 1, 'getRegistryEntry@Bob_konto': 1,
      'getRegistryEntry@Bob_poOdblokowaniu': 1, 'request@Bob_podBlokada': 1, 'databases@Bob_sieroty': 1, 'getRegistryEntry@Bob_sieroty': 1,
    };
    for (const [k, n] of Object.entries(wolania)) if (w[k] !== n) bledy.push(`${k}: ${w[k] || 0} zamiast ${n}`);
    for (const k of Object.keys(w)) if (!wolania[k]) bledy.push(`wywołanie ${k}`);
    const ii = [...uzycia.I].sort().join();
    if (ii !== 'I()@Bob_konto,I()@Bob_poOdblokowaniu,I()@Bob_sieroty') bledy.push(`I: ${ii || 'brak'} zamiast po jednym I() w Bob_konto, Bob_poOdblokowaniu i Bob_sieroty`);
    return bledy;
  }

  it('część Bob_: reguła domknięcia — wolne identyfikatory z listy, pola okna w swoich funkcjach, Date w funkcjach chwili, bez nawiasu na v/Date/Object/Reflect, liczności (E2-PR3a1: Web Locks, kasowanie konta, ponowienie; E2-PR3a4: cofnięcie chwili, odczyt chwili ostatniej wysyłki, przegląd sierot)', () => {
    znacznikRaz();
    const wynik = analizuj(czesci().bob);
    expect(wynik.naruszenia).toEqual([]);
    expect(licznosci(wynik)).toEqual([]);
  });
  it('samokontrola reguły domknięcia: przykładowe naruszenia czerwone, zwykły kod magazynu zielony', () => {
    const czerwone = [
      "function Bob_x() { return v['indexedDB']; }", 'function Bob_x() { return globalThis.indexedDB; }', 'function Bob_x(n) { return indexedDB.open(n); }',
      'function Bob_x() { const w = v; return w.indexedDB; }', 'function Bob_x() { const { localStorage: s } = v; return s; }',
      "function Bob_wiek() { return Date['now'](); }", 'function Bob_x(f) { return setTimeout(f, 1); }', 'function Bob_x() { return v.document; }',
      'function Bob_x(f) { return Bob_y(v); }', 'function Bob_y() {} function Bob_x() { return Date.now(); }', 'function Bob_idb() { return v.localStorage; }',
      'function Bob_x() { return localStorage.getItem("k"); }', 'function Bob_urzadzenie() { return v.crypto.subtle; }', "function Bob_x(o) { return Object['keys'](o); }",
      'function Bob_x() { return window.VILDA_EVENT_LOG; }', 'function Bob_x() { return self.crypto; }',
    ];
    for (const p of czerwone) expect(analizuj(p).naruszenia.length, p).toBeGreaterThan(0);
    const zielone = [
      "const Bob_ALFABET = 'ab'; function Bob_z(bajt) { return Bob_ALFABET[bajt & 31]; }", 'function Bob_idb() { return v.indexedDB; }',
      'function Bob_wiek(i) { return Date.now() - Date.parse(i); }', 'function Bob_teraz() { return new Date().toISOString(); }',
      'function Bob_bramka() { try { return v.VILDA_EVENT_LOG === true; } catch (x) { return false; } }',
      'function Bob_urzadzenie(u) { const b8 = v.crypto.getRandomValues(new Uint8Array(8)); return v.localStorage.getItem(u) || b8; }',
      'function Bob_x(o) { return Object.keys(o).map((k) => Bev_utf8(k)); }', 'async function Bob_konto(u) { return I().getRegistryEntry(u); }',
    ];
    for (const p of zielone) expect(analizuj(p).naruszenia, p).toEqual([]);
    // E2-PR3a1: navigator, AbortController i localStorage tylko w swoich funkcjach.
    for (const p of ['function Bob_x() { return v.navigator; }', 'function Bob_podBlokada() { return v.navigator.locks; }', 'function Bob_x() { return new v.AbortController(); }',
      'function Bob_dopisz(u) { v.localStorage.setItem(u, "1"); }', 'function Bob_blokady() { return v.localStorage; }']) expect(analizuj(p).naruszenia.length, p).toBeGreaterThan(0);
    for (const p of ['function Bob_blokady() { try { return v.navigator.locks; } catch (x) { return null; } }', 'function Bob_podBlokada(f) { const c = new v.AbortController(); v.setTimeout(f, 1); return c; }',
      'function Bob_znacznikZapisz(u) { v.localStorage.setItem(u, "1"); }', 'function Bob_poOdblokowaniu() { return v.localStorage.length; }']) expect(analizuj(p).naruszenia, p).toEqual([]);
    // E2-PR3a4: w odczycie chwili ostatniej wysyłki Date tylko jako Date.parse(…); cofnięcie chwili — funkcja chwili.
    for (const p of ['function Bob_wysylka(u) { return Date.now(); }', 'function Bob_wysylka(u) { return new Date(u).toISOString(); }', 'function Bob_wysylka(u) { const f = Date.parse; return f(u); }',
      "function Bob_wysylka(u) { return Date['parse'](u); }", 'function Bob_przeglad(u) { return Date.parse(u); }', 'function Bob_wysylka(u) { return v.indexedDB; }']) expect(analizuj(p).naruszenia.length, p).toBeGreaterThan(0);
    for (const p of ['function Bob_wysylka(u) { const x = v.localStorage.getItem(u); return isFinite(Date.parse(x)) ? x : ""; }',
      'function Bob_cofnij(i, ms) { const t = Date.parse(i); return isFinite(t) ? new Date(t - ms).toISOString() : ""; }']) expect(analizuj(p).naruszenia, p).toEqual([]);
    expect(licznosci(analizuj('function Bob_x(l) { return l.request("n", f); }')).join()).toContain('wywołanie request@Bob_x');
    // liczności: drugie I() i wywołanie kasowania poza Bob_usunBaze
    expect(licznosci(analizuj('function Bob_konto(u) { I(); return I().getRegistryEntry(u); }')).join()).toContain('I:');
    expect(licznosci(analizuj('function Bob_inna(i, n) { return i.deleteDatabase(n); }')).join()).toContain('deleteDatabase@Bob_inna');
  });

  // ── E2-PR2b2: funkcje kwarantanny i podsumowania wyniku ──
  // Nazwa wewnętrzna klucza eksportu z literału Bev_EKSPORT.
  function wewnetrzna(klucz) {
    const m = literalEksportu().tekst.match(new RegExp(`\\b${klucz}\\s*:\\s*(B(?:ev|ob|em)_[A-Za-z0-9_$]*)`));
    if (!m) throw new Error(`brak klucza ${klucz} w literale Bev_EKSPORT`);
    return m[1];
  }
  // Domknięcie wywołań od funkcji start: przez odwołania do funkcji i stałych najwyższego poziomu kodu (obie części
  // bloku); wynik — osiągnięte nazwy i wolne identyfikatory (spoza kodu) użyte w domknięciu, z miejscem użycia.
  function domkniecie(zrodlo, start) {
    const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const gora = new Map();
    for (const s of ast.body) {
      if (s.type === 'FunctionDeclaration') gora.set(s.id.name, s);
      else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') gora.set(d.id.name, d);
    }
    const referencje = sm.scopes.flatMap((sc) => sc.references);
    const osiagniete = new Set();
    const wolne = [];
    const kolejka = [start];
    while (kolejka.length) {
      const nazwa = kolejka.shift();
      if (osiagniete.has(nazwa)) continue;
      const wezel = gora.get(nazwa);
      if (!wezel) throw new Error(`brak deklaracji ${nazwa}`);
      osiagniete.add(nazwa);
      for (const r of referencje) {
        const [p, k] = r.identifier.range;
        if (p < wezel.range[0] || k > wezel.range[1]) continue;
        if (!r.resolved) wolne.push([r.identifier.name, nazwa]);
        else if (r.resolved.scope.type === 'global' && gora.has(r.identifier.name)) kolejka.push(r.identifier.name);
      }
    }
    return { osiagniete, wolne };
  }
  // Wolne identyfikatory dozwolone w czystej funkcji (bez okna, stanu logowania, sejfu, rejestru, zegara i losowości).
  const CZYSTE = new Set(['Object', 'Array', 'Number', 'String', 'Boolean', 'JSON', 'Math', 'RegExp', 'Set', 'Map', 'isFinite', 'undefined', 'NaN', 'Infinity']);
  const nieczyste = (zrodlo, start) => domkniecie(zrodlo, start).wolne.filter(([n]) => !CZYSTE.has(n)).map(([n, f]) => `${n} w ${f}`);

  it('U2(c) (E2-PR2b2): funkcje eksportu kwarantanny i podsumowania wyniku to deklaracje najwyższego poziomu części Bob_ (obejmuje je lista tekstowa i reguła domknięcia); operacje kwarantanny async, podsumowanie wyniku nie', () => {
    znacznikRaz();
    const ast = parse(czesci().bob, { ecmaVersion: 'latest', sourceType: 'script' });
    const dekl = new Map(ast.body.filter((s) => s.type === 'FunctionDeclaration').map((s) => [s.id.name, s]));
    for (const k of KLUCZE_KWARANTANNY) {
      const n = wewnetrzna(k);
      expect(n.startsWith('Bob_'), `${k} → ${n}`).toBe(true);
      expect(dekl.has(n), `${k}: deklaracja ${n} w części Bob_`).toBe(true);
      expect(dekl.get(n).async, `${k}: async`).toBe(k !== 'resultSummary');
      expect(dekl.get(n).generator, `${k}: bez generatora`).toBe(false);
    }
  });

  it('U2(c) (E2-PR2b2): resultSummary jest czysta — w domknięciu wywołań (funkcje i stałe bloku osiągalne z niej) wolne identyfikatory tylko z listy czystych (bez v, b, T, I, ne, Bses_, Date, Promise)', () => {
    znacznikRaz();
    const n = wewnetrzna('resultSummary');
    const { osiagniete } = domkniecie(blok().tekst, n);
    expect(osiagniete.has(n)).toBe(true);
    expect(nieczyste(blok().tekst, n)).toEqual([]);
    expect([...osiagniete].filter((x) => ['Bob_wejscie', 'Bob_bramka', 'Bob_teraz', 'Bob_wiek', 'Bob_konto', 'Bob_otworz', 'Bob_idb'].includes(x)), 'funkcje wejścia, chwili i bazy').toEqual([]);
  });

  it('samokontrola domknięcia czystości: odwołanie (także przez funkcję pomocniczą albo stałą) do v, Date, I(), b, T, Bses_ albo Promise jest czerwone; czyste funkcje i stałe bloku zielone', () => {
    const czerwone = [
      'function Bob_s(w) { return Bob_p(w); } function Bob_p(w) { return v.x; }',
      'function Bob_s(w) { return { t: Bob_teraz() }; } function Bob_teraz() { return new Date().toISOString(); }',
      'function Bob_s(w) { return I().getRegistryEntry(b); }',
      'const Bob_X = Object.freeze([Bob_f]); function Bob_s(w) { return Bob_X[0](w); } function Bob_f() { return Bses_opcje(null); }',
      'function Bob_s(w) { return Promise.resolve(w); }',
      'function Bob_s(w) { return Bev_obiekt(w) && T(); } function Bev_obiekt(x) { return !!x; }',
      'function Bob_s(w) { return Bev_p(w); } function Bev_p(w) { return Bob_q(w); } function Bob_q() { return Date.now(); }',
    ];
    for (const kod of czerwone) expect(nieczyste(kod, 'Bob_s').length, kod).toBeGreaterThan(0);
    const zielone = [
      "const Bob_KOD = /^[A-Z]+$/; const Bob_P = Object.freeze(['a']); function Bob_s(w) { return Bev_obiekt(w) && Bob_KOD.test(w.code) && Bob_P.indexOf(w.reason) >= 0 ? { status: String(w.status) } : { status: 'nieznany' }; } function Bev_obiekt(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }",
      'function Bob_s(w) { const l = {}; Object.keys(w).forEach(function (k) { if (/Count$/.test(k) && Number.isSafeInteger(w[k])) l[k] = w[k]; }); return JSON.parse(JSON.stringify(l)); }',
      'function Bob_s(w) { return Bob_t(w); } function Bob_t(w) { return w; } function Bob_inna() { return v.indexedDB; }',
    ];
    for (const kod of zielone) expect(nieczyste(kod, 'Bob_s'), kod).toEqual([]);
  });

  // ── E2-PR3a2: reguła domknięcia części emisji (Bem_) ──
  // Wolne identyfikatory części Bem_: funkcje części Bob_ i sesji z listy, stałe języka (Map i Set — stan części
  // w new Map() / new Set(); undefined — argument opcji dopisania). E2-PR3a4: silnik przeglądu kolejki, próg okna i doba
  // (część b — tam zegar), pary z ładunku scalania (część a, funkcja czysta).
  const WOLNE_BEM = new Set(['Bob_bramka', 'T', 'Bob_trybPrywatny', 'Bob_idb', 'Bob_wejscie', 'Bob_argumentyDopisania', 'Bob_dopiszZ',
    'Bses_opcje', 'Bses_zmieniona', 'Promise', 'Array', 'Object', 'String', 'Map', 'Set', 'undefined',
    'Bob_przeglad', 'Bob_przegladProg', 'Bob_przegladNalezny', 'Bev_pary']);
  // Zakazane w części Bem_ w każdym miejscu drzewa (wolne, lokalne i jako nazwy pól): okno, zegar, magazyny przeglądarki,
  // sieć, Web Locks, konsola.
  const ZAKAZANE_BEM = ['v', 'Date', 'setTimeout', 'localStorage', 'indexedDB', 'navigator', 'fetch', 'console'];
  // Funkcje części Bem_ wołane z emiterów i operacji: synchroniczne (emitery nie czekają na wynik kolejki). E2-PR3a3:
  // także sekcje pliku i znak końca partii (wołane z importów), rejestracja słuchacza partii i powiadomienie słuchaczy.
  // E2-PR3a4: wstawki przeglądu kolejki (Bem_przeglad w odblokowaniu, Bem_zChmury w scalaniu), eksport sweepOutbox,
  // przegląd po bezczynności łańcucha i warunek kolejki.
  const SYNCHRONICZNE_BEM = ['Bem_hak', 'Bem_zHaka', 'Bem_zmiana', 'Bem_krokStart', 'Bem_krokKoniec', 'Bem_sekcje', 'Bem_partia', 'Bem_naPartie',
    'Bem_powiadom', 'Bem_zChmury', 'Bem_przeglad', 'Bem_przegladTeraz', 'Bem_poBezczynnosci', 'Bem_kolejka', 'Bem_brak', 'Bem_kluczEncji'];
  // Warunek otwartego kroku w Bem_zChmury (przed bramką: importy w kroku nie czytają bramki).
  const WARUNEK_KROKU = "if ((Bem_kroki.get('n') || 0) > 0) return;";
  function analizujBem(zrodlo) {
    const ast = parse(zrodlo, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const funkcje = ast.body.filter((s) => s.type === 'FunctionDeclaration');
    const wFunkcji = (n) => { const f = funkcje.find((x) => x.start <= n.start && n.end <= x.end); return f ? f.id.name : '(najwyższy poziom)'; };
    const naruszenia = [];
    const gdzie = {};
    for (const r of sm.globalScope.through) {
      const nazwa = r.identifier.name;
      const f = wFunkcji(r.identifier);
      if (!WOLNE_BEM.has(nazwa)) naruszenia.push(`wolny identyfikator ${nazwa} w ${f}`);
      (gdzie[nazwa] = gdzie[nazwa] || []).push(f);
    }
    const sprawdz = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Identifier' && ZAKAZANE_BEM.includes(n.name)) naruszenia.push(`${n.name} w ${wFunkcji(n)}`);
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(sprawdz); else if (x && typeof x.type === 'string') sprawdz(x); }
    };
    sprawdz(ast);
    // Bramka: po jednym odwołaniu w Bem_zmiana, Bem_przeglad i Bem_zChmury (E2-PR3a4). W Bem_zmiana i Bem_przeglad — pierwsza
    // instrukcja `if (!Bob_bramka()) return…;` (w Bem_przeglad wynik to Promise.resolve z literałem obiektu — bez odczytów),
    // w Bem_zChmury — pierwsza po warunku otwartego kroku (WARUNEK_KROKU); po bramce jedna instrukcja try z catch (emisja,
    // przegląd i pary scalania nigdy nie rzucają). Bem_poBezczynnosci — jedno try z catch.
    const dekl = new Map(funkcje.map((s) => [s.id.name, s]));
    const literalny = (n) => !!n && (n.type === 'Literal' || (n.type === 'ObjectExpression' && n.properties.every((q) => q.type === 'Property' && !q.computed && q.kind === 'init' && literalny(q.value))));
    const bramka = (g, zWynikiem) => !!g && g.type === 'IfStatement' && !g.alternate && g.test.type === 'UnaryExpression' && g.test.operator === '!' &&
      g.test.argument.type === 'CallExpression' && g.test.argument.callee.type === 'Identifier' && g.test.argument.callee.name === 'Bob_bramka' &&
      !g.test.argument.arguments.length && g.consequent.type === 'ReturnStatement' && (zWynikiem
      ? (() => { const a = g.consequent.argument; return !!a && a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && !a.callee.computed
        && a.callee.object.type === 'Identifier' && a.callee.object.name === 'Promise' && a.callee.property.name === 'resolve' && a.arguments.length === 1 && literalny(a.arguments[0]); })()
      : !g.consequent.argument);
    const tryZCatch = (t) => !!t && t.type === 'TryStatement' && !!t.handler;
    const zm = dekl.get('Bem_zmiana');
    const [g, t] = zm ? zm.body.body : [];
    if (!bramka(g, false)) naruszenia.push('Bem_zmiana: pierwsza instrukcja inna niż if (!Bob_bramka()) return;');
    if (!zm || zm.body.body.length !== 2 || !tryZCatch(t)) naruszenia.push('Bem_zmiana: po bramce inna instrukcja niż jedno try z catch');
    const pr = dekl.get('Bem_przeglad');
    if (!pr || !bramka(pr.body.body[0], true)) naruszenia.push('Bem_przeglad: pierwsza instrukcja inna niż if (!Bob_bramka()) return Promise.resolve({ … literały });');
    if (!pr || pr.body.body.length !== 2 || !tryZCatch(pr.body.body[1])) naruszenia.push('Bem_przeglad: po bramce inna instrukcja niż jedno try z catch');
    const zc = dekl.get('Bem_zChmury');
    const [k0, g0, t0] = zc ? zc.body.body : [];
    if (!k0 || zrodlo.slice(k0.start, k0.end) !== WARUNEK_KROKU) naruszenia.push(`Bem_zChmury: pierwsza instrukcja inna niż ${WARUNEK_KROKU}`);
    if (!bramka(g0, false)) naruszenia.push('Bem_zChmury: druga instrukcja inna niż if (!Bob_bramka()) return;');
    if (!zc || zc.body.body.length !== 3 || !tryZCatch(t0)) naruszenia.push('Bem_zChmury: po bramce inna instrukcja niż jedno try z catch');
    const pb = dekl.get('Bem_poBezczynnosci');
    if (!pb || pb.body.body.length !== 1 || !tryZCatch(pb.body.body[0])) naruszenia.push('Bem_poBezczynnosci: nie jedno try z catch');
    const br = dekl.get('Bem_brak');
    if (!br || br.body.body.length !== 1 || !tryZCatch(br.body.body[0])) naruszenia.push('Bem_brak: nie jedno try z catch');
    const odwolania = (gdzie.Bob_bramka || []).slice().sort().join();
    if (odwolania !== 'Bem_przeglad,Bem_zChmury,Bem_zmiana') naruszenia.push(`Bob_bramka: ${odwolania || 'brak'} zamiast po jednym odwołaniu w Bem_zmiana, Bem_przeglad i Bem_zChmury`);
    for (const n of ['Bob_wejscie', 'Bob_dopiszZ']) {
      const w = gdzie[n] || [];
      if (!w.length || w.some((f) => f !== 'Bem_dopisz')) naruszenia.push(`${n}: ${w.join() || 'brak'} zamiast wyłącznie w Bem_dopisz`);
    }
    const dop = dekl.get('Bem_dopisz');
    if (!dop || !dop.async || dop.body.body.length !== 1 || dop.body.body[0].type !== 'TryStatement' || !dop.body.body[0].handler) naruszenia.push('Bem_dopisz: nie async z jednym try z catch (dopisanie nigdy nie odrzuca)');
    for (const n of SYNCHRONICZNE_BEM) {
      const s = dekl.get(n);
      if (!s) naruszenia.push(`brak deklaracji ${n}`);
      else if (s.async || s.generator) naruszenia.push(`${n}: async albo generator`);
    }
    return naruszenia;
  }

  it('część Bem_ (E2-PR3a2, E2-PR3a4): reguła domknięcia — wolne identyfikatory z listy, Bob_bramka tylko jako pierwsza instrukcja Bem_zmiana i Bem_przeglad oraz pierwsza po warunku kroku w Bem_zChmury, Bob_wejscie i Bob_dopiszZ tylko w Bem_dopisz, bez v, Date, setTimeout, localStorage, indexedDB, navigator, fetch i console; emisja, kroki i wstawki przeglądu synchroniczne', () => {
    znacznikEmisjiRaz();
    const { bem } = czesci();
    expect(bem.trim().length, 'część Bem_ nie jest pusta').toBeGreaterThan(1000);
    expect(analizujBem(bem)).toEqual([]);
  });

  it('część Bem_ (E2-PR3a2): Bem_zHaka jest czysta — synchroniczna, w domknięciu wywołań wolne identyfikatory tylko z listy czystych, bez bramki, emisji, sesji i funkcji części Bob_', () => {
    znacznikEmisjiRaz();
    const { osiagniete } = domkniecie(blok().tekst, 'Bem_zHaka');
    expect(osiagniete.has('Bem_zHaka')).toBe(true);
    expect(nieczyste(blok().tekst, 'Bem_zHaka')).toEqual([]);
    expect([...osiagniete].filter((x) => !x.startsWith('Bem_') || ['Bem_zmiana', 'Bem_hak', 'Bem_doLancucha', 'Bem_dopisz'].includes(x)), 'funkcje bramki, emisji i magazynu w domknięciu').toEqual([]);
    const ast = parse(czesci().bem, { ecmaVersion: 'latest', sourceType: 'script' });
    const f = ast.body.find((s) => s.type === 'FunctionDeclaration' && s.id.name === 'Bem_zHaka');
    expect(!!f && !f.async && !f.generator, 'Bem_zHaka synchroniczna').toBe(true);
  });

  it('część Bem_ (E2-PR3a3): Bem_partia, Bem_naPartie i Bem_powiadom są czyste — w domknięciu wywołań bez bramki, emisji, sesji, części Bob_ i pól okna; Bem_sekcje sięga poza siebie tylko do Bem_SEKCJE i Bem_zmiana (bramka wyłącznie przez emisję)', () => {
    znacznikEmisjiRaz();
    const tekst = blok().tekst;
    for (const nazwa of ['Bem_partia', 'Bem_naPartie', 'Bem_powiadom']) {
      const { osiagniete } = domkniecie(tekst, nazwa);
      expect(osiagniete.has(nazwa), nazwa).toBe(true);
      expect(nieczyste(tekst, nazwa), `${nazwa}: wolne identyfikatory spoza listy czystych`).toEqual([]);
      expect([...osiagniete].filter((x) => !x.startsWith('Bem_') || ['Bem_zmiana', 'Bem_hak', 'Bem_sekcje', 'Bem_doLancucha', 'Bem_dopisz'].includes(x)),
        `${nazwa}: funkcje bramki, emisji i magazynu w domknięciu`).toEqual([]);
    }
    const ast = parse(czesci().bem, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const f = ast.body.find((s) => s.type === 'FunctionDeclaration' && s.id.name === 'Bem_sekcje');
    expect(!!f, 'deklaracja Bem_sekcje').toBe(true);
    const odwolania = sm.scopes.flatMap((sc) => sc.references)
      .filter((r) => r.identifier.range[0] >= f.range[0] && r.identifier.range[1] <= f.range[1])
      .filter((r) => !r.resolved || r.resolved.scope.type === 'global')
      .map((r) => r.identifier.name);
    expect([...new Set(odwolania)].filter((n) => !CZYSTE.has(n)).sort(), 'Bem_sekcje: odwołania poza funkcję').toEqual(['Bem_SEKCJE', 'Bem_zmiana']);
  });

  it('część Bev_ (E2-PR3a4): Bev_pary (pary z ładunku scalania, wołana z Bem_zChmury) jest czysta — synchroniczna, w domknięciu wywołań wolne identyfikatory tylko z listy czystych i Bkz_ostatnie (funkcja spoza bloku, czysta — przypadek niżej), bez adaptera sejfu, sesji, bramki, zegara i części Bob_ i Bem_', () => {
    znacznikEmisjiRaz();
    const ast = parse(czesci().bev, { ecmaVersion: 'latest', sourceType: 'script' });
    for (const n of ['Bev_pary', 'Bev_chwila']) {
      const f = ast.body.find((x) => x.type === 'FunctionDeclaration' && x.id.name === n);
      expect(!!f && !f.async && !f.generator, `${n}: deklaracja w części Bev_, synchroniczna`).toBe(true);
    }
    const tekst = blok().tekst;
    const { osiagniete } = domkniecie(tekst, 'Bev_pary');
    expect(osiagniete.has('Bev_chwila'), 'Bev_chwila w domknięciu').toBe(true);
    expect(nieczyste(tekst, 'Bev_pary'), 'wolne identyfikatory spoza listy czystych').toEqual(['Bkz_ostatnie w Bev_chwila']);
    expect([...osiagniete].filter((x) => !x.startsWith('Bev_') || ['Bev_start', 'Bev_meta', 'Bev_przeglad', 'Bev_ostatnieScalenie', 'Bev_odszyfruj', 'Bev_zastosuj', 'Bev_szyfruj'].includes(x)),
      'adapter sejfu, szyfrowanie i części Bob_ i Bem_ w domknięciu').toEqual([]);
  });

  it('część Bev_ (E2-PR3a4): Bkz_ostatnie i Bkz_pozniejsza (spoza bloku, w domknięciu Bev_chwila) są czyste — deklaracje funkcji dokładnie raz w pliku, synchroniczne, w ciele wyłącznie parametry, arguments, zmienne lokalne i literały (Bkz_ostatnie woła tylko Bkz_pozniejsza)', () => {
    const ast = parse(ZRODLO, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const deklaracje = [];
    const idz = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'FunctionDeclaration' && n.id && ['Bkz_ostatnie', 'Bkz_pozniejsza'].includes(n.id.name)) deklaracje.push(n);
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(idz); else if (x && typeof x.type === 'string') idz(x); }
    };
    idz(ast);
    for (const [nazwa, spoza] of [['Bkz_ostatnie', ['Bkz_pozniejsza']], ['Bkz_pozniejsza', []]]) {
      const d = deklaracje.filter((f) => f.id.name === nazwa);
      expect(d, `${nazwa}: deklaracja dokładnie raz`).toHaveLength(1);
      expect(!d[0].async && !d[0].generator, `${nazwa}: synchroniczna`).toBe(true);
      const zakresy = new Set();
      const dodaj = (sc) => { zakresy.add(sc); sc.childScopes.forEach(dodaj); };
      dodaj(sm.acquire(d[0]));
      const odwolania = [...zakresy].flatMap((sc) => sc.references).filter((r) => !(r.resolved && zakresy.has(r.resolved.scope))).map((r) => r.identifier.name);
      expect([...new Set(odwolania)].sort(), `${nazwa}: odwołania poza parametry, arguments i zmienne lokalne`).toEqual(spoza);
    }
  });

  it('samokontrola reguły domknięcia części Bem_: okno, zegar, magazyny, sieć, konsola, stan logowania, bramka poza Bem_zmiana albo nie jako pierwsza instrukcja, wejście i dopisanie poza Bem_dopisz, emisja async — czerwone; część w kształcie z projektu zielona (E2-PR3a4: z przeglądem kolejki i parami scalania)', () => {
    const DOBRA = [
      'const Bem_ogony = new Map();',
      'const Bem_kroki = new Map();',
      'function Bem_zHaka(n, d) { try { return d && Object.hasOwn(d, "id") ? ["pnote", String(d.id)] : null; } catch (x) { return null; } }',
      'function Bem_hak(n, d) { const z = Bem_zHaka(n, d); if (z) Bem_zmiana(z[0], z[1]); }',
      'function Bem_zmiana(kind, klucze, s) { if (!Bob_bramka()) return; try { if (!T() || !Bob_trybPrywatny() || !Bob_idb()) return; const ses = s && s.Bses_s ? s : Bses_opcje(null); if (Bses_zmieniona(ses)) return; for (const k of Array.isArray(klucze) ? klucze : [klucze]) { if (Bob_argumentyDopisania(kind, k, undefined)) continue; Bem_doLancucha({ kind: kind, klucze: k, s: ses, uid: ses.Bses_s.u }); } } catch (x) { } }',
      'function Bem_krokStart() { Bem_kroki.set("n", (Bem_kroki.get("n") || 0) + 1); }',
      'function Bem_krokKoniec() { const byly = new Set(); Bem_kroki.delete("n"); return byly; }',
      'function Bem_doLancucha(z) { const p = (Bem_ogony.get(z.uid) || Promise.resolve()).then(function () { return Bem_dopisz(z); }); Bem_ogony.set(z.uid, p); }',
      'async function Bem_dopisz(z) { try { if (Bob_wejscie() || Bob_argumentyDopisania(z.kind, z.klucze, undefined)) return; await Bob_dopiszZ(z.kind, z.klucze, undefined, z.s, z.uid); } catch (x) { } }',
      'function Bem_gotowe() { return Promise.all(Array.from(Bem_ogony.values())).then(function () { return undefined; }); }',
      'const Bem_partie = new Set();',
      'const Bem_sluchaczePartii = new Set();',
      'function Bem_sekcje(l, s) { try { const ids = Array.isArray(l.patientNotes) ? l.patientNotes.map(function (e) { return e.id; }) : []; if (ids.length) Bem_zmiana("pnote", ids, s); const k = l.userPreferences && typeof l.userPreferences === "object" ? Object.keys(l.userPreferences) : []; if (k.length) Bem_zmiana("pref", k, s); } catch (x) { } }',
      'function Bem_partia(nazwa) { if ((Bem_kroki.get("n") || 0) > 0) Bem_partie.add(String(nazwa)); }',
      'function Bem_naPartie(cb) { if (typeof cb === "function") Bem_sluchaczePartii.add(cb); }',
      'function Bem_powiadom(p) { Bem_sluchaczePartii.forEach(function (cb) { try { cb({ reason: p.reason, count: p.wiersze }); } catch (x) { } }); }',
      // E2-PR3a4: przegląd kolejki i pary scalania.
      'const Bem_RANGI = Object.freeze({ snap: 0, cred: 12 });',
      'const Bem_pary = new Map();',
      'const Bem_pilne = new Set();',
      'const Bem_poKroku = new Map();',
      'function Bem_kolejka() { if (!T()) return "zablokowany"; if (!Bob_trybPrywatny()) return "tryb"; return Bob_idb() ? null : "brak-indexeddb"; }',
      "function Bem_zChmury(t) { if ((Bem_kroki.get('n') || 0) > 0) return; if (!Bob_bramka()) return; try { if (Bem_kolejka()) return; const uid = Bses_opcje(null).Bses_s.u; const prog = Bob_przegladProg(uid); const m = Bem_pary.get(uid) || new Map(); Bev_pary(t).forEach(function (p) { if (!prog || p[1] > prog) m.set(p[0], p[1]); }); Bem_pary.set(uid, m); } catch (x) { } }",
      'function Bem_przeglad(sieroty) { if (!Bob_bramka()) return Promise.resolve({ ok: false, powod: "bramka" }); try { const odm = Bem_kolejka(); if (odm) return Promise.resolve({ ok: false, powod: odm }); const s = Bses_opcje(null); return new Promise(function (g) { Bem_doLancucha({ uid: s.Bses_s.u, s: s, przeglad: true, sieroty: sieroty === true, gotowe: [g] }); }); } catch (x) { return Promise.resolve({ ok: false, powod: "blad" }); } }',
      'function Bem_przegladTeraz() { return Bem_przeglad(false); }',
      'async function Bem_przegladKrok(z) { let w; try { w = await Bob_przeglad(z.uid, z.s, Bem_pary.get(z.uid) || null, Bem_RANGI, z.sieroty === true); Bob_przegladProg(z.uid); } catch (x) { w = { ok: false }; } z.gotowe.forEach(function (f) { f(w); }); return w; }',
      'function Bem_poBezczynnosci(uid) { try { if (!Bem_pilne.has(uid) && !Bob_przegladNalezny(uid)) return; if (!T() || Bses_opcje(null).Bses_s.u !== uid) return; Bem_pilne.delete(uid); Bem_przeglad(false); } catch (x) { } }',
      // E2-PR3a4: pamięć braków.
      'const Bem_braki = new Map();',
      'function Bem_kluczEncji(z) { return z.kind + "|" + String(z.klucze); }',
      'function Bem_brak(z, w) { try { const m = Bem_braki.get(z.uid) || new Map(); if (w.ok === true) m.delete(Bem_kluczEncji(z)); else m.set(Bem_kluczEncji(z), { kind: z.kind, klucze: z.klucze }); Bem_braki.set(z.uid, m); } catch (x) { } }',
    ].join('\n');
    expect(analizujBem(DOBRA)).toEqual([]);
    const czerwone = [
      DOBRA.replace('if (!T() ||', 'if (!v.indexedDB || !T() ||'),
      DOBRA.replace('{ if (!Bob_bramka()) return; try {', '{ try { if (!Bob_bramka()) return;'),
      DOBRA.replace('{ if (!Bob_bramka()) return; try {', '{ if (!T()) return; if (!Bob_bramka()) return; try {'),
      DOBRA.replace('{ if (!Bob_bramka()) return; try {', '{ if (!Bob_bramka()) { return; } try {'),
      DOBRA.replace('{ if (!Bob_bramka()) return; try {', '{ if (!Bob_bramka()) return; Bses_opcje(null); try {'),
      DOBRA.replace('function Bem_hak(n, d) { const z', 'function Bem_hak(n, d) { if (!Bob_bramka()) return; const z'),
      DOBRA.replace('function Bem_hak(n, d) { const z', 'function Bem_hak(n, d) { if (Bob_wejscie()) return; const z'),
      DOBRA.replace('Bem_ogony.set(z.uid, p); }', 'Bem_ogony.set(z.uid, p); Bob_dopiszZ(z.kind, z.klucze); }'),
      DOBRA.replace('function Bem_zmiana(kind, klucze, s) {', 'async function Bem_zmiana(kind, klucze, s) {'),
      DOBRA.replace('function Bem_krokStart() {', 'async function Bem_krokStart() {'),
      DOBRA.replace('try { if (Bob_wejscie() ||', 'if (Bob_wejscie()) return; try { if (Bob_wejscie() ||'),
      DOBRA.replace('} catch (x) { } }\nfunction Bem_krokStart', '} finally { } }\nfunction Bem_krokStart'),
      `${DOBRA}\nfunction Bem_x() { return Date.now(); }`,
      `${DOBRA}\nfunction Bem_x(f) { return setTimeout(f, 1); }`,
      `${DOBRA}\nfunction Bem_x() { return globalThis.localStorage; }`,
      `${DOBRA}\nfunction Bem_x() { const indexedDB = 1; return indexedDB; }`,
      `${DOBRA}\nfunction Bem_x() { return window.navigator; }`,
      `${DOBRA}\nfunction Bem_x(u) { return fetch(u); }`,
      `${DOBRA}\nfunction Bem_x() { console.info(1); }`,
      `${DOBRA}\nfunction Bem_x() { return b; }`,
      `${DOBRA}\nfunction Bem_x() { return I().getRegistryEntry(1); }`,
      `${DOBRA}\nfunction Bem_x() { return Bob_dopiszPod(); }`,
      `${DOBRA}\nfunction Bem_x() { return crypto.subtle; }`,
      // E2-PR3a3: sekcje pliku z bramką poza Bem_zmiana, powiadomienie z konsolą, partia z polem okna, funkcje partii async.
      DOBRA.replace('function Bem_sekcje(l, s) { try {', 'function Bem_sekcje(l, s) { if (!Bob_bramka()) return; try {'),
      DOBRA.replace('try { cb({ reason: p.reason, count: p.wiersze }); } catch (x) { }', 'try { cb({ reason: p.reason, count: p.wiersze }); } catch (x) { console.warn(x); }'),
      DOBRA.replace('if (typeof cb === "function") Bem_sluchaczePartii.add(cb);', 'if (typeof cb === "function" && v.VILDA_EVENT_LOG) Bem_sluchaczePartii.add(cb);'),
      DOBRA.replace('function Bem_partia(nazwa) {', 'async function Bem_partia(nazwa) {'),
      DOBRA.replace('function Bem_powiadom(p) {', 'async function Bem_powiadom(p) {'),
      DOBRA.replace('function Bem_powiadom(p) { Bem_sluchaczePartii.forEach(function (cb) {', 'function Bem_powiadom(p) { Bob_wejscie(); Bem_sluchaczePartii.forEach(function (cb) {'),
      // E2-PR3a4: bramka przeglądu nie pierwsza, bez bramki, z odczytem w wyniku odmowy; pary scalania z bramką przed
      // warunkiem kroku, bez warunku kroku, bez catch; przegląd po bezczynności bez try i z drugą bramką; async, zegar,
      // pole okna, dopisanie i wejście poza Bem_dopisz, funkcja części Bob_ spoza listy.
      DOBRA.replace('function Bem_przeglad(sieroty) { if (!Bob_bramka())', 'function Bem_przeglad(sieroty) { const z0 = Bem_kolejka(); if (!Bob_bramka())'),
      DOBRA.replace('function Bem_przeglad(sieroty) { if (!Bob_bramka()) return Promise.resolve({ ok: false, powod: "bramka" }); try {', 'function Bem_przeglad(sieroty) { try {'),
      DOBRA.replace('return Promise.resolve({ ok: false, powod: "bramka" }); try { const odm', 'return Promise.resolve({ ok: false, powod: Bem_kolejka() }); try { const odm'),
      DOBRA.replace('return Promise.resolve({ ok: false, powod: "bramka" }); try { const odm', 'return { ok: false, powod: "bramka" }; try { const odm'),
      DOBRA.replace("function Bem_zChmury(t) { if ((Bem_kroki.get('n') || 0) > 0) return; if (!Bob_bramka()) return;", "function Bem_zChmury(t) { if (!Bob_bramka()) return; if ((Bem_kroki.get('n') || 0) > 0) return;"),
      DOBRA.replace("function Bem_zChmury(t) { if ((Bem_kroki.get('n') || 0) > 0) return; if (!Bob_bramka()) return;", 'function Bem_zChmury(t) { if (!Bob_bramka()) return;'),
      DOBRA.replace("function Bem_zChmury(t) { if ((Bem_kroki.get('n') || 0) > 0) return;", "function Bem_zChmury(t) { if ((Bem_kroki.get('n') || 0) > 1) return;"),
      DOBRA.replace('Bem_pary.set(uid, m); } catch (x) { } }', 'Bem_pary.set(uid, m); } finally { } }'),
      DOBRA.replace('function Bem_poBezczynnosci(uid) { try { if', 'function Bem_poBezczynnosci(uid) { if (!T()) return; try { if'),
      DOBRA.replace('function Bem_poBezczynnosci(uid) { try { if', 'function Bem_poBezczynnosci(uid) { try { if (!Bob_bramka()) return; if'),
      DOBRA.replace('function Bem_przeglad(sieroty) {', 'async function Bem_przeglad(sieroty) {'),
      DOBRA.replace('function Bem_zChmury(t) {', 'async function Bem_zChmury(t) {'),
      DOBRA.replace('function Bem_kolejka() {', 'async function Bem_kolejka() {'),
      DOBRA.replace('function Bem_poBezczynnosci(uid) { try {', 'async function Bem_poBezczynnosci(uid) { try {'),
      DOBRA.replace('const prog = Bob_przegladProg(uid);', 'const prog = new Date().toISOString();'),
      DOBRA.replace('if (!Bem_pilne.has(uid) && !Bob_przegladNalezny(uid)) return;', 'if (!Bem_pilne.has(uid) && !v.VILDA_EVENT_LOG) return;'),
      DOBRA.replace('Bob_przegladProg(z.uid); } catch (x)', 'await Bob_dopiszZ("cred", null, undefined, z.s, z.uid); } catch (x)'),
      DOBRA.replace('try { if (Bem_kolejka()) return; const uid', 'try { if (Bem_kolejka() || Bob_wejscie()) return; const uid'),
      DOBRA.replace('Bob_przegladProg(z.uid); } catch (x)', 'Bob_przegladStan(z.uid, z.s); } catch (x)'),
      DOBRA.replace('Bev_pary(t).forEach(', 'Bev_przeglad("", null).forEach('),
    ];
    for (const [i, kod] of czerwone.entries()) {
      expect(kod, `wariant ${i} różni się od części w kształcie z projektu`).not.toBe(DOBRA);
      expect(analizujBem(kod).length, `wariant ${i}`).toBeGreaterThan(0);
    }
    // Czystość Bem_zHaka: odwołanie do sesji albo bramki (także przez funkcję pomocniczą) czerwone.
    expect(nieczyste(DOBRA, 'Bem_zHaka')).toEqual([]);
    for (const kod of [DOBRA.replace('return d && Object', 'return Bses_opcje(null) && d && Object'),
      DOBRA.replace('return d && Object', 'return Bem_p() && d && Object') + '\nfunction Bem_p() { return Bob_bramka(); }']) expect(nieczyste(kod, 'Bem_zHaka').length, kod).toBeGreaterThan(0);
  });
});

describe('U2(d): najwyższy poziom bloku — tylko deklaracje bez skutków przy ładowaniu', () => {
  const freeze = (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed &&
    n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && n.callee.property.name === 'freeze';
  // Argumenty Object.freeze: literały, tablice, obiekty (własności init bez kluczy obliczanych i bez rozwinięć),
  // identyfikatory, wyrażenia funkcyjne (ciało nie biegnie przy ładowaniu) i zagnieżdżone Object.freeze.
  function typyFreeze(n, nazwa, bledy) {
    if (!n) { bledy.push(`${nazwa}: dziura w tablicy`); return; }
    if (n.type === 'Literal' || n.type === 'Identifier' || n.type === 'FunctionExpression') return;
    if (n.type === 'ArrayExpression') { n.elements.forEach((x) => typyFreeze(x, nazwa, bledy)); return; }
    if (n.type === 'ObjectExpression') {
      for (const p of n.properties) {
        if (p.type !== 'Property' || p.kind !== 'init' || p.computed) { bledy.push(`${nazwa}: ${p.type}${p.computed ? ' (klucz obliczany)' : ''}`); continue; }
        typyFreeze(p.value, nazwa, bledy);
      }
      return;
    }
    if (freeze(n)) { n.arguments.forEach((x) => typyFreeze(x, nazwa, bledy)); return; }
    bledy.push(`${nazwa}: ${n.type} w argumencie Object.freeze`);
  }
  function najwyzszyPoziom(body, prefiks, bledy) {
    for (const s of body) {
      if (s.type === 'FunctionDeclaration') {
        if (!s.id.name.startsWith(prefiks)) bledy.push(`funkcja bez prefiksu ${prefiks}: ${s.id.name}`);
        continue;
      }
      if (s.type !== 'VariableDeclaration' || s.kind !== 'const') { bledy.push(`instrukcja ${s.type}${s.kind ? ' ' + s.kind : ''}`); continue; }
      for (const d of s.declarations) {
        const nazwa = d.id.type === 'Identifier' ? d.id.name : '?';
        if (!nazwa.startsWith(prefiks)) bledy.push(`stała bez prefiksu ${prefiks}: ${nazwa}`);
        const i = d.init;
        if (!i) { bledy.push(`${nazwa}: bez wartości`); continue; }
        if (i.type === 'Literal') continue;
        if (i.type === 'NewExpression' && i.callee.type === 'Identifier' && ['Map', 'Set'].includes(i.callee.name) && !i.arguments.length) continue;
        if (freeze(i)) { i.arguments.forEach((x) => typyFreeze(x, nazwa, bledy)); continue; }
        bledy.push(`${nazwa}: ${i.type}`);
      }
    }
  }
  it('część Bev_ (^Bev_) i część Bob_ (^Bob_): function / async function albo const z literałem, Object.freeze(…) z dozwolonymi typami, new Map() / new Set()', () => {
    expect(typeof eksport).toBe('object');
    znacznikRaz();
    const { a, tekst } = blok();
    const { i, e } = czesci();
    const ast = parse(tekst, { ecmaVersion: 'latest', sourceType: 'script' });
    const granica = i - a;
    const granicaEmisji = e >= 0 ? e - a : tekst.length;
    const bev = ast.body.filter((s) => s.end <= granica);
    const bob = ast.body.filter((s) => s.start >= granica + ZNACZNIK_MAGAZYNU.length && s.end <= granicaEmisji);
    const bem = ast.body.filter((s) => e >= 0 && s.start >= granicaEmisji + ZNACZNIK_EMISJI.length);
    expect(bev.length + bob.length + bem.length, 'żadna instrukcja nie przecina znacznika magazynu ani znacznika emisji').toBe(ast.body.length);
    const bledy = [];
    najwyzszyPoziom(bev, 'Bev_', bledy);
    najwyzszyPoziom(bob, 'Bob_', bledy);
    expect(bledy).toEqual([]);
    expect(bev.length).toBeGreaterThan(20);
    expect(bob.length).toBeGreaterThan(20);
  });
  // Nazwy wiążące części emisji (funkcje i stan w pamięci dokumentu).
  const NAZWY_BEM = ['Bem_hak', 'Bem_zHaka', 'Bem_zmiana', 'Bem_krokStart', 'Bem_krokKoniec', 'Bem_doLancucha', 'Bem_dopisz', 'Bem_gotowe',
    'Bem_klucz', 'Bem_RANGI', 'Bem_ogony', 'Bem_kroki', 'Bem_odlozone',
    // E2-PR3a3: partie importu.
    'Bem_sekcje', 'Bem_partia', 'Bem_naPartie', 'Bem_powiadom', 'Bem_partie', 'Bem_sluchaczePartii', 'Bem_SEKCJE',
    // E2-PR3a4: przegląd kolejki i pary scalania z chmury.
    'Bem_pary', 'Bem_pilne', 'Bem_poKroku', 'Bem_kolejka', 'Bem_zChmury', 'Bem_przeglad', 'Bem_przegladTeraz', 'Bem_przegladKrok',
    'Bem_poBezczynnosci',
    // E2-PR3a4: pamięć braków (wpisy łańcucha bez wiersza — przegląd dopisuje je bez względu na okno i pokrycie).
    'Bem_braki', 'Bem_BEZ_BRAKU', 'Bem_brak', 'Bem_kluczEncji'];
  it('U2(d) (E2-PR3a2): część Bem_ (^Bem_) — function / async function albo const z literałem, Object.freeze(…) z dozwolonymi typami, new Map() / new Set(); są nazwy wiążące części', () => {
    znacznikEmisjiRaz();
    const ast = parse(czesci().bem, { ecmaVersion: 'latest', sourceType: 'script' });
    const bledy = [];
    najwyzszyPoziom(ast.body, 'Bem_', bledy);
    expect(bledy).toEqual([]);
    const nazwy = ast.body.flatMap((s) => (s.type === 'FunctionDeclaration' ? [s.id.name] : s.declarations.map((d) => d.id.name)));
    expect(NAZWY_BEM.filter((n) => !nazwy.includes(n)), 'brakujące nazwy części Bem_').toEqual([]);
    expect(ast.body.length).toBeGreaterThanOrEqual(NAZWY_BEM.length);
  });
  it('samokontrola typów argumentów Object.freeze: odczyt pola okna, rozwinięcie i klucz obliczany czerwone; literały, tablice, obiekty, identyfikatory i funkcje zielone', () => {
    const sprawdz = (kod) => { const b = []; najwyzszyPoziom(parse(kod, { ecmaVersion: 'latest', sourceType: 'script' }).body, 'Bob_', b); return b; };
    for (const kod of ['const Bob_X = Object.freeze({ s: v.localStorage });', 'const Bob_X = Object.freeze([v.VILDA_EVENT_LOG]);',
      'const Bob_X = Object.freeze({ ...v.localStorage });', 'const Bob_X = Object.freeze({ [k]: 1 });', 'const Bob_X = Object.freeze(Bob_f());',
      'const Bob_X = Object.freeze(`x${v.crypto}`);', 'const Bob_X = Object.freeze({ a: -1 });', 'const Bob_X = Object.freeze({ get a() { return 1; } });',
      'const Bob_X = v.indexedDB;', 'Bob_f();', 'let Bob_X = 1;', 'function Bev_f() {}']) expect(sprawdz(kod).length, kod).toBeGreaterThan(0);
    for (const kod of ["const Bob_X = Object.freeze({ a: 1, b: [1, 'x', null], c: Bob_f, d: function () { return v.x; }, e: Object.freeze({}) });",
      "const Bob_KOD = /^[A-Za-z0-9_.:-]{1,64}$/;", 'const Bob_usuwane = new Set();', 'function Bob_f() {}', 'async function Bob_g() {}']) expect(sprawdz(kod), kod).toEqual([]);
  });
});

describe('U2(e): eksport _eventLog zamrożony, klucze dokładnie z listy', () => {
  it('Object.isFrozen, klucze = lista E2-PR2a, 11 kluczy magazynu kolejki, 6 kluczy kwarantanny i podsumowania wyniku, emissionsSettled z E2-PR3a2, onBulkChange z E2-PR3a3 i sweepOutbox z E2-PR3a4 (38), kinds zamrożone (14 rodzajów), funkcje', () => {
    expect(typeof eksport).toBe('object');
    expect(Object.isFrozen(eksport)).toBe(true);
    expect(KLUCZE_EKSPORTU).toHaveLength(38);
    expect(Object.keys(eksport).sort()).toEqual([...KLUCZE_EKSPORTU].sort());
    expect(Object.isFrozen(eksport.kinds)).toBe(true);
    expect(eksport.kinds).toEqual(RODZAJE);
    for (const k of KLUCZE_EKSPORTU.filter((x) => x !== 'kinds')) expect(typeof eksport[k], k).toBe('function');
    const { win } = okno();
    expect(Object.getOwnPropertyDescriptor(win.VildaVault, '_eventLog').enumerable, 'jeden klucz eksportu sejfu').toBe(true);
    expect(win.VildaVault._eventLog).not.toBe(eksport); // osobne okno — osobny obiekt
    expect(win.VildaVault.applyEncryptedDelta, 'applyEncryptedDelta bez zmian').toBeTypeOf('function');
  });
});

describe('U4: zwykłe użycie sejfu przy zamkniętej bramce nie tworzy bazy kolejki ani klucza urządzenia', () => {
  const okna = [];
  beforeEach(() => { przechwycZadaniaWTle(); });
  afterEach(() => {
    for (const o of okna.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('U4: adapter IndexedDB nad atrapą — karta, wersja, notatki, lista, blokada, odblokowanie i każda istniejąca operacja magazynu → databases() bez vilda_sync_*, brak klucza vilda-sync-device-v1', async () => {
    const o = await oknoMagazynu({ konta: 'A', bramka: false });
    okna.push(o);
    const v = o.v;
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: r.patientId });
    await v.savePatientNote({ patientId: r.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' });
    await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [r.patientId] });
    o.zablokuj();
    await o.zaloguj('A');
    const EID = '00000000-0000-4000-8000-000000000001';
    const arg = {
      enqueue: ['snap', { patientId: r.patientId, snapshotId: r.snapshotId }], outboxCount: [], outboxList: [], outboxTake: [], outboxAccept: [[EID]],
      outboxReject: [[{ eid: EID, code: 'EVENT_REJECTED' }]], outboxFail: [[EID], { code: 'NETWORK' }], outboxRequeueStale: [],
      outboxDiscard: [[EID], { potwierdzone: true }], gateOpen: [],
      quarantinePut: [ZMIANA, NIECZYTELNY, { slotId: SLOT, appVersion: '1.1.459' }], quarantineList: [], quarantineCount: [],
      quarantineMinSeq: [{ slotId: SLOT }], quarantineRelease: [[1], { slotId: SLOT }], resultSummary: [NIECZYTELNY],
    };
    for (const k of Object.keys(arg)) if (typeof o.ev[k] === 'function') await o.ev[k](...arg[k]);
    await o.cisza();
    const bazy = (await o.idb.databases()).map((x) => x.name);
    expect(bazy.filter((n) => n.startsWith('vilda_sync_'))).toEqual([]);
    expect(bazy.length, 'skan widzi bazy sejfu').toBeGreaterThan(0);
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
    expect(o.dziennik.filter((x) => String(x.klucz).startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  // E2-PR3a2: każda emisja to jeden odczyt pola bramki; w scenariuszu U4′ emitują dwa zapisy karty, zapis notatki i zapis
  // listy (logowanie i usunięcie kont — bez emisji).
  const EMISJE_U4 = 4;
  it.each([['z navigator.locks', true], ['bez navigator.locks', false]])('U4′ (%s): zwykłe użycie i usunięcie konta przy zamkniętej bramce (sejf jak w przeglądarce, moduły punktu odzyskiwania) — 0 baz vilda_sync_*, 0 kluczy i 0 zapisów vilda-sync-* w localStorage, odczyty pola bramki = liczba emisji scenariusza (E2-PR3a2)', async (_, zLocks) => {
    const o = await oknoMagazynu({ konta: 'AB', bramka: false, emisja: true, skrypty: SKRYPTY_PUNKTU, ...(zLocks ? {} : { locks: false }) });
    okna.push(o);
    expect(!!o.win.navigator.locks, 'navigator.locks okna').toBe(zLocks);
    let odczyty = 0;
    Object.defineProperty(o.win, 'VILDA_EVENT_LOG', { get() { odczyty += 1; return undefined; }, configurable: true });
    const v = o.v;
    const r = await v.savePatient(naglowek(1), { dedup: false });
    await v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: r.patientId });
    await v.savePatientNote({ patientId: r.patientId, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
    await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [r.patientId] });
    await o.zaloguj('B');
    await o.zaloguj('A');
    expect(await v.removeUser(o.B.userId, o.B.haslo), 'usunięcie konta niebieżącego').toBe(true);
    expect(await v.removeUser(o.A.userId, o.A.haslo), 'usunięcie konta bieżącego').toBe(true);
    await o.cisza();
    const bazy = (await o.idb.databases()).map((x) => x.name);
    expect(bazy.filter((n) => n.startsWith('vilda_sync_'))).toEqual([]);
    expect(bazy, 'skan widzi rejestr kont').toContain('vilda_registry');
    expect(o.win.localStorage.klucze().filter((k) => k.startsWith('vilda-sync-'))).toEqual([]);
    expect(o.dziennik.filter((x) => x.magazyn === 'localStorage' && String(x.klucz).startsWith('vilda-sync-'))).toEqual([]);
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_') && w[0] !== 'deleteDatabase')).toEqual([]);
    expect(odczyty, 'odczyty pola VILDA_EVENT_LOG (jeden na emisję)').toBe(EMISJE_U4);
  });
});

describe('U5 (E2-PR3a2): klucz dostępu (WebAuthn) i hak VildaPersistence przy zamkniętej bramce kończą się na bramce', () => {
  const okna = [];
  beforeEach(() => { przechwycZadaniaWTle(); });
  afterEach(() => {
    for (const o of okna.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const KLUCZ_ZWYKLY = 'fikcyjny-klucz-dostepu-1';
  const KLUCZ_ROAMING = 'fikcyjny-klucz-dostepu-2';
  const PREFERENCJA = 'ghTherapyViewMode'; // klucz klasy cloud-synced (vilda_persistence_adapter.js)
  const KROKI_U5 = ['registerPasskey', 'registerPasskeyForRoaming', 'unlockWithPasskey', 'removePasskey', 'preferencja (sejf odblokowany)',
    'preferencja (sejf zablokowany)'];
  // Odczyty pola bramki na krok = liczba emisji: rejestracje i usunięcie klucza (emiter Yn), zapisana preferencja (Ps);
  // logowanie kluczem i preferencja przy zablokowanym sejfie (Ps zwraca null) — bez emisji.
  const BRAMKA_U5 = [1, 1, 0, 1, 1, 0];
  // Żądania sieci na krok (ścieżka bez adresu serwera): tylko wysyłka koperty klucza „roaming” — ta sama na sejfie bez wstawek.
  const ZADANIA_U5 = [[], ['PUT /v1/slots/<slot>/passkey/<klucz>'], [], [], [], []];

  // Okno sejfu nad atrapą IndexedDB („Komputer prywatny”), sejf jak w przeglądarce (emisja: true), pole VildaPersistence przed
  // załadowaniem sejfu (wzór: meta-konta-blokada.test.mjs); bezWstawek — zamiast pliku sejfu kopia bez wstawek emisji.
  // Atrapa VildaCrypto: rejestracja i odczyt sekretu PRF bez WebAuthn (fikcyjne bajty). Sieć: atrapy liczące fetch (sejf woła
  // goły fetch — globalny i okna), sendBeacon i XMLHttpRequest. Bramka zamknięta: pole okna to getter liczący (undefined).
  async function przebieg(bezWstawek) {
    const siec = { fetch: [], sendBeacon: 0, xhr: 0 };
    const fetch = async (url, opcje) => {
      siec.fetch.push(`${(opcje && opcje.method) || 'GET'} ${new URL(String(url)).pathname.replace(/^\/v1\/slots\/[^/]+\/passkey\/[^/]+$/, '/v1/slots/<slot>/passkey/<klucz>')}`);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    class XHR { constructor() { siec.xhr += 1; } open() {} send() {} setRequestHeader() {} }
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('XMLHttpRequest', XHR);
    const hak = { zapis: null };
    const pola = { VildaPersistence: { onPreferenceWrite(cb) { hak.zapis = cb; } }, fetch, XMLHttpRequest: XHR };
    const kopia = bezWstawek ? sejfBezWstawek() : null;
    let podane = 0;
    let szpieg = null;
    if (kopia) {
      const plik = path.join(KORZEN, SEJF);
      const czytaj = fs.readFileSync;
      szpieg = vi.spyOn(fs, 'readFileSync').mockImplementation(function (p, ...a) {
        if (path.resolve(String(p)) === plik) { podane += 1; return kopia.zrodlo; }
        return czytaj.call(fs, p, ...a);
      });
    }
    let o;
    try { o = await oknoMagazynu({ konta: 'A', bramka: false, emisja: true, pola }); } finally { if (szpieg) szpieg.mockRestore(); }
    okna.push(o);
    o.win.navigator.sendBeacon = () => { siec.sendBeacon += 1; return true; };
    expect(typeof hak.zapis, 'hak VildaPersistence zarejestrowany przy ładowaniu sejfu').toBe('function');
    const c = o.win.VildaCrypto;
    c.createPasskeyAndGetPrfSecret = async () => ({ credentialId: KLUCZ_ZWYKLY, prfSecretBytes: new Uint8Array(32).fill(7) });
    c.createRoamingPasskeyAndGetPrfSecret = async () => ({ credentialId: KLUCZ_ROAMING, publicKeyRawB64u: 'RmlrY3lqbnlLbHVjeg', prfInputB64u: 'RmlrY3lqbnlQcmY' });
    c.getPasskeyPrfSecret = async (id) => ({ credentialId: id || KLUCZ_ZWYKLY, prfSecretBytes: new Uint8Array(32).fill(id === KLUCZ_ROAMING ? 8 : 7) });
    const preferencje = [];
    o.v.onPreferenceChanged((d) => { preferencje.push(d && d.key); });
    let bramka = 0;
    Object.defineProperty(o.win, 'VILDA_EVENT_LOG', { get() { bramka += 1; return undefined; }, configurable: true });
    const stan = () => ({ bramka, krypto: o.krypto.log.length, log: o.idb.__atrapa.log.length, dziennik: o.dziennik.length, blokady: o.locks.zadania.length, fetch: siec.fetch.length, sendBeacon: siec.sendBeacon, xhr: siec.xhr, preferencje: preferencje.length });
    const kroki = [];
    async function krok(fn) {
      const a = stan();
      let blad = null;
      try { await fn(); } catch (x) { blad = String((x && (x.code || x.message)) || x); }
      await o.cisza();
      const b = stan();
      kroki.push({
        bramka: b.bramka - a.bramka,
        krypto: o.krypto.log.slice(a.krypto).map((x) => x.metoda),
        kolejka: o.idb.__atrapa.log.slice(a.log).filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_')).length,
        kluczeSync: o.dziennik.slice(a.dziennik).filter((x) => String(x.klucz).startsWith('vilda-sync-')).length,
        blokadySync: o.locks.zadania.slice(a.blokady).filter((x) => x.nazwa.startsWith('vilda-sync')).length,
        zadania: siec.fetch.slice(a.fetch), sendBeacon: b.sendBeacon - a.sendBeacon, xhr: b.xhr - a.xhr,
        preferencje: b.preferencje - a.preferencje, blad,
      });
    }
    await krok(() => o.v.registerPasskey('Fikcyjny telefon'));
    await krok(() => o.v.registerPasskeyForRoaming('Fikcyjny klucz sprzętowy'));
    o.zablokuj();
    await krok(() => o.v.unlockWithPasskey(o.A.userId, KLUCZ_ZWYKLY));
    const odblokowany = o.v.isUnlocked() && o.v.getCurrentUser().userId === o.A.userId;
    await krok(() => o.v.removePasskey(o.A.userId, KLUCZ_ROAMING));
    await krok(() => hak.zapis({ key: PREFERENCJA, value: 'tabela' }));
    o.zablokuj();
    await krok(() => hak.zapis({ key: PREFERENCJA, value: 'wykres' }));
    await o.zaloguj('A');
    const eksportKonta = await o.v.exportSyncPayload();
    const zapisana = Object.values(eksportKonta.userPreferences || {}).map((x) => x && x.value).join();
    return {
      kroki, odblokowany, zapisana, podane, wstawki: kopia ? kopia.wstawki : 0,
      bazy: (await o.idb.databases()).map((x) => x.name).filter((n) => n.startsWith('vilda_sync_')),
      klucze: o.win.localStorage.klucze().filter((k) => k.startsWith('vilda-sync-')),
    };
  }

  it('U5: registerPasskey, registerPasskeyForRoaming, unlockWithPasskey, removePasskey i hak VildaPersistence.onPreferenceWrite (klucz cloud-synced; sejf odblokowany i zablokowany) — odczyty pola bramki = liczba emisji, 0 wpisów vilda_sync_*, 0 kluczy vilda-sync-*, 0 blokad vilda-sync*, operacje crypto.subtle i żądania jak na sejfie bez wstawek emisji, 0 sendBeacon i XMLHttpRequest', async () => {
    const w = await przebieg(false);
    const wb = await przebieg(true);
    for (const [nazwa, x] of [['sejf', w], ['sejf bez wstawek', wb]]) {
      expect(x.kroki.map((k) => k.blad), `${nazwa}: kroki bez błędu`).toEqual(KROKI_U5.map(() => null));
      expect(x.odblokowany, `${nazwa}: logowanie kluczem dostępu`).toBe(true);
      expect(x.zapisana, `${nazwa}: preferencja zapisana przy odblokowanym sejfie`).toBe('tabela');
      expect(x.kroki.map((k) => k.preferencje), `${nazwa}: słuchacz preferencji (vs) także po null z Ps`).toEqual([0, 0, 0, 0, 1, 1]);
      expect({ bazy: x.bazy, klucze: x.klucze }, `${nazwa}: bez bazy kolejki i kluczy vilda-sync-*`).toEqual({ bazy: [], klucze: [] });
    }
    const kolumna = (x, pole) => x.kroki.map((k) => k[pole]);
    expect({
      bramka: kolumna(w, 'bramka'), kolejka: kolumna(w, 'kolejka'), kluczeSync: kolumna(w, 'kluczeSync'), blokadySync: kolumna(w, 'blokadySync'),
      zadania: kolumna(w, 'zadania'), sendBeacon: kolumna(w, 'sendBeacon'), xhr: kolumna(w, 'xhr'),
    }, 'na krok: odczyty pola bramki, wpisy vilda_sync_* atrapy, zapisy kluczy vilda-sync-*, blokady vilda-sync*, żądania sieci').toEqual({
      bramka: BRAMKA_U5, kolejka: KROKI_U5.map(() => 0), kluczeSync: KROKI_U5.map(() => 0), blokadySync: KROKI_U5.map(() => 0),
      zadania: ZADANIA_U5, sendBeacon: KROKI_U5.map(() => 0), xhr: KROKI_U5.map(() => 0),
    });
    // Samokontrola sejfu bez wstawek: kopia podana skryptowi okna, zastąpione wszystkie wywołania Bem_ spoza bloku, bez odczytów bramki.
    const wywolaniaBem = Object.values(MIEJSCA_POZA_BLOKIEM).reduce((s, m) => s + Object.entries(m).filter(([n]) => n.startsWith('Bem_')).reduce((t, [, k]) => t + k, 0), 0);
    expect({ podane: wb.podane > 0, wstawki: wb.wstawki }, 'sejf bez wstawek emisji').toEqual({ podane: true, wstawki: wywolaniaBem });
    expect(kolumna(wb, 'bramka'), 'sejf bez wstawek: odczyty pola bramki').toEqual(KROKI_U5.map(() => 0));
    expect(kolumna(wb, 'zadania'), 'sejf bez wstawek: żądania sieci').toEqual(ZADANIA_U5);
    expect(kolumna(w, 'krypto'), 'operacje crypto.subtle na krok (bez szyfrowania zdarzeń) = sejf bez wstawek').toEqual(kolumna(wb, 'krypto'));
    // Licznik widzi crypto.subtle okna (tędy idzie szyfrowanie zdarzeń: koperta → V → VildaCrypto): rejestracje i logowanie.
    expect(kolumna(w, 'krypto').map((k) => k.length).slice(0, 3).every((n) => n > 0), 'operacje crypto.subtle liczone').toBe(true);
  });
});
