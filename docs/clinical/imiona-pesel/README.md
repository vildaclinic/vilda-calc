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

Pliki zapisujemy tu pod oryginalnymi nazwami. Plik danych w aplikacji niesie ich SHA-256,
więc każdą wersję da się sprawdzić z plikiem pobranym z portalu.

## Odtworzenie pliku danych

```bash
node tests/scripts/imiona-pesel.mjs \
  --kobiety  "docs/clinical/imiona-pesel/<wykaz imion żeńskich>.csv" \
  --mezczyzni "docs/clinical/imiona-pesel/<wykaz imion męskich>.csv" \
  --stan-na RRRR-MM-DD --adres "<adres strony zbioru na dane.gov.pl>" --zapisz
```

Ta sama komenda bez `--zapisz` sprawdza, że `vilda_imiona_plec_dane.js` jest dokładnie wynikiem
generatora. Po każdej zmianie: `npm run podbij-wersje` i `npm test`.

Generator sumuje liczby po kluczu imienia liczonym przez produkcyjny silnik (`kluczImienia`:
pierwszy wyraz, małe litery, NFC) i pomija imiona noszone łącznie przez mniej niż 20 osób —
silnik i tak traktuje je jak nieznane.
