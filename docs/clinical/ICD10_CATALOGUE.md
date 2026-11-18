# Katalog ICD-10 PL — przypięta wersja CeZ

Katalog do wyszukiwania rozpoznań wykorzystuje polski zbiór Centrum e-Zdrowia,
**stan na 31.03.2021**, `ICD-10-2008-PL`, wersja XML `7`, z kodami COVID.
Zawiera **12 010** różnych kodów kategorii i podkategorii. Jest to wersja
historyczna, której data pozostaje częścią metadanych i interfejsu.

Nie zmienia wzorów, progów ani interpretacji kalkulatorów. Dodaje wybór kodu
ze źródła do dokumentacji. Ograniczenia katalogu nie odbierają lekarzowi
możliwości ręcznego wpisu rozpoznania. Status: zweryfikowane technicznie;
akceptację kliniczną zakresu określa właściciel.

## Źródło i licencja

- Wydawca: Centrum e-Zdrowia, [Rejestr Systemów Kodowania, zasób 55725](https://dane.gov.pl/pl/dataset/27/resource/55725).
- [Oficjalny XML](https://api.dane.gov.pl/media/resources/20240319/ICD10_PL_en_covid_2021_03_31_2.xml): 12 713 248 bajtów; SHA256 `88a0c4ed4e4987d3cdc57f0a534a6c80506d757f197c39c1c22fa3a1ebdba099`.
- Stan danych: 31.03.2021; udostępnienie tego zasobu: 19.03.2024; pozyskanie: 18.11.2026. Data przesłania pliku nie jest datą danych.
- [Metadane zbioru](https://api.dane.gov.pl/datasets/27) jawnie wskazują `license_name: CC BY 4.0`, `license_condition_default_cc40: true` oraz `license_condition_timestamp: true`.
- Stosujemy [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) z podaniem wydawcy, źródła, dat i opisu przetworzenia. Starsze pole `license_description` zawiera „Other (Public Domain)”; nie stanowi ono podstawy do pominięcia jawnych warunków CC BY 4.0.

Kopie pierwotnych odpowiedzi API i pełnego źródła znajdują się w
[`tools/icd10-pl-source/`](../../tools/icd10-pl-source/README.md).
[Strona redakcyjna polskiego tomu I](https://ezdrowie.gov.pl/pobierz/icd_10_tom_i),
s. ii, opisuje przyznanie CSIOZ praw do wydania polskiego przekładu oraz
© CSIOZ 2012 i © WHO 2009 dla oryginału. Sama ta informacja nie jest licencją
redystrybucji; jawną zgodę na ponowne użycie przypiętego zbioru stanowią
warunki CeZ w metadanych.

[Polityka WHO](https://www.who.int/about/policies/publishing/copyright),
sekcja „Licensing of WHO Classifications”, dopuszcza użycie klasyfikacji ICD
także komercyjnie, z zachowaniem kodów i oznaczeniem źródła, na CC BY-ND 3.0
IGO; prawa do tłumaczeń są odrębne. Nie należy przenosić ogólnej polityki
niekomercyjnych publikacji WHO na ten osobny ustęp dotyczący klasyfikacji.
W tym wydaniu korzystamy z jawnej licencji polskiego zbioru CeZ, zachowując
źródłowe nazwy i oznaczenia. [Nota dystrybucyjna](../../runtime/icd10-pl-v1/NOTICE.txt)
podaje wymagane oznaczenia. Nie deklarujemy poparcia WHO, CeZ ani CSIOZ.

## Granica źródło–artefakt

Generator [`tools/build-icd10-pl.py`](../../tools/build-icd10-pl.py) używa tylko
biblioteki standardowej Pythona, nie sieci. Sprawdza rozmiary i SHA256 archiwum
oraz rozpakowanego XML. Źródłowe archiwum gzip ma `mtime=0`, 606 817 bajtów
i SHA256 `39ecb2cb69d0a170972bf68485d516201c25610e8d5767de362e32e1cb293a3b`.
Źródło pozostaje w narzędziach; aplikacja ładuje wyłącznie czytelny artefakt JS.

```bash
python3 tools/build-icd10-pl.py
python3 tools/build-icd10-pl.py --check
```

Wynikiem są [`vilda_icd10_pl_data.js`](../../vilda_icd10_pl_data.js) i
[`runtime/icd10-pl-v1/manifest.json`](../../runtime/icd10-pl-v1/manifest.json).
Manifest zawiera hash i rozmiar JS, dowody licencji, wersję źródła i liczności
transformacji. Wyjście nie zależy od daty uruchomienia, katalogu docelowego
ani dostępu do sieci.

Kontrakt globalny:

```javascript
window.VildaICD10PLData = {
  metadata: { id: 'cez-icd10-pl-2021-03-31-v1', editionDate: '2021-03-31', /* pochodzenie */ },
  entries: [
    ['E10', 'Cukrzyca insulinozależna', null],
    ['E10.2†', 'Z powikłaniami nerkowymi', 'E10']
  ]
};
```

Każda trójka zawiera rozwiązany kod z zachowanym `†` lub `*`, dokładną nazwę
źródłową i bazowy trzyznakowy kod kategorii nadrzędnej albo `null` dla kategorii.
Rodzica można odnaleźć po kodzie bazowym także wtedy, gdy jego własny wpis
zawiera znak klasyfikacyjny. Trójki są posortowane według pełnego kodu.
Nazwy nie są poprawiane ani skracane; indeks wyszukiwania może osobno usuwać
akcenty i wielkość liter. Nie dodajemy synonimów ani indeksu wyłączeń.

## Deterministyczne przetwarzanie drzewa

Źródło zawiera 23 975 węzłów: 11 104 bez kodu, 290 zakresów rozdziałów/grup,
11 027 bezwzględnych kodów, 989 względnych końcówek i 565 dodatkowych podziałów.
Generator wykonuje następujące kroki:

1. Rozwija 989 końcówek, np. `.2†` pod `E10` daje `E10.2†`, według rzeczywistej struktury XML.
2. W sześciu przypadkach `B99`, `C50`, `C97`, `F99`, `N99`, `T79` usuwa zduplikowany zewnętrzny identyfikator grupy i zachowuje nazwę głębszej kategorii. Pierwszy napotkany `N99` opisuje grupę; głębszy węzeł zawiera właściwą kategorię zaburzeń pozabiegowych.
3. Zachowuje 79 kodów ze sztyletem `†` i 371 z gwiazdką `*`. Usunięcie znaku przy tworzeniu klucza wyszukiwania nie zmienia kodu wybranego do dokumentacji.
4. Pomija zakresy, węzły opisowe i 565 liczbowych podziałów jako samodzielne rozpoznania. Pełne dane pozostają w oryginalnym XML. Nie konstruuje dodatkowych kodów pięcioznakowych.

Ostatecznie powstaje 2050 kategorii trzyznakowych i 9960 podkategorii.
Brakujące końcówki, rodzice, nieoczekiwane duplikaty albo zmiana sum
kontrolnych przerywają budowanie. Źródło nie zawiera flagi „billable” ani
jednoznacznej flagi wyboru; obecność bezkodowego tekstu pod kodem nie oznacza,
że jest on tylko nagłówkiem.

## Ograniczenia prezentacji i zastosowania

Współdzielona nazwa, np. „Ze śpiączką” pod `E10.0`, wymaga osobnego kontekstu
kategorii „Cukrzyca insulinozależna”. Nazwa źródłowa pozostaje niezmieniona.
232 grupy identycznych nazw występują w różnych kategoriach i obejmują
1320 kodów. Najdłuższa nazwa ma 180 znaków (`Y11`); po dodaniu kategorii
i separatora niektóre etykiety osiągnęłyby 275 znaków. Dlatego kategorii
nie dokleja się do nazwy przechowywanej jako rozpoznanie.

To cały zestaw kodów kategorii i podkategorii uzyskany z przypiętego źródła,
z zachowaniem opisanych dodatkowych podziałów w archiwum. Nie jest pełnym
indeksem alfabetycznym, zestawem wszystkich uwag i wyłączeń ani mechanizmem
klinicznego przypisywania diagnozy. Źródło ma pojedynczą angielską nazwę
kategorii `B96`; pozostaje ona zgodna z tym wydaniem zamiast otrzymać
nieudokumentowaną korektę. Kodów nieobecnych w tej wersji nie należy uznawać
za nieprawidłowe wyłącznie na podstawie braku wyniku wyszukiwania.

Test [`icd10-catalogue.test.mjs`](../../tests/unit/icd10-catalogue.test.mjs)
ładuje rzeczywisty artefakt i wywołuje produkcyjny generator na pełnym źródle.
Chroni pochodzenie, liczności, oznaczenia, kompletność rodziców, źródłowe
przykłady, długość nazw i odtwarzalność bez sieci; nie zastępuje akceptacji
klinicznej zakresu.
