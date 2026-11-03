# SiteFooter

Kompaktowe zakończenie obszaru treści. Marka, operator i odnośniki informacyjne są nad krótkim paskiem z niezmienionym zastrzeżeniem medycznym. Nawigacja do kalkulatorów pozostaje w menu aplikacji.

## Kiedy używać

- Jedna stopka na dokument, po głównym układzie strony. Występuje na stronie Start, stronach kalkulatorów i informacyjnych, również po zalogowaniu.
- `app.html`, Notatnik i Terminarz nie dodają osobnej stopki. Dokumenty osadzone w powłoce zachowują własną stopkę w szerokości ramki.
- Na desktopie warstwa chrome odsuwa stopkę od stałego panelu bocznego. Nie należy ponownie odejmować szerokości menu wewnątrz ramki lub na telefonie.

## Co dostarcza konsument

- `<footer class="site-footer">` z `.site-footer__inner` oraz `.site-footer__disclaimer-wrap`.
- `.site-footer__brand`: odnośnik `.site-footer__brand-link` do Startu z nazwą `.site-footer__brand-name` i opcjonalną ikoną 22 px `.site-footer__brand-icon`.
- `.site-footer__brand-meta`: wiersz `.site-footer__operator` z istniejącymi prawami autorskimi, nazwą spółki i odnośnikiem `.site-footer__vildaclinic`; poniżej `.site-footer__detail` z konsultantem albo KRS, zgodnie z daną stroną.
- `<nav class="site-footer__col" aria-label="Informacje">` z rzeczywistymi odnośnikami `.site-footer__link`. Standardowo: O aplikacji, Kontakt, Polityka prywatności, Regulamin. Strona subskrypcji zachowuje własny odnośnik Vilda PRO.
- Zastrzeżenie w `<p class="site-footer__disclaimer">`. Glif ⚕ dodaje CSS; treści medycznej nie należy skracać.

## Układ i dostępność

- Stopka jest kontenerem `site-footer` o rozmiarze zależnym od dostępnego miejsca. Na szerokim obszarze marka i odnośniki stoją obok siebie; odnośniki zawijają się naturalnie.
- Przy szerokości kontenera do 800 px odnośniki tworzą dwie kolumny. Do 650 px marka i nawigacja mają osobne wiersze.
- Nie ma ustalonej wysokości ani obcinania treści. Dłuższe dane operatora, większy tekst i wąskie okno zwiększają wysokość stopki.
- Dane operatora i zastrzeżenie mają co najmniej 11 px przy podstawowym rozmiarze 16 px, odnośniki 12 px. Pola aktywne na wąskim ekranie i urządzeniach dotykowych mają co najmniej 44 px wysokości.
- Odnośniki mają widoczny `:focus-visible`, a nav zachowuje nazwę dostępną. Pomocniczy tekst używa koloru `#526f77` zamiast wcześniejszego bardzo jasnego tekstu.
- Stopka nie jest przyklejona do okna. Rezerwa dla pływającej strzałki i dolnej nawigacji należy do integracji chrome, niezależnie od układu samego komponentu.

## Źródła

Reguły produkcyjne: `style.css`. Odpowiednik design systemu: `design-system/src/partials/G17.css`. `preview.html` pokazuje ten sam znacznik z kontekstem strony; tekst operatora jest publiczną informacją o aplikacji.
