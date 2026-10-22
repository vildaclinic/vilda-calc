# AMH — informacja o grupie LiLACS 80–90 lat

Stan: 22 października 2026. Właściciel zaakceptował audyt i
[makietę desktopową/mobilną](https://vilda-amh-lilacs-makieta.maciej-flader.chatgpt.site),
a następnie polecił implementację. Zakres zgody obejmuje krótką kartę
informacji źródłowej, bez liczbowego porównania z wynikiem pacjenta.
Nie ustanawia zgodności metod ani walidacji klinicznej.

## Źródło i opublikowana statystyka

Chong YH i wsp. *Elderly Men Have Low Levels of Anti-Müllerian Hormone
and Inhibin B, but with High Interpersonal Variation: A Cross-Sectional
Study of the Sertoli Cell Hormones in 615 Community-Dwelling Men.*
PLOS ONE 2013;8:e70967,
[DOI 10.1371/journal.pone.0070967](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0070967),
**tabela 1, kolumna LiLACS**:

| Wielkość źródłowa | Wartość |
|---|---|
| Analizowana grupa mężczyzn | N=257 |
| Opublikowany zakres wieku | 80–90 lat |
| Średni wiek | 84,3 roku |
| Mediana AMH całej grupy | **12,1 pmol/L** |
| Średnia arytmetyczna AMH / SD | 14,4 / 14,0 pmol/L; nie są medianą |
| Materiał | Surowica |

Pełne XML, HTML, PDF, oryginalny TIFF tabeli i jej XLS zgodnie podają
12,1 pmol/L. Obejrzano pięć rycin głównych i oba suplementy. Wśród
podlinkowanych zasobów nie znaleziono wyników indywidualnych ani modelu
median dla poszczególnych lat. Fig. 1B dotyczy Otago i pokazuje średnie
geometryczne z 95% CI; nie wolno odczytywać z niej P50 LiLACS.

Kohorta LiLACS NZ obejmuje Māori 80–90 lat oraz non-Māori w wieku 85 lat
z Nowej Zelandii, o zróżnicowanym zdrowiu i sprawności. To nie jest próba
wyłącznie zdrowych mężczyzn ani równomierna reprezentacja każdego roku
wieku. N=257 dotyczy analizowanej grupy, nie każdego rocznika ani osobno
potwierdzonego N jednej metody. Protokół rekrutacji
[Hayman 2012, DOI 10.1186/1471-2318-12-33](https://link.springer.com/article/10.1186/1471-2318-12-33)
wyjaśnia roczniki włączenia, ale nie rozstrzyga precyzji wieku w dniu pobrania.

## Oznaczenia i nierozstrzygnięte ograniczenia

- W całym badaniu opisano 575 oznaczeń Beckman Coulter AMH/MIS **A16507**
  i 40 DSL-10-14400. Nie podano jawnego przydziału zestawów do LiLACS.
  A16507 jest historycznym Immunotech/IOT, a nie Gen II A79765.
  Wspólna marka nie dowodzi zgodności z Gen II, Access lub Elecsys.
- Deklaracja autorów o podobnych wynikach dwóch zestawów nie dostarcza
  kalibracji próbki pacjenta. Nie ustalono harmonizacji metod ani
  równoważności surowicy i osocza. Informacja o publikacji może pozostać
  widoczna przy znanej innej metodzie lub materiale pacjenta; nie staje
  się przez to dobranym do niego odniesieniem.
- Podano czułość analityczną 1 pmol/L dla A16507 i 0,04 pmol/L dla DSL,
  bez oddzielnie zdefiniowanego LLOQ/LOQ. Nie opisano odsetka wyników
  niewykrywalnych LiLACS ani reguły ich podstawiania lub wykluczania.
  Zdanie o 5% niewykrywalnych wyników występuje w kontekście Otago,
  bez jednoznacznego mianownika; nie przypisujemy go 257 uczestnikom LiLACS.
  Dolny centyl 0 nie jest dowodem biologicznych zer lub użycia LOD/2.
- Zachowano rozbieżności źródła: 493/496 starszych mężczyzn,
  119/106 młodszych Otago i niespójne opisy wieku starszej grupy Otago
  w podpisach rycin. Nie rekonstruujemy brakujących 13 uczestników.
  [Sprostowanie z 11.10.2013](https://doi.org/10.1371/annotation/d6097df2-37ed-4561-8885-f54dcaa3aeb6)
  poprawia nazwisko autora, nie te liczby lub oznaczenia.
- Wynik przekrojowy całej grupy nie opisuje trajektorii starzenia jednej
  osoby ani ryzyka choroby, płodności lub funkcji jąder konkretnego pacjenta.

Fakty, ograniczenia i hashe oryginalnych artefaktów zapisano w
[ekstrakcie audytu](evidence/amh-lilacs-source-audit-2026-10-22.json).
Nie „naprawiono” niejasności publikacji; są granicą zastosowania karty.

## Kontrakt prezentacji

Krótka karta pod wykresem AMH podaje:

> AMH — badanie mężczyzn 80–90 lat
>
> Mediana badanej grupy: 12,1 pmol/L (około 1,7 ng/mL)
>
> LiLACS NZ · 257 mężczyzn
>
> Dane historyczne; nie jest to norma ani mediana dokładnego wieku.

Rozwinięcie „Źródło i ograniczenia” pokazuje populację, dawne oznaczenia
i nierozstrzygnięte kwestie. Wartość 12,1 pozostaje źródłowym pmol/L.
Istniejący konwerter AMH stosuje `1 pmol/L = 0.1401 ng/mL`, co daje
`12.1 × 0.1401 = 1.69521 ng/mL`, prezentowane jako **około 1,7 ng/mL**.
Przybliżenie autora przez dzielenie przez 7,14 daje nieco inny wynik
na drugim miejscu dziesiętnym; nie zmieniamy współczynnika aplikacji.
Nie jest to kalibracja metod.

Karta wymaga aktywnego AMH, mężczyzny, poprawnie wpisanego wyniku i gotowego
kontekstu tej samej aktualnej osoby. Wiek i płeć bierze z formularza
głównego; nie wymaga nowych pytań. Prawidłowo wpisana nierówność wyniku,
w tym wynik raportowany poniżej LOD/LOQ, nie musi ukrywać informacji
o publikacji, lecz nie staje się dokładnym punktem ani wartością zero,
LOD/2 lub LOQ/2. Niepoprawny/pusty wynik, zmiana pacjenta, płci lub analitu,
blokada vaulta i przygotowywanie/odtwarzanie kontekstu usuwają kartę.
Karta jest dostępna w widoku „Całe życie” przy zaznaczonym AMH.
Przełączenie okresu, odznaczenie AMH lub porównanie płci ją ukrywa,
także po zmianie tych ustawień w pełnym ekranie i powrocie do konwertera.

**Cały możliwy wiek musi mieścić się w `[80,90]`.** Nie wybieramy środka
przedziału ani nie zawężamy niepewności. To konserwatywna polityka
aplikacji, nie odtworzona precyzja granic u autorów.

| Wiek kontekstu | Karta |
|---|---|
| Dokładne 80, 85 lub 90 lat | Tak |
| Ukończone 85 lat, `[85,86)` | Tak |
| Ukończone 89 lat 11 miesięcy, `[89+11/12,90)` | Tak |
| Ukończone 90 lat, `[90,91)` | Nie |
| 90 lat 0 miesięcy, `[90,90+1/12)` | Nie |
| Przedział przecinający 80 lub 90 | Nie |
| Wiek 75 albo >90 | Nie |

## Odrębność od wyniku, wykresu i zapisu

[`amh-lilacs-source-data.json`](amh-lilacs-source-data.json), eksportowany
jako `amhLilacsSourceData`, jest informacją o publikacji poza rejestrem
**85 profili**. Wersja zwykłych danych odniesień pozostaje
**`2026-10-22.2`**. Nie dodajemy profilu P50 po 70 latach i nie rozciągamy
Tehrani. Zwykła luka >70, w tym >70–<80 i brak median dokładnego wieku
80–90, pozostaje. Nie ekstrapolujemy poza LiLACS ani nie interpolujemy
między rocznikami. Geometria, skale, porównania płci i normy laboratoryjne
zachowują dotychczasowe działanie.

Karta nie tworzy punktu pacjenta lub odniesienia, łącznika, ilorazu,
oceny „poniżej mediany”, RI, percentyla, SDS ani diagnozy. Nie wchodzi
do `lab.hormoneReference`, nie dopisuje nowej mediany do wizyty i nie
przelicza historii. Dotychczasowy powód braku zwykłego odniesienia po 70
pozostaje w zapisie; obecność karty nie znosi żadnej blokady punktu.

Przypadek syntetyczny: **M85, AMH 8 pmol/L** → duży wynik istniejącego
przelicznika **około 1,12 ng/mL** oraz karta grupy **12,1 pmol/L,
około 1,7 ng/mL**. Nie powstaje punkt ani migawka odniesienia LiLACS;
nie wyliczamy ilorazu tych liczb. Zmiana wyniku na prawidłową nierówność
zachowuje nierówność, a źródłowa mediana pozostaje ta sama.

Regresje produkcyjnego widoku obejmują granice wieku i jego niepewność,
jednostki/operator wyniku, zmianę osoby/płci/analitu, blokady kontekstu,
brak nowego profilu, punktu i zapisu oraz niezmienione zwykłe odniesienia.
Kontrole desktopu, 320 px, pełnego ekranu, PWA/aktualizacji/offline i CI
należy raportować dla konkretnego SHA w PR. Ten dokument opisuje kontrakt,
nie stwierdza wykonania tych kontroli ani walidacji klinicznej.
