# Źródło przypiętego katalogu ICD-10 PL

`source.xml.gz` zawiera kompletny, niezmieniony plik CeZ
`ICD10_PL_en_covid_2021_03_31_2.xml`, stan danych **31.03.2021**, pobrany
18.11.2026 z [oficjalnego zasobu 55725](https://dane.gov.pl/pl/dataset/27/resource/55725).
Archiwum ma `mtime=0`; jego rozpakowana zawartość ma 12 713 248 bajtów i SHA256
`88a0c4ed4e4987d3cdc57f0a534a6c80506d757f197c39c1c22fa3a1ebdba099`.
To materiał do odtworzenia danych, nie zasób ładowany przez aplikację.

Oryginalne odpowiedzi API `dataset27.json` i `resource55725.json` utrwalają
wydawcę, datę i warunki ponownego użycia. Zbiór jawnie deklaruje **CC BY 4.0**
oraz obowiązek podania źródła i czasu informacji. Starsze pole opisu zawiera
„Other (Public Domain)”; stosujemy jawne warunki CC BY 4.0, bez twierdzenia,
że zbiór należy do domeny publicznej. `licensing-evidence.json` wskazuje
również pierwotne źródła praw do polskiego przekładu i polityki WHO.

Odtworzenie bez połączenia z siecią:

```bash
python3 tools/build-icd10-pl.py
python3 tools/build-icd10-pl.py --check
```

Generator weryfikuje SHA256 archiwum i XML, następnie zapisuje czytelny plik
`vilda_icd10_pl_data.js` oraz manifest wydania. Nie pobiera nowszych danych.
Pełny opis przetwarzania i ograniczeń: [ICD10_CATALOGUE.md](../../docs/clinical/ICD10_CATALOGUE.md).
