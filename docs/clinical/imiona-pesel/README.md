# Słownik imion z płcią — pliki źródłowe (P-PLEC-IMIE)

Ten katalog trzyma **oficjalne pliki źródłowe** słownika `vilda_imiona_plec_dane.js`, z którego
`vilda_plec_z_imienia.js` podpowiada płeć nowego pacjenta. Opis reguły, ograniczeń i wpływu
klinicznego: `docs/clinical/ALGORITHMS.md`, wpis P-PLEC-IMIE.

## Źródło

- Wydawca: Ministerstwo Cyfryzacji.
- Zbiór: „Lista imion występujących w rejestrze PESEL”, portal [dane.gov.pl](https://dane.gov.pl/).
- Potrzebne dwa zasoby **z tej samej daty stanu**: wykaz imion **żeńskich** i wykaz imion
  **męskich** osób żyjących, pole **„imię pierwsze”** (bez osób zmarłych). Pliki CSV, bez zmian.
- Populacja: osoby żyjące z numerem PESEL.

Pliki zapisujemy pod nazwami bez polskich znaków (git na macOS bywa kapryśny z diakrytykami
w nazwach plików); oryginalne nazwy i adresy są w tabeli niżej. Plik danych w aplikacji niesie
SHA-256 obu plików, więc każdą wersję da się sprawdzić z plikiem pobranym z portalu.

## Bieżąca wersja: stan na 2026-01-20

Zbiór 1667 ([strona](https://dane.gov.pl/pl/dataset/1667,lista-imion-wystepujacych-w-rejestrze-pesel-osoby-zyjace)),
licencja CC0 1.0, pobrane 2026-10-12. Pliki to konwersja CSV wykonana przez portal
(`csv_file_url` zasobu); sprawdzona wiersz w wiersz z oryginalnym XLSX tego samego zasobu
(28 787 i 46 203 wiersze z nagłówkiem — zgodne).

| Plik w repozytorium | Zasób | Oryginalna nazwa | SHA-256 |
|---|---|---|---|
| `pesel-2026-01-20-imiona-zenskie-imie-pierwsze.csv` | [1159670](https://dane.gov.pl/pl/dataset/1667/resource/1159670) — lista imion żeńskich, stan na 20.01.2026, imię pierwsze | `8_-_Wykaz_imion_żeńskich_osób_żyjących_wg_pola_imię_pierwsze_występujących_w_rejestrze_PESEL_bez_zgonów.csv` | `95dcfa121ef81d2102705e865744cfa433dcecd4a582157881f94cbde339f73a` |
| `pesel-2026-01-20-imiona-meskie-imie-pierwsze.csv` | [1159669](https://dane.gov.pl/pl/dataset/1667/resource/1159669) — lista imion męskich, stan na 20.01.2026, imię pierwsze | `8_-_Wykaz_imion_męskich_osób_żyjących_wg_pola_imię_pierwsze_występujących_w_rejestrze_PESEL_bez_zgonów.csv` | `6a6e30832a880d5006ac5b884828235599cd5180aa2b4bb92e69adf004ca7853` |

Postać pliku: nagłówek `IMIĘ_PIERWSZE,PŁEĆ,LICZBA_WYSTĄPIEŃ`, imiona wielkimi literami,
płeć słownie (`KOBIETA` / `MĘŻCZYZNA`).

## Odtworzenie pliku danych

```bash
node tests/scripts/imiona-pesel.mjs \
  --kobiety  docs/clinical/imiona-pesel/pesel-2026-01-20-imiona-zenskie-imie-pierwsze.csv \
  --mezczyzni docs/clinical/imiona-pesel/pesel-2026-01-20-imiona-meskie-imie-pierwsze.csv \
  --stan-na 2026-01-20 \
  --adres "https://dane.gov.pl/pl/dataset/1667,lista-imion-wystepujacych-w-rejestrze-pesel-osoby-zyjace" \
  --warunki "Licencja CC0 1.0 (według strony zbioru na dane.gov.pl)." --zapisz
```

Test `tests/unit/plec-z-imienia.test.mjs` odtwarza plik danych z tych plików (argumenty bierze
z metadanych pliku danych) i porównuje bajt w bajt — każda ręczna zmiana słownika albo plików
źródłowych bez ponownego wygenerowania kończy się czerwonym CI. Nowy stan rejestru: nowe pliki
obok starych (albo zamiast nich), generator, `npm run podbij-wersje`, przegląd imion granicznych
(wpis P-PLEC-IMIE w rejestrze algorytmów).

Ta sama komenda bez `--zapisz` sprawdza, że `vilda_imiona_plec_dane.js` jest dokładnie wynikiem
generatora. Po każdej zmianie: `npm run podbij-wersje` i `npm test`.

Generator sumuje liczby po kluczu imienia liczonym przez produkcyjny silnik (`kluczImienia`:
pierwszy wyraz, małe litery, NFC) i pomija imiona noszone łącznie przez mniej niż 20 osób —
silnik i tak traktuje je jak nieznane.
