// P-DZIENNIK-ZDARZEN (E2-PR2a) — test A ≡ B: „suma zdarzeń z builderów daje ten sam stan co pełny blob” w postaci
// etapu 2 (specyfikacja E2-PR2a rozdz. 3 po decyzji właściciela 11.1 z 2026-11-03, projekt E2-PR2 rozdz. 7, poprawki K1,
// K2, K4, K5). Prawdziwy sejf w oknach uprzęży E2-PR0 (tests/support/urzadzenie-sync.mjs): urządzenia A i B to bliźniaki
// jednego konta (ten sam klucz — koperty encryptEvent A są czytelne na B), sync: false, zegar vi.useFakeTimers({ toFake:
// ['Date'] }) od stałej fikcyjnej chwili, identyfikatory i IV z ziarna (crypto okna), Math.random z ziarna. Dane
// WYŁĄCZNIE FIKCYJNE („Testowy Jan…”), bez PESEL.
//
// MODEL. Kolejka testowa Q_X = FIFO { kind, key, atISO, env } (szyfrogram z chwili emisji, zamrożony), kursory dostaw
// X→Y. Wyrocznia „emiter doskonały” (model): po każdej mutacji lokalnej na X różnica encji eksportu przed/po → builder
// każdej zmienionej encji w tej chwili; do Q_X (encryptEvent) idą koperty prawdziwych emiterów sejfu, a model jest
// wyrocznią porównania (EMISJA niżej). Scalanie nie emituje — poza dwoma hakami scalania E2-PR3b u odbiorcy (HAKI
// niżej): hak H1 (przegrany nagrobek karty → pfull(p)) i hak H2 (ratunek notatki D-21 „zawsze do kolejki” → pnote(id)),
// od E2-PR3b także z prawdziwych emiterów sejfu, z modelem haków jako wyrocznią. Dostawa X→Y = FIFO-prefiks od kursora
// (losowa tylko długość i przeplot nadawców), powtórka = cofnięcie kursora i ponowne zastosowanie sufiksu; każde
// zdarzenie przez applyEncryptedEvent, status inny niż applied = błąd.
//
// EMISJA (E2-PR3a3): zdarzenia z prawdziwych emiterów sejfu. Urządzenia (także urządzenia katalogu p. 5 —
// zaladowanieSejfu z s4d7-wspolne.mjs) ładują kopię sejfu z rejestrem łańcucha (zRejestremLancucha,
// tests/support/sejf-bez-wstawek.mjs) przy polu okna VILDA_EVENT_LOG = true. Kopia różni się od sejfu dwoma miejscami:
// Bem_zmiana bez warunku trybu i IndexedDB (sejf urządzenia jest na adapterze w pamięci) i Bem_doLancucha, które zamiast
// dopisania oddaje wpis do rejestru okna; emitery, kroki, rangi i pomijanie powtórzeń są prawdziwe. Mutacja czyści rejestr
// przed operacją, po niej buduje koperty builderów dla wpisów rejestru konta w ich kolejności (builder null — bez
// koperty, wyjątek buildera — błąd testu) i porównuje je z modelem: ten sam ciąg rang i te same encje w każdej randze;
// jedyna dozwolona różnica to kolejność encji w obrębie rangi (liczona osobno: S.stat.emitery = { porownan, zgodnych,
// wRandze }). Niezgodność = wyjątek z opisem (mutacja, ciąg modelu, ciąg emiterów, wpisy rejestru). Jawny wyjątek:
// rejestracja klucza dostępu w p. 1 (zapis testu z pominięciem API) ma model jako źródło — literał MUTACJE_Z_MODELU.
// Przypadki: AB1 (porównanie w każdej mutacji każdego bloku; wyjątek z opisem), AB2 (podsumowania ziaren: porownan > 0,
// zgodnych + wRandze = porownan), AB3 (p. 4: „Przywróć”, gdy wizyta jest już w karcie), AB4 (porównanie na ciągach
// syntetycznych; rangi z pfull), AB5 (samokontrola kopii z rejestrem), AB6 (MUTACJE_Z_MODELU), AB7 (haki z emiterów =
// model w każdej partii każdego bloku; porównanie na ciągach syntetycznych; niezgodność — wyjątek z opisem; podsumowania
// ziaren: porównania haków > 0, każde zgodne; od E2-PR3c1 też przypadek deterministyczny „ratunek notatki w trakcie
// partii”), AB8 (samokontrola rejestru odbiorcy: partia z przegranym nagrobkiem karty
// i ratunkiem notatki daje wpisy pfull i pnote, przy zamkniętej bramce — żadnego).
//
// HAKI (E2-PR3b). Hak H1 i hak H2 to emisje części emisji sejfu (Bem_przegrane w scalaniu po pętli nagrobków kart,
// Bem_przegrany, Bem_ratunek w ratunku notatki) przez Bem_zmiana, więc kopia z rejestrem łańcucha oddaje je testowi także
// w scalaniu (bez zmiany kotwic kopii). Dostawa czyści rejestr odbiorcy przed zastosowaniem partii; po partii (i eksporcie)
// wpisy rejestru konta odbiorcy w ich kolejności dają koperty builderów (pfull — porcje karty z setId wpisu, z.o.setId;
// builder null — bez koperty, wyjątek buildera — błąd testu) i to one idą do Q_Y (porcje jednego zestawu razem przy
// łączeniu wpisów). Model haków (hakiModelu) jest wyrocznią porównania w każdej partii: H1 — zaraz po zdarzeniu ptomb(p)
// partii karta p jest u odbiorcy → pfull(p) z setId p:deletedAtISO, gdy karta jest u odbiorcy po partii (bez powtórzeń
// po setId na urządzeniu; od E3-PR0a zdarzenie po zdarzeniu, jak H2); H2 — notatka pacjenta,
// której nagrobek zniknął w partii (był przed albo przyszedł w partii), której rekord zmieniło scalanie i której nowa
// chwila nie pochodzi z koperty pnote tej partii → pnote(id), także gdy jej koperta pnote przyszła w tej partii (ratunek
// daje notatce nową chwilę R + 1 ms + h; notatka przyjęta zwykłą regułą ma chwilę swojej koperty i haka nie daje).
// Od E2-PR3c1 H2 liczony zdarzenie po zdarzeniu (dostawa eksportuje odbiorcę po każdym zdarzeniu partii z więcej niż
// jednym zdarzeniem; reguła na parze stanów przed i po zdarzeniu): ratunek w trakcie partii daje hak także wtedy, gdy
// późniejsza koperta pnote tej notatki w tej samej partii nadpisze uratowaną wersję (sejf wysyła ratunek w chwili zapisu).
// Zgodność: ten sam zbiór kopert (rodzaj, encja; pfull także setId), a w ciągu emiterów pełna karta przed uratowaną
// notatką tej karty; poza tym kolejność może się różnić (emitery idą w kolejności scaleń partii, model układa haki partii
// rodzajami: najpierw H1, potem H2). Liczniki S.stat.haki = { porownan, zgodnych, wRandze, innaKolejnosc } — ten sam
// ciąg, inna kolejność tylko w obrębie rangi, inna kolejność rang. Niezgodność = wyjątek z opisem (odbiorca, partia, ciąg
// modelu, ciąg emiterów, wpisy rejestru). Literały scenariuszy bez zmian wobec haków z modelu.
// Czerwone na bazie E2-PR3b (sejf 4994fef9 — bez haków scalania; 31 ze 127 przypadków, 1 pominięty): AB4 (Bem_RANGI bez
// pfull), AB7 i AB8 (bez wpisów rejestru z haków) oraz każdy przypadek z partią, w której model ma hak, a emitery — nic
// (AB7, wyjątek w dostawie): p. 2 K10, p. 3 D-5, p. 4 ×4 (nagrobek starszy, K1k, N1, N1b), p. 5 ×4 (E4b-1, E4b-2w w obu
// kolejnościach), p. 6 ×3 (R4-a, R4-a′, notatka pod inną kartą), p. 7b, p. 7d N1 ×2, negatywy W4p, ziarna 1, 3, 5, 6, 7
// i 8 profilu podstawowego i jego podsumowanie, ziarna 1, 7 i 8 koalescencji i jej podsumowanie. Zielone z natury
// (strażniki regresji; partie bez przegranego nagrobka i ratunku): AB1, AB3, AB5, AB6, p. 1, pozostałe p. 2, p. 4
// „nowszy”, pozostałe p. 5 i p. 6 (w tym K6 i R2-E3), p. 7a, p. 7c, pozostałe p. 7d, klasy 3.6, ziarna 2 i 4 profilu
// podstawowego, profil pełny.
// Przebieg na sejfie z hakami (ziarna domyślne): 707 porównań haków partii w pliku — 704 ten sam ciąg, 3 inna kolejność
// tylko w obrębie rangi (uratowane notatki jednej karty, wszystkie po jej pełnej karcie), 0 innej kolejności rang;
// profil podstawowy 326 porównań (H1 9, H2 10), koalescencja 87 (H1 4, H2 6), profil pełny 73 (bez haków). Przy
// E2_AB_ZIARNA=40 (profil podstawowy) jedna z 1489 partii ma inną kolejność rang: emitery pfull(P), pnote(n), pfull(R),
// model pfull(P), pfull(R), pnote(n) — n jest notatką karty P, więc pełna karta idzie przed notatką w obu.
//
// E2-PR3c1 (koperta nagrobka karty z kartą docelową): po „Scal pacjentów” X → Y w tej karcie przeglądarki koperta ptomb(X)
// niesie kartę Y ze wszystkimi wersjami, więc odbiorca ma nagrobek X i kartę Y w jednym scaleniu; bez znanego celu — sam
// nagrobek (kartę docelową dowozi pełna wysyłka). Przepisane literały: p. 5 npret-pin i npret-K (obie kolejności) — bez
// utraty (po W4 stan = stan samych blobów; po samych zdarzeniach x:23* pod Y na P, w C←P,C←K także na C), KAT_ZMIANY
// i KAT_ZNANE bez nich; nowe przebiegi pin-scal i popr-scal (gwiazdka albo poprawka 74 kg wizyty x na P, potem
// „Scal pacjentów” X → Y na K; obie kolejności, na końcu KAT_LISTA): po W4 x:23* albo x:74 na trzech, jak bloby; p. 6
// K6 (W4 = blobyKlinicznie, sprawdzane wprost; po samych zdarzeniach różnica treści v — „ZNANA RÓŻNICA (zdarzenia;
// naprawa: E2-PR3c2)”), R2-E3 (zdarzenia: [], bez „ZNANA RÓŻNICA”) i skrzyżowane „Scal pacjentów” z notatką karty P
// (w zdarzeniach dochodzi R2 wersji karty P; negatyw tabel tylko na wierszach „notatka pod inną kartą”). Q8-obca-2 bez
// zmian — znana różnica do decyzji właściciela: którą wizytę zostawić (nic nie ginie, obie wizyty w Koszu); R4n —
// E3-PR0. Model haków: H2 zdarzenie po zdarzeniu (HAKI wyżej) — dotąd ratunek notatki w trakcie partii, po którym
// późniejsza koperta pnote tej notatki w tej samej partii nadpisywała uratowaną wersję, dawał u emiterów pnote(n), a w
// modelu nic (AB7 czerwone w profilu pełnym poza ziarnami domyślnymi); przypadek deterministyczny w bloku AB7.
// Czerwone na bazie E2-PR3c1 (sejf bf8edad8; 12 ze 132 przypadków): p. 5 npret-pin ×2, npret-K ×2 (po W4 bez x:23*),
// pin-scal ×2 (po W4 x:23 bez gwiazdki), popr-scal ×2 (po W4 x:23 zamiast 74), „zmiany zachowania” (11 przebiegów
// zamiast 3), p. 6 K6 (po W4 v:20 zamiast 27), R2-E3 (wersja Q/v tylko na A po zdarzeniach), skrzyżowane „Scal
// pacjentów” (bez R2 w zdarzeniach). Zielone z natury (strażniki regresji): pozostałe przypadki, w tym nowy przypadek
// AB7 „ratunek notatki w trakcie partii” (sejf bazy ma te same haki; przy ocenie H2 na stanie po całej partii ten
// przypadek jest czerwony — AB7, wyjątek w dostawie), kosz-po-kluczu*.test.mjs (7 plików, 679 przypadków).
// Przebieg (ziarna domyślne): 726 porównań haków partii w pliku — wszystkie ten sam ciąg (model zdarzenie po zdarzeniu
// układa uratowane notatki jednej karty w kolejności ratunków, jak emitery; dotąd 3 partie „inna kolejność w obrębie
// rangi”); profil podstawowy 326 (H1 9, H2 10), koalescencja 87 (H1 4, H2 6), profil pełny 73 (bez haków). Profil pełny,
// E2_AB_ZIARNA=20: 810 porównań (H1 18, H2 6), wszystkie ten sam ciąg; profil podstawowy, E2_AB_ZIARNA=40: 1489
// porównań (H1 38, H2 27), 1488 ten sam ciąg, 1 inna kolejność rang (ta sama partia co wyżej: pełna karta przed swoją
// notatką w obu).
//
// E2-PR3c2 (decyzja 4 właściciela z 2026-11-10, P-SYNC-WLASCICIEL): karta z ładunku przegrana z nagrobkiem pacjenta
// oddaje późniejszą treść albo późniejszy rejestr gwiazdki wersji, która leży u odbiorcy pod inną istniejącą kartą spoza
// zbioru N (decyzja „treść”) — urządzenie, które scaliło karty, przyjmuje poprawkę albo gwiazdkę ze starej karty
// z koperty snap tej karty, a nie dopiero z pełnej kopii drugiego urządzenia. Przepisane literały: p. 5 npret-pin
// C←P,C←K, pin-scal i popr-scal (obie kolejności) — po samych zdarzeniach stan = stan samych blobów (dotąd K bez
// gwiazdki albo poprawki do pełnej wymiany); p. 6 K6 — bez etykiety „ZNANA RÓŻNICA”, zdarzenia: []; skrzyżowane „Scal
// pacjentów” z notatką karty P — bez R2 wersji karty P w zdarzeniach. Bez zmian: npret-pin K←C,P←K i npret-K (wersja
// z wpisem retencji — decyduje kosz), KAT_ZMIANY, KAT_ZNANE, model haków.
// Czerwone na bazie E2-PR3c2 (sejf 816282da; 7 ze 132 przypadków): p. 5 npret-pin C←P,C←K, pin-scal ×2, popr-scal ×2
// (po samych zdarzeniach K bez gwiazdki albo poprawki), p. 6 K6 (po zdarzeniach A: 20 kg, B: 27 kg) i skrzyżowane
// „Scal pacjentów” z notatką karty P (R2 wersji karty P w zdarzeniach). Zielone z natury: pozostałe przypadki.
//
// E2-PR3c3 (decyzja 5 właściciela z 2026-11-10, P-NOTATKI-ZA-KARTA): numer nagrobka notatki w scalaniu liczony także
// z notatek ładunku, chwila utworzenia notatki = najwcześniejsza znana. Przepisane literały: p. 6 R3-0 (bez R3 w
// zdarzeniach), R3-E1 i R3-E2 (bez „ZNANA UTRATA”: po W4 tekst wskrzeszenia zapisany później na wszystkich urządzeniach,
// bez różnicy chwili utworzenia w zdarzeniach i blobach), p. 7c (bez R3), ziarno 6 (bez punktów R3 124 i 130 w W1
// i W2r), AB7 „ratunek notatki w trakcie partii” (W1 bez różnicy chwili utworzenia). Model haków bez zmian.
// Czerwone na bazie E2-PR3c3 (sejf 79483d97; 6 ze 132 przypadków): AB7 ratunek w trakcie partii, R3-0, R3-E1, R3-E2,
// p. 7c, ziarno 6. Zielone z natury: pozostałe przypadki.
//
// E2-PR3c4 (decyzja 6 właściciela z 2026-11-10, P-NOTATKI-ZA-KARTA): notatka po „Scal pacjentów” idzie za kartą, która
// istnieje (gdy obie istnieją — za kartą wersji zapisanej później; pełny remis — mniejszy patientId), a urządzenie, które
// przyjęło notatkę z koperty pod inną kartą niż w kopercie, wysyła ją raz dalej (hak karty notatki, Bem_wlasciciel;
// trzecie miejsce, w którym scalanie dopisuje do kolejki, obok H1 i H2). Przepisane literały: p. 6 „Scal pacjentów P → Q
// na A, edycja notatki karty P na B” i skrzyżowane „Scal pacjentów” z notatką karty P — bez etykiety „ZNANA RÓŻNICA
// (dzisiejsza)”, zdarzenia: [], bloby: [], skutek kliniczny na obu: notatka widoczna w karcie, która istnieje. Model
// haków: hak karty notatki (koperta pnote(id) partii, której wersja weszła u odbiorcy, a karta notatki u odbiorcy jest
// inna niż w kopercie → pnote(id)); koperty w Q niosą kartę notatki koperty pnote. Negatyw tabeli W4 („W4 — negatywy”)
// na różnicy wstrzykniętej w migawkę (scenariusz jest już zbieżny); tabela DOZWOLONE bez zmian.
// Czerwone na bazie E2-PR3c4 (sejf 2beacb33; 3 ze 132 przypadków): p. 6 „Scal pacjentów P → Q na A, edycja notatki
// karty P na B” i skrzyżowane „Scal pacjentów” z notatką karty P (po zdarzeniach, po W4 i przy samych blobach notatka
// na jednym urządzeniu pod kartą usuniętą), „W4 — negatywy” (bez wstrzyknięcia scenariusz na bazie nie jest zbieżny).
// Zielone z natury: pozostałe przypadki (w ich partiach model nie ma haka karty notatki).
//
// E2-PR3c5 (decyzja 7 właściciela z 2026-11-10, P-KOSZ-USUWANEJ-KARTY): wersja karty przegranej z nagrobkiem pacjenta
// zmieniona po ważnym Koszu, z którą wygrywa późniejsze porządkowanie, oddaje wpisowi zmianę, opis i rejestr gwiazdki
// (bez treści i bez cienia). Nowy scenariusz p. 6 (ostatni w bloku, więc ziarna pozostałych bez zmian): B daje v do
// Kosza i przywraca, A przycina v porządkowaniem i robi „Scal pacjentów” P → Q — po zdarzeniach tylko różnica opisu
// wpisu (D7), W4 z punktem stałym, bloby bez różnicy. Pozostałe literały i model haków bez zmian.
// Czerwone na bazie E2-PR3c5 (sejf 46f3fe9c; 1 ze 133 przypadków): nowy scenariusz p. 6 (po zdarzeniach wpis Kosza
// z treścią na A, nagrobek porządkowania na B — różnica bez klasy; W4 PO-B bez punktu stałego).
//
// E3-PR0a (przygotowanie pomiaru E3-PR0: same zdarzenia mają dawać to, co pełna wymiana; decyzje właściciela
// z 2026-11-15, numerowane 1–9 w planie, rozdział 6). Tylko testy, bez zmiany sejfu:
// - Model haka H1 zdarzenie po zdarzeniu (HAKI wyżej, hakiModelu): dotąd fałszywy alarm AB7, gdy stary nagrobek karty
//   u odbiorcy niczego nie przegrał, a karta wracała późniejszymi zdarzeniami tej samej partii; przypadek
//   deterministyczny w bloku AB7 (czerwony ze starym modelem, zielony z nowym).
// - WYROCZNIA „nie zginęła ostatnia zmiana” (tests/support/ostatnia-zmiana.mjs; testy samej wyroczni:
//   tests/unit/ostatnia-zmiana.test.mjs). Historia: każda mutacja() dopisuje zapis (eksport przed i po, chwila, wywołania
//   API sejfu z argumentami); w świecie samych blobów p. 5 — pośrednik na metodach kroku. Ocena (widok karty i okna
//   Kosza każdego urządzenia wobec ostatniej zmiany każdego pola): W1 — w punktach spoczynku na żywych urządzeniach,
//   w p. 5 po zdarzeniach, w p. 6 po spoczynku; W4 — na klonach po pełnej wymianie (punkt spoczynku, p. 6 dla dwóch
//   i trzech urządzeń) i w p. 5 po pełnej wymianie PO-A par urządzeń; bloby — świat samych blobów p. 5 i p. 6.
//   Widoki z własnym Math.random (cichoLos, kr_cicho): program ziarna i wszystkie dotychczasowe literały bez zmian.
//   Asercje w CI (miękkie, przed literałami — komunikat ma oba werdykty): każde naruszenie ma klasę z jawnej tabeli
//   wyjątków WYJATKI (klasa → uzasadnienie, mechanizm z historii, wpis ALGORITHMS albo planu, światy, w których jest
//   dozwolona; E1/E1b — do naprawy w E3-PR0, decyzja 9a; E4b — tylko W1, do naprawy w osobnym PR etapu E3-PR0, decyzja
//   4a), naruszenie bez klasy = czerwień (ziarna domyślne trzech profili, p. 5, p. 6); literał zbioru (klasa, świat)
//   każdego przebiegu p. 5 i p. 6 (KAT_WYR, P6_WYR) i liczba naruszeń na klasę i świat w ziarnach domyślnych
//   (ZNANE_WYR) — charakterystyka dzisiejszego stanu. E2_AB_WYROCZNIA=plik — naruszenia (JSONL).
// - TRYB ŚCISŁY (ręczny, E2_AB_SCISLE=1; domyślnie wyłączony): W1 = ∅ poza klasami niewidocznymi R2, R4n i D7 (decyzja
//   2a) z dowodem — widok i okno Kosza równe na obu urządzeniach, a każdy różniący się wpis Kosza przechodzi dowodWpisu
//   (wiersz okna Kosza równy, „Przywróć” na klonach obu urządzeń daje ten sam widoczny wynik; wpis poza oknem Kosza —
//   osobno); p. 5 — widok po zdarzeniach = widok po W4 w każdym przebiegu (także Q8-obca-2, decyzja 3a; różnica samej
//   listy nagrobków pacjentów — osobna przyczyna); wyrocznia — w W1 żadnego naruszenia, którego nie ma też po W4 albo
//   przy samych blobach tego punktu. Dziś tryb jest czerwony (pomiar: ALGORITHMS, P-ZBIEZNOSC-ZDARZEN, „Wynik”).
// - Dowód niewidoczności także poza trybem ścisłym: D7 i R5 w profilu podstawowym — 'dowód' w tabeli DOZWOLONE.
// - Klasy z diagnozy różnic bez klasy (3.6): D7 z revPary, R4a′ ze zmianaISO, R5 (opis), „miejsce wizyty po „Scal
//   pacjentów””, „nagrobek karty opróżnionej”, „rekord złożony po jednej stronie”; kategoria W2s „ratunek D-21
//   przetrwałej karty”.
// - p. 6: warianty R5-E1 i R3-E2, w których trzecie urządzenie wysyła tylko zdarzenia, i nagrobek retencji bez ochrony
//   wizyt jak od starszej aplikacji (na końcu listy P6).
// - Profil „dłuższa praca bez połączenia” (ręczny, E2_AB_PROFIL=bez-polaczenia; PROFIL_BEZ_POLACZENIA niżej).
//
// E3-PR0b (flota ze starszą aplikacją i liczniki odsyłania; P-ZBIEZNOSC-ZDARZEN; tylko testy, bez zmiany sejfu):
// - LICZNIK ODSYŁANIA (tests/support/licznik-odsylania.mjs; blok na końcu pliku): echo każdego scalenia w profilach
//   podstawowym, koalescencji i pełnym — zdarzenie po zdarzeniu każdej strony dostawy i pół wymiany w pierwszym obiegu
//   wymiany W4; włączony domyślnie (E2_AB_ODSYL=0 wyłącza). Izolowany jak kr_cicho (cichoLicznik), więc program ziaren
//   i wszystkie dotychczasowe literały są te same; przebieg „determinizm” (ziarno 1, 20 mutacji) z licznikiem i bez daje
//   ten sam dziennik operacji, eksporty i wynik. Asercje w każdym ziarnie (pola zawsze obecne, warstwa wykonalna = po2a
//   między bieżącymi, budżet minuty slotu, powtórka partii — 0, odcisk testu = h) i literał ZNANE_ODSYL ziaren
//   domyślnych.
// - Urządzenie starszej aplikacji (urzadzenie(..., { app: 'S221' | 'S276' })): sejf i retencja v1 z fikstur
//   (tests/support/starsza-aplikacja.mjs), klon dziedziczy app; mutacja na sejfie 221 bez emisji (mutacjaBezDziennika:
//   odmowa sejfu z kodem z ODMOWY_STARSZEJ liczona, każdy inny wyjątek rzucany dalej); para z urządzeniem starszej
//   aplikacji w W4 — tabela 'flota' (kontPary).
// - Wyrocznia: w punktach bez urządzenia starszej aplikacji normalizacja tożsamości wizyty nieużyta (NORM_BEZ_FLOTY).
// - Bloki floty na końcu pliku: flota 221 i 276 (ziarna CI), strażniki transportu, scenariusze deterministyczne floty,
//   ręczny blok znanych usterek bieżącej aplikacji i stres (echo jednego scalenia pełnej kopii ze starszej aplikacji
//   w dużym świecie: budżet minuty slotu na bajtach realnych, literał STRES_ODSYL) — opis przy każdym bloku.
//
// KOLEJNOŚĆ W KROKU (E2-PR3a2, sprawdzana na emiterach): snap (także wersje przeniesione pod kartę celu „Scal pacjentów”
// i głowy scalenia), potem stomb, potem ptomb, potem pnote, pnotetomb, note, notetomb, plist, plisttomb, pref, pk, pktomb,
// cred. Pola karty zmienione bez snap tej karty w kroku niesie stomb z kartą (11.2), inaczej snap(karta, najnowsza
// wersja); karta bez wersji i bez stomb = „brak nośnika” (liczony w wyniku ziarna). Zdjęcie wpisu kosza wersji, która po
// mutacji jest w karcie, niesie snap tej wersji (jak emiter „Przywróć”, gdy wizyta jest już w karcie).
// Decyzja 12.2 (2026-11-04): w kroku „Scal pacjentów” zostaje „najpierw wizyty”; R2-E3 (p. 6) była „ZNANA RÓŻNICA”
// z naprawą w E3-PR0 — od E2-PR3c1 bez różnicy. K6 (B poprawia wizytę karty P, A „Scal pacjentów” P → Q bez wiedzy
// o poprawce) — zmierzone w p. 6: do E2-PR3c1 po zdarzeniach i pełnej wymianie poprawka ginęła na obu urządzeniach (same
// pełne kopie ją zachowują; decyzja 12.3); od E2-PR3c1 po pełnej wymianie bez utraty, a od E2-PR3c2 bez różnicy także po
// samych zdarzeniach (w E2-PR3c1 zostawała różnica treści wizyty do pełnej wysyłki).
//
// WARUNKI (3.2). D(X, Y) — różnice encja po encji na eksportach kanonicznych (pominSeq, pominSnapshotCount), każda z klasą
// z 3.6 albo bez (null): R2 (rev wersji ±1), R3 (rev nagrobka notatki), R4a (opis i gwiazdka wpisu kosza żywej karty),
// R4a′ (jak R4a z inną treścią — tylko p. 6), R4n (postać gwiazdki w treści wpisu kosza; widok Kosza równy), R5
// (obecność wpisu kosza karty usuniętej), createdAtISO-notatki i D7 (klasy dzisiejsze, profil pełny i p. 6), E1-katalog
// (klasa dzisiejsza, tylko W4 p. 5 i tylko przebiegi z listy E1_KATALOG, gdy same bloby dają różnicę na tych samych
// kluczach encji) i „notatka pod inną kartą” (do E2-PR3c4 klasa dzisiejsza po „Scal pacjentów”, także przy samych
// blobach; profil pełny — raport, p. 6 — dozwolona; od E3-PR0a R3, createdAtISO-notatki i „notatka pod inną kartą” bez
// wystąpień — w żadnej tabeli); tabela DOZWOLONE mówi, gdzie klasa nie czerwieni. Poza tabelą: wyjątek Q8-obca-2
// „ZNANA RÓŻNICA (zdarzenia)” (do decyzji właściciela: którą wizytę zostawić) — tylko W4 p. 5 i tylko klucze D
// z literału Q8_ZDARZENIA (klasyW4Kat).
// - W1 (dokładna charakterystyka) — w każdym punkcie spoczynku (pełne dostawy w obie strony z hakami, ≤ 4 rundy) D(A, B)
//   na żywych urządzeniach: profil podstawowy — każda różnica z klasą dozwoloną, a dla ziaren domyślnych lista punktów
//   [ziarno, krok, [klasy]] = ZNANE_W1 (nowa albo znikająca różnica = czerwień).
// - W2r (dokładna charakterystyka) — wymiana blobem na ŚWIEŻYCH klonach jednej migawki (klon = „przeładowanie strony”):
//   klon X′ po mergeSyncPayload(exportSyncPayload(Y)) wobec klonu X″; klasy jak W1, W2r ⊆ W1, ziarna domyślne = ZNANE_W2R.
// - W2s (charakterystyka) — w każdym punkcie pełnej dostawy X→Y klon Y1 (zdarzenia FIFO, bez haków) wobec klonu Y2 (blob
//   X), różnica po różnicy: K1 „karta częściowa do pfull” (tylko karta i jej wersje), K2 „ratunek D-21”, klasy 3.6, klasa
//   W2s K1k „wpis kosza karty w wyścigu”, „inne”; profil podstawowy wymaga „inne” = ∅.
// - W3 (zieleń) — te same koperty przez applyEncryptedDelta (ps) na trzecim klonie ≡ przez applyEncryptedEvent.
// - W4 (zieleń; gwarancja etapu 2, decyzja 7) — w każdym punkcie spoczynku dwie pary świeżych klonów: PO-A (B₁ scala
//   eksport A₁, potem A₁ eksport B₁ — jak przyjęty PUT z ETagiem) i PO-B; D obu par puste albo tylko klasy dozwolone w W4,
//   druga runda nic nie zmienia, a każda różnica R4n przechodzi W4p („Przywróć” na klonach obu stron przy stałym
//   Math.random daje ściśle równe eksporty).
// - Kolejność losowa (nie FIFO) — licznik i klasy różnic (charakterystyka).
// Nowe pomiary (W4, W4p, „Przywróć”, odczyt Kosza w klasyfikatorze) są izolowane (kr_cicho): program ziarna jest ten sam co
// przed ich dodaniem (kontrola wierności: dziennik operacji ziaren 1..40 taki sam jak w przebiegu bez nowych pomiarów;
// poprawka H2 zmienia dziennik w 13 ziarnach, listy W1/W2r bez zmian).
//
// PROFILE I ZIARNA. Podstawowy: zapis karty i nowej wersji, poprawka w miejscu, gwiazdka, kosz (nie najnowszej wersji
// karty — inaczej ograniczenie E1), „Przywróć”, „Usuń pacjenta”, notatka pacjenta, notatka biblioteki, lista, zmiana
// hasła, dostawy częściowe i pełne w obie strony. Pełny (charakterystyka; W3 i W4 z klasami profilu pełnego — zieleń):
// dodatkowo retencja, „Scal pacjentów” z koszem po scaleniu, retencja przypiętej i „Zostaw notatkę” (wskrzeszenie notatki
// pacjenta). Ziarna: E2_AB_ZIARNA (podstawowy 8, pełny 2) od E2_AB_START (1), E2_AB_KROKI (domyślnie 60–120 mutacji
// z ziarna), E2_AB_WYNIKI=plik — JSONL z wynikiem ziarna (E2_AB_P5, E2_AB_P6 — wyniki bloków p. 5 i p. 6).
//
// BLOK DETERMINISTYCZNY (3.4). p. 1 — każdy z 14 builderów: mutacja jednej encji na A → koperty → świeży klon B ≡ klon B
// po blobie A, także dwukrotnie i w obu kolejnościach z sąsiednim rodzajem; W4. p. 2 — stomb: P1, P1b, P1c, P1d, znika,
// retencja (W2 w pierwszej pełnej dostawie, spoczynek, W1, W2r, W3, W4), odbiorca bez karty (K10) i P1e jako dokładna
// charakterystyka (ZMIANA ZACHOWANIA do akceptacji właściciela przed E2-PR6). p. 3 — D-5. p. 4 — nagrobek pacjenta
// u odbiorcy starszy i nowszy niż nowa wersja nadawcy, minimalne odtworzenie klasy W2s K1k, strażnik H2 „zawsze do
// kolejki” (N1 i N1b: notatka karty usuniętej, której koperta pnote przyszła razem z nagrobkiem). p. 5 — katalog kosza
// (kosz-po-kluczu-wspolne.mjs): literały ścieżek zdarzeń, blobu i W4, różnice E1-katalog (KAT_E1), lista „zmian
// zachowania”, npret-pin i npret-K (do E2-PR3c1 „ZNANA UTRATA”, od E2-PR3c1 bez utraty), pin-scal i popr-scal
// (E2-PR3c1), „ZNANA RÓŻNICA (zdarzenia)” Q8-obca-2 (Q8_ZDARZENIA, do decyzji właściciela: którą wizytę zostawić).
// p. 6 — znane klasy i dalsze ciągi z minimalnych odtworzeń analizy („ZNANA RÓŻNICA”, „ZNANA UTRATA” z pozycją
// planu, która je naprawi; do E2-PR3c4 także „ZNANA RÓŻNICA (dzisiejsza)” — notatka pod inną kartą po „Scal
// pacjentów”, od E2-PR3c4 bez różnicy). Klasy 3.6 — testy negatywne: predykat każdej klasy (pozytyw i negatywy
// z definicji na syntetycznych parach), tabela DOZWOLONE = tabela 3.6 literałem, D z niepustymi ścieżkami, W4p zawodzi
// na R4-a i R4-a′, W4 (dwa i trzy urządzenia) czerwone przy nieudanym W4p, przy różnicy niedozwolonej i bez punktu
// stałego.
//
// KOALESCENCJA KOLEJKI (E2-PR2b, reguła ogona). Przy S.koalescencja === 'ogon' kolejka Q_X łączy wpisy jak magazyn
// kolejki sejfu: o zastąpieniu wpisu decyduje funkcja Bob_plan WYCIĘTA z vilda_vault.js (tests/support/model-kolejki.mjs,
// ten sam model w M5c magazynu). Wpisy oczekujące = nigdy niedostarczone (indeks ≥ X.wyslane). Bez flagi zachowanie jak
// w E2-PR2a (kontrola wierności: JSONL ziaren domyślnych, p. 5 i p. 6 bez zmian poza ms). Testy: describe „koalescencja
// kolejki (reguła ogona)” — profil podstawowy bez W2s, ziarna ZIARNA_KOAL (E2_AB_ZIARNA_KOAL), literał ZNANE_W1_KOAL,
// suma koalescencji > 0; blok deterministyczny p. 7 (7a poprawki jednej wizyty z rzędu, 7b ratunek notatki za pełną
// kartą, 7c punkty R3 wariantu „na koniec”); E2_AB_KOAL=ogon — profil pełny z koalescencją (przebieg ręczny).
//
// KWARANTANNA (E2-PR2b, blok deterministyczny p. 7d; wymaganie E2-PR4). Odbiorca stosuje partię nadawcy, z której jedno
// albo dwa zdarzenia trafiają do kwarantanny (prawdziwe quarantinePut, quarantineList, quarantineMinSeq, quarantineRelease
// i quarantineCount sejfu w osobnym oknie nad atrapą IndexedDB — urządzenia uprzęży mają sejf na adapterze w pamięci);
// warianty FIFO / ponowienie / zwolnienie („Zwolnij”) / ponowienie + sufiks dla partii [pnote, pnotetomb],
// [pnote, ptomb, pnotetomb] i N1 [snap, pfull, pnote] (w kwarantannie pfull albo snap i pfull); literał: D wobec nadawcy
// i W4 (zwolnienie w N1 zostawia tylko u nadawcy wizytę albo całą kartę z notatką — charakterystyka, pełna wymiana ją
// dowozi; przy snap i pfull w kwarantannie samo ponowienie zostawia różnicę notatki, ponowienie + sufiks — nie).
// Każdy describe zaczyna od sprawdzenia, że VildaVault._eventLog istnieje (D1).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie, eksportKanoniczny } from '../support/urzadzenie-sync.mjs';
import { appendFileSync, readFileSync } from 'node:fs';
import { naglowek, okno } from './sesja-zapisu-uprzaz.mjs';
import { createHash } from 'node:crypto';
import { PRZYGOTOWANIA, repoRoot, sztucznyZegar, przesunZegar, zaladowanieSejfu, zegar } from './s4d7-wspolne.mjs';
import { SCEN as KATALOG, RUNDY, pelnyStan, widok } from './kosz-po-kluczu-wspolne.mjs';
import { dopiszDoKolejki } from '../support/model-kolejki.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { D, encje, naj, sciezkiEncji, sortuj } from '../support/encje-ladunku.mjs';
import { ZRODLO_SEJFU, zRejestremLancucha, zaladujZrodlo } from '../support/sejf-bez-wstawek.mjs';
import * as WYR from '../support/ostatnia-zmiana.mjs';
import * as LO from '../support/licznik-odsylania.mjs';
import { PROG_DELT_221, zrodlaStarszej } from '../support/starsza-aplikacja.mjs';
import { parse } from 'acorn';
import path from 'node:path';

// Kopia sejfu z rejestrem łańcucha (EMISJA): tekst raz na plik; okno z kopią ma otwartą bramkę (pole okna), a wynik
// ładowania to rejestr okna — tablica wpisów łańcucha w kolejności wywołań Bem_doLancucha.
const ZRODLO_EMITEROW = zRejestremLancucha();
function zRejestrem(win) {
  const lancuch = [];
  win.VILDA_EVENT_LOG = true;
  zaladujZrodlo(win, ZRODLO_EMITEROW, { lancuch: (z) => { lancuch.push(z); } });
  return lancuch;
}
zaladowanieSejfu(zRejestrem); // urządzenia katalogu p. 5 (s4d7-wspolne.mjs)

// ── Wyrocznia „nie zginęła ostatnia zmiana” (E3-PR0a; tests/support/ostatnia-zmiana.mjs, WYROCZNIA w nagłówku) ─────
// E2_AB_WYROCZNIA=plik — naruszenia wyroczni (JSONL: punkty z naruszeniami i podsumowania ziaren); E2_AB_SCISLE=1 —
// tryb ścisły (ręczny; TRYB ŚCISŁY w nagłówku). Czas wyroczni (zapis historii, widoki, ocena) — druk w afterAll.
const WYR_PLIK = process.env.E2_AB_WYROCZNIA || '';
const SCISLE = process.env.E2_AB_SCISLE === '1';
const WYR_CZAS = { zapis: 0, widoki: 0, ocena: 0, ocen: 0 };
// Widoki urządzeń na żywo z własnym Math.random na czas odczytu (program ziarna bez zmian — jak kr_cicho, także
// w p. 5, gdzie generator nie patrzy na S.losAlt).
async function cichoLos(S, fn) {
  S.nrWyr = (S.nrWyr || 0) + 1;
  const alt = rng(0xA11CE + (S.nrKroku || 0) * 7 + S.nrWyr);
  if (!vi.isMockFunction(Math.random)) return fn();
  let wynik;
  await vi.mocked(Math.random).withImplementation(() => alt(), async () => { wynik = await fn(); });
  return wynik;
}
async function wyrWidoki(S, urz) {
  const t0 = performance.now();
  try {
    return await cichoLos(S, async () => { const o = {}; for (const [n, U] of Object.entries(urz)) o[n] = await WYR.widokUrz(U); return o; });
  } finally { WYR_CZAS.widoki += performance.now() - t0; }
}
async function wyrWidokiKlonow(urz) {
  const t0 = performance.now();
  try { const o = {}; for (const [n, U] of Object.entries(urz)) o[n] = await WYR.widokUrz(U); return o; } finally { WYR_CZAS.widoki += performance.now() - t0; }
}
// Ocena jednego punktu: swiat — 'W1' (po samych zdarzeniach), 'W4' (zdarzenia, a po nich pełna wymiana), 'bloby' (świat
// samych blobów); punkt — opis do raportu. Naruszenia trafiają do S.wyrNaruszenia (z punktem, krokiem i światem).
// E3-PR0b: w punkcie bez urządzenia starszej aplikacji (historia i kont.stare) normalizacja tożsamości wizyty wyroczni
// (WYR.NORM_VISIT) nie może rozstrzygnąć żadnego porównania — bieżąca aplikacja zawsze zapisuje payload.visit; inaczej
// punkt trafia do NORM_BEZ_FLOTY (afterEach niżej: pusta lista).
const NORM_BEZ_FLOTY = [];
function wyrOcena(S, swiat, punkt, widoki, kont = {}) {
  if (!S.wyr) return [];
  const t0 = performance.now();
  const zeStarsza = (kont.stare && kont.stare.length > 0) || [...S.wyr.app.values()].some((a) => a !== WYR.BIEZACA);
  const norm0 = WYR.NORM_VISIT.uzyta;
  const lista = WYR.ocen(S.wyr, widoki, { etykieta: S.wyrEtyk, ...kont }).map((x) => ({ ...x, swiat, punkt, krok: S.nrKroku || 0 }));
  if (!zeStarsza && WYR.NORM_VISIT.uzyta !== norm0) NORM_BEZ_FLOTY.push(`${swiat} ${punkt}#${S.nrKroku || 0}: ${WYR.NORM_VISIT.uzyta - norm0} porównań`);
  (S.wyrNaruszenia = S.wyrNaruszenia || []).push(...lista);
  S.wyrPunkty = (S.wyrPunkty || 0) + 1;
  if (WYR_PLIK && lista.length) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'punkt', swiat: S.wyrSwiat || null, ziarno: S.ziarno ?? null, krok: S.nrKroku || 0, punkt, mutacji: S.wyr.mutacji, naruszenia: lista, dziennik: (S.dziennik || []).slice(-14) }) + '\n');
  WYR_CZAS.ocena += performance.now() - t0; WYR_CZAS.ocen += 1;
  return lista;
}
// Zbiór (klasa, świat) naruszeń — literały p. 5 i p. 6 (klasa null — „bez klasy”).
const zbiorWyr = (lista) => [...new Set(lista.map((x) => `${x.klasa || 'bez klasy'} | ${x.swiat}`))].sort();
// Naruszenia, które czerwienią (bez klasy albo w świecie spoza listy klasy) — skrót do komunikatu.
const wyrCzerwone = (lista) => lista.filter((x) => WYR.bezWyjatku([x], x.swiat).length).map((x) => `${x.swiat} ${x.punkt}#${x.krok} ${x.urz} ${x.encja} ${x.et} ${x.rodzaj} [${x.klasa || 'bez klasy'}] oczek ${JSON.stringify(x.oczek)} fakt ${JSON.stringify(x.fakt)} gdzieIndziej ${x.gdzieIndziej}`);

// ── Wspólne ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const START = Date.parse('2026-03-02T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = 1000) => ustaw(teraz + ms);
const json = (x) => JSON.parse(JSON.stringify(x));
const OPCJE = { pominSeq: true, pominSnapshotCount: true };
const kanon = (lad) => JSON.parse(eksportKanoniczny(lad, OPCJE));
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
// D1: każdy describe zaczyna od sprawdzenia, że eksport dziennika zdarzeń istnieje (czerwone na bazie bez API).
const d1 = () => it('D1: VildaVault._eventLog istnieje', () => { expect(typeof okno().win.VildaVault._eventLog).toBe('object'); });

// Własny generator (mulberry32, wzór kosz-po-kluczu-fuzz.test.mjs) — ziarno wyznacza program, identyfikatory i IV.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tasuj = (a, los) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(los() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// crypto okna z ziarnem: identyfikatory (16 B) i IV (12 B) z generatora, reszta (klucze) z prawdziwego źródła.
function kryptoZiarna(ziarno) {
  const los = rng(ziarno);
  return {
    subtle: globalThis.crypto.subtle,
    getRandomValues: (x) => {
      if (x instanceof Uint8Array && (x.length === 16 || x.length === 12)) { for (let i = 0; i < x.length; i += 1) x[i] = Math.floor(los() * 256); return x; }
      return globalThis.crypto.getRandomValues(x);
    },
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(los() * 16).toString(16)),
  };
}

// ── Encje ładunku (wyrocznia emisji i różnice) ───────────────────────────────────────────────────────────────────────
// sortuj, naj, encje(ładunek), sciezkiEncji i D(X, Y) — tests/support/encje-ladunku.mjs (wspólne z
// sync-pokrycie-mutacji.test.mjs).
// Zmienione albo nowe encje (zniknięcie bez nagrobka — nic: lokalne z założenia, D-8 A).
function zmienione(przed, po) {
  const a = encje(przed), b = encje(po);
  return [...b.entries()].filter(([k, e]) => !a.has(k) || a.get(k).val !== e.val).map(([, e]) => e);
}
// Różniące się encje dwóch ładunków (obie strony).
function rozneEncje(x, y) {
  const a = encje(x), b = encje(y);
  const klucze = new Set([...a.keys(), ...b.keys()]);
  return [...klucze].filter((k) => !a.has(k) || !b.has(k) || a.get(k).val !== b.get(k).val).sort();
}
// Pierwsze różniące się ścieżki dwóch kanonicznych eksportów.
function sciezki(a, b, limit = 8) {
  const out = [];
  const id = (o) => (o && typeof o === 'object' ? o.patientId || o.snapshotId || o.id || o.credentialId || null : null);
  const krotko = (v) => { const s = JSON.stringify(v); return s === undefined ? 'brak' : s.length > 80 ? s.slice(0, 77) + '…' : s; };
  const idz = (x, y, p) => {
    if (out.length >= limit) return;
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (Array.isArray(x) && Array.isArray(y)) {
      const mx = new Map(x.map((e, i) => [id(e) || '#' + i, e])), my = new Map(y.map((e, i) => [id(e) || '#' + i, e]));
      for (const k of new Set([...mx.keys(), ...my.keys()])) idz(mx.get(k), my.get(k), `${p}[${String(k).slice(0, 8)}]`);
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) idz(x[k], y[k], p ? `${p}.${k}` : k);
      return;
    }
    out.push(`${p}: ${krotko(x)} ≠ ${krotko(y)}`);
  };
  idz(a, b, '');
  return out;
}

// ── Znane klasy (specyfikacja 2a, 3.6) ───────────────────────────────────────────────────────────────────────────────
// Klasa = predykat na jednej różnicy z D(X, Y) porównywanej pary (A, B w W1 i W4; A′, A″ / B′, B″ w W2r; Y1, Y2 w W2s);
// pierwszy pasujący wygrywa (R2, R3, R4a, R4a′, R4n, R5, createdAtISO-notatki, D7, R5 (opis), miejsce wizyty po „Scal
// pacjentów”, nagrobek karty opróżnionej, rekord złożony po jednej stronie, E1-katalog, notatka pod inną kartą).
// kont.kosz = { x, y } — listTrashedSnapshots() obu stron (dla R4n; pomiar izolowany); kont.e1Bloby — klucze D ścieżki
// samych blobów tej pary (tylko W4 p. 5).
const R4A_POLA = ['rev', 'updatedAtISO', 'gwiazdka', 'payload._pinned', 'payload._pinnedState'];
const POSTAC_GWIAZDKI = ['payload._pinned', 'payload._pinnedState'];
// D7 (ALGORITHMS, „rev, opis i część pól nagrobka zależne od kolejności (D7, Z5)”, P-KOSZ-POLKRATA, ok. 29720–29726): „opis nagrobka po
// plotce (rev, updatedAtISO, zmianaISO), koszISO (składnik k ginie razem z koszem, który przegrał z późniejszą wersją bez
// przycięcia […]) […] — od kolejności scaleń” — przy samych blobach. Od E3-PR0a także revPary (pary chwila usunięcia,
// rev wpisu z ładunku, Bpk_revPary — zależne od kolejności scaleń; PD-17: nie kolejkować ponownie z powodu revPary).
const D7_POLA = ['rev', 'updatedAtISO', 'zmianaISO', 'koszISO', 'revPary'];
// R5 (opis): wpis Kosza karty, której nie ma na żadnej stronie, a jej nagrobek jest na obu, różni się tylko opisem
// (chwila usunięcia, rev, gwiazdka, koszISO, revPary, przycietoISO) — okno Kosza go nie pokazuje (od E3-PR0a).
const R5_POLA = ['deletedAtISO', 'rev', 'updatedAtISO', 'zmianaISO', 'gwiazdka', 'koszISO', 'revPary', 'przycietoISO'];
const wPolach = (s, pola) => pola.some((d) => s === d || s.startsWith(d + '.') || s.startsWith(d + '['));
const kartaW = (k, pid) => (k.patients || []).some((p) => p.patientId === pid);
const nagrobekW = (k, pid) => (k.tombstones || []).some((t) => t.patientId === pid);
const notatkaW = (k, id) => (k.patientNotes || []).some((n) => n.id === id);
// Widok Kosza jednego wpisu (to, co pokazuje okno Kosza i co niesie „Przywróć”): pola listTrashedSnapshots bez postaci
// gwiazdki w treści (payload._pinned, payload._pinnedState) — gwiazdkę pokazuje pole pinned.
function widokWpisu(e) {
  if (!e) return null;
  const { payload, ...reszta } = e;
  const p = payload && typeof payload === 'object' ? { ...payload } : payload;
  if (p && typeof p === 'object') { delete p._pinned; delete p._pinnedState; }
  return sortuj({ ...reszta, payload: p });
}
const widokKosza = (lista) => (lista || []).map(widokWpisu).sort((m, n) => (JSON.stringify(m) < JSON.stringify(n) ? -1 : 1));
function klasa(r, X, Y, kont = {}) {
  const obie = r.a != null && r.b != null;
  const tylkoPola = (pola) => r.sciezki.length > 0 && r.sciezki.every((s) => wPolach(s, pola));
  if (r.rodzaj === 'wersja' && obie && tylkoPola(['rev']) && Math.abs((Number(r.a.rev) || 0) - (Number(r.b.rev) || 0)) === 1) return 'R2';
  if (r.rodzaj === 'pnotetomb' && obie && tylkoPola(['rev']) && !notatkaW(X, r.klucz) && !notatkaW(Y, r.klucz)) return 'R3';
  if (r.rodzaj === 'kosz') {
    const [sid, pid] = r.klucz.split('|');
    const zywa = kartaW(X, pid) && kartaW(Y, pid) && !nagrobekW(X, pid) && !nagrobekW(Y, pid);
    const spozaPayload = r.sciezki.some((s) => !wPolach(s, ['payload']));
    if (obie && zywa && spozaPayload && tylkoPola(R4A_POLA)) return 'R4a';
    if (obie && zywa && spozaPayload && tylkoPola([...R4A_POLA, 'zmianaISO', 'payload']) && r.sciezki.some((s) => wPolach(s, ['payload']) && !wPolach(s, POSTAC_GWIAZDKI))) return 'R4a′';
    if (obie && tylkoPola(POSTAC_GWIAZDKI) && kont.kosz) {
      const wx = widokKosza((kont.kosz.x || []).filter((e) => e.snapshotId === sid)), wy = widokKosza((kont.kosz.y || []).filter((e) => e.snapshotId === sid));
      if (JSON.stringify(wx) === JSON.stringify(wy)) return 'R4n';
    }
    if (!obie && !kartaW(X, pid) && !kartaW(Y, pid) && nagrobekW(X, pid) && nagrobekW(Y, pid)) return 'R5';
  }
  if (r.rodzaj === 'pnote' && obie && tylkoPola(['createdAtISO'])) return 'createdAtISO-notatki';
  if (r.rodzaj === 'kosz' && obie && tylkoPola(D7_POLA)) return 'D7';
  if (r.rodzaj === 'kosz' && obie && tylkoPola(R5_POLA)) {
    const pid = r.klucz.replace(/#\d+$/, '').split('|')[1];
    if (!kartaW(X, pid) && !kartaW(Y, pid) && nagrobekW(X, pid) && nagrobekW(Y, pid)) return 'R5';
  }
  if (miejsceWizyty(r, X, Y)) return MIEJSCE_WIZYTY;
  if (nagrobekKartyPustej(r, X, Y)) return NAGROBEK_OPROZNIONEJ;
  if (rekordZlozony(r)) return REKORD_ZLOZONY;
  if (kont.e1Bloby && kont.e1Bloby.has(kluczD(r))) return E1;
  if (r.rodzaj === 'pnote' && obie && tylkoPola(['patientId']) && r.a.patientId !== r.b.patientId
    && [r.a.patientId, r.b.patientId].some((p) => nagrobekW(X, p) && nagrobekW(Y, p))) return NPIK;
  return null;
}
// Klasy dzisiejsze dopisane 2026-11-03 (występują też przy samych blobach; specyfikacja 2a, 3.6):
// - E1-katalog (znane ograniczenie E1 „obecność”, tests/unit/kosz-po-kluczu.test.mjs:165 „P trzyma x, K s1 (E1)”):
//   różnica, której klucz encji (rodzaj, klucz) ma też D ścieżki SAMYCH BLOBÓW tego samego przebiegu katalogu, w tej
//   samej parze (kont.e1Bloby — W4 nie gorsze niż same bloby). Predykat liczony dla każdego przebiegu p. 5; klasa jest
//   dozwolona TYLKO w W4 p. 5 (tabela 'W4:p5') i TYLKO w przebiegach z jawnej listy E1_KATALOG (dozwolona) — przebieg spoza
//   listy z taką różnicą = czerwień. Różnice wartości wobec ścieżki blobów — lista „zmian zachowania” (KAT_E1_ZMIANY).
// - „notatka pod inną kartą”: notatka pacjenta id na obu stronach, różni się WYŁĄCZNIE patientId, a karta co
//   najmniej jednego z dwóch patientId ma nagrobek na obu stronach. Pola pochodne zmiany patientId: ŻADNE (zmierzone:
//   D ma jedną ścieżkę „patientId”). Mechanizm: reguła P-NOTATKI-1 (G5) w Le (vilda_vault.js:7877 — zbiór Qpt kart
//   z nagrobkiem lokalnym albo z ładunku; zapis 7881:4179) podmienia w zwycięskim rekordzie z ładunku TYLKO patientId na
//   lokalny, gdy karta z ładunku ma nagrobek; treść (bodyCipher), category, rev = max, updatedAtISO z ładunku i
//   createdAtISO lokalne idą zwykłą regułą (wyższy rev, potem późniejsze updatedAtISO), więc obie strony mają ten sam
//   rekord poza patientId. Powstaje po „Scal pacjentów” P → Q na A i edycji notatki karty P na B bez wiedzy o scaleniu
//   (także po skrzyżowanych „Scal pacjentów”); taki sam wynik przy samych blobach i po W4 — błąd dzisiejszego scalania,
//   niezależny od dziennika zdarzeń (do zgłoszenia właścicielowi jako osobna poprawka reguły, decyzja 9).
const E1 = 'E1-katalog';
const NPIK = 'notatka pod inną kartą';
// Klasy dopisane w E3-PR0a (diagnoza różnic bez klasy; widoczne — bez dopuszczenia poza raportem profilu pełnego):
// - „miejsce wizyty po „Scal pacjentów”” (P1e (b), profil pełny): ta sama wizyta (snapshotId) leży po dwóch stronach
//   pod różnymi kartami z tą samą masą i gwiazdką; karta (albo nagrobek karty) tylko po jednej stronie, gdy każda wizyta
//   tej karty leży po drugiej stronie pod inną kartą. O wersji z ładunku pod inną istniejącą kartą decyduje nowszy
//   rekord („najpierw rev”, P-SYNC-WLASCICIEL), więc wersja z wyższą rev zostaje w starej karcie;
// - „nagrobek karty opróżnionej” (niewidoczna): nagrobek karty P tylko po jednej stronie, karty P nie ma po żadnej —
//   karta opróżniona przeniesieniem ostatniej wersji pod inną kartę znika bez nagrobka (vilda_vault.js:3662–3663);
// - „rekord złożony po jednej stronie”: wersja na obu, ta sama chwila zmiany, inna treść; strona z późniejszą chwilą
//   treści ma rekord złożony (treść z jednego rekordu, gwiazdka z drugiego: _pinnedState.zl, Bgw_zlozony) i wyższą rev.
const MIEJSCE_WIZYTY = 'miejsce wizyty po „Scal pacjentów”';
const NAGROBEK_OPROZNIONEJ = 'nagrobek karty opróżnionej';
const REKORD_ZLOZONY = 'rekord złożony po jednej stronie';
const wersjeKart = (k) => { const m = new Map(); for (const p of k.patients || []) for (const q of p.snapshots || []) m.set(q.snapshotId, { pid: p.patientId, q }); return m; };
const widokWersji = (q) => JSON.stringify([q && q.payload && q.payload.user ? q.payload.user.weight : null, !!(q && q.payload && q.payload._pinned)]);
const wszystkieGdzieIndziej = (p, k) => { const w = wersjeKart(k); return (p.snapshots || []).length > 0 && p.snapshots.every((q) => { const t = w.get(q.snapshotId); return t && t.pid !== p.patientId; }); };
function miejsceWizyty(r, X, Y) {
  if (!r.tylko) return false;
  const [U, V] = r.tylko === 'x' ? [X, Y] : [Y, X]; // U ma encję, V — nie
  if (r.rodzaj === 'wersja') {
    const [pid, sid] = r.klucz.split('/');
    const t = wersjeKart(V).get(sid);
    return !!t && t.pid !== pid && widokWersji(t.q) === widokWersji(r.a || r.b);
  }
  if (r.rodzaj === 'karta') {
    const p = (U.patients || []).find((q) => q.patientId === r.klucz);
    return !!p && wszystkieGdzieIndziej(p, V);
  }
  if (r.rodzaj === 'ptomb') {
    const p = (V.patients || []).find((q) => q.patientId === r.klucz);
    return !!p && wszystkieGdzieIndziej(p, U);
  }
  return false;
}
const nagrobekKartyPustej = (r, X, Y) => r.rodzaj === 'ptomb' && !!r.tylko && !kartaW(X, r.klucz) && !kartaW(Y, r.klucz);
function rekordZlozony(r) {
  if (r.rodzaj !== 'wersja' || !r.a || !r.b || r.a.updatedAtISO !== r.b.updatedAtISO) return false;
  const pa = r.a.payload || {}, pb = r.b.payload || {};
  if ((pa._contentAtISO || '') === (pb._contentAtISO || '')) return false;
  const [n, s] = (pa._contentAtISO || '') > (pb._contentAtISO || '') ? [r.a, r.b] : [r.b, r.a];
  return !!(n.payload._pinnedState && n.payload._pinnedState.zl === true) && (Number(n.rev) || 0) > (Number(s.rev) || 0);
}
const kluczD = (r) => `${r.rodzaj} ${r.klucz}`;
// Jawna lista przebiegów katalogu (obie kolejności), w których W4 p. 5 dopuszcza klasę E1-katalog (3.6).
const E1_KATALOG = new Set(['PRZ0-bez', 'E1-popr-C', 'E1-C', 'Q8-obca-2']);
// Gdzie klasa jest dozwolona (3.6): 'tak' — zieleń, 'raport' — drukowana, nie czerwieni; 'dowód' — zieleń tylko z dowodem
// niewidoczności tej różnicy (dowodWpisu: wiersz okna Kosza równy, „Przywróć” daje ten sam widoczny wynik; decyzja
// właściciela 2a z 2026-11-15, reguła PD-17), bez dowodu — czerwień; brak wpisu — czerwień.
// Tabele: 'podstawowy' (W1, W2r, W2s profilu podstawowego), 'W4' (W4: profil podstawowy, p. 1–4, P1e), 'W4:p5' (W4 p. 5;
// E1-katalog tylko w przebiegach z listy E1_KATALOG), 'pelny' (W1, W2r, W2s profilu pełnego), 'pelny:W4' (W4 profilu
// pełnego), 'p6' (p. 6). R4n w każdej tabeli W4 wymaga W4p
// (w4 i w4Trzy liczą W4p); W4 p. 5 (klasyW4Kat, urządzenia katalogu bez klonów) W4p nie liczy, więc R4n w 'W4:p5' NIE
// jest dozwolone — R4n w p. 5 = czerwień do analizy (P4 weryfikacji; dziś p. 5 nie ma R4n).
// E3-PR0a (pomiar 2026-11-15 na bazie z P-TRWALE-WIZYTY: profil podstawowy 40 ziaren, pełny 20, p. 6): R3,
// createdAtISO-notatki i „notatka pod inną kartą” — zero wystąpień w W1, W2r, W4 i w kolejności losowej; w W2s profilu
// pełnego „notatka pod inną kartą” raz (ziarno 6, krok 118), pod kategorią „ratunek D-21” (sprawdzaną przed klasą).
// Bez wpisu w żadnej tabeli: każde wystąpienie czerwieni tam, gdzie tabela czerwieni (profil podstawowy, W4, W4:p5,
// pelny:W4, p6; W1, W2r i W2s profilu pełnego tylko drukują). Predykaty klas i ich testy zostają. D7 i R5 w profilu
// podstawowym — 'dowód' (profil „dłuższa praca bez połączenia”: revPary i opis wpisu Kosza karty usuniętej na obu).
// E3-PR0b — tabela 'flota' (pary z urządzeniem starszej aplikacji w W4 floty i w scenariuszach floty): tylko klasy par
// floty (klasaParyFloty w bloku floty niżej) i R4n; ta sama różnica w parze dwóch bieżących urządzeń — tabela
// wołającego, bez tych klas (czerwień).
const D_TOZSAMOSC = 'tożsamość wizyty nieznana starszej aplikacji';
const D_POLE_221 = 'pole nieznane starszej aplikacji (221)';
const D_RETENCJA = 'retencja starszej aplikacji — obecność wersji';
// E3-PR0b2b (P-NOTATKA-POZNIEJSZA): pola chwili treści i oznaczenia notatki, których starsza aplikacja nie zna.
const D_CHWILE_NOTATKI = 'chwile notatki nieznane starszej aplikacji';
const POLA_CHWIL_NOTATKI = Object.freeze(['contentAtISO', 'contentForISO', 'stateAtISO', 'stateForISO']);
const DOZWOLONE = Object.freeze({
  podstawowy: { R2: 'tak', R4a: 'tak', R5: 'dowód', R4n: 'tak', D7: 'dowód' },
  W4: { R4n: 'tak' },
  'W4:p5': { [E1]: 'tak' },
  pelny: { R2: 'raport', R4a: 'raport', R5: 'raport', 'R4a′': 'raport', R4n: 'raport', D7: 'raport', [MIEJSCE_WIZYTY]: 'raport', [NAGROBEK_OPROZNIONEJ]: 'raport', [REKORD_ZLOZONY]: 'raport' },
  'pelny:W4': { R4n: 'tak', D7: 'raport', [NAGROBEK_OPROZNIONEJ]: 'raport' },
  p6: { R2: 'tak', R4a: 'tak', R5: 'tak', 'R4a′': 'tak', R4n: 'tak' },
  flota: { R4n: 'tak', [D_TOZSAMOSC]: 'tak', [D_POLE_221]: 'tak', [D_RETENCJA]: 'tak', [D_CHWILE_NOTATKI]: 'tak' },
});
function dozwolona(kl, r, kont) {
  const w = kl ? (DOZWOLONE[kont.tabela] || {})[kl] : undefined;
  if (kl === 'createdAtISO-notatki' && kont.tabela === 'pelny:W4' && !(kont.wskrzeszone && kont.wskrzeszone.has(r.klucz))) return false;
  if (kl === E1 && !(kont.tabela === 'W4:p5' && E1_KATALOG.has(kont.przebieg))) return false;
  return w || false;
}
// E3-PR0b: para z urządzeniem starszej aplikacji (app ≠ 'N') bierze w W4 (w4, w4Trzy) tabelę 'flota'; bez jej wpisu
// w DOZWOLONE każda różnica takiej pary czerwieni. Para dwóch bieżących urządzeń — tabela wołającego, jak dotąd.
const starszaAplikacja = (U) => !!U && typeof U.app === 'string' && U.app !== 'N';
// Kontekst tabeli 'flota' niesie też stronę urządzenia starszej aplikacji w parze ('x' — pierwsze, 'y' — drugie) i jego
// app (klasy par floty, klasaParyFloty w bloku floty niżej), a tabelaBiezacych — tabelę wołającego (klasa bieżących
// urządzeń w różnicy z polami, których starsza aplikacja nie zna: D7 przy tożsamości wpisu Kosza).
const kontPary = (X, Y, kont) => (starszaAplikacja(X) || starszaAplikacja(Y)
  ? { ...kont, tabela: 'flota', tabelaBiezacych: kont.tabela, starsza: starszaAplikacja(X) ? 'x' : 'y', appStarszej: (starszaAplikacja(X) ? X : Y).app } : kont);
// Klasyfikacja listy D: [{ ...r, klasa, dozwolona }] (kosz czytany tylko, gdy jest różnica postaci gwiazdki; w tabeli
// 'flota' także przy różnicy pola gwiazdka wpisu Kosza). W tabeli 'flota' różnica bez klasy dozwolonej w tej tabeli
// dostaje klasę pary floty (klasaParyFloty), jeśli ją spełnia (wariant w polu wariantFloty).
async function sklasyfikuj(d, X, Y, kont, czytajKosz) {
  const flota = kont.tabela === 'flota';
  const trzebaKosza = d.some((r) => r.rodzaj === 'kosz' && r.a && r.b && (r.sciezki.every((s) => wPolach(s, POSTAC_GWIAZDKI)) || (flota && r.sciezki.some((s) => wPolach(s, ['gwiazdka'])))));
  const k = { ...kont, kosz: trzebaKosza && czytajKosz ? await czytajKosz() : null };
  return d.map((r) => {
    const kl = klasa(r, X, Y, k);
    if (flota && !dozwolona(kl, r, kont)) {
      const kf = klasaParyFloty(r, X, Y, k);
      if (kf) return { ...r, klasa: kf.klasa, wariantFloty: kf.wariant, klasaPrzed: kl, dozwolona: dozwolona(kf.klasa, r, 'tabela' in kf ? { ...kont, tabela: kf.tabela } : kont) };
    }
    return { ...r, klasa: kl, dozwolona: dozwolona(kl, r, kont) };
  });
}
const klasyPunktu = (lista) => [...new Set(lista.map((r) => r.klasa || 'null'))].sort();
const skrotRoznicy = (r) => ({ klucz: r.klucz, rodzaj: r.rodzaj, klasa: r.klasa, dozwolona: r.dozwolona, tylko: r.tylko, sciezki: r.sciezki.slice(0, 6), ...(r.dowod ? { dowod: r.dowod } : {}) });

// ── Uprząż A ≡ B ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Świat S: atrapa workera (uprząż E2-PR0 jej wymaga, sync: false — bez ruchu), urządzenia (bliźniaki jednego konta),
// kolejki testowe Q (FIFO { kind, key, atISO, env }), kursory dostaw, hasła po chwili poświadczenia (zmiana hasła).
const HASLO_POCZATKOWE = 'Vilda#Testowe!2026abc';
function swiat(ziarno = 1) {
  return {
    ziarno, nrUrz: 0, atrapa: utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() }),
    kursor: new Map(), hasla: new Map(), dziennik: [], braki: [], nrHasla: 0,
    stat: { zdarzen: 0, dostaw: 0, pelnych: 0, h1: 0, h2: 0, w2s: { zgodne: 0, niezgodne: 0, kategorie: {}, roznice: {} }, w2sLista: [], w3: 0, w3Bledy: [], losowa: { zgodne: 0, niezgodne: 0 }, losowaLista: [], spoczynki: 0, w1Bledy: [], w2rBledy: [], w2r: 0, brakSpoczynku: [], w4: 0, w4Bledy: [], w4Klasy: [], w4R4n: 0, w4p: [], emitery: statEmiterow(), haki: statHakow(), hakiKolejnosc: [], scisle: [], dowody: [] },
    nrPomiaru: 0, losAlt: null, wskrzeszone: new Set(), profil: 'podstawowy',
  };
}
// Urządzenie z kopią sejfu z rejestrem łańcucha (U.lancuch — rejestr okna; EMISJA). dodatki — dodatkowe pola okna.
// E3-PR0b: app — 'N' (bieżący sejf, domyślnie), 'S221' albo 'S276' (sejf starszej aplikacji z fikstury;
// tests/support/starsza-aplikacja.mjs), retencja starszej aplikacji — 'v1' (fikstura, domyślnie) albo 'biezaca'
// (kontrola). Klon dziedziczy app i retencję bliźniaka. Sejf 221 nie ma dziennika zdarzeń ani rejestru łańcucha (U.ev
// i U.lancuch puste), sejf 276 — ma.
async function urzadzenie(S, nazwa, zBlizniaka = null, { dodatki = {}, app = null, retencja = null } = {}) {
  S.nrUrz += 1;
  const sejf = app || (zBlizniaka && zBlizniaka.app) || 'N';
  const ret = sejf === 'N' ? null : retencja || (zBlizniaka && zBlizniaka.retencja) || 'v1';
  let lancuch = null;
  const d = await utworzUrzadzenie({
    atrapa: S.atrapa, nazwa: `${nazwa}-${S.nrUrz}`, zBlizniaka: zBlizniaka ? zBlizniaka.d : undefined, sync: false,
    rejestrMagazynu: false, haslo: HASLO_POCZATKOWE, dodatki: { crypto: kryptoZiarna(S.ziarno * 7919 + S.nrUrz), ...dodatki },
    zrodla: sejf === 'N' ? { 'vilda_vault.js': (win) => { lancuch = zRejestrem(win); } } : zrodlaStarszej(sejf, { retencja: ret, lancuch: (l) => { lancuch = l; } }),
  });
  const U = { d, v: d.vault, ev: d.vault._eventLog, app: sejf, retencja: ret, nazwa, Q: [], setIds: new Set(), stan: null, usuniete: new Set(), znaneNotatki: new Map(), lancuch };
  ustawStan(U, await eksport(U));
  if (!zBlizniaka) S.hasla.set(idHasla(U.stan), HASLO_POCZATKOWE);
  return U;
}
// Stan urządzenia (ostatni eksport) i historia kart, które kiedykolwiek miały tu nagrobek (kategorie W2s).
function ustawStan(U, lad) {
  U.stan = lad;
  for (const t of lad.tombstones || []) U.usuniete.add(t.patientId);
  if (U.znaneNotatki) for (const n of lad.patientNotes || []) U.znaneNotatki.set(n.id, { patientId: n.patientId, title: n.title });
}
const idHasla = (lad) => (lad && lad.credential ? lad.credential.updatedAtISO : null);
async function eksport(U) { return json(await U.v.exportSyncPayload()); }
// Bieżące hasło urządzenia = hasło poświadczenia, które ma w magazynie (zmiana hasła przychodzi zdarzeniem cred).
function haslo(S, U) {
  const h = S.hasla.get(idHasla(U.stan));
  if (!h) throw new Error(`brak hasła dla poświadczenia ${idHasla(U.stan)} na ${U.nazwa}`);
  return h;
}
// Świeży klon z migawki („przeładowanie strony”: bez cieni i pamięci sesji w oknie, K4).
async function klon(S, U, nazwa = 'klon') {
  U.d.konto.haslo = haslo(S, U);
  return urzadzenie(S, `${U.nazwa}-${nazwa}`, U);
}
const zamknij = async (...lista) => { for (const K of lista) await K.d.zamknij(); };
const kursor = (S, X, Y) => S.kursor.get(X.nazwa + '>' + Y.nazwa) || 0;

// Wyrocznia „emiter doskonały” (projekt.md 7.3, specyfikacja 2a rozdz. 3.1): po mutacji lokalnej na X różnica encji
// eksportu przed/po → builder każdej zmienionej encji w tej chwili (wyrocznia porównania z emiterami; do Q_X tylko przy
// źródle „model” — MUTACJE_Z_MODELU). KOLEJNOŚĆ W KROKU (E2-PR3a2, sprawdzana na emiterach): snap (także wersje
// przeniesione pod kartę celu „Scal pacjentów” i nośnik pól karty: snap najnowszej wersji), potem stomb, potem ptomb,
// potem pnote, pnotetomb, note, notetomb, plist, plisttomb, pref, pk, pktomb, cred.
// Zdjęcie wpisu kosza (E2-PR3a3): wpis kosza sid|pid zniknął, a wersja sid jest po mutacji w karcie (zwykle pid) i nie ma
// jej snap w kroku → snap tej wersji (nośnik pól karty: dowolny snap tej karty w kroku; prawdziwy emiter „Przywróć”, gdy
// wizyta jest już w karcie, wysyła snap wersji przywracanej).
// Pola karty bez snap tej karty w kroku: stomb z kartą (11.2); inaczej snap(karta, najnowsza wersja); karta bez wersji
// i bez stomb → „brak nośnika” (S.braki).
const PO_STOMB = ['ptomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
async function zbuduj(U, e) {
  const ev = U.ev;
  switch (e.kind) {
    case 'snap': return ev.buildSnapshotEvent(e.patientId, e.snapshotId, null);
    // pfull (hak H1): porcje pełnej karty z setId wpisu rejestru (bez setId — losowy, jak w sejfie)
    case 'pfull': return ev.buildPatientFullEvents(e.patientId, null, e.setId !== undefined ? { setId: e.setId } : undefined);
    case 'stomb': return ev.buildSnapshotTombstoneEvent(e.key, null);
    case 'ptomb': return ev.buildPatientTombstoneEvent(e.key, null);
    case 'pnote': return ev.buildPatientNoteEvent(e.key, null);
    case 'pnotetomb': return ev.buildPatientNoteTombstoneEvent(e.key, null);
    case 'note': return ev.buildNoteEvent(e.key, null);
    case 'notetomb': return ev.buildNoteTombstoneEvent(e.key, null);
    case 'plist': return ev.buildPatientListEvent(e.key, null);
    case 'plisttomb': return ev.buildPatientListTombstoneEvent(e.key, null);
    case 'pref': return ev.buildPreferenceEvent(e.key, null);
    case 'pk': return ev.buildPasskeyEvent(e.key, null);
    case 'pktomb': return ev.buildPasskeyTombstoneEvent(e.key, null);
    case 'cred': return ev.buildCredentialEvent(null);
    default: throw new Error('nieznany rodzaj ' + e.kind);
  }
}
async function emituj(S, U, przed, po, opis = '', { doKolejki: wyslij = true } = {}) {
  const zm = zmienione(przed, po);
  const koperty = { snap: [], stomb: [], reszta: [] };
  const snapKart = new Set();
  for (const e of zm.filter((x) => x.kind === 'snap')) {
    const k = await zbuduj(U, e);
    if (k) { koperty.snap.push(k); snapKart.add(e.patientId); }
  }
  for (const e of zm.filter((x) => x.kind === 'stomb')) {
    const k = await zbuduj(U, e);
    if (k) koperty.stomb.push(k);
  }
  const kartyPo = encje(po);
  // Zdjęcie wpisu kosza wersji obecnej w karcie → snap tej wersji (nośnik pól karty).
  const wpisyKosza = (lad) => new Set((lad.snapshotTombstones || []).map((e) => `${e.snapshotId}|${e.patientId}`));
  const koszPo = wpisyKosza(po);
  const snapy = new Set(koperty.snap.map((k) => k.event.key));
  for (const wpis of wpisyKosza(przed)) {
    if (koszPo.has(wpis)) continue;
    const [sid, pid] = wpis.split('|');
    const w = kartyPo.get(`snap:${pid}/${sid}`) || [...kartyPo.values()].find((x) => x.kind === 'snap' && x.snapshotId === sid);
    if (!w || snapy.has(`${w.patientId}/${sid}`)) continue;
    const k = await U.ev.buildSnapshotEvent(w.patientId, sid, null);
    if (k) { koperty.snap.push(k); snapKart.add(w.patientId); snapy.add(k.event.key); }
  }
  const kartyStomb = new Set(koperty.stomb.flatMap((k) => (k.patients || []).map((p) => p.patientId)));
  for (const e of zm.filter((x) => x.kind === 'karta')) {
    if (snapKart.has(e.patientId) || kartyStomb.has(e.patientId)) continue;
    const najnowsza = kartyPo.get('karta:' + e.patientId).najnowsza;
    const k = najnowsza ? await U.ev.buildSnapshotEvent(e.patientId, najnowsza, null) : null;
    if (k) koperty.snap.push(k);
    else S.braki.push(`${U.nazwa} ${opis}: karta ${e.patientId.slice(0, 8)} bez wersji i bez stomb`);
  }
  for (const r of PO_STOMB) {
    for (const e of zm.filter((x) => x.kind === r)) {
      const k = await zbuduj(U, e);
      if (k) koperty.reszta.push(k);
    }
  }
  const lista = [...koperty.snap, ...koperty.stomb, ...koperty.reszta];
  if (wyslij) for (const k of lista) await doKolejki(S, U, k);
  return lista;
}

// ── Emitery i model (E2-PR3a3) ───────────────────────────────────────────────────────────────────────────────────────
// Rangi rodzajów (kolejność modelu = Bem_RANGI sejfu; AB4 sprawdza obie; E2-PR3b: pfull z haka H1 z rangą wersji).
// Porównanie zgodne(model, emitery) na ciągach { kind, key }: 'rowne' (ten sam ciąg), 'wRandze' (ten sam ciąg rang i te
// same encje w każdej grupie kolejnych wpisów tej samej rangi, inna kolejność w grupie) albo null (niezgodne: brak encji,
// dodatkowa encja, inna kolejność rang).
const RANGI = Object.freeze({ snap: 0, pfull: 0, stomb: 1, ptomb: 2, pnote: 3, pnotetomb: 4, note: 5, notetomb: 6, plist: 7, plisttomb: 8, pref: 9, pk: 10, pktomb: 11, cred: 12 });
function zgodne(model, emitery) {
  const ranga = (e) => { if (!(e.kind in RANGI)) throw new Error(`porównanie emiterów: rodzaj spoza rang: ${e.kind}`); return RANGI[e.kind]; };
  const [rm, re] = [model.map(ranga), emitery.map(ranga)];
  if (JSON.stringify(rm) !== JSON.stringify(re)) return null;
  const klucz = (e) => `${e.kind} ${e.key}`;
  if (model.every((e, i) => klucz(e) === klucz(emitery[i]))) return 'rowne';
  for (let i = 0; i < rm.length;) {
    let j = i;
    while (j < rm.length && rm[j] === rm[i]) j += 1;
    if (JSON.stringify(model.slice(i, j).map(klucz).sort()) !== JSON.stringify(emitery.slice(i, j).map(klucz).sort())) return null;
    i = j;
  }
  return 'wRandze';
}
const statEmiterow = () => ({ porownan: 0, zgodnych: 0, wRandze: 0 });
// Niezgodności emiterów z modelem w bieżącym przypadku (także te, które wyjątek mutacji zgubiłby w kroku katalogu, który
// łapie wyjątki operacji); afterEach wymaga pustej listy (AB1). Suma porównań w pliku — druk w afterAll.
const EMITERY_NIEZGODNE = [];
const EMITERY_PLIK = statEmiterow();
// Jawny wyjątek (p. 1): rejestracja klucza dostępu jest zapisem testu z pominięciem API (registerPasskey na urządzeniu
// uprzęży kończy się odmową), więc jej źródłem jest model; źródło „model” poza tym literałem = błąd testu (AB6).
const MUTACJE_Z_MODELU = Object.freeze(['klucz dostępu']);
const opisKoperty = (k) => ({ kind: k.event.kind, key: k.event.key });
const opisWpisu = (z) => (z.znacznik ? `znacznik ${z.znacznik.reason}` : `${z.kind} ${z.kind === 'snap' ? `${z.klucze.patientId}/${z.klucze.snapshotId}`
  : z.kind === 'pfull' ? `${z.klucze.patientId} (setId ${z.o && z.o.setId})` : z.klucze}`);
// Encja wpisu rejestru dla buildera (zbuduj): wersja, pełna karta (hak H1 — setId wpisu, z.o.setId) albo klucz rodzaju.
const encjaWpisu = (z) => (z.kind === 'snap' ? { kind: 'snap', patientId: z.klucze.patientId, snapshotId: z.klucze.snapshotId }
  : z.kind === 'pfull' ? { kind: 'pfull', patientId: z.klucze.patientId, setId: z.o ? z.o.setId : undefined } : { kind: z.kind, key: z.klucze });
// Koperty z prawdziwych emiterów: wpisy rejestru konta urządzenia w ich kolejności (znaczniki partii importu pominięte),
// builder każdego wpisu po mutacji; null — bez koperty, wyjątek buildera — błąd testu.
async function zEmiterow(U, wpisy, uid, opis) {
  const out = [];
  for (const z of wpisy) {
    if (z.znacznik || z.uid !== uid) continue;
    const e = encjaWpisu(z);
    let k;
    try { k = await zbuduj(U, e); } catch (x) { throw new Error(`AB1: builder wpisu rejestru ${opisWpisu(z)} po mutacji „${opis}” na ${U.nazwa} → wyjątek ${x && (x.code || x.message)}`); }
    if (Array.isArray(k)) out.push(...k); else if (k) out.push(k);
  }
  return out;
}
// Porównanie kopert jednej mutacji (liczniki S.stat.emitery); niezgodne — wyjątek z opisem i wpis w EMITERY_NIEZGODNE.
function porownaj(S, U, opis, model, emitery, wpisy) {
  if (!S.stat.emitery) S.stat.emitery = statEmiterow();
  const [m, e] = [model.map(opisKoperty), emitery.map(opisKoperty)];
  const wynik = zgodne(m, e);
  S.stat.emitery.porownan += 1;
  if (wynik === 'rowne') S.stat.emitery.zgodnych += 1;
  if (wynik === 'wRandze') S.stat.emitery.wRandze += 1;
  if (wynik) return wynik;
  const ciag = (l) => (l.length ? l.map((x) => `${x.kind} ${x.key}`).join(', ') : '(pusty)');
  const tekst = `AB1: emitery ≠ model — ${U.nazwa}: ${opis}${S.ziarno != null ? ` (ziarno ${S.ziarno}, krok ${S.nrKroku || 0})` : ''}\n  model: ${ciag(m)}\n  emitery: ${ciag(e)}\n  rejestr: ${wpisy.length ? wpisy.map(opisWpisu).join(', ') : '(pusty)'}`;
  EMITERY_NIEZGODNE.push(tekst);
  throw new Error(tekst);
}
// Karta notatki w kopercie pnote (model haków: hak karty notatki od E2-PR3c4); dla pozostałych kopert undefined.
const kartaKoperty = (k) => (k.event.kind === 'pnote' && Array.isArray(k.patientNotes) && k.patientNotes[0] ? k.patientNotes[0].patientId : undefined);
// Przy liczniku odsyłania (S.odsyl, E3-PR0b) wpis Q ma też jawną kopię koperty (jaw) — ładunek echa u odbiorcy.
async function doKolejki(S, U, k) {
  if (U.jawnie) { // katalog p. 5: osobne konta, koperta jawna (bez szyfrowania — szyfrowanie pokrywa W3)
    U.Q.push(Object.freeze({ kind: k.event.kind, key: k.event.key, atISO: k.event.atISO, pid: kartaKoperty(k), k: Object.freeze(json(k)) }));
    S.stat.zdarzen += 1;
    return;
  }
  if (S.koalescencja === 'ogon') { await doKolejkiOgon(S, U, Array.isArray(k) ? k : [k]); return; }
  const { env } = await U.ev.encryptEvent(k);
  U.Q.push(Object.freeze({ kind: k.event.kind, key: k.event.key, atISO: k.event.atISO, pid: kartaKoperty(k), env: Object.freeze(env), ...(S.odsyl ? { jaw: Object.freeze(json(k)) } : {}) }));
  S.stat.zdarzen += 1;
}
// Kolejka z łączeniem wpisów (S.koalescencja === 'ogon', E2-PR2b): wpisy nigdy niedostarczone (indeks ≥ U.wyslane) są
// wierszami pending magazynu; o zastąpieniu decyduje wycięta z sejfu Bob_plan (tests/support/model-kolejki.mjs), nowe
// wpisy na końcu. Porcje jednego zestawu pfull przychodzą razem, jak jedno enqueue. Liczniki: koal — dopisania, które
// zastąpiły wpis; koalWierszy — zastąpione wpisy; koalPominiete — dopisania z oczekującym wpisem tej encji bez
// zastąpienia (nie na ogonie). S.kolejkaLog — dopisania [urządzenie, kind, key, porcji, setId] i dostawy [urządzenie,
// 'dostawa', liczba nowo dostarczonych wpisów] (do JSONL przebiegu, E2_AB_WYNIKI; z niego ciągi przypadku M5c magazynu).
function zKoalescencja(S) {
  S.koalescencja = 'ogon';
  S.kolejkaLog = [];
  Object.assign(S.stat, { koal: 0, koalWierszy: 0, koalPominiete: 0 });
  return S;
}
async function doKolejkiOgon(S, U, koperty) {
  const nowe = [];
  for (const k of koperty) {
    const { env } = await U.ev.encryptEvent(k);
    nowe.push(Object.freeze({ kind: k.event.kind, key: k.event.key, atISO: k.event.atISO, pid: kartaKoperty(k), env: Object.freeze(env), setId: k.event.full ? k.event.full.setId : null, ...(S.odsyl ? { jaw: Object.freeze(json(k)) } : {}) }));
    S.stat.zdarzen += 1;
  }
  S.kolejkaLog.push([U.nazwa, nowe[0].kind, nowe[0].key, nowe.length, nowe[0].setId]);
  const { usuniete, kandydaci } = dopiszDoKolejki(U.Q, U.wyslane || 0, nowe);
  if (usuniete) { S.stat.koal += 1; S.stat.koalWierszy += usuniete; } else if (kandydaci) S.stat.koalPominiete += 1;
}
// Mutacja lokalna na X z emisją (stan przed = ostatni eksport X; X zmienia się tylko własnymi krokami i dostawami).
// Rejestr łańcucha X czyszczony przed operacją; po niej (i eksporcie) koperty emiterów z wpisów rejestru konta X, model
// bez dopisania do kolejki, porównanie (AB1), do Q_X — koperty emiterów. zrodlo: 'model' — tylko MUTACJE_Z_MODELU (do Q_X
// koperty modelu, bez porównania).
// Wyrocznia (E3-PR0a): na czas operacji U.v to pośrednik, który zapisuje wywołania API sejfu z listy WYR.OPERACJE
// (z argumentami — „Przywróć” wyrocznia rozpoznaje po snapshotId wywołania); operacja — wywołanie podane wprost (katalog
// p. 5 woła metodę sejfu z pominięciem U.v). Po mutacji historia (S.wyr) dostaje zapis: eksport przed i po, chwila
// i app urządzenia (E3-PR0b: klasy floty wyroczni).
// E3-PR0b: na urządzeniu z sejfem 221 (bez dziennika zdarzeń) — mutacjaBezDziennika: historia bez emisji. Przy liczniku
// odsyłania koperty mutacji trafiają na oś czasu własnych wysyłek (druk).
async function mutacja(S, U, opis, fn, { zrodlo = 'emitery', operacja = null } = {}) {
  if (U.app === 'S221') return mutacjaBezDziennika(S, U, opis, fn, { operacja });
  if (zrodlo !== 'emitery' && !(zrodlo === 'model' && MUTACJE_Z_MODELU.includes(opis))) throw new Error(`mutacja „${opis}”: źródło zdarzeń „${zrodlo}” spoza MUTACJE_Z_MODELU`);
  if (!Array.isArray(U.lancuch)) throw new Error(`mutacja „${opis}”: urządzenie ${U.nazwa} bez rejestru łańcucha`);
  const przed = U.stan;
  let wynik;
  let blad = null;
  U.lancuch.length = 0;
  const operacje = operacja ? [operacja] : [];
  const v0 = U.v;
  U.v = new Proxy(v0, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (!WYR.OPERACJE.includes(k)) return f.bind(cel);
    return (...args) => { operacje.push({ nazwa: k, args }); return f.apply(cel, args); };
  } });
  const chwila = Date.now();
  if (S.chwile) S.chwile.add(chwila); // strażnik chwil floty (E3-PR0b): chwile operacji
  try { wynik = await fn(); } catch (e) { blad = e; } finally { U.v = v0; }
  const po = await eksport(U);
  { const t0 = performance.now(); WYR.zapisz(S.wyr = S.wyr || WYR.nowyModel(), { dev: U.nazwa, app: U.app, opis, przed, po, t: chwila, operacje }); WYR_CZAS.zapis += performance.now() - t0; }
  if (idHasla(po) !== idHasla(przed) && U.noweHaslo) { S.hasla.set(idHasla(po), U.noweHaslo); }
  U.noweHaslo = null;
  const wpisy = U.lancuch.splice(0);
  const model = await emituj(S, U, przed, po, opis, { doKolejki: zrodlo === 'model' });
  let k = model;
  if (zrodlo === 'emitery') {
    k = await zEmiterow(U, wpisy, po.userId, opis);
    const w = porownaj(S, U, opis, model, k, wpisy);
    EMITERY_PLIK.porownan += 1;
    EMITERY_PLIK[w === 'rowne' ? 'zgodnych' : 'wRandze'] += 1;
    for (const x of k) await doKolejki(S, U, x);
  }
  if (S.odsyl && k.length) wyslijOs(S, U, 'wlasne', k.map((x) => bajtyKoperty(U, x)));
  ustawStan(U, po);
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} ${U.nazwa}: ${opis}${blad ? ` → wyjątek ${blad.code || blad.message}` : ''} → [${k.map((x) => x.event.kind).join(',')}]`);
  if (blad) throw blad;
  return { wynik, koperty: k, model };
}

// Zastosowanie partii u Y (applyEncryptedEvent; każdy status inny niż applied = błąd testu).
async function zastosuj(Y, partia, sposob = 'event') {
  for (const e of partia) {
    if (e.k) { await Y.v.mergeSyncPayload(json(e.k)); continue; } // katalog p. 5: koperta jawna przez mergeSyncPayload
    if (sposob === 'delta') { await Y.v.applyEncryptedDelta(e.env); continue; }
    const r = await Y.ev.applyEncryptedEvent(e.env);
    if (!r || r.status !== 'applied') throw new Error(`${Y.nazwa}: zdarzenie ${e.kind} ${e.key} → status ${r && r.status} ${r && (r.reason || r.code || '')}`);
  }
}
// ── Haki scalania E2-PR3b u odbiorcy Y po partii (HAKI w nagłówku) ──────────────────────────────────────────────────
// Jedyne miejsca, w których scalanie dopisuje do kolejki. Koperty z prawdziwych emiterów (wpisy rejestru łańcucha
// odbiorcy z zastosowania partii), model haków jako wyrocznia porównania w każdej partii (AB7).
// Model (bez dopisania do kolejki; { kind, key } i setId zestawu pfull):
// H1 przegrany nagrobek karty — zaraz po zdarzeniu ptomb(p) partii karta p jest u Y (nagrobek przegrał w chwili swojego
// zdarzenia; setId p:deletedAtISO zapamiętany na urządzeniu, bez powtórzeń) → pfull(p) z tym setId, gdy karta p jest
// u Y po całej partii (ten sam zestaw co Bob_zestawKarty sejfu dla identyfikatora z białej listy). Od E3-PR0a liczony
// zdarzenie po zdarzeniu jak H2: dotąd model sprawdzał kartę na stanie po całej partii i oczekiwał pfull(p) także dla
// starego nagrobka, który u Y niczego nie przegrał (karty nie było, a nagrobek Y był nowszy), gdy karta wracała
// późniejszymi zdarzeniami tej samej partii (fałszywy alarm AB7 w profilu „dłuższa praca bez połączenia”, ziarno 104;
// przypadek deterministyczny w bloku AB7);
// H2 ratunek notatki D-21 (K2) — notatka pacjenta, której nagrobek zniknął w partii (był przed albo przyszedł w partii),
// której rekord zmieniło scalanie i której nowa chwila nie pochodzi z koperty pnote tej partii → pnote(id), „zawsze do
// kolejki” (plan:201), TAKŻE gdy w tej partii przyszła jej własna koperta pnote (poprawka N1 z przeglądu E2-PR2a;
// specyfikacja 2a, 3.1 H2: bez tego notatka zostawała tylko na jednym urządzeniu — B z nagrobkiem, choć karta wracała
// przez H1). Ratunek daje notatce chwilę R + 1 ms + h; notatka, która wróciła zwykłą regułą z własną kopertą w partii
// (chwila tej koperty), nie jest ratunkiem — bez haka, jak w sejfie (zwykłe merge nie daje wierszy).
// H2 liczony zdarzenie po zdarzeniu (E2-PR3c1): stany — eksporty odbiorcy przed partią i po każdym jej zdarzeniu
// (dostawa liczy je dla partii z więcej niż jednym zdarzeniem); reguła wyżej na parze (stan przed zdarzeniem, stan po
// nim) i na tym jednym zdarzeniu. Sejf wysyła ratunek w chwili zapisu uratowanej wersji, więc ratunek w trakcie partii
// daje pnote(id) także wtedy, gdy późniejsza w tej partii koperta pnote(id) nadpisze uratowaną wersję (po całej partii
// notatka ma chwilę tej koperty, a ocena na stanie po partii haka nie widziała). Bez stanów (partia z jednym
// zdarzeniem) — para (przed, po), jak dotąd.
// Hak karty notatki (E2-PR3c4, Bem_wlasciciel) — koperta pnote(id) części, której wersja weszła u Y (rekord zmieniony,
// chwila koperty), a karta notatki u Y po części jest inna niż w kopercie (pole pid wpisu Q) → pnote(id), raz na partię.
function hakiModelu(Y, partia, przed, po, stany = null) {
  const model = [];
  const kartyStanu = (lad) => new Set((lad.patients || []).map((p) => p.patientId));
  const karty = kartyStanu(po);
  // H1 zdarzenie po zdarzeniu (jak H2): nagrobek przegrał w chwili swojego zdarzenia, gdy karta jest u Y zaraz po nim
  // (stany[i + 1]) — wtedy setId trafia do Y.setIds (jak Bem_pelne w Bem_przegrany sejfu); pfull tylko dla karty, która
  // jest u Y po całej partii (builder działa po partii, a dla nieobecnej karty nie daje kopert). Bez stanów (partia
  // z jednym zdarzeniem) — stan po partii, jak dotąd.
  const poZdarzeniu = stany ? stany.slice(1).map(kartyStanu) : null;
  for (const [i, e] of partia.entries()) {
    if (e.kind !== 'ptomb') continue;
    const setId = `${e.key}:${e.atISO}`;
    if (Y.setIds.has(setId) || !(poZdarzeniu ? poZdarzeniu[i] : karty).has(e.key)) continue;
    Y.setIds.add(setId);
    if (karty.has(e.key)) model.push({ kind: 'pfull', key: e.key, setId });
  }
  const odcinki = stany ? partia.map((e, i) => [[e], stany[i], stany[i + 1]]) : [[partia, przed, po]];
  for (const [czesc, x, y] of odcinki) {
    const a = encje(x), b = encje(y);
    const wCzesci = (kind, id) => czesc.some((q) => q.kind === kind && q.key === id);
    for (const [klucz, n] of b) {
      if (n.kind !== 'pnote') continue;
      const zmieniona = !a.has(klucz) || a.get(klucz).val !== n.val;
      const nagrobekZniknal = (a.has('pnotetomb:' + n.key) || wCzesci('pnotetomb', n.key)) && !b.has('pnotetomb:' + n.key);
      if (!zmieniona || !nagrobekZniknal) continue;
      const chwila = JSON.parse(n.val).updatedAtISO;
      if (czesc.some((q) => q.kind === 'pnote' && q.key === n.key && q.atISO === chwila)) continue;
      model.push({ kind: 'pnote', key: n.key });
    }
    // Hak karty notatki (E2-PR3c4, Bem_wlasciciel): koperta pnote(id) tej części, której wersja weszła u Y (rekord
    // zmieniony, chwila koperty), a karta notatki u Y inna niż w kopercie (reguła karty notatki: karta, która istnieje)
    // → pnote(id); bez powtórzeń.
    for (const q of czesc) {
      if (q.kind !== 'pnote' || typeof q.pid !== 'string') continue;
      const n = b.get('pnote:' + q.key);
      if (!n || (a.has('pnote:' + q.key) && a.get('pnote:' + q.key).val === n.val)) continue;
      const v = JSON.parse(n.val);
      if (v.updatedAtISO !== q.atISO || v.patientId === q.pid || model.some((m) => m.kind === 'pnote' && m.key === q.key)) continue;
      model.push({ kind: 'pnote', key: q.key });
    }
  }
  return model;
}
// Porównanie haków jednej partii na ciągach { kind, key, setId? } (model, emitery; kartaNotatki(id) — karta notatki
// u odbiorcy po partii): null — niezgodne (inny zbiór kopert albo uratowana notatka przed pełną kartą swojej karty
// w ciągu emiterów); 'rowne' — ten sam ciąg; 'wRandze' — inna kolejność tylko w obrębie rangi; 'innaKolejnosc' — inna
// kolejność rang (np. emitery pfull(P), pnote(n), pfull(R) wobec modelu pfull(P), pfull(R), pnote(n), gdy n jest
// notatką karty P: emitery idą w kolejności scaleń partii, model układa haki rodzajami).
function zgodneHaki(model, emitery, kartaNotatki) {
  const klucz = (e) => `${e.kind} ${e.key}${e.setId !== undefined ? ` ${e.setId}` : ''}`;
  if (JSON.stringify(model.map(klucz).sort()) !== JSON.stringify(emitery.map(klucz).sort())) return null;
  for (const [i, e] of emitery.entries()) {
    if (e.kind !== 'pnote') continue;
    const p = kartaNotatki(e.key);
    if (emitery.findIndex((x) => x.kind === 'pfull' && x.key === p) > i) return null;
  }
  if (model.every((e, i) => klucz(e) === klucz(emitery[i]))) return 'rowne';
  return zgodne(model, emitery) ? 'wRandze' : 'innaKolejnosc';
}
const statHakow = () => ({ porownan: 0, zgodnych: 0, wRandze: 0, innaKolejnosc: 0 });
// Niezgodności haków z modelem w bieżącym przypadku (także te, które wyjątek dostawy zgubiłby w kroku katalogu, który
// łapie wyjątki operacji); afterEach wymaga pustej listy (AB7). Suma porównań partii w pliku — druk w afterAll.
const HAKI_NIEZGODNE = [];
const HAKI_PLIK = statHakow();
// Opis koperty haka (zestaw pfull — pierwsza porcja i jej setId).
const opisHaka = (k) => { const x = Array.isArray(k) ? k[0] : k; return { kind: x.event.kind, key: x.event.key, ...(x.event.full ? { setId: x.event.full.setId } : {}) }; };
// Porównanie haków partii (liczniki S.stat.haki); niezgodne — wyjątek z opisem i wpis w HAKI_NIEZGODNE.
function porownajHaki(S, Y, partia, model, emitery, wpisy, po) {
  if (!S.stat.haki) S.stat.haki = statHakow();
  const notatki = encje(po);
  const karta = (id) => { const n = notatki.get('pnote:' + id); return n ? n.patientId : null; };
  const e = emitery.map(opisHaka);
  const wynik = zgodneHaki(model, e, karta);
  S.stat.haki.porownan += 1;
  const ciag = (l) => (l.length ? l.map((x) => `${x.kind} ${x.key}${x.setId !== undefined ? ` (setId ${x.setId})` : ''}`).join(', ') : '(pusty)');
  if (wynik) {
    S.stat.haki[wynik === 'rowne' ? 'zgodnych' : wynik] += 1;
    // partie z inną kolejnością haków (raport do opisu PR): krok, odbiorca, rodzaj różnicy, ciągi (klucze skrócone)
    const krotko = (l) => l.map((x) => `${x.kind} ${String(x.key).slice(0, 8)}`).join(', ');
    if (wynik !== 'rowne' && Array.isArray(S.stat.hakiKolejnosc)) S.stat.hakiKolejnosc.push(`#${S.nrKroku || 0} ${Y.nazwa} ${wynik}: model [${krotko(model)}], emitery [${krotko(e)}]`);
    return wynik;
  }
  const tekst = `AB7: haki z emiterów ≠ model — ${Y.nazwa} po partii [${partia.map((x) => `${x.kind} ${x.key}`).join(', ')}]${S.ziarno != null ? ` (ziarno ${S.ziarno}, krok ${S.nrKroku || 0})` : ''}\n  model: ${ciag(model)}\n  emitery: ${ciag(e)}\n  rejestr: ${wpisy.length ? wpisy.map(opisWpisu).join(', ') : '(pusty)'}`;
  HAKI_NIEZGODNE.push(tekst);
  throw new Error(tekst);
}
// Haki po partii: wpisy rejestru konta odbiorcy z zastosowania partii (znaczniki partii pominięte) → koperty builderów
// po partii (null — bez koperty, wyjątek buildera — błąd testu), porównanie z modelem (AB7; stany — eksporty odbiorcy po
// każdym zdarzeniu partii, dla H2 zdarzenie po zdarzeniu), do Q_Y — koperty emiterów (porcje zestawu pfull razem przy
// łączeniu wpisów, jak jedno enqueue). Wynik — dopisane koperty (porcje po kolei).
async function haki(S, Y, partia, przed, po, stany = null) {
  const wpisy = Y.lancuch.splice(0).filter((z) => !z.znacznik && z.uid === po.userId);
  const model = hakiModelu(Y, partia, przed, po, stany);
  const emitery = [];
  for (const z of wpisy) {
    let k;
    try { k = await zbuduj(Y, encjaWpisu(z)); } catch (x) { throw new Error(`AB7: builder wpisu rejestru ${opisWpisu(z)} po partii na ${Y.nazwa} → wyjątek ${x && (x.code || x.message)}`); }
    if (k && (!Array.isArray(k) || k.length)) emitery.push(k);
  }
  const w = porownajHaki(S, Y, partia, model, emitery, wpisy, po);
  HAKI_PLIK.porownan += 1;
  HAKI_PLIK[w === 'rowne' ? 'zgodnych' : w] += 1;
  const dodane = [];
  for (const k of emitery) {
    if (Array.isArray(k)) {
      if (S.koalescencja) { await doKolejki(S, Y, k); dodane.push(...k); } // zestaw razem
      else for (const x of k) { await doKolejki(S, Y, x); dodane.push(x); }
      S.stat.h1 += 1;
    } else { await doKolejki(S, Y, k); dodane.push(k); S.stat.h2 += 1; }
  }
  return dodane;
}

// Dostawa X→Y: FIFO-prefiks od kursora (losowa tylko długość k), powtórka = cofnięcie kursora o r i ponowne
// zastosowanie sufiksu. W każdym punkcie pełnej dostawy (k = wszystkie oczekujące) charakterystyka W2s i warunek W3
// (bez nich, gdy świat ma S.w2s === false). X.wyslane — najwyższy indeks Q_X kiedykolwiek dostarczony (granica wpisów
// oczekujących dla łączenia wpisów).
async function dostawa(S, X, Y, { k = Infinity, cofnij = 0, haki: zHakami = true, w2s = S.w2s !== false } = {}) {
  const nazwa = X.nazwa + '>' + Y.nazwa;
  const c = Math.max(0, (S.kursor.get(nazwa) || 0) - cofnij);
  const oczekujace = X.Q.slice(c);
  if (!oczekujace.length) return { partia: [], dodane: [] };
  const partia = oczekujace.slice(0, Math.min(k, oczekujace.length));
  const pelna = partia.length === oczekujace.length;
  S.stat.dostaw += 1;
  if (pelna) S.stat.pelnych += 1;
  if (pelna && w2s) await sprawdzW2s(S, X, Y, partia);
  const przed = Y.stan;
  if (!Array.isArray(Y.lancuch)) throw new Error(`dostawa ${nazwa}: odbiorca bez rejestru łańcucha`);
  Y.lancuch.length = 0; // rejestr odbiorcy: od tej chwili wpisy haków scalania tej partii (E2-PR3b)
  // Model haka H2 zdarzenie po zdarzeniu (E2-PR3c1): przy hakach i partii z więcej niż jednym zdarzeniem eksport odbiorcy
  // po każdym zdarzeniu (te same zastosowania, w tej samej kolejności; eksport nie zmienia stanu ani losowań).
  // E3-PR0b: licznik odsyłania liczy echo zdarzenie po zdarzeniu, więc przy S.odsyl stany są zawsze; model haków dostaje
  // je jak dotąd (tylko przy hakach i partii z więcej niż jednym zdarzeniem).
  const stanyH = zHakami && partia.length > 1;
  const stany = stanyH || S.odsyl ? [przed] : null;
  // czas eksportów robionych tylko dla licznika (bez modelu haków) — S.odsyl.msDodatkowe (druk)
  if (stany) for (const e of partia) { await zastosuj(Y, [e]); const t0 = performance.now(); stany.push(await eksport(Y)); if (!stanyH) S.odsyl.msDodatkowe.eksportyDostawy += performance.now() - t0; }
  else await zastosuj(Y, partia);
  S.kursor.set(nazwa, c + partia.length);
  const wyslane = Math.max(X.wyslane || 0, c + partia.length);
  if (S.kolejkaLog && wyslane > (X.wyslane || 0)) S.kolejkaLog.push([X.nazwa, 'dostawa', wyslane - (X.wyslane || 0)]);
  X.wyslane = wyslane;
  const po = stany ? stany[stany.length - 1] : await eksport(Y);
  let dodane = [];
  if (zHakami) dodane = await haki(S, Y, partia, przed, po, stanyH ? stany : null);
  else Y.lancuch.length = 0; // bez haków: wpisy haków tej partii pominięte
  ustawStan(Y, po);
  if (S.odsyl) await poPartiiOdsyl(S, X, Y, partia, stany, dodane);
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} dostawa ${nazwa}: ${partia.length}${cofnij ? ` (powtórka ${Math.min(cofnij, c + cofnij)})` : ''}${pelna ? ' pełna' : ''} [${partia.map((e) => e.kind).join(',')}]${dodane.length ? ` → haki [${dodane.map((x) => x.event.kind).join(',')}]` : ''}`);
  return { partia, dodane };
}

// W2s (charakterystyka) i W3 (warunek) w punkcie pełnej dostawy X→Y: świeże klony tej samej migawki Y — Y1 stosuje
// oczekujące zdarzenia X (FIFO, bez haków, applyEncryptedEvent), Y2 scala blob X, Y3 stosuje te same koperty przez
// applyEncryptedDelta (ps, flota mieszana), Y4 — w losowej kolejności (charakterystyka, nie FIFO).
async function sprawdzW2s(S, X, Y, partia) {
  Y.d.konto.haslo = haslo(S, Y);
  const [Y1, Y2, Y3, Y4] = await Promise.all(['z', 'b', 'd', ...(S.losowa ? ['l'] : [])].map((n) => klon(S, Y, n)));
  const blob = json(await X.v.exportSyncPayload());
  try {
    await Promise.all([zastosuj(Y1, partia), Y2.v.mergeSyncPayload(blob), zastosuj(Y3, partia, 'delta')]);
    const [e1, e2, e3] = await Promise.all([eksport(Y1), eksport(Y2), eksport(Y3)]);
    const [k1, k2, k3] = [kanon(e1), kanon(e2), kanon(e3)];
    S.stat.w3 += 1;
    if (JSON.stringify(k1) !== JSON.stringify(k3)) S.stat.w3Bledy.push({ krok: S.nrKroku, dostawa: X.nazwa + '>' + Y.nazwa, sciezki: sciezki(k1, k3) });
    if (JSON.stringify(k1) === JSON.stringify(k2)) S.stat.w2s.zgodne += 1;
    else {
      S.stat.w2s.niezgodne += 1;
      // Kategorie różnica po różnicy (3.2): K1 (tylko karta i jej wersje), K2, klasy 3.6 na parze (Y1, Y2), „inne”.
      const lista = await kr_cicho(S, async () => kategorieW2s(Y, X, partia, e1, e2, k1, k2, S.profil,
        async () => ({ x: await Y1.v.listTrashedSnapshots(), y: await Y2.v.listTrashedSnapshots() }), (d) => potwierdz(S, Y1, Y2, d)));
      const kat = [...new Set(lista.map((r) => r.kategoria))].sort().join(' + ');
      S.stat.w2s.kategorie[kat] = (S.stat.w2s.kategorie[kat] || 0) + 1;
      for (const r of lista) S.stat.w2s.roznice[r.kategoria] = (S.stat.w2s.roznice[r.kategoria] || 0) + 1;
      S.stat.w2sLista.push({ kategoria: kat, krok: S.nrKroku, dostawa: X.nazwa + '>' + Y.nazwa, encje: rozneEncje(e1, e2).slice(0, 6), sciezki: sciezki(k1, k2, 4), roznice: lista.slice(0, 8).map((r) => ({ ...skrotRoznicy(r), kategoria: r.kategoria })) });
    }
    if (Y4) {
      await zastosuj(Y4, tasuj(partia, S.los));
      const k4 = kanon(await eksport(Y4));
      if (JSON.stringify(k4) === JSON.stringify(k1)) S.stat.losowa.zgodne += 1;
      else {
        S.stat.losowa.niezgodne += 1;
        const d = await kr_cicho(S, async () => sklasyfikuj(D(k1, k4), k1, k4, { tabela: S.profil },
          async () => ({ x: await Y1.v.listTrashedSnapshots(), y: await Y4.v.listTrashedSnapshots() })));
        S.stat.losowaLista.push({ krok: S.nrKroku, dostawa: X.nazwa + '>' + Y.nazwa, klasy: klasyPunktu(d), roznice: d.slice(0, 6).map(skrotRoznicy) });
      }
    }
  } finally { await zamknij(...[Y1, Y2, Y3, Y4].filter(Boolean)); }
}
// Kategorie W2s różnica po różnicy (specyfikacja 2a, 3.2), w kolejności:
// 1. K1 „karta częściowa do pfull” — różnica samej karty p (rekord karty albo jej nagrobek: karta po jednej stronie,
//    nagrobek po drugiej) albo jej wersji (to, co niesie pfull z haka H1), gdy p jest w wyścigu „Usuń pacjenta”
//    (nagrobek po jednej stronie teraz, w partii albo kiedykolwiek wcześniej, a druga strona ma kartę); różnice wpisów
//    kosza i notatek nie wchodzą do K1 (przegląd E2-PR2a);
// 2. K2 „ratunek D-21” — notatka pacjenta (albo jej nagrobek), którą X uratował scalaniem, bez jej koperty pnote w partii;
// 3. klasa z 3.6 (predykaty na parze Y1, Y2) dozwolona w W2s profilu; potem klasa W2s K1k „wpis kosza karty w wyścigu”
//    (dopisana 2026-11-03 z rodowodem — ziarno 7 #36–#51, ziarno 8 #49–#59; minimalne odtworzenie w bloku p. 4):
//    wpis kosza s|p tylko po jednej stronie, a karta p w wyścigu „Usuń pacjenta” jak w K1. Blob niesie całą listę kosza
//    (suma list, Bkz_scalStart), więc wpis zdjęty u odbiorcy przez „Przywróć” wraca z blobem nadawcy, który o
//    przywróceniu nie wie; zdarzenia niosą tylko zmiany. Tylko W2s (stan po jednej dostawie; W1 po spoczynku i W4 zielone);
//    E3-PR0a: „ratunek D-21 przetrwałej karty” — partia X niesie pnote(n), ptomb(P) i pnotetomb(n, deletedWithPatient);
//    u odbiorcy karta P przeżywa (nowsza wersja), więc notatka idzie za kartą, która zostaje (P-NOTATKI-ZA-KARTA, ratunek
//    D-21), a blob X niesie tylko nagrobek bez treści; karta P po obu stronach, notatka (albo jej nagrobek) po jednej.
//    Tylko W2s (W1, W2r i W4 zgodne; po spoczynku notatkę dowozi hak H2);
// 4. „inne”.
const K1K = 'K1k wpis kosza karty w wyścigu';
const RATUNEK_KARTY = 'ratunek D-21 przetrwałej karty';
const K1K_ODTWORZENIE = [ // literał minimalnego odtworzenia K1k (blok p. 4)
  'K1k wpis kosza karty w wyścigu: kosz x|X tylko blob',
  'karta częściowa do pfull: wersja X/x1 tylko blob',
  'karta częściowa do pfull: wersja X/x3 tylko blob',
];
async function kategorieW2s(Y, X, partia, e1, e2, k1, k2, profil, czytajKosz, dowod = null) {
  const b = encje(e2), y = encje(Y.stan), x = encje(X.stan);
  const nagrobekX = (p) => {
    const t = x.get('ptomb:' + p);
    if (t) return JSON.parse(t.val).deletedAtISO;
    return partia.filter((q) => q.kind === 'ptomb' && q.key === p).map((q) => q.atISO).sort().pop() || null;
  };
  const wyscig = (p) => {
    if (!p) return false;
    const nagrY = Y.usuniete.has(p), nagrX = X.usuniete.has(p) || !!nagrobekX(p);
    return (nagrY && x.has('karta:' + p)) || (nagrX && y.has('karta:' + p));
  };
  const ratunek = (id) => b.has('pnote:' + id) && x.has('pnote:' + id) && !x.has('pnotetomb:' + id) && !partia.some((e) => e.kind === 'pnote' && e.key === id);
  const d = await sklasyfikuj(D(k1, k2), k1, k2, { tabela: profil }, czytajKosz);
  if (dowod) await dowod(d);
  const z1 = encje(e1);
  const ratunekKarty = (id) => {
    const t = [z1.get('pnotetomb:' + id), b.get('pnotetomb:' + id), x.get('pnotetomb:' + id), y.get('pnotetomb:' + id)].find((q) => q && JSON.parse(q.val).deletedWithPatient);
    if (!t) return false;
    const pid = JSON.parse(t.val).deletedWithPatient.patientId;
    return partia.some((e) => e.kind === 'pnote' && e.key === id) && kartaW(k1, pid) && kartaW(k2, pid) && (z1.has('pnote:' + id) || b.has('pnote:' + id));
  };
  return d.map((r) => {
    let kategoria = 'inne';
    if ((r.rodzaj === 'karta' || r.rodzaj === 'wersja' || r.rodzaj === 'ptomb') && wyscig(r.klucz.split('/')[0])) kategoria = 'karta częściowa do pfull';
    else if ((r.rodzaj === 'pnote' || r.rodzaj === 'pnotetomb') && ratunek(r.klucz)) kategoria = 'ratunek D-21';
    else if ((r.rodzaj === 'pnote' || r.rodzaj === 'pnotetomb') && ratunekKarty(r.klucz)) kategoria = RATUNEK_KARTY;
    else if (r.klasa && r.dozwolona && r.dozwolona !== 'dowód') kategoria = r.klasa;
    else if (r.rodzaj === 'kosz' && r.tylko && wyscig(r.klucz.split('|')[1])) kategoria = K1K;
    return { ...r, kategoria };
  });
}

// Punkt spoczynku: pełne dostawy w obie strony z hakami, aż obie kolejki są dostarczone i haki nic nie dodały (≤ 4 rundy).
async function spoczynek(S, A, B, { w2s = S.w2s !== false } = {}) {
  for (let r = 1; r <= 4; r += 1) {
    await dostawa(S, A, B, { w2s });
    await dostawa(S, B, A, { w2s });
    if (kursor(S, A, B) === A.Q.length && kursor(S, B, A) === B.Q.length) return r;
  }
  return null;
}
// W1: eksport kanoniczny A ≡ B (modulo seq i snapshotCount).
async function w1(A, B) {
  const [a, b] = [kanon(await eksport(A)), kanon(await eksport(B))];
  return JSON.stringify(a) === JSON.stringify(b) ? null : sciezki(a, b);
}
// W2r: na świeżych klonach jednej migawki — klon X' po scaleniu bloba drugiej strony ≡ klon X'' bez scalenia.
// Gdy W2r różne: wynik = ścieżki (jak dotąd) z polem roznice (D na parze X″, X′ z klasami; odczyt Kosza izolowany).
async function w2r(S, X, Y) {
  const X1 = await klon(S, X, 'r1'), X2 = await klon(S, X, 'r2');
  try {
    await X1.v.mergeSyncPayload(json(await Y.v.exportSyncPayload()));
    const [a, b] = [kanon(await eksport(X1)), kanon(await eksport(X2))];
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    const wynik = sciezki(b, a);
    wynik.roznice = await kr_cicho(S, async () => sklasyfikuj(D(b, a), b, a, { tabela: S.profil },
      async () => ({ x: await X2.v.listTrashedSnapshots(), y: await X1.v.listTrashedSnapshots() })));
    await potwierdz(S, X2, X1, wynik.roznice);
    return wynik;
  } finally { await zamknij(X1, X2); }
}

// ── Izolacja NOWYCH pomiarów (specyfikacja 2a, 3.1; wzór kr_cicho krytyka) ─────────────────────────────────────────
// Pomiar dodany po 2026-11-03 (W4, W4p, „Przywróć”, klasyfikator czytający listTrashedSnapshots(), W4 w p. 5 i p. 6)
// idzie przez kr_cicho: własny deterministyczny Math.random na czas pomiaru (S.losAlt, podpięty do szpiega
// przebiegZiarna) i własne numery klonów (nazwy w atrapie są jednorazowe), licznik urządzeń przywracany. Program ziarna
// zostaje ten sam. Istniejące W2r, W2s, W3 i klon Y4 zostają BEZ izolacji (Y4 zużywa S.los, a każde załadowanie
// vilda_vault.js w nowym oknie pobiera Math.random — vilda_vault.js:7890 — więc ich izolacja zmieniłaby program).
async function kr_cicho(S, fn) {
  const nr = S.nrUrz, pop = S.losAlt;
  S.nrPomiaru = (S.nrPomiaru || 0) + 1;
  S.losAlt = rng(0xC0FFEE + (S.nrKroku || 0) * 131 + S.nrPomiaru);
  S.nrUrz = 900000 + S.nrPomiaru * 100;
  try { return await fn(); } finally { S.nrUrz = nr; S.losAlt = pop; }
}
// Stały Math.random na czas „Przywróć” w W4p (3.1): withImplementation na szpiegu ziarna (vi.spyOn na już podmienionym
// Math.random zwraca tego samego szpiega i trwale nadpisałby generator); bez szpiega — chwilowy.
async function stalyLos(fn) {
  if (vi.isMockFunction(Math.random)) return vi.mocked(Math.random).withImplementation(() => 0.5, fn);
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
  try { return await fn(); } finally { spy.mockRestore(); }
}
// W1 z klasami: D na żywych urządzeniach (odczyt Kosza izolowany).
async function w1Klasy(S, A, B, kont) {
  const [a, b] = [kanon(await eksport(A)), kanon(await eksport(B))];
  return kr_cicho(S, async () => sklasyfikuj(D(a, b), a, b, kont,
    async () => ({ x: await A.v.listTrashedSnapshots(), y: await B.v.listTrashedSnapshots() })));
}
// ── Dowód niewidoczności różnicy wpisu Kosza (decyzja właściciela 2a z 2026-11-15; reguła PD-17) ─────────────────
// Klasy niewidoczne (decyzja 2a: R2 — sam rev wersji, R4n — postać gwiazdki w treści wpisu Kosza, D7 — opis, koszISO,
// revPary i rev nagrobka; też R5 — wpis Kosza karty, której nie ma) są dopuszczone bez odsyłania tylko z dowodem: na
// świeżych klonach obu stron (stały Math.random) wiersz okna Kosza tej wersji jest równy, a „Przywróć” daje na obu ten
// sam widoczny wynik tej wizyty (karta i Kosz w widoku wyroczni). Wiersza nie ma w oknie Kosza żadnej strony (karta wpisu nie istnieje) —
// „Przywróć” nie jest dostępne: dowód z wynikiem 'poza oknem' (raportowany osobno). Wiersz w oknie, a „Przywróć” rzuca na
// którejkolwiek stronie (także dwa jednakowe wyjątki) — brak dowodu. Klucz różnicy bez sufiksu #n (duplikat encji w D).
// Klon z hasłem bieżącego poświadczenia urządzenia (klony W2s i W2r po scaleniu bloba mogą mieć nowsze poświadczenie
// niż ich ostatni zapisany stan).
async function klonBiezacy(S, U, nazwa) {
  U.d.konto.haslo = haslo(S, { stan: await eksport(U), nazwa: U.nazwa });
  return urzadzenie(S, `${U.nazwa}-${nazwa}`, U);
}
async function dowodWpisu(S, X, Y, klucz) {
  const [sid, pid] = String(klucz).replace(/#\d+$/, '').split('|');
  const X2 = await klonBiezacy(S, X, 'dn'), Y2 = await klonBiezacy(S, Y, 'dn');
  try {
    const wiersz = (l) => widokKosza(l.filter((e) => e.snapshotId === sid && e.patientExists));
    const [ox, oy] = [wiersz(await X2.v.listTrashedSnapshots()), wiersz(await Y2.v.listTrashedSnapshots())];
    if (JSON.stringify(ox) !== JSON.stringify(oy)) return { ok: false, przywroc: null, powod: `wiersz okna Kosza ${sid.slice(0, 8)} różny` };
    if (!ox.length) return { ok: true, przywroc: 'poza oknem' };
    const przywroc = async (U) => { try { await U.v.restoreTrashedSnapshot(pid, sid); return 'ok'; } catch (e) { return `wyjątek ${e && (e.code || e.message)}`; } };
    let px = null, py = null;
    await stalyLos(async () => { px = await przywroc(X2); py = await przywroc(Y2); });
    if (px !== 'ok' || py !== 'ok') return { ok: false, przywroc: `${px} / ${py}`, powod: `„Przywróć” ${sid.slice(0, 8)}: ${px} / ${py}` };
    const tej = async (U) => { const V = await WYR.widokUrz(U); return JSON.stringify([V.w.get(sid) || null, V.podwojne.get(sid) || null]); };
    if (await tej(X2) !== await tej(Y2)) return { ok: false, przywroc: 'ok', powod: `„Przywróć” ${sid.slice(0, 8)}: inny widoczny wynik` };
    return { ok: true, przywroc: 'ok' };
  } finally { await zamknij(X2, Y2); }
}
// 'dowód' w tabeli DOZWOLONE (profil podstawowy: D7, R5): różnice wpisu Kosza z tą wartością dostają dowód na klonach
// pary (X, Y) — dozwolona 'tak' z dowodem, false bez niego (r.dowod — wynik). Pomiar izolowany (kr_cicho).
async function potwierdz(S, X, Y, d) {
  const doDowodu = d.filter((r) => r.dozwolona === 'dowód');
  if (!doDowodu.length) return d;
  await kr_cicho(S, async () => {
    for (const r of doDowodu) {
      r.dowod = r.rodzaj === 'kosz' ? await dowodWpisu(S, X, Y, r.klucz) : { ok: false, przywroc: null, powod: 'dowód tylko dla wpisu Kosza' };
      r.dozwolona = r.dowod.ok ? 'tak' : false;
      (S.stat.dowody = S.stat.dowody || []).push({ krok: S.nrKroku || 0, klasa: r.klasa, klucz: String(r.klucz).slice(0, 13), ...r.dowod });
    }
  });
  return d;
}
// ── Tryb ścisły (E2_AB_SCISLE=1; ręczny, domyślnie wyłączony; TRYB ŚCISŁY w nagłówku) ───────────────────────────────
// W1 = ∅ z jedynym wyjątkiem klas niewidocznych z decyzji właściciela 2a z 2026-11-15 (R2, R4n, D7; reguła PD-17: nie
// kolejkować ponownie z powodu samego rev ani opisu, ALGORITHMS ok. 29725–29726, plan:262) i tylko z dowodem: widok
// kliniczny i okno Kosza równe na obu urządzeniach, a każdy różniący się wpis Kosza przechodzi dowodWpisu. Wynik: lista
// przyczyn { przyczyna, klasa, klucz } (pusta — zieleń); dowody 'poza oknem' — osobno w S.stat.dowody.
const NIEWIDOCZNE = Object.freeze(['R2', 'R4n', 'D7']);
async function dowodNiewidoczny(S, A, B, roznice) {
  const w = await wyrWidoki(S, { A, B });
  if (WYR.widokNapis(w.A) !== WYR.widokNapis(w.B)) return { ok: false, powod: 'widok albo Kosz różny' };
  return kr_cicho(S, async () => {
    for (const r of roznice.filter((q) => q.rodzaj === 'kosz')) {
      const dowod = await dowodWpisu(S, A, B, r.klucz);
      (S.stat.dowody = S.stat.dowody || []).push({ krok: S.nrKroku || 0, scisle: true, klasa: r.klasa, klucz: String(r.klucz).slice(0, 13), ...dowod });
      if (!dowod.ok) return { ok: false, powod: dowod.powod };
    }
    return { ok: true };
  });
}
async function scisleW1(S, A, B, d) {
  const out = d.filter((r) => !NIEWIDOCZNE.includes(r.klasa)).map((r) => ({ przyczyna: 'W1', klasa: r.klasa, klucz: `${r.rodzaj} ${String(r.klucz).slice(0, 13)}` }));
  const niewidoczne = d.filter((r) => NIEWIDOCZNE.includes(r.klasa));
  if (niewidoczne.length) {
    const dowod = await dowodNiewidoczny(S, A, B, niewidoczne);
    if (!dowod.ok) for (const r of niewidoczne) out.push({ przyczyna: `W1 bez dowodu (${dowod.powod})`, klasa: r.klasa, klucz: `${r.rodzaj} ${String(r.klucz).slice(0, 13)}` });
  }
  return out;
}

// ── W4: zdarzenia, a po nich pełna wymiana blobem (gwarancja etapu 2, decyzja 7; specyfikacja 2a, 3.2) ─────────────
// Dwie pary świeżych klonów z migawek tego samego punktu. PO-A: B₁ scala eksport A₁, potem A₁ scala eksport B₁ (już po
// scaleniu) — jak przyjęty PUT z ETagiem (przy 412 albo braku ETagu najpierw pobranie i scalenie, potem eksport stanu po
// scaleniu: vilda_sync.js 49:12490, 49:10211); PO-B symetrycznie. Warunki: (a) D obu par puste albo tylko klasy
// dozwolone w W4 danego kontekstu; (b) punkt stały — druga runda (ta sama kolejność) na TYCH SAMYCH klonach nie zmienia
// eksportu żadnego z nich; (c) każda encja R4n z (a) przechodzi W4p. Wynik: { ok, warianty: [...], r4n, w4p }.
// Opcje dla testów negatywnych samego W4 (klasy 3.6, negatywy): runda (domyślnie rundaPO) i dowodR4n (domyślnie w4p).
// E3-PR0b: opcja runda dostaje też numer obiegu wymiany (1, 2) — licznik odsyłania liczy pół wymiany w pierwszym obiegu
// (wymianaPOLicz); para z urządzeniem starszej aplikacji dostaje tabelę 'flota' (kontPary).
async function rundaPO(X, Y) {
  await Y.v.mergeSyncPayload(json(await X.v.exportSyncPayload()));
  await X.v.mergeSyncPayload(json(await Y.v.exportSyncPayload()));
  ustawStan(X, await eksport(X)); ustawStan(Y, await eksport(Y));
}
async function w4(S, A, B, kont, { warianty = ['PO-A', 'PO-B'], opisz = null, runda = rundaPO, dowodR4n = w4p } = {}) {
  return kr_cicho(S, async () => {
    const wynik = { ok: true, warianty: [], r4n: 0, w4p: [] };
    for (const wariant of warianty) {
      const A1 = await klon(S, A, 'w4a'), B1 = await klon(S, B, 'w4b');
      try {
        const [X, Y] = wariant === 'PO-A' ? [A1, B1] : [B1, A1];
        await runda(X, Y, 1);
        const [a, b] = [kanon(A1.stan), kanon(B1.stan)];
        await runda(X, Y, 2);
        const punktStaly = JSON.stringify(kanon(A1.stan)) === JSON.stringify(a) && JSON.stringify(kanon(B1.stan)) === JSON.stringify(b);
        const d = await sklasyfikuj(D(a, b), a, b, kontPary(A, B, kont), async () => ({ x: await A1.v.listTrashedSnapshots(), y: await B1.v.listTrashedSnapshots() }));
        const w = { wariant, punktStaly, roznice: d.map(skrotRoznicy), w4p: [] };
        for (const r of d.filter((q) => q.klasa === 'R4n')) {
          const [sid, pid] = r.klucz.split('|');
          const p = await dowodR4n(S, A1, B1, sid, pid);
          w.w4p.push(p);
          wynik.w4p.push({ wariant, klucz: r.klucz, ...p });
          wynik.r4n += 1;
        }
        w.ok = punktStaly && d.every((r) => r.dozwolona && r.dozwolona !== 'dowód') && w.w4p.every((p) => p.ok);
        if (opisz) w.opis = await opisz(A1, B1);
        if (!w.ok) wynik.ok = false;
        wynik.warianty.push(w);
      } finally { await zamknij(A1, B1); }
    }
    return wynik;
  });
}
// W4p (dowód normalizacji R4n): na świeżych klonach obu stron widok Kosza (listTrashedSnapshots, także pinned) równy;
// „Przywróć” tej wersji na obu przy stałym Math.random i tym samym Date; eksporty kanoniczne obu klonów równe ŚCIŚLE,
// a Kosz żadnego nie zawiera już tej wersji. (Scalanie świadomie nie uzgadnia postaci gwiazdki w treści wpisu kosza:
// vilda_vault.js:2093, Bpk_nowszaTrescKosza 1029–1034.)
async function w4p(S, X1, Y1, sid, pid) {
  const X2 = await klon(S, X1, 'w4p'), Y2 = await klon(S, Y1, 'w4p');
  try {
    const [lx, ly] = [await X2.v.listTrashedSnapshots(), await Y2.v.listTrashedSnapshots()];
    const widokRowny = JSON.stringify(widokKosza(lx)) === JSON.stringify(widokKosza(ly));
    await stalyLos(async () => { await X2.v.restoreTrashedSnapshot(pid, sid); await Y2.v.restoreTrashedSnapshot(pid, sid); });
    const [kx, ky] = [kanon(await eksport(X2)), kanon(await eksport(Y2))];
    const zniknal = ![...(await X2.v.listTrashedSnapshots()), ...(await Y2.v.listTrashedSnapshots())].some((e) => e.snapshotId === sid);
    const rowne = JSON.stringify(kx) === JSON.stringify(ky);
    return { ok: widokRowny && rowne && zniknal, widokRowny, rowne, zniknal, roznice: rowne ? [] : D(kx, ky).map(skrotRoznicy) };
  } finally { await zamknij(X2, Y2); }
}

// ── Bliźniaki z bazą (blok deterministyczny) ─────────────────────────────────────────────────────────────────────────
// Baza na A: karty P (3 wersje) i R (2 wersje), notatka pacjenta, notatka biblioteki, lista, preferencja, klucz dostępu
// i jego nagrobek; B — bliźniak A po bazie (ta sama wiedza). Chwile co 1 s.
async function zmienMeta(U, zmiana) {
  const uid = U.d.konto.userId;
  const m = await U.d.adapter.getUserMeta(uid);
  await U.d.adapter.putUserMeta(uid, zmiana(m));
}
const iso = () => new Date(teraz).toISOString();
async function baza(S) {
  const A = await urzadzenie(S, 'A');
  const v = A.v;
  krok(); const P = (await A.d.zapiszKarte(1)).patientId;
  krok(); await A.d.zapiszKarte(1, { wzrost: 121, zapis: { patientId: P, forceNewSnapshot: true } });
  krok(); await A.d.zapiszKarte(1, { wzrost: 122, zapis: { patientId: P, forceNewSnapshot: true } });
  krok(); const R = (await A.d.zapiszKarte(2)).patientId;
  krok(); await A.d.zapiszKarte(2, { wzrost: 111, zapis: { patientId: R, forceNewSnapshot: true } });
  krok(); const nP = (await v.savePatientNote({ patientId: P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść', category: 'inne' })).id;
  krok(); const L = (await v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść' })).id;
  krok(); const X = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [P] })).id;
  krok();
  await zmienMeta(A, (m) => ({
    ...m,
    userPreferences: { ...(m.userPreferences || {}), fikcyjnaPreferencja: { value: 'Fikcyjna', updatedAtISO: iso() } },
    passkeys: [...(m.passkeys || []), { credentialId: 'fikcyjny-klucz-1', deviceLabel: 'Fikcyjne urządzenie', createdAtISO: iso(), roaming: false }],
  }));
  krok();
  ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { A, B, P, R, nP, L, X };
}

// Stan Y po zastosowaniu partii zdarzeń (kolejno) na świeżym klonie Y i stan po scaleniu bloba X na drugim klonie.
async function stanZdarzen(S, Y, partie) {
  const K = await klon(S, Y, 'z');
  try { for (const p of partie) await zastosuj(K, p); return kanon(await eksport(K)); } finally { await zamknij(K); }
}
async function stanBlobu(S, Y, X) {
  const K = await klon(S, Y, 'b');
  try { await K.v.mergeSyncPayload(json(await X.v.exportSyncPayload())); return kanon(await eksport(K)); } finally { await zamknij(K); }
}
// W2 dla oczekujących zdarzeń X→Y (świeże klony jednej migawki Y): null albo różniące się ścieżki.
async function w2(S, X, Y) {
  const zd = await stanZdarzen(S, Y, [X.Q.slice(kursor(S, X, Y))]);
  const bl = await stanBlobu(S, Y, X);
  return JSON.stringify(zd) === JSON.stringify(bl) ? null : sciezki(bl, zd);
}
const karty = (U) => (U.stan.patients || []).map((p) => p.patientId).sort();
const wersjeKarty = (U, pid) => ((U.stan.patients || []).find((p) => p.patientId === pid) || { snapshots: [] }).snapshots.map((s) => s.snapshotId).sort();
const nagrobki = (U) => (U.stan.tombstones || []).map((t) => t.patientId).sort();
const raport = (S, opis) => `${opis}\n  ziarno ${S.ziarno}${S.nrKroku ? `, krok ${S.nrKroku}` : ''}\n  ostatnie operacje:\n    ${S.dziennik.slice(-10).join('\n    ')}`;
// Spoczynek + W1 + W2r (obie strony) jako asercje bloku deterministycznego.
async function spoczynekZgodny(S, A, B, { odB = false } = {}) {
  const r = odB ? await spoczynek(S, B, A) : await spoczynek(S, A, B);
  expect(r, raport(S, 'punkt spoczynku w ≤ 4 rundach')).not.toBe(null);
  expect(await w1(A, B), raport(S, 'W1')).toBe(null);
  expect(await w2r(S, A, B), raport(S, 'W2r (A)')).toBe(null);
  expect(await w2r(S, B, A), raport(S, 'W2r (B)')).toBe(null);
  expect(S.stat.w3Bledy, 'W3: applyEncryptedDelta ≡ applyEncryptedEvent').toEqual([]);
  await w4Zgodne(S, A, B);
  return r;
}
// W4 na końcu scenariusza bloku deterministycznego (p. 1–4): obie pary, klasy dozwolone w W4 (tylko R4n z W4p).
async function w4Zgodne(S, A, B) {
  const w = await w4(S, A, B, { tabela: 'W4' });
  expect(w.ok, raport(S, 'W4 (zdarzenia, potem pełna wymiana blobem)') + '\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
  return w;
}

// ── Opisy do literałów (etykiety encji zamiast identyfikatorów) ─────────────────────────────────────────────────────
const etykieta = (n, id) => (n && n.get(id)) || (id ? '#' + String(id).slice(0, 4) : String(id));
const kluczEtykiet = (n, k) => String(k).split(/([/|])/).map((c) => (c === '/' || c === '|' ? c : etykieta(n, c))).join('');
// Lista różnic D (posortowana): „rodzaj klucz: ścieżki [klasa]” albo „rodzaj klucz: tylko <strona>”.
const opisD = (d, n, nx, ny) => d.map((r) => `${r.rodzaj} ${kluczEtykiet(n, r.klucz)}: ${r.tylko ? 'tylko ' + (r.tylko === 'x' ? nx : ny) : r.sciezki.join(', ')}${r.klasa ? ` [${r.klasa}]` : ''}`).sort();
function etykietyP1e(u) {
  const n = new Map([[u.X, 'X'], [u.Y, 'Y'], [u.Z, 'Z'], [u.x1, 'x1'], [u.x, 'x'], [u.x3, 'x3']]);
  for (const p of u.A.stan.patients || []) for (const q of p.snapshots || []) if (!n.has(q.snapshotId)) n.set(q.snapshotId, p.patientId === u.Y ? 'y' : 'z');
  return n;
}
// Stan kliniczny urządzenia (literały p. 6): karty z wizytami (masa, gwiazdka), Kosz tak, jak go zwraca
// listTrashedSnapshots() (gwiazdka: pinned; wpisy kart usuniętych okno Kosza ukrywa — vilda_kosz_zapisow.js:226),
// notatki pacjentów (treść).
async function kliniczny(U, n) {
  const st = await eksport(U);
  const kg = (p) => (p && p.user ? p.user.weight : '?');
  const karty = (st.patients || []).map((p) => `${etykieta(n, p.patientId)}[${(p.snapshots || []).slice().sort((x, y) => ((x.savedAtISO || '') < (y.savedAtISO || '') ? -1 : 1)).map((q) => `${etykieta(n, q.snapshotId)}:${kg(q.payload)}${q.payload && q.payload._pinned ? '*' : ''}`).join(' ')}]`).sort();
  const kosz = (await U.v.listTrashedSnapshots()).map((e) => `${etykieta(n, e.snapshotId)}@${etykieta(n, e.patientId)}:${kg(e.payload)}${e.pinned ? '*' : ''}${e.patientExists ? '' : ' (ukryty)'}`).sort();
  const notatki = (st.patientNotes || []).map((x) => `${etykieta(n, x.id)}: ${x.body}`).sort();
  return `karty ${karty.join(' ') || '-'} | Kosz ${kosz.join(' ') || '-'} | notatki ${notatki.join(' ') || '-'}`;
}
// Świat samych blobów: rundy PO-A (Y scala eksport X, X scala eksport Y), aż runda nic nie zmienia (≤ 4 rundy ze zmianą).
async function spoczynekBlobow(...urz) {
  for (let r = 1; r <= 5; r += 1) {
    const przed = await Promise.all(urz.map(async (U) => JSON.stringify(kanon(await eksport(U)))));
    for (let i = 0; i < urz.length; i += 1) await rundaPO(urz[i], urz[(i + 1) % urz.length]);
    const po = urz.map((U) => JSON.stringify(kanon(U.stan)));
    if (po.every((x, i) => x === przed[i])) return r;
  }
  return null;
}
// W4 dla trzech urządzeń (p. 6): świeże klony; rundy PO-A kolejno na parach (A, B), (B, C), (C, A), aż żaden eksport
// się nie zmienia (≤ 3 rundy ze zmianą); warunek: D każdej pary puste albo z klasami dozwolonymi w p. 6 (R4n z W4p);
// para z urządzeniem starszej aplikacji — w tabeli 'flota' (kontPary, E3-PR0b).
async function w4Trzy(S, urz, n, { dowodR4n = w4p } = {}) {
  return kr_cicho(S, async () => {
    const K = [];
    for (const U of urz) K.push(await klon(S, U, 'w4t'));
    try {
      let rund = 0, stabilny = false;
      while (!stabilny && rund < 4) {
        rund += 1;
        const przed = K.map((k) => JSON.stringify(kanon(k.stan)));
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) await rundaPO(K[i], K[j]);
        stabilny = K.every((k, i) => JSON.stringify(kanon(k.stan)) === przed[i]);
      }
      const pary = [];
      let ok = stabilny && rund <= 4;
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const [a, b] = [kanon(K[i].stan), kanon(K[j].stan)];
        const d = await sklasyfikuj(D(a, b), a, b, kontPary(urz[i], urz[j], { tabela: 'p6' }), async () => ({ x: await K[i].v.listTrashedSnapshots(), y: await K[j].v.listTrashedSnapshots() }));
        const w4pp = [];
        for (const r of d.filter((q) => q.klasa === 'R4n')) { const [sid, pid] = r.klucz.split('|'); w4pp.push(await dowodR4n(S, K[i], K[j], sid, pid)); }
        if (!d.every((r) => r.dozwolona) || !w4pp.every((x) => x.ok)) ok = false;
        pary.push({ para: `${urz[i].nazwa}${urz[j].nazwa}`, roznice: opisD(d, n, urz[i].nazwa, urz[j].nazwa), w4p: w4pp });
      }
      const opis = {};
      for (let i = 0; i < K.length; i += 1) opis[urz[i].nazwa] = await kliniczny(K[i], n);
      // widoki klonów po pełnej wymianie dla wyroczni (poza literałem; wołający je usuwa)
      const wyr = await wyrWidokiKlonow(Object.fromEntries(urz.map((U, i) => [U.nazwa, K[i]])));
      return { ok, rund, stabilny, pary, opis, wyr };
    } finally { await zamknij(...K); }
  });
}

// ── Blok deterministyczny, p. 1: każdy z 14 builderów — para „mutacja na A → zdarzenie → B” ≡ blob ─────────────────────
// Mutacja jednej encji na A (koperty prawdziwych emiterów, porównane z modelem — EMISJA; pfull — porcje pełnej karty
// nowej karty, jak z haka H1), koperty
// z kolejki Q_A (szyfrogram z chwili emisji) stosowane przez applyEncryptedEvent na świeżym klonie B; wzorzec: klon B po
// mergeSyncPayload(exportSyncPayload(A)). Także zdarzenie dwukrotnie i w obu kolejnościach z sąsiednim (następny rodzaj).
const nowe = async (U, fn) => { const od = U.Q.length; await fn(); return U.Q.slice(od); };
const MUT = {
  snap: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa wersja P', () => b.A.d.zapiszKarte(1, { wzrost: 130, zapis: { patientId: b.P, forceNewSnapshot: true } }))),
  pfull: (S, b) => nowe(b.A, async () => {
    const N = (await b.A.d.zapiszKarte(5)).patientId;
    krok(); await b.A.d.zapiszKarte(5, { wzrost: 131, zapis: { patientId: N, forceNewSnapshot: true } });
    krok(); await b.A.d.zapiszKarte(5, { wzrost: 132, zapis: { patientId: N, forceNewSnapshot: true } });
    ustawStan(b.A, await eksport(b.A));
    for (const k of await b.A.ev.buildPatientFullEvents(N, null, { setId: 'fikcyjny-zestaw' })) await doKolejki(S, b.A, k);
  }),
  ptomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń pacjenta R', () => b.A.v.removePatient(b.R))),
  stomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'kosz najstarszej wersji P', () => b.A.v.moveSnapshotToTrash(b.P, wersjeP(b)[0], { odepnij: true }))),
  pnote: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa notatka P', () => b.A.v.savePatientNote({ patientId: b.P, title: 'Fikcyjna notatka 2', body: 'Fikcyjna', category: 'inne' }))),
  pnotetomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń notatkę P', () => b.A.v.removePatientNote(b.nP))),
  note: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa notatka biblioteki', () => b.A.v.saveNote({ title: 'Fikcyjny szablon 2', body: 'Fikcyjna' }))),
  notetomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń notatkę biblioteki', () => b.A.v.removeNote(b.L))),
  plist: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'nowa lista', () => b.A.v.savePatientList({ name: 'Fikcyjna lista 2', memberIds: [b.R] }))),
  plisttomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń listę', () => b.A.v.deletePatientList(b.X))),
  // Preferencja i usunięcie klucza dostępu przez API sejfu (zdarzenie z emitera); rejestracja klucza dostępu — zapis testu
  // (zmienMeta), źródło zdarzenia: model (MUTACJE_Z_MODELU).
  pref: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'preferencja', () => b.A.v.setWaitlistSchedule('Fikcyjna procedura', { dateISO: '2026-03-15' }))),
  pk: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'klucz dostępu', () => zmienMeta(b.A, (m) => ({ ...m, passkeys: [...m.passkeys, { credentialId: 'fikcyjny-klucz-2', deviceLabel: 'Fikcyjne urządzenie 2', createdAtISO: iso(), roaming: true }] })), { zrodlo: 'model' })),
  pktomb: (S, b) => nowe(b.A, () => mutacja(S, b.A, 'usuń klucz dostępu', () => b.A.v.removePasskey(b.A.d.konto.userId, 'fikcyjny-klucz-1'))),
  cred: (S, b) => nowe(b.A, () => zmianaHasla(S, b.A)),
};
const wersjeP = (b) => [...(b.A.stan.patients.find((p) => p.patientId === b.P).snapshots)].sort((x, y) => (x.savedAtISO < y.savedAtISO ? -1 : 1)).map((s) => s.snapshotId);
async function zmianaHasla(S, U) {
  S.nrHasla += 1;
  const nowe = `Fikcyjne#Haslo!${2026 + S.nrHasla}xy`;
  const stare = haslo(S, U);
  U.noweHaslo = nowe;
  await mutacja(S, U, 'zmiana hasła', () => U.v.changePassword(stare, nowe));
  U.d.konto.haslo = nowe;
}

describe('A ≡ B, blok deterministyczny p. 1: każdy z 14 builderów (mutacja → zdarzenie → B) ≡ blob', () => {
  d1();
  for (const [i, r] of RODZAJE.entries()) {
    const s = RODZAJE[(i + 1) % RODZAJE.length];
    it(`${r}: koperty [${r}] ≡ blob, dwukrotnie ≡ blob, z sąsiednim ${s} w obu kolejnościach ≡ blob`, async () => {
      const S = swiat(100 + i);
      const b = await baza(S);
      const przed = kanon(b.B.stan);
      krok(); const e1 = await MUT[r](S, b);
      expect(e1.map((e) => e.kind), 'koperty mutacji').toEqual(r === 'pfull' ? ['pfull'] : [r]);
      const blob1 = await stanBlobu(S, b.B, b.A);
      expect(blob1, 'mutacja zmienia stan odbiorcy').not.toEqual(przed);
      expect(await stanZdarzen(S, b.B, [e1]), 'zdarzenie ≡ blob').toEqual(blob1);
      expect(await stanZdarzen(S, b.B, [e1, e1]), 'zdarzenie dwukrotnie ≡ blob').toEqual(blob1);
      krok(); const e2 = await MUT[s](S, b);
      expect(e2.map((e) => e.kind), 'koperty sąsiada').toEqual(s === 'pfull' ? ['pfull'] : [s]);
      const blob2 = await stanBlobu(S, b.B, b.A);
      expect(await stanZdarzen(S, b.B, [e1, e2]), `${r}, potem ${s} ≡ blob`).toEqual(blob2);
      expect(await stanZdarzen(S, b.B, [e2, e1]), `${s}, potem ${r} ≡ blob`).toEqual(blob2);
      // W4: odbiorca po zdarzeniach (klon B z kopertami e1, e2), potem pełna wymiana blobem z A.
      const Bz = await klon(S, b.B, 'zd');
      try { await zastosuj(Bz, [...e1, ...e2]); ustawStan(Bz, await eksport(Bz)); await w4Zgodne(S, b.A, Bz); } finally { await zamknij(Bz); }
    }, 60_000);
  }
});

// ── Emitery i model: samokontrole (AB1, AB4–AB8; AB2 i AB7 — także podsumowania ziaren, AB3 — p. 4) ─────────────────────
describe('A ≡ B, emitery i model: porównanie w mutacji, kopia z rejestrem łańcucha, MUTACJE_Z_MODELU, haki scalania', () => {
  d1();
  it('AB1: niezgodność emiterów z modelem w mutacji — wyjątek z opisem (mutacja, ciąg modelu, ciąg emiterów, wpisy rejestru); zgodna mutacja liczona', async () => {
    const S = swiat(901);
    const b = await baza(S);
    const notatka = (tytul) => () => b.A.v.savePatientNote({ patientId: b.P, title: tytul, body: 'Fikcyjna treść', category: 'inne' });
    krok(); await mutacja(S, b.A, 'nowa notatka P', notatka('Fikcyjna notatka 3'));
    expect(S.stat.emitery, 'zgodna mutacja').toEqual({ porownan: 1, zgodnych: 1, wRandze: 0 });
    // emiter milczy (bramka zamknięta na czas operacji): model [pnote], emitery — nic
    krok();
    const cicho = mutacja(S, b.A, 'notatka przy zamkniętej bramce', async () => {
      b.A.d.win.VILDA_EVENT_LOG = false;
      try { return await notatka('Fikcyjna notatka 4')(); } finally { b.A.d.win.VILDA_EVENT_LOG = true; }
    });
    await expect(cicho).rejects.toThrow(/^AB1: emitery ≠ model — A: notatka przy zamkniętej bramce \(ziarno 901, krok 0\)\n {2}model: pnote \S+\n {2}emitery: \(pusty\)\n {2}rejestr: \(pusty\)$/);
    ustawStan(b.A, await eksport(b.A)); // wyjątek porównania przerywa mutację przed zapisem stanu
    // dodatkowa encja u emitera (wpis rejestru dopisany w trakcie operacji): emitery [pnote, note], model [pnote]
    krok();
    const nadmiar = mutacja(S, b.A, 'notatka z dodatkowym wpisem rejestru', async () => {
      const w = await notatka('Fikcyjna notatka 5')();
      b.A.lancuch.push({ kind: 'note', klucze: b.L, s: null, uid: b.A.d.konto.userId });
      return w;
    });
    await expect(nadmiar).rejects.toThrow(new RegExp(`model: pnote \\S+\\n {2}emitery: pnote \\S+, note ${b.L}\\n {2}rejestr: pnote \\S+, note ${b.L}$`));
    expect(EMITERY_NIEZGODNE.splice(0).length, 'niezgodności zapisane dla afterEach (AB1)').toBe(2);
    expect(S.stat.emitery, 'liczniki: niezgodne nie są zgodne ani „w randze”').toEqual({ porownan: 3, zgodnych: 1, wRandze: 0 });
  }, 60_000);
  it('AB4: porównanie na ciągach syntetycznych — ta sama kolejność i kolejność w randze zgodne, brak encji, dodatkowa encja i kolejność rang niezgodne; rangi = kolejność modelu = Bem_RANGI sejfu (E2-PR3b: pfull z rangą wersji)', () => {
    const c = (...l) => l.map((x) => { const [kind, key] = x.split(' '); return { kind, key }; });
    expect(zgodne(c('snap P/a', 'snap Q/b', 'stomb a', 'pnote n'), c('snap P/a', 'snap Q/b', 'stomb a', 'pnote n')), 'ta sama kolejność').toBe('rowne');
    expect(zgodne([], []), 'oba puste').toBe('rowne');
    expect(zgodne(c('snap P/a', 'snap Q/b', 'stomb a'), c('snap Q/b', 'snap P/a', 'stomb a')), 'kolejność w randze').toBe('wRandze');
    expect(zgodne(c('snap P/a', 'snap Q/b'), c('snap P/a')), 'brak encji').toBe(null);
    expect(zgodne(c('pnote n'), []), 'brak jedynej encji').toBe(null);
    expect(zgodne(c('snap P/a'), c('snap P/a', 'snap Q/b')), 'dodatkowa encja tej samej rangi').toBe(null);
    expect(zgodne(c('snap P/a'), c('snap P/a', 'pref k')), 'dodatkowa encja innej rangi').toBe(null);
    expect(zgodne(c('snap P/a', 'snap Q/b'), c('snap P/a', 'snap Q/c')), 'inna encja tej samej rangi').toBe(null);
    expect(zgodne(c('snap P/a', 'snap P/a'), c('snap P/a', 'snap Q/b')), 'powtórzenie zamiast encji').toBe(null);
    expect(zgodne(c('snap P/a', 'pnote n'), c('pnote n', 'snap P/a')), 'kolejność rang').toBe(null);
    expect(zgodne(c('ptomb P', 'stomb a'), c('stomb a', 'ptomb P')), 'kolejność rang (stomb przed ptomb)').toBe(null);
    expect(zgodne(c('snap P/a', 'pfull Q'), c('pfull Q', 'snap P/a')), 'pfull w randze wersji (E2-PR3b)').toBe('wRandze');
    expect(zgodne(c('pfull Q', 'pnote n'), c('pnote n', 'pfull Q')), 'kolejność rang (pfull przed pnote)').toBe(null);
    expect(() => zgodne(c('phdr P'), c('phdr P')), 'rodzaj spoza rang').toThrow(/spoza rang/);
    // liczniki porównania: zgodnych, wRandze; niezgodne — wyjątek z opisem
    const S = { stat: {} };
    const k = (...l) => c(...l).map((event) => ({ event }));
    expect(porownaj(S, { nazwa: 'X' }, 'syntetyczna 1', k('snap P/a'), k('snap P/a'), [])).toBe('rowne');
    expect(porownaj(S, { nazwa: 'X' }, 'syntetyczna 2', k('snap P/a', 'snap Q/b'), k('snap Q/b', 'snap P/a'), [])).toBe('wRandze');
    expect(() => porownaj(S, { nazwa: 'X' }, 'syntetyczna 3', k('pnote n'), k(), [])).toThrow(/^AB1: emitery ≠ model — X: syntetyczna 3\n {2}model: pnote n\n {2}emitery: \(pusty\)/);
    expect(EMITERY_NIEZGODNE.splice(0).length).toBe(1);
    expect(S.stat.emitery, '+zgodnych, +wRandze').toEqual({ porownan: 3, zgodnych: 1, wRandze: 1 });
    // rangi testu = kolejność modelu (emituj) = Bem_RANGI sejfu
    expect(Object.keys(RANGI), 'rangi = kolejność modelu (pfull z haka H1 z rangą wersji)').toEqual(['snap', 'pfull', 'stomb', ...PO_STOMB]);
    expect(RANGI.pfull, 'pfull: ranga wersji').toBe(RANGI.snap);
    const m = ZRODLO_SEJFU.match(/const Bem_RANGI = Object\.freeze\((\{[^}]*\})\);/);
    expect(m, 'Bem_RANGI w sejfie').not.toBe(null);
    expect(new Function(`return ${m[1]};`)(), 'rangi = Bem_RANGI sejfu').toEqual({ ...RANGI });
  });
  it('AB5: kopia z rejestrem łańcucha — obie kotwice dokładnie raz, wynik parsuje się, sejf sprzed E2-PR3a2 → wyjątek; zapis karty przy otwartej bramce → jeden wpis rejestru snap tej wersji, przy zamkniętej — żaden; 0 baz vilda_sync_*', async () => {
    const ile = (t, f) => t.split(f).length - 1;
    const [tryb, lancuch] = ['if (!T() || !Bob_trybPrywatny() || !Bob_idb()) return;', 'function Bem_doLancucha(z) {'];
    expect([ile(ZRODLO_SEJFU, tryb), ile(ZRODLO_SEJFU, lancuch)], 'kotwice w sejfie: dokładnie raz').toEqual([1, 1]);
    expect([ile(ZRODLO_EMITEROW, tryb), ile(ZRODLO_EMITEROW, 'if (!T()) return;'), ile(ZRODLO_EMITEROW, `${lancuch} __testEmisji.lancuch(z); return;`)],
      'kopia: warunek trybu zdjęty, rejestr na początku Bem_doLancucha').toEqual([0, 1, 1]);
    expect(ZRODLO_EMITEROW.replace('if (!T()) return;', tryb).replace(' __testEmisji.lancuch(z); return;', '') === ZRODLO_SEJFU, 'kopia = sejf poza dwoma miejscami').toBe(true);
    expect(() => parse(ZRODLO_EMITEROW, { ecmaVersion: 'latest', sourceType: 'script' }), 'kopia parsuje się').not.toThrow();
    const sprzed = readFileSync(path.join(repoRoot, 'tests/fixtures/vilda_vault-221.js.txt'), 'utf8');
    expect(() => zRejestremLancucha(sprzed), 'sejf bez części emisji').toThrow(/kopia z rejestrem łańcucha/);
    expect(() => zRejestremLancucha(ZRODLO_SEJFU.replace(tryb, `${tryb} ${tryb}`)), 'kotwica dwa razy').toThrow(/kotwica nie dokładnie raz/);
    // urządzenie z kopią (adapter w pamięci, atrapa IndexedDB w oknie)
    const S = swiat(905);
    const idb = utworzIndexedDB();
    const A = await urzadzenie(S, 'A', null, { dodatki: { indexedDB: idb } });
    expect(A.d.win.VILDA_EVENT_LOG, 'bramka otwarta polem okna').toBe(true);
    A.lancuch.length = 0;
    krok(); const r = await A.d.zapiszKarte(1, { masa: 20 });
    expect(A.lancuch.map((z) => [z.kind, z.klucze, z.uid]), 'rejestr po zapisie karty').toEqual([['snap', { patientId: r.patientId, snapshotId: r.snapshotId }, A.d.konto.userId]]);
    A.lancuch.length = 0;
    A.d.win.VILDA_EVENT_LOG = false;
    try { krok(); await A.d.zapiszKarte(1, { masa: 21, zapis: { patientId: r.patientId, forceNewSnapshot: true } }); } finally { A.d.win.VILDA_EVENT_LOG = true; }
    expect(A.lancuch, 'zamknięta bramka: emisja kończy się na bramce').toEqual([]);
    expect({ bazy: Object.keys(idb.__atrapa.bazy()).filter((n) => /^vilda_sync_/.test(n)), polaczenia: idb.__atrapa.polaczenia(/^vilda_sync_/) }, 'bazy kolejki').toEqual({ bazy: [], polaczenia: 0 });
  }, 60_000);
  it('AB6: MUTACJE_Z_MODELU — jedyna mutacja ze źródłem „model” to p. 1 „klucz dostępu”; źródło „model” spoza literału albo inne źródło — błąd testu przed operacją', async () => {
    expect(MUTACJE_Z_MODELU, 'literał').toEqual(['klucz dostępu']);
    expect(Object.isFrozen(MUTACJE_Z_MODELU)).toBe(true);
    const S = swiat(906);
    const A = await urzadzenie(S, 'A');
    let wywolan = 0;
    const fn = async () => { wywolan += 1; };
    await expect(mutacja(S, A, 'nowa notatka P', fn, { zrodlo: 'model' }), 'źródło „model” spoza literału').rejects.toThrow(/spoza MUTACJE_Z_MODELU/);
    await expect(mutacja(S, A, 'klucz dostępu', fn, { zrodlo: 'blob' }), 'inne źródło').rejects.toThrow(/spoza MUTACJE_Z_MODELU/);
    expect(wywolan, 'operacja nie ruszyła').toBe(0);
    // źródło „model” z literału: do Q_A koperty modelu, bez porównania
    const przed = { ...S.stat.emitery };
    krok();
    const { koperty } = await mutacja(S, A, 'klucz dostępu', () => zmienMeta(A, (m) => ({ ...m, passkeys: [...(m.passkeys || []), { credentialId: 'fikcyjny-klucz-9', deviceLabel: 'Fikcyjne urządzenie 9', createdAtISO: iso(), roaming: true }] })), { zrodlo: 'model' });
    expect({ koperty: koperty.map(opisKoperty), Q: A.Q.map((e) => e.kind), emitery: S.stat.emitery }, 'źródło „model”').toEqual({ koperty: [{ kind: 'pk', key: 'fikcyjny-klucz-9' }], Q: ['pk'], emitery: przed });
  }, 60_000);
  // Świat haków scalania (AB7, AB8; stan jak p. 7b bez łączenia wpisów): A poprawia notatkę n karty P, B „Usuń pacjenta”
  // P (ptomb, pnotetomb n), A bez wiedzy poprawia wizytę P. W partii B→A nagrobek karty przegrywa z kartą A (hak H1),
  // a notatka n wraca ratunkiem D-21 z nową chwilą (hak H2).
  async function swiatHakow(nr) {
    const S = swiat(nr);
    const los = rng(0x7b00 + nr);
    vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
    const u = await p6r3(S); u.S = S;
    const v = u.A.stan.patients.find((p) => p.patientId === u.P).snapshots[0].snapshotId;
    await p6notatka(u, u.A, 'Fikcyjna poprawka notatki A');
    await p6usunPacjenta(u, u.B, u.P);
    await popraw(u, u.A, v, 34.9);
    expect(u.B.Q.map((e) => e.kind), 'Q_B').toEqual(['ptomb', 'pnotetomb']);
    krok();
    return u;
  }
  it('AB7: haki scalania z emiterów = model w każdej partii — porównanie na ciągach syntetycznych (ten sam zbiór kopert, pfull z setId; pełna karta przed uratowaną notatką tej karty; brak, nadmiar, inny setId, powtórzenie i notatka przed swoją kartą — niezgodne); w dostawie: zgodne haki z kopertami emiterów w Q, powtórka partii bez haków, a przy zamkniętej bramce odbiorcy — wyjątek z opisem', async () => {
    const c = (...l) => l.map((x) => { const [kind, key, setId] = x.split(' '); return setId ? { kind, key, setId } : { kind, key }; });
    const karta = (id) => ({ n: 'P', m: 'R' }[id] || null);
    expect(zgodneHaki([], [], karta), 'oba puste').toBe('rowne');
    expect(zgodneHaki(c('pfull P P:a', 'pnote n'), c('pfull P P:a', 'pnote n'), karta), 'ten sam ciąg').toBe('rowne');
    expect(zgodneHaki(c('pfull P P:a', 'pfull R R:b'), c('pfull R R:b', 'pfull P P:a'), karta), 'kolejność w randze').toBe('wRandze');
    expect(zgodneHaki(c('pfull P P:a', 'pfull R R:b', 'pnote n'), c('pfull P P:a', 'pnote n', 'pfull R R:b'), karta), 'kolejność scaleń: notatka za swoją kartą, przed inną').toBe('innaKolejnosc');
    expect(zgodneHaki(c('pfull R R:b', 'pnote n'), c('pnote n', 'pfull R R:b'), karta), 'notatka przed pełną kartą innej karty').toBe('innaKolejnosc');
    expect(zgodneHaki(c('pfull P P:a', 'pnote n'), c('pnote n', 'pfull P P:a'), karta), 'uratowana notatka przed pełną kartą swojej karty').toBe(null);
    expect(zgodneHaki(c('pfull P P:a', 'pnote n'), c('pfull P P:a'), karta), 'brak haka H2').toBe(null);
    expect(zgodneHaki(c('pnote n'), c('pfull P P:a', 'pnote n'), karta), 'dodatkowy hak H1').toBe(null);
    expect(zgodneHaki(c('pfull P P:a'), c('pfull P P:z'), karta), 'inny setId zestawu').toBe(null);
    expect(zgodneHaki(c('pfull P P:a'), c('pfull P'), karta), 'zestaw bez setId').toBe(null);
    expect(zgodneHaki(c('pnote n'), c('pnote n', 'pnote n'), karta), 'powtórzenie').toBe(null);
    expect(zgodneHaki([], c('snap P/a'), karta), 'scalanie z inną emisją').toBe(null);
    // liczniki porównania partii; niezgodne — wyjątek z opisem (odbiorca, partia, model, emitery, rejestr)
    const S0 = { stat: {} };
    const em = (...l) => c(...l).map((e) => (e.kind === 'pfull' ? [{ event: { kind: 'pfull', key: e.key, full: { setId: e.setId, i: 0, n: 1 } } }] : { event: { kind: e.kind, key: e.key } }));
    const po0 = { patients: [{ patientId: 'P', snapshots: [] }], patientNotes: [{ id: 'n', patientId: 'P' }] };
    const partia0 = [{ kind: 'ptomb', key: 'P' }, { kind: 'pnotetomb', key: 'n' }];
    expect(porownajHaki(S0, { nazwa: 'X' }, partia0, c('pfull P P:a', 'pnote n'), em('pfull P P:a', 'pnote n'), [], po0)).toBe('rowne');
    expect(porownajHaki(S0, { nazwa: 'X' }, partia0, c('pfull P P:a', 'pfull R R:b', 'pnote n'), em('pfull P P:a', 'pnote n', 'pfull R R:b'), [], po0)).toBe('innaKolejnosc');
    expect(() => porownajHaki(S0, { nazwa: 'X' }, partia0, c('pfull P P:a', 'pnote n'), em('pnote n', 'pfull P P:a'), [], po0))
      .toThrow(/^AB7: haki z emiterów ≠ model — X po partii \[ptomb P, pnotetomb n\]\n {2}model: pfull P \(setId P:a\), pnote n\n {2}emitery: pnote n, pfull P \(setId P:a\)\n {2}rejestr: \(pusty\)$/);
    expect(HAKI_NIEZGODNE.splice(0).length, 'niezgodności zapisane dla afterEach (AB7)').toBe(1);
    expect(S0.stat.haki, 'liczniki: niezgodne nie są liczone jako zgodne').toEqual({ porownan: 3, zgodnych: 1, wRandze: 0, innaKolejnosc: 1 });
    // dostawa B→A na klonie A przy zamkniętej bramce: emitery milczą, model ma oba haki → wyjątek z opisem, bez dopisania
    const u = await swiatHakow(907);
    const S = u.S;
    const d = u.B.Q[0].atISO;
    const K = await klon(S, u.A, 'ab7');
    K.d.win.VILDA_EVENT_LOG = false;
    const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(dostawa(S, u.B, K, { w2s: false }), 'zamknięta bramka odbiorcy').rejects.toThrow(new RegExp(`^AB7: haki z emiterów ≠ model — A-ab7 po partii \\[ptomb ${esc(u.P)}, pnotetomb ${esc(u.nId)}\\] \\(ziarno 907, krok 0\\)\\n {2}model: pfull ${esc(u.P)} \\(setId ${esc(`${u.P}:${d}`)}\\), pnote ${esc(u.nId)}\\n {2}emitery: \\(pusty\\)\\n {2}rejestr: \\(pusty\\)$`));
    expect({ niezgodne: HAKI_NIEZGODNE.splice(0).length, Q: K.Q.length }, 'niezgodność zapisana, Q klonu bez haków').toEqual({ niezgodne: 1, Q: 0 });
    // dostawa B→A na A przy otwartej bramce: haki z emiterów zgodne z modelem; do Q_A koperty emiterów; powtórka partii — bez haków
    S.stat.haki = statHakow();
    const { dodane } = await dostawa(S, u.B, u.A, { w2s: false });
    expect({ dodane: dodane.map((k) => [k.event.kind, k.event.key, k.event.full ? k.event.full.setId : null]), Q: u.A.Q.slice(-2).map((e) => [e.kind, e.key]), h: [S.stat.h1, S.stat.h2] },
      'haki A po partii B→A: pfull(P) z setId karta:chwila nagrobka, pnote(n)').toEqual({
      dodane: [['pfull', u.P, `${u.P}:${d}`], ['pnote', u.nId, null]], Q: [['pfull', u.P], ['pnote', u.nId]], h: [1, 1],
    });
    const powtorka = await dostawa(S, u.B, u.A, { cofnij: 2, w2s: false });
    expect({ partia: powtorka.partia.map((e) => e.kind), dodane: powtorka.dodane, haki: S.stat.haki }, 'powtórka partii: bez haków (zestaw pfull bez powtórzeń, notatka już uratowana)')
      .toEqual({ partia: ['ptomb', 'pnotetomb'], dodane: [], haki: { porownan: 2, zgodnych: 2, wRandze: 0, innaKolejnosc: 0 } });
  }, 120_000);
  it('AB8: samokontrola rejestru odbiorcy — partia z przegranym nagrobkiem karty i ratunkiem notatki daje wpisy rejestru pfull (setId karta:chwila nagrobka) i pnote (para — chwila ratunku), przy zamkniętej bramce — żadnego; stan po partii ten sam', async () => {
    const u = await swiatHakow(908);
    const S = u.S;
    const partia = u.B.Q.slice();
    const wynik = {};
    const stany = {};
    for (const [nazwa, bramka] of [['otwarta', true], ['zamknięta', false]]) {
      const K = await klon(S, u.A, `ab8-${bramka ? 'o' : 'z'}`);
      try {
        K.d.win.VILDA_EVENT_LOG = bramka;
        K.lancuch.length = 0;
        await zastosuj(K, partia);
        const st = kanon(await eksport(K));
        const n = (st.patientNotes || []).find((x) => x.id === u.nId);
        stany[nazwa] = st;
        wynik[nazwa] = {
          wpisy: K.lancuch.map((z) => [z.kind, z.klucze, z.o || null, z.para || null, z.uid === K.d.konto.userId]),
          stan: { karta: kartaW(st, u.P), notatka: n ? n.updatedAtISO : null, nagrobekNotatki: (st.patientNoteTombstones || []).some((x) => x.id === u.nId) },
        };
      } finally { await zamknij(K); }
    }
    const d = partia[0].atISO;
    const chwila = wynik.otwarta.stan.notatka;
    expect(typeof chwila === 'string' && chwila > d, 'ratunek: chwila notatki po chwili nagrobka').toBe(true);
    expect(wynik).toEqual({
      otwarta: { wpisy: [['pfull', { patientId: u.P }, { setId: `${u.P}:${d}` }, null, true], ['pnote', u.nId, null, chwila, true]], stan: { karta: true, notatka: chwila, nagrobekNotatki: false } },
      zamknięta: { wpisy: [], stan: { karta: true, notatka: chwila, nagrobekNotatki: false } },
    });
    expect(stany.zamknięta, 'stan po partii przy zamkniętej bramce = przy otwartej').toEqual(stany.otwarta);
  }, 60_000);
  // Ratunek notatki w trakcie partii (E2-PR3c1, poprawka modelu haków): B usuwa kartę P (z notatką n), A bez wiedzy
  // poprawia wizytę P; po dostawie A→B karta P wraca na B (bez notatki), a B „Zostaw notatkę” n. W partii B→A
  // [ptomb P, pnotetomb n, pnote n] nagrobek karty przegrywa z kartą A (hak H1), nagrobek notatki ratuje notatkę A
  // (hak H2 w chwili ratunku), a późniejsza koperta pnote(n) z B nadpisuje uratowaną wersję. Po całej partii notatka ma
  // chwilę koperty pnote(n), więc ocena H2 na stanie po partii haka nie widzi; ocena zdarzenie po zdarzeniu — widzi.
  it('AB7 (ratunek notatki w trakcie partii): partia [ptomb P, pnotetomb n, pnote n] — emitery i model zdarzenie po zdarzeniu dają pfull(P) i pnote(n); ocena na stanie po całej partii dałaby samo pfull(P); spoczynek, W3, W1 (createdAtISO notatki z „Zostaw notatkę”), W4', async () => {
    const S = swiat(909);
    const los = rng(0x7b00 + 909);
    vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
    const u = await p6r3(S); u.S = S;
    const v = u.A.stan.patients.find((p) => p.patientId === u.P).snapshots[0].snapshotId;
    await p6usunPacjenta(u, u.B, u.P);
    await popraw(u, u.A, v, 34.9);
    krok(); await dostawa(S, u.A, u.B, { w2s: false });
    expect({ karta: kartaW(u.B.stan, u.P), notatka: notatkaW(u.B.stan, u.nId) }, 'B po dostawie A→B: karta P wróciła, notatki n nie ma').toEqual({ karta: true, notatka: false });
    await p6notatka(u, u.B, 'Fikcyjna notatka zostawiona na B');
    const partia = u.B.Q.slice(kursor(S, u.B, u.A));
    expect(partia.map((e) => [e.kind, e.key]), 'partia B→A').toEqual([['ptomb', u.P], ['pnotetomb', u.nId], ['pnote', u.nId]]);
    krok();
    // stany A zdarzenie po zdarzeniu na klonie (bez haków): po pnotetomb(n) — ratunek (chwila w (R, R + 1 s]), po pnote(n)
    // — chwila koperty pnote(n)
    const K = await klon(S, u.A, 'ab7r');
    const stany = [K.stan];
    try { for (const e of partia) { await zastosuj(K, [e]); stany.push(await eksport(K)); } } finally { await zamknij(K); }
    const chwila = (st) => { const n = (st.patientNotes || []).find((x) => x.id === u.nId); return n ? n.updatedAtISO : null; };
    const R = partia[1].atISO;
    const uratowana = chwila(stany[2]);
    expect({ ratunek: uratowana > R && Date.parse(uratowana) <= Date.parse(R) + 1000, poPartii: chwila(stany[3]) === partia[2].atISO },
      'notatka n na A: uratowana po pnotetomb(n), nadpisana kopertą pnote(n)').toEqual({ ratunek: true, poPartii: true });
    const opis = (l) => l.map((x) => [x.kind, x.key]);
    expect({
      poPartii: opis(hakiModelu({ setIds: new Set() }, partia, stany[0], stany[3])),
      zdarzeniePoZdarzeniu: opis(hakiModelu({ setIds: new Set() }, partia, stany[0], stany[3], stany)),
    }, 'model haków: ocena na stanie po całej partii a zdarzenie po zdarzeniu').toEqual({
      poPartii: [['pfull', u.P]], zdarzeniePoZdarzeniu: [['pfull', u.P], ['pnote', u.nId]],
    });
    // dostawa B→A z hakami: emitery = model (AB7), do Q_A pfull(P) i pnote(n)
    S.stat.haki = statHakow();
    const { dodane } = await dostawa(S, u.B, u.A, { w2s: false });
    expect({ dodane: dodane.map((k) => [k.event.kind, k.event.key]), haki: S.stat.haki }, 'haki A po partii B→A').toEqual({
      dodane: [['pfull', u.P], ['pnote', u.nId]], haki: { porownan: 1, zgodnych: 1, wRandze: 0, innaKolejnosc: 0 },
    });
    // spoczynek (z W2s i W3); W1: tylko createdAtISO notatki z „Zostaw notatkę” (klasa dzisiejsza, jak R3-E1 w p. 6,
    // także przy samych blobach); W4 z klasami p. 6
    expect(await spoczynek(S, u.A, u.B), raport(S, 'punkt spoczynku (pełne dostawy w obie strony, najwyżej 4 razy)')).not.toBe(null);
    expect(S.stat.w3Bledy, 'W3: applyEncryptedDelta ≡ applyEncryptedEvent').toEqual([]);
    // E2-PR3c3: bez różnicy chwili utworzenia notatki (dotąd „pnote n: createdAtISO [createdAtISO-notatki]”).
    expect(opisD(await w1Klasy(S, u.A, u.B, { tabela: 'p6' }), u.n, 'A', 'B'), raport(S, 'W1 (klasy)')).toEqual([]);
    const w = await w4(S, u.A, u.B, { tabela: 'p6' });
    expect(w.ok, raport(S, 'W4') + '\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
    const notatka = (U) => (U.stan.patientNotes || []).filter((x) => x.id === u.nId).map((x) => [x.patientId, x.body]);
    expect({ A: notatka(u.A), B: notatka(u.B) }, 'po spoczynku: notatka n z B pod P na obu').toEqual({
      A: [[u.P, 'Fikcyjna notatka zostawiona na B']], B: [[u.P, 'Fikcyjna notatka zostawiona na B']],
    });
  }, 120_000);
  // H1 zdarzenie po zdarzeniu (E3-PR0a; minimalne odtworzenie ziarna 104 profilu „dłuższa praca bez połączenia”, krok
  // 139, partia A→B): odbiorca B nie ma karty P i ma własny nowszy nagrobek T2; partia A→B niesie stary nagrobek A (T1 <
  // T2), potem wersję A (T3 > T2) i pfull z haka A (setId P:T2). Nagrobek T1 u B niczego nie przegrywa (karty nie ma,
  // nagrobek T2 jest nowszy), więc sejf nie daje haka, a karta wraca późniejszymi zdarzeniami partii. Model H1 na stanie
  // po całej partii oczekiwał pfull(P) z setId P:T1 (AB7 czerwone przy prawidłowym sejfie); model zdarzenie po zdarzeniu
  // — zgodny z emiterami. Po samych zdarzeniach W1 = ∅, W2r, W4 (karta P z tymi samymi wersjami na A i B).
  it('AB7 (H1 zdarzenie po zdarzeniu): nagrobek karty przed powrotem karty w tej samej partii — A usuwa P (T1); B nowa wersja P, B→A; B usuwa P (T2); A nowa wersja P (T3); B→A: hak A pfull(P, P:T2); A→B [ptomb, snap, pfull]: B bez haka, AB7 zgodne; spoczynek W1 = ∅, W2r, W4', async () => {
    ustaw(START);
    const S = swiat(9104);
    S.w2s = false;
    const los = rng(0x9104);
    vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
    const u = await p6r4(S); u.S = S;
    const nowaWersja = async (U, masa) => { krok(60e3); await mutacja(S, U, `nowa wersja P ${masa} kg`, () => U.d.zapiszKarte(1, { masa, zapis: { patientId: u.P, forceNewSnapshot: true } })); };
    await p6usunPacjenta(u, u.A, u.P); // T1
    const T1 = u.A.stan.tombstones.find((t) => t.patientId === u.P).deletedAtISO;
    await nowaWersja(u.B, 22); // później niż T1
    krok(); await dostawa(S, u.B, u.A);
    expect(karty(u.A), 'A: karta P wraca (wersja B nowsza niż nagrobek T1)').toContain(u.P);
    await p6usunPacjenta(u, u.B, u.P); // T2
    const T2 = u.B.stan.tombstones.find((t) => t.patientId === u.P).deletedAtISO;
    await nowaWersja(u.A, 23); // T3 > T2
    krok();
    const r1 = await dostawa(S, u.B, u.A);
    expect(r1.dodane.map((k) => [k.event.kind, k.event.key, k.event.full && k.event.full.setId]), 'hak H1 A: nagrobek T2 przegrał z wersją T3').toEqual([['pfull', u.P, `${u.P}:${T2}`]]);
    expect(oczekujaceQ(S, u.A, u.B).map(([k]) => k), 'Q_A przed dostawą A→B').toEqual(['ptomb', 'snap', 'pfull']);
    expect(u.A.Q[0].atISO, 'nagrobek A w partii: T1').toBe(T1);
    krok();
    const r2 = await dostawa(S, u.A, u.B); // model na stanie po całej partii: pfull(P) z setId P:T1 — AB7
    expect(r2.dodane, 'B: bez haka H1 (nagrobek T1 nie przegrał u B)').toEqual([]);
    expect(wersjeKarty(u.B, u.P), 'B po partii: karta P z wersjami A').toEqual(wersjeKarty(u.A, u.P));
    await spoczynekZgodny(S, u.A, u.B);
  }, 120_000);
});

// ── p. 2: scenariusze stomb (weryfikacja 2026-10-29: P1, P1b, P1c, P1d, P1e, znika; retencja; odbiorca bez karty) ─────
// Bliźniaki A (nadawca) i B (odbiorca ze starym stanem). Kroki A i B przez mutację z emiterami (także „Scal pacjentów”:
// snap wersji przeniesionych i głów scalenia pod kartą celu, potem ptomb kart źródłowych). Warunki: W2 w pierwszej pełnej
// dostawie A→B (zdarzenia A na świeżym klonie B ≡ blob A na drugim klonie), potem punkt spoczynku, W1, W2r, W3.
async function trzyKarty(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const x1 = await A.d.zapiszKarte(1, { wzrost: 120, masa: 20 });
  const X = x1.patientId;
  krok(); const x = await A.d.zapiszKarte(1, { wzrost: 125, masa: 23, zapis: { patientId: X, forceNewSnapshot: true } });
  krok(); const x3 = await A.d.zapiszKarte(1, { wzrost: 130, masa: 25, zapis: { patientId: X, forceNewSnapshot: true } });
  krok(); const Y = (await A.d.zapiszKarte(2, { wzrost: 110, masa: 18 })).patientId;
  krok(); const Z = (await A.d.zapiszKarte(3, { wzrost: 111, masa: 19 })).patientId;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, X, Y, Z, x1: x1.snapshotId, x: x.snapshotId, x3: x3.snapshotId };
}
async function jednaWersja(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const x = await A.d.zapiszKarte(1, { wzrost: 125, masa: 23 });
  krok(); const Z = (await A.d.zapiszKarte(3, { wzrost: 111, masa: 19 })).patientId;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, X: x.patientId, Z, x: x.snapshotId };
}
const gdzie = (U, sid) => (U.stan.patients || []).find((p) => (p.snapshots || []).some((s) => s.snapshotId === sid));
async function scal(u, U, z, na) { krok(60e3); await mutacja(u.S, U, 'Scal pacjentów', () => U.v.mergePatients(z, na)); }
async function popraw(u, U, sid, kg) {
  krok(60e3);
  const p = gdzie(U, sid);
  const s = (await U.v.getPatient(p.patientId)).snapshots.find((q) => q.snapshotId === sid);
  await mutacja(u.S, U, `poprawka ${kg} kg`, () => U.v.updateSnapshotPayload(p.patientId, sid, { ...s.payload, user: { ...s.payload.user, weight: kg } }, { preserveSavedAt: true }));
}
async function doKosza(u, U, sid) { krok(60e3); await mutacja(u.S, U, 'kosz', () => U.v.moveSnapshotToTrash(gdzie(U, sid).patientId, sid, { odepnij: true })); }
const SCEN_STOMB = {
  P1: { przygotuj: trzyKarty, kroki: async (u) => { await scal(u, u.A, u.X, u.Y); await scal(u, u.A, u.Y, u.Z); await doKosza(u, u.A, u.x); } },
  P1b: { przygotuj: trzyKarty, kroki: async (u) => { await scal(u, u.A, u.X, u.Y); await scal(u, u.A, u.Y, u.Z); await popraw(u, u.A, u.x, 74); await doKosza(u, u.A, u.x); } },
  P1c: { przygotuj: jednaWersja, kroki: async (u) => { await scal(u, u.A, u.X, u.Z); await popraw(u, u.A, u.x, 74); await doKosza(u, u.A, u.x); } },
  P1d: { przygotuj: jednaWersja, kroki: async (u) => { await scal(u, u.A, u.X, u.Z); await popraw(u, u.A, u.x, 74); await doKosza(u, u.A, u.x); }, odB: true },
  P1e: { przygotuj: trzyKarty, kroki: async (u) => { await scal(u, u.A, u.X, u.Y); await scal(u, u.A, u.Y, u.Z); await doKosza(u, u.A, u.x); await popraw(u, u.B, u.x, 55); } },
  znika: { przygotuj: jednaWersja, kroki: async (u) => {
    await scal(u, u.A, u.X, u.Z); await doKosza(u, u.A, u.x);
    // pozostawiony lokalny nagrobek istniejącej karty X na B (przerwane wcześniejsze scalenie)
    await u.B.d.adapter.putTombstoneForUser(u.B.d.konto.userId, { patientId: u.X, deletedAtISO: u.A.stan.tombstones.find((t) => t.patientId === u.X).deletedAtISO });
    ustawStan(u.B, await eksport(u.B));
  } },
  retencja: { przygotuj: trzyKarty, kroki: async (u) => {
    krok(60e3);
    await mutacja(u.S, u.A, 'retencja X', () => u.A.v.pruneSnapshotsForPatient(u.X, { recentHours: 0 }));
    expect(u.A.stan.snapshotTombstones.filter((e) => e.powod === 'retencja').length, 'retencja przycina').toBeGreaterThan(0);
  } },
};
describe('A ≡ B, blok deterministyczny p. 2: scenariusze stomb', () => {
  d1();
  for (const [nazwa, sc] of Object.entries(SCEN_STOMB).filter(([n]) => n !== 'P1e')) {
    it(`${nazwa}: W2 w pierwszej pełnej dostawie A→B, spoczynek${sc.odB ? ' (najpierw B→A)' : ''}, W1, W2r, W3, W4`, async () => {
      const S = swiat(200 + Object.keys(SCEN_STOMB).indexOf(nazwa));
      const u = await sc.przygotuj(S);
      await sc.kroki(u);
      expect(u.A.Q.some((e) => e.kind === 'stomb'), 'nadawca ma zdarzenie stomb').toBe(true);
      expect(await w2(S, u.A, u.B), raport(S, 'W2 A→B')).toBe(null);
      await spoczynekZgodny(S, u.A, u.B, { odB: !!sc.odB });
    }, 60_000);
  }
  // P1e — dokładna charakterystyka (specyfikacja 2a, 3.4): strumień zdarzeń pokazuje B stan pośredni A (x pod Z, rev 2),
  // reguła właściciela wersji wspólnej dwóm kartom („najpierw rev”) kładzie x pod Z; A ma x tylko w koszu, więc snap(X/x)
  // od B zakłada na A z powrotem kartę X. Pełna wymiana blobem (W4) daje x pod Z na obu — inaczej niż świat samych blobów.
  it('P1e — ZMIANA ZACHOWANIA — do akceptacji właściciela przed E2-PR6: (a) W2 w 1. dostawie, (b) spoczynek, (c) W4: x pod Z, (d) same bloby: X[x], (e) (c) ≠ (d)', async () => {
    const swiatP1e = async () => {
      const S = swiat(204);
      const los = rng(0x9e1e);
      vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
      const u = await trzyKarty(S);
      u.n = etykietyP1e(u);
      await SCEN_STOMB.P1e.kroki(u);
      return { S, u };
    };
    const { S, u } = await swiatP1e();
    // (a) W2 w pierwszej pełnej dostawie A→B: stan klonu B po zdarzeniach wobec stanu klonu B po blobie A
    const zd = await stanZdarzen(S, u.B, [u.A.Q.slice(kursor(S, u.A, u.B))]);
    const bl = await stanBlobu(S, u.B, u.A);
    expect(opisD(D(bl, zd), u.n, 'blob', 'zdarzenia'), '(a) W2 A→B: blob A wobec zdarzeń A na klonie B').toEqual([
      'karta X: tylko blob',
      'wersja X/x: tylko blob',
      'wersja Z/x: tylko zdarzenia',
    ]);
    // (b) po spoczynku: D(A, B)
    expect(await spoczynek(S, u.A, u.B), 'spoczynek w ≤ 4 rundach').not.toBe(null);
    const [a, b] = [kanon(await eksport(u.A)), kanon(await eksport(u.B))];
    expect(opisD(await sklasyfikuj(D(a, b), a, b, { tabela: 'p6' }), u.n, 'A', 'B'), '(b) D(A, B) po spoczynku zdarzeń: karta X (z x) tylko na A, x pod Z tylko na B — klasa „miejsce wizyty po „Scal pacjentów”” (E3-PR0a)').toEqual([
      'karta X: tylko A [miejsce wizyty po „Scal pacjentów”]',
      'wersja X/x: tylko A [miejsce wizyty po „Scal pacjentów”]',
      'wersja Z/x: tylko B [miejsce wizyty po „Scal pacjentów”]',
    ]);
    // (c) W4 (PO-A i PO-B): na obu Z zawiera x (55 kg, rev 2), karty X nie ma
    const gdzieX = async (U) => { const k = kanon(await eksport(U)); const z = (k.patients || []).find((p) => p.patientId === u.Z); const sx = z && z.snapshots.find((q) => q.snapshotId === u.x); return { X: kartaW(k, u.X), Zx: sx ? { kg: sx.payload.user.weight, rev: sx.rev } : null }; };
    const w = await w4(S, u.A, u.B, { tabela: 'W4' }, { opisz: async (A1, B1) => ({ A: await gdzieX(A1), B: await gdzieX(B1) }) });
    expect(w.ok, '(c) W4: zgodność po pełnej wymianie\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
    const po = { X: false, Zx: { kg: 55, rev: 2 } };
    expect(w.warianty.map((x) => [x.wariant, x.opis]), '(c) W4: x (55 kg, rev 2) pod Z na obu, bez karty X').toEqual([['PO-A', { A: po, B: po }], ['PO-B', { A: po, B: po }]]);
    // (d) świat samych blobów: te same kroki, wymiana blobami w obie strony
    await sprzatnijUrzadzenia(); vi.restoreAllMocks(); ustaw(START);
    const s2 = await swiatP1e();
    expect(await spoczynekBlobow(s2.u.A, s2.u.B), 'spoczynek blobów').not.toBe(null);
    const d = { A: await gdzieX(s2.u.A), B: await gdzieX(s2.u.B) };
    const xX = async (U) => { const k = kanon(await eksport(U)); const p = (k.patients || []).find((q) => q.patientId === u.X); return p ? p.snapshots.map((q) => `${etykieta(u.n, q.snapshotId)}:${q.payload.user.weight}`) : null; };
    expect({ ...d, xA: await xX(s2.u.A), xB: await xX(s2.u.B) }, '(d) same bloby: X[x 55 kg] na obu, Z bez x').toEqual({ A: { X: true, Zx: null }, B: { X: true, Zx: null }, xA: ['x:55'], xB: ['x:55'] });
    // (e) zmiana zachowania wobec wymiany samymi blobami
    expect({ A: po, B: po }, '(e) ZMIANA ZACHOWANIA wobec wymiany samymi blobami: po W4 x jest pod Z, a w świecie samych blobów karta X wraca z x — do akceptacji właściciela przed E2-PR6').not.toEqual({ A: d.A, B: d.B });
  }, 120_000);
  it('stomb na odbiorcy bez karty (K10): karta bez wizyt nie powstaje, nagrobek odbiorcy zostaje; po haku H1 pełna karta wszędzie', async () => {
    const S = swiat(230);
    const u = await trzyKarty(S);
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    await doKosza(u, u.A, u.x1);
    expect(u.A.Q.map((e) => e.kind), 'A: jedno zdarzenie kosza').toEqual(['stomb']);
    await dostawa(S, u.A, u.B);
    expect({ karty: karty(u.B).includes(u.X), nagrobek: nagrobki(u.B).includes(u.X), kosz: (u.B.stan.snapshotTombstones || []).map((e) => e.snapshotId) },
      'B po stomb z kartą bez wizyt').toEqual({ karty: false, nagrobek: true, kosz: [u.x1] });
    await spoczynekZgodny(S, u.A, u.B, { odB: true });
    expect({ karty: karty(u.A).includes(u.X), wersje: wersjeKarty(u.A, u.X) }, 'po spoczynku: karta X z pełną historią bez kosza')
      .toEqual({ karty: true, wersje: [u.x, u.x3].sort() });
    expect(S.stat.h1, 'hak H1 (nagrobek B przegrywa z koszem A)').toBeGreaterThan(0);
  }, 60_000);
});

// ── p. 3: D-5 — kosz podnosi lastSavedAtISO; późniejszy nagrobek karty z chwilą pomiędzy zapisem a koszem ──────────────
describe('A ≡ B, blok deterministyczny p. 3: D-5 (stomb z kartą, wariant 11.2)', () => {
  d1();
  it('nagrobek z chwilą pomiędzy: odbiorca zdarzeń ma tyle kart co źródło i odbiorca bloba; spoczynek, W1', async () => {
    const S = swiat(300);
    const A = await urzadzenie(S, 'A');
    krok(); const P = (await A.d.zapiszKarte(1)).patientId;
    krok(); const v2 = (await A.d.zapiszKarte(1, { wzrost: 125, zapis: { patientId: P, forceNewSnapshot: true } })).snapshotId;
    krok(); ustawStan(A, await eksport(A));
    const B = await urzadzenie(S, 'B', A);
    const D = await urzadzenie(S, 'D', A);
    krok(60e3); await mutacja(S, D, 'usuń pacjenta P', () => D.v.removePatient(P));
    const ptomb = D.Q.find((e) => e.kind === 'ptomb');
    krok(60e3); await mutacja(S, A, 'kosz v1', () => A.v.moveSnapshotToTrash(P, wersjeKarty(A, P).find((s) => s !== v2), { odepnij: true }));
    expect(A.Q.map((e) => e.kind)).toEqual(['stomb']);
    expect(Date.parse(ptomb.atISO) > START && ptomb.atISO < A.stan.patients[0].lastSavedAtISO, 'nagrobek między zapisem a koszem').toBe(true);
    expect(await w2(S, A, B), 'W2 A→B').toBe(null);
    // odbiorca bloba: klon B scala blob A, potem nagrobek D
    const C = await klon(S, B, 'blob');
    await C.v.mergeSyncPayload(json(await A.v.exportSyncPayload()));
    await zastosuj(C, [ptomb]); ustawStan(C, await eksport(C));
    await dostawa(S, A, B);
    await dostawa(S, D, B); await dostawa(S, D, A);
    expect({ A: karty(A), B: karty(B), blob: karty(C) }).toEqual({ A: [P], B: [P], blob: [P] });
    await zamknij(C);
    await spoczynekZgodny(S, A, B);
  }, 60_000);
});

// ── p. 4: nagrobki pacjenta u odbiorcy (starszy i nowszy niż nowa wersja nadawcy) ─────────────────────────────────────
describe('A ≡ B, blok deterministyczny p. 4: nagrobek pacjenta u odbiorcy', () => {
  d1();
  it('starszy niż nowa wersja A: zdarzenie daje kartę częściową (W2s K1), hak H1 dowozi pełną historię; W1', async () => {
    const S = swiat(400);
    const u = await trzyKarty(S);
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    krok(60e3);
    const { koperty } = await mutacja(S, u.A, 'nowa wersja X', () => u.A.d.zapiszKarte(1, { wzrost: 135, masa: 27, zapis: { patientId: u.X, forceNewSnapshot: true } }));
    const nowa = koperty[0].event.key.split('/')[1];
    await dostawa(S, u.A, u.B);
    expect({ wersje: wersjeKarty(u.B, u.X), W2s: S.stat.w2s.kategorie }, 'B po snap: karta tylko z nową wersją (charakterystyka K1)')
      .toEqual({ wersje: [nowa], W2s: { 'karta częściowa do pfull': 1 } });
    await spoczynekZgodny(S, u.A, u.B, { odB: true });
    expect(wersjeKarty(u.B, u.X), 'pełna historia przez H1').toEqual([u.x1, u.x, u.x3, nowa].sort());
    expect(S.stat.h1).toBe(1);
  }, 60_000);
  // Klasa W2s K1k (rodowód: ziarno 7 #36–#51 i ziarno 8 #49–#59 profilu podstawowego): A daje do kosza x, kosz dochodzi
  // do B; B „Przywróć” x (wpis zdjęty lokalnie), potem B „Usuń pacjenta” X; A bez wiedzy dopisuje wizytę X. W pełnej
  // dostawie A→B blob A niesie całą listę kosza z x (A nie wie o przywróceniu), a zdarzenia A — tylko nową wizytę:
  // wpis kosza x tylko po stronie bloba, karta X w wyścigu „Usuń pacjenta”. Po spoczynku W1, W2r i W4 zielone.
  it('klasa W2s K1k (wpis kosza karty w wyścigu „Usuń pacjenta”): minimalne odtworzenie; spoczynek, W1, W2r, W4', async () => {
    const S = swiat(402);
    const u = await trzyKarty(S);
    const n = etykietyP1e(u);
    await doKosza(u, u.A, u.x);
    await dostawa(S, u.A, u.B);
    krok(60e3); await mutacja(S, u.B, 'przywróć x', () => u.B.v.restoreTrashedSnapshot(u.X, u.x));
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    krok(60e3);
    const { koperty } = await mutacja(S, u.A, 'nowa wersja X', () => u.A.d.zapiszKarte(1, { wzrost: 135, masa: 27, zapis: { patientId: u.X, forceNewSnapshot: true } }));
    n.set(koperty[0].event.key.split('/')[1], 'nowa');
    const od = S.stat.w2sLista.length;
    await dostawa(S, u.A, u.B);
    const p = S.stat.w2sLista.slice(od).find((x) => x.dostawa === 'A>B');
    const opis = p ? p.roznice.map((r) => `${r.kategoria}: ${r.rodzaj} ${kluczEtykiet(n, r.klucz)}${r.tylko ? ' tylko ' + (r.tylko === 'x' ? 'zdarzenia' : 'blob') : ''}`).sort() : null;
    expect(opis, 'W2s A→B: kategorie różnic (bez „inne”)').toEqual(K1K_ODTWORZENIE);
    await spoczynekZgodny(S, u.A, u.B, { odB: true });
  }, 60_000);
  it('nowszy niż nowa wersja A: karta nieobecna u B, po spoczynku nieobecna wszędzie (wiersze nadawcy zostają w Q_A)', async () => {
    const S = swiat(401);
    const u = await trzyKarty(S);
    krok(60e3); await mutacja(S, u.A, 'nowa wersja X', () => u.A.d.zapiszKarte(1, { wzrost: 135, masa: 27, zapis: { patientId: u.X, forceNewSnapshot: true } }));
    krok(60e3); await mutacja(S, u.B, 'usuń pacjenta X', () => u.B.v.removePatient(u.X));
    await dostawa(S, u.A, u.B);
    expect({ karta: karty(u.B).includes(u.X), nagrobek: nagrobki(u.B).includes(u.X) }, 'B po snap starszym niż nagrobek').toEqual({ karta: false, nagrobek: true });
    await spoczynekZgodny(S, u.A, u.B);
    expect({ A: karty(u.A).includes(u.X), B: karty(u.B).includes(u.X), nagrA: nagrobki(u.A).includes(u.X), Q_A: u.A.Q.map((e) => e.kind) })
      .toEqual({ A: false, B: false, nagrA: true, Q_A: ['snap'] });
    expect(S.stat.h1).toBe(0);
  }, 60_000);
  // Strażnik poprawki H2 „zawsze do kolejki” (specyfikacja 2a, 3.1; N1 — minimalne odtworzenie
  // z przeglądu E2-PR2a; P3 weryfikacji): B zapisuje notatkę n karty P, B „Usuń
  // pacjenta” P (ptomb, pnotetomb n z kartą), A bez wiedzy poprawia wizytę v. W partii B→A koperta pnote n przychodzi
  // RAZEM ze swoim nagrobkiem; nagrobek przegrywa (karta P zostaje u A, wraca na B hakiem H1), więc A dokłada pnote(n)
  // do Q_A (H2). Z dawnym wyjątkiem „pnote tej notatki w partii” notatka zostaje tylko na A, a nagrobek tylko na B (W1 i
  // W2r(B) czerwone). N1b — ta sama historia, najpierw dostawa B→A.
  for (const [nazwa, odB] of [['N1', false], ['N1b, najpierw dostawa B→A', true]]) {
    it(`H2 „zawsze do kolejki” (${nazwa}): notatka karty usuniętej na B, poprawka wizyty na A — spoczynek, W1, W2r, W4; pnote w hakach A`, async () => {
      const S = swiat(odB ? 651 : 650);
      const los = rng(odB ? 0x6051 : 0x6050);
      vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
      const u = await p6r4(S); u.S = S;
      krok(60e3); await mutacja(S, u.B, 'notatka pacjenta', () => u.B.v.savePatientNote({ patientId: u.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść N1', category: 'inne' }));
      await p6usunPacjenta(u, u.B, u.P);
      await popraw(u, u.A, u.v, 34.9);
      expect(u.B.Q.map((e) => e.kind), 'Q_B').toEqual(['pnote', 'ptomb', 'pnotetomb']);
      krok();
      await spoczynekZgodny(S, u.A, u.B, { odB });
      const hakiA = S.dziennik.filter((l) => l.includes(' dostawa B>A: ') && /\[[^\]]*\bpnote\b[^\]]*\] → haki \[[^\]]*\bpnote\b/.test(l));
      expect(hakiA.length, raport(S, 'H2 u A: pnote(n) w hakach po partii B→A z kopertą pnote n i jej nagrobkiem')).toBe(1);
      expect(S.stat.h2, 'H2').toBeGreaterThan(0);
      const stan = async (U) => { const k = kanon(await eksport(U)); return { karty: (k.patients || []).map((p) => p.patientId), notatki: (k.patientNotes || []).map((n) => n.body), nagrobkiNotatek: (k.patientNoteTombstones || []).length }; };
      const oczek = { karty: [u.P, u.Q].sort(), notatki: ['Fikcyjna treść N1'], nagrobkiNotatek: 0 };
      expect({ A: { ...(await stan(u.A)), karty: (await stan(u.A)).karty.sort() }, B: { ...(await stan(u.B)), karty: (await stan(u.B)).karty.sort() } }, 'po spoczynku: karta P i notatka n na obu').toEqual({ A: oczek, B: oczek });
    }, 120_000);
  }
  // AB3 (stan jak PM12 testu pokrycia, sync-pokrycie-mutacji.test.mjs): A daje s1 do kosza, bliźniak K daje do kosza s2,
  // A scala ładunek K — s2 jest ostatnią wersją karty A, więc zostaje w karcie i jest w koszu; A poprawia s2 (później niż
  // usunięcie). „Przywróć” s2 — „już w karcie”: emiter wysyła snap s2, a model ma tę samą kopertę z reguły zdjęcia wpisu
  // kosza wersji obecnej w karcie (bez reguły model nie wysyłał nic). Odbiorca zdarzeń zdejmuje wpis kosza jak pełny ładunek.
  it('AB3: „Przywróć”, gdy wizyta jest już w karcie — emitery = model = [snap s2]; W2 w pierwszej pełnej dostawie A→K, spoczynek, W1 = ∅, W2r, W4', async () => {
    const S = swiat(403);
    const A = await urzadzenie(S, 'A');
    krok(); const r1 = await A.d.zapiszKarte(1, { masa: 20 });
    krok(); const r2 = await A.d.zapiszKarte(1, { masa: 23, zapis: { patientId: r1.patientId, forceNewSnapshot: true } });
    krok(); ustawStan(A, await eksport(A));
    const K = await urzadzenie(S, 'K', A);
    const [P, s1, s2] = [r1.patientId, r1.snapshotId, r2.snapshotId];
    krok(); await mutacja(S, A, 'kosz s1', () => A.v.moveSnapshotToTrash(P, s1, { odepnij: true }));
    krok(); await mutacja(S, K, 'kosz s2', () => K.v.moveSnapshotToTrash(P, s2, { odepnij: true }));
    krok(); await A.v.mergeSyncPayload(json(await K.v.exportSyncPayload())); ustawStan(A, await eksport(A));
    expect({ karta: wersjeKarty(A, P), kosz: (await A.v.listTrashedSnapshots()).map((e) => e.snapshotId).sort() }, 'kontrola: s2 w karcie i w koszu A')
      .toEqual({ karta: [s2], kosz: [s1, s2].sort() });
    krok(60e3);
    const s = (await A.v.getPatient(P)).snapshots.find((q) => q.snapshotId === s2);
    await mutacja(S, A, 'poprawka s2', () => A.v.updateSnapshotPayload(P, s2, { ...s.payload, user: { ...s.payload.user, weight: 78 } }, { preserveSavedAt: true }));
    krok(60e3);
    const { wynik, koperty, model } = await mutacja(S, A, 'przywróć s2 (już w karcie)', () => A.v.restoreTrashedSnapshot(P, s2));
    expect({ juzWKarcie: wynik && wynik.alreadyInCard, emitery: koperty.map(opisKoperty), model: model.map(opisKoperty) }, '„Przywróć” już w karcie: emitery i model')
      .toEqual({ juzWKarcie: true, emitery: [{ kind: 'snap', key: `${P}/${s2}` }], model: [{ kind: 'snap', key: `${P}/${s2}` }] });
    expect(await w2(S, A, K), raport(S, 'W2 A→K')).toBe(null);
    await spoczynekZgodny(S, A, K);
    expect((await K.v.listTrashedSnapshots()).map((e) => e.snapshotId), 'K po spoczynku: w koszu tylko s1').toEqual([s1]);
  }, 60_000);
});

// ── p. 5: katalog kosza SCEN (kosz-po-kluczu-wspolne.mjs) — wymiana zdarzeniami wobec wymiany blobem ──────────────────
// Osobne konta jak w katalogu (P, K, C; przygotowanie blobem), kroki katalogu, pierwsze scalenia w danej kolejności,
// 3 rundy „każdy z każdym” (RUNDY.katalog). Wymiana zdarzeniami: każda mutacja lokalna kroku (wyrocznia emisji, jak
// w programie losowym) daje koperty z builderów do kolejki urządzenia; wymiana Z→NA = dostawa FIFO kolejki Z od kursora
// przez mergeSyncPayload (koperta jawna — osobne konta; szyfrowanie pokrywa W3) z hakami H1/H2 u odbiorcy; „sync” w
// krokach katalogu też idzie zdarzeniami. Po rundach dostawy aż kolejki są puste (≤ 4 rundy). Potem W4: rundy PO-A na
// parach (P, K), (K, C), (C, P), aż eksport się nie zmienia. Literał: widok (każde urządzenie) i skrót pelnyStan dla
// trzech ścieżek — zdarzenia, blob (dzisiejszy katalog), zdarzenia + W4. Losowość z ziarna (crypto i Math.random),
// żeby remisy identyfikatorów i chwile „Przywróć” były powtarzalne. D przy W4 bez credential (osobne konta). Klasy W4
// (tabela 'W4:p5'): R4n z W4p i E1-katalog — różnica, której klucz encji ma też D ścieżki blobów tej samej pary, dozwolona
// tylko w przebiegach z listy E1_KATALOG (3.6; w przebiegach z listy test sprawdza też, że po podmianie listy W4 jest
// czerwone), oraz wyjątek Q8-obca-2 „ZNANA RÓŻNICA (zdarzenia)” (do decyzji właściciela: którą wizytę zostawić):
// WYŁĄCZNIE klucze D z literału Q8_ZDARZENIA tego przebiegu (każda inna różnica albo brak którejś z nich — czerwień;
// negatywy: inny przebieg, podmieniony literał).
// E2-PR3a3: urządzenia katalogu ładują kopię sejfu z rejestrem łańcucha (zaladowanieSejfu z s4d7-wspolne.mjs, EMISJA),
// więc koperty mutacji kroku pochodzą z prawdziwych emiterów, porównane z modelem; literały p. 5 bez zmian.
// E2-PR3c1: npret-pin i npret-K bez utraty (koperta nagrobka X niesie kartę docelową Y); nowe przebiegi pin-scal
// i popr-scal (gwiazdka albo poprawka wizyty x na P, potem „Scal pacjentów” X → Y na K, bez retencji) na końcu listy:
// ziarno przebiegu to pozycja na liście, więc ziarna wcześniejszych przebiegów (i ich literały) bez zmian.
const KAT_LISTA = ['E4b', 'E4b-1', 'E4b-2w', 'kosz-przed', 'kosz-po', 'kosz-po-2', 'E4b-ret', 'npret-pin', 'npret-K', 'PRZ0-bez', 'E1-popr-C', 'E1-C', 'Q8-obca-2', 'PRZ', 'pin-scal', 'popr-scal'];
const KAT_KOL = ['K←C,P←K', 'C←P,C←K'];
const KAT_URZ = ['P', 'K', 'C'];
const KAT_MUTUJACE = new Set(['savePatient', 'updateSnapshotPayload', 'setSnapshotPinned', 'moveSnapshotToTrash', 'pruneSnapshotsForPatient', 'mergePatients', 'restoreTrashedSnapshot', 'removePatient', 'savePatientNote', 'removePatientNote']);
const skrot = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12);
const bezCred = (k) => { const { credential: _c, ...r } = k; return r; };
function losowoscZiarna(ziarno) {
  const los = rng(ziarno), losMath = rng(ziarno ^ 0x5bd1e995);
  const c = globalThis.crypto;
  const gr = c.getRandomValues.bind(c);
  vi.spyOn(c, 'getRandomValues').mockImplementation((x) => {
    if (x instanceof Uint8Array && (x.length === 16 || x.length === 12)) { for (let i = 0; i < x.length; i += 1) x[i] = Math.floor(los() * 256); return x; }
    return gr(x);
  });
  vi.spyOn(c, 'randomUUID').mockImplementation(() => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(los() * 16).toString(16)));
  vi.spyOn(Math, 'random').mockImplementation(() => losMath());
}
async function przebiegKat(nazwa, kol, tryb, ziarno) {
  vi.restoreAllMocks();
  losowoscZiarna(ziarno);
  sztucznyZegar();
  const scen = KATALOG[nazwa];
  const u = await PRZYGOTOWANIA[scen.przygotuj]();
  u.dziennik = []; u.warunki = []; u.warunkiBledne = false; u.slad = [];
  u.t0 = zegar.t;
  if (scen.przygotuj === 'trzyKarty') {
    const x = (await u.K.getPatient(u.X)).snapshots;
    u.wersje = { [x[2].snapshotId]: 'x1', [u.sid]: 'x', [x[0].snapshotId]: 'x3' };
    u.wersje[(await u.K.getPatient(u.Y)).snapshots[0].snapshotId] = 'y';
    u.wersje[(await u.K.getPatient(u.Z)).snapshots[0].snapshotId] = 'z';
  } else {
    u.X = u.pid; u.karty = { [u.pid]: 'X' }; u.wersje = { [u.s1]: 's1', [u.sid]: 'x' };
  }
  const S = { stat: { zdarzen: 0, h1: 0, h2: 0, dostaw: 0, pelnych: 0, emitery: statEmiterow(), haki: statHakow() }, kursor: new Map(), dziennik: [], braki: [], hasla: new Map(), nrKroku: 0 };
  const surowe = Object.fromEntries(KAT_URZ.map((n) => [n, u[n]]));
  const U = {};
  for (const n of KAT_URZ) {
    U[n] = { v: surowe[n], ev: surowe[n]._eventLog, nazwa: n, Q: [], setIds: new Set(), stan: null, usuniete: new Set(), jawnie: true, lancuch: surowe[n].__lancuch };
    ustawStan(U[n], await eksport(U[n]));
  }
  const wlasciciel = new Map(KAT_URZ.map((n) => [U[n].stan.userId, U[n]]));
  const wymiana = async (z, na) => {
    if (tryb === 'blob') { await na.v.mergeSyncPayload(json(await z.v.exportSyncPayload())); ustawStan(na, await eksport(na)); return; }
    await dostawa(S, z, na, { w2s: false });
  };
  if (tryb === 'zdarzenia') {
    // mutacje kroków z emisją; „sync” z kroków katalogu jako dostawa zdarzeń od właściciela ładunku
    for (const n of KAT_URZ) {
      u[n] = new Proxy(surowe[n], {
        get(cel, k) {
          const f = cel[k];
          if (typeof f !== 'function') return f;
          if (KAT_MUTUJACE.has(k)) return async (...a) => (await mutacja(S, U[n], k, () => f.apply(cel, a), { operacja: { nazwa: k, args: a } })).wynik;
          if (k === 'mergeSyncPayload') return async (lad) => { await wymiana(wlasciciel.get(lad.userId), U[n]); return {}; };
          return f.bind(cel);
        },
      });
    }
  }
  if (tryb === 'blob') {
    // Świat samych blobów: historia wyroczni bez emisji (eksport przed i po operacji kroku, operacja z argumentami).
    for (const n of KAT_URZ) {
      u[n] = new Proxy(surowe[n], {
        get(cel, k) {
          const f = cel[k];
          if (typeof f !== 'function') return f;
          if (!KAT_MUTUJACE.has(k)) return f.bind(cel);
          return async (...a) => {
            const przed = await eksport(U[n]);
            const chwila = Date.now();
            let r, blad = null;
            try { r = await f.apply(cel, a); } catch (e) { blad = e; }
            const po = await eksport(U[n]);
            WYR.zapisz(S.wyr = S.wyr || WYR.nowyModel(), { dev: n, opis: k, przed, po, t: chwila, operacje: [{ nazwa: k, args: a }] });
            if (blad) throw blad;
            return r;
          };
        },
      });
    }
  }
  S.wyrSwiat = `p5 ${nazwa} ${kol} ${tryb}`;
  const kartyKat = { ...(u.karty || {}), ...Object.fromEntries(['X', 'Y', 'Z'].filter((k) => u[k]).map((k) => [u[k], k])) };
  S.wyrEtyk = (id) => kartyKat[id] || (u.wersje && u.wersje[id]) || String(id).slice(0, 6);
  przesunZegar(60e3);
  await scen.kroki(u);
  for (const n of KAT_URZ) { u[n] = surowe[n]; ustawStan(U[n], await eksport(U[n])); }
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await wymiana(U[z], U[na]); }
  for (let r = 0; r < 3; r += 1) for (const [z, na] of RUNDY.katalog) await wymiana(U[z], U[na]);
  let doRundy = 0;
  const oczekujace = () => KAT_URZ.some((z) => KAT_URZ.some((na) => z !== na && (S.kursor.get(z + '>' + na) || 0) < U[z].Q.length));
  if (tryb === 'zdarzenia') while (oczekujace() && doRundy < 4) { doRundy += 1; for (const [z, na] of RUNDY.katalog) await wymiana(U[z], U[na]); }
  const stan = async () => { const st = {}; for (const n of KAT_URZ) st[n] = await pelnyStan(u, surowe[n]); return st; };
  const widoki = (st) => { const w = KAT_URZ.map((n) => widok(st[n])); return w.every((x) => x === w[0]) ? w[0] : Object.fromEntries(KAT_URZ.map((n, i) => [n, w[i]])); };
  const st = await stan();
  const wynik = { widok: widoki(st), stan: skrot(st), pelny: st, oczekujace: oczekujace(), zdarzen: S.stat.zdarzen, h1: S.stat.h1, h2: S.stat.h2, braki: S.braki.length, warunkiBledne: u.warunkiBledne };
  // Wyrocznia: po samych zdarzeniach (W1) albo w świecie samych blobów (bloby), na trzech urządzeniach.
  const swiatWyr = tryb === 'blob' ? 'bloby' : 'W1';
  wynik.wyr = wyrOcena(S, swiatWyr, `p5 ${swiatWyr}`, await wyrWidoki(S, U));
  // Etykiety encji (karty i wersje katalogu; głowy „Scal pacjentów” — „m” z chwilą zapisu, jak widok) do literałów E1.
  const etyk = (r) => {
    const [x, y] = r.klucz.split(/[/|]/);
    const kk = (pid) => (u.karty && u.karty[pid]) || String(pid).slice(0, 6);
    const rek = r.a || r.b || {};
    const ww = (sid) => (u.wersje && u.wersje[sid]) || (sid === u.sid ? 'x' : sid === u.s1 ? 's1' : rek.savedAtISO ? `m${((Date.parse(rek.savedAtISO) - u.t0) / 60e3).toFixed(3).replace(/\.?0+$/, '')}` : String(sid).slice(0, 6));
    return r.rodzaj === 'wersja' ? `${kk(x)}/${ww(y)}` : r.rodzaj === 'kosz' ? `${ww(x)}|${kk(y)}` : r.rodzaj === 'karta' || r.rodzaj === 'ptomb' ? kk(x) : String(r.klucz).slice(0, 8);
  };
  wynik.etyk = etyk;
  wynik.t0 = u.t0;
  if (tryb === 'blob') {
    // D ścieżki samych blobów w parach (P, K), (K, C), (C, P) — podstawa predykatu E1-katalog (3.6) w W4 tego przebiegu.
    wynik.pary = {};
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const [a, b] = [bezCred(kanon(await eksport(U[KAT_URZ[i]]))), bezCred(kanon(await eksport(U[KAT_URZ[j]])))];
      wynik.pary[KAT_URZ[i] + KAT_URZ[j]] = D(a, b);
    }
  }
  if (tryb === 'zdarzenia') {
    // W4: rundy PO-A na parach (P, K), (K, C), (C, P), aż żaden eksport się nie zmienia (≤ 3 rundy ze zmianą)
    let rund = 0, stabilny = false;
    while (!stabilny && rund < 4) {
      rund += 1;
      const przed = KAT_URZ.map((n) => JSON.stringify(kanon(U[n].stan)));
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) await rundaPO(U[KAT_URZ[i]], U[KAT_URZ[j]]);
      stabilny = KAT_URZ.every((n, i) => JSON.stringify(kanon(U[n].stan)) === przed[i]);
    }
    // D par po W4; klasyfikacja (z predykatem E1-katalog, który potrzebuje D ścieżki blobów tego przebiegu) — po przebiegu
    // blobów, w klasyW4Kat (Kosz czytany z tych samych urządzeń, tylko przy różnicy postaci gwiazdki).
    const pary = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const [a, b] = [bezCred(kanon(U[KAT_URZ[i]].stan)), bezCred(kanon(U[KAT_URZ[j]].stan))];
      const [X, Y] = [surowe[KAT_URZ[i]], surowe[KAT_URZ[j]]];
      pary.push({ para: KAT_URZ[i] + KAT_URZ[j], a, b, d: D(a, b), czytajKosz: async () => ({ x: await X.listTrashedSnapshots(), y: await Y.listTrashedSnapshots() }) });
    }
    const st4 = await stan();
    wynik.w4 = { widok: widoki(st4), stan: skrot(st4), pelny: st4, rund, stabilny, pary };
    wynik.wyrW4 = wyrOcena(S, 'W4', 'p5 W4', await wyrWidoki(S, U));
  }
  return wynik;
}
// Klasy W4 p. 5 (tabela 'W4:p5'): predykat E1-katalog na kluczach D ścieżki blobów tej samej pary (paryBlob), dozwolenie
// zależne od nazwy przebiegu (przebieg — lista E1_KATALOG). Wynik: { ok, pary: [{ para, roznice }], e1: [...] } — e1 to
// różnice z klasą E1-katalog: etykieta, strona i to, czy wartość jest taka jak przy samych blobach („zmiana zachowania”).
// Chwile ISO względem początku przebiegu (t0; zegar katalogu biegnie dalej między przebiegami — jak rel w pelnyStan).
const wzgledne = (v, t0) => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return `t0${Date.parse(v) - t0 >= 0 ? '+' : ''}${Date.parse(v) - t0}ms`;
  if (Array.isArray(v)) return v.map((x) => wzgledne(x, t0));
  if (v && typeof v === 'object') {
    // Legacy visit creation is derived from a calendar day (midnight), not
    // from the scenario clock. Both worlds have the exact same metadata;
    // subtracting their different t0 values manufactured a false difference.
    // Keep this value in the comparison, while operation timestamps and
    // explicit encounter creation still use the relative scenario clock.
    const legacyVisit = v.version === 1 && v.origin === 'legacy-inferred' && typeof v.visitId === 'string';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k,
      legacyVisit && k === 'createdAtISO' ? x : wzgledne(x, t0)]));
  }
  return v;
};
describe('porównanie metadanych wizyty w niezależnych zegarach scenariuszy', () => {
  it('porównuje bezwzględną datę legacy dokładnie, zachowując względny czas wizyty jawnej', () => {
    const start = Date.parse('2026-10-21T09:00:00.000Z'), later = start + 360000;
    const visit = { version: 1, visitId: '00112233-4455-8677-8899-aabbccddeeff', origin: 'legacy-inferred',
      clinicalDateISO: '2026-10-21', createdAtISO: '2026-10-21T00:00:00.000Z', dateSource: 'savedAt' };
    expect(wzgledne({ visit }, start)).toEqual(wzgledne({ visit }, later));
    for (const change of [{ createdAtISO: '2026-10-20T00:00:00.000Z' }, { clinicalDateISO: '2026-10-20' },
      { visitId: '00112233-4455-8677-8899-aabbccddee00' }]) {
      expect(wzgledne({ visit }, start)).not.toEqual(wzgledne({ visit: { ...visit, ...change } }, later));
    }
    const explicit = { ...visit, origin: 'explicit', createdAtISO: new Date(start).toISOString() };
    expect(wzgledne({ visit: explicit }, start)).toEqual(wzgledne({ visit: { ...explicit, createdAtISO: new Date(later).toISOString() } }, later));
  });
});
// Wyjątek Q8-obca-2 (specyfikacja 2a, 3.6, akapit „Wyjątek Q8-obca-2” pod E1-katalog; rozstrzygnięte
// 2026-11-03): „ZNANA RÓŻNICA (zdarzenia)”, do decyzji właściciela: którą wizytę zostawić. Po W4 K (w kolejności
// K←C,P←K także C) zostaje z inną wersją karty Y niż przy samych blobach: m1 (głowa „Scal pacjentów”, zapis t0+1 min)
// zamiast y (wizyta sprzed scalenia, −1 min); obie 18 kg, obie w Koszu na trzech, P w obu światach Y/x3 (25 kg). Różnicę
// tworzy kolejność zastosowania w dostawie zdarzeń P→K (wersja m1 przychodzi przed swoim wpisem kosza, a wpis kosza nie
// zdejmuje ostatniej wersji karty; przy blobie zostaje wersja lokalna), W4 jej nie zmienia; koperta nagrobka z kartą
// docelową (E2-PR3c1) tego nie zmienia. Dozwolone WYŁĄCZNIE dokładnie te
// dodatkowe klucze D po W4 (różnice bez innej klasy): [przebieg] = lista [klucz, rodzaj, strona] w kolejności par
// (P, K), (K, C), (C, P); klucz — etykieta encji jak w KAT_E1 (m1 — głowa scalenia z chwilą zapisu względem t0), strona —
// „para:urządzenie, które ma encję” ('PK:K' — w parze (P, K) wersja jest tylko na K). Każda inna różnica bez klasy, klucz
// spoza literału tego przebiegu (inny przebieg, literał podmieniony) albo brak którejkolwiek z tych różnic = czerwień W4.
// Wpis na liście „zmian zachowania” (KAT_ZMIANY, KAT_ZMIANY_ZD) do akceptacji właściciela przed E2-PR6 (reguła wyboru
// pozostawionej wizyty); naprawa przepisze ten literał (lista pusta) i KAT_LITERALY obu przebiegów. Klasa nie wchodzi do tabeli
// DOZWOLONE (wspólnej z profilami): nadaje ją i dozwala tylko klasyW4Kat — dozwolona(ZR_ZD, …) = false w każdej tabeli.
const ZR_ZD = 'ZNANA RÓŻNICA (zdarzenia)';
const Q8_ZDARZENIA = Object.freeze({
  'Q8-obca-2 K←C,P←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'CP:C']],
  'Q8-obca-2 C←P,C←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'KC:K']],
});
const sygnZd = (r, para, etyk) => [etyk(r), r.rodzaj, `${para}:${r.tylko ? para[r.tylko === 'x' ? 0 : 1] : 'obie'}`];
const jakoNapis = (t) => JSON.stringify(t);
// klucz — przebieg z kolejnością (klucz Q8_ZDARZENIA); znaneZd — literał, którego predykat używa (domyślnie z
// Q8_ZDARZENIA; negatyw podmienia go albo klucz). Dozwolenie zawsze wobec Q8_ZDARZENIA[klucz].
async function klasyW4Kat(w4, paryBlob, przebieg, etyk, t0 = { zd: 0, bl: 0 }, { klucz = null, znaneZd = Q8_ZDARZENIA[klucz] || [] } = {}) {
  const pary = [], e1 = [], zd = [];
  const znane = new Set(znaneZd.map(jakoNapis)), wolno = new Set((Q8_ZDARZENIA[klucz] || []).map(jakoNapis));
  for (const p of w4.pary) {
    const blob = paryBlob[p.para] || [];
    const kont = { tabela: 'W4:p5', przebieg, e1Bloby: new Set(blob.map(kluczD)) };
    const d = (await sklasyfikuj(p.d, p.a, p.b, kont, p.czytajKosz)).map((r) => {
      if (r.klasa !== null) return r;
      const s = sygnZd(r, p.para, etyk);
      if (!znane.has(jakoNapis(s))) return r;
      zd.push(s);
      return { ...r, klasa: ZR_ZD, dozwolona: wolno.has(jakoNapis(s)) ? 'tak' : false };
    });
    pary.push({ para: p.para, roznice: d.map(skrotRoznicy) });
    for (const r of d.filter((q) => q.klasa === E1)) {
      const rb = blob.find((q) => kluczD(q) === kluczD(r));
      // pola, którymi encja po W4 różni się od encji ścieżki blobów (strona x i strona y osobno)
      const [w, b] = [wzgledne([r.a, r.b], t0.zd), wzgledne([rb.a, rb.b], t0.bl)];
      const inne = [...new Set([...sciezkiEncji(w[0], b[0]), ...sciezkiEncji(w[1], b[1])])].sort();
      e1.push(`${p.para} ${r.rodzaj} ${etyk(r)}: ${r.tylko ? 'tylko ' + p.para[r.tylko === 'x' ? 0 : 1] : r.sciezki.slice(0, 4).join(', ')}${inne.length ? ` — inna wartość niż przy samych blobach (${inne.slice(0, 6).join(', ')})` : ''}`);
    }
  }
  // „brak tej różnicy = czerwień”: każdy klucz literału wystąpił dokładnie raz
  const zdKomplet = jakoNapis(zd.map(jakoNapis).sort()) === jakoNapis([...znane].sort());
  return { ok: w4.stabilny && pary.every((p) => p.roznice.every((r) => r.dozwolona)) && zdKomplet, pary, e1, zd };
}
// Literały p. 5 (zmierzone): [klucz] = { zdarzenia, blob, w4 } — widok (jeden napis, gdy P, K i C mają ten sam) i skrót
// pelnyStan trzech urządzeń.
const KAT_LITERALY = {
  'E4b K←C,P←K': {
    zdarzenia: { stan: '25412651f039', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y',
      C: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y',
    } },
    blob: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
    w4: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
  },
  'E4b C←P,C←K': {
    zdarzenia: { stan: '2dd95f147ee1', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y',
      C: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y',
    } },
    blob: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
    w4: { stan: 'df198e7f7420', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y' },
  },
  'E4b-1 K←C,P←K': {
    zdarzenia: { stan: 'def61627a75e', widok: {
      P: 'X[x:74] Y[m1,y,x3,x1] Z[z] | kosz x@Y:23',
      K: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X',
      C: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X',
    } },
    blob: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
    w4: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
  },
  'E4b-1 C←P,C←K': {
    zdarzenia: { stan: '083341467bea', widok: {
      P: 'X[x:74] Y[m1,y,x3,x1] Z[z] | kosz x@Y:74',
      K: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X',
      C: 'X[x:74] Y[m1,y,x3,x1] Z[z] | kosz x@Y:74',
    } },
    blob: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
    w4: { stan: 'd91b44938892', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@Y:74 | nagr X' },
  },
  'E4b-2w K←C,P←K': {
    zdarzenia: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    blob: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    w4: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
  },
  'E4b-2w C←P,C←K': {
    zdarzenia: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    blob: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
    w4: { stan: '237fa729b20d', widok: 'X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y' },
  },
  'kosz-przed K←C,P←K': {
    zdarzenia: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-przed C←P,C←K': {
    zdarzenia: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: '3f6e50e10e9e', widok: 'Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-po K←C,P←K': {
    zdarzenia: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-po C←P,C←K': {
    zdarzenia: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    blob: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
    w4: { stan: 'a1df206edb25', widok: 'Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X' },
  },
  'kosz-po-2 K←C,P←K': {
    zdarzenia: { stan: 'fc08869559cf', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      C: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr Y',
    } },
    blob: { stan: '57558de76997', widok: {
      P: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      K: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y',
      C: 'X[x:74] Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr Y',
    } },
    w4: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
  },
  'kosz-po-2 C←P,C←K': {
    zdarzenia: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
    blob: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
    w4: { stan: '74a2f084cfbf', widok: 'Z[m2,m1,z,y,x3,x1] | kosz x@X:74 | nagr X,Y' },
  },
  // Durable visits keep one canonical snapshot for each original visit after
  // merging cards: x3 (X), m1 (Y), m2 (Z), with their existing clinical data.
  'E4b-ret K←C,P←K': {
    zdarzenia: { stan: '2a8f046fea5a', widok: {
      P: 'Z[m2,m1,x3] | nagr Y',
      K: 'Z[m2,m1,x3] | nagr X,Y',
      C: 'Z[m2,m1,x3] | nagr X,Y',
    } },
    blob: { stan: '46f6f9a818ac', widok: 'Z[m2,m1,x3] | nagr X,Y' },
    w4: { stan: '46f6f9a818ac', widok: 'Z[m2,m1,x3] | nagr X,Y' },
  },
  'E4b-ret C←P,C←K': {
    zdarzenia: { stan: '08cb70e2ca6b', widok: {
      P: 'Z[m2,m1,x3] | nagr Y',
      K: 'Z[m2,m1,x3] | nagr X,Y',
      C: 'Z[m2,m1,x3] | nagr Y',
    } },
    blob: { stan: '46f6f9a818ac', widok: 'Z[m2,m1,x3] | nagr X,Y' },
    w4: { stan: '46f6f9a818ac', widok: 'Z[m2,m1,x3] | nagr X,Y' },
  },
  // npret-pin, npret-K (od E2-PR3c1: koperta nagrobka X niesie kartę docelową Y): po zdarzeniach przypięta x:23* jest
  // pod Y na P (w C←P,C←K także na C), K dostaje ją przy pełnej wymianie; po W4 stan = stan samych blobów.
  'npret-pin K←C,P←K': {
    zdarzenia: { stan: 'f7f6fb035a4f', widok: {
      P: 'Y[m3,y,x3,x:23*] Z[z] | nagr X',
      K: 'Y[m3,y,x3] Z[z] | nagr X',
      C: 'Y[m3,y,x3] Z[z] | nagr X',
    } },
    blob: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
    w4: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
  },
  // E2-PR3c2: K, który scalił X → Y, przyjmuje gwiazdkę x z ładunku P (karta X przegrana z nagrobkiem) — po samych
  // zdarzeniach x:23* na trzech, stan = stan samych blobów.
  'npret-pin C←P,C←K': {
    zdarzenia: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
    blob: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
    w4: { stan: '3e3ec48f354a', widok: 'Y[m3,y,x3,x:23*] Z[z] | nagr X' },
  },
  // x3 remains the canonical source visit; m2 belongs to the target visit.
  'npret-K K←C,P←K': {
    zdarzenia: { stan: 'ae685324abea', widok: {
      P: 'Y[m2,x3,x:23*] Z[z] | nagr X',
      K: 'Y[m2,x3] Z[z] | nagr X',
      C: 'Y[m2,x3] Z[z] | nagr X',
    } },
    blob: { stan: '39e4b7ca1a8d', widok: 'Y[m2,x3,x:23*] Z[z] | nagr X' },
    w4: { stan: '39e4b7ca1a8d', widok: 'Y[m2,x3,x:23*] Z[z] | nagr X' },
  },
  'npret-K C←P,C←K': {
    zdarzenia: { stan: 'b7dd020320e6', widok: {
      P: 'Y[m2,x3,x:23*] Z[z] | nagr X',
      K: 'Y[m2,x3] Z[z] | nagr X',
      C: 'Y[m2,x3,x:23*] Z[z] | nagr X',
    } },
    blob: { stan: '39e4b7ca1a8d', widok: 'Y[m2,x3,x:23*] Z[z] | nagr X' },
    w4: { stan: '39e4b7ca1a8d', widok: 'Y[m2,x3,x:23*] Z[z] | nagr X' },
  },
  'PRZ0-bez K←C,P←K': {
    zdarzenia: { stan: '2e54886e8b35', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:23',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
    } },
    blob: { stan: '15785883acf9', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
    } },
    w4: { stan: '15785883acf9', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
    } },
  },
  'PRZ0-bez C←P,C←K': {
    zdarzenia: { stan: 'cbdb1e39f79d', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:23',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[x:78] | kosz s1@X:20 kosz x@X:23',
    } },
    blob: { stan: '58bf51776fa1', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
    } },
    w4: { stan: '58bf51776fa1', widok: {
      P: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:78',
      C: 'X[x:78] | kosz s1@X:20 kosz x@X:78',
    } },
  },
  'E1-popr-C K←C,P←K': {
    zdarzenia: { stan: '8e16cf2e9c45', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    blob: { stan: '8e16cf2e9c45', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: '8e16cf2e9c45', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'E1-popr-C C←P,C←K': {
    zdarzenia: { stan: '16436912db6c', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:23',
    } },
    blob: { stan: 'f4fb47fc3636', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: 'f4fb47fc3636', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'E1-C K←C,P←K': {
    zdarzenia: { stan: '11d95182211b', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    blob: { stan: '11d95182211b', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: '11d95182211b', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'E1-C C←P,C←K': {
    zdarzenia: { stan: 'aed6ca2765b2', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:23',
    } },
    blob: { stan: '9af333a075dd', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
    w4: { stan: '9af333a075dd', widok: {
      P: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
      K: 'X[s1:20] | kosz s1@X:20 kosz x@X:74',
      C: 'X[x:74] | kosz s1@X:20 kosz x@X:74',
    } },
  },
  'Q8-obca-2 K←C,P←K': {
    zdarzenia: { stan: '9847adf3fe86', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    blob: { stan: '51df063264fa', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[y] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[y] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    w4: { stan: '78b542aa8125', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
  },
  'Q8-obca-2 C←P,C←K': {
    zdarzenia: { stan: '5dc38c0f5d3a', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    blob: { stan: '398ee2a60994', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[y] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
    w4: { stan: '8af2e8a1141a', widok: {
      P: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      K: 'Y[m1] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
      C: 'Y[x3] Z[z] | kosz m1@Y:18 kosz x@X:23 kosz x1@Y:20 kosz x3@X:25 kosz y@Y:18 | nagr X',
    } },
  },
  'PRZ K←C,P←K': {
    zdarzenia: { stan: 'a45d94f0f178', widok: 'X[x:78] | kosz s1@X:20' },
    blob: { stan: 'a45d94f0f178', widok: 'X[x:78] | kosz s1@X:20' },
    w4: { stan: 'a45d94f0f178', widok: 'X[x:78] | kosz s1@X:20' },
  },
  'PRZ C←P,C←K': {
    zdarzenia: { stan: 'd650cd56c4f2', widok: 'X[x:78] | kosz s1@X:20' },
    blob: { stan: 'd650cd56c4f2', widok: 'X[x:78] | kosz s1@X:20' },
    w4: { stan: 'd650cd56c4f2', widok: 'X[x:78] | kosz s1@X:20' },
  },
  // pin-scal, popr-scal (E2-PR3c1): po W4 x:23* albo x:74 na trzech, stan = stan samych blobów. Do E2-PR3c2 po
  // zdarzeniach gwiazdka albo poprawka x była pod Y na P (w C←P,C←K także na C), a K dostawał ją dopiero przy pełnej
  // wymianie; od E2-PR3c2 K przyjmuje ją z koperty karty X (przegranej tam z nagrobkiem scalenia) — po samych zdarzeniach
  // stan = stan samych blobów.
  'pin-scal K←C,P←K': {
    zdarzenia: { stan: 'a4de34c0476d', widok: 'Y[m2,y,x3,x:23*,x1] Z[z] | nagr X' },
    blob: { stan: 'a4de34c0476d', widok: 'Y[m2,y,x3,x:23*,x1] Z[z] | nagr X' },
    w4: { stan: 'a4de34c0476d', widok: 'Y[m2,y,x3,x:23*,x1] Z[z] | nagr X' },
  },
  'pin-scal C←P,C←K': {
    zdarzenia: { stan: 'a4de34c0476d', widok: 'Y[m2,y,x3,x:23*,x1] Z[z] | nagr X' },
    blob: { stan: 'a4de34c0476d', widok: 'Y[m2,y,x3,x:23*,x1] Z[z] | nagr X' },
    w4: { stan: 'a4de34c0476d', widok: 'Y[m2,y,x3,x:23*,x1] Z[z] | nagr X' },
  },
  'popr-scal K←C,P←K': {
    zdarzenia: { stan: 'fca0abee2385', widok: 'Y[m2,y,x3,x:74,x1] Z[z] | nagr X' },
    blob: { stan: 'fca0abee2385', widok: 'Y[m2,y,x3,x:74,x1] Z[z] | nagr X' },
    w4: { stan: 'fca0abee2385', widok: 'Y[m2,y,x3,x:74,x1] Z[z] | nagr X' },
  },
  'popr-scal C←P,C←K': {
    zdarzenia: { stan: 'fca0abee2385', widok: 'Y[m2,y,x3,x:74,x1] Z[z] | nagr X' },
    blob: { stan: 'fca0abee2385', widok: 'Y[m2,y,x3,x:74,x1] Z[z] | nagr X' },
    w4: { stan: 'fca0abee2385', widok: 'Y[m2,y,x3,x:74,x1] Z[z] | nagr X' },
  },
};
// „Zmiany zachowania” p. 5 (do akceptacji właściciela przed E2-PR6, jak P1e): przebiegi, w których stan po W4 ≠ stan
// samych blobów (pelnyStan; „widok” — gdy różni się też widok). Od E2-PR3c1 bez npret-pin i npret-K (obie kolejności):
// po W4 stan = stan samych blobów (koperta nagrobka X z kartą docelową Y); pin-scal i popr-scal — od początku bez zmiany.
const KAT_ZMIANY = [
  'kosz-po-2 K←C,P←K: widok',
  'Q8-obca-2 K←C,P←K: widok', // ZNANA RÓŻNICA (zdarzenia), KAT_ZMIANY_ZD
  'Q8-obca-2 C←P,C←K: widok', // ZNANA RÓŻNICA (zdarzenia), KAT_ZMIANY_ZD
];
// „Zmiany zachowania” z wyjątku Q8-obca-2 (Q8_ZDARZENIA; „ZNANA RÓŻNICA (zdarzenia)”, do decyzji właściciela: którą
// wizytę zostawić): po zdarzeniach i W4 na K (w K←C,P←K także na C) zostaje wizyta m1 karty Y (głowa „Scal pacjentów”,
// 18 kg, zapis t0+1 min), przy samych blobach — wizyta y (18 kg, t0−1 min); obie w Koszu, P w obu światach Y/x3 (nic nie
// ginie). Do akceptacji właściciela przed E2-PR6 razem z regułą wyboru pozostawionej wizyty (E2-PR3c1 tego nie zmienia).
// Test „zmiany zachowania” wymaga: przebiegi z różnicą tej klasy = ta lista i każdy jest na KAT_ZMIANY.
const KAT_ZMIANY_ZD = [
  'Q8-obca-2 K←C,P←K: na K i C wizyta Y/m1 zamiast Y/y (obie 18 kg)',
  'Q8-obca-2 C←P,C←K: na K wizyta Y/m1 zamiast Y/y (obie 18 kg)',
];
// E1-katalog w W4 p. 5 (zmierzone; specyfikacja 2a, 3.6): [przebieg] = różnice z klasą E1-katalog po W4 („para rodzaj
// encja: tylko <strona>” albo ścieżki), z dopiskiem, gdy wartość różnicy jest inna niż przy samych blobach (to trafia na
// listę „zmian zachowania”; chwile porównywane względem początku przebiegu). Przebieg spoza listy E1_KATALOG z różnicą
// o tej klasie — czerwień (W4).
const KAT_E1 = {
  'PRZ0-bez K←C,P←K': ['PK wersja X/x: tylko P', 'PK wersja X/s1: tylko K', 'CP wersja X/x: tylko P', 'CP wersja X/s1: tylko C'],
  'PRZ0-bez C←P,C←K': ['PK wersja X/x: tylko P', 'PK wersja X/s1: tylko K', 'KC wersja X/x: tylko C', 'KC wersja X/s1: tylko K'],
  'E1-popr-C K←C,P←K': ['PK wersja X/s1: tylko K', 'PK wersja X/x: tylko P', 'CP wersja X/s1: tylko C', 'CP wersja X/x: tylko P'],
  'E1-popr-C C←P,C←K': ['PK wersja X/s1: tylko K', 'PK wersja X/x: tylko P', 'KC wersja X/s1: tylko K', 'KC wersja X/x: tylko C'],
  'E1-C K←C,P←K': ['PK wersja X/x: tylko P', 'PK wersja X/s1: tylko K', 'CP wersja X/x: tylko P', 'CP wersja X/s1: tylko C'],
  'E1-C C←P,C←K': ['PK wersja X/s1: tylko K', 'PK wersja X/x: tylko P', 'KC wersja X/s1: tylko K', 'KC wersja X/x: tylko C'],
  'Q8-obca-2 K←C,P←K': [
    'PK karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'PK wersja Y/x3: tylko P',
    'CP karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'CP wersja Y/x3: tylko P',
  ],
  'Q8-obca-2 C←P,C←K': [
    'PK karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'PK wersja Y/x3: tylko P',
    'KC karta Y: header.dobISO, header.firstName, header.lastName, header.name', 'KC wersja Y/x3: tylko C',
  ],
};
// Przebiegi p. 5 ze znaną utratą albo znaną różnicą (specyfikacja 2a, 3.4 i 3.6): prefiks nazwy testu i pozycja planu
// albo decyzja, która ją rozstrzygnie. Naprawa przed E2-PR6 przepisze literał na wynik bez utraty (bez różnicy;
// Q8_ZDARZENIA — lista pusta). npret-pin i npret-K — „ZNANA UTRATA” naprawiona w E2-PR3c1 (literały wyżej, poza listą).
const KAT_ZNANE = {
  'Q8-obca-2': 'ZNANA RÓŻNICA (zdarzenia; do decyzji właściciela: którą wizytę zostawić) — po zdarzeniach P→K na K zostaje inna z dwóch wizyt 18 kg karty Y (m1 zamiast y), W4 tego nie zmienia',
};
// Wyrocznia „nie zginęła ostatnia zmiana” w p. 5 (zmierzone; charakterystyka dzisiejszego stanu): [przebieg] = zbiór
// „klasa | świat” naruszeń po samych zdarzeniach (W1), po W4 i w świecie samych blobów; przebieg spoza listy — bez
// naruszeń. Naprawa (E3-PR0 i osobny PR etapu E3-PR0 dla starej karty po „Scal pacjentów”) przepisuje ten literał.
// Q8-obca-2 (decyzja właściciela 3a z 2026-11-15) — klasy z mechanizmu: P5 (wpisy Kosza pod starą kartą X) i E1
// (obecność) (ostatnia wersja karty Y), bez osobnej klasy przebiegu.
const KAT_WYR = {
  'E4b-1 K←C,P←K': ['E4b (stara karta po „Scal pacjentów”) | W1'],
  'E4b-1 C←P,C←K': ['E4b (stara karta po „Scal pacjentów”) | W1'],
  'kosz-przed K←C,P←K': ['P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
  'kosz-przed C←P,C←K': ['P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
  'kosz-po K←C,P←K': ['P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
  'kosz-po C←P,C←K': ['P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
  'kosz-po-2 K←C,P←K': ['P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby', 'kosz-po-2 (stara karta z ostatnią wersją przy samych blobach) | bloby'],
  'kosz-po-2 C←P,C←K': ['P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
  'npret-pin K←C,P←K': ['npret (przypięta wizyta przeżywa przycięcie) | W1'],
  'npret-K K←C,P←K': ['npret (przypięta wizyta przeżywa przycięcie) | W1'],
  'npret-K C←P,C←K': ['npret (przypięta wizyta przeżywa przycięcie) | W1'],
  'PRZ0-bez K←C,P←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby'],
  'PRZ0-bez C←P,C←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby'],
  'E1-popr-C K←C,P←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby'],
  'E1-popr-C C←P,C←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby'],
  'E1-C K←C,P←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby'],
  'E1-C C←P,C←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby'],
  'Q8-obca-2 K←C,P←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
  'Q8-obca-2 C←P,C←K': ['E1 (obecność) | W1', 'E1 (obecność) | W4', 'E1 (obecność) | bloby', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W1', 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4', 'P5 (Kosz pod kartą usuniętą po scaleniu) | bloby'],
};
const KAT_WYNIKI = {};
describe('A ≡ B, blok deterministyczny p. 5: katalog kosza (zdarzenia wobec blobu, W4)', () => {
  d1();
  for (const [i, nazwa] of KAT_LISTA.entries()) {
    for (const [j, kol] of KAT_KOL.entries()) {
      const kl = `${nazwa} ${kol}`;
      it(`${KAT_ZNANE[nazwa] ? KAT_ZNANE[nazwa] + ': ' : ''}${kl}: literał zdarzeń, blobu i W4; W4 bez różnic${E1_KATALOG.has(nazwa) ? ' poza E1-katalog' : ''}${Q8_ZDARZENIA[kl] ? ' i kluczami Q8_ZDARZENIA (ZNANA RÓŻNICA (zdarzenia), do decyzji właściciela: którą wizytę zostawić)' : ''}`, async () => {
        const ziarno = 5000 + i * 10 + j;
        const klucz = kl;
        const zd = await przebiegKat(nazwa, kol, 'zdarzenia', ziarno);
        const bl = await przebiegKat(nazwa, kol, 'blob', ziarno);
        const t0 = { zd: zd.t0, bl: bl.t0 };
        const w4 = await klasyW4Kat(zd.w4, bl.pary, nazwa, zd.etyk, t0, { klucz });
        const wynik = { zdarzenia: { widok: zd.widok, stan: zd.stan }, blob: { widok: bl.widok, stan: bl.stan }, w4: { widok: zd.w4.widok, stan: zd.w4.stan } };
        const zmiana = zd.w4.stan === bl.stan ? null : JSON.stringify(zd.w4.widok) === JSON.stringify(bl.widok) ? 'pelnyStan' : 'widok';
        KAT_WYNIKI[klucz] = { ...wynik, zmiana, e1: w4.e1, zd: w4.zd };
        if (process.env.E2_AB_P5) appendFileSync(process.env.E2_AB_P5, JSON.stringify({ klucz, ...wynik, zmiana, e1: w4.e1, zdZnane: w4.zd, w4ok: w4.ok, w4pary: w4.pary, blobPary: Object.fromEntries(Object.entries(bl.pary).map(([k, d]) => [k, d.map(skrotRoznicy)])), zd: { ...zd, pelny: undefined, wyr: undefined, wyrW4: undefined, w4: { ...zd.w4, pelny: undefined, pary: undefined } }, pelny: { zdarzenia: zd.pelny, blob: bl.pelny, w4: zd.w4.pelny }, wyrocznia: zbiorWyr([...zd.wyr, ...zd.wyrW4, ...bl.wyr]) }) + '\n');
        expect({ warunki: [zd.warunkiBledne, bl.warunkiBledne], oczekujace: zd.oczekujace, braki: zd.braki }, 'warunki kroków katalogu, kolejki dostarczone, nośnik').toEqual({ warunki: [false, false], oczekujace: false, braki: 0 });
        // Wyrocznia „nie zginęła ostatnia zmiana”: po zdarzeniach (W1), po W4 i w świecie samych blobów — każde naruszenie
        // z klasą z tabeli wyjątków (w świecie z listy klasy), a zbiór (klasa, świat) = literał KAT_WYR. Asercje miękkie
        // (expect.soft) przed literałami: komunikat CI ma i literał, i werdykt wyroczni.
        const wyrP5 = [...zd.wyr, ...zd.wyrW4, ...bl.wyr];
        expect.soft(wyrCzerwone(wyrP5), `wyrocznia p. 5 (${klucz}): naruszenia bez klasy z tabeli wyjątków`).toEqual([]);
        expect.soft(zbiorWyr(wyrP5), `wyrocznia p. 5 (${klucz}): zbiór (klasa, świat)`).toEqual(KAT_WYR[klucz] || []);
        expect.soft(wynik, `literał p. 5: ${klucz}`).toEqual(KAT_LITERALY[klucz]);
        expect(w4.e1, `E1-katalog po W4 (${klucz})`).toEqual(KAT_E1[klucz] || []);
        expect(w4.zd, `ZNANA RÓŻNICA (zdarzenia) po W4 (${klucz}): dokładnie klucze Q8_ZDARZENIA`).toEqual(Q8_ZDARZENIA[klucz] || []);
        expect(w4.ok, `W4 (${klucz}): różnice po pełnej wymianie\n${JSON.stringify(w4.pary, null, 1)}`).toBe(true);
        if (SCISLE) {
          // Tryb ścisły (decyzja 3a): widok po samych zdarzeniach = widok po W4; wyrocznia — w W1 żadnego naruszenia,
          // którego nie ma też po W4 albo w świecie samych blobów.
          // Widok p. 5 zawiera też listę nagrobków pacjentów („| nagr …”): różnica tylko w niej (karty i Kosz równe) to
          // osobna przyczyna „tylko nagrobki pacjentów” (czy ją dopuścić jak R2, R4n i D7 — decyzja właściciela).
          const poza = new Set([...zd.wyrW4, ...bl.wyr].map(WYR.kluczNaruszenia));
          // widok: napis (ten sam na trzech urządzeniach) albo { P, K, C } — porównanie po urządzeniach
          const bezNagr = (w) => JSON.stringify(KAT_URZ.map((n) => (typeof w === 'string' ? w : w[n]).replace(/ \| nagr .*$/, '')));
          const rownyWidok = JSON.stringify(zd.widok) === JSON.stringify(zd.w4.widok);
          const scisle = [
            ...(rownyWidok ? [] : bezNagr(zd.widok) === bezNagr(zd.w4.widok) ? [{ przyczyna: 'tylko nagrobki pacjentów: widok po zdarzeniach ≠ widok po W4', klasa: null }]
              : [{ przyczyna: 'widok po zdarzeniach ≠ widok po W4', klasa: KAT_E1[klucz] ? E1 : Q8_ZDARZENIA[klucz] ? ZR_ZD : null }]),
            ...zd.wyr.filter((x) => !poza.has(WYR.kluczNaruszenia(x))).map((x) => ({ przyczyna: 'wyrocznia: W1 poza W4 i blobami', klasa: x.klasa, et: `${x.urz} ${x.encja} ${x.et} ${x.rodzaj}` })),
          ];
          if (WYR_PLIK && scisle.length) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'scisle', swiat: `p5 ${klucz}`, scisle }) + '\n');
          expect(scisle, `tryb ścisły p. 5 (${klucz})\nzdarzenia: ${JSON.stringify(zd.widok)}\nW4: ${JSON.stringify(zd.w4.widok)}`).toEqual([]);
        }
        if (w4.e1.length) {
          // Negatyw (3.6): te same różnice w przebiegu spoza listy E1_KATALOG (lista podmieniona) — W4 czerwone.
          const poza = await klasyW4Kat(zd.w4, bl.pary, '(przebieg spoza E1_KATALOG)', zd.etyk, t0, { klucz });
          expect(poza.ok, `E1-katalog poza listą E1_KATALOG nie jest dozwolone (${klucz})`).toBe(false);
        }
        if (w4.zd.length) {
          // Negatywy wyjątku Q8-obca-2 (3.6): ta sama klasyfikacja W4 jest czerwona, gdy (1) przebieg nie ma wpisu
          // Q8_ZDARZENIA, (2) przebieg z drugą kolejnością (jej literał), (3) literał podmieniony (inna strona, inna wersja),
          // (4) literał z dodatkowym kluczem, którego różnicy nie ma („brak tej różnicy”), (5) literał bez jednego klucza.
          const lit = Q8_ZDARZENIA[klucz];
          const inna = Object.keys(Q8_ZDARZENIA).find((k) => k !== klucz);
          const negatywy = {
            'przebieg spoza Q8_ZDARZENIA': { klucz: '(przebieg spoza Q8_ZDARZENIA)' },
            [`klucz drugiej kolejności (${inna})`]: { klucz: inna },
            'literał: inna strona pierwszego klucza': { klucz, znaneZd: [[lit[0][0], lit[0][1], lit[0][2].replace(/:(.)$/, (_, s) => ':' + (s === 'P' ? 'K' : 'P'))], ...lit.slice(1)] },
            'literał: wersja Y/y zamiast Y/m1': { klucz, znaneZd: lit.map(([k, r, s]) => [k.replace('/m1', '/y'), r, s]) },
            'literał z dodatkowym kluczem (brak różnicy)': { klucz, znaneZd: [...lit, ['Y/y', 'wersja', 'PK:K']] },
            'literał bez jednego klucza': { klucz, znaneZd: lit.slice(1) },
          };
          const wyniki = {};
          for (const [opis, o] of Object.entries(negatywy)) wyniki[opis] = (await klasyW4Kat(zd.w4, bl.pary, nazwa, zd.etyk, t0, o)).ok;
          expect(wyniki, `ZNANA RÓŻNICA (zdarzenia) tylko dokładnie z literałem Q8_ZDARZENIA tego przebiegu (${klucz})`).toEqual(Object.fromEntries(Object.keys(negatywy).map((k) => [k, false])));
        }
      }, 120_000);
    }
  }
  it('klasa E1-katalog: dozwolona tylko w W4 p. 5 i tylko w przebiegach z listy E1_KATALOG (tabela dozwolonych, 3.6)', () => {
    const r = { rodzaj: 'wersja', klucz: 'X/x', a: { snapshotId: 'x' }, b: null, tylko: 'x', sciezki: ['(obecność)'] };
    const X = { patients: [] }, Y = { patients: [] };
    expect(klasa(r, X, Y, {}), 'bez D ścieżki blobów — brak klasy').toBe(null);
    expect(klasa(r, X, Y, { e1Bloby: new Set(['wersja X/y']) }), 'inny klucz w D ścieżki blobów — brak klasy').toBe(null);
    expect(klasa(r, X, Y, { e1Bloby: new Set(['wersja X/x']) }), 'ten sam klucz w D ścieżki blobów').toBe(E1);
    expect([...E1_KATALOG].sort(), 'lista E1_KATALOG (3.6)').toEqual(['E1-C', 'E1-popr-C', 'PRZ0-bez', 'Q8-obca-2']);
    const tak = [];
    for (const tabela of Object.keys(DOZWOLONE)) {
      for (const przebieg of [...KAT_LISTA, '(przebieg spoza E1_KATALOG)']) if (dozwolona(E1, r, { tabela, przebieg })) tak.push(`${tabela} ${przebieg}`);
    }
    expect(tak.sort(), 'E1-katalog dozwolona wyłącznie w W4:p5 dla przebiegów z listy').toEqual([...E1_KATALOG].sort().map((n) => `W4:p5 ${n}`));
  });
  it('ZNANA RÓŻNICA (zdarzenia) (wyjątek Q8-obca-2, do decyzji właściciela: którą wizytę zostawić): tylko W4 p. 5, tylko dokładnie klucze Q8_ZDARZENIA (literał i negatywy)', async () => {
    expect(Q8_ZDARZENIA, 'literał Q8_ZDARZENIA (3.6, wyjątek Q8-obca-2)').toEqual({
      'Q8-obca-2 K←C,P←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'CP:C']],
      'Q8-obca-2 C←P,C←K': [['Y/m1', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'KC:K']],
    });
    // Poza klasyW4Kat klasa nie jest dozwolona w żadnej tabeli (DOZWOLONE wspólne z profilami — bez wpisu).
    const r0 = { rodzaj: 'wersja', klucz: 'Y/m1', a: null, b: { snapshotId: 'm1' }, tylko: 'y', sciezki: ['(obecność)'] };
    const tak = [];
    for (const tabela of Object.keys(DOZWOLONE)) for (const przebieg of KAT_LISTA) if (dozwolona(ZR_ZD, r0, { tabela, przebieg })) tak.push(`${tabela} ${przebieg}`);
    expect(tak, 'dozwolona(ZR_ZD) w tabelach DOZWOLONE').toEqual([]);
    // Syntetyczne W4 (etykieta = klucz): para (P, K) — m1 tylko na K, para (C, P) — m1 tylko na C; bez D blobów.
    const pusty = { patients: [] };
    const roz = (tylko, klucz = 'Y/m1', rodzaj = 'wersja') => ({ rodzaj, klucz, a: tylko === 'x' ? { snapshotId: 'm' } : null, b: tylko === 'y' ? { snapshotId: 'm' } : null, tylko, sciezki: ['(obecność)'] });
    const w4 = (pk, cp) => ({ stabilny: true, pary: [{ para: 'PK', a: pusty, b: pusty, d: pk }, { para: 'KC', a: pusty, b: pusty, d: [] }, { para: 'CP', a: pusty, b: pusty, d: cp }] });
    const kl = 'Q8-obca-2 K←C,P←K';
    const ok = async (w, o) => { const x = await klasyW4Kat(w, {}, 'Q8-obca-2', (r) => r.klucz, undefined, o); return [x.ok, x.zd]; };
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: kl }), 'dokładnie literał — zieleń').toEqual([true, Q8_ZDARZENIA[kl]]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: '(przebieg spoza Q8_ZDARZENIA)' }), 'inny przebieg — czerwień').toEqual([false, []]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: 'Q8-obca-2 C←P,C←K' }), 'literał drugiej kolejności — czerwień').toEqual([false, [['Y/m1', 'wersja', 'PK:K']]]);
    expect(await ok(w4([roz('y')], []), { klucz: kl }), 'brak różnicy CP:C — czerwień').toEqual([false, [['Y/m1', 'wersja', 'PK:K']]]);
    expect(await ok(w4([roz('x')], [roz('x')]), { klucz: kl }), 'inna strona (tylko P) — czerwień').toEqual([false, [['Y/m1', 'wersja', 'CP:C']]]);
    expect(await ok(w4([roz('y'), roz('y', 'Y/y')], [roz('x')]), { klucz: kl }), 'dodatkowa różnica bez klasy — czerwień').toEqual([false, Q8_ZDARZENIA[kl]]);
    expect(await ok(w4([roz('y', 'Y/m1', 'kosz')], [roz('x')]), { klucz: kl }), 'inny rodzaj encji — czerwień').toEqual([false, [['Y/m1', 'wersja', 'CP:C']]]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: kl, znaneZd: [['Y/y', 'wersja', 'PK:K'], ['Y/m1', 'wersja', 'CP:C']] }), 'literał podmieniony — czerwień').toEqual([false, [['Y/m1', 'wersja', 'CP:C']]]);
    expect(await ok(w4([roz('y')], [roz('x')]), { klucz: kl, znaneZd: [...Q8_ZDARZENIA[kl], ['Y/m1', 'wersja', 'KC:K']] }), 'klucz spoza Q8_ZDARZENIA w literale — czerwień').toEqual([false, Q8_ZDARZENIA[kl]]);
    // dozwolenie zawsze wobec Q8_ZDARZENIA[klucz]: literał rozszerzony o klucz, którego różnica JEST — nadal czerwień
    const x = await klasyW4Kat(w4([roz('y'), roz('y', 'Y/y')], [roz('x')]), {}, 'Q8-obca-2', (r) => r.klucz, undefined, { klucz: kl, znaneZd: [...Q8_ZDARZENIA[kl], ['Y/y', 'wersja', 'PK:K']] });
    expect([x.ok, x.pary[0].roznice.map((r) => [r.klucz, r.klasa, r.dozwolona])], 'klucz spoza Q8_ZDARZENIA z różnicą — klasa, ale niedozwolona').toEqual([false, [['Y/m1', ZR_ZD, 'tak'], ['Y/y', ZR_ZD, false]]]);
  });
  it('zmiany zachowania wobec świata samych blobów (stan po W4 ≠ blob) — do akceptacji właściciela przed E2-PR6', (ctx) => {
    // filtr -t albo czerwone przebiegi: bez kompletu wyników test jest POMINIĘTY (nie zielony bez asercji; U5 weryfikacji)
    if (Object.keys(KAT_WYNIKI).length !== KAT_LISTA.length * KAT_KOL.length) { ctx.skip(); return; }
    const zmiany = Object.entries(KAT_WYNIKI).filter(([, w]) => w.zmiana).map(([k, w]) => `${k}: ${w.zmiana}`);
    // E1-katalog z inną wartością niż przy samych blobach (3.6) — każdy taki przebieg jest na liście zmian zachowania.
    const e1Inne = Object.entries(KAT_WYNIKI).filter(([, w]) => (w.e1 || []).some((x) => / — inna wartość /.test(x))).map(([k]) => k);
    // ZNANA RÓŻNICA (zdarzenia) (wyjątek Q8-obca-2, Q8_ZDARZENIA) — przebiegi z tą klasą = KAT_ZMIANY_ZD, każdy na KAT_ZMIANY.
    const zdZnane = Object.entries(KAT_WYNIKI).filter(([, w]) => (w.zd || []).length).map(([k]) => k);
    console.log('E2-AB p. 5 zmiany zachowania', JSON.stringify({ zmiany, e1Inne, zdZnane, KAT_ZMIANY_ZD }));
    expect(zmiany).toEqual(KAT_ZMIANY);
    expect(e1Inne.filter((k) => !KAT_ZMIANY.some((z) => z.startsWith(k + ':'))), 'E1-katalog z inną wartością niż bloby — na liście zmian zachowania').toEqual([]);
    expect(zdZnane, 'przebiegi z ZNANA RÓŻNICA (zdarzenia) = KAT_ZMIANY_ZD').toEqual(KAT_ZMIANY_ZD.map((z) => z.slice(0, z.indexOf(':'))));
    expect(zdZnane.filter((k) => !KAT_ZMIANY.some((z) => z.startsWith(k + ':'))), 'ZNANA RÓŻNICA (zdarzenia) — na liście zmian zachowania').toEqual([]);
  });
});

// ── p. 6: znane klasy i dalsze ciągi (minimalne odtworzenia analizy 2a; specyfikacja 2a, 3.4) ─────────────────────────
// Źródło: minimalne odtworzenia z analizy E2-PR2a (dane fikcyjne). Dla każdego
// scenariusza trzy literały: (1) klasy i ścieżki D(A, B) po spoczynku zdarzeń; (2) wynik W4 (stan kliniczny: które
// wizyty, gdzie, jaka treść); (3) świat samych blobów (te same kroki): D = ∅, z wyjątkiem R3-E1 (createdAtISO notatki
// różni się także przy samych blobach — klasa dzisiejsza) i dwóch scenariuszy „notatka pod inną kartą” (klasa dzisiejsza
// z pomiaru: TA SAMA różnica co po zdarzeniach i po W4, ze skutkiem klinicznym — pod którą kartą leży notatka, jaka
// treść, czy widać ją w karcie). Naprawa w E2-PR3c albo E3-PR0 ZMIENIA te literały — to zamierzone: PR naprawy przepisuje
// je na wynik zgodny. K6 (E2-PR3a3) ma czwarty literał: stan kliniczny świata samych blobów (blobyKlinicznie), bo różnica
// jest widoczna tylko w stanie klinicznym; od E2-PR3c1 test sprawdza też wprost, że W4 K6 = blobyKlinicznie. E2-PR3c1
// (koperta nagrobka karty z kartą docelową „Scal pacjentów”) przepisał literały K6, R2-E3 i skrzyżowanego „Scal
// pacjentów” (notatka karty P).
async function p6r2(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const { patientId: P, snapshotId: v } = await A.d.zapiszKarte(1, { masa: 20 });
  const Q = [];
  for (let i = 2; i <= 14 && !(Q.some((q) => q > P) && Q.some((q) => q < P)); i += 1) { krok(); Q.push((await A.d.zapiszKarte(i, { masa: 20 + i })).patientId); }
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  const wieksza = Q.filter((q) => q > P).sort()[0];
  const n = new Map([[P, 'P'], [v, 'v'], [wieksza, 'Q']]);
  Q.forEach((q, i) => { if (!n.has(q)) n.set(q, 'K' + (i + 2)); });
  return { S, A, B, P, v, Q: wieksza, n };
}
// K6: A — karta P z wizytą v (20 kg) i karta Q z wizytą q (30 kg); B — bliźniak A.
async function p6k6(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const { patientId: P, snapshotId: v } = await A.d.zapiszKarte(1, { masa: 20 });
  krok(); const { patientId: Q, snapshotId: q } = await A.d.zapiszKarte(2, { masa: 30 });
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, P, Q, v, n: new Map([[P, 'P'], [Q, 'Q'], [v, 'v'], [q, 'q']]) };
}
async function p6r3(S) {
  const A = await urzadzenie(S, 'A');
  krok(); const { patientId: P } = await A.d.zapiszKarte(1);
  krok(); const Q = (await A.d.zapiszKarte(2)).patientId;
  krok(); const nId = (await A.v.savePatientNote({ patientId: P, title: 'Fikcyjna', body: 'Fikcyjna treść', category: 'inne' })).id;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, P, Q, nId, n: new Map([[P, 'P'], [Q, 'Q'], [nId, 'n']]) };
}
async function p6r4(S, { zC = false } = {}) {
  const A = await urzadzenie(S, 'A');
  krok(); const r1 = await A.d.zapiszKarte(1, { wzrost: 120, masa: 20 });
  krok(); const r2 = await A.d.zapiszKarte(1, { wzrost: 125, masa: 21, zapis: { patientId: r1.patientId, forceNewSnapshot: true } });
  krok(); const Q = (await A.d.zapiszKarte(2, { masa: 30 })).patientId;
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  const C = zC ? await urzadzenie(S, 'C', A) : null; // C: kopia sprzed kosza (R5-E1)
  return { S, A, B, C, P: r1.patientId, Q, v: r1.snapshotId, w: r2.snapshotId, n: new Map([[r1.patientId, 'P'], [Q, 'Q'], [r1.snapshotId, 'v'], [r2.snapshotId, 'w']]) };
}
// Karta P z dwiema wizytami o jawnych identyfikatorach (fikcyjne): v — jedyny stan wizyty V1, w — wizyty V2.
async function p6wizyty(S) {
  const A = await urzadzenie(S, 'A');
  const wiz = (id) => ({ version: 1, visitId: id, patientId: null, clinicalDateISO: '2026-03-02', createdAtISO: new Date(Date.now()).toISOString(), origin: 'explicit' });
  krok(); const r1 = await A.v.savePatient({ ...naglowek(1, { masa: 20 }), visit: wiz('fac0a000-0000-4000-8000-00000000a0e1') }, { dedup: false });
  krok(); const r2 = await A.v.savePatient({ ...naglowek(1, { wzrost: 125, masa: 21 }), visit: wiz('fac0a000-0000-4000-8000-00000000a0e2') }, { dedup: false, patientId: r1.patientId, forceNewSnapshot: true });
  krok(); ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  return { S, A, B, P: r1.patientId, v: r1.snapshotId, w: r2.snapshotId, n: new Map([[r1.patientId, 'P'], [r1.snapshotId, 'v'], [r2.snapshotId, 'w']]) };
}
async function p6gwiazdka(u, U, sid, tak) { krok(60e3); await mutacja(u.S, U, tak ? 'gwiazdka' : 'odpięcie', () => U.v.setSnapshotPinned(gdzie(U, sid).patientId, sid, tak)); }
async function p6usunPacjenta(u, U, pid) { krok(60e3); await mutacja(u.S, U, 'usuń pacjenta', () => U.v.removePatient(pid)); }
async function p6przywroc(u, U, sid) {
  krok(60e3);
  const e = (await U.v.listTrashedSnapshots()).find((x) => x.snapshotId === sid);
  await mutacja(u.S, U, 'przywróć', () => U.v.restoreTrashedSnapshot(e.patientId, sid));
}
const p6notatka = async (u, U, tresc) => { krok(60e3); await mutacja(u.S, U, `notatka „${tresc}”`, () => U.v.savePatientNote({ id: u.nId, patientId: u.P, title: 'Fikcyjna', body: tresc, category: 'inne' })); };
const p6usunNotatke = async (u, U) => { krok(60e3); await mutacja(u.S, U, 'usuń notatkę', () => U.v.removePatientNote(u.nId)); };
// Wymiana zależna od świata: zdarzenia (pełne dostawy FIFO z hakami, spoczynek) albo same bloby (rundy PO-A).
const p6spoczynek = async (u, tryb) => (tryb === 'zdarzenia' ? spoczynek(u.S, u.A, u.B, { w2s: false }) : spoczynekBlobow(u.A, u.B));
const p6dostawa = async (u, X, Y, tryb) => {
  if (tryb === 'zdarzenia') return dostawa(u.S, X, Y, { w2s: false });
  await Y.v.mergeSyncPayload(json(await X.v.exportSyncPayload())); ustawStan(Y, await eksport(Y));
  return null;
};
const p6blob = async (X, Y) => { await Y.v.mergeSyncPayload(json(await X.v.exportSyncPayload())); ustawStan(Y, await eksport(Y)); };
const P6 = {
  'R2-0': { baza: p6r2, kroki: async (u, t) => { await p6gwiazdka(u, u.B, u.v, true); await popraw(u, u.B, u.v, 27); await popraw(u, u.A, u.v, 30); await p6spoczynek(u, t); } },
  'R3-0': { baza: p6r3, kroki: async (u, t) => { await p6notatka(u, u.A, 'Fikcyjna treść 2'); await p6usunPacjenta(u, u.B, u.P); await p6spoczynek(u, t); } },
  'R4-a': { baza: p6r4, kroki: async (u, t) => { await p6gwiazdka(u, u.A, u.v, true); await p6usunPacjenta(u, u.A, u.P); await doKosza(u, u.B, u.v); await p6spoczynek(u, t); } },
  'R4-a′': { baza: p6r4, kroki: async (u, t) => { await popraw(u, u.A, u.v, 40); await p6usunPacjenta(u, u.A, u.P); await doKosza(u, u.B, u.v); await p6spoczynek(u, t); } },
  'R4n (R4-b)': { baza: p6r4, kroki: async (u, t) => { await p6gwiazdka(u, u.A, u.v, true); await popraw(u, u.B, u.v, 42.6); await doKosza(u, u.A, u.v); await p6spoczynek(u, t); } },
  'R5-0': { baza: p6r4, kroki: async (u, t) => {
    await doKosza(u, u.B, u.v); krok(); await p6dostawa(u, u.B, u.A, t);
    await p6przywroc(u, u.B, u.v); await p6usunPacjenta(u, u.A, u.P); await p6spoczynek(u, t);
  } },
  // Dalsze ciągi (prefiks i pozycja planu, która ma je naprawić). R2-E3 — od E2-PR3c1 bez różnicy (koperta nagrobka P
  // niesie kartę docelową Q, więc wersja v z gwiazdką i 30 kg jest pod Q na obu już po zdarzeniach).
  'R2-E3': { baza: p6r2, kroki: async (u, t) => {
    await p6gwiazdka(u, u.B, u.v, true); await popraw(u, u.B, u.v, 27); await popraw(u, u.A, u.v, 30); await p6spoczynek(u, t);
    await scal(u, u.A, u.P, u.Q); await p6spoczynek(u, t); // A (niższa rev) „Scal pacjentów” P → Q, id Q > id P
  } },
  'R5-E1': { znana: 'ZNANA RÓŻNICA (naprawa: E3-PR0)', baza: (S) => p6r4(S, { zC: true }), kroki: async (u, t) => {
    await doKosza(u, u.B, u.v); krok(); await p6dostawa(u, u.B, u.A, t);
    await p6przywroc(u, u.B, u.v); await p6usunPacjenta(u, u.A, u.P); await p6spoczynek(u, t);
    // trzecie urządzenie C (kopia sprzed kosza) zapisuje nową wizytę P i wysyła blob (etap 2)
    krok(60e3); await mutacja(u.S, u.C, 'C: nowa wizyta P', () => u.C.d.zapiszKarte(1, { wzrost: 130, masa: 25, zapis: { patientId: u.P, forceNewSnapshot: true } }));
    await p6blob(u.C, u.A); await p6blob(u.C, u.B);
  } },
  // R3-E1, R3-E2: do E2-PR3c3 „ZNANA UTRATA” (nagrobek notatki bez rev wersji z ładunku — wygrywał wcześniejszy tekst
  // wskrzeszenia albo wracała stara, skasowana treść); od E2-PR3c3 bez utraty i bez różnicy chwili utworzenia.
  'R3-E1': { baza: p6r3, kroki: async (u, t) => {
    await p6notatka(u, u.A, 'A2'); await p6notatka(u, u.A, 'A3'); await p6usunNotatke(u, u.B); await p6spoczynek(u, t);
    // „Zostaw notatkę” (P5) na obu: A wcześniej, B później
    await p6notatka(u, u.A, 'wskrzeszona na A (wcześniej)'); await p6notatka(u, u.B, 'wskrzeszona na B (później)'); await p6spoczynek(u, t);
  } },
  'R3-E2': { baza: p6r3, kroki: async (u, t) => {
    await p6notatka(u, u.A, 'A2'); await p6notatka(u, u.A, 'A3');
    krok(); ustawStan(u.A, await eksport(u.A));
    u.C = await urzadzenie(u.S, 'C', u.A); // C: kopia A z „A3” (rev 3), poza siecią
    await p6usunNotatke(u, u.B); await p6spoczynek(u, t);
    await p6notatka(u, u.B, 'wskrzeszona na B'); await p6spoczynek(u, t);
    // C wraca: scala blob B, potem blob A; A i B scalają blob C (pełna wysyłka etapu 2)
    krok(60e3); await p6blob(u.B, u.C); await p6blob(u.A, u.C); await p6blob(u.C, u.A); await p6blob(u.C, u.B);
  } },
  // „Notatka pod inną kartą” (2026-11-03; do E2-PR3c4 „ZNANA RÓŻNICA (dzisiejsza)”): zdarzenia, W4 i same bloby dawały
  // TĘ SAMĄ różnicę (patientId notatki n) — robiła ją reguła P-NOTATKI-1 (G5) scalania, nie dziennik zdarzeń. Od
  // E2-PR3c4 (decyzja 6 właściciela z 2026-11-10) notatka idzie za kartą, która istnieje — bez różnicy we wszystkich
  // trzech światach.
  'Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)': { notatki: true, baza: p6r3, kroki: async (u, t) => {
    await scal(u, u.A, u.P, u.Q); await p6notatka(u, u.B, 'edycja B'); await p6spoczynek(u, t);
  } },
  'skrzyżowane Scal pacjentów (A: P → Q, B: Q → P), notatka karty P': { notatki: true, baza: p6r3, kroki: async (u, t) => {
    await scal(u, u.A, u.P, u.Q); await scal(u, u.B, u.Q, u.P); await p6spoczynek(u, t);
  } },
  // K6 (decyzja 12.3; do E2-PR3c5 ostatni scenariusz — ziarno scenariusza to jego pozycja, więc nowe scenariusze idą na koniec):
  // B poprawia wizytę v karty P na 27 kg, A bez wiedzy o poprawce „Scal pacjentów” P → Q. Do E2-PR3c1 po zdarzeniach
  // i pełnej wymianie (W4) v miała 20 kg na obu urządzeniach (poprawka ginęła). Od E2-PR3c1 (koperta nagrobka P z kartą
  // docelową Q) po W4 v ma 27 kg na obu — W4 = stan kliniczny świata samych blobów (blobyKlinicznie; samo D blobów jest
  // puste). Od E2-PR3c2 (A przyjmuje poprawkę z koperty karty P, przegranej tam z nagrobkiem scalenia) bez różnicy także
  // po samych zdarzeniach (dotąd A: 20 kg, B: 27 kg do pełnej wymiany).
  'K6': { klinicznieBloby: true, baza: p6k6, kroki: async (u, t) => {
    await popraw(u, u.B, u.v, 27); await scal(u, u.A, u.P, u.Q); await p6spoczynek(u, t);
  } },
  // E2-PR3c5 (decyzja 7 z 2026-11-10): B daje wizytę v do Kosza i ją przywraca; A — bez wiedzy o obu — przycina v
  // porządkowaniem, potem „Scal pacjentów” P → Q. Zdarzenia B dochodzą do A po scaleniu: wpis Kosza z chwili kosza
  // i wersja v przywrócona pod kartą P (przegraną tu z nagrobkiem).
  'Kosz i Przywróć na B, porządkowanie i Scal pacjentów P → Q na A': { baza: p6r4, kroki: async (u, t) => {
    await doKosza(u, u.B, u.v); await p6przywroc(u, u.B, u.v);
    krok(60e3); await mutacja(u.S, u.A, 'retencja P', () => u.A.v.pruneSnapshotsForPatient(u.P, { recentHours: 0 }));
    await scal(u, u.A, u.P, u.Q); await p6spoczynek(u, t);
  } },
  // E3-PR0a: warianty R5-E1 i R3-E2, w których trzecie urządzenie C wysyła tylko zdarzenia (obok wariantów z blobem
  // wyżej, które zostają). W świecie samych blobów te same kroki idą blobami. R5-E1: C (kopia sprzed kosza) zapisuje
  // nową wizytę P i dostarcza swoje zdarzenia A i B, potem spoczynek A ↔ B (haki po powrocie karty). R3-E2: C (kopia A
  // z „A3”) wraca po przerwie — dostaje zdarzenia B, potem A, i odsyła A i B tylko to, co ma w kolejce (haki scalania).
  'R5-E1, C wysyła tylko zdarzenia': { znana: 'ZNANA RÓŻNICA (naprawa: E3-PR0)', baza: (S) => p6r4(S, { zC: true }), kroki: async (u, t) => {
    await doKosza(u, u.B, u.v); krok(); await p6dostawa(u, u.B, u.A, t);
    await p6przywroc(u, u.B, u.v); await p6usunPacjenta(u, u.A, u.P); await p6spoczynek(u, t);
    krok(60e3); await mutacja(u.S, u.C, 'C: nowa wizyta P', () => u.C.d.zapiszKarte(1, { wzrost: 130, masa: 25, zapis: { patientId: u.P, forceNewSnapshot: true } }));
    await p6dostawa(u, u.C, u.A, t); await p6dostawa(u, u.C, u.B, t); await p6spoczynek(u, t);
  } },
  'R3-E2, C wysyła tylko zdarzenia': { baza: p6r3, kroki: async (u, t) => {
    await p6notatka(u, u.A, 'A2'); await p6notatka(u, u.A, 'A3');
    krok(); ustawStan(u.A, await eksport(u.A));
    u.C = await urzadzenie(u.S, 'C', u.A); // C: kopia A z „A3” (rev 3), poza siecią
    await p6usunNotatke(u, u.B); await p6spoczynek(u, t);
    await p6notatka(u, u.B, 'wskrzeszona na B'); await p6spoczynek(u, t);
    krok(60e3); await p6dostawa(u, u.B, u.C, t); await p6dostawa(u, u.A, u.C, t); await p6dostawa(u, u.C, u.A, t); await p6dostawa(u, u.C, u.B, t);
  } },
  // E3-PR0a: nagrobek retencji bez ochrony wizyt (bez visitIdentity i visitCipher — jak od starszej aplikacji, która
  // wykonuje własną retencję; docs/PATIENT_VISITS.md, „Zgodność i wycofanie”) dla v, jedynego stanu swojej wizyty,
  // przychodzi do B pełnym ładunkiem (mergeSyncPayload, poza dziennikiem zdarzeń). Ochrona odbiorcy (P-TRWALE-WIZYTY:
  // retencja nie usuwa ostatniego stanu wizyty) zostawia v na B; po spoczynku v na obu. Wyrocznia: v nie znika (w historii
  // nie ma operacji, która by ją zdejmowała).
  'nagrobek retencji bez ochrony wizyt dla jedynego stanu wizyty v na B': { baza: p6wizyty, kroki: async (u, t) => {
    await popraw(u, u.A, u.w, 23); await p6spoczynek(u, t);
    krok(60e3);
    const sn = (await u.B.v.getPatient(u.P)).snapshots;
    expect(new Set(sn.map((q) => q.payload.visit && q.payload.visit.visitId)).size, 'v i w — różne wizyty karty P').toBe(2);
    const v = sn.find((q) => q.snapshotId === u.v);
    const nagrobek = { patientId: u.P, snapshotId: u.v, deletedAtISO: new Date(Date.now()).toISOString(), savedAtISO: v.savedAtISO, updatedAtISO: v.savedAtISO, rev: 0, powod: 'retencja' };
    await u.B.v.mergeSyncPayload({ patients: [], snapshotTombstones: [nagrobek] });
    ustawStan(u.B, await eksport(u.B));
    await p6spoczynek(u, t);
  } },
};
// Skutek kliniczny notatki n (scenariusze „notatka pod inną kartą”): pod którą kartą leży, jaka treść, czy karta jest
// i co pokazują listy notatek kart P i Q (listPatientNotesForPatient — lista w karcie pacjenta).
async function skutekNotatki(U, u) {
  const st = await eksport(U);
  const zywe = new Set((st.patients || []).map((p) => p.patientId));
  const n = (st.patientNotes || []).find((x) => x.id === u.nId);
  const listy = [];
  for (const pid of [u.P, u.Q]) {
    const l = (await U.v.listPatientNotesForPatient(pid)).map((x) => `${etykieta(u.n, x.id)} „${x.body}”`);
    listy.push(`karta ${etykieta(u.n, pid)}${zywe.has(pid) ? '' : ' (usunięta)'}: ${l.join(', ') || '-'}`);
  }
  const gdzieN = !n ? 'brak notatki n' : `n „${n.body}” pod ${etykieta(u.n, n.patientId)} — ${zywe.has(n.patientId) ? `widoczna w karcie ${etykieta(u.n, n.patientId)}` : `karta ${etykieta(u.n, n.patientId)} usunięta: n nie widać w żadnej karcie`}`;
  return `${gdzieN} | notatki w kartach: ${listy.join('; ')}`;
}
// Literały p. 6 (zmierzone; specyfikacja 2a, 3.4 i 3.6).
// Rebinding moved visit payloads and retaining encrypted deletion identity add
// AES IVs before the merge-head snapshot, advancing this fixture's shared
// IV/UUID RNG. Only those exact generated prefixes changed below;
// original snapshot IDs, clinical contents and convergence assertions remain.
const P6_LITERALY = {
  'R2-0': {
    zdarzenia: ['wersja P/v: rev [R2]'],
    w4: {
      A: 'karty K2[#f57c:22] K3[#02bc:23] K4[#f1a7:24] K5[#1c0f:25] P[v:30*] Q[#7e8f:26] | Kosz - | notatki -',
      B: 'karty K2[#f57c:22] K3[#02bc:23] K4[#f1a7:24] K5[#1c0f:25] P[v:30*] Q[#7e8f:26] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  // E2-PR3c3: bez różnicy rev nagrobka notatki (dotąd „pnotetomb n: rev [R3]”).
  'R3-0': {
    zdarzenia: [],
    w4: {
      A: 'karty Q[#669b:22] | Kosz - | notatki -',
      B: 'karty Q[#669b:22] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R4-a': {
    zdarzenia: [
      'kosz v|P: payload._pinnedState.at, payload._pinnedState.pin, payload._pinned, rev, updatedAtISO, gwiazdka [R4a]',
    ],
    w4: {
      A: 'karty P[w:21] Q[#1c7f:30] | Kosz v@P:20* | notatki -',
      B: 'karty P[w:21] Q[#1c7f:30] | Kosz v@P:20* | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R4-a′': {
    zdarzenia: [
      'kosz v|P: payload._contentAtISO, payload._pinnedState.h, payload.user.weight, rev, updatedAtISO [R4a′]',
    ],
    w4: {
      A: 'karty P[w:21] Q[#03aa:30] | Kosz v@P:40 | notatki -',
      B: 'karty P[w:21] Q[#03aa:30] | Kosz v@P:40 | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R4n (R4-b)': {
    zdarzenia: [
      'kosz v|P: payload._pinnedState.at, payload._pinnedState.pin, payload._pinnedState.zl, payload._pinned [R4n]',
    ],
    w4: {
      A: 'karty P[w:21] Q[#b4f5:30] | Kosz v@P:42.6 | notatki -',
      B: 'karty P[w:21] Q[#b4f5:30] | Kosz v@P:42.6 | notatki -',
      r4n: 2,
      w4p: [true, true],
    },
    bloby: [],
  },
  'R5-0': {
    zdarzenia: ['kosz v|P: tylko A [R5]'],
    w4: {
      A: 'karty Q[#0241:30] | Kosz v@P:20 (ukryty) | notatki -',
      B: 'karty Q[#0241:30] | Kosz v@P:20 (ukryty) | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  // R2-E3 — od E2-PR3c1 zdarzenia bez różnicy (dotąd: wersja Q/v tylko na A do pełnej wymiany).
  'R2-E3': {
    zdarzenia: [],
    w4: {
      A: 'karty K10[#c9c6:30] K11[#87d2:31] K12[#7181:32] K13[#a36c:33] K14[#a0ce:34] K2[#5f94:22] K3[#9ef4:23] K4[#ab9c:24] K5[#8c85:25] K6[#4d00:26] K7[#020f:27] K9[#ba07:29] Q[v:30* #e5ee:28 #ead4:28] | Kosz - | notatki -',
      B: 'karty K10[#c9c6:30] K11[#87d2:31] K12[#7181:32] K13[#a36c:33] K14[#a0ce:34] K2[#5f94:22] K3[#9ef4:23] K4[#ab9c:24] K5[#8c85:25] K6[#4d00:26] K7[#020f:27] K9[#ba07:29] Q[v:30* #e5ee:28 #ead4:28] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R5-E1': {
    zdarzenia: ['kosz v|P: tylko A', 'wersja P/v: tylko B'],
    w4: {
      rund: 2,
      A: 'karty P[w:21 #4a7d:25] Q[#d085:30] | Kosz v@P:20 | notatki -',
      B: 'karty P[w:21 #4a7d:25] Q[#d085:30] | Kosz v@P:20 | notatki -',
      C: 'karty P[w:21 #4a7d:25] Q[#d085:30] | Kosz v@P:20 | notatki -',
    },
    bloby: {
      AB: [],
      BC: ['kosz v|P: tylko B', 'wersja P/v: tylko C'],
      CA: ['kosz v|P: tylko A', 'wersja P/v: tylko C'],
    },
  },
  'R3-E1': {
    zdarzenia: [],
    w4: {
      A: 'karty P[#34a9:22] Q[#9d24:22] | Kosz - | notatki n: wskrzeszona na B (później)',
      B: 'karty P[#34a9:22] Q[#9d24:22] | Kosz - | notatki n: wskrzeszona na B (później)',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  'R3-E2': {
    zdarzenia: [],
    w4: {
      rund: 1,
      A: 'karty P[#5051:22] Q[#fca6:22] | Kosz - | notatki n: wskrzeszona na B',
      B: 'karty P[#5051:22] Q[#fca6:22] | Kosz - | notatki n: wskrzeszona na B',
      C: 'karty P[#5051:22] Q[#fca6:22] | Kosz - | notatki n: wskrzeszona na B',
    },
    bloby: {
      AB: [],
      BC: [],
      CA: [],
    },
  },
  // „notatka pod inną kartą”: skutek kliniczny. Do E2-PR3c4 treść notatki była ta sama na obu (nic nie ginęło), ale na
  // jednym urządzeniu notatka leżała pod kartą usuniętą, więc w żadnej karcie jej nie było widać (B: n pod P; w
  // skrzyżowanym A: n pod Q), po zdarzeniach, po W4 i przy samych blobach. Od E2-PR3c4 n pod kartą, która istnieje, na
  // obu: przy samych blobach i po W4 — reguła karty notatki w scalaniu; po samych zdarzeniach — także jedna dodatkowa
  // wysyłka notatki (hak karty notatki) z urządzenia, które dało jej inną kartę niż w kopercie.
  'Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)': {
    zdarzenia: [],
    w4: {
      A: 'karty Q[#41a7:22 #71c4:22 #5da9:22] | Kosz - | notatki n: edycja B',
      B: 'karty Q[#41a7:22 #71c4:22 #5da9:22] | Kosz - | notatki n: edycja B',
      skutekA: 'n „edycja B” pod Q — widoczna w karcie Q | notatki w kartach: karta P (usunięta): -; karta Q: n „edycja B”',
      skutekB: 'n „edycja B” pod Q — widoczna w karcie Q | notatki w kartach: karta P (usunięta): -; karta Q: n „edycja B”',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
    blobySkutek: {
      A: 'n „edycja B” pod Q — widoczna w karcie Q | notatki w kartach: karta P (usunięta): -; karta Q: n „edycja B”',
      B: 'n „edycja B” pod Q — widoczna w karcie Q | notatki w kartach: karta P (usunięta): -; karta Q: n „edycja B”',
    },
  },
  // E2-PR3c1 dodał w zdarzeniach R2 wersji #ce45 karty P (koperta nagrobka Q z kartą docelową P; klasa dozwolona); od
  // E2-PR3c2 bez niej — B przyjmuje z koperty karty Q (przegranej tam z nagrobkiem scalenia) tę samą rev wersji.
  'skrzyżowane Scal pacjentów (A: P → Q, B: Q → P), notatka karty P': {
    zdarzenia: [],
    w4: {
      A: 'karty P[#ce45:22 #f06d:22 #92f6:22] | Kosz - | notatki n: Fikcyjna treść',
      B: 'karty P[#ce45:22 #f06d:22 #92f6:22] | Kosz - | notatki n: Fikcyjna treść',
      skutekA: 'n „Fikcyjna treść” pod P — widoczna w karcie P | notatki w kartach: karta P: n „Fikcyjna treść”; karta Q (usunięta): -',
      skutekB: 'n „Fikcyjna treść” pod P — widoczna w karcie P | notatki w kartach: karta P: n „Fikcyjna treść”; karta Q (usunięta): -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
    blobySkutek: {
      A: 'n „Fikcyjna treść” pod P — widoczna w karcie P | notatki w kartach: karta P: n „Fikcyjna treść”; karta Q (usunięta): -',
      B: 'n „Fikcyjna treść” pod P — widoczna w karcie P | notatki w kartach: karta P: n „Fikcyjna treść”; karta Q (usunięta): -',
    },
  },
  // K6 — od E2-PR3c2 bez różnicy: po zdarzeniach i po W4 v pod Q z 27 kg na obu, jak w świecie samych blobów. E2-PR3c1:
  // po zdarzeniach v pod Q na obu z inną treścią (A: 20 kg, B: 27 kg). Do E2-PR3c1: po zdarzeniach v tylko na A, po W4
  // v z 20 kg na obu (poprawka z B ginęła).
  'K6': {
    zdarzenia: [],
    w4: {
      A: 'karty Q[v:27 q:30 #a349:30] | Kosz - | notatki -',
      B: 'karty Q[v:27 q:30 #a349:30] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
    blobyKlinicznie: {
      A: 'karty Q[v:27 q:30 #a349:30] | Kosz - | notatki -',
      B: 'karty Q[v:27 q:30 #a349:30] | Kosz - | notatki -',
    },
  },
  // E2-PR3c5 (decyzja 7): po zdarzeniach wpis v na obu bez treści (nagrobek przycięcia), różni się tylko opis (D7,
  // dozwolona); W4 z punktem stałym po jednej rundzie, same bloby bez różnicy. Na bazie po zdarzeniach A pokazywało v
  // w Koszu ze starą treścią (różnica bez klasy: deletedAtISO, payload, przycietoISO, powod, zmianaISO), a W4 PO-B nie
  // miało punktu stałego (opis wpisu zbieżny dopiero po drugiej rundzie).
  'Kosz i Przywróć na B, porządkowanie i Scal pacjentów P → Q na A': {
    zdarzenia: ['kosz v|P: koszISO, rev, updatedAtISO, zmianaISO [D7]'],
    w4: {
      A: 'karty Q[w:21 #5377:30 #6c82:30] | Kosz - | notatki -',
      B: 'karty Q[w:21 #5377:30 #6c82:30] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
  // E3-PR0a: R5-E1, gdy C wysyła tylko zdarzenia (wariant z blobem — 'R5-E1' wyżej). Po samych zdarzeniach karta P wraca
  // na A i B tylko z nową wizytą C (#9426): nagrobek A przegrał lokalnie z kopertą C, więc A nie wysyła pełnej karty
  // (świadomie bez haka H1), a C — jedyne z pełną kartą — nagrobka nie dostało; w (21 kg) jest tylko na C, v — w Koszu
  // A. Po W4 wynik jak w wariancie z blobem (R5-E1: v w Koszu, a nie w karcie).
  'R5-E1, C wysyła tylko zdarzenia': {
    zdarzenia: ['kosz v|P: tylko A'],
    w4: {
      rund: 2,
      A: 'karty P[w:21 #9426:25] Q[#60d3:30] | Kosz v@P:20 | notatki -',
      B: 'karty P[w:21 #9426:25] Q[#60d3:30] | Kosz v@P:20 | notatki -',
      C: 'karty P[w:21 #9426:25] Q[#60d3:30] | Kosz v@P:20 | notatki -',
    },
    bloby: {
      AB: [],
      BC: ['kosz v|P: tylko B', 'wersja P/v: tylko C'],
      CA: ['kosz v|P: tylko A', 'wersja P/v: tylko C'],
    },
  },
  // E3-PR0a: R3-E2, gdy C wraca i wysyła tylko zdarzenia (wariant z blobem — 'R3-E2' wyżej): bez różnic, wynik jak przy
  // blobie (notatka n „wskrzeszona na B” na trzech).
  'R3-E2, C wysyła tylko zdarzenia': {
    zdarzenia: [],
    w4: {
      rund: 2,
      A: 'karty P[#1a12:22] Q[#bfac:22] | Kosz - | notatki n: wskrzeszona na B',
      B: 'karty P[#1a12:22] Q[#bfac:22] | Kosz - | notatki n: wskrzeszona na B',
      C: 'karty P[#1a12:22] Q[#bfac:22] | Kosz - | notatki n: wskrzeszona na B',
    },
    bloby: {
      AB: [],
      BC: [],
      CA: [],
    },
  },
  // E3-PR0a: nagrobek retencji bez ochrony wizyt (jak od starszej aplikacji) dla v, jedynego stanu swojej wizyty, na B:
  // v zostaje na obu (ochrona odbiorcy, P-TRWALE-WIZYTY). Po samych zdarzeniach nagrobek bez treści jest tylko na B
  // (przyszedł pełnym ładunkiem, poza dziennikiem; okno Kosza go nie pokazuje), po W4 i przy samych blobach bez różnicy.
  'nagrobek retencji bez ochrony wizyt dla jedynego stanu wizyty v na B': {
    zdarzenia: ['kosz v|P: tylko B'],
    w4: {
      A: 'karty P[v:20 w:23] | Kosz - | notatki -',
      B: 'karty P[v:20 w:23] | Kosz - | notatki -',
      r4n: 0,
      w4p: [],
    },
    bloby: [],
  },
};
async function p6swiat(nr, sc, tryb) {
  ustaw(START);
  const S = swiat(600 + nr);
  const los = rng(0x6006 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  const u = await sc.baza(S);
  u.S = S;
  await sc.kroki(u, tryb);
  for (const U of [u.A, u.B, u.C].filter(Boolean)) ustawStan(U, await eksport(U));
  return u;
}
async function p6D(u, X, Y) {
  const [a, b] = [kanon(await eksport(X)), kanon(await eksport(Y))];
  const d = await kr_cicho(u.S, async () => sklasyfikuj(D(a, b), a, b, { tabela: 'p6' }, async () => ({ x: await X.v.listTrashedSnapshots(), y: await Y.v.listTrashedSnapshots() })));
  return opisD(d, u.n, X.nazwa, Y.nazwa);
}
const urzWyr = (u) => Object.fromEntries([u.A, u.B, u.C].filter(Boolean).map((U) => [U.nazwa, U]));
// Wyrocznia „nie zginęła ostatnia zmiana” w p. 6 (zmierzone; charakterystyka dzisiejszego stanu): [scenariusz] = zbiór
// „klasa | świat” naruszeń po samych zdarzeniach (W1), po W4 (dwa albo trzy urządzenia) i w świecie samych blobów;
// scenariusz spoza listy — bez naruszeń. Naprawa (E3-PR0) przepisuje ten literał.
const P6_WYR = {
  'R4-a': ['R4a | W1', 'R4a | bloby'],
  'R4-a′': ['R4a′ | W1', 'R4a′ | bloby'],
  'R5-E1': ['R5-E1 | W1', 'R5-E1 | W4', 'R5-E1 | bloby'],
  'R5-E1, C wysyła tylko zdarzenia': ['R5-E1 | W1', 'R5-E1 | W4', 'R5-E1 | bloby', 'karta częściowa (nagrobek przegrał lokalnie, bez haka H1) | W1'],
};
const P6_WYNIKI = {};
describe('A ≡ B, blok deterministyczny p. 6: znane klasy i dalsze ciągi (literały: zdarzenia, W4, same bloby)', () => {
  d1();
  for (const [nr, [nazwa, sc]] of Object.entries(P6).entries()) {
    it(`${sc.znana ? sc.znana + ' — ' : ''}${nazwa}`, async () => {
      const u = await p6swiat(nr, sc, 'zdarzenia');
      const trzy = !!u.C;
      const wynik = { zdarzenia: await p6D(u, u.A, u.B) };
      // Wyrocznia (E3-PR0a): po samych zdarzeniach (W1, wszystkie urządzenia), po W4 (klony; dwa albo trzy urządzenia)
      // i w świecie samych blobów.
      u.S.wyrSwiat = `p6 ${nazwa} zdarzenia`;
      u.S.wyrEtyk = (id) => etykieta(u.n, id);
      wyrOcena(u.S, 'W1', 'p6 W1', await wyrWidoki(u.S, urzWyr(u)));
      const scisle = SCISLE ? await scisleW1(u.S, u.A, u.B, await w1Klasy(u.S, u.A, u.B, { tabela: 'p6' })) : [];
      if (trzy) {
        const w = await w4Trzy(u.S, [u.A, u.B, u.C], u.n);
        wyrOcena(u.S, 'W4', 'p6 W4 (trzy)', w.wyr);
        delete w.wyr;
        expect.soft(w.ok, 'W4 (trzy urządzenia)\n' + JSON.stringify(w, null, 1)).toBe(true);
        wynik.w4 = { rund: w.rund, ...w.opis };
      } else {
        const opisz = async (A1, B1) => ({ A: await kliniczny(A1, u.n), B: await kliniczny(B1, u.n), ...(sc.notatki ? { skutekA: await skutekNotatki(A1, u), skutekB: await skutekNotatki(B1, u) } : {}), wyr: await wyrWidokiKlonow({ A: A1, B: B1 }) });
        const w = await w4(u.S, u.A, u.B, { tabela: 'p6' }, { opisz });
        for (const x of w.warianty) { wyrOcena(u.S, 'W4', `p6 W4 ${x.wariant}`, x.opis.wyr); delete x.opis.wyr; }
        expect.soft(w.ok, 'W4\n' + JSON.stringify(w.warianty, null, 1)).toBe(true);
        expect.soft(w.warianty[1].opis, 'W4: PO-B ≡ PO-A').toEqual(w.warianty[0].opis);
        wynik.w4 = { ...w.warianty[0].opis, r4n: w.r4n, w4p: w.w4p.map((x) => x.ok) };
      }
      // Do E2-PR3c4 scenariusze „notatka pod inną kartą” sprawdzały tu negatyw tabel (3.6) na prawdziwej różnicy; od
      // E2-PR3c4 różnicy nie ma (literały niżej), a negatyw tabeli W4 sprawdza test „W4 — negatywy” na różnicy
      // wstrzykniętej w migawkę, tabele — test predykatu klasy.
      const wyrZd = u.S.wyrNaruszenia || [];
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
      const ub = await p6swiat(nr, sc, 'blob');
      wynik.bloby = trzy ? { AB: await p6D(ub, ub.A, ub.B), BC: await p6D(ub, ub.B, ub.C), CA: await p6D(ub, ub.C, ub.A) } : await p6D(ub, ub.A, ub.B);
      if (sc.notatki) wynik.blobySkutek = { A: await skutekNotatki(ub.A, ub), B: await skutekNotatki(ub.B, ub) };
      if (sc.klinicznieBloby) wynik.blobyKlinicznie = { A: await kliniczny(ub.A, ub.n), B: await kliniczny(ub.B, ub.n) };
      ub.S.wyrSwiat = `p6 ${nazwa} bloby`;
      ub.S.wyrEtyk = (id) => etykieta(ub.n, id);
      wyrOcena(ub.S, 'bloby', 'p6 bloby', await wyrWidoki(ub.S, urzWyr(ub)));
      const wyrP6 = [...wyrZd, ...(ub.S.wyrNaruszenia || [])];
      // K6 (od E2-PR3c1): po pełnej wymianie stan kliniczny jak w świecie samych blobów (bez utraty poprawki).
      if (sc.klinicznieBloby) expect.soft({ A: wynik.w4.A, B: wynik.w4.B }, `W4 = stan kliniczny samych blobów: ${nazwa}`).toEqual(wynik.blobyKlinicznie);
      P6_WYNIKI[nazwa] = wynik;
      if (process.env.E2_AB_P6) appendFileSync(process.env.E2_AB_P6, JSON.stringify({ nazwa, ...wynik, wyrocznia: zbiorWyr(wyrP6) }) + '\n');
      // Asercje miękkie (expect.soft): komunikat CI ma i werdykt wyroczni, i literał.
      expect.soft(wyrCzerwone(wyrP6), `wyrocznia p. 6 (${nazwa}): naruszenia bez klasy z tabeli wyjątków`).toEqual([]);
      expect.soft(zbiorWyr(wyrP6), `wyrocznia p. 6 (${nazwa}): zbiór (klasa, świat)`).toEqual(P6_WYR[nazwa] || []);
      expect.soft(wynik, `literał p. 6: ${nazwa}`).toEqual(P6_LITERALY[nazwa]);
      if (SCISLE) {
        // Tryb ścisły: W1 = ∅ poza klasami niewidocznymi z dowodem; wyrocznia — w W1 żadnego naruszenia, którego nie ma
        // też po W4 albo w świecie samych blobów.
        const poza = new Set(wyrP6.filter((x) => x.swiat !== 'W1').map(WYR.kluczNaruszenia));
        scisle.push(...wyrZd.filter((x) => x.swiat === 'W1' && !poza.has(WYR.kluczNaruszenia(x))).map((x) => ({ przyczyna: 'wyrocznia: W1 poza W4 i blobami', klasa: x.klasa, klucz: `${x.urz} ${x.encja} ${x.et} ${x.rodzaj}` })));
        if (WYR_PLIK && (scisle.length || (u.S.stat.dowody || []).length)) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'scisle', swiat: `p6 ${nazwa}`, scisle, dowody: u.S.stat.dowody || [] }) + '\n');
        expect(scisle, `tryb ścisły p. 6 (${nazwa})`).toEqual([]);
      }
    }, 120_000);
  }
  it('klasa „notatka pod inną kartą” (pozycja planu: E2-PR3c4): predykat i tabela dozwolonych (3.6) — od E3-PR0a czerwona w każdej tabeli', () => {
    const n = (pid) => ({ id: 'n', patientId: pid, title: 'Fikcyjna', rev: 2, updatedAtISO: '2026-03-02T08:10:00.000Z' });
    const r = { rodzaj: 'pnote', klucz: 'n', a: n('Q'), b: n('P'), tylko: null, sciezki: ['patientId'] };
    const st = (karty, nagr) => ({ patients: karty.map((p) => ({ patientId: p, snapshots: [] })), tombstones: nagr.map((p) => ({ patientId: p })) });
    expect(klasa(r, st(['Q'], ['P']), st(['Q'], ['P'])), 'karta P z nagrobkiem na obu').toBe(NPIK);
    expect(klasa(r, st(['P'], ['Q']), st(['P'], ['Q'])), 'karta Q z nagrobkiem na obu (skrzyżowane)').toBe(NPIK);
    expect(klasa(r, st(['Q'], ['P']), st(['P', 'Q'], [])), 'nagrobek tylko po jednej stronie — brak klasy').toBe(null);
    expect(klasa({ ...r, a: { ...n('Q'), rev: 3 }, sciezki: ['patientId', 'rev'] }, st(['Q'], ['P']), st(['Q'], ['P'])), 'inne pole poza patientId — brak klasy').toBe(null);
    const tak = Object.keys(DOZWOLONE).map((tabela) => [tabela, dozwolona(NPIK, r, { tabela, przebieg: 'E1-C' })]).filter(([, w]) => w);
    expect(tak, 'gdzie dozwolona (od E3-PR0a — nigdzie: zero wystąpień)').toEqual([]);
  });
});

// ── p. 7: koalescencja kolejki (reguła ogona, E2-PR2b) — literały ────────────────────────────────────────────────────
// Kolejki z łączeniem wpisów (doKolejkiOgon, wycięta Bob_plan sejfu), bez W2s. p. 7a — poprawki jednej wizyty z rzędu bez
// połączenia: jeden wpis tej wersji z najnowszą treścią. p. 7b — ratunek notatki za pełną kartą: nowy pnote(n) z haka H2
// nie zastępuje oczekującego pnote(n), bo za nim stoją snap i pfull karty (wpis zastąpiony „w miejscu” starego trafiłby
// przed pfull i odbiorca stosowałby notatkę, zanim karta wróci). p. 7c — odtworzenie punktów R3, które w przebiegu 40
// ziaren pojawiły się tylko przy wariancie „na koniec” (ziarno 10, punkty #51, #106, #124, #125): różnica wynika z ciągu
// operacji tego programu (B poprawia notatkę n, A ją usuwa, dostawy w obie strony), który bez łączenia wpisów i z regułą
// ogona daje tę samą klasę R3 (dozwoloną w W1); łączenie wpisów w tych krokach nie zachodzi. Program ziarna z wariantem
// „na koniec” jest inny, bo długość kolejki zmienia losowania klonu W2s; samo przeniesienie wpisu na koniec tej różnicy
// nie tworzy.
async function p7swiat(nr) {
  ustaw(START);
  const S = zKoalescencja(swiat(700 + nr));
  S.w2s = false;
  const los = rng(0x7007 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  return S;
}
const oczekujaceQ = (S, X, Y) => X.Q.slice(kursor(S, X, Y)).map((e) => [e.kind, e.key]);
async function trescWpisu(U, e) { return U.v.decryptPayloadForCurrentUser(e.env.iv, e.env.data); }
describe('A ≡ B, blok deterministyczny p. 7: koalescencja kolejki (reguła ogona)', () => {
  d1();
  it('p. 7a poprawki jednej wizyty z rzędu bez połączenia: 3 poprawki → Q_A ma 1 wpis tej wersji z najnowszą treścią; spoczynek, W1 = ∅, W2r, W4', async () => {
    const S = await p7swiat(1);
    const u = await p6r4(S); u.S = S;
    for (const kg of [31.1, 32.2, 33.3]) await popraw(u, u.A, u.v, kg);
    expect(oczekujaceQ(S, u.A, u.B), 'Q_A').toEqual([['snap', `${u.P}/${u.v}`]]);
    const tresc = await trescWpisu(u.A, u.A.Q[0]);
    const wersja = tresc.patients[0].snapshots.find((s) => s.snapshotId === u.v);
    expect(wersja.payload.user.weight, 'treść wpisu = ostatnia poprawka').toBe(33.3);
    expect([S.stat.koal, S.stat.koalWierszy, S.stat.koalPominiete], 'koalescencje').toEqual([2, 2, 0]);
    await spoczynekZgodny(S, u.A, u.B);
    const masaB = (await u.B.v.getPatient(u.P)).snapshots.find((s) => s.snapshotId === u.v).payload.user.weight;
    expect(masaB, 'B po spoczynku: ostatnia poprawka').toBe(33.3);
  }, 120_000);

  it('p. 7b ratunek notatki za pełną kartą: A poprawia notatkę n karty P, B usuwa P, A poprawia wizytę P; po dostawie B→A haki A dokładają pfull(P) i pnote(n) — Q_A [pnote, snap, pfull…, pnote] (oba pnote(n)); spoczynek: notatka n i karta P na obu, W1 = ∅, W2r, W4', async () => {
    const S = await p7swiat(2);
    const u = await p6r3(S); u.S = S;
    const v = u.A.stan.patients.find((p) => p.patientId === u.P).snapshots[0].snapshotId;
    await p6notatka(u, u.A, 'Fikcyjna poprawka notatki A');
    await p6usunPacjenta(u, u.B, u.P);
    await popraw(u, u.A, v, 34.9);
    expect(oczekujaceQ(S, u.A, u.B), 'Q_A przed dostawą').toEqual([['pnote', u.nId], ['snap', `${u.P}/${v}`]]);
    expect(u.B.Q.map((e) => e.kind), 'Q_B').toEqual(['ptomb', 'pnotetomb']);
    krok();
    const { dodane } = await dostawa(S, u.B, u.A);
    expect(dodane.map((k) => [k.event.kind, k.event.key]), 'haki A po partii B→A: pfull(P) (jedna porcja), pnote(n)').toEqual([['pfull', u.P], ['pnote', u.nId]]);
    expect(oczekujaceQ(S, u.A, u.B), 'Q_A po hakach: stary pnote(n) zostaje (nie jest ogonem)')
      .toEqual([['pnote', u.nId], ['snap', `${u.P}/${v}`], ['pfull', u.P], ['pnote', u.nId]]);
    expect([S.stat.koal, S.stat.koalPominiete], 'bez zastąpienia; jedno dopisanie z oczekującym wpisem tej encji').toEqual([0, 1]);
    await spoczynekZgodny(S, u.A, u.B);
    const stan = async (U) => { const k = kanon(await eksport(U)); return { karty: (k.patients || []).map((p) => p.patientId).sort(), notatki: (k.patientNotes || []).map((n) => [n.id, n.patientId, n.body]), nagrobkiNotatek: (k.patientNoteTombstones || []).length }; };
    const oczek = { karty: [u.P, u.Q].sort(), notatki: [[u.nId, u.P, 'Fikcyjna poprawka notatki A']], nagrobkiNotatek: 0 };
    expect({ A: await stan(u.A), B: await stan(u.B) }, 'po spoczynku: karta P i notatka n na obu').toEqual({ A: oczek, B: oczek });
  }, 120_000);

  it('p. 7c odtworzenie punktów R3 wariantu „na koniec” (ziarno 10 przebiegu 40 ziaren): B poprawia notatkę n, A ją usuwa, dostawy B→A i A→B — od E2-PR3c3 bez różnicy R3, bez łączenia wpisów i z regułą ogona; W4', async () => {
    const wyniki = {};
    for (const tryb of ['bez łączenia', 'ogon']) {
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
      const S = await p7swiat(3);
      if (tryb === 'bez łączenia') { S.koalescencja = null; }
      const u = await p6r3(S); u.S = S;
      await p6notatka(u, u.B, 'Fikcyjna poprawka notatki B');
      await p6usunNotatke(u, u.A);
      krok(60e3); await dostawa(S, u.B, u.A);
      krok(60e3); await dostawa(S, u.A, u.B);
      expect(await spoczynek(S, u.A, u.B), raport(S, 'punkt spoczynku')).not.toBe(null);
      const d = await w1Klasy(S, u.A, u.B, { tabela: 'podstawowy' });
      const w = await w4Zgodne(S, u.A, u.B);
      wyniki[tryb] = { D: d.map((r) => [r.rodzaj, r.klasa, r.dozwolona, r.sciezki]), W4: w.ok, dziennik: S.dziennik.map((l) => l.replace(/^#\d+ [0-9:.]+ /, '')) };
    }
    const oczek = {
      // E2-PR3c3: nagrobek notatki niesie rev wersji z ładunku — bez różnicy R3 (dotąd [['pnotetomb', 'R3', 'tak', ['rev']]]).
      D: [], W4: true,
      dziennik: ['B: notatka „Fikcyjna poprawka notatki B” → [pnote]', 'A: usuń notatkę → [pnotetomb]', 'dostawa B>A: 1 pełna [pnote]', 'dostawa A>B: 1 pełna [pnotetomb]'],
    };
    expect(wyniki, 'literał p. 7c').toEqual({ 'bez łączenia': oczek, ogon: oczek });
  }, 120_000);
});

// ── p. 7d: kwarantanna i „Zwolnij” (wymaganie E2-PR4) — literały ────────────────────────────────────────────────────
// Odbiorca (świeży klon B) stosuje partię nadawcy A, z której zdarzenia q trafiają do kwarantanny. Wymagania dla
// E2-PR4 (drenaż z kwarantanną) i E2-PR5 („Zwolnij”): (1) ponowna próba w kolejności seq rosnąco; (2) po udanej ponownej
// próbie ponowne zastosowanie zdarzeń od jej seq do kursora (scalanie jest idempotentne); (3) „Zwolnij” usuwa wpis bez
// zastosowania — do najbliższej pełnej wymiany karta może być niepełna albo może jej brakować. Warianty: FIFO (bez
// kwarantanny), ponowienie (1), zwolnienie (3), ponowienie + sufiks (1 i 2). Literał każdej partii i wariantu: D(nadawca, odbiorca)
// z etykietami encji, W4 (zdarzenia, potem pełna wymiana blobem), wiersze kwarantanny przed drugą fazą ([seq, rodzaj
// zdarzenia, powód, z]), rodzaje zdarzeń drugiej fazy, zwolnione seq i liczba wierszy na końcu. Wymaganie (2) rozróżnia
// partia N1 z [snap, pfull] w kwarantannie (pnote zastosowane w pierwszej fazie przed kartą): samo ponowienie zostawia
// różnicę notatki, ponowienie + sufiks — nie. Kolejność ponowień (1) widać w literale tylko w kolejności drugiej fazy
// i zwolnionych seq; D w tych partiach od niej nie zależy.
// Magazyn kwarantanny: prawdziwe quarantinePut, quarantineList, quarantineMinSeq, quarantineRelease i quarantineCount
// sejfu w osobnym oknie (okno() z adapterem IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs — tryb
// „Komputer prywatny”, osobne fikcyjne konto, bramka dziennika zdarzeń otwarta tylko w tym oknie). Urządzenia uprzęży
// mają sejf na adapterze w pamięci (setStorageAdapter), więc ich własne operacje kwarantanny kończą się odmową 'tryb';
// wiersz kwarantanny niesie tylko szyfrogram wiersza /changes, slotId odbiorcy i seq, więc konto okna magazynu nie wpływa
// na wynik. seq = pozycja zdarzenia w kolejce nadawcy (numer w dzienniku serwera).
// Przyczyna kwarantanny (model nowszej wersji nadawcy): wiersz /changes zdarzenia q niesie znacznik formatu z: 'br',
// którego ta wersja nie zna — prawdziwy applyEncryptedEvent odbiorcy zwraca unreadable/format i niczego nie zmienia.
// Ponowna próba po aktualizacji (model nowej wersji, która zna znacznik): applyEncryptedEvent na { iv, data } wiersza
// z quarantineList (szyfrogram nadawcy jest zwykłą kopertą, bez kompresji), potem quarantineRelease tego seq.
const P7D_WARIANTY = ['FIFO', 'ponowienie', 'zwolnienie', 'ponowienie + sufiks'];
const P7D_WERSJA = '1.0.0-fikcyjna';
async function oknoKwarantanny() {
  const idb = utworzIndexedDB();
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  const { win, timery } = okno({ dodatki: { indexedDB: idb } });
  const ev = win.VildaVault._eventLog;
  const zamknij = async () => {
    for (let i = 0; i < 10_000 && idb.__atrapa.wToku(); i += 1) await new Promise((r) => { setImmediate(r); });
    const higiena = [idb.__atrapa.polaczenia(/^vilda_sync_/), idb.__atrapa.wToku()];
    timery.wyczysc();
    vi.unstubAllGlobals();
    return higiena;
  };
  if (typeof ev.quarantinePut !== 'function') await zamknij();
  expect(typeof ev.quarantinePut, 'API kwarantanny (VildaVault._eventLog.quarantinePut)').toBe('function');
  win.VILDA_EVENT_LOG = true;
  await win.VildaVault.createUser('Fikcyjne#Haslo!Kwarantanna2026', { label: 'Fikcyjna Lekarka Kwarantanna', iterations: 1000 });
  return { ev, zamknij };
}
// Jeden wariant: świeży klon odbiorcy Y, faza 1 (partia FIFO; zdarzenia o indeksach z `kw` do kwarantanny — poza
// wariantem FIFO), faza 2 według wariantu, na końcu D wobec nadawcy X i W4.
async function p7dWariant(S, X, Y, partia, kw, wariant, M, n) {
  const K = await klon(S, Y, `kw-${P7D_WARIANTY.indexOf(wariant)}`);
  try {
    const slotId = K.d.slotId;
    const c = kursor(S, X, Y);
    const seqOd = (i) => c + i + 1;
    const rodzaj = new Map(partia.map((e, i) => [seqOd(i), e.kind]));
    const druga = [];
    for (const [i, e] of partia.entries()) {
      if (wariant === 'FIFO' || !kw.includes(i)) { await zastosuj(K, [e]); continue; }
      const zmiana = { seq: seqOd(i), eid: `00000000-0000-4000-8000-${String(seqOd(i)).padStart(12, '0')}`, payload: { ...e.env, z: 'br' } };
      const w = await K.ev.applyEncryptedEvent(zmiana.payload);
      expect(w, `faza 1, ${e.kind} (seq ${zmiana.seq}): wynik zastosowania`).toEqual({ status: 'unreadable', reason: 'format' });
      expect(await M.ev.quarantinePut(zmiana, w, { slotId, appVersion: P7D_WERSJA }), 'quarantinePut').toEqual({ ok: true, nowy: true });
    }
    const lista = await M.ev.quarantineList({ slotId });
    expect(lista.ok, 'quarantineList').toBe(true);
    const wiersze = lista.wiersze;
    expect(wiersze.map((r) => r.seq), 'lista po seq rosnąco').toEqual(wiersze.map((r) => r.seq).sort((a, b) => a - b));
    const zwolnij = async (seqs) => {
      const r = await M.ev.quarantineRelease(seqs, { slotId });
      expect(r, 'quarantineRelease').toEqual({ ok: true, usuniete: seqs, pominiete: [] });
      return seqs;
    };
    const ponow = async (r) => {
      const w = await K.ev.applyEncryptedEvent({ iv: r.iv, data: r.data });
      expect(w && w.status, `ponowna próba seq ${r.seq}`).toBe('applied');
      druga.push(rodzaj.get(r.seq));
      return zwolnij([r.seq]);
    };
    const zwolnione = [];
    if (wariant === 'ponowienie') for (const r of wiersze) zwolnione.push(...await ponow(r));
    if (wariant === 'zwolnienie' && wiersze.length) zwolnione.push(...await zwolnij(wiersze.map((r) => r.seq)));
    if (wariant === 'ponowienie + sufiks' && wiersze.length) {
      const { seq: min } = await M.ev.quarantineMinSeq({ slotId });
      const zKw = new Map(wiersze.map((r) => [r.seq, r]));
      for (const [i, e] of partia.entries()) {
        if (seqOd(i) < min) continue;
        if (zKw.has(seqOd(i))) { zwolnione.push(...await ponow(zKw.get(seqOd(i)))); continue; }
        await zastosuj(K, [e]);
        druga.push(e.kind);
      }
    }
    const licznik = await M.ev.quarantineCount();
    const kK = kanon(await eksport(K));
    ustawStan(K, await eksport(K));
    const w = await w4(S, X, K, { tabela: 'W4' });
    return {
      D: opisD(D(kanon(X.stan), kK), n, 'A', 'B'), W4: w.ok,
      kwarantanna: wiersze.map((r) => [r.seq, rodzaj.get(r.seq), r.reason, r.z]), drugaFaza: druga, zwolnione, poKoncu: licznik.total,
    };
  } finally { await zamknij(K); }
}
async function p7dCzesciowa(usunPacjenta) {
  const S = swiat(777 + (usunPacjenta ? 1 : 0));
  const los = rng(0x7070 + (usunPacjenta ? 1 : 0));
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  const A = await urzadzenie(S, 'A');
  krok(); const P = (await A.d.zapiszKarte(1)).patientId;
  krok(); const R = (await A.d.zapiszKarte(2)).patientId;
  ustawStan(A, await eksport(A));
  const B = await urzadzenie(S, 'B', A);
  krok(60e3); const { wynik: notatka } = await mutacja(S, A, 'notatka', () => A.v.savePatientNote({ patientId: P, title: 'Fikcyjna', body: 'Fikcyjna treść p. 7d', category: 'inne' }));
  krok(60e3);
  if (usunPacjenta) await mutacja(S, A, 'usuń pacjenta', () => A.v.removePatient(P));
  else await mutacja(S, A, 'usuń notatkę', () => A.v.removePatientNote(notatka.id));
  return { S, X: A, Y: B, n: new Map([[P, 'P'], [R, 'R'], [notatka.id, 'n']]) };
}
async function p7dN1() {
  const S = swiat(650);
  const los = rng(0x6050);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  const u = await p6r4(S); u.S = S;
  krok(60e3); const { wynik: notatka } = await mutacja(S, u.B, 'notatka pacjenta', () => u.B.v.savePatientNote({ patientId: u.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść N1', category: 'inne' }));
  await p6usunPacjenta(u, u.B, u.P);
  await popraw(u, u.A, u.v, 34.9);
  krok();
  const { dodane } = await dostawa(S, u.B, u.A, { w2s: false });
  expect(dodane.map((k) => k.event.kind), 'haki A po partii B→A [pnote, ptomb, pnotetomb]').toEqual(['pfull', 'pnote']);
  u.n.set(notatka.id, 'n');
  return { S, X: u.A, Y: u.B, n: u.n };
}
const P7D_PUSTE = (kw, druga) => ({
  FIFO: { D: [], W4: true, kwarantanna: [], drugaFaza: [], zwolnione: [], poKoncu: 0 },
  ponowienie: { D: [], W4: true, kwarantanna: kw, drugaFaza: druga.ponowienie, zwolnione: kw.map((r) => r[0]), poKoncu: 0 },
  zwolnienie: { D: [], W4: true, kwarantanna: kw, drugaFaza: [], zwolnione: kw.map((r) => r[0]), poKoncu: 0 },
  'ponowienie + sufiks': { D: [], W4: true, kwarantanna: kw, drugaFaza: druga.sufiks, zwolnione: kw.map((r) => r[0]), poKoncu: 0 },
});
const P7D = {
  '[pnote, pnotetomb] („Usuń notatkę”), pnote w kwarantannie: odbiorca = nadawca we wszystkich wariantach': {
    swiat: () => p7dCzesciowa(false), wKwarantannie: ['pnote'], partia: ['pnote', 'pnotetomb'],
    literal: P7D_PUSTE([[1, 'pnote', 'format', 'br']], { ponowienie: ['pnote'], sufiks: ['pnote', 'pnotetomb'] }),
  },
  '[pnote, ptomb, pnotetomb] („Usuń pacjenta”), pnote w kwarantannie: odbiorca = nadawca we wszystkich wariantach': {
    swiat: () => p7dCzesciowa(true), wKwarantannie: ['pnote'], partia: ['pnote', 'ptomb', 'pnotetomb'],
    literal: P7D_PUSTE([[1, 'pnote', 'format', 'br']], { ponowienie: ['pnote'], sufiks: ['pnote', 'ptomb', 'pnotetomb'] }),
  },
  'N1: [snap, pfull, pnote] (haki H1 i H2 nadawcy), pfull w kwarantannie: odbiorca = nadawca poza zwolnieniem; zwolnienie — jedna wizyta karty tylko u nadawcy (charakterystyka; pełna wymiana w W4 ją dowozi)': {
    swiat: p7dN1, wKwarantannie: ['pfull'], partia: ['snap', 'pfull', 'pnote'],
    literal: (() => {
      const l = P7D_PUSTE([[2, 'pfull', 'format', 'br']], { ponowienie: ['pfull'], sufiks: ['pfull', 'pnote'] });
      l.zwolnienie.D = ['wersja P/w: tylko A'];
      return l;
    })(),
  },
  'N1: [snap, pfull, pnote], snap i pfull w kwarantannie: ponowienie bez sufiksu zostawia notatkę n tylko u nadawcy i jej nagrobek tylko u odbiorcy, ponowienie + sufiks — odbiorca = nadawca; zwolnienie — karta P z wizytami i notatka tylko u nadawcy (charakterystyka; pełna wymiana w W4 je dowozi)': {
    swiat: p7dN1, wKwarantannie: ['snap', 'pfull'], partia: ['snap', 'pfull', 'pnote'],
    literal: (() => {
      const l = P7D_PUSTE([[1, 'snap', 'format', 'br'], [2, 'pfull', 'format', 'br']], { ponowienie: ['snap', 'pfull'], sufiks: ['snap', 'pfull', 'pnote'] });
      l.ponowienie.D = ['pnote n: tylko A', 'pnotetomb n: tylko B'];
      l.zwolnienie.D = ['karta P: tylko A', 'pnote n: tylko A', 'pnotetomb n: tylko B', 'ptomb P: tylko B', 'wersja P/v: tylko A', 'wersja P/w: tylko A'];
      return l;
    })(),
  },
};
describe('A ≡ B, blok deterministyczny p. 7d: kwarantanna i „Zwolnij” (wymaganie E2-PR4; magazyn kwarantanny sejfu)', () => {
  d1();
  for (const [nazwa, sc] of Object.entries(P7D)) {
    it(`p. 7d ${nazwa}; warianty FIFO, ponowienie, zwolnienie, ponowienie + sufiks; W4`, async () => {
      const M = await oknoKwarantanny();
      try {
        const { S, X, Y, n } = await sc.swiat();
        const partia = X.Q.slice(kursor(S, X, Y));
        expect(partia.map((e) => e.kind), 'partia nadawcy').toEqual(sc.partia);
        const kw = partia.map((e, i) => (sc.wKwarantannie.includes(e.kind) ? i : -1)).filter((i) => i >= 0);
        const wynik = {};
        for (const wariant of P7D_WARIANTY) wynik[wariant] = await p7dWariant(S, X, Y, partia, kw, wariant, M, n);
        expect(wynik, `literał p. 7d: ${nazwa}`).toEqual(sc.literal);
      } finally {
        expect(await M.zamknij(), 'połączenia baz kolejki i transakcje atrapy po przypadku').toEqual([0, 0]);
      }
    }, 120_000);
  }
});

// ── Klasy 3.6 i warunki W4/W4p: testy negatywne (poprawki po weryfikacji: P1, P2, P4, P5, P7) ─────────────────
// Predykat klasy, który przyjmuje więcej niż definicja 3.6, i tabela DOZWOLONE szersza niż tabela 3.6 schowałyby nową
// różnicę kliniczną w ziarnach spoza literałów i w punktach już obecnych w ZNANE_W1 (literał porównuje tylko klasy).
// Dlatego: dla każdej klasy przypadek pozytywny i negatywy z definicji na syntetycznych parach (bez sejfu), tabela 3.6
// literałem, a W4 i W4p — negatywy na stanach z p. 6 (W4p, który zawodzi, punkt stały, który nie zachodzi, różnica
// niedozwolona w tabeli 'W4').
const T0 = '2026-03-02T08:00:00.000Z', T1 = '2026-03-02T08:01:00.000Z';
const syntPl = (o = {}) => ({ user: { weight: 20 }, ...o });
const syntWersja = (o = {}) => ({ snapshotId: 'v', savedAtISO: T0, rev: 1, updatedAtISO: T0, payload: syntPl(), ...o });
const syntKosz = (o = {}) => ({ snapshotId: 'v', patientId: 'P', deletedAtISO: T0, rev: 1, updatedAtISO: T0, gwiazdka: false, payload: syntPl(), ...o });
const syntNotatka = (o = {}) => ({ id: 'n', patientId: 'P', title: 'Fikcyjna', body: 'Fikcyjna treść', category: 'inne', createdAtISO: T0, updatedAtISO: T0, rev: 1, ...o });
const syntNagrN = (o = {}) => ({ id: 'n', deletedAtISO: T0, rev: 1, ...o });
const syntStan = ({ karty = ['P'], nagrobki = [], wersje = [], kosz = [], notatki = [], nagrNotatek = [] } = {}) => ({
  patients: karty.map((p) => ({ patientId: p, header: { name: 'Testowy Jan' }, createdAtISO: T0, lastSavedAtISO: T0, snapshots: p === 'P' ? wersje : [] })),
  tombstones: nagrobki.map((p) => ({ patientId: p, deletedAtISO: T0 })),
  snapshotTombstones: kosz, patientNotes: notatki, patientNoteTombstones: nagrNotatek,
});
// Klasy różnic jednego rodzaju encji w D(X, Y).
const klasyRodzaju = (X, Y, rodzaj, kont = {}) => D(X, Y).filter((r) => r.rodzaj === rodzaj).map((r) => klasa(r, X, Y, kont));
// Tabela 3.6 jako literał (wiersz = klasa; kolumny: W1/W2r/W2s profilu podstawowego, W4 profilu podstawowego i p. 1–4 i P1e,
// W4 p. 5, W1/W2r/W2s profilu pełnego, W4 profilu pełnego, p. 6). '—' = czerwień, 'dowód' — zieleń tylko z dowodem
// (dowodWpisu). R4n w W4 p. 5: '—' (W4p nie jest tam liczony — P4); E1-katalog w W4 p. 5 dodatkowo tylko dla listy
// E1_KATALOG, createdAtISO-notatki w W4 pełnym tylko przy notatce z „Zostaw notatkę” (dozwolona()).
// Od E3-PR0b także kolumna 'flota' — pary z urządzeniem starszej aplikacji; dotychczasowe kolumny i wiersze bez zmian.
const TABELA_3_6 = {
  R2: ['tak', '—', '—', 'raport', '—', 'tak', '—'],
  R3: ['—', '—', '—', '—', '—', '—', '—'], // E3-PR0a: zero wystąpień
  R4a: ['tak', '—', '—', 'raport', '—', 'tak', '—'],
  R5: ['dowód', '—', '—', 'raport', '—', 'tak', '—'], // E3-PR0a: w profilu podstawowym z dowodem (dowodWpisu)
  'R4a′': ['—', '—', '—', 'raport', '—', 'tak', '—'],
  R4n: ['tak', 'tak', '—', 'raport', 'tak', 'tak', 'tak'],
  'createdAtISO-notatki': ['—', '—', '—', '—', '—', '—', '—'], // E3-PR0a: zero wystąpień
  D7: ['dowód', '—', '—', 'raport', 'raport', '—', '—'], // E3-PR0a: w profilu podstawowym z dowodem (dowodWpisu)
  [E1]: ['—', '—', 'tak', '—', '—', '—', '—'],
  [NPIK]: ['—', '—', '—', '—', '—', '—', '—'], // E3-PR0a: zero wystąpień
  [MIEJSCE_WIZYTY]: ['—', '—', '—', 'raport', '—', '—', '—'], // E3-PR0a (widoczna)
  [NAGROBEK_OPROZNIONEJ]: ['—', '—', '—', 'raport', 'raport', '—', '—'], // E3-PR0a (niewidoczna; W4 bez punktu stałego zostaje czerwone)
  [REKORD_ZLOZONY]: ['—', '—', '—', 'raport', '—', '—', '—'], // E3-PR0a (widoczna)
  // E3-PR0b: klasy par floty — tylko tabela 'flota' (para z urządzeniem starszej aplikacji, klasaParyFloty)
  [D_TOZSAMOSC]: ['—', '—', '—', '—', '—', '—', 'tak'],
  [D_POLE_221]: ['—', '—', '—', '—', '—', '—', 'tak'],
  [D_RETENCJA]: ['—', '—', '—', '—', '—', '—', 'tak'],
  // E3-PR0b2b (P-NOTATKA-POZNIEJSZA): pola chwili treści i oznaczenia notatki ucięte przez starszą aplikację.
  [D_CHWILE_NOTATKI]: ['—', '—', '—', '—', '—', '—', 'tak'],
};
const TABELE_3_6 = ['podstawowy', 'W4', 'W4:p5', 'pelny', 'pelny:W4', 'p6', 'flota'];
describe('A ≡ B, klasy 3.6: predykaty (pozytywy i negatywy), tabela DOZWOLONE, negatywy W4 i W4p', () => {
  d1();
  it('R2 — wersja na obu, równa poza rev, |Δrev| = 1; Δrev 2 albo inne pole → brak klasy', () => {
    const p = (a, b) => klasyRodzaju(syntStan({ wersje: [syntWersja(a)] }), syntStan({ wersje: [syntWersja(b)] }), 'wersja');
    expect(p({ rev: 1 }, { rev: 2 }), 'Δrev 1').toEqual(['R2']);
    expect(p({ rev: 1 }, { rev: 3 }), 'Δrev 2').toEqual([null]);
    expect(p({ rev: 1 }, { rev: 2, payload: syntPl({ user: { weight: 21 } }) }), 'Δrev 1 i masa').toEqual([null]);
    expect(p({ rev: 1 }, { rev: 2, updatedAtISO: T1 }), 'Δrev 1 i updatedAtISO').toEqual([null]);
    expect(klasyRodzaju(syntStan({ wersje: [syntWersja()] }), syntStan(), 'wersja'), 'wersja po jednej stronie').toEqual([null]);
  });
  it('R3 — nagrobek notatki na obu, równy poza rev, notatki nie ma po żadnej stronie; notatka po jednej stronie albo inne pole → brak klasy', () => {
    const X = syntStan({ nagrNotatek: [syntNagrN({ rev: 1 })] });
    expect(klasyRodzaju(X, syntStan({ nagrNotatek: [syntNagrN({ rev: 2 })] }), 'pnotetomb')).toEqual(['R3']);
    expect(klasyRodzaju(X, syntStan({ nagrNotatek: [syntNagrN({ rev: 2 })], notatki: [syntNotatka()] }), 'pnotetomb'), 'notatka po stronie Y').toEqual([null]);
    expect(klasyRodzaju(syntStan({ nagrNotatek: [syntNagrN({ rev: 1 })], notatki: [syntNotatka()] }), syntStan({ nagrNotatek: [syntNagrN({ rev: 2 })] }), 'pnotetomb'), 'notatka po stronie X').toEqual([null]);
    expect(klasyRodzaju(X, syntStan({ nagrNotatek: [syntNagrN({ rev: 2, deletedAtISO: T1 })] }), 'pnotetomb'), 'rev i deletedAtISO').toEqual([null]);
  });
  it('R4a / R4a′ — wpis kosza żywej karty na obu: opis i gwiazdka (R4a), z inną treścią (R4a′); karta z nagrobkiem albo tylko pola payload → nie R4a', () => {
    const zywa = { karty: ['P'] }, martwa = { karty: ['P'], nagrobki: ['P'] };
    const X = (s = zywa) => syntStan({ ...s, kosz: [syntKosz()] });
    const Y = (o, s = zywa) => syntStan({ ...s, kosz: [syntKosz(o)] });
    const gwiazdka = { rev: 2, updatedAtISO: T1, gwiazdka: true, payload: syntPl({ _pinned: true, _pinnedState: { pin: true } }) };
    expect(klasyRodzaju(X(), Y(gwiazdka), 'kosz'), 'opis i gwiazdka').toEqual(['R4a']);
    expect(klasyRodzaju(X(), Y({ rev: 2, updatedAtISO: T1 }), 'kosz'), 'sam opis — R4a przed D7 (pierwszy pasujący)').toEqual(['R4a']);
    expect(klasyRodzaju(X(martwa), Y(gwiazdka, martwa), 'kosz'), 'karta z nagrobkiem po obu stronach').toEqual([null]);
    expect(klasyRodzaju(X(zywa), Y(gwiazdka, martwa), 'kosz'), 'nagrobek karty po jednej stronie').toEqual([null]);
    expect(klasyRodzaju(X({ karty: [] }), Y(gwiazdka, { karty: [] }), 'kosz'), 'brak karty').toEqual([null]);
    expect(klasyRodzaju(X(), Y({ payload: syntPl({ _pinned: true }) }), 'kosz'), 'tylko pole payload (bez kont.kosz)').toEqual([null]);
    const masa = { rev: 2, updatedAtISO: T1, payload: syntPl({ user: { weight: 40 } }) };
    expect(klasyRodzaju(X(), Y(masa), 'kosz'), 'opis i masa').toEqual(['R4a′']);
    expect(klasyRodzaju(X(martwa), Y(masa, martwa), 'kosz'), 'opis i masa, karta z nagrobkiem').toEqual([null]);
    expect(klasyRodzaju(X(), Y({ payload: syntPl({ user: { weight: 40 } }) }), 'kosz'), 'sama masa (bez pola spoza payload)').toEqual([null]);
  });
  it('R4n — wpis kosza na obu, różni się tylko postacią gwiazdki w treści, widok Kosza obu stron równy; inny widok, brak odczytu Kosza albo inne pole → brak klasy', () => {
    const pin = syntPl({ _pinned: true, _pinnedState: { pin: true, at: T1 } }), bez = syntPl({ _pinned: false });
    const X = syntStan({ kosz: [syntKosz({ payload: pin })] }), Y = syntStan({ kosz: [syntKosz({ payload: bez })] });
    const widok = (pinned, p) => ({ snapshotId: 'v', patientId: 'P', pinned, patientExists: true, payload: p });
    expect(klasyRodzaju(X, Y, 'kosz', { kosz: { x: [widok(true, pin)], y: [widok(true, bez)] } }), 'widok równy (pinned jak pole widoku)').toEqual(['R4n']);
    expect(klasyRodzaju(X, Y, 'kosz', { kosz: { x: [widok(true, pin)], y: [widok(false, bez)] } }), 'inny widok (pinned)').toEqual([null]);
    expect(klasyRodzaju(X, Y, 'kosz', { kosz: { x: [widok(true, pin)], y: [] } }), 'wpis tylko w jednym widoku').toEqual([null]);
    expect(klasyRodzaju(X, Y, 'kosz'), 'bez odczytu Kosza').toEqual([null]);
    const Yrev = syntStan({ karty: ['P'], nagrobki: ['P'], kosz: [syntKosz({ payload: bez, rev: 2 })] });
    const Xm = syntStan({ karty: ['P'], nagrobki: ['P'], kosz: [syntKosz({ payload: pin })] });
    expect(klasyRodzaju(Xm, Yrev, 'kosz', { kosz: { x: [widok(true, pin)], y: [widok(true, bez)] } }), 'postać gwiazdki i rev (karta z nagrobkiem)').toEqual([null]);
  });
  it('R5 — wpis kosza tylko po jednej stronie, karty nie ma na żadnej, nagrobek karty na obu; nagrobek po jednej stronie albo karta → brak klasy', () => {
    const X = syntStan({ karty: [], nagrobki: ['P'], kosz: [syntKosz()] });
    expect(klasyRodzaju(X, syntStan({ karty: [], nagrobki: ['P'] }), 'kosz')).toEqual(['R5']);
    expect(klasyRodzaju(X, syntStan({ karty: [], nagrobki: [] }), 'kosz'), 'nagrobek tylko po stronie X').toEqual([null]);
    expect(klasyRodzaju(syntStan({ karty: [], kosz: [syntKosz()] }), syntStan({ karty: [], nagrobki: ['P'] }), 'kosz'), 'nagrobek tylko po stronie Y').toEqual([null]);
    expect(klasyRodzaju(X, syntStan({ karty: ['P'], nagrobki: ['P'] }), 'kosz'), 'karta po stronie Y').toEqual([null]);
  });
  it('createdAtISO-notatki i D7 — tylko pola z definicji (od E3-PR0a D7 także z revPary); pole spoza listy → brak klasy', () => {
    const n = (o) => klasyRodzaju(syntStan({ notatki: [syntNotatka()] }), syntStan({ notatki: [syntNotatka(o)] }), 'pnote');
    expect(n({ createdAtISO: T1 })).toEqual(['createdAtISO-notatki']);
    expect(n({ createdAtISO: T1, body: 'Fikcyjna treść 2' }), 'createdAtISO i treść').toEqual([null]);
    expect(n({ createdAtISO: T1, updatedAtISO: T1 }), 'createdAtISO i updatedAtISO').toEqual([null]);
    const k = (o, s = { karty: ['P'] }) => klasyRodzaju(syntStan({ ...s, kosz: [syntKosz()] }), syntStan({ ...s, kosz: [syntKosz(o)] }), 'kosz');
    expect(k({ koszISO: T1, zmianaISO: T1 }), 'koszISO, zmianaISO (żywa karta)').toEqual(['D7']);
    expect(k({ rev: 2, updatedAtISO: T1 }, { karty: ['P'], nagrobki: ['P'] }), 'rev, updatedAtISO (karta z nagrobkiem)').toEqual(['D7']);
    expect(k({ koszISO: T1, payload: syntPl({ user: { weight: 21 } }) }), 'koszISO i masa').toEqual([null]);
    expect(k({ koszISO: T1, deletedAtISO: T1 }), 'koszISO i deletedAtISO').toEqual([null]);
    expect(k({ revPary: [[T1, 2]] }), 'revPary (żywa karta)').toEqual(['D7']);
    expect(k({ revPary: [[T1, 2]], deletedAtISO: T1 }), 'revPary i deletedAtISO (żywa karta)').toEqual([null]);
  });
  it('E3-PR0a: R4a′ ze zmianaISO, R5 (opis wpisu Kosza karty usuniętej na obu), miejsce wizyty po „Scal pacjentów”, nagrobek karty opróżnionej, rekord złożony po jednej stronie — pozytywy i negatywy', () => {
    const zywa = { karty: ['P'] }, martwa = { karty: [], nagrobki: ['P'] };
    const ko = (o, s) => klasyRodzaju(syntStan({ ...s, kosz: [syntKosz()] }), syntStan({ ...s, kosz: [syntKosz(o)] }), 'kosz');
    expect(ko({ rev: 2, zmianaISO: T1, payload: syntPl({ user: { weight: 40 } }) }, zywa), 'R4a′ z zmianaISO').toEqual(['R4a′']);
    expect(ko({ deletedAtISO: T1, rev: 2, gwiazdka: true, zmianaISO: T1 }, martwa), 'R5 (opis), karta nieobecna i nagrobek na obu').toEqual(['R5']);
    expect(ko({ deletedAtISO: T1, payload: syntPl({ user: { weight: 40 } }) }, martwa), 'R5 (opis) z inną treścią').toEqual([null]);
    expect(ko({ deletedAtISO: T1 }, zywa), 'opis wpisu żywej karty (deletedAtISO)').toEqual([null]);
    expect(klasyRodzaju(syntStan({ ...martwa, kosz: [syntKosz()] }), syntStan({ karty: [], kosz: [syntKosz({ deletedAtISO: T1 })] }), 'kosz'), 'R5 (opis), nagrobek po jednej stronie').toEqual([null]);
    // miejsce wizyty: x pod P tylko po stronie X, pod Q tylko po stronie Y, ta sama masa i gwiazdka
    const karty = (k) => ({ patients: Object.entries(k).map(([pid, w]) => ({ patientId: pid, snapshots: w })), tombstones: [] });
    const x = syntWersja({ snapshotId: 'x' }), y = syntWersja({ snapshotId: 'y' });
    const X = karty({ P: [x], Q: [y] }), Y = karty({ Q: [y, x] });
    expect(D(X, Y).map((r) => `${r.rodzaj} ${r.klucz} ${klasa(r, X, Y)}`).sort(), 'karta i wersje').toEqual([`karta P ${MIEJSCE_WIZYTY}`, `wersja P/x ${MIEJSCE_WIZYTY}`, `wersja Q/x ${MIEJSCE_WIZYTY}`]);
    const Y2 = karty({ Q: [y, syntWersja({ snapshotId: 'x', payload: syntPl({ user: { weight: 40 } }) })] });
    expect(D(X, Y2).filter((r) => r.rodzaj === 'wersja').map((r) => klasa(r, X, Y2)), 'inna masa pod Q — wersje bez klasy').toEqual([null, null]);
    // nagrobek karty opróżnionej: nagrobek P tylko po jednej stronie, karty P nie ma po żadnej
    const N = { patients: [], tombstones: [{ patientId: 'P', deletedAtISO: T0 }] }, bez = { patients: [], tombstones: [] };
    expect(D(N, bez).map((r) => klasa(r, N, bez)), 'nagrobek tylko po jednej stronie').toEqual([NAGROBEK_OPROZNIONEJ]);
    const zKarta = karty({ P: [y] });
    expect(D(N, zKarta).filter((r) => r.rodzaj === 'ptomb').map((r) => klasa(r, N, zKarta)), 'karta P po drugiej stronie').toEqual([null]);
    // rekord złożony: ta sama chwila zmiany, późniejsza chwila treści z rejestrem złożonym i wyższą rev
    const zl = (o) => syntWersja({ updatedAtISO: T1, ...o });
    const RA = syntStan({ wersje: [zl({ rev: 3, payload: syntPl({ user: { weight: 17 }, _contentAtISO: T1, _pinnedState: { zl: true } }) })] });
    const RB = syntStan({ wersje: [zl({ rev: 1, payload: syntPl({ _contentAtISO: T0 }) })] });
    expect(klasyRodzaju(RA, RB, 'wersja'), 'rekord złożony').toEqual([REKORD_ZLOZONY]);
    const RA2 = syntStan({ wersje: [zl({ rev: 3, payload: syntPl({ user: { weight: 17 }, _contentAtISO: T1 }) })] });
    expect(klasyRodzaju(RA2, RB, 'wersja'), 'bez rejestru złożonego').toEqual([null]);
  });
  it('D: ścieżki zawsze niepuste — różnica bez wskazanej ścieżki (duplikat tożsamości w tablicy) daje (wartość) i brak klasy (P7)', () => {
    const nagr = (arr) => ({ patientNoteTombstones: [{ id: 't', rev: 1, deletedAtISO: T0, x: arr }] });
    const [a, b] = [kanon(nagr([{ id: 'q', v: 1 }, { id: 'q', v: 2 }])), kanon(nagr([{ id: 'q', v: 2 }]))];
    const d = D(a, b);
    expect(d.map((r) => [r.rodzaj, r.klucz, r.sciezki])).toEqual([['pnotetomb', 't', ['(wartość)']]]);
    expect(d.map((r) => klasa(r, a, b, {})), 'pusta lista ścieżek nie spełnia predykatu').toEqual([null]);
  });
  it('E3-PR0b: klasy par floty (tabela „flota”) — tożsamość wizyty (z dowodem odcisku), pole nieznane 221, retencja starszej aplikacji (obecność wersji); ta sama różnica w parze dwóch bieżących urządzeń i warunki bez dowodu — bez klasy', async () => {
    const wiz = { version: 1, visitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', patientId: 'P', clinicalDateISO: '2026-03-02', createdAtISO: '2026-03-02T00:00:00.000Z', origin: 'legacy-inferred' };
    const tresc = syntPl(), zW = { ...tresc, visit: wiz };
    const rej = (t, h) => ({ ...t, _pinnedState: { pin: false, at: null, h }, _contentAtISO: T0 });
    const starsza = syntStan({ wersje: [syntWersja({ payload: rej(tresc, LO.odcisk(tresc)) })] });
    const biezaca = syntStan({ wersje: [syntWersja({ payload: rej(zW, LO.odcisk(zW)) })] });
    const nieswiezy = syntStan({ wersje: [syntWersja({ payload: rej(zW, LO.odcisk({ ...zW, visit: { ...wiz, visitId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } })) })] });
    const klasy = async (X, Y, kont) => (await sklasyfikuj(D(X, Y), X, Y, kont, null)).map((r) => [r.rodzaj, r.klasa, r.dozwolona, r.wariantFloty || null]);
    const flota = (st, app = 'S276') => ({ tabela: 'flota', starsza: st, appStarszej: app });
    expect(await klasy(starsza, biezaca, flota('x')), 'tożsamość wizyty, odcisk przeliczony').toEqual([['wersja', D_TOZSAMOSC, 'tak', 'tożsamość wizyty, odcisk przeliczony']]);
    expect(await klasy(biezaca, starsza, flota('y', 'S221')), 'strona starszej jako y').toEqual([['wersja', D_TOZSAMOSC, 'tak', 'tożsamość wizyty, odcisk przeliczony']]);
    expect(await klasy(starsza, nieswiezy, flota('x')), 'nieświeży odcisk po stronie bieżącej').toEqual([['wersja', null, false, null]]);
    expect(await klasy(starsza, biezaca, { tabela: 'W4' }), 'para dwóch bieżących').toEqual([['wersja', null, false, null]]);
    // tożsamość po stronie bieżącej z kartą wizyty innej niż karta rekordu albo bez visitId — bez klasy
    for (const [opis, v] of [['karta wizyty Q zamiast P', { ...wiz, patientId: 'Q' }], ['bez visitId', { ...wiz, visitId: '' }]]) {
      const zle = { ...tresc, visit: v };
      expect(await klasy(starsza, syntStan({ wersje: [syntWersja({ payload: rej(zle, LO.odcisk(zle)) })] }), flota('x')), opis).toEqual([['wersja', null, false, null]]);
    }
    // wpis Kosza: pola tożsamości i pola nieznane 221
    const koszS = syntStan({ kosz: [syntKosz()] });
    const koszN = syntStan({ kosz: [syntKosz({ visitIdentity: { version: 1, visitId: wiz.visitId }, koszISO: T1, revPary: 2 })] });
    expect(await klasy(koszS, koszN, flota('x', 'S221')), 'Kosz 221').toEqual([['kosz', D_POLE_221, 'tak', 'pola Kosza 221']]);
    expect(await klasy(koszS, koszN, flota('x', 'S276')), 'Kosz 276 (koszISO i revPary zna): D7 przy tożsamości, bez tabeli wołającego — niedozwolona').toEqual([['kosz', 'D7', false, 'D7 przy tożsamości wpisu Kosza nieznanej starszej aplikacji']]);
    expect(await klasy(koszS, koszN, { ...flota('x', 'S276'), tabelaBiezacych: 'pelny' }), 'Kosz 276: D7 przy tożsamości, tabela wołającego pelny').toEqual([['kosz', 'D7', 'raport', 'D7 przy tożsamości wpisu Kosza nieznanej starszej aplikacji']]);
    expect(await klasy(koszS, koszN, { ...flota('x', 'S276'), tabelaBiezacych: 'W4' }), 'Kosz 276: D7 przy tożsamości, tabela wołającego W4').toEqual([['kosz', 'D7', false, 'D7 przy tożsamości wpisu Kosza nieznanej starszej aplikacji']]);
    const koszNChwila = syntStan({ kosz: [syntKosz({ visitIdentity: { version: 1, visitId: wiz.visitId }, koszISO: T1, deletedAtISO: T1 })] });
    expect(await klasy(koszS, koszNChwila, { ...flota('x', 'S276'), tabelaBiezacych: 'pelny' }), 'Kosz 276: tożsamość, koszISO i chwila usunięcia — bez klasy').toEqual([['kosz', null, false, null]]);
    const koszTylkoTozs = syntStan({ kosz: [syntKosz({ visitIdentity: { version: 1, visitId: wiz.visitId } })] });
    expect(await klasy(koszS, koszTylkoTozs, flota('x', 'S276')), 'Kosz 276: tylko visitIdentity').toEqual([['kosz', D_TOZSAMOSC, 'tak', 'tożsamość wpisu Kosza']]);
    // nagrobek notatki: deletedWithPatient tylko u bieżącej (221)
    const nN = syntStan({ nagrNotatek: [syntNagrN({ deletedWithPatient: true })] }), nS = syntStan({ nagrNotatek: [syntNagrN()] });
    expect(await klasy(nS, nN, flota('x', 'S221')), 'nagrobek notatki 221').toEqual([['pnotetomb', D_POLE_221, 'tak', 'nagrobek notatki usuniętej z kartą']]);
    expect(await klasy(nS, nN, flota('x', 'S276')), 'nagrobek notatki 276').toEqual([['pnotetomb', null, false, null]]);
    // retencja starszej aplikacji: wersja tylko u bieżącej, u starszej nagrobek retencji, u bieżącej głowa wizyty
    const ret = syntStan({ kosz: [{ snapshotId: 'v', patientId: 'P', deletedAtISO: T1, powod: 'retencja', rev: 1 }] });
    expect(await klasy(ret, biezaca, flota('x')), 'retencja v1').toEqual([['kosz', null, false, null], ['wersja', D_RETENCJA, 'tak', 'wersja tylko u bieżącej, wpis retencji u starszej']]);
    expect(await klasy(syntStan(), biezaca, flota('x')), 'bez nagrobka retencji').toEqual([['wersja', null, false, null]]);
    const nowsza = syntStan({ wersje: [syntWersja({ payload: rej(zW, LO.odcisk(zW)) }), syntWersja({ snapshotId: 'w', savedAtISO: T1, payload: rej(zW, LO.odcisk(zW)) })] });
    expect((await klasy(ret, nowsza, flota('x'))).filter(([r]) => r === 'wersja'), 'nowsza wersja tej samej wizyty — v nie jest głową').toEqual([['wersja', null, false, null], ['wersja', null, false, null]]);
  }, 10_000);
  it('tabela DOZWOLONE = tabela 3.6 (literał) i reguły dozwolona(); klasa null nigdzie', () => {
    const oczek = Object.fromEntries(TABELE_3_6.map((t) => [t, {}]));
    for (const [kl, wiersz] of Object.entries(TABELA_3_6)) wiersz.forEach((w, i) => { if (w !== '—') oczek[TABELE_3_6[i]][kl] = w; });
    expect(json(DOZWOLONE), 'DOZWOLONE (3.6)').toEqual(oczek);
    expect(Object.isFrozen(DOZWOLONE)).toBe(true);
    const r = { rodzaj: 'pnote', klucz: 'n' };
    expect(dozwolona('createdAtISO-notatki', r, { tabela: 'pelny:W4', wskrzeszone: new Set() }), 'pelny:W4 bez „Zostaw notatkę”').toBe(false);
    expect(dozwolona('createdAtISO-notatki', r, { tabela: 'pelny:W4', wskrzeszone: new Set(['n']) }), 'pelny:W4 po „Zostaw notatkę” (od E3-PR0a bez wpisu w tabeli)').toBe(false);
    expect(dozwolona('R4n', r, { tabela: 'W4:p5', przebieg: 'E1-C' }), 'R4n w W4 p. 5 (bez W4p)').toBe(false);
    for (const t of TABELE_3_6) expect(dozwolona(null, r, { tabela: t, przebieg: 'E1-C', wskrzeszone: new Set(['n']) }), `null w ${t}`).toBe(false);
  });
  const nrP6 = (nazwa) => Object.keys(P6).indexOf(nazwa);
  it('W4p — negatywy: R4-a (inny widok Kosza, inna gwiazdka po „Przywróć”) i R4-a′ (inna masa) nie przechodzą; R4n przechodzi', async () => {
    const wynik = {};
    for (const nazwa of ['R4-a', 'R4-a′', 'R4n (R4-b)']) {
      const u = await p6swiat(nrP6(nazwa), P6[nazwa], 'zdarzenia');
      const p = await kr_cicho(u.S, async () => w4p(u.S, u.A, u.B, u.v, u.P));
      wynik[nazwa] = { ok: p.ok, widokRowny: p.widokRowny, rowne: p.rowne, zniknal: p.zniknal };
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
    }
    expect(wynik).toEqual({
      'R4-a': { ok: false, widokRowny: false, rowne: false, zniknal: true }, // po „Przywróć” gwiazdka tylko na A
      'R4-a′': { ok: false, widokRowny: false, rowne: false, zniknal: true },
      'R4n (R4-b)': { ok: true, widokRowny: true, rowne: true, zniknal: true },
    });
  }, 120_000);
  it('dowód niewidoczności wpisu Kosza (dowodWpisu, E3-PR0a): R4n (R4-b) — „Przywróć” na obu, ten sam wynik; R4-a — wiersz okna Kosza różny; R5-0 — wpis karty, której nie ma, poza oknem; klucz z sufiksem #n; różnica spoza Kosza i nierozstrzygnięty dowód — czerwień', async () => {
    const wynik = {};
    for (const nazwa of ['R4n (R4-b)', 'R4-a', 'R5-0']) {
      const u = await p6swiat(nrP6(nazwa), P6[nazwa], 'zdarzenia');
      const d = await kr_cicho(u.S, async () => dowodWpisu(u.S, u.A, u.B, `${u.v}|${u.P}#2`));
      wynik[nazwa] = { ok: d.ok, przywroc: d.przywroc };
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
    }
    expect(wynik).toEqual({
      'R4n (R4-b)': { ok: true, przywroc: 'ok' },
      'R4-a': { ok: false, przywroc: null },
      'R5-0': { ok: true, przywroc: 'poza oknem' },
    });
    const d = await potwierdz({ stat: {} }, null, null, [{ rodzaj: 'wersja', klucz: 'P/v', klasa: 'D7', dozwolona: 'dowód' }, { rodzaj: 'wersja', klucz: 'P/w', klasa: 'R2', dozwolona: 'tak' }]);
    expect(d.map((r) => [r.klasa, r.dozwolona]), 'dowód tylko dla wpisu Kosza; reszta bez zmian').toEqual([['D7', false], ['R2', 'tak']]);
    expect(dozwolona('D7', { rodzaj: 'kosz', klucz: 'v|P' }, { tabela: 'podstawowy' }), 'D7 w profilu podstawowym — tylko z dowodem').toBe('dowód');
    const bezDowodu = { w3Bledy: [], w4Bledy: [], w4p: [], brakSpoczynku: [], w2sLista: [], w1Bledy: [{ krok: 1, roznice: [{ klucz: 'v|P', klasa: 'D7', dozwolona: 'dowód' }] }], w2rBledy: [] };
    expect(zielenProfilu(bezDowodu).W1BezKlasy.length, 'D7 bez rozstrzygniętego dowodu — czerwień').toBe(1);
  }, 120_000);
  it('W4 i W4 trzech urządzeń — R4n bez udanego W4p jest czerwone (wynik W4p nie jest pomijany)', async () => {
    const u = await p6swiat(nrP6('R4n (R4-b)'), P6['R4n (R4-b)'], 'zdarzenia');
    const zly = async () => ({ ok: false, widokRowny: true, rowne: false, zniknal: true, roznice: [] });
    const skrot = (w) => [w.ok, w.r4n, w.w4p.map((p) => p.ok)];
    expect(skrot(await w4(u.S, u.A, u.B, { tabela: 'p6' }, { warianty: ['PO-A'] })), 'prawdziwe W4p').toEqual([true, 1, [true]]);
    expect(skrot(await w4(u.S, u.A, u.B, { tabela: 'p6' }, { warianty: ['PO-A'], dowodR4n: zly })), 'W4p zawodzi').toEqual([false, 1, [false]]);
    expect(skrot(await w4(u.S, u.A, u.B, { tabela: 'W4' }, { warianty: ['PO-A'], dowodR4n: zly })), 'W4p zawodzi (tabela W4)').toEqual([false, 1, [false]]);
    krok(); const C = await urzadzenie(u.S, 'C', u.A); // trzecie urządzenie: bliźniak A (ta sama postać gwiazdki co A)
    const trzy = async (o) => { const w = await w4Trzy(u.S, [u.A, u.B, C], u.n, o); return [w.ok, w.pary.map((p) => p.w4p.map((x) => x.ok))]; };
    const prawdziwe = await trzy();
    expect(prawdziwe[0], 'W4 trzech urządzeń: prawdziwe W4p').toBe(true);
    expect(prawdziwe[1].flat().length, 'co najmniej jedna para z R4n').toBeGreaterThan(0);
    expect((await trzy({ dowodR4n: zly }))[0], 'W4 trzech urządzeń: W4p zawodzi').toBe(false);
  }, 120_000);
  it('W4 — negatywy: różnica niedozwolona w tabeli W4 (notatka pod inną kartą) i brak punktu stałego są czerwone', async () => {
    const nazwaN = 'Scal pacjentów P → Q na A, edycja notatki karty P na B (bez wiedzy o scaleniu)';
    const npik = await p6swiat(nrP6(nazwaN), P6[nazwaN], 'zdarzenia');
    const roz = (w) => [w.ok, w.warianty.map((x) => x.roznice.map((r) => [r.rodzaj, r.klasa, r.dozwolona]))];
    // Od E2-PR3c4 scenariusz jest zbieżny: różnicę „notatka pod inną kartą” wstrzykujemy w migawkę Y po każdej rundzie
    // (notatka n pod usuniętą kartą P; magazyn bez zmian), żeby sprawdzić samą tabelę W4.
    const podP = async (X, Y) => {
      await rundaPO(X, Y);
      const s = json(Y.stan);
      for (const x of s.patientNotes || []) if (x.id === npik.nId) x.patientId = npik.P;
      ustawStan(Y, s);
    };
    expect(roz(await w4(npik.S, npik.A, npik.B, { tabela: 'p6' }, { warianty: ['PO-A'] })), 'p. 6 bez wstrzyknięcia: zbieżne').toEqual([true, [[]]]);
    expect(roz(await w4(npik.S, npik.A, npik.B, { tabela: 'p6' }, { warianty: ['PO-A'], runda: podP })), 'p. 6: czerwień (od E3-PR0a bez wpisu w tabeli p6)').toEqual([false, [[['pnote', NPIK, false]]]]);
    expect(roz(await w4(npik.S, npik.A, npik.B, { tabela: 'W4' }, { warianty: ['PO-A'], runda: podP })), 'tabela W4: czerwień').toEqual([false, [[['pnote', NPIK, false]]]]);
    await sprzatnijUrzadzenia(); vi.restoreAllMocks();
    const u = await p6swiat(nrP6('R2-0'), P6['R2-0'], 'zdarzenia');
    const stale = await w4(u.S, u.A, u.B, { tabela: 'W4' }, { warianty: ['PO-A'] });
    expect([stale.ok, stale.warianty[0].punktStaly, stale.warianty[0].roznice], 'R2-0: W4 zielone, punkt stały').toEqual([true, true, []]);
    // druga runda zmienia eksport jednego klonu (zapis po wymianie) — punkt stały nie zachodzi
    const zmieniajaca = async (X, Y, nr) => {
      await rundaPO(X, Y);
      if (nr === 2) { await X.v.saveNote({ title: 'Fikcyjny szablon po wymianie', body: 'Fikcyjna' }); ustawStan(X, await eksport(X)); }
    };
    const bez = await w4(u.S, u.A, u.B, { tabela: 'W4' }, { warianty: ['PO-A'], runda: zmieniajaca });
    expect([bez.ok, bez.warianty[0].punktStaly], 'bez punktu stałego: czerwień').toEqual([false, false]);
  }, 120_000);
});

// ── Właściwość A ≡ B (program losowy) ───────────────────────────────────────────────────────────────────────────────
// Ziarna: E2_AB_ZIARNA (domyślnie 8) od E2_AB_START (1); E2_AB_KROKI — liczba mutacji na ziarno (domyślnie 60–120
// z ziarna, łącznie na A i B). Krok zegara 1–120 s (nagrobki < 365 dni, treść kosza < 30 dni — filtry nic nie tną).
const ILE_ZIAREN = Number(process.env.E2_AB_ZIARNA) || 8;
const START_ZIAREN = Number(process.env.E2_AB_START) || 1;
const ZIARNA = Array.from({ length: ILE_ZIAREN }, (_, i) => START_ZIAREN + i);
const KROKI = Number(process.env.E2_AB_KROKI) || 0;
// E2_AB_WYNIKI=plik — wynik każdego ziarna (liczniki, różnice, dziennik operacji) dopisywany jako JSONL (pomiar).
const WYNIKI = { podstawowy: [], pelny: [], 'podstawowy:ogon': [], 'pelny:ogon': [], 'bez-polaczenia': [], determinizm: [] };
const wybierz = (los, lista) => lista[Math.floor(los() * lista.length)];
const masa = (los) => 15 + Math.floor(los() * 300) / 10;
// Mutacje profilu podstawowego (projekt.md 7.4): zapis karty i nowej wersji, poprawka w miejscu (preserveSavedAt),
// gwiazdka, kosz (nigdy najnowszej wersji karty na tym urządzeniu — inaczej znane ograniczenie E1 „obecność”, w którym
// także bloby dają różne urządzenia różnie), „Przywróć”, „Usuń pacjenta”, notatka pacjenta, notatka biblioteki, lista,
// zmiana hasła (iteracje 1000). Profil pełny dodatkowo: retencja, „Scal pacjentów” z koszem po scaleniu, przypięta
// wizyta w retencji i „Zostaw notatkę” (wskrzeszenie notatki pacjenta jak w odtworzeniu R3-E1).
const WAGI = {
  podstawowy: { nowaKarta: 7, nowaWersja: 16, poprawka: 14, gwiazdka: 8, kosz: 10, przywroc: 6, usunPacjenta: 4, notatkaPacjenta: 8, usunNotatkePacjenta: 3, notatka: 5, usunNotatke: 2, lista: 5, usunListe: 2, haslo: 2 },
  pelny: { nowaKarta: 7, nowaWersja: 16, poprawka: 14, gwiazdka: 8, kosz: 10, przywroc: 6, usunPacjenta: 4, notatkaPacjenta: 8, usunNotatkePacjenta: 3, notatka: 5, usunNotatke: 2, lista: 5, usunListe: 2, haslo: 2, retencja: 5, scal: 4, retencjaPrzypietej: 3, zostawNotatke: 3 },
};
function losujOperacje(los, profil) {
  const w = WAGI[profil];
  let r = los() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) { r -= v; if (r < 0) return k; }
  return 'nowaKarta';
}
async function wersjaZTresca(U, pid, sid) {
  const p = await U.v.getPatient(pid);
  return p && p.snapshots.find((s) => s.snapshotId === sid);
}
// Jedna mutacja na X; false, gdy warunek wstępny nie jest spełniony (nic się nie dzieje, losowanie od nowa).
async function losowaMutacja(S, X, profil) {
  const los = S.los;
  const op = losujOperacje(los, profil);
  const karty = X.stan.patients || [];
  const karta = karty.length ? wybierz(los, karty) : null;
  const wersja = karta ? wybierz(los, karta.snapshots) : null;
  const nr = (pid) => S.indeks.get(pid) || 1;
  switch (op) {
    case 'nowaKarta': {
      if (karty.length >= 7) return false;
      S.nrKarty += 1;
      const i = S.nrKarty;
      await mutacja(S, X, `nowa karta ${i}`, async () => { const r = await X.d.zapiszKarte(i, { masa: masa(los) }); S.indeks.set(r.patientId, i); return r; });
      return true;
    }
    case 'nowaWersja':
      if (!karta) return false;
      await mutacja(S, X, `nowa wersja ${nr(karta.patientId)}`, () => X.d.zapiszKarte(nr(karta.patientId), { wzrost: 100 + Math.floor(los() * 60), masa: masa(los), zapis: { patientId: karta.patientId, forceNewSnapshot: true } }));
      return true;
    case 'poprawka': {
      if (!wersja) return false;
      const s = await wersjaZTresca(X, karta.patientId, wersja.snapshotId);
      if (!s || !s.payload) return false;
      const kg = masa(los);
      await mutacja(S, X, `poprawka ${nr(karta.patientId)}/${wersja.snapshotId.slice(0, 4)} ${kg} kg`, () => X.v.updateSnapshotPayload(karta.patientId, wersja.snapshotId, { ...s.payload, user: { ...s.payload.user, weight: kg } }, { preserveSavedAt: true }));
      return true;
    }
    case 'gwiazdka': {
      if (!wersja) return false;
      const s = await wersjaZTresca(X, karta.patientId, wersja.snapshotId);
      if (!s || !s.payload) return false;
      await mutacja(S, X, `${s.pinned ? 'odpięcie' : 'gwiazdka'} ${nr(karta.patientId)}/${wersja.snapshotId.slice(0, 4)}`, () => X.v.setSnapshotPinned(karta.patientId, wersja.snapshotId, !s.pinned));
      return true;
    }
    case 'kosz': {
      if (!karta || karta.snapshots.length < 2) return false;
      const najnowsza = naj(karta.snapshots).snapshotId;
      const cel = wybierz(los, karta.snapshots.filter((s) => s.snapshotId !== najnowsza));
      await mutacja(S, X, `kosz ${nr(karta.patientId)}/${cel.snapshotId.slice(0, 4)}`, () => X.v.moveSnapshotToTrash(karta.patientId, cel.snapshotId, { odepnij: true }));
      return true;
    }
    case 'przywroc': {
      const ids = new Set(karty.map((p) => p.patientId));
      const wKartach = new Set(karty.flatMap((p) => p.snapshots.map((s) => s.snapshotId)));
      const kosz = (await X.v.listTrashedSnapshots()).filter((e) => ids.has(e.patientId) && !wKartach.has(e.snapshotId));
      if (!kosz.length) return false;
      const e = wybierz(los, kosz);
      await mutacja(S, X, `przywróć ${nr(e.patientId)}/${e.snapshotId.slice(0, 4)}`, () => X.v.restoreTrashedSnapshot(e.patientId, e.snapshotId));
      return true;
    }
    case 'usunPacjenta':
      if (!karta || karty.length < 2) return false;
      await mutacja(S, X, `usuń pacjenta ${nr(karta.patientId)}`, () => X.v.removePatient(karta.patientId));
      return true;
    case 'notatkaPacjenta': {
      const notatki = (X.stan.patientNotes || []).filter((n) => karty.some((p) => p.patientId === n.patientId));
      if (notatki.length && los() < 0.4) {
        const n = wybierz(los, notatki);
        await mutacja(S, X, `edycja notatki pacjenta ${n.id.slice(0, 4)}`, () => X.v.savePatientNote({ id: n.id, patientId: n.patientId, title: n.title || 'Fikcyjna', body: `Fikcyjna treść ${Math.floor(los() * 1000)}`, category: 'inne' }));
        return true;
      }
      if (!karta) return false;
      await mutacja(S, X, `notatka pacjenta ${nr(karta.patientId)}`, () => X.v.savePatientNote({ patientId: karta.patientId, title: 'Fikcyjna notatka', body: `Fikcyjna treść ${Math.floor(los() * 1000)}`, category: 'inne' }));
      return true;
    }
    case 'usunNotatkePacjenta': {
      const notatki = X.stan.patientNotes || [];
      if (!notatki.length) return false;
      const n = wybierz(los, notatki);
      await mutacja(S, X, `usuń notatkę pacjenta ${n.id.slice(0, 4)}`, () => X.v.removePatientNote(n.id));
      return true;
    }
    case 'notatka': {
      const notatki = X.stan.notes || [];
      if (notatki.length && los() < 0.4) {
        const n = wybierz(los, notatki);
        await mutacja(S, X, `edycja notatki ${n.id.slice(0, 4)}`, () => X.v.saveNote({ id: n.id, title: n.title || 'Fikcyjny szablon', body: `Fikcyjny ${Math.floor(los() * 1000)}` }));
        return true;
      }
      await mutacja(S, X, 'notatka biblioteki', () => X.v.saveNote({ title: 'Fikcyjny szablon', body: `Fikcyjny ${Math.floor(los() * 1000)}` }));
      return true;
    }
    case 'usunNotatke': {
      const notatki = X.stan.notes || [];
      if (!notatki.length) return false;
      const n = wybierz(los, notatki);
      await mutacja(S, X, `usuń notatkę ${n.id.slice(0, 4)}`, () => X.v.removeNote(n.id));
      return true;
    }
    case 'lista': {
      const listy = X.stan.patientLists || [];
      const czlonkowie = karty.filter(() => los() < 0.5).map((p) => p.patientId);
      if (listy.length && los() < 0.4) {
        const l = wybierz(los, listy);
        await mutacja(S, X, `edycja listy ${l.id.slice(0, 4)}`, () => X.v.savePatientList({ id: l.id, name: l.name || 'Fikcyjna lista', memberIds: czlonkowie }));
        return true;
      }
      await mutacja(S, X, 'lista', () => X.v.savePatientList({ name: `Fikcyjna lista ${Math.floor(los() * 100)}`, memberIds: czlonkowie }));
      return true;
    }
    case 'usunListe': {
      const listy = X.stan.patientLists || [];
      if (!listy.length) return false;
      const l = wybierz(los, listy);
      await mutacja(S, X, `usuń listę ${l.id.slice(0, 4)}`, () => X.v.deletePatientList(l.id));
      return true;
    }
    case 'haslo':
      await zmianaHasla(S, X);
      return true;
    case 'zostawNotatke': {
      // „Zostaw notatkę” (P5): zapis notatki pacjenta o znanym id, której tu już nie ma (edytor
      // otwarty przed usunięciem na tym albo innym urządzeniu) — wskrzeszenie od rev nagrobka (vilda_vault.js:7662, 7670).
      const nagr = (X.stan.patientNoteTombstones || []).filter((t) => X.znaneNotatki.has(t.id) && karty.some((p) => p.patientId === X.znaneNotatki.get(t.id).patientId));
      if (!nagr.length) return false;
      const t = wybierz(los, nagr);
      const z = X.znaneNotatki.get(t.id);
      S.wskrzeszone.add(t.id);
      await mutacja(S, X, `zostaw notatkę ${t.id.slice(0, 4)}`, () => X.v.savePatientNote({ id: t.id, patientId: z.patientId, title: z.title || 'Fikcyjna notatka', body: `Fikcyjna treść zostawiona ${Math.floor(los() * 1000)}`, category: 'inne' }));
      return true;
    }
    case 'retencja':
      if (!karta || karta.snapshots.length < 2) return false;
      await mutacja(S, X, `retencja ${nr(karta.patientId)}`, () => X.v.pruneSnapshotsForPatient(karta.patientId, { recentHours: 0 }));
      return true;
    case 'retencjaPrzypietej': {
      if (!karta || karta.snapshots.length < 2) return false;
      const najnowsza = naj(karta.snapshots).snapshotId;
      const cel = wybierz(los, karta.snapshots.filter((s) => s.snapshotId !== najnowsza));
      const s = await wersjaZTresca(X, karta.patientId, cel.snapshotId);
      if (!s || !s.payload) return false;
      if (!s.pinned) await mutacja(S, X, `gwiazdka ${nr(karta.patientId)}/${cel.snapshotId.slice(0, 4)}`, () => X.v.setSnapshotPinned(karta.patientId, cel.snapshotId, true));
      krok(1000 + Math.floor(los() * 60e3));
      await mutacja(S, X, `retencja przypiętej ${nr(karta.patientId)}`, () => X.v.pruneSnapshotsForPatient(karta.patientId, { recentHours: 0 }));
      return true;
    }
    case 'scal': {
      if (karty.length < 2) return false;
      const z = karta, na = wybierz(los, karty.filter((p) => p.patientId !== z.patientId));
      await mutacja(S, X, `Scal pacjentów ${nr(z.patientId)} → ${nr(na.patientId)}`, () => X.v.mergePatients(z.patientId, na.patientId));
      if (los() < 0.5) {
        krok(1000 + Math.floor(los() * 60e3));
        const cel = (X.stan.patients || []).find((p) => p.patientId === na.patientId);
        if (cel && cel.snapshots.length >= 2) {
          const najnowsza = naj(cel.snapshots).snapshotId;
          const w = wybierz(los, cel.snapshots.filter((q) => q.snapshotId !== najnowsza));
          await mutacja(S, X, `kosz po scaleniu ${nr(na.patientId)}/${w.snapshotId.slice(0, 4)}`, () => X.v.moveSnapshotToTrash(na.patientId, w.snapshotId, { odepnij: true }));
        }
      }
      return true;
    }
    default: throw new Error('nieznana operacja ' + op);
  }
}
// Dostawa losowa: kierunek, FIFO-prefiks k (połowa dostaw pełna), czasem powtórka sufiksu.
async function losowaDostawa(S, A, B) {
  const los = S.los;
  const [X, Y] = los() < 0.5 ? [A, B] : [B, A];
  const c = kursor(S, X, Y);
  const cofnij = c > 0 && los() < 0.15 ? 1 + Math.floor(los() * Math.min(c, 4)) : 0;
  const oczekujace = X.Q.length - c + cofnij;
  if (!oczekujace) return;
  const k = los() < 0.5 ? oczekujace : 1 + Math.floor(los() * oczekujace);
  S.losowa = los() < 0.3;
  await dostawa(S, X, Y, { k, cofnij });
  S.losowa = false;
}
// Punkt spoczynku: spoczynek, W1 i W2r (jak dotąd), potem NOWE pomiary (izolowane): klasy W1, W4 i W4p.
async function punktSpoczynku(S, A, B, { ostatni = false } = {}) {
  S.stat.spoczynki += 1;
  const r = await spoczynek(S, A, B);
  if (r === null) { S.stat.brakSpoczynku.push({ krok: S.nrKroku, ostatnie: S.dziennik.slice(-10) }); return; }
  const roznice = await w1(A, B);
  const wpis = roznice ? { krok: S.nrKroku, ostatnie: S.dziennik.slice(-10), sciezki: roznice } : null;
  if (wpis) S.stat.w1Bledy.push(wpis);
  S.stat.w2r += 1;
  for (const [X, Y] of [[A, B], [B, A]]) {
    const r2 = await w2r(S, X, Y);
    if (r2) S.stat.w2rBledy.push({ krok: S.nrKroku, strona: X.nazwa, sciezki: [...r2], klasy: klasyPunktu(r2.roznice), roznice: r2.roznice.map(skrotRoznicy) });
  }
  let d1 = null;
  if (wpis) {
    d1 = await potwierdz(S, A, B, await w1Klasy(S, A, B, { tabela: S.profil }));
    Object.assign(wpis, { klasy: klasyPunktu(d1), roznice: d1.map(skrotRoznicy) });
  }
  // Wyrocznia „nie zginęła ostatnia zmiana” (E3-PR0a): W1 na żywych urządzeniach, W4 na klonach (opisz w4).
  const wyrW1 = wyrOcena(S, 'W1', 'W1', await wyrWidoki(S, { A, B }));
  const opisz = async (A1, B1) => ({ wyr: await wyrWidokiKlonow({ A: A1, B: B1 }) });
  // W4 (3.2): w każdym punkcie spoczynku obie pary; przy przekroczeniu celu czasu (3.3) PO-B tylko w ostatnim punkcie.
  const warianty = S.tylkoPOA && !ostatni ? ['PO-A'] : ['PO-A', 'PO-B'];
  // Licznik odsyłania (E3-PR0b): pół wymiany w pierwszym obiegu wymiany każdej pary (źródło 'w4'; wymianaPOLicz).
  const w = await w4(S, A, B, { tabela: S.profil === 'pelny' ? 'pelny:W4' : 'W4', wskrzeszone: S.wskrzeszone }, { warianty, opisz, ...(S.odsyl ? { runda: (X, Y, nr) => wymianaPOLicz(S, X, Y, nr === 1) } : {}) });
  const wyrW4 = [];
  for (const x of w.warianty) { wyrW4.push(...wyrOcena(S, 'W4', `W4 ${x.wariant}`, x.opis.wyr)); delete x.opis; }
  if (SCISLE) {
    // Tryb ścisły: W1 = ∅ poza klasami niewidocznymi z dowodem; wyrocznia — w W1 żadnego naruszenia, którego nie ma też
    // po W4 tego punktu.
    const scisle = d1 ? await scisleW1(S, A, B, d1) : [];
    const poza = new Set(wyrW4.map(WYR.kluczNaruszenia));
    scisle.push(...wyrW1.filter((x) => !poza.has(WYR.kluczNaruszenia(x))).map((x) => ({ przyczyna: 'wyrocznia: W1 poza W4', klasa: x.klasa, klucz: `${x.urz} ${x.encja} ${x.et} ${x.rodzaj}` })));
    for (const x of scisle) S.stat.scisle.push({ krok: S.nrKroku, ...x });
    if (WYR_PLIK && scisle.length) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'scisle', swiat: S.wyrSwiat, ziarno: S.ziarno, krok: S.nrKroku, scisle }) + '\n');
  }
  S.stat.w4 += 1;
  S.stat.w4R4n += new Set(w.w4p.map((p) => p.klucz)).size; // encje R4n punktu (krok|klucz), nie warianty PO-A/PO-B (P8)
  for (const p of w.w4p) S.stat.w4p.push({ krok: S.nrKroku, ...p });
  const klasyW4 = [...new Set(w.warianty.flatMap((x) => x.roznice.map((q) => q.klasa || 'null')))].sort();
  if (klasyW4.length) S.stat.w4Klasy.push({ krok: S.nrKroku, klasy: klasyW4 });
  if (!w.ok) S.stat.w4Bledy.push({ krok: S.nrKroku, ostatnie: S.dziennik.slice(-10), warianty: w.warianty });
}
// Opcje (E2-PR2b): koalescencja 'ogon' — kolejki z łączeniem wpisów (doKolejkiOgon); w2s false — bez W2s i W3 w punktach
// pełnej dostawy (inny program ziarna: klon W2s w kolejności losowej zużywa losowania).
// E3-PR0a: dostawa i spoczynek — prawdopodobieństwa dostawy losowej w kroku i punktu spoczynku po mutacji (domyślnie
// 0,3 i 1/25; profil „dłuższa praca bez połączenia” — PROFIL_BEZ_POLACZENIA niżej).
// E3-PR0b: odsyl — licznik odsyłania (domyślnie ODSYL: włączony, E2_AB_ODSYL=0 wyłącza); kroki — liczba mutacji zamiast
// liczby z ziarna (losowanie liczby z ziarna i tak się wykonuje, więc to początek tego samego programu); slad — zwrócony
// wynik ma też dziennik operacji i eksporty końcowe (przebieg „determinizm”; ślad nie trafia do WYNIKI ani do JSONL).
async function przebiegZiarna(ziarno, profil, { koalescencja = null, w2s = true, dostawa: pDostawy = 0.3, spoczynek: pSpoczynku = 1 / 25, nazwa = null, odsyl = ODSYL, kroki = 0, slad = false } = {}) {
  const t0 = performance.now();
  const S = swiat(ziarno + (profil === 'pelny' ? 100000 : 0));
  S.profil = profil;
  if (odsyl) S.odsyl = nowyLicznik();
  if (koalescencja) zKoalescencja(S);
  if (!w2s) S.w2s = false;
  S.wyrSwiat = `${nazwa || profil}${koalescencja ? ':' + koalescencja : ''}`;
  S.wyrEtyk = (id) => (S.indeks && S.indeks.has(id) ? 'K' + S.indeks.get(id) : String(id).slice(0, 4));
  // Cel czasu 3.3 (≤ 45 s dla ziaren domyślnych) przekroczony przy obu parach W4 w każdym punkcie spoczynku (zmierzone
  // 2026-11-03: 75 s, ziarno 5–13 s): para PO-B liczy się tylko w ostatnim punkcie spoczynku ziarna, PO-A zawsze
  // (w 40 ziarnach z obiema parami PO-A i PO-B dały w każdym punkcie ten sam wynik W4).
  S.tylkoPOA = true;
  S.los = rng(S.ziarno);
  S.indeks = new Map();
  S.nrKarty = 0;
  S.nrKroku = 0;
  const losMath = rng(S.ziarno ^ 0x5bd1e995);
  // Math.random programu z ziarna; na czas nowego pomiaru (kr_cicho) — S.losAlt.
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || losMath)());
  const A = await urzadzenie(S, 'A');
  krok(); await mutacja(S, A, 'nowa karta 1', async () => { const r = await A.d.zapiszKarte(1); S.indeks.set(r.patientId, 1); return r; });
  S.nrKarty = 1;
  A.Q.length = 0;
  if (S.odsyl) S.odsyl.os.length = 0;
  const B = await urzadzenie(S, 'B', A);
  const zZiarna = KROKI || 60 + Math.floor(S.los() * 61);
  const ile = kroki || zZiarna;
  let mutacji = 0;
  while (mutacji < ile) {
    S.nrKroku += 1;
    krok(1000 + Math.floor(S.los() * 119e3));
    if (S.los() < pDostawy) { await losowaDostawa(S, A, B); continue; }
    const X = S.los() < 0.5 ? A : B;
    if (await losowaMutacja(S, X, profil)) {
      mutacji += 1;
      if (S.los() < pSpoczynku) await punktSpoczynku(S, A, B);
    }
  }
  S.nrKroku += 1;
  await punktSpoczynku(S, A, B, { ostatni: true });
  const naruszenia = S.wyrNaruszenia || [];
  const wynik = { ziarno, profil, ...(koalescencja ? { koalescencja, w2s } : {}), ...(nazwa ? { nazwa } : {}), mutacji, ms: Math.round(performance.now() - t0), ...S.stat, braki: S.braki, dziennikZostaw: S.dziennik.filter((l) => / zostaw notatkę /.test(l)).length,
    wyr: { punkty: S.wyrPunkty || 0, naruszen: naruszenia.length, czerwone: wyrCzerwone(naruszenia), klasy: WYR.podsumuj(naruszenia), zbior: zbiorWyr(naruszenia), liczby: licznikWyr(naruszenia) } };
  const klucz = nazwa || (koalescencja ? `${profil}:${koalescencja}` : profil);
  const odsylWynik = S.odsyl ? { ziarno, profil, nazwa, koalescencja, ...S.odsyl.podsumuj(), powtorka: S.odsylPowtorka || { partii: 0, zdarzen: 0 }, odcisk: odciskiWersji([A.stan, B.stan]) } : null;
  if (odsylWynik) ODSYL_WYNIKI[klucz].push(odsylWynik);
  WYNIKI[klucz].push(wynik);
  if (process.env.E2_AB_WYNIKI) appendFileSync(process.env.E2_AB_WYNIKI, JSON.stringify({ ...wynik, ...(odsylWynik ? { odsyl: odsylWynik } : {}), dziennik: S.dziennik, ...(S.kolejkaLog ? { kolejka: S.kolejkaLog } : {}) }) + '\n');
  if (WYR_PLIK) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'ziarno', swiat: S.wyrSwiat, ziarno, mutacji, spoczynki: S.stat.spoczynki, ...wynik.wyr, scisle: S.stat.scisle }) + '\n');
  return slad ? { ...wynik, slad: { dziennik: S.dziennik.slice(), eksport: { A: await eksport(A), B: await eksport(B) } } } : wynik;
}
// Listy literałów (3.6): [ziarno, krok, [klasy]] punktów W1 z niepustym D, [ziarno, krok, strona, [klasy]] punktów W2r.
const listaW1 = (w) => w.w1Bledy.map((b) => [w.ziarno, b.krok, b.klasy]);
const listaW2r = (w) => w.w2rBledy.map((b) => [w.ziarno, b.krok, b.strona, b.klasy]);
const opisBledow = (w) => JSON.stringify({
  ziarno: w.ziarno, W1: w.w1Bledy.map((b) => ({ krok: b.krok, klasy: b.klasy, roznice: b.roznice, ostatnie: b.ostatnie })), W2r: w.w2rBledy,
  W3: w.w3Bledy, W4: w.w4Bledy, W4p: w.w4p.filter((p) => !p.ok), brakSpoczynku: w.brakSpoczynku, W2sInne: w.w2sLista.filter((x) => x.roznice.some((r) => r.kategoria === 'inne')),
}, null, 1);
function suma(lista) {
  const s = { ziaren: lista.length, mutacji: 0, zdarzen: 0, dostaw: 0, pelnych: 0, spoczynki: 0, h1: 0, h2: 0, w2r: 0, w3: 0, w4: 0, w1Bledy: 0, w2rBledy: 0, w3Bledy: 0, w4Bledy: 0, w4R4n: 0, w4pZle: 0, brakSpoczynku: 0, w2sZgodne: 0, w2sNiezgodne: 0, kategorie: {}, kategorieRoznic: {}, losowaZgodne: 0, losowaNiezgodne: 0, losowaLista: [], brakiNosnika: 0, ms: 0, klasyW1: {}, klasyW2r: {}, klasyW4: {}, w1Lista: [], w2rLista: [], emitery: statEmiterow(), haki: statHakow(), hakiKolejnosc: [], wyrPunkty: 0, wyrNaruszen: 0, wyrKlasy: {}, wyrCzerwone: 0, scisle: {} };
  for (const w of lista) {
    for (const k of ['mutacji', 'zdarzen', 'dostaw', 'pelnych', 'spoczynki', 'h1', 'h2', 'w2r', 'w3', 'w4', 'w4R4n', 'ms']) s[k] += w[k];
    for (const k of Object.keys(s.emitery)) s.emitery[k] += w.emitery[k];
    for (const k of Object.keys(s.haki)) s.haki[k] += w.haki[k];
    for (const x of w.hakiKolejnosc) s.hakiKolejnosc.push(`${w.ziarno}${x}`);
    s.w1Bledy += w.w1Bledy.length; s.w2rBledy += w.w2rBledy.length; s.w3Bledy += w.w3Bledy.length; s.brakSpoczynku += w.brakSpoczynku.length;
    s.w4Bledy += w.w4Bledy.length; s.w4pZle += w.w4p.filter((p) => !p.ok).length;
    s.w2sZgodne += w.w2s.zgodne; s.w2sNiezgodne += w.w2s.niezgodne;
    for (const [k, v] of Object.entries(w.w2s.kategorie)) s.kategorie[k] = (s.kategorie[k] || 0) + v;
    if (w.koalescencja) for (const k of ['koal', 'koalWierszy', 'koalPominiete']) s[k] = (s[k] || 0) + w[k];
    for (const [k, v] of Object.entries(w.w2s.roznice)) s.kategorieRoznic[k] = (s.kategorieRoznic[k] || 0) + v;
    s.losowaZgodne += w.losowa.zgodne; s.losowaNiezgodne += w.losowa.niezgodne; s.brakiNosnika += w.braki.length;
    for (const x of w.losowaLista) s.losowaLista.push(`${w.ziarno}#${x.krok} ${x.klasy.join('+')}`);
    for (const b of w.w1Bledy) { s.w1Lista.push(`${w.ziarno}#${b.krok} ${b.klasy.join('+')}`); for (const k of b.klasy) s.klasyW1[k] = (s.klasyW1[k] || 0) + 1; }
    for (const b of w.w2rBledy) { s.w2rLista.push(`${w.ziarno}#${b.krok}${b.strona} ${b.klasy.join('+')}`); for (const k of b.klasy) s.klasyW2r[k] = (s.klasyW2r[k] || 0) + 1; }
    for (const b of w.w4Klasy) for (const k of b.klasy) s.klasyW4[k] = (s.klasyW4[k] || 0) + 1;
    s.wyrPunkty += w.wyr.punkty; s.wyrNaruszen += w.wyr.naruszen; s.wyrCzerwone += w.wyr.czerwone.length;
    for (const k of w.wyr.zbior) s.wyrKlasy[k] = (s.wyrKlasy[k] || 0) + 1; // ziarna z daną parą (klasa, świat)
    for (const x of w.scisle) { const k = `${x.przyczyna.replace(/ \(.*$/, '')} [${x.klasa || 'bez klasy'}]`; s.scisle[k] = (s.scisle[k] || 0) + 1; }
  }
  return s;
}
// AB2: w podsumowaniu ziaren są porównania emiterów z modelem (porownan > 0), a każde jest zgodne albo różni się tylko
// kolejnością encji w obrębie rangi (zgodnych + wRandze = porownan).
function abDwa(s) {
  expect(s.emitery.porownan, 'AB2: porównania emiterów z modelem').toBeGreaterThan(0);
  expect(s.emitery.zgodnych + s.emitery.wRandze, 'AB2: zgodnych + wRandze = porownan').toBe(s.emitery.porownan);
}
// AB7: w podsumowaniu ziaren są porównania haków scalania z emiterów z modelem (jedno na partię, porownan > 0), a każde
// jest zgodne co do zbioru kopert (zgodnych + wRandze + innaKolejnosc = porownan; niezgodne — wyjątek w dostawie).
function abSiedem(s) {
  expect(s.haki.porownan, 'AB7: porównania haków z modelem').toBeGreaterThan(0);
  expect(s.haki.zgodnych + s.haki.wRandze + s.haki.innaKolejnosc, 'AB7: zgodnych + wRandze + innaKolejnosc = porownan').toBe(s.haki.porownan);
}

// Literały dla ziaren domyślnych (E2_AB_START=1, E2_AB_ZIARNA=8; specyfikacja 2a, 3.6): dokładna charakterystyka —
// nowa różnica, nowa klasa albo zniknięcie znanej różnicy czerwienią test. Naprawa zbieżności bez pełnej wysyłki
// (E2-PR3c, E3-PR0) ZMIENIA te literały — to zamierzone.
// E2-PR3c3: bez punktów R3 ziarna 6 (124, 130) — nagrobek notatki niesie rev wersji z ładunku.
const ZNANE_W1 = [[1, 26, ['R2']], [1, 43, ['R2']], [1, 47, ['R2']], [4, 92, ['R2']]];
const ZNANE_W2R = [[1, 26, 'A', ['R2']], [1, 43, 'A', ['R2']], [1, 47, 'A', ['R2']], [4, 92, 'A', ['R2']]];
const ZNANE_W4_R4N = 0; // normalizacje R4n w W4 w ziarnach domyślnych
const DOMYSLNE_ZIARNA = [1, 2, 3, 4, 5, 6, 7, 8];
const domyslne = (z) => !KROKI && DOMYSLNE_ZIARNA.includes(z);
// Wyrocznia „nie zginęła ostatnia zmiana” w ziarnach domyślnych (E3-PR0a; zmierzone — charakterystyka dzisiejszego
// stanu): [profil][ziarno] = liczba naruszeń na parę „klasa | świat” (profil podstawowy i koalescencja — bez naruszeń;
// ziarno spoza listy — bez naruszeń). Nowe naruszenie także klasy dozwolonej (np. P5 albo E1/E1b w profilu bez „Scal
// pacjentów”) albo zniknięcie znanego czerwieni test; naprawa (E3-PR0) przepisuje ten literał.
const ZNANE_WYR = {
  podstawowy: {},
  'podstawowy:ogon': {},
  pelny: {
    1: { 'P5 (Kosz pod kartą usuniętą po scaleniu) | W1': 2, 'P5 (Kosz pod kartą usuniętą po scaleniu) | W4': 4, 'E1/E1b (utrata wersji nieznanej scalającemu) | W1': 2, 'E1/E1b (utrata wersji nieznanej scalającemu) | W4': 4 },
    2: { 'E1/E1b (utrata wersji nieznanej scalającemu) | W1': 8, 'E1/E1b (utrata wersji nieznanej scalającemu) | W4': 12 },
  },
};
const licznikWyr = (lista) => { const o = {}; for (const x of lista) { const k = `${x.klasa || 'bez klasy'} | ${x.swiat}`; o[k] = (o[k] || 0) + 1; } return o; };
// Asercje wyroczni ziarna (miękkie — przed zielenią profilu, żeby komunikat CI miał oba werdykty): naruszenia bez klasy
// z tabeli wyjątków; dla ziaren domyślnych — literał ZNANE_WYR (liczba naruszeń na klasę i świat).
function wyrocznieZiarna(w, profil, zLiteralem) {
  expect.soft(w.wyr.czerwone, `wyrocznia „nie zginęła ostatnia zmiana” (ziarno ${w.ziarno}): naruszenia bez klasy z tabeli wyjątków`).toEqual([]);
  if (zLiteralem) expect.soft(w.wyr.liczby, `wyrocznia: ZNANE_WYR (${profil}, ziarno ${w.ziarno})`).toEqual((ZNANE_WYR[profil] || {})[w.ziarno] || {});
}
// Zieleń profilu (3.3): W3, W4, W4p, W2s „inne” = ∅, spoczynek w ≤ 4 rundach, klasyfikator W1/W2r bez klasy
// niedozwolonej, W2r ⊆ W1.
function zielenProfilu(w) {
  const bezKlasy = (lista) => lista.flatMap((b) => b.roznice.filter((r) => r.dozwolona !== 'tak').map((r) => ({ krok: b.krok, ...r })));
  return {
    W3: w.w3Bledy, W4: w.w4Bledy.map((b) => b.krok), W4p: w.w4p.filter((p) => !p.ok), brakSpoczynku: w.brakSpoczynku,
    W2sInne: w.w2sLista.filter((x) => x.roznice.some((r) => r.kategoria === 'inne')).map((x) => `${x.krok} ${x.dostawa}`),
    W1BezKlasy: bezKlasy(w.w1Bledy), W2rBezKlasy: bezKlasy(w.w2rBledy),
    W2rPozaW1: w.w2rBledy.filter((b) => !w.w1Bledy.some((x) => x.krok === b.krok)).map((b) => b.krok),
  };
}
const ZIELEN = { W3: [], W4: [], W4p: [], brakSpoczynku: [], W2sInne: [], W1BezKlasy: [], W2rBezKlasy: [], W2rPozaW1: [] };
describe('A ≡ B, właściwość: profil podstawowy (W3, W4, W4p — zieleń; W1, W2r — dokładna charakterystyka znanych klas; W2s „inne” = ∅)', () => {
  d1();
  for (const z of ZIARNA) {
    it(`ziarno ${z}`, async () => {
      const w = await przebiegZiarna(z, 'podstawowy');
      expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
      wyrocznieZiarna(w, 'podstawowy', domyslne(z));
      expect.soft(zielenProfilu(w), opisBledow(w)).toEqual(ZIELEN);
      if (SCISLE) expect.soft(w.scisle, `tryb ścisły (ziarno ${z})`).toEqual([]);
      if (domyslne(z)) {
        expect(listaW1(w), `ZNANE_W1 (ziarno ${z})\n${opisBledow(w)}`).toEqual(ZNANE_W1.filter((x) => x[0] === z));
        expect(listaW2r(w), `ZNANE_W2R (ziarno ${z})`).toEqual(ZNANE_W2R.filter((x) => x[0] === z));
      }
    }, 180_000);
  }
  it('podsumowanie (druk do opisu PR; ZNANE_W4_R4N; AB2: porównania emiterów z modelem; AB7: porównania haków z modelem)', () => {
    const s = suma(WYNIKI.podstawowy);
    console.log('E2-AB podstawowy', JSON.stringify(s));
    expect(s.ziaren).toBe(ZIARNA.length);
    expect(s.pelnych, 'punkty pełnej dostawy (W2s, W3)').toBeGreaterThan(0);
    expect(s.zdarzen).toBeGreaterThan(0);
    abDwa(s);
    abSiedem(s);
    const dom = WYNIKI.podstawowy.filter((w) => domyslne(w.ziarno));
    if (dom.length === DOMYSLNE_ZIARNA.length) expect(dom.reduce((n, w) => n + w.w4R4n, 0), 'ZNANE_W4_R4N').toBe(ZNANE_W4_R4N);
  });
});

// ── Koalescencja kolejki (reguła ogona, E2-PR2b) — profil podstawowy bez W2s ─────────────────────────────────────────
// Kolejki Q_X z łączeniem wpisów (doKolejkiOgon: wycięta Bob_plan sejfu, tests/support/model-kolejki.mjs). Bez W2s i W3
// (nie badają łączenia wpisów; W3 bez zmian od E2-PR2a), więc ziarno to inny program niż w profilu podstawowym.
// Zieleń jak w profilu podstawowym (W4, W4p, spoczynek ≤ 4 rundy, klasyfikator W1/W2r bez klasy niedozwolonej), W1 dla
// ziaren domyślnych — literał ZNANE_W1_KOAL, a suma koalescencji > 0 (test nie może być pusty). Ziarna: ZIARNA_KOAL,
// E2_AB_ZIARNA_KOAL (liczba ziaren od E2_AB_START) nadpisuje; ziarna domyślne liczą się osobno od celu czasu profilu
// podstawowego (ziarna E2_AB_ZIARNA).
const DOMYSLNE_ZIARNA_KOAL = [1, 7, 8];
const ZIARNA_KOAL = process.env.E2_AB_ZIARNA_KOAL
  ? Array.from({ length: Number(process.env.E2_AB_ZIARNA_KOAL) }, (_, i) => START_ZIAREN + i) : DOMYSLNE_ZIARNA_KOAL;
const ZNANE_W1_KOAL = [];
describe('A ≡ B, koalescencja kolejki (reguła ogona) — profil podstawowy bez W2s', () => {
  d1();
  for (const z of ZIARNA_KOAL) {
    it(`ziarno ${z}`, async () => {
      const w = await przebiegZiarna(z, 'podstawowy', { koalescencja: 'ogon', w2s: false });
      expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
      wyrocznieZiarna(w, 'podstawowy:ogon', !KROKI && DOMYSLNE_ZIARNA_KOAL.includes(z));
      expect.soft(zielenProfilu(w), opisBledow(w)).toEqual(ZIELEN);
      if (SCISLE) expect.soft(w.scisle, `tryb ścisły (ziarno ${z})`).toEqual([]);
      if (!KROKI && DOMYSLNE_ZIARNA_KOAL.includes(z)) expect(listaW1(w), `ZNANE_W1_KOAL (ziarno ${z})\n${opisBledow(w)}`).toEqual(ZNANE_W1_KOAL.filter((x) => x[0] === z));
    }, 180_000);
  }
  it('podsumowanie (druk do opisu PR): suma koalescencji > 0; AB2; AB7', () => {
    const s = suma(WYNIKI['podstawowy:ogon']);
    console.log('E2-AB koalescencja', JSON.stringify(s));
    expect(s.ziaren).toBe(ZIARNA_KOAL.length);
    expect(s.koal, 'dopisania, które zastąpiły wpis kolejki').toBeGreaterThan(0);
    abDwa(s);
    abSiedem(s);
  });
});

// ── Profil pełny (charakteryzujący; specyfikacja 2a, 3.3) ──────────────────────────────────────────────────────────
// Zieleń: brak wyjątków, statusy applied, spoczynek w ≤ 4 rundach, W3 = 0 i W4 jak w profilu podstawowym z klasami
// dozwolonymi w profilu pełnym (R4n z W4p; D7 — raport; od E3-PR0a bez createdAtISO-notatki i „notatki pod inną kartą”
// — zero wystąpień w 20 ziarnach).
// W1, W2r, W2s: klasy drukowane, różnice bez klasy do raportu jako lista z kluczem encji (nie czerwienią).
// W CI 2 ziarna (E2_AB_ZIARNA nadpisuje; do raportu 20). E2_AB_KOAL=ogon (przebieg ręczny) — kolejki z łączeniem wpisów
// (reguła ogona), W2s jak bez łączenia.
const KOAL_PELNY = process.env.E2_AB_KOAL === 'ogon' ? 'ogon' : null;
const ZIARNA_PELNY = Array.from({ length: Number(process.env.E2_AB_ZIARNA) || 2 }, (_, i) => START_ZIAREN + i);
const DOMYSLNE_ZIARNA_PELNY = [1, 2]; // ziarna CI (literał ZNANE_WYR.pelny)
function raportPelny(lista) {
  const s = suma(lista);
  const bezKlasy = [];
  for (const w of lista) {
    for (const b of w.w1Bledy) for (const r of b.roznice.filter((q) => !q.klasa)) bezKlasy.push(`W1 ${w.ziarno}#${b.krok} ${r.rodzaj} ${r.klucz.slice(0, 13)} ${r.tylko ? 'tylko ' + r.tylko : r.sciezki.slice(0, 3).join(',')}`);
    for (const b of w.w2rBledy) for (const r of b.roznice.filter((q) => !q.klasa)) bezKlasy.push(`W2r ${w.ziarno}#${b.krok}${b.strona} ${r.rodzaj} ${r.klucz.slice(0, 13)} ${r.tylko ? 'tylko ' + r.tylko : r.sciezki.slice(0, 3).join(',')}`);
  }
  return { ...s, bezKlasy, wskrzeszen: lista.reduce((n, w) => n + w.dziennikZostaw, 0) };
}
describe('A ≡ B, właściwość: profil pełny (charakterystyka; W3 i W4 z klasami profilu pełnego — zieleń)', () => {
  d1();
  for (const z of ZIARNA_PELNY) {
    it(`ziarno ${z}`, async () => {
      const w = await przebiegZiarna(z, 'pelny', { koalescencja: KOAL_PELNY });
      expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
      wyrocznieZiarna(w, 'pelny', !KROKI && !KOAL_PELNY && DOMYSLNE_ZIARNA_PELNY.includes(z));
      expect.soft({ W3: w.w3Bledy, W4: w.w4Bledy.map((b) => b.krok), W4p: w.w4p.filter((p) => !p.ok), brakSpoczynku: w.brakSpoczynku }, opisBledow(w))
        .toEqual({ W3: [], W4: [], W4p: [], brakSpoczynku: [] });
      if (SCISLE) expect.soft(w.scisle, `tryb ścisły (ziarno ${z})`).toEqual([]);
    }, 600_000);
  }
  it('podsumowanie profilu pełnego (druk do opisu PR; AB2; AB7)', () => {
    const s = raportPelny(WYNIKI[KOAL_PELNY ? 'pelny:ogon' : 'pelny']);
    console.log('E2-AB pelny', JSON.stringify(s));
    expect(s.ziaren).toBe(ZIARNA_PELNY.length);
    abDwa(s);
    abSiedem(s);
  });
});

// ── Profil „dłuższa praca bez połączenia” (ręczny: E2_AB_PROFIL=bez-polaczenia; E3-PR0a) ──────────────────────────
// Pozycja planu E3-PR0: „pomiar profilu z dłuższą pracą bez połączenia”. Mutacje profilu podstawowego, ale dostawa
// losowa w kroku z prawdopodobieństwem 0,04 (zamiast 0,3) i punkt spoczynku po mutacji z prawdopodobieństwem 0,015
// (zamiast 1/25): długie serie zmian na obu urządzeniach bez wymiany. Ziarna jak w profilu podstawowym (E2_AB_ZIARNA od
// E2_AB_START; ziarno świata = ziarno, jak w profilu podstawowym). Zieleń jak w profilu podstawowym (bez literałów
// ziaren domyślnych), wyrocznia „nie zginęła ostatnia zmiana”, AB2 i AB7 w podsumowaniu. Pomiar 2026-11-15 (40 ziaren
// od 101) — ALGORITHMS, P-ZBIEZNOSC-ZDARZEN, „Wynik”; dawniej AB7 w ziarnie 104 (fałszywy alarm modelu H1, przypadek deterministyczny w bloku AB7).
const PROFIL_BEZ_POLACZENIA = Object.freeze({ dostawa: 0.04, spoczynek: 0.015, nazwa: 'bez-polaczenia' });
if (process.env.E2_AB_PROFIL === 'bez-polaczenia') {
  describe('A ≡ B, właściwość: profil „dłuższa praca bez połączenia” (ręczny; zieleń jak w profilu podstawowym)', () => {
    d1();
    for (const z of ZIARNA) {
      it(`ziarno ${z}`, async () => {
        const w = await przebiegZiarna(z, 'podstawowy', PROFIL_BEZ_POLACZENIA);
        expect(w.spoczynki, 'co najmniej jeden punkt spoczynku').toBeGreaterThan(0);
        wyrocznieZiarna(w, 'bez-polaczenia', false);
        expect.soft(zielenProfilu(w), opisBledow(w)).toEqual(ZIELEN);
        if (SCISLE) expect.soft(w.scisle, `tryb ścisły (ziarno ${z})`).toEqual([]);
      }, 600_000);
    }
    it('podsumowanie (druk; AB2; AB7)', () => {
      const s = suma(WYNIKI['bez-polaczenia']);
      console.log('E2-AB bez-polaczenia', JSON.stringify(s));
      expect(s.ziaren).toBe(ZIARNA.length);
      abDwa(s);
      abSiedem(s);
    });
  });
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(START); });
afterEach(async () => { await sprzatnijUrzadzenia(); vi.useRealTimers(); vi.restoreAllMocks(); });
// AB1: niezgodność emiterów z modelem czerwieni przypadek także wtedy, gdy wyjątek mutacji złapał krok katalogu p. 5.
afterEach(() => { const n = EMITERY_NIEZGODNE.splice(0); expect(n, 'AB1: emitery ≡ model w każdej mutacji przypadku').toEqual([]); });
// AB7: niezgodność haków scalania z modelem czerwieni przypadek także wtedy, gdy wyjątek dostawy złapał krok katalogu p. 5.
afterEach(() => { const n = HAKI_NIEZGODNE.splice(0); expect(n, 'AB7: haki z emiterów ≡ model w każdej partii przypadku').toEqual([]); });
afterEach(() => { expect(NORM_BEZ_FLOTY.splice(0), 'wyrocznia: normalizacja tożsamości wizyty nieużyta w punktach z samymi bieżącymi urządzeniami').toEqual([]); });
afterAll(() => {
  console.log('E2-AB emitery (plik)', JSON.stringify(EMITERY_PLIK)); console.log('E2-AB haki (plik)', JSON.stringify(HAKI_PLIK));
  console.log('E2-AB wyrocznia, czas (ms)', JSON.stringify(Object.fromEntries(Object.entries(WYR_CZAS).map(([k, v]) => [k, Math.round(v)]))));
  if (WYR_PLIK) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'czas', ...WYR_CZAS }) + '\n');
});

// ══ Licznik odsyłania w profilach i urządzenie starszej aplikacji (E3-PR0b, P-ZBIEZNOSC-ZDARZEN; tylko testy) ════════
// Licznik (tests/support/licznik-odsylania.mjs; definicje warstw, wierszy, bajtów i budżetu w nagłówku modułu) tylko czyta
// eksporty: echo każdego scalenia u odbiorcy — zdarzenie po zdarzeniu każdej strony dostawy (źródło 'zdarzenie') i obie
// połowy pierwszego obiegu wymiany każdej pary PO-A/PO-B w W4 na klonach (pół wymiany, źródło 'w4') — w warstwach
// surowe, po2a, wyk (reguła T; E2_AB_ODSYL_REGULA=A|B — diagnostyka), nowe. Koperty nośników wierszy (bajty, żądania)
// budują buildery odbiorcy w cichoLicznik: własny Math.random i własne numery klonów, bez S.nrPomiaru, więc istniejące
// kr_cicho dostają te same ziarna, a program ziarna jest ten sam co bez licznika (strażnik: przebieg „determinizm” niżej;
// zrzuty E2_AB_WYNIKI ziaren CI bez pól ms i odsyl są równe z licznikiem i bez). Bajty koperty = eventBytes sejfu
// (rozmiar szyfrogramu {iv, data} z długości jawnego JSON) z dev 'abcdefgh' zamiast null. Powtórka partii: raz na ziarno
// pierwsza partia dostawy z co najmniej dwoma zdarzeniami jeszcze raz na świeżym klonie odbiorcy (źródło 'powtórka').
// Asercje (describe „licznik odsyłania w profilach”, na wynikach ziaren tego przebiegu), w każdym ziarnie:
// - pola zawsze obecne: w ładunkach od bieżącej wersji każda wersja i każdy wpis Kosza z rodzicem pola z POLA_ZAWSZE ma to
//   pole (warunek reguły T);
// - między bieżącymi urządzeniami warstwa wykonalna = po2a w każdym źródle (reguła T niczego nie tłumi);
// - budżet minuty slotu (warstwa wyk, bajty realne przy górnej granicy przeliczenia): ≤ 600 wierszy, ≤ 4 MiB, ≤ 20 żądań
//   na urządzenie; budżet naiwny (po2a) i okna przesuwne 60 s zegara uprzęży — tylko druk;
// - powtórka partii: jedna na ziarno, 0 wierszy surowych;
// - odcisk testu (LO.odcisk, kopia Bgw_odcisk) = _pinnedState.h każdej wersji eksportów końcowych (bieżący sejf zapisuje h
//   przy każdym zapisie treści i gwiazdki — Bgw_ustaw — i przelicza świeży h przy przeniesieniu wizyty);
// - buildery nośników bez wyjątku;
// oraz literał ZNANE_ODSYL[profil] dla ziaren domyślnych: klucz źródło|rodzaj|w ładunku/spoza|klasa → { wyk, nowe } (bez
// ścieżek pól i bez bajtów). E2_AB_ODSYL=0 — licznik wyłączony (przypadki licznika pominięte); E2_AB_WYNIKI — pole odsyl
// w JSONL ziarna.
const ODSYL = process.env.E2_AB_ODSYL !== '0';
const ODSYL_REGULA = process.env.E2_AB_ODSYL_REGULA || 'T';
const WYK = 'wyk' + ODSYL_REGULA;
const DEV_FIKCYJNY = 'abcdefgh';
const ODSYL_WYNIKI = { podstawowy: [], pelny: [], 'podstawowy:ogon': [], 'pelny:ogon': [], 'bez-polaczenia': [], determinizm: [] };
const nowyLicznik = () => LO.nowyLicznikOdsylania({ regula: ODSYL_REGULA, rekordZlozony });
// Izolacja pomiaru licznika (wzór kr_cicho, ale bez S.nrPomiaru): własny Math.random (S.losAlt) i numery klonów od
// 5 000 000 na czas fn; licznik urządzeń przywracany.
async function cichoLicznik(S, fn) {
  const nr = S.nrUrz, pop = S.losAlt;
  S.nrCicho = (S.nrCicho || 0) + 1;
  S.losAlt = rng(0xBADA55 + S.nrCicho * 977);
  S.nrUrz = 5000000 + S.nrCicho * 100;
  try { return await fn(); } finally { S.nrUrz = nr; S.losAlt = pop; }
}
const BUDOWNICZE_ECHA = Object.freeze({ ptomb: 'buildPatientTombstoneEvent', pnote: 'buildPatientNoteEvent', pnotetomb: 'buildPatientNoteTombstoneEvent', note: 'buildNoteEvent', notetomb: 'buildNoteTombstoneEvent', plist: 'buildPatientListEvent', plisttomb: 'buildPatientListTombstoneEvent', pref: 'buildPreferenceEvent', pk: 'buildPasskeyEvent', pktomb: 'buildPasskeyTombstoneEvent' });
// Koperta nośnika wiersza echa z builderów Y po scaleniu: wersja — snap; karta — snap najnowszej wersji (reguła emituj);
// null — brak nośnika; { blad } — wyjątek buildera.
async function kopertaEcha(Y, r, poE) {
  const ev = Y.ev;
  try {
    if (r.kind === 'snap') return await ev.buildSnapshotEvent(r.pid, String(r.key).split('/')[1], DEV_FIKCYJNY);
    if (r.kind === 'karta') { const e = poE.get('karta:' + r.key); return e && e.najnowsza ? await ev.buildSnapshotEvent(r.key, e.najnowsza, DEV_FIKCYJNY) : null; }
    if (r.kind === 'stomb') return await ev.buildSnapshotTombstoneEvent(r.key, DEV_FIKCYJNY);
    if (r.kind === 'cred') return await ev.buildCredentialEvent(DEV_FIKCYJNY);
    if (BUDOWNICZE_ECHA[r.kind]) return await ev[BUDOWNICZE_ECHA[r.kind]](r.key, DEV_FIKCYJNY);
  } catch (e) { return { blad: String(e && (e.code || e.message)) }; }
  return null;
}
const bajtyKoperty = (U, k) => U.ev.eventBytes(k.event && k.event.dev === null ? { ...k, event: { ...k.event, dev: DEV_FIKCYJNY } } : k);
const urzOs = (U) => U.nazwa.replace(/-.*$/, '');
const wyslijOs = (S, U, zrodlo, bajty) => S.odsyl.wyslij(urzOs(U), teraz, zrodlo, bajty);
// Klucze encji wpisów rejestru łańcucha (haki scalania pełnej kopii na klonach; warstwa nowe).
const kluczeWpisow = (wpisy) => new Set(wpisy.filter((z) => !z.znacznik).map((z) => (z.kind === 'pfull' ? 'pfull:' + z.klucze.patientId
  : z.kind === 'snap' ? `snap:${z.klucze.patientId}/${z.klucze.snapshotId}` : `${z.kind}:${z.klucze}`)));

// Echo jednej strony dostawy (albo jednego pół wymiany) na Y: każdy odcinek { przed, po, ladunek } to jedno scalenie
// (warstwy, usunięcia przez scalanie; dla ładunku od bieżącej wersji — strażnik pól zawsze obecnych); wiersze strony to
// unia encji odcinków w warstwie wyk i po2a, nośniki z builderów Y (cichoLicznik), bajty z eventBytes. Strona i oś czasu
// — poza pół wymiany (W4 liczy się na klonach). Wynik: koperty warstwy wyk.
async function liczEcho(S, Y, zrodlo, odcinki, haki, opis, { natychmiast = false, odBiezacej = false } = {}) {
  const t0 = performance.now();
  const L = S.odsyl;
  const unia = new Map(), unia2a = new Map();
  for (const { przed, po, ladunek, z221 = false } of odcinki) {
    const lista = L.echo(przed, po, ladunek, { z221 });
    L.zapiszScalenie(zrodlo, lista, haki, { natychmiast, opis });
    L.zapiszUsuniecia(zrodlo, LO.usunieciaScalenia(przed, po, ladunek), opis);
    if (odBiezacej) L.sprawdzPolaZawsze(S.bezRetencjiStarszej ? S.bezRetencjiStarszej(ladunek) : ladunek, opis);
    for (const r of LO.wierszeEcha(lista.filter((q) => q[WYK]))) unia.set(r.k, r);
    for (const r of LO.wierszeEcha(lista.filter((q) => q.po2a))) unia2a.set(r.k, r);
  }
  const poE = encje(odcinki[odcinki.length - 1].po);
  const nosniki = async (mapa, zBrakiem) => {
    const wiersze = [], koperty = [];
    for (const r of mapa.values()) {
      const k = await kopertaEcha(Y, r, poE);
      if (!k) { if (zBrakiem) L.zapiszBrakNosnika(zrodlo, r); continue; }
      if (k.blad) { L.bladBuildera += 1; continue; }
      wiersze.push({ tresci: r.tresci, bajty: bajtyKoperty(Y, k) });
      koperty.push(k);
    }
    return { wiersze, koperty };
  };
  const [w, w2a] = await cichoLicznik(S, async () => [await nosniki(unia, true), await nosniki(unia2a, false)]);
  if (zrodlo !== 'w4') {
    L.zapiszStrone(zrodlo, w.wiersze, w2a.wiersze, { t: teraz, dev: urzOs(Y), opis });
    wyslijOs(S, Y, 'echo', w.wiersze.map((x) => x.bajty));
    wyslijOs(S, Y, 'echo2a', w2a.wiersze.map((x) => x.bajty));
  }
  L.ms += performance.now() - t0;
  if (S.echoKlony && zrodlo !== 'w4' && (w.koperty.length || w2a.koperty.length)) await echoNaKlonach(S, Y, w.koperty, w2a.koperty);
  return w.koperty;
}
// Licznik partii dostawy X→Y (wołany z dostawa po ustawStan): strony ≤ 200 zdarzeń (strona scalana naraz; minuta slotu
// = krok zegara uprzęży), w stronie odcinki zdarzenie po zdarzeniu (stany dostawy), haki partii (wpisy dopisane do Q_Y)
// i przegląd natychmiast (drenaż zdarzeń, który scalił). Raz na ziarno — powtórka partii.
async function poPartiiOdsyl(S, X, Y, partia, stany, dodane) {
  const L = S.odsyl;
  if (starszaAplikacja(Y)) return; // echo liczy się u bieżącego odbiorcy (flota: odbiorca ze starszą aplikacją nie odsyła)
  if (partia.some((e) => !e.jaw)) throw new Error(`licznik odsyłania: wpis Q_${X.nazwa} bez jawnej kopii koperty (licznik włączony po dopisaniu)`);
  const opis = `#${S.nrKroku || 0} ${X.nazwa}>${Y.nazwa}`;
  const haki = LO.kluczeKopert(dodane);
  if (dodane.length) wyslijOs(S, Y, 'haki', dodane.map((k) => bajtyKoperty(Y, k)));
  L.zapiszPartie(partia.length, opis);
  const zrodlo = X.app === 'S276' ? 'zdarzenie276' : 'zdarzenie';
  for (const [od, d] of LO.strony(partia.length)) {
    const odcinki = partia.slice(od, d).map((e, i) => ({ przed: stany[od + i], po: stany[od + i + 1], ladunek: e.jaw }));
    await liczEcho(S, Y, zrodlo, odcinki, haki, `${opis} [${partia.length} zd., strona ${od / LO.LIMITY.stronaDostawy + 1}]`, { natychmiast: true, odBiezacej: !starszaAplikacja(X) });
  }
  if (!S.odsylPowtorka && partia.length >= 2) { S.odsylPowtorka = { partii: 1, zdarzen: partia.length, opis }; await powtorkaPartii(S, Y, partia, `${opis} (powtórka)`); }
}
// Powtórka partii (kursor cofnięty o całą partię): te same szyfrogramy z Q nadawcy jeszcze raz, zdarzenie po zdarzeniu,
// na świeżym klonie odbiorcy po tej partii, w cichoLicznik (klon, jego identyfikatory i IV poza programem). Echo każdego
// zdarzenia — źródło 'powtórka'; oczekiwane 0 wierszy surowych (scalanie nic nie zapisuje).
async function powtorkaPartii(S, Y, partia, opis) {
  const L = S.odsyl;
  const t0 = performance.now();
  await cichoLicznik(S, async () => {
    const K = await klonBiezacy(S, Y, 'powt');
    try {
      for (const e of partia) {
        const przed = await eksport(K);
        await zastosuj(K, [e]);
        L.zapiszScalenie('powtórka', L.echo(przed, await eksport(K), e.jaw), new Set(), { opis });
      }
    } finally { await zamknij(K); }
  });
  L.msDodatkowe.powtorka += performance.now() - t0;
}
// Wymiana PO-A na klonach W4 z licznikiem (pół wymiany): Y scala pełny stan X, potem X scala stan Y po scaleniu — jak
// rundaPO; licz — echo obu połówek (pierwszy obieg wymiany; źródło 'w4'). Wpisy haków ze scalenia (rejestr łańcucha
// klonu) — haki warstwy nowe. Dodatkowe eksporty przed scaleniem (tylko w obiegu, który licznik liczy) nie zmieniają
// stanu ani losowań.
async function wymianaPOLicz(S, X, Y, licz) {
  const liczy = !!licz && !!S.odsyl;
  const eksportLicznika = async (U) => { const t0 = performance.now(); const e = await eksport(U); S.odsyl.msDodatkowe.eksportyWymiany += performance.now() - t0; return e; };
  const bx = json(await X.v.exportSyncPayload());
  const y0 = liczy ? await eksportLicznika(Y) : null;
  if (Y.lancuch) Y.lancuch.length = 0;
  await Y.v.mergeSyncPayload(json(bx));
  const by = json(await Y.v.exportSyncPayload());
  const hY = Y.lancuch ? kluczeWpisow(Y.lancuch.splice(0)) : new Set();
  const x0 = liczy ? await eksportLicznika(X) : null;
  if (X.lancuch) X.lancuch.length = 0;
  await X.v.mergeSyncPayload(json(by));
  const x1 = await eksport(X);
  const hX = X.lancuch ? kluczeWpisow(X.lancuch.splice(0)) : new Set();
  ustawStan(X, x1); ustawStan(Y, by);
  if (!liczy) return;
  if (!starszaAplikacja(Y)) await liczEcho(S, Y, 'w4', [{ przed: y0, po: by, ladunek: bx }], hY, `W4 ${X.nazwa}→${Y.nazwa}`, { odBiezacej: !starszaAplikacja(X) });
  if (!starszaAplikacja(X)) await liczEcho(S, X, 'w4', [{ przed: x0, po: x1, ladunek: by }], hX, `W4 ${Y.nazwa}→${X.nazwa}`, { odBiezacej: !starszaAplikacja(Y) });
}
// Odcisk testu wobec _pinnedState.h każdej wersji podanych eksportów.
function odciskiWersji(stany) {
  const o = { wersji: 0, zgodnych: 0, niezgodne: [] };
  for (const lad of stany) {
    for (const p of lad.patients || []) {
      for (const s of p.snapshots || []) {
        const h = s.payload && s.payload._pinnedState ? s.payload._pinnedState.h : undefined;
        if (typeof h !== 'string') continue;
        o.wersji += 1;
        if (LO.odcisk(s.payload) === h) o.zgodnych += 1;
        else if (o.niezgodne.length < 6) o.niezgodne.push(`${String(p.patientId).slice(0, 8)}/${String(s.snapshotId).slice(0, 8)}`);
      }
    }
  }
  return o;
}
// Mutacja na urządzeniu z sejfem 221 (bez dziennika zdarzeń): operacja, eksport po niej i zapis historii wyroczni
// (wywołania API sejfu jak w mutacja), bez emisji i bez porównania z modelem. Odmowa sejfu 221 — wyjątek z kodem
// z ODMOWY_STARSZEJ (operacja na karcie z lokalnym nagrobkiem, zajęta blokada scalania; tests/fixtures/vilda_vault-221.js.txt
// :1906, :1270) — trafia do S.stat.odmowyStarszej (liczba i według kodu) i do dziennika, bez przerwania przebiegu. Każdy
// inny wyjątek (błąd uprzęży, TypeError, kod spoza listy) rzuca się dalej po zapisie historii — jak w mutacja.
const ODMOWY_STARSZEJ = Object.freeze(['PATIENT_DELETED', 'MERGE_BUSY']);
async function mutacjaBezDziennika(S, U, opis, fn, { operacja = null } = {}) {
  const przed = U.stan;
  const operacje = operacja ? [operacja] : [];
  const v0 = U.v;
  U.v = new Proxy(v0, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (!WYR.OPERACJE.includes(k)) return f.bind(cel);
    return (...args) => { operacje.push({ nazwa: k, args }); return f.apply(cel, args); };
  } });
  const chwila = Date.now();
  if (S.chwile) S.chwile.add(chwila);
  let wynik, blad = null;
  try { wynik = await fn(); } catch (e) { blad = e; } finally { U.v = v0; }
  const po = await eksport(U);
  { const t0 = performance.now(); WYR.zapisz(S.wyr = S.wyr || WYR.nowyModel(), { dev: U.nazwa, app: U.app, opis, przed, po, t: chwila, operacje }); WYR_CZAS.zapis += performance.now() - t0; }
  ustawStan(U, po);
  if (U.delty) await wyslijDelty(S, U, 'mutacja'); // flota 221: delty integracji po operacji (blok floty niżej)
  const odmowa = !!blad && ODMOWY_STARSZEJ.includes(blad.code);
  if (odmowa) {
    S.stat.odmowyStarszej = (S.stat.odmowyStarszej || 0) + 1;
    const k = S.stat.odmowyStarszejKody = S.stat.odmowyStarszejKody || {};
    k[blad.code] = (k[blad.code] || 0) + 1;
  }
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} ${U.nazwa} (${U.app}): ${opis}${blad ? ` → ${odmowa ? 'odmowa' : 'wyjątek'} ${blad.code || blad.message}` : ''}`);
  if (blad && !odmowa) throw blad;
  return { wynik, koperty: [], model: [] };
}

describe('A ≡ B, urządzenie starszej aplikacji w uprzęży (E3-PR0b): app, mutacja bez dziennika, tabela pary', () => {
  d1();
  it('bliźniaki A z sejfem 221 i 276 (klon dziedziczy app i retencję v1); mutacja na 221 bez emisji z zapisem historii, na 276 z emiterami porównanymi z modelem; para z urządzeniem app ≠ N — tabela „flota” (tylko klasy par floty i R4n), para bieżących — tabela wołającego', async () => {
    const S = swiat(960);
    const A = await urzadzenie(S, 'A');
    krok(); await mutacja(S, A, 'nowa karta 1', () => A.d.zapiszKarte(1));
    const pid = A.stan.patients[0].patientId;
    const B = await urzadzenie(S, 'B', A);
    const C = await urzadzenie(S, 'C', A, { app: 'S221' });
    const D = await urzadzenie(S, 'D', A, { app: 'S276' });
    const C2 = await klon(S, C, 'k');
    expect({ A: [A.app, A.retencja], C: [C.app, C.retencja, typeof C.ev, C.lancuch], D: [D.app, D.retencja, typeof D.ev, Array.isArray(D.lancuch)], C2: [C2.app, C2.retencja, typeof C2.ev] })
      .toEqual({ A: ['N', null], C: ['S221', 'v1', 'undefined', null], D: ['S276', 'v1', 'object', true], C2: ['S221', 'v1', 'undefined'] });
    const mutacjiPrzed = S.wyr.mutacji, porownanPrzed = S.stat.emitery.porownan;
    krok(); await mutacja(S, C, 'nowa wersja 1 na 221', () => C.d.zapiszKarte(1, { wzrost: 120, zapis: { patientId: pid, forceNewSnapshot: true } }));
    expect({ Q: C.Q.length, mutacji: S.wyr.mutacji - mutacjiPrzed, porownan: S.stat.emitery.porownan - porownanPrzed, wersji: C.stan.patients[0].snapshots.length, odmowy: S.stat.odmowyStarszej || 0 })
      .toEqual({ Q: 0, mutacji: 1, porownan: 0, wersji: 2, odmowy: 0 });
    krok(); const { koperty } = await mutacja(S, D, 'nowa wersja 1 na 276', () => D.d.zapiszKarte(1, { wzrost: 121, zapis: { patientId: pid, forceNewSnapshot: true } }));
    expect({ porownan: S.stat.emitery.porownan - porownanPrzed, mutacji: S.wyr.mutacji - mutacjiPrzed, Q: D.Q.map((e) => e.kind) })
      .toEqual({ porownan: 1, mutacji: 2, Q: koperty.map((k) => k.event.kind) });
    expect(D.Q.map((e) => e.kind)).toContain('snap');
    expect([kontPary(A, C, { tabela: 'p6' }).tabela, kontPary(D, A, { tabela: 'W4', wskrzeszone: null }).tabela, kontPary(A, B, { tabela: 'p6' }).tabela, kontPary(C2, B, { tabela: 'W4' }).tabela])
      .toEqual(['flota', 'flota', 'p6', 'flota']);
    expect([dozwolona('R2', {}, { tabela: 'flota' }), dozwolona('R4n', {}, { tabela: 'flota' }), dozwolona(D_TOZSAMOSC, {}, { tabela: 'flota' }), dozwolona(D_TOZSAMOSC, {}, { tabela: 'p6' }), dozwolona('R2', {}, { tabela: 'p6' })]).toEqual([false, 'tak', 'tak', false, 'tak']);
    // Wyjątek w mutacji na 221: odmowa sejfu z kodem z listy — liczona, przebieg trwa; każdy inny — rzucany dalej
    // (błąd uprzęży nie zmienia programu świata po cichu); historia wyroczni dostaje zapis w obu przypadkach.
    const odmowa = (kod) => () => { const e = new Error('odmowa sejfu (syntetyczna)'); e.code = kod; throw e; };
    krok(); await mutacja(S, C, 'odmowa na 221', odmowa('PATIENT_DELETED'));
    krok(); await expect(mutacja(S, C, 'błąd uprzęży na 221', () => { throw new TypeError('brak metody (syntetyczny)'); })).rejects.toThrow(TypeError);
    krok(); await expect(mutacja(S, C, 'kod spoza listy na 221', odmowa('BAD_JSON'))).rejects.toMatchObject({ code: 'BAD_JSON' });
    expect({ odmowy: S.stat.odmowyStarszej, kody: S.stat.odmowyStarszejKody, mutacji: S.wyr.mutacji - mutacjiPrzed, dziennik: S.dziennik.slice(-3).map((w) => w.replace(/^.*\): /, '')) })
      .toEqual({ odmowy: 1, kody: { PATIENT_DELETED: 1 }, mutacji: 5, dziennik: ['odmowa na 221 → odmowa PATIENT_DELETED', 'błąd uprzęży na 221 → wyjątek brak metody (syntetyczny)', 'kod spoza listy na 221 → wyjątek BAD_JSON'] });
    await zamknij(C2);
  }, 30_000);
});

// Literał licznika odsyłania dla ziaren domyślnych — linia bazowa echa między bieżącymi urządzeniami, zanim bieżąca
// aplikacja zacznie odsyłać rekordy pochodne scalenia (E3-PR0h). Pierwszy poziom — profil (podstawowy: ziarna
// DOMYSLNE_ZIARNA; 'podstawowy:ogon' — koalescencja kolejki, DOMYSLNE_ZIARNA_KOAL; pelny — DOMYSLNE_ZIARNA_PELNY),
// liczby to sumy po tych ziarnach. Drugi poziom: klucz źródło|rodzaj|w ładunku/spoza|klasa (bez ścieżek pól i bez
// bajtów) → { wyk — wiersze warstwy wykonalnej reguły T: rekordy, które scalanie zapisało inaczej, niż przyszły, i które
// bieżąca aplikacja musiałaby odesłać; nowe — wyk bez tego, co wychodzi już dziś (wpisy haków H1/H2/H3 tego scalenia,
// przegląd kolejki po drenażu zdarzeń, który coś scalił) }. Klucza bez wierszy nie ma (np. źródło 'w4' — 0 w każdym
// profilu). Przydział (druk): profil podstawowy E3-PR0c 20, E3-PR0d 4, bez przydziału 12; notatki pacjenta spoza
// ładunku pokrywają haki H2 i hak karty notatki (nowe 0). Zmiana zbieżności (E3-PR0c–f) przepisuje ten literał.
const ZNANE_ODSYL = {
  podstawowy: {
    'zdarzenie|pnote|spoza|inne': { wyk: 10, nowe: 0 },
    'zdarzenie|snap|spoza|gwiazdka': { wyk: 2, nowe: 2 },
    'zdarzenie|snap|w ładunku|gwiazdka': { wyk: 11, nowe: 11 },
    'zdarzenie|snap|w ładunku|inne': { wyk: 8, nowe: 8 },
    'zdarzenie|snap|w ładunku|rekord złożony': { wyk: 1, nowe: 1 },
    'zdarzenie|stomb|spoza|R4a': { wyk: 1, nowe: 1 },
    'zdarzenie|stomb|spoza|R4a′': { wyk: 1, nowe: 1 },
    'zdarzenie|stomb|w ładunku|R4a': { wyk: 1, nowe: 1 },
    'zdarzenie|stomb|w ładunku|R4a′': { wyk: 1, nowe: 1 },
  },
  'podstawowy:ogon': {
    'zdarzenie|pnote|spoza|inne': { wyk: 6, nowe: 0 },
    'zdarzenie|snap|w ładunku|gwiazdka': { wyk: 4, nowe: 4 },
    'zdarzenie|snap|w ładunku|inne': { wyk: 1, nowe: 1 },
    'zdarzenie|snap|w ładunku|rekord złożony': { wyk: 1, nowe: 1 },
    'zdarzenie|stomb|spoza|R4a′': { wyk: 2, nowe: 2 },
    'zdarzenie|stomb|w ładunku|R4a′': { wyk: 2, nowe: 2 },
  },
  pelny: {
    'zdarzenie|karta|w ładunku|nagłówek karty': { wyk: 2, nowe: 2 },
    'zdarzenie|snap|w ładunku|gwiazdka': { wyk: 1, nowe: 1 },
    'zdarzenie|snap|w ładunku|inne': { wyk: 1, nowe: 1 },
  },
};
function literalOdsyl(lista) {
  const o = {};
  for (const w of lista) {
    for (const [k, n] of Object.entries(w.literal)) (o[k] = o[k] || { wyk: 0, nowe: 0 }).wyk += n;
    for (const [k, n] of Object.entries(w.literalNowe)) (o[k] = o[k] || { wyk: 0, nowe: 0 }).nowe += n;
  }
  return sortuj(o);
}
const dodajDo = (o, z) => { for (const [k, v] of Object.entries(z || {})) o[k] = (o[k] || 0) + v; return o; };
// Podsumowanie licznika profilu (druk do opisu PR): scalenia i wiersze według źródła i warstwy, literał, przydział,
// koszt reguł, usunięcia, strażniki, największe minuty slotu (warstwa wyk i naiwna), partie, okna przesuwne, czas.
function sumaOdsyl(lista) {
  const s = { ziaren: lista.length, scalen: {}, zEchem: {}, wiersze: {}, przydzial: {}, tlumi: { A: {}, B: {}, T: {} }, usuniecia: {}, utrata: {}, polaZawsze: { encji: 0, bezPola: 0 }, kandydaci: {}, odcisk: { wersji: 0, zgodnych: 0 }, brakNosnika: 0, brakNosnikaKlasy: {}, bladBuildera: 0, oversize: 0, oversizeRealne: 0, slotow: 0, maksSlotu: null, maksNaiwny: null, partieMaks: 0, partiePonad200: 0, okno: { wykonalne: null, echo: null, naiwne: null }, ms: 0, msDodatkowe: {} };
  const wiekszy = (a, b, pole) => (!a || (b && b[pole] > a[pole]) ? b : a);
  for (const w of lista) {
    for (const k of ['scalen', 'zEchem', 'wiersze', 'usuniecia', 'utrata', 'brakNosnikaKlasy']) dodajDo(s[k], w[k]);
    dodajDo(s.przydzial, w.rodzajePrzydzial);
    for (const r of Object.keys(s.tlumi)) dodajDo(s.tlumi[r], w.tlumi[r]);
    s.polaZawsze.encji += w.polaZawsze.encji; s.polaZawsze.bezPola += w.polaZawsze.bezPola;
    for (const [k, v] of Object.entries(w.polaZawsze.kandydaci)) { const x = s.kandydaci[k] || (s.kandydaci[k] = { encji: 0, bezPola: 0 }); x.encji += v.encji; x.bezPola += v.bezPola; }
    s.odcisk.wersji += w.odcisk.wersji; s.odcisk.zgodnych += w.odcisk.zgodnych;
    s.brakNosnika += w.brakNosnika; s.bladBuildera += w.bladBuildera; s.oversize += w.oversize; s.oversizeRealne += w.budzet.oversize; s.slotow += w.budzet.slotow; s.ms += w.ms;
    dodajDo(s.msDodatkowe, w.msDodatkowe);
    const slot = (b) => (b ? { ziarno: w.ziarno, wierszy: b.wierszy, bajty: b.bajty, realneDo: b.realneDo, zadanMaks: b.zadanMaks } : null);
    s.maksSlotu = wiekszy(s.maksSlotu, slot(w.budzet.maksRealne), 'realneDo');
    s.maksNaiwny = wiekszy(s.maksNaiwny, slot(w.budzetNaiwny.maksRealne), 'realneDo');
    s.partieMaks = Math.max(s.partieMaks, w.partieDostaw.maks); s.partiePonad200 += w.partieDostaw.ponad200;
    for (const k of Object.keys(s.okno)) s.okno[k] = wiekszy(s.okno[k], { ziarno: w.ziarno, ...w.okno[k] }, 'slotBajtow');
  }
  return s;
}
// Zieleń licznika ziarna (lista pusta albo zero — zieleń).
const ZRODLA_BIEZACE = ['zdarzenie', 'w4'];
function zielenOdsyl(w) {
  const zrodla = Object.keys(w.scalen).filter((z) => z !== 'powtórka').sort();
  return {
    'pola zawsze obecne: encje od bieżącej wersji bez pola z POLA_ZAWSZE': w.polaZawsze.bezPola,
    'źródła spoza bieżących urządzeń': zrodla.filter((z) => !ZRODLA_BIEZACE.includes(z)),
    'warstwa wykonalna ≠ po2a między bieżącymi (źródło: wyk / po2a)': zrodla.filter((z) => (w.wiersze[`${z}:wyk`] || 0) !== (w.wiersze[`${z}:po2a`] || 0)).map((z) => `${z}: ${w.wiersze[`${z}:wyk`] || 0} / ${w.wiersze[`${z}:po2a`] || 0}`),
    'budżet minuty slotu przekroczony (≤ 600 wierszy, ≤ 4 MiB realnie, ≤ 20 żądań na urządzenie)': w.budzet.przekroczone.map((x) => `t ${x.t}: ${x.wierszy} wierszy, ${x.realneDo} B, ${x.zadanMaks} żądań`),
    'powtórka partii: partii / wierszy surowych': [w.powtorka.partii, w.wiersze['powtórka:surowe'] || 0],
    'odcisk testu ≠ h wersji': w.odcisk.wersji - w.odcisk.zgodnych,
    'wyjątki builderów nośników': w.bladBuildera,
  };
}
const ZIELEN_ODSYL = {
  'pola zawsze obecne: encje od bieżącej wersji bez pola z POLA_ZAWSZE': 0,
  'źródła spoza bieżących urządzeń': [],
  'warstwa wykonalna ≠ po2a między bieżącymi (źródło: wyk / po2a)': [],
  'budżet minuty slotu przekroczony (≤ 600 wierszy, ≤ 4 MiB realnie, ≤ 20 żądań na urządzenie)': [],
  'powtórka partii: partii / wierszy surowych': [1, 0],
  'odcisk testu ≠ h wersji': 0,
  'wyjątki builderów nośników': 0,
};
const opisOdsyl = (w) => JSON.stringify({ ziarno: w.ziarno, przyklady: w.przyklady, polaZawsze: w.polaZawsze.przyklady, odcisk: w.odcisk.niezgodne, budzet: w.budzet.przekroczone.slice(0, 4) }, null, 1);
// [klucz WYNIKI, opis, ziarna przebiegu, czy ziarno wchodzi do literału, ziarna literału]
const PROFILE_ODSYL = [
  ['podstawowy', 'profil podstawowy', () => ZIARNA, (z) => domyslne(z), DOMYSLNE_ZIARNA],
  ['podstawowy:ogon', 'koalescencja kolejki', () => ZIARNA_KOAL, (z) => !KROKI && DOMYSLNE_ZIARNA_KOAL.includes(z), DOMYSLNE_ZIARNA_KOAL],
  [KOAL_PELNY ? 'pelny:ogon' : 'pelny', 'profil pełny', () => ZIARNA_PELNY, (z) => !KROKI && !KOAL_PELNY && DOMYSLNE_ZIARNA_PELNY.includes(z), DOMYSLNE_ZIARNA_PELNY],
  ...(process.env.E2_AB_PROFIL === 'bez-polaczenia' ? [['bez-polaczenia', 'profil „dłuższa praca bez połączenia”', () => ZIARNA, () => false, []]] : []),
];
describe.skipIf(!ODSYL)('A ≡ B, licznik odsyłania w profilach (E3-PR0b; wyniki ziaren profili wyżej)', () => {
  d1();
  for (const [klucz, opis, ziarna, zLiteralem, ziarnaLiteralu] of PROFILE_ODSYL) {
    it(`${opis}: pola zawsze obecne, warstwa wykonalna = po2a, budżet minuty slotu, powtórka partii — 0, odcisk = h; literał ZNANE_ODSYL (druk: podsumowanie licznika)`, () => {
      const lista = ODSYL_WYNIKI[klucz];
      expect(lista.map((w) => w.ziarno), `ziarna ${opis} z licznikiem (przypadki ziaren wyżej w tym przebiegu)`).toEqual(ziarna());
      for (const w of lista) {
        expect.soft(zielenOdsyl(w), `licznik odsyłania, ${opis}, ziarno ${w.ziarno}\n${opisOdsyl(w)}`).toEqual(ZIELEN_ODSYL);
        expect.soft({ encjiZPolem: w.polaZawsze.encji > 0, wersjiZOdciskiem: w.odcisk.wersji > 0 }, `strażniki niepuste (${opis}, ziarno ${w.ziarno})`).toEqual({ encjiZPolem: true, wersjiZOdciskiem: true });
      }
      const s = sumaOdsyl(lista);
      console.log(`E3-AB licznik ${klucz}`, JSON.stringify(s));
      const dom = lista.filter((w) => zLiteralem(w.ziarno));
      if (ziarnaLiteralu.length && dom.length === ziarnaLiteralu.length) expect(literalOdsyl(dom), `ZNANE_ODSYL['${klucz}'] (warstwa ${WYK})`).toEqual(ZNANE_ODSYL[klucz]);
    }, 10_000);
  }
});

// Determinizm: ziarno 1 profilu podstawowego, 20 mutacji (początek programu ziarna 1), raz z licznikiem i powtórką
// partii, raz bez — ten sam dziennik operacji, te same eksporty końcowe obu urządzeń i ten sam wynik (bez czasu). Ten
// przebieg (nazwa 'determinizm') nie wchodzi do podsumowań AB2/AB7, ZNANE_WYR ani ZNANE_ODSYL.
describe.skipIf(!ODSYL)('A ≡ B, licznik odsyłania: determinizm (ziarno z licznikiem i bez — ten sam program)', () => {
  d1();
  it('ziarno 1, 20 mutacji: dziennik operacji, eksporty końcowe A i B i wynik bez czasu równe z licznikiem i bez; powtórka partii — 0 wierszy surowych', async () => {
    const z = await przebiegZiarna(1, 'podstawowy', { nazwa: 'determinizm', kroki: 20, odsyl: true, slad: true });
    const o = ODSYL_WYNIKI.determinizm[ODSYL_WYNIKI.determinizm.length - 1];
    await sprzatnijUrzadzenia();
    vi.restoreAllMocks();
    ustaw(START);
    const b = await przebiegZiarna(1, 'podstawowy', { nazwa: 'determinizm', kroki: 20, odsyl: false, slad: true });
    const bezCzasu = ({ ms: _ms, slad: _slad, ...r }) => r;
    // Klucz główny konta pochodzi z prawdziwego źródła losowości (kryptoZiarna: z ziarna tylko identyfikatory i IV), więc
    // jego szyfrogram w poświadczeniu różni się między przebiegami niezależnie od licznika — poza porównaniem.
    const bezKlucza = (lad) => (lad.credential && lad.credential.encryptedMasterByPassword
      ? { ...lad, credential: { ...lad.credential, encryptedMasterByPassword: { ...lad.credential.encryptedMasterByPassword, data: '(klucz losowy)' } } } : lad);
    const eksporty = (x) => ({ A: bezKlucza(x.slad.eksport.A), B: bezKlucza(x.slad.eksport.B) });
    expect(z.mutacji).toBe(20);
    expect(o.scalen.zdarzenie, 'scalenia zdarzeń z licznikiem').toBeGreaterThan(0);
    expect(z.slad.dziennik, 'dziennik operacji').toEqual(b.slad.dziennik);
    expect(eksporty(z), 'eksporty końcowe A i B').toEqual(eksporty(b));
    expect(bezCzasu(z), 'wynik ziarna bez czasu').toEqual(bezCzasu(b));
    expect([o.powtorka.partii, o.scalen['powtórka'] === o.powtorka.zdarzen, o.wiersze['powtórka:surowe'] || 0], 'powtórka partii: partii, scalenie na zdarzenie, wierszy surowych').toEqual([1, true, 0]);
  }, 60_000);
});

// ══ Flota ze starszą aplikacją (E3-PR0b, P-ZBIEZNOSC-ZDARZEN; tylko testy) ═══════════════════════════════════════════
// Trzy urządzenia jednego konta: A i B — bieżący sejf (bliźniaki), C — bliźniak A z sejfem starszej aplikacji
// (urzadzenie(..., { app }); tests/support/starsza-aplikacja.mjs) i retencją v1 (E2_AB_RET_C=biezaca — kontrola); klon
// dziedziczy app i retencję. Moduły okna C: vilda_crypto.js bieżący (bajt w bajt równy obu starszym), retencja v1,
// sejf z fikstury; vilda_sync.js nie jest ładowany (sync: false), transport C modeluje ten blok; skryptów punktu
// kontrolnego (okno-magazynu.mjs) A ≡ B nie ładuje.
// FLOTA 221 (vilda_vault.js z 54a84da3, bez dziennika zdarzeń):
//   odbiór — kolejki A i B przez applyEncryptedDelta (jak /changes bez dziennika; B13 w sync-zdarzenia-buildery.test.mjs):
//     dostawaDoStarszej;
//   delty — słuchacze integracji z 54a84da3:vilda_sync_integration.js po każdej operacji sejfu C (mutacja, scalenie
//     kolejki, scalenie pełnej kopii): karta — buildPatientDelta, pominięta przy data.length > PROG_DELT_FLOTY; nagrobek
//     karty i nagrobek notatki — zawsze; notatka pacjenta — także action 'merge' z Le sejfu 221 ('merge-delete' —
//     builder null); szablon biblioteki i jego nagrobek — z progiem. Jedno żądanie na deltę. Próg w treści uprzęży:
//     PROG_DELT_221 (strażnik dł(2 wersje) < próg < dł(3 wersje) — starsza-aplikacja-fikstury.test.mjs);
//     E2_AB_PROG_D221=60000 — próg aplikacji, E2_AB_D221=0 — bez delt (ręcznie). Delty szyfruje sejf C z osobnego
//     strumienia IV i z własnym Math.random (program identyfikatorów C bez zmian). Dostawa do A i B — applyEncryptedEvent
//     (drenaż /changes przy dzienniku), haki do Q odbiorcy (setId H1 do Y.setIds), losowo (osobny generator S.losD:
//     0,35 na krok i odbiorcę) i zawsze w punkcie spoczynku;
//   pełna kopia — E2_AB_BLOB_C=los (domyślnie): losowo między wszystkimi parami (0,08 na krok); publikuje (ręcznie):
//     dodatkowo A i B scalają stan C (publikowany po każdej jego zmianie) z prawdopodobieństwem 0,5 na krok (osobny
//     generator S.losB), gdy zmienił się od ich ostatniego pobrania, i zawsze w punkcie spoczynku. W aplikacji 221:
//     PUT /blob do 60 s po pierwszej niewysłanej zmianie, co 20. zmiana po 1,5 s.
// FLOTA 276 (vilda_vault.js z 743dba9a: dziennik zdarzeń, retencja v1; przy włączonym dzienniku bez /delta): zdarzenia
//   między wszystkimi parami (losowo i w spoczynku), pełna kopia jak w wariancie los.
// KONTROLA E2_AB_FLOTA=N: C = bieżący sejf w świecie i z transportem floty 276 (skutki samego trzeciego urządzenia).
// PEŁNA KOPIA (scalBlob): Y scala eksport Z; na urządzeniu z dziennikiem wpisy haków ze scalenia idą do Q_Y, a setId haka
//   H1 — do Y.setIds (jak Bem_pelne sejfu; bez tego model haków AB7 oczekuje pfull ponownie przy następnym zdarzeniu
//   ptomb tej karty). Licznik odsyłania: echo u bieżącego odbiorcy, źródło blob221, blob276 albo blobN.
// PUNKT SPOCZYNKU: flota 221 — najwyżej LO.MAKS_OBIEGOW obiegów: delty C → A, B (przy publikuje też stan C), spoczynek
//   A↔B, kolejki A, B → C; flota 276 — dostawy między wszystkimi parami, aż kolejki są dostarczone. Potem W1 (D par
//   z klasami i wyrocznia na żywych urządzeniach, świat 'W1 floty') i W4 floty na świeżych klonach: obiegi wymiany PO-A
//   par (A, B), (B, C), (C, A), aż żaden eksport się nie zmienia (≤ 4; licznik — pół wymiany w pierwszym obiegu, źródło
//   'w4'); D każdej pary — para z C w tabeli 'flota', para A, B w tabeli W4 profilu (R4n — z W4p); wyrocznia 'W4 floty'
//   z widokiem C jako widokiem starszej aplikacji (stare).
// WYROCZNIA: flota 221 — W1 floty tylko druk (karta ponad próg delty nie dochodzi do A i B przed pełną kopią), miarą jest
//   W4 floty; flota 276 — W1 floty i W4 floty.
// WAGI C: flota 221 — wagi profilu bez zmiany hasła, w profilu pełnym także bez „Scal pacjentów”, „Zostaw notatkę”
//   i retencji przypiętej (jak w pomiarach przygotowawczych E3-PR0b); flota 276 — wagi profilu. Odmowy sejfu 221
//   (ODMOWY_STARSZEJ) — literał według kodu.
// ZIARNA ŚWIATA: ziarno + 200 000 (flota 221) albo + 400 000 (flota 276 i kontrola N), profil pełny + 100 000;
//   E2_AB_SWIAT_FLOTA=<przesunięcie> zastępuje 200 000 / 400 000 (odtwarzanie światów z pomiarów przygotowawczych).
// STRAŻNIK CHWIL (pomiar): każda updatedAtISO, _contentAtISO i _pinnedState.at wersji i wpisów Kosza w eksportach
//   końcowych jest chwilą jakiejś operacji z historii (S.chwile — chwile mutacji).
// Zmienne: E2_AB_FLOTA=221,276|0|N (domyślnie 221,276), E2_AB_ZIARNA_FLOTA221 (1,2,3), E2_AB_ZIARNA_FLOTA276 (2; też
//   kontrola N), E2_AB_FLOTA_PROFIL=pelny, E2_AB_SWIAT_FLOTA, E2_AB_PROG_D221, E2_AB_D221=0, E2_AB_RET_C=biezaca,
//   E2_AB_BLOB_C=publikuje, E2_AB_SLAD=<prefiks identyfikatora>[,…] (stan wersji i wpisu Kosza na A, B, C po każdym
//   wierszu dziennika), E2_AB_WYNIKI (wiersze typ 'flota221' | 'flota276' | 'flotaN'), E2_AB_ECHO_KLONY=wszystkie (echo
//   na klonach każdego scalenia z echem; poza programem świata — echoNaKlonach w bloku scenariuszy floty niżej). Literały
//   tylko dla przebiegu domyślnego (FLOTA_DOMYSLNA) i ziaren CI.
const FLOTA_ENV = (process.env.E2_AB_FLOTA || '221,276').trim();
const FLOTY = FLOTA_ENV === '0' ? [] : FLOTA_ENV.split(',').map((s) => s.trim()).filter(Boolean);
const listaZiaren = (zmienna, dom) => (process.env[zmienna] ? process.env[zmienna].split(',').map(Number).filter(Number.isFinite) : dom);
const ZIARNA_FLOTA_CI = Object.freeze({ 221: Object.freeze([1, 2, 3]), 276: Object.freeze([2]) });
const ZIARNA_FLOTA = { 221: listaZiaren('E2_AB_ZIARNA_FLOTA221', ZIARNA_FLOTA_CI[221]), 276: listaZiaren('E2_AB_ZIARNA_FLOTA276', ZIARNA_FLOTA_CI[276]) };
ZIARNA_FLOTA.N = ZIARNA_FLOTA[276];
const FLOTA_PROFIL = process.env.E2_AB_FLOTA_PROFIL === 'pelny' ? 'pelny' : 'podstawowy';
const SWIAT_FLOTA = process.env.E2_AB_SWIAT_FLOTA ? Number(process.env.E2_AB_SWIAT_FLOTA) : null;
const PROG_DELT_FLOTY = Number(process.env.E2_AB_PROG_D221) || PROG_DELT_221;
const Z_DELTAMI_221 = process.env.E2_AB_D221 !== '0';
const RET_C = process.env.E2_AB_RET_C === 'biezaca' ? 'biezaca' : 'v1';
const BLOB_C = process.env.E2_AB_BLOB_C === 'publikuje' ? 'publikuje' : 'los';
const SLAD_FLOTY = (process.env.E2_AB_SLAD || '').split(',').filter(Boolean);
const FLOTA_DOMYSLNA = !KROKI && FLOTA_PROFIL === 'podstawowy' && PROG_DELT_FLOTY === PROG_DELT_221 && Z_DELTAMI_221 && RET_C === 'v1' && BLOB_C === 'los'
  && SWIAT_FLOTA === null && WYR.NORM_VISIT.wlaczona && ODSYL;
const zLiteralemFloty = (flota, z) => FLOTA_DOMYSLNA && (ZIARNA_FLOTA_CI[flota] || []).includes(z);
WAGI['flota221:podstawowy'] = { ...WAGI.podstawowy, haslo: 0 };
WAGI['flota221:pelny'] = { ...WAGI.pelny, haslo: 0, scal: 0, zostawNotatke: 0, retencjaPrzypietej: 0 };

// ── Delty sejfu 221 (/delta) ─────────────────────────────────────────────────────────────────────────────────────────
const BUDOWNICZE_DELT = Object.freeze({ karta: 'buildPatientDelta', ptomb: 'buildTombstoneDelta', pnote: 'buildNoteDelta', pnotetomb: 'buildNoteTombstoneDelta', note: 'buildLibraryNoteDelta', notetomb: 'buildLibraryNoteTombstoneDelta' });
const DELTY_Z_PROGIEM = new Set(['karta', 'note', 'notetomb']);
// crypto okna C: identyfikatory i IV z ziarna urządzenia, a na czas budowania delt — z osobnego strumienia.
function kryptoZDeltami(ziarno, ziarnoDelt) {
  const glowne = kryptoZiarna(ziarno), delt = kryptoZiarna(ziarnoDelt);
  const p = { delty: false };
  const k = () => (p.delty ? delt : glowne);
  return { p, obj: { subtle: glowne.subtle, getRandomValues: (x) => k().getRandomValues(x), randomUUID: () => k().randomUUID() } };
}
function podepnijDelty(S, C, przel) {
  C.delty = { zdarzenia: [], Q: [], przel };
  S.stat.delty = { zbudowane: {}, prog: {}, puste: {}, dostaw: 0, wpisow: 0, statusy: {}, bajty: 0, zmian: 0, bezZmian: 0, haki: {}, ms: 0 };
  const z = C.delty.zdarzenia;
  C.v.onPatientSaved((e) => { z.push({ rodzaj: 'karta', id: e && e.patientId }); });
  C.v.onPatientDeleted((e) => { z.push({ rodzaj: 'ptomb', id: e && e.patientId, at: e && e.deletedAtISO }); });
  C.v.onPatientNoteChanged((e) => { if (e) z.push(e.action !== 'delete' ? { rodzaj: 'pnote', id: e.id, action: e.action } : { rodzaj: 'pnotetomb', id: e.id, at: e.deletedAtISO }); });
  C.v.onNoteChanged((e) => { if (e) z.push(e.action !== 'delete' ? { rodzaj: 'note', id: e.id, action: e.action } : { rodzaj: 'notetomb', id: e.id, at: e.deletedAtISO }); });
}
async function cichoDelty(S, fn) {
  S.nrDelty = (S.nrDelty || 0) + 1;
  const alt = rng(0xD221 + S.ziarno * 31 + S.nrDelty);
  if (!vi.isMockFunction(Math.random)) return fn();
  let w;
  await vi.mocked(Math.random).withImplementation(() => alt(), async () => { w = await fn(); });
  return w;
}
// Delty z powiadomień sejfu C od ostatniego wywołania (zrodlo: 'mutacja' albo 'scalanie' — echo notatek z Le 221).
async function wyslijDelty(S, C, zrodlo) {
  if (!C.delty || !C.delty.zdarzenia.length) return 0;
  const t0 = performance.now();
  const zd = C.delty.zdarzenia.splice(0);
  const st = S.stat.delty;
  const dodaj = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const nowe = [];
  await cichoDelty(S, async () => {
    C.delty.przel.delty = true;
    try {
      for (const z of zd) {
        const opis = `${z.rodzaj}${z.action && z.action !== 'save' ? ':' + z.action : ''}`;
        const args = z.rodzaj === 'ptomb' || z.rodzaj === 'pnotetomb' || z.rodzaj === 'notetomb' ? [z.id, z.at] : [z.id];
        const o = await C.v[BUDOWNICZE_DELT[z.rodzaj]](...args);
        if (!o || !o.iv || !o.data) { dodaj(st.puste, opis); continue; }
        if (DELTY_Z_PROGIEM.has(z.rodzaj) && o.data.length > PROG_DELT_FLOTY) { dodaj(st.prog, opis); continue; }
        const jaw = await C.v.decryptPayloadForCurrentUser(o.iv, o.data);
        const bajty = JSON.stringify({ token: 'x'.repeat(64), payload: { iv: o.iv, data: o.data } }).length; // ciało POST /delta
        st.bajty += bajty;
        dodaj(st.zbudowane, opis);
        const e = Object.freeze({ kind: 'delta', rodzaj: z.rodzaj, opis, key: z.id, zrodlo, env: Object.freeze({ iv: o.iv, data: o.data }), jaw: Object.freeze(json(jaw)), bajty, t: teraz });
        C.delty.Q.push(e); nowe.push(e);
      }
    } finally { C.delty.przel.delty = false; }
  });
  if (S.odsyl) for (const e of nowe) wyslijOs(S, C, 'delta221', [e.bajty]);
  if (nowe.length) S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} ${C.nazwa} (${C.app}) /delta (${zrodlo}): ${nowe.map((e) => e.opis).join(',')}`);
  st.ms += performance.now() - t0;
  return nowe.length;
}
const kursorDelt = (S, C, Y) => S.kursor.get(`${C.nazwa}>${Y.nazwa}:delta`) || 0;
// Dostawa delt C → Y (bieżący): FIFO od kursora, applyEncryptedEvent (status inny niż applied — błąd testu), haki do Q_Y
// (setId H1 do Y.setIds), licznik: źródło delta221, strony ≤ 200, przegląd natychmiast (drenaż, który scalił).
async function dostawaDelt(S, C, Y, { k = Infinity } = {}) {
  if (!C.delty) return 0;
  const nazwa = `${C.nazwa}>${Y.nazwa}:delta`;
  const c = kursorDelt(S, C, Y);
  const partia = C.delty.Q.slice(c, c + Math.min(k, C.delty.Q.length - c));
  if (!partia.length) return 0;
  const st = S.stat.delty;
  const przed = Y.stan;
  Y.lancuch.length = 0;
  const stany = [przed];
  for (const e of partia) {
    const r = await Y.ev.applyEncryptedEvent(e.env);
    const s = r && r.status;
    st.statusy[s] = (st.statusy[s] || 0) + 1;
    if (s !== 'applied') throw new Error(`${Y.nazwa}: delta ${e.opis} ${e.key} → status ${s} ${r && (r.reason || r.code || '')}`);
    stany.push(await eksport(Y));
    if (S.wyr) WYR.naBiezacym(S.wyr, { lad: e.jaw, po: stany[stany.length - 1] });
  }
  S.kursor.set(nazwa, c + partia.length);
  const po = stany[stany.length - 1];
  for (let i = 0; i < partia.length; i += 1) { if (JSON.stringify(kanon(stany[i])) !== JSON.stringify(kanon(stany[i + 1]))) st.zmian += 1; else st.bezZmian += 1; }
  const dodane = await hakiScalenia(S, Y, po, (x) => { st.haki[x.event.kind] = (st.haki[x.event.kind] || 0) + 1; });
  ustawStan(Y, po);
  st.dostaw += 1; st.wpisow += partia.length;
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} dostawa ${nazwa}: ${partia.length} [${partia.map((e) => e.opis + (e.zrodlo === 'mutacja' ? '' : '*')).join(',')}]${dodane.length ? ` → haki [${dodane.map((x) => x.event.kind).join(',')}]` : ''}`);
  if (S.odsyl) {
    if (dodane.length) wyslijOs(S, Y, 'haki', dodane.map((x) => bajtyKoperty(Y, x)));
    const haki = LO.kluczeKopert(dodane);
    for (const [od, d] of LO.strony(partia.length)) {
      const odcinki = partia.slice(od, d).map((e, i) => ({ przed: stany[od + i], po: stany[od + i + 1], ladunek: json(e.jaw), z221: true }));
      await liczEcho(S, Y, 'delta221', odcinki, haki, `#${S.nrKroku || 0} ${nazwa} [${partia.length} delt, strona ${od / LO.LIMITY.stronaDostawy + 1}]`, { natychmiast: true });
    }
  }
  return partia.length;
}
async function losoweDelty(S, C, urz) {
  if (!C.delty) return;
  for (const Y of urz) {
    const n = C.delty.Q.length - kursorDelt(S, C, Y);
    if (n && S.losD() < 0.35) await dostawaDelt(S, C, Y, { k: S.losD() < 0.6 ? n : 1 + Math.floor(S.losD() * n) });
  }
}
// Haki ze scalenia poza dostawą zdarzeń (pełna kopia, delta 221): wpisy rejestru łańcucha konta Y → koperty builderów
// do Q_Y; setId haka H1 — do Y.setIds. Bez porównania z modelem haków (model dotyczy partii zdarzeń, AB7).
async function hakiScalenia(S, Y, po, licz = null) {
  if (!Array.isArray(Y.lancuch)) return [];
  const dodane = [];
  for (const z of Y.lancuch.splice(0).filter((x) => !x.znacznik && x.uid === po.userId)) {
    if (z.kind === 'pfull' && z.o && z.o.setId) Y.setIds.add(z.o.setId);
    const k = await zbuduj(Y, encjaWpisu(z));
    for (const x of Array.isArray(k) ? k : k ? [k] : []) { await doKolejki(S, Y, x); dodane.push(x); if (licz) licz(x); }
  }
  if (dodane.length) S.stat.hakiScalenia = (S.stat.hakiScalenia || 0) + 1;
  return dodane;
}

// ── Transport floty: kolejka do 221, pełna kopia, dostawy między wszystkimi parami ───────────────────────────────
// Kolejka X → C (sejf 221): FIFO od kursora, applyEncryptedDelta (null — błąd testu); po scaleniu delty sejfu C.
async function dostawaDoStarszej(S, X, C, { k = Infinity } = {}) {
  const nazwa = X.nazwa + '>' + C.nazwa;
  const c = S.kursor.get(nazwa) || 0;
  const partia = X.Q.slice(c, c + Math.min(k, X.Q.length - c));
  if (!partia.length) return 0;
  for (const e of partia) { const w = await C.v.applyEncryptedDelta(e.env); if (w == null) throw new Error(`${C.nazwa}: applyEncryptedDelta odrzucił ${e.kind} ${e.key}`); }
  S.kursor.set(nazwa, c + partia.length);
  ustawStan(C, await eksport(C));
  S.stat.dostawDoStarszej = (S.stat.dostawDoStarszej || 0) + 1;
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} dostawa ${nazwa} (applyEncryptedDelta): ${partia.length} [${partia.map((e) => e.kind).join(',')}]`);
  await wyslijDelty(S, C, 'scalanie');
  return partia.length;
}
// Y scala pełną kopię Z (GET /blob po PUT innego urządzenia, także starszego).
async function scalBlob(S, Z, Y) {
  const blob = json(await Z.v.exportSyncPayload());
  const przed = Y.stan;
  if (Array.isArray(Y.lancuch)) Y.lancuch.length = 0;
  await Y.v.mergeSyncPayload(json(blob));
  const po = await eksport(Y);
  // wyrocznia floty: zmiany starszej aplikacji, które doszły pełną kopią do żywej karty bieżącego urządzenia
  if (S.wyr && starszaAplikacja(Z) && !starszaAplikacja(Y)) WYR.naBiezacym(S.wyr, { lad: blob, po });
  const dodane = await hakiScalenia(S, Y, po);
  ustawStan(Y, po);
  S.stat.blobow = (S.stat.blobow || 0) + 1;
  S.dziennik.push(`#${S.nrKroku || 0} ${new Date(teraz).toISOString().slice(11, 23)} blob ${Z.nazwa}→${Y.nazwa}${dodane.length ? ` → haki [${dodane.map((x) => x.event.kind).join(',')}]` : ''}`);
  if (Y.delty) await wyslijDelty(S, Y, 'scalanie');
  if (S.odsyl && !starszaAplikacja(Y)) {
    if (dodane.length) wyslijOs(S, Y, 'haki', dodane.map((k) => bajtyKoperty(Y, k)));
    const zrodlo = Z.app === 'S221' ? 'blob221' : Z.app === 'S276' ? 'blob276' : 'blobN';
    await liczEcho(S, Y, zrodlo, [{ przed, po, ladunek: blob, z221: Z.app === 'S221' }], LO.kluczeKopert(dodane), `#${S.nrKroku || 0} blob ${Z.nazwa}→${Y.nazwa}`, { odBiezacej: !starszaAplikacja(Z) });
  }
}
// Wariant publikuje: A i B scalają stan C, gdy zmienił się od ich ostatniego pobrania (wymus — w punkcie spoczynku).
const podpisStanu = (U) => JSON.stringify(kanon(U.stan));
async function pobierzStanC(S, C, urz, wymus) {
  const p = podpisStanu(C);
  for (const Y of urz) {
    if (Y.pobranyC === p) continue;
    if (!wymus && S.losB() >= 0.5) continue;
    await scalBlob(S, C, Y);
    Y.pobranyC = p;
    S.stat.pobranStanuC = (S.stat.pobranStanuC || 0) + 1;
  }
}
// Dostawa losowa między wszystkimi parami (flota 276, kontrola N): kierunek, FIFO-prefiks k, czasem powtórka sufiksu.
async function losowaDostawaFloty(S, urz) {
  const los = S.los;
  const pary = [];
  for (const X of urz) for (const Y of urz) if (X !== Y) pary.push([X, Y]);
  const [X, Y] = wybierz(los, pary);
  const c = kursor(S, X, Y);
  const cofnij = c > 0 && los() < 0.15 ? 1 + Math.floor(los() * Math.min(c, 4)) : 0;
  const ocz = X.Q.length - c + cofnij;
  if (!ocz) return;
  const k = los() < 0.5 ? ocz : 1 + Math.floor(los() * ocz);
  await dostawa(S, X, Y, { k, cofnij, w2s: false });
}
async function spoczynekWszystkich(S, urz) {
  for (let r = 1; r <= 6; r += 1) {
    for (const X of urz) for (const Y of urz) if (X !== Y) await dostawa(S, X, Y, { w2s: false });
    if (urz.every((X) => urz.every((Y) => X === Y || kursor(S, X, Y) === X.Q.length))) return r;
  }
  return null;
}
async function spoczynekFloty221(S, A, B, C) {
  for (let obieg = 1; obieg <= LO.MAKS_OBIEGOW; obieg += 1) {
    await dostawaDelt(S, C, A); await dostawaDelt(S, C, B);
    if (S.blobC === 'publikuje') await pobierzStanC(S, C, [A, B], true);
    if (await spoczynek(S, A, B, { w2s: false }) === null) return null;
    await dostawaDoStarszej(S, A, C); await dostawaDoStarszej(S, B, C);
    const czekaDelt = !!C.delty && [A, B].some((Y) => kursorDelt(S, C, Y) < C.delty.Q.length);
    const czekaStan = S.blobC === 'publikuje' && [A, B].some((Y) => Y.pobranyC !== podpisStanu(C));
    if (!czekaDelt && !czekaStan) return obieg;
  }
  S.stat.obiegiPonadLimit.push(S.nrKroku);
  return LO.MAKS_OBIEGOW;
}

// ── Klasy różnic par floty (tabela 'flota'; DOZWOLONE wyżej) ─────────────────────────────────────────────────────────
// Tylko w parze z urządzeniem starszej aplikacji (kont.starsza — jego strona, kont.appStarszej); ta sama różnica w parze
// dwóch bieżących urządzeń nie dostaje tych klas.
// - D_TOZSAMOSC „tożsamość wizyty nieznana starszej aplikacji”: wersja różni się tylko payload.visit (bieżąca aplikacja
//   wyznacza tożsamość przy odczycie i scalaniu — Bvisit_read, Bvisit_legacy :5908–5918 — i ją utrwala; starsza jej nie
//   pisze; po stronie bieżącej tożsamość z visitId i kartą wizyty równą karcie rekordu — Bvisit_owner :5897), a
//   payload._pinnedState.h tylko z dowodem odcisku: treść strony bieżącej bez visit z odciskiem przeliczonym tak
//   jak Bvisit_withMetadata (:5889–5895; przelicza tylko świeży h) jest równa stronie starszej; wpis Kosza — także
//   visitIdentity i visitCipher (Bev_wpisKosza bieżącej wersji). Wariant karty wizyty: obie strony mają tę samą
//   wizytę (visitId) z inną kartą, po stronie bieżącej karta wizyty jest kartą rekordu (Bvisit_owner :5897), reszta
//   (bez h) równa. docs/PATIENT_VISITS.md „Zgodność i wycofanie”;
// - D_POLE_221 „pole nieznane starszej aplikacji (221)”: tylko 221 — wpis Kosza różni się tylko polami koszISO, revPary,
//   deletedWithPatient, gwiazdka (gwiazdka tylko przy tej samej gwiazdce obu stron w oknie Kosza) i polami tożsamości
//   wizyty jak wyżej; nagrobek notatki — tylko deletedWithPatient (sejf 221 ich nie zna i gubi przy scaleniu);
// - D_RETENCJA „retencja starszej aplikacji — obecność wersji”: wersja tylko po stronie bieżącej, po stronie starszej jest
//   wpis Kosza tej wersji z powod 'retencja', a po stronie bieżącej wersja jest najnowszą wersją swojej wizyty w karcie
//   (bieżący odbiorca nagrobka retencji zachowuje stan wizyty — Bvisit_protected :6189, Bvisit_keepRetention :6272).
// - D7 przy tożsamości wpisu Kosza (tylko 276): wpis Kosza różni się polami tożsamości (276 nie zna visitIdentity —
//   lista pól wpisu Kosza w tests/fixtures/vilda_vault-276.js.txt:5848 bez niego, vilda_vault.js:6358 z nim) i polami D7
//   (koszISO, revPary, rev, updatedAtISO, zmianaISO); bez pól tożsamości różnica jest D7 dwóch bieżących urządzeń (ta sama
//   różnica koszISO w kontroli N tych światów: urządzenie, do którego nie doszło „Przywróć”, zachowuje chwilę dawnego
//   kosza w koszISO nagrobka retencji, vilda_vault.js:1849–1879). Klasa D7, dozwolona według tabeli wołającego
//   (tabelaBiezacych z kontPary), nie tabeli 'flota'.
// - D_CHWILE_NOTATKI „chwile notatki nieznane starszej aplikacji” (E3-PR0b2b, P-NOTATKA-POZNIEJSZA): notatka różni się
//   tylko polami chwili treści i oznaczenia (contentAtISO, contentForISO, stateAtISO, stateForISO), po stronie starszej
//   aplikacji ich nie ma (ucina je przy zapisie), reszta rekordu równa — ta sama wersja, różnica niewidoczna dla
//   lekarza (zmierzone: scenariusz floty 221 „Usuń pacjenta” na A, najpierw pełna kopia C — ratunek D-21 na bieżącym
//   urządzeniu zapisuje pola, 221 je ucina).
const POLA_TOZSAMOSCI = Object.freeze({ wersja: Object.freeze(['payload.visit']), kosz: Object.freeze(['visitIdentity', 'visitCipher', 'payload.visit']) });
const POLA_221_KOSZA = Object.freeze(['koszISO', 'revPary', 'deletedWithPatient']);
function bezTozsamosci(p) {
  if (!p || typeof p !== 'object' || !p.visit) return p;
  const o = json(p);
  delete o.visit;
  if (o._pinnedState && typeof o._pinnedState.h === 'string' && p._pinnedState.h === LO.odcisk(p)) o._pinnedState.h = LO.odcisk(o);
  return o;
}
function glowaWizyty(lad, pid, sid) {
  const p = (lad.patients || []).find((q) => q.patientId === pid);
  const q = p && (p.snapshots || []).find((s) => s.snapshotId === sid);
  const vid = q && q.payload && q.payload.visit && q.payload.visit.visitId;
  if (!vid) return false;
  return !p.snapshots.some((s) => s.snapshotId !== sid && s.payload && s.payload.visit && s.payload.visit.visitId === vid && (s.savedAtISO || '') > (q.savedAtISO || ''));
}
function klasaParyFloty(r, X, Y, kont) {
  const st = kont.starsza;
  if (st !== 'x' && st !== 'y') return null;
  const [Ls, Ln] = st === 'x' ? [X, Y] : [Y, X];
  if (r.rodzaj === 'wersja' && r.tylko) {
    if (r.tylko === st) return null;
    const [pid, sid] = r.klucz.split('/');
    const ret = (Ls.snapshotTombstones || []).some((e) => e.snapshotId === sid && e.powod === 'retencja');
    return ret && glowaWizyty(Ln, pid, sid) ? { klasa: D_RETENCJA, wariant: 'wersja tylko u bieżącej, wpis retencji u starszej' } : null;
  }
  if (!r.a || !r.b) return null;
  const [es, en] = st === 'x' ? [r.a, r.b] : [r.b, r.a];
  const z221 = kont.appStarszej === 'S221';
  if (r.rodzaj === 'pnotetomb') return z221 && r.sciezki.every((s) => wPolach(s, ['deletedWithPatient'])) ? { klasa: D_POLE_221, wariant: 'nagrobek notatki usuniętej z kartą' } : null;
  if (r.rodzaj === 'pnote') {
    if (!r.sciezki.every((s) => wPolach(s, POLA_CHWIL_NOTATKI)) || POLA_CHWIL_NOTATKI.some((k) => es[k] !== undefined)) return null;
    const bezChwil = (e) => { const o = json(e); for (const k of POLA_CHWIL_NOTATKI) delete o[k]; return o; };
    return JSON.stringify(sortuj(bezChwil(es))) === JSON.stringify(sortuj(bezChwil(en))) ? { klasa: D_CHWILE_NOTATKI, wariant: 'pola chwili notatki ucięte przez starszą aplikację' } : null;
  }
  if (r.rodzaj !== 'wersja' && r.rodzaj !== 'kosz') return null;
  if (r.rodzaj === 'kosz' && !z221 && r.sciezki.some((s) => wPolach(s, ['visitIdentity'])) && r.sciezki.some((s) => wPolach(s, D7_POLA)) && r.sciezki.every((s) => wPolach(s, ['visitIdentity', ...D7_POLA]))) {
    const bez = (e) => { const o = json(e); delete o.visitIdentity; return o; };
    const r2 = { ...r, a: bez(r.a), b: bez(r.b), sciezki: r.sciezki.filter((s) => !wPolach(s, ['visitIdentity'])) };
    return klasa(r2, X, Y, kont) === 'D7' ? { klasa: 'D7', wariant: 'D7 przy tożsamości wpisu Kosza nieznanej starszej aplikacji', tabela: kont.tabelaBiezacych } : null;
  }
  const sid = r.rodzaj === 'kosz' ? r.klucz.replace(/#\d+$/, '').split('|')[0] : r.klucz.split('/')[1];
  const gwiazdki = (l) => (l || []).filter((e) => e.snapshotId === sid).map((e) => !!e.pinned);
  const gwRowna = r.rodzaj === 'kosz' && !!kont.kosz && JSON.stringify(gwiazdki(kont.kosz.x)) === JSON.stringify(gwiazdki(kont.kosz.y));
  const pola221 = z221 && r.rodzaj === 'kosz' ? [...POLA_221_KOSZA, ...(gwRowna ? ['gwiazdka'] : [])] : [];
  if (!r.sciezki.every((s) => wPolach(s, [...POLA_TOZSAMOSCI[r.rodzaj], ...pola221, 'payload._pinnedState.h']))) return null;
  const zdejmij = (e) => { const o = json(e); for (const p of [...POLA_TOZSAMOSCI[r.rodzaj].filter((q) => q !== 'payload.visit'), ...pola221]) delete o[p]; return o; };
  const xs = zdejmij(es), xn = zdejmij(en);
  const rowne = () => JSON.stringify(sortuj(xs)) === JSON.stringify(sortuj(xn));
  const pola = r.sciezki.some((s) => wPolach(s, pola221)) ? D_POLE_221 : D_TOZSAMOSC;
  const vs = xs.payload && xs.payload.visit, vn = xn.payload && xn.payload.visit;
  const karta = r.rodzaj === 'kosz' ? en.patientId : r.klucz.split('/')[0];
  if (vn && !vs) {
    // tożsamość wyznaczona przez bieżącą aplikację: kształt tożsamości i karta wizyty = karta rekordu (Bvisit_owner)
    if (typeof vn !== 'object' || typeof vn.visitId !== 'string' || !vn.visitId || vn.patientId !== karta) return null;
    const swiezy = !!(xn.payload._pinnedState && xn.payload._pinnedState.h === LO.odcisk(xn.payload));
    xn.payload = bezTozsamosci(xn.payload);
    if (rowne()) return { klasa: pola, wariant: swiezy ? 'tożsamość wizyty, odcisk przeliczony' : 'tożsamość wizyty' };
    return null;
  }
  if (vn && vs && vn.visitId === vs.visitId && vn.patientId !== vs.patientId) {
    if (vn.patientId !== karta) return null;
    for (const o of [xs, xn]) { delete o.payload.visit.patientId; if (o.payload._pinnedState) delete o.payload._pinnedState.h; }
    return rowne() ? { klasa: pola, wariant: 'karta wizyty po „Scal pacjentów”' } : null;
  }
  return rowne() ? { klasa: pola, wariant: pola === D_POLE_221 ? 'pola Kosza 221' : 'tożsamość wpisu Kosza' } : null;
}

// ── W4 floty i punkt spoczynku ────────────────────────────────────────────────────────────────────────────────────────
// Świeże klony A, B, C; obiegi wymiany PO-A par (A, B), (B, C), (C, A), aż żaden eksport się nie zmienia (≤ 4); licznik
// — pół wymiany w pierwszym obiegu (wymianaPOLicz, źródło 'w4'); echo — wiersze warstwy wyk w obiegu. D par: kontPary
// (para z C — tabela 'flota'), R4n z W4p. Wynik z widokami klonów dla wyroczni (wołający usuwa).
async function w4Floty(S, urz, kontN) {
  return kr_cicho(S, async () => {
    const K = [];
    for (const U of urz) K.push(await klon(S, U, 'w4f'));
    try {
      let obiegi = 0, stabilny = false;
      const echo = [];
      while (!stabilny && obiegi < LO.MAKS_OBIEGOW) {
        obiegi += 1;
        const przed = K.map((k) => JSON.stringify(kanon(k.stan)));
        const w0 = S.odsyl ? S.odsyl.wiersze[`w4:${'wyk'}`] || 0 : 0;
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) await wymianaPOLicz(S, K[i], K[j], obiegi === 1);
        echo.push(S.odsyl ? (S.odsyl.wiersze['w4:wyk'] || 0) - w0 : 0);
        stabilny = K.every((k, i) => JSON.stringify(kanon(k.stan)) === przed[i]);
      }
      const pary = [];
      let ok = stabilny;
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const [a, b] = [kanon(K[i].stan), kanon(K[j].stan)];
        const d = await sklasyfikuj(D(a, b), a, b, kontPary(urz[i], urz[j], kontN), async () => ({ x: await K[i].v.listTrashedSnapshots(), y: await K[j].v.listTrashedSnapshots() }));
        const w4pp = [];
        for (const r of d.filter((q) => q.klasa === 'R4n')) { const [sid, pid] = r.klucz.split('|'); w4pp.push(await w4p(S, K[i], K[j], sid, pid)); }
        if (!d.every((r) => r.dozwolona && r.dozwolona !== 'dowód') || !w4pp.every((x) => x.ok)) ok = false;
        pary.push({ para: urz[i].nazwa + urz[j].nazwa, roznice: d.map((r) => ({ ...skrotRoznicy(r), ...(r.wariantFloty ? { wariant: r.wariantFloty } : {}), ...(r.dozwolona ? {} : { a: r.a, b: r.b }) })), w4p: w4pp });
      }
      const wyr = await wyrWidokiKlonow(Object.fromEntries(urz.map((U, i) => [U.nazwa, K[i]])));
      return { ok, obiegi, stabilny, echo, pary, wyr };
    } finally { await zamknij(...K); }
  });
}
async function punktFloty(S, A, B, C) {
  S.stat.spoczynki += 1;
  const obiegi = S.flota === '221' ? await spoczynekFloty221(S, A, B, C) : await spoczynekWszystkich(S, [A, B, C]);
  if (obiegi === null) { S.stat.brakSpoczynku.push({ krok: S.nrKroku, ostatnie: S.dziennik.slice(-10) }); return; }
  const pkt = { krok: S.nrKroku, obiegi, W1: {} };
  for (const [X, Y] of [[A, B], [B, C], [C, A]]) {
    const d = await w1Klasy(S, X, Y, kontPary(X, Y, { tabela: S.profil, wskrzeszone: S.wskrzeszone }));
    pkt.W1[X.nazwa + Y.nazwa] = d.map((r) => ({ ...skrotRoznicy(r), ...(r.wariantFloty ? { wariant: r.wariantFloty } : {}), ...(r.klasa ? {} : { a: r.a, b: r.b }) }));
  }
  const stare = starszaAplikacja(C) ? [C.nazwa] : [];
  pkt.wyrW1 = wyrOcena(S, 'W1 floty', 'W1 floty', await wyrWidoki(S, { A, B, C }), { stare }).length;
  const w = await w4Floty(S, [A, B, C], { tabela: S.profil === 'pelny' ? 'pelny:W4' : 'W4', wskrzeszone: S.wskrzeszone });
  pkt.wyrW4 = wyrOcena(S, 'W4 floty', 'W4 floty', w.wyr, { stare }).length;
  delete w.wyr;
  pkt.w4 = w;
  S.stat.punktyFloty.push(pkt);
  if (!w.ok) S.stat.w4Bledy.push({ krok: S.nrKroku, obiegi: w.obiegi, stabilny: w.stabilny, pary: w.pary.map((p) => ({ para: p.para, roznice: p.roznice.filter((r) => !r.dozwolona || r.dozwolona === 'dowód') })).filter((p) => p.roznice.length) });
}
// Strażnik chwil (pomiar): chwile wersji i wpisów Kosza spoza chwil operacji (S.chwile).
function chwileSpoza(S, stany) {
  const ok = new Set([...S.chwile].map((t) => new Date(t).toISOString()));
  const out = { sprawdzonych: 0, spoza: [] };
  const sprawdz = (n, opis, t) => { if (typeof t !== 'string') return; out.sprawdzonych += 1; if (!ok.has(t) && out.spoza.length < 20) out.spoza.push(`${n} ${opis} ${t}`); else if (!ok.has(t)) out.spoza.push(null); };
  for (const [n, lad] of Object.entries(stany)) {
    for (const p of lad.patients || []) for (const s of p.snapshots || []) {
      const pl = s.payload || {};
      sprawdz(n, `wersja ${String(s.snapshotId).slice(0, 4)} updatedAtISO`, s.updatedAtISO);
      sprawdz(n, `wersja ${String(s.snapshotId).slice(0, 4)} _contentAtISO`, pl._contentAtISO);
      sprawdz(n, `wersja ${String(s.snapshotId).slice(0, 4)} _pinnedState.at`, pl._pinnedState && pl._pinnedState.at);
    }
    for (const e of lad.snapshotTombstones || []) {
      const pl = e.payload && typeof e.payload === 'object' ? e.payload : {};
      sprawdz(n, `Kosz ${String(e.snapshotId).slice(0, 4)} updatedAtISO`, e.updatedAtISO);
      sprawdz(n, `Kosz ${String(e.snapshotId).slice(0, 4)} _contentAtISO`, pl._contentAtISO);
      sprawdz(n, `Kosz ${String(e.snapshotId).slice(0, 4)} _pinnedState.at`, pl._pinnedState && pl._pinnedState.at);
    }
  }
  out.liczba = out.spoza.length; out.spoza = out.spoza.filter(Boolean);
  return out;
}
// Ślad (E2_AB_SLAD): po każdym wierszu dziennika stan wersji i wpisu Kosza o podanym prefiksie na A, B, C (gdy się zmienił).
function opisSladu(U, pre) {
  const t = (s) => (s ? String(s).slice(11, 23) : '-');
  const gw = (pl) => (pl._pinnedState ? `${pl._pinnedState.pin ? 1 : 0}@${t(pl._pinnedState.at)} h=${String(pl._pinnedState.h).slice(0, 6)}` : '-');
  const out = [];
  for (const p of U.stan.patients || []) for (const s of p.snapshots || []) if (String(s.snapshotId).startsWith(pre)) {
    const pl = s.payload || {};
    out.push(`karta ${String(p.patientId).slice(0, 4)} w=${pl.user && pl.user.weight} rev=${s.rev} upd=${t(s.updatedAtISO)} _p=${pl._pinned ? 1 : 0} ps=${gw(pl)} cat=${t(pl._contentAtISO)} v=${pl.visit ? String(pl.visit.visitId).slice(0, 4) + '/' + String(pl.visit.patientId).slice(0, 4) : '-'}`);
  }
  for (const e of U.stan.snapshotTombstones || []) if (String(e.snapshotId).startsWith(pre)) {
    const pl = e.payload && typeof e.payload === 'object' ? e.payload : {};
    out.push(`KOSZ ${String(e.patientId).slice(0, 4)} w=${pl.user && pl.user.weight} rev=${e.rev} del=${t(e.deletedAtISO)} upd=${t(e.updatedAtISO)} gw=${e.gwiazdka === undefined ? '?' : e.gwiazdka ? 1 : 0} _p=${pl._pinned ? 1 : 0} ps=${gw(pl)} k=${t(e.koszISO)} vi=${e.visitIdentity ? 1 : 0} ${e.powod || ''}`);
  }
  for (const n of U.stan.patientNotes || []) if (String(n.id).startsWith(pre)) out.push(`notatka ${String(n.patientId).slice(0, 4)} rev=${n.rev} upd=${t(n.updatedAtISO)}`);
  for (const n of U.stan.patientNoteTombstones || []) if (String(n.id).startsWith(pre)) out.push(`NAGROBEK notatki rev=${n.rev} del=${t(n.deletedAtISO)}${n.deletedWithPatient ? ' zKarta' : ''}`);
  return out.join(' | ') || '(brak)';
}
function podepnijSlad(S, urz) {
  if (!SLAD_FLOTY.length) return;
  const ost = new Map();
  const push0 = S.dziennik.push;
  S.dziennik.push = function (...a) {
    const r = push0.apply(this, a);
    for (const pre of SLAD_FLOTY) for (const U of urz) {
      if (!U.stan) continue;
      const o = opisSladu(U, pre), k = U.nazwa + pre;
      if (ost.get(k) !== o) { ost.set(k, o); push0.call(this, `      ~ ${pre} ${U.nazwa}: ${o}`); }
    }
    return r;
  };
}

// ── Przebieg floty ────────────────────────────────────────────────────────────────────────────────────────────────────
const WYNIKI_FLOTY = { 221: [], 276: [], N: [] };
const ODSYL_FLOTY = { 221: [], 276: [], N: [] };
async function przebiegFloty(flota, ziarno, { profil = FLOTA_PROFIL, blobC = BLOB_C, pDostawy = 0.3, pBlob = 0.08, pSpoczynku = 1 / 25 } = {}) {
  const t0 = performance.now();
  const app = flota === '221' ? 'S221' : flota === '276' ? 'S276' : 'N';
  const przes = SWIAT_FLOTA ?? (flota === '221' ? 200000 : 400000);
  const S = swiat(ziarno + przes + (profil === 'pelny' ? 100000 : 0));
  S.profil = profil; S.w2s = false; S.tylkoPOA = true;
  S.flota = flota; S.blobC = flota === '221' ? blobC : 'los';
  Object.assign(S.stat, { punktyFloty: [], obiegiPonadLimit: [] });
  S.wyrSwiat = `flota${flota}`;
  S.wyrEtyk = (id) => (S.indeks && S.indeks.has(id) ? 'K' + S.indeks.get(id) : String(id).slice(0, 4));
  S.los = rng(S.ziarno); S.indeks = new Map(); S.nrKarty = 0; S.nrKroku = 0;
  S.chwile = new Set();
  const losMath = rng(S.ziarno ^ 0x5bd1e995);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || losMath)());
  if (ODSYL) S.odsyl = nowyLicznik();
  const A = await urzadzenie(S, 'A');
  krok(); await mutacja(S, A, 'nowa karta 1', async () => { const r = await A.d.zapiszKarte(1); S.indeks.set(r.patientId, 1); return r; });
  S.nrKarty = 1;
  A.Q.length = 0;
  if (S.odsyl) S.odsyl.os.length = 0;
  const B = await urzadzenie(S, 'B', A);
  let C;
  if (app === 'S221') {
    const przel = kryptoZDeltami(S.ziarno * 7919 + S.nrUrz + 1, S.ziarno * 7919 + 0xD221);
    C = await urzadzenie(S, 'C', A, { app, retencja: RET_C, dodatki: { crypto: przel.obj } });
    if (Z_DELTAMI_221) podepnijDelty(S, C, przel.p);
  } else C = await urzadzenie(S, 'C', A, app === 'N' ? {} : { app, retencja: RET_C });
  const start = { CrownyA: JSON.stringify(kanon(C.stan)) === JSON.stringify(kanon(A.stan)), dziennikC: app === 'S221' ? typeof C.ev === 'undefined' : typeof (C.ev && C.ev.applyEncryptedEvent) === 'function' };
  S.losD = rng((S.ziarno ^ 0x0D2210) >>> 0);
  S.losB = rng((S.ziarno ^ 0x0B10B5) >>> 0);
  podepnijSlad(S, [A, B, C]);
  S.flotaUrz = [A, B, C]; S.echoKlony = ECHO_KLONY && !!S.odsyl; // echo na klonach (ręcznie; blok scenariuszy floty niżej)
  // Strażnik pól zawsze obecnych we flocie: nagrobek retencji bez treści, który urządzenie starszej aplikacji ma bez
  // visitIdentity (wersja zapisana i przycięta retencją v1 na nim — bieżąca aplikacja nie ma z czego wyznaczyć tożsamości
  // i przechowuje wpis bez zmian), nie jest zapisem bieżącej wersji — poza strażnikiem, liczony osobno (druk).
  if (starszaAplikacja(C)) {
    S.stat.polaRetencjiStarszej = 0;
    S.bezRetencjiStarszej = (lad) => {
      const zC = (e) => e && e.powod === 'retencja' && !e.payload && !e.visitIdentity;
      const ret = new Set((C.stan.snapshotTombstones || []).filter(zC).map((e) => e.snapshotId));
      const wpisy = lad.snapshotTombstones || [];
      const zostaja = wpisy.filter((e) => !(zC(e) && ret.has(e.snapshotId)));
      if (zostaja.length === wpisy.length) return lad;
      S.stat.polaRetencjiStarszej += wpisy.length - zostaja.length;
      return { ...lad, snapshotTombstones: zostaja };
    };
  }
  const profilC = app === 'S221' ? `flota221:${profil}` : profil;
  const ile = KROKI || 60 + Math.floor(S.los() * 61);
  let mutacji = 0, mutacjiC = 0;
  while (mutacji < ile) {
    S.nrKroku += 1;
    krok(1000 + Math.floor(S.los() * 119e3));
    if (app === 'S221') {
      await losoweDelty(S, C, [A, B]);
      if (S.blobC === 'publikuje') await pobierzStanC(S, C, [A, B], false);
    }
    const r = S.los();
    if (r < pDostawy) {
      if (app === 'S221') {
        if (S.los() < 0.6) await losowaDostawa(S, A, B);
        else {
          const X = S.los() < 0.5 ? A : B;
          const n = X.Q.length - kursor(S, X, C);
          if (n) await dostawaDoStarszej(S, X, C, { k: S.los() < 0.5 ? n : 1 + Math.floor(S.los() * n) });
        }
      } else await losowaDostawaFloty(S, [A, B, C]);
      continue;
    }
    if (r < pDostawy + pBlob) {
      const [Z, Y] = wybierz(S.los, [[C, A], [C, B], [A, C], [B, C], [A, B], [B, A]]);
      await scalBlob(S, Z, Y);
      continue;
    }
    const u = S.los();
    const X = u < 1 / 3 ? A : u < 2 / 3 ? B : C;
    if (await losowaMutacja(S, X, X === C ? profilC : profil)) {
      mutacji += 1;
      if (X === C) mutacjiC += 1;
      if (S.los() < pSpoczynku) await punktFloty(S, A, B, C);
    }
  }
  S.nrKroku += 1;
  await punktFloty(S, A, B, C);
  const naruszenia = S.wyrNaruszenia || [];
  const wgSwiata = (s) => naruszenia.filter((x) => x.swiat === s);
  const wynik = {
    flota, ziarno, swiat: S.ziarno, profil, blobC: S.blobC, progD221: PROG_DELT_FLOTY, delty221: !!C.delty, retencjaC: C.retencja, app,
    mutacji, mutacjiC, ms: Math.round(performance.now() - t0), start,
    zdarzen: S.stat.zdarzen, dostaw: S.stat.dostaw, dostawDoStarszej: S.stat.dostawDoStarszej || 0, blobow: S.stat.blobow || 0, pobranStanuC: S.stat.pobranStanuC || 0, h1: S.stat.h1, h2: S.stat.h2, hakiScalenia: S.stat.hakiScalenia || 0,
    emitery: S.stat.emitery, haki: S.stat.haki, odmowy: S.stat.odmowyStarszejKody || {}, polaRetencjiStarszej: S.stat.polaRetencjiStarszej || 0, delty: S.stat.delty ? { ...S.stat.delty, ms: Math.round(S.stat.delty.ms), kolejka: C.delty.Q.length } : null,
    spoczynki: S.stat.spoczynki, brakSpoczynku: S.stat.brakSpoczynku, obiegiPonadLimit: S.stat.obiegiPonadLimit, w4Bledy: S.stat.w4Bledy,
    punkty: S.stat.punktyFloty.map((p) => ({ krok: p.krok, obiegi: p.obiegi, obiegiW4: p.w4.obiegi, echo: p.w4.echo, ok: p.w4.ok, wyrW1: p.wyrW1, wyrW4: p.wyrW4, W1: p.W1, W4: p.w4.pary })),
    chwile: chwileSpoza(S, { A: A.stan, B: B.stan, C: C.stan }),
    odcisk: odciskFloty([A.stan, B.stan], starszaAplikacja(C) ? C.stan : null),
    wyr: { punkty: S.wyrPunkty || 0, naruszen: naruszenia.length, liczby: licznikWyr(naruszenia), czerwoneW1: wyrCzerwone(wgSwiata('W1 floty')), czerwoneW4: wyrCzerwone(wgSwiata('W4 floty')),
      lista: naruszenia.filter((x) => WYR.bezWyjatku([x], x.swiat).length).map((x) => ({ swiat: x.swiat, krok: x.krok, urz: x.urz, encja: x.encja, id: x.id, et: x.et, rodzaj: x.rodzaj, klasa: x.klasa || null, oczek: x.oczek, fakt: x.fakt, gdzieIndziej: x.gdzieIndziej, hist: x.hist })) },
  };
  const odsyl = S.odsyl ? { flota, ziarno, ...S.odsyl.podsumuj(), powtorka: S.odsylPowtorka || { partii: 0, zdarzen: 0 }, odcisk: wynik.odcisk } : null;
  WYNIKI_FLOTY[flota].push(wynik);
  if (odsyl) ODSYL_FLOTY[flota].push(odsyl);
  if (process.env.E2_AB_WYNIKI) appendFileSync(process.env.E2_AB_WYNIKI, JSON.stringify({ typ: `flota${flota}`, ...wynik, ...(odsyl ? { odsyl } : {}), dziennik: S.dziennik }) + '\n');
  if (WYR_PLIK) appendFileSync(WYR_PLIK, JSON.stringify({ typ: 'ziarno', swiat: S.wyrSwiat, ziarno, mutacji, spoczynki: S.stat.spoczynki, ...wynik.wyr }) + '\n');
  return { wynik, odsyl };
}
// Odcisk testu wobec _pinnedState.h wersji bieżących urządzeń floty: wersja z h innym niż odcisk treści jest dozwolona
// tylko wtedy, gdy urządzenie starszej aplikacji ma tę wersję z tą samą treścią (bez tożsamości wizyty) i tym samym h —
// sejf 221 kopiuje treść razem z nieaktualnym h ostatniego zapisu bieżącej aplikacji, a bieżąca aplikacja właśnie po
// różnicy odcisku rozpoznaje zmianę treści przez starszą aplikację (Bgw_stan, vilda_vault.js:1567–1569).
function odciskFloty(biezace, starsza) {
  const wStarszej = new Map();
  if (starsza) for (const p of starsza.patients || []) for (const s of p.snapshots || []) wStarszej.set(s.snapshotId, s.payload);
  const bezWizyty = (t) => { const o = json(t); delete o.visit; return JSON.stringify(sortuj(o)); };
  const o = { wersji: 0, zgodnych: 0, zeStarszej: 0, niezgodne: [] };
  for (const lad of biezace) for (const p of lad.patients || []) for (const s of p.snapshots || []) {
    const h = s.payload && s.payload._pinnedState ? s.payload._pinnedState.h : undefined;
    if (typeof h !== 'string') continue;
    o.wersji += 1;
    if (LO.odcisk(s.payload) === h) { o.zgodnych += 1; continue; }
    const t = wStarszej.get(s.snapshotId);
    if (t && t._pinnedState && t._pinnedState.h === h && bezWizyty(t) === bezWizyty(s.payload)) { o.zeStarszej += 1; continue; }
    o.niezgodne.push(`${String(p.patientId).slice(0, 8)}/${String(s.snapshotId).slice(0, 8)}`);
  }
  return o;
}

// ── Literały floty (ziarna CI, przebieg domyślny — FLOTA_DOMYSLNA) ───────────────────────────────────────────────────
// [flota][ziarno] = { obiegiW4 (obiegi wymiany W4 floty w kolejnych punktach), W4 (różnice par W4 floty: para|rodzaj|klasa|
// wariant → liczba, suma po punktach), W1AB (różnice A, B po samych zdarzeniach według klasy — linia bazowa echa po
// scaleniu pełnej kopii), odsyl (licznik: klucz źródło|rodzaj|w ładunku/spoza|klasa → { wyk, nowe }), delty (flota 221:
// zbudowane według rodzaju, odpadłe progiem, puste), odmowy (sejf 221 według kodu) }. Klucze bez ścieżek pól i bez bajtów.
// Znaczenie: W4 — różnice, które zostają między urządzeniem starszej aplikacji a bieżącym po pełnej wymianie, każda
// z klasą pary floty (dozwolona tylko w parze z C; ta sama różnica w parze A, B — czerwień); W1AB — różnice A, B
// w punkcie spoczynku przed pełną wymianą („bez klasy” — różnica bez klasy pary, np. zmiana C, która doszła pełną kopią
// tylko do jednego z nich, bo bieżąca aplikacja nie odsyła scalonego; W1 floty 221 nie jest warunkiem zieleni, literał
// pilnuje liczby); odsyl — echo, które bieżące urządzenia musiałyby odesłać (jak ZNANE_ODSYL, także ze źródeł blob221,
// blob276 i delta221); delty — ile delt zbudowała integracja 221 i ile odpadło progiem PROG_DELT_221. Zmiana zbieżności
// (E3-PR0c–f) albo wyroczni przepisuje te literały.
const ZNANE_FLOTA = {
  221: {
    1: { W1AB: { 'bez klasy': 13, 'rekord złożony po jednej stronie': 2 }, W4: { 'BC|kosz|pole nieznane starszej aplikacji (221)|pola Kosza 221': 2, 'BC|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 4, 'BC|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 12, 'CA|kosz|pole nieznane starszej aplikacji (221)|pola Kosza 221': 2, 'CA|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 4, 'CA|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 12 }, delty: { prog: { karta: 15 }, puste: { 'pnote:merge': 1, 'pnote:merge-delete': 4 }, zbudowane: { karta: 10, note: 2, notetomb: 1, pnote: 4, 'pnote:merge': 4, pnotetomb: 2 } }, odmowy: {}, odsyl: { 'blob221|snap|w ładunku|inne': { nowe: 1, wyk: 1 }, 'blob221|stomb|w ładunku|inne': { nowe: 1, wyk: 1 }, 'blobN|stomb|w ładunku|R4a′': { nowe: 1, wyk: 1 } }, obiegiW4: [1, 2, 2, 2] },
    2: { W1AB: { R2: 1, R5: 1, 'bez klasy': 4 }, W4: { 'BC|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 1, 'BC|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 2, 'BC|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 12, 'CA|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 1, 'CA|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 2, 'CA|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 12 }, delty: { prog: { karta: 12 }, puste: { 'pnote:merge-delete': 2 }, zbudowane: { karta: 11, note: 2, pnote: 1, 'pnote:merge': 6, pnotetomb: 1, ptomb: 3 } }, odmowy: {}, odsyl: { 'blob221|snap|w ładunku|rekord złożony': { nowe: 1, wyk: 1 }, 'delta221|snap|w ładunku|inne': { nowe: 1, wyk: 1 }, 'zdarzenie|snap|w ładunku|gwiazdka': { nowe: 1, wyk: 1 } }, obiegiW4: [2, 2] },
    3: { W1AB: { R4a: 2, R5: 1, 'bez klasy': 14 }, W4: { 'BC|kosz|pole nieznane starszej aplikacji (221)|pola Kosza 221': 4, 'BC|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 5, 'BC|pnotetomb|pole nieznane starszej aplikacji (221)|nagrobek notatki usuniętej z kartą': 4, 'BC|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 12, 'CA|kosz|pole nieznane starszej aplikacji (221)|pola Kosza 221': 4, 'CA|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 5, 'CA|pnotetomb|pole nieznane starszej aplikacji (221)|nagrobek notatki usuniętej z kartą': 4, 'CA|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty': 12 }, delty: { prog: { karta: 14 }, puste: { 'pnote:merge-delete': 4 }, zbudowane: { karta: 13, note: 2, pnote: 3, 'pnote:merge': 8, pnotetomb: 1 } }, odmowy: {}, odsyl: { 'blob221|stomb|w ładunku|inne': { nowe: 3, wyk: 3 }, 'delta221|snap|w ładunku|rekord złożony': { nowe: 4, wyk: 4 }, 'zdarzenie|snap|w ładunku|gwiazdka': { nowe: 1, wyk: 1 } }, obiegiW4: [2, 2] },
  },
  276: {
    2: { W1AB: {}, W4: { 'BC|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 3, 'BC|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty, odcisk przeliczony': 6, 'CA|kosz|tożsamość wizyty nieznana starszej aplikacji|tożsamość wpisu Kosza': 3, 'CA|wersja|tożsamość wizyty nieznana starszej aplikacji|tożsamość wizyty, odcisk przeliczony': 6 }, odmowy: {}, odsyl: { 'zdarzenie|snap|w ładunku|gwiazdka': { nowe: 1, wyk: 1 } }, obiegiW4: [1, 1, 1] },
  },
};
// Wyrocznia floty (ziarna CI): naruszenia według „klasa | świat” — flota 221 tylko W4 floty (W1 floty — druk), flota 276
// W1 floty i W4 floty. Liczby to naruszenia Z KLASĄ floty — skutki samej starszej wersji (WYR.OGRANICZENIE_STARSZEJ:
// znane ograniczenie starszej wersji, naprawa — aktualizacja urządzeń, decyzja właściciela z 2026-11-16); naruszenie
// bez klasy to czerwień zieleni floty, nie wpis tego literału. Ziarno bez wpisu — bez naruszeń.
const ZNANE_WYR_FLOTY = {
  221: {
    3: { 'gwiazdka ze starszej aplikacji | W4 floty': 6, 'notatka bez ratunku D-21 (starsza aplikacja) | W4 floty': 12 },
  },
  276: {},
};
const kluczParyFloty = (p, r) => `${p}|${r.rodzaj}|${r.klasa || 'bez klasy'}${r.wariant ? '|' + r.wariant : ''}`;
function literalFloty(w, o) {
  const W4 = {}, W1AB = {};
  for (const pt of w.punkty) {
    for (const pr of pt.W4) for (const r of pr.roznice) dodajDo(W4, { [kluczParyFloty(pr.para, r)]: 1 });
    for (const r of pt.W1.AB || []) dodajDo(W1AB, { [r.klasa || 'bez klasy']: 1 });
  }
  const odsyl = o ? literalOdsyl([o]) : {};
  return sortuj({
    obiegiW4: w.punkty.map((p) => p.obiegiW4), W4, W1AB, odsyl,
    ...(w.delty ? { delty: { zbudowane: w.delty.zbudowane, prog: w.delty.prog, puste: w.delty.puste } } : {}),
    odmowy: w.odmowy,
  });
}
const wyrFloty = (w) => Object.fromEntries(Object.entries(w.wyr.liczby).filter(([k]) => w.flota !== '221' || k.endsWith('| W4 floty')).sort());
// Zieleń przebiegu floty (lista pusta albo zero — zieleń).
function zielenFloty(w, o) {
  return {
    'W4 floty: punkt stały w ≤ 4 obiegach i każda różnica par z klasą dozwoloną': w.w4Bledy.map((b) => `#${b.krok} ${b.pary.map((p) => `${p.para}: ${p.roznice.map((r) => `${r.rodzaj} ${r.klasa || 'bez klasy'} [${r.sciezki.slice(0, 3).join(',')}]`).join('; ')}`).join(' | ')}`),
    'wyrocznia W4 floty: naruszenia bez klasy z tabeli wyjątków': w.wyr.czerwoneW4,
    'wyrocznia W1 floty: naruszenia bez klasy (flota 276)': w.flota === '221' ? [] : w.wyr.czerwoneW1,
    'brak punktu spoczynku albo obiegi spoczynku ponad limit': [...w.brakSpoczynku.map((b) => b.krok), ...w.obiegiPonadLimit],
    'odcisk testu ≠ h wersji bieżących urządzeń (poza treścią skopiowaną ze starszej aplikacji)': w.odcisk.niezgodne,
    'chwile wersji i wpisów Kosza spoza chwil operacji (strażnik chwil)': w.chwile.spoza,
    'licznik: pola zawsze obecne — encje od bieżącej wersji bez pola': o ? o.polaZawsze.bezPola : 0,
    'licznik: budżet minuty slotu przekroczony': o ? o.budzet.przekroczone.map((x) => `t ${x.t}: ${x.wierszy} wierszy, ${x.realneDo} B`) : [],
    'licznik: powtórka partii — partii / wierszy surowych': o ? [o.powtorka.partii, o.wiersze['powtórka:surowe'] || 0] : [1, 0],
    'licznik: wyjątki builderów nośników': o ? o.bladBuildera : 0,
  };
}
const ZIELEN_FLOTY = {
  'W4 floty: punkt stały w ≤ 4 obiegach i każda różnica par z klasą dozwoloną': [],
  'wyrocznia W4 floty: naruszenia bez klasy z tabeli wyjątków': [],
  'wyrocznia W1 floty: naruszenia bez klasy (flota 276)': [],
  'brak punktu spoczynku albo obiegi spoczynku ponad limit': [],
  'odcisk testu ≠ h wersji bieżących urządzeń (poza treścią skopiowaną ze starszej aplikacji)': [],
  'chwile wersji i wpisów Kosza spoza chwil operacji (strażnik chwil)': [],
  'licznik: pola zawsze obecne — encje od bieżącej wersji bez pola': 0,
  'licznik: budżet minuty slotu przekroczony': [],
  'licznik: powtórka partii — partii / wierszy surowych': [1, 0],
  'licznik: wyjątki builderów nośników': 0,
};
const OPIS_FLOTY = {
  221: 'A, B — bieżąca, C — sejf 221 z retencją v1 i deltami',
  276: 'A, B — bieżąca, C — sejf 276 z retencją v1 (zdarzenia między wszystkimi parami)',
  N: 'kontrola: A, B, C — bieżąca (transport floty 276)',
};
for (const flota of ['221', '276', 'N']) {
  describe.skipIf(!FLOTY.includes(flota))(`A ≡ B, flota ze starszą aplikacją: ${OPIS_FLOTY[flota]}`, () => {
    d1();
    for (const z of ZIARNA_FLOTA[flota]) {
      const swiatZ = z + (SWIAT_FLOTA ?? (flota === '221' ? 200000 : 400000)) + (FLOTA_PROFIL === 'pelny' ? 100000 : 0);
      it(`ziarno ${z} (świat ${swiatZ}, profil ${FLOTA_PROFIL}): W4 floty stabilne, różnice par z C z klasą; wyrocznia bez naruszeń bez klasy; echo pół wymiany w literale; pola zawsze obecne, budżet slotu, powtórka partii; odcisk; strażnik chwil${zLiteralemFloty(flota, z) ? '; literały floty' : ''}`, async () => {
        const { wynik: w, odsyl: o } = await przebiegFloty(flota, z);
        const { punkty: _p, ...reszta } = w;
        console.log(`E3-AB flota ${flota} ziarno ${z} literały`, JSON.stringify({ literal: literalFloty(w, o), wyrocznia: wyrFloty(w) }));
        console.log(`E3-AB flota ${flota} ziarno ${z}`, JSON.stringify({ ...reszta, wyr: { ...reszta.wyr, lista: undefined }, odsyl: o ? { scalen: o.scalen, wiersze: o.wiersze, literal: o.literal, budzet: { slotow: o.budzet.slotow, maks: o.budzet.maksRealne }, ms: o.ms } : null }));
        expect(w.mutacji, 'mutacji').toBeGreaterThan(0);
        expect(w.start, 'C na starcie: eksport równy A; dziennik zdarzeń tylko poza 221').toEqual({ CrownyA: true, dziennikC: true });
        expect.soft(zielenFloty(w, o), `flota ${flota}, ziarno ${z}\n${JSON.stringify(w.wyr.lista.slice(0, 6), null, 1)}`).toEqual(ZIELEN_FLOTY);
        if (zLiteralemFloty(flota, z)) {
          expect.soft(literalFloty(w, o), `ZNANE_FLOTA[${flota}][${z}]`).toEqual(ZNANE_FLOTA[flota][z]);
          expect.soft(wyrFloty(w), `ZNANE_WYR_FLOTY[${flota}][${z}]`).toEqual(ZNANE_WYR_FLOTY[flota][z] || {});
        }
      }, 120_000);
    }
    it('podsumowanie (druk do opisu PR i ALGORITHMS): ziarna, punkty, obiegi wymiany W4, klasy par i wyroczni, licznik, delty, czas', () => {
      const lista = WYNIKI_FLOTY[flota];
      const s = { ziaren: lista.length, mutacji: 0, ms: 0, punktow: 0, wyr: {}, W4: {}, delty: {}, prog: {}, blobow: 0, pobranStanuC: 0, odcisk: { wersji: 0, zeStarszej: 0 }, chwil: 0, polaRetencjiStarszej: 0 };
      for (const w of lista) {
        s.mutacji += w.mutacji; s.ms += w.ms; s.punktow += w.punkty.length; s.blobow += w.blobow; s.pobranStanuC += w.pobranStanuC;
        dodajDo(s.wyr, w.wyr.liczby);
        for (const pt of w.punkty) for (const pr of pt.W4) for (const r of pr.roznice) dodajDo(s.W4, { [kluczParyFloty(pr.para, r)]: 1 });
        if (w.delty) { dodajDo(s.delty, w.delty.zbudowane); dodajDo(s.prog, w.delty.prog); }
        s.odcisk.wersji += w.odcisk.wersji; s.odcisk.zeStarszej += w.odcisk.zeStarszej; s.chwil += w.chwile.sprawdzonych; s.polaRetencjiStarszej += w.polaRetencjiStarszej;
      }
      console.log(`E3-AB flota ${flota} podsumowanie`, JSON.stringify({ ...s, odsyl: sumaOdsyl(ODSYL_FLOTY[flota]) }));
      expect(lista.map((w) => w.ziarno), `ziarna floty ${flota} (przypadki wyżej w tym przebiegu)`).toEqual(ZIARNA_FLOTA[flota]);
    }, 10_000);
  });
}

// Strażniki transportu floty: haki scalania na urządzeniu 276 (AB7 w dostawie do i z 276) i setId haka H1 z pełnej kopii.
describe.skipIf(!FLOTY.length)('A ≡ B, flota ze starszą aplikacją: strażniki transportu (haki 276, setId H1 po pełnej kopii)', () => {
  d1();
  it('276 odbiera nagrobek karty starszy niż swoja zmiana: hak H1 z emiterów 276 = model (AB7), pfull w Q_C, A odzyskuje kartę; bieżące odbiera nagrobek z 276 tak samo', async () => {
    const S = swiat(961);
    S.w2s = false;
    const A = await urzadzenie(S, 'A');
    krok(); const pid = (await mutacja(S, A, 'nowa karta 1', () => A.d.zapiszKarte(1))).wynik.patientId;
    A.Q.length = 0;
    const C = await urzadzenie(S, 'C', A, { app: 'S276' });
    const B = await urzadzenie(S, 'B', A);
    krok(60e3); await mutacja(S, A, 'usuń pacjenta 1', () => A.v.removePatient(pid));
    krok(60e3); await mutacja(S, C, 'nowa wersja 1 na 276', () => C.d.zapiszKarte(1, { wzrost: 125, zapis: { patientId: pid, forceNewSnapshot: true } }));
    const haki0 = S.stat.haki.porownan;
    const { dodane } = await dostawa(S, A, C, { w2s: false });
    expect({ porownan: S.stat.haki.porownan - haki0, hakiC: dodane.map((k) => k.event.kind), kartaC: karty(C).includes(pid) }).toEqual({ porownan: 1, hakiC: ['pfull'], kartaC: true });
    await dostawa(S, C, A, { w2s: false });
    expect(karty(A).includes(pid), 'A odzyskuje kartę z pełnej karty 276').toBe(true);
    krok(60e3); await mutacja(S, C, 'usuń pacjenta 1 na 276', () => C.v.removePatient(pid));
    krok(60e3); await mutacja(S, B, 'nowa wersja 1 na B', () => B.d.zapiszKarte(1, { wzrost: 126, zapis: { patientId: pid, forceNewSnapshot: true } }));
    const { dodane: zB } = await dostawa(S, C, B, { w2s: false });
    expect(zB.map((k) => k.event.kind).filter((k) => k === 'pfull'), 'B: hak H1 po nagrobku z 276').toEqual(['pfull']);
  }, 30_000);
  it('pełna kopia z przegranym nagrobkiem karty: setId haka H1 trafia do Y.setIds, a następne zdarzenie ptomb tej karty nie daje haka ani niezgodności z modelem (AB7)', async () => {
    const S = swiat(962);
    S.w2s = false;
    const A = await urzadzenie(S, 'A');
    krok(); const pid = (await mutacja(S, A, 'nowa karta 1', () => A.d.zapiszKarte(1))).wynik.patientId;
    A.Q.length = 0;
    const B = await urzadzenie(S, 'B', A);
    krok(60e3); await mutacja(S, A, 'usuń pacjenta 1', () => A.v.removePatient(pid));
    const nagrobek = (A.stan.tombstones || []).find((t) => t.patientId === pid);
    krok(60e3); await mutacja(S, B, 'nowa wersja 1 na B', () => B.d.zapiszKarte(1, { wzrost: 125, zapis: { patientId: pid, forceNewSnapshot: true } }));
    const qB = B.Q.length;
    await scalBlob(S, A, B);
    expect({ setId: B.setIds.has(`${pid}:${nagrobek.deletedAtISO}`), hakiB: B.Q.slice(qB).map((e) => e.kind).includes('pfull') }, 'H1 z pełnej kopii').toEqual({ setId: true, hakiB: true });
    const q2 = B.Q.length, haki0 = S.stat.haki.porownan;
    await dostawa(S, A, B, { w2s: false });
    expect({ porownan: S.stat.haki.porownan - haki0, noweB: B.Q.slice(q2).map((e) => e.kind) }, 'ptomb po pełnej kopii — bez drugiego haka').toEqual({ porownan: 1, noweB: [] });
  }, 30_000);
});

// ── Echo na klonach (scenariusze deterministyczne floty z polem echo; E2_AB_ECHO_KLONY=wszystkie — losowe floty) ─────
// Koperty echa jednego scalenia na Y (warstwa wyk i naiwna po2a; liczEcho) stosowane na świeżych klonach pozostałych
// urządzeń floty (S.flotaUrz), w cichoLicznik (klony, szyfrowanie i identyfikatory poza programem świata). Drugi rząd
// i dalsze obiegi liczone tylko na kluczach encji tych kopert (LO.kluczeKopert):
// - bieżące urządzenie U: każda koperta osobno przez applyEncryptedEvent na klonie U′, echo U′ → klony.drugiRzad (wyk)
//   i klony.drugiRzad2a (po2a); przykłady (druk): do 8 z warstwy po2a, wyk — do 16;
// - urządzenie starszej aplikacji U: koperty na klonie U′ (221 — applyEncryptedDelta, jak /changes bez dziennika; 276 —
//   applyEncryptedEvent; przezStarsza.zapisow — ile razy eksport U′ się przy tym zmienił), potem pełna kopia U′ do
//   świeżych klonów bieżących urządzeń: wiersze wyk → przezStarsza.doNadawcy (klon Y) albo przezStarsza.doInnych,
//   wiersze po2a → przezStarsza.po2a; obiegi (tylko wyk): echo Y′ po pełnej kopii U′ wraca do U′ i dalej, wiersze
//   obiegu i → obiegi[i − 1], dłużej niż LO.MAKS_OBIEGOW → ponadObiegi.
const ECHO_KLONY = process.env.E2_AB_ECHO_KLONY === 'wszystkie';
async function kopertaNaKlonie(U2, E, k) {
  const { env } = await E.ev.encryptEvent(k);
  if (U2.app === 'S221') return U2.v.applyEncryptedDelta(env);
  return U2.ev.applyEncryptedEvent(env);
}
async function echoNaKlonach(S, Y, koperty, koperty2a) {
  const t0 = performance.now();
  const K = S.odsyl.klony;
  K.prob += 1;
  const opis = (lista) => lista.map((r) => `${r.kind}${r.wLadunku ? '' : '(spoza)'} ${r.klasa} [${r.sc.join(',')}]`).join('; ');
  await cichoLicznik(S, async () => {
    for (const U of S.flotaUrz.filter((V) => V !== Y)) {
      K.urzadzen += 1;
      if (!starszaAplikacja(U)) {
        for (const [warstwa, lista0] of [[WYK, koperty], ['po2a', koperty2a]]) {
          if (!lista0.length) continue;
          const U2 = await klonBiezacy(S, U, 'ek');
          try {
            for (const k of lista0) {
              const przed = await eksport(U2);
              await kopertaNaKlonie(U2, U2, k);
              const lista = LO.wierszeEcha(S.odsyl.echo(przed, await eksport(U2), k, { klucze: LO.kluczeKopert([k]) }).filter((r) => r[warstwa]));
              K[warstwa === 'po2a' ? 'drugiRzad2a' : 'drugiRzad'] += lista.length;
              if (lista.length && K.przyklady.length < (warstwa === 'po2a' ? 8 : 16)) K.przyklady.push(`[${warstwa}] ${urzOs(Y)}→${urzOs(U)}′ ${k.event.kind}: ${opis(lista)}`);
            }
          } finally { await zamknij(U2); }
        }
        continue;
      }
      const z221 = U.app === 'S221';
      for (const [warstwa, lista0] of [[WYK, koperty], ['po2a', koperty2a]]) {
        if (!lista0.length) continue;
        K.przezStarsza.prob += 1;
        const U2 = await klon(S, U, 'ek'), E = await klonBiezacy(S, Y, 'ek');
        try {
          const u0 = JSON.stringify(kanon(await eksport(U2)));
          for (const k of lista0) await kopertaNaKlonie(U2, E, k);
          const blob = json(await U2.v.exportSyncPayload());
          if (JSON.stringify(kanon(blob)) !== u0) K.przezStarsza.zapisow = (K.przezStarsza.zapisow || 0) + 1;
          const klucze = LO.kluczeKopert(lista0);
          for (const N of S.flotaUrz.filter((V) => !starszaAplikacja(V))) {
            const N2 = await klonBiezacy(S, N, 'ek');
            try {
              const przed = await eksport(N2);
              await N2.v.mergeSyncPayload(json(blob));
              const lista = LO.wierszeEcha(S.odsyl.echo(przed, await eksport(N2), blob, { z221, klucze }).filter((r) => r[warstwa]));
              if (warstwa === 'po2a') K.przezStarsza.po2a += lista.length;
              else K.przezStarsza[N === Y ? 'doNadawcy' : 'doInnych'] += lista.length;
              if (lista.length && K.przyklady.length < (warstwa === 'po2a' ? 8 : 16)) K.przyklady.push(`[${warstwa}] ${urzOs(Y)}→${urzOs(U)}′ (${lista0.length}) → pełna kopia → ${urzOs(N)}′: ${opis(lista)}`);
            } finally { await zamknij(N2); }
          }
        } finally { await zamknij(U2, E); }
      }
      if (!koperty.length) continue;
      const U3 = await klon(S, U, 'eo'), Y3 = await klonBiezacy(S, Y, 'eo');
      try {
        let lista0 = koperty;
        for (let i = 0; i < LO.MAKS_OBIEGOW && lista0.length; i += 1) {
          for (const k of lista0) await kopertaNaKlonie(U3, Y3, k);
          const blob = json(await U3.v.exportSyncPayload());
          const przed = await eksport(Y3);
          await Y3.v.mergeSyncPayload(json(blob));
          const po = await eksport(Y3);
          const lista = LO.wierszeEcha(S.odsyl.echo(przed, po, blob, { z221, klucze: LO.kluczeKopert(lista0) }).filter((r) => r[WYK]));
          K.obiegi[i] += lista.length;
          const poE = encje(po), nast = [];
          for (const r of lista) { const k = await kopertaEcha(Y3, r, poE); if (k && !k.blad) nast.push(k); }
          lista0 = nast;
        }
        if (lista0.length) K.ponadObiegi += 1;
      } finally { await zamknij(U3, Y3); }
    }
  });
  K.ms += performance.now() - t0;
}

// ══ Flota ze starszą aplikacją: scenariusze deterministyczne (E3-PR0b) ══════════════════════════════════════════════
// Jeden świat na scenariusz: swiat(800 + nr) i Math.random z rng(0x6800 + nr), nr — pozycja w P6F (nowy scenariusz
// tylko na końcu literału — inaczej przesuwa światy istniejących; asercja nr < 40); ręczne kontrole C = N mają stały
// świat 840 + pozycja scenariusza bazowego (niezależny od długości listy; asercja < 80, światy 880–899 ma blok znanych
// usterek niżej).
// A i B — bieżący sejf (bliźniaki); C — bliźniak A z sejfem starszej aplikacji (221 bez dziennika zdarzeń, 276
// z dziennikiem; retencja v1) albo bieżący (kontrola C = N). Transport opisuje scenariusz: zdarzenia (dostawa, haki do Q odbiorcy), kolejka do 221
// (dostawaDoStarszej — applyEncryptedDelta), pełna kopia (scalBlob, licznik: źródło blob221, blob276, blobN). Ocena
// (p6fOcen): D par (A, B), (B, C), (C, A) na żywych urządzeniach (tabela 'p6', para z C starszej aplikacji — 'flota')
// i wyrocznia 'p6f W1'; W4 trzech urządzeń na świeżych klonach (w4Trzy: obiegi wymiany PO-A par, D par w tabeli 'p6'
// albo 'flota') i wyrocznia 'p6f W4' z widokiem C jako widokiem starszej aplikacji (stare). Warunki CI: W4 stabilne
// i każda różnica par dozwolona, wyrocznia bez naruszeń bez klasy; literały P6F_LITERALY (D par po scenariuszu, stan
// kliniczny po scenariuszu i po W4, D par W4, fakty scenariusza), P6F_WYR (naruszenia wyroczni: świat, urządzenie,
// encja, rodzaj, klasa) i P6F_ODSYL (licznik: klucz → { wyk, nowe }; w scenariuszach z echem także echo na klonach);
// literały tylko w przebiegu domyślnym (P6F_DOMYSLNE: normalizacja tożsamości wizyty, licznik, reguła T), warunki CI
// zawsze; wymog — jawny fakt scenariusza (asercja niezależna od literału).
// Scenariusze ręczne (E2_AB_P6_FLOTA=wszystkie): bloki p. 6 R2-0, R5-E1 i R3-E2 z jednym urządzeniem na 221 oraz
// kontrole C = N scenariuszy CI — druk, bez literału. Zmiana zbieżności albo wyroczni przepisuje literały.
const P6F_WSZYSTKIE = process.env.E2_AB_P6_FLOTA === 'wszystkie';
const P6F_DOMYSLNE = WYR.NORM_VISIT.wlaczona && ODSYL && ODSYL_REGULA === 'T';
async function p6fUrzadzenia(S, A, app) {
  const B = await urzadzenie(S, 'B', A);
  const C = await urzadzenie(S, 'C', A, app === 'N' ? {} : { app });
  return { B, C };
}
// Baza: A — karta P z wizytami v (20 kg) i w (21 kg), z notatką n albo bez; B — bliźniak A; C — bliźniak A z sejfem app.
async function p6fBaza(S, app, { notatka = false } = {}) {
  const A = await urzadzenie(S, 'A');
  krok(); const r1 = await A.d.zapiszKarte(1, { wzrost: 120, masa: 20 });
  krok(); const r2 = await A.d.zapiszKarte(1, { wzrost: 125, masa: 21, zapis: { patientId: r1.patientId, forceNewSnapshot: true } });
  let nId = null;
  if (notatka) { krok(); nId = (await A.v.savePatientNote({ patientId: r1.patientId, title: 'Fikcyjna', body: 'Fikcyjna treść', category: 'inne' })).id; }
  krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
  const { B, C } = await p6fUrzadzenia(S, A, app);
  return { A, B, C, P: r1.patientId, v: r1.snapshotId, w: r2.snapshotId, nId, n: new Map([[r1.patientId, 'P'], [r1.snapshotId, 'v'], [r2.snapshotId, 'w'], ...(nId ? [[nId, 'n']] : [])]) };
}
// Baza retencji: karta P z 8 wizytami z 8 dni (co 2 dni), zegar 54 dni po pierwszej (retencja z parametrami aplikacji
// zostawia z nich jedną; jak strażnik retencji w starsza-aplikacja-fikstury.test.mjs).
async function p6fOsiemDni(S, app) {
  const A = await urzadzenie(S, 'A');
  const DZIEN = 864e5, t0 = teraz;
  krok(); const r0 = await A.d.zapiszKarte(1, { wzrost: 100, masa: 20 });
  const n = new Map([[r0.patientId, 'P'], [r0.snapshotId, 'dz0']]);
  for (let i = 1; i < 8; i += 1) { ustaw(t0 + i * 2 * DZIEN); n.set((await A.d.zapiszKarte(1, { wzrost: 100 + i, masa: 20 + i, zapis: { patientId: r0.patientId, forceNewSnapshot: true } })).snapshotId, 'dz' + i); }
  krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
  const { B, C } = await p6fUrzadzenia(S, A, app);
  ustaw(t0 + 54 * DZIEN);
  return { A, B, C, P: r0.patientId, n };
}
// Baza „Scal pacjentów” z wizytami o jawnych identyfikatorach (fikcyjne): karta P z wizytą v (jedyny stan wizyty), karta
// Q z wizytą w.
async function p6fDwieKarty(S, app) {
  const A = await urzadzenie(S, 'A');
  const wiz = (id) => ({ version: 1, visitId: id, patientId: null, clinicalDateISO: '2026-03-02', createdAtISO: new Date(Date.now()).toISOString(), origin: 'explicit' });
  krok(); const r1 = await A.v.savePatient({ ...naglowek(1, { masa: 20 }), visit: wiz('fac0a000-0000-4000-8000-00000000f1e1') }, { dedup: false });
  krok(); const r2 = await A.v.savePatient({ ...naglowek(2, { wzrost: 125, masa: 21 }), visit: wiz('fac0a000-0000-4000-8000-00000000f1e2') }, { dedup: false });
  krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
  const { B, C } = await p6fUrzadzenia(S, A, app);
  return { A, B, C, P: r1.patientId, Q: r2.patientId, v: r1.snapshotId, w: r2.snapshotId, n: new Map([[r1.patientId, 'P'], [r2.patientId, 'Q'], [r1.snapshotId, 'v'], [r2.snapshotId, 'w']]) };
}
// Baza „Scal 5 → 4 → 3”: karta X (3) z dwiema wersjami na A; B, C — bliźniaki.
async function p6fTrzyKarty(S, app) {
  const A = await urzadzenie(S, 'A');
  krok(); const r = await A.d.zapiszKarte(3);
  krok(); const r2 = await A.d.zapiszKarte(3, { wzrost: 125, zapis: { patientId: r.patientId, forceNewSnapshot: true } });
  krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
  const { B, C } = await p6fUrzadzenia(S, A, app);
  return { A, B, C, X: r.patientId, n: new Map([[r.patientId, 'X'], [r.snapshotId, 'a'], [r2.snapshotId, 'b']]) };
}
const p6fDoC = (u, X) => (u.C.app === 'S221' ? dostawaDoStarszej(u.S, X, u.C) : dostawa(u.S, X, u.C, { w2s: false }));
const p6fOdC = (u, Y) => (u.C.app === 'S221' ? scalBlob(u.S, u.C, Y) : dostawa(u.S, u.C, Y, { w2s: false }));
const p6fAB = (u) => spoczynek(u.S, u.A, u.B, { w2s: false });
// Nowa wersja karty pid na U (etykieta et w mapie u.n); wynik — snapshotId.
async function p6fNowaWersja(u, U, pid, et, { nr = 1, wzrost = 130, masa: kg = 25, opis = 'nowa wersja' } = {}) {
  krok(60e3);
  const r = (await mutacja(u.S, U, `${opis} ${et}`, () => U.d.zapiszKarte(nr, { wzrost, masa: kg, zapis: { patientId: pid, forceNewSnapshot: true } }))).wynik;
  u.n.set(r.snapshotId, et);
  return r.snapshotId;
}
const p6fUrz = (u) => [u.A, u.B, u.C];
// Echo na klonach tylko dla scaleń w fn (scenariusz z polem echo; przy wyłączonym liczniku — bez echa).
async function p6fZEchem(u, fn) {
  u.S.echoKlony = !!u.S.odsyl;
  try { return await fn(); } finally { u.S.echoKlony = false; }
}
// Fakty: karta P, notatka n, nagrobek notatki (z kartą — deletedWithPatient) na każdym urządzeniu.
const faktyNotatki = (u) => Object.fromEntries(p6fUrz(u).map((U) => {
  const t = (U.stan.patientNoteTombstones || []).find((x) => x.id === u.nId);
  return [U.nazwa, `karta ${kartaW(U.stan, u.P) ? 'jest' : 'brak'}, notatka ${notatkaW(U.stan, u.nId) ? 'jest' : 'brak'}, nagrobek notatki ${t ? (t.deletedWithPatient ? 'z kartą' : 'bez karty') : '-'}`];
}));
// Fakty: liczba wersji karty pid na każdym urządzeniu i wpisy retencji.
const faktyRetencji = (u, pid) => Object.fromEntries(p6fUrz(u).map((U) => [U.nazwa, `wersji ${wersjeKarty(U, pid).length}, wpisów retencji ${(U.stan.snapshotTombstones || []).filter((e) => e.powod === 'retencja').length}`]));
// Fakty wersji sid: rev, gwiazdka w treści, rejestr gwiazdki, chwila treści — na każdym urządzeniu.
const faktyWersji = (u, sid) => Object.fromEntries(p6fUrz(u).map((U) => {
  const p = gdzie(U, sid);
  const s = p && p.snapshots.find((q) => q.snapshotId === sid);
  if (!s) return [U.nazwa, 'brak'];
  const pl = s.payload || {};
  return [U.nazwa, `karta ${etykieta(u.n, p.patientId)}, rev ${s.rev}, _pinned ${pl._pinned ? 1 : 0}, _pinnedState ${pl._pinnedState ? 'jest' : 'brak'}, _contentAtISO ${pl._contentAtISO ? 'jest' : 'brak'}`];
}));
// E3-PR0b2b: oznaczenie notatki n na każdym urządzeniu (wykonana / otwarta, rev).
const faktyOznaczenia = (u) => Object.fromEntries(p6fUrz(u).map((U) => {
  const n = (U.stan.patientNotes || []).find((x) => x.id === u.nId);
  return [U.nazwa, n ? `${n.completedAtISO ? 'wykonana' : 'otwarta'} (rev ${n.rev})` : 'brak'];
}));
function p6fCofniecieStarszej(app) {
  return {
    ci: true, app, baza: (S, a) => p6fBaza(S, a, { notatka: true }),
    kroki: async (u) => {
      krok(60e3); await mutacja(u.S, u.B, 'wykonane n', () => u.B.v.completePatientNote(u.nId));
      krok(60e3); await p6fDoC(u, u.B);
      krok(60e3); await mutacja(u.S, u.C, 'cofnij wykonanie n (starsza aplikacja)', () => u.C.v.uncompletePatientNote(u.nId));
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: faktyOznaczenia,
  };
}
const P6F = {
  '„Usuń pacjenta” na 221, potem zmiana karty na A: notatka bez ratunku D-21': {
    ci: true, app: 'S221', baza: (S, app) => p6fBaza(S, app, { notatka: true }),
    kroki: async (u) => {
      await p6usunPacjenta(u, u.C, u.P);
      await p6fNowaWersja(u, u.A, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)' });
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: faktyNotatki,
  },
  '„Usuń pacjenta” na C, potem zmiana karty na A — C = N (notatka zostaje)': {
    ci: true, app: 'N', baza: (S, app) => p6fBaza(S, app, { notatka: true }),
    kroki: async (u) => {
      await p6usunPacjenta(u, u.C, u.P);
      await p6fNowaWersja(u, u.A, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)' });
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: faktyNotatki,
  },
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw zdarzenia do C: notatka bez ratunku D-21': {
    ci: true, app: 'S221', baza: (S, app) => p6fBaza(S, app, { notatka: true }),
    kroki: async (u) => {
      await p6usunPacjenta(u, u.A, u.P);
      await p6fNowaWersja(u, u.C, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)', wzrost: 131, masa: 26 });
      krok(60e3); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: faktyNotatki,
  },
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw pełna kopia C (notatka zostaje)': {
    ci: true, app: 'S221', baza: (S, app) => p6fBaza(S, app, { notatka: true }),
    kroki: async (u) => {
      await p6usunPacjenta(u, u.A, u.P);
      await p6fNowaWersja(u, u.C, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)', wzrost: 131, masa: 26 });
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: faktyNotatki,
    // pełna kopia 221 z notatką dochodzi do bieżących urządzeń po usunięciu: ratunek D-21 bieżącej aplikacji ją przywraca
    // (bez niego klasa notatki floty mogłaby uznać jej brak za skutek starszej aplikacji)
    wymog: { opis: 'notatka n jest na A, B i C', fakt: (u) => p6fUrz(u).map((U) => `${U.nazwa}: ${notatkaW(U.stan, u.nId) ? 'jest' : 'brak'}`), oczekiwane: ['A: jest', 'B: jest', 'C: jest'] },
  },
  '„Usuń pacjenta” na A, zmiana karty na C — C = N, najpierw zdarzenia do C (notatka zostaje)': {
    ci: true, app: 'N', baza: (S, app) => p6fBaza(S, app, { notatka: true }),
    kroki: async (u) => {
      await p6usunPacjenta(u, u.A, u.P);
      await p6fNowaWersja(u, u.C, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)', wzrost: 131, masa: 26 });
      krok(60e3); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: faktyNotatki,
  },
  'Kosz na 221: echo tożsamości wizyty u odbiorcy pełnej kopii i echo na klonach': {
    ci: true, kontrolaN: true, app: 'S221', echo: true, baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await doKosza(u, u.C, u.v);
      krok(60e3); await p6fZEchem(u, () => p6fOdC(u, u.A)); await p6fOdC(u, u.B); await p6fAB(u);
    },
  },
  // Echo wpisu Kosza z gwiazdką (A po koszu B bez wiedzy o gwiazdce; B po gwiazdce A) idzie do C, który ma niewysłaną
  // nowszą poprawkę tej wizyty; pełna kopia C′ wraca do nadawcy z tą treścią (drugi rząd: 1 wiersz na echo), a echo
  // tego wiersza przez C już nic nie daje (trzeci rząd 0).
  'Drugi rząd przez 221: wpis Kosza z gwiazdką z A do C (C z niewysłaną poprawką), pełna kopia C′ do A′': {
    ci: true, kontrolaN: true, app: 'S221', echo: true, baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await p6gwiazdka(u, u.A, u.v, true); await p6fDoC(u, u.A);
      await popraw(u, u.C, u.v, 33);
      await doKosza(u, u.B, u.v);
      krok(60e3); await p6fZEchem(u, () => dostawa(u.S, u.B, u.A, { w2s: false }));
      await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
  },
  'Retencja na 221 po „Scal pacjentów”: jedyny stan wizyty przeniesionej (recentHours 0)': {
    ci: true, app: 'S221', baza: p6fDwieKarty,
    kroki: async (u) => {
      await scal(u, u.A, u.P, u.Q); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await mutacja(u.S, u.C, 'retencja Q', () => u.C.v.pruneSnapshotsForPatient(u.Q, { recentHours: 0 }));
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => ({ ...faktyRetencji(u, u.Q), v: Object.fromEntries(p6fUrz(u).map((U) => [U.nazwa, gdzie(U, u.v) ? etykieta(u.n, gdzie(U, u.v).patientId) : 'brak'])) }),
  },
  'Retencja po „Scal pacjentów” — C = N (bez strat)': {
    ci: true, app: 'N', baza: p6fDwieKarty,
    kroki: async (u) => {
      await scal(u, u.A, u.P, u.Q); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await mutacja(u.S, u.C, 'retencja Q', () => u.C.v.pruneSnapshotsForPatient(u.Q, { recentHours: 0 }));
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => ({ ...faktyRetencji(u, u.Q), v: Object.fromEntries(p6fUrz(u).map((U) => [U.nazwa, gdzie(U, u.v) ? etykieta(u.n, gdzie(U, u.v).patientId) : 'brak'])) }),
  },
  'Retencja na 221 z parametrami aplikacji: 8 wizyt z 8 dni sprzed 40–54 dni': {
    ci: true, kontrolaN: true, app: 'S221', baza: p6fOsiemDni,
    kroki: async (u) => {
      await mutacja(u.S, u.C, 'retencja P (24 h)', () => u.C.v.pruneSnapshotsForPatient(u.P, { recentHours: 24 }));
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyRetencji(u, u.P),
    // bieżący odbiorca nagrobków retencji zachowuje najnowszy stan każdej z 8 wizyt (8 dni → 8 wizyt); wizyta zlana
    // z innymi (tożsamość wizyty bez dnia albo z inną cechą niż dzień) zostawiłaby jedną wersję, a wyrocznia — liczona
    // z tożsamości z eksportu — by tego nie zauważyła
    wymog: { opis: 'A i B mają 8 wersji karty P', fakt: (u) => [u.A, u.B].map((U) => `${U.nazwa}: wersji ${wersjeKarty(U, u.P).length}`), oczekiwane: ['A: wersji 8', 'B: wersji 8'] },
  },
  'Retencja na 276 z parametrami aplikacji: nagrobek retencji idzie zdarzeniem': {
    ci: true, kontrolaN: true, app: 'S276', baza: p6fOsiemDni,
    kroki: async (u) => {
      await mutacja(u.S, u.C, 'retencja P (24 h)', () => u.C.v.pruneSnapshotsForPatient(u.P, { recentHours: 24 }));
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyRetencji(u, u.P),
  },
  'Retencja na 276 po „Scal 5 → 4 → 3” na A': {
    ci: true, kontrolaN: true, app: 'S276', baza: p6fTrzyKarty,
    kroki: async (u) => {
      const { S, A, B, C } = u;
      krok(); const Y = (await mutacja(S, C, 'nowa karta 4', () => C.d.zapiszKarte(4))).wynik.patientId;
      u.n.set(Y, 'Y');
      await p6fOdC(u, A); await p6fOdC(u, B);
      krok(); const Z = (await mutacja(S, A, 'nowa karta 5', () => A.d.zapiszKarte(5))).wynik.patientId;
      u.n.set(Z, 'Z');
      await scal(u, A, Z, Y);
      await p6fNowaWersja(u, A, Y, 'c', { nr: 4, wzrost: 134 });
      await scal(u, A, Y, u.X);
      await p6fDoC(u, A); await dostawa(S, A, B, { w2s: false });
      u.wizytyPrzed = Object.fromEntries(p6fUrz(u).map((U) => [U.nazwa, wizytyKarty(U, u.X)]));
      krok(60e3); await mutacja(S, C, 'retencja karty 3', () => C.v.pruneSnapshotsForPatient(u.X, { recentHours: 0 }));
      await p6fOdC(u, A);
      krok(); await scalBlob(S, C, B);
      await p6fAB(u);
    },
    fakty: (u) => ({ przed: u.wizytyPrzed, po: Object.fromEntries(p6fUrz(u).map((U) => [U.nazwa, wizytyKarty(U, u.X)])) }),
  },
  'Gwiazdka na 221: „Odepnij i usuń”, potem „Przywróć”': {
    ci: true, kontrolaN: true, app: 'S221', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await p6gwiazdka(u, u.A, u.v, true); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      await doKosza(u, u.C, u.v);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
      await p6przywroc(u, u.C, u.v);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyWersji(u, u.v),
  },
  // Wersja x powstaje na 221 (bez pól W3), A i B dostają ją z gwiazdką z pełnej kopii C, potem C ją odpina: obie kopie
  // bez W3 i ta sama treść poza _pinned — odbiorca bierze całą nowszą wersję (Bgw_scal, vilda_vault.js:3951–3956), bez
  // rekordu złożonego. Bez tej gałęzi odczyt bez pól daje starej kopii z gwiazdką późniejszy rejestr i rekord złożony
  // z gwiazdką (zmiana gałęzi przeżywa resztę pliku A ≡ B i losowe floty; łapie ją też przypieta-w3-flota.test.mjs).
  'Gwiazdka i odpięcie na 221 na wersji zapisanej na 221 (obie kopie bez W3): odbiorca bierze całą nowszą wersję': {
    ci: true, kontrolaN: true, app: 'S221', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      u.x = await p6fNowaWersja(u, u.C, u.P, 'x', { opis: 'nowa wersja na 221', wzrost: 131, masa: 26 });
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
      await p6gwiazdka(u, u.C, u.x, true);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
      await p6gwiazdka(u, u.C, u.x, false);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyWersji(u, u.x),
  },
  '276: nowa wersja na C, A dopisuje tożsamość wizyty; echo na klonach': {
    ci: true, kontrolaN: true, app: 'S276', echo: true, baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      u.x = await p6fNowaWersja(u, u.C, u.P, 'x', { opis: 'nowa wersja na 276', wzrost: 131, masa: 26 });
      krok(60e3); u.haki = (await p6fZEchem(u, () => dostawa(u.S, u.C, u.A, { w2s: false }))).dodane.length;
      await dostawa(u.S, u.C, u.B, { w2s: false }); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: (u) => ({ hakiA: u.haki, ...faktyWersji(u, u.x) }),
  },
  'Same bieżące urządzenia: Kosz w zwróconej starej karcie, potem „Usuń pacjenta” karty scalonej': {
    ci: true, app: 'N',
    baza: async (S, app) => {
      const A = await urzadzenie(S, 'A');
      krok(); const r1 = await A.d.zapiszKarte(1, { masa: 20 });
      krok(); const r3 = await A.d.zapiszKarte(3, { masa: 30 });
      krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
      const { B, C } = await p6fUrzadzenia(S, A, app);
      return { A, B, C, Y: r1.patientId, X: r3.patientId, x: r3.snapshotId, n: new Map([[r1.patientId, 'Y'], [r3.patientId, 'X'], [r1.snapshotId, 'a'], [r3.snapshotId, 'x']]) };
    },
    kroki: async (u) => {
      await scal(u, u.A, u.X, u.Y);
      await p6fNowaWersja(u, u.B, u.X, 'y', { nr: 3, opis: 'nowa wersja (bez wiedzy o scaleniu)', wzrost: 133, masa: 31 });
      await doKosza(u, u.B, u.x);
      krok(60e3); await p6fAB(u);
      await p6usunPacjenta(u, u.A, u.Y);
      krok(60e3); await spoczynekWszystkich(u.S, p6fUrz(u));
    },
    fakty: async (u) => {
      const o = {};
      for (const U of p6fUrz(u)) {
        const e = (await kr_cicho(u.S, () => U.v.listTrashedSnapshots())).find((q) => q.snapshotId === u.x);
        o[U.nazwa] = e ? `Kosz pod ${etykieta(u.n, e.patientId)}${e.patientExists ? '' : ' (ukryty)'}` : 'brak w Koszu';
      }
      return o;
    },
  },
  // ── ręcznie (E2_AB_P6_FLOTA=wszystkie): bloki p. 6 z urządzeniem 221 i kontrole C = N ──
  'R2-0, C na 221: gwiazdka i poprawka na 221, poprawka na A': {
    app: 'S221', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await p6gwiazdka(u, u.C, u.v, true); await popraw(u, u.C, u.v, 27); await popraw(u, u.A, u.v, 30);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: (u) => faktyWersji(u, u.v),
  },
  'R5-E1, C na 221: kartę po „Przywróć” i „Usuń pacjenta” przywraca nowa wizyta na 221': {
    app: 'S221', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await doKosza(u, u.B, u.v); krok(); await dostawa(u.S, u.B, u.A, { w2s: false });
      await p6przywroc(u, u.B, u.v); await p6usunPacjenta(u, u.A, u.P); await p6fAB(u);
      await p6fNowaWersja(u, u.C, u.P, 'x', { opis: 'C: nowa wizyta' });
      await scalBlob(u.S, u.C, u.A); await scalBlob(u.S, u.C, u.B); await p6fAB(u); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
    },
    fakty: (u) => faktyWersji(u, u.v),
  },
  'R3-E2, C na 221: kopia z notatką poza siecią wraca po usunięciu i „Zostaw notatkę”': {
    app: 'S221', baza: (S, app) => p6fBaza(S, app, { notatka: true }),
    kroki: async (u) => {
      const not = async (U, t) => { krok(60e3); await mutacja(u.S, U, `notatka „${t}”`, () => U.v.savePatientNote({ id: u.nId, patientId: u.P, title: 'Fikcyjna', body: t, category: 'inne' })); };
      await not(u.A, 'A2'); await not(u.A, 'A3'); await p6fDoC(u, u.A);
      krok(60e3); await mutacja(u.S, u.B, 'usuń notatkę', () => u.B.v.removePatientNote(u.nId)); await p6fAB(u);
      await not(u.B, 'wskrzeszona na B'); await p6fAB(u);
      krok(60e3); await scalBlob(u.S, u.B, u.C); await scalBlob(u.S, u.A, u.C); await scalBlob(u.S, u.C, u.A); await scalBlob(u.S, u.C, u.B); await p6fAB(u);
    },
    fakty: (u) => Object.fromEntries(p6fUrz(u).map((U) => { const x = (U.stan.patientNotes || []).find((q) => q.id === u.nId); return [U.nazwa, x ? x.body : 'brak']; })),
  },
  // ── CI, dopisane na końcu (warunki klas floty: przyczyna po stronie bieżącej aplikacji nie dostaje klasy floty) ──
  // Przypięcie i odpięcie na 221 wersji z bieżącej aplikacji (rejestr „nieprzypięta”, chwila treści i odcisk h zgodny
  // z treścią): bieżąca aplikacja czyta przypięcie w chwili zmiany rekordu i odpięcie też (Bgw_stan, vilda_vault.js
  // :1568–1570; odcisk zgodny — starsza aplikacja wróciła do stanu rejestru), więc A, B i C kończą bez gwiazdki.
  // Gwiazdka w widoku bieżącym (rekord złożony z przypięciem) byłaby błędem bieżącej aplikacji bez klasy floty.
  'Przypięcie i odpięcie na 221 wersji z bieżącej aplikacji (odcisk zgodny z treścią): bieżąca aplikacja widzi odpięcie': {
    ci: true, kontrolaN: true, app: 'S221', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await p6gwiazdka(u, u.C, u.v, true);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
      await p6gwiazdka(u, u.C, u.v, false);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyWersji(u, u.v),
    wymog: { opis: 'v bez gwiazdki na A, B i C', fakt: (u) => p6fUrz(u).map((U) => `${U.nazwa}: ${(gdzie(U, u.v) || { snapshots: [] }).snapshots.find((q) => q.snapshotId === u.v)?.payload?._pinned ? 'z gwiazdką' : 'bez gwiazdki'}`), oczekiwane: ['A: bez gwiazdki', 'B: bez gwiazdki', 'C: bez gwiazdki'] },
  },
  // Poprawka v na 221 bez wysłania (C bez delt), „Usuń pacjenta” na A, B bez wiedzy o usunięciu zwraca kartę nową wersją;
  // nagrobek dochodzi do C przed jego pełną kopią — sejf 221 (bez dziennika zdarzeń) usuwa kartę razem z niewysłaną
  // poprawką, a karta zwrócona przez B jej nie ma: klasa „zmiana starszej aplikacji usunięta z kartą przed wysłaniem”.
  // Kontrola C = N (też CI): kolejka zdarzeń C niesie poprawkę i po pełnej wymianie v ma 33 kg wszędzie.
  'Poprawka na 221 bez wysłania, „Usuń pacjenta” na A, B zwraca kartę: poprawka usunięta z kartą przed wysłaniem': {
    ci: true, app: 'S221', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await popraw(u, u.C, u.v, 33);
      await p6usunPacjenta(u, u.A, u.P);
      await p6fNowaWersja(u, u.B, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)' });
      krok(60e3); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyWersji(u, u.v),
  },
  'Poprawka na C bez wysłania, „Usuń pacjenta” na A, B zwraca kartę — C = N (poprawka zostaje)': {
    ci: true, app: 'N', baza: (S, app) => p6fBaza(S, app),
    kroki: async (u) => {
      await popraw(u, u.C, u.v, 33);
      await p6usunPacjenta(u, u.A, u.P);
      await p6fNowaWersja(u, u.B, u.P, 'x', { opis: 'nowa wersja (bez wiedzy o usunięciu)' });
      krok(60e3); await p6fDoC(u, u.A); await p6fDoC(u, u.B);
      krok(60e3); await p6fOdC(u, u.A); await p6fOdC(u, u.B); await p6fAB(u);
    },
    fakty: (u) => faktyWersji(u, u.v),
  },
  // E3-PR0b2b (P-NOTATKA-POZNIEJSZA), skutek do odbioru — znane ograniczenie starszej wersji: „wykonane” na bieżącym B,
  // później cofnięcie na starszej aplikacji C, która nie zna chwili oznaczenia (stateAtISO) i wybiera wersję najpierw po rev.
  '„Wykonane” na B, potem cofnięcie na 276 (starsza aplikacja bez chwili oznaczenia)': p6fCofniecieStarszej('S276'),
  '„Wykonane” na B, potem cofnięcie na 221 (starsza aplikacja bez chwili oznaczenia)': p6fCofniecieStarszej('S221'),
};
// Kontrole C = N scenariuszy CI z urządzeniem starszej aplikacji (ręcznie; ten sam program kroków; świat 840 + pozycja
// scenariusza bazowego).
for (const [nr, [nazwa, sc]] of Object.entries({ ...P6F }).entries()) if (sc.kontrolaN) P6F[`${nazwa} — kontrola C = N`] = { ...sc, ci: false, app: 'N', nrSwiata: 40 + nr };
const wizytyKarty = (U, pid) => {
  const m = {};
  for (const s of ((U.stan.patients || []).find((p) => p.patientId === pid) || { snapshots: [] }).snapshots) { const v = s.payload && s.payload.visit ? String(s.payload.visit.visitId).slice(0, 4) : '-'; m[v] = (m[v] || 0) + 1; }
  return sortuj(m);
};
async function p6fSwiat(nr0, sc) {
  const nr = sc.nrSwiata ?? nr0;
  if (!(sc.nrSwiata != null ? nr >= 40 && nr < 80 : nr < 40)) throw new Error(`scenariusz floty ${nr}: poza światami 800–839 (kontrole C = N — 840–879)`);
  ustaw(START);
  const S = swiat(800 + nr);
  const los = rng(0x6800 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  S.w2s = false; S.nrKroku = 0; S.wyrSwiat = 'p6f';
  S.stat.obiegiPonadLimit = [];
  if (ODSYL) S.odsyl = nowyLicznik();
  const u = await sc.baza(S, sc.app);
  u.S = S;
  S.flotaUrz = p6fUrz(u);
  await sc.kroki(u);
  for (const U of p6fUrz(u)) ustawStan(U, await eksport(U));
  p6fEtykiety(u);
  return u;
}
// Wersje bez etykiety (głowa „Scal pacjentów”, wersje zapisane przez scalanie) — g1, g2, … w kolejności urządzeń,
// kart i chwili zapisu, potem wizyty historii wyroczni, których na końcu nie ma (np. przycięte) — w kolejności historii
// (literał bez skrótów identyfikatorów).
function p6fEtykiety(u) {
  let i = 0;
  const dodaj = (id) => { if (!u.n.has(id)) u.n.set(id, 'g' + (i += 1)); };
  for (const U of p6fUrz(u)) for (const p of U.stan.patients || []) {
    for (const q of (p.snapshots || []).slice().sort((x, y) => ((x.savedAtISO || '') + x.snapshotId < (y.savedAtISO || '') + y.snapshotId ? -1 : 1))) dodaj(q.snapshotId);
  }
  if (u.S.wyr) for (const sid of u.S.wyr.w.keys()) dodaj(sid);
}
async function p6fOcen(u, nazwa) {
  const { S, A, B, C, n } = u;
  const urz = p6fUrz(u);
  const stare = urz.filter(starszaAplikacja).map((U) => U.nazwa);
  S.wyrEtyk = (id) => etykieta(n, id);
  const W1 = {};
  for (const [X, Y] of [[A, B], [B, C], [C, A]]) W1[X.nazwa + Y.nazwa] = opisD(await w1Klasy(S, X, Y, kontPary(X, Y, { tabela: 'p6' })), n, X.nazwa, Y.nazwa);
  const kl = {};
  for (const U of urz) kl[U.nazwa] = await kr_cicho(S, () => kliniczny(U, n));
  const wyrW1 = wyrOcena(S, 'p6f W1', nazwa, await wyrWidoki(S, { A, B, C }), { stare });
  const w = await w4Trzy(S, urz, n);
  const wyrW4 = wyrOcena(S, 'p6f W4', nazwa, w.wyr, { stare });
  delete w.wyr;
  const nar = [...wyrW1, ...wyrW4];
  return {
    literal: { W1, kliniczny: kl, W4: { ok: w.ok, obiegi: w.rund, pary: Object.fromEntries(w.pary.map((p) => [p.para, p.roznice])), kliniczny: w.opis } },
    wyr: nar.map((x) => `${x.swiat}: ${x.urz} ${x.encja} ${x.et} ${x.rodzaj} [${x.klasa || 'bez klasy'}]`).sort(),
    czerwone: wyrCzerwone(nar),
    w4ok: w.ok,
  };
}
// Licznik scenariusza: klucz → { wyk, nowe }, wiersze według źródła i warstwy (surowe, po2a, wyk; bez zer); przy echu na
// klonach — drugi rząd, przez starszą aplikację, obiegi.
function p6fOdsyl(S, zEchem) {
  if (!S.odsyl) return null;
  const o = S.odsyl.podsumuj();
  const K = o.klony;
  const wiersze = Object.fromEntries(Object.entries(o.wiersze).filter(([k, v]) => v && /:(surowe|po2a|wyk)$/.test(k)));
  return sortuj({
    literal: literalOdsyl([o]), wiersze,
    ...(zEchem ? { klony: { prob: K.prob, drugiRzad: K.drugiRzad, drugiRzad2a: K.drugiRzad2a, przezStarsza: K.przezStarsza, obiegi: K.obiegi, ponadObiegi: K.ponadObiegi } } : {}),
  });
}
// Literały scenariuszy CI (zmierzone; charakterystyka dzisiejszego stanu). P6F_LITERALY: W1 — D par po scenariuszu
// (opisD: rodzaj, klucz z etykietami, ścieżki albo strona, klasa), kliniczny — stan kliniczny urządzeń po scenariuszu,
// W4 — obiegi wymiany, punkt stały z różnicami dozwolonymi (ok), D par i stan kliniczny klonów po pełnej wymianie,
// fakty — fakty scenariusza. P6F_WYR — naruszenia wyroczni („świat: urządzenie encja etykieta rodzaj [klasa]”;
// scenariusz spoza listy — bez naruszeń). P6F_ODSYL — licznik (klucz → { wyk, nowe }, wiersze według źródła i warstwy;
// echo na klonach). Klucze bez ścieżek pól; ścieżki występują tylko w opisach różnic D (wartości W1 i W4.pary, jak
// w P6_LITERALY). Skutki starszej aplikacji w tych literałach (utrata notatki, retencja, gwiazdka) to znane
// ograniczenie starszej wersji — naprawa: aktualizacja urządzeń (decyzja właściciela z 2026-11-16;
// WYR.OGRANICZENIE_STARSZEJ w opisach klas).
const P6F_LITERALY = {
  '„Usuń pacjenta” na 221, potem zmiana karty na A: notatka bez ratunku D-21': {
    W1: { AB: [], BC: [], CA: [] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta jest, notatka brak, nagrobek notatki bez karty', B: 'karta jest, notatka brak, nagrobek notatki bez karty', C: 'karta jest, notatka brak, nagrobek notatki bez karty' },
    kliniczny: { A: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -' },
  },
  '„Usuń pacjenta” na C, potem zmiana karty na A — C = N (notatka zostaje)': {
    W1: { AB: [], BC: [], CA: [] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:25] | Kosz - | notatki n: Fikcyjna treść', B: 'karty P[v:20 w:21 x:25] | Kosz - | notatki n: Fikcyjna treść', C: 'karty P[v:20 w:21 x:25] | Kosz - | notatki n: Fikcyjna treść' }, obiegi: 1, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta jest, notatka jest, nagrobek notatki -', B: 'karta jest, notatka jest, nagrobek notatki -', C: 'karta jest, notatka jest, nagrobek notatki -' },
    kliniczny: { A: 'karty P[v:20 w:21 x:25] | Kosz - | notatki n: Fikcyjna treść', B: 'karty P[v:20 w:21 x:25] | Kosz - | notatki n: Fikcyjna treść', C: 'karty P[v:20 w:21 x:25] | Kosz - | notatki n: Fikcyjna treść' },
  },
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw zdarzenia do C: notatka bez ratunku D-21': {
    W1: { AB: [], BC: ['pnotetomb n: deletedWithPatient [pole nieznane starszej aplikacji (221)]', 'wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['pnotetomb n: deletedWithPatient [pole nieznane starszej aplikacji (221)]', 'wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['pnotetomb n: deletedWithPatient [pole nieznane starszej aplikacji (221)]', 'wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['pnotetomb n: deletedWithPatient [pole nieznane starszej aplikacji (221)]', 'wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] } },
    fakty: { A: 'karta jest, notatka brak, nagrobek notatki z kartą', B: 'karta jest, notatka brak, nagrobek notatki z kartą', C: 'karta jest, notatka brak, nagrobek notatki bez karty' },
    kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -' },
  },
  // E3-PR0b2b (P-NOTATKA-POZNIEJSZA): ratunek D-21 na bieżących urządzeniach zapisuje chwilę treści notatki
  // (contentAtISO z kotwicą), a 221 jej nie zna i ucina — W1 BC i CA mają tę niewidoczną różnicę pary z klasą floty
  // „chwile notatki nieznane starszej aplikacji”; pełna wymiana wyrównuje ją w drugim obiegu (obiegi 2, dotąd 1), widok
  // kliniczny bez zmian.
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw pełna kopia C (notatka zostaje)': {
    W1: { AB: [], BC: ['pnote n: contentAtISO, contentForISO [chwile notatki nieznane starszej aplikacji]', 'wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['pnote n: contentAtISO, contentForISO [chwile notatki nieznane starszej aplikacji]', 'wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść' }, obiegi: 2, ok: true, pary: { AB: [], BC: ['wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] } },
    fakty: { A: 'karta jest, notatka jest, nagrobek notatki -', B: 'karta jest, notatka jest, nagrobek notatki -', C: 'karta jest, notatka jest, nagrobek notatki -' },
    kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść' },
  },
  '„Usuń pacjenta” na A, zmiana karty na C — C = N, najpierw zdarzenia do C (notatka zostaje)': {
    W1: { AB: [], BC: [], CA: [] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść' }, obiegi: 1, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta jest, notatka jest, nagrobek notatki -', B: 'karta jest, notatka jest, nagrobek notatki -', C: 'karta jest, notatka jest, nagrobek notatki -' },
    kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki n: Fikcyjna treść' },
  },
  'Kosz na 221: echo tożsamości wizyty u odbiorcy pełnej kopii i echo na klonach': {
    W1: { AB: [], BC: ['kosz v|P: visitIdentity [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['kosz v|P: visitIdentity [tożsamość wizyty nieznana starszej aplikacji]'] },
    W4: { kliniczny: { A: 'karty P[w:21] | Kosz v@P:20 | notatki -', B: 'karty P[w:21] | Kosz v@P:20 | notatki -', C: 'karty P[w:21] | Kosz v@P:20 | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['kosz v|P: visitIdentity [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['kosz v|P: visitIdentity [tożsamość wizyty nieznana starszej aplikacji]'] } },
    kliniczny: { A: 'karty P[w:21] | Kosz v@P:20 | notatki -', B: 'karty P[w:21] | Kosz v@P:20 | notatki -', C: 'karty P[w:21] | Kosz v@P:20 | notatki -' },
  },
  'Drugi rząd przez 221: wpis Kosza z gwiazdką z A do C (C z niewysłaną poprawką), pełna kopia C′ do A′': {
    W1: { AB: [], BC: ['kosz v|P: gwiazdka, visitIdentity [pole nieznane starszej aplikacji (221)]'], CA: ['kosz v|P: gwiazdka, visitIdentity [pole nieznane starszej aplikacji (221)]'] },
    W4: { kliniczny: { A: 'karty P[w:21] | Kosz v@P:33* | notatki -', B: 'karty P[w:21] | Kosz v@P:33* | notatki -', C: 'karty P[w:21] | Kosz v@P:33* | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['kosz v|P: gwiazdka, visitIdentity [pole nieznane starszej aplikacji (221)]'], CA: ['kosz v|P: gwiazdka, visitIdentity [pole nieznane starszej aplikacji (221)]'] } },
    kliniczny: { A: 'karty P[w:21] | Kosz v@P:33* | notatki -', B: 'karty P[w:21] | Kosz v@P:33* | notatki -', C: 'karty P[w:21] | Kosz v@P:33* | notatki -' },
  },
  'Retencja na 221 po „Scal pacjentów”: jedyny stan wizyty przeniesionej (recentHours 0)': {
    W1: { AB: [], BC: ['wersja Q/v: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja Q/v: tylko A [retencja starszej aplikacji — obecność wersji]'] },
    W4: { kliniczny: { A: 'karty Q[v:20 g1:21] | Kosz - | notatki -', B: 'karty Q[v:20 g1:21] | Kosz - | notatki -', C: 'karty Q[g1:21] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['wersja Q/v: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja Q/v: tylko A [retencja starszej aplikacji — obecność wersji]'] } },
    fakty: { A: 'wersji 2, wpisów retencji 2', B: 'wersji 2, wpisów retencji 2', C: 'wersji 1, wpisów retencji 2', v: { A: 'Q', B: 'Q', C: 'brak' } },
    kliniczny: { A: 'karty Q[v:20 g1:21] | Kosz - | notatki -', B: 'karty Q[v:20 g1:21] | Kosz - | notatki -', C: 'karty Q[g1:21] | Kosz - | notatki -' },
  },
  'Retencja po „Scal pacjentów” — C = N (bez strat)': {
    W1: { AB: [], BC: [], CA: [] },
    W4: { kliniczny: { A: 'karty Q[v:20 g1:21] | Kosz - | notatki -', B: 'karty Q[v:20 g1:21] | Kosz - | notatki -', C: 'karty Q[v:20 g1:21] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'wersji 2, wpisów retencji 1', B: 'wersji 2, wpisów retencji 1', C: 'wersji 2, wpisów retencji 1', v: { A: 'Q', B: 'Q', C: 'Q' } },
    kliniczny: { A: 'karty Q[v:20 g1:21] | Kosz - | notatki -', B: 'karty Q[v:20 g1:21] | Kosz - | notatki -', C: 'karty Q[v:20 g1:21] | Kosz - | notatki -' },
  },
  'Retencja na 221 z parametrami aplikacji: 8 wizyt z 8 dni sprzed 40–54 dni': {
    W1: { AB: [], BC: ['wersja P/dz0: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja P/dz0: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko A [retencja starszej aplikacji — obecność wersji]'] },
    W4: { kliniczny: { A: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', B: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', C: 'karty P[dz7:27] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['wersja P/dz0: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja P/dz0: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko A [retencja starszej aplikacji — obecność wersji]'] } },
    fakty: { A: 'wersji 8, wpisów retencji 7', B: 'wersji 8, wpisów retencji 7', C: 'wersji 1, wpisów retencji 7' },
    kliniczny: { A: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', B: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', C: 'karty P[dz7:27] | Kosz - | notatki -' },
  },
  'Retencja na 276 z parametrami aplikacji: nagrobek retencji idzie zdarzeniem': {
    W1: { AB: [], BC: ['wersja P/dz0: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja P/dz0: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko A [retencja starszej aplikacji — obecność wersji]'] },
    W4: { kliniczny: { A: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', B: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', C: 'karty P[dz7:27] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['wersja P/dz0: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja P/dz0: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz1: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz2: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz3: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz4: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz5: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja P/dz6: tylko A [retencja starszej aplikacji — obecność wersji]'] } },
    fakty: { A: 'wersji 8, wpisów retencji 7', B: 'wersji 8, wpisów retencji 7', C: 'wersji 1, wpisów retencji 7' },
    kliniczny: { A: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', B: 'karty P[dz0:20 dz1:21 dz2:22 dz3:23 dz4:24 dz5:25 dz6:26 dz7:27] | Kosz - | notatki -', C: 'karty P[dz7:27] | Kosz - | notatki -' },
  },
  'Retencja na 276 po „Scal 5 → 4 → 3” na A': {
    W1: { AB: [], BC: ['wersja X/c: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja X/g1: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja X/c: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja X/g1: tylko A [retencja starszej aplikacji — obecność wersji]'] },
    W4: { kliniczny: { A: 'karty X[g1:22 c:25 g2:22] | Kosz - | notatki -', B: 'karty X[g1:22 c:25 g2:22] | Kosz - | notatki -', C: 'karty X[g2:22] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['wersja X/c: tylko B [retencja starszej aplikacji — obecność wersji]', 'wersja X/g1: tylko B [retencja starszej aplikacji — obecność wersji]'], CA: ['wersja X/c: tylko A [retencja starszej aplikacji — obecność wersji]', 'wersja X/g1: tylko A [retencja starszej aplikacji — obecność wersji]'] } },
    fakty: { po: { A: { '0ad8': 1, '2ba5': 1, '2dd5': 1 }, B: { '0ad8': 1, '2ba5': 1, '2dd5': 1 }, C: { '0ad8': 1 } }, przed: { A: { '0ad8': 3, '2ba5': 3, '2dd5': 1 }, B: { '0ad8': 3, '2ba5': 3, '2dd5': 1 }, C: { '0ad8': 3, '2ba5': 3, '2dd5': 1 } } },
    kliniczny: { A: 'karty X[g1:22 c:25 g2:22] | Kosz - | notatki -', B: 'karty X[g1:22 c:25 g2:22] | Kosz - | notatki -', C: 'karty X[g2:22] | Kosz - | notatki -' },
  },
  'Gwiazdka na 221: „Odepnij i usuń”, potem „Przywróć”': {
    W1: { AB: [], BC: [], CA: [] },
    W4: { kliniczny: { A: 'karty P[v:20* w:21] | Kosz - | notatki -', B: 'karty P[v:20* w:21] | Kosz - | notatki -', C: 'karty P[v:20* w:21] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta P, rev 2, _pinned 1, _pinnedState jest, _contentAtISO jest', B: 'karta P, rev 2, _pinned 1, _pinnedState jest, _contentAtISO jest', C: 'karta P, rev 2, _pinned 1, _pinnedState jest, _contentAtISO jest' },
    kliniczny: { A: 'karty P[v:20* w:21] | Kosz - | notatki -', B: 'karty P[v:20* w:21] | Kosz - | notatki -', C: 'karty P[v:20* w:21] | Kosz - | notatki -' },
  },
  'Gwiazdka i odpięcie na 221 na wersji zapisanej na 221 (obie kopie bez W3): odbiorca bierze całą nowszą wersję': {
    W1: { AB: [], BC: ['wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['wersja P/x: payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] } },
    fakty: { A: 'karta P, rev 2, _pinned 0, _pinnedState brak, _contentAtISO brak', B: 'karta P, rev 2, _pinned 0, _pinnedState brak, _contentAtISO brak', C: 'karta P, rev 2, _pinned 0, _pinnedState brak, _contentAtISO brak' },
    kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -' },
  },
  '276: nowa wersja na C, A dopisuje tożsamość wizyty; echo na klonach': {
    W1: { AB: [], BC: ['wersja P/x: payload._pinnedState.h, payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['wersja P/x: payload._pinnedState.h, payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: ['wersja P/x: payload._pinnedState.h, payload.visit [tożsamość wizyty nieznana starszej aplikacji]'], CA: ['wersja P/x: payload._pinnedState.h, payload.visit [tożsamość wizyty nieznana starszej aplikacji]'] } },
    fakty: { A: 'karta P, rev 0, _pinned 0, _pinnedState jest, _contentAtISO jest', B: 'karta P, rev 0, _pinned 0, _pinnedState jest, _contentAtISO jest', C: 'karta P, rev 0, _pinned 0, _pinnedState jest, _contentAtISO jest', hakiA: 0 },
    kliniczny: { A: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:26] | Kosz - | notatki -' },
  },
  'Same bieżące urządzenia: Kosz w zwróconej starej karcie, potem „Usuń pacjenta” karty scalonej': {
    W1: { AB: [], BC: ['kosz x|X: rev [R4a]'], CA: ['kosz x|X: rev [R4a]'] },
    W4: { kliniczny: { A: 'karty X[y:31] | Kosz x@X:30 | notatki -', B: 'karty X[y:31] | Kosz x@X:30 | notatki -', C: 'karty X[y:31] | Kosz x@X:30 | notatki -' }, obiegi: 2, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'Kosz pod X', B: 'Kosz pod X', C: 'Kosz pod X' },
    kliniczny: { A: 'karty X[y:31] | Kosz x@X:30 | notatki -', B: 'karty X[y:31] | Kosz x@X:30 | notatki -', C: 'karty X[y:31] | Kosz x@X:30 | notatki -' },
  },
  'Przypięcie i odpięcie na 221 wersji z bieżącej aplikacji (odcisk zgodny z treścią): bieżąca aplikacja widzi odpięcie': {
    W1: { AB: [], BC: [], CA: [] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21] | Kosz - | notatki -', B: 'karty P[v:20 w:21] | Kosz - | notatki -', C: 'karty P[v:20 w:21] | Kosz - | notatki -' }, obiegi: 1, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta P, rev 2, _pinned 0, _pinnedState jest, _contentAtISO jest', B: 'karta P, rev 2, _pinned 0, _pinnedState jest, _contentAtISO jest', C: 'karta P, rev 2, _pinned 0, _pinnedState jest, _contentAtISO jest' },
    kliniczny: { A: 'karty P[v:20 w:21] | Kosz - | notatki -', B: 'karty P[v:20 w:21] | Kosz - | notatki -', C: 'karty P[v:20 w:21] | Kosz - | notatki -' },
  },
  'Poprawka na 221 bez wysłania, „Usuń pacjenta” na A, B zwraca kartę: poprawka usunięta z kartą przed wysłaniem': {
    W1: { AB: [], BC: ['wersja P/v: tylko B', 'wersja P/w: tylko B'], CA: ['wersja P/v: tylko A', 'wersja P/w: tylko A'] },
    W4: { kliniczny: { A: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', C: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -' }, obiegi: 2, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta P, rev 0, _pinned 0, _pinnedState jest, _contentAtISO jest', B: 'karta P, rev 0, _pinned 0, _pinnedState jest, _contentAtISO jest', C: 'brak' },
    kliniczny: { A: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', B: 'karty P[v:20 w:21 x:25] | Kosz - | notatki -', C: 'karty P[x:25] | Kosz - | notatki -' },
  },
  'Poprawka na C bez wysłania, „Usuń pacjenta” na A, B zwraca kartę — C = N (poprawka zostaje)': {
    W1: { AB: [], BC: ['wersja P/v: tylko B', 'wersja P/w: tylko B'], CA: ['wersja P/v: tylko A', 'wersja P/w: tylko A'] },
    W4: { kliniczny: { A: 'karty P[v:33 w:21 x:25] | Kosz - | notatki -', B: 'karty P[v:33 w:21 x:25] | Kosz - | notatki -', C: 'karty P[v:33 w:21 x:25] | Kosz - | notatki -' }, obiegi: 2, ok: true, pary: { AB: [], BC: [], CA: [] } },
    fakty: { A: 'karta P, rev 1, _pinned 0, _pinnedState jest, _contentAtISO jest', B: 'karta P, rev 1, _pinned 0, _pinnedState jest, _contentAtISO jest', C: 'brak' },
    kliniczny: { A: 'karty P[v:33 w:21 x:25] | Kosz - | notatki -', B: 'karty P[v:33 w:21 x:25] | Kosz - | notatki -', C: 'karty P[x:25] | Kosz - | notatki -' },
  },
  // E3-PR0b2b: po E3-PR0b2b (zmierzone) — W1: C (starsza) zostaje przy cofnięciu, A i B mają „wykonane” (chwila
  // oznaczenia); pełna wymiana: „wykonane” wszędzie (C bierze rekord z późniejszą chwilą zapisu), różnica pary tylko w polach
  // chwili oznaczenia, których starsza aplikacja nie zna. Dotąd cofnięcie wygrywało wszędzie (najpierw rev, potem data).
  "„Wykonane” na B, potem cofnięcie na 276 (starsza aplikacja bez chwili oznaczenia)": {"W1": {"AB": [], "BC": ["pnote n: completedAtISO, contentAtISO, contentForISO, stateAtISO, stateForISO, updatedAtISO"], "CA": ["pnote n: completedAtISO, updatedAtISO, contentAtISO, contentForISO, stateAtISO, stateForISO"]}, "W4": {"kliniczny": {"A": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "B": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "C": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść"}, "obiegi": 2, "ok": true, "pary": {"AB": [], "BC": ["pnote n: stateAtISO, stateForISO [chwile notatki nieznane starszej aplikacji]"], "CA": ["pnote n: stateAtISO, stateForISO [chwile notatki nieznane starszej aplikacji]"]}}, "fakty": {"A": "wykonana (rev 3)", "B": "wykonana (rev 3)", "C": "otwarta (rev 3)"}, "kliniczny": {"A": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "B": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "C": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść"}},
  // E3-PR0b2b: po E3-PR0b2b (zmierzone) — W1: C (starsza) zostaje przy cofnięciu, A i B mają „wykonane” (chwila
  // oznaczenia); pełna wymiana: „wykonane” wszędzie (C bierze rekord z późniejszą chwilą zapisu), różnica pary tylko w polach
  // chwili oznaczenia, których starsza aplikacja nie zna. Dotąd cofnięcie wygrywało wszędzie (najpierw rev, potem data).
  "„Wykonane” na B, potem cofnięcie na 221 (starsza aplikacja bez chwili oznaczenia)": {"W1": {"AB": [], "BC": ["pnote n: completedAtISO, contentAtISO, contentForISO, stateAtISO, stateForISO, updatedAtISO"], "CA": ["pnote n: completedAtISO, updatedAtISO, contentAtISO, contentForISO, stateAtISO, stateForISO"]}, "W4": {"kliniczny": {"A": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "B": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "C": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść"}, "obiegi": 2, "ok": true, "pary": {"AB": [], "BC": ["pnote n: stateAtISO, stateForISO [chwile notatki nieznane starszej aplikacji]"], "CA": ["pnote n: stateAtISO, stateForISO [chwile notatki nieznane starszej aplikacji]"]}}, "fakty": {"A": "wykonana (rev 3)", "B": "wykonana (rev 3)", "C": "otwarta (rev 3)"}, "kliniczny": {"A": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "B": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść", "C": "karty P[v:20 w:21] | Kosz - | notatki n: Fikcyjna treść"}},
};
const P6F_WYR = {
  '„Usuń pacjenta” na 221, potem zmiana karty na A: notatka bez ratunku D-21': [
    'p6f W1: A notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W1: B notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W1: C notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W4: A notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W4: B notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W4: C notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
  ],
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw zdarzenia do C: notatka bez ratunku D-21': [
    'p6f W1: A notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W1: B notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W1: C notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W4: A notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W4: B notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
    'p6f W4: C notatka n utrata [notatka bez ratunku D-21 (starsza aplikacja)]',
  ],
  'Retencja na 221 po „Scal pacjentów”: jedyny stan wizyty przeniesionej (recentHours 0)': [
    'p6f W1: C wizyta v retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta v retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
  ],
  'Retencja na 221 z parametrami aplikacji: 8 wizyt z 8 dni sprzed 40–54 dni': [
    'p6f W1: C wizyta dz0 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz1 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz2 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz5 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz6 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz0 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz1 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz2 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz5 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz6 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
  ],
  'Retencja na 276 z parametrami aplikacji: nagrobek retencji idzie zdarzeniem': [
    'p6f W1: C wizyta dz0 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz1 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz2 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz5 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta dz6 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz0 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz1 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz2 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz5 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta dz6 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
  ],
  'Retencja na 276 po „Scal 5 → 4 → 3” na A': [
    'p6f W1: A wizyta g3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W1: A wizyta g4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W1: B wizyta g3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W1: B wizyta g4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W1: C wizyta c retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta g1 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta g3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W1: C wizyta g4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: A wizyta g3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W4: A wizyta g4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W4: B wizyta g3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W4: B wizyta g4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (odbiorca zachował głowę wizyty)]',
    'p6f W4: C wizyta c retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta g1 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta g3 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
    'p6f W4: C wizyta g4 retencja usunęła ostatni stan wizyty [retencja starszej aplikacji (urządzenie przycinające)]',
  ],
  'Gwiazdka na 221: „Odepnij i usuń”, potem „Przywróć”': [
    'p6f W1: A wizyta v gwiazdka [gwiazdka ze starszej aplikacji]',
    'p6f W1: B wizyta v gwiazdka [gwiazdka ze starszej aplikacji]',
    'p6f W1: C wizyta v gwiazdka [gwiazdka ze starszej aplikacji]',
    'p6f W4: A wizyta v gwiazdka [gwiazdka ze starszej aplikacji]',
    'p6f W4: B wizyta v gwiazdka [gwiazdka ze starszej aplikacji]',
    'p6f W4: C wizyta v gwiazdka [gwiazdka ze starszej aplikacji]',
  ],
  'Same bieżące urządzenia: Kosz w zwróconej starej karcie, potem „Usuń pacjenta” karty scalonej': [
    'p6f W1: A wizyta x wskrzeszenie [D-4 A (Kosz w zwróconej starej karcie)]',
    'p6f W1: B wizyta x wskrzeszenie [D-4 A (Kosz w zwróconej starej karcie)]',
    'p6f W1: C wizyta x wskrzeszenie [D-4 A (Kosz w zwróconej starej karcie)]',
    'p6f W4: A wizyta x wskrzeszenie [D-4 A (Kosz w zwróconej starej karcie)]',
    'p6f W4: B wizyta x wskrzeszenie [D-4 A (Kosz w zwróconej starej karcie)]',
    'p6f W4: C wizyta x wskrzeszenie [D-4 A (Kosz w zwróconej starej karcie)]',
  ],
  'Poprawka na 221 bez wysłania, „Usuń pacjenta” na A, B zwraca kartę: poprawka usunięta z kartą przed wysłaniem': [
    'p6f W1: A wizyta v treść [zmiana starszej aplikacji usunięta z kartą przed wysłaniem]',
    'p6f W1: B wizyta v treść [zmiana starszej aplikacji usunięta z kartą przed wysłaniem]',
    'p6f W1: C wizyta v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]',
    'p6f W1: C wizyta w utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]',
    'p6f W4: A wizyta v treść [zmiana starszej aplikacji usunięta z kartą przed wysłaniem]',
    'p6f W4: B wizyta v treść [zmiana starszej aplikacji usunięta z kartą przed wysłaniem]',
    'p6f W4: C wizyta v treść [zmiana starszej aplikacji usunięta z kartą przed wysłaniem]',
  ],
  'Poprawka na C bez wysłania, „Usuń pacjenta” na A, B zwraca kartę — C = N (poprawka zostaje)': [
    'p6f W1: C wizyta v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]',
    'p6f W1: C wizyta w utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]',
  ],
};
const P6F_ODSYL = {
  '„Usuń pacjenta” na 221, potem zmiana karty na A: notatka bez ratunku D-21': { literal: {}, wiersze: {} },
  '„Usuń pacjenta” na C, potem zmiana karty na A — C = N (notatka zostaje)': { literal: { 'zdarzenie|pnote|spoza|inne': { nowe: 0, wyk: 1 } }, wiersze: { 'zdarzenie:po2a': 1, 'zdarzenie:surowe': 1, 'zdarzenie:wyk': 1 } },
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw zdarzenia do C: notatka bez ratunku D-21': { literal: {}, wiersze: { 'blob221:po2a': 2, 'blob221:surowe': 2 } },
  '„Usuń pacjenta” na A, zmiana karty na 221 — najpierw pełna kopia C (notatka zostaje)': { literal: { 'blob221|pnote|w ładunku|inne': { nowe: 0, wyk: 1 }, 'zdarzenie|pnote|spoza|inne': { nowe: 0, wyk: 1 } }, wiersze: { 'blob221:po2a': 3, 'blob221:surowe': 3, 'blob221:wyk': 1, 'zdarzenie:po2a': 1, 'zdarzenie:surowe': 1, 'zdarzenie:wyk': 1 } },
  '„Usuń pacjenta” na A, zmiana karty na C — C = N, najpierw zdarzenia do C (notatka zostaje)': { literal: { 'zdarzenie|pnote|spoza|inne': { nowe: 0, wyk: 1 } }, wiersze: { 'zdarzenie:po2a': 1, 'zdarzenie:surowe': 1, 'zdarzenie:wyk': 1 } },
  'Kosz na 221: echo tożsamości wizyty u odbiorcy pełnej kopii i echo na klonach': { klony: { drugiRzad: 0, drugiRzad2a: 0, obiegi: [0, 0, 0, 0], ponadObiegi: 0, prob: 1, przezStarsza: { doInnych: 0, doNadawcy: 0, po2a: 1, prob: 1 } }, literal: {}, wiersze: { 'blob221:po2a': 2, 'blob221:surowe': 2 } },
  'Drugi rząd przez 221: wpis Kosza z gwiazdką z A do C (C z niewysłaną poprawką), pełna kopia C′ do A′': { klony: { drugiRzad: 0, drugiRzad2a: 0, obiegi: [1, 0, 0, 0], ponadObiegi: 0, prob: 1, przezStarsza: { doInnych: 0, doNadawcy: 1, po2a: 2, prob: 2, zapisow: 2 } }, literal: { 'blob221|stomb|w ładunku|inne': { nowe: 2, wyk: 2 }, 'zdarzenie|stomb|spoza|R4a': { nowe: 1, wyk: 1 }, 'zdarzenie|stomb|w ładunku|R4a': { nowe: 1, wyk: 1 } }, wiersze: { 'blob221:po2a': 2, 'blob221:surowe': 2, 'blob221:wyk': 2, 'zdarzenie:po2a': 2, 'zdarzenie:surowe': 2, 'zdarzenie:wyk': 2 } },
  'Retencja na 221 po „Scal pacjentów”: jedyny stan wizyty przeniesionej (recentHours 0)': { literal: {}, wiersze: {} },
  'Retencja po „Scal pacjentów” — C = N (bez strat)': { literal: {}, wiersze: {} },
  'Retencja na 221 z parametrami aplikacji: 8 wizyt z 8 dni sprzed 40–54 dni': { literal: {}, wiersze: {} },
  'Retencja na 276 z parametrami aplikacji: nagrobek retencji idzie zdarzeniem': { literal: {}, wiersze: {} },
  'Retencja na 276 po „Scal 5 → 4 → 3” na A': { literal: { 'zdarzenie|karta|w ładunku|nagłówek karty': { nowe: 4, wyk: 4 } }, wiersze: { 'zdarzenie276:po2a': 2, 'zdarzenie276:surowe': 2, 'zdarzenie:po2a': 4, 'zdarzenie:surowe': 4, 'zdarzenie:wyk': 4 } },
  'Gwiazdka na 221: „Odepnij i usuń”, potem „Przywróć”': { literal: { 'blob221|stomb|w ładunku|inne': { nowe: 2, wyk: 2 } }, wiersze: { 'blob221:po2a': 2, 'blob221:surowe': 2, 'blob221:wyk': 2 } },
  'Gwiazdka i odpięcie na 221 na wersji zapisanej na 221 (obie kopie bez W3): odbiorca bierze całą nowszą wersję': { literal: {}, wiersze: { 'blob221:po2a': 6, 'blob221:surowe': 6 } },
  '276: nowa wersja na C, A dopisuje tożsamość wizyty; echo na klonach': { klony: { drugiRzad: 0, drugiRzad2a: 0, obiegi: [0, 0, 0, 0], ponadObiegi: 0, prob: 1, przezStarsza: { doInnych: 0, doNadawcy: 0, po2a: 1, prob: 1 } }, literal: {}, wiersze: { 'zdarzenie276:po2a': 2, 'zdarzenie276:surowe': 2 } },
  'Same bieżące urządzenia: Kosz w zwróconej starej karcie, potem „Usuń pacjenta” karty scalonej': { literal: { 'zdarzenie|karta|w ładunku|nagłówek karty': { nowe: 1, wyk: 1 } }, wiersze: { 'zdarzenie:po2a': 1, 'zdarzenie:surowe': 3, 'zdarzenie:wyk': 1 } },
  'Przypięcie i odpięcie na 221 wersji z bieżącej aplikacji (odcisk zgodny z treścią): bieżąca aplikacja widzi odpięcie': { literal: {}, wiersze: {} },
  'Poprawka na 221 bez wysłania, „Usuń pacjenta” na A, B zwraca kartę: poprawka usunięta z kartą przed wysłaniem': { literal: {}, wiersze: {} },
  'Poprawka na C bez wysłania, „Usuń pacjenta” na A, B zwraca kartę — C = N (poprawka zostaje)': { literal: {}, wiersze: {} },
  "„Wykonane” na B, potem cofnięcie na 276 (starsza aplikacja bez chwili oznaczenia)": {"literal": {"zdarzenie276|pnote|w ładunku|inne": {"nowe": 0, "wyk": 1}, "zdarzenie|pnote|w ładunku|inne": {"nowe": 0, "wyk": 1}}, "wiersze": {"zdarzenie276:po2a": 1, "zdarzenie276:surowe": 1, "zdarzenie276:wyk": 1, "zdarzenie:po2a": 1, "zdarzenie:surowe": 1, "zdarzenie:wyk": 1}},
  "„Wykonane” na B, potem cofnięcie na 221 (starsza aplikacja bez chwili oznaczenia)": {"literal": {"blob221|pnote|w ładunku|inne": {"nowe": 1, "wyk": 1}, "zdarzenie|pnote|w ładunku|inne": {"nowe": 0, "wyk": 1}}, "wiersze": {"blob221:po2a": 1, "blob221:surowe": 1, "blob221:wyk": 1, "zdarzenie:po2a": 1, "zdarzenie:surowe": 1, "zdarzenie:wyk": 1}},
};
describe('A ≡ B, flota ze starszą aplikacją: scenariusze deterministyczne (literały: D par, stan kliniczny, W4, wyrocznia, licznik)', () => {
  d1();
  for (const [nr, [nazwa, sc]] of Object.entries(P6F).entries()) {
    it.skipIf(!sc.ci && !P6F_WSZYSTKIE)(`${sc.ci ? '' : '(ręcznie) '}${nazwa}`, async () => {
      const u = await p6fSwiat(nr, sc);
      const w = await p6fOcen(u, nazwa);
      const fakty = sc.fakty ? await sc.fakty(u) : {};
      const literal = sortuj({ ...w.literal, ...(sc.fakty ? { fakty } : {}) });
      const odsyl = p6fOdsyl(u.S, !!sc.echo);
      console.log(`E3-AB scenariusz floty ${nr} „${nazwa}”`, JSON.stringify({ literal, wyr: w.wyr, odsyl, przyklady: u.S.odsyl ? u.S.odsyl.podsumuj().klony.przyklady : null, dziennik: u.S.dziennik }));
      if (process.env.E2_AB_WYNIKI) appendFileSync(process.env.E2_AB_WYNIKI, JSON.stringify({ typ: 'p6f', nr, nazwa, app: sc.app, literal, wyr: w.wyr, odsyl, dziennik: u.S.dziennik }) + '\n');
      if (!sc.ci) return;
      expect.soft({ w4ok: w.w4ok, czerwone: w.czerwone }, `${nazwa}: W4 stabilne z różnicami dozwolonymi; wyrocznia bez naruszeń bez klasy`).toEqual({ w4ok: true, czerwone: [] });
      if (sc.wymog) expect.soft(await sc.wymog.fakt(u), `${nazwa}: ${sc.wymog.opis}`).toEqual(sc.wymog.oczekiwane);
      if (!P6F_DOMYSLNE) return;
      expect.soft(literal, `P6F_LITERALY[„${nazwa}”]`).toEqual(P6F_LITERALY[nazwa]);
      expect.soft(w.wyr, `P6F_WYR[„${nazwa}”]`).toEqual(P6F_WYR[nazwa] || []);
      expect.soft(odsyl, `P6F_ODSYL[„${nazwa}”]`).toEqual(P6F_ODSYL[nazwa]);
    }, 30_000);
  }
});


// ══ Znane usterki bieżącej aplikacji (ręcznie; dziś czerwone; E3-PR0b, E2_AB_ZNANE_USTERKI=1) ═══════════════════════
// Naruszenia wyroczni bez klasy, których mechanizm leży w bieżącej aplikacji (odtwarzają się na samych bieżących
// urządzeniach): bez klasy w tabeli wyjątków i bez literału; scenariusz deterministyczny jest dziś czerwony
// (oczekiwanie: w każdym świecie wyrocznia bez naruszeń bez klasy). Każdy przypadek w trzech światach z tymi samymi
// operacjami, każdy świat osobną asercją: 'W1' — po samych zdarzeniach (żywe urządzenia), 'W4' — te same zdarzenia,
// a po nich pełna wymiana na świeżych klonach (w4Trzy), 'bloby' — transport tylko pełną kopią (Y scala eksport X).
// Fakty (położenie i treść encji) — w komunikacie asercji i w druku. Światy swiat(880 + nr), Math.random z
// rng(0x6880 + nr), nr — jawne pole przypadku (sc.nr; numer świata się nie zmienia, gdy przypadek przechodzi do CI).
// Każdy przypadek ma pole naprawa (PR, który go naprawi; po naprawie przypadek staje się testem wejściowym tego PR):
// „Usuń pacjenta” duplikatu karty po „Scal pacjentów” — E3-PR0e (plan D-4, decyzja 4a; do tego czasu duplikat scalać
// ponownie). Notatka pacjenta zmieniona na dwóch urządzeniach (świat 880) — naprawiona w E3-PR0b2b
// (P-NOTATKA-POZNIEJSZA), przeniesiona do CI jako test wejściowy (blok niżej, NOTATKA_POZNIEJSZA).
const ZNANE_USTERKI_RECZNIE = process.env.E2_AB_ZNANE_USTERKI === '1';
// Transport świata: zdarzenia (dostawa z hakami; do i od 221 — kolejka przez applyEncryptedDelta i pełna kopia) albo
// same pełne kopie.
async function ddDo(u, X, Y) {
  if (u.tryb === 'bloby') return p6blob(X, Y);
  if (Y.app === 'S221') return dostawaDoStarszej(u.S, X, Y);
  if (X.app === 'S221') return scalBlob(u.S, X, Y);
  return dostawa(u.S, X, Y, { w2s: false });
}
async function ddSpoczynek(u) {
  if (u.tryb === 'bloby') return spoczynekBlobow(...p6fUrz(u));
  if (u.C.app === 'S221') return spoczynekFloty221(u.S, u.A, u.B, u.C);
  return spoczynekWszystkich(u.S, p6fUrz(u));
}
const ddNotatka = (u, U, tresc, krokMs = 60e3) => { krok(krokMs); return mutacja(u.S, U, `notatka „${tresc}”`, () => U.v.savePatientNote({ id: u.nId, patientId: u.P, title: 'Fikcyjna', body: tresc, category: 'inne' })); };
const ddTrescNotatki = (u) => Object.fromEntries(p6fUrz(u).map((U) => { const x = (U.stan.patientNotes || []).find((q) => q.id === u.nId); return [U.nazwa, x ? `${x.body} (rev ${x.rev})` : 'brak']; }));
const ddPolozenie = (u, sid) => Object.fromEntries(p6fUrz(u).map((U) => {
  const p = gdzie(U, sid);
  if (p) { const s = p.snapshots.find((q) => q.snapshotId === sid); return [U.nazwa, `karta ${etykieta(u.n, p.patientId)}, ${s.payload && s.payload.user ? s.payload.user.weight : '?'} kg`]; }
  return [U.nazwa, (U.stan.snapshotTombstones || []).some((e) => e.snapshotId === sid) ? 'wpis Kosza' : `brak${kartaW(U.stan, u.X) ? '' : ' (karta X usunięta)'}`];
}));
// „Usuń pacjenta” zwróconej starej karty po „Scal pacjentów”: A — karta Y (3; wizyta a) i karta X (5; wizyta v,
// 33,6 kg), B i C — bliźniaki. B scala X → Y; A bez wiedzy o scaleniu poprawia v w X na 41 kg — zwykła poprawka podnosi
// chwilę zapisu karty, więc X wraca (D-4 A: duplikat karty); C, który ma X z v od A, usuwa X („Usuń pacjenta”) razem
// z v. Mechanizm po stronie bieżącej aplikacji: „Usuń pacjenta” usuwa kartę razem ze wszystkimi jej wersjami (Bpu_usun,
// vilda_vault.js:9441), także duplikat zwrócony poprawką, której nie ma w karcie scalonej; wersja z ładunku pod kartą,
// gdy tutaj leży pod inną kartą, idzie według Bsw_decyzja (:3806). Wyrocznia: v (przez alias „Scal pacjentów” X → Y)
// ma żyć w Y z 41 kg — „Usuń pacjenta” X nie jest dla niej operacją na v (tests/support/ostatnia-zmiana.mjs:493,
// rozwiaz(alias) karty wizyty ≠ X). Wynik zależy od tego, co wie każde urządzenie, gdy dochodzi do niego nagrobek X
// (kolejnosc):
// - 'wszyscy' — A, B i C znają powrót X (v w X z 41 kg) przed usunięciem: v nie ma na żadnym urządzeniu w żadnym
//   świecie (W1, W4, bloby — „utrata”);
// - 'B bez powrotu' — B ma tylko swoje scalenie (v w Y z 33,6 kg), nagrobek X dochodzi do niego przed powrotem X od A:
//   W1 — „utrata” na A i C, B ma v w Y z 41 kg (nagrobek X wygrywa z powrotem X od A, a poprawka v przechodzi do Y,
//   gdzie B ma v — Bsw_decyzja); W4 — bez naruszeń (pełna wymiana roznosi v z B); bloby — v w Y z 33,6 kg na wszystkich
//   („treść”: poprawka zginęła);
// - 'C bez scalenia' — C dostaje scalenie od B dopiero po usunięciu: W1 — „utrata” na A i B, C ma v w Y z 33,6 kg
//   („treść”); W4 — v w Y z 33,6 kg na wszystkich („treść”); bloby — „utrata” na wszystkich.
// Zależnie od kolejności ginie więc wizyta (utrata) albo sama poprawka (wizyta zostaje w Y z 33,6 kg — „treść”).
// W losowej flocie 221 (profil pełny, ziarno 4, świat 300 004, bez delt; tam X — karta 5, Y — karta 3, C — sejf 221):
// W1 floty, krok 133 — „utrata” na A i C, a B ma v w X z 41 kg („inna karta” z klasą D-4 A, dozwolona; nagrobek C
// dochodzi do B dopiero pełną kopią); W4 floty, krok 133 — „utrata” na A, B i C; krok 142 — W1 jak w kroku 133, a W4:
// v w X (41 kg) na A, B i C — „inna karta” z klasą D-4 A (dozwolona), bez utraty, bo B zapisał w kroku 138 nową wersję
// X (później niż nagrobek C), więc X wraca z v na wszystkich urządzeniach (znów D-4 A).
async function ddDwieKarty(S, app = 'N') {
  const A = await urzadzenie(S, 'A');
  krok(); const r3 = await A.d.zapiszKarte(3, { masa: 30 });
  krok(); const r5 = await A.d.zapiszKarte(5, { masa: 33.6 });
  krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
  const { B, C } = await p6fUrzadzenia(S, A, app);
  S.stat.obiegiPonadLimit = [];
  return { A, B, C, Y: r3.patientId, X: r5.patientId, v: r5.snapshotId, n: new Map([[r3.patientId, 'Y'], [r5.patientId, 'X'], [r3.snapshotId, 'a'], [r5.snapshotId, 'v']]) };
}
function ddUsunZwrocona(kolejnosc, app = 'N') {
  return {
    baza: (S) => ddDwieKarty(S, app),
    kroki: async (u) => {
      const { S, A, B, C } = u;
      krok(60e3); await mutacja(S, B, 'Scal pacjentów 5 → 3', () => B.v.mergePatients(u.X, u.Y));
      krok(60e3);
      const s = (await A.v.getPatient(u.X)).snapshots.find((q) => q.snapshotId === u.v);
      await mutacja(S, A, 'poprawka 5/v 41 kg (bez wiedzy o scaleniu)', () => A.v.updateSnapshotPayload(u.X, u.v, { ...s.payload, user: { ...s.payload.user, weight: 41 } }, { preserveSavedAt: true }));
      krok(60e3);
      if (kolejnosc !== 'C bez scalenia') await ddDo(u, B, C);
      await ddDo(u, B, A); await ddDo(u, A, C);
      if (kolejnosc === 'wszyscy') await ddDo(u, A, B);
      u.przedUsun = ddPolozenie(u, u.v);
      krok(60e3); await mutacja(S, C, 'usuń pacjenta 5', () => C.v.removePatient(u.X));
      krok(60e3);
      if (kolejnosc === 'C bez scalenia') { await ddDo(u, A, B); await ddDo(u, C, A); await ddDo(u, B, C); await ddDo(u, C, B); } else { await ddDo(u, C, A); await ddDo(u, C, B); }
      await ddSpoczynek(u);
    },
    fakty: (u) => ({ przedUsun: u.przedUsun, koniec: ddPolozenie(u, u.v) }),
    naprawa: 'do naprawy w E3-PR0e (decyzja właściciela 4a)',
  };
}
// Notatka pacjenta zmieniona na dwóch urządzeniach (świat 880, nr 0) — od E3-PR0b2b test wejściowy w CI
// (NOTATKA_POZNIEJSZA niżej). Numery światów pozostałych przypadków bez zmian (881–884).
const ddNotatkaBaza = async (S) => {
  const A = await urzadzenie(S, 'A');
  krok(); const r = await A.d.zapiszKarte(1);
  krok(); const nId = (await A.v.savePatientNote({ patientId: r.patientId, title: 'Fikcyjna', body: 'Fikcyjna treść', category: 'inne' })).id;
  krok(); ustawStan(A, await eksport(A)); A.Q.length = 0;
  const { B, C } = await p6fUrzadzenia(S, A, 'N');
  return { A, B, C, P: r.patientId, nId, n: new Map([[r.patientId, 'P'], [nId, 'n']]) };
};
const ZNANE_USTERKI = {
  '„Usuń pacjenta” zwróconej starej karty po „Scal pacjentów” — wszyscy znają powrót karty przed usunięciem': { ...ddUsunZwrocona('wszyscy'), nr: 1 },
  '„Usuń pacjenta” zwróconej starej karty po „Scal pacjentów” — B zna tylko scalenie, nagrobek dochodzi do niego przed powrotem karty': { ...ddUsunZwrocona('B bez powrotu'), nr: 2 },
  '„Usuń pacjenta” zwróconej starej karty po „Scal pacjentów” — C dostaje scalenie dopiero po usunięciu': { ...ddUsunZwrocona('C bez scalenia'), nr: 3 },
  '„Usuń pacjenta” zwróconej starej karty po „Scal pacjentów” — B zna tylko scalenie; kontrola: C na 221 (ten sam wynik)': { ...ddUsunZwrocona('B bez powrotu', 'S221'), nr: 4 },
};
async function ddSwiat(sc, tryb) {
  const nr = sc.nr;
  if (!(Number.isInteger(nr) && nr >= 0 && nr < 20)) throw new Error(`znana usterka ${nr}: poza światami 880–899`);
  ustaw(START);
  const S = swiat(880 + nr);
  const los = rng(0x6880 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  S.w2s = false; S.nrKroku = 0; S.wyrSwiat = sc.wyrSwiat || 'znane usterki';
  // E3-PR0b2b: licznik odsyłania w świecie przypadku (sc.odsyl), np. zapis samego rev notatki.
  if (sc.odsyl && ODSYL) S.odsyl = nowyLicznik();
  const u = await sc.baza(S);
  u.S = S; u.tryb = tryb;
  await sc.kroki(u);
  for (const U of p6fUrz(u)) ustawStan(U, await eksport(U));
  S.wyrEtyk = (id) => etykieta(u.n, id);
  return u;
}
const ddNar = (lista) => lista.map((x) => `${x.swiat}: ${x.urz} ${x.encja} ${x.et} ${x.rodzaj} [${x.klasa || 'bez klasy'}] oczekiwane ${JSON.stringify(x.oczek)} fakt ${JSON.stringify(x.fakt)}`);
describe.skipIf(!ZNANE_USTERKI_RECZNIE)('A ≡ B, znane usterki bieżącej aplikacji (ręcznie; dziś czerwone): przyczyna po stronie bieżącej aplikacji, bez klasy i bez literału — do naprawy w kolejnych PR', () => {
  d1();
  for (const [nazwa, sc] of Object.entries(ZNANE_USTERKI)) {
    it(`${nazwa} — ${sc.naprawa}: wyrocznia bez naruszeń bez klasy po samych zdarzeniach (W1), po pełnej wymianie (W4) i przy samych pełnych kopiach (bloby)`, async () => {
      const u = await ddSwiat(sc, 'zdarzenia');
      const stare = p6fUrz(u).filter(starszaAplikacja).map((U) => U.nazwa);
      const W1 = wyrOcena(u.S, 'W1', nazwa, await wyrWidoki(u.S, { A: u.A, B: u.B, C: u.C }), { stare });
      const faktyW1 = await sc.fakty(u);
      const w = await w4Trzy(u.S, p6fUrz(u), u.n);
      const W4 = wyrOcena(u.S, 'W4', nazwa, w.wyr, { stare });
      delete w.wyr;
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
      const ub = await ddSwiat(sc, 'bloby');
      const bloby = wyrOcena(ub.S, 'bloby', nazwa, await wyrWidoki(ub.S, { A: ub.A, B: ub.B, C: ub.C }), { stare });
      const faktyBlobow = await sc.fakty(ub);
      const wynik = { W1: ddNar(W1), W4: ddNar(W4), bloby: ddNar(bloby), faktyW1, W4kliniczny: w.opis, faktyBlobow };
      console.log(`E3-AB znana usterka „${nazwa}” — ${sc.naprawa}`, JSON.stringify({ ...wynik, dziennik: u.S.dziennik }));
      if (process.env.E2_AB_WYNIKI) appendFileSync(process.env.E2_AB_WYNIKI, JSON.stringify({ typ: 'znana usterka', nr: sc.nr, nazwa, naprawa: sc.naprawa, ...wynik, dziennik: u.S.dziennik, dziennikBlobow: ub.S.dziennik }) + '\n');
      const opis = JSON.stringify({ faktyW1, W4kliniczny: w.opis, faktyBlobow }, null, 1);
      for (const [swiatN, lista] of [['W1', W1], ['W4', W4], ['bloby', bloby]]) expect.soft(ddNar(WYR.bezWyjatku(lista, swiatN)), `${nazwa} — ${sc.naprawa}, świat ${swiatN}\n${opis}`).toEqual([]);
    }, 60_000);
  }
});

// ══ Notatka pacjenta zmieniona na dwóch urządzeniach: zostaje zmiana późniejsza (E3-PR0b2b, P-NOTATKA-POZNIEJSZA) ════
// Test wejściowy E3-PR0b2b (dawniej ręczny blok znanych usterek, świat 880): A edytuje notatkę dwa razy (rev 3), B raz,
// 5 s później (rev 2). Dotąd reguła „najpierw rev” (Le, podgląd „Scal kopię konta”) zostawiała tekst A we wszystkich
// trzech światach; decyzja właściciela z 2026-11-16 (plan synchronizacji, rozdział 6): zostaje zmiana późniejsza (B),
// a rev po scaleniu to najwyższy z obu wersji (literał „rev 3” na B łapie brak zapisu samego rev). Te same trzy światy
// co w bloku znanych usterek (W1, W4, bloby) i ta sama wyrocznia; do tego literał faktów. Dwie kontrole (wynik ten sam
// przed zmianą i po niej): kolejność, w której obie reguły się zgadzają (B raz, A dwa razy później — wszędzie A, rev 3),
// i remis chwili (ta sama milisekunda zapisu na A i B — wyższy rev, A). Remis chwili sprawdza tylko literał faktów:
// wyrocznia porządkuje zmiany z tą samą chwilą kolejnością operacji w teście (B po A), a sejf — wyższym rev (dwie
// zmiany w tej samej milisekundzie to znane ograniczenie, jak w D-7). Licznik odsyłania w tych światach: zapis samego
// rev notatki (B zostawia swoją treść, a podnosi rev) nie jest echem warstwy po2a — 0 wierszy notatek (klasa „sam rev
// notatki”).
const ddFaktyNotatki = (u) => ({ fakty: ddTrescNotatki(u) });
const ddWszedzie = (v) => ({ A: v, B: v, C: v });
const NOTATKA_POZNIEJSZA = {
  'A dwa razy, B raz pięć sekund później: wszędzie zmiana B, rev 3': {
    nr: 0, odsyl: true, wyrSwiat: 'notatka później', baza: ddNotatkaBaza,
    kroki: async (u) => {
      await ddNotatka(u, u.A, 'Fikcyjna treść A1'); await ddNotatka(u, u.A, 'Fikcyjna treść A2');
      await ddNotatka(u, u.B, 'Fikcyjna treść B1 (później)', 5e3);
      krok(); await ddDo(u, u.A, u.B); await ddDo(u, u.B, u.A); await ddSpoczynek(u);
    },
    fakty: ddTrescNotatki,
    oczekiwane: { faktyW1: ddWszedzie('Fikcyjna treść B1 (później) (rev 3)'), W4kliniczny: ddWszedzie('karty P[#c2b9:22] | Kosz - | notatki n: Fikcyjna treść B1 (później)'), faktyBlobow: ddWszedzie('Fikcyjna treść B1 (później) (rev 3)') },
  },
  '[kontrola] B raz, A dwa razy później (obie reguły zgodne): wszędzie zmiana A, rev 3': {
    nr: 5, odsyl: true, wyrSwiat: 'notatka później', baza: ddNotatkaBaza,
    kroki: async (u) => {
      await ddNotatka(u, u.B, 'Fikcyjna treść B1');
      await ddNotatka(u, u.A, 'Fikcyjna treść A1 (później)', 5e3); await ddNotatka(u, u.A, 'Fikcyjna treść A2 (później)');
      krok(); await ddDo(u, u.A, u.B); await ddDo(u, u.B, u.A); await ddSpoczynek(u);
    },
    fakty: ddTrescNotatki,
    oczekiwane: null,
  },
  '[kontrola] remis chwili: A dwa razy, B raz w tej samej milisekundzie co druga zmiana A — wyższy rev (A)': {
    nr: 6, odsyl: true, wyrSwiat: 'notatka później', baza: ddNotatkaBaza,
    kroki: async (u) => {
      await ddNotatka(u, u.A, 'Fikcyjna treść A1'); await ddNotatka(u, u.A, 'Fikcyjna treść A2 (remis)');
      await ddNotatka(u, u.B, 'Fikcyjna treść B1 (remis)', 0);
      krok(); await ddDo(u, u.A, u.B); await ddDo(u, u.B, u.A); await ddSpoczynek(u);
    },
    fakty: ddTrescNotatki,
    bezWyroczni: true,
    oczekiwane: { faktyW1: ddWszedzie('Fikcyjna treść A2 (remis) (rev 3)'), W4kliniczny: ddWszedzie('karty P[#5788:22] | Kosz - | notatki n: Fikcyjna treść A2 (remis)'), faktyBlobow: ddWszedzie('Fikcyjna treść A2 (remis) (rev 3)') },
  },
};
describe('A ≡ B, notatka pacjenta zmieniona na dwóch urządzeniach — zostaje zmiana późniejsza (E3-PR0b2b, P-NOTATKA-POZNIEJSZA)', () => {
  d1();
  for (const [nazwa, sc] of Object.entries(NOTATKA_POZNIEJSZA)) {
    it(`${nazwa}: ${sc.bezWyroczni ? 'literał faktów (W1, W4, bloby)' : 'wyrocznia bez naruszeń bez klasy (W1, W4, bloby) i literał faktów'}`, async () => {
      const u = await ddSwiat(sc, 'zdarzenia');
      const W1 = wyrOcena(u.S, 'W1', nazwa, await wyrWidoki(u.S, { A: u.A, B: u.B, C: u.C }), { stare: [] });
      const faktyW1 = await sc.fakty(u);
      const odsyl2a = u.S.odsyl ? Object.keys(u.S.odsyl.podsumuj().literal2a).filter((k) => k.split('|')[1] === 'pnote') : null;
      const w = await w4Trzy(u.S, p6fUrz(u), u.n);
      const W4 = wyrOcena(u.S, 'W4', nazwa, w.wyr, { stare: [] });
      delete w.wyr;
      await sprzatnijUrzadzenia(); vi.restoreAllMocks();
      const ub = await ddSwiat(sc, 'bloby');
      const bloby = wyrOcena(ub.S, 'bloby', nazwa, await wyrWidoki(ub.S, { A: ub.A, B: ub.B, C: ub.C }), { stare: [] });
      const faktyBlobow = await sc.fakty(ub);
      const fakty = { faktyW1, W4kliniczny: w.opis, faktyBlobow };
      console.log(`E3-AB notatka później „${nazwa}”`, JSON.stringify({ W1: ddNar(W1), W4: ddNar(W4), bloby: ddNar(bloby), ...fakty, odsyl2a }));
      const opis = JSON.stringify(fakty, null, 1);
      if (!sc.bezWyroczni) for (const [swiatN, lista] of [['W1', W1], ['W4', W4], ['bloby', bloby]]) expect.soft(ddNar(WYR.bezWyjatku(lista, swiatN)), `${nazwa}, świat ${swiatN}\n${opis}`).toEqual([]);
      if (sc.oczekiwane) expect.soft(fakty, `${nazwa}: fakty`).toEqual(sc.oczekiwane);
      for (const k of ['A', 'B', 'C']) expect.soft(faktyW1[k], `${nazwa}: ta sama wersja na wszystkich urządzeniach (W1)`).toBe(faktyW1.A);
      if (odsyl2a) expect.soft(odsyl2a, `${nazwa}: licznik odsyłania — wiersze notatek w warstwie po2a`).toEqual([]);
    }, 60_000);
  }
});

// ══ Stres: echo jednego scalenia pełnej kopii w dużym świecie (E3-PR0b, P-ZBIEZNOSC-ZDARZEN; deterministyczny) ════════
// Najgorsze echo jednego scalenia: cała praca urządzenia starszej aplikacji dochodzi do bieżącego jedną pełną kopią, bez
// wcześniejszych delt i zdarzeń. Świat swiat(970 + nr), Math.random z rng(0x6970 + nr), nr — pozycja wariantu
// w STRES_WARIANTY_ZNANE.
// PRZYGOTOWANIE: C — bliźniak PUSTEGO A (wariant CI: sejf 221 z retencją v1); na A STRES_KART kart × 4 wersje (treść
//   uprzęży, co trzecia karta z gwiazdką na jednej wersji); B — bliźniak A z tymi kartami; dane do C pełną kopią A → C
//   (scalBlob, przed włączeniem licznika). Na C w każdej karcie: dwie najstarsze wersje do Kosza („Odepnij i usuń”),
//   poprawka najnowszej (33 kg, bez zmiany chwili zapisu) i nowa wersja — razem 2 × STRES_KART koszy, STRES_KART poprawek
//   i STRES_KART nowych wersji. Operacje na C i A wołane wprost na sejfie (stres nie ocenia wyroczni). Delt z C nie ma:
//   delta karty z ≥ 3 wersjami odpada progiem (PROG_DELT_221), a każda wcześniejsza dostawa zmniejszyłaby echo.
// SCALENIE: C → A (scalBlob; licznik — źródło blob221, blob276 albo blobN). Echo C → B: B jest bliźniakiem A, a eksporty
//   A i B przed scaleniem są równe (asercja), więc scalenie tego samego ładunku daje na B tę samą stronę. W wariancie CI
//   strona B to kopia strony A; ręcznie („C→A i C→B”) scalenie C → B idzie wprost (asercja: strona B = strona A).
//   Warianty z konfliktem (A zmienia później te same wizyty: gwiazdka najstarszej wersji, w co drugiej karcie poprawka
//   najnowszej) — scalenie C → B zawsze wprost, bez asercji równości.
// LICZNIK (jedna minuta slotu: strony A i B w tym samym kroku zegara): na urządzenie wiersze surowe, po2a (reguła
//   naiwna: kanon 2a bez reguły pola), wyk i nowe; klucze literału warstwy po2a i wyk; bajty i żądania reguły naiwnej
//   w uprzęży; bajty realne reguły naiwnej (LO.realne: 32–45 KiB na treść wizyty, 3 KiB bez treści) na urządzenie i na
//   slot, żądania na urządzenie przy górnej granicy; flagi „> 4 MiB” (LO.LIMITY.bajtowSlotMin).
// ASERCJE (każdy wariant): eksport A = eksport B przed scaleniem (bez konfliktu); budżet minuty slotu warstwy wyk
//   (LO.budzetSlotow: ≤ 600 wierszy, ≤ 4 MiB przy górnej granicy, ≤ 20 żądań na urządzenie) bez przekroczeń — przy
//   warstwie wyk równej po2a (bez reguły pola) minuta slotu ma 240 wierszy i 11 059 200 B, więc budżet czerwienieje;
//   obieg kontrolny (A → C, potem C → A) — 0 wierszy surowych; wyjątki builderów nośników 0; pola zawsze obecne
//   w ładunku od bieżącej wersji. Literał STRES_ODSYL — wariant CI przy 40 kartach, treści uprzęży i regule T
//   (STRES_DOMYSLNY).
// Ręcznie: E2_AB_STRES_WARIANTY=<lista po przecinku> (klucze STRES_WARIANTY_ZNANE), E2_AB_STRES_KART=<n>,
//   E2_AB_STRES_TRESC=<n> (wypełniacz: n pseudolosowych liter w treści każdej wersji, z osobnego generatora — bajty
//   uprzęży bliższe realnym), E2_AB_STRES=0 — bez bloku; E2_AB_WYNIKI — wiersz typ 'stres'.
const STRES = process.env.E2_AB_STRES !== '0';
const STRES_KART = Number(process.env.E2_AB_STRES_KART) || 40;
const STRES_TRESC = Number(process.env.E2_AB_STRES_TRESC) || 0;
const STRES_WARIANTY = (process.env.E2_AB_STRES_WARIANTY || 'C→A').split(',').map((s) => s.trim()).filter(Boolean);
const STRES_DOMYSLNY = STRES_KART === 40 && !STRES_TRESC && ODSYL_REGULA === 'T';
// app — sejf C; wprost — scalenie C → B wykonane (inaczej strona B z równości eksportów bliźniaków); konflikt — zmiany A.
const STRES_WARIANTY_ZNANE = Object.freeze({
  'C→A': Object.freeze({ app: 'S221', wprost: false, konflikt: false }),
  'C→A i C→B': Object.freeze({ app: 'S221', wprost: true, konflikt: false }),
  'C→A+konflikt': Object.freeze({ app: 'S221', wprost: true, konflikt: true }),
  '276→A': Object.freeze({ app: 'S276', wprost: false, konflikt: false }),
  'N→A': Object.freeze({ app: 'N', wprost: false, konflikt: false }),
  'N→A+konflikt': Object.freeze({ app: 'N', wprost: true, konflikt: true }),
});
const ZRODLO_PELNEJ = Object.freeze({ S221: 'blob221', S276: 'blob276', N: 'blobN' });
const literyFikcyjne = (los, n) => { let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode(97 + Math.floor(los() * 26)); return s; };
const wersjeOdNajstarszej = async (U, pid) => (await U.v.getPatient(pid)).snapshots.slice().sort((x, y) => ((x.savedAtISO || '') < (y.savedAtISO || '') ? -1 : 1));
// Literał stresu (wariant CI „C→A”: 40 kart, treść uprzęży, reguła T; zmierzony). naUrzadzenie — wiersze echa scalenia
// C → A na A według warstwy (surowe — każda różnica; po2a — reguła naiwna; wyk — warstwa wykonalna, czyli to, co bieżąca
// aplikacja musiałaby odesłać; nowe — wyk bez haków i przeglądu); klasyPo2a, klasyWyk — klucz źródło|rodzaj|w ładunku
// albo spoza|klasa → liczba wierszy tej warstwy (bez ścieżek pól i bez bajtów; 40 wersji nowych na C i 80 wpisów Kosza
// z C dostaje na A tożsamość wizyty, której 221 nie zapisuje — warstwa wyk tę różnicę tłumi); naiwnaUprzaz — wiersze,
// bajty kopert (eventBytes) i żądania reguły naiwnej na A w uprzęży; naiwnaRealne — bajty realne reguły naiwnej [dolna,
// górna] na urządzenie i na minutę slotu (A + B) oraz żądania na urządzenie przy górnej granicy; flagi — przekroczenie
// 4 MiB; wykSlot — minuta slotu warstwy wyk (wiersze, bajty realne przy górnej granicy, zgodność z budżetem);
// kontrolna — wiersze surowe obiegu kontrolnego. Zmiana reguły odsyłania (E3-PR0c, E3-PR0d) albo modelu stresu
// przepisuje ten literał.
const STRES_ODSYL = {
  'C→A': {
    naUrzadzenie: { surowe: 120, po2a: 120, wyk: 0, nowe: 0 },
    klasyPo2a: { 'snap|w ładunku|tożsamość wizyty': 40, 'stomb|w ładunku|tożsamość wizyty': 80 },
    klasyWyk: {},
    naiwnaUprzaz: { wierszy: 120, bajty: 208260, zadan: 1 },
    naiwnaRealne: { urzadzenie: [3932160, 5529600], slot: [7864320, 11059200], zadanNaUrzadzenieGorna: 6 },
    flagi: { 'urządzenie, dolna > 4 MiB': false, 'urządzenie, górna > 4 MiB': true, 'slot, dolna > 4 MiB': true },
    wykSlot: { wierszy: 0, realneDo: 0, zgodny: true },
    kontrolna: 0,
  },
};
const rozWierszy = (po, przed, zr) => Object.fromEntries(Object.entries(po).filter(([k]) => k.startsWith(zr + '|') || k.startsWith(zr + ':')).map(([k, v]) => [k, v - (przed[k] || 0)]).filter(([, v]) => v));
const warstwyStresu = (r, zr) => ({ surowe: r[`${zr}:surowe`] || 0, po2a: r[`${zr}:po2a`] || 0, wyk: r[`${zr}:wyk`] || 0, nowe: r[`${zr}:nowe`] || 0 });
const kluczeBezZrodla = (r, zr) => sortuj(Object.fromEntries(Object.entries(r).map(([k, v]) => [k.slice(zr.length + 1), v])));
const opisStrony = (s) => JSON.stringify([s.wiersze.map((w) => [w.tresci, w.bajty]).sort(), s.wiersze2a.map((w) => [w.tresci, w.bajty]).sort()]);
async function stres(wariant) {
  const wr = STRES_WARIANTY_ZNANE[wariant];
  if (!wr) throw new Error(`stres: nieznany wariant „${wariant}” (${Object.keys(STRES_WARIANTY_ZNANE).join(', ')})`);
  const nr = Object.keys(STRES_WARIANTY_ZNANE).indexOf(wariant);
  const t0 = performance.now();
  ustaw(START);
  const S = swiat(970 + nr);
  const los = rng(0x6970 + nr);
  vi.spyOn(Math, 'random').mockImplementation(() => (S.losAlt || los)());
  S.w2s = false; S.nrKroku = 0;
  const losTresci = rng(0x57E5 + nr);
  const glowa = (i, o) => (STRES_TRESC ? { ...naglowek(i, o), opisFikcyjny: literyFikcyjne(losTresci, STRES_TRESC) } : naglowek(i, o));
  const zapisz = (U, i, o, zapis = {}) => U.v.savePatient(glowa(i, o), { dedup: false, ...zapis });
  const A = await urzadzenie(S, 'A');
  const C = await urzadzenie(S, 'C', A, wr.app === 'N' ? {} : { app: wr.app });
  const karty = [];
  for (let i = 1; i <= STRES_KART; i += 1) {
    krok(); const r = await zapisz(A, i, { masa: 20 + i / 10 }); karty.push(r.patientId);
    for (let j = 1; j <= 3; j += 1) { krok(); await zapisz(A, i, { wzrost: 100 + j, masa: 20 + j }, { patientId: r.patientId, forceNewSnapshot: true }); }
    if (i % 3 === 0) { const p = await A.v.getPatient(r.patientId); krok(); await A.v.setSnapshotPinned(r.patientId, p.snapshots[1].snapshotId, true); }
  }
  ustawStan(A, await eksport(A)); A.Q.length = 0;
  const B = await urzadzenie(S, 'B', A);
  await scalBlob(S, A, C);
  const tBudowy = performance.now() - t0;
  S.odsyl = nowyLicznik();
  for (const [i, pid] of karty.entries()) {
    const sn = await wersjeOdNajstarszej(C, pid);
    for (const s of sn.slice(0, 2)) { krok(); await C.v.moveSnapshotToTrash(pid, s.snapshotId, { odepnij: true }); }
    const s = sn[sn.length - 1];
    krok(); await C.v.updateSnapshotPayload(pid, s.snapshotId, { ...s.payload, user: { ...s.payload.user, weight: 33 } }, { preserveSavedAt: true });
    krok(); await zapisz(C, i + 1, { wzrost: 140, masa: 30 }, { patientId: pid, forceNewSnapshot: true });
  }
  ustawStan(C, await eksport(C));
  if (wr.konflikt) {
    for (const [i, pid] of karty.entries()) {
      const sn = await wersjeOdNajstarszej(A, pid);
      krok(); await A.v.setSnapshotPinned(pid, sn[0].snapshotId, true);
      if (i % 2 === 0) { const s = sn[sn.length - 1]; krok(); await A.v.updateSnapshotPayload(pid, s.snapshotId, { ...s.payload, user: { ...s.payload.user, weight: 35 } }, { preserveSavedAt: true }); }
    }
    ustawStan(A, await eksport(A));
  }
  const rowneAB = JSON.stringify(kanon(A.stan)) === JSON.stringify(kanon(B.stan));
  krok(60e3);
  const L = S.odsyl, zr = ZRODLO_PELNEJ[wr.app];
  const stanL = () => ({ wiersze: { ...L.wiersze }, literal: { ...L.literal }, literal2a: { ...L.literal2a }, literalNowe: { ...L.literalNowe } });
  const p0 = stanL(), s0 = L.strony.length;
  const t1 = performance.now();
  await scalBlob(S, C, A);
  const pA = stanL();
  if (wr.wprost) await scalBlob(S, C, B);
  const tScalenia = performance.now() - t1;
  const pB = stanL();
  const naA = { wiersze: rozWierszy(pA.wiersze, p0.wiersze, zr), po2a: rozWierszy(pA.literal2a, p0.literal2a, zr), wyk: rozWierszy(pA.literal, p0.literal, zr), nowe: rozWierszy(pA.literalNowe, p0.literalNowe, zr) };
  const naB = wr.wprost ? { wiersze: rozWierszy(pB.wiersze, pA.wiersze, zr) } : null;
  const stronaA = L.strony[s0];
  const stronaB = wr.wprost ? L.strony[s0 + 1] : { ...stronaA, dev: 'B', opis: `${stronaA.opis} (strona B z równości eksportów A i B)` };
  if (!stronaA || !stronaB || stronaA.t !== stronaB.t) throw new Error('stres: brak stron scalenia C → A i C → B w jednej minucie slotu');
  const naiwna = (s) => ({ t: s.t, dev: s.dev, wiersze: s.wiersze2a });
  const budzet = LO.budzetSlotow([stronaA, stronaB]);
  const budzetNaiwny = LO.budzetSlotow([naiwna(stronaA), naiwna(stronaB)]);
  const reA = LO.realne(stronaA.wiersze2a);
  const slotN = budzetNaiwny.maksRealne, slotW = budzet.maksRealne;
  const MIB4 = LO.LIMITY.bajtowSlotMin;
  const bajtyA = stronaA.wiersze2a.map((w) => w.bajty);
  // obieg kontrolny: C scala pełną kopię A, potem A znów pełną kopię C — echo 0
  krok(60e3);
  const w1 = { ...L.wiersze };
  await scalBlob(S, A, C);
  await scalBlob(S, C, A);
  const kontrolna = Object.entries(L.wiersze).filter(([k]) => k.endsWith(':surowe')).reduce((n, [k, v]) => n + v - (w1[k] || 0), 0);
  const calosc = LO.budzetSlotow([...L.strony, ...(wr.wprost ? [] : [stronaB])]);
  const literal = sortuj({
    naUrzadzenie: warstwyStresu(naA.wiersze, zr),
    klasyPo2a: kluczeBezZrodla(naA.po2a, zr), klasyWyk: kluczeBezZrodla(naA.wyk, zr),
    naiwnaUprzaz: { wierszy: bajtyA.length, bajty: bajtyA.reduce((a, b) => a + b, 0), zadan: LO.partie(bajtyA).zadan },
    naiwnaRealne: { urzadzenie: [reA.od, reA.do], slot: [slotN.realneOd, slotN.realneDo], zadanNaUrzadzenieGorna: slotN.zadanMaks },
    flagi: { 'urządzenie, dolna > 4 MiB': reA.od > MIB4, 'urządzenie, górna > 4 MiB': reA.do > MIB4, 'slot, dolna > 4 MiB': slotN.realneOd > MIB4 },
    wykSlot: { wierszy: slotW.wierszy, realneDo: slotW.realneDo, zgodny: slotW.zgodny },
    kontrolna,
  });
  const zielen = {
    'eksport A = eksport B przed scaleniem (bliźniaki, bez konfliktu)': wr.konflikt || rowneAB,
    'budżet minuty slotu warstwy wyk przekroczony (≤ 600 wierszy, ≤ 4 MiB realnie, ≤ 20 żądań na urządzenie)': calosc.przekroczone.map((x) => `t ${x.t}: ${x.wierszy} wierszy, ${x.realneDo} B, ${x.zadanMaks} żądań`),
    'obieg kontrolny: wiersze surowe': kontrolna,
    'wyjątki builderów nośników': L.bladBuildera,
    'pola zawsze obecne: encje od bieżącej wersji bez pola': L.polaZawsze.bezPola,
    ...(wr.wprost && !wr.konflikt ? { 'strona C → B wprost = strona C → A': opisStrony(stronaB) === opisStrony(stronaA) } : {}),
  };
  const o = L.podsumuj();
  return { wariant, kart: STRES_KART, tresc: STRES_TRESC, literal, zielen, naB: naB && warstwyStresu(naB.wiersze, zr), koszC: (C.stan.snapshotTombstones || []).length,
    blobBajty: JSON.stringify(await C.v.exportSyncPayload()).length, tlumi: o.tlumi, przyklady: o.przyklady.slice(0, 6), budzetNaiwny: { slot: slotN, urz: slotN.urz },
    ms: { budowa: Math.round(tBudowy), scalenie: Math.round(tScalenia), licznik: o.ms, razem: Math.round(performance.now() - t0) } };
}
const ZIELEN_STRESU = (wr) => ({
  'eksport A = eksport B przed scaleniem (bliźniaki, bez konfliktu)': true,
  'budżet minuty slotu warstwy wyk przekroczony (≤ 600 wierszy, ≤ 4 MiB realnie, ≤ 20 żądań na urządzenie)': [],
  'obieg kontrolny: wiersze surowe': 0,
  'wyjątki builderów nośników': 0,
  'pola zawsze obecne: encje od bieżącej wersji bez pola': 0,
  ...(wr.wprost && !wr.konflikt ? { 'strona C → B wprost = strona C → A': true } : {}),
});
describe.skipIf(!STRES || !ODSYL)('A ≡ B, flota ze starszą aplikacją: stres — echo jednego scalenia pełnej kopii w dużym świecie (budżet minuty slotu, literał STRES_ODSYL)', () => {
  d1();
  for (const wariant of STRES_WARIANTY) {
    it(`${wariant}, ${STRES_KART} kart${STRES_TRESC ? `, wypełniacz ${STRES_TRESC} liter` : ''}: eksport A = eksport B, budżet minuty slotu warstwy wyk, obieg kontrolny 0${STRES_DOMYSLNY && STRES_ODSYL[wariant] ? '; literał STRES_ODSYL' : ''}`, async () => {
      const w = await stres(wariant);
      console.log(`E3-AB stres ${wariant}`, JSON.stringify(w));
      if (process.env.E2_AB_WYNIKI) appendFileSync(process.env.E2_AB_WYNIKI, JSON.stringify({ typ: 'stres', regula: ODSYL_REGULA, ...w }) + '\n');
      expect.soft(w.zielen, `stres ${wariant}\n${JSON.stringify({ przyklady: w.przyklady, literal: w.literal }, null, 1)}`).toEqual(ZIELEN_STRESU(STRES_WARIANTY_ZNANE[wariant]));
      if (STRES_DOMYSLNY && STRES_ODSYL[wariant]) expect.soft(w.literal, `STRES_ODSYL[„${wariant}”]`).toEqual(STRES_ODSYL[wariant]);
    }, 60_000);
  }
});
