# Import i eksport pojedynczego szablonu planu opieki

Decyzja właściciela z 2026-11-09: lekarz może przekazać innemu lekarzowi **jeden wybrany szablon**. Interfejs nie oferuje eksportu ani importu całej biblioteki. Biblioteka jest nadal prywatnym, zaszyfrowanym magazynem konta; przenośny plik jest odrębnym dokumentem przeznaczonym do świadomego udostępnienia.

## Przebieg

Eksport zaczyna się przy konkretnym szablonie. Do pliku `.vilda-template.json` trafia jego bieżąca, jednoznacznie wybrana treść, wraz z informacjami o autorstwie, źródłach i zasadach udostępniania. Historia konta i wcześniejsze wersje nie są częścią pliku. Przed eksportem lekarz sprawdza widoczne teksty i potwierdza, że może je udostępnić. Eksport nie anonimizuje treści wpisanej ręcznie: nazwisko pacjenta umieszczone w nazwie kroku jest zwykłym tekstem i wymaga usunięcia przez autora.

„Importuj szablon” w „Moich szablonach” odczytuje i sprawdza plik, a następnie pokazuje podgląd treści, autora, źródeł i warunków udostępniania. Dopiero zatwierdzenie zapisuje nowy, niezależny szablon przez zwykłą ścieżkę zapisu biblioteki. Identyfikatory szablonu, etapów, kroków, wersji i operacji są nowe. Informacja o pochodzeniu opracowania pozostaje zachowana.

Anulowanie podglądu, błędny plik, przekroczenie limitu lub nieobsługiwana wersja nie zmieniają biblioteki. Powtórny import nie nadpisuje lokalnej kopii. Rozpoznany duplikat wymaga jawnej decyzji o utworzeniu kolejnej kopii. Import ani późniejsza edycja szablonu nie zmieniają istniejących planów pacjentów.

Plik nie przenosi dokumentacji pacjenta, wyników, faktów planu, identyfikatorów konta, kluczy, oczekujących operacji synchronizacji ani prywatnej historii biblioteki. Do przekazania szablonu nie udostępnia się kodu synchronizacji ani materiału odzyskiwania konta. Dawny zaszyfrowany plik całej biblioteki `.vctlib` nie jest przenośnym szablonem i nie jest akceptowany jako pojedynczy szablon.

## Autorstwo, źródła i warunki udostępniania

Autorstwo i warunki udostępniania należą do zapisanej, wersjonowanej definicji szablonu. Muszą przetrwać zapis, synchronizację, edycję, duplikowanie, zastosowanie u pacjenta i ponowny eksport. Nie wystarczy umieścić ich w zewnętrznej kopercie pliku ani w polu celu planu.

Pierwotne autorstwo nie jest automatycznie zastępowane nazwiskiem importującego lekarza. Dostosowanie cudzej treści zachowuje jej autora, źródła i obowiązujące warunki; późniejsze opracowanie jest oznaczane jako zmiana. Aplikacja nie nadaje użytkownikowi praw do cudzych materiałów i nie rozszerza uprawnień przy kopiowaniu.

Nie ma automatycznej zgody na dowolne udostępnianie. Autor wskazuje warunki przed eksportem i potwierdza prawo do rozpowszechniania treści. Wybór standardowej licencji jest świadomy; przykładowo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pl) dopuszcza także wykorzystanie komercyjne. Samo utworzenie szablonu nie oznacza wybrania tej licencji. Warunki własne muszą być przedstawione odbiorcy razem z treścią.

Oryginalne opracowanie szablonu jest odróżniane od źródłowego programu terapeutycznego, urzędowego formularza i informacji medycznych. Autor lokalnego schematu nie jest przedstawiany jako autor tych źródeł. Zapis źródła i wersji dokumentu nie zastępuje uprawnienia do kopiowania jego chronionych fragmentów.

Wskazanie autora pochodzi z deklaracji zapisanej w pliku. Nie stanowi potwierdzenia jego tożsamości ani akceptacji klinicznej szablonu przez Vilda. Skrót treści służy kontroli integralności, a nie uwierzytelnieniu autora. Przenośny plik nie stanowi zabezpieczenia DRM przed celowym usunięciem informacji o prawach.

## Wersje i zgodność

Obsługa metadanych opracowania nie zmienia historycznej kanonizacji istniejących definicji. Dawne wersje, ich skróty i operacje pozostają czytelne. Nieobsługiwana nowa definicja nie może być zamieniona na pustą ani zapisana bez informacji o autorstwie.

Starszy klient może nie umieć odczytać nowej wersji definicji. Aktualizacja musi zachowywać jego dane i wyjaśniać konieczność odświeżenia aplikacji; nie wolno udawać pustej biblioteki ani pozornie udanej synchronizacji. Wdrożenie nie wymaga ponownego przygotowywania całej dokumentacji ani przekazywania kluczy między lekarzami.

## Zakres kopii zapasowej i zapisane zadanie

**Obecna kopia `.wiw` nie obejmuje biblioteki szablonów.** Plik pojedynczego szablonu zachowuje bieżące opracowanie, lecz nie jest kopią całej biblioteki, jej historii, konfliktów lub oczekujących operacji. Synchronizacja również nie jest zastępczą kopią zapasową.

Właściciel polecił uwzględnić bibliotekę w przyszłej kopii `.wiw`. Trwałe zadanie i warunki odbioru są zapisane jako [P-WIW-TEMPLATE-LIBRARY — biblioteka szablonów w kopii `.wiw`](TEMPLATE_LIBRARY_BACKUP_PLAN.md). Ta zmiana nie jest częścią importu/eksportu pojedynczego szablonu.

## Kolejność wdrożenia

Pierwszy PR funkcjonalny dostarcza kompletny przebieg pojedynczego importu i eksportu, trwałe metadane opracowania, wycofanie publicznego importu/eksportu całej biblioteki oraz zgodne komunikaty o zakresie kopii. Zmiany czytelnych źródeł generowanego modułu danych wymagają powiązanego PR w repozytorium źródłowym.

Drugi PR funkcjonalny dostarcza pierwszy plik SGA/IUGR, z najwyżej dziesięcioma krokami, wskazanym źródłem i wersją programu. Przed udostępnieniem treść wymaga akceptacji klinicznej właściciela oraz świadomego ustalenia autorstwa i zasad udostępniania. Wysłanie wniosku nie może oznaczać decyzji kwalifikacyjnej, a pojedynczy otrzymany wynik nie zamyka grupy badań. Funkcja transferu nie oznacza automatycznej akceptacji medycznej importowanych treści.

Katalog publiczny, marketplace, płatności, weryfikacja wydawców i automatyczne aktualizowanie cudzych szablonów pozostają poza tym wdrożeniem. Przyszły katalog może korzystać z tego samego przenośnego dokumentu bez zmiany zasad niezależnej kopii i zachowania praw.

## Warunki odbioru

- Dwa fikcyjne konta o różnych kluczach mogą przekazać jeden szablon bez udostępniania kluczy konta.
- Import, edycja, kopia, zastosowanie u fikcyjnego pacjenta i ponowny eksport zachowują autorstwo, źródła, warunki i pochodzenie opracowania.
- Anulowanie, zły format, zbyt duży plik, nieznana wersja i błąd integralności nie zapisują części szablonu ani nie zmieniają istniejącego planu.
- Rozpoznany duplikat i ponowienie nie nadpisują innego szablonu ani nie tworzą kopii po cichu.
- Zapis i synchronizacja zachowują stare definicje i historię; nieobsługiwany klient nie usuwa nowych danych.
- Podgląd i potwierdzenie działają na desktopie i telefonie, a import/eksport korzystają z zasobów dostępnych po zimnym uruchomieniu offline.
